# LongMemEval and BEAM: published results and implications

Source review: **2026-10-18**. This is a research reference for future technical
writing and comparison design, not an independently reproduced leaderboard or a
new experiment. Vendor claims, inspected artifacts, code observations and project
decisions are distinguished below. Refresh sources before publishing a comparison.

## Reading the numbers

- LongMemEval answer accuracy, evidence recall and BEAM mean rubric scores are
  different metrics. Do not place them on one accuracy leaderboard.
- A result belongs to a dataset revision, cohort, memory configuration, generation
  prompt/model and judging prompt/model. A product name alone identifies none of
  these. Current code does not retroactively establish how an old result ran.
- LLM extraction, graphs, summaries, query rewriting and reranking are legitimate
  techniques. Their quality, maintenance cost and failure modes need measurement.
  Giving the answerer evaluation-only information changes the task itself.
- Public code inspection can identify information paths; it cannot establish
  authors' intentions, reproduce a hosted memory engine or measure how much a
  particular prompt inflated a score without a controlled ablation.

## Benchmark scope and scoring

| Suite | Released task and scale | Interpretation for SillyMemory |
| --- | --- | --- |
| [LongMemEval-S][lme] | 500 questions; roughly 115K Llama 3 tokens per history. Extraction, preferences, multi-session reasoning, updates, time and abstention. | Existing external QA reference. Pin the cleaned release; measure actual formatted input with the generator's tokenizer. |
| [LongMemEval-M][lme] | The same 500-question task with much larger distractor histories, roughly 500 sessions and around 1M tokens. | Tests scale sensitivity rather than a new independent question distribution. S and M are not two sets of 500 independent questions. |
| LongMemEval oracle | Only the evidence sessions are supplied. | Reader/answering diagnostic, not unrestricted retrieval performance. |
| [LongMemEval-V2][lme-v2] | A separate agent-memory task: 451 questions over multimodal web/enterprise trajectories; workflow, state and environment knowledge. | Not an updated scoring pass over S/M. A conversational host adaptation would need its own justification. |
| [BEAM][beam] | 100 synthetic conversations, 2,000 questions, ten abilities. Released buckets: 20/35/35/10 conversations and 400/700/700/200 questions at 100K/500K/1M/10M. | Adds instruction/preference application, contradiction resolution, ordering and long coherent histories. Papers also call the smallest bucket 128K; preserve the source's label. |

LongMemEval publishes question-type-specific **judge** prompts and accepts a judge
model argument; its example uses GPT-4o. Pin the actual model version and prompt,
rather than calling any LLM judgment “the official score.” Gold answers and
evidence labels belong to evaluation, not ingestion, retrieval or answer prompts.
The upstream retrieval calculation excludes the 30 abstention questions because
they have no evidence location. [Dataset and evaluator][lme-judge]

BEAM usually grades individual rubric items at 0, 0.5 or 1 and averages the result.
Event ordering can use normalized Kendall tau-b. Implementations differ: Mem0's
reported headline uses mean nugget scores, with an optional ordering metric;
past.dev uses Kendall tau-b for ordering. Even matching numeric ranges do not
establish identical scoring. [Mem0 runner][mem0-beam-run], [past.dev protocol][past]

LongMemEval is an established reference used by multiple memory projects; this is
evidence of adoption, not a market-share measurement or universal standard.
The [benchmark selection record](benchmark-selection.md) covers additional suites.

## Selected public LongMemEval references

These are separate reports or artifacts, not controlled head-to-head results.
“Unresolved” means the inspected source did not bind that detail to the headline.

| System / source | Reported result | Generator / judge | Qualification |
| --- | --- | --- | --- |
| [Exabase M-1][exabase-lme] | 96.4% at top-50; 95.4% at top-200, 500 questions | Gemini 3 Flash / Gemini 3 Flash, as reported | Says it uses one generic answer prompt. This LongMemEval claim must be assessed separately from its BEAM prompt problem below. Closed memory engine; no independent reproduction here. |
| [Mem0 documentation][mem0-readme] | 94.4% top-200; 94.8% top-50 | Exact headline configuration unresolved | The inspected result JSONs instead report 467/500 = **93.4%** and 452/500 = **90.4%**. Do not attach their model metadata to the different headline scores. |
| [Hindsight inspected artifact][hindsight-lme-result] | 473/500 = **94.6%**, S, RAG | `gemini-3.1-pro-preview` / `gemini-2.5-flash-lite` | A specific retained artifact, not a claim that every Hindsight publication reports 94.6%. Its average retrieved context is about 43.6K tokens, not total provider input. |
| [Honcho][honcho-evals] | 90.4%; separately reports 92.6% with Gemini 3 Pro | Claude Haiku 4.5 default answer path; per-variant judge not bound to these headlines here | Treat model variants separately; do not relabel the default BEAM run as Gemini 3 Pro based on a competitor's table. |
| [Supermemory detailed report][supermemory-report] | **97%** with GPT-4o; 84.6% with GPT-5; 85.2% with Gemini 3 Pro | Respective answer model / GPT-4o judge, as reported | Headline calls 97% “Recall@20 with aggregation,” while the detailed LLM-as-judge table places it under GPT-4o answers. Preserve this naming ambiguity; do not describe it as evidence-only recall. |

The Mem0 [top-200 artifact][mem0-lme-200] records `gpt-5` generation but does not
separately identify a judge in its top-level metadata; the [top-50 artifact][mem0-lme-50]
explicitly records GPT-5 for both. These files do not explain the documentation's
different headline totals. The discrepancy is unresolved, not evidence that one
number was fabricated.

Supermemory's [detailed report][supermemory-report] explicitly discusses judging
generated answers and publishes a generic answering prompt. Its 97% therefore
cannot be dismissed as a retrieval-only number merely because the headline says
“recall.” The report does not supply a bound, per-question result artifact in the
reviewed page; this review does not independently validate the model-dependent
totals. Earlier shorthand equating that label with pure evidence recall is corrected
here.

Mem0's inspected [LongMemEval prompt][mem0-lme-prompts] also contains narrow semantic
rules: treating song notes as chord progressions, excluding a coffee-shop encounter
from meeting counts, and classifying a chandelier as jewelry. Its judge adds
leniency beyond the upstream prompt. These are observable benchmark-specific
instructions, distinct from dynamically supplying a gold rubric. Their development
history and contribution to each published run are not established here. Applying
only its judge to our fixed answers would be a **secondary scoring sensitivity
analysis**, not a matched Mem0 reproduction; preserve the original official labels.

Using the same model for answering and judging does not itself prove invalidity,
but adds a dependence worth disclosing. Different models and judgment policies
can move scores independently of retrieval quality. No matching judge-only rerun
was executed for this document.

## Published BEAM reference points

Values below are **mean scores on a 0–1 scale**, rounded to three or four decimals.
Missing cells mean no result was established in this review. Rows are not ranked:
annotation assistance, judges, scoring implementations and retrieval budgets vary.

| System | 100K | 500K | 1M | 10M | Scope / critical condition |
| --- | ---: | ---: | ---: | ---: | --- |
| [past.dev][past] | 0.9208 | 0.8963 | 0.9065 | 0.8503 | All 2,000 questions; evaluation annotations enter answer generation. |
| [Exabase M-1][exabase-beam] | 0.769 | — | 0.750 | 0.680 | 400/700/200 questions; published answer-prompt generator supplies evaluation annotations. |
| [Hindsight retained single-query artifacts][hindsight-manifest] | 0.734 | 0.711 | 0.739 | 0.641 | 400/700/700/200 questions; historical annotation-assisted harness. Current code has changed. |
| [Mem0 Platform, top-200][mem0-beam-1m] | — | — | 0.641 | 0.486 | 700/200 questions; GPT-5 answerer and judge in saved metadata. [10M artifact][mem0-beam-10m]. |
| [Honcho retained run][honcho-results] | 0.630 | 0.649 | 0.631 | 0.406 | Specific archived run, not every displayed website aggregate. |

Hindsight's retained BEAM metadata names `gemini-3.1-pro-preview` as answerer and
`gemini-2.5-flash-lite` as judge. The four artifacts were added with the original
annotation-assisted adapter; the inspected 1M file has not been replaced since
that commit. The current generic prompt cannot certify those old numbers as a
clean rerun. Older, higher Hindsight figures without corresponding artifacts in
the inspected manifest are omitted rather than mixed with these files.

past.dev reports `openai/gpt-5.6-luna` for answering and judging, reasoning off,
with one recall capped at 100 results and an 8,000-token evidence budget. That
budget is not measured total answer input. Exabase reports Gemini 3 Flash for both
stages. Honcho's page describes a default Haiku 4.5 dialectic stack, but its
[historical BEAM runner][honcho-original] uses `BEAM_JUDGE_MODEL` for both the final
answer and judgment, defaulting to Sonnet 4.5. The retained run's dialectic metadata
alone does not establish that environment override. Treat the actual BEAM
answer/judge model as unresolved here; neither the default Haiku claim nor a
competitor's Gemini 3 Pro label settles it. [past.dev][past], [Exabase][exabase-beam]

Mem0's 1M/10M files also report thresholded pass rates of **70.1% / 50.5%**.
Those are different from their **0.641 / 0.486** mean scores. Preserve metric names
even when a presentation formats both as percentages.

### Cognee: useful exploratory evidence, not a full-suite entry

| Scale | Mean score | Independent question coverage | Selection and repetition |
| --- | ---: | --- | --- |
| 100K | 0.79 | One held-out conversation, 20 questions | Tuned on two conversations, checked on two more; four QA-and-judge rounds on the held-out conversation. |
| 10M | 0.67 | One conversation, 20 questions | Retrieval routing chosen on the same questions used for reporting; five repeated rounds. Exploratory, not held-out. |

The [official preliminary report][cognee] does not publish a complete 2,000-question
BEAM result. Repeating 20 questions does not create 80 or 100 independent samples.
It uses GPT-5 for answer generation and judging; ingestion uses GPT-5 at 100K and
GPT-5-mini at 10M. The reported configurations use supplied question-type labels.
Evaluation configs/results are packaged, but the original distributed 10M ingestion
orchestration and metadata are not included. This limits reproduction, not proof
that the reported experiment failed.

## What the BEAM answer-prompt audit established

| Implementation | Information available during generation | Interpretation |
| --- | --- | --- |
| [past.dev][past-prompts] | Tested preference, instruction/compliance indicators, summary rubric items, relevant time points/calculation hints, ordering targets and why a question is unanswerable | Direct use of evaluation annotations. The public header discloses this; it is more assistance than general answer-format guidance. |
| [Exabase published adapter][exabase-adapter] | The same fields in `build_rag_prompt` | Original file was fetched and its SHA-256 matches the source credited by past.dev. |
| [Hindsight original adapter][hindsight-original] | The same family of category-specific fields | Shared harness ancestry, not evidence that each product independently invented the approach. |
| [Hindsight current adapter][hindsight-current] | One generic answer prompt with question and retrieved context | Old annotation fields remain available for evaluation, but the inspected answer-prompt builder does not insert them. Old scores still require their old protocol. |
| [Mem0 BEAM][mem0-beam-prompts] | Question, retrieved memories and shared rules | No direct rubric/gold-hint insertion found in the inspected generation path; this is not a comprehensive certification of the hosted service or other suites. |
| [Honcho BEAM][honcho-beam] | Retrieved context and question; a generic instruction-following reminder for that category | Uses category information for a prompt choice; no concrete preference or rubric contents found in that generation path. |
| [Cognee router][cognee-router] | Dataset question type selects answer guidance and, in routed configurations, retrieval strategy | Label-assisted routing must be disclosed; it differs from supplying the correct preference or summary facts. |

For example, giving a preference-following answerer the preference it was supposed
to recover removes part of the memory task. Supplying summary rubric contents can
reveal required facts. This does not imply that the complete gold answer string
was supplied, that all question categories are equally affected, or that annotations
were ingested into the memory store. In past.dev, the inspected call passes the
annotations into the answer prompt after recall. [Actual call path][past-run]

The [Hindsight prompt-removal PR][hindsight-pr] merged on October 6 also reports an
approximately 0.055 drop after removing a later set of category-specific behavioral
blocks with the same banks and judge. That is the authors' reported effect for
that experiment, not our reproduction or a measurement of all earlier annotation
leakage. Do not subtract 5.5 points from every published result.

Publication wording should describe **evaluation-annotation assistance** or
**benchmark-specific prompt rules**, with exact evidence. Do not claim fraud,
intentional cheating or invalidity of every result from the same company. The BEAM
finding does not establish the same issue in that company's LongMemEval run.

## Memory techniques and where extra work occurs

| System | Publicly described method | Accounting implication |
| --- | --- | --- |
| SillyMemory evaluated Query1 | Source-preserving chunks, current generation-message query, managed embeddings and Bayesian/Jev search, bounded source assembly | No separate generative LLM extraction or query-rewrite call in the evaluated extension path. Embedding/search/reranking work still exists and is not free. |
| Native Summarize | Repeatedly summarizes source plus the previous summary; ordinary host history packing continues | Count every summary call as well as final answers. Summary compression does not automatically shrink the final prompt. |
| [Cognee][cognee] | LLM entity/relation extraction, knowledge graph, summaries, embeddings and session-derived memory; hybrid retrieval | Extraction, summarization and distillation add ingestion work. Scores do not isolate the contribution of each component. |
| [past.dev][past-concepts] | Typed observations/facts/rules, source evidence, dates, identity links and supersession; [temporal graph description][past-design] | Structural extraction is additional processing. The inspected public benchmark is an API client, not disclosure of the hosted extraction model, call counts or graph backend. |
| [Mem0][mem0-readme] | LLM-extracted memories with semantic, lexical and entity-related retrieval signals | Include ingestion work. Managed Platform results need not match the OSS SDK/default model configuration. |
| [Supermemory][supermemory-report] | Atomic contextual memories linked to source chunks, dated facts, update/extension/inference relations and aggregated retrieval | Include memory-construction work; the combined result does not isolate a graph contribution. |

Graph storage alone does not explain a score. Extraction fidelity, source retention,
time handling, candidate ranking, budget admission and the reader all matter.
A combined pipeline's score is not an ablation proving that its graph caused the gain.

## Our measured comparison and its limits

The [actual-host report](product-comparison.md) is the authority for the following
consumed cleaned-S cohort. Generator: `gpt-6.1-sol`, low reasoning. Judge:
`gpt-4o-2024-08-06`, frozen upstream prompt. Same 500 questions, pinned SillyTavern
1.19.0, native prompt path; gold/evidence labels excluded from generation.

| Condition | Accuracy | Aggregate final-answer input tokens | Median final-answer input tokens | Median observed reply time |
| --- | ---: | ---: | ---: | --- |
| Plain SillyTavern, 32K | 32.8% | 14,028,181 | 28,080 | 4.08 s |
| Native Vector Storage, 32K | 34.4% | 14,028,603 | 28,078 | 4.24 s |
| Plain SillyTavern, 128K, verified complete history | 93.0% | 52,591,554 | 105,319.5 | 5.61 s |
| SillyMemory existing Query2 settings | 82.8% | 2,526,647 | 4,988.5 | 5.62 s |
| SillyMemory Query1 | 93.8% | 2,524,361 | 4,970.5 | 4.47 s |
| Query1 with restored session dates | 93.2% | 2,517,410 | 4,968 | Provider replay; no comparable host timing |

The first four timing medians use the report's common 481-question timing subset;
Query1 was measured later under different execution conditions. These timings do
not establish a controlled speed advantage. Query1 versus complete history is a
four-answer difference on one consumed cohort, not proof of superior general QA.
Query1's aggregate final-answer input is about **95.2% lower** than complete history;
that is an input-volume observation, not a total billed-cost reduction.

The separate frozen **50-question Summarize subset** scored 32%, compared with
32% plain 32K, 32% vectors, 76% SillyMemory **Query2**, and 88% complete history on
those same questions. Do not compare Summarize's 32% to Query1's full-500 percentage
as if they shared a cohort. Replay accumulated 2,475 successful summary calls,
61,059,396 input and 716,427 output tokens before counting final answers. This is
whole-history maintenance work under that configuration, not the charge for every
ordinary turn. [Subset and workload details](product-comparison.md#common-50-question-comparison-including-summarize)

### Tokens, caches and reuse

For generative input volume, add successful final-answer, summary, extraction,
rewrite and other generation-stage inputs within a declared boundary. Keep
embedding usage, non-generative reranking, storage and evaluation judging separate;
add them when estimating total operating or evaluation cost. Include known retries
and report unknown failed-request usage rather than treating it as zero.

Provider prefix-cache hits still count as input tokens; billing and latency may
change. Local reuse of a completed answer receipt is different: no new answer call
occurred. Reusing an index or summary changes setup amortization. Shared prefixes
and execution order can create unequal cache hits across arms even with isolated
memory stores. Consequently these historical arms do not estimate independent
cold-cache, warm-cache or steady-state dollar costs. The detailed cache diagnostics
from the discussion are local ignored artifacts, not a committed reproducible
cost study. Current report totals retain their declared successful-call boundaries.

## Decisions and publication implications

1. **Use external scores as context.** Publish our own host conditions, generator,
   judge and cohort beside the result; do not claim to beat a vendor by comparing
   its self-reported percentage with our differently judged score.
2. **Keep the official-prompt labels primary.** A Mem0-style rejudge can measure
   sensitivity on the exact same saved answers. It cannot equalize generation,
   retrieval, service versions or missing vendor run metadata.
3. **Prefer BEAM for the next new-quality question; use M for scale.** This is a
   project recommendation, not an authorized paid run or a frozen protocol.
   Start with a bounded smaller BEAM cohort and separate development/confirmation
   conversations before considering 10M. M remains useful if the product question
   is specifically whether S retrieval degrades under more distractors.
4. **Keep the answerer blind to evaluation-only annotations.** Use the question,
   permitted source dates and actual retrieved evidence. Gold answers, evidence
   IDs, answerability labels, rubric hints and dataset ability labels stay with
   the evaluator. If production routing is proposed, derive it from the question
   and evaluate that classifier and its cost instead of reading the gold label.
5. **Freeze before tuning.** Pin dataset hash, language, source mapping, model IDs,
   prompts, retrieval/packing budgets, failure rules and full reporting cohort.
   Separate prior answers from source evidence and disclose consumed benchmarks.
6. **Show the tradeoff we measured.** Source-preserving retrieval can sharply
   reduce final-answer input while retaining high English QA accuracy in our
   tested host. This does not establish general roleplay quality, multilingual
   quality, independently held-out accuracy, lower total cost or production SLA.

Before external publication, obtain run-bound evidence for Supermemory's reported
model variants and resolve Mem0's headline/artifact mismatch if using them in a
comparative claim; identify exact
historical execution prompts for any vendor score used in a fair ranking. A clean
same-protocol rerun is needed to quantify the effect of BEAM answer assistance.
No such rerun, new paid benchmark or external publication occurred in this change.

## Source preservation and update procedure

GitHub references below pin reviewed revisions. Mutable research pages are dated
observations; recheck them before quoting. Original downloaded source bytes,
checksums and derived result-metadata extracts are retained in the ignored local
bundle `artifacts/benchmark-reference-2026-10-18/` with `sources.json` as its index.
Result extracts record immutable original URLs and hashes; they are not full
copies of the underlying prompt/answer datasets. Local evidence is unavailable
from a fresh clone and is not a CI dependency. The archive is
`artifacts/archive/benchmark-reference-2026-10-18.tar.gz`, SHA-256
`937aabc2d2d48a2e67a01b1733e51a3911949d9cf382eaa9b184b9d192fc1942`.
All 50 archived files were checked against the retained bytes; the adjacent
`benchmark-reference-2026-10-18.tar.receipt.json` records that verification.
This document does not promise public artifact hosting.

When updating a row, preserve the old dated observation, capture the new source
revision and label whether the change is a fresh run, rejudgment, documentation
correction or harness change. Link our experiment evidence through
[product comparison](product-comparison.md) and [evidence retention](evidence-retention.md).

<!-- Immutable source links are grouped here to keep the comparison tables readable. -->

[lme]: https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md
[lme-judge]: https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py
[lme-v2]: https://github.com/xiaowu0162/LongMemEval-V2/blob/2cc8c540bdb87fe6761629b585e727e1c4704520/README.md
[beam]: https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/README.md
[exabase-lme]: https://exabase.io/research/exabase-achieves-state-of-the-art-on-longmemeval-benchmark
[exabase-beam]: https://exabase.io/research/exabase-achieves-state-of-the-art-on-beam-benchmark
[exabase-adapter]: https://fabric.so/p/beam-3VjBcqEVRofZyA5CeazeX
[past]: https://github.com/pastdotdev/benchmarks/blob/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/README.md
[past-prompts]: https://github.com/pastdotdev/benchmarks/blob/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/exabase_prompts.py
[past-run]: https://github.com/pastdotdev/benchmarks/blob/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/run.py
[past-concepts]: https://past.dev/docs/memory-api/concepts
[past-design]: https://past.dev/blog/giving-ai-a-past
[hindsight-manifest]: https://github.com/vectorize-io/agent-memory-benchmark/blob/aef3702e0586a959c845cc2c61f10d5e8ff0f94a/results-manifest.json
[hindsight-original]: https://github.com/vectorize-io/agent-memory-benchmark/blob/5d5e8dbe56f140ad982ae61cbd73f43e100de706/src/memory_bench/dataset/beam.py
[hindsight-current]: https://github.com/vectorize-io/agent-memory-benchmark/blob/aef3702e0586a959c845cc2c61f10d5e8ff0f94a/src/memory_bench/dataset/beam.py
[hindsight-pr]: https://github.com/vectorize-io/agent-memory-benchmark/pull/55
[hindsight-lme-result]: https://github.com/vectorize-io/agent-memory-benchmark/blob/aef3702e0586a959c845cc2c61f10d5e8ff0f94a/outputs/longmemeval/hindsight/rag/s.json.gz
[mem0-readme]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/README.md
[mem0-lme-200]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/results/platform/longmemeval_results.json
[mem0-lme-50]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/results/platform/longmemeval_top50_results.json
[mem0-lme-prompts]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/benchmarks/longmemeval/prompts.py
[mem0-beam-prompts]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/benchmarks/beam/prompts.py
[mem0-beam-run]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/benchmarks/beam/run.py
[mem0-beam-1m]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/results/platform/beam_1m_results.json
[mem0-beam-10m]: https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/results/platform/beam_10m_results.json
[honcho-evals]: https://honcho.dev/evals/
[honcho-results]: https://github.com/plastic-labs/honcho-benchmarks/tree/20c497bff02ff8737268be6d91c197767dc7bac0/a1d689b
[honcho-beam]: https://github.com/plastic-labs/honcho/blob/ed9fe6c122446a30a74bbba1364003349bf0acb5/tests/bench/beam.py
[cognee]: https://github.com/topoteretes/cognee/blob/37f788bd287750e10d7610173e5332b3843f6ebd/cognee/eval_framework/beam/REPORT.md
[cognee-router]: https://github.com/topoteretes/cognee/blob/37f788bd287750e10d7610173e5332b3843f6ebd/cognee/eval_framework/answer_generation/beam_router.py
[supermemory-report]: https://supermemory.ai/research/longmembench/
[honcho-original]: https://github.com/plastic-labs/honcho/blob/a1d689b/tests/bench/beam.py
