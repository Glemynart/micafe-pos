import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  ejecutarAplicarEfectosVentaOperativaV1,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../finanzas/callables";
import { crearVentaDemostracion, type ContextoFiscal } from "../fiscal/service";
import { crearIdentificadorInterno } from "../turnos/identificadores";

const REGION = "us-central1";
const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operación de reservas.", { code: dominio });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const reservaIdValido = (value: unknown): value is string => text(value) && /^[A-Za-z0-9_-]{1,80}$/.test(value);

interface ReservaDoc {
  empresaId?: string;
  mesaId?: string;
  espacioId?: string;
  fechaInicio?: string;
  fechaFin?: string;
  fechaLocal?: string;
  bloques?: unknown;
  montoTotal?: number;
  clienteNombre?: string;
  referenciaPago?: string;
  estadoPago?: "pendiente" | "pagado" | "fallido";
  estadoReserva?: "activa" | "completada" | "cancelada";
}

interface BloqueAgenda {
  reservaId: string;
  estado: "hold" | "confirmado";
  holdExpira?: string | null;
  creadoEn?: string;
}

interface AgendaDoc {
  empresaId?: string;
  mesaId?: string;
  espacioId?: string;
  bloques?: Record<string, BloqueAgenda>;
  actualizadoEn?: string;
}

interface CompletarPayload {
  reservaId: string;
  turnoId?: string;
  metodoPago?: "efectivo" | "transferencia";
}

function envelope(data: unknown): Envelope & { payload: CompletarPayload } {
  if (!object(data) || !text(data.commandId) || !text(data.idempotencyKey) || !text(data.correlationId) || !object(data.payload)) {
    return fail("invalid-argument", "PAYLOAD_INVALID");
  }
  const payload = data.payload as Record<string, unknown>;
  if (!reservaIdValido(payload.reservaId)) return fail("invalid-argument", "RESERVA_INVALIDA");
  if (payload.turnoId !== undefined && !text(payload.turnoId)) return fail("invalid-argument", "TURNO_INVALIDO");
  if (payload.metodoPago !== undefined && payload.metodoPago !== "efectivo" && payload.metodoPago !== "transferencia") {
    return fail("invalid-argument", "PAGO_INVALIDO");
  }
  return data as unknown as Envelope & { payload: CompletarPayload };
}

function reservationOperationRef(db: any, empresaId: string, reservaId: string) {
  return db.collection("reservas_operaciones").doc(crearIdentificadorInterno(empresaId, `reserva:${reservaId}`));
}

function deterministicSaleId(reservaId: string) {
  return `reserva_${reservaId}`;
}

function agendaCoordinates(reserva: ReservaDoc, reservaId: string) {
  const mesaId = text(reserva.mesaId) ? reserva.mesaId : "";
  if (!mesaId) return null;

  const colombiaOffsetMs = -5 * 60 * 60 * 1000;
  let fechaLocal = text(reserva.fechaLocal) ? reserva.fechaLocal : "";
  if (!fechaLocal && text(reserva.fechaInicio)) {
    const fecha = new Date(new Date(reserva.fechaInicio).getTime() + colombiaOffsetMs);
    fechaLocal = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(fecha.getUTCDate()).padStart(2, "0")}`;
  }

  let bloques = Array.isArray(reserva.bloques)
    ? reserva.bloques.filter((bloque): bloque is string => typeof bloque === "string" && /^\d{2}$/.test(bloque))
    : [];
  if (!bloques.length && text(reserva.fechaInicio) && text(reserva.fechaFin)) {
    const inicio = new Date(new Date(reserva.fechaInicio).getTime() + colombiaOffsetMs).getUTCHours();
    const fin = new Date(new Date(reserva.fechaFin).getTime() + colombiaOffsetMs).getUTCHours();
    bloques = [];
    for (let hora = inicio; hora < fin; hora += 1) bloques.push(String(hora).padStart(2, "0"));
  }

  if (!fechaLocal || !bloques.length) return null;
  return { agendaId: `${mesaId}_${fechaLocal}`, bloques, reservaId };
}

function completarContextoFiscal(contexto: ContextoFinancieroOperativo): ContextoFiscal {
  return {
    empresaId: contexto.empresaId,
    actorId: contexto.actorUid,
    paisFiscal: "CO",
    origen: "ADMIN",
    rolEfectivo: contexto.rol,
  };
}

function validarVentaDeReserva(venta: Record<string, unknown>, empresaId: string, reservaId: string, montoTotal: number) {
  if (venta.empresaId !== empresaId || venta.estadoOperativo !== "COMPLETO" || venta.modoOperacion !== "DEMO") {
    fail("failed-precondition", "VENTA_RESERVA_NO_COMPLETA");
  }
  if (Number((venta.totales as Record<string, unknown> | undefined)?.total) !== montoTotal) {
    fail("failed-precondition", "VENTA_RESERVA_IMPORTE_INVALIDO");
  }
  const items = venta.items;
  if (!Array.isArray(items) || items.length !== 1 || (items[0] as Record<string, unknown>)?.id !== `quick-reserva-${reservaId}`) {
    fail("failed-precondition", "VENTA_RESERVA_REFERENCIA_INVALIDA");
  }
}

async function reclamarCompletado(
  db: any,
  contexto: ContextoFinancieroOperativo,
  input: Envelope & { payload: CompletarPayload },
) {
  const ref = reservationOperationRef(db, contexto.empresaId, input.payload.reservaId);
  return db.runTransaction(async (tx: any) => {
    await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "reservas");
    const reservaRef = db.collection("reservas").doc(input.payload.reservaId);
    const [reservaSnap, operacionSnap] = await Promise.all([tx.get(reservaRef), tx.get(ref)]);
    if (!reservaSnap.exists || reservaSnap.data()?.empresaId !== contexto.empresaId) return fail("not-found", "RESERVA_NOT_FOUND");

    const reserva = reservaSnap.data() as ReservaDoc;
    if (reserva.estadoReserva === "completada") return { estado: "COMPLETADA" as const, reserva };
    if (reserva.estadoReserva === "cancelada") return fail("failed-precondition", "RESERVA_CANCELADA");
    if (!money(reserva.montoTotal)) return fail("failed-precondition", "RESERVA_IMPORTE_INVALIDO");

    const huella = JSON.stringify({
      reservaId: input.payload.reservaId,
      turnoId: input.payload.turnoId ?? null,
      metodoPago: input.payload.metodoPago ?? null,
    });
    if (operacionSnap.exists) {
      const operacion = operacionSnap.data() as Record<string, unknown>;
      if (operacion.commandId !== input.commandId || operacion.idempotencyKey !== input.idempotencyKey || operacion.huella !== huella) {
        return fail("already-exists", "RESERVA_OPERACION_CONFLICTO");
      }
      if (operacion.estado === "COMPLETADA") return { estado: "COMPLETADA" as const, reserva };
      return { estado: "EN_PROCESO" as const, reserva, operacion };
    }

    const necesitaVenta = reserva.estadoPago !== "pagado";
    if (necesitaVenta && (!text(input.payload.turnoId) || !input.payload.metodoPago)) {
      return fail("failed-precondition", "TURNO_REQUERIDO");
    }
    const operacion = {
      empresaId: contexto.empresaId,
      reservaId: input.payload.reservaId,
      commandId: input.commandId,
      idempotencyKey: input.idempotencyKey,
      huella,
      estado: "EN_PROCESO",
      ventaId: necesitaVenta ? deterministicSaleId(input.payload.reservaId) : null,
      turnoId: input.payload.turnoId ?? null,
      metodoPago: input.payload.metodoPago ?? null,
      creadoEn: FieldValue.serverTimestamp(),
    };
    tx.create(ref, operacion);
    return { estado: "EN_PROCESO" as const, reserva, operacion };
  });
}

async function ejecutarCobroReserva(
  db: any,
  contexto: ContextoFinancieroOperativo,
  input: Envelope & { payload: CompletarPayload },
  reserva: ReservaDoc,
  operacion: Record<string, unknown>,
) {
  if (reserva.estadoPago === "pagado") return;
  const ventaId = operacion.ventaId;
  if (!text(ventaId) || !text(input.payload.turnoId) || !input.payload.metodoPago || !money(reserva.montoTotal)) {
    return fail("failed-precondition", "RESERVA_COBRO_INVALIDO");
  }

  const entradaVenta = {
    commandId: `reservaVenta_${input.payload.reservaId}`,
    idempotencyKey: `reservaVenta_${input.payload.reservaId}`,
    correlationId: `reservaVentaCorr_${input.payload.reservaId}`,
    causationId: input.commandId,
    expectedRevision: 1,
    ventaId,
      espacioId: text(reserva.espacioId) ? reserva.espacioId : undefined,
      venta: {
        turnoId: input.payload.turnoId,
        cajeroId: contexto.actorUid,
        cajeroNombre: contexto.actorUid,
      items: [{
        id: `quick-reserva-${input.payload.reservaId}`,
        nombre: `Reserva sala: ${reserva.mesaId ?? "web"}`,
        cantidad: 1,
        precioUnitario: reserva.montoTotal,
        costoUnitario: 0,
        subtotal: reserva.montoTotal,
      }],
      metodoPago: input.payload.metodoPago,
      pagoMixtoDetalle: undefined,
    },
  };
  await crearVentaDemostracion(db, entradaVenta, completarContextoFiscal(contexto));
  await ejecutarAplicarEfectosVentaOperativaV1(db, contexto, {
    commandId: `reservaEfectos_${input.payload.reservaId}`,
    idempotencyKey: `reservaEfectos_${input.payload.reservaId}`,
    correlationId: `reservaEfectosCorr_${input.payload.reservaId}`,
    causationId: entradaVenta.commandId,
    payload: { ventaId },
  });
}

async function efectoCancelarReservaOperativaV1(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "reservas");
  const reservaId = input.payload.reservaId;
  if (!reservaIdValido(reservaId)) return fail("invalid-argument", "RESERVA_INVALIDA");
  const reservaRef = db.collection("reservas").doc(reservaId);
  const operacionRef = reservationOperationRef(db, empresaId, reservaId);
  const ventaRef = db.collection("ventas").doc(deterministicSaleId(reservaId));
  const reservaSnap = await tx.get(reservaRef);
  const [operacionSnap, ventaSnap] = await Promise.all([tx.get(operacionRef), tx.get(ventaRef)]);
  if (!reservaSnap.exists || reservaSnap.data()?.empresaId !== empresaId) return fail("not-found", "RESERVA_NOT_FOUND");
  const reserva = reservaSnap.data() as ReservaDoc;
  const intentRef = text(reserva.referenciaPago) ? db.collection("intenciones_pago_reserva").doc(reserva.referenciaPago) : null;
  const intentSnap = intentRef ? await tx.get(intentRef) : null;
  if (reserva.estadoReserva === "cancelada") return { commandId: input.commandId, reservaId, estadoReserva: "cancelada", idempotente: true };
  if (reserva.estadoReserva === "completada") return fail("failed-precondition", "RESERVA_COMPLETADA");
  if (intentSnap?.exists) {
    const intent = intentSnap.data() as Record<string, unknown>;
    if (intent.empresaId !== empresaId || intent.reservaId !== reservaId) return fail("failed-precondition", "RESERVA_INCONSISTENTE");
    if (intent.estado !== "CREADA") return fail("failed-precondition", "RESERVA_EN_PROCESO");
  }
  if (operacionSnap.exists && operacionSnap.data()?.estado === "EN_PROCESO") return fail("failed-precondition", "RESERVA_EN_PROCESO");
  if (ventaSnap.exists && ventaSnap.data()?.empresaId === empresaId) return fail("failed-precondition", "RESERVA_EN_PROCESO");

  const coordenadas = agendaCoordinates(reserva, reservaId);
  const agendaRef = coordenadas ? db.collection("agendas").doc(coordenadas.agendaId) : null;
  const agendaSnap = agendaRef ? await tx.get(agendaRef) : null;
  const ahora = new Date().toISOString();

  tx.update(reservaRef, { estadoReserva: "cancelada", fechaCancelada: ahora });
  if (agendaRef && agendaSnap?.exists) {
    const agenda = agendaSnap.data() as AgendaDoc;
    const bloques = { ...(agenda.bloques ?? {}) };
    let cambio = false;
    for (const bloque of coordenadas!.bloques) {
      if (bloques[bloque]?.reservaId === reservaId) {
        delete bloques[bloque];
        cambio = true;
      }
    }
    if (cambio) tx.set(agendaRef, { ...agenda, bloques, actualizadoEn: ahora, empresaId });
  }
  return { commandId: input.commandId, reservaId, estadoReserva: "cancelada", actorUid };
}

async function efectoCompletarReservaOperativaV1(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "reservas");
  const reservaId = input.payload.reservaId;
  if (!reservaIdValido(reservaId)) return fail("invalid-argument", "RESERVA_INVALIDA");
  const reservaRef = db.collection("reservas").doc(reservaId);
  const operacionRef = reservationOperationRef(db, empresaId, reservaId);
  const [reservaSnap, operacionSnap] = await Promise.all([tx.get(reservaRef), tx.get(operacionRef)]);
  if (!reservaSnap.exists || reservaSnap.data()?.empresaId !== empresaId) return fail("not-found", "RESERVA_NOT_FOUND");
  const reserva = reservaSnap.data() as ReservaDoc;
  if (reserva.estadoReserva === "completada") return { commandId: input.commandId, reservaId, estadoReserva: "completada", idempotente: true };
  if (reserva.estadoReserva === "cancelada") return fail("failed-precondition", "RESERVA_CANCELADA");
  if (!operacionSnap.exists || operacionSnap.data()?.commandId !== input.commandId) return fail("failed-precondition", "RESERVA_OPERACION_NO_RECLAMADA");
  const operacion = operacionSnap.data() as Record<string, unknown>;
  if (operacion.estado !== "EN_PROCESO") return fail("failed-precondition", "RESERVA_OPERACION_INVALIDA");

  const ventaId = operacion.ventaId;
  const ventaRef = text(ventaId) ? db.collection("ventas").doc(ventaId) : null;
  const ventaSnap = ventaRef ? await tx.get(ventaRef) : null;
  if (reserva.estadoPago !== "pagado") {
    if (!ventaRef || !ventaSnap?.exists || !money(reserva.montoTotal)) return fail("failed-precondition", "VENTA_RESERVA_NO_COMPLETA");
    validarVentaDeReserva(ventaSnap.data() as Record<string, unknown>, empresaId, reservaId, reserva.montoTotal);
  }

  const coordenadas = agendaCoordinates(reserva, reservaId);
  const agendaRef = coordenadas ? db.collection("agendas").doc(coordenadas.agendaId) : null;
  const agendaSnap = agendaRef ? await tx.get(agendaRef) : null;
  const ahora = new Date().toISOString();
  tx.update(reservaRef, { estadoReserva: "completada", estadoPago: "pagado", fechaCompletada: ahora });
  if (agendaRef && agendaSnap?.exists) {
    const agenda = agendaSnap.data() as AgendaDoc;
    const bloques = { ...(agenda.bloques ?? {}) };
    let cambio = false;
    for (const bloque of coordenadas!.bloques) {
      if (bloques[bloque]?.reservaId === reservaId && bloques[bloque].estado !== "confirmado") {
        bloques[bloque] = { ...bloques[bloque], estado: "confirmado", holdExpira: null };
        cambio = true;
      }
    }
    if (cambio) tx.set(agendaRef, { ...agenda, bloques, actualizadoEn: ahora, empresaId });
  }
  tx.update(operacionRef, { estado: "COMPLETADA", completadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, reservaId, estadoReserva: "completada", ...(text(ventaId) ? { ventaId } : {}) };
}

export async function ejecutarCancelarReservaOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  const input = envelope(data);
  return executeConContexto(db, contexto, input, "cancelarReservaOperativaV1", efectoCancelarReservaOperativaV1);
}

export async function ejecutarCompletarReservaOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  const input = envelope(data);
  const claim = await reclamarCompletado(db, contexto, input);
  if (claim.estado === "COMPLETADA") {
    return executeConContexto(db, contexto, input, "completarReservaOperativaV1", efectoCompletarReservaOperativaV1);
  }
  if (claim.reserva.estadoPago !== "pagado") await ejecutarCobroReserva(db, contexto, input, claim.reserva, claim.operacion);
  return executeConContexto(db, contexto, input, "completarReservaOperativaV1", efectoCompletarReservaOperativaV1);
}

export const cancelarReservaOperativaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarCancelarReservaOperativaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const completarReservaOperativaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarCompletarReservaOperativaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});
