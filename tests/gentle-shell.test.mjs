import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGentleTerminalExtension, defaultLauncher, TERMINAL_OPERATIONS } from '../clients/gentle-shell/extension.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const launcher = join(root, 'launch.mjs');
// Stands in for typebox: the extension only needs the schema calls to succeed.
const Type = new Proxy({}, { get: (_, kind) => (...args) => ({ kind, args }) });

function host({ hasUI = true, confirm = async () => true, tools = [] } = {}) {
  const pi = { handlers: {}, tools: {}, servers: [], active: ['read'], prompts: 0, available: tools };
  pi.on = (event, handler) => { pi.handlers[event] = handler; };
  pi.registerTool = tool => { pi.tools[tool.name] = tool; };
  pi.registerMcpServer = (name, config) => { pi.servers.push({ name, config }); };
  pi.getAllTools = () => pi.available;
  pi.getActiveTools = () => pi.active;
  pi.setActiveTools = names => { pi.active = names; };
  const ui = { confirm: async (...args) => { pi.prompts++; return confirm(...args); } };
  pi.ctx = { hasUI, ui };
  pi.activate = (params = {}, signal) => pi.tools.gentle_terminal_activate.execute('id', params, signal, undefined, pi.ctx);
  return pi;
}
const load = (pi, options = {}) => { createGentleTerminalExtension({ Type, env: {}, launcher: () => launcher, ...options })(pi); return pi; };

test('the default launcher is the checkout launch.mjs', () => {
  assert.equal(defaultLauncher(), join(dirname(realpathSync(join(root, 'clients', 'gentle-shell', 'extension.mjs'))), '..', '..', 'launch.mjs'));
  assert.equal(realpathSync(defaultLauncher()), realpathSync(launcher));
});

test('child agent sessions get no activation tool', () => {
  const pi = host();
  createGentleTerminalExtension({ Type, env: { GENTLE_PI_AGENTS_CHILD: '1' } })(pi);
  assert.deepEqual(pi.tools, {});
});

test('approval registers one deferred server under a random name and never edits configuration', async () => {
  const pi = load(host());
  const result = await pi.activate();
  assert.equal(pi.prompts, 1);
  assert.equal(pi.servers.length, 1);
  const [{ name, config }] = pi.servers;
  assert.match(name, /^gt_[0-9a-f]{32}$/);
  assert.deepEqual(config.args, [launcher]);
  assert.equal(config.command, process.execPath);
  assert.equal(config.exposure, 'deferred');
  assert.match(result.content[0].text, new RegExp(`registration requested for this session: ${name}\\.`));

  await pi.activate();
  assert.equal(pi.prompts, 1, 'consent is asked once per session');
  assert.equal(pi.servers.length, 1);

  const other = load(host());
  await other.activate();
  assert.notEqual(other.servers[0].name, name, 'names are not predictable');
});

test('no consent means no server: missing UI, declined, or a dialog that fails', async () => {
  const noConsent = /requires explicit user consent through the host UI/;
  const noUI = load(host({ hasUI: false }));
  await assert.rejects(noUI.activate(), noConsent);
  assert.equal(noUI.prompts, 0);
  for (const confirm of [async () => false, async () => 'yes', async () => { throw new Error('dialog closed'); }]) {
    const pi = load(host({ confirm }));
    await assert.rejects(pi.activate(), noConsent);
    assert.equal(pi.servers.length, 0);
  }
});

test('concurrent activations share one consent prompt', async () => {
  let approve;
  const pi = load(host({ confirm: () => new Promise(resolve => { approve = resolve; }) }));
  const first = pi.activate();
  const second = pi.activate();
  await new Promise(resolve => setImmediate(resolve));
  approve(true);
  await Promise.all([first, second]);
  assert.equal(pi.prompts, 1);
  assert.equal(pi.servers.length, 1);
});

test('a session change or abort during consent cancels without registering', async () => {
  let approve;
  const pi = load(host({ confirm: () => new Promise(resolve => { approve = resolve; }) }));
  const pending = pi.activate();
  await new Promise(resolve => setImmediate(resolve));
  pi.handlers.session_shutdown();
  approve(true);
  await assert.rejects(pending, /cancelled because the session changed/);
  assert.equal(pi.servers.length, 0);

  const controller = new AbortController();
  const aborted = load(host({ confirm: async () => { controller.abort(); return true; } }));
  await assert.rejects(aborted.activate({}, controller.signal), /cancelled/);
  assert.equal(aborted.servers.length, 0);
});

test('invalid operations are rejected before any prompt', async () => {
  for (const operations of [[], ['type', 'type'], ['rm'], 'type']) {
    const pi = load(host());
    await assert.rejects(pi.activate({ operations }), /Invalid Gentle Terminal operations/);
    assert.equal(pi.prompts, 0);
  }
});

test('exact operations add only those tools once the server lists them', async () => {
  const pi = load(host());
  await pi.activate();
  const name = pi.servers[0].name;
  pi.available = TERMINAL_OPERATIONS.map(op => ({ name: `mcp__${name}__terminal_${op}` }));
  const result = await pi.activate({ operations: ['create', 'read'] });
  assert.deepEqual(pi.active, ['read', `mcp__${name}__terminal_create`, `mcp__${name}__terminal_read`]);
  assert.match(result.content[0].text, /tools requested for the next turn/);
});

test('exact operations time out when the server never lists them, and hidden tools do not count', async () => {
  const pi = load(host(), { timeoutMs: 120 });
  await pi.activate();
  const name = pi.servers[0].name;
  pi.available = [{ name: `mcp__${name}__terminal_type`, exposure: 'hidden' }];
  await assert.rejects(pi.activate({ operations: ['type'] }), /not available; check \/mcp/);
  assert.deepEqual(pi.active, ['read']);
});

test('a moved or deleted checkout is reported before asking for consent', async () => {
  const missing = join(root, 'no-such-dir', 'launch.mjs');
  const pi = load(host(), { launcher: () => missing });
  await assert.rejects(pi.activate(), /gentle-terminal checkout not found .*; run node install\.mjs from the checkout again/);
  assert.equal(pi.prompts, 0);
  assert.equal(pi.servers.length, 0);
});

test('typebox is left to the host and nothing else is installed', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'clients', 'gentle-shell', 'package.json'), 'utf8'));
  assert.deepEqual(pkg.peerDependencies, { typebox: '*' });
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.type, 'module');
  assert.match(readFileSync(join(root, 'clients', 'gentle-shell', 'index.js'), 'utf8'), /from 'typebox'/);
});
