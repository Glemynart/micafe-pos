import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import type { EnvelopePlataforma, TipoAuditoria } from "./contracts";
import { exigirId, validarEnvelope } from "./validation";

export const SOPORTE_COLLECTION = "saas_soporte_autorizaciones";
type EstadoSoporte =
  | "SOLICITADA"
  | "AUTORIZADA"
  | "EN_SESION"
  | "FINALIZADA"
  | "RECHAZADA"
  | "REVOCADA"
  | "EXPIRADA";

interface EntradaSoporte extends EnvelopePlataforma {
  autorizacionId?: string;
  empresaObjetivoId?: string;
  duracionMinutos?: number;
  expectedVersion?: number;
}

async function membresiaAdminActiva(db: Firestore, empresaId: string, uid: string) {
  const snap = await db.collection("membresias").doc(`${empresaId}_${uid}`).get();
  const data = snap.data();
  return snap.exists && data?.rol === "admin" && data?.estado === "activa" && data?.activo === true;
}

function eventoPorDestino(estado: EstadoSoporte): TipoAuditoria {
  const eventos: Record<EstadoSoporte, TipoAuditoria> = {
    SOLICITADA: "SOPORTE_SOLICITADO",
    AUTORIZADA: "SOPORTE_AUTORIZADO",
    EN_SESION: "SOPORTE_INICIADO",
    FINALIZADA: "SOPORTE_FINALIZADO",
    RECHAZADA: "SOPORTE_RECHAZADO",
    REVOCADA: "SOPORTE_REVOCADO",
    EXPIRADA: "SOPORTE_EXPIRADO",
  };
  return eventos[estado];
}

export async function solicitarSoporte(
  db: Firestore,
  operadorUid: string,
  token: TokenPlataforma,
  entrada: EntradaSoporte,
) {
  validarEnvelope(entrada);
  await autorizarPlataforma(db, operadorUid, token);
  const empresaObjetivoId = exigirId(entrada.empresaObjetivoId, "EMPRESA_ID_INVALIDO");
  if (!Number.isSafeInteger(entrada.duracionMinutos) || entrada.duracionMinutos! <= 0) {
    throw new HttpsError("invalid-argument", "DURACION_INVALIDA");
  }
  const expiracionMs = Date.now() + entrada.duracionMinutos! * 60_000;
  if (!Number.isSafeInteger(expiracionMs) || expiracionMs > 253_402_300_799_999) {
    throw new HttpsError("invalid-argument", "DURACION_INVALIDA");
  }
  const empresa = await db.collection("empresas").doc(empresaObjetivoId).get();
  if (!empresa.exists || !["trial", "activa", "suspendida"].includes(empresa.data()?.estado)) {
    throw new HttpsError("failed-precondition", "LIFECYCLE_NO_ADMITE_SOPORTE");
  }
  const autorizacionId = randomUUID();
  const sesion = {
    schemaVersion: 1,
    autorizacionId,
    estado: "SOLICITADA" as const,
    empresaObjetivoId,
    operadorUid,
    solicitante: { tipo: "OPERADOR" as const, uid: operadorUid },
    baseAutorizacion: "CONSENTIMIENTO_TENANT" as const,
    consentimientoPorUid: null,
    alcanceCodigo: "DIAGNOSTICO_SOLO_LECTURA" as const,
    inicioPermitidoEn: Timestamp.now(),
    expiraEn: Timestamp.fromMillis(expiracionMs),
    sesionId: null,
    iniciadaEn: null,
    finalizadaEn: null,
    motivoCodigo: entrada.motivoCodigo,
    correlacionId: entrada.correlationId,
    creadaEn: FieldValue.serverTimestamp(),
    actualizadaEn: FieldValue.serverTimestamp(),
    version: 1,
  };
  const obligacionId = await db.runTransaction(async (tx) => {
    const ref = db.collection(SOPORTE_COLLECTION).doc(autorizacionId);
    tx.create(ref, sesion);
    const obligacion = crearObligacionAuditoria(db, tx, {
      tipo: "SOPORTE_SOLICITADO",
      resultado: "CONFIRMADO",
      origen: "SOPORTE",
      actor: { tipo: "OPERADOR", uid: operadorUid },
      facultad: null,
      comando: { id: entrada.commandId, tipo: "SolicitarSoporte" },
      agregado: { tipo: "SOPORTE_AUTORIZACION", id: autorizacionId },
      empresaObjetivoId,
      revision: { esperada: null, resultante: 1 },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: entrada.motivoCodigo, resumen: null },
      soporte: { autorizacionId, sesionId: null, alcanceCodigo: "DIAGNOSTICO_SOLO_LECTURA" },
    });
    return obligacion.obligacionId;
  });
  await emitirObligacionAuditoria(db, obligacionId);
  return { autorizacionId, estado: "SOLICITADA", version: 1 };
}

export async function transicionarSoporte(
  db: Firestore,
  actor: { uid: string; token: TokenPlataforma },
  destino: "AUTORIZADA" | "RECHAZADA" | "EN_SESION" | "FINALIZADA" | "REVOCADA",
  entrada: EntradaSoporte,
) {
  validarEnvelope(entrada);
  const autorizacionId = exigirId(entrada.autorizacionId, "AUTORIZACION_ID_INVALIDO");
  if (!Number.isInteger(entrada.expectedVersion) || entrada.expectedVersion! < 1) {
    throw new HttpsError("invalid-argument", "EXPECTED_VERSION_INVALIDA");
  }
  const ref = db.collection(SOPORTE_COLLECTION).doc(autorizacionId);
  const previa = await ref.get();
  if (!previa.exists) throw new HttpsError("not-found", "SOPORTE_NOT_FOUND");
  const actual = previa.data()!;
  const esAdmin = await membresiaAdminActiva(db, actual.empresaObjetivoId, actor.uid);
  const esOperador = actual.operadorUid === actor.uid;

  if (["AUTORIZADA", "RECHAZADA", "REVOCADA"].includes(destino) && !esAdmin) {
    throw new HttpsError("permission-denied", "CONSENTIMIENTO_ADMIN_REQUERIDO");
  }
  if (["EN_SESION", "FINALIZADA"].includes(destino)) {
    if (!esOperador) throw new HttpsError("permission-denied", "OPERADOR_SOPORTE_REQUERIDO");
    await autorizarPlataforma(db, actor.uid, actor.token);
  }

  const permitidas: Record<EstadoSoporte, readonly EstadoSoporte[]> = {
    SOLICITADA: ["AUTORIZADA", "RECHAZADA"],
    AUTORIZADA: ["EN_SESION", "REVOCADA"],
    EN_SESION: ["FINALIZADA", "REVOCADA"],
    FINALIZADA: [],
    RECHAZADA: [],
    REVOCADA: [],
    EXPIRADA: [],
  };
  if (!permitidas[actual.estado as EstadoSoporte]?.includes(destino)) {
    throw new HttpsError("failed-precondition", "TRANSICION_SOPORTE_INVALIDA");
  }
  if (actual.expiraEn.toMillis() <= Date.now()) {
    throw new HttpsError("failed-precondition", "SOPORTE_EXPIRADO");
  }
  if (destino === "EN_SESION") {
    if (!actual.consentimientoPorUid || !await membresiaAdminActiva(db, actual.empresaObjetivoId, actual.consentimientoPorUid)) {
      throw new HttpsError("failed-precondition", "CONSENTIMIENTO_NO_VIGENTE");
    }
    const empresa = await db.collection("empresas").doc(actual.empresaObjetivoId).get();
    if (!empresa.exists || !["trial", "activa", "suspendida"].includes(empresa.data()?.estado)) {
      throw new HttpsError("failed-precondition", "LIFECYCLE_NO_ADMITE_SOPORTE");
    }
  }

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "SOPORTE_NOT_FOUND");
    const data = snap.data()!;
    if (data.version !== entrada.expectedVersion || data.estado !== actual.estado) {
      throw new HttpsError("failed-precondition", "CONFLICTO_REVISION");
    }
    const nuevaVersion = data.version + 1;
    const sesionId = destino === "EN_SESION" ? randomUUID() : data.sesionId;
    const cambios: Record<string, unknown> = {
      estado: destino,
      version: nuevaVersion,
      actualizadaEn: FieldValue.serverTimestamp(),
    };
    if (destino === "AUTORIZADA") cambios.consentimientoPorUid = actor.uid;
    if (destino === "EN_SESION") {
      cambios.sesionId = sesionId;
      cambios.iniciadaEn = FieldValue.serverTimestamp();
    }
    if (destino === "FINALIZADA" || destino === "REVOCADA") {
      cambios.finalizadaEn = FieldValue.serverTimestamp();
    }
    tx.update(ref, cambios);
    const { obligacionId } = crearObligacionAuditoria(db, tx, {
      tipo: eventoPorDestino(destino),
      resultado: "CONFIRMADO",
      origen: "SOPORTE",
      actor: { tipo: "OPERADOR", uid: actor.uid },
      facultad: null,
      comando: { id: entrada.commandId, tipo: `${destino}Soporte` },
      agregado: { tipo: destino === "EN_SESION" || destino === "FINALIZADA" ? "SOPORTE_SESION" : "SOPORTE_AUTORIZACION", id: autorizacionId },
      empresaObjetivoId: data.empresaObjetivoId,
      revision: { esperada: entrada.expectedVersion!, resultante: nuevaVersion },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: entrada.motivoCodigo, resumen: null },
      soporte: { autorizacionId, sesionId, alcanceCodigo: data.alcanceCodigo },
    });
    return { obligacionId, autorizacionId, estado: destino, version: nuevaVersion, sesionId };
  });
  await emitirObligacionAuditoria(db, resultado.obligacionId);
  return resultado;
}

export async function listarSoporteTenant(
  db: Firestore,
  uid: string,
  empresaId: string,
) {
  if (!await membresiaAdminActiva(db, empresaId, uid)) {
    throw new HttpsError("permission-denied", "CONSENTIMIENTO_ADMIN_REQUERIDO");
  }
  const snap = await db.collection(SOPORTE_COLLECTION)
    .where("empresaObjetivoId", "==", empresaId)
    .orderBy("actualizadaEn", "desc")
    .limit(50)
    .get();
  return {
    items: snap.docs.map((doc) => {
      const data = doc.data();
      return {
        autorizacionId: doc.id,
        estado: data.estado,
        empresaObjetivoId: data.empresaObjetivoId,
        operadorUid: data.operadorUid,
        alcanceCodigo: data.alcanceCodigo,
        expiraEn: data.expiraEn,
        version: data.version,
        motivoCodigo: data.motivoCodigo,
      };
    }),
  };
}

export async function expirarSoportesVencidos(db: Firestore): Promise<number> {
  const snap = await db.collection(SOPORTE_COLLECTION)
    .where("estado", "in", ["SOLICITADA", "AUTORIZADA", "EN_SESION"])
    .where("expiraEn", "<=", Timestamp.now())
    .limit(100)
    .get();
  let procesados = 0;
  for (const doc of snap.docs) {
    const obligacionId = await db.runTransaction(async (tx) => {
      const ref = db.collection(SOPORTE_COLLECTION).doc(doc.id);
      const fresh = await tx.get(ref);
      if (!fresh.exists || !["SOLICITADA", "AUTORIZADA", "EN_SESION"].includes(fresh.data()!.estado)) return null;
      const data = fresh.data()!;
      const version = data.version + 1;
      tx.update(ref, {
        estado: "EXPIRADA",
        version,
        finalizadaEn: data.estado === "EN_SESION" ? FieldValue.serverTimestamp() : data.finalizadaEn,
        actualizadaEn: FieldValue.serverTimestamp(),
      });
      return crearObligacionAuditoria(db, tx, {
        tipo: "SOPORTE_EXPIRADO",
        resultado: "CONFIRMADO",
        origen: "SOPORTE",
        actor: { tipo: "SISTEMA", uid: null },
        facultad: null,
        comando: null,
        agregado: { tipo: "SOPORTE_AUTORIZACION", id: doc.id },
        empresaObjetivoId: data.empresaObjetivoId,
        revision: { esperada: data.version, resultante: version },
        correlacionId: data.correlacionId,
        causacionId: null,
        motivo: { codigo: "SOPORTE_EXPIRACION_RELOJ_SERVIDOR", resumen: null },
        soporte: { autorizacionId: doc.id, sesionId: data.sesionId, alcanceCodigo: data.alcanceCodigo },
      }).obligacionId;
    });
    if (obligacionId) {
      await emitirObligacionAuditoria(db, obligacionId);
      procesados += 1;
    }
  }
  return procesados;
}
