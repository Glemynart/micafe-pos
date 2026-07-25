/**
 * backfill-empresa-fundacional-contrato.ts — completa el contrato actual del
 * documento de empresa fundacional.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  BACKFILL HISTÓRICO — YA EJECUTADO. NO ES UNA MIGRACIÓN PENDIENTE.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   Ejecutado en producción (proyecto `micafe-pos`) el **2026-07-25**.
 *   Documento afectado: `empresas/1ae0rD9H8t3ZFSBKrrHR` (el único con
 *   `esFundacional == true`). Campos escritos:
 *
 *       actualizadaEn = 2026-07-17T03:53:14.281Z  (= creadaEn)
 *       revision      = 1
 *       schemaVersion = 1
 *
 *   OBJETIVO: reparar un dato histórico, de una sola vez. La empresa
 *   fundacional se creó bajo un contrato anterior y le faltaban tres campos
 *   que el contrato actual exige (ver CONTEXTO). Esto NO es un paso del
 *   aprovisionamiento de empresas ni parte del flujo operativo normal: toda
 *   empresa creada por el bootstrap canónico de ADR-SAAS-007 nace ya con esos
 *   campos, así que este script no tiene ningún papel en altas futuras.
 *
 *   NO ES el backfill de `empresaId` de MT-U3 (ese es
 *   `scripts/migrate-mt-u3-operativo.ts`, independiente y con su propio
 *   estado).
 *
 *   SE CONSERVA por trazabilidad de lo que se escribió en producción y como
 *   red de seguridad idempotente: reejecutarlo es un no-op verificado —
 *   detecta que los tres campos ya existen, los respeta y no escribe nada.
 *   Si algún día apareciera otra empresa con el mismo hueco (p. ej. restaurada
 *   desde un backup antiguo), sirve para repararla sin reescribir nada más.
 *
 *   Deuda relacionada, distinta y NO resuelta por este script:
 *   `TECH-DEBT-CONFIG-001-singleton-legacy-sin-tenant.md`.
 *
 * CONTEXTO
 * --------
 * La empresa fundacional NO fue creada por el bootstrap canónico de
 * ADR-SAAS-007, sino por `scripts/migrate-mt-u1-fundacional.ts`, que ancló los
 * datos preexistentes del POS mono-tenant. Ese script escribió exactamente los
 * seis campos del contrato `Empresa` de MT-U1 (`nombre`, `estado`,
 * `paisFiscal`, `ownerUid`, `esFundacional`, `creadaEn`) — el único vigente en
 * ese momento.
 *
 * `actualizadaEn`, `revision` y `schemaVersion` llegaron después, con el ciclo
 * de vida empresarial (ADR-SAAS-009) y el bootstrap (ADR-SAAS-007). El
 * documento fundacional quedó por tanto conforme al contrato de su época pero
 * incompleto frente al actual. Consecuencias observadas en producción:
 *
 *   1. `listarRecursosPlataforma` ordena por `actualizadaEn`; en Firestore un
 *      `orderBy` es un filtro de existencia implícito, de modo que el
 *      documento queda EXCLUIDO del listado y el Backoffice muestra la
 *      pantalla de Empresas vacía.
 *   2. `transicionarEmpresa` valida `revision !== expectedRevision` contra el
 *      contrato `EmpresaLifecycle { estado, revision }`. Con `revision`
 *      ausente, toda transición de ciclo de vida (suspender, reactivar,
 *      archivar) fallaría con CONFLICTO_REVISION. Defecto latente.
 *
 * ALCANCE
 * -------
 * Un único documento: el que tiene `esFundacional == true`. No crea empresas,
 * no toca ninguna otra colección y no forma parte del backfill de `empresaId`
 * de MT-U3 (que es independiente y sigue pendiente).
 *
 * IDEMPOTENCIA
 * ------------
 * Solo escribe los campos AUSENTES. Un campo ya presente nunca se sobrescribe,
 * aunque su valor difiera del que este script propondría. Reejecutar es un
 * no-op. Se usa `update()` deliberadamente y nunca `set(merge:true)`: si el
 * documento desapareciera entre la lectura y la escritura, `update()` falla con
 * NOT_FOUND en vez de recrear un documento mutilado.
 *
 * VALORES
 * -------
 *   actualizadaEn = creadaEn  (NO serverTimestamp: el documento no se ha
 *                              modificado desde su creación; un timestamp
 *                              actual mentiría sobre su historia y lo situaría
 *                              artificialmente primero en un listado por
 *                              recencia)
 *   revision      = 1         (nunca ha sufrido una transición de lifecycle)
 *   schemaVersion = 1
 *
 * USO
 * ---
 *   npx tsx scripts/backfill-empresa-fundacional-contrato.ts             # DRY-RUN
 *   npx tsx scripts/backfill-empresa-fundacional-contrato.ts --execute   # escribe
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'

const argv = process.argv.slice(2)
// --dry-run gana si se combinan ambos flags por error: seguro por defecto.
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')

// ─── Service account (mismo patrón que el resto de scripts de migración) ───
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

async function main() {
  console.log('='.repeat(78))
  console.log('Backfill de contrato — empresa fundacional')
  console.log('⚠️  BACKFILL HISTÓRICO — ya ejecutado en producción el 2026-07-25.')
  console.log('   No es una migración pendiente ni parte del flujo operativo normal.')
  console.log('   Sobre datos ya reparados es un no-op: no escribe nada.')
  console.log(`Modo: ${EXECUTE ? 'EXECUTE (escribe)' : 'DRY-RUN (no escribe)'}`)
  console.log('='.repeat(78))
  console.log('')

  const snap = await db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).get()
  if (snap.empty) {
    console.error('❌ No existe ninguna empresa con esFundacional==true. Se aborta sin escribir nada.')
    process.exit(1)
  }
  if (snap.size > 1) {
    // Invariante de MT-U1: existe exactamente una empresa fundacional. Más de
    // una significa un defecto de datos que debe resolverse a mano; este script
    // no elige por el operador.
    console.error(`❌ Hay ${snap.size} empresas con esFundacional==true; se esperaba exactamente 1.`)
    console.error('   Requiere revisión humana. Se aborta sin escribir nada.')
    process.exit(1)
  }

  const doc = snap.docs[0]
  const data = doc.data()
  console.log(`Empresa fundacional: id=${doc.id} nombre="${data.nombre ?? '(sin nombre)'}"`)
  console.log(`Campos actuales: ${Object.keys(data).sort().join(', ')}`)
  console.log('')

  const creadaEn = data.creadaEn as Timestamp | undefined
  if (!creadaEn) {
    console.error('❌ El documento no tiene `creadaEn`; no hay origen fiable para `actualizadaEn`.')
    console.error('   Requiere revisión humana. Se aborta sin escribir nada.')
    process.exit(1)
  }

  // Solo campos ausentes: un valor ya presente jamás se sobrescribe.
  const propuesto: Record<string, unknown> = {}
  if (data.actualizadaEn === undefined) propuesto.actualizadaEn = creadaEn
  if (data.revision === undefined) propuesto.revision = 1
  if (data.schemaVersion === undefined) propuesto.schemaVersion = 1

  const yaPresentes = ['actualizadaEn', 'revision', 'schemaVersion'].filter((k) => data[k] !== undefined)
  if (yaPresentes.length > 0) {
    console.log(`Campos ya presentes (se respetan, no se tocan): ${yaPresentes.join(', ')}`)
  }

  if (Object.keys(propuesto).length === 0) {
    console.log('✅ El documento ya cumple el contrato actual. No hay nada que escribir (no-op).')
    return
  }

  console.log('Campos a escribir:')
  for (const [k, v] of Object.entries(propuesto)) {
    const legible = v instanceof Timestamp ? `${v.toDate().toISOString()} (= creadaEn)` : String(v)
    console.log(`  ${k.padEnd(16)} = ${legible}`)
  }
  console.log('')

  if (!EXECUTE) {
    console.log('DRY-RUN: no se escribió nada. Reejecutar con --execute para aplicar.')
    return
  }

  // `update()` y no `set(merge:true)`: si el documento desapareciera entre la
  // lectura y esta escritura, update() falla con NOT_FOUND en vez de recrearlo
  // con solo estos tres campos.
  await doc.ref.update(propuesto)
  console.log('✅ Escrito.')

  // Verificación posterior sobre el dato real, no sobre lo que creemos escrito.
  const verif = (await doc.ref.get()).data() ?? {}
  const faltantes = ['actualizadaEn', 'revision', 'schemaVersion'].filter((k) => verif[k] === undefined)
  if (faltantes.length > 0) {
    console.error(`❌ Verificación fallida; siguen ausentes: ${faltantes.join(', ')}`)
    process.exit(1)
  }
  console.log(`Verificado: campos finales = ${Object.keys(verif).sort().join(', ')}`)
}

main().catch((error) => {
  console.error('❌ Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
