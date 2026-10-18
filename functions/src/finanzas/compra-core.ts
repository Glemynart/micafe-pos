import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  resolverCuentaOperativa,
  requerirClaveOperativa,
  writeMovement,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "./callables";
import { aplicarMovimientosCompraEnTransaccion, type ArticuloTipo, type MovimientoCompraParams } from "../inventario/ledger";
import { marcarSenalDisponibilidadBodega } from "../bodega-vendedor/live-signals";
import { errorPayloadCompraBodega, errorPoliticaCompraBodega } from "../../../lib/bodega/compra-policy";

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible registrar la compra.", { code: dominio });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const cantidad = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const costo = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const CONTROLES_RELEASE_COMPRAS = "controles_release_compras";

interface SnapshotItem {
  articuloId: string;
  tipo: ArticuloTipo;
  articuloNombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
}

interface ProveedorSnapshot {
  id: string;
  nombre: string;
  estado: "ACTIVO";
  nit?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

interface CompraPayload {
  proveedor: string;
  proveedorId?: string;
  proveedorSnapshot?: ProveedorSnapshot;
  espacioId: string;
  fechaCompra: Timestamp | FieldValue;
  cuentaClaveOperativa: string | null;
  items: SnapshotItem[];
  total: number;
}

function fechaCompra(value: unknown): Timestamp | FieldValue {
  if (value === undefined || value === null || value === "") return FieldValue.serverTimestamp();
  if (typeof value !== "string") fail("invalid-argument", "FECHA_COMPRA_INVALIDA");
  const fecha = value as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail("invalid-argument", "FECHA_COMPRA_INVALIDA");
  const [year, month, day] = fecha.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) fail("invalid-argument", "FECHA_COMPRA_INVALIDA");
  return Timestamp.fromDate(utc);
}

function validarCamposNoAutoritativos(payload: Record<string, unknown>) {
  if (["empresaId", "total", "cuentaNombre", "cuentaDocumentoId", "registradoPor", "registradoPorNombre", "proveedorSnapshot"].some(campo => Object.prototype.hasOwnProperty.call(payload, campo))) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cuentaId")) fail("invalid-argument", "CUENTA_CLAVE_REQUERIDA");
}

async function prepararCompra(tx: any, db: any, empresaId: string, input: Envelope): Promise<CompraPayload> {
  const payload = input.payload;
  validarCamposNoAutoritativos(payload);
  let proveedor: string;
  let proveedorId: string | undefined;
  let proveedorSnapshot: ProveedorSnapshot | undefined;
  const proveedorIdEntrada = payload.proveedorId;
  const usaCatalogo = proveedorIdEntrada !== undefined && proveedorIdEntrada !== null && proveedorIdEntrada !== "";
  if (usaCatalogo) {
    proveedorId = text(proveedorIdEntrada) ? proveedorIdEntrada.trim() : fail("invalid-argument", "PROVEEDOR_INVALIDO");
    const proveedorRef = db.collection("proveedores").doc(proveedorId);
    const proveedorDoc = await tx.get(proveedorRef);
    if (!proveedorDoc.exists || proveedorDoc.data()?.empresaId !== empresaId) fail("failed-precondition", "PROVEEDOR_NO_ENCONTRADO");
    const proveedorData = proveedorDoc.data() as Record<string, unknown>;
    if (proveedorData.estado !== "ACTIVO") fail("failed-precondition", "PROVEEDOR_INACTIVO");
    const nombre = text(proveedorData.nombre) ? proveedorData.nombre.trim() : fail("failed-precondition", "PROVEEDOR_INVALIDO");
    proveedor = nombre;
    proveedorSnapshot = {
      id: proveedorId,
      nombre,
      estado: "ACTIVO",
      ...(text(proveedorData.nit) ? { nit: proveedorData.nit.trim() } : {}),
      ...(text(proveedorData.telefono) ? { telefono: proveedorData.telefono.trim() } : {}),
      ...(text(proveedorData.correo) ? { correo: proveedorData.correo.trim() } : {}),
      ...(text(proveedorData.direccion) ? { direccion: proveedorData.direccion.trim() } : {}),
    };
  } else {
    proveedor = text(payload.proveedor) ? payload.proveedor.trim() : fail("invalid-argument", "PROVEEDOR_INVALIDO");
  }
  const espacioId = text(payload.espacioId) ? payload.espacioId : fail("invalid-argument", "ESPACIO_INVALIDO");
  const espacio = await tx.get(db.collection("espacios").doc(espacioId));
  if (!espacio.exists || espacio.data()?.empresaId !== empresaId || espacio.data()?.activo === false) fail("failed-precondition", "ESPACIO_INVALIDO");

  const itemsInput = payload.items as unknown;
  if (!Array.isArray(itemsInput) || itemsInput.length === 0 || itemsInput.length > 100) fail("invalid-argument", "ITEMS_INVALIDOS");
  const snapshots: SnapshotItem[] = [];
  for (const itemUnknown of itemsInput as unknown[]) {
    if (!object(itemUnknown)) fail("invalid-argument", "ITEM_INVALIDO");
    const itemInput = itemUnknown as Record<string, unknown>;
    const articuloId = text(itemInput.articuloId) ? itemInput.articuloId : fail("invalid-argument", "ITEM_INVALIDO");
    const tipo = itemInput.tipo === "producto" || itemInput.tipo === "insumo" ? itemInput.tipo : fail("invalid-argument", "ITEM_INVALIDO");
    if (!cantidad(itemInput.cantidad) || !costo(itemInput.costoUnitario)) fail("invalid-argument", "ITEM_COSTO_CANTIDAD_INVALIDOS");
    const cantidadItem = itemInput.cantidad as number;
    const costoItem = itemInput.costoUnitario as number;
    const articulo = await tx.get(db.collection(tipo === "producto" ? "productos" : "insumos").doc(articuloId));
    if (!articulo.exists || articulo.data()?.empresaId !== empresaId || (articulo.data()?.espacioId && articulo.data()?.espacioId !== espacioId)) fail("failed-precondition", "ARTICULO_NO_ENCONTRADO");
    const articuloData = articulo.data() as Record<string, unknown>;
    const articuloNombre = text(articuloData.nombre) ? articuloData.nombre : articuloId;
    const unidad = text(articuloData.unidadMedida) ? articuloData.unidadMedida : text(articuloData.unidad) ? articuloData.unidad : "und";
    const costoTotal = cantidadItem * costoItem;
    if (!Number.isSafeInteger(costoTotal)) fail("invalid-argument", "ITEM_COSTO_INVALIDO");
    snapshots.push({ articuloId, tipo, articuloNombre, unidad, cantidad: cantidadItem, costoUnitario: costoItem, costoTotal });
  }

  const total = snapshots.reduce((sum, item) => sum + item.costoTotal, 0);
  if (!Number.isSafeInteger(total) || total <= 0) fail("invalid-argument", "TOTAL_COMPRA_INVALIDO");
  const cuentaClaveOperativa = payload.cuentaClaveOperativa === undefined || payload.cuentaClaveOperativa === null || payload.cuentaClaveOperativa === ""
    ? null
    : requerirClaveOperativa(payload, "cuentaClaveOperativa", ["cuentaId"]) as string;
  return { proveedor, proveedorId, proveedorSnapshot, espacioId, fechaCompra: fechaCompra(payload.fechaCompra), cuentaClaveOperativa, items: snapshots, total };
}

function consolidar(items: SnapshotItem[], empresaId: string, espacioId: string, actorUid: string, actorNombre: string, compraId: string): MovimientoCompraParams[] {
  const agregados = new Map<string, { tipo: ArticuloTipo; articuloId: string; cantidad: number; costoTotal: number; articuloNombre: string; unidad: string }>();
  for (const item of items) {
    const key = `${item.tipo}:${item.articuloId}`;
    const previo = agregados.get(key);
    if (previo) {
      previo.cantidad += item.cantidad;
      previo.costoTotal += item.costoTotal;
    } else {
      agregados.set(key, { tipo: item.tipo, articuloId: item.articuloId, cantidad: item.cantidad, costoTotal: item.costoTotal, articuloNombre: item.articuloNombre, unidad: item.unidad });
    }
  }
  return [...agregados.values()].map(item => ({
    empresaId,
    articuloTipo: item.tipo,
    articuloId: item.articuloId,
    articuloNombre: item.articuloNombre,
    unidad: item.unidad,
    cantidad: item.cantidad,
    costoUnitario: item.costoTotal / item.cantidad,
    espacioId,
    usuarioId: actorUid,
    usuarioNombre: actorNombre,
    claveIdempotencia: `compra:${compraId}:${item.tipo}:${item.articuloId}:0`,
    referenciaId: compraId,
    motivo: "compra_proveedor",
  }));
}

async function efectoRegistrarCompra(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  await exigirComprasActivasEnTransaccion(tx, db, empresaId, false);
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "purchases");
  const compraId = crearIdentificadorInterno(empresaId, `compra:${input.commandId}`);
  const compraRef = db.collection("compras").doc(compraId);
  const existente = await tx.get(compraRef);
  if (existente.exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  const compra = await prepararCompra(tx, db, empresaId, input);
  const membresia = await tx.get(db.collection("membresias").doc(`${empresaId}_${actorUid}`));
  const actorNombre = text(membresia.data()?.nombre) ? membresia.data().nombre : actorUid;
  const cuenta = compra.cuentaClaveOperativa ? await resolverCuentaOperativa(tx, db, empresaId, compra.cuentaClaveOperativa) : null;
  const movimientos = await aplicarMovimientosCompraEnTransaccion(tx, db, consolidar(compra.items, empresaId, compra.espacioId, actorUid, actorNombre, compraId));
  const movimientoFinanciero = cuenta
    ? writeMovement(tx, db, { empresaId, command: input, key: `compra:${compraId}:pago`, account: cuenta, tipo: "egreso", monto: compra.total, categoria: "compras", actorUid, rol, compraId })
    : null;
  const snapshotItems = compra.items.map(item => ({ ...item, itemId: item.articuloId, itemNombre: item.articuloNombre, unidadMedida: item.unidad }));
  tx.create(compraRef, {
    id: compraId,
    empresaId,
    proveedor: compra.proveedor,
    ...(compra.proveedorId ? { proveedorId: compra.proveedorId, proveedorSnapshot: compra.proveedorSnapshot } : {}),
    items: snapshotItems,
    total: compra.total,
    espacioId: compra.espacioId,
    fecha: compra.fechaCompra,
    registradoPor: actorUid,
    registradoPorNombre: actorNombre,
    snapshotComercial: { version: 1, proveedor: compra.proveedor, ...(compra.proveedorSnapshot ? { proveedorSnapshot: compra.proveedorSnapshot } : {}), items: snapshotItems },
    ...(cuenta ? { cuentaClaveOperativa: compra.cuentaClaveOperativa, cuentaDocumentoId: cuenta.ref.id, cuentaNombre: cuenta.data.nombre ?? cuenta.ref.id } : {}),
    ...(movimientoFinanciero ? { movimientoFinancieroId: movimientoFinanciero.id } : {}),
    movimientosInventario: movimientos.map(movimiento => movimiento.id),
    creadoEn: FieldValue.serverTimestamp(),
  });
  if (compra.items.some(item => item.tipo === "producto")) marcarSenalDisponibilidadBodega(tx, db, empresaId);
  return { commandId: input.commandId, compraId, movimientosInventario: movimientos.map(movimiento => movimiento.id), movimientoFinancieroId: movimientoFinanciero?.id ?? null, total: compra.total };
}

/**
 * ADR-SAAS-081: el mismo documento que consumen las Rules se lee dentro de
 * la transacción. Ausencia o forma ambigua fallan cerradas; un replay ya
 * confirmado puede devolver su recibo durante la pausa sin materializar nada.
 */
async function exigirComprasActivasEnTransaccion(tx: any, db: any, empresaId: string, replayConfirmado: boolean): Promise<void> {
  const control = await tx.get(db.collection(CONTROLES_RELEASE_COMPRAS).doc(empresaId));
  if (!control.exists) fail("failed-precondition", "COMPRAS_CONTROL_NO_CONFIGURADO");
  const datos = control.data() as Record<string, unknown>;
  if (!datos) fail("failed-precondition", "COMPRAS_CONTROL_INVALIDO");
  if (
    !Number.isSafeInteger(datos.schemaVersion)
    || datos.schemaVersion !== 1
    || datos.empresaId !== empresaId
    || !Number.isSafeInteger(datos.revision)
    || (datos.revision as number) < 1
    || (datos.estado !== "ACTIVA" && datos.estado !== "PAUSADA")
  ) {
    fail("failed-precondition", "COMPRAS_CONTROL_INVALIDO");
  }
  if (datos.estado === "PAUSADA" && !replayConfirmado) {
    fail("failed-precondition", "COMPRAS_EN_CORTE");
  }
}

async function efectoRegistrarCompraBodega(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  await validarPoliticaCompraBodegaEnTransaccion(tx, db, empresaId, input);
  return efectoRegistrarCompra(tx, db, empresaId, actorUid, rol, input);
}

async function validarPoliticaCompraBodegaEnTransaccion(tx: any, db: any, empresaId: string, input: Envelope): Promise<void> {
  const configuracion = await tx.get(db.collection("configuraciones").doc(empresaId));
  if (!configuracion.exists) fail("failed-precondition", "CONFIGURACION_INVALIDA");
  const datosConfiguracion = configuracion.data() as Record<string, unknown> | undefined;
  if (datosConfiguracion?.empresaId !== empresaId) fail("failed-precondition", "CONFIGURACION_INVALIDA");
  const errorConfiguracion = errorPoliticaCompraBodega(datosConfiguracion);
  if (errorConfiguracion) fail("failed-precondition", errorConfiguracion);
  const errorPayload = errorPayloadCompraBodega(input.payload);
  if (errorPayload) fail("invalid-argument", errorPayload);
}

async function rechazarCompraLegacyBodegaEnTransaccion(tx: any, db: any, empresaId: string): Promise<void> {
  const configuracion = await tx.get(db.collection("configuraciones").doc(empresaId));
  if (configuracion.data()?.vertical === "BODEGA_MVP1") {
    throw new HttpsError(
      "failed-precondition",
      "Las compras Bodega deben registrarse mediante registrarCompraBodegaV1.",
      { code: "BODEGA_USE_CANONICAL" },
    );
  }
}

async function efectoRegistrarCompraOperativaLegacy(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<Record<string, unknown>> {
  await rechazarCompraLegacyBodegaEnTransaccion(tx, db, empresaId);
  return efectoRegistrarCompra(tx, db, empresaId, actorUid, rol, input);
}

async function validarReplayCompraOperativaLegacy(tx: any, db: any, empresaId: string): Promise<void> {
  await rechazarCompraLegacyBodegaEnTransaccion(tx, db, empresaId);
  await exigirComprasActivasEnTransaccion(tx, db, empresaId, true);
}

async function validarReplayCompraBodega(tx: any, db: any, empresaId: string, actorUid: string, rol: string, input: Envelope): Promise<void> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, { empresaId, actorUid, rol }, "purchases");
  await validarPoliticaCompraBodegaEnTransaccion(tx, db, empresaId, input);
  await exigirComprasActivasEnTransaccion(tx, db, empresaId, true);
}

/** Core transaccional común: solo cambia el tipo canónico de idempotencia. */
export function ejecutarRegistrarCompraOperativaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(
    db,
    contexto,
    data,
    "registrarCompraOperativaV1",
    efectoRegistrarCompraOperativaLegacy,
    validarReplayCompraOperativaLegacy,
  );
}

/** Entrada aislada Bodega sobre las mismas validaciones, ledger y señal. */
export function ejecutarRegistrarCompraBodegaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "registrarCompraBodegaV1", efectoRegistrarCompraBodega, validarReplayCompraBodega);
}
