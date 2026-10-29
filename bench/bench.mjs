// Deterministic MCP benchmark; no model calls or runtime modifications.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, hostname, release, cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer, sessionIdOf, nonce, root, windows } from '../tests/helpers/mcp-client.mjs';
import { parseRuns, summarizeCalls, contractOf, completed, strategyOrder } from './metrics.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string', default: '15' }, json: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('Usage: node bench/bench.mjs [--runs N (1..100; default 15)] [--json FILE]\nMeasures wire bytes and text-only bytes/4 heuristic estimates; model usage unmeasured.');
  process.exit(0);
}
let RUNS;
try { RUNS = parseRuns(values.runs); }
catch (error) { console.error(error.message); process.exit(1); }
const scratch = mkdtempSync(join(tmpdir(), 'gentle-terminal-bench-'));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const stats = xs => ({ n: xs.length, p50: +pct(xs, 50).toFixed(1), p95: +pct(xs, 95).toFixed(1), p99: +pct(xs, 99).toFixed(1) });
const avg = xs => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
const tokens = textBytes => Math.round(textBytes / 4);

function processStats(pid) {
  try {
    if (windows) {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid}; "$($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)"`], { encoding: 'utf8', timeout: 10000 }).trim().split(/\s+/);
      return { rssMB: +(Number(out[0]) / 2 ** 20).toFixed(1), cpuMs: Number(out[1]) };
    }
    const [rss, time] = execFileSync('ps', ['-o', 'rss=', '-o', 'time=', '-p', String(pid)], { encoding: 'utf8', timeout: 10000 }).trim().split(/\s+/);
    const parts = time.replace('-', ':').split(':').map(Number).reverse();
    const cpuMs = ((parts[0] ?? 0) + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) * 3600 + (parts[3] ?? 0) * 86400) * 1000;
    return { rssMB: +(Number(rss) / 1024).toFixed(1), cpuMs };
  } catch { return { rssMB: null, cpuMs: null, reason: 'OS process sampling unavailable' }; }
}

// Retain the existing up-front-read convention; specialized on-demand reads are not included.
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
  return { discoveryBytes: Buffer.byteLength(description), activationBytes: total, estimatedActivationTextTokens: tokens(total), mandatoryReads: files };
}

const report = { node: process.version, platform: `${process.platform}/${process.arch}`, runs: RUNS, skill: skillLoad(),
  environment: { host: hostname(), osRelease: release(), cpu: cpus()[0]?.model ?? null,
    client: 'gentle-terminal-tests/1 (stdio)', runtime: JSON.parse(readFileSync(join(root, 'runtime/package.json'))).dependencies,
    launcherSha256: createHash('sha256').update(readFileSync(join(root, 'launch.mjs'))).digest('hex') },
  measurement: { textTokenHeuristic: 'round(UTF-8 text bytes / 4); excludes images and envelopes; not billed tokens',
    modelInputTokens: null, modelOutputTokens: null, modelUsageReason: 'No model invoked',
    realAgentEvaluations: null, realAgentReason: 'Deterministic MCP harness only; no real-agent evaluations run',
    tokenReductionTargetMet: null, targetReason: 'Billed model tokens unmeasured',
    wireScope: 'JSON-RPC request/response lines including newline; excludes notifications and stderr',
    perTaskResources: null, perTaskResourcesReason: 'Only server-wide OS snapshots collected',
    falsePositiveRate: null, falsePositiveReason: 'No independent ground-truth evaluator' } };
const servers = new Set(), owned = new Set();
let s;
const open = async () => { const server = await startServer({ args: ['--cwd', scratch] }); servers.add(server); return server; };
const tool = async (name, args) => {
  const result = await s.tool(name, args);
  s.calls.at(-1).textBytes = Buffer.byteLength(result.text);
  if (result.isError) throw new Error(`${name}: ${result.text}`);
  return result;
};
const create = async args => {
  const result = await tool('terminal_create', args);
  const id = sessionIdOf(result.text);
  if (!Number.isFinite(id)) throw new Error('Missing session id');
  owned.add(id);
  return id;
};
try {
  const cold = [];
  for (let i = 0; i < Math.min(RUNS, 10); i++) {
    const server = await open();
    cold.push((await server.initialize()).readyMs);
    await server.close();
    servers.delete(server);
  }
  report.coldStartMs = stats(cold);
  s = await open();
  const { init } = await s.initialize();
  const initBytes = s.calls.at(-1).received;
  s.calls.at(-1).textBytes = Buffer.byteLength(JSON.stringify(init));
  const catalog = await s.rpc('tools/list');
  s.calls.at(-1).textBytes = Buffer.byteLength(JSON.stringify(catalog));
  report.contract = contractOf(catalog.tools);
  if (report.contract.count !== 13) throw new Error('Expected unchanged 13-tool contract');
  const toolsBytes = s.calls.at(-1).received;
  let skillsBytes = null;
  try {
    const skills = await s.rpc('skills/list');
    skillsBytes = s.calls.at(-1).received;
    s.calls.at(-1).textBytes = Buffer.byteLength(JSON.stringify(skills));
  } catch { /* extension absent */ }
  report.mcp = { serverVersion: init.serverInfo.version, initializeBytes: initBytes,
    instructionsBytes: Buffer.byteLength(init.instructions ?? ''), toolsListBytes: toolsBytes,
    estimatedToolsListTextTokens: tokens(Buffer.byteLength(JSON.stringify(catalog))), skillsListBytes: skillsBytes,
    skillsListReason: skillsBytes === null ? 'Optional skills/list unavailable' : null,
    discoveryWire: summarizeCalls(s.calls) };
  await new Promise(r => setTimeout(r, 1000));
  const idle0 = processStats(s.child.pid);
  await new Promise(r => setTimeout(r, 5000));
  const idle1 = processStats(s.child.pid);
  report.server = { rssIdleMB: idle0.rssMB,
    cpuIdleMsPer5s: idle0.cpuMs === null || idle1.cpuMs === null ? null : +(idle1.cpuMs - idle0.cpuMs).toFixed(0),
    samplingReason: idle0.reason ?? idle1.reason ?? null };

  const node = windows ? `& '${process.execPath}'` : `'${process.execPath}'`;
  const job = 'for(let i=0;i<30;i++)console.log(\'line \'+i);process.exit(3)';
  const runJob = tag => windows
    ? `${node} -e "${job}"; Write-Output ('GT_'+'${tag}'+'_EXIT='+$LASTEXITCODE)`
    : `${node} -e "${job}"; printf 'GT_%s_EXIT=%s\\n' ${tag} "$?"`;
  const sid = await create({ cols: 120, rows: 40 });
  report.createShellBytes = s.calls.at(-1).received;
  const smallSid = await create({ cols: 120, rows: 12 });
  const scenario = Object.fromEntries(strategyOrder(0).map(mode => [mode, { calls: [], bytes: [], input: [], text: [], ms: [], completed: 0 }]));
  report.strategyContext = { legacy: 'Pre-existing four-call guidance; not a new gain',
    optimized: 'Pre-existing response-reuse guidance; 40 rows',
    adaptive: 'Same optimized strategy and job at 12 rows; compare with optimized, not legacy', cols: 120,
    job, expectedExit: 3, order: 'Forward/reverse on alternating repetitions; fresh marker each submission',
    scope: 'Submission through verified marker; shell creation and clear excluded equally' };
  for (let i = 0; i < RUNS; i++) {
    for (const mode of strategyOrder(i)) {
      const sessionId = mode === 'adaptive' ? smallSid : sid;
      await tool('terminal_type', { sessionId, text: windows ? 'Clear-Host\n' : 'clear\n' });
      const tag = `${nonce()}_${i}_${mode}`;
      const marker = `^GT_${tag}_EXIT=3$`;
      const before = s.calls.length;
      const t0 = performance.now();
      let evidence;
      if (mode === 'legacy') {
        await tool('terminal_type', { sessionId, text: runJob(tag) });
        await tool('terminal_press', { sessionId, key: 'Enter' });
        evidence = await tool('terminal_wait', { sessionId, pattern: marker, timeoutMs: 10000 });
        if (!completed(evidence.text, tag)) throw new Error(`${mode}: marker missing`);
        evidence = await tool('terminal_read', { sessionId });
      } else {
        evidence = await tool('terminal_type', { sessionId, text: runJob(tag) + '\n' });
        if (!completed(evidence.text, tag)) {
          evidence = await tool('terminal_wait', { sessionId, pattern: marker, timeoutMs: 10000 });
        }
      }
      if (!completed(evidence.text, tag)) throw new Error(`${mode}: marker missing`);
      const used = summarizeCalls(s.calls.slice(before));
      const v = scenario[mode];
      v.completed++;
      v.ms.push(performance.now() - t0); v.calls.push(used.calls);
      v.bytes.push(used.outputWireBytes); v.input.push(used.inputWireBytes); v.text.push(used.estimatedTextTokens);
    }
  }
  report.task = Object.fromEntries(Object.entries(scenario).map(([k, v]) => [k, {
    callsAvg: avg(v.calls), outputWireBytesAvg: avg(v.bytes), inputWireBytesAvg: avg(v.input),
    estimatedOutputTextTokensAvg: avg(v.text), latency: stats(v.ms), attempts: RUNS,
    completed: v.completed, errors: RUNS - v.completed, retries: 0, duplicateSubmissions: 0,
    completionEvidence: 'Fresh exact output marker with expected job exit 3 (intentional nonzero)' }]));

  const lat = {}, measurements = {};
  const track = name => {
    const c = s.calls.at(-1);
    (lat[name] ??= []).push(c.ms);
    (measurements[name] ??= []).push(summarizeCalls([c]));
  };
  await tool('terminal_type', { sessionId: sid, text: runJob('fill') + '\n' });
  const filled = await tool('terminal_wait', { sessionId: sid, pattern: '^GT_fill_EXIT=3$', timeoutMs: 10000 });
  if (!completed(filled.text, 'fill')) throw new Error('fill marker missing');
  for (let i = 0; i < RUNS; i++) {
    for (const [name, args] of [
      ['terminal_read', { sessionId: sid }], ['terminal_read rows=8', { sessionId: sid, rows: 8 }],
      ['terminal_list', {}], ['terminal_press', { sessionId: sid, key: 'Escape' }],
      ['terminal_type', { sessionId: sid, text: ' ' }], ['terminal_press Backspace', { sessionId: sid, key: 'Backspace' }],
      ['terminal_wait pattern', { sessionId: sid, pattern: '^GT_fill_EXIT=3$' }], ['terminal_screenshot', { sessionId: sid }]
    ]) {
      await tool(name.split(' ')[0], args);
      track(name);
    }
  }
  for (let i = 0; i < 5; i++) await create({ cols: 120, rows: 40 });
  for (let i = 0; i < RUNS; i++) {
    const id = await create({ command: windows ? 'exit 0' : 'true' });
    track('terminal_create command');
    await tool('terminal_destroy', { sessionId: id });
    owned.delete(id);
    track('terminal_destroy');
  }
  const busy = processStats(s.child.pid);
  report.server.rssWith7ShellsMB = busy.rssMB;
  report.server.busySamplingReason = busy.reason ?? null;
  report.tools = Object.fromEntries(Object.keys(lat).map(k => [k, { latency: stats(lat[k]),
    inputWireBytesAvg: avg(measurements[k].map(m => m.inputWireBytes)),
    outputWireBytesAvg: avg(measurements[k].map(m => m.outputWireBytes)),
    estimatedOutputTextTokensAvg: avg(measurements[k].map(m => m.estimatedTextTokens)) }]));
} finally {
  try {
    for (const id of owned) {
      try { await s.tool('terminal_destroy', { sessionId: id }); }
      catch (error) { (report.cleanupErrors ??= []).push(error.message); }
    }
  } finally {
    try {
      for (const server of servers) {
        const closed = await server.close();
        report.shutdown = { code: closed.code, stderr: closed.stderr, nonJsonStdoutLines: server.nonJson.length };
      }
    } finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); }
  }
}
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
