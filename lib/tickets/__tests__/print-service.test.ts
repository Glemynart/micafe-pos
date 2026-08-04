import assert from 'node:assert/strict'
import test from 'node:test'
import {
  imprimirTicketHtml,
  resolverOpcionesImpresion,
} from '../print-service'

const ventanaOriginal = (globalThis as any).window

test('P0-07: resuelve el layout canónico de 58 y 80 mm', () => {
  assert.equal(resolverOpcionesImpresion('MM_58').anchoCuerpoPx, 210)
  assert.equal(resolverOpcionesImpresion('MM_80').anchoCuerpoPx, 280)
  assert.equal(resolverOpcionesImpresion('CARTA').anchoCuerpoPx, 280)
})

test('P0-07: usa el puente Electron de impresora cuando está disponible', async () => {
  let htmlRecibido = ''
  ;(globalThis as any).window = {
    api: { print: { toPrinter: async (html: string) => { htmlRecibido = html; return { success: true } } } },
  }

  try {
    const resultado = await imprimirTicketHtml('<html>ticket</html>')
    assert.deepEqual(resultado, { success: true, channel: 'electron-printer' })
    assert.equal(htmlRecibido, '<html>ticket</html>')
  } finally {
    ;(globalThis as any).window = ventanaOriginal
  }
})

test('P0-07: informa popup bloqueado en PWA en lugar de ignorar la impresión', async () => {
  ;(globalThis as any).window = { open: () => null }

  try {
    const resultado = await imprimirTicketHtml('<html>ticket</html>')
    assert.deepEqual(resultado, { success: false, channel: 'browser-dialog', reason: 'POPUP_BLOQUEADO' })
  } finally {
    ;(globalThis as any).window = ventanaOriginal
  }
})

test('P0-07: abre un documento aislado y solicita impresión estándar en PWA', async () => {
  let contenido = ''
  let imprimio = false
  let cerro = false
  const ventana = {
    closed: false,
    document: {
      readyState: 'complete',
      open: () => undefined,
      write: (html: string) => { contenido = html },
      close: () => undefined,
    },
    focus: () => undefined,
    print: () => { imprimio = true },
    addEventListener: (_evento: string, callback: () => void) => callback(),
    close: () => { cerro = true },
  }
  ;(globalThis as any).window = {
    open: () => ventana,
    setTimeout: (callback: () => void) => { callback(); return 0 },
  }

  try {
    const resultado = await imprimirTicketHtml('<html><head></head><body>ticket</body></html>')
    assert.deepEqual(resultado, { success: true, channel: 'browser-dialog' })
    assert.equal(imprimio, true)
    assert.equal(cerro, true)
    assert.match(contenido, /@page \{ margin: 0; \}/)
    assert.match(contenido, /ticket/)
  } finally {
    ;(globalThis as any).window = ventanaOriginal
  }
})
