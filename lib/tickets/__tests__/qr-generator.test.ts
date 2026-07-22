import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateQrDataUri, QrGenerator, DEFAULT_QR_OPTIONS } from '../qr-generator'

/**
 * Tests del generador de QR local (diseño H2 V3, PR2). Completamente
 * independientes de los golden del renderer: aquí no se renderiza ningún
 * ticket ni se comparan HTML. Se aseveran propiedades ESTRUCTURALES del Data
 * URI (no los bytes exactos del PNG, que pueden variar entre versiones de la
 * librería `qrcode`).
 */

const PAYLOAD_DIAN = 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentKey=abc123'
const PNG_PREFIX = 'data:image/png;base64,'

test('genera un Data URI PNG a partir de un payload', async () => {
  const uri = await generateQrDataUri(PAYLOAD_DIAN)
  assert.ok(uri.startsWith(PNG_PREFIX), `esperaba prefijo "${PNG_PREFIX}"`)
  assert.ok(uri.length > PNG_PREFIX.length, 'el Data URI no debe estar vacío')
})

test('QrGenerator.toDataUri es la misma función', async () => {
  assert.equal(QrGenerator.toDataUri, generateQrDataUri)
  const uri = await QrGenerator.toDataUri(PAYLOAD_DIAN)
  assert.ok(uri.startsWith(PNG_PREFIX))
})

test('es determinista: misma entrada y opciones producen la misma salida', async () => {
  const a = await generateQrDataUri(PAYLOAD_DIAN)
  const b = await generateQrDataUri(PAYLOAD_DIAN)
  assert.equal(a, b)
})

test('sin opciones equivale a DEFAULT_QR_OPTIONS', async () => {
  const implicito = await generateQrDataUri(PAYLOAD_DIAN)
  const explicito = await generateQrDataUri(PAYLOAD_DIAN, DEFAULT_QR_OPTIONS)
  assert.equal(implicito, explicito)
})

test('las opciones cambian la salida (width y errorCorrectionLevel)', async () => {
  const base = await generateQrDataUri(PAYLOAD_DIAN)
  const otroWidth = await generateQrDataUri(PAYLOAD_DIAN, { width: 500 })
  const otroEcl = await generateQrDataUri(PAYLOAD_DIAN, { errorCorrectionLevel: 'H' })
  assert.notEqual(base, otroWidth, 'un width distinto debe producir un PNG distinto')
  assert.notEqual(base, otroEcl, 'un ECL distinto debe producir un PNG distinto')
})

test('rechaza un payload vacío', async () => {
  await assert.rejects(() => generateQrDataUri(''), /vacío/)
})

test('rechaza un payload compuesto solo por espacios', async () => {
  await assert.rejects(() => generateQrDataUri('   '), /vacío/)
})

test('codifica un payload real DIAN sin lanzar', async () => {
  const uri = await generateQrDataUri(PAYLOAD_DIAN, { width: 300, margin: 4, errorCorrectionLevel: 'M' })
  assert.ok(uri.startsWith(PNG_PREFIX))
})
