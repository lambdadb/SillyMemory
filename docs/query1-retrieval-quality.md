# Query1 retrieval quality and ranked memory assembly

## Decision (2026-10-17)

PR #84 adopts retrieval-order admission based on final assembled size, compact
conversation-time provenance, vector k200/native Jev candidate 200 and supported
personalized-answer/event-role guidance. Keep managed OpenAI Small, Query1,
English Bayesian hybrid, final 50, the complete 4096-token memory allocation and
native recent-five/pair retention. No extra rewrite, extraction or generation
phase is added; native response formats and streaming remain intact.

The adopted work-branch profile originally scored **471/500 (94.2%)** with Sol low
and the original task-specific GPT-4o-2024-08-06 judge. The latest full follow-up
comparison scores **470/500 (94.0%) prior guidance versus 472/500 (94.4%) deletion**;
these are separate executions, not replacement historical labels. This consumed
English development cohort is not held-out confirmation or a deterministic accuracy guarantee. It
is not a claim about the currently installed `main` branch. Merge, release and
main promotion remain separate actions.

These quality scores precede the subsequent UTC/local-date instruction fix.
That fix has separate unit and host-delivery validation below; no new 500-question
answer score is claimed for its final wording.

Retain Small, Jev, Sol low and chronological presentation. Adopt the evaluated
follow-up-obligation deletion as the product guidance baseline, by Steven's explicit
decision after the full comparison. Defer 8192 and external providers; reject
preceding-message retrievalText. Source retrieval, prompt
delivery, generated answers and judge labels remain separate evaluation stages;
see [evaluation criteria](memory-evaluation.md) and [error analysis](small-default-error-analysis.md).

## Selection defect and implementation

The old whole-passage floor/refill could admit lower-ranked filler before allowing
for overlap savings. The replacement visits valid hits in retrieval order, renders
the accepted sources plus each candidate, and admits it only if the cheaper valid
separate/assembled representation fits. No text clipping, target-specific choices
or extra retrieval. Presentation remains in original message order after admission.
Compact `sent` labels include one budgeted explanation: conversation time is not
automatically event time; unknown timezones/dates stay unknown. Native source-time
storage already existed; benchmark session provenance is attached explicitly.

The frozen 500 selection regression changes 206 native-format memories without
losing an annotated message; complete delivered annotated bodies stay 877.
The historical answer comparison is 467→469/500, with a non-contemporaneous control.
The mechanism repairs priority admission, not overall search recall. Full source
and resource observations are in the retained `ranked-assembly-*` bundles.

## Product adoption of depth200 (2026-10-17)

Use vector k200 and native Jev 1.13.0 candidateSize 200/final 50. Pin
`@functional-systems/lambdadb` to **0.8.1-dev.38730896042001**, with its verified
134,997-byte browser bundle; tested stable 0.8.1 caps candidates at 100. Keep SDK
validation and reject fallback/partial scoring and candidate counts beyond the
request. Strong reads, source validity, isolation, synchronization and credential
semantics stay intact. See the [current defaults](conversation-memory-defaults.md).

## Current-policy Small breadth comparison: 100 versus 200 (2026-10-16)

Fresh paired Sol-low answers with original judging score **466→468/500** for
k100/candidate 100 versus k200/candidate 200 under sent/ranked 4096/final 50. Complete
indexed annotated bodies returned improve **878→888/894**, delivered **876→881/894**.
Three demonstrated missing dependencies are restored; two recipe-personalization
labels regress. Adopt breadth for observed source utility, not two labels alone.
Whole-body annotation completeness is not necessary-fact recall. Detailed source,
answer and cost reviews remain in `small-depth100-200-sent500-v1`.

## Fixed-k200 rerank-candidate comparison (2026-10-17)

Hold k200 fixed and change only candidate 100→200: fresh paired scores are
**455→471/500**. Complete indexed annotated bodies returned are **878→888/894**,
delivered **876→881/894**. Concrete missing operands/dependencies are returned,
delivered and used; other label changes include interpretation/judging sensitivity.
This supports retaining candidate 200 without another product change.
Historical query median increases **707→1181 ms**; scored documents double.
Actual billed rerank tokens/LIU are unavailable, so neither zero nor exactly twice
the dollar cost is established. See `small-rerank100-200-k200-sent500-v1`.

## Supported-answer generation guidance (2026-10-17)

Adopt two sentences: build recommendations on supported experiences/preferences
and answer supported parts before missing-detail questions; distinguish different
or unestablished event/role matches. Keep the rest of the natural memory guidance.

| Same 500 questions, original judge | Accepted | Boundary |
| --- | ---: | --- |
| Historical original guidance | 471 | Earlier record |
| Fresh original guidance | 462 | Paired control |
| New guidance, identical memory | 474 | Not budget-valid on 489 inputs |
| New guidance, actual 4096 admission | **471** | Adopted work-branch profile |

The instruction costs 57 budget tokens; actual admission regenerates 489 changed
inputs and reuses 11 only on byte equality. This adoption stage shares the initial
fresh control rather than adding a contemporaneous paired baseline. Personalized
helpfulness and premise handling improve, but response and source/target risks
remain. The unchanged original control itself changes 15 historical labels.
Do not claim a deterministic gain from historical 471 to new 471. Full evidence is
in `generation-guidance-paired500-v1`; no references or labels are rewritten.

## Follow-up obligation only: bounded comparison (2026-10-17)

**Adopt the evaluated deletion as the product baseline.** Steven explicitly chose
this policy after the full comparison to settle the clarification UX before
discussing further improvements. Localized helpfulness/personalization gains and
a simpler instruction support that choice; broad accuracy superiority is not
established. Natural clarification remains allowed. No new scope-guidance
candidate, prompt sweep or regrading is adopted.

Delete only the ambiguous-request clarification sentence and additional-context
request clause. Preserve personalization, event/role matching, non-invention and
uncertainty disclosure. Same selected memory, order, recent dialogue, generator
(Sol low), original GPT-4o judge and references; 28 tokens saved without refill.

The initial 104 comparison stopped under a conservative qualification-loss gate.
Steven then explicitly authorized completing the already-frozen remaining 396.
Preserve the earlier decision/archive and reuse those 104 answers/labels unchanged;
generate and judge both arms freshly for all remaining questions. This is a
consumed, two-phase development comparison, not held-out confirmation.

| Original-judge accepted | Prior guidance | Adopted deletion |
| --- | ---: | ---: |
| Original focused 104 | 79/104 | 82/104 |
| Newly completed remaining 396 | 391/396 | 390/396 |
| **Full 500** | **470/500 (94.0%)** | **472/500 (94.4%)** |
| All preference questions | 26/30 | 29/30 |
| All non-preference questions | 444/470 | 443/470 |
| All abstention questions, also in non-preference | 28/30 | 28/30 |

There are **10 gains / 8 losses**; historical 29 No score 9/29 in both arms.
The previous product record of 471/500 is a different execution and remains
preserved. Do not compare it as this trial's paired control or rewrite its labels.

Personalized recommendations use supported context more helpfully; a music-event
reply also separates a gala whose musical nature is unknown from known concerts.
Many other transitions preserve the same named answer, amount, conditional range
or uncertainty. Undated/repeated museum visits and conflicting mortgage/workshop
chronology remain unresolved. The historical season-versus-series
qualification diagnosis is not an optimization target: the question does not
require a season-one start date, and both answers were accepted. Preserve that
source review as history without treating the case as a demonstrated error.
Question-mark outputs fall 57→36/500, but punctuation is not a quality classifier.
No new retrieval or prompt-delivery improvement is claimed: sources are identical.

Retain the original 104 review; newly inspect all 9 remaining questions with either
No and 10 prespecified accepted controls. All 18 label transitions are covered,
with 37 retained source-bound case records. This is coding-agent review, not an
independent all-500 fact audit or certification of incidental external claims.
The score above is the fixed-memory comparison, without refill. Product adoption
uses the exact evaluated candidate in `src/context.js`; ordinary selection can
use the saved space under the unchanged 4096 budget. The separate model-free
admission and host-delivery checks below establish operational behavior, not a
new generated-answer score. Role/scope over-inference, incomplete personalization
and ambiguous chronology/reference targets remain open; no additional instruction
is adopted to address them in this change.

Adoption checks use zero new paid calls. Model-free reselection of the same final
50 candidates changes 353/500 contexts; every allocation stays within 4096. Complete
indexed annotated bodies increase 878→882/894 with no coverage regression, using
the historical benchmark date instruction in both arms. This is structural body
coverage, not necessary-fact recall or a new answer score. The actual pinned host
with local database/completion emulators passes 18 delivery cases plus packing
and assembly; a fixed budget-boundary case now admits six excerpts instead of
five. Local unit tests remain 376/376. The adoption bundle and immutable quality
bundle have separate evidence-index entries.

The additional run makes **1,584 actual attempts**, zero errors/retries, in
**402.260 seconds**; both phases together contain 1,000 answers and 1,000 judgments.
Frozen-rate estimate: **$6.4147019 additional**, **$6.9885512 including the original
104**. Full generation estimates are $3.2005279 current / $3.2496083 candidate;
judging is separate evaluation overhead. Generation median / p95 is
2230.5 / 6698 ms current, 2221 / 6263 ms candidate. These are observed provider spans
and cache-aware estimates at frozen 2026-10-16 rates, not invoices, steady-state
savings or browser E2E timings. Zero new LambdaDB requests/resources; product
operating database/inference costs remain unchanged, not free.

Full plans, source/input locks, requests/replies, all original labels, source reviews,
resource accounting and decision are in `followup-guidance-full500-v1`; see the
[evidence index](query1-evidence-index.md). The original subset archive is immutable.

## Minimal memory-guidance ablation (2026-10-17)

**Retain current guidance.** The earlier three-sentence profile removes five rules
together, including personalization and event matching, so it does not isolate
clarification. Fresh paired 104 score **81→83**, preference **27→26/30**, abstention
**26→27/30**. Lost role qualification/personalized use and an accepted arithmetic
error fail the frozen gate; conditional 396 are not run. This is a focused diagnosis,
not a new 500 score. Full evidence is in `minimal-guidance-ablation-v1`.

## Memory presentation order: bounded diagnosis (2026-10-17)

**Retain chronological presentation.** Same selected text, reorder message groups
by their best returned rank: **29→28/32**, zero gains/one loss; all 28 accepted controls
stay accepted. No source-backed discovery repair; conditional 74 are not dispatched.
No budget refill, clipping, extra source or product change. Full evidence is in
`memory-presentation-order-v1`.

## Same-policy capacity comparison: 4096 versus 8192

**Retain 4096.** Fresh paired 500 at the same sent/k100/c100/final 50 policy score
**465→469**. Complete delivered annotated bodies improve **876→878/896**, while
actual generation input rises **2,519,462→3,779,448 tokens (+50.01%)**. Larger capacity
repairs real delivery loss, but the observed gain does not justify default expansion.
Do not describe 8192 as ineffective or combine this result with a different-policy
baseline. Full evidence is in `sent-budget4096-8192-500-v1`.

## Historical comparison outcomes

These rows preserve aggregate conclusions; they are distinct protocols/runs,
not a leaderboard or interchangeable controls. Detailed methods, source-bound
interpretations, tokens, cost/latency records and per-case outcomes are retained
byte-for-byte in the [evidence index](query1-evidence-index.md).
All 500 scores below use the original judge unless explicitly marked supplemental.

| Comparison | Recorded outcome /500 | Decision or limit | Evidence stem |
| --- | --- | --- | --- |
| Preceding-message retrievalText | Query1 469; candidate 440 | Reject; 2.161× embedding input and topic noise | `contextual-retrieval-full500-*` |
| Earlier depth k100/c100, k200/c100, k200/c200 | 467 / 465 / 464 | Diagnosis only; not current defaults | `retrieval-200-full500-v2` |
| Earlier explicit benchmark dates | 467→466 | Date dependencies improve; prompt pressure remains | `date-provenance-*` |
| Corrected-selector depth100→200 | 469→471 | Source recoveries; subsequent current-policy test required | `ranked-depth200-*` |
| Initial native Small→Large | 469→468 | More source coverage, no answer advantage established | `embedding-large-*` |
| Shared session map | 469→467 | Defer representation | `compact-date-provenance500-v1` |
| Unified sent versus earlier formatting | 469→465 | Adopt agreed time semantics, not a score gain | `sent-date-delivery500-v1` |
| Sent-policy Small→Voyage | 465→468 | Useful recall; external provider not adopted | `embedding-voyage*` |
| Sent-policy Small / Large / Voyage | 465 / 470 / 468 | Historical result; not latest matched estimate | `embedding-large-sent-comparison500-v1` |
| Large, same candidate pool: Jev→Voyage rerank | 465→464 | Retain native Jev | `rerank-voyage-large500-completed-v1` |
| Sol-low→Luna-default generation | 465→450 | Lower receipt cost, quality loss; retain Sol | `luna-generator-default500-v1` |
| Sol-low→Sol-medium generation | 465→463 | Retain low reference | `sol-medium-generator500-v1` |
| Fresh matched Small→Large | 463→465 | Coverage improves; retain cheaper Small default | `embedding-small-large-matched500-v1` |
| Supplemental Sol judge, depth100/200 | Original 469/471; Sol 475/479 | No replacement labels | `sol-judge-audit1000-v1` |
| Supplemental Luna judge | Original 465; Luna 461 | Retain original judge | `luna-judge-large-jev500-v1` |
| Supplemental Mem0/Luna prompt | Original-prompt 461; Mem0 464 | Policy sensitivity; not adopted | `luna-mem0-judge-large-jev500-v1` |
| Supplemental minimal judge clarification | Fresh original 469; amended 476 | Ambiguous boundaries; retain original | `judge-minimal-clarification500-v1` |

The latest matched Small/Large run improves complete returned bodies 879→885/894
and delivered 876→883/894. That source advantage is real but does not establish a
compelling aggregate answer benefit for the higher embedding cost. Earlier
historical 470 does not override the later matched 465 result.

## Supplemental evaluator reproducibility (2026-10-17)

**Defer replacing the comparison judge.** A repeated GPT-4o audit of four original
No answers containing the reference value found two with mixed labels across three
identical requests. Answer-only positive controls were 12/12 Yes and deliberately
wrong controls 12/12 No. This establishes local judgment sensitivity, not that every
original No is wrong; original labels remain unchanged.

Pin Jev `jev-1.13.0`, preserve the same saved answers, references and ten original
task-specific rule variants, and fix Noul probability >=0.5 as Yes before calls.
The adapter moves question/reference/response fields into JSON state and removes
only the literal yes/no output-format instruction. This is a different evaluator
and input representation, not an identical GPT request. A 26-input pilot repeated
20 times passes its frozen binary-stability and synthetic-control gate. Then all
500 saved adopted-guidance answers are evaluated five times:

| Repeat | Jev accepted /500 |
| --- | ---: |
| 1 | 477 |
| 2 | 478 |
| 3 | 477 |
| 4 | 477 |
| 5 | 476 |

**498/500 inputs keep the same binary label; two flip.** Cashback `9aaed6a3` ranges
0.48–0.54 (Yes 4/5); Instagram followers `a2f3aa27` ranges 0.46–0.52 (Yes 1/5).
The four earlier exact-answer No cases are Yes in all 25 Jev calls per case.
Agreement with original GPT-4o labels is 2455/2500, not independently verified
accuracy. Prior-Yes disagreements are evaluator controls, not newly established
product errors. There is no matched 500-by-five GPT-4o repeat run to establish
comparative stability. Even the tested decision model does not meet the strict
same-input/same-label requirement; a stable pilot alone was insufficient.

Retain this as supplemental evidence, without threshold tuning, exclusions or
majority relabeling. The original **472/500 (94.4%)** stays intact; 95.2–95.6% is
Jev acceptance of unchanged answers, not improved product answer quality.
All 3020 live Jev requests succeeded without retries: 1,452,565 reported input
tokens, estimated $0.06100773 at the frozen 2026-10-17 published input rate.
Full500 direct request latency median/p95 is 172/227 ms, not product turn latency.
No new generation, LambdaDB, embedding or reranking calls were made. Raw requests,
responses, frozen rules and disagreement review are preserved in the local-only
`jev-judge-reference-v1` bundle; the preceding four-case audit is separately
preserved as `judge-exact-answer-audit-v1`. Discuss evaluator uncertainty before
further generation tuning. No evaluator default or product runtime changes.

## Cost boundaries

Use [the frozen full-cost contract](memory-evaluation.md#account-for-full-operating-cost),
not model charges alone. The matched 500-history import estimate is **$1.605726 Small
versus $7.579560 Large** for writes plus embedding proxies, before allowances.
A product turn retains one native query and one generation; the strong-read minimum
proxy is $0.005/500 queries. Native rerank billed tokens/LIU and physical GB-hours
remain unavailable; unknown is not zero. Historical Jev/Voyage query-component
estimates are $0.29771/$0.35215 per 500 queries, with a local text-token proxy for Jev
versus provider-reported Voyage tokens; they are not measured full operating cost.
Rates/usage boundaries are frozen 2026-10-16, not invoices/current-price guarantees.
Detailed ledgers and timing distributions remain in `lambdadb-cost-baseline-v1` and
the corresponding run bundles.

## Validation boundaries

- Current local: `npm test` **376 passed/0 failed** on Node 24.15.0; `npm run check`,
  `npm run check:release`, `npm run check:sdk` and `git diff --check` pass. CI also
  executes Node 20.12.0/24. Release metadata remains 0.4.0 dated 2026-10-13.
- Retained host checks: pinned SillyTavern 1.19.0/Chromium 153 with local database/model
  emulators; source assembly, native history/streaming, edits/swipes/deletion/races,
  recovery and 18 allocation/delivery cases. Emulator success is not provider E2E.
- Full browser follow-through after guidance adoption: 103 checks pass on the same
  pinned host/Chromium with local providers, including nine native chat generations,
  one text completion and visible streaming; zero remaining emulated collections.
  Update stale chat/text assertions and architecture prose to the adopted optional
  follow-up policy. At 250 tokens no complete dated source fits; validate that safe
  zero-source result and use 400 for positive-delivery/race fixtures. These are
  explicit test allocations, not product default changes or answer-quality evidence.
  Initial failure and successful source-bound receipts remain archived.
- Separate real direct-CORS/product-client acceptance: 201 synthetic docs, native 200
  scored/50 returned, strong reads/isolation, no deleted-source resurrection,
  auth 401 without retry, no forwarded cookies/CSRF; both owned collections return 404 after cleanup.
- Latest prompt-only trials replay fixed retrieval through actual OpenAI generation
  and judging; they do not validate the later UTC/local-date wording. That review
  fix allows relative-day resolution only when the local conversation date is known;
  UTC alone is insufficient. It preserves timestamp bytes and date ambiguity.
  The new near-midnight regression and pinned SillyTavern/Chromium run pass all
  18 delivery cases plus packing/assembly, with zero remaining emulated collections.
  No paid model/database call or fresh quality score accompanies that fix. All original
  failure receipts and source/label uncertainties remain retained; no deployment,
  release or independent held-out result is claimed.

## Evidence and reproduction

[The evidence index](query1-evidence-index.md) preserves all 49 prior archive checksums
and the full pre-condensation reports, plus exact source revision/file hashes.
All raw bundles are local-only and unavailable in a fresh clone. Restore each
bundle's frozen producer, dependency locks and licensed canonical dataset for offline
verification; later runtime code is not a substitute. Original labels/archives are
immutable. Do not remove the worktree before making another verified retained copy.
