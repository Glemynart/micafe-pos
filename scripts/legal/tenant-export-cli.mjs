import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createOperatorAuthorizer } from './operator-authority.mjs';
import { createReadSource } from './firestore-source.mjs';
import { createStorageReader } from './storage-source.mjs';
import { runPrivateTenantExport } from './tenant-export-runner.mjs';

const PROJECTS = new Set(['micafe-pos', 'micafe-pos-staging']);
const PILOT_TENANT = 'distribuidora-las-jimenez';

function bucketFor(project) {
  return `${project}.firebasestorage.app`;
}

export function parseArgs(args) {
  const values = new Map();
  let execute = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--execute') { execute = true; continue; }
    if (arg === '--help') return { help: true };
    if (!['--project', '--tenant', '--output-parent'].includes(arg) || values.has(arg) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('USAGE: node scripts/legal/tenant-export-cli.mjs --project <micafe-pos|micafe-pos-staging> --tenant <tenant-id> --output-parent <private-existing-directory> --execute');
    }
    values.set(arg, args[++index]);
  }
  const project = values.get('--project');
  const tenant = values.get('--tenant');
  const outputParent = values.get('--output-parent');
  if (!execute || !PROJECTS.has(project) || !/^[a-zA-Z0-9_-]{1,120}$/.test(tenant ?? '')
    || !outputParent || (project === 'micafe-pos' && tenant !== PILOT_TENANT)) {
    throw new Error('USAGE: node scripts/legal/tenant-export-cli.mjs --project <micafe-pos|micafe-pos-staging> --tenant <tenant-id> --output-parent <private-existing-directory> --execute');
  }
  return { project, tenant, bucket: bucketFor(project), outputParent: resolve(outputParent), execute };
}

async function promptLine(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}

async function promptHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('EXPORT_INTERACTIVE_TTY_REQUIRED');
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolvePrompt, rejectPrompt) => {
    let value = '';
    const finish = (error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) rejectPrompt(error); else resolvePrompt(value);
    };
    const onData = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('EXPORT_CANCELLED'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && character <= '~') value += character;
      }
    };
    stdin.on('data', onData);
  });
}

function accessToken() {
  try {
    const options = { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] };
    const value = process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-Command', '$cloudCli = Get-Command gcloud.cmd -ErrorAction Stop; & $cloudCli.Source auth print-access-token; exit $LASTEXITCODE'], options)
      : execFileSync('gcloud', ['auth', 'print-access-token'], options);
    const token = value.trim();
    if (!token) throw new Error();
    return token;
  } catch { throw new Error('EXPORT_CLOUD_CREDENTIAL_UNAVAILABLE'); }
}

function currentSourceSha(repository) {
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!/^[a-f0-9]{40}$/.test(value)) throw new Error();
    return value;
  } catch { throw new Error('EXPORT_SOURCE_REVISION_UNAVAILABLE'); }
}

function formatPublicError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return /^(EXPORT_[A-Z0-9_]+|USAGE: .+)$/.test(message) ? message : 'EXPORT_ABORTED';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    stdout.write('Exportación local cifrada, solo lectura. No requiere una cuenta del tenant. Requiere operador SaaS, referencia externa verificada, ADC, gcloud y directorio privado existente.\n');
    stdout.write('Piloto de producción restringido a distribuidora-las-jimenez; bucket Firebase derivado del proyecto.\n');
    stdout.write('node scripts/legal/tenant-export-cli.mjs --project <micafe-pos|micafe-pos-staging> --tenant <tenant-id> --output-parent <private-existing-directory> --execute\n');
    return;
  }
  const sourceSha = currentSourceSha(fileURLToPath(new URL('../../', import.meta.url)));
  const requestId = randomUUID();
  const requestReference = (await promptLine(`Referencia externa verificable de la autorización de Diana para ${options.tenant}: `)).trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(requestReference)) throw new Error('EXPORT_REQUEST_REFERENCE_REQUIRED');
  const attestation = await promptLine('Verifiqué la instrucción del representante para este proyecto y tenant. Escribe VERIFICADO para continuar: ');
  if (attestation !== 'VERIFICADO') throw new Error('EXPORT_REQUEST_NOT_VERIFIED');
  const executionConfirmation = await promptLine('Esto leerá datos reales del tenant y sus archivos para crear un bundle cifrado. Escribe EXPORTAR para continuar: ');
  if (executionConfirmation !== 'EXPORTAR') throw new Error('EXPORT_CANCELLED');

  let token = '';
  let key;
  let app;
  try {
    token = await promptHidden('Token de sesión Firebase del operador SaaS (entrada oculta): ');
    if (!token || token.length > 8192) throw new Error('EXPORT_OPERATOR_TOKEN_REQUIRED');
    let keyText = await promptHidden('Clave Base64 de 32 bytes para cifrar el bundle (entrada oculta): ');
    key = Buffer.from(keyText, 'base64');
    if (key.byteLength !== 32 || key.toString('base64') !== keyText) throw new Error('EXPORT_KEY_MUST_BE_32_BYTES');
    keyText = '';

    app = initializeApp({ credential: applicationDefault(), projectId: options.project }, `dusema-export-${requestId}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let identity;
    try { identity = await auth.verifyIdToken(token, true); }
    catch { throw new Error('EXPORT_OPERATOR_AUTHENTICATION_FAILED'); }
    if (identity.aud !== options.project || identity.iss !== `https://securetoken.google.com/${options.project}`) throw new Error('EXPORT_OPERATOR_AUTHENTICATION_FAILED');
    const request = {
      project: options.project, tenant: options.tenant, requestId, operatorUid: identity.uid,
      validUntil: new Date(Date.now() + 40 * 60_000).toISOString(),
    };
    const authorize = createOperatorAuthorizer({
      auth, db, readIdToken: async () => token, request,
      verifyRequest: async (scope, uid) => scope.project === options.project && scope.tenant === options.tenant
        && scope.requestId === requestId && uid === identity.uid
        ? { verified: true, project: options.project, tenant: options.tenant, requestId, reference: requestReference }
        : null,
    });
    const getAccessToken = async () => accessToken();
    const source = createReadSource({
      project: options.project, tenant: options.tenant, getAccessToken, authorize,
      storage: createStorageReader({ bucket: options.bucket, getAccessToken }),
    });
    const result = await runPrivateTenantExport({
      project: options.project, tenant: options.tenant, sourceSha, requestId, source, key,
      outputParent: options.outputParent, repository: fileURLToPath(new URL('../../', import.meta.url)),
    });
    stdout.write(JSON.stringify({
      status: result.manifest.status,
      project: result.manifest.project,
      tenant: result.manifest.tenant,
      requestId: result.manifest.requestId,
      requestReference: result.manifest.requestReference,
      actorUid: result.manifest.actorUid,
      readTime: result.manifest.readTime,
      totalDocuments: result.manifest.totalDocuments,
      totalBytes: result.manifest.totalBytes,
      sources: result.manifest.sources,
      output: result.output,
    }, null, 2) + '\n');
  } finally {
    token = '';
    key?.fill(0);
    if (app) await app.delete().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(formatPublicError(error)); process.exitCode = 1; });
}
