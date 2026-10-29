import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const expected = [
  'CHANGELOG.md', 'LICENSE', 'README.md', 'SKILL.md', 'THIRD_PARTY_NOTICES.md',
  'bench/bench.mjs', 'bench/metrics.mjs', 'bench/README.md', 'tests/bench.test.mjs',
  'docs/assets/architecture.svg', 'docs/assets/banner.svg',
  'docs/assets/capabilities.svg', 'docs/assets/states.svg',
  'examples/README.md', 'examples/claude-desktop/claude_desktop_config.json',
  'examples/codex/config.toml', 'examples/cursor/mcp.json',
  'examples/opencode/opencode.json', 'examples/prompts.md', 'examples/vscode/mcp.json',
  'evals/activation.json', 'install.mjs', 'launch.mjs', 'package.json',
  'references/authorization.md', 'references/clients.md', 'references/engine.md',
  'references/recovery.md', 'references/windows.md', 'references/workflow.md',
  'runtime/package-lock.json', 'runtime/package.json', 'session.mjs', 'smoke.mjs',
  'tests/export.test.mjs', 'tests/fixtures/fake-agent.mjs', 'tests/guards.test.mjs',
  'tests/helpers/mcp-client.mjs', 'tests/install.test.mjs', 'tests/launcher.test.mjs', 'tests/pin.test.mjs', 'tests/session.test.mjs', 'tests/skill.test.mjs', 'tests/supervision.test.mjs'
].sort();
const lifecycle = ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly'];
test('local npm export includes only portable files, private metadata and valid links', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.private, true);
  assert.equal(manifest.engines.node, '>=22.12.0');
  for (const hook of lifecycle) assert.equal(manifest.scripts?.[hook], undefined, 'lifecycle script: ' + hook);
  assert.equal(manifest.dependencies, undefined);
  const result = spawnSync('npm pack --dry-run --json --ignore-scripts --cache runtime/.cache', {
    shell: true, cwd: fileURLToPath(root), encoding: 'utf8', timeout: 25000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map(f => f.path).sort();
  assert.deepEqual(files, expected);
  console.log('Export files: ' + files.join(', '));
  // Construct patterns so the privacy check does not match its own source.
  const home = new RegExp('(?:[A-Za-z]:[/\\\\]' + 'Users[/\\\\][^/\\\\\\s]+|/' + '(?:home|Users)/[^/\\s]+)', 'i');
  for (const file of files) {
    const text = readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, home, file);
    if (!file.endsWith('.md')) continue;
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(match[1])) continue;
      const target = new URL(match[1], new URL(file, root));
      assert.ok(target.href.startsWith(root.href), 'link escapes bundle: ' + match[1]);
      // These upstream files are provided by the documented per-machine install.
      if (target.href.includes('/runtime/node_modules/')) continue;
      assert.ok(existsSync(target), file + ': broken link ' + match[1]);
    }
  }
});
