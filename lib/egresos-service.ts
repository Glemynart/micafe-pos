import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  getDocs,
  runTransaction,
  increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { v4 as uuidv4 } from 'uuid'

export interface Egreso {
  id: string;
  monto: number;
  motivo: string;
  fecha: Timestamp;
  turnoId: string;
  cajeroId: string;
  cajeroNombre: string;
}

const EGRESOS_COLLECTION = 'egresos'

/**
 * Guarda un egreso en Firestore y registra el movimiento financiero.
 * Idempotente: si el documento ya existe (mismo ID), no duplica el movimiento.
 */
export async function guardarEgreso(egreso: Omit<Egreso, 'id' | 'fecha'> & { id?: string }) {
  const id = egreso.id || uuidv4()
  const docRef = doc(db, EGRESOS_COLLECTION, id)
  const cajaPrincipalRef = doc(db, 'cuentas_bancarias', 'caja-principal')

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(docRef)
    if (existing.exists()) return // idempotente: ya registrado

    const cajaPrincipalSnap = await transaction.get(cajaPrincipalRef)
    if (!cajaPrincipalSnap.exists()) throw new Error('Cuenta caja-principal no encontrada')

    transaction.set(docRef, { ...egreso, id, fecha: serverTimestamp() })
    transaction.update(cajaPrincipalRef, { saldo: increment(-egreso.monto) })
    transaction.set(doc(collection(db, 'transacciones_financieras')), {
      cuentaId: 'caja-principal',
      cuentaNombre: 'Caja Registradora',
      tipo: 'egreso',
      monto: egreso.monto,
      concepto: `Gasto: ${egreso.motivo}`,
      categoria: 'gasto_operativo',
      referencia: id,
      usuarioId: egreso.cajeroId,
      usuarioNombre: egreso.cajeroNombre,
      fecha: serverTimestamp(),
    })
  })

  return id
}

/**
 * Elimina un egreso y revierte su movimiento financiero en caja-principal.
 * No-op si el documento no existe.
 */
export async function eliminarEgreso(id: string) {
  const docRef = doc(db, EGRESOS_COLLECTION, id)
  const cajaPrincipalRef = doc(db, 'cuentas_bancarias', 'caja-principal')

  await runTransaction(db, async (transaction) => {
    const egresoSnap = await transaction.get(docRef)
    if (!egresoSnap.exists()) return // no-op

    const data = egresoSnap.data()
    const monto: number = data.monto || 0

    transaction.delete(docRef)

    if (monto > 0) {
      transaction.update(cajaPrincipalRef, { saldo: increment(monto) })
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
        cuentaId: 'caja-principal',
        cuentaNombre: 'Caja Registradora',
        tipo: 'ingreso',
        monto,
        concepto: `Anulación gasto: ${data.motivo || ''}`,
        categoria: 'anulacion_egreso',
        referencia: id,
        usuarioId: data.cajeroId || '',
        usuarioNombre: data.cajeroNombre || '',
        fecha: serverTimestamp(),
      })
    }
  })
}

/**
 * Suscribirse a los egresos de un turno especfico en tiempo real
 */
export function suscribirEgresosPorTurno(turnoId: string, callback: (egresos: Egreso[]) => void) {
  if (!turnoId) {
    callback([])
    return () => {}
  }

  const q = query(
    collection(db, EGRESOS_COLLECTION),
    where('turnoId', '==', turnoId)
  )

  return onSnapshot(q, (snapshot) => {
    const egresos = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      fecha: doc.data().fecha?.toDate() || new Date()
    })) as Egreso[]
    
    // Sort localmente por fecha (descendente)
    egresos.sort((a, b) => (b.fecha as unknown as Date).getTime() - (a.fecha as unknown as Date).getTime())
    
    callback(egresos)
  })
}

/**
 * Calcula el total de egresos de un turno específico de forma asíncrona (una sola vez)
 */
export async function calcularEgresosTurno(turnoId: string): Promise<number> {
  if (!turnoId) return 0
  
  const q = query(
    collection(db, EGRESOS_COLLECTION),
    where('turnoId', '==', turnoId)
  )
  
  const snapshot = await getDocs(q)
  
  let total = 0
  snapshot.forEach(doc => {
    const data = doc.data()
    total += data.monto || 0
  })
  
  return total
}
