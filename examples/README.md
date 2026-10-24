# Examples

Copy-paste starting points for wiring gentle-terminal into popular MCP clients, plus prompts that exercise the skill.

| Client | File | Where it usually goes |
|---|---|---|
| Codex CLI | [`codex/config.toml`](codex/config.toml) | `~/.codex/config.toml` (merge the table) |
| Cursor | [`cursor/mcp.json`](cursor/mcp.json) | `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json` |
| VS Code | [`vscode/mcp.json`](vscode/mcp.json) | `<project>/.vscode/mcp.json` |
| OpenCode | [`opencode/opencode.json`](opencode/opencode.json) | `opencode.json` in your project or global config |
| Claude Desktop | [`claude-desktop/claude_desktop_config.json`](claude-desktop/claude_desktop_config.json) | Settings → Developer → Edit Config |
| Claude Code | CLI command (see below) | user or project scope |

```text
claude mcp add gentle-terminal --scope user -- node /absolute/path/to/gentle-terminal/launch.mjs
```

Before you paste:

1. Replace `/absolute/path/to/gentle-terminal` with the folder where you cloned this repository. On Windows, JSON needs escaped backslashes (`C:\\tools\\gentle-terminal\\launch.mjs`) or forward slashes (`C:/tools/gentle-terminal/launch.mjs`).
2. Replace `/approved/workspace` with the only directory you want new sessions to start in, or drop the `--cwd` pair to inherit the client's working directory.
3. Check your client's current documentation: configuration locations and schemas change between versions.

Then try the prompts in [`prompts.md`](prompts.md).
