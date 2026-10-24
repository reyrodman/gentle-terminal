// Minimal MCP stdio client for tests and benchmarks: spawns launch.mjs, speaks
// newline-delimited JSON-RPC, and records latency and payload size per call.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const launcher = fileURLToPath(new URL('../../launch.mjs', import.meta.url));
export const windows = process.platform === 'win32';

export async function startServer({ args = [], cwd = root, env = process.env, timeoutMs = 8000 } = {}) {
  const startedAt = performance.now();
  const child = spawn(process.execPath, [launcher, ...args], { stdio: ['pipe', 'pipe', 'pipe'], cwd, env });
  const pending = new Map();
  const nonJson = [];
  const calls = [];
  let id = 0, stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = once(child, 'close');
  createInterface({ input: child.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { nonJson.push(line); return; }
    pending.get(message.id)?.({ message, bytes: Buffer.byteLength(line) + 1 });
  });
  async function rpc(method, params = {}, { timeout = timeoutMs } = {}) {
    const requestId = ++id;
    const payload = JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n';
    const t0 = performance.now();
    let timer;
    try {
      const { message, bytes } = await new Promise((resolve, reject) => {
        pending.set(requestId, resolve);
        timer = setTimeout(() => reject(new Error(`${method} response timeout after ${timeout}ms`)), timeout);
        child.stdin.write(payload);
      });
      calls.push({ method, tool: params.name, ms: performance.now() - t0, sent: Buffer.byteLength(payload), received: bytes });
      if (message.error) throw new Error(`${method}: ${JSON.stringify(message.error)}`);
      return message.result;
    } finally { clearTimeout(timer); pending.delete(requestId); }
  }
  async function tool(name, args = {}, options) {
    const result = await rpc('tools/call', { name, arguments: args }, options);
    const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    return { text, isError: Boolean(result.isError), result };
  }
  async function initialize() {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gentle-terminal-tests', version: '1' } });
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    return { init, readyMs: performance.now() - startedAt };
  }
  async function close() {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000); // Only this test's own server.
    const [code, signal] = await closed;
    clearTimeout(timer);
    return { code, signal, stderr };
  }
  return { child, rpc, tool, initialize, close, calls, nonJson, get stderr() { return stderr; } };
}

export const sessionIdOf = text => Number(/Created session (\d+)/.exec(text)?.[1]);

// Lets a test pick markers that the echoed command line cannot satisfy.
export const nonce = () => Math.random().toString(36).slice(2, 8);

export async function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function waitUntil(predicate, ms = 3000, step = 50) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, step));
  }
  return false;
}
