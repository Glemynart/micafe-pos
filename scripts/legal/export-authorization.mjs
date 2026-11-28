import { createHash } from 'node:crypto';

export const EXPORT_AUTHORIZATIONS_COLLECTION = 'saas_export_authorizations';
export const EXPORT_AUTHORIZATION_SCOPE = Object.freeze({
  schemaVersion: 'DUSEMA_EXIT_V3',
  firestore: 'DECLARED_ROOTS_AND_KNOWN_CHILDREN',
  storage: 'ALL_TENANT_PREFIX_ASSETS_AT_SNAPSHOT',
});

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
export const EXPORT_AUTHORIZATION_SCOPE_SHA256 = digest(EXPORT_AUTHORIZATION_SCOPE);
const fail = code => { throw new Error(code); };

function millis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch { return Number.NaN; }
  }
  if (typeof value === 'string') return Date.parse(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return Number.NaN;
}

/**
 * Validates only a server-created authorization record. User-supplied IDs and
 * references are lookups, never evidence that the representative approved.
 */
export function validateExportAuthorizationRecord(record, scope, operatorUid, now = Date.now(), { allowInProgress = false } = {}) {
  if (!record || !scope || !idPattern.test(scope.project ?? '') || !idPattern.test(scope.tenant ?? '')
    || !idPattern.test(scope.requestId ?? '') || !idPattern.test(scope.runId ?? '')
    || !idPattern.test(operatorUid ?? '') || scope.operatorUid !== operatorUid
    || !Number.isFinite(now)) return null;

  const issuedAt = millis(record.creadaEn);
  const expiresAt = millis(record.expiraEn);
  const deliveredAt = millis(record.entrega?.entregadaEn);
  const approvedAt = millis(record.aprobacion?.aprobadaEn);
  const consumedAt = millis(record.aprobacion?.enlaceConsumidoEn);
  const contactId = record.contactoRepresentanteId;
  const contactVersion = record.versionContacto;
  const deliveryId = record.entrega?.referenciaProveedor;
  const tokenDigest = record.aprobacion?.tokenSha256;

  if (record.schemaVersion !== 1 || record.proposito !== 'EXPORTACION_INTEGRAL_CIERRE_SERVICIO'
    || record.solicitudId !== scope.requestId
    || record.proyectoId !== scope.project || record.empresaId !== scope.tenant
    || record.operadorUid !== operatorUid || record.alcanceSha256 !== EXPORT_AUTHORIZATION_SCOPE_SHA256
    || record.estado !== 'APROBADA'
    || !(record.estadoExportacion === 'PENDIENTE'
      || (allowInProgress && record.estadoExportacion === 'EN_CURSO'
        && record.ejecucion?.runId === scope.runId
        && record.ejecucion?.operadorUid === operatorUid))
    || record.revocadaEn != null || record.cerradaEn != null
    || !idPattern.test(record.referenciaSolicitud ?? '')
    || !idPattern.test(contactId ?? '') || !Number.isSafeInteger(contactVersion) || contactVersion < 1
    || record.contactoVerificado !== true || !['EMAIL_VERIFICADO', 'WHATSAPP_VERIFICADO'].includes(record.canalEntrega)
    || record.entrega?.estado !== 'ENTREGADA' || !idPattern.test(deliveryId ?? '')
    || !Number.isFinite(issuedAt) || issuedAt > now || !Number.isFinite(deliveredAt) || deliveredAt > now
    || !Number.isFinite(approvedAt) || approvedAt > now || !Number.isFinite(consumedAt) || consumedAt > now
    || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt <= issuedAt
    || expiresAt - issuedAt > 24 * 60 * 60_000
    || record.aprobacion?.estadoEnlace !== 'CONSUMIDO'
    || record.aprobacion?.contactoRepresentanteId !== contactId
    || record.aprobacion?.versionContacto !== contactVersion
    || !hashPattern.test(tokenDigest ?? '')
    || record.aprobacion?.alcanceSha256 !== EXPORT_AUTHORIZATION_SCOPE_SHA256) return null;

  return Object.freeze({
    project: scope.project,
    tenant: scope.tenant,
    requestId: scope.requestId,
    reference: record.referenciaSolicitud,
    expiresAt,
  });
}

/**
 * Server-side Firestore adapter. First verification atomically claims the
 * approved request for this operator/run; later batch checks revalidate it.
 */
export function createFirestoreExportAuthorization({ db, serverTimestamp, now = () => Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function' || typeof serverTimestamp !== 'function') {
    throw new Error('EXPORT_AUTHORIZATION_STORE_NOT_CONFIGURED');
  }

  function refFor(scope) {
    return db.collection(EXPORT_AUTHORIZATIONS_COLLECTION).doc(scope.requestId);
  }

  async function verifyRequest(scope, operatorUid) {
    try {
      return await db.runTransaction(async transaction => {
        const ref = refFor(scope);
        const snapshot = await transaction.get(ref);
        const record = snapshot.exists ? snapshot.data() : null;
        if (!record || !scope) return null;
        const proof = validateExportAuthorizationRecord(record, scope, operatorUid, now(), { allowInProgress: true });
        if (!proof) return null;

        if (record.estadoExportacion === 'PENDIENTE') {
          transaction.update(ref, {
            estadoExportacion: 'EN_CURSO',
            ejecucion: { runId: scope.runId, operadorUid: operatorUid, iniciadaEn: serverTimestamp() },
          });
          return { verified: true, ...proof };
        }
        if (record.estadoExportacion === 'EN_CURSO'
          && record.ejecucion?.runId === scope.runId
          && record.ejecucion?.operadorUid === operatorUid
          && Number.isFinite(millis(record.ejecucion?.iniciadaEn))) {
          return { verified: true, ...proof };
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  async function finish(scope, operatorUid, result, state) {
    try {
      return await db.runTransaction(async transaction => {
        const ref = refFor(scope);
        const snapshot = await transaction.get(ref);
        const record = snapshot.exists ? snapshot.data() : null;
        if (!record || record.proyectoId !== scope.project || record.empresaId !== scope.tenant
          || record.solicitudId !== scope.requestId || record.estadoExportacion !== 'EN_CURSO'
          || record.ejecucion?.runId !== scope.runId || record.ejecucion?.operadorUid !== operatorUid) return false;
        if (state === 'COMPLETADA') {
          if (!validateExportAuthorizationRecord(record, scope, operatorUid, now(), { allowInProgress: true })) return false;
          if (!hashPattern.test(result?.sha256 ?? '') || !Number.isSafeInteger(result?.bytes) || result.bytes < 1) return false;
          transaction.update(ref, {
            estadoExportacion: 'COMPLETADA',
            ejecucion: { ...record.ejecucion, terminadaEn: serverTimestamp(), sha256Artefacto: result.sha256, bytesArtefacto: result.bytes },
          });
        } else {
          const safeCode = typeof result?.errorCode === 'string' && /^EXPORT_[A-Z0-9_]{1,100}$/.test(result.errorCode)
            ? result.errorCode : 'EXPORT_ABORTED';
          transaction.update(ref, {
            estadoExportacion: 'FALLIDA',
            ejecucion: { ...record.ejecucion, terminadaEn: serverTimestamp(), errorCode: safeCode },
          });
        }
        return true;
      });
    } catch {
      return false;
    }
  }

  return Object.freeze({
    verifyRequest,
    completeExport: (scope, operatorUid, result) => finish(scope, operatorUid, result, 'COMPLETADA'),
    failExport: (scope, operatorUid, errorCode) => finish(scope, operatorUid, { errorCode }, 'FALLIDA'),
  });
}
