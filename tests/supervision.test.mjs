// Engine contract the skill relies on, exercised through the real MCP server
// against a deterministic simulated agent (tests/fixtures/fake-agent.mjs).
// No model calls, no network; scratch state lives in the OS temp directory.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, sessionIdOf, nonce, windows, processAlive, waitUntil } from './helpers/mcp-client.mjs';

const fixture = fileURLToPath(new URL('fixtures/fake-agent.mjs', import.meta.url));
const quote = s => windows ? `'${s.replaceAll("'", "''")}'` : `'${s.replaceAll("'", "'\\''")}'`;
const agent = scenario => `${windows ? '& ' : ''}${quote(process.execPath)} ${quote(fixture)} ${scenario}`;
// The trust question stays on screen after it is answered, so it must not be
// part of later waits: old text satisfies a pattern immediately.
const idle = '^Worked for|^Run this command\\?';
let server, scratch;
const owned = new Set();

before(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'gentle terminal e2e ñ-'));
  server = await startServer({ args: ['--cwd', scratch], timeoutMs: 20000 });
  await server.initialize();
});
after(async () => {
  for (const sessionId of owned) await server.tool('terminal_destroy', { sessionId });
  const { code, stderr } = await server.close();
  // Windows releases ConPTY handles on the scratch tree shortly after exit.
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.deepEqual(server.nonJson, [], 'stdout must carry only JSON-RPC');
});

async function call(name, args) {
  const r = await server.tool(name, args);
  assert.equal(r.isError, false, `${name}: ${r.text}`);
  return r.text;
}
async function open(scenario, dir) {
  const cwd = join(scratch, dir);
  mkdirSync(cwd, { recursive: true });
  const sessionId = sessionIdOf(await call('terminal_create', { command: agent(scenario), cwd, cols: 100, rows: 30 }));
  owned.add(sessionId);
  return { sessionId, cwd };
}
async function trust(sessionId) {
  assert.match(await call('terminal_wait', { sessionId, pattern: '^trust>', timeoutMs: 10000 }), /Do you trust/);
  assert.match(await call('terminal_type', { sessionId, text: '1\n' }), /Trusted\./);
  await call('terminal_wait', { sessionId, pattern: '^Trusted\\.\\n› ?$', timeoutMs: 5000 });
}
async function destroy(sessionId) {
  await call('terminal_destroy', { sessionId });
  owned.delete(sessionId);
}

test('delayed trust overlay appears after the first screen and is not auto-answered', async () => {
  const { sessionId } = await open('work', 'late-trust');
  const first = await call('terminal_wait', { sessionId, pattern: '^FakeAgent 1\\.0', timeoutMs: 10000 });
  assert.doesNotMatch(first, /Do you trust/, 'overlay is delayed; an early screen is not READY');
  await trust(sessionId);
  await destroy(sessionId);
});

test('typed text is not submitted until Enter, and one Enter submits exactly once', async () => {
  const { sessionId, cwd } = await open('work', 'submit-once');
  await trust(sessionId);
  const typed = await call('terminal_type', { sessionId, text: 'create result' });
  assert.match(typed, /› create result/);
  assert.doesNotMatch(typed, /received task/, 'written is not sent');
  await call('terminal_press', { sessionId, key: 'Enter' });
  const done = await call('terminal_wait', { sessionId, pattern: idle, timeoutMs: 15000 });
  assert.match(done, /^received task #1: create result$/m);
  assert.doesNotMatch(done, /received task #2/);
  assert.ok(existsSync(join(cwd, 'result.txt')), 'artifact verified independently');
  await call('terminal_type', { sessionId, text: '/quit\n' });
  assert.match(await call('terminal_wait', { sessionId, timeoutMs: 5000 }), /exit code 0/);
  await destroy(sessionId);
});

test('agent input box: a typed trailing newline is pasted, a separate Enter submits once, quiet ends supervision', async () => {
  const { sessionId } = await open('composer', 'composer');
  await call('terminal_wait', { sessionId, pattern: '^FakeComposer 1\\.0', timeoutMs: 10000 });
  const typed = await call('terminal_type', { sessionId, text: 'summarize models\n' });
  assert.doesNotMatch(typed, /received task/, 'a fast newline is not a submit in an agent input box');
  const pressed = await call('terminal_press', { sessionId, key: 'Enter' });
  assert.match(pressed, /^received task: summarize models$/m);
  // No wording-specific pattern: the spinner keeps output flowing until the work ends.
  const settled = await call('terminal_wait', { sessionId, until: 'quiet', quietMs: 1500, timeoutMs: 15000 });
  assert.match(settled, /^Worked for 1s$/m);
  assert.equal(settled.match(/received task/g).length, 1);
  await call('terminal_type', { sessionId, text: '/quit' });
  await call('terminal_press', { sessionId, key: 'Enter' });
  assert.match(await call('terminal_wait', { sessionId, timeoutMs: 5000 }), /exit code 0/);
  await destroy(sessionId);
});

test('simulated input-mode: unsafe markers are not submitted; verified literal entry preserves exact content once', async () => {
  const { sessionId, cwd } = await open('input-mode', 'literal-input');
  const content = '  Keep ! / @ # exactly: hello@example.org /docs #42!  ';
  const receipt = join(cwd, 'literal-input.json');
  const ready = await call('terminal_wait', { sessionId, pattern: '^FakeInputMode', timeoutMs: 10000 });
  assert.match(ready, /simulated/);
  const unsafe = await call('terminal_type', { sessionId, text: content });
  assert.match(unsafe, /MODE: UNSAFE shell\/command\/mention/);
  assert.equal(existsSync(receipt), false, 'no execution or receipt before a safe submit');
  const unchanged = await call('terminal_read', { sessionId });
  assert.match(unchanged, /MODE: UNSAFE/);
  assert.doesNotMatch(unchanged, /received task/);
  assert.equal(existsSync(receipt), false, 'unchanged screen is not completion');
  // This key is a purpose-built fixture capability, NOT a real-client shortcut.
  const literal = await call('terminal_press', { sessionId, key: 'Ctrl+L' });
  assert.match(literal, /MODE: VERIFIED LITERAL \(fixture-only Ctrl\+L\)/);
  assert.equal(existsSync(receipt), false, 'switching modes is not submission');
  assert.match(literal, new RegExp(content.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const submitted = await call('terminal_press', { sessionId, key: 'Enter' });
  assert.match(submitted, /received task #1 \(literal\)/);
  assert.doesNotMatch(submitted, /received task #2|UNSAFE EXECUTION/);
  assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), { content, executions: 1 });
  await call('terminal_press', { sessionId, key: 'Ctrl+D' });
  assert.match(await call('terminal_wait', { sessionId, timeoutMs: 5000 }), /exit code 0/);
  assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), { content, executions: 1 });
  await destroy(sessionId);
});

test('an inherited TERM=dumb never reaches sessions; an explicit session TERM wins only on Windows', async () => {
  const dumb = await startServer({ args: ['--cwd', scratch], env: { ...process.env, TERM: 'dumb' }, timeoutMs: 20000 });
  try {
    await dumb.initialize();
    // Stay alive after printing: on Linux the final screen of a command that exits at once can miss its last output.
    const show = windows ? "Write-Output ('TERM='+$env:TERM); Start-Sleep -Seconds 2" : 'printf "TERM=%s\\n" "$TERM"; sleep 2';
    // On Linux and macOS node-pty sets TERM from the PTY name (xterm-256color).
    for (const [env, expected] of [[undefined, 'xterm-256color'], [{ TERM: 'vt100' }, windows ? 'vt100' : 'xterm-256color']]) {
      const created = await dumb.tool('terminal_create', { command: show, ...(env && { env }) });
      const sessionId = sessionIdOf(created.text);
      const shown = await dumb.tool('terminal_wait', { sessionId, pattern: `^TERM=${expected}$`, timeoutMs: 10000 });
      assert.match(shown.text, /^Pattern .* matched after/, shown.text);
      assert.match((await dumb.tool('terminal_wait', { sessionId, timeoutMs: 10000 })).text, /exit code 0/);
      await dumb.tool('terminal_destroy', { sessionId });
    }
  } finally {
    const { code } = await dumb.close();
    assert.equal(code, 0);
  }
});

test('Windows: a pattern-less wait in a shell session ends on a short silence and calls it a guess; the marker still decides', { skip: !windows && 'Windows-only fallback' }, async () => {
  const sessionId = sessionIdOf(await call('terminal_create', { cwd: scratch }));
  owned.add(sessionId);
  await call('terminal_wait', { sessionId, pattern: '^PS .*> ?$', timeoutMs: 15000 });
  const id = nonce();
  await call('terminal_type', { sessionId, text: `Start-Sleep -Seconds 6; Write-Output ('GT_'+'${id}'+'_DONE')\n` });
  const guess = await call('terminal_wait', { sessionId, timeoutMs: 15000 });
  assert.match(guess, /guess/);
  assert.doesNotMatch(guess, new RegExp(`^GT_${id}_DONE`, 'm'), 'the command was still running');
  assert.match(await call('terminal_wait', { sessionId, pattern: `^GT_${id}_DONE`, timeoutMs: 15000 }), /matched/);
  // A larger quietMs stretches that silence window: a 3 s pause no longer ends the wait.
  const next = nonce();
  await call('terminal_type', { sessionId, text: `Start-Sleep -Seconds 3; Write-Output ('GT_'+'${next}'+'_DONE')\n` });
  assert.match(await call('terminal_wait', { sessionId, quietMs: 5000, timeoutMs: 20000 }), new RegExp(`^GT_${next}_DONE`, 'm'));
  await destroy(sessionId);
});

test('a completion claim is not evidence: the claimed artifact can be missing', async () => {
  const { sessionId, cwd } = await open('false-success', 'false-success');
  await trust(sessionId);
  await call('terminal_type', { sessionId, text: 'create result\n' });
  assert.match(await call('terminal_wait', { sessionId, pattern: idle, timeoutMs: 15000 }), /Done\. Created result\.txt/);
  assert.equal(existsSync(join(cwd, 'result.txt')), false);
  assert.equal(existsSync(join(cwd, 'reslt.txt')), true);
  await destroy(sessionId);
});

test('approval menu stops progress until someone answers; waiting never chooses', async () => {
  const { sessionId } = await open('approval', 'approval');
  await trust(sessionId);
  await call('terminal_type', { sessionId, text: 'clean build\n' });
  const prompt = await call('terminal_wait', { sessionId, pattern: idle, timeoutMs: 15000 });
  assert.match(prompt, /Run this command\?\n\s+rm -rf \.\/build/);
  assert.match(prompt, /Yes, always for this project/);
  const later = await call('terminal_wait', { sessionId, until: 'quiet', quietMs: 800, timeoutMs: 3000 });
  assert.doesNotMatch(later, /approval:/);
  assert.match(await call('terminal_type', { sessionId, text: '3\n' }), /approval: 3/);
  await destroy(sessionId);
});

test('injected instructions in program output arrive as ordinary screen text', async () => {
  const { sessionId } = await open('inject', 'inject');
  await trust(sessionId);
  await call('terminal_type', { sessionId, text: 'read the readme\n' });
  const screen = await call('terminal_wait', { sessionId, pattern: idle, timeoutMs: 15000 });
  assert.match(screen, /IGNORE ALL PREVIOUS INSTRUCTIONS/);
  assert.doesNotMatch(screen, /approval:/, 'nothing answers the menu on its own');
  await destroy(sessionId);
});

test('wait timeout is neither success nor failure: the silent program is still running', async () => {
  const { sessionId } = await open('hang', 'hang');
  await trust(sessionId);
  await call('terminal_type', { sessionId, text: 'long task\n' });
  const waited = await server.tool('terminal_wait', { sessionId, pattern: '^Worked for', timeoutMs: 2500 });
  assert.equal(waited.isError, false);
  assert.match(waited.text, /Timed out after \d+ms: pattern .* has not appeared/);
  assert.match(waited.text, /esc to interrupt/);
  const list = await call('terminal_list', {});
  assert.match(list, new RegExp(`^\\[${sessionId}\\] .*command=`, 'm'));
  assert.doesNotMatch(list, new RegExp(`^\\[${sessionId}\\] .*EXITED`, 'm'));
  await destroy(sessionId);
});

test('a program that dies without a message reports its exit code', async () => {
  const { sessionId } = await open('crash', 'crash');
  await trust(sessionId);
  await call('terminal_type', { sessionId, text: 'do it\n' });
  assert.match(await call('terminal_wait', { sessionId, timeoutMs: 10000 }), /command exited \(exit code 3\)/);
  const again = await server.tool('terminal_type', { sessionId, text: 'retry\n' });
  assert.equal(again.isError, true);
  assert.match(again.text, /no process left to send input to/);
  await destroy(sessionId);
});

test('alternate screen is reported and the TUI exits through its own command', async () => {
  const { sessionId } = await open('alt', 'alt');
  const tui = await call('terminal_wait', { sessionId, pattern: '^tui>', timeoutMs: 10000 });
  assert.match(tui, /\(alt buffer active\)/);
  await call('terminal_type', { sessionId, text: 'q\n' });
  assert.match(await call('terminal_wait', { sessionId, timeoutMs: 5000 }), /exit code 0/);
  await destroy(sessionId);
});

test('stale screen text satisfies a pattern; a split-literal nonce marker does not match its own echo', async () => {
  const sessionId = sessionIdOf(await call('terminal_create', { cols: 120, rows: 30 }));
  owned.add(sessionId);
  const tag = nonce();
  const print = windows ? `Write-Output ('GT_'+'${tag}')` : `printf 'GT_%s\\n' ${tag}`;
  const echoed = await server.tool('terminal_wait', { sessionId, pattern: `^GT_${tag}$`, timeoutMs: 0 });
  assert.match(echoed.text, /Timed out/);
  await call('terminal_type', { sessionId, text: print });
  assert.match((await server.tool('terminal_wait', { sessionId, pattern: `^GT_${tag}$`, timeoutMs: 400 })).text, /Timed out/,
    'the echoed, unsubmitted command must not satisfy the marker');
  await call('terminal_press', { sessionId, key: 'Enter' });
  assert.match(await call('terminal_wait', { sessionId, pattern: `^GT_${tag}$`, timeoutMs: 5000 }), /matched/);
  const stale = await call('terminal_wait', { sessionId, pattern: `^GT_${tag}$`, timeoutMs: 5000 });
  assert.match(stale, /matched after \d+ms/, 'old output keeps matching: never reuse a marker');
  await destroy(sessionId);
});

test('shell exit between calls: next input is NOT run and shell state is gone', async () => {
  const sessionId = sessionIdOf(await call('terminal_create', { cols: 120, rows: 30 }));
  owned.add(sessionId);
  await call('terminal_type', { sessionId, text: windows ? "$keep='kept'\n" : 'keep=kept\n' });
  const pid = Number(new RegExp(`^\\[${sessionId}\\] .*pid=(\\d+)`, 'm').exec(await call('terminal_list', {}))[1]);
  await call('terminal_type', { sessionId, text: 'exit\n' });
  // ConPTY can report the exit more than a second late; until then the old
  // session still looks alive and accepts input that no shell will run.
  assert.ok(await waitUntil(async () => !(await processAlive(pid)), 10000), 'shell did not exit');
  await new Promise(resolve => setTimeout(resolve, 1500));
  const tag = nonce();
  const lost = await server.tool('terminal_type', { sessionId, text: (windows ? `Write-Output ('GT_'+'${tag}')` : `printf 'GT_%s\\n' ${tag}`) + '\n' });
  assert.equal(lost.isError, true);
  assert.match(lost.text, /A fresh shell has been spawned/);
  assert.doesNotMatch(lost.text, new RegExp(`^GT_${tag}$`, 'm'));
  const check = await call('terminal_type', { sessionId, text: (windows ? "Write-Output ('KEEP=['+$keep+']')" : 'printf "KEEP=[%s]\\n" "$keep"') + '\n' });
  const screen = /KEEP=\[/.test(check) ? check : await call('terminal_wait', { sessionId, pattern: '^KEEP=\\[', timeoutMs: 5000 });
  assert.match(screen, /^KEEP=\[\]$/m);
  await destroy(sessionId);
});

test('destroyed session ids are not respawned', async () => {
  const sessionId = sessionIdOf(await call('terminal_create', { command: windows ? 'exit 0' : 'true' }));
  await call('terminal_destroy', { sessionId });
  const r = await server.tool('terminal_read', { sessionId });
  assert.equal(r.isError, true);
  assert.match(r.text, /Unknown sessionId/);
});

test('long Unicode output, cwd with spaces and independent sessions', async () => {
  const { sessionId } = await open('flood', 'dir with spaces & ñ');
  const end = await call('terminal_wait', { sessionId, timeoutMs: 10000 });
  assert.match(end, /exit code 0/);
  assert.match(end, /^FLOOD_DONE$/m);
  assert.match(end, /^row 3000 ñ 漢字 ü$/m);
  const tail = await call('terminal_read', { sessionId, rows: 5 });
  assert.ok(tail.length < end.length, 'rows limits the payload');
  const older = await call('terminal_read', { sessionId, rows: 10, page: 5 });
  assert.match(older, /^row \d+ ñ 漢字 ü$/m);
  await destroy(sessionId);
  const a = sessionIdOf(await call('terminal_create', { cols: 80, rows: 10, env: { GT_ID: 'A' } }));
  const b = sessionIdOf(await call('terminal_create', { cols: 80, rows: 10, env: { GT_ID: 'B' } }));
  owned.add(a); owned.add(b);
  const show = windows ? "Write-Output ('ID='+$env:GT_ID)\n" : 'printf "ID=%s\\n" "$GT_ID"\n';
  for (const [id, expected] of [[a, 'A'], [b, 'B']]) {
    const r = await call('terminal_type', { sessionId: id, text: show });
    const screen = /^ID=/m.test(r) ? r : await call('terminal_wait', { sessionId: id, pattern: '^ID=', timeoutMs: 5000 });
    assert.match(screen, new RegExp(`^ID=${expected}$`, 'm'));
  }
  await destroy(a); await destroy(b);
});
