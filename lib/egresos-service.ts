import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  getDocs
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
 * Guarda o actualiza un egreso en Firestore
 */
export async function guardarEgreso(egreso: Omit<Egreso, 'id' | 'fecha'> & { id?: string }) {
  const id = egreso.id || uuidv4()
  const docRef = doc(db, EGRESOS_COLLECTION, id)
  
  await setDoc(docRef, {
    ...egreso,
    id,
    fecha: serverTimestamp(),
  }, { merge: true })
  
  return id
}

/**
 * Elimina un egreso por su ID
 */
export async function eliminarEgreso(id: string) {
  const docRef = doc(db, EGRESOS_COLLECTION, id)
  await deleteDoc(docRef)
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
