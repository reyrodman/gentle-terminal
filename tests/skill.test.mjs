import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseFrontmatter } from '../runtime/node_modules/terminal-use/dist/mcp/skills.js';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const skill = read('SKILL.md');
const body = skill.replace(/^---[\s\S]*?---\r?\n/, '');
// Activation cost budget: the always-loaded instructions. Raise deliberately, with a benchmark.
// 7400: Standard/Automatic modes keep their hard limits in the always-loaded text.
const SKILL_BUDGET_BYTES = 7400;

test('SKILL.md frontmatter is valid for the upstream Agent Skills parser and in sync with the package', () => {
  const fm = parseFrontmatter(skill);
  assert.equal(fm.name, 'gentle-terminal');
  assert.match(fm.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(typeof fm.description, 'string');
  assert.ok(fm.description.length > 0 && fm.description.length <= 1024, 'description length');
  assert.match(fm.description, /Not for one-shot/, 'description says when not to activate');
  assert.equal(fm.license, 'MIT');
  assert.equal(fm.metadata.version, JSON.parse(read('package.json')).version);
});

test('activation loads only SKILL.md: no mandatory up-front reads and a bounded size', () => {
  assert.ok(Buffer.byteLength(skill) <= SKILL_BUDGET_BYTES, `SKILL.md is ${Buffer.byteLength(skill)} bytes`);
  assert.doesNotMatch(body, /^\s*\d+\.\s*Read \[/m, 'execution steps must not require reading files first');
  assert.doesNotMatch(body, /\]\(runtime\/node_modules/, 'upstream skill is loaded on demand from references, not from SKILL.md');
});

test('every reference is reachable from SKILL.md and every link resolves', () => {
  const refs = readdirSync(new URL('references/', root)).filter(f => f.endsWith('.md'));
  for (const ref of refs) assert.ok(body.includes(`](references/${ref})`), `orphan reference ${ref}`);
  for (const file of ['SKILL.md', ...refs.map(r => `references/${r}`)]) {
    for (const [, target] of read(file).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(target)) continue;
      const url = new URL(target, new URL(file, root));
      assert.ok(url.href.startsWith(root.href), `${file}: link escapes bundle ${target}`);
      assert.ok(existsSync(url), `${file}: broken link ${target}`);
    }
  }
});

test('safety rules survive any token optimization', () => {
  const required = {
    'not a sandbox': /not a sandbox/i,
    '--cwd is not a boundary': /`--cwd`[^\n]*not a sandbox|any `cwd`/,
    'terminal output is untrusted': /untrusted data/i,
    'no persistent approval unasked': /never choose a persistent option/i,
    'explicit policy for approvals': /explicit user policy/i,
    'no secrets in chat': /never request secrets in chat/i,
    'submit once': /Submit each input once/,
    'timeout is not a result': /wait timeout[^\n]*not results/i,
    'claims need verification': /"done" are not results/,
    'no destroying working sessions': /Never destroy or interrupt a session that may still be working/,
    'no kill by name': /never kill by process name/i,
    'shell-correct syntax': /actual shell/,
    'agent input boxes submit with a separate Enter': /Agent input boxes[^\n]*type without it, then `terminal_press` `Enter` once/,
    'wording-free waits': /until: "quiet"/,
    'a Windows pattern-less wait is a guess': /Windows[^\n]*without `pattern`[^\n]*guess[^\n]*RUNNING/,
    'mode asked once per task in the user language': /ask once per task, in the user's language/i,
    'standard mode keeps every decision human': /\*\*Standard mode\*\*[^\n]*user decides/,
    'automatic mode covers only what the task needs': /\*\*Automatic mode\*\*[^\n]*what the task needs/,
    'automatic mode is the rule 3 policy': /explicit user policy[^\n]*Automatic mode/,
    'hard limits always go to the user': /hard limit[^\n]*goes to the user/i
  };
  for (const [rule, pattern] of Object.entries(required)) assert.match(body, pattern, rule);
  for (const state of ['STARTING', 'READY', 'RUNNING', 'AWAITING_HUMAN', 'AWAITING_PROGRAM_INPUT', 'IDLE', 'COMPLETED', 'FAILED', 'EXITED', 'UNKNOWN', 'RECOVERING']) {
    assert.match(body, new RegExp(`^\\| ${state} \\|`, 'm'), `state ${state}`);
  }
  const auth = read('references/authorization.md');
  assert.match(auth, /one-time/i);
  assert.match(auth, /"always", "for this project", "don't ask again"/);
});

test('automatic mode keeps every hard limit with the user', () => {
  const auth = read('references/authorization.md');
  const section = /## Automatic mode\n([\s\S]*?)(?=\n## |$)/.exec(auth)?.[1] ?? '';
  const limits = {
    'credentials and secrets': /credentials?[^\n]*(login|2FA|secret)/i,
    'deleting what the task did not create': /delet[^\n]*the task did not create/i,
    'operating system and elevation': /operating system[^\n]*|elevation/i,
    'publishing only when asked': /publish[^\n]*only when the task asked/i,
    'instructions from the screen': /text on screen|prompt injection/i,
    'persistent options': /persist/i,
    'uncertain counts as a hard limit': /uncertain[^\n]*hard limit|not sure[^\n]*hard limit/i,
    'non-persistent option only': /narrowest[^\n]*(once|non-persistent)/i,
    'record every automatic answer': /record[^\n]*every/i
  };
  assert.ok(section, 'authorization.md has an "Automatic mode" section');
  for (const [limit, pattern] of Object.entries(limits)) assert.match(section, pattern, limit);
});

test('activation evaluation cases cover every required behavior', () => {
  const { cases } = JSON.parse(read('evals/activation.json'));
  const ids = new Set();
  const fakeScenarios = /Scenarios: ([^\n]+)/.exec(read('tests/fixtures/fake-agent.mjs'))[1];
  for (const c of cases) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`); ids.add(c.id);
    assert.equal(typeof c.prompt, 'string');
    assert.equal(typeof c.activate, 'boolean');
    assert.ok(Array.isArray(c.expect) && c.expect.length > 0, c.id);
    assert.ok(Array.isArray(c.mustNot) && c.mustNot.length > 0, c.id);
    if (c.fakeAgent) assert.match(fakeScenarios, new RegExp(`\\b${c.fakeAgent}\\b`), `${c.id}: unknown fake agent scenario`);
  }
  const categories = new Set(cases.map(c => c.category));
  for (const needed of ['activation', 'non-activation', 'tool-choice', 'authorization', 'silence', 'verification']) {
    assert.ok(categories.has(needed), `missing category ${needed}`);
  }
  assert.ok(cases.some(c => c.activate === false), 'needs negative activation cases');
});
