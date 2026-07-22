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
import { tenantQuery, getEmpresaId, withEmpresaId } from '@/lib/tenant'

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

  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5) — dentro de una
  // transacción no puede leerse el token de forma limpia.
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(docRef)
    if (existing.exists()) return // idempotente: ya registrado

    const cajaPrincipalSnap = await transaction.get(cajaPrincipalRef)
    if (!cajaPrincipalSnap.exists()) throw new Error('Cuenta caja-principal no encontrada')

    const saldoDisponible = Number(cajaPrincipalSnap.data().saldo ?? 0)
    if (saldoDisponible < egreso.monto) {
      throw new Error(
        `Fondos insuficientes en Caja Registradora. Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — Monto del egreso: $${egreso.monto.toLocaleString('es-CO')}.`
      )
    }

    transaction.set(docRef, withEmpresaId(empresaId, { ...egreso, id, fecha: serverTimestamp() }))
    transaction.update(cajaPrincipalRef, { saldo: increment(-egreso.monto) })
    transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
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
    }))
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

  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    const egresoSnap = await transaction.get(docRef)
    if (!egresoSnap.exists()) return // no-op

    const data = egresoSnap.data()
    const monto: number = data.monto || 0

    transaction.delete(docRef)

    if (monto > 0) {
      transaction.update(cajaPrincipalRef, { saldo: increment(monto) })
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
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
      }))
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

      // Sort localmente por fecha (descendente)
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
 * Calcula el total de egresos de un turno específico de forma asíncrona (una sola vez)
 *
 * MT-U3 Capa 3: `empresaId` opcional — si el llamador ya lo resolvió como
 * parte de una operación más amplia (p. ej. `cerrarTurno`), lo reutiliza en
 * vez de resolverlo de nuevo (§2.5).
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
