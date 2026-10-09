export interface TurnoCajaReporte {
  cajeroId?: string;
  estado?: string;
  baseApertura?: number;
  ventasEfectivo?: number;
  totalEsperadoEfectivo?: number;
  totalReportadoEfectivo?: number;
}

export interface CuadreCajaPorCajero {
  efectivoEsperado: number;
  efectivoDeclarado: number;
  diferenciaCaja: number;
}

/** Agrupa únicamente cierres canónicos, comparando conteo con efectivo esperado. */
export function agruparCuadresCajaPorCajero(
  turnos: readonly TurnoCajaReporte[],
): Map<string, CuadreCajaPorCajero> {
  const cuadros = new Map<string, CuadreCajaPorCajero>();

  for (const turno of turnos) {
    if (turno.estado !== "cerrado") continue;
    if (typeof turno.cajeroId !== "string" || !turno.cajeroId.trim()) continue;

    const esperado = turno.totalEsperadoEfectivo;
    const declarado = turno.totalReportadoEfectivo;
    if (typeof esperado !== "number" || !Number.isSafeInteger(esperado) || esperado < 0) continue;
    if (typeof declarado !== "number" || !Number.isSafeInteger(declarado) || declarado < 0) continue;

    const cajeroId = turno.cajeroId;
    const cuadro = cuadros.get(cajeroId) ?? {
      efectivoEsperado: 0,
      efectivoDeclarado: 0,
      diferenciaCaja: 0,
    };
    cuadro.efectivoEsperado += esperado;
    cuadro.efectivoDeclarado += declarado;
    cuadro.diferenciaCaja = cuadro.efectivoDeclarado - cuadro.efectivoEsperado;
    cuadros.set(cajeroId, cuadro);
  }

  return cuadros;
}
