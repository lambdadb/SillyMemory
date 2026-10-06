# Deployed Bayesian evaluation with a temporary dev SDK

SDK version references identify the historical evaluation producers and decisions,
not the current product dependency. See [SDK migration](sdk-migration.md) and
[package.json](../package.json) for the reviewed product pin.

## Scope and decision

An isolated evaluation temporarily installed
`@functional-systems/lambdadb@0.7.0-dev.37433431398001`, resolved from the `dev`
tag on 2026-10-06, and rebuilt its browser bundle. The dev dependency, bundle
and SDK-specific test are experiment inputs retained in the local evidence archive.
They are not proposed product changes. The maintained extension remains pinned
to SDK 0.7.0 and uses vector-only retrieval. Bayesian and Jev were explicitly
requested by the comparison producers.

The application adapter, source identity, validation order, error classification,
retry policy, session-only keys, direct CORS, branch/scope isolation, query
construction and selection limits were unchanged in the temporary checkout.

The product question is whether the deployed API works with this SDK and whether
Bayesian + Jev preserves or improves current facts and temporal answers at the
existing 800-token budget. This follows the
[earlier local-fusion experiment](https://github.com/lambdadb/SillyMemory/pull/63),
which did not call a deployed Bayesian API.

## Frozen comparison

Twelve exposed English cases were frozen before service calls:

- All six knowledge-update questions from the earlier LongMemEval split, including
  the weight and mortgage failures and historical-tutor/schedule controls.
- Two previous temporal failures: elapsed days between ukulele lessons and guitar
  servicing, and ordering the charity bake sale and gala.
- Four existing synthetic controls: current location, future location, canceled
  meeting and the ferry briefing changed from 09:20 to 10:45.

These are consumed diagnostic questions, not fresh held-out validation. Public
LongMemEval source, original adaptation hashes, released answers and existing
synthetic source were preserved. Gold answers and evidence labels were excluded
from queries and provider prompts. Original session-date markers stay on the first
turn of each session; the question carries its original date marker. They are
source context, not inferred message creation or ingestion times.

All arms use managed `text-embedding-3-small`, the same English-only `text_en`
field, source corpus, owner/scope filter and explicit `chat_eval` branch with
`consistentRead=true`. Original query text is sent with `skipSyntax=true`; there
is no manual word OR. Compare vector-only, server RRF + Jev, and server Bayesian
+ Jev at `k=30`, `size=30`, and rerank `candidateSize=30`. Jev uses
`typesafe` / `jev-1.13.0`, `fields=[text]`, default criteria and `onFailure=error`.
Every rerank result must report `status=applied` and matching candidate/scored
counts. No fallback counts as a successful comparison.

```js
const request = {
  query: {
    bayesian: [
      { knn: { field: 'embedding', queryText, k: 30, filter: scopeFilter } },
      { bool: [
        { ...scopeFilter, occur: 'filter' },
        { queryString: { query: queryText, defaultField: 'text_en', skipSyntax: true }, occur: 'must' }
      ] }
    ]
  },
  size: 30,
  ref: { kind: 'branch', name: 'chat_eval' },
  consistentRead: true,
  includeVectors: false,
  rerank: {
    provider: 'typesafe', model: 'jev-1.13.0', queryText,
    fields: ['text'], candidateSize: 30, onFailure: 'error'
  }
};
```

Bayesian takes exactly two unboosted signals and no caller fusion weights. Without
reranking it requires top-level `candidateSize`; with reranking that field is
omitted and `rerank.candidateSize` supplies the budget. The preflight verifies
fixed-budget result prefixes at output sizes 1 and 3, missing-budget HTTP 400,
managed writes/reads, applied rerank and preservation of Bayesian `retrievalScore`.
Heuristic fusion scores are not calibrated relevance probabilities.

Actual answers go through pinned SillyTavern 1.19.0 Generate, GPT-6.1 Sol with
low reasoning, 4,096 maximum completion tokens, nonstreaming and 32K context.
Source chunking, two-query interleaving, chronological rendering and the
800-token selector remain unchanged. LongMemEval keeps 12 recent messages;
synthetic location/cancellation cases keep 4 and the original briefing keeps 8.
The host replays captured live server rankings while checking exact source,
revision, coordinates, selected text/tokens, recent messages and the final API
prompt. This avoids duplicate uploads and is actual-host retrieval replay,
separate from a full live synchronization experiment.

## Results

All 36 quality answers completed. Each exact answer was inspected against source
and the released answer or existing synthetic rule. This is coding-assistant
review, not independent human review or a new official LongMemEval judge run.

| Cohort / measurement | Vector | RRF + Jev | Bayesian + Jev |
| --- | ---: | ---: | ---: |
| LongMemEval answers | 3/8 | 6/8 | 6/8 |
| Synthetic answers | 4/4 | 3/4 | 4/4 |
| All answers | **7/12** | **9/12** | **10/12** |
| All labeled LongMemEval turns selected | 2/8 | 5/8 | 6/8 |

Bayesian gains three answers over vector and one over RRF, with no losses in this
set. The RRF gain is the previously known current-location regression; on these
eight natural long-dialogue questions, the two hybrid arms tie. Label overlap is
not complete semantic evidence and does not necessarily improve answer accuracy.

| Case | Expected answer | Vector | RRF + Jev | Bayesian + Jev |
| --- | --- | --- | --- | --- |
| cf22b7bf, weight update | 10 pounds | Fail | Pass | Pass |
| 852ce960, mortgage update | $400,000 | Fail | Fail | Fail |
| 8fb83627, magazine count | Five | Fail | Pass | Pass |
| ce6d2d27, cocktail class | Friday | Pass | Pass | Pass |
| 603deb26, Negroni attempts | 10 | Pass | Pass | Pass |
| dfde3500, previous tutor | Wednesday | Pass | Pass | Pass |
| 4dfccbf7, elapsed days | 24 or 25 days | Fail | Fail | Fail |
| gpt4_98f46fc6, event order | Bake sale first | Fail | Pass | Pass |
| current-location | Attic cabinet | Pass | Fail | Pass |
| future-location | Pantry | Pass | Pass | Pass |
| canceled-meeting | No current meeting | Pass | Pass | Pass |
| long-en-correction | 10:45; 09:20 canceled | Pass | Pass | Pass |

There was one transient OpenAI HTTP 500 on the vector future-location request.
The existing transport policy retried the identical serialized request once and
received HTTP 200. No completed answer was regenerated. The actual-host setup
also observed one LambdaDB HTTP 503 during post-upsert visibility polling before
its successful gate query. Neither failure is hidden or counted as quality loss.
The earlier long-history run used an older generator/runtime and different
chunking; changes from that historical result cannot be attributed solely to
Bayesian or this SDK update.

## Interpretation

The weight update is omitted by vector packing, which answers 5 pounds; both
hybrid arms include the correction and answer 10. Both hybrid arms also recover
the bake-sale/gala ordering. The existing current-location regression improves
with Bayesian: RRF omits the current-location passage, Bayesian retains it.

The mortgage case remains incorrect against the released $400,000 answer:

- The primary result includes the later $400,000 passage at vector rank 3 and
  post-Jev rank 4 for both hybrid arms. It is not an absent ANN candidate.
- Interleaving unrelated contextual-query results uses budget before the later
  passage fits. Both hybrid prompts keep $350,000 and omit $400,000.
- Vector injects both full statements, including the later date, but the model
  explicitly chooses the initial $350,000 amount. The wording "when I got my
  mortgage" admits an initial-event reading; preserve that ambiguity and the
  released expected answer rather than treating "latest always wins" as a fix.
- A post-result primary-only packing diagnostic includes both statements in all
  three arms at 800 tokens. It makes no new query or answer call and does not
  establish a safe allocation policy. Prior allocation experiments already found
  regressions; unconditional primary-only selection is not adopted.

The ukulele/guitar question needs February 1 and February 25, a 24-day interval.
Both hybrid prompts contain the labeled events but neither date anchor. Their
session dates are on earlier source indices 379 and 407, while the events are at
383 and 415 (zero-based; UI message labels add one). All arms abstain. Bayesian additionally cites another guitar-related excerpt
as the event. This is a context/dependency loss, not proof that the generation
model cannot subtract dates supplied to it. A stronger model cannot reconstruct
omitted timestamps reliably.

National Geographic illustrates why label overlap is not exact evidence recall:
RRF omits labeled turn 467 but retains unlabeled turn 463 explicitly saying five
issues, and answers correctly. Bayesian also selects turn 467; that improves the
label metric without creating an additional correct answer.

The historical Juan question correctly remains Wednesday even though a later
exchange partner Maria meets Thursday. Preserve past states and query intent;
do not globally prefer newest narration or equate message time with event time.

The next useful product experiment is a bounded, source-grounded temporal/context
representation that preserves the date or correction needed by a selected event.
It must distinguish current-state questions from historical questions and use new
English controls after freezing the candidate. Search-default promotion needs
that answer-level validation; this diagnostic does not establish general Bayesian
superiority or multilingual quality.

## Temporary-checkout verification and retained evidence

- `npm test`: 316/316 on Node 24.15.0.
- `npx --yes --package=node@20.12.0 node --test tests/*.test.js`: 316/316.
- `npm run check`, `npm run check:release`, `npm run check:sdk`, all maintained
  script/test `node --check` commands and `git diff --check`: passed.
- Configured `npm run test:browser`: 37 pinned-host/Chromium checks with a local
  HTTPS emulator, including key reset, isolation and deletion; passed.
- Configured `npm run test:faults`: 69 pinned-host/emulator checks; passed.
- Live retrieval: 77 queries, 7,789 document submissions including the three-doc
  preflight, 13 owned Collections deleted and verified absent; no upsert retry.
  All 48 quality rerank operations were applied, plus one applied preflight.
- Separate actual-bundle/browser direct-CORS Bayesian probe: five checks passed,
  one additional Collection/three documents/two queries, applied Jev with original
  fusion scores preserved, no cookies/CSRF or browser-storage key, deletion
  verified by HTTP 404.
- Actual-host answers: 80 integrity checks, 36 quality answers plus READY,
  38 provider attempts including the preserved HTTP 500, maximum injection
  800/800 tokens. Reported successful-call usage including READY: 94,615 input
  and 821 output tokens. Failed-call usage/billing is unknown.
- Host setup created two additional Collections, wrote one gate document and
  made three queries including the transient 503. Both Collections were deleted
  and verified absent. All **16** owned Collections across the three live stages
  were removed; no pending cleanup remains.

Use `ST_SOURCE` pointing at a pinned host checkout whose extension symlink points
to this checkout for browser/emulator commands. The evaluator's 30-second service
timeout is separate from the unchanged 15-second product timeout. Observed median
query times were 251 ms vector, 657 ms RRF + Jev and 640 ms Bayesian + Jev on this
small sequential run; these do not establish serving cost, throughput or a stable
latency advantage. Managed embedding and reranker charges were not measured.
No new main promotion, deployment, release, full live synchronization cohort,
independent benchmark or multilingual experiment was performed.

A temporary SDK-specific regression used a tiny synthetic response to check
explicit candidate budgets, unchanged owner/scope filters, safe transport,
applied rerank metadata and retrieval-score preservation. The 316-test counts
above refer to that temporary dev-SDK checkout. The test remains in the archive
with the temporary dependency and bundle; it is not added to maintained CI.
The maintained 315-test suite and SDK 0.7.0 remain unchanged. These unit checks
are distinct from deployed-server evidence.
Detailed producers, inputs, candidate scores, prompts, answers, failed setup log,
packing diagnostic and cleanup receipts remain ignored evidence, not maintained
CI dependencies. The original failed browser command used an unconfigured default
host path and stopped before starting a host or making a service/model request;
the explicitly configured run passed.

The verified local-only archive is
`artifacts/archive/bayesian-live-v1/evidence.tar.gz` in the
`sillymemory-bayesian-sdk-validation` worktree: **4,846,316 bytes**, 40 verified
files plus the manifest, SHA-256
`f7ab9bd7ec4f86feab866cc776ac332ef1a6d09c7f7958d00df161e81128971e`.
Read-back checks matched every original file and found zero configured credential
matches. It contains the base source at fbae879, exact SDK/runtime patch, one-off
producers, frozen cases/protocols, full results and cleanup evidence. Existing
historical archives were not changed. This archive is not uploaded and is
unavailable in a fresh clone; the manifest and README record restoration needs.
Keep it before removing this worktree. Paid reproduction requires separately
supplied credentials, the pinned host/dependencies and a newly frozen protocol.

## Context versus capacity follow-up — 2026-10-06

**Decision: reject unconditional paired-turn/date expansion at 800 tokens. Keep
product SDK 0.7.0, vector-only search, the adjustable 800-token default and current
indexing unchanged.** A 1,600-token budget recovers omitted facts in these exposed
histories; explicit date provenance resolves the target elapsed-days question
with Bayesian candidates. Neither result establishes a safe universal default,
and pairing retrieval context is not a test of indexing whole conversation pairs.

### Fixed comparison

Use the same twelve English cases, literal source/questions, captured deployed
vector and Bayesian + Jev rankings, two-query interleaving and recent windows.
The original 800-token answers are the completed historical baseline, not fresh
concurrent completions. RRF is not rerun. Forty-eight new answers compare:

- **1,600 tokens:** unchanged source and production selector; only budget changes.
- **Context at 800 tokens:** retain hit order and exact source chunks; attach the
  nearest explicit dataset session marker, and add the immediately adjacent
  opposite-speaker turn's first chunk when the pair fits. Otherwise try the hit
  with its date context alone. Never cross explicit session or recent-window
  boundaries. Source roles, coordinates, revisions and verbatim bodies remain.

The date labels explicitly describe conversation-session time, not inferred event
or message-creation time. Gold answers and evidence labels do not drive selection.
The candidate is a final-context expansion in an ignored evaluator, not a new
embedding/index layout. It does not measure full user/assistant-pair indexing,
which could also change retrieval and synchronization behavior. Date-only 800-token
packing is retained as a local ablation without new generated answers.

The pinned SillyTavern/GPT-6.1 Sol setup and original instructions are unchanged.
Four arm orders rotate by case. The protocol caps 48 quality answers plus READY,
57 provider attempts, eight transient retries and one hour. No completed answer
is regenerated, no model is substituted and no new quality retrieval is issued.

### Completed answers and interpretation

All exact answers and final prompts were inspected against source by the coding
assistant. This is not independent human review or an official LongMemEval judge.
Mortgage answers describing both amounts are reported separately as **qualified**,
not silently counted as a resolved single-answer benchmark gain.

| Ranking / injection | Resolved against expected target | Qualified mortgage | Remaining unresolved |
| --- | ---: | ---: | ---: |
| Vector, original 800 (historical) | 7/12 | 0 | 5 |
| Vector, 1,600 | 10/12 | 1 | 1 |
| Vector, context at 800 | 6/12 | 0 | 6 |
| Bayesian + Jev, original 800 (historical) | 10/12 | 0 | 2 |
| Bayesian + Jev, 1,600 | 10/12 | 1 | 1 |
| Bayesian + Jev, context at 800 | 9/12 | 0 | 3 |

At 1,600, vector recovers weight (10 pounds), magazine count (five) and bake-sale
ordering. Neither ranking loses a previously resolved answer on this set. This
comparison also increases median provider input: vector 2,737.5 → 3,552.5 and
Bayesian 2,715 → 3,535.5 tokens, about 30%, not a measured service-latency claim.

**Mortgage:** both 1,600-token prompts retain initial $350,000 and later $400,000.
Both answers explicitly describe the discrepancy rather than hiding the later
statement. This supports the user's interpretation that an open answer can explain
both contexts. Answers were already free-form in the prior run; it is the released
$400,000 target that is narrow. The source's later statement is a recollection,
not an explicit refinancing correction, and "when I got my mortgage" permits an
initial-event reading. Do not force a latest-always-wins rule, relabel the released
answer, or claim a clear model error merely because it explains both amounts.
The context-at-800 candidate omits the later amount in both rankings and answers
only $350,000; expansion still competes with evidence for the same budget.

**Elapsed days:** increasing budget alone leaves the session anchors absent and
both models abstain. With Bayesian context-at-800, turns 383 and 415 and the
explicit February 1/February 25 session markers are retained; the actual answer
correctly calculates **24 days**. The earlier failure is therefore not evidence
of an inability to subtract supplied dates. The candidate combines date and pair
expansion, so this answer cannot establish a separate causal benefit of pairing.

Vector context-at-800 instead answers **zero days**, connecting the February 1
ukulele start to the earlier plan to service the guitar at turn 387. It omits the
released target's February 25 completed-visit turn 415. The earlier plan itself
is real source, and the question says "decided to take"; preserve that competing
interpretation rather than calling the result an arithmetic failure or an invented
event date. Date provenance cannot by itself identify which event is intended.

**Expansion regressions:** vector loses the previously correct historical Juan /
Wednesday answer. Bayesian loses the five-magazine update and bake-sale-before-gala
answer. The buddy chunks and repeated date labels consume capacity otherwise used
for relevant evidence. Local date-only packing retains Juan turn 153 and Bayesian
gala turn 146, unlike the combined candidate; it still omits the later magazine
count. This diagnoses separate pair-expansion and metadata-overhead costs, not a
validated answer-quality win for the ungenerated date-only ablation. Compact
provenance and targeted dependencies remain candidates, not adopted behavior.

All four existing synthetic controls pass in both new conditions and rankings:
current attic location, future pantry location, canceled meeting and final ferry
10:45 with canceled 09:20 excluded. Historical Juan passes at 1,600; its loss in
vector context-at-800 blocks treating the combined candidate as generally safe.

The previous [budget confirmation](budget-confirmation.md) found a ledger answer
regression at 1,600 on a different generator/cohort. Its baseline already had all
required facts and no improvement headroom. Do not pool that older result with
this GPT-6.1 Sol run or erase it. This exposed diagnostic set justifies offering
more capacity when relevant passages are omitted, not declaring 800 sufficient
or 1,600 universally better. Stop the planned comparison here rather than tuning
these consumed questions. A future product candidate should preserve compact,
explicit source/session provenance without unconditional partner expansion;
unknown session dates must stay unknown, and session time must not replace event
time. Pair indexing and a new default need separate supporting evidence.

### Validation and retention

The actual-host replay completed 48 quality answers plus READY, **49 provider
attempts with no retry**, 104 host integrity checks and the verified 15-second
send interval. Usage reported 144,714 input and 1,084 output tokens. Exact source,
rank mapping, selections, token limits, final-prompt delivery and provider/saved
answer equality passed. This is actual host/provider generation on captured live
rankings, not fresh quality retrieval or full live synchronization validation.
The inherited setup used two owned Collections, one document and two queries;
both Collections were deleted and verified 404, with no pending cleanup record.
Keys were absent from browser/host persistence and the retained evidence audit.

Stable SDK 0.7.0 remains byte-identical to the product baseline. `npm test` executed
315/315 passing tests; `npm run check`, `npm run check:release` and
`npm run check:sdk` passed. Temporary selector checks cover revision validation,
budget rejection, explicit date propagation and session/recent boundaries; these
are local evaluator checks, not new maintained tests or deployed feature proof.
No new emulator suite or fresh server Bayesian run was needed for this unchanged
product/doc-only result. No release, default promotion or deployment is included.

The local-only `context-budget-v1/evidence.tar.gz` bundle contains 29 verified files
plus a manifest, **5,090,984 bytes**, SHA-256
`b2e76de37feff6c0886f663a94c1e5bdbf8adf14bbc9300fbaa3b9b15840131a`.
Identical copies exist at `artifacts/archive/context-budget-v1/evidence.tar.gz` in
`sillymemory-context-evaluation` and the primary `sillymemory` worktree. They are
two copies on one machine, not a remote backup or downloadable fresh-clone input.
Every archived byte matched its source and configured-secret matches were zero.
Base fbae879, one-off selectors/runners, frozen protocol/rankings/selections,
full prompts/answers, explicit reviews, cleanup receipts and historical baseline
answers are preserved. The earlier Bayesian archive is unchanged. README and
manifest describe separately required pinned host/dependencies and credentials;
raw scripts remain ignored and are not added to CI or the product dependency graph.

## Compact session provenance follow-up — 2026-10-06

**Decision: prefer compact explicit session provenance over unconditional paired
expansion when that provenance is actually available. The bounded quality gate
passes; production date extraction, indexing, search and the 800-token default
remain unchanged.** Conversation time is not a general event timestamp, and host
`send_date` must not become an inferred story date.

### Frozen scope and results

Keep the twelve consumed English diagnostics, captured live vector/Bayesian + Jev
rankings, query order and 800-token limit. Generate one compact-date answer per
ranking: 24 answers. Baselines are the historical original-800 completions, not
concurrent repeats. Add six newly frozen authored temporal controls, comparing
baseline and compact provenance on identical **synthetic** candidate lists:
12 answers. They test elapsed days, past-event recollection, future plans,
cancellation, unknown dates and a fictional story calendar. These controls are
new representation/interpretation checks, not live retrieval or independent
holdout evidence. Inspect every exact answer and final prompt against supplied
source; this is assistant review, not an official or independent benchmark judge.

The candidate adds an inline conversation date to each verbatim excerpt and one
short session-versus-event explanation per memory block. It adds no adjacent turn,
changes no body or ranking, and never derives dates from host message timestamps.
Unknown session markers reset provenance. Dated histories use ordinary whole-chunk
greedy selection without collapsing excerpts across dates; no-date histories retain
shipped repetition packing. The marker parser is an ignored benchmark adapter,
not general extraction of character-story time. SDK 0.7.0 isolates the earlier
producer; the stable 0.8.0 upgrade is separately validated in PR #65.

| Ranking / source | Original 800 | Compact provenance at 800 | Previously resolved answers lost |
| --- | ---: | ---: | ---: |
| Captured vector, existing diagnostics | 7/12 | 8/12 | 0 |
| Captured Bayesian + Jev, existing diagnostics | 10/12 | 11/12 | 0 |
| Fixed synthetic lists, six new controls | 5/6 | 6/6 | 0 |

Bayesian correctly computes the previously unresolved **24 days** from the
February 1/25 session dates while retaining event turns 383/415. The vector arm
still selects the earlier February 1 plan and answers zero days; the completed
visit remains absent. Date provenance improves temporal interpretation but cannot
repair candidate/event selection or remove the question's competing reading.
Both rankings preserve Juan/Wednesday; Bayesian preserves the five-issue update
and bake-sale-before-gala answer that the previous combined expansion lost. The
gala answer has alternate assistant "tonight" evidence plus its session date even
though the labeled gala user passage is no longer selected.

The extra vector benchmark pass is mortgage $400,000 from the later statement.
Both amounts are still delivered, but this answer does not explain their
ambiguity. Bayesian still omits the later amount and answers $350,000. Keep the
initial-event interpretation and earlier qualified two-amount answers: this
single narrow-target gain does not justify a latest-always-wins rule or establish
better discrepancy handling.

On the new elapsed-days control, the baseline safely abstains because "today"
excerpts have no dates; the candidate correctly computes **16 days** from explicit
April 3/19 anchors. Both conditions correctly retain the March 12 event date when
recalled in May, current Harbor House rather than the future move, cancellation
without a replacement, unknown dates and fictional Frostmonth day 7/year 812.
Misleading host timestamps are deliberately not forwarded as event metadata;
this checks the adapter's boundary, not model robustness to visible competing
host timestamps or every roleplay calendar.

For the sixteen dated diagnostic arms, provenance costs **67–107 tokens** with the
same selected bodies. It can still displace baseline passages, despite no answer
loss on this small set. Provider median input is vector 2,737.5 historical → 2,717
and Bayesian 2,715 → 2,710.5: the hard cap trades passages for provenance, so this
is not evidence of free extra context, general token savings or measured latency
improvement. New-control median input is 181.5 → 217.5. Do not retune these now
consumed questions or promote 1,600 tokens/pair indexing from this comparison.

### Execution, failure and retention

All **36 planned quality answers** complete with two READY checks, **38 provider
calls, zero transient retries**, 86 actual-host integrity checks and verified
15-second send spacing. Usage is 65,386 input / 849 output tokens. The original
run completes 24 diagnostics, then stops before sending the first control to the
provider: the input preparer wrongly treated its appended question as an assistant
when deriving replay queries. The prompt-delivery gate blocks forwarding. A
continuation corrects only that role/query plumbing, verifies identical source,
candidate order and frozen selections, and completes the twelve unanswered
controls. No completed answer is repeated; both original/incomplete and completed
continuation reports remain retained rather than relabeled as one clean run.

Both source identities remain stable throughout their respective execution.
All four owned setup Collections are verified 404; no pending cleanup remains.
The completed continuation verifies keys absent from browser/host persistence;
the interrupted first run did not reach that final persistence check. Archive
secret auditing covers both producers/reports. Quality retrieval is replayed,
not freshly issued or full live synchronization. `npm test` executes 315/315
passing tests; `npm run check`, `npm run check:release` and `npm run check:sdk`
pass. Local selector checks cover exact-source rejection, budget/counter safety,
unknown-session reset, no partner expansion and no inferred `send_date`; they are
ignored evaluator checks, not new maintained production tests.

The local-only `compact-date-v1/evidence.tar.gz` contains 45 verified files plus
manifest, **4,922,433 bytes**, SHA-256
`f0b2afabbbedf3ef825eebcf28f03c84e1a3a3789512bfaea5c3872846a28f6f`.
Byte-identical copies exist under `artifacts/archive/compact-date-v1/` in the
primary and `sillymemory-context-evaluation` worktrees. Every member was read back;
configured-secret matches are zero. It preserves base fbae879, both frozen
producers/protocols, source/rankings/selections, prompts/answers/reviews, setup
fault, cleanup receipts and validation. Initial local arithmetic output is also
retained alongside its correction: no-date repetition savings were initially
misnamed negative date overhead; corrected diagnostics report zero date cost.
Credentials and pinned host/dependencies remain separately required; this archive
is unavailable in a fresh clone and is not a remote backup. Earlier evidence is
unchanged. No scratch harness, product feature, default promotion, merge, release
or deployment is included.
