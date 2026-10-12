# Clarification context: bounded live diagnosis

## Intermediate observation; policy decision pending

This diagnosis is part of the clarification-dialogue context policy work, not
its completion. The final adoption, defer or rejection decision is pending.
Keeping current defaults during evaluation does not close that product question;
these notes must not become a separate merge milestone.

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

## Completion, recovery and adoption boundary

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

Do not promote either retention candidate yet. A follow-up should first freeze a
small independent dialogue cohort whose clarification responses actually address
the model's question. Keep the current search settings and compare one coherent
active-request policy rather than repeat historical search/budget families. Define
mandatory clarification versus optional follow-up explicitly. Before shipping a
JSON adapter, verify missing/invalid/refused/truncated responses, streaming, topic
changes, reload, edit/swipe/delete, stale requests and per-chat/branch state. Do not
infer completion from a missing flag, add an arbitrary long recent window, or let
an unresolved span grow beyond provider context limits silently.

See the [retained evidence](evidence-retention.md#clarification-context-live-diagnosis).
