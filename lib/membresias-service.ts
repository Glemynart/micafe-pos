/**
 * membresias-service.ts
 *
 * MT-U5B — Bloque 2. Contrato y lectores de la autoridad canónica de una
 * pertenencia Usuario × Empresa.
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

export interface Membresia {
  empresaId: string;
  uid: string;
  activo: boolean;
  creadaEn: Timestamp;
  rol: RolMembresia;
  permisos: string[];
  estado: EstadoMembresia;
  actualizadaEn: Timestamp;
}

/** Forma histórica conservada exclusivamente para scripts de migración/rollback. */
export interface MembresiaLegacy {
  empresaId: string;
  uid: string;
  activo: boolean;
  creadaEn: Timestamp;
}

/** Vocabulario único de roles tenant aprobado para MT-U5. */
export const ROLES_MEMBRESIA = [
  "admin",
  "supervisor",
  "cajero",
  "cocinero",
  "marketing",
] as const;

export type RolMembresia = (typeof ROLES_MEMBRESIA)[number];

/** Estados de acceso de una membresía dentro de una empresa. */
export const ESTADOS_MEMBRESIA = ["activa", "inactiva"] as const;

export type EstadoMembresia = (typeof ESTADOS_MEMBRESIA)[number];


/** Nombre de la colección Firestore de membresías. */
export const MEMBRESIAS_COLLECTION = "membresias" as const;

/** Id determinístico que garantiza una única membresía por Empresa × Usuario. */
export function idMembresia(empresaId: string, uid: string): string {
  return `${empresaId}_${uid}`;
}

export function esRolMembresia(valor: unknown): valor is RolMembresia {
  return typeof valor === "string" && (ROLES_MEMBRESIA as readonly string[]).includes(valor);
}

export function esEstadoMembresia(valor: unknown): valor is EstadoMembresia {
  return typeof valor === "string" && (ESTADOS_MEMBRESIA as readonly string[]).includes(valor);
}

export function estadoMembresiaDesdeActivo(activo: boolean): EstadoMembresia {
  return activo ? "activa" : "inactiva";
}

/**
 * Valida y normaliza un conjunto de permisos sin cambiar su semántica:
 * elimina duplicados y fija un orden estable para comparaciones auditables.
 */
export function normalizarPermisos(permisos: unknown): string[] | null {
  if (!Array.isArray(permisos) || permisos.some((permiso) => typeof permiso !== "string" || !permiso)) {
    return null;
  }
  return [...new Set(permisos)].sort();
}

export function permisosSonIguales(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((permiso, index) => permiso === b[index]);
}

export function esMembresiaActiva(membresia: Pick<Membresia, "estado" | "activo">): boolean {
  return membresia.estado === "activa" && membresia.activo === true;
}

export function esMembresiaCanonica(valor: unknown): valor is Membresia {
  if (!valor || typeof valor !== "object") return false;
  const data = valor as Partial<Membresia>;
  return typeof data.empresaId === "string"
    && typeof data.uid === "string"
    && esRolMembresia(data.rol)
    && esEstadoMembresia(data.estado)
    && typeof data.activo === "boolean"
    && normalizarPermisos(data.permisos) !== null;
}

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
  const ref = doc(db, MEMBRESIAS_COLLECTION, idMembresia(empresaId, uid));
  const snap = await getDoc(ref);
  const data = snap.data();
  return snap.exists() && esMembresiaCanonica(data) ? data : null;
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
  return snap.docs.map((d) => d.data()).filter(esMembresiaCanonica);
}
