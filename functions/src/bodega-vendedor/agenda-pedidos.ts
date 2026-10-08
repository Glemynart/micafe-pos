import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  crearHuellaSemantica,
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
} from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { revalidarAutoridadVentaBodegaEnTransaccion } from "./ventas-authority";
import { resolverVentaBodegaEnTransaccion } from "./ventas-resolution";

const AGENDA = "agenda_pedidos_bodega";
const RESERVAS = "reservas_stock_bodega";
const EVENTOS = "eventos_operativos";
const MAX_LINEAS = 50;
type LineaIntento = { productoId: string; presentacionId: string; cantidad: number };
type Franja = { desde: string; hasta: string } | null;
type Envelope = { commandId: string; idempotencyKey: string; correlationId: string; causationId: string | null; payload: Record<string, any> };

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible procesar la agenda Bodega.", { code: domain });
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const ownKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));

function normalizeEnvelope(raw: unknown, keys: readonly string[]): Envelope {
  if (!object(raw) || !ownKeys(raw, ["commandId", "idempotencyKey", "correlationId", "causationId", "payload"])
    || !text(raw.commandId) || raw.commandId.trim().length > 160
    || !text(raw.idempotencyKey) || raw.idempotencyKey.trim().length > 160
    || !text(raw.correlationId) || raw.correlationId.trim().length > 160
    || (raw.causationId !== null && raw.causationId !== undefined && (!text(raw.causationId) || raw.causationId.trim().length > 160))
    || !object(raw.payload) || !ownKeys(raw.payload, keys)) fail("invalid-argument", "AGENDA_COMANDO_INVALIDO");
  const data = raw as Record<string, any>;
  return {
    commandId: data.commandId.trim(), idempotencyKey: data.idempotencyKey.trim(), correlationId: data.correlationId.trim(),
    causationId: typeof data.causationId === "string" ? data.causationId.trim() : null, payload: data.payload,
  };
}

function normalizeLines(value: unknown): LineaIntento[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINEAS) fail("invalid-argument", "AGENDA_LINEAS_INVALIDAS");
  return (value as unknown[]).map((rawLine: unknown) => {
    const line = rawLine as Record<string, any>;
    if (!object(line) || !ownKeys(line, ["productoId", "presentacionId", "cantidad"])
      || !text(line.productoId) || line.productoId.trim().length > 1024
      || !text(line.presentacionId) || line.presentacionId.trim().length > 1024
      || !Number.isSafeInteger(line.cantidad) || line.cantidad <= 0) fail("invalid-argument", "AGENDA_LINEA_INVALIDA");
    return { productoId: line.productoId.trim(), presentacionId: line.presentacionId.trim(), cantidad: line.cantidad };
  });
}

function normalizeCreate(raw: unknown) {
  const command = normalizeEnvelope(raw, ["clienteId", "fechaLocal", "franja", "lineas"]);
  const { clienteId, fechaLocal, franja } = command.payload;
  if (!text(clienteId) || clienteId.trim().length > 160 || typeof fechaLocal !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(fechaLocal)
    || (franja !== undefined && franja !== null && (!object(franja) || !ownKeys(franja, ["desde", "hasta"])
      || typeof franja.desde !== "string" || typeof franja.hasta !== "string"))) fail("invalid-argument", "AGENDA_FECHA_INVALIDA");
  const lineas = normalizeLines(command.payload.lineas);
  return {
    command,
    payload: {
      clienteId: clienteId.trim(), fechaLocal,
      franja: franja === undefined || franja === null ? null : { desde: franja.desde, hasta: franja.hasta } as Franja,
      lineas,
    },
  };
}

function normalizeDecision(raw: unknown) {
  const command = normalizeEnvelope(raw, ["programacionId", "revision", "decision"]);
  const { programacionId, revision, decision } = command.payload;
  if (!text(programacionId) || programacionId.length > 512 || !Number.isSafeInteger(revision) || revision <= 0
    || (decision !== "aceptar" && decision !== "rechazar")) fail("invalid-argument", "AGENDA_DECISION_INVALIDA");
  return { command, payload: { programacionId: programacionId.trim(), revision, decision } };
}

function normalizeCancel(raw: unknown) {
  const command = normalizeEnvelope(raw, ["programacionId", "revision"]);
  const { programacionId, revision } = command.payload;
  if (!text(programacionId) || programacionId.length > 512 || !Number.isSafeInteger(revision) || revision <= 0) fail("invalid-argument", "AGENDA_CANCELACION_INVALIDA");
  return { command, payload: { programacionId: programacionId.trim(), revision } };
}

function normalizeConvert(raw: unknown) {
  const command = normalizeEnvelope(raw, ["programacionId"]);
  if (!text(command.payload.programacionId) || command.payload.programacionId.length > 512) fail("invalid-argument", "AGENDA_CONVERSION_INVALIDA");
  return { command, payload: { programacionId: command.payload.programacionId.trim() } };
}

function dateParts(date: Date, timeZone: string) {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map(part => [part.type, part.value]));
  } catch { fail("failed-precondition", "AGENDA_ZONA_HORARIA_INVALIDA"); }
  return parts!;
}

function localDate(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMinute(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function validCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function minutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function validateSchedule(fecha: string, franja: Franja, timeZone: string, now: Date) {
  if (!validCalendarDate(fecha)) fail("invalid-argument", "AGENDA_FECHA_INVALIDA");
  const today = localDate(now, timeZone);
  if (fecha < today) fail("failed-precondition", "AGENDA_FECHA_PASADA");
  if (franja) {
    const desde = minutes(franja.desde);
    const hasta = minutes(franja.hasta);
    if (desde === null || hasta === null) fail("invalid-argument", "AGENDA_FRANJA_INVALIDA");
    const desdeMinuto = desde as number;
    const hastaMinuto = hasta as number;
    if (hastaMinuto <= desdeMinuto) fail("invalid-argument", "AGENDA_FRANJA_INVALIDA");
    if (fecha === today && desdeMinuto <= localMinute(now, timeZone)) fail("failed-precondition", "AGENDA_FRANJA_PASADA");
  }
}

function nextLocalDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date
    ? new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
    : fail("invalid-argument", "AGENDA_FECHA_INVALIDA");
}

function localInstantMillis(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = dateParts(new Date(candidate), timeZone);
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    candidate += desired - represented;
  }
  const check = dateParts(new Date(candidate), timeZone);
  if (`${check.year}-${check.month}-${check.day}` !== date || Number(check.hour) !== hour || Number(check.minute) !== minute) {
    fail("failed-precondition", "AGENDA_HORA_LOCAL_INVALIDA");
  }
  return candidate;
}

function refs(db: any, empresaId: string, id: string) {
  return db.collection("empresas").doc(empresaId).collection(AGENDA).doc(id);
}

function publicAgenda(id: string, value: Record<string, any>) {
  return {
    programacionId: id, estado: value.estado, revision: value.revision, clienteId: value.clienteId,
    cliente: value.cliente ? { id: value.cliente.id, nombre: value.cliente.nombre, direccion: value.cliente.direccion ?? null } : null,
    fechaLocal: value.fechaLocal, franja: value.franja ?? null, zonaHoraria: value.zonaHoraria,
    lineas: value.lineas, stockReservadoUnidadBase: value.stockReservadoUnidadBase ?? 0,
    solicitanteUid: value.solicitanteUid, solicitudId: value.solicitudId ?? null,
    reservaExpiraEn: value.reservaExpiraEn ?? null, creadaEn: value.creadaEn, actualizadaEn: value.actualizadaEn,
  };
}

function eventRef(db: any, empresaId: string, id: string) {
  return db.collection(EVENTOS).doc(id);
}

function writeAgendaEvent(tx: any, db: any, input: {
  empresaId: string; actorUid: string; rol: string; commandId: string; causationId: string | null;
  programacionId: string; fechaLocal: string; etapa: string; timezone: string; programadaEn?: Timestamp;
}) {
  const eventId = crearIdentificadorInterno(input.empresaId, `agenda-reminder:${input.programacionId}:${input.etapa}`);
  tx.create(eventRef(db, input.empresaId, eventId), {
    schemaVersion: 1, eventoId: eventId, tipo: "RECORDATORIO_AGENDA_PEDIDO", empresaId: input.empresaId,
    agregado: { tipo: "PROGRAMACION_PEDIDO_BODEGA", id: input.programacionId },
    actor: { uid: input.actorUid, rolEfectivo: input.rol }, commandId: input.commandId,
    causationId: input.causationId, payloadOperativo: { programacionId: input.programacionId, fechaLocal: input.fechaLocal, zonaHoraria: input.timezone, etapa: input.etapa },
    fechaProgramada: input.programadaEn ?? Timestamp.fromMillis(Date.now()),
    fechaDisponible: input.programadaEn ?? Timestamp.fromMillis(Date.now()),
    estadoDespacho: "PENDIENTE", intentos: 0, ultimoErrorCodigo: null,
    creadoEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp(), ultimoIntentoEn: null,
  });
}

async function configAgenda(tx: any, db: any, contexto: ContextoFinancieroOperativo, admin = false) {
  if (admin) {
    if (contexto.rol !== "admin") fail("permission-denied", "AGENDA_ADMIN_REQUERIDO");
    await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "sell");
    await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "inventory");
  } else {
    if (contexto.rol !== "vendedor") fail("permission-denied", "AGENDA_VENDEDOR_REQUERIDO");
    await revalidarAutoridadVentaBodegaEnTransaccion(tx, db, contexto);
  }
  const snap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const config = snap.data() as Record<string, any> | undefined;
  const required = admin ? ["sell", "inventory"] : ["sell"];
  if (!snap.exists || config?.empresaId !== contexto.empresaId || config.vertical !== "BODEGA_MVP1"
    || !Array.isArray(config.modulos?.habilitados) || required.some(item => !config.modulos.habilitados.includes(item))) {
    fail("permission-denied", "AGENDA_BODEGA_NO_AUTORIZADA");
  }
  const timeZone = (config as Record<string, any>).localizacion?.zonaHoraria;
  if (!text(timeZone)) fail("failed-precondition", "AGENDA_ZONA_HORARIA_INVALIDA");
  dateParts(new Date(), timeZone);
  return { snap, config, timeZone: timeZone as string };
}

function saleCommand(command: Envelope, payload: { clienteId: string; lineas: LineaIntento[] }) {
  return {
    commandId: command.commandId, idempotencyKey: command.idempotencyKey, correlationId: command.correlationId,
    causationId: command.causationId,
    payload: { clienteId: payload.clienteId, lineas: payload.lineas, metodoPago: "transferencia" as const },
  };
}

export async function ejecutarCrearProgramacionPedidoBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const { command, payload } = normalizeCreate(raw);
  return executeConContexto(db, contexto, command, "crearProgramacionPedidoBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    const { timeZone } = await configAgenda(tx, firestore, contexto);
    validateSchedule(payload.fechaLocal, payload.franja, timeZone, new Date(now()));
    const resolution = await resolverVentaBodegaEnTransaccion(tx, firestore, contexto, saleCommand(command, payload));
    const programacionId = crearIdentificadorInterno(empresaId, `agenda-pedido:${input.commandId}`);
    const created = Timestamp.fromMillis(now());
    const lineas = resolution.lineas.map(line => ({
      productoId: line.productoId, productoNombre: line.productoNombreSnapshot,
      unidadBase: line.unidadBaseSnapshot, presentacionId: line.presentacionId,
      presentacionNombre: line.presentacionNombreSnapshot, cantidad: line.cantidadPresentaciones,
      factorUnidadBase: line.factorUnidadBase, cantidadUnidadBase: line.cantidadUnidadBase,
    }));
    const data = {
      programacionId, empresaId, clienteId: resolution.cliente.id,
      solicitanteUid: actorUid, fechaLocal: payload.fechaLocal, franja: payload.franja, zonaHoraria: timeZone,
      lineas, huellaIntencion: crearHuellaSemantica({ clienteId: resolution.cliente.id, lineas: payload.lineas, fechaLocal: payload.fechaLocal, franja: payload.franja }),
      estado: "PENDIENTE_REVISION", revision: 1, stockReservadoUnidadBase: 0,
      creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
    };
    tx.create(refs(firestore, empresaId, programacionId), data);
    writeAgendaEvent(tx, firestore, { empresaId, actorUid, rol, commandId: input.commandId, causationId: input.causationId ?? null, programacionId, fechaLocal: payload.fechaLocal, etapa: "creada", timezone: timeZone, programadaEn: created });
    return { commandId: input.commandId, ...publicAgenda(programacionId, { ...data, creadaEn: created, actualizadaEn: created }), cliente: { id: resolution.cliente.id, nombre: resolution.cliente.nombre } };
  });
}

export async function ejecutarResolverProgramacionPedidoBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const { command, payload } = normalizeDecision(raw);
  return executeConContexto(db, contexto, command, "resolverProgramacionPedidoBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    const { timeZone } = await configAgenda(tx, firestore, contexto, true);
    const ref = refs(firestore, empresaId, payload.programacionId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.programacionId !== payload.programacionId) fail("not-found", "AGENDA_NO_ENCONTRADA");
    const data = snap.data() as Record<string, any>;
    if (data.revision !== payload.revision || data.estado !== "PENDIENTE_REVISION") fail("failed-precondition", "AGENDA_NO_RESOLUBLE");
    if (payload.decision === "rechazar") {
      tx.update(ref, { estado: "CANCELADA", revision: data.revision + 1, rechazo: { actorUid, creadoEn: FieldValue.serverTimestamp() }, actualizadaEn: FieldValue.serverTimestamp() });
      return { commandId: input.commandId, programacionId: payload.programacionId, estado: "CANCELADA" };
    }
    const clientSnap = await tx.get(firestore.collection("clientes").doc(String(data.clienteId ?? "")));
    if (!clientSnap.exists || clientSnap.data()?.empresaId !== empresaId || clientSnap.data()?.activo !== true) {
      fail("failed-precondition", "AGENDA_CLIENTE_NO_DISPONIBLE");
    }
    const fecha = String(data.fechaLocal ?? "");
    const expiracion = Timestamp.fromMillis(localInstantMillis(nextLocalDay(fecha), "00:00", data.zonaHoraria ?? timeZone));
    if (expiracion.toMillis() <= now()) fail("failed-precondition", "AGENDA_RESERVA_EXPIRADA");
    const byProduct = new Map<string, { quantity: number; name: string; unit: string }>();
    const presentationById = new Map<string, Record<string, any>>();
    for (const line of data.lineas ?? []) {
      let presentation = presentationById.get(line.presentacionId);
      if (!presentation) {
        const presentationSnap = await tx.get(firestore.collection("presentaciones_producto").doc(line.presentacionId));
        presentation = presentationSnap.data() as Record<string, any> | undefined;
        if (!presentationSnap.exists || presentation?.empresaId !== empresaId || presentation?.productoId !== line.productoId
          || presentation?.activo !== true || presentation?.factorUnidadBase !== line.factorUnidadBase
          || line.cantidadUnidadBase !== line.cantidad * line.factorUnidadBase) fail("failed-precondition", "AGENDA_PRESENTACION_NO_DISPONIBLE");
        presentationById.set(line.presentacionId, presentation as Record<string, any>);
      }
      const prior = byProduct.get(line.productoId);
      const quantity = (prior?.quantity ?? 0) + line.cantidadUnidadBase;
      if (!Number.isSafeInteger(quantity) || quantity <= 0) fail("failed-precondition", "AGENDA_CANTIDAD_INVALIDA");
      byProduct.set(line.productoId, { quantity, name: line.productoNombre, unit: line.unidadBase });
    }
    const holds: Array<{ ref: any; productRef: any; productData: Record<string, any>; productId: string; quantity: number; name: string; unit: string }> = [];
    for (const [productoId, hold] of byProduct) {
      const productRef = firestore.collection("productos").doc(productoId);
      const productSnap = await tx.get(productRef);
      const product = productSnap.data() as Record<string, any> | undefined;
      if (!productSnap.exists || product?.empresaId !== empresaId || product?.activo !== true) fail("failed-precondition", "AGENDA_PRODUCTO_NO_DISPONIBLE");
      const productData = product as Record<string, any>;
      const stock = productData.stock;
      const reservado = productData.stockReservado ?? 0;
      if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(reservado) || reservado < 0 || reservado > stock) fail("failed-precondition", "AGENDA_STOCK_INVALIDO");
      if (stock - reservado < hold.quantity) fail("failed-precondition", "AGENDA_STOCK_INSUFICIENTE");
      const reservationId = crearIdentificadorInterno(empresaId, `agenda-hold:${payload.programacionId}:${productoId}`);
      holds.push({ ref: firestore.collection("empresas").doc(empresaId).collection(RESERVAS).doc(reservationId), productRef, productData, productId: productoId, quantity: hold.quantity, name: hold.name, unit: hold.unit });
    }
    for (const hold of holds) {
      tx.create(hold.ref, {
        reservaId: hold.ref.id, empresaId, programacionId: payload.programacionId, productoId: hold.productId,
        productoNombreSnapshot: hold.name, unidadBaseSnapshot: hold.unit, cantidadUnidadBase: hold.quantity,
        estado: "ACTIVA", expiraEn: expiracion, creadaPor: actorUid,
        creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
      });
      tx.update(hold.productRef, { stockReservado: (hold.productData.stockReservado ?? 0) + hold.quantity });
    }
    const stockReservadoUnidadBase = holds.reduce((sum, hold) => sum + hold.quantity, 0);
    const reservaIds = holds.map(hold => hold.ref.id);
    tx.update(ref, {
      estado: "RESERVADA", revision: data.revision + 1, stockReservadoUnidadBase,
      reservaIds, reservaExpiraEn: expiracion, aprobacion: { actorUid, revision: data.revision + 1 }, actualizadaEn: FieldValue.serverTimestamp(),
    });
    const nowMillis = now();
    const agendaTimeZone = data.zonaHoraria ?? timeZone;
    writeAgendaEvent(tx, firestore, { empresaId, actorUid, rol, commandId: input.commandId, causationId: input.causationId ?? null, programacionId: payload.programacionId, fechaLocal: fecha, etapa: "reservada", timezone: agendaTimeZone, programadaEn: Timestamp.fromMillis(nowMillis) });
    const horaEntrega = data.franja?.desde ?? "08:00";
    const fechaEntregaMillis = localInstantMillis(fecha, horaEntrega, agendaTimeZone);
    const fechaAnterior = new Date(Date.parse(`${fecha}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
    const fechaAnteriorMillis = localInstantMillis(fechaAnterior, "08:00", agendaTimeZone);
    if (fecha > localDate(new Date(nowMillis), agendaTimeZone)) {
      writeAgendaEvent(tx, firestore, { empresaId, actorUid, rol, commandId: input.commandId, causationId: input.causationId ?? null, programacionId: payload.programacionId, fechaLocal: fecha, etapa: "dia_anterior", timezone: agendaTimeZone, programadaEn: Timestamp.fromMillis(Math.max(fechaAnteriorMillis, nowMillis)) });
    }
    writeAgendaEvent(tx, firestore, { empresaId, actorUid, rol, commandId: input.commandId, causationId: input.causationId ?? null, programacionId: payload.programacionId, fechaLocal: fecha, etapa: "fecha_programada", timezone: agendaTimeZone, programadaEn: Timestamp.fromMillis(Math.max(fechaEntregaMillis, nowMillis)) });
    return { commandId: input.commandId, programacionId: payload.programacionId, estado: "RESERVADA", stockReservadoUnidadBase, reservaExpiraEn: expiracion };
  });
}

export async function ejecutarCancelarProgramacionPedidoBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const { command, payload } = normalizeCancel(raw);
  return executeConContexto(db, contexto, command, "cancelarProgramacionPedidoBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    const admin = rol === "admin";
    const { timeZone } = await configAgenda(tx, firestore, contexto, admin);
    const ref = refs(firestore, empresaId, payload.programacionId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.programacionId !== payload.programacionId) fail("not-found", "AGENDA_NO_ENCONTRADA");
    const data = snap.data() as Record<string, any>;
    if ((!admin && data.solicitanteUid !== actorUid) || data.revision !== payload.revision) fail("permission-denied", "AGENDA_CANCELACION_NO_AUTORIZADA");
    if ((!admin && data.estado !== "PENDIENTE_REVISION") || (admin && !["PENDIENTE_REVISION", "RESERVADA", "CONVERTIDA_A_SOLICITUD"].includes(data.estado))) fail("failed-precondition", "AGENDA_NO_CANCELABLE");
    if (data.estado === "PENDIENTE_REVISION") {
      tx.update(ref, { estado: "CANCELADA", revision: data.revision + 1, cancelacion: { actorUid }, actualizadaEn: FieldValue.serverTimestamp() });
      return { commandId: input.commandId, programacionId: payload.programacionId, estado: "CANCELADA" };
    }
    const lineas: Array<{ productoId: string; cantidadUnidadBase: number }> = data.lineas ?? [];
    const byProduct = new Map<string, number>();
    for (const line of lineas) byProduct.set(line.productoId, (byProduct.get(line.productoId) ?? 0) + line.cantidadUnidadBase);
    const holds: Array<{ holdRef: any; productRef: any; productData: Record<string, any>; quantity: number; holdData: Record<string, any> }> = [];
    for (const [productoId, quantity] of byProduct) {
      const reservationId = crearIdentificadorInterno(empresaId, `agenda-hold:${payload.programacionId}:${productoId}`);
      const holdRef = firestore.collection("empresas").doc(empresaId).collection(RESERVAS).doc(reservationId);
      const productRef = firestore.collection("productos").doc(productoId);
      const [holdSnap, productSnap] = await Promise.all([tx.get(holdRef), tx.get(productRef)]);
      const holdData = holdSnap.data() as Record<string, any> | undefined;
      const productData = productSnap.data() as Record<string, any> | undefined;
      if (!holdSnap.exists || holdData?.empresaId !== empresaId || holdData?.programacionId !== payload.programacionId || !productSnap.exists || productData?.empresaId !== empresaId) fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
      holds.push({ holdRef, productRef, productData: productData as Record<string, any>, quantity, holdData: holdData as Record<string, any> });
    }
    let saleRequestRef: any = null;
    let saleRequestData: Record<string, any> | undefined;
    if (data.solicitudId) {
      saleRequestRef = firestore.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega").doc(data.solicitudId);
      const saleRequest = await tx.get(saleRequestRef);
      saleRequestData = saleRequest.data() as Record<string, any> | undefined;
    }
    for (const hold of holds) {
      if (hold.holdData.estado === "ACTIVA") {
        const stockReserved = hold.productData.stockReservado ?? 0;
        if (!Number.isSafeInteger(stockReserved) || stockReserved < hold.quantity) fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
        tx.update(hold.productRef, { stockReservado: stockReserved - hold.quantity });
        tx.update(hold.holdRef, { estado: "LIBERADA", actualizadaEn: FieldValue.serverTimestamp(), liberadaPor: actorUid });
      }
    }
    if (saleRequestRef && saleRequestData) {
      if (saleRequestData.empresaId === empresaId && ["PENDIENTE_APROBACION", "APROBADA"].includes(saleRequestData.estado)) {
        tx.update(saleRequestRef, { estado: "CANCELADA", motivoCancelacion: "AGENDA_CANCELADA", actualizadaEn: FieldValue.serverTimestamp() });
      }
    }
    tx.update(ref, { estado: "CANCELADA", revision: data.revision + 1, cancelacion: { actorUid }, actualizadaEn: FieldValue.serverTimestamp() });
    return { commandId: input.commandId, programacionId: payload.programacionId, estado: "CANCELADA" };
  });
}

export async function ejecutarConsultarAgendaPedidosBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown = {}) {
  if (!object(raw) || Object.keys(raw).length !== 0) fail("invalid-argument", "AGENDA_PAYLOAD_INVALIDO");
  return db.runTransaction(async (tx: any) => {
    const admin = contexto.rol === "admin";
    await configAgenda(tx, db, contexto, admin);
    if (!admin && contexto.rol !== "vendedor") fail("permission-denied", "AGENDA_ROL_NO_AUTORIZADO");
    const collection = db.collection("empresas").doc(contexto.empresaId).collection(AGENDA);
    const query = admin ? collection.limit(100) : collection.where("solicitanteUid", "==", contexto.actorUid).limit(100);
    const result = await tx.get(query);
    const entries = result.docs.filter((item: any) => item.data()?.empresaId === contexto.empresaId
      && (admin || item.data()?.solicitanteUid === contexto.actorUid));
    const clientIds = [...new Set<string>(entries.map((item: any) => item.data()?.clienteId).filter((id: unknown): id is string => typeof id === "string"))];
    const clients = new Map<string, { id: string; nombre: string; direccion: string | null }>();
    for (const clientId of clientIds) {
      const snap = await tx.get(db.collection("clientes").doc(clientId));
      if (snap.exists && snap.data()?.empresaId === contexto.empresaId) clients.set(clientId, {
        id: snap.id,
        nombre: text(snap.data()?.nombre) ? snap.data().nombre.trim() : "",
        direccion: text(snap.data()?.direccion) ? snap.data().direccion.trim() : null,
      });
    }
    return { programaciones: entries.map((item: any) => publicAgenda(item.id, { ...item.data(), cliente: clients.get(item.data()?.clienteId) ?? { id: item.data()?.clienteId, nombre: "Cliente no disponible", direccion: null } })) };
  });
}

export async function ejecutarConvertirProgramacionPedidoBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const { command, payload } = normalizeConvert(raw);
  return executeConContexto(db, contexto, command, "convertirProgramacionPedidoBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    if (rol !== "vendedor") fail("permission-denied", "AGENDA_VENDEDOR_REQUERIDO");
    const { timeZone } = await configAgenda(tx, firestore, contexto);
    const ref = refs(firestore, empresaId, payload.programacionId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.solicitanteUid !== actorUid) fail("not-found", "AGENDA_NO_ENCONTRADA");
    const data = snap.data() as Record<string, any>;
    if (data.estado === "CONVERTIDA_A_SOLICITUD" && text(data.solicitudId)) return { commandId: input.commandId, programacionId: payload.programacionId, solicitudId: data.solicitudId, estado: data.estado };
    if (data.estado !== "RESERVADA" || data.fechaLocal !== localDate(new Date(now()), data.zonaHoraria ?? timeZone)) fail("failed-precondition", "AGENDA_NO_CONVERTIBLE");
    const lineas = normalizeLines((data.lineas ?? []).map((line: any) => ({ productoId: line.productoId, presentacionId: line.presentacionId, cantidad: line.cantidad })));
    const resolution = await resolverVentaBodegaEnTransaccion(tx, firestore, contexto, saleCommand(command, { clienteId: data.clienteId, lineas }));
    const requestId = crearIdentificadorInterno(empresaId, `solicitud-venta-bodega:${input.commandId}`);
    const requestRef = firestore.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega").doc(requestId);
    const saleLines = resolution.lineas.map(line => ({
      productoId: line.productoId, productoNombre: line.productoNombreSnapshot, unidadBase: line.unidadBaseSnapshot,
      presentacionId: line.presentacionId, presentacionNombre: line.presentacionNombreSnapshot,
      cantidad: line.cantidadPresentaciones, factorUnidadBase: line.factorUnidadBase,
      cantidadUnidadBase: line.cantidadUnidadBase, precioPresentacionCOP: line.precioPresentacionCOP, subtotalCOP: line.subtotalCOP,
    }));
    const totalCOP = saleLines.reduce((sum, line) => sum + line.subtotalCOP, 0);
    if (!Number.isSafeInteger(totalCOP) || totalCOP <= 0) fail("failed-precondition", "TOTAL_BODEGA_INVALIDO");
    const huellaComercial = crearHuellaSemantica({ clienteId: resolution.cliente.id, lineas: saleLines, totalCOP });
    tx.create(requestRef, {
      solicitudId: requestId, empresaId, solicitanteUid: actorUid, clienteId: resolution.cliente.id,
      intentoLineas: lineas, lineas: saleLines, totalCOP, huellaComercial,
      estado: "PENDIENTE_APROBACION", revision: 1, programacionId: payload.programacionId,
      reservaIds: data.reservaIds ?? [],
      creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
    });
    tx.update(ref, { estado: "CONVERTIDA_A_SOLICITUD", revision: data.revision + 1, solicitudId: requestId, convertidaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    return { commandId: input.commandId, programacionId: payload.programacionId, solicitudId: requestId, estado: "CONVERTIDA_A_SOLICITUD" };
  });
}
