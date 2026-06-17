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

// Seed inicial si no existen cuentas
export async function inicializarCuentasBancarias() {
  const snapshot = await getDocs(collection(db, 'cuentas_bancarias'))
  if (!snapshot.empty) return // Ya hay cuentas

  const cuentasBase: CuentaBancaria[] = [
    { id: 'caja-principal', nombre: 'Caja Registradora', tipo: 'efectivo', saldo: 0, icono: 'Banknote', color: '#10b981' },
    { id: 'bancolombia', nombre: 'Bancolombia', tipo: 'banco', saldo: 0, icono: 'Landmark', color: '#3b82f6' },
    { id: 'nequi', nombre: 'Nequi', tipo: 'banco', saldo: 0, icono: 'Smartphone', color: '#8b5cf6' },
    { id: 'caja-fuerte', nombre: 'Caja Fuerte', tipo: 'efectivo', saldo: 0, icono: 'Lock', color: '#f59e0b' }
  ]

  const batch = cuentasBase.map(c => setDoc(doc(db, 'cuentas_bancarias', c.id), { ...c, creadoEn: serverTimestamp() }))
  await Promise.all(batch)
}
