/**
 * liquidaciones-service.ts
 *
 * Firestore CRUD para la colección `liquidaciones`.
 * Una liquidación registra el cierre de cuentas con un consignador
 * por un período determinado.
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
import { tenantQuery, stampEmpresaId } from '@/lib/tenant'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LiquidacionItem {
  productoId: string
  productoNombre: string
  unidades: number       // vendidas en el período
  precioUnitario: number
  subtotal: number       // unidades × precio
}

export interface Liquidacion {
  id: string
  consignadorId: string
  consignadorNombre: string
  fechaInicio: { toDate: () => Date } | null
  fechaFin: { toDate: () => Date } | null
  items: LiquidacionItem[]
  totalVentas: number    // suma de subtotales
  comisionPct: number    // % del negocio
  comisionMonto: number  // totalVentas × comisionPct / 100
  montoAPagar: number    // totalVentas − comisionMonto
  estado: 'pendiente' | 'pagada'
  creadoEn: unknown
}

export type LiquidacionInput = Omit<Liquidacion, 'id' | 'creadoEn'>

// ─── Lectura ─────────────────────────────────────────────────────────────────

export function suscribirLiquidaciones(
  consignadorId: string,
  callback: (liquidaciones: Liquidacion[]) => void
): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(collection(db, 'liquidaciones'), where('consignadorId', '==', consignadorId)).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snap) => {
      const data: Liquidacion[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Liquidacion, 'id'>) }))
        .sort((a, b) => {
          const ta = a.creadoEn instanceof Object && 'toDate' in (a.creadoEn as object)
            ? (a.creadoEn as { toDate: () => Date }).toDate().getTime() : 0
          const tb = b.creadoEn instanceof Object && 'toDate' in (b.creadoEn as object)
            ? (b.creadoEn as { toDate: () => Date }).toDate().getTime() : 0
          return tb - ta
        })
      callback(data)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

export function suscribirTodasLiquidaciones(
  callback: (liquidaciones: Liquidacion[]) => void
): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(collection(db, 'liquidaciones')).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snap) => {
      const data: Liquidacion[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Liquidacion, 'id'>) }))
      callback(data)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export async function crearLiquidacion(data: LiquidacionInput): Promise<string> {
  const ref = await addDoc(collection(db, 'liquidaciones'), await stampEmpresaId({
    ...data,
    creadoEn: serverTimestamp(),
  }))
  return ref.id
}

export async function marcarLiquidacionPagada(id: string): Promise<void> {
  await updateDoc(doc(db, 'liquidaciones', id), {
    estado: 'pagada',
    pagadoEn: serverTimestamp(),
  })
}
