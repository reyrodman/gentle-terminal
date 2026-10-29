#!/usr/bin/env node
// Lets Cursor run gentle-terminal tools without asking in one workspace, until revoked.
// Cursor has no per-chat approval option, so Automatic mode adds one entry to the
// workspace permissions.json and later removes exactly what it added.
// See references/clients.md#tool-call-confirmations.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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

status checks the workspace file, not Cursor's effective runtime settings:
  active since <date> (<file>)              Recorded entry is present.
  not active (<file>)                       No recorded or user-managed entry.
  allowed by your own configuration (<file>)  User-managed entry, never revoked.
  drift: recorded allowance is absent (<file>); run revoke before allowing again.
allow error: Recorded allowance is absent; run revoke before allowing again.
revoke clears a stale receipt without renewing permission.
Errors use stderr with prefix "gentle-terminal session: ", without success output.
Invalid recovery receipt; no changes made.  Repair manually after inspection.
Could not install allowance; recovery receipt retained. Run revoke before retrying.
Recovery receipt unavailable; allowance not installed.  Inspect files before retrying.
Unsafe session path: <path>.  Symlinks and unexpected file types are refused.
Recovery backup already exists; inspect it before allowing again.
Single writer only: do not run these commands concurrently or edit during a command.
No automatic expiry or task-end revocation. Not a sandbox for hostile workspaces.
Exit codes: 0 done (including status drift), 1 failed or invalid usage.`;

const sha = text => createHash('sha256').update(text).digest('hex');
const isEntry = value => typeof value === 'string' && value.toLowerCase() === ENTRY;
const toJson = data => JSON.stringify(data, null, 2) + '\n';

function write(file, text) {
  // Exclusive creation never follows or overwrites a pre-existing temporary path.
  const tmp = `${file}.gentle-terminal-tmp`;
  writeFileSync(tmp, text, { flag: 'wx' });
  try { renameSync(tmp, file); }
  finally { if (existsSync(tmp)) unlinkSync(tmp); }
}

function checkPath(path, directory = false) {
  let info;
  try { info = lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (info.isSymbolicLink() || !(directory ? info.isDirectory() : info.isFile())) {
    throw new Error(`Unsafe session path: ${path}.`);
  }
}

function sameBackupLocation(recorded, backup) {
  if (recorded === backup) return true;
  if (typeof recorded !== 'string' || basename(recorded) !== basename(backup)) return false;
  // Legacy v1 receipts retain the workspace alias. Compare directory identity
  // using metadata only; all file reads/writes/deletes still use derived backup.
  try { return realpathSync.native(dirname(recorded)) === realpathSync.native(dirname(backup)); }
  catch { return false; }
}

function readState(stateFile, backup) {
  if (!existsSync(stateFile)) return null;
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    const fields = ['version', 'since', 'createdDir', 'createdFile', 'createdKey', 'backup', 'written'];
    if (!state || Array.isArray(state) || Object.keys(state).length !== fields.length ||
        !fields.every(key => Object.hasOwn(state, key)) || state.version !== 1 ||
        typeof state.since !== 'string' || new Date(state.since).toISOString() !== state.since ||
        !['createdDir', 'createdFile', 'createdKey'].every(key => typeof state[key] === 'boolean') ||
        typeof state.written !== 'string' || !/^[a-f0-9]{64}$/.test(state.written) ||
        !(state.createdFile ? state.backup === null : sameBackupLocation(state.backup, backup)) ||
        (state.createdFile && !state.createdKey) || (state.createdDir && !state.createdFile)) {
      throw new Error('invalid');
    }
    return state;
  } catch { throw new Error('Invalid recovery receipt; no changes made.'); }
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

function allow({ ws, dir, file, stateFile, backup, state }) {
  const current = readPermissions(file);
  if (state) {
    if (!(current.data.mcpAllowlist ?? []).some(isEntry)) {
      throw new Error('Recorded allowance is absent; run revoke before allowing again.');
    }
    console.log(`Allowance already active in ${file}; nothing to do.`);
    return 0;
  }
  if ((current.data.mcpAllowlist ?? []).some(isEntry)) {
    console.log(`gentle-terminal tools are already allowed by your own configuration in ${file}; nothing to do.`);
    return 0;
  }
  const createdDir = !existsSync(dir);
  const createdKey = !('mcpAllowlist' in current.data);
  const text = toJson({ ...current.data, mcpAllowlist: [...(current.data.mcpAllowlist ?? []), ENTRY] });
  mkdirSync(dir, { recursive: true });
  if (existsSync(backup)) throw new Error('Recovery backup already exists; inspect it before allowing again.');
  if (current.exists) copyFileSync(file, backup, constants.COPYFILE_EXCL);
  // Record recovery BEFORE installing permission: a failed second write remains revocable.
  try {
    write(stateFile, toJson({ version: 1, since: new Date().toISOString(), createdDir, createdFile: !current.exists, createdKey, backup: current.exists ? backup : null, written: sha(text) }));
  } catch { throw new Error('Recovery receipt unavailable; allowance not installed.'); }
  try { write(file, text); }
  catch { throw new Error('Could not install allowance; recovery receipt retained. Run revoke before retrying.'); }
  console.log(`Allowed gentle-terminal tools in Cursor for this workspace (${file}).`);
  console.log(`Revert with: node "${script}" revoke --workspace "${ws}"`);
  console.log('- It takes effect only with a Run Mode (Auto-review, Allowlist or Run Everything) in Cursor Settings.');
  console.log('- It stays until revoked, also if Cursor closes.');
  if (createdKey && !userDefinesMcpAllowlist()) {
    console.log('- While it is active, Cursor ignores the MCP allowlist in Settings, so other MCP servers may ask again.');
  }
  return 0;
}

function revoke({ dir, file, stateFile, backup, state }) {
  if (!state) {
    console.log('Nothing to revoke: no allowance from session.mjs is active in this workspace.');
    return 0;
  }
  if (existsSync(file)) {
    const unchanged = sha(readFileSync(file, 'utf8')) === state.written;
    if (unchanged && state.createdFile) unlinkSync(file);
    else if (unchanged && state.backup && existsSync(backup)) copyFileSync(backup, file);
    else {
      const { data } = readPermissions(file);
      // Drift with no entry requires receipt cleanup only, not a settings rewrite.
      if ((data.mcpAllowlist ?? []).some(isEntry)) {
        const list = (data.mcpAllowlist ?? []).filter(value => !isEntry(value));
        if (state.createdKey && list.length === 0) delete data.mcpAllowlist;
        else data.mcpAllowlist = list;
        if (state.createdFile && Object.keys(data).length === 0) unlinkSync(file);
        else write(file, toJson(data));
      }
    }
  }
  if (state.backup && existsSync(backup)) unlinkSync(backup);
  unlinkSync(stateFile);
  if (state.createdDir && existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  console.log('Revoked: Cursor asks again before running gentle-terminal tools in this workspace.');
  return 0;
}

function status({ file, state }) {
  const present = (readPermissions(file).data.mcpAllowlist ?? []).some(isEntry);
  if (state && !present) console.log(`drift: recorded allowance is absent (${file}); run revoke before allowing again.`);
  else if (state) console.log(`active since ${state.since} (${file})`);
  else if (present) console.log(`allowed by your own configuration (${file})`);
  else console.log(`not active (${file})`);
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
  const requested = resolve(values.workspace ?? process.cwd());
  // Canonicalize legitimate workspace aliases (including macOS /var -> /private/var).
  // Refuse links in the managed .cursor surfaces, not ordinary workspace ancestors.
  const ws = existsSync(requested) ? realpathSync.native(requested) : requested;
  const dir = join(ws, '.cursor');
  const file = join(dir, 'permissions.json');
  const stateFile = `${file}.gentle-terminal-session`;
  const backup = `${file}.bak-gentle-terminal-session`;
  // lstat catches ordinary links/junctions, including dangling links, before reads.
  // This is not race-proof against a concurrently modified or malicious workspace.
  checkPath(dir, true);
  checkPath(stateFile);
  const state = readState(stateFile, backup);
  checkPath(file);
  checkPath(backup);
  return commands[positionals[0]]({ ws, dir, file, stateFile, backup, state });
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(`gentle-terminal session: ${error.message}`); process.exitCode = 1; }
