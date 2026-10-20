# BEAM evaluation decisions

## Past public-protocol comparison: frozen scope (2026-10-20)

The user approved one full **100K / 128K, 20-conversation / 400-question** run,
replacing the memory backend in Past's public experiment with SillyMemory.
The question is performance under that published evaluation protocol, not an
annotation-blind product-quality improvement claim. This explicitly separate
track does not change the original baselines or product defaults.

- Past harness: [`1faac1e70fa50d92d966904358be98bb1beca0c8`](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam).
  Reuse its loader, answer and judge prompts, strict judge schemas, rounding,
  event alignment/Kendall tau-b, and question-weighted aggregation unchanged.
- Dataset: Hugging Face `Mohammadta/BEAM`, revision
  `3205395e897e7318c7b094ef4e6047b9b82dbb03`, complete `100K` split. Parquet SHA-256:
  `c0519be25907005ba873c927c50877471d550873039d96c041554d0075a78ace`.
  This follows Past's loader, rather than assuming the earlier GitHub source is
  byte-identical. Past's saved 92.082142857 score and full question coverage
  reconstruct offline; the three prompt bodies verify against ExaBase's file.
- Answer and judge: `gpt-5.6-luna`, reasoning `none`, one user prompt, no added
  temperature or output cap. **Direct OpenAI Chat Completions is user-approved**
  instead of Past's OpenRouter route. Translate only routing-specific request
  fields; retain strict JSON schema for rubric and equivalence judging.
- Evaluation annotations enter answer generation exactly as Past's prompt uses
  them. They never enter ingestion or retrieval. No recent dialogue, extra
  product system prompt, or independent query rewrite enters generation.
- Same source messages, speaker identities and supplied user-profile traits.
  Same question as-of instants, including knowledge-update cutoffs at microsecond
  precision. Session dates remain batch references, not actual message send times.
- SillyMemory backend: original-text 800-character product chunks, managed OpenAI
  Small embeddings, Bayesian Query1/k200, native Jev 1.13.0/default criteria,
  role/batch-context/text reranking and strong reads. One query returns up to
  **100 chunks**, with ranked source-validated evidence admitted within **8,000
  estimated evidence tokens**, excluding JSON metadata. The observed rule is
  `sum(ceil((content code points + source-excerpt code points) / 4))` per result;
  it reproduces `usedEvidenceTokens` in all 400 published records. This is an
  empirical accounting match, not verification of Past's private implementation.
  Count full serialized JSON separately with cl100k. Context rendering and chunk
  units belong to the backend; matching budgets does not make evidence identical.
- Bounds: 400 first answers, no quality tuning or favorable repeats, four
  transport attempts per model call as upstream, 10,000 model attempts / a $25
  conservative model-cost reservation ceiling, 10,000 memory operations, and
  eight-hour wall limits per live phase. Account refusal stops the run; exhausted
  upstream answer/judge failures retain its zero-credit policy. Resource-limit
  interruption is an incomplete run, never a full-cohort score.
- Record all model request/response usage by phase, retrieval receipts and exact
  sources under ignored `artifacts/beam-past-100k-v1/`. Verify collection ownership
  before mutation and deletion, then confirm all temporary collections return 404.
  Preserve raw evidence with checksums and a local-only restoration record.

Before any answer generation, an offline audit found that the initial packing
counted full JSON against 8,000 cl100k tokens. Past's published recall JSON instead
averages 10,982 cl100k tokens, while its reported evidence estimate averages 7,987.
Retain those unscored initial contexts, then repack the same saved top-100 queries
using the matched accounting rule. This makes no new provider calls and does not
select answers or tune to scores. Separate retrieval and generation source locks
retain this pre-generation correction.

Entry points are `scripts/beam-past-protocol.py` and
`scripts/beam-past-memory.mjs`. The former imports the pinned upstream source from
the ignored bundle, preserving its original MIT/BEAM/ExaBase notices rather than
vendoring third-party prompts. Its `prepare`, `recall`, `score`, and `verify`
phases, plus an offline `repack` phase, keep source freezing separate from paid
calls. The final decision is a complete comparison or a documented concrete
blocker; no second prompt track,
larger history bucket, or product promotion is included.

For a new authorized replication, create the ignored bundle using the pinned
sources above. This run used Python 3.14 with `httpx==0.28.1`, `scipy==1.18.1`,
and `pyarrow==26.0.0`; the bundle retains the complete dependency lock.
Install `tiktoken@1.0.22` separately under the bundle's `tokenizer/` directory,
not as a production dependency. The minimal setup and execution are:

```sh
beam_run=artifacts/beam-past-100k-v1
mkdir -p "$beam_run/upstream"
git clone https://github.com/pastdotdev/benchmarks.git "$beam_run/upstream/past"
git -C "$beam_run/upstream/past" checkout --detach 1faac1e70fa50d92d966904358be98bb1beca0c8
curl --fail --location https://huggingface.co/datasets/Mohammadta/BEAM/resolve/3205395e897e7318c7b094ef4e6047b9b82dbb03/data/100K-00000-of-00001.parquet -o "$beam_run/100k.parquet"
python3 -m venv "$beam_run/venv"
"$beam_run/venv/bin/pip" install httpx==0.28.1 scipy==1.18.1 pyarrow==26.0.0
npm install --prefix "$beam_run/tokenizer" --no-audit --no-fund tiktoken@1.0.22
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py prepare
# Paid phases: use an existing credential file; never copy it into the bundle.
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py recall --env-file /path/to/evaluation.env
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py score --env-file /path/to/evaluation.env
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py verify
```

## Past public-protocol result (2026-10-20)

**SillyMemory scores 89.00/100 over all 400 questions, versus Past's published
92.08/100: a descriptive gap of −3.08 points.** This is the question-weighted
partial-credit score, with normalized event-ordering Kendall tau-b. It is not a
binary answer-accuracy rate. Past's row is its saved September 29 run, not a fresh
service rerun; this run uses the user-approved direct OpenAI route. It therefore
matches the public evaluation protocol without claiming identical execution dates,
provider routing, memory representation, or a controlled vendor win.

| Ability | Questions | Past published /100 | SillyMemory /100 |
| --- | ---: | ---: | ---: |
| Abstention | 40 | 98.75 | 97.50 |
| Contradiction resolution | 40 | 78.13 | 67.81 |
| Event ordering | 40 | 100.00 | 100.00 |
| Information extraction | 40 | 95.00 | 88.91 |
| Instruction following | 40 | 96.25 | 95.63 |
| Knowledge update | 40 | 89.38 | 83.13 |
| Multi session reasoning | 40 | 68.95 | 66.55 |
| Preference following | 40 | 100.00 | 99.38 |
| Summarization | 40 | 99.38 | 96.72 |
| Temporal reasoning | 40 | 95.00 | 94.38 |
| **Overall** | **400** | **92.08** | **89.00** |

The largest category gaps are contradiction resolution (−10.31 points), knowledge
update (−6.25) and information extraction (−6.09), using unrounded scores. Event ordering scores 100 in
both runs. Evaluation annotations explicitly supply its topics and supply strong
hints in several other categories; these results do not establish annotation-blind
memory quality or perfect independent chronology reconstruction. No hints-off
comparison, quality tuning, favorable answer repeats, or other bucket ran.

Three post-result, source-bound diagnostics inspect the largest score deficit in
those three categories (ties by question ID), without changing any labels:

- `13_information_extraction_1`: the original $120 print-book budget reaches
  top100 at rank 68 but is omitted by packing. The answer describes a later $60
  print/audio plan. Returning another fragment of the original assistant message
  does not establish delivery of the required budget-allocation details.
- `15_knowledge_update_0`: the eligible user's 4 PM update is delivered alongside
  repeated older 3 PM assistant plans. The answer still says 3 PM. This is an
  evidence-use failure, not absence of the updated statement from the prompt.
- `19_contradiction_resolution_0`: both planned-meeting and never-met statements
  are delivered. The answer identifies a contradiction, but substitutes prior
  consultation for the planned meeting and omits the clarification request.
  Preserve the original rubric labels and their interpretation limits.

This selected review does not estimate failure prevalence. The older GitHub-based
SillyMemory runs use different source adaptation, generation and judging; the
score increase over those records does not isolate a memory-system improvement.
The cohort is known, not an unseen confirmation set. Keep product defaults and
close this bounded protocol comparison without a new optimization grid.

### Tokens, costs and completion

All 400 answers, 838 rubric judgments and 212 event-equivalence judgments complete:
**1,450 successful benchmark model calls, no HTTP failures, transport retries,
empty answers, failed verdicts, or output truncations**. Two separate synthetic
transport checks add 79 input / 22 output tokens and approximately $0.000042;
they are not benchmark answers. The generated and judged model identifier is
`gpt-5.6-luna`, with reasoning disabled throughout.

| Benchmark model phase | Calls | Total input tokens | Output tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: |
| Answer generation | 400 | 5,098,292 | 100,717 | $1.395373 |
| Rubric judging | 838 | 545,486 | 40,222 | $0.170918 |
| Event alignment | 212 | 18,350 | 2,544 | $0.006723 |
| **Total** | **1,450** | **5,662,128** | **143,483** | **$1.573015** |

Answer input averages **12,745.73 tokens**, median **12,597.5**. The evidence budget
is an estimate over source text; the full API input also includes JSON metadata,
question/category guidance and evaluation hints. Token totals above are recorded
provider usage, not median-times-question-count projections.

No cached input reads are reported. Answer generation reports 5,097,092 cache-write
tokens; rubric judging reports 271,095. They are subsets of prompt input, not extra
input tokens. Costs use the frozen [OpenAI Luna rate card](https://developers.openai.com/api/docs/models/gpt-5.6-luna):
$0.20/M ordinary input, $0.02/M cached reads, $0.25/M cache writes and $1.20/M output.
The formula is `(input − reads − writes)×ordinary + reads×cached + writes×write +
output×output-rate`, with rates per million. These are usage-based estimates,
not invoices or a controlled cross-provider cache comparison.

The backend indexes **21,119 source/profile chunks**. Independent cl100k counting
estimates **2,597,266 initial embedding input tokens**; this is not a managed
provider usage receipt. There is no generative extraction/summarization during
memory construction. Managed query embeddings, native reranking, writes/reads and
physical storage are separate costs; the model table is not total system cost.
Recorded HTTP timings do not establish SillyTavern reply latency, TTFT or a
matched speed comparison with Past.

All 400 retrievals and all stored source fields verify against the normalized
input. Exact microsecond filters, top100 rankings, original and corrected packing,
answer prompt bodies, native model settings and saved score arithmetic reconstruct
offline. All 20 owned collections are deleted with 404 evidence. `npm test` passes
388 tests; `npm run check`, `npm run check:release`, `npm run check:sdk`, Node
syntax and Python compilation pass. This is a live API benchmark, not a browser
integration run, deployment, or calibrated judge-accuracy study.

The complete local-only bundle is
`artifacts/archive/beam-past-100k-v1.tar.gz`: **86,082,977 bytes**, SHA-256
`ad9d7a629b71c12c8037efdb1aca2684706ff53e2aad6a314f73c6acc9db1f15`.
All **2,748 members** were read back and checked; the configured-secret scan
found zero matches. Identical archive copies exist in the primary `sillymemory`
and `sillymemory-beam-past-protocol` worktrees on the same machine. They are not
independent remote backups and are unavailable in a fresh clone. Restore into a
new directory and follow the bundle's `RESTORE.md`; the frozen retrieval and
generation producers, protocol/recall locks, dependency locks, source review and
all original receipts remain available without new provider calls. The producing
public base is `cbd27ab470e67af105b2bd56fd3f642c6702cf17` plus the archived
experiment source snapshots; original historical bundles remain unchanged.

Post-run review hardens the maintained runner's failure and input guards. HTTP
status classification survives non-JSON model/memory-service errors; receipt
logging leaves the SDK response readable. Repacking selects successful query
attempts while retaining failures in the ledger. An existing protocol is rejected
before input rewrites, and every phase checks canonical settings plus the complete
required source/input manifest. Scoring requires exactly the 20 expected recall
paths derived from the pinned dataset, then verifies every digest before model
calls. The final suites pass **390 JavaScript and seven Python tests**.

These guards make no new paid calls or label changes. The original measured
protocol matches the canonical settings, and its complete 20-file recall manifest
passes the new check. The archive retains the exact executed producer; use its
restoration instructions for historical verification rather than assume the later
maintained runner has the same source hash.

## Lossless context layout follow-up (2026-10-20)

**Defer adoption and the quality-improvement claim.** A user-authorized follow-up
compares one lossless presentation candidate with a fresh baseline on 397 paired
questions: **88.92 → 89.77/100 (+0.85 points)**. The 95% conversation-cluster
bootstrap interval is **−0.32 to +2.06 points**, crossing zero and failing the
predeclared positive-lower-bound quality gate. Answer input falls **11.87%**.
Text preservation establishes an input-saving opportunity, not equivalent answer
quality or an established quality improvement. Keep the ranked baseline and
product defaults; close this candidate without a wider optimization grid.

### Frozen method and source audit

The original 400-question run and receipts remain unchanged. Before candidate
answers, the 397 questions other than the three previously source-reviewed
discovery cases were frozen.
Historical scores and aggregates were already known: this is
**not an unseen holdout**. Both arms were freshly generated and judged, preserving the
pinned Past/ExaBase prompts, annotations, strict schemas, score arithmetic,
`gpt-5.6-luna`/reasoning `none`, direct OpenAI route and as-of cutoffs. Per-question
SHA-256 parity determines which arm launches first; retain four concurrent
conversations and up to 20 question pairs per conversation. One answer per arm,
no favorable repeats. Bounds: 794 answers, 12,000 model attempts, $25 conservative
reservation ceiling, eight hours, zero new memory-service calls. The frozen plan
SHA-256 is `ff037a057de8eef9f78d94fdc012a6e5b97d107e0d091b94a6a84ce23fc6f5c1`.

The candidate keeps exactly the original selected chunks and 8,000 estimated
source-text budget. Group passages by source message, sort messages by ordinal
and passages by source offset, and dictionary-encode repeated time-meaning labels.
Preserve all source text, roles, authors, source/turn IDs, ordinals, passage IDs,
offsets, batch reference dates, time meanings and original selected retrieval
positions. No deduplication, summarization, source addition, reranking or answer
instruction change. This tests a presentation bundle; it does not isolate the
contributions of ordering and metadata compaction. It cannot recover the $120
budget excluded from the original selected evidence.

Offline reconstruction verifies all text, metadata, source eligibility and budget
on all 400 saved contexts, with zero loss or selected-chunk changes. Serialized
cl100k context tokens fall 5,060,535 → 4,454,643 (11.97%), with no increases in any
question. These are context-only diagnostics; actual API answer input is below.

The historical 400-question baseline has 103 imperfect answers. Their 284 annotated
message references include 151 complete deliveries, 41 partial deliveries, 29 found in top100
but unselected, and 63 absent from top100. These are **message-coverage statuses,
not causal failure counts or verified necessary-fact recall**; equivalent facts
can occur elsewhere and partial messages require manual review. All 40 baseline
contradiction answers are imperfect. Their fourth rubric item, asking which
statement is correct, receives zero in 36 cases and half-credit in four. The
answer guidance asks for both claims without a definitive answer, while some
judge reasons read this item as determining the correct claim. Keep the existing
labels and prompts; do not attribute this whole category gap to retrieval.

### Paired scores and resource use

| Ability | Paired questions | Fresh baseline /100 | Candidate /100 |
| --- | ---: | ---: | ---: |
| Abstention | 40 | 92.50 | 92.50 |
| Contradiction resolution | 39 | 70.83 | 70.19 |
| Event ordering | 40 | 100.00 | 100.00 |
| Information extraction | 39 | 89.16 | 91.99 |
| Instruction following | 40 | 94.38 | 93.13 |
| Knowledge update | 39 | 80.13 | 89.10 |
| Multi session reasoning | 40 | 68.37 | 68.24 |
| Preference following | 40 | 100.00 | 99.38 |
| Summarization | 40 | 97.54 | 97.69 |
| Temporal reasoning | 40 | 95.63 | 95.00 |
| **Overall** | **397** | **88.92** | **89.77** |

Across pairs, 33 improve, 27 regress and 337 are unchanged. The interval uses
20,000 conversation-cluster resamples, seed 20261020. Knowledge update improves
80.13 → 89.10, while instruction following falls 94.38 → 93.13 and several other
categories also decline; category means are descriptive, not separate established
wins. The historical baseline on these same 397 questions was 89.55; do not
compare the candidate with the original 400-question 89.00 as a paired effect.

A post-result source review illustrates both outcomes: `13_knowledge_update_1`
changes the answer from an older $35 budget to the updated $50 budget (0 → 1),
with both values present in the same selected evidence. In
`17_instruction_following_0`, the MM/DD/YYYY instruction is present in both arms,
but only the baseline follows it (1 → 0). These selected examples do not estimate
failure prevalence.

| Recorded usage | Fresh baseline | Candidate |
| --- | ---: | ---: |
| Answer input tokens, 397 calls | 5,060,310 | 4,459,748 |
| Mean / median answer input | 12,746.37 / 12,599 | 11,233.62 / 11,097 |
| Answer output tokens | 101,590 | 108,891 |
| Answer model estimated USD | $1.386926 | $1.245547 |
| Rubric judge input tokens, 831 calls | 542,881 | 576,644 |
| Equivalence judge input tokens, 212 calls | 18,350 | 18,350 |
| All model phases estimated USD | $1.564188 | $1.430674 |

All **2,880 model calls** finish with HTTP 200, without retries, empty answers,
failed verdicts or truncation: 794 answers, 1,662 rubric and 424 equivalence
judgments. Total estimated model cost is **$2.994862**, using the frozen rate card
above; these are usage estimates, not invoices. Both arms report zero cached
reads. Answer cache writes are 5,059,119 / 4,458,557 and rubric writes are
279,483 / 303,450; writes are subsets of input. Candidate answer output increases,
so do not equate input savings with total-cost savings. This interleaved replay
does not isolate cache effectiveness or establish host-latency improvements.

All saved score arithmetic, native model parameters, exact answer and judge
prompts, source reconstruction and usage totals verify offline. The candidate's
small synthetic regression and the full 391-test JavaScript suite pass; seven
Python tests, runtime/release and SDK checks pass. Retain the unadopted prototype
and regression in the evidence bundle rather than add an unused maintained mode.
After removing that prototype, the final maintained suite passes 390 tests and
the archived producer still verifies offline.
No runtime/default change, new ingestion/retrieval, collection creation, browser
integration or deployment occurred.

Retained evidence: `artifacts/archive/beam-context-layout-v1.tar.gz`,
**23,285,832 bytes**, SHA-256
`41448cdb1332666a9a1fe0516f0919e5af1a7e3da65bf6f47778e85dcd96f338`.
All **2,909 members** were read back and checked; configured-secret matches: zero.
Identical copies exist in the primary and protocol worktrees on the same machine.
This bundle is local-only and unavailable in a fresh clone. Restore it beside
`beam-past-100k-v1/` from the original archive recorded above, then follow its
`RESTORE.md` for offline verification. The original archive provides the pinned
upstream source/data and dependency locks; the follow-up retains its exact
producer, frozen plan/cohort/context hashes, source audits and complete fresh
requests, responses, usage and results. Preserved source precedes removal of the
unadopted active-tree prototype. Producing checkout: `f9e495bc0297f7c6ab10293c1806551a33567498`
plus the archived candidate source. Neither archive was overwritten.

## Decision and scope (2026-10-19)

PR #84 closed the 128K, 1M and 10M baselines and bounded follow-up comparisons.
Keep original-text managed OpenAI Small retrieval, default native Jev criteria,
k200/candidate200/final50, ranked 4096-token memory and the original BEAM judge.
The full 10M retrievalText comparison does **not establish reliable general answer
benefit**: other-198 rubric 63.05→64.09, mixed 60.10→60.18, with 22.8% more embedding
input and 41 newly missing source references. **Defer retrievalText adoption.**
Keep the 8192-budget and message-diversity candidates unadopted; close the judge grid.

Role and verified host-time context in product reranking are a separate,
user-approved semantic decision, not a promotion justified by these scores.
BEAM batch dates remain distinct from host timestamps. Historical controls and
labels below are unchanged. Small→Large was unexecuted at PR #84 closure. The
[subsequent 40-question screen](beam-large-embedding-evaluation.md) now closes that
separate decision with adoption deferred; it does not replace these prior scores.
The [remaining-failure summary](#remaining-failure-types-summary-updated-2026-10-20)
keeps the unresolved problems and their model/evidence scope in one place.

After [LongMemEval-S closure](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18),
use all **20 conversations / 400 questions** in `chats/100K`, called **128K** by the
[MIT-licensed upstream dataset](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a).
Pin that source revision and prefer `chat_trunecated.json` as its loader does.
Source conversations measure 92,928–121,849 cl100k tokens; that is not generation
input length. This is an independent memory evaluation, not a SillyTavern browser
run. The 1M and 10M buckets are reported separately below; 500K and an exhaustive
fact-level error census remain untested.

## Remaining failure types (summary updated 2026-10-20)

**Model scope: Small.** This summary draws on the completed 200-question BEAM 10M
comparison of original-text retrieval and role/date `retrievalText`, both using
managed OpenAI Small. It organizes existing evidence into five failure types;
it is not a new run or an exhaustive classification of every wrong answer.

| Failure type | Observed problem | What remains unresolved |
| --- | --- | --- |
| **1. Retrieval omission** | A needed fact never enters candidate 200. The original arm misses the specific MQTT and Redis incidents. | Recover concrete incidents and relationships without losing existing facts. Reranking or a larger prompt cannot recover facts absent from the candidates. |
| **2. Reranking loss** | A retrieved source reaches candidate 200 but falls outside final 50. | Keep question-relevant facts through final selection; higher message coverage alone does not prove that the required clause survives. |
| **3. Prompt-packing loss** | A source reaches final 50 but is omitted from the 4096-token memory. AWS pricing/instance count and the Udemy choice demonstrate this mechanism. | Deliver necessary facts within the budget. Blanket budget expansion has not established a general remedy. |
| **4. Answer use or interpretation error** | Delivered facts are ignored, competing dates are selected, or assistant examples/plans are treated as user experience or completed events. | Use the available facts with correct attribution, chronology and uncertainty. More retrieved sources alone do not resolve these errors. |
| **5. Reference or judging ambiguity** | Equivalent 2.6M-document answers receive different labels; a source year can conflict with the rubric year. | Separate actual answer failures from inconsistent grading or ambiguous targets. Preserve original labels and report ambiguity rather than count every low score as a confirmed model error. |

The original Small arm has **1,142 absent annotated source messages**: 1,023 are
already absent at candidate 200, 75 disappear at final 50 and 44 at packing.
These count **source annotations, not wrong answers or missing necessary facts**.
An alternative message may still supply the fact. Of the selected 69 answer pairs
reviewed, 27 show changed answer use/provenance/sequence and 41 have judge/reference
ambiguity; these overlapping labels are not all-200 error rates. See the
[detailed failure-stage analysis](#offline-10m-failure-stage-attribution-2026-10-19).

**Current status:** retain Small. The later [Small/Large 40-question screen](beam-large-embedding-evaluation.md)
found concrete gains and losses and deferred Large adoption. It generated no new
answers or judgments, so it adds retrieval/delivery evidence, **not a Large-answer
error classification**. No fix covering all five failure types has been validated;
these remain unresolved quality categories.

## Frozen policy and scoring

These are the initial 128K baseline controls. Later sections explicitly identify
role/batch-date reranking and display changes; the 1M and 10M runs inherit that
benchmark adapter. They do not retroactively change the initial text-only control.

- Managed OpenAI Small embeds original text; English Bayesian Query1, vector k 200,
  native Jev 1.13.0/default criteria/text field, candidate 200/final 50, strong reads.
- Product 800-character boundary-aware chunks, overlap/source assembly and quoted
  chronological archive; 4096 memory tokens including framing/guidance. Retain four
  original recent messages plus the probe. Each probe starts from identical history.
- Generator: `gpt-6.1-sol`, low reasoning, 4096 output cap, nonstreaming, product
  memory guidance and a neutral history-answering system message. This is our
  memory policy, not the paper's generation configuration.
- Reference judge: `gpt-4.1-mini-2025-04-14`, temperature 0, exact upstream rubric
  prompt and 0/0.5/1 credit. That prompt does not separately include the question.
- Preserve upstream newline splitting, greedy first-unmatched semantic alignment
  and Kendall tau. The [reporting script](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/evaluation/report_results.py)
  substitutes normalized event-ordering tau for that category's rubric mean.
  Report both aggregates; neither is a pass rate or LongMemEval answer accuracy.

References never enter runtime. Do not invent message dates, change judge labels,
select favorable repeats or confuse structural message-span coverage with verified
necessary-fact recall. LongMemEval's adopted Jev Yes/No policy remains separate.

## Full baseline results

**Mixed mean 71.92/100; uniform rubric mean 76.66/100.** All 400 included: 230 full,
133 partial and 37 zero rubric scores. Event-ordering tau is 24.25/100, explaining
the lower mixed aggregate. Rubric compliance and event alignment measure different
behavior; neither establishes independently calibrated answer correctness.

| Ability | Questions | Rubric mean /100 |
| --- | ---: | ---: |
| Abstention | 40 | 97.50 |
| Information extraction | 40 | 90.42 |
| Preference following | 40 | 88.13 |
| Contradiction resolution | 40 | 79.06 |
| Knowledge update | 40 | 77.50 |
| Instruction following | 40 | 72.50 |
| Event ordering | 40 | 71.70 |
| Multi-session reasoning | 40 | 71.64 |
| Temporal reasoning | 40 | 67.50 |
| Summarization | 40 | 50.71 |

Mean generation input: 6,024.57 tokens. Query median/p95: 1.381/1.706 seconds;
generation: 4.922/19.950; per-case sum: 6.266/21.355. These exclude import, packing,
queue waits and judging; they are not browser latency or time to first token.
Generation estimate: $7.025; judging/alignment: $0.692; initial write/managed
embedding: $0.0677. Native rerank billed tokens and physical GB-hours are unknown.
All cost figures use recorded usage/frozen gross rates, not invoices; do not add
direct-provider inference charges to LambdaDB LIU charges.

## Follow-up: source-stage audit (2026-10-18)

Four diagnostic questions trace unchanged final 50, reranked 200, fused 200 and
component top 200 results without new generation. Some required facts already in
fused 200 are demoted by reranking; others miss both components, are omitted by
packing, or reach generation but are unused. Recurring assistant plans can crowd
out personal facts. Repeated queries differ, so fresh ranks do not prove original
candidate membership. Neither blanket candidate expansion nor a larger token
budget addresses every mechanism. Preserve the evaluator's target/alignment
ambiguities separately from memory failures. No product change follows this audit.

## Fixed-answer Jev judge comparison (2026-10-18)

**Do not replace the BEAM judge with this adapter.** Choice maps original rubrics
to 1/0.5/0; Noul>=0.50 supplies event alignment, preserving upstream matching.
The partial-credit control fails. Three full 400 passes give mixed 64.41/64.18/64.39
and rubric 66.54/66.22/66.45. On identical inputs, 26/1,051 criterion labels and
25/400 question averages vary. Low cost and similar aggregate repeats do not
establish correctness or determinism. First-pass estimate: $0.05892. No retrieval
or generation changes; retain these labels as diagnostic evidence only.

## Fixed-answer Sol-medium judge comparison (2026-10-18)

**Keep as a second opinion.** Original prompts/scale with medium reasoning and no
temperature yield full 400 mixed 70.08, rubric 71.92; estimate: $4.079. Controls and
several inspected judgments improve, but 4/40 preselected question averages vary
across three calls. Missing question context and debatable rubric interpretation
remain. No independently calibrated judge-accuracy claim or primary replacement.

## Fixed-answer Luna-medium judge comparison (2026-10-18)

**End the model grid without replacement.** Same saved answers and Sol protocol,
changing only model to `gpt-6-luna`: full 400 mixed 70.86, rubric 72.33; estimate: $0.251.
Controls pass, but 10/40 repeated question averages vary versus Sol's 4/40.
GPT-4.1-mini has no matched repeats; this does not establish its superiority.
A future judge change needs a defined task-context protocol and independent
calibration, not selection by aggregate score. No memory-quality change occurred.

## Evidence-oriented reranking criteria (2026-10-18)

**Keep native default criteria.** Five evidence/provenance-oriented instructions
improve some source delivery but do not establish net benefit. Freshly paired
40-case mixed 79.85→72.72; rubric 84.79→75.63; complete injected annotations 38→45/95.
Personal-history gains coexist with personalization loss and inconsistent judging.
The selected five diagnostic cases improve 23→48 rubric, not representative quality.
Exact instructions and source reviews are archived; no runtime/default promotion.

## Speaker role in native reranking (2026-10-18)

**Retain as a promising candidate.** `fields:['text']` versus `['role','text']`,
with explicit `role:keyword` schema in both arms, gives fresh 40-case mixed
74.01→75.02 and rubric 78.38→80.42; event tau 27.19→19.80, complete annotations 37→39/95.
Measured gains deserve further comparison, despite source tradeoffs and judge
artifacts. The earlier blanket recommendation against expansion was too strong.
No default promotion; the user-requested date screen below follows this trial.

## Batch-reference dates in reranking and generation (2026-10-19)

**Full-cohort evidence; subsequent semantic adoption is separate.** BEAM supplies a batch
reference date, not each message's send time or every event's date. Map original
batch membership to chunk metadata; explicit event dates remain authoritative.
The [generation prompt](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/prompts.py)
and source inspection support this distinction. Do not label the anchor `sent`.

The earlier 45-question screen compared role, role+date and date display. Its fixed
40 mixed means were 71.27/71.52/73.59, with five diagnostic rubric means 34/24/20.
That screen justified the completed full comparison below, not default adoption.

All 400 questions now have fresh paired retrieval, generation and judging:

- **Default:** rerank `['text']`; original generation rendering.
- **Candidate:** rerank `['role','batch_time_context','text']`; metadata says
  `Conversation batch reference date: YYYY-MM-DD. This is not a message send time
  or an event date.` Display `batch_time_anchor` with interpretation guidance,
  include date in grouping identity and repack under the same 4096 budget.

Both arms share an enriched schema/collection and unchanged embedding text, query,
models, criteria and recent dialogue; recent messages receive no added anchors.
This tests the combined reranking/display policy, not isolated date effects or
identical selected passages. The complete 200-candidate ID sets are not exposed.

| Full paired 400 | Default | Candidate |
| --- | ---: | ---: |
| Mixed mean /100 | 71.55 | 72.17 |
| Uniform rubric /100 | 76.64 | 77.41 |
| Event tau /100 | 22.36 | 21.91 |
| Complete returned annotations /1,094 | 435 | 455 |
| Complete/partial/absent delivered annotations /1,094 | 377/115/600 | 395/116/581 |
| Native-recent annotations /1,094 | 2 | 2 |
| Mean selected chunks | 27.10 | 25.46 |

Rubric labels improve in 56 questions, decline in 50 and tie in 294. The prior 45
screen questions score 71.30→73.67 uniform rubric; the remaining 355 score
77.32→77.88. Neither group is unseen: historical baseline answers existed for all.
The mixed gain is +0.62 points; a 10,000-replicate paired conversation bootstrap
gives a descriptive 95% interval of -1.43 to +2.56. It measures corpus sampling,
not judge validity or inference-repeat uncertainty. Annotation coverage is not
necessary-fact recall; preserve raw labels without a corrected score.

Source inspection finds a real date-format gain: a scheduling-format preference
enters the candidate prompt, with batch context supporting the event year. But a
98%-accuracy target is returned in both arms and lost during candidate packing.
Some already-delivered facts are used better; several large label changes are
judge errors, including identical answers receiving different credit and 19 movies
being accepted for a 13-movie target. Thirty selected answer pairs and all 25
changed event-alignment mappings were inspected; this is not an exhaustive fact
audit or independent calibration. BEAM batch anchors also do not validate a host
message-send-time deployment. The trial recommendation was to defer promotion
on score alone. The subsequent [product decision](conversation-time.md) exposes
source role and verified host-time meaning to Jev without changing existing
generation labels. No further grid or claim of reliable quality uplift follows.

Mean generation input: 6,023.32→6,024.09 tokens. Query median/p95: 1.338/1.652s →
1.477/1.734s; generation: 5.378/19.633s → 5.278/19.735s. These exclude queueing,
packing and judging. Generation costs about $7.029 per arm; total generation and
evaluation $15.450, initial shared write/managed embedding $0.0704. These are
frozen-rate estimates, not invoices; native rerank tokens and physical storage
remain unknown. The enriched shared schema is not a bare-product cost baseline.
All 800 queries, 800 answers, 2,102 rubric and 2,348 alignment calls complete.
One upsert 429 recovers; no completion retries. All 20 collections deleted/404.

## Fixed retrieval, 4096 versus 8192 memory tokens (2026-10-19)

**Retain the 4096-token default.** Reuse the preceding role/date candidate's exact
top 50 results for all 400 questions, changing only the memory budget. Both arms
generate and judge fresh answers; the 4096 inputs reproduce the parent exactly.
Ranking, source metadata, recent dialogue, models, guidance and output cap stay
fixed. No new LambdaDB calls occur. This is independent memory evaluation, not a
SillyTavern run or a change to the product's budget limit.

| Full paired 400 | 4096 | 8192 |
| --- | ---: | ---: |
| Mixed mean /100 | 72.67 | 72.20 |
| Uniform rubric /100 | 78.34 | 77.38 |
| Event tau /100 | 22.35 | 23.85 |
| Complete delivered annotations /1,094 | 395 | 451 |
| Mean selected chunks | 25.46 | 47.83 |
| Mean generation input tokens | 6,024 | 9,537 |
| Generation median / p95 seconds | 4.61 / 17.17 | 4.78 / 18.78 |
| 400-generation estimated USD | 7.01 | 10.58 |

Labels improve in 50 questions, decline in 62 and tie in 288. The mixed difference
is -0.47 points, with a descriptive conversation-bootstrap 95% interval of
-2.43 to +1.52. Neither score is a pass rate. Additional source-span coverage in
66 questions establishes delivery gains, not necessary-fact recall or answer
improvement. At 8192, 251 questions fit all 50 chunks; one other question loses a
short previously selected chunk, without losing any annotated-message coverage.

Inspection confirms useful recoveries: the September 98% target, a date-format
preference and reasons for a book choice enter the larger prompt and answer.
But changed event interpretation and substantial judge inconsistencies remain:
equivalent dates receive different credit, 19 movies is credited for 13, and one
score contradicts its own rationale. Eleven prespecified rubric pairs and three
largest event-metric movements were inspected without relabeling. The previous
identical 4096 input run scored 77.41 rubric; the fresh reference scores 78.34.
Thus this does not establish that more context harms answers. It establishes
additional delivery without demonstrated aggregate answer benefit, at about 51%
higher generation cost. Do not promote 8192 or reopen the judge-model grid on
these results alone.

All 800 answers, 2,102 rubric calls and 2,375 event-equivalence calls complete
without errors or retries. Request/source bindings and upstream metrics verify;
380 unit tests and runtime/release checks pass. Costs use recorded usage and the
frozen rate card, not invoices; latency excludes queueing, packing and search.
Search cost is unchanged, not zero in production. The local-only
`beam-budget4096-8192-v1` bundle retains the plan, raw responses, source review,
costs, verification and restoration instructions; product defaults are unchanged.

## Message-diverse selection: offline gate (2026-10-19)

**Keep ranked selection; do not adopt unconditional message rounds.** Reuse the
same saved top 50 and 4096 budget for all 400 questions. Change only admission
order: each original message contributes its highest-ranked chunk, then its next
chunk in subsequent rounds. Preserve source validation, assembly, chronological
rendering, framing and recent dialogue. All 400 baseline outputs reproduce exactly.
This is message diversity, not semantic deduplication.

| Offline delivery metric | Ranked | Message rounds |
| --- | ---: | ---: |
| Mean distinct messages | 18.26 | 24.38 |
| Mean selected chunks | 25.46 | 25.14 |
| Complete / partial / absent annotations | 395 / 116 / 581 | 402 / 152 / 538 |
| Mean memory tokens | 4067.18 | 4066.44 |

Two further annotations remain in native recent dialogue, for 1094 total.
Annotated non-whitespace source coverage gains only in 21 questions, loses only
in 29, changes both ways in 14 and is unchanged in 336. These are not answer
wins/losses or necessary-fact recall. Selection changes in 383 questions.

Nine cases were inspected: the three largest net span gains/losses and three
previous budget-loss discoveries. Date-format preference, the September 98%
target and May 15 filing date enter the candidate memory. But source rank 4's
capped-backoff instruction and rank 3's compliance-checklist instruction disappear
in other questions. Separate messages still repeat generic advice. Conversely,
large span loss in the mentor-call case leaves most requested facts in a retained
user message; character coverage alone overstates that loss. The book-choice
reasons remain missing. This selective source audit does not establish an answer
score or a new legal/technical advice assessment.

One message can contain several necessary facts; different messages can repeat
the same content. The unconditional rule therefore fails the offline promotion
gate. Stop without paid generation/judging; no answer-level effect is measured.
No product changes, new remote calls or collections. Budget/chronology/source
hash checks pass. The local-only `beam-message-diversity-v1` bundle preserves
all 400 selections, changed spans, reviewed excerpts and reproduction instructions.

## Full 1M baseline (2026-10-19)

Run all **35 conversations / 700 probes** in pinned `chats/1M`, without tuning or
variants. Keep Small managed embeddings, English Bayesian Query1, k 200, native
Jev 1.13.0 candidate 200/final 50, strong reads, ranked 4096-token assembly and
four recent original messages plus the probe. Use the latest 128K role/batch-date
rerank and display adapter, Sol low generation, and original GPT-4.1-mini rubric
and event alignment. This is an independent memory run, not a browser test.

Histories contain 795,979–1,016,246 cl100k tokens (median 981,578), totaling
33,261,995 tokens and 255,192 indexed chunks. Chats 5 and 26 reuse 190 original
message IDs. Preserve every message and index/date-map by position; report the
26 ambiguous annotation references separately rather than choose an occurrence.
The preflight correction preceded all paid calls; source bytes/rubrics are intact.

**Mixed mean 68.13/100; uniform rubric mean 71.91/100; event tau 26.08/100.**
There are 346 full-credit, 277 partial and 77 zero-credit rubric results. These
are partial-credit metrics, not pass rates. The latest 128K/4096 arm scored
72.67 mixed and 78.34 rubric. The cohorts have different conversations/questions:
the lower 1M aggregates do not isolate history length or establish a paired
regression. Instruction following and summarization are descriptively higher.

| Ability | Questions | Rubric mean /100 |
| --- | ---: | ---: |
| Abstention | 70 | 88.57 |
| Preference following | 70 | 86.79 |
| Instruction following | 70 | 83.33 |
| Information extraction | 70 | 80.65 |
| Knowledge update | 70 | 72.86 |
| Contradiction resolution | 70 | 67.14 |
| Multi-session reasoning | 70 | 65.35 |
| Event ordering | 70 | 63.95 |
| Summarization | 70 | 56.92 |
| Temporal reasoning | 70 | 53.57 |

Of 5,357 per-question source annotations, returned coverage is 801 complete,
321 partial and 4,205 absent; delivered coverage is 622 complete, 201 partial and
4,504 absent. Four remain in native recent dialogue and 26 are ambiguous. These
are message-body spans, **not necessary-fact recall**. Mean selected memory is
25.10 chunks / 19.36 messages and 4,066.91 tokens, with a 4,096 maximum.

Inspect one lowest-rubric case per ability, breaking ties by numeric chat/ID.
This selective review explains failures; it neither estimates their prevalence
nor changes labels:

- Retrieval misses: the game-component timeline's annotated sources and the
  explicit middleware-version instruction do not appear in the final 50.
- Delivery losses: the updated Lambda allocation of 384 MB is rank 33 and omitted,
  while older 512 MB is delivered. The first vector field is rank 39 and omitted;
  the eight-book example is rank 22 and omitted.
- Available evidence unused: numerical variance examples and requests for examples
  reach the prompt, but the answer asks for the problem and gives only formulas.
- Reference/judge disagreements: the Kong abstention rubric denies configuration
  information present in delivered source. The timeline rubric requires 45 days
  from original dates, while delivered, explicitly accepted revisions support
  the answer's 51 days. Some rubric judgments deny facts explicitly in answers.
  Preserve these separately from genuine memory losses, without a corrected score.

Query median/p95 is **1.530/1.852 s**; generation is **5.448/30.384 s**. Per-case
query-plus-answer sum is 7.118/32.093 s, excluding import, packing, queueing and
judging; it is not browser latency or TTFT. Mean generation input is 6,330 tokens
(p95 7,444), including recent dialogue and instructions beyond the memory budget.
Frozen-rate estimates: generation **$13.410 for 700 answers**; judging/alignment
$1.905; initial LambdaDB write/managed embedding $1.011. Query embedding and
minimum query reads add $0.00734; verification fetches add a $0.02566 minimum.
Native rerank text-volume proxies are $0.823 document-only or $0.967 with repeated
query text, not billing bounds: actual candidate tokens, metadata/protocol overhead
and physical storage GB-hours are unavailable. These are gross estimates before
free allowances, not invoices or a precise total price.

All 700 answers, 2,415 rubric calls and 5,651 event comparisons complete without
generation/judge errors, retries or truncations. One initial upsert 429 recovers;
all 35 owned collections are deleted with 404 verification. All request/source,
packing/final-input bindings, phase hashes and upstream score reconstruction pass.
`npm test` passes 380 tests; runtime syntax, release metadata and locked SDK checks
pass. No new browser validation is claimed for this experiment-only addition.
**Close this scale baseline and keep current defaults.** Future candidates must
target verified retrieval/delivery failures separately from evaluator ambiguity;
this run does not justify another model grid or blanket budget increase. The
local-only `beam1m-current-v1` bundle retains exact sources, receipts, runtime,
rate card, ten-case review and restoration instructions.

## Full 10M baseline (2026-10-19)

All **10 conversations / 200 probes** in pinned `chats/10M` complete under the
same Small/Query1/k200/Jev200/final50/ranked4096 policy, recent dialogue, Sol low
and original GPT-4.1-mini rubric/event alignment. **500K remains excluded**;
this is not the full 2,000-question BEAM evaluation. Source histories total
96,139,143 cl100k tokens and 702,393 indexed chunks. Preserve original order,
roles, bytes and unique source IDs. Omit dates for one unanchored 244-message
batch; exclude the one non-ID `--` annotation from structural coverage only.
Batch anchors are neither message-send nor event dates.

| Frozen current-policy cohort | Questions | Mixed /100 | Rubric /100 | Event tau /100 |
| --- | ---: | ---: | ---: | ---: |
| Latest 128K, 4096 arm | 400 | 72.67 | 78.34 | 22.35 |
| 1M | 700 | 68.13 | 71.91 | 26.08 |
| 10M | 200 | **59.54** | **61.93** | **25.97** |

These partial-credit metrics are not pass rates. Different bucket cohorts do not
isolate a causal length effect. The 10M rubric gives 88 full, 69 partial and
43 zero-credit answers. Of 1,325 distinct per-question integer source references
across 176 probes, final50 coverage is 194 complete / 36 partial / 1,095 absent;
actual delivery is 159 / 28 / 1,138. This is not necessary-fact recall. Selected
memory averages 4,066.91 tokens within the 4,096 limit.

Ten source-reviewed failures distinguish broad timeline/summary retrieval misses,
packing loss of AWS pricing and Elasticsearch counts, competing Milvus versions,
and reference ambiguity such as a five-problem target mistaken for completion.
No labels are corrected. Query median/p95 is 1.659/1.979 s; generation is
6.531/22.998 s. These exclude import/packing/queueing and are not host latency.
Frozen gross estimates separate $3.718 generation, $0.496 judging/alignment and
$2.894 initial write/managed embedding. Native rerank and storage costs remain
incomplete proxies, not an invoice.

All 200 answers, 621 rubric calls and 2,466 event comparisons finish without
completion errors, retries or truncation. One upsert 429 recovers; all ten owned
collections are deleted with 404 confirmation. Source/query/packing/phase-lock
and upstream scoring checks pass; 380 unit tests, syntax, release metadata and
locked SDK checks pass. **Close the baseline with defaults unchanged.** The
local-only `beam10m-current-v1` bundle preserves complete results, per-ability
scores, source review, costs, receipts and restoration instructions. The original
detailed baseline section is also preserved in the full-cohort comparison bundle.

## Full 10M retrieval representation comparison (2026-10-19)

**Defer default adoption.** All 200 questions compare original text with one full
role/batch-date retrieval representation, including the explicit disclaimer that
the date is neither a send time nor an event date. Only English full-text and
managed embedding input change; original text, metadata, rerank fields, recent
context and generation instructions stay fixed. The compact variant is excluded.
Managed OpenAI Small, Bayesian Query 1 k 200, native Jev 1.13.0 candidate 200,
final 50 and 4,096-token injection remain fixed across 702,393 chunks.

Live retrieval completes 800 queries. Complete/partial/absent source-message
coverage changes from 260/42/1,023 to 253/58/1,014 at candidate 200,
193/34/1,098 to 192/52/1,081 at final 50, and **154/29/1,142 to
156/40/1,129 at delivery**. Outside the two discovery questions, delivered
complete coverage stays 153 while partial rises 29 to 40. Overall, 54 absent
references become available and 41 existing references disappear. These sparse
annotations are not exhaustive necessary-fact recall. All 79 changed-coverage
questions were source reviewed; concrete gains admitted the conditional answer run.

Both arms then generate 200 fresh answers using unchanged original generation,
rubric and event-equivalence settings. Scores are on a 0–100 partial-credit scale:

| Cohort | Rubric: original → candidate | Mixed: original → candidate | Event tau: original → candidate |
| --- | --- | --- | --- |
| All 200 | 62.52 → 63.75 | 59.85 → 60.03 | 26.25 → 24.86 |
| Other 198 | 63.05 → 64.09 | 60.10 → 60.18 | 26.81 → 24.61 |
| Diagnostic 2 | 10.00 → 30.00 | 12.76 → 24.80 | 15.52 → 29.60 |

The diagnostic mixed score covers only two abilities and tau one question. The
other 198 are not entirely unseen. Overall rubric gains/losses/ties are 34/29/137;
full-credit answers fall 93 to 89. A ten-conversation bootstrap (10,000 replicates)
gives other-198 rubric delta +1.04 points, 95% interval **−3.40 to +5.70**,
conditional on this one provider realization. No reliable general benefit is shown.

Manual answer review covers all 63 unequal-rubric pairs, three prespecified source
losses with tied scores and three subsequent tau-only changes. AWS and Udemy gains
use recovered facts; operator-theory facts and historical dates regress. Some
answers mistake assistant examples for user experience, and equivalent answers
sometimes receive inconsistent labels. Original labels remain unchanged.

Embedding input grows **22.80%** (96,124,799 to 118,041,870 tokens). Native-query
median/p95 is 1.612/1.841 s versus 1.610/1.880 s; generation 4.844/17.966 s versus
5.004/18.386 s. Concurrent requests and cache warming prevent causal latency claims.
Frozen gross proxies: retrieval $6.572791, generation $7.409480, judging $0.982110,
and aborted pre-search overhead $0.277530; combined incomplete proxy $15.241911.
These are not invoices or current prices; storage and native billing overhead are
unknown. Dual embedding fields are experimental overhead.

All 400 answers, 1,242 rubric calls and 4,746 event comparisons finish without
retry or truncation. Exact query/source, packing, scoring and phase-lock replay
pass. All ten trial collections and four aborted-attempt collections are deleted
and confirmed 404. The abort rejected whitespace-only text before retrieval; the
final run preserves every chunk. Existing evidence remains intact. The bounded
trial is closed with defaults unchanged; no extra model or phrase search follows.

## Offline 10M failure-stage attribution (2026-10-19)

Reanalyze the saved paired run without provider calls or new answers. Of the
original arm's 1,142 absent annotated source messages, 1,023 are already absent
at candidate 200, 75 disappear at final 50 and 44 at 4096 packing. The candidate
counts are 1,014/67/48. Of 41 newly lost delivered references, 27 disappear before
candidate 200, two at final 50 and 12 at packing. These are message annotations,
not counts of missing necessary facts or actual answer errors.

The 79 source reviews and 69 answer reviews distinguish concrete facts from
source IDs. Explicit overlapping codes find availability gains in 26 reviewed
pairs, losses in 16, changed answer use/provenance/sequence in 27, and judge or
reference ambiguity in 41. Sixteen have only the ambiguity label. This selected
sample is not an all-200 error-rate estimate; labels and scores remain unchanged.

Thirteen source-bound factual witnesses from 12 questions pass independent
original-span checks. AWS pricing and Udemy preference already reached original
candidate200/final50 but were unpacked; their gain is improved delivery. MQTT and
Redis enter candidate200 anew. The Corolla clause disappears while another chunk
of the same assistant message remains, demonstrating why message presence alone
cannot establish fact coverage. A November 7 statement remains delivered despite
the candidate answer choosing competing dates; its assistant-plan provenance
still does not establish an actual completed event.

The future hypothesis selected at PR #84 closure was managed Small→Large on
original text, targeting candidate-200 concrete-incident recall. It was unexecuted
in that PR; the earlier LongMemEval 463→465 result did not justify its higher cost.
The local follow-up bundle preserves the proposed 40/160 cohorts and fact gates
for a later bounded decision. The [subsequent screen](beam-large-embedding-evaluation.md)
reports that later run separately; this historical analysis adds no provider,
browser or quality result.

Separately, the approved PR review fix generalizes product guidance from
`today/yesterday` to `relative dates`, covering tomorrow too. Stored benchmark
prompts keep the original wording; existing 10M results do not validate this new
wording's model behavior. Retrieval defaults and all resource limits stay unchanged.

## Validation and evidence retention

Initial quality screens use 5 diagnostics + 40 fixed comparisons; the final date
comparison uses all 400. Preserve English, source validation, isolation and budget
checks. Repeatedly inspected cohorts are
not unseen confirmation. Only within-run paired scores estimate treatment effects;
fresh baselines vary with retrieval, generation and judging. Judge comparisons
instead reuse fixed answers. Unit/emulator checks do not establish live quality.

All owned collections from these runs are deleted with 404 checks. Original-input
replay, request/source bindings, 4096 packing and upstream score reconstruction
pass. At those recorded run revisions, `npm test`: 380, `npm run check`, `npm run check:release`, `npm run check:sdk`
and script/test syntax pass; no browser rerun for these experiment-only changes.

All bundles below are **local-only**, unavailable in a fresh clone. Paths are
`artifacts/archive/<name>.tar.gz`; exact hashes retain provenance, not a download
promise. Original bundles remain unchanged. The detail bundle preserves the entire
775-line report before condensation, including all costs, case interpretations,
producer revisions, dependency paths and offline restoration commands.

| Bundle name | SHA-256 |
| --- | --- |
| `beam128k-current-v1` | `4475551abc48c906aad589e3f75d63fa4b26491188694b74a7d509e4c6e95587` |
| `beam-stage-audit-v2` | `17fb345023e9659ba0de4da7e21e8e197695b435f60fd9cc0027a4a3ce003b7f` |
| `beam-jev-judge-v1` | `cc9aa1738f1a56a1dd315dba677d406a41f50d67d964c2c7573f064247330f0b` |
| `beam-sol-judge-v1` | `0c2fb8121adf8baf05154c58e8ac96e20cb3c0369d518cb65b61d1034e2ab1b8` |
| `beam-luna-judge-v1` | `6f638f7f136072583f54d967ccb0318974accde5cae9393ad341d5bf4d459562` |
| `beam-evidence-criteria-v1` | `f67cf6f3108b818974f319fa9ac322dca57a10b7b4946076e97c9b5bf470e9a3` |
| `beam-role-rerank-v2` | `f9edd7b5d335cfa19c6a3f9de8664ceaf6d37556a8066e7a966c419404fd01ad` |
| `beam-anchor-v1` | `72f9bafb07c7aa4081f5a41643c9364e4bf35fe5cc5df9bc2411840b931b62b4` |
| `beam-evaluation-detail-v1` | `f7f74d64059f78190145a4b844770a8daa422c7f775ca0945d27293ad77c3003` |
| `beam-anchor-full-v1` | `217c769b5a1fa18f0081fa37bb8eba6cfd94f61e2c58d31f02603e160f0600a4` |
| `beam-budget4096-8192-v1` | `06980646a852a074128479ed030e72db4648f697e14336c763e960cc0b352993` |
| `beam-message-diversity-v1` | `8ec2e9210e89a574d63880d8c931a5a1400677ac1254ddea144876ac88ef304f` |
| `beam1m-current-v1` | `0c72b49c2afd353f471d45892b7282561755755dd4a6270e346c68b8c6cbaa3f` |
| `beam10m-current-v1` | `1c16bb89318225721e6ee0a7f0bb906877866a0f3265ab0e0b2eed50fb38334c` |
| `beam10m-index-context-full-v1` (aborted before search) | `1c2ff5e07c3e65ff7895669fd9e54268207b9daad3f0555d31f2e4e641bbab7c` |
| `beam10m-index-context-full-v2` | `c3047e6176f91f9ec0ab74d4765a93db63a1ad142aca52a5bcd0a24542513154` |
| `beam10m-failure-stage-v1` | `8d328e76be57a62df7b061e0d80adb10c3b07f3268f930231d499ed493726ecc` |

The offline failure-stage bundle has 21 verified members (53,815 bytes), produced
at `524dd735bc5dfca44f12cfeab71da6f606d12a10` plus its recorded product patch.
Configured-secret scan and full member readback pass. Its `RESTORE.md` requires
the unchanged full-v2 and baseline bundles; no provider calls are needed. It
preserves the explicit review coding, original-span checks and unexecuted next
hypothesis, separately from the completed full-cohort live comparison.

The full 10M comparison bundle has 14,999 verified members (77,453,845 bytes),
produced at `c0b9153779e7a1f66ac5f669741702ef3d19067a`. Configured-secret scan and
full member readback pass. Restore under `artifacts/` and follow its `RESTORE.md`,
including the unchanged baseline dependency. `RESULTS.md`, source/answer reviews,
all receipts and phase locks preserve the complete decision. The prior 527-line
maintained report is retained byte-for-byte. The aborted bundle contains its
pre-search failure, costs and four verified deletions; it is not a quality result.

The original 10M baseline bundle has 7,523 verified members (313,271,263 bytes), produced at
`7aa1831356fc26911ba061a8aecd203a4931d106`. Configured-secret scanning and full
member readback pass. Restore under `artifacts/` and follow
`beam10m-current-v1/RESTORE.md`; sources, phase locks, runtime and all first-success
receipts are preserved for offline review. No original evidence was deleted.

The 1M bundle has 20,602 verified members (182,827,887 bytes), produced at
`ba19e1a45a03c20d5c568e96578d8c51a67dfa42`. Configured-secret scanning and full
member readback pass. Restore under `artifacts/` and follow
`beam1m-current-v1/RESTORE.md`; its original raw source bytes, phase locks and
runtime snapshot support offline verification without new provider calls.

The full paired bundle contains 13,871 verified members (68,797,556 bytes), produced
at `ea46b6566a46c82ebe670851c2b1a7a8e05a92e7`. Restore it under `artifacts/` and read
`beam-anchor-full-v1/RESTORE.md`: offline replay also needs the original baseline,
anchor-screen and recorded rate-card dependencies. Its `RESULTS.md`, phase locks,
raw receipts and selective review notes preserve the decision and its limits.
The prior 199-line report is retained byte-for-byte in that bundle.

The detail archive is 20,275 bytes with 2 members, copied from commit
`78054bb36524f7db8e853e953bcbf8f5a0821e0a` before removing tracked detail. Full
member readback verifies identical bytes. Restore it under `artifacts/` and read
`beam-evaluation-detail-v1/beam-evaluation-before-condensation.md` for each run's
producer and dependency instructions. The source and all run archives have verified
hashes; original secret-scan/readback receipts remain with the runs. Never rerun paid
producers just to inspect results. Follow the [retention policy](../CONTRIBUTING.md#experiment-lifecycle-and-retention).
