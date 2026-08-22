import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { MAX_BODY_WEBHOOK_BYTES, validarConfiguracionReservasPublicas } from "../../../lib/reservas-publicas/contrato";
import { compararHexSeguro } from "../../../lib/reservas-publicas/crypto-servidor";
import { claveAsignacion, confirmarVentaFiscal } from "../fiscal/service";
import { ejecutarAplicarEfectosVentaSistemaWompiV1 } from "../finanzas/callables";
import { scopeEmpresa, scopeEspacio, type Asignacion, type Numeracion } from "../../../lib/fiscal/contrato";

const WOMPI_EVENTS_SECRET = defineSecret("WOMPI_EVENTS_SECRET");
const REGION = "us-central1";
const REQUIRED_SIGNED = ["data.transaction.id", "data.transaction.status", "data.transaction.reference", "data.transaction.amount_in_cents", "data.transaction.currency", "data.transaction.environment"] as const;
const ALLOWED_SIGNED = new Set<string>(REQUIRED_SIGNED);

type Transaction = { id: string; status: string; reference: string; amount_in_cents: number; currency: string; environment?: string };
type Evento = { event: "transaction.updated"; timestamp: number | string; data: { transaction: Transaction }; signature: { properties: string[]; checksum: string } };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 240): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
function atPath(value: unknown, path: string): unknown { return path.split(".").reduce<unknown>((current, key) => object(current) ? current[key] : undefined, value); }
function stableId(prefix: string, reference: string) { return `${prefix}_${createHash("sha256").update(reference).digest("hex")}`; }

export function validarEventoWompi(value: unknown, secret: string, expectedEnvironment: string): { ok: true; event: Evento } | { ok: false; code: string } {
  if (!object(value) || value.event !== "transaction.updated" || !object(value.data) || !object(value.data.transaction) || !object(value.signature)) return { ok: false, code: "EVENT_INVALID" };
  const transaction = value.data.transaction as Record<string, unknown>;
  const signature = value.signature as Record<string, unknown>;
  if (!text(transaction.id, 120) || transaction.status !== "APPROVED" || !text(transaction.reference, 120) || !Number.isSafeInteger(transaction.amount_in_cents) || (transaction.amount_in_cents as number) <= 0 || transaction.currency !== "COP") return { ok: false, code: "TRANSACTION_INVALID" };
  if (!text(expectedEnvironment, 32) || transaction.environment !== expectedEnvironment) return { ok: false, code: "ENVIRONMENT_MISMATCH" };
  if (!Array.isArray(signature.properties)) return { ok: false, code: "SIGNED_PROPERTIES_INVALID" };
  const properties = signature.properties as unknown[];
  if (properties.length < REQUIRED_SIGNED.length || properties.length > ALLOWED_SIGNED.size
    || properties.some(property => !text(property, 80) || !ALLOWED_SIGNED.has(property))
    || new Set(properties).size !== properties.length
    || REQUIRED_SIGNED.some(required => !properties.includes(required))) return { ok: false, code: "SIGNED_PROPERTIES_INVALID" };
  if ((typeof value.timestamp !== "string" && typeof value.timestamp !== "number") || !text(signature.checksum, 64)) return { ok: false, code: "SIGNATURE_INVALID" };
  const signed = (properties as string[]).map(path => atPath(value, path));
  if (signed.some(item => item === undefined || item === null || typeof item === "object")) return { ok: false, code: "SIGNED_PROPERTIES_INVALID" };
  const expected = createHash("sha256").update(`${signed.join("")}${value.timestamp}${secret}`, "utf8").digest("hex");
  if (!compararHexSeguro(signature.checksum, expected)) return { ok: false, code: "SIGNATURE_INVALID" };
  return { ok: true, event: value as unknown as Evento };
}

async function reclamarPago(db: FirebaseFirestore.Firestore, transaction: Transaction, ahora: Date) {
  return db.runTransaction(async tx => {
    const intentRef = db.collection("intenciones_pago_reserva").doc(transaction.reference);
    const intentSnap = await tx.get(intentRef);
    if (!intentSnap.exists) return { kind: "NOT_FOUND" as const };
    const intent = intentSnap.data() as Record<string, any>;
    if (intent.estado === "COMPLETADA") return { kind: "COMPLETED" as const, intent };
    const reservaRef = db.collection("reservas").doc(String(intent.reservaId ?? ""));
    const reservaSnap = await tx.get(reservaRef);
    const reserva = reservaSnap.data() as Record<string, any> | undefined;
    const basicMismatch = intent.reference !== transaction.reference || intent.moneda !== transaction.currency || intent.montoEsperadoCentavos !== transaction.amount_in_cents
      || !text(intent.empresaId, 80) || !reservaSnap.exists || reserva?.empresaId !== intent.empresaId || reserva?.referenciaPago !== transaction.reference
      || reserva?.montoTotal * 100 !== intent.montoEsperadoCentavos || reserva?.mesaId !== intent.mesaId || reserva?.espacioId !== intent.espacioId
      || !text(intent.mesaId, 120) || !text(intent.espacioId, 120) || !text(reserva?.fechaLocal, 10);
    if (basicMismatch || (intent.providerTransactionId && intent.providerTransactionId !== transaction.id)) {
      tx.update(intentRef, { estado: "REQUIERE_REVISION", motivoRevision: "PAGO_NO_COINCIDE_CON_INTENCION", actualizadaEn: ahora.toISOString() });
      return { kind: "MISMATCH" as const };
    }
    const empresaRef = db.collection("empresas").doc(intent.empresaId);
    const configRef = db.collection("configuraciones").doc(intent.empresaId);
    const mesaRef = db.collection("mesas").doc(intent.mesaId);
    const agendaRef = db.collection("agendas").doc(`${intent.mesaId}_${reserva!.fechaLocal}`);
    const [empresaSnap, configSnap, mesaSnap, agendaSnap] = await Promise.all([
      tx.get(empresaRef), tx.get(configRef), tx.get(mesaRef), tx.get(agendaRef),
    ]);
    const empresa = empresaSnap.data() as Record<string, any> | undefined;
    const config = configSnap.data() as Record<string, any> | undefined;
    const mesa = mesaSnap.data() as Record<string, any> | undefined;
    const agenda = agendaSnap.data() as Record<string, any> | undefined;
    const bloques = Array.isArray(reserva?.bloques) ? reserva.bloques : [];
    const ownershipMismatch = !empresaSnap.exists || !["trial", "activa"].includes(String(empresa?.estado))
      || !mesaSnap.exists || mesa?.empresaId !== intent.empresaId || mesa?.espacioId !== intent.espacioId
      || !agendaSnap.exists || agenda?.empresaId !== intent.empresaId || agenda?.mesaId !== intent.mesaId || agenda?.espacioId !== intent.espacioId
      || bloques.length === 0 || bloques.some((key: unknown) => !text(key, 2) || agenda?.bloques?.[key as string]?.reservaId !== intent.reservaId || agenda?.bloques?.[key as string]?.estado !== "hold");
    const holdExpira = Date.parse(String(reserva?.holdExpira ?? ""));
    const initialClaimMismatch = intent.estado === "CREADA" && (
      !configSnap.exists || !validarConfiguracionReservasPublicas(config?.reservasPublicas) || config?.reservasPublicas?.habilitadas !== true
      || reserva?.holdExpira !== intent.holdExpira || !Number.isFinite(holdExpira) || holdExpira <= ahora.getTime()
    );
    if (ownershipMismatch || initialClaimMismatch || !["CREADA", "PAGO_RECLAMADO", "VENTA_PENDIENTE_EFECTOS"].includes(intent.estado)) {
      tx.update(intentRef, { estado: "REQUIERE_REVISION", motivoRevision: "HOLD_O_TENANT_NO_VIGENTE", actualizadaEn: ahora.toISOString() });
      return { kind: "MISMATCH" as const };
    }
    if (intent.estado === "CREADA") tx.update(intentRef, { estado: "PAGO_RECLAMADO", providerTransactionId: transaction.id, pagoAprobadoEn: ahora.toISOString(), actualizadaEn: ahora.toISOString() });
    return { kind: "CLAIMED" as const, intent: { ...intent, providerTransactionId: transaction.id }, reserva };
  });
}

async function resolverNumeracion(db: FirebaseFirestore.Firestore, empresaId: string, espacioId: string) {
  const scopes = [scopeEspacio(espacioId), scopeEmpresa()];
  for (const scope of scopes) {
    const snap = await db.collection("asignaciones_numeracion").doc(`${empresaId}_${claveAsignacion(scope, "pos")}`).get();
    if (!snap.exists || snap.data()?.estado !== "VIGENTE") continue;
    const asignacion = snap.data() as Asignacion;
    const numeracion = await db.collection("numeraciones").doc(`${empresaId}_${asignacion.numeracionId}`).get();
    if (!numeracion.exists) throw new Error("NUMERACION_NOT_FOUND");
    return { asignacion, numeracion: numeracion.data() as Numeracion };
  }
  throw new Error("ASIGNACION_NOT_FOUND");
}

async function finalizarReserva(db: FirebaseFirestore.Firestore, reference: string, transactionId: string, ventaId: string) {
  await db.runTransaction(async tx => {
    const intentRef = db.collection("intenciones_pago_reserva").doc(reference); const intentSnap = await tx.get(intentRef);
    if (!intentSnap.exists) throw new Error("INTENT_NOT_FOUND");
    const intent = intentSnap.data() as Record<string, any>;
    if (intent.estado === "COMPLETADA") return;
    const reservaRef = db.collection("reservas").doc(intent.reservaId); const agendaRef = db.collection("agendas").doc(`${intent.mesaId}_${(await tx.get(reservaRef)).data()?.fechaLocal}`);
    const [reservaSnap, agendaSnap] = await Promise.all([tx.get(reservaRef), tx.get(agendaRef)]);
    const reserva = reservaSnap.data() as Record<string, any> | undefined; const agenda = agendaSnap.data() as Record<string, any> | undefined;
    if (!reservaSnap.exists || !agendaSnap.exists || reserva?.empresaId !== intent.empresaId || agenda?.empresaId !== intent.empresaId || agenda?.mesaId !== intent.mesaId || agenda?.espacioId !== intent.espacioId) throw new Error("RESERVA_INCONSISTENTE");
    const bloques = { ...(agenda?.bloques ?? {}) };
    for (const key of reserva?.bloques ?? []) { if (bloques[key]?.reservaId !== intent.reservaId) throw new Error("AGENDA_INCONSISTENTE"); bloques[key] = { ...bloques[key], estado: "confirmado", holdExpira: null }; }
    tx.update(agendaRef, { bloques, actualizadoEn: new Date().toISOString() });
    tx.update(reservaRef, { estadoPago: "pagado", referenciaTransaccion: transactionId, ventaId });
    tx.update(intentRef, { estado: "COMPLETADA", ventaId, completadaEn: new Date().toISOString(), actualizadaEn: new Date().toISOString() });
  });
}

export async function procesarEventoWompi(db: FirebaseFirestore.Firestore, event: Evento, ahora = new Date()) {
  const transaction = event.data.transaction;
  const claim = await reclamarPago(db, transaction, ahora);
  if (claim.kind === "NOT_FOUND") return { status: 404, code: "INTENT_NOT_FOUND" };
  if (claim.kind === "MISMATCH") return { status: 409, code: "PAYMENT_MISMATCH" };
  if (claim.kind === "COMPLETED") return { status: 200, code: "ALREADY_COMPLETED" };
  const intent = claim.intent as Record<string, any>;
  const ventaId = text(intent.ventaId, 120) ? intent.ventaId : stableId("wompi_sale", transaction.reference);
  const command = stableId("wompi", transaction.reference);
  const actor = `wompi:${transaction.id}`;
  const correlacion = stableId("wompi_corr", transaction.reference);
  if (intent.estado !== "VENTA_PENDIENTE_EFECTOS") {
    const { asignacion, numeracion } = await resolverNumeracion(db, intent.empresaId, intent.espacioId);
    const expectedRevision = Number.isSafeInteger(intent.expectedNumeracionRevision) ? intent.expectedNumeracionRevision : numeracion.revision;
    const expectedAsignacionRevision = Number.isSafeInteger(intent.expectedAsignacionRevision) ? intent.expectedAsignacionRevision : asignacion.revision;
    await db.collection("intenciones_pago_reserva").doc(transaction.reference).update({ expectedNumeracionRevision: expectedRevision, expectedAsignacionRevision, ventaId, actualizadaEn: new Date().toISOString() });
    const empresa = await db.collection("empresas").doc(intent.empresaId).get();
    const paisFiscal = String(empresa.data()?.paisFiscal ?? "");
    const line = intent.lineaFiscalSnapshot as Record<string, any>;
    await confirmarVentaFiscal(db, {
      commandId: command, idempotencyKey: command, correlationId: correlacion, causationId: stableId("wompi_event", transaction.id), expectedRevision,
      expectedAsignacionRevision, ventaId, espacioId: intent.espacioId, tipoDocumento: "pos", motivo: "Pago aprobado de reserva pública",
      venta: { turnoId: "reserva-publica", cajeroId: actor, cajeroNombre: "Wompi", clienteNombre: claim.reserva?.clienteNombre ?? "Cliente web", origenReserva: intent.reservaId, cuentaClaveOperativa: intent.cuentaClaveOperativa, metodoPago: "transferencia", estado: "pagada", items: [line], totales: { subtotalBase: line.base, totalINC: line.impuestoTipo === "inc_8" ? line.impuestoValor : 0, total: intent.montoEsperadoCentavos / 100 }, pago: { metodo: "transferencia" } },
    }, { empresaId: intent.empresaId, actorId: actor, paisFiscal, origen: "SYSTEM", rolEfectivo: "system" });
    await db.collection("intenciones_pago_reserva").doc(transaction.reference).update({ estado: "VENTA_PENDIENTE_EFECTOS", ventaId, actualizadaEn: new Date().toISOString() });
  }
  await ejecutarAplicarEfectosVentaSistemaWompiV1(db, { empresaId: intent.empresaId, actorUid: actor, rol: "system", ejecutorTecnico: "wompiReservasWebhookV1" }, { commandId: `${command}_effects`, idempotencyKey: `${command}_effects`, correlationId: correlacion, causationId: command, payload: { ventaId } });
  await finalizarReserva(db, transaction.reference, transaction.id, ventaId);
  return { status: 200, code: "COMPLETED", ventaId };
}

export const wompiReservasWebhookV1 = onRequest({ region: REGION, secrets: [WOMPI_EVENTS_SECRET], invoker: "public" }, async (req, res) => {
  if (process.env.RESERVAS_PUBLICAS_ENABLED !== "true") { res.status(503).json({ error: "CAPABILITY_DISABLED" }); return; }
  const size = req.rawBody?.byteLength ?? Number(req.get("content-length") ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BODY_WEBHOOK_BYTES) { res.status(413).json({ error: "BODY_TOO_LARGE" }); return; }
  const validated = validarEventoWompi(req.body, WOMPI_EVENTS_SECRET.value(), process.env.WOMPI_ENVIRONMENT ?? "");
  if (!validated.ok) { res.status(401).json({ error: validated.code }); return; }
  try { const result = await procesarEventoWompi(getFirestore(), validated.event); res.status(result.status).json({ result: result.code }); }
  catch (error) { logger.error("wompi_reservation_processing_failed", { reference: validated.event.data.transaction.reference, transactionId: validated.event.data.transaction.id, error: error instanceof Error ? error.name : "unknown" }); res.status(500).json({ error: "PROCESSING_FAILED" }); }
});
