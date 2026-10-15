import { randomUUID } from "node:crypto";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { esEnvironment, resolverBindingDusema, type BindingEnvironment, type DusemaPlatformBinding } from "./bindings";
import { registrarHechoAuditoria, type HechoAuditable } from "./audit";
import {
  createConfiguredDusemaS2sClient,
  DUSEMA_ADMIN_BASE_URL_PARAM,
  DUSEMA_S2S_AUDIENCE_PARAM,
  DUSEMA_S2S_ISSUER_PARAM,
  DUSEMA_S2S_KID_PARAM,
  DUSEMA_S2S_PRIVATE_KEY_PARAM,
  DusemaS2sError,
  proyectarTenantDusema,
  type DusemaTenantMetadata,
} from "./dusema-s2s-client";
import { exigirId } from "./validation";

const REGION = "us-central1";
const DUSEMA_S2S_ENVIRONMENT_PARAM = defineSecret("DUSEMA_S2S_ENVIRONMENT");
const DUSEMA_TENANT_READ_FACULTAD = "DUSEMA_TENANT_CONSULTAR" as const;
const DUSEMA_CONSULTA_TIPO = "ConsultarTenantDusema";

export type EstadoConsultaTenantDusema =
  | "NO_VINCULADO"
  | "ACTIVO"
  | "INACTIVO"
  | "NO_ENCONTRADO"
  | "ERROR_TEMPORAL";

export interface RespuestaConsultaTenantDusema {
  estado: EstadoConsultaTenantDusema;
  tenant: DusemaTenantMetadata | null;
}

interface RequestConsultaTenantDusema {
  data?: unknown;
  auth?: { uid: string; token: Record<string, unknown> } | null;
}

interface DependenciasConsultaTenantDusema {
  db?: Firestore;
  environment?: BindingEnvironment;
  resolver?: typeof resolverBindingDusema;
  client?: Pick<ReturnType<typeof createConfiguredDusemaS2sClient>, "getTenant">;
  correlationId?: () => string;
  audit?: (db: Firestore, hecho: HechoAuditable) => Promise<void>;
}

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

function esRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exigirEmpresaPosId(data: unknown): string {
  if (!esRecord(data)) throw new HttpsError("invalid-argument", "ENTRADA_DUSEMA_INVALIDA");
  if (!Object.hasOwn(data, "empresaPosId")) throw new HttpsError("invalid-argument", "EMPRESA_POS_ID_INVALIDO");
  if (Object.keys(data).length !== 1) throw new HttpsError("invalid-argument", "ENTRADA_DUSEMA_INVALIDA");
  return exigirId(data.empresaPosId, "EMPRESA_POS_ID_INVALIDO");
}

function obtenerEnvironmentConfigurado(): BindingEnvironment {
  let value: unknown;
  try {
    value = DUSEMA_S2S_ENVIRONMENT_PARAM.value();
  } catch {
    throw new HttpsError("failed-precondition", "DUSEMA_ENVIRONMENT_INVALIDO");
  }
  if (!esEnvironment(value)) throw new HttpsError("failed-precondition", "DUSEMA_ENVIRONMENT_INVALIDO");
  return value;
}

function codigoError(error: unknown): string {
  if (error instanceof DusemaS2sError) return error.code;
  if (error instanceof HttpsError) return error.message;
  return "DUSEMA_QUERY_FAILED";
}

function resultadoAuditoriaError(error: unknown): HechoAuditable["resultado"] {
  if (error instanceof HttpsError && error.code === "failed-precondition") return "CONFLICTO";
  if (error instanceof HttpsError && error.code === "permission-denied") return "DENEGADO";
  return "FALLO_RECUPERABLE";
}

function crearHechoConsultaTenantDusema(params: {
  actorUid: string;
  empresaPosId: string | null;
  externalTenantId: string | null;
  environment: BindingEnvironment | null;
  correlationId: string;
  estado: string;
  resultado: HechoAuditable["resultado"];
  codigoResultado: string;
}): HechoAuditable {
  return {
    tipo: "DUSEMA_TENANT_CONSULTADO",
    resultado: params.resultado,
    actor: { tipo: "OPERADOR", uid: params.actorUid },
    facultad: DUSEMA_TENANT_READ_FACULTAD,
    comando: { id: params.correlationId, tipo: DUSEMA_CONSULTA_TIPO },
    agregado: {
      tipo: "SEGURIDAD_PLATAFORMA",
      id: params.empresaPosId ? `DUSEMA:${params.empresaPosId}` : "DUSEMA:VALIDACION",
    },
    empresaObjetivoId: params.empresaPosId,
    revision: { esperada: null, resultante: null },
    correlacionId: params.correlationId,
    causacionId: null,
    motivo: { codigo: params.codigoResultado, resumen: null },
    detalle: {
      producto: "DUSEMA",
      environment: params.environment,
      externalTenantId: params.externalTenantId,
      estado: params.estado,
    },
  };
}

async function auditarConsultaTenantDusema(
  db: Firestore,
  hecho: HechoAuditable,
  audit: DependenciasConsultaTenantDusema["audit"],
): Promise<void> {
  try {
    await (audit ?? registrarHechoAuditoria)(db, hecho);
  } catch {
    throw new HttpsError("internal", "AUDITORIA_NO_DISPONIBLE");
  }
}

function normalizarErrorConsulta(error: unknown): HttpsError {
  if (
    error instanceof HttpsError
    && (
      error.message === "EMPRESA_NOT_FOUND"
      || error.message === "DUSEMA_ENVIRONMENT_INVALIDO"
      || error.message === "BINDING_NO_ACTIVO"
      || error.message.startsWith("BINDING_")
    )
  ) return error;
  return new HttpsError("internal", "DUSEMA_QUERY_FAILED");
}

function esBindingActivoConsistente(
  binding: DusemaPlatformBinding,
  empresaPosId: string,
  environment: BindingEnvironment,
): boolean {
  return binding.productCode === "DUSEMA"
    && binding.environment === environment
    && binding.empresaPosId === empresaPosId
    && binding.estado === "ACTIVO"
    && typeof binding.externalTenantId === "string"
    && binding.externalTenantId.length > 0;
}

export async function ejecutarConsultaTenantDusema(
  request: RequestConsultaTenantDusema,
  dependencies: DependenciasConsultaTenantDusema = {},
): Promise<RespuestaConsultaTenantDusema> {
  const auth = exigirAuth(request);
  const db = dependencies.db ?? getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, DUSEMA_TENANT_READ_FACULTAD);
  const correlationId = dependencies.correlationId?.() ?? randomUUID();
  let empresaPosId: string;
  try {
    empresaPosId = exigirEmpresaPosId(request.data);
  } catch (error) {
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId: null,
        externalTenantId: null,
        environment: null,
        correlationId,
        estado: "ENTRADA_INVALIDA",
        resultado: "DENEGADO",
        codigoResultado: "ENTRADA_DUSEMA_INVALIDA",
      }),
      dependencies.audit,
    );
    throw error;
  }

  let environment: BindingEnvironment;
  try {
    environment = dependencies.environment ?? obtenerEnvironmentConfigurado();
  } catch (error) {
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: null,
        environment: null,
        correlationId,
        estado: "ERROR_CONFIGURACION",
        resultado: resultadoAuditoriaError(error),
        codigoResultado: codigoError(error),
      }),
      dependencies.audit,
    );
    throw normalizarErrorConsulta(error);
  }

  let binding: DusemaPlatformBinding | null;
  try {
    binding = await (dependencies.resolver ?? resolverBindingDusema)(db, empresaPosId, environment);
  } catch (error) {
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: null,
        environment,
        correlationId,
        estado: "BINDING_INVALIDO",
        resultado: resultadoAuditoriaError(error),
        codigoResultado: codigoError(error),
      }),
      dependencies.audit,
    );
    throw normalizarErrorConsulta(error);
  }

  if (!binding) {
    const response: RespuestaConsultaTenantDusema = { estado: "NO_VINCULADO", tenant: null };
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: null,
        environment,
        correlationId,
        estado: response.estado,
        resultado: "CONFIRMADO",
        codigoResultado: response.estado,
      }),
      dependencies.audit,
    );
    return response;
  }

  if (!esBindingActivoConsistente(binding, empresaPosId, environment)) {
    const error = new HttpsError("failed-precondition", "BINDING_INCONSISTENTE");
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: typeof binding.externalTenantId === "string" ? binding.externalTenantId : null,
        environment,
        correlationId,
        estado: "BINDING_INVALIDO",
        resultado: "CONFLICTO",
        codigoResultado: error.message,
      }),
      dependencies.audit,
    );
    throw error;
  }

  try {
    const tenant = proyectarTenantDusema(
      await (dependencies.client ?? createConfiguredDusemaS2sClient()).getTenant(
        binding.externalTenantId,
        { actorUid: auth.uid, empresaPosId, correlationId },
      ),
    );
    const response: RespuestaConsultaTenantDusema = { estado: tenant.activo ? "ACTIVO" : "INACTIVO", tenant };
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: binding.externalTenantId,
        environment,
        correlationId,
        estado: response.estado,
        resultado: "CONFIRMADO",
        codigoResultado: response.estado,
      }),
      dependencies.audit,
    );
    return response;
  } catch (error) {
    if (error instanceof DusemaS2sError && error.code === "DUSEMA_TENANT_NOT_FOUND") {
      const response: RespuestaConsultaTenantDusema = { estado: "NO_ENCONTRADO", tenant: null };
      await auditarConsultaTenantDusema(
        db,
        crearHechoConsultaTenantDusema({
          actorUid: auth.uid,
          empresaPosId,
          externalTenantId: binding.externalTenantId,
          environment,
          correlationId,
          estado: response.estado,
          resultado: "CONFIRMADO",
          codigoResultado: response.estado,
        }),
        dependencies.audit,
      );
      return response;
    }
    if (error instanceof DusemaS2sError && (error.code === "DUSEMA_TIMEOUT" || error.code === "DUSEMA_UNAVAILABLE")) {
      const response: RespuestaConsultaTenantDusema = { estado: "ERROR_TEMPORAL", tenant: null };
      await auditarConsultaTenantDusema(
        db,
        crearHechoConsultaTenantDusema({
          actorUid: auth.uid,
          empresaPosId,
          externalTenantId: binding.externalTenantId,
          environment,
          correlationId,
          estado: response.estado,
          resultado: "FALLO_RECUPERABLE",
          codigoResultado: error.code,
        }),
        dependencies.audit,
      );
      return response;
    }

    const responseError = error instanceof DusemaS2sError
      && (error.code === "DUSEMA_UNAUTHORIZED" || error.code === "DUSEMA_FORBIDDEN")
      ? new HttpsError("permission-denied", "DUSEMA_ACCESS_DENIED")
      : new HttpsError("internal", "DUSEMA_QUERY_FAILED");
    await auditarConsultaTenantDusema(
      db,
      crearHechoConsultaTenantDusema({
        actorUid: auth.uid,
        empresaPosId,
        externalTenantId: binding.externalTenantId,
        environment,
        correlationId,
        estado: "ERROR",
        resultado: responseError.code === "permission-denied" ? "DENEGADO" : "FALLO_RECUPERABLE",
        codigoResultado: codigoError(error),
      }),
      dependencies.audit,
    );
    throw responseError;
  }
}

export const consultarTenantDusemaSaas = onCall(
  {
    region: REGION,
    secrets: [
      DUSEMA_ADMIN_BASE_URL_PARAM,
      DUSEMA_S2S_ISSUER_PARAM,
      DUSEMA_S2S_AUDIENCE_PARAM,
      DUSEMA_S2S_KID_PARAM,
      DUSEMA_S2S_ENVIRONMENT_PARAM,
      DUSEMA_S2S_PRIVATE_KEY_PARAM,
    ],
  },
  async (request) => ejecutarConsultaTenantDusema({
    data: request.data,
    auth: request.auth ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> } : null,
  }),
);
