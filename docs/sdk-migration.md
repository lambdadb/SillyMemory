# Official SDK migration

## Current SDK — 0.8.0

The extension now pins the released `@functional-systems/lambdadb` **0.8.0** and
ships its regenerated browser bundle (134,939 bytes; Apache-2.0 and Zod notices
unchanged). This is the stable release, not the temporary `dev` evaluation input.
See the [official release](https://github.com/lambdadb/lambdadb-typescript-client/releases/tag/v0.8.0).

Published-source comparison against 0.7.0 finds additive Bayesian query/candidate
budget types and serialization, Bayesian-aware reranking validation, and native
embedding configuration support. The existing legacy `managedEmbedding: true`
configuration remains supported. Retain it and the existing vector-only query;
SDK feature availability does not adopt Bayesian/reranking or certify its quality.
The underlying transport/body-reading code is unchanged, so the response-buffering
safeguard below remains necessary. No SDK source patch is introduced.

Parsing, validation order, sanitized error classification, side effects, ownership,
branch/ref isolation, session-only keys, direct CORS, explicit deadlines/retries,
inline-only handling, k/size 30, chunking and token budgets remain unchanged.
The application-client diff only removes a version-specific comment reference.
The extension remains an unreleased 0.4.0 candidate; this does not publish it.

Upgrade verification on SillyTavern 1.19.0 at the pinned revision below:

- `npm test`: 315/315 executed and passing, with no new SDK-internal tests.
- `npm run check`, `npm run check:release`, `npm run check:sdk`: pass; the locked
  browser bundle reproduces exactly. The lockfile changes only the SDK pin,
  tarball location and integrity; other dependencies and licenses are unchanged.
- `npm run test:recovery` with the local HTTPS LambdaDB emulator: 189 checks pass,
  including reload/restart, mutations, failure handling and write-drained deletion;
  zero emulator Collections remain. This is actual-host/emulator evidence.
- `node scripts/prompt-delivery-smoke.mjs`: 13 final-prompt scenarios and recorded
  repeated-passage packing pass with a local completion fixture, zero remaining
  Collections and no persisted session key. This is not a paid model quality run.
- `npm run test:collections:live -- --checkpoint-manager`: 41 actual-host/live
  managed-LambdaDB checks pass, including ordinary upsert/queryText, unchanged
  branch inheritance, checkpoint verification/resume, scoped deletion and owned
  discovery cleanup. Twelve document submissions include the transport test;
  frozen runtime hashes are unchanged and owned cleanup is confirmed.

No generation provider, new live Bayesian/reranker query, fresh quality cohort,
large-history rerun or new snapshot-retention experiment is part of this upgrade.
Historical 0.7.0 migration and temporary dev-SDK evidence retain their original
versions, results and availability; the following sections describe that migration.

Upgrade evidence is retained locally at
`/Users/steven/Dev/sillymemory-sdk-080/artifacts/archive/sdk-080-v1/evidence.tar.gz`:
1,127,108 bytes, 14 members, SHA-256
`a2bb26fa1034112dfb5d4c42ca453f14eefcc0f058d337fa7719109aaa23aed2`.
Every member was read back byte-for-byte; configured-secret matches were zero.
The bundle contains base fbae879, the candidate patch, reports/logs and scope;
this archive pointer was added after capture without changing runtime files.
It is local-only and unavailable in a fresh clone. Existing evidence is unchanged.

## Original migration decision and bounded scope

Use the official `@functional-systems/lambdadb` 0.7.0 client for collection,
branch, document and query operations. Keep the existing SillyMemory interface
and memory semantics. Acceptance requires the unit suite, a reproducible browser
bundle, the pinned-host lifecycle/recovery and prompt-delivery checks, and one
small actual-host/managed-LambdaDB lifecycle with confirmed cleanup. Use the
existing checkpoint-manager runner with at most four owned synthetic collections;
no generation model, reranker, large-history rerun or new quality experiment.

This change does not alter chunking, query construction, k/size 30, interleaving,
the token budget, document identity, stored fields or injected message ordering.
It does not remove commit confirmation or current-source verification in advance
of future LambdaDB changes. Temporal reasoning and reranker adoption remain
separate decisions.

## Transport and installation

`src/client.js` adapts the official SDK to the extension. Ownership checks,
branch selection, reconciliation and deletion confirmation remain application
responsibilities. SDK request serialization and response validation replace the
handwritten REST calls. Collection/ref timestamps returned by the SDK are Dates;
they are administrative metadata, not chat event times.

- The SDK and API key stay in private instance fields. Authentication reads the
  current session key; forgetting it aborts pending calls and prevents reuse.
- The custom HTTP transport limits authenticated requests to the configured
  project, omits credentials/cookies, strips diagnostic headers, rejects redirects
  and never forwards host CSRF headers. The endpoint is always explicit.
- Each operation retains the 15-second deadline and cancellation signal. Automatic
  SDK retries are disabled; existing explicit reconciliation/recovery owns retries.
- HTTP errors remain status-bearing, sanitized `ConnectionError` objects. SDK
  validation errors cannot expose source text, headers or raw error bodies.
- SDK logging is explicitly silent, including when a Node development environment
  sets `LAMBDADB_DEBUG`. No application logger receives request/response contents.
- The SDK's automatic external-result download transport is blocked before network
  access. Inline-only results remain the product contract for query/fetch/list.

SDK 0.7.0 source inspection and the response-body timeout regression exposed a
rejected auxiliary API promise when body reading fails after headers. The adapter
finishes body receipt within the same deadline before returning a Response to the
SDK. The SDK still parses and validates the bytes; no SDK source is patched and
no malformed response is repaired. This buffering suits the existing JSON,
inline-only API calls; it is not a streaming transfer implementation.

The committed `vendor/lambdadb.js` is built from the locked npm package using the
locked esbuild version, with third-party licenses in `vendor/LICENSES.txt`.
It requires no CDN, runtime package installation or build step for a Git URL
installer. `npm run build:sdk` regenerates both files; `npm run check:sdk` compares
bytes against a fresh build and runs in CI. The bundle includes the SDK and Zod.
Application developers still run `npm ci`. SDK upgrades must update the lockfile,
regenerate the bundle and verify transport/lifecycle behavior.

The browser emulators now include the API's required collection/branch/document
response fields. These are synthetic fixtures, not permissive runtime fallbacks.
Historical reports retain their original producers. The maintained diagnostic
runner also uses SDK operations rather than the removed raw-request interface.

## Next experiment design — not executed during the SDK migration

Follow-up: the [managed reranking evaluation](managed-reranking.md) records the
completed comparison, shared unsupported elaboration and decision to retain vector
retrieval. The original migration design below is preserved for context.

Question: does managed Jev reranking improve evidence delivery and final English
answers at the same memory budget, without losing existing correct answers?

First compare vector-only with vector plus the documented default Jev criteria.
Keep the same query construction, two-list interleaving, chunking, recent-message
window, branch, k=30, candidateSize=30, size=30 and 800-token memory budget.
Record candidate IDs/text and both retrieval/final ordering so retrieval variation
is not attributed to reranking. Do not silently combine a deeper candidate pool,
hybrid retrieval, custom criteria or a larger budget with this comparison.

Use existing failures only as labeled diagnostics. Freeze 12 new English cases
and their evidence/answers before traffic: current versus earlier state, explicit
revocation without replacement, later narration of an earlier event, future
plans versus completed events, speaker attribution, and unchanged-fact/multi-fact
controls. Include ordinary paraphrases rather than only lookup codes. This small
synthetic comparison is a product gate, not a representative public benchmark.

Temporal distinctions:

- Message ordinal expresses narration order within the selected chat path.
- Message creation time expresses when the message was sent, if reliably known.
- Event time/validity comes from what the passage actually says; it may be earlier,
  later, uncertain, relative or absent. Do not substitute ingestion, edit, snapshot
  commit or message creation timestamps for an event's effective time.
- Existing ordinal/speaker labels and chronological rendering stay unchanged in
  the first comparison. Metadata on a stored document does not automatically enter
  Jev input; only its selected indexed string fields do.
- Do not globally prefer the latest document or delete superseded historical
  statements. A current-state question and a historical question need different
  evidence. Selecting both a statement and its correction may be necessary.

Trace failures separately: absent candidate, low rank, budget exclusion, missing
correction/context, and incorrect generation despite complete delivered evidence.
Report paired answer accuracy, complete evidence delivery, memory/generation input
tokens, added query latency, applied/fallback status and available reranker usage.
Fallback rows are availability evidence, not successful Jev evaluations. No claim
of total cost savings follows from fixed generation input alone.

Bound the later answer run to 24 successful answers, at most 32 attempts with two
transient retries per sample/eight overall, using the established pinned host/model
and existing cleanup ownership records. Never retry a successful incorrect answer.
Require at least one gained correct answer, no loss of baseline correct answers,
and all isolation/budget/delivery checks before provisional adoption. Report a
negative or blocked result in the same reviewable change; do not create a sequence
of infrastructure-only PRs or tune repeatedly on observed answers.

If defaults fail specifically on temporal corrections, design a separate bounded
follow-up for indexed, explicitly labeled narration/event context or paired
correction selection. Custom criteria must not infer an event timestamp from a
message timestamp. No semantic fact graph, automatic event-time extraction or
schema expansion is approved or implemented by this migration.

## Validation

- 315 unit regressions passed, including SDK request routing, response validation,
  no hidden retries, cancellation/forget, body deadlines, silent logging and
  blocked external downloads. Syntax, release metadata and reproducible bundle
  checks passed. The bundle is 134,702 bytes (before HTTP compression).
- Actual SillyTavern 1.19.0 at
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127` plus Chromium/local HTTPS LambdaDB
  emulator: initial lifecycle 37 checks; final recovery run 189 checks, including
  the lifecycle, 429/503, timeouts, lost acknowledgements, edit/swipe/delete races,
  reload, host restart and 24 mutation cycles. Zero emulator collections remained.
- Actual pinned host plus local completion/LambdaDB emulators: all 13 final-prompt
  delivery scenarios and the repeated-passage packing case passed. Source was
  unchanged, session keys were absent from storage, zero collections remained.
- Actual pinned host plus live LambdaDB managed embeddings: all 41 lifecycle/
  checkpoint-manager checks passed, source hashes unchanged, cleanup confirmed.
  The run submitted 12 documents in total, including the transport test. Unchanged
  inherited branches/checkpoints/resumes did not resubmit history. No generation
  provider, reranker or answer-quality test was called.

The initial browser run preceded the response-body buffering correction. The
final recovery, prompt-delivery and managed runs include that correction. No SDK
source modification or LambdaDB/SillyTavern core change was required. This does
not certify new snapshot-retention behavior, concurrent devices, improved answer
quality, lower latency or future SDK versions.

Fresh Git URL installation through the pinned host UI passed 14 checks at
candidate `a99507ac883396f3a698ddf9ae1e6db7734f8960`. The extension loaded its committed
SDK bundle without an extension npm install/build, preserved preferences, cleared
the key on reload, made no provider requests and removed its disposable profile.
Later changes only complete this validation/evidence record.

## Retained evidence

Local-only archive:
`/Users/steven/Dev/sillymemory-official-sdk/artifacts/archive/sdk-migration-v1/evidence.tar.gz`

SHA-256 `292c2c9a156af151216c35b8a1b9a7b2f6a85c0047165a30b3b662357008784f`; 1,851,294 bytes, 28 members.
Every member was read back byte-for-byte and checked against its manifest. The
bundle retains reports/logs, exact candidate source, the initial-browser producer
overlay and the validation patch. Configured-secret scans passed on candidate
files and decompressed archive entries. No historical evidence was deleted.
The archive pointer was appended after capture; runtime files are unchanged.

## Final review correction

PR #62 review found that the maintained generation producer omitted the new SDK
bundle from source identities, allowing an SDK-only change to escape a resume or
aggregation check. Initial/final maps, frozen plans, summary validators and the
related benchmark producer maps now include `vendor/lambdadb.js` and
`package-lock.json`. Regressions reject missing/mixed SDK identities. Historical
reports retain their original source/validator archives; no report was rewritten
or paid result relabeled. Runtime and the measured SDK bundle are unchanged.

## Deployed Bayesian follow-up

The subsequent [deployed API evaluation](bayesian-sdk-validation.md) temporarily
uses the dev SDK for actual server Bayesian/Jev requests, English long-dialogue
results and remaining temporal failures. The dependency, bundle and SDK-specific
test are archived experiment inputs, not product changes. That evaluation leaves
its producing revision on SDK 0.7.0; it does not pin the current product version.
The current dependency is recorded in [package.json](../package.json); separately
reviewed stable upgrades do not change these historical results.
