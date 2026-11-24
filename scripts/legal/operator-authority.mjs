/** Application authority on top of cloud IAM; denies without verified request evidence. */
export function createOperatorAuthorizer({ auth, db, readIdToken, verifyRequest, request, now = () => Date.now() }) {
  if (!auth || !db || typeof readIdToken !== 'function' || typeof verifyRequest !== 'function' || !request || !Number.isFinite(Date.parse(request.validUntil))) throw new Error('EXPORT_AUTHORITY_NOT_CONFIGURED');
  const scope = Object.freeze({ ...request });
  return async function authorize(context) {
    try {
      if (context.project !== scope.project || context.tenant !== scope.tenant || context.requestId !== scope.requestId || now() >= Date.parse(scope.validUntil)) throw new Error();
      const token = await readIdToken();
      const identity = await auth.verifyIdToken(token, true);
      if (identity.aud !== scope.project || identity.iss !== `https://securetoken.google.com/${scope.project}`) throw new Error();
      const operator = await db.collection('saas_operadores').doc(identity.uid).get();
      const record = operator.exists ? operator.data() : null;
      if (!record || record.uid !== identity.uid || record.uid !== scope.operatorUid || record.estado !== 'ACTIVO'
        || !Array.isArray(record.facultades) || !record.facultades.includes('CONSERVACION_GOBERNAR')
        || identity.saas?.operador !== true || identity.saas.versionAutorizacion !== record.versionAutorizacion
        || !Number.isSafeInteger(record.versionAutorizacion) || record.versionAutorizacion < 1) throw new Error();
      const requestProof = await verifyRequest(scope, identity.uid);
      if (!requestProof || requestProof.verified !== true || requestProof.project !== scope.project || requestProof.tenant !== scope.tenant || requestProof.requestId !== scope.requestId || typeof requestProof.reference !== 'string' || !requestProof.reference) throw new Error();
      const company = await db.collection('empresas').doc(scope.tenant).get();
      if (!company.exists) throw new Error();
      // A suspended/cancelled tenant may still exercise exit rights; don't demand sell.
      return { project: scope.project, tenant: scope.tenant, requestId: scope.requestId, uid: identity.uid, active: true, canConserve: true, requestVerified: true, authorizationVersion: record.versionAutorizacion };
    } catch { throw new Error('EXPORT_AUTHORIZATION_DENIED'); }
  };
}
