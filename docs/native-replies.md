# Native replies and clarification guidance

## Product decision

Use SillyTavern's native reply format and streaming to reduce provider restrictions
and preserve immediate character-chat feedback. Remove the structured reply
adapter, request-status classification, unresolved-dialogue accumulation, stream
hiding and reply recovery markers. There is no new compatibility mode or setting.
This supersedes the pending-span policy in the historical
[clarification evaluation](clarification-context-evaluation.md), without changing
its frozen results or deleting their evidence.

Keep Query 2, the recent-five/pair-aligned-six window, displaced-pair writes,
per-message chunks, source validation, branch isolation, checkpoints and the
existing managed-embedding/Bayesian/Jev search and budget defaults. Search and
render only the current request's recalled memory; no prior retrieval is accumulated.
No host core or server plugin is added.

## Behavior and tradeoff

The budgeted system instruction asks one brief clarifying question when the user's
intent or referent is ambiguous. If available context is missing, insufficient or
conflicting, explain what is established, request the necessary additional context
and avoid invention. Missing retrieved evidence does not prove an event never
occurred. Keep the character's voice and follow topic changes or cancellations.
The instruction is in [the runtime source](../src/context.js); it does not guarantee
model compliance, factual accuracy or detection of every ambiguity.

Native authored JSON stays literal chat text. User-selected schemas and provider
settings are not overridden. Streams are not buffered or hidden by SillyMemory.
Reload, edits, swipes and branches use native chat source without an extension
request-status record. There is no special Continue restriction for clarification.

A clarification dialogue longer than the retained window can lose its earlier
request unless retrieval supplies it. Query 2 can also include an irrelevant prior
reply after a topic change. These are explicit tradeoffs for simpler native UX,
not evidence that the removed policy had no quality benefit.

Memory preparation errors stop generation explicitly, clear stale injection and
preserve local source. Retry after recovery, or disable memory to use native full
history. The existing Stop on missing context toggle governs verified final-prompt
loss, not synchronization/search failure. A budget too small for the complete
instruction stops preparation rather than omitting the instruction silently.

Final role/content delivery verification remains limited to Chat Completions.
Flattened Text Completion prompts can generate, but visibly report verification
unavailable; Stop on missing context cannot detect their truncation. No blanket
provider, model, streaming or tool-support certification is claimed. Group/tool
chats remain unsupported.

## Validation boundary

Validation uses SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, isolated disposable profiles and Chromium.
LambdaDB and completions are controlled local emulators; no live managed inference,
real completion-model calls or API credentials are used by these checks.

- `npm test` and Node.js 20.12.0 `node --test tests/*.test.js`: 366 tests pass
  on each; current runtime, script/test syntax, release metadata and locked SDK
  bundle checks pass. Retired adapter tests were removed with their implementation.
- `ST_SOURCE=<pinned host> ST_TEST_PORT=18136 SM_ARTIFACT_TAG=native-reply-final2 npm run test:browser`:
  97 checks pass, exercising native plain/streaming Chat Completion, follow-up Query 2, topic change,
  literal JSON, regenerate, reload, a user-selected response format, disabled
  memory and Text Completion with explicit unavailable verification.
- The same host with `ST_TEST_PORT=18137 SM_ARTIFACT_TAG=native-reply-final npm run test:faults`
  94 checks pass, covering synchronization, stale requests, deletion, branches/checkpoints, auth,
  timeouts and explicit query-error aborts.
- `ST_SOURCE=<pinned host> ST_DELIVERY_PORT=18138 node scripts/prompt-delivery-smoke.mjs artifacts/prompt-delivery-native-reply-final.json`:
  checks 18 native packing/cancellation cases, repeated packing, overlap ownership
  and source assembly. This includes a guidance-too-large abort with no completion
  dispatch and preserved source, separately from final-prompt truncation.

All three host runs complete with zero remaining emulated collections and no
uncaught browser errors. The responses in the native-reply scenarios are scripted, including clarifying
questions and evidence-gap explanations. They establish delivery/lifecycle behavior,
not answer quality or spontaneous model clarification. Older paid model results
are not new validation of this instruction. Initial fixture failures and final
receipts are preserved in [the evidence index](evidence-retention.md).

## Subsequent live validation

The [bounded native reply UX run](native-reply-validation.md) exercises actual
managed LambdaDB and Sol without a reply schema. Eleven native generations finish
with the expected narrow behavior; actual service failures require explicit failed
generation retries, and complete swipe-right UI selection is verified separately
with controlled completions. This does not certify other providers or establish a
new benchmark score. Preparation failure now stays in the last-prompt delivery
status even when native generation-ended synchronization updates operation progress.
