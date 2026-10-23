# BEAM evaluation decisions

## Complete fixed ranked-8K length grid (2026-10-21)

**Complete the scale baseline and pause further optimization.** The two remaining
full runs score **85.99/100 at 500K** and **80.64/100 at 10M**. Retain the original
ranked-8K reference; no presentation candidate or product default is promoted.
The four rows below use original full cohorts, not the 651-question source-frame
subset. Scores are **partial-credit means**, including the pinned normalized
event-ordering score, not binary accuracy.

| History bucket | Conversations / questions | SillyMemory /100 | Historical Past /100 | Gap |
| --- | ---: | ---: | ---: | ---: |
| 100K | 20 /400 | **89.00** | 92.08 | −3.08 |
| 500K | 35 /700 | **85.99** | 89.63 | −3.63 |
| 1M | 35 /700 | **86.62** | 90.65 | −4.03 |
| 10M | 10 /200 | **80.64** | 85.03 | −4.39 |

Past's scores are recomputed from the pinned historical
[public results](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/results),
not a newly matched vendor execution. Across **2,000 question occurrences** there
are **1,999 distinct question texts**; only one text overlaps between 500K and
1M, with zero overlap for other bucket pairs. Histories, references and task
difficulty also differ. These are descriptive dataset buckets, **not a controlled
causal length-effect curve**, an unseen holdout or a SOTA/parity result.

### Ability comparison

| Ability | 100K /40 each | 500K /70 each | 1M /70 each | 10M /20 each |
| --- | ---: | ---: | ---: | ---: |
| Abstention | 97.50 | 90.71 | 88.57 | 85.00 |
| Contradiction resolution | 67.81 | 70.36 | 67.86 | 64.38 |
| Event ordering | 100.00 | 100.00 | 99.37 | 98.89 |
| Information extraction | 88.91 | 87.89 | 78.83 | 72.50 |
| Instruction following | 95.62 | 87.14 | 95.30 | 93.75 |
| Knowledge update | 83.12 | 76.19 | 75.71 | 80.00 |
| Multi-session reasoning | 66.55 | 58.45 | 67.34 | 29.42 |
| Preference following | 99.38 | 98.45 | 98.63 | 97.50 |
| Summarization | 96.72 | 97.88 | 98.57 | 93.75 |
| Temporal reasoning | 94.38 | 92.86 | 96.07 | 91.25 |

Multi-session reasoning is especially difficult in the 10M cohort: SillyMemory
**29.42**, historical Past **28.17**. That shared difficulty does not identify
a causal retrieval failure or a benefit from widening retrieval. Contradiction,
update and extraction weaknesses and previously documented source/reference/judge
ambiguities remain; no labels are corrected and no follow-up tuning is performed.
Annotation-derived generation hints remain part of this public protocol, so these
scores do not establish annotation-blind product behavior.

### Answer tokens, model-rate proxies and construction

| Bucket | Total answer input | Median answer input | Answer output | Judge input | All model input |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100K | 5,098,292 | 12,597.5 | 100,717 | 563,836 | 5,662,128 |
| 500K | 9,188,001 | 12,757 | 198,546 | 1,329,189 | 10,517,190 |
| 1M | 9,096,396 | 12,619 | 221,530 | 1,591,124 | 10,687,520 |
| 10M | 2,728,229 | 13,420 | 52,560 | 306,829 | 3,035,058 |

Mean answer input is **12,745.73 /13,125.72 /12,994.85 /13,641.15** tokens. The
fixed source-only estimate keeps answer inputs in a similar observed range;
metadata and prompt overhead mean this is not an 8K cap on final model input.
Different question counts explain why 10M's total answer input is lower.

| Bucket | Answer USD | Judge USD | Construction + query embedding proxy USD | Answer + embedding proxy USD |
| --- | ---: | ---: | ---: | ---: |
| 100K | 1.395373 | 0.177641 | 0.052111 | 1.447484 |
| 500K | 2.535150 | 0.403336 | 0.351818 | 2.886969 |
| 1M | 2.539830 | 0.486461 | 0.719194 | 3.259024 |
| 10M | 0.745099 | 0.097004 | 2.158827 | 2.903926 |

These use the same frozen historical comparison rates: input $0.20/M, cache reads
$0.02/M, cache writes $0.25/M, output $1.20/M, and embeddings $0.02/M. Cache
writes are subsets of input. They are **not invoices or complete system costs**:
managed-service margins, DB, search, native reranking and storage charges are
excluded. Embedding inputs are independently counted text, not provider receipts;
global/service cache reuse and cold-cache independence are unmeasured. Judge
costs are evaluation overhead, separate from production answer costs. The two
historical 100K setup calls (79 input /22 output tokens) are outside this table.

| Bucket | Source chunks | Construction embedding tokens | Literal-query embedding tokens | Memory HTTP requests | Deleted collections |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100K | 21,119 | 2,597,266 | 8,271 | 1,152 | 20 |
| 500K | 134,198 | 17,576,375 | 14,546 | 4,940 | 35 |
| 1M | 278,332 | 35,944,747 | 14,949 | 9,259 | 35 |
| 10M | 786,869 | 107,936,429 | 4,908 | 23,868 | 10 |

No generative memory-construction calls occur. Memory-request totals include
benchmark strong-fetch audits and owned cleanup, not just production ingestion
or search. All **100** owned collections across the four original runs have
verified 404 absence. Provider request durations remain available in raw receipts;
no SillyTavern host latency, peak indexing throughput or deployment claim follows.

### Verification and reproduction

The original source/request/answer verification passed, and all 100 owned
collections were independently confirmed absent. These are retained-source and
arithmetic checks, not independent judge calibration or live host latency tests.

Use [the public BEAM profile](../benchmark/beam/README.md) for pinned datasets,
answer/judge instructions, partial-credit scoring, annotation assistance,
budgets and reproduction commands. It uses Small managed embeddings,
800-character chunks, literal Query1/k200, native Jev candidate 200/final 100,
and 8,000 estimated source tokens. The generator and judge are
`gpt-5.6-luna` with reasoning `none`. This profile is separate from earlier
GPT-4.1/4K experiments and does not promote a product default.

## Historical evidence

[Earlier experiments, methods and receipts](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/beam-evaluation.md) remain available at the recorded revision. They describe their original settings, not the current product or benchmark profile. See [evidence recovery](evidence-retention.md) for retained source and raw-run availability.
