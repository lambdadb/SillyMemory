# Natural dialogue live runner and review

The [frozen protocol](natural-dialogue-evaluation.md) and fixture remain unchanged.
That document's status describes the original preparation milestone. This runner
adds actual SillyTavern, LambdaDB and OpenAI execution; semantic annotations are a
separate review step. See the [completed retry-enabled run](natural-dialogue-results.md)
for all 64 answers and provisional findings. No extension runtime or retrieval policy changes are part
of this work.

## Reproduction

Use Node.js 20.12 or newer, installed development dependencies and Playwright
Chromium. Prepare an isolated checkout of SillyTavern at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Its
`public/scripts/extensions/third-party/sillymemory` symlink must resolve to this
extension checkout. The runner creates a temporary host data profile and enables
the built-in proxy for that process. No personal host profile is used.

```sh
node scripts/natural-dialogue.mjs --output artifacts/natural-plan.json
ST_SOURCE=/path/to/isolated/pinned/SillyTavern \
  SM_ENV_FILE=/path/to/existing/.env.local \
  SM_NATURAL_PLAN=/absolute/path/to/artifacts/natural-plan.json \
  SM_ARTIFACT_TAG=unique-run npm run test:natural:live
node scripts/natural-summary.mjs artifacts/generation-natural-unique-run.json \
  --output-dir artifacts/natural-review-unique-run
```

The existing environment file must contain `LAMBDADB_BASE_URL`,
`LAMBDADB_PROJECT_NAME`, `LAMBDADB_PROJECT_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
and `LLM_API_KEY`. The frozen endpoint/model are `https://api.openai.com/v1` and
`gpt-4.1-mini-2025-04-14`; availability is checked before creating collections.
Do not copy credentials into the checkout or pass them in command arguments.

Execution makes up to **64 paid generation attempts**, spaced at least 15 seconds
apart at the actual upstream send (including retries), plus live LambdaDB
collection/index/query/delete operations and managed embedding usage. By default there is no retry, suffix resume, answer substitution or model
substitution. The opt-in [transport amendment](natural-dialogue-retry.md) permits
bounded 5xx retries; use `npm run test:natural:live -- --retry-transient` with a
new artifact tag. It permits 72 total attempts for the same 64 answers. Allow roughly 20 minutes, potentially longer for
remote service latency. A failed run remains failed even if cleanup succeeds.
Do not start a replacement run solely to obtain a better answer.

The exporter/fixture/protocol/runtime hashes must match the frozen plan. The
runner also records its own source hashes at startup and checks them again at
completion. Each sample gets a fresh chat identity and exactly restored source.
Only source and question enter the host; the answer oracle stays outside the
browser. Test-only wrappers observe retrieval results without replacing them.
Checks cover current local document IDs/text, host-tokenized memory limits,
actual outgoing memory/recent text, frozen parameters, complete provider output,
and unchanged saved source. Full baseline inclusion is measured, not assumed.

Reports contain synthetic prompts and answers, query rankings, selected document
IDs, provider token usage, request statuses and monotonic timing. Request counts
separate setup, initial synchronization, generation and cleanup. Retrieval timing
includes synchronization performed by the retrieval path; generation timing
includes host prompt preparation and retrieval, so these are not additive cost
components. New reports also record each attempt's `upstreamStartedMs` on a shared
monotonic clock and its `spacingWaitMs`. `generationElapsedMs` includes all waits;
`generationMs` subtracts only the initial spacing wait, retaining retry delays.
The runner and summarizer enforce the 15-second send interval. Historical reports
without this evidence have `providerSpacing.verified: false`; see the
[historical spacing correction](natural-dialogue-results.md#execution-and-transport).
Managed embedding usage and cost remain unknown (`null`). A model
listing check and LambdaDB calls do not count as generation attempts.

Each completed sample atomically checkpoints an **incomplete** report. Final
success requires the browser/host secret audit and verified owned collection
cleanup. Reports refuse name reuse. Pending resource files retain only ownership
metadata and a connection hash; keep them after failed cleanup and use the same
connection to verify ownership before deletion. Temporary host data is removed
at shutdown. Never treat a checkpoint or pending-cleanup report as a completed
quality evaluation.

## Human review

Score imports include 32 `paired` case/repetition comparisons and `pairedSummary`
counts. `strictPassDelta` is on minus off (pass = 1, fail = 0); improved/tied/regressed
refer only to this frozen strict criterion. Each pair retains both semantic labels
and unsupported-assertion flags, including when both fail. The importer does not
invent a numeric ordering for partial, incorrect and abstained answers.

The summary command validates all 64 sample identities, complete responses,
request bounds, source hashes, available provider-spacing evidence and cleanup.
It creates three files:

- `summary.json`: retrieval, token and timing measurements; semantic gate is null.
- `blind-review.json`: randomized review IDs, source, question, rubric and answer;
  mode, repetition and retrieval evidence are omitted.
- `review-key.json`: mapping to sample identity. Keep this away from the reviewer
  until annotations are final.

In the blind packet, identify `reviewer`, keep `reviewerType: "human"`, and fill
`outcome`, `unsupportedAssertion` and a short `rationale` for each answer. Outcomes
are `correct`, `partial`, `incorrect`, `abstained` or `unknown-handled`, following
the frozen semantic rules. Do not modify source, rubric, answer or review IDs.
Ambiguous answers stay unscored pending a second reviewer. Import finalized
annotations with:

```sh
node scripts/natural-score.mjs artifacts/generation-natural-unique-run.json \
  artifacts/natural-review-unique-run/blind-review.json \
  artifacts/natural-review-unique-run/review-key.json \
  --output artifacts/natural-human-scores.json
```

The importer binds annotations to the exact report and every answer, rejects
missing/duplicate annotations, and reports both conditions and repetitions.
Assistant assessments must use `reviewerType: "assistant"`; their gate is explicitly
provisional and the human semantic gate remains null. The tooling cannot certify
who edited a file or enforce reviewer independence. A blinded file alone is not
proof that its reviewer never saw the mapping or answers elsewhere.

## First live attempt — 2026-09-28

The runner used the original pre-execution plan, SHA-256
`481fc81148ad1a6d306cfcae9bb492314a7e2e69b9c6b486fe4974d68b441f1c`.
Fixture hash remains
`17fa71452939ed093a5e16e67973a17380e806eade85ebe9754ff0a904e0555e`.
All recorded runtime and harness files matched their start/end hashes and the
runner files at commit `54c46f9`. This is an **incomplete failed run**,
not a completed natural-dialogue quality evaluation.

| Observation | Result |
| --- | --- |
| Planned answers / maximum generation attempts | 64 / 64 |
| Actual generation attempts | 22, no retry |
| Completed samples | 21: 11 off, 10 on; first repetition only |
| Failed sample | `en-workshop-reference/r1/on` |
| Failure | OpenAI HTTP 500 after 30,609 ms |
| Provider message | “The server had an error while processing your request. Sorry about that!” |
| Remaining unattempted samples | 42 |
| Completed integrity checks | 224 |
| Maximum completed-sample injection | 796 / 800 host tokens |
| Completed off samples with truncated source | 0 / 11 |
| LambdaDB requests, including transport gate and cleanup | 91 |
| LambdaDB transport failures / HTTP 5xx | 0 / 0 |
| Owned test collections | Both confirmed inaccessible with HTTP 404 after cleanup |
| Pending cleanup record | Removed after verification |
| Completed quality summary / human semantic score | Neither available |

The upstream error is directly recorded by the test bridge. It is not evidence
of an ANN, managed-embedding or memory-quality failure. Its underlying provider
cause is unknown. The host/browser failure record is deliberately generic;
`generations[-1].upstreamStatus` and `providerError` carry the specific evidence.
No response or successful sample was fabricated for the failed request.

All completed samples passed source preservation, provider/saved-answer equality,
recent retention and frozen-parameter checks. The 10 completed on samples passed
current-document and exact host-token-budget checks. These are partial integrity
observations only. No answer-quality rate is published from this unbalanced prefix;
the normal summarizer rejects it and creates no blind scoring packet. Cleanup
success does not convert the report to `passed: true`.

The run stopped before its final browser/persisted-host-settings secret audit.
A separate post-run scan confirmed neither configured API key occurs in local
artifacts; this narrower check does not stand in for the skipped browser audit.
Temporary host data was removed. Managed-embedding charges remain unmeasured.

The unit suite passes **79 tests** on Node.js 20.12.0 and 24.15.0. New regressions
cover frozen-plan tampering, failed/partial/retried/duplicated reports, source and
answer mismatches, blind packet separation, and human versus assistant scoring.
Runtime and all development-script/test syntax checks and release metadata pass.
The answer fixture, frozen protocol and extension runtime are unchanged.

This attempt required a separately initiated full run with a new artifact tag.
That [replacement run has now completed](natural-dialogue-results.md); the failed
run remains intact. No successful suffix was appended. Independent human
meaning-based scoring remains subsequent work.

Local ignored evidence (available only in the validation checkout):

- [Raw failed run](../artifacts/generation-natural-v1.json)
- [Run log](../artifacts/natural-v1.log)
- [Source, credential and cleanup verification](../artifacts/natural-v1-verification.json)
- [Node 20 tests](../artifacts/unit20.log)
- [Node 24 tests](../artifacts/unit24.log)
