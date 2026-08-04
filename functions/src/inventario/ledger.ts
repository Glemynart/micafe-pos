import { FieldValue } from "firebase-admin/firestore";

export type ArticuloTipo = "producto" | "insumo";

export interface MovimientoCompraParams {
  empresaId: string;
  articuloTipo: ArticuloTipo;
  articuloId: string;
  articuloNombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  espacioId: string;
  usuarioId: string;
  usuarioNombre: string;
  claveIdempotencia: string;
  referenciaId: string;
  motivo?: string | null;
}

interface MovimientoCompra {
  id: string;
  empresaId: string;
  espacioId: string;
  articuloTipo: ArticuloTipo;
  articuloId: string;
  articuloNombre: string;
  unidad: string;
  tipo: "compra" | "inventario_inicial";
  clase: "entrada";
  signo: 1;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoCantidadDespues: number;
  saldoValorDespues: null;
  referenciaColeccion: string | null;
  referenciaId: string | null;
  movimientoRelacionadoId: null;
  loteId: null;
  capasConsumidasDetalle: null;
  usuarioId: string;
  usuarioNombre: string;
  fecha: unknown;
  secuenciaArticulo: number;
  claveIdempotencia: string;
  motivo: string | null;
}

const fallo = (codigo: string): never => {
  throw new Error(codigo);
};

const numeroValido = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value);

function validarParams(params: MovimientoCompraParams) {
  if (!params.empresaId || !params.articuloId || !params.espacioId || !params.usuarioId || !params.claveIdempotencia) {
    fallo("COMPRA_PAYLOAD_INVALIDO");
  }
  if (!numeroValido(params.cantidad) || params.cantidad <= 0) fallo("COMPRA_CANTIDAD_INVALIDA");
  if (!numeroValido(params.costoUnitario) || params.costoUnitario <= 0) fallo("COMPRA_COSTO_INVALIDO");
  if (!params.articuloNombre || !params.unidad || !params.referenciaId) fallo("COMPRA_SNAPSHOT_INVALIDO");
}

/**
 * Ledger server-side para entradas de compra. Todas las lecturas se completan
 * antes de la primera escritura, y el documento del movimiento es la clave de
 * idempotencia del efecto sobre inventario.
 */
export async function aplicarMovimientosCompraEnTransaccion(
  tx: any,
  db: any,
  paramsArray: MovimientoCompraParams[],
): Promise<MovimientoCompra[]> {
  const claves = new Set<string>();
  const articulos = new Set<string>();
  for (const params of paramsArray) {
    validarParams(params);
    if (claves.has(params.claveIdempotencia)) fallo("COMPRA_MOVIMIENTO_DUPLICADO");
    claves.add(params.claveIdempotencia);
    const articuloKey = `${params.articuloTipo}:${params.articuloId}`;
    if (articulos.has(articuloKey)) fallo("COMPRA_ARTICULO_DUPLICADO");
    articulos.add(articuloKey);
  }

  const lote: Array<{
    params: MovimientoCompraParams;
    movimientoRef: any;
    articuloRef: any;
    existente: MovimientoCompra | null;
    saldoActual: number;
    secuenciaActual: number;
    costoApertura: number;
    aperturaRef: any;
    aperturaExiste: boolean;
  }> = [];

  for (const params of paramsArray) {
    const articuloColeccion = params.articuloTipo === "producto" ? "productos" : "insumos";
    const movimientoRef = db.collection("movimientos_inventario").doc(params.claveIdempotencia);
    const articuloRef = db.collection(articuloColeccion).doc(params.articuloId);
    const movimiento = await tx.get(movimientoRef);
    if (movimiento.exists) {
      const existente = movimiento.data() as MovimientoCompra;
      if (existente.empresaId !== params.empresaId || existente.referenciaId !== params.referenciaId || existente.tipo !== "compra") {
        fallo("COMPRA_MOVIMIENTO_INCONSISTENTE");
      }
      lote.push({ params, movimientoRef, articuloRef, existente, saldoActual: 0, secuenciaActual: 0, costoApertura: 0, aperturaRef: null, aperturaExiste: false });
      continue;
    }

    const articulo = await tx.get(articuloRef);
    if (!articulo.exists || articulo.data()?.empresaId !== params.empresaId || (articulo.data()?.espacioId && articulo.data()?.espacioId !== params.espacioId)) {
      fallo("ARTICULO_NO_ENCONTRADO");
    }
    const data = articulo.data() as Record<string, unknown>;
    const saldoActual = typeof data.stock === "number" ? data.stock : 0;
    const secuenciaActual = typeof data.secuenciaLedger === "number" ? data.secuenciaLedger : 0;
    if (!numeroValido(saldoActual) || saldoActual < 0 || !numeroValido(secuenciaActual) || secuenciaActual < 0) {
      fallo("ARTICULO_INVENTARIO_INVALIDO");
    }
    const necesitaApertura = secuenciaActual === 0 && saldoActual > 0;
    const aperturaRef = necesitaApertura
      ? db.collection("movimientos_inventario").doc(`inventario_inicial:${params.articuloTipo}:${params.articuloId}`)
      : null;
    const aperturaExiste = aperturaRef ? (await tx.get(aperturaRef)).exists : false;
    if (aperturaExiste) fallo("ARTICULO_LEDGER_INCONSISTENTE");
    lote.push({
      params,
      movimientoRef,
      articuloRef,
      existente: null,
      saldoActual,
      secuenciaActual,
      costoApertura: data.costo === undefined ? 0 : data.costo as number,
      aperturaRef,
      aperturaExiste,
    });
  }

  const resultado: MovimientoCompra[] = [];
  for (const entrada of lote) {
    if (entrada.existente) {
      resultado.push(entrada.existente);
      continue;
    }
    const { params } = entrada;
    let secuenciaBase = entrada.secuenciaActual;
    if (entrada.aperturaRef) {
      secuenciaBase += 1;
      const apertura: MovimientoCompra = {
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
    const movimiento: MovimientoCompra = {
      id: params.claveIdempotencia,
      empresaId: params.empresaId,
      espacioId: params.espacioId,
      articuloTipo: params.articuloTipo,
      articuloId: params.articuloId,
      articuloNombre: params.articuloNombre,
      unidad: params.unidad,
      tipo: "compra",
      clase: "entrada",
      signo: 1,
      cantidad: params.cantidad,
      costoUnitario: params.costoUnitario,
      costoTotal: params.cantidad * params.costoUnitario,
      saldoCantidadDespues,
      saldoValorDespues: null,
      referenciaColeccion: "compras",
      referenciaId: params.referenciaId,
      movimientoRelacionadoId: null,
      loteId: null,
      capasConsumidasDetalle: null,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      fecha: FieldValue.serverTimestamp(),
      secuenciaArticulo,
      claveIdempotencia: params.claveIdempotencia,
      motivo: params.motivo ?? null,
    };
    tx.create(entrada.movimientoRef, movimiento);
    tx.update(entrada.articuloRef, { stock: saldoCantidadDespues, secuenciaLedger: secuenciaArticulo, costo: params.costoUnitario });
    resultado.push(movimiento);
  }
  return resultado;
}
