export const CAMPOS_PERFIL_COMERCIAL = [
  "nombreComercial",
  "razonSocial",
  "tipoPersona",
  "nit",
  "digitoVerificacion",
  "email",
  "telefono",
  "direccion",
  "departamentoCodigo",
  "departamentoNombre",
  "municipioCodigo",
  "municipioNombre",
] as const;

export type CampoPerfilComercial = typeof CAMPOS_PERFIL_COMERCIAL[number];

const etiquetas: Record<CampoPerfilComercial, string> = {
  nombreComercial: "nombre comercial",
  razonSocial: "razón social",
  tipoPersona: "tipo de persona",
  nit: "NIT",
  digitoVerificacion: "dígito de verificación",
  email: "correo de contacto",
  telefono: "teléfono de contacto",
  direccion: "dirección",
  departamentoCodigo: "código de departamento",
  departamentoNombre: "departamento",
  municipioCodigo: "código de municipio",
  municipioNombre: "municipio",
};

const camposPorRuta: Record<string, readonly CampoPerfilComercial[]> = {
  "identidadFiscal": ["nit", "digitoVerificacion"],
  "identidadFiscal.nombreComercial": ["nombreComercial"],
  "identidadFiscal.razonSocial": ["razonSocial"],
  "identidadFiscal.tipoPersona": ["tipoPersona"],
  "identidadFiscal.numeroDocumento": ["nit"],
  "identidadFiscal.digitoVerificacion": ["digitoVerificacion"],
  "identidadFiscal.contacto.email": ["email"],
  "identidadFiscal.contacto.telefono": ["telefono"],
  "localizacion.direccion": ["departamentoCodigo", "municipioCodigo"],
  "localizacion.direccion.linea1": ["direccion"],
  "localizacion.direccion.departamentoCodigo": ["departamentoCodigo"],
  "localizacion.direccion.departamentoNombre": ["departamentoNombre"],
  "localizacion.direccion.municipioCodigo": ["municipioCodigo"],
  "localizacion.direccion.municipioNombre": ["municipioNombre"],
};

export function camposPerfilComercialParaRuta(ruta: string): CampoPerfilComercial[] {
  if (!Object.prototype.hasOwnProperty.call(camposPorRuta, ruta)) return [];
  return [...camposPorRuta[ruta]];
}

function esRegistro(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Devuelve solo etiquetas controladas por el cliente; nunca refleja valores ni rutas del servidor. */
export function mensajeSeguroErrorPerfilComercial(error: unknown): string | null {
  const mensajeEsperado = "PERFIL_COMERCIAL_INVALIDO";
  if (
    !esRegistro(error)
    || error.code !== "functions/invalid-argument"
    || (error.message !== mensajeEsperado && error.message !== `${mensajeEsperado} [400]`)
  ) return null;
  if (!esRegistro(error.details) || !Array.isArray(error.details.campos)) return null;

  const permitidos = new Set<string>(CAMPOS_PERFIL_COMERCIAL);
  const campos = [...new Set(error.details.campos.filter((campo): campo is CampoPerfilComercial => typeof campo === "string" && permitidos.has(campo)))];
  if (campos.length === 0) return null;

  const nombres = campos.map((campo) => etiquetas[campo]);
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `Revisa ${lista}; no se guardó el perfil.`;
}
