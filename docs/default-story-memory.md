# Default story memory

## Product decision

There are no installed users or existing user conversations to migrate. The
0.4.0 development candidate therefore has one storage contract: an owned
collection per story, with an isolated writable branch per chat path. Remove
pre-release compatibility rather than retaining two implementations. The version
is Unreleased; this change does not promote main or publish a release.

Enable memory on a normal character chat after connecting and preparing memory.
The extension saves and verifies `{ version, id, story, integrity }` in native
chat metadata before remote access. Verified native forks preserve the story and
receive a new branch identity. Independent copies start another story. A rename
preserves identity. Checkpoints remain explicitly saved and resumed; default
branch storage does not create automatic transcript checkpoints.

Removed: the versioned-mode button/confirmation and conversion handler, filename
identity fallback, per-chat `smchat_*` creation, old shared-collection settings and
cleanup paths, conditional branch reconciliation, and the historical upgrade
adapter. Unsupported metadata fails safely; no conversion/reset is performed.
Only `smstory_*` memory families are discovered by all-owned cleanup. The separate
`smtest_*` transport test still uses its own explicit cleanup record.

Retained: complete metadata persistence, ownership checks, copy/fork isolation,
ordered commit confirmation, current-source validation, branch-specific journals,
uncertain-write recovery, session-only keys and direct browser CORS. Generic
LambdaDB client calls can still address `main` for transport tests and empty fork
sources; this is not a second product storage mode. Checkpoints still validate
both transcripts and remote state before resume.

## Bounded validation

Question: does a fresh ordinary chat use branch storage without opt-in while
preserving isolation, recovery, token budgets and deletion behavior? Completion
requires the unit suite, real-host emulator lifecycle/recovery, and one small
actual-host managed-memory/checkpoint run with confirmed cleanup. No answer-quality
experiment or generation-model call is required for this storage cleanup.

Pinned host: SillyTavern 1.19.0,
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Both browser paths use direct CORS with
the host proxy disabled. Local emulator failures are not LambdaDB outages.

| Boundary | Result |
| --- | --- |
| Unit regressions | 309 passed. Includes default identity persistence, rejected/ambiguous saves, unsupported metadata, branch isolation, reconciliation, token bounds and stale-result rejection. |
| Syntax and release metadata | Passed; package, lockfile and manifest agree on 0.4.0 Unreleased. |
| Real pinned host + Chromium + local HTTPS emulator | 37 checks passed; zero remaining collections. First identity save failure prevents all remote access; retry persists the default story identity. |
| Same host + emulator, faults and recovery | 189 checks passed; zero remaining collections and no uncaught page errors. Includes 429/503, actual timeout, partial batches, races, reload/restart and repeated edit/swipe/delete cycles. |
| Real pinned host + Chromium + LambdaDB managed embeddings | 41 checks passed; all owned collections deleted, source hashes unchanged during the run. Includes native branches/copies, earlier forks, checkpoint manager, lost response/reload recovery, queryText interceptor and scoped/discovery cleanup. |
| Fresh Git URL installation | 14 checks passed through the actual Git URL UI at candidate `0d13811`; correct branch/version, key clearing and saved preferences verified. No provider calls; disposable profile removed. |

The managed run submitted 12 documents in total, including the transport test.
Unchanged inherited native branches, checkpoint save/resume and parent reload
submitted no inherited documents. This verifies avoided embedding submissions,
not answer-quality improvement or billed-cost/latency estimates. No provider
version-expiry lifecycle, long-duration retention, multilingual tuning or
concurrent writers across devices was newly tested. Existing evidence and limits
remain in their original documents.

## Retained evidence and retired producers

Before removing any tracked producer, the complete 299-file tree at
[`ae53978bf1d27950b12922340a6ea1ac8d1b4baf`](https://github.com/lambdadb/SillyMemory/tree/ae53978bf1d27950b12922340a6ea1ac8d1b4baf)
was archived. `artifacts/pre-default/source.tar` is 3,840,000 bytes with SHA-256
`3b1a4f5ccd4e57589517b0ce996a6b82c436d0a345b4ba5f2200c0d5c3cbfe79`.
Its bytes were compared with a second `git archive` of that commit; the adjacent
manifest records every original file's checksum. Local absolute directory:
`/Users/steven/Dev/sillymemory-versioned-default/artifacts/pre-default/`.
It is local-only, not included in a fresh clone. The immutable Git tree remains
available remotely; previously documented run archives were left untouched.

The old install-memory adapter and low-level shared-collection live runner,
including its historical retrieval-policy diagnostic execution functions, are
retired. They are reproducible with the archived producer, not by adding old
storage paths to the current engine. Frozen conversations, settings, conclusions,
scoring and the small fixture constructors used by current regressions remain.
`test:live` now uses the actual settings/branch lifecycle runner; `test:live:faults`
uses its checkpoint-recovery mode. Fresh install testing no longer asserts
0.2.0-to-0.3.0 data migration or downgrade compatibility.

Current raw reports are ignored local evidence under
`/Users/steven/Dev/sillymemory-versioned-default/artifacts/`: `unit.tap`,
`browser-smoke.json`, `recovery-smoke.json` and
`default-story/chat-collections-live.json`. Preserve them and their measured
producer sources before removing this worktree. A checksum does not imply public
artifact availability.

The verified final evidence bundle is
`/Users/steven/Dev/sillymemory-versioned-default/artifacts/archive/default-story-v1/evidence.tar.gz`:
1,835,965 bytes, 58 members, SHA-256
`478f2415b61854c49f9122aaaef76b3e00bece79a788f6c39faed9d8efcaf66e`.
Every member was read back byte-for-byte. It includes the preserved originals,
current reports/logs, candidate source and documentation patch, plus exact producer
overlays verified against every measured source hash. It is local-only.

The first browser run preceded the manifest bump; the recovery run recorded a
wording-only checkpoint error-string edit, subsequently reverted. Those exact
sources are retained. The managed run matches the final runtime files; fresh
installation tested commit `0d13811`. Later edits only update documentation.
No old run is relabeled as a paid test of an unmeasured runtime.

## Reproduction

```sh
npm ci
npm test
npm run check
npm run check:release
ST_SOURCE=/path/to/pinned/SillyTavern npm run test:browser
ST_SOURCE=/path/to/pinned/SillyTavern npm run test:recovery
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=default-story-unique \
  node scripts/chat-collections-live.mjs --checkpoint-manager
```

The host extension symlink must resolve to the candidate under test. Only the last
command incurs LambdaDB/managed-embedding usage. It allows at most four small
owned collections, preserves pending cleanup identities, and never copies the
credential file. See [fresh installation checks](../RELEASING.md#fresh-installation-smoke-test)
for testing a pushed candidate through the Git URL UI.
