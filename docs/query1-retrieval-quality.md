# Query1 retrieval quality and ranked memory assembly

## Decision (2026-10-16)

Adopt retrieval-order admission using the final rendered memory size. Remove the
unassembled source-floor/refill stages that could reserve space for lower-ranked
hits before higher-ranked evidence was reconsidered through assembly.

Retain Query1, original source chunks, managed embeddings, English Bayesian fusion,
Jev, vector k100, rerank candidate 100, final size 50 and the 4096-token memory budget.
Preserve native timestamp storage and use compact `sent` excerpt headers with one
counted explanation. Do not promote contextual retrievalText, 200-deep
search/reranking, the temporary dev SDK or the benchmark session-time map.
The product changes selection and time presentation, not search, native stored
documents or model/API settings.
The completed compact-date follow-up scores 467/500 versus 469/500; preserve
per-chunk time metadata but defer shared-map promotion. An explicit benchmark
metadata helper is retained. The later agreed direct-`sent` policy below is now
implemented and scores 465/500; this is truthful time delivery, not a claimed
answer-quality improvement. One demonstrated benchmark capacity regression remains.
The subsequent same-policy, interleaved 4096/8192 comparison below finishes at
465/500 versus 469/500, with 8 gains, 4 losses and 50.0% more generation input.
It repairs Muir Woods, but does not establish a reliable general default gain;
defer raising the product budget/default maximum and retain 4096.
The subsequent Voyage comparison below improves returned and delivered evidence
at the same 4096 budget and scores 468/500 versus the retained 465 control.
Keep Voyage as a promising retrieval candidate, independently of that modest
answer-score difference. Its external embedding path is experimental; managed
provider support and a product integration decision remain outstanding.
The same-sent replay of retained native OpenAI large retrieval finishes at
470/500, versus small 465 and Voyage 468, delivering 883 complete annotated bodies
versus 876 and 882 at 4096. Keep large as the leading managed candidate for a
product model-selection decision; this evaluation does not change defaults.
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

## Implemented unified sent policy

The user settled the semantic contract after the shared-map comparison: preserve
provided conversation time on every chunk and use **`sent` for both native and
benchmark excerpts**. Different source provenance need not impose different prompt
field names. No inferred event, entity, topic, importance or other extracted
metadata is added. Native source-time storage, revisions, schema and embedding
text remain unchanged. A local before/after native-document comparison confirms
identical generated fields and IDs.

`src/time.js` supplies the shared `sentLabel` and one `SENT_GUIDANCE` constant.
`src/memory.js` places dates directly inside separate, repeated and assembled
excerpt headers and adds the explanation once per selected memory, within its
counted text. Raw assembly helpers prevent repeated explanations. There is no
cross-render state or date dictionary. Valid native UTC timestamps retain their
precision; missing times stay absent. The benchmark adapter formats the provided
wall clock as `YYYY-MM-DD HH:mm` through the same label helper, preserving its raw
session clock and identity in metadata. It does not add seconds or a UTC suffix.

```text
[Past conversation excerpt: user "User", message 309, passage 1, sent: 2023-03-18 14:30]
```

The common explanation distinguishes conversation time from event time, anchors
relative dates, leaves undated events unknown, explains UTC/unknown timezones and
allows shared session timestamps. This is guidance, not proof that generation will
interpret every date correctly. Source bodies remain verbatim after existing
macro literalization; all labels/explanation are included in the unchanged budget.
Validation still precedes ID deduplication, and ownership/scope/revision/time checks,
rank-order admission, current-chat cancellation and full-source assembly remain.
Native recent dialogue and the benchmark question-date prefix are unchanged.

The frozen trial reuses all 500 actual small-embedding Query1/Bayesian English/Jev
query results: k100/candidate100/size50, original chunks/text/IDs/spans, corrected
selector, 4096-token budget, native prefix/suffix and model options. No new all 500 remote
index/search or provider/model/depth sweep. It compares the complete agreed time
policy against the earlier sparse first-turn-only benchmark clocks; **it is not a
same-source native long-label versus short-label answer-quality experiment**.

| Measure | Retained current control | Unified sent policy |
| --- | ---: | ---: |
| Official-protocol correct /500 | 469 (93.8%) | 465 (93.0%) |
| Multi-session /133 | 118 | 116 |
| Temporal /133 | 125 | 125 |
| User recall /70 | 69 | 69 |
| Assistant recall /56 | 55 | 56 |
| Preference /30 | 26 | 24 |
| Knowledge update /78 | 76 | 75 |
| Selected passages | 16798 | 15184 |
| Annotated messages with any delivered source | 883 | 882 |
| Complete annotated original bodies delivered | 877 | 876 |
| Answer input tokens | 2523802 | 2519462 |
| Answer output tokens | 30655 | 30908 |

All 500 actual Sol-low answers and exact official GPT-4o-2024-08-06 judgments finish
in 274,853 ms: 1,000 calls, 0 retries/errors, rate-header pacing without fixed success waits.
Candidate answer median 2,186 ms / p95 5,489 ms and judge median 633.5 ms are provider spans,
not a controlled speed comparison against the earlier control. The cohort has
already been consumed for development; it is not held-out confirmation. The full
input/source/metadata/render/budget/model/finish/prompt/label/usage checks pass.

On identical selected source sets, direct benchmark sent provenance adds median 355
cl100k tokens, p95 481 / max 593, versus removing only those added labels/explanation.
Original source-embedded first-turn date headers remain in both. Separate fixed
synthetic native arithmetic, including the same memory guidance, is:

| Native dated excerpts | Previous verbose labels | Unified sent labels |
| --- | ---: | ---: |
| 1 | 188 | 230 |
| 2 | 259 | 282 |
| 5 | 470 | 436 |
| 10 | 823 | 694 |

One shared explanation has an initial cost and saves repetition across larger
sets. This arithmetic is not measured provider cost/latency or a quality score.
Fewer total answer-input tokens do not mean free metadata: different complete
source sets fill the fixed 4096-token budget.

All **20 changed labels (8 gains, 12 losses)** were inspected against questions,
received answers, original flagged sources and relevant delivered passages:

- Keyboard/bluegrass and ukulele/servicing gain the missing sent-date anchors and
  answer accepted 6/24-day intervals. The earlier servicing intention remains an
  interpretation caveat. Graduation and train-fare gains better use already
  available bodies, rather than retrieve new necessary facts.
- **Muir Woods is a real regression.** Its returned rank 29 message 326 falls outside
  the budget after dates are counted. The answer substitutes another Yosemite
  trip and fails. This is the only lost annotation; no source-specific swap or
  budget increase hides it. The original meal-preference source 185 now remains
  complete, unlike the earlier shared-map loss.
- All marked grocery, workshop, cashback and dinner-party bodies remain. Dates
  expose an April purchase against a May question, a March workshop after a
  February question, May 18 versus May 25 last-Thursday references, and an undated Mike
  dinner. These are time-scope/reference conflicts or incomplete dates, not lost
  numeric/source evidence. They do not prove all gold answers are wrong.
- The baking answer still counts an undated apple-pie event using its mention
  context. The sneaker answer reads the later closet statement as only a planned
  move and chooses under-bed storage, despite both dated state sources remaining.
  Date metadata alone does not guarantee event-time or latest-state interpretation.
- Eight changes are interpretation/judging-sensitive: jewelry units, fish/iPad
  clarification, slow-cooker and healthy-meal personalization, museum companion
  ambiguity, historical dilution recall with a correction, and the identical
  New Yorker answer. This is not independent human adjudication or medical advice
  validation. The bus abstention also mixes conflicting assistant/user fare
  estimates; the accepted control itself does not explicitly abstain.

All 500 generation bodies change; 77 final answers are byte-identical to their
controls. Their complete official judge request bodies/bindings also match. One
flips Yes→No: `gpt4_7bc6cf22` still says March 20 and 12 days ago. Preserve every original
label, including this observed judge variability; no selective rejudging, gold
edits, adjusted score or replacement answers.

Actual pinned SillyTavern 1.19.0/Chromium checks pass: **103 browser checks** and
**18 final-prompt scenarios**, including native replies/streaming, time edits,
source/macro integrity, cancellation, budget pressure, repeated packing and source
assembly. The actual assembled completion request contains one sent header and
one explanation, with full source unchanged. LambdaDB and completion endpoints
are local emulators; these are distinct from the 1,000 real OpenAI calls above. Both
host suites finish with 0 emulated collections. No new live LambdaDB metadata write
is claimed; the prior owned 3-document roundtrip covers unchanged storage fields.

The first browser attempt correctly skipped a longer macro-bearing source under
its 250-token budget once time guidance was counted. Its fixture had assumed that
particular source would fit. Preserve that failure log; keep the 250-token budget assertion
and separately verify literal macro delivery under 400 tokens when the whole source
fits. This changes the test setup, not product budgets or source admission.

`npm test`: 373 passed / 0 failed on Node 24.15.0; `npm run check`,
`npm run check:release`, `npm run check:sdk` and CI-style development-tool syntax
checks pass. New fixed tests cover once-per-render guidance, exact native clock
precision, full-label budgeting and benchmark wall clocks without invented UTC.
SDK 0.8.0, release 0.4.0 metadata, API response formats, recent-five/pair, batch 50,
Query1, search parameters and credential behavior are unchanged. Node 20 CI, a new
live host-plus-LambdaDB run, merge, release and deployment are not claimed.

**Decision:** implement the agreed truthful source-time and unified sent policy in
this work branch, without claiming an answer-quality gain or a regression-free
benchmark. Keep the genuine Muir capacity regression and interpretation limits
visible. Future capacity work must use the frozen sent policy in both arms;
do not regain labels by suppressing known dates, tune sources to cases or start
another metadata/provider sweep within this task. Full plans, receipts, failed and
successful host evidence, reviews, verifiers and decisions remain ignored under
`artifacts/sent-date-delivery500-v1`; preserve the immutable archive indexed below.

## Same-policy capacity comparison: 4096 versus 8192

**Decision:** retain the 4096 product default and configuration maximum for now.
8192 repairs a demonstrated source-capacity failure and has a small positive
official-score difference. Do not describe it as ineffective. The gain is not yet
compelling enough to justify increasing generation input by 50% for every request.
Do not tune another budget or change providers within this bounded trial.

The plan was frozen at `7c63cbd0a8e87943e09d11e4c2161e512870242f` before calls.
Both arms use exactly the same `sent` metadata/headers/explanation, current source
assembly, cached actual managed-small Query1/Bayesian English/Jev retrieval,
k100/c100/final50, original chunks/IDs/spans and native prefix/suffix. Only the
selector budget changes. All 500 control prompts reproduce the preceding direct
`sent` prompts byte for byte. This is not a comparison against the earlier sparse
benchmark clocks or a fresh 500-case LambdaDB index/search run.

Both arms regenerate and judge every case in the same run. Adjacent arm jobs
alternate which budget starts first by dataset ordinal, sharing a maximum of six
concurrent calls and the existing rate-header gate. Generator remains Sol-low;
judge remains the exact official task-specific prompt with GPT-4o-2024-08-06,
temperature 0 and 10 output tokens. No model, rubric, gold or source edits,
selective retries or rejudging. All 2000 actual calls finish without retries or
errors in 556,345 ms (about 9 minutes 16 seconds).

| Measure | 4096 | 8192 |
| --- | ---: | ---: |
| Official-protocol correct /500 | 465 (93.0%) | 469 (93.8%) |
| Multi-session /133 | 116 | 117 |
| Temporal /133 | 127 | 126 |
| User recall /70 | 68 | 70 |
| Assistant recall /56 | 54 | 55 |
| Preference /30 | 24 | 25 |
| Knowledge update /78 | 76 | 76 |
| Selected passages | 15184 | 24990 |
| Annotated messages with any delivered source /896 | 882 | 884 |
| Complete annotated original bodies delivered /896 | 876 | 878 |
| Questions with every annotated body complete /479 annotated questions | 459 | 461 |
| Questions without evidence annotations, reported separately | 21 | 21 |
| Selected-memory tokens, median | 4078 | 6576 |
| Actual generation input tokens, total | 2519462 | 3779448 |
| Actual generation input tokens, median | 4967.5 | 7522 |
| Actual generation output tokens, total | 30934 | 30734 |
| Generation provider latency, median /p95 | 2244.5 /5674 ms | 2157.5 /5882 ms |

Input rises **50.01%**, with zero cached input reported in either arm. These are
actual API usage and provider spans, not invoice totals or full SillyTavern turn
latency; the small latency difference does not establish a speed benefit.
The returned 50 passages fit completely within 8192 in 497/500 cases: their full
rendered cost has median 6576, p95 7332 and maximum 8856. No third paid budget arm
or larger search was added. Annotated coverage is a source diagnostic, not the
answer metric or proof that every annotated message is individually necessary.

Interpret these counts using the [memory evaluation criteria](memory-evaluation.md).
Returned-retrieval evidence is fixed in this experiment; the reported annotation
counts measure prompt delivery. Of 896 annotated messages, 4096 has 14 missing,
6 partial and 876 complete; 8192 has 12 missing, 6 partial and 878 complete.
The two additional complete messages demonstrate improved source delivery,
independently of answer labels. Necessary-fact/span recall and conditional answer
accuracy on independently verified sufficient evidence have not been computed.
The earlier question-level counts of 480/500 and 482/500 included 21 unannotated
abstention questions through an empty-set all-complete check. The table now
excludes them: 459/479 and 461/479. This corrects a coverage denominator, not
the 465/500 and 469/500 answer scores or the immutable run receipts. The historical
counts remain available in commit `58c094b`; the archived evidence is unchanged.
The six partial messages per arm still need a source-span audit; the completed
12 changed-label reviews below do not substitute for that audit. Preserve the
original results and budget decision while applying this separation to follow-up
comparisons. The later Voyage comparison completes that six-message component
audit and separately checks two annotated sources retained in native dialogue.

All **12 changed labels (8 gains, 4 losses)** were reviewed against original
questions, reference answers, flagged source messages and both final memories:

- **Muir Woods is a direct capacity repair.** Returned rank 29, source message
  326 (zero-based; displayed header 327), is absent at 4096 and complete with its
  March 10 clock at 8192. The larger arm correctly orders Muir Woods, Big Sur/
  Monterey and Yosemite. The other newly complete annotation is train-fare
  message 137; that answer was already accepted from a duplicate fare source.
- The furniture loss omits the Casper mattress although both arms deliver the
  complete purchase statement. The remaining coffee table, bookshelf and kitchen
  table are counted. This is an answer inclusion/classification issue, not lost
  purchase evidence; mattress taxonomy remains a scope caveat.
- Grocery, workshop, cashback and baking-class changes retain their necessary
  marked evidence. They differ on April versus past-month scope, an attended
  March workshop after a February question, May 18 versus May 25 last-Thursday
  references, or class-to-cake versus class-to-question intervals. These conflicts
  are not resolved merely by adding more source text and do not prove all gold
  answers wrong.
- Four near-equivalent answer pairs receive different labels: camera duration,
  estimated airport-bus savings, a 30-day church interval and historical dilution
  recall with a correction. Album/poster edition scope and commute personalization
  account for the other two changes. These are qualitative interpretation/judging
  sensitivities, not six proven judge mistakes or medical/safety validation.

There are 90 byte-identical final answer pairs and no contradictory labels among
the corresponding identical judge inputs in this run. Near-equivalent comparisons
above are not claims of identical request bytes. The fresh 4096 arm also scores
465 like its predecessor, but five cases gain and five lose under identical
generation requests. That variation and the paired exact McNemar p=0.3877 counsel
against treating the net four labels as established general superiority. All
500 cases are consumed development/regression data, not held-out confirmation;
there is no blinded independent human adjudication or selective label replacement.

Runtime hashes remain unchanged. `npm test`: **373 passed /0 failed** on Node
24.15.0; runtime syntax, all CI-style script/test syntax, release metadata and
SDK bundle checks pass. Offline verification independently reconstructs every
official judge request and binds all 1000 inputs, 2000 responses and source clocks.
No new maintained harness or fixture is needed. Detailed producers/reviews stay
ignored in `artifacts/sent-budget4096-8192-500-v1`.

The product currently clamps both the UI setting and parsed budget to 4096;
8192 was a selector-only experiment. A future configurable 8192 path must raise
that limit and verify final host delivery. The existing quarter-context cap also
requires context of at least 32768 to permit the full 8192 memory budget; host
instructions and recent dialogue still consume their own space. Source checks
and local arithmetic establish these conditions, not a new 8192 host integration
test. No product setting, LambdaDB data, merge, PR, release or deployment changes.

Preserve the frozen time policy for subsequent comparisons. Further retrieval or
reranker-provider work should target source recall/ranking at the fixed input
budget; no such sweep starts here. Full evidence has a verified local-only archive
listed below. Earlier archives and original labels were not removed or rewritten.

## Voyage embedding comparison at the fixed 4096 budget

**Decision:** retain Voyage as a promising retrieval-quality candidate. It recovers
four demonstrated missing necessary sources and repairs Muir Woods delivery
without raising generation input materially. These are useful source-level gains
even though the official answer difference is modest. Product provider/default
adoption remains deferred: this was an external-provider experiment, and the
current [managed-embedding documentation](https://docs.lambdadb.ai/guides/collections/managed-embeddings)
and installed SDK 0.8.0 declare only OpenAI. Product managed embeddings, settings,
native responses/streaming and credentials are unchanged.

The frozen plan at `6f9f896` compares managed `text-embedding-3-small` (1536
dimensions) with [`voyage-4-large`](https://docs.voyageai.com/docs/embeddings)
(native default 1024 dimensions, float output, document/query input types and
truncation disabled). The experimental writer supplies Voyage vectors to an
unmanaged cosine field and replaces only `knn.queryText` with the corresponding
`queryVector`. Original text, IDs, offsets, all 483385 chunks and 10356 original
50-document upsert batches remain. Query1, English Bayesian fusion, Jev 1.13.0,
k100/candidate100/final50, `onFailure:error`, `consistentRead:true`, sent policy,
4096 assembly and native prompt parts remain fixed. This is a native embedding
configuration/path comparison, not a fixed-dimension or identical-backend ablation.

A real two-document Voyage/LambdaDB/Bayesian/Jev probe passes and is deleted.
All 500 source corpora are then indexed, fetch-validated, queried and cleaned up.
The 10856 Voyage calls finish without retries, using 51944689 provider tokens in
1396250 ms (about 23 minutes 16 seconds). Three initial LambdaDB upsert 429s recover
with bounded backoff; there are no final errors or pending owned resources.
All 500 experiment collections plus the probe are verified deleted. Successful
calls have no artificial delay; concurrency is bounded at six.

The source gate reviews every one of the 16 changed annotations (11 gains,
5 losses) and supports the answer phase. All 500 actual Sol-low answers and exact
official GPT-4o-2024-08-06 judgments then finish in 302945 ms, 1000 calls with no
retries/errors. The retained control is the preceding same-sent 4096 arm, not the
older sparse-date 469 baseline. No new small reindex/answer run is claimed.

| Measure | Retained managed small | External Voyage |
| --- | ---: | ---: |
| Any annotated message returned /894 indexed annotations | 884 | 889 |
| Complete annotated body returned /894 | 878 | 885 |
| Any annotated message delivered /894 | 882 | 886 |
| Complete annotated body delivered /894 | 876 | 882 |
| Every indexed annotated body returned, questions /478 | 462 | 469 |
| Every indexed annotated body delivered, questions /478 | 460 | 466 |
| Official-protocol correct /500 | 465 (93.0%) | 468 (93.6%) |
| Selected passages | 15184 | 15928 |
| Generation input tokens, total | 2519462 | 2523135 |
| Generation input tokens, median | 4967.5 | 4981.5 |
| Generation provider latency, median /p95 | 2244.5 /5674 ms | 2399.5 /5819 ms |

The historical denominator of 896 includes two annotated messages intentionally
outside the index: `58ef2f1c:514` and `0e4e4c46:477`. Both are verified verbatim in
the unchanged native recent-dialogue suffix. They are not search failures. This
table reports the 894 indexed annotations across 478 questions. One question has
only a retained annotation; the other also has indexed message 92. The 21
zero-annotation abstention questions are separate. The subsequent Large sent-policy
audit corrects an earlier mistaken subtraction of two questions for two retained
annotations: only one question becomes empty. The mixed question adds one
all-indexed-complete success to both arms. Message counts and answer labels are
unchanged. Historical raw 896/479 counts and original archives remain intact.

All six baseline partial messages were inspected against the question/reference,
original source and returned/delivered spans. Each already contains its needed
component: degree, workshop fee/date, raised amount, GPA, list item 27 and Andy's
shirt. The list ordinal/item crosses a chunk boundary and is preserved by the
span union. All six components also remain with Voyage. Completing workshop/list
bodies adds no missing target fact. These frozen development annotations were
made before inspecting candidate answers, after historical outcomes were known;
they are not blinded/held-out annotations or an all-500 semantic-recall metric.

Source and answer changes support different conclusions:

- **Four prior necessary-source misses recover:** helmet price at returned rank 5,
  age at rank 1, positive high-school experiences at rank 1 and sculpting tools at
  rank 1. All are delivered and their answers become accepted. Age still requires
  a birthday/wedding-date caveat: the answer says 32 or 33 rather than inventing it.
- **Muir Woods moves from returned rank 29 to 7** and fits at 4096. The answer
  correctly supplies the three trips while flagging a Yosemite started/returned
  contradiction. This is a ranking-based budget repair, not added capacity.
- **Five annotated sources worsen.** Solo Data Mining project and Metropolitan
  attendance statements leave final50; the latter produces a real venue-answer
  loss. The project/leadership scope is ambiguous; local saved-vector cosine rank
  150 is diagnostic arithmetic, not observed server rank or an ANN-failure claim.
  Three user preference statements remain returned but miss delivery. Their
  assistant replies still echo 9:30 pm, remote work and quinoa, so direct-user
  provenance loss is not complete absence of those facts. The evening answer
  nevertheless over-clarifies instead of personalizing; the other two labels stay.
- **Alternative sources matter.** ENT and train-fare gains duplicate already
  delivered facts. Sony adds lens detail to an already known camera setup; cousin
  wedding gains direct-user support for an existing assistant echo. Museum message
  95 remains missing, but newly delivered unannotated lecture statements supply
  the sixth venue. The accepted answer retains uncertainty about the first two
  museums' order, so acceptance does not prove full chronological recovery.
- **Answer labels do not isolate retrieval.** All 19 changes (11 gains, 8 losses)
  were source-reviewed. Charity adds a supported unannotated $5000 benefit concert
  to the reference's $3750; rare-item counting adds a vase explicitly called rare,
  though delivered ownership/inheritance is weaker than the answer claims. Keep
  those reference/scope caveats. Near-equivalent workshop, bike, duration, cashback,
  bus and 30-day answers also change labels. A later source audit confirms that
  unannotated message 30 dates Mike's BBQ and is delivered by Voyage, unlike small;
  its dinner-count gain has additional date support, correcting the earlier
  characterization as an entirely undated event.
  Sneakers still show a state-interpretation loss despite both dated bodies being
  delivered. No gold edits, selective reruns/rejudging or adjusted score.

There are 101 byte-identical answer/judge-input pairs and no conflicting labels
among them. Near-equivalent pairs above are not identical-input claims. The paired
exact McNemar p=0.6476 and consumed development cohort preclude treating a net
three labels as independent confirmation. Recall improvement remains observable
without that stronger answer-quality claim; non-contemporaneous baseline and
provider/server-path differences also limit attribution.

Generation input increases only 0.146%, with zero cached input reported, but this
is not a total-cost comparison. The experimental path uses an external embedding
request followed by LambdaDB: measured query-embedding median 214 ms, LambdaDB
query median 609.5 ms, paired serial total median 837.5 ms /p95 1085 ms. These spans
are not native managed-provider or complete host latency. Jev scores 50000
candidates. Provider tokens, index/write work and inference pricing need their own
accounting; cross-tokenizer counts are not invoice dollars or measured storage.

`npm test`: 373 passed /0 failed on Node 24.15.0; runtime syntax, release metadata
and SDK checks pass. Offline verifiers bind all embedding requests/vectors, original
source fields, queries, final rendering, 500 answer inputs and 1000 official
request/response receipts. This is real provider/LambdaDB evidence plus direct
completion replay, not a new full SillyTavern-host run or Node 20 CI result. No
maintained provider code/harness, SDK change, push, PR, merge, release or deployment.

Full scripts, vectors, receipts, component/source reviews and decisions remain
ignored in `artifacts/embedding-voyage500-v1` and
`artifacts/embedding-voyage-answers500-v1`, with verified local-only archives below.
Do not expand to another provider/reranker/depth/budget sweep within this completed
comparison. A product proposal needs a supported managed Voyage path and its
operational/cost contract; do not impose an external embedding key on product users.

## Native OpenAI large under the same sent policy

**Decision:** complete the three-model comparison and retain native OpenAI large
as the leading **managed candidate** for a product model-selection decision. It
improves source delivery at essentially unchanged generation input and does not
require a separate embedding-provider credential/path. This does not establish
universal superiority over Voyage or authorize an automatic default change.
Product managed-small defaults, SDK and runtime remain unchanged.

At revision `8d638fc`, reuse all 500 immutable actual managed-large query receipts
from the earlier trial. Verify each against its retained manifest, original query,
collection configuration, source text/IDs/UTF-16 spans, Bayesian English,
k100/candidate100/final50, Jev 1.13.0 and `consistentRead:true`. Apply the **same
current sent provenance/guidance and 4096-token assembly** used by the small and
Voyage comparison. Independently replay rank-order admission using the cheaper
actual complete layout. No embedding input, query or ranking changes; no new
embedding, upsert, fetch, search or collection is needed. This is saved real
retrieval plus new actual completions, not a fresh retrieval/provider-speed test.

| Measure | Retained small | Current large | Retained Voyage |
| --- | ---: | ---: | ---: |
| Any indexed annotated message returned /894 | 884 | 889 | 889 |
| Complete annotated body returned /894 | 878 | 885 | 885 |
| Any indexed annotated message delivered /894 | 882 | 887 | 886 |
| Complete annotated body delivered /894 | 876 | 883 | 882 |
| Every indexed annotated body returned, questions /478 | 462 | 469 | 469 |
| Every indexed annotated body delivered, questions /478 | 460 | 467 | 466 |
| Official-protocol correct /500 | 465 (93.0%) | 470 (94.0%) | 468 (93.6%) |
| Selected passages | 15184 | 15159 | 15928 |
| Generation input tokens | 2519462 | 2518014 | 2523135 |
| Generation input tokens, median | 4967.5 | 4964.5 | 4981.5 |
| Generation provider latency, median /p95 | 2244.5 /5674 ms | 2606 /6109 ms | 2399.5 /5819 ms |

The corrected indexed-question denominator is **478**, as explained above. Only
`58ef2f1c` has no indexed annotation; `0e4e4c46` also has indexed message 92.
Exclude two retained-only source annotations from search metrics, not two whole
questions. Keep the 21 zero-annotation questions separate. No source-message count,
answer label or original archive is changed by this reporting correction.

All 11 changed source annotations versus small (9 gains, 2 losses) are reviewed:

- **Three necessary-source recoveries:** helmet price, age and positive high-school
  experiences return at rank 3 and are delivered; all three answers are accepted.
  An exact wedding age still requires unknown birthday/wedding dates.
- **Muir Woods:** rank 29 with small becomes 16 with large and fits at 4096.
  The accepted three-trip order is restored; Yosemite started/returned wording
  and overlapping mentions remain interpretation caveats.
- **Additional unannotated evidence:** message 30 explicitly places Mike's BBQ
  two weeks before May 21. It is absent from small's final50 but returned at large
  rank 5 and Voyage rank 3, and delivered in both. The dinner-count gain therefore
  has real date support despite unchanged marked-message coverage. This corrects
  the earlier Voyage interpretation; it is not an oracle added to runtime.
- ENT, train fare and cousin-wedding annotations strengthen direct provenance of
  already delivered facts; workshop/list body completion adds no missing target
  component. The six previously frozen component spans all remain covered in
  large's returned/delivered unions. This is not an all-500 semantic-recall audit.
- **Two direct-user delivery losses:** lemon-poppyseed baking history at rank 27
  and quinoa/roasted-vegetable preference at rank 33 miss the budget. Their
  assistant echoes remain. The baking answer fails to use the poppyseed history;
  meal prep still contains healthy quinoa/roasted-vegetable recipes, so its No
  label does not prove those facts disappeared.

All 500 Sol-low answers and exact official GPT-4o judgments complete in
324792 ms (about 5 minutes 25 seconds), 1000 actual calls, zero retries/errors,
bounded concurrency six and no fixed successful-call waits. Versus current small,
there are **10 gains and 5 losses**; versus Voyage, **9 gains and 7 losses**.
All 38 unique changed cases across those comparisons and historical large are
source-reviewed (15 small, 16 Voyage, 22 historical-large pair differences):

- The historical large tennis-racket and cuttings failures become accepted
  **7-day and 14-day** answers with per-chunk dates. Keyboard/bluegrass and
  ukulele/servicing anchors also resolve. The historical score is 468 versus 470
  now, with 12 gains/10 losses; this is not merely two repaired cases or a
  controlled causal estimate of date metadata.
- **Large and Voyage retain different strengths.** Large keeps Metropolitan
  attendance and the direct 9:30 pm preference that Voyage loses, but its accepted
  Metropolitan answer is still a clarification. Voyage recovers the sculpting-tool
  purchase and alternative Contemporary Art lecture sources that large misses.
  An accepted six-museum answer still has order ambiguity. Neither dominates.
- Charity and rare-item totals depend on additional unannotated events/ownership
  scope. Temporal windows for plants/groceries and jewelry counting units remain
  ambiguous. Website/church intervals, novel counts, cashback, bike advice,
  restaurant-name correction, role-abstention and historical dilution responses
  include near-equivalent answers with different labels. Current large's accepted
  bus estimate is not proof of correct abstention or a confirmed user fare.
  All gold/labels remain intact; no selective regeneration or rejudging.

There are 89 identical answer/judge-input pairs versus small, 92 versus Voyage and
79 versus historical large, with no conflicting labels among identical inputs.
Paired exact McNemar p values are 0.3018, 0.8036 and 0.8318 respectively. The modest
aggregate differences, consumed development cohort and non-contemporaneous
controls do not provide independent superiority confirmation. Source-level gains
remain useful evidence independently of those noisy answer-score differences.

Generation input is 0.057% below small and 0.203% below Voyage, with zero cached
input reported. No new embedding bill or LambdaDB latency is measured; 3072 versus
1536 dimensions describes vectors, not physical index/storage charges. Provider
latencies above are recorded spans, not controlled speed comparisons or full host
latency. Native managed large avoids Voyage's external two-request experiment path.

`npm test`: 373 passed /0 failed on Node 24.15.0. `npm run check`,
`npm run check:release` and `npm run check:sdk` pass. Frozen source/query hashes,
independent admission/rendering, all 500 answer inputs and all 1000 request/response
bindings and official templates pass verification. No new full SillyTavern-host
run, Node 20 CI, source/SDK/default change, push, PR, merge, release or deployment.
The bounded comparison is complete; no further provider/depth/budget run is needed
to close it. Product adoption is a separate model-selection change, not another
diagnostic PR. Detailed evidence remains ignored in
`artifacts/embedding-large-sent500-v1` and
`artifacts/embedding-large-sent-answers500-v1`; the combined verified archive below
is local-only. Earlier source bundles and labels remain immutable.

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
| `sent-date-delivery500-v1.tar.gz` | `f28bc1bcaca48ac34bbe657ef04731c45a8192d652e5dec0ce9884701086c145` |
| `sent-budget4096-8192-500-v1.tar.gz` | `994cd09369a2d50208aec38d3501db833afefaf3468d6d37efd346d07d29550a` |
| `embedding-voyage500-v1.tar.gz` | `94f9296bf35d070daeeba327c02097e94aff0a66e89e47fe24f40c915068a1c7` |
| `embedding-voyage-answers500-v1.tar.gz` | `543314272d33d578305f279a4edfb49413d6ac9ace563d7c1d98d1a8b9964ccf` |
| `embedding-large-sent-comparison500-v1.tar.gz` | `b2da2d42147729b8d99e6eeba2331e4b8cdf68b37d6c7871d0d8e2c721ee605c` |
