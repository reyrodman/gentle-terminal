// Reproducible cost benchmark: server startup, MCP payload sizes, per-tool
// latency, server memory/CPU and calls per task. No model, network or writes
// outside the OS temp directory. Usage: node bench/bench.mjs [--runs N] [--json out.json]
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer, sessionIdOf, nonce, root, windows } from '../tests/helpers/mcp-client.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string', default: '15' }, json: { type: 'string' } } });
const RUNS = Number(values.runs);
const scratch = mkdtempSync(join(tmpdir(), 'gentle-terminal-bench-'));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const stats = xs => ({ n: xs.length, p50: +pct(xs, 50).toFixed(1), p95: +pct(xs, 95).toFixed(1), p99: +pct(xs, 99).toFixed(1) });
const tokens = bytes => Math.round(bytes / 4); // Heuristic estimate: ~4 bytes per token for English/ASCII text.

function processStats(pid) {
  try {
    if (windows) {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)"`], { encoding: 'utf8' }).trim().split(/\s+/);
      return { rssMB: +(Number(out[0]) / 2 ** 20).toFixed(1), cpuMs: Number(out[1]) };
    }
    const [rss, time] = execFileSync('ps', ['-o', 'rss=', '-o', 'time=', '-p', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/);
    const parts = time.replace('-', ':').split(':').map(Number).reverse();
    const cpuMs = ((parts[0] ?? 0) + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) * 3600 + (parts[3] ?? 0) * 86400) * 1000;
    return { rssMB: +(Number(rss) / 1024).toFixed(1), cpuMs };
  } catch { return { rssMB: null, cpuMs: null }; }
}

// Bytes an agent must load to follow the skill: always-loaded SKILL.md plus
// every file its execution steps tell the agent to read up front.
function skillLoad() {
  const read = rel => existsSync(join(root, rel)) ? readFileSync(join(root, rel)) : Buffer.alloc(0);
  const skill = read('SKILL.md').toString('utf8');
  const body = skill.replace(/^---[\s\S]*?---\r?\n/, '');
  const description = /^description:\s*(.*)$/m.exec(skill)?.[1] ?? '';
  const upfront = /\n1\. Read \[[^\n]*/.exec(body)?.[0] ?? '';
  const mandatory = [...upfront.matchAll(/\]\(([^)#]+)/g)].map(m => m[1]);
  const files = { 'SKILL.md': read('SKILL.md').length };
  for (const rel of mandatory) files[rel] = read(rel).length;
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  return { discoveryBytes: Buffer.byteLength(description), activationBytes: total, activationTokens: tokens(total), mandatoryReads: files };
}

const report = { node: process.version, platform: `${process.platform}/${process.arch}`, runs: RUNS, skill: skillLoad() };

// Cold start: process spawn to initialize result, repeated.
const cold = [];
for (let i = 0; i < Math.min(RUNS, 10); i++) {
  const s = await startServer({ args: ['--cwd', scratch] });
  cold.push((await s.initialize()).readyMs);
  await s.close();
}
report.coldStartMs = stats(cold);

const s = await startServer({ args: ['--cwd', scratch] });
const { init } = await s.initialize();
const initBytes = s.calls.at(-1).received;
await s.rpc('tools/list');
const toolsBytes = s.calls.at(-1).received;
let skillsBytes = null;
try { await s.rpc('skills/list'); skillsBytes = s.calls.at(-1).received; } catch { /* extension absent */ }
report.mcp = {
  serverVersion: init.serverInfo.version,
  initializeBytes: initBytes, instructionsBytes: Buffer.byteLength(init.instructions ?? ''),
  toolsListBytes: toolsBytes, toolsListTokens: tokens(toolsBytes), skillsListBytes: skillsBytes
};
await new Promise(r => setTimeout(r, 1000));
const idle0 = processStats(s.child.pid);
await new Promise(r => setTimeout(r, 5000));
const idle1 = processStats(s.child.pid);
report.server = { rssIdleMB: idle0.rssMB, cpuIdleMsPer5s: idle1.cpuMs === null ? null : +(idle1.cpuMs - idle0.cpuMs).toFixed(0) };

const node = windows ? `& '${process.execPath}'` : `'${process.execPath}'`;
const job = 'for(let i=0;i<30;i++)console.log(\'line \'+i);process.exit(3)';
const runJob = tag => windows
  ? `${node} -e "${job}"; Write-Output ('GT_'+'${tag}'+'_EXIT='+$LASTEXITCODE)`
  : `${node} -e "${job}"; printf 'GT_%s_EXIT=%s\\n' ${tag} "$?"`;

const created = await s.tool('terminal_create', { cols: 120, rows: 40 });
const sid = sessionIdOf(created.text);
report.createShellBytes = s.calls.at(-1).received;
const lat = {}, size = {};
const track = (name, ms, bytes) => { (lat[name] ??= []).push(ms); (size[name] ??= []).push(bytes); };

// Strategy A follows the v1.0.0 smoke/README pattern: type, press Enter, wait, read.
// Strategy B follows the v1.1 guidance: type with "\n" once, then trust a fresh
// marker already present in a response; wait only when it is not there yet.
const scenario = { legacy: { calls: [], bytes: [], ms: [] }, optimized: { calls: [], bytes: [], ms: [] } };
for (let i = 0; i < RUNS; i++) {
  for (const mode of ['legacy', 'optimized']) {
    const tag = nonce();
    const marker = `^GT_${tag}_EXIT=3$`;
    const before = s.calls.length;
    const t0 = performance.now();
    if (mode === 'legacy') {
      await s.tool('terminal_type', { sessionId: sid, text: runJob(tag) });
      await s.tool('terminal_press', { sessionId: sid, key: 'Enter' });
      await s.tool('terminal_wait', { sessionId: sid, pattern: marker, timeoutMs: 10000 });
      await s.tool('terminal_read', { sessionId: sid });
    } else {
      const typed = await s.tool('terminal_type', { sessionId: sid, text: runJob(tag) + '\n' });
      if (!new RegExp(marker, 'm').test(typed.text)) {
        const waited = await s.tool('terminal_wait', { sessionId: sid, pattern: marker, timeoutMs: 10000 });
        if (!new RegExp(marker, 'm').test(waited.text)) throw new Error('marker missing');
      }
    }
    const used = s.calls.slice(before);
    scenario[mode].ms.push(performance.now() - t0);
    scenario[mode].calls.push(used.length);
    scenario[mode].bytes.push(used.reduce((a, c) => a + c.received, 0));
  }
  await s.tool('terminal_type', { sessionId: sid, text: windows ? 'Clear-Host\n' : 'clear\n' });
}
const avg = xs => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
report.task = Object.fromEntries(Object.entries(scenario).map(([k, v]) => [k, {
  callsAvg: avg(v.calls), bytesAvg: avg(v.bytes), tokensAvg: tokens(avg(v.bytes)), latency: stats(v.ms)
}]));

// Per-tool latency and response size on a populated 40-row screen.
await s.tool('terminal_type', { sessionId: sid, text: runJob('fill') + '\n' });
await s.tool('terminal_wait', { sessionId: sid, pattern: '^GT_fill_EXIT=3$', timeoutMs: 10000 });
for (let i = 0; i < RUNS; i++) {
  for (const [name, args] of [
    ['terminal_read', { sessionId: sid }],
    ['terminal_read rows=8', { sessionId: sid, rows: 8 }],
    ['terminal_list', {}],
    ['terminal_press', { sessionId: sid, key: 'Escape' }],
    ['terminal_type', { sessionId: sid, text: ' ' }],
    ['terminal_press Backspace', { sessionId: sid, key: 'Backspace' }],
    ['terminal_wait pattern', { sessionId: sid, pattern: '^GT_fill_EXIT=3$' }],
    ['terminal_screenshot', { sessionId: sid }]
  ]) {
    const r = await s.tool(name.split(' ')[0], args);
    if (r.isError) throw new Error(`${name}: ${r.text}`);
    const c = s.calls.at(-1);
    track(name, c.ms, c.received);
  }
}
const sessions = [];
for (let i = 0; i < 5; i++) sessions.push(sessionIdOf((await s.tool('terminal_create', { cols: 120, rows: 40 })).text));
for (let i = 0; i < RUNS; i++) {
  const r = await s.tool('terminal_create', { command: windows ? 'exit 0' : 'true' });
  track('terminal_create command', s.calls.at(-1).ms, s.calls.at(-1).received);
  await s.tool('terminal_destroy', { sessionId: sessionIdOf(r.text) });
  track('terminal_destroy', s.calls.at(-1).ms, s.calls.at(-1).received);
}
const busy = processStats(s.child.pid);
report.server.rssWith6ShellsMB = busy.rssMB;
report.tools = Object.fromEntries(Object.keys(lat).map(k => [k, { latency: stats(lat[k]), bytesAvg: avg(size[k]), tokensAvg: tokens(avg(size[k])) }]));
for (const id of [sid, ...sessions]) await s.tool('terminal_destroy', { sessionId: id });
const closed = await s.close();
report.shutdown = { code: closed.code, stderr: closed.stderr, nonJsonStdoutLines: s.nonJson.length };
rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });

if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
