import { randomInt } from "node:crypto";

/** Primitivas neutrales de generación para credenciales operativas. */
const LONGITUD_NEGOCIO = 16;
const LONGITUD_OPERATIVO = 12;
export const MAX_INTENTOS_UNICIDAD = 5;

export function generarPinTemporal(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function derivarSlugParaCodigo(valor: string, longitud = LONGITUD_NEGOCIO): string {
  const normalizado = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const slug = normalizado.slice(0, longitud);
  return slug.length >= 3 ? slug : slug.padEnd(3, "0");
}

export function generarCodigoOperativo(
  nombreComercial: string,
  nombreOperativo = "usuario",
  intento = 0,
): string {
  const negocio = derivarSlugParaCodigo(nombreComercial || "empresa", LONGITUD_NEGOCIO);
  const nombreCorto = nombreOperativo.trim().split(/\s+/)[0] || "usuario";
  const operativo = derivarSlugParaCodigo(nombreCorto, LONGITUD_OPERATIVO);
  const base = `${negocio}-${operativo}`;
  return intento > 0 ? `${base}-${intento + 1}` : base;
}
