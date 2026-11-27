import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createExportApprovalLinkWorkflow, createFirestoreExportApprovalRepository } from './export-approval-link.mjs';
import { validateExportAuthorizationRecord } from './export-authorization.mjs';

test('enlace sintético se emite, previsualiza y consume atómicamente en Firestore Emulator', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const project = process.env.GCLOUD_PROJECT || 'demo-dusema-export';
  const suffix = randomUUID().replaceAll('-', '');
  const requestId = `export-approval-${suffix}`;
  const tenant = `tenant-${suffix}`;
  const contactId = `representative-${suffix}`;
  const revokedRequestId = `${requestId}-revoked`;
  const tokens = ['E'.repeat(43), 'R'.repeat(43)];
  let issued = 0;
  const app = initializeApp({ projectId: project }, `export-approval-${suffix}`);
  const db = getFirestore(app);
  // Keep the synthetic authority fixture under an already excluded platform root
  // so parallel export tests do not classify a test-only top-level collection.
  const contactRef = db.collection('saas_export_authorizations').doc(`contact-${suffix}`);
  try {
    await contactRef.set({ project, tenant, version: 4, verified: true, active: true });
    const repository = createFirestoreExportApprovalRepository({
      db, serverTimestamp: () => FieldValue.serverTimestamp(),
    });
    let deliveredUrl = '';
    const workflow = createExportApprovalLinkWorkflow({
      repository,
      authorizeOperator: async ({ project: foundProject, tenant: foundTenant, operatorUid }) =>
        foundProject === project && foundTenant === tenant && operatorUid === `operator-${suffix}`,
      resolveVerifiedContact: async () => ({
        project, tenant, id: contactId, version: 4, verified: true, active: true,
        channel: 'EMAIL_VERIFICADO', destination: 'synthetic-contact@example.test',
      }),
      contactVersionIsActive: async ({ transaction, project: foundProject, tenant: foundTenant, contactId: foundId, version }) => {
        const snapshot = await transaction.get(contactRef);
        const record = snapshot.exists ? snapshot.data() : null;
        return Boolean(record && record.project === foundProject && record.tenant === foundTenant
          && record.version === version && record.active === true && record.verified === true && foundId === contactId);
      },
      deliverLink: async ({ url }) => { deliveredUrl = url; return { reference: `delivery-${suffix}` }; },
      approvalBaseUrl: 'https://staging.example.test/backoffice/exportar/aprobar',
      createRequestId: () => [requestId, revokedRequestId][issued++],
      createToken: () => tokens[issued - 1],
    });

    await workflow.issue({ project, tenant, operatorUid: `operator-${suffix}`, requestReference: `case-${suffix}` });
    const token = new URLSearchParams(new URL(deliveredUrl).hash.slice(1)).get('token');
    assert.equal(token, 'E'.repeat(43));
    const preview = await workflow.preview({ requestId, token });
    assert.equal(preview.tenant, tenant);
    assert.equal(preview.scope.storage, 'ALL_TENANT_PREFIX_ASSETS_AT_SNAPSHOT');
    assert.equal(JSON.stringify(preview).includes('synthetic-contact@example.test'), false);

    const approved = await workflow.approve({ requestId, token });
    assert.deepEqual(approved, { approved: true, requestId });
    const stored = (await db.collection('saas_export_authorizations').doc(requestId).get()).data();
    assert.equal(stored.estado, 'APROBADA');
    assert.equal(stored.aprobacion.estadoEnlace, 'CONSUMIDO');
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.equal(JSON.stringify(stored).includes('synthetic-contact@example.test'), false);
    assert.ok(validateExportAuthorizationRecord(stored, {
      project, tenant, requestId, runId: `run-${suffix}`, operatorUid: `operator-${suffix}`,
    }, `operator-${suffix}`, Date.now()));
    await assert.rejects(workflow.approve({ requestId, token }), /EXPORT_APPROVAL_INVALID/);

    await workflow.issue({ project, tenant, operatorUid: `operator-${suffix}`, requestReference: `case-revoke-${suffix}` });
    const revokedToken = new URLSearchParams(new URL(deliveredUrl).hash.slice(1)).get('token');
    assert.equal(revokedToken, tokens[1]);
    assert.deepEqual(await workflow.revoke({ requestId: revokedRequestId, operatorUid: `operator-${suffix}` }), {
      revoked: true, requestId: revokedRequestId,
    });
    const revoked = (await db.collection('saas_export_authorizations').doc(revokedRequestId).get()).data();
    assert.equal(revoked.estado, 'REVOCADA');
    assert.equal(revoked.aprobacion.estadoEnlace, 'REVOCADO');
    await assert.rejects(workflow.approve({ requestId: revokedRequestId, token: revokedToken }), /EXPORT_APPROVAL_INVALID/);
  } finally {
    await contactRef.delete().catch(() => {});
    await db.collection('saas_export_authorizations').doc(requestId).delete().catch(() => {});
    await db.collection('saas_export_authorizations').doc(revokedRequestId).delete().catch(() => {});
    await deleteApp(app);
  }
});
