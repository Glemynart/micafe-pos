import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('las rutas runtime de reservas y Wompi no consultan esFundacional', () => {
  const root = path.resolve('app/api')
  const files = [
    'reservas/salas/route.ts',
    'reservas/hold/route.ts',
    'reservas/disponibilidad/route.ts',
    'reservas/cancelar/route.ts',
    'webhooks/wompi/route.ts',
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(source.includes("where('esFundacional'"), false, file)
  }
})

test('salas solo expone el catálogo de tenants en trial o activos', () => {
  const source = fs.readFileSync(path.resolve('app/api/reservas/salas/route.ts'), 'utf8')
  assert.match(source, /empresa\.estado !== 'trial' && empresa\.estado !== 'activa'/)
})
