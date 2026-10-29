import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRuns, summarizeCalls, contractOf, completed, strategyOrder } from '../bench/metrics.mjs';

const cli = (args, env = process.env) => spawnSync(process.execPath, ['bench/bench.mjs', ...args], { encoding: 'utf8', timeout: 5000, env });

test('runs reject non-positive, fractional, infinite and excessive values before startup', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'gt-bench-invalid-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch };
  for (const value of ['0', '-1', '1.5', 'Infinity', 'NaN', '101', '']) {
    assert.throws(() => parseRuns(value), /--runs must be an integer from 1 to 100/);
    const before = readdirSync(scratch);
    const result = cli([`--runs=${value}`], env);
    assert.deepEqual(readdirSync(scratch), before, 'rejection must not create scratch state');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '--runs must be an integer from 1 to 100\n');
  }
  assert.equal(parseRuns('1'), 1);
  assert.equal(parseRuns('100'), 100);
  assert.equal(parseRuns('15'), 15);
});

test('help preserves runs/json options and explains measurement limits without starting server', () => {
  const result = cli(['--help']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /--runs N.*1\.\.100/);
  assert.match(result.stdout, /--json/);
  assert.match(result.stdout, /text-only.*heuristic/);
  assert.match(result.stdout, /model.*unmeasured/);
});

test('wire accounting is bidirectional and never estimates image bytes as tokens', () => {
  assert.deepEqual(summarizeCalls([{ sent: 12, received: 100000, textBytes: 8 }, { sent: 3, received: 20, textBytes: 4 }]), {
    calls: 2, inputWireBytes: 15, outputWireBytes: 100020, textBytes: 12, estimatedTextTokens: 3
  });
  assert.equal(summarizeCalls([{ sent: 1, received: 900000 }]).estimatedTextTokens, 0);
});

test('contract digest canonicalizes object keys but preserves tool and parameter-array order', () => {
  const tools = [{ name: 'a', inputSchema: { type: 'object', required: ['x', 'y'] } }, { name: 'b' }];
  const contract = contractOf(tools);
  assert.deepEqual(contract.names, ['a', 'b']);
  assert.equal(contract.count, 2);
  assert.equal(contract.sha256, contractOf([{ inputSchema: { required: ['x', 'y'], type: 'object' }, name: 'a' }, { name: 'b' }]).sha256);
  assert.notEqual(contract.sha256, contractOf([...tools].reverse()).sha256);
});

test('every strategy requires an exact fresh output marker and alternates order', () => {
  assert.equal(completed('echo GT_new_EXIT=3', 'new'), false);
  assert.equal(completed('GT_old_EXIT=3\n', 'new'), false);
  assert.equal(completed('GT_new_EXIT=0\n', 'new'), false);
  assert.equal(completed('line\r\nGT_new_EXIT=3\r\n', 'new'), true);
  assert.deepEqual(strategyOrder(0), ['legacy', 'optimized', 'adaptive']);
  assert.deepEqual(strategyOrder(1), ['adaptive', 'optimized', 'legacy']);
});
