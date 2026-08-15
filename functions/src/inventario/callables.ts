import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import {
  crearHuellaSemantica,
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../finanzas/callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { aplicarMovimientosInventarioEnTransaccion, type ArticuloTipo } from "./ledger";

const REGION = "us-central1";
const TIPOS_ARTICULO = ["producto", "insumo"] as const;
type TipoArticulo = typeof TIPOS_ARTICULO[number];

type Data = Record<string, unknown>;

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible completar la operación de inventario.", { code: dominio });
};

const object = (value: unknown): value is Data => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function requiredText(value: unknown, code: string, max = 160): string {
  if (!text(value) || value.trim().length > max) fail("invalid-argument", code);
  return (value as string).trim();
}

function optionalText(value: unknown, code: string, max = 160): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, code, max);
}

function nonNegativeNumber(value: unknown, code: string): number {
  if (!number(value) || value < 0) fail("invalid-argument", code);
  return value as number;
}

function articleType(value: unknown): TipoArticulo {
  if (!TIPOS_ARTICULO.includes(value as TipoArticulo)) fail("invalid-argument", "ARTICULO_TIPO_INVALIDO");
  return value as TipoArticulo;
}

function payload(value: unknown): Data {
  if (!object(value)) fail("invalid-argument", "PAYLOAD_INVALID");
  return value as Data;
}

function rejectAuthorityFields(data: Data, fields: string[]) {
  if (fields.some(field => Object.prototype.hasOwnProperty.call(data, field))) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
}

function articleId(value: unknown): string {
  return requiredText(value, "ARTICULO_ID_INVALIDO", 160);
}

function ensureOnlyKnownFields(data: Data, allowed: string[]) {
  const unknown = Object.keys(data).find(key => !allowed.includes(key));
  if (unknown) fail("invalid-argument", "CAMPO_ARTICULO_NO_PERMITIDO");
}

function commonArticleFields(data: Data, partial: boolean): Data {
  ensureOnlyKnownFields(data, [
    "nombre", "precio", "costo", "stock", "stockMinimo", "imagenUrl", "categoriaId",
    "espacioId", "activo", "descripcion", "unidad", "icono", "impuestoTipo", "consignadorId",
    "stockInicial", "codigo", "iva", "precioFraccion", "unidadMedida",
  ]);
  const result: Data = {};
  if (data.nombre !== undefined) result.nombre = requiredText(data.nombre, "NOMBRE_ARTICULO_INVALIDO");
  if (data.precio !== undefined) result.precio = nonNegativeNumber(data.precio, "PRECIO_INVALIDO");
  if (data.costo !== undefined) result.costo = nonNegativeNumber(data.costo, "COSTO_INVALIDO");
  if (data.stock !== undefined) result.stock = nonNegativeNumber(data.stock, "STOCK_INVALIDO");
  if (data.stockMinimo !== undefined) result.stockMinimo = nonNegativeNumber(data.stockMinimo, "STOCK_MINIMO_INVALIDO");
  if (data.imagenUrl !== undefined) result.imagenUrl = data.imagenUrl === null ? null : requiredText(data.imagenUrl, "IMAGEN_INVALIDA", 2048);
  if (data.categoriaId !== undefined) result.categoriaId = requiredText(data.categoriaId, "CATEGORIA_INVALIDA");
  if (data.espacioId !== undefined) result.espacioId = requiredText(data.espacioId, "ESPACIO_INVALIDO");
  if (data.activo !== undefined) {
    if (typeof data.activo !== "boolean") fail("invalid-argument", "ACTIVO_INVALIDO");
    result.activo = data.activo;
  }
  if (data.descripcion !== undefined) result.descripcion = typeof data.descripcion === "string" ? data.descripcion.trim().slice(0, 1000) : fail("invalid-argument", "DESCRIPCION_INVALIDA");
  if (data.unidad !== undefined) result.unidad = requiredText(data.unidad, "UNIDAD_INVALIDA", 32);
  if (data.unidadMedida !== undefined) result.unidadMedida = requiredText(data.unidadMedida, "UNIDAD_INVALIDA", 32);
  if (data.icono !== undefined) result.icono = requiredText(data.icono, "ICONO_INVALIDO", 80);
  if (data.impuestoTipo !== undefined) result.impuestoTipo = requiredText(data.impuestoTipo, "IMPUESTO_TIPO_INVALIDO", 40);
  if (data.consignadorId !== undefined) result.consignadorId = optionalText(data.consignadorId, "CONSIGNADOR_INVALIDO");
  if (data.stockInicial !== undefined) result.stockInicial = nonNegativeNumber(data.stockInicial, "STOCK_INICIAL_INVALIDO");
  if (data.codigo !== undefined) result.codigo = optionalText(data.codigo, "CODIGO_INVALIDO", 80);
  if (data.iva !== undefined) result.iva = nonNegativeNumber(data.iva, "IVA_INVALIDO");
  if (data.precioFraccion !== undefined) result.precioFraccion = nonNegativeNumber(data.precioFraccion, "PRECIO_FRACCION_INVALIDO");
  if (!partial && !result.nombre) fail("invalid-argument", "NOMBRE_ARTICULO_INVALIDO");
  return result;
}

function validateArticlePayload(tipo: TipoArticulo, raw: unknown, partial: boolean): Data {
  const data = commonArticleFields(payload(raw), partial);
  if (tipo === "producto") {
    if (!partial && !text(data.categoriaId)) fail("invalid-argument", "CATEGORIA_INVALIDA");
    if (!partial && !text(data.unidad)) data.unidad = "und";
  } else if (!partial && !text(data.unidadMedida)) {
    fail("invalid-argument", "UNIDAD_INVALIDA");
  }
  if (!partial && !text(data.espacioId)) fail("invalid-argument", "ESPACIO_INVALIDO");
  return data;
}

async function validarEspacio(tx: any, db: any, empresaId: string, espacioId: string) {
  const espacio = await tx.get(db.collection("espacios").doc(espacioId));
  if (!espacio.exists || espacio.data()?.empresaId !== empresaId) fail("failed-precondition", "ESPACIO_INVALIDO");
}

async function actorNombre(tx: any, db: any, actorUid: string): Promise<string> {
  const usuario = await tx.get(db.collection("usuarios").doc(actorUid));
  const nombre = usuario.data()?.nombre;
  if (!usuario.exists || !text(nombre)) fail("permission-denied", "ACTOR_NO_RESUELTO");
  return nombre.trim();
}

function movementKey(commandId: string, tipo: TipoArticulo, id: string, suffix: string) {
  return `inventario:${tipo}:${id}:${suffix}:${commandId}`;
}

function writeInitialMovement(tx: any, db: any, input: {
  empresaId: string;
  actorUid: string;
  actorNombre: string;
  tipo: TipoArticulo;
  id: string;
  nombre: string;
  unidad: string;
  espacioId: string;
  cantidad: number;
  costoUnitario: number;
  commandId: string;
}) {
  if (input.cantidad === 0) return null;
  const key = movementKey(input.commandId, input.tipo, input.id, "inicial");
  const ref = db.collection("movimientos_inventario").doc(key);
  const movimiento = {
    id: key,
    empresaId: input.empresaId,
    espacioId: input.espacioId,
    articuloTipo: input.tipo,
    articuloId: input.id,
    articuloNombre: input.nombre,
    unidad: input.unidad,
    tipo: "ajuste_positivo",
    clase: "entrada",
    signo: 1,
    cantidad: input.cantidad,
    costoUnitario: input.costoUnitario,
    costoTotal: input.cantidad * input.costoUnitario,
    saldoCantidadDespues: input.cantidad,
    saldoValorDespues: null,
    movimientoRelacionadoId: null,
    loteId: null,
    capasConsumidasDetalle: null,
    usuarioId: input.actorUid,
    usuarioNombre: input.actorNombre,
    claveIdempotencia: key,
    referenciaColeccion: input.tipo === "producto" ? "productos" : "insumos",
    referenciaId: input.id,
    fecha: FieldValue.serverTimestamp(),
    secuenciaArticulo: 1,
    motivo: "inventario_inicial",
  };
  tx.create(ref, movimiento);
  return { id: key, ref };
}

async function executeInventory(
  request: any,
  tipoComando: string,
  capacidad: string,
  effect: (tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope) => Promise<Record<string, unknown>>,
) {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const contexto: ContextoFinancieroOperativo = { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol };
  return executeConContexto(db, contexto, request.data, tipoComando, async (tx, transactionDb, empresaId, actorUid, rol, input) => {
    await revalidarAutoridadFinancieraEnTransaccion(tx, transactionDb, contexto, capacidad);
    return effect(tx, transactionDb, empresaId, actorUid, rol, input);
  });
}

async function efectoCrearArticulo(tx: any, db: any, empresaId: string, actorUid: string, _rol: string, input: Envelope) {
  const body = payload(input.payload);
  const tipo = articleType(body.articuloTipo);
  const data = validateArticlePayload(tipo, body.data, false);
  rejectAuthorityFields(data, ["empresaId", "id", "secuenciaLedger", "creadoEn", "actualizadoEn"]);
  const espacioId = data.espacioId as string;
  await validarEspacio(tx, db, empresaId, espacioId);
  const nombre = data.nombre as string;
  const actor = await actorNombre(tx, db, actorUid);
  const id = crearIdentificadorInterno(empresaId, `${tipo}:${input.commandId}`);
  const ref = db.collection(tipo === "producto" ? "productos" : "insumos").doc(id);
  const existente = await tx.get(ref);
  if (existente.exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  const stock = (data.stock as number | undefined) ?? 0;
  const unidad = (tipo === "producto" ? data.unidad : data.unidadMedida) as string;
  const metadata = { ...data };
  delete metadata.stock;
  tx.create(ref, {
    id,
    empresaId,
    ...metadata,
    stock,
    secuenciaLedger: stock > 0 ? 1 : 0,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  const movimiento = writeInitialMovement(tx, db, {
    empresaId, actorUid, actorNombre: actor, tipo, id, nombre, unidad, espacioId,
    cantidad: stock, costoUnitario: (data.costo as number | undefined) ?? 0, commandId: input.commandId,
  });
  return { commandId: input.commandId, articuloTipo: tipo, articuloId: id, movimientoId: movimiento?.id ?? null };
}

async function efectoActualizarArticulo(tx: any, db: any, empresaId: string, actorUid: string, _rol: string, input: Envelope) {
  const body = payload(input.payload);
  const tipo = articleType(body.articuloTipo);
  const id = articleId(body.articuloId);
  const data = validateArticlePayload(tipo, body.data, true);
  rejectAuthorityFields(data, ["empresaId", "id", "secuenciaLedger", "creadoEn", "actualizadoEn"]);
  const collection = tipo === "producto" ? "productos" : "insumos";
  const ref = db.collection(collection).doc(id);
  const articulo = await tx.get(ref);
  if (!articulo.exists || articulo.data()?.empresaId !== empresaId) fail("not-found", "ARTICULO_NO_ENCONTRADO");
  const actual = articulo.data() as Data;
  const espacioIdRaw = (data.espacioId as string | undefined) ?? actual.espacioId;
  if (!text(espacioIdRaw)) fail("failed-precondition", "ESPACIO_INVALIDO");
  const espacioId = espacioIdRaw as string;
  await validarEspacio(tx, db, empresaId, espacioId);
  const actor = await actorNombre(tx, db, actorUid);
  const objetivo = data.stock as number | undefined;
  const stockActual = (actual.stock as number | undefined) ?? 0;
  const delta = objetivo === undefined ? 0 : objetivo - stockActual;
  const metadata = { ...data };
  delete metadata.stock;
  delete metadata.secuenciaLedger;
  let movimientoId: string | null = null;
  if (delta !== 0) {
    const movimiento = await aplicarMovimientosInventarioEnTransaccion(tx, db, [{
      empresaId,
      articuloTipo: tipo as ArticuloTipo,
      articuloId: id,
      articuloNombre: (actual.nombre as string) ?? id,
      unidad: ((tipo === "producto" ? actual.unidad : actual.unidadMedida) as string) ?? "und",
      tipo: delta > 0 ? "ajuste_positivo" : "ajuste_negativo",
      cantidad: delta,
      costoUnitario: (actual.costo as number | undefined) ?? 0,
      espacioId,
      usuarioId: actorUid,
      usuarioNombre: actor,
      claveIdempotencia: movementKey(input.commandId, tipo, id, "ajuste"),
      referenciaColeccion: collection,
      referenciaId: id,
      motivo: input.motivo ?? "ajuste_administrativo",
    }]);
    movimientoId = movimiento[0]?.id ?? null;
  }
  if (Object.keys(metadata).length > 0) {
    tx.update(ref, { ...metadata, actualizadoEn: FieldValue.serverTimestamp() });
  }
  return { commandId: input.commandId, articuloTipo: tipo, articuloId: id, movimientoId };
}

async function efectoRegistrarMerma(tx: any, db: any, empresaId: string, actorUid: string, _rol: string, input: Envelope) {
  const body = payload(input.payload);
  const insumoId = articleId(body.insumoId);
  if (!number(body.cantidad) || body.cantidad <= 0) fail("invalid-argument", "CANTIDAD_MERMA_INVALIDA");
  const cantidad = body.cantidad as number;
  const motivo = requiredText(input.motivo ?? body.motivo, "MOTIVO_REQUERIDO", 240);
  const notas = optionalText(body.notas, "NOTAS_INVALIDAS", 1000);
  ensureOnlyKnownFields(body, ["insumoId", "cantidad", "motivo", "notas"]);
  const insumoRef = db.collection("insumos").doc(insumoId);
  const insumo = await tx.get(insumoRef);
  if (!insumo.exists || insumo.data()?.empresaId !== empresaId) fail("not-found", "ARTICULO_NO_ENCONTRADO");
  const data = insumo.data() as Data;
  const stock = (data.stock as number | undefined) ?? 0;
  if (stock < cantidad) fail("failed-precondition", "STOCK_INSUFICIENTE");
  const espacioId = data.espacioId;
  if (!text(espacioId)) fail("failed-precondition", "ESPACIO_INVALIDO");
  const espacioIdValue = espacioId as string;
  await validarEspacio(tx, db, empresaId, espacioIdValue);
  const actor = await actorNombre(tx, db, actorUid);
  const mermaId = crearIdentificadorInterno(empresaId, `merma:${input.commandId}`);
  const mermaRef = db.collection("mermas").doc(mermaId);
  const movimiento = await aplicarMovimientosInventarioEnTransaccion(tx, db, [{
    empresaId,
    articuloTipo: "insumo",
    articuloId: insumoId,
    articuloNombre: requiredText(data.nombre, "NOMBRE_ARTICULO_INVALIDO"),
    unidad: requiredText(data.unidadMedida, "UNIDAD_INVALIDA", 32),
    tipo: "merma",
    cantidad: -cantidad,
    costoUnitario: (data.costo as number | undefined) ?? 0,
    espacioId: espacioIdValue,
    usuarioId: actorUid,
    usuarioNombre: actor,
    claveIdempotencia: movementKey(input.commandId, "insumo", insumoId, "merma"),
    referenciaColeccion: "mermas",
    referenciaId: mermaId,
    motivo,
  }]);
  tx.create(mermaRef, {
    id: mermaId,
    empresaId,
    insumoId,
    insumoNombre: data.nombre,
    cantidad,
    unidadMedida: data.unidadMedida,
    motivo,
    costo: cantidad * ((data.costo as number | undefined) ?? 0),
    ...(notas ? { notas } : {}),
    espacioId: espacioIdValue,
    registradoPor: actorUid,
    registradoPorNombre: actor,
    fecha: FieldValue.serverTimestamp(),
    movimientoId: movimiento[0]?.id ?? null,
  });
  return { commandId: input.commandId, mermaId, movimientoId: movimiento[0]?.id ?? null };
}

export async function ejecutarCrearArticuloInventarioV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "crearArticuloInventarioV1", async (tx, transactionDb, empresaId, actorUid, rol, input) => {
    await revalidarAutoridadFinancieraEnTransaccion(tx, transactionDb, contexto, "inventory");
    return efectoCrearArticulo(tx, transactionDb, empresaId, actorUid, rol, input);
  });
}

export async function ejecutarActualizarArticuloInventarioV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "actualizarArticuloInventarioV1", async (tx, transactionDb, empresaId, actorUid, rol, input) => {
    await revalidarAutoridadFinancieraEnTransaccion(tx, transactionDb, contexto, "inventory");
    return efectoActualizarArticulo(tx, transactionDb, empresaId, actorUid, rol, input);
  });
}

export async function ejecutarRegistrarMermaOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "registrarMermaOperativaV1", async (tx, transactionDb, empresaId, actorUid, rol, input) => {
    await revalidarAutoridadFinancieraEnTransaccion(tx, transactionDb, contexto, "waste");
    return efectoRegistrarMerma(tx, transactionDb, empresaId, actorUid, rol, input);
  });
}

export const crearArticuloInventarioV1 = onCall({ region: REGION }, request => executeInventory(request, "crearArticuloInventarioV1", "inventory", efectoCrearArticulo));
export const actualizarArticuloInventarioV1 = onCall({ region: REGION }, request => executeInventory(request, "actualizarArticuloInventarioV1", "inventory", efectoActualizarArticulo));
export const registrarMermaOperativaV1 = onCall({ region: REGION }, request => executeInventory(request, "registrarMermaOperativaV1", "waste", efectoRegistrarMerma));

export { crearHuellaSemantica };
