import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const runtime = new URL('../runtime/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, runtime), 'utf8'));
const integrity = 'sha512-Lj2Zu9Zid2GD8TQOnf4lXUtlqN6a89c+pmqfnHScb2SrLaS42hkoLknYC1c5Iabc7FgtiXA9lDhumOXreq8hwQ==';
test('manifest, lock integrity and installed upstream version match the approved pin', () => {
  assert.equal(json('package.json').dependencies['terminal-use'], '0.2.1');
  const locked = json('package-lock.json').packages['node_modules/terminal-use'];
  assert.equal(locked.version, '0.2.1');
  assert.equal(locked.integrity, integrity);
  assert.equal(json('node_modules/terminal-use/package.json').version, '0.2.1');
});
test('every locked package is a registry tarball with SHA-512 integrity and no install scripts', () => {
  const entries = Object.entries(json('package-lock.json').packages).filter(([path]) => path !== '');
  assert.ok(entries.length > 0);
  for (const [path, meta] of entries) {
    assert.match(meta.resolved, /^https:\/\/registry\.npmjs\.org\/.+\.tgz$/, path);
    assert.match(meta.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, path);
    assert.equal(meta.hasInstallScript, undefined, `${path} declares install scripts`);
  }
  const prebuilt = new Set(entries.map(([path]) => path));
  for (const target of ['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']) {
    assert.ok(prebuilt.has(`node_modules/@lydell/node-pty-${target}`), `node-pty prebuilt ${target}`);
  }
});
