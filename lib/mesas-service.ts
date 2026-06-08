import { db } from './firebase'
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc, orderBy } from 'firebase/firestore'

export interface Mesa {
  id: string
  nombre: string
  espacioId: string
  activa: boolean
  orden: number
}

const COLLECTION_NAME = 'mesas'

export function suscribirMesas(espacioId: string, callback: (mesas: Mesa[]) => void) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('espacioId', '==', espacioId),
    where('activa', '==', true)
  )

  return onSnapshot(q, (snapshot) => {
    const mesas = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Mesa, 'id'>) 
    })).sort((a, b) => a.orden - b.orden)
    callback(mesas)
  })
}

export async function guardarMesa(mesa: Omit<Mesa, 'id'> & { id?: string }) {
  const mesaId = mesa.id || doc(collection(db, COLLECTION_NAME)).id
  await setDoc(doc(db, COLLECTION_NAME, mesaId), { ...mesa, id: mesaId }, { merge: true })
}

export async function eliminarMesa(mesaId: string) {
  await deleteDoc(doc(db, COLLECTION_NAME, mesaId))
}
