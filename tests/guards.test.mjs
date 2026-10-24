import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const launcher = fileURLToPath(new URL('../launch.mjs', import.meta.url));
// Preload that fakes the runtime environment before launch.mjs reads it.
const fake = code => 'data:text/javascript,' + encodeURIComponent(code);
const run = (preload, args = ['--version']) => spawnSync(process.execPath, ['--import', fake(preload), launcher, ...args], {
  cwd: root, encoding: 'utf8', timeout: 5000
});
const versions = v => `Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '${v}' } });`;
const platform = (p, a) => `Object.defineProperty(process, 'platform', { value: '${p}' }); Object.defineProperty(process, 'arch', { value: '${a}' });`;

test('launcher rejects Node older than 22.12 before loading the runtime', () => {
  for (const v of ['20.18.0', '22.11.9', '18.0.0']) {
    const r = run(versions(v));
    assert.equal(r.status, 1, v);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, 'gentle-terminal: requires Node >=22.12.0.\n');
  }
});

test('launcher accepts the minimum and newer Node versions', () => {
  for (const v of ['22.12.0', '23.0.0', '24.1.0']) {
    const r = run(versions(v));
    assert.equal(r.status, 0, `${v}: ${r.stderr}`);
    assert.equal(r.stdout, '0.2.1\n');
  }
});

test('launcher rejects platforms without prebuilt dependencies', () => {
  for (const [p, a] of [['freebsd', 'x64'], ['linux', 'ia32'], ['win32', 'arm'], ['android', 'arm64']]) {
    const r = run(platform(p, a));
    assert.equal(r.status, 1, `${p}/${a}`);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, `gentle-terminal: unsupported platform ${p}/${a}; requires Windows, Linux or macOS x64/arm64 prebuilt dependencies.\n`);
  }
});

test('launcher reports a broken runtime on stderr and keeps stdout clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gentle terminal broken-'));
  try {
    const bin = join(dir, 'runtime', 'node_modules', 'terminal-use', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'terminal-use.js'), "throw new Error('prebuilt binary missing');\n");
    copyFileSync(launcher, join(dir, 'launch.mjs'));
    const r = spawnSync(process.execPath, [join(dir, 'launch.mjs')], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, 'gentle-terminal: upstream startup failed: prebuilt binary missing\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
