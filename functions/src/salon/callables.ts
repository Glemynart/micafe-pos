import { randomUUID } from "node:crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../finanzas/callables";

const REGION = "us-central1";
const PEDIDOS = "pedidos_activos";
const COMANDAS = "comandas_cocina";
const MESAS = "mesas";
const ESPACIOS = "espacios";

type EstadoPedido = "abierto" | "pagado" | "cancelado" | "unificado";
type EstadoComanda = "pendiente" | "en_preparacion" | "listo" | "entregado";
type TipoComanda = "nuevo" | "adicion" | "cancelacion";

type SalonEffect = (
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  rol: string,
  input: Envelope,
) => Promise<Record<string, unknown>>;

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operación de salón.", { code: dominio });
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const integer = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;

function payload(input: Envelope): Record<string, unknown> {
  if (!object(input.payload)) fail("invalid-argument", "PAYLOAD_INVALID");
  return input.payload;
}

function requiredId(value: unknown, code = "ID_INVALIDO"): string {
  if (!text(value)) fail("invalid-argument", code);
  const result = value as string;
  if (result.trim().length > 160) fail("invalid-argument", code);
  return result.trim();
}

function optionalId(value: unknown, code = "ID_INVALIDO"): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredId(value, code);
}

function rejectAuthorityFields(data: Record<string, unknown>, fields: string[]) {
  if (fields.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
}

function itemSnapshot(value: unknown): Record<string, unknown> {
  if (!object(value)) fail("invalid-argument", "ITEM_INVALIDO");
  const record = value as Record<string, unknown>;
  if (!text(record.id) || !text(record.name) || !integer(record.quantity, 1)) {
    fail("invalid-argument", "ITEM_INVALIDO");
  }
  const item: Record<string, unknown> = { ...record };
  delete item.cantidadEnviada;
  delete item.enviadoCocina;
  return {
    ...item,
    uid: text(item.uid) ? item.uid : randomUUID(),
    quantity: record.quantity as number,
  };
}

function itemSnapshots(value: unknown, allowEmpty = false): Record<string, unknown>[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail("invalid-argument", "ITEMS_INVALIDOS");
  }
  return (value as unknown[]).map(itemSnapshot);
}

function isEquivalentLine(existing: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return existing.schemaVersion === 1
    && next.schemaVersion === 1
    && typeof existing.configurationKey === "string"
    && existing.configurationKey === next.configurationKey
    && existing.id === next.id
    && existing.price === next.price
    && existing.cost === next.cost
    && existing.category === next.category
    && existing.impuestoTipo === next.impuestoTipo;
}

function itemUid(item: Record<string, unknown>): string {
  return text(item.uid) ? item.uid : requiredId(item.id, "ITEM_INVALIDO");
}

function itemsOf(data: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(data.items) || data.items.some((item) => !object(item))) fail("failed-precondition", "ITEMS_INVALIDOS");
  return data.items as Record<string, unknown>[];
}

function pedidoAbierto(data: Record<string, unknown> | undefined, empresaId: string): data is Record<string, unknown> & {
  empresaId: string;
  id: string;
  items: Record<string, unknown>[];
  comandaIds?: string[];
  mesaId: string | null;
  espacioId: string;
  estado: EstadoPedido;
  activo: boolean;
} {
  return !!data
    && data.empresaId === empresaId
    && data.estado === "abierto"
    && data.activo === true
    && Array.isArray(data.items)
    && text(data.espacioId)
    && (data.mesaId === null || text(data.mesaId));
}

async function leerPedido(tx: any, db: any, empresaId: string, pedidoId: string) {
  const ref = db.collection(PEDIDOS).doc(pedidoId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "PEDIDO_NO_ENCONTRADO");
  return { ref, snap, data: snap.data() as Record<string, unknown> };
}

async function leerComanda(tx: any, db: any, empresaId: string, comandaId: string) {
  const ref = db.collection(COMANDAS).doc(comandaId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "COMANDA_NO_ENCONTRADA");
  return { ref, snap, data: snap.data() as Record<string, unknown> };
}

async function validarEspacio(tx: any, db: any, empresaId: string, espacioId: string) {
  const snap = await tx.get(db.collection(ESPACIOS).doc(espacioId));
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("failed-precondition", "ESPACIO_INVALIDO");
}

async function validarMesa(tx: any, db: any, empresaId: string, mesaId: string, espacioId: string) {
  const ref = db.collection(MESAS).doc(mesaId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId || snap.data()?.espacioId !== espacioId || snap.data()?.activa !== true) {
    fail("failed-precondition", "MESA_INVALIDA");
  }
  return { ref, snap, data: snap.data() as Record<string, unknown> };
}

async function validarAutoridad(tx: any, db: any, contexto: ContextoFinancieroOperativo, capacidad: "sell" | "kitchen") {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, capacidad === "kitchen" ? ["kitchen", "sell"] : "sell");
}

async function executeSalon(
  db: any,
  contexto: ContextoFinancieroOperativo,
  data: unknown,
  tipo: string,
  capacidad: "sell" | "kitchen",
  effect: SalonEffect,
) {
  return executeConContexto(db, contexto, data, tipo, async (tx, transactionDb, empresaId, actorUid, rol, input) => {
    await validarAutoridad(tx, transactionDb, { empresaId, actorUid, rol }, capacidad);
    return effect(tx, transactionDb, empresaId, actorUid, rol, input);
  });
}

async function executeRequest(
  request: any,
  tipo: string,
  capacidad: "sell" | "kitchen",
  effect: SalonEffect,
) {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return executeSalon(db, { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol }, request.data, tipo, capacidad, effect);
}

async function efectoCrearCuenta(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "activo", "comandaIds", "actualizadoEn", "id"]);
  const espacioId = requiredId(data.espacioId, "ESPACIO_INVALIDO");
  const mesaId = optionalId(data.mesaId, "MESA_INVALIDA");
  const items = itemSnapshots(data.items, true);
  const nombreMostrador = data.nombreMesa === undefined ? "Mostrador / Para llevar" : requiredId(data.nombreMesa, "NOMBRE_MESA_INVALIDO");

  await validarEspacio(tx, db, empresaId, espacioId);
  let nombreMesa = nombreMostrador;
  if (mesaId) {
    const mesa = await validarMesa(tx, db, empresaId, mesaId, espacioId);
    if (!text(mesa.data.nombre)) fail("failed-precondition", "MESA_INVALIDA");
    nombreMesa = mesa.data.nombre as string;
  }

  const ref = db.collection(PEDIDOS).doc();
  tx.create(ref, {
    id: ref.id,
    empresaId,
    mesaId,
    nombreMesa,
    espacioId,
    cajeroId: actorUid,
    items,
    estado: "abierto" as const,
    activo: true,
    comandaIds: [],
    movimientos: [],
    ...(data.inicioAlquiler !== undefined ? { inicioAlquiler: data.inicioAlquiler } : {}),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return { commandId: input.commandId, pedidoId: ref.id, estado: "abierto" };
}

async function efectoAgregarLinea(
  tx: any,
  db: any,
  empresaId: string,
  _actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "estado", "activo", "comandaIds", "actualizadoEn"]);
  const pedidoId = requiredId(data.pedidoId, "PEDIDO_INVALIDO");
  const nueva = itemSnapshot(data.item);
  const pedido = await leerPedido(tx, db, empresaId, pedidoId);
  if (!pedidoAbierto(pedido.data, empresaId)) fail("failed-precondition", "PEDIDO_NO_ABIERTO");
  const pedidoItems = itemsOf(pedido.data);

  const existente = pedidoItems.findIndex((item) => isEquivalentLine(item, nueva)
    || (item.schemaVersion !== 1 && item.id === nueva.id));
  const items = existente === -1
    ? [nueva, ...pedidoItems]
    : pedidoItems.map((item, index) => index === existente
      ? { ...item, quantity: (item.quantity as number) + (nueva.quantity as number) }
      : item);
  tx.update(pedido.ref, { items, actualizadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, pedidoId, items: items.length };
}

async function efectoModificarLinea(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "estado", "activo", "comandaIds", "actualizadoEn"]);
  const pedidoId = requiredId(data.pedidoId, "PEDIDO_INVALIDO");
  const uid = requiredId(data.itemUid, "ITEM_INVALIDO");
  const nuevaCantidad = data.newQuantity;
  if (!integer(nuevaCantidad, 0)) fail("invalid-argument", "CANTIDAD_INVALIDA");
  const pedido = await leerPedido(tx, db, empresaId, pedidoId);
  if (!pedidoAbierto(pedido.data, empresaId)) fail("failed-precondition", "PEDIDO_NO_ABIERTO");
  const pedidoItems = itemsOf(pedido.data);
  const index = pedidoItems.findIndex((item) => itemUid(item) === uid);
  if (index === -1) fail("not-found", "ITEM_NO_ENCONTRADO");

  const item = pedidoItems[index];
  const enviada = integer(item.cantidadEnviada) ? item.cantidadEnviada as number : 0;
  const isRemoval = nuevaCantidad === 0;
  const deltaCancelar = isRemoval ? enviada : Math.max(0, enviada - (nuevaCantidad as number));
  let cancelacionRef: any = null;
  if (deltaCancelar > 0) {
    cancelacionRef = db.collection(COMANDAS).doc();
    tx.create(cancelacionRef, {
      id: cancelacionRef.id,
      empresaId,
      pedidoId,
      mesaId: pedido.data.mesaId ?? null,
      nombreMesa: pedido.data.nombreMesa,
      espacioId: pedido.data.espacioId,
      cajeroId: actorUid,
      items: [{
        uid,
        name: item.name,
        quantity: deltaCancelar,
        ...(item.modificadores !== undefined ? { modificadores: item.modificadores } : {}),
      }],
      estado: "pendiente" as const,
      tipo: "cancelacion" as const,
      creadoEn: FieldValue.serverTimestamp(),
    });
  }

  const items = isRemoval
    ? pedidoItems.filter((_item, itemIndex) => itemIndex !== index)
    : pedidoItems.map((existing, itemIndex) => itemIndex === index
      ? { ...existing, quantity: nuevaCantidad, cantidadEnviada: Math.min(enviada, nuevaCantidad as number) }
      : existing);
  const comandaIds = cancelacionRef
    ? [...(Array.isArray(pedido.data.comandaIds) ? pedido.data.comandaIds : []), cancelacionRef.id]
    : pedido.data.comandaIds;
  tx.update(pedido.ref, items.length === 0
    ? { items: [], estado: "cancelado" as const, activo: false, actualizadoEn: FieldValue.serverTimestamp(), ...(comandaIds ? { comandaIds } : {}) }
    : { items, actualizadoEn: FieldValue.serverTimestamp(), ...(comandaIds ? { comandaIds } : {}) });
  return { commandId: input.commandId, pedidoId, itemUid: uid, cancelacionComandaId: cancelacionRef?.id ?? null };
}

async function efectoFinalizarAlquiler(
  tx: any,
  db: any,
  empresaId: string,
  _actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "estado", "activo", "comandaIds", "actualizadoEn"]);
  const pedidoId = requiredId(data.pedidoId, "PEDIDO_INVALIDO");
  const item = itemSnapshot(data.item);
  const pedido = await leerPedido(tx, db, empresaId, pedidoId);
  if (!pedidoAbierto(pedido.data, empresaId)) fail("failed-precondition", "PEDIDO_NO_ABIERTO");
  if (!pedido.data.inicioAlquiler) return { commandId: input.commandId, pedidoId, aplicado: false };
  const uid = itemUid(item);
  const pedidoItems = itemsOf(pedido.data);
  const existe = pedidoItems.some((existing) => itemUid(existing) === uid);
  const items = existe ? pedidoItems : [...pedidoItems, item];
  tx.update(pedido.ref, { items, inicioAlquiler: null, actualizadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, pedidoId, aplicado: true };
}

async function efectoEnviarCocina(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId"]);
  const pedidoId = requiredId(data.pedidoId, "PEDIDO_INVALIDO");
  const pedido = await leerPedido(tx, db, empresaId, pedidoId);
  if (!pedidoAbierto(pedido.data, empresaId)) fail("failed-precondition", "PEDIDO_NO_ABIERTO");
  const pedidoItems = itemsOf(pedido.data);
  const itemsToSend: Record<string, unknown>[] = [];
  let anySent = false;
  const items = pedidoItems.map((item) => {
    const enviada = integer(item.cantidadEnviada) ? item.cantidadEnviada as number : 0;
    const difference = (item.quantity as number) - enviada;
    if (difference <= 0) return item;
    anySent = true;
    itemsToSend.push({ uid: itemUid(item), name: item.name, quantity: difference, ...(item.modificadores !== undefined ? { modificadores: item.modificadores } : {}) });
    return { ...item, cantidadEnviada: item.quantity };
  });
  if (!anySent) return { commandId: input.commandId, pedidoId, comandaId: null, aplicado: false };

  const comandaRef = db.collection(COMANDAS).doc();
  const wasAddition = pedidoItems.some((item) => (integer(item.cantidadEnviada) ? item.cantidadEnviada as number : 0) > 0);
  tx.create(comandaRef, {
    id: comandaRef.id,
    empresaId,
    pedidoId,
    mesaId: pedido.data.mesaId ?? null,
    nombreMesa: pedido.data.nombreMesa,
    espacioId: pedido.data.espacioId,
    cajeroId: actorUid,
    items: itemsToSend,
    estado: "pendiente" as const,
    tipo: wasAddition ? "adicion" as const : "nuevo" as const,
    creadoEn: FieldValue.serverTimestamp(),
  });
  tx.update(pedido.ref, { items, comandaIds: [...(Array.isArray(pedido.data.comandaIds) ? pedido.data.comandaIds : []), comandaRef.id], actualizadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, pedidoId, comandaId: comandaRef.id, aplicado: true };
}

function movement(type: string, relatedId: string | undefined, items: Record<string, unknown>[], actorUid: string, extra: Record<string, unknown> = {}) {
  return { tipo: type, ...(relatedId ? { pedidoRelacionadoId: relatedId } : {}), items, fecha: Timestamp.now(), cajeroId: actorUid, ...extra };
}

async function efectoSepararCuenta(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "nuevoPedidoId"]);
  const origenId = requiredId(data.pedidoOrigenId, "PEDIDO_INVALIDO");
  const rawItemsToMove = data.itemsToMove;
  if (!Array.isArray(rawItemsToMove) || rawItemsToMove.length === 0) fail("invalid-argument", "ITEMS_INVALIDOS");
  const moveMap = new Map<string, number>();
  for (const entry of rawItemsToMove as unknown[]) {
    if (!object(entry) || !text(entry.uid) || !integer(entry.cantidad, 1)) fail("invalid-argument", "ITEMS_INVALIDOS");
    const record = entry as Record<string, unknown>;
    const uid = record.uid as string;
    const cantidad = record.cantidad as number;
    if (moveMap.has(uid)) fail("invalid-argument", "ITEMS_INVALIDOS");
    moveMap.set(uid, cantidad);
  }
  const origen = await leerPedido(tx, db, empresaId, origenId);
  if (!pedidoAbierto(origen.data, empresaId)) fail("failed-precondition", "PEDIDO_NO_ABIERTO");
  if (!origen.data.mesaId) fail("failed-precondition", "PEDIDO_MOSTRADOR");

  const origenItems = itemsOf(origen.data);
  const itemsOrigen: Record<string, unknown>[] = [];
  const itemsNuevo: Record<string, unknown>[] = [];
  const itemsLog: Record<string, unknown>[] = [];
  const fullyMoved = new Set<string>();
  for (const item of origenItems) {
    const uid = itemUid(item);
    const cantidadMover = moveMap.get(uid);
    if (cantidadMover === undefined) { itemsOrigen.push(item); continue; }
    if (cantidadMover > (item.quantity as number)) fail("invalid-argument", "CANTIDAD_INVALIDA");
    const enviada = integer(item.cantidadEnviada) ? item.cantidadEnviada as number : 0;
    const noEnviada = (item.quantity as number) - enviada;
    const moverNoEnviada = Math.min(cantidadMover, noEnviada);
    const moverEnviada = cantidadMover - moverNoEnviada;
    const itemQuantity = item.quantity as number;
    if (cantidadMover === itemQuantity) fullyMoved.add(uid);
    if (cantidadMover < itemQuantity) itemsOrigen.push({ ...item, quantity: itemQuantity - cantidadMover, cantidadEnviada: enviada - moverEnviada });
    itemsNuevo.push({ ...item, uid: cantidadMover === itemQuantity ? uid : randomUUID(), quantity: cantidadMover, cantidadEnviada: moverEnviada });
    itemsLog.push({ uid, name: item.name, quantity: cantidadMover });
    moveMap.delete(uid);
  }
  if (moveMap.size > 0 || itemsOrigen.length === 0 || itemsNuevo.length === 0) fail("failed-precondition", "SEPARACION_INVALIDA");

  const comandaIds = Array.isArray(origen.data.comandaIds) ? origen.data.comandaIds : [];
  const movedComandas: string[] = [];
  for (const comandaId of comandaIds) {
    const comanda = await leerComanda(tx, db, empresaId, comandaId);
    const comandaItems = Array.isArray(comanda.data.items) ? comanda.data.items : [];
    if (comandaItems.length > 0 && comandaItems.every((item: Record<string, unknown>) => fullyMoved.has(requiredId(item.uid, "COMANDA_INVALIDA")))) movedComandas.push(comandaId);
  }
  const nuevoRef = db.collection(PEDIDOS).doc();
  const log = itemsLog;
  tx.update(origen.ref, {
    items: itemsOrigen,
    comandaIds: comandaIds.filter((id) => !movedComandas.includes(id)),
    movimientos: [...(Array.isArray(origen.data.movimientos) ? origen.data.movimientos : []), movement("separacion_origen", nuevoRef.id, log, actorUid)],
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  for (const comandaId of movedComandas) tx.update(db.collection(COMANDAS).doc(comandaId), { pedidoId: nuevoRef.id });
  tx.create(nuevoRef, {
    id: nuevoRef.id,
    empresaId,
    mesaId: origen.data.mesaId,
    nombreMesa: origen.data.nombreMesa,
    espacioId: origen.data.espacioId,
    cajeroId: actorUid,
    items: itemsNuevo,
    estado: "abierto" as const,
    activo: true,
    comandaIds: movedComandas,
    movimientos: [movement("separacion_destino", origenId, log, actorUid)],
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return { commandId: input.commandId, pedidoOrigenId: origenId, pedidoNuevoId: nuevoRef.id, comandaIds: movedComandas };
}

async function efectoUnirCuentas(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId"]);
  const destinoId = requiredId(data.pedidoDestinoId, "PEDIDO_INVALIDO");
  const rawOrigenIds = data.pedidosOrigenIds;
  if (!Array.isArray(rawOrigenIds) || rawOrigenIds.length === 0) fail("invalid-argument", "CUENTAS_ORIGEN_INVALIDAS");
  const origenIds = (rawOrigenIds as unknown[]).map((id) => requiredId(id, "PEDIDO_INVALIDO"));
  if (new Set(origenIds).size !== origenIds.length) fail("invalid-argument", "CUENTAS_ORIGEN_INVALIDAS");
  if (origenIds.includes(destinoId)) fail("invalid-argument", "CUENTA_CONSIGO_MISMA");
  const destino = await leerPedido(tx, db, empresaId, destinoId);
  if (!pedidoAbierto(destino.data, empresaId) || !destino.data.mesaId) fail("failed-precondition", "PEDIDO_DESTINO_INVALIDO");
  const origenes: Array<{ ref: any; data: Record<string, unknown>; id: string; comandaIds: string[] }> = [];
  const comandaRefs = new Map<string, any>();
  for (const origenId of origenIds) {
    const origen = await leerPedido(tx, db, empresaId, origenId);
    if (!pedidoAbierto(origen.data, empresaId) || origen.data.mesaId !== destino.data.mesaId) fail("failed-precondition", "CUENTAS_MESA_INVALIDAS");
    const comandaIds = Array.isArray(origen.data.comandaIds) ? origen.data.comandaIds : [];
    for (const comandaId of comandaIds) {
      const comanda = await leerComanda(tx, db, empresaId, comandaId);
      if (comanda.data.pedidoId !== origenId) fail("failed-precondition", "COMANDA_INVALIDA");
      comandaRefs.set(comandaId, comanda.ref);
    }
    origenes.push({ ref: origen.ref, data: origen.data, id: origenId, comandaIds });
  }
  let items = itemsOf(destino.data).map((item) => ({ ...item, uid: itemUid(item) }));
  let comandaIds = Array.isArray(destino.data.comandaIds) ? [...destino.data.comandaIds] : [];
  const movimientos = Array.isArray(destino.data.movimientos) ? [...destino.data.movimientos] : [];
  for (const origen of origenes) {
    const origenItems = itemsOf(origen.data);
    const itemsLog = origenItems.map((item) => ({ uid: itemUid(item), name: item.name, quantity: item.quantity }));
    items = [...items, ...origenItems.map((item) => ({ ...item, uid: itemUid(item) }))];
    comandaIds = [...comandaIds, ...origen.comandaIds.filter((id) => comandaRefs.has(id))];
    for (const comandaId of origen.comandaIds) tx.update(comandaRefs.get(comandaId), { pedidoId: destinoId });
    tx.update(origen.ref, {
      items: [], estado: "unificado" as const, activo: false, unionDestinoId: destinoId,
      movimientos: [...(Array.isArray(origen.data.movimientos) ? origen.data.movimientos : []), movement("union_origen", destinoId, itemsLog, actorUid)],
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    movimientos.push(movement("union_destino", origen.id, itemsLog, actorUid));
  }
  tx.update(destino.ref, { items, comandaIds, movimientos, actualizadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, pedidoDestinoId: destinoId, pedidosOrigenIds: origenIds };
}

async function efectoTrasladarCuenta(
  tx: any,
  db: any,
  empresaId: string,
  actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "cajeroId", "nombreMesaDestino"]);
  const pedidoId = requiredId(data.pedidoId, "PEDIDO_INVALIDO");
  const mesaDestinoId = requiredId(data.mesaDestinoId, "MESA_INVALIDA");
  const pedido = await leerPedido(tx, db, empresaId, pedidoId);
  if (!pedidoAbierto(pedido.data, empresaId) || !pedido.data.mesaId) fail("failed-precondition", "PEDIDO_TRASLADO_INVALIDO");
  if (pedido.data.mesaId === mesaDestinoId || pedido.data.inicioAlquiler != null) fail("failed-precondition", "PEDIDO_TRASLADO_INVALIDO");
  const mesa = await validarMesa(tx, db, empresaId, mesaDestinoId, pedido.data.espacioId as string);
  const comandaIds = Array.isArray(pedido.data.comandaIds) ? pedido.data.comandaIds : [];
  const comandas = [];
  for (const comandaId of comandaIds) comandas.push(await leerComanda(tx, db, empresaId, comandaId));
  const movimiento = movement("traslado", undefined, itemsOf(pedido.data).map((item) => ({ uid: itemUid(item), name: item.name, quantity: item.quantity })), actorUid, {
    mesaOrigenId: pedido.data.mesaId,
    mesaDestinoId,
    nombreMesaOrigen: pedido.data.nombreMesa,
    nombreMesaDestino: mesa.data.nombre,
  });
  tx.update(pedido.ref, { mesaId: mesaDestinoId, nombreMesa: mesa.data.nombre, movimientos: [...(Array.isArray(pedido.data.movimientos) ? pedido.data.movimientos : []), movimiento], actualizadoEn: FieldValue.serverTimestamp() });
  for (const comanda of comandas) tx.update(comanda.ref, { mesaId: mesaDestinoId, nombreMesa: mesa.data.nombre });
  return { commandId: input.commandId, pedidoId, mesaOrigenId: pedido.data.mesaId, mesaDestinoId };
}

async function efectoActualizarEstadoComanda(
  tx: any,
  db: any,
  empresaId: string,
  _actorUid: string,
  _rol: string,
  input: Envelope,
): Promise<Record<string, unknown>> {
  const data = payload(input);
  rejectAuthorityFields(data, ["empresaId", "pedidoId", "actorUid", "creadoEn", "completadoEn"]);
  const comandaId = requiredId(data.comandaId, "COMANDA_INVALIDA");
  const destino = data.nuevoEstado;
  if (!["pendiente", "en_preparacion", "listo", "entregado"].includes(destino as string)) fail("invalid-argument", "ESTADO_COMANDA_INVALIDO");
  const comanda = await leerComanda(tx, db, empresaId, comandaId);
  const origen = comanda.data.estado as EstadoComanda;
  const tipo = comanda.data.tipo as TipoComanda;
  const permitidas: Record<EstadoComanda, EstadoComanda[]> = {
    pendiente: tipo === "cancelacion" ? ["entregado"] : ["en_preparacion"],
    en_preparacion: ["listo"],
    listo: ["entregado"],
    entregado: [],
  };
  if (origen !== destino && !permitidas[origen].includes(destino as EstadoComanda)) fail("failed-precondition", "TRANSICION_COMANDA_INVALIDA");
  if (origen !== destino) {
    tx.update(comanda.ref, { estado: destino, ...(destino === "listo" || destino === "entregado" ? { completadoEn: FieldValue.serverTimestamp() } : {}) });
  }
  return { commandId: input.commandId, comandaId, estado: destino, aplicado: origen !== destino };
}

export async function ejecutarCrearCuentaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "crearCuentaSalonV1", "sell", efectoCrearCuenta);
}
export async function ejecutarAgregarLineaCuentaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "agregarLineaCuentaSalonV1", "sell", efectoAgregarLinea);
}
export async function ejecutarModificarLineaCuentaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "modificarLineaCuentaSalonV1", "sell", efectoModificarLinea);
}
export async function ejecutarFinalizarAlquilerSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "finalizarAlquilerSalonV1", "sell", efectoFinalizarAlquiler);
}
export async function ejecutarEnviarCuentaCocinaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "enviarCuentaCocinaV1", "sell", efectoEnviarCocina);
}
export async function ejecutarSepararCuentaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "separarCuentaSalonV1", "sell", efectoSepararCuenta);
}
export async function ejecutarUnirCuentasSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "unirCuentasSalonV1", "sell", efectoUnirCuentas);
}
export async function ejecutarTrasladarCuentaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "trasladarCuentaSalonV1", "sell", efectoTrasladarCuenta);
}
export async function ejecutarActualizarEstadoComandaSalonV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeSalon(db, contexto, data, "actualizarEstadoComandaSalonV1", "kitchen", efectoActualizarEstadoComanda);
}

export const crearCuentaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "crearCuentaSalonV1", "sell", efectoCrearCuenta));
export const agregarLineaCuentaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "agregarLineaCuentaSalonV1", "sell", efectoAgregarLinea));
export const modificarLineaCuentaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "modificarLineaCuentaSalonV1", "sell", efectoModificarLinea));
export const finalizarAlquilerSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "finalizarAlquilerSalonV1", "sell", efectoFinalizarAlquiler));
export const enviarCuentaCocinaV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "enviarCuentaCocinaV1", "sell", efectoEnviarCocina));
export const separarCuentaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "separarCuentaSalonV1", "sell", efectoSepararCuenta));
export const unirCuentasSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "unirCuentasSalonV1", "sell", efectoUnirCuentas));
export const trasladarCuentaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "trasladarCuentaSalonV1", "sell", efectoTrasladarCuenta));
export const actualizarEstadoComandaSalonV1 = onCall({ region: REGION }, async (request) => executeRequest(request, "actualizarEstadoComandaSalonV1", "kitchen", efectoActualizarEstadoComanda));
