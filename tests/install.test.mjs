import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeStatus } from '../install.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const installer = join(root, 'install.mjs');
const launcher = join(root, 'launch.mjs');
const windows = process.platform === 'win32';

function machine() {
  const home = mkdtempSync(join(tmpdir(), 'gt-install-'));
  const appData = windows ? join(home, 'AppData', 'Roaming')
    : process.platform === 'darwin' ? join(home, 'Library', 'Application Support') : join(home, '.config');
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming') };
  delete env.XDG_CONFIG_HOME;
  const file = (rel, text) => { const p = join(home, rel); mkdirSync(join(p, '..'), { recursive: true }); if (text !== undefined) writeFileSync(p, text); return p; };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [installer, ...args], { env, encoding: 'utf8', timeout: 60000 });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { home, appData, file, run, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
const json = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
// Walks without following links: skill links point into this checkout.
function walk(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap(e => {
    const p = join(rel, e.name);
    const full = join(dir, p);
    if (lstatSync(full).isSymbolicLink()) return [`${p} -> ${realpathSync(full)}`];
    if (e.isDirectory()) return [p, ...walk(dir, p)];
    return [`${p}:${readFileSync(full, 'utf8')}`];
  });
}
const tree = dir => walk(dir).sort();
const backups = dir => walk(dir).filter(p => p.includes('.bak-gentle-terminal-'));
const other = { command: 'npx', args: ['-y', 'other-server'] };

test('first install registers every detected client, keeps their other settings and skips absent clients', t => {
  const m = machine();
  t.after(m.cleanup);
  const cursor = m.file('.cursor/mcp.json', JSON.stringify({ mcpServers: { other } }, null, 4).replace(/\n/g, '\r\n') + '\r\n');
  const codex = m.file('.codex/config.toml', 'model = "x"\n\n[mcp_servers.other]\ncommand = "npx"\nargs = ["-y", "other-server"]\n\n[projects.\'/work\']\ntrust_level = "trusted"\n');
  const claude = m.file('.claude.json', JSON.stringify({ numStartups: 3, mcpServers: {} }));
  const antigravity = m.file('.gemini/config/mcp_config.json', '');
  m.file('.config/opencode/x');
  mkdirSync(join(m.appData, 'Code', 'User'), { recursive: true });

  const r = m.run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /First installation:/);
  assert.match(r.out, /Restart or reload MCP servers in: /);

  const c = readFileSync(cursor, 'utf8');
  assert.match(c, /\r\n {4}"mcpServers"/, 'indent and CRLF kept');
  assert.deepEqual(json(cursor).mcpServers, { other, 'gentle-terminal': { command: 'node', args: [launcher] } });
  const toml = readFileSync(codex, 'utf8');
  assert.ok(toml.startsWith('model = "x"\n\n[mcp_servers.other]\ncommand = "npx"\nargs = ["-y", "other-server"]\n\n[projects.\'/work\']\ntrust_level = "trusted"\n'), toml);
  assert.ok(toml.includes(`[mcp_servers.gentle-terminal]\ncommand = 'node'\nargs = ['${launcher}']\n`), toml);
  assert.equal(json(claude).numStartups, 3);
  assert.deepEqual(json(claude).mcpServers['gentle-terminal'], { type: 'stdio', command: 'node', args: [launcher], env: {} });
  assert.deepEqual(json(antigravity).mcpServers['gentle-terminal'], { command: 'node', args: [launcher] });
  assert.deepEqual(json(join(m.home, '.config/opencode/opencode.json')).mcp['gentle-terminal'], { type: 'local', command: ['node', launcher], enabled: true });
  assert.deepEqual(json(join(m.appData, 'Code', 'User', 'mcp.json')).servers['gentle-terminal'], { type: 'stdio', command: 'node', args: [launcher] });
  assert.equal(backups(m.home).length, 4, 'one backup per existing file that changed');

  for (const dir of ['.agents/skills', '.claude/skills', '.config/opencode/skills', '.gemini/config/skills']) {
    assert.equal(realpathSync(join(m.home, dir, 'gentle-terminal')), realpathSync(root), dir);
  }
  for (const absent of ['.codeium', '.gemini/settings.json', '.gemini/skills']) assert.ok(!existsSync(join(m.home, absent)), absent);
  assert.match(r.out, /Windsurf\s+not installed/);

  const before = tree(m.home);
  const again = m.run();
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /Updating existing installation:/);
  assert.doesNotMatch(again.out, /added|updated|Restart/);
  assert.deepEqual(tree(m.home), before, 'second run changes nothing');
});

test('an update repoints old entries in place and keeps their name, extra arguments and subtables', t => {
  const m = machine();
  t.after(m.cleanup);
  const old = m.file('old/terminal-session-control/package.json', JSON.stringify({ name: 'terminal-session-control' }));
  const oldLaunch = join(old, '..', 'launch.mjs');
  const cursor = m.file('.cursor/mcp.json', JSON.stringify({ mcpServers: { 'terminal-session-control': { type: 'stdio', command: 'node', args: [oldLaunch, '--cwd', 'work'] }, other } }, null, 2));
  const codex = m.file('.codex/config.toml', `[mcp_servers.gentle-terminal]\ncommand = "node"\nargs = [\n  "${oldLaunch.replace(/\\/g, '\\\\')}",\n]\n\n[mcp_servers.gentle-terminal.env]\nA = "1"\n`);

  const r = m.run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Updating existing installation:/);
  assert.deepEqual(json(cursor).mcpServers, { 'terminal-session-control': { type: 'stdio', command: 'node', args: [launcher, '--cwd', 'work'] }, other });
  assert.equal(readFileSync(codex, 'utf8'), `[mcp_servers.gentle-terminal]\ncommand = "node"\nargs = ['${launcher}']\n\n[mcp_servers.gentle-terminal.env]\nA = "1"\n`);
});

test('a client installed after the first run is added on the next run, existing ones stay up to date', t => {
  const m = machine();
  t.after(m.cleanup);
  m.file('.config/opencode/opencode.json', '{}');
  const first = m.run();
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /First installation:/);
  assert.match(first.out, /Codex \(CLI, app and IDE extension\)\s+not installed/);

  const codex = m.file('.codex/config.toml', 'model = "x"\n');
  const next = m.run();
  assert.equal(next.code, 0, next.out);
  assert.match(next.out, /Updating existing installation:/);
  assert.match(next.out, /OpenCode\s+up to date/);
  assert.match(next.out, /Codex \(CLI, app and IDE extension\)\s+added/);
  assert.match(next.out, /Restart or reload MCP servers in: Codex \(CLI, app and IDE extension\)\./);
  assert.match(readFileSync(codex, 'utf8'), /\[mcp_servers\.gentle-terminal\]/);
  assert.equal(realpathSync(join(m.home, '.agents/skills/gentle-terminal')), realpathSync(root));
});

test('Claude Code project-scope entries are repointed, never added, and removed on uninstall', t => {
  const m = machine();
  t.after(m.cleanup);
  const old = m.file('old/gentle-terminal/package.json', JSON.stringify({ name: 'gentle-terminal' }));
  const oldLaunch = join(old, '..', 'launch.mjs');
  const claude = m.file('.claude.json', JSON.stringify({ projects: {
    'C:/work': { mcpServers: { 'gentle-terminal': { type: 'stdio', command: 'node', args: [oldLaunch], env: {} } } },
    'C:/other': { mcpServers: { other } }
  } }));
  const r = m.run('--only', 'claude-code');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Updating existing installation:/);
  const data = json(claude);
  assert.deepEqual(data.projects['C:/work'].mcpServers['gentle-terminal'].args, [launcher]);
  assert.deepEqual(data.projects['C:/other'].mcpServers, { other });
  assert.deepEqual(data.mcpServers['gentle-terminal'].args, [launcher]);
  assert.equal(m.run('--uninstall', '--only', 'claude-code').code, 0);
  const after = json(claude);
  assert.deepEqual(after.projects['C:/work'].mcpServers, {});
  assert.deepEqual(after.projects['C:/other'].mcpServers, { other });
  assert.deepEqual(after.mcpServers, {});
});

test('uninstall keeps comments that belong to the next TOML table', t => {
  const m = machine();
  t.after(m.cleanup);
  const tail = '# about projects\n[projects.\'/work\']\ntrust_level = "trusted"\n';
  const codex = m.file('.codex/config.toml', `[mcp_servers.gentle-terminal]\ncommand = 'node'\nargs = ['${launcher}']\n\n${tail}`);
  const r = m.run('--uninstall', '--only', 'codex');
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(codex, 'utf8'), tail);
});

test('CODEX_HOME moves the Codex config', t => {
  const m = machine();
  t.after(m.cleanup);
  const custom = m.file('codex-home/config.toml', '');
  const r = spawnSync(process.execPath, [installer, '--only', 'codex'], { env: { ...process.env, HOME: m.home, USERPROFILE: m.home, CODEX_HOME: join(m.home, 'codex-home') }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.match(readFileSync(custom, 'utf8'), /\[mcp_servers\.gentle-terminal\]/);
  assert.ok(!existsSync(join(m.home, '.codex')));
});

test('files it cannot edit safely are reported for a manual step and left byte-for-byte unchanged', t => {
  const m = machine();
  t.after(m.cleanup);
  const commented = '{\n  // mine\n  "mcpServers": {}\n}\n';
  const cursor = m.file('.cursor/mcp.json', commented);
  const inline = 'mcp_servers = { gentle-terminal = { command = "node" } }\n';
  const codex = m.file('.codex/config.toml', inline);
  const folder = m.file('.agents/skills/gentle-terminal/SKILL.md', 'someone else');

  const r = m.run();
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /contains comments; edit it by hand/);
  assert.match(r.out, /layout this installer does not edit/);
  assert.match(r.out, /already exists and is not a link/);
  assert.equal(readFileSync(cursor, 'utf8'), commented);
  assert.equal(readFileSync(codex, 'utf8'), inline);
  assert.equal(readFileSync(folder, 'utf8'), 'someone else');
  assert.equal(backups(m.home).length, 0);
});

test('--dry-run reports the plan and writes nothing', t => {
  const m = machine();
  t.after(m.cleanup);
  m.file('.cursor/mcp.json', '{"mcpServers":{}}');
  m.file('.codex/config.toml', '');
  const before = tree(m.home);
  const r = m.run('--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /dry run: nothing is written/);
  assert.match(r.out, /would be added/);
  assert.deepEqual(tree(m.home), before);
});

test('--uninstall removes only gentle-terminal entries and links, never the checkout', t => {
  const m = machine();
  t.after(m.cleanup);
  const cursor = m.file('.cursor/mcp.json', JSON.stringify({ mcpServers: { other } }));
  const codex = m.file('.codex/config.toml', '[mcp_servers.other]\ncommand = "npx"\n');
  assert.equal(m.run().code, 0);
  const r = m.run('--uninstall');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Removing:/);
  assert.deepEqual(json(cursor).mcpServers, { other });
  assert.equal(readFileSync(codex, 'utf8'), '[mcp_servers.other]\ncommand = "npx"\n');
  assert.ok(!existsSync(join(m.home, '.agents/skills/gentle-terminal')));
  assert.ok(existsSync(launcher), 'checkout intact');
});

test('--only limits the clients and an unknown id is rejected', t => {
  const m = machine();
  t.after(m.cleanup);
  const cursor = m.file('.cursor/mcp.json', '{}');
  const codex = m.file('.codex/config.toml', '');
  const r = m.run('--only', 'codex');
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(cursor, 'utf8'), '{}');
  assert.match(readFileSync(codex, 'utf8'), /gentle-terminal/);
  const bad = m.run('--only', 'nope');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /unknown client id: nope\. Valid: cursor, /);
});

test('no detected client creates nothing', t => {
  const m = machine();
  t.after(m.cleanup);
  const r = m.run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /No supported MCP client was found/);
  assert.deepEqual(readdirSync(m.home), []);
});

test('started through a linked folder, the installer still runs', t => {
  const m = machine();
  t.after(m.cleanup);
  const real = join(m.home, 'real');
  mkdirSync(real);
  for (const f of ['install.mjs', 'package.json']) writeFileSync(join(real, f), readFileSync(join(root, f)));
  const link = join(m.home, 'link');
  symlinkSync(real, link, windows ? 'junction' : 'dir');
  const r = spawnSync(process.execPath, [join(link, 'install.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Usage: node install\.mjs/);
});

test('--update on a branch other than the default one says what it follows, and refuses local changes', t => {
  const m = machine();
  t.after(m.cleanup);
  const git = (cwd, ...args) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  const seed = join(m.home, 'seed');
  mkdirSync(seed);
  for (const f of ['install.mjs', 'package.json']) writeFileSync(join(seed, f), readFileSync(join(root, f)));
  git(m.home, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'v1');
  git(seed, 'push', '-q', join(m.home, 'origin.git'), 'main');
  git(m.home, 'clone', '-q', 'origin.git', 'clone');
  const clone = join(m.home, 'clone');
  git(clone, 'switch', '-q', '-c', 'feature');
  git(clone, 'push', '-q', '-u', 'origin', 'feature');
  writeFileSync(join(clone, 'package.json'), '{}');
  const r = spawnSync(process.execPath, [join(clone, 'install.mjs'), '--update'], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /on branch feature, which follows origin\/feature, not origin\/main/);
  assert.match(r.stderr, /local changes/);
});

test('runtime status follows the lockfile', () => {
  const lock = { packages: { '': {}, 'node_modules/a': { version: '1.0.0', integrity: 'x' }, 'node_modules/opt': { version: '1.0.0', optional: true } } };
  const same = { packages: { 'node_modules/a': { version: '1.0.0', integrity: 'x' } } };
  assert.equal(runtimeStatus(lock, same, true), 'ok');
  assert.equal(runtimeStatus(lock, same, false), 'missing');
  assert.equal(runtimeStatus(lock, undefined, true), 'missing');
  assert.equal(runtimeStatus(lock, { packages: { 'node_modules/a': { version: '0.9.0' } } }, true), 'stale');
  assert.equal(runtimeStatus(lock, { packages: {} }, true), 'stale');
});
