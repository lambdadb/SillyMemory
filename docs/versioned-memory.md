# Versioned story memory

This records the branch-inheritance scope validated in PR #53. The current
0.3.0 candidate also includes optional [frozen checkpoints](checkpoints.md), with
a separate acceptance record and transcript/restore boundaries.

## Decision and acceptance boundary

Use a collection for one story family and a writable LambdaDB branch for each
native SillyTavern chat path. Preserve stable document identities across a shared
prefix, reconcile the selected local transcript before retrieval, and keep
unrelated stories isolated. Existing per-chat collections remain available for
explicit cleanup; do not silently destroy or rewrite them.

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

This is opt-in in the unreleased 0.3.0 candidate. Connect with a session key, pass
its synthetic transport test, prepare memory and select a saved character chat.
Click **Use versioned memory for this story**, confirm, then enable memory. The
first sync indexes older local history into a new collection. Existing legacy
remote data stays available for **Delete all owned remote memory**. The choice is
saved in native chat metadata; it is not a browser-only preference.

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
removes entire owned families, legacy collections and their branches. Local chats
are preserved. Deleting a native chat or uninstalling the extension does not
remove remote memory automatically. Snapshot retention/backups remain provider
policies; branch disappearance is not proof of physical erasure.

Reload still clears the key and disables memory. Concurrent writers on multiple
devices remain unsupported. Out-of-line document responses fail safely. Long
histories need paginated source reconciliation; latency and memory consumption at
large scale are not established by the small acceptance fixture.

## Migration and rollback

No bulk conversion is performed. Opt-in requires new initial embedding/storage
usage and temporarily retains old collections. Turning memory off does not undo
that choice. Before reverting to 0.2.0, use 0.3.0's all-owned cleanup if remote
cleanup is desired: 0.2.0 cannot discover/manage `smstory_*` collections and will
use its earlier per-chat layout. Keep a native data backup; code rollback does
not restore transcripts or reverse metadata/data changes. Re-enabling memory can
rebuild it from local history. Checkpoint controls and their restore limits are documented separately in
[the checkpoint guide](checkpoints.md).

## Contracts inspected

The official [Branches, Tags and Aliases API guide](https://github.com/lambdadb/docs/blob/main/guides/data-versioning/branches-tags-aliases.mdx)
and [versioning overview](https://lambdadb.ai/blog/introducing-data-versioning)
identify committed branch state as the fork source, with snapshot metadata and
isolated writes. Current writable forks require a Branch in the same collection;
Tags cannot be their source. Aliases do not support the required consistent read.
Source inspection alone did not establish live compatibility.

Pinned host: SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. The host's native branch operation
saves a new integrity value and `main_chat`, initially copying extension metadata;
SillyMemory rotates its identity when that branch opens. The host core and
LambdaDB are unmodified. Browser transport remains the released direct CORS path,
with cookies/host CSRF omitted and the host proxy disabled.

## Validation and interpretation — 2026-10-03

| Evidence | Result | Boundary |
| --- | --- | --- |
| Unit suite | 284 passed | Includes inheritance, independent copies, lost acknowledgements, earlier forks, cancellation and branch request routing; synthetic |
| Pinned host + Chromium + local HTTPS emulator | 29 passed; zero remaining collections | Existing per-chat lifecycle and failure regressions; no live embeddings |
| Node HTTPS + live LambdaDB managed embeddings | 7 passed; cleanup confirmed | Commit barrier, snapshot parentage, inherited queryText, child edit/delete and parent isolation; no browser |
| Pinned host + Chromium + live LambdaDB managed embeddings | 19 passed; cleanup confirmed | Actual opt-in UI, native branches, reload, queryText interceptor and branch/family cleanup |

The actual-host managed run submitted the following document upserts:

| Operation | Submitted documents |
| --- | ---: |
| Synthetic transport gate | 1 |
| First parent sync | 4 |
| Unchanged native fork | 0 |
| Edit one child message | 1 |
| Independent copied chat | 4 |
| Reload unchanged parent | 0 |
| Earlier-point native fork | 0 |

The earlier fork retained two old documents after removing future and now-recent
source chunks from its branch. Its parent and sibling retained four documents
each. This demonstrates saved embedding submissions for the inherited prefix,
not a billed-cost estimate or universal latency gain. The isolated API gate took
94.442 seconds for collection/branch setup, first upsert and commit observation;
the subsequent branch-create request took 65.854 ms. These single observations
are not an embedding-provider latency attribution or performance benchmark.

The first host attempt failed because a global progress update replaced the
sync operation's status ownership: the remote fork succeeded, but the expected
completion message never appeared. Its owned data was cleaned up. Progress now
uses the operation's update callback, with a regression test; the second complete
host run passed. Both attempts and their exact measured sources are retained.
The final live run had zero proxy requests/browser errors and no persisted key.
It exercised the real prompt interceptor with a synthetic completion event;
**no generation model or new answer-quality benchmark was run**.

The measured live runtime was followed only by a preparation-status wording
correction, version metadata and documentation. Exact pre-edit producer files
were recovered and verified against every report hash. A second 29-check host/emulator run and all 284 unit tests passed on the final
candidate after those edits; this distinction prevents claiming a new release deployment
or a paid run at an unmeasured revision.

## Reproduction

Use only a dedicated test project/CORS origin and synthetic conversations. Existing
`LAMBDADB_BASE_URL`, `LAMBDADB_PROJECT_NAME` and `LAMBDADB_PROJECT_API_KEY` are read from
`SM_ENV_FILE`; never copy credentials into a worktree.

```sh
npm test
npm run check
npm run check:release
SM_ENV_FILE=/absolute/path/to/.env.local node scripts/versioning-live.mjs
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=versioned-unique \
  node scripts/chat-collections-live.mjs --versioned
```

Each live entry point incurs managed embedding/service usage. Stop after a failed
cleanup, reconnect and resolve the recorded pending resource before another run.
Raw logs/reports and exact producer sources remain ignored evidence, not CI
fixtures. The maintained tests use small synthetic data and make no paid calls.

## Retained evidence

The local-only archive is
`/Users/steven/Dev/sillymemory-versioned-memory/artifacts/archive/versioned-memory-v1/evidence.tar.gz`
(SHA-256 `4cd1fcca68926a7cbb555cfc365c0bae4c6708888142b74e3b0deb4f420e6602`).
It is not downloadable from a fresh clone. It contains the successful API and
host reports, the first failed host attempt, both emulator reports, logs, the
candidate source/patch against `6e0a690f10ed2ab923e1f1268fd1ad79849de9d6`,
and SHA-verified historical producer overlays. `ARCHIVE-MANIFEST.json` records
each member's checksum; all 335 archive members were read back byte-for-byte.
Only the archive reference and final documentation follow this source snapshot.
Keep this bundle when detaching/removing the worktree; no previous evidence was
deleted. No credentials or personal conversations are archive inputs.


## Review follow-up — identity persistence

PR #53's identity-save review exposed a failed/ambiguous-save recovery gap.
Verification caching now includes all extension metadata and is invalidated before
conversion writes. An already-versioned opt-in retries disk verification instead
of returning early. Identity persistence compares the complete metadata, so an
unchanged ID with a new story/version is saved and verified before remote use.

All 285 unit tests passed, including rejected saves, silently unpersisted saves,
and accepted writes with a lost response. The pinned host/Chromium emulator run
passed 31 checks: forcing the host save endpoint to return 503 blocked all remote
requests on re-enable; retry then persisted the full identity before showing
ready. Cleanup left zero emulator collections. Syntax and release checks passed.
No live LambdaDB/generation calls were repeated for this host persistence fix;
the earlier live evidence applies to the branch lifecycle, with this source
boundary stated explicitly.

The follow-up report, exact measured sources, tests, logs and patch against
`c9c2b45ac3e52c9824865f6d023bbeeeaab8eba3` are retained locally at
`/Users/steven/Dev/sillymemory-versioned-memory/artifacts/archive/versioned-memory-review/evidence.tar.gz`
(SHA-256 `82eb2e86a59782988b64e70fe7b86894771b52c11c6353984e54ef3a346d6a12`).
All 21 members were verified byte-for-byte against the archive; availability is
local-only. The original live evidence bundle remains unchanged. Only this
completion note follows the measured source snapshot.
