# SillyMemory

Long-term memory for SillyTavern.

**Powered by LambdaDB**

An installable, experimental UI extension for character chats. SillyMemory keeps at least five recent eligible messages (including the active input), keeping an adjacent plain-text input/reply pair together, intact at its prompt hook and replaces older plain-text history with relevant source passages under a fixed memory token budget. SillyTavern may subsequently truncate the prompt to fit its context limit. It uses LambdaDB managed embeddings over direct browser HTTPS/CORS. No server plugin or LambdaDB modification is required.

**0.4.0 is prepared as an experimental pre-release, dated 2026-10-13.**
[Story memory](docs/versioned-memory.md) is automatic for every enabled chat;
[checkpoints](docs/checkpoints.md) are saved and resumed explicitly. Public
`main` is the public installation baseline; preparation on `develop` does not
change it. A dated entry alone is not publication. Check
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) for publication,
[0.4.0 notes](docs/releases/0.4.0.md) and [installation validation](docs/releases/0.4.0-validation.md)
for this boundary, and [the default-storage decision](docs/default-story-memory.md)
for storage behavior.

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
5. Click **Save and connect**. The input is cleared and a bounded read checks the project key before saving it. The key is stored in a dedicated browser credential record for this SillyTavern account and exact endpoint/project, separately from ordinary settings. It is restored on future visits; only the current connection key is retained for each account. Other extensions on this page can access browser storage: this is convenience storage, not an encrypted or isolated vault. **Forget key** removes the saved and runtime key and disables memory. Keys never appear in URLs, native settings or extension logs. See [reconnection and limits](docs/saved-connection.md).
6. Click **Test synthetic upsert / query / delete**. This creates a dedicated `smtest_<random>` collection, upserts a synthetic story, queries `knn.queryText`, deletes its document, verifies it no longer appears, then deletes the owned test collection. This consumes LambdaDB resources and inference usage. The test must pass before **Prepare chat memory** becomes available.
7. If a test fails, use **Clean up test collection**. Pending test identity is preserved across reloads so cleanup can be retried after reconnecting. A failed cleanup is not reported as successful.
8. Click **Prepare chat memory**, select a character chat, then enable memory. Native branches automatically reuse committed history in separate LambdaDB branches within one story collection. Generation retains at least five recent eligible messages, without splitting an adjacent eligible input/reply pair, and recalled memory alongside native character/system settings. Default settings allow 4,096 memory tokens, including excerpt content, source labels and available conversation timestamps; provider message-envelope overhead is managed by the host. Configure the memory budget in the panel. Disable built-in Vector Storage chat vectorization and other prompt-rewriting memory extensions for this prototype.

Optionally enter a checkpoint name and use **Save / finish checkpoint** to save the current transcript and memory state. **Refresh story checkpoints** shows names, creation times and verified states, with controls to finish pending saves, resume a new path, rename or delete individual checkpoints. See [recovery, integrity and restore limits](docs/checkpoints.md).

The memory budget applies **per generated answer**, not cumulatively across a
chat. Recent messages and character instructions are separate from that budget.
You can set 64–4,096 memory tokens; the effective limit is also capped at one
quarter of the context size passed by the host. The default 4,096 uses the tested
budget ceiling, not an established optimum. On smaller host contexts the
one-quarter cap lowers the effective budget. It is unrelated to the current 800-**character**
indexing chunks: long messages now prefer paragraph, sentence and word boundaries within that ceiling, without overlap. Exact source text is retained; a sentence longer than the ceiling can still be split. See the
[controlled budget comparison](docs/memory-budget-calibration.md) for evidence
and limitations, and the [design review](docs/memory-design-followups.md) for
chunking and hybrid-search work. The [chat collection lifecycle](docs/chat-collections.md) describes the implemented isolation and cleanup behavior.
Each answer searches the two most recent eligible messages through its generation
anchor together, using one role-labelled query (usually the preceding reply and
current user input). This adds no rewriting model or extra search call. Completed
eligible messages are indexed when they leave the recent-five window. Adjacent
plain input/reply pairs share an upsert request while keeping separate documents;
there is no five-message queue. A trailing user input waits for its answer.
Normal alternating input retains two completed exchanges plus the current question
(five messages). After the reply, retain six until the next input displaces an old
pair. Continue/Impersonate can use six raw messages. Special or nonalternating
source follows existing eligibility handling. Query 2 does not append all five
retained messages. Retained positions and replacement answers are excluded from
both search legs and local selection. See [retention and archival evidence](docs/recent-dialogue-retention.md).
Regenerate/swipe anchor on the user question; Continue anchors on the message
being extended; Impersonate anchors on the latest eligible character response.
Each includes the preceding eligible message. Queries above 8 KiB fail explicitly.

Replies and streaming use SillyTavern's native model/API settings. SillyMemory does
not force JSON, decode replies, or accumulate unresolved-request state. Its system
guidance asks a brief clarification for ambiguous requests and explains missing,
insufficient or conflicting evidence without inventing facts. The model may fail
to follow this guidance. Clarification conversations extending beyond the retained
window depend on retrieval; there is no guaranteed long-span retention. Guidance
shares the memory budget and is checked at the final Chat Completion prompt boundary,
including empty results. See [current policy and validation limits](docs/conversation-memory-defaults.md)
and [native reply behavior](docs/native-replies.md).

Current retrieval combines managed vector and raw English text search with
Bayesian fusion with vector k=100, followed by managed Typesafe Jev reranking
over at most 100 candidates and a final return limit of 50 chunks. These are
search candidates, not a promise that all 50 fit the memory budget. Both signals
use the
same owner/scope filter and explicit chat branch. Reranking failure or unconfirmed
rerank metadata rejects injection; there is no silent fallback. The user supplies
only a LambdaDB project key. See the [default adoption and validation limits](docs/profile-50-host-validation.md#product-default-adoption).
Managed embedding and reranking may incur additional
LambdaDB inference usage. See [the default decision and bounded English evaluation](docs/conversation-memory-defaults.md).
Selected chunks from the same message and revision share one source/time header.
Touching text and matching overlaps are joined from the returned chunks; missing
intervals remain explicitly marked. Existing selected evidence and repeated-text
citations are preserved, and saved space admits additional retrieved passages in
rank order within the same budget. This adds no model or retrieval calls. The
formatter does not need a complete local message; the extension still validates
retrieval against the current chat before injecting it. See the
[source assembly implementation and validation](docs/source-assembly.md).

The earlier [hybrid comparison](docs/hybrid-retrieval.md) and
[budget follow-up](docs/budget-confirmation.md) describe historical configurations;
their adverse results remain evidence rather than current-default claims.

For local development, symlink the checkout into
`SillyTavern/public/scripts/extensions/third-party/sillymemory`; do not also install
a user-scoped copy. Manual copies without Git metadata cannot use the normal
Git-based update flow.

## Version and updates

**0.4.0 is an experimental release boundary.** See [CHANGELOG.md](CHANGELOG.md) for changes and
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) for published
versions. A dated changelog entry can precede publication. The `main` branch is
the public installation baseline; `develop` contains ongoing work. The version
shown in the extension manager comes from `manifest.json`.

Open **Extensions → Manage extensions** and use SillyMemory's update button,
then reload. It pulls your installed branch, normally `main`; it does not select
the newest GitHub Release/tag. Automatic updates are currently disabled. After
reload, the saved LambdaDB key is verified and the previous memory-enabled state is restored. If memory was disabled, it stays disabled. Budget, delivery preferences and installation ownership are retained. Normal updates do not require
deleting the owned memory collection or reinstalling the extension.

This release boundary uses story collections and chat branches by
default. There is no legacy storage mode or data migration. Checkpoints remain
explicit: save a checkpoint to preserve a resumable transcript. See the
[storage decision and validation](docs/default-story-memory.md). Historical
release notes describe their original versions, not the current contract.

## Use and behavior

- The status panel shows preparation, queued writes, ownership checks, outdated-chunk deletion, upload, search, and token budgeting. Upload totals count archived conversation chunks; confirmed chunks include this session's earlier successful writes. Counts advance only after a service response, not merely after sending a request. They do not measure embedding/index visibility or bytes transferred. A failed operation keeps the last confirmed count and shows retry guidance.
- Send messages normally. Message generation, edits, selected swipes, deletion, chat changes, and reload/re-enable trigger reconciliation. Click **Sync this chat** to retry after a network failure. For authentication errors, replace the key using **Save and connect** first; for rate limits or timeouts, wait before retrying. Successful batches are skipped within the session. A lost response can require an idempotent re-upsert, and reload conservatively rechecks current records after verified reconnection. Progress is not saved across reloads.
- Long messages use boundary-aware chunks with exact source offsets. The first sync after this update deletes journal-tracked old-layout IDs and reindexes the current chat; this incurs managed embedding usage. See [the controlled comparison and limits](docs/boundary-chunking.md).
- Completed eligible plain-text messages outside the recent-five window are embedded. At least five recent eligible messages stay full alongside selected memory. Files, media, and tool messages are not indexed; group chats and chats with system tool invocations are bypassed.
- Each story uses one owned collection and each chat path uses an isolated writable branch. Saved native metadata defines the story and chat IDs. Renaming preserves them; verified native forks inherit committed memory without re-embedding. Independent copies receive a new story. Every query applies an owner/story filter and validates results against the current local chat. See [the storage model](docs/versioned-memory.md).
- Before generation, the extension synchronizes current source text and retrieves matching past chunks with one two-message query. Vector and English lexical legs share owner, story scope and message-index filters; all retained recent turns and replacement answers are excluded before ranking. Continue anchors on the eligible message being extended, Impersonate on the latest eligible response; regenerate and swipe use the user question. Every result is validated against current local text, IDs and the active-input boundary. The host tokenizer counts excerpts and guidance together. Macro braces and legacy macro markers are shown with fullwidth delimiters so recalled dialogue stays literal during host prompt assembly.
- After successful retrieval, past eligible full messages are removed from the ephemeral prompt array and selected passages are injected. Zero hits or nothing fitting the budget still retains at least five recent eligible messages, memory guidance, alongside native character/system settings. Source chat messages on disk are not modified. Preparation failures stop generation explicitly; disable memory to use native full history. A mid-request chat change aborts that generation; generate again in the new chat.
- Identical selected passages from the same speaker and role share one full body with every selected source position listed. If this saves tokens, additional distinct retrieved passages may fit; no already-selected source is dropped. Repeated groups appear at their latest selected occurrence. The inspection panel exposes these labels.
- Every indexed chunk stores available UTC **host message timestamps** from current `send_date` metadata, separately from embedding text. Selection budgets the complete excerpt, its timestamp and memory guidance together. These are explicitly not story/event dates; unsupported or missing timestamps remain unknown. Time edits update document revisions and can trigger embedding again. See [provenance, budget and validation](docs/conversation-time.md).
- **Memory in the last prompt** separates prepared excerpts from those verified in the final host prompt. **Stop on missing context** is enabled by default: if prepared memory, memory guidance or any verifiable retained recent turn is missing or changed, generation is canceled before the completion request. Increase context, reduce reserved output, then generate again; the submitted user message remains in the chat. Turn the option off to proceed with a visible warning. There is no automatic retry. See [behavior, limits and validation](docs/prompt-delivery.md).
- Verification uses the pinned host's Chat Completion prompt boundary, not provider receipt or billed tokens. Name macros are supported; arbitrary macros and the final continuation prefix are explicitly unverified rather than falsely counted as missing. Other completion formats report verification unavailable. Later provider transformations and other prompt-rewriting extensions are outside this check. The default 4,096-token allocation and one-quarter cap remain heuristics, not exact remaining capacity; the [capacity audit](docs/prompt-capacity-results.md) records why.
- **Disable** stops synchronization/retrieval and clears the injection. It retains remote data. **Forget key** also removes the saved credential and disables memory. Reload verifies the saved key before restoring the previous enabled/disabled state. Rejected keys are removed and memory remains disabled; network failures retain the saved key for a later connection attempt.
- **Delete this chat’s remote memory** removes its writable branch; parent and sibling branches remain. **Delete all owned remote memory** discovers and deletes this installation’s story collections, including those absent from browser bookkeeping. Both drain pending writes and verify ownership and API absence. Local chats remain; this does not prove physical erasure from provider backups.

## Data, usage, and cleanup

A LambdaDB project/API key with collection create/read/delete, document write/query and branch list/create/delete access is required. Source text, speaker labels, message/chunk positions, hashed scope/revision identities, and query text go directly from your browser to LambdaDB. LambdaDB sends embedding inputs to its managed embedding provider (currently configured here as OpenAI `text-embedding-3-small`). Each retrieval submits one two-message query. Managed embeddings incur inference usage; storage and retrieval have service costs. See [managed embeddings](https://docs.lambdadb.ai/guides/collections/managed-embeddings) and [LambdaDB costs](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Ordinary document deletion removes current retrievable records; snapshot retention and provider backup policies are separate. The extension requests one-day historical snapshot retention. Explicitly saved checkpoints retain their own unchanged branch for future forks; see [checkpoint usage and cleanup](docs/checkpoints.md). Removing the extension or deleting a native SillyTavern chat does **not** delete its remote collection automatically. Use current-chat deletion before removing the local chat, or all-owned cleanup afterward. Renaming preserves the same memory. Delete all owned memory and any pending test collection before uninstalling or changing connection settings.

Browser storage loss does not delete chat metadata or account ownership stored by SillyTavern. If the browser credential record is gone, enter the endpoint/project/key and reconnect the same saved chat; all-owned cleanup can discover tagged `smstory_*` collections. If the account owner metadata is lost too, inspect ownership tags manually; the extension must not adopt another owner’s data. Pending `smtest_*` collections have a separate cleanup button. Simultaneous writers on different devices are unsupported; browser locks do not coordinate them. See [lifecycle and recovery limits](docs/versioned-memory.md).

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
and [evidence index](docs/evidence-retention.md). Do not run those old modes against
the current active-input policy or label their archived results as current scores.
The low-level generation runner rejects these modes before credentials or provider
setup. Original scripts, protocols, reports and scoring remain in recorded source
revisions and verified archives.

The [Korean protocol](docs/korean-evaluation.md) planned 16 model requests, grading
factual replies and measuring provider input tokens and warm generation duration.
The [three-mode comparison](docs/comparison-evaluation.md) used three Korean
histories of 120–240 messages, nine questions and two repetitions: 54 generations
plus embeddings. Native Vector Storage retained other old history, so this was not
an equal-token-budget comparison. Its historical summarizer requires all 54 samples,
matching source/configuration, provider usage and verified cleanup; generation-only
cost excludes embeddings and LambdaDB charges.

The [retrieval diagnostic](docs/retrieval-diagnostic.md) compared four query
constructions and identical-vector server/exhaustive controls. It reproduced all
six old-fact misses with the old query; latest-user-only retrieval selected all
six. This is historical retrieval evidence, not a current answer-quality score.
Reproduction requires its recorded producer and incurs embedding/data usage.

The live harnesses require Node.js 20.12+ for `util.parseEnv`; recorded runs use Node.js 24.15.0.

The historical [challenge protocol](docs/recall-challenges.md) covers ambiguous
references, continuation and overflow with 12 scheduled model requests. The
[held-out protocol](docs/heldout-recovery.md) added 12 counterbalanced cases and 24
answers. Their execution commands require their producing checkout. Current
`npm run test:recovery` remains the emulator-only lifecycle check with two host
SIGKILL/restarts and 24 repeated edit/swipe/delete cycles.

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
retention under 400 host tokens. Its recorded producer freezes fixture `actor-candidate-v1`
and runs the historical natural adapter; use that checkout for reproduction. This is a 48-answer controlled prompt
experiment with frozen source indices and generation-time retrieval disabled;
the candidate code is test-only and does not change installed extension behavior.

See [architecture](docs/architecture.md), [pinned contracts](docs/contracts.md), and [validation and remaining checks](docs/validation.md).

## Deferred

Automatic checkpoints, in-place transcript rollback, Data Bank, World Info, multi-user administration, and external result downloads are outside this MVP. The synthetic built-in-memory comparison is documented separately; no general recall-quality, latency, or total operating-cost improvement is claimed. Stable release readiness remains under evaluation.

The [historical latest-user/context query policy](docs/query-policy.md) documents the earlier retrieval change, its regression and held-out checks. Reproduction requires its recorded producer; it is not the current policy. The original comparison and vector diagnostic remain historical evidence from their recorded source hashes.

## License

Copyright (C) 2026 SillyMemory contributors.

SillyMemory is free software, licensed under the **GNU Affero General Public
License, version 3 only** (`AGPL-3.0-only`). You may redistribute and modify it
under that license. It is provided without warranty; see [LICENSE](LICENSE) for
the complete terms. SillyMemory uses the same license family as its
[SillyTavern host](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/LICENSE).

This repository contains the extension's source and development tools; the
SillyTavern host and development dependencies retain their own licenses. The bundled LambdaDB SDK and Zod retain their licenses in [vendor/LICENSES.txt](vendor/LICENSES.txt).
