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

import type { Timestamp } from "firebase/firestore";

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
