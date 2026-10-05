# Managed reranking evaluation

Latest: [shared-question evaluation](rerank-intent.md) improved the medicine
secondary rank but failed its answer gate. Production vector retrieval remains
unchanged; the unexecuted confirmation stage is explicitly recorded.

Follow-up: [the staged rescue comparison](rerank-rescue.md) found benefits from
hybrid + Jev, but a new baseline-correct answer loss prevents default adoption.
The original vector + Jev results below remain unchanged.

## Decision

Keep production vector-only. The completed 24-answer comparison found no semantic
answer gain from default Jev on this set. Both arms delivered all required evidence
in all 12 cases. The one automatic score gain was only a wording difference.
Both also added the same unsupported detail in the multi-fact case. This does not
justify enabling reranking by default or claiming that it solves stale memories.

## Method and scope

The [pre-run protocol](managed-reranking-protocol.md) and
[12 English cases](../tests/fixtures/rerank-v1.json) were committed at
`7af0568` before provider traffic. The comparison uses the actual pinned
SillyTavern 1.19.0 generation path, official LambdaDB SDK 0.7.0, browser CORS,
managed embeddings, and OpenAI `gpt-4.1-mini-2025-04-14`. It compares vector retrieval
with the same query plus managed Jev `jev-1.13.0` using default relevance criteria.
There is no production retrieval or temporal-schema change.

Both arms keep k=30, size=30, candidateSize=30 for reranking, consistent reads,
explicit chat branch and owner/scope filters, current two-query construction and
interleaving, current chunking, recent window=4, and an 800-token memory budget.
The host context is 32,768 tokens; output cap=256 and temperature=0. These compact
synthetic conversations do not establish behavior under natural 32K overflow.
Each case has two answer runs in alternating arm order; there is no answer retry,
parameter sweep, or post-result fixture tuning.

The preflight uses a separate owned collection and verifies applied score metadata,
foreign owner/scope exclusion, sibling-branch exclusion, and deletion visibility.
Answers are produced through SillyTavern, with the existing local test bridge
forwarding the host's requests to OpenAI; the bridge is not a product component.
The reranking hook receives the existing query and stored text, never the expected
answer. The SDK returns final scores, original retrieval scores and rerank status.
Scores are ranking signals, not probabilities that a remembered fact is current.

## Results — 2026-10-05 KST

| Observation | Vector | Vector + Jev |
| --- | ---: | ---: |
| Completed answers | 12 | 12 |
| Frozen exact-string matches | 4/12 | 5/12 |
| Required evidence delivered | 12/12 | 12/12 |
| Median injected memory tokens | 756.5 | 756.5 |
| Median provider input tokens | 938.5 | 936 |
| Total provider input / output tokens | 11,310 / 69 | 11,260 / 71 |
| Median individual query latency | 322 ms | 673.5 ms |
| Median engine retrieval latency | 689.6 ms | 1,055.7 ms |
| Median host generation latency, excluding initial pacing | 1,796.7 ms | 2,275.4 ms |
| Applied reranking query responses | N/A | 24/24 |

All 12 pairs had identical candidate sets per query. Selected passage sets changed
in all 12 pairs, but complete evidence delivery did not. All 289 delivered passages
were verified against current local document IDs and exact content, and the maximum
memory size was 795 tokens. Jev used default-relevance-v1 and scored all 30 candidates
per evaluation query; there were no fallback or skipped evaluation responses.

The roughly 352 ms difference between median query latencies is modest in this run;
it is not the reason to reject adoption. The missing evidence is a semantic quality
gain. Tiny generation-token differences do not establish savings after reranker
costs. The response exposes rerank duration/counts but no billable token usage;
managed embedding and reranker costs remain unmeasured. One run cannot establish
provider reliability or statistical latency differences.

Manual inspection of all source facts and answers found the same core answers in
both arms. Eleven cases had supported answers; in `two-facts`, both used the correct
locations but changed **blue tin** into **blue paint tin**. The distractors mention
blue paint tins, but do not establish that the key's container is a paint tin. Treat
this as shared unsupported elaboration, not a reranker-specific regression. This
inspection is transparent post-run interpretation, not a replacement blinded metric.

| Case | Vector answer | Jev answer |
| --- | --- | --- |
| current-location | In the attic cabinet. | In the attic cabinet. |
| earlier-location | In the kitchen drawer. | In the kitchen drawer. |
| revoked-access | NO | NO |
| canceled-meeting | NO | NO |
| flashback-current | Mira lives in the hill cottage. | Mira lives in the hill cottage. |
| flashback-past | Theo was the orchard gardener. | Orchard gardener. |
| future-location | The silver lantern is in the pantry. | The silver lantern is still in the pantry. |
| completed-location | On the balcony. | On the balcony. |
| speaker-preference | Jasmine | Jasmine |
| speaker-possession | Theo owns the wool scarf after the loan. | Theo owns the wool scarf after the loan. |
| stable-fact | Willow | Willow |
| two-facts | The astronomy journal is in the desk drawer; the key is in the blue paint tin. | The astronomy journal is kept in the desk drawer; the key is kept in the blue paint tin. |

The mechanical `adoptionGate: true` comes solely from `flashback-past`: “Theo was the
orchard gardener.” versus “Orchard gardener.” Both are supported. Consequently the
product decision is **do not adopt**, despite that boolean. The maintained runner
names this screen `exactMatchGate` to avoid implying a product adoption decision.
The preserved grader and its output are not retrospectively changed to manufacture
a better result.

## Execution, cleanup and validation

The live run completed 24/24 provider calls with no retries. It created three owned
collections, submitted 509 documents and made 52 query calls including gate and
preflight activity, within the frozen caps. No source or setting changed during
execution. All preflight isolation/deletion checks passed, and real keys were absent
from browser storage and persisted host settings.

The raw report intentionally retains `passed: false` and `cleanupComplete: false`:
the existing generation runner waited for an obsolete UI completion phrase. The
actual host deletion returned 200, followed by GET 404. A separate read-only official
SDK verification after host shutdown confirmed all three recorded collections
returned 404 and every test owner's collection list was empty. No recovery deletion
or paid answer rerun was needed. The pending ledger was preserved and cleared only
after this verification. The runner now waits for the current shared completion
phrase, also used by the existing browser smoke harness.

Independent evidence verification also found that the final report's hash map
omitted `src/delivery.js`, although the initial plan included it and the end-of-run
full experiment hash comparison passed. All 21 frozen file hashes match producer
`7af0568`; the omitted final entry is recorded explicitly in the verification
receipt. The runner now includes every initial experiment file in its final hash
map. These post-run harness corrections do not change the measured runtime,
queries, fixtures or answers; the original source and reports remain preserved.

Local validation passed 319 unit tests, runtime/script syntax, locked SDK bundle
rebuild and release metadata checks. The actual pinned host + Chromium + local
HTTPS LambdaDB emulator passed 37 browser lifecycle checks, including deletion,
reload/key loss, edits, swipe, branch isolation and races, with zero emulator
collections remaining. This is separate from the real-provider comparison above.
The corrected generation-runner teardown was source-checked; the shared completion
phrase was exercised in browser smoke, not by repeating 24 paid generations.

## Evidence retention

Live producer: `7af0568` (committed before traffic). The raw failed-cleanup report is
preserved alongside the separate successful cleanup receipt, frozen plan, answers,
query scores, verification scripts, unit/browser logs, complete source tar and
post-run harness patch. Archive members were read back byte-for-byte and the
candidate source and decompressed archive passed a configured-secret scan.

Local-only archive (not available in a fresh clone):
`/Users/steven/Dev/sillymemory-managed-reranking/artifacts/archive/managed-reranking-v1/evidence.tar.gz`

- SHA-256: `9a3081415fce4703aa111c019c6167bf859a16090dd7546815a11c874cb6bf03`
- Size: 1,095,200 bytes; 18 members including the per-file checksum manifest.
- Preserve this archive before removing or detaching the worktree. No historical
  evidence was deleted, and no unresolved remote cleanup record remains.

## Interpretation boundaries

The frozen automatic grader uses exact normalized strings. It can reject a correct
sentence containing an article, preposition or subject. Its `correct`,
`failureClass` and `adoptionGate` fields are mechanical diagnostics; a formatting
failure is not evidence of a memory or reasoning error. Preserve the original
scores and inspect every answer against its source when making the product decision.
Do not rewrite the frozen grader after seeing the answers.

Message ordinal describes narration order. It does not supply event time. The
fixtures put current, historical, revoked and planned states explicitly in the
passage text, including reminders that a flashback is not a new event. This is a
small, relatively explicit diagnostic set, not a representative character-chat
benchmark, a blind semantic evaluation, or proof that default Jev resolves implicit
contradictions. No timestamp field or automatic event-time extraction is added.

Jev cannot recover a document outside the candidate pool. Reranking relevance also
does not guarantee that both a prior statement and its correction survive an
800-token packing step. Existing local revision validation and branch filters
remain responsible for excluding edited/deleted or unrelated source material.

## Reproduction

Use the recorded producer and pinned host with the extension symlink pointing to
that checkout. Keep credentials in the original ignored environment file:

```sh
npm ci
SM_ENV_FILE=/absolute/path/to/.env.local \
ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
SM_MODEL=gpt-4.1-mini-2025-04-14 \
SM_ARTIFACT_TAG=independent-run \
node scripts/generation-smoke.mjs --rerank
```

The runner writes the source/settings plan before traffic, refuses report or
pending-ledger overwrite, enforces provider/collection/document/query caps, records
partial results and verifies owned collection deletion. Paid reruns require an
explicit experiment purpose and bounded authorization; they are not a CI step.

## Next decision

Do not add a default reranker toggle, temporal schema, or timestamp-based ranking
on the strength of this run. The API integration is usable, but this set largely
has an evidence-delivery ceiling and explicit temporal wording. A later bounded
quality task should freeze difficult existing long-dialogue failures
before traffic and use a predeclared semantic rubric that separates answer format,
unsupported elaboration, missing candidates, and correction passages excluded by
packing. Keep candidate depth and budget fixed for the reranker contrast. Do not
reuse this set for successive criteria tuning or infer event time from message time.
