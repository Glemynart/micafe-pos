/**
 * Cliente de autenticación operativa MT-U5a.
 *
 * La validación de código/PIN, la emisión de claims y la creación del custom
 * token suceden exclusivamente en Cloud Functions. Este módulo solo canjea el
 * token y verifica que la sesión resultante contenga el contrato tenant.
 */

import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, signOut, type User } from "firebase/auth";
import { app, auth } from "@/lib/firebase";

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

/**
 * Canjea código + PIN por una sesión Firebase con claims emitidos por backend.
 * Nunca usa ni transforma la contraseña Firebase legacy.
 */
export async function iniciarSesionOperativa(codigo: string, pin: string): Promise<User> {
  try {
    const { getFunctions } = await import("firebase/functions");
    const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";
    const functions = getFunctions(app, region);
    const autenticar = httpsCallable<{ codigo: string; pin: string }, RespuestaAutenticacionOperativa>(
      functions,
      "autenticarOperativo"
    );
    const response = await autenticar({ codigo, pin });
    const customToken = response.data?.customToken;
    if (typeof customToken !== "string" || !customToken) {
      throw new Error("El servicio de autenticación devolvió una respuesta inválida.");
    }

    const credential = await signInWithCustomToken(auth, customToken);
    const token = await credential.user.getIdTokenResult(true);
    if (typeof token.claims.empresaId !== "string" || !esRolOperativo(token.claims.rol)) {
      await signOut(auth);
      throw new Error("La sesión no contiene los claims de tenant requeridos.");
    }

    return credential.user;
  } catch (error) {
    throw errorOperativo(error);
  }
}
