# SillyMemory

Long-term memory for SillyTavern.

**Powered by LambdaDB**

An installable, experimental UI extension for character chats. SillyMemory keeps recent messages intact and replaces older plain-text history with relevant source passages under a fixed memory token budget. It uses LambdaDB managed embeddings through SillyTavern's built-in CORS proxy. No server plugin or LambdaDB modification is required.

**Validation status:** experimental. The current suite passes 68 unit tests on Node.js 20.12.0 and 24, plus 188 real-host/emulator checks including two host SIGKILL/restarts and 24 repeated chat/branch cycles. A new fixed 12-case English/Korean evaluation made 24 real OpenAI requests: memory-on selected the target and answered with its code in 12/12 cases, with 11/12 strict code-only answers. One Korean continuation added a suffix. Maximum injection was 797/800 tokens, and owned remote collections were cleaned up. These are small synthetic cases and bounded repetition, not general quality or long-duration reliability guarantees. See [the held-out protocol and results](docs/heldout-recovery.md), [earlier development cases](docs/recall-challenges.md), and [validation record](docs/validation.md).

The real Git URL installation/update check passed 17 assertions for the `SillyMemory` URL, including settings retention and session-key clearing. This tested two unreleased 0.1.0 commits, not an upgrade between published releases; see the [installation validation](docs/validation.md#repository-naming-and-installation--2026-09-28).

## Supported host

The development baseline is **SillyTavern 1.19.0**, pinned to commit [`06bde939fb1e9c4c8d8641d810f0a916b5bce127`](https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127). Other revisions are unverified. Use a browser with Web Crypto, Web Locks, and `AbortSignal.any` (the automated browser test uses Chromium). Serve SillyTavern on localhost or HTTPS. One active SillyMemory tab per SillyTavern account/browser profile is enforced with a Web Lock.

## Install

1. Prepare SillyTavern **1.19.0** and Git on the host. Other host revisions are unverified.
2. Open **Extensions → Install extension**, enter `https://github.com/lambdadb/SillyMemory`, leave the optional branch/tag field empty, and choose **Install just for me** (or **Install** for a non-admin account). Review SillyTavern's third-party-extension prompt and confirm. The default branch is `main`; `develop` and PR branches are for development. The extension has no runtime npm dependencies or build step. Do not install two copies.
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

For local development, symlink the checkout into
`SillyTavern/public/scripts/extensions/third-party/sillymemory`; do not also install
a user-scoped copy. Manual copies without Git metadata cannot use the normal
Git-based update flow.

## Version and updates

**0.1.0 is experimental.** See [CHANGELOG.md](CHANGELOG.md) for changes and
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

For rollback and maintainer publication steps, see [RELEASING.md](RELEASING.md).
Use only a tag listed in the published releases for rollback. Disable memory
first if an update causes a problem; code rollback does not restore chat edits
or undo remote data changes.

## Use and behavior

- The status panel shows preparation, queued writes, ownership checks, outdated-chunk deletion, upload, search, and token budgeting. Upload totals count current older chunks; confirmed chunks include this session's earlier successful writes. Counts advance only after a service response, not merely after sending a request. They do not measure embedding/index visibility or bytes transferred. A failed operation keeps the last confirmed count and shows retry guidance.
- Send messages normally. Message generation, edits, selected swipes, deletion, chat changes, and reload/re-enable trigger reconciliation. Click **Sync this chat** to retry after a network failure. For authentication errors, re-enter the key using **Use key for this session** first; for rate limits or timeouts, wait before retrying. Successful batches are skipped within the session. A lost response can require an idempotent re-upsert, and reload conservatively rechecks current records after key re-entry and re-enabling memory. Progress is not saved across reloads.
- Only older plain-text messages are embedded. Recent messages stay in the generation array. Files, media, and tool messages are not indexed; group chats and chats with system tool invocations are bypassed.
- Character avatar identity, chat filename (including native branch filenames), and installation owner identity define a strict hashed scope. A native branch gets its own index; inherited chat text is reindexed there.
- Before generation, the extension synchronizes current source text and retrieves matching chunks with `knn.queryText`: the latest user message is searched alone, and separately with the preceding two messages as context. Explicit **Continue** generation instead anchors on the latest message being extended; regenerate and swipe still use the user question. It interleaves the two result lists, validates every result against current local text and IDs, and token-counts the complete injected string using the host tokenizer. Macro braces and legacy macro markers are shown with fullwidth delimiters so recalled dialogue stays literal during host prompt assembly.
- If at least one valid passage fits, older eligible full messages are removed from the ephemeral prompt array and the selected passages are injected. Source chat messages on disk are not modified. If nothing fits or an operation fails, the original prompt remains. A mid-request chat change aborts that generation; generate again in the new chat.
- **Last injected memory** shows the source message numbers, speakers, passages, and token count. A separate total model prompt budget remains SillyTavern's responsibility; oversized recent history may still be truncated by the host.
- **Disable** stops synchronization/retrieval and clears the injection. It retains remote data. **Forget key** also disables memory. Reload starts disabled and requires key re-entry.
- **Delete all owned remote memory** disables memory, drains outstanding writes, checks collection ownership tags, deletes the installation's memory collection, and waits until its API lookup returns 404. It affects every indexed chat and branch in that collection. Local SillyTavern chats are preserved. This is not proof of physical erasure from provider backups.

## Data, usage, and cleanup

A LambdaDB project/API key with collection create/read/delete and document write/query access is required. Source text, speaker labels, message/chunk positions, hashed scope/revision identities, and query text go through your SillyTavern server to LambdaDB. LambdaDB sends embedding inputs to its managed embedding provider (currently configured here as OpenAI `text-embedding-3-small`). Each retrieval submits up to two distinct queries concurrently. Managed embeddings incur inference usage; storage and retrieval have service costs. See [managed embeddings](https://docs.lambdadb.ai/guides/collections/managed-embeddings) and [LambdaDB costs](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Ordinary document deletion removes current retrievable records; snapshot retention and provider backup policies are separate. The extension requests one-day snapshot retention for its collections and creates no Tags/savepoints. Removing the extension, deleting a SillyTavern chat, renaming a chat, changing browsers, or clearing browser storage does **not** automatically delete every remote record. Renamed chats get a new scope; previous scopes remain until full cleanup. Delete the owned memory collection and any pending test collection before uninstalling or changing connection settings. If local bookkeeping is lost, inspect your LambdaDB project's `sillymemory_*` / `smtest_*` collections and ownership tags to clean up the correct collections manually.

## Development and verification

Start ongoing work from `develop` and open feature/fix PRs against `develop`.
Promote validated changes to the public `main` branch through a separate PR.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and verification workflow.

The GitHub Actions workflow runs unit regressions and syntax checks for the
runtime, scripts, and tests on pull requests and pushes to `main` or `develop`, using the
declared minimum Node.js 20.12.0 and Node.js 24 with the npm lockfile. This workflow
does not use LambdaDB or model credentials.
Browser/emulator checks and paid live integration runs remain separate commands
below; a green CI result alone does not establish live integration success.

See the [final local review](docs/review.md) for the commit scope, review fixes,
verification boundaries, and file inventory. Raw `artifacts/` reports are ignored
local evidence and are not included in a fresh clone; checked-in documents retain
the measured results and limitations. Run the corresponding commands to create
new reports. Historical summaries require their exact recorded source versions.

```sh
npm ci
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

See [architecture](docs/architecture.md), [pinned contracts](docs/contracts.md), and [validation and remaining checks](docs/validation.md).

## Deferred

Direct browser CORS, persistent keys, versioned savepoints/rollback, Data Bank, World Info, multi-user administration, and external result downloads are outside this MVP. The synthetic built-in-memory comparison is documented separately; no general recall-quality, latency, or total operating-cost improvement is claimed. Stable release readiness remains under evaluation.

The [latest-user/context query policy](docs/query-policy.md) documents the retrieval change, its regression and held-out checks, and commands for reproducing them. The original comparison and vector diagnostic remain historical evidence from their recorded source hashes.

## License

Copyright (C) 2026 SillyMemory contributors.

SillyMemory is free software, licensed under the **GNU Affero General Public
License, version 3 only** (`AGPL-3.0-only`). You may redistribute and modify it
under that license. It is provided without warranty; see [LICENSE](LICENSE) for
the complete terms. SillyMemory uses the same license family as its
[SillyTavern host](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/LICENSE).

This repository contains the extension's source and development tools; the
SillyTavern host and development dependencies retain their own licenses.
