import {
  collection,
  getDocs,
  orderBy,
  onSnapshot,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db, getFirebaseFunctions } from './firebase'
import { httpsCallable } from 'firebase/functions'
import { tenantQuery } from '@/lib/tenant'

export interface CuentaBancaria {
  id: string
  claveOperativa: string
  nombre: string
  tipo: 'banco' | 'efectivo'
  saldo: number
  icono: string
  color: string
  creadoEn?: any
}

export interface TransaccionFinanciera {
  id?: string
  cuentaId: string
  cuentaClaveOperativa: string
  cuentaNombre: string
  tipo: 'ingreso' | 'egreso'
  monto: number
  concepto: string
  categoria: string
  referencia?: string
  usuarioId: string
  usuarioNombre: string
  usuarioNombreSnapshot?: string
  espacioId?: string
  fecha?: any
}

export function suscribirCuentasBancarias(callback: (cuentas: CuentaBancaria[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(collection(db, 'cuentas_bancarias'), orderBy('nombre', 'asc')).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const cuentas = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as CuentaBancaria[]
      callback(cuentas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

export function suscribirTransacciones(mes: number, anio: number, callback: (txs: TransaccionFinanciera[]) => void) {
  const inicioMes = Timestamp.fromDate(new Date(anio, mes - 1, 1))
  const finMes = Timestamp.fromDate(new Date(anio, mes, 1))
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, 'transacciones_financieras'),
    where('fecha', '>=', inicioMes),
    where('fecha', '<', finMes),
    orderBy('fecha', 'desc'),
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as TransaccionFinanciera[]
      callback(txs)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

// Los comandos financieros reciben solo la clave lógica; el ID físico queda
// reservado para snapshots históricos y no participa en la resolución.
export async function registrarTransaccion(
  tx: Omit<TransaccionFinanciera, 'id' | 'fecha' | 'cuentaId'>,
) {
  await httpsCallable(getFirebaseFunctions(), 'registrarMovimientoFinancieroV1')({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    causationId: null,
    motivo: tx.concepto,
    payload: {
      cuentaClaveOperativa: tx.cuentaClaveOperativa,
      monto: tx.monto,
      tipo: tx.tipo,
      categoria: tx.categoria,
      turnoId: null,
    },
  })
}

export async function trasladarEntreCuentas(params: {
  cuentaOrigenClaveOperativa: string
  cuentaDestinoClaveOperativa: string
  monto: number
  concepto: string
  usuarioId: string
  usuarioNombre: string
}): Promise<void> {
  await httpsCallable(getFirebaseFunctions(), 'trasladarEntreCuentasV1')({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    causationId: null,
    motivo: params.concepto,
    payload: {
      cuentaOrigenClaveOperativa: params.cuentaOrigenClaveOperativa,
      cuentaDestinoClaveOperativa: params.cuentaDestinoClaveOperativa,
      monto: params.monto,
      turnoId: null,
    },
  })
}

/** Solo verifica cuentas del tenant; la provisión pertenece a Bootstrap/backend. */
export async function inicializarCuentasBancarias(): Promise<void> {
  const snapshot = await getDocs(await tenantQuery(collection(db, 'cuentas_bancarias')))
  if (snapshot.empty) return
}
