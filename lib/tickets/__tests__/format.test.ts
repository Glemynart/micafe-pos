import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, formatFecha } from '../format'
import { DEFAULT_RENDER_OPTIONS } from '../render-options'

test('formatMoney: agrupa miles segun el locale y redondea', () => {
  assert.equal(formatMoney(16000, DEFAULT_RENDER_OPTIONS), '$16.000')
  assert.equal(formatMoney(999.6, DEFAULT_RENDER_OPTIONS), '$1.000')
  assert.equal(formatMoney(0, DEFAULT_RENDER_OPTIONS), '$0')
})

test('formatFecha: usa la timezone provista, no la del entorno de ejecucion', () => {
  const { fecha, hora } = formatFecha('2026-07-03T15:30:00-05:00', DEFAULT_RENDER_OPTIONS)
  assert.equal(fecha, '03/07/2026')
  assert.equal(hora, '03:30 p. m.')
})
