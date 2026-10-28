import { FieldValue } from "firebase-admin/firestore";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { idCapaFifoNevera, planificarConsumoFifoNevera, type CapaFifoNevera, type ConsumoCapaFifoNevera } from "./nevera-fifo";

const MAX_CAPAS_FIFO_NEVERA_POR_PRODUCTO = 300;

export type ArticuloTipo = "producto" | "insumo";

export type TipoMovimientoInventario =
  | "compra"
  | "venta"
  | "consumo_receta"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma";

export interface MovimientoInventarioParams {
  empresaId: string;
  articuloTipo: ArticuloTipo;
  articuloId: string;
  articuloNombre: string;
  unidad: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  costoUnitario: number;
  espacioId: string;
  usuarioId: string;
  usuarioNombre: string;
  claveIdempotencia: string;
  referenciaColeccion: string;
  referenciaId: string;
  catalogoId?: "BODEGA" | "NEVERA";
  eventoControlNevera?: "ABONO_VENTA" | "AJUSTE_SALIDA";
  commandId?: string;
  motivo?: string | null;
  actualizarCosto?: boolean;
  /** Opt-in para rutas que no admiten stock negativo (Bodega U3). */
  exigirStockSuficiente?: boolean;
  /** Un movimiento de venta vinculado puede consumir el hold en la misma transacción. */
  consumirStockReservado?: number;
  /** Libera un hold vencido de forma atómica con la venta que ya no puede consumirlo. */
  liberarStockReservado?: number;
}

export interface MovimientoInventarioServer extends Omit<MovimientoInventarioParams, "actualizarCosto" | "exigirStockSuficiente" | "referenciaColeccion" | "referenciaId" | "motivo"> {
  id: string;
  clase: "entrada" | "salida";
  signo: 1 | -1;
  costoTotal: number;
  saldoCantidadDespues: number;
  saldoValorDespues: null;
  referenciaColeccion: string | null;
  referenciaId: string | null;
  movimientoRelacionadoId: null;
  loteId: string | null;
  capasConsumidasDetalle: ConsumoCapaFifoNevera[] | null;
  fecha: unknown;
  secuenciaArticulo: number;
  motivo: string | null;
}

export type MovimientoCompraParams = Omit<MovimientoInventarioParams, "tipo" | "actualizarCosto" | "referenciaColeccion"> & {
  referenciaColeccion?: string | null;
};

interface CatalogEntry {
  clase: "entrada" | "salida";
  signo: 1 | -1;
}

const CATALOGO_TIPOS: Record<TipoMovimientoInventario, CatalogEntry> = {
  compra: { clase: "entrada", signo: 1 },
  venta: { clase: "salida", signo: -1 },
  consumo_receta: { clase: "salida", signo: -1 },
  ajuste_positivo: { clase: "entrada", signo: 1 },
  ajuste_negativo: { clase: "salida", signo: -1 },
  merma: { clase: "salida", signo: -1 },
};

const fallo = (codigo: string): never => {
  throw new Error(codigo);
};

const numeroFinito = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const secuenciaValida = (value: unknown): value is number =>
  numeroFinito(value) && Number.isSafeInteger(value) && value >= 0;

function validarMovimiento(params: MovimientoInventarioParams) {
  const catalogo = CATALOGO_TIPOS[params.tipo];
  if (
    !params.empresaId ||
    !params.articuloId ||
    !params.articuloNombre ||
    !params.unidad ||
    !params.espacioId ||
    !params.usuarioId ||
    !params.usuarioNombre ||
    !params.claveIdempotencia ||
    !params.referenciaColeccion ||
    !params.referenciaId
  ) {
    fallo("INVENTARIO_PAYLOAD_INVALIDO");
  }
  if (!numeroFinito(params.cantidad) || params.cantidad === 0 || Math.sign(params.cantidad) !== catalogo.signo) {
    fallo("INVENTARIO_CANTIDAD_INVALIDA");
  }
  const consumoReserva = params.consumirStockReservado ?? 0;
  if (!Number.isSafeInteger(consumoReserva) || consumoReserva < 0) fallo("STOCK_RESERVADO_INVALIDO");
  const liberacionReserva = params.liberarStockReservado ?? 0;
  if (!Number.isSafeInteger(liberacionReserva) || liberacionReserva < 0) fallo("STOCK_RESERVADO_INVALIDO");
  if (consumoReserva > 0 && (params.articuloTipo !== "producto" || params.tipo !== "venta" || params.cantidad >= 0 || consumoReserva !== Math.abs(params.cantidad))) {
    fallo("STOCK_RESERVADO_INVALIDO");
  }
  if (liberacionReserva > 0 && (params.articuloTipo !== "producto" || params.tipo !== "venta" || params.cantidad >= 0 || consumoReserva > 0)) {
    fallo("STOCK_RESERVADO_INVALIDO");
  }
  if (!numeroFinito(params.costoUnitario) || params.costoUnitario < 0) {
    fallo("INVENTARIO_COSTO_INVALIDO");
  }
}

function validarCompra(params: MovimientoInventarioParams) {
  if (!Number.isSafeInteger(params.cantidad) || params.cantidad <= 0) fallo("COMPRA_CANTIDAD_INVALIDA");
  if (!Number.isSafeInteger(params.costoUnitario) || params.costoUnitario <= 0) fallo("COMPRA_COSTO_INVALIDO");
}

interface EntradaPendiente {
  params: MovimientoInventarioParams;
  movimientoRef: any;
  articuloRef: any;
  existente: MovimientoInventarioServer | null;
  saldoActual: number;
  stockReservado: number;
  secuenciaActual: number;
  costoApertura: number;
  aperturaRef: any | null;
  capasFifo: Array<{ ref: any; data: CapaFifoNevera }>;
  consumoFifo: ConsumoCapaFifoNevera[];
  costoTotalFifo: number | null;
  nuevaCapaRef: any | null;
  habilitarFifoNevera: boolean;
}

/**
 * Emite movimientos de inventario canónicos dentro de la transacción de su
 * operación de dominio. La función concentra únicamente la primitiva del
 * ledger: no decide qué operación de negocio se está ejecutando.
 *
 * Todas las lecturas (idempotencia, artículo y apertura lazy) preceden a las
 * escrituras. La apertura inicial, el movimiento, stock y secuencia quedan
 * co-atómicos. Los reintentos existentes no escriben ni consumen secuencia.
 */
export async function aplicarMovimientosInventarioEnTransaccion(
  tx: any,
  db: any,
  paramsArray: MovimientoInventarioParams[],
): Promise<MovimientoInventarioServer[]> {
  const claves = new Set<string>();
  const articulos = new Set<string>();
  for (const params of paramsArray) {
    validarMovimiento(params);
    if (params.tipo === "compra") validarCompra(params);
    if (claves.has(params.claveIdempotencia)) fallo("INVENTARIO_MOVIMIENTO_DUPLICADO");
    claves.add(params.claveIdempotencia);
    const articuloKey = `${params.articuloTipo}:${params.articuloId}`;
    if (articulos.has(articuloKey)) fallo("INVENTARIO_ARTICULO_DUPLICADO");
    articulos.add(articuloKey);
  }

  const lote: EntradaPendiente[] = [];
  for (const params of paramsArray) {
    const coleccion = params.articuloTipo === "producto" ? "productos" : "insumos";
    const movimientoRef = db.collection("movimientos_inventario").doc(params.claveIdempotencia);
    const articuloRef = db.collection(coleccion).doc(params.articuloId);
    const movimiento = await tx.get(movimientoRef);

    if (movimiento.exists) {
      const existente = movimiento.data() as MovimientoInventarioServer;
      if (
        existente.empresaId !== params.empresaId ||
        existente.referenciaId !== params.referenciaId ||
        existente.tipo !== params.tipo
      ) {
        fallo("INVENTARIO_MOVIMIENTO_INCONSISTENTE");
      }
      lote.push({ params, movimientoRef, articuloRef, existente, saldoActual: 0, stockReservado: 0, secuenciaActual: 0, costoApertura: 0, aperturaRef: null, capasFifo: [], consumoFifo: [], costoTotalFifo: null, nuevaCapaRef: null, habilitarFifoNevera: false });
      continue;
    }

    const articulo = await tx.get(articuloRef);
    if (!articulo.exists || articulo.data()?.empresaId !== params.empresaId) {
      fallo("ARTICULO_NO_ENCONTRADO");
    }
    const data = articulo.data() as Record<string, unknown>;
    if (data.espacioId && data.espacioId !== params.espacioId) fallo("ARTICULO_NO_ENCONTRADO");

    const saldoRaw: unknown = data.stock === undefined ? 0 : data.stock;
    const stockReservadoRaw: unknown = params.articuloTipo === "producto" && data.stockReservado !== undefined ? data.stockReservado : 0;
    const secuenciaRaw: unknown = data.secuenciaLedger === undefined ? 0 : data.secuenciaLedger;
    const costoRaw: unknown = data.costo === undefined ? 0 : data.costo;
    if (!numeroFinito(saldoRaw)) fallo("ARTICULO_INVENTARIO_INVALIDO");
    if (params.articuloTipo === "producto" && (!Number.isSafeInteger(stockReservadoRaw) || (stockReservadoRaw as number) < 0 || (stockReservadoRaw as number) > (saldoRaw as number))) {
      fallo("STOCK_RESERVADO_INVALIDO");
    }
    if (!secuenciaValida(secuenciaRaw)) fallo("ARTICULO_INVENTARIO_INVALIDO");
    const saldoActual = saldoRaw as number;
    const stockReservado = stockReservadoRaw as number;
    const secuenciaActual = secuenciaRaw as number;
    let capasFifo: Array<{ ref: any; data: CapaFifoNevera }> = [];
    let consumoFifo: ConsumoCapaFifoNevera[] = [];
    let costoTotalFifo: number | null = null;
    let nuevaCapaRef: any | null = null;
    let habilitarFifoNevera = false;
    if (params.catalogoId === "NEVERA") {
      if (params.articuloTipo !== "producto" || data.catalogoId !== "NEVERA") fallo("CATALOGO_NEVERA_INVALIDO");
      if (!Number.isSafeInteger(params.cantidad)) fallo("CANTIDAD_FIFO_INVALIDA");
      if (params.cantidad > 0 && (!Number.isSafeInteger(params.costoUnitario) || params.costoUnitario <= 0)) fallo("COSTO_ENTRADA_FIFO_INVALIDO");
      if (secuenciaActual === 0 && saldoActual > 0) fallo("NEVERA_REQUIERE_APERTURA_FIFO");
      const query = db.collection("capas_fifo_nevera")
        .where("empresaId", "==", params.empresaId)
        .where("productoId", "==", params.articuloId)
        .where("estado", "==", "ACTIVA")
        .orderBy("secuenciaArticulo", "asc")
        .limit(MAX_CAPAS_FIFO_NEVERA_POR_PRODUCTO + 1);
      const capasSnapshot = await tx.get(query);
      if (capasSnapshot.docs.length > MAX_CAPAS_FIFO_NEVERA_POR_PRODUCTO) fallo("NEVERA_FIFO_REQUIERE_CONCILIACION");
      capasFifo = capasSnapshot.docs.map((snapshot: any) => ({ ref: snapshot.ref, data: { ...(snapshot.data() as CapaFifoNevera), id: snapshot.id } }));
      const unidadesFifo = capasFifo.reduce((sum, capa) => sum + capa.data.unidadesRestantes, 0);
      if (!Number.isSafeInteger(unidadesFifo)) fallo("NEVERA_FIFO_REQUIERE_CONCILIACION");
      const estadoFifo = data.fifoNeveraEstado;
      const aperturaInicialVacia = estadoFifo !== "LISTO" && secuenciaActual === 0 && saldoActual === 0 && unidadesFifo === 0 && params.cantidad > 0;
      if (!aperturaInicialVacia && (estadoFifo !== "LISTO" || unidadesFifo !== saldoActual)) fallo("NEVERA_REQUIERE_APERTURA_FIFO");
      habilitarFifoNevera = aperturaInicialVacia;
      if (params.cantidad < 0) {
        try {
          const plan = planificarConsumoFifoNevera(capasFifo.map(capa => capa.data), Math.abs(params.cantidad));
          consumoFifo = plan.consumos;
          costoTotalFifo = plan.costoTotalCOP;
        } catch (error) {
          if (error instanceof Error && "codigo" in error) fallo((error as Error & { codigo: string }).codigo);
          throw error;
        }
      } else {
        costoTotalFifo = params.cantidad * params.costoUnitario;
        if (!Number.isSafeInteger(costoTotalFifo)) fallo("COSTO_FIFO_DESBORDADO");
        nuevaCapaRef = db.collection("capas_fifo_nevera").doc(idCapaFifoNevera(params.empresaId, params.articuloId, movimientoRef.id));
        if ((await tx.get(nuevaCapaRef)).exists) fallo("NEVERA_FIFO_REQUIERE_CONCILIACION");
      }
    }
    const consumoReserva = params.consumirStockReservado ?? 0;
    const liberacionReserva = params.liberarStockReservado ?? 0;
    if (consumoReserva + liberacionReserva > stockReservado) fallo("STOCK_RESERVADO_INSUFICIENTE");
    if (params.exigirStockSuficiente) {
      if (!Number.isSafeInteger(saldoActual) || saldoActual < 0 || !Number.isSafeInteger(params.cantidad)) {
        fallo("STOCK_BODEGA_INVALIDO");
      }
      if (saldoActual + params.cantidad < 0) fallo("STOCK_INSUFICIENTE");
    }
    const reservaRestante = stockReservado - consumoReserva - liberacionReserva;
    if (params.articuloTipo === "producto" && params.cantidad < 0 && reservaRestante > 0
      && saldoActual + params.cantidad < reservaRestante) {
      fallo("STOCK_DISPONIBLE_INSUFICIENTE");
    }

    const aperturaRef = secuenciaActual === 0 && saldoActual > 0
      ? db.collection("movimientos_inventario").doc(`inventario_inicial:${params.articuloTipo}:${params.articuloId}`)
      : null;
    if (aperturaRef && (await tx.get(aperturaRef)).exists) fallo("ARTICULO_LEDGER_INCONSISTENTE");

    lote.push({
      params,
      movimientoRef,
      articuloRef,
      existente: null,
      saldoActual,
      stockReservado,
      secuenciaActual,
      costoApertura: numeroFinito(costoRaw) && costoRaw >= 0 ? costoRaw : 0,
      aperturaRef,
      capasFifo,
      consumoFifo,
      costoTotalFifo,
      nuevaCapaRef,
      habilitarFifoNevera,
    });
  }

  const deltasControlPrevistos = new Map<string, number>();
  for (const entrada of lote) {
    if (entrada.existente || entrada.params.catalogoId !== "NEVERA") continue;
    const importe = entrada.costoTotalFifo;
    if (importe === null || !Number.isSafeInteger(importe) || importe <= 0) fallo("COSTO_CONTROL_NEVERA_INVALIDO");
    const importeCOP = importe as number;
    const delta: number = entrada.params.cantidad > 0 ? importeCOP : -importeCOP;
    deltasControlPrevistos.set(entrada.params.empresaId, (deltasControlPrevistos.get(entrada.params.empresaId) ?? 0) + delta);
  }
  const cuentasControl = new Map<string, { ref: any; existe: boolean; saldo: number; delta: number }>();
  for (const [empresaId, delta] of deltasControlPrevistos) {
    if (!Number.isSafeInteger(delta)) fallo("COSTO_CONTROL_NEVERA_INVALIDO");
    const cuentaSnap = await tx.get(db.collection("cuentas_control_nevera").doc(empresaId));
    const saldo = cuentaSnap.exists ? cuentaSnap.data()?.saldoCOP : 0;
    if (!Number.isSafeInteger(saldo) || (saldo as number) < 0) fallo("CONTROL_NEVERA_INCONSISTENTE");
    if (delta < 0 && !cuentaSnap.exists) fallo("CONTROL_NEVERA_INCONSISTENTE");
    if (!Number.isSafeInteger((saldo as number) + delta) || (saldo as number) + delta < 0) fallo("SALDO_CONTROL_NEVERA_INSUFICIENTE");
    cuentasControl.set(empresaId, { ref: db.collection("cuentas_control_nevera").doc(empresaId), existe: cuentaSnap.exists, saldo: saldo as number, delta });
  }

  const resultado: MovimientoInventarioServer[] = [];
  for (const entrada of lote) {
    if (entrada.existente) {
      resultado.push(entrada.existente);
      continue;
    }

    const { params } = entrada;
    let secuenciaBase = entrada.secuenciaActual;
    if (entrada.aperturaRef && params.catalogoId !== "NEVERA") {
      secuenciaBase += 1;
      const apertura = {
        id: entrada.aperturaRef.id,
        empresaId: params.empresaId,
        espacioId: params.espacioId,
        articuloTipo: params.articuloTipo,
        articuloId: params.articuloId,
        articuloNombre: params.articuloNombre,
        unidad: params.unidad,
        tipo: "inventario_inicial",
        clase: "entrada",
        signo: 1,
        cantidad: entrada.saldoActual,
        costoUnitario: entrada.costoApertura,
        costoTotal: entrada.saldoActual * entrada.costoApertura,
        saldoCantidadDespues: entrada.saldoActual,
        saldoValorDespues: null,
        referenciaColeccion: null,
        referenciaId: null,
        movimientoRelacionadoId: null,
        loteId: null,
        capasConsumidasDetalle: null,
        usuarioId: params.usuarioId,
        usuarioNombre: params.usuarioNombre,
        fecha: FieldValue.serverTimestamp(),
        secuenciaArticulo: secuenciaBase,
        claveIdempotencia: entrada.aperturaRef.id,
        motivo: "apertura_lazy",
      };
      tx.create(entrada.aperturaRef, apertura);
    }

    const secuenciaArticulo = secuenciaBase + 1;
    const saldoCantidadDespues = entrada.saldoActual + params.cantidad;
    const catalogo = CATALOGO_TIPOS[params.tipo];
    const movimiento: MovimientoInventarioServer = {
      id: params.claveIdempotencia,
      empresaId: params.empresaId,
      espacioId: params.espacioId,
      articuloTipo: params.articuloTipo,
      articuloId: params.articuloId,
      articuloNombre: params.articuloNombre,
      unidad: params.unidad,
      tipo: params.tipo,
      cantidad: params.cantidad,
      costoUnitario: params.costoUnitario,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      claveIdempotencia: params.claveIdempotencia,
      clase: catalogo.clase,
      signo: catalogo.signo,
      costoTotal: entrada.costoTotalFifo ?? Math.abs(params.cantidad) * params.costoUnitario,
      saldoCantidadDespues,
      saldoValorDespues: null,
      referenciaColeccion: params.referenciaColeccion,
      referenciaId: params.referenciaId,
      movimientoRelacionadoId: null,
      loteId: params.catalogoId === "NEVERA" && params.cantidad > 0 ? entrada.nuevaCapaRef?.id ?? null : null,
      capasConsumidasDetalle: params.catalogoId === "NEVERA" && params.cantidad < 0 ? entrada.consumoFifo : null,
      fecha: FieldValue.serverTimestamp(),
      secuenciaArticulo,
      motivo: params.motivo ?? null,
      ...(params.catalogoId ? { catalogoId: params.catalogoId } : {}),
    };

    if (params.catalogoId === "NEVERA") {
      if (params.cantidad > 0 && entrada.nuevaCapaRef) {
        tx.create(entrada.nuevaCapaRef, {
          id: entrada.nuevaCapaRef.id,
          empresaId: params.empresaId,
          catalogoId: "NEVERA",
          productoId: params.articuloId,
          movimientoOrigenId: movimiento.id,
          secuenciaArticulo,
          unidadesIniciales: params.cantidad,
          unidadesRestantes: params.cantidad,
          costoUnitarioCOP: params.costoUnitario,
          estado: "ACTIVA",
          creadoEn: FieldValue.serverTimestamp(),
        });
      } else if (params.cantidad < 0) {
        const consumoPorId = new Map(entrada.consumoFifo.map(item => [item.capaId, item]));
        for (const capa of entrada.capasFifo) {
          const consumo = consumoPorId.get(capa.data.id);
          if (!consumo) continue;
          tx.update(capa.ref, {
            unidadesRestantes: consumo.unidadesRestantes,
            estado: consumo.unidadesRestantes === 0 ? "AGOTADA" : "ACTIVA",
            actualizadoEn: FieldValue.serverTimestamp(),
          });
        }
      }
      const importeCOP = entrada.costoTotalFifo;
      if (importeCOP === null || !Number.isSafeInteger(importeCOP) || importeCOP <= 0) fallo("COSTO_CONTROL_NEVERA_INVALIDO");
      const importeControlCOP = importeCOP as number;
      const esCargo = params.cantidad > 0;
      const tipoControl = esCargo ? "CARGO_ENTRADA" : (params.eventoControlNevera ?? (params.tipo === "venta" ? "ABONO_VENTA" : "AJUSTE_SALIDA"));
      if (!esCargo && tipoControl !== "ABONO_VENTA" && tipoControl !== "AJUSTE_SALIDA") fallo("EVENTO_CONTROL_NEVERA_INVALIDO");
      const controlId = crearIdentificadorInterno(params.empresaId, `control-nevera:${movimiento.id}`);
      tx.create(db.collection("cuentas_control_nevera_movimientos").doc(controlId), {
        id: controlId,
        schemaVersion: "NEVERA_CONTROL_V1",
        empresaId: params.empresaId,
        catalogoId: "NEVERA",
        tipo: tipoControl,
        importeCOP: importeControlCOP,
        saldoDeltaCOP: esCargo ? importeControlCOP : -importeControlCOP,
        actorUid: params.usuarioId,
        actorNombreSnapshot: params.usuarioNombre,
        commandId: params.commandId ?? params.claveIdempotencia,
        movimientoId: movimiento.id,
        referenciaColeccion: params.referenciaColeccion,
        referenciaId: params.referenciaId,
        detalleCapas: params.cantidad < 0 ? entrada.consumoFifo : [{ capaId: entrada.nuevaCapaRef?.id ?? movimiento.id, secuenciaArticulo, cantidad: params.cantidad, costoUnitarioCOP: params.costoUnitario, costoTotalCOP: importeControlCOP }],
        motivo: params.motivo ?? null,
        creadoEn: FieldValue.serverTimestamp(),
      });
    }

    tx.create(entrada.movimientoRef, movimiento);
    const actualizacion: Record<string, unknown> = {
      stock: saldoCantidadDespues,
      secuenciaLedger: secuenciaArticulo,
    };
    const cambioReserva = (params.consumirStockReservado ?? 0) + (params.liberarStockReservado ?? 0);
    if (cambioReserva > 0) {
      actualizacion.stockReservado = entrada.stockReservado - cambioReserva;
    }
    if (params.actualizarCosto) actualizacion.costo = params.costoUnitario;
    if (entrada.habilitarFifoNevera) {
      actualizacion.fifoNeveraEstado = "LISTO";
      actualizacion.fifoNeveraVersion = 1;
    }
    tx.update(entrada.articuloRef, actualizacion);
    resultado.push(movimiento);
  }

  for (const [empresaId, cuenta] of cuentasControl) {
    const data = {
      empresaId,
      catalogoId: "NEVERA",
      schemaVersion: "NEVERA_CONTROL_V1",
      saldoCOP: cuenta.saldo + cuenta.delta,
      actualizadoEn: FieldValue.serverTimestamp(),
    };
    if (cuenta.existe) tx.update(cuenta.ref, data);
    else tx.create(cuenta.ref, data);
  }

  return resultado;
}

/** Adaptador explícito para la autoridad de compras. Conserva las validaciones
 * y el contrato de P0-12, pero comparte la misma primitiva canónica con venta,
 * ajustes y mermas. */
export async function aplicarMovimientosCompraEnTransaccion(
  tx: any,
  db: any,
  paramsArray: MovimientoCompraParams[],
): Promise<MovimientoInventarioServer[]> {
  const articulos = new Set<string>();
  for (const item of paramsArray) {
    const articuloKey = `${item.articuloTipo}:${item.articuloId}`;
    if (articulos.has(articuloKey)) fallo("COMPRA_ARTICULO_DUPLICADO");
    articulos.add(articuloKey);
  }
  const params: MovimientoInventarioParams[] = paramsArray.map(item => ({
    ...item,
    tipo: "compra",
    referenciaColeccion: item.referenciaColeccion ?? "compras",
    actualizarCosto: true,
  }));
  return aplicarMovimientosInventarioEnTransaccion(tx, db, params);
}
