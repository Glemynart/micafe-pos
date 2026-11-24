import { createHash } from 'node:crypto';

/** Preview only. No database, file deletion, lifecycle change or implicit approval. */
export function planRetention({ tenant, terminatedAt, now, records, deliveryConfirmed, policyApproved }) {
  const end = Date.parse(terminatedAt), time = Date.parse(now);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(tenant) || !Number.isFinite(end) || !Number.isFinite(time) || end > time || !Array.isArray(records)) throw new Error('RETENTION_INVALID_CONTEXT');
  const expiry = end + 60 * 86400_000;
  const seen = new Set();
  const entries = records.map(record => {
    if (!record || record.empresaId !== tenant || typeof record.path !== 'string' || !record.path || seen.has(record.path)) throw new Error('RETENTION_INVALID_SCOPE');
    seen.add(record.path);
    const reasons = [];
    if (policyApproved !== true) reasons.push('POLICY_NOT_APPROVED');
    if (deliveryConfirmed !== true) reasons.push('DELIVERY_NOT_CONFIRMED');
    if (time < expiry) reasons.push('EXIT_WINDOW_NOT_FINISHED');
    if (record.legalHold !== false) reasons.push('HOLD_OR_HOLD_CHECK_MISSING');
    if (record.classification !== 'DISPOSABLE_OPERATIONAL') reasons.push('LEGAL_CLASSIFICATION_REQUIRED');
    if (record.sharedIdentity !== false) reasons.push('SHARED_IDENTITY_OR_CHECK_MISSING');
    if (record.referencesChecked !== true) reasons.push('REFERENCES_NOT_CHECKED');
    if (record.classification === 'LEDGER' || record.classification === 'CONTRACT_EVIDENCE') reasons.push('IMMUTABLE_OR_LEGAL_EVIDENCE');
    // A path hash suffices for a preview report; payload or personal data not included.
    return { reference: createHash('sha256').update(record.path).digest('hex'), decision: reasons.length ? 'BLOCKED' : 'REQUIRES_AUTHORIZED_EXECUTOR', reasons };
  });
  return { schemaVersion: 1, tenant, mode: 'PREVIEW_ONLY', executable: false, earliestActiveDeletionAt: new Date(expiry).toISOString(), entries };
}
