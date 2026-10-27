#!/usr/bin/env node
// Lets Cursor run gentle-terminal tools without asking in one workspace, until revoked.
// Cursor has no per-chat approval option, so Automatic mode adds one entry to the
// workspace permissions.json and later removes exactly what it added.
// See references/clients.md#tool-call-confirmations.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ENTRY = 'gentle-terminal:*';
const script = fileURLToPath(import.meta.url);
const HELP = `Usage: node session.mjs <allow|revoke|status> [--workspace <dir>]

Lets Cursor run gentle-terminal tools without asking in one workspace, until revoked.
Cursor has no per-chat approval option, so "allow" adds "${ENTRY}" to
<workspace>/.cursor/permissions.json and "revoke" removes exactly what it added.

  --workspace <dir>  Workspace folder (default: the current folder).
  --help             Show this help.

Exit codes: 0 done, 1 failed or invalid usage.`;

const sha = text => createHash('sha256').update(text).digest('hex');
const isEntry = value => typeof value === 'string' && value.toLowerCase() === ENTRY;
const toJson = data => JSON.stringify(data, null, 2) + '\n';

function write(file, text) {
  const tmp = `${file}.gentle-terminal-${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function readPermissions(file) {
  if (!existsSync(file)) return { exists: false, data: {} };
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const fallback = "edit it by hand, or approve from Cursor's dialog instead";
  let data;
  try { data = JSON.parse(text); }
  catch (error) {
    const reason = /^\s*\/\/|\/\*/m.test(text) ? 'it contains comments' : `it is not valid JSON (${error.message})`;
    throw new Error(`${file}: ${reason}; ${fallback}.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: expected a JSON object; ${fallback}.`);
  if ('mcpAllowlist' in data && !Array.isArray(data.mcpAllowlist)) throw new Error(`${file}: "mcpAllowlist" is not a list; ${fallback}.`);
  return { exists: true, data };
}

function userDefinesMcpAllowlist() {
  try { return 'mcpAllowlist' in JSON.parse(readFileSync(join(homedir(), '.cursor', 'permissions.json'), 'utf8')); }
  catch { return false; }
}

function allow({ ws, dir, file, stateFile }) {
  if (existsSync(stateFile)) {
    console.log(`Allowance already active in ${file}; nothing to do.`);
    return 0;
  }
  const current = readPermissions(file);
  if ((current.data.mcpAllowlist ?? []).some(isEntry)) {
    console.log(`gentle-terminal tools are already allowed by your own configuration in ${file}; nothing to do.`);
    return 0;
  }
  const createdDir = !existsSync(dir);
  const createdKey = !('mcpAllowlist' in current.data);
  const text = toJson({ ...current.data, mcpAllowlist: [...(current.data.mcpAllowlist ?? []), ENTRY] });
  mkdirSync(dir, { recursive: true });
  const backup = current.exists ? `${file}.bak-gentle-terminal-session` : null;
  if (backup) copyFileSync(file, backup);
  write(file, text);
  write(stateFile, toJson({ version: 1, since: new Date().toISOString(), createdDir, createdFile: !current.exists, createdKey, backup, written: sha(text) }));
  console.log(`Allowed gentle-terminal tools in Cursor for this workspace (${file}).`);
  console.log(`Revert with: node "${script}" revoke --workspace "${ws}"`);
  console.log('- It takes effect only with a Run Mode (Auto-review, Allowlist or Run Everything) in Cursor Settings.');
  console.log('- It stays until revoked, also if Cursor closes.');
  if (createdKey && !userDefinesMcpAllowlist()) {
    console.log('- While it is active, Cursor ignores the MCP allowlist in Settings, so other MCP servers may ask again.');
  }
  return 0;
}

function revoke({ dir, file, stateFile }) {
  if (!existsSync(stateFile)) {
    console.log('Nothing to revoke: no allowance from session.mjs is active in this workspace.');
    return 0;
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (existsSync(file)) {
    const unchanged = sha(readFileSync(file, 'utf8')) === state.written;
    if (unchanged && state.createdFile) unlinkSync(file);
    else if (unchanged && state.backup && existsSync(state.backup)) copyFileSync(state.backup, file);
    else {
      const { data } = readPermissions(file);
      const list = (data.mcpAllowlist ?? []).filter(value => !isEntry(value));
      if (state.createdKey && list.length === 0) delete data.mcpAllowlist;
      else data.mcpAllowlist = list;
      if (state.createdFile && Object.keys(data).length === 0) unlinkSync(file);
      else write(file, toJson(data));
    }
  }
  if (state.backup && existsSync(state.backup)) unlinkSync(state.backup);
  unlinkSync(stateFile);
  if (state.createdDir && existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  console.log('Revoked: Cursor asks again before running gentle-terminal tools in this workspace.');
  return 0;
}

function status({ file, stateFile }) {
  if (!existsSync(stateFile)) console.log(`not active (${file})`);
  else console.log(`active since ${JSON.parse(readFileSync(stateFile, 'utf8')).since} (${file})`);
  return 0;
}

function main(argv) {
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, options: { workspace: { type: 'string' }, help: { type: 'boolean' } } }); }
  catch (error) { console.error(`${error.message}\n\n${HELP}`); return 1; }
  const { values, positionals } = parsed;
  if (values.help) { console.log(HELP); return 0; }
  const commands = { allow, revoke, status };
  if (positionals.length !== 1 || !Object.hasOwn(commands, positionals[0])) { console.error(HELP); return 1; }
  const ws = resolve(values.workspace ?? process.cwd());
  const dir = join(ws, '.cursor');
  const file = join(dir, 'permissions.json');
  return commands[positionals[0]]({ ws, dir, file, stateFile: `${file}.gentle-terminal-session` });
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(`gentle-terminal session: ${error.message}`); process.exitCode = 1; }
