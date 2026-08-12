import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  getDocs,
} from 'firebase/firestore'
import { db } from './firebase'
import { getFirebaseFunctions } from './firebase'
import { httpsCallable } from 'firebase/functions'
import { tenantQuery, getEmpresaId } from '@/lib/tenant'

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
 * Registra un egreso únicamente mediante el command server-authoritative.
 * La operación crea el egreso y su movimiento financiero de forma atómica.
 */
export async function guardarEgreso(egreso: Omit<Egreso, 'id' | 'fecha'> & { id?: string }) {
  const response = await httpsCallable(getFirebaseFunctions(), 'registrarEgresoOperativoV1')({
    commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(), causationId: null,
    motivo: egreso.motivo, payload: { cuentaClaveOperativa: 'caja-principal', turnoId: egreso.turnoId, monto: egreso.monto },
  })
  return (response.data as { egresoId: string }).egresoId
}

/**
 * Suscribirse a los egresos de un turno específico en tiempo real.
 * Los egresos son append-only en el cliente; una corrección requiere soporte
 * y una operación backend canónica auditada.
 */
export function suscribirEgresosPorTurno(turnoId: string, callback: (egresos: Egreso[]) => void) {
  if (!turnoId) {
    callback([])
    return () => {}
  }

  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, EGRESOS_COLLECTION),
    where('turnoId', '==', turnoId)
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const egresos = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        fecha: doc.data().fecha?.toDate() || new Date()
      })) as Egreso[]

      egresos.sort((a, b) => (b.fecha as unknown as Date).getTime() - (a.fecha as unknown as Date).getTime())

      callback(egresos)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

/**
 * Calcula el total de egresos de un turno específico de forma asíncrona.
 * `empresaId` puede reutilizarse cuando el llamador ya lo resolvió.
 */
export async function calcularEgresosTurno(turnoId: string, empresaId?: string): Promise<number> {
  if (!turnoId) return 0

  const empresaIdResuelto = empresaId ?? (await getEmpresaId())
  const q = query(
    collection(db, EGRESOS_COLLECTION),
    where('empresaId', '==', empresaIdResuelto),
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
