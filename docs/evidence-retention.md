# Evidence retention and recovery

The cleanup separates maintained code from historical evidence. **No core result,
interpretation or original evidence is permanently deleted.** Product runtime/UI,
managed embeddings, installation and upgrade behavior are unchanged. Experiment
conclusions, failed candidates, limitations, concise summaries, dataset provenance,
frozen splits and reusable synthetic regressions stay in Git.

## Default-storage cleanup

The [default story memory decision](default-story-memory.md) records the separate
0.4.0 cleanup. It removes pre-release storage compatibility and obsolete live
producer paths, preserves the complete pre-change tree and leaves all previous
experiment results/archives intact. The unchanged-runtime statement above applies
only to the original retention cleanup below.

## Preserved originals

The complete pre-cleanup tree is
[`94b9bc04cf664587ae4c96b7739c22af87897b6b`](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
All 438 tracked files were archived before editing, including every full report,
review packet, intermediate failure, expanded plan, old producer fixture, test
and script. Existing local run archives were left untouched.

- Local archive: `artifacts/archive/repository-retention-v1/evidence.tar.gz`.
  2,845,992 bytes; SHA-256
  `14c6b324f3213c551b8de4e84c9071a2b9174822e16a538e11c7bf843ae46462`.
- File manifest: `artifacts/archive/repository-retention-v1/manifest.json`.
  SHA-256 `98221325fcd9226ab898162fff7e60cc5c86432385b38ea2494548db64514420`.
- Verified identical copies exist under the primary `sillymemory` worktree and
  `sillymemory-evidence-retention` worktree. These are two copies on the same local
  machine, not independent remote backups. They are ignored and absent in a fresh
  clone. Older cohort archives retain their previously documented locations.
- [Retired-file index](evidence-retention.json): each removed active-tree path,
  SHA-256, size and immutable public link. The archive contains the entire old
  tracked tree, not only these retired files. The manifest is also inside it.

Every archive member was read back and compared with its original bytes. The
local archive excludes environment files, private browser/host profiles and
untracked dataset caches. A public checkout of the old commit restores only its
tracked inputs; separately locked datasets and ignored cohort evidence keep their
original availability/license boundaries.

Removing files from the current tree does not erase them from Git history or
necessarily reduce a full-history clone. Public history is not rewritten.

## Results that remain in the repository

The existing conclusion documents remain, with raw evidence links pinned to the
original revision. Their numbers, interpretation and adverse findings are not
rescored or relabeled as results of the cleaned tree.

| Decision/evidence | Retained interpretation |
| --- | --- |
| [Three-mode comparison](three-mode-results.md), [native tuning](native-tuning-results.md), [Summarize](summarize-results.md) | Original settings, token/answer tradeoffs and summary usage; provisional grading and cohort differences remain explicit. |
| [Managed recall](managed-packed-results.md), [temporary direct embeddings](semantic-direct-results.md) | Separate provider paths and original failure/cleanup evidence. Removing the temporary adapter does not convert direct results into managed results. |
| [LongMemEval development](benchmark-development.md), [English held-out](english-heldout-evaluation.md) | Consumed splits, full-history comparison, input-token reduction and answer-quality limits. |
| [Boundary chunking](boundary-chunking.md), [hybrid retrieval](hybrid-retrieval.md), [budget confirmation](budget-confirmation.md) | Boundary preservation, rejected hybrid candidate and retained vector/800 defaults; no invented accuracy gain. |
| [Prompt delivery](prompt-delivery.md), [packing](repeated-passage-packing.md), [direct CORS](direct-cors.md), [upgrade acceptance](releases/0.2.0-validation.md) | Actual-host/service boundaries, historical producer revisions, failure behavior and cleanup results. |

All other historical conclusions remain linked through their existing documents
and [quality history](quality-history.md). The retired-file index covers their
original detailed records too.

## Maintained checks and archived work

Normal CI no longer revalidates entire paid cohorts against copies of old source.
Runtime tests for synchronization, isolation, edits/deletes, source validation,
token budgets, native roles, packing and final-prompt cancellation remain.
Existing inexpensive English/Korean synthetic regressions are retained.

Old report-bound tests are preserved with their original producer. Current
synthetic tests retain source/answer integrity, unfavorable selection outcomes,
cleanup, request-budget/spacing and ungraded evidence checks. Source verification
now checks this checkout and fails on mismatches; it never silently falls back to
historical fixtures or a hard-coded old Git revision. The tests do not certify
new provider answer quality. Frozen dataset/selection lock tests remain in CI.

The local prompt-delivery harness uses a small fixed-rank fixture extracted from
one synthetic historical case, with exact source-text hashes. It no longer loads
the entire 2.9 MB direct-embedding report. The unchanged full synthetic chat and
rank order remain available. These ranks are regression inputs, not new ANN
measurements or live-provider evidence.

Retired tools include the temporary direct-embedding probe/adapter, completed
historical hit replays, source-snapshot compatibility loader, and fixed pilot and
pilot-reusing development paid executors. The latter bound exact past source
hashes and cannot establish current-runtime quality; run them only with their
recorded producer. Reusable benchmark adaptation, frozen plans, preflights,
observation validation, checkpoint/receipt accounting, provider bounds and current
managed generation tools remain maintained. A new paid benchmark needs an
explicitly frozen current protocol, not silent reuse of old observations.

Supported 0.1.0 → 0.2.0 installation/cleanup compatibility is retained. Remaining
small candidate algorithms support synthetic regression comparisons; they are
not silently adopted into the product or presented as unused code.

## Recovery

To inspect one original tracked file without changing this checkout:

```sh
git show 94b9bc04cf664587ae4c96b7739c22af87897b6b:docs/results/three-mode-v1-raw.json
```

To restore the exact pre-cleanup tracked tree in a separate checkout:

```sh
git worktree add --detach ../sillymemory-evidence-original 94b9bc04cf664587ae4c96b7739c22af87897b6b
cd ../sillymemory-evidence-original
npm ci
npm test
```

The last command checks the historical test suite; it makes no paid service calls.
Some historical report checks also use older Git revisions, so retain repository
history for that reproduction. Each cohort document identifies its actual paid
producer and additional locked inputs. The pre-cleanup revision preserves the
records and validators; it is not the producer of every historical observation.
Do not rerun paid experiments merely to inspect or restore files.

For local archive recovery, first compare `shasum -a 256` with the archive hash
above. Extract into a **new empty directory**, never over an active checkout.
Verify each extracted file against `ARCHIVE-MANIFEST.json`. Restore required Git
history separately if running historical checks that consult old revisions.

## Validation and local cleanup boundary

Completed at `f8ec16766bc029b9417d54af14b1109e3273ccf6` on 2026-10-03:

- All 438 preserved files restored into a new empty temporary directory and
  verified against their SHA-256 values. Both retained archive copies match.
- Retired-file index covers all 155 removed paths (25,481,822 bytes). Product
  runtime/UI is byte-for-byte unchanged. Historical conclusion text is unchanged
  apart from evidence pointers/notices; all local Markdown links resolve.
- A depth-one fresh clone with no ignored archive or old producer history passed
  all 271 unit tests, runtime syntax and release metadata checks. Current script
  and test syntax also passed. The lower count reflects archived historical-report
  and temporary-adapter tests, not removal of the product's safety contracts.
- Actual pinned SillyTavern/Chromium with local HTTPS CORS and completion fixtures
  passed 11 delivery cases plus repeated-passage packing, with zero remaining
  emulator collections. The extracted ranks retained exact source hashes and
  delivered 4/4 memory passages and 8/8 recent messages in the packing case.
- No paid provider or remote memory operation was performed. Current source and
  the decompressed preservation archive passed a configured-secret scan.

The new validation report, unit logs and exact measured sources are local-only at
`artifacts/archive/retention-validation-v1/evidence.tar.gz` in the
`sillymemory-evidence-retention` worktree (SHA-256
`d2fcd90dac3e9549318228925dbdfb306b770b49c0913f3335e7346cac63a5c8`). Members were read back byte-for-byte; only this
completion record follows the tested code commit.

No old evidence archive or detached historical worktree was deleted by this
change. Several retained hosts share dependency symlinks, and ignored directories
can contain unique receipts/recovery state. Their physical consolidation remains
a separate storage operation after stable evidence locations and dependencies
are verified. API keys and personal chats are not migration inputs.

## Ordered commit confirmation

The [commit-confirmation record](commit-confirmation.md) preserves the request-count
comparison, failed/corrected manager runs, final guard regressions, emulator/live
boundaries and local-only archive location/checksum. All 329 files and six runtime
producer records were verified before completion. No historical evidence was
removed and no retention-expiry experiment was required.

## 0.3.0 installation acceptance

The [0.3.0 validation record](releases/0.3.0-validation.md) retains the real Git
URL/UI upgrade results, opt-in story/checkpoint lifecycle, failed navigation
attempt, interpretation and publication boundary. Its local-only archive contains
319 verified files and three exact installation producers. Existing historical
archives remain intact; all owned test resources were cleaned up.

## Managed reranker adoption review

The [completed decision record](managed-reranking.md) retains all four stages' core
results, positive findings, answer regressions, execution boundaries and archive
identities. The three original run bundles remain byte-for-byte unchanged. A fourth
closeout bundle preserves the fixed-prompt comparison and every retired source,
fixture, protocol and detailed conclusion before active-tree removal.

The current tree keeps the decision and independent generation-harness corrections.
It does not depend on archived experiment runners or raw output for CI. Historical
reproduction uses the recorded producer and local-only archive, not the current
runner. No unresolved ownership or cleanup record was discarded.
