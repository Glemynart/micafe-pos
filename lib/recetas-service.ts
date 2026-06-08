/**
 * recetas-service.ts
 *
 * Funciones Firestore para gestionar las recetas de los productos.
 * Un documento en 'recetas' tiene como ID el mismo ID del producto.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Ingrediente {
  insumoId: string;
  cantidad: number; // Cantidad requerida del insumo para este producto
}

export interface Receta {
  id: string; // Mismo que productoId
  productoId: string;
  ingredientes: Ingrediente[];
}

/**
 * Suscribe a todas las recetas (útil para cargar en memoria y hacer cruces rápidos en el POS)
 */
export function suscribirRecetas(callback: (recetas: Receta[]) => void): Unsubscribe {
  const q = collection(db, "recetas");

  return onSnapshot(q, (snap) => {
    const recetas: Receta[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Receta, "id">),
    }));
    callback(recetas);
  });
}

/**
 * Guarda o actualiza la receta de un producto
 */
export async function guardarReceta(productoId: string, ingredientes: Ingrediente[]): Promise<void> {
  const ref = doc(db, "recetas", productoId);
  await setDoc(ref, {
    productoId,
    ingredientes
  });
}

/**
 * Elimina la receta de un producto (si el producto deja de ser preparado)
 */
export async function eliminarReceta(productoId: string): Promise<void> {
  await deleteDoc(doc(db, "recetas", productoId));
}

/**
 * Obtiene una receta específica
 */
export async function obtenerReceta(productoId: string): Promise<Receta | null> {
  const snap = await getDoc(doc(db, "recetas", productoId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Receta;
}
