/**
 * tenant.ts
 *
 * MT-U3 Capa 1 — Helper único de tenant (MT-U3-helper-tenant-diseno.md §2).
 * Única forma válida en `lib/*-service.ts` de:
 *   1. obtener el empresaId activo;
 *   2. estampar empresaId en datos de escritura;
 *   3. filtrar por empresaId en lectura.
 *
 * SIN CONSUMIDORES en Capa 1 (aditivo puro): ningún servicio operativo
 * importa este módulo todavía. Eso empieza en Capa 2 (ledger) / Capa 3
 * (resto de servicios). `tenantQuery()` no impone todavía la política de
 * `limit()` de IMP-13 — esa política se añade en Capa 3, que es la unidad
 * que además cierra IMP-13 según el plan de capas (§9 del diseño).
 *
 * Responsabilidades PROHIBIDAS (§2.3 del diseño): no autoriza (no lee ni
 * decide rol/permisos), no escribe claims, no decide el empresaId (lo
 * impone el claim vía el resolvedor), no conoce colecciones concretas, no
 * toca firestore.rules/configuracion/suscripciones, no gestiona espacioId.
 */

import {
  query,
  where,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import { resolverEmpresaIdActivo } from "@/lib/tenant-context";

/**
 * Resuelve el empresaId activo (claim → fallback D-U2-1). Bajo demanda —
 * ver política de resolución (§2.5): una sola llamada por operación lógica,
 * nunca repetida dentro de bucles/transacciones/escrituras múltiples.
 *
 * Lanza `TenantSinSesionError` (ver `lib/tenant-context.ts`) si no hay
 * usuario autenticado, o si el fallback tampoco resuelve ningún tenant.
 */
export async function getEmpresaId(): Promise<string> {
  const { empresaId } = await resolverEmpresaIdActivo();
  return empresaId;
}

/**
 * Estampado explícito para rutas Admin (webhook, scripts). NO lee
 * `auth.currentUser` — el llamador ya resolvió el `empresaId` de forma
 * autoritativa (p. ej. derivado del dato, o por consulta directa a
 * `empresas`). Es la única función pura y síncrona del módulo: el mismo
 * merge que usa `stampEmpresaId` por debajo, sin la resolución ambiental.
 */
export function withEmpresaId<T extends object>(
  empresaId: string,
  data: T
): T & { empresaId: string } {
  return { ...data, empresaId };
}

/**
 * Devuelve una copia de `data` con `empresaId` inyectado desde
 * `getEmpresaId()`. Único punto donde un servicio cliente añade el campo en
 * una escritura.
 */
export async function stampEmpresaId<T extends object>(
  data: T
): Promise<T & { empresaId: string }> {
  const empresaId = await getEmpresaId();
  return withEmpresaId(empresaId, data);
}

/**
 * `where('empresaId','==', await getEmpresaId())` listo para componer en
 * una query.
 */
export async function tenantWhere(): Promise<QueryConstraint> {
  const empresaId = await getEmpresaId();
  return where("empresaId", "==", empresaId);
}

/**
 * Azúcar: `query(col, await tenantWhere(), ...extraConstraints)`.
 */
export async function tenantQuery<T = DocumentData>(
  col: CollectionReference<T>,
  ...extraConstraints: QueryConstraint[]
): Promise<Query<T>> {
  const constraintDeTenant = await tenantWhere();
  return query(col, constraintDeTenant, ...extraConstraints);
}
