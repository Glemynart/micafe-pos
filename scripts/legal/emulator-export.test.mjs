import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadSource } from './firestore-source.mjs';
import { createStorageReader } from './storage-source.mjs';
import { exportTenant, verifyBundle } from './tenant-export.mjs';

test('exportación sintética usa consultas REST aisladas por tenant', async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host ?? '', /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
  assert.match(storageHost, /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const project = 'demo-dusema-export';
  const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  const bucket = `${project}.firebasestorage.app`;
  const assetName = 'tenants/tenant-a/productos/synthetic.png';
  const assetBytes = Buffer.from('synthetic-storage-asset');
  const uploadUrl = `http://${storageHost}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(assetName)}`;
  let uploadedToEmulator = false;
  try {
    const uploaded = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer owner' }, body: assetBytes });
    assert.equal(uploaded.ok, true, 'synthetic asset must upload to Storage Emulator');
    uploadedToEmulator = true;
    for (const [id, tenant, nombre] of [['a', 'tenant-a', 'PRODUCTO_PROPIO'], ['b', 'tenant-b', 'PRODUCTO_AJENO']]) {
      const fields = { empresaId: { stringValue: tenant }, nombre: { stringValue: nombre }, stock: { integerValue: '3' } };
      if (id === 'a') fields.imagenUrl = { stringValue: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(assetName)}?alt=media&token=SYNTHETIC_STORAGE_TOKEN` };
      const response = await fetch(`${base}/productos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields }) });
      assert.equal(response.ok, true);
    }
    for (const [tenant, marker] of [['tenant-a', 'ADMIN_PROPIO'], ['tenant-b', 'ADMIN_AJENO']]) {
      const company = await fetch(`${base}/empresas/${tenant}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { empresaId: { stringValue: tenant }, nombre: { stringValue: 'Empresa sintética' } } }) });
      assert.equal(company.ok, true);
      const receipt = await fetch(`${base}/empresas/${tenant}/aceptacionesLegales/recibo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { empresaId: { stringValue: tenant }, uid: { stringValue: marker }, bundleId: { stringValue: 'bundle-sintetico' }, aceptadoEn: { timestampValue: '2026-11-24T00:00:00Z' }, documentos: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'terminos' }, version: { stringValue: '1' }, sha256: { stringValue: 'a'.repeat(64) } } } }] } } } }) });
      assert.equal(receipt.ok, true);
    }
    const readTime = new Date().toISOString();
    const tenant = 'tenant-a', requestId = 'synthetic-request';
    const storage = createStorageReader({ bucket, getAccessToken: async () => 'owner', fetchImpl: (url, options) => fetch(url.replace('https://storage.googleapis.com', `http://${storageHost}`), options) });
    const source = createReadSource({ project, tenant, getAccessToken: async () => 'owner',
      authorize: async () => ({ project, tenant, requestId, requestReference: 'synthetic-proof', uid: 'operator-a', active: true, canConserve: true, requestVerified: true, authorizationVersion: 1 }),
      storage,
      fetchImpl: (url, options) => fetch(url.replace('https://firestore.googleapis.com/v1', `http://${host}/v1`), options),
    });
    const bundle = await exportTenant({ project, tenant, requestId, readTime, sourceSha: 'a'.repeat(40), source });
    assert.equal(verifyBundle(bundle), true);
    assert.equal(bundle.manifest.totalDocuments, 3);
    assert.match(JSON.stringify(bundle), /PRODUCTO_PROPIO/);
    assert.doesNotMatch(JSON.stringify(bundle), /PRODUCTO_AJENO/);
    assert.match(JSON.stringify(bundle), /ADMIN_PROPIO/);
    assert.doesNotMatch(JSON.stringify(bundle), /ADMIN_AJENO/);
    assert.doesNotMatch(JSON.stringify(bundle), /SYNTHETIC_STORAGE_TOKEN/);
    assert.ok(bundle.files.some(file => file.name === 'empresas/tenant-a/aceptacionesLegales.jsonl'));
    const productRow = JSON.parse(bundle.files.find(file => file.name === 'productos.jsonl').content);
    const assetRef = productRow.data.imagenUrl;
    const bundledAsset = bundle.files.find(file => file.encoding === 'base64');
    assert.equal(assetRef.type, 'TENANT_STORAGE_ASSET');
    assert.equal(assetRef.generation, bundledAsset.generation);
    assert.equal(Buffer.from(bundledAsset.content, 'base64').toString(), assetBytes.toString());
    assert.equal(bundle.manifest.sources.find(row => row.path === 'storage/tenants/tenant-a').count, 1);
  } finally {
    if (uploadedToEmulator) {
      const objectUrl = `http://${storageHost}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(assetName)}`;
      const deleted = await fetch(objectUrl, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
      assert.equal(deleted.status, 204, 'synthetic Storage Emulator asset must be removed');
    }
  }
});
