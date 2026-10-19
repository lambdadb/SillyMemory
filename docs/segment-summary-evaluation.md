# Segment-summary memory comparison

## Completed result and decision

On October 19, 2026, the fixed 50-question experiment completed with **44/50 (88%)**
for segment summaries and **47/50 (94%)** for fresh answers using retained Query1
retrievals. Retain this as a credible experimental comparator; the observed
three-question gap does not justify replacing source retrieval or declaring a
general winner. A fixed-policy 500-question comparison is worthwhile to estimate
the gap more reliably, but remains outside this completed 50-question scope.
No product defaults were changed and no tuning sweep was performed.

| Fresh answer condition | Correct / full cohort | Generated answers | Median answer input tokens |
| --- | ---: | ---: | ---: |
| Independent segment summaries, newest 3 + selected 2 | 44 / 50 | 49 | 3,784 |
| Captured SillyMemory Query1 source retrieval | 47 / 50 | 50 | 5,056.5 |

One invalid summary selection produced no answer and counts as incorrect in the
full-cohort score. Among the 49 generated summary answers, 44 passed the judge.
Input medians describe generated answers, not equal-size successful cohorts.
Paired outcomes: both correct 42, summary only 2, control only 5, both wrong 1.
The two apparent summary wins involve judge sensitivity or source interpretation,
not demonstrated retrieval gains. All six summary failures and both summary-only
wins were inspected against original evidence, summaries and delivered requests.

| Question type | Segment summaries | Fresh Query1 control |
| --- | ---: | ---: |
| User facts | 6 / 7 | 7 / 7 |
| Assistant facts | 5 / 6 | 6 / 6 |
| Preferences | 2 / 3 | 1 / 3 |
| Multi-session | 11 / 13 | 12 / 13 |
| Temporal reasoning | 13 / 13 | 13 / 13 |
| Knowledge updates | 7 / 8 | 8 / 8 |

The complete score, IDs and stage aggregates are in the
[result record](benchmarks/segment-summary-results-v1.json); the executed settings
and producer hash are in the [frozen plan](benchmarks/segment-summary-plan-v1.json).
These are consumed-cohort development results, not independent roleplay validation.

## Measured workload and cost

| Stage | Completed calls | Input tokens | Output tokens | List-rate USD | Median HTTP time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Build independent summaries | 637 | 6,027,933 | 347,458 | 18.5422 | 12.276 s |
| Select older summaries | 50 | 408,211 | 3,159 | 1.0520 | 2.831 s |
| Answer from summaries | 49 | 187,369 | 2,886 | 0.4944 | 2.248 s |
| Fresh control answers | 50 | 252,119 | 2,863 | 0.6560 | 2.141 s |
| Judge both arms | 99 | 19,910 | 159 | 0.0514 | 0.715 s |

Summary construction + selection + answering costs **$20.0887** for this replay;
all new provider work, including control answers and judging, totals **$20.7960**.
The $49.7024 ledger reservation is a conservative ceiling charge, not actual usage
cost. Input/cache-write categories are preserved in the result record; recorded
cache hits were zero. These estimates exclude historical control indexing/search,
database storage, infrastructure and future repeated queries. Construction is the
accumulated cost of processing the full histories, not a charge on every new turn.
Selection is an additional online model call; HTTP times exclude retrieval and
host overhead and do not establish an end-to-end speed comparison.

All 637 summaries met the 400-word target under whitespace counting (maximum 393).
Successful selected-memory payloads had median 2,832 and maximum 2,949 tokens,
below the 4,096-token cap. There were 885 actual HTTP calls, all HTTP 200, with no
network or quality retries; one selector response was semantically invalid. The
ledger also retains three proven undispatched intents described below. Total wall
time was 39.46 minutes, including the execution correction.

## What the errors show

| Case | Inspected mechanism |
| --- | --- |
| `bc8a6e93` | Selection-contract failure: the cake fact survived in `memory-9`, but the selector also chose an already included newest memory. No answer was dispatched; score remains incorrect. |
| `gpt4_a56e767c` | Selection capacity: all four film festivals survived across three older summaries. Only two older summaries could be selected, so Portland was not delivered. |
| `d851d5ba` | Selection loss plus reference ambiguity: two of four labeled fundraising amounts were left out. A newest summary also contained an actual user-reported $5,000 benefit excluded by the official $3,750 reference. Keep the official incorrect label. |
| `09d032c9` | Answer-use failure: the selected summary retained ownership of a power bank, but the answer gave generic battery tips. Both arms failed the personalization rubric. |
| `07741c45` | Temporal reinterpretation: the summary kept a future shoe-rack plan instead of the labeled current location. Both relevant summaries were selected. The original session also contains later contradictory future wording, so this is not a clean source-consistency example. |
| `1903aded` | Clear summary omission: the original 15-job list's seventh item was "Transcriptionist." The summary retained only that 15 jobs were suggested; the selected summary could not answer an ordinal question. |

The two summary-only passes also need qualification. For `75f70248`, both answers
connected sneezing to the shedding cat/dust, but only one passed the automated
rubric. For `51c32626`, both inputs contained an ACL paper and February 1 deadline;
the summary answer supplied the date with a caveat, while the control declined to
equate a conference deadline with the user's actual submission date.

Independent summaries therefore avoid repeatedly overwriting the entire historical
memory, but still lose detail and temporal distinctions within each segment.
Selection capacity and answer interpretation are separate failure sources. This
experiment does not support attributing every wrong answer to summary compression.

## Decision and scope

Test whether independently retained segment summaries plus LLM selection are a
competitive memory baseline against captured SillyMemory Query1 retrieval on the
same 50 previously consumed LongMemEval-S questions. This is an approximation of
a verbally described character-chat design, not a reproduction or claim about a
named service's implementation. No product defaults, database, UI or branch model
change. The decision is whether this fixed baseline merits a full 500-question
comparison; no 500-question expansion or tuning sweep is included in this run.

The existing native rolling-summary comparison scored 16/50 while historical
Query2 retrieval scored 38/50 and full history 44/50. These are historical context,
not the new control. See [the original comparison](product-comparison.md).
The new control generates fresh answers using retained Query1 actual-host requests.
Retrieval itself is not repeated, and this is not the later 95% source-assembly
method. Both new arms are direct provider calls, not live browser tests.

## Frozen method

- Use the original stratified 50-question summary subset from the 500-question
  cleaned LongMemEval-S source lock. All questions are consumed development data.
- Retain the same four historical messages plus the active question as the captured
  Query1 host requests. Verify exact role/content agreement before any model call.
- Process older history in its supplied source order in segments of at most 40 messages (about
  20 user/assistant exchanges). Move an internal boundary back one message rather
  than split an adjacent user/assistant pair. Preserve session/date metadata even
  when a segment begins partway through a session. This count is an experimental
  assumption, not a measured production setting.
  Original dates are retained without repairing occasional out-of-order timestamps.
- Summarize each segment independently with a 400-word target. The prompt requests
  concrete facts, attribution, chronology, changes and unresolved commitments.
  It never receives the final question, gold answer or evidence labels. Do not
  rewrite earlier summaries. The last partial older segment is flushed at the
  evaluation checkpoint; it is not left unrepresented or added as extra raw text.
- Include the latest three summaries. One LLM request reads **all** other summaries,
  the newest three, the same recent dialogue and the question, and selects exactly
  two distinct older IDs. With five or fewer summaries, include all without a call.
- Include selected summaries in source order, without restoring their raw source.
  They must fit a 4,096-token memory budget including the wrapper. Invalid IDs or
  overflow count as an operationally failed question, rather than clipping summaries,
  dropping a selected item or asking the selector to try again. The control still runs.
- Preserve the captured host's three setup messages, four recent messages, question,
  final guidance, model and response settings. Only replace retrieved excerpts
  with the summary memory as one quoted system message; the control retains its
  native user/assistant excerpt roles. This retains the historical host instruction referring
  to recalled excerpts; it does not add a summary-specific answering advantage.
- Generator, summarizer and selector: `gpt-6.1-sol`, low reasoning, maximum 4,096
  completion tokens; 32,768 total context ceiling. Judge: `gpt-4o-2024-08-06`,
  temperature 0, maximum 10 output tokens, unchanged pinned official prompt.
  Alternate which answer arm runs first by dataset order.

The prepared workload contains 637 summary requests, up to 50 selections, 100 fresh
answers and 100 judgments. Maximum 887 dispatched provider requests, $60 in conservative
pre-dispatch reservations (input $2.50/M, output $10/M), four concurrent requests,
and two hours from the first persisted run start. These are execution ceilings,
not actual charges. Actual usage, cache categories and stage timings are retained.
No automatic retries, quality retries, prompt tuning, silent input truncation or
question replacement. A transport uncertainty leaves durable intent and stops;
a completed unsuccessful HTTP or invalid model response is retained for diagnosis.
Invalid summary selection skips its answer and judge and counts as incorrect in
the full-cohort end-to-end score. Report that separately from judged wrong answers.

### Procedural correction during execution

The first pass stopped after `bc8a6e93` selected `memory-13`, one of the three
already included newest summaries. Keep that unsuccessful response. Version 1.1
continues other questions while counting this and any subsequent selection/budget
failure as incorrect; it does not change prompts, segmentation, models or memory
budgets and does not regenerate successful calls. The original runner also masked
the originating error with a later cancellation and reserved three calls after
cancellation, before its pre-fetch check. Their awaited predecessors completed
after the selector failure, establishing that those three intents never reached
fetch. Original state/receipts remain under `attempt-1`; recovery records retain
each intent and the receipt hashes establishing that ordering. The ledger ceiling
is 890 slots to retain those three conservative reservations; the dispatch ceiling,
$60 bound and original two-hour start remain unchanged. This is a disclosed
post-start execution-policy amendment, not a second independent experiment.

## Reproduction and retained evidence

`segment-summary.mjs` contains the memory algorithm. `segment-summary-eval.mjs`
reuses the existing dataset adapter and durable checkpoint mechanism. It requires
the public checksum-locked dataset and pinned official evaluator, an installed
`tiktoken` from the host environment, and the retained 50 captured Query1 request
bodies. Historical captures are local-only; a fresh clone cannot reproduce this
exact control without the original archive listed in `product-comparison.md`.
Supply credentials through `SM_ENV_FILE` outside this worktree. They are neither
copied nor placed in requests saved to the evidence ledger.

```sh
node scripts/segment-summary-eval.mjs prepare OUT DATA BASELINES JUDGE TOKENIZER_ROOT
SM_ENV_FILE=/outside/worktree/.env.local \
  node scripts/segment-summary-eval.mjs run OUT DATA BASELINES JUDGE TOKENIZER_ROOT
```

Preparation verifies dataset bytes, the native recent-message partition and source
context sizes, then freezes IDs, input/code hashes, model settings and limits.
The runner refuses a changed plan or changed replay request. Full prompts, replies,
intermediate summaries and checkpoints stay under ignored `artifacts/`.

## Analysis requirements

Report paired accuracy and question-type breakdown, disagreements with the fresh
control, and summary construction / selection / answer / judge usage separately.
Selection and answer HTTP time approximate the online compute path; history replay
is a one-time construction workload. None of these establish user-facing latency.
Count summary target overruns without regenerating them. Trace wrong answers against
original evidence, saved summaries and selected IDs: source evidence absent from
summaries, preserved but unselected evidence, and errors despite delivered evidence.
Session selection alone is not evidence retention. Mark ambiguous or mixed causes.
Gold labels are available only to offline diagnosis and the judge.

Stage cost estimates use October 19, 2026 Standard list prices from the official
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and
[GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o) pages. Sol input,
cached input, cache writes and output are $2 / $0.10 / $2.50 / $10 per million
tokens; judge input/cached input/output are $2.50 / $1.25 / $10. Cache hits and
writes are subtracted from ordinary input before pricing. These are receipt-based
list-rate estimates, not invoices. Control retrieval/construction is not rerun or
priced here; its answer cost alone must not be presented as its total service cost.

## Verification and retained producer

- `npm test`: 372 passed, including three new focused memory-contract tests.
- `npm run check`, `npm run check:release`, `npm run check:sdk`: passed.
- `node --check` for every maintained script and test: passed.
- Fresh `prepare` with the final runner: all 50 cases verified, 637 summaries,
  887 maximum dispatches; no provider calls.
- Independent offline audit: exact original older-history coverage and unchanged
  recent messages/system shell for all 50 cases; selected payloads match requests;
  every retained completed receipt checksum passed. Independent Python arithmetic
  reproduced all stage call counts, scores and list-rate totals.
- No database resources, browser profiles or background servers were created.
  The provider runner exited and released its ledger lock. Secret-content scanning
  found zero credential matches across 2,078 retained evidence files.

The executed v1.1 producer and initial failure/recovery state are retained with the
run. The maintained v2 runner removes the one-off recovery acknowledgments and
three extra ledger slots; its summary/selection/answer semantics are unchanged.
It also includes adapter sources in the code binding and corrects the informational
`finalFlush` flag for a 39-message final segment (`0e4e4c46` in the historical run).
That flag does not affect requests, source coverage or scoring.
Use the archived producer when resuming or verifying this historical ledger, not
the cleaned runner's different code binding. The final runner passed offline
preparation and local checks; no second paid cohort was run after that cleanup.

Full prompts, responses, source requests, all intermediate summaries, the pinned
judge, eight reviewed error/disagreement cards, original failed attempt and recovery
proofs remain local-only under `artifacts/segment-summary-v1/`. The original dataset
and control archive remain separately available at their recorded source locations.
No large historical fixture or private absolute path is required by CI.

Verified archive: `artifacts/archive/segment-summary-completed-v1.tar.gz`, SHA-256
`170fb030b259d04f90f10b37b07bd231f0e67182df7bc71f7cc8b4ab66eb9989`.
All 2,078 file members were read back and matched the retained source bytes.
An adjacent manifest lists individual hashes. This archive is local-only in the
`sillymemory-segment-summary-evaluation` worktree and is unavailable from a fresh
clone. Restore its producer overlay onto base `a9d84b9` for historical reproduction;
the separately pinned public dataset and tokenizer environment are also required.
