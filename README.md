# SillyMemory

Long-term memory for SillyTavern.

**Powered by LambdaDB**

An installable, experimental UI extension for character chats. SillyMemory keeps recent messages intact and replaces older plain-text history with relevant source passages under a fixed memory token budget. It uses LambdaDB managed embeddings through SillyTavern's built-in CORS proxy. No server plugin or LambdaDB modification is required.

**Validation status:** experimental. The latest-user/context policy completed all **54 scheduled real OpenAI answers** across the original and resumed segments. Each mode scored 18/18; SillyMemory actually injected memory in 16 answers and used the full-source error fallback in two. All injections fit 800 tokens. Median input tokens were 9,420 without memory and 1,439 with SillyMemory; median generation times were 1.094 s and 2.086 s. The current-policy nine-generation lifecycle rerun passed all 45 checks, including streaming, regenerate, swipe, edits/deletion and branches. Unit tests (34), real-host emulator fault checks (48), and live retrieval/recovery checks (19) also passed. Large managed writes intermittently exceeded the unchanged 15-second request deadline during testing, so this does not establish general reliability or uniformly successful retrieval. See [query policy, complete results and service observations](docs/query-policy.md), the [fixed protocol](docs/comparison-evaluation.md) and [validation record](docs/validation.md). The original policy's 6/18 result remains historical evidence.

## Supported host

The development baseline is **SillyTavern 1.19.0**, pinned to commit [`06bde939fb1e9c4c8d8641d810f0a916b5bce127`](https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127). Other revisions are unverified. Use a browser with Web Crypto, Web Locks, and `AbortSignal.any` (the automated browser test uses Chromium). Serve SillyTavern on localhost or HTTPS. One active SillyMemory tab per SillyTavern account/browser profile is enforced with a Web Lock.

## Install locally

1. Install the pinned SillyTavern revision using its normal Node.js setup. Run `npm ci` in that checkout.
2. Copy this repository into `SillyTavern/data/<user-handle>/extensions/sillymemory`, or symlink it into `SillyTavern/public/scripts/extensions/third-party/sillymemory` for local development. The extension itself has no runtime npm dependencies or build step. Do not install two copies.
3. Set this in SillyTavern's `config.yaml` and **restart SillyTavern**:

   ```yaml
   enableCorsProxy: true
   ```

   Preserve SillyTavern's host/IP/private-address protections and authentication configuration. Do not expose an unauthenticated proxy on a public interface. See the [official configuration reference](https://docs.sillytavern.app/administration/config-yaml/#cors-proxy-configuration).
4. Reload SillyTavern. Open **Extensions → SillyMemory**. Enter your region-specific HTTPS base origin, project name, and project API key from LambdaDB. The endpoint field accepts an origin such as `https://<regional-host>`, without `/projects/...`. The extension adds the project path. There is no hardcoded global endpoint.
5. Click **Use key for this session**. The input is immediately cleared. The key lives only in the client instance's browser memory, never in saved settings, local/session storage, a URL, or extension logs. A reload or **Forget key** requires re-entry. Other trusted extensions and the browser/server runtime can still observe network requests; this is not an isolation boundary against malicious extensions.
6. Click **Test synthetic upsert / query / delete**. This creates a dedicated `smtest_<random>` collection, upserts a synthetic story, queries `knn.queryText`, deletes its document, verifies it no longer appears, then deletes the owned test collection. This consumes LambdaDB resources and inference usage. The test must pass before **Create memory collection** becomes available.
7. If a test fails, use **Clean up test collection**. Pending test identity is preserved across reloads so cleanup can be retried after reconnecting. A failed cleanup is not reported as successful.
8. Click **Create memory collection**, select a character chat, then enable memory. Default settings retain 12 recent messages and allow 800 memory tokens, including passage labels and the wrapper. Configure the bounds in the panel. Disable built-in Vector Storage chat vectorization and other prompt-rewriting memory extensions for this prototype.

The planned GitHub repository is `lambdadb/sillymemory`. It has not been created/published by this implementation; there is no public installation URL yet.

## Use and behavior

- Send messages normally. Message generation, edits, selected swipes, deletion, chat changes, and reload/re-enable trigger reconciliation. Click **Sync this chat** to retry after a network failure.
- Only older plain-text messages are embedded. Recent messages stay in the generation array. Files, media, and tool messages are not indexed; group chats and chats with system tool invocations are bypassed.
- Character avatar identity, chat filename (including native branch filenames), and installation owner identity define a strict hashed scope. A native branch gets its own index; inherited chat text is reindexed there.
- Before generation, the extension synchronizes current source text and retrieves matching chunks with `knn.queryText`: the latest user message is searched alone, and separately with the preceding two messages as context. It interleaves the two result lists, validates every result against current local text and IDs, and token-counts the complete injected string using the host tokenizer. Macro braces and legacy macro markers are shown with fullwidth delimiters so recalled dialogue stays literal during host prompt assembly.
- If at least one valid passage fits, older eligible full messages are removed from the ephemeral prompt array and the selected passages are injected. Source chat messages on disk are not modified. If nothing fits or an operation fails, the original prompt remains. A mid-request chat change aborts that generation; generate again in the new chat.
- **Last injected memory** shows the source message numbers, speakers, passages, and token count. A separate total model prompt budget remains SillyTavern's responsibility; oversized recent history may still be truncated by the host.
- **Disable** stops synchronization/retrieval and clears the injection. It retains remote data. **Forget key** also disables memory. Reload starts disabled and requires key re-entry.
- **Delete all owned remote memory** disables memory, drains outstanding writes, checks collection ownership tags, deletes the installation's memory collection, and waits until its API lookup returns 404. It affects every indexed chat and branch in that collection. Local SillyTavern chats are preserved. This is not proof of physical erasure from provider backups.

## Data, usage, and cleanup

A LambdaDB project/API key with collection create/read/delete and document write/query access is required. Source text, speaker labels, message/chunk positions, hashed scope/revision identities, and query text go through your SillyTavern server to LambdaDB. LambdaDB sends embedding inputs to its managed embedding provider (currently configured here as OpenAI `text-embedding-3-small`). Each retrieval submits up to two distinct queries concurrently. Managed embeddings incur inference usage; storage and retrieval have service costs. See [managed embeddings](https://docs.lambdadb.ai/guides/collections/managed-embeddings) and [LambdaDB costs](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Ordinary document deletion removes current retrievable records; snapshot retention and provider backup policies are separate. The extension requests one-day snapshot retention for its collections and creates no Tags/savepoints. Removing the extension, deleting a SillyTavern chat, renaming a chat, changing browsers, or clearing browser storage does **not** automatically delete every remote record. Renamed chats get a new scope; previous scopes remain until full cleanup. Delete the owned memory collection and any pending test collection before uninstalling or changing connection settings. If local bookkeeping is lost, inspect your LambdaDB project's `sillymemory_*` / `smtest_*` collections and ownership tags to clean up the correct collections manually.

## Development and verification

See the [final local review](docs/review.md) for the commit scope, review fixes,
verification boundaries, and file inventory. Raw `artifacts/` reports are ignored
local evidence and are not included in a fresh clone; checked-in documents retain
the measured results and limitations. Run the corresponding commands to create
new reports. Historical summaries require their exact recorded source versions.

```sh
npm ci
npm test
npm run check
npx playwright install chromium
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:browser
```

The browser harness starts an isolated SillyTavern on localhost port 18126 (override with `ST_TEST_PORT`), creates synthetic data, and runs a local HTTPS LambdaDB API emulator. It trusts a temporary self-signed test certificate only in that child server process; global TLS verification stays enabled. It does not contact LambdaDB, call an LLM, or use real credentials. Results are written to ignored `artifacts/browser-smoke.json` and `artifacts/settings.png`.

For repeatable failure and recovery checks, run `npm run test:faults`. This extends the real-host browser test with controlled upstream 429/503 responses, the shipped 15-second request timeout, delayed-query cancellation during edits/deletion/branch changes/disable, accepted writes with missing acknowledgements, actual page reload and key re-entry, and deletion while a write is outstanding. Its latest run passed 48 checks with no uncaught browser errors or remaining emulator collections. It uses synthetic credentials and a local emulator; it does not establish actual LambdaDB outage behavior. Review `artifacts/fault-smoke.json`.

To explicitly run the live test, put `LAMBDADB_BASE_URL`, `LAMBDADB_PROJECT_NAME`, and `LAMBDADB_PROJECT_API_KEY` in the Git-ignored `.env.local`. Keep the extension symlink pointing at this checkout, then run:

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:live
```

This starts an isolated host on localhost port 18127 (`ST_LIVE_PORT` overrides it), creates dedicated `smtest_*` and `smlive_*` collections, and uses only synthetic text. It incurs real service usage. The harness reads the credential file into process memory and passes the key to the browser client without changing normal extension key storage. It disables host log output and records only check names/status codes, not credentials or response bodies. Cleanup checks ownership and confirms collection disappearance. If cleanup fails, `artifacts/live-pending.json` preserves the exact non-secret resource identities; resolve cleanup before another run. Results are in `artifacts/live-smoke.json`. This live harness tests the shipped client and memory engine in a real browser; the complete settings-button/LLM flow is a separate test boundary.

Run `npm run test:live:faults` to additionally discard an acknowledged real upsert response and delay a real query response across an edit. The browser test wrapper injects these failures after the real service/proxy operation; it does not provoke a service outage. The latest run passed 15 checks, including durable-journal recovery with a fresh engine, rejection of stale live results, and owned collection cleanup. It calls live LambdaDB but no generation model. Evidence and any failed-cleanup record use `artifacts/live-faults.json` and `artifacts/live-faults-pending.json`. The emulator fault test exercises actual page reload; this live response-loss case recreates the engine while retaining browser storage. See the [validation record](docs/validation.md) for boundaries and the host save/reload caveat. Fault commands overwrite their default reports; use `SM_ARTIFACT_TAG` to preserve a named run.

To exercise the complete settings, chat, and generation path with live LambdaDB:

```sh
ST_SOURCE=/absolute/path/to/pinned/SillyTavern npm run test:generation
```

This uses the same LambdaDB credentials, a fresh host on localhost port 18128 (`ST_GENERATION_PORT` overrides it), and a deterministic local response fixture. It runs nine generations, including streaming, regenerate, and swipe; records the final outgoing messages; and deletes the owned collections through the extension's UI. The fixture is not an LLM and cannot measure answer quality. Review `artifacts/generation-fixture-model.json`. A failed cleanup leaves `artifacts/generation-fixture-model-pending.json`; resolve those resources before retrying.

For an actual generation model, additionally put `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` in `.env.local`, then run `npm run test:generation:live`. The endpoint must support compatible `/chat/completions` requests and SSE streaming; include the API prefix in the base URL (for example, `https://<provider>/v1`). This sends the nine synthetic test prompts to that provider and incurs model usage. A loopback bridge holds the provider key in process memory; the host only receives the bridge URL. The bridge is test infrastructure, not part of the extension. Logs are suppressed, and the report contains synthetic prompts, provider replies/usage, and request options with known credentials redacted. Live-mode output and pending resource records use `generation-live-model` filenames. Each live response must complete normally, match the host-saved message, and answer the narrow synthetic fact correctly; this is not a broad quality benchmark. Live runs space generation starts by at least 15 seconds and use a 256-token output limit. Optional `LLM_REASONING_EFFORT` configures the host request (for example, `low` for the tested Gemini model).

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

See [architecture](docs/architecture.md), [pinned contracts](docs/contracts.md), and [validation and remaining checks](docs/validation.md).

## Deferred

Direct browser CORS, persistent keys, versioned savepoints/rollback, Data Bank, World Info, multi-user administration, and external result downloads are outside this MVP. The synthetic built-in-memory comparison is documented separately; no general recall-quality, latency, or total operating-cost improvement is claimed. License selection and public release are still pending review.

The [latest-user/context query policy](docs/query-policy.md) documents the retrieval change, its regression and held-out checks, and commands for reproducing them. The original comparison and vector diagnostic remain historical evidence from their recorded source hashes.
