# Query1 retrieval quality and ranked memory assembly

## Decision (2026-10-17)

PR #84 adopts retrieval-order admission based on final assembled size, compact
conversation-time provenance, vector k200/native Jev candidate 200 and supported
personalized-answer/event-role guidance. Keep managed OpenAI Small, Query1,
English Bayesian hybrid, final 50, the complete 4096-token memory allocation and
native recent-five/pair retention. No extra rewrite, extraction or generation
phase is added; native response formats and streaming remain intact.

The evaluated work-branch profile scores **471/500 (94.2%)** with Sol low and the
original task-specific GPT-4o-2024-08-06 judge. This consumed English development
cohort is not held-out confirmation or a deterministic accuracy guarantee. It
is not a claim about the currently installed `main` branch. Merge, release and
main promotion remain separate actions.

Retain Small, Jev, Sol low, chronological presentation and current guidance.
Defer 8192 and external providers; reject preceding-message retrievalText. The
latest follow-up-only prompt deletion is not adopted. Source retrieval, prompt
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

**Retain current guidance.** Remove only the explicit ambiguous-request follow-up
sentence and additional-context request clause; preserve personalization,
event/role matching, non-invention and uncertainty disclosure. Same selected
memory/order/recent dialogue, models and original judge; 28 tokens saved without
refill. Fresh paired 104 score **79→82**, preference **26→29/30**, abstention
**28→28/30**, historical 29 No **9→9/29**. Literal-question-mark outputs fall 50→35,
but that is not a semantic quality metric.

Some supported personalized advice improves, while a season-versus-series-start
qualification is lost despite both replies receiving Yes. The frozen condition
against losing necessary qualifications fails; conditional 396 receive zero calls. This does not
prove deterministic causality or that current wording is optimal. All 104 paired
outputs and 18 source-bound cases were reviewed by the coding agent, not independently
adjudicated. **416 actual attempts, zero retries/errors, 177.572 seconds**, frozen-rate
estimate **$0.5738493**; zero new database requests/resources. Full original prompts,
answers, reviews and gate are in `followup-guidance-ablation-v1`.

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

- Current local: `npm test` **375 passed/0 failed** on Node 24.15.0; `npm run check`,
  `npm run check:release`, `npm run check:sdk` and `git diff --check` pass. CI also
  executes Node 20.12.0/24. Release metadata remains 0.4.0 dated 2026-10-13.
- Retained host checks: pinned SillyTavern 1.19.0/Chromium 153 with local database/model
  emulators; source assembly, native history/streaming, edits/swipes/deletion/races,
  recovery and 18 allocation/delivery cases. Emulator success is not provider E2E.
- Separate real direct-CORS/product-client acceptance: 201 synthetic docs, native 200
  scored/50 returned, strong reads/isolation, no deleted-source resurrection,
  auth 401 without retry, no forwarded cookies/CSRF; both owned collections return 404 after cleanup.
- Latest prompt-only trials replay fixed retrieval through actual OpenAI generation
  and judging; no fresh browser/database compatibility run. All original failure
  receipts and source/label uncertainties remain retained. No new language/provider
  sweep, production deployment, release or independent held-out result is claimed.

## Evidence and reproduction

[The evidence index](query1-evidence-index.md) preserves all 49 prior archive checksums
and the full pre-condensation reports, plus exact source revision/file hashes.
All raw bundles are local-only and unavailable in a fresh clone. Restore each
bundle's frozen producer, dependency locks and licensed canonical dataset for offline
verification; later runtime code is not a substitute. Original labels/archives are
immutable. Do not remove the worktree before making another verified retained copy.
