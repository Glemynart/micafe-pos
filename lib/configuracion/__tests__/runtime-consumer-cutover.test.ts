import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const runtimeConsumers = [
  'contexts/modulos-context.tsx',
  'components/pos/sell-module.tsx',
  'components/pos/settings-module.tsx',
  'components/pos/shifts-module.tsx',
  'components/pos/global-close-shift.tsx',
  'components/pos/turno-gate.tsx',
]

test('los consumidores tenant usan ConfiguracionEmpresaProvider y no el singleton legacy', () => {
  for (const consumer of runtimeConsumers) {
    const source = readFileSync(resolve(process.cwd(), consumer), 'utf8')

    assert.doesNotMatch(source, /configuracion-service/)
    assert.match(source, /configuracion-empresa-context/)
  }
})

test('el servicio cliente del singleton legacy ya no existe en el runtime', () => {
  assert.equal(
    existsSync(resolve(process.cwd(), 'lib/configuracion-service.ts')),
    false,
    'configuracion/general no puede conservar un listener ni defaults de runtime',
  )
})
