# Memory design review — 2026-10-02

This review records the implementation questions raised after PR #42. The
then-current single collection, 800-character chunk size and 800-token default were
initial choices, not demonstrated optima. Evaluate one retrieval variable at a
time; do not interpret failed formatting experiments as evidence against better
indexing or a larger useful memory budget.

The collection design below is now implemented in the development candidate;
see [chat collections](chat-collections.md) for acceptance evidence and limitations.
The original rationale and requirements remain below as historical context.

## Collection ownership and chat lifecycle

The preferred next design is **one collection per character chat, with a separate
collection for each native chat branch**. The maintainer confirmed that a
per-collection fixed fee or standing service overhead is not a reason to pool
these independent memories. Document storage, embedding and request usage remain
separate from collection-count overhead. This is a lifecycle/isolation decision,
not a claim that a collection split improves answer quality.

The pre-change behavior used one owned collection with an owner/scope KNN pre-filter
and local source validation. Scope hashes the owner, character avatar and chat
filename. Native branches have separate filenames and scopes; common prefix text
is reindexed. Renaming a chat creates another scope and leaves its prior records
until full cleanup. The UI only offers deletion of the whole owned collection.
Those lifecycle limitations, rather than an observed cross-chat leak, motivate
the new layout.

The existing checks were rerun at `6aa2600`:

- **Actual pinned host/Chromium/proxy, emulated LambdaDB:** native `createBranch`,
  branch isolation, late-result cancellation, edit/swipe/delete reconciliation,
  key non-persistence and owned cleanup passed.
- **Actual pinned host/Chromium/proxy and live LambdaDB managed embeddings:**
  synthetic parent, branch and different-character snapshots were queried with
  their own scopes; foreign results were rejected. Edit/swipe, reload/deletion,
  authentication and key reset checks passed. Both owned collections were deleted
  and confirmed inaccessible.

The live branch test constructs distinct engine snapshots; the native branch UI
test uses an emulator. Together they establish these bounded checks, **not** a
full real-native-branch/live-provider workflow, scale behavior or a new collection
layout. Detailed reports and source hashes are retained with the budget run's
local-only archive.

Acceptance requirements for the new layout:

1. Bind a collection to a durable chat identity, not its display filename.
   Pinned SillyTavern exposes `chatMetadata.integrity`; `createBranch` explicitly
   mints a new value. A rename reloads the file and emits old/new filenames.
   Verify identity persistence and import/duplicate-chat behavior before using
   that value as the key. Do not assume copied metadata is globally unique.
2. Persist ownership and pending collection creation **before** remote writes.
   A create timeout followed by reload must reconnect only after verifying tags;
   it must not create untracked collections or adopt unrelated resources.
3. On native branch creation, provision a distinct target and index only that
   branch's current source. Start with ordinary managed upserts. Mapping a native
   branch point to a LambdaDB committed snapshot/fork is a separate problem and
   is not included merely by splitting collections.
4. Support deleting the current chat's owned remote memory independently. Define
   explicit behavior for native chat deletion and retain cleanup identity until
   confirmed. Keep a separate all-owned-memory operation with ownership checks.
5. Make collection lookup/recovery work after browser reload and account settings
   reload. Define discovery after browser-storage loss. A Web Lock coordinates
   one browser profile only; it does not coordinate two devices writing together.
6. Replace existing single-collection settings deliberately: never silently drop
   their cleanup pointer or delete old data as a side effect of an upgrade.
7. Accept only after real-host tests cover parent/branch divergent facts, edits,
   deletion, rename/reload, failed creation/deletion, switching during requests
   and preservation of unrelated collections. Include a live-provider run of
   the complete native branching workflow, not only independent snapshots.

Source inspection: [native branch identity](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/bookmarks.js#L187),
[chat rename event](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L10685).

## Chunk boundaries and neighboring dialogue

The pre-change indexing split each old message every 800 Unicode code points,
without overlap or sentence/paragraph awareness. The [boundary-aware indexing
candidate](boundary-chunking.md) now preserves exact source partitions at preferred
boundaries while retaining the same ceiling and no overlap. It preserves code points, not complete
words, sentences, grapheme clusters or semantic units. A chunk can separate a
condition from its consequence. Short messages are kept whole.

The next indexing candidate should preserve short messages, prefer paragraph and
sentence boundaries in long messages, and enforce a token ceiling. A bounded
sentence overlap is worth comparing, with exact source offsets so overlapping
regions can be merged before prompt injection. The existing duplicate packer
only consolidates identical complete text; it does not merge partial overlap.

Cross-message context is a distinct issue: a store name can be in the previous
turn while the coupon action is in the retrieved turn. Preserve links to adjacent
turns and evaluate bounded neighbor expansion separately. Retain speaker roles,
source order, dates, negations and corrections. Avoid adding a generation-model
dependency just to split text before testing a deterministic boundary policy.

The [earlier sentence experiment](sentence-passage-results.md) shortened already
retrieved parent chunks. It did not test separately indexed boundary-aware
chunks. A new chunker requires new embeddings/searches and document-identity
reconciliation; cached old rankings cannot validate its retrieval quality.

## Consistent reads and hybrid retrieval

The runtime awaits every ordinary upsert batch (at most 50 documents) and required
deletion before searching the same LambdaDB `main` branch with
`consistentRead: true`. It does not poll index completion. A sync acknowledgement
means writes were acknowledged; query visibility relies on the consistent-read
contract. Bulk import is not used.

The collection already configures a text index, but current content retrieval is
vector-only. Compare vector-only against BM25/vector RRF with the same query
construction, candidate count, recent window, chunking and memory budget. Exact
names, places and unusual expressions are plausible lexical strengths; indirect
references remain a reason to retain semantic search. Apply the identical owned
chat restriction to both retrieval paths, and safely treat user text as text,
not query syntax. Judge final evidence selection and answers as well as candidate
coverage; an already-retrieved source may benefit from improved ranking.

Contracts: [consistent reads](https://docs.lambdadb.ai/guides/search/search-overview),
[hybrid query](https://docs.lambdadb.ai/guides/search/hybrid).

## Work order and completion boundary

First complete the fixed 800/1600/3200 budget comparison with unchanged source
and candidates. Use its token/answer tradeoff to choose a provisional operating
budget. Next validate boundary-aware indexing and hybrid retrieval separately,
with final answers rather than source-message overlap alone. The collection
lifecycle change is independent and must have its own product acceptance checks.

Do not launch a new broad benchmark or publish a PR for each intermediate retry.
Keep one bounded quality change's completed evidence and decision together. The
previous 42 evaluation questions are consumed; any replay is diagnostic, never
fresh held-out confirmation. English remains the near-term evaluation priority.
