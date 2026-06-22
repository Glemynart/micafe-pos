/**
 * audit-fase9c2.ts  —  FASE-9C.2 · Validación pre-migración (SOLO LECTURA)
 *
 * Audita el saldo negativo de `caja-principal` (-61.670) reconstruyendo
 * cronológicamente TODOS sus movimientos a partir de transacciones_financieras,
 * y confirma que `bancolombia` es base segura para la migración FASE-9C.
 *
 * Todas las rutas que mueven caja-principal.saldo escriben su TF en la MISMA
 * transacción atómica (ventas efectivo, egresos, traslados, ajuste_caja), así
 * que el ledger de TF debe reconstruir el saldo exacto. Un delta != 0 revela
 * un write sin TF o saldo inicial sembrado.
 *
 * GARANTÍA: NO escribe ni modifica nada en Firestore. Solo `.get()`.
 *
 * Uso:  FIREBASE_SERVICE_ACCOUNT_PATH=./<sa>.json npx tsx scripts/audit-fase9c2.ts
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ─── Service account (mismo cargador robusto que 9C.1) ───────────────────────
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
    if (fs.existsSync(p)) {
      console.log(`🔑 Service account desde archivo: ${p}`)
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  }
  console.error('❌ No se encontró el service account (env inline o archivo).')
  process.exit(1)
}

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

const COP = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })

function toISO(f: any): string {
  if (!f) return ''
  if (f instanceof Timestamp) return f.toDate().toISOString()
  if (typeof f === 'string') return f
  if (f?._seconds != null) return new Date(f._seconds * 1000).toISOString()
  return String(f)
}

const CUENTA = 'caja-principal'

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FASE-9C.2 · VALIDACIÓN PRE-MIGRACIÓN — SOLO LECTURA')
  console.log('══════════════════════════════════════════════════════════════\n')

  // Saldos actuales
  const cuentasSnap = await db.collection('cuentas_bancarias').get()
  const cuentas = cuentasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  console.log('── Saldos actuales ───────────────────────────────────────────')
  console.table(cuentas.map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo })))
  const cajaPrincipal = cuentas.find((c) => c.id === CUENTA)
  const saldoActual = Number(cajaPrincipal?.saldo ?? 0)

  // Ledger completo de caja-principal (sin orderBy en query → ordeno en memoria,
  // así no dependo de índice compuesto)
  const tfSnap = await db
    .collection('transacciones_financieras')
    .where('cuentaId', '==', CUENTA)
    .get()

  const movimientos = tfSnap.docs
    .map((d) => {
      const t = d.data() as any
      const monto = Number(t.monto ?? 0)
      const signed = t.tipo === 'ingreso' ? monto : -monto
      return {
        id: d.id,
        fecha: toISO(t.fecha),
        tipo: t.tipo as string,
        categoria: (t.categoria as string) ?? 'sin-categoria',
        monto,
        signed,
        concepto: (t.concepto as string) ?? '',
        referencia: (t.referencia as string) ?? '',
        usuario: (t.usuarioNombre as string) ?? (t.usuarioId as string) ?? '',
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Reconstrucción con saldo corrido
  let running = 0
  let minRunning = 0
  let primeraVezNegativo: string | null = null
  const ledger = movimientos.map((m) => {
    running += m.signed
    if (running < minRunning) minRunning = running
    if (running < 0 && primeraVezNegativo === null) primeraVezNegativo = m.fecha
    return { ...m, saldoCorrido: running }
  })
  const runningFinal = running
  const delta = saldoActual - runningFinal

  // Resumen por categoría
  const porCategoria: Record<string, { tipo: string; n: number; total: number; neto: number }> = {}
  for (const m of movimientos) {
    const k = `${m.categoria} (${m.tipo})`
    porCategoria[k] ??= { tipo: m.tipo, n: 0, total: 0, neto: 0 }
    porCategoria[k].n++
    porCategoria[k].total += m.monto
    porCategoria[k].neto += m.signed
  }

  console.log('\n── A. Ledger cronológico de caja-principal ───────────────────')
  console.log(`Movimientos (TF): ${ledger.length}`)
  console.table(
    ledger.map((m) => ({
      fecha: m.fecha.slice(0, 19).replace('T', ' '),
      tipo: m.tipo,
      categoria: m.categoria,
      monto: m.signed,
      saldoCorrido: m.saldoCorrido,
      concepto: m.concepto.slice(0, 40),
    }))
  )

  console.log('\n── B. Composición por categoría ──────────────────────────────')
  console.table(
    Object.entries(porCategoria).map(([k, v]) => ({
      categoria: k,
      n: v.n,
      sumaMontos: v.total,
      netoFirmado: v.neto,
    }))
  )

  console.log('\n── C. Reconciliación del saldo ───────────────────────────────')
  console.log(`Saldo actual (cuentas_bancarias): ${COP(saldoActual)}`)
  console.log(`Saldo reconstruido (Σ TF firmadas): ${COP(runningFinal)}`)
  console.log(`Δ (saldo − reconstruido):         ${COP(delta)}`)
  console.log(`Saldo mínimo histórico alcanzado: ${COP(minRunning)}`)
  console.log(`Primera vez en negativo:          ${primeraVezNegativo ?? 'nunca'}`)
  console.log(
    delta === 0
      ? '✅ El saldo está 100% explicado por el ledger de TF (sin writes ocultos).'
      : `⚠️  Hay ${COP(delta)} sin respaldo en TF → write sin transacción o saldo inicial sembrado.`
  )

  // ── D. Cross-check: ventas efectivo vs TF 'ventas' en caja-principal ────────
  const ventasEfSnap = await db
    .collection('ventas')
    .where('metodoPago', '==', 'efectivo')
    .get()
  const ventasEf = ventasEfSnap.docs
    .map((d) => Number((d.data() as any)?.totales?.total ?? 0))
  const sumVentasEf = ventasEf.reduce((s, n) => s + n, 0)
  const tfVentas = movimientos.filter((m) => m.categoria === 'ventas')
  const sumTfVentas = tfVentas.reduce((s, m) => s + m.monto, 0)
  console.log('\n── D. Cross-check ventas efectivo ↔ TF ───────────────────────')
  console.log(`Ventas metodoPago='efectivo': ${ventasEf.length}  Σ=${COP(sumVentasEf)}`)
  console.log(`TF categoría 'ventas' en caja-principal: ${tfVentas.length}  Σ=${COP(sumTfVentas)}`)
  console.log(
    `(Nota: ventas 'mixto' aportan efectivo parcial; una diferencia menor puede deberse a mixto.)`
  )

  // ── E. Caracterización del hueco de efectivo: ¿histórico u ongoing? ─────────
  // Para cada venta efectivo, ¿tiene su TF en caja-principal? Capturo consecutivo,
  // fecha y estado para ubicar el corte temporal (analogía con FASE-9C reservas).
  const efDetalle: any[] = []
  for (const d of ventasEfSnap.docs) {
    const v = d.data() as any
    const tf = await db
      .collection('transacciones_financieras')
      .where('referencia', '==', d.id)
      .where('cuentaId', '==', CUENTA)
      .where('categoria', '==', 'ventas')
      .limit(1)
      .get()
    efDetalle.push({
      consecutivo: Number(v.consecutivo ?? 0),
      ventaId: d.id,
      total: Number(v?.totales?.total ?? 0),
      estado: (v.estado as string) ?? '',
      fecha: toISO(v.fecha),
      tieneTF: !tf.empty,
    })
  }
  efDetalle.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const sinTfEf = efDetalle.filter((e) => !e.tieneTF)
  const huecoEf = sinTfEf.reduce((s, e) => s + e.total, 0)
  const ultimaSinTF = sinTfEf.length ? sinTfEf[sinTfEf.length - 1].fecha : null
  const primeraConTF = efDetalle.filter((e) => e.tieneTF)[0]?.fecha ?? null

  console.log('\n── E. Hueco de ventas efectivo (¿histórico u ongoing?) ───────')
  console.log(`Ventas efectivo SIN TF en caja-principal: ${sinTfEf.length}  Σ=${COP(huecoEf)}`)
  console.log(`Última venta efectivo SIN TF:  ${ultimaSinTF ?? 'n/a'}`)
  console.log(`Primera venta efectivo CON TF: ${primeraConTF ?? 'n/a'}`)
  console.table(
    efDetalle.map((e) => ({
      consec: e.consecutivo,
      fecha: e.fecha.slice(0, 19).replace('T', ' '),
      total: e.total,
      estado: e.estado,
      TF: e.tieneTF ? '✅' : '❌ sin TF',
    }))
  )

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FIN — no se escribió ningún dato en Firestore.')
  console.log('══════════════════════════════════════════════════════════════\n')

  // Artefacto JSON
  const report = {
    generadoEn: new Date().toISOString(),
    fase: 'FASE-9C.2',
    soloLectura: true,
    cuenta: CUENTA,
    saldoActual,
    saldoReconstruido: runningFinal,
    delta,
    saldoMinimoHistorico: minRunning,
    primeraVezNegativo,
    saldoExplicadoPorTF: delta === 0,
    porCategoria,
    crossCheckVentasEfectivo: {
      nVentasEfectivo: ventasEf.length,
      sumVentasEfectivo: sumVentasEf,
      nTfVentas: tfVentas.length,
      sumTfVentas,
    },
    huecoEfectivo: {
      nSinTF: sinTfEf.length,
      sumaSinTF: huecoEf,
      ultimaVentaSinTF: ultimaSinTF,
      primeraVentaConTF: primeraConTF,
      detalle: efDetalle,
    },
    saldosTodasLasCuentas: cuentas.map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo })),
    ledger,
  }
  fs.writeFileSync('audit-fase9c2-report.json', JSON.stringify(report, null, 2))
  console.log('📄 JSON escrito en: audit-fase9c2-report.json')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en auditoría:', err)
    process.exit(1)
  })
