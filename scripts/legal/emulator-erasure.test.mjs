import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmulatorErasure } from './emulator-erasure.mjs';

const project = 'demo-dusema-erasure';
const host = process.env.FIRESTORE_EMULATOR_HOST;
const context = { project, tenant: 'tenant-a', requestId: 'erase-a' };
const authorize = async ctx => ({ ...ctx, uid: 'operator-a', active: true, canConserve: true, requestVerified: true, authorizationVersion: 1 });

test('remote project, non-loopback, missing operator and production adapters are rejected before network', async () => {
  for (const config of [{ project: 'micafe-pos', host: '127.0.0.1:8085' }, { project, host: 'firestore.googleapis.com:443' }, { project, host: '127.0.0.1:99999' }]) assert.throws(() => createEmulatorErasure({ ...config, authorize }), /EMULATOR_ONLY/);
  const executor = createEmulatorErasure({ project, host: '127.0.0.1:8085', authorize, fetchImpl: () => { throw new Error('NETWORK_MUST_NOT_BE_USED'); } });
  await assert.rejects(executor.execute({ ...context, paths: ['ventas/sale'], now: '2026-11-23' }), /UNSUPPORTED_ADAPTER/);
});

test('Firestore Emulator: atomic deletion, retention, tenant isolation, replay and stale version', { skip: !host }, async () => {
  assert.match(host, /^127\.0\.0\.1:[0-9]+$/);
  const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
  const fixture = { empresaId: 'tenant-a', syntheticFixture: true, terminatedAt: '2026-01-01T00:00:00Z', policyApproved: true, deliveryConfirmed: true, classification: 'DISPOSABLE_OPERATIONAL', legalHold: false, sharedIdentity: false, referencesChecked: true };
  const seed = async (name, values = {}) => {
    const fields = Object.fromEntries(Object.entries({ ...fixture, ...values }).map(([key, value]) => [key, typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value }]));
    const res = await fetch(base + '/' + name, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
    assert.equal(res.ok, true);
  };
  const exists = async name => (await fetch(base + '/' + name, { headers })).status === 200;
  const path = id => 'legal_exit_fixtures/' + id;
  const run = (executor, requestId, ids) => executor.execute({ tenant: 'tenant-a', requestId, paths: ids.map(path), now: '2026-11-23T12:00:00Z' });
  const executor = createEmulatorErasure({ project, host, authorize });
  await seed(path('a'));
  await seed(path('b'), { empresaId: 'tenant-b' });
  await assert.rejects(run(executor, 'cross', ['a', 'b']), /SCOPE_DENIED/);
  assert.equal(await exists(path('a')), true);
  await seed(path('parent'));
  await seed(path('parent') + '/children/child');
  await assert.rejects(run(executor, 'children', ['parent']), /CHILDREN_BLOCKED/);
  assert.equal(await exists(path('parent') + '/children/child'), true);
  for (const [name, overrides] of Object.entries({ hold: { legalHold: true }, shared: { sharedIdentity: true }, ledger: { classification: 'LEDGER' }, contract: { classification: 'CONTRACT_EVIDENCE' }, references: { referencesChecked: false }, delivery: { deliveryConfirmed: false }, window: { terminatedAt: '2026-11-22T00:00:00Z' } })) {
    await seed(path(name), overrides);
    await assert.rejects(run(executor, 'blocked-' + name, ['a', name]), /RETENTION_BLOCKED/);
    assert.equal(await exists(path(name)), true);
    assert.equal(await exists(path('a')), true);
  }
  let checks = 0;
  const revoked = createEmulatorErasure({ project, host, authorize: async ctx => ({ ...await authorize(ctx), active: ++checks < 3 }) });
  await assert.rejects(run(revoked, 'revoked', ['a']), /AUTHORIZATION_DENIED/);
  assert.equal(await exists(path('a')), true);
  await seed(path('race'));
  const stale = createEmulatorErasure({ project, host, authorize, fetchImpl: async (url, options) => {
    if (url.endsWith(':commit')) await seed(path('race'), { legalHold: true });
    return fetch(url, options);
  } });
  await assert.rejects(run(stale, 'stale', ['a', 'race']), /ERASURE_HTTP_/);
  assert.equal(await exists(path('a')), true);
  assert.equal(await exists(path('race')), true);
  const result = await run(executor, 'success', ['a']);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(await exists(path('a')), false);
  assert.equal(await exists(path('b')), true);
  assert.equal((await run(executor, 'success', ['a'])).status, 'ALREADY_VERIFIED');
  await assert.rejects(run(executor, 'success', ['b']), /REQUEST_CONFLICT/);
  await seed(path('a'));
  await assert.rejects(run(executor, 'success', ['a']), /RECREATED_RECORD/);
});
