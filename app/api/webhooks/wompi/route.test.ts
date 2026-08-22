import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { procesarWebhookWompi } from './service'

test('webhook Next legacy falla cerrado y no procesa eventos', async () => {
  const response = await procesarWebhookWompi(new Request('https://app.test/api/webhooks/wompi', { method: 'POST', body: '{}' }))
  assert.equal(response.status, 503)
})

test('webhook Next legacy no contiene escrituras fiscales o financieras', () => {
  const source = fs.readFileSync(path.resolve('app/api/webhooks/wompi/service.ts'), 'utf8')
  for (const forbidden of ['cuentas_bancarias', 'numeraciones', 'transacciones_financieras', "collection('ventas')", 'montoTotal']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})
