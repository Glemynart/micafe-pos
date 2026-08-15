import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { exigirAdminTenant } from "./operational-auth";
import { autorizarPlataforma, type TokenPlataforma } from "./platform/authorization";
import {
  activarRestablecimientoCredencial as activarRestablecimientoCredencialServicio,
  solicitarRestablecimientoCredencial,
  validarComandoRestablecimiento,
  type EvidenciaFueraDeBanda,
} from "./credential-recovery-service";
import { emitirSesionTenant } from "./operational-auth";

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const CORS_ORIGINS = ["https://cafeatrato.vercel.app"];

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  return request.auth;
}

function pepper(): string {
  const value = PIN_PEPPER.value();
  if (!value) throw new HttpsError("internal", "No se pudo procesar la credencial.");
  return value;
}

async function ejecutarRestablecimientoAdministrador(
  request: { auth?: { uid: string; token: Record<string, unknown> } | null; data?: unknown },
  reemitirPendiente: boolean,
) {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, "ACCESO_RESTABLECER");
  const data = request.data as Record<string, unknown> | undefined;
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
    pepper(),
    evidencia,
    { reemitirPendiente },
  );
  await getAuth().revokeRefreshTokens(resultado.uid);
  return resultado;
}

export const restablecerCredencialOperativa = onCall(
  { region: REGION, secrets: [PIN_PEPPER], cors: CORS_ORIGINS, invoker: "public" },
  async (request) => {
    const auth = exigirAuth(request);
    const tenant = await exigirAdminTenant(request);
    const data = request.data as Record<string, unknown> | undefined;
    if (typeof data?.objetivoUid !== "string" || !data.objetivoUid.trim()) {
      throw new HttpsError("invalid-argument", "OBJETIVO_UID_INVALIDO");
    }
    const comando = validarComandoRestablecimiento(data);
    const resultado = await solicitarRestablecimientoCredencial(
      getFirestore(),
      { tipo: "ADMIN_TENANT", uid: auth.uid, facultad: null },
      comando,
      tenant.id,
      data.objetivoUid,
      pepper(),
      undefined,
    );
    await getAuth().revokeRefreshTokens(resultado.uid);
    return resultado;
  },
);

export const restablecerCredencialAdministradorTenantSaas = onCall(
  { region: REGION, secrets: [PIN_PEPPER], cors: CORS_ORIGINS, invoker: "public" },
  async (request) => ejecutarRestablecimientoAdministrador(request, false),
);

export const reemitirRestablecimientoCredencialAdministradorTenantSaas = onCall(
  { region: REGION, secrets: [PIN_PEPPER], cors: CORS_ORIGINS, invoker: "public" },
  async (request) => ejecutarRestablecimientoAdministrador(request, true),
);

export const activarRestablecimientoCredencial = onCall(
  { region: REGION, secrets: [PIN_PEPPER], cors: CORS_ORIGINS, invoker: "public" },
  async (request) => {
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
      pepper(),
    );
    const customToken = await emitirSesionTenant(auth.uid, resultado.empresaId, resultado.rol);
    return { ...resultado, estado: "ACTIVE" as const, customToken };
  },
);
