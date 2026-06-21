import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
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
  const q = query(collection(db, 'cuentas_bancarias'), orderBy('nombre', 'asc'))
  
  return onSnapshot(q, (snapshot) => {
    const cuentas = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CuentaBancaria[]
    callback(cuentas)
  })
}

export function suscribirTransacciones(mes: number, anio: number, callback: (txs: TransaccionFinanciera[]) => void) {
  const inicioMes = Timestamp.fromDate(new Date(anio, mes - 1, 1))
  const finMes = Timestamp.fromDate(new Date(anio, mes, 1))
  const q = query(
    collection(db, 'transacciones_financieras'),
    where('fecha', '>=', inicioMes),
    where('fecha', '<', finMes),
    orderBy('fecha', 'desc')
  )
  
  return onSnapshot(q, (snapshot) => {
    const txs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TransaccionFinanciera[]
    callback(txs)
  })
}

// ----------------------------------------------------------------------------
// Operaciones (Transaccionales para asegurar integridad de saldo)
// ----------------------------------------------------------------------------

export async function registrarTransaccion(tx: Omit<TransaccionFinanciera, 'id' | 'fecha'>) {
  const cuentaRef = doc(db, 'cuentas_bancarias', tx.cuentaId)
  const nuevaTxRef = doc(collection(db, 'transacciones_financieras'))

  await runTransaction(db, async (transaction) => {
    const cuentaDoc = await transaction.get(cuentaRef)
    if (!cuentaDoc.exists()) {
      throw new Error("La cuenta bancaria no existe.")
    }

    const saldoActual = cuentaDoc.data().saldo || 0
    const nuevoSaldo = tx.tipo === 'ingreso' 
      ? saldoActual + tx.monto 
      : saldoActual - tx.monto

    // 1. Actualizar el saldo de la cuenta
    transaction.update(cuentaRef, { saldo: nuevoSaldo })

    // 2. Crear el registro de la transacción
    transaction.set(nuevaTxRef, {
      ...tx,
      fecha: serverTimestamp()
    })
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
  const origenRef = doc(db, 'cuentas_bancarias', params.cuentaOrigenId)
  const destinoRef = doc(db, 'cuentas_bancarias', params.cuentaDestinoId)

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

    // ── Escrituras (commit atómico) ───────────────────────────────────────
    transaction.update(origenRef,  { saldo: saldoOrigen  - params.monto })
    transaction.update(destinoRef, { saldo: saldoDestino + params.monto })

    transaction.set(doc(collection(db, 'transacciones_financieras')), {
      cuentaId:      params.cuentaOrigenId,
      cuentaNombre:  nombreOrigen,
      tipo:          'egreso',
      monto:         params.monto,
      concepto:      `Traslado a ${nombreDestino} — ${params.concepto}`,
      categoria:     'traslado',
      usuarioId:     params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha:         serverTimestamp(),
    })

    transaction.set(doc(collection(db, 'transacciones_financieras')), {
      cuentaId:      params.cuentaDestinoId,
      cuentaNombre:  nombreDestino,
      tipo:          'ingreso',
      monto:         params.monto,
      concepto:      `Traslado desde ${nombreOrigen} — ${params.concepto}`,
      categoria:     'traslado',
      usuarioId:     params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha:         serverTimestamp(),
    })
  })
}

// Seed inicial si no existen cuentas
export async function inicializarCuentasBancarias() {
  const snapshot = await getDocs(collection(db, 'cuentas_bancarias'))
  if (!snapshot.empty) return // Ya hay cuentas

  const cuentasBase: CuentaBancaria[] = [
    { id: 'caja-principal', nombre: 'Caja Registradora', tipo: 'efectivo', saldo: 0, icono: 'Banknote', color: '#10b981' },
    { id: 'bancolombia', nombre: 'Bancolombia', tipo: 'banco', saldo: 0, icono: 'Landmark', color: '#3b82f6' },
    { id: 'caja-fuerte', nombre: 'Caja Fuerte', tipo: 'efectivo', saldo: 0, icono: 'Lock', color: '#f59e0b' }
  ]

  const batch = cuentasBase.map(c => setDoc(doc(db, 'cuentas_bancarias', c.id), { ...c, creadoEn: serverTimestamp() }))
  await Promise.all(batch)
}
