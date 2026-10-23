import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { exigirRuntimeOfertaTenantPermitido } from "./approved-tenant-offers";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { facultadTransicionEmpresa, obtenerComandoComercial } from "./command-catalog";
import { ejecutarComandoComercial } from "./commercial-command-executor";
import { consultarOfertaComercialTenant } from "./commercial-offer-read";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

/**
 * Frontera comercial dedicada. Conserva exactamente el contrato y la
 * autorización de la callable que antes declaraba `saas-auth`.
 */
export const ejecutarComandoComercialSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as { tipo?: unknown; entrada?: unknown };
  const comando = obtenerComandoComercial(data?.tipo);
  if (!data || !data.entrada || typeof data.entrada !== "object" || Array.isArray(data.entrada)) {
    throw new HttpsError("invalid-argument", "ENTRADA_COMANDO_INVALIDA");
  }
  if (["CrearOfertaComercialTenant", "AprobarOfertaComercialTenant", "RevocarOfertaComercialTenant"].includes(comando.tipo)) {
    exigirRuntimeOfertaTenantPermitido();
  }
  const db = getFirestore();
  const entrada = data.entrada as { destino?: unknown; empresaId?: unknown };
  const facultad = comando.tipo === "TransicionarEmpresa"
    ? await facultadTransicionEmpresa(db, entrada.destino, entrada.empresaId)
    : comando.facultad;
  await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, facultad);
  return ejecutarComandoComercial(db, auth.uid, comando.tipo, data.entrada as never);
});

/** ADR-SAAS-061: lectura puntual de una oferta, protegida por la facultad comercial. */
type ConsultaOfertaDependencies = {
  getFirestore: () => Firestore;
  autorizar: typeof autorizarPlataforma;
  exigirRuntime: typeof exigirRuntimeOfertaTenantPermitido;
  consultarOferta: typeof consultarOfertaComercialTenant;
};

const ERRORES_CONSULTA_PUBLICOS = new Set([
  "permission-denied:PLATFORM_ACCESS_DENIED",
  "failed-precondition:PLATFORM_CONTEXT_STALE",
  "failed-precondition:OFERTA_COMERCIAL_RUNTIME_DENIED",
  "failed-precondition:OFERTA_COMERCIAL_APROBACION_NOT_FOUND",
  "failed-precondition:OFERTA_COMERCIAL_CONTROL_INEXISTENTE",
  "failed-precondition:OFERTA_COMERCIAL_CONTROL_INVALIDO",
  "failed-precondition:OFERTA_COMERCIAL_INVALIDA",
  "invalid-argument:OFERTA_COMERCIAL_APROBACION_INVALIDA",
  "invalid-argument:OFERTA_COMERCIAL_TERMINOS_CLIENTE_NO_ADMITIDOS",
  "invalid-argument:OFERTA_COMERCIAL_INVALIDA",
]);

function exigirRequestConsultaOferta(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_INVALIDA");
  }

  const payload = data as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (keys.length !== 1
    || keys[0] !== "codigoAprobacion"
    || !Object.hasOwn(payload, "codigoAprobacion")) {
    throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_INVALIDA");
  }

  const code = payload.codigoAprobacion;
  if (typeof code !== "string" || code.length === 0 || code.length > 64) {
    throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_INVALIDA");
  }
  for (let index = 0; index < code.length; index += 1) {
    if (code.charCodeAt(index) > 0x7f) {
      throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_INVALIDA");
    }
  }
  return code;
}

function normalizarErrorConsultaOferta(error: unknown): HttpsError {
  if (error instanceof HttpsError
    && ERRORES_CONSULTA_PUBLICOS.has(`${error.code}:${error.message}`)) {
    return new HttpsError(error.code, error.message);
  }
  return new HttpsError("internal", "OFERTA_COMERCIAL_LECTURA_ERROR");
}

/** Permite probar el contrato de entrada y errores sin servicios remotos. */
export function crearManejadorConsultaOfertaComercial(
  dependencies: ConsultaOfertaDependencies = {
    getFirestore,
    autorizar: autorizarPlataforma,
    exigirRuntime: exigirRuntimeOfertaTenantPermitido,
    consultarOferta: consultarOfertaComercialTenant,
  },
) {
  return async (request: CallableRequest<unknown>) => {
    const auth = exigirAuth(request);
    try {
      const db = dependencies.getFirestore();
      await dependencies.autorizar(
        db,
        auth.uid,
        auth.token as TokenPlataforma,
        "COMERCIAL_GOBERNAR",
      );
      const codigoAprobacion = exigirRequestConsultaOferta(request.data);
      dependencies.exigirRuntime();
      return await dependencies.consultarOferta(db, codigoAprobacion);
    } catch (error) {
      throw normalizarErrorConsultaOferta(error);
    }
  };
}

export const consultarOfertaComercialTenantSaas = onCall(
  { region: REGION },
  crearManejadorConsultaOfertaComercial(),
);
