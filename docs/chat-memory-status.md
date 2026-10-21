# Chat memory status and recovery

## Product decision

Expose memory state above SillyTavern's native message composer, so users can
check readiness and recover without repeatedly navigating extension settings.
The bounded scope is status, unsupported/conflicting settings, and explicit
recovery actions. Retrieval, storage, context budgeting, native generation formats,
and model instructions keep their existing behavior.

The collapsed, keyboard-accessible Memory summary expands to operation progress,
last-prompt delivery feedback and relevant actions. It uses the host theme and
wraps on narrow screens. It contains no source excerpts or credentials; detailed
excerpt inspection remains in Advanced settings.

## State and action boundaries

- Ready describes a supported, enabled chat. It does not assert that memory has
  reached a prompt. Last prompt verified appears only after the final host prompt
  check; partial/unavailable verification and missing excerpts have distinct states.
  Delivery verification is not an answer-quality guarantee.
- Connect, setup, temporary test cleanup, unsupported chats, saved checkpoints and
  another active browser tab have explicit status. Existing settings and cleanup
  actions remain authoritative.
- Built-in Vector Storage is not a dependency. SillyMemory connects directly to
  LambdaDB. Existing retrieval skips chats with built-in chat vectorization on;
  the new notice opens its native controls without changing another extension's
  settings. Group/tool conversations remain unsupported.
- Synchronization recovery uses the existing retry action. A stopped generation
  remains visible after background synchronization finishes.
- Retry reply is available only for a failed normal/regenerate request with an
  unchanged pending user turn. Before invoking SillyTavern's native Regenerate
  menu action, it rechecks the current chat, literal source, enabled connection,
  readiness and host activity. Changed source, another chat or an active generation
  cannot use that saved request. Continue and swipe retain native recovery controls.
  Retrying is an explicit new model request; there is no automatic generation retry.
- Turning memory off keeps local chat and remote memory. Native fallback still
  requires that user action. No provider request or retrieval routing is changed
  by opening the status panel.

The shared supported-chat predicate avoids building a full timestamped transcript
for every progress repaint. Capture still applies the same checks in the same
order before building a source snapshot.

## Verification

Validation uses the pinned SillyTavern 1.19.0 commit
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, Chromium and disposable profiles.
LambdaDB and completions are local controlled emulators. No paid inference,
real credentials, deployment, benchmark or answer-quality evaluation is included.

The maintained browser checks cover keyboard access, narrow layout, native settings
navigation, conflict recovery without a settings change, unsupported chats, readiness
versus delivery verification, synchronization retry, and a stopped native reply.
They verify that a stale retry makes no generation request and an explicit valid
retry makes one request without duplicating its pending user input. Desktop,
narrow and stopped-reply screenshots are inspected separately from those assertions.

The macro-literal regression arms its source after UI previews. The host prompt
manager can independently expand its first source message during a delayed dry
run; the check must isolate interceptor preservation from that native behavior.

Executed on Node.js 24.15.0:

| Command | Outcome |
| --- | --- |
| `npm test` | 402 passed. |
| `npm run check`, `npm run check:release`, `npm run check:sdk` | Passed; release metadata remains 0.5.0. |
| `node --check` for every `scripts/*.mjs` and `tests/*.js` | Passed. |
| `python3 -m unittest discover -s tests -p 'test_beam_past_protocol.py'` | 13 passed. |
| `ST_SOURCE=<pinned host> ST_TEST_PORT=18160 SM_ARTIFACT_TAG=chat-status-reviewed npm run test:browser` | 132 checks passed. |
| Same host/port, `SM_ARTIFACT_TAG=chat-status-faults npm run test:faults` | 112 checks passed. |
| `ST_SOURCE=<pinned host> ST_DELIVERY_PORT=18162 node scripts/prompt-delivery-smoke.mjs artifacts/prompt-delivery-chat-status-reviewed.json` | 18 delivery cases plus packing, assembly and overlap controls passed. |

All host runs leave zero emulator collections and no uncaught browser errors.
The fault receipt precedes the final display-only removal of a duplicated stopped
reply paragraph; the reviewed browser and delivery receipts include that change.
The delivery runner also opens the collapsed connection section before its final
Forget key cleanup; no runtime credential behavior was changed for that check.

Detailed receipts, initial diagnostic failures, inspected screenshots, producer
source hashes, source files and the runtime patch against develop commit
`77197a588198f40687599ce2aba73e02162dd024` are retained in
`artifacts/archive/chat-memory-status-2026-10-21.tar.gz` in the original development
checkout. The archive is **local-only**, unavailable in a fresh clone, and is not a
CI dependency. Its 81 hashed file members were read back and verified. Archive:
2,814,951 bytes; SHA-256
`31a8b15d7062b86f6f071a919e2b89e40623a9f0da4d1432537c8a52400bdc7a`.
Selected final reports and screenshots are also retained under
`artifacts/chat-memory-status-2026-10-21/` in that checkout.
