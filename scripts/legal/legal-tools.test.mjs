import test from 'node:test';
import assert from 'node:assert/strict';
import { exportTenant, verifyBundle } from './tenant-export.mjs';
import { createReadSource, decodeFields } from './firestore-source.mjs';
import { encryptBundle, decryptBundle } from './encrypted-bundle.mjs';
import { planRetention } from './retention-plan.mjs';
import { createOperatorAuthorizer } from './operator-authority.mjs';
import { createStorageReader } from './storage-source.mjs';
import { savePrivateBundle } from './private-output.mjs';
import { runPrivateTenantExport } from './tenant-export-runner.mjs';
import { inspectCoverage, INTERNAL_ROOTS, projectDocument, SCHEMAS } from './export-schema.mjs';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const time = Date.parse('2026-11-23T12:00:00.000Z');
const input = { project: 'demo-dusema-exit', tenant: 'tenant-a', readTime: new Date(time).toISOString(), requestId: 'request-a', sourceSha: 'a'.repeat(40), now: () => time };
const product = { empresaId: 'tenant-a', nombre: 'Agua de prueba', stock: 0, costo: 23900, pinHash: 'SECRET_NOT_TO_EXPORT' };
function fixture(extra = {}) {
  const data = { productos: [{ id: 'a', data: product }], ventas: [{ id: 'sale', data: { empresaId: 'tenant-a', schemaVersion: 'BODEGA_MVP1_V2', saldoPendienteCOP: 27000 } }], 'ventas/sale/abonos_bodega': [{ id: 'pay', data: { empresaId: 'tenant-a', montoCOP: 1000, ventaId: 'sale' } }] };
  return {
    authorize: async () => ({ ...input, uid: 'operator-a', requestReference: 'request-reference', active: true, canConserve: true, requestVerified: true, authorizationVersion: 1 }),
    establishReadTime: async () => input.readTime,
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
  const source = fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: 'foreign', data: { ...product, empresaId: 'tenant-b' } }] : [], hasMore: false }) });
  await assert.rejects(exportTenant({ ...input, source }), /EXPORT_CROSS_TENANT/);
});
test('unknown field, source and child stop completion without disclosing their values', async () => {
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: 'a', data: { ...product, internalNote: 'SECRET_VALUE' } }] : [], hasMore: false }) }) }), /^Error: EXPORT_UNSUPPORTED_FIELD$/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listRoots: async () => ['unknown_source'] }) }), /EXPORT_UNKNOWN_COLLECTION/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ listChildren: async () => ['secret_children'] }) }), /EXPORT_UNCLASSIFIED_SUBCOLLECTION/);
  const emptyEvents = await exportTenant({ ...input, source: fixture({ listRoots: async () => ['eventos'] }) });
  assert.ok(emptyEvents.manifest.sources.some(source => source.path === 'eventos' && source.count === 0));
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: 'a', data: { ...product, schemaVersion: 'FUTURE' } }] : [], hasMore: false }) }) }), /EXPORT_UNSUPPORTED_SCHEMA_VERSION/);
});
test('eventos operativos exportan referencias comerciales y excluyen datos internos', () => {
  const data = projectDocument({ empresaId: 'tenant-a', schemaVersion: 1, eventoId: 'e1', tipo: 'RECORDATORIO_AGENDA_PEDIDO', agregado: { tipo: 'PROGRAMACION_PEDIDO_BODEGA', id: 'p1' }, actor: { uid: 'u1', rolEfectivo: 'admin' }, payloadOperativo: { programacionId: 'p1', fechaLocal: '2026-11-24', zonaHoraria: 'America/Bogota', etapa: 'HOY' }, estadoDespacho: 'ENVIADO', intentos: 1, claimId: 'INTERNAL', ultimoErrorCodigo: 'INTERNAL' }, SCHEMAS.eventos_operativos);
  assert.equal(data.payloadOperativo.programacionId, 'p1');
  assert.doesNotMatch(JSON.stringify(data), /INTERNAL/);
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', payloadOperativo: { desconocido: 'x' } }, SCHEMAS.eventos_operativos), /EXPORT_UNSUPPORTED_FIELD/);
});
test('exporta recibo legal del tenant con versiones y condiciones, sin correlación interna', async () => {
  const source = fixture({ listRoots: async () => ['empresas'], listAssets: async () => [],
    listChildren: async ({ path }) => path === 'empresas/tenant-a' ? ['aceptacionesLegales'] : [],
    readPage: async ctx => ({ readTime: ctx.readTime, hasMore: false, documents: ctx.path === 'empresas' ? [{ id: 'tenant-a', data: { empresaId: 'tenant-a', nombre: 'Empresa' } }]
      : ctx.path === 'empresas/tenant-a/aceptacionesLegales' ? [{ id: 'receipt', data: { empresaId: 'tenant-a', schemaVersion: 1, aceptacionId: 'receipt', uid: 'admin-a', relacion: 'ADMIN_TENANT_REPRESENTANTE_DECLARADO', referenciaContrato: 'relacion:r1', facultadRepresentacionDeclarada: true, bundleId: 'v1', aceptadoEn: '2026-11-24T12:00:00.000Z', documentos: [{ id: 'terminos', version: '1', sha256: 'a'.repeat(64) }], condicionesComerciales: { referenciaContrato: 'relacion:r1', precio: { importe: 1600000, moneda: 'COP' }, capacidades: ['sell'], limites: { usuarios: { unidad: 'cantidad', valor: 2 } }, fiscalidad: null }, correlationId: 'INTERNO' } }]
      : [] }),
  });
  const bundle = await exportTenant({ ...input, source });
  assert.equal(bundle.manifest.totalDocuments, 2);
  assert.match(JSON.stringify(bundle), /aceptacionesLegales/);
  assert.match(JSON.stringify(bundle), /1600000/);
  assert.doesNotMatch(JSON.stringify(bundle), /INTERNO/);
});
test('un adaptador definido no se bloquea por la lista histórica de pendientes', async () => {
  const source = fixture({ listRoots: async () => ['numeraciones'], readPage: async ctx => ({ readTime: ctx.readTime, documents: [], hasMore: false }) });
  const bundle = await exportTenant({ ...input, source });
  assert.equal(bundle.manifest.totalDocuments, 0);
});
test('la configuración histórica global se excluye sin consultarse ni entregarse', async () => {
  const bundle = await exportTenant({ ...input, source: fixture({
    listRoots: async () => ['configuracion'],
    readPage: async ctx => {
      if (ctx.path === 'configuracion') throw new Error('GLOBAL_NO_DEBE_LEERSE');
      return { readTime: ctx.readTime, documents: [], hasMore: false };
    },
    listAssets: async () => [],
  }) });
  assert.equal(bundle.manifest.totalDocuments, 0);
  assert.equal(bundle.files.length, 0);
  assert.ok(bundle.manifest.sources.some(source => source.path === 'configuracion' && source.excluded));
});
test('la salida comercial excluye expedientes de reclamo y el indicador interno', async () => {
  const bundle = await exportTenant({ ...input, source: fixture({
    listRoots: async () => ['clientes', 'privacidad_reclamos'],
    readPage: async ctx => {
      if (ctx.path !== 'clientes') return { readTime: ctx.readTime, documents: [], hasMore: false };
      return { readTime: ctx.readTime, documents: [{
        id: 'a', data: { empresaId: 'tenant-a', nombre: 'Cliente sintético', reclamosPrivacidadAbiertos: 1 },
      }], hasMore: false };
    },
  }) });
  assert.equal(bundle.manifest.totalDocuments, 1);
  assert.doesNotMatch(bundle.files[0].content, /reclamosPrivacidadAbiertos/);
  assert.ok(bundle.manifest.sources.some(source => source.path === 'privacidad_reclamos' && source.excluded));
});
test('la exportación clasifica las anotaciones privadas de la ficha y nunca lee sus motivos', async () => {
  let readPrivatePath = false;
  const bundle = await exportTenant({ ...input, source: fixture({
    listRoots: async () => ['clientes'],
    listChildren: async ({ path }) => path === 'clientes/a' ? ['anotaciones_privacidad'] : [],
    readPage: async ctx => {
      if (ctx.path === 'clientes/a/anotaciones_privacidad') { readPrivatePath = true; throw new Error('PRIVATE_REASON_READ'); }
      if (ctx.path !== 'clientes') return { readTime: ctx.readTime, documents: [], hasMore: false };
      return { readTime: ctx.readTime, documents: [{ id: 'a', data: { empresaId: 'tenant-a', nombre: 'Cliente sintético', reclamosPrivacidadAbiertos: 1 } }], hasMore: false };
    },
    listAssets: async () => [],
  }) });
  assert.equal(readPrivatePath, false);
  assert.equal(bundle.manifest.totalDocuments, 1);
  assert.ok(bundle.manifest.sources.some(source => source.path === 'clientes/anotaciones_privacidad'
    && source.excluded === 'PRIVATE_PRIVACY_CASE_DATA'));
  assert.doesNotMatch(JSON.stringify(bundle), /motivo privado sintético/);
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
  await assert.rejects(exportTenant({ ...input, source: fixture({ listRoots: async () => ['productos'], readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: 'a', data: product }] : [], hasMore: ctx.path === 'productos' }) }) }), /EXPORT_UNSTABLE_PAGINATION/);
});
test('pagination, empty source, metadata and document budgets', async () => {
  const source = fixture({ listRoots: async () => ['productos', 'proveedores'], listChildren: async () => [], listAssets: async () => [],
    readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: ctx.after ? 'b' : 'a', data: product }] : [], hasMore: ctx.path === 'productos' && !ctx.after }) });
  const result = await exportTenant({ ...input, source });
  assert.equal(result.manifest.totalDocuments, 2);
  assert.ok(result.manifest.sources.some(s => s.path === 'proveedores' && s.count === 0));
  await assert.rejects(exportTenant({ ...input, source, maxDocuments: 1 }), /EXPORT_BUDGET_EXCEEDED/);
  await assert.rejects(exportTenant({ ...input, source, maxBytes: 2 }), /EXPORT_BUDGET_EXCEEDED/);
});
test('the byte budget caps the exact encrypted artifact, including base64 and JSON overhead', async () => {
  const source = fixture({ listRoots: async () => [], listAssets: async () => [], listChildren: async () => [] });
  const options = { ...input, source, maxBytes: 1_000_000 };
  const bundle = await exportTenant(options);
  const artifactBytes = encryptBundle(bundle, Buffer.alloc(32, 7)).byteLength;
  assert.equal((await exportTenant({ ...options, maxBytes: artifactBytes })).manifest.status, 'RECONCILED_DECLARED_SCOPE_NOT_CERTIFIED');
  await assert.rejects(exportTenant({ ...options, maxBytes: artifactBytes - 1 }), /EXPORT_BUDGET_EXCEEDED/);

  const assetSource = fixture({ listRoots: async () => [], listAssets: async () => [{ name: 'tenants/tenant-a/archive.bin', generation: '8', bytes: 100 }], readAsset: async () => Buffer.alloc(100) });
  await assert.rejects(exportTenant({ ...input, source: assetSource, maxBytes: 120 }), /EXPORT_BUDGET_EXCEEDED/);
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

test('reconciliación detecta colecciones ausentes, relaciones rotas y assets agregados', async () => {
  const original = await exportTenant({ ...input, source: fixture() });

  const excludedBusinessRoot = structuredClone(original);
  const productsSource = excludedBusinessRoot.manifest.sources.find(source => source.path === 'productos');
  delete productsSource.count;
  productsSource.excluded = 'TEMPORARY_EXCLUSION';
  assert.throws(() => verifyBundle(excludedBusinessRoot), /EXPORT_RECONCILIATION_UNAUTHORIZED_EXCLUSION/);

  const missingRoot = structuredClone(original);
  missingRoot.manifest.sources = missingRoot.manifest.sources.filter(source => source.path !== 'ventas');
  missingRoot.files = missingRoot.files.filter(file => file.name !== 'ventas.jsonl');
  missingRoot.manifest.files = missingRoot.manifest.files.filter(file => file.name !== 'ventas.jsonl');
  assert.throws(() => verifyBundle(missingRoot), /EXPORT_RECONCILIATION_DECLARED_ROOT_MISSING/);

  const brokenRelation = structuredClone(original);
  const childName = 'ventas/sale/abonos_bodega.jsonl';
  const child = brokenRelation.files.find(file => file.name === childName);
  const row = JSON.parse(child.content);
  row.data.ventaId = 'fake';
  child.content = `${JSON.stringify(row)}\n`;
  child.bytes = Buffer.byteLength(child.content);
  child.sha256 = createHash('sha256').update(child.content).digest('hex');
  Object.assign(brokenRelation.manifest.files.find(file => file.name === childName), {
    bytes: child.bytes, sha256: child.sha256,
  });
  assert.throws(() => verifyBundle(brokenRelation), /EXPORT_RECONCILIATION_SALE_CHILD_MISMATCH/);

  const undeclaredAsset = structuredClone(original);
  const originalPath = 'tenants/tenant-a/unreferenced.bin';
  const asset = {
    name: `assets/${createHash('sha256').update(originalPath).digest('hex')}.bin`,
    originalPath, generation: '9', content: '', encoding: 'base64', bytes: 0,
    sha256: createHash('sha256').update('').digest('hex'),
  };
  undeclaredAsset.files.push(asset);
  undeclaredAsset.manifest.files.push({ name: asset.name, originalPath, generation: '9', encoding: asset.encoding, bytes: 0, sha256: asset.sha256 });
  assert.throws(() => verifyBundle(undeclaredAsset), /EXPORT_ASSET_INVENTORY_MISMATCH/);
});
test('el verificador rechaza metadatos de archivo alterados aunque el contenido coincida', async () => {
  const bundle = await exportTenant({ ...input, source: fixture() });
  const asset = bundle.files.find(file => file.name.startsWith('assets/'));
  assert.ok(asset);
  asset.originalPath = 'tenants/tenant-a/otro-archivo.png';
  assert.throws(() => verifyBundle(bundle), /EXPORT_METADATA_MISMATCH/);
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
  assert.deepEqual(Object.keys(source).sort(), ['authorize', 'establishReadTime', 'listAssets', 'listChildren', 'listRoots', 'readAsset', 'readPage']);
});
test('Firestore snapshot time comes from an empty server query and rejects payloads or bad context', async () => {
  const calls = [];
  const source = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'TEST_TOKEN', authorize: fixture().authorize, storage: {}, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), method: options.method });
    return { ok: true, json: async () => [{ readTime: input.readTime }] };
  } });
  assert.equal(await source.establishReadTime(input), input.readTime);
  assert.match(calls[0].url, /documents:runQuery$/);
  assert.equal(calls[0].body.readTime, undefined);
  const probeResource = calls[0].body.structuredQuery.where.fieldFilter.value.referenceValue;
  assert.match(probeResource, new RegExp(`^projects/${input.project}/databases/\\(default\\)/documents/empresas/dusema-export-read-time-probe-[0-9a-f-]{36}$`));
  assert.equal(calls[0].body.structuredQuery.limit, 1);
  await assert.rejects(source.establishReadTime({ ...input, tenant: 'tenant-b' }), /EXPORT_SOURCE_CONTEXT_MISMATCH/);

  const invalidSource = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'TEST_TOKEN', authorize: fixture().authorize, storage: {}, fetchImpl: async () => ({ ok: true, json: async () => [{ readTime: input.readTime, document: { name: 'unexpected' } }] }) });
  await assert.rejects(invalidSource.establishReadTime(input), /EXPORT_READ_TIME_PROBE_INVALID/);
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
    now: () => time, request: { ...input, operatorUid: 'operator-a', runId: 'run-a', validUntil: '2026-11-24T00:00:00Z' },
    readIdToken: async () => 'SYNTHETIC_ID_TOKEN',
    auth: { verifyIdToken: async (_, checkRevoked) => { assert.equal(checkRevoked, true); verifies++; return claims; } },
    db: { collection: collection => ({ doc: () => ({ get: async () => ({ exists: true, data: () => collection === 'saas_operadores' ? operator : { estado: 'cancelada' } }) }) }) },
    verifyRequest: async () => ({ verified: true, ...input, reference: 'request-reference' }),
  };
  assert.equal((await createOperatorAuthorizer(config)(input)).uid, 'operator-a');
  assert.equal((await createOperatorAuthorizer(config)(input)).requestReference, 'request-reference');
  assert.equal(verifies, 2);
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

test('private export runner verifies authority, server snapshot and encrypted output before returning metadata', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'dusema-runner-test-'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const source = fixture();
  let result, completed;
  source.completeExport = async record => { completed = record; return true; };
  try {
    result = await runPrivateTenantExport({
      ...input, source, key: Buffer.alloc(32, 4), outputParent: parent, repository,
    });
    assert.equal(result.manifest.status, 'RECONCILED_DECLARED_SCOPE_NOT_CERTIFIED');
    assert.equal(result.manifest.requestReference, 'request-reference');
    assert.equal(result.manifest.totalDocuments, 3);
    assert.equal(completed.uid, 'operator-a');
    assert.equal(completed.artifact.bytes, result.output.bytes);
    assert.match(completed.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(decryptBundle(await readFile(result.output.output), Buffer.alloc(32, 4)).manifest.actorUid, 'operator-a');
    assert.equal(Object.hasOwn(result, 'files'), false);
  } finally {
    if (result) { await unlink(result.output.output); await rmdir(dirname(result.output.output)); }
    await rmdir(parent);
  }
});

test('private export runner terminally records an aborted run without returning payloads', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'dusema-runner-abort-test-'));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const source = fixture({ listAssets: async () => { throw new Error('EXPORT_STORAGE_HTTP_403'); } });
  let failure;
  source.failExport = async record => { failure = record; return true; };
  try {
    await assert.rejects(runPrivateTenantExport({
      ...input, source, key: Buffer.alloc(32, 4), outputParent: parent, repository,
    }), /EXPORT_STORAGE_HTTP_403/);
    assert.equal(failure.uid, 'operator-a');
    assert.equal(failure.errorCode, 'EXPORT_STORAGE_HTTP_403');
    assert.equal(failure.payload, undefined);
  } finally {
    await rmdir(parent);
  }
});

test('private export runner rejects an unsafe output path before any tenant read', async () => {
  const source = fixture();
  let authorizations = 0;
  let snapshots = 0;
  source.authorize = async () => { authorizations++; return fixture().authorize(); };
  source.establishReadTime = async () => { snapshots++; return input.readTime; };
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  await assert.rejects(runPrivateTenantExport({
    ...input, source, key: Buffer.alloc(32, 4), outputParent: repository, repository,
  }), /EXPORT_UNSAFE_OUTPUT_DIRECTORY/);
  assert.equal(authorizations, 0);
  assert.equal(snapshots, 0);
});

test('canonical subscription path includes legacy control and rejects a conflicting tenant field', async () => {
  const source = fixture({ listRoots: async () => ['suscripciones'], listAssets: async () => [],
    listChildren: async ctx => ctx.path === 'suscripciones/tenant-a' ? ['relaciones'] : [],
    readPage: async ctx => ({ readTime: ctx.readTime, hasMore: false, documents: ctx.path === 'suscripciones'
      ? [{ id: 'tenant-a', data: { estado: 'active', revision: 1 } }]
      : ctx.path === 'suscripciones/tenant-a/relaciones' ? [{ id: '_vigente', data: { relacionVigenteId: 'relation-a' } }] : [] }),
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
  assert.equal(coverage.rootAdaptersComplete, true);
  assert.deepEqual(coverage.classifications.filter(row => row.status === 'ADAPTER_REQUIRED'), []);
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
  const operation = projectDocument({ empresaId: 'tenant-a', tipo: 'registrarEgresoOperativoV1', resultado: 'CONFIRMADO', actor: { uid: 'operator-a', rolEfectivo: 'admin' }, comando: { id: 'cmd-a', tipo: 'registrarEgresoOperativoV1', huella: 'hash' }, referencias: { egresoId: 'egreso-a', movimientoId: 'mov-a' } }, SCHEMAS.operaciones_auditoria);
  assert.equal(operation.referencias.egresoId, 'egreso-a');
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', tipo: 'registrarEgresoOperativoV1', resultado: 'CONFIRMADO', referencias: { amountWithoutSchema: 12 } }, SCHEMAS.operaciones_auditoria), /UNSUPPORTED_FIELD/);
  const reservationAudit = projectDocument({
    empresaId: 'tenant-a', tipo: 'crearProgramacionPedidoBodegaV1', resultado: 'CONFIRMADO',
    referencias: { programacionId: 'agenda-a', programaciones: [{
      programacionId: 'agenda-a', estado: 'RESERVADA', revision: 1,
      cliente: { id: 'client-a', nombre: 'Synthetic', direccion: null },
      franja: { desde: '09:00', hasta: '10:00' },
      lineas: [{ productoId: 'prod-a', presentacionId: 'pack-a', cantidad: 1 }],
    }] },
  }, SCHEMAS.operaciones_auditoria);
  assert.equal(reservationAudit.referencias.programaciones[0].franja.desde, '09:00');
  const agendaReference = projectDocument({ empresaId: 'tenant-a', tipo: 'crearProgramacionPedidoBodegaV1', resultado: 'CONFIRMADO', referencias: {
    programacionId: 'agenda-a', estado: 'PENDIENTE_REVISION', revision: 1, clienteId: 'client-a',
    cliente: { id: 'client-a', nombre: 'Synthetic' }, fechaLocal: '2026-11-23',
    franja: { desde: '09:00', hasta: '10:00' }, zonaHoraria: 'America/Bogota',
    lineas: [{ productoId: 'prod-a', presentacionId: 'pack-a', cantidad: 1 }],
    stockReservadoUnidadBase: 0, solicitanteUid: 'operator-a', solicitudId: null,
    reservaExpiraEn: null, creadaEn: '2026-11-23T12:00:00Z', actualizadaEn: '2026-11-23T12:00:00Z',
  } }, SCHEMAS.operaciones_auditoria);
  assert.equal(agendaReference.referencias.zonaHoraria, 'America/Bogota');
});

test('tenant exit adapters cover events, modifiers, contract payments, and Bodega request history', () => {
  const roots = [
    'eventos', 'modificador_grupos', 'producto_modificador_grupos',
    'asignaciones_numeracion', 'pagos_saas', 'agenda_pedidos_bodega',
    'reservas_stock_bodega', 'solicitudes_venta_bodega',
  ];
  const coverage = inspectCoverage(roots);
  assert.equal(coverage.rootAdaptersComplete, true);
  assert.deepEqual(coverage.classifications.filter(row => row.status !== 'ADAPTER_DEFINED'), []);

  const event = projectDocument({ empresaId: 'tenant-a', titulo: 'Evento', descripcion: 'Detalle', fecha: '2026-11-25', hora: '18:00', categoria: 'Otro', activo: true, creadoPor: 'operator-a' }, SCHEMAS.eventos);
  assert.equal(event.titulo, 'Evento');
  assert.equal(event.creadoPor, undefined);

  const group = projectDocument({ empresaId: 'tenant-a', nombre: 'Tamaño', minSeleccion: 0, maxSeleccion: 1, activo: true, opciones: [{ id: 'grande', nombre: 'Grande', precioDelta: 1000, activo: true, orden: 1, default: false }] }, SCHEMAS.modificador_grupos);
  assert.equal(group.opciones[0].precioDelta, 1000);

  const relation = projectDocument({ empresaId: 'tenant-a', productoId: 'coffee-a', grupoId: 'group-a', activo: true, opcionesPermitidas: ['grande'], opcionOverrides: { grande: { precioDelta: 1500, activo: true } } }, SCHEMAS.producto_modificador_grupos);
  assert.equal(relation.opcionOverrides.grande.precioDelta, 1500);

  const assignment = projectDocument({ empresaId: 'tenant-a', scope: 'EMPRESA', tipoDocumento: 'pos', numeracionId: 'pos-1', estado: 'VIGENTE', revision: 2, schemaVersion: 1 }, SCHEMAS.asignaciones_numeracion);
  assert.equal(assignment.numeracionId, 'pos-1');

  const payment = projectDocument({
    empresaId: 'tenant-a', reciboId: 'receipt-a', referenciaPago: 'REF-1', confirmadoPor: 'platform-operator', importe: 1600000, moneda: 'COP',
    periodoInicio: '2026-11-25', periodoFin: '2027-11-25', snapshotContrato: {
      schemaVersion: 2, planId: 'mvp', planVersion: 2, codigoPlan: 'MVP', periodicidad: 'ANUAL', trialDias: 15,
      precio: { importe: 1600000, moneda: 'COP' }, capacidades: ['sell'], limites: {}, sedeConceptual: { cantidad: 1 },
      fiscalidad: null, vigencia: { inicio: '2026-11-25', fin: '2027-11-25' },
    },
  }, SCHEMAS.pagos_saas);
  assert.equal(payment.importe, 1600000);
  assert.equal(payment.confirmadoPor, undefined);

  const agenda = projectDocument({
    empresaId: 'tenant-a', programacionId: 'agenda-a', clienteId: 'client-a', solicitanteUid: 'seller-a',
    fechaLocal: '2026-11-25', zonaHoraria: 'America/Bogota', estado: 'RESERVADA', revision: 2,
    lineas: [{ productoId: 'product-a', productoNombre: 'Agua', unidadBase: 'unidad', presentacionId: 'pack-a', presentacionNombre: 'Caja x 24', cantidad: 1, factorUnidadBase: 24, cantidadUnidadBase: 24 }],
    franja: { desde: '09:00', hasta: '10:00' }, reservaIds: ['hold-a'], aprobacion: { actorUid: 'admin-a', revision: 2 },
  }, SCHEMAS.agenda_pedidos_bodega);
  assert.equal(agenda.lineas[0].cantidadUnidadBase, 24);

  const hold = projectDocument({ empresaId: 'tenant-a', reservaId: 'hold-a', programacionId: 'agenda-a', productoId: 'product-a', productoNombreSnapshot: 'Agua', unidadBaseSnapshot: 'unidad', cantidadUnidadBase: 24, estado: 'ACTIVA', liberadaPor: 'admin-a' }, SCHEMAS.reservas_stock_bodega);
  assert.equal(hold.cantidadUnidadBase, 24);

  const request = projectDocument({
    empresaId: 'tenant-a', solicitudId: 'request-a', solicitanteUid: 'seller-a', clienteId: 'client-a', estado: 'EJECUTADA', revision: 1, totalCOP: 27000,
    intentoLineas: [{ productoId: 'product-a', presentacionId: 'pack-a', cantidad: 1 }],
    lineas: [{ productoId: 'product-a', productoNombre: 'Agua', unidadBase: 'unidad', presentacionId: 'pack-a', presentacionNombre: 'Caja x 24', cantidad: 1, factorUnidadBase: 24, cantidadUnidadBase: 24, canal: 'tienda', precioBasePresentacionCOP: 27000, precioPresentacionCOP: 27000, ofertaId: null, subtotalCOP: 27000 }],
    ejecucion: { actorUid: 'admin-a', revision: 1, ventaId: 'sale-a', commandId: 'internal-command' },
  }, SCHEMAS.solicitudes_venta_bodega);
  assert.equal(request.lineas[0].subtotalCOP, 27000);
  assert.equal(request.ejecucion.commandId, undefined);
  assert.throws(() => projectDocument({ empresaId: 'tenant-a', solicitudId: 'request-a', unreviewed: 'private' }, SCHEMAS.solicitudes_venta_bodega), /EXPORT_UNSUPPORTED_FIELD/);
});

test('canonical root is queried by document name and signed asset URLs do not leak', async () => {
  let body;
  const source = createReadSource({ project: input.project, tenant: input.tenant, getAccessToken: async () => 'SYNTHETIC', authorize: fixture().authorize, storage: {}, fetchImpl: async (_, options) => {
    body = JSON.parse(options.body); return { ok: true, json: async () => [] };
  } });
  await source.readPage({ ...input, path: 'configuraciones', limit: 200 });
  assert.equal(body.structuredQuery.where.fieldFilter.field.fieldPath, '__name__');
  assert.match(body.structuredQuery.where.fieldFilter.value.referenceValue, /configuraciones\/tenant-a$/);
  await assert.rejects(exportTenant({ ...input, source: fixture({ readPage: async ctx => ({ readTime: ctx.readTime, documents: ctx.path === 'productos' ? [{ id: 'a', data: { ...product, imagenUrl: 'https://example.test/image?token=SYNTHETIC_SECRET' } }] : [], hasMore: false }) }) }), /^Error: EXPORT_PRIVATE_URL_REQUIRES_ASSET_REFERENCE$/);
});

test('tenant Storage URLs are replaced with verified encrypted-bundle asset references', async () => {
  const objectName = 'tenants/tenant-a/productos/e/image.png';
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${input.project}.firebasestorage.app/o/${encodeURIComponent(objectName)}?alt=media&token=SYNTHETIC_SECRET`;
  const base = fixture();
  const source = {
    ...base,
    readPage: async ctx => ctx.path === 'productos'
      ? { readTime: ctx.readTime, documents: [{ id: 'a', data: { ...product, imagenUrl: downloadUrl } }], hasMore: false }
      : base.readPage(ctx),
  };
  const bundle = await exportTenant({ ...input, source });
  const productFile = bundle.files.find(file => file.name === 'productos.jsonl');
  const productRow = JSON.parse(productFile.content);
  const ref = productRow.data.imagenUrl;
  const asset = bundle.files.find(file => file.encoding === 'base64');
  assert.equal(ref.type, 'TENANT_STORAGE_ASSET');
  assert.equal(ref.bundleFile, asset.name);
  assert.equal(ref.generation, asset.generation);
  assert.doesNotMatch(JSON.stringify(bundle), /SYNTHETIC_SECRET/);
  assert.equal(bundle.manifest.sources.find(sourceRow => sourceRow.path === 'storage/tenants/tenant-a').count, 1);
  assert.equal(verifyBundle(bundle), true);
  const incomplete = structuredClone(bundle);
  incomplete.files = incomplete.files.filter(file => file.name !== asset.name);
  incomplete.manifest.files = incomplete.manifest.files.filter(file => file.name !== asset.name);
  incomplete.manifest.sources.find(sourceRow => sourceRow.path === 'storage/tenants/tenant-a').count = 0;
  assert.throws(() => verifyBundle(incomplete), /EXPORT_UNRESOLVED_ASSET_REFERENCE/);

  const missing = fixture({ listAssets: async () => [] });
  await assert.rejects(exportTenant({ ...input, source: {
    ...missing,
    readPage: async ctx => ctx.path === 'productos'
      ? { readTime: ctx.readTime, documents: [{ id: 'a', data: { ...product, imagenUrl: downloadUrl } }], hasMore: false }
      : missing.readPage(ctx),
  } }), /EXPORT_ASSET_REFERENCE_NOT_FOUND/);
});

test('Storage inventory failure stops before any Firestore tenant payload is read', async () => {
  let documentReads = 0;
  const source = fixture({
    listAssets: async () => { throw new Error('EXPORT_STORAGE_HTTP_403'); },
    readPage: async ctx => { documentReads++; return { readTime: ctx.readTime, documents: [], hasMore: false }; },
  });
  await assert.rejects(exportTenant({ ...input, source }), /EXPORT_STORAGE_HTTP_403/);
  assert.equal(documentReads, 0);
});
