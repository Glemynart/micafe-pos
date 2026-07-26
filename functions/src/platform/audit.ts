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
  soporte?: { autorizacionId: string; sesionId: string | null; alcanceCodigo: string } | null;
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
  const obligacionId = ids?.obligacionId ?? randomUUID();
  const evidenciaId = ids?.evidenciaId ?? randomUUID();
  const evidencia = {
    schemaVersion: 1,
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
