import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFirestoreExportAuthorization, EXPORT_AUTHORIZATION_SCOPE_SHA256,
  EXPORT_AUTHORIZATIONS_COLLECTION, validateExportAuthorizationRecord,
} from './export-authorization.mjs';

const now = Date.parse('2026-11-27T15:00:00.000Z');
const scope = Object.freeze({
  project: 'micafe-pos-staging', tenant: 'demo-tenant-a',
  requestId: 'approval-a', runId: 'run-a', operatorUid: 'operator-a',
  validUntil: new Date(now + 30 * 60_000).toISOString(),
});

function approvedRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    solicitudId: scope.requestId,
    proyectoId: scope.project,
    empresaId: scope.tenant,
    operadorUid: scope.operatorUid,
    referenciaSolicitud: 'case-a',
    alcanceSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256,
    estado: 'APROBADA',
    estadoExportacion: 'PENDIENTE',
    creadaEn: new Date(now - 5 * 60_000),
    expiraEn: new Date(now + 20 * 60_000),
    contactoRepresentanteId: 'representative-a',
    versionContacto: 2,
    contactoVerificado: true,
    canalEntrega: 'EMAIL_VERIFICADO',
    entrega: {
      estado: 'ENTREGADA', referenciaProveedor: 'delivery-a',
      entregadaEn: new Date(now - 4 * 60_000),
    },
    aprobacion: {
      estadoEnlace: 'CONSUMIDO', tokenSha256: 'a'.repeat(64),
      contactoRepresentanteId: 'representative-a', versionContacto: 2,
      aprobadaEn: new Date(now - 3 * 60_000),
      enlaceConsumidoEn: new Date(now - 3 * 60_000),
      alcanceSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256,
    },
    revocadaEn: null,
    cerradaEn: null,
    ...overrides,
  };
}

function fakeDb(initial) {
  let record = structuredClone(initial);
  const ref = { id: scope.requestId };
  const db = {
    collection(name) {
      assert.equal(name, EXPORT_AUTHORIZATIONS_COLLECTION);
      return { doc(id) { assert.equal(id, scope.requestId); return ref; } };
    },
    async runTransaction(callback) {
      return callback({
        get: async requested => {
          assert.equal(requested, ref);
          return { exists: record !== null, data: () => structuredClone(record) };
        },
        update: (requested, patch) => {
          assert.equal(requested, ref);
          record = { ...record, ...structuredClone(patch) };
        },
      });
    },
  };
  return { db, read: () => structuredClone(record) };
}

test('approval record must match tenant, project, representative, operator, scope, state and expiry', () => {
  const valid = approvedRecord();
  assert.deepEqual(
    validateExportAuthorizationRecord(valid, scope, scope.operatorUid, now),
    {
      project: scope.project, tenant: scope.tenant, requestId: scope.requestId,
      reference: 'case-a', expiresAt: now + 20 * 60_000,
    },
  );

  const invalidRecords = [
    { ...valid, proyectoId: 'micafe-pos' },
    { ...valid, empresaId: 'tenant-b' },
    { ...valid, operadorUid: 'operator-b' },
    { ...valid, alcanceSha256: 'b'.repeat(64) },
    { ...valid, estado: 'REVOCADA' },
    { ...valid, revocadaEn: new Date(now - 1000) },
    { ...valid, cerradaEn: new Date(now - 1000) },
    { ...valid, estadoExportacion: 'COMPLETADA' },
    { ...valid, contactoVerificado: false },
    { ...valid, versionContacto: 3 },
    { ...valid, entrega: { ...valid.entrega, estado: 'PENDIENTE' } },
    { ...valid, aprobacion: { ...valid.aprobacion, estadoEnlace: 'PENDIENTE' } },
    { ...valid, aprobacion: { ...valid.aprobacion, versionContacto: 1 } },
    { ...valid, expiraEn: new Date(now - 1) },
    { ...valid, expiraEn: new Date(now + 25 * 60 * 60_000) },
  ];
  for (const record of invalidRecords) assert.equal(validateExportAuthorizationRecord(record, scope, scope.operatorUid, now), null);
  assert.equal(validateExportAuthorizationRecord(valid, { ...scope, tenant: 'tenant-b' }, scope.operatorUid, now), null);
  assert.equal(validateExportAuthorizationRecord(valid, { ...scope, operatorUid: 'operator-b' }, scope.operatorUid, now), null);
});

test('a server-approved link can be claimed once and bound to one operator/run', async () => {
  const { db, read } = fakeDb(approvedRecord());
  const service = createFirestoreExportAuthorization({ db, serverTimestamp: () => new Date(now), now: () => now });
  const first = await service.verifyRequest(scope, scope.operatorUid);
  assert.equal(first.verified, true);
  assert.equal(first.reference, 'case-a');
  assert.equal(read().estadoExportacion, 'EN_CURSO');
  assert.equal(read().ejecucion.runId, scope.runId);
  assert.equal(read().ejecucion.operadorUid, scope.operatorUid);
  assert.equal((await service.verifyRequest(scope, scope.operatorUid)).verified, true);
  assert.equal(await service.verifyRequest({ ...scope, runId: 'run-b' }, scope.operatorUid), null);
  assert.equal(await service.verifyRequest(scope, 'operator-b'), null);
});

test('revoked, expired, absent and mismatched approval requests fail closed without mutation', async () => {
  for (const record of [
    null,
    approvedRecord({ revocadaEn: new Date(now - 1) }),
    approvedRecord({ expiraEn: new Date(now - 1) }),
    approvedRecord({ empresaId: 'tenant-b' }),
    approvedRecord({ proyectoId: 'micafe-pos' }),
    approvedRecord({ aprobacion: { ...approvedRecord().aprobacion, alcanceSha256: 'b'.repeat(64) } }),
  ]) {
    const { db, read } = fakeDb(record);
    const service = createFirestoreExportAuthorization({ db, serverTimestamp: () => new Date(now), now: () => now });
    assert.equal(await service.verifyRequest(scope, scope.operatorUid), null);
    assert.deepEqual(read(), record);
  }
});

test('completion and failure are atomic terminal states with no personal data in the audit', async () => {
  const { db, read } = fakeDb(approvedRecord());
  const service = createFirestoreExportAuthorization({ db, serverTimestamp: () => new Date(now), now: () => now });
  await service.verifyRequest(scope, scope.operatorUid);
  assert.equal(await service.completeExport(scope, scope.operatorUid, { sha256: 'c'.repeat(64), bytes: 1024 }), true);
  assert.equal(read().estadoExportacion, 'COMPLETADA');
  assert.equal(read().ejecucion.sha256Artefacto, 'c'.repeat(64));
  assert.equal(read().ejecucion.bytesArtefacto, 1024);
  assert.equal('email' in read(), false);
  assert.equal(await service.verifyRequest(scope, scope.operatorUid), null);

  const failed = fakeDb(approvedRecord());
  const failedService = createFirestoreExportAuthorization({ db: failed.db, serverTimestamp: () => new Date(now), now: () => now });
  await failedService.verifyRequest(scope, scope.operatorUid);
  assert.equal(await failedService.failExport(scope, scope.operatorUid, 'EXPORT_READ_HTTP_403'), true);
  assert.equal(failed.read().estadoExportacion, 'FALLIDA');
  assert.equal(failed.read().ejecucion.errorCode, 'EXPORT_READ_HTTP_403');
  assert.equal(await failedService.failExport({ ...scope, runId: 'run-b' }, scope.operatorUid, 'secret@example.com'), false);
});

test('revocation and expiry during an export block the next batch and success commit', async () => {
  for (const mutate of [
    record => { record.revocadaEn = new Date(now + 1); },
    record => { record.expiraEn = new Date(now - 1); },
    record => { record.aprobacion.estadoEnlace = 'REVOCADO'; },
    record => { record.aprobacion.versionContacto = 9; },
  ]) {
    const { db, read } = fakeDb(approvedRecord());
    const service = createFirestoreExportAuthorization({ db, serverTimestamp: () => new Date(now), now: () => now });
    await service.verifyRequest(scope, scope.operatorUid);
    const changed = read();
    mutate(changed);
    const ref = db.collection(EXPORT_AUTHORIZATIONS_COLLECTION).doc(scope.requestId);
    // Test-only administrative mutation models revocation/contact change.
    await db.runTransaction(async transaction => {
      await transaction.get(ref);
      transaction.update(ref, changed);
    });
    assert.equal(await service.verifyRequest(scope, scope.operatorUid), null);
    assert.equal(await service.completeExport(scope, scope.operatorUid, { sha256: 'd'.repeat(64), bytes: 8 }), false);
  }
});
