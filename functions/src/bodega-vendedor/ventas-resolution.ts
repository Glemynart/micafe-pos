import { HttpsError } from "firebase-functions/v2/https";
import { resolverComercialBodegaEnTransaccion, type ResolucionComercialBodega } from "./presentaciones";
import { aplicarMovimientosInventarioEnTransaccion, type MovimientoInventarioServer } from "../inventario/ledger";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { revalidarAutoridadVentaBodegaEnTransaccion } from "./ventas-authority";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";
import { normalizarComandoConfirmacionVentaBodega, type ComandoConfirmacionVentaBodega } from "./ventas-contract";

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible resolver la venta Bodega.", { code: domain });
};

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export interface ClienteBodegaCanonico {
  id: string;
  nombre: string;
  cedula: string;
}

export interface LineaComercialBodegaResuelta {
  productoId: string;
  productoNombreSnapshot: string;
  unidadBaseSnapshot: string;
  presentacionId: string;
  presentacionNombreSnapshot: string;
  cantidadPresentaciones: number;
  factorUnidadBase: number;
  cantidadUnidadBase: number;
  precioPresentacionCOP: number;
  subtotalCOP: number;
  costoUnidadBaseCOP: number;
  costoPresentacionCOP: number;
  costoTotalLineaCOP: number;
}

export interface ConsumoInventarioBodega {
  productoId: string;
  productoNombre: string;
  unidadBase: string;
  espacioId: string;
  costoUnidadBaseCOP: number;
  cantidadUnidadBase: number;
}

export interface ResolucionVentaBodega {
  empresaId: string;
  actorUid: string;
  commandId: string;
  idempotencyKey: string;
  cliente: ClienteBodegaCanonico;
  lineas: LineaComercialBodegaResuelta[];
  consumos: ConsumoInventarioBodega[];
}

function productoSeguro(a: number, b: number, code: string): number {
  const result = a * b;
  if (!Number.isSafeInteger(result) || result <= 0) fail("invalid-argument", code);
  return result;
}

function productoNoNegativoSeguro(a: number, b: number, code: string): number {
  const result = a * b;
  if (!Number.isSafeInteger(result) || result < 0) fail("invalid-argument", code);
  return result;
}

function sumaSegura(a: number, b: number, code: string): number {
  const result = a + b;
  if (!Number.isSafeInteger(result) || result <= 0) fail("invalid-argument", code);
  return result;
}

async function resolverClienteBodegaEnTransaccion(tx: any, db: any, empresaId: string, clienteId: string): Promise<ClienteBodegaCanonico> {
  const snap = await tx.get(db.collection("clientes").doc(clienteId));
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "CLIENTE_NO_ENCONTRADO");
  const cliente = snap.data() as Record<string, unknown>;
  if (cliente.activo !== true) fail("failed-precondition", "CLIENTE_INACTIVO");
  return {
    id: snap.id,
    nombre: text(cliente.nombre) ? cliente.nombre.trim() : "",
    cedula: text(cliente.cedula) ? cliente.cedula.trim() : "",
  };
}

function resolverLinea(comercial: ResolucionComercialBodega, cantidadPresentaciones: number): LineaComercialBodegaResuelta {
  const cantidadUnidadBase = productoSeguro(cantidadPresentaciones, comercial.factorUnidadBase, "CANTIDAD_UNIDAD_BASE_INVALIDA");
  const subtotalCOP = productoSeguro(cantidadPresentaciones, comercial.precioCOP, "SUBTOTAL_BODEGA_INVALIDO");
  const costoPresentacionCOP = productoNoNegativoSeguro(comercial.factorUnidadBase, comercial.costoUnidadBaseCOP, "COSTO_PRESENTACION_INVALIDO");
  const costoTotalLineaCOP = productoNoNegativoSeguro(cantidadPresentaciones, costoPresentacionCOP, "COSTO_TOTAL_BODEGA_INVALIDO");
  return {
    productoId: comercial.productoId,
    productoNombreSnapshot: comercial.productoNombre,
    unidadBaseSnapshot: comercial.unidadBase,
    presentacionId: comercial.id,
    presentacionNombreSnapshot: comercial.nombre,
    cantidadPresentaciones,
    factorUnidadBase: comercial.factorUnidadBase,
    cantidadUnidadBase,
    precioPresentacionCOP: comercial.precioCOP,
    subtotalCOP,
    costoUnidadBaseCOP: comercial.costoUnidadBaseCOP,
    costoPresentacionCOP,
    costoTotalLineaCOP,
  };
}

/**
 * Resuelve únicamente hechos canónicos. Debe ejecutarse dentro de la misma
 * transacción idempotente que U3-C abrirá; no crea ventas ni movimientos.
 */
export async function resolverVentaBodegaEnTransaccion(
  tx: any,
  db: any,
  contexto: ContextoFinancieroOperativo,
  comando: ComandoConfirmacionVentaBodega,
): Promise<ResolucionVentaBodega> {
  const comandoCanonico = normalizarComandoConfirmacionVentaBodega(comando);
  await revalidarAutoridadVentaBodegaEnTransaccion(tx, db, contexto);
  const cliente = await resolverClienteBodegaEnTransaccion(tx, db, contexto.empresaId, comandoCanonico.payload.clienteId);
  const lineas: LineaComercialBodegaResuelta[] = [];
  const consumos = new Map<string, ConsumoInventarioBodega>();

  for (const intento of comandoCanonico.payload.lineas) {
    const comercial = await resolverComercialBodegaEnTransaccion(tx, db, contexto.empresaId, {
      productoId: intento.productoId,
      presentacionId: intento.presentacionId,
    });
    const linea = resolverLinea(comercial, intento.cantidad);
    lineas.push(linea);
    const previo = consumos.get(linea.productoId);
    consumos.set(linea.productoId, previo
      ? { ...previo, cantidadUnidadBase: sumaSegura(previo.cantidadUnidadBase, linea.cantidadUnidadBase, "CANTIDAD_UNIDAD_BASE_INVALIDA") }
      : {
        productoId: linea.productoId,
        productoNombre: comercial.productoNombre,
        unidadBase: comercial.unidadBase,
        espacioId: comercial.espacioId,
        costoUnidadBaseCOP: comercial.costoUnidadBaseCOP,
        cantidadUnidadBase: linea.cantidadUnidadBase,
      });
  }

  return {
    empresaId: contexto.empresaId,
    actorUid: contexto.actorUid,
    commandId: comandoCanonico.commandId,
    idempotencyKey: comandoCanonico.idempotencyKey,
    cliente,
    lineas,
    consumos: [...consumos.values()],
  };
}

/**
 * U3-C invocará esta composición después de crear la venta en su misma
 * transacción. El identificador de venta es interno, jamás parte del comando.
 */
export async function aplicarConsumosInventarioBodegaEnTransaccion(
  tx: any,
  db: any,
  resolucion: ResolucionVentaBodega,
  ventaIdInterno: string,
): Promise<MovimientoInventarioServer[]> {
  if (!text(ventaIdInterno) || ventaIdInterno.trim().length > 160) fail("invalid-argument", "VENTA_INTERNA_INVALIDA");
  return aplicarMovimientosInventarioEnTransaccion(tx, db, resolucion.consumos.map(consumo => ({
    empresaId: resolucion.empresaId,
    articuloTipo: "producto",
    articuloId: consumo.productoId,
    articuloNombre: consumo.productoNombre,
    unidad: consumo.unidadBase,
    tipo: "venta",
    cantidad: -consumo.cantidadUnidadBase,
    costoUnitario: consumo.costoUnidadBaseCOP,
    espacioId: consumo.espacioId,
    usuarioId: resolucion.actorUid,
    usuarioNombre: resolucion.actorUid,
    claveIdempotencia: crearIdentificadorInterno(resolucion.empresaId, `venta-bodega:${resolucion.commandId}:${consumo.productoId}`),
    referenciaColeccion: "ventas",
    referenciaId: ventaIdInterno.trim(),
    exigirStockSuficiente: true,
  })));
}
