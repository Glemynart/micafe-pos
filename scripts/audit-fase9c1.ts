/**
 * audit-fase9c1.ts  —  FASE-9C.1 · Conciliación financiera (SOLO LECTURA)
 *
 * Objetivo: validar si el gap de ~$490.000 en `bancolombia` (ventas con
 * origenReserva creadas antes del commit 218cef7, sin TF de categoría 'ventas')
 * NO fue compensado manualmente por ajustes / ingresos manuales / traslados /
 * correcciones posteriores.
 *
 * GARANTÍA: este script NO escribe ni modifica nada. Solo `.get()`.
 *
 * Uso:  npx tsx scripts/audit-fase9c1.ts
 * Requiere FIREBASE_SERVICE_ACCOUNT en .env.local (JSON del service account).
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ─── Carga del service account (solo lectura) ────────────────────────────────
// Soporta dos modos, sin edición manual del JSON:
//   1) FIREBASE_SERVICE_ACCOUNT = JSON inline en una sola línea (igual que la app).
//   2) Un archivo .json sin tocar (el descargado de Google). Ruta vía
//      FIREBASE_SERVICE_ACCOUNT_PATH o GOOGLE_APPLICATION_CREDENTIALS, o el
//      default ./service-account.local.json (ya gitignored).
function loadServiceAccount(): any {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline)
    } catch {
      console.error(
        '⚠️  FIREBASE_SERVICE_ACCOUNT está presente pero no es JSON válido en una sola línea.\n' +
          '   (Probablemente quedó partido en varias líneas en .env.local.)\n' +
          '   Usa el modo archivo: guarda el JSON descargado como service-account.local.json'
      )
    }
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './service-account.local.json',
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`🔑 Cargando service account desde archivo: ${p}`)
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  }
  console.error(
    '❌ No se encontró el service account.\n' +
      '   Opción A: FIREBASE_SERVICE_ACCOUNT=<json en una sola línea> en .env.local\n' +
      '   Opción B: guardar el JSON descargado como ./service-account.local.json'
  )
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) })
}
const db = getFirestore()

// ─── Helpers ─────────────────────────────────────────────────────────────────
const COP = (n: number) =>
  '$' + (n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })

function toISO(f: any): string {
  if (!f) return ''
  if (f instanceof Timestamp) return f.toDate().toISOString()
  if (typeof f === 'string') return f
  if (f?._seconds != null) return new Date(f._seconds * 1000).toISOString()
  return String(f)
}

function ventaMonto(d: any): number {
  return Number(d?.totales?.total ?? d?.total ?? 0)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FASE-9C.1 · CONCILIACIÓN FINANCIERA — SOLO LECTURA')
  console.log('══════════════════════════════════════════════════════════════\n')

  // 1) Ventas con origenReserva (orderBy excluye docs sin el campo)
  const ventasSnap = await db.collection('ventas').orderBy('origenReserva').get()
  const ventas = ventasSnap.docs.map((doc) => {
    const d = doc.data()
    return {
      ventaId: doc.id,
      origenReserva: d.origenReserva as string,
      consecutivo: Number(d.consecutivo ?? 0),
      turnoId: (d.turnoId as string) ?? '',
      cajeroId: (d.cajeroId as string) ?? '',
      metodoPago: (d.metodoPago as string) ?? 'transferencia',
      estado: (d.estado as string) ?? '',
      isWompi: Boolean(d.isWompi),
      monto: ventaMonto(d),
      fecha: toISO(d.fecha),
    }
  })

  // 2) Cruce: ¿tiene TF con categoria='ventas' y referencia=ventaId?
  const conTF: typeof ventas = []
  const sinTF: typeof ventas = []
  for (const v of ventas) {
    const tfSnap = await db
      .collection('transacciones_financieras')
      .where('referencia', '==', v.ventaId)
      .where('categoria', '==', 'ventas')
      .limit(1)
      .get()
    ;(tfSnap.empty ? sinTF : conTF).push(v)
  }

  const gapTotal = sinTF.reduce((s, v) => s + v.monto, 0)

  console.log('── A. Ventas con origenReserva ───────────────────────────────')
  console.log(`Total: ${ventas.length}  |  con TF: ${conTF.length}  |  SIN TF (gap): ${sinTF.length}`)
  console.log(`Gap financiero total: ${COP(gapTotal)}\n`)

  console.table(
    ventas.map((v) => ({
      consec: v.consecutivo,
      ventaId: v.ventaId,
      monto: v.monto,
      metodoPago: v.metodoPago,
      turnoId: v.turnoId,
      wompi: v.isWompi,
      fecha: v.fecha.slice(0, 10),
      TF: sinTF.includes(v) ? '❌ GAP' : '✅',
    }))
  )

  // 3) Estado de cuentas
  const cuentasSnap = await db.collection('cuentas_bancarias').get()
  const cuentas = cuentasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  console.log('\n── B. Saldos actuales de cuentas ─────────────────────────────')
  console.table(cuentas.map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo })))

  // 4) Reconciliación por cuenta afectada (gap real está en transferencia → bancolombia)
  const cuentasAfectadas = Array.from(new Set(sinTF.map((v) =>
    v.metodoPago === 'efectivo' ? 'caja-principal' : 'bancolombia')))

  const reconcilData: any[] = []
  for (const cuentaId of cuentasAfectadas) {
    const tfSnap = await db
      .collection('transacciones_financieras')
      .where('cuentaId', '==', cuentaId)
      .get()

    const txs = tfSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    const ingresos = txs.filter((t) => t.tipo === 'ingreso')
    const egresos = txs.filter((t) => t.tipo === 'egreso')
    const sumIng = ingresos.reduce((s, t) => s + Number(t.monto ?? 0), 0)
    const sumEgr = egresos.reduce((s, t) => s + Number(t.monto ?? 0), 0)
    const netoTF = sumIng - sumEgr

    const cuenta = cuentas.find((c) => c.id === cuentaId)
    const saldoActual = Number(cuenta?.saldo ?? 0)

    // Agrupación por categoría (para detectar ingresos manuales / ajustes / traslados)
    const porCategoria: Record<string, { tipo: string; n: number; total: number }> = {}
    for (const t of txs) {
      const k = `${t.categoria ?? 'sin-categoria'} (${t.tipo})`
      porCategoria[k] ??= { tipo: t.tipo, n: 0, total: 0 }
      porCategoria[k].n++
      porCategoria[k].total += Number(t.monto ?? 0)
    }

    // Ingresos NO-ventas = candidatos a compensación manual del gap
    const ingresosNoVentas = ingresos.filter((t) => t.categoria !== 'ventas')
    const sumIngManual = ingresosNoVentas.reduce((s, t) => s + Number(t.monto ?? 0), 0)

    console.log(`\n── C. Reconciliación cuenta: ${cuentaId} ─────────────────────`)
    console.log(`Saldo actual:            ${COP(saldoActual)}`)
    console.log(`Σ ingresos TF:           ${COP(sumIng)}  (${ingresos.length} TF)`)
    console.log(`Σ egresos TF:            ${COP(sumEgr)}  (${egresos.length} TF)`)
    console.log(`Neto derivado de TF:     ${COP(netoTF)}`)
    console.log(`Δ (saldo − netoTF):      ${COP(saldoActual - netoTF)}   ← saldo inicial / writes sin TF`)

    console.log('\nTF por categoría:')
    console.table(
      Object.entries(porCategoria).map(([k, v]) => ({ categoria: k, n: v.n, total: v.total }))
    )

    console.log(`\nIngresos NO-'ventas' (candidatos a compensación manual): ${ingresosNoVentas.length}`)
    console.log(`Σ ingresos manuales/ajustes/traslados: ${COP(sumIngManual)}`)
    if (ingresosNoVentas.length) {
      console.table(
        ingresosNoVentas
          .sort((a, b) => toISO(a.fecha).localeCompare(toISO(b.fecha)))
          .map((t) => ({
            fecha: toISO(t.fecha).slice(0, 10),
            categoria: t.categoria,
            monto: Number(t.monto ?? 0),
            concepto: (t.concepto ?? '').slice(0, 48),
            usuario: t.usuarioNombre ?? t.usuarioId,
            referencia: t.referencia ?? '',
          }))
      )
    }

    // Veredicto heurístico para esta cuenta
    const montosGap = sinTF
      .filter((v) => (v.metodoPago === 'efectivo' ? 'caja-principal' : 'bancolombia') === cuentaId)
      .map((v) => v.monto)
    const gapCuenta = montosGap.reduce((s, m) => s + m, 0)
    console.log(`\n→ Gap atribuible a ${cuentaId}: ${COP(gapCuenta)}`)
    console.log(`→ Saldo esperado si NO hubo compensación: ${COP(saldoActual + gapCuenta)}`)
    console.log(
      `→ Compensación manual detectable: ${
        sumIngManual >= gapCuenta && gapCuenta > 0
          ? '⚠️  POSIBLE (revisar ingresos manuales arriba uno a uno)'
          : '❌ NO HAY ingresos manuales suficientes para cubrir el gap'
      }`
    )

    reconcilData.push({
      cuentaId,
      saldoActual,
      sumIngresosTF: sumIng,
      sumEgresosTF: sumEgr,
      netoTF,
      deltaSaldoMenosNeto: saldoActual - netoTF,
      porCategoria,
      ingresosNoVentas: ingresosNoVentas.map((t) => ({
        fecha: toISO(t.fecha),
        categoria: t.categoria,
        monto: Number(t.monto ?? 0),
        concepto: t.concepto ?? '',
        usuario: t.usuarioNombre ?? t.usuarioId,
        referencia: t.referencia ?? '',
      })),
      sumIngresosManuales: sumIngManual,
      gapAtribuible: gapCuenta,
      saldoEsperadoSinCompensacion: saldoActual + gapCuenta,
      compensacionManualDetectable: sumIngManual >= gapCuenta && gapCuenta > 0,
    })
  }

  // ─── Artefacto JSON estructurado ───────────────────────────────────────────
  const cuentaDe = (m: string) => (m === 'efectivo' ? 'caja-principal' : 'bancolombia')
  const report = {
    generadoEn: new Date().toISOString(),
    fase: 'FASE-9C.1',
    soloLectura: true,
    ventasConOrigenReserva: ventas.length,
    conTF: conTF.length,
    sinTF_gap: sinTF.length,
    gapTotal,
    ventasAfectadas: sinTF.map((v) => ({
      consecutivo: v.consecutivo,
      ventaId: v.ventaId,
      monto: v.monto,
      metodoPago: v.metodoPago,
      cuentaDestino: cuentaDe(v.metodoPago),
      turnoId: v.turnoId,
      cajeroId: v.cajeroId,
      isWompi: v.isWompi,
      fecha: v.fecha,
    })),
    ventasConTF: conTF.map((v) => ({
      consecutivo: v.consecutivo,
      ventaId: v.ventaId,
      monto: v.monto,
      fecha: v.fecha,
    })),
    saldos: cuentas.map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo })),
    reconciliacion: reconcilData,
  }
  fs.writeFileSync('audit-fase9c1-report.json', JSON.stringify(report, null, 2))
  console.log('\n📄 JSON escrito en: audit-fase9c1-report.json\n')
  console.log('───── JSON ─────')
  console.log(JSON.stringify(report, null, 2))

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FIN — no se escribió ningún dato en Firestore.')
  console.log('══════════════════════════════════════════════════════════════\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en auditoría:', err)
    process.exit(1)
  })
