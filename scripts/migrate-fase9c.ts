/**
 * migrate-fase9c.ts  —  MIGRACIÓN HISTÓRICA FASE-9C
 *
 * Crea las TF de categoría 'ventas' faltantes y acredita `bancolombia` para las
 * 8 ventas de reserva creadas antes del fix 218cef7 (gap $490.000).
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito  --execute
 *   • Fuente de verdad = ALLOWLIST explícita (8 ventas auditadas en FASE-9C.1).
 *   • Validación POR VENTA: ventaId existe + monto esperado + metodoPago esperado.
 *   • Aborta si aparece una venta de reserva sin TF que NO está en la allowlist
 *     (gap inesperado → re-auditar), o si un monto/metodoPago no coincide.
 *   • Idempotente y REANUDABLE: doc id determinístico `MIG9C-<ventaId>` + guard
 *     de TF previa, ambos dentro del runTransaction. Re-ejecutar tras un fallo
 *     parcial completa solo lo que falte; NO depende de count/total agregados.
 *   • Atómico por venta: increment(saldo) + set(TF) en un mismo runTransaction.
 *   • Solo toca: transacciones_financieras/MIG9C-* (create) y
 *     cuentas_bancarias/bancolombia (increment). Nada más.
 *
 * Uso:
 *   Dry-run (no escribe):  FIREBASE_SERVICE_ACCOUNT_PATH=./<sa>.json npx tsx scripts/migrate-fase9c.ts
 *   Ejecución real:        ... npx tsx scripts/migrate-fase9c.ts --execute
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

const EXECUTE = process.argv.includes('--execute')

// ─── Service account (mismo cargador robusto que las auditorías) ─────────────
function loadServiceAccount(): any {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline)
    } catch {
      /* cae a modo archivo */
    }
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
const CUENTA_ID = 'bancolombia'
const CUENTA_NOMBRE = 'Bancolombia'
const MIGRACION_VERSION = 1

// ─── ALLOWLIST: única fuente de verdad (8 ventas auditadas en FASE-9C.1) ─────
interface VentaEsperada {
  consecutivo: number
  ventaId: string
  monto: number
  metodoPago: 'transferencia'
}
const ALLOWLIST: VentaEsperada[] = [
  { consecutivo: 103, ventaId: '9Qqi2fgRClS66LLf3cEu', monto: 35000, metodoPago: 'transferencia' },
  { consecutivo: 104, ventaId: 'TGFsIGGyf7PYNzIihOOB', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 105, ventaId: 'AkCMUNKsg8OpDlw3NzBv', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 106, ventaId: '5gLnJFyVJaebVvLRlGxX', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 107, ventaId: 'QCfawSqQOTb1IsdpfVcb', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 129, ventaId: 'kPYAYSbOvkFztgzycvwW', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 130, ventaId: 'zIvk5pxBluB0B8rc3Q8a', monto: 70000, metodoPago: 'transferencia' },
  { consecutivo: 131, ventaId: 'PvrKMspOEQV9aM8GWOQU', monto: 35000, metodoPago: 'transferencia' },
]
const ALLOWED_IDS = new Set(ALLOWLIST.map((v) => v.ventaId))

// Entrada del allowlist enriquecida con el estado real leído de Firestore.
interface VentaValidada extends VentaEsperada {
  espacioId: string | null
  fechaOriginal: Timestamp | null
  yaTieneTF: boolean
}

async function tieneTFVentas(ventaId: string): Promise<boolean> {
  const snap = await db
    .collection('transacciones_financieras')
    .where('referencia', '==', ventaId)
    .where('categoria', '==', 'ventas')
    .limit(1)
    .get()
  return !snap.empty
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(` MIGRACIÓN FASE-9C  —  modo: ${EXECUTE ? '⚠️  EXECUTE (escribe)' : '🟢 DRY-RUN (no escribe)'}`)
  console.log('══════════════════════════════════════════════════════════════\n')

  const abortar = (errores: string[]): never => {
    console.error('\n🛑 ABORT — validación fallida. No se ejecuta ninguna escritura:')
    errores.forEach((e) => console.error('   • ' + e))
    process.exit(1)
  }

  // ── 1) Detección de ventas INESPERADAS (gap fuera de la allowlist) ──────────
  // Resumible: una venta ya migrada tiene TF → no es gap → no dispara abort.
  const ventasSnap = await db.collection('ventas').orderBy('origenReserva').get()
  const inesperadas: string[] = []
  for (const d of ventasSnap.docs) {
    const v = d.data() as any
    const metodoPago = (v.metodoPago as string) ?? 'transferencia'
    if (metodoPago === 'efectivo') continue // fuera de alcance (caja-principal)
    if (ALLOWED_IDS.has(d.id)) continue // está en la allowlist → se valida abajo
    if (await tieneTFVentas(d.id)) continue // ya tiene TF → no es gap
    inesperadas.push(`#${Number(v.consecutivo ?? 0)} ${d.id} (${COP(Number(v?.totales?.total ?? 0))})`)
  }
  if (inesperadas.length) {
    abortar([
      'Aparecieron ventas de reserva sin TF que NO están en la allowlist auditada:',
      ...inesperadas.map((x) => '  - ' + x),
      'Re-ejecutar FASE-9C.1 y actualizar la allowlist antes de migrar.',
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
    const metodoReal = (v.metodoPago as string) ?? 'transferencia'
    const montoReal = Number(v?.totales?.total ?? 0)

    if (metodoReal !== esperada.metodoPago)
      errores.push(
        `Venta #${esperada.consecutivo}: metodoPago '${metodoReal}' ≠ esperado '${esperada.metodoPago}'.`
      )
    if (montoReal !== esperada.monto)
      errores.push(
        `Venta #${esperada.consecutivo}: monto ${COP(montoReal)} ≠ esperado ${COP(esperada.monto)}.`
      )

    validadas.push({
      ...esperada,
      espacioId: (v.espacioId as string) ?? null,
      fechaOriginal: v.fecha instanceof Timestamp ? v.fecha : null,
      yaTieneTF: await tieneTFVentas(esperada.ventaId),
    })
  }
  if (errores.length) abortar(errores)

  // ── 3) Plan de migración (resumible: solo las que faltan) ───────────────────
  const pendientes = validadas.filter((v) => !v.yaTieneTF)
  const yaMigradas = validadas.filter((v) => v.yaTieneTF)
  const montoPendiente = pendientes.reduce((s, v) => s + v.monto, 0)
  const bancoSnap = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  const saldoActual = Number((bancoSnap.data() as any)?.saldo ?? 0)

  console.log('── Preflight (validación por venta superada) ─────────────────')
  console.log(`Allowlist:              ${ALLOWLIST.length} ventas`)
  console.log(`Ya migradas (con TF):   ${yaMigradas.length}`)
  console.log(`Pendientes a migrar:    ${pendientes.length}`)
  console.log(`Monto pendiente:        ${COP(montoPendiente)}`)
  console.log(`Saldo bancolombia hoy:  ${COP(saldoActual)}`)
  console.log(`Saldo tras migración:   ${COP(saldoActual + montoPendiente)}`)
  console.table(
    validadas.map((v) => ({
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
  let migradas = 0,
    saltadas = 0,
    fallidas = 0
  for (const c of pendientes) {
    const tfRef = db.collection('transacciones_financieras').doc(`MIG9C-${c.ventaId}`)
    try {
      const resultado = await db.runTransaction(async (tx) => {
        // READS primero
        const existing = await tx.get(tfRef) // guard determinístico
        if (existing.exists) return 'skip'
        const dupGuard = await tx.get(
          db
            .collection('transacciones_financieras')
            .where('referencia', '==', c.ventaId)
            .where('categoria', '==', 'ventas')
            .limit(1)
        )
        if (!dupGuard.empty) return 'skip' // TF operacional ya existe
        const banco = await tx.get(db.collection('cuentas_bancarias').doc(CUENTA_ID))
        if (!banco.exists) throw new Error('cuenta bancolombia no existe')

        // WRITES después
        const ahora = Timestamp.now()
        tx.update(banco.ref, { saldo: FieldValue.increment(c.monto) })
        tx.set(tfRef, {
          cuentaId: CUENTA_ID,
          cuentaNombre: CUENTA_NOMBRE,
          tipo: 'ingreso',
          monto: c.monto,
          concepto: `Venta #${c.consecutivo} — MIGRACIÓN FASE-9C`,
          categoria: 'ventas',
          referencia: c.ventaId,
          usuarioId: 'migracion-9c',
          usuarioNombre: 'Migración Histórica FASE-9C',
          espacioId: c.espacioId,
          fecha: c.fechaOriginal ?? ahora, // período contable original de la venta
          // ── metadata de migración (trazabilidad / rollback consultable) ──
          origenMigracion: 'FASE-9C',
          migracionVersion: MIGRACION_VERSION,
          ventaConsecutivo: c.consecutivo,
          migradoEn: ahora, // momento real en que se aplicó el crédito
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

  const bancoFinal = await db.collection('cuentas_bancarias').doc(CUENTA_ID).get()
  console.log('\n── Resumen ───────────────────────────────────────────────────')
  console.log(`Migradas: ${migradas} | Saltadas: ${saltadas} | Fallidas: ${fallidas}`)
  console.log(`Saldo bancolombia final: ${COP(Number((bancoFinal.data() as any)?.saldo ?? 0))}`)
  if (fallidas > 0)
    console.log('⚠️  Hubo fallos: re-ejecutar el script completará las pendientes (idempotente).')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
