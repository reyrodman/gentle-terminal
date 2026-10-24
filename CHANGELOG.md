# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-10-24

### Changed

- `SKILL.md` uses progressive disclosure: it no longer requires reading `README.md`, `references/workflow.md` and the upstream skill before acting. Text required before the first action drops from 34,301 to 6,272 bytes.
- `references/workflow.md` is now the agent-supervision procedure, with versioned client signals including a delayed Codex CLI hooks menu and Claude Code first-run onboarding.
- Documentation states that `--cwd` is only a default and separates controls enforced in code from Agent Skill guidance.

### Added

- Eleven-state decision table (STARTING to RECOVERING), the rule that terminal output is untrusted data, split-literal nonce markers and call-economy guidance.
- On-demand references: `authorization.md`, `recovery.md`, `windows.md`, `engine.md`.
- E2E suite against a deterministic simulated agent (`tests/supervision.test.mjs`, `tests/fixtures/fake-agent.mjs`), launcher guard tests, lockfile supply-chain checks, skill validation tests and `evals/activation.json`.
- `npm run bench` cost benchmark and measured results in the README.
- Threat model in `SECURITY.md`, including the observed Windows attach-pipe ACL.
- CI on Linux and Windows ARM64 runners.

### Fixed

- `launch.mjs` replaces an inherited empty or `dumb` `TERM` with `xterm-256color`, the terminal the emulator provides. Clients started from agent or IDE shells passed `TERM=dumb` to every session, and Codex CLI refused to start its TUI. A `TERM` given in `terminal_create` `env` still wins.
- Agent supervision found in real Codex CLI 0.163.0 runs: tasks are typed without `\n` and submitted with one separate `Enter` (input boxes take a fast newline as pasted text), startup and follow-ups wait with `until: "quiet"` instead of on-screen wording, menus move with one `terminal_press` `count`, and a highlighted menu default (Codex's `Update now` runs a remote install script) is never accepted unread.
- Findings from real OpenCode 2.1.4 and Antigravity CLI 1.4.5 runs: check the input box before `Enter` and keep `!`, `/`, `@` and `#` out of messages (OpenCode ran a message containing `!` as a shell command), confirm that an answer registered before answering a repeated prompt, and verify research content, not only that the file exists.

### Compatibility

- No change to CLI flags or the pinned `terminal-use@0.2.1`: all 13 MCP tools, parameters and responses are unchanged. The only launcher change is the `TERM` normalization above.

## [1.0.0] - 2026-10-23

### Added

- `gentle-terminal` Agent Skill (`SKILL.md`) with an approval-first activation contract, decision gates and output contract for driving real terminals.
- Same-process launcher (`launch.mjs`) for the official `terminal-use` MCP server, with Node and platform guards and a clear missing-runtime diagnostic.
- Runtime pinned to `terminal-use@0.2.1` with lockfile SHA-512 integrity, installed without lifecycle scripts.
- Operational workflow for supervising other coding agents by state, not by timeout, including observed signals for Codex CLI, OpenCode and Antigravity CLI.
- Ready-to-copy client configurations for Claude Code, Codex CLI, Cursor, VS Code, OpenCode and Claude Desktop.
- Deterministic MCP stdio smoke test and `node:test` suite covering launcher forwarding, relocation, dependency pinning and export allowlist privacy checks.
- Cross-platform CI on Linux, macOS and Windows.

[Unreleased]: https://github.com/reyrodman/gentle-terminal/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/reyrodman/gentle-terminal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/reyrodman/gentle-terminal/releases/tag/v1.0.0
