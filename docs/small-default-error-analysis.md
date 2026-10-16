# Small-default error analysis

## Decision and scope (2026-10-16)

Keep managed Small and the current retrieval/budget policy. Review all **37 original
judge failures** from the latest fresh matched Small run, **463/500 (92.6%)**, before
choosing another optimization. This is an offline diagnosis using retained source,
final returned chunks, actual dispatched context, answers and raw judge receipts.
There are **zero new API calls**, no regrading and no adjusted accuracy claim.

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

1. Keep Small, Query1, k100/candidate100/final50, 4096 memory and recent-five/pair
   retention. This audit does not justify another embedding change, a wider default
   or a larger budget. Earlier depth/budget regressions remain relevant.
2. Prioritize the demonstrated **missing facts and cross-message dependencies**:
   helmet price, sculpting purchase and Mike's date. Any search/data change needs a
   general source-based explanation and a frozen comparison, not gold-specific
   rules or indiscriminate preceding-message augmentation, which already regressed.
   Unexposed candidates prevent assigning the loss to ANN, fusion or Jev today.
3. Treat useful personalization, unsupported joins and fact-versus-estimate
   handling as a separate response-policy question. Preserve legitimate follow-up
   questions, uncertain dates and safe corrections. Do not optimize all 37 labels as
   though every one represented a missing fact.

This is the completed diagnosis for the existing parent quality decision, not a
new experiment or PR milestone. No runtime setting, harness, dependency or judge
changes accompany it. Further paid intervention/confirmation is not part of this
offline classification.

## Verification and retained evidence

`python3 artifacts/small-default-error-audit-v1/verify.py` passes: the exact 37 No
cases exhaust the fresh Small 500 failures; 185 original case/input/query/memory/judge
file hashes and 37 answer receipts match the immutable parent archive manifest; dispatched memory plus recent messages match saved completion
requests; source IDs/text/UTF-16 spans and returned/delivered annotation coverage
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

This is coding-agent qualitative review after seeing outcomes, not independent
human adjudication or held-out confirmation. The unchanged runtime's 373 passing
tests were recorded with the preceding run; they were not rerun for this
documentation-only audit. No new browser-host validation or provider performance
measurement is claimed.
