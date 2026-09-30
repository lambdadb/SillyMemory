# Passage selection under fixed token budgets

**No candidate qualifies for fresh live validation. Runtime selection stays
unchanged.** Five offline ranking candidates can recover some missed source
passages, but each drops at least one source selected by the current interleaving
policy. No new LambdaDB, embedding or generation requests were made.

This is a development experiment on previously observed synthetic results, not
an independent benchmark or a preregistered live trial. It follows the
[effective-budget diagnosis](context-turn-results.md#post-result-budget-diagnosis).
All five candidates, including failures, are retained; no candidate was added or
tuned after inspecting this comparison. No runtime, API, prompt, key handling,
indexing or synchronization behavior changes in this work.
The earlier [three-query fusion replay](assistant-fallback-results.md) also
recorded regressions. This comparison uses v5's two-query inputs and the observed
320-token generation cap; it does not replace or negate that earlier result.

## Inputs and controls

The replay uses 62 previously recorded search cases and all 32 memory-on samples
from the historical 64-answer generation run. The generation cohort repeats
16 cases twice and overlaps earlier search stories/cases. The search cohort also
contains related controls derived from shared stories. They are not independent
draws. Of the 62 search cases, 48 use recent 12 and 14 use recent 8; each keeps
that window for all three replay budgets.

- Search: keep each case's original recent window and query order; replay the
  same returned lists at content budgets **320, 400 and 800**. These alternate
  budgets change selection only; they are not new searches or host generations.
- Generation: keep **recent 8 and effective budget 320**. Configured budget 400,
  context 1,536 and output limit 256 give
  `min(400, floor((1536 - 256) / 4)) = 320` in the pinned host/extension.
- Query construction, returned ranks, chunk boundaries, whole-passage packing,
  chronological rendering and the token counter stay fixed across candidates.
- The pinned host is SillyTavern 1.19.0 at
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. The offline counter uses its
  `tiktoken` 1.0.22 `gpt-4o`/`o200k_base` encoding plus the six-token content
  padding used by `/openai/count`. It counts memory content, not total prompt cost.

Before comparison, baseline replay exactly reproduces **62/62 historical search
selections and token counts** at their original budgets and **32/32 historical
on-mode selections and token counts** at 320. Generation selections are matched
by source message/chunk; the original selected IDs are resolved from recorded
hits. Completion-order request telemetry is restored to runtime query order.

The compact search fixture was exported from the retained raw report after
matching its byte hash to the previously checked-in search summary. Every
recorded hit's text, revision, role, speaker, message and chunk was checked against
reconstructed local synthetic source. The fixture keeps only ordered
message/chunk references. Generation hits undergo that same source comparison
on every replay; the actual host character label is preserved for token counts.
This comparison uses valid historical hits and does not exercise hostile/stale
remote-result handling or replace the runtime's validation before deduplication.

## Candidates and decision

All candidates use the same production greedy whole-passage selector after
ordering. None sees expected answers, evidence labels or grades while ranking.
Ties keep first occurrence in the baseline interleaved list.

| Candidate | Ordering score |
| --- | --- |
| Baseline | Alternate primary/context ranks, primary first |
| RRF 0 | Sum `1 / rank`, with one-based ranks from both streams |
| RRF 60 | Sum `1 / (60 + rank)` |
| Density | RRF 0 divided by independently wrapped passage content tokens |
| Lexical | Maximum query-to-passage IDF-weighted word-trigram cosine |
| Lexical + RRF | Lexical score plus RRF 60 |

Lexical input is trimmed, bounded to 6,000 UTF-16 units, NFKC-normalized and
lowercased. Words use Unicode letters/numbers; words shorter than three code
points contribute no trigrams. IDF uses distinct returned passages, not full
history: squared weight `(1 + ln((N + 1) / (df + 1)))²` in dot products/norms.
This is local lexical matching, not managed embedding similarity. Density uses
individual passage cost as a ranking heuristic; the final selector still counts
the entire chronologically rendered selection, so standalone costs are not
assumed additive.

The necessary gate for further validation is at least one newly selected
required source and **zero losses of baseline-selected sources in any replay
row**. An aggregate gain cannot compensate for a loss. A passing candidate would
still need a frozen protocol, fresh live retrieval and actual host generation
at declared effective budgets/recent windows before runtime adoption.

## Recorded results

Cells count required source passages selected, not correct generated answers.
The eight unknown search cases and four unknown generation samples do not enter
these denominators; they remain in the replay and token checks.

| Candidate | Search at 320 | Search at 400 | Search at 800 | Recorded generation hits at 320 | Losses / gains vs baseline across rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 48/54 | 54/54 | 54/54 | 26/28 | 0 / 0 |
| RRF 0 | 52/54 | 54/54 | 54/54 | 26/28 | 2 / 6 |
| RRF 60 | 38/54 | 45/54 | 48/54 | 24/28 | 35 / 8 |
| Density | 46/54 | 53/54 | 54/54 | 26/28 | 3 / 0 |
| Lexical | 53/54 | 53/54 | 54/54 | 28/28 | 2 / 8 |
| Lexical + RRF | 51/54 | 53/54 | 54/54 | 28/28 | 4 / 8 |

There are **218 configuration rows and 190 required-source observations**, with
budgets and repetitions reusing known evidence. The pooled totals in the JSON
are accounting checks, not a statistical quality estimate.

Lexical recovers both recorded Korean historical assistant-topic misses at the
actual 320-token cap, but drops the final Korean long-dialogue correction at
both 320 and 400. RRF 0 drops that correction and the Korean correction control
at 320 without recovering the two generation misses. All other candidates also
regress. The decision is therefore **no eligible candidate**. No paid follow-up
was run, and none of these recovered passages establishes an improved answer.

The observed historical target is present in the returned candidate sets. This
experiment investigates ordering and packing competition, not ANN recall. It
cannot determine exact-neighbor ground truth, provider variability, latency,
real-chat quality or overall release readiness. Korean paraphrase resolution,
actor/perspective errors and independent human review remain separate open work.

## Validation

All 145 unit tests pass locally on Node.js 24.15.0, including source reconstruction,
coverage accounting, loss rejection, deterministic ordering and producer/input
hash checks. Runtime/development syntax, release metadata and diff whitespace
checks pass. Full pinned-tokenizer replay completed all 218 rows with exact
baseline reproduction. No new browser/emulator, live search or generated-answer
run was performed; historical provider evidence is reused explicitly.

## Reproduction and next work

The [candidate code](../scripts/budget-selection.mjs),
[fixture loader/exporter](../scripts/budget-selection-data.mjs),
[replay runner](../scripts/budget-selection-replay.mjs),
[compact ordered-hit fixture](../tests/fixtures/budget-selection-hits-v1.json),
[regression tests](../tests/budget-selection.test.js) and
[full results](results/budget-selection-replay-v1.json) are checked in. The result
records hashes of runtime, producer, corpus and prior evidence inputs. Historical
raw search data is only needed to re-export the compact fixture, not to replay it.
Use this PR's recorded revision when reproducing these exact results.

```sh
npm ci
npm test
npm run check
npm run check:release
# Requires the pinned host checkout with its dependencies installed; no server
# needs to run and no credentials are read. Choose a new output filename.
ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
  node scripts/budget-selection-replay.mjs artifacts/selection-next.json
```

The next bounded experiment should test source-preserving passage compression
or smaller passage boundaries at the same effective cap, while retaining final
correction sources and enough speaker context. Freeze those candidates and a
fresh synthetic holdout before service calls; do not repeatedly tune these
rankers against the same known failures. Changing chunk boundaries requires
separate synchronization/ID-migration checks and new managed searches, so that
work is not silently included here. A larger budget is also a different product
configuration, not evidence that fixed-budget selection improved.
