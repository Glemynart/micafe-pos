import { createHash, randomUUID } from "node:crypto";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import type { EnvelopePlataforma } from "./contracts";
import { exigirId, validarEnvelope } from "./validation";

const REGION = "us-central1";
const FACULTAD = "RELEASE_COMPRAS_GOBERNAR" as const;
const CONTROLES = "controles_release_compras";
const COMANDOS = "saas_comandos";
const TIPO = "TransicionarPausaComprasSaas";

export type EstadoControlCompras = "ACTIVA" | "PAUSADA";

export type EntradaTransicionPausaCompras = EnvelopePlataforma & {
  empresaId: unknown;
  destino: unknown;
  expectedRevision: unknown;
  verificacionRelease?: unknown;
};

export type ResultadoTransicionPausaCompras = {
  empresaId: string;
  estado: EstadoControlCompras;
  revision: number;
  obligacionId: string;
  idempotente: boolean;
};

const huella = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type VerificacionRelease = {
  functionArtifactSha: string;
  rulesetHash: string;
  releaseReferencia: string;
};

const SHA_256 = /^[a-f0-9]{64}$/;

function rechazar(codigo: string): never {
  throw new HttpsError("failed-precondition", codigo);
}

function validarEntrada(entrada: EntradaTransicionPausaCompras) {
  validarEnvelope(entrada);
  const empresaId = exigirId(entrada.empresaId, "EMPRESA_ID_INVALIDO");
  if (entrada.destino !== "ACTIVA" && entrada.destino !== "PAUSADA") {
    throw new HttpsError("invalid-argument", "ESTADO_CORTE_COMPRAS_INVALIDO");
  }
  if (!Number.isSafeInteger(entrada.expectedRevision) || (entrada.expectedRevision as number) < 0) {
    throw new HttpsError("invalid-argument", "REVISION_ESPERADA_INVALIDA");
  }
  let verificacionRelease: VerificacionRelease | undefined;
  if (entrada.verificacionRelease !== undefined) {
    if (!entrada.verificacionRelease || typeof entrada.verificacionRelease !== "object" || Array.isArray(entrada.verificacionRelease)) {
      throw new HttpsError("invalid-argument", "VERIFICACION_RELEASE_INVALIDA");
    }
    const evidencia = entrada.verificacionRelease as Record<string, unknown>;
    verificacionRelease = {
      functionArtifactSha: exigirId(evidencia.functionArtifactSha, "VERIFICACION_RELEASE_INVALIDA"),
      rulesetHash: exigirId(evidencia.rulesetHash, "VERIFICACION_RELEASE_INVALIDA"),
      releaseReferencia: exigirId(evidencia.releaseReferencia, "VERIFICACION_RELEASE_INVALIDA"),
    };
    if (!SHA_256.test(verificacionRelease.functionArtifactSha) || !SHA_256.test(verificacionRelease.rulesetHash)) {
      throw new HttpsError("invalid-argument", "VERIFICACION_RELEASE_INVALIDA");
    }
  }
  return {
    empresaId,
    destino: entrada.destino as EstadoControlCompras,
    expectedRevision: entrada.expectedRevision as number,
    verificacionRelease,
  };
}

function refs(db: Firestore, entrada: EnvelopePlataforma) {
  return {
    idempotency: db.collection(COMANDOS).doc(`purchase_release_idem_${entrada.idempotencyKey}`),
    command: db.collection(COMANDOS).doc(`purchase_release_cmd_${entrada.commandId}`),
  };
}

function validarRecibo(recibo: Record<string, unknown>, entrada: EnvelopePlataforma, fingerprint: string, codigo: string) {
  if (
    recibo.commandId !== entrada.commandId
    || recibo.idempotencyKey !== entrada.idempotencyKey
    || recibo.fingerprint !== fingerprint
  ) {
    throw new HttpsError("already-exists", codigo);
  }
}

/**
 * ADR-SAAS-081: autoridad de release aislada del lifecycle. El documento se
 * crea inicialmente con revisión 1 mediante `expectedRevision: 0`; no existe
 * un estado implícito que pueda dejar compras abiertas por configuración parcial.
 */
export async function transicionarPausaCompras(
  db: Firestore,
  actorUid: string,
  token: TokenPlataforma,
  entrada: EntradaTransicionPausaCompras,
): Promise<ResultadoTransicionPausaCompras> {
  const input = validarEntrada(entrada);
  const fingerprint = huella({ tipo: TIPO, ...input });
  const resultado = await db.runTransaction(async (tx: any) => {
    await autorizarPlataforma(db, actorUid, token, FACULTAD, tx);
    const controlRef = db.collection(CONTROLES).doc(input.empresaId);
    const recibos = refs(db, entrada);
    const [control, idempotency, command, empresa] = await Promise.all([
      tx.get(controlRef),
      tx.get(recibos.idempotency),
      tx.get(recibos.command),
      tx.get(db.collection("empresas").doc(input.empresaId)),
    ]);

    if (idempotency.exists || command.exists) {
      if (idempotency.exists) validarRecibo(idempotency.data()!, entrada, fingerprint, "IDEMPOTENCY_CONFLICT");
      if (command.exists) validarRecibo(command.data()!, entrada, fingerprint, "COMMAND_ID_CONFLICT");
      return { ...(idempotency.exists ? idempotency.data()! : command.data()!).resultado, idempotente: true } as ResultadoTransicionPausaCompras;
    }
    if (!empresa.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");

    const actual = control.exists ? control.data() as Record<string, unknown> : null;
    const revisionActual = actual === null ? 0 : actual.revision;
    if (
      actual !== null && (
        !Number.isSafeInteger(actual.schemaVersion)
        || actual.schemaVersion !== 1
        || !Number.isSafeInteger(revisionActual)
        || (revisionActual as number) < 1
        || actual.empresaId !== input.empresaId
        || (actual.estado !== "ACTIVA" && actual.estado !== "PAUSADA")
      )
    ) {
      rechazar("CONTROL_COMPRAS_INVALIDO");
    }
    if (revisionActual !== input.expectedRevision) rechazar("CONFLICTO_REVISION_CORTE_COMPRAS");
    if (actual && actual.estado === input.destino) rechazar("TRANSICION_CORTE_COMPRAS_REDUNDANTE");
    if (actual?.estado === "PAUSADA" && input.destino === "ACTIVA" && !input.verificacionRelease) {
      rechazar("VERIFICACION_RELEASE_REQUERIDA");
    }

    const revision = input.expectedRevision + 1;
    if (!Number.isSafeInteger(revision)) rechazar("REVISION_CORTE_COMPRAS_AGOTADA");
    const obligacionId = randomUUID();
    const evidenciaId = randomUUID();
    const durable: ResultadoTransicionPausaCompras = {
      empresaId: input.empresaId,
      estado: input.destino,
      revision,
      obligacionId,
      idempotente: false,
    };
    const now = FieldValue.serverTimestamp();
    const siguiente = {
      schemaVersion: 1,
      empresaId: input.empresaId,
      estado: input.destino,
      revision,
      motivoCodigo: entrada.motivoCodigo,
      correlationId: entrada.correlationId,
      actualizadoPorUid: actorUid,
      actualizadoEn: now,
      ...(actual ? {} : { creadoEn: now }),
      ...(input.verificacionRelease ? { ultimaVerificacionRelease: input.verificacionRelease } : {}),
    };
    if (actual) tx.update(controlRef, siguiente); else tx.create(controlRef, siguiente);
    const recibo = {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      fingerprint,
      resultado: durable,
      empresaId: input.empresaId,
      obligacionId,
      creadaEn: now,
    };
    tx.create(recibos.idempotency, recibo);
    tx.create(recibos.command, recibo);
    crearObligacionAuditoria(db, tx, {
      schemaVersion: 2,
      tipo: actual === null
        ? "COMPRAS_CONTROL_INICIALIZADO"
        : input.destino === "PAUSADA"
          ? "COMPRAS_PAUSADAS"
          : "COMPRAS_REANUDADAS",
      resultado: "CONFIRMADO",
      actor: { tipo: "OPERADOR", uid: actorUid },
      facultad: FACULTAD,
      comando: { id: entrada.commandId, tipo: TIPO },
      agregado: { tipo: "CONTROL_RELEASE_COMPRAS", id: input.empresaId },
      empresaObjetivoId: input.empresaId,
      revision: { esperada: input.expectedRevision, resultante: revision },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: entrada.motivoCodigo, resumen: null },
      detalle: { estado: input.destino, fingerprint, ...(input.verificacionRelease ? { verificacionRelease: input.verificacionRelease } : {}) },
    }, { obligacionId, evidenciaId });
    return durable;
  });
  if (!resultado.idempotente) {
    try { await emitirObligacionAuditoria(db, resultado.obligacionId); } catch { /* conciliación durable posterior */ }
  }
  return resultado;
}

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

export const transicionarPausaComprasSaas = onCall({ region: REGION }, async request => {
  const auth = exigirAuth(request);
  return transicionarPausaCompras(
    getFirestore(),
    auth.uid,
    auth.token as TokenPlataforma,
    request.data as EntradaTransicionPausaCompras,
  );
});
