# Example prompts

These prompts assume the `gentle-terminal` MCP server is connected and the agent has loaded [`SKILL.md`](../SKILL.md). Adapt paths and commands to your shell.

## Route simple work without an interactive session

> Show the first 20 lines of README.md with a file-read tool, then tell me the installed git version with an ordinary one-shot command. Do not open a persistent terminal unless those tools cannot provide equivalent evidence.

Use Gentle-Terminal for interactive/persistent work, a command session when its exit code matters, and a shell session when state must persist. Reuse sufficient returned screens; expand tail/history when evidence is ambiguous. Smaller screens must not hide errors or degrade a TUI.

## Persistent shell state

> Open a terminal session in this project, set `APP_ENV=test`, then run the test suite and tell me the exit code. Keep the session open so I can run more commands with the same environment.

What good behavior looks like: one session is created, the variable persists between commands, and the answer quotes the real exit status instead of guessing from quiet output.

## Interactive and full-screen programs

> Use vim to add a `## Usage` heading at the end of `README.md`, save, quit, and show me `git diff --stat` afterwards.

> Start the Python REPL, compute `sum(range(10**6))`, print the result, then exit the REPL cleanly.

> Run `git rebase -i HEAD~3`, show me the todo list as a screenshot, and stop there without changing anything. I will decide what to squash.

## Supervising another coding agent

> Start Codex CLI in `/approved/workspace` and ask it to add a unit test for `parseConfig`. If it asks to trust the folder or approve a command, stop and show me the exact prompt. When it says it is done, verify the test file exists and run it yourself before telling me.

What good behavior looks like:

- The task is typed **once**, without a trailing newline. Inspect the input box and mode before one separate `Enter`. Preserve exact legitimate content, including `!`, `/`, `@`, `#`, paths and spaces: never strip or rephrase it to avoid composer shortcuts. Use only literal escape/paste capabilities verified for the actual client/version. If safe preservation is uncertain, stop without Enter and ask; `paste: true` alone is not proof of safety. The simulated fixture's Ctrl+L is not a general OpenCode/Codex shortcut.
- Keep one bounded ledger row per session: id/owner, program/version/shell, exact goal and cwd, observed state, input pending/sent, last valid evidence, approvals and verification. Update changed evidence rather than repeating full screen history. An unchanged screen or timeout never justifies resubmitting or claiming completion.
- Trust, login and approval prompts are surfaced to you verbatim; nothing is approved "always" on your behalf.
- Highlighted menu defaults (such as an `Update now` option) are read before anything is chosen, never accepted by pressing `Enter` blindly.
- "Done" is only reported after the agent's artifact was inspected and its test was run independently.
- The client is closed with its natural exit (`/quit`, `/exit`, or its menu) and the exit code is reported.

## Long-running commands

> Run the production build. It may take several minutes; keep checking until it really finishes, and report the last 20 lines and the exit code.

## Clean-up

> List the terminal sessions you own, close any idle ones, and tell me if anything is still running.
