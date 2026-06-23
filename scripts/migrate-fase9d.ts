/**
 * migrate-fase9d.ts  —  MIGRACIÓN HISTÓRICA FASE-9D
 *
 * Crea las TF de categoría 'ventas' faltantes y acredita `caja-principal` para
 * las 13 ventas efectivo creadas antes de la integración financiera (gap $192.780).
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito  --execute
 *   • Fuente de verdad = ALLOWLIST explícita (13 ventas auditadas en FASE-9D.1/9D.2).
 *   • Validación POR VENTA: ventaId existe + monto esperado + metodoPago esperado.
 *   • Aborta si aparece una venta efectivo sin TF que NO está en la allowlist
 *     (gap inesperado → re-auditar), o si un monto/metodoPago no coincide.
 *   • Idempotente y REANUDABLE: doc id determinístico `MIG9D-<ventaId>` + guard
 *     de TF previa, ambos dentro del runTransaction. Re-ejecutar tras un fallo
 *     parcial completa solo lo que falte.
 *   • Atómico por venta: increment(saldo) + set(TF) en un mismo runTransaction.
 *   • Solo toca: transacciones_financieras/MIG9D-* (create) y
 *     cuentas_bancarias/caja-principal (increment). Nada más.
 *
 * Uso:
 *   Dry-run:    FIREBASE_SERVICE_ACCOUNT_PATH=./<sa>.json npx tsx scripts/migrate-fase9d.ts
 *   Ejecución:  ... npx tsx scripts/migrate-fase9d.ts --execute
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

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
const CUENTA_NOMBRE = 'Caja Registradora'
const MIGRACION_VERSION = 1

// ─── ALLOWLIST: 13 ventas auditadas en FASE-9D.1 / 9D.2 ─────────────────────
interface VentaEsperada {
  consecutivo: number
  ventaId: string
  monto: number
  metodoPago: 'efectivo'
}
const ALLOWLIST: VentaEsperada[] = [
  { consecutivo: 0, ventaId: 'SD6PrfyYE4KSwDKXPt79', monto: 16660, metodoPago: 'efectivo' },
  { consecutivo: 100, ventaId: '5RQsZGv0fPN6d3wZOjIS', monto: 1785, metodoPago: 'efectivo' },
  { consecutivo: 101, ventaId: 'jOujqmQGj7thasZgTCbn', monto: 113050, metodoPago: 'efectivo' },
  { consecutivo: 102, ventaId: 'r1bPK0peqxqBFS7mlb0S', monto: 7735, metodoPago: 'efectivo' },
  { consecutivo: 108, ventaId: 'g6xwKgbf5x6ukBcjUSrX', monto: 1785, metodoPago: 'efectivo' },
  { consecutivo: 109, ventaId: 'L3qaoDuCdwk3WDERtRVL', monto: 1785, metodoPago: 'efectivo' },
  { consecutivo: 110, ventaId: 'gRdDu76AlZ5kWm0iICkv', monto: 1785, metodoPago: 'efectivo' },
  { consecutivo: 113, ventaId: 'ip3wOKhuFof8LRmNUFtM', monto: 14280, metodoPago: 'efectivo' },
  { consecutivo: 114, ventaId: 'ftQUJE2ytdK8rMtyxRYe', monto: 2975, metodoPago: 'efectivo' },
  { consecutivo: 119, ventaId: 'ROBlxzhRuIMvwdtjF23m', monto: 10710, metodoPago: 'efectivo' },
  { consecutivo: 120, ventaId: 'IXXP2GQTujlgMwaDKzxL', monto: 8925, metodoPago: 'efectivo' },
  { consecutivo: 121, ventaId: '68tF1dv8kz9Kb98sUTVE', monto: 9520, metodoPago: 'efectivo' },
  { consecutivo: 122, ventaId: 'R3YsJSgHHLCMmzRC8K7w', monto: 1785, metodoPago: 'efectivo' },
]
const ALLOWED_IDS = new Set(ALLOWLIST.map(v => v.ventaId))

interface VentaValidada extends VentaEsperada {
  espacioId: string | null
  fechaOriginal: Timestamp | null
  yaTieneTF: boolean
}

async function tieneTFVentas(ventaId: string): Promise<boolean> {
  const snap = await db.collection('transacciones_financieras')
    .where('referencia', '==', ventaId)
    .where('categoria', '==', 'ventas')
    .where('cuentaId', '==', CUENTA_ID)
    .limit(1).get()
  return !snap.empty
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(` MIGRACIÓN FASE-9D  —  modo: ${EXECUTE ? '⚠️  EXECUTE (escribe)' : '🟢 DRY-RUN (no escribe)'}`)
  console.log('══════════════════════════════════════════════════════════════\n')

  const abortar = (errores: string[]): never => {
    console.error('\n🛑 ABORT — validación fallida. No se ejecuta ninguna escritura:')
    errores.forEach(e => console.error('   • ' + e))
    process.exit(1)
  }

  // ── 1) Detección de ventas INESPERADAS (gap fuera de la allowlist) ──────────
  const ventasSnap = await db.collection('ventas')
    .where('metodoPago', '==', 'efectivo').get()
  const inesperadas: string[] = []
  for (const d of ventasSnap.docs) {
    if (ALLOWED_IDS.has(d.id)) continue
    if (await tieneTFVentas(d.id)) continue
    const v = d.data() as any
    inesperadas.push(`#${Number(v.consecutivo ?? 0)} ${d.id} (${COP(Number(v?.totales?.total ?? 0))})`)
  }
  if (inesperadas.length) {
    abortar([
      'Aparecieron ventas efectivo sin TF que NO están en la allowlist auditada:',
      ...inesperadas.map(x => '  - ' + x),
      'Re-ejecutar FASE-9D.1 y actualizar la allowlist antes de migrar.',
    ])
  }

  // ── 2) Validación POR VENTA contra la allowlist ─────────────────────────────
  const errores: string[] = []
  const validadas: VentaValidada[] = []
  for (const esperada of ALLOWLIST) {
    const ref = db.collection('ventas').doc(esperada.ventaId)
    const snap = await ref.get()
    if (!snap.exists) {
      errores.push(`Venta #${esperada.consecutivo} (${esperada.ventaId}) NO existe.`)
      continue
    }
    const v = snap.data() as any
    const metodoReal = (v.metodoPago as string) ?? 'efectivo'
    const montoReal = Number(v?.totales?.total ?? 0)

    if (metodoReal !== esperada.metodoPago)
      errores.push(`Venta #${esperada.consecutivo}: metodoPago '${metodoReal}' ≠ esperado '${esperada.metodoPago}'.`)
    if (montoReal !== esperada.monto)
      errores.push(`Venta #${esperada.consecutivo}: monto ${COP(montoReal)} ≠ esperado ${COP(esperada.monto)}.`)

    validadas.push({
      ...esperada,
      espacioId: (v.espacioId as string) ?? null,
      fechaOriginal: v.fecha instanceof Timestamp ? v.fecha : null,
      yaTieneTF: await tieneTFVentas(esperada.ventaId),
    })
  }
  if (errores.length) abortar(errores)

  // ── 3) Plan de migración ────────────────────────────────────────────────────
  const pendientes = validadas.filter(v => !v.yaTieneTF)
  const yaMigradas = validadas.filter(v => v.yaTieneTF)
  const montoPendiente = pendientes.reduce((s, v) => s + v.monto, 0)
  const cajaSnap = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  const saldoActual = Number((cajaSnap.data() as any)?.saldo ?? 0)

  console.log('── Preflight (validación por venta superada) ─────────────────')
  console.log(`Allowlist:              ${ALLOWLIST.length} ventas`)
  console.log(`Ya migradas (con TF):   ${yaMigradas.length}`)
  console.log(`Pendientes a migrar:    ${pendientes.length}`)
  console.log(`Monto pendiente:        ${COP(montoPendiente)}`)
  console.log(`Saldo caja-principal:   ${COP(saldoActual)}`)
  console.log(`Saldo tras migración:   ${COP(saldoActual + montoPendiente)}`)
  console.table(
    validadas.map(v => ({
      consec: v.consecutivo,
      ventaId: v.ventaId,
      monto: v.monto,
      estado: v.yaTieneTF ? '✅ ya migrada' : '⏳ pendiente',
    }))
  )

  if (!EXECUTE) {
    console.log('\n🟢 DRY-RUN completo. No se escribió nada. Para ejecutar: añade --execute\n')
    return
  }

  // ── 4) Ejecución real: una transacción atómica por venta pendiente ──────────
  let migradas = 0, saltadas = 0, fallidas = 0
  for (const c of pendientes) {
    const tfRef = db.collection('transacciones_financieras').doc(`MIG9D-${c.ventaId}`)
    try {
      const resultado = await db.runTransaction(async (tx) => {
        // READS primero
        const existing = await tx.get(tfRef)
        if (existing.exists) return 'skip'
        const dupGuard = await tx.get(
          db.collection('transacciones_financieras')
            .where('referencia', '==', c.ventaId)
            .where('categoria', '==', 'ventas')
            .where('cuentaId', '==', CUENTA_ID)
            .limit(1)
        )
        if (!dupGuard.empty) return 'skip'
        const caja = await tx.get(db.collection('cuentas_bancarias').doc(CUENTA_ID))
        if (!caja.exists) throw new Error('cuenta caja-principal no existe')

        // WRITES después
        const ahora = Timestamp.now()
        tx.update(caja.ref, { saldo: FieldValue.increment(c.monto) })
        tx.set(tfRef, {
          cuentaId: CUENTA_ID,
          cuentaNombre: CUENTA_NOMBRE,
          tipo: 'ingreso',
          monto: c.monto,
          concepto: `Venta #${c.consecutivo} — MIGRACIÓN FASE-9D`,
          categoria: 'ventas',
          referencia: c.ventaId,
          usuarioId: 'migracion-9d',
          usuarioNombre: 'Migración Histórica FASE-9D',
          espacioId: c.espacioId,
          fecha: c.fechaOriginal ?? ahora,
          origenMigracion: 'FASE-9D',
          migracionVersion: MIGRACION_VERSION,
          ventaConsecutivo: c.consecutivo,
          migradoEn: ahora,
        })
        return 'migrado'
      })
      if (resultado === 'skip') {
        saltadas++
        console.log(`  ⏭️  SKIP  venta #${c.consecutivo} (${c.ventaId}) — ya tenía TF`)
      } else {
        migradas++
        console.log(`  ✅ MIGRADO venta #${c.consecutivo} (${c.ventaId}) +${COP(c.monto)}`)
      }
    } catch (err: any) {
      fallidas++
      console.error(`  ❌ ERROR venta #${c.consecutivo} (${c.ventaId}): ${err.message}`)
    }
  }

  const cajaFinal = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  console.log('\n── Resumen ───────────────────────────────────────────────────')
  console.log(`Migradas: ${migradas} | Saltadas: ${saltadas} | Fallidas: ${fallidas}`)
  console.log(`Saldo caja-principal final: ${COP(Number((cajaFinal.data() as any)?.saldo ?? 0))}`)
  if (fallidas > 0)
    console.log('⚠️  Hubo fallos: re-ejecutar el script completará las pendientes (idempotente).')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
