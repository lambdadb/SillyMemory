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

The [completed decision record](managed-reranking.md) retains the completed stages' core
results, positive findings, answer regressions, execution boundaries and archive
identities. The three original run bundles remain byte-for-byte unchanged. A fourth
closeout bundle preserves the fixed-prompt comparison and every retired source,
fixture, protocol and detailed conclusion before active-tree removal. A fifth
bundle preserves the user-requested English-only/raw-text comparison, its neutral
14/14 versus 14/14 answer result, all four lexical controls, and the initial setup
failure/correction. A sixth bundle records the remaining six controls: all three
conditions score 5/6, sharing a topic-switch failure despite delivered evidence. It
preserves the unchanged fixture, three-arm producer, all 18 answers and cleanup
receipts. A seventh bundle preserves the full 32-case GPT-6.1 Sol comparison: vector
28/32 versus English raw hybrid + Jev 31/32, with four gains and one current-location
regression. An eighth bundle preserves the subsequent 32-case fusion diagnosis:
live component scores, local Lucene-style Bayesian arithmetic, exact candidate-set
Jev replay, and a focused existing-feature control. Bayesian + Jev injects complete
evidence in 32/32 versus RRF/Min-Max + Jev 31/32; existing weighted Min-Max and a
larger RRF rerank pool also rescue the one loss in a focused control. This stage
contains no generated answers or deployed Bayesian API. The decision record keeps
retrieval/packing counts distinct from the complete paired answer matrix and
earlier-model results. A ninth bundle preserves the fixed-pool confirmation: 32
known plus 24 new authored cases, 112 actual-host/model answers using captured
live-derived rankings, and all source/prompt/ownership checks. Bayesian gains the
known current-location answer (32/32 versus RRF 31/32), while both score 24/24 on
new cases. Weighted Min-Max ties Bayesian's complete evidence injection at the
same candidate limit; it has no new generation arm. The predeclared new-case-gain
priority gate fails, so the result does not justify prioritizing Bayesian backend
support for SillyMemory. Preserve the RRF tie-policy diagnostic as post-result
candidate-only evidence, and the future-location answer as correct despite its
stricter all-evidence miss. The four HTTP 503 upserts, initial host transport
exception, one bounded continuation of unfinished answers and unknown failed-call
usage remain explicit. All 65 owned collections are verified absent. Every
preceding bundle remains unchanged.

The current tree keeps the decision and independent generation-harness corrections.
It does not depend on archived experiment runners or raw output for CI. Historical
reproduction uses the recorded producer and local-only archive, not the current
runner. No unresolved ownership or cleanup record was discarded.

## Deployed Bayesian evaluation — 2026-10-06

The [decision record](bayesian-sdk-validation.md) preserves actual server
Bayesian/Jev support using a temporary dev SDK, twelve exposed English
update/temporal cases, all thirty-six actual-host answers, remaining mortgage/date
failures, browser CORS validation and confirmed cleanup of sixteen Collections.
The temporary dependency, bundle and SDK-specific test are retained evidence,
not maintained product or CI changes. Detailed outputs and one-off producers
remain local-only in
`sillymemory-bayesian-sdk-validation/artifacts/archive/bayesian-live-v1/evidence.tar.gz`:
4,846,316 bytes, forty verified files plus manifest, SHA-256
`f7ab9bd7ec4f86feab866cc776ac332ef1a6d09c7f7958d00df161e81128971e`.
The bundle contains base fbae879 and the exact temporary SDK/runtime patch; its
manifest and README describe restoration. Every archived file was read back and
checked against its original digest, with zero configured credential matches.
It is unavailable in a fresh clone and must be retained before worktree removal.
Earlier archives remain unchanged. Unit/emulator checks, deployed retrieval,
plain-browser CORS and actual-host ranking replay are separate evidence layers.

## Context and capacity diagnosis — 2026-10-06

The [completed follow-up](bayesian-sdk-validation.md#context-versus-capacity-follow-up--2026-10-06)
compares the original 800-token selection with 1,600 tokens and bounded paired/date
context at 800, on the same exposed English source and captured vector/Bayesian
rankings. It preserves all 48 new host-generated answers, qualified mortgage
interpretation, the recovered 24-day interval, expansion regressions and the
unchanged product/default decision. No dev SDK or maintained evaluator is added.

The local-only archive is `artifacts/archive/context-budget-v1/evidence.tar.gz` in
both `sillymemory-context-evaluation` and the primary `sillymemory` worktree:
5,090,984 bytes, 29 verified files plus manifest, SHA-256
`b2e76de37feff6c0886f663a94c1e5bdbf8adf14bbc9300fbaa3b9b15840131a`.
Both local copies are byte-identical; every member was read back and configured
secret matches were zero. It contains base fbae879, exact frozen source/rankings,
selectors/protocol, full prompts/answers/reviews, historical baseline answers,
validation and cleanup. Host source/dependencies and credentials are separately
required as described in the README; the archive is unavailable in a fresh clone.
Both owned setup Collections were verified 404. Prior archives remain unchanged.

## Compact explicit date provenance — 2026-10-06

The [completed bounded comparison](bayesian-sdk-validation.md#compact-session-provenance-follow-up--2026-10-06)
preserves 24 existing-case and twelve newly frozen control answers, the unchanged
800-token cap/rankings, zero previous-answer losses, recovered 24/16-day intervals,
mortgage/event-selection ambiguity and the boundary between conversation and
story/event time. It does not adopt production date extraction or a new default.
The original preparer's question-role fault blocks the first control before
provider forwarding; a plumbing-only continuation completes unanswered controls
without changing frozen histories, candidate order, selections or completed answers.
Both reports and their distinct producer identities are retained.

The local-only archive is `artifacts/archive/compact-date-v1/evidence.tar.gz` in
both `sillymemory-context-evaluation` and the primary `sillymemory` worktree:
4,922,433 bytes, 45 verified files plus manifest, SHA-256
`f0b2afabbbedf3ef825eebcf28f03c84e1a3a3789512bfaea5c3872846a28f6f`.
Both copies and every archive member are byte-verified; configured-secret matches
are zero. It contains base fbae879, protocols, all source/ranking/selection locks,
full prompts/answers/reviews, initial arithmetic and correction, setup failure,
validation and both cleanup receipts. All four setup Collections are verified 404.
Host/dependencies and credentials are separately required; fresh clones cannot
retrieve this local archive. Earlier archives are preserved without modification.


## Host-message provenance — 2026-10-06

The [product contract and bounded validation](conversation-time.md) distinguish
host `send_date` from benchmark session dates and story events. Twelve English
actual-host/model answers preserve five existing outcomes and make one explicit
host-date request answerable, without passage eviction; this is not a general
temporal or search-quality claim. Unit, recovery/emulator and final-prompt checks
are reported separately. Two real setup collections are deleted and verified 404.

Local-only complete archive: `artifacts/archive/host-time-v2/evidence.tar.gz` in
both the primary `sillymemory` and `sillymemory-time-provenance` worktrees,
1,000,227 bytes, 32 files plus manifest, SHA-256
`292bd6ff18e221bd8802223fd5745f4958980be9e042b71d5a28f2b26b8f5b1f`.
Every member and the backup are byte-verified, configured-secret matches zero.
It includes base cf8c70a, exact product patch/new files, one-off producers,
frozen inputs/selections, full prompts/answers, semantic review, initial failed
recovery and corrected run, and cleanup receipts. Its README discloses that the
failed recovery producer was not independently hashed and documents the local
review-verifier continuation. Raw-output v1 and all prior archives are preserved.
Fresh clones cannot retrieve these local archives; preserve them before removing
an evidence worktree. No one-off quality harness or raw dialogue is added to CI.


Source-lock review follow-up is retained separately as the local-only
`artifacts/archive/host-time-locks-v1/evidence.tar.gz` in both worktrees:
18,197 bytes, three files plus manifest, SHA-256
`d9fd4efc29e2fc80d3485b0db121e20f53bc00a5f322d5525425c44adc39d0e8`.
Its patch against 8504101 and 322-test log are byte-verified with the backup.
Measured runtime files match the paid run exactly; original archives are unchanged.

## Whole-pair indexing rejection (local-only)

The [current default decision](conversation-memory-defaults.md#whole-pair-rejection-and-retained-evidence)
preserves the rejected whole-pair result: vector 7/12 → 8/12, Bayesian+Jev
10/12 → 8/12 at 800 tokens. Long atomic pairs excluded necessary magazine and
ordering facts. The original local-only decision commit is
`94597ed6be4930ee9d8b23d860fb600322063f86`; no pair implementation was adopted.

The primary worktree retains `artifacts/archive/paired-indexing-v1/evidence.tar.gz`
(12,646,929 bytes, 51 files; SHA-256
`03fa4dd3b97f96faad82b504931938eea81d18d45ae41c90c8b564808226ba86`),
its embedded manifest, and `decision.bundle` (5,517 bytes; SHA-256
`5ecda977f6397c43c41c0098f14b2ba9b807de6d0a1aef5f99bcb25e069190ee`).
The detached `sillymemory-paired-indexing` worktree remains intact. These are
local evidence, absent from a fresh clone; the bundle preserves both complete
original decision documents without pretending the commit was published.

## Conversation memory default adoption

[Decision, method, results and limits](conversation-memory-defaults.md) and
[the time contract](conversation-time.md) are maintained in Git. The producing
base is `28342fdb44cb196027bf8ad1fa7d92bae702704b` with an archived dirty patch and
pre-call module hashes. Paid generation confirmed those hashes unchanged. The
final default-only patch follows the completed explicitly budgeted arms.

- Local archive: `artifacts/archive/conversation-memory-v1/evidence.tar.gz`.
  2,284,397 bytes, 89 manifest entries; SHA-256
  `39f98e03efa7d0edddadec30638c5a64260ffeebf8a650361e8116430c379bb7`.
- Embedded `manifest.json` SHA-256:
  `c61ad83a1a4c1a748c9836f9fa84c5f7dd4c532d60d48dc72aba5b222c08cc86`.
- Every manifest entry was extracted and checked. Identical archives and receipts
  exist in `sillymemory` and `sillymemory-conversation-time` on this machine.
  They are local-only, ignored, and unavailable in a fresh clone.
- Includes the producing base tree, measured modules, frozen synthetic sources and
  protocol, exact deployed requests/rerank responses/selections, actual provider
  prompts/answers/usage, qualitative review, original failed stages, ownership and
  cleanup receipts, one-off producers and final validation logs. Environment files,
  credentials and private host/browser profiles are excluded. Original active-tree
  evidence and all earlier archives remain intact.

Validation on the final runtime:

| Command | Outcome and boundary |
| --- | --- |
| `npm test` (Node 24.15.0) | 324/324 unit tests. |
| `npx --yes --package=node@20.12.0 node --test tests/*.test.js` | 324/324 unit tests. |
| `npm run check`, `npm run check:release`, `npm run check:sdk` | Syntax, metadata and locked stable SDK 0.8.0 pass. |
| `node --check` for every `scripts/*.mjs` and `tests/*.js`; `git diff --check` | Pass. |
| `ST_SOURCE=<pinned checkout> SM_ARTIFACT_TAG=time-final-v1 ST_TEST_PORT=18160 npm run test:recovery` | Actual SillyTavern/Chromium with LambdaDB emulator: 194 checks, no page errors, zero remaining collections. Includes the fresh 1,600-token UI default. |
| `ST_SOURCE=<pinned checkout> ST_DELIVERY_PORT=18162 node scripts/prompt-delivery-smoke.mjs artifacts/conversation-time/prompt-delivery-final.json` | Actual host with service/model emulators: 13 delivery cases plus repeated-passage packing pass. |
| Archived `retrieve.mjs` and `harness.mjs --hybrid` | Deployed managed retrieval: 720 corpus documents, 48 queries; actual host/provider: 48 answers plus READY, zero retries. Quality results in the decision document. |
| Archived supplemental browser producer and `cleanup-browser.mjs` | Actual deployed direct CORS/Bayesian/time/edit/delete/reload assertions complete; model is a fixture. Original harness failures and separate verified cleanup are disclosed in the decision document. |

Unpack the archive to recover `producer-base.tar`, `final-runtime.patch`,
`default-only.patch` and the `artifacts/conversation-time/producer/` snapshot.
The one-off producers use a fresh pinned host profile and require separately
supplied credentials; they are not maintained CI or a public credential-bearing
reproduction bundle. Normal unit coverage uses small synthetic inputs. No new
large fixture or experiment framework is committed, and no release/deployment is
established by these checks.
