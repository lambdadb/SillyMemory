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

## Fixed-answer Sol-medium judge comparison (2026-10-18)

**Keep Sol as a diagnostic second opinion; defer primary judge replacement.**
`gpt-6.1-sol` with `reasoning_effort: medium` evaluates the same 400 saved answers,
1,051 rubric items and 40 event-ordering cases. No retrieval, generation, product
setting or reference changes occur. Exact original prompts, message roles,
partial-credit scale and upstream aggregation remain; omit the baseline's
temperature parameter for this reasoning model. Do not add a response schema or
the question missing from the original rubric template.

| Judge, first pass | Upstream mixed mean /100 | Uniform rubric mean /100 |
| --- | ---: | ---: |
| GPT-4.1-mini, historical | 71.92 | 76.66 |
| Jev 1.13.0, comparison above | 64.41 | 66.54 |
| GPT-6.1 Sol, medium | 70.08 | 71.92 |

These are partial-credit scores, not pass rates or a memory-quality regression.
Versus GPT-4.1-mini, Sol's rubric question means are higher in 57 cases, lower in
105, unchanged in 238. Abstention falls from 97.50 to 56.25, while event-ordering
tau rises from 24.25 to 42.26. This offsetting movement is evaluator sensitivity;
do not choose a judge by which gives the highest aggregate score.

### Corrected examples and remaining limitations

All six simple controls pass all three repetitions, including the compound
requirement with only one of two required elements present. In all three Sol
evaluations, five previously inspected examples receive defensible labels under
the fixed criteria: 15 versus 1,417 gets zero; the explicit May 5–May 11 range,
4:30 PM meeting and prior cover-letter submission claim get full credit; preparing
writing questions without researching academic background gets partial credit.
These local corrections do not establish overall judge accuracy.

Two cases show why primary replacement remains premature:

- `chat5--event_ordering--1`: the answer explicitly lists combinations for drawing
  two aces, but Sol gives partial credit because it does not perform the numerical
  calculation. The original question asks for topics in order, not a calculation;
  the bare criterion and answer alone omit that task context. The missing question
  is a known limitation, but this model-only comparison does not prove it causes
  the judgment or that adding it would fix the problem. The uniform rubric mean
  includes this item; the upstream mixed metric instead uses event alignment/tau.
- `chat2--abstention--0`: identical inputs score **1, 0, 0**. Explanations disagree
  about whether distinguishing explicit ESLint overrides from inherited Airbnb
  rules sufficiently acknowledges the missing specific Airbnb configuration.

A separate 20-case inspection (two per type selected by ID hash before opening
their Sol judgments) records expectations for 56 rubric items. This is assistant
inspection, not independent human calibration. Some initially single-label
expectations also prove debatable, including whether “which statement is correct?”
requires a clarification question or permits selecting the supported statement.
Preserve the original expectations and follow-up interpretation separately; do not
silently relabel them or present agreement counts as judge-accuracy measurements.

### Repeatability, cost and verification

Before observing Sol results, select four cases per type by ID hash, plus six
previously inspected disagreements: 45 unique cases. Repeat those twice, keeping
the first full pass primary and never voting or selecting favorable repeats.
Among the stratified 40, **4/108 criterion labels**, **4/40 question averages**, and
**1/4 event-ordering scores** vary across three calls. Across all 45, five criterion
labels and five question averages vary. The same 40 IDs in the earlier Jev runs
have three varying rubric averages and two varying event scores; those runs are
not contemporaneous. GPT-4.1-mini has no matched repeats. Neither a deterministic
judge nor superior repeat stability is demonstrated.

There are 2,330 successful calls from 2,331 attempts. One OpenAI HTTP 500 after
120.6 seconds is retried successfully; no successful judgment is regenerated for
recovery and no JSON repair is needed. The first full pass uses 1,921 calls
(1,051 rubric and 870 visited alignment pairs), 1,313,975 input tokens and 108,017
output tokens, including 19,206 reasoning tokens: approximately **$4.079**.
Controls and repeats bring the total to **$4.594**, accounting for reported cached
tokens at the [published Standard rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
This is not an invoice; failed-response billing is unavailable. First-pass
successful-attempt API median/p95 is 2.599/5.229 seconds, excluding queue waits,
backoff and the failed attempt; it is not per-answer end-to-end latency.

Offline verification checks 407 original source bindings, all 2,330 exact request/
response bindings and the pinned upstream event metric. No remote collections are
created. Product defaults, historical GPT-4.1-mini results and the LongMemEval Jev
policy stay unchanged. Do not turn these evaluator differences into retrieval
errors or launch further model comparisons without a specific evaluation question.

Raw receipts, frozen cohort/plan, assistant inspection, repeat flips, scripts and
the decision are preserved in local-only `artifacts/archive/beam-sol-judge-v1.tar.gz`
(10,805,013 bytes, 5,261 members; SHA-256
`0c2fb8121adf8baf05154c58e8ac96e20cb3c0369d518cb65b61d1034e2ab1b8`).
Full member readback and configured-secret scanning pass. Restore this, the BEAM
baseline and Jev comparison bundles above; with Node 24.15.0 and Python 3.14 /
scipy 1.18.1 / json_repair, run `python artifacts/beam-sol-judge-v1/analyze.py` then
`python artifacts/beam-sol-judge-v1/audit.py` from the worktree root. Live runners
are paid and unnecessary for inspection. The bundle is unavailable in a fresh
clone. All 379 unit tests, runtime/release/SDK checks and script/test syntax checks
pass; this evaluator-only change does not rerun browser integration.

## Fixed-answer Luna-medium judge comparison (2026-10-18)

**Close the judge-model comparison without replacing the BEAM reference judge.**
The final candidate, `gpt-6-luna` with `reasoning_effort: medium`, judges the same
400 saved answers and repeats the same 45-case cohort twice. All 1,305 rubric and
control requests match Sol's requests except the model. Alignment uses the same
prompts and greedy matching procedure; visited pairs can differ with judge labels.
No retrieval, generation, reference, rubric or product setting changes occur.

| Judge, first pass | Upstream mixed mean /100 | Uniform rubric mean /100 | Estimated full-pass judge cost |
| --- | ---: | ---: | ---: |
| GPT-4.1-mini, historical reference | 71.92 | 76.66 | $0.692 |
| GPT-6.1 Sol, medium | 70.08 | 71.92 | $4.079 |
| GPT-6 Luna, medium | 70.86 | 72.33 | $0.251 |

These are partial-credit scores, not pass rates. Luna's rubric averages are higher
than Sol in 51 cases, lower in 38, unchanged in 311. Its event-ordering tau mean is
46.06/100. Score changes on identical answers measure evaluator sensitivity, not
memory improvements or judge accuracy.

All 18 control calls pass. The five previously inspected target criteria receive
the same defensible labels in all three passes: zero for 1,417 instead of 15;
full credit for the explicit date range, meeting time and prior submission claim;
partial credit for only one of two requested preparation steps. However, broader
repeat stability is worse than Sol on the identical preselected subset:

| Three evaluations of the same 40 cases | Sol medium | Luna medium |
| --- | ---: | ---: |
| Varying criterion labels /108 | 4 | 14 |
| Varying rubric question averages /40 | 4 | 10 |
| Varying event-ordering scores /4 | 1 | 1 |

Across the full 45-case cohort, Luna has 15 varying labels and 11 varying rubric
averages, versus Sol's five and five. In `chat13--multi_session_reasoning--0`, the
answer gives six series against a requirement of four: Luna scores the criterion
**0, 1, 0.5**, alternating exact-count and at-least-count interpretations. A similar
six-versus-three application-types criterion scores **0, 1, 0**. These are genuine
same-input label changes, not retrieval or answer changes. Earlier Sol runs are
not contemporaneous; GPT-4.1-mini has no matched repeats. This subset does not
establish population-level differences or the reference judge's superiority.

Luna also gives partial credit for naming the two-aces probability topic without
calculating it, although the original question only asks for topics. As with Sol,
the unchanged rubric template omits that question. The cause and remedy are not
established by this model-only run. Reuse the earlier 20-case assistant inspection
without relabeling its expectations; its already recorded ambiguities preclude
using agreement counts as independently calibrated judge accuracy.

**Decision:** retain GPT-4.1-mini as the BEAM reference for continuity, with its
known errors disclosed. Luna is an inexpensive diagnostic alternative, but its
repeat variability does not justify promoting it to primary. Keep Sol/Luna labels
as separate second opinions and end this model grid. A future evaluator change
would require a defined task-context protocol and independent calibration, not
another search for a judge producing a preferred score. Product defaults and the
LongMemEval Jev policy remain unchanged.

### Cost, verification and retention

The first pass uses 1,862 calls (1,051 rubric and 811 visited alignment pairs),
1,308,247 input tokens and 202,612 output tokens, including 130,362 reasoning
tokens. Estimated cost is **$0.25067**, about 94% below Sol's full-pass estimate.
Controls and repeats bring the total to **2,281 calls and $0.28716**, with no HTTP
errors or retries. One response contains invalid JSON escaping; the unchanged
parser repairs that saved response without a new model call or label selection.
Costs use provider usage and [Standard Luna rates](https://developers.openai.com/api/docs/models/gpt-6-luna),
including reported cache reads, not an invoice. Full-pass successful-request
median/p95 is **1.829/4.205 seconds**, excluding queue waits; these are API-call
latencies, not per-answer end-to-end latencies.

Offline verification passes for 422 source bindings, all 2,281 request/response
bindings, the pinned upstream event metric and 1,305 model-only request comparisons.
No remote collections are created. All 379 unit tests, runtime/release/SDK checks
and script/test syntax checks pass; no browser integration is rerun for this
judge-only documentation update.

Frozen inputs, full receipts, repeat variations, interpretations and scripts are
preserved in local-only `artifacts/archive/beam-luna-judge-v1.tar.gz`
(10,813,348 bytes, 5,169 members; SHA-256
`6f638f7f136072583f54d967ccb0318974accde5cae9393ad341d5bf4d459562`).
Full member readback and configured-secret scanning pass. Restore this and the
baseline, Jev and Sol bundles above; use Python 3.14 / scipy 1.18.1 / json_repair
and, from the worktree root, run `python artifacts/beam-luna-judge-v1/analyze.py`,
`python artifacts/beam-luna-judge-v1/audit.py`, then
`python artifacts/beam-luna-judge-v1/compare.py`. These offline scripts make no
paid requests. The archive is unavailable in a fresh clone.

## Evidence-oriented reranking criteria (2026-10-18)

**Retain the default criteria; do not promote this candidate globally.** The
bounded comparison completes 45 paired questions: five earlier source-inspected
diagnostics and a separate 40-case confirmation cohort (four per ability, selected
by ID hash before candidate calls). Existing baseline results were available, so
this is not an unseen benchmark. No full-400 expansion or criterion retuning occurs.

The only request change is `rerank.criteria`. Keep managed Small, Bayesian Query1,
vector k 200, Jev candidate 200, returned 50, `fields: ['text']`, strong reads,
4096-token product packing, native recent four plus probe, Sol-low generation and
original GPT-4.1-mini rubric/event scoring unchanged. Freshly run both arms on the
same imported corpus; balance arm order by question-ID hash. Applied native
responses confirm default/custom criteria and 200 scored candidates. The final-50
responses do not expose the full candidate IDs, so count equality is verified,
not identical full candidate pools. No annotation enters runtime.

The five ascending custom levels distinguish:

1. Unrelated content or no usable evidence.
2. Shared topic but generic advice/planning without question-specific evidence.
3. Relevant background or partial evidence missing the requested detail.
4. Direct support for a requested fact, preference, instruction, decision, update,
   event or plan, with entity/time scope; conflicting statements can be relevant.
5. Precise evidence that substantiates the answer or distinguishes the requested
   scope. Include plans when asked about plans; do not infer completed actions or
   favor a speaker role by itself.

Exact strings are frozen in the retained plan. No speaker field, extra retrieval
request, new generation instruction or model call is added to the product path.

| Confirmation cohort, 40 questions | Default criteria | Evidence-oriented criteria |
| --- | ---: | ---: |
| Upstream-style mixed mean /100 | 79.85 | 72.72 |
| Uniform rubric mean /100 | 84.79 | 75.63 |
| Event-ordering tau mean /100 | 30.59 | 32.64 |
| Completely injected annotated messages /95 | 38 | 45 |
| Partially injected annotated messages /95 | 3 | 4 |
| Annotated messages absent from injection /95 | 54 | 46 |

These are subset partial-credit scores, not full-400 results or pass rates.
Rubric question means rise in four cases, fall in ten and stay equal in 26.
Message-span coverage is structural, not verified necessary-fact recall.
The diagnostic five improve from 23 to 48 in uniform rubric mean, but that
selected sample and its inflated judging below do not establish general benefit.

### What improves and what does not

- **Actual evidence gains:** the July prototype milestone moves from rank 24 to 7,
  enters the prompt and appears in the answer. The candidate also delivers useful
  user statements about executor duties/the $5,000 guardianship fund, early resume
  collaboration with Joshua/Caribbean-community experience, and account lockout
  after five failures. Those details appear in the corresponding answers.
- **Actual personalization loss:** the expenses answer stops recommending Excel or
  a spreadsheet. Excel-specific selected passages disappear, while generic
  spreadsheet suggestions remain. This is a selection-and-use problem, not proof
  that every supporting source vanished.
- **Unresolved conflict use:** both median/altitude statements are delivered in
  both arms, yet neither answer acknowledges their contradiction.
- **Incomplete preference recovery:** the explicit split-screen instruction enters
  final 50 at rank 46 but still misses injection. Additional assistant explanation
  is delivered and the answer mentions split-screen; some relevant assistant text
  was already present in the default. The tree-diagram instruction remains absent.

All 17 changed rubric pairs, including diagnostics, receive answer inspection and
relevant source/prompt checks without relabeling. Several score changes are not
substantive quality changes: the candidate's correct ASA proof gets zero; answers
with the same dates/duration get different credit; the default receives full date-
format credit without the required format. In the opposite direction, the patent
summary receives full credit for a $12,000/PCT decision it never states. Its
recovered prototype milestone is real, but its zero-to-one score exaggerates the
recovery. The Zotero answer gains source-supported EndNote use but omits an earlier
conflicting claim: that is a tradeoff, not a uniformly worse answer.

Consequently, neither the raw score decline nor the diagnostic gains alone justify
a broad quality claim. This candidate improves some personal-history evidence but
does not establish robust general benefit. Keep default criteria. Task-specific
criteria or separate persistent-preference retrieval would be distinct hypotheses;
neither is implemented or validated here. Do not retune the judge to rescue this
candidate or turn inconsistent labels into product requirements.

### Validation, cost and retention

All 45 original selections and exact generation bodies reconstruct before live
calls. Offline checks verify all 90 paired native requests, source-bound returned
text, product packing within 4096, generation bodies, original judging and the
pinned upstream event metric. Single generations per arm leave inference variation
uncontrolled; there is no independent human-calibrated score.

Nineteen corpora contain 17,259 documents. All owned collections are deleted with
404 confirmation. There are 705 logical LambdaDB operations, including two
recovered upsert 429 retries; all 90 generation, 230 rubric and 184 alignment calls
finish without retries or JSON repair. Generation costs approximately $1.58548,
judging/alignment $0.14820 from provider usage and the frozen Standard rate card.
Write/managed embedding estimates total $0.06413 before free allowances. Native
rerank billing tokens, custom-criteria overhead and physical storage costs remain
unmeasured; do not claim the same bill merely because candidate counts match.

Query API median/p95 is 1.345/1.795 seconds for default and 1.461/1.819 seconds for
the candidate; generation median is 4.896 versus 4.875 seconds. These are individual
successful API calls, excluding import/queue time, not browser end-to-end latency.
This independent evaluation changes no runtime defaults and reruns no browser test.

The exact plan/criteria, fixed cohorts, 17 changed-pair reviews, requests, outputs,
producer scripts and decision are retained in local-only
`artifacts/archive/beam-evidence-criteria-v1.tar.gz` (6,676,480 bytes, 1,432 members;
SHA-256 `f67cf6f3108b818974f319fa9ac322dca57a10b7b4946076e97c9b5bf470e9a3`).
Full member hash readback and configured-secret scanning pass. Restore this,
`beam128k-current-v1`, and the `quoted-memory-product117-v1` rate-card dependency at
producer revision `39074c878ea5764a0784388f0cd37cf40303b0fa`; install its locked
dependencies and the recorded tokenizer/Python dependencies. From the worktree
root, run `node artifacts/beam-evidence-criteria-v1/verify-retrieval.mjs`,
`node artifacts/beam-evidence-criteria-v1/diagnostics.mjs`, then
`python artifacts/beam-evidence-criteria-v1/analyze.py`. These are offline checks;
the live runners make paid calls and are unnecessary for inspection. The bundles
are unavailable in a fresh clone. All 379 unit tests, runtime/release/SDK checks
and script/test syntax checks pass.

## Speaker role in native reranking (2026-10-18)

**Retain text-only reranking.** Adding `role` produces some useful detail recovery,
but this bounded screen does not establish a reliable overall quality gain. Do
not promote the candidate or expand it to all 400 questions on this evidence.

Compare `fields: ['text']` with `fields: ['role', 'text']`, using native default
criteria in both arms. All other settings remain fixed: managed Small, Bayesian
Query1, vector k 200, Jev candidate 200, returned 50, strong reads, 4096-token
packing, recent four plus probe, Sol-low generation, and original GPT-4.1-mini
rubric/event scoring. Freshly run both arms, balancing order by question-ID hash.
Reuse the preceding five diagnostic and 40 fixed comparison questions; this is
now an inspected regression cohort, not an unseen confirmation sample.

The initial attempt reveals a schema prerequisite: documents contain `role`, but
the product does not explicitly declare its type. Native reranking rejects that
field with HTTP 400. After cleaning all four initial collections, declare
`role: { type: 'keyword' }` in **both test arms**. Stored documents, embedding
source and retrieval query stay unchanged. The corrected comparison succeeds.
Local server source renders selected fields as named JSON properties; live
receipts verify the accepted field requests, default criteria and 200 scored
candidates. They do not expose or establish identical full candidate ID sets.
Generation memory already includes speaker provenance; only reranker input is
under comparison. The product schema and runtime remain unchanged.

| Fixed comparison cohort, 40 questions | Text only | Role + text |
| --- | ---: | ---: |
| Upstream-style mixed mean /100 | 74.01 | 75.02 |
| Uniform rubric mean /100 | 78.38 | 80.42 |
| Event-ordering tau mean /100 | 27.19 | 19.80 |
| Completely injected annotated messages /95 | 37 | 39 |
| Partially injected annotated messages /95 | 5 | 3 |
| Annotated messages absent from injection /95 | 53 | 53 |

Rubric means rise in six questions, fall in six and stay equal in 28. These are
subset partial-credit scores, not pass rates or the full BEAM result. Annotation
coverage measures source-message spans, not verified necessary-fact recall.
The five selected diagnostics have uniform means of 22 versus 24. Do not compare
these fresh baseline scores directly with the preceding trial as a treatment
effect: retrieval, generation and judging are rerun and can vary.

### Interpreting the change

- **Some actual recovery:** the user's burnout/mindfulness history moves from
  rank 23, omitted, to rank 20, injected and used. A date-format instruction moves
  from rank 27, omitted, to rank 18, injected; the answer improves from month names
  to `MM/DD`, while appropriately leaving unknown years unspecified.
- **Tradeoffs remain:** initial app setup enters the prompt, but integration-test
  evidence leaves it. An assistant restatement of the July prototype milestone
  enters and appears in the answer, while the user's September drafting/45-page
  review detail drops out. The original July user statement remains omitted.
- **Personalization is not consistently preserved:** the expenses answer loses
  its Excel/spreadsheet recommendation. Specific prior-use passages disappear,
  although generic Excel/spreadsheet advice remains injected. The EndNote trial
  decision also drops out while assistant usage instructions remain; a trial
  decision should not itself be treated as proof of completed use.
- **Judge movement overstates gains and losses:** the date-format answer receives
  full `MM/DD/YYYY` credit without a year. Equivalent advice to use verified
  numbers receives different labels, as do answers with the same 15-day date
  range. Near-equivalent movie-planning lists receive different event-alignment
  scores. Original labels are preserved, not corrected to favor either arm.

All 16 changed rubric/event pairs receive answer inspection and relevant
source/prompt checks. This is not independent human calibration or an exhaustive
audit of unchanged answers. Delivered contradictions remain ignored, and the
split-screen/tree instructions are still absent. Speaker metadata is useful
provenance, but this trial does not show that exposing it to the default reranker
alone reliably distinguishes personal facts, plans and assistant suggestions.

### Operations and retained evidence

The successful run imports 17,259 documents across 19 corpora. Including the
failed schema preflight, all 23 owned collections have verified 404 cleanup.
Three upsert 429 retries recover. All 90 generation, 230 rubric and 211 alignment
calls finish without retries. Generation costs approximately $1.46869 and
judging/alignment $0.14873 from usage and the frozen rate card. Write/managed
embedding estimates, including the initial imports, total $0.07736 before free
allowances. Native rerank billing tokens, added role-rendering overhead and
physical storage costs remain unmeasured. Query median/p95 is 1.366/1.676 seconds
for text and 1.377/1.693 seconds for role + text, excluding import and queue time.

Original-input replay, all paired request/body bindings, source-valid packing,
the 4096-token limit and pinned upstream scoring pass offline verification.
All 379 unit tests and runtime/release/SDK/script syntax checks pass. This is an
independent memory evaluation; browser behavior is not rerun or changed.

Both the failed preflight and completed run, exact field/schema settings,
source-bound reviews and raw receipts are preserved in local-only
`artifacts/archive/beam-role-rerank-v2.tar.gz` (7,097,523 bytes, 1,520 members;
SHA-256 `f9edd7b5d335cfa19c6a3f9de8664ceaf6d37556a8066e7a966c419404fd01ad`).
Full member hash readback and configured-secret scanning pass. Restore both run
directories under `artifacts/`, plus `beam128k-current-v1` and the
`quoted-memory-product117-v1` rate-card dependency, at producer revision
`2f2e9b82b5f9f36b3e6b0c991a05bb5b4cea17a1`. With its locked runtime and recorded
tokenizer/Python dependencies, run `node artifacts/beam-role-rerank-v2/verify-retrieval.mjs`,
`node artifacts/beam-role-rerank-v2/diagnostics.mjs`, and
`python artifacts/beam-role-rerank-v2/analyze.py` from the worktree root. These are
offline checks; live runners are unnecessary for inspection. The bundle is not
available in a fresh clone.
