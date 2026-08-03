import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  Timestamp
} from 'firebase/firestore'
import { db } from './firebase'
import { getFirebaseFunctions } from './firebase'
import { httpsCallable } from 'firebase/functions'
import { tenantQuery, getEmpresaId, withEmpresaId } from '@/lib/tenant'

export interface CuentaBancaria {
  id: string
  nombre: string // Ej: Bancolombia, Nequi, Caja Registradora
  tipo: 'banco' | 'efectivo'
  saldo: number
  icono: string // Ej: 'Landmark', 'Wallet', 'Banknote'
  color: string // Ej: 'bg-blue-500', 'bg-purple-500'
  creadoEn?: any
}

export interface TransaccionFinanciera {
  id?: string
  cuentaId: string
  cuentaNombre: string
  tipo: 'ingreso' | 'egreso'
  monto: number
  concepto: string
  categoria: string // Ej: 'ventas', 'nomina', 'servicios', 'proveedores', 'traslado'
  referencia?: string // Ej: Comprobante o ID de venta
  usuarioId: string
  usuarioNombre: string
  espacioId?: string // Opcional, si el gasto pertenece a un espacio
  fecha?: any
}

// ----------------------------------------------------------------------------
// Suscripciones
// ----------------------------------------------------------------------------

export function suscribirCuentasBancarias(callback: (cuentas: CuentaBancaria[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(collection(db, 'cuentas_bancarias'), orderBy('nombre', 'asc')).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const cuentas = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
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
    orderBy('fecha', 'desc')
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TransaccionFinanciera[]
      callback(txs)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

// ----------------------------------------------------------------------------
// Operaciones (Transaccionales para asegurar integridad de saldo)
// ----------------------------------------------------------------------------

export async function registrarTransaccion(tx: Omit<TransaccionFinanciera, 'id' | 'fecha'>) {
  await httpsCallable(getFirebaseFunctions(), 'registrarMovimientoFinancieroV1')({
    commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(), causationId: null,
    motivo: tx.concepto, payload: { cuentaId: tx.cuentaId, monto: tx.monto, tipo: tx.tipo, categoria: tx.categoria, turnoId: null },
  })
  return
  const cuentaRef = doc(db, 'cuentas_bancarias', tx.cuentaId)
  const nuevaTxRef = doc(collection(db, 'transacciones_financieras'))

  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    const cuentaDoc = await transaction.get(cuentaRef)
    if (!cuentaDoc.exists()) {
      throw new Error("La cuenta bancaria no existe.")
    }

    const saldoActual = cuentaDoc.data().saldo || 0

    if (tx.tipo === 'egreso' && saldoActual < tx.monto) {
      throw new Error(
        `Fondos insuficientes en ${cuentaDoc.data().nombre || tx.cuentaId}. Saldo disponible: $${saldoActual.toLocaleString('es-CO')} — Monto de la transacción: $${tx.monto.toLocaleString('es-CO')}.`
      )
    }

    const nuevoSaldo = tx.tipo === 'ingreso' 
      ? saldoActual + tx.monto 
      : saldoActual - tx.monto

    // 1. Actualizar el saldo de la cuenta
    transaction.update(cuentaRef, { saldo: nuevoSaldo })

    // 2. Crear el registro de la transacción
    transaction.set(nuevaTxRef, withEmpresaId(empresaId, {
      ...tx,
      fecha: serverTimestamp()
    }))
  })
}

/**
 * Traslado atómico entre dos cuentas bancarias.
 * Debito de origen + crédito de destino + dos registros de transacción
 * ocurren en un único runTransaction: si cualquier escritura falla,
 * Firestore revierte todo sin dejar estados inconsistentes.
 */
export async function trasladarEntreCuentas(params: {
  cuentaOrigenId: string
  cuentaDestinoId: string
  monto: number
  concepto: string
  usuarioId: string
  usuarioNombre: string
}): Promise<void> {
  await httpsCallable(getFirebaseFunctions(), 'trasladarEntreCuentasV1')({
    commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(), causationId: null,
    motivo: params.concepto, payload: { cuentaOrigenId: params.cuentaOrigenId, cuentaDestinoId: params.cuentaDestinoId, monto: params.monto, turnoId: null },
  })
  return
  const origenRef = doc(db, 'cuentas_bancarias', params.cuentaOrigenId)
  const destinoRef = doc(db, 'cuentas_bancarias', params.cuentaDestinoId)

  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    // ── Lecturas (todas antes de cualquier escritura) ─────────────────────
    const origenSnap = await transaction.get(origenRef)
    if (!origenSnap.exists()) throw new Error('La cuenta de origen no existe.')

    const destinoSnap = await transaction.get(destinoRef)
    if (!destinoSnap.exists()) throw new Error('La cuenta de destino no existe.')

    const saldoOrigen  = origenSnap.data().saldo  || 0
    const saldoDestino = destinoSnap.data().saldo || 0
    const nombreOrigen  = origenSnap.data().nombre  as string
    const nombreDestino = destinoSnap.data().nombre as string

    if (saldoOrigen < params.monto) {
      throw new Error(
        `Fondos insuficientes en ${nombreOrigen}. Saldo disponible: $${saldoOrigen.toLocaleString('es-CO')} — Monto a trasladar: $${params.monto.toLocaleString('es-CO')}.`
      )
    }

    // ── Escrituras (commit atómico) ───────────────────────────────────────
    transaction.update(origenRef,  { saldo: saldoOrigen  - params.monto })
    transaction.update(destinoRef, { saldo: saldoDestino + params.monto })

    transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
      cuentaId:      params.cuentaOrigenId,
      cuentaNombre:  nombreOrigen,
      tipo:          'egreso',
      monto:         params.monto,
      concepto:      `Traslado a ${nombreDestino} — ${params.concepto}`,
      categoria:     'traslado',
      usuarioId:     params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha:         serverTimestamp(),
    }))

    transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
      cuentaId:      params.cuentaDestinoId,
      cuentaNombre:  nombreDestino,
      tipo:          'ingreso',
      monto:         params.monto,
      concepto:      `Traslado desde ${nombreOrigen} — ${params.concepto}`,
      categoria:     'traslado',
      usuarioId:     params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha:         serverTimestamp(),
    }))
  })
}

/**
 * Verifica la existencia de cuentas del tenant sin mutar Firestore.
 *
 * La provisión de cuentas pertenece a Bootstrap/backend. El cliente no puede
 * crear cuentas ni usar IDs históricos como fallback, porque Rules lo bloquea.
 */
export async function inicializarCuentasBancarias(): Promise<void> {
  const snapshot = await getDocs(await tenantQuery(collection(db, 'cuentas_bancarias')))
  if (snapshot.empty) return
}
