# Example prompts

These prompts assume the `gentle-terminal` MCP server is connected and the agent has loaded [`SKILL.md`](../SKILL.md). Adapt paths and commands to your shell.

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

- The task is typed **once**, without a trailing newline, checked in the input box, then submitted with one separate `Enter`. A wait timeout leads to re-reading the screen, never to resubmitting.
- Trust, login and approval prompts are surfaced to you verbatim; nothing is approved "always" on your behalf.
- Highlighted menu defaults (such as an `Update now` option) are read before anything is chosen, never accepted by pressing `Enter` blindly.
- "Done" is only reported after the agent's artifact was inspected and its test was run independently.
- The client is closed with its natural exit (`/quit`, `/exit`, or its menu) and the exit code is reported.

## Long-running commands

> Run the production build. It may take several minutes; keep checking until it really finishes, and report the last 20 lines and the exit code.

## Clean-up

> List the terminal sessions you own, close any idle ones, and tell me if anything is still running.
