import assert from 'node:assert/strict'
import test from 'node:test'
import { runTenantResolution } from '@/lib/tenant-resolution-runner'

test('runTenantResolution finaliza la carga y notifica un fallo inesperado', async () => {
  const expectedError = new Error('fallo de red')
  const calls: string[] = []
  let receivedError: unknown

  await runTenantResolution(
    async () => { throw expectedError },
    (error) => { receivedError = error; calls.push('error') },
    () => { calls.push('settled') },
  )

  assert.equal(receivedError, expectedError)
  assert.deepEqual(calls, ['error', 'settled'])
})

test('runTenantResolution finaliza la carga después de una resolución exitosa', async () => {
  const calls: string[] = []

  await runTenantResolution(
    async () => { calls.push('resolved') },
    () => { calls.push('error') },
    () => { calls.push('settled') },
  )

  assert.deepEqual(calls, ['resolved', 'settled'])
})
