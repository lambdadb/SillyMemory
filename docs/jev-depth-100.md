# Jev depth 100: completed LongMemEval-S retrieval and final answers

## Result and decision

**All 500 paired questions completed. Official answer accuracy: Jev50
464/500 (92.8%) versus Jev100 471/500
(94.2%), a +1.4 percentage-point difference.**
There are 15 official gains and 8 official losses. Native rerank depth 100
improves source coverage and yields concrete useful context in several inspected
answers, but the automated-score gain also includes judge-sensitive and ambiguous
cases. Do not equate all 15 gains with retrieval-caused improvements.

Keep depth 50 as the benchmark reference; **do not promote depth 100 to product defaults
from this single run**. The completed offline source-consistency audit below confirms
real evidence recovery alongside budget losses and scoring/target uncertainty; it
does not turn the official +1.4pp into an independently verified quality gain.
No further paid judge/generation repeats were made. Product code, settings, dependencies and tests are
unchanged. This record closes the bounded comparison, not a model/parameter sweep. Live
execution was on 2026-10-11 UTC; answer generation ran 11:38:51–12:06:07.

This is direct provider benchmark generation over captured native retrievals, not a
new SillyTavern browser run. Runtime defaults remain recent 12 messages, budget 1600,
k/size/rerank candidate 30 and complete-recent-dialogue query construction. The
benchmark instead indexes all history except the question, queries that question
alone and uses a 4096-token memory budget. Do not describe these benchmark settings
as the current installation defaults or a demonstrated live-character-chat result.

## Frozen comparison

Steven authorized increasing both `knn.k` and native `rerank.candidateSize` from 50 to 100,
retaining final `size:50`. The previously suggested asymmetric k50/candidate100 was not
run. This intervention changes both search paths' retained candidates, Bayesian
calibration and the fused rerank pool; it does not isolate those mechanisms.

- Full original LongMemEval-S 500, original order; no question/reference edits.
  Dataset SHA-256 d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442.
- Runtime base ec0834e8641ff4b35f9b348981d89117725ce886. Stable SDK 0.8.1 is an
  ignored experiment-local bundle; maintained SDK 0.8.0 is unchanged.
- Managed OpenAI text-embedding-3-small; original boundary-v1 chunks capped at 800
  Unicode codepoints. All 487,285 planned source documents rebuilt before execution.
  No complete-session documents, new chunks, query rewrite or summary calls.
- Bayesian English natural question, skipSyntax:true; no extracted-word OR query.
  Identical owner/scope filters, consistentRead:true, explicit same branch/corpus
  per question and includeVectors:false. Query excludes the question-date prefix.
- Both arms use typesafe/jev-1.13.0, fields[text], original question queryText,
  criteria omitted/default-relevance-v1 and onFailure:error. Only status:applied
  with the correct identity and full 50/100 scored candidates enters comparison.
- Alternate paired query order by original index. Final `size:50` for both, identical
  greedy 4096-token o200k_base packing and compact session-date provenance. Packer
  skips a passage if the complete rendered trial exceeds budget and tries later
  passages; selected content is subsequently assembled by the unchanged renderer.
- One auxiliary no-rerank `k:100`/`candidateSize:100`/`size:100` observation after each pair.
  It is never packed/generated as a third arm. Separate service execution is not
  an exact recording of the native Jev input; membership/scores are audited.

Largest query 355 UTF-8 bytes, largest stored text 1,996 bytes and conservative top 100
rerank estimate 95,073 bytes. No hidden input truncation. Conversation/session time
is labeled provenance, not automatically treated as event time. Message indices
below are zero-based positions in the flattened released conversation; they are
not chunk numbers. Retrieval ranks are one-based.

## Complete retrieval and delivery

896 marked message occurrences across 479 marked questions. Markers are diagnostic
source coverage, **not exact answer-span coverage or generated-answer accuracy**.

| Metric | Jev50 | Jev100 |
| --- | ---: | ---: |
| Marked occurrences returned in final 50 | 865/896 | 887/896 |
| Marked occurrences delivered within 4096 tokens | 864/896 | 876/896 |
| Questions with all markers returned | 458/479 | 470/479 |
| Questions with all markers delivered | 457/479 | 463/479 |

Retrieval gains 24/losses 2, net+22. Delivery gains 23/losses 11, net+12.
Delivery improves in 15 questions and worsens in 10. Nine lost occurrences are still
returned but fail the exact greedy budget trial; two are outside returned top 50.
The separate pool of 100 contains those two, consistent with a final-selection loss,
without proving the exact original native input membership. Preserve all losses.

| Type | Cases | Jev50 delivered markers | Jev100 delivered markers |
| --- | ---: | ---: | ---: |
| single-session-user | 70 | 66 | 66 |
| multi-session | 133 | 310 | 320 |
| single-session-preference | 30 | 40 | 34 |
| temporal-reasoning | 133 | 248 | 256 |
| knowledge-update | 78 | 144 | 144 |
| single-session-assistant | 56 | 56 | 56 |

The fresh control matches historical Jev50 marker coverage on every question;
historical arm results are not spliced into this fresh comparison. Candidate has
nine remaining missing returned markers in nine questions. Several are redundant
mentions; helmet $120 and current age 32 remain distinct unresolved facts. Coverage
counts cannot resolve that distinction automatically.

Mean final 50 contains 39.37→34.17 unique source messages and 10.63→15.83 additional
chunks from already represented messages. User passages 23.14→17.88; assistant
passages 26.86→32.12. Delivered passages 30.12→29.25. More candidates can recover
needed facts while also changing distracting content and consuming the same budget.
This is explanatory observation, not causal isolation or a reason to discard all
assistant messages, which can contain story facts.

## Official final-answer evaluation

Fresh 1000 answers and 1000 judgments; no historical answer reuse. Both conditions use
exact captured memory messages, the previous system instruction and the literalized
question with its original question-date prefix. References/has_answer/rubrics are
excluded from generation. No new retrieval occurs during answer evaluation.
Generator gpt-6.1-sol, low reasoning, output cap 4096; official frozen judge
gpt-4o-2024-08-06, temperature 0, output cap 10 and whole-response yes/no parser.
Template file SHA-256 71b460a047a5739bb3ded75afe6ee3c2824e6cc9ee4ee301dcd51c621d0c2dff.
All actual response model identities match the requests. Sol is an undated alias;
recorded identity does not pin an internal provider revision.

| Type | Cases | Jev50 correct | Jev100 correct | Official gains | Official losses |
| --- | ---: | ---: | ---: | ---: | ---: |
| single-session-user | 70 | 69/70 | 69/70 | 0 | 0 |
| multi-session | 133 | 117/133 | 118/133 | 6 | 5 |
| single-session-preference | 30 | 25/30 | 25/30 | 3 | 3 |
| temporal-reasoning | 133 | 122/133 | 127/133 | 5 | 0 |
| knowledge-update | 78 | 75/78 | 76/78 | 1 | 0 |
| single-session-assistant | 56 | 56/56 | 56/56 | 0 | 0 |

Official gains: `c4a1ceb8`, `gpt4_7fce9456`, `e3038f8c`, `eeda8a6d_abs`, `57f827a0`,
`d6233ab6`, `b6025781`, `09ba9854`, `09ba9854_abs`, `gpt4_468eb063`, `gpt4_7abb270c`,
`eac54adc`, `eac54add`, `a3838d2b`, `f685340e_abs`.

Official losses: `3a704032`, `dd2973ad`, `88432d0a`, `9d25d4e0`, `35a27287`, `caf03d32`,
`1da05512`, `a08a253f`.

All 23 changed answer/reference pairs were inspected provisionally by the assistant.
This is not independent human adjudication. Official labels stay unchanged.

Concrete source-backed examples:

- Museums `gpt4_7abb270c`: candidate retrieves/delivers messages 95/141/189 absent in control
  and supplies all six museums rather than an incomplete list. Its answer also
  discloses uncertainty about one recent visit's exact date/order.
- Business milestone `eac54add`: restored message 387 names the March 1 first-client contract,
  replacing the older website-launch answer to the four-weeks-ago question.
- Charity count `a3838d2b`: restored message 354 and independent message 358 recover June's Walk for
  Wildlife; answer changes three→four. Event dates come from source content.
- Reunion `d6233ab6`: restored message 113 supports debate-team and AP-economics memories
  used in the advice. Citrus `c4a1ceb8` gains unmarked user message 320 confirming orange/lemon
  sangria; original marked message 312 remains absent. This shows marker gains are neither
  necessary nor sufficient for an answer gain.

Concrete budget-related personalization regressions:

- Slow cooker `caf03d32`: user message 475 beef-stew success is returned at rank 29 but trial 4112
  exceeds 4096. Candidate retains yogurt advice but omits that successful experience.
- NAS `1da05512`: user message 379 existing external-drive backup is returned at rank 30
  but trial 4145
  exceeds 4096. Candidate no longer acknowledges that established backup setup.
  Old storage-capacity message 375 is missing from delivery in both arms.

### Scoring and interpretation limitations

Three inspected pairs give semantically near-equivalent requested facts but opposite
judgments: `09ba9854` both $50 saved; `eac54adc` both 19 days; `f685340e_abs` both explicitly
distinguish tennis from unmentioned table tennis. Strings/prompts differ: this is
an observed semantic consistency concern, **not a same-byte repeat experiment or
proof of stochastic judge instability**. Preference `57f827a0`/`b6025781` and loss `35a27287`
also remain sensitive to wording despite both answers covering key preferences.

Property-count `gpt4_7fce9456` is an official gain despite losing Oakwood user message 439 in
packing. Control says five including Brookside/four others; candidate says four
including Brookside/three others. Reference lists four other properties excluding
Brookside. The matching number is not evidence of four correct source entities.
Bus-abstention `09ba9854_abs` answers derive prices from assistant estimates despite
an insufficient-information reference; candidate Yes is not clearly grounded
abstention. Do not silently fix references or delete these cases to improve scores.

Some official losses expose target/date questions: plants `3a704032` mixes a rolling
month with a May 25 last-month acquisition; `dd2973ad` links last Thursday in a May 24
session with last Wednesday in a May 29 session, different weeks. Baking `88432d0a` has
an additional unmarked apple-pie report in a May 20 session, with no explicit event
date, omitted by the four-bake reference. Jewelry `9d25d4e0` adds an unconfirmed recent
locket acquisition and also raises pair-versus-piece counting. These are reasons
for source/target audit, not automatic proof that the reference or candidate is right.

Fitness `a08a253f` is wrong despite delivered weekday evidence: candidate says five
and gives an unfinished-looking swimming bullet despite finish_reason:stop. All
input/response checks passed; it is a generated-answer error, not a transport
truncation or a retryable provider failure. No extra generation was made to fish
for a better answer.

Official wrong-answer stage proxies: control 22 with all markers delivered, 10 with
retrieval gaps, 4 unanswerable; candidate 21 with all markers delivered, 4 retrieval
gaps, 2 delivery gaps, 2 unanswerable. Alternative evidence, partial marked chunks,
question interpretation and judge sensitivity prevent causal classification by
these counts alone. Full changed-case prompts and all 23 provisional notes are retained.
The repeatedly consumed 500 is not a new blind held-out cohort; one generation and
one automated judgment per condition do not establish replication or generalization.

### Completed offline source-consistency audit

All 23 official changed pairs were audited from the immutable completed archive and
checksum-locked released dataset. The case list and classification rules were fixed
before this additional source inspection. This is retrospective and unblinded:
the previous answers/labels were already known. No provider requests, reference
edits, label changes or new generated answers. The other 477 unchanged pairs were
not semantically regraded, so this cannot produce a corrected overall accuracy.

| Classification | Cases | Official gains | Official losses |
| --- | ---: | ---: | ---: |
| Newly delivered source used in the answer | 5 | 5 | 0 |
| Budget-related personalization omission | 2 | 0 | 2 |
| Unsupported or incomplete candidate generation | 2 | 0 | 2 |
| Cleaner abstention wording, correctness gain unproven | 1 | 1 | 0 |
| Equivalent facts or preference-rubric consistency concerns | 6 | 5 | 1 |
| Counting target/reference confounds | 2 | 2 | 0 |
| Relative dates or event/entity target confounds | 4 | 1 | 3 |
| Abstention reference conflicts with assistant estimates | 1 | 1 | 0 |

The five source benefits are citrus, reunion, museums, business milestone and
charity count described above. Museums recovers the missing names, but the first
two visits' order remains uncertain; **five coverage benefits are not five newly
adjudicated fully correct answers**. The two budget losses are beef-stew success
and established external-drive backups. Jewelry adds an unconfirmed acquisition;
fitness supplies an unsupported Monday and stops without the known weekday list.
Fish abstention becomes cleaner, although both answers already deny a known
30-gallon count and control's extra extrapolation is explicitly conditional.

The six consistency concerns are `09ba9854`, `eac54adc`, `f685340e_abs`, `57f827a0`,
`b6025781` and `35a27287`. Original labels remain frozen, including **control Yes /
candidate No** for `35a27287`; both recommend French/Spanish language exchange.
Property and rare-item counts confound a matching number with the intended entities.
Emma, plants, doctor and baking depend on event/entity or relative-date interpretation.
Bus savings is not clearly justified abstention merely because estimates are qualified.

Three explicit calculations were checked without an LLM: 60−10=50 in both train
answers; February 10→March 1 is 19 days in both website answers; doctor appointment
May 24's last Thursday resolves to May 18, whereas bedtime May 29's last Wednesday
resolves to May 24. These checks validate the cited examples, not every event time
or the full benchmark. Session timestamps must not manufacture an unstated event date.

The audit preserves exact original source, session/date/message locators, returned
chunk ranks, delivered passages, answers and budget trials for each cited source.
Independent checks verify all 23 pairs, 56 source locators and 88 delivered-passage
locators without changing labels; semantic dispositions remain the
assistant's assessment, not independent human adjudication. The next useful product
question is preserving recovered facts within the existing injection budget, with
search fixed, rather than another depth/weight/model sweep. Any future change needs
the full frozen comparison and disclosed scoring limitations, not only these 23 cases.

### Completed offline injection-budget ceiling

All 500 questions in both captured depth settings were replayed with the same final
50 documents, ordering, current selector/renderer, source text, dates, system/question
and o200k_base tokenizer. The only intervention is 4096-token admission versus
admitting all returned passages. All original selected sources remain represented;
existing identical-text packing/provenance rules are unchanged. No query, embedding,
generation, judge call or remote resource was created. This is a diagnostic ceiling
over returned content, not a new answer-quality measurement or adopted setting.

| Metric | Depth50 | Depth100 |
| --- | ---: | ---: |
| Full-50 memory tokens: minimum / median / p95 / maximum | 4777 / 6595 / 7490 / 8675 | 5030 / 7054 / 7857 / 8681 |
| Marked source delivery: 4096 → full50 | 864→865 / 896 | 876→887 / 896 |
| Questions recovering any marked source | 1 | 9 |
| Questions with all marked sources: 4096 → full50 | 457→458 / 479 | 463→470 / 479 |
| Full-50 memories exceeding 8192 tokens | 1 / 500 | 5 / 500 |
| Aggregate serialized prompt-token estimate multiplier | 1.60× | 1.69× |

Every full-50 memory exceeds 4096. Maximum serialized full-prompt estimate is
9712/9734, plus the unchanged 4096 output reservation; all 1000 pass the **previous
experimental 32768-token preflight gate**. This is not a fresh provider context-limit
verification, billed token usage, cost or latency measurement.

Depth100 restores 11 marked occurrences across nine questions: `gpt4_7fce9456`,
`06878be2`, `35a27287`, `195a1a1b`, `afdc33df`, `caf03d32`, `1da05512`, `07b6f563`
and `gpt4_f420262d`. Nine of the 11 are preference sources; one is multi-session,
one temporal. Among current official wrong answers, slow-cooker/NAS have all markers
restored, while cultural events restores one but another marked source remains absent
from final50.
Depth50 restores only old NAS storage-capacity message 375; that answer was already
officially correct. These are source restorations, not predicted score gains or an
upper bound on answer improvement: unmarked evidence can also help, and added context
can distract or change an already correct answer.

In depth100, current wrong-answer proxies remain 21 already having all markers,
four with returned-marker gaps, two with restored delivery gaps and two unanswerable
without markers. Full50 has 887 represented marked messages but only 883 complete
adapted message bodies; existing partially represented marked messages are not made
complete by this change. Coverage is still not exact answer-span recall.

Depth100 adds 10375 passages: 12 from marked messages, 10363 from unmarked messages;
3572 user and 6803 assistant passages. The extra marked passage beyond the 11 newly
represented messages is part of an already correctly answered bike-maintenance case.
**Unmarked does not mean irrelevant; same-message chunks do not mean duplicate text.**
No semantic relevance/noise labels were produced. Full rendered tokens minus summed
raw-body tokens average 1696/1719; this net includes source/date labels, removed input
prefixes, identical-text grouping and token-boundary effects, not pure header overhead.

The budget is a real bottleneck for specific sources, but removing it expands input
throughout the cohort while only a small set of annotated delivery gaps is restored.
Keep defaults and the reference unchanged; defer a paid full50 answer run. This
motivated the bounded same-message assembly comparison below, preserving current
selected text/provenance with search and 4096 admission fixed. Compare the complete
frozen cohort before adopting it; do not discard assistant/unmarked content or
introduce learned selection calls here.

Independent validation checks 1000 counterfactual memories, 50000 fixed passages,
original labels/markers, baseline-source inclusion and exact prompt whitelists/hashes.
Token counts use the same recorded tokenizer, not an independent implementation.

### Completed offline same-message assembly

Frozen before execution at `c27926e03680366280244e8394eb91bec9b2a05e`: all original
500 questions, both captured native Jev arms and their fixed final50 ranking. Only
prompt assembly changes; no new search, embeddings, generation, judging or remote
resources. Product code/defaults and original answer labels remain unchanged.

Establish the existing 4096-token selection as an immutable source floor. Preserve
existing identical-text groups as opaque blocks, with all original coordinates and
session dates at their latest occurrence. Group consecutive singleton blocks from
the same original message/revision/identity, sort their ranges by original UTF-16
offset and merge only touching or exactly overlapping canonical ranges. Share one
message/passages/session-time header; explicitly mark each omitted interval between
disjoint ranges. Never reconstruct missing text or combine different messages.
Singletons and identical-text blocks keep the existing representation. The same
first-session prefix replacement and conversation-time legend are retained.

If rendering the baseline-selected passages saves tokens, refill from the original
hit order within 4096 using the existing distinct-content guard; never evict or
truncate a baseline passage. Otherwise retain the exact baseline. This is a local
candidate, not a promoted runtime algorithm. **The frozen boundary-v1 corpus has
zero overlapping source characters:** observed savings come from shared formatting
and adjoining text, not overlap removal. Hypothetical overlap is synthetic coverage.

| Metric | Depth50 | Depth100 |
| --- | ---: | ---: |
| Same-selected-source net tokens saved: median / p95 / maximum | 250 / 438 / 569 | 267 / 452 / 559 |
| Memories using assembly | 495/500 | 496/500 |
| Marked sources delivered: existing → assembled/refilled | 864→865 / 896 | 876→883 / 896 |
| Questions recovering any marked source | 1 | 6 |
| Questions with all marked sources: existing → assembled/refilled | 457→458 / 479 | 463→467 / 479 |
| Complete marked message bodies: existing → assembled/refilled | 858→859 | 872→879 |
| Additional admitted passages | 1158 | 1262 |
| Full50 memory tokens: existing median → grouped median | 6595→6221 | 7054→6479 |
| Grouped full50 memories fitting 4096 | 0/500 | 0/500 |

All 1000 candidates preserve every baseline source passage and stay within 4096;
no message-marker delivery regression occurs. Depth100 restores seven of the 11
marked occurrences available from unlimited full50 injection, across six questions:
`06878be2`, `35a27287`, `afdc33df`, `caf03d32`, `1da05512`, `07b6f563`.
All seven newly represented marked message bodies are complete. Slow-cooker and NAS,
the two inspected budget-related wrong-answer cases, regain all annotated sources;
cultural events regains one but message 411 remains outside final50. The other
recoveries are already officially correct controls. Depth50 restores the one old
NAS source also restored by unlimited admission, in an already correct answer.

Four depth100 delivery gaps remain relative to full50: property-viewing count
`gpt4_7fce9456` (message 439), photography setup `06878be2` (328), bedtime
`195a1a1b` (503) and temporal `gpt4_f420262d` (368). The unchanged greedy refill spends
space on earlier eligible passages; formatting cannot remove every delivery gap.
These are original flattened message indices, not chunk numbers. This does not
assert that those markers are unique required facts or that their answers are wrong.

Depth100 adds seven passages from marked messages and 1255 from unmarked messages,
491 user and 771 assistant passages. Unmarked is not irrelevant. Most saved space
is spent on additional source content: final memory median remains 4077 tokens,
rather than becoming a substantially cheaper memory prompt. Serialized full-input
estimates total 2262699→2242427; fewer role-message wrappers affect this estimate.
It is not provider usage, cost, latency or a generated-answer-quality result.

Independent Python validation checks all 1000 memories/50000 returned passages,
32105 selected passages and 81551 rendered blocks against canonical UTF-16 unions,
exact gaps, date/source citations, original system/question whitelists and unchanged
markers/labels. Nine small synthetic scenarios cover adjacency, gaps, overlap,
identical-text provenance, revision boundaries/stale text, prefix handling, Unicode,
source-preserving refill and unchanged fallback. These validate the ignored candidate,
not shipped runtime, host integration or provider behavior. Tokenization uses the
same recorded tiktoken/o200k_base implementation.

**Decision:** source assembly is a justified answer-evaluation candidate:
it recovers both demonstrated budget-loss sources at the same budget and preserves
all existing text/provenance. Keep defaults unchanged. A generated-answer comparison
over all these 500 questions, including already-correct controls, would be **regression
and discovery-cohort evidence**, not independent confirmation: this cohort motivated
and selected the assembly rule and has been repeatedly inspected. Before a paid
confirmation, freeze a disjoint, previously unused cohort, its provenance/exclusion
rules and scoring criteria; retain these 500 questions as full regression coverage.
Taking a new subset of these consumed questions does not establish independence.
No disjoint confirmation cohort or paid run was prepared in this offline phase.
Do not claim seven corrected answers, promote defaults, increase the budget, tune a
subset or run further search/model-selection variants from this arithmetic alone.

## Operational recovery, resources and latency

The initial 233 pairs and two failed execution snapshots were preserved; each execution
exhausted seven attempts for both blocked questions. Steven
reported exhausted Typesafe credits, replenishment and automatic payment activation;
provider account logs were not independently inspected. Diagnostics had shown
fallback/unavailable/scoredCount0 while managed embedding/search worked. Both
previously failed questions completed with native applied after replenishment.
No diagnostic fallback was ever scored/injected.

Original native bounds stayed 520 collections, 540000 physical document submissions,
20000 physical requests, 1400 rerank attempts, four hours from 10:00:31 UTC, two
concurrent collections/requests, timeout 60 seconds, seven attempts per request.
Continuation guards include the prior diagnostic reserves: 58 requests, 1926 docs,
two collections and five rerank attempts. All 233 completed files remained byte-identical.

Complete native work plus diagnostics: **506 owned collections, 493091 physical
submitted documents, 14207 requests and 1050 rerank attempts**. All collections have
GET 404 cleanup confirmation and final owned listings are empty. Main ledger has 46
HTTP 503 responses and 42 retry waits; diagnostics add three 503s. Eleven resumed
transient 503s recovered. No live 429/Retry-After/rate-limit headers were observed on
LambdaDB. No unresolved remote data remains. Elapsed native ledger 96.67 minutes
includes the replenishment interruption, not per-query product latency.

Jev-stage median 263→527 ms, p95 448→743 ms. Successful query fetch medians by order:
control-first 754/candidate-first 1019 ms; control-second 511/candidate-second 774 ms.
Exclude retries, admission and packing. Completed calls score 25000 versus 50000
candidates. No billing/usage fields were returned for native reranking; scored
candidates are not invoice amounts. All candidate final sets are contained in
separately observed pool of 100; 482/500 match retrieval scores exactly, maximum matched
score difference 0.001355. No exact-vector oracle was run.

Answer stage completed in 27.26 minutes: 2000 physical requests, all HTTP 200,
1000 answers and 1000 judges, zero retries/waits, peak concurrency 2. Normal successes
have no artificial sleep; available rate headers are observed by the admission gate.
Frozen bounds 6000 attempts, three per logical call, four hours, approximate USD 100
reservation using historical conservative coefficients. Actual reservation
USD 50.6544 is not an invoice or a fresh pricing quote.
Provider answer usage 4318217 input/67034 output; judge 205898 input/1652 output;
reported cached input 0. Do not conflate model-visible memory tokens with billed
prompt/output usage. Live 429 handling was not exercised in this error-free answer run.

## Validation and evidence

- Independent Python recomputation of full 896-marker/request contracts and all 1000
  generation/judge receipts, exact whitelisted prompts and strict labels.
- All 487,285 source documents rebuilt; physical 10080 upsert bodies and 100000 returned
  source hits checked; all 1000 rendered memories and greedy 4096-token selections
  replayed. Same tiktoken 1.0.22/o200k_base, not independent tokenization.
- Node 24.15.0: npm test 323/323; npm run check, check:release and check:sdk passed.
  Eight synthetic retry scenarios passed. Product/runtime/test/package diff is empty.
- Not performed: Node 20 locally, new actual-host/browser run, exact-vector oracle,
  blind held-out confirmation, repeated generation or repeated exact judge prompts,
  independent human adjudication, default promotion or deployment.

Original interrupted evidence remains immutable at
/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-blocker-v1/evidence.tar.gz.
Completed evidence is retained separately at
/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-completed-v1/evidence.tar.gz.
See [the evidence index](evidence-retention.md#jev-depth100-complete-answer-comparison)
for checksum, availability and producer details. Both are local-only ignored archives,
unavailable in a fresh clone and not CI dependencies; no raw corpus, responses or
one-off runners enter Git. Seven predecessor archives remain byte-identical.
The original completed archive retains its initial report bytes; the subsequent
offline audit and revised report are preserved separately in the source-audit archive
listed in the evidence index. Earlier records and labels are not overwritten.
The later budget-ceiling replay and same-message assembly comparison each have their
own separate archive and report revision; all preceding archives retain their
original bytes.

Offline revalidation uses the retained source and original worktree-relative placement:

```sh
node artifacts/jev-depth-100-v1/summarize.mjs
python3 artifacts/jev-depth-100-v1/completion-validate.py
node artifacts/jev-depth-100-v1/source-wire-check.mjs
node artifacts/jev-depth-100-v1/token-check.mjs
node artifacts/jev-depth-100-answers-v1/summarize.mjs
python3 artifacts/jev-depth-100-answers-v1/validate.py
python3 artifacts/jev-depth-100-source-audit-v1/audit.py
python3 artifacts/jev-depth-100-source-audit-v1/validate.py
python3 artifacts/jev-depth-100-budget-ceiling-v1/summarize.py
python3 artifacts/jev-depth-100-budget-ceiling-v1/validate.py
node artifacts/jev-depth-100-message-packing-v1/fixtures.mjs
python3 artifacts/jev-depth-100-message-packing-v1/summarize.py
python3 artifacts/jev-depth-100-message-packing-v1/validate.py
```

These require the recorded local dataset/tokenizer paths. Copy/extract to a separate
verification workspace; do not mutate immutable archives or repeat completed paid
runs. Original prefix analysis-lock outputs belong to the interrupted archive;
completed validation uses continuation/completion locks. The final report bytes,
producer sources, frozen settings, all wire/model responses, ledgers, cleanup records
and interpretation notes are preserved. No release, push or default change is implied
by completing this evaluation.

The budget-ceiling producer `run.mjs` refuses to overwrite existing output files.
To independently rerender it, retain the original results and restore its plan/source
dependencies into a separate workspace with empty budget-ceiling output paths.
The same-message candidate `run.mjs` likewise requires empty output paths; restore
its archived sources/dependencies in a separate workspace instead of overwriting
retained results. Neither offline producer needs credentials or makes provider calls.
