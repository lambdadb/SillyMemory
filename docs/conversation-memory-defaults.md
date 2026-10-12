# Conversation memory defaults

Current development defaults use stored, fully budgeted conversation-time
provenance, Bayesian English fusion and managed Jev: vector k=100, up to 100 rerank
candidates, final size=50, and a 4,096-token initial memory budget. Keep per-message
boundary chunks with an 800-code-point ceiling. The 4,096-token maximum and host
one-quarter-context cap remain; explicit saved budgets are respected. These are
development defaults, not a release or a universal optimum.

### Current request and clarification continuity

Index all completed eligible plain-text messages, including the preceding exchange.
A trailing user input waits for a reply before indexing. Ordinarily, retrieve with
only the current question and retain only that input plus selected memory alongside
native system/character settings. No fixed recent-message window is added.

**Clarification continuity is enabled by default.** The same answer generation
returns the visible reply and a structured status. `needs_clarification` means the
user's request or referent is ambiguous. It opens a pending span at that user input.
On subsequent turns, one search uses the complete pending user/assistant dialogue,
with roles and order preserved. Generation keeps the same full span plus only the
current query's selected memory. Earlier retrieval snapshots are never accumulated.
`answered` closes the span even if the reply contains an optional conversational
question. `insufficient_evidence` also closes it: missing or conflicting evidence
for a clear request must not be mistaken for ambiguity in the user's intent.
Status expresses request state, not factual correctness.

Both search legs prefilter positions before the pending root, or before the current
input when no clarification is pending. Local selection validates the same boundary.
Already-retained full turns therefore consume neither the bounded result slots nor
the excerpt budget. A root at the first message skips search after synchronization:
there is no older memory to retrieve. This refines the v4 experiment, which searched
before the active input and filtered pending excerpts only after packing. Pending dialogue is outside the memory budget but inside the
host context and final delivery checks. Search k=100/candidateSize=100/size=50,
4,096 memory tokens and the one-quarter-context cap are unchanged. Oversized queries
still fail at 8 KiB without truncation. No extra LLM, rewriting or search call is added.

The selected native reply stores source-bound status metadata. Reload and native
branch copies preserve it; edits, deletions or changed earlier swipes invalidate
its source signature. Regenerate and new swipes classify the replacement reply,
while selecting an existing swipe restores that reply's state. The complete span
can grow until resolved; query/provider/context limits remain explicit constraints.
Incomplete structured streams are excluded from indexing and later generation
prompts, while their recovery notice remains in the native chat UI. Missing/invalid status
or interrupted generation retains unresolved context conservatively as internal
`unknown`, rather than fabricating completion. Recovery cleans saved in-flight
replies when the chat loads. This is separate from the three model statuses.

The supported adapter requires Chat Completions with JSON-schema support. The live
provider gate used Sol; other providers are not thereby certified. Streaming text
is shown after the complete reply is decoded, so internal JSON is hidden during
normal streaming. Conflicting response schemas, tool calls, multiple replies and
custom protocol overrides are rejected rather than overwritten. Disable the
**Clarification continuity** checkbox for unsupported configurations; that retains
the ordinary current-input policy. Continue while a request is pending is blocked:
send a clarification or regenerate instead. Ordinary Continue and Impersonate keep
their existing active-message behavior. Group/tool chats remain unsupported.
Continuity preparation failures abort rather than dispatching an untracked reply;
with continuity disabled, the existing visible-error/original-prompt fallback remains.

Product decision: adopt complete pending dialogue based on the derived confirmation
and the production integration gates in the [decision record](clarification-context-evaluation.md).
The confirmation's audited scores were 6/12 latest-input, 7/12 user-only and 11/12
full-dialogue retrieval; both contextual methods retained 12/12 previous regressions.
These are consumed-source, derived dialogues, not an official LongMemEval score.
The later ten live production replies validate automatic state handling and three
known facts, not a new broad quality benchmark. Generic questions can still need
clarification; evidence gaps and interpretively ambiguous source remain limitations.

### Validation of the preceding current-input baseline

The checks below predate production clarification continuity. See the linked
decision record for the current integration receipt.

- `npm test`: 340/340; runtime, maintained script/test syntax, release metadata
  and locked SDK 0.8.0 checks passed.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18134 SM_ARTIFACT_TAG=input-only-v4 npm run test:browser`:
  45 checks passed. Actual pinned host/Chromium; local LambdaDB emulator.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18135 SM_ARTIFACT_TAG=input-only-v4 npm run test:faults`:
  77 checks passed, including timeout/reload, uncertain writes, native branches,
  deletion and cancellation; no uncaught browser errors or remaining collections.
- `ST_SOURCE=<pinned host> node scripts/prompt-delivery-smoke.mjs artifacts/input-only-v9/prompt-delivery.json`:
  all 17 cases plus overlap, repeated packing and source assembly passed. Actual
  host packing and dispatched local completion requests preserve native character
  and system settings, active input and system guidance. Past eligible turns are
  absent as full messages. No-hit and no-fitting-passage requests do not restore
  history; regenerate/swipe exclude the answer suffix; Continue keeps its prefix and
  Impersonate retains the character response while leaving source history intact.
  Empty-selection preparation displays the counted guidance tokens rather than zero.
  This does not exercise an actual LLM.
- The preceding one-off live LambdaDB numeric-range contract used one collection,
  four synthetic documents and two searches, with no generation. Both legs
  accepted the message-range prefilter and isolated the source correctly; owned
  cleanup returned HTTP 404. The client and SDK are unchanged by this follow-up.
  This is historical transport evidence, not a new browser/provider run.

The active-input revision removes recent-history capacity pressure; the maintained
harness therefore separates a long-history control from actual system-instruction
pressure. The latter uses 110 instruction repetitions to exercise host truncation,
Stop on missing context, streaming, swipe/regenerate and manual context recovery.
Previously captured cases retain their original settings in local archives.
Small-context packing now prepares two excerpts, with six after context recovery;
the repeated-citation source-integrity fixture keeps its five required excerpts
under context 2,048/budget 500. These are emulator contract observations, not
answer-quality changes. Intermediate attempts failed on stale policy labels,
expected excerpt totals or pressure assumptions; no paid answer reruns occurred.
Historical producer revisions are required for fixed-window answer experiments;
current generation refuses those old modes rather than silently changing their
frozen protocol. Their npm aliases are removed, and historical execution documents
explicitly require the recorded checkout. Current contract runners no longer configure a recent window.

See the [active-input evidence record](evidence-retention.md#active-input-policy-final-validation). Previous current-question and first active-input archives
preserve the intermediate recent-12 implementation and its validation. They are
not final active-input evidence; historical scores remain unchanged.

## Historical adoption evidence

The original twelve-case evaluation below adopted Bayesian+Jev with a 1,600-token
budget. The later [external failure discovery](current-baseline-failure-discovery.md)
identified a real capacity loss and a 3,200-token repair. Preserve those original
protocols/results; they are not reruns of the current numeric defaults.

## Method and adoption boundary

Twelve newly authored English histories were frozen before provider calls: six
controls for UTC intervals, recalled events, future plans, cancellations, unknown
dates and fictional calendars; six for rare codes, semantic paraphrases, previous
tutors, multiple sources, explicit corrections and conflicting amounts. Each has
60 older messages plus recent context. The conflict question asks for both amounts
and whether the discrepancy is explained, rather than forcing a latest-only answer.
The interval explicitly uses UTC conversation dates.

Each case compares vector/800, vector/1,600, Bayesian+Jev/800 and
Bayesian+Jev/1,600 with the same metadata-backed chunks, two queries and four recent
messages. Arm order rotates. Sources, questions, target meanings, settings and
selected prompts were frozen before paid generation; completed answers were never
regenerated. One case deliberately applies multi-source budget pressure. The
others retain headroom for interpretation controls. They were authored with
knowledge of earlier failure categories: this is not an external or statistically
independent held-out benchmark. Histories fit 32K and do not establish performance
when a realistic large context overflows. The unknown-date case also explicitly
instructs the model not to invent a date, making it an easier abstention control.

Recorded retrieval used stable SDK 0.8.0, managed `text-embedding-3-small`, an
English-only `text` analyzer, raw query with `skipSyntax: true`, owner/scope filters
on both legs, `consistentRead: true`, explicit `chat_eval` branch, `knn.k=30` and
final `size=30`. Search uses one shared UTF-8-safe prefix for all signals, capped
at the reranker SDK limit of 8,192 bytes; queries below that limit remain unchanged.
Bayesian combines two unboosted vector/text signals, followed by
Typesafe `jev-1.13.0`, `candidateSize=30`, `fields=['text']`, `onFailure='error'`.
Applied rerank metadata must match the requested provider/model, and exact
source/time readback is required. These are not
RRF or manually OR-expanded lexical queries. No additional provider key is needed;
managed embedding and reranking may add LambdaDB inference usage.

Answers use actual SillyTavern 1.19.0 Generate at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, GPT-6.1 Sol with low reasoning,
4,096 output tokens and 32K context. Newly captured deployed rankings are replayed
after current source/time/branch validation. This is distinct from querying the
full quality corpus live from the browser. Separate browser checks exercise actual
production direct CORS, synchronization and retrieval. Assistant semantic review
compares complete answers with source; no independent human or official judge
result is claimed. All arms have mandatory time labels, so the comparison does
not isolate the gain over the previous optional-time implementation.

The frozen quality bounds were 1,000 submitted documents, 60 queries, 18 owned
collections, 48 answers plus READY, 57 provider attempts, eight bounded transient
retries and 15-second provider start spacing. Actual quality work used 720 corpus
documents, 48 retrieval queries, 16 collections including dry/paid setup, 49 provider
calls and zero retries. The Node retrieval evaluator permits 30-second requests;
production remains at 15 seconds. A separate small browser safety probe used four
additional owned collections across two attempts, and no actual OpenAI calls.
There was no post-result tuning, model substitution or budget sweep.

The adoption gate required source/isolation/budget/time safety and no loss of
correct answers against matched vector/800. Earlier exposed Bayesian/capacity
gains support the candidate; equal new answers establish bounded preservation,
not a new accuracy improvement attributable to search.

## Results and interpretation

| Retrieval | Memory budget | Complete correct answers | Median provider input | Median selected memory |
| --- | ---: | ---: | ---: | ---: |
| Vector | 800 | 11/12 | 877 | 737 |
| Vector | 1,600 | 12/12 | 1,751.5 | 1,572.5 |
| Bayesian+Jev | 800 | 11/12 | 880 | 736.5 |
| Bayesian+Jev | 1,600 | 12/12 | 1,753 | 1,572.5 |

All six temporal controls, rare-code/paraphrase controls, historical tutor,
explicit correction and conflicting amounts pass in all four arms. The UTC
interval answer is 16 days. Recollection retains the explicit February event date,
not the April conversation date. The fictional calendar remains fictional.
Conflicting amounts retain both $280,000 and $330,000 and state that the discrepancy
was not resolved. No latest-only rule is introduced.

The only incomplete case at 800 asks for six approved Harbor expedition supplies
and exact codes. Both searches retrieve all six, but selection includes only four:
vector omits rope/lamp; Bayesian omits compass/water. Each model correctly reports
that two items are unavailable in its excerpts rather than inventing them. Both
1,600-token arms include all six and answer completely. This is a demonstrated
injection-capacity gain, not an ANN correction or a Bayesian-only win.

Median deployed query duration is 217 ms for vector and 503 ms for Bayesian+Jev
(24 requests each). These are observed service calls, not a guaranteed latency or
per-turn total. Successful generation usage including READY is 63,288 input and
1,229 output tokens. Managed embedding/reranking cost was not measured. The larger
budget roughly doubles selected memory and provider input in these short controls;
it is a recall/cost tradeoff, not a token-saving claim relative to vector/800.

Earlier exposed diagnostics recorded vector 7/12 versus Bayesian+Jev 10/12 at 800
with no lost correct answers, and capacity gains with qualified ambiguous answers;
see [the historical SDK evaluation](bayesian-sdk-validation.md). That evidence and
fresh preservation support the search default. The fresh run alone would not
justify paying for reranking as an accuracy improvement. Neither comparison is a
broad multilingual or long-context quality guarantee.

## Memory interpretation instruction: efficacy inconclusive

A follow-up at baseline `c7edad18d2357acc433e47c478f918176444e983`
tested one short system instruction: distinguish message dates from event dates,
require explicit corrections before replacing facts, preserve historical states,
separate plans/cancellations from completed events, and report unresolved conflicts
or missing dates. The pre-call gate required more complete source-supported
answers with no loss of previously correct answers. Equal scores were insufficient.
However, the comparison was run before establishing a relevant failure in the
current baseline. This omitted qualification step is a design flaw: a perfect
baseline has no improvement headroom. The run supports bounded preservation,
not a conclusion that the instruction is ineffective.

Both arms use the deployed managed retrieval and actual host/model settings above,
with Bayesian+Jev, 1,600 tokens and four recent messages. Twenty-four new query
captures supply identical rankings to the two arms after current source validation.
The guided arm adds the frozen instruction once as a system extension prompt at
`IN_CHAT`, depth 0, with scanning disabled. Instruction, separator and complete
source-labeled excerpts share the same 1,600-token budget. This tests the combined
instruction/placement/budget package; selected excerpts need not be identical.
Inputs, targets and instruction were frozen before calls; arm order alternates.

Six controls reuse the exposed UTC interval, recalled event, future plan, previous
tutor, six approved supply codes and unresolved loan amounts. Six new controls
cover historical versus current pendant locations, an old quoted relative date,
corrected ticket quantity versus later recollection, canceled renovation, conflicting
attendance counts and an unknown original timezone. These are authored controls,
not an independent benchmark; histories fit 32K. Explicit source wording often
already resolves the ambiguity, limiting the difficulty and available improvement.

| Arm | Complete correct answers | Median provider input | Median memory including instruction | Median output |
| --- | ---: | ---: | ---: | ---: |
| Current memory | 12/12 | 1,751.5 | 1,567.5 | 37.5 |
| Memory plus instruction | 12/12 | 1,761.5 | 1,577 | 38.5 |

Assistant semantic review checked all 24 full answers against frozen source and
target meanings, rather than exact-string matching. There were zero gains and
zero losses; no independent human or official judge result is claimed. Both arms
retain historical/current locations, interpret the workshop as May 4 rather than
the May 9 quotation date, preserve the six-ticket correction, recognize canceled
work, report both unresolved counts and decline to infer a local date from UTC.
Every required source is selected in both arms. Paying for the instruction removes
one irrelevant filler message per case; its cost can displace useful evidence in
other histories. The small net token increase includes that selection change.

Keep the current defaults and runtime because there is no demonstrated benefit
to justify adding the instruction. No new setting, metadata field or maintained
test infrastructure is added. This is a decision to defer adoption, not evidence
against efficacy. A new comparison needs a demonstrated relevant baseline failure
and a bounded decision, not more retries of these already correct answers.
The raw run's `semanticReviewPending` flag is retained;
the completed separate review is archived with it.

Quality generation completed 24 answers plus READY: 25 actual provider calls,
zero retries, 42,234 input and 901 output tokens including READY. Corpus work used
780 submitted documents and 24 successful query calls, including a bounded
continuation after one consistent document-fetch HTTP 503. The first six rankings
and all completed answers were preserved. All 17 owned collections across corpus,
fixture preflight and paid setup were confirmed absent (404). The fixture run
completed all prompt assertions and cleanup but its overall report failed because
zero-delay fixture calls were checked against real-provider spacing; that harness
error remains recorded. The paid run passes the real 15-second spacing check.
No product failure or OpenAI retry is inferred from either preflight error.
Full evidence, producer bytes, cleanup and validation are in the
[evidence index](evidence-retention.md#memory-interpretation-guidance-decision).

### Historical failure audit before another comparison

A read-only audit checked the original questions, source, actual answers and
delivered selections for mortgage `852ce960` and elapsed days `4dfccbf7`, using
checksum-verified historical archive members. No new model or retrieval call was
made, and released benchmark answers/scores were not rewritten.

| Historical observation | Verified mechanism | Use in a guidance comparison |
| --- | --- | --- |
| Mortgage, Bayesian/800 answers $350,000 | The retrieved later $400,000 statement is absent from the selected prompt. | Capacity loss; instructions cannot restore missing evidence. |
| Mortgage, both 1,600-token arms mention both amounts | The question asks the amount "when I got my mortgage"; the later source says "remember when I got pre-approved for $400,000", without explicitly correcting the original $350,000. Answers explain the discrepancy. | Ambiguous target, not a clear interpretation error. Preserve the released $400,000 target separately. |
| Elapsed days, undated 1,600-token prompts abstain | Event messages 383/415 are present, but their February 1/25 session anchors at 379/407 are not delivered. | Missing date dependencies, not an arithmetic failure. |
| Elapsed days, earlier compact-date Bayesian answer | Both events and session dates are delivered; the actual answer is 24 days. Vector instead retains the February 1 plan, a competing reading of "decided to take". | Already repaired in that diagnostic; not evidence of a remaining Bayesian interpretation failure. |

These indices are zero-based source-message positions, not chunk numbers; UI
labels add one. The date question is "How many days had passed since I started
taking ukulele lessons when I decided to take my acoustic guitar to the guitar
tech for servicing?" Source 387 plans the visit on February 1; source 415 reports
returning from the completed visit on February 25. This competing event reading
must not be silently removed to obtain the released 24-day answer.

Neither historical case supplies a clear evidence-sufficient interpretation
failure for the proposed instruction. The other ten historical Bayesian/1,600
answers were already recorded as passing. These old SDK/adaptor runs are not a
revalidation of today's runtime: historical `send_date=0` does not supply current
host timestamp metadata, and the compact-date experiment used explicit session
markers. Do not pool them with the new 12/12 controls or claim current benchmark
accuracy from this audit.

Stop the paid instruction comparison here. Before another candidate, use a
discovery cohort to establish a real current-baseline failure and its mechanism.
Freeze a disjoint confirmation cohort, source-grounded scoring and regression
controls before candidate generation; keep ambiguous targets separate and report
the whole cohort. Do not choose only observed wrong answers as the confirmation
set or add explanatory hints to make new controls trivial. The audit and original
evidence remain available through the evidence index.

## Whole-pair rejection and retained evidence

Keep the earlier whole-pair decision: on twelve exposed English diagnostics at
800 tokens, whole pairs changed vector 7/12 → 8/12 but Bayesian+Jev 10/12 → 8/12.
Magazine and event-order answers lost needed facts because complete long pairs
could not fit. No pair indexing, clipping or unconditional neighbor expansion is
shipped. The original local producer/decision commit is
`94597ed6be4930ee9d8b23d860fb600322063f86`; its complete original bytes and decision
bundle remain in the [evidence index](evidence-retention.md). Those historical
answers are not pooled with the new controls.

## Validation and remaining limits

Unit tests cover full-date budget boundaries, timestamp edits/removal/reload,
remote label tampering, duplicate text at different dates, settings caps, scoped
Bayesian requests and rejected rerank fallback/missing metadata. Actual pinned-host
emulator recovery covers branch isolation, edits, swipes, deletes, transitions,
failure recovery and prompt delivery; its fixed scores are not live quality data.

The supplemental actual-browser probe confirms deployed Bayesian+Jev/direct CORS,
current remote timestamps, timestamp edit reconciliation, deletion without
resurrection, and reload requiring a new key. Its completion model is a READY
fixture, not answer-quality evidence. Attempt one had an instrumentation argument
index error. Attempt two completed all safety assertions, then its cleanup forgot
to reconnect after the deliberate reload; the retained raw report marks cleanup
incomplete. After the host exited, ownership-checked cleanup separately confirmed
both collections absent (404). These harness errors are preserved, not rewritten
as successful original runs. All 20 collections across quality and supplemental
work were verified removed.

The measured runtime hashes match their pre-call locks. The final default-only
800 → 1,600 patch was applied afterward; all measured arms already used explicit
budgets. Final source and UI checks verify the adopted initial setting. Privacy
copy was clarified during the run and was not part of the measured module locks.
Automatic review subsequently identified the reranker byte-limit boundary. The
final guard truncates oversized queries at a complete UTF-8 code point for all
three signals. All 24 captured Bayesian requests remain byte-for-byte unchanged
(the largest query was 144 bytes); no paid answer was regenerated. The final unit
suite passes 325 tests on both supported Node versions. The actual-host and paid
runs precede this boundary-only fix and the subsequent provider/model identity
guard; their producing modules remain archived. The identity guard also passes
the same 24 captured deployed responses and rejects mismatches for both applied
and empty-candidate responses.

No source time is invented for imports, no historical timezone is inferred, and
message time is not automatically treated as event time. Timestamp-only changes
may incur managed embedding again. Other languages, independent benchmark gains,
provider pricing, arbitrary large-context behavior and a universal optimal budget
remain unverified. Final commands and archived evidence are listed in
[the evidence index](evidence-retention.md).
