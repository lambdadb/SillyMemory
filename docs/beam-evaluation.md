# BEAM evaluation decisions

## Decision and scope (2026-10-19)

The full baseline and bounded follow-ups are complete. Keep product defaults and
GPT-4.1-mini BEAM judging unchanged. Speaker/date-aware reranking remains a
promising candidate for a full fixed-400 comparison, not an adopted improvement.
Close the judge-model grid. This report retains decisions and comparable totals;
case reviews, request/retry histories and producers live in the evidence bundles.

After [LongMemEval-S closure](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18),
use all **20 conversations / 400 questions** in `chats/100K`, called **128K** by the
[MIT-licensed upstream dataset](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a).
Pin that source revision and prefer `chat_trunecated.json` as its loader does.
Source conversations measure 92,928–121,849 cl100k tokens; that is not generation
input length. This is an independent memory evaluation, not a SillyTavern browser
run. Larger BEAM buckets and an exhaustive fact-level error census are untested.

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

**Keep the candidate for full-cohort confirmation.** BEAM supplies a batch
reference date, not each message's send time or every event's date. Map original
batch membership to chunk metadata; explicit event dates remain authoritative.
The [generation prompt](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/prompts.py)
and source inspection support this distinction. Do not label the anchor `sent`.

The same 5 diagnostics + 40 already inspected comparison cases use three arms:

- **Role:** rerank `['role','text']`; original generation rendering.
- **Anchor:** rerank `['role','batch_time_context','text']`; original rendering.
  Metadata says `Conversation batch reference date: YYYY-MM-DD. This is not a
  message send time or an event date.` Original embedding text stays unchanged.
- **Display:** reuse Anchor's exact query response; add `batch_time_anchor` labels
  and an interpretation instruction, then repack under 4096. Include date in
  grouping identity. This changes selected passages as well as presentation.

| Fixed comparison 40 | Role | Anchor | Display |
| --- | ---: | ---: | ---: |
| Mixed mean /100 | 71.27 | 71.52 | 73.59 |
| Uniform rubric /100 | 74.79 | 75.83 | 78.46 |
| Event tau /100 | 29.38 | 34.75 | 32.98 |
| Complete/partial/absent injected annotations /95 | 40/2/53 | 41/4/50 | 40/2/53 |

The 5 diagnostics score 34/24/20 rubric: losses remain. Dates support a real
contextual year-format improvement, while added labels also displace useful facts.
Some aggregate movement is judge error, not changed answer quality. Preserve raw
labels and source reviews; no fresh text-only arm or full 400 result is claimed.
Recent dialogue is unchanged and receives no added anchors. Product defaults stay
unchanged; a full fixed 400 comparison against text-only is the next adoption test.

Query median/p95: Role 1.403/1.639s, Anchor 1.569/1.798s. Generation/evaluation estimate:
$2.58234; write/managed embedding: $0.06671. Native rerank metadata overhead and
physical storage remain unmeasured. All 135 answers complete; display makes no
extra queries. Two transient retrieval/import failures recover; all 19 collections
are deleted/404. The screen introduces no preprocessing model or product code.

## Validation and evidence retention

Each quality screen uses 5 diagnostics + 40 fixed comparisons, preserving English,
source validation, isolation and budget checks. Repeatedly inspected cohorts are
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

The detail archive is 20,275 bytes with 2 members, copied from commit
`78054bb36524f7db8e853e953bcbf8f5a0821e0a` before removing tracked detail. Full
member readback verifies identical bytes. Restore it under `artifacts/` and read
`beam-evaluation-detail-v1/beam-evaluation-before-condensation.md` for each run's
producer and dependency instructions. The source and all run archives have verified
hashes; original secret-scan/readback receipts remain with the runs. Never rerun paid
producers just to inspect results. Follow the [retention policy](../CONTRIBUTING.md#experiment-lifecycle-and-retention).
