# Frozen story checkpoints

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

Use the unreleased 0.3.0 candidate with the validated SillyTavern 1.19.0 host.
Connect, prepare memory and opt the selected story into versioned memory first.

1. Click **Save / finish checkpoint** on a normal versioned chat. The extension
   disables memory and drains previous writes, saves a separate native chat with
   a unique `SillyMemory checkpoint ...` name, then prepares its memory branch.
   The original chat stays selected. Re-enable memory to continue that original
   path after saving, or select the saved checkpoint in the native chat list.
2. A checkpoint is ready only after its intended older documents are committed
   and the matching snapshot ID is saved and read back from the host. Creation
   can take minutes while waiting for commits. No generation model is called.
3. Select that checkpoint in the native chat list and click **Resume checkpoint
   in new chat**. It checks the persisted transcript digest and remote branch
   snapshot, saves a separate `SillyMemory resume ...` chat, verifies it and opens
   it. Enable memory to inherit from the frozen branch and continue. Repeating
   this creates another independent path.
4. If creation stops partway, reconnect, select the saved checkpoint and click
   **Save / finish checkpoint**. Its pending record contains the original memory
   settings and source identity, so it can finish the same branch. If the local
   save never succeeded, no checkpoint remote data was created; save again from
   the original path. An ambiguous resume keeps its generated target identity in browser storage.
   Reconnect and retry from the same checkpoint to verify/open that saved path
   without another write. Successful opening clears the intent, so a later
   deliberate resume creates a new path.

API keys remain session-only. The checkpoint's transcript stays on the existing
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

## Results — 2026-10-03

Pinned host: SillyTavern 1.19.0,
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. LambdaDB used managed embeddings and
browser direct CORS with the host proxy disabled; no embedding-provider key or
generation-model call was introduced.

- **290 unit tests passed**, including checkpoint pending-write recovery, complete
  transcript/swipe restoration, snapshot/transcript mutation rejection, canceled
  resume, unconfirmed local writes and checkpoints with no older documents.
- **31 pinned-host/Chromium + local HTTPS emulator checks passed** on the final
  runtime, preserving the ordinary lifecycle, failure and version-opt-in gates.
  These emulate LambdaDB and do not establish live embedding behavior.
- **26 pinned-host/Chromium + live LambdaDB checks passed**, combining the original
  versioned lifecycle and new checkpoint cases. Three synthetic collections were
  created in the full run and all were confirmed removed. No proxy request or
  browser page error occurred, and the key was absent from persistent settings.

| Live operation | Submitted documents |
| --- | ---: |
| Transport gate / initial parent / independent copied chat | 1 / 4 / 4 |
| Ordinary native fork / earlier native fork / unchanged reload | 0 / 0 / 0 |
| Checkpoint creation / first resume / second resume | 0 / 0 / 0 |
| Ordinary branch edit / original-path edit after checkpoint / resumed-path edit | 1 / 1 / 1 |

The two resumed paths used distinct identities in the same story collection.
Later original-path and resumed-path edits left the frozen checkpoint unchanged.
Resume restored the old selected text, unselected swipe and swipe metadata, and
chat variables. Opening the checkpoint refused ordinary memory synchronization;
altering a saved hidden swipe then caused explicit resume to fail before opening
another path. The live run verifies these persistence/isolation behaviors, not
new answer-quality scores, months-long retention or large-history latency.

The first paid attempt stopped at checkpoint preparation because its cancellation
check treated changes in the host's live transcript/metadata object as switching
chats. The checkpoint branch had been created, but its local record remained
pending. All test remote resources were removed before retry. The fix preserves
the captured transcript independently, checks the selected chat/character before
writes, and saves the exact payload through the host's existing authenticated
chat endpoint rather than merging current live metadata with the checkpoint.
The second complete paid run passed on the unchanged measured runtime. The
failed report and exact producer sources are preserved alongside the successful
run; they are not represented as successful integration evidence.

No main promotion, release, or deployment is included. This extends the existing
unreleased 0.3.0 candidate and needs normal PR review before adoption.

## Retained evidence

Local-only archive:
`/Users/steven/Dev/sillymemory-checkpoints/artifacts/archive/checkpoints-v1/evidence.tar.gz`
(SHA-256 `7939c2c1937b024cf26aea22bbd7404830e4f50479bb05152fc96f7c9f5e0c7e`).
It is unavailable in a fresh clone. The bundle contains both paid attempts, both
emulator reports, unit/setup logs, frozen candidate files/patch against
`b0681202c91efcfce330a62c61bf68583f6720d6` and exact historical producer overlays verified
against each report's hashes. All 361 members were read back byte-for-byte;
`ARCHIVE-MANIFEST.json` records their checksums. Only this archive reference follows
the measured candidate. No previous evidence or pending ownership record was
removed while remote resources remained. Retain the bundle before removing this
worktree. PR #53's original evidence stays in its detached versioned-memory
worktree; its merged local/remote topic branches were removed after tree equality
with `origin/develop` was confirmed.

## Recovery hardening scope

Before release preparation, address two product failures in one bounded change:
prevent pending finalization from overwriting edits made while remote work runs,
and reuse a durable resume identity after an ambiguous save/read or reload.
Completion requires reproducing the overwrite on the previous implementation,
regressions on the fix, actual pinned-host checks for accepted branch response
loss, rejected ready saves, reload/key re-entry, edits during preparation and
resume save/read response loss, followed by verified owned cleanup. Extend the
existing runner, using the same four-collection/twenty-message ceiling and no
new generation calls. Faults are deliberately injected; they do not establish
actual provider outage behavior. Checkpoint management UI, names/status lists and
large-history efficiency remain separate unfinished work; this is not a release
readiness claim.

### Recovery hardening results — 2026-10-03

The overwrite regression failed on the previous `68fc676` implementation: a
pending file edited during remote preparation was finalized successfully instead
of rejecting the changed file. The fix passes that regression and preserves the
edited body and pending state. The original failing output is retained.

- **293 unit tests passed.** They cover saved edits without a host event, native
  save/read response loss, accepted saves verified despite a lost acknowledgement,
  reuse of an unchanged resume target and preservation of an edited target before
  a subsequent explicit attempt creates another path.
- **31 actual-host/Chromium + local HTTPS emulator checks passed** on the final
  runtime, with zero remaining emulator collections.
- **34 actual-host/Chromium + live managed-memory checks passed**, including
  deliberately discarded successful branch responses, rejected readiness saves,
  three key-clearing reloads, pending completion under the same identity, an edit
  while a remote document read is held, and lost native resume save/read responses
  followed by reload/retry. The retry opened the same saved resume filename;
  the native resume-file count did not grow. All three test collections were
  confirmed absent, with zero browser page errors or host proxy requests.
- Checkpoint preparation/recovery and both unchanged resumes submitted **zero
  inherited document upserts**. Actual content edits still submitted one changed
  document each. These counts establish recovery behavior for the synthetic
  fixture, not a new answer-quality or large-history performance result.

The first recovery run stopped because the harness attempted to open a chat
after reload before selecting its character. Its in-page cleanup also lacked a
reconnected key. The original report therefore retains `cleanup: false`; the
separate `cleanup-recovery.json` receipt confirms ownership-checked deletion of
all three recorded resources before any rerun. The harness now selects the
character during reload and reconnects before cleanup. The second full run passed
with `cleanup: true` and unchanged measured sources. This harness failure is
preserved and is not presented as a successful product run.

Run the bounded recovery scenarios with the same environment as above:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=checkpoint-recovery-unique \
  node scripts/chat-collections-live.mjs --checkpoint-recovery
```

The tests inject faults around actual requests; they do not reproduce an observed
LambdaDB outage. No generation model was called. Checkpoint naming/management UI
and large-history efficiency are still unfinished; release readiness has not been
established by this change.

Recovery evidence is local-only at
`/Users/steven/Dev/sillymemory-checkpoint-recovery/artifacts/archive/checkpoint-recovery-v1/evidence.tar.gz`
(SHA-256 `efab4d15b1ed72254782b0fdea05ecced313b3fd61aaad08d8f04cb3948bc02b`).
The bundle retains the failing reproduction, original implementation, both live
attempts, the first attempt's separate cleanup receipt and ownership record, both
emulator runs, unit/setup logs and exact producer overlays. The candidate patch
is based on `68fc6760f1fe0eecbc616964098f075fb1f52bd7`. All 366 archive
members were read back byte-for-byte and indexed in `ARCHIVE-MANIFEST.json`.
Only this evidence pointer follows the measured candidate. The bundle is not
available in a fresh clone; keep it before removing this worktree. Earlier
checkpoint/versioning evidence was not modified or deleted.
