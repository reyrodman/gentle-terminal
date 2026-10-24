// Deterministic MCP stdio probe; no model, network, prompts or project writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const child = spawn(process.execPath, [fileURLToPath(new URL('launch.mjs', import.meta.url))], {
  stdio: ['pipe', 'pipe', 'pipe'], cwd: fileURLToPath(new URL('.', import.meta.url))
});
let id = 0, stderr = '';
const pending = new Map();
child.stderr.on('data', chunk => { stderr += chunk; });
const closed = once(child, 'close');
const watchdog = setTimeout(() => {
  console.error('FAIL: smoke exceeded 25s');
  process.exitCode = 1;
  child.stdin.end();
  child.kill(); // Only the server spawned above; abrupt Windows kill may skip disposal.
}, 25000);
createInterface({ input: child.stdout }).on('line', line => {
  try {
    const message = JSON.parse(line);
    if (pending.has(message.id)) pending.get(message.id)(message);
  } catch (error) { console.error('FAIL: non-JSON stdout', line); process.exitCode = 1; }
});
async function rpc(method, params = {}) {
  const requestId = ++id;
  let timer;
  try {
    const reply = await new Promise((resolve, reject) => {
      pending.set(requestId, resolve);
      timer = setTimeout(() => reject(new Error(`${method} response timeout`)), 4000);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
    assert.equal(reply.error, undefined, JSON.stringify(reply));
    return reply.result;
  } finally { clearTimeout(timer); pending.delete(requestId); }
}
async function tool(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  console.log(`${name}: ${text}`);
  assert.ok(!result.isError, text);
  assert.doesNotMatch(text, /Timed out|Wait cancelled/);
  return text;
}
const windows = process.platform === 'win32';
let ownedPid;
try {
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'portable-smoke', version: '1' } });
  assert.equal(init.serverInfo.version, '0.2.1');
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  const created = await tool('terminal_create', { cols: 120, rows: 40 });
  const sessionId = Number(/Created session (\d+)/.exec(created)[1]);
  await tool('terminal_type', { sessionId, text: windows ? "$portable='portable_value'\n" : "portable=portable_value\n" });
  await tool('terminal_type', { sessionId, text: windows ? "Write-Output ('STATE='+$portable)" : 'printf "STATE=%s\\n" "$portable"' });
  await tool('terminal_press', { sessionId, key: 'Enter' });
  await tool('terminal_wait', { sessionId, pattern: '^STATE=portable_value$', timeoutMs: 2000 });
  const screen = await tool('terminal_read', { sessionId, cursor: false });
  assert.match(screen, /^STATE=portable_value$/m);
  await tool('terminal_type', { sessionId, text: windows ? "Write-Output ('OWNED_PID_'+$PID)\n" : 'printf "OWNED_PID_%s\\n" "$$"\n' });
  const pidScreen = await tool('terminal_wait', { sessionId, pattern: '^OWNED_PID_[0-9]+$', timeoutMs: 2000 });
  ownedPid = Number(/^OWNED_PID_(\d+)$/m.exec(pidScreen)[1]);
  const command = await tool('terminal_create', { command: 'exit 7', cols: 120, rows: 40 });
  const commandId = Number(/Created session (\d+)/.exec(command)[1]);
  const exited = await tool('terminal_wait', { sessionId: commandId, timeoutMs: 2000 });
  assert.match(exited, /command exited \(exit code 7\)/);
  assert.match(await tool('terminal_list'), /EXITED \(exit code 7\)/);
  await tool('terminal_destroy', { sessionId: commandId });
  assert.doesNotMatch(await tool('terminal_list'), new RegExp(`^\\[${commandId}\\]`, 'm'));
  // Leave the interactive shell alive to exercise disconnect disposal, not only destroy.
  child.stdin.end();
  const [code, signal] = await closed;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(stderr, '');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try { process.kill(ownedPid, 0); } catch { ownedPid = undefined; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ownedPid, undefined, 'owned shell still alive after disconnect');
  console.log('PASS: persistent variable, typed text, Enter, read, exit 7, destroy, disconnect; server exit=0 stderr=""; owned shell gone.');
} catch (error) {
  console.error(`FAIL: ${error.stack}\nserver stderr: ${stderr}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  child.stdin.end();
  // Only this probe's server is targeted; never kill by process name.
  if (child.exitCode === null) child.kill();
}
