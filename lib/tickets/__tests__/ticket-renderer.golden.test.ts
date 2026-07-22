import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { renderTicket } from '../ticket-renderer'
import { RENDER_OPTIONS_58MM, RENDER_OPTIONS_80MM } from '../render-options'
import { GOLDEN_CASES, construirModelo } from './fixtures'

/**
 * Golden tests del renderer (diseño H1 V3 §8). Fijan el HTML producido para
 * una matriz de casos de negocio x ancho de papel, para que un cambio futuro
 * del renderer que altere el resultado visual rompa el test explícitamente.
 *
 * Los fixtures viven en fixtures.ts (compartidos con la suite del builder).
 * El caso "descuentos" queda como placeholder (test.skip) porque el dominio
 * de ventas aún no produce descuentos — ver el propio test más abajo.
 *
 * Para regenerar la línea base tras un cambio intencional del renderer:
 *   GOLDEN_UPDATE=1 npm run test:tickets
 */

const GOLDEN_DIR = path.join(__dirname, 'golden')

// El separador de hora AM/PM que produce Intl (U+00A0 vs U+202F) depende de la
// version de ICU del runtime (dev vs CI). Los golden se generaron con un ICU y
// el runner puede usar otro; se normalizan ambos espacios duros a un espacio
// normal para que la comparacion sea agnostica al ICU y no fragil entre entornos.
const NBSP = String.fromCharCode(0x00a0)   // no-break space
const NNBSP = String.fromCharCode(0x202f)  // narrow no-break space

function normalizarHtmlGolden(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .split(NBSP).join(' ')
    .split(NNBSP).join(' ')
    .replace(/[ \t]+(?=\n)/g, '')
}

const ANCHOS = [
  { sufijo: '58mm', options: RENDER_OPTIONS_58MM },
  { sufijo: '80mm', options: RENDER_OPTIONS_80MM },
] as const

if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true })

for (const caso of GOLDEN_CASES) {
  for (const ancho of ANCHOS) {
    test(`golden: ${caso.nombre} (${ancho.sufijo})`, () => {
      const modelo = construirModelo(caso)
      const html = renderTicket(modelo, ancho.options, caso.assets)
      const goldenPath = path.join(GOLDEN_DIR, `${caso.nombre}-${ancho.sufijo}.html`)

      if (process.env.GOLDEN_UPDATE === '1') {
        writeFileSync(goldenPath, html, 'utf-8')
        return
      }

      assert.ok(
        existsSync(goldenPath),
        `Falta el golden "${goldenPath}". Genera la linea base con: GOLDEN_UPDATE=1 npm run test:tickets`
      )
      const esperado = readFileSync(goldenPath, 'utf-8')
      assert.equal(
        normalizarHtmlGolden(html),
        normalizarHtmlGolden(esperado),
        `El HTML renderizado para "${caso.nombre}" (${ancho.sufijo}) cambio respecto al golden guardado.`
      )
    })
  }
}

test('golden: caso "descuentos" — reservado, no implementado en H1', { skip: true }, () => {
  // El dominio de ventas todavia no produce descuentos por linea ni globales
  // (TicketItem.descuento / TicketTotales.totalDescuento estan reservados en
  // el modelo, ver ticket-model.ts). Cuando exista un builder que los
  // alimente, agregar el fixture correspondiente a GOLDEN_CASES y quitar
  // este skip.
})
