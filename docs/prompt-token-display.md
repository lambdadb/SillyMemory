# Prompt token display

## Decision

Show the last prepared input estimate and prepared memory size in the expanded
Memory panel. Offer an optional, on-demand comparison of raw dialogue text before
and after memory preparation. Keep generation, retrieval, native response formats
and streaming unchanged; add no model or memory-service requests for diagnostics.

The on/off preference is stored in each native chat’s `sillymemoryEnabled` metadata
flag. New chats default off. Native checkpoints and branches copy the flag, then
remain independent; resumed remote snapshots inherit their saved flag. Frozen
snapshots cannot be toggled in place because their metadata is integrity-checked.
The panel explains the scope, and extension settings manage the shared LambdaDB
connection and preparation. Disabling one chat retains its saved memory and the
connection; it stops that chat’s normal synchronization and injection. The former
browser-wide `enabled` preference is not used as a default for other chats.

## What the numbers mean

| Display | Meaning |
| --- | --- |
| Prepared input | Sum of the host's already-counted messages matching the final plain-text Chat Completions packet. Includes the actual selected character/system prompts and context-trimmed conversation at this host boundary. |
| Prepared memory | Existing memory-budget estimate, including guidance, source labels, dates and archive wrappers. Preparation does not establish provider receipt. |
| Dialogue reference | Same tokenizer applied to role-labelled raw dialogue before and after the interceptor, with memory guidance on the prepared side. Includes all source text provided to the interceptor, without a new reference truncation limit. |

All values are approximate. Prepared input excludes reserved output and does not
measure provider billing, caching discounts or server-side transformations. Unknown
or modified packet formats show **Unavailable**, rather than a stale host count.
Text completion and multimodal/tool packets do not receive a fabricated input
estimate or a remote-tokenizer comparison.

The dialogue reference precedes native macro expansion, formatting and context
trimming. It excludes character/system settings and is **not** the full prompt
SillyTavern would send with memory off. That native path can drop old messages,
allocate examples differently and activate other prompt content. Rebuilding it
would also touch shared prompt-manager state and risk repeating extension/macro
work. Do not interpret the dialogue percentage as full-input or billed-token
savings. Short conversations can grow because memory guidance adds overhead;
both increases and decreases are displayed.

## Cost and isolation

The automatic display only reads existing host message counts. It does not build
another prompt, run another generation or send another memory query. The optional
button uses at most two calls to the existing local Chat Completions tokenizer
(or cache hits). A completed reference cannot be counted again for that prompt.
Counting runs outside the generation event; failure remains diagnostic feedback.

Only minimal dialogue snapshots and numbers are retained in this tab. No metrics
or prompt text are persisted. New generation, source/chat changes, memory
switching and connection loss clear the display. Normal reply completion and
background synchronization and quiet auxiliary reads keep the completed reply's
measurements. In-flight
comparisons check their request object, chat target and tokenizer before updating
the UI, so a late result cannot restore cleared diagnostics.

## Validation

Use the pinned SillyTavern 1.19.0 host and disposable synthetic data. Unit checks
cover native packet matching, unknown/invalid counters, literal macro retention,
source snapshots and both directions of the comparison arithmetic. Browser checks
cover reuse of native counts, bounded local tokenization without generation or
memory requests, tokenizer failure, late completion after disable, reload,
memory-off estimates, unsupported text completion and a longer dialogue that
shrinks under a smaller memory budget. These are display/integration regressions,
not answer-quality, provider-cost or latency measurements.

Token-display validation before per-chat activation, at `48c3ddf54516147061aa18781d5900fb574cff91`,
on Node.js 24.15.0 and Chromium 153.0.8010.12:

- `npm test`: 420 tests passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18130 SM_ARTIFACT_TAG=token-usage-final-v3 npm run test:browser`: 201 assertions passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18131 SM_ARTIFACT_TAG=token-usage-recovery-final npm run test:recovery`: 243 assertions passed, including two host restarts and 24 recovery cycles.

Both runs used host revision `06bde939fb1e9c4c8d8641d810f0a916b5bce127`,
synthetic chats and a local HTTPS LambdaDB emulator. Both had zero uncaught page
errors, host proxy requests and remaining emulator collections. Both reports
match that revision’s runtime/harness hashes. Current per-chat validation is recorded
in [the workflow record](native-chat-workflow.md#per-chat-activation-validation).

Reports and desktop/narrow screenshots are local-only under
`artifacts/token-usage-final-v3/` and `artifacts/token-usage-recovery-final/`. Intermediate
UI checks and the cleanup-focus diagnosis remain separate under
`artifacts/token-usage-browser/`, `artifacts/token-usage-final/` and
`artifacts/token-usage-debug/`; no intermediate run is counted as a final passing
suite. They are ignored artifacts, not CI dependencies or fresh-clone downloads.
No live LambdaDB/OpenAI, installation, release or deployment check was performed.
