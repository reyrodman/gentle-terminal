# Recover without repeating work

Load this when a wait times out, a session is respawned, gone or exited, the client reconnects, output looks truncated, or you cannot tell what happened. Principle: find out what already happened before doing anything again. Never auto-repeat a step that changes state (writes, installs, deletes, commits, pushes, migrations, payments, messages) on uncertainty.

## Situations

| Response or symptom | Meaning | Do |
|---|---|---|
| `Timed out after …: pattern … has not appeared` (not an error) | Only that wait ended | Classify the returned screen. RUNNING: wait again. Otherwise re-read and classify |
| `Timed out …: the command is still running` | Same | Same. `Ctrl+C` only with the user's agreement |
| `Typed N chars` / `Pressed Enter` | Bytes reached the terminal, nothing more | Look for the program's reaction on screen or a fresh marker |
| `A fresh shell has been spawned (reusing the same sessionId)` | The old shell had exited, idled out or been evicted. **Your input in that call was not run** | Old cwd, variables, activated environments and jobs are gone. Re-create needed state, then decide whether re-issuing is safe |
| `The shell exited during this call` | Shell ended while your input ran | Read the included last screen; the next call respawns |
| `There is no process left to send input to` | Command session's program exited | Read the final screen and exit code; `terminal_reset { hardReset: true }` only if rerunning is safe |
| `Unknown sessionId` | Destroyed or never existed | Do not guess another ID; `terminal_list` shows your sessions |
| Exit code without an error message | Program died silently | Report the code and the last screen; check partial artifacts |
| Output scrolled away or looks cut | The screen is a window | `terminal_read { page: N }` walks back through scrollback; patterns only search the screen plus 200 rows above it |
| Program keeps printing (logs, watch mode) | Quiet waits never return | Wait for a specific pattern instead of `until: "quiet"` |
| No output for a long time | Could be thinking, blocked on I/O or hung | Look for activity hints; a command session's exit is the only proof it stopped |

## When state is uncertain

1. Re-read once (`terminal_read`), then screenshot once if layout or color may decide it.
2. Check side effects with an independent, read-only probe in a separate command session (does the file exist, did the commit land, is the server listening).
3. Only an idempotent or verified-not-done step may be re-issued, and only once.
4. Still unclear: report the evidence and ask.

## Connection loss and supervisor interruption

- If the MCP client disconnects or restarts the server, every session of that server is disposed. After reconnecting, `terminal_list` starts empty: previous session IDs do not exist, and programs they ran were stopped. Inspect artifacts before re-running anything.
- If you (the supervisor) were interrupted or your context was compacted, reconstruct from the screen and `terminal_list`, not from memory: re-read each owned session before acting.
- Abrupt termination (forced kill, crash, power loss) can leave descendant processes running. Report uncertain cleanup; do not kill by process name.

## Engine limits that cause recovery

- A session with no output and no tool call for 6 hours is terminated. A shell session comes back as a fresh shell on next use; a command session reports `was closed after sitting idle … was not restarted` and must be created again.
- With 50 live sessions, creating another evicts the least recently active one, even if its program is still running quietly. Keep few sessions and destroy finished ones.
