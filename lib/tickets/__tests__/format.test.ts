import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, formatFecha } from '../format'
import { DEFAULT_RENDER_OPTIONS } from '../render-options'

// Intl separa la hora del marcador AM/PM con un espacio duro cuyo code point
// (U+00A0 en unos ICU, U+202F en otros) depende de la version de ICU del
// runtime: dev y CI pueden diferir. Se normalizan ambos a un espacio normal
// para que la comparacion sea agnostica al ICU y no fragil entre entornos.
const NBSP = String.fromCharCode(0x00a0)   // no-break space
const NNBSP = String.fromCharCode(0x202f)  // narrow no-break space
const normalizarEspacios = (s: string) => s.split(NBSP).join(' ').split(NNBSP).join(' ')

test('formatMoney: agrupa miles segun el locale y redondea', () => {
  assert.equal(formatMoney(16000, DEFAULT_RENDER_OPTIONS), '$16.000')
  assert.equal(formatMoney(999.6, DEFAULT_RENDER_OPTIONS), '$1.000')
  assert.equal(formatMoney(0, DEFAULT_RENDER_OPTIONS), '$0')
})

test('formatFecha: usa la timezone provista, no la del entorno de ejecucion', () => {
  const { fecha, hora } = formatFecha('2026-07-03T15:30:00-05:00', DEFAULT_RENDER_OPTIONS)
  assert.equal(fecha, '03/07/2026')
  assert.equal(normalizarEspacios(hora), '03:30 p. m.')
})
