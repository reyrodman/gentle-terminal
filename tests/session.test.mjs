import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../session.mjs', import.meta.url));

function sandbox(t) {
  // session.mjs reports canonical paths; the temp dir can be a link (macOS /var) or an 8.3 name (RUNNER~1).
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'gt-session-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'home'), ws = join(base, 'ws');
  mkdirSync(home); mkdirSync(ws);
  const env = { ...process.env, HOME: home, USERPROFILE: home, TEMP: base, TMP: base, TMPDIR: base };
  delete env.CODEX_HOME;
  delete env.XDG_CONFIG_HOME;
  const run = (...args) => spawnSync(process.execPath, [script, ...args, '--workspace', ws], { env, encoding: 'utf8', timeout: 20000 });
  const file = join(ws, '.cursor', 'permissions.json');
  return { base, home, ws, file, run };
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

function output(result, status, stdout, stderr = '') {
  assert.equal(result.status, status);
  assert.equal(result.stdout, stdout);
  assert.equal(result.stderr, stderr);
}

for (const deleted of [false, true]) test(`stale receipt with ${deleted ? 'deleted file' : 'removed entry'} never reauthorizes`, t => {
  const s = sandbox(t);
  assert.equal(s.run('allow').status, 0);
  if (deleted) rmSync(s.file);
  else writeFileSync(s.file, '{"mcpAllowlist":["other:*"]}\n');
  const receipt = readFileSync(`${s.file}.gentle-terminal-session`, 'utf8');
  output(s.run('status'), 0, `drift: recorded allowance is absent (${s.file}); run revoke before allowing again.\n`);
  output(s.run('allow'), 1, '', 'gentle-terminal session: Recorded allowance is absent; run revoke before allowing again.\n');
  assert.equal(readFileSync(`${s.file}.gentle-terminal-session`, 'utf8'), receipt);
  assert.equal(existsSync(s.file), !deleted);
  if (!deleted) assert.equal(readFileSync(s.file, 'utf8'), '{"mcpAllowlist":["other:*"]}\n');
  assert.equal(s.run('revoke').status, 0);
  assert.equal(existsSync(`${s.file}.gentle-terminal-session`), false);
  assert.equal(existsSync(s.file), !deleted);
  if (!deleted) assert.equal(readFileSync(s.file, 'utf8'), '{"mcpAllowlist":["other:*"]}\n');
});

test('status recognizes user-managed allowance without claiming a managed receipt', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"mcpAllowlist":["Gentle-Terminal:*"]}');
  output(s.run('status'), 0, `allowed by your own configuration (${s.file})\n`);
});

test('malformed and tampered receipts are rejected unchanged by every command', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"keep":true}');
  assert.equal(s.run('allow').status, 0);
  const stateFile = `${s.file}.gentle-terminal-session`;
  const valid = JSON.parse(readFileSync(stateFile, 'utf8'));
  const sentinel = join(s.base, 'external-sentinel');
  writeFileSync(sentinel, 'do not read, restore or delete');
  const permissions = readFileSync(s.file, 'utf8');
  const backup = readFileSync(valid.backup, 'utf8');
  const invalid = ['{', 'null', JSON.stringify({ ...valid, backup: sentinel }),
    ...['version', 'since', 'createdDir', 'createdFile', 'createdKey', 'written'].map(key => JSON.stringify({ ...valid, [key]: 'invalid' }))];
  for (const receipt of invalid) {
    writeFileSync(stateFile, receipt);
    for (const command of ['status', 'allow', 'revoke']) {
      output(s.run(command), 1, '', 'gentle-terminal session: Invalid recovery receipt; no changes made.\n');
      assert.equal(readFileSync(stateFile, 'utf8'), receipt);
      assert.equal(readFileSync(s.file, 'utf8'), permissions);
      assert.equal(readFileSync(valid.backup, 'utf8'), backup);
      assert.equal(readFileSync(sentinel, 'utf8'), 'do not read, restore or delete');
    }
  }
});

test('failed permission write leaves a recovery receipt before any allowance is installed', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"keep":true}');
  mkdirSync(`${s.file}.gentle-terminal-tmp`);
  output(s.run('allow'), 1, '', 'gentle-terminal session: Could not install allowance; recovery receipt retained. Run revoke before retrying.\n');
  assert.equal(readFileSync(s.file, 'utf8'), '{"keep":true}');
  assert.ok(existsSync(`${s.file}.gentle-terminal-session`));
  assert.equal(readFileSync(`${s.file}.bak-gentle-terminal-session`, 'utf8'), '{"keep":true}');
  assert.equal(s.run('revoke').status, 0);
  assert.equal(readFileSync(s.file, 'utf8'), '{"keep":true}');
});

test('receipt write failure cannot install an unrecorded allowance', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"keep":true}');
  mkdirSync(`${s.file}.gentle-terminal-session.gentle-terminal-tmp`);
  output(s.run('allow'), 1, '', 'gentle-terminal session: Recovery receipt unavailable; allowance not installed.\n');
  assert.equal(readFileSync(s.file, 'utf8'), '{"keep":true}');
  assert.equal(existsSync(`${s.file}.gentle-terminal-session`), false);
  assert.equal(readFileSync(`${s.file}.bak-gentle-terminal-session`, 'utf8'), '{"keep":true}');
});

test('linked Cursor directory is rejected before accessing external scratch settings', t => {
  const s = sandbox(t);
  const external = join(s.base, 'external-cursor');
  mkdirSync(external);
  const sentinel = join(external, 'permissions.json');
  writeFileSync(sentinel, '{"keep":true}');
  const dir = join(s.ws, '.cursor');
  symlinkSync(external, dir, process.platform === 'win32' ? 'junction' : 'dir');
  for (const command of ['status', 'allow', 'revoke']) {
    output(s.run(command), 1, '', `gentle-terminal session: Unsafe session path: ${dir}.\n`);
    assert.equal(readFileSync(sentinel, 'utf8'), '{"keep":true}');
    assert.deepEqual(readdirSync(external), ['permissions.json']);
  }
});

test('a workspace reached through a directory link remains usable', t => {
  const s = sandbox(t);
  const alias = join(s.base, 'workspace-alias');
  symlinkSync(s.ws, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const run = command => spawnSync(process.execPath, [script, command, '--workspace', alias], {
    env: { ...process.env, HOME: s.home, USERPROFILE: s.home }, encoding: 'utf8', timeout: 20000
  });
  const allowed = run('allow');
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(readFileSync(s.file, 'utf8')), { mcpAllowlist: ['gentle-terminal:*'] });
  const revoked = run('revoke');
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.deepEqual(readdirSync(s.ws), []);
});

for (const kind of ['foreign', 'missing', 'dangling']) test(`receipt backup ${kind} directory fails closed`, t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  writeFileSync(s.file, '{"keep":true}\n');
  assert.equal(s.run('allow').status, 0);
  const stateFile = `${s.file}.gentle-terminal-session`;
  const backup = `${s.file}.bak-gentle-terminal-session`;
  const name = 'permissions.json.bak-gentle-terminal-session';
  const external = join(s.base, 'external');
  const alias = join(s.base, 'alias');
  let recorded, sentinel;
  if (kind === 'missing') recorded = join(s.base, 'missing', name);
  else {
    mkdirSync(external);
    sentinel = join(external, name);
    writeFileSync(sentinel, 'external sentinel');
    if (kind === 'foreign') recorded = sentinel;
    else {
      symlinkSync(external, alias, process.platform === 'win32' ? 'junction' : 'dir');
      renameSync(external, `${external}-moved`);
      sentinel = join(`${external}-moved`, name);
      recorded = join(alias, name);
    }
  }
  const valid = JSON.parse(readFileSync(stateFile, 'utf8'));
  writeFileSync(stateFile, JSON.stringify({ ...valid, backup: recorded }));
  const paths = [s.file, stateFile, backup, ...(sentinel ? [sentinel] : [])];
  const hashes = () => paths.map(path => createHash('sha256').update(readFileSync(path)).digest('hex'));
  const before = hashes();
  for (const command of ['status', 'allow', 'revoke']) {
    output(s.run(command), 1, '', 'gentle-terminal session: Invalid recovery receipt; no changes made.\n');
    assert.deepEqual(hashes(), before);
  }
});

test('legacy v1 receipt through a workspace alias remains revocable', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  const alias = join(s.base, 'legacy-workspace-alias');
  symlinkSync(s.ws, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const original = '\uFEFF{\r\n  "mcpAllowlist": ["other:*"]\r\n}\r\n';
  const installed = JSON.stringify({ mcpAllowlist: ['other:*', 'gentle-terminal:*'] }, null, 2) + '\n';
  const since = '2026-01-01T00:00:00.000Z';
  const backup = `${s.file}.bak-gentle-terminal-session`;
  const stateFile = `${s.file}.gentle-terminal-session`;
  writeFileSync(s.file, installed);
  writeFileSync(backup, original);
  writeFileSync(stateFile, JSON.stringify({ version: 1, since, createdDir: false,
    createdFile: false, createdKey: false,
    backup: join(alias, '.cursor', 'permissions.json.bak-gentle-terminal-session'),
    written: createHash('sha256').update(installed).digest('hex') }) + '\n');
  output(s.run('status'), 0, `active since ${since} (${s.file})\n`);
  output(s.run('revoke'), 0, 'Revoked: Cursor asks again before running gentle-terminal tools in this workspace.\n');
  assert.equal(readFileSync(s.file, 'utf8'), original);
  assert.equal(existsSync(stateFile), false);
  assert.equal(existsSync(backup), false);
});

test('orphan recovery backup is never overwritten by allow', t => {
  const s = sandbox(t);
  mkdirSync(join(s.ws, '.cursor'));
  const backup = `${s.file}.bak-gentle-terminal-session`;
  writeFileSync(s.file, '{}\r\n');
  writeFileSync(backup, 'original recovery sentinel');
  output(s.run('allow'), 1, '', 'gentle-terminal session: Recovery backup already exists; inspect it before allowing again.\n');
  assert.equal(readFileSync(s.file, 'utf8'), '{}\r\n');
  assert.equal(readFileSync(backup, 'utf8'), 'original recovery sentinel');
  assert.equal(existsSync(`${s.file}.gentle-terminal-session`), false);
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
