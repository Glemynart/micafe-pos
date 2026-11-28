import { isDeepStrictEqual } from 'node:util';
import { readFile, unlink, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { exportTenant } from './tenant-export.mjs';
import { decryptBundle } from './encrypted-bundle.mjs';
import { savePrivateBundle, validatePrivateOutputParent } from './private-output.mjs';

const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;

/**
 * Executes the local, read-only tenant exit flow. The authority adapter must
 * claim a server-verified representative authorization before tenant reads.
 * Returns metadata only; payloads stay in the encrypted private output.
 */
export async function runPrivateTenantExport({
  project, tenant, sourceSha, requestId, source, key, outputParent, repository,
  maxDocuments, maxBytes, now,
}) {
  if (!idPattern.test(project) || !idPattern.test(tenant) || !idPattern.test(requestId)
    || !/^[a-f0-9]{40}$/.test(sourceSha) || !source || typeof source.authorize !== 'function'
    || typeof source.establishReadTime !== 'function' || !outputParent || !repository) {
    throw new Error('EXPORT_RUNNER_INVALID_CONTEXT');
  }
  const safeOutputParent = await validatePrivateOutputParent({ parent: outputParent, repository });
  const authorizationContext = Object.freeze({ project, tenant, requestId });
  let initialProof, output, authorizationAttempted = false;
  try {
    authorizationAttempted = true;
    initialProof = await source.authorize(authorizationContext);
    if (!initialProof || initialProof.project !== project || initialProof.tenant !== tenant
      || initialProof.requestId !== requestId || initialProof.active !== true
      || initialProof.canConserve !== true || initialProof.requestVerified !== true
      || !idPattern.test(initialProof.uid) || !idPattern.test(initialProof.requestReference)
      || !Number.isSafeInteger(initialProof.authorizationVersion) || initialProof.authorizationVersion < 1) {
      throw new Error('EXPORT_AUTHORIZATION_DENIED');
    }

    const readTime = await source.establishReadTime(authorizationContext);
    const bundle = await exportTenant({
      project, tenant, readTime, sourceSha, requestId, source,
      ...(maxDocuments === undefined ? {} : { maxDocuments }),
      ...(maxBytes === undefined ? {} : { maxBytes }),
      ...(now === undefined ? {} : { now }),
    });
    if (bundle.manifest.requestReference !== initialProof.requestReference
      || bundle.manifest.actorUid !== initialProof.uid) throw new Error('EXPORT_AUTHORITY_CHANGED');

    output = await savePrivateBundle({ parent: safeOutputParent, bundle, key, repository });
    const encrypted = await readFile(output.output);
    const reopened = decryptBundle(encrypted, key);
    if (!isDeepStrictEqual(reopened, bundle)) throw new Error('EXPORT_OUTPUT_VERIFICATION_FAILED');
    if (typeof source.completeExport === 'function') {
      const completed = await source.completeExport({
        project, tenant, requestId, uid: initialProof.uid,
        artifact: { sha256: output.sha256, bytes: output.bytes },
      });
      if (completed !== true) throw new Error('EXPORT_AUTHORIZATION_COMPLETION_FAILED');
    }
    return { manifest: bundle.manifest, output };
  } catch (error) {
    // Remove only the exact artifact created by this invocation after a failed
    // run. Never recurse or touch the source project.
    if (output?.output) {
      try { await unlink(output.output); } catch {}
      try { await rmdir(dirname(output.output)); } catch {}
    }
    if (authorizationAttempted && typeof source.failExport === 'function') {
      const message = typeof error?.message === 'string' ? error.message : '';
      await source.failExport({
        project, tenant, requestId, uid: initialProof?.uid,
        errorCode: /^EXPORT_[A-Z0-9_]{1,100}$/.test(message) ? message : 'EXPORT_ABORTED',
      });
    }
    throw error;
  }
}
