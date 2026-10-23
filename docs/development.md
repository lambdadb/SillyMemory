# Development and verification

For installation and everyday use, start with the [README](../README.md).
Use [CONTRIBUTING](../CONTRIBUTING.md) for branch, PR and evidence-retention rules.
The current runtime and synthetic regressions are maintained here; retired
experiments are recovered at their producing revisions, not run through current CI.

## Local setup

Use Node.js 20.12+ and SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. For host checks, point
`public/scripts/extensions/third-party/sillymemory` at the worktree under test.
Use a separate disposable host checkout for another worktree; do not replace an
existing installation or copy credentials into the checkout.

```sh
npm ci
npm run check:sdk
npm test
npm run check
npm run check:release
python3 -m unittest discover -s tests -p 'test_*.py'
npx playwright install chromium
```

CI runs syntax and unit/protocol checks on Node.js 20.12.0 and 24. It uses no
service credentials and does not establish live integration or answer quality.

## Browser and emulator checks

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:browser
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:faults
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:recovery
ST_SOURCE=/absolute/path/to/pinned/SillyTavern node scripts/prompt-delivery-smoke.mjs
```

These use real Chromium and the pinned host with synthetic data, local LambdaDB
and completion fixtures, and disposable profiles. They make no paid service calls.
The browser harness checks connection, per-chat memory, checkpoints and native
reply behavior. Fault/recovery modes check cancellation, uncertain writes,
reloads and cleanup. The prompt-delivery harness checks final archive/input
preservation, context pressure, repeated citations and same-message assembly.
Reports and screenshots go to ignored `artifacts/`; model fixtures do not grade
answer quality. See [prompt delivery](prompt-delivery.md) and
[native workflows](native-chat-workflow.md) for interpretation.

## Live service checks

Use an existing ignored credentials file containing `LAMBDADB_BASE_URL`,
`LAMBDADB_PROJECT_NAME` and `LAMBDADB_PROJECT_API_KEY`. `SM_ENV_FILE` selects a
file outside this worktree. Never commit it or personal chat data.

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/evaluation.env npm run test:collections:live
ST_SOURCE=/absolute/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/evaluation.env npm run test:live:faults
ST_SOURCE=/absolute/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/evaluation.env npm run test:generation
```

These contact LambdaDB and consume managed-service allowance; run only within an
authorized bound. Collection checks create at most four small synthetic collections
and verify owned deletion. The generation smoke uses a local deterministic model
by default while exercising actual host generation and live memory. It covers
edits, swipes, streaming, branches, deletion and retrieval-failure aborts.
Pending cleanup records under `artifacts/` must survive until cleanup succeeds.

`npm run test:generation:live` additionally requires `LLM_BASE_URL`, `LLM_MODEL`
and `LLM_API_KEY`, with optional `LLM_REASONING_EFFORT`. It uses the host's Custom
Chat Completions path through a loopback test bridge; provider keys remain in the
Node process. Requests are spaced at least 15 seconds apart, use a 256-token
completion limit and allow at most one HTTP 503 retry per run. This narrow
synthetic-fact smoke is not a broad answer-quality evaluation. `SM_ARTIFACT_TAG`
keeps reports separate; reusing a completed tag overwrites its report. The runner
accepts only `--live-model`; unsupported flags fail before credential access.

## Benchmarks and performance

[benchmark/](../benchmark/README.md) contains the frozen LongMemEval-S and BEAM
profiles, recorded results and prepare/run/verify commands. Public dataset inputs,
source locks, evaluator rules and cleanup guards remain part of reproduction.
The [400-character summary comparator](segment-summary-evaluation.md) retains its
separate protocol and source dependencies. Do not pool its 50 questions with a
500-question run or extrapolate accuracy.

The [branch/checkpoint report](branch-checkpoint-cost.md) defines performance
boundaries and the disposable-host runner. Timing data depends on its producing
revision and environment; unit tests are not server-performance measurements.

See [architecture](architecture.md), [current defaults](conversation-memory-defaults.md),
[memory evaluation](memory-evaluation.md) and [evidence recovery](evidence-retention.md).
