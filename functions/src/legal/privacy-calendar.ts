const DAY = 86_400_000;
const iso = (millis: number) => new Date(millis).toISOString().slice(0, 10);
const day = (year: number, month: number, date: number) => Date.UTC(year, month - 1, date);
const monday = (millis: number) => millis + ((8 - new Date(millis).getUTCDay()) % 7) * DAY;
const bogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
});

export const PRIVACY_CALENDAR_V1 = "CO-LEY51-LUN-VIE-V1";
export const PRIVACY_CALENDAR_V2 = "CO-LEY51-SAB-DOM-FEST-V2";
export const PRIVACY_CALENDAR_VERSION = PRIVACY_CALENDAR_V2;
export type PrivacyCalendarVersion = typeof PRIVACY_CALENDAR_V1 | typeof PRIVACY_CALENDAR_V2;

export function fechaBogota(millis: number): string {
  const parts = bogota.formatToParts(millis);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Cómputo gregoriano de Pascua para los festivos móviles de la Ley 51 de 1983. */
function pascua(year: number): number {
  const cycle = year % 19;
  const century = Math.floor(year / 100);
  const lastTwo = year % 100;
  const moon = (19 * cycle + century - Math.floor(century / 4)
    - Math.floor((century - Math.floor((century + 8) / 25) + 1) / 3) + 15) % 30;
  const week = (32 + 2 * (century % 4) + 2 * Math.floor(lastTwo / 4) - moon - (lastTwo % 4)) % 7;
  const correction = Math.floor((cycle + 11 * moon + 22 * week) / 451);
  const result = moon + week - 7 * correction + 114;
  return day(year, Math.floor(result / 31), result % 31 + 1);
}

function festivos(year: number): Set<number> {
  const fixed = [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]];
  const moved = [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]];
  const easter = pascua(year);
  return new Set([
    ...fixed.map(([month, date]) => day(year, month!, date!)),
    ...moved.map(([month, date]) => monday(day(year, month!, date!))),
    easter - 3 * DAY, easter - 2 * DAY,
    ...[39, 60, 68].map(offset => monday(easter + offset * DAY)),
  ]);
}

function fechaValida(fecha: string): number {
  let cursor = Date.parse(fecha + "T00:00:00Z");
  if (!/^20\d\d-\d\d-\d\d$/.test(fecha) || !Number.isFinite(cursor) || iso(cursor) !== fecha) {
    throw new Error("PLAZO_INVALIDO");
  }
  return cursor;
}

function habil(cursor: number, version: PrivacyCalendarVersion): boolean {
  const date = new Date(cursor);
  const weekday = date.getUTCDay();
  return weekday !== 0 && (version === PRIVACY_CALENDAR_V2 || weekday !== 6)
    && !festivos(date.getUTCFullYear()).has(cursor);
}

export function sumarHabiles(
  fecha: string,
  cantidad: number,
  version: PrivacyCalendarVersion = PRIVACY_CALENDAR_VERSION,
): string {
  let cursor = fechaValida(fecha);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 30
    || ![PRIVACY_CALENDAR_V1, PRIVACY_CALENDAR_V2].includes(version)) throw new Error("PLAZO_INVALIDO");
  while (cantidad > 0) {
    cursor += DAY;
    if (habil(cursor, version)) cantidad--;
  }
  return iso(cursor);
}

/** Meses calendario; si el día no existe en el mes destino, usa su último día. */
export function sumarMesesCalendario(fecha: string, cantidad: number): string {
  const cursor = fechaValida(fecha);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 24) throw new Error("PLAZO_INVALIDO");
  const original = new Date(cursor);
  const destino = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + cantidad, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(original.getUTCDate(), ultimoDia));
  return iso(destino.getTime());
}

/** Conserva el sábado de V2; extiende domingo y festivo al siguiente día computable. */
export function ajustarAlSiguienteHabil(fecha: string, version: PrivacyCalendarVersion): string {
  let cursor = fechaValida(fecha);
  if (![PRIVACY_CALENDAR_V1, PRIVACY_CALENDAR_V2].includes(version)) throw new Error("PLAZO_INVALIDO");
  while (!habil(cursor, version)) cursor += DAY;
  return iso(cursor);
}

export function vencimientoDosMeses(fecha: string, version: PrivacyCalendarVersion): string {
  return ajustarAlSiguienteHabil(sumarMesesCalendario(fecha, 2), version);
}
