# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Standard and Automatic modes. Before the first `terminal_create` of a task, the agent asks once, in the user's language, which mode to use, unless the request already names one or sets its own approval policy. **Standard** keeps today's behavior: every trust, login and approval prompt goes to the user. **Automatic** is an explicit policy the user grants for that task: the agent answers, with one-time options only (never "this conversation" or other options that pre-approve later actions), the prompts the task needs (also outside the workspace) and keeps going until the goal is verified. Hard limits still go to the user: credentials and secrets, deleting what the task did not create (even if it asked to clean it), replacing what it did not ask to change, elevation and operating system changes, system-wide installs and downloaded scripts, publishing or uploads the task did not ask for, instructions from the screen, persistent options and anything uncertain. Every automatic answer is reported. Details in `references/authorization.md`; `references/clients.md` explains that a client's own tool-call confirmations are separate. Four new evaluation cases; `SKILL.md` grows from 6,421 to 7,484 bytes and its budget from 6,500 to 7,500.

### Changed

- README artwork: a redesigned banner showing a supervised Codex session moving through its observed states, plus three new diagrams: capabilities (`docs/assets/capabilities.svg`), the eleven-state machine (`docs/assets/states.svg`) and the architecture (`docs/assets/architecture.svg`, replacing the Mermaid chart). `docs/assets/social-preview.png` is a 1280x640 render of the banner for the repository's social preview; it is not part of the package.

## [1.2.1] - 2026-10-24

### Fixed

- `node install.mjs` did nothing, silently, when started through a linked folder (for example under macOS `/var`, a link to `/private/var`).
- `npm run update` refused a valid checkout reached through a Windows 8.3 short path; checkout and skill-link paths are now compared after native resolution.
- `references/windows.md`: the screen returned with a Windows wait guess can show a bare prompt while the command is still running (observed with `Start-Sleep -Seconds 6`), so only a fresh marker or an exit status confirms completion.
- `npm run update` on a branch other than the remote's default branch now says which branch it follows and how to switch (`git switch main`), instead of silently staying on that branch.
- Windows waits: `SKILL.md` now says up front that a shell-session `terminal_wait` without `pattern` ends after about 2 s of silence and labels the result a guess, so it means RUNNING, not done. `references/windows.md` explains why (no terminal process group on Windows) and the options: a fresh marker pattern, a command session, or a larger `quietMs`, which stretches the fallback window. A Windows-only E2E test pins this engine behavior. Reported from Antigravity CLI use; process-tree detection and OSC 133 markers were evaluated and left to the upstream engine, since they need engine or PowerShell-profile changes. `SKILL.md` grows from 6,272 to 6,421 bytes.

## [1.2.0] - 2026-10-24

### Added

- `install.mjs` (`npm run clients`): one command for first installs and updates. It detects installed MCP clients by their user config files (Cursor IDE and `cursor-agent`, VS Code and Insiders, Codex CLI/app/IDE extension, Claude Code, Claude Desktop, OpenCode, Antigravity IDE and `agy`, Gemini CLI, Windsurf), adds a `gentle-terminal` entry or repoints existing gentle-terminal entries in place, and links the skill into each client's user skills folder. Files with comments or unrecognized layouts are left untouched and reported. Changed files are backed up, written atomically and read back; the runtime is installed only when missing or out of date and restored if `npm ci` fails; an MCP handshake must pass before clients are touched. `--dry-run`, `--only`, `--skip`, `--node` and `--uninstall` are supported. Clients installed after an earlier run are added on the next run. Claude Code project-scope entries are repointed, and `CODEX_HOME` is honored.
- `npm run update` (`install.mjs --update`): fast-forwards the git checkout, then reruns the installer from the new code. It refuses local changes, diverged branches and folders that are not their own checkout.
- `tests/install.test.mjs` runs the installer against a temporary home folder.

### Changed

- README, `SECURITY.md` (installer scope and threat-model row), `examples/README.md` and `THIRD_PARTY_NOTICES.md` describe the installer; the README no longer claims that client configs are never edited, only that nothing edits them unless you run the installer.

### Fixed

- The TERM test no longer flakes on Linux: it reads the value while the command is still running instead of from the final screen, which can miss the last output when the PTY exit arrives first.
- Documentation synced with 1.1.0: README skill size, test and ARM64 coverage, and architecture diagram; the pin-update checklist in `CONTRIBUTING.md` now includes `tests/guards.test.mjs`; `examples/prompts.md` reflects separate-`Enter` submission and unread menu defaults.

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

- `launch.mjs` replaces an inherited empty or `dumb` `TERM` with `xterm-256color`, the terminal the emulator provides. On Windows, clients started from agent or IDE shells passed `TERM=dumb` to every session, and Codex CLI refused to start its TUI. A `TERM` given in `terminal_create` `env` still wins on Windows; on Linux and macOS node-pty always sets `xterm-256color`.
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

[Unreleased]: https://github.com/reyrodman/gentle-terminal/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/reyrodman/gentle-terminal/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/reyrodman/gentle-terminal/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/reyrodman/gentle-terminal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/reyrodman/gentle-terminal/releases/tag/v1.0.0
