# LongMemEval-S retrieval attribution

**Finding: no loss of annotated evidence messages was observed at retrieval or
packing for any of the 20 Jev-incorrect answers in the
[2026-10-22 LongMemEval-S run](longmemeval-public-evaluation.md).** All 53
annotated evidence messages behind the 19 annotated incorrect answers were
returned in the reranked list and delivered complete in the final prompt. The
remaining incorrect answer is an abstention question without a positive evidence
annotation. This does not establish that every fact needed by each question was
delivered; the cause of each incorrect answer is not attributed by this measurement.

This is an offline attribution of the retained run. It made no provider calls,
regenerated no answers and rejudged nothing. It measures annotation coverage as
defined in [the evaluation criteria](memory-evaluation.md#map-chunk-results-to-message-annotations);
it is not a verified necessary-fact audit.

## Method

[`benchmark/longmemeval/attribute.mjs`](../benchmark/longmemeval/attribute.mjs)
rebuilds each frozen question with the run's `prepareCase` inputs, verifies the
recorded source hash, and maps every dataset `has_answer` turn to its indexed
chunks by flattened message index. Each annotated message is classified as
missing, partial or complete at two stages by merging the `[start, end)` spans of
the chunks present at that stage against the message's indexed extent:

- **Returned**: the final reranked list, 50 chunks from 200 candidates.
- **Prompt**: the chunks admitted into the 4,096-token quoted memory block.

A question is then labelled by precedence: `retrieval-loss` if any annotated
message is missing from the returned list, `budget-loss` if any is missing only
from the prompt, `delivered-partial` if all are present and one is partial,
otherwise `delivered-complete`. Questions whose annotations all fall inside the
retained recent dialogue, and questions with no `has_answer` turn, are reported
separately.

## Incorrect answers

| Stage | Questions | Annotated messages | Returned complete | Prompt complete |
| --- | ---: | ---: | ---: | ---: |
| `delivered-complete` | 19 | 53 | 53 | 53 |
| `unannotated` (abstention) | 1 | 0 | n/a | n/a |
| `retrieval-loss`, `budget-loss`, `delivered-partial` | 0 | 0 | 0 | 0 |

The ranks were high as well: 44 of the 53 annotated messages were in the top five
of the reranked list, and the lowest-ranked one was at position 24.

A manual reading of the 19 delivered-complete failures, which is a reviewer
classification rather than a measured label, groups them as follows:

| Reading | Questions | Example |
| --- | ---: | --- |
| Count or sum across sessions differs from the reference | 7 | `d851d5ba` sums $8,750 after adding a delivered but unannotated $5,000 concert; reference $3,750 |
| Date-window or date-arithmetic reasoning | 7 | `370a8ff4` computes 11 weeks between two correctly recalled dates; reference 15 |
| Abstention question answered from related context | 1 | `09ba9854_abs` computes savings from an estimate the user never gave |
| Preference question answered generically (Jev 0.42, 0.46) | 2 | `b0479f84` recommends from one of three mentioned titles |
| Knowledge update reported as an unconfirmed plan | 1 | `07741c45` keeps the old location |
| Referent read literally against an arguable reference | 1 | `ec81a493` distinguishes the 500-copy poster from the album |

The unannotated incorrect answer, `a96c20ee_abs`, is the other abstention
question; it names a university from a conference mention in delivered context.

In three of the counting failures (`d851d5ba`, `gpt4_2f8be40d`, `88432d0a`) the
generated answer used delivered excerpts that are not annotated evidence, such as
other weddings, fundraisers or baking mentions from the same history. In these
cases the annotated evidence was present alongside the additional excerpts; whether
an unannotated dependency was also missing was not reviewed. Several references are
also arguable
(for example `ec81a493` asks about album copies while the source says the poster
was limited to 500); the original labels are preserved and not rejudged.

## Cohort coverage

All 500 questions, annotation coverage per the evaluation criteria:

| Measure | Returned list | Final prompt |
| --- | ---: | ---: |
| Any annotated-message coverage (partial + complete) / 894 | 891 (99.7%) | 883 (98.8%) |
| Complete annotated-message coverage / 894 | 888 (99.3%) | 880 (98.4%) |
| All-annotated-messages-complete questions / 478 annotated | 472 (98.7%) | 464 (97.1%) |

Zero-annotation questions: 22 (21 with no `has_answer` turn, one whose only
annotated message is inside the retained recent dialogue). Every annotated message
was indexed. The 14 questions that were not `delivered-complete` were all judged
correct:

| Stage | Questions | Types |
| --- | ---: | --- |
| `budget-loss` | 8 | 7 single-session-preference, 1 multi-session |
| `retrieval-loss` | 3 | 2 multi-session, 1 single-session-preference |
| `delivered-partial` | 3 | multi-session, single-session-assistant, single-session-user |

Single-session-preference questions are the only type with material prompt-stage
loss (36 of 44 annotated messages complete in the prompt). Their annotated
messages ranked between 28 and 46, and the 4,096-token budget dropped them. The
preference answers were still judged correct, so this is a budget observation
rather than a measured quality loss.

## Boundaries

- The runner records only the final reranked list. Candidate recall (200) and
  reranking (50) cannot be separated offline; the three `retrieval-loss` messages
  would need a live rerun to attribute further.
- `has_answer` marks whole user turns. Complete coverage of a turn does not prove
  the required fact was present or sufficient, and unannotated assistant turns or
  alternative sources are not credited.
- The manual reading of the 19 failures was performed after the labels were
  known and is a development diagnosis, not a frozen annotation set.

## Decision

The wormhole-vector style pseudo-relevance feedback trial (mean-pooling the top
lexical hits into a second dense query) that motivated this attribution is
**deferred**. It targets candidate recall and cross-space expansion, and this
cohort shows no incorrect answer with an observed loss of annotated evidence at
recall or ranking. Three failures instead used delivered unannotated excerpts in
addition to the annotated ones, so widening retrieval has no observed failure to
fix here and a plausible precision cost. A necessary-fact sufficiency review of
the 19 failures would be required before attributing them causally to generation.
Re-evaluate the technique if a cohort with measured
`retrieval-loss` on incorrect answers appears, or on BEAM where coverage has not
been attributed this way.

The patterns worth following next, from the manual reading rather than a measured
attribution, are multi-session counting and date-window reasoning over delivered
annotated evidence, abstention under related context, and preference
personalization near the judge threshold.

## Evidence

Detailed per-question records, including chunk ranks, spans, delivered IDs and
the recorded answers, are retained as ignored artifacts, local only and not in a
fresh clone:

| File | SHA-256 |
| --- | --- |
| `artifacts/archive/longmemeval-retrieval-attribution-2026-11-01/attribution-incorrect.json` | `f56d5b023d3822b3f9ada300c0f61179af100264103248eb49d5a2780d9af3d1` |
| `artifacts/archive/longmemeval-retrieval-attribution-2026-11-01/attribution-all.json` | `f3337edb037c13ccd9989b94bdef796a7cb92b495c064f0c0541139d50533ca0` |

Source run: `artifacts/archive/longmemeval-public-evaluation-v1/run-artifacts/longmemeval-blog-full`,
producer revision `cae42d58d955a1688ced3075ad05227923f36772`, evidence archive
SHA-256 `2e1a5c0b6dd4bbd63bb2f850f78da032b32ec53950ca252c51a260f6f096cb21`.
Reproduce with:

```sh
node benchmark/longmemeval/attribute.mjs <run-root> attribution-incorrect.json
node benchmark/longmemeval/attribute.mjs <run-root> attribution-all.json --all
```
