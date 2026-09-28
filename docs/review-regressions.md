# Promotion review regressions — 2026-09-28

The two P2 findings on [PR #5](https://github.com/lambdadb/sillymemory/pull/5)
were reproduced against the merged sync-status adapter:

- [Quiet generation](https://github.com/lambdadb/sillymemory/pull/5#discussion_r4116204769)
  consumed the 400 ms event debounce without replacing it with synchronization.
  It now clears the memory injection while preserving both pending and in-flight
  sync. Only a generation that proceeds to retrieval cancels the debounce timer.
- [Lock-conflict status](https://github.com/lambdadb/sillymemory/pull/5#discussion_r4116204773)
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
[passing report](../artifacts/fault-smoke-review-fixes-verified.json).
All **44 unit tests** pass on Node.js 20.12.0 and 24.15.0; runtime and changed
harness syntax checks also pass.
