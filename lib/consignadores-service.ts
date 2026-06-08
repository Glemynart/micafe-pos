/**
 * consignadores-service.ts
 *
 * Firestore CRUD para la colección `consignadores`.
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Consignador {
  id: string
  nombre: string
  cedula: string
  telefono: string
  /** Porcentaje que se queda el NEGOCIO (0–100). Ej: 30 → negocio 30%, consignador 70% */
  comisionPct: number
  activo: boolean
  creadoEn: unknown
}

export type ConsignadorInput = Pick<
  Consignador,
  'nombre' | 'cedula' | 'telefono' | 'comisionPct'
>

// ─── Lectura ─────────────────────────────────────────────────────────────────

export function suscribirConsignadores(
  callback: (consignadores: Consignador[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'consignadores'),
    where('activo', '==', true)
  )
  return onSnapshot(q, (snap) => {
    const data: Consignador[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Consignador, 'id'>) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    callback(data)
  })
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export async function crearConsignador(data: ConsignadorInput): Promise<string> {
  const ref = await addDoc(collection(db, 'consignadores'), {
    ...data,
    activo: true,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarConsignador(
  id: string,
  data: Partial<ConsignadorInput>
): Promise<void> {
  await updateDoc(doc(db, 'consignadores', id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarConsignador(id: string): Promise<void> {
  await updateDoc(doc(db, 'consignadores', id), { activo: false })
}
