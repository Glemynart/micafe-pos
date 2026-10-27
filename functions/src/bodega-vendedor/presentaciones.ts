import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { marcarSenalDisponibilidadBodega } from "./live-signals";
import { MAX_BODEGA_REFERENCE_ID_LENGTH } from "./identificadores";

const REGION = "us-central1";
const COLLECTION = "presentaciones_producto";
const fail = (code: HttpsError["code"], message: string): never => { throw new HttpsError(code, message); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const active = (value: unknown): value is boolean => typeof value === "boolean";

export type CanalPrecioBodega = "tienda" | "consumidor_final";

export interface PresentacionComercialCanonica {
  id: string;
  empresaId: string;
  productoId: string;
  catalogoId: "BODEGA" | "NEVERA";
  nombre: string;
  factorUnidadBase: number;
  /** Campo histórico que conserva la tarifa mayorista mientras existan lectores v1. */
  precioCOP: number;
  precioTiendaCOP: number;
  precioConsumidorFinalCOP: number | null;
  /** Exact COP cost of this package when configured; legacy uses product cost. */
  costoPresentacionCOP: number | null;
  activo: boolean;
}

/** Hechos de producto que U3-B necesita congelar desde la misma lectura
 * canónica que valida la presentación. No es un DTO público. */
export interface ResolucionComercialBodega extends PresentacionComercialCanonica {
  productoNombre: string;
  unidadBase: string;
  espacioId: string;
  costoUnidadBaseCOP: number;
  costoPresentacionCOP: number;
}

function requiredText(value: unknown, code: string, max = 120): string {
  if (!text(value)) fail("invalid-argument", code);
  const normalizado = (value as string).trim();
  if (normalizado.length > max) fail("invalid-argument", code);
  return normalizado;
}

function only(data: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(data).some((key) => !fields.includes(key))) fail("invalid-argument", "PAYLOAD_INVALIDO");
}

function emptyPayload(data: unknown) {
  if (data !== undefined && (!object(data) || Object.keys(data).length !== 0)) fail("invalid-argument", "PAYLOAD_INVALIDO");
}

export async function exigirAutoridadCatalogoBodega(tx: any, db: any, contexto: ContextoFinancieroOperativo) {
    await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "inventory");
    if (contexto.rol !== "admin") fail("permission-denied", "ROL_NO_AUTORIZADO");
    const configSnap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
    const configuracion = configSnap.data() as Record<string, any> | undefined;
    if (!configSnap.exists || configuracion?.empresaId !== contexto.empresaId || (configuracion.vertical ?? "GENERAL") !== "BODEGA_MVP1" || !Array.isArray(configuracion.modulos?.habilitados) || !configuracion.modulos.habilitados.includes("inventory")) {
      fail("permission-denied", "CATALOGO_BODEGA_NO_AUTORIZADO");
    }
}

function normalizarPrecios(data: Record<string, unknown>, requerido: boolean) {
  const precioHistorico = data.precioCOP;
  const precioTienda = data.precioTiendaCOP;
  if (requerido && precioHistorico === undefined && precioTienda === undefined) fail("invalid-argument", "PRECIO_TIENDA_COP_REQUERIDO");
  if (precioHistorico !== undefined && !positiveInteger(precioHistorico)) fail("invalid-argument", "PRECIO_COP_INVALIDO");
  if (precioTienda !== undefined && !positiveInteger(precioTienda)) fail("invalid-argument", "PRECIO_TIENDA_COP_INVALIDO");
  if (precioHistorico !== undefined && precioTienda !== undefined && precioHistorico !== precioTienda) fail("invalid-argument", "PRECIO_TIENDA_INCONSISTENTE");
  if (data.precioConsumidorFinalCOP !== undefined && data.precioConsumidorFinalCOP !== null && !positiveInteger(data.precioConsumidorFinalCOP)) {
    fail("invalid-argument", "PRECIO_CONSUMIDOR_FINAL_COP_INVALIDO");
  }
  const precioTiendaCanonico = (precioTienda ?? precioHistorico) as number | undefined;
  return {
    ...(precioTiendaCanonico === undefined ? {} : { precioTiendaCOP: precioTiendaCanonico, precioCOP: precioTiendaCanonico }),
    ...(data.precioConsumidorFinalCOP === undefined ? {} : { precioConsumidorFinalCOP: data.precioConsumidorFinalCOP === null ? null : data.precioConsumidorFinalCOP as number }),
  };
}

function normalizarCostoPresentacion(data: Record<string, unknown>, requerido: boolean) {
  const costo = data.costoPresentacionCOP;
  if (requerido && costo === undefined) return {};
  if (costo !== undefined && !positiveInteger(costo)) fail("invalid-argument", "COSTO_PRESENTACION_COP_INVALIDO");
  return costo === undefined ? {} : { costoPresentacionCOP: costo as number };
}

function normalizeCreate(raw: unknown) {
  if (!object(raw)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const data = raw as Record<string, unknown>;
  only(data, ["productoId", "nombre", "factorUnidadBase", "precioCOP", "precioTiendaCOP", "precioConsumidorFinalCOP", "costoPresentacionCOP", "activo"]);
  if (!positiveInteger(data.factorUnidadBase)) fail("invalid-argument", "FACTOR_UNIDAD_BASE_INVALIDO");
  if (data.activo !== undefined && !active(data.activo)) fail("invalid-argument", "ESTADO_PRESENTACION_INVALIDO");
  return {
    productoId: requiredText(data.productoId, "PRODUCTO_ID_INVALIDO", MAX_BODEGA_REFERENCE_ID_LENGTH),
    nombre: requiredText(data.nombre, "NOMBRE_PRESENTACION_INVALIDO"),
    factorUnidadBase: data.factorUnidadBase as number,
    ...normalizarPrecios(data, true),
    ...normalizarCostoPresentacion(data, false),
    activo: (data.activo ?? true) as boolean,
  };
}

function normalizeUpdate(raw: unknown) {
  if (!object(raw)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const data = raw as Record<string, unknown>;
  only(data, ["presentacionId", "nombre", "factorUnidadBase", "precioCOP", "precioTiendaCOP", "precioConsumidorFinalCOP", "costoPresentacionCOP", "activo"]);
  const presentacionId = requiredText(data.presentacionId, "PRESENTACION_ID_INVALIDO", MAX_BODEGA_REFERENCE_ID_LENGTH);
  const changes: Record<string, unknown> = {};
  if (data.nombre !== undefined) changes.nombre = requiredText(data.nombre, "NOMBRE_PRESENTACION_INVALIDO");
  if (data.factorUnidadBase !== undefined) {
    if (!positiveInteger(data.factorUnidadBase)) fail("invalid-argument", "FACTOR_UNIDAD_BASE_INVALIDO");
    changes.factorUnidadBase = data.factorUnidadBase;
  }
  Object.assign(changes, normalizarPrecios(data, false));
  Object.assign(changes, normalizarCostoPresentacion(data, false));
  if (data.activo !== undefined) {
    if (!active(data.activo)) fail("invalid-argument", "ESTADO_PRESENTACION_INVALIDO");
    changes.activo = data.activo;
  }
  if (Object.keys(changes).length === 0) fail("invalid-argument", "CAMBIO_PRESENTACION_REQUERIDO");
  return { presentacionId, changes };
}

/** Referencia de intención para U3: no admite precio, factor, impuestos ni empresaId del cliente. */
export function normalizarReferenciaPresentacionComercial(raw: unknown) {
  if (!object(raw)) fail("invalid-argument", "REFERENCIA_PRESENTACION_INVALIDA");
  const data = raw as Record<string, unknown>;
  only(data, ["productoId", "presentacionId"]);
  return {
    productoId: requiredText(data.productoId, "PRODUCTO_ID_INVALIDO", MAX_BODEGA_REFERENCE_ID_LENGTH),
    presentacionId: requiredText(data.presentacionId, "PRESENTACION_ID_INVALIDO", MAX_BODEGA_REFERENCE_ID_LENGTH),
  };
}

/** Resuelve el precio/factor persistidos dentro de la transacción futura de venta; nunca usa datos comerciales del cliente. */
async function resolverProductoComercialEnTransaccion(tx: any, db: any, empresaId: string, productoId: string): Promise<Record<string, unknown>> {
  const productoSnap = await tx.get(db.collection("productos").doc(productoId));
  if (!productoSnap.exists || productoSnap.data()?.empresaId !== empresaId) fail("not-found", "PRODUCTO_NO_ENCONTRADO");
  const producto = productoSnap.data() as Record<string, unknown>;
  if (producto.activo !== true) fail("failed-precondition", "PRODUCTO_INACTIVO");
  return producto;
}

function effectiveCatalogId(value: unknown): "BODEGA" | "NEVERA" {
  if (value === undefined || value === null) return "BODEGA";
  if (value === "BODEGA" || value === "NEVERA") return value;
  return fail("failed-precondition", "CATALOGO_INVALIDO");
}

async function resolverPresentacionDesdeProductoEnTransaccion(tx: any, db: any, empresaId: string, referencia: ReturnType<typeof normalizarReferenciaPresentacionComercial>, producto: Record<string, unknown>): Promise<PresentacionComercialCanonica> {
  const presentacionSnap = await tx.get(db.collection(COLLECTION).doc(referencia.presentacionId));
  if (!presentacionSnap.exists) fail("not-found", "PRESENTACION_NO_ENCONTRADA");
  const data = presentacionSnap.data() as Record<string, unknown>;
  if (data.empresaId !== empresaId || data.productoId !== referencia.productoId) fail("not-found", "PRESENTACION_NO_ENCONTRADA");
  if (data.activo !== true) fail("failed-precondition", "PRESENTACION_INACTIVA");
  const precioTiendaCOP = data.precioTiendaCOP ?? data.precioCOP;
  const costoPresentacionCOP = data.costoPresentacionCOP;
  const catalogoProducto = effectiveCatalogId(producto.catalogoId);
  const catalogoPresentacion = effectiveCatalogId(data.catalogoId);
  if (catalogoProducto !== catalogoPresentacion) fail("failed-precondition", "PRESENTACION_CATALOGO_INVALIDO");
  if (!text(data.nombre) || !positiveInteger(data.factorUnidadBase) || !positiveInteger(precioTiendaCOP)
    || (costoPresentacionCOP !== undefined && costoPresentacionCOP !== null && !positiveInteger(costoPresentacionCOP))) fail("failed-precondition", "PRESENTACION_INVALIDA");
  return {
    id: presentacionSnap.id,
    empresaId,
    productoId: referencia.productoId,
    catalogoId: catalogoProducto,
    nombre: (data.nombre as string).trim(),
    factorUnidadBase: data.factorUnidadBase as number,
    precioCOP: precioTiendaCOP as number,
    precioTiendaCOP: precioTiendaCOP as number,
    // Legacy Bodega retail values remain in their document for reconciliation,
    // but never enter the operational price resolution.
    precioConsumidorFinalCOP: null,
    costoPresentacionCOP: costoPresentacionCOP === undefined || costoPresentacionCOP === null ? null : costoPresentacionCOP as number,
    activo: true,
  };
}

export async function resolverPresentacionComercialEnTransaccion(tx: any, db: any, empresaId: string, referencia: ReturnType<typeof normalizarReferenciaPresentacionComercial>): Promise<PresentacionComercialCanonica> {
  const producto = await resolverProductoComercialEnTransaccion(tx, db, empresaId, referencia.productoId);
  return resolverPresentacionDesdeProductoEnTransaccion(tx, db, empresaId, referencia, producto);
}

export function resolverPrecioCanalBodega(presentacion: PresentacionComercialCanonica, canal: CanalPrecioBodega): number {
  if (presentacion.catalogoId !== "BODEGA") fail("failed-precondition", "PRESENTACION_FUERA_CATALOGO_BODEGA");
  if (canal === "tienda") return presentacion.precioTiendaCOP;
  return fail("failed-precondition", "PRECIO_CONSUMIDOR_FINAL_PERTENECE_A_NEVERA");
}

/**
 * Resolver interno para U3-B. Precio, factor, costo y metadatos inventariables
 * provienen solo de producto/presentación dentro de la transacción.
 */
export async function resolverComercialBodegaEnTransaccion(tx: any, db: any, empresaId: string, referencia: ReturnType<typeof normalizarReferenciaPresentacionComercial>, canal: CanalPrecioBodega = "tienda"): Promise<ResolucionComercialBodega> {
  const producto = await resolverProductoComercialEnTransaccion(tx, db, empresaId, referencia.productoId);
  const presentacion = await resolverPresentacionDesdeProductoEnTransaccion(tx, db, empresaId, referencia, producto);
  const unidadBase = text(producto.unidadMedida) ? producto.unidadMedida : producto.unidad;
  if (!text(producto.nombre) || !text(unidadBase) || !text(producto.espacioId)) fail("failed-precondition", "PRODUCTO_INVENTARIABLE_INVALIDO");
  if (typeof producto.costo !== "number" || !Number.isSafeInteger(producto.costo) || producto.costo < 0) fail("failed-precondition", "PRODUCTO_COSTO_INVALIDO");
  const costoPresentacionCOP = presentacion.costoPresentacionCOP ?? (producto.costo as number) * presentacion.factorUnidadBase;
  if (!Number.isSafeInteger(costoPresentacionCOP) || costoPresentacionCOP < 0) fail("failed-precondition", "COSTO_PRESENTACION_INVALIDO");
  return {
    ...presentacion,
    precioCOP: resolverPrecioCanalBodega(presentacion, canal),
    productoNombre: (producto.nombre as string).trim(),
    unidadBase: (unidadBase as string).trim(),
    espacioId: (producto.espacioId as string).trim(),
    costoUnidadBaseCOP: producto.costo as number,
    costoPresentacionCOP,
  };
}

async function crearPresentacion(tx: any, db: any, empresaId: string, actorUid: string, rol: string, contexto: ContextoFinancieroOperativo, input: Envelope) {
  await exigirAutoridadCatalogoBodega(tx, db, contexto);
  const entrada = normalizeCreate(input.payload);
  const productoSnap = await tx.get(db.collection("productos").doc(entrada.productoId));
  if (!productoSnap.exists || productoSnap.data()?.empresaId !== empresaId) fail("not-found", "PRODUCTO_NO_ENCONTRADO");
  if (productoSnap.data()?.activo !== true) fail("failed-precondition", "PRODUCTO_INACTIVO");
  const catalogoId = effectiveCatalogId(productoSnap.data()?.catalogoId);
  if (catalogoId === "NEVERA" && entrada.costoPresentacionCOP !== undefined) {
    fail("failed-precondition", "NEVERA_COSTO_DEBE_SER_UNIDAD_BASE");
  }
  if (catalogoId === "NEVERA" && entrada.precioConsumidorFinalCOP !== undefined && entrada.precioConsumidorFinalCOP !== null) {
    fail("failed-precondition", "NEVERA_UN_PRECIO_POR_CATALOGO");
  }
  if (catalogoId === "BODEGA" && entrada.precioConsumidorFinalCOP !== undefined && entrada.precioConsumidorFinalCOP !== null) {
    fail("failed-precondition", "PRECIO_CONSUMIDOR_FINAL_PERTENECE_A_NEVERA");
  }
  const id = crearIdentificadorInterno(empresaId, `presentacion:${entrada.productoId}:${input.commandId}`);
  const ref = db.collection(COLLECTION).doc(id);
  if ((await tx.get(ref)).exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  tx.create(ref, {
    id,
    empresaId,
    productoId: entrada.productoId,
    catalogoId,
    nombre: entrada.nombre,
    factorUnidadBase: entrada.factorUnidadBase,
    precioCOP: entrada.precioCOP,
    precioTiendaCOP: entrada.precioTiendaCOP,
    precioConsumidorFinalCOP: entrada.precioConsumidorFinalCOP ?? null,
    ...(entrada.costoPresentacionCOP === undefined ? {} : { costoPresentacionCOP: entrada.costoPresentacionCOP }),
    activo: entrada.activo,
    creadoPor: actorUid,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  if (catalogoId === "BODEGA") marcarSenalDisponibilidadBodega(tx, db, empresaId);
  return { commandId: input.commandId, presentacionId: id };
}

async function actualizarPresentacion(tx: any, db: any, empresaId: string, actorUid: string, rol: string, contexto: ContextoFinancieroOperativo, input: Envelope) {
  await exigirAutoridadCatalogoBodega(tx, db, contexto);
  const entrada = normalizeUpdate(input.payload);
  const ref = db.collection(COLLECTION).doc(entrada.presentacionId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "PRESENTACION_NO_ENCONTRADA");
  const productoId = snap.data()?.productoId;
  if (!text(productoId)) fail("failed-precondition", "PRESENTACION_INVALIDA");
  const productoSnap = await tx.get(db.collection("productos").doc(productoId));
  if (!productoSnap.exists || productoSnap.data()?.empresaId !== empresaId) fail("failed-precondition", "PRESENTACION_PRODUCTO_INVALIDO");
  const producto = productoSnap.data() as Record<string, unknown>;
  const catalogoId = effectiveCatalogId(producto.catalogoId);
  if (effectiveCatalogId(snap.data()?.catalogoId) !== catalogoId) fail("failed-precondition", "PRESENTACION_CATALOGO_INVALIDO");
  if (catalogoId === "NEVERA" && entrada.changes.costoPresentacionCOP !== undefined) {
    fail("failed-precondition", "NEVERA_COSTO_DEBE_SER_UNIDAD_BASE");
  }
  if (catalogoId === "NEVERA" && entrada.changes.precioConsumidorFinalCOP !== undefined && entrada.changes.precioConsumidorFinalCOP !== null) {
    fail("failed-precondition", "NEVERA_UN_PRECIO_POR_CATALOGO");
  }
  if (catalogoId === "BODEGA" && entrada.changes.precioConsumidorFinalCOP !== undefined) {
    const precioLegadoActual = snap.data()?.precioConsumidorFinalCOP ?? null;
    if (entrada.changes.precioConsumidorFinalCOP !== precioLegadoActual) {
      fail("failed-precondition", "PRECIO_CONSUMIDOR_FINAL_LEGADO_PROTEGIDO");
    }
    delete entrada.changes.precioConsumidorFinalCOP;
  }
  const stock = producto.stock ?? 0;
  const stockReservado = producto.stockReservado ?? 0;
  if (!Number.isSafeInteger(stock) || (stock as number) < 0 || !Number.isSafeInteger(stockReservado)
    || (stockReservado as number) < 0 || (stockReservado as number) > (stock as number)) fail("failed-precondition", "STOCK_RESERVADO_INVALIDO");
  if ((stockReservado as number) > 0
    && (entrada.changes.activo === false || (entrada.changes.factorUnidadBase !== undefined
      && entrada.changes.factorUnidadBase !== snap.data()?.factorUnidadBase))) {
    fail("failed-precondition", "PRESENTACION_CON_STOCK_RESERVADO");
  }
  tx.update(ref, { ...entrada.changes, actualizadoPor: actorUid, actualizadoEn: FieldValue.serverTimestamp() });
  if (catalogoId === "BODEGA") marcarSenalDisponibilidadBodega(tx, db, empresaId);
  return { commandId: input.commandId, presentacionId: entrada.presentacionId };
}

export async function ejecutarCrearPresentacionComercialV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "crearPresentacionComercialV1", (tx, firestore, empresaId, actorUid, rol, input) => crearPresentacion(tx, firestore, empresaId, actorUid, rol, contexto, input));
}

export async function ejecutarActualizarPresentacionComercialV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "actualizarPresentacionComercialV1", (tx, firestore, empresaId, actorUid, rol, input) => actualizarPresentacion(tx, firestore, empresaId, actorUid, rol, contexto, input));
}

function exigirCatalogoVendedor(contexto: { rol: string; permisos: readonly string[]; vertical: string | undefined; inventoryHabilitado: boolean }) {
  if (contexto.rol !== "vendedor" || !contexto.permisos.includes("sell") || contexto.vertical !== "BODEGA_MVP1" || !contexto.inventoryHabilitado) {
    fail("permission-denied", "ROL_NO_AUTORIZADO");
  }
}

/** DTO comercial fijo para U3: no devuelve producto interno, costo, margen ni empresaId. */
export function proyectarCatalogoPresentacionesVendedor(producto: Record<string, unknown>, presentacion: PresentacionComercialCanonica) {
  const stockFisico = typeof producto.stock === "number" && Number.isSafeInteger(producto.stock) && producto.stock >= 0 ? producto.stock : null;
  const reservadoRaw = producto.stockReservado === undefined ? 0 : producto.stockReservado;
  const stockReservado = Number.isSafeInteger(reservadoRaw) && (reservadoRaw as number) >= 0 && stockFisico !== null && (reservadoRaw as number) <= stockFisico
    ? reservadoRaw as number
    : null;
  const disponible = stockFisico !== null && stockReservado !== null ? stockFisico - stockReservado : null;
  return {
    productoId: presentacion.productoId,
    productoNombre: text(producto.nombre) ? producto.nombre : "",
    categoriaId: text(producto.categoriaId) ? producto.categoriaId : null,
    unidadBase: text(producto.unidadMedida) ? producto.unidadMedida : text(producto.unidad) ? producto.unidad : null,
    presentacionId: presentacion.id,
    presentacionNombre: presentacion.nombre,
    factorUnidadBase: presentacion.factorUnidadBase,
    precioCOP: presentacion.precioCOP,
    precioTiendaCOP: presentacion.precioTiendaCOP,
    canal: "tienda" as const,
    disponibilidadUnidadBase: disponible,
    maximoPresentacionesVendibles: disponible === null ? null : Math.floor(disponible / presentacion.factorUnidadBase),
  };
}

export async function ejecutarConsultarCatalogoPresentacionesVendedor(db: any, contexto: { empresaId: string; rol: string; permisos: readonly string[]; vertical: string | undefined; inventoryHabilitado: boolean }, data: unknown) {
  exigirCatalogoVendedor(contexto);
  emptyPayload(data);
  const [productosSnap, presentacionesSnap] = await Promise.all([
    db.collection("productos").where("empresaId", "==", contexto.empresaId).where("activo", "==", true).get(),
    db.collection(COLLECTION).where("empresaId", "==", contexto.empresaId).where("activo", "==", true).get(),
  ]);
  const productos = new Map<string, Record<string, unknown>>(productosSnap.docs.map((snap: any) => [snap.id, snap.data() as Record<string, unknown>]));
  const catalogo = presentacionesSnap.docs.flatMap((snap: any) => {
    const data = snap.data() as Record<string, unknown>;
    const producto = typeof data.productoId === "string" ? productos.get(data.productoId) : undefined;
    const precioTiendaCOP = data.precioTiendaCOP ?? data.precioCOP;
    const costoPresentacionCOP = data.costoPresentacionCOP;
    if (!producto || effectiveCatalogId(producto.catalogoId) !== "BODEGA" || effectiveCatalogId(data.catalogoId) !== "BODEGA"
      || !positiveInteger(data.factorUnidadBase) || !positiveInteger(precioTiendaCOP)
      || (costoPresentacionCOP !== undefined && costoPresentacionCOP !== null && !positiveInteger(costoPresentacionCOP)) || !text(data.nombre)) return [];
    return [proyectarCatalogoPresentacionesVendedor(producto, { id: snap.id, empresaId: contexto.empresaId, productoId: data.productoId as string, catalogoId: "BODEGA", nombre: (data.nombre as string).trim(), factorUnidadBase: data.factorUnidadBase as number, precioCOP: precioTiendaCOP as number, precioTiendaCOP: precioTiendaCOP as number, precioConsumidorFinalCOP: null, costoPresentacionCOP: costoPresentacionCOP === undefined || costoPresentacionCOP === null ? null : costoPresentacionCOP as number, activo: true })];
  });
  return { presentaciones: catalogo };
}

async function contextoCatalogoVendedor(request: any, db: any) {
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return {
    empresaId: tenant.id,
    rol: tenant.rol,
    permisos: tenant.permisos,
    vertical: configuracion.vertical,
    inventoryHabilitado: configuracion.modulos.habilitados.includes("inventory"),
  };
}

export const crearPresentacionComercialV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore(); const tenant = await exigirTenantActivo(request, db);
  return ejecutarCrearPresentacionComercialV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const actualizarPresentacionComercialV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore(); const tenant = await exigirTenantActivo(request, db);
  return ejecutarActualizarPresentacionComercialV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const consultarCatalogoPresentacionesVendedorV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarConsultarCatalogoPresentacionesVendedor(db, await contextoCatalogoVendedor(request, db), request.data);
});
