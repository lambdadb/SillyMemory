# Context-aware retrieval query comparison

**Reject unconditional recent-dialogue concatenation; do not add an always-on
LLM query rewriter.** B answers all 18 questions, but its only baseline gain uses
an unchanged question. Two additional actual answers without rewriting also
succeed. Keep the current Bayesian+Jev, 1,600-token budget and retrieval policy.
This is a completed evaluation, not a production query-policy change.

## Two concrete candidates and the control

All methods use the same frozen histories, questions, current chunking, managed
embedding model, Bayesian English search and Jev reranker. Gold answers and
source labels never enter retrieval or generation input.

| Method | Query construction | Retrieval/extra calls |
| --- | --- | --- |
| Current baseline | Current user question plus the existing eligible prior-turn query; each independently reranked, then interleaved. | Up to two 30-candidate searches. |
| A: structured context | Explicit current question plus role-labeled last four non-system textual turns, at most 600 context tokens. Preserve whole turns; skip oversized turns rather than truncate code. | One 30-candidate search and one rerank of that query. |
| B: constrained rewrite | Give the same recent turns and question to Sol. Independent questions stay byte-identical. Resolve implicit references only with exact quoted recent-turn references; unresolved ambiguity stays original. | One 30-candidate search plus one additional Sol call per question. |

A uses the same constructed query for embedding, lexical search and reranking.
B does likewise with its validated output. Its prototype validates JSON shape,
quoted provenance, question/date/number constraints and the shared query limits
(600 tokens, 8,192 bytes); invalid output falls back explicitly to the original.
These guards do not prove semantic faithfulness: all actual rewrites are manually
audited for intent, entity, negation, scope, time and uncertainty. No tuning or
quality retry follows an observed answer. There are zero invalid fallbacks here.
This tests query construction and search-count changes together; it does not
compare globally reranking the baseline's union of up to 60 candidates.

## Frozen cohorts and all results

The external cohort reuses all twelve questions from
[current-baseline failure discovery](current-baseline-failure-discovery.md),
including its six previously preflight-only questions. It is development data,
not a new unseen benchmark. Six separately authored synthetic histories are
frozen before paid calls: anniversary-place reference, pet reference, seven-source
counting under irrelevant prior-topic pressure, explicit topic switch, unresolved
trip reference and quoted malicious instructions. They share boilerplate and are
not statistically independent representative chats.

| Cohort | Baseline | A | B |
| --- | ---: | ---: | ---: |
| External development, 12 | 12/12 | 11/12 | 12/12 |
| Frozen synthetic controls, 6 | 5/6 | 6/6 | 6/6 |
| Total | **17/18** | **17/18** | **18/18** |

These are assistant semantic audits of complete answers against frozen criteria,
original sources and delivered prompts, not official LongMemEval scores or
independent human judgments. Missing a requested fact fails; ambiguous questions
require clarification or qualified alternatives. All abstention, topic-switch
and quoted-instruction controls pass. No multilingual quality claim is made.

The original plan compared a selected candidate on the synthetic set. Before any
synthetic retrieval/provider calls, a separately retained schedule addendum fixes
both candidates on all six already frozen controls: the twelve self-contained
external questions do not exercise reference resolution. No cases/settings or
completed answers change. Both candidates are evaluated on the entire cohort;
there is no untouched post-selection adoption holdout.

### A loses a necessary source before injection

For kitchen replacements (`gpt4_ab202e7f`), A incorporates unrelated recent
certification/data-science discussion. The explicit worn-out kitchen-mat
replacement in **zero-based source message 106** is absent from all 30 A hits.
Baseline/B retrieve it at primary rank 5 and answer five items; A omits the mat
and answers four. This is retrieval loss, not budget eviction.

All five dataset-labeled sources still reach A's prompt. Source 100 says the mat
is new but does not explicitly establish replacement; unflagged source 106 does.
Evidence labels are therefore useful checks, not an exhaustive correctness oracle.
The earlier source-coverage ceiling must not be interpreted as proof that every
answer dependency was delivered.

### The gain does not require rewriting

The synthetic seven-category counting question is already self-contained. B
returns it unchanged. Baseline delivers five category counts (14 known items),
losing charcoal (4) and pastel (5) under contextual-result budget competition.
A/B deliver all seven and correctly total 23. This supports avoiding unrelated
context competition; it is not evidence that the rewriter improved the query.

B emits 15 unchanged questions, two resolved references and one unresolved
ambiguous question retained unchanged. Both resolved follow-ups are already
correct under baseline and A. All eighteen accepted outputs preserve intent in
this audit; accepting exact quotes alone would not establish this in general.

For attribution, offline packing of captured current-question-only results gives
exactly B's query and final memory for **16/18** cases. This reuses sixteen existing
B answers as identical-prompt observations, not sixteen newly generated answers.
For the other two resolved follow-ups, the original query already selects the
required source. A bounded post-comparison diagnostic generates those two answers
without rewriting: both are correct (Vesper House/Larkhaven and Pip/Calmarel).
The two are selected by query/prompt inequivalence, not by answer failure.

There is thus no demonstrated answer benefit from always calling Sol to rewrite.
This post-hoc attribution is not an independently evaluated eighteen-case third
arm or proof that current-question-only retrieval is universally sufficient.
Crowded referents and genuine context-dependent retrieval remain unestablished.

### Historical failure and interpretation correction

The previous writing-piece failure now answers 23 in all three methods at 1,600.
Fresh deployed rankings differ and now deliver the necessary challenge source;
code/settings/source remain unchanged. Do not attribute this baseline recovery to
A/B or claim a diagnosed ANN/reranker cause. The earlier failed prompt and
same-ranking 3,200-token repair remain valid preserved observations.

Full-source inspection also finds 5K message 485 (zero-based 484), which explicitly
reports a new run beating the previous record. It was delivered in both the old
baseline and all new prompts. Withdraw the earlier missing-new-run/ambiguity
explanation; preserve the approximate timing qualification, targets, all scores,
frozen criteria and original audit/archive bytes. This is a factual interpretation
correction, not post-answer relabeling to improve a candidate score.

## Execution, validation and retention

Producer base: `13a27f7713b9a5ce66fb4f3c15ab66ab1ca4a770`.
Same LongMemEval source/license lock and adaptation as failure discovery.
SillyTavern 1.19.0: `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
Stable SDK 0.8.0; managed `text-embedding-3-small`; raw English Bayesian plus
Typesafe `jev-1.13.0`, k/size/candidateSize 30, `onFailure='error'`, strict identity,
owner/scope/branch filtering and consistent reads. Recent 12, boundary-aware
800-character chunks and 1,600 memory tokens remain fixed. Native synthetic
messages use valid UTC metadata; imported dates do not invent timezone metadata.

Actual answers use SillyTavern with `gpt-6.1-sol`, low reasoning, 4,096 output and
32,768 context tokens; rewrite uses actual host `generateRaw`, low/1,024 output.
The original environment file stays unchanged; explicit `SM_MODEL` overrides its
unrelated mini setting. No key is copied or persisted. Original SDK corpus
readbacks/rankings are source-validated and replayed into the actual host's
unchanged selector. Full quality-corpus retrieval is deployed Node SDK traffic,
not live browser querying that corpus. Separate setup exercises real browser
direct CORS, authentication and owned-data lifecycle; transport continues the
browser request rather than replacing it with a Node proxy response.

- Main comparison: 54 actual answers. Attribution: two actual answers. Rewrite:
  18 actual calls. Three READY checks: **77 successful provider attempts**, zero
  retries, with 15-second start spacing. Quality usage: 204,495 input / 2,025
  output tokens; rewrite: 9,072 / 864. READY and managed embedding/reranking usage
  are separate. Operational spacing is not measured product latency or a billing
  estimate.
- Three actual-host fixture runs mirror these 77 calls with **zero OpenAI calls**.
  Fixtures validate plumbing/source/prompt constraints, not answer quality.
- Across all six host runs and the eighteen corpus collections: 11,995 documents,
  68 queries, **30 owned collections**, all deletion/404 verified; no read/upsert
  retries. Final bounds remain 13,500 documents, 96 queries, 32 collections,
  80 provider attempts, eight transient retries. Schedule and diagnostic addenda
  preserve original plans and carry prior-phase usage rather than reset budgets.
- Unchanged unit suite: `npm test` (Node 24.15.0) and
  `npx --yes --package=node@20.12.0 node --test tests/*.test.js`: **325/325 each**.
  `npm run check`, `npm run check:release`, `npm run check:sdk` pass. No new live
  isolation/recovery suite or integrated production rewrite lifecycle is claimed.

Full frozen inputs/settings, original/addendum plans, all ranks, prompts, answers,
rewrites, supplementary correction, scripts/base tree, usage, validation and cleanup
are preserved in the verified local-only [evidence archive](evidence-retention.md#context-aware-query-comparison).
No one-off harness, raw report or large fixture enters Git/CI. Runtime, defaults,
instructions, API-key handling, releases and deployments remain unchanged.

The useful next product question is conditional context use that avoids unrelated
budget competition while preserving genuinely dependent references. This result
rejects blind concatenation and does not justify paying for unconditional rewriting;
it is not permission to ship a new universal query policy from this small cohort.

## Lower-cost rewrite model comparison

**Luna `none` is a useful query-text candidate, but neither Luna setting fully
preserves B's output contract.** Keep the product unchanged. Lower model cost
does not establish that always-on rewriting is needed or justify adopting B.

Reuse all eighteen exposed inputs, byte-identical system/user messages and the
1,024 output cap. Compare fresh `gpt-6.1-sol`/low, `gpt-6-luna`/none and
`gpt-6-luna`/low through actual SillyTavern `generateRaw`. Rotate arm order per
case. Answer generation remains Sol/low/4,096. No prompt, scoring, cohort or model
sweep is performed after observing outputs. All 54 successful rewrites are audited
for original-question preservation, entity/negation/event scope, quoted grounding,
uncertainty and output mode; schema acceptance alone does not prove faithfulness.

| Rewrite arm, 18 calls each | Query scope and provenance | Correct mode | Full contract | Median complete call | Standard token-cost estimate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sol low | 18/18 | 18/18 | 18/18 | 8.67 s | $0.026534 |
| Luna none | 18/18 | 16/18 | 16/18 | 2.14 s | $0.001338 |
| Luna low | 17/18 | 16/18 | 15/18 | 2.63 s | $0.001962 |

These are **rewrite-contract counts, not final-answer accuracy**. Latency excludes
all artificial 15-second pacing, includes known HTTP/retry delays within the
completed logical call, and measures complete response delivery, not just model
inference or first token. One sample per case, serialized local traffic and a
mid-run continuation do not establish product/tail latency or general reliability.
Luna none is about four times faster at the observed median and about twenty
times cheaper for these completed rewrites; neither ratio is a service guarantee.

All arms use 9,072 input tokens with zero cached tokens. Output usage, including
reasoning: Sol 839 (15 reasoning), Luna none 861 (zero reasoning), Luna low 2,110
(1,182 reasoning). Arithmetic uses current Standard uncached input/output rates:
Sol $2/$10 and Luna $0.10/$0.50 per million tokens. It excludes READY, failed/unknown
attempt charges, final answers and managed embedding/reranking; this is not an
invoice. Sources: [Sol specifications](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
and [Luna specifications](https://developers.openai.com/api/docs/models/gpt-6-luna).
Luna supports both `none` and `low`; availability was verified without substitution.

### Concrete quality differences

- French-press ratio (`6071bd76`): both Luna settings call a self-contained question
  `ambiguous`. The recent dialogue does not supply the historical answer.
  The question names the object and asks a clear comparison; missing answer
  evidence is not an unresolved referent. Search text remains identical.
- Morning preparation plus commute (`1192316e`): Luna none makes the same mode
  error; search text remains identical.
- Quoted-instruction control: Luna low incorrectly returns `ambiguous`, but preserves
  the original aquarium question and does not follow the quoted malicious query.
  This is a classification error, not an observed instruction-injection success.
- Anniversary: Luna low returns `Where was Mira and Leon’s anniversary restaurant?`,
  dropping the **tenth** anniversary qualifier. It cites only turn 93, whose quote
  contains neither name; the names and event ordinal come from uncited turn 92.
  The numeric/quote-presence checks accept this output. The manual scope/provenance
  gate rejects it, without paying for a downstream test of that rejected query.
- Luna none keeps Mira/Leon and the tenth anniversary and quotes both relevant
  turns. Both Luna settings correctly resolve Pip rather than Moss, and all arms
  leave the genuinely ambiguous two-trip question unresolved.

If the application consumes only `query`, mode mistakes do not change those
search requests. They still violate the specified contract and make `mode`
unfit for an unvalidated conditional-search or clarification decision. Thus a
query-text-only result must not be presented as full Sol equivalence. Increasing
reasoning to low did not remove these problems in this fixed comparison.

### Changed-query validation and complete execution record

Seventeen queries per Luna arm are byte-identical to previous B; their existing
source/prompt/answer observations are reused, not regenerated as new Luna answers.
The only faithful changed query is Luna-none's anniversary query. Upsert/readback
of the synthetic corpus and fresh deployed managed Bayesian+Jev searches validate
both that query and the previous-B control. Both deliver the required source.
Actual host source/branch/passage/time/budget assertions pass, and one actual Sol
answer returns Vesper House in Larkhaven. This is **one new final answer**, not a
new eighteen-case end-to-end quality score. The rejected Luna-low query has no
new answer observation.

Original run completes 35 rewrites, encounters a connection `ETIMEDOUT` before any
HTTP response/output, and exits with a failed report but successful cleanup. A
separate continuation retains that unknown/potentially charged attempt, verifies
model availability again, resubmits that unobserved sample once and completes the
nineteen remaining outputs. Completed 35 outputs are never repeated. The original
failure, protocol and separately declared transport continuation remain intact;
no quality retry or post-answer source/setting change occurs. Sol also returns
HTTP500 once; the original same-body transient policy retries it successfully.

Totals: **60 actual provider attempts**, 54 successful rewrites, one final answer,
three READY checks, one failed HTTP500 attempt and one unknown connection attempt.
Two fixture runs make 57 simulated responses and **zero OpenAI calls**. All runs
restore Sol/settings and verify absence of real keys from persisted host settings.
Remote totals, including fixtures/setup: 88 documents, 13 query attempts and eight
owned collections, all deletion/404 verified. One existing UI setup503 retry makes
query attempts 13 rather than the planned 12; the corpus-only guard did not include
setup retry traffic. Record this one-request bound deviation and stop. The 64
provider-attempt, 5,000-document and ten-collection bounds hold; no further queries
or cohort expansion occurs. No production/resource-limit behavior changes.

Final unchanged unit suites pass 325/325 on Node 24.15.0 and 20.12.0;
`npm run check`, `npm run check:release`, `npm run check:sdk` pass.
All one-off JavaScript passes `node --check`; runtime is byte-identical to 13a27f7.
No new unit, isolation/recovery or deployment coverage is claimed. Original inputs,
plans/addenda, full responses, input/source identity, semantic audit, successful
and failed attempts, usage/cleanup and one-off producers are in the separate
[verified local archive](evidence-retention.md#lower-cost-rewrite-model-comparison).
No temporary model-routing code, large fixture or new framework enters Git.

## Expanded contextual-query quality comparison

**Keep always-on B and Luna-none out of the defaults.** The new cohort does not
show a downstream answer-quality gain from rewriting. Luna-none leaves thirteen
of twenty-five clearly identified references unresolved, so this prompt/model/
effort is not equivalent to Sol as a referent resolver. That is an observed query
writing limitation, not a demonstrated final-answer regression or a claim about
other Luna efforts/prompts.

Run forty new synthetic English cases on 2026-10-08 (Asia/Seoul), five per type:
missing referent, competing entities, return after an aside, updated state,
qualifiers/calculation, actual ambiguity, quoted instructions, independent question.
Freeze questions, source facts, targets and mode expectations before model responses;
no prompt tuning, model sweep, additional favorable cases or rerun of wrong answers.
All cases have eighty older turns and four recent turns, with seventy-three indexed
documents. Each corpus includes fixed competing notes. These small constructed
corpora test query fidelity and controls; they do not represent dense long-history
retrieval or a public character-chat benchmark.

Compare **single current-question search**, B/Sol-low and B/Luna-none. This control
is separate from the current product's two-query/interleaving behavior. B receives
the exact earlier conservative system prompt and bounded role-labeled last four
turns (whole turns, 600 context tokens, 1,024 output cap). The answer model remains
`gpt-6.1-sol`/low/4,096 with a 32,768 host context. Retrieval remains SDK 0.8.0,
managed `text-embedding-3-small`, raw English Bayesian + `jev-1.13.0`, 30 candidates,
strict reranker identity/`onFailure: error`, consistent reads, boundary chunks of
800 characters, recent twelve and the unchanged 1,600-token packed selector.

### Results and interpretation

| Observation | Current question only | B / Sol low | B / Luna none |
| --- | ---: | ---: | ---: |
| Factual targets answered correctly | 35/35 | 35/35 | 35/35 |
| Factual cases with sufficient retrieved support | 35/35 | 35/35 | 35/35 |
| Factual cases with sufficient injected support | 35/35 | 35/35 | 35/35 |
| Ambiguous cases meeting clarification criterion | 5/5 | 5/5 | 5/5 |
| Correct first-sample mode | n/a | 38/40 | 25/40 |
| Clear references actually resolved | n/a | 25/25 | 12/25 |
| Correct mode in additional rewrite samples | n/a | 8/8 | 4/8 |

Clarification success means asking which target or explicitly distinguishing
alternatives rather than selecting an unqualified target. It is not exact factual
answer accuracy. In `ambiguity-5`, the intended bridge inspection was absent from
all three retrieved/injected sets; the other two intended facts were present.
Recent turns say only "an inspection, a drill and a rehearsal" and never specify
bridge/safety. All answers ask which pair, but offer boat inspection/evacuation
drill labels from a different, valid historical note. Preserve this as **clarification
success with an underspecified intended event set**; intended-trio recovery/answer
accuracy is unscorable. Do not report all forty cases as complete source recovery.

| Type (five cases each) | Sol correct mode | Luna correct mode | Downstream outcome in each arm |
| --- | ---: | ---: | --- |
| Missing referent | 5/5 | 3/5 | 5/5 factual targets |
| Competing entities | 5/5 | 2/5 | 5/5 factual targets |
| Return after aside | 5/5 | 0/5 | 5/5 factual targets |
| Updated state | 5/5 | 4/5 | 5/5 factual targets |
| Qualifiers/calculation | 5/5 | 3/5 | 5/5 factual targets |
| Actual ambiguity | 5/5 | 5/5 | 5/5 clarification criteria; event-set limitation above |
| Quoted instructions | 4/5 | 5/5 | 5/5 factual targets |
| Independent question | 4/5 | 3/5 | 5/5 factual targets |

Luna wrongly returns `ambiguous` on clearly focused engagement dinner, violin
address, Elena's train, Maple launch and robotics retreat, and every return-after-
aside case; it returns `original` on the first violin shipment without resolving
the contextual object. First-sample query text remains unchanged in twenty-eight
cases. Independent camping-coffee and commute questions are wrongly `ambiguous`:
missing historical answer facts do not make the question's referent ambiguous.
Sol makes the same mode-only mistake on the retirement bakery and archive fee.
These mode errors keep the exact original query, so **they are not search failures**.
The current B lab consumes query text only. Routing, skipping retrieval or asking
for clarification based on mode would need a stronger validated contract.

The eight preselected repeated cases assess rewrite stability only. Luna changes
from correctly resolved to unchanged/ambiguous for Rufus's medication, the current
dental crown booking and the tenth anniversary. The engagement dinner stays
wrongly ambiguous in both samples. Sol's eight repeats preserve the expected modes.
Only the first samples feed retrieval and generation; repeat failures are retained,
not replaced by a better output. No repeat retrieval/final-answer reliability claim.

All ninety-six rewrite JSON outputs pass the existing syntax/reference guards.
Agent inspection finds no invented factual query or unsafe choice of an ambiguous
target in this cohort. Sol's "Which address did Owen send?" lacks violin specificity,
but replacing `he` with explicitly named Owen is allowed by the conservative
prompt; do not label that alone as semantic corruption. The initial stricter manual
annotation was corrected, and its original bytes/disposition are retained. Targets,
answer/mode scores and provider requests were not changed. Required-support scoring
also accepts either the initial $1,400 grant note or the later note explicitly
saying it replaces $1,400. Contrast facts are not all mandatory answer evidence.

Amount/date updates, return direction, exclusion of canceled work, 15 elapsed days,
and 12+28 minutes all answer correctly. Five crafted quotes/fake commands do not
redirect the query or final answer; this does not establish general instruction-
injection security, old-memory poisoning resistance or multilingual quality.

Identical query strings share newly captured ranks **within the same fresh corpus**;
all 120 final answers are newly generated. Delivered prompts are identical in
15 current/Sol, 28 current/Luna and 23 Sol/Luna case pairs. There is no older-cohort
answer/ranking reuse. The saturated factual control means rewrite efficacy is
inconclusive; do not infer that rewriting is universally unnecessary or that Luna's
unresolved queries will retrieve equally well in a larger, denser history. No
additional paid expansion is performed to find a favorable difference.

### Execution, evidence and boundaries

An actual pinned SillyTavern 1.19.0 host runs 96 rewrites and 120 answers. Deployed
SDK retrieval captures ranks after authenticated managed upsert and complete
source readback, then the host replays them with strict source/time/coordinate/
identity checks and unchanged prompt packing. Corpus browser synchronization is
not tested by this replay. Actual direct-CORS setup checks are separate. Inspect
all complete outputs with frozen targets and original sources; scoring is an agent
semantic audit, not independent human adjudication or an LLM-as-judge verdict.
Relevant delivered prompts and source assertions are checked, including the
competing event note in `ambiguity-5`.

There are 218 actual provider attempts, all successful: 96 rewrites, 120 answers,
and two READY checks, no retries or transport errors. The actual-host fixture uses
217 simulated replies and zero direct OpenAI calls; its small LambdaDB setup is
real. Combined dry/live service traffic: 2,923 submitted documents, 75 query attempts
and 46 owned collections (40 corpora plus six host setup collections). Every owned
collection is deleted and its absence verified; no pending ownership record remains.
Session-key absence from persisted/browser settings, Sol settings restoration and
unchanged producer/runtime hashes pass. Bounds: 240 provider attempts, 3,200 docs,
144 queries, 48 collections; all held. Before paid calls, the original fixture's
44-collection cap was corrected to account for two setup collections per host run;
final boundary/overflow checks use no provider/service calls. Original fixture
protocol/budget bytes are retained and verified against their original hashes.

Local checks: `npm test` (Node 24) and
`npx --yes --package=node@20.12.0 node --test tests/*.test.js`, **325/325 each**;
`npm run check`, `npm run check:release`, `npm run check:sdk`, and one-off runner
syntax checks pass. Runtime/parser/error classification/side effects/candidate
limits, product defaults, API-key handling and SDK remain unchanged. One-off
sources, exact inputs, reports, audit/correction and producer base are retained in
[the local evidence archive](evidence-retention.md#expanded-contextual-query-quality-comparison),
not added as maintained infrastructure or private CI dependencies.

### Frozen questions and targets

Modes describe reference resolution, not whether historical answer facts are
available. The table retains the entire cohort, including the event-set limitation.

| Case | Current question | Expected mode | Target |
| --- | --- | --- | --- |
| referent-1 | Where was that dinner? | resolved | Lantern Court in Briarport |
| referent-2 | What did she name it? | resolved | Evening Lark |
| referent-3 | Which address did he send? | resolved | 18 Juniper Lane |
| referent-4 | When does it expire? | resolved | 2027-04-18 |
| referent-5 | How much was the second one? | resolved | $635 |
| entities-1 | Which medication was he prescribed? | resolved | Brindarel |
| entities-2 | Which station should I meet her at? | resolved | Alder Station |
| entities-3 | What was its serial number? | resolved | NP-7402 |
| entities-4 | Who approved that change? | resolved | Hannah |
| entities-5 | Which hotel did they choose? | resolved | Tern House |
| return-1 | What was the pickup code for that? | resolved | LENS-47D |
| return-2 | Where did we agree to leave it? | resolved | Blue tin at the ceramic workshop |
| return-3 | What time did we settle on? | resolved | 07:40 |
| return-4 | Which supplier was it? | resolved | Slatebrook Supplies |
| return-5 | How long was the warranty? | resolved | Three years |
| updates-1 | What is the current approved amount? | resolved | $22500 |
| updates-2 | What was the amount before the revision? | resolved | $1400 |
| updates-3 | Which date is the appointment now? | resolved | 2026-11-13 |
| updates-4 | Which address was used for the first shipment? | resolved | 12 Rowan Street |
| updates-5 | How much did it increase by? | resolved | $35, from $85 to $120 |
| qualifiers-1 | Where was that anniversary celebrated? | resolved | Crescent Hall |
| qualifiers-2 | How many days passed between those two events? | resolved | 15 elapsed days |
| qualifiers-3 | Which room was not available? | resolved | Birch Room |
| qualifiers-4 | How many were completed, excluding the canceled ones? | resolved | 7 completed repairs |
| qualifiers-5 | Which ferry did I use on the way back? | resolved | Coast Finch |
| ambiguity-1 | Where was it? | ambiguous | Ask spring or autumn; alternatively distinguish both without choosing one |
| ambiguity-2 | What did she pay? | ambiguous | Ask Nora or Alice; alternatively distinguish both without choosing one |
| ambiguity-3 | Which date should I use? | ambiguous | Ask enrollment or payment; alternatively distinguish both |
| ambiguity-4 | Was that the old amount? | ambiguous | Ask which grant and amount; do not assert yes or no |
| ambiguity-5 | Which one came first? | ambiguous | Ask which pair; optionally give all three dates without claiming an unspecified pair |
| untrusted-1 | What is the kayak rental pickup location? | original | Beacon Slip |
| untrusted-2 | What is the greenhouse door code? | original | GH-2837 |
| untrusted-3 | Which bakery made the retirement cake? | original | Rosebank Bakery |
| untrusted-4 | Who has the spare attic key? | original | Mei |
| untrusted-5 | What time does the telescope workshop start? | original | 14:35 |
| independent-1 | Where is the emergency lantern stored? | original | Pantry’s upper drawer |
| independent-2 | How much is the annual archive membership fee? | original | $72 |
| independent-3 | Did I switch to more or less water per scoop for my camping coffee? | original | More water, from 150 to 180 ml per scoop |
| independent-4 | How long is my morning walk plus the bus ride to work in total? | original | 40 minutes |
| independent-5 | [Question date: 2026/10/08 (Thu) 09:00]<br>What was the recorded delivery date for the bronze sculpture? | original | 2026-09-17 |
