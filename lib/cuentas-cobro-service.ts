/**
 * cuentas-cobro-service.ts
 *
 * Funciones Firestore para gestionar Cuentas por Cobrar (ventas en fiado).
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDocs,
  runTransaction,
  increment,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { tenantQuery, getEmpresaId, withEmpresaId } from '@/lib/tenant'

export interface CuentaCobro {
  id: string
  // Datos de la venta
  turnoId: string
  cajeroId: string
  clienteNombre: string
  clienteId?: string
  notasFiado?: string
  items: {
    id: string
    nombre: string
    cantidad: number
    precioUnitario: number
    subtotal: number
  }[]
  totales: {
    subtotal: number
    iva: number
    impoconsumo: number
    total: number
  }
  // Estado
  estado: 'pendiente' | 'pagada'
  metodoPago: 'cuenta_cobro'
  metodoPagoFinal?: 'efectivo' | 'transferencia'
  // Fechas
  fecha: { toDate: () => Date } | null
  fechaLimiteDIAN: { toDate: () => Date } | null
  fechaPago?: { toDate: () => Date } | null
}

/**
 * Suscribe en tiempo real a todas las cuentas por cobrar pendientes.
 */
export function suscribirCuentasPorCobrar(
  callback: (cuentas: CuentaCobro[]) => void
): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false

  // orderBy omitido: requeriría índice compuesto de 3 campos en Firestore.
  // Se ordena localmente por fecha descendente.
  tenantQuery(
    collection(db, 'ventas'),
    where('estado', '==', 'pendiente'),
    where('metodoPago', '==', 'cuenta_cobro')
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snap) => {
      const cuentas: CuentaCobro[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CuentaCobro, 'id'>) }))
        .sort((a, b) => {
          const ta = a.fecha?.toDate().getTime() ?? 0
          const tb = b.fecha?.toDate().getTime() ?? 0
          return tb - ta // más reciente primero
        })
      callback(cuentas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}


export async function marcarComoPagada(
  ventaId: string,
  metodoPagoFinal: 'efectivo' | 'transferencia',
  cajeroUid?: string
): Promise<void> {
  const ventaRef = doc(db, 'ventas', ventaId)

  // MT-U3 Capa 3: resuelto UNA sola vez (§2.5) y reutilizado en la consulta
  // de turno y en el estampado dentro de la transacción.
  const empresaId = await getEmpresaId()

  // Buscar turno activo fuera de la transacción (solo lectura, no atómica)
  let turnoRecaudoId: string | undefined
  if (cajeroUid) {
    const qTurno = query(
      collection(db, 'turnos'),
      where('empresaId', '==', empresaId),
      where('cajeroId', '==', cajeroUid),
      where('estado', '==', 'abierto')
    )
    const snap = await getDocs(qTurno)
    if (!snap.empty) turnoRecaudoId = snap.docs[0].id
  }

  await runTransaction(db, async (transaction) => {
    // Leer primero (regla Firestore: reads antes de writes)
    const ventaSnap = await transaction.get(ventaRef)
    if (!ventaSnap.exists()) throw new Error('Venta no encontrada')

    const ventaData = ventaSnap.data()
    if (ventaData.estado !== 'pendiente') {
      throw new Error('Esta cuenta ya fue procesada')
    }

    const total: number = ventaData.totales?.total ?? 0
    const cajeroId: string = ventaData.cajeroId ?? cajeroUid ?? 'unknown'
    const cajeroNombre: string = ventaData.cajeroNombre ?? cajeroId

    // Actualizar la venta
    const updateData: Record<string, any> = {
      estado: 'pagada',
      metodoPagoFinal,
      fechaPago: serverTimestamp(),
    }
    if (turnoRecaudoId) updateData.turnoRecaudoId = turnoRecaudoId
    transaction.update(ventaRef, updateData)

    // Registrar en Finanzas si hay monto
    if (total > 0) {
      const cuentaId = metodoPagoFinal === 'efectivo' ? 'caja-principal' : 'bancolombia'
      const cuentaNombre = metodoPagoFinal === 'efectivo' ? 'Caja Registradora' : 'Bancolombia'

      transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(total) })
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
        cuentaId,
        cuentaNombre,
        tipo: 'ingreso',
        monto: total,
        concepto: `Cobro cuenta: venta #${ventaId}`,
        categoria: 'cuentas_cobro',
        referencia: ventaId,
        usuarioId: cajeroId,
        usuarioNombre: cajeroNombre,
        espacioId: ventaData.espacioId ?? null,
        fecha: serverTimestamp(),
      }))
    }
  })
}

/**
 * Calcula el estado DIAN de una cuenta según su fecha de creación.
 * - 'ok':      < 20h  → hay tiempo
 * - 'warning': 20-24h → facturar pronto
 * - 'danger':  > 24h  → urgente
 */
export function calcularEstadoDIAN(
  fecha: { toDate: () => Date } | null
): 'ok' | 'warning' | 'danger' {
  if (!fecha) return 'ok'
  const horasTranscurridas =
    (Date.now() - fecha.toDate().getTime()) / 1000 / 3600
  if (horasTranscurridas > 24) return 'danger'
  if (horasTranscurridas > 20) return 'warning'
  return 'ok'
}

/**
 * Retorna el tiempo restante formateado para la factura DIAN.
 * Ej: "3h 20m restantes" o "Plazo vencido"
 */
export function tiempoRestanteDIAN(
  fecha: { toDate: () => Date } | null
): string {
  if (!fecha) return ''
  const msRestante = fecha.toDate().getTime() + 24 * 3600 * 1000 - Date.now()
  if (msRestante <= 0) return 'Plazo DIAN vencido'
  const h = Math.floor(msRestante / 1000 / 3600)
  const m = Math.floor((msRestante / 1000 / 60) % 60)
  return `${h}h ${m}m para facturar`
}
