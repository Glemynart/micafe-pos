/**
 * Cliente de autenticación operativa MT-U5a.
 *
 * La validación de código/PIN, la emisión de claims y la creación del custom
 * token suceden exclusivamente en Cloud Functions. Este módulo solo canjea el
 * token y verifica que la sesión resultante contenga el contrato tenant.
 *
 * ADR-SAAS-013 §9 — cuando la credencial es la inicial (recién emitida por
 * Bootstrap/Backoffice), el backend responde `requiereCambio: true` con una
 * sesión `DIRECTA_TEMP` sin claims tenant (por diseño: no lee datos ni
 * opera). Este módulo no la trata como una sesión inválida: la propaga para
 * que la capa de activación (`activarSesionOperativa`) la canjee por una
 * sesión tenant tras fijar el PIN definitivo.
 */

import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, signOut, type User } from "firebase/auth";
import { auth, getFirebaseFunctions } from "@/lib/firebase";

export type RolOperativo = "admin" | "supervisor" | "cajero" | "cocinero" | "marketing";

const ROLES_OPERATIVOS: readonly RolOperativo[] = [
  "admin",
  "supervisor",
  "cajero",
  "cocinero",
  "marketing",
];

interface RespuestaAutenticacionOperativa {
  customToken: string;
  requiereCambio?: boolean;
  incorporacionId?: string;
}

interface RespuestaActivacionDirecta {
  incorporacionId: string;
  estado: "ACTIVE";
  customToken: string;
  idempotente: boolean;
}

export type ResultadoSesionOperativa =
  | { requiereCambio: false; user: User }
  | { requiereCambio: true; incorporacionId: string };

function region(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";
}

function esRolOperativo(valor: unknown): valor is RolOperativo {
  return typeof valor === "string" && ROLES_OPERATIVOS.includes(valor as RolOperativo);
}

function errorOperativo(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (code === "functions/unauthenticated" || code === "functions/permission-denied") {
    return new Error("Credenciales operativas inválidas.");
  }
  if (code === "functions/unavailable" || code === "functions/deadline-exceeded") {
    return new Error("No fue posible conectar con el servicio de autenticación. Intenta nuevamente.");
  }
  return error instanceof Error ? error : new Error("No fue posible iniciar sesión.");
}

async function canjearSesionTenant(customToken: string): Promise<User> {
  const credential = await signInWithCustomToken(auth, customToken);
  const token = await credential.user.getIdTokenResult(true);
  if (typeof token.claims.empresaId !== "string" || !esRolOperativo(token.claims.rol)) {
    await signOut(auth);
    throw new Error("La sesión no contiene los claims de tenant requeridos.");
  }
  return credential.user;
}

/**
 * Canjea código + PIN por una sesión operativa. Si la credencial es la
 * inicial y aún no fue activada, devuelve `requiereCambio: true` con una
 * sesión `DIRECTA_TEMP` ya iniciada (sin claims tenant) en vez de lanzar:
 * esa sesión es la que autoriza `activarSesionOperativa`.
 */
export async function iniciarSesionOperativa(codigo: string, pin: string): Promise<ResultadoSesionOperativa> {
  try {
    const autenticar = httpsCallable<{ codigo: string; pin: string }, RespuestaAutenticacionOperativa>(
      getFirebaseFunctions(region()),
      "autenticarOperativo"
    );
    const response = await autenticar({ codigo, pin });
    const customToken = response.data?.customToken;
    if (typeof customToken !== "string" || !customToken) {
      throw new Error("El servicio de autenticación devolvió una respuesta inválida.");
    }

    if (response.data?.requiereCambio === true) {
      const incorporacionId = response.data.incorporacionId;
      if (typeof incorporacionId !== "string" || !incorporacionId) {
        throw new Error("El servicio de autenticación devolvió una respuesta inválida.");
      }
      await signInWithCustomToken(auth, customToken);
      return { requiereCambio: true, incorporacionId };
    }

    return { requiereCambio: false, user: await canjearSesionTenant(customToken) };
  } catch (error) {
    throw errorOperativo(error);
  }
}

/**
 * Completa la activación de la credencial inicial (ADR-SAAS-013 §9): fija el
 * PIN definitivo desde la sesión `DIRECTA_TEMP` ya iniciada y canjea el
 * custom token tenant resultante. Requiere que `iniciarSesionOperativa` haya
 * devuelto `requiereCambio: true` en esta misma sesión de navegador.
 */
export async function activarSesionOperativa(pinTemporal: string, pinNuevo: string): Promise<User> {
  try {
    const activar = httpsCallable<{ pinActual: string; pinNuevo: string }, RespuestaActivacionDirecta>(
      getFirebaseFunctions(region()),
      "activarIncorporacionDirecta"
    );
    const response = await activar({ pinActual: pinTemporal, pinNuevo });
    const customToken = response.data?.customToken;
    if (typeof customToken !== "string" || !customToken) {
      throw new Error("El servicio de activación devolvió una respuesta inválida.");
    }
    return await canjearSesionTenant(customToken);
  } catch (error) {
    throw errorOperativo(error);
  }
}
