import {
  CHILD_COLLECTIONS, DECLARED_ROOT_COLLECTIONS, EXCLUDED_CHILD_COLLECTIONS,
  INTERNAL_ROOTS, SCHEMAS, SINGLETON_ROOTS,
} from './export-schema.mjs';

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const ROOT_PATH_PATTERN = /^[A-Za-z0-9_-]+$/;
const fail = code => { throw new Error(code); };
const byPath = (a, b) => a.path.localeCompare(b.path);

function parseDocuments(bundle, sourcesByPath) {
  const fileByName = new Map(bundle.files.map(file => [file.name, file]));
  const documents = new Map();
  const rowsByCollectionPath = new Map();
  let totalDocuments = 0;
  for (const source of sourcesByPath.values()) {
    if (!Number.isSafeInteger(source.count)) continue;
    // Storage is represented by the asset inventory below. Its count is not a
    // Firestore document count and it has no JSONL file of its own.
    if (source.path.startsWith('storage/')) continue;
    const fileName = `${source.path}.jsonl`;
    const file = fileByName.get(fileName);
    if (source.count === 0) {
      if (file) fail('EXPORT_RECONCILIATION_EMPTY_SOURCE_HAS_FILE');
      continue;
    }
    if (!file || file.encoding !== undefined || typeof file.content !== 'string') fail('EXPORT_RECONCILIATION_SOURCE_FILE_MISSING');
    const lines = file.content.split('\n');
    if (lines.at(-1) !== '') fail('EXPORT_RECONCILIATION_JSONL_TERMINATOR_MISSING');
    lines.pop();
    if (!lines.length || lines.some(line => !line)) fail('EXPORT_RECONCILIATION_JSONL_INVALID');
    if (lines.length !== source.count) fail('EXPORT_RECONCILIATION_SOURCE_COUNT_MISMATCH');
    const rows = [];
    const ids = new Set();
    for (const line of lines) {
      let row;
      try { row = JSON.parse(line); } catch { fail('EXPORT_RECONCILIATION_JSONL_INVALID'); }
      if (!row || Object.keys(row).sort().join(',') !== 'data,id' || !idPattern.test(row.id)
        || !row.data || typeof row.data !== 'object' || Array.isArray(row.data) || ids.has(row.id)) {
        fail('EXPORT_RECONCILIATION_DOCUMENT_INVALID');
      }
      ids.add(row.id);
      const documentPath = `${source.path}/${row.id}`;
      if (documents.has(documentPath)) fail('EXPORT_RECONCILIATION_DUPLICATE_DOCUMENT');
      documents.set(documentPath, { ...row, sourcePath: source.path });
      rows.push(row);
      totalDocuments++;
    }
    rowsByCollectionPath.set(source.path, rows);
  }
  return { documents, rowsByCollectionPath, totalDocuments };
}

function validateTenantAndRelations(bundle, sourcesByPath, documents, rowsByCollectionPath) {
  const tenant = bundle.manifest.tenant;
  const memberships = new Set();
  for (const row of rowsByCollectionPath.get('membresias') ?? []) {
    if (row.data.empresaId !== tenant || typeof row.data.uid !== 'string' || !idPattern.test(row.data.uid)) {
      fail('EXPORT_RECONCILIATION_MEMBERSHIP_INVALID');
    }
    memberships.add(row.data.uid);
  }

  for (const [collectionPath, rows] of rowsByCollectionPath) {
    const parts = collectionPath.split('/');
    const collection = parts.at(-1);
    const nested = parts.length > 1;
    const parentDocumentPath = nested ? parts.slice(0, -1).join('/') : null;
    const parentId = nested ? parts.at(-2) : null;
    if (nested && !documents.has(parentDocumentPath)) fail('EXPORT_RECONCILIATION_PARENT_MISSING');
    for (const row of rows) {
      const data = row.data;
      const owner = collection === 'ofertas' ? data.empresaIdObjetivo : data.empresaId;
      if (owner !== undefined && owner !== null && owner !== tenant) fail('EXPORT_RECONCILIATION_CROSS_TENANT');
      if (owner !== tenant) {
        const canonicalSingleton = !nested && SINGLETON_ROOTS.has(collection) && row.id === tenant;
        const linkedMember = !nested && collection === 'usuarios' && memberships.has(row.id);
        if (!nested && !canonicalSingleton && !linkedMember) fail('EXPORT_RECONCILIATION_TENANT_OWNER_MISSING');
      }
      if (collection === 'usuarios' && !memberships.has(row.id)) fail('EXPORT_RECONCILIATION_USER_WITHOUT_MEMBERSHIP');
      if (nested && ['abonos_bodega', 'compromisos_pago_bodega'].includes(collection)
        && data.ventaId !== undefined && data.ventaId !== parentId) {
        fail('EXPORT_RECONCILIATION_SALE_CHILD_MISMATCH');
      }
      if (nested && collection === 'ofertas' && data.empresaIdObjetivo !== undefined
        && data.empresaIdObjetivo !== parentId) fail('EXPORT_RECONCILIATION_OFFER_PARENT_MISMATCH');
    }
  }

  // Every recognized child schema must appear for each exported parent, even
  // when its read-at-snapshot count is zero. Excluded private children are
  // represented once by a reason, without reading their payloads.
  for (const [parentCollectionPath, rows] of rowsByCollectionPath) {
    const parentCollection = parentCollectionPath.split('/').at(-1);
    for (const row of rows) {
      const parentDocumentPath = `${parentCollectionPath}/${row.id}`;
      for (const child of CHILD_COLLECTIONS[parentCollection] ?? []) {
        const childPath = `${parentDocumentPath}/${child}`;
        if (!sourcesByPath.has(childPath)) fail('EXPORT_RECONCILIATION_CHILD_SOURCE_MISSING');
      }
      for (const [child, reason] of Object.entries(EXCLUDED_CHILD_COLLECTIONS[parentCollection] ?? {})) {
        if (sourcesByPath.get(`${parentCollection}/${child}`)?.excluded !== reason) {
          fail('EXPORT_RECONCILIATION_EXCLUSION_MISSING');
        }
      }
    }
  }
}

function buildReconciliation(bundle) {
  const manifest = bundle?.manifest;
  if (!manifest || !Array.isArray(manifest.sources) || !Array.isArray(manifest.files)
    || !Array.isArray(bundle.files) || !Array.isArray(manifest.declaredRootCollections)
    || !Array.isArray(manifest.observedRootCollections)) fail('EXPORT_RECONCILIATION_INVALID_MANIFEST');

  const declared = [...DECLARED_ROOT_COLLECTIONS].sort();
  if (manifest.declaredRootCollections.join('\n') !== declared.join('\n')) {
    fail('EXPORT_RECONCILIATION_DECLARED_ROOTS_MISMATCH');
  }
  const observed = manifest.observedRootCollections;
  if (observed.some(name => typeof name !== 'string' || !ROOT_PATH_PATTERN.test(name))
    || new Set(observed).size !== observed.length) fail('EXPORT_RECONCILIATION_OBSERVED_ROOTS_INVALID');

  const sourcesByPath = new Map();
  for (const source of manifest.sources) {
    if (!source || typeof source.path !== 'string' || !source.path || sourcesByPath.has(source.path)) {
      fail('EXPORT_RECONCILIATION_SOURCE_INVENTORY_INVALID');
    }
    const hasCount = Number.isSafeInteger(source.count) && source.count >= 0;
    const hasExclusion = typeof source.excluded === 'string' && source.excluded.length > 0;
    if (hasCount === hasExclusion) fail('EXPORT_RECONCILIATION_SOURCE_CLASSIFICATION_INVALID');
    sourcesByPath.set(source.path, source);
  }
  const storagePath = `storage/tenants/${manifest.tenant}`;
  for (const source of sourcesByPath.values()) {
    if (source.path === storagePath) continue;
    const parts = source.path.split('/');
    if (parts.length === 1) {
      const root = parts[0];
      if (!DECLARED_ROOT_COLLECTIONS.has(root) && !observed.includes(root)) {
        fail('EXPORT_RECONCILIATION_UNCLASSIFIED_SOURCE');
      }
      if (!SCHEMAS[root] && !INTERNAL_ROOTS.has(root)) fail('EXPORT_RECONCILIATION_UNKNOWN_ROOT');
      if (INTERNAL_ROOTS.has(root) && source.excluded !== 'PLATFORM_OR_CREDENTIAL_DATA') {
        fail('EXPORT_RECONCILIATION_INTERNAL_EXCLUSION_INVALID');
      }
      if (!INTERNAL_ROOTS.has(root) && source.excluded !== undefined) {
        fail('EXPORT_RECONCILIATION_UNAUTHORIZED_EXCLUSION');
      }
      continue;
    }
    if (parts.length === 2 && parts[0] === 'clientes' && parts[1] === 'anotaciones_privacidad') {
      if (source.excluded !== 'PRIVATE_PRIVACY_CASE_DATA') fail('EXPORT_RECONCILIATION_EXCLUSION_MISSING');
      continue;
    }
    if (parts.length !== 3 || !DECLARED_ROOT_COLLECTIONS.has(parts[0])
      || !SCHEMAS[parts[2]] || !idPattern.test(parts[1])
      || !(CHILD_COLLECTIONS[parts[0]] ?? []).includes(parts[2])) {
      fail('EXPORT_RECONCILIATION_UNCLASSIFIED_SOURCE');
    }
    if (source.excluded !== undefined) fail('EXPORT_RECONCILIATION_UNAUTHORIZED_EXCLUSION');
  }
  for (const root of declared) if (!sourcesByPath.has(root)) fail('EXPORT_RECONCILIATION_DECLARED_ROOT_MISSING');
  for (const root of observed) if (!sourcesByPath.has(root)) fail('EXPORT_RECONCILIATION_OBSERVED_ROOT_MISSING');
  for (const root of observed) {
    if (!SCHEMAS[root] && !INTERNAL_ROOTS.has(root)) fail('EXPORT_RECONCILIATION_UNKNOWN_ROOT');
  }
  for (const [root, reason] of Object.entries({
    ...Object.fromEntries([...INTERNAL_ROOTS].filter(root => observed.includes(root)).map(root => [root, 'PLATFORM_OR_CREDENTIAL_DATA'])),
  })) {
    if (sourcesByPath.get(root)?.excluded !== reason) fail('EXPORT_RECONCILIATION_INTERNAL_EXCLUSION_INVALID');
  }
  for (const [collection, children] of Object.entries(EXCLUDED_CHILD_COLLECTIONS)) {
    for (const [child, reason] of Object.entries(children)) {
      if (sourcesByPath.get(`${collection}/${child}`)?.excluded !== reason) fail('EXPORT_RECONCILIATION_EXCLUSION_MISSING');
    }
  }

  const filesByName = new Map();
  for (const file of bundle.files) {
    if (!file || typeof file.name !== 'string' || filesByName.has(file.name)) fail('EXPORT_RECONCILIATION_FILE_INVENTORY_INVALID');
    filesByName.set(file.name, file);
  }
  const metadataNames = new Set(manifest.files.map(file => file?.name));
  if (metadataNames.size !== manifest.files.length || metadataNames.size !== filesByName.size
    || [...filesByName.keys()].some(name => !metadataNames.has(name))) fail('EXPORT_RECONCILIATION_FILE_METADATA_MISMATCH');

  for (const source of sourcesByPath.values()) {
    if (source.excluded) {
      if (filesByName.has(`${source.path}.jsonl`)) fail('EXPORT_RECONCILIATION_EXCLUDED_SOURCE_HAS_FILE');
      continue;
    }
    if (source.path === `storage/tenants/${manifest.tenant}`) continue;
    const expectedName = `${source.path}.jsonl`;
    const file = filesByName.get(expectedName);
    if (source.count === 0 && file) fail('EXPORT_RECONCILIATION_EMPTY_SOURCE_HAS_FILE');
    if (source.count > 0 && !file) fail('EXPORT_RECONCILIATION_SOURCE_FILE_MISSING');
  }
  for (const name of filesByName.keys()) {
    if (name.startsWith('assets/')) {
      const file = filesByName.get(name);
      if (file.encoding !== 'base64' || !/^assets\/[a-f0-9]{64}\.bin$/.test(name)) {
        fail('EXPORT_RECONCILIATION_ASSET_FILE_INVALID');
      }
      continue;
    }
    if (!name.endsWith('.jsonl') || !sourcesByPath.has(name.slice(0, -'.jsonl'.length))) {
      fail('EXPORT_RECONCILIATION_UNDECLARED_FILE');
    }
  }

  const { documents, rowsByCollectionPath, totalDocuments } = parseDocuments(bundle, sourcesByPath);
  validateTenantAndRelations(bundle, sourcesByPath, documents, rowsByCollectionPath);
  const countedDocuments = [...sourcesByPath.values()]
    .filter(source => !source.path.startsWith('storage/'))
    .reduce((sum, source) => sum + (source.count ?? 0), 0);
  const totalBytes = manifest.files.reduce((sum, file) => sum + (Number.isSafeInteger(file?.bytes) ? file.bytes : Number.NaN), 0);
  const storageSource = sourcesByPath.get(storagePath);
  const assetFiles = [...filesByName.values()].filter(file => file.encoding === 'base64');
  if (!storageSource || storageSource.count !== assetFiles.length) fail('EXPORT_RECONCILIATION_STORAGE_COUNT_MISMATCH');
  if (!Number.isSafeInteger(totalBytes) || totalDocuments !== countedDocuments
    || manifest.totalDocuments !== totalDocuments || manifest.totalBytes !== totalBytes) {
    fail('EXPORT_RECONCILIATION_MANIFEST_TOTAL_MISMATCH');
  }
  const exclusions = [...sourcesByPath.values()].filter(source => source.excluded)
    .map(source => ({ path: source.path, reason: source.excluded })).sort(byPath);
  const openItems = [
    'HISTORICAL_SEMANTIC_REFERENCES_NOT_RECONCILED',
    'REAL_SOURCE_PAYLOADS_NOT_INDEPENDENTLY_COMPARED',
    'EXTERNAL_EXPORT_AUTHORIZATION_NOT_CERTIFIED',
  ];
  return {
    version: 1,
    integrityStatus: 'PASS',
    completenessStatus: 'DECLARED_SCHEMA_SCOPE_ONLY',
    certificationStatus: 'NOT_CERTIFIED',
    counts: {
      declaredRootCollections: declared.length,
      observedRootCollections: observed.length,
      sourceEntries: sourcesByPath.size,
      documents: totalDocuments,
      files: filesByName.size,
      assets: assetFiles.length,
      excludedSources: exclusions.length,
      bytes: totalBytes,
    },
    checks: {
      declaredRoots: 'PASS',
      observedRoots: 'PASS',
      fileHashesAndCounts: 'PASS',
      tenantOwnership: 'PASS',
      parentChildRelations: 'PASS',
      membershipUserRelations: 'PASS',
      knownCreditSaleRelations: 'PASS',
      storageInventoryAndReferences: 'PASS',
      exclusionsHaveReasons: 'PASS',
      historicalSemanticReferences: 'NOT_CERTIFIED',
      sourcePayloadReconciliation: 'NOT_CERTIFIED',
    },
    exclusions,
    errors: [],
    inaccessible: [],
    openItems,
  };
}

export function reconcileExportBundle(bundle) {
  const computed = buildReconciliation(bundle);
  if (!bundle.manifest.reconciliation || JSON.stringify(bundle.manifest.reconciliation) !== JSON.stringify(computed)) {
    fail('EXPORT_RECONCILIATION_REPORT_MISMATCH');
  }
  return computed;
}

export function createExportReconciliation(bundle) {
  return buildReconciliation(bundle);
}
