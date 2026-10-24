# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-10-24

### Changed

- `SKILL.md` uses progressive disclosure: it no longer requires reading `README.md`, `references/workflow.md` and the upstream skill before acting. Text required before the first action drops from 34,301 to 5,693 bytes.
- `references/workflow.md` is now the agent-supervision procedure, with versioned client signals including a delayed Codex CLI hooks menu and Claude Code first-run onboarding.
- Documentation states that `--cwd` is only a default and separates controls enforced in code from Agent Skill guidance.

### Added

- Eleven-state decision table (STARTING to RECOVERING), the rule that terminal output is untrusted data, split-literal nonce markers and call-economy guidance.
- On-demand references: `authorization.md`, `recovery.md`, `windows.md`, `engine.md`.
- E2E suite against a deterministic simulated agent (`tests/supervision.test.mjs`, `tests/fixtures/fake-agent.mjs`), launcher guard tests, lockfile supply-chain checks, skill validation tests and `evals/activation.json`.
- `npm run bench` cost benchmark and measured results in the README.
- Threat model in `SECURITY.md`, including the observed Windows attach-pipe ACL.
- CI on Linux and Windows ARM64 runners.

### Compatibility

- No change to the launcher, CLI flags or the pinned `terminal-use@0.2.1`: all 13 MCP tools, parameters and responses are unchanged.

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
