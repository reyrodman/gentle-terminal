import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, copyFileSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const launcher = fileURLToPath(new URL('launch.mjs', root));
const run = (entry, args) => spawnSync(process.execPath, [entry, ...args], {
  cwd: fileURLToPath(root), encoding: 'utf8', timeout: 5000
});
test('launcher forwards version exactly from a path containing spaces', () => {
  const r = run(launcher, ['--version']);
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '0.2.1\n');
  assert.equal(r.stderr, '');
});
test('launcher forwards help and rejects unknown upstream options', () => {
  const help = run(launcher, ['--help']);
  assert.equal(help.status, 0);
  assert.equal(help.stdout, '');
  assert.match(help.stderr, /Usage:/);
  const bad = run(launcher, ['--not-an-option']);
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /Unknown option/);
});
test('relocation and missing-install cleanup preserve unrelated fixtures', () => {
  const parent = fileURLToPath(new URL('.test-runtime/', root));
  mkdirSync(parent, { recursive: true });
  const sentinel = mkdtempSync(join(parent, 'sentinel-'));
  const relocated = mkdtempSync(join(parent, 'relocated bundle with spaces-'));
  const missing = mkdtempSync(join(parent, 'missing package with spaces-'));
  writeFileSync(join(sentinel, 'keep.txt'), 'preserve');
  try {
    try {
      copyFileSync(launcher, join(relocated, 'launch.mjs'));
      cpSync(new URL('runtime/', root), join(relocated, 'runtime'), {
        recursive: true, filter: source => basename(source) !== '.cache'
      });
      const r = run(join(relocated, 'launch.mjs'), ['--version']);
      assert.equal(r.error, undefined);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '0.2.1\n');
      assert.equal(r.stderr, '');
    } finally { rmSync(relocated, { recursive: true, force: true }); }
    assert.equal(readFileSync(join(sentinel, 'keep.txt'), 'utf8'), 'preserve');
    try {
      copyFileSync(launcher, join(missing, 'launch.mjs'));
      const r = run(join(missing, 'launch.mjs'), []);
      assert.equal(r.error, undefined);
      assert.equal(r.status, 1);
      assert.equal(r.stdout, '');
      assert.equal(r.stderr, 'gentle-terminal: runtime missing; run "npm run setup" in the gentle-terminal folder.\n');
    } finally { rmSync(missing, { recursive: true, force: true }); }
    assert.equal(readFileSync(join(sentinel, 'keep.txt'), 'utf8'), 'preserve');
  } finally {
    for (const own of [relocated, missing, sentinel]) rmSync(own, { recursive: true, force: true });
  }
});
