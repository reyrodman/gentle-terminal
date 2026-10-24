# Contributing to gentle-terminal

Thanks for helping make AI agents safer and more capable in real terminals. This guide keeps contributions easy to review.

## Ways to contribute

- **Client signals.** Observed working, idle, prompt and exit hints for coding-agent CLIs (new clients or new versions) for [`references/workflow.md`](references/workflow.md). Include the client version, OS and the date you observed them.
- **Client configuration examples** for MCP clients that are not covered yet in [`examples/`](examples/README.md).
- **Bug reports** with a minimal reproduction (see the issue templates).
- **Docs and tests** that make the behavior clearer or better covered.

For larger changes (new behavior in `SKILL.md`, launcher changes, a new runtime pin) please open an issue first so we can agree on the approach.

## Development setup

Requirements: Node.js 22.12+ and npm.

```bash
git clone https://github.com/reyrodman/gentle-terminal.git
cd gentle-terminal
npm run setup
npm run verify
```

`npm run verify` must pass before you open a pull request. CI runs the same checks on Linux, macOS and Windows.

## Guidelines

- **Keep the skill short and strict.** `SKILL.md` is loaded into agent context; every line costs tokens. Put long explanations in `references/`.
- **Never weaken a safety rule** (approval gates, no persistent approval unasked, no process-name kills, verify before follow-up) without an issue discussing why.
- **No private data in fixtures or examples.** Use placeholders such as `/absolute/path/to/gentle-terminal` and `/approved/workspace`. The export test rejects home-directory paths in packaged files.
- **Updating the runtime pin** requires updating `runtime/package.json`, `runtime/package-lock.json`, the integrity string in `tests/pin.test.mjs` and the expected version in `tests/launcher.test.mjs` and `smoke.mjs`, plus a `CHANGELOG.md` entry.
- **New packaged files** must be added to the `files` allowlist in `package.json` and to the expected list in `tests/export.test.mjs`.
- Match the existing style: ES modules, no build step, no runtime dependencies at the root.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`.
- Keep pull requests focused; one behavior change per PR, with its tests and docs.
- Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) for user-visible changes.
- Fill in the pull request template, including how you verified the change.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) and that you will follow our [Code of Conduct](CODE_OF_CONDUCT.md).
