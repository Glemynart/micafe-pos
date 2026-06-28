import { db } from './firebase'
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc, orderBy, updateDoc } from 'firebase/firestore'

export interface Mesa {
  id: string
  nombre: string
  espacioId: string
  activa: boolean
  orden: number
  // FASE-14 PR1: posición en el lienzo lógico (ul). Anchor = CENTRO geométrico.
  posX?: number
  posY?: number
  // Reservados (no usados en PR1)
  width?: number
  height?: number
  shape?: 'rect' | 'square' | 'circle'
  rotation?: number
  zIndex?: number
  sectorId?: string | null
  grupoId?: string | null
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

export async function actualizarPosicionMesa(mesaId: string, posX: number, posY: number) {
  await updateDoc(doc(db, COLLECTION_NAME, mesaId), { posX, posY })
}
