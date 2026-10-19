# Repeated passage packing

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

The runtime renders identical selected excerpts once, retaining their selected
source coordinates. Admission now follows retrieval order using the cheaper final
assembled or separate layout; there is no preliminary whole-passage source floor
or distinct-content refill pass. See [source assembly](source-assembly.md) for the
current admission contract. No setting or collection migration is required.

At the original packing adoption, the motivating Korean quotation failure had both
the quoted promise and its signature in the search results. At the effective 320-token budget, two copies of
the same filler displaced the signature. That historical policy kept four source
passages and added the signature: 295 tokens without attribution became 266 tokens
with attribution. These counts include the rendered labels, using the pinned host
tokenizer; they are not provider billing totals.

## Selection and source preservation

1. Validate hits against current local source, then visit valid unique hits in
   retrieval order. An invalid remote copy cannot suppress a later valid copy.
2. Tentatively add each hit and render the complete proposed set. Assemble
   compatible same-message chunks; group identical text only across matching owner,
   scope, native role, speaker and time/source metadata. Preserve complete bodies
   and every selected one-based `message:passage` coordinate.
3. Place repeated groups at their latest selected occurrence. Intervening conflicting
   statements remain earlier; labels expose earlier occurrences too. Final presentation
   stays chronological, without guaranteeing the model's interpretation of chronology.
4. Count both assembled and separate layouts, including the archive heading and shared system guidance through
   the caller's counter. Admit the hit only if the cheaper complete layout fits.
   Later hits may use remaining space; selected bodies are never truncated. This can
   select different sources from the retired whole-passage-floor/refill policy.

If grouping costs more than it saves, use the separate layout. Remote candidates
must match current IDs, owner, scope, revision, text and time/source metadata;
remote role/speaker values never override the local source.

The inspection panel shows the complete quoted archive with grouped labels and bodies.
Preparation counts source passages; final delivery verifies one complete archive
block regardless of the number of source excerpts it contains. The source chat, synchronization, managed
embedding contract, recent-message retention and budget limits are unchanged.

## Historical verification

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

Current unit coverage checks retrieval-order assembled admission at multiple budgets,
distinct role/speaker/scope/owner boundaries, exact-text matching, intervening conflicting
states, chunk ordering, invalid hits and token-counter failure.

The historical adoption fixed a concrete context-selection failure. It did not
establish general answer-quality improvement, solve actor-attribution reasoning,
recover evidence missing from search results, or change stable-release readiness.
For current adoption evidence, use the [Query1 decision](query1-retrieval-quality.md);
do not apply the historical no-eviction guarantee to the new admission policy.

## Reproduce historical evidence

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
