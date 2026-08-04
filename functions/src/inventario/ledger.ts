import { FieldValue } from "firebase-admin/firestore";

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
  motivo?: string | null;
  actualizarCosto?: boolean;
}

export interface MovimientoInventarioServer extends Omit<MovimientoInventarioParams, "actualizarCosto" | "referenciaColeccion" | "referenciaId" | "motivo"> {
  id: string;
  clase: "entrada" | "salida";
  signo: 1 | -1;
  costoTotal: number;
  saldoCantidadDespues: number;
  saldoValorDespues: null;
  referenciaColeccion: string | null;
  referenciaId: string | null;
  movimientoRelacionadoId: null;
  loteId: null;
  capasConsumidasDetalle: null;
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
  secuenciaActual: number;
  costoApertura: number;
  aperturaRef: any | null;
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
      lote.push({ params, movimientoRef, articuloRef, existente, saldoActual: 0, secuenciaActual: 0, costoApertura: 0, aperturaRef: null });
      continue;
    }

    const articulo = await tx.get(articuloRef);
    if (!articulo.exists || articulo.data()?.empresaId !== params.empresaId) {
      fallo("ARTICULO_NO_ENCONTRADO");
    }
    const data = articulo.data() as Record<string, unknown>;
    if (data.espacioId && data.espacioId !== params.espacioId) fallo("ARTICULO_NO_ENCONTRADO");

    const saldoRaw: unknown = data.stock === undefined ? 0 : data.stock;
    const secuenciaRaw: unknown = data.secuenciaLedger === undefined ? 0 : data.secuenciaLedger;
    const costoRaw: unknown = data.costo === undefined ? 0 : data.costo;
    if (!numeroFinito(saldoRaw)) fallo("ARTICULO_INVENTARIO_INVALIDO");
    if (!secuenciaValida(secuenciaRaw)) fallo("ARTICULO_INVENTARIO_INVALIDO");
    const saldoActual = saldoRaw as number;
    const secuenciaActual = secuenciaRaw as number;

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
      secuenciaActual,
      costoApertura: numeroFinito(costoRaw) && costoRaw >= 0 ? costoRaw : 0,
      aperturaRef,
    });
  }

  const resultado: MovimientoInventarioServer[] = [];
  for (const entrada of lote) {
    if (entrada.existente) {
      resultado.push(entrada.existente);
      continue;
    }

    const { params } = entrada;
    let secuenciaBase = entrada.secuenciaActual;
    if (entrada.aperturaRef) {
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
      costoTotal: Math.abs(params.cantidad) * params.costoUnitario,
      saldoCantidadDespues,
      saldoValorDespues: null,
      referenciaColeccion: params.referenciaColeccion,
      referenciaId: params.referenciaId,
      movimientoRelacionadoId: null,
      loteId: null,
      capasConsumidasDetalle: null,
      fecha: FieldValue.serverTimestamp(),
      secuenciaArticulo,
      motivo: params.motivo ?? null,
    };

    tx.create(entrada.movimientoRef, movimiento);
    const actualizacion: Record<string, unknown> = {
      stock: saldoCantidadDespues,
      secuenciaLedger: secuenciaArticulo,
    };
    if (params.actualizarCosto) actualizacion.costo = params.costoUnitario;
    tx.update(entrada.articuloRef, actualizacion);
    resultado.push(movimiento);
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
