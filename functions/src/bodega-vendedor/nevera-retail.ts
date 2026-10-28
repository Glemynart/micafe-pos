import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  crearHuellaSemantica,
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  resolverCuentaOperativa,
  resolverTurnoRecaudoPropioOpcionalEnTransaccion,
  writeMovement,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../bodega/operational-core";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { aplicarMovimientosInventarioEnTransaccion } from "../inventario/ledger";
import { idCapaFifoNevera, reconstruirCapasFifoNevera, type CapaFifoNevera, type MovimientoLedgerNevera } from "../inventario/nevera-fifo";

const REGION = "us-central1";
const COLLECTION_LAYER = "capas_fifo_nevera";
const COLLECTION_CONTROL_EVENTS = "cuentas_control_nevera_movimientos";
const COLLECTION_CONTROL = "cuentas_control_nevera";
const MAX_LINEAS_NEVERA = 50;
const MAX_MOVIMIENTOS_APERTURA_POR_PRODUCTO = 400;
const MAX_CAPAS_FIFO_POR_PRODUCTO = 300;

export interface PresentacionRetailNeveraDTO {
  productoId: string;
  productoNombre: string;
  categoriaId: string | null;
  unidadBase: string;
  presentacionId: string;
  presentacionNombre: string;
  factorUnidadBase: number;
  precioCOP: number;
  disponibilidadUnidadBase: number;
  maximoPresentacionesVendibles: number;
  fifoListo: boolean;
}

function fail(code: HttpsError["code"], domain: string): never {
  throw new HttpsError(code, "No fue posible completar la operación de Nevera.", { code: domain });
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

interface LineaIntentoNevera { productoId: string; presentacionId: string; cantidad: number }
interface ComandoVentaNevera extends Envelope {
  payload: Record<string, unknown> & {
    lineas: LineaIntentoNevera[];
    metodoPago: "efectivo" | "transferencia";
    montoRecibidoCOP?: number;
  };
}

function requiredText(value: unknown, code: string, max = 160) {
  if (!text(value) || value.trim().length > max) fail("invalid-argument", code);
  return value.trim();
}

function only(value: Record<string, unknown>, fields: readonly string[], code: string) {
  if (Object.keys(value).some(key => !fields.includes(key))) fail("invalid-argument", code);
}

function normalizarLinea(raw: unknown): LineaIntentoNevera {
  if (!object(raw)) fail("invalid-argument", "LINEA_NEVERA_INVALIDA");
  only(raw, ["productoId", "presentacionId", "cantidad"], "LINEA_NEVERA_INVALIDA");
  if (!positiveInteger(raw.cantidad)) fail("invalid-argument", "CANTIDAD_PRESENTACIONES_INVALIDA");
  return {
    productoId: requiredText(raw.productoId, "PRODUCTO_ID_INVALIDO"),
    presentacionId: requiredText(raw.presentacionId, "PRESENTACION_ID_INVALIDO"),
    cantidad: raw.cantidad,
  };
}

export function normalizarComandoVentaRetailNevera(raw: unknown): ComandoVentaNevera {
  if (!object(raw)) fail("invalid-argument", "COMANDO_NEVERA_INVALIDO");
  only(raw, ["commandId", "idempotencyKey", "correlationId", "causationId", "payload", "motivo"], "COMANDO_NEVERA_INVALIDO");
  if (!object(raw.payload)) fail("invalid-argument", "PAYLOAD_NEVERA_INVALIDO");
  const payload = raw.payload;
  only(payload, ["lineas", "metodoPago", "montoRecibidoCOP"], "PAYLOAD_NEVERA_INVALIDO");
  if (!Array.isArray(payload.lineas) || payload.lineas.length === 0 || payload.lineas.length > MAX_LINEAS_NEVERA) {
    fail("invalid-argument", "LINEAS_NEVERA_INVALIDAS");
  }
  if (payload.metodoPago !== "efectivo" && payload.metodoPago !== "transferencia") fail("invalid-argument", "METODO_PAGO_NEVERA_INVALIDO");
  if (payload.metodoPago === "efectivo") {
    if (!nonNegativeInteger(payload.montoRecibidoCOP)) fail("invalid-argument", "MONTO_RECIBIDO_INVALIDO");
  } else if (Object.prototype.hasOwnProperty.call(payload, "montoRecibidoCOP")) fail("invalid-argument", "MONTO_RECIBIDO_NO_APLICA");
  const lineas = payload.lineas.map(normalizarLinea);
  const keys = new Set<string>();
  for (const line of lineas) {
    const key = `${line.productoId}:${line.presentacionId}`;
    if (keys.has(key)) fail("invalid-argument", "LINEA_NEVERA_DUPLICADA");
    keys.add(key);
  }
  if (raw.causationId !== null && raw.causationId !== undefined && typeof raw.causationId !== "string") fail("invalid-argument", "CAUSATION_ID_INVALIDO");
  return {
    commandId: requiredText(raw.commandId, "COMMAND_ID_INVALIDO"),
    idempotencyKey: requiredText(raw.idempotencyKey, "IDEMPOTENCY_KEY_INVALIDA"),
    correlationId: requiredText(raw.correlationId, "CORRELATION_ID_INVALIDO"),
    causationId: (raw.causationId as string | null | undefined) ?? null,
    ...(raw.motivo === undefined ? {} : { motivo: requiredText(raw.motivo, "MOTIVO_INVALIDO", 240) }),
    payload: {
      lineas,
      metodoPago: payload.metodoPago,
      ...(payload.metodoPago === "efectivo" ? { montoRecibidoCOP: payload.montoRecibidoCOP as number } : {}),
    },
  };
}

async function exigirAutoridadVentaNevera(tx: any, db: any, contexto: ContextoFinancieroOperativo) {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "sell");
  if (contexto.rol !== "admin" && contexto.rol !== "vendedor") fail("permission-denied", "ROL_VENTA_NEVERA_REQUERIDO");
  const snap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const config = snap.data() as Record<string, any> | undefined;
  if (!snap.exists || config?.empresaId !== contexto.empresaId || config?.vertical !== "BODEGA_MVP1"
    || !Array.isArray(config?.modulos?.habilitados) || !config.modulos.habilitados.includes("sell")
    || !config.modulos.habilitados.includes("inventory")) fail("permission-denied", "VENTA_NEVERA_NO_AUTORIZADA");
}

async function exigirAutoridadAperturaNevera(tx: any, db: any, contexto: ContextoFinancieroOperativo) {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "inventory");
  if (contexto.rol !== "admin") fail("permission-denied", "ROL_ADMIN_NEVERA_REQUERIDO");
  const snap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const config = snap.data() as Record<string, any> | undefined;
  if (!snap.exists || config?.empresaId !== contexto.empresaId || config?.vertical !== "BODEGA_MVP1"
    || !Array.isArray(config?.modulos?.habilitados) || !config.modulos.habilitados.includes("inventory")) {
    fail("permission-denied", "APERTURA_NEVERA_NO_AUTORIZADA");
  }
}

function effectiveCatalogId(value: unknown) {
  return value === "BODEGA" || value === "NEVERA" ? value : null;
}

/** Lectura por el catálogo Nevera. El DTO nunca incluye costos ni datos internos. */
export async function ejecutarConsultarCatalogoNeveraVendedorV1(
  db: any,
  contexto: { empresaId: string; rol: string; permisos: readonly string[]; vertical: string | undefined; inventoryHabilitado: boolean },
  raw: unknown,
) {
  if (raw !== undefined && (!object(raw) || Object.keys(raw).length > 0)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const permitido = contexto.rol === "admin" || (contexto.rol === "vendedor" && contexto.permisos.includes("sell"));
  if (!permitido || contexto.vertical !== "BODEGA_MVP1" || !contexto.inventoryHabilitado) fail("permission-denied", "CATALOGO_NEVERA_NO_AUTORIZADO");
  const [productosSnap, presentacionesSnap] = await Promise.all([
    db.collection("productos").where("empresaId", "==", contexto.empresaId).where("activo", "==", true).get(),
    db.collection("presentaciones_producto").where("empresaId", "==", contexto.empresaId).where("activo", "==", true).get(),
  ]);
  const productos = new Map<string, Record<string, any>>(
    productosSnap.docs
      .filter((doc: any) => effectiveCatalogId(doc.data()?.catalogoId) === "NEVERA")
      .map((doc: any) => [doc.id, doc.data() as Record<string, any>]),
  );
  const presentaciones: PresentacionRetailNeveraDTO[] = [];
  for (const doc of presentacionesSnap.docs) {
    const data = doc.data() as Record<string, any>;
    const producto = typeof data.productoId === "string" ? productos.get(data.productoId) : undefined;
    if (!producto || effectiveCatalogId(data.catalogoId) !== "NEVERA" || data.activo !== true
      || !positiveInteger(data.factorUnidadBase) || !text(data.nombre)) continue;
    const precioCOP = precioNeveraBase(data);
    const stock = producto.stock;
    if (!nonNegativeInteger(stock) || !text(producto.nombre) || !text(producto.espacioId)) continue;
    const unidad = producto.unidadMedida ?? producto.unidad;
    if (!text(unidad)) continue;
    const maximo = Math.floor(stock / data.factorUnidadBase);
    const fifoListo = producto.fifoNeveraEstado === "LISTO";
    presentaciones.push({
      productoId: data.productoId as string,
      productoNombre: producto.nombre.trim(),
      categoriaId: text(producto.categoriaId) ? producto.categoriaId : null,
      unidadBase: unidad.trim(),
      presentacionId: doc.id,
      presentacionNombre: data.nombre.trim(),
      factorUnidadBase: data.factorUnidadBase as number,
      precioCOP,
      disponibilidadUnidadBase: stock,
      maximoPresentacionesVendibles: fifoListo ? maximo : 0,
      fifoListo,
    });
  }
  presentaciones.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es") || a.presentacionNombre.localeCompare(b.presentacionNombre, "es"));
  return { catalogoId: "NEVERA" as const, presentaciones };
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis(): number }).toMillis();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function precioNeveraBase(presentacion: Record<string, unknown>) {
  const precio = presentacion.precioCOP;
  if (!positiveInteger(precio)) fail("failed-precondition", "PRECIO_NEVERA_NO_CONFIGURADO");
  if (presentacion.precioTiendaCOP !== undefined && presentacion.precioTiendaCOP !== precio) fail("failed-precondition", "PRECIO_NEVERA_INCONSISTENTE");
  return precio;
}

interface LineaResueltaNevera {
  productoId: string;
  productoNombre: string;
  unidadBase: string;
  espacioId: string;
  presentacionId: string;
  presentacionNombre: string;
  cantidadPresentaciones: number;
  factorUnidadBase: number;
  cantidadUnidadBase: number;
  precioBaseCOP: number;
  precioAplicadoCOP: number;
  ofertaId: string | null;
  subtotalCOP: number;
}

function resolverPrecioOfertaNevera(
  ofertas: any[],
  empresaId: string,
  presentacionId: string,
  precioBaseCOP: number,
  nowMillis: number,
): { precioAplicadoCOP: number; ofertaId: string | null } {
  const candidatas: Array<{ ofertaId: string; precio: number }> = [];
  for (const snapshot of ofertas) {
    const offer = snapshot.data() as Record<string, any>;
    if (offer.empresaId !== empresaId || offer.catalogoId !== "NEVERA" || offer.estado !== "ACTIVA" || offer.cerradaEn !== undefined) continue;
    const inicio = timestampMillis(offer.inicioEn);
    const fin = offer.finEn === null ? null : timestampMillis(offer.finEn);
    if (inicio === null || (offer.finEn !== null && fin === null) || !Array.isArray(offer.lineas)) fail("failed-precondition", "OFERTA_NEVERA_PERSISTIDA_INVALIDA");
    if (nowMillis < inicio || (fin !== null && nowMillis >= fin)) continue;
    for (const line of offer.lineas) {
      if (!object(line)) fail("failed-precondition", "OFERTA_NEVERA_PERSISTIDA_INVALIDA");
      if (line.presentacionId !== presentacionId || (line.canal !== undefined && line.canal !== "consumidor_final")) continue;
      if (!positiveInteger(line.precioFinalCOP) || line.precioFinalCOP > precioBaseCOP) fail("failed-precondition", "OFERTA_NEVERA_PERSISTIDA_INVALIDA");
      candidatas.push({ ofertaId: snapshot.id, precio: line.precioFinalCOP });
    }
  }
  if (candidatas.length > 1) fail("failed-precondition", "OFERTA_NEVERA_SUPERPUESTA");
  return candidatas.length === 1
    ? { precioAplicadoCOP: candidatas[0]!.precio, ofertaId: candidatas[0]!.ofertaId }
    : { precioAplicadoCOP: precioBaseCOP, ofertaId: null };
}

function sumarSeguro(a: number, b: number, code: string) {
  const total = a + b;
  if (!Number.isSafeInteger(total) || total < 0) fail("failed-precondition", code);
  return total;
}

function repartirCostoFifoPorLinea(lineas: LineaResueltaNevera[], movimientos: any[]) {
  const salida = lineas.map(linea => ({ ...linea, costoTotalFIFOCOP: 0, capasConsumidas: [] as Array<Record<string, number | string>> }));
  const movimientosPorProducto = new Map<string, any>();
  for (const movimiento of movimientos) movimientosPorProducto.set(movimiento.articuloId, movimiento);
  for (const productoId of new Set(lineas.map(linea => linea.productoId))) {
    const movimiento = movimientosPorProducto.get(productoId);
    const capas = movimiento?.capasConsumidasDetalle;
    if (!Array.isArray(capas)) fail("internal", "CONSUMO_FIFO_NO_REGISTRADO");
    let indiceCapa = 0;
    let disponibleCapa = capas[0]?.cantidad ?? 0;
    const lineasProducto = salida.filter(linea => linea.productoId === productoId);
    for (const linea of lineasProducto) {
      let pendiente = linea.cantidadUnidadBase;
      while (pendiente > 0) {
        const capa = capas[indiceCapa];
        if (!capa || disponibleCapa <= 0) fail("internal", "CONSUMO_FIFO_INCONSISTENTE");
        const cantidad = Math.min(pendiente, disponibleCapa);
        const costo = cantidad * capa.costoUnitarioCOP;
        if (!Number.isSafeInteger(costo)) fail("internal", "COSTO_FIFO_DESBORDADO");
        linea.costoTotalFIFOCOP = sumarSeguro(linea.costoTotalFIFOCOP, costo, "COSTO_FIFO_DESBORDADO");
        linea.capasConsumidas.push({ capaId: capa.capaId, cantidad, costoUnitarioCOP: capa.costoUnitarioCOP, costoTotalCOP: costo });
        pendiente -= cantidad;
        disponibleCapa -= cantidad;
        if (disponibleCapa === 0) {
          indiceCapa += 1;
          disponibleCapa = capas[indiceCapa]?.cantidad ?? 0;
        }
      }
    }
  }
  return salida;
}

async function ejecutarVenta(db: any, contexto: ContextoFinancieroOperativo, raw: unknown) {
  const comando = normalizarComandoVentaRetailNevera(raw);
  return executeConContexto(db, contexto, comando, "registrarVentaRetailNeveraV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    await exigirAutoridadVentaNevera(tx, firestore, contexto);
    const lineas: LineaResueltaNevera[] = [];
    const consumos = new Map<string, { productoId: string; nombre: string; unidad: string; espacioId: string; cantidad: number }>();
    for (const intento of comando.payload.lineas) {
      const productoSnap = await tx.get(firestore.collection("productos").doc(intento.productoId));
      if (!productoSnap.exists || productoSnap.data()?.empresaId !== empresaId) fail("not-found", "PRODUCTO_NO_ENCONTRADO");
      const producto = productoSnap.data() as Record<string, any>;
      if (producto.activo !== true) fail("failed-precondition", "PRODUCTO_INACTIVO");
      if (effectiveCatalogId(producto.catalogoId) !== "NEVERA") fail("failed-precondition", "PRODUCTO_FUERA_CATALOGO_NEVERA");
      if (producto.fifoNeveraEstado !== "LISTO") fail("failed-precondition", "NEVERA_REQUIERE_APERTURA_FIFO");
      const presentacionSnap = await tx.get(firestore.collection("presentaciones_producto").doc(intento.presentacionId));
      if (!presentacionSnap.exists || presentacionSnap.data()?.empresaId !== empresaId || presentacionSnap.data()?.productoId !== intento.productoId) {
        fail("not-found", "PRESENTACION_NO_ENCONTRADA");
      }
      const presentacion = presentacionSnap.data() as Record<string, any>;
      if (presentacion.activo !== true) fail("failed-precondition", "PRESENTACION_INACTIVA");
      if (effectiveCatalogId(presentacion.catalogoId) !== "NEVERA") fail("failed-precondition", "PRESENTACION_FUERA_CATALOGO_NEVERA");
      if (!positiveInteger(presentacion.factorUnidadBase) || !text(presentacion.nombre)) fail("failed-precondition", "PRESENTACION_INVALIDA");
      const factorUnidadBase = presentacion.factorUnidadBase as number;
      const cantidadUnidadBase = intento.cantidad * factorUnidadBase;
      const precioBaseCOP = precioNeveraBase(presentacion);
      const subtotalBase = intento.cantidad * precioBaseCOP;
      if (!Number.isSafeInteger(cantidadUnidadBase) || !Number.isSafeInteger(subtotalBase) || subtotalBase <= 0) fail("failed-precondition", "SUBTOTAL_NEVERA_INVALIDO");
      const unidadBase = producto.unidadMedida ?? producto.unidad;
      if (!text(producto.nombre) || !text(unidadBase) || !text(producto.espacioId)) fail("failed-precondition", "PRODUCTO_NEVERA_INVALIDO");
      lineas.push({
        productoId: intento.productoId,
        productoNombre: producto.nombre.trim(),
        unidadBase: unidadBase.trim(),
        espacioId: producto.espacioId.trim(),
        presentacionId: intento.presentacionId,
        presentacionNombre: presentacion.nombre.trim(),
        cantidadPresentaciones: intento.cantidad,
        factorUnidadBase,
        cantidadUnidadBase,
        precioBaseCOP,
        precioAplicadoCOP: precioBaseCOP,
        ofertaId: null,
        subtotalCOP: subtotalBase,
      });
      const anterior = consumos.get(intento.productoId);
      const cantidad = (anterior?.cantidad ?? 0) + cantidadUnidadBase;
      if (!Number.isSafeInteger(cantidad) || cantidad <= 0) fail("invalid-argument", "CANTIDAD_FIFO_INVALIDA");
      consumos.set(intento.productoId, { productoId: intento.productoId, nombre: producto.nombre.trim(), unidad: unidadBase.trim(), espacioId: producto.espacioId.trim(), cantidad });
    }

    const ofertas = await tx.get(firestore.collection("ofertas_bodega").where("empresaId", "==", empresaId));
    const ahora = Date.now();
    for (const linea of lineas) {
      const precio = resolverPrecioOfertaNevera(ofertas.docs, empresaId, linea.presentacionId, linea.precioBaseCOP, ahora);
      linea.precioAplicadoCOP = precio.precioAplicadoCOP;
      linea.ofertaId = precio.ofertaId;
      linea.subtotalCOP = linea.cantidadPresentaciones * precio.precioAplicadoCOP;
      if (!Number.isSafeInteger(linea.subtotalCOP) || linea.subtotalCOP <= 0) fail("failed-precondition", "SUBTOTAL_NEVERA_INVALIDO");
    }
    const total = lineas.reduce((sum, linea) => sumarSeguro(sum, linea.subtotalCOP, "TOTAL_NEVERA_INVALIDO"), 0);
    if (total <= 0) fail("failed-precondition", "TOTAL_NEVERA_INVALIDO");
    const esEfectivo = comando.payload.metodoPago === "efectivo";
    const montoRecibidoCOP = esEfectivo ? comando.payload.montoRecibidoCOP : undefined;
    if (esEfectivo && (montoRecibidoCOP === undefined || montoRecibidoCOP < total)) fail("failed-precondition", "MONTO_RECIBIDO_INVALIDO");
    const cambioCOP = esEfectivo ? (montoRecibidoCOP as number) - total : 0;
    const cuenta = await resolverCuentaOperativa(tx, firestore, empresaId, esEfectivo ? "caja-principal" : "bancolombia");
    const turnoId = esEfectivo ? await resolverTurnoRecaudoPropioOpcionalEnTransaccion(tx, firestore, empresaId, actorUid) : null;
    const ventaId = crearIdentificadorInterno(empresaId, `venta-nevera:${comando.commandId}`);
    const ventaRef = firestore.collection("ventas").doc(ventaId);
    if ((await tx.get(ventaRef)).exists) fail("already-exists", "COMMAND_ID_CONFLICT");

    const movimientos = await aplicarMovimientosInventarioEnTransaccion(tx, firestore, [...consumos.values()].map(consumo => ({
      empresaId,
      articuloTipo: "producto" as const,
      articuloId: consumo.productoId,
      articuloNombre: consumo.nombre,
      unidad: consumo.unidad,
      tipo: "venta" as const,
      cantidad: -consumo.cantidad,
      costoUnitario: 0,
      espacioId: consumo.espacioId,
      usuarioId: actorUid,
      usuarioNombre: actorUid,
      claveIdempotencia: crearIdentificadorInterno(empresaId, `venta-nevera:${comando.commandId}:${consumo.productoId}`),
      commandId: comando.commandId,
      catalogoId: "NEVERA" as const,
      eventoControlNevera: "ABONO_VENTA" as const,
      referenciaColeccion: "ventas",
      referenciaId: ventaId,
      exigirStockSuficiente: true,
    })));
    const items = repartirCostoFifoPorLinea(lineas, movimientos).map(linea => ({
      productoId: linea.productoId,
      productoNombreSnapshot: linea.productoNombre,
      unidadBaseSnapshot: linea.unidadBase,
      presentacionId: linea.presentacionId,
      presentacionNombreSnapshot: linea.presentacionNombre,
      cantidadPresentaciones: linea.cantidadPresentaciones,
      factorUnidadBase: linea.factorUnidadBase,
      cantidadUnidadBase: linea.cantidadUnidadBase,
      precioBasePresentacionCOP: linea.precioBaseCOP,
      precioPresentacionCOP: linea.precioAplicadoCOP,
      ofertaId: linea.ofertaId,
      subtotalCOP: linea.subtotalCOP,
      costoTotalFIFOCOP: linea.costoTotalFIFOCOP,
      capasConsumidasDetalle: linea.capasConsumidas,
    }));
    const pago = { metodo: comando.payload.metodoPago, ...(esEfectivo ? { montoRecibidoCOP, cambioCOP } : {}) };
    const ingreso = writeMovement(tx, firestore, {
      empresaId,
      command: input,
      key: `venta-nevera:${comando.commandId}:pago`,
      account: cuenta,
      tipo: "ingreso",
      monto: total,
      categoria: "ventas_retail_nevera",
      actorUid,
      rol,
      turnoId,
      ventaId,
    });
    tx.create(ventaRef, {
      id: ventaId,
      empresaId,
      catalogoId: "NEVERA",
      schemaVersion: "BODEGA_MVP1_NEVERA_RETAIL_V1",
      modoOperacion: "NEVERA_RETAIL",
      estado: "pagada",
      estadoOperativo: "COMPLETO",
      cajeroId: actorUid,
      items,
      metodoPago: comando.payload.metodoPago,
      pago,
      turnoId,
      totales: { subtotal: total, impuestos: 0, total },
      commandId: comando.commandId,
      idempotencyKey: comando.idempotencyKey,
      correlationId: comando.correlationId,
      causationId: comando.causationId ?? null,
      fecha: FieldValue.serverTimestamp(),
      efectosOperativosEn: FieldValue.serverTimestamp(),
      costoTotalFIFOCOP: items.reduce((sum, item: any) => sumarSeguro(sum, item.costoTotalFIFOCOP, "COSTO_FIFO_DESBORDADO"), 0),
    });
    return {
      commandId: comando.commandId,
      ventaId,
      estadoOperativo: "COMPLETO",
      catalogoId: "NEVERA",
      total,
      metodoPago: comando.payload.metodoPago,
      ...(esEfectivo ? { montoRecibidoCOP, cambioCOP } : {}),
      movimientoFinancieroId: ingreso.id,
      movimientosInventario: movimientos.map(item => item.id),
      cuentaControlMovimientoIds: movimientos.map(item => crearIdentificadorInterno(empresaId, `control-nevera:${item.id}`)),
      turnoId,
    };
  });
}

export async function ejecutarRegistrarVentaRetailNeveraV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown) {
  return ejecutarVenta(db, contexto, raw);
}

export function crearHashLedgerProductoNevera(productoId: string, stock: number, secuenciaLedger: number, movimientos: readonly MovimientoLedgerNevera[]) {
  return crearHuellaSemantica({ productoId, stock, secuenciaLedger, movimientos });
}

async function leerProductoYMovimientos(tx: any, db: any, empresaId: string, productoId: string) {
  const productoSnap = await tx.get(db.collection("productos").doc(productoId));
  if (!productoSnap.exists || productoSnap.data()?.empresaId !== empresaId || effectiveCatalogId(productoSnap.data()?.catalogoId) !== "NEVERA") {
    fail("not-found", "PRODUCTO_NEVERA_NO_ENCONTRADO");
  }
  const producto = productoSnap.data() as Record<string, any>;
  if (!nonNegativeInteger(producto.stock ?? 0) || !nonNegativeInteger(producto.secuenciaLedger ?? 0)) fail("failed-precondition", "LEDGER_NEVERA_INVALIDO");
  const movimientosSnap = await tx.get(db.collection("movimientos_inventario")
    .where("empresaId", "==", empresaId)
    .where("articuloTipo", "==", "producto")
    .where("articuloId", "==", productoId)
    .orderBy("secuenciaArticulo", "asc"));
  if (movimientosSnap.docs.length > MAX_MOVIMIENTOS_APERTURA_POR_PRODUCTO) fail("resource-exhausted", "NEVERA_APERTURA_REQUIERE_LOTES");
  const movimientos: MovimientoLedgerNevera[] = movimientosSnap.docs.map((snapshot: any) => {
    const data = snapshot.data() as Record<string, any>;
    return { id: snapshot.id, tipo: data.tipo, cantidad: data.cantidad, costoUnitario: data.costoUnitario, secuenciaArticulo: data.secuenciaArticulo, saldoCantidadDespues: data.saldoCantidadDespues };
  });
  const reconstruccion = reconstruirCapasFifoNevera(movimientos, producto.stock ?? 0, { empresaId, productoId });
  if (producto.secuenciaLedger !== movimientos.length) fail("failed-precondition", "SECUENCIA_LEDGER_FIFO_INCONSISTENTE");
  return { productoSnap, producto, movimientos, reconstruccion, ledgerHash: crearHashLedgerProductoNevera(productoId, producto.stock ?? 0, producto.secuenciaLedger ?? 0, movimientos) };
}

async function leerCapasActivasProducto(tx: any, db: any, empresaId: string, productoId: string) {
  const snapshot = await tx.get(db.collection(COLLECTION_LAYER)
    .where("empresaId", "==", empresaId)
    .where("productoId", "==", productoId)
    .where("estado", "==", "ACTIVA")
    .orderBy("secuenciaArticulo", "asc")
    .limit(MAX_CAPAS_FIFO_POR_PRODUCTO + 1));
  if (snapshot.docs.length > MAX_CAPAS_FIFO_POR_PRODUCTO) fail("resource-exhausted", "NEVERA_FIFO_REQUIERE_CONCILIACION");
  return snapshot.docs.map((doc: any) => ({ ref: doc.ref, data: { ...(doc.data() as CapaFifoNevera), id: doc.id } }));
}

function capasActivasCoinciden(esperadas: CapaFifoNevera[], actuales: Array<{ ref: any; data: CapaFifoNevera }>) {
  const esperadasActivas = esperadas.filter(capa => capa.unidadesRestantes > 0).sort((a, b) => a.secuenciaArticulo - b.secuenciaArticulo);
  if (esperadasActivas.length !== actuales.length) return false;
  return esperadasActivas.every((capa, index) => {
    const actual = actuales[index]?.data;
    return actual?.id === idCapaFifoNevera(capa.empresaId, capa.productoId, capa.movimientoOrigenId ?? capa.id)
      && actual.empresaId === capa.empresaId && actual.productoId === capa.productoId && actual.catalogoId === "NEVERA"
      && actual.secuenciaArticulo === capa.secuenciaArticulo && actual.unidadesIniciales === capa.unidadesIniciales
      && actual.unidadesRestantes === capa.unidadesRestantes && actual.costoUnitarioCOP === capa.costoUnitarioCOP;
  });
}

/** Solo lectura: calcula si cada apertura puede reconstruirse y devuelve una huella de aprobación por corte. */
export async function ejecutarPreflightAperturaNeveraV1(db: any, contexto: ContextoFinancieroOperativo, raw?: unknown) {
  if (raw !== undefined && (!object(raw) || Object.keys(raw).length > 0)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  return db.runTransaction(async (tx: any) => {
    await exigirAutoridadAperturaNevera(tx, db, contexto);
    const productosSnap = await tx.get(db.collection("productos").where("empresaId", "==", contexto.empresaId));
    const productos = productosSnap.docs.filter((doc: any) => effectiveCatalogId(doc.data()?.catalogoId) === "NEVERA");
    if (productos.length > 500) fail("resource-exhausted", "NEVERA_PRELIGHT_REQUIERE_PAGINACION");
    const resultado: Array<Record<string, unknown>> = [];
    for (const productoDoc of productos) {
      try {
        const item = await leerProductoYMovimientos(tx, db, contexto.empresaId, productoDoc.id);
        const capasActivas = await leerCapasActivasProducto(tx, db, contexto.empresaId, productoDoc.id);
        const listo = item.producto.fifoNeveraEstado === "LISTO";
        const capasCoinciden = listo && capasActivasCoinciden(item.reconstruccion.capas, capasActivas);
        const capasParciales = !listo && capasActivas.length > 0;
        resultado.push({
          productoId: productoDoc.id,
          nombre: item.producto.nombre,
          stock: item.producto.stock ?? 0,
          movimientos: item.movimientos.length,
          capasEsperadas: item.reconstruccion.capas.filter(capa => capa.unidadesRestantes > 0).length,
          valorExistenciaCOP: item.reconstruccion.valorExistenciaCOP,
          estado: listo ? (capasCoinciden ? "LISTO" : "CAPAS_DIVERGENTES") : capasParciales ? "CAPAS_DIVERGENTES" : "APERTURA_PENDIENTE",
          ledgerHash: item.ledgerHash,
        });
      } catch (error) {
        resultado.push({
          productoId: productoDoc.id,
          nombre: productoDoc.data()?.nombre,
          stock: productoDoc.data()?.stock ?? 0,
          estado: "BLOQUEADO",
          motivo: error instanceof Error && "codigo" in error ? (error as Error & { codigo: string }).codigo : error instanceof HttpsError ? (error.details as any)?.code ?? error.code : "LEDGER_NEVERA_INVALIDO",
        });
      }
    }
    const manifiesto = resultado.map(({ productoId, estado, stock, ledgerHash, motivo, valorExistenciaCOP }) => ({ productoId, estado, stock, ledgerHash: ledgerHash ?? null, motivo: motivo ?? null, valorExistenciaCOP: valorExistenciaCOP ?? null }));
    const listo = resultado.every(item => item.estado === "LISTO");
    const controlSnap = await tx.get(db.collection(COLLECTION_CONTROL).doc(contexto.empresaId));
    const valorControlCOP = controlSnap.exists ? controlSnap.data()?.saldoCOP : 0;
    const valorReconstruidoCOP = resultado.reduce((sum, item) => sum + (typeof item.valorExistenciaCOP === "number" ? item.valorExistenciaCOP : 0), 0);
    return {
      catalogoId: "NEVERA",
      empresaId: contexto.empresaId,
      reconstruible: resultado.every(item => item.estado !== "BLOQUEADO" && item.estado !== "CAPAS_DIVERGENTES"),
      todasLasCapasAbiertas: listo,
      productos: resultado,
      totalProductos: resultado.length,
      saldoControlCOP: nonNegativeInteger(valorControlCOP) ? valorControlCOP : null,
      valorLedgerReconstruidoCOP: Number.isSafeInteger(valorReconstruidoCOP) ? valorReconstruidoCOP : null,
      saldoControlCoincide: listo && nonNegativeInteger(valorControlCOP) && valorControlCOP === valorReconstruidoCOP,
      manifestHash: crearHuellaSemantica(manifiesto),
    };
  });
}

function normalizarComandoApertura(raw: unknown) {
  if (!object(raw) || !object(raw.payload)) fail("invalid-argument", "COMANDO_APERTURA_NEVERA_INVALIDO");
  only(raw, ["commandId", "idempotencyKey", "correlationId", "causationId", "payload", "motivo"], "COMANDO_APERTURA_NEVERA_INVALIDO");
  only(raw.payload, ["productoId", "ledgerHash"], "PAYLOAD_APERTURA_NEVERA_INVALIDO");
  if (raw.causationId !== null && raw.causationId !== undefined && typeof raw.causationId !== "string") fail("invalid-argument", "CAUSATION_ID_INVALIDO");
  if (typeof raw.payload.ledgerHash !== "string" || !/^[a-f0-9]{64}$/.test(raw.payload.ledgerHash)) fail("invalid-argument", "LEDGER_HASH_INVALIDO");
  return {
    commandId: requiredText(raw.commandId, "COMMAND_ID_INVALIDO"),
    idempotencyKey: requiredText(raw.idempotencyKey, "IDEMPOTENCY_KEY_INVALIDA"),
    correlationId: requiredText(raw.correlationId, "CORRELATION_ID_INVALIDO"),
    causationId: typeof raw.causationId === "string" ? raw.causationId : null,
    ...(raw.motivo === undefined ? {} : { motivo: requiredText(raw.motivo, "MOTIVO_INVALIDO", 240) }),
    payload: { productoId: requiredText(raw.payload.productoId, "PRODUCTO_ID_INVALIDO"), ledgerHash: raw.payload.ledgerHash },
  };
}

/** Aplica la apertura por producto; la huella del preflight evita abrir un ledger que haya cambiado. */
export async function ejecutarAbrirProductoNeveraV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown) {
  const comando = normalizarComandoApertura(raw);
  return executeConContexto(db, contexto, comando, "abrirProductoNeveraV1", async (tx, firestore, empresaId, actorUid, rol, input) => {
    await exigirAutoridadAperturaNevera(tx, firestore, contexto);
    const { productoId, ledgerHash } = comando.payload;
    const item = await leerProductoYMovimientos(tx, firestore, empresaId, productoId);
    const actuales = await leerCapasActivasProducto(tx, firestore, empresaId, productoId);
    const aperturaRef = firestore.collection(COLLECTION_CONTROL_EVENTS).doc(crearIdentificadorInterno(empresaId, `apertura-nevera:${productoId}`));
    const aperturaSnap = await tx.get(aperturaRef);
    if (item.producto.fifoNeveraEstado === "LISTO") {
      if (!capasActivasCoinciden(item.reconstruccion.capas, actuales)
        || (item.producto.fifoNeveraAperturaHuella !== undefined
          && (item.producto.fifoNeveraAperturaHuella !== item.ledgerHash
            || (item.reconstruccion.valorExistenciaCOP > 0 && !aperturaSnap.exists)))) {
        fail("failed-precondition", "APERTURA_NEVERA_INCONSISTENTE");
      }
      return { commandId: input.commandId, productoId, estado: "LISTO", idempotente: true, ledgerHash: item.ledgerHash };
    }
    if (item.ledgerHash !== ledgerHash) fail("failed-precondition", "LEDGER_NEVERA_CAMBIO_DESDE_PREFLIGHT");
    if (aperturaSnap.exists || actuales.length > 0) fail("failed-precondition", "APERTURA_NEVERA_PARCIAL_INCONSISTENTE");
    const capasApertura = item.reconstruccion.capas.filter(capa => capa.unidadesRestantes > 0);
    if (capasApertura.length > MAX_CAPAS_FIFO_POR_PRODUCTO || capasApertura.length > 400) fail("resource-exhausted", "NEVERA_APERTURA_REQUIERE_LOTES");
    const refs = capasApertura.map(capa => firestore.collection(COLLECTION_LAYER).doc(idCapaFifoNevera(empresaId, productoId, capa.movimientoOrigenId)));
    const existentes = await Promise.all(refs.map((ref: any) => tx.get(ref)));
    if (existentes.some((snap: any) => snap.exists)) fail("failed-precondition", "APERTURA_NEVERA_PARCIAL_INCONSISTENTE");
    const controlRef = firestore.collection(COLLECTION_CONTROL).doc(empresaId);
    const controlSnap = await tx.get(controlRef);
    const saldoControl = controlSnap.exists ? controlSnap.data()?.saldoCOP : 0;
    if (!nonNegativeInteger(saldoControl)) fail("failed-precondition", "CONTROL_NEVERA_INCONSISTENTE");
    const nuevoSaldo = saldoControl + item.reconstruccion.valorExistenciaCOP;
    if (!Number.isSafeInteger(nuevoSaldo)) fail("failed-precondition", "COSTO_CONTROL_NEVERA_INVALIDO");
    for (let index = 0; index < capasApertura.length; index += 1) {
      const capa = capasApertura[index]!;
      tx.create(refs[index], {
        ...capa,
        id: refs[index]!.id,
        estado: "ACTIVA",
        creadoEn: FieldValue.serverTimestamp(),
        aperturaCommandId: comando.commandId,
      });
    }
    if (item.reconstruccion.valorExistenciaCOP > 0) {
      tx.create(aperturaRef, {
        id: aperturaRef.id,
        schemaVersion: "NEVERA_CONTROL_V1",
        empresaId,
        catalogoId: "NEVERA",
        productoId,
        tipo: "CARGO_APERTURA",
        importeCOP: item.reconstruccion.valorExistenciaCOP,
        saldoDeltaCOP: item.reconstruccion.valorExistenciaCOP,
        actorUid,
        actorNombreSnapshot: actorUid,
        commandId: comando.commandId,
        referenciaColeccion: "movimientos_inventario",
        referenciaId: item.movimientos.at(-1)?.id ?? productoId,
        movimientosFuenteIds: item.movimientos.filter(movimiento => movimiento.cantidad > 0).map(movimiento => movimiento.id),
        detalleCapas: capasApertura.map(capa => ({ capaId: idCapaFifoNevera(empresaId, productoId, capa.movimientoOrigenId), movimientoOrigenId: capa.movimientoOrigenId, secuenciaArticulo: capa.secuenciaArticulo, cantidad: capa.unidadesRestantes, costoUnitarioCOP: capa.costoUnitarioCOP, costoTotalCOP: capa.unidadesRestantes * capa.costoUnitarioCOP })),
        ledgerHash: item.ledgerHash,
        creadoEn: FieldValue.serverTimestamp(),
      });
    }
    const controlData = {
      empresaId,
      catalogoId: "NEVERA",
      schemaVersion: "NEVERA_CONTROL_V1",
      saldoCOP: nuevoSaldo,
      actualizadoEn: FieldValue.serverTimestamp(),
    };
    if (controlSnap.exists) tx.update(controlRef, controlData);
    else tx.create(controlRef, controlData);
    tx.update(item.productoSnap.ref, {
      fifoNeveraEstado: "LISTO",
      fifoNeveraVersion: 1,
      fifoNeveraAperturaHuella: item.ledgerHash,
      fifoNeveraAperturaCommandId: comando.commandId,
      fifoNeveraAperturaEn: FieldValue.serverTimestamp(),
    });
    return {
      commandId: input.commandId,
      productoId,
      estado: "LISTO",
      idempotente: false,
      capasCreadas: capasApertura.length,
      cargoAperturaCOP: item.reconstruccion.valorExistenciaCOP,
      saldoControlCOP: nuevoSaldo,
      ledgerHash: item.ledgerHash,
    };
  });
}

export const registrarVentaRetailNeveraV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarRegistrarVentaRetailNeveraV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const preflightAperturaNeveraV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarPreflightAperturaNeveraV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});

export const abrirProductoNeveraV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarAbrirProductoNeveraV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});
