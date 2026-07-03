import type { RenderOptions } from './render-options'

/**
 * Helpers de formateo puros. Reciben `RenderOptions` en vez de hardcodear
 * 'es-CO' para que el renderer no tenga que conocer el locale: es la pieza
 * concreta de la preparación i18n (ver render-options.ts). El símbolo de
 * moneda ('$') sigue fijo a propósito — tokenizarlo por `currency` es trabajo
 * de una futura internacionalización real, fuera de alcance de este PR.
 */

export function formatMoney(value: number, options: Pick<RenderOptions, 'locale'>): string {
  const redondeado = Math.round(value)
  return `$${new Intl.NumberFormat(options.locale).format(redondeado)}`
}

export interface FechaFormateada {
  fecha: string
  hora: string
}

export function formatFecha(
  value: string | Date,
  options: Pick<RenderOptions, 'locale' | 'timezone'>
): FechaFormateada {
  const date = typeof value === 'string' ? new Date(value) : value

  const fecha = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  const hora = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)

  return { fecha, hora }
}
