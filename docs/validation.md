# Validation record

Date: 2026-09-27. This is a local MVP implementation with a successful synthetic live LambdaDB integration test; it is not a production release or an LLM-quality benchmark.

## Source review

Read the merged sbrain decision record at `projects/sillytavern-lambdadb-extension.md` and the applicable instructions before implementation. The previously recorded source review was treated as planning evidence. No sbrain files, LambdaDB code, or deployments were changed.

Reopened official SillyTavern and LambdaDB documentation and inspected the pinned host and LambdaDB REST contract. See [contracts](contracts.md). Created the previously empty local Git repository on `main`; no GitHub repository, remote, commit, push, or deployment was created.

## Automated local unit tests

Command: `npm test` on Node.js v24.15.0. **21 tests passed.** These tests use in-memory fakes; they do not contact LambdaDB.

Coverage includes stable IDs, character/chat/branch isolation, recent-message exclusion, duplicate indexing avoidance, edit/swipe/deletion reconciliation, recovery after an accepted write loses its response, reload reconciliation, canceled/stale requests, foreign and altered search hits, duplicate results, complete-wrapper token budgeting, Unicode chunk boundaries, storage failure before remote writes, failure before retrieval, pending-write drainage before deletion, proxy request/auth shape, ownership checks, and external-download refusal.

Additional regressions cover the real host's `400 Unauthorized` mapping and the disabled proxy's 404, which must not be interpreted as successful remote cleanup. `npm run check` parses every runtime JavaScript module. Two tests check the Korean fixture and reject partial, stale, fabricated, and instruction-following answers in its grader. Two readiness-polling regressions verify bounded transient retries, eventual visibility, and immediate termination on authentication failure.

## Running SillyTavern and browser test

Command: `ST_SOURCE=/tmp/sillymemory-st-source npm run test:browser`.

- Host: SillyTavern **1.19.0**, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
- Browser: Playwright Chromium **153.0.8010.12**.
- Real components: host startup/configuration, extension discovery and loading, native settings/template UI, session reload, CSRF-aware browser calls, built-in CORS proxy, host tokenizer API, host interceptor dispatcher and extension-prompt assembly, event emitter, chat persistence, native branch creation/opening.
- Emulated components: a local HTTPS LambdaDB API server accepts synthetic documents and applies scope filters. Its ranking is deterministic; it does not create embeddings or establish ANN/semantic retrieval behavior. No LLM is connected.
- Isolation: a fresh temporary SillyTavern data directory is used for each run. Only the child host trusts the temporary local test certificate. TLS verification is not globally disabled. The test uses dummy credentials only.

The passing run completed **22 checks** with **zero browser page errors** and **zero remaining emulator collections**. The report also records SHA-256 hashes of the tested runtime files. It checks proxy-disabled installation behavior, durable owner initialization, loading, authentication errors, synthetic upsert/query/document-delete/collection-delete, proxy header forwarding and stripping, memory collection creation, reload key re-entry, prompt injection, recent history/source preservation, overlapping generation requests, edits, swipes, deleted records, chat-switch races, native branch isolation, failure fallback, disable behavior, absence of keys from storage, and complete owned collection cleanup. See the generated report for the exact run time, check list, counts, and browser page errors.

The browser test calls the **real host interceptor dispatcher** on synthetic prompt arrays. It also checks the real `getExtensionPrompt` assembly function, literal macro handling, and assembled memory token count. It does not call the full `Generate` pipeline or inspect an outgoing LLM request. Its injection budget uses SillyTavern's token counting API in the default disconnected-model configuration, not a verified final model tokenizer. Source chat serialization is checked unchanged during interception.

Generated evidence (ignored by Git):

- [`../artifacts/browser-smoke.json`](../artifacts/browser-smoke.json): actual run results.
- [`../artifacts/setup.png`](../artifacts/setup.png): settings UI with a synthetic endpoint; the key input is empty.
- [`../artifacts/settings.png`](../artifacts/settings.png): memory inspection and token budget in the running host.

The screenshot content was opened for visual inspection. These files are local review evidence, not publication assets or screenshots of live LambdaDB results.

## Findings fixed during implementation

- Browser-native `fetch` must be called through its global receiver, rather than as a client instance's method. Node fakes alone did not reveal this.
- The pinned proxy rewrites upstream 401 to `400 Unauthorized`. The adapter maps this back to an actionable authentication error.
- A disabled proxy's own 404 cannot count as proof that a remote collection was deleted.
- Settings saves are debounced by the host. Initial installation identity must be saved and read back before remote creation to survive an immediate reload.
- Synchronization status must change immediately on an event, so the UI does not present a previous pass as the current one.
- Recalled macros must stay literal during the later host substitution pass; otherwise they can execute or increase tokens after budgeting.
- An older canceled request must not clear a newer request's injection. Prompt sequencing and snapshot guards protect both result application and error handling.

## Live LambdaDB integration

After the initial local-only run, the user supplied connection information in the Git-ignored `.env.local` and authorized testing. `ST_SOURCE=/tmp/sillymemory-st-source npm run test:live` completed **12 checks** successfully through a fresh pinned SillyTavern process, Chromium, and the built-in proxy. The upstream in this test was the real LambdaDB endpoint from that file, not an emulator. No LambdaDB source code or deployment was changed.

The run verified:

- Invalid credentials are rejected through the proxy (the pinned host reports upstream 401 as HTTP 400).
- A dedicated managed embedding collection accepts normal upsert; `knn.queryText` returns the expected synthetic ID and text.
- Document deletion removes the record from a subsequent strongly consistent query; test collection deletion is confirmed by GET 404.
- The shipped memory engine retrieves only older current-source passages under the configured token budget (two passages, 73 host-counted tokens within a 400-token budget in the recorded run).
- Separate synthetic parent-chat, branch-chat, and character identities use isolated remote scopes. Each query returned its own expected record with no foreign scope.
- Source edits and selected swipes replace obsolete IDs. A fresh engine with the same journal reconciles a deleted message and verifies the remaining remote IDs.
- The real key is absent from localStorage, sessionStorage, extension settings, and persisted host settings. A browser reload removes the in-memory test client and starts the UI disabled with an empty key input.
- Both owned live-test collections are deleted, with API disappearance confirmed. No pending-cleanup record remains.

Review [`../artifacts/live-smoke.json`](../artifacts/live-smoke.json) for exact check names, HTTP statuses, cleanup outcome, and source hashes. The harness intentionally omits endpoint/project values, request headers, credentials, response bodies, traces, and host console output. It does not modify the user's credential file. `.env.local` remains ignored and untracked.

Scope boundary: this run imports the **shipped client, gate, and memory engine into the real browser**. It drives synthetic snapshots directly rather than exercising all settings buttons, native edit gestures, or the complete `Generate` pipeline against LambdaDB. Native branch creation, the host event/interceptor integration, and failure/race paths were covered by the separate emulator-backed browser run above. The live branch check verifies the engine's real remote scope behavior; it does not repeat native branch UI creation against the service.

## Full generation pipeline with live LambdaDB

Command: `ST_SOURCE=/tmp/sillymemory-st-source npm run test:generation`. The pinned host and Chromium run in a fresh temporary profile. The settings UI performs the real LambdaDB transport gate and creates the owned memory collection. Chat events, native message editing/deletion, branch creation, and the complete host `Generate` pipeline are real. The generation endpoint is a deterministic loopback fixture, **not a language model**. This distinction applies to both normal JSON responses and SSE streaming.

The run completed **27 checks and nine generations**. It captured the actual final outgoing completion messages and verified:

- Memory off sends the older full history; memory on sends relevant live-retrieved passages and retains recent messages. Prompt pruning leaves source chat text intact.
- Editing the source fact replaces the old fact in the final request. Regenerate and swipe consume streaming responses through the host, which saves the generated assistant messages.
- A native branch completes generation with its own synchronized scope. Deleting the source fact removes it from the final request.
- An injected query HTTP 503 falls back to the full original history and still completes generation. Disabling memory removes injection.
- Real keys are absent from browser storage and persisted host settings. The UI deletion path drains pending writes, deletes the owned memory collection, and confirms its disappearance. All test collections are absent afterward; no pending cleanup record remains.

For this synthetic conversation, the memory-off request serialized `messages` to **8,342 characters**, compared with **1,359** with memory on. The host tokenizer counted **1,452 versus 248 tokens** in concatenated message content. These are fixture observations, not provider billing tokens: they exclude provider message framing, use the host's configured tokenizer, and do not prove general savings. The 220-token memory limit is separate from the entire request size. Fixture latency and answers cannot establish model latency, recall quality, or cost.

Review [`../artifacts/generation-fixture-model.json`](../artifacts/generation-fixture-model.json) for all final synthetic prompts/replies, events, check names, cleanup, and tested source hashes. The harness suppresses host logs and redacts configured secrets and connection values from its report. It does not read or send personal chats.

No real generation model was called during the response-fixture run above. Missing model configuration was verified to fail before host startup or remote resource creation. The subsequent live-model run is recorded separately below.

## Full generation pipeline with live Gemini and LambdaDB

Command: `ST_SOURCE=/tmp/sillymemory-st-source npm run test:generation:live`. Completed at **2026-09-27 10:31:20 UTC**, with **45 checks and nine generations passed**. All generation requests reached Gemini and returned HTTP 200 with `finish_reason=stop`; no deterministic model response was used. The provider reply matched the message saved by SillyTavern in every case. Runtime extension code was unchanged in this follow-up; changes were confined to the validation harness, local model settings, and documentation.

Configuration: `gemini-3.8-flash`, `reasoning_effort=low`, temperature 0, 256 maximum output tokens, host context 8,192 tokens, three retained recent messages, 220 memory tokens counted by the host. Generation starts are spaced by at least 15 seconds; this is test pacing, not a guarantee against provider quota limits. Provider credentials stay in the Node test bridge; the LambdaDB key remains in the extension's browser memory. Browser storage and persisted host settings were checked for both keys.

The nine source-fact assertions are deliberately narrow. The recorded replies were opened and reviewed:

| Scenario | Actual Gemini answer | Observed behavior |
| --- | --- | --- |
| Memory off | Beneath the cedar tree | Full older history reaches the model |
| Memory on | beneath the cedar tree | Retrieved memory preserves the fact |
| Native source edit | the stone tower | Updated fact replaces the old one |
| Streaming regenerate | the stone tower | SSE response completes and saves |
| Streaming swipe | stone tower | Selected alternative uses current memory |
| Native branch | stone tower | New chat scope completes generation |
| Source fact deleted | UNKNOWN | Deleted fact is absent from the final prompt |
| Injected retrieval HTTP 503 | Beneath the cedar tree | Original history supports fallback generation |
| Disabled again | Beneath the cedar tree | No memory injection remains |

The memory-off and memory-on runs use the same seeded history and question. Gemini reported **1,428 versus 203 prompt tokens**, respectively; serialized message lengths were **8,342 versus 1,359 characters**. These are observations for one synthetic fixture, not a representative savings or quality benchmark. Host content counts were 1,454 versus 248 and are distinct from provider counts. The two streaming responses did not supply usage in the captured frames; missing usage is not zero. Some provider `total_tokens` values exceed the sum of the exposed prompt/completion fields, so the report preserves all returned fields without deriving billing cost. Request latency excludes memory synchronization/retrieval and the pacing delay; it is not end-to-end generation latency.

The first full live-model attempt failed at the initial completion with HTTP 400. A targeted diagnostic established that Gemini rejected `frequency_penalty` and `logprobs` in the pinned host's generic Custom API request. The harness now configures the host's built-in body exclusions for those fields and `top_logprobs`; the bridge does not rewrite the final messages. This was a generation-provider compatibility issue, not a LambdaDB or memory-extension change. A preliminary `gemini-2.5-flash-lite` probe returned HTTP 404 despite the model being listed, so the successful `gemini-3.8-flash` probe was used for the run. Model availability and quota must be checked per project. See Google's [compatible API contract](https://ai.google.dev/gemini-api/docs/openai) and [free-tier pricing](https://ai.google.dev/gemini-api/docs/pricing).

Both the failed and successful full runs confirmed deletion of their owned test collections. No pending-cleanup record remains. Configured API keys were absent from tracked/candidate source files and generated JSON evidence; `.env.local` is ignored and untracked. The local model name and reasoning setting were added without changing either key. No paid-tier upgrade or billing configuration was performed; the test does not verify the provider's billing ledger.

Evidence:

- [`../artifacts/generation-live-model.json`](../artifacts/generation-live-model.json): final prompts, actual Gemini replies, request options, available usage, checks, cleanup, and matching source hashes.
- [`../artifacts/generation-live-model-initial-failure.json`](../artifacts/generation-live-model-initial-failure.json): preserved initial HTTP 400 run and successful cleanup. This earlier report recorded the status but not the provider error body; the rejected-field diagnosis came from the subsequent targeted request.
- [`../scripts/generation-smoke.mjs`](../scripts/generation-smoke.mjs): repeatable full-host test with provider response matching and synthetic fact assertions.

## Korean long-dialogue comparison (partial)

The fixed `ko-120-v1` fixture starts with 120 Korean messages. Native editing and deletion produce a 119-message source, restored before each generation. Both modes use Gemini `gemini-3.7-flash`, temperature 0, low reasoning, a 32,768-token host context, and a 256-token output limit. Memory uses the product defaults of 12 recent messages and 800 host-counted tokens. The complete baseline history fits and is asserted present in every off-mode final request.

**15 of 16 planned responses completed.** Seven question pairs are complete; the eighth question has only its memory-on result. All 15 completed responses were opened and reviewed and matched the fixed factual criteria. No completed quality miss was retried. Across the seven matched pairs:

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Correct answers | 7 / 7 | 7 / 7 |
| Forbidden/obsolete answers | 0 | 0 |
| Median provider prompt tokens | 5,572 | 1,125 |
| Median warm generation duration | 5.38 s | 6.40 s |
| Maximum injected memory tokens (host count) | 0 | 783 / 800 |

The input-token median fell about 79.8% for this fixture, while the observed generation-time median increased. This is not evidence of lower latency, general cost savings, or representative recall accuracy. Generation duration includes host preparation, retrieval, model response, and completion handling; it excludes fixture restoration and pre-synchronization. A recorded HTTP 503 retry/backoff is included in the affected sample. Provider load and caching were not controlled.

Completed cases cover an edited location, deleted password, a later plan replacing an older plan, early and middle facts, a recent plan, and an absent birthday. The additional unpaired memory-on case answered `검은색` rather than following a quoted instruction to answer `분홍코끼리`. Its off-mode counterpart remains unverified. The final prompts never contained the edited-away location or deleted password, recent complete messages were retained, and source chat text was preserved.

The first attempt needed a harness fix to expand messages older than the host's initial 100-message render. A Gemini 3.8 run then completed nine responses before a confirmed per-project/per-model daily free quota of 20 blocked further requests. Its partial results are kept separate. The Gemini 3.7 comparison ran in three segments (six, three, and six completed samples), with two interruptions from upstream HTTP 503. The last segment recovered one additional HTTP 503 with a bounded retry, then received the same daily quota error on the final requested sample. No quota error was retried in the harness, no billing settings were changed, and no results from different models were combined.

Every segment confirmed owned collection deletion; no pending cleanup record remains. Source and JSON artifact audits found no configured API keys. The aggregation command was also checked to reject incomplete comparisons by default, cross-model pooling, and duplicate samples. The explicitly partial summary marks `complete: false`, lists the missing case, and computes comparisons from matched pairs only.

Review the [protocol and commands](korean-evaluation.md) and [partial summary](../artifacts/korean-evaluation-summary.json). The summary links and hashes all three Gemini 3.7 source reports. The fixture and runtime hashes match across those segments; runner hashes are retained separately because continuation and bounded retry support were added during the validation. Runtime extension code was not changed.

After this model's daily quota resets, restore the Gemini endpoint/key and low
reasoning setting in `.env.local`, then execute only the missing sample. These
historical continuation commands must not use the OpenAI endpoint:

```sh
SM_MODEL=gemini-3.7-flash SM_SAMPLE_START=15 npm run test:korean:live
```

Then aggregate the three existing segments plus `artifacts/generation-korean-eval-from-sample-15.json` without `--allow-partial`. The eight-question comparison must not be described as complete before that succeeds.

## Full generation pipeline with live OpenAI and LambdaDB

Command: `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:generation:live`.
Completed at **2026-09-27 11:35:13 UTC**, with **45 checks and nine generations passed**.
The configured endpoint was OpenAI, using the fixed `gpt-4.1-mini-2025-04-14`
snapshot, temperature 0, 256 maximum output tokens, no reasoning-effort field,
and no provider-specific body exclusions. Host context was 8,192 tokens, with
three retained recent messages and a 220-token memory budget. The pinned host,
real browser, live LambdaDB, and full generation path are the same boundaries as
the preceding live Gemini smoke test. The bridge forwarded real OpenAI responses;
it did not generate fixture answers.

All nine requests returned HTTP 200 on the first attempt, finished with `stop`,
matched the messages saved by SillyTavern, and passed their fixed source-fact
checks. The actual replies were opened and reviewed. Memory off/on recalled the
cedar tree; native editing, streaming regenerate/swipe, and native branching
recalled the stone tower. After deleting that fact, the model replied `UNKNOWN`.
An injected retrieval failure and disabling memory both used full original
history and recalled the cedar tree.

Provider prompt tokens were **1,526 off versus 269 on** for the first paired
fixture requests. This is one narrow synthetic observation. Some later responses
reported cached prompt tokens; caching and provider load were not controlled.
The two streaming requests did not ask for stream usage and did not return it,
so their usage is unknown, not zero. No complete billing total is inferred.

Both configured keys were absent from browser storage and persisted host settings.
The shipped UI deletion path drained writes and removed the owned memory
collection. The final cleanup verified all test collections were absent and
removed its pending record. No LambdaDB or extension runtime changes were needed
for OpenAI compatibility. Harness changes add an optional artifact tag and a
summary output path so these results do not overwrite earlier provider evidence.

Review the [OpenAI generation report](../artifacts/generation-live-model-openai-gpt-4.1-mini.json)
for final messages, provider replies, request options, usage, timings, checks,
cleanup, and tested source hashes. See the [README](../README.md) for the local
configuration and repeatable commands.

## Korean long-dialogue comparison with OpenAI (complete)

Command: `SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:korean:live`.
Completed at **2026-09-27 11:39:30 UTC**, with **117 checks and 16 responses passed**.
The model was `gpt-4.1-mini-2025-04-14`, with temperature 0, 256 maximum output
tokens, no reasoning-effort field, a 32,768-token host context, 12 recent messages,
and an 800-token memory budget. The fixed `ko-120-v1` source, native edit/deletion,
question order, grading, and prompt-integrity checks are unchanged. This is a
separate complete comparison; it does not complete or aggregate the partial
Gemini comparison above.

All 16 requests returned HTTP 200 on their first attempt and completed normally.
The final answers were opened and reviewed: both modes recalled the edited drawer,
latest evacuation site, horse name, allergy, recent destination, and umbrella
color; both returned `UNKNOWN` for the deleted password and absent birthday.
Neither followed the quoted instruction to answer with an unrelated phrase.
Original source text, recent messages, and exclusion of edited/deleted text from
the final prompt passed every check.

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Correct answers | 8 / 8 | 8 / 8 |
| Forbidden/obsolete answers | 0 | 0 |
| Median provider prompt tokens | 6,417 | 1,398 |
| Median warm generation duration | 1.20 s | 1.93 s |
| Median provider response duration | 0.861 s | 0.705 s |
| Maximum injected memory tokens (host count) | 0 | 800 / 800 |
| Responses reporting cached prompt tokens | 7 / 8 | 0 / 8 |

Provider input-token median fell about **78.2%** for this fixture. Overall warm
generation-time median increased by about **0.73 s**. Every cached off-mode
response reported 6,016 cached input tokens; the first off-mode response and all
on-mode responses reported zero. Caching, provider load, and request timing were
not controlled, so these measurements do not establish a general latency or
billing improvement. Each case/mode has only one sample. The initial synchronization
of the original 120-message source took **2.10 s** and is retained separately from
warm generation times; fixture restoration and pre-generation synchronization
are excluded from those per-answer durations.

The run checked both keys were absent from browser storage and persisted host
settings, deleted every owned test collection, and removed its pending record.
Final source/report scans found no configured API keys; `.env.local` was unchanged,
ignored, and untracked. All 19 local unit tests and runtime/script syntax checks
passed. The tagged output paths and summary output option were exercised in these
actual runs; invalid tags and missing output paths were rejected before work.

The summary command completed without `--allow-partial`, verifying eight complete
pairs and no missing samples:

```sh
node scripts/korean-summary.mjs \
  --output artifacts/korean-evaluation-summary-openai-gpt-4.1-mini.json \
  artifacts/generation-korean-eval-openai-gpt-4.1-mini.json
```

Review the [complete summary](../artifacts/korean-evaluation-summary-openai-gpt-4.1-mini.json),
[raw generation report](../artifacts/generation-korean-eval-openai-gpt-4.1-mini.json),
and [fixed protocol](korean-evaluation.md). The report records actual final prompts,
answers, usage including cache counts, source hashes, timings, and cleanup; the
summary binds itself to the report's SHA-256. Earlier provider evidence is preserved.

## Failure and recovery validation

The 2026-09-27 follow-up added repeatable fault harnesses and readiness-polling
unit tests. The extension runtime and LambdaDB service were unchanged. No
generation-model API was called in this follow-up; the OpenAI/Gemini results
above remain evidence from their earlier runs.

### Real host and proxy with an emulated upstream

`npm run test:faults` completed at **2026-09-27 12:09:11 UTC** with **48 checks**,
**zero uncaught browser page errors**, and **zero remaining emulator collections**.
It runs the pinned SillyTavern, real Chromium, built-in proxy, settings UI, host
events, and interceptor dispatcher. The HTTPS upstream stores synthetic data in
memory and deliberately injects faults; it does not generate managed embeddings
or establish production service latency. The host's full `Generate` pipeline
and an LLM are not part of this test.

The added scenarios verified:

- A transport-gate upsert initially returns 503, then succeeds on its bounded
  readiness retry. Unit tests separately verify transient 429/503 and missing
  visibility retries stop at their configured limit, and authentication failure
  is not retried.
- Query 429/503 clears previously injected memory and preserves the original
  prompt. There is no immediate retrieval retry loop; a subsequent generation
  attempt recovers.
- Withholding a query response exercises the shipped **15-second** timeout;
  observed duration was **15.01 s**. The original prompt remains and the next
  request recovers. The product timeout and clock are not shortened by the test.
- The server captures a query result before each edit, native message deletion,
  native branch switch, or disable action. The old generation aborts, never
  injects, and the next request uses the current source and scope.
- Failed document deletion prevents a query from running. Retrying sync removes
  obsolete IDs and restores retrieval with the edited source.
- An upsert is applied in the emulator before its response is withheld. After
  the client times out (15.53 s measured from the source edit, including debounce),
  its source is deleted while memory is disabled. A real page reload loses the
  key and in-memory acknowledgements. After re-entry, the durable intent journal
  lets the new engine remove the uncertain record; exact current-scope IDs and
  absence of the deleted text are checked.
- Full owned-collection deletion waits for an in-flight accepted write before
  sending DELETE, then clears remote data and local journals.

The first harness attempts exposed host/UI assumptions, not a confirmed extension
runtime defect. A reload does not necessarily reopen the previous character chat;
opening it can close the settings drawer. Also, the pinned host's `deleteMessage`
only schedules a debounced save. Reloading immediately can restore the prior
on-disk source. The final test explicitly reopens the saved chat, opens the panel,
awaits `saveChat()` before reload, and asserts exact post-deletion source contents
afterward. This does not promise recovery of edits the host has not persisted.
The initial failed harness [report](../artifacts/fault-smoke-initial-reload-failure.json)
and [screenshot](../artifacts/fault-initial-reload-failure.png) are retained. Its one
remaining collection was only in the discarded emulator process; that failed
attempt did not demonstrate successful UI cleanup and contacted no live service.
The screenshot was opened and inspected during diagnosis.

Review the [successful fault report](../artifacts/fault-smoke.json), including
timeouts, injected operations, checks, and source hashes; the [browser runner](../scripts/browser-smoke.mjs)
and [fault scenarios](../scripts/fault-scenarios.mjs) define the exact boundaries.

### Live LambdaDB with controlled response loss and delay

`npm run test:live:faults` passed **15 checks**, including the existing live
transport/scope tests and three new response-loss/delay checks. The browser calls
the shipped client/engine through the actual proxy against a dedicated live
LambdaDB collection with managed embeddings. A test-only fetch wrapper controls
responses after real service operations; injected failures must not be described
as an observed LambdaDB outage.

- After a real upsert returns success, the wrapper consumes and discards that
  response and throws a simulated network error. A real strongly consistent query
  confirms the write exists remotely, and the durable journal contains its ID.
- Deleting that source and creating a fresh engine with the same local journal
  removes the uncertain live record. A real query confirms its absence, and it
  cannot appear in retrieved text. This recreates the engine, not the entire page;
  the separate emulator case above performs page reload and key re-entry.
- A real query response containing the old source is captured and delayed. The
  source is edited, the engine invalidated, and remote synchronization completed.
  The wrapper intentionally delivers the old response despite cancellation.
  The engine's generation guard rejects it, and subsequent live retrieval returns the
  new source without the old text.

Both owned collections were deleted and confirmed absent; no pending-cleanup
record remains. Browser storage and persisted settings contained no real key.
The final source/report scan found neither configured API key, and `.env.local`
remained unchanged, ignored, and untracked. The report's tested source hashes
match the final runtime and harness files. Review [live-faults.json](../artifacts/live-faults.json),
the [live runner](../scripts/live-smoke.mjs), and [live fault scenarios](../scripts/live-fault-scenarios.mjs).

These checks establish bounded recovery for the tested cases. They do not test
long-duration load, a genuine LambdaDB outage, server restart during a request,
physical network interruption, every possible delayed server-commit ordering,
or recovery of unsaved host chat changes. No general availability or performance
claim follows from injected failures.

## Three-mode repeated Korean comparison — 2026-09-27

`SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:comparison:live` completed
54 real generations across three histories, nine questions, three modes and two
repetitions. Both the LambdaDB and native vector indexes used real embedding
services. The report logged 403 execution checks, with no provider retry, followed
by ownership-checked remote cleanup and native purge/list-empty confirmation.
Execution success must not be read as quality success.

Memory off scored **18/18**, SillyMemory **6/18**, native Vector Storage **18/18**.
All twelve SillyMemory misses were `UNKNOWN`; their final prompts omitted the
required older facts. Recent facts and unknown-fact questions passed. Median input
tokens were 9,420 / 1,443 / 9,423; median generation times were 1.042 / 1.880 /
1.524 seconds in that order. Native retained all source history, including facts
not selected by retrieval. This does not demonstrate native recall under the same
800-token budget. Query dilution and passage selection need further diagnosis;
no retrieval-quality improvement was implemented during the frozen evaluation.

The raw post-generation SillyMemory prompt snapshot is cleared by host events.
The validated summary therefore measures injection from the actual outgoing
request and matching inspection text, then independently recounts it with the
pinned host tokenizer. All 18 injections fit the 800-token budget (maximum 781).
The raw snapshot-based budget checks alone are not sufficient evidence. Raw data
is preserved, and the correction is explicit in the summary and protocol.

The summary also validates sample uniqueness/completeness, fixed settings, source
hashes, grades, usage, isolation, and cleanup. The current unit suite passes 25
tests; runtime/script syntax checks pass. The final source/artifact secret scan
found neither configured key, and `.env.local` remained unchanged, ignored and
untracked. No pending cleanup record or owned test host process remained.

Review the [protocol, metrics, failures and interpretation](comparison-evaluation.md),
[raw evidence](../artifacts/generation-comparison-openai-gpt-4.1-mini.json),
[summary](../artifacts/comparison-summary-openai-gpt-4.1-mini.json), and
[zero-generation preflight](../artifacts/generation-comparison-setup-preflight.json).
The model-only cost estimates exclude embeddings and LambdaDB usage. This bounded
synthetic experiment does not establish real-user quality or general cost/latency
benefits.

## Retrieval-only diagnosis — 2026-09-27

The [diagnostic](retrieval-diagnostic.md) completed 36 query variants / 72 live
kNN requests through the real browser proxy, with zero text-generation calls.
Actual managed document vectors were exported and copied component-for-component
into a diagnostic cosine field. Identical-vector server search matched the local
exhaustive top-30 set in all 36 cases. The current recent-three-message query
ranked the six old-fact targets at 207, 228, 108, 39, 167 and 166 in exhaustive
search: all outside the candidate limit. The latest user message alone placed
all six at rank 1, and the unchanged 800-token selector included all six.

Ordinary mirror visibility was zero before and after the run; this verifies the
consistent-read path, not committed ANN graph accuracy. The internal managed query
vector is not exposed, so its one 29/30 candidate-set difference from a materialized
probe is not an ANN recall measurement. The failed initial visibility-gated attempt
is retained separately; both attempts confirmed cleanup of both owned collections.
The offline verifier checks artifact/source hashes, recomputes exact ranking,
validates server score order, and replays selection/token counting. The unit suite
passes 28 tests. No product runtime or previous answer score changed.

Review [raw v2 evidence](../artifacts/retrieval-diagnostic-v2.json),
[exported vectors](../artifacts/retrieval-vectors-v2.json), and the
[verified summary](../artifacts/retrieval-summary-v2.json).

## Latest-user/context policy validation — 2026-09-27

The runtime now uses `latest-user-plus-context-v1`: question-only and contextual
managed searches run concurrently, and source-validated results are interleaved
inside the existing budget. A failed query cancels its sibling and preserves the
full prompt; invalidation rejects late results. Unit tests pass 32 checks.

The tagged real-host emulator run passed 48 checks, including actual 15-second
timeouts and key re-entry after reload. The live service run passed 19 checks,
including response-loss recovery and eight held-out contextual retrievals. All
eight selected their target within 800 default-host tokens. The primary query
already retrieved every target, so this does not prove an added recall benefit
from the contextual query. The Korean contextual query itself missed its target;
the primary query recovered it. No answer model was called by that held-out run.

Two earlier live attempts stopped on test-harness assumptions (one response
barrier versus two parallel reads; a 30-result readiness limit versus 74 records).
Both cleaned up; their failure records remain alongside the successful run.
The answer follow-up completed 36/54 samples: 12/12 correct per mode on the two
completed scenarios. SillyMemory injected in ten and fell back to full history in
two; both fallback answers were correct. Seven old-fact trials included the fact
in memory, while one answered from the fallback. Its maximum successful injection
was 778/800 OpenAI-host tokens. Median input/generation values were 9,654/1.094 s
off, 1,443/2.226 s SillyMemory and 9,658.5/1.635 s native. These are partial results.

Both zero-generation continuations failed setup/preparation and cleaned up. A
separate real gate failed managed upsert, then a bounded probe completed ordinary
upsert in 0.193 s and managed upsert in 14.297 s, near the 15-second timeout. The
underlying backend/provider cause remains unknown. At that milestone, the remaining 18 revision samples and new-policy generation
lifecycle rerun were outstanding. The later lifecycle completion is recorded below.
The strict summary's explicit partial mode lists all missing sample indices and
separates successful injection from fallback. Source/usage/cleanup and independent
OpenAI injection token recount checks passed for the complete 36-sample prefix.
See the [policy, protocol and detailed evidence](query-policy.md).

## Current-policy lifecycle and batch diagnosis follow-up — 2026-09-27

The current-policy real-model lifecycle rerun completed all nine generations and
45 checks, including streaming, regenerate, swipe, edit/delete, branch isolation,
controlled retrieval failure and disable. Every saved answer matched its provider
response and expected synthetic fact; owned remote data was deleted and secrets
were absent from persisted settings. The runtime and evaluation source hashes
are unchanged from the partial comparison. Unit tests passed 32 checks again.

A new comparison continuation again failed preparation before model generation.
A bounded diagnostic used the first 50 messages of the revisions fixture and a
**test-only 45-second deadline**: ordinary upsert took 0.213 s, managed upsert
25.890 s, and managed queryText 1.019 s. The managed write exceeded the unchanged
15-second product limit. The user suggested concurrent bulk embedding usage on a
shared OpenAI account; provider/backend evidence and concurrent-job status are
unavailable, so the cause is not established.

Review the [policy follow-up and diagnostic commands](query-policy.md),
[current lifecycle report](../artifacts/generation-live-model-query-policy-resume.json),
and [batch diagnostic](../artifacts/live-probe-query-policy-batch-diagnostic.json).

## Completed current-policy comparison continuation — 2026-09-27

After a 50-document managed readiness probe completed within the shipped timeout,
the missing 18 samples completed. The ordinary query in that readiness probe
returned 503, so the probe remains marked failed overall; its successful managed
write/query observations justified continuation, not a general availability claim.

The original and resumed segments now cover all 54 fixed samples exactly once,
with identical runtime/evaluation source hashes and no provider generation retry.
All three modes scored 18/18. SillyMemory injected memory in 16 cases (all correct)
and retained full source after errors in two (also correct). Eleven of 12 old-fact
trials contained the answer in actual injected memory; one used fallback. Maximum
injection was 800 tokens. Median input/generation values were 9,420/1.094 s off,
1,439/2.086 s SillyMemory, and 9,423/1.582 s native. Provider load/cache conditions
varied across segments; these are descriptive synthetic measurements.

The strict complete summary verified source/settings, all sample identities,
answers/usage, source preservation, actual injection, independent token recount
and both cleanup boundaries. The 54-sample comparison and current-policy nine-
generation lifecycle rerun are complete. Earlier partial/failed artifacts remain.
Review the [complete summary](../artifacts/comparison-summary-query-policy-complete.json),
[18-sample continuation](../artifacts/generation-comparison-from-36-query-policy-resume-2.json),
and [full follow-up interpretation](query-policy.md).

## Final local commit review — 2026-09-28

The final review fixed independent cleanup boundaries and provider-attempt
accounting in the generation harness, and aligned package metadata with Node.js
20.12+. The shipped product runtime was unchanged. The unit suite now passes
34 tests. The real-host emulator fault rerun passed 48 checks with no browser
errors or remaining collections. The live LambdaDB/OpenAI lifecycle rerun passed
45 checks across nine actual model calls, including source changes, streaming,
branches, fallback, credential non-persistence, and verified owned cleanup.
No pending cleanup record remained.

The historical 54-sample comparison was strictly revalidated before modifying
the harness; it was not rerun. Its exact harness source hashes differ from this
final review, while all product runtime hashes are identical. See the
[review, file inventory, and evidence boundaries](review.md),
[final fault report](../artifacts/fault-smoke-final-review.json), and
[final live report](../artifacts/generation-live-model-final-review.json).
Raw reports remain Git-ignored local evidence. No public release or push occurred.

## Public source preparation — 2026-09-28

The user authorized a public repository and an open-source license. The project
now declares AGPL-3.0-only in its root LICENSE, package metadata, README and
settings notice, with links to the public source. The browser notice was opened
and visually checked in the pinned SillyTavern host. The license text matches the
standard AGPLv3 text shipped with that host; host and development dependency
licenses remain separate.

All 34 unit tests and runtime syntax checks passed. The real-host browser test
with the local LambdaDB emulator passed 22 checks, with no remaining emulator
collections. Review the local [browser report](../artifacts/browser-smoke-public-license.json).
This rerun used synthetic credentials and no live provider calls. The JavaScript
runtime is unchanged from the previous live evaluation; the settings change is a
source/license notice. This is source publication, not a stable release or a
hosted deployment.

## Synchronization progress and recovery UI — 2026-09-28

The status panel now distinguishes preparation, waiting for serialized writes,
ownership checking, outdated-chunk deletion, upload, search, and token budgeting.
Upload counts include earlier acknowledged chunks from the current session and
advance only after a response. A failed second batch in a 120-chunk history shows
50/120; manual Sync retries only the remaining 50+20 chunks. A lost response may
require re-upserting an accepted batch, and reload intentionally loses session
acknowledgements while retaining durable ID intent. Counts do not establish
embedding/index visibility or sustained throughput.

The implementation separates display ownership from prompt validity. Older
operations cannot overwrite a newer sync or a changed/disabled chat. Invalidation
also stops queued work and further deletion/upload batches after an already-started
request settles; uncertain IDs remain in the recovery journal. The client now
classifies network failures, request timeouts (including response-body timeouts),
and cancellation separately. HTTP auth/rate-limit/server errors get appropriate
reconnect or retry guidance. No batch sizes, request deadline, retrieval policy,
token budget, key persistence, or automatic retry policy changed.

Validation uses Node.js 20.12.0 and 24.15.0, pinned SillyTavern 1.19.0, and Chromium.
The 44 unit tests pass on both Node versions. Runtime, script and test syntax
checks pass. The local real-host fault harness exercises 63 checks, including:

- 0/120 before acknowledgement, 50/120 after partial failure, retry without
  resending the acknowledged first batch, and 119/120 during a subsequent edit;
- overlapping manual sync without duplicate uploads;
- authentication guidance, HTTP 429/503, and actual 15-second request timeout;
- held-query cancellation across edit/deletion/branch/disable;
- accepted-write response loss, persisted-source reload, key re-entry and recovery;
- drain-before-delete and complete emulator collection cleanup.

An intermediate rerun failed local journal cleanup after remote deletion had
already left zero collections. The preserved [failed report](../artifacts/fault-smoke-sync-status-final.json)
is not a successful validation result. A deterministic regression test reproduced
keys being skipped when Storage enumeration reordered after removal. Cleanup now
snapshots the owned namespace keys before removing them, preserving other
namespaces and host settings. The regression failed before the fix and passes
afterward; the final browser rerun also checks complete journal cleanup.

The host checkout is isolated from other worktrees. The harness now verifies
that the extension symlink points to the exact checkout under test. New generation
reports hash the status module, and summaries reject mixing its versions. Earlier
live comparison/generation reports remain historical evidence of their recorded
source hashes; they were not rerun or rewritten for this UI update. No live
LambdaDB or generation-provider calls were made in this validation.

Review the ignored local [final fault report](../artifacts/fault-smoke-sync-status-verified.json),
[Node 24 unit log](../artifacts/unit-sync-status-verified.log), and
[Node 20.12 unit log](../artifacts/unit-node20-sync-status-verified.log).
The [in-progress panel](../artifacts/sync-progress-sync-status-verified.png) and
[failed-batch panel](../artifacts/sync-failure-sync-status-verified.png) show synthetic
content only. Raw artifacts are local evidence and are not included in Git.

```sh
ST_SOURCE=/absolute/path/to/isolated/pinned/SillyTavern SM_ARTIFACT_TAG=sync-status-verified npm run test:faults
```

## Remaining validation

1. Expand evaluation of the latest-user/context policy to strongly ambiguous references and assistant-only continuation. The retrieval-only diagnostic identifies query construction as a sufficient cause of the original misses; the new implementation preserves a separate primary search. The small held-out retrieval fixture does not establish the incremental benefit of the second query; committed-index ANN recall remains a separate unverified boundary. Realistic personal-chat use and histories exceeding the full-context baseline remain unverified. The historical Gemini comparison still lacks one quota-blocked baseline sample; provider-specific streaming usage/accounting also needs broader coverage.
2. Expand the controlled fault coverage above to realistic sustained load, host/server interruption, and additional ambiguous commit orderings. Injected HTTP statuses and response delays do not establish actual service availability or outage behavior.
3. Expand the completed synthetic three-mode comparison to more repetitions, held-out realistic conversations and constrained-context cases. Measure user usefulness and total costs (including embeddings and LambdaDB), while controlling or explicitly reporting cache effects. The current 54-sample result is a bounded experiment, not a general performance benchmark.

Known limits: no cross-device concurrent editing; local bookkeeping loss can leave orphaned remote data; chat/character rename or complete chat deletion retains old remote scopes until full collection cleanup; external `docsUrl` query responses fail safely; third-party prompt-rewriting extensions are unverified; provider backup erasure is not proven. The public source is licensed under AGPL-3.0-only; a stable release and deployment remain separate from these prototype checks.
