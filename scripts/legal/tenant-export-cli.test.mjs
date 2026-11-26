import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './tenant-export-cli.mjs';

const valid = [
  '--project', 'micafe-pos',
  '--tenant', 'distribuidora-las-jimenez',
  '--output-parent', 'C:\\secure\\exports',
  '--execute',
];

test('production CLI pins Diana tenant and derives its Firebase bucket', () => {
  const options = parseArgs(valid);
  assert.equal(options.project, 'micafe-pos');
  assert.equal(options.tenant, 'distribuidora-las-jimenez');
  assert.equal(options.bucket, 'micafe-pos.firebasestorage.app');
  assert.equal(options.execute, true);
});

test('staging CLI derives staging bucket and permits synthetic scoped tenant', () => {
  const options = parseArgs([
    '--project', 'micafe-pos-staging', '--tenant', 'demo-tenant-a',
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
});
