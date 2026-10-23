# Versioned story memory

The current development candidate uses this layout for every chat. The
[default-storage decision](default-story-memory.md) removes the pre-release
opt-in and compatibility paths. Native checkpoints and branches use the ordinary
chat workflow; optional frozen memory snapshots are explicitly saved/resumed under Advanced.
The dated validation sections below preserve the original PR #53 results.

## Decision and acceptance boundary

Use a collection for one story family and a writable LambdaDB branch for each
native SillyTavern chat path. Preserve stable document identities across a shared
prefix, reconcile the selected local transcript before retrieval, and keep
unrelated stories isolated. No previous storage layout or migration path is maintained.

The first implementation covers branch inheritance, reconciliation after edits,
swipes/deletions and earlier-point forks, reload/uncertain-request recovery, and
branch-scoped deletion. Completion requires no upserts for unchanged inherited
committed documents, no parent/sibling leakage, and verified owned-data cleanup.
Measure submitted document counts and branch preparation time, not answer quality.

Use a dedicated synthetic collection for the initial live API check (at most
three small text documents, four branches, no generation-model calls). Subsequent
actual-host acceptance may use at most four owned collections and twenty short
English messages per chat. Preserve pending ownership before creation and confirm
cleanup; do not retry an incomplete run before cleanup is resolved. No personal
chat data or direct embedding-provider credentials are used.

Checkpoint save/resume is the next layer on this structure, not implicitly
provided by a memory branch. It must bind retained checkpoint branches to saved
SillyTavern transcripts and swipe state. Tags alone cannot be writable fork
sources in the current API. Aliases are unnecessary on the active chat path,
which needs direct-branch consistent reads. No whole-chat rollback is claimed by
this first branch-inheritance implementation.

## Use and storage model

Connect with a session key, pass the synthetic transport test, prepare memory,
select a character chat and enable memory. Its complete story identity is saved
and verified on the host before remote use. The first sync indexes older local
history into the story branch. There is no storage-mode selection or conversion.

- `smstory_<hash(owner, character, story)>` contains the family. Each selected
  chat has a `chat_<saved chat ID>` writable branch. Empty `main` is the root for
  independent stories. Metadata includes a format version, story ID and optional
  source chat ID; common document IDs use the story scope and source revisions.
- Native branching rotates the chat ID and proves its source against the host's
  saved inventory/integrity metadata before inheriting the family. Renaming
  preserves identity. Copies and unverifiable parent references get an independent
  story, so missing/renamed/deleted parents can cost another initial indexing.
  Branching an already-versioned branch follows the same rule.
- Before a fork, confirm committed state. When the current client observed the
  actual final write and its expected value was not already committed beforehand,
  poll just that document with `consistentRead: false`. Ordered branch commits
  make its arrival evidence for earlier writes. Reuse that confirmation until
  another write; a new successfully created branch already contains committed
  state. An upsert acknowledgement alone is not enough. Unknown/reloaded,
  ambiguous or deletion-only histories keep the original full inherited-document
  checks. See [commit confirmation and its limits](commit-confirmation.md).
  Polling allows 120 attempts with one-second intervals per witness/fallback batch;
  each request retains its 15-second timeout. This is not a whole-operation deadline.
- Fork the committed source branch. On first use, reload or an uncertain request,
  list committed documents and fetch expected IDs consistently. Adopt only exact
  field matches; delete obsolete/future/protected-recent chunks, then upsert only
  missing or changed documents in the existing batches of 50. A lost response can
  be recovered without blindly repeating a successful write. If the source branch
  no longer exists, rebuild from local history through an empty root branch.
- Search uses `knn.queryText`, `consistentRead: true` and an explicit branch ref,
  with the owner/story filter. Validate retrieved IDs and text against the current
  local transcript before token-budgeted injection. Retrieval, chunking, token
  limits, recent-message protection and managed embedding provider are unchanged.

**Delete this chat's remote memory** deletes only its writable branch. The empty
family collection can remain; **Delete all owned remote memory** discovers and
removes entire owned story families and their branches. Local chats
are preserved. Deleting a native chat or uninstalling the extension does not
remove remote memory automatically. Snapshot retention/backups remain provider
policies; branch disappearance is not proof of physical erasure.

Reload verifies the saved browser key before restoring the enabled preference.
Concurrent writers on multiple
devices remain unsupported. Out-of-line document responses fail safely. Long
histories need paginated source reconciliation; latency and memory consumption at
large scale are not established by the small acceptance fixture.

## Format boundary

No existing user data needs migration in this experimental project. Unsupported
chat metadata is rejected rather than converted or silently sent to another
storage layout. Historical release behavior is retained only as evidence.
The checkpoint guide documents explicit save/resume and its restore limits.


## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/versioned-memory.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
