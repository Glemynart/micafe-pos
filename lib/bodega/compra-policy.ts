export type ErrorPoliticaCompraBodega = "VERTICAL_NO_COMPATIBLE" | "MODULO_NO_HABILITADO" | "PAYLOAD_INVALID" | "TIPO_ARTICULO_NO_PERMITIDO";

export function errorPoliticaCompraBodega(value: unknown): ErrorPoliticaCompraBodega | null {
  const configuracion = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (configuracion.vertical !== "BODEGA_MVP1") {
    return "VERTICAL_NO_COMPATIBLE";
  }
  const modulos = configuracion.modulos && typeof configuracion.modulos === "object" && !Array.isArray(configuracion.modulos)
    ? configuracion.modulos as Record<string, unknown>
    : {};
  if (!Array.isArray(modulos.habilitados) || !modulos.habilitados.includes("purchases")) {
    return "MODULO_NO_HABILITADO";
  }
  return null;
}

export function errorPayloadCompraBodega(value: unknown): ErrorPoliticaCompraBodega | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "PAYLOAD_INVALID";
  }
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items) || items.length === 0 || items.some(item =>
    !item || typeof item !== "object" || Array.isArray(item) || (item as Record<string, unknown>).tipo !== "producto"
  )) {
    return "TIPO_ARTICULO_NO_PERMITIDO";
  }
  return null;
}
