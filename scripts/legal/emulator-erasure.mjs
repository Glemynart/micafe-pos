import { createHash } from 'node:crypto';
import { planRetention } from './retention-plan.mjs';
import { decodeFields } from './firestore-source.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);

/** Synthetic Firestore rehearsal only. No production adapter, Auth or Storage deletion. */
export function createEmulatorErasure({ project, host, authorize, fetchImpl = fetch }) {
  if (project !== 'demo-dusema-erasure' || !/^127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(host) || Number(host.split(':')[1]) > 65535 || typeof authorize !== 'function') throw new Error('ERASURE_EMULATOR_ONLY');
  const base = `projects/${project}/databases/(default)/documents`;
  const origin = `http://${host}/v1/${base}`;
  async function rpc(suffix, body) {
    const response = await fetchImpl(origin + suffix, { method: body ? 'POST' : 'GET', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
    if (response.status === 404 && !body) return null;
    if (!response.ok) throw new Error(`ERASURE_HTTP_${response.status}`);
    return response.json();
  }
  return Object.freeze({ async execute({ tenant, requestId, paths, now }) {
    if (!id(tenant) || !id(requestId) || !Array.isArray(paths) || !paths.length || paths.length > 100 || new Set(paths).size !== paths.length || !Number.isFinite(Date.parse(now))) throw new Error('ERASURE_INVALID_REQUEST');
    // The only enabled adapter is a dedicated synthetic fixture collection.
    if (paths.some(path => typeof path !== 'string' || !/^legal_exit_fixtures\/[A-Za-z0-9_-]{1,120}$/.test(path))) throw new Error('ERASURE_UNSUPPORTED_ADAPTER');
    const sorted = [...paths].sort();
    const digest = hash(JSON.stringify({ project, tenant, requestId, paths: sorted }));
    let principal;
    const check = async () => {
      const auth = await authorize({ project, tenant, requestId });
      if (!auth || auth.project !== project || auth.tenant !== tenant || auth.requestId !== requestId || !id(auth.uid) || auth.active !== true || auth.canConserve !== true || auth.requestVerified !== true || !Number.isSafeInteger(auth.authorizationVersion) || auth.authorizationVersion < 1) throw new Error('ERASURE_AUTHORIZATION_DENIED');
      const current = `${auth.uid}:${auth.authorizationVersion}`;
      if (principal && current !== principal) throw new Error('ERASURE_AUTHORITY_CHANGED');
      principal = current;
      return auth;
    };
    await check();
    const receiptPath = `/legal_exit_receipts/${hash(`${tenant}:${requestId}`)}`;
    const prior = await rpc(receiptPath);
    if (prior) {
      const evidence = decodeFields(prior.fields ?? {});
      if (evidence.digest !== digest || evidence.empresaId !== tenant) throw new Error('ERASURE_REQUEST_CONFLICT');
      for (const path of sorted) if (await rpc('/' + path)) throw new Error('ERASURE_RECREATED_RECORD');
      await check();
      return { mode: 'EMULATOR_ONLY', status: 'ALREADY_VERIFIED', count: sorted.length, digest };
    }
    const writes = [];
    for (const path of sorted) {
      await check();
      const doc = await rpc('/' + path);
      if (!doc || doc.name !== `${base}/${path}` || !doc.updateTime) throw new Error('ERASURE_DOCUMENT_CHANGED');
      const record = decodeFields(doc.fields ?? {});
      if (record.syntheticFixture !== true || record.empresaId !== tenant) throw new Error('ERASURE_SCOPE_DENIED');
      const plan = planRetention({ tenant, terminatedAt: record.terminatedAt, now, records: [{ ...record, path }], deliveryConfirmed: record.deliveryConfirmed, policyApproved: record.policyApproved });
      if (plan.entries[0].decision !== 'REQUIRES_AUTHORIZED_EXECUTOR') throw new Error('ERASURE_RETENTION_BLOCKED');
      const children = await rpc('/' + path + ':listCollectionIds', { pageSize: 1 });
      if (children.collectionIds?.length || children.nextPageToken) throw new Error('ERASURE_CHILDREN_BLOCKED');
      writes.push({ delete: doc.name, currentDocument: { updateTime: doc.updateTime } });
    }
    const actor = await check();
    // Evidence and deletes are a single atomic commit; a stale version cancels all.
    writes.push({ update: { name: base + receiptPath, fields: {
      empresaId: { stringValue: tenant }, digest: { stringValue: digest },
      actor: { stringValue: actor.uid }, authorizationVersion: { integerValue: String(actor.authorizationVersion) },
      count: { integerValue: String(sorted.length) }, mode: { stringValue: 'EMULATOR_ONLY' },
      basis: { stringValue: 'ADR-SAAS-101_SYNTHETIC_REHEARSAL' },
      references: { arrayValue: { values: sorted.map(path => ({ stringValue: hash(path) })) } },
    } }, currentDocument: { exists: false } });
    await rpc(':commit', { writes });
    for (const path of sorted) if (await rpc('/' + path)) throw new Error('ERASURE_VERIFICATION_FAILED');
    const saved = await rpc(receiptPath);
    if (!saved || decodeFields(saved.fields ?? {}).digest !== digest) throw new Error('ERASURE_EVIDENCE_MISSING');
    await check();
    return { mode: 'EMULATOR_ONLY', status: 'VERIFIED', count: sorted.length, digest };
  } });
}
