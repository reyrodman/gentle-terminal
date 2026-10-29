# Supervise a terminal coding agent

Load this when you drive another agent (Claude Code, Codex CLI, OpenCode, Cursor CLI or any terminal client). The states and hard rules in [SKILL.md](../SKILL.md) still apply; this file adds the procedure.

## Procedure

Keep a minimal per-session ledger: id | owner | program/version | shell | goal (exact task and approved cwd) | state | input pending/sent | last evidence | approvals | verification. Update it from returned screens instead of reconstructing unchanged history. An unchanged screen is not evidence of completion; retain the last valid evidence and pending/sent status.

1. **Start** the client as a command session in the approved cwd, so its exit code is reported: `terminal_create { command: "codex", cwd: "<approved>" }`.
2. **STARTING → READY.** Wait with `until: "quiet"`, `quietMs: 3000`, `timeoutMs: 30000`, then classify. Clients draw the input box first and overlays (update notice, trust, hooks, login) seconds later, so answer or type only when a second quiet wait returns the same screen. Handle each overlay as AWAITING_HUMAN, then repeat this step.
3. **Submit once, preserve exact content.** Type the task **without** a submission `\n`; agent input boxes can treat a fast newline as pasted text. Before the single separate `Enter`, inspect the returned screen and detect composer mode: `$` shell, `/` command list and `@` file picker are warning signals; `!`, `/`, `@`, `#` may change modes. OpenCode 2.1.4 was observed running a message containing `!` as shell input. Never silently strip or rephrase legitimate user content (paths, mentions, punctuation included). Use only literal input escape/paste capabilities verified for the actual client/version; verify the exact buffer and safe mode before Enter. `paste: true` alone proves neither literal mode nor no submission: bracketed paste can fall back and embedded newlines can submit. If safe preservation is unavailable or uncertain, stop and ask; send no Enter, newline or batch across the uncertain mode. A verified capability may retain the buffer while changing mode; do not retype or duplicate it. Confirm submission from transcript/activity/cleared input, then mark sent. If ambiguous, read again, never resend or press Enter again. The simulated `input-mode` fixture tests this sequence with its own Ctrl+L capability; that key is not universal and the simulation is not real OpenCode/Codex proof.
4. **Supervise.** Wait with `until: "quiet"`, `quietMs: 3000`, bounded `timeoutMs` (60 to 120 s); a pattern for the client's idle signal *or* any prompt works too when its text is not already on screen. After every return, quiet, matched or timed out, classify:
   - RUNNING: spinner, elapsed timer, `esc to interrupt`-style hint, or new transcript lines. Wait again.
   - AWAITING_HUMAN: any question, numbered or highlighted menu, `(y/n)`. Load [authorization](authorization.md).
   - IDLE: idle footer or input prompt back, no activity hint, unchanged on re-read.
   - EXITED or RECOVERING: load [recovery](recovery.md).
5. **Long work.** Compare consecutive reads. New content means progress. Identical content with activity hints: keep waiting, and tell the user if it lasts unusually long. Identical content with no activity hint for several waits: UNKNOWN; take one screenshot, then report and ask. Never interrupt on your own.
6. **Verify** before any follow-up, farewell or report. Read the agent's final answer, then check the claimed artifacts yourself: files exist at the requested path with the requested content, and tests or builds pass when you run them in a separate command session. Check content against the request too: a research summary dated today can still list outdated facts. On a mismatch, send one specific correction as a follow-up and verify again. The agent's claim, its colored checkmarks and its own test output are not your verification.
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
| OpenCode 2.1.2 and 2.1.4 (2026-10-22 and 2026-10-24, Windows) | `esc interrupt` hint with a progress bar | Idle footer without `esc interrupt`, a `model · duration · tok/s` line | Permission requests in the footer area; none for web research and writing in the cwd on 2026-10-24. A message containing `!` ran as a shell command, shown as `$ …` | `/exit`, exit 0 |
| Antigravity CLI `agy` 1.4.5 (2026-10-22 and 2026-10-24, Windows) | Footer `esc to cancel`, `Generating...` | Footer `? for shortcuts` above an empty `>` input | `Do you trust the contents of this project?` (only `Yes, I trust this folder` or `No, exit`), `Run this command?`, `Allow calling this tool?` with six options (once, this conversation, persist to `settings.json`, for both allow and deny), `Allow creation of this file?`. It repeated the same tool prompt after each approval; a one-time deny ended the loop with `Interrupted · What should Antigravity CLI do instead?` | `/exit` or `/quit`, exit 0 |

Startup menus that save settings (onboarding, theme, hooks or folder trust) are AWAITING_HUMAN even when they look harmless. A highlighted default is not a safe answer: never press `Enter` on a menu you have not read, and never install or update a client unasked. Clients not listed (including Cursor CLI) and unobserved columns have no recorded signals: start with generic patterns (`esc to interrupt|\(y/n\)|trust|Allow|Do you want`), read every screen, and stop at the first ambiguous prompt. Contribute observed signals with version, date and OS.

## Unknown or changed interface

Behave conservatively: no batching, one input per decision, read after each. If you cannot tell whether a prompt is a permission request, treat it as AWAITING_HUMAN.

## Report

Actions taken, the task text you submitted, fresh evidence (screens, markers, exit codes), artifact checks, unresolved human decisions, remaining sessions and limitations. Keep private terminal output out of distributable examples or fixtures.
