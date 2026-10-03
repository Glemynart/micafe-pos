import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial } from "../../../lib/suscripciones/contrato";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import type { EnvelopePlataforma } from "./contracts";
import { exigirId, validarEnvelope } from "./validation";

const COMMANDS_COLLECTION = "saas_comandos";
const ACCOUNTS_COLLECTION = "cuentas_bancarias";
const RESERVED_KEYS = new Set(["caja-principal", "caja-fuerte"]);
const KEY = /^[a-z][a-z0-9-]{2,63}$/;
const NAME_MAX = 120;
const ACCOUNT_TYPE = "banco" as const;
const FACULTY = "LIFECYCLE_GOBERNAR" as const;
const COMMAND_TYPE = "ProvisionarCuentaOperativaTenantSaas";

export type EntradaProvisionarCuentaOperativa = EnvelopePlataforma & {
  empresaId: unknown;
  claveOperativa: unknown;
  nombre: unknown;
  tipo: unknown;
};

export type ResultadoProvisionarCuentaOperativa = {
  estado: "CREADA";
  cuentaId: string;
  empresaId: string;
  claveOperativa: string;
  obligacionId: string;
  idempotente: boolean;
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validarEntrada(entrada: EntradaProvisionarCuentaOperativa) {
  validarEnvelope(entrada);
  const empresaId = exigirId(entrada.empresaId, "EMPRESA_ID_INVALIDO");
  if (!esIdComercial(empresaId)) throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  if (typeof entrada.claveOperativa !== "string" || !KEY.test(entrada.claveOperativa) || RESERVED_KEYS.has(entrada.claveOperativa)) {
    throw new HttpsError("invalid-argument", "CLAVE_OPERATIVA_INVALIDA");
  }
  if (typeof entrada.nombre !== "string" || entrada.nombre.trim().length < 2 || entrada.nombre.trim().length > NAME_MAX) {
    throw new HttpsError("invalid-argument", "NOMBRE_CUENTA_INVALIDO");
  }
  if (entrada.tipo !== ACCOUNT_TYPE) throw new HttpsError("invalid-argument", "TIPO_CUENTA_INVALIDO");
  return {
    empresaId,
    claveOperativa: entrada.claveOperativa,
    nombre: entrada.nombre.trim(),
    tipo: ACCOUNT_TYPE,
  };
}

function refs(db: Firestore, entrada: EnvelopePlataforma) {
  return {
    idempotency: db.collection(COMMANDS_COLLECTION).doc(`account_provisioning_idem_${entrada.idempotencyKey}`),
    command: db.collection(COMMANDS_COLLECTION).doc(`account_provisioning_cmd_${entrada.commandId}`),
  };
}

function validarReceipt(value: Record<string, unknown>, entrada: EnvelopePlataforma, fingerprint: string, code: string) {
  if (value.commandId !== entrada.commandId || value.idempotencyKey !== entrada.idempotencyKey || value.fingerprint !== fingerprint) {
    throw new HttpsError("already-exists", code);
  }
}

export async function provisionarCuentaOperativaTenant(
  db: Firestore,
  actorUid: string,
  token: TokenPlataforma,
  entrada: EntradaProvisionarCuentaOperativa,
): Promise<ResultadoProvisionarCuentaOperativa> {
  const input = validarEntrada(entrada);
  const fingerprint = hash({ operation: COMMAND_TYPE, ...input });
  const cuentaId = crearIdentificadorInterno(input.empresaId, `cuenta:${input.claveOperativa}`);

  const resultado = await db.runTransaction(async (tx) => {
    await autorizarPlataforma(db, actorUid, token, FACULTY, tx);
    const receipts = refs(db, entrada);
    const cuentaRef = db.collection(ACCOUNTS_COLLECTION).doc(cuentaId);
    const [idempotency, command, cuenta, empresa, candidatas] = await Promise.all([
      tx.get(receipts.idempotency),
      tx.get(receipts.command),
      tx.get(cuentaRef),
      tx.get(db.collection("empresas").doc(input.empresaId)),
      tx.get(db.collection(ACCOUNTS_COLLECTION).where("empresaId", "==", input.empresaId).where("claveOperativa", "==", input.claveOperativa)),
    ]);

    if (idempotency.exists || command.exists) {
      if (idempotency.exists) validarReceipt(idempotency.data()!, entrada, fingerprint, "IDEMPOTENCY_CONFLICT");
      if (command.exists) validarReceipt(command.data()!, entrada, fingerprint, "COMMAND_ID_CONFLICT");
      const source = idempotency.exists ? idempotency.data()! : command.data()!;
      const durable = source.resultado as ResultadoProvisionarCuentaOperativa;
      return { ...durable, idempotente: true };
    }
    if (!empresa.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");
    if (!["trial", "activa"].includes(empresa.data()?.estado)) {
      throw new HttpsError("failed-precondition", "EMPRESA_NO_OPERATIVA");
    }
    if (candidatas.size > 0 || cuenta.exists) throw new HttpsError("already-exists", "CUENTA_YA_EXISTE");

    const obligacionId = randomUUID();
    const evidenciaId = randomUUID();
    const durable: ResultadoProvisionarCuentaOperativa = {
      estado: "CREADA", cuentaId, empresaId: input.empresaId,
      claveOperativa: input.claveOperativa, obligacionId, idempotente: false,
    };
    const now = FieldValue.serverTimestamp();
    tx.create(cuentaRef, {
      schemaVersion: 1,
      id: cuentaId,
      empresaId: input.empresaId,
      claveOperativa: input.claveOperativa,
      nombre: input.nombre,
      tipo: input.tipo,
      saldo: 0,
      estado: "activa",
      creadaPor: actorUid,
      creadaEn: now,
      actualizadaEn: now,
    });
    const receipt = {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      fingerprint,
      resultado: durable,
      cuentaId,
      empresaId: input.empresaId,
      claveOperativa: input.claveOperativa,
      obligacionId,
      creadaEn: now,
    };
    tx.create(receipts.idempotency, receipt);
    tx.create(receipts.command, receipt);
    crearObligacionAuditoria(db, tx, {
      tipo: "CUENTA_OPERATIVA_PROVISIONADA",
      resultado: "CONFIRMADO",
      actor: { tipo: "OPERADOR", uid: actorUid },
      facultad: FACULTY,
      comando: { id: entrada.commandId, tipo: COMMAND_TYPE },
      agregado: { tipo: "CUENTA_OPERATIVA", id: cuentaId },
      empresaObjetivoId: input.empresaId,
      revision: { esperada: null, resultante: null },
      correlacionId: entrada.correlationId,
      causacionId: entrada.causationId,
      motivo: { codigo: entrada.motivoCodigo, resumen: null },
      detalle: { claveOperativa: input.claveOperativa, tipo: input.tipo, fingerprint },
    }, { obligacionId, evidenciaId });
    return durable;
  });
  if (!resultado.idempotente) {
    try { await emitirObligacionAuditoria(db, resultado.obligacionId); } catch { /* reconciliación posterior */ }
  }
  return resultado;
}
