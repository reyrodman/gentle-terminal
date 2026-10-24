# Operate one owned terminal task at a time

Inspect the current screen before acting. Keep the session ID, selected shell, approved cwd and last submission state. Read the installed upstream tool descriptions; do not invent keys or options.

## State gates

| State | Required action |
|---|---|
| Startup | Wait boundedly, then inspect again. A visible input placeholder can precede delayed trust/login overlays. |
| Human decision | Stop at trust, login, approvals, credentials or ambiguous choices unless an explicit user policy covers that exact action. Return the available attach command; never select approval on your own judgment. |
| Active work | Keep supervising with bounded waits. Do not submit the same task again, send a follow-up, cancel or kill while work is active. |
| Wait timeout | Not completion and not failure. Re-read the screen and classify it again with the signals below before deciding anything. |
| Active but unchanged for long | Report the current screen to the user and keep waiting. Do not interrupt on your own. |
| Apparent completion | Read the full result and verify artifacts independently before any follow-up. |
| Unclear state | Read again or take a screenshot. If it stays ambiguous, report the screen and ask; never guess. |

## Supervise by state, not by clock

A wait limit only ends that wait call; it says nothing about the agent. Complex tasks can run far longer than any limit you choose.

1. Wait for a pattern that matches both completion and permission prompts, never completion alone, with a bounded limit.
2. When the wait returns, matched or timed out, read the screen and classify it:
   - **Working**: spinner or progress animation, running elapsed timer, interrupt/cancel hint, or new lines since the previous read. Wait again.
   - **Needs input**: any question, numbered choice, yes/no or approval prompt. Apply the human-decision gate.
   - **Idle**: input prompt back, idle footer, final answer rendered, no activity hints. Verify artifacts.
   - **Exited**: command session reports an exit code. Read the final screen.
3. Compare consecutive reads. Changing content means progress; identical content with activity hints means keep waiting and tell the user if it lasts unusually long.
4. Re-waiting is not resubmitting. Never retype the task, press Enter again or interrupt to "unstick" an agent without new evidence and user agreement.

## Recognize prompts in any wording

Clients change their wording and layout between versions. Do not depend on exact strings; recognize the intent:

- A pending question: phrases such as "Run this command?", "Allow calling this tool?", "Allow creation of this file?", "Do you trust…", "Continue?", `(y/n)`.
- A choice menu: numbered options, a highlighted row, navigation hints such as arrows or "enter Confirm".
- The subject: read the exact command, tool, file path or folder being requested before answering.

Then respond deliberately:

1. Identify what is requested and where it acts: inside or outside the authorized workspace, read-only or state-changing.
2. If an explicit user policy covers it, choose the one-time approval option. Never pick "always allow" or anything that persists to settings unless the user asked for exactly that.
3. Otherwise stop, show the user the exact request and options, and wait. Offer the attach command when the user prefers to answer directly.
4. After answering, read again: agents often chain several prompts.

When your wait pattern missed a prompt, add the new wording to later waits and report the delay; do not answer prompts you did not read.

## Observed client signals (hints, not contracts)

Observed on 2026-10-22 on Windows. Use them as starting hints for wait patterns and always confirm on screen; versions can change them.

| Client | Working | Idle / done | Prompts seen | Exit |
|---|---|---|---|---|
| Antigravity CLI (`agy` 1.4.5) | Footer `esc to cancel`, spinner lines such as `Generating...` | Footer `? for shortcuts`, final answer above the prompt | `Do you trust the contents of this project?`, `Run this command?`, `Allow calling this tool?`, `Allow creation of this file?` | `/exit` (alias `/quit`); prints a resume command, exit code 0 |
| OpenCode (2.1.2) | `esc interrupt` hint visible | Idle footer, final report waiting for follow-up | Permission states in the footer area | Natural exit through its menu |
| Codex CLI (0.163.0) | Activity lines until a `Worked for …` summary | Full footer with input prompt | Folder trust screen before the first prompt | `/quit`, then `Shutting down`, exit code 0 |

A quiet screen is not an idle signal: agents can think silently for minutes. Prefer the client's explicit working and idle hints, and re-check after every wait.

## Submit and verify

1. Create a shell session for persistent cwd/variables, or a command session when exact exit status matters. Use explicit approved cwd and the selected shell's syntax, including quoting and environment variables.
2. Type once; press Enter only when the tool/input mode requires it. Read/wait after submission rather than guessing from silence. Use screenshots if color or layout changes interpretation.
3. Verify a fresh output-only marker or explicit command-session exit status. Echoed command text and quiet-output guesses are not proof of success. An outer shell's status may not establish the inner agent's result.
4. Independently inspect expected artifacts or changed state using an authorized read/check. Match contents and location to the request, not just a completion claim. If missing or wrong, report the mismatch; any correction needs the same authorization boundaries.

## Finish without interrupting work

Only after artifact verification, send a requested follow-up or appropriate farewell. Use `/quit` only when the actual client supports it; otherwise use its documented natural-exit mechanism. Observe the resulting exit and code. Report nonzero or unobserved exits rather than calling them success.

Destroy remaining owned idle sessions explicitly. Never destroy a working agent to force progress, target unrelated sessions, or kill by process name. Report uncertain cleanup: abrupt termination and detached descendants prevent a universal process-tree guarantee.

Return actions, fresh evidence, artifact checks, exit codes, unresolved human decisions and any remaining sessions. Keep private terminal output out of distributable examples or fixtures.
