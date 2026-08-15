import { randomInt } from "node:crypto";

/**
 * Primitivas de generación para credenciales operativas.
 *
 * El código es un identificador humano, no un secreto. La unicidad global se
 * garantiza en la transacción que reserva la credencial; el PIN sigue siendo
 * el secreto personal y la autoridad sigue dependiendo de la membresía.
 */

const LONGITUD_NEGOCIO = 16;
const LONGITUD_OPERATIVO = 12;
export const MAX_INTENTOS_UNICIDAD = 5;

/** Genera un PIN temporal de 6 dígitos con un generador criptográfico. */
export function generarPinTemporal(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Deriva un identificador legible desde un nombre comercial o personal.
 * Nunca debe recibir un `empresaId` como sustituto del nombre comercial.
 */
export function derivarSlugParaCodigo(valor: string, longitud = LONGITUD_NEGOCIO): string {
  const normalizado = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const slug = normalizado.slice(0, longitud);
  return slug.length >= 3 ? slug : slug.padEnd(3, "0");
}

/**
 * Compone `<negocio>-<persona-o-rol>`. En caso de colisión, el intento
 * agrega un diferenciador legible (`-2`, `-3`, etc.).
 */
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
