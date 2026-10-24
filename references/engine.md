# terminal-use 0.2.1: behavior, limits and cost

Load this for wait semantics, response sizes, session limits, full-screen programs, or when the host also loaded the upstream `terminal-use` skill. Facts below come from the pinned 0.2.1 source and are pinned by `tests/supervision.test.mjs`.

## One skill, not two

The server also publishes its own usage skill over MCP (`skill://terminal-use/SKILL.md`, via the `io.modelcontextprotocol/skills` extension) and mentions it in its `instructions`. It is the same file as `runtime/node_modules/terminal-use/skills/terminal-use/SKILL.md`. This skill already contains the rules you need for routine use; do not load the upstream skill as well unless you need its recipes. Where they differ, the stricter gentle-terminal rule wins (approvals, timeouts, cleanup).

Upstream detail worth loading on demand only:
- Key names and combinations: [keys](../runtime/node_modules/terminal-use/skills/terminal-use/references/keys.md)
- vim, pagers, REPLs, menus, ssh and password prompts, `git rebase -i`, testing a TUI: [recipes](../runtime/node_modules/terminal-use/skills/terminal-use/references/recipes.md)
- Upstream troubleshooting: [troubleshooting](../runtime/node_modules/terminal-use/skills/terminal-use/references/troubleshooting.md)

## Input tools

- `terminal_type`, `terminal_press`, `terminal_click`, `terminal_scroll` return after output has been quiet for `idleMs` (default 200 ms), or after `maxWaitMs` (default 5 s, capped at 10 s) with a "still active" note; they then return the whole screen.
- `\n` inside `terminal_type` is Enter. Without it, text is only written into the input line. Agent input boxes (Codex CLI and similar) can treat an Enter that arrives in the same burst as typed text as a pasted newline; send it with a separate `terminal_press`.
- `terminal_press` takes `count` (for example `ArrowDown` ×2): one call and one screen instead of one per key.
- `paste: true` sends multi-line text as one bracketed paste so editors do not auto-indent and shells do not run it line by line. Nothing is submitted until you press Enter.
- `terminal_batch` runs up to its action limit in order, stops at the first failing step, and returns one screen at the end. It can include `wait` steps with a pattern. Do not batch across a point where a prompt or decision may appear.

## terminal_wait

- No pattern, shell session: waits until the shell owns the terminal again and output is quiet. On Windows ownership cannot be checked; it falls back to about 2 s of silence and labels the result a guess.
- No pattern, command session: waits for the program to exit and reports its exit code. On Linux, a program that prints heavily right before exiting can lose its last lines from the final screen (observed in CI with 3,000 rows). Take completion from the exit code and from artifacts, not from the final screen's last line.
- `pattern`: JavaScript regex, multiline (`^`/`$` per line), trailing spaces trimmed, `(?i)` prefix for case-insensitive. Searched on the screen plus 200 rows of scrollback. Text already there matches immediately.
- `until: "quiet"`: returns after `quietMs` of silence; never returns while a program keeps printing. It needs no wording, so it is the robust choice for TUI startup and agent follow-ups; animated spinners and elapsed timers keep it waiting.
- `timeoutMs` defaults to 30 s, max 10 min. A timeout is a normal response, not an error.

## Reading

- `terminal_read` is cheap. `rows: N` returns only the newest N rows; `page: N` walks back through scrollback in windows of `rows`. `cursor: false` returns unmodified text; the `▌` cursor marker is not screen content.
- The read lists highlighted spans (reverse video or background color): that is how TUIs show the selected menu entry.
- `(alt buffer active)` in the header means a full-screen program owns the display; shell scrollback is not visible until it exits.
- `terminal_screenshot` returns a PNG. Use it only when color or layout decides the state.

## Measured cost (Windows 11, Node 24.16, 120x40 session)

| Item | Approximate size |
|---|---|
| `tools/list` (13 tools) | 24.8 KB |
| Server `instructions` | 1.7 KB |
| `terminal_read`, full 40-row screen | 0.9 KB |
| `terminal_read { rows: 8 }` | 0.3 KB |
| `type` / `press` / `wait` response | 0.9 KB |
| `terminal_screenshot` | 71 KB (image) |

Run a command and get its exit status: `type` + `press Enter` + `wait` + `read` cost 4 calls and about 3.3 KB; one `type` with `\n` and a fresh marker cost 1 call and about 1.0 KB, because the response already contained the marker. Reproduce with `npm run bench`.

## Sessions

- `terminal_create` takes `cwd`, `shell`, `command`, `env`, `login`, `cols`, `rows`, `scrollback`, `label` and `theme` per call; server flags are only defaults.
- Sessions inherit the server's environment. The emulator is always xterm-256color. On Linux and macOS sessions always get `TERM=xterm-256color`, even when `env` sets another value. On Windows `TERM` passes through, so `launch.mjs` replaces an inherited empty or `dumb` value (common when a client starts from an agent or IDE shell) with `xterm-256color`; a `TERM` passed in `env` still wins there.
- `terminal_create` returns an attach command for the human. Do not run it yourself.
- Explicit `terminal_destroy` is final: the ID then reports `Unknown sessionId`. A shell that exits by itself is respawned on the next call under the same ID; a finished command session stays readable until destroyed and is never rerun automatically.
- Limits: 50 live sessions (the least recently active is evicted), 6 h inactivity kill. Closing the server's stdin or SIGINT/SIGTERM/SIGHUP disposes every session.
