/**
 * productos-service.ts
 *
 * Funciones Firestore para leer / crear / editar / eliminar productos,
 * filtrando por espacioId y opcionalmente categoriaId.
 * Usa onSnapshot para actualizaciones en tiempo real.
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
  deleteDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  imagenUrl: string | null;
  categoriaId: string;
  espacioId: string;
  activo: boolean;
  descripcion: string;
  unidad: string;
  icono?: string;
  // Consignación
  consignadorId?: string;   // quién dejó el producto
  stockInicial?: number;    // unidades originales entregadas
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type ProductoInput = Omit<Producto, 'id' | 'creadoEn' | 'actualizadoEn'>;


// ─── Leer (tiempo real) ───────────────────────────────────────────────────────

/**
 * Suscribe a los productos activos de un espacio en tiempo real.
 * Si se provee categoriaId, filtra además por categoría.
 */
export function suscribirProductos(
  espacioId: string,
  callback: (productos: Producto[]) => void,
  categoriaId?: string
): Unsubscribe {
  const filtros = [
    where("espacioId", "==", espacioId),
    where("activo", "==", true),
  ];
  if (categoriaId) {
    filtros.push(where("categoriaId", "==", categoriaId));
  }

  const q = query(
    collection(db, "productos"),
    ...filtros
  );

  return onSnapshot(q, (snap) => {
    const productos: Producto[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Producto, "id">),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    callback(productos);
  });
}

// ─── Crear ────────────────────────────────────────────────────────────────────

export async function crearProducto(data: ProductoInput): Promise<string> {
  const ref = await addDoc(collection(db, "productos"), {
    ...data,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

// ─── Editar ───────────────────────────────────────────────────────────────────

export async function editarProducto(
  id: string,
  data: Partial<ProductoInput>
): Promise<void> {
  await updateDoc(doc(db, "productos", id), {
    ...data,
    actualizadoEn: serverTimestamp(),
  });
}

// ─── Eliminar (soft delete) ───────────────────────────────────────────────────

export async function desactivarProducto(id: string): Promise<void> {
  await updateDoc(doc(db, "productos", id), {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}

/** Eliminación física — usar con precaución */
export async function eliminarProducto(id: string): Promise<void> {
  await deleteDoc(doc(db, "productos", id));
}
