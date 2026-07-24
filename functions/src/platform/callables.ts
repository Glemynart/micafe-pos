import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import type { EnvelopePlataforma, FacultadPlataforma } from "./contracts";
import { ejecutarComandoOperador } from "./operators";
import { ejecutarComandoComercial, solicitarBootstrapEmpresarial } from "./operations";
import { obtenerComandoComercial } from "./command-catalog";
import { consultarAuditoriaPlataforma, listarRecursosPlataforma, obtenerDetalleEmpresaPlataforma, validarFiltroAuditoria, type RecursoPlataforma } from "./queries";
import { listarSoporteTenant, solicitarSoporte, transicionarSoporte } from "./support";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

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

export const solicitarBootstrapEmpresarialSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "BOOTSTRAP_EMPRESARIAL_SOLICITAR");
  return solicitarBootstrapEmpresarial(db, auth.uid, request.data as never);
});

export const ejecutarComandoComercialSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as { tipo?: unknown; entrada?: unknown };
  const comando = obtenerComandoComercial(data?.tipo);
  if (!data || !data.entrada || typeof data.entrada !== "object" || Array.isArray(data.entrada)) {
    throw new HttpsError("invalid-argument", "ENTRADA_COMANDO_INVALIDA");
  }
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, comando.facultad);
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
