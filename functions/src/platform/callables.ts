import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import type { EnvelopePlataforma, FacultadPlataforma } from "./contracts";
import { ejecutarComandoOperador } from "./operators";
import { provisionarCredencialInicialTenant, reemitirCredencialInicialTemporalTenant } from "./operations";
import { desbloquearAdministradorInicialTenant } from "./desbloquear-administrador-inicial-tenant";
import { obtenerDetalleEmpresaPlataforma } from "./queries";
import { listarSoporteTenant, solicitarSoporte, transicionarSoporte } from "./support";

const REGION = "us-central1";
// ADR-SAAS-013 — los flujos de credencial de plataforma hashean el PIN
// temporal con este secreto.
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

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
