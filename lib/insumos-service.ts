/**
 * insumos-service.ts
 *
 * Funciones Firestore para leer / crear / editar / eliminar Insumos (materia prima).
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Insumo {
  id: string;
  nombre: string;
  costo: number;
  stock: number;
  unidadMedida: string; // ej. "gr", "ml", "und"
  stockMinimo: number;
  espacioId: string;
  activo: boolean;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type InsumoInput = Omit<Insumo, "id" | "creadoEn" | "actualizadoEn">;

export function suscribirInsumos(
  espacioId: string,
  callback: (insumos: Insumo[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "insumos"),
    where("espacioId", "==", espacioId),
    where("activo", "==", true)
  );

  return onSnapshot(q, (snap) => {
    const insumos: Insumo[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Insumo, "id">),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    callback(insumos);
  });
}

export async function crearInsumo(data: InsumoInput): Promise<string> {
  const ref = await addDoc(collection(db, "insumos"), {
    ...data,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

export async function editarInsumo(id: string, data: Partial<InsumoInput>): Promise<void> {
  await updateDoc(doc(db, "insumos", id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  });
}

export async function desactivarInsumo(id: string): Promise<void> {
  await updateDoc(doc(db, "insumos", id), {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}
