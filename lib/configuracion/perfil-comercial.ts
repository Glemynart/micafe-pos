import type { ConfiguracionEmpresa, VerticalTenant } from "./contrato";

const tieneTexto = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Completitud del paso comercial inicial; no implica readiness fiscal. */
export function perfilComercialCompleto(configuracion: Pick<ConfiguracionEmpresa, "identidadFiscal" | "localizacion">): boolean {
  const identidad = configuracion.identidadFiscal;
  const direccion = configuracion.localizacion.direccion;
  return tieneTexto(identidad.nombreComercial)
    && tieneTexto(identidad.razonSocial)
    && (identidad.tipoPersona === "NATURAL" || identidad.tipoPersona === "JURIDICA")
    && identidad.tipoDocumento === "NIT"
    && tieneTexto(identidad.numeroDocumento)
    && tieneTexto(identidad.digitoVerificacion)
    && tieneTexto(identidad.contacto.email)
    && tieneTexto(identidad.contacto.telefono)
    && tieneTexto(direccion.linea1)
    && tieneTexto(direccion.departamentoCodigo)
    && tieneTexto(direccion.departamentoNombre)
    && tieneTexto(direccion.municipioCodigo)
    && tieneTexto(direccion.municipioNombre);
}

export function requierePasoPerfilComercialBodega(entrada: {
  vertical: VerticalTenant | null;
  usuarioRol: string | null | undefined;
  membresiaRol: string | null | undefined;
  membresiaActiva: boolean;
  empresaCoincide: boolean;
  configuracion: Pick<ConfiguracionEmpresa, "identidadFiscal" | "localizacion">;
}): boolean {
  return entrada.vertical === "BODEGA_MVP1"
    && entrada.usuarioRol === "admin"
    && entrada.membresiaRol === "admin"
    && entrada.membresiaActiva
    && entrada.empresaCoincide
    && !perfilComercialCompleto(entrada.configuracion);
}
