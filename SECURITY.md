# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting: go to the [Security tab](https://github.com/reyrodman/gentle-terminal/security) and choose **Report a vulnerability**. Include:

- What is affected (launcher, skill policy, runtime pin, documentation that leads to unsafe use)
- Steps to reproduce, with your OS, shell, Node version and MCP client
- The impact you observed or expect

You can expect an acknowledgement within a few days and a status update once the report has been triaged. Please give us a reasonable time to fix the issue before any public disclosure.

## Scope

gentle-terminal is intentionally **not a sandbox**: terminal sessions run with the privileges of the user who starts the MCP server. Reports that an agent can run commands the user could run are expected behavior. In scope:

- The launcher executing anything other than the pinned upstream entry point
- `install.mjs` changing anything other than gentle-terminal entries and skill links, losing data in a client config, or following links into folders it should not touch
- Weaknesses in how the runtime pin or integrity is enforced
- Skill or workflow guidance that would lead an agent to bypass approval prompts, persist approvals, or leak credentials
- Private data or secrets shipped in the repository or packaged archive

Vulnerabilities in [terminal-use](https://github.com/computer-agent-labs/terminal-use) itself should be reported to that project; we will update the pin once a fix is released.

## Threat model

gentle-terminal gives an AI agent the same terminal access as the user who starts the MCP server. Its controls fall into two groups:

- **Enforced in code**: Node and platform guards, clean stdout, the pinned runtime with SHA-512 lockfile integrity and no install scripts, upstream session disposal on disconnect and signals, command sessions that never rerun on their own, and the localized receipt/path checks in `session.mjs` described below.
- **Guidance only (Agent Skill)**: approval handling, treating terminal output as untrusted, staying in the authorized workspace, not leaking secrets, not duplicating submissions, cleanup. A model or client can ignore these rules; keep the client's own approval gates and sandbox features enabled.

| Threat | Mitigation | Residual risk |
|---|---|---|
| Prompt injection in terminal output, project files or another agent's replies | Skill rule: screen text is untrusted data; E2E fixture `inject` | Depends on model compliance |
| Accidental persistent approval ("always", "trust all") | Skill rule and `references/authorization.md`; E2E approval scenario | Depends on model compliance |
| Commands outside the intended workspace | Skill rule; `--cwd` documented as a default only | No technical boundary: use a container or VM for isolation |
| Credential exposure | No secrets in chat, `env`, markers or reports; attach command for human input | Secrets printed on screen are visible to the agent and in screenshots |
| Duplicate or repeated destructive commands | Submit-once rule, fresh nonce markers, recovery procedure; engine never reruns command sessions | Shell sessions accept whatever the agent types |
| Abandoned sessions and descendants | Disposal on disconnect and signals; `terminal_destroy` for owned sessions | Forced kills and detached grandchildren can survive |
| Reading session output through attach endpoints | Unix: socket directory `0700`, socket `0600` | **Windows**: the named pipe `\\.\pipe\terminal-use-<pid>-<id>` was observed with the default DACL granting Read to Everyone and Anonymous Logon, and the server replays the screen to any client without a handshake. Cross-account access was not reproduced. Avoid shared Windows hosts or keep secrets off screen until upstream restricts the pipe ACL |
| Tampered or substituted dependencies | Exact pin, SHA-512 integrity for all 25 locked packages, `--ignore-scripts`, Dependabot | The native `@lydell/node-pty` dependency is a prerelease (`1.2.0-beta.15`) chosen upstream |
| Installer damaging client configs (`install.mjs`) | Runs only when the user starts it; touches only installed clients and only gentle-terminal entries; files with comments or unknown layouts are left untouched; timestamped backup, atomic write and read-back per file; skill links are never removed recursively; `--update` only fast-forwards its own checkout; `--dry-run`; `tests/install.test.mjs` against a temporary home | JSON files it rewrites are re-serialized (indentation, BOM and line endings kept; duplicate keys collapse). A client writing the same file at the same moment can overwrite the change: close clients first or rerun |
| Secrets or private paths in the repository or archive | `files` allowlist and home-path scan in `tests/export.test.mjs` | Scan targets home-directory paths only |

## Cursor workspace allowance receipts

`session.mjs allow` requires explicit consent for a **persistent** allowance until revoked, including across client restarts; conversation-only consent is insufficient. Without that consent, use Cursor's Run once dialog. No expiry, automatic renewal or task-end revocation is implemented.

- `status` checks the workspace entry, **not Cursor's effective runtime settings**. It distinguishes recorded presence, user-managed entries, absence and drift. With a stale receipt, `allow` fails rather than silently granting permission again; `revoke` clears stale recovery state without renewing it.
- Recovery is recorded before permission installation. Receipts are validated, backup operations use an internally derived path, and legitimate legacy workspace aliases remain revocable. Unchanged files can be restored byte for byte from the backup; otherwise revocation removes only the script's entry and preserves unrelated settings. User-managed entries without a receipt are not revoked.
- Detected symlinks/junctions, dangling links and unexpected types in managed permission/receipt/backup surfaces are refused before use. Workspace aliases themselves are supported. Invalid receipts fail without changes; inspect retained recovery artifacts after errors rather than deleting or substituting paths blindly.

These checks require a **single writer**, no concurrent settings edits and a trusted workspace. They are not race-proof, do not catch every reparse-point type, and are not a sandbox or proof of installed-Cursor behavior. Windows junction recovery was verified; ordinary file-symlink creation returned EPERM, leaving that probe untested. Focused receipt tests and independent security checks do not establish native macOS/Linux or effective Cursor integration coverage. See the [efficiency evidence and remaining checks](docs/efficiency.md).

The Windows named-pipe limitation above remains unresolved upstream: receipt protections and skill guidance do not restrict pipe ACLs or prevent other local accounts from reading output. Keep client approval gates enabled and avoid shared Windows hosts or secrets on screen.

## Safe testing

The test suite and smoke test make no model or network calls, never request elevated permissions, run no destructive commands on the host, and keep scratch state in the OS temp directory. Real-agent evaluations (`evals/activation.json`) must use a throwaway directory and must not accept trust or settings prompts that persist to the client's global configuration without the user's consent.
