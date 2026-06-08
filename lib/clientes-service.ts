/**
 * clientes-service.ts
 *
 * Firestore CRUD para la colección `clientes`.
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Cliente {
  id: string
  nombre: string
  cedula: string       // Cédula o NIT
  telefono: string
  activo: boolean
  creadoEn: unknown
}

export type ClienteInput = Pick<Cliente, 'nombre' | 'cedula' | 'telefono'>

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Suscribe en tiempo real a todos los clientes activos, ordenados por nombre.
 */
export function suscribirClientes(
  callback: (clientes: Cliente[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'clientes'),
    where('activo', '==', true)
    // Nota: orderBy se omite para no requerir índice compuesto en Firestore.
    // El ordenamiento se hace localmente abajo.
  )
  return onSnapshot(q, (snap) => {
    const clientes: Cliente[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Cliente, 'id'>) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    callback(clientes)
  })
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo cliente en Firestore.
 */
export async function crearCliente(data: ClienteInput): Promise<string> {
  const ref = await addDoc(collection(db, 'clientes'), {
    ...data,
    activo: true,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

/**
 * Edita los datos de un cliente existente.
 */
export async function actualizarCliente(
  id: string,
  data: Partial<ClienteInput>
): Promise<void> {
  await updateDoc(doc(db, 'clientes', id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  })
}

/**
 * Elimina (soft delete) un cliente.
 */
export async function eliminarCliente(id: string): Promise<void> {
  await updateDoc(doc(db, 'clientes', id), { activo: false })
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Filtra una lista de clientes por cédula o nombre (búsqueda local).
 */
export function filtrarClientes(clientes: Cliente[], texto: string): Cliente[] {
  const q = texto.toLowerCase().trim()
  if (!q) return clientes
  return clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(q) ||
      c.cedula.includes(q) ||
      c.telefono.includes(q)
  )
}
