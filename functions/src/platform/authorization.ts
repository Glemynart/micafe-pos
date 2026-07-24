import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { FacultadPlataforma, OperadorSaas } from "./contracts";
import { randomUUID } from "node:crypto";
import { registrarHechoAuditoria } from "./audit";

export const OPERADORES_COLLECTION = "saas_operadores";

export interface TokenPlataforma {
  saas?: {
    operador?: unknown;
    versionAutorizacion?: unknown;
    facultades?: unknown;
  };
}

export async function autorizarPlataforma(
  db: Firestore,
  uid: string,
  token: TokenPlataforma,
  facultad?: FacultadPlataforma,
): Promise<OperadorSaas> {
  const denegar = async (
    codigo: "AUTORIZACION_DENEGADA" | "OPERADOR_INACTIVO" | "FACULTAD_AUSENTE" | "CONTEXTO_PLATAFORMA_OBSOLETO",
    error: "PLATFORM_ACCESS_DENIED" | "PLATFORM_CONTEXT_STALE",
  ): Promise<never> => {
    const correlationId = randomUUID();
    try {
      await registrarHechoAuditoria(db, {
        tipo: codigo,
        resultado: "DENEGADO",
        actor: { tipo: "OPERADOR", uid },
        facultad: facultad ?? null,
        comando: { id: correlationId, tipo: "AutorizarOperacionPlataforma" },
        agregado: { tipo: "SEGURIDAD_PLATAFORMA", id: uid },
        empresaObjetivoId: null,
        revision: { esperada: null, resultante: null },
        correlacionId: correlationId,
        causacionId: null,
        motivo: { codigo, resumen: null },
      });
    } catch {
      // La autorización falla cerrada incluso si el escritor de evidencia está degradado.
    }
    throw new HttpsError(error === "PLATFORM_CONTEXT_STALE" ? "failed-precondition" : "permission-denied", error);
  };
  const snap = await db.collection(OPERADORES_COLLECTION).doc(uid).get();
  if (!snap.exists) return denegar("AUTORIZACION_DENEGADA", "PLATFORM_ACCESS_DENIED");
  const operador = snap.data() as OperadorSaas;
  if (
    operador.uid !== uid
    || operador.estado !== "ACTIVO"
    || operador.facultades.length === 0
    || token.saas?.operador !== true
  ) {
    return denegar("OPERADOR_INACTIVO", "PLATFORM_ACCESS_DENIED");
  }
  if (token.saas.versionAutorizacion !== operador.versionAutorizacion) {
    return denegar("CONTEXTO_PLATAFORMA_OBSOLETO", "PLATFORM_CONTEXT_STALE");
  }
  if (facultad && !operador.facultades.includes(facultad)) {
    return denegar("FACULTAD_AUSENTE", "PLATFORM_ACCESS_DENIED");
  }
  return operador;
}
