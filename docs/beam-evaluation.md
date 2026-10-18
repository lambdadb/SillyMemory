# BEAM evaluation decisions

## Decision and scope (2026-10-19)

The baseline and full paired 400-question speaker/date comparison are complete.
Keep GPT-4.1-mini BEAM judging unchanged. The bundled reranking/date-display
candidate's small gain does not establish reliable net benefit, and source-delivery
losses remain. Subsequently, adopt role and verified host-time context in product
reranking for their source meaning, with existing prompt labels unchanged. This is
a user-approved semantic decision, not a promotion justified by these scores or
an assertion that BEAM batch dates are host timestamps. Close this trial and the
judge-model grid. This report retains decisions and comparable totals;
case reviews, request/retry histories and producers live in the evidence bundles.
The subsequent fixed-retrieval budget comparison also closes with **4096 retained**:
8192 restores some useful sources but does not demonstrate aggregate answer benefit
at its higher generation cost.
The subsequent full **35-conversation / 700-question 1M baseline** is also complete:
mixed 68.13 and rubric 71.91, with the same current policy. Keep defaults unchanged;
the [1M results](#full-1m-baseline-2026-10-19) separate operational scaling from
remaining retrieval, delivery and evaluator limitations.

After [LongMemEval-S closure](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18),
use all **20 conversations / 400 questions** in `chats/100K`, called **128K** by the
[MIT-licensed upstream dataset](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a).
Pin that source revision and prefer `chat_trunecated.json` as its loader does.
Source conversations measure 92,928–121,849 cl100k tokens; that is not generation
input length. This is an independent memory evaluation, not a SillyTavern browser
run. The 1M bucket is reported separately below; larger buckets and an exhaustive
fact-level error census remain untested.

## Frozen policy and scoring

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

## Validation and evidence retention

Initial quality screens use 5 diagnostics + 40 fixed comparisons; the final date
comparison uses all 400. Preserve English, source validation, isolation and budget
checks. Repeatedly inspected cohorts are
not unseen confirmation. Only within-run paired scores estimate treatment effects;
fresh baselines vary with retrieval, generation and judging. Judge comparisons
instead reuse fixed answers. Unit/emulator checks do not establish live quality.

All owned collections from these runs are deleted with 404 checks. Original-input
replay, request/source bindings, 4096 packing and upstream score reconstruction
pass. `npm test`: 379, `npm run check`, `npm run check:release`, `npm run check:sdk`
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
