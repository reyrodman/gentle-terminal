#!/usr/bin/env node
// Installs or updates gentle-terminal for every MCP client found on this machine:
// registers the MCP server, links the skill and checks the pinned runtime.
// Run it yourself; nothing calls it automatically. See `node install.mjs --help`.
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync,
  renameSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = dirname(fileURLToPath(import.meta.url));
const launcher = join(root, 'launch.mjs');
const SERVER = 'gentle-terminal';
const OWN_PACKAGES = new Set(['gentle-terminal', 'terminal-session-control']);
const windows = process.platform === 'win32';
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);

const HELP = `Usage: node install.mjs [options]

Installs gentle-terminal for every MCP client found on this machine, or updates
the ones that already have it. Safe to run again: unchanged clients are left alone.

  --dry-run          Show what would change; write nothing.
  --update           Fast-forward this git checkout first, then install/update.
  --uninstall        Remove gentle-terminal entries and skill links.
  --only <ids>       Limit to these clients (comma separated).
  --skip <ids>       Leave these clients alone (comma separated).
  --node <command>   Command clients use to start Node (default "node").
  --help             Show this help.

Clients: CLIENT_IDS
Each changed config file is backed up next to it as <file>.bak-gentle-terminal-<time>.
Exit codes: 0 done, 1 failed or invalid usage, 2 done but some clients need a manual step.`;

const isLaunchPath = value => typeof value === 'string' && /(^|[\\/])launch\.mjs$/i.test(value);
const isNodeCommand = value => typeof value === 'string' && /(^|[\\/])node(\.exe)?$/i.test(value);

function paths() {
  const home = homedir();
  const config = process.env.XDG_CONFIG_HOME || join(home, '.config');
  const appData = windows ? process.env.APPDATA || join(home, 'AppData', 'Roaming')
    : process.platform === 'darwin' ? join(home, 'Library', 'Application Support') : config;
  return { home, config, appData };
}

function clientTable({ home, config, appData }, nodeCommand) {
  const standard = () => ({ command: nodeCommand, args: [launcher] });
  const gemini = join(home, '.gemini');
  const codexHome = process.env.CODEX_HOME || join(home, '.codex');
  const opencodeDir = join(config, 'opencode');
  const opencodeFile = existsSync(join(opencodeDir, 'opencode.jsonc')) && !existsSync(join(opencodeDir, 'opencode.json'))
    ? join(opencodeDir, 'opencode.jsonc') : join(opencodeDir, 'opencode.json');
  return [
    { id: 'cursor', name: 'Cursor (IDE and cursor-agent)', detect: [join(home, '.cursor')], file: join(home, '.cursor', 'mcp.json'), key: 'mcpServers', entry: standard },
    { id: 'vscode', name: 'VS Code', detect: [join(appData, 'Code', 'User')], file: join(appData, 'Code', 'User', 'mcp.json'), key: 'servers', entry: () => ({ type: 'stdio', ...standard() }) },
    { id: 'vscode-insiders', name: 'VS Code Insiders', detect: [join(appData, 'Code - Insiders', 'User')], file: join(appData, 'Code - Insiders', 'User', 'mcp.json'), key: 'servers', entry: () => ({ type: 'stdio', ...standard() }) },
    { id: 'codex', name: 'Codex (CLI, app and IDE extension)', detect: [codexHome], file: join(codexHome, 'config.toml'), format: 'toml', entry: standard },
    { id: 'claude-code', name: 'Claude Code', detect: [join(home, '.claude.json')], file: join(home, '.claude.json'), key: 'mcpServers', projectScopes: true, entry: () => ({ type: 'stdio', ...standard(), env: {} }) },
    { id: 'claude-desktop', name: 'Claude Desktop', detect: [join(appData, 'Claude')], file: join(appData, 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', entry: standard },
    { id: 'opencode', name: 'OpenCode', detect: [opencodeDir], file: opencodeFile, key: 'mcp', entry: () => ({ type: 'local', command: [nodeCommand, launcher], enabled: true }) },
    { id: 'antigravity', name: 'Antigravity (IDE and agy CLI)', detect: ['config', 'antigravity', 'antigravity-cli'].map(d => join(gemini, d)), file: join(gemini, 'config', 'mcp_config.json'), key: 'mcpServers', entry: standard },
    { id: 'gemini', name: 'Gemini CLI', detect: [join(gemini, 'settings.json')], file: join(gemini, 'settings.json'), key: 'mcpServers', entry: standard },
    { id: 'windsurf', name: 'Windsurf', detect: [join(home, '.codeium', 'windsurf')], file: join(home, '.codeium', 'windsurf', 'mcp_config.json'), key: 'mcpServers', entry: standard }
  ];
}

function skillTable({ home, config }) {
  return [
    { dir: join(home, '.agents', 'skills'), clients: ['codex', 'vscode', 'vscode-insiders', 'cursor'] },
    { dir: join(home, '.claude', 'skills'), clients: ['claude-code'] },
    { dir: join(config, 'opencode', 'skills'), clients: ['opencode'] },
    { dir: join(home, '.gemini', 'config', 'skills'), clients: ['antigravity'] },
    { dir: join(home, '.gemini', 'skills'), clients: ['gemini'] }
  ];
}

// An entry is ours when it has our name or starts a launch.mjs whose package is gentle-terminal.
function launchPathOf(entry) {
  const parts = Array.isArray(entry?.command) ? entry.command : [entry?.command, ...(Array.isArray(entry?.args) ? entry.args : [])];
  return parts.find(isLaunchPath);
}
function isOurs(name, entry) {
  if (name === SERVER) return true;
  const path = launchPathOf(entry);
  if (!path) return false;
  try { return OWN_PACKAGES.has(JSON.parse(readFileSync(join(dirname(path), 'package.json'), 'utf8')).name); }
  catch { return false; }
}

// Point an existing entry at this checkout, keeping the user's other settings and arguments.
function retarget(entry, nodeCommand, commandArray) {
  const next = structuredClone(entry);
  if (commandArray) {
    const cmd = Array.isArray(next.command) ? next.command : [];
    const i = cmd.findIndex(isLaunchPath);
    const node = i > 0 && isNodeCommand(cmd[0]) && nodeCommand === 'node' ? cmd[0] : nodeCommand;
    next.command = i >= 0 ? [node, ...cmd.slice(1, i), launcher, ...cmd.slice(i + 1)] : [nodeCommand, launcher];
    return next;
  }
  const args = Array.isArray(next.args) ? next.args : [];
  const i = args.findIndex(isLaunchPath);
  next.args = i >= 0 ? [...args.slice(0, i), launcher, ...args.slice(i + 1)] : [launcher];
  if (!(isNodeCommand(next.command) && nodeCommand === 'node')) next.command = nodeCommand;
  return next;
}

// ---------- JSON configs ----------
function readJson(file) {
  const style = { indent: 2, eol: '\n', bom: false, finalEol: true };
  if (!existsSync(file)) return { data: {}, style, exists: false };
  const raw = readFileSync(file, 'utf8');
  style.bom = raw.startsWith('\uFEFF');
  const text = style.bom ? raw.slice(1) : raw;
  if (!text.trim()) return { data: {}, style, exists: true };
  let data;
  try { data = JSON.parse(text); }
  catch (error) {
    const reason = /^\s*\/\/|\/\*/m.test(text) ? 'it contains comments' : `it is not valid JSON (${error.message})`;
    return { error: `${reason}; edit it by hand` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'its top level is not a JSON object; edit it by hand' };
  style.indent = /^([ \t]+)"/m.exec(text)?.[1] ?? 2;
  style.eol = text.includes('\r\n') ? '\r\n' : '\n';
  style.finalEol = /\n$/.test(text);
  return { data, style, exists: true };
}
const writeJsonText = (data, s) => (s.bom ? '\uFEFF' : '') + JSON.stringify(data, null, s.indent).replace(/\n/g, s.eol) + (s.finalEol ? s.eol : '');

function planJson(client, mode, nodeCommand) {
  const read = readJson(client.file);
  if (read.error) return { status: 'manual', detail: `${client.file}: ${read.error}` };
  const data = structuredClone(read.data);
  const isMap = value => !!value && typeof value === 'object' && !Array.isArray(value);
  if (data[client.key] !== undefined && !isMap(data[client.key])) {
    return { status: 'manual', detail: `${client.file}: "${client.key}" is not an object; edit it by hand` };
  }
  const commandArray = client.key === 'mcp';
  const oursIn = map => Object.keys(map).filter(name => isOurs(name, map[name]));
  // Claude Code project servers override user ones; existing entries there are repointed, never added.
  const scoped = client.projectScopes && isMap(data.projects)
    ? Object.values(data.projects).filter(p => isMap(p) && isMap(p.mcpServers)).map(p => p.mcpServers) : [];
  const servers = data[client.key] ?? {};
  const ours = oursIn(servers);
  const had = ours.length > 0 || scoped.some(map => oursIn(map).length > 0);
  for (const map of [servers, ...scoped]) {
    for (const name of oursIn(map)) {
      if (mode === 'uninstall') delete map[name];
      else map[name] = retarget(map[name], nodeCommand, commandArray);
    }
  }
  if (mode !== 'uninstall') {
    if (!ours.length) servers[SERVER] = client.entry();
    data[client.key] = servers;
  }
  const changed = !isDeepStrictEqual(data, read.data);
  const status = mode === 'uninstall' ? (changed ? 'removed' : 'absent')
    : !ours.length ? 'added' : changed ? 'updated' : 'up to date';
  return {
    status, had,
    text: changed ? writeJsonText(data, read.style) : undefined,
    check: text => isDeepStrictEqual(JSON.parse(text.replace(/^\uFEFF/, '')), data)
  };
}

// ---------- Codex TOML (only our own [mcp_servers.<name>] tables are edited) ----------
const tomlKey = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*/y;
function tomlPath(header) {
  const parts = [];
  tomlKey.lastIndex = 0;
  for (let at = 0; at < header.length;) {
    tomlKey.lastIndex = at;
    const m = tomlKey.exec(header);
    if (!m) return undefined;
    parts.push(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2] ?? m[3]);
    at = tomlKey.lastIndex;
    if (at < header.length && header[at++] !== '.') return undefined;
  }
  return parts;
}
function tomlStrings(text) {
  const out = [];
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) out.push(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2]);
  return out;
}
const tomlString = s => /['\r\n]/.test(s) ? JSON.stringify(s) : `'${s}'`;

function tomlTables(lines) {
  const tables = [];
  lines.forEach((line, i) => {
    const m = /^\s*\[\[?\s*(.+?)\s*\]\]?\s*(?:#.*)?$/.exec(line);
    if (!m) return;
    if (tables.length) tables.at(-1).end = i;
    tables.push({ path: tomlPath(m[1]) ?? [], start: i, end: lines.length });
  });
  return tables;
}
// Value of `key = ...` inside a table, spanning lines until brackets balance.
function tomlValue(lines, table, key) {
  for (let i = table.start + 1; i < table.end; i++) {
    if (!new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) continue;
    let text = lines[i], j = i, depth = 0;
    for (;;) {
      depth = 0;
      for (const ch of text.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '').replace(/#.*$/gm, '')) depth += ch === '[' ? 1 : ch === ']' ? -1 : 0;
      if (depth <= 0 || j + 1 >= table.end) break;
      text += '\n' + lines[++j];
    }
    return { from: i, to: j, values: tomlStrings(text.slice(text.indexOf('=') + 1)) };
  }
  return undefined;
}

function planToml(client, mode, nodeCommand) {
  const exists = existsSync(client.file);
  const raw = exists ? readFileSync(client.file, 'utf8') : '';
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const tables = tomlTables(lines);
  const servers = tables.filter(t => t.path.length === 2 && t.path[0] === 'mcp_servers');
  const ours = servers.filter(t => {
    const command = tomlValue(lines, t, 'command')?.values ?? [];
    const args = tomlValue(lines, t, 'args')?.values ?? [];
    return isOurs(t.path[1], { command: command[0], args });
  });
  const ourNames = new Set(ours.map(t => t.path[1]));
  const ourTables = tables.filter(t => t.path[0] === 'mcp_servers' && ourNames.has(t.path[1]));
  const inside = new Set(ourTables.flatMap(t => Array.from({ length: t.end - t.start }, (_, k) => t.start + k)));
  const stray = lines.some((line, i) => !inside.has(i) && !/^\s*#/.test(line) &&
    (/^\s*mcp_servers\s*=/.test(line) || new RegExp(`(^|[."'\\s])${SERVER}(["'\\s.=]|$)`).test(line)));
  if (stray) return { status: 'manual', detail: `${client.file}: gentle-terminal or mcp_servers appears in a layout this installer does not edit (inline table or dotted keys); edit it by hand` };

  let next = lines.slice();
  let status;
  if (mode === 'uninstall') {
    if (!ours.length) return { status: 'absent', had: false };
    // Comments just above the next header belong to that table; the blank lines after our keys go with us.
    const drop = new Set();
    for (const t of ourTables) {
      let end = t.end;
      while (end > t.start + 1 && /^\s*(#.*)?$/.test(lines[end - 1])) end--;
      while (end < t.end && !lines[end].trim()) end++;
      for (let k = t.start; k < end; k++) drop.add(k);
    }
    next = next.filter((_, i) => !drop.has(i));
    status = 'removed';
  } else if (!ours.length) {
    while (next.length && next.at(-1) === '') next.pop();
    if (next.length) next.push('');
    next.push(`[mcp_servers.${SERVER}]`, `command = ${tomlString(nodeCommand)}`, `args = [${tomlString(launcher)}]`, '');
    status = 'added';
  } else {
    for (const t of [...ours].sort((a, b) => b.start - a.start)) {
      const command = tomlValue(next, t, 'command');
      const args = tomlValue(next, t, 'args');
      const wanted = retarget({ command: command?.values[0], args: args?.values ?? [] }, nodeCommand, false);
      const edits = [
        { at: args, line: `args = [${wanted.args.map(tomlString).join(', ')}]`, same: isDeepStrictEqual(args?.values, wanted.args) },
        { at: command, line: `command = ${tomlString(wanted.command)}`, same: command?.values[0] === wanted.command }
      ].sort((a, b) => (b.at?.from ?? -1) - (a.at?.from ?? -1));
      for (const e of edits) {
        if (e.same) continue;
        if (e.at) next.splice(e.at.from, e.at.to - e.at.from + 1, e.line);
        else next.splice(t.start + 1, 0, e.line);
      }
    }
    status = next.join('\n') === lines.join('\n') ? 'up to date' : 'updated';
  }
  const names = ours.length ? ours.map(t => t.path[1]) : [SERVER];
  return {
    status, had: ours.length > 0, names,
    text: status === 'up to date' ? undefined : next.join(eol),
    check: text => {
      const after = text.split(/\r?\n/);
      const found = tomlTables(after).filter(t => t.path.length === 2 && t.path[0] === 'mcp_servers' && names.includes(t.path[1]));
      if (mode === 'uninstall') return found.length === 0;
      return found.length === names.length && found.every(t => tomlValue(after, t, 'args')?.values.includes(launcher));
    }
  };
}

// ---------- files ----------
function writeConfig(file, text) {
  const target = existsSync(file) ? realpathSync(file) : file;
  mkdirSync(dirname(target), { recursive: true });
  let backup;
  if (existsSync(target)) {
    backup = `${target}.bak-gentle-terminal-${stamp}`;
    copyFileSync(target, backup);
  }
  const tmp = `${target}.gentle-terminal-${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    try { renameSync(tmp, target); }
    catch (error) {
      // A client holding the file open can block the rename on Windows.
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      writeFileSync(target, text);
    }
  } catch (error) {
    if (backup) rmSync(backup, { force: true });
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
  return { target, backup };
}

// Never recursive: removing a junction or symlink must not touch the folder it points to.
function removeLink(path) {
  try { unlinkSync(path); } catch { rmdirSync(path); }
}
const ownsFolder = path => { try { return OWN_PACKAGES.has(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name); } catch { return false; } };
const makeLink = dest => symlinkSync(root, dest, windows ? 'junction' : 'dir');
function planSkill(dir, mode) {
  const dest = join(dir, SERVER);
  let stat;
  try { stat = lstatSync(dest); } catch { /* missing */ }
  let target;
  try { target = realpathSync.native(dest); } catch { /* missing or broken link */ }
  const here = target !== undefined && target === realpathSync.native(root);
  const ourLink = stat?.isSymbolicLink() && (target === undefined || here || ownsFolder(target));
  if (mode === 'uninstall') {
    if (ourLink) return { status: 'removed', apply: () => removeLink(dest) };
    return { status: stat ? 'kept' : 'absent', detail: stat ? `${dest} is not a link to gentle-terminal; left alone` : undefined };
  }
  if (!stat) return { status: 'added', apply: () => { mkdirSync(dir, { recursive: true }); makeLink(dest); } };
  if (here) return { status: 'up to date' };
  if (ourLink) return { status: 'updated', apply: () => { removeLink(dest); makeLink(dest); } };
  return { status: 'manual', detail: `${dest} already exists and is not a link to this checkout; remove or rename it to use this one` };
}

// ---------- runtime ----------
export function runtimeStatus(lock, installed, entryExists) {
  if (!entryExists || !installed) return 'missing';
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (!path) continue;
    const have = installed.packages?.[path];
    if (!have) { if (meta.optional) continue; return 'stale'; }
    if (have.version !== meta.version || (meta.integrity && have.integrity && have.integrity !== meta.integrity)) return 'stale';
  }
  return 'ok';
}
function checkRuntime() {
  const dir = join(root, 'runtime');
  const read = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; } };
  return runtimeStatus(read(join(dir, 'package-lock.json')), read(join(dir, 'node_modules', '.package-lock.json')),
    existsSync(join(dir, 'node_modules', 'terminal-use', 'bin', 'terminal-use.js')));
}
function repairRuntime() {
  const dir = join(root, 'runtime');
  const modules = join(dir, 'node_modules');
  const old = `${modules}.old-${stamp}`;
  if (existsSync(modules)) {
    try { renameSync(modules, old); }
    catch (error) {
      throw new Error(`the runtime is in use (${error.code}). Close the apps that run gentle-terminal (MCP clients), then run this again`);
    }
  }
  const npm = spawnSync('npm ci --ignore-scripts --no-audit --no-fund', { cwd: dir, shell: true, encoding: 'utf8' });
  if (npm.status !== 0) {
    rmSync(modules, { recursive: true, force: true });
    if (existsSync(old)) renameSync(old, modules);
    throw new Error(`npm ci failed; the previous runtime was restored.\n${(npm.stderr || npm.stdout || '').trim().split('\n').slice(-8).join('\n')}`);
  }
  removeOldRuntimes();
}
// A client still running the previous runtime keeps its native module locked on Windows.
function removeOldRuntimes() {
  const dir = join(root, 'runtime');
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('node_modules.old-')) continue;
    try { rmSync(join(dir, name), { recursive: true, force: true }); } catch { /* still in use; retried next run */ }
  }
}

// ---------- verification ----------
// Started without a shell, exactly as MCP clients start it, so paths with spaces stay one argument.
function nodeVersion(nodeCommand) {
  const r = spawnSync(nodeCommand, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}
const supportedNode = v => { const [a, b] = v.replace(/^v/, '').split('.').map(Number); return a > 22 || (a === 22 && b >= 12); };

function handshake(nodeCommand, timeoutMs = 20000) {
  return new Promise(resolvePromise => {
    const child = spawn(nodeCommand, [launcher], { stdio: ['pipe', 'pipe', 'pipe'], cwd: root });
    let out = '', err = '', settled = false;
    const done = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolvePromise(result);
    };
    const timer = setTimeout(() => done({ ok: false, detail: `no answer within ${timeoutMs} ms. ${err.trim()}` }), timeoutMs);
    child.on('error', error => done({ ok: false, detail: error.message }));
    child.on('exit', code => done({ ok: false, detail: `the server exited (${code}). ${err.trim()}` }));
    child.stderr.on('data', c => { err += c; });
    child.stdout.on('data', c => {
      out += c;
      const lines = out.split('\n');
      out = lines.pop();
      for (const line of lines) {
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
        } else if (msg.id === 2) {
          const count = msg.result?.tools?.length ?? 0;
          return done({ ok: count > 0, detail: `${count} MCP tools` });
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gentle-terminal-installer', version: '1' } } }) + '\n');
  });
}

// ---------- git update ----------
function gitUpdate(args) {
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  const top = git('rev-parse', '--show-toplevel').stdout.trim();
  let isRoot = false;
  // The native resolver expands Windows 8.3 short names (RUNNER~1); git prints long ones.
  try { isRoot = !!top && realpathSync.native(top) === realpathSync.native(root); } catch { /* not a checkout */ }
  // A release folder unpacked inside some other repository must not pull that repository.
  if (!isRoot) {
    throw new Error('--update needs a git checkout. Download the new release instead, then run node install.mjs');
  }
  const upstream = git('rev-parse', '--abbrev-ref', '@{u}');
  if (upstream.status !== 0) throw new Error('the current branch has no upstream; run git pull yourself');
  const follows = upstream.stdout.trim();
  const remoteDefault = git('rev-parse', '--abbrev-ref', `${follows.split('/')[0]}/HEAD`).stdout.trim();
  if (remoteDefault && remoteDefault !== follows) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
    console.log(`Note: this checkout is on branch ${branch}, which follows ${follows}, not ${remoteDefault}. ` +
      `For released versions run: git switch ${remoteDefault.slice(remoteDefault.indexOf('/') + 1)}`);
  }
  if (git('status', '--porcelain', '--untracked-files=no').stdout.trim()) throw new Error('this checkout has local changes; commit or stash them, then run --update again');
  const fetch = git('fetch', '--quiet');
  if (fetch.status !== 0) throw new Error(`git fetch failed: ${fetch.stderr.trim()}`);
  const before = git('rev-parse', '--short', 'HEAD').stdout.trim();
  const merge = git('merge', '--ff-only', '@{u}');
  if (merge.status !== 0) throw new Error(`cannot fast-forward (the branch diverged): ${merge.stderr.trim()}`);
  const after = git('rev-parse', '--short', 'HEAD').stdout.trim();
  console.log(before === after ? `Code: already at the latest commit (${after}).` : `Code: updated ${before} -> ${after}.`);
  // Continue with the installer from the updated checkout.
  const rest = args.filter(a => a !== '--update');
  return spawnSync(process.execPath, [join(root, 'install.mjs'), ...rest], { stdio: 'inherit' }).status ?? 1;
}

// ---------- main ----------
function parseArgs(argv, ids) {
  const opts = { dryRun: false, update: false, uninstall: false, only: undefined, skip: new Set(), node: 'node', help: false };
  const list = value => {
    const items = (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const unknown = items.filter(i => !ids.includes(i));
    if (!items.length || unknown.length) throw new Error(`unknown client id: ${unknown.join(', ') || '(none)'}. Valid: ${ids.join(', ')}`);
    return new Set(items);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--update') opts.update = true;
    else if (a === '--uninstall') opts.uninstall = true;
    else if (a === '--only') opts.only = list(argv[++i]);
    else if (a === '--skip') opts.skip = list(argv[++i]);
    else if (a === '--node') { opts.node = argv[++i]; if (!opts.node) throw new Error('--node needs a command'); }
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`unknown option ${a}. See --help`);
  }
  if (opts.update && opts.uninstall) throw new Error('--update and --uninstall cannot be combined');
  return opts;
}

async function main(argv) {
  const where = paths();
  const ids = clientTable(where, 'node').map(c => c.id);
  const opts = parseArgs(argv, ids);
  if (opts.help) { console.log(HELP.replace('CLIENT_IDS', ids.join(', '))); return 0; }
  if (opts.update && !opts.dryRun) return gitUpdate(argv);
  if (opts.update) console.log('Code: --update would fast-forward this checkout first (skipped in a dry run); the plan below is for the current code.');
  const mode = opts.uninstall ? 'uninstall' : 'install';
  const selected = clientTable(where, opts.node).filter(c => (!opts.only || opts.only.has(c.id)) && !opts.skip.has(c.id));
  const write = !opts.dryRun;
  let failed = false, manual = false;

  console.log(`gentle-terminal ${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version} at ${root}${opts.dryRun ? ' (dry run: nothing is written)' : ''}`);

  if (mode === 'install') {
    const version = nodeVersion(opts.node);
    if (!version) { console.log(`✗ "${opts.node}" cannot be started. Install Node >= 22.12 or pass --node <path>.`); return 1; }
    if (!supportedNode(version)) { console.log(`✗ "${opts.node}" is ${version}; gentle-terminal needs Node >= 22.12.`); return 1; }
    const runtime = checkRuntime();
    if (write) removeOldRuntimes();
    if (runtime === 'ok') console.log('✓ Runtime: installed and matches the lockfile');
    else if (!write) console.log(`• Runtime: ${runtime}; would run npm ci in runtime/`);
    else {
      console.log(`• Runtime: ${runtime}; installing pinned dependencies...`);
      try { repairRuntime(); console.log('✓ Runtime: installed'); }
      catch (error) { console.log(`✗ Runtime: ${error.message}`); return 1; }
    }
    if (write || runtime === 'ok') {
      const probe = await handshake(opts.node);
      if (!probe.ok) { console.log(`✗ Server check failed: ${probe.detail}`); return 1; }
      console.log(`✓ Server check: ${opts.node} ${version}, ${probe.detail}`);
    }
  }

  const detected = selected.filter(c => c.detect.some(p => existsSync(p)));
  const results = [];
  for (const client of selected) {
    if (!detected.includes(client)) { results.push({ client, status: 'not installed' }); continue; }
    try {
      const plan = client.format === 'toml' ? planToml(client, mode, opts.node) : planJson(client, mode, opts.node);
      const row = { client, status: plan.status, detail: plan.detail, had: plan.had };
      if (write && plan.text !== undefined && ['added', 'updated', 'removed'].includes(plan.status)) {
        const { target, backup } = writeConfig(client.file, plan.text);
        if (!plan.check(readFileSync(target, 'utf8'))) throw new Error(`read-back of ${target} did not match`);
        row.backup = backup;
      }
      results.push(row);
    } catch (error) {
      results.push({ client, status: 'failed', detail: error.message });
    }
  }

  const skills = [];
  for (const { dir, clients } of skillTable(where)) {
    if (!clients.some(id => detected.some(c => c.id === id))) continue;
    try {
      const plan = planSkill(dir, mode);
      if (write && plan.apply) plan.apply();
      skills.push({ dir, ...plan });
    } catch (error) {
      skills.push({ dir, status: 'failed', detail: error.message });
    }
  }

  const first = mode === 'install' && !results.some(r => r.had);
  console.log(mode === 'uninstall' ? '\nRemoving:' : first ? '\nFirst installation:' : '\nUpdating existing installation:');
  const mark = s => s === 'failed' ? '✗' : s === 'manual' ? '!' : ['added', 'updated', 'removed'].includes(s) ? (write ? '✓' : '•') : '·';
  const verb = s => !write && ['added', 'updated', 'removed'].includes(s) ? `would be ${s}` : s;
  for (const r of results) {
    console.log(`${mark(r.status)} ${r.client.name.padEnd(36)} ${verb(r.status)}${r.status === 'not installed' ? '' : `  ${r.client.file}`}`);
    if (r.detail) console.log(`    ${r.detail}`);
    if (r.backup) console.log(`    backup: ${r.backup}`);
  }
  if (skills.length) console.log('\nSkill links:');
  for (const s of skills) {
    console.log(`${mark(s.status)} ${join(s.dir, SERVER).padEnd(60)} ${verb(s.status)}`);
    if (s.detail) console.log(`    ${s.detail}`);
  }

  failed = [...results, ...skills].some(r => r.status === 'failed');
  manual = [...results, ...skills].some(r => r.status === 'manual');
  const changed = results.filter(r => ['added', 'updated', 'removed'].includes(r.status));
  if (write && changed.length) console.log(`\nRestart or reload MCP servers in: ${changed.map(r => r.client.name).join(', ')}.`);
  if (!detected.length) console.log('\nNo supported MCP client was found. Install one, run it once, then run this again.');
  if (failed) console.log('\nSome steps failed; nothing else was changed for them. See the messages above.');
  return failed ? 1 : manual ? 2 : 0;
}

// Node resolves links in import.meta.url but not in argv[1] (macOS /var is a link to /private/var).
const started = (() => { try { return realpathSync(resolve(process.argv[1])); } catch { return undefined; } })();
if (started === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; },
    error => { console.error(`gentle-terminal install: ${error.message}`); process.exitCode = 1; });
}
