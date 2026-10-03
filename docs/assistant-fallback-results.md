# Assistant-only context fallback

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Runtime policy `latest-anchor-with-assistant-fallback-v4` keeps the prior-user
query unchanged whenever that user turn exists. With no preceding nonempty user
turn, it uses the preceding assistant message instead. The generation anchor,
replacement-answer exclusion, two-query maximum, 30 candidates, interleaving,
local-source validation and token budget are unchanged. This is a narrow fix for
first questions in imported assistant-only histories; it does not solve ordinary
assistant-topic references when an unrelated earlier user message exists.

## Why the narrower change

The preceding [three-stream comparison](assistant-topic-results.md) showed budget
competition. Five offline rank-fusion/density candidates were then replayed on
those recorded hits. Summed reciprocal ranks with constants 0 and 60 selected
28/32 and 23/32 required sources; primary plus strongest context rank selected
31/32; its token-density version and summed-rank density both selected 28/32.
Every candidate lost at least one baseline-selected source. Even the best lost
the Korean final-time correction. None was adopted or subjected to paid generation.
See [replay evidence](results/fusion-replay-v1.json).

This was exploratory development using known results, not a preregistered live
comparison. The replay uses the pinned host's tokenizer plus its six count tokens,
and exactly reproduces all 38 recorded baseline counts and selected indices.
The narrowed fallback policy and adoption rule were frozen before new live calls.

## Shared-query live selection

The [frozen protocol](assistant-fallback-evaluation.md) ran all previous 38 cases
plus ten new input-shape controls. Controls reuse the English/Korean source
corpus; they are not held-out content. Distinct query texts are searched once per
case, and both policies reuse exactly the same returned hits. No quality retry.

| Required-source cohort | Baseline v3 | Fallback v4 |
| --- | ---: | ---: |
| Existing 32 cases (six unknown cases excluded from coverage) | 26/26 | 26/26 |
| Prior six boundaries | 4/6 | 5/6 |
| Ten new first-user controls | 7/10 | 10/10 |
| Total required sources | 37/42 | 41/42 |

The four recoveries are the Korean first-user question and its blank-assistant,
blank-user and retained-answer variants. English/Korean explicit topic switches
and corrections passed. There were no losses of baseline-selected evidence.
All 32 previously evaluated prior-user query pairs remain byte-for-byte unchanged.
The Korean ordinary assistant-topic boundary still fails and is preserved in
[the full comparison evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/assistant-fallback-search-v1.json).

Real pinned SillyTavern 1.19.0, Chromium, built-in proxy and live LambdaDB managed
embeddings passed 60 integrity checks across 298 responses. Source hashes,
session-key/reload audits and deletion/absence of both owned collections passed.
Integrity success does not turn the remaining selection miss into a quality pass.

## Real-host generation follow-up

The [frozen follow-up](assistant-fallback-generation.md) ran 24 answers through
SillyTavern's actual Generate path with live LambdaDB and OpenAI
`gpt-4.1-mini-2025-04-14`. It used context 2,048, recent 12, memory budget 400,
temperature 0 and maximum output 256. All source histories exceeded the context
and all 12 memory-off prompts were actually truncated. The source is synthetic
assistant-only imported history; this is not ordinary short greeting behavior.

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Answers | 12 | 12 |
| Required old source delivered | 0/12 | 12/12 |
| Provisional correct answers | 0/12 | 12/12 |
| Abstained from a known answer | 12/12 | 0/12 |
| Maximum memory content tokens | 0 | 400/400 |

Both repetitions of each English/Korean indirect reference, explicit switch and
final-time correction succeeded with memory. The 12 paired outcomes improved
under provisional semantic review. This is off/on evidence on the new runtime;
it is not a direct v3/v4 generated-answer comparison. The shared-hit search test
establishes the narrower retrieval change. It does not establish general actor
accuracy, safe unknown-answer handling or a stable release quality gate.

All **293 live integrity checks** passed. **24/24 first provider attempts** returned
200; no retry was used. Minimum provider-start spacing was 15,000.313 ms. All
110 LambdaDB responses were successful or expected absence checks. Both owned
collections and native test data were cleaned up; key audits and every frozen
source hash passed. Provider usage was 33,414 prompt and 617 completion tokens;
embedding cost was not measured. No latency/cost improvement is claimed.

[Checked-in generation evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/assistant-fallback-generation-v1.json)
contains all answers, recalled text, source delivery, provisional rationales,
provider attempts, hashes and the recovery report. Raw report byte SHA-256:
`a4163970989579891e0a775d65c0e4ffae8b2cef43d933aee71e187eb7b0aeb8`.

Answers were individually read in randomized packet order against the frozen
source/rubric before condition-key aggregation. The reviewer was this assistant,
which knew the development objective; these are not independent blinded human
judgments. The assistant gate passes this small cohort, while the human gate is
unset. The unfilled packet and local `artifacts/fallback-human-review.html` remain
separate from assistant annotations. The offline renderer now accepts quote-only
required evidence, matching the corpus contract, without inventing meaning text
or changing the frozen fixture/rubric. The rendered form was checked with all
24 records unscored; no human review was submitted.

## Runtime regression

129 unit tests pass on Node.js 20.12.0 and 24.15.0, including exact parity with the
frozen candidate and independently recorded live queries, continue/swipe/regenerate
anchors, blank turns, bounds/deduplication, retained-answer exclusion and sibling
cancellation on a failed fallback query. Runtime/tool syntax and release metadata
checks pass. The pinned real host plus emulated LambdaDB passes 188 recovery
checks, including two actual host crashes/restarts and 24 edit/swipe/delete cycles.
Those emulator checks are separate from the live service/quality evidence.

## Reproduce

Install this checkout into a pinned SillyTavern host's
`public/scripts/extensions/third-party/sillymemory` path, then run:

```sh
npm ci
npm test
npm run check
npm run check:release
SM_ENV_FILE=/absolute/path/to/.env.local ST_SOURCE=/pinned/host \
  SM_ARTIFACT_TAG=fallback-next node scripts/live-smoke.mjs --assistant-fallback
ST_SOURCE=/pinned/host SM_ARTIFACT_TAG=fallback-next \
  node scripts/browser-smoke.mjs --recovery
node scripts/natural-dialogue.mjs --output artifacts/fallback-next-plan.json \
  --fixture assistant-fallback-v1
SM_ENV_FILE=/absolute/path/to/.env.local ST_SOURCE=/pinned/host \
  SM_NATURAL_PLAN=artifacts/fallback-next-plan.json SM_ARTIFACT_TAG=fallback-next \
  node scripts/generation-smoke.mjs --natural --retry-transient
```

Live commands incur provider usage. Use unique artifact tags and preserve failed
runs and pending-cleanup records. The earlier `--assistant-topic` comparison is
pinned to its v3 runtime revision; use that revision to reproduce it. The new
`--assistant-fallback` mode compares frozen v3 with v4 on either runtime.

To reproduce exploratory replay without service calls, use the previous raw
synthetic report:

```sh
ST_SOURCE=/pinned/host node scripts/fusion-replay.mjs \
  /path/to/live-assistant-topic-assistant-topic-v1.json artifacts/new-replay.json
```
