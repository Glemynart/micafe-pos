import { SINGLETON_ROOTS } from './export-schema.mjs';
// Read-only REST transport. Deliberately no commit, patch, delete or upload method.
export function createReadSource({ project, tenant, getAccessToken, authorize, storage, fetchImpl = fetch }) {
  const origin = 'https://firestore.googleapis.com/v1';
  const base = `projects/${project}/databases/(default)/documents`;
  let membershipTime, membershipsComplete = false;
  const memberIds = new Set();
  async function request(suffix, body) {
    const token = await getAccessToken();
    const response = await fetchImpl(`${origin}/${base}${suffix}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    // Never surface response bodies, tokens, paths or document values in errors.
    if (!response.ok) throw new Error(`EXPORT_READ_HTTP_${response.status}`);
    return response.json();
  }
  async function listCollections(path, readTime) {
    const names = [], seen = new Set();
    let pageToken;
    do {
      const page = await request(`${path ? '/' + path.split('/').map(encodeURIComponent).join('/') : ''}:listCollectionIds`, { pageSize: 1000, ...(readTime ? { readTime } : {}), ...(pageToken ? { pageToken } : {}) });
      if (page.collectionIds !== undefined && (!Array.isArray(page.collectionIds) || page.collectionIds.some(name => typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)))) throw new Error('EXPORT_INVALID_COLLECTION_METADATA');
      names.push(...(page.collectionIds ?? []));
      pageToken = page.nextPageToken;
      if (pageToken && seen.has(pageToken)) throw new Error('EXPORT_REPEATED_PAGE_TOKEN');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return names;
  }
  return Object.freeze({
    authorize,
    listRoots: context => listCollections('', context.readTime),
    listChildren: context => listCollections(context.path, context.readTime),
    async readPage(context) {
      if (context.project !== project || context.tenant !== tenant) throw new Error('EXPORT_SOURCE_CONTEXT_MISMATCH');
      if (context.path === 'usuarios') {
        if (!membershipsComplete || membershipTime !== context.readTime) throw new Error('EXPORT_MEMBERSHIP_NOT_SCANNED');
        const ids = [...memberIds].sort().filter(id => !context.after || id > context.after).slice(0, context.limit);
        if (!ids.length) return { readTime: context.readTime, documents: [], hasMore: false };
        const rows = await request(':batchGet', { documents: ids.map(id => `${base}/usuarios/${id}`), readTime: context.readTime });
        if (!Array.isArray(rows) || rows.length !== ids.length) throw new Error('EXPORT_MEMBERSHIP_USER_MISSING');
        const documents = rows.map(row => {
          if (!row.found || !row.found.name.startsWith(`${base}/usuarios/`) || (row.readTime && Date.parse(row.readTime) !== Date.parse(context.readTime))) throw new Error('EXPORT_MEMBERSHIP_USER_MISSING');
          const id = row.found.name.slice(`${base}/usuarios/`.length);
          if (!ids.includes(id)) throw new Error('EXPORT_CROSS_TENANT');
          return { id, data: decodeFields(row.found.fields ?? {}) };
        }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        return { readTime: context.readTime, documents, hasMore: ids.length === context.limit };
      }
      const segments = context.path.split('/');
      if (segments.some(segment => !/^[A-Za-z0-9_:-]+$/.test(segment)) || segments.length % 2 !== 1) throw new Error('EXPORT_INVALID_SOURCE_PATH');
      const collectionId = segments.pop();
      const parent = segments.length ? '/' + segments.map(encodeURIComponent).join('/') : '';
      const parentResource = `${base}${parent}`;
      const query = {
        from: [{ collectionId }],
        ...(segments.length ? {} : { where: { fieldFilter: SINGLETON_ROOTS.has(collectionId)
          ? { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${base}/${collectionId}/${tenant}` } }
          : { field: { fieldPath: 'empresaId' }, op: 'EQUAL', value: { stringValue: tenant } } } }),
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: context.limit,
        ...(context.after ? { startAt: { values: [{ referenceValue: `${parentResource}/${collectionId}/${context.after}` }], before: false } } : {}),
      };
      const rows = await request(`${parent}:runQuery`, { structuredQuery: query, readTime: context.readTime });
      if (!Array.isArray(rows)) throw new Error('EXPORT_INVALID_QUERY_RESPONSE');
      if (rows.some(row => row.readTime && Date.parse(row.readTime) !== Date.parse(context.readTime))) throw new Error('EXPORT_INCONSISTENT_SERVER_READ_TIME');
      const documents = rows.filter(row => row.document).map(row => {
        const prefix = `${parentResource}/${collectionId}/`;
        if (!row.document.name.startsWith(prefix) || row.document.name.slice(prefix.length).includes('/')) throw new Error('EXPORT_WRONG_DOCUMENT_PATH');
        return { id: row.document.name.slice(prefix.length), data: decodeFields(row.document.fields ?? {}) };
      });
      if (context.path === 'membresias') {
        if (!context.after) { memberIds.clear(); membershipTime = context.readTime; membershipsComplete = false; }
        if (membershipTime !== context.readTime) throw new Error('EXPORT_INCONSISTENT_PAGE');
        for (const document of documents) {
          if (document.data.empresaId !== tenant || typeof document.data.uid !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(document.data.uid)) throw new Error('EXPORT_INVALID_MEMBERSHIP');
          memberIds.add(document.data.uid);
        }
        membershipsComplete = documents.length < context.limit;
      }
      return { readTime: context.readTime, documents, hasMore: documents.length === context.limit };
    },
    listAssets: context => storage.list(context),
    readAsset: context => storage.read(context),
  });
}

export function decodeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('EXPORT_INVALID_FIRESTORE_FIELDS');
  const result = Object.create(null);
  for (const [name, field] of Object.entries(fields)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('EXPORT_UNSAFE_KEY');
    result[name] = decodeValue(field);
  }
  return result;
}

function decodeValue(field) {
  if (!field || typeof field !== 'object' || Object.keys(field).length !== 1) throw new Error('EXPORT_INVALID_FIRESTORE_VALUE');
  if (Object.hasOwn(field, 'nullValue')) return null;
  if (Object.hasOwn(field, 'stringValue')) return field.stringValue;
  if (Object.hasOwn(field, 'booleanValue')) return field.booleanValue;
  if (Object.hasOwn(field, 'integerValue')) {
    if (!/^-?\d+$/.test(field.integerValue)) throw new Error('EXPORT_INVALID_INTEGER');
    const n = Number(field.integerValue);
    // No precision loss. Unsupported integers stop rather than silently round COP.
    if (!Number.isSafeInteger(n)) throw new Error('EXPORT_INTEGER_OUT_OF_RANGE');
    return n;
  }
  if (Object.hasOwn(field, 'doubleValue')) {
    if (typeof field.doubleValue !== 'number' || !Number.isFinite(field.doubleValue)) throw new Error('EXPORT_INVALID_NUMBER');
    return field.doubleValue;
  }
  if (Object.hasOwn(field, 'timestampValue')) {
    if (typeof field.timestampValue !== 'string' || !Number.isFinite(Date.parse(field.timestampValue))) throw new Error('EXPORT_INVALID_TIMESTAMP');
    return field.timestampValue; // Keep original UTC precision; don't convert via Date.
  }
  if (Object.hasOwn(field, 'arrayValue')) return (field.arrayValue.values ?? []).map(decodeValue);
  if (Object.hasOwn(field, 'mapValue')) return decodeFields(field.mapValue.fields ?? {});
  // References/blobs/geopoints need explicit adapters; no raw cross-tenant pointer.
  throw new Error('EXPORT_UNSUPPORTED_FIRESTORE_TYPE');
}
