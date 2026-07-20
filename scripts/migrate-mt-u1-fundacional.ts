/**
 * migrate-mt-u1-fundacional.ts — MT-U1: Empresa y Membresías fundacionales
 *
 * Crea la Empresa fundacional (D-U1-1: id opaco, sin connotación de
 * temporalidad — nunca `empresa-default`) y una Membresia pura (D-U1-2: sin
 * rol/permisos) por cada usuario existente en `usuarios`. Es un script
 * histórico: tras MT-U5B la autoridad pertenece exclusivamente a membresías.
 *
 * NO toca ninguna de las 25 colecciones operativas del POS. Ese backfill
 * pertenece a MT-U3 (paso 0 de su propio despliegue, D-U1-3).
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute.
 *   • Idempotente: la Empresa fundacional se crea una sola vez (se localiza
 *     por `esFundacional == true`, guard de existencia); cada Membresia usa
 *     id determinístico `{empresaId}_{uid}` con guard de existencia —
 *     reescribir un doc ya creado es un no-op (nunca se pisa `creadaEn`).
 *   • Reanudable: un fallo parcial no duplica trabajo en el siguiente run.
 *   • Aborta sin escribir nada si no hay ningún admin activo en `usuarios`
 *     (no se puede determinar `ownerUid`).
 *   • Solo toca en escritura: empresas/* (create) y membresias/* (create).
 *     Solo lee (sin escribir) `usuarios` y `configuracion/general`.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/migrate-mt-u1-fundacional.ts
 *   Dry-run (explícito):    npx tsx scripts/migrate-mt-u1-fundacional.ts --dry-run
 *   Ejecución:              npx tsx scripts/migrate-mt-u1-fundacional.ts --execute
 *
 * Ver MT-U1-empresas-membresias-diseno.md §5 y ADR-SAAS-001/002/004.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { type Empresa, EMPRESAS_COLLECTION } from '../lib/empresas-service'
import { type MembresiaLegacy, MEMBRESIAS_COLLECTION, idMembresia } from '../lib/membresias-service'

const argv = process.argv.slice(2)
// --dry-run gana si se combinan ambos flags por error: seguro por defecto.
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')

// ─── Service account (mismo patrón que scripts/migrate-fase9d.ts) ──────────
function loadServiceAccount(): any {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try { return JSON.parse(inline) } catch { /* file fallback */ }
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './service-account.local.json',
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  console.error('❌ No se encontró el service account (env inline o archivo).')
  process.exit(1)
}

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

const PAIS_FISCAL_DEFAULT = 'CO'
const BATCH_LIMIT = 500

// El SDK Admin tiene su propia clase Timestamp — distinta (aunque compatible
// en forma) de la que tipan Empresa/Membresia en Capa 1 para el SDK cliente.
// Se reutiliza el resto del contrato vía Omit para no duplicar los campos.
type EmpresaDoc = Omit<Empresa, 'creadaEn'> & { creadaEn: Timestamp }
type MembresiaDoc = Omit<MembresiaLegacy, 'creadaEn'> & { creadaEn: Timestamp }

interface UsuarioMin {
  uid: string
  rol?: string
  activo?: boolean
  creadoEn?: Timestamp
}

interface Reporte {
  modo: 'DRY-RUN' | 'EXECUTE'
  empresa: { accion: 'creada' | 'existente'; id: string; nombre: string; ownerUid: string }
  adminsCandidatos: Array<{ uid: string; creadoEn: string | null }>
  membresias: { creadas: string[]; existentes: string[] }
  errores: string[]
  resultado: 'SUCCESS' | 'FAILED'
}

function timestampToIso(ts?: Timestamp): string | null {
  return ts ? ts.toDate().toISOString() : null
}

async function obtenerUsuarios(): Promise<UsuarioMin[]> {
  const snap = await db.collection('usuarios').get()
  return snap.docs.map((d) => {
    const data = d.data()
    return { uid: d.id, rol: data.rol, activo: data.activo, creadoEn: data.creadoEn }
  })
}

function elegirOwner(usuarios: UsuarioMin[]): { ownerUid: string | null; candidatos: UsuarioMin[] } {
  const candidatos = usuarios
    .filter((u) => u.rol === 'admin' && u.activo === true)
    .sort((a, b) => (a.creadoEn?.toMillis() ?? 0) - (b.creadoEn?.toMillis() ?? 0))
  return { ownerUid: candidatos[0]?.uid ?? null, candidatos }
}

async function obtenerNombreEmpresa(): Promise<string> {
  const snap = await db.collection('configuracion').doc('general').get()
  const nombre = snap.exists ? (snap.data()?.nombre_tienda as string | undefined) : undefined
  return nombre?.trim() || 'Mi Negocio'
}

/**
 * Localiza la Empresa fundacional o la crea si no existe, dentro de una
 * transacción Firestore. La query de existencia se lee vía `tx.get()`: si dos
 * ejecuciones concurrentes la ven vacía a la vez, Firestore detecta el
 * conflicto en el commit y reintenta automáticamente a la perdedora, que en
 * el reintento ya encuentra la empresa creada por la ganadora. Evita crear
 * dos empresas fundacionales bajo `--execute` concurrente.
 */
async function resolverEmpresaFundacional(
  ownerUid: string
): Promise<{ empresa: EmpresaDoc; accion: 'creada' | 'existente' }> {
  return db.runTransaction(async (tx) => {
    const query = db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).limit(1)
    const snap = await tx.get(query)

    if (!snap.empty) {
      const doc = snap.docs[0]
      const empresa = { id: doc.id, ...(doc.data() as Omit<EmpresaDoc, 'id'>) } as EmpresaDoc
      return { empresa, accion: 'existente' as const }
    }

    const nombre = await obtenerNombreEmpresa()
    const ref = db.collection(EMPRESAS_COLLECTION).doc()
    const nuevaEmpresa: EmpresaDoc = {
      id: ref.id,
      nombre,
      estado: 'activa',
      paisFiscal: PAIS_FISCAL_DEFAULT,
      ownerUid,
      esFundacional: true,
      creadaEn: Timestamp.now(),
    }

    if (EXECUTE) {
      const { id: _id, ...datos } = nuevaEmpresa
      tx.set(ref, datos)
    }

    return { empresa: nuevaEmpresa, accion: 'creada' as const }
  })
}

function imprimirReporte(r: Reporte) {
  console.log('='.repeat(70))
  console.log('MT-U1 — Backfill fundacional (Empresa + Membresías)')
  console.log(`Modo: ${r.modo}`)
  console.log('='.repeat(70))
  console.log('')
  console.log(`Empresa ${r.empresa.accion}:`)
  console.log(`  id=${r.empresa.id || '(no determinado)'} nombre="${r.empresa.nombre}" ownerUid=${r.empresa.ownerUid}`)
  if (r.empresa.accion === 'creada' && r.modo === 'DRY-RUN') {
    console.log('  (id de ejemplo: Firestore genera un id nuevo en cada llamada; el')
    console.log('   id definitivo se fija solo al ejecutar con --execute)')
  }
  console.log('')
  console.log(`Admins candidatos detectados: ${r.adminsCandidatos.length}`)
  for (const c of r.adminsCandidatos) {
    console.log(`  - uid=${c.uid} creadoEn=${c.creadoEn ?? '(sin fecha)'}`)
  }
  console.log('')
  console.log(`Membresías creadas: ${r.membresias.creadas.length}`)
  for (const uid of r.membresias.creadas) console.log(`  - uid=${uid}`)
  console.log(`Membresías existentes (sin cambios): ${r.membresias.existentes.length}`)
  for (const uid of r.membresias.existentes) console.log(`  - uid=${uid}`)
  console.log('')
  console.log(`Errores: ${r.errores.length === 0 ? 'ninguno' : ''}`)
  for (const e of r.errores) console.log(`  ⚠ ${e}`)
  console.log('')
  console.log(`Resultado: ${r.resultado}`)
  console.log('='.repeat(70))
}

async function main() {
  const reporte: Reporte = {
    modo: EXECUTE ? 'EXECUTE' : 'DRY-RUN',
    empresa: { accion: 'creada', id: '', nombre: '', ownerUid: '' },
    adminsCandidatos: [],
    membresias: { creadas: [], existentes: [] },
    errores: [],
    resultado: 'SUCCESS',
  }

  const usuarios = await obtenerUsuarios()
  const { ownerUid, candidatos } = elegirOwner(usuarios)
  reporte.adminsCandidatos = candidatos.map((u) => ({ uid: u.uid, creadoEn: timestampToIso(u.creadoEn) }))

  if (!ownerUid) {
    reporte.errores.push(
      'No existe ningún usuario con rol="admin" y activo=true en `usuarios`. Se aborta sin escribir nada.'
    )
    reporte.resultado = 'FAILED'
    imprimirReporte(reporte)
    process.exit(1)
  }

  if (candidatos.length > 1) {
    reporte.errores.push(
      `Se encontraron ${candidatos.length} admins activos; se eligió el más antiguo por creadoEn ` +
      `(${ownerUid}). Revisar si es el esperado antes de --execute.`
    )
  }

  const { empresa, accion: accionEmpresa } = await resolverEmpresaFundacional(ownerUid)
  reporte.empresa = { accion: accionEmpresa, id: empresa.id, nombre: empresa.nombre, ownerUid: empresa.ownerUid }

  const empresaId = empresa.id
  let batch = db.batch()
  let opsEnBatch = 0

  for (const usuario of usuarios) {
    const membresiaId = idMembresia(empresaId, usuario.uid)
    const ref = db.collection(MEMBRESIAS_COLLECTION).doc(membresiaId)
    const existente = await ref.get()

    if (existente.exists) {
      reporte.membresias.existentes.push(usuario.uid)
      continue
    }

    reporte.membresias.creadas.push(usuario.uid)

    if (EXECUTE) {
      const nuevaMembresia: MembresiaDoc = {
        empresaId,
        uid: usuario.uid,
        activo: usuario.activo === true,
        creadaEn: Timestamp.now(),
      }
      batch.set(ref, nuevaMembresia)
      opsEnBatch++
      if (opsEnBatch >= BATCH_LIMIT) {
        await batch.commit()
        batch = db.batch()
        opsEnBatch = 0
      }
    }
  }

  if (EXECUTE && opsEnBatch > 0) {
    await batch.commit()
  }

  imprimirReporte(reporte)
  process.exit(reporte.resultado === 'FAILED' ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
