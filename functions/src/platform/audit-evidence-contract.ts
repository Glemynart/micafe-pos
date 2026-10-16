import { Timestamp } from "firebase-admin/firestore";
import type { CompatibilidadEvidenciaAuditoria } from "../../../lib/platform/audit-evidence-types";
import { TIPOS_AGREGADO_AUDITORIA, TIPOS_AUDITORIA, type TipoAgregadoAuditoria, type TipoAuditoria } from "./contracts";

export type InspeccionEvidenciaAuditoria = {
  compatibilidad: CompatibilidadEvidenciaAuditoria;
  diagnostico?: string;
  detalleValido?: Record<string, unknown>;
  detalleDiagnostico?: { campos: string[]; tipos: Record<string, string> };
};

const TIPOS_CONTROL_COMPRAS = new Set([
  "COMPRAS_CONTROL_INICIALIZADO",
  "COMPRAS_PAUSADAS",
  "COMPRAS_REANUDADAS",
  "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA",
]);
const TRANSICIONES_V2 = new Set([
  "COMPRAS_CONTROL_INICIALIZADO",
  "COMPRAS_PAUSADAS",
  "COMPRAS_REANUDADAS",
]);
const HEX_SHA_256 = /^[a-f0-9]{64}$/;
const RELEASE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPOS_EVIDENCIA = new Set([
  "schemaVersion", "evidenciaId", "tipo", "resultado", "origen", "actor", "facultad", "comando",
  "agregado", "empresaObjetivoId", "revision", "correlacionId", "causacionId", "motivo", "soporte",
  "ocurrioEn", "registradoEn", "detalle",
]);

function esObjeto(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function objetoExacto(value: unknown, keys: string[]): value is Record<string, unknown> {
  return esObjeto(value)
    && Object.keys(value).every((key) => keys.includes(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

function esTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp
    && Number.isSafeInteger(value.seconds)
    && Number.isInteger(value.nanoseconds)
    && value.nanoseconds >= 0
    && value.nanoseconds < 1_000_000_000;
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && HEX_SHA_256.test(value);
}

function detalleTransicionValido(tipo: string, detalle: unknown, revision: Record<string, unknown>): boolean {
  if (!esObjeto(detalle)) return false;
  const keys = Object.keys(detalle);
  const tieneAtestacion = Object.hasOwn(detalle, "verificacionRelease");
  const esperadas = tieneAtestacion ? ["estado", "fingerprint", "verificacionRelease"] : ["estado", "fingerprint"];
  if (keys.length !== esperadas.length || keys.some((key) => !esperadas.includes(key))) return false;
  if (!sha256(detalle.fingerprint)) return false;

  if (tipo === "COMPRAS_CONTROL_INICIALIZADO") {
    return revision.esperada === 0 && revision.resultante === 1
      && (detalle.estado === "ACTIVA" || detalle.estado === "PAUSADA")
      && !tieneAtestacion;
  }
  if (!Number.isSafeInteger(revision.esperada) || (revision.esperada as number) < 1
    || revision.resultante !== (revision.esperada as number) + 1) return false;
  if (tipo === "COMPRAS_PAUSADAS") return detalle.estado === "PAUSADA" && !tieneAtestacion;
  if (tipo !== "COMPRAS_REANUDADAS" || detalle.estado !== "ACTIVA" || !tieneAtestacion) return false;

  const atestacion = detalle.verificacionRelease;
  return objetoExacto(atestacion, ["functionArtifactSha", "rulesetHash", "releaseReferencia"])
    && sha256(atestacion.functionArtifactSha)
    && sha256(atestacion.rulesetHash)
    && typeof atestacion.releaseReferencia === "string"
    && RELEASE_REFERENCE.test(atestacion.releaseReferencia);
}

function detalleCorrectivoValido(detalle: unknown, revision: Record<string, unknown>): boolean {
  if (!objetoExacto(detalle, ["evidenciaOriginalId", "tipoOriginal", "tipoCorregido", "revisionOriginal", "estadoDestinoOriginal", "ocurrioEnOriginal"])) return false;
  const revisionOriginal = detalle.revisionOriginal;
  return objetoExacto(revisionOriginal, ["esperada", "resultante"])
    && revision.esperada === null && revision.resultante === null
    && revisionOriginal.esperada === 0 && revisionOriginal.resultante === 1
    && detalle.tipoOriginal === "COMPRAS_REANUDADAS"
    && detalle.tipoCorregido === "COMPRAS_CONTROL_INICIALIZADO"
    && detalle.estadoDestinoOriginal === "ACTIVA"
    && typeof detalle.evidenciaOriginalId === "string" && UUID.test(detalle.evidenciaOriginalId)
    && esTimestamp(detalle.ocurrioEnOriginal);
}

function detalleV1HistoricoValido(tipo: string, detalle: unknown, revision: Record<string, unknown>): boolean {
  if (!TIPOS_CONTROL_COMPRAS.has(tipo) || tipo === "COMPRAS_CONTROL_INICIALIZADO" || tipo === "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA") return false;
  if (!esObjeto(detalle)) return false;
  const keys = Object.keys(detalle);
  if (!(["estado", "fingerprint"].every((key) => keys.includes(key))
    && keys.every((key) => ["estado", "fingerprint", "verificacionRelease"].includes(key)))) return false;
  if ((detalle.estado !== "ACTIVA" && detalle.estado !== "PAUSADA") || !sha256(detalle.fingerprint)) return false;
  if (tipo === "COMPRAS_PAUSADAS" && detalle.estado !== "PAUSADA") return false;
  if (tipo === "COMPRAS_REANUDADAS" && detalle.estado !== "ACTIVA") return false;
  if (Object.hasOwn(detalle, "verificacionRelease")) {
    const attestation = detalle.verificacionRelease;
    return tipo === "COMPRAS_REANUDADAS"
      && objetoExacto(attestation, ["functionArtifactSha", "rulesetHash", "releaseReferencia"])
      && [attestation.functionArtifactSha, attestation.rulesetHash, attestation.releaseReferencia]
        .every((value) => typeof value === "string" && value.length > 0 && value.length <= 128);
  }
  // v1 pudo registrar una inicialización como reanudación con 0 → 1 y destino ACTIVA.
  if (tipo === "COMPRAS_REANUDADAS" && revision.esperada === 0 && revision.resultante === 1) return true;
  return tipo === "COMPRAS_PAUSADAS" || tipo === "COMPRAS_REANUDADAS";
}

function validarEnvoltura(docId: string, data: Record<string, unknown>): string | null {
  if (Object.keys(data).some((key) => !CAMPOS_EVIDENCIA.has(key))) return "CAMPOS_NO_PERMITIDOS";
  const requeridos = [...CAMPOS_EVIDENCIA].filter((key) => key !== "detalle");
  if (requeridos.some((key) => !Object.hasOwn(data, key))) return "CAMPO_REQUERIDO_AUSENTE";
  if (data.evidenciaId !== docId || typeof data.evidenciaId !== "string" || !UUID.test(data.evidenciaId)) return "EVIDENCIA_ID_INVALIDO";
  if (typeof data.tipo !== "string" || !TIPOS_AUDITORIA.includes(data.tipo as TipoAuditoria)) return "TIPO_INVALIDO";
  if (!["CONFIRMADO", "DENEGADO", "CONFLICTO", "FALLO_RECUPERABLE"].includes(String(data.resultado))) return "RESULTADO_INVALIDO";
  if (!["PLATAFORMA", "SISTEMA", "SOPORTE"].includes(String(data.origen))) return "ORIGEN_INVALIDO";
  if (!objetoExacto(data.actor, ["tipo", "uid"])) return "ACTOR_INVALIDO";
  if ((data.actor.tipo === "OPERADOR" && (typeof data.actor.uid !== "string" || !data.actor.uid))
    || ((data.actor.tipo === "SISTEMA" || data.actor.tipo === "ADMIN_TENANT")
      && (data.actor.tipo === "SISTEMA" ? data.actor.uid !== null : (typeof data.actor.uid !== "string" || !data.actor.uid)))
    || !["OPERADOR", "SISTEMA", "ADMIN_TENANT"].includes(String(data.actor.tipo))) return "ACTOR_INVALIDO";
  if (data.facultad !== null && (typeof data.facultad !== "string" || !data.facultad)) return "FACULTAD_INVALIDA";
  if (data.comando !== null && (!objetoExacto(data.comando, ["id", "tipo"])
    || typeof data.comando.id !== "string" || !data.comando.id || data.comando.id.length > 128
    || typeof data.comando.tipo !== "string" || !data.comando.tipo || data.comando.tipo.length > 128)) return "COMANDO_INVALIDO";
  if (!objetoExacto(data.agregado, ["tipo", "id"])
    || typeof data.agregado.tipo !== "string" || !TIPOS_AGREGADO_AUDITORIA.includes(data.agregado.tipo as TipoAgregadoAuditoria)
    || typeof data.agregado.id !== "string" || !data.agregado.id || data.agregado.id.length > 256) return "AGREGADO_INVALIDO";
  if (data.empresaObjetivoId !== null && (typeof data.empresaObjetivoId !== "string" || !data.empresaObjetivoId || data.empresaObjetivoId.length > 256)) return "EMPRESA_OBJETIVO_INVALIDA";
  if (!objetoExacto(data.revision, ["esperada", "resultante"])) return "REVISION_INVALIDA";
  for (const value of [data.revision.esperada, data.revision.resultante]) {
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) return "REVISION_INVALIDA";
  }
  if (typeof data.correlacionId !== "string" || !data.correlacionId || data.correlacionId.length > 128) return "CORRELACION_INVALIDA";
  if (data.causacionId !== null && (typeof data.causacionId !== "string" || !data.causacionId || data.causacionId.length > 128)) return "CAUSACION_INVALIDA";
  if (data.causacionId === docId) return "CAUSACION_INVALIDA";
  if (!objetoExacto(data.motivo, ["codigo", "resumen"]) || typeof data.motivo.codigo !== "string"
    || !data.motivo.codigo || data.motivo.codigo.length > 128
    || (data.motivo.resumen !== null && (typeof data.motivo.resumen !== "string" || data.motivo.resumen.length > 256))) return "MOTIVO_INVALIDO";
  if (data.soporte !== null && (!objetoExacto(data.soporte, ["autorizacionId", "sesionId", "alcanceCodigo"])
    || typeof data.soporte.autorizacionId !== "string" || !data.soporte.autorizacionId
    || (data.soporte.sesionId !== null && typeof data.soporte.sesionId !== "string")
    || typeof data.soporte.alcanceCodigo !== "string" || !data.soporte.alcanceCodigo)) return "SOPORTE_INVALIDO";
  if (!esTimestamp(data.ocurrioEn) || !esTimestamp(data.registradoEn)
    || data.registradoEn.toMillis() < data.ocurrioEn.toMillis()) return "TIMESTAMP_INVALIDO";
  return null;
}

function diagnosticarDetalle(value: unknown): InspeccionEvidenciaAuditoria["detalleDiagnostico"] {
  if (!esObjeto(value)) return { campos: [], tipos: { detalle: value === null ? "null" : typeof value } };
  return {
    campos: Object.keys(value).sort(),
    tipos: Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      item === null ? "null" : Array.isArray(item) ? "array" : typeof item,
    ])),
  };
}

export function inspeccionarEvidenciaAuditoria(docId: string, input: unknown): InspeccionEvidenciaAuditoria {
  if (!esObjeto(input)) return { compatibilidad: "INVALIDA", diagnostico: "EVIDENCIA_NO_ES_OBJETO" };
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
    return { compatibilidad: "NO_SOPORTADA", diagnostico: "VERSION_NO_SOPORTADA" };
  }
  const envoltura = validarEnvoltura(docId, input);
  if (envoltura) return {
    compatibilidad: "INVALIDA",
    diagnostico: envoltura,
    detalleDiagnostico: Object.hasOwn(input, "detalle") ? diagnosticarDetalle(input.detalle) : undefined,
  };
  const tipo = input.tipo as string;
  if (input.schemaVersion === 1) {
    if (TIPOS_CONTROL_COMPRAS.has(tipo) && !detalleV1HistoricoValido(tipo, input.detalle, input.revision as Record<string, unknown>)) {
      return { compatibilidad: "INVALIDA", diagnostico: "DETALLE_V1_INVALIDO", detalleDiagnostico: diagnosticarDetalle(input.detalle) };
    }
    return {
      compatibilidad: "SOPORTADA",
      ...(TIPOS_CONTROL_COMPRAS.has(tipo) ? { detalleValido: input.detalle as Record<string, unknown> } : {}),
    };
  }
  if (!TIPOS_CONTROL_COMPRAS.has(tipo) || input.agregado && (input.agregado as Record<string, unknown>).tipo !== "CONTROL_RELEASE_COMPRAS") {
    return { compatibilidad: "INVALIDA", diagnostico: "FAMILIA_V2_INVALIDA", detalleDiagnostico: diagnosticarDetalle(input.detalle) };
  }
  const revision = input.revision as Record<string, unknown>;
  const detailValid = TRANSICIONES_V2.has(tipo)
    ? input.resultado === "CONFIRMADO" && detalleTransicionValido(tipo, input.detalle, revision)
    : input.resultado === "CONFIRMADO" && detalleCorrectivoValido(input.detalle, revision);
  if (!detailValid) return { compatibilidad: "INVALIDA", diagnostico: "DETALLE_V2_INVALIDO", detalleDiagnostico: diagnosticarDetalle(input.detalle) };
  return { compatibilidad: "SOPORTADA", detalleValido: input.detalle as Record<string, unknown> };
}

export function validarDetalleEvidenciaV2(tipo: string, agregadoTipo: string, revision: unknown, resultado: string, detalle: unknown): void {
  if (!TIPOS_CONTROL_COMPRAS.has(tipo) || agregadoTipo !== "CONTROL_RELEASE_COMPRAS" || !esObjeto(revision)) {
    throw new Error("AUDIT_EVIDENCE_V2_FAMILY_INVALID");
  }
  const valido = tipo === "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA"
    ? resultado === "CONFIRMADO" && detalleCorrectivoValido(detalle, revision)
    : resultado === "CONFIRMADO" && detalleTransicionValido(tipo, detalle, revision);
  if (!valido) throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
}

export function esTimestampFirestore(value: unknown): value is Timestamp {
  return esTimestamp(value);
}
