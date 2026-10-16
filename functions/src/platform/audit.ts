import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import type {
  FacultadPlataforma,
  ResultadoAuditoria,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "./contracts";

export const AUDITORIA_COLLECTION = "saas_auditoria";
export const OBLIGACIONES_COLLECTION = "saas_auditoria_obligaciones";

export interface HechoAuditable {
  /**
   * La evidencia conserva su propia versión. La obligación exterior permanece
   * en v1 (ADR-SAAS-012 / ADR-SAAS-084).
   */
  schemaVersion?: 1 | 2;
  tipo: TipoAuditoria;
  resultado: ResultadoAuditoria;
  origen?: "PLATAFORMA" | "SISTEMA" | "SOPORTE";
  actor: { tipo: "OPERADOR" | "SISTEMA" | "ADMIN_TENANT"; uid: string | null };
  facultad: FacultadPlataforma | null;
  comando: { id: string; tipo: string } | null;
  agregado: { tipo: TipoAgregadoAuditoria; id: string };
  empresaObjetivoId: string | null;
  revision: { esperada: number | null; resultante: number | null };
  correlacionId: string;
  causacionId: string | null;
  motivo: { codigo: string; resumen: string | null };
  /** Evidencia específica del hecho, sin secretos recuperables. */
  detalle?: Record<string, unknown>;
  soporte?: { autorizacionId: string; sesionId: string | null; alcanceCodigo: string } | null;
}

const TIPOS_CONTROL_COMPRAS = new Set<TipoAuditoria>([
  "COMPRAS_CONTROL_INICIALIZADO",
  "COMPRAS_PAUSADAS",
  "COMPRAS_REANUDADAS",
  "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA",
]);
const HEX_SHA_256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objetoExacto(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).every((key) => keys.includes(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

/** Valida la única familia autorizada para emitir evidencia v2. */
function validarHechoV2(hecho: HechoAuditable) {
  if (hecho.agregado.tipo !== "CONTROL_RELEASE_COMPRAS" || !TIPOS_CONTROL_COMPRAS.has(hecho.tipo)) {
    throw new Error("AUDIT_EVIDENCE_V2_FAMILY_INVALID");
  }
  const detalle = hecho.detalle;
  if (hecho.tipo === "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA") {
    if (!objetoExacto(detalle, ["evidenciaOriginalId", "tipoOriginal", "tipoCorregido", "revisionOriginal", "estadoDestinoOriginal", "ocurrioEnOriginal"])) {
      throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
    }
    const revision = detalle.revisionOriginal;
    if (!objetoExacto(revision, ["esperada", "resultante"])
      || revision.esperada !== 0 || revision.resultante !== 1
      || detalle.tipoOriginal !== "COMPRAS_REANUDADAS"
      || detalle.tipoCorregido !== "COMPRAS_CONTROL_INICIALIZADO"
      || detalle.estadoDestinoOriginal !== "ACTIVA"
      || typeof detalle.evidenciaOriginalId !== "string" || !UUID.test(detalle.evidenciaOriginalId)
      || typeof detalle.ocurrioEnOriginal !== "object") {
      throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
    }
    return;
  }
  if (!objetoExacto(detalle, ["estado", "fingerprint"]) && !objetoExacto(detalle, ["estado", "fingerprint", "verificacionRelease"])) {
    throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
  }
  if ((detalle.estado !== "ACTIVA" && detalle.estado !== "PAUSADA")
    || typeof detalle.fingerprint !== "string" || !HEX_SHA_256.test(detalle.fingerprint)) {
    throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
  }
  if (hecho.tipo === "COMPRAS_REANUDADAS") {
    const verificacion = detalle.verificacionRelease;
    if (!objetoExacto(verificacion, ["functionArtifactSha", "rulesetHash", "releaseReferencia"])
      || typeof verificacion.functionArtifactSha !== "string" || !HEX_SHA_256.test(verificacion.functionArtifactSha)
      || typeof verificacion.rulesetHash !== "string" || !HEX_SHA_256.test(verificacion.rulesetHash)
      || typeof verificacion.releaseReferencia !== "string") {
      throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
    }
  } else if (Object.hasOwn(detalle, "verificacionRelease")) {
    throw new Error("AUDIT_EVIDENCE_V2_DETAIL_INVALID");
  }
}

function normalizarContenidoAuditable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizarContenidoAuditable);
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number };
    if (typeof timestamp.toMillis === "function") {
      return { timestampMillis: timestamp.toMillis() };
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizarContenidoAuditable(item)]),
    );
  }
  return value;
}

function evidenciaCoincide(
  esperada: Record<string, unknown>,
  existente: Record<string, unknown>,
): boolean {
  const { registradoEn: _registradoEn, ...contenidoExistente } = existente;
  return JSON.stringify(normalizarContenidoAuditable(esperada))
    === JSON.stringify(normalizarContenidoAuditable(contenidoExistente));
}

export function crearObligacionAuditoria(
  db: Firestore,
  tx: Transaction,
  hecho: HechoAuditable,
  ids?: { obligacionId: string; evidenciaId: string },
): { obligacionId: string; evidenciaId: string } {
  const schemaVersion = hecho.schemaVersion ?? 1;
  if (schemaVersion === 2) validarHechoV2(hecho);
  const obligacionId = ids?.obligacionId ?? randomUUID();
  const evidenciaId = ids?.evidenciaId ?? randomUUID();
  const evidencia = {
    schemaVersion,
    evidenciaId,
    ...hecho,
    origen: hecho.origen ?? "PLATAFORMA",
    soporte: hecho.soporte ?? null,
    ocurrioEn: FieldValue.serverTimestamp(),
  };
  tx.create(db.collection(OBLIGACIONES_COLLECTION).doc(obligacionId), {
    schemaVersion: 1,
    obligacionId,
    estado: "PENDIENTE",
    evidenciaId,
    dedupeKey: [
      hecho.comando?.id ?? "SYSTEM",
      hecho.tipo,
      hecho.resultado,
      hecho.agregado.tipo,
      hecho.agregado.id,
      hecho.revision.resultante ?? "NA",
    ].join(":"),
    evidencia,
    creadaEn: FieldValue.serverTimestamp(),
    emitidaEn: null,
    intentos: 0,
    ultimoErrorCodigo: null,
  });
  return { obligacionId, evidenciaId };
}

export async function emitirObligacionAuditoria(
  db: Firestore,
  obligacionId: string,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const obligacionRef = db.collection(OBLIGACIONES_COLLECTION).doc(obligacionId);
    const snap = await tx.get(obligacionRef);
    if (!snap.exists) throw new Error("AUDIT_OBLIGATION_NOT_FOUND");
    const data = snap.data()!;
    if (data.estado === "EMITIDA") return;
    const evidenciaRef = db.collection(AUDITORIA_COLLECTION).doc(data.evidenciaId);
    const evidenciaSnap = await tx.get(evidenciaRef);
    if (!evidenciaSnap.exists) {
      tx.create(evidenciaRef, {
        ...data.evidencia,
        registradoEn: FieldValue.serverTimestamp(),
      });
    } else if (!evidenciaCoincide(data.evidencia, evidenciaSnap.data()!)) {
      throw new Error("AUDIT_EVIDENCE_CONFLICT");
    }
    tx.update(obligacionRef, {
      estado: "EMITIDA",
      emitidaEn: FieldValue.serverTimestamp(),
      intentos: FieldValue.increment(1),
      ultimoErrorCodigo: null,
    });
  });
}

export async function reconciliarObligacionesAuditoria(
  db: Firestore,
  limite = 100,
): Promise<number> {
  let emitidas = 0;
  // Cursor por página (índice `estado ASC, creadaEn ASC` de ADR-SAAS-012 Anexo A.1): una
  // obligación permanentemente fallida solo incrementa sus propios `intentos` y nunca
  // bloquea el avance hacia obligaciones más recientes dentro de la misma reconciliación.
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  do {
    let consulta = db.collection(OBLIGACIONES_COLLECTION)
      .where("estado", "==", "PENDIENTE")
      .orderBy("creadaEn", "asc")
      .limit(limite);
    if (cursor) consulta = consulta.startAfter(cursor);
    const pendientes = await consulta.get();
    for (const obligacion of pendientes.docs) {
      try {
        await emitirObligacionAuditoria(db, obligacion.id);
        emitidas += 1;
      } catch (error) {
        const codigo = error instanceof Error && error.message
          ? error.message.slice(0, 128)
          : "AUDIT_EMISSION_FAILED";
        await db.runTransaction(async (tx) => {
          const ref = db.collection(OBLIGACIONES_COLLECTION).doc(obligacion.id);
          const actual = await tx.get(ref);
          if (actual.exists && actual.data()!.estado === "PENDIENTE") {
            tx.update(ref, {
              intentos: FieldValue.increment(1),
              ultimoErrorCodigo: codigo,
            });
          }
        });
      }
    }
    cursor = pendientes.docs.at(-1);
  } while (cursor);
  return emitidas;
}

export async function registrarHechoAuditoria(
  db: Firestore,
  hecho: HechoAuditable,
): Promise<void> {
  const obligacionId = await db.runTransaction(async (tx) =>
    crearObligacionAuditoria(db, tx, hecho).obligacionId
  );
  await emitirObligacionAuditoria(db, obligacionId);
}
