/**
 * Adaptador cliente para cuentas por cobrar operativas.
 *
 * La lectura de pendientes es tenant-aware. La liquidación solo expresa la
 * intención al backend; no escribe ventas, saldos ni movimientos financieros.
 */

import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, getFirebaseFunctions } from '@/lib/firebase'
import { tenantQuery } from '@/lib/tenant'

export interface CuentaCobro {
  id: string
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
  estado: 'pendiente' | 'pagada'
  metodoPago: 'cuenta_cobro'
  metodoPagoFinal?: 'efectivo' | 'transferencia'
  fecha: { toDate: () => Date } | null
  /** Legacy de lectura; no participa en la liquidación ni se muestra como plazo DIAN. */
  fechaLimiteDIAN: { toDate: () => Date } | null
  fechaPago?: { toDate: () => Date } | null
}

export interface ResultadoLiquidacionCuentaCobro {
  commandId: string
  ventaId: string
  liquidacionId: string
  movimientoId: string
  cuentaDocumentoId: string
  cuentaClaveOperativa: 'caja-principal' | 'bancolombia'
  metodoPagoFinal: 'efectivo' | 'transferencia'
  turnoRecaudoId: string | null
}

/** Suscribe en tiempo real únicamente las ventas pendientes del tenant activo. */
export function suscribirCuentasPorCobrar(
  callback: (cuentas: CuentaCobro[]) => void,
): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, 'ventas'),
    where('estadoOperativo', '==', 'COMPLETO'),
    where('estado', '==', 'pendiente'),
    where('metodoPago', '==', 'cuenta_cobro'),
  ).then((consulta) => {
    if (cancelado) return
    unsubscribe = onSnapshot(consulta, (snap) => {
      const cuentas: CuentaCobro[] = snap.docs
        .map((documento) => ({ id: documento.id, ...(documento.data() as Omit<CuentaCobro, 'id'>) }))
        .sort((a, b) => {
          const ta = a.fecha?.toDate().getTime() ?? 0
          const tb = b.fecha?.toDate().getTime() ?? 0
          return tb - ta
        })
      callback(cuentas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

/**
 * Solicita al backend la liquidación completa e idempotente de una cuenta.
 * El tercer parámetro se conserva por compatibilidad con los consumidores
 * existentes, pero el actor y el turno son autoridad del servidor.
 */
export async function marcarComoPagada(
  ventaId: string,
  metodoPagoFinal: 'efectivo' | 'transferencia',
  _cajeroUid?: string,
): Promise<ResultadoLiquidacionCuentaCobro> {
  const commandId = `liquidar-cuenta-cobro:${ventaId}`
  const ejecutar = httpsCallable<{
    commandId: string
    idempotencyKey: string
    correlationId: string
    causationId: string
    motivo: string
    payload: {
      ventaId: string
      metodoPagoFinal: 'efectivo' | 'transferencia'
    }
  }, ResultadoLiquidacionCuentaCobro>(getFirebaseFunctions(), 'liquidarCuentaCobroV1')

  const respuesta = await ejecutar({
    commandId,
    idempotencyKey: commandId,
    correlationId: `corr-${commandId}`,
    causationId: `venta:${ventaId}`,
    motivo: 'CUENTA_COBRO_LIQUIDACION',
    payload: { ventaId, metodoPagoFinal },
  })
  return respuesta.data
}
