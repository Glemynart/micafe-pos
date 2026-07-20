/**
 * rollback-mt-u1-fundacional.ts — ROLLBACK de MT-U1 (empresa fundacional + membresías)
 *
 * Revierte exactamente lo que escribió `migrate-mt-u1-fundacional.ts` (Fase A):
 * borra todas las `membresias/{empresaId}_{uid}` de la empresa fundacional y,
 * por último, el propio documento `empresas/{id}`. Esta pieza estaba prevista
 * desde el diseño de MT-U1 (§4) pero nunca se creó — es deuda heredada que
 * MT-U3 Capa 0 cierra formalmente antes de operar sobre datos operativos.
 *
 * ALCANCE — qué NO revierte este script (a propósito) ─────────────────────────
 * Este script **no toca ninguna colección operativa**. El backfill operativo
 * (Fase B de MT-U1, ejecutado por MT-U3) tiene su propio reverso dedicado en
 * `rollback-mt-u3-operativo.ts`. Si alguna vez hace falta deshacer TODO el
 * trabajo de datos de MT-U1+MT-U3, el orden es estricto:
 *
 *   1º rollback-mt-u3-operativo.ts   (quita empresaId de las 25 colecciones)
 *   2º ESTE script                   (borra membresias + empresas/{id})
 *
 * en ese orden, porque el paso 1 necesita resolver la empresa fundacional
 * (`esFundacional==true`) para saber qué revertir — si el paso 2 corriera
 * primero, el paso 1 ya no tendría cómo identificar el tenant.
 *
 * ADVERTENCIA CRÍTICA — precondición de Custom Claims ─────────────────────────
 * Desde MT-U2, el id de la empresa fundacional vive acuñado en el custom claim
 * `{empresaId, rol}` de **todos** los usuarios (`scripts/set-claims-mt-u2.ts`).
 * Borrar `empresas/{id}` mientras esos claims siguen vigentes dejaría al
 * `SaaSContext` de cada sesión activa resolviendo un documento inexistente
 * (`obtenerEmpresaPorId` devolvería `null`) — una regresión de producción, no
 * un rollback limpio. Por eso este script:
 *
 *   • Verifica en Firebase Auth (Admin SDK, `listUsers`) si algún usuario tiene
 *     `customClaims.empresaId` igual al id de la empresa fundacional.
 *   • Si encuentra al menos uno, **ABORTA sin escribir nada**, incluso con
 *     `--execute`. No existe flag para forzarlo: revertir los claims (fuera
 *     de alcance de este script — es el reverso de MT-U2, no de MT-U1) es una
 *     precondición dura, no una advertencia ignorable.
 *
 * En el estado real de este proyecto (claims ya acuñados en producción para
 * MT-U2, según registro de la unidad), este script **abortará siempre** hasta
 * que exista y se ejecute un reverso de claims. Esto es intencional: refleja
 * que revertir MT-U1 hoy, con MT-U2 ya mergeado, no es una operación aislada.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute.
 *   • Idempotente: si la empresa fundacional ya no existe, reporta "nada que
 *     revertir" y termina en éxito sin tocar nada.
 *   • Orden de borrado: primero todas las `membresias`, al final `empresas/{id}`
 *     (nunca al revés — evita dejar membresías huérfanas apuntando a un id que
 *     ya no resuelve).
 *   • Solo toca: `membresias/*` (delete) y `empresas/{id}` (delete). Nada más.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/rollback-mt-u1-fundacional.ts
 *   Dry-run (explícito):    npx tsx scripts/rollback-mt-u1-fundacional.ts --dry-run
 *   Ejecución:              npx tsx scripts/rollback-mt-u1-fundacional.ts --execute
 *
 * Ver MT-U1-empresas-membresias-diseno.md §4 y MT-U3-helper-tenant-diseno.md §6.6.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'
import { MEMBRESIAS_COLLECTION } from '../lib/membresias-service'

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')

// ─── Service account (mismo patrón que scripts/migrate-mt-u1-fundacional.ts) ──
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
const auth = getAuth()

const BATCH_LIMIT = 500

interface Reporte {
  modo: 'DRY-RUN' | 'EXECUTE'
  empresa: { encontrada: boolean; id: string | null; nombre: string | null }
  usuariosConClaimVigente: string[]
  membresias: { encontradas: number; borradas: string[] }
  empresaBorrada: boolean
  errores: string[]
  resultado: 'SUCCESS' | 'FAILED' | 'NADA_QUE_REVERTIR'
}

async function resolverEmpresaFundacional(): Promise<{ id: string; nombre: string } | null> {
  const snap = await db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, nombre: (doc.data().nombre as string) ?? '(sin nombre)' }
}

/**
 * Recorre todos los usuarios de Firebase Auth y devuelve los uid cuyo
 * customClaims.empresaId coincide con el id dado. Usa paginación nativa de
 * `listUsers` (máx. 1000 por página) — el volumen esperado (POS de un solo
 * negocio) es órdenes de magnitud menor.
 */
async function usuariosConClaimHaciaEmpresa(empresaId: string): Promise<string[]> {
  const coincidencias: string[] = []
  let pageToken: string | undefined

  do {
    const pagina = await auth.listUsers(1000, pageToken)
    for (const user of pagina.users) {
      const claims = user.customClaims as { empresaId?: string } | undefined
      if (claims?.empresaId === empresaId) coincidencias.push(user.uid)
    }
    pageToken = pagina.pageToken
  } while (pageToken)

  return coincidencias
}

function imprimirReporte(r: Reporte) {
  console.log('='.repeat(78))
  console.log('ROLLBACK MT-U1 — Empresa fundacional + Membresías')
  console.log(`Modo: ${r.modo}`)
  console.log('='.repeat(78))
  console.log('')

  if (!r.empresa.encontrada) {
    console.log('✅ No existe ninguna empresa con esFundacional==true. Nada que revertir.')
    console.log('='.repeat(78))
    return
  }

  console.log(`Empresa fundacional: id=${r.empresa.id} nombre="${r.empresa.nombre}"`)
  console.log('')

  if (r.usuariosConClaimVigente.length > 0) {
    console.log(`🛑 ABORTADO — ${r.usuariosConClaimVigente.length} usuario(s) tienen el custom claim`)
    console.log(`   empresaId="${r.empresa.id}" vigente en Firebase Auth:`)
    for (const uid of r.usuariosConClaimVigente) console.log(`     - uid=${uid}`)
    console.log('')
    console.log('   Borrar la empresa fundacional mientras estos claims siguen vigentes rompería')
    console.log('   el SaaSContext de esas sesiones (obtenerEmpresaPorId devolvería null).')
    console.log('   Revertir primero los claims (reverso de MT-U2, fuera de alcance de este script)')
    console.log('   antes de volver a ejecutar este rollback.')
    console.log('='.repeat(78))
    return
  }

  console.log(`Membresías encontradas: ${r.membresias.encontradas}`)
  for (const uid of r.membresias.borradas) console.log(`  - ${r.modo === 'EXECUTE' ? 'borrada' : 'a borrar'}: ${uid}`)
  console.log('')
  console.log(`Empresa: ${r.empresaBorrada ? 'borrada' : r.modo === 'EXECUTE' ? 'no se llegó a borrar' : 'a borrar'}`)
  console.log('')
  console.log(`Errores: ${r.errores.length === 0 ? 'ninguno' : ''}`)
  for (const e of r.errores) console.log(`  ⚠ ${e}`)
  console.log('')
  console.log(`Resultado: ${r.resultado}`)
  console.log('='.repeat(78))
}

async function main() {
  const reporte: Reporte = {
    modo: EXECUTE ? 'EXECUTE' : 'DRY-RUN',
    empresa: { encontrada: false, id: null, nombre: null },
    usuariosConClaimVigente: [],
    membresias: { encontradas: 0, borradas: [] },
    empresaBorrada: false,
    errores: [],
    resultado: 'SUCCESS',
  }

  const empresa = await resolverEmpresaFundacional()
  if (!empresa) {
    reporte.resultado = 'NADA_QUE_REVERTIR'
    imprimirReporte(reporte)
    process.exit(0)
  }
  reporte.empresa = { encontrada: true, id: empresa.id, nombre: empresa.nombre }

  // ── Precondición dura: ningún claim vigente puede apuntar a esta empresa ──
  const usuariosConClaim = await usuariosConClaimHaciaEmpresa(empresa.id)
  if (usuariosConClaim.length > 0) {
    reporte.usuariosConClaimVigente = usuariosConClaim
    reporte.resultado = 'FAILED'
    imprimirReporte(reporte)
    process.exit(1)
  }

  // ── Membresías de la empresa fundacional ──────────────────────────────────
  const membresiasSnap = await db.collection(MEMBRESIAS_COLLECTION).where('empresaId', '==', empresa.id).get()
  reporte.membresias.encontradas = membresiasSnap.size
  reporte.membresias.borradas = membresiasSnap.docs.map((d) => d.id)

  if (EXECUTE) {
    let batch = db.batch()
    let opsEnBatch = 0
    for (const doc of membresiasSnap.docs) {
      batch.delete(doc.ref)
      opsEnBatch++
      if (opsEnBatch >= BATCH_LIMIT) {
        await batch.commit()
        batch = db.batch()
        opsEnBatch = 0
      }
    }
    if (opsEnBatch > 0) await batch.commit()

    // ── Empresa fundacional, al final (nunca antes que sus membresías) ──────
    await db.collection(EMPRESAS_COLLECTION).doc(empresa.id).delete()
    reporte.empresaBorrada = true
  }

  imprimirReporte(reporte)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
