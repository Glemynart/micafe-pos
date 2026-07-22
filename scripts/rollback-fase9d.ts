/**
 * rollback-fase9d.ts  —  ROLLBACK de la MIGRACIÓN HISTÓRICA FASE-9D
 *
 * Revierte exactamente lo que escribió migrate-fase9d.ts: por cada TF marcada
 * con `origenMigracion='FASE-9D'`, decrementa el saldo de caja-principal en su
 * monto y elimina la TF — todo atómico por documento.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito  --execute
 *   • Localiza SOLO TF de la migración: where origenMigracion == 'FASE-9D'
 *     + validación por doc de migracionVersion / tipo / categoria / id MIG9D-*.
 *   • ABORTA (sin escribir nada) si: cuenta ≠ caja-principal, monto ≤ 0,
 *     o cualquier inconsistencia de metadata.
 *   • Idempotente: si la TF ya fue borrada → skip; re-ejecutar tras un rollback
 *     completo => 0 operaciones (la query no devuelve nada).
 *   • Atómico por documento: increment(-monto) + delete(TF) en un mismo
 *     runTransaction (o ninguno).
 *   • Solo toca: cuentas_bancarias/caja-principal (decrement) y las TF MIG9D-*
 *     (delete). No toca ventas ni reservas ni turnos ni caja-fuerte.
 *
 * Uso:
 *   Dry-run:    FIREBASE_SERVICE_ACCOUNT_PATH=./<sa>.json npx tsx scripts/rollback-fase9d.ts
 *   Ejecución:  ... npx tsx scripts/rollback-fase9d.ts --execute
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const EXECUTE = process.argv.includes('--execute')

// ─── Service account ──────────────────────────────────────────────────────────
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

const COP = (n: number) => '$' + (n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })
const CUENTA_ID = 'caja-principal'
const ORIGEN_MIGRACION = 'FASE-9D'
const MIGRACION_VERSION = 1

interface TFMigracion {
  id: string
  cuentaId: string
  monto: number
  referencia: string
  consecutivo: number
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(` ROLLBACK FASE-9D  —  modo: ${EXECUTE ? '⚠️  EXECUTE (escribe)' : '🟢 DRY-RUN (no escribe)'}`)
  console.log('══════════════════════════════════════════════════════════════\n')

  const abortar = (errores: string[]): never => {
    console.error('\n🛑 ABORT — validación fallida. No se ejecuta ninguna escritura:')
    errores.forEach(e => console.error('   • ' + e))
    process.exit(1)
  }

  // ── 1) Localizar SOLO las TF de la migración FASE-9D ────────────────────────
  const tfSnap = await db
    .collection('transacciones_financieras')
    .where('origenMigracion', '==', ORIGEN_MIGRACION)
    .get()

  if (tfSnap.empty) {
    console.log('✅ No hay TF con origenMigracion=FASE-9D. Nada que revertir (0 operaciones).')
    return
  }

  // ── 2) Validación por documento ─────────────────────────────────────────────
  const errores: string[] = []
  const reversibles: TFMigracion[] = []
  for (const d of tfSnap.docs) {
    const t = d.data() as any
    const etiqueta = `TF ${d.id} (ref ${t.referencia ?? '∅'})`
    const monto = Number(t.monto ?? NaN)

    if (t.cuentaId !== CUENTA_ID)
      errores.push(`${etiqueta}: cuentaId '${t.cuentaId}' ≠ '${CUENTA_ID}'.`)
    if (!Number.isFinite(monto) || monto <= 0)
      errores.push(`${etiqueta}: monto inválido (${t.monto}). Debe ser > 0.`)
    if (Number(t.migracionVersion) !== MIGRACION_VERSION)
      errores.push(`${etiqueta}: migracionVersion '${t.migracionVersion}' ≠ ${MIGRACION_VERSION}.`)
    if (t.tipo !== 'ingreso')
      errores.push(`${etiqueta}: tipo '${t.tipo}' ≠ 'ingreso'.`)
    if (t.categoria !== 'ventas')
      errores.push(`${etiqueta}: categoria '${t.categoria}' ≠ 'ventas'.`)
    if (!d.id.startsWith('MIG9D-'))
      errores.push(`${etiqueta}: doc id no tiene prefijo 'MIG9D-'.`)
    if (typeof t.referencia !== 'string' || t.referencia.length === 0)
      errores.push(`${etiqueta}: referencia ausente o vacía.`)

    reversibles.push({
      id: d.id,
      cuentaId: t.cuentaId,
      monto,
      referencia: t.referencia,
      consecutivo: Number(t.ventaConsecutivo ?? 0),
    })
  }
  if (errores.length) abortar(errores)

  // ── 3) Preflight ────────────────────────────────────────────────────────────
  const totalRevertir = reversibles.reduce((s, r) => s + r.monto, 0)
  const cajaSnap = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  const saldoActual = Number((cajaSnap.data() as any)?.saldo ?? 0)

  console.log('── Preflight ─────────────────────────────────────────────────')
  console.log(`TF FASE-9D encontradas:   ${reversibles.length}`)
  console.log(`Monto total a revertir:   ${COP(totalRevertir)}`)
  console.log(`Saldo caja-principal hoy: ${COP(saldoActual)}`)
  console.log(`Saldo tras rollback:      ${COP(saldoActual - totalRevertir)}`)
  console.table(
    reversibles.map(r => ({ consec: r.consecutivo, tfId: r.id, ref: r.referencia, monto: r.monto }))
  )

  if (!EXECUTE) {
    console.log('\n🟢 DRY-RUN completo. No se escribió nada. Para ejecutar: añade --execute\n')
    return
  }

  // ── 4) Rollback real: una transacción atómica por TF ────────────────────────
  let revertidas = 0, saltadas = 0, fallidas = 0
  for (const r of reversibles) {
    const tfRef = db.collection('transacciones_financieras').doc(r.id)
    try {
      const resultado = await db.runTransaction(async (tx) => {
        const tfDoc = await tx.get(tfRef)
        if (!tfDoc.exists) return 'skip'
        const t = tfDoc.data() as any
        const monto = Number(t.monto ?? NaN)
        if (t.cuentaId !== CUENTA_ID) throw new Error(`cuentaId inesperado '${t.cuentaId}'`)
        if (!Number.isFinite(monto) || monto <= 0) throw new Error(`monto inválido '${t.monto}'`)
        if (t.origenMigracion !== ORIGEN_MIGRACION) throw new Error('TF no es de FASE-9D')
        const caja = await tx.get(db.collection('cuentas_bancarias').doc(CUENTA_ID))
        if (!caja.exists) throw new Error('cuenta caja-principal no existe')

        tx.update(caja.ref, { saldo: FieldValue.increment(-monto) })
        tx.delete(tfRef)
        return 'revertido'
      })
      if (resultado === 'skip') {
        saltadas++
        console.log(`  ⏭️  SKIP  TF ${r.id} — ya estaba eliminada`)
      } else {
        revertidas++
        console.log(`  ↩️  REVERTIDO TF ${r.id} (venta #${r.consecutivo}) −${COP(r.monto)}`)
      }
    } catch (err: any) {
      fallidas++
      console.error(`  ❌ ERROR TF ${r.id}: ${err.message}`)
    }
  }

  const cajaFinal = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  console.log('\n── Resumen ───────────────────────────────────────────────────')
  console.log(`Revertidas: ${revertidas} | Saltadas: ${saltadas} | Fallidas: ${fallidas}`)
  console.log(`Saldo caja-principal final: ${COP(Number((cajaFinal.data() as any)?.saldo ?? 0))}`)
  if (fallidas > 0)
    console.log('⚠️  Hubo fallos: re-ejecutar completará las pendientes (idempotente).')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
