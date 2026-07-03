/**
 * RenderOptions — únicas perillas que puede tocar el renderer.
 *
 * El motor tiene un solo árbol de HTML/CSS; 58mm y 80mm son el mismo
 * renderer con constantes distintas (ancho, tamaño de QR, tipografía,
 * columnas), nunca dos plantillas separadas.
 *
 * `locale` / `currency` / `timezone` se reservan para una futura
 * internacionalización. Hoy el sistema es exclusivamente para Colombia: no
 * se implementa soporte multi-idioma ni un catálogo de textos traducibles
 * (los títulos y etiquetas del ticket siguen fijos en español). Lo único que
 * se hace ya es enrutar el formateo de números y fechas a través de estas
 * opciones (ver format.ts) para no hardcodear 'es-CO' dentro del renderer.
 */
export interface RenderOptionsColumnas {
  /** Ancho en px de la columna de precio unitario. */
  unitPx: number
  /** Ancho en px de la columna de subtotal por línea. */
  totalPx: number
}

export interface RenderOptions {
  /** Ancho utilizable del cuerpo del ticket, en px (58mm ≈ 210, 80mm ≈ 280-300). */
  anchoCuerpoPx: number
  /** Tamaño del QR en px, ya incluyendo su quiet-zone. */
  qrPx: number
  /** Tamaño base de fuente, en px. */
  fuenteBasePx: number
  columnas: RenderOptionsColumnas
  /** Reservado para i18n futura. Default: 'es-CO'. */
  locale: string
  /** Reservado para i18n futura. Default: 'COP'. No se usa Intl currency style hoy. */
  currency: string
  /** Reservado para i18n futura. Default: 'America/Bogota'. */
  timezone: string
}

const BASE_I18N = {
  locale: 'es-CO',
  currency: 'COP',
  timezone: 'America/Bogota',
} as const

export const RENDER_OPTIONS_58MM: RenderOptions = {
  anchoCuerpoPx: 210,
  qrPx: 120,
  fuenteBasePx: 11,
  columnas: { unitPx: 55, totalPx: 58 },
  ...BASE_I18N,
}

export const RENDER_OPTIONS_80MM: RenderOptions = {
  anchoCuerpoPx: 280,
  qrPx: 150,
  fuenteBasePx: 13,
  columnas: { unitPx: 70, totalPx: 75 },
  ...BASE_I18N,
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = RENDER_OPTIONS_80MM
