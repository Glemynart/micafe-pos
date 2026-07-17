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

import type { Timestamp } from "firebase/firestore";

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
