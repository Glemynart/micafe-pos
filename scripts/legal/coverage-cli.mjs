import { execFileSync } from 'node:child_process';
import { createReadSource } from './firestore-source.mjs';
import { inspectCoverage } from './export-schema.mjs';

// Sole executable: metadata only. No flags for extracting payloads or deleting data.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--project' || !/^(micafe-pos(?:-staging)?|demo-[a-z0-9-]+)$/.test(args[1])) throw new Error('USAGE: node scripts/legal/coverage-cli.mjs --project <approved-project>');
  const project = args[1];
  const getAccessToken = async () => {
    try {
      // Constant read-only command; no user data interpolated into a shell.
      const options = { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] };
      const value = process.platform === 'win32'
        ? execFileSync('powershell.exe', ['-NoProfile', '-Command', '$cloudCli = Get-Command gcloud.cmd -ErrorAction Stop; & $cloudCli.Source auth print-access-token; exit $LASTEXITCODE'], options)
        : execFileSync('gcloud', ['auth', 'print-access-token'], options);
      const token = value.trim();
      if (!token) throw new Error();
      return token;
    } catch { throw new Error('METADATA_CREDENTIAL_UNAVAILABLE'); }
  };
  const source = createReadSource({ project, tenant: 'metadata-only', getAccessToken, authorize: undefined, storage: undefined });
  const roots = await source.listRoots({});
  const coverage = inspectCoverage(roots);
  console.log(JSON.stringify({ project, observedAt: new Date().toISOString(), rootCount: roots.length, ...coverage }, null, 2));
}
main().catch(error => {
  // Allow only codes authored here or by the read-only transport, never remote bodies.
  console.error(typeof error?.message === 'string' && /^(EXPORT_[A-Z_0-9]+|METADATA_CREDENTIAL_UNAVAILABLE|USAGE: .+)$/.test(error.message) ? error.message : 'METADATA_PREFLIGHT_FAILED');
  process.exitCode = 1;
});
