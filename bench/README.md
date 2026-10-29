# Deterministic benchmark

Run `node bench/bench.mjs --runs 15 --json result.json` (or `npm run bench -- --runs 15`).
`--runs` accepts integers from 1 through 100, defaults to 15, and rejects invalid values before
creating temporary state or starting a server. `--help` prints options without starting a server.
`--json FILE` writes the same report printed to stdout; choose a new file, never the baseline.

## Reproduce a comparison

Use the same machine, Node version, pinned runtime, stdio client, environment and run count.
Preserve `.test-runtime/efficiency/baseline-bench.json` from v1.3.0. Record the candidate revision
alongside its output. The report captures host, OS, CPU, Node, runtime declaration, launcher hash,
and a canonical tools/list SHA-256, count and ordered names. Object keys are sorted recursively;
arrays retain order. Compare contract digests between runs, not just tool counts. No server
adapter, runtime schema change, client configuration change or model call is performed.

For repository-local checks, create a dedicated excluded temporary directory and set TEMP, TMP,
TMPDIR, HOME, USERPROFILE, CODEX_HOME, XDG_CONFIG_HOME and npm_config_cache there before running.
The benchmark removes its own scratch directory and destroys its own sessions/server in finally,
including on failure. It never retries a task submission after a timeout. A failed marker check
fails the process rather than emitting a successful report. Parent test infrastructure owns the
environment directories; the benchmark only removes the scratch directory it created.

## Interpret measurements

- Input/output wire bytes are separate JSON-RPC request/response line sizes, including newline.
  Notifications, stderr, model messages and transport overhead beyond these lines are excluded.
- Estimated output tokens use **text-only UTF-8 bytes / 4, rounded**. Image/base64 bytes and JSON
  envelopes are not token estimates. Screenshot wire size is measured, not converted to tokens.
  Skill/catalog text estimates are also heuristics, not provider tokenizer results.
- Real model input/output tokens, real-agent evaluations and the billed-token reduction target
  remain `null` with reasons. No real-agent scenario is declared passed by this CLI.
- Latency p50/p95/p99, completed attempts, errors, retries and duplicate submissions describe
  this deterministic harness only. Completion requires a fresh exact output marker showing the
  job's intentional exit code 3. Independent false-positive assessment remains unmeasured.
- Process RSS and CPU are OS samples, not continuous peaks or per-task/model resource usage.
  Unavailable samples are null with a reason. Low run counts are smoke evidence, not stable p99.

## Strategies

All strategies run the identical 30-line Node job and fresh split-literal exit marker at 120 columns.
Legacy uses type/Enter/wait/read; optimized reuses a returned marker and waits only if absent.
**Both existed in v1.3.0**: their four-to-one-call difference is not a new feature gain.
Adaptive uses the optimized strategy with 12 rows rather than 40. Compare adaptive to optimized
for the incremental small-shell experiment. Strategy order reverses every repetition; each task
starts with a cleared screen. Timing/traffic covers submission through completion verification,
not shell creation or clearing (excluded equally). This is an opt-in benchmark strategy, not a
new default or a TUI sizing policy. Long, ambiguous and visual workloads are not evaluated here.

Old ambiguous `tokensAvg`, `activationTokens` and `toolsListTokens` names are replaced with explicit
`estimated...TextTokens...` fields; response bytes are now `outputWireBytesAvg`, with input bytes
alongside them. Compare old baseline byte fields manually; do not compare its image token estimates.
