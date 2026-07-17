/**
 * membresias-service.ts
 *
 * MT-U1 — Capa 1 (infraestructura de datos). Contiene únicamente el
 * contrato de tipo de `Membresia` y la constante de colección. Sin
 * consultas Firestore, sin suscripciones, sin helpers de lectura/escritura:
 * eso pertenece a MT-U2, primer consumidor real de este módulo.
 *
 * Ver MT-U1-empresas-membresias-diseno.md (D-U1-2) y ADR-SAAS-002/004.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";

/**
 * Membresia: arista pura de pertenencia Usuario × Empresa (MT-U1 D-U1-2).
 *
 * Deliberadamente NO duplica `rol` ni `permisos`: `usuarios.rol` y
 * `usuarios.permisos` siguen siendo la única fuente de autorización hasta
 * MT-U5b (ADR-SAAS-002), que moverá la fuente de lectura en un único paso
 * atómico. No copiarlos aquí evita cualquier desincronización entre esta
 * colección y `usuarios` mientras tanto.
 */
export interface Membresia {
  empresaId: string;
  uid: string;
  activo: boolean;
  creadaEn: Timestamp;
}

/** Nombre de la colección Firestore de membresías. */
export const MEMBRESIAS_COLLECTION = "membresias" as const;

/**
 * Obtiene la Membresia de un usuario en una empresa dada, por su id
 * determinístico `{empresaId}_{uid}` (MT-U1 §5). Devuelve `null` si no
 * existe. Primer consumidor real de este módulo (MT-U2).
 *
 * `db` se importa dinámicamente (no en el top-level del módulo): así este
 * archivo permanece inerte para cualquier import que solo necesite
 * `Membresia`/`MEMBRESIAS_COLLECTION` (p. ej. scripts Admin SDK), que nunca
 * llegan a ejecutar el cuerpo de esta función. Un import estático de
 * `@/lib/firebase` aquí inicializaría el SDK cliente (Auth) en cuanto se
 * cargara el módulo — antes de que un script pueda cargar sus propias
 * variables de entorno — rompiendo scripts que solo necesitan la constante.
 */
export async function obtenerMembresia(
  empresaId: string,
  uid: string
): Promise<Membresia | null> {
  const { db } = await import("@/lib/firebase");
  const ref = doc(db, MEMBRESIAS_COLLECTION, `${empresaId}_${uid}`);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Membresia) : null;
}

/**
 * Obtiene todas las membresías de un usuario (una por empresa a la que
 * pertenece). Con una única empresa hasta MT-U11, devuelve como máximo 1.
 * Ver nota de import dinámico en `obtenerMembresia`.
 */
export async function obtenerMembresiasDeUsuario(uid: string): Promise<Membresia[]> {
  const { db } = await import("@/lib/firebase");
  const q = query(collection(db, MEMBRESIAS_COLLECTION), where("uid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Membresia);
}
