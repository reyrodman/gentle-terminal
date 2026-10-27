import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../session.mjs', import.meta.url));

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), 'gt-session-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'home'), ws = join(base, 'ws');
  mkdirSync(home); mkdirSync(ws);
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const run = (...args) => spawnSync(process.execPath, [script, ...args, '--workspace', ws], { env, encoding: 'utf8', timeout: 20000 });
  const file = join(ws, '.cursor', 'permissions.json');
  return { home, ws, file, run };
}

test('allow then revoke leaves a workspace without .cursor exactly as it was', t => {
  const s = sandbox(t);
  const allow = s.run('allow');
  assert.equal(allow.status, 0, allow.stderr);
  assert.deepEqual(JSON.parse(readFileSync(s.file, 'utf8')), { mcpAllowlist: ['gentle-terminal:*'] });
  assert.match(allow.stdout, /ignores the MCP allowlist in Settings/);
  assert.match(allow.stdout, /Run Mode/);
  assert.match(allow.stdout, /stays until revoked/);
  assert.match(allow.stdout, /session\.mjs" revoke --workspace "/);
  assert.match(s.run('status').stdout, /^active since /m);
  const revoke = s.run('revoke');
  assert.equal(revoke.status, 0, revoke.stderr);
  assert.match(revoke.stdout, /Revoked/);
  assert.deepEqual(readdirSync(s.ws), []);
  assert.match(s.run('status').stdout, /^not active/m);
});

test('an existing file keeps its entries and is restored byte for byte, without leftovers', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  const original = '{\n    "terminalAllowlist": ["git"],\n    "mcpAllowlist": ["github:*"]\n}\n';
  writeFileSync(s.file, original);
  const allow = s.run('allow');
  assert.equal(allow.status, 0, allow.stderr);
  const data = JSON.parse(readFileSync(s.file, 'utf8'));
  assert.deepEqual(data, { terminalAllowlist: ['git'], mcpAllowlist: ['github:*', 'gentle-terminal:*'] });
  assert.doesNotMatch(allow.stdout, /ignores the MCP allowlist in Settings/);
  assert.equal(s.run('revoke').status, 0);
  assert.equal(readFileSync(s.file, 'utf8'), original);
  assert.deepEqual(readdirSync(join(s.ws, '.cursor')), ['permissions.json']);
});

test('revoke removes only its own entry when the file changed meanwhile', t => {
  const s = sandbox(t);
  assert.equal(s.run('allow').status, 0);
  const data = JSON.parse(readFileSync(s.file, 'utf8'));
  data.mcpAllowlist.push('linear:*');
  writeFileSync(s.file, JSON.stringify(data, null, 2) + '\n');
  assert.equal(s.run('revoke').status, 0);
  assert.deepEqual(JSON.parse(readFileSync(s.file, 'utf8')), { mcpAllowlist: ['linear:*'] });
});

test('revoke still removes its entry when the backup was deleted', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"x":1}');
  assert.equal(s.run('allow').status, 0);
  rmSync(`${s.file}.bak-gentle-terminal-session`);
  const revoke = s.run('revoke');
  assert.equal(revoke.status, 0, revoke.stderr);
  assert.deepEqual(JSON.parse(readFileSync(s.file, 'utf8')), { x: 1 });
  assert.deepEqual(readdirSync(join(s.ws, '.cursor')), ['permissions.json']);
});

test('allow is idempotent and an entry the user already has is never revoked', t => {
  const s = sandbox(t);
  assert.equal(s.run('allow').status, 0);
  const before = readFileSync(s.file, 'utf8');
  const again = s.run('allow');
  assert.equal(again.status, 0);
  assert.match(again.stdout, /already active/);
  assert.equal(readFileSync(s.file, 'utf8'), before);
  assert.equal(s.run('revoke').status, 0);

  mkdirSync(join(s.ws, '.cursor'), { recursive: true });
  writeFileSync(s.file, '{ "mcpAllowlist": ["Gentle-Terminal:*"] }\n');
  const own = s.run('allow');
  assert.equal(own.status, 0);
  assert.match(own.stdout, /already allowed by your own configuration/);
  const revoke = s.run('revoke');
  assert.match(revoke.stdout, /Nothing to revoke/);
  assert.equal(readFileSync(s.file, 'utf8'), '{ "mcpAllowlist": ["Gentle-Terminal:*"] }\n');
});

test('a file with comments is left alone and the dialog is suggested instead', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  const jsonc = '{\n  // mine\n  "mcpAllowlist": []\n}\n';
  writeFileSync(s.file, jsonc);
  const allow = s.run('allow');
  assert.equal(allow.status, 1);
  assert.match(allow.stderr, /comments/);
  assert.match(allow.stderr, /approve from Cursor's dialog/);
  assert.equal(readFileSync(s.file, 'utf8'), jsonc);
  assert.equal(existsSync(`${s.file}.gentle-terminal-session`), false);
});

test('no Settings override warning when the user-level file already defines an MCP allowlist', t => {
  const s = sandbox(t);
  mkdirSync(join(s.home, '.cursor'));
  writeFileSync(join(s.home, '.cursor', 'permissions.json'), '{ "mcpAllowlist": ["github:*"] }\n');
  const allow = s.run('allow');
  assert.equal(allow.status, 0, allow.stderr);
  assert.doesNotMatch(allow.stdout, /ignores the MCP allowlist in Settings/);
});

test('revoke without an active allowance and invalid usage', t => {
  const s = sandbox(t);
  const revoke = s.run('revoke');
  assert.equal(revoke.status, 0);
  assert.match(revoke.stdout, /Nothing to revoke/);
  const bad = s.run('grant');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Usage: node session\.mjs/);
});
