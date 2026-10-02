import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import type { RolTenant } from "../contracts";
import { esRolTenant } from "../contracts";

export async function actualizarClaimsTenant(
  uid: string,
  empresaId: string,
  rol: RolTenant | null,
  claimsActuales?: Record<string, unknown>,
): Promise<void> {
  const auth = getAuth();
  const existente = claimsActuales ?? (await auth.getUser(uid)).customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await auth.setCustomUserClaims(uid, rol ? { ...platformClaims, empresaId, rol } : platformClaims);
  await auth.revokeRefreshTokens(uid);
}

export async function emitirSesionTenant(uid: string, empresaId: string, rol: string): Promise<string> {
  if (!esRolTenant(rol)) throw new HttpsError("failed-precondition", "Rol de membresia invalido.");
  await actualizarClaimsTenant(uid, empresaId, rol);
  return getAuth().createCustomToken(uid);
}
