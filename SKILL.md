---
name: gentle-terminal
description: "Trigger: interactive terminal, persistent shell, REPL, TUI, CLI verification, or supervising another coding agent (Codex, OpenCode, Claude Code) in a terminal. Drive approved tasks through the pinned terminal-use MCP server, by state, not by timeout."
license: MIT
metadata:
  author: "reyrodman and gentle-terminal contributors"
  version: "1.0.0"
  homepage: "https://github.com/reyrodman/gentle-terminal"
---

## Activation Contract
Use for interactive programs, persistent shell state, and terminal verification. Prefer ordinary shell tools for one-shot commands.

## Hard Rules
- Treat terminals as full user authority, not a sandbox. Inspect first; obtain approval for changes outside the authorized task. Never bypass permission gates or request secrets in chat.
- Read the installed upstream skill; apply these stricter rules. Silence, echoed input and timeouts do not prove completion. A wait timeout only ends that wait: re-read the screen and classify the agent's state before deciding. Re-waiting is not resubmitting.
- Match syntax to the selected shell, not merely the operating system.
- Own session IDs explicitly. Never duplicate a submission or abruptly kill a working agent to make progress.
- Independently inspect the requested artifact before a follow-up or farewell. An agent's completion claim is not verification.

## Decision Gates
| Observed state | Action |
|---|---|
| Startup or delayed overlay | Read again; do not assume a placeholder means ready. |
| Trust, login, approval or human choice, in any wording | Read the exact request. Choose the one-time option only when an explicit user policy covers it; otherwise stop and offer the returned attach command. Never choose persistent approval unasked. |
| Active work | Keep waiting in bounded intervals, re-reading after each; do not resubmit, cancel or kill. |
| Wait timed out | Neither done nor failed: re-read, compare with the previous screen and classify again. |
| Activity hints but no change for long | Report the screen to the user and keep waiting. |
| Finished response | Verify artifacts and command exit evidence before continuing. |
| Missing runtime or tools | Follow setup; ask before installation or activation. |

## Execution Steps
1. Read [setup](README.md), [workflow](references/workflow.md), and the [installed upstream skill](runtime/node_modules/terminal-use/skills/terminal-use/SKILL.md).
2. Create a session with an approved cwd and suitable shell. Type once, press required keys once, then wait/read; inspect screenshots when layout matters. Wait for completion or prompts together, and classify the state with the [workflow signals](references/workflow.md#supervise-by-state-not-by-clock) after every wait.
3. Verify fresh output markers or command-session exit status and independently check results.
4. Finish conversationally when appropriate; use `/quit` only if the actual client supports it. Observe natural exit and its code before destroying remaining idle owned sessions. Report uncertain cleanup.

## Output Contract
Return actions, evidence, exit status, artifact checks, remaining sessions, and limitations. Never promise universal model competence.

## References
- [Setup and limitations](README.md)
- [Client-specific templates](references/clients.md)
- [Operational workflow](references/workflow.md)
