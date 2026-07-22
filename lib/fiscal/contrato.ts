/** Contrato compartido B2. No es una autoridad de runtime por sí mismo. */
export type TipoDocumentoFiscal = "pos" | "electronica" | "contingencia";
export type EstadoNumeracion = "BORRADOR" | "HABILITADA" | "PAUSADA" | "AGOTADA" | "VENCIDA" | "REVOCADA";
export type ScopeFiscal = "EMPRESA" | `ESPACIO:${string}`;

export interface SnapshotFiscal {
  schemaVersion: 1;
  configuracionRevision: number;
  identidadFiscal: { nombreComercial: string; razonSocial?: string; numeroDocumento?: string; digitoVerificacion?: string; regimenTributario?: string; direccion?: string; ciudad?: string; telefono?: string };
  paisFiscal: string;
  moneda: string;
  impuestosLineas: Array<{ itemId: string; impuestoTipo?: string; impuestoTarifa?: number; impuestoValor?: number; base?: number }>;
  documento: {
    items: Array<{ id: string; nombre: string; codigo?: string; cantidad: number; precioUnitario: number; subtotal: number; impuestoTipo?: string; impuestoTarifa?: number; impuestoValor?: number; base?: number }>;
    totales: { subtotalBase: number; totalINC: number; total: number };
    pago: { metodo: string; recibido?: number; cambio?: number };
    cliente?: { nombre?: string; documento?: string; tipoDoc?: string };
  };
  numeracion: { numeracionId: string; revision: number; tipoDocumento: TipoDocumentoFiscal; scope: ScopeFiscal; numero: number; prefijo: string; resolucion: string; rangoInicio: number; rangoFin: number; vigenciaDesde: string; vigenciaHasta: string };
  emitidaEn: unknown;
}

export const scopeEmpresa = (): ScopeFiscal => "EMPRESA";
const ID_OPACO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FECHA_FISCAL = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de negocio fiscal canónica: calendario gregoriano `YYYY-MM-DD`. */
export function validarFechaFiscal(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = FECHA_FISCAL.exec(valor);
  if (!partes) return false;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return false;
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasPorMes[mes - 1];
}

export function rangoVigenciaFiscalValido(desde: unknown, hasta: unknown): desde is string {
  return validarFechaFiscal(desde) && validarFechaFiscal(hasta) && desde <= hasta;
}

/** La fecha vigente se decide por el día UTC del reloj servidor, nunca por zona local. */
export function fechaFiscalActualUtc(reloj: Date = new Date()): string {
  if (!Number.isFinite(reloj.getTime())) throw new Error("RELOJ_SERVIDOR_INVALIDO");
  return reloj.toISOString().slice(0, 10);
}

export function fechaFiscalEnRango(fecha: unknown, desde: unknown, hasta: unknown): boolean {
  if (!validarFechaFiscal(fecha) || !validarFechaFiscal(desde) || !validarFechaFiscal(hasta)) return false;
  return desde <= hasta && desde <= fecha && fecha <= hasta;
}

export function validarIdFiscal(id: unknown): id is string {
  return typeof id === "string" && ID_OPACO.test(id);
}
export function scopeEspacio(espacioId: string): ScopeFiscal {
  if (!validarIdFiscal(espacioId)) throw new Error("ESPACIO_INVALIDO");
  return `ESPACIO:${espacioId}`;
}
export function validarScopeFiscal(scope: unknown): scope is ScopeFiscal {
  return scope === "EMPRESA" || (typeof scope === "string" && scope.startsWith("ESPACIO:") && validarIdFiscal(scope.slice(8)));
}
