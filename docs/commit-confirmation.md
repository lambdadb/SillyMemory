# Ordered commit confirmation

## Product decision and boundary

Use the maintainer-confirmed guarantee that writes on a LambdaDB branch become
committed in write order, including documents in submitted upsert batches. Avoid
repeated inherited-document reads when this client knows the actual last write.
Assume LambdaDB snapshot/version/expiry correctness; expiry experiments are not a
release gate for this change. No LambdaDB, embedding provider, data schema or
stored-document format changes are required.

One active writer is required. This optimization does not add multi-device writer
coordination or support out-of-band branch mutations. It stores only ephemeral
state on a client instance, not in localStorage, native metadata or the journal.
Reconnect creates a new client with no ordering knowledge. A transcript index or
persisted ID journal never establishes remote write order.

## Algorithm

1. Reconcile first use/reload with the existing full committed list and consistent
   fetches. Compute actual deletes and upserts from the current transcript.
2. Fast confirmation requires ordering history that starts at a branch successfully
   created by this client. Before any mutation, invalidate its previous confirmation
   and record every planned upsert ID, even if a request is later canceled. Identify
   the last document in the last planned upsert batch, even if it belongs to an
   early message. Reject it if that ID was submitted since the last confirmed
   commit: an earlier pending copy could become visible before this final write.
   Otherwise compare it with committed data before sending writes: use the
   reconciliation list if available, otherwise fetch that one ID with false.
3. If its expected value already appears in old committed data, do not use it as
   proof of this write. This matters when pending deletion/update/reinsert returns
   to an earlier identical value. Keep the full fallback instead.
4. After all ordered writes succeed and the operation is still current, remember
   the final document's expected fields. Before a fork, fetch only that ID with
   `consistentRead: false` and compare every expected field, including revision.
   Absence or a stale revision is not success. A canceled/superseded wait cannot
   publish a commit confirmation. Clear submitted-ID history only on confirmation.
5. Reuse the confirmation within this client until the next mutation. Successful
   new branch creation also establishes committed state for that new branch.
   A conflict or lost branch-create response does not establish this shortcut.
6. A pending checkpoint still compares its **entire** committed document set
   against its saved transcript before writing its ready marker. The small commit
   check changes polling, not the readiness criterion. Deletes without a later
   upsert, uncertain responses and fresh clients retain full polling/reconciliation.
   A new edit after reload cannot establish missing write history on that branch;
   the client may not know about an earlier pending write with the same value.

A before-write single-ID fetch can add one read to an ordinary edited sync. The
initial sync on a new branch reuses the committed list it already reads. The saving comes
from avoiding full source scans before forks and paginated checkpoint lists on
repeated polling attempts. It does not reduce server commit delay, the mandatory
full reload check, embedding submissions, or generation tokens.

## Bounded validation

Use the existing checkpoint-manager runner (at most four small synthetic
collections) and one existing 1,000-message large-history run (at most two
collections and 1,100 submitted documents). No generation calls, personal chats,
retention changes or long-lived test resources. Verify cleanup before retries.
Compare request counts and fetched-ID counts; a single-run elapsed time is not a
latency guarantee. Preserve the PR #56 baseline and exact producers.

## Failure handled during validation

The first live manager run reached the edit-during-preparation case and timed out
waiting for the original checkpoint cancellation message. The new barrier had
already rejected the operation with its generic commit-cancellation message.
A unit regression reproduced the mismatch. Checkpoint completion now rechecks
cancellation immediately after synchronization, preserving its existing recovery
message and avoiding unnecessary subsequent work. The first run's three owned
collections were cleaned up before the corrected candidate was run. Preserve that
failed report and its exact pre-fix checkpoint source; it is not a provider failure.

## Results (2026-10-04)

Actual SillyTavern 1.19.0 (`06bde939fb1e9c4c8d8641d810f0a916b5bce127`)
with Chromium and live LambdaDB managed embeddings passed the corrected manager
run's 40 checks and the large-history run's 6 checks. All owned collections were
removed, no uncaught page errors occurred, and measured source files stayed
unchanged during each run. No generation model was called.

Compare the large run with the retained [PR #56 baseline](checkpoints.md):

| Phase | Remote responses, baseline → candidate | Elapsed ms, baseline → candidate | Candidate upsert documents |
| --- | --- | --- | --- |
| Initial sync | 38 → 38 | 10,860 → 10,647 | 998 |
| Checkpoint 1 | 115 → 76 | 65,299 → 46,855 | 0 |
| Checkpoint 2 | 58 → 38 | 4,933 → 7,477 | 0 |
| Checkpoint 3 | 58 → 38 | 4,817 → 7,820 | 0 |
| List | 2 → 2 | 166 → 163 | 0 |
| Resume and sync | 49 → 29 | 4,336 → 5,836 | 0 |
| Reload sync | 23 → 23 | 2,255 → 5,822 | 0 |

Repeated checkpoint operations used 34% fewer remote responses; resume used 41%
fewer. Committed-state probes in the candidate requested one ID per call. Initial
indexing remained 998 documents (plus one separate transport-fixture document).
The final full checkpoint comparison and reload reconciliation remain. Timings
were **not consistently faster**: these are two single runs, not a latency or
answer-quality improvement claim. Commit delay and network/service variability
still affect elapsed time.

After these paid runs, final review found another ambiguity: A → B → A can leave
an earlier A pending even when the pre-write committed read is empty. The final
runtime additionally tracks submitted IDs and requires client-known branch history
as described above. The paid results belong to the preserved **pre-hardening**
producer; they do not establish live verification of the final guards. The final
runtime passed all 308 unit tests and 37 actual-host browser checks against a local
HTTPS LambdaDB emulator, with no remaining emulator collections or page errors.
Meaningful regressions cover repeated pending values, old committed values,
reconnect followed by edits, stale revisions, cancellation, uncertain write
acknowledgements, deletion-only fallback, and full final checkpoint validation.
Both new ambiguity regressions fail against the preserved pre-hardening producer
and pass against the final runtime. The existing 150-document test still verifies
one-ID confirmation across three
upsert batches. Syntax and release metadata checks passed.

The decision is to keep the bounded read optimization with conservative fallback.
No expiry wait, platform retention validation, multi-device writer guarantee,
answer-quality claim, or public release is part of this change.

## Retained evidence

Base revision: `e48229d2c9c9640c087bb99e528a3a87879a9a17`. The dirty-tree
source snapshot, tracked patch, live reports, exact producer overlays, original
failed manager report, baseline report, unit/reproduction logs and browser results
are retained in the local-only archive:

- Worktree: `/Users/steven/Dev/sillymemory-commit-barrier`
- Relative path: `artifacts/archive/commit-confirmation-v1/evidence.tar.gz`
- SHA-256: `83b094cba6d885e31a4634c5c802706b34928f608206b15bdcd146cea766ca26`

All 329 manifest entries were read back byte-for-byte, all six runtime reports'
source hashes matched retained producers, and the bundle passed a configured-secret
scan. Extract only into an empty directory and follow its `README.md`; never copy
historical producer overlays over active work. The archive is not available in a
fresh clone or published download. Its source snapshot precedes only this evidence
pointer and the evidence-index entry. Existing historical archives remain intact.
