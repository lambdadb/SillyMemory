# LongMemEval development comparison — 2026-10-02

The frozen **14-question, 70-answer comparison is complete** through the actual
SillyTavern host, OpenAI and LambdaDB managed embeddings. It reused eight verified
pilot answers and generated/judged 62 new answers. Owned remote data and native
indexes were cleaned up after every session. The 42 held-out questions remain
reserved.

SillyMemory answered 10/14 correctly with a median of 3,361.5 final-answer input
tokens. Plain 128K also answered 10/14, using 104,761 median input tokens, but they
missed different questions: one win and one loss for SillyMemory in paired results.
This supports continuing with the current policy as a low-input-token baseline;
it does not establish statistical equivalence or general superiority.

## Answer quality and final-answer input

| Condition | Correct / 14 | Median actual input tokens |
| --- | ---: | ---: |
| Plain 32K | 4/14 | 31,498.0 |
| Vector Storage 32K | 5/14 | 31,491.0 |
| Summarize 32K | 6/14 | 31,318.5 |
| SillyMemory 32K | 10/14 | 3,361.5 |
| Plain 128K | 10/14 | 104,761.0 |

SillyMemory's median **paired** input reduction was 89.30% versus native Vector
Storage and 96.81% versus plain 128K. It won five and lost zero questions against
Vector Storage, and won four and lost zero against Summarize. These are descriptive
counts on the development cohort. Input tokens describe the final answer request,
not the entire memory-maintenance cost.

| Stratum (two questions each) | Plain 32K | Vectors | Summary | SillyMemory | Plain 128K |
| --- | ---: | ---: | ---: | ---: | ---: |
| abstention | 1/2 | 1/2 | 1/2 | 2/2 | 2/2 |
| knowledge-update | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| multi-session | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 |
| single-session-assistant | 0/2 | 0/2 | 1/2 | 2/2 | 2/2 |
| single-session-preference | 0/2 | 0/2 | 1/2 | 2/2 | 1/2 |
| single-session-user | 1/2 | 2/2 | 1/2 | 2/2 | 2/2 |
| temporal-reasoning | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 |

Native Vector Storage inserted no additional memory block in 10/14 questions.
It did improve the user-fact question `a06e4cfe` over plain 32K. Its default query,
threshold, insertion and protection behavior is part of the measured condition;
this result is not a claim that native retrieval always adds nothing.

## Remaining quality failures

All four SillyMemory errors are in multi-session or temporal reasoning. Offline
source-coordinate inspection found the labeled messages in valid candidate sets:

- `d23cf73b`: four labeled messages were candidates, but only three reached memory
  selection. The answer omitted the fourth cuisine.
- `gpt4_7a0daae1` and `gpt4_2f584639`: each needed two dated facts; only one labeled
  message was selected. The answers respectively abstained and chose the wrong
  gift order. The 800-token whole-passage selection policy deserves attention.
- `gpt4_2ba83207`: the outgoing prompt did include the gold-bearing store/amount
  passage, but the answer chose a different store. Plain 128K also missed it.

These observations separate candidate retrieval, selection and answering. They
are not exact-search/ANN recall measurements. Source-message labels are coarser
than answer spans; the retained prompts were inspected for the examples above.
Full 128K is a full-history reference, not an oracle: it missed both multi-session
questions and one temporal question. Released date/order anomalies were preserved,
and no official score was replaced after inspection.

### Cached-candidate selection diagnostic

The secondary queries in the missed examples came from unrelated prior dialogue:
climate policy for the cuisine question, book recommendations for tennis dates,
and assistive technology for gift order. Equal-rank interleaving brought unrelated
passages into the 800-token selection. This is a concrete selection input issue,
not evidence that ANN failed to return the relevant passages.

A one-off **offline replay** exactly reproduced all 12 fresh SillyMemory selections
(text, passage IDs and tokens) with the pinned host tokenizer contract. Replaying
only the already received primary-query candidates at the same 800-token budget
increased labeled-message selection in five cases and reduced it in none:
14 → 20 of 21 labeled source messages across the 11 non-abstention cases.
The final gift-order case still omitted one labeled message. The two old pilot
traces were not invented or replayed. There were zero new retrieval/provider calls
and no new answers or quality scores. Labels are incomplete/coarse evidence;
some original correct answers did not select a labeled message.

This is a direction for a bounded primary-priority/context-gating comparison,
not a reason to ship primary-only retrieval: real follow-up questions can depend
on prior context. Preserve the current run as the baseline, check existing
follow-up regressions, and measure answer quality before selecting a new policy.

## New-work usage and bounds

| Work | Received calls | Input tokens | Output tokens | Uncached-price estimate, USD |
| --- | ---: | ---: | ---: | ---: |
| Answer | 62 | 2,635,994 | 5,150 | 1.063 |
| Summary | 609 | 16,572,010 | 146,688 | 6.864 |
| Judge | 62 | 14,357 | 103 | 0.037 |
| Native embeddings | 2,703 | 1,248,974 | — | 0.025 |

Known successful OpenAI usage is approximately **USD 7.988** at the frozen plan's
price assumptions, before cached-input discounts. The conservative reservation,
including two unknown deliveries, is **USD 11.144 / 13**. This is not an invoice:
it excludes original pilot spending, LambdaDB charges and provider adjustments.
There were 735 completion attempts (733 received successes plus two unknowns),
including two of the allowed 16 extras. Native embeddings had 2,703 received
successes and no recorded failed attempt.

LambdaDB recorded 354 non-cleanup requests, 10,910 document-write attempts,
1,319,230 estimated input tokens and 10,307,409 POST bytes. All eight created owned
collections were verified inaccessible after deletion/previous cleanup. Those
counts include transport-gate setup and resumed sessions. They are workload
observations, not managed-provider token usage or a LambdaDB billing calculation.
The run completed within its original six-hour window without resetting limits.

Ingestion and rolling-summary replay are setup/history-maintenance work in this
experiment. They are reported separately from final-answer generation and would
be amortized across subsequent questions in an ongoing chat. The new-work usage
also excludes the two reused pilot histories; it is not an equally sized per-arm
production cost comparison. Managed embedding charges are not inferred from the
native OpenAI embedding bill.

## Method and interpretation

The product question is whether SillyMemory preserves useful long-history answer
quality with fewer final-answer input tokens than the host's plain, Vector
Storage and Summarize conditions. The frozen
[development plan](benchmarks/development-plan-v1.json) selects 14 questions,
two per stratum, and five conditions per question. The 42 held-out questions remain
untouched. No product code, host core, retrieval ranking or memory budget changed.
This is a host-adapted development comparison, not an official leaderboard score.

The host is SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Generation uses
`gpt-4.1-mini-2025-04-14`, temperature 0 and a 1,024-token output cap. Judging uses
the pinned official LongMemEval prompt and `gpt-4o-2024-08-06`. Gold answers and
labels enter only the judge and offline analysis, never the host/index/query.
The eight original pilot rows are reused after input, runtime and settings checks;
their original observation gaps and earlier execution date remain attached.

- Plain: host history assembly at 32,768 and 131,072 context.
- Vector Storage: real built-in backend, OpenAI `text-embedding-3-small` through
  a loopback `vllm`-compatible bridge, with frozen default insert 3, protect 5,
  query 2, chunk size 400 and threshold 0.25. This is a remote embedding condition,
  not a local-model hardware or latency measurement.
- Summarize: Main API, automatic/default builder, 200 requested words and interval
  10. History is replayed as message-render events so the host generates successive
  summaries. The final stored summary is frozen during answer generation to avoid
  an extra post-answer summary racing the observation. All prior summaries and
  their usage are retained; importing a JSONL and immediately asking a question
  would not reproduce this accumulated-summary state.
- SillyMemory: managed embeddings through the built-in CORS proxy, ordinary upsert
  batches of at most 50, `knn.queryText`, recent 12 messages and an 800-token memory
  budget. No user-side embedding provider integration is required for this arm.

The cohort has roughly 100K-token histories. At 128K the host preserves every
nonempty source message; 32K plain truncates older history. This is a controlled
context-pressure workload, not a claim about every character-chat history length.
The adapter preserves released chronology/date anomalies. Only four legacy macro
spellings in two messages of `60bf93ed_abs` need uniform fullwidth-delimiter
literalization; original and adapted hashes are retained for every arm.

Quality counts use the official scorer's rule. Source-coordinate diagnostics are
coarse `has_answer` message coverage, not answer-span coverage or ANN recall.
Candidate retrieval, selected passages and actual outgoing role/text are checked
separately. A valid but unselected candidate is not automatically an ANN miss;
a delivered gold-bearing passage followed by a wrong answer does not establish a
retrieval failure. No score is changed after manual inspection.

The conditions differ in chunking, query construction, retrieval/selection and
history assembly. This is an end-to-end product comparison, not an isolated ANN
engine or embedding-model ablation. Empty native memory blocks are observed
outcomes; raw native search rankings were not retained, so their precise cause is
not reconstructed as a measured fact. This public assistant-dialogue QA subset
also does not establish roleplay quality, multilingual behavior or freedom from
model-training contamination.

## Execution and recovery

A test-only loopback bridge receives requests built by the actual host and owns
provider keys, spacing and receipts. It is benchmark tooling, separate from the
installed UI extension. The maintained live executor reserves each call before
dispatch and persists the
complete response and host observation before validation. Identical saved answers
skip reindexing and generation; a missing judge alone invokes the judge. Native
embedding replay consumes exact prior batch occurrences, without introducing new
cross-request caching within an ordinary run. An exclusive lock prevents a second
writer. Keys stay in the sender closure/browser memory, outside reports and saved
host settings.

The original bounds remain: 62 new answers, 62 judges, at most 643 new summaries,
783 total completion attempts including at most 16 extras, USD 13 OpenAI
reservation, 10,000 native embedding calls/40,000 inputs/5M reserved tokens, 3,000
LambdaDB non-cleanup requests, 30 collections, 30,000 document-write attempts,
5M managed input-token estimate and 100MB POST bodies. Completion starts are at
least 15 seconds apart. The six-hour window includes interruption/recovery time.
Historical frozen prices are accounting assumptions, not a current billing quote;
LambdaDB billing and original pilot spending are separate.

Complete HTTP 500/502/503/504 responses permit bounded retries: at most three
attempts and 180 seconds for a logical request, within aggregate limits. HTTP
401/429, invalid successes and ordinary native embedding failures are not retried.
An interrupted response leaves unknown delivery pending and charged. Recovery
requires inspection; the summary-only acknowledgment retains that pending intent,
allows a remaining attempt and starts its bounded delivery window when replay
reaches that exact request. This acknowledgment accepts only unfinished summary
attempts; it cannot invent a response, reset aggregate reservations or extend the
original six-hour window.

Two causes required three inspected resumptions:

1. The pinned native “Vectorize All” handler returned while background indexing
   held its lock, before all source hashes existed. The harness now drains and
   verifies completion, with at most four attempts. It reuses matching embedding
   receipts. This is orchestration around unmodified host code.
2. Two separate summary calls yielded no complete response within 90 seconds.
   Their HTTP status and remote processing/billing remain unknown. Each succeeded
   after an explicit inspected retry; all four attempts remain reserved. Previous
   summaries and
   answers were reused rather than rerun. The original plan, runtime and start
   time stayed fixed.

All three interrupted reports, checkpoint states, source archives and one-off
recovery
scripts are retained with hashes. The final report records the source-continuation
chain; it is not presented as an uninterrupted single-revision execution.
Owned remote collections are recorded before create and deleted only after owner
checks. Cleanup verifies subsequent inaccessibility, not physical erasure. Native
indexes are purged and listed empty; disposable host/profile directories are removed.

## Validation and reproduction

Unit/loopback/process checks cover request bounds, receipts, incomplete delivery,
retry caps, cached replay, locks, native completion and zero-hit observations. A
separate actual-host/local-service fixture completed all five conditions for one
case after deliberate interruption at the saved-observation boundary. It reused
the saved answer and cleaned both fixture stores and the host profile. These
fixture answers are not paid quality evidence. The final startup-lock refinement
also passes the actual-host local fixture
interruption/resume path. Separate competing-process checks verify unchanged
report bytes on either held lock and release of the run lock when provider
initialization fails.

```sh
npm ci
npm test
npm run check
npm run check:release

# Requires the verified dataset/scorer cache and installed pinned host checkout.
ST_SOURCE=/absolute/path/to/pinned-SillyTavern \
  node scripts/benchmark-development-live.mjs \
  /absolute/path/to/audit-cache artifacts/development-live-v1.json \
  /absolute/path/to/sillymemory/.env.local

# Local services only; no credentials or external provider calls.
ST_SOURCE=/absolute/path/to/pinned-SillyTavern \
  node scripts/benchmark-development-live.mjs \
  /absolute/path/to/audit-cache artifacts/development-fixture.json \
  --fixture --stop-after-observation
# Repeat without --stop-after-observation to check saved-observation recovery.
```

The same output path resumes only matching bindings. Completed runs are read-only.
Never remove a live writer lock or delete state to obtain a fresh budget. An old
lock requires checking the PID and inspecting unknown delivery first. There is no
exactly-once remote execution guarantee.

The earlier 70/70 deterministic host preflight, including 706 local marker
summaries, is summarized in
[the preflight manifest](benchmarks/development-preflight-summary-v1.json).
It checked host assembly and transitions without paid provider quality evidence.
Its original reports/producer sources remain in the local-only PR38 archive named
by that manifest. Historical observations require their archived producer, not the
latest validator. CI uses compact synthetic cases rather than old large reports.


## Evidence retention and next decision

The [small result manifest](benchmarks/development-live-summary-v1.json) records
aggregate results, source bindings, checksums and validation boundaries. The paid
producer is `c1d8eb9309aa181fdfdcd27043c4254332c231ee`, with two inspected earlier
source continuations retained in the report. The subsequent startup-lock fix was
checked with local services; it did not rerun or alter paid answers.

Full reports, HTTP receipts, prompts, recovery scripts, one-off analysis and source
archives are retained under ignored `artifacts/archive/development-live-v1/`.
They are **local-only**, unavailable in a fresh clone and not uploaded with this PR.
The bundle excludes credentials, the dataset cache, host dependencies and browser
profiles. Obtain the locked dataset separately under its source terms. Verify the
manifest checksums before extraction; use the archived paid producer for its
source-bound checks. Current CI checks small invariants, not this historical run.
The complete unit suite passes 308 tests; runtime/tool syntax and release metadata
checks pass. Unit/local-service fixtures and paid quality results remain separate.

## Primary-priority follow-up: reject the change

The cached LongMemEval diagnostic alone is insufficient to change the product.
A subsequent offline gate fixed three candidates before replay: take two primary
hits per contextual hit, three per contextual hit, or all primary hits first.
Keep query construction, returned candidates, local-source checks, packing and
each case's budget/recent window unchanged. Ranking sees no answer labels.
Adoption required a development source-selection gain with **zero losses of
previously selected required evidence in either cohort**. Prefer 2:1, then 3:1,
then primary-first if more than one qualifies. All three failed this gate.

| Ordering | Follow-up sources selected / 190 | Follow-up losses | Development labeled sources selected / 21 | Development losses |
| --- | ---: | ---: | ---: | ---: |
| Current equal interleaving | 182 | — | 14 | — |
| Primary 2 : context 1 | 176 | 6 | 19 | 0 |
| Primary 3 : context 1 | 176 | 6 | 20 | 0 |
| All primary hits first, then context | 174 | 8 | 20 | 0 |

Follow-up evidence reuses all 218 existing case/budget rows: 62 historical search
cases at 320/400/800 tokens and 32 historical generation observations at 320.
The original 94 selections and token counts reproduce exactly; current packing
also matches those original selections. The 12 fresh development observations
with retained retrieval traces reproduce exactly, including memory text/tokens.
The two reused pilot rows lack that trace and are excluded from this diagnostic.
The development denominator counts labeled source messages; the follow-up
cohort checks required quotes. They are different measures, both reuse known
inputs, and neither counts correct generated answers or independent samples.

Even 2:1 loses the Korean banner fact at budget 400 in six controls: long
reference, first-user, assistant-topic, blank-assistant, retained-answer and
blank-user. These controls share the same source fact; they are six failing
configurations, not six independent conversations. Primary-first additionally
loses the Korean observatory reference at 320 and 400. A LongMemEval-only gain
would therefore conceal a regression in conversational reference handling.

**Keep the existing v5 query policy, equal interleaving and 800-token default.**
This closes the proposed primary-priority change. No product implementation,
provider call, new answer/judge, host run or held-out evaluation was made for
this follow-up. The previous 10/14 quality result is unchanged. The gate prevented
paid validation of a candidate already known to lose required sources; it does
not establish that future policies cannot improve. No arbitrary language,
question-length or case-ID exception was added to rescue a failing candidate.

The existing [manifest](benchmarks/development-live-summary-v1.json) includes the
compact result, six loss identities and a separate 27 KiB local-only archive
checksum. That archive holds the fixed plan, one-off replay, full results, input
hashes and check logs. It depends on the separately retained baseline evidence;
restore both to reproduce without provider calls. No new maintained runner or
separate experiment PR is added. The replay checkout at `945973e` passes its
275 unit tests plus syntax/release checks; those checks are distinct from the
308-test PR39 suite and from paid quality evidence.

Next, freeze the unchanged policy/settings and aggregate cost/time bounds for
the reserved 42-question held-out evaluation. Do not add another selection-tuning
round or repeat the completed development comparison by default. Keep held-out
answers out of tuning and report multi-session/temporal failures alongside the
aggregate result. Any promotion or release remains a separate decision; these
development results do not establish general quality or release readiness.
