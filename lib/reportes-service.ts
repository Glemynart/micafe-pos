import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns'
import { getEmpresaId } from '@/lib/tenant'

export interface ReporteVentas {
  ventasTotales: number
  costoTotal: number
  gananciaBruta: number
  margenBruto: number
  ventasPorVendedor: {
    id: string
    nombre: string
    ventas: number
    total: number
    average: number
    efectivo: number
    transferencia: number
    cuentaCobro: number
    efectivoDeclarado: number
    diferenciaCaja: number
  }[]
  ventasEnElTiempo: {
    fecha: string
    sales: number
  }[]
  rentabilidadProductos: {
    id: string
    name: string
    emoji: string
    unitsSold: number
    revenue: number
    totalCost: number
    profit: number
    marginPercent: number
  }[]
  topProductos: {
    name: string
    sold: number
    revenue: number
  }[]
}

/**
 * Obtiene el rango de fechas basado en el periodo seleccionado
 */
export function obtenerRangoFechas(periodo: string, fechasPersonalizadas?: { inicio: Date, fin: Date }): { inicio: Date, fin: Date } {
  const hoy = new Date()
  switch (periodo) {
    case 'today':
      return { inicio: startOfDay(hoy), fin: endOfDay(hoy) }
    case 'week':
      return { inicio: startOfWeek(hoy, { weekStartsOn: 1 }), fin: endOfWeek(hoy, { weekStartsOn: 1 }) }
    case 'month':
      return { inicio: startOfMonth(hoy), fin: endOfMonth(hoy) }
    case 'custom':
      if (fechasPersonalizadas) return fechasPersonalizadas
      return { inicio: subDays(hoy, 7), fin: endOfDay(hoy) }
    default:
      return { inicio: startOfMonth(hoy), fin: endOfMonth(hoy) }
  }
}

/**
 * Genera el reporte procesando las ventas del periodo
 */
export async function generarReporteVentas(periodo: string, fechasPersonalizadas?: { inicio: Date, fin: Date }, espacioId?: string): Promise<ReporteVentas> {
  const { inicio, fin } = obtenerRangoFechas(periodo, fechasPersonalizadas)

  // MT-U3 Capa 3: resuelto UNA sola vez (§2.5) y reutilizado en las
  // consultas de esta operación (ventas, productos, turnos). `usuarios` es
  // global (§7.2 del diseño) y no lleva `empresaId`.
  const empresaId = await getEmpresaId()

  const ventasRef = collection(db, 'ventas')
  const qVentas = query(
    ventasRef,
    where('empresaId', '==', empresaId),
    ...(espacioId ? [where('espacioId', '==', espacioId)] : []),
    where('estado', '==', 'pagada'),
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'asc')
  )

  const snapVentas = await getDocs(qVentas)
  const ventas = snapVentas.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))

  // Obtener usuarios para cruzar nombres (global, sin empresaId)
  const snapUsuarios = await getDocs(collection(db, 'usuarios'))
  const mapaUsuarios = new Map<string, string>()
  snapUsuarios.docs.forEach(doc => {
    const data = doc.data()
    mapaUsuarios.set(doc.id, data.nombre || 'Usuario Desconocido')
  })
  const snapMembresias = await getDocs(query(collection(db, 'membresias'), where('empresaId', '==', empresaId)))
  const rolesUsuarios = new Map<string, string>()
  snapMembresias.docs.forEach((doc) => {
    const data = doc.data()
    if (data.estado === 'activa' && data.activo === true) rolesUsuarios.set(data.uid, data.rol || '')
  })

  // Obtener productos para tener iconos y nombres reales en caso de que falten
  const snapProductos = await getDocs(query(collection(db, 'productos'), where('empresaId', '==', empresaId)))
  const mapaProductos = new Map<string, any>()
  snapProductos.docs.forEach(doc => {
    mapaProductos.set(doc.id, doc.data())
  })

  // 1. Métricas Globales
  let ventasTotales = 0
  let costoTotal = 0

  // 2. Vendedores
  const vendedoresMap = new Map<string, any>()

  // 3. Ventas en el tiempo (por día o semana)
  const tiempoMap = new Map<string, number>()

  // 4. Rentabilidad por producto
  const productosMap = new Map<string, any>()

  for (const venta of ventas) {
    const totalVenta = venta.totales?.total || 0
    ventasTotales += totalVenta

    // Procesar Vendedor - excluir admin del desglose por cajero
    const cajeroId = venta.cajeroId || 'desconocido'
    const rol = rolesUsuarios.get(cajeroId) || ''

    if (rol !== 'admin') {
      if (!vendedoresMap.has(cajeroId)) {
        vendedoresMap.set(cajeroId, {
          id: cajeroId,
          nombre: mapaUsuarios.get(cajeroId) || 'Desconocido',
          ventas: 0,
          total: 0,
          efectivo: 0,
          transferencia: 0,
          cuentaCobro: 0
        })
      }
      const vendorStat = vendedoresMap.get(cajeroId)
      vendorStat.ventas += 1
      vendorStat.total += totalVenta

      // Metodo de pago: efectivo, transferencia, cuenta de cobro (sin tarjeta)
      const metodoReal = venta.metodoPago === 'cuenta_cobro' && venta.estado === 'pagada'
        ? (venta.metodoPagoFinal || 'efectivo')
        : venta.metodoPago

      // Contar como cuenta de cobro tanto si esta pendiente como pagada
      if (venta.metodoPago === 'cuenta_cobro') vendorStat.cuentaCobro += totalVenta
      else if (metodoReal === 'efectivo') vendorStat.efectivo += totalVenta
      else if (metodoReal === 'transferencia') vendorStat.transferencia += totalVenta

      if (metodoReal === 'mixto' && venta.pagoMixtoDetalle) {
        venta.pagoMixtoDetalle.forEach((p: any) => {
          if (p.metodo === 'efectivo') vendorStat.efectivo += p.monto
          if (p.metodo === 'transferencia') vendorStat.transferencia += p.monto
          if (p.metodo === 'cuenta_cobro') vendorStat.cuentaCobro += p.monto
        })
      }
    }

    // Procesar Fechas para gráfico
    const fechaDate = venta.fecha.toDate()
    // Agrupamos por día si es rango corto, o semana/mes
    const fechaKey = periodo === 'today' ? format(fechaDate, 'HH:00') : format(fechaDate, 'dd MMM')
    tiempoMap.set(fechaKey, (tiempoMap.get(fechaKey) || 0) + totalVenta)

    // Procesar Items (Productos)
    if (venta.items && Array.isArray(venta.items)) {
      for (const item of venta.items) {
        // Ignorar items rápidos que no son del inventario si no queremos tracking
        // o los trackeamos genéricamente.
        
        // Uso de costo histórico
        const unitCost = item.costoUnitario || 0
        const qty = item.cantidad || 1
        const revenue = item.subtotal || (item.precioUnitario * qty)
        const cost = unitCost * qty

        costoTotal += cost

        const prodId = item.id
        if (!productosMap.has(prodId)) {
          const pInfo = mapaProductos.get(prodId)
          productosMap.set(prodId, {
            id: prodId,
            name: item.nombre || pInfo?.nombre || 'Producto Custom',
            emoji: pInfo?.icono || 'Package',
            unitsSold: 0,
            revenue: 0,
            totalCost: 0
          })
        }
        
        const pStat = productosMap.get(prodId)
        pStat.unitsSold += qty
        pStat.revenue += revenue
        pStat.totalCost += cost
      }
    }
  }

  const gananciaBruta = ventasTotales - costoTotal
  const margenBruto = ventasTotales > 0 ? (gananciaBruta / ventasTotales) * 100 : 0

  // Cruce con turnos: efectivo declarado vs efectivo vendido
  const qTurnos = query(
    collection(db, 'turnos'),
    where('empresaId', '==', empresaId),
    where('fechaApertura', '>=', Timestamp.fromDate(inicio)),
    where('fechaApertura', '<=', Timestamp.fromDate(fin))
  )
  const snapTurnos = await getDocs(qTurnos)
  const efectivoPorCajero = new Map<string, number>()
  snapTurnos.docs.forEach(doc => {
    const t = doc.data()
    const cajeroId = t.cajeroId
    if (!cajeroId) return
    const declarado = t.totalReportadoEfectivo || 0
    const existente = efectivoPorCajero.get(cajeroId) || 0
    efectivoPorCajero.set(cajeroId, existente + Number(declarado))
  })

  // Formatear Vendedores
  const ventasPorVendedor = Array.from(vendedoresMap.values()).map(v => {
    const declarado = efectivoPorCajero.get(v.id) || 0
    return {
      ...v,
      efectivoDeclarado: declarado,
      diferenciaCaja: declarado - v.efectivo,
      average: v.ventas > 0 ? v.total / v.ventas : 0
    }
  }).sort((a, b) => b.total - a.total)

  // Formatear Tiempo
  // Generar un rango fijo para fechas sin ventas para que no queden huecos
  const ventasEnElTiempo = Array.from(tiempoMap.entries()).map(([fecha, sales]) => ({
    fecha, sales
  }))

  // Formatear Rentabilidad
  const rentabilidadProductos = Array.from(productosMap.values()).map(p => {
    const profit = p.revenue - p.totalCost
    const marginPercent = p.revenue > 0 ? (profit / p.revenue) * 100 : 0
    return {
      ...p,
      profit,
      marginPercent
    }
  }).sort((a, b) => b.profit - a.profit)

  // Top Productos por cantidad vendida
  const topProductos = [...rentabilidadProductos].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5).map(p => ({
    name: p.name,
    sold: p.unitsSold,
    revenue: p.revenue
  }))

  return {
    ventasTotales,
    costoTotal,
    gananciaBruta,
    margenBruto,
    ventasPorVendedor,
    ventasEnElTiempo,
    rentabilidadProductos,
    topProductos
  }
}
