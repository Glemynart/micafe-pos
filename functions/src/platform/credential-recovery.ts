import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import {
  activarRestablecimientoCredencial as activarRestablecimientoCredencialServicio,
  solicitarRestablecimientoCredencial,
  validarComandoRestablecimiento,
  type EvidenciaFueraDeBanda,
} from "../credential-recovery-service";
import { emitirSesionTenant } from "../credential-core/emitir-sesion-tenant";

export interface SolicitudRecuperacionPlataforma {
  auth?: { uid: string; token: Record<string, unknown> } | null;
  data?: unknown;
}

function exigirAuth(request: SolicitudRecuperacionPlataforma) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AutenticaciÃ³n requerida.");
  return request.auth;
}

export async function ejecutarRestablecimientoAdministrador(
  request: SolicitudRecuperacionPlataforma,
  reemitirPendiente: boolean,
  pinPepper: string,
) {
  const data = request.data as Record<string, unknown> | undefined;
  try {
    const auth = exigirAuth(request);
    const db = getFirestore();
    await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, "ACCESO_RESTABLECER");
    if (typeof data?.empresaId !== "string" || !data.empresaId.trim()) {
      throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
    }
    const empresa = await db.collection("empresas").doc(data.empresaId).get();
    const ownerUid = empresa.data()?.ownerUid;
    if (!empresa.exists || typeof ownerUid !== "string" || !ownerUid) {
      throw new HttpsError("failed-precondition", "EMPRESA_SIN_OWNER");
    }
    const comando = validarComandoRestablecimiento(data);
    const evidencia = data.evidenciaVerificacion as EvidenciaFueraDeBanda | undefined;
    const resultado = await solicitarRestablecimientoCredencial(
      db,
      { tipo: "OPERADOR_SAAS", uid: auth.uid, facultad: "ACCESO_RESTABLECER" },
      comando,
      data.empresaId,
      ownerUid,
      pinPepper,
      evidencia,
      { reemitirPendiente },
    );
    await getAuth().revokeRefreshTokens(resultado.uid);
    return resultado;
  } catch (cause) {
    console.error("credential recovery callable failed", {
      operation: reemitirPendiente
        ? "reemitirRestablecimientoCredencialAdministradorTenantSaas"
        : "restablecerCredencialAdministradorTenantSaas",
      empresaId: typeof data?.empresaId === "string" ? data.empresaId : null,
      code: cause instanceof HttpsError ? cause.code : "internal",
      message: cause instanceof HttpsError ? cause.message : cause instanceof Error ? cause.message : "UNKNOWN_ERROR",
    });
    throw cause;
  }
}

export async function ejecutarActivacionRestablecimiento(
  request: SolicitudRecuperacionPlataforma,
  pinPepper: string,
) {
  const auth = exigirAuth(request);
  if (auth.token.authStage !== "RESTABLECIMIENTO_TEMP" || typeof auth.token.restablecimientoId !== "string") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const data = request.data as { pinActual?: unknown; pinNuevo?: unknown } | undefined;
  if (typeof data?.pinActual !== "string" || typeof data.pinNuevo !== "string") {
    throw new HttpsError("invalid-argument", "PIN_INVALIDO");
  }
  const resultado = await activarRestablecimientoCredencialServicio(
    getFirestore(),
    auth.uid,
    auth.token.restablecimientoId,
    data.pinActual,
    data.pinNuevo,
    pinPepper,
  );
  const customToken = await emitirSesionTenant(auth.uid, resultado.empresaId, resultado.rol);
  return { ...resultado, estado: "ACTIVE" as const, customToken };
}
