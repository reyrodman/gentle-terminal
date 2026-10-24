# Supervise a terminal coding agent

Load this when you drive another agent (Claude Code, Codex CLI, OpenCode, Cursor CLI or any terminal client). The states and hard rules in [SKILL.md](../SKILL.md) still apply; this file adds the procedure.

## Procedure

Keep per session: session ID, client and version if shown, approved cwd, the exact task text, whether it was submitted, and the last screen you classified.

1. **Start** the client as a command session in the approved cwd, so its exit code is reported: `terminal_create { command: "codex", cwd: "<approved>" }`.
2. **STARTING → READY.** Wait with `until: "quiet"`, `quietMs: 3000`, `timeoutMs: 30000`, then classify. Clients draw the input box first and overlays (update notice, trust, hooks, login) seconds later, so answer or type only when a second quiet wait returns the same screen. Handle each overlay as AWAITING_HUMAN, then repeat this step.
3. **Submit once.** Type the task **without** `\n`, then press `Enter` once: agent input boxes treat a newline that arrives with the typed burst as pasted text. Confirm submission from the screen (the client echoes it into the transcript, starts working, or clears the input box). If the text is still sitting in the input box, it was written but not sent: press `Enter` once. If you cannot tell, read again; never retype it.
4. **Supervise.** Wait with `until: "quiet"`, `quietMs: 3000`, bounded `timeoutMs` (60 to 120 s); a pattern for the client's idle signal *or* any prompt works too when its text is not already on screen. After every return, quiet, matched or timed out, classify:
   - RUNNING: spinner, elapsed timer, `esc to interrupt`-style hint, or new transcript lines. Wait again.
   - AWAITING_HUMAN: any question, numbered or highlighted menu, `(y/n)`. Load [authorization](authorization.md).
   - IDLE: idle footer or input prompt back, no activity hint, unchanged on re-read.
   - EXITED or RECOVERING: load [recovery](recovery.md).
5. **Long work.** Compare consecutive reads. New content means progress. Identical content with activity hints: keep waiting, and tell the user if it lasts unusually long. Identical content with no activity hint for several waits: UNKNOWN; take one screenshot, then report and ask. Never interrupt on your own.
6. **Verify** before any follow-up, farewell or report. Read the agent's final answer, then check the claimed artifacts yourself: files exist at the requested path with the requested content, and tests or builds pass when you run them in a separate command session. The agent's claim, its colored checkmarks and its own test output are not your verification.
7. **Follow-ups** only after verification, one at a time, same submit-once rule.
8. **Exit** through the client's own mechanism and observe the exit code (see the table). Then destroy the session.

## Wait patterns

- `until: "quiet"` needs no wording and survives client updates; prefer it whenever an earlier idle line (`Worked for …`) is still on screen, as after every follow-up.
- Patterns: build them from the client's current idle and prompt hints, joined with `|`, for example `Worked for|esc to interrupt|\(y/n\)|Allow|trust`. Prefer short phrases over full sentences; wording changes between versions.
- Text that is still on screen matches instantly: once a prompt is answered, drop its phrase from later patterns, or anchor on something only the next state can show. Never anchor on clock times or counters.
- A pattern match is only a reason to look. Classify from the whole returned screen.
- When a wait missed a prompt, add the new wording to later waits and mention the delay in your report.

## Observed client signals

Hints observed on real clients, not contracts. Record the version; confirm on screen every time.

| Client (version, date, OS) | Working | Idle / done | Prompts seen | Natural exit |
|---|---|---|---|---|
| Codex CLI 0.163.0 (2026-10-22 and 2026-10-24, Windows) | `Working (Ns • esc to interrupt)`, activity lines until a `Worked for …` summary | `› Ask Codex to do anything` with `? for shortcuts` | Folder trust screen before the first prompt. On 2026-10-24 the input prompt rendered first, then overlays replaced it: an `Update available` menu whose highlighted default `1. Update now` runs a remote install script (`2. Skip` is one-time, `3. Skip until next version` persists), then a `Hooks need review` menu (`1. Review hooks` highlighted, `2. Trust all and continue`, `3. Continue without trusting`); `Ctrl+C` was ignored there. With `TERM=dumb` it asks `Continue anyway? [y/N]` and refuses the TUI. A task typed with a trailing `\n` stayed in the input box | `/quit`, exit 0 |
| Claude Code 2.1.296 (2026-10-24, Windows) | Not observed | Not observed | In a fresh PTY a first-run onboarding (`Let's get started.`, theme picker) appeared before any prompt; any choice is saved to the user's config | Not observed |
| OpenCode 2.1.2 (2026-10-22, Windows) | `esc interrupt` hint | Idle footer, final report awaiting follow-up | Permission requests in the footer area | Natural exit through its menu |
| Antigravity CLI `agy` 1.4.5 (2026-10-22, Windows) | Footer `esc to cancel`, `Generating...` | Footer `? for shortcuts` | `Do you trust the contents of this project?`, `Run this command?`, `Allow calling this tool?`, `Allow creation of this file?` | `/exit` or `/quit`, exit 0 |

Startup menus that save settings (onboarding, theme, hooks or folder trust) are AWAITING_HUMAN even when they look harmless. A highlighted default is not a safe answer: never press `Enter` on a menu you have not read, and never install or update a client unasked. Clients not listed (including Cursor CLI) and unobserved columns have no recorded signals: start with generic patterns (`esc to interrupt|\(y/n\)|trust|Allow|Do you want`), read every screen, and stop at the first ambiguous prompt. Contribute observed signals with version, date and OS.

## Unknown or changed interface

Behave conservatively: no batching, one input per decision, read after each. If you cannot tell whether a prompt is a permission request, treat it as AWAITING_HUMAN.

## Report

Actions taken, the task text you submitted, fresh evidence (screens, markers, exit codes), artifact checks, unresolved human decisions, remaining sessions and limitations. Keep private terminal output out of distributable examples or fixtures.
