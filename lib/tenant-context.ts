/**
 * tenant-context.ts
 *
 * MT-U3 Capa 1 — Resolvedor canónico y único de "cuál es el empresaId
 * activo". Consumido por `contexts/saas-context.tsx` (React) y por
 * `lib/tenant.ts` (servicios planos, sin React) — una sola ruta de
 * resolución + fallback en todo el sistema (MT-U3-helper-tenant-diseno.md §1).
 *
 * Patrón: lectura AMBIENTAL y asíncrona, sin parámetros — igual que
 * `getCurrentUserInfo()` en `lib/auth-service.ts` resuelve el actor desde
 * `auth.currentUser`. No es un hook de React ni depende de ningún contexto:
 * puede llamarse desde cualquier módulo plano.
 *
 * Política de resolución (§2.5 del diseño): bajo demanda, respaldada por la
 * caché de token del SDK (getIdTokenResult() sin forceRefresh no golpea la
 * red salvo expiración). El llamador es responsable de resolver una única
 * vez por operación lógica y reutilizar el resultado — este módulo no cachea
 * nada por su cuenta.
 *
 * Límites (§2.3 del diseño): NO decide el empresaId (lo impone el claim); NO
 * autoriza (no expone rol); NO lee colecciones operativas; NO escribe claims.
 */

import type { Empresa } from "@/lib/empresas-service";

/**
 * Lanzado cuando no puede resolverse un empresaId para el llamador: (a) no
 * hay usuario autenticado, o (b) el token no trae el claim tenant canónico
 * después de un refresh. Desde MT-U5a ambos casos invalidan la sesión.
 */
export class TenantSinSesionError extends Error {
  constructor(mensaje = "No hay sesión activa: no se puede resolver el empresaId del tenant.") {
    super(mensaje);
    this.name = "TenantSinSesionError";
  }
}

/** Valor del claim `authStage` que identifica una sesión de transición (ver `esSesionTransicionDirecta`). */
export const AUTH_STAGE_TRANSICION_DIRECTA = "DIRECTA_TEMP" as const;

/**
 * ADR-SAAS-013 §9 — una sesión con `authStage: "DIRECTA_TEMP"` es una sesión
 * de Firebase Auth autenticada y válida (el customToken se canjeó con
 * éxito), pero todavía NO es una sesión tenant: nunca tiene, ni debe
 * adquirir, el claim `empresaId` — permanece así hasta que el cliente
 * complete la activación de su credencial inicial y reciba el customToken
 * tenant definitivo.
 *
 * Es el único caso en el que "sin claim tenant" no implica "sesión
 * inválida" (contraste con `TenantSinSesionError`, que sí trata la ausencia
 * del claim como invalidez tras un refresh). Todo consumidor de sesión que
 * reaccione automáticamente a cambios de auth (`onAuthStateChanged`,
 * `onIdTokenChanged`) debe reconocer este estado ANTES de invocar cualquier
 * resolución de tenant, para no tratarlo como una sesión corrupta.
 */
export function esSesionTransicionDirecta(claims: Record<string, unknown>): boolean {
  return claims.authStage === AUTH_STAGE_TRANSICION_DIRECTA;
}

/** Obtiene la incorporación que una sesión DIRECTA_TEMP puede continuar. */
export function obtenerIncorporacionSesionTransicionDirecta(
  claims: Record<string, unknown>,
): string | null {
  if (!esSesionTransicionDirecta(claims)) return null;
  const incorporacionId = claims.incorporacionId;
  return typeof incorporacionId === "string" && incorporacionId.trim()
    ? incorporacionId
    : null;
}

export interface ResolucionTenant {
  empresaId: string;
  /**
   * Doc de empresa ya resuelto SOLO si el camino fue el fallback (se obtiene
   * como parte de la propia consulta de descubrimiento, sin lectura extra).
   * `null` en el camino normal (claim) — el consumidor que necesite el doc
   * lo obtiene por su cuenta vía `obtenerEmpresaPorId(empresaId)` (evita una
   * lectura de Firestore innecesaria para quien solo necesita el id, como
   * `lib/tenant.ts`).
   */
  empresa: Empresa | null;
}

/**
 * Resuelve el empresaId activo exclusivamente desde el claim del token.
 *
 * Lanza `TenantSinSesionError` si no hay usuario autenticado, o si el
 * el refresh. No existe fallback de descubrimiento desde MT-U5a.
 */
export async function resolverEmpresaIdActivo(): Promise<ResolucionTenant> {
  // `db`/`auth` se importan dinámicamente (no en el top-level del módulo):
  // así este archivo permanece inerte para cualquier import que no llegue a
  // invocar esta función (p. ej. un test que solo necesita `TenantSinSesionError`
  // o `lib/tenant.ts`.`withEmpresaId`, puro). Un import estático de
  // `@/lib/firebase` aquí inicializaría el SDK cliente (Auth) en cuanto se
  // cargara el módulo, sin variables de entorno de Firebase disponibles —
  // mismo razonamiento documentado en `lib/empresas-service.ts`.
  const { auth } = await import("@/lib/firebase");
  const user = auth.currentUser;
  if (!user) throw new TenantSinSesionError();

  // Camino normal: leer el claim del token ya cacheado (sin forzar red).
  let tokenResult = await user.getIdTokenResult();

  // Si el claim aún no aparece, puede haberse acuñado server-side después
  // de emitido el token cacheado. Un único refresh forzado basta.
  if (tokenResult.claims.empresaId === undefined) {
    tokenResult = await user.getIdTokenResult(true);
  }

  const empresaIdClaim = tokenResult.claims.empresaId as string | undefined;

  if (empresaIdClaim) {
    // El empresaId del claim ES la fuente de verdad — no se "descubre" nada.
    return { empresaId: empresaIdClaim, empresa: null };
  }

  throw new TenantSinSesionError(
    "La sesión no contiene el claim 'empresaId' requerido tras renovar el token."
  );
}
