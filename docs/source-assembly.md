# Source-preserving memory assembly

## Behavior

The memory injection path now assembles selected chunks from the same message and
revision using their returned text and UTF-16 `start`/`end` offsets. The formatter
needs no complete message, dataset, local source slice, extra retrieval or LLM.
The surrounding engine still synchronizes the current chat and validates returned
IDs, ownership, scope, revision, exact text and time metadata against current
source documents. Remote role/speaker/offset fields never override those documents.

- Establish the existing repeated-passage selection, including its refilled
  passages, as the source floor. Assembly cannot remove those sources.
- Keep identical-text groups opaque, with every source coordinate at their latest
  occurrence. Do not join across these groups, other messages/revisions, roles,
  speakers, owners/scopes or conversation timestamps.
- Adjacent singleton chunks share a message/passages/time header. Sort by original
  offsets, join touching ranges and remove overlap only when the returned overlapping
  UTF-16 text matches. Never fill a missing interval: insert
  `[Omitted original text between excerpts]` between separated ranges.
- Invalid coordinates, inconsistent chunk order or conflicting overlap retain
  the original separate excerpts. Literalize macros after joining; recall cannot
  execute a macro split across chunk boundaries.
- Try additional distinct hits in the original search order, counting the complete
  assembled candidate. This also checks a rejected adjacent chunk when the floor
  contains only one chunk: sharing its header can make the pair affordable.
  Retain the exact source-floor representation when no cheaper rendering or
  additional source fits. Never evict or truncate an existing passage.

This is the same source-union mechanism evaluated in
[PR #70's fixed-search benchmark](https://github.com/lambdadb/SillyMemory/blob/00298741f853bd6c8034cb6dbff2dfc354e435a7/docs/jev-depth-100.md#completed-fresh-source-assembly-answer-regression),
implemented without its full-source dependency or benchmark-specific session-date
renderer. Its 93.8%→95.0% consumed-cohort score is **not a new runtime/default score**.
Product repeat-packing selection remains a floor as well; this PR does not claim
identical admission or answer results between the benchmark and runtime.

Current defaults are recent12, memory budget4096 (maximum4096), chunk ceiling800
codepoints, vector k100/rerank candidate100/final size50, Bayesian English fusion with managed Jev and one
complete-recent-dialogue query. The host's existing one-quarter-context budget cap,
current-chat validation, cancellation, session-only key and prompt-delivery checks
are unchanged. No new mode, stored format, provider option or SDK change. See the
[later numeric-default adoption](profile-50-host-validation.md#product-default-adoption);
the assembly verification below retains its originally measured settings.

## Verification

At the develop baseline `ec0834e8641ff4b35f9b348981d89117725ce886`:

- `npm test`: 333/333 passed on Node24.15.0. Nine small assembly regressions and a delivery-count regression cover
  source-only adjacency, explicit gaps/exact and conflicting overlaps, invalid
  coordinates/order, identity/time boundaries, opaque repeat citations,
  UTF-16/macros, source-floor refill, stale/foreign/deleted hits and fallback/count
  failures. Existing synchronization/cancellation/isolation/budget tests still pass.
- `npm run check`, `npm run check:release`, `npm run check:sdk`: passed. SDK0.8.0,
  release metadata0.4.0Unreleased and search contracts are unchanged.
- `ST_SOURCE="$PWD/artifacts/host-source" SM_ARTIFACT_TAG=source-assembly-review npm run test:browser`:
  44 checks passed on real pinned SillyTavern1.19.0/Chromium153.0.8010.12, with local
  HTTPS LambdaDB emulation. Multi-chunk source is assembled through the actual
  extension dispatcher, stays under the unchanged1024 effective cap for4096 host
  context, and leaves stored history intact. Reload/key handling, edits/swipes,
  deletion, branches/races, provenance and owned cleanup also pass.
- `ST_SOURCE="$PWD/artifacts/host-source" node scripts/prompt-delivery-smoke.mjs artifacts/prompt-delivery-source-assembly-review.json`:
  all13 existing allocation/delivery cases plus overlap, repeated packing and the
  new assembly scenario passed. The real host sends the complete joined source
  with native role and one timestamp to the local completion endpoint; final host
  verification and stored-history preservation pass. No actual model is called.
- `ST_SOURCE="$PWD/artifacts/host-source" ST_TEST_PORT=18127 SM_ARTIFACT_TAG=source-assembly-review npm run test:faults`:
  76 real-host/emulator checks passed, including HTTP401/403/429/503, query timeout,
  accepted/lost write acknowledgments, interruption/reload, cleanup and absence of
  browser page errors. Both browser runs end with zero emulated collections.
- One-off offline `node artifacts/source-equivalence.mjs`: all1000 archived selected
  memories,23362 blocks and5208 assembled blocks match the old full-source oracle's
  raw source unions, gaps, roles/names and placement, using only selected chunks.
  Input SHA-256 `488359e6c6d04dd5c7fb01e745034a2a9de68d9f511a1ea54455236366de00a8`
  matches the immutable assembly archive. Header/session-prefix decoration differs;
  this checks formatting, not runtime admission or new generated-answer quality.

The first dispatcher fixture expected its entire long message under the unchanged
1024 effective cap; it was too large. A smaller multi-chunk fixed input tests full
source delivery without increasing the cap. Initial failures are retained locally.
Old delivery-pressure inputs also crossed the now-enforced8KiB complete-query limit;
80 repeats instead of100 keep query admission valid while still losing context in
1536. A preflight checks this distinction. Historical repeat-packing ranks remain
fixed while the emulator explicitly validates the current single complete query;
it is a packing fixture, not a live search-quality result. Selecting the edit target
by message identity replaces an invalid assumption about remote insertion order.

Review follow-through distinguishes preparation's source-passage count from final
verification's rendered memory-excerpt count. Two chunks can form one excerpt;
partial loss of that excerpt still stops generation. The inspector uses the same
excerpt terminology. This is a label correction, not weaker delivery verification.
Initial implementation evidence remains immutable; the evidence index separately
records the reviewed report and reruns.

After PR70 merged, develop `16992234507ed4402fb3d65ebc5c90fbc1aad467` was
incorporated without changing either evidence-index addition. A further review
identified the one-selected-chunk case described above. Two small regressions
check exact-budget recovery in both ranking orders, invalid-hit rejection,
identity/overlap/coordinate boundaries, over-budget fallback and failed counting.
The earlier 333-test and browser/fault records remain historical evidence;
the follow-up validation is recorded separately in the evidence index.

No credentials, paid provider calls, live LambdaDB resources, new quality score,
independent confirmation cohort, release or deployment are involved. Previously
unused data with checked question/conversation provenance is still required for
independent quality confirmation before claiming general improvement. Merge and
public main promotion are separate decisions. See the evidence index for retained
local runs; raw outputs and one-off helpers stay outside Git/CI.
