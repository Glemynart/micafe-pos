import { RUTAS_HOJA_EDITABLES_CONFIGURACION, type RutaHojaEditableConfiguracion } from "./catalogos";
import type { ConfiguracionEmpresa } from "./contrato";
import { validarConfiguracionEmpresa, type ContextoValidacionConfiguracion } from "./validacion";

export type OperacionConfiguracion = { tipo: "SET"; ruta: RutaHojaEditableConfiguracion; valor: unknown } | { tipo: "REMOVE"; ruta: RutaHojaEditableConfiguracion };
export type ResultadoOperacionConfiguracion = { tipo: "NO_OP" | "MUTACION_EFECTIVA"; configuracion: ConfiguracionEmpresa };
export const RUTAS_REMOVIBLES_CONFIGURACION: readonly RutaHojaEditableConfiguracion[] = ["identidadFiscal.razonSocial", "identidadFiscal.tipoPersona", "identidadFiscal.tipoDocumento", "identidadFiscal.numeroDocumento", "identidadFiscal.digitoVerificacion", "identidadFiscal.regimenTributario", "identidadFiscal.responsabilidadesFiscales", "identidadFiscal.actividadEconomicaPrincipal", "identidadFiscal.contacto.email", "identidadFiscal.contacto.telefono", "localizacion.direccion.linea1", "localizacion.direccion.linea2", "localizacion.direccion.departamentoCodigo", "localizacion.direccion.departamentoNombre", "localizacion.direccion.municipioCodigo", "localizacion.direccion.municipioNombre", "localizacion.direccion.codigoPostal", "branding.nombreVisible", "branding.assets.logoPrincipal", "branding.assets.logoModoOscuro", "branding.assets.favicon", "branding.assets.iconoAplicacion", "ticket.logoDocumentoUrl"];
export class ErrorOperacionConfiguracion extends Error { constructor(public readonly codigo: string, public readonly ruta: string) { super(codigo); } }
const igual = (a: unknown, b: unknown) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));
function copia<T>(v: T): T {
  if (Array.isArray(v)) return v.map(copia) as T;
  if (v && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, copia(x)])) as T;
  }
  return v;
}
function leer(obj: Record<string, unknown>, ruta: string): unknown { return ruta.split(".").reduce<unknown>((actual, parte) => actual && typeof actual === "object" ? (actual as Record<string, unknown>)[parte] : undefined, obj); }
function escribir(obj: Record<string, unknown>, ruta: string, valor: unknown, eliminar: boolean) { const partes = ruta.split("."); const hoja = partes.pop()!; const padre = partes.reduce<Record<string, unknown>>((a, p) => a[p] as Record<string, unknown>, obj); if (eliminar) delete padre[hoja]; else padre[hoja] = valor; }
export function aplicarOperacionesConfiguracion(configuracion: ConfiguracionEmpresa, operaciones: readonly OperacionConfiguracion[], rutasPermitidas: readonly RutaHojaEditableConfiguracion[] = RUTAS_HOJA_EDITABLES_CONFIGURACION, contexto: ContextoValidacionConfiguracion = {}): ResultadoOperacionConfiguracion {
  const siguiente = copia(configuracion); let cambio = false;
  for (const operacion of operaciones) { if (!(RUTAS_HOJA_EDITABLES_CONFIGURACION as readonly string[]).includes(operacion.ruta) || !rutasPermitidas.includes(operacion.ruta)) throw new ErrorOperacionConfiguracion("CONFIG_FIELD_FORBIDDEN", operacion.ruta); if (operacion.tipo === "REMOVE" && !RUTAS_REMOVIBLES_CONFIGURACION.includes(operacion.ruta)) throw new ErrorOperacionConfiguracion("CONFIG_FIELD_FORBIDDEN", operacion.ruta); const previo = leer(siguiente as unknown as Record<string, unknown>, operacion.ruta); if (operacion.tipo === "SET" ? !igual(previo, operacion.valor) : previo !== undefined) { escribir(siguiente as unknown as Record<string, unknown>, operacion.ruta, operacion.tipo === "SET" ? operacion.valor : undefined, operacion.tipo === "REMOVE"); cambio = true; } }
  if (!cambio) return { tipo: "NO_OP", configuracion };
  const validacion = validarConfiguracionEmpresa(siguiente, contexto); if (!validacion.valida) throw new ErrorOperacionConfiguracion("CONFIG_INVALID", validacion.errores[0]?.ruta ?? ""); return { tipo: "MUTACION_EFECTIVA", configuracion: siguiente };
}
