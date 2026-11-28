import { mkdtemp, writeFile, lstat, realpath, chmod } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { encryptBundle, encryptedDigest } from './encrypted-bundle.mjs';

/** Preflight the private target before reading any tenant payload. */
export async function validatePrivateOutputParent({ parent, repository }) {
  const resolved = await realpath(resolve(parent));
  const repo = await realpath(resolve(repository));
  const rel = relative(repo, resolved);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel)) || /(?:^|[\\/])(?:\.codex|\.git|onedrive[^\\/]*|dropbox|downloads)(?:[\\/]|$)/i.test(resolved)) throw new Error('EXPORT_UNSAFE_OUTPUT_DIRECTORY');
  // Require a real existing parent; do not follow a junction/symlink supplied as parent.
  if ((await lstat(resolve(parent))).isSymbolicLink() || !(await lstat(resolved)).isDirectory()) throw new Error('EXPORT_UNSAFE_OUTPUT_DIRECTORY');
  for (let cursor = resolved; ; cursor = dirname(cursor)) {
    try { await lstat(join(cursor, '.git')); throw new Error('EXPORT_OUTPUT_INSIDE_GIT'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(cursor) === cursor) break;
  }
  return resolved;
}

/** Creates a new private directory and writes ciphertext only. Never deletes or overwrites. */
export async function savePrivateBundle({ parent, bundle, key, repository }) {
  const resolved = await validatePrivateOutputParent({ parent, repository });
  const ciphertext = encryptBundle(bundle, key);
  const directory = await mkdtemp(join(resolved, 'dusema-exit-'));
  if (process.platform === 'win32') {
    const user = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = user.match(/S-1-\d+(?:-\d+)+/u)?.[0];
    if (!sid) throw new Error('EXPORT_PRIVATE_OUTPUT_UNAVAILABLE');
    execFileSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: 'pipe' });
  } else await chmod(directory, 0o700);
  if (dirname(await realpath(directory)) !== resolved || (await lstat(directory)).isSymbolicLink()) throw new Error('EXPORT_OUTPUT_DIRECTORY_CHANGED');
  const output = join(directory, 'bundle.dusema');
  await writeFile(output, ciphertext, { flag: 'wx', mode: 0o600 });
  return { output, sha256: encryptedDigest(ciphertext), bytes: ciphertext.byteLength };
}
