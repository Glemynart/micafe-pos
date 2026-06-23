/**
 * audit-fase9d1.ts — FASE-9D.1 · Auditoría completa caja-principal (SOLO LECTURA)
 *
 * Reconstruye el ledger completo, cruza con turnos cerrados y ventas efectivo
 * para determinar si el gap de $192.780 es migrable o si parte ya fue trasladada
 * a caja-fuerte vía cierres de turno.
 *
 * GARANTÍA: NO escribe ni modifica nada en Firestore. Solo .get().
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

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
  console.error('❌ No se encontró el service account.')
  process.exit(1)
}

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

const COP = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })

function toISO(f: any): string {
  if (!f) return ''
  if (f instanceof Timestamp) return f.toDate().toISOString()
  if (f?._seconds != null) return new Date(f._seconds * 1000).toISOString()
  return String(f)
}

const CUENTA = 'caja-principal'

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FASE-9D.1 · AUDITORÍA COMPLETA CAJA-PRINCIPAL — SOLO LECTURA')
  console.log('══════════════════════════════════════════════════════════════\n')

  // ── 1. Saldos actuales ──────────────────────────────────────────────────
  const cuentasSnap = await db.collection('cuentas_bancarias').get()
  const cuentas = cuentasSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
  console.log('── 1. Saldos actuales ────────────────────────────────────────')
  console.table(cuentas.map(c => ({ id: c.id, nombre: c.nombre, saldo: c.saldo })))

  const saldoActual = Number(cuentas.find(c => c.id === CUENTA)?.saldo ?? 0)
  const saldoCajaFuerte = Number(cuentas.find(c => c.id === 'caja-fuerte')?.saldo ?? 0)

  // ── 2. Ledger completo de caja-principal ────────────────────────────────
  const tfSnap = await db.collection('transacciones_financieras')
    .where('cuentaId', '==', CUENTA).get()

  const movimientos = tfSnap.docs.map(d => {
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
    }
  }).sort((a, b) => a.fecha.localeCompare(b.fecha))

  let running = 0
  const ledger = movimientos.map(m => {
    running += m.signed
    return { ...m, saldoCorrido: running }
  })

  console.log('\n── 2. Ledger cronológico (16 TF) ─────────────────────────────')
  console.table(ledger.map(m => ({
    fecha: m.fecha.slice(0, 19).replace('T', ' '),
    tipo: m.tipo,
    categoria: m.categoria,
    monto: m.signed,
    saldoCorrido: m.saldoCorrido,
    concepto: m.concepto.slice(0, 45),
  })))

  console.log('\n── 3. Reconciliación ─────────────────────────────────────────')
  console.log(`Saldo actual:       ${COP(saldoActual)}`)
  console.log(`Saldo reconstruido: ${COP(running)}`)
  console.log(`Δ (delta):          ${COP(saldoActual - running)}`)
  console.log(saldoActual - running === 0
    ? '✅ Saldo 100% explicado por TF (delta = 0).'
    : '⚠️  Hay writes sin TF o saldo inicial sembrado.')

  // ── 4. Turnos cerrados ──────────────────────────────────────────────────
  const turnosSnap = await db.collection('turnos').where('estado', '==', 'cerrado').get()
  const turnos = turnosSnap.docs.map(d => {
    const t = d.data() as any
    return {
      id: d.id,
      cajero: t.cajeroNombre || t.cajeroId || '',
      ventasEfectivo: Number(t.ventasEfectivo ?? 0),
      totalEgresos: Number(t.totalEgresos ?? 0),
      esperadoEf: Number(t.totalEsperadoEfectivo ?? 0),
      reportadoEf: Number(t.totalReportadoEfectivo ?? 0),
      diferencia: Number(t.diferenciaEfectivo ?? 0),
      base: Number(t.baseApertura ?? 0),
      definitivo: t.esCierreDefinitivo ?? false,
      fechaCierre: toISO(t.fechaCierre),
      fechaApertura: toISO(t.fechaApertura),
    }
  }).sort((a, b) => (a.fechaCierre || a.fechaApertura).localeCompare(b.fechaCierre || b.fechaApertura))

  console.log('\n── 4. Turnos cerrados ────────────────────────────────────────')
  console.table(turnos.map(t => ({
    id: t.id.slice(0, 10),
    cajero: t.cajero,
    ventasEf: t.ventasEfectivo,
    esperadoEf: t.esperadoEf,
    reportadoEf: t.reportadoEf,
    diff: t.diferencia,
    base: t.base,
    definitivo: t.definitivo,
    fechaCierre: (t.fechaCierre || t.fechaApertura).slice(0, 19).replace('T', ' '),
  })))

  // ── 5. TF de caja-fuerte (traslados recibidos) ──────────────────────────
  const tfCFSnap = await db.collection('transacciones_financieras')
    .where('cuentaId', '==', 'caja-fuerte').get()

  const tfCF = tfCFSnap.docs.map(d => {
    const t = d.data() as any
    return {
      tipo: t.tipo as string,
      monto: Number(t.monto ?? 0),
      categoria: (t.categoria as string) ?? '',
      concepto: (t.concepto as string)?.slice(0, 45) ?? '',
      referencia: (t.referencia as string) ?? '',
      fecha: toISO(t.fecha),
    }
  }).sort((a, b) => a.fecha.localeCompare(b.fecha))

  console.log('\n── 5. TF en caja-fuerte ──────────────────────────────────────')
  console.table(tfCF.map(t => ({
    fecha: t.fecha.slice(0, 19).replace('T', ' '),
    tipo: t.tipo,
    monto: t.monto,
    categoria: t.categoria,
    concepto: t.concepto,
  })))

  const sumCFIngresos = tfCF.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
  const sumCFEgresos = tfCF.filter(t => t.tipo === 'egreso').reduce((s, t) => s + t.monto, 0)
  console.log(`Saldo caja-fuerte:    ${COP(saldoCajaFuerte)}`)
  console.log(`Σ ingresos TF:        ${COP(sumCFIngresos)}`)
  console.log(`Σ egresos TF:         ${COP(sumCFEgresos)}`)
  console.log(`Neto TF:              ${COP(sumCFIngresos - sumCFEgresos)}`)
  console.log(`Δ caja-fuerte:        ${COP(saldoCajaFuerte - (sumCFIngresos - sumCFEgresos))}`)

  // ── 6. Ventas efectivo: detalle completo ────────────────────────────────
  const ventasEfSnap = await db.collection('ventas')
    .where('metodoPago', '==', 'efectivo').get()

  const ventasEf: any[] = []
  for (const d of ventasEfSnap.docs) {
    const v = d.data() as any
    const tf = await db.collection('transacciones_financieras')
      .where('referencia', '==', d.id)
      .where('cuentaId', '==', CUENTA)
      .where('categoria', '==', 'ventas')
      .limit(1).get()

    ventasEf.push({
      consecutivo: Number(v.consecutivo ?? 0),
      ventaId: d.id,
      total: Number(v?.totales?.total ?? 0),
      fecha: toISO(v.fecha),
      turnoId: (v.turnoId as string) ?? 'sin-turno',
      tieneTF: !tf.empty,
    })
  }
  ventasEf.sort((a, b) => a.fecha.localeCompare(b.fecha))

  const sinTF = ventasEf.filter(e => !e.tieneTF)
  const conTF = ventasEf.filter(e => e.tieneTF)
  const huecoTotal = sinTF.reduce((s, e) => s + e.total, 0)

  console.log('\n── 6. Ventas efectivo SIN TF (gap) ───────────────────────────')
  console.log(`Total ventas efectivo: ${ventasEf.length}`)
  console.log(`Con TF:    ${conTF.length}  Σ=${COP(conTF.reduce((s, e) => s + e.total, 0))}`)
  console.log(`Sin TF:    ${sinTF.length}  Σ=${COP(huecoTotal)}`)
  console.table(sinTF.map(e => ({
    consec: e.consecutivo,
    ventaId: e.ventaId.slice(0, 12),
    total: e.total,
    turnoId: e.turnoId.slice(0, 12),
    fecha: e.fecha.slice(0, 19).replace('T', ' '),
  })))

  // ── 7. Análisis cruzado: ¿el efectivo de las 13 ventas ya se trasladó? ──
  // El cierre de turno traslada `totalReportadoEfectivo` (lo que el cajero
  // contó físicamente). Si el cajero contó dinero de ventas pre-integración,
  // ese dinero ya está en caja-fuerte. Acreditar caja-principal Y caja-fuerte
  // sería doble conteo.
  //
  // Para cada venta sin TF, verifico si su turno fue cerrado y cuánto
  // se depositó.

  console.log('\n── 7. Análisis cruzado: ventas sin TF vs turnos ──────────────')

  const turnoMap = new Map(turnosSnap.docs.map(d => [d.id, d.data() as any]))

  let ventasSinTurno = 0
  let ventasConTurnoCerrado = 0
  let montoConTurnoCerrado = 0
  let ventasConTurnoAbierto = 0

  for (const v of sinTF) {
    if (v.turnoId === 'sin-turno') {
      ventasSinTurno++
      console.log(`  Venta #${v.consecutivo} (${COP(v.total)}): sin turno asignado`)
    } else {
      const turno = turnoMap.get(v.turnoId)
      if (turno?.estado === 'cerrado') {
        ventasConTurnoCerrado++
        montoConTurnoCerrado += v.total
        console.log(`  Venta #${v.consecutivo} (${COP(v.total)}): turno ${v.turnoId.slice(0,8)} CERRADO — reportó ${COP(turno.totalReportadoEfectivo || 0)} efectivo`)
      } else {
        ventasConTurnoAbierto++
        console.log(`  Venta #${v.consecutivo} (${COP(v.total)}): turno ${v.turnoId.slice(0,8)} ABIERTO/no encontrado`)
      }
    }
  }

  // ── 8. Traslados por turno: ¿cuánto de las ventas pre-integración ya
  //    fue físicamente depositado a caja-fuerte? ───────────────────────────
  const trasladosCP = movimientos.filter(m => m.categoria === 'traslado' && m.tipo === 'egreso')
  const totalTrasladado = trasladosCP.reduce((s, m) => s + m.monto, 0)

  console.log('\n── 8. Resumen de traslados caja-principal → caja-fuerte ──────')
  console.table(trasladosCP.map(m => ({
    fecha: m.fecha.slice(0, 19).replace('T', ' '),
    monto: m.monto,
    concepto: m.concepto.slice(0, 45),
    turnoRef: m.referencia.slice(0, 10),
  })))
  console.log(`Total trasladado a caja-fuerte: ${COP(totalTrasladado)}`)

  // ── 9. Modelo contable: qué pasó realmente ─────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' 9. ANÁLISIS CONTABLE')
  console.log('══════════════════════════════════════════════════════════════')

  const ingresosTFVentas = movimientos.filter(m => m.categoria === 'ventas' && m.tipo === 'ingreso')
    .reduce((s, m) => s + m.monto, 0)

  console.log(`\nA. Lo que DEBIÓ entrar a caja-principal por ventas efectivo:`)
  console.log(`   Σ todas las ventas efectivo:   ${COP(ventasEf.reduce((s, e) => s + e.total, 0))}`)
  console.log(`   Σ ventas CON TF (integración): ${COP(ingresosTFVentas)}`)
  console.log(`   Σ ventas SIN TF (gap):         ${COP(huecoTotal)}`)

  console.log(`\nB. Lo que SALIÓ de caja-principal:`)
  const egresos = movimientos.filter(m => m.tipo === 'egreso')
  for (const cat of ['traslado', 'gasto_operativo', 'anulacion_venta', 'ajuste_caja']) {
    const sub = egresos.filter(m => m.categoria === cat)
    if (sub.length) console.log(`   ${cat}: ${COP(sub.reduce((s, m) => s + m.monto, 0))} (${sub.length} TF)`)
  }

  console.log(`\nC. Saldo correcto si el gap se corrigiera:`)
  const saldoCorregido = saldoActual + huecoTotal
  console.log(`   Saldo actual:          ${COP(saldoActual)}`)
  console.log(`   + gap ($192.780):      ${COP(huecoTotal)}`)
  console.log(`   = Saldo corregido:     ${COP(saldoCorregido)}`)

  console.log(`\nD. ¿Hay riesgo de doble conteo?`)
  console.log(`   Ventas sin TF con turno 'sin-turno': ${ventasSinTurno}`)
  console.log(`   Ventas sin TF con turno cerrado:     ${ventasConTurnoCerrado} (Σ ${COP(montoConTurnoCerrado)})`)
  console.log(`   Ventas sin TF con turno abierto:     ${ventasConTurnoAbierto}`)
  console.log(`\n   El cierre de turno traslada lo que el cajero CONTÓ físicamente`)
  console.log(`   (totalReportadoEfectivo), NO lo que el sistema calculó.`)
  console.log(`   El dinero físico de las ${sinTF.length} ventas SÍ se recibió en caja y`)
  console.log(`   probablemente se depositó a caja-fuerte en algún cierre.`)
  console.log(`   PERO el saldo digital de caja-principal nunca fue acreditado.`)
  console.log(`   → Acreditar caja-principal corrige el SALDO DIGITAL.`)
  console.log(`   → NO se toca caja-fuerte (el dinero físico ya está ahí).`)
  console.log(`   → NO hay doble conteo si solo se escribe increment(+monto) en caja-principal`)
  console.log(`     + TF de categoría 'ventas'. El saldo de caja-fuerte NO se modifica.`)

  // ── 10. Verificación post-corrección ────────────────────────────────────
  console.log(`\nE. Verificación de coherencia post-corrección:`)
  console.log(`   Saldo caja-principal corregido: ${COP(saldoCorregido)}`)
  console.log(`   Saldo caja-fuerte (no cambia):  ${COP(saldoCajaFuerte)}`)
  console.log(`   Σ sistema efectivo:             ${COP(saldoCorregido + saldoCajaFuerte)}`)

  // JSON report
  const report = {
    generadoEn: new Date().toISOString(),
    fase: 'FASE-9D.1',
    soloLectura: true,
    saldoActualCajaPrincipal: saldoActual,
    saldoReconstruido: running,
    deltaCajaPrincipal: saldoActual - running,
    saldoCajaFuerte,
    deltaCajaFuerte: saldoCajaFuerte - (sumCFIngresos - sumCFEgresos),
    ventasEfectivoTotal: ventasEf.length,
    ventasConTF: conTF.length,
    ventasSinTF: sinTF.length,
    huecoTotal,
    saldoCorregido,
    ventasSinTFDetalle: sinTF,
    turnosCerrados: turnos,
    riesgoDobleConteo: false,
    razon: 'Solo se acredita caja-principal (saldo digital). caja-fuerte no se toca.',
  }
  fs.writeFileSync('audit-fase9d1-report.json', JSON.stringify(report, null, 2))
  console.log('\n📄 JSON escrito en: audit-fase9d1-report.json')

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(' FIN — no se escribió ningún dato en Firestore.')
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().then(() => process.exit(0)).catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
