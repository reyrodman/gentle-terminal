# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-23

### Added

- `gentle-terminal` Agent Skill (`SKILL.md`) with an approval-first activation contract, decision gates and output contract for driving real terminals.
- Same-process launcher (`launch.mjs`) for the official `terminal-use` MCP server, with Node and platform guards and a clear missing-runtime diagnostic.
- Runtime pinned to `terminal-use@0.2.1` with lockfile SHA-512 integrity, installed without lifecycle scripts.
- Operational workflow for supervising other coding agents by state, not by timeout, including observed signals for Codex CLI, OpenCode and Antigravity CLI.
- Ready-to-copy client configurations for Claude Code, Codex CLI, Cursor, VS Code, OpenCode and Claude Desktop.
- Deterministic MCP stdio smoke test and `node:test` suite covering launcher forwarding, relocation, dependency pinning and export allowlist privacy checks.
- Cross-platform CI on Linux, macOS and Windows.

[Unreleased]: https://github.com/reyrodman/gentle-terminal/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/reyrodman/gentle-terminal/releases/tag/v1.0.0
