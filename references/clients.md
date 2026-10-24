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

## After an approved change

Reload as the client requires, inspect MCP status, and perform a bounded probe. On Windows use absolute Windows paths; optionally pass `--shell` for an installed shell. Read [the skill](../SKILL.md) and its installed upstream skill through the client's supported mechanism. Tool availability alone neither loads the policy nor guarantees model competence. No automatic registration or real-agent task is part of the reusable smoke.
