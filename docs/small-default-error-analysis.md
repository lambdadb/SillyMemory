# Small-default error analysis

## Current guidance: all 29 original No cases (2026-10-17)

**Decision: retain the current policy and original 471/500 (94.2%) score.**
Reviewing every No in the [adopted guidance / actual-budget run](query1-retrieval-quality.md#supported-answer-generation-guidance-2026-10-17)
does not identify a new missing-fact or delivery-only loss that justifies another
depth/budget/model sweep. The actionable follow-up is narrower: source use,
provenance and appropriate uncertainty in generated answers. This audit adds
**zero API calls**, no runtime change and no replacement labels. It is part of the
same quality workstream, not a separate experiment/PR milestone.

This is the **new guidance, actual 4096-budget** cohort, not the older original-guidance
run that also scored 471, nor the historical 463/500 cohort below. Settings remain
managed Small, Query1, English Bayesian hybrid, k200, native Jev 1.13.0 candidate200,
final50, ranked admission, compact `sent` headers and recent-five/pair retention.
Generation is Sol low; judging is the unchanged original task-specific
GPT-4o-2024-08-06 formatter. Eleven model inputs in the final500 were reused only
because they were byte-identical before judging; `a2f3aa27` is the one reused No.

The subsequent [presentation-order diagnosis](query1-retrieval-quality.md#memory-presentation-order-bounded-diagnosis-2026-10-17)
keeps the selected sources fixed: chronological 29/32 versus relevance-group 28/32,
with no gains and a lost venue candidate. It retains chronological presentation
and does not change the original 500 score or the classification below.

The [minimal-guidance ablation](query1-retrieval-quality.md#minimal-memory-guidance-ablation-2026-10-17)
then scores 81/104 versus 83/104 on a focused set including all 29 No; those 29 score 11/29
in both fresh arms. Fewer follow-ups coexist with lost role qualification and an
accepted arithmetic error. Retain current guidance; this composite ablation does
not isolate the clarification sentence or replace the original 500 score.

The narrower [follow-up-obligation comparison](query1-retrieval-quality.md#follow-up-obligation-only-bounded-comparison-2026-10-17)
keeps personalization/event-role matching: **79/104 versus 82/104**, including
preference 26→29/30 and abstention 28→28/30. All 29 historical No score 9/29 in both
fresh arms. Candidate improves some supported advice but loses a season-versus-series
qualification on a control accepted in both arms. Retain current wording under
the frozen gate; no conditional 396, runtime change or replacement 500 score.

### Primary dispositions

Each question has exactly one primary category. Secondary risks overlap; these
are qualitative observations after seeing answers and labels, not independent
human adjudications or controlled causal estimates.

| Primary disposition | Cases | Meaning |
| --- | ---: | --- |
| Necessary fact absent from returned final50 | **0 identified** | No new concrete missing operand/dependency was established in this 29-case review. This does not prove every unmarked fact was retrieved. |
| Necessary returned fact lost only during delivery | **0 identified** | No necessary-fact loss caused solely by the 4096 allocation was established here. This does not prove the budget is sufficient for every question. |
| Available-evidence response/provenance/alignment risk | **4** | Known information can be used more appropriately; some qualified estimates or clarifications are reasonable in conversation despite failing the rubric. |
| Question/source/reference interpretation or chronology uncertainty | **20** | Counting units, date windows, repeated events, qualifiers, source inconsistencies and state interpretation limit the meaning of the original No. These are not 20 certified reference errors or 20 certified correct model answers. |
| Reference value or personalization elements present, but judge says No | **5** | Three answers explicitly contain 21/12/30 days; one gives the reference 19-day report interval with a qualification; one includes the requested stew/yogurt personalization. These are not five universally correct answers. |
| Total original No | **29** | Original score remains **471/500**. |

Separately, **28 cases have all 58 annotated source-message bodies completely
returned and completely delivered**. One abstention case has no marked positive
source. This is whole-body annotation coverage, **not necessary-fact recall**. The
review also checks surrounding/unmarked dependencies: 91 source witnesses in total,
including Target context, an additional fundraiser, sister/cousin weddings,
assistant fare estimates and research-conference details. Their roles, source
hashes, returned ranks and actual delivered excerpts are retained. Source indices
below are zero-based; rendered prompt message numbers are one higher. Ranks refer
to the actual returned final50, not the hidden candidate200 set.

### Four response risks worth separating from search quality

| Case | Source and actual answer | Interpretation |
| --- | --- | --- |
| `gpt4_59149c78`: art-event venue | User281 names the Metropolitan Museum of Art and a visit on January 15; rank3, fully delivered. The answer asks whether the user means MoMA or a farm retreat, omitting the Metropolitan. | Concrete omission of an available relevant candidate. January 15 is 17 days before the February 1 question, so “two weeks” is approximate; a better response can mention that candidate and qualify the date rather than omit it. |
| `a96c20ee_abs`: undergraduate poster | User177 describes a thesis poster at a first conference; user517 names Harvard as the first conference. Both are delivered. The answer suggests Harvard with a caveat. | The requested undergraduate-course project is not established. Joining related records does not establish the question's project/role qualifier. |
| `09ba9854_abs`: airport savings | The answer computes savings from assistant329's estimated bus/taxi fares and flags user52's conflicting $60 taxi quote. Both are delivered; assistant53's earlier fare estimates are delivered too. | The answer labels estimates, so this is not an unqualified fabricated actual fare. Still, prior assistant estimates cannot establish the user's confirmed cost; the official abstention rubric expects that distinction. |
| `09d032c9`: phone battery | User294's owned power bank is delivered at rank15. The answer acknowledges it but primarily diagnoses battery drain. | Ownership is remembered; the response does not develop advice around using the power bank as the personalization rubric expects. General diagnostic advice remains useful. |

These are four **risks/alignment boundaries**, not four demonstrated implementation
bugs. Existing guidance already addresses supported answers and event/role matching.
Do not add another sentence for every failure, discard all assistant turns, or
force a named benchmark answer. If another intervention is proposed, first state
which distinction it improves and freeze a separate confirmation cohort including
correct-answer and legitimate-clarification controls. Do not launch another 500
merely to improve this consumed cohort's score.

### Other 25 cases

| Case | Primary observation |
| --- | --- |
| `51a45a95`: coupon store | Target is plausible from delivered surrounding Cartwheel/Target discussion, but the redemption statement itself names no store; the answer withholds confirmation. |
| `ec81a493`: limited album | “500 copies” can modify the signed poster or the album; answer and reference choose different referents. |
| `0a995998`: clothes taken out | Two distinct garments versus three accounts/actions; two sources describe the same February 5 boot exchange. |
| `3a704032`: plants | Three recent plants, but the snake plant received “last month” is not securely inside the rolling last 30 days. |
| `dd2973ad`: bedtime before appointment | Appointment and bedtime relative dates resolve to different weeks; the answer does not join them. |
| `gpt4_2f8be40d`: wedding count | Gold three omits an additional sister-wedding mention; cousin August/last-month accounts and repeated names complicate event deduplication/year scope. |
| `88432d0a`: baking count | Repeated Tuesday/Thursday/Saturday reports map to different weeks and contain inconsistent first-time wording. Gold four is not uniquely entailed. Secondary answer defect: says seven, then revises to six. |
| `7024f17c`: exercise time | May 20 jog lies outside last week relative to May 30; the older yoga routine does not fix last-week hours. |
| `gpt4_2ba83207`: grocery spending | Thrive's $150 was “last month” (April), while the question says “past month” ending May 30; answer chooses Walmart. A weekday phrase also conflicts with its session date. |
| `9d25d4e0`: jewelry count | Four individual pieces versus three acquisitions: earrings are a pair. The answer explicitly gives both interpretations. |
| `d851d5ba`: charity total | An additional delivered user report of helping organize a concert that raised over $5000 is absent from the $3750 reference total. Personal versus group credit also matters. |
| `75832dbd`: publications | Answer includes medical imaging but also robotics/RL, supported by a delivered application-style passage. Reference assumes healthcare-only interest. Persona attribution and exclusive preference scope remain uncertain; bibliography accuracy is not adjudicated. |
| `caf03d32`: slow cooker | Answer explicitly uses remembered beef-stew success and yogurt interest, yet gets No. Those rubric elements are present; culinary correctness is outside this audit. |
| `51c32626`: paper submission | February 1 is a general conference deadline, not a confirmed personal submission day. |
| `7405e8b1`: first-order discount | HelloFresh 40% is explicitly a first order; Uber Eats 20% has no first-order qualifier. |
| `9a707b81`: class-to-cake interval | Answer gives the reference **21 days**, then separates it from **26 days** as of the question date; raw original judge returns No. |
| `gpt4_4fc4f797`: suspension feedback-to-test interval | Reference treats a feedback report date and a planned future test as actual event dates. The answer withholds that inferred completed interval. |
| `370a8ff4`: flu-to-jog interval | Source dates January 19→April 10 give **81 days / 11 weeks 4 days**, unlike reference 15 weeks. Both dated sources are delivered. |
| `eac54adc`: website-to-contract | Answer gives reference **19 days** between reports, qualified because “just launched” does not fix the actual launch day; raw judge returns No. |
| `gpt4_7bc6cf22`: New Yorker | Answer directly says **12 days ago**, matching reference 12/13 and March 20→April 1; raw judge request includes that answer and returns No. |
| `71017277`: jewelry giver | Aunt is recalled, but the source object is a chandelier, not the question's jewelry. |
| `0bc8ad93`: museum companion | Source does not specify companions; reference No treats absence of mention as proof of absence. |
| `08f4fc43`: church interval | Answer explicitly gives reference **30 days** between January 2 and February 1; the raw original judge returns No. Source holiday/calendar correctness is not externally checked. |
| `a2f3aa27`: Instagram count | Answer preserves earlier confirmed 1250 versus later unchecked estimate near 1300; reference treats the estimate as the count. |
| `07741c45`: sneakers | Clear earlier under-bed storage versus awkward later closet/rack wording and assistant plan paraphrases. Answer may underweight the later state, but a completed move is not unambiguous. |

### Retained evidence and limits

`artifacts/guidance-default-errors29-v1/` retains the frozen plan, all 500 case/receipt
bindings, 29 full dossiers, manual dispositions, source witnesses and independent
offline verifier. Verification rechecks **all 500 actual generation/judge request
pairs**, original task-specific judge formatting and raw labels, exact final-context
construction, all 29 source mappings and current runtime hashes. Arithmetic checks
confirm 21/19/12/30/81/17-day differences; arithmetic does not establish that a report
time is an event time. No source result, original answer, label or archive was changed.

The new archive is `artifacts/archive/guidance-default-errors29-v1.tar.gz`; its
checksum is in the [parent evidence table](query1-retrieval-quality.md#evidence-and-reproduction).
It is local-only and unavailable in a fresh clone, as are its required
`generation-guidance-paired500-v1` and `small-rerank100-200-k200-sent500-v1` bundles
and the canonical dataset locked in `plan.json`. Full prompts remain ignored.
The verifier validates recorded inputs, not a new live integration run. No new
SillyTavern/browser/provider test was performed for this documentation-only audit.
No adjusted accuracy or “all remaining errors are judge errors” claim is warranted.

## Decision and scope (2026-10-16)

Keep managed Small and the current retrieval/budget policy. Review all **37 original
judge failures** from the latest fresh matched Small run, **463/500 (92.6%)**, before
choosing another optimization. This is an offline diagnosis using retained source,
final returned chunks, actual dispatched context, answers and raw judge receipts.
That initial classification uses **zero new API calls**, no regrading and no
adjusted accuracy claim. The subsequent bounded native retrieval reconstruction
below adds search/indexing observations without new generation or judging.

The subsequent [current-policy Small breadth comparison](query1-retrieval-quality.md#current-policy-small-breadth-comparison-100-versus-200-2026-10-16)
is complete: 466/500 versus 468/500 with fresh paired answers, and all three clear
missing-fact answers recover at 200. It recommends depth 200 as the next Small
profile. The [subsequent SDK/product integration](query1-retrieval-quality.md#product-adoption-of-depth200-2026-10-17)
now implements it on this work branch with an exact pinned dev SDK. The 37 No
cases classified here belong to the earlier 463/500 run and are not the failure set
of that newer comparison. Earlier archived diagnoses remain unchanged.

A later [fixed-k200 rerank comparison](query1-retrieval-quality.md#fixed-k200-rerank-candidate-comparison-2026-10-17)
isolates candidate 100 versus 200: 455/500 versus 471/500, with all three clear
missing dependencies returned, delivered and answered only at 200. It supports
retaining 200 while preserving one cake-personalization regression and judge/target
limits; it does not redefine the original 37-case error cohort below.

The reference uses Query1, managed `text-embedding-3-small`, Bayesian English,
vector k100, native Jev 1.13.0 candidate100/final50, ranked 4096-token memory,
compact `sent` headers and recent-five/pair retention. Benchmark generation is
Sol low; the original task-specific GPT-4o-2024-08-06 judge is unchanged. The product
lets users select their generation model. These results replay frozen host prompts
through actual APIs; they are not a new browser run or observations of installed
users. Ranked assembly/time changes are in the current work branch, and host
context allocation can further constrain the memory budget. This audit does not
establish that the current `main` installation has this entire evaluated behavior.

## Classification

Each question has one primary disposition; secondary caveats can overlap. A
classification describes the observed boundary, not a controlled causal
intervention. In particular, a retrieved message is not automatically sufficient
evidence, and an unmarked message can be necessary.

| Primary disposition | Questions | Interpretation |
| --- | ---: | --- |
| Necessary fact absent from returned final50 | **5** | Four marked-source misses plus one unmarked timing dependency. Age and museum targets also have interpretation caveats. |
| Necessary returned fact lost only during prompt delivery | **0 identified** | No such necessary-fact loss was established in this 37-question review. This is not a claim about every question or budget. |
| Available-evidence response/personalization/provenance choice | **6** | Four preference responses plus two abstention/provenance cases. Some clarifications and conditional estimates are reasonable in conversation despite failing the rubric. |
| Question/source/reference interpretation or chronology conflict | **22** | Date windows, event identity, qualifiers and state updates prevent treating the original label as an unambiguous memory defect. |
| Requested reference value recalled, but judge says No | **4** | Two exact date answers and two historical answers followed by corrections. Correction validity is not adjudicated here. |
| Total original failures | **37** | Original 463/500 score retained. |

Structural annotation coverage gives a different view: **30** failures have all
marked indexed message bodies complete in both returned results and delivered
memory; **4** miss a marked message; **1** has a partial marked body whose necessary
$20 fee is present; **2** abstention questions have no marked positive source.
These counts are not necessary-fact recall or conditional answer accuracy.

All source-message indices below are **zero-based** in the flattened benchmark
history. Prompt labels display one higher. Ranks are one-based positions in the
actual final50 response, not ranks among all 100 rerank inputs. Membership before
final50 is unexposed, so this audit cannot separate per-leg retrieval, Bayesian
fusion and reranker rejection or diagnose ANN approximation.

## Returned retrieval gaps

| Question ID / topic | Observed missing dependency | Interpretation |
| --- | --- | --- |
| `gpt4_d84a3211` / bike spending | User message 117: helmet **$120** absent from final50/context; chain $25 and lights $40 delivered | Answer gives the supported $65 subtotal instead of $185. Clear missing operand. |
| `6e984302` / competition purchase | User message 434 competition setup is rank 2/delivered; user 436 purchased sculpting tools absent | The answer can identify the competition but cannot name the purchase. Cross-message dependency. |
| `ba358f49` / age at Rachel's wedding | Wedding source 59 delivered; user 269 **age 32** absent | Missing age is real; gold 33 still assumes an unspecified birthday/wedding relation. Recovering the fact alone does not guarantee that label. |
| `gpt4_7abb270c` / museum order | Contemporary Art source 95 and alternative user mentions 67/310/432 absent; other five marked museums delivered | The answer substitutes the separately supported Modern Art Gallery visit 276. Missing museum recall is real; repeated undated mentions complicate exact event order. |
| `60159905` / dinner-party count | Marked messages 32/54 complete, but unmarked message 30 says Mike's BBQ was **two weeks ago** and is absent | The answer names three parties but cannot date Mike's. This is a search miss, not a 4096-token packing loss. |

The helmet, sculpting-tools and Mike-date cases give concrete fact/dependency
targets without relying solely on whole-body annotations. Age and museum sources
are useful recall targets but require separate answer-interpretation caveats.

## Live reconstruction of the three clear gaps (2026-10-16)

Rebuild only these three original Small corpora, with the same 2857 document
texts/IDs/spans, original 61 batches of at most 50 documents, English analyzer,
Query1 text, k100, Jev 1.13.0 candidate100 and strong branch reads. Verify every
acked document through strong fetch before searching. Product code, stable SDK
0.8.0, generation and judging remain unchanged. The diagnostic adds five requests
per corpus: original product50, vector100, lexical100, Bayesian100 without Jev,
and Bayesian+Jev100 to expose every returned candidate. Only the diagnostic return
size increases; the product request is still size50.

| Necessary source | Vector top100 | Lexical top100 | Bayesian100 | Jev100 | Product50 |
| --- | --- | --- | --- | --- | --- |
| Helmet $120, user message 117 | Absent | Absent | Absent | Absent | Absent |
| Sculpting-tool purchase, user message 436 | Absent | Absent | Absent | Absent | Absent |
| Mike's two-weeks-ago timing, user message 30 | Absent | Absent | Absent | Absent | Absent |

**All three original misses reproduce.** The Bayesian100 and Jev100 requests return
identical sets of 100 document IDs in each case, without the necessary source.
The helmet and Mike cases also have exactly equal Bayesian scores versus Jev's
`retrievalScore` across all 100. Sculpting has the same 100 IDs but a maximum score
difference of 0.0001112; report this instead of claiming an identical scored trace.
Every product50 ID is in the corresponding Jev100 response, with identical shared
retrieval scores. Jev relevance scores/order vary across the size50/size100 calls
(maximum shared-score differences 0.0305/0.0365/0.049), so these separate calls are
not an in-flight trace or proof of the exact hidden ordering of the original run.
Their candidate membership nevertheless consistently locates the observed gaps
**before Jev ranking**, rather than a 50-result cut or prompt-budget exclusion.

Each target is an intact, single original chunk (252/337/327 UTF-16 positions).
The necessary sentence was not split away or lost during chunk construction.
There is a semantic-linkage hypothesis, distinct from that observed stage:

- Helmet query asks for all bike spending; the missed source discusses a bike
  shop and Bell Zephyr purchase. The returned helmet/date source already names
  that same model, but source linking is not part of independent chunk retrieval.
- Sculpting query refers to an investment for a competition; the returned user message 434
  introduces the competition, while user message 436 names tools without repeating that
  competition or the word investment.
- Dinner query asks for parties in a time window; returned user message 32 names Mike's
  BBQ without its date, while user message 30 frames the dated BBQ as recipe/theme advice.

These explain why context linking is worth considering, not why a particular
embedding score must occur or proof that linking fixes the full cohort. Both
single legs also miss the facts, so a Bayesian-only weighting diagnosis is
insufficient. No ANN error is established. Earlier depth 200 trials already showed
source recoveries and a small aggregate gain; the user-requested follow-up now
compares breadth under the current common clock/assembly policy, as linked above.
That completed comparison supports a depth 200 profile before introducing a more
complex source-linking mechanism. Whole-preceding-message augmentation remains
rejected by its full regression; no source-linking transformation is selected.

The first no-Jev Bayesian diagnostic omitted top-level `candidateSize`; the server
returned 400 requiring `size <= candidateSize <= 1000`. The original product request
succeeded. Preserve that failed attempt, explicitly set diagnostic
`candidateSize:100`, and rebuild once. Across both invocations: 3829 actually upserted
documents in 82 batches, 167 wire attempts, 18 successful queries plus that one 400,
7 Jev calls / 700 scored documents, 40 strong verification fetches, and 55.06 seconds
of invocation time. No transient retries or generation/judge calls occurred.
All four owned collections, including the recovery corpus, have confirmed 404
cleanup. Failure staging is recovered from the original HTTP receipt; the first
harness's outer error misleadingly recorded cleanup as the active stage.

Using the existing frozen 2026-10-16 USD rate card, before allowances, the partial
arithmetic is $0.004117 writes, $0.008707 source-embedding text-token proxy,
$0.0000108 successful query-embedding proxy, $0.000180 query read minima and
$0.000400 verification read minima. Actual native Jev LIU, physical storage,
metadata-call billing and failed-request billing are unavailable, not zero.
This is evaluation/reconstruction overhead, including recovery, not a total bill
or a three-chat-turn operating-cost estimate. Product request transport spans
range 715–873 ms across four observations including recovery; they are not a
representative latency comparison, generation latency or browser end-to-end time.

`node artifacts/small-retrieval-stage3-v1/verify-wire.mjs` and
`python3 artifacts/small-retrieval-stage3-v1/verify.py` pass all 15 stage-request
wire bindings, source/target checks, candidate sets, unchanged runtime hashes,
cleanup and cost arithmetic. These are local receipt validations of the actual
API run, not unit or browser tests.

The plan, exact requests/responses, source checks, stage/candidate/score comparison,
initial failure, cost ledger and producers are retained under ignored
`artifacts/small-retrieval-stage3-v1`, with its own immutable local archive in the
parent evidence index. Original benchmark answers, 463/500 score and earlier
archives remain unchanged. No new PR or product/default change accompanies this
diagnosis.

## Available-evidence response choices

| Question ID / topic | Evidence and response | Product relevance |
| --- | --- | --- |
| `09d032c9` / phone battery | Power-bank ownership is rank 8/delivered and acknowledged; answer emphasizes generic battery advice | Personalization/rubric fit, not retrieval failure. Generic advice may still be useful. |
| `32260d93` / viewing recommendation | Netflix storytelling stand-up preference is rank 7/delivered; answer asks for a genre instead of recommending something | Broad requests can permit a tentative useful answer before an optional question. |
| `75832dbd` / publications or conferences | Medical-imaging interest is rank 18/delivered; answer asks which of three fields to target | No publication/conference is offered. Multiple interests make clarification defensible, but it fails this task. |
| `caf03d32` / slow cooker | Beef-stew/yogurt sources delivered; recent native dialogue covers cashew-yogurt straining; answer asks which problem | Useful diagnostic follow-up in conversation, but no immediate practical advice. Do not call this a missing memory. |
| `a96c20ee_abs` / undergraduate poster | Delivered thesis-poster source 177 and first-conference-at-Harvard source 517 are joined into an answer about an undergraduate-course poster | Unsupported qualifier/entity linkage. A related positive memory does not establish the requested event. |
| `09ba9854_abs` / airport savings | User taxi quote $60 and assistant-estimated bus $10-$20 both delivered, alongside conflicting later route estimates | Answer explicitly conditions $40-$50 savings, yet leads with an estimate not established for the actual trip. Preserve user facts versus assistant estimates and route qualifiers. |

The four preference labels are not four demonstrated retrieval defects. Nor does
this review justify removing natural clarification guidance: three responses are
clarification-only, and at least the slow-cooker follow-up fits recent conversation.
Any future response-policy change must preserve useful clarification and abstention
controls, not simply force confident answers for a higher benchmark score.

## Interpretation and reference uncertainty

These **22** cases retain their original No labels. This table does not declare
them all correct or the benchmark invalid; it identifies why a unique product fix
cannot be inferred from the label alone. All listed marked facts are delivered.

| Question ID / topic | Source-bound interpretation |
| --- | --- |
| `031748ae_abs` / initial engineering team | Four initially, five later, Senior Software Engineer title all delivered/repeated. Gold abstains over the question's Manager title; answer notes that mismatch. Intent/role boundary. |
| `07741c45` / old sneakers | Both under-bed and awkward later closet/shoe-rack wording delivered. Gold reads a current location; answer reads an unconfirmed plan. State interpretation. |
| `0a995998` / clothing pickups | Blazer plus two mentions of the same Zara boot exchange delivered. Answer counts two distinct items; gold 3 appears to count mentions/actions. |
| `0bc8ad93` / museum companion | Source states a lecture visit, not companion status. Answer says unknown; gold says no friend. Absence of mention is not proof of being alone. |
| `15745da0` / camera collection | May 21 source says three months; answer repeats it and adds nine days by May 30. Reference retains only three months. |
| `370a8ff4` / flu-to-tenth-jog interval | Jan 19 and Apr 10 `today` anchors delivered. Independent difference **81 days = 11 weeks 4 days**, matching the answer, versus gold 15 weeks. |
| `37f165cf` / novel pages | Both 440/416 operands repeated, but source does not link them to January/March. Answer requests that attribution instead of asserting 856. |
| `3a704032` / plants | Two May purchases plus an April gift delivered; no gift day fixes the rolling/calendar window. Gold 3 silently chooses a window. |
| `51c32626` / paper submission | ACL paper submission and general Feb 1 deadline delivered. Deadline day is not necessarily the user's submission day. |
| `6d550036` / led projects | Marked sources delivered plus current feature/team and past completed project. Leadership versus completion/participation and distinct-project scope are uncertain. Answer 3 versus gold 2. |
| `7024f17c` / last-week exercise | 30-minute jog sent May 20, outside May 22–28 at May 30 question; yoga source is historical/slacking. Answer declines last-week total; gold 0.5 hours ignores that clock/window. |
| `71017277` / jewelry giver | Source says aunt's **chandelier**, not jewelry. Answer gives aunt and checks the object mismatch; gold ignores it. |
| `7405e8b1` / first-order discounts | 40% HelloFresh first order and 20% UberEats order delivered/compared; UberEats **first-order** qualifier unconfirmed. |
| `852ce960` / mortgage approval | Original $350000 and later retrospective $400000 both delivered/repeated. Answer prioritizes original and flags conflict; gold prioritizes latest. State-resolution policy, not recall. |
| `88432d0a` / baking count | All marked events plus repeated Tuesday/Thursday/Saturday accounts delivered with different session clocks. Answer seven possible occasions versus gold 4; event identity is not settled by text-overlap removal. |
| `dd2973ad` / bedtime before appointment | May 24 'last Thursday' anchors appointment May 18; May 29 'last Wednesday' anchors bedtime May 24. Answer refuses cross-week join; gold 2 AM ignores incompatible dates. |
| `eac54adc` / website launch interval | Answer gives 19 days between Feb 10 report and Mar 1 contract, but warns 'just launched' does not fix an exact launch date. Gold assumes sent date equals event date. |
| `ec81a493` / album copies | 500 copies repeated; ambiguous 'which' can attach to poster or debut album. Answer chooses poster, gold album. |
| `gpt4_2ba83207` / grocery spending | All amounts delivered. Thrive $150 is 'last month' in May 26 source; answer chooses Walmart $120 within its window. No exact April day fixes the rolling-window interpretation. |
| `gpt4_2f8be40d` / wedding count | All three marked weddings plus an unmarked sister's wedding and another cousin mention delivered. Answer counts four/asks about a duplicate; gold 3 omits additional support. |
| `gpt4_59149c78` / art event | Metropolitan Jan 15 source is delivered; Feb 1 question is 17 days later, approximately rather than exactly two weeks. Answer asks Metropolitan versus MoMA. |
| `gpt4_731e37d7` / workshop total | Partial source 211 still delivers $20; $200/$500 also delivered. Answer sums $720 then flags future Mar 15–16 in the Feb 26 history and unknown January fee. No missing necessary price. |

Do not rewrite send times as event dates to repair these labels. Different session
clocks attached to repeated stories can create apparent new events; automatic
deduplication or latest-statement overrides can also erase real repeated events,
plans or corrections. Resolve these semantics before testing such a transformation.

## Reference values rejected by the saved judge

| Question ID | Saved answer and raw judgment |
| --- | --- |
| `08f4fc43` | **30 days**, Jan 2–Feb 1, exactly reference value; raw `No.`. |
| `gpt4_7bc6cf22` | **12 days ago**, March 20–April 1, exactly reference value; raw `No.`. |
| `65240037` | Explicitly recalls historical **1:10**, then gives a different present safety recommendation; raw `No.`. The medical claim is not evaluated here. |
| `c4f10528` | Names **Miss Bee Providore**, then corrects its location; raw `No.`. The external location claim is not evaluated here. |

Exact stored judge requests include the inspected question/reference/answer, and
raw response bodies confirm the No labels. This rules out a label-parser mismatch
for these examples; it does not identify why the judge rejected them. Keep their
labels and the official-protocol score unchanged, rather than selectively retrying,
rejudging, suppressing corrections or inventing a revised headline score.

## Next product decision

1. Adopt Small, Query1, k200/candidate200/final50, 4096 memory and recent-
   five/pair retention in the work branch. The completed paired breadth comparison
   supports this coverage-led decision; an explicitly authorized, exact pinned dev
   SDK removes the stable SDK candidate100 limit. No embedding/budget change or
   merge/release is implied.
2. The **helmet price, sculpting purchase and Mike's date** are now returned,
   delivered and correctly answered in the 200 arm of that comparison. Use this
   direct candidate-breadth result before a more complex source-linking design.
   Whole-cohort regression, cost and interpretation limits remain part of the
   decision; ANN approximation is still unproven.
3. Treat useful personalization, unsupported joins and fact-versus-estimate
   handling as a separate response-policy question. Preserve legitimate follow-up
   questions, uncertain dates and safe corrections. Do not optimize all 37 labels as
   though every one represented a missing fact.

This is the completed diagnosis for the existing parent quality decision, not a
new experiment or PR milestone. The original diagnosis changed no runtime setting, harness, dependency or judge.
The subsequent breadth comparison and explicitly authorized product adoption are
recorded separately in the parent report; their current k200/candidate200 default
does not rewrite this original 37-case cohort.

## Verification and retained evidence

`python3 artifacts/small-default-error-audit-v1/verify.py` passes: the exact 37 No
cases exhaust the fresh Small 500 failures; 185 original case/input/query/memory/judge
file hashes and 37 answer receipts match the immutable parent archive manifest;
dispatched memory plus recent messages match saved completion requests; source IDs/text/UTF-16 spans and returned/delivered annotation coverage
are checked against original documents. Thirteen explicit source-fact stage checks
and five independent calendar calculations pass. Original answer/generator/judge
bindings and original archive checksum remain intact.

The one-off audit producers, full 37 source/prompt/answer/judge dossiers, individual
reviews, locks and verifier are ignored under `artifacts/small-default-error-audit-v1`.
They are preserved in the checksummed local-only archive listed in the parent
[report's evidence index](query1-retrieval-quality.md#evidence-and-reproduction).
The parent matched-run archive and licensed canonical dataset remain explicit
dependencies; these are not fresh-clone CI fixtures or uploaded artifacts.

The original matched-run archive remains unchanged:
`embedding-small-large-matched500-v1.tar.gz`, SHA256
`f5e572d54934e08056bb5bd86eedd85204baa2427de0aeb13f958a7128ec2fe2`.
No source, answer, label, historical score or original evidence was removed.

The initial classification is coding-agent qualitative review after seeing
outcomes, not independent human adjudication or held-out confirmation. The unchanged runtime's 373 passing
tests were recorded with the preceding run; they were not rerun for this
documentation-only change. The native stage reconstruction is live API evidence,
not a new browser-host run, answer-quality comparison or general performance
measurement.
