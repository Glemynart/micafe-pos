import { randomUUID } from "node:crypto";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { esEnvironment, resolverBindingDusema, type BindingEnvironment, type DusemaPlatformBinding } from "./bindings";
import type { EnvelopePlataforma, FacultadPlataforma } from "./contracts";
import { registrarHechoAuditoria, type HechoAuditable } from "./audit";
import { createConfiguredDusemaS2sClient, DUSEMA_S2S_PRIVATE_KEY_PARAM, DusemaS2sError, proyectarTenantDusema, type DusemaTenantMetadata } from "./dusema-s2s-client";
import { ejecutarComandoOperador } from "./operators";
import { ejecutarComandoComercial, provisionarCredencialInicialTenant, reemitirCredencialInicialTemporalTenant, solicitarBootstrapEmpresarial } from "./operations";
import { desbloquearAdministradorInicialTenant } from "./desbloquear-administrador-inicial-tenant";
import { facultadTransicionEmpresa, obtenerComandoComercial } from "./command-catalog";
import { consultarAuditoriaPlataforma, listarRecursosPlataforma, obtenerDetalleEmpresaPlataforma, obtenerResumenOperadorSaas as consultarResumenOperadorSaas, validarFiltroAuditoria, type RecursoPlataforma } from "./queries";
import { listarSoporteTenant, solicitarSoporte, transicionarSoporte } from "./support";
import { exigirId } from "./validation";

const REGION = "us-central1";
// ADR-SAAS-013 — el paso H de ejecutarBootstrapEmpresarial (invocado por
// solicitarBootstrapEmpresarialSaas) hashea el PIN temporal con este secreto.
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const DUSEMA_S2S_ENVIRONMENT_PARAM = defineString("DUSEMA_S2S_ENVIRONMENT");

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
  try { value = DUSEMA_S2S_ENVIRONMENT_PARAM.value(); } catch { throw new HttpsError("failed-precondition", "DUSEMA_ENVIRONMENT_INVALIDO"); }
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

function crearHechoConsultaTenantDusema(params: { actorUid: string; empresaPosId: string | null; externalTenantId: string | null; environment: BindingEnvironment | null; correlationId: string; estado: string; resultado: HechoAuditable["resultado"]; codigoResultado: string }): HechoAuditable {
  return { tipo: "DUSEMA_TENANT_CONSULTADO", resultado: params.resultado, actor: { tipo: "OPERADOR", uid: params.actorUid }, facultad: DUSEMA_TENANT_READ_FACULTAD, comando: { id: params.correlationId, tipo: DUSEMA_CONSULTA_TIPO }, agregado: { tipo: "SEGURIDAD_PLATAFORMA", id: params.empresaPosId ? `DUSEMA:${params.empresaPosId}` : "DUSEMA:VALIDACION" }, empresaObjetivoId: params.empresaPosId, revision: { esperada: null, resultante: null }, correlacionId: params.correlationId, causacionId: null, motivo: { codigo: params.codigoResultado, resumen: null }, detalle: { producto: "DUSEMA", environment: params.environment, externalTenantId: params.externalTenantId, estado: params.estado } };
}

async function auditarConsultaTenantDusema(db: Firestore, hecho: HechoAuditable, audit: DependenciasConsultaTenantDusema["audit"]): Promise<void> {
  try { await (audit ?? registrarHechoAuditoria)(db, hecho); } catch { throw new HttpsError("internal", "AUDITORIA_NO_DISPONIBLE"); }
}

function normalizarErrorConsulta(error: unknown): HttpsError {
  if (error instanceof HttpsError && (error.message === "EMPRESA_NOT_FOUND" || error.message === "DUSEMA_ENVIRONMENT_INVALIDO" || error.message === "BINDING_NO_ACTIVO" || error.message.startsWith("BINDING_"))) return error;
  return new HttpsError("internal", "DUSEMA_QUERY_FAILED");
}

function esBindingActivoConsistente(binding: DusemaPlatformBinding, empresaPosId: string, environment: BindingEnvironment): boolean {
  return binding.productCode === "DUSEMA" && binding.environment === environment && binding.empresaPosId === empresaPosId && binding.estado === "ACTIVO" && typeof binding.externalTenantId === "string" && binding.externalTenantId.length > 0;
}

export async function ejecutarConsultaTenantDusema(request: RequestConsultaTenantDusema, dependencies: DependenciasConsultaTenantDusema = {}): Promise<RespuestaConsultaTenantDusema> {
  const auth = exigirAuth(request);
  const db = dependencies.db ?? getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, DUSEMA_TENANT_READ_FACULTAD);
  const correlationId = dependencies.correlationId?.() ?? randomUUID();
  let empresaPosId: string;
  try { empresaPosId = exigirEmpresaPosId(request.data); } catch (error) {
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId: null, externalTenantId: null, environment: null, correlationId, estado: "ENTRADA_INVALIDA", resultado: "DENEGADO", codigoResultado: "ENTRADA_DUSEMA_INVALIDA" }), dependencies.audit);
    throw error;
  }
  let environment: BindingEnvironment;
  try { environment = dependencies.environment ?? obtenerEnvironmentConfigurado(); } catch (error) {
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: null, environment: null, correlationId, estado: "ERROR_CONFIGURACION", resultado: resultadoAuditoriaError(error), codigoResultado: codigoError(error) }), dependencies.audit);
    throw normalizarErrorConsulta(error);
  }
  let binding: DusemaPlatformBinding | null;
  try { binding = await (dependencies.resolver ?? resolverBindingDusema)(db, empresaPosId, environment); } catch (error) {
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: null, environment, correlationId, estado: "BINDING_INVALIDO", resultado: resultadoAuditoriaError(error), codigoResultado: codigoError(error) }), dependencies.audit);
    throw normalizarErrorConsulta(error);
  }
  if (!binding) {
    const respuesta: RespuestaConsultaTenantDusema = { estado: "NO_VINCULADO", tenant: null };
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: null, environment, correlationId, estado: respuesta.estado, resultado: "CONFIRMADO", codigoResultado: respuesta.estado }), dependencies.audit);
    return respuesta;
  }
  if (!esBindingActivoConsistente(binding, empresaPosId, environment)) {
    const error = new HttpsError("failed-precondition", "BINDING_INCONSISTENTE");
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: typeof binding.externalTenantId === "string" ? binding.externalTenantId : null, environment, correlationId, estado: "BINDING_INVALIDO", resultado: "CONFLICTO", codigoResultado: error.message }), dependencies.audit);
    throw error;
  }
  try {
    const tenant = proyectarTenantDusema(await (dependencies.client ?? createConfiguredDusemaS2sClient()).getTenant(binding.externalTenantId, { actorUid: auth.uid, empresaPosId, correlationId }));
    const respuesta: RespuestaConsultaTenantDusema = { estado: tenant.activo ? "ACTIVO" : "INACTIVO", tenant };
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: binding.externalTenantId, environment, correlationId, estado: respuesta.estado, resultado: "CONFIRMADO", codigoResultado: respuesta.estado }), dependencies.audit);
    return respuesta;
  } catch (error) {
    if (error instanceof DusemaS2sError && error.code === "DUSEMA_TENANT_NOT_FOUND") {
      const respuesta: RespuestaConsultaTenantDusema = { estado: "NO_ENCONTRADO", tenant: null };
      await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: binding.externalTenantId, environment, correlationId, estado: respuesta.estado, resultado: "CONFIRMADO", codigoResultado: respuesta.estado }), dependencies.audit);
      return respuesta;
    }
    if (error instanceof DusemaS2sError && (error.code === "DUSEMA_TIMEOUT" || error.code === "DUSEMA_UNAVAILABLE")) {
      const respuesta: RespuestaConsultaTenantDusema = { estado: "ERROR_TEMPORAL", tenant: null };
      await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: binding.externalTenantId, environment, correlationId, estado: respuesta.estado, resultado: "FALLO_RECUPERABLE", codigoResultado: error.code }), dependencies.audit);
      return respuesta;
    }
    const respuestaError = error instanceof DusemaS2sError && (error.code === "DUSEMA_UNAUTHORIZED" || error.code === "DUSEMA_FORBIDDEN") ? new HttpsError("permission-denied", "DUSEMA_ACCESS_DENIED") : new HttpsError("internal", "DUSEMA_QUERY_FAILED");
    await auditarConsultaTenantDusema(db, crearHechoConsultaTenantDusema({ actorUid: auth.uid, empresaPosId, externalTenantId: binding.externalTenantId, environment, correlationId, estado: "ERROR", resultado: respuestaError.code === "permission-denied" ? "DENEGADO" : "FALLO_RECUPERABLE", codigoResultado: codigoError(error) }), dependencies.audit);
    throw respuestaError;
  }
}

export const consultarTenantDusemaSaas = onCall(
  { region: REGION, secrets: [DUSEMA_S2S_PRIVATE_KEY_PARAM] },
  async (request) => ejecutarConsultaTenantDusema({ data: request.data, auth: request.auth ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> } : null }),
);

export const consultarContextoPlataforma = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const operador = await autorizarPlataforma(getFirestore(), auth.uid, auth.token);
  return {
    uid: operador.uid,
    estado: operador.estado,
    facultades: operador.facultades,
    versionAutorizacion: operador.versionAutorizacion,
  };
});

type DatosOperador = EnvelopePlataforma & {
  objetivoUid: string;
  expectedVersionAutorizacion?: number;
  facultades?: FacultadPlataforma[];
};

function callableOperador(
  tipo: Parameters<typeof ejecutarComandoOperador>[2],
) {
  return onCall({ region: REGION }, async (request) => {
    const auth = exigirAuth(request);
    const db = getFirestore();
    await autorizarPlataforma(db, auth.uid, auth.token, "OPERADORES_GOBERNAR");
    return ejecutarComandoOperador(db, auth.uid, tipo, request.data as DatosOperador);
  });
}

export const incorporarOperadorSaas = callableOperador("IncorporarOperador");
export const cambiarFacultadesOperadorSaas = callableOperador("CambiarFacultadesOperador");
export const suspenderOperadorSaas = callableOperador("SuspenderOperador");
export const reactivarOperadorSaas = callableOperador("ReactivarOperador");
export const revocarOperadorSaas = callableOperador("RevocarOperador");

export const solicitarBootstrapEmpresarialSaas = onCall({ region: REGION, secrets: [PIN_PEPPER] }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "BOOTSTRAP_EMPRESARIAL_SOLICITAR");
  return solicitarBootstrapEmpresarial(db, auth.uid, request.data as never);
});

// ADR-SAAS-013 §4.2 — misma facultad que gobierna el resto del ciclo de vida
// operativo del tenant (activar/suspender/reactivar): "poder ser usada por
// primera vez" pertenece a esa misma categoría, sin crear una facultad nueva.
export const provisionarCredencialInicialTenantSaas = onCall({ region: REGION, secrets: [PIN_PEPPER] }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "LIFECYCLE_GOBERNAR");
  const data = request.data as (EnvelopePlataforma & { empresaId?: unknown }) | undefined;
  if (!data || typeof data.empresaId !== "string") {
    throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  }
  return provisionarCredencialInicialTenant(db, auth.uid, data as EnvelopePlataforma & { empresaId: string });
});

export const reemitirCredencialInicialTemporalSaas = onCall({ region: REGION, secrets: [PIN_PEPPER] }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "LIFECYCLE_GOBERNAR");
  const data = request.data as (EnvelopePlataforma & { empresaId?: unknown; incorporacionId?: unknown }) | undefined;
  if (!data || typeof data.empresaId !== "string") throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  if (typeof data.incorporacionId !== "string" || !data.incorporacionId.trim()) {
    throw new HttpsError("invalid-argument", "INCORPORACION_ID_INVALIDO");
  }
  return reemitirCredencialInicialTemporalTenant(
    db,
    auth.uid,
    data as EnvelopePlataforma & { empresaId: string; incorporacionId: string },
    auth.token as TokenPlataforma,
  );
});

export const desbloquearAdministradorInicialTenantSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "LIFECYCLE_GOBERNAR");
  const data = request.data as (EnvelopePlataforma & { empresaId?: unknown }) | undefined;
  if (!data || typeof data.empresaId !== "string") throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  return desbloquearAdministradorInicialTenant(db, auth.uid, data as EnvelopePlataforma & { empresaId: string }, auth.token as TokenPlataforma);
});

export const ejecutarComandoComercialSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as { tipo?: unknown; entrada?: unknown };
  const comando = obtenerComandoComercial(data?.tipo);
  if (!data || !data.entrada || typeof data.entrada !== "object" || Array.isArray(data.entrada)) {
    throw new HttpsError("invalid-argument", "ENTRADA_COMANDO_INVALIDA");
  }
  const db = getFirestore();
  const entrada = data.entrada as { destino?: unknown; empresaId?: unknown };
  // Archivar, restaurar y eliminar Empresa exigen CONSERVACION_GOBERNAR, separada de
  // LIFECYCLE_GOBERNAR (ADR-SAAS-011 §3.3, MT-U9 §B2.7); ver command-catalog.ts.
  const facultad = comando.tipo === "TransicionarEmpresa"
    ? await facultadTransicionEmpresa(db, entrada.destino, entrada.empresaId)
    : comando.facultad;
  await autorizarPlataforma(db, auth.uid, auth.token, facultad);
  return ejecutarComandoComercial(db, auth.uid, comando.tipo, data.entrada as never);
});

export const listarRecursosPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  const data = request.data as { recurso: RecursoPlataforma; limite?: number; estado?: string; empresaId?: string; cursor?: string };
  if (data.recurso === "operadores") {
    await autorizarPlataforma(db, auth.uid, auth.token, "OPERADORES_GOBERNAR");
  }
  return listarRecursosPlataforma(db, data.recurso, {
    ...data,
    ...(data.recurso === "soporte" ? { operadorUid: auth.uid } : {}),
  });
});

export const obtenerDetalleEmpresaPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  const data = request.data as { empresaId?: unknown };
  if (typeof data.empresaId !== "string") throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  return obtenerDetalleEmpresaPlataforma(db, data.empresaId);
});

export const obtenerResumenOperadorSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  return consultarResumenOperadorSaas(db);
});

export const solicitarSoporteSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  return solicitarSoporte(getFirestore(), auth.uid, auth.token, request.data as never);
});

export const transicionarSoporteSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as {
    destino: "AUTORIZADA" | "RECHAZADA" | "EN_SESION" | "FINALIZADA" | "REVOCADA";
    entrada: Record<string, unknown>;
  };
  return transicionarSoporte(
    getFirestore(),
    { uid: auth.uid, token: auth.token },
    data.destino,
    data.entrada as never,
  );
});

export const listarSoporteTenantSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const empresaId = auth.token.empresaId;
  if (typeof empresaId !== "string") throw new HttpsError("permission-denied", "TENANT_CONTEXT_REQUIRED");
  return listarSoporteTenant(getFirestore(), auth.uid, empresaId);
});

export const consultarAuditoriaPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  const data = request.data as { filtro?: unknown; limite?: number; cursor?: unknown };
  if (data.cursor !== undefined && typeof data.cursor !== "string") {
    throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
  }
  return consultarAuditoriaPlataforma(db, validarFiltroAuditoria(data.filtro), data.limite, data.cursor);
});
