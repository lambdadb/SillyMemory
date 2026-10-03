# Promotion review regressions — 2026-09-28

The two P2 findings on [PR #5](https://github.com/lambdadb/SillyMemory/pull/5)
were reproduced against the merged sync-status adapter:

- [Quiet generation](https://github.com/lambdadb/SillyMemory/pull/5#discussion_r4116204769)
  consumed the 400 ms event debounce without replacing it with synchronization.
  It now clears the memory injection while preserving both pending and in-flight
  sync. Only a generation that proceeds to retrieval cancels the debounce timer.
- [Lock-conflict status](https://github.com/lambdadb/SillyMemory/pull/5#discussion_r4116204773)
  was overwritten by key-entry guidance after a chat event despite disabled
  controls. Scheduling now leaves the status untouched when the session is not
  ready. No lock or credential policy changed.

The browser harness now uses an explicit Chromium context so two tabs share
storage and Web Locks. New checks invoke the shipped quiet interceptor during a
pending debounce and a held upload, and open a second real tab before emitting
chat events. They check exact remote source IDs, completion status, retained lock
instructions, disabled controls, and absence of proxy requests from the blocked
tab. They do not perform a model-backed quiet generation.

Before the quiet fix, `fault-smoke-review-quiet-red.json` timed out waiting for
synchronization. With only that fix, `fault-smoke-review-lock-red-v2.json` passed
both quiet checks and failed the lock-status assertion. An earlier attempt
(`fault-smoke-review-lock-red.json`) failed in test setup because Playwright's
single-page convenience API disallowed a second tab; it is not product-failure
evidence. All these reports remain ignored local artifacts.

Run the complete real-host/emulator regression suite with:

```sh
ST_SOURCE=/absolute/path/to/isolated/pinned/SillyTavern SM_ARTIFACT_TAG=review-fixes-verified npm run test:faults
```

Use a new tag for subsequent runs. No live LambdaDB or OpenAI calls were made
for this fix. The live results recorded in the promotion validation apply to
`0a91fd5f1205560da3457121a2b372650383fbde`, before these adapter changes.

With both fixes, the full suite passed **66 checks** on pinned SillyTavern 1.19.0
and Chromium. It reported no uncaught primary-page errors, zero emulator
collections, and completed journal cleanup. All ten recorded source hashes match
the final runtime/harness. Review the ignored local
passing report (`artifacts/fault-smoke-review-fixes-verified.json`, local-only).
All **44 unit tests** pass on Node.js 20.12.0 and 24.15.0; runtime and changed
harness syntax checks also pass.

## Follow-up: quiet/normal retrieval overlap

[The follow-up P2 finding on PR #6](https://github.com/lambdadb/SillyMemory/pull/6#discussion_r4118248799)
identified an overly broad preservation of earlier work: a normal retrieval
could finish after a quiet call and restore the global memory injection.
`fault-smoke-quiet-overlap-red.json` reproduced this with a held query through
the real host interceptor dispatcher, while both earlier quiet-sync checks
still passed.

Read cancellation is now separate from source invalidation. A retrieval captures
its cancellation signal before synchronization, permits current source writes
to complete, and rejects canceled reads after search or token counting. The
adapter separately invalidates prompt ownership, aborting the old normal
interceptor without pruning its history or restoring an injection. A quiet
prompt completes without memory and does not disturb a newer manual sync's
status. No batch sizes, request timeouts, key handling, or retry policy changed.

Three unit regressions cover cancellation during a 120-chunk write (all three
batches complete and no query starts), late query responses that ignore abort,
and cancellation during token counting. Two browser checks cover overlapping
normal/quiet dispatch and recovery on the next normal generation. This exercises
real host dispatch with an emulated upstream, not paid model generation.

The follow-up passed **47 unit tests** on Node.js 20.12.0 and 24.15.0 and
**68 real-host/emulator checks**, with no uncaught primary-page errors and no
remaining emulator collections or journals. All ten runtime/harness hashes
match the final source. Review the ignored local
follow-up report (`artifacts/fault-smoke-quiet-overlap-verified.json`, local-only); use
`SM_ARTIFACT_TAG=quiet-overlap-verified` with the command above to reproduce
under a fresh tag. Live LambdaDB/OpenAI generation was not rerun.
