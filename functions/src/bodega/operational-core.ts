import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esMembresiaAutorizada } from "../turnos/executor";
import { crearIdentificadorInterno } from "../turnos/identificadores";

export interface Envelope {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string | null;
  motivo?: string | null;
  payload: Record<string, unknown>;
}

export interface ContextoFinancieroOperativo {
  empresaId: string;
  actorUid: string;
  rol: string;
  ejecutorTecnico?: string;
}

type Tipo = "ingreso" | "egreso";
const MOVIMIENTOS = "transacciones_financieras";
const CLAVES_RESERVADAS = ["caja-principal", "caja-fuerte"] as const;

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operación financiera.", { code: dominio });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function canonizar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonizar);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonizar(value[key])]));
  return value;
}

export function crearHuellaSemantica(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonizar(value))).digest("hex");
}

function envelope(value: unknown): Envelope {
  if (!object(value) || !text(value.commandId) || !text(value.idempotencyKey) || !text(value.correlationId) || !object(value.payload)) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
  return value as Envelope;
}

function refsOperacion(db: any, empresaId: string, input: Envelope) {
  return {
    recibo: db.collection("operaciones_comandos").doc(crearIdentificadorInterno(empresaId, input.commandId)),
    indice: db.collection("operaciones_command_idempotency").doc(crearIdentificadorInterno(empresaId, input.idempotencyKey)),
    auditoria: db.collection("operaciones_auditoria").doc(crearIdentificadorInterno(empresaId, input.commandId)),
  };
}

async function cuenta(tx: any, db: any, empresaId: string, id: string) {
  const ref = db.collection("cuentas_bancarias").doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("failed-precondition", "CUENTA_INVALIDA");
  const saldo = snap.data()?.saldo;
  if (!Number.isSafeInteger(saldo) || saldo < 0) fail("failed-precondition", "CUENTA_INVALIDA");
  return { ref, data: snap.data() as Record<string, unknown>, saldo: saldo as number };
}

export async function resolverCuentaOperativa(tx: any, db: any, empresaId: string, claveOperativa: string) {
  if ((CLAVES_RESERVADAS as readonly string[]).includes(claveOperativa)) {
    const empresa = await tx.get(db.collection("empresas").doc(empresaId));
    if (!empresa.exists || typeof empresa.data()?.esFundacional !== "boolean") fail("failed-precondition", "CUENTA_INVALIDA");
    const cuentaId = empresa.data()?.esFundacional === true ? claveOperativa : crearIdentificadorInterno(empresaId, `cuenta:${claveOperativa}`);
    const resultado = await cuenta(tx, db, empresaId, cuentaId);
    if (resultado.data.id !== cuentaId || resultado.data.claveOperativa !== claveOperativa) fail("failed-precondition", "CUENTA_INVALIDA");
    return resultado;
  }
  const candidatas = await tx.get(db.collection("cuentas_bancarias").where("empresaId", "==", empresaId).where("claveOperativa", "==", claveOperativa));
  if (candidatas.size !== 1) fail("failed-precondition", "CUENTA_INVALIDA");
  const snap = candidatas.docs[0];
  const data = snap.data() as Record<string, unknown>;
  if (data.id !== snap.id || data.empresaId !== empresaId || data.claveOperativa !== claveOperativa || !Number.isSafeInteger(data.saldo) || (data.saldo as number) < 0) fail("failed-precondition", "CUENTA_INVALIDA");
  return { ref: snap.ref, data, saldo: data.saldo as number };
}

export function writeMovement(tx: any, db: any, input: { empresaId: string; command: Envelope; key: string; account: { ref: any; data: Record<string, unknown>; saldo: number }; tipo: Tipo; monto: number; categoria: string; actorUid: string; rol: string; turnoId?: string | null; ventaId?: string | null; }) {
  const id = crearIdentificadorInterno(input.empresaId, `movfin:${input.key}`);
  const ref = db.collection(MOVIMIENTOS).doc(id);
  const saldo = input.tipo === "ingreso" ? input.account.saldo + input.monto : input.account.saldo - input.monto;
  if (saldo < 0) fail("failed-precondition", "FONDOS_INSUFICIENTES");
  tx.create(ref, { id, empresaId: input.empresaId, claveIdempotencia: input.key, commandId: input.command.commandId, idempotencyKey: input.command.idempotencyKey, correlationId: input.command.correlationId, tipo: input.tipo, monto: input.monto, moneda: "COP", fecha: FieldValue.serverTimestamp(), cuentaDocumentoId: input.account.ref.id, cuentaClaveSnapshot: input.account.data.claveOperativa ?? input.account.ref.id, cuentaNombreSnapshot: input.account.data.nombre ?? input.account.ref.id, saldoDespues: saldo, categoria: input.categoria, referenciaColeccion: input.ventaId ? "ventas" : "operacion", referenciaId: input.ventaId ?? input.command.commandId, turnoId: input.turnoId ?? null, ventaId: input.ventaId ?? null, motivo: input.command.motivo ?? null, usuarioId: input.actorUid, usuarioNombreSnapshot: input.actorUid, rolEfectivoSnapshot: input.rol });
  tx.update(input.account.ref, { saldo });
  return { id, ref, saldo };
}

export async function revalidarAutoridadFinancieraEnTransaccion(tx: any, db: any, contexto: ContextoFinancieroOperativo, capacidad: string | readonly string[]) {
  const [empresa, membresiaSnap] = await Promise.all([
    tx.get(db.collection("empresas").doc(contexto.empresaId)),
    tx.get(db.collection("membresias").doc(`${contexto.empresaId}_${contexto.actorUid}`)),
  ]);
  if (!empresa.exists || !["trial", "activa"].includes(empresa.data()?.estado)) fail("failed-precondition", "EMPRESA_NO_OPERATIVA");
  const membresia = membresiaSnap.data() as Record<string, unknown> | undefined;
  if (!esMembresiaAutorizada(membresia, contexto) || membresia?.rol !== contexto.rol) fail("permission-denied", "TENANT_ACCESS_DENIED");
  const capacidades = Array.isArray(capacidad) ? capacidad : [capacidad];
  if (!capacidades.some((item) => (membresia as any).permisos.includes(item))) fail("permission-denied", "ROLE_FORBIDDEN");
}

export async function resolverTurnoRecaudoPropioEnTransaccion(tx: any, db: any, empresaId: string, actorUid: string) {
  const lock = await tx.get(db.collection("turnos_activos").doc(crearIdentificadorInterno(empresaId, actorUid)));
  const turnoId = lock.data()?.turnoId;
  const turno = text(turnoId) ? await tx.get(db.collection("turnos").doc(turnoId)) : null;
  if (!lock.exists || lock.data()?.empresaId !== empresaId || lock.data()?.cajeroId !== actorUid || !turno || !turno.exists || turno.data()?.empresaId !== empresaId || turno.data()?.estado !== "abierto") fail("failed-precondition", "TURNO_CERRADO");
  return turnoId as string;
}

export async function executeConContexto(db: any, contexto: ContextoFinancieroOperativo, data: unknown, tipo: string, effect: (tx: any, firestore: any, empresaId: string, actorUid: string, rol: string, input: Envelope) => Promise<Record<string, unknown>>) {
  const input = envelope(data);
  const huella = crearHuellaSemantica({ tipo, causationId: input.causationId ?? null, motivo: input.motivo ?? null, payload: input.payload });
  const refs = refsOperacion(db, contexto.empresaId, input);
  return db.runTransaction(async (tx: any) => {
    const [recibo, indice] = await Promise.all([tx.get(refs.recibo), tx.get(refs.indice)]);
    if (recibo.exists || indice.exists) {
      const r = recibo.data(); const i = indice.data();
      if (!recibo.exists || !r || r.empresaId !== contexto.empresaId || r.commandId !== input.commandId || r.idempotencyKey !== input.idempotencyKey || r.huella !== huella) fail("already-exists", "COMMAND_ID_CONFLICT");
      if (!indice.exists || !i || i.empresaId !== contexto.empresaId || i.commandId !== input.commandId || i.idempotencyKey !== input.idempotencyKey || i.huella !== huella || i.reciboPath !== refs.recibo.path) fail("already-exists", "IDEMPOTENCY_CONFLICT");
      return r.resultado ?? fail("already-exists", "COMMAND_ID_CONFLICT");
    }
    const resultado = await effect(tx, db, contexto.empresaId, contexto.actorUid, contexto.rol, input);
    const now = FieldValue.serverTimestamp();
    tx.create(refs.recibo, { empresaId: contexto.empresaId, commandId: input.commandId, idempotencyKey: input.idempotencyKey, huella, tipo, actor: { uid: contexto.actorUid, rolEfectivo: contexto.rol }, correlationId: input.correlationId, causationId: input.causationId ?? null, motivo: input.motivo ?? null, resultado, referencias: resultado, estado: "CONFIRMADO", creadoEn: now });
    tx.create(refs.indice, { empresaId: contexto.empresaId, commandId: input.commandId, idempotencyKey: input.idempotencyKey, huella, reciboPath: refs.recibo.path, creadoEn: now });
    tx.create(refs.auditoria, { empresaId: contexto.empresaId, tipo, resultado: "CONFIRMADO", actor: { uid: contexto.actorUid, rolEfectivo: contexto.rol }, causationId: input.causationId ?? null, comando: { id: input.commandId, tipo, idempotencyKey: input.idempotencyKey, huella, correlationId: input.correlationId }, motivo: input.motivo ?? null, referencias: resultado, creadoEn: now });
    return resultado;
  });
}
