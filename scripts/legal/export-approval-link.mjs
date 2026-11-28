import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  EXPORT_AUTHORIZATION_SCOPE,
  EXPORT_AUTHORIZATION_SCOPE_SHA256,
  EXPORT_AUTHORIZATIONS_COLLECTION,
} from './export-authorization.mjs';

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;
const digest = token => createHash('sha256').update(token, 'utf8').digest('hex');
const sameDigest = (left, right) => {
  if (!digestPattern.test(left ?? '') || !digestPattern.test(right ?? '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};
const asMillis = value => value instanceof Date ? value.getTime()
  : value && typeof value.toMillis === 'function' ? value.toMillis()
    : typeof value === 'number' ? value : Number.NaN;

function assertRequest(input, ttlMs) {
  if (!input || !idPattern.test(input.project ?? '') || !idPattern.test(input.tenant ?? '')
    || !idPattern.test(input.operatorUid ?? '') || !idPattern.test(input.requestReference ?? '')
    || !Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    throw new Error('EXPORT_APPROVAL_REQUEST_INVALID');
  }
}

function assertApprovalBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('EXPORT_APPROVAL_LINK_NOT_CONFIGURED'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('EXPORT_APPROVAL_LINK_NOT_CONFIGURED');
  }
  return url;
}

function isUsablePending(record, requestId, tokenSha256, now) {
  const createdAt = asMillis(record?.creadaEn);
  const expiresAt = asMillis(record?.expiraEn);
  return record?.schemaVersion === 1
    && record.solicitudId === requestId
    && idPattern.test(record.proyectoId ?? '')
    && idPattern.test(record.empresaId ?? '')
    && idPattern.test(record.operadorUid ?? '')
    && record.alcanceSha256 === EXPORT_AUTHORIZATION_SCOPE_SHA256
    && record.estado === 'PENDIENTE_APROBACION'
    && record.estadoExportacion === 'PENDIENTE'
    && record.revocadaEn == null && record.cerradaEn == null
    && idPattern.test(record.referenciaSolicitud ?? '')
    && idPattern.test(record.contactoRepresentanteId ?? '')
    && Number.isSafeInteger(record.versionContacto) && record.versionContacto > 0
    && record.contactoVerificado === true
    && ['EMAIL_VERIFICADO', 'WHATSAPP_VERIFICADO'].includes(record.canalEntrega)
    && record.entrega?.estado === 'ENTREGADA'
    && idPattern.test(record.entrega?.referenciaProveedor ?? '')
    && record.aprobacion?.estadoEnlace === 'PENDIENTE'
    && sameDigest(record.aprobacion?.tokenSha256, tokenSha256)
    && record.aprobacion?.alcanceSha256 === EXPORT_AUTHORIZATION_SCOPE_SHA256
    && Number.isFinite(createdAt) && createdAt <= now
    && Number.isFinite(expiresAt) && expiresAt > now
    && expiresAt > createdAt && expiresAt - createdAt <= MAX_TTL_MS;
}

/**
 * Application service for ADR-SAAS-106. Contact resolution and message
 * delivery are server-only ports; the caller cannot supply a destination.
 * The approval store must atomically consume a token and check the contact
 * version in the same transaction before changing the record to APROBADA.
 */
export function createExportApprovalLinkWorkflow({
  repository,
  authorizeOperator,
  resolveVerifiedContact,
  contactVersionIsActive,
  deliverLink,
  approvalBaseUrl,
  now = () => Date.now(),
  createRequestId = randomUUID,
  createToken = () => randomBytes(32).toString('base64url'),
}) {
  if (!repository || typeof repository.createPending !== 'function'
    || typeof repository.markDelivered !== 'function' || typeof repository.markDeliveryFailed !== 'function'
    || typeof repository.readForApproval !== 'function' || typeof repository.consumeApproval !== 'function'
    || typeof repository.readRevocationContext !== 'function' || typeof repository.revokePending !== 'function'
    || typeof authorizeOperator !== 'function' || typeof resolveVerifiedContact !== 'function'
    || typeof contactVersionIsActive !== 'function'
    || typeof deliverLink !== 'function') throw new Error('EXPORT_APPROVAL_WORKFLOW_NOT_CONFIGURED');
  const baseUrl = assertApprovalBaseUrl(approvalBaseUrl);

  async function issue(input, { ttlMs = 15 * 60_000 } = {}) {
    assertRequest(input, ttlMs);
    if (await authorizeOperator({
      project: input.project, tenant: input.tenant, operatorUid: input.operatorUid,
      scopeSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256,
    }) !== true) throw new Error('EXPORT_APPROVAL_OPERATOR_UNAUTHORIZED');
    const contact = await resolveVerifiedContact({ project: input.project, tenant: input.tenant });
    if (!contact || contact.project !== input.project || contact.tenant !== input.tenant
      || contact.verified !== true || contact.active !== true
      || !idPattern.test(contact.id ?? '') || !Number.isSafeInteger(contact.version) || contact.version < 1
      || !['EMAIL_VERIFICADO', 'WHATSAPP_VERIFICADO'].includes(contact.channel)
      || typeof contact.destination !== 'string' || contact.destination.trim().length < 3
      || contact.destination.length > 320 || /[\r\n\u0000-\u001f]/.test(contact.destination)) {
      throw new Error('EXPORT_APPROVAL_CONTACT_UNAVAILABLE');
    }

    const requestId = createRequestId();
    const token = createToken();
    if (!idPattern.test(requestId ?? '') || !tokenPattern.test(token ?? '')) {
      throw new Error('EXPORT_APPROVAL_SECRET_GENERATION_FAILED');
    }
    const issuedAt = now();
    const expiresAt = issuedAt + ttlMs;
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) throw new Error('EXPORT_APPROVAL_CLOCK_INVALID');
    const tokenSha256 = digest(token);
    const record = {
      schemaVersion: 1,
      solicitudId: requestId,
      proyectoId: input.project,
      empresaId: input.tenant,
      operadorUid: input.operatorUid,
      referenciaSolicitud: input.requestReference,
      proposito: 'EXPORTACION_INTEGRAL_CIERRE_SERVICIO',
      alcanceSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256,
      estado: 'PENDIENTE_APROBACION',
      estadoExportacion: 'PENDIENTE',
      creadaEn: new Date(issuedAt),
      expiraEn: new Date(expiresAt),
      contactoRepresentanteId: contact.id,
      versionContacto: contact.version,
      contactoVerificado: true,
      canalEntrega: contact.channel,
      entrega: { estado: 'PENDIENTE' },
      aprobacion: {
        estadoEnlace: 'PENDIENTE', tokenSha256,
        contactoRepresentanteId: contact.id, versionContacto: contact.version,
        alcanceSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256,
      },
      revocadaEn: null,
      cerradaEn: null,
    };

    if (!await repository.createPending(record)) throw new Error('EXPORT_APPROVAL_REQUEST_NOT_CREATED');
    const link = new URL(baseUrl);
    link.searchParams.set('requestId', requestId);
    link.hash = new URLSearchParams({ token }).toString();
    let delivery;
    try {
      delivery = await deliverLink({
        destination: contact.destination,
        channel: contact.channel,
        url: link.toString(),
        idempotencyKey: requestId,
      });
      if (!delivery || !idPattern.test(delivery.reference ?? '')) throw new Error('DELIVERY_REFERENCE_INVALID');
    } catch {
      await repository.markDeliveryFailed(requestId, 'EXPORT_APPROVAL_DELIVERY_FAILED', now()).catch(() => false);
      throw new Error('EXPORT_APPROVAL_DELIVERY_FAILED');
    }

    const delivered = await repository.markDelivered(requestId, delivery.reference, now()).catch(() => false);
    if (!delivered) throw new Error('EXPORT_APPROVAL_DELIVERY_NOT_RECORDED');
    return Object.freeze({ requestId, expiresAt: new Date(expiresAt).toISOString() });
  }

  async function approve({ requestId, token }) {
    if (!idPattern.test(requestId ?? '') || !tokenPattern.test(token ?? '')) {
      throw new Error('EXPORT_APPROVAL_INVALID');
    }
    const approved = await repository.consumeApproval({
      requestId,
      tokenSha256: digest(token),
      now: now(),
      contactVersionIsActive,
    }).catch(() => null);
    if (!approved) throw new Error('EXPORT_APPROVAL_INVALID');
    return Object.freeze({ approved: true, requestId });
  }

  async function preview({ requestId, token }) {
    if (!idPattern.test(requestId ?? '') || !tokenPattern.test(token ?? '')) {
      throw new Error('EXPORT_APPROVAL_INVALID');
    }
    const summary = await repository.readForApproval({
      requestId,
      tokenSha256: digest(token),
      now: now(),
      contactVersionIsActive,
    }).catch(() => null);
    if (!summary) throw new Error('EXPORT_APPROVAL_INVALID');
    return Object.freeze(summary);
  }

  async function revoke({ requestId, operatorUid }) {
    if (!idPattern.test(requestId ?? '') || !idPattern.test(operatorUid ?? '')) {
      throw new Error('EXPORT_APPROVAL_INVALID');
    }
    const context = await repository.readRevocationContext(requestId).catch(() => null);
    if (!context || !idPattern.test(context.project ?? '') || !idPattern.test(context.tenant ?? '')) {
      throw new Error('EXPORT_APPROVAL_INVALID');
    }
    if (await authorizeOperator({
      project: context.project, tenant: context.tenant, operatorUid,
      scopeSha256: EXPORT_AUTHORIZATION_SCOPE_SHA256, action: 'REVOKE',
    }) !== true) throw new Error('EXPORT_APPROVAL_OPERATOR_UNAUTHORIZED');
    const revoked = await repository.revokePending({ requestId, operatorUid }).catch(() => false);
    if (!revoked) throw new Error('EXPORT_APPROVAL_INVALID');
    return Object.freeze({ revoked: true, requestId });
  }

  return Object.freeze({ issue, preview, approve, revoke });
}

/** Firestore adapter. Contact-version validation runs inside the transaction. */
export function createFirestoreExportApprovalRepository({ db, serverTimestamp }) {
  if (!db || typeof db.runTransaction !== 'function' || typeof serverTimestamp !== 'function') {
    throw new Error('EXPORT_APPROVAL_STORE_NOT_CONFIGURED');
  }
  const refFor = requestId => db.collection(EXPORT_AUTHORIZATIONS_COLLECTION).doc(requestId);

  return Object.freeze({
    async createPending(record) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(record.solicitudId);
          const snapshot = await transaction.get(ref);
          if (snapshot.exists) return false;
          transaction.set(ref, record);
          return true;
        });
      } catch { return false; }
    },
    async markDelivered(requestId, providerReference, deliveredAt) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(requestId);
          const snapshot = await transaction.get(ref);
          const record = snapshot.exists ? snapshot.data() : null;
          if (!record || record.estado !== 'PENDIENTE_APROBACION'
            || record.entrega?.estado !== 'PENDIENTE' || !idPattern.test(providerReference ?? '')
            || !Number.isFinite(deliveredAt) || asMillis(record.expiraEn) <= deliveredAt) return false;
          transaction.update(ref, {
            'entrega.estado': 'ENTREGADA',
            'entrega.referenciaProveedor': providerReference,
            'entrega.entregadaEn': serverTimestamp(),
          });
          return true;
        });
      } catch { return false; }
    },
    async markDeliveryFailed(requestId, errorCode, failedAt) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(requestId);
          const snapshot = await transaction.get(ref);
          const record = snapshot.exists ? snapshot.data() : null;
          if (!record || record.estado !== 'PENDIENTE_APROBACION' || record.entrega?.estado !== 'PENDIENTE'
            || !Number.isFinite(failedAt)) return false;
          const safeCode = /^EXPORT_[A-Z0-9_]{1,100}$/.test(errorCode ?? '') ? errorCode : 'EXPORT_APPROVAL_DELIVERY_FAILED';
          transaction.update(ref, {
            estado: 'ENVIO_FALLIDO', revocadaEn: serverTimestamp(),
            entrega: { estado: 'FALLIDA', errorCode: safeCode, fallidaEn: serverTimestamp() },
            'aprobacion.estadoEnlace': 'REVOCADO',
          });
          return true;
        });
      } catch { return false; }
    },
    async readForApproval({ requestId, tokenSha256, now: nowMs, contactVersionIsActive }) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(requestId);
          const snapshot = await transaction.get(ref);
          const record = snapshot.exists ? snapshot.data() : null;
          if (!isUsablePending(record, requestId, tokenSha256, nowMs)) return null;
          const current = await contactVersionIsActive({
            transaction,
            project: record.proyectoId,
            tenant: record.empresaId,
            contactId: record.contactoRepresentanteId,
            version: record.versionContacto,
          });
          if (current !== true) return null;
          return {
            project: record.proyectoId,
            tenant: record.empresaId,
            requestReference: record.referenciaSolicitud,
            purpose: record.proposito,
            scope: EXPORT_AUTHORIZATION_SCOPE,
            expiresAt: new Date(asMillis(record.expiraEn)).toISOString(),
          };
        });
      } catch { return null; }
    },
    async readRevocationContext(requestId) {
      try {
        const snapshot = await refFor(requestId).get();
        const record = snapshot.exists ? snapshot.data() : null;
        if (!record || record.solicitudId !== requestId || !idPattern.test(record.proyectoId ?? '')
          || !idPattern.test(record.empresaId ?? '')) return null;
        return { project: record.proyectoId, tenant: record.empresaId };
      } catch { return null; }
    },
    async revokePending({ requestId, operatorUid }) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(requestId);
          const snapshot = await transaction.get(ref);
          const record = snapshot.exists ? snapshot.data() : null;
          if (!record || record.solicitudId !== requestId || !idPattern.test(operatorUid ?? '')
            || record.estadoExportacion === 'COMPLETADA' || record.estadoExportacion === 'FALLIDA'
            || record.cerradaEn != null) return false;
          if (record.revocadaEn != null) return record.revocadaPorUid === operatorUid;
          const update = {
            estado: 'REVOCADA',
            revocadaEn: serverTimestamp(),
            revocadaPorUid: operatorUid,
          };
          if (record.aprobacion?.estadoEnlace === 'PENDIENTE') update['aprobacion.estadoEnlace'] = 'REVOCADO';
          transaction.update(ref, update);
          return true;
        });
      } catch { return false; }
    },
    async consumeApproval({ requestId, tokenSha256, now: nowMs, contactVersionIsActive }) {
      try {
        return await db.runTransaction(async transaction => {
          const ref = refFor(requestId);
          const snapshot = await transaction.get(ref);
          const record = snapshot.exists ? snapshot.data() : null;
          if (!isUsablePending(record, requestId, tokenSha256, nowMs)) return null;
          const current = await contactVersionIsActive({
            transaction,
            project: record.proyectoId,
            tenant: record.empresaId,
            contactId: record.contactoRepresentanteId,
            version: record.versionContacto,
          });
          if (current !== true) return null;
          transaction.update(ref, {
            estado: 'APROBADA',
            aprobacion: {
              ...record.aprobacion,
              estadoEnlace: 'CONSUMIDO',
              aprobadaEn: serverTimestamp(),
              enlaceConsumidoEn: serverTimestamp(),
            },
          });
          return {
            project: record.proyectoId,
            tenant: record.empresaId,
            requestId,
            operatorUid: record.operadorUid,
            expiresAt: asMillis(record.expiraEn),
          };
        });
      } catch { return null; }
    },
  });
}
