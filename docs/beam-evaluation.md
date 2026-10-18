# BEAM current-policy baseline

## Decision and scope (2026-10-18)

Close LongMemEval-S after the [117-case product regression check](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18), then evaluate the frozen policy on BEAM instead of LongMemEval-M. This first baseline is complete. Retain current defaults; investigate concrete source losses before tuning or expanding to larger buckets. No additional model phase or BEAM-specific prompt was added to the product.

Use all **20 conversations / 400 questions** in `chats/100K`, called **128K** in the [upstream README](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a). The MIT-licensed source is pinned to that commit. Follow the official loader's preference for `chat_trunecated.json` when present. Actual source text measures 92,928–121,849 cl100k tokens per conversation, 2,294,811 total. The published size label uses a different measurement; it is not our generator's input length.

This is an independent memory pipeline importing product code at `3dd2a8584f78d9af797a5319dfc408023a6f430b`, not a new SillyTavern browser test. Flatten source turns chronologically, preserve roles/content and source IDs, and apply the existing product literalization only when rendering recalled text. Do not reinterpret BEAM's event `time_anchor` as a message's sent timestamp. No dates are invented. Each probe starts from the same history; evaluation questions and generated answers never become later probes' memory. Rubrics, references and source annotations are used only after generation.

## Frozen policy and scoring

- Managed `text-embedding-3-small`; English Bayesian Query1; vector k 200; native `jev-1.13.0`, text/default criteria, candidate 200/final 50, failure mode `error`; strong branch reads.
- Product 800-character boundary-aware chunks, overlap/source assembly, chronological quoted archive, 4096-token memory including current guidance/framing; retain four original recent messages plus the current probe.
- Generator `gpt-6.1-sol`, low reasoning, 4096 output cap, nonstreaming; current product guidance and neutral history-answering system message. This is our memory method, not the paper's generation configuration.
- Judge `gpt-4.1-mini` (responses identify `gpt-4.1-mini-2025-04-14`), temperature 0; exact upstream rubric prompt and 0/0.5/1 scores. One call per criterion, then mean per question and type. The upstream prompt does not separately interpolate the question; preserve that limitation.
- For event ordering, also preserve the upstream line splitting, first-unmatched binary semantic alignment and Kendall tau-b calculation. The [official reporting script](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/evaluation/report_results.py) substitutes normalized tau for that category. Do not silently replace it with the more favorable rubric score.

LongMemEval's Jev Yes/No policy is unchanged. It is not applied to BEAM partial credit. No previous candidate grid, alternative generator/judge, selective regeneration or repeated judging is included.

## Results

**Upstream reporting aggregation: 71.92/100.** The separate uniform rubric mean is **76.66/100**. Neither is a LongMemEval-style answer accuracy. Under the rubric, 230 questions receive full credit, 133 partial credit and 37 zero; all 400 are included.

| Ability | Questions | Mean rubric score /100 |
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

Event ordering's separate normalized tau is **24.25/100**, producing the lower upstream aggregate. Rubric presence/compliance and one-to-one event alignment/order measure different behavior. For example, `chat1--event_ordering--1` receives full rubric credit, but only two of its five answer lines align with the expected event labels, yielding tau 0.26. Keep both results and the matching receipts; no post-hoc line cleanup or relabeling. This metric gap needs interpretation before comparing external published scores.

## What the source checks establish

Four source-inspected examples demonstrate different mechanisms; they are not an exhaustive error census:

- **Retrieval miss:** `chat5--instruction_following--1` omits a tree diagram. The user's explicit standing request at source 132 is absent from final 50 and delivery. Candidate 200 membership is unavailable, so this does not isolate ANN, fusion or reranking as the cause.
- **Returned but not injected, plus retrieval misses:** `chat20--summarization--1` misses milestones. Source 128 (10 tests/96% accuracy) is returned but omitted by 4096 selection; source 196 ($12,000 filing/PCT budget) and 208 (15 cycles/98% September target) are absent from final 50. This supports separate search and selection work, not a blanket budget increase.
- **Evidence available, conflict omitted:** `chat4--contradiction_resolution--1` receives complete user statements at 114 (eight median/altitude problems) and 134 (never completed such problems). The answer lists positive practice without acknowledging the contradiction. This is a source-use example, not a missing-memory diagnosis.
- **Target/source ambiguity:** `chat1--temporal_reasoning--0` has an early March 15 anchor and later April 15 MVP deadline. The answer uses the latter. The probe's own answer says four weeks while its rubric asks eight; keep the original zero and inspect scope before treating it as a date-metadata defect.

Source-ID annotations cover 355 questions; 40 abstention questions and five other probes provide no IDs. Across 1,094 unique referenced-message occurrences, 385 are complete in returned and injected text, 102 partial in both, 506 absent in both, and two retained natively. A further 38 complete and 51 partial returned bodies are absent after selection; 10 complete bodies become partial. These are **structural message-span diagnostics, not necessary-fact recall**. Annotation omissions and broad assistant bodies limit their meaning; the summary witnesses above were found in original source without feeding them to runtime.

These examples motivate the bounded stage audit below. Larger BEAM buckets and a full error taxonomy remain unperformed.

## Follow-up: source-stage audit (2026-10-18)

Retain current defaults. A frozen four-question diagnostic traces the two chat 1
ordering probes, chat 5's standing diagram request, and chat 20's milestone summary.
This is a mechanism audit, not a representative quality comparison or a new score.
No generation or judging is repeated.

Reimport the exact three corpora (2,443 documents). For each question, collect the
unchanged product final 50, all 200 native rerank results, unreranked Bayesian 200,
vector 200 and lexical 200. Preserve query/filter, k 200, managed Small, Jev criteria,
strong reads and product selection. References and inspected witnesses never enter
requests. All 20 queries pass, with no transient retries and all owned data deleted.

The fresh Bayesian and reranked candidate sets match **200/200** for all four queries.
Original versus fresh final-50 overlap is 45, 46, 49 and 46; independently requested
final 50 versus the first 50 of reranked 200 overlaps 47, 48, 49 and 48. Recreated
indexes and repeated inference are not an exact replay. The following new ranks
locate mechanisms in this diagnostic run, not prove original candidate membership.

| Identified source | Original final 50 → injection | Fresh Bayesian rank → Jev rank |
| --- | --- | --- |
| Summary: July 10-tests/96% milestone, source 128 | 24 → omitted | 141 → 23 |
| Summary: approved $12,000/PCT budget, source 196 | absent → absent | 64 → 164 |
| Summary: September 98% target, source 208 | absent → absent | 185 → 139 |
| Five-event order: project setup, source 6 | 38 → omitted | 151 → 31 |
| Five-event order: transaction implementation, source 62 | 45 → omitted | 78 → 36 |
| Five-event order: deployment/tests, source 118 | 23 → delivered | 9 → 16 |
| Five-event order: accepting improvements, source 120 | absent → absent | absent from both component top-200 sets and fused 200 |
| Standing tree-diagram request, source 132 | absent → absent | absent from both component top-200 sets and fused 200 |

These are source-bound prose spans; source numbers are BEAM message IDs, not chunks.
Do not turn source-reference absence into a claim that no alternative evidence exists:

- **Summary:** assistant source 209 already supplies the September 27–30 / 98% target
  in the final prompt, yet the answer omits it. The missing July achievement and
  $12,000/PCT decision have no such support in that prompt. About 92.1% of rendered
  source-message tokens are assistant-origin (3,568/3,876, excluding shared guidance
  and the archive heading), dominated by recurring plans. A user also endorses one schedule;
  speaker role alone does not distinguish accomplishments from plans.
- **Standing preference:** diagram examples and a heading are delivered, but the
  user's explicit always-request is not. No diagram/visual-aid phrase from any of
  the ten relevant user messages reaches original final 50. This is a personal
  preference retrieval gap, not complete absence of mathematical examples.
- **Three-event order:** source 60's transaction-error-handling request is delivered
  but omitted from the answer. Native recent history separately discusses security.
  The broad question does not identify the three intended reference events.
- **Five-event order:** the answer combines testing/deployment into one line and
  chooses different aspects elsewhere. Upstream binary alignment matches 2/5 lines
  (tau 0.26), while rubric judging gives full credit. Preserve both results; this
  mixes target granularity and evaluator alignment with memory loss.

Candidate expansion does not directly address facts already in 200 but ranked 139/164;
more injection budget cannot recover sources outside final 50/200 or ensure use of
supplied evidence. Before another quality run, define one change that distinguishes
useful personal-history evidence from recurring topical plans, with fixed controls.
Provenance-aware reranking and selection that accounts for redundant content are
possible directions, **not validated improvements**. Persistent preferences are a
separate retrieval requirement; do not disguise them as a universal rank cutoff.
Do not change the benchmark's aligner to improve its score.

An initial attempt stopped on HTTP 400: unreranked Bayesian `size: 200` requires an
explicit top-level `candidateSize: 200`. Only that diagnostic request was corrected;
product requests remain unchanged. Preserve its two successful queries, failed
request, read-only validation probe and verified cleanup. Across both attempts,
3,258 documents were submitted and 22 query calls succeeded; no generation/judge
calls or new product code. The corrected run records 108 LambdaDB operations.

Source reviews, exact requests, original-selection replay checks and failed/successful
receipts are local-only in `artifacts/archive/beam-stage-audit-v2.tar.gz` (1,005,844 bytes,
43 files; SHA-256 `17fb345023e9659ba0de4da7e21e8e197695b435f60fd9cc0027a4a3ce003b7f`).
Full member readback and configured-secret scanning pass. Restore both audit siblings
and the parent baseline archive below, sources matching `plan.json` hashes, Node
24.15.0 and tiktoken 1.0.22 before running the offline `analyze.mjs`. The live runner
makes paid calls and must not be rerun merely to inspect the result.

## Latency, cost and operational verification

All 400 native queries confirm Jev applied to 200 candidates and return 50 valid source-bound documents. Initial import creates 18,265 chunks. All 20 owned collections are deleted with 404 confirmation. There are 1,049 measured LambdaDB operations and no provider retries. Generation/rubric evaluation makes 400 + 1,051 calls; event alignment adds 1,145 evaluation-only calls. One phase stops on malformed judge JSON, then resumes using the saved response and the official `json_repair` fallback. Three malformed JSON responses are repaired locally in total; none is regenerated.

| Measurement | Result |
| --- | ---: |
| Mean generation input | 6,024.57 tokens |
| Query API median / p95 | 1.381 / 1.706 seconds |
| Generation API median / p95 | 4.922 / 19.950 seconds |
| Per-case query+generation sum median / p95 | 6.266 / 21.355 seconds |
| Generation estimated cost, 400 answers | $7.025 |
| Rubric + event-alignment judging | $0.692 |
| Initial LambdaDB write + managed embedding estimate | $0.0677 |
| 400 strong-query minimum + query embedding estimate | $0.00419 |
| Benchmark-only validation fetch minimum | $0.00193 |

Query+generation is a sum of measured calls, excluding ingestion, packing, queue waits and judging; it is not browser end-to-end latency or time to first token. Generation uses the frozen prior bucket-aware Sol rates; judge rates follow [OpenAI pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). All are list-rate estimates, not invoices.

Native rerank billing tokens are not returned. An explicitly nominal text-volume proxy (200 times each corpus's average chunk length, with query text counted once or per candidate) is about **$0.44–$0.52 for 400 queries**, before unknown protocol/tokenizer overhead. This is not a measured bill or a guaranteed range. Physical GB-hours remain unknown. [LambdaDB cost rules](https://docs.lambdadb.ai/guides/costs/understanding-costs) use decimal-byte assumptions here, before free allowances; returned-data/retention promotions are separate. Do not double-count direct-provider inference charges on top of LIU.

## Retention and reproduction

Full data snapshots, exact requests/responses, source mappings, frozen plans/locks, producer code, dependency versions, parser recovery, source reviews and cleanup evidence are kept in ignored local-only `artifacts/beam128k-current-v1/`. They are not CI fixtures or available in a fresh clone. No ongoing remote resources remain. The source data's MIT notice is preserved.

Restore the recorded product source overlay, dependencies and artifact paths before running its offline `analyze.py` verifier; verification does not resend model calls. Restore the `quoted-memory-product117-v1/` dependency for the frozen Sol rate card and S-closure decision lock. The original BEAM data and upstream scoring sources are included in the archive; no `/tmp` clone is needed for offline inspection.

Archive: `artifacts/archive/beam128k-current-v1.tar.gz` (local-only, 38,340,626 bytes, 6,953 members). SHA-256: `4475551abc48c906aad589e3f75d63fa4b26491188694b74a7d509e4c6e95587`. All members pass full hash readback and configured-secret scanning.

## Fixed-answer Jev judge comparison (2026-10-18)

**Defer replacing the primary BEAM judge.** All 400 saved answers were evaluated
three times with pinned `jev-1.13.0`. No retrieval, generation, source/reference
change, question exclusion or product change occurred. Keep this comparison
separate from the GPT-4.1-mini baseline and the adopted LongMemEval Jev policy.

| Judge/pass | Upstream mixed mean /100 | Uniform rubric mean /100 |
| --- | ---: | ---: |
| GPT-4.1-mini, historical baseline | 71.92 | 76.66 |
| Jev, first pass (primary) | 64.41 | 66.54 |
| Jev, repeat 2 | 64.18 | 66.22 |
| Jev, repeat 3 | 64.39 | 66.45 |

These are partial-credit scores, not pass rates. The lower Jev score is a change
of evaluator, not reduced memory quality. Do not select the best repeat, vote
across repeats, or treat agreement with GPT-4.1-mini as independently verified truth.

### Adapter and controls

Each original rubric item uses Choice with `1.0`, `0.5`, and `0.0` options, retaining
the upstream scale descriptions and evaluation rules. The answer moves to shared
state; each independent question includes only its own criterion. Only the
explanation/JSON-output demands and response placeholder are adapted. As in the
baseline, the upstream prompt's responsiveness rule refers to a question that is
not separately supplied. This limitation was not silently repaired.

Event alignment uses Noul >=0.50. All 1,349 independent snippet pairs are scored
per repeat, then the original ordered first-unmatched loop chooses which results
enter the unchanged upstream Kendall calculation. Preserve original newline
splitting, blank lines and unmatched items. Unvisited pair results do not affect
the score; batching is an API transport change, not a new matching algorithm.

The predeclared promotion gate failed: a control requiring both Paris and Berlin,
answered with Paris alone, received zero rather than partial credit in all three
Choice repeats. The five other controls passed each time. A separate three-call
Score diagnostic also favored zero for that partial answer. Before full-case
calls, an explicit recorded amendment allowed the authorized comparison to
continue **for diagnosis only**, keeping all frozen Choice requests and the failed
adoption gate. No criterion, expected control label or threshold was tuned.

### Interpretation and repeatability

First-pass rubric question means are lower in 118 cases, higher in 36, unchanged
in 246. The largest category change is abstention, from 97.50 to 37.50; a low Jev
label can reflect how it handles qualified positive claims alongside an explicit
statement that the requested detail is unknown.

Inspection finds errors and interpretation differences in both directions:

- `chat5--multi_session_reasoning--0`: the criterion asks for 15; the answer totals
  1,417. Jev's zero is more consistent with this explicit criterion than the
  baseline's full credit. This does not validate the reference against all source text.
- `chat14--temporal_reasoning--1`: the answer explicitly supplies May 5, May 11 and
  six days. Jev gives full credit where the baseline gives zero for the date range.
- `chat9--knowledge_update--0`: the answer explicitly states a **4:30 PM meeting**
  and recommends joining at 4:25. Jev incorrectly gives zero to the criterion
  requiring the 4:30 PM statement; the baseline gives full credit.
- `chat8--contradiction_resolution--1`: Jev gives zero despite the answer explicitly
  mentioning the earlier cover-letter submission claim, alongside the later denial.
  The criterion asks to mention that claim, not endorse it as the resolved truth.
- `chat7--information_extraction--1`: the answer supplies one component of a
  compound requirement but omits researching academic background. The source
  compound-statement rule supports partial credit; the judges instead choose
  opposite extremes (baseline 1, Jev 0).

Across three identical-input passes, **26/1,051 rubric labels**, **25/400 rubric
question averages**, and **13/40 event-ordering scores** change; 17/1,349 Noul
pair labels flip. Similar aggregate scores can conceal individual changes.
The baseline judge was not repeated in this run, so this is not a controlled
comparison of the judges' repeat stability. Neither stable labels nor a higher
score establishes correctness. The evidence does not justify replacing the BEAM
primary judge with this adapter; validate partial-credit and qualified-statement
handling before reconsidering it. Do not turn evaluator disagreements directly
into product retrieval errors.

### Cost, verification and retention

The first complete Jev pass uses 440 calls and 1,402,784 input tokens: approximately
**$0.05892**, versus the historical baseline's approximately $0.692 for rubric and
alignment judging. Three full passes cost approximately $0.17675; all controls
and Score probes bring this experiment to **$0.17751**. Estimates use provider
token receipts and the [published $0.042/M input rate](https://docs.typesafe.ai/models),
not an invoice. Full-run API request median/p95 is 193/251 ms; requests batch
criteria/pairs, so this is not per-criterion or browser end-to-end latency.

All 1,341 live calls complete without HTTP errors or retries. A local validator
stopped at rounded probabilities summing to 0.99; accepting at most 0.005 rounding
error per entry resumed from the saved response without rejudging or changing its
label. Preserve this parser recovery separately from the failed control gate.
No remote collections were created. Offline validation checks all 400 source
bindings, 1,338 frozen request/response bindings, three repeats, probability
validation and the exact pinned upstream metric.

Detailed results, six inspected disagreements, raw probabilities, producer scripts,
original/amended locks, failed controls and parser recovery are retained in
`artifacts/archive/beam-jev-judge-v1.tar.gz` (local-only, 7,648,405 bytes, 4,063 members;
SHA-256 `cc9aa1738f1a56a1dd315dba677d406a41f50d67d964c2c7573f064247330f0b`).
Full archive readback and configured-secret scanning pass. Restore it and the
baseline archive above, use Node 24.15.0 and Python 3.14 / scipy 1.18.1, and run
`python artifacts/beam-jev-judge-v1/analyze.py` from the worktree root for offline
verification. Live runners make paid requests and are unnecessary for inspection.
