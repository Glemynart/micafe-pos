import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadSource } from './firestore-source.mjs';
import { exportTenant, verifyBundle } from './tenant-export.mjs';

test('exportación sintética usa consultas REST aisladas por tenant', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host ?? '', /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const project = 'demo-dusema-export';
  const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  for (const [id, tenant, nombre] of [['a', 'tenant-a', 'PRODUCTO_PROPIO'], ['b', 'tenant-b', 'PRODUCTO_AJENO']]) {
    const response = await fetch(`${base}/productos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { empresaId: { stringValue: tenant }, nombre: { stringValue: nombre }, stock: { integerValue: '3' } } }) });
    assert.equal(response.ok, true);
  }
  const readTime = new Date().toISOString();
  const tenant = 'tenant-a', requestId = 'synthetic-request';
  const source = createReadSource({ project, tenant, getAccessToken: async () => 'owner',
    authorize: async () => ({ project, tenant, requestId, uid: 'operator-a', active: true, canConserve: true, requestVerified: true, authorizationVersion: 1 }),
    storage: { list: async () => [], read: async () => { throw new Error('UNEXPECTED_ASSET'); } },
    fetchImpl: (url, options) => fetch(url.replace('https://firestore.googleapis.com/v1', `http://${host}/v1`), options),
  });
  const bundle = await exportTenant({ project, tenant, requestId, readTime, sourceSha: 'a'.repeat(40), source });
  assert.equal(verifyBundle(bundle), true);
  assert.equal(bundle.manifest.totalDocuments, 1);
  assert.match(JSON.stringify(bundle), /PRODUCTO_PROPIO/);
  assert.doesNotMatch(JSON.stringify(bundle), /PRODUCTO_AJENO/);
});
