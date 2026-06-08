import { db } from './firebase'
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs, updateDoc, deleteDoc } from 'firebase/firestore'

export interface Reserva {
  id: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  mesaId: string // ID de la sala de reuniones
  espacioId: string // ID del espacio al que pertenece la mesa
  fechaInicio: string // ISO string o timestamp
  fechaFin: string
  estadoPago: 'pendiente' | 'pagado' | 'fallido'
  estadoReserva: 'activa' | 'completada' | 'cancelada'
  montoTotal: number
  referenciaPago: string // Transacción Wompi
  fechaCreacion: string
}

const COLLECTION_NAME = 'reservas'

// ─── LECTURA PARA EL POS ────────────────────────────────────────────────────────

/**
 * Suscribe a las reservas activas del día actual o futuras.
 */
export function suscribirReservasActivas(callback: (reservas: Reserva[]) => void) {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('estadoReserva', '==', 'activa')
  )

  return onSnapshot(q, (snapshot) => {
    const reservas = snapshot.docs.map(d => ({ 
      id: d.id, 
      ...(d.data() as Omit<Reserva, 'id'>) 
    })).sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())
    
    callback(reservas)
  })
}

/**
 * Trae las reservas de una mesa específica para verificar disponibilidad.
 */
export async function getReservasMesa(mesaId: string, fechaDia: string): Promise<Reserva[]> {
  // Nota: Para verificar horarios en un día específico, traemos las de esa mesa
  // Y luego filtramos en el cliente por el día. 
  // En una app más grande haríamos query por rangos de fecha.
  const q = query(
    collection(db, COLLECTION_NAME),
    where('mesaId', '==', mesaId),
    where('estadoReserva', '==', 'activa')
  )
  
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Reserva, 'id'>) }))
}

// ─── ESCRITURA ────────────────────────────────────────────────────────────────

export async function crearReserva(reserva: Omit<Reserva, 'id'>): Promise<string> {
  const newRef = doc(collection(db, COLLECTION_NAME))
  await setDoc(newRef, { ...reserva, id: newRef.id })
  return newRef.id
}

export async function actualizarEstadoPago(reservaId: string, estadoPago: Reserva['estadoPago'], referencia?: string) {
  const updateData: any = { estadoPago }
  if (referencia) updateData.referenciaPago = referencia
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), updateData)
}

export async function cancelarReserva(reservaId: string) {
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), { estadoReserva: 'cancelada' })
}

export async function marcarReservaCompletada(reservaId: string) {
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), { estadoReserva: 'completada' })
}
