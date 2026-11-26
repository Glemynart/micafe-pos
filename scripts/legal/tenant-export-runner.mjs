import { isDeepStrictEqual } from 'node:util';
import { readFile, unlink, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { exportTenant } from './tenant-export.mjs';
import { decryptBundle } from './encrypted-bundle.mjs';
import { savePrivateBundle, validatePrivateOutputParent } from './private-output.mjs';

const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;

/**
 * Executes the local, read-only tenant exit flow. The caller must provide a
 * source whose authority adapter verifies the current platform operator and
 * requires an explicit attestation/reference for the external representative
 * request before any tenant reads.
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
  const initialProof = await source.authorize(authorizationContext);
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

  const output = await savePrivateBundle({ parent: safeOutputParent, bundle, key, repository });
  try {
    const encrypted = await readFile(output.output);
    const reopened = decryptBundle(encrypted, key);
    if (!isDeepStrictEqual(reopened, bundle)) throw new Error('EXPORT_OUTPUT_VERIFICATION_FAILED');
    return { manifest: bundle.manifest, output };
  } catch {
    // Remove only the exact artifact created by this invocation on a failed
    // local integrity check. Never recurse or touch the source project.
    try { await unlink(output.output); } catch {}
    try { await rmdir(dirname(output.output)); } catch {}
    throw new Error('EXPORT_OUTPUT_VERIFICATION_FAILED');
  }
}
