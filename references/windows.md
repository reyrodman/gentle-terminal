# Windows, PowerShell and ConPTY

Load this when the server runs on Windows or a session uses PowerShell or cmd. Behaviors below were verified on Windows 11 with Windows PowerShell 5.1 and terminal-use 0.2.1.

## Shell syntax

- The default shell is `powershell.exe` (Windows PowerShell 5.1), not `pwsh`. Pass `shell: "pwsh.exe"` or `"cmd.exe"` at creation when needed and write in that shell's syntax.
- PowerShell: `$env:NAME='value'`, `;` between commands, `& 'C:\path with spaces\tool.exe' arg` to run a quoted path, single quotes for literals (`''` escapes a quote inside them). cmd: `set NAME=value`, `&` between commands, `"…"` quoting.
- Exit status: `$LASTEXITCODE` holds the last *native* program's code (empty if none ran); `$?` is True/False for the last statement. In a command session the engine reports the real exit code for you.
- A `command` session runs as `powershell -Command "& { <command> }"`: PowerShell syntax applies there too.
- Prefer `cwd` and `env` at `terminal_create` over typing `cd` and `$env:`; they also avoid quoting mistakes.
- Avoid `Clear-Host` before reading: it wipes the screen you need as evidence.

## Waiting

- `terminal_wait` without a pattern cannot ask Windows who owns the terminal. In a shell session it falls back to about 2 s of silence and says the result is a guess. Use a pattern with a fresh marker, or a command session, whenever completion matters.
- A quiet PowerShell prompt is not proof the previous command finished: a native program may still be starting.

## ConPTY timing

- After `exit`, the shell's exit can be reported more than a second late. During that window `terminal_list` still shows the session as live, and input can be accepted without error (`Typed N chars`) by a shell that is already exiting, so whether it ran is unknown. After exiting a shell on purpose, expect the next call to report a respawn, and verify any later command with a marker.
- Deleting a directory used as a session's cwd can fail with `EPERM` for a short time after the session ends; handles are released asynchronously.

## Paths and configs

- In JSON configs use `C:/tools/gentle-terminal/launch.mjs` or escaped backslashes. Keep each argument, including paths with spaces, as one array element; do not add shell quotes inside it.
- GUI-launched clients may inherit a reduced `PATH`; resolve `node` with `where.exe node` and use its absolute path if the client cannot find it.

## Attach pipe

Session attach endpoints are named pipes `\\.\pipe\terminal-use-<pid>-<id>`. On the test machine their default DACL granted Read to Everyone and Anonymous Logon, and the server replays the screen and scrollback to any client that connects. On shared or multi-user Windows hosts, assume other local accounts may be able to read session output; keep secrets off screen and see [SECURITY.md](../SECURITY.md).
