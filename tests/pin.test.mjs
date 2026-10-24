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
