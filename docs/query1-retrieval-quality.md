# Query1 retrieval quality and ranked memory assembly

## Decision (2026-10-16)

Adopt retrieval-order admission using the final rendered memory size. Remove the
unassembled source-floor/refill stages that could reserve space for lower-ranked
hits before higher-ranked evidence was reconsidered through assembly.

Retain Query1, original source chunks, managed embeddings, English Bayesian fusion,
Jev, vector k100, rerank candidate 100, final size 50 and the 4096-token memory budget.
Keep existing native timestamp formatting; do not promote contextual retrievalText,
200-deep search/reranking, the temporary dev SDK or the benchmark session-time map.
The product change affects selection, not search, stored documents or model/API settings.
The completed compact-date follow-up scores 467/500 versus 469/500; preserve
per-chunk time metadata but defer shared-map promotion. An explicit benchmark
metadata helper is retained without changing native runtime behavior.
The code is validated in the work branch; no merge, release or deployment is claimed.

The fixed-selector
200/200 follow-up below finishes at 471/500 versus 469/500 for 100/100. It improves
fact coverage, but the small net score difference and roughly doubled rerank work
do not establish a clear default-promotion advantage. Defer automatic promotion;
do not describe 200/200 as ineffective.

A completed supplemental Sol-medium audit of these same 1000 saved answers gives
475/500 and 479/500, respectively. The direction favors 200 under both judges,
but the margin remains small and source/reference ambiguities affect some labels.
Keep the official-protocol GPT-4o results alongside the supplemental results; do
not replace labels or promote a default on the strength of the higher judge score.

Source-based triage of all 31 current-default official errors below identifies
five missing-source cases. Four have historical pre-Jev ranks outside 100,
supporting the embedding comparison completed below. Native OpenAI large recovers
three necessary sources but finishes at 468/500 versus small's 469/500. Defer
automatic model promotion and retain `text-embedding-3-small`; the retrieval gains
are real, while this run does not establish an aggregate answer advantage.

This completes one bounded quality decision across the previous diagnostic stages
and the selector fix. Detailed run outputs and the original stage-by-stage notes
are retained in verified local archives rather than maintained as growing scratch
reports or permanent CI fixtures. The base is Query1 PR 83's squash commit
`df95a03d6a38a9837be64c62995fcf9cd9238092`.

## Selection defect and implementation

The previous pipeline first selected whole passages before assembly, preserved
that selection, and then refilled saved space. A short lower-ranked hit could
therefore prevent an earlier rejected hit from entering even when that earlier
hit fit the final assembled representation.

The replacement visits valid hits once in retrieval order. For each hit it renders
the accepted sources plus that hit, compares separate and assembled layouts of the
same complete source set, and counts the cheaper final text. Accept it if it fits;
otherwise continue with later hits. There is no target-specific replacement,
lookahead, body truncation, role preference or extra retrieval/model call. It is
rank-ordered greedy admission, not a globally optimal evidence/knapsack solver.

Validation still precedes ID deduplication. Only current expected documents supply
text, role, speaker and offsets; foreign, stale, deleted or mismatched-time hits
are rejected. Assembly keeps identity/time boundaries, opaque repeated citations,
exact overlap checks, explicit gaps and literal macros. Presentation stays in
conversation/chunk order; admission follows retrieval order. Token failures stop
selection, and complete rendered text is checked against the same host-supplied
budget. The host's quarter-context cap and recent-five/pair policy are unchanged.
See [source assembly](source-assembly.md) for the current contract.

### Muir Woods: rank 29 fits without a larger budget

The question asks for the order of three completed trips. The necessary Muir Woods
family-hike source is original zero-based message 326 (display 327), returned at
rank 29. This is a message position, not a chunk number.

In the frozen benchmark-only shared-session-map representation:

| Selector | Selected retrieval ranks | Memory tokens | Muir source |
| --- | --- | ---: | --- |
| Previous floor/refill | 1–28, 36, 38 | 4085 | Missing |
| Final-layout admission | 1–29 | 4087 | Complete |

Appending 29 while preserving the old set costs 4178 tokens. That append-only
measurement did not show that a larger budget was necessary: replacing the
lower-ranked reserved sources fits. The new selector achieves this without a
special-case swap. Muir was already delivered and answered correctly under the
original product representation; the shared-map recovery is a diagnostic of this
selection defect, not a new product-answer gain.

## Frozen 500 selection regression

Reuse the original 500 real LambdaDB product100 query responses and source IDs,
text/spans, ranks and budgets. Reproduce the old selector exactly, then change
only selection. Compare separately within original native formatting and the
frozen benchmark shared time-map formatting; do not mix these interventions.

| Measure across 500 questions | Original product representation, old → new | Shared session map, old → new |
| --- | ---: | ---: |
| Selected passages | 16983 → 16798 | 15937 → 15797 |
| Median selected passages | 33 → 33 | 32 → 31 |
| Annotated messages with any source delivered | 883 → 883 | 882 → 882 |
| Complete annotated message bodies | 877 → 877 | 876 → 876 |
| Changed final memories | 206 | 173 |
| Lost annotated messages | 0 | 1 |
| Recovered annotated messages | 0 | 1 |
| Maximum final tokens | 4096 | 4096 |

Annotations are not an exhaustive inventory of every relevant fact. A lower
passage count can reflect preferring a larger high-ranked source; it is not by
itself evidence of worse recall. All 1000 old selections/messages/token counts
reproduce, and independent verification checks new final text tokenization,
returned-source membership, rank order, source presentation and date references.
Both previously useful today-event date dependency pairs remain complete.

The shared map recovers Muir but loses `b6025781` message 185 at rank 30: the user's
quinoa/roasted-vegetable protein preference. Higher-ranked sources 27–28 now enter
first and consume that space. The original product representation keeps this
source under both selectors. Defer the map; do not hide this tradeoff with a
combined score, a larger budget or an oracle-based source rule. No shared-map 500
answer run was performed at that stage; the completed follow-up below supplies it.

## Completed answer regression

Run all 500 questions with the new selector and original product representation:
`gpt-6.1-sol`, reasoning low, max completion 4096; official LongMemEval judge
`gpt-4o-2024-08-06`, temperature 0, max tokens 10. Original native system/character,
recent dialogue, query responses, memory budget and judge templates remain fixed.
This is actual OpenAI generation/judgment on frozen host-derived prompts, not a
new browser/LambdaDB retrieval run. The earlier baseline is non-contemporaneous.

| Measure | Earlier unchanged selector | Ranked final-layout selector |
| --- | ---: | ---: |
| Official correct /500 | 467 | 469 |
| Accuracy | 93.4% | 93.8% |
| Answer input tokens | 2524218 | 2523802 |
| Answer output tokens | 30015 | 30655 |
| Answer API median /p95 | 2400/5416 ms | 2505/5586 ms |

There are 9 gains and 7 losses. All 16 changed labels were read alongside both answers;
none was overridden or selectively rejudged. Of 294 byte-identical generation
prompts, four gained and five lost correctness. Of 206 changed prompts, five gained
and two lost. Thus the +2 aggregate difference does not establish a causal quality
improvement. The existing 500 have already been used for development, not independent
confirmation. Timings are actual provider spans, not a controlled speed comparison
or browser end-to-end latency; token counts are not an invoice-based dollar cost.

Important interpretations:

- The train/taxi loss occurs under an identical prompt: the model uses an assistant
  fare estimate instead of the user's conflicting quote. This is answer generation,
  not new evidence eviction.
- The two losses under changed prompts preserve the needed sources. The plant
  answer distinguishes a rolling month from a calendar month; the follower answer
  prefers 1250 confirmed over a later uncertain near 1300 statement. Both are
  reference/uncertainty interpretation issues, not demonstrated source loss.
- Website 19 days and church 30 days answers give the same numeric facts as before.
  Near-equivalent workshop, aunt, museum, ratio and abstention responses also
  receive different labels. Retain the official score while disclosing sensitivity.
- Commute advice drops a visual-reading suggestion; several preference outputs
  change wording without demonstrating recovery of a missing fact. Do not credit
  every gained label to retrieval or assembly.

All 500 answers and 500 judges finish: 1000 provider calls, zero retries/errors,
310094 ms elapsed. Admission uses server rate headers and at most 6 concurrent calls,
with no fixed delay after success. Complete responses, request hashes, models,
finish statuses and independently rebuilt official judge prompts are verified.

## Fixed-selector depth 200 follow-up (2026-10-16)

Product question: did the old selection floor hide the value of deeper candidates?
Freeze the same 500 questions, new selector from `ffcf19a`, original chunks and date
format, Query1, final 50, 4096 tokens, Bayesian English/Jev 1.13.0, Sol and official
judge. Compare only k100/candidate 100 with k200/candidate 200. No intermediate-depth
sweep, changed budget, metadata formatter or alternate model is introduced.

Reuse the previous real LambdaDB final 50 query responses for each arm. Request
comparison verifies that only k and candidateSize differ. Source/query hashes and
the latest 100 baseline's 469 labels are bound to the new plan. Candidate 200 does not
mean injecting 200 documents: its returned 50 are processed by the same selector.
No new LambdaDB indexing, search, rerank call or remote resource is needed. Then
complete all 500 candidate answers and 500 official judges, rather than stopping at
source-coverage proxies or a favorable pilot.

| Measure | New selector 100/100 | New selector 200/200 |
| --- | ---: | ---: |
| Official correct /500 | 469 (93.8%) | 471 (94.2%) |
| Multi-session correct /133 | 118 | 125 |
| Annotated messages returned in final 50 | 884 | 891 |
| Complete annotated message bodies injected | 877 | 883 |
| Selected passages across 500 | 16798 | 16556 |
| Answer input tokens | 2523802 | 2523268 |
| Answer output tokens | 30655 | 30457 |
| Answer API median /p95 | 2505/5586 ms | 2285/6234 ms |
| Historically measured Jev documents scored | 50000 | 100000 |
| Historically measured provider Jev median | 465 ms | 933 ms |

The depth change has 14 gains and 12 losses. Multi-session gains 7 net, offset by
preference−2, temporal−1, knowledge-update−1 and assistant-recall−1; single-session
user scores are unchanged. All 26 changed labels and both answers were read against
delivered context; none was overridden or selectively rejudged. 497 prompts change;
of the three identical prompts, one abstention gains a label. The 100 baseline was
generated earlier, and this is an already consumed development cohort. Small net
score changes cannot establish independent/general or causal quality improvement.
Timing columns are provider spans from different executions, not a controlled
speed test; rerank work/time comes from the original matched retrieval run and was
not remeasured. Fixed prompt budget leaves answer input essentially unchanged,
while 200 approximately doubles rerank work.

What the individual cases establish:

- Helmet 120, age 32 and the sculpting-tool purchase are newly delivered versus 100, and all
  three formerly wrong answers become correct. High-school debate/AP economics
  memories also become available and personalize the reunion answer. These four
  gains have a demonstrated source-recovery mechanism.
- The six-museum question still fails despite recovering the marked Contemporary
  Art Museum source: the generated answer asks whether two other gallery/museum
  names denote the same institution. More evidence does not settle that alias.
- Two flagged messages drop. The primary quinoa preference 185 falls at rank 47 and
  misses the budget, but other selected user/assistant sources still discuss
  quinoa/roasted vegetables; the new answer still suggests healthy related meals.
  The other lost flag 205 is a Galapagos question, while the needed Europe 43 and
  Thailand 195/199 statements remain; the final trip-order answer stays correct.
  Dataset `has_answer` flags are an imperfect coverage proxy, not an exact list
  of necessary facts. Do not equate every flag loss with an evidence failure.
- FarmFresh/Instacart marked bodies remain, but the new selection loses the
  unmarked session-start message 46 containing January 5. The cancellation body itself
  is undated past tense, so the model asks for its date rather than answering 54 days.
  This is a real date dependency missed by message-flag coverage. The benchmark
  puts raw session clocks only on first turns and sets native send_date 0; current
  product host-time metadata remains supported and unchanged.
- Charity fundraising illustrates a reference limitation: 200 adds the user's account
  of helping organize a benefit concert raising 5000 and answers 8750 rather than 3750.
  That additional amount is sourced, not invented; its exclusion from the gold
  creates an inclusion-scope ambiguity. Do not remove related facts merely to
  match the expected total.
- Several gains/losses are near-equivalent numeric/name/clarification answers
  receiving different labels, including 30 days, workshop 720, Miss Bee Providore,
  Arrowhead 12 and the previous ratio. Shoe-storage and event-date cases also expose
  ambiguous completed-state versus future-plan/event-time wording. The theme-park
  output asks for dates rather than offering recommendations despite retaining
  the user's interests. These are interpretation/generation/judge issues, not
  demonstrated disappearance of every needed source.

Within 200, the old selector scored 464 and the new one 471 (12 gains, 5 losses), but complete
flagged-source delivery decreases 885 → 883 with no new flag recovery. The four direct
source-recovery wins above were already delivered by the old 200 selector. Thus this
trial does **not** establish that the old floor had hidden those retrieval gains;
selection, generation and judgment changes must not be collapsed into one cause.

Decision: **defer automatic default promotion and retain 100/100**. Candidate 200 is
useful for evidence coverage and is a viable cost/coverage tradeoff; it is not
rejected as ineffective. Nevertheless, 471 versus 469 with 14 gains/12 losses, several
rubric-sensitive outcomes and doubled historical rerank work does not establish a
clear aggregate default advantage. Keep the corrected selector. Close this bounded
comparison without another local parameter sweep or product setting change.

Validation: all 500 candidate selections independently match original returned
sources, final rendering and 4096 budget; both cached query sets and latest 100 control
prompts/hashes are checked. All 500 answers and 500 official judges finish in 295899 ms,
1000 calls, zero retries/errors. Exact model names, request/response hashes, finish
statuses, official judge templates and unchanged runtime/producer locks pass.
No new browser/live LambdaDB/deployment evidence is claimed; the prior validated
runtime is byte-identical. Full outputs stay in ignored local artifacts.

## Supplemental judge audit (2026-10-16)

Product question: does the small 100-versus-200 difference depend on the official
judge? Freeze both sets of 500 already generated answers and grade each once with
`gpt-6.1-sol`, reasoning `medium`. There is no new retrieval, embedding, reranking,
answer generation, gold editing or selective quality retry. Both arms use the
corrected selector and original native memory representation described above.

Use the exact original LongMemEval task-specific user-message bytes from
[`evaluate_qa.py`](https://github.com/xiaowu0162/LongMemEval/blob/main/src/evaluation/evaluate_qa.py).
The judge sees question, reference/rubric and saved answer, not the corpus,
experiment arm, previous label or answer-model identity. Preserve all original
`gpt-4o-2024-08-06` labels. For the reasoning model, omit temperature and replace
`max_tokens: 10` with `max_completion_tokens: 4096`, which also accommodates
reasoning; `stream: false`, no tools or extra instructions. These are execution
parameter differences, not identical decoding settings or a new judging rubric.
See the [model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)
and [completion parameter contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

| Measure | k100 / candidate 100 | k200 / candidate 200 |
| --- | ---: | ---: |
| Original GPT-4o correct /500 | 469 (93.8%) | 471 (94.2%) |
| Supplemental Sol correct /500 | 475 (95.0%) | 479 (95.8%) |
| Judge agreement /500 | 482 (96.4%) | 484 (96.8%) |
| GPT-4o no, Sol yes | 12 | 12 |
| GPT-4o yes, Sol no | 6 | 4 |

Agreement is 966/1000, with 34 disagreements across 27 questions. The paired depth
comparison is 14 gains/12 losses under GPT-4o and 9 gains/5 losses under Sol.
There are 84 groups of byte-identical judge inputs shared across arms; neither
judge gives conflicting labels within those observed groups. This is not a
repeated-sampling stability study, and agreement does not establish correctness.

The coding agent read all 34 disputed answers and the relevant original source
statements, and inspected their passages in both saved memory sets. The retained notes
cover every disagreement; they are qualitative source review, not independent
human adjudication or replacement gold. Important distinctions:

- Clear reference-equivalent recall can be rejected by GPT-4o: `08f4fc43` gives
  30 days within the reference's 30-or-31 range; `4baee567` recalls the earlier
  12-game claim while warning that the original claim may be inaccurate. Sol
  accepts both. Recalling a previous claim differs from endorsing its truth.
- Sol acceptance can overlook a missing event association. In `dd2973ad`, the
  answer mentions the reference's 2 AM but qualifies its connection to the doctor's
  appointment. Sources place the appointment on May 18 and that bedtime on
  May 24. Accepting the number alone does not establish the requested linkage.
- Some references and premises need qualification. In `efc3f7c2`, the 30-minute
  reference reflects an older assistant-proposed 6:30 schedule. The newer user
  statement says 7:30 daily, followed by a Friday 6:00 exception. The answer's
  90 minutes has source support even though Sol rejects it against the reference.
  Jewelry versus chandelier, calendar versus rolling month, and individual
  earrings versus acquisitions introduce similar interpretation boundaries.
- Preference and abstention thresholds differ. Personalized follow-up questions
  may satisfy some preference recall without completing a recommendation.
  `c8090214_abs` explicitly distinguishes a known iPhone from the unmentioned
  iPad and asks for the missing date. Conversely, `09ba9854_abs` calculates bus
  savings from assistant fare estimates despite a different user-reported taxi
  price and an abstention reference. The estimates exist in the corpus; they do
  not establish comparable confirmed prices for the same route.

The supplementary judge uses the same model family as the answer generator.
This comparison neither isolates self-preference nor proves Sol is a better
judge. All 500 questions are an already-used development/regression cohort, not
independent held-out confirmation. Preserve both aggregate scores and ambiguous
cases. The bounded audit is complete: 200 is modestly ahead under both judges,
but no runtime/default change follows from this judge-only comparison.

All 1000 actual OpenAI calls finish with valid yes/no responses, zero retries and
zero errors, in 232496 ms with at most six concurrent requests. Normal requests
have no artificial delay; rate-limit headers govern admission. Reported usage is
202831 prompt tokens and 5873 completion tokens (1597 reported reasoning tokens).
Median judge latency is 1313 ms, p95 1982 ms; this is judging latency, not product
answer latency. Offline verification checks every input/answer binding, unchanged
official prompt/label, request parameters, returned model, stop status, usage and
frozen runtime/producer hashes. No fresh browser, LambdaDB or deployment test was
performed for this judge-only documentation update.
`npm test` passes all 369 tests; `npm run check` and `npm run check:release` pass.

## All 31 current-default errors: source-based triage (2026-10-16)

Inspect every official-protocol error in the corrected-selector 469/500 depth100
run, not only the 34 judge disagreements above. Reuse saved original sources,
returned 50, actual generation bodies, answers and both label sets. There are
zero new provider calls and no label, runtime or default changes. Each case has
one primary observed blocker; categories are diagnostic judgments, not mutually
exclusive causal proofs or independently adjudicated gold.

| Primary observed blocker | Cases | Interpretation |
| --- | ---: | --- |
| Necessary evidence absent from final 50 | 5 | Helmet price, current age, sculpting-tool purchase, positive high-school memories, Contemporary Art Museum visit |
| Event bodies delivered, conversation-clock dependency missing | 2 | Ukulele/service interval and keyboard/bluegrass interval; benchmark clocks remain attached only to session starts |
| Available evidence misused or requested response not completed | 5 | Wrong role/project association in two abstention questions, invented graduation, conflicting fare interpretation, clarification instead of publication recommendations |
| Interpretation, reference or judging sensitivity | 19 | Includes scope/counting units, time windows, approximate values, implicit associations and qualified reference-equivalent answers; not 19 proven bad references or 19 established correct product answers |

All five missing sources are returned and delivered at depth200. Four answers
then pass; the museum answer still raises a venue-alias question. Their depth200
positions are sculpting tools 4, age 3, high-school memory 1, museum 18 and helmet 4.
This is a real evidence-coverage opportunity, even though the full-cohort net
answer advantage remains small. Do not extrapolate this selected error cohort
into expected accuracy on new conversations.

Four cases also have earlier reconstructed per-leg search captures with matching
source text. Their positions before reranking are:

| Necessary source | Vector rank | Lexical rank | Bayesian rank |
| --- | ---: | ---: | ---: |
| Helmet price | 103 | 220 | 138 |
| Current age | 112 | 235 | 114 |
| Contemporary Art Museum | 104 | 113 | 101 |
| Sculpting tools | 194 | 169 | 155 |

These are historical reconstructed deep-search results, not in-flight traces of
the later baseline. They corroborate candidate-recall limits before Jev. The
helmet's separate exact-vector audit also did not show ANN approximation loss.
For the high-school case, the baseline per-leg/fusion candidate membership remains
unknown: final-50 absence alone cannot identify the failing stage.

An important annotation correction: `09ba9854` is **not** a demonstrated necessary
body-budget failure. Marked user message 137, reporting a $10 train fare, is
returned at rank 31 but excluded. Unmarked user message 139 repeats that $10 fare
and is actually delivered, along with the $60 taxi source. The generated answer
instead follows a delivered assistant estimate of $20–30 for the train. The
missing annotation is not a missing fact. Across these 31 cases, no additional
necessary-body budget exclusion is established; that does not prove 4096 tokens
are sufficient for every question. Missing session clocks remain separate.

Other concrete distinctions: in `81507db6` all three attended graduation sources
are present, but the answer invents a fourth by turning a professor's future
lifetime-achievement award into a graduation. In `370a8ff4`, both explicit-today
events and their dates are present: January 19 to April 10 is independently
81 days, or 11 weeks 4 days, matching the answer rather than the 15-week reference.
The first is a response error; the second is a source/reference inconsistency.
Neither justifies swapping the retrieval model to match the existing label.

Next intervention: compare **one managed embedding alternative** with current
`text-embedding-3-small`, keeping Query1, chunks, English Bayesian fusion, Jev,
k100/candidate100/final50, 4096 budget, date formatting and answer/judge settings
fixed. Verify supported model/access before execution. First test necessary-source
recall and full-cohort coverage regression; only a supported retrieval improvement
justifies the subsequent full 500 answer comparison. Do not replace Jev or tune
depth/budget simultaneously. The five errors are discovery cases; the already-used
500 are regression evidence, not held-out confirmation. Preserve the two clock
dependencies and response/reference issues rather than claiming an embedding swap
will resolve them. The following trial evaluates that embedding configuration.

Offline verification covers all 31 frozen errors, original input/answer receipts,
source bytes, selected passages in actual generation bodies, final hit ranks,
the repeated train-fare evidence, missing clock anchors and four historical
per-leg captures. Detailed case notes remain in the ignored evidence bundle.
`npm test` passes 369 tests; `npm run check`, `npm run check:release` and
`git diff --check` pass. Runtime hashes match the completed judge audit; browser,
live LambdaDB and model integrations were not rerun for this offline analysis.

## Native OpenAI large comparison (2026-10-16)

Compare current `text-embedding-3-small` with `text-embedding-3-large` using each
model's native default dimensions, 1536 versus 3072. This is an embedding
configuration comparison, not a fixed-dimension ablation. Keep original text,
chunks, dates, 50-document upsert batches, Query1, English Bayesian fusion, Jev
1.13.0, k100/candidate100/final50, corrected selector, 4096 budget and native
system/character/recent dialogue unchanged. Product SDK 0.8.0 and defaults remain
unchanged. No query rewriting, new formatter or additional provider is introduced.

A real two-document native-large probe verifies effective 3072 dimensions and
search. Then reindex all 483385 frozen documents in their original 10356 batches,
fetch-validate every source, and execute all 500 actual LambdaDB searches with
`consistentRead: true`. Reuse the verified small query/answer receipts rather than
reindexing or regrading the control. This saves a control rerun but makes retrieval
and generation non-contemporaneous; do not claim independent causal confirmation
or a controlled speed comparison. All questions are consumed development cases.

| Measure | Retained small | New large |
| --- | ---: | ---: |
| Official-protocol correct /500 | 469 (93.8%) | 468 (93.6%) |
| Multi-session correct /133 | 118 | 121 |
| Temporal reasoning correct /133 | 125 | 121 |
| Annotated source messages returned | 884 | 889 |
| Complete annotated bodies injected | 877 | 885 |
| Selected passages | 16798 | 16756 |
| Median / maximum memory tokens | 4080 / 4096 | 4080 / 4096 |
| Answer input tokens | 2523802 | 2522666 |

The three demonstrated recoveries are helmet price, current age and positive
high-school memories. Each is returned at rank 3, fully delivered and answered
correctly. The sculpting tools and Contemporary Art Museum sources remain absent
from large's final 50. All eight complete-annotation gains were inspected; none
of the old complete annotations is lost. Other gains include repeated user fares,
an already-answered doctors count, and complete messages whose needed fact was
already present in a selected chunk. Eight more complete bodies are not eight
newly answerable questions. In particular, the train-fare answer improves to $50,
but the baseline already contained that fare in another user message.

The full answer comparison has 12 gains and 13 losses. All 25 changed answers were
read against original sources and relevant delivered passages. Two losses expose
unmarked benchmark clock dependencies despite preserving event bodies:

- Tennis racket `gpt4_7a0daae1`: the March 10 session-start message 87 was selected
  at baseline rank 25 but is absent from large's final 50. The purchase body and
  March 17 receipt remain; the model asks for the purchase date.
- Plant cuttings `gpt4_8e165409`: the March 18 session-start message 301 moves from
  selected rank 18 to returned rank 35 and misses the budget. Both event bodies
  remain, but the model asks for the cuttings date.

These are first-turn-only benchmark date dependencies, not proof that the product
lacks native timestamp support. Other response losses retain their inputs:
Sephora still supplies 200 points and the 300-point target; baking-class dates
remain but the answer omits their requested 21-day interval. Fourteen changed
labels are interpretation/judging-sensitive. For example, website launch 19 days
before a contract and a contract 19 days after launch receive different labels;
both are the same interval. No received label is overridden. There are no
byte-identical-answer label flips here; similar answers are not identical judge
inputs. Of 499 changed generation bodies, 12 gain and 13 lose; the one identical
body stays correct. These observations do not isolate every change's cause.

Decision: **defer automatic model promotion; retain small**. Large improves actual
candidate recall within the unchanged budgets, but its one-point lower aggregate
does not establish an answer advantage or intrinsic inferiority. Native vector
dimensionality doubles; inference pricing also differs by model. Local token
arithmetic finds 51741018 logical embedding input tokens, including questions;
this is not provider-reported/billed usage and excludes probe/retries. Before a
further provider comparison aimed at native product fidelity, settle a common
conversation-date provenance representation. Do not silently turn session clocks
with unknown timezone into exact UTC message/event timestamps, or change that
representation in only one model arm. The subsequent compact-date follow-up below
keeps the embedding model fixed and does not revise the large comparison.

All 500 test collections and the probe are ownership-checked and deleted with
GET 404 confirmation. Eight initial `Writer cold recovery capacity` 429s recover
with bounded backoff; no embedding failure stops the run. Actual OpenAI generation
and official GPT-4o judging complete all 1000 calls in 270454 ms, zero retries or
errors. Sol reasoning low and official judge parameters/templates remain fixed.
Large query/Jev provider medians are 729/498 ms; answer median/p95 is 2107/5418 ms.
These are recorded spans, not controlled comparative speed or browser latency.
All input/source/request/response/model/finish/budget bindings and 25 review records
pass offline verification. `npm test` passes 369 tests; syntax/release checks pass.
No new browser, release, deployment or product integration change is claimed.

## Per-chunk session provenance and compact-date follow-up

Completed on 2026-10-16 against the corrected-selector small-embedding baseline.
The product decision separates **preserving source dates** from **promoting one
prompt representation**. Native runtime already captures valid host `send_date`,
stores `conversationTimestamp`/`timestampSource` on every chunk, validates returned
times and injects them. This work does not add a missing native timestamp feature.

The benchmark has raw session clocks with unknown timezone and `send_date: 0`.
`withBenchmarkSessionTimes` in `scripts/benchmark-development-input.mjs` explicitly
attaches `benchmarkSession` and the unchanged `benchmarkDate` to every chunk by its
original zero-based message position. It neither edits embedding/source text or
IDs nor invents native UTC/message/event timestamps. It rejects unsupported clocks,
invalid message positions, conflicting existing session provenance and native time
provenance. Callers must first bind documents to the same frozen transcript.
Existing adapters are not silently changed; historical inputs/hashes remain valid.
Two small maintained tests cover inheritance/nonmutation and invalid/conflicting
provenance. Independent replay verifies exact equivalence to all **483,385** metadata
records used by the completed trial. The helper was extracted after the run and
verified against it; it did not produce the original paid-run inputs.

A real authenticated LambdaDB probe stores three synthetic documents: a native UTC
millisecond timestamp, a raw session clock, and an unknown time. Managed-small
upsert, `consistentRead: true` fetch and knn query preserve every original field.
The session/unknown documents acquire no invented UTC timestamp. Ownership-checked
collection deletion is confirmed by GET 404. This establishes a real field
roundtrip, **not** that all 500 histories were reindexed with these fields.

For the full cohort, attach metadata locally to the frozen real small-embedding
retrieval/source records. Reproduce all 500 native baseline and frozen shared-map
selections before issuing calls. Keep source text/IDs/spans, embedded first-turn
headers, retrieval ranks, corrected selection, k100 / candidate100 / size50,
Bayesian English/Jev, 4096-token budget, native prefix/suffix and models unchanged.
Render one raw session-clock dictionary with an explicit reference in every
excerpt; state once that clocks date conversations, not necessarily events, and
that timezone is unknown. The complete rendering is budgeted. No formatter sweep,
budget increase, source-specific swaps, extra searches or rewritten queries.

| Measure | Retained current native-format baseline | Shared session map |
| --- | ---: | ---: |
| Official-protocol correct /500 | 469 (93.8%) | 467 (93.4%) |
| Multi-session /133 | 118 | 121 |
| Temporal /133 | 125 | 125 |
| User recall /70 | 69 | 69 |
| Assistant recall /56 | 55 | 54 |
| Preference /30 | 26 | 23 |
| Knowledge update /78 | 76 | 75 |
| Selected passages | 16798 | 15797 |
| Annotated messages with any delivered source | 883 | 882 |
| Complete annotated original bodies delivered | 877 | 876 |
| Answer input tokens | 2523802 | 2519978 |
| Answer output tokens | 30655 | 30039 |

Actual calls use Sol reasoning low for 500 answers and the exact official
GPT-4o-2024-08-06 protocol for 500 judgments. All 1,000 calls finish with 0 retries/errors
in 270,105 ms. Candidate answer median 2,138 ms / p95 4,997 ms and judge median 650 ms are
actual provider timings; the earlier control is not contemporaneous, so they do
not establish a comparative speed benefit. All 500 are previously consumed
regression/development data, not held-out confirmation. No label is overridden.

On identical accepted source sets, local cl100k arithmetic attributes median 208.5
added tokens to compact provenance, p95 370 / max 539. Expanding those same map
references into repeated inline dates costs median 227 more tokens, p95 319 / max 495.
This is an offline same-source comparison, not the old paid repeated-date score
or billed usage. A compact map saves repetition but still displaces source text
relative to the benchmark's sparse first-turn-only clocks.

All **18 changed labels (8 gains, 10 losses)** were inspected against questions,
old/new answers, original flagged sources and relevant delivered passages:

- Two gains repair a demonstrated missing clock dependency: keyboard March 25 to
  bluegrass March 31 now answers 6 days; ukulele February 1 to servicing February 25
  answers the accepted 24 days. The latter history also contains an earlier intention
  to service the guitar; this does not settle every interpretation of "decided".
- Graduation and train-fare gains use already available facts better, rather than
  recover previously missing necessary bodies. In particular, duplicate user
  train-fare message 139 already supplies $10 in both prompts, even though
  annotated message 137 remains absent.
- The predeclared meal-preference source 185 is the only lost annotation. It falls
  out of the 4096-token budget; related quinoa/lentil/vegetable context remains and both
  answers give personalized healthy recipes. The source loss is real, but exclusive
  attribution of the negative label to that source is not established.
- All four baking bodies remain, but the candidate adds an undated apple pie to
  its count. Its May 20 conversation date does not prove the pie was baked during
  the requested two weeks. Preserving this distinction in a provenance warning
  does not guarantee that generation follows it.
- Commute preferences remain but the answer adds reading on the bus, which the
  rubric discourages. Both dated mortgage amounts remain, but the answer still
  emphasizes the older $350,000 instead of the expected $400,000. These are not missing
  timestamp/body demonstrations.
- Ten changes are interpretation/judging-sensitive, not ten proven judge errors.
  Both restaurant answers name Miss Bee Providore; both church answers say 30 days;
  near-equivalent fish/iPad/slow-cooker clarifications change labels. Jewelry
  distinguishes 3 acquisitions from 4 individual pieces. Museum companionship lacks
  an explicit source assertion of going alone. Google employment has no established
  start date. Nursery answers share the same order but differ in caveating a
  mention date. All labels remain untouched.

Of 500 changed generation bodies, 75 produce byte-identical final answers. Their
complete judge request bodies/bindings also match the old control. One changes
label: `gpt4_7bc6cf22` answers March 20, 2023 and 12 days ago in both, but Yes becomes No.
This is observed identical-input judge variability, not an estimated error rate.
No selective rejudging, replacement answer, gold edit or adjusted headline score.

**Decision:** retain per-chunk source-time metadata as a requirement and keep native
runtime handling. Keep the explicit benchmark helper for future comparisons;
do not treat session clocks as precise native message times. **Defer shared-map
product promotion** because the frozen nondeclining-score gate is not met.
The two-point difference does not establish intrinsic formatter inferiority, but
neither does solving two discovery cases establish aggregate superiority. Do not
launch another format sweep or change embedding/search defaults within this task.
Future paired comparisons must freeze the same explicit provenance treatment in
both arms rather than silently repair only the new provider's inputs.

Validation: all 500 input/provenance/source/budget/protocol checks pass, all 483,385
maintained-helper projections match, all 18 changed-label reviews are retained,
and the live owned probe is cleaned. `npm test`: 371 passed / 0 failed;
`npm run check` and `npm run check:release`: passed. Runtime, credential handling,
SDK and release metadata are unchanged. No new browser/real SillyTavern generation,
release or deployment is claimed. Raw plans, receipts, metadata projections,
checks, reviews and the final decision remain ignored under
`artifacts/compact-date-provenance500-v1`; the immutable local archive is indexed
below. It is unavailable in a fresh clone; preserve this evidence before cleanup.

## Previous candidates and why they remain deferred

| Candidate / observation | Completed evidence | Decision |
| --- | --- | --- |
| Preceding-message contextual retrievalText | 440/500 versus its 469/500 Query1 control; 4 gains, 33 losses; embedding input 2.161 times | Reject after full regression. Added context can introduce topic/entity noise; keep original chunks. This earlier control is distinct from the later 467 baseline. |
| Helmet vector diagnosis | Necessary source exact rank 103 among 972 documents; server top 100 matched exact top 100 | Not demonstrated ANN approximation failure. Top 100 leg limits excluded it. |
| Temporary dev SDK/depth 1000 and candidate 200 pilots | Recover helmet, age, museum and sculpting facts; age answer remains interpretation-sensitive; increasing rerank pool roughly doubles scored documents | Useful diagnosis, not a default-adoption result. Product SDK remains 0.8.0. |
| Matched full 500 k100/c100, k200/c100, k200/c200 | 467, 465, 464 correct; candidate 200 query median 1181 ms versus 707 ms, Jev 933 ms versus 465 ms | Defer deeper defaults; fact recoveries do not establish aggregate answer improvement. All 500 owned collections deleted with 404 confirmation. |
| Explicit date provenance per excerpt | Native path already captures/stores/validates host times, but benchmark send_date was 0. Benchmark session-clock delivery gives 466/500 versus 467; 10 gains, 11 losses | Repairs two date dependencies, but adds prompt pressure and does not establish aggregate gain. Session clocks are not event times. |
| Shared session-time map, earlier diagnostic | Removes repeated metadata, raises selected passages 14996 → 15937 versus repeated-date format; old selector still loses Muir | Initially deferred without an answer run. The completed corrected-selector follow-up above now scores 467/500 versus 469 and keeps promotion deferred. |

Raw benchmark session clocks have unknown timezone and are shared by many messages.
They must not be invented as exact UTC message/event instants. Valid native host
message timestamps remain supported. Dates of utterances can anchor explicit
today references, but cannot prove when an undated past-tense event happened.

## Validation boundaries

- `npm test`: 369 passed, 0 failed, Node 24.15.0. Small fixed regressions cover the
  higher-ranked assembled fact beating lower-ranked short filler, exact budgets,
  source/time isolation, stale/deleted/forged hits and fail-closed token counting.
- `npm run check`, `npm run check:release`, `npm run check:sdk` and
  `node --check` for all maintained scripts/tests pass. SDK 0.8.0 bundle unchanged;
  release metadata remains 0.4.0 dated 2026-10-13. Node 20 CI matrix was not run locally.
- Real pinned SillyTavern 1.19.0 (`06bde939fb1e9c4c8d8641d810f0a916b5bce127`)
  and Chromium 153.0.8010.12: 102 browser checks pass, including actual extension
  dispatch, source assembly, edits/swipes/deletion/races, reload and cleanup.
- `prompt-delivery-smoke.mjs`: 18 allocation/delivery cases plus overlap, repeat
  and same-message assembly checks pass. Full sources/native roles reach the local
  completion endpoint; final verification and stored-history preservation pass.
- The first delivery attempt failed an old five-excerpt expectation. Rank-priority
  admission selects four groups containing all higher-ranked repeat citations,
  displacing a lower-ranked fifth excerpt in this existing Korean synthetic input.
  Preserve that observed selection difference; it is not a Korean quality gain.
  Updated fixed expectations still check complete bodies, exact citations, roles,
  unchanged history and final dispatch. Initial report/log/screenshot remain retained.
- Browser runs use local HTTPS LambdaDB and completion emulators, zero external
  provider calls, and end with zero emulated collections. Separately, the 500 answer
  run uses actual OpenAI. No new live LambdaDB write/query, model sweep, release,
  deployment or claim of fresh managed-provider verification accompanies this fix.

## Evidence and reproduction

New selection bundle: `artifacts/ranked-assembly-full500-v1/` contains the frozen
plan, original/candidate producers, 1000 selection results, independent verifier,
source/test snapshots, browser/delivery reports, initial failure and checks.
New answer bundle: `artifacts/ranked-assembly-answers500-v1/` contains all 500 frozen
inputs, 1000 request/response receipts, official labels, analysis and review of all
16 label changes. Dataset SHA 256:
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`;
official judge source SHA 256:
`ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251`.

The complete earlier stage notes are preserved byte-for-byte as
`ranked-assembly-full500-v1/prior-stage-notes.md`, SHA 256
`1551722c70bc4f56830b7bacb3815873d6b346c4ff5cba3b00bc7c4dc23f0538`. No original evidence was removed or overwritten.
Each archive contains its file manifest; readback verifies every member. The new
bundles also passed configured-secret scanning including decompressed receipts.

The fixed-selector depth follow-up is preserved separately in
`artifacts/ranked-depth200-full500-v1/` (plan, 500 selections, query locks, independent
verification, source snapshot) and `artifacts/ranked-depth200-answers500-v1/`
(500 frozen inputs, 1000 receipts, official labels, analysis, all 26 reviews and the within-200 audit).
Both archives pass complete manifest readback and configured-secret scanning.
Verification entry points are `node artifacts/ranked-depth200-full500-v1/verify.mjs`
and `python3 artifacts/ranked-depth200-answers500-v1/verify.py`; neither sends new
provider requests. The earlier search/input and 100-baseline archives remain required.

The supplemental audit is retained in `artifacts/sol-judge-audit1000-v1/`: frozen
plan and 1000 inputs, all 1000 actual judge receipts and labels, aggregate analysis,
all 27 source-review notes, verification and source snapshots. Run
`python3 artifacts/sol-judge-audit1000-v1/verify.py` for offline binding checks;
the original answer bundles, official judge source and dataset are dependencies.
The archive passes full manifest readback and configured-secret scanning. Full
outputs remain ignored; only this concise decision record is maintained in Git.

The all-errors analysis is retained in `artifacts/query1-errors31-v1/`: frozen
31-case plan and original evidence, source-based review notes, aggregate counts,
historical-rank corroboration, verifier, input dependency hashes and unchanged
runtime hashes. `python3 artifacts/query1-errors31-v1/verify.py` performs offline
checks against the retained original bundles/dataset. Its archive passes every
file's manifest readback and configured-secret scanning; no earlier archive was
rewritten or evidence deleted.

The native-large trial is retained in `artifacts/embedding-large-full500-v1/`
(frozen plan, probe, 500 live query receipts/selections, source/coverage verification,
all eight coverage reviews, cleanup records and product/SDK snapshot) and
`artifacts/embedding-large-answers500-v1/` (500 frozen prompts, 1000 actual model
receipts, official labels, all 25 source-based reviews, input strata and decision).
Offline entry points are `node artifacts/embedding-large-full500-v1/verify.mjs`,
`python3 artifacts/embedding-large-answers500-v1/verify.py` and
`python3 artifacts/embedding-large-answers500-v1/verify-review.py`. Prior baseline
input/answer bundles and the licensed dataset remain dependencies. Both archives
pass complete manifest readback and configured-secret scanning, including
decompressed receipts. Full run scripts/data remain ignored, not permanent CI fixtures.

All archives below are **local-only** under the retained worktree's `artifacts/archive/`;
they are not uploaded or available from a fresh clone. Reproduction requires these
bundles and the retained licensed dataset/input/query dependencies identified by
SHA 256 in each plan. Extract into an ignored artifacts directory and use its frozen
producer sources, not a later changed runtime. Local verification entry points are
`node artifacts/ranked-assembly-full500-v1/verify.mjs` and
`python3 artifacts/ranked-assembly-answers500-v1/verify.py`; the latter does not
send model requests. Do not discard the worktree until unique archives have another
verified retained copy. Older original archives remain immutable.

| Local archive filename | SHA 256 |
| --- | --- |
| `retrieval-stage-audit-v1.tar.gz` | `8852bc3095bcbb074ff55b60b0ba0a43aa3170b8dedd44031a4e5b15ef90898c` |
| `retrieval-stage-score-variation-v1.tar.gz` | `f9f9a78ebdab49f05484461ef912da0932d500264962e9df4b8043a050f59b7c` |
| `contextual-retrieval-pilot-v1.tar.gz` | `2ee7e4650f75c784fea728cfa4f5caf5e237736e5b2653afdfdfcf6eb08f776c` |
| `contextual-pilot-answers-v1.tar.gz` | `0557d38a0d62714b955fa03a9090060f4f3ecb24f77f8f1ff9f7eca02aa5ee3e` |
| `contextual-retrieval-full500-completed-v1.tar.gz` | `cb073911a2732f7ede8c5ed811b7c0d77576544deb9f63c842f99671ff127331` |
| `contextual-retrieval-full500-review-v1.tar.gz` | `cf55559fd5ac97672a53ca1b7591ba81648d19484c62e49ab2e5cd1b2f8aa3b9` |
| `helmet-vector-diagnosis-v1.tar.gz` | `edb107c93fe2b95dbeb01eefee38c1f861e66b53a90ef382cca1e47a1af77673` |
| `sdk-dev-depth-v1.tar.gz` | `4128d603350cb7f69b09ac0922ee7ae784cc3137e3fd10eba94c7ec8dc21302f` |
| `jev-candidate-200-pilot-v1.tar.gz` | `83e86165ae77817eb58d32b9ad1aa26478dd6eaeef1c53ec9600bf7911184140` |
| `vector-k-200-pilot-v1.tar.gz` | `7c7875a513c7850961fa9b31c15533d5f5481e6b5a4c9d60e8247f5d0d991bfd` |
| `retrieval-200-full500-v2.tar.gz` | `677ec026faedb8c3b44264659f793903f955a07123ffe35135ed27f989362230` |
| `date-provenance-path-audit-v1.tar.gz` | `b78ee2f69bf587191421f3c21525cc9915b6ed1dd036383166a87b704914260f` |
| `date-provenance-full500-v1.tar.gz` | `fad914851997b3d5886e16999c2a0cf3373422cb66b3e00acf17ced9297f6311` |
| `date-provenance-answers500-v1.tar.gz` | `2c67e0084789f7deba15ef33c147eb64a6154284bcb16cafa412af328d30f39d` |
| `session-time-map-full500-v1.tar.gz` | `aa1f8dd391cc8264353889444cc08c3044d64283f797aad6b36b86230681fa6b` |
| `muir-woods-injection-audit-v1.tar.gz` | `d6869cd65f55222ccbf240e16140173479a45af25f8be504b585ef49820e52ea` |
| `ranked-assembly-full500-v1.tar.gz` | `67c7e20e67aa4fae22b318c33d46074cc0e5d2cc4e18ec7efa6824b59ee6bb35` |
| `ranked-assembly-answers500-v1.tar.gz` | `8008b97f410c69a692215b7790a64dc7c109fe35969ceb3461981956bfeff519` |
| `ranked-depth200-full500-v1.tar.gz` | `734bd6474f74442666e981dc024c276cdede472202c94c8c6f58c312a1a40b7f` |
| `ranked-depth200-answers500-v1.tar.gz` | `71088cf776717fa53e80ac1ff4dbdbb007a78aed419c504c30f5f9b1047a8a41` |
| `sol-judge-audit1000-v1.tar.gz` | `76688b7fe665f473e18690778b59190462acfffa77adcf4ec4f191cd44089e4a` |
| `query1-errors31-v1.tar.gz` | `91195674a65ed93fdc3eec419665e9c1fde9cc8ad8c6b0ac8decf2cac320062f` |
| `embedding-large-full500-v1.tar.gz` | `0a823a8e71683970f6a2e9e852aaa854e34b16ed46df45ee7ac27f14b76c86ca` |
| `embedding-large-answers500-v1.tar.gz` | `4050546035a4fe30f08733d3bb52062d82c0a62ecb59a3f36675af814d190629` |
| `compact-date-provenance500-v1.tar.gz` | `01c6df24b1dceeeb7527509a55611fa183341250c7cffc251b3491155e84b79f` |
