# Native reply live UX validation

## Decision

Keep the native-reply policy and current search/retention/storage defaults. The
bounded English UX run completes all eleven real Sol generations with expected
source-supported answers or clarification/evidence-gap behavior. It is not an
accuracy improvement comparison, official benchmark score or broad provider
certification. Fix one demonstrated product issue: generation preparation errors
must remain visible after native generation-ended background synchronization.

## Method and fixed scope

Use actual unmodified SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, Chromium and a disposable native profile.
The UI extension goes directly over browser CORS to managed LambdaDB; no memory
query/upsert is stubbed or replayed. Generate requests pass through the native
Chat Completion backend to a loopback credential bridge forwarding actual OpenAI
requests and SSE bytes. That bridge is local test infrastructure, not a product
server plugin. No provider key enters the browser or host settings.

Explicitly use `gpt-6.1-sol`, reasoning `low`, context 32,768 and output reservation
4,096. The environment's old mini-model value is not used or changed. Keep current
managed embeddings, Bayesian English/Jev, k=100/candidateSize=100/size=50, 4,096
memory tokens, Query 2 and recent-five/pair-aligned-six storage. Keep normal host
character/system prompt construction; a neutral Mira character supplies no oracle
answers. No response schema, reply decoding, request-status flags, query rewriting
model or paid judge is added.

The [input lock](native-reply-ux-inputs.json) identifies three complete authored
histories previously used for conversation-time evaluation. Each original history
has sixty older messages and three recent notes. Close its final inventory note
with its existing acknowledgement; the place-history additionally receives the
existing two-message book prefix. Retain original bytes and adaptation hashes.
All subsequent assistant responses are actually model-generated; user follow-ups
are fixed test inputs, not an autonomous user-role model. This is a composed,
consumed-source UX suite, not the complete LongMemEval corpus or independent data.

The eleven logical generations, three sources and rubrics are fixed before model
calls. Bounds permit fourteen provider attempts, 180,000 reserved tokens, 400
submitted documents and 400 browser-observed LambdaDB requests. The initial
five-collection allowance is explicitly supplemented to eight across failed setup
attempts; no new questions or answers are added. The original 25-minute run window
covers all three attempts. Concurrency is one because turns share native dialogue
state. Successful calls have no fixed delay; supplied rate-limit headers govern
admission and only transient failures permit Retry-After/backoff. Completed answers
are not rerun.

## Observed behavior

| Scenario | Actual response / outcome |
| --- | --- |
| Recent ordinary follow-up | `THE SEVEN HUSBANDS OF EVELYN HUGO` |
| Ambiguous opening | “Do you mean the book you’re reading or the missing notebook?” |
| Clarifying user follow-up | Journal beneath the cedar bench inside the greenhouse. |
| Topic cancellation | `7 times 8 is 56.` |
| Conflicting loan evidence | Both $280,000 and $330,000; discrepancy explicitly unresolved. |
| Missing account number | Explains that the number is unavailable and loan amounts do not identify it. |
| Historical access phrase | Current `VIOLET-ANCHOR-683`, excluding obsolete `VIOLET-ANCHOR-638`. |
| Regenerate and swipe-generation | Actual provider/saved replies agree and preserve the correct code. |
| Host-process restart / browser reload | Verified saved-key restore without re-entry or duplicate upserts; correct code. |
| Memory disabled | Native full history, no memory query/guidance, correct code. |

Assistant semantic inspection checks all eleven full answers and actual provider
prompts against frozen source and rubric. Both conflicting amounts and both code
versions reach the prompt; the final response distinguishes them. The generated
clarification enters Query 2 with the following user input. No independent human
review or improvement over a matched baseline is claimed.

All eleven OpenAI calls return HTTP 200 on their first provider attempt, without
rate-limit admission waits. Six streamed replies are visible during generation.
Only five non-streamed replies supply billed usage: 21,834 input and 124 output
tokens. This is partial usage, not the complete cost; managed inference cost is not
measured. The final live attempt passes 78 transport/lifecycle assertions, submits
193 documents and records 156 browser LambdaDB requests. Ownership-checked Node
cleanup requests are not included in that browser count.

The live swipe-generation probe calls `Generate('swipe')`; that API alone does not
perform the complete swipe-right UI selected-index transition. Do not interpret it
as live UI selection certification. Separate maintained actual-host/emulator checks
invoke native `swipe_right()`, preserve the previous variant, advance selection and
confirm selected text after reload. They also reproduce preparation failure through
native generation and subsequent synchronization: 102 checks, zero page errors and
zero remaining emulated collections. Existing final-prompt/retention regressions
remain; no core or generation protocol is patched.

## Service failures and product fix

Two initial attempts stop before any OpenAI call when a memory query returns 503.
The later full attempt encounters three analogous first-chat-query failures and
completes by explicitly retrying each pending input once through native Regenerate,
with one-second transient backoff. The failed and successful query bodies are
byte-equivalent per scenario. The gate also transiently receives 503s and uses its
existing bounded polling. Across all attempts there are nine browser-observed query
503s. Source remains local and no generation is dispatched for a failed preparation.
There is no product automatic query retry added by this change.

The operation status is overwritten by `GENERATION_ENDED` scheduling background
sync, so it can say “Waiting to synchronize” after an aborted generation. Keep the
failure and recovery guidance in the independent last-prompt delivery line.
For a generation failure, recovery explicitly says to wait and regenerate the
pending request; Sync alone does not resume an aborted generation. Background
synchronization retains its own Sync guidance. Its
ownership guard, sanitized errors, auth handling, query limits, cancellation and
remote effects remain unchanged. Do not raise production timeouts or alter search
settings to conceal the service failure.

No backend trace identifies whether embedding, reranking or another service stage
causes those 503s. Successful completion after retries is not a claim of seamless
first-use reliability. Keep original failed attempts and distinguish expected 404
absence checks from errors. The first two receipts use inherited one-off producer
code; the final plan/producer is explicitly locked and retained with the run.

All eight owned collections across the three attempts are deleted with API absence
verified. Saved/runtime LambdaDB credentials are forgotten and key values are
absent from native/browser storage and reports. Temporary host data is removed;
original evidence is retained in [the evidence index](evidence-retention.md).
Fresh Git URL installation, other models/APIs, long unresolved-dialogue quality,
large-context limits and official benchmark accuracy remain unverified here.
Main promotion, release and deployment are separate decisions.

## Review follow-through

Automatic review identified that the initial persistent error still directed users
only to Sync. The correction changes generation recovery copy in both operation
and last-prompt status, with coverage across auth, permission, rate-limit, timeout,
network, query-limit and generic errors. Background Sync guidance is unchanged.
Final units pass 367/367 on Node.js 20.12.0 and 24.15.0; the actual-host/emulator
run again passes 102 checks with zero page errors/resources. The original paid run
measured the first visibility fix; this follow-up changes recovery rendering only.
All real answers and failed attempts stay unchanged; no paid answer is regenerated.
