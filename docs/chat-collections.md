# Chat collection lifecycle

## Decision and scope

Give each character chat and native branch its own owned LambdaDB collection.
The acceptance boundary is identity persistence, isolation, reconciliation,
independent deletion and safe recovery through the pinned SillyTavern host. This
changes lifecycle management, not answer quality. Chunking remains 800 Unicode
code points without overlap; the default memory budget remains 800 tokens.
Managed embeddings, ordinary upsert, `knn.queryText`, `consistentRead: true`,
the built-in proxy and session-only API keys remain unchanged.

## Identity and storage

The extension saves `chat_metadata.sillymemory = { id, integrity }` in the native
chat header. The random 32-hex ID is bound to native `integrity`. Before accepting
it on chat activation, the extension reads the character's chat inventory. A
changed native integrity or another file carrying the ID causes a fresh ID.
A native branch changes integrity but can inherit other metadata: relying on
extension metadata alone would reuse the parent. Copied/imported files can copy
both, so the inventory check is necessary. A rename changes only the filename
and keeps the ID. An exported file imported after its original is gone can retain
its identity; this is restoration, not a promise of always-new import identity.

The extension invokes native `saveChat` and verifies the saved header before
remote creation. A swallowed host save error blocks synchronization, and retry
resaves the same pending ID. A context change cancels activation. Individual
remote deletion also validates identity, including an unactivated duplicate,
before selecting its target. Chat messages remain the source of truth.

Scope is SHA-256 of `[owner, character avatar, chat ID]`. The collection name is
`smchat_` plus the first 40 hex characters. Its tags include the full scope,
`application=sillymemory` and the installation owner. Every write verifies those
tags; query filtering and validation against local source remain in place.
Each branch starts with ordinary upserts of its current inherited messages; there
is no LambdaDB snapshot/fork integration or shared prefix storage in this change.

The client persists collection intent before requesting creation. An uncertain
create response is retried at the same name, and an existing name is adopted only
after ownership/scope verification. Separate engines/journals preserve per-chat
write ordering. Deleted/edited/swiped source is reconciled before retrieval.

## Deletion and recovery

- Current-chat deletion disables memory, waits for pending creation and writes,
  validates the selected chat and ownership, deletes that collection, and confirms
  API 404. Other chats remain. Re-enabling recreates memory from local history.
- All-owned deletion also lists tagged collections with opaque-token pagination.
  It restricts deletion to known memory naming patterns and the current owner.
  It includes previous shared collections; it does not silently delete them on
  upgrade. Test collections remain under the separate transport cleanup control.
- Native chat deletion is not a remote deletion command. Its event identifies
  only a filename and can refer to another character. Use current-chat deletion
  before removing the native chat, or all-owned deletion afterward.
- Failed or uncertain deletion retains its local cleanup record. A confirmed
  collection deletion removes that collection's journal. API absence does not
  establish physical erasure from backups.
- Reload clears the key and starts disabled. Persistent account owner and chat
  metadata allow reconnecting the same collection. Browser registry loss is
  recoverable through tags; loss of account ownership requires manual recovery.
- The local document journal is still needed to enumerate obsolete IDs after
  edits. Losing it can leave stale remote records; current-source validation
  prevents their injection, but recreating/deleting the collection is necessary
  for guaranteed full cleanup. Concurrent cross-device writers and changes to
  character avatar identity are not continuity guarantees.

## Validation

See the final run record below. Unit/emulator checks are separate from live
LambdaDB checks. The live acceptance invokes no generation model and does not
measure final model quality, ANN ranking quality, latency at scale or provider
outage behavior. Its interceptor check uses a synthetic final prompt event;
full host prompt dispatch remains covered by the existing delivery harness.

The maintained live command is `npm run test:collections:live` with `ST_SOURCE`
pointing to pinned SillyTavern `06bde939fb1e9c4c8d8641d810f0a916b5bce127` and
`SM_ENV_FILE` pointing to credentials outside Git. At most four collections (one
transport, three chat memories), tiny English synthetic history and no direct
embedding-provider credentials are used. Failed runs retain non-secret pending
ownership records until cleanup is verified.

Historical evaluation results continue to refer to their original runtimes.
`recorded-source.mjs` resolves pre-change producers from immutable Git revision
`8e38ea73527682375fdd4fe594f760d2534c9a76` and verifies their recorded hashes;
CI already fetches full history. No new historical runtime copies are added.
Older paid experiment plans retain their own limits; regenerate/review plans for
this collection layout before using them for new quality claims.

### Completed acceptance — 2026-10-02

| Boundary | Result |
| --- | --- |
| Unit regression suite | 318 passed; identity persistence/rotation, ambiguous create, ownership, pagination and scope mismatch covered. |
| Syntax and release metadata | Passed; candidate remains 0.2.0 Unreleased. |
| Actual pinned host + Chromium + proxy, local LambdaDB emulator | 28 checks passed; native branch/copy, delete-before-activation, lost create response, failed deletion/retry, stale hits and request races. |
| Actual host recovery, local LambdaDB emulator | 188 checks passed; two SIGKILL/restarts, 24 parent/branch mutation cycles, reloads, no duplicate unchanged upserts and drained cleanup. |
| Actual host prompt dispatch, local completion/LambdaDB fixtures | 11 delivery cases plus repeated-passage packing passed, including truncation stop/warning, streaming, swipe and continuation. No live generation model. |
| Actual host settings + real LambdaDB managed embeddings | 13 checks passed; four initial parent docs, native rename, branch divergence, copied metadata, queryText recall, individual deletion, reload, remote discovery after registry loss and complete owned cleanup. No generation model calls. |

Final browser/emulator reports contain no page errors or remaining collections.
The live report confirms cleanup, an unchanged producer map and no pending
resource record. Final reports were checked against the current file hashes.
This is bounded lifecycle evidence, not a new retrieval-quality benchmark.

Two early live attempts stopped at copied-chat verification. The first fixture
incorrectly passed `chatName` to the context wrapper; the corrected fixture calls
the exported native `saveChat`. The second retained only a generic `Error` at
that stage, insufficient to attribute a service or runtime cause. Cleanup was
confirmed for both. Subsequent complete runs passed, and final acceptance added
divergent branch facts and verified absence before emergency cleanup. The new
harness retains a redacted error message to improve future diagnosis; successful
reruns do not prove that providers cannot fail.

Detailed reports, earlier attempts and the changed producer files are retained
in the **local-only** ignored archive
`artifacts/archive/chat-collections-v1/evidence.tar.gz` (39 files, 121,699 bytes,
SHA-256 `c0fa32a12d838bade89daa897a99143464a42600510b0a4e1732ca60467d995c`).
It is available in the author's `sillymemory-chat-collections` worktree and is
not downloadable from a fresh clone. The archive's producer overlay applies to
base `8e38ea73527682375fdd4fe594f760d2534c9a76`; unchanged dependencies remain in
that revision. Final reports are `browser-smoke.json`, `recovery-smoke.json`,
`chat-collections-live.json` and `chat-collections-delivery-accepted.json` under
its `artifacts/` directory. Archive entries were byte-verified after creation.
