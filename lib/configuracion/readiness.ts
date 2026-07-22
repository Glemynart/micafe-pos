import type { ConfiguracionEmpresa } from "./contrato";
import { paisFiscalSoportado, validarConfiguracionEmpresa, type ContextoValidacionConfiguracion } from "./validacion";

export type CausaReadinessConfiguracion = "CONFIGURACION_INVALIDA" | "NOMBRE_COMERCIAL_FALTANTE" | "LOCALIZACION_INCOMPLETA" | "MODULOS_SIN_CONFIGURAR" | "PAIS_FISCAL_NO_SOPORTADO" | "IDENTIDAD_FISCAL_INCOMPLETA" | "DOMICILIO_FISCAL_INCOMPLETO";
export interface EstadoReadinessConfiguracion { lista: boolean; causas: readonly CausaReadinessConfiguracion[] }
export interface ReadinessConfiguracion { operativa: EstadoReadinessConfiguracion; fiscal: EstadoReadinessConfiguracion }
const estado = (causas: CausaReadinessConfiguracion[]): EstadoReadinessConfiguracion => ({ lista: causas.length === 0, causas });

/** Evalúa únicamente requisitos derivados del agregado B1; no persiste flags. */
export function evaluarReadinessConfiguracion(configuracion: ConfiguracionEmpresa, contexto: ContextoValidacionConfiguracion = {}): ReadinessConfiguracion {
  const estructura = validarConfiguracionEmpresa(configuracion, contexto);
  const invalidaNegocio = estructura.errores.some((error) => !error.ruta.startsWith("branding"));
  const operativa: CausaReadinessConfiguracion[] = [];
  if (invalidaNegocio) operativa.push("CONFIGURACION_INVALIDA");
  if (!configuracion.identidadFiscal?.nombreComercial) operativa.push("NOMBRE_COMERCIAL_FALTANTE");
  if (!configuracion.localizacion?.moneda || !configuracion.localizacion?.idioma || !configuracion.localizacion?.zonaHoraria) operativa.push("LOCALIZACION_INCOMPLETA");
  if (!configuracion.modulos?.habilitados?.length) operativa.push("MODULOS_SIN_CONFIGURAR");
  const fiscal: CausaReadinessConfiguracion[] = [];
  if (invalidaNegocio) fiscal.push("CONFIGURACION_INVALIDA");
  if (!paisFiscalSoportado(configuracion.localizacion?.paisFiscal ?? "")) fiscal.push("PAIS_FISCAL_NO_SOPORTADO");
  const i = configuracion.identidadFiscal ?? {};
  if (!i.razonSocial || !i.tipoPersona || !i.tipoDocumento || !i.numeroDocumento || !i.digitoVerificacion || !i.regimenTributario || !i.actividadEconomicaPrincipal) fiscal.push("IDENTIDAD_FISCAL_INCOMPLETA");
  const d = configuracion.localizacion?.direccion ?? {};
  if (!d.linea1 || !d.departamentoCodigo || !d.municipioCodigo) fiscal.push("DOMICILIO_FISCAL_INCOMPLETO");
  return { operativa: estado([...new Set(operativa)]), fiscal: estado([...new Set(fiscal)]) };
}
