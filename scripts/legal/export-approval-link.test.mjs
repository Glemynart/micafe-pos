import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreExportApprovalRepository, createExportApprovalLinkWorkflow } from './export-approval-link.mjs';
import { EXPORT_AUTHORIZATION_SCOPE, validateExportAuthorizationRecord } from './export-authorization.mjs';

const nowValue = Date.parse('2026-11-27T16:00:00.000Z');
const input = Object.freeze({
  project: 'micafe-pos-staging', tenant: 'tenant-a', operatorUid: 'operator-a', requestReference: 'case-a',
});
const token = 'T'.repeat(43);

function fakeFirestore() {
  const records = new Map();
  let queue = Promise.resolve();
  const db = {
    collection(name) {
      assert.equal(name, 'saas_export_authorizations');
      return { doc: id => ({
        id,
        get: async () => ({ exists: records.has(id), data: () => structuredClone(records.get(id)) }),
      }) };
    },
    async runTransaction(callback) {
      let release;
      const previous = queue;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      const staged = new Map([...records].map(([id, record]) => [id, structuredClone(record)]));
      const transaction = {
        get: async ref => ({ exists: staged.has(ref.id), data: () => structuredClone(staged.get(ref.id)) }),
        set: (ref, record) => staged.set(ref.id, structuredClone(record)),
        update: (ref, patch) => {
          const current = staged.get(ref.id);
          assert.ok(current, `missing record ${ref.id}`);
          for (const [key, value] of Object.entries(patch)) {
            const parts = key.split('.');
            let target = current;
            for (const part of parts.slice(0, -1)) target = target[part] ??= {};
            target[parts.at(-1)] = structuredClone(value);
          }
          staged.set(ref.id, current);
        },
      };
      try {
        const result = await callback(transaction);
        records.clear();
        for (const [id, record] of staged) records.set(id, record);
        return result;
      } finally { release(); }
    },
  };
  return { db, records };
}

function setup({ contactVerified = true, contactTenant = input.tenant, operatorAuthorized = true,
  delivery = async () => ({ reference: 'delivery-a' }), contactActive = true } = {}) {
  const { db, records } = fakeFirestore();
  const repository = createFirestoreExportApprovalRepository({ db, serverTimestamp: () => new Date(nowValue) });
  const delivered = [];
  const workflow = createExportApprovalLinkWorkflow({
    repository,
    authorizeOperator: async request => (typeof operatorAuthorized === 'function' ? operatorAuthorized(request) : operatorAuthorized)
      && request.project === input.project && request.tenant === input.tenant
      && request.operatorUid === input.operatorUid,
    resolveVerifiedContact: async ({ project, tenant }) => {
      assert.equal(project, input.project);
      assert.equal(tenant, input.tenant);
      return {
        project, tenant: contactTenant, id: 'representative-a', version: 2, verified: contactVerified, active: true,
        channel: 'EMAIL_VERIFICADO', destination: 'representative@example.test',
      };
    },
    contactVersionIsActive: async ({ project, tenant, contactId, version }) => (typeof contactActive === 'function' ? contactActive() : contactActive)
      && project === input.project && tenant === input.tenant && contactId === 'representative-a' && version === 2,
    deliverLink: async message => { delivered.push(message); return delivery(message); },
    approvalBaseUrl: 'https://staging.example.test/backoffice/exportar/aprobar',
    now: () => nowValue,
    createRequestId: () => 'request-a',
    createToken: () => token,
  });
  return { workflow, records, delivered };
}

test('a verified-contact link is delivered with the secret only in the URL fragment and is consumable once', async () => {
  const { workflow, records, delivered } = setup();
  const issued = await workflow.issue(input);
  assert.deepEqual(issued, { requestId: 'request-a', expiresAt: new Date(nowValue + 15 * 60_000).toISOString() });
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].destination, 'representative@example.test');
  assert.equal(delivered[0].idempotencyKey, 'request-a');
  const url = new URL(delivered[0].url);
  assert.equal(url.searchParams.get('requestId'), 'request-a');
  assert.deepEqual([...new URLSearchParams(url.hash.slice(1))], [['token', token]]);
  assert.equal(url.searchParams.has('token'), false);

  const pending = records.get('request-a');
  const serialized = JSON.stringify(pending);
  assert.doesNotMatch(serialized, /representative@example\.test/);
  assert.doesNotMatch(serialized, new RegExp(token));
  assert.equal(pending.aprobacion.tokenSha256.length, 64);
  assert.equal(pending.estado, 'PENDIENTE_APROBACION');

  const preview = await workflow.preview({ requestId: 'request-a', token });
  assert.deepEqual(preview, {
    project: input.project,
    tenant: input.tenant,
    requestReference: 'case-a',
    purpose: 'EXPORTACION_INTEGRAL_CIERRE_SERVICIO',
    scope: EXPORT_AUTHORIZATION_SCOPE,
    expiresAt: new Date(nowValue + 15 * 60_000).toISOString(),
  });
  assert.doesNotMatch(JSON.stringify(preview), /representative@example\.test|operator-a/);
  await assert.rejects(workflow.preview({ requestId: 'request-a', token: 'X'.repeat(43) }), /EXPORT_APPROVAL_INVALID/);

  assert.deepEqual(await workflow.approve({ requestId: 'request-a', token }), { approved: true, requestId: 'request-a' });
  const approved = records.get('request-a');
  assert.equal(approved.estado, 'APROBADA');
  assert.deepEqual(validateExportAuthorizationRecord(approved, {
    project: input.project, tenant: input.tenant, requestId: 'request-a', runId: 'run-a', operatorUid: input.operatorUid,
  }, input.operatorUid, nowValue), {
    project: input.project, tenant: input.tenant, requestId: 'request-a', reference: 'case-a',
    expiresAt: nowValue + 15 * 60_000,
  });
  await assert.rejects(workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
});

test('unverified contact and invalid request fail before persistence or delivery', async () => {
  const unverified = setup({ contactVerified: false });
  await assert.rejects(unverified.workflow.issue(input), /EXPORT_APPROVAL_CONTACT_UNAVAILABLE/);
  assert.equal(unverified.records.size, 0);
  assert.equal(unverified.delivered.length, 0);

  const wrongTenant = setup({ contactTenant: 'tenant-b' });
  await assert.rejects(wrongTenant.workflow.issue(input), /EXPORT_APPROVAL_CONTACT_UNAVAILABLE/);
  assert.equal(wrongTenant.records.size, 0);

  const unauthorized = setup({ operatorAuthorized: false });
  await assert.rejects(unauthorized.workflow.issue(input), /EXPORT_APPROVAL_OPERATOR_UNAUTHORIZED/);
  assert.equal(unauthorized.records.size, 0);
  assert.equal(unauthorized.delivered.length, 0);

  const configured = setup();
  await assert.rejects(configured.workflow.issue({ ...input, tenant: '../other' }), /EXPORT_APPROVAL_REQUEST_INVALID/);
  assert.equal(configured.records.size, 0);
});

test('delivery failure closes the request and the token cannot approve it', async () => {
  const { workflow, records, delivered } = setup({ delivery: async () => { throw new Error('provider secret'); } });
  await assert.rejects(workflow.issue(input), /EXPORT_APPROVAL_DELIVERY_FAILED/);
  assert.equal(delivered.length, 1);
  const failed = records.get('request-a');
  assert.equal(failed.estado, 'ENVIO_FALLIDO');
  assert.equal(failed.entrega.estado, 'FALLIDA');
  assert.equal(failed.aprobacion.estadoEnlace, 'REVOCADO');
  assert.doesNotMatch(JSON.stringify(failed), /provider secret/);
  await assert.rejects(workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
});

test('invalid delivery references and unverified contact versions fail closed', async () => {
  const badDelivery = setup({ delivery: async () => ({ reference: 'email@example.test' }) });
  await assert.rejects(badDelivery.workflow.issue(input), /EXPORT_APPROVAL_DELIVERY_FAILED/);
  assert.equal(badDelivery.records.get('request-a').estado, 'ENVIO_FALLIDO');

  const staleContact = setup({ contactActive: false });
  await staleContact.workflow.issue(input);
  await assert.rejects(staleContact.workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
  assert.equal(staleContact.records.get('request-a').estado, 'PENDIENTE_APROBACION');

  let current = true;
  const changedContact = setup({ contactActive: () => current });
  await changedContact.workflow.issue(input);
  assert.equal((await changedContact.workflow.preview({ requestId: 'request-a', token })).tenant, input.tenant);
  current = false;
  await assert.rejects(changedContact.workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
  assert.equal(changedContact.records.get('request-a').estado, 'PENDIENTE_APROBACION');
});

test('expired approval requests are not previewed or consumed', async () => {
  const { workflow, records } = setup();
  await workflow.issue(input);
  records.get('request-a').expiraEn = new Date(nowValue - 1);
  await assert.rejects(workflow.preview({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
  await assert.rejects(workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
  assert.equal(records.get('request-a').estado, 'PENDIENTE_APROBACION');
});

test('authorized operator can revoke a pending link and repeated revocation is idempotent', async () => {
  const { workflow, records } = setup();
  await workflow.issue(input);
  assert.deepEqual(await workflow.revoke({ requestId: 'request-a', operatorUid: input.operatorUid }), {
    revoked: true, requestId: 'request-a',
  });
  assert.equal(records.get('request-a').estado, 'REVOCADA');
  assert.equal(records.get('request-a').aprobacion.estadoEnlace, 'REVOCADO');
  assert.deepEqual(await workflow.revoke({ requestId: 'request-a', operatorUid: input.operatorUid }), {
    revoked: true, requestId: 'request-a',
  });
  await assert.rejects(workflow.preview({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);
  await assert.rejects(workflow.approve({ requestId: 'request-a', token }), /EXPORT_APPROVAL_INVALID/);

  const unauthorized = setup({ operatorAuthorized: request => request.action !== 'REVOKE' });
  await unauthorized.workflow.issue(input);
  await assert.rejects(unauthorized.workflow.revoke({ requestId: 'request-a', operatorUid: input.operatorUid }), /EXPORT_APPROVAL_OPERATOR_UNAUTHORIZED/);
  assert.equal(unauthorized.records.get('request-a').estado, 'PENDIENTE_APROBACION');
});

test('concurrent approval attempts consume the link exactly once', async () => {
  const { workflow, records } = setup();
  await workflow.issue(input);
  const attempts = await Promise.allSettled([
    workflow.approve({ requestId: 'request-a', token }),
    workflow.approve({ requestId: 'request-a', token }),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  assert.equal(records.get('request-a').aprobacion.estadoEnlace, 'CONSUMIDO');
});
