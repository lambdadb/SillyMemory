# LongMemEval-S actual-host comparison

The completed actual-host comparison used SillyMemory0.4.0's Query2 policy and
scored414/500(82.8%). A subsequent fixed-policy Query1 comparison scored469/500
(93.8%) with the same host, recent-five partition, search settings and4096budget.
Query1 is adopted in this development change; main promotion and release remain
separate. Compact benchmark-session date restoration scored466/500(93.2%), so it
is not adopted as a product quality optimization.

The benefit demonstrated here is smaller final-answer input with high English
memory accuracy. This consumed benchmark does not establish held-out roleplay
quality, total billed savings or superiority over sufficiently large full context.

For external context, see the [LongMemEval and BEAM reference](memory-benchmark-reference.md).
It separates vendor-reported scores from inspected artifacts and explains why
different prompts, judges, cohorts and cache conditions prevent a direct ranking.

All 2,050 planned answers were generated and judged. Exact stage-set validation
found no missing, duplicate or extra answers. Every recorded operational failure
was recovered, and all experiment-owned remote resources and temporary profiles
were confirmed cleaned. Completion was verified on October 14, 2026.

## Full 500-question comparison

Input tokens are provider-reported final-answer prompt tokens, not the 4,096-token
memory budget, maintenance work, or billed cost. Accuracy uses the frozen official
answer-check prompt with an automated judge; it is not a human correctness audit.

| Condition | Correct / 500 | Accuracy | Median answer input tokens | Aggregate answer input tokens |
| --- | ---: | ---: | ---: | ---: |
| Plain 32K | 164 | 32.8% | 28,080 | 14,028,181 |
| Native Vector Storage, 32K | 172 | 34.4% | 28,078 | 14,028,603 |
| SillyMemory, 32K | 414 | 82.8% | 4,988.5 | 2,526,647 |
| Plain 128K | 465 | 93.0% | 105,319.5 | 52,591,554 |

SillyMemory's aggregate answer inputs were 82.0% lower than plain 32K and 95.2%
lower than plain 128K. Against the same questions, it alone was correct on 265
cases versus plain 32K, while plain alone was correct on 15. Against vectors the
corresponding counts were 256 and 14. Against plain 128K, SillyMemory alone was
correct on 16, while plain 128K alone was correct on 67. Aggregate gains therefore
do not mean every question improved.

All 500 reference requests contained the complete nonempty source transcript in
native roles and order after CRLF-to-LF normalization. Exact byte matching passed
495/500; the remaining five differed only in line endings. None of the 32K plain
requests contained the complete source transcript. The 128K arm is consequently a
validated full-history reference for this dataset, not merely a configured limit.

| Question type | Plain 32K | Vectors | SillyMemory | Plain 128K |
| --- | ---: | ---: | ---: | ---: |
| User facts (70) | 28 | 29 | 60 | 70 |
| Assistant facts (56) | 30 | 31 | 54 | 53 |
| Preferences (30) | 11 | 11 | 22 | 23 |
| Multi-session (133) | 22 | 25 | 102 | 120 |
| Temporal reasoning (133) | 28 | 31 | 106 | 123 |
| Knowledge updates (78) | 45 | 45 | 70 | 76 |

SillyMemory's largest remaining error groups were multi-session (31) and temporal
reasoning (27). These counts identify where diagnosis is useful; they do not prove
whether retrieval, budget, source interpretation, or generation caused each error.

## Common 50-question comparison including Summarize

Summarize was evaluated only on a frozen stratified subset. Compare its result to
the other arms on these same 50 questions, not their 500-question percentages.

| Condition | Correct / 50 | Accuracy | Median answer input tokens |
| --- | ---: | ---: | ---: |
| Plain 32K | 16 | 32% | 28,022 |
| Native Vector Storage, 32K | 16 | 32% | 28,014 |
| Native Summarize, 32K | 16 | 32% | 28,102 |
| SillyMemory, 32K | 38 | 76% | 5,056 |
| Plain 128K | 44 | 88% | 105,466.5 |

SillyMemory was correct where Summarize was wrong on 25 questions, and the reverse
on three. The 50-question subset is small and does not establish performance for
all summary configurations, models, or roleplay conversations.

Native summaries were present for all 50 answers. Replaying their full historical
conversations required 2,475 successful summary calls: median 49 per question,
61,059,396 input tokens and 716,427 output tokens in total. Median cumulative summary
input was 1,210,274.5 tokens per question. This is the maintenance work accumulated
across a whole replayed history, not the cost of every user turn. Final-answer
inputs remained around the 32K packing limit: enabling a summary does not by itself
replace all native history with a compact summary. The run does not justify calling
Summarize generally ineffective; it shows that this native configuration did not
improve aggregate answer accuracy on this subset despite its maintenance workload.

## Observed response time

These are browser send-to-reply measurements with streaming disabled, excluding
historical indexing/replay setup. The comparison below uses the same 481 questions
across the four full-cohort arms. Sequential seed rows and three question IDs with
potentially replayed local answer receipts were excluded from this timing subset.
Their answers remain valid quality observations. Prompt-prefix caching reported
by the provider is distinct from local receipt replay.

| Condition | Median reply time | p95 reply time |
| --- | ---: | ---: |
| Plain 32K | 4.08 s | 8.70 s |
| Native Vector Storage | 4.24 s | 9.07 s |
| SillyMemory | 5.62 s | 10.75 s |
| Plain 128K | 5.61 s | 11.41 s |

Parallelism, shared machine/API load, recoveries, LambdaDB deployment changes and
a user-directed project change were not controlled latency variables. Treat these
as observed distributions, not a speed guarantee or proof of equal latency.
Streaming time-to-first-token was not measured. Summarize's 50 observed reply times
had a median of 3.57 s; historical summary work is excluded from that figure.

Token reduction is not equivalent to billed savings: cached input tokens totaled
2,075,879 for plain 32K and 8,864,605 for native vectors, versus zero reported for
SillyMemory and plain 128K. This report does not price different cache categories,
managed LambdaDB embeddings/reranking, maintenance, failed requests or provider
usage unreported after timeouts. Successful summary receipts were deduplicated;
unknown failed-request usage and ancillary early summary runs are excluded from
the maintenance totals above. No total-experiment cost claim is made.

## What was actually compared

- Product: SillyMemory 0.4.0 runtime; no retrieval/default tuning during the run.
- Host: SillyTavern 1.19.0, commit
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, with the disclosed empty-input correction.
- Generator: `gpt-6.1-sol`, low reasoning, 4,096 maximum output tokens, same neutral
  assistant character and native prompt pipeline in every arm.
- Primary context: 32,768; reference: 131,072. These are explicit comparison
  conditions, not claims about the most popular SillyTavern settings.
- Judge: `gpt-4o-2024-08-06`, temperature 0, maximum output 10, using the frozen
  [official answer-check prompt](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py).
- Data: the previously consumed cleaned LongMemEval-S 500, 246,750 historical
  messages. Preserve question/order/date and literalize native macros uniformly.
  Prefix original session dates on first source turns and question date on the
  question; do not invent a timezone (`send_date=0`). Gold answers and evidence
  labels do not enter generation.

| Feature | Configuration |
| --- | --- |
| Plain | Native history packing; other memory features off. |
| Vector Storage | Protect 5, query 2, insert 3, 400-character chunks, threshold 0.25, native template/placement. Remote `text-embedding-3-small` through the existing vLLM-compatible route instead of the factory local Transformers source. |
| Summarize | Main API instead of factory Extras; native builder, instruction, placement, 200-word target and interval 10; no forced catch-up or shortened history. |
| SillyMemory | Recent-five/pair-aligned-six, Query 2, archived older messages, managed embeddings, English Bayesian/Jev, k/candidates 100, return 50, 4,096-token budget and source assembly. |

The native vector extension completed indexing in all 500 cases. A nonempty vector
memory prompt was observed in 103 cases; it was absent in 397. The native code
requests three results and excludes protected recent messages afterward, without
refilling. Threshold filtering and protected-result exclusion can both leave no
older messages to inject; this run did not retain native query-score responses to
assign a precise fraction to each cause. Do not equate a completed index with a
useful injected memory, or generalize this result to tuned Vector Storage.

The 50 summary questions were selected before the parallel run with proportional
largest-remainder allocation by type and SHA-256 ordering using seed
`sillymemory-product-summary50-v1/question_id`: user 7, assistant 6, preference 3,
multi-session 13, temporal 13 and updates 8. Steven reduced the initial five-arm
500-question plan to four arms on 500 plus Summarize on 50 to avoid approximately
25,000 summary calls. Fifteen previously completed out-of-subset summary answers
are retained as ancillary evidence, excluded from the comparison.

## Corrections, failures and interpretation boundaries

The passive native-summary completion observer prevents replay from advancing
before asynchronous summaries are saved. Native interval skips remain skips. An
earlier defective replay run is archived and its invalid summary answers excluded.
The native indexing barrier waits for in-flight synchronization before switching
chats; complete indexing is verified against expected source hashes.

The pinned native splitter/input path produced empty embedding inputs. The approved
correction excludes exactly empty source texts from index candidates and exactly
empty split chunks before insertion, preserving source chat and every nonempty
chunk's text/order/hash/index. The index-completion check follows the same rule.
Offline validation across all messages found 10 empty source texts and 12 empty
chunks across seven questions. Corrected live retries succeeded. This is a disclosed
native baseline correction, not a SillyMemory quality improvement.

Operational problems included LambdaDB 503s, generic synchronization failures,
an OpenAI summary timeout, and answer validation that was too strict about line-end
spaces. Completed low-quality answers were not regenerated. Recovery used existing
provider receipts where possible; all remaining cases eventually generated and
received a judgment. Generic synchronization failures recovered in fresh profiles,
but browser quota exhaustion was not established as their original cause. Server
fixes and the project change were confirmed by Steven; their implementation was
outside this repository and is not independently certified by this report.

Successful-answer accuracy after recovery is not first-attempt reliability. This
run does not establish stable unattended operation under all deployments, provider
compatibility beyond the tested route, or Korean/character-roleplay performance.
It is an English-focused, actual-host, consumed-benchmark comparison, not a held-out
leaderboard submission. The automated judge can be wrong; ties and paired outcomes
are not human adjudications.

## Query1 adoption and remaining-error decision

The native default now sends only the eligible generation anchor in one
role-labelled request. Normal/regenerate/swipe use the active eligible user
question; Continue/Impersonate keep their existing active-message anchor rules.
Blank/special messages still follow existing eligibility/fallback rules. The
recent-five/pair-aligned-six generation window, displaced-pair indexing, checkpoint
synchronization, scope filters, consistent-read behavior, managed embeddings,
Bayesian/Jev, k100/candidate100/size50,4096memory budget and native streaming remain
unchanged. No contextual-query setting or extra LLM call is introduced.

| Full500 observation | Query2 | Query1 | Query1 + compact session dates |
| --- | ---: | ---: | ---: |
| Correct |414|469|466|
| Accuracy |82.8%|93.8%|93.2%|
| Aggregate final-answer input |2526647|2524361|2517410|
| Median final-answer input |4988.5|4970.5|4968|

Query1 improved65 answers and lost10 versus Query2. All500 adapted input hashes,
actual final prompt hashes and retained counts were verified;502 question-query
attempts satisfy the intended Query1/search contract. Two transient generation
fetch failures completed only pending cases, without score-driven regeneration.
All experiment-owned collections and host profiles were confirmed removed.
Observed Query1 host reply median was4.47seconds(p957.998seconds), but its execution
was not contemporaneous or a controlled latency comparison against the other arms.

The historical direct-provider source-assembly run scored475/500(95.0%). Compared
with Query1,13 historical-only and7 Query1-only answers differ. Its raw-question
search, full-history indexing, benchmark date formatter, evidence-oriented system
prompt and o200k4096packing are different from native role/date queries, retained
recent turns, host guidance and cl100kbudget accounting. Do not present that score
as the current runtime's measured accuracy. Source assembly/overlap removal and
compact date semantics were already established historically; they are not new
techniques discovered by this reconciliation.

### Completed compact-date trial

The benchmark adapter supplies unknown-timezone session dates only on first turns
and zeros native timestamps. Native product timestamps already have independent
conversation-time provenance; do not manufacture per-turn UTC from session dates.
The trial restored one shared provenance instruction and compact dates per excerpt
under the actual host budget, with fixed captured Query1 search results. All500
baseline memory arrays reproduce actual requests exactly. All10699 dated blocks
have correct provenance and every candidate stays within4096tokens. Two date
omissions now produce24days(ukulele to servicing) and6days(keyboard to bluegrass).

The restored-date trial generated500 fresh answers and500 official judgments by
replaying captured native provider requests with only the memory segment replaced.
It is not a fresh end-to-end host run. Six answers improved and nine worsened;
all15 pairs were inspected. Three annotated-message packing losses retained their
old correctness labels, and all9 answer losses retained baseline marked-message
coverage. Camping chose the wrong return date, baking chose the wrong temporal
anchor, and iPad abstention added a speculative interval despite missing evidence.
Other changes involve near-equivalent outputs, ambiguous targets and judge-sensitive
wording. Official labels remain unchanged; inspection is not human adjudication.

The trial completed all1000 successful calls without retries, in294.5seconds for
the full launch plus its reused preflight. API-only generation median2.316seconds
and p956.005seconds excludes search and host overhead. This trial confirms two
adapter-date repairs but no aggregate quality improvement; reject it as a product
optimization and stop the formatting sweep. Provider/model variation and altered
budget admission prevent attributing the net0.6point decline solely to dates.

### Query1 error audit and next bounded optimization

All31 official Query1 errors were inspected using original questions/references,
marked source messages, actual delivered prompts, captured final50 documents and
later date-trial answers. Stage counts are annotation proxies, not proof that
whole answer spans are sufficient:

| Observation | Questions | Source-grounded interpretation |
| --- | ---: | --- |
| Marked message absent from final50 |6|Four necessary factual gaps; two nonessential/redundant annotation gaps. |
| Marked message returned but absent from memory |1|Oakwood property excluded by budget. |
| No marked-message gap |24|Includes three unannotated questions; remaining errors involve dates, evidence use, unsupported links, target scope or judging. |

The four confirmed necessary final-result gaps are:

| Question ID | Missing fact | Consequence |
| --- | --- | --- |
| `gpt4_d84a3211` | Helmet price$120(message117) | Bike total$65instead of$185. |
| `ba358f49` | Current age32(message269) | Cannot compute33at next-year wedding. |
| `gpt4_7abb270c` | Museum of Contemporary Art visit(message95) | Replaces one of six museums with another gallery. |
| `6e984302` | Sculpting tools purchased(message436) | Returns related materials rather than established purchase. |

Missing language-app message411is redundant with delivered French/Spanishexchange
source419; missing wake-up annotation248is a thank-you message, while conflicting
6:30and7:30facts are present. These are not two additional necessary search misses.
The Oakwood property message439is a distinct packing loss. Numbers above are
zero-based source-message indices, not chunk numbers.

The audit also finds clear unsupported links: SeniorSoftwareEngineer counts are
applied to a SoftwareEngineerManager premise, and Harvard conference attendance
is asserted as an undergraduate poster presentation. Slow-cooker advice overlooks
available beef-stew success while focusing on recent yogurt; publication advice
asks broad topic selection despite medical-imaging expertise. Other references
require caution: January19toApril10is81days(11weeks4days), not the released15weeks;
poster versus album counts, rack plans, repeated boots, calendar-week boundaries
and contradictory source facts should not be silently forced to the gold answer.
All31 per-case dispositions remain local; official labels are not changed.

Next product question: why do those four necessary facts fall outside final50?
The retained receipts do not expose the complete100-candidate pre/post-rerank lists,
so this audit cannot attribute them to candidate admission versus rerank order.
Before a new technique, reconstruct the same synthetic benchmark corpus and capture
the existing100-candidate pipeline stages for these four cases, with ordinary
correct cases as frozen controls. Keep the product's query, chunking, embedding,
fusion and candidate limits fixed; expose diagnostic rankings without increasing
search depth. If the service cannot expose a stage, record that boundary explicitly
rather than treating a different query/configuration as an equivalent replay.

Then evaluate only the demonstrated cause: indexing/chunk boundaries if the fact
never enters candidates, ranking if it enters but falls below50, and packing only
for the separate returned Oakwood source. Prefer source/data/search engineering
without an added model call. Freeze a disjoint confirmation cohort before tuning;
run the unchanged full500 as consumed regression coverage for any adoption candidate.
Stop after a supported adoption/reject/defer decision. Do not increase k, size,
budget or tune reranker instructions merely to recover the historical95%.

## Validation and evidence availability

Validation on Node24.15.0:

- `npm test`:369/369 maintained tests passed. An earlier374-test local run also
  included five temporary summary-barrier tests; those original tests and their
  helper were preserved outside the maintained tree, not added to this product PR.
- `npm run check`, `npm run check:release`, `npm run check:sdk`, and syntax checks
  for every maintained script/test passed. Version0.4.0is retained for development;
  any runtime main promotion requires a higher release version.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18149 SM_ARTIFACT_TAG=query1-adoption npm run test:browser`:
  102 checks passed on real pinned SillyTavern/Chromium with local HTTPS LambdaDB
  emulation, including Query1, recent retention, native replies/streaming and swipe.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18150 SM_ARTIFACT_TAG=query1-adoption-final npm run test:faults`:
  94 checks passed, including HTTP429/503, timeout, cancellation, edits/deletion,
  branches, reload and recovery. Zero remaining emulator collections/page errors.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18151 node scripts/prompt-delivery-smoke.mjs artifacts/query1-adoption-delivery.json`:
  18 final native prompt-delivery cases passed; no remaining emulator collections.

The first fault run stopped because its assertion still expected the obsolete
"Sync this chat" generation-recovery instruction. It was updated to the existing
"regenerate to retry this request" behavior, without changing production failure
handling. The initial failure is retained. Final product validation uses emulator
responses; no new paid quality run or live LambdaDB test was launched for adoption.
 Maintained regressions check current-role/anchor handling,
blank/special input fallback, exclusion of prior/replacement replies, retention,
source partition, synchronization and search failure safety. Historical experiment
results above are not new product verification or independent quality confirmation.

Detailed prompts/responses and producers are ignored, local-only artifacts and
unavailable from a fresh clone. Originals remain intact. The complete baseline
archive is `artifacts/archive/product-comparison-final-v4.tar`, SHA-256
`cf90037b2a5e0b06202b0c4645af47469eb3dc31b850dbff1d4a9287e75ad44a`.
Query1 is `artifacts/archive/product-query1-completed-v1.tar`, SHA-256
`86042ad3cbd73ae918fbd79b37c856ba7e9cfe89c43da5d4498772abcbb30f30`.
The compact-date trial is `artifacts/archive/query1-compact-date-answers-v1.tar.gz`,
SHA-256 `1181f2bcb250d590f40bede66d32161d2adb1e4bead552c7c797ca817cb989ec`.
Each archive has per-member readback verification and an adjacent receipt/manifest.
The Query1 error audit is `artifacts/query1-error-audit/`; complete intermediate
notes and excluded one-off summary barrier source are preserved under
`artifacts/query1-adoption-preservation/`, with SHA-256 checksums. Restore original
relative paths from that bundle if replaying historical local runners. No large
fixture, raw answer, diagnostic producer or one-off generator becomes a CI dependency.

The adoption/error-audit archive is `artifacts/archive/query1-adoption-evidence-v1.tar.gz`,
SHA-256 `5dae81bd1767b097775a1d74caf9f1e69ac1f9f97b126c7fe7484a7035071d68`; all21members were verified by archive readback.
