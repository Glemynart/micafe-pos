import { createHash, timingSafeEqual } from "node:crypto";
import type { ImpuestoTipo } from "../impuestos-service";

export const MONEDA_RESERVAS_PUBLICAS = "COP" as const;
export const MAX_BODY_HOLD_BYTES = 8 * 1024;
export const MAX_BODY_WEBHOOK_BYTES = 32 * 1024;
export const MAX_BLOQUES_RESERVA = 8;
export const HORIZONTE_RESERVA_DIAS = 180;

export interface TarifaSalaPublica {
  precioBloqueCentavos: number;
  productoId: string;
  impuestoTipo: ImpuestoTipo;
  bloquesMinimos: number;
  bloquesMaximos: number;
}

export interface ConfiguracionReservasPublicas {
  habilitadas: boolean;
  moneda: typeof MONEDA_RESERVAS_PUBLICAS;
  tarifaRevision: number;
  cuentaClaveOperativa: string;
  salas: Record<string, TarifaSalaPublica>;
}

export interface SolicitudHoldPublico {
  slug: string;
  mesaId: string;
  fechaLocal: string;
  bloquesSolicitados: string[];
  cliente: { nombre: string; email: string; telefono: string };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const text = (value: unknown, min: number, max: number) => typeof value === "string" && value === value.trim() && value.length >= min && value.length <= max;
const email = (value: unknown) => text(value, 3, 160) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string);
const phone = (value: unknown) => text(value, 7, 24) && /^\+?[\d\s-]+$/.test(value as string);
const block = (value: unknown): value is string => typeof value === "string" && /^(?:0\d|1\d|2[0-3])$/.test(value);

export function validarConfiguracionReservasPublicas(value: unknown): value is ConfiguracionReservasPublicas {
  if (!object(value) || !exactKeys(value, ["habilitadas", "moneda", "tarifaRevision", "cuentaClaveOperativa", "salas"])) return false;
  if (typeof value.habilitadas !== "boolean" || value.moneda !== MONEDA_RESERVAS_PUBLICAS || !Number.isSafeInteger(value.tarifaRevision) || (value.tarifaRevision as number) < 1 || !text(value.cuentaClaveOperativa, 1, 80) || !object(value.salas)) return false;
  const salas = Object.entries(value.salas);
  if (salas.length === 0 || salas.length > 100) return false;
  return salas.every(([mesaId, tarifa]) => {
    if (!text(mesaId, 1, 120) || !object(tarifa) || !exactKeys(tarifa, ["precioBloqueCentavos", "productoId", "impuestoTipo", "bloquesMinimos", "bloquesMaximos"])) return false;
    return Number.isSafeInteger(tarifa.precioBloqueCentavos) && (tarifa.precioBloqueCentavos as number) >= 100 && (tarifa.precioBloqueCentavos as number) % 100 === 0
      && text(tarifa.productoId, 1, 120) && ["excluido", "inc_8", "iva_19"].includes(String(tarifa.impuestoTipo))
      && Number.isSafeInteger(tarifa.bloquesMinimos) && Number.isSafeInteger(tarifa.bloquesMaximos)
      && (tarifa.bloquesMinimos as number) >= 1 && (tarifa.bloquesMaximos as number) <= MAX_BLOQUES_RESERVA
      && (tarifa.bloquesMinimos as number) <= (tarifa.bloquesMaximos as number);
  });
}

function fechaValida(fechaLocal: string, zonaHoraria: string, ahora: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaLocal)) return false;
  const parsed = new Date(`${fechaLocal}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fechaLocal) return false;
  let hoy: string;
  try { hoy = new Intl.DateTimeFormat("en-CA", { timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora); } catch { return false; }
  const max = new Date(`${hoy}T00:00:00.000Z`); max.setUTCDate(max.getUTCDate() + HORIZONTE_RESERVA_DIAS);
  return fechaLocal >= hoy && fechaLocal <= max.toISOString().slice(0, 10);
}

export function validarSolicitudHoldPublico(value: unknown, zonaHoraria: string, ahora = new Date()): value is SolicitudHoldPublico {
  if (!object(value) || !exactKeys(value, ["slug", "mesaId", "fechaLocal", "bloquesSolicitados", "cliente"]) || !object(value.cliente) || !exactKeys(value.cliente, ["nombre", "email", "telefono"])) return false;
  if (!text(value.slug, 1, 100) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug as string) || !text(value.mesaId, 1, 120) || !fechaValida(String(value.fechaLocal), zonaHoraria, ahora)) return false;
  if (!text(value.cliente.nombre, 3, 120) || !email(value.cliente.email) || !phone(value.cliente.telefono)) return false;
  if (!Array.isArray(value.bloquesSolicitados) || value.bloquesSolicitados.length < 1 || value.bloquesSolicitados.length > MAX_BLOQUES_RESERVA || !value.bloquesSolicitados.every(block)) return false;
  const numeros = value.bloquesSolicitados.map(Number);
  return new Set(numeros).size === numeros.length && numeros.every((n, index) => index === 0 || n === numeros[index - 1] + 1);
}

export function calcularMontoAutorizadoCentavos(tarifa: TarifaSalaPublica, bloques: readonly string[]) {
  if (bloques.length < tarifa.bloquesMinimos || bloques.length > tarifa.bloquesMaximos) throw new Error("DURACION_NO_PERMITIDA");
  const total = tarifa.precioBloqueCentavos * bloques.length;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("MONTO_INVALIDO");
  return total;
}

export function firmaIntegridadCheckout(reference: string, amountInCents: number, currency: string, secret: string) {
  return createHash("sha256").update(`${reference}${amountInCents}${currency}${secret}`, "utf8").digest("hex");
}

export function compararHexSeguro(actual: unknown, esperado: string) {
  if (typeof actual !== "string" || !/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(esperado)) return false;
  return timingSafeEqual(Buffer.from(actual.toLowerCase(), "hex"), Buffer.from(esperado.toLowerCase(), "hex"));
}
