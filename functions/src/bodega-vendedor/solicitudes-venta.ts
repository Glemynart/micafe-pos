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
import { normalizarComandoConfirmacionVentaBodega } from "./ventas-contract";
import { MAX_BODEGA_REFERENCE_ID_LENGTH } from "./identificadores";

const COLLECTION = "solicitudes_venta_bodega";
const EVENTOS = "eventos_operativos";
const TIPO_EVENTO_SOLICITUD_PENDIENTE = "SOLICITUD_VENTA_BODEGA_PENDIENTE";
const REGION_TTL_MS = 24 * 60 * 60 * 1000;
const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible procesar la solicitud de venta Bodega.", { code: domain });
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const boundedText = (value: unknown): value is string => text(value) && value.trim().length <= 160;

type Envelope = { commandId: string; idempotencyKey: string; correlationId: string; causationId: string | null; payload: Record<string, any> };

function normalizeEnvelope(raw: unknown, payloadKeys: readonly string[]): Envelope {
  if (!object(raw) || Object.keys(raw).some(key => !["commandId", "idempotencyKey", "correlationId", "causationId", "payload"].includes(key))
    || !boundedText(raw.commandId) || !boundedText(raw.idempotencyKey) || !boundedText(raw.correlationId)
    || (raw.causationId !== undefined && raw.causationId !== null && !boundedText(raw.causationId)) || !object(raw.payload)
    || Object.keys(raw.payload).some(key => !payloadKeys.includes(key))) {
    fail("invalid-argument", "SOLICITUD_VENTA_INVALIDA");
  }
  const data = raw as Record<string, any>;
  return {
    commandId: data.commandId.trim(), idempotencyKey: data.idempotencyKey.trim(),
    correlationId: data.correlationId.trim(), causationId: typeof data.causationId === "string" ? data.causationId.trim() : null,
    payload: data.payload,
  };
}

function normalizeCreate(raw: unknown): Envelope {
  const envelope = normalizeEnvelope(raw, ["clienteId", "lineas"]);
  const { clienteId, lineas } = envelope.payload;
  if (!text(clienteId) || clienteId.length > 160 || !Array.isArray(lineas) || lineas.length === 0 || lineas.length > 50) {
    fail("invalid-argument", "SOLICITUD_VENTA_INVALIDA");
  }
  for (const linea of lineas) {
    if (!object(linea) || Object.keys(linea).some(key => !["productoId", "presentacionId", "cantidad"].includes(key))
      || !text(linea.productoId) || linea.productoId.length > MAX_BODEGA_REFERENCE_ID_LENGTH || !text(linea.presentacionId)
      || linea.presentacionId.length > MAX_BODEGA_REFERENCE_ID_LENGTH || !Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) {
      fail("invalid-argument", "SOLICITUD_VENTA_INVALIDA");
    }
  }
  return { ...envelope, payload: { clienteId: clienteId.trim(), lineas: lineas.map((linea: any) => ({
    productoId: linea.productoId.trim(), presentacionId: linea.presentacionId.trim(), cantidad: linea.cantidad,
  })) } };
}

function normalizeResolve(raw: unknown): Envelope {
  const envelope = normalizeEnvelope(raw, ["solicitudId", "revision", "decision"]);
  const { solicitudId, revision, decision } = envelope.payload;
  if (!text(solicitudId) || solicitudId.length > 180 || !Number.isSafeInteger(revision) || revision <= 0
    || (decision !== "aprobar" && decision !== "rechazar")) fail("invalid-argument", "SOLICITUD_VENTA_INVALIDA");
  return { ...envelope, payload: { solicitudId: solicitudId.trim(), revision, decision } };
}

function normalizeCancel(raw: unknown): Envelope {
  const envelope = normalizeEnvelope(raw, ["solicitudId", "revision"]);
  const { solicitudId, revision } = envelope.payload;
  if (!text(solicitudId) || solicitudId.length > 180 || !Number.isSafeInteger(revision) || revision <= 0) {
    fail("invalid-argument", "SOLICITUD_VENTA_INVALIDA");
  }
  return { ...envelope, payload: { solicitudId: solicitudId.trim(), revision } };
}

function canonicalSaleCommand(command: Envelope, payload: { clienteId: string; lineas: Array<{ productoId: string; presentacionId: string; cantidad: number }> }) {
  return normalizarComandoConfirmacionVentaBodega({
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.causationId,
    payload: { ...payload, metodoPago: "transferencia" },
  });
}

export function proyectarComercialSolicitud(resolution: Awaited<ReturnType<typeof resolverVentaBodegaEnTransaccion>>) {
  const lineas = resolution.lineas.map(linea => ({
    productoId: linea.productoId,
    productoNombre: linea.productoNombreSnapshot,
    unidadBase: linea.unidadBaseSnapshot,
    presentacionId: linea.presentacionId,
    presentacionNombre: linea.presentacionNombreSnapshot,
    cantidad: linea.cantidadPresentaciones,
    factorUnidadBase: linea.factorUnidadBase,
    cantidadUnidadBase: linea.cantidadUnidadBase,
    precioPresentacionCOP: linea.precioPresentacionCOP,
    subtotalCOP: linea.subtotalCOP,
  }));
  const totalCOP = lineas.reduce((total, linea) => total + linea.subtotalCOP, 0);
  if (!Number.isSafeInteger(totalCOP) || totalCOP <= 0) fail("failed-precondition", "TOTAL_BODEGA_INVALIDO");
  const cliente = { id: resolution.cliente.id, nombre: resolution.cliente.nombre, cedula: resolution.cliente.cedula };
  const huellaComercial = crearHuellaSemantica({ clienteId: cliente.id, lineas, totalCOP });
  return { cliente, lineas, totalCOP, huellaComercial };
}

export function esCambioComercialNoVigente(error: unknown): boolean {
  const code = (error as { details?: { code?: unknown } })?.details?.code;
  return typeof code === "string" && [
    "CLIENTE_NO_ENCONTRADO", "CLIENTE_INACTIVO", "PRODUCTO_NO_ENCONTRADO", "PRODUCTO_INACTIVO",
    "PRODUCTO_INVENTARIABLE_INVALIDO", "PRESENTACION_NO_ENCONTRADA", "PRESENTACION_INACTIVA", "PRESENTACION_INVALIDA",
  ].includes(code);
}

function refSolicitud(db: any, empresaId: string, solicitudId: string) {
  return db.collection("empresas").doc(empresaId).collection(COLLECTION).doc(solicitudId);
}

export function idEventoSolicitudVentaBodegaPendiente(empresaId: string, solicitudId: string): string {
  return crearIdentificadorInterno(empresaId, `solicitud-venta-bodega-pendiente:${solicitudId}`);
}

async function requireAdminSell(tx: any, db: any, contexto: ContextoFinancieroOperativo) {
  if (contexto.rol !== "admin") fail("permission-denied", "SOLICITUD_ADMIN_REQUERIDO");
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "sell");
  const configSnap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const config = configSnap.data() as Record<string, any> | undefined;
  if (!configSnap.exists || config?.empresaId !== contexto.empresaId || config.vertical !== "BODEGA_MVP1"
    || !Array.isArray(config.modulos?.habilitados) || !config.modulos.habilitados.includes("sell")) {
    fail("permission-denied", "VENTA_BODEGA_NO_AUTORIZADA");
  }
}

function expiresAtMillis(value: any): number | null {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && Number.isSafeInteger(value.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6);
  return null;
}

function publicSolicitud(solicitudId: string, value: Record<string, any>, now: number, cliente?: { id: string; nombre: string }) {
  const expiredAt = expiresAtMillis(value.aprobacion?.expiraEn);
  const estado = value.estado === "APROBADA" && expiredAt !== null && expiredAt <= now ? "EXPIRADA" : value.estado;
  return {
    solicitudId,
    estado,
    revision: value.revision,
    clienteId: value.clienteId,
    cliente: cliente ?? null,
    lineas: value.lineas,
    totalCOP: value.totalCOP,
    solicitanteUid: value.solicitanteUid,
    creadaEn: value.creadaEn,
    actualizadaEn: value.actualizadaEn,
    aprobacion: value.aprobacion ? {
      actorUid: value.aprobacion.actorUid,
      revision: value.aprobacion.revision,
      expiraEn: value.aprobacion.expiraEn,
    } : null,
  };
}

async function resolveCurrentCommercial(tx: any, db: any, contexto: ContextoFinancieroOperativo, request: Record<string, any>) {
  // The stored request ID may be longer than the sale-command contract allows.
  // Revalidation is read-only, so use a deterministic compact synthetic ID.
  const revalidationId = `revalidar-${crearHuellaSemantica({ solicitudId: request.solicitudId }).slice(0, 32)}`;
  const command: Envelope = {
    commandId: revalidationId,
    idempotencyKey: revalidationId,
    correlationId: revalidationId,
    causationId: null,
    payload: { clienteId: request.clienteId, lineas: request.intentoLineas },
  };
  return proyectarComercialSolicitud(await resolverVentaBodegaEnTransaccion(tx, db, contexto, canonicalSaleCommand(command, command.payload as any)));
}

function sellerContext(empresaId: string, actorUid: string): ContextoFinancieroOperativo {
  return { empresaId, actorUid, rol: "vendedor" };
}

export async function ejecutarCrearSolicitudVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const command = normalizeCreate(raw);
  return executeConContexto(db, contexto, command, "crearSolicitudVentaBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    if (rol !== "vendedor") fail("permission-denied", "ROLE_FORBIDDEN");
    const resolved = await resolverVentaBodegaEnTransaccion(tx, firestore, contexto, canonicalSaleCommand(command, command.payload as any));
    const commercial = proyectarComercialSolicitud(resolved);
    const solicitudId = crearIdentificadorInterno(empresaId, `solicitud-venta-bodega:${input.commandId}`);
    const ref = refSolicitud(firestore, empresaId, solicitudId);
    const requestData = {
      solicitudId, empresaId, solicitanteUid: actorUid, clienteId: commercial.cliente.id,
      intentoLineas: command.payload.lineas,
      lineas: commercial.lineas, totalCOP: commercial.totalCOP,
      huellaComercial: commercial.huellaComercial, estado: "PENDIENTE_APROBACION", revision: 1,
      creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
    };
    tx.create(ref, requestData);
    const createdAt = Timestamp.fromMillis(now());
    const eventoId = idEventoSolicitudVentaBodegaPendiente(empresaId, solicitudId);
    tx.create(firestore.collection(EVENTOS).doc(eventoId), {
      schemaVersion: 1,
      eventoId,
      tipo: TIPO_EVENTO_SOLICITUD_PENDIENTE,
      empresaId,
      agregado: { tipo: "SOLICITUD_VENTA_BODEGA", id: solicitudId },
      actor: { uid: actorUid, rolEfectivo: rol },
      commandId: input.commandId,
      correlationId: input.correlationId,
      causationId: input.causationId,
      payloadOperativo: { solicitudId },
      fechaProgramada: createdAt,
      fechaDisponible: createdAt,
      estadoDespacho: "PENDIENTE",
      intentos: 0,
      ultimoErrorCodigo: null,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
      ultimoIntentoEn: null,
    });
    return { commandId: input.commandId, ...publicSolicitud(solicitudId, {
      ...requestData, creadaEn: createdAt, actualizadaEn: createdAt,
    }, createdAt.toMillis(), { id: commercial.cliente.id, nombre: commercial.cliente.nombre }) };
  });
}

export async function ejecutarResolverSolicitudVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const command = normalizeResolve(raw);
  return executeConContexto(db, contexto, command, "resolverSolicitudVentaBodegaV1", async (tx, firestore, empresaId, actorUid, _rol, input) => {
    await requireAdminSell(tx, firestore, contexto);
    const ref = refSolicitud(firestore, empresaId, command.payload.solicitudId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.solicitudId !== command.payload.solicitudId) fail("not-found", "SOLICITUD_NO_ENCONTRADA");
    const request = snap.data() as Record<string, any>;
    if (request.solicitanteUid === actorUid) fail("permission-denied", "AUTOAPROBACION_NO_PERMITIDA");
    if (request.revision !== command.payload.revision || request.estado !== "PENDIENTE_APROBACION") fail("failed-precondition", "SOLICITUD_NO_RESOLUBLE");
    if (command.payload.decision === "aprobar") {
      let current: ReturnType<typeof proyectarComercialSolicitud> | null;
      try { current = await resolveCurrentCommercial(tx, firestore, sellerContext(empresaId, request.solicitanteUid), request); }
      catch (error) { if (!esCambioComercialNoVigente(error)) throw error; current = null; }
      if (current === null || current.huellaComercial !== request.huellaComercial) {
        tx.update(ref, { estado: "INVALIDADA", motivoInvalidacion: "CATALOGO_CAMBIADO", actualizadaEn: FieldValue.serverTimestamp() });
        return { commandId: input.commandId, solicitudId: request.solicitudId, estado: "INVALIDADA" };
      }
      const expiraEn = Timestamp.fromMillis(now() + REGION_TTL_MS);
      const aprobacion = { actorUid, revision: request.revision, totalCOP: request.totalCOP, huellaComercial: request.huellaComercial, expiraEn };
      tx.update(ref, { estado: "APROBADA", aprobacion, actualizadaEn: FieldValue.serverTimestamp() });
      return { commandId: input.commandId, solicitudId: request.solicitudId, estado: "APROBADA", revision: request.revision, expiraEn };
    }
    tx.update(ref, { estado: "RECHAZADA", rechazo: { actorUid, revision: request.revision }, actualizadaEn: FieldValue.serverTimestamp() });
    return { commandId: input.commandId, solicitudId: request.solicitudId, estado: "RECHAZADA" };
  });
}

export async function ejecutarCancelarSolicitudVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown, now = () => Date.now()) {
  const command = normalizeCancel(raw);
  return executeConContexto(db, contexto, command, "cancelarSolicitudVentaBodegaV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    const ref = refSolicitud(firestore, empresaId, command.payload.solicitudId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.solicitanteUid !== actorUid) fail("not-found", "SOLICITUD_NO_ENCONTRADA");
    await revalidarAutoridadVentaBodegaEnTransaccion(tx, firestore, contexto);
    if (rol !== "vendedor") fail("permission-denied", "ROLE_FORBIDDEN");
    const request = snap.data() as Record<string, any>;
    if (request.revision !== command.payload.revision || !["PENDIENTE_APROBACION", "APROBADA"].includes(request.estado)
      || (request.estado === "APROBADA" && (expiresAtMillis(request.aprobacion?.expiraEn) ?? 0) <= now())) fail("failed-precondition", "SOLICITUD_NO_CANCELABLE");
    tx.update(ref, { estado: "CANCELADA", cancelacion: { actorUid, revision: request.revision }, actualizadaEn: FieldValue.serverTimestamp() });
    return { commandId: input.commandId, solicitudId: request.solicitudId, estado: "CANCELADA" };
  });
}

export async function ejecutarConsultarSolicitudesVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown = {}, now = () => Date.now()) {
  if (!object(raw) || Object.keys(raw).length !== 0) fail("invalid-argument", "PAYLOAD_INVALIDO");
  return db.runTransaction(async (tx: any) => {
    if (contexto.rol === "vendedor") await revalidarAutoridadVentaBodegaEnTransaccion(tx, db, contexto);
    else if (contexto.rol === "admin") await requireAdminSell(tx, db, contexto);
    else fail("permission-denied", "ROLE_FORBIDDEN");
    const collection = db.collection("empresas").doc(contexto.empresaId).collection(COLLECTION);
    const query = contexto.rol === "vendedor"
      ? collection.where("solicitanteUid", "==", contexto.actorUid).limit(100)
      : collection.where("estado", "in", ["PENDIENTE_APROBACION", "APROBADA"]).limit(100);
    const result = await tx.get(query);
    const scopedDocs = result.docs.filter((item: any) => item.data()?.empresaId === contexto.empresaId);
    const clientIds: string[] = [...new Set<string>(scopedDocs
      .map((item: any) => item.data()?.clienteId)
      .filter((id: unknown): id is string => typeof id === "string"))];
    const clients = new Map<string, { id: string; nombre: string }>();
    for (const clienteId of clientIds) {
      const clientSnap = await tx.get(db.collection("clientes").doc(clienteId));
      const clientData = clientSnap.data();
      if (clientSnap.exists && clientData?.empresaId === contexto.empresaId) {
        clients.set(clienteId, { id: clienteId, nombre: text(clientData.nombre) ? clientData.nombre.trim() : "" });
      }
    }
    const solicitudes = scopedDocs.map((item: any) => {
      const value = item.data() as Record<string, any>;
      const clienteId = typeof value.clienteId === "string" ? value.clienteId : "";
      return publicSolicitud(item.id, value, now(), clients.get(clienteId) ?? (clienteId ? { id: clienteId, nombre: "Cliente no disponible" } : undefined));
    }).filter((request: any) => contexto.rol !== "admin" || ["PENDIENTE_APROBACION", "APROBADA"].includes(request.estado));
    return { solicitudes };
  });
}
