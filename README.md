# SillyMemory

Long-term memory for SillyTavern.

**Powered by LambdaDB**

An installable, experimental UI extension for character chats. SillyMemory keeps recent messages intact at its prompt hook and replaces older plain-text history with relevant source passages under a fixed memory token budget. SillyTavern may subsequently truncate the prompt to fit its context limit. It uses LambdaDB managed embeddings over direct browser HTTPS/CORS. No server plugin or LambdaDB modification is required.

**0.4.0 is an unreleased experimental candidate.**
[Story memory](docs/versioned-memory.md) is automatic for every enabled chat;
[checkpoints](docs/checkpoints.md) are saved and resumed explicitly. Public
`main` still follows its published version. Check [GitHub Releases](https://github.com/lambdadb/SillyMemory/releases)
for publication, and [the default-storage decision](docs/default-story-memory.md)
for this candidate's behavior and validation.

The [managed recall validation](docs/managed-packed-results.md) completed 64 real
SillyTavern/LambdaDB/model responses. All 28 known-answer memory-on samples
received their required source evidence; provisional answer grading passed 30/32
memory-on samples, including unknowns. Two Korean quotation answers still omitted
the author despite receiving the signature. This is synthetic regression evidence,
not a general accuracy or availability guarantee. See the
[historical quality context](docs/quality-history.md) for earlier limitations.

The subsequent [equal-context three-mode comparison](docs/three-mode-results.md)
records 96 actual-host answers, comparing plain SillyTavern, built-in Vector
Storage and SillyMemory. It reports source delivery, provisional answer scores,
input/cache tokens and latency separately, with explicit native-setting limits.
The [native Insert# sensitivity follow-up](docs/native-tuning-results.md) tests
whether increasing the built-in retrieval count closes that quality gap.
The [built-in Summarize comparison](docs/summarize-results.md) measures rolling
summary fidelity, answer quality and summary-generation overhead separately.

The [external benchmark data audit](docs/benchmark-data-audit.md) records pinned
LongMemEval-S and ConvoMem schemas, local token estimates, question selection and
the bounded next pilot design. It contains no new model-quality results.

The [LongMemEval host preflight](docs/benchmark-host-preflight.md) checks the two
development inputs at 32K/128K through the actual host, with local service fixtures.
It records prompt delivery, automatic summary scheduling and import limitations.
The [bounded 32K live pilot](docs/benchmark-live-pilot.md) follows with real OpenAI
and LambdaDB managed embeddings, separate summary costs, and preserved failure
and recovery evidence. Two development questions do not establish general recall
superiority. The [14-question development expansion](docs/benchmark-development.md)
completes 70 host-generated answers with separate setup costs and retrieval-stage
diagnostics. SillyMemory scores 10/14 with 3,361.5 median input tokens; plain 128K
also scores 10/14 with 104,761 median input tokens, while missing different
questions. These development results do not establish general superiority; the
subsequent [42-question held-out evaluation](docs/english-heldout-evaluation.md)
scores 24/42 for SillyMemory, 14/42 for plain 32K and 29/42 for plain 128K.
SillyMemory uses 3,282 median input tokens: a useful token/accuracy tradeoff,
with a remaining full-history quality gap. All 126 new answers and judgments
completed; that evaluation did not change the runtime.

## Supported host

The development baseline is **SillyTavern 1.19.0**, pinned to commit [`06bde939fb1e9c4c8d8641d810f0a916b5bce127`](https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127). Other revisions are unverified. Use a browser with Web Crypto, Web Locks, and `AbortSignal.any` (the automated browser test uses Chromium). Serve SillyTavern on localhost or HTTPS. One active SillyMemory tab per SillyTavern account/browser profile is enforced with a Web Lock.

## Install

1. Prepare SillyTavern **1.19.0** and Git on the host. Other host revisions are unverified.
2. Open **Extensions → Install extension**, enter `https://github.com/lambdadb/SillyMemory`, leave the optional branch/tag field empty, and choose **Install just for me** (or **Install** for a non-admin account). Review SillyTavern's third-party-extension prompt and confirm. The default branch is `main`; `develop` and PR branches are for development. The extension includes its pinned browser SDK bundle; users do not run npm or a build step. Do not install two copies.
3. Allow your SillyTavern page origin in LambdaDB CORS settings where required. Include scheme, host and port (for example, `http://localhost:8000`); `127.0.0.1` is a different origin. SillyMemory connects directly from the browser. No `enableCorsProxy` setting or SillyTavern restart is required. See [direct CORS configuration and validation](docs/direct-cors.md).
4. Reload SillyTavern. Open **Extensions → SillyMemory**. Enter your region-specific HTTPS base origin, project name, and project API key from LambdaDB. The endpoint field accepts an origin such as `https://<regional-host>`, without `/projects/...`. The extension adds the project path. There is no hardcoded global endpoint.
5. Click **Use key for this session**. The input is immediately cleared. The key lives only in the client instance's browser memory, never in saved settings, local/session storage, a URL, or extension logs. A reload or **Forget key** requires re-entry. Other trusted extensions and the browser runtime can still observe network requests; this is not an isolation boundary against malicious extensions.
6. Click **Test synthetic upsert / query / delete**. This creates a dedicated `smtest_<random>` collection, upserts a synthetic story, queries `knn.queryText`, deletes its document, verifies it no longer appears, then deletes the owned test collection. This consumes LambdaDB resources and inference usage. The test must pass before **Prepare chat memory** becomes available.
7. If a test fails, use **Clean up test collection**. Pending test identity is preserved across reloads so cleanup can be retried after reconnecting. A failed cleanup is not reported as successful.
8. Click **Prepare chat memory**, select a character chat, then enable memory. Native branches automatically reuse committed history in separate LambdaDB branches within one story collection. Default settings retain 12 recent messages and allow 800 memory tokens, including excerpt content and source labels; provider message-envelope overhead is managed by the host. Configure the bounds in the panel. Disable built-in Vector Storage chat vectorization and other prompt-rewriting memory extensions for this prototype.

Optionally enter a checkpoint name and use **Save / finish checkpoint** to save the current transcript and memory state. **Refresh story checkpoints** shows names, creation times and verified states, with controls to finish pending saves, resume a new path, rename or delete individual checkpoints. See [recovery, integrity and restore limits](docs/checkpoints.md).

The memory budget applies **per generated answer**, not cumulatively across a
chat. Recent messages and character instructions are separate from that budget.
You can set 64–4,096 memory tokens; the effective limit is also capped at one
quarter of the context size passed by the host. The default 800 is a heuristic,
not an established optimum. It is unrelated to the current 800-**character**
indexing chunks: long messages now prefer paragraph, sentence and word boundaries within that ceiling, without overlap. Exact source text is retained; a sentence longer than the ceiling can still be split. See the
[controlled budget comparison](docs/memory-budget-calibration.md) for evidence
and limitations, and the [design review](docs/memory-design-followups.md) for
chunking and hybrid-search work. The [chat collection lifecycle](docs/chat-collections.md) describes the implemented isolation and cleanup behavior.
The [controlled hybrid comparison](docs/hybrid-retrieval.md) found an answer
regression despite broader candidate coverage, so production retrieval remains
vector-only.
The [budget follow-up](docs/budget-confirmation.md) distinguishes missing
candidates, budget exclusions and wrong answers despite complete evidence;
it does not justify changing the adjustable 800-token default.

For local development, symlink the checkout into
`SillyTavern/public/scripts/extensions/third-party/sillymemory`; do not also install
a user-scoped copy. Manual copies without Git metadata cannot use the normal
Git-based update flow.

## Version and updates

**0.3.0 is an experimental pre-release.** See [CHANGELOG.md](CHANGELOG.md) for changes and
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) for published
versions. A dated changelog entry can precede publication. The `main` branch is
the public installation baseline; `develop` contains ongoing work. The version
shown in the extension manager comes from `manifest.json`.

Open **Extensions → Manage extensions** and use SillyMemory's update button,
then reload. It pulls your installed branch, normally `main`; it does not select
the newest GitHub Release/tag. Automatic updates are currently disabled. After
reload, re-enter the LambdaDB key and re-enable memory. Budget, recent-message
settings and installation ownership are retained. Normal updates do not require
deleting the owned memory collection or reinstalling the extension.

The current development candidate uses story collections and chat branches by
default. There is no legacy storage mode or data migration. Checkpoints remain
explicit: save a checkpoint to preserve a resumable transcript. See the
[storage decision and validation](docs/default-story-memory.md). Historical
release notes describe their original versions, not the current contract.

## Use and behavior

- The status panel shows preparation, queued writes, ownership checks, outdated-chunk deletion, upload, search, and token budgeting. Upload totals count current older chunks; confirmed chunks include this session's earlier successful writes. Counts advance only after a service response, not merely after sending a request. They do not measure embedding/index visibility or bytes transferred. A failed operation keeps the last confirmed count and shows retry guidance.
- Send messages normally. Message generation, edits, selected swipes, deletion, chat changes, and reload/re-enable trigger reconciliation. Click **Sync this chat** to retry after a network failure. For authentication errors, re-enter the key using **Use key for this session** first; for rate limits or timeouts, wait before retrying. Successful batches are skipped within the session. A lost response can require an idempotent re-upsert, and reload conservatively rechecks current records after key re-entry and re-enabling memory. Progress is not saved across reloads.
- Long messages use boundary-aware chunks with exact source offsets. The first sync after this update deletes journal-tracked old-layout IDs and reindexes the current chat; this incurs managed embedding usage. See [the controlled comparison and limits](docs/boundary-chunking.md).
- Only older plain-text messages are embedded. Recent messages stay in the generation array. Files, media, and tool messages are not indexed; group chats and chats with system tool invocations are bypassed.
- Each story uses one owned collection and each chat path uses an isolated writable branch. Saved native metadata defines the story and chat IDs. Renaming preserves them; verified native forks inherit committed memory without re-embedding. Independent copies receive a new story. Every query applies an owner/story filter and validates results against the current local chat. See [the storage model](docs/versioned-memory.md).
- Before generation, the extension synchronizes current source text and retrieves matching chunks with `knn.queryText`: the latest user message and the preceding nonempty user message are searched independently. A first user turn has only one query; generic assistant acknowledgments are not concatenated into the topic query. Explicit **Continue** generation instead anchors on the latest message being extended; regenerate and swipe still use the user question. It interleaves the two result lists, validates every result against current local text and IDs, and token-counts the complete injected string using the host tokenizer. Macro braces and legacy macro markers are shown with fullwidth delimiters so recalled dialogue stays literal during host prompt assembly.
- If at least one valid passage fits, older eligible full messages are removed from the ephemeral prompt array and the selected passages are injected. Source chat messages on disk are not modified. If nothing fits or an operation fails, the original prompt remains. A mid-request chat change aborts that generation; generate again in the new chat.
- Identical selected passages from the same speaker and role share one full body with every selected source position listed. If this saves tokens, additional distinct retrieved passages may fit; no already-selected source is dropped. Repeated groups appear at their latest selected occurrence. The inspection panel exposes these labels.
- **Memory in the last prompt** separates prepared excerpts from those verified in the final host prompt. **Stop on missing context** is enabled by default: if prepared memory or verifiable recent messages are missing or changed, generation is canceled before the completion request. Increase context, reduce reserved output or recent-message count, then generate again; the submitted user message remains in the chat. Turn the option off to proceed with a visible warning. There is no automatic retry. See [behavior, limits and validation](docs/prompt-delivery.md).
- Verification uses the pinned host's Chat Completion prompt boundary, not provider receipt or billed tokens. Name macros are supported; arbitrary macros and the final continuation prefix are explicitly unverified rather than falsely counted as missing. Other completion formats report verification unavailable. Later provider transformations and other prompt-rewriting extensions are outside this check. The default 800-token allocation and one-quarter cap remain heuristics, not exact remaining capacity; the [capacity audit](docs/prompt-capacity-results.md) records why.
- **Disable** stops synchronization/retrieval and clears the injection. It retains remote data. **Forget key** also disables memory. Reload starts disabled and requires key re-entry.
- **Delete this chat’s remote memory** removes its writable branch; parent and sibling branches remain. **Delete all owned remote memory** discovers and deletes this installation’s story collections, including those absent from browser bookkeeping. Both drain pending writes and verify ownership and API absence. Local chats remain; this does not prove physical erasure from provider backups.

## Data, usage, and cleanup

A LambdaDB project/API key with collection create/read/delete, document write/query and branch list/create/delete access is required. Source text, speaker labels, message/chunk positions, hashed scope/revision identities, and query text go directly from your browser to LambdaDB. LambdaDB sends embedding inputs to its managed embedding provider (currently configured here as OpenAI `text-embedding-3-small`). Each retrieval submits up to two distinct queries concurrently. Managed embeddings incur inference usage; storage and retrieval have service costs. See [managed embeddings](https://docs.lambdadb.ai/guides/collections/managed-embeddings) and [LambdaDB costs](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Ordinary document deletion removes current retrievable records; snapshot retention and provider backup policies are separate. The extension requests one-day historical snapshot retention. Explicitly saved checkpoints retain their own unchanged branch for future forks; see [checkpoint usage and cleanup](docs/checkpoints.md). Removing the extension or deleting a native SillyTavern chat does **not** delete its remote collection automatically. Use current-chat deletion before removing the local chat, or all-owned cleanup afterward. Renaming preserves the same memory. Delete all owned memory and any pending test collection before uninstalling or changing connection settings.

Browser storage loss does not delete chat metadata or account ownership stored by SillyTavern. Re-enter the endpoint/project/key and prepare memory to reconnect the same saved chat; all-owned cleanup can discover tagged `smstory_*` collections. If the account owner metadata is lost too, inspect ownership tags manually; the extension must not adopt another owner’s data. Pending `smtest_*` collections have a separate cleanup button. Simultaneous writers on different devices are unsupported; browser locks do not coordinate them. See [lifecycle and recovery limits](docs/versioned-memory.md).

## Development and verification

Detailed historical reports and producer snapshots live outside the maintained
source tree. [Evidence retention](docs/evidence-retention.md) lists preserved
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
[the validation record](docs/chat-collections.md) for boundaries and retained evidence.


The [evaluation and device-continuity follow-ups](docs/evaluation-and-device-followups.md)
record the limits of the small-context comparisons, default versus experimental
memory settings, proposed 32K/128K validation, local-embedding measurements, and
the work needed to resume the same remote memory from another device. These are
follow-up directions, not new measured results or shipped continuity support.

The [external benchmark selection](docs/benchmark-selection.md) prioritizes
LongMemEval-S and ConvoMem, compares additional memory benchmarks, and records
the data audit, host adaptation and scoring controls needed before paid runs.
No external benchmark results are claimed by this selection record.

The [natural-dialogue evaluation protocol](docs/natural-dialogue-evaluation.md)
provides four frozen bilingual synthetic histories, 16 cases and an offline plan
exporter. The [first live attempt](docs/natural-dialogue-live.md#first-live-attempt--2026-09-28)
completed 21 samples before an OpenAI HTTP 500 stopped request 22. A separate
[completed run](docs/natural-dialogue-results.md) now has all 64 answers, 676
integrity checks and verified cleanup. It used the bounded retry policy but
needed no retries. Review found that the historical run did not verify the required
provider-start spacing; the new speaker runs verify actual upstream starts at least 15 seconds apart. Provisional assistant review flagged four memory-on answers
for unsupported speaker attribution; independent human scoring remains pending.
The [speaker-attribution follow-up](docs/speaker-attribution-results.md) preserves
two unsuccessful 24-answer system-wrapper trials and the separate 32-answer
[native-role evaluation](docs/speaker-native-evaluation.md). Selected excerpts now
replace older eligible prompt messages in their original roles and source order.
World Info may scan these excerpts as ordinary history; interoperability with
World Info and other prompt rewriters remains unverified.

Start ongoing work from `develop` and open feature/fix PRs against `develop`.
Promote validated changes to the public `main` branch through a separate PR.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and verification workflow.

The GitHub Actions workflow runs unit regressions and syntax checks for the
runtime, scripts, and tests on pull requests and pushes to `main` or `develop`, using the
declared minimum Node.js 20.12.0 and Node.js 24 with the npm lockfile. This workflow
does not use LambdaDB or model credentials.
Browser/emulator checks and paid live integration runs remain separate commands
below; a green CI result alone does not establish live integration success.

See the [SDK migration and next experiment design](docs/sdk-migration.md) for the official client integration and validation boundary.
The [deployed Bayesian evaluation](docs/bayesian-sdk-validation.md) records the
locked dev SDK contract, English update/temporal diagnostics and remaining failures.

See the [final local review](docs/review.md) for the commit scope, review fixes,
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
See [current validation and limits](docs/default-story-memory.md).

Historical proxy-path and retrieval-policy runs require their archived producer
revision. They are not compatibility requirements for the current runtime.

To exercise the complete settings, chat, and generation path with live LambdaDB:

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:generation
```

This uses the same LambdaDB credentials, a fresh host on localhost port 18128 (`ST_GENERATION_PORT` overrides it), and a deterministic local response fixture. It runs nine generations, including streaming, regenerate, and swipe; records the final outgoing messages; and deletes the owned collections through the extension's UI. The fixture is not an LLM and cannot measure answer quality. Review `artifacts/generation-fixture-model.json`. A failed cleanup leaves `artifacts/generation-fixture-model-pending.json`; resolve those resources before retrying.

For an actual generation model, additionally put `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` in `.env.local`, then run `npm run test:generation:live`. The endpoint must support compatible `/chat/completions` requests and SSE streaming; include the API prefix in the base URL (for example, `https://<provider>/v1`). This sends the nine synthetic test prompts to that provider and incurs model usage. A loopback bridge holds the provider key in process memory; the host only receives the bridge URL. The bridge is test infrastructure, not part of the extension. Logs are suppressed, and the report contains synthetic prompts, provider replies/usage, and request options with known credentials redacted. Live-mode output and pending resource records use `generation-live-model` filenames. Each live response must complete normally, match the host-saved message, and answer the narrow synthetic fact correctly; this is not a broad quality benchmark. Live runs space actual upstream generation sends (including retries) by at least 15 seconds and use a 256-token output limit. Optional `LLM_REASONING_EFFORT` configures the host request (for example, `low` for the tested Gemini model).

For OpenAI, use the following values with your own API key:

```dotenv
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4.1-mini-2025-04-14
LLM_REASONING_EFFORT=
```

This fixes the [GPT-4.1 mini snapshot](https://developers.openai.com/api/docs/models/gpt-4.1-mini) for repeatability and leaves reasoning effort unset. Run `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:generation:live` to keep its report separate from earlier providers. The optional tag allows letters, digits, dots, underscores, and hyphens (maximum 80 characters, starting with a letter or digit), and applies to both result and pending-cleanup filenames. Use a new tag for each run you want to preserve; reusing it overwrites that tag's completed report.

The earlier Gemini run used `LLM_MODEL=gemini-3.8-flash` and `LLM_REASONING_EFFORT=low`. For Gemini, use `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`. The harness configures SillyTavern's Custom API body exclusions for `frequency_penalty`, `logprobs`, and `top_logprobs`: the live Gemini endpoint rejected the first two fields from the host's generic request. The loopback bridge forwards the resulting request without altering messages. Check [Google's compatibility guide](https://ai.google.dev/gemini-api/docs/openai) and your project's [model availability and free quota](https://ai.google.dev/gemini-api/docs/pricing); a successful model listing alone does not establish generation access.

Run the longer Korean comparison with `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:korean:live` for the OpenAI settings above. Optional `SM_MODEL` overrides the model for the run without editing `.env.local`; select a model from the configured provider. The fixed protocol plans 16 model requests; it restores the same source before each, checks complete baseline history and memory bounds, grades factual replies, and measures provider prompt tokens plus warm generation duration. See the [Korean protocol, results, and continuation instructions](docs/korean-evaluation.md). Completed samples are preserved when quota or availability blocks later requests. The summarizer rejects cross-model pooling and duplicates; an explicitly partial summary compares only completed question pairs. Its `--output <path>` option keeps provider summaries separate.

Run the fixed three-mode comparison with `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:comparison:live`. It compares memory off, SillyMemory, and native Vector Storage across three Korean histories (120–240 messages), nine questions and two repetitions: 54 live generations plus embedding calls. The native OpenAI-compatible embedding adapter uses the same private loopback test bridge; no local model or server plugin is installed. Preserve each run with a distinct artifact tag. Review the [protocol and results](docs/comparison-evaluation.md) before running; native Vector Storage retains other old history, so it is not an equal-token-budget comparison.

Aggregate completed, nonoverlapping runs with `node scripts/comparison-summary.mjs artifacts/generation-comparison-openai-gpt-4.1-mini.json --output artifacts/comparison-summary-openai-gpt-4.1-mini.json`. The summarizer requires all 54 fixed samples, matching evaluated source/configuration, actual provider usage and verified remote/native cleanup; it rejects duplicate or incomplete evidence. Generation-only cost estimates exclude embeddings and LambdaDB charges.

For the search-only diagnosis, run `SM_ARTIFACT_TAG=diagnosis-next node scripts/retrieval-diagnostic.mjs`. It compares four query constructions, actual managed `queryText` results, and an identical-vector server/exhaustive control without any text-generation calls. It still incurs LambdaDB embedding and data usage. The completed experiment reproduced all six old-fact misses in exhaustive search with the current query; the latest user message alone retrieved and selected all six. This is a retrieval result, not a new answer-quality score. See the [diagnostic and committed-index limitation](docs/retrieval-diagnostic.md).

The live harnesses require Node.js 20.12+ for `util.parseEnv`; recorded runs use Node.js 24.15.0.

For the fixed ambiguous-reference, continuation and context-overflow evaluation,
see [the protocol and results](docs/recall-challenges.md). Run
`npm run test:challenges:live` only with an authorized synthetic-data scope and
the configured provider credentials; it makes 12 scheduled model requests plus
managed embedding operations. A separate existing credential file can be read
by the generation harness with `SM_ENV_FILE=/absolute/path/to/.env.local` without
copying it into the worktree.

For 12 new counterbalanced cases (24 real model answers), use
`npm run test:heldout:live`; aggregate with
`node scripts/challenge-summary.mjs --heldout <reports...> --output <summary.json>`.
`npm run test:recovery` adds two real host SIGKILL/restarts and 24 repeated
edit/swipe/delete cycles to the emulator fault suite. See the
[held-out and recovery protocol](docs/heldout-recovery.md) for limits and evidence.

The natural-dialogue runner uses the frozen 16-case English/Korean corpus for
64 real memory-off/on responses. An opt-in [transport amendment](docs/natural-dialogue-retry.md)
allows bounded provider 5xx retries while recording every failure. See [execution and blinded
semantic review](docs/natural-dialogue-live.md) for the fixed model, usage bounds,
cleanup requirements and scoring workflow. Automated retrieval/integrity checks
and assistant annotations do not replace the protocol's human semantic review.

The [long-dialogue protocol](docs/long-dialogue-evaluation.md) adds a separately
frozen 32-answer test with measured context overflow. See [its results](docs/long-dialogue-results.md)
and [offline human-review workflow](docs/human-review.md). Generate a local review
form with `node scripts/natural-review.mjs blind-review.json --output review.html`;
it provides no automatic grades and sends no data over the network.

The [prior-user query comparison and follow-up](docs/context-selection-results.md)
records the v3 selection fix, its fixed-budget evidence and remaining limits.
At the recorded pre-default revision, run `SM_ARTIFACT_TAG=next-selection node scripts/live-smoke.mjs --selection` for
the search-only comparison; the live runner also accepts `SM_ENV_FILE`.

At the recorded v3 revision, run `SM_ARTIFACT_TAG=next-assistant-topic node scripts/live-smoke.mjs --assistant-topic`
for the [assistant-topic query comparison](docs/assistant-topic-evaluation.md).
It shares each distinct query response across the frozen policies and makes no
generation calls; its integrity pass is separate from candidate qualification.

At its recorded revision, the [assistant fallback protocol](docs/assistant-fallback-evaluation.md) runs with
`SM_ARTIFACT_TAG=next-fallback node scripts/live-smoke.mjs --assistant-fallback`.
See its [results and generation commands](docs/assistant-fallback-results.md).

At its recorded revision, the [context-turn protocol](docs/context-turn-evaluation.md) runs with
`SM_ARTIFACT_TAG=next-turn node scripts/live-smoke.mjs --context-turn`.
See its [results and amended generation commands](docs/context-turn-results.md).
The subsequent [fixed-budget passage-selection replay](docs/budget-selection-results.md)
compares five offline candidates; all regress on an existing selected source,
so runtime selection remains unchanged.
The [sentence excerpt follow-up](docs/sentence-passage-results.md) also retains
production behavior: neither fixed candidate preserves all existing required
quotes, and partial parent matches are recorded separately from full coverage.
A [proposed semantic evidence contract](docs/semantic-evidence-contract.md) now
separates answer-bearing spans from mandatory context in 16 fresh short cases.
Its audit validates the evaluator; candidate quality and human review remain unset.
The [long-dialogue direct-path cohort](docs/semantic-direct-results.md) subsequently
completed 64 actual-host answers; its provisional grades do not establish managed
transport recovery. The [context bundle follow-up](docs/context-bundle-results.md)
adds selection diagnostics and two offline neighborhood candidates. Both recover
the quotation gap but lose other required sources, so neither is adopted.

The [context candidate protocol](docs/context-candidate-evaluation.md) compares
the current labelled selector, label removal, and label removal plus adjacent-turn
retention under 400 host tokens. Freeze a plan with fixture `actor-candidate-v1`
and pass it to the same natural runner. This is a 48-answer controlled prompt
experiment with frozen source indices and generation-time retrieval disabled;
the candidate code is test-only and does not change installed extension behavior.

See [architecture](docs/architecture.md), [pinned contracts](docs/contracts.md), and [validation and remaining checks](docs/validation.md).

## Deferred

Persistent keys, automatic checkpoints, in-place transcript rollback, Data Bank, World Info, multi-user administration, and external result downloads are outside this MVP. The synthetic built-in-memory comparison is documented separately; no general recall-quality, latency, or total operating-cost improvement is claimed. Stable release readiness remains under evaluation.

The [latest-user/context query policy](docs/query-policy.md) documents the retrieval change, its regression and held-out checks, and commands for reproducing them. The original comparison and vector diagnostic remain historical evidence from their recorded source hashes.

## License

Copyright (C) 2026 SillyMemory contributors.

SillyMemory is free software, licensed under the **GNU Affero General Public
License, version 3 only** (`AGPL-3.0-only`). You may redistribute and modify it
under that license. It is provided without warranty; see [LICENSE](LICENSE) for
the complete terms. SillyMemory uses the same license family as its
[SillyTavern host](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/LICENSE).

This repository contains the extension's source and development tools; the
SillyTavern host and development dependencies retain their own licenses. The bundled LambdaDB SDK and Zod retain their licenses in [vendor/LICENSES.txt](vendor/LICENSES.txt).
