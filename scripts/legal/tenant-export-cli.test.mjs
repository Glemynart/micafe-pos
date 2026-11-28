import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { currentSourceSha, parseArgs } from './tenant-export-cli.mjs';

const valid = [
  '--project', 'micafe-pos',
  '--tenant', 'distribuidora-las-jimenez',
  '--request-id', 'server-approved-request',
  '--output-parent', 'C:\\secure\\exports',
  '--execute',
];

test('production CLI pins Diana tenant and derives its Firebase bucket', () => {
  const options = parseArgs(valid);
  assert.equal(options.project, 'micafe-pos');
  assert.equal(options.tenant, 'distribuidora-las-jimenez');
  assert.equal(options.requestId, 'server-approved-request');
  assert.equal(options.bucket, 'micafe-pos.firebasestorage.app');
  assert.equal(options.execute, true);
});

test('staging CLI derives staging bucket and permits synthetic scoped tenant', () => {
  const options = parseArgs([
    '--project', 'micafe-pos-staging', '--tenant', 'demo-tenant-a', '--request-id', 'server-approved-request',
    '--output-parent', 'C:\\secure\\exports', '--execute',
  ]);
  assert.equal(options.bucket, 'micafe-pos-staging.firebasestorage.app');
});

test('rejects production scope widening, caller-selected buckets, and implicit execution', () => {
  assert.throws(() => parseArgs([
    '--project', 'micafe-pos', '--tenant', 'another-tenant',
    '--output-parent', 'C:\\secure\\exports', '--execute',
  ]), /USAGE/);
  assert.throws(() => parseArgs([...valid, '--bucket', 'other-project.firebasestorage.app']), /USAGE/);
  assert.throws(() => parseArgs(valid.filter(value => value !== '--execute')), /USAGE/);
  assert.throws(() => parseArgs(valid.filter(value => value !== '--request-id' && value !== 'server-approved-request')), /USAGE/);
});

test('source revision rejects staged, unstaged, and untracked repository content', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'dusema-export-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'ignore', windowsHide: true });
  try {
    git('init');
    git('config', 'user.email', 'codex-test@example.invalid');
    git('config', 'user.name', 'Codex test');
    await writeFile(join(repository, 'tracked.txt'), 'committed');
    git('add', 'tracked.txt');
    git('commit', '-m', 'fixture');
    assert.match(currentSourceSha(repository), /^[a-f0-9]{40}$/);

    await writeFile(join(repository, 'untracked.txt'), 'not committed');
    assert.throws(() => currentSourceSha(repository), /EXPORT_SOURCE_REVISION_UNAVAILABLE/);
    await rm(join(repository, 'untracked.txt'));

    await writeFile(join(repository, 'tracked.txt'), 'modified');
    assert.throws(() => currentSourceSha(repository), /EXPORT_SOURCE_REVISION_UNAVAILABLE/);
    git('checkout', '--', 'tracked.txt');

    await writeFile(join(repository, 'tracked.txt'), 'staged');
    git('add', 'tracked.txt');
    assert.throws(() => currentSourceSha(repository), /EXPORT_SOURCE_REVISION_UNAVAILABLE/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
