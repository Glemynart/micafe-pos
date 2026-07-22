/**
 * verificar-activacion-mt-u3.ts — MT-U3 Capa 5: verificación de los gates de
 * activación (pre y post).
 *
 * SOLO LECTURA. A diferencia de `migrate-mt-u3-operativo.ts`, este script NO
 * tiene modo de escritura bajo ninguna circunstancia — no existe flag
 * `--execute`. Complementa (no reemplaza) el dry-run detallado del backfill:
 * este script es el gate rápido de "sí/no" antes y después de activar, el
 * backfill sigue siendo la fuente del reporte detallado por documento.
 *
 * Automatiza dos verificaciones distintas de MT-U3-helper-tenant-diseno.md §9
 * (Capa 5):
 *
 * MODO PRE (por defecto) — gates antes de `--execute` + despliegue:
 *   (a) Existe la empresa fundacional (`esFundacional==true`).
 *   (b) Cero ANOMALÍAS de `empresaId` en las 25 colecciones oficiales: un doc
 *       cuyo campo existe pero no es el fundacional (ni `"default"` para
 *       `movimientos_inventario`) bloquearía el backfill igual que a
 *       `migrate-mt-u3-operativo.ts` — se detecta aquí vía `count()` con
 *       `not-in`, sin paginar toda la colección (más barato que el dry-run
 *       completo, que si necesita paginar porque además simula escrituras).
 *   (c) Los índices compuestos de `firestore.indexes.json` están `Enabled`:
 *       se prueba cada uno ejecutando una query real con el mismo orden de
 *       campos (vía `orderBy` encadenado, sin necesidad de valores de
 *       ejemplo) y `limit(1)`. Si Firestore responde con éxito, el índice
 *       existe y está listo; si responde `FAILED_PRECONDITION`, no lo está
 *       (aún construyéndose o no desplegado). Se lee el índice directamente
 *       de `firestore.indexes.json` — no hay una lista separada que pueda
 *       desincronizarse del archivo real.
 *
 * MODO POST (`--post`) — gate después de `--execute` + despliegue:
 *   Por cada una de las 25 colecciones oficiales: `count(total)` debe ser
 *   igual a `count(where empresaId == fundacional)`. Si son iguales, cero
 *   documentos quedaron sin `empresaId` o con un valor incorrecto (incluye
 *   `movimientos_inventario`: tras el backfill ya no debe quedar ningún
 *   `"default"`). Automatiza el criterio de "Aceptación" de §9 Capa 5:
 *   `docs sin empresaId == 0` por colección. La verificación funcional del
 *   POS (venta, turno, KDS, salón, reserva pública) sigue siendo manual — no
 *   es automatizable desde un script de datos.
 *
 * Uso:
 *   npx tsx scripts/verificar-activacion-mt-u3.ts          # modo pre
 *   npx tsx scripts/verificar-activacion-mt-u3.ts --post   # modo post
 *
 * Exit code 0 = gate satisfecho. Exit code 1 = bloqueado, ver detalle.
 *
 * Ver MT-U3-helper-tenant-diseno.md §6 (backfill), §8 (índices), §9 (Capa 5),
 * §10 (R1, R3, R6, R10). Ver también MT-U3-CAPA5-runbook-activacion.md.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'
import { COLECCIONES_OFICIALES, verificarColeccionesContraFirestore } from './mt-u3-colecciones-oficiales'

const argv = process.argv.slice(2)
const MODO_POST = argv.includes('--post')

// ─── Service account (mismo patrón que migrate-mt-u3-operativo.ts) ─────────
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

async function resolverEmpresaFundacional(): Promise<{ id: string; nombre: string } | null> {
  const snap = await db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, nombre: (doc.data().nombre as string) ?? '(sin nombre)' }
}

// ─── MODO PRE: (b) anomalías ────────────────────────────────────────────────

async function contarAnomalias(nombreColeccion: string, empresaId: string, esLedger: boolean): Promise<number> {
  // count(where empresaId NOT-IN [valores válidos]) — Firestore excluye de
  // los filtros de desigualdad los documentos donde el campo está AUSENTE,
  // así que esto cuenta exactamente "existe pero tiene un valor inesperado",
  // igual que la guarda de anomalías de migrate-mt-u3-operativo.ts, sin
  // necesidad de paginar la colección completa.
  const valoresValidos = esLedger ? [empresaId, 'default'] : [empresaId]
  const snap = await db.collection(nombreColeccion).where('empresaId', 'not-in', valoresValidos).count().get()
  return snap.data().count
}

// ─── MODO PRE: (c) índices ──────────────────────────────────────────────────

interface IndiceDefinicion {
  collectionGroup: string
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[]
}

function cargarIndicesDefinidos(): IndiceDefinicion[] {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8')
  const parsed = JSON.parse(raw) as { indexes: IndiceDefinicion[] }
  return parsed.indexes
}

async function probarIndice(idx: IndiceDefinicion): Promise<'enabled' | 'no_listo' | 'error'> {
  try {
    let q: FirebaseFirestore.Query = db.collection(idx.collectionGroup)
    for (const f of idx.fields) {
      q = q.orderBy(f.fieldPath, f.order === 'DESCENDING' ? 'desc' : 'asc')
    }
    await q.limit(1).get()
    return 'enabled'
  } catch (err: any) {
    if (err?.code === 9 || /FAILED_PRECONDITION/i.test(err?.message ?? '')) {
      return 'no_listo'
    }
    console.error(`   ❌ Error inesperado probando índice de "${idx.collectionGroup}": ${err?.message ?? err}`)
    return 'error'
  }
}

// ─── MODO POST: docs sin empresaId ==0 ──────────────────────────────────────

async function contarHuerfanos(nombreColeccion: string, empresaId: string): Promise<{ total: number; conEmpresaId: number }> {
  const [totalSnap, conEmpresaIdSnap] = await Promise.all([
    db.collection(nombreColeccion).count().get(),
    db.collection(nombreColeccion).where('empresaId', '==', empresaId).count().get(),
  ])
  return { total: totalSnap.data().count, conEmpresaId: conEmpresaIdSnap.data().count }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function modoPre(empresa: { id: string; nombre: string }): Promise<boolean> {
  let ok = true

  console.log('── (b) Anomalías de empresaId (25 colecciones oficiales) ──')
  for (const config of COLECCIONES_OFICIALES) {
    const esLedger = config.guardaEspecial === 'movimientos_inventario_default'
    const anomalias = await contarAnomalias(config.nombre, empresa.id, esLedger)
    if (anomalias > 0) {
      ok = false
      console.log(`   ❌ ${config.nombre.padEnd(28)} anomalías=${anomalias} — requiere revisión humana antes de --execute`)
    } else {
      console.log(`   ✅ ${config.nombre.padEnd(28)} anomalías=0`)
    }
  }

  console.log('')
  console.log('── (c) Índices compuestos (firestore.indexes.json) ──')
  const indices = cargarIndicesDefinidos()
  for (const idx of indices) {
    const campos = idx.fields.map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'desc' : 'asc'}`).join(', ')
    const estado = await probarIndice(idx)
    if (estado === 'enabled') {
      console.log(`   ✅ ${idx.collectionGroup.padEnd(28)} (${campos})`)
    } else {
      ok = false
      const etiqueta = estado === 'no_listo' ? 'NO LISTO (building o no desplegado)' : 'ERROR AL VERIFICAR'
      console.log(`   ❌ ${idx.collectionGroup.padEnd(28)} (${campos}) — ${etiqueta}`)
    }
  }

  return ok
}

async function modoPost(empresa: { id: string; nombre: string }): Promise<boolean> {
  let ok = true

  console.log('── docs sin empresaId == 0 (25 colecciones oficiales) ──')
  for (const config of COLECCIONES_OFICIALES) {
    const { total, conEmpresaId } = await contarHuerfanos(config.nombre, empresa.id)
    const huerfanos = total - conEmpresaId
    if (huerfanos !== 0) {
      ok = false
      console.log(`   ❌ ${config.nombre.padEnd(28)} total=${String(total).padStart(6)}  conEmpresaId=${String(conEmpresaId).padStart(6)}  huérfanos=${huerfanos}`)
    } else {
      console.log(`   ✅ ${config.nombre.padEnd(28)} total=${String(total).padStart(6)}  conEmpresaId=${String(conEmpresaId).padStart(6)}`)
    }
  }

  console.log('')
  console.log('ℹ️  Este chequeo NO reemplaza la regresión manual del POS exigida por')
  console.log('   §9 Capa 5 (venta, turno, KDS, salón, reserva pública nueva).')

  return ok
}

async function main() {
  console.log('='.repeat(78))
  console.log(`MT-U3 — Verificación de activación — modo ${MODO_POST ? 'POST' : 'PRE'} (Capa 5)`)
  console.log('SOLO LECTURA — este script nunca escribe en Firestore.')
  console.log('='.repeat(78))
  console.log('')

  const empresa = await resolverEmpresaFundacional()
  if (!empresa) {
    console.error('❌ No existe ninguna empresa con esFundacional==true. Bloqueado.')
    process.exit(1)
  }
  console.log(`Empresa fundacional: id=${empresa.id} nombre="${empresa.nombre}"`)
  console.log('')

  const verificacionColecciones = await verificarColeccionesContraFirestore(db)
  if (verificacionColecciones.desconocidas.length > 0) {
    console.log('⚠️  Colecciones en Firestore fuera de la lista oficial/globales conocidas:')
    for (const n of verificacionColecciones.desconocidas) console.log(`     - ${n}`)
    console.log('')
  }

  const ok = MODO_POST ? await modoPost(empresa) : await modoPre(empresa)

  console.log('')
  console.log('='.repeat(78))
  if (ok) {
    console.log(MODO_POST ? '✅ Gate POST satisfecho.' : '✅ Gate PRE satisfecho — listo para --execute + despliegue.')
  } else {
    console.log('❌ Gate NO satisfecho — ver detalle arriba. No continuar con la activación.')
  }
  console.log('='.repeat(78))

  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
