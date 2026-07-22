/**
 * espacios-service.ts
 *
 * Funciones Firestore para leer Espacios y Categorías.
 * Usa la instancia `db` ya inicializada con persistencia offline.
 */

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";

// ─── Tipos ────────────────────────────────────────────────────────────────────

// FASE-14 PR3: sector embebido en el doc espacio (cero colección nueva).
export interface Sector {
  id: string;
  nombre: string;
  color?: string;
  orden?: number;
  // Bounds opcionales en coords de mundo (para backdrop visual).
  boundsX?: number;
  boundsY?: number;
  boundsWidth?: number;
  boundsHeight?: number;
}

export interface Espacio {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  activo: boolean;
  orden: number;
  modulos_permitidos?: string[];
  // FASE-14 PR1: dimensiones del mundo lógico del lienzo (ul). Default 1600×1000.
  salonWorldWidth?: number;
  salonWorldHeight?: number;
  // FASE-14 PR3: sectores embebidos (sub-zonas del espacio).
  sectores?: Sector[];
}

export interface Categoria {
  id: string;
  nombre: string;
  espacioId: string;
  icono: string;
  activo: boolean;
  orden: number;
}

// ─── Espacios ─────────────────────────────────────────────────────────────────

/**
 * Suscribe a todos los espacios activos en tiempo real.
 * Retorna una función para cancelar la suscripción.
 */
export function suscribirEspacios(
  callback: (espacios: Espacio[]) => void
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(collection(db, "espacios"), where("activo", "==", true)).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const espacios: Espacio[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Espacio, "id">),
      })).sort((a, b) => a.orden - b.orden);
      callback(espacios);
    }, (error) => {
      console.error("suscribirEspacios error:", error.message);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

export function suscribirTodosEspacios(
  callback: (espacios: Espacio[]) => void
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(collection(db, "espacios")).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const espacios: Espacio[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Espacio, "id">),
      })).sort((a, b) => a.orden - b.orden);
      callback(espacios);
    }, (error) => {
      console.error("suscribirTodosEspacios error:", error.message);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

/**
 * Lectura única de todos los espacios activos (para seeds y utilidades).
 */
export async function obtenerEspacios(): Promise<Espacio[]> {
  const q = await tenantQuery(
    collection(db, "espacios"),
    where("activo", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Espacio, "id">),
  })).sort((a, b) => a.orden - b.orden);
}

// ─── Categorías ───────────────────────────────────────────────────────────────

/**
 * Suscribe a las categorías activas de un espacio específico en tiempo real.
 */
export function suscribirCategorias(
  espacioId: string,
  callback: (categorias: Categoria[]) => void
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(
    collection(db, "categorias"),
    where("espacioId", "==", espacioId),
    where("activo", "==", true)
  ).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const categorias: Categoria[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Categoria, "id">),
      })).sort((a, b) => a.orden - b.orden);
      callback(categorias);
    }, (error) => {
      console.error("suscribirCategorias error:", error.message);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

/**
 * Lectura única de categorías activas de un espacio (para seeds y utilidades).
 */
export async function obtenerCategorias(espacioId: string): Promise<Categoria[]> {
  const q = await tenantQuery(
    collection(db, "categorias"),
    where("espacioId", "==", espacioId),
    where("activo", "==", true),
    orderBy("orden", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Categoria, "id">),
  }));
}

export async function guardarModulosEspacio(espacioId: string, modulos: string[]): Promise<void> {
  await updateDoc(doc(db, "espacios", espacioId), { modulos_permitidos: modulos });
}

// FASE-14 PR3: I-13 — usa updateDoc parcial para no borrar otros campos del espacio.
export async function actualizarSectoresEspacio(espacioId: string, sectores: Sector[]): Promise<void> {
  await updateDoc(doc(db, "espacios", espacioId), { sectores });
}
