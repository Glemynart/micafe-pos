/**
 * empresas-service.ts
 *
 * MT-U1 — Capa 1 (infraestructura de datos). Contiene únicamente el contrato
 * de tipo de `Empresa` y la constante de colección. Sin consultas Firestore,
 * sin suscripciones, sin helpers de lectura/escritura: eso pertenece a MT-U2,
 * primer consumidor real de este módulo.
 *
 * Ver MT-U1-empresas-membresias-diseno.md (D-U1-1) y ADR-SAAS-001/004.
 */

import {
  doc as docRef,
  getDoc,
  type Timestamp,
} from "firebase/firestore";

/**
 * Estados del ciclo de vida de la Empresa (ADR-SAAS-003).
 * MT-U1 solo produce 'activa'; el resto de transiciones se habilita en
 * unidades posteriores (MT-U8 suscripciones, panel SaaS).
 */
export type EstadoEmpresa =
  | "trial"
  | "activa"
  | "suspendida"
  | "cancelada"
  | "archivada"
  | "eliminada";

/**
 * Empresa (Tenant): unidad de aislamiento del modelo SaaS.
 *
 * `id` es un identificador opaco y permanente (MT-U1 D-U1-1): nunca lleva
 * significado ni connotación temporal, para que la empresa fundacional sea
 * indistinguible de cualquier empresa futura creada por el onboarding
 * (MT-U7). El nombre visible y el handle legible viven en `nombre`/`slug`,
 * ambos editables sin migrar nada.
 *
 * `esFundacional` marca la única empresa existente hasta que el onboarding
 * cree la segunda; permite descubrirla sin hardcodear su `id` opaco.
 */
export interface Empresa {
  id: string;
  nombre: string;
  slug?: string;
  estado: EstadoEmpresa;
  paisFiscal: string;
  ownerUid: string;
  esFundacional: boolean;
  creadaEn: Timestamp;
}

/** Nombre de la colección Firestore de empresas. */
export const EMPRESAS_COLLECTION = "empresas" as const;

/**
 * Resuelve la empresa fundacional sin hardcodear su id opaco (MT-U1 D-U1-1).
 *
 * @deprecated Desde R-6. El flujo de autenticación ya no depende de una
 * empresa fundacional. Usar `obtenerEmpresaPorId(id)` con el `empresaId`
 * del claim para caminos autenticados, o resolver por otro criterio en
 * rutas Admin sin sesión (ese caso pertenece a MT-U11).
 * Se conserva exclusivamente para compatibilidad con scripts históricos
 * ya ejecutados y para trazabilidad del campo.
 *
 * `db` se importa dinámicamente (no en el top-level del módulo): así este
 * archivo permanece inerte para cualquier import que solo necesite
 * `Empresa`/`EMPRESAS_COLLECTION` (p. ej. scripts Admin SDK), que nunca
 * llegan a ejecutar el cuerpo de esta función. Un import estático de
 * `@/lib/firebase` aquí inicializaría el SDK cliente (Auth) en cuanto se
 * cargara el módulo — antes de que un script pueda cargar sus propias
 * variables de entorno — rompiendo scripts que solo necesitan la constante.
 */
/**
 * Obtiene una empresa por su id opaco (lectura directa de documento).
 *
 * Es la fuente de verdad cuando `empresaId` proviene del claim del token
 * (D-U2-1/D-U2-2): NO asume
 * "la única empresa existente" — resuelve exactamente el documento que el
 * claim declara, sin volver a "descubrir" nada. Sigue siendo correcto sin
 * cambios cuando exista más de una empresa (MT-U11).
 *
 * fallback transitorio (D-U2-1) cuando el claim aún no existe/propaga.
 *
 * Devuelve `null` si el documento no existe.
 */
export async function obtenerEmpresaPorId(id: string): Promise<Empresa | null> {
  const { db } = await import("@/lib/firebase");
  const snap = await getDoc(docRef(db, EMPRESAS_COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Empresa, "id">) };
}
