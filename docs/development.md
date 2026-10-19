# Development and evaluation reference

For installation and everyday use, start with the [README](../README.md).
Historical evaluations below describe their recorded configurations, not a
guarantee for the current release.

## Historical evaluation overview

The [managed recall validation](managed-packed-results.md) completed 64 real
SillyTavern/LambdaDB/model responses. All 28 known-answer memory-on samples
received their required source evidence; provisional answer grading passed 30/32
memory-on samples, including unknowns. Two Korean quotation answers still omitted
the author despite receiving the signature. This is synthetic regression evidence,
not a general accuracy or availability guarantee. See the
[historical quality context](quality-history.md) for earlier limitations.

The subsequent [equal-context three-mode comparison](three-mode-results.md)
records 96 actual-host answers, comparing plain SillyTavern, built-in Vector
Storage and SillyMemory. It reports source delivery, provisional answer scores,
input/cache tokens and latency separately, with explicit native-setting limits.
The [native Insert# sensitivity follow-up](native-tuning-results.md) tests
whether increasing the built-in retrieval count closes that quality gap.
The [built-in Summarize comparison](summarize-results.md) measures rolling
summary fidelity, answer quality and summary-generation overhead separately.
The [segment-summary comparison](segment-summary-evaluation.md) evaluates independent
summaries with recent-three plus LLM-selected-two memory against captured Query1
retrieval on the same 50 LongMemEval-S questions, with fresh paired answers.

The [external benchmark data audit](benchmark-data-audit.md) records pinned
LongMemEval-S and ConvoMem schemas, local token estimates, question selection and
the bounded next pilot design. It contains no new model-quality results.

The [LongMemEval host preflight](benchmark-host-preflight.md) checks the two
development inputs at 32K/128K through the actual host, with local service fixtures.
It records prompt delivery, automatic summary scheduling and import limitations.
The [bounded 32K live pilot](benchmark-live-pilot.md) follows with real OpenAI
and LambdaDB managed embeddings, separate summary costs, and preserved failure
and recovery evidence. Two development questions do not establish general recall
superiority. The [14-question development expansion](benchmark-development.md)
completes 70 host-generated answers with separate setup costs and retrieval-stage
diagnostics. SillyMemory scores 10/14 with 3,361.5 median input tokens; plain 128K
also scores 10/14 with 104,761 median input tokens, while missing different
questions. These development results do not establish general superiority; the
subsequent [42-question held-out evaluation](english-heldout-evaluation.md)
scores 24/42 for SillyMemory, 14/42 for plain 32K and 29/42 for plain 128K.
SillyMemory uses 3,282 median input tokens: a useful token/accuracy tradeoff,
with a remaining full-history quality gap. All 126 new answers and judgments
completed; that evaluation did not change the runtime.

## Development and verification

For local development, symlink this checkout into
`SillyTavern/public/scripts/extensions/third-party/sillymemory`; do not also install
a user-scoped copy. The pinned host is SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Manual copies without Git metadata
cannot use the native Git-based update flow.

Detailed historical reports and producer snapshots live outside the maintained
source tree. [Evidence retention](evidence-retention.md) lists preserved
results, immutable public originals, verified local archives and restoration steps.
Normal CI uses current source and synthetic fixtures; it does not replay old paid
cohorts. Historical commands in evaluation documents use their recorded checkout.

For the chat-collection lifecycle acceptance, run:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local npm run test:collections:live
```

This uses a disposable profile, real settings buttons, native rename/branch/copy,
managed embeddings and direct browser CORS (host proxy disabled). It creates at most four small synthetic
collections, invokes no generation model, and verifies owned cleanup. See
[the validation record](chat-collections.md) for boundaries and retained evidence.


The [evaluation and device-continuity follow-ups](evaluation-and-device-followups.md)
record the limits of the small-context comparisons, default versus experimental
memory settings, proposed 32K/128K validation, local-embedding measurements, and
the work needed to resume the same remote memory from another device. These are
follow-up directions, not new measured results or shipped continuity support.

The [external benchmark selection](benchmark-selection.md) prioritizes
LongMemEval-S and ConvoMem, compares additional memory benchmarks, and records
the data audit, host adaptation and scoring controls needed before paid runs.
No external benchmark results are claimed by this selection record.

The [natural-dialogue evaluation protocol](natural-dialogue-evaluation.md)
provides four frozen bilingual synthetic histories, 16 cases and an offline plan
exporter. The [first live attempt](natural-dialogue-live.md#first-live-attempt--2026-09-28)
completed 21 samples before an OpenAI HTTP 500 stopped request 22. A separate
[completed run](natural-dialogue-results.md) now has all 64 answers, 676
integrity checks and verified cleanup. It used the bounded retry policy but
needed no retries. Review found that the historical run did not verify the required
provider-start spacing; the new speaker runs verify actual upstream starts at least 15 seconds apart. Provisional assistant review flagged four memory-on answers
for unsupported speaker attribution; independent human scoring remains pending.
The [speaker-attribution follow-up](speaker-attribution-results.md) preserves
two unsuccessful 24-answer system-wrapper trials and the separate 32-answer
[native-role evaluation](speaker-native-evaluation.md). Selected excerpts now
replace older eligible prompt messages in their original roles and source order.
World Info may scan these excerpts as ordinary history; interoperability with
World Info and other prompt rewriters remains unverified.

Start ongoing work from `develop` and open feature/fix PRs against `develop`.
Promote validated changes to the public `main` branch through a separate PR.
See [CONTRIBUTING.md](../CONTRIBUTING.md) for the branch and verification workflow.

The GitHub Actions workflow runs unit regressions and syntax checks for the
runtime, scripts, and tests on pull requests and pushes to `main` or `develop`, using the
declared minimum Node.js 20.12.0 and Node.js 24 with the npm lockfile. This workflow
does not use LambdaDB or model credentials.
Browser/emulator checks and paid live integration runs remain separate commands
below; a green CI result alone does not establish live integration success.

See the [SDK migration and next experiment design](sdk-migration.md) for the official client integration and validation boundary.

See the [final local review](review.md) for the commit scope, review fixes,
verification boundaries, and file inventory. Raw `artifacts/` reports are ignored
local evidence and are not included in a fresh clone; checked-in documents retain
the measured results and limitations. Run the corresponding commands to create
new reports. Historical summaries require their exact recorded source versions.

```sh
npm ci
npm run check:sdk
npm test
npm run check
npm run check:release
npx playwright install chromium
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:browser
```

The host extension symlink must point at the worktree being tested; the browser harness rejects a different checkout. Use a separate pinned host checkout for parallel worktrees.

The browser harness starts an isolated SillyTavern on localhost port 18126 (override with `ST_TEST_PORT`), creates synthetic data, and runs a local HTTPS LambdaDB API emulator. It trusts a temporary self-signed test certificate only in that child server process; global TLS verification stays enabled. It does not contact LambdaDB, call an LLM, or use real credentials. Results are written to ignored `artifacts/browser-smoke.json` and `artifacts/settings.png`.

For repeatable failure and recovery checks, run `npm run test:faults`. This extends the real-host browser test with controlled upstream 429/503 responses, the shipped 15-second request timeout, delayed-query cancellation during edits/deletion/branch changes/disable, accepted writes with missing acknowledgements, actual page reload and key re-entry, and deletion while a write is outstanding. The sync-status run also covers 120-chunk partial failure, confirmed-batch retry, overlapping manual sync, and stale progress after cancellation or reload. It passed with no uncaught browser errors or remaining emulator collections; see the validation record for the exact count and tagged report. It uses synthetic credentials and a local emulator; it does not establish actual LambdaDB outage behavior. Review `artifacts/fault-smoke.json`.

To explicitly run the live test, put `LAMBDADB_BASE_URL`, `LAMBDADB_PROJECT_NAME`, and `LAMBDADB_PROJECT_API_KEY` in the Git-ignored `.env.local`. Keep the extension symlink pointing at this checkout, then run:

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:live
```

This exercises the real settings UI, native branches, reload, queryText and
owned-data cleanup against LambdaDB using only synthetic English text. It creates
at most four small owned collections and calls no generation model. Set
`SM_ENV_FILE` to use credentials outside this worktree. Failed cleanup leaves
`artifacts/<tag>/chat-collections-live-pending.json`; preserve it until resolved.
Use `SM_ARTIFACT_TAG` for distinct runs. `npm run test:live:faults` includes
checkpoint recovery after accepted responses are lost; `--checkpoint-manager`
on `scripts/chat-collections-live.mjs` additionally covers the manager controls.
See [current validation and limits](default-story-memory.md).

Historical proxy-path and retrieval-policy runs require their archived producer
revision. They are not compatibility requirements for the current runtime.

To exercise the complete settings, chat, and generation path with live LambdaDB:

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:generation
```

This uses the same LambdaDB credentials, a fresh host on localhost port 18128 (`ST_GENERATION_PORT` overrides it), and a deterministic local response fixture. It exercises generation, streaming, regenerate, swipe and an explicit retrieval-failure abort; records the final outgoing messages; and deletes the owned collections through the extension's UI. The fixture is not an LLM and cannot measure answer quality. Review `artifacts/generation-fixture-model.json`. A failed cleanup leaves `artifacts/generation-fixture-model-pending.json`; resolve those resources before retrying.

For an actual generation model, additionally put `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` in `.env.local`, then run `npm run test:generation:live`. The endpoint must support compatible `/chat/completions` requests and SSE streaming; include the API prefix in the base URL (for example, `https://<provider>/v1`). This sends the successful synthetic generation requests to that provider and incurs model usage. A loopback bridge holds the provider key in process memory; the host only receives the bridge URL. The bridge is test infrastructure, not part of the extension. Logs are suppressed, and the report contains synthetic prompts, provider replies/usage, and request options with known credentials redacted. Live-mode output and pending resource records use `generation-live-model` filenames. Each dispatched live response must complete normally, match the host-saved message, and answer the narrow synthetic fact correctly; this is not a broad quality benchmark. Live runs space actual upstream generation sends (including retries) by at least 15 seconds and use a 256-token output limit. Optional `LLM_REASONING_EFFORT` configures the host request (for example, `low` for the tested Gemini model).

For OpenAI, use the following values with your own API key:

```dotenv
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4.1-mini-2025-04-14
LLM_REASONING_EFFORT=
```

This fixes the [GPT-4.1 mini snapshot](https://developers.openai.com/api/docs/models/gpt-4.1-mini) for repeatability and leaves reasoning effort unset. Run `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:generation:live` to keep its report separate from earlier providers. The optional tag allows letters, digits, dots, underscores, and hyphens (maximum 80 characters, starting with a letter or digit), and applies to both result and pending-cleanup filenames. Use a new tag for each run you want to preserve; reusing it overwrites that tag's completed report.

The earlier Gemini run used `LLM_MODEL=gemini-3.8-flash` and `LLM_REASONING_EFFORT=low`. For Gemini, use `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`. The harness configures SillyTavern's Custom API body exclusions for `frequency_penalty`, `logprobs`, and `top_logprobs`: the live Gemini endpoint rejected the first two fields from the host's generic request. The loopback bridge forwards the resulting request without altering messages. Check [Google's compatibility guide](https://ai.google.dev/gemini-api/docs/openai) and your project's [model availability and free quota](https://ai.google.dev/gemini-api/docs/pricing); a successful model listing alone does not establish generation access.

### Historical answer-quality protocols

The Korean, three-mode comparison, held-out, challenge and natural-dialogue npm
commands are retired from the current package. Their fixed recent-message
protocols require the exact producing checkout recorded in the linked documents
and [evidence index](evidence-retention.md). Do not run those old modes against
the current active-input policy or label their archived results as current scores.
The low-level generation runner rejects these modes before credentials or provider
setup. Original scripts, protocols, reports and scoring remain in recorded source
revisions and verified archives.

The [Korean protocol](korean-evaluation.md) planned 16 model requests, grading
factual replies and measuring provider input tokens and warm generation duration.
The [three-mode comparison](comparison-evaluation.md) used three Korean
histories of 120–240 messages, nine questions and two repetitions: 54 generations
plus embeddings. Native Vector Storage retained other old history, so this was not
an equal-token-budget comparison. Its historical summarizer requires all 54 samples,
matching source/configuration, provider usage and verified cleanup; generation-only
cost excludes embeddings and LambdaDB charges.

The [retrieval diagnostic](retrieval-diagnostic.md) compared four query
constructions and identical-vector server/exhaustive controls. It reproduced all
six old-fact misses with the old query; latest-user-only retrieval selected all
six. This is historical retrieval evidence, not a current answer-quality score.
Reproduction requires its recorded producer and incurs embedding/data usage.

The live harnesses require Node.js 20.12+ for `util.parseEnv`; recorded runs use Node.js 24.15.0.

The historical [challenge protocol](recall-challenges.md) covers ambiguous
references, continuation and overflow with 12 scheduled model requests. The
[held-out protocol](heldout-recovery.md) added 12 counterbalanced cases and 24
answers. Their execution commands require their producing checkout. Current
`npm run test:recovery` remains the emulator-only lifecycle check with two host
SIGKILL/restarts and 24 repeated edit/swipe/delete cycles.

The natural-dialogue runner uses the frozen 16-case English/Korean corpus for
64 real memory-off/on responses. An opt-in [transport amendment](natural-dialogue-retry.md)
allows bounded provider 5xx retries while recording every failure. See [execution and blinded
semantic review](natural-dialogue-live.md) for the fixed model, usage bounds,
cleanup requirements and scoring workflow. Automated retrieval/integrity checks
and assistant annotations do not replace the protocol's human semantic review.

The [long-dialogue protocol](long-dialogue-evaluation.md) adds a separately
frozen 32-answer test with measured context overflow. See [its results](long-dialogue-results.md)
and [offline human-review workflow](human-review.md). Generate a local review
form with `node scripts/natural-review.mjs blind-review.json --output review.html`;
it provides no automatic grades and sends no data over the network.

The [prior-user query comparison and follow-up](context-selection-results.md)
records the v3 selection fix, its fixed-budget evidence and remaining limits.
At the recorded pre-default revision, run `SM_ARTIFACT_TAG=next-selection node scripts/live-smoke.mjs --selection` for
the search-only comparison; the live runner also accepts `SM_ENV_FILE`.

At the recorded v3 revision, run `SM_ARTIFACT_TAG=next-assistant-topic node scripts/live-smoke.mjs --assistant-topic`
for the [assistant-topic query comparison](assistant-topic-evaluation.md).
It shares each distinct query response across the frozen policies and makes no
generation calls; its integrity pass is separate from candidate qualification.

At its recorded revision, the [assistant fallback protocol](assistant-fallback-evaluation.md) runs with
`SM_ARTIFACT_TAG=next-fallback node scripts/live-smoke.mjs --assistant-fallback`.
See its [results and generation commands](assistant-fallback-results.md).

At its recorded revision, the [context-turn protocol](context-turn-evaluation.md) runs with
`SM_ARTIFACT_TAG=next-turn node scripts/live-smoke.mjs --context-turn`.
See its [results and amended generation commands](context-turn-results.md).
The subsequent [fixed-budget passage-selection replay](budget-selection-results.md)
compares five offline candidates; all regress on an existing selected source,
so runtime selection remains unchanged.
The [sentence excerpt follow-up](sentence-passage-results.md) also retains
production behavior: neither fixed candidate preserves all existing required
quotes, and partial parent matches are recorded separately from full coverage.
A [proposed semantic evidence contract](semantic-evidence-contract.md) now
separates answer-bearing spans from mandatory context in 16 fresh short cases.
Its audit validates the evaluator; candidate quality and human review remain unset.
The [long-dialogue direct-path cohort](semantic-direct-results.md) subsequently
completed 64 actual-host answers; its provisional grades do not establish managed
transport recovery. The [context bundle follow-up](context-bundle-results.md)
adds selection diagnostics and two offline neighborhood candidates. Both recover
the quotation gap but lose other required sources, so neither is adopted.

The [context candidate protocol](context-candidate-evaluation.md) compares
the current labelled selector, label removal, and label removal plus adjacent-turn
retention under 400 host tokens. Its recorded producer freezes fixture `actor-candidate-v1`
and runs the historical natural adapter; use that checkout for reproduction. This is a 48-answer controlled prompt
experiment with frozen source indices and generation-time retrieval disabled;
the candidate code is test-only and does not change installed extension behavior.

See [architecture](architecture.md), [pinned contracts](contracts.md), and [validation and remaining checks](validation.md).
