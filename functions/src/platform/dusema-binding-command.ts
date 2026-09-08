import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import {
  DUSEMA_EXTERNAL_TENANT_RESERVATIONS_COLLECTION,
  DUSEMA_PRODUCT_CODE,
  idBindingDusema,
  idReservaTenantDusema,
  PLATFORM_BINDINGS_COLLECTION,
  validarBindingDusema,
} from "./bindings";
import type { EnvelopePlataforma } from "./contracts";
import { exigirId, validarEnvelope } from "./validation";

const COMMANDS_COLLECTION = "saas_comandos";
const RUNTIME_PROJECT = "micafe-pos-staging";
const FACULTAD = "DUSEMA_BINDING_GOBERNAR" as const;
const TIPO = "CrearBindingDusemaStaging";

export type EntradaBindingDusemaStaging = EnvelopePlataforma & {
  empresaPosId: unknown;
  dusemaTenantId: unknown;
};

export type ResultadoBindingDusemaStaging = {
  estado: "CREADO" | "YA_EXISTENTE";
  bindingId: string;
  empresaPosId: string;
  externalTenantId: string;
  obligacionId: string | null;
  idempotente: boolean;
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function exigirRuntimeDusemaBinding(
  projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
): void {
  if (projectId !== RUNTIME_PROJECT) {
    throw new HttpsError("failed-precondition", "DUSEMA_BINDING_RUNTIME_DENIED");
  }
}

function receiptRefs(db: Firestore, entrada: EnvelopePlataforma) {
  return {
    idem: db.collection(COMMANDS_COLLECTION).doc(`dusema_binding_idem_${entrada.idempotencyKey}`),
    command: db.collection(COMMANDS_COLLECTION).doc(`dusema_binding_command_${entrada.commandId}`),
  };
}

function resultadoDesdeReceipt(value: Record<string, unknown>): ResultadoBindingDusemaStaging {
  return { ...(value.resultado as ResultadoBindingDusemaStaging), idempotente: true };
}

function validarReceipt(
  value: Record<string, unknown>,
  entrada: EnvelopePlataforma,
  fingerprint: string,
  conflict: "IDEMPOTENCY_CONFLICT" | "COMMAND_ID_CONFLICT",
) {
  if (value.commandId !== entrada.commandId || value.idempotencyKey !== entrada.idempotencyKey || value.fingerprint !== fingerprint) {
    throw new HttpsError("already-exists", conflict);
  }
}

export async function crearBindingDusemaStaging(
  db: Firestore,
  actorUid: string,
  token: TokenPlataforma,
  entrada: EntradaBindingDusemaStaging,
  runtimeProject?: string,
): Promise<ResultadoBindingDusemaStaging> {
  validarEnvelope(entrada);
  const empresaPosId = exigirId(entrada.empresaPosId, "EMPRESA_POS_ID_INVALIDO");
  const externalTenantId = exigirId(entrada.dusemaTenantId, "DUSEMA_TENANT_ID_INVALIDO");
  exigirRuntimeDusemaBinding(runtimeProject);
  await autorizarPlataforma(db, actorUid, token, FACULTAD);
  const fingerprint = hash({ tipo: TIPO, ...entrada });
  const bindingId = idBindingDusema("staging", empresaPosId);
  const reservaId = idReservaTenantDusema("staging", externalTenantId);

  const resultado = await db.runTransaction(async (tx) => {
    exigirRuntimeDusemaBinding(runtimeProject);
    await autorizarPlataforma(db, actorUid, token, FACULTAD, tx);
    const receipts = receiptRefs(db, entrada);
    const bindingRef = db.collection(PLATFORM_BINDINGS_COLLECTION).doc(bindingId);
    const reservaRef = db.collection(DUSEMA_EXTERNAL_TENANT_RESERVATIONS_COLLECTION).doc(reservaId);
    const empresaRef = db.collection("empresas").doc(empresaPosId);
    const [idem, command, binding, reserva, empresa] = await Promise.all([
      tx.get(receipts.idem), tx.get(receipts.command), tx.get(bindingRef), tx.get(reservaRef), tx.get(empresaRef),
    ]);
    if (idem.exists || command.exists) {
      if (idem.exists) validarReceipt(idem.data()!, entrada, fingerprint, "IDEMPOTENCY_CONFLICT");
      if (command.exists) validarReceipt(command.data()!, entrada, fingerprint, "COMMAND_ID_CONFLICT");
      const source = idem.exists ? idem.data()! : command.data()!;
      if (idem.exists && command.exists && JSON.stringify(idem.data()?.resultado) !== JSON.stringify(command.data()?.resultado)) {
        throw new HttpsError("failed-precondition", "COMMAND_RECEIPT_INCONSISTENTE");
      }
      return resultadoDesdeReceipt(source);
    }
    if (!empresa.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");
    if (binding.exists) {
      const actual = validarBindingDusema(binding.data(), { environment: "staging", empresaPosId }, binding.id);
      if (actual.externalTenantId !== externalTenantId) throw new HttpsError("already-exists", "BINDING_EMPRESA_CONFLICT");
      if (!reserva.exists) throw new HttpsError("failed-precondition", "BINDING_RESERVA_AUSENTE");
      const reservaData = reserva.data()!;
      if (reservaData.empresaPosId !== empresaPosId || reservaData.bindingId !== bindingId) {
        throw new HttpsError("failed-precondition", "BINDING_RESERVA_INCONSISTENTE");
      }
      return { estado: "YA_EXISTENTE" as const, bindingId, empresaPosId, externalTenantId, obligacionId: null, idempotente: true };
    }
    if (reserva.exists) {
      const reservaData = reserva.data()!;
      if (reservaData.empresaPosId !== empresaPosId) throw new HttpsError("already-exists", "BINDING_EXTERNAL_TENANT_CONFLICT");
      throw new HttpsError("failed-precondition", "BINDING_RESERVA_INCONSISTENTE");
    }
    const obligacionId = randomUUID();
    const evidenciaId = randomUUID();
    const durable: ResultadoBindingDusemaStaging = {
      estado: "CREADO", bindingId, empresaPosId, externalTenantId, obligacionId, idempotente: false,
    };
    const now = FieldValue.serverTimestamp();
    tx.create(bindingRef, {
      schemaVersion: 1, productCode: DUSEMA_PRODUCT_CODE, environment: "staging", empresaPosId, externalTenantId,
      estado: "ACTIVO", creadoPor: actorUid, creadoEn: now, actualizadoPor: actorUid, actualizadoEn: now,
    });
    tx.create(reservaRef, {
      schemaVersion: 1, productCode: DUSEMA_PRODUCT_CODE, environment: "staging", externalTenantId, empresaPosId,
      bindingId, bindingPath: bindingRef.path, creadoPorUid: actorUid, creadoEn: now,
    });
    const receipt = {
      commandId: entrada.commandId, idempotencyKey: entrada.idempotencyKey, fingerprint, resultado: durable,
      empresaPosId, externalTenantId, bindingId, obligacionId, creadaEn: now,
    };
    tx.create(receipts.idem, receipt);
    tx.create(receipts.command, receipt);
    crearObligacionAuditoria(db, tx, {
      tipo: "DUSEMA_BINDING_CREADO", resultado: "CONFIRMADO", actor: { tipo: "OPERADOR", uid: actorUid },
      facultad: FACULTAD, comando: { id: entrada.commandId, tipo: TIPO },
      agregado: { tipo: "BINDING_DUSEMA", id: bindingId }, empresaObjetivoId: empresaPosId,
      revision: { esperada: null, resultante: null }, correlacionId: entrada.correlationId,
      causacionId: entrada.causationId, motivo: { codigo: entrada.motivoCodigo, resumen: null },
      detalle: { productCode: DUSEMA_PRODUCT_CODE, environment: "staging", externalTenantId, fingerprint },
    }, { obligacionId, evidenciaId });
    return durable;
  });
  if (resultado.obligacionId) {
    try { await emitirObligacionAuditoria(db, resultado.obligacionId); } catch { /* reconciliación posterior */ }
  }
  return resultado;
}
