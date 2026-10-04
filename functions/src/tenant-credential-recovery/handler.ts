import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  solicitarRestablecimientoCredencial,
  validarComandoRestablecimiento,
  type ResultadoRestablecimiento,
} from "../credential-recovery-service";
import { exigirTenantActivo } from "../tenant-configuration/authority";

export type SolicitudRestablecimientoOperadorTenant = {
  auth?: { uid: string; token: Record<string, unknown> } | null;
  data?: unknown;
};

type TenantActivo = { id: string; rol: string };

export type DependenciasRestablecimientoOperadorTenant = {
  db?: any;
  exigirTenant?: (request: SolicitudRestablecimientoOperadorTenant, db: any) => Promise<TenantActivo>;
  solicitar?: typeof solicitarRestablecimientoCredencial;
  revocarTokens?: (uid: string) => Promise<unknown>;
};

function exigirAuth(request: SolicitudRestablecimientoOperadorTenant) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  return request.auth;
}

/**
 * Adapter neutral del contrato ADR-SAAS-017 para un administrador del tenant.
 * La emisión y toda su persistencia continúan centralizadas en el servicio
 * canónico de recuperación; este módulo solo fija la autoridad del actor.
 */
export async function ejecutarRestablecimientoOperadorTenant(
  request: SolicitudRestablecimientoOperadorTenant,
  pepper: string,
  dependencias: DependenciasRestablecimientoOperadorTenant = {},
): Promise<ResultadoRestablecimiento> {
  const auth = exigirAuth(request);
  const db = dependencias.db ?? getFirestore();
  const exigirTenant = dependencias.exigirTenant ?? exigirTenantActivo;
  const tenant = await exigirTenant({ ...request, auth }, db);
  if (tenant.rol !== "admin") throw new HttpsError("permission-denied", "Acceso denegado.");

  const data = request.data as Record<string, unknown> | undefined;
  if (typeof data?.objetivoUid !== "string" || !data.objetivoUid.trim()) {
    throw new HttpsError("invalid-argument", "OBJETIVO_UID_INVALIDO");
  }

  const comando = validarComandoRestablecimiento(data);
  const solicitar = dependencias.solicitar ?? solicitarRestablecimientoCredencial;
  const resultado = await solicitar(
    db,
    { tipo: "ADMIN_TENANT", uid: auth.uid, facultad: null },
    comando,
    tenant.id,
    data.objetivoUid,
    pepper,
  );
  const revocarTokens = dependencias.revocarTokens ?? ((uid: string) => getAuth().revokeRefreshTokens(uid));
  await revocarTokens(resultado.uid);
  return resultado;
}
