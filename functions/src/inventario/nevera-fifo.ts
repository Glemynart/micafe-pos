import { crearIdentificadorInterno } from "../turnos/identificadores";

export interface CapaFifoNevera {
  id: string;
  movimientoOrigenId?: string;
  empresaId: string;
  productoId: string;
  catalogoId: "NEVERA";
  secuenciaArticulo: number;
  unidadesIniciales: number;
  unidadesRestantes: number;
  costoUnitarioCOP: number;
}

export interface ConsumoCapaFifoNevera {
  capaId: string;
  secuenciaArticulo: number;
  cantidad: number;
  costoUnitarioCOP: number;
  costoTotalCOP: number;
  unidadesRestantes: number;
}

export interface MovimientoLedgerNevera {
  id: string;
  tipo: string;
  cantidad: number;
  costoUnitario: number;
  secuenciaArticulo: number;
  saldoCantidadDespues: number;
}

export interface ReconstruccionFifoNevera {
  capas: Array<CapaFifoNevera & { movimientoOrigenId: string }>;
  saldoReconstruido: number;
  valorExistenciaCOP: number;
  movimientos: number;
}

export class ErrorFifoNevera extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "ErrorFifoNevera";
  }
}

export function idCapaFifoNevera(empresaId: string, productoId: string, movimientoId: string) {
  return crearIdentificadorInterno(empresaId, `fifo-nevera:${productoId}:${movimientoId}`);
}

const enteroSeguro = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function sumarSeguro(a: number, b: number, code: string) {
  const total = a + b;
  if (!Number.isSafeInteger(total) || total < 0) throw new ErrorFifoNevera(code);
  return total;
}

/**
 * Planifica una salida FIFO sin mutar entradas. El llamador persiste todas las
 * reducciones de capa junto al movimiento de inventario en una sola transacción.
 */
export function planificarConsumoFifoNevera(
  capas: readonly CapaFifoNevera[],
  cantidad: number,
): { consumos: ConsumoCapaFifoNevera[]; costoTotalCOP: number } {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) throw new ErrorFifoNevera("CANTIDAD_FIFO_INVALIDA");
  const ordenadas = [...capas].sort((a, b) => a.secuenciaArticulo - b.secuenciaArticulo || a.id.localeCompare(b.id));
  const secuencias = new Set<number>();
  for (const capa of ordenadas) {
    if (capa.catalogoId !== "NEVERA" || !capa.empresaId || !capa.productoId
      || !Number.isSafeInteger(capa.secuenciaArticulo) || capa.secuenciaArticulo < 1
      || !Number.isSafeInteger(capa.unidadesIniciales) || capa.unidadesIniciales <= 0
      || !enteroSeguro(capa.unidadesRestantes) || capa.unidadesRestantes <= 0
      || capa.unidadesRestantes > capa.unidadesIniciales
      || !Number.isSafeInteger(capa.costoUnitarioCOP) || capa.costoUnitarioCOP <= 0
      || !capa.id) throw new ErrorFifoNevera("CAPA_FIFO_INVALIDA");
    if (secuencias.has(capa.secuenciaArticulo)) throw new ErrorFifoNevera("SECUENCIA_FIFO_DUPLICADA");
    secuencias.add(capa.secuenciaArticulo);
  }

  let pendiente = cantidad;
  let costoTotalCOP = 0;
  const consumos: ConsumoCapaFifoNevera[] = [];
  for (const capa of ordenadas) {
    if (pendiente === 0) break;
    const consumido = Math.min(pendiente, capa.unidadesRestantes);
    const costoTotalCapaCOP = consumido * capa.costoUnitarioCOP;
    if (!Number.isSafeInteger(costoTotalCapaCOP)) throw new ErrorFifoNevera("COSTO_FIFO_DESBORDADO");
    costoTotalCOP = sumarSeguro(costoTotalCOP, costoTotalCapaCOP, "COSTO_FIFO_DESBORDADO");
    pendiente -= consumido;
    consumos.push({
      capaId: capa.id,
      secuenciaArticulo: capa.secuenciaArticulo,
      cantidad: consumido,
      costoUnitarioCOP: capa.costoUnitarioCOP,
      costoTotalCOP: costoTotalCapaCOP,
      unidadesRestantes: capa.unidadesRestantes - consumido,
    });
  }
  if (pendiente > 0) throw new ErrorFifoNevera("STOCK_FIFO_INSUFICIENTE");
  return { consumos, costoTotalCOP };
}

/**
 * Reconstruye el saldo y la composición FIFO desde el ledger completo. Rechaza
 * huecos, duplicados, costos inválidos y saldos intermedios que no coincidan.
 */
export function reconstruirCapasFifoNevera(
  movimientos: readonly MovimientoLedgerNevera[],
  stockActual: number,
  identidad: { empresaId: string; productoId: string },
): ReconstruccionFifoNevera {
  if (!enteroSeguro(stockActual) || !identidad.empresaId || !identidad.productoId) {
    throw new ErrorFifoNevera("APERTURA_FIFO_IDENTIDAD_INVALIDA");
  }
  const ordenados = [...movimientos].sort((a, b) => a.secuenciaArticulo - b.secuenciaArticulo || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  const capas: Array<CapaFifoNevera & { movimientoOrigenId: string }> = [];
  let saldo = 0;
  for (let index = 0; index < ordenados.length; index += 1) {
    const movimiento = ordenados[index]!;
    if (!movimiento.id || ids.has(movimiento.id)) throw new ErrorFifoNevera("MOVIMIENTO_FIFO_DUPLICADO");
    ids.add(movimiento.id);
    if (!Number.isSafeInteger(movimiento.secuenciaArticulo) || movimiento.secuenciaArticulo !== index + 1
      || !Number.isSafeInteger(movimiento.cantidad) || movimiento.cantidad === 0
      || !enteroSeguro(movimiento.saldoCantidadDespues)) throw new ErrorFifoNevera("SECUENCIA_LEDGER_FIFO_INCOMPLETA");
    if (movimiento.cantidad > 0) {
      if (!Number.isSafeInteger(movimiento.costoUnitario) || movimiento.costoUnitario <= 0) {
        throw new ErrorFifoNevera("COSTO_ENTRADA_FIFO_INVALIDO");
      }
      saldo = sumarSeguro(saldo, movimiento.cantidad, "SALDO_FIFO_DESBORDADO");
      capas.push({
        id: movimiento.id,
        movimientoOrigenId: movimiento.id,
        empresaId: identidad.empresaId,
        productoId: identidad.productoId,
        catalogoId: "NEVERA",
        secuenciaArticulo: movimiento.secuenciaArticulo,
        unidadesIniciales: movimiento.cantidad,
        unidadesRestantes: movimiento.cantidad,
        costoUnitarioCOP: movimiento.costoUnitario,
      });
    } else {
      const salida = Math.abs(movimiento.cantidad);
      if (!Number.isSafeInteger(salida)) throw new ErrorFifoNevera("CANTIDAD_FIFO_INVALIDA");
      const disponibles = capas.filter(capa => capa.unidadesRestantes > 0);
      const plan = planificarConsumoFifoNevera(disponibles, salida);
      const porId = new Map(plan.consumos.map(consumo => [consumo.capaId, consumo.unidadesRestantes]));
      for (const capa of capas) {
        const restante = porId.get(capa.id);
        if (restante !== undefined) capa.unidadesRestantes = restante;
      }
      saldo -= salida;
      if (saldo < 0) throw new ErrorFifoNevera("SALDO_LEDGER_FIFO_NEGATIVO");
    }
    if (saldo !== movimiento.saldoCantidadDespues) throw new ErrorFifoNevera("SALDO_LEDGER_FIFO_INCONSISTENTE");
  }
  if (saldo !== stockActual) throw new ErrorFifoNevera("STOCK_LEDGER_FIFO_DIFERENTE");
  let valorExistenciaCOP = 0;
  for (const capa of capas) {
    const valorCapa = capa.unidadesRestantes * capa.costoUnitarioCOP;
    if (!Number.isSafeInteger(valorCapa)) throw new ErrorFifoNevera("COSTO_FIFO_DESBORDADO");
    valorExistenciaCOP = sumarSeguro(valorExistenciaCOP, valorCapa, "COSTO_FIFO_DESBORDADO");
  }
  return { capas, saldoReconstruido: saldo, valorExistenciaCOP, movimientos: ordenados.length };
}
