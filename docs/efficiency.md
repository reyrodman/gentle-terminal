# Adaptive efficiency: evidence and remaining work

**Proposed 1.4.0, unreleased; local measurements and integrated checks passed. Real-client/model and cross-platform proof remains outstanding.** This compatible work reduces instruction bytes and improves measurement and receipt safety, not the upstream engine. It does not establish 20% total-token savings or p95 noninferiority. Safety and verified completion take precedence over shorter output.

## A. Architecture and default contract

| Component | Responsibility and dependencies |
|---|---|
| Client → `launch.mjs` | MCP stdio; Node >=22.12 guards; same-process import of pinned engine; forwards arguments, signals and exit codes; normalizes empty/dumb TERM |
| `runtime/package.json`, lockfile | `terminal-use@0.2.1`, registry integrity; installed per platform with scripts disabled; no dependency or lockfile changes |
| Upstream engine | PTY (`@lydell/node-pty`), terminal emulator (`@xterm/headless`), PNG rendering (`@napi-rs/canvas`), MCP server; see [notices](../THIRD_PARTY_NOTICES.md) |
| `install.mjs` | Explicit installation/update, config backups and skill links; no automatic config changes in this feature |
| `session.mjs` | Explicit Cursor workspace allowance and revocation, with a local recovery receipt; not a session sandbox |
| `SKILL.md`, `references/` | Model-followed routing, consent, eleven states, single submission, verification; specialized context loaded on demand |
| `tests/`, `smoke.mjs`, `bench/`, `evals/` | Deterministic fixtures and transport checks, measured harness traffic, separately model-dependent evaluations |

All **13** tools remain available by default: `terminal_create`, `terminal_type`, `terminal_press`, `terminal_batch`, `terminal_wait`, `terminal_read`, `terminal_screenshot`, `terminal_click`, `terminal_scroll`, `terminal_list`, `terminal_resize`, `terminal_reset`, `terminal_destroy`. Parameters and responses remain upstream; launcher, engine and lockfiles are unchanged. No adapter or schema edits were implemented.

The observed canonical tools/list SHA-256 is `a1b9370f5cf12116e5b0654caca6ec6803f4bbd8e003b18f3aa1550908bf091a`. `bench/metrics.mjs` sorts object keys recursively but preserves array order; compare digests, names and schemas, not count alone. Exact tool-array equality (schemas, descriptions, annotations and order) was verified by launching both the base-revision launcher and candidate against the unchanged installed runtime; both exited 0 with clean protocol stdout.

## B. Audit: costs, opportunities and rejected changes

Cost categories: **A discovery** (catalog/metadata), **B activation** (skill/references), **C operation** (responses/screens), **D reasoning** (redundant decisions), **E latency** (startup, waits, tools, model). Bytes and tool counts are proxies, not billed usage; clients need not put the whole catalog into every model request.

| Cost / cause | Evidence path and observation | Estimated impact | Change risk / priority |
|---|---|---|---|
| A: upstream tool catalog | `bench/bench.mjs`: baseline tools/list 24,828 B | Client-dependent; no default catalog saving measured | High for schema changes / P2: investigate client loading first |
| B: repeated operating instructions | `SKILL.md`, `references/workflow.md`: 7,679 → 6,486 B | 1,193 B, 15.5% smaller activation file; not total tokens | Medium: lost rules / P1: progressive disclosure with policy tests |
| C/D: unnecessary terminal activation | `SKILL.md` Activation; `evals/activation.json` non-activation cases | Avoid entire interactive session for simple files/commands; unmeasured model gain | Low / P1: direct file and ordinary shell tools |
| C/E: redundant read after returned screen | `SKILL.md` Efficient loop; baseline legacy vs optimized | Existing four-to-one-call pattern predates this work | Medium: insufficient evidence / P1: reuse only sufficient response |
| C: oversized simple-shell screens | `bench/bench.mjs`: experimental 12 vs 40 rows | 44.2% smaller task response, but 16.6% worse sampled p95; may obscure errors | Medium / P2: experiment only, expand evidence when needed |
| D/E: repeat interpretation of unchanged screen | `references/workflow.md`: bounded per-session ledger | Less repeated context; no reasoning-token measurement | Medium: false completion / P1: retain sent status and evidence |
| E: waits mistaken for completion | `SKILL.md`, `references/windows.md`, `tests/supervision.test.mjs` | Prevent incorrect success or duplicate work; no latency promise | High / P1: fresh markers, bounded waits, no resubmit |
| Safety: stale Cursor permission receipt | `session.mjs`, `tests/session.test.mjs` | Prevent silent renewal and unsafe receipt/path use; no token estimate | High / P1: validate, detect drift, explicit revoke |

**Discarded or deferred:** arbitrary truncation and punctuation stripping can hide errors or alter intent; smaller default TUI dimensions lack validation; automatic retries can duplicate work; broad batching crosses approval/unknown-state boundaries. No polling shortcut treats silence as success. No extra LLM optimization calls, runtime dependencies, upstream patches, dynamic per-task server catalog or experimental server adapter were added. Process-tree/OSC completion and Windows pipe ACL fixes require separate upstream work.

Client options, not enabled by this change:

- [Claude Code MCP tool search](https://code.claude.com/docs/en/mcp): deferred client loading can reduce discovery context, depending on client version/provider. Verify support and usage rather than assuming full-catalog billing.
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/): `enabled_tools` / `disabled_tools` are explicit static filters that exclude capabilities. They are not equivalent to retaining all 13 tools; require user configuration and task-specific assessment, never the default here.
- [MCP tools specification, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools): capabilities, pagination and `listChanged` support tool discovery and change notification. It does not forbid all dynamic tools. Any future adapter needs separate identity/opt-in, authorization and compatibility tests; avoid gratuitous schema/order churn that harms caching.

## C. Actual implementation

| Revision / files | Delivered mechanism |
|---|---|
| `fdf2859`: `bench/bench.mjs`, `bench/metrics.mjs`, benchmark tests/docs and export list | Request/response wire accounting, text-only estimates, null unavailable metrics, tool digest, verified intentional exit 3, alternating strategies, CLI validation and cleanup |
| `97872a8`: `SKILL.md`, supervision/client references, fixture/tests, `evals/activation.json` | Compact on-demand guidance; exact literal-input preservation; bounded ledger; two additional model evaluation definitions; no smaller runtime default |
| `e909aa1`: `session.mjs`, session/installer tests, client guidance and changelog | Receipt-before-permission recovery, derived backup path, drift detection, managed-path link checks, and corrected legacy alias receipt compatibility |
| Documentation integration | This report, portable benchmark evidence, README, security guidance and prompts; integrated suite and export/privacy checks passed |

All eleven states remain: STARTING, READY, RUNNING, AWAITING_HUMAN, AWAITING_PROGRAM_INPUT, IDLE, COMPLETED, FAILED, EXITED, RECOVERING, UNKNOWN. Standard and Automatic consent modes remain; uncertain mode or unsafe composer input requires stopping, not rewriting the request.

## D. Before/after measurements and reproducibility

Baseline: clean `main` at `8e2cecf8710b1e1197049def90895e1db1b1b173` (1.3.0), Windows x64, Node **24.16.0**, terminal-use 0.2.1, MCP stdio test client, 15 repetitions. This does not identify an installed product client or model. Candidate source revision: `e909aa1`, on `feat/adaptive-efficiency`. Both reports completed with exit 0. [Portable evidence](../bench/results/efficiency.json) preserves comparable counters, timings, resource snapshots and limitations without host identifiers. Raw reports/logs remain in excluded `.test-runtime/efficiency/`. These sequential runs are not a randomized cross-revision experiment; the new harness changes ordering, marker lengths, screen clearing and shell count.

| Metric | Baseline JSON | Candidate final 15-run report |
|---|---|---|
| Skill activation bytes | 7,679 | 6,486 (file measurement; -15.5%) |
| tools/list response bytes | 24,828 | 24,828 (unchanged) |
| Cold initialize p50 / p95 / p99 ms (10 starts) | 392.7 / 404.2 / 404.2 | 436.8 / 493.3 / 493.3 |
| Legacy calls / output bytes per task | 4 / 3,803.7 | 4 / 3,879.6 |
| Legacy p50 / p95 / p99 ms | 536.2 / 712.8 / 712.8 | 534.6 / 689.1 / 689.1 |
| Optimized calls / output bytes per task | 1 / 1,120.9 | 1 / 1,099.0 |
| Optimized p50 / p95 / p99 ms | 313.4 / 338.0 / 338.0 | 326.0 / 390.8 / 390.8 |
| Adaptive 12-row calls, input/output bytes, p50/p95/p99 ms | Not present | 1 call; 285.7 / 612.7 B; 328.5 / 455.5 / 455.5 |
| Request wire bytes per task | Not recorded | Legacy 685.6; optimized 286.7; adaptive 285.7 B |
| Server idle RSS / idle CPU per 5 s | 107.2 MB / 0 ms | 108.0 MB / 0 ms |
| Server loaded RSS | 375.8 MB with six shells | 387.8 MB with seven shells, not like-for-like |
| Harness completion/errors/retries/duplicates | No explicit counters in old JSON | 45/45 fresh-marker completions; 0/0/0 |
| Billed model input/output tokens and total-token savings | Unmeasured | null: no model invoked |
| Per-task CPU/memory; independent false-positive rate | Unmeasured | null: server snapshots only; no ground-truth evaluator |

The old baseline also measured tail `terminal_read rows=8` at 465.9 B versus full read at 1,010.9 B. Screenshot response averaged 76,473 B: its old byte-to-token conversion is **not** an image-token measurement and must not be reused.

The new small-shell experiment runs the same 30-line job at 120 columns with **12 vs 40 rows**, fresh split-literal markers and expected exit 3; forward/reverse strategy order alternates each repetition. Submission through marker verification is timed; creation and clearing are excluded equally. Compare adaptive against optimized, not legacy. Both legacy and optimized already existed at baseline: four-to-one calls is not a new gain. The 15-run candidate experiment reduced response bytes **44.2%** (1,099.0 → 612.7), but sampled p95 worsened **16.6%** (390.8 → 455.5 ms). The small-row recommendation is therefore **not promoted to a default**; no latency win or noninferiority is claimed. Cold initialization and unchanged 40-row strategy also sampled slower than baseline; with unchanged runtime/launcher and altered harness setup, causality is not established. At n=15, both p95 and p99 are sample maxima, not stable population-tail estimates.

For a reproducible rerun, follow [benchmark instructions](../bench/README.md): preserve the baseline, choose a distinct candidate output, record revision, use the same machine/runtime/stdio client/environment and 15 repetitions (`node bench/bench.mjs --runs 15 --json result.json`). Use an authorized scratch/output location; never overwrite the baseline. Compare old `bytesAvg` with new `outputWireBytesAvg`; the old report lacks request accounting. New estimates are rounded UTF-8 **text** bytes/4, excluding images and envelopes; discovery/on-demand reads, notifications, stderr, model reasoning and provider billing are not fully represented. Report p50/p95/p99, counts, errors and verification costs together, not a single favorable size.

## E. Security evidence and boundaries

Baseline `npm test`: **54/54**; baseline smoke, bench and verify exited 0. Reported focused candidate evidence: session **21/21**, skill/supervision **24/24**; independent security verification found and corrected a legacy-v1 alias receipt regression, then **5/5 targeted checks plus actual baseline/public probes** passed. Final integrated `npm test`: **74/74 passed**, no failures or skips, including export allowlist, packaged-link and privacy checks. `npm run smoke` and `npm run verify` both exited **0**; verify repeated all 74 tests and confirmed owned-shell cleanup. These are local deterministic results, not real-model or cross-platform certification. Candidate benchmark: exit 0, 45/45 marker-verified tasks, server shutdown 0 and zero non-JSON stdout lines.

`session.mjs status` inspects the workspace file, not effective Cursor runtime permission. It distinguishes recorded presence, user-managed entry, absence and drift; stale `allow` fails instead of renewing permission. Revoke restores unchanged bytes from the validated derived backup when available, otherwise removes only its recorded entry while preserving unrelated edits; stale receipt cleanup does not grant permission. Malformed receipts and detected unsafe managed paths fail closed. Legitimate workspace aliases remain supported.

These are filesystem protections, not installed-Cursor integration, hostile-workspace isolation or race-proof multiwriter handling. Run one writer, avoid concurrent edits, inspect retained recovery artifacts after failure. No automatic expiry or task-end revoke was added: explicitly authorized allowances persist across restarts until revoked. Conversation-only consent is insufficient for Cursor's persistent allowance. Standard/Automatic rules, secrets, injection defense and submit-once behavior remain **model guidance**, not engine enforcement; keep client approval gates enabled.

`--cwd` is only an initial directory; the engine runs with user privileges. Windows attach named-pipe default ACL/read-replay limitations remain upstream and unresolved; instruction changes do not fix ACLs. Avoid shared Windows hosts and secrets on screen. See [SECURITY.md](../SECURITY.md).

## F. Compatibility: observed versus planned

| Surface | Evidence in this work |
|---|---|
| Windows x64 / Node 24.16.0 / stdio harness | Baseline and 15-run candidate measured; final 74/74 tests, smoke and verify passed; Windows PowerShell fixture evidence, not blanket shell/client coverage |
| Windows junction aliases | Verified, including legacy receipt recovery; ordinary file symlink creation returned EPERM, so that probe remains untested |
| Windows 11 native installed clients, OpenCode, Codex, Cursor | Not executed for this feature; simulated input-mode fixture is not native-client proof |
| Linux/macOS and Node 22; other architectures | Not executed locally for this feature; CI definition is not a current passing result |

[CI configuration](https://github.com/reyrodman/gentle-terminal/blob/8e2cecf8710b1e1197049def90895e1db1b1b173/.github/workflows/ci.yml) schedules Ubuntu/macOS/Windows on Node 22/24, plus Ubuntu ARM64 and Windows 11 ARM64 on Node 24. It runs setup, launcher version, tests and smoke, not model evaluations. Existing historical client observations in references are not new compatibility results. PowerShell, modern PowerShell, cmd and POSIX syntax need native checks in the selected shell; no blanket shell-coverage claim follows from a fixture pass.

### Reproduce real model and native-client evaluations

1. Obtain explicit permission for model usage and an isolated disposable workspace/config scope. Do not install clients, supply credentials or change persistent trust automatically. Record actual OS/build/architecture, shell, Node/runtime, client/version, model/provider, revision, MCP config, mode/consent and loaded skill/references; redact private paths and secrets in exported evidence.
2. Run **each of the 25 cases** in [activation.json](../evals/activation.json): the 23 original cases plus `literal-input-preservation` and `unchanged-screen`. Present each exact prompt in a fresh controlled conversation (retain declared prior state for continuation cases). For `fakeAgent` cases, use the indicated fixture scenario as the target of the real supervising model, not as a substitute for that model.
3. Save ordered tool requests/responses, screens, sent-input count, decisions/approvals, timing, actual provider input/output usage when available, independent artifact checks and exit status. Score every `activate`, `expect` and `mustNot` item; mark blocked/unavailable **not run**, never passed. Compare baseline and candidate under matching conditions; report errors, retries, duplicates and false completions as well as cost.
4. Separately on **native Windows 11**, exercise Windows PowerShell, installed modern PowerShell and cmd: persistent environment, native nonzero exit marker, quiet long work, long output/tail expansion, TUI dimensions, disconnect/cleanup, and Unicode/path-with-spaces. Record unavailable shells, not presumed coverage.
5. In actual **OpenCode and Codex CLI**, inspect delayed startup/trust/update menus, one-time approvals and composer mode before sending a harmless approved task exactly once. Test literal `!`, `/`, `@`, `#`, leading/trailing spaces and paths using only the actual version's verified literal-input capability. If unavailable, stop without Enter and score the limitation; the fixture's Ctrl+L is not a universal shortcut. Independently inspect artifacts, test unchanged-screen handling and natural exit. Do not accept onboarding, hooks, installs or persistent settings without explicit consent.
6. For installed Cursor only with explicit persistent consent, probe allow/status/drift/revoke in a disposable workspace and verify effective prompts in the UI. File-state success alone does not prove runtime behavior. Restore approved settings and report any remaining permission/session.

None of these model/native scenarios was run by this documentation task or established by deterministic fixtures.

## G. Updating without silently changing consent

This is a proposal for **SemVer 1.4.0**, not a release; package version remains 1.3.0. When a reviewed version is available, close clients, inspect local changes and back up configs. Review `node install.mjs --dry-run` before approving installation. `npm run update` fast-forwards only the current checkout's branch and refuses dirty/diverged checkouts; use the intended reviewed branch rather than assuming it changes branches for you.

The installer preserves other server/settings entries, repoints existing gentle-terminal entries with their names/extra arguments, backs up changes and leaves unsupported formats for manual review. Reinstall the pinned runtime per OS/architecture; never copy node_modules. Reload clients and verify MCP status plus a bounded probe. Do not reset user consent or run `session.mjs allow` as an update step. Existing allowances remain until explicit `revoke`; inspect `status` for each approved workspace and use Run once when no persistent consent exists. Keep recovery files private and uncommitted. See [update instructions](../README.md#updating) and [client limits](../references/clients.md#tool-call-confirmations).

## H–I. Limits and final disposition

**Local checks passed:** 74/74 tests, smoke, verify, package/export/privacy/link checks, and exact tool-array comparison. **Outstanding proof:** real-model/client evaluation, native non-Windows runs and ordinary file-symlink probes blocked by EPERM. No total-token or p95 target is declared met. The upstream `MaxListenersExceededWarning` occurred in both completed benchmark reports; it remains visible on stderr and was not suppressed or fixed. Both benchmark servers exited 0 with zero non-JSON stdout lines. The default 13-tool contract is exactly equal.

Demonstrated scope is smaller skill bytes and bounded deterministic safety/measurement work. Actual billed-token reduction, reasoning cost, long/ambiguous/TUI savings, real-client effectiveness, native macOS/Linux behavior and cross-account Windows pipe safety remain unproven. Recommendation: retain the unchanged runtime and default dimensions; review the local commits and run explicitly approved real-client evaluations before a release, any default-sizing change or an adapter. No push, publication, global update or installed-client configuration change was performed.
