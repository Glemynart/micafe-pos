import { createHash } from 'node:crypto';
import { SCHEMAS, SCHEMA_VERSION, INTERNAL_ROOTS, PENDING_ROOTS, SINGLETON_ROOTS, projectDocument } from './export-schema.mjs';

const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const childSchemas = { ventas: ['abonos_bodega', 'compromisos_pago_bodega'], empresas: ['secuencias_documentales', 'solicitudes_venta_bodega', 'agenda_pedidos_bodega', 'reservas_stock_bodega'], suscripciones: ['relaciones'], ofertas_comerciales_tenant: ['ofertas'] };

/** Read-only source port. The engine has no database mutation or filesystem API. */
export async function exportTenant({ project, tenant, readTime, sourceSha, requestId, source, now = () => Date.now(), maxDocuments = 10000, maxBytes = 50_000_000 }) {
  if (!idPattern.test(project) || !idPattern.test(tenant) || !/^[a-f0-9]{40}$/.test(sourceSha) || !idPattern.test(requestId)) fail('EXPORT_INVALID_CONTEXT');
  if (!Number.isFinite(Date.parse(readTime)) || !Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) fail('EXPORT_INVALID_LIMIT');
  const started = now();
  const age = started - Date.parse(readTime);
  if (age < 0 || age > 60_000) fail('EXPORT_INVALID_READ_TIME');
  const context = Object.freeze({ project, tenant, readTime, requestId });
  const files = [], counts = [], seen = new Set();
  const memberUids = new Set();
  let totalDocuments = 0, totalBytes = 0;
  let initialProof;
  async function authorize() {
    if (now() - started >= 45 * 60_000 || now() - Date.parse(readTime) >= 60 * 60_000) fail('EXPORT_READ_WINDOW_EXPIRED');
    const proof = await source.authorize(context);
    if (!proof || proof.project !== project || proof.tenant !== tenant || proof.requestId !== requestId || proof.active !== true || proof.canConserve !== true || proof.requestVerified !== true || !idPattern.test(proof.uid) || !Number.isSafeInteger(proof.authorizationVersion) || proof.authorizationVersion < 1) fail('EXPORT_AUTHORIZATION_DENIED');
    if (initialProof && (proof.uid !== initialProof.uid || proof.authorizationVersion !== initialProof.authorizationVersion)) fail('EXPORT_AUTHORITY_CHANGED');
    return proof;
  }
  const firstProof = await authorize();
  initialProof = firstProof;
  const roots = await source.listRoots(context);
  if (!Array.isArray(roots) || new Set(roots).size !== roots.length) fail('EXPORT_INVALID_ROOT_INVENTORY');
  for (const name of roots) {
    if (!SCHEMAS[name] && !INTERNAL_ROOTS.has(name) && !PENDING_ROOTS.has(name)) fail('EXPORT_UNKNOWN_COLLECTION');
    // Missing canonical-path adapters must not masquerade as an empty tenant
    // through a where(empresaId) query (some singleton docs have no such field).
    if (PENDING_ROOTS.has(name)) fail('EXPORT_ADAPTER_REQUIRED');
  }

  async function collect(path, name) {
    let after = null;
    let count = 0;
    const rows = [];
    while (true) {
      await authorize();
      const page = await source.readPage({ ...context, path, after, limit: 200 });
      if (!page || page.readTime !== readTime || !Array.isArray(page.documents) || page.documents.length > 200) fail('EXPORT_INCONSISTENT_PAGE');
      for (const document of page.documents) {
        if (!idPattern.test(document.id) || (after && document.id <= after)) fail('EXPORT_UNSTABLE_PAGINATION');
        if (!document.data) fail('EXPORT_CROSS_TENANT');
        const scopedByParent = path.includes('/') && seen.has(path.split('/').slice(0, -1).join('/'));
        const scopedByCanonicalId = SINGLETON_ROOTS.has(path) && document.id === tenant;
        const scopedByMembership = path === 'usuarios' && memberUids.has(document.id);
        const owner = name === 'ofertas' ? document.data.empresaIdObjetivo : document.data.empresaId;
        if (owner !== tenant && !(owner === undefined && (scopedByParent || scopedByCanonicalId || scopedByMembership))) fail('EXPORT_CROSS_TENANT');
        const fullPath = `${path}/${document.id}`;
        if (seen.has(fullPath)) fail('EXPORT_DUPLICATE_DOCUMENT');
        seen.add(fullPath);
        if (!SCHEMAS[name]) fail('EXPORT_ADAPTER_REQUIRED');
        if (document.data.schemaVersion !== undefined) {
          const versions = name === 'ventas' ? ['BODEGA_MVP1_V1', 'BODEGA_MVP1_V2', 'BODEGA_MVP1_NEVERA_RETAIL_V1'] : [1, 2];
          if (!versions.includes(document.data.schemaVersion)) fail('EXPORT_UNSUPPORTED_SCHEMA_VERSION');
        }
        const data = projectDocument(document.data, SCHEMAS[name]);
        if (path === 'membresias') {
          if (typeof data.uid !== 'string' || !idPattern.test(data.uid)) fail('EXPORT_INVALID_MEMBERSHIP');
          memberUids.add(data.uid);
        }
        if (data.id !== undefined && data.id !== document.id) fail('EXPORT_DOCUMENT_ID_MISMATCH');
        const line = JSON.stringify({ id: document.id, data });
        totalDocuments++; count++;
        totalBytes += Buffer.byteLength(line + '\n');
        if (totalDocuments > maxDocuments || totalBytes > maxBytes) fail('EXPORT_BUDGET_EXCEEDED');
        rows.push(line);
        // The source must enumerate children, including paths with no child docs.
        const children = await source.listChildren({ ...context, path: fullPath });
        if (!Array.isArray(children) || new Set(children).size !== children.length) fail('EXPORT_INVALID_CHILD_INVENTORY');
        for (const child of children.sort()) {
          if (!(childSchemas[name] ?? []).includes(child)) fail('EXPORT_UNCLASSIFIED_SUBCOLLECTION');
          await collect(`${fullPath}/${child}`, child);
        }
        after = document.id;
      }
      if (!page.hasMore) break;
      if (page.documents.length === 0) fail('EXPORT_EMPTY_CURSOR_PAGE');
    }
    counts.push({ path, count });
    if (count) {
      const content = rows.join('\n') + '\n';
      files.push({ name: `${path}.jsonl`, content, bytes: Buffer.byteLength(content), sha256: hash(content) });
    }
  }

  for (const name of roots.sort()) {
    if (INTERNAL_ROOTS.has(name)) { counts.push({ path: name, excluded: 'PLATFORM_OR_CREDENTIAL_DATA' }); continue; }
    await collect(name, name);
  }
  // Files must be versioned by the storage adapter; no signed/download URL is accepted.
  const assets = await source.listAssets(context);
  if (!Array.isArray(assets)) fail('EXPORT_INVALID_ASSET_INVENTORY');
  const assetNames = new Set();
  for (const asset of assets) {
    await authorize();
    const prefix = `tenants/${tenant}/`;
    if (typeof asset.name !== 'string' || !asset.name.startsWith(prefix) || asset.name.includes('\\') || asset.name.split('/').some(part => !part || part === '.' || part === '..') || !/^\d+$/.test(asset.generation) || assetNames.has(asset.name)) fail('EXPORT_INVALID_ASSET');
    assetNames.add(asset.name);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || totalBytes + asset.bytes > maxBytes) fail('EXPORT_BUDGET_EXCEEDED');
    const bytes = await source.readAsset({ ...context, name: asset.name, generation: asset.generation });
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== asset.bytes) fail('EXPORT_ASSET_CHANGED');
    totalBytes += bytes.byteLength;
    files.push({ name: `assets/${hash(asset.name)}.bin`, originalPath: asset.name, generation: asset.generation, content: Buffer.from(bytes).toString('base64'), encoding: 'base64', bytes: bytes.byteLength, sha256: hash(bytes) });
  }
  const finalProof = await authorize();
  if (finalProof.uid !== firstProof.uid || finalProof.authorizationVersion !== firstProof.authorizationVersion) fail('EXPORT_AUTHORITY_CHANGED');
  const manifest = {
    schemaVersion: SCHEMA_VERSION, status: 'COMPLETE_DECLARED_SCOPE', project, tenant, sourceSha, requestId,
    actorUid: firstProof.uid, readTime, consistency: 'FIRESTORE_SNAPSHOT_STORAGE_GENERATIONS',
    startedAt: new Date(started).toISOString(), finishedAt: new Date(now()).toISOString(),
    totalDocuments, totalBytes, sources: counts.sort((a, b) => a.path.localeCompare(b.path)),
    files: files.map(({ content, ...metadata }) => metadata).sort((a, b) => a.name.localeCompare(b.name)),
  };
  // Only returned after every source, asset, budget and authority check passed.
  return { manifest, files };
}

export function verifyBundle(bundle) {
  if (bundle?.manifest?.schemaVersion !== SCHEMA_VERSION || bundle.manifest.status !== 'COMPLETE_DECLARED_SCOPE' || !Array.isArray(bundle.files) || !Array.isArray(bundle.manifest.files) || bundle.files.length !== bundle.manifest.files.length) fail('EXPORT_INVALID_BUNDLE');
  const names = new Set();
  for (const file of bundle.files) {
    if (typeof file.name !== 'string' || names.has(file.name)) fail('EXPORT_INVALID_BUNDLE');
    names.add(file.name);
    const expected = bundle.manifest.files.find(f => f.name === file.name);
    const bytes = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : Buffer.from(file.content, 'utf8');
    if (!expected || bytes.byteLength !== expected.bytes || hash(bytes) !== expected.sha256) fail('EXPORT_HASH_MISMATCH');
  }
  return true;
}
