# Clarification dialogue context policy

## Corrected scope: retrieval and generation accumulation

The maintainer intended accumulating user inputs from ambiguity through completion
for **both retrieval and generation**. The generation-only comparison below omitted
the retrieval part. Its defer conclusion cannot establish that the intended combined
policy is ineffective. Historical inputs, results and archives remain unchanged.
PR #73 is unfinished for the combined product integration; keep this work in that
PR rather than merging a diagnosis as a separate milestone.

### Same-input query comparison

Reuse all twelve frozen cases and the same Sol/low, host, managed embeddings,
Bayesian English/Jev, k=100/candidateSize=100/size=50 and 4,096-token settings.
Both arms retain the complete prepared pending dialogue for generation. Only the
search string changes:

- **Latest input:** the final user input alone.
- **Pending user inputs:** all user inputs from the pending root through the
  final input, in chronological order, separated by two newlines. Assistant
  clarifications are included in generation, but excluded from the search string.

For the bookshelf case, the accumulated query is exactly:

```text
How long did it take me to assemble the IKEA bookshelf?

My assembly time.

The total.
```

No query rewriting, extra model call, recent-message window or separate context
cap is added. Both search legs and the reranker receive the same constructed
query. Existing source validation, branch/range filters, consistent reads and
memory budget remain in effect. The pending root is known from the frozen prefix
in this quality comparison; it is not proof of automatic request-start detection.

The actual pinned SillyTavern host executes both real LambdaDB searches and packs
and delivers each prompt. An explicitly emulated completion captures the prompt;
the **unchanged captured request** is then sent to Sol for paid answers. Those
paid calls do not re-run native reply delivery. Scoring uses the same released
full-question/reference judge, except the previously frozen account-number
absence rubric. This is a matched derived dialogue test over consumed sources,
not a new LongMemEval-S benchmark score.

| Frozen case | Latest-input query | Pending-user-input query |
| --- | --- | --- |
| Degree referent: "Mine." | No | Yes |
| Commute referent | Yes | Yes |
| Play referent | Yes | Yes |
| Degree subject after multiple clarifications | No | Yes |
| Bookshelf total after multiple clarifications | No | Yes |
| Playlist name after multiple clarifications | No | Yes |
| Explicit degree recall | Yes | Yes |
| Explicit internet-speed recall | Yes | Yes |
| Explicit commute recall | Yes | Yes |
| Degree answer with optional followup allowed | Yes | Yes |
| Unrecorded internet account number | Yes | Yes |
| Explicit topic switch to playlist recall | Yes | Yes |
| **Correct answers** | **8/12** | **12/12** |

All four prior losses are restored at retrieval and delivered within the unchanged
budget: degree referent at rank 2; degree subject, bookshelf total and playlist
name at rank 1. Each is the original user fact, not an assistant-only assertion.
The seven factual controls retain their target facts; the absence control admits
that the account number cannot be determined. All responses satisfy the three-state
schema; the eleven factual accumulated-query responses are `answered`, and the
absence control is `insufficient_evidence`. Optional questions remain allowed,
not forced, so this still does not measure their natural status classification.

The capture audit used 5,980 document submissions and 440 LambdaDB requests;
seven owned collections were deleted with 404 verification and no stored keys.
The paired stage used 24 answers and 24 judge calls, 48 total provider attempts,
no retries, and a peak concurrency of one. Reserved input/output tokens were
211,586, an admission accounting bound rather than billed usage. Normal successful
calls have no fixed delay; only server budget headers and transient failures can
cause admission/backoff waits.

**Interpretation:** this supports the user's intended accumulated query as the
implementation candidate. Generation retention alone could preserve intent but
could not recover a missing historical fact. Searching only "The total." or
"Just its name." had discarded the request's subject. The combined approach fixes
that mechanism without increasing the search result count or memory budget.
It does not establish that every conversation needs accumulation, nor does it
justify retaining unrelated history once the request is completed. Production
defaults are unchanged while production state handling and provider integration are unfinished.

### Native status lifecycle mechanism

A separate actual-host run starts each of the same twelve cases without a seeded
pending root. The frozen assistant clarifications are supplied as explicitly
emulated `needs_clarification` responses. Native message events open the root;
subsequent queries are constructed dynamically from user messages in that span.
Each final response reuses its paired answer text and terminal status as a
controlled response, not a newly generated answer to the new live ranking.

All twelve flows preserve the first unresolved root across followups, include the
complete pending dialogue in generation, and send exactly the frozen accumulated
query on the final turn. Both `answered` and `insufficient_evidence` clear the
pending span. A following "Thank you." searches only that input and no longer
protects the earlier full dialogue. Old text can still legitimately appear as
source-validated quoted memory; clearing the span does not delete indexed history.
There are 39 emulated replies in this lifecycle stage and no paid provider calls.

This proves the **prototype's event/state mechanics**, not that a model always
opens the right request, classifies optional questions correctly, or identifies a
new unresolved topic boundary. Combined quality and mechanism evidence justify
continuing implementation of this candidate; they do not complete production
provider integration, malformed/refused response handling, streaming behavior,
source-edit/swipe/regeneration handling or chat isolation for this new state.
Keep PR #73 Draft until those integration gates have a concrete implementation
and validation or an explicit documented blocker. No new diagnostic PR is needed.

Across capture and lifecycle stages there are 11,989 document submissions, 970
LambdaDB requests and 14 owned collections, all deleted with 404 verification.
No browser-stored or artifact key matches were found. Aggregate phase bounds are
recorded before the second isolated host run; paid-call bounds remain unchanged.
The [evidence index](evidence-retention.md#clarification-query-accumulation)
retains the exact producers, plans, requests, replies, scores and cleanup receipts.
The original v1/v2 archives remain immutable. The capture report's inherited
broad evidence label mentions live Sol; its zero paid-call count and explicit
emulator receipts establish the narrower audit evidence described here.

## Previous generation-only decision: narrower scope

**Defer promoting either a recent-exchange window or model-controlled request
status retention. Keep the current product defaults.** The bounded work is
complete: it found no measured answer or clarification-turn gain under controlled
inputs and actual followup routing, and the three statuses alone cannot establish
all request boundaries. This is a decision against default promotion on this
evidence, not a claim that context retention never helps other conversations.
No production response schema, state machine or recent-message setting is added.

The original three-flow diagnosis below remains preserved. Its fixed user replies
sometimes did not answer the model's clarification, so its 0/3, 1/3, 2/3 result
must not establish a winning policy. The completed follow-up below replaces that
inference, without rewriting the original responses or historical benchmark scores.

### Controlled retention comparison

Twelve dialogue cases over six previously consumed LongMemEval-S sources were
frozen before paid answers. The [small input/settings lock](clarification-context-policy-inputs.json)
retains exact dialogue prefixes, inputs, references, status definitions, source
hashes, host/model/search settings and the six live user profiles. These are new
controlled dialogue situations over consumed sources, not an independent benchmark.

Every arm receives the same main instruction, three-state JSON schema and common
memory guidance. The schema carries `reply` and `request_status`:

- `needs_clarification`: the intended referent or request still needs clarification.
- `answered`: the request was answered, even if an optional question follows.
- `insufficient_evidence`: the request is understood, but the fact cannot be
  established from available evidence. Neither terminal state certifies correctness.

Current input, the last complete exchange, and the unresolved dialogue span are
compared on exactly the same prepared dialogue. The pending root is seeded from
that frozen prefix; this isolates retention with a known root, not automatic
request-start detection or a complete live status-routing loop. Arm order rotates. Search remains
current-input-only with k=100/candidateSize=100/size=50, Bayesian English fusion,
managed embeddings/Jev, consistent reads and the 4,096-token memory budget.
Before paid answers, one actual-host/live-LambdaDB ranking per case is captured
using an explicitly emulated completion. The same source-validated result and
packed selection are replayed in all paired arms. Retained full messages replace
overlapping selected excerpts; they are not supplied twice. Thus the comparison
isolates additional full dialogue retention, rather than new query construction,
changing rankings or different preceding model replies. The paired stage does
not measure an unchanged production generation path: all arms share the status
schema and clarified common guidance.

| Frozen case | Current input | Last exchange | Pending status | Target user fact in returned top 50 |
| --- | --- | --- | --- | --- |
| Degree referent: "Mine." | No | No | No | Absent |
| Commute referent | Yes | Yes | Yes | Present |
| Play referent | Yes | Yes | Yes | Present |
| Degree subject after multiple clarifications | No | No | No | Absent |
| Bookshelf total after multiple clarifications | No | No | No | Absent |
| Playlist name after multiple clarifications | No | No | No | Absent |
| Explicit degree recall | Yes | Yes | Yes | Present |
| Explicit internet-speed recall | Yes | Yes | Yes | Present |
| Explicit commute recall | Yes | Yes | Yes | Present |
| Degree answer with optional followup | Yes | Yes | Yes | Present |
| Unrecorded internet account number | Yes | Yes | Yes | Absence control |
| Explicit topic switch to playlist recall | Yes | Yes | Yes | Present |

All arms score **8/12** using the released original full-question/reference judge
(`gpt-4o-2024-08-06`), except the frozen account-number absence rubric. Four losses
are missing returned evidence: the target statements are absent from both the top
50 and delivered prompt. They are not token-budget exclusions. Keeping the root
request in the generation prompt does not restore a fact that retrieval omitted.
The three already-correct explicit questions are preservation controls, not gains.

All 36 status responses satisfy the schema. The missing-account control returns
`insufficient_evidence`; the degree-answer and completed topic-switch controls
return `answered`. The degree-answer control allowed an optional question, but no
arm emitted one. It therefore does not validate status labeling when a completed
answer actually includes an optional question; the earlier NAS ambiguity remains
unverified. When the current-input arm loses the meaning of "Mine.", it
asks for clarification; arms retaining the original degree request instead report
missing evidence. A case's desired resolved status is not a semantic oracle:
a justified clarification or insufficient-evidence label is not wrong solely
because it did not achieve the full-intent answer.

### Actual followup comparison

The six live source identities were fixed in the initial plan. Detailed user-reply
routing was frozen before live execution, while the paired stage was running;
it was not frozen before every paired call. The resulting live comparison is
therefore a bounded diagnostic confirmation, not statistically independent evidence.

Compare unchanged current-input generation with last-exchange retention through
actual pinned-host Generate and live LambdaDB queries. Both arms use the existing
production memory guidance and plain replies; there is **no status schema, JSON
response adapter or ranking replay** in this stage. A neutral prelude identifies
the topic, followed by an ambiguous request. Each user profile knows only its
referent and intended question, not the target historical answer. The same frozen,
arm-blind routing function chooses a referent, intent or unknown-detail response
from the actual model question. It accepts no answer key, memory results or judge
feedback; no user-role LLM is used. A missing clarification gets an honest response
that the user does not remember the detail, followed by their intended question.
This remains a finite deterministic user model, not an unconstrained human study.

| Source question | Current input: turns to official Yes | Last exchange: turns to official Yes |
| --- | ---: | ---: |
| Degree subject | 2 | 2 |
| Daily commute duration | 1 | 1 |
| Community-theater play title | 1 | 1 |
| Spotify playlist name | 1 | 1 |
| IKEA bookshelf assembly time | 1 | 1 |
| Internet-plan speed | 1 | 1 |

Both arms score **6/6**, with identical turns per case: seven assistant responses
per arm. On the degree case, the current arm asks which topic the user means;
the retained-exchange arm asks which degree. Both receive "My own degree, the
one I graduated with." and recall Business Administration next. The user does
not supply that answer. The predeclared promotion gate required at least two
repaired answers or reduced clarification turns without lost correct controls;
it was not met. A perfect live control makes efficacy inconclusive for this
cohort, not proof of universal equivalence. No additional paid cohort was opened
to seek a favorable outcome.

### State boundary and stopping criterion

A local state-contract check verifies pending-span opening, terminal closure and
unknown-output preservation. It also records a signal-sufficiency limitation:
`needs_clarification` with an existing pending root can mean either continuation
of that request or a new unresolved request replacing it. A status alone does not
identify which root to retain. This is local state reasoning, not a live model
failure measurement. Adding more outcome labels does not automatically solve that
separate request-relation question.

The adoption gate is not met, so this scope ends with **default promotion deferred**.
The response-schema prototype is not integrated. Resume this policy question only
with a demonstrated current-default failure where the needed source fact is
already delivered and missing intent is the remaining cause, or with a separately
justified request-boundary design. The four observed retrieval losses can motivate
a distinct resolved-request query-construction task; they do not justify another
retention, budget or search-family sweep in this PR.

### Verification and retained evidence

Actual host: SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`; Sol with low reasoning, 4,096 output
tokens, 32K host context; direct CORS and SDK 0.8.0. The underlying timestamp import
and neutral-character limits of the original diagnosis also apply. Fifty actual
answer calls and 50 judge calls completed, with 12 separately labeled emulated
capture replies and no completion retries/rate-limit waits. Cumulative admission
reservation is 439,751 tokens, not billed input usage. LambdaDB received 12,006
document submissions and 1,161 requests. Fourteen owned collection creations were
deleted with HTTP 404 verification; keys are absent from browser storage/evidence.

The native second session needs another gate and the same six source collections,
so its pre-run amendment raises cumulative creation/submission bounds to 14 and
13,000. Quality sources, answer/judge/attempt/token/time caps and numerical search
settings are unchanged. Both stages completed without harness recovery. Raw
prompts, transcripts, rankings, exact runtime/producer bytes, all locks/amendments,
status observations, source-support checks and cleanup receipts are local-only
and checksum verified. See [evidence retention](evidence-retention.md#clarification-dialogue-policy-completion).

## Initial diagnosis: preserved intermediate observations

Keep the current product defaults. A single response can carry an ordinary reply
and a structured clarification flag through the pinned SillyTavern host with Sol;
this does not require a second classifier call. The experiment also demonstrates
that a short clarification reply can lose the original request under current-input
only generation. Neither a fixed recent exchange nor a model flag is established
as a reliable default by these three derived flows.

The implementation in this run is an ignored prototype, not shipped runtime code.
Product model, storage, retrieval, budget, installation and API-key policies are unchanged.
PR [#72](https://github.com/lambdadb/SillyMemory/pull/72) was squash-merged as
`15c781289aff2448ed5e7afce595d677121f7479` before this evaluation.

## Frozen question and method

Product question: does preserving a clarification dialogue repair the loss of
intent when the user responds with a short phrase, and can the answer model signal
that state without another generation?

Six previously consumed LongMemEval-S questions were locked before calls: three
historical losses including ambiguity/abstention, one temporal loss and two prior
success controls. They diagnose current behavior; they are not an independent
confirmation cohort or a new full-500 score. All six are reported below.

Three derived dialogues use the NAS, museum-order and slow-cooker cases. Each
adds a factual-neutral topic exchange, then an ambiguous request and up to two
predeclared clarification replies. After each answer, the released complete
question/reference is graded using the original official template and
`gpt-4o-2024-08-06`, temperature 0, maximum 10 output tokens. Its result is used
only to stop the scripted test; no reference or judge feedback is supplied to the
answer model. These are oracle-controlled repair diagnostics, not official
LongMemEval questions or unconstrained human conversations. The scripted reply
can fail to answer the model's actual clarification, such as a request for price.

| Condition | Full context retained for generation |
| --- | --- |
| Current input | Only the current input plus selected memory. |
| Last exchange | The preceding complete user/assistant exchange, plus current input and memory. This follows exchange boundaries rather than a fixed message count. |
| Pending flag | From the user request preceding the first `true` reply, including assistant clarifications and subsequent user replies, until a validated `false`. |

All conditions search **only the current input**. Both search legs and local
validation exclude the retained full span to avoid delivering it twice. Thus this
tests retention/filtering packages, not contextual query rewriting. The flag arm
also needs a status instruction and produces its own intervening replies;
comparisons do not isolate retention from instruction effects or response variance.
At the second repair turn, last-exchange and pending-flag can have the same
retention boundary. A difference there does not prove that a longer span caused it.

Answers use actual SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, actual Sol (`gpt-6.1-sol`, low
reasoning, 4,096 output tokens, 32K host context), Chromium, and live direct-CORS
LambdaDB. The loopback completion bridge holds the provider key and applies bounded
header-aware admission/retries; it forwards the native request and provider SSE.
It does not rewrite generation prompts. No host source patch or server plugin is
used. Successful calls have no artificial spacing; concurrency is one, and
Retry-After/backoff applies only to transient failures.

Managed embeddings, English Bayesian fusion, vector k=100, candidateSize=100,
size=50, managed Jev and `consistentRead: true` remain enabled. The extension
budget is 4,096 tokens including guidance. Per-message boundary chunks retain the
800-code-point ceiling and overlap assembly. Imported benchmark sessions form one
native chat. Session dates appear in the adapter's first turn of each session;
`send_date=0` is deliberately unknown, so this fixture does **not** establish the
product's host-timestamp metadata behavior. It does not invent a UTC timezone for
the benchmark. Neutral characters and a helpful assistant system prompt also do
not establish roleplay quality with arbitrary character cards.

## Results

| Original consumed question | Official grade | Observed behavior |
| --- | --- | --- |
| `ec81a493`: debut album copies | No | Distinguishes the source's limited signed poster, 500 copies, from album copies and asks which was intended. The released target says 500; source/target ambiguity limits interpretation. |
| `15745da0`: vintage-camera collecting duration | Yes | Answers about three months. |
| `eeda8a6d_abs`: fish in a 30-gallon tank | No | Asks whether the user means the documented 20-gallon tank or another tank. A clarification is not the benchmark's required explicit abstention. |
| `gpt4_7abb270c`: museum order | No | Gives a partial order and asks about two visits. Date linkage is incomplete in the delivered excerpts; repeated/relative event wording also needs interpretation. This is not evidence that the current host-timestamp implementation failed. |
| `caf03d32`: slow-cooker advice | No | The delivered prompt contains the successful beef-stew statement and yogurt discussion, but the answer omits that personal success. This is an answer-interpretation loss, not missing retrieval of that fact. |
| `1da05512`: buy a NAS now or wait | Yes | Uses storage/backup needs and gives conditional buy/wait advice. |

The six-case diagnostic is 2/6 under the official judge. It does not replace any
historical full-500 result. Asking an appropriate question can still receive
`No`; this run does not claim that every such question was appropriate or that
benchmark mistakes should be relabeled as correct.

| Derived flow | Current input | Last exchange | Pending flag |
| --- | --- | --- | --- |
| NAS | Not resolved in three turns | Not resolved in three turns | Official `Yes` on turn two; flag remains `true`. |
| Museum order | Not resolved in three turns | Not resolved in three turns | Not resolved in three turns; all flags `true`. |
| Slow cooker | Not resolved in three turns | Official `Yes` on turn two | Official `Yes` on turn two; `true` → `false`, pending span cleared. |

Completed requests within the scripted limit: **0/3, 1/3 and 2/3** respectively.
These small, consumed, order-fixed diagnostics support a concrete continuity risk,
not an accuracy percentage or a general superiority claim. The pending arm's NAS
reply preserves the purchase question when the user says "My NAS device." The
current-input arm responds to the device phrase without completing that request.
The NAS win alone does not isolate the value of a longer pending span: differing
status instructions and preceding model replies are confounders. Museum failure
survives all three policies, so context retention alone is insufficient.

## Flag transport and semantics

Native ToolManager stealth calls failed with HTTP 400 before remote indexing.
Sol's [official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
requires Responses for tool calling; its Chat Completions path does not support
those calls. The model and endpoint were not substituted.

A trailing internal comment worked in two capability probes and the pending-flow
comparison. It was stripped before source synchronization. This is a prompt
convention, not a schema guarantee; missing/invalid output is unknown, never false.

Two subsequent capability-only probes used strict `json_schema` through the native
`CHAT_COMPLETION_SETTINGS_READY` event, followed by a first `MESSAGE_RECEIVED`
response adapter. Both returned `{ "reply": "...", "needs_clarification": true }` (or `false`)
in **one** provider response. The completed native chat message and final UI
contained only the ordinary reply, with the boolean stored separately in
experimental message metadata. Reload persistence was not tested.
One probe used non-streaming and one forwarded real provider SSE. No extra
classification call, tool invocation or recursive generation occurred. These JSON
probes did not rerun the quality cohort or validate incomplete-stream UI behavior.
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)
can constrain shape; they do not certify the flag's meaning or factual correctness.

`true` means the model considers information necessary to resolve a request still
missing. `false` means no such clarification remains; it is **not** a correctness
signal. The NAS answer received an official `Yes` while its flag stayed `true`,
and the model can answer a different or wrong question with `false`. A single
boolean therefore cannot safely serve as an answer-quality oracle or the complete
conversation lifecycle policy.

## Initial diagnosis recovery and provisional boundary

All frozen cases and all nine flow/condition combinations completed. Total use was
65 provider attempts: 34 successful answers/capability replies, 30 successful
judge calls and the one unsupported tool request. There were no rate-limit waits
or successful-call sleeps. Reserved admission tokens were 287,441; this is **not**
billed input usage. Aggregate duration was under 19 minutes. LambdaDB received
7,753 document submissions and 652 requests, including retries, setup and cleanup.
All 11 owned collection creations were deleted with subsequent HTTP 404 verification;
no keys were found in browser storage or evidence files.

Two harness assertions interrupted the run: the judge returned `No.` rather than
`no`, and the host removed trailing Markdown spaces from a completed reply.
Recovery retained completed answers and grades instead of regenerating them.
The official `yes`-in-response score is preserved; ambiguous judge formats are
rejected. Reply comparison normalizes only per-line trailing horizontal whitespace.
Fresh host sessions increased the original seven collection-creation bound to 11,
solely for transport gates and remaining cases. Completion/token/document/request/
time bounds and the frozen cohort were not expanded. A restored partial museum
flow has unknown timestamps for restored experimental replies; full native metadata
was not captured before that assertion. All originals, amendments and producer
hashes are preserved, including the failures.

At the initial stage, neither retention candidate was ready for promotion. The
proposed follow-up was a controlled dialogue comparison followed by actual
clarification routing, now completed above with its independence limits disclosed.
The initial recommendation to validate response-schema lifecycle behavior remains
an adoption prerequisite; no such adapter is shipped by this completed decision.

See the [retained evidence](evidence-retention.md#clarification-context-live-diagnosis).
