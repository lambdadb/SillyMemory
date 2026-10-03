# Repeated passage packing

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

The runtime now renders identical selected excerpts once, retaining all selected
source coordinates, and uses the saved memory budget for additional distinct
retrieved passages. No setting or collection migration is required.

The motivating Korean quotation failure had both the quoted promise and its
signature in the search results. At the effective 320-token budget, two copies of
the same filler displaced the signature. Packing keeps the original four source
passages and adds the signature: 295 tokens without attribution becomes 266 tokens
with attribution. These counts include the rendered labels, using the pinned host
tokenizer; they are not provider billing totals.

## Selection and source preservation

1. Run the existing rank-ordered whole-passage selection with the same budget.
2. Group selected passages only when owner, scope, native role, speaker and exact
   body match. Render the complete escaped body once and list every selected
   one-based `message:passage` coordinate.
3. Place a repeated group at its latest selected occurrence. An intervening
   conflicting statement stays before that group, and the label exposes the
   earlier occurrence too. This preserves source evidence, but is not a guarantee
   that a model interprets repetition or conversation chronology correctly.
4. Adopt the grouped rendering only if its complete token count is smaller.
   Scan the same validated hits in ranking order to add distinct content that
   fits. Never evict a baseline-selected source or truncate its body.

No-repeat inputs take the original path. Labels that cost more than they save
also retain the original rendering. Candidates still require current local IDs,
owner, scope, revision and text. An invalid remote copy cannot suppress a later
valid copy. Remote role/speaker values never override the local source.

The inspection panel shows the grouped label and body. Preparation counts source
passages; final delivery verification counts rendered excerpts (five selected
sources can produce four excerpts). The source chat, synchronization, managed
embedding contract, recent-message retention and budget limits are unchanged.

## Verification

- [Offline replay](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/repeated-packing-v1.json): 362 existing corpus/budget
  conditions, zero evicted baseline sources, zero losses of complete evidence.
  The recorded semantic cohort improves from 26/28 to 28/28 complete-evidence
  selections at both 320 and 400 tokens. Both Korean quotation repetitions gain
  the signature. Other cohorts have no complete-evidence gains or losses.
  Repeated rows across budgets are not independent samples; ranks are recorded
  or synthetic, not fresh live search results.
- [Actual-host prompt test](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/repeated-packing-host-v1.json): unmodified
  SillyTavern 1.19.0, Chromium and built-in proxy. All 11 prior delivery cases,
  same-chat manual recovery and the overlapping-generation regression pass.
  The added Korean quotation case replays the original per-query ranks through
  the emulator. The actual completion endpoint receives all four rendered
  excerpts (including signature and quote), both repeat coordinates, native
  roles and all eight recent messages. The 60 stored source messages are intact.
  LambdaDB and completion responses in this test are local fixtures.
- [Browser regressions](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/repeated-packing-browser-v1.json): 22 checks pass,
  including edits, swipe, deletion, branch isolation, late requests, failure
  fallback, session key clearing and owned collection deletion.
- [Live managed-path smoke](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/repeated-packing-live-v1.json): 12 checks pass
  through the real browser and proxy, including managed embedding upsert/query,
  source/budget validation, isolation, edits, swipe and deletion after engine
  reload. Invalid authentication is rejected, the key stays out of storage, and
  both dedicated test collections are confirmed absent. This small smoke does
  not evaluate the quotation corpus or call a live generation model.

The unit suite also covers source retention at multiple budgets, distinct
role/speaker/scope/owner boundaries, exact-text matching, intervening conflicting
states, chunk ordering, invalid hits and token-counter failure.

This fixes a concrete context-selection failure in the product. It does not
establish general answer-quality improvement, solve actor-attribution reasoning,
recover evidence missing from search results, or change stable-release readiness.
The next quality check can evaluate live answers with this implementation; the
runtime is no longer just an experimental selection policy.

## Reproduce

Point a separate pinned host checkout at this extension, as described in the
[README](../README.md). Preserve each attempt under a new artifact filename/tag.

```sh
export ST_SOURCE=/path/to/pinned/SillyTavern
npm ci
npm test
npm run check
npm run check:release
node scripts/repeated-packing-check.mjs artifacts/packing-replay-local.json
node scripts/prompt-delivery-smoke.mjs artifacts/packing-host-local.json
SM_ARTIFACT_TAG=packing-local npm run test:browser
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=packing-local npm run test:live
```

Only the last command reads credentials or consumes live LambdaDB resources.
All test conversations are synthetic. A failed live cleanup leaves an ignored
pending-resource record that must be resolved before another run.
