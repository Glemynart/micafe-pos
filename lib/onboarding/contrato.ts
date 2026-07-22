import {
  evaluarReadinessConfiguracion,
  type ConfiguracionEmpresa,
  type ReadinessConfiguracion,
  type ContextoValidacionConfiguracion,
} from "../configuracion";
import {
  fechaFiscalActualUtc,
  fechaFiscalEnRango,
  rangoVigenciaFiscalValido,
  type Asignacion,
  type Numeracion,
  type ScopeFiscal,
  type TipoDocumentoFiscal,
} from "../fiscal/contrato";

export type CausaReadinessTotal =
  | "CONFIGURACION_OPERATIVA_INCOMPLETA"
  | "CONFIGURACION_FISCAL_INCOMPLETA"
  | "NUMERACION_SIN_ASIGNACION_VIGENTE"
  | "NUMERACION_NO_HABILITADA"
  | "NUMERACION_NO_VIGENTE"
  | "NUMERACION_AGOTADA";

export interface EstadoReadinessNumeracion {
  lista: boolean;
  causas: readonly CausaReadinessTotal[];
  asignacionVigente?: {
    scope: ScopeFiscal;
    tipoDocumento: TipoDocumentoFiscal;
    numeracionId: string;
  };
  numeracionHabilitada?: {
    numeracionId: string;
    estado: string;
    prefijo: string;
    ultimoAsignado: number;
    rangoFin: number;
    vigenciaDesde: string;
    vigenciaHasta: string;
  };
}

export interface EstadoReadinessTotal {
  listo: boolean;
  causas: readonly CausaReadinessTotal[];
  detalles: {
    configuracion: ReadinessConfiguracion;
    numeracion: EstadoReadinessNumeracion;
  };
}

/**
 * Evalúa en tiempo de ejecución (sin persistir flags) la preparación comercial total del tenant.
 * Combina la readiness de Configuración (B1) y la readiness de Numeración/Asignación Fiscal (B2).
 * NO modifica ni sustituye la autoridad de `Empresa.estado` (B3/B4).
 */
export function evaluarReadinessTotal(
  configuracion: ConfiguracionEmpresa,
  numeraciones: Numeracion[],
  asignaciones: Asignacion[],
  contexto: ContextoValidacionConfiguracion & { fechaActualUtc?: string } = {}
): EstadoReadinessTotal {
  const readinessConfig = evaluarReadinessConfiguracion(configuracion, contexto);
  const causas: CausaReadinessTotal[] = [];

  if (!readinessConfig.operativa.lista) {
    causas.push("CONFIGURACION_OPERATIVA_INCOMPLETA");
  }
  if (!readinessConfig.fiscal.lista) {
    causas.push("CONFIGURACION_FISCAL_INCOMPLETA");
  }

  // Buscar una asignación POS VIGENTE
  const asignacionPos = asignaciones.find(
    (a) => a.estado === "VIGENTE" && a.tipoDocumento === "pos"
  );

  const causasNum: CausaReadinessTotal[] = [];

  if (!asignacionPos) {
    causasNum.push("NUMERACION_SIN_ASIGNACION_VIGENTE");
    causas.push("NUMERACION_SIN_ASIGNACION_VIGENTE");
  } else {
    const numeracion = numeraciones.find(
      (n) => n.numeracionId === asignacionPos.numeracionId && n.tipoDocumento === "pos"
    );

    if (!numeracion || numeracion.estado !== "HABILITADA") {
      causasNum.push("NUMERACION_NO_HABILITADA");
      causas.push("NUMERACION_NO_HABILITADA");
    } else {
      const hoy = contexto.fechaActualUtc ?? fechaFiscalActualUtc();
      if (
        !rangoVigenciaFiscalValido(numeracion.vigenciaDesde, numeracion.vigenciaHasta) ||
        !fechaFiscalEnRango(hoy, numeracion.vigenciaDesde, numeracion.vigenciaHasta)
      ) {
        causasNum.push("NUMERACION_NO_VIGENTE");
        causas.push("NUMERACION_NO_VIGENTE");
      }
      if (numeracion.ultimoAsignado >= numeracion.rangoFin) {
        causasNum.push("NUMERACION_AGOTADA");
        causas.push("NUMERACION_AGOTADA");
      }
    }
  }

  const numeracionDetalle: EstadoReadinessNumeracion = {
    lista: causasNum.length === 0,
    causas: causasNum,
    asignacionVigente: asignacionPos
      ? {
          scope: asignacionPos.scope,
          tipoDocumento: asignacionPos.tipoDocumento,
          numeracionId: asignacionPos.numeracionId,
        }
      : undefined,
    numeracionHabilitada: (() => {
      if (!asignacionPos) return undefined;
      const num = numeraciones.find((n) => n.numeracionId === asignacionPos.numeracionId);
      if (!num) return undefined;
      return {
        numeracionId: num.numeracionId,
        estado: num.estado,
        prefijo: num.prefijo,
        ultimoAsignado: num.ultimoAsignado,
        rangoFin: num.rangoFin,
        vigenciaDesde: num.vigenciaDesde,
        vigenciaHasta: num.vigenciaHasta,
      };
    })(),
  };

  return {
    listo: causas.length === 0,
    causas: [...new Set(causas)],
    detalles: {
      configuracion: readinessConfig,
      numeracion: numeracionDetalle,
    },
  };
}
