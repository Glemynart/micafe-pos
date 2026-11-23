import test from 'node:test';
import assert from 'node:assert/strict';
import { exportTenant, verifyBundle } from './tenant-export.mjs';
import { createReadSource, decodeFields } from './firestore-source.mjs';
import { encryptBundle, decryptBundle } from './encrypted-bundle.mjs';
import { planRetention } from './retention-plan.mjs';
import { createOperatorAuthorizer } from './operator-authority.mjs';
import { createStorageReader } from './storage-source.mjs';
import { savePrivateBundle } from './private-output.mjs';
import { inspectCoverage, INTERNAL_ROOTS, projectDocument, SCHEMAS } from './export-schema.mjs';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const time = Date.parse('2026-11-23T12:00:00.000Z');
const input = { project: 'demo-dusema-exit', tenant: 'tenant-a', readTime: new Date(time).toISOString(), requestId: 'request-a', sourceSha: 'a'.repeat(40), now: () => time };
const product = { empresaId: 'tenant-a', nombre: 'Agua de prueba', stock: 0, costo: 23900, pinHash: 'SECRET_NOT_TO_EXPORT' };
function fixture(extra = {}) {
  const data = { productos: [{ id: 'a', data: product }], ventas: [{ id: 'sale', data: { empresaId: 'tenant-a', schemaVersion: 'BODEGA_MVP1_V2', saldoPendienteCOP: 27000 } }], 'ventas/sale/abonos_bodega': [{ id: 'pay', data: { empresaId: 'tenant-a', montoCOP: 1000, ventaId: 'sale' } }] };
  return {
    authorize: async () => ({ ...input, uid: 'operator-a', active: true, canConserve: true, requestVerified: true, authorizationVersion: 1 }),
    listRoots: async () => ['productos', 'ventas', 'credenciales_operativas'],
    readPage: async ctx => ({ readTime: ctx.readTime, documents: (data[ctx.path] ?? []).filter(doc => !ctx.after || doc.id > ctx.after), hasMore: false }),
    listChildren: async ctx => ctx.path === 'ventas/sale' ? ['abonos_bodega'] : [],
    listAssets: async () => [{ name: 'tenants/tenant-a/productos/e/image.png', generation: '42', bytes: 3 }],
    readAsset: async () => Buffer.from('abc'),
    ...extra,
  };
}
test('two-tenant boundary, credit children, exact COP and credential exclusion', async () => {
  const bundle = await exportTenant({ ...input, source: fixture() });
  assert.equal(bundle.manifest.totalDocuments, 3);
  assert.ok(bundle.files.some(f => f.name.includes('abonos_bodega')));
  assert.match(JSON.stringify(bundle), /23900/);
  assert.doesNotMatch(JSON.stringify(bundle), /SECRET_NOT_TO_EXPORT|pinHash/);
  assert.equal(verifyBundle(bundle), true);
  const source = fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'foreign', data: { ...product, empresaId: 'tenant-b' } }], hasMore: false }) });
  await assert.rejects(exportTenant({ ...input, source }), /EXPORT_CROSS_TENANT/);
});
test('unknown field, source and child stop completion without disclosing their values', async () => {
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'a', data: { ...product, internalNote: 'SECRET_VALUE' } }], hasMore: false }) }) }), /^Error: EXPORT_UNSUPPORTED_FIELD$/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listRoots: async () => ['unknown_source'] }) }), /EXPORT_UNKNOWN_COLLECTION/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listChildren: async () => ['secret_children'] }) }), /EXPORT_UNCLASSIFIED_SUBCOLLECTION/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listRoots: async () => ['configuracion'] }) }), /EXPORT_ADAPTER_REQUIRED/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'a', data: { ...product, schemaVersion: 'FUTURE' } }], hasMore: false }) }) }), /EXPORT_UNSUPPORTED_SCHEMA_VERSION/);
});
test('revoked operator, unverified request and changed authority fail closed', async () => {
  const valid = await fixture().authorize();
  for (const invalid of [{ active: false }, { canConserve: false }, { requestVerified: false }, { tenant: 'tenant-b' }]) {
    await assert.rejects(exportTenant({ ...input, source: fixture({ authorize: async () => ({ ...valid, ...invalid }) }) }), /EXPORT_AUTHORIZATION_DENIED/);
  }
  let count = 0;
  await assert.rejects(exportTenant({ ...input, source: fixture({ authorize: async () => ({ ...valid, authorizationVersion: ++count }) }) }), /EXPORT_AUTHORITY_CHANGED/);
});
test('fixed readTime and unstable pagination are checked on every page', async () => {
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async () => ({ readTime: '2026-11-23T12:01:00Z', documents: [], hasMore: false }) }) }), /EXPORT_INCONSISTENT_PAGE/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listRoots: async () => ['productos'], readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'a', data: product }], hasMore: true }) }) }), /EXPORT_UNSTABLE_PAGINATION/);
});
test('pagination, empty source, metadata and document budgets', async () => {
  const source = fixture({ listRoots: async () => ['productos', 'proveedores'], listChildren: async () => [], listAssets: async () => [],
    readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'proveedores' ? [] : [{ id: ctx.after ? 'b' : 'a', data: product }], hasMore: ctx.path === 'productos' && !ctx.after }) });
  const result = await exportTenant({ ...input, source });
  assert.equal(result.manifest.totalDocuments, 2);
  assert.ok(result.manifest.sources.some(s => s.path === 'proveedores' && s.count === 0));
  await assert.rejects(exportTenant({ ...input, source, maxDocuments: 1 }), /EXPORT_BUDGET_EXCEEDED/);
  await assert.rejects(exportTenant({ ...input, source, maxBytes: 2 }), /EXPORT_BUDGET_EXCEEDED/);
});
test('expired snapshot aborts rather than mixing in current reads', async () => {
  let ticks = 0;
  await assert.rejects(exportTenant({ ...input, now: () => time + (++ticks > 2 ? 46 * 60_000 : 0), source: fixture() }), /EXPORT_READ_WINDOW_EXPIRED/);
});
test('asset prefix, generation, size and path traversal checks', async () => {
  const source = fixture();
  for (const name of ['tenants/tenant-b/image.png', 'tenants/tenant-a/../secret', 'tenants/tenant-a/a\\b']) {
    await assert.rejects(exportTenant({ ...input, source: fixture({ listAssets: async () => [{ name, generation: '42', bytes: 3 }] }) }), /EXPORT_INVALID_ASSET/);
  }
  await assert.rejects(exportTenant({ ...input, source: { ...source, readAsset: async () => Buffer.from('different') } }), /EXPORT_ASSET_CHANGED/);
});
test('AES-GCM encrypted bundle authenticates contents and wrong key/tampering fail', async () => {
  const bundle = await exportTenant({ ...input, source: fixture() });
  const key = Buffer.alloc(32, 1), encrypted = encryptBundle(bundle, key);
  assert.ok(!encrypted.includes(Buffer.from(product.nombre)));
  assert.deepEqual(JSON.parse(JSON.stringify(bundle)), decryptBundle(encrypted, key));
  await assert.rejects(async () => decryptBundle(encrypted, Buffer.alloc(32, 2)), /EXPORT_DECRYPT_OR_INTEGRITY_FAILED/);
  encrypted[25] ^= 1;
  assert.throws(() => decryptBundle(encrypted, key), /EXPORT_DECRYPT_OR_INTEGRITY_FAILED/);
});
test('hash mismatch invalidates delivery', async () => {
  const bundle = await exportTenant({ ...input, source: fixture() });
  bundle.files[0].content += 'changed';
  assert.throws(() => verifyBundle(bundle), /EXPORT_HASH_MISMATCH/);
});
test('Firestore scalar decoder rejects precision loss and opaque types', () => {
  assert.equal(decodeFields({ cost: { integerValue: '23900' } }).cost, 23900);
  assert.equal(decodeFields({ when: { timestampValue: '2026-11-23T12:00:00.123456Z' } }).when, '2026-11-23T12:00:00.123456Z');
  assert.throws(() => decodeFields({ x: { integerValue: '9007199254740993' } }), /EXPORT_INTEGER_OUT_OF_RANGE/);
  assert.throws(() => decodeFields({ x: { referenceValue: 'other-project/secret' } }), /EXPORT_UNSUPPORTED_FIRESTORE_TYPE/);
});
test('REST adapter uses snapshot, tenant filter, document-name cursor and no write endpoint', async () => {
  const calls = [];
  const source = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'TEST_TOKEN', authorize: fixture().authorize, storage: {}, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), method: options.method });
    return { ok: true, json: async () => [] };
  } });
  await source.readPage({ ...input, path: 'productos', after: 'a', limit: 200 });
  assert.match(calls[0].url, /documents:runQuery$/);
  assert.equal(calls[0].body.readTime, input.readTime);
  assert.equal(calls[0].body.structuredQuery.where.fieldFilter.value.stringValue, 'tenant-a');
  assert.equal(calls[0].body.structuredQuery.startAt.before, false);
  assert.deepEqual(Object.keys(source).sort(), ['authorize', 'listAssets', 'listChildren', 'listRoots', 'readAsset', 'readPage']);
});
test('retention planner never executes and blocks legal evidence, holds and shared identities', () => {
  const base = { tenant: 'tenant-a', terminatedAt: '2026-08-01T00:00:00Z', now: input.readTime, policyApproved: true, deliveryConfirmed: true };
  const row = { empresaId: 'tenant-a', path: 'productos/a', classification: 'DISPOSABLE_OPERATIONAL', legalHold: false, sharedIdentity: false, referencesChecked: true };
  const plan = planRetention({ ...base, records: [row, { ...row, path: 'ledger/b', classification: 'LEDGER' }, { ...row, path: 'usuarios/a', sharedIdentity: true }] });
  assert.equal(plan.executable, false);
  assert.equal(plan.entries[0].decision, 'REQUIRES_AUTHORIZED_EXECUTOR');
  assert.equal(plan.entries[1].decision, 'BLOCKED');
  assert.equal(plan.entries[2].decision, 'BLOCKED');
  assert.doesNotMatch(JSON.stringify(plan), /productos\/a/);
  assert.equal(planRetention({ ...base, policyApproved: false, records: [row] }).entries[0].decision, 'BLOCKED');
  assert.throws(() => planRetention({ ...base, records: [{ ...row, empresaId: 'tenant-b' }] }), /RETENTION_INVALID_SCOPE/);
});

test('real authority adapter verifies revoked tokens, project, current operator and representative request', async () => {
  const claims = { uid: 'operator-a', aud: input.project, iss: `https://securetoken.google.com/${input.project}`, saas: { operador: true, versionAutorizacion: 4 } };
  const operator = { uid: 'operator-a', estado: 'ACTIVO', facultades: ['CONSERVACION_GOBERNAR'], versionAutorizacion: 4 };
  let verifies = 0;
  const config = {
    now: () => time, request: { ...input, operatorUid: 'operator-a', validUntil: '2026-11-24T00:00:00Z' },
    readIdToken: async () => 'SYNTHETIC_ID_TOKEN',
    auth: { verifyIdToken: async (_, checkRevoked) => { assert.equal(checkRevoked, true); verifies++; return claims; } },
    db: { collection: collection => ({ doc: () => ({ get: async () => ({ exists: true, data: () => collection === 'saas_operadores' ? operator : { estado: 'cancelada' } }) }) }) },
    verifyRequest: async () => ({ verified: true, ...input, reference: 'request-reference' }),
  };
  assert.equal((await createOperatorAuthorizer(config)(input)).uid, 'operator-a');
  assert.equal(verifies, 1);
  await assert.rejects(createOperatorAuthorizer({ ...config, auth: { verifyIdToken: async () => ({ ...claims, aud: 'another-project' }) } })(input), /^Error: EXPORT_AUTHORIZATION_DENIED$/);
  await assert.rejects(createOperatorAuthorizer({ ...config, verifyRequest: async () => ({ verified: true, ...input, tenant: 'tenant-b', reference: 'x' }) })(input), /EXPORT_AUTHORIZATION_DENIED/);
  operator.estado = 'REVOCADO';
  await assert.rejects(createOperatorAuthorizer(config)(input), /EXPORT_AUTHORIZATION_DENIED/);
});
test('Storage reads use tenant prefix, exact generation and precondition; no download tokens', async () => {
  const calls = [];
  const source = createStorageReader({ bucket: 'demo-exit.example', getAccessToken: async () => 'SYNTHETIC', fetchImpl: async url => {
    calls.push(new URL(url));
    return { ok: true, json: async () => ({ items: [{ name: 'tenants/tenant-a/image.png', generation: '123', size: '3' }] }), arrayBuffer: async () => Buffer.from('abc') };
  } });
  const [asset] = await source.list({ tenant: 'tenant-a' });
  assert.equal(calls[0].searchParams.get('prefix'), 'tenants/tenant-a/');
  assert.equal(calls[0].searchParams.get('fields'), 'items(name,generation,size),nextPageToken');
  assert.equal(Buffer.from(await source.read({ ...asset, tenant: 'tenant-a' })).toString(), 'abc');
  assert.equal(calls[1].searchParams.get('generation'), '123');
  assert.equal(calls[1].searchParams.get('ifGenerationMatch'), '123');
  await assert.rejects(source.read({ ...asset, tenant: 'tenant-b' }), /EXPORT_INVALID_ASSET/);
});
test('private output writes authenticated ciphertext outside Git, with a fresh directory', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'dusema-exit-test-'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  let result;
  try {
    const bundle = await exportTenant({ ...input, source: fixture() });
    result = await savePrivateBundle({ parent, repository, bundle, key: Buffer.alloc(32, 3) });
    const bytes = await readFile(result.output);
    assert.ok(!bytes.includes(Buffer.from(product.nombre)));
    assert.equal(decryptBundle(bytes, Buffer.alloc(32, 3)).manifest.tenant, 'tenant-a');
    await assert.rejects(savePrivateBundle({ parent: repository, repository, bundle, key: Buffer.alloc(32, 3) }), /EXPORT_UNSAFE_OUTPUT_DIRECTORY/);
  } finally {
    // Exact synthetic files only; no recursive directory deletion.
    if (result) { await unlink(result.output); await rmdir(dirname(result.output)); }
    await rmdir(parent);
  }
});

test('canonical subscription path includes legacy control and rejects a conflicting tenant field', async () => {
  const source = fixture({ listRoots: async () => ['suscripciones'], listAssets: async () => [],
    listChildren: async ctx => ctx.path === 'suscripciones/tenant-a' ? ['relaciones'] : [],
    readPage: async ctx => ({ readTime: ctx.readTime, hasMore: false, documents: ctx.path === 'suscripciones'
      ? [{ id: 'tenant-a', data: { estado: 'active', revision: 1 } }]
      : [{ id: '_vigente', data: { relacionVigenteId: 'relation-a' } }] }),
  });
  assert.equal((await exportTenant({ ...input, source })).manifest.totalDocuments, 2);
  await assert.rejects(exportTenant({ ...input, source: { ...source, readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'tenant-a', data: { empresaId: 'tenant-b', estado: 'active' } }], hasMore: false }) } }), /EXPORT_CROSS_TENANT/);
});
test('legacy users are selected only from fully scanned tenant memberships', async () => {
  const calls = [];
  const source = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'SYNTHETIC', authorize: fixture().authorize, storage: {}, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    const name = `projects/${input.project}/databases/(default)/documents/`;
    return { ok: true, json: async () => url.endsWith(':batchGet')
      ? [{ readTime: input.readTime, found: { name: name + 'usuarios/member-a', fields: { nombre: { stringValue: 'Synthetic member' } } } }]
      : [{ readTime: input.readTime, document: { name: name + 'membresias/member-a_tenant-a', fields: { uid: { stringValue: 'member-a' }, empresaId: { stringValue: input.tenant } } } }] };
  } });
  await assert.rejects(source.readPage({ ...input, path: 'usuarios', limit: 200 }), /MEMBERSHIP_NOT_SCANNED/);
  await source.readPage({ ...input, path: 'membresias', limit: 200 });
  const page = await source.readPage({ ...input, path: 'usuarios', limit: 200 });
  assert.equal(page.documents[0].id, 'member-a');
  assert.equal(calls.at(-1).body.documents.length, 1);
  assert.match(calls.at(-1).body.documents[0], /usuarios\/member-a$/);
});

test('closed adapters cover salon, reservations, fiscal numbering and audit records', () => {
  const roots = ['agendas', 'auditoria_logs', 'comandas_cocina', 'eventos_dominio', 'numeraciones', 'pedidos_activos', 'reservas', 'configuracion', 'operaciones_auditoria'];
  const coverage = inspectCoverage(roots);
  assert.equal(coverage.mode, 'METADATA_ONLY');
  assert.equal(coverage.productionExportCertified, false);
  assert.deepEqual(coverage.classifications.filter(row => row.status === 'ADAPTER_REQUIRED').map(row => row.name), ['operaciones_auditoria']);
  assert.ok(INTERNAL_ROOTS.has('configuracion'));
  const agenda = projectDocument({ empresaId: 'tenant-a', mesaId: 'mesa-a', bloques: { '09': { reservaId: 'res-a', estado: 'confirmado' } } }, SCHEMAS.agendas);
  assert.equal(agenda.bloques['09'].reservaId, 'res-a');
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', mesaId: 'mesa-a', bloques: { '09': { reservaId: 'res-a', ownerUid: 'secret' } } }, SCHEMAS.agendas), /UNSUPPORTED_FIELD/);
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', mesaId: 'mesa-a', bloques: { '../bad': { reservaId: 'res-a', estado: 'hold' } } }, SCHEMAS.agendas), /INVALID_RECORD_KEY/);
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', mesaId: 'mesa-a', bloques: [] }, SCHEMAS.agendas), /INVALID_RECORD/);
  const pedido = projectDocument({ empresaId: 'tenant-a', items: [{ id: 'line-a', name: 'synthetic', quantity: 1, modificadores: [{ grupoId: 'g', opcionIds: ['o'] }] }] }, SCHEMAS.pedidos_activos);
  assert.equal(pedido.items[0].modificadores[0].opcionIds[0], 'o');
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', items: [{ id: 'line-a', name: 'synthetic', quantity: 1, customPriceSecret: 'x' }] }, SCHEMAS.pedidos_activos), /UNSUPPORTED_FIELD/);
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', referencias: { fieldNotReviewed: 'value' } }, { ...SCHEMAS.eventos_dominio, referencias: { ventaId: 'scalar' } }), /UNSUPPORTED_FIELD/);
});

test('canonical root is queried by document name and signed asset URLs do not leak', async () => {
  let body;
  const source = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'SYNTHETIC', authorize: fixture().authorize, storage: {}, fetchImpl: async (_, options) => {
    body = JSON.parse(options.body); return { ok: true, json: async () => [] };
  } });
  await source.readPage({ ...input, path: 'configuraciones', limit: 200 });
  assert.equal(body.structuredQuery.where.fieldFilter.field.fieldPath, '__name__');
  assert.match(body.structuredQuery.where.fieldFilter.value.referenceValue, /configuraciones\/tenant-a$/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: [{ id: 'a', data: { ...product, imagenUrl: 'https://example.test/image?token=SYNTHETIC_SECRET' } }], hasMore: false }) }) }), /^Error: EXPORT_PRIVATE_URL_REQUIRES_ASSET_REFERENCE$/);
});
