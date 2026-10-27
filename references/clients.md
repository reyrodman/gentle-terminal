# Client-specific activation examples

The portable contract is a stdio process: executable `node`, argument `launch.mjs` at its absolute path, and optional upstream arguments such as `--cwd`. MCP does **not** standardize a universal client configuration schema.

Before activation, verify the installed client's documentation, supported MCP transport, configuration location, scope, trust rules and precedence. Request approval for the exact change. These examples are optional formats, not applied settings or integration test results. Replace paths and resolve `node` explicitly if needed. Keep spaces inside individual argument values; do not embed shell quoting.

Ready-to-copy files live in [`examples/`](../examples/README.md). `node install.mjs` applies these formats for every client it finds after the user runs it; the rest of this page is for manual setup and review.

User-level files the installer edits (`~` is the home folder; `<config>` is `%APPDATA%` on Windows, `~/Library/Application Support` on macOS and `$XDG_CONFIG_HOME` or `~/.config` on Linux):

| Client | File | Key |
|---|---|---|
| Cursor IDE and `cursor-agent` | `~/.cursor/mcp.json` | `mcpServers` |
| VS Code (and Insiders) | `<config>/Code/User/mcp.json` | `servers`, with `"type": "stdio"` |
| Codex CLI, app and IDE extension | `$CODEX_HOME` or `~/.codex` `/config.toml` | `[mcp_servers.<name>]` |
| Claude Code | `~/.claude.json` | `mcpServers`; existing gentle-terminal entries under `projects.<path>.mcpServers` (the default `claude mcp add` scope) are repointed too |
| Claude Desktop | `<config>/Claude/claude_desktop_config.json` | `mcpServers` |
| OpenCode | `$XDG_CONFIG_HOME` or `~/.config` `/opencode/opencode.json` | `mcp`, command array |
| Antigravity IDE and `agy` | `~/.gemini/config/mcp_config.json` | `mcpServers` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |

Verification status (2026-10-24, Windows 11): the stdio server itself is verified by `npm run smoke` and the E2E suite with a test client. The configuration snippets below follow each client's documented format but were **not** integration-tested by applying them. Installed versions seen while observing startup behavior: Claude Code 2.1.296, Codex CLI 0.163.0, OpenCode 2.1.4. Cursor, VS Code and Claude Desktop were not verified.

Skill discovery differs per client: some scan skill folders, some read `AGENTS.md`-style files, some load skills published by MCP servers (`skills/list`), and some do none of these. When unsure, ask the agent to read `SKILL.md` explicitly.

## Claude Code

```text
claude mcp add gentle-terminal --scope user -- node /absolute/path/to/gentle-terminal/launch.mjs
```

## Codex CLI

Register with the CLI, or verify the installed version's TOML schema and edit `config.toml` yourself. Do not run registration commands on a user's behalf without approval.

```text
codex mcp add gentle-terminal -- node /absolute/path/to/gentle-terminal/launch.mjs
```

```toml
[mcp_servers.gentle-terminal]
command = "node"
args = ["/absolute/path/to/gentle-terminal/launch.mjs", "--cwd", "/approved/workspace"]
```

## Cursor, Claude Desktop and other `mcpServers` clients

Verify that the installed client supports this shape and determine its effective project/user scope before use:

```json
{
  "mcpServers": {
    "gentle-terminal": {
      "command": "node",
      "args": ["/absolute/path/to/gentle-terminal/launch.mjs", "--cwd", "/approved/workspace"]
    }
  }
}
```

Do not assume adapter-specific fields or skill discovery behavior are universal.

## VS Code

```json
{
  "servers": {
    "gentle-terminal": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/gentle-terminal/launch.mjs"]
    }
  }
}
```

## OpenCode

Verify the installed version's local MCP schema and configuration scope. This format uses a command array, not a shell command string:

```json
{
  "mcp": {
    "gentle-terminal": {
      "type": "local",
      "command": ["node", "/absolute/path/to/gentle-terminal/launch.mjs", "--cwd", "/approved/workspace"],
      "enabled": true
    }
  }
}
```

## Tool-call confirmations

Many clients ask before each MCP tool call. Those confirmations belong to the client, not to gentle-terminal: [Automatic mode](authorization.md#automatic-mode) removes the stops for the supervised program's prompts, but the client can still pause before every `terminal_*` call.

In Automatic mode, when the client confirms `terminal_*` calls, ask the user once whether to allow the gentle-terminal tools for this conversation, then follow the client's row below. Only the user can pick a client dialog option; tell them which one. Prefer an option scoped to this server and to the session; never suggest one that persists ("always", saved to settings) unless the user asks for it. Revert when the user asks to approve calls again. Allowing tool calls does not lift the skill's hard limits: credentials, deletions, system changes and the rest still go to the user.

| Client | Session-only allowance | Revert |
|---|---|---|
| VS Code (Copilot Chat) | In the confirmation, allow the server's tools for this session, or type `/autoApprove` (covers every tool) | `/disableAutoApprove`, or the chat's permissions picker |
| Gemini CLI | "Allow all server tools for this session" (trusted folders only) | Start a new session |
| Codex CLI 0.97+ | "Allow for this session", per tool, when offered | Start a new session |
| OpenCode | Answer `always`: it lasts until the session ends | Start a new session |
| Claude Code | Only at launch: `claude --allowedTools "mcp__gentle-terminal__*"` | Restart without the flag |
| Cursor CLI | `/auto-run` (covers every tool, not only this server) | `/auto-run` again |
| Cursor IDE | No per-chat option exists; use `session.mjs` below | `node <skill-dir>/session.mjs revoke --workspace <workspace>` |
| Antigravity, Claude Desktop, Windsurf | No session-only option; approve each call in the dialog ("Allow once") | None needed |

**Cursor IDE.** After the user agrees, run `node <skill-dir>/session.mjs allow --workspace <workspace>`, where `<skill-dir>` is the gentle-terminal folder and `<workspace>` the folder open in Cursor. It adds `gentle-terminal:*` to `mcpAllowlist` in `<workspace>/.cursor/permissions.json`, which Cursor re-reads live, and remembers exactly what it changed. `revoke` restores the file as it was (or removes only that entry if the file changed since), and `status` reports whether it is active. Tell the user what the command printed:
- it works only with a Run Mode (Auto-review, Allowlist or Run Everything) in Cursor Settings;
- it stays until revoked, also if Cursor closes, so mention it in each final report while active, with the revoke command;
- while it is active, a new workspace `mcpAllowlist` replaces the MCP allowlist from Settings, so other MCP servers may ask again;
- do not commit the file while it is active.

If the command fails (for example the file has comments) or Cursor keeps asking, do not edit the file by hand: guide the user to approve from Cursor's dialog with "Run once" for each call. Its "Allowlist MCP tool" button is global and persists, so suggest it only if the user wants that.

## After an approved change

Reload as the client requires, inspect MCP status, and perform a bounded probe. On Windows use absolute Windows paths; optionally pass `--shell` for an installed shell. Read [the skill](../SKILL.md) and its installed upstream skill through the client's supported mechanism. Tool availability alone neither loads the policy nor guarantees model competence. No automatic registration or real-agent task is part of the reusable smoke.
