# Frozen memory snapshots (advanced)

For ordinary use, keep SillyTavern's native **Save checkpoint**, **Create Branch**,
**Back to parent chat** and **Manage chat files** workflow. SillyMemory follows
the selected saved transcript, prepares a separate writable memory path, and
preserves the enabled preference across chat changes. Native checkpoint saving
does not freeze remote memory; it remains reconstructible from the saved transcript.
Use **Chat history** in the Memory panel to open the native chat list.

The optional **Advanced → Frozen memory snapshots** controls below additionally
bind a saved transcript to a verified, retained remote memory branch. The internal
metadata and historical acceptance records call these snapshots checkpoints.

A snapshot consists of the full native JSONL transcript plus a frozen LambdaDB
branch containing the older-history memory partition. Saving uses the same
recent-message boundary as ordinary synchronization: recent messages remain in
the JSONL and are not uploaded just for the snapshot. Missing or changed older
passages are still reconciled before readiness. Resumed writable paths archive
recent messages normally as later dialogue displaces them from the window.

## Decision and bounded acceptance

Bind a saved native SillyTavern transcript (including hidden swipes and chat
metadata) to a retained, unchanged LambdaDB branch. Resume into a new native chat
and writable memory branch; never overwrite the source or frozen checkpoint.
Use the existing versioned-story layout and session key. No server plugin, Tag
fork, Alias, provider change or automatic checkpoint schedule is introduced.

Acceptance: unchanged checkpoint creation/resume submits zero inherited document
upserts; two resumes remain isolated; later source edits do not change the saved
transcript/memory; failed saves remain pending and recoverable; modified or missing
checkpoint state is rejected; owned cleanup completes. Reuse the existing pinned
host lifecycle runner with at most four synthetic collections, twenty short
English messages per chat and no generation-model calls. Stop after a failed
cleanup before retrying. This measures persistence/isolation, not answer quality
or large-history performance. Preserve complete failed/successful run evidence.

## Use

Use the validated SillyTavern 1.19.0 host.
Connect, prepare memory and select a character chat. Story branches are automatic;
checkpoint creation also persists a fresh chat identity before remote use.

1. Open **Advanced → Frozen memory snapshots** and click **Save memory snapshot**
   on a normal story path. The extension pauses memory operations and drains previous writes,
   saves a separate native chat with
   a unique `SillyMemory checkpoint ...` name, then prepares its memory branch.
   The original chat stays selected and your enabled preference is preserved.
   After success, enabled memory synchronizes automatically on that original path;
   an explicitly disabled preference stays off. Alternatively, resume the saved snapshot below.
   Newly saved snapshots link to their actual source through the native
   **Back to parent chat** action, including when saved from an existing branch.
   Older snapshots remain accessible through **Chat history**.
2. A checkpoint is ready only after its intended older documents are committed
   and the matching snapshot ID is saved and read back from the host. A
   [last-write commit check](commit-confirmation.md) can shorten polling; the final
   complete document comparison remains required. Creation
   can take minutes while waiting for commits. No generation model is called.
3. Click **Resume** on that checkpoint in the current-story list. Alternatively,
   select it in the native chat list and click **Resume snapshot in new chat**.
   It checks the persisted transcript digest and remote branch
   snapshot, saves a separate `SillyMemory resume ...` chat, verifies it and opens
   it. The resumed chat inherits the snapshot’s saved on/off preference. When on,
   memory automatically inherits from the frozen branch and synchronizes; an off
   snapshot resumes with memory off. Each resumed chat can change independently. Repeating
   this creates another independent path.
4. If creation stops partway, reconnect, refresh the current-story list and click
   **Finish / retry** on the pending checkpoint. Its pending record contains the original memory
   settings and source identity, so it can finish the same branch. If the local
   save never succeeded, no checkpoint remote data was created; save again from
   the original path. An ambiguous resume keeps its generated target identity in browser storage.
   Reconnect and retry from the same checkpoint to verify/open that saved path
   without another write. Successful opening clears the intent, so a later
   deliberate resume creates a new path.

API keys use the account-bound [saved browser connection](saved-connection.md). The checkpoint's transcript stays on the existing
SillyTavern server as a normal JSONL chat; it is not put in browser storage or in a
new service. Only normal older memory chunks go to LambdaDB. Back up native host
data: a remote branch alone cannot reconstruct the complete transcript/swipes.

## Integrity, isolation and deletion

A checkpoint is a retained LambdaDB Branch, not a historical timestamp or a Tag.
The extension never synchronizes or writes a ready checkpoint branch during
ordinary use. Resume creates a new chat identity whose source is that checkpoint;
its first memory sync forks the retained branch through the existing versioning
workflow. Retention of old snapshots is not the basis for later resume. This
relies on the branch continuing to exist and remaining unchanged, not on a tested
months-long deployment.

The local checksum binds saved messages (including unselected swipes and their
metadata) and chat metadata such as variables. The header's display labels and
the checkpoint's progress record are excluded. Opening a checkpoint is allowed;
ordinary memory enabling is refused. SillyTavern itself can still edit or generate
into that native file. Editing saved content invalidates explicit resume, rather
than silently turning the changed file into the original checkpoint. Native host
branching remains an ordinary branch operation; only the explicit resume control
performs checkpoint integrity verification.

Before writing readiness, the extension rereads the pending file and rejects
changes to its transcript or metadata. Chat/message events invalidate active
preparation. The final reread/save/verification uses the pinned host's blocking
loader and refuses active generation; host requests have a 15-second timeout.
The remote commit wait itself does not block the whole host UI.

Local-file and remote-branch updates are not a distributed transaction. Durable
pending state is saved before creating remote resources; readiness requires
verified local persistence and committed matching documents. Interrupted pending
branches can be reconciled again. Ready branches with missing/changed snapshot IDs
are refused. Simultaneous writers or manual remote mutations are unsupported;
snapshot checks do not provide a lock against concurrent out-of-band writes.
The native save endpoint has no revision-based compare-and-swap. The short UI
lock protects this browser's normal editing controls, not another device or
extension writing directly to the server.

Resume intents contain only generated IDs under an owner/avatar/checkpoint-derived
hash; no transcript or API key is stored there. They survive reload in the same
browser, but browser-storage loss or another device cannot recover that intent.
An existing target is never overwritten on retry. If it was edited, the operation
reports that it was preserved and clears the completed target's intent. Open that
chat to continue it, or explicitly retry to create another path. This differs
from automatic retry of an unchanged target, which reuses the same path.

**Delete this chat's remote memory** on a selected checkpoint removes its frozen
branch, making that checkpoint unavailable for resume. Existing resumed paths
remain independent. **Delete all owned remote memory** removes checkpoints and
paths together with the whole story collection. Both keep native local chat files.
Deleting a native chat or uninstalling the extension does not remove its remote
branch; use the deletion controls before removing local data. Provider backup and
physical erasure policies remain separate.

The checkpoint does not freeze the character card definition, global extension
settings, World Info files, external game state or generation-provider behavior.
Resume uses current global memory settings, so changing recent-message/chunking
settings can require reconciliation and new embeddings. The saved config is used
only to finish pending checkpoint creation. It is a transcript/memory checkpoint,
not a whole-server backup or a deterministic regeneration promise.

## Reproduce

```sh
npm test
npm run check
npm run check:release
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=checkpoint-unique \
  node scripts/chat-collections-live.mjs --checkpoints
```

The last command performs bounded paid managed-memory calls using synthetic data.
The original versioned lifecycle tests run before the checkpoint cases, followed
by owned-data cleanup. Use unique artifact tags and resolve retained pending
cleanup records before retries. Detailed reports and producer source stay ignored;
concise results and explicit evidence availability belong in this document.

## Checkpoint manager

Open **Advanced → Frozen memory snapshots** in the SillyMemory settings. Give a snapshot an optional
name (up to 120 characters) before saving. The list refreshes automatically when
opened, on reconnection, and when changing chats while the panel is visible.
**Refresh memory snapshots** also checks snapshots belonging to the selected
character and versioned story. Each row shows the name, creation time and verified
status. Names live in the checkpoint's presentation metadata, so renaming does not
change its identity, transcript hash, native filename or memory branch.

- **Ready**: the saved transcript and remote snapshot agree. **Resume** opens a
  new path without selecting the checkpoint in the native chat list first.
- **Pending**: **Finish / retry** completes the original snapshot and settings.
- **Transcript modified** or **Remote memory changed**: resume is unavailable.
- **Remote memory missing**: the branch or collection is absent. It cannot be
  silently recreated as the original ready checkpoint.
- **Remote state unverified**: reconnect and refresh. Authentication/network
  failures are not reported as missing data.
- **Duplicate identity**: actions are blocked until the native copies are resolved.

Matching automatic reads share an in-flight request. Manual refresh and successful
management actions force a fresh read. Hidden settings do not trigger automatic
listing. Changing chats clears old rows, and late results for an old chat, story
or client are discarded. Automatic failures stay in the list without taking over
chat progress or blocking controls. Actions check story identity and saved state
again. Listing checks each candidate transcript and shares one ownership check/branch
listing across the story. It never synchronizes chats, queries embeddings, writes
remote documents or generates answers.

From another path in the same story, **Rename** changes a checkpoint's display
name through a native SillyTavern input popup. **Delete checkpoint**, after native
confirmation, deletes only that native checkpoint file and its remote branch. Remote absence is verified first. If local
deletion subsequently fails, the retained row shows missing memory and deletion
can be retried. Other source/resumed chat files and existing memory branches are
preserved. A resumed path that has never synchronized must rebuild from its own
transcript if its source checkpoint was deleted. The currently open checkpoint
cannot be renamed or deleted through this list; open another story path first.
Canceling or escaping a popup leaves data unchanged. Every asynchronous popup
revalidates its captured chat target before renaming or deleting anything.

This differs from **Delete this chat's remote memory**, which keeps its native
file, and all-owned cleanup, which removes all owned remote story collections but
keeps every native chat. Native deletion is irreversible; no full-story local
file deletion is provided.


## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/checkpoints.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
