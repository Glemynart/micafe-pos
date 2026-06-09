import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns'

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
    cash: number
    card: number
    transfer: number
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

  const ventasRef = collection(db, 'ventas')
  const qVentas = query(
    ventasRef,
    where('fecha', '>=', Timestamp.fromDate(inicio)),
    where('fecha', '<=', Timestamp.fromDate(fin)),
    orderBy('fecha', 'asc')
  )

  const snapVentas = await getDocs(qVentas)
  const ventas = snapVentas.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))

  // Obtener usuarios para cruzar nombres
  const snapUsuarios = await getDocs(collection(db, 'usuarios'))
  const mapaUsuarios = new Map<string, string>()
  snapUsuarios.docs.forEach(doc => {
    mapaUsuarios.set(doc.id, doc.data().nombre || 'Usuario Desconocido')
  })

  // Obtener productos para tener iconos y nombres reales en caso de que falten
  const snapProductos = await getDocs(collection(db, 'productos'))
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
    // Si queremos filtrar por espacio específico (ej. "Cafetería" vs "Librería")
    // asumiendo que los items en su mayoría pertenecen al espacio activo, o la venta tiene un espacioId
    // Nota: El sistema de ventas actual de pronto no guarda espacioId en la cabecera.

    const totalVenta = venta.totales?.total || 0
    ventasTotales += totalVenta

    // Procesar Vendedor
    const cajeroId = venta.cajeroId || 'desconocido'
    if (!vendedoresMap.has(cajeroId)) {
      vendedoresMap.set(cajeroId, {
        id: cajeroId,
        nombre: mapaUsuarios.get(cajeroId) || 'Desconocido',
        ventas: 0,
        total: 0,
        cash: 0,
        card: 0,
        transfer: 0
      })
    }
    const vendorStat = vendedoresMap.get(cajeroId)
    vendorStat.ventas += 1
    vendorStat.total += totalVenta

    // Método de pago (evaluar si es cuenta de cobro pagada)
    const metodoReal = venta.metodoPago === 'cuenta_cobro' && venta.estado === 'pagada'
      ? (venta.metodoPagoFinal || 'efectivo')
      : venta.metodoPago

    if (metodoReal === 'efectivo') vendorStat.cash += totalVenta
    if (metodoReal === 'transferencia') vendorStat.transfer += totalVenta
    if (metodoReal === 'tarjeta') vendorStat.card += totalVenta // asumiendo que agreguen tarjeta
    if (metodoReal === 'mixto' && venta.pagoMixtoDetalle) {
      venta.pagoMixtoDetalle.forEach((p: any) => {
        if (p.metodo === 'efectivo') vendorStat.cash += p.monto
        if (p.metodo === 'transferencia') vendorStat.transfer += p.monto
        if (p.metodo === 'tarjeta') vendorStat.card += p.monto
      })
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
    where('fechaApertura', '>=', Timestamp.fromDate(inicio)),
    where('fechaApertura', '<=', Timestamp.fromDate(fin))
  )
  const snapTurnos = await getDocs(qTurnos)
  const efectivoPorCajero = new Map<string, number>()
  snapTurnos.docs.forEach(doc => {
    const t = doc.data()
    const cajeroId = t.cajeroId
    if (!cajeroId) return
    const declarado = t.efectivoCierre || t.montoEfectivoCierre || t.efectivoFinal || 0
    const existente = efectivoPorCajero.get(cajeroId) || 0
    efectivoPorCajero.set(cajeroId, existente + Number(declarado))
  })

  // Formatear Vendedores
  const ventasPorVendedor = Array.from(vendedoresMap.values()).map(v => {
    const declarado = efectivoPorCajero.get(v.id) || 0
    return {
      ...v,
      efectivoDeclarado: declarado,
      diferenciaCaja: declarado - v.cash,
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
