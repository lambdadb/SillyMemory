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

Validation after initial-default adoption, before the automatic-review boundary fix:

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

Automatic review then identified the stable SDK's 8,192-byte reranker query limit.
The final guard uses a shared whole-code-point UTF-8 prefix for vector, lexical
and reranker signals. Unit coverage includes long CJK, emoji, a partial-code-point
boundary and an exactly-full request. `npm test` (Node 24.15.0) and the Node 20.12.0
command above pass 325/325; syntax, release and SDK checks pass again. Replaying the
24 captured Bayesian requests through the final SDK client produces identical
request bodies (maximum query 144 bytes) and no network/provider calls. Actual-host
and paid quality runs were not repeated after this boundary-only fix.

The original adoption archive remains unchanged. A verified supplemental archive
at `artifacts/archive/conversation-memory-review-fix-v1/evidence.tar.gz` contains
10 entries, 37,996 bytes; SHA-256
`ad711aae12c4f4ef5e7b149c8a201120e8d31d8e5961cfafcecd0f92503c089e`.
It records the patch against `fa49b55974f2fa6a9a0938a09ce7bc18291e3cce`, final
client/test bytes, request-equivalence receipt and final check logs, and links the
original archive checksum. Identical local-only copies and receipts exist in the
same two worktrees; every manifest entry was extracted and verified.

A subsequent review added exact provider/model identity checks for applied and
empty-candidate rerank metadata. Mismatches fail closed. Both Node suites remain
325/325, syntax/release/SDK checks pass, and the same 24 captured deployed requests
and responses pass the final client without new network/provider calls. Actual
host/paid runs were not repeated for this validation-only change.
The supplemental archive is
`artifacts/archive/conversation-memory-review-identity-v1/evidence.tar.gz`:
9 entries, 37,550 bytes; SHA-256
`bc61748e51a2f5b9fd2619bcd57c4821b59081e59d4ba78de791ecb4bcce84f8`.
It preserves the patch against `18b0ca18fe51e74f90dd0c4d23b5364068a5b000`, final
client/tests and check/replay logs. All entries were extracted and verified, and
an identical local-only archive/receipt is retained in the primary worktree.
Neither original archive was replaced.

## Memory interpretation guidance decision

The [bounded instruction comparison](conversation-memory-defaults.md#memory-interpretation-instruction-efficacy-inconclusive)
uses producer baseline `c7edad18d2357acc433e47c478f918176444e983` and pinned
SillyTavern `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Both arms answer 12/12;
no instruction or runtime change is adopted. Efficacy is inconclusive because the
baseline is perfect and relevant failures were not qualified before the comparison.
No completed answer was regenerated; the original archive/review decision bytes
remain unchanged even where their wording predates this correction.

- Archive: `artifacts/archive/memory-interpretation-guidance-v1/evidence.tar.gz`.
  It contains 58 entries, 1,485,895 bytes; SHA-256
  `23158f04281d5656ff59a279f67e6ab20951b8e6f1a215140bad534856e8055b`.
- Embedded manifest SHA-256:
  `e75cca470c089a910f235de7540f329710a102e2285c7ac5430856a79342e09e`.
  Every entry was extracted and its length/checksum verified. Configured keys
  were scanned in memory and are absent from the bundle.
- Identical archive/receipt copies exist under `artifacts/archive/` in
  `/Users/steven/Dev/sillymemory` and
  `/Users/steven/Dev/sillymemory-memory-guidance`. These are two local copies on
  one machine, not a remote backup; ignored and unavailable in a fresh clone.
- Includes the producer base and measured module bytes, frozen sources/targets,
  settings/instruction, exact requests/rankings/selections, all 24 actual answers
  and READY with usage, separate completed semantic review, original fetch-503
  continuation and fixture-spacing failure, prompt assertions, all 17 owned-data
  cleanup receipts, one-off scripts and validation logs. No environment file,
  credential or host/browser profile is included. Original evidence and older
  archives remain intact; these one-off producers are not maintained CI.

`harness.mjs --hybrid` completes actual-host/provider delivery, source locks,
real 15-second start spacing and cleanup. `dry-harness.mjs --hybrid` completes
24 fixture prompt checks and cleanup with zero OpenAI calls, but its raw overall
result remains failed for an inapplicable provider-spacing assertion; the separate
assessment explains this boundary. `retrieve.mjs` completes deployed managed
retrieval after the retained bounded continuation. See the archived protocol for
cost bounds, and the decision document for interpretation and quality limitations.

Validation of the unchanged runtime: `npm test` (Node 24.15.0) and
`npx --yes --package=node@20.12.0 node --test tests/*.test.js` both pass 325/325.
`npm run check`, `npm run check:release` and `npm run check:sdk` pass. All
`scripts/*.mjs` and `tests/*.js` pass `node --check`; `git diff --check` passes.
No new isolation/recovery suite, model sweep, release or deployment is claimed.

### Historical failure qualification and ceiling correction

The source/prompt/answer audit of mortgage `852ce960` and elapsed days `4dfccbf7`
finds no clear evidence-sufficient interpretation failure to justify another
instruction comparison. It verifies nine original input/report members against
their historical archive manifests. The mortgage's qualified two-amount answer
has an ambiguous single-answer target; the date dependency was already repaired
by the earlier compact-date Bayesian diagnostic. No new provider or service call
was made, and no historical answer, score or original evidence bundle was changed.

Supplemental archive:
`artifacts/archive/memory-guidance-failure-triage-v1/evidence.tar.gz` contains
12 files plus manifest, 10,638,833 bytes; SHA-256
`57013fcf37dcec84413abc2ca8db5eff686ab8479068f5587d1f1f7c9f32f2d5`.
It preserves the checked original inputs/reports, full source excerpts and prompt
selections, derived classifications and one-off audit/archive scripts. All members
were extracted and length/checksum verified; configured-secret scanning passes.
Identical local-only archive/receipt copies exist in the primary and
`sillymemory-memory-guidance` worktrees, unavailable in a fresh clone. The previous
guidance and historical archives remain intact. The corrected interpretation is
maintained in the decision document; the original provisional review is not edited.

## Current-baseline failure discovery

The [completed decision](current-baseline-failure-discovery.md) uses producer base
`13a27f7713b9a5ce66fb4f3c15ab66ab1ca4a770` and pinned SillyTavern
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Six actual discovery answers produce
five target matches; one same-ranking capacity repair returns the complete answer.
No instruction/runtime/default change is adopted. The independent six-case source
preflight has no missing labeled evidence at 1,600, so no paid confirmation
comparison is run. Source coverage is not an answer-correctness claim.

- Archive: `artifacts/archive/current-baseline-failure-discovery-v1/evidence.tar.gz`.
  It contains 81 files plus manifest, 84,501,361 bytes; SHA-256
  `167b8161bfde17f636b7d1c49109b1f1676dc11d4ce573dafeeb13e39fb18d53`.
- Every manifest member was extracted and checked for length/SHA-256; configured
  secret scanning passes. Identical archive/receipt copies are retained in
  `/Users/steven/Dev/sillymemory` and
  `/Users/steven/Dev/sillymemory-failure-discovery`. These are local copies on one
  machine, ignored and unavailable in a fresh clone, not a remote backup.
- Includes the full original public dataset and original dialogue adaptation,
  selection/source/settings locks, producer base tar, one-off source, deployed
  readbacks/searches, 18 actual-host fixture selections, seven full actual quality
  answers plus two actual READY checks, complete prompts/usage, pre-answer judging
  criteria, semantic audits, unchanged candidate plan and separate ceiling-stop
  receipt. All 24 owned collection cleanup receipts and Node/syntax/SDK/release
  check logs are retained. No environment file, secret or host profile is included.
- Original auth401, consistent-fetch503 attempts, bounded read retries and
  Bayesian400 service probe are preserved, alongside the successful later probe.
  The earlier `failure-discovery-service-blocker-v1` archive remains unchanged
  (SHA-256 `4918d44b97304590c3b8f6bb55c6e656ad4f536b4b887d2c91ce7554119ff581`).

For reproduction, restore the recorded base, archived dataset/cases and producing
scripts in ignored `artifacts/`, with the pinned host and its dependencies. The
one-off scripts record the original absolute local dataset/environment locations;
restore or explicitly adapt those ignored paths before use. Only the primary
`.env.local` supplied credentials in memory, with explicit `SM_MODEL=gpt-6.1-sol`.
Replaying captured selections is offline; repeating upserts/searches/answers is
new paid live work and does not reproduce identical provider responses. This
archive is evidence, not a portable maintained evaluation command or CI fixture.

## Context-aware query comparison

The [completed comparison](context-aware-query-comparison.md) retains the current
runtime/defaults: baseline17/18, structured-context17/18, constrained-rewrite18/18.
The only gain uses an unchanged query; two current-query-only attribution answers
also succeed. The supplementary full-source 5K correction changes interpretation,
not historical scores, source bytes or original archives.

- Local-only archive: `artifacts/archive/context-query-comparison-v1/evidence.tar.gz`.
  54 files plus manifest; 20,473,538 bytes; SHA-256
  `acc6e899aa9b9f835308fc5996dff9769a100cc91e1f4393ac6289ca5ba9187f`.
- Every manifest member read back and length/hash verified, configured-secret
  matches zero. Identical archive/receipt copies exist in the primary
  `/Users/steven/Dev/sillymemory` and
  `/Users/steven/Dev/sillymemory-context-query` worktrees. These are ignored local
  copies on one machine, unavailable in a fresh clone, not a remote backup.
- Contains producer base 13a27f7, all twelve external and six synthetic inputs,
  original/prepaid input versions, frozen methods/scoring, original protocol and
  separately retained schedule/diagnostic addenda, all deployed captures/readbacks,
  actual-host source/prompt identities, 54 main and two diagnostic full answers,
  eighteen rewrites, three READY checks and corresponding zero-provider fixture
  reports, source-interpretation correction, final audit, usage/cleanup/check logs,
  and one-off producers. All thirty owned collections are deletion/404 verified.
- Original failure-discovery archive and active-tree evidence remain unchanged.
  Restore this archive into a fresh directory, supplying pinned host/dependencies
  and credentials separately. Captured-rank replay is offline; rerunning actual
  retrieval/generation is new paid work with nonidentical provider responses.
  Historical absolute paths need adaptation; this is retained evidence, not a
  maintained portable evaluation command or CI dependency. No environment file,
  credential, personal chat or host/browser profile is included.

## Lower-cost rewrite model comparison

The [completed follow-up](context-aware-query-comparison.md#lower-cost-rewrite-model-comparison)
compares 54 actual rewrites on the same eighteen exposed inputs. Luna-none preserves
query scope but has two mode errors; Luna-low adds event-scope/provenance loss.
One faithful changed query passes deployed retrieval and an actual Sol answer.
No full-model equivalence, new eighteen-answer score or runtime/default adoption.

Local-only archive: `artifacts/archive/luna-rewrite-v1/evidence.tar.gz`, 41 files
plus manifest, 1,124,521 bytes; SHA-256
`b60a1710915434ca751eee8b4f4764c05c88c919ac9c9e784da1e09532abf368`.
All members are read back and length/hash verified; configured-secret matches zero.
Identical archive/receipt copies exist in the primary `sillymemory` and
`sillymemory-context-query` worktrees, ignored and unavailable in a fresh clone.
These are two local copies on one machine, not a remote backup.

Includes producer base 13a27f7, exact captured system/user inputs, original protocol,
separate transport continuation, initial failed report and completed remaining
outputs, all 54 rewrites, mode/scope audit, usage/latency, changed-query control/source
and final actual answer, actual-host fixture reports, plans/source locks, original
HTTP500/connection-timeout/setup503 attempts, all eight verified owned cleanups,
syntax-checked one-off source. Original context-query archive remains unchanged and
retains the full original cohort; this bundle includes only the downstream
synthetic source needed here. Host/dependencies/credentials must be supplied
separately; historical absolute paths need adaptation. Fresh paid reruns do not
reproduce identical provider output. Environment files, credentials, host/browser
profiles and personal chats are excluded. The recorded 13-vs-12 query-attempt bound
deviation is retained; no evidence or failure was rewritten to conceal it.

## Expanded contextual-query quality comparison

The forty-case English comparison is recorded in
[context-aware query comparison](context-aware-query-comparison.md#expanded-contextual-query-quality-comparison).
It completes 96 live query rewrites and 120 new Sol answers across single-current-
question, B/Sol-low and B/Luna-none arms. All three retrieve/inject sufficient support
and answer 35 factual targets; five ambiguity controls meet clarification criteria.
The generic event-pair case does not specify its intended inspection/drill labels:
its bridge source is missing and menus use a competing historical note. Preserve
that limitation rather than claim forty complete source recoveries. Clear referent
resolution is 25/25 Sol versus 12/25 Luna, with mode-only mistakes in both models;
no default or runtime adoption. A saturated small-corpus factual baseline leaves
rewrite efficacy inconclusive.

Detailed output/source/audit is ignored and **local-only**, unavailable in a fresh
clone or CI:

- Primary retained copy: `artifacts/archive/context-quality-v1/evidence.tar.gz`.
- Producing worktree copy: the same relative path in `sillymemory-context-query`.
- Archive SHA-256: `cc293ac84dcbd3aaa06ec79d2651295aeebef456d1b61d999f3433e830c8ad2e`.
- Size: 2,472,550 bytes; 43 files plus `ARCHIVE-MANIFEST.json`.
- Every member hash/length and primary backup bytes verified; configured-key
  matches zero. No `.env.local` or credentials copied.
- Base: `13a27f7713b9a5ce66fb4f3c15ab66ab1ca4a770`; pinned host
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`; SDK 0.8.0.

The bundle contains frozen cases/specifications/protocol, exact original B prompt,
one-off builder/host runners/resource guard, producer-base source tar, full
fixture/two-live reports and source-hash plans, ownership/request ledgers, complete
manual/final audit, annotation correction, completion and local check logs. The
original fixture cap 44 protocol/budget bytes are retained against their recorded
hashes; paid phases use the pre-live corrected cap of 48 and separately verified guard.
An initial annotation of grounded `he`→Owen replacement as semantic corruption is
withdrawn; violin specificity remains a documented limitation, with original
annotation/disposition preserved. Required/contrast evidence roles are explicit;
the later grant note also independently supports the original $1,400 amount.

Actual provider attempts: 218, zero retries/transport errors. The fixture's 217 responses
are simulated, with zero direct OpenAI calls; fixture service setup is real. All
46 owned collections (40 corpora + six setup) are deleted/404-confirmed; pending
records absent. Combined submissions: 2,923 and query attempts: 75 stay within frozen
resource bounds. No repeated-answer quality selection, hidden failed run or
unperformed corpus browser-sync claim. The original failure-discovery, context-query,
Luna-rewrite and service-blocker archives remain untouched.

## Complete recent-dialogue comparison

- **Availability:** local-only retained evidence; not downloadable from a fresh
  clone and not a CI dependency. No new raw corpus or one-off harness is committed.
- **Primary archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/context-full-v1/evidence.tar.gz`.
- **Producer copy:** `/Users/steven/Dev/sillymemory-context-query/artifacts/archive/context-full-v1/evidence.tar.gz`.
- **SHA-256:** `2440cc68dbd88735caca7d6ccf6d99048e37660936ab083fa62eec9030de4b44`.
- **Size:** 1,765,880 bytes; 38 original files plus `ARCHIVE-MANIFEST.json`.
  Every member's length/hash and the byte-identical primary copy were verified;
  a scanner using the parsed configured credentials found zero matches.
- **Runtime producer:** `13a27f7713b9a5ce66fb4f3c15ab66ab1ca4a770`; pinned actual
  SillyTavern `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Full protocol, generated
  fifteen-case inputs, pre-live hashes, source tree and one-off scripts are included.
  The actual-host fixture's original protocol and failed initial stale-path startup
  log are retained; live criteria were fixed before any paid generation.
- **Evidence:** three discovery and twelve pre-frozen confirmation cases, four
  search policies, fifteen Sol rewrites, sixty Sol answers, seventy-seven successful
  provider attempts, no retries/errors; all ranks, delivered messages, source/time/
  coordinate assertions, manual answers and query audit, stage metrics and limits.
- **Confirmed result:** complete-context B and static full context both recover
  four hotel sources missed by current-product and question-only retrieval.
  Confirmation answers are 8/12, 7/12, 11/12 and 12/12 respectively. Two final
  arithmetic errors are retained and separated from retrieval; one occurs with
  a byte-identical B/question-only prompt. B's superiority over static retrieval
  or causal noise reduction in this cohort is not established.
- **Limitations:** constructed template-sharing variants, short full contexts,
  single output samples, agent adjudication and SDK-rank replay into the actual
  host. Not a public benchmark, long-input reliability claim or production change.
- **Cleanup:** all 21 owned collections deleted and 404 verified (fifteen corpus,
  six fixture/live setup); 1,683 submitted documents and 63 query attempts.
  Pending records absent; temporary host profiles/servers removed and original
  model/settings/prototypes restored. Original prior evidence archives retain
  their previously recorded checksums. No historical evidence is discarded.
- **Validation:** Node 20.12.0/24.15.0 suites each 325/325; runtime/release/SDK and
  whitespace checks pass. Fixture made 76 simulated replies and zero OpenAI calls.

See [method, exact failures and interpretation](context-aware-query-comparison.md#complete-recent-dialogue-comparison).

## Complete recent-query production validation

- **Availability:** local-only retained bundle at
  `/Users/steven/Dev/sillymemory/artifacts/archive/full-query-production-v1/evidence.tar.gz`,
  verified byte-identical implementation-worktree copy. Unavailable in a fresh clone.
- **Integrity:** SHA-256
  `14c59b6485bf8aa342a6c99e194d731d57229692bfd11a987f15783c493f5e47`;
  215,891 bytes, 43 members including the manifest. All member hashes and copied
  bytes verified; configured-secret matches zero.
- **Contents:** bounded protocol and input/harness locks; three frozen historical
  synthetic inputs; temporary initial/corrected host runners; both live reports;
  basic/final fault reports and logs including the failed overflow assertion;
  Node 20/24 results; exact paid producer source with verified report hashes;
  base `62e99aa7e5f0ac09f9f9fe6371ff958da77eba30` and final runtime/test patch.
- **Result:** actual unmodified browser runtime, no rank replay or prototype
  replacement: all three source-injection and answer checks pass. One initial
  OpenAI 400 from unsupported temporary temperature settings is retained; corrected
  Sol parameters yield three successful answers. Final explicit query-limit abort
  was added afterward and verified by 75 fault/browser checks. The basic emulator
  checks 42 assertions; unit suites each pass 323 tests.
- **Cleanup:** combined live runs submit 339 documents, make nine query attempts
  and create four owned collections; all deleted/404 verified, no pending ownership
  record. Session keys are not persisted, host credentials are not forwarded, and
  temporary processes/profiles and the original host extension symlink are restored.
- **Boundary:** implementation smoke, not a new full-cohort efficacy result or a
  long-input/multilingual reliability claim. Preserve the earlier complete-dialogue
  comparison and all historical archives unchanged. See the
  [product decision and interpretation](context-aware-query-comparison.md#product-adoption-complete-recent-query).

## Jev depth100 provider blocker

- **Record:** [combined depth100 comparison and blocker](jev-depth-100.md).
  Historical interruption: 233/500 fresh paired questions. The original archive is
  unchanged; the completed continuation and answer evaluation are recorded below.
- **Availability:** local-only ignored evidence, unavailable in a fresh clone and
  not a CI dependency. Original dataset, parent archives and tokenizer are referenced
  local dependencies; no raw corpus or one-off runner enters maintained source/CI.
- **Archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-blocker-v1/evidence.tar.gz`.
  SHA-256 `b307cb9733903aa49f6d09919ded62e1e029cb49427487a1513fc62215536fd2`;
  29,080,864 bytes, 419 members. Every member's original bytes verified; configured
  credential matches zero. Six predecessor archives retain their original checksums.
- **Producer:** runtime base `ec0834e8641ff4b35f9b348981d89117725ce886`, original
  boundary-v1, managed OpenAI text-embedding-3-small, Bayesian English and question
  only. Both arms use default native Jev; k/candidate 50 versus 100, final 50 and 4096
  tokens unchanged. Stable SDK 0.8.1 is experiment-local; maintained SDK 0.8.0 unchanged.
  Frozen plan/settings/protocol/source/query locks, all 233 complete pair/pool envelopes,
  prompts, ledgers, two preserved failed execution snapshots and two diagnostics included.
- **Blocker:** repeated 503 in Jev on both depth settings, seven attempts per query
  episode exhausted twice. Same-corpus retrieval/managed embedding succeeds; diagnostic
  returnOriginal reports fallback/unavailable/scoredCount0. A previously successful
  short question also fails Jev, making a long-query-only issue unlikely. Exact
  upstream cause requires provider logs. Diagnostic fallback is never scored/injected.
- **Partial result:** 437 marked occurrences: final retrieval 417→430, delivery 416→420;
  13 delivery gains, 9 losses. Multi-session delivery 310→320; preference 40→34. Temporal,
  update and assistant-source groups not completed. Source markers are not answers;
  preserve redundant/ambiguous markers rather than silently changing the evaluation.
- **Validation:** independent partial marker/request arithmetic; all 500 planned
  corpora rebuilt; 4743 physical main upsert bodies and 46,600 successful source hits
  validated; 466 exact token-budget/rendering replays. Node 24.15.0 unit 323/323,
  syntax/release/SDK checks passed; eight synthetic error/retry scenarios passed.
  No Node 20, actual-host, generated-answer accuracy or exact-vector-oracle check.
- **Resources including diagnostics:** 239 collections, 233,018 physical submitted
  documents, 6,722 requests; all deleted/GET404-confirmed and owned listing empty.
  Main and diagnostic counters are separately retained and must be combined for
  future safety guards. No pending remote data, promotion, publication or default change.
- **Continuation:** only 267 remaining frozen IDs. Verify predecessor/producer hashes,
  provider recovery and remaining aggregate bounds first. Retain paired segments and
  original clock; if its four-hour window expires, explicitly define a bounded
  continuation rather than silently resetting the deadline or rerunning completed pairs.

## Jev depth100 complete answer comparison

- **Record:** [completed comparison and interpretation](jev-depth-100.md). All 500
  fresh search pairs, then 1000 fresh Sol answers and 1000 official judgments.
  Official accuracy 464/500 (92.8%) → 471/500 (94.2%); 15 gains and 8 losses.
  Source coverage improves, but judge-sensitive and ambiguous cases limit the
  causal interpretation. Product/default promotion is deferred; no code change.
- **Availability:** local-only ignored evidence, unavailable in a fresh clone and
  not a CI dependency. Dataset, tokenizer and predecessor archives are referenced
  external local inputs. No raw corpus, responses or one-off helpers enter Git.
- **Archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-completed-v1/evidence.tar.gz`.
  SHA-256 `c86917f90c55c80269517d63e94bc9a68539253f592daa6002aa72aecd38039f`;
  72,350,337 bytes, 1819 members. Every member's original bytes verified; configured
  credential matches zero. Initial archived report SHA-256
  `0e26387142091f0fad939a848ea5ecd3bdbfadde971ea3ddc62c37124e0df6e8`.
  The interrupted archive and six earlier predecessors remain byte-identical.
- **Producer/settings:** base `ec0834e8641ff4b35f9b348981d89117725ce886`, experiment
  SDK 0.8.1, managed text-embedding-3-small, original boundary-v1/800-codepoint chunks,
  Bayesian English question only, native typesafe/jev-1.13.0/default-relevance-v1,
  k/candidate 50 versus 100, final 50, consistent branch reads, identical 4096-token
  compact session-date packing. No fallback is scored. Maintained SDK 0.8.0 unchanged.
- **Answers:** exact stored memories and previous system/date-decorated question;
  gpt-6.1-sol/low/output4096, fixed gpt-4o-2024-08-06/temperature0/output10 official
  template and strict yes/no parser. No reference/rubric in generation. Actual
  response identities match; Sol is an undated alias. All 2000 calls HTTP 200, no retries
  or waits, concurrency 2, 27.26 minutes. No new LambdaDB requests for answer scoring.
- **Interpretation:** all 23 changed answer/reference pairs inspected provisionally;
  exact changed prompts, source/budget evidence and notes included. Real missing
  source recovery coexists with personalization budget regressions and near-equivalent
  answers receiving opposite official labels. Preserve original labels, ambiguity
  and the distinction between marker coverage, generated answers and human judgment.
  This repeatedly consumed 500 is not blind held-out or independently replicated.
- **Recovery/resources:** user reported Typesafe credit exhaustion, replenishment
  and automatic payment; account logs not independently inspected. Both blocked
  cases resumed with native applied. Prior diagnostics added to original guards;
  all 233 earlier complete pairs unchanged. Combined native/diagnostics: 506 owned
  collections, 493091 physical submitted documents, 14207 requests, 1050 rerank attempts.
  All deleted/GET404 confirmed and owned listings empty; no pending remote data.
- **Validation:** independent full marker/request and 1000 answer/judge receipt
  recomputation; all 487285 source documents rebuilt, 10080 physical upsert bodies
  and 100000 returned source hits checked, 1000 exact memory/budget replays. Node 24.15.0
  unit 323/323, syntax/release/SDK checks and eight synthetic retry scenarios passed.
  No Node 20 locally, new browser/host run, exact-vector oracle, same-byte judge
  repeats, independent human adjudication, deployment or promotion.
- **Preservation:** frozen plans/protocols and producer/continuation/analysis locks,
  all raw query/model envelopes, prompts, transport ledgers, failed episode snapshots,
  cleanup records and source bundle included. Prefix analysis-lock outputs belong
  to the unchanged interrupted archive; use completion locks for the final run.
- **Completed offline follow-through:** [source-consistency audit](jev-depth-100.md#completed-offline-source-consistency-audit)
  covers all 23 changed pairs using the immutable completed archive and released
  source. Five source-backed coverage benefits (museum chronology still qualified),
  two budget-related personalization losses, two unsupported/incomplete generations,
  one cleaner abstention and 13 scoring/target-confounded pairs. These are dispositions,
  not corrected accuracy labels; the other 477 pairs are not semantically regraded.
  Product/default promotion remains deferred; zero new provider requests or resources.
- **Audit archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-source-audit-v1/evidence.tar.gz`.
  SHA-256 `b486a5c6f79864762da560434349dcb56198838a89d809ca77b3b6ec8a18119b`;
  61,264 bytes, 10 members, each original byte verified. Source-audit archived report SHA-256
  `f19ca1e5f92aac700a07630440222a57bd1d21549fbcf9aba3965192d05d3404`.
  Includes frozen rules/case list, decisions, exact source/rank/delivery/answer
  locators, audit producer/validator, input locks, references and revised report.
  Initial completed/interrupted archives remain unchanged; the revised report does
  not replace their original bytes. Local-only external dataset/parent dependencies;
  no audit helper or raw source enters Git or CI.
- **Audit validation:** 23 pairs, 56 original source locators and 88 delivered-passage
  locators independently checked against archived envelopes; labels and 15/8 official
  changes unchanged. Train subtraction, website date interval and different-week
  doctor/bedtime examples recomputed without a model. This checks recorded bytes and
  arithmetic, not independent human judgment or full-cohort corrected grading.
- **Completed budget-ceiling replay:** [full50 injection diagnostic](jev-depth-100.md#completed-offline-injection-budget-ceiling)
  covers all 500 questions/both existing arms, changing only 4096 admission to all
  fixed final50 passages under the identical renderer/selector. No retrieval,
  embeddings, generation, judgments or remote resources. Full-memory medians
  6595/7054 tokens and maxima 8675/8681; serialized prompt estimates rise 1.60×/1.69×.
  Depth50 restores one annotated source in an already correct case; depth100 restores
  11 across nine cases, including all markers in two current wrong answers and some
  markers in a third. No new accuracy or noise labels; defaults/reference unchanged.
- **Budget-ceiling archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-budget-ceiling-v1/evidence.tar.gz`.
  SHA-256 `74a4054384317dd266188ee97a348a9f22129490391e078feeed5f6c4ca092d7`;
  22,490,224 bytes, 13 members, each original byte verified. Budget-ceiling report
  SHA-256 `85f85e2f03af81bc1e2fd9a069f24f3f2b6c52419b69466e81adc60748042fdd`.
  Frozen plan/producer/input locks, 1000 complete counterfactual memories/prompts,
  per-case metrics, aggregate/type results, validator and revised report included.
  Interrupted/completed/source-audit archives retain their original bytes.
  Local-only dataset/tokenizer/parent dependencies; no large results or one-off
  helpers enter Git/CI. Re-render in a separate workspace with empty output paths.
- **Budget-ceiling validation:** 1000 memories and 50000 fixed passages; baseline
  source inclusion, original markers/labels and exact prompt whitelists/hashes checked.
  All pass the earlier experimental32768 input-plus-output reservation gate, not a
  fresh provider context-limit check. Same recorded tokenizer; no new answer-quality,
  billing, latency or browser test. Defer paid full50 generation; first assess preserving
  selected text/provenance while reducing repeated contiguous-message formatting.
- **Completed same-message assembly:** [fixed-budget source assembly](jev-depth-100.md#completed-offline-same-message-assembly)
  covers all 500 questions/both captured final50 arms, with search and budget4096
  unchanged. Same-message canonical ranges share a source/date header, touching or
  exactly overlapping ranges are joined and missing intervals explicitly marked.
  Existing identical-text groups remain opaque with all citations. Original selected
  passages are a source floor; spend savings in original rank order, or retain the
  exact baseline when formatting saves nothing. No new model or retrieval calls.
- **Assembly result:** same-source median savings 250/267 tokens; marker delivery
  864→865 / 876→883. Depth100 recovers seven marked occurrences across six questions,
  including all annotated sources for both inspected budget-related wrong answers
  and partial restoration for cultural events. All seven newly represented bodies
  are complete. Existing marked delivery/text is preserved, but no new answer
  accuracy is measured. Additional admitted depth100 passages 1262, of which 1255
  are unmarked; unmarked is not irrelevant. Full50 medians fall to 6221/6479 but no
  full50 memory fits4096. Boundary-v1 has zero actual overlap; overlap tests are
  synthetic. Defaults and the benchmark reference stay unchanged. The current500
  remain full regression/discovery evidence. Before paid independent confirmation,
  freeze a disjoint, previously unused cohort and scoring/provenance/exclusion rules;
  a new subset of the consumed500 does not qualify. No such cohort was prepared here.
- **Assembly archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-message-packing-v1/evidence.tar.gz`.
  SHA-256 `a7275c3fc78c61f057f44b3ed8b3132e1defb66ca0d02e3e7be969ad103d24b4`;
  42,143,920 bytes, 19 members, each original byte verified. Initial archived report SHA-256
  `500b8b0362d7ce0202cac09c4b70329b9a2c223c0377f057c49cd6ffb4b17fbf`.
  Frozen plan/producer/input locks, complete memories/prompts and source-union blocks,
  metrics/type results, source inspection notes, nine small synthetic scenarios,
  validator and revised report included. All four preceding Jev archives remain
  byte-identical. Local-only, unavailable in a fresh clone; dataset/tokenizer and
  parent sources/results are external dependencies, not CI inputs. No raw corpus,
  one-off implementation or compatibility path is added to maintained source.
- **Review clarification:** the initial archived report called the same500 answer
  comparison confirmation; the current report correctly treats it as regression and
  requires disjoint unused data before independent confirmation. Results/labels are
  unchanged. Adjacent `review-correction-report.md` SHA-256
  `fc1ce7376fab0456abf313083d4d8f8609978f5dcbae1ced727bab1d2aee5d62` and
  `review-correction.json` SHA-256
  `d207c37374340a2668f8acea150a7c410035c21ce615716370039297a3e890cb`
  preserve the correction/repeated validation without replacing the original archive
  or manifest. Both sidecars are local-only at the same assembly archive directory.
- **Assembly validation:** independent Python checks 1000 memories, 50000 returned
  passages, 32105 selected passages and 81551 rendered blocks; canonical UTF-16
  unions, explicit gaps, all baseline sources, identical-text provenance, exact prompt
  whitelists and original labels/markers verified. Nine synthetic scenarios passed.
  `npm test` 323/323 on Node24.15.0 and syntax/release/SDK checks passed; product/test
  diff is empty. Same recorded tokenizer, no independent tokenization, generated
  answers, billed usage, latency, fresh browser integration or default promotion.
- **Completed fresh assembly answer regression:** [full consumed500 comparison](jev-depth-100.md#completed-fresh-source-assembly-answer-regression).
  Freeze point `09c6d1b36676a1ef05fe5a328b7f7356c33fc49d`. Same captured depth100
  final50, 4096 budget, source-preserving candidate, system/questions/gold and
  Sol/official judge; no new search/embedding/reranking or runtime changes.
  Fresh control469/500 (93.8%), candidate475/500 (95.0%), 11 gains/5 losses.
  All16 changed pairs and6 restored-marker cases (19 unique) inspected: two clear
  restored-source personalization benefits (slow-cooker/NAS); other changes include
  interpretation, source/target ambiguity and grading consistency concerns.
  All baseline source text remains included; official labels are not corrected.
  This is consumed-cohort regression/discovery, not independent confirmation.
  Before paid confirmation, freeze an unused cohort without shared consumed
  questions/conversation sources and fixed provenance/exclusion/scoring rules.
- **Assembly-answer archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/jev-depth-100-message-packing-answers-v1/evidence.tar.gz`.
  SHA-256 `868238a783b0d4926518e5ac1a9e58d5c7bf45c288e2e6fdb0c3e91fc833f506`;
  10,741,039 bytes, 1036 members, every original member byte verified. Archived
  final report SHA-256 `04a765e7a9581141b8edfc29f5617e953a282639102c9108240183a5d0d363fc`.
  Adjacent `manifest.json` records all member hashes, frozen producer base and
  parent archive hashes. Includes1000 exact prepared/graded case records, raw
  transport receipts/usage, frozen prompts/settings, preflight/validators,
  metrics, review cards/dispositions/source locators and one-off producer sources.
  All five prior Jev archives and both review-correction sidecars remain unchanged;
  zero configured-secret matches. Local-only, unavailable in a fresh clone;
  recorded parent/dataset/tokenizer paths are dependencies, not CI inputs.
- **Assembly-answer validation:** independent all1000 prompt/source-floor/gold
  checks and2000 request/receipt/model/strict-label/usage/bounds checks passed;
  all19 review pairs/96 source locators match captured records. Exactly2000 HTTP200
  calls, zero retries/waits, concurrency2, 27.38 minutes; normal calls have no
  artificial sleep and available rate headers feed admission. Actual answer input
  2158498→2138377 (−0.93%), successful answer HTTP median2060→2025ms. These are
  provider usage/timings, not an invoice or actual-host latency. No remote resources
  created. `npm test`323/323 on Node24.15.0, syntax/release/SDK checks passed.
  No independent semantic adjudication, same-byte judge repeat, unseen cohort,
  actual-host integration, runtime/default promotion or deployment.

## Source-only assembly integration

- **Decision and scope:** [implementation and validation](source-assembly.md).
  Integrate source-preserving same-message assembly into memory injection, using
  only validated returned chunks and UTF-16 positions. Current repeated-packing
  selection is a source floor; preserve every selected passage and refill saved
  space in rank order. Exact overlap only; missing intervals stay explicit.
  No additional retrieval/model calls, new mode, SDK/storage change or search,
  recent-message, token-budget or host-cap change. This is implementation evidence,
  not another answer score or unseen-cohort confirmation.
- **Validation:** Node24.15.0 `npm test`332/332, runtime/development syntax,
  release and SDK checks passed. Real pinned SillyTavern1.19.0/Chromium153.0.8010.12:
  browser44 and fault76 checks passed, zero emulated collections remaining. Actual
  host generation:13 existing delivery cases plus overlap/repeated packing and
  new assembly scenario passed; full source/role/time reaches a local completion
  endpoint and stored history stays intact. LambdaDB and completions are emulated;
  no real credentials, live embeddings/reranking/model calls or remote resources.
- **Source equivalence:** all1000 archived selected memories/23362 blocks/5208
  assembled blocks match canonical raw unions, gaps, roles/names and placement
  without loading the complete source dataset. Input SHA-256
  `488359e6c6d04dd5c7fb01e745034a2a9de68d9f511a1ea54455236366de00a8`
  matches the unchanged assembly parent archive. Benchmark header/date decoration
  differs; no runtime-admission or generated-answer equivalence is asserted.
- **Archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/source-assembly-integration-v1/evidence.tar.gz`.
  SHA-256 `f955d825aee986a8d6475c1ea0a3110f85838cc0d12473b63abf1bac14905426`;
  1,511,952 bytes,66 members, every original byte verified. Report SHA-256
  `5bf99d5a1cef52102105fb1d96dc91cc95e1177a1eec0dd96d6d9eb85ddab524`.
  Adjacent `manifest.json` locks base `ec0834e8641ff4b35f9b348981d89117725ce886`,
  measured/implemented source, plans, outputs, initial failed episodes and one-off
  equivalence helper. Local-only, unavailable in a fresh clone; recorded parent
  oracle archive and pinned host/dependencies are external reproduction inputs,
  not maintained CI requirements. Historical benchmark evidence is not overwritten.
- **Review correction and final reruns:** preparation names source passages and
  assembled memory excerpts separately; final verification/inspection counts
  excerpts, not chunks. A new regression confirms that partial joined-source loss
  still stops generation. Unit333/333, syntax/release/SDK, browser44, fault76 and all
  actual-host delivery cases passed again on the revised source; emulated cleanup
  remains empty. Initial implementation archive/report are unchanged.
- **Review archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/source-assembly-review-v1/evidence.tar.gz`.
  SHA-256 `5212c1c0a1dd26a7c8fdfe2af80c20c8c24e15ff1b6b0d049c4b7d36dc6bb899`;
  507,842 bytes,23 members, each original byte verified. Reviewed report SHA-256
  `fe2162484c458e52d99e3a23012c390e6e5e2508445c8b7149e76f9da51f41a4`.
  Adjacent `manifest.json` locks original implementation commit `4b99d6a9ef6db8d06a1d79c2410660ea3ecc4127`,
  revised code/test/host harness/report bytes and complete repeated-run records.
  Local-only, unavailable in a fresh clone; the initial implementation archive and
  pinned host/dependencies remain external reproduction inputs, not CI requirements.
- **Candidate-join review follow-up:** after PR70 merged, both evidence-index
  additions were retained byte-for-byte. A new review identified that a rejected
  adjacent chunk can fit when assembled with the single selected chunk, even if
  the floor itself saves no tokens. Probe assembled candidates in existing rank
  order; preserve the exact floor if none fits. Existing repeat-packing behavior,
  source validation, whole-source retention, search limits and budgets stay intact.
  Two small regressions cover recovery, invalid hits, boundaries and fail-closed
  counting. `npm test`335/335 and syntax/release/SDK/development syntax passed;
  browser44, fault76 and all13 actual-host delivery cases plus additional packing
  scenarios passed again with local LambdaDB/completion emulators. All reported
  source hashes match; zero remaining emulated collections. No new quality score
  or provider calls. Earlier archives/reports remain unchanged.
- **Candidate-join archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/source-assembly-candidate-review-v1/evidence.tar.gz`.
  SHA-256 `0105691c4cf2845faede89246604f557c2e62fc5f20933853f3589a2c3ba4950`;
  521,575 bytes,22 members, each original byte verified.
  Adjacent `manifest.json` records base `e6f5cb20bdcb6880b9e0f2f0ad2bdc3acff22743`,
  revised source/test/report, follow-up patch and fresh run bytes. Local-only,
  unavailable in a fresh clone; pinned host/dependencies are external inputs,
  not maintained CI dependencies.

## Profile50 actual-host validation

- **Record:** [LongMemEval profile through the actual host](profile-50-host-validation.md).
  Six consumed LongMemEval-S cases completed in pinned unmodified SillyTavern with
  live managed embeddings/Bayesian/Jev/Sol and official frozen judging:6/6 correct.
  Question-only retrieval and memory-plus-question generation; k100/candidate100/
  final50/budget4096. This is a patched ignored test copy, not product defaults,
  full500 reproduction, byte-identical benchmark prompts or held-out confirmation.
- **Audit:** all source slices/revisions, returned documents, assembled source unions,
  request whitelist, provider answers/judgments, cumulative resources and cleanup
  checked. All11 owned collections absent by GET404. One original ungraded answer,
  two inspector-recording failures and period-compatible judge recovery are kept;
  no answer substitution or changed questions. The measured-base product source was unchanged. The same PR now also adopts
  numeric product defaults; it preserves the distinct live input policy.
- **Archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/profile-50-host-validation-v1/evidence.tar.gz`.
  SHA-256 `e64c4b8f4bb38ec6bae551b7ee7ebec4a0b45225ec7004449cc812e893b45ffc`;
  6,190,656 bytes,363 members, every original byte verified. Final report SHA-256
  `400e3e324012c593337c78d2a24ba89babab0ceb21b63e30188c06927ffd1085`.
  Adjacent `manifest.json` records base `718ce65d390c0306b02471b1cb15b9c277dd5850`,
  frozen plans, cumulative continuation, admission observations, all failed/completed
  episodes, independent audit, exact producer sources and experiment-only extension
  patch/copy. Local-only and unavailable in a fresh clone; the recorded dataset,
  pinned host and dependencies are external reproduction inputs, not CI dependencies.
  Prior historical archives are not overwritten or removed.

- **Numeric-default adoption verification:** source k100/candidate100/final50 and
  fresh budget4096 now apply to ordinary memory search. Recent12/query policy and
  safety semantics remain unchanged; saved explicit budgets are preserved. Unit335,
  syntax/release/SDK/development syntax, browser44, final fault77 and delivery13
  passed with actual pinned host/local emulators. No new paid requests or quality
  score. Initial fault-harness saved-budget assumption failure and cleanup0 are
  preserved; the corrected test explicitly sets/checks512 before/after reload.
- **Default-adoption archive:** `/Users/steven/Dev/sillymemory/artifacts/archive/profile-50-default-adoption-v1/evidence.tar.gz`.
  SHA-256 `9aab0672c155c01bc20f79c7708fc3a31e25add7baf891fc464632d81a95995b`;
  750,008 bytes,196 members, every byte verified. Adjacent `manifest.json` locks
  the measured runtime/tests/maintained producers, source patch against base
  `718ce65d390c0306b02471b1cb15b9c277dd5850`, completed/failed reports and notes.
  The original browser producer reconstruction matches its measured hash; final
  fault/delivery hashes match the final measured code. Local-only, unavailable in
  a fresh clone; pinned host/dependencies are external inputs. Prior live archive
  stays immutable; no raw run output or scratch generator enters Git.

## Current-question policy validation

This first snapshot predates the final user-anchor preservation fix. It remains
immutable; use the final validation record below for the submitted runtime.

The PR #72 follow-up indexes completed eligible history independently of prompt
retention, uses current-question retrieval and supplies budgeted clarification
guidance. See [policy, checks and limits](conversation-memory-defaults.md).

- Archive: `/Users/steven/Dev/sillymemory/artifacts/archive/current-question-policy-v1/evidence.tar.gz`
- SHA-256: `67dff888db749ec27ff102cfc33d3e422c2ba53d9b3e2f03c01ee41f295c3b96`
- Manifest: adjacent `manifest.json`, with verified hashes for all 74 members.
- Producing base: `718ce65d390c0306b02471b1cb15b9c277dd5850`; parent
  `e1fe1fc93b619560cda6cf9529066e7060460ed7`, with the included working-tree patch
  and final validated source snapshot. Final documentation pointers follow this
  snapshot. The manifest and runtime hashes identify the measured bytes.
- Includes final unit/browser/fault/prompt-delivery reports, the one-off live numeric
  filter producer and report, and failed harness-attempt reports/logs. Earlier
  failed attempts retain recorded hashes and available output; not every
  intermediate producer source or failed packing request was captured. The final
  delivery producer also records all completion-emulator requests on failure.
- Final browser 45, fault 77 and all 13 prompt-delivery cases passed with no
  remaining emulator collections. Failed attempts can report collections still
  present in the process-local emulator before it shuts down; they created no
  external resources. The live run's one owned collection has HTTP 404 cleanup
  confirmation and an empty pending record. A credential-content scan found zero
  matches in the bundle. No personal chats or `.env.local` are included.
- Availability: local-only. Fresh clones do not have this archive, pinned host
  checkout/dependencies or the private credential file. Maintained CI uses small
  fixed inputs and does not read this archive. The one-off live producer is not
  added to maintained tooling.

This record establishes implementation contracts, not a new LongMemEval score or
actual-model clarification behavior. Prior evidence archives are unchanged.

## Current-question policy final validation

This is the intermediate recent-window runtime at `0f32f15c98a16ad65283c3025fe0f99dda672a6d`,
now superseded by the active-input policy below. It protects the current user anchor
and every following turn when consecutive assistant replies move it outside the
configured recent window. Its reports and original bytes remain unchanged.

- Archive: `/Users/steven/Dev/sillymemory/artifacts/archive/current-question-policy-v2/evidence.tar.gz`
- SHA-256: `e785af7bfa5ca8ae6e0a4a6c02de2b41562184175e1bc4e83880a052a9255ff8`
- Manifest: adjacent `manifest.json`, with verified hashes for all 86 members.
- Same base/parent as v1, with the final source snapshot and patch. Final browser
  `current-question-v4`, fault `current-question-v3` and delivery
  `current-question-v8` source hashes match the included current source.
- Unit 340/340, browser 45, fault 77 and all 14 delivery cases passed; the new real
  host case retains the user anchor and a following assistant turn during
  regeneration with recent=2. Final emulator collections are zero.
- The live numeric-filter check predates the anchor-only fix; its actually imported
  `src/client.js` and SDK bundle are byte-identical to the final runtime. Its other
  recorded runtime hashes are historical, not a new full-host live check.
- All v1 attempts plus final reports and source are retained. The same external
  prerequisites and failed-attempt capture limits apply. Secret-content matches
  are zero; live owned deletion remains confirmed by HTTP 404.
- Local-only; unavailable in a fresh clone and never required by CI. No benchmark
  score or actual-model clarification behavior is established by these checks.

The v1 and earlier numeric-profile archives have not been overwritten or deleted.


## Active-input policy validation

This first active-input snapshot is the runtime at `b80ae5e50b49a752a65bdbab4a1a8a0622df034b`,
before the impersonation fix and empty-selection prepared-token display correction.
Use the final validation record below for the submitted runtime. The maintainer
removed the fixed recent-message window from generation; this snapshot keeps the
active input plus recalled memory and native system/character settings, including
successful empty selections. It does not change source chats,
add a model call or claim a new answer-quality score.

- Archive: `/Users/steven/Dev/sillymemory/artifacts/archive/active-input-policy-v1/evidence.tar.gz`
- SHA-256: `4d453bbf3eb870a59328774ea05a125559b99dd8638f0477b2cb06d62743f62e`
- Manifest: adjacent `manifest.json`, all 351 members verified; 1,944,618 bytes.
- Parent: `0f32f15c98a16ad65283c3025fe0f99dda672a6d`; base:
  `718ce65d390c0306b02471b1cb15b9c277dd5850`. Includes the final working-tree
  source, base patch, producing notes and available successful/failed reports.
  Archive pointers are added to documentation after freezing the source snapshot.
- Final unit340, browser45 (`input-only-v2`), fault77 (`input-only-v2`) and
  prompt-delivery16 (`input-only-v7`) plus overlap/packing/assembly passed.
  Final runtime and harness hashes match their reports; emulator collections0.
  Native character/system settings, current input, no-hit/no-fitting selection,
  replacement-answer exclusion, Continue prefix and failure recovery were checked.
- Earlier attempts retain available logs/reports and recorded hashes; not every
  intermediate producer source was captured. Failed emulator resources were
  process-local and disappeared when the harness shut down; no external service
  resources or paid calls were created in this follow-up. Initial failures were
  stale policy/count/pressure assertions, not actual-model quality failures.
- No `.env.local` or personal chat data. Secret-content scan: zero matches. All
  previous immutable archives are retained unchanged; nothing is removed to shrink
  PR scope.
- Local-only, unavailable in a fresh clone; pinned SillyTavern, dependencies and
  Playwright browser are separate reproduction inputs. CI never reads this bundle.
  The prior numeric-filter live check remains historical evidence for the unchanged
  client/SDK; no new live service or actual LLM clarification behavior was measured.

See [current policy and limits](conversation-memory-defaults.md).


## Active-input policy final validation

The final follow-up anchors native Impersonate on the latest eligible response,
preserving the character turn being answered as the user. Successful empty memory
preparation also displays the counted guidance tokens instead of zero. Neither fix
adds a provider call or changes the numeric search/budget defaults.

- Archive: `/Users/steven/Dev/sillymemory/artifacts/archive/active-input-policy-v2/evidence.tar.gz`
- SHA-256: `07101bcc5b3f0a1a4d8c1cc576182908f7be30fe1ac80b612437f32aa3368891`
- Manifest: adjacent `manifest.json`; all 370 members verified, 2,321,072 bytes.
- Parent: `b80ae5e50b49a752a65bdbab4a1a8a0622df034b`; same base as v1.
  Includes the final source snapshot/base patch and all available active-input
  attempts. Documentation archive pointers are added after freezing the snapshot.
- Final unit340, browser45/fault77 (`input-only-v4`), and all17 prompt-delivery cases
  (`input-only-v9`) plus overlap/packing/assembly passed. Source hashes match final
  runtime/harness bytes. The added actual-host impersonation check preserves the
  last character response, produces a user draft and leaves the chat unchanged.
  No-hit/no-fitting checks compare the prepared token display with host-tokenized
  guidance. Final emulator collections0; no uncaught page errors.
- The first display-check collector read the post-verification excerpt inspector,
  rather than the prepared-token view, and failed with NaN. Its original report is
  preserved; the final collector captures preparation at the final host event.
- No new paid model or live LambdaDB calls. Zero secret-content matches; no
  `.env.local` or private chats. All prior archives remain unchanged. The same
  local-only availability, external prerequisites and intermediate-source capture
  limits as v1 apply; these archives are never CI dependencies.

See [current policy and remaining quality limits](conversation-memory-defaults.md).

## Complete pending-dialogue confirmation

The [confirmation analysis](clarification-context-evaluation.md#complete-pending-dialogue-confirmation)
and [input lock](clarification-dialogue-inputs.json) record all 24 dialogues and
60 final answers, including the unchanged 12-case regression cohort. The new
12-case cohort scores 6/12, 8/12 and 11/12 under the released judge for latest
input, pending user inputs and complete pending dialogue. A complete-set agent
answer audit identifies one false positive in the user-only arm, yielding
6/12, 7/12 and 11/12; original judge outputs are preserved. This is derived
dialogue evidence over already consumed histories, not a new benchmark score.

- Producer base: `e2dd66fb6850df91bbb01d40787521f84301e815` plus the archived
  experimental extension, exact runner, pacing code and preparation scripts.
- Primary archive: `artifacts/archive/clarification-dialogue-v4/evidence.tar.gz`
  in the primary `sillymemory` worktree; 8,327,224 bytes, 36 members; SHA-256
  `e6f59bcce453b0cdc55325c2a8dd9249fc567cbfdf871cd9a7387e7c57343d32`.
- Manifest: `artifacts/archive/clarification-dialogue-v4/manifest.json`; SHA-256
  `ac8f6910784b39ff01c72403bd5703ca1a71a4c532427fd17347d4a153b934d4`.
  Each member was read back and checked against its source bytes. Exact configured
  API-key scans found zero matches. The v1/v2/v3 archives remain byte-identical.
- Retains the pre-run plan, source/settings hashes, original 50 MB report, all
  queries/prompts/provider replies/grades, all 60 audit dispositions, native
  state/delivery observations, cleanup receipts, input locks, and producer
  dependencies. Audit metadata explicitly corrects inherited query/delivery
  descriptions without modifying the original plan or report.
- `protocol-audit.json` beside the archive corrects additional inherited v2/v3
  plan prose (`queryProtocol`, `hypothesis`, `liveProtocol`, `captureProtocol`).
  The frozen `scope`, per-case queries, bounds, decision gate and producer hash
  define v4. All 60 recorded final vector/reranker queries independently match
  those exact frozen turn lists and queries. The sidecar SHA-256 is
  `cf2b47deaeca2b4ee3eaede6f0bc5e535a720fc5c8602ef6f90cb442ac03e952`;
  it supplements the original archive without overwriting it. The maintained
  lock's recording note explains this correction.
- Actual pinned SillyTavern, live managed LambdaDB and live Sol final delivery;
  69 controlled prefix replies plus 60 paid final answers and 60 paid judge calls.
  All 129 native observations use only their current selected memory; all 60
  terminal replies close the pending root. Controlled prefixes do not establish
  automatic ambiguity detection or production lifecycle safety.
- 14,101 document submissions, 1,702 LambdaDB requests, 15 owned collections,
  all deleted with HTTP 404 verification. No pending ownership file remains,
  no browser-stored keys, and the original host extension link is restored.
  One initial LambdaDB gate HTTP 503 recovered through bounded polling; provider
  attempts are exactly 120 with no Sol/judge retries or admission waits.
- Local-only, ignored, unavailable in fresh clones and never a CI dependency.
  The full dataset remains in the existing checksum-locked source archive;
  pinned host/dependencies and fresh credentials are external reproduction
  inputs. The prototype is not installed as a new product default.

## Clarification context live diagnosis

The [decision record](clarification-context-evaluation.md) preserves the six-case
current-policy diagnosis, all nine derived flow comparisons, native Sol flag
transport checks, interpretation limits and the decision not to change defaults.
The base is `15c781289aff2448ed5e7afce595d677121f7479`; the pinned host is
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Prototype retention changes exist
only in the captured runtime copy and producer, not maintained runtime code.

- Primary local archive: `artifacts/archive/clarification-context-v1/evidence.tar.gz`
  under the primary SillyMemory worktree; 27,877,845 bytes, 46 members; SHA-256
  `48263f0dece357b45de830898b4f2c056df33305bbe2b031f3cefd51fa092705`.
- Manifest: `artifacts/archive/clarification-context-v1/manifest.json`; SHA-256
  `a12e36987451a32fa76e4c2df9e03f7102a2b112590919ae9813ee367b3ec669`.
- All original plans/amendments, exact producers with verified locked hashes,
  pacing helper, prototype source/patch, raw native dispatched prompts/provider
  replies/queries, interruption records, resumed comparisons, schema probes and
  compact summary are retained. Every archived member was read back and matched
  to its original SHA-256. Credential-content scanning found zero matches.
- The checksum-locked original dataset remains in the prior local failure-discovery
  archive at the plan's recorded path; its SHA-256 is
  `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
  The new bundle does not duplicate the entire dataset or include environment files,
  private host/browser profiles or credentials. All 11 owned collection creations
  were deleted and HTTP 404 verified; no cleanup obligations remain.
- These artifacts are local-only, ignored, unavailable in a fresh clone and not
  dependencies of maintained tests or CI. Historical evidence archives are unchanged.

## Generation-only clarification dialogue policy completion

The [generation-only policy decision](clarification-context-evaluation.md) supersedes
the initial diagnosis's promotion inference while preserving its original evidence.
The [small input/settings lock](clarification-context-policy-inputs.json) keeps
twelve paired dialogue cases and six live user profiles; no producer or large run
fixture becomes a maintained CI dependency. This narrower generation-only evaluation
did not meet its promotion gate. It is not a decision against accumulating retrieval queries; the corrected combined
scope below was subsequently integrated; see the production receipt.

- Primary local archive: `artifacts/archive/clarification-policy-v2/evidence.tar.gz`
  under the primary SillyMemory worktree; 56,483,051 bytes, 60 members; SHA-256
  `98ce27c5987ae6639bc6833e1e4db717b9033f0ddf5f6a6b5dcd1b28777e9d5b`.
- Manifest: `artifacts/archive/clarification-policy-v2/manifest.json`; SHA-256
  `b19285a4ad052ab9f1d0aa8fbd71716a8444ba322138035cb3fff261a63d0422`.
- Producing revision: `475dee672722dd947b60af69ba8b22510be1ed8d`; pinned host
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Exact prototype/runtime patches,
  producer hashes, initial plan, interpretation lock, native-stage amendment and
  arm-blind response router are retained. The router was frozen before live calls
  while the paired stage was running; this is not an independent benchmark cohort.
- Raw captures, full native prompts/transcripts/provider replies, official judge
  receipts, status observations, local state-contract reasoning, summary and all
  cleanup receipts are retained. Twelve capture replies are explicitly emulated;
  36 paired answers replay actual captured LambdaDB rankings, and 14 native live
  answers use actual queries/plain generation. All 50 answers and 50 judge calls
  completed without retry or harness recovery.
- Every archived member was read back and matched to its original checksum; exact
  producing-script hashes and the live router lock were verified. Secret-content
  scanning found zero matches after correcting a local scan-command syntax error;
  no environment files or private browser/host profiles are included. All 14 owned
  collection creations were deleted and HTTP 404 verified, with no outstanding cleanup.
- The original dataset remains checksum-locked in the prior local failure-discovery
  archive, not duplicated in this bundle. Both this archive and the initial
  `clarification-context-v1` archive are local-only, ignored, unavailable in fresh
  clones and never CI dependencies. Historical evidence was not deleted or rewritten.

## Clarification query accumulation

The [corrected evaluation](clarification-context-evaluation.md) preserves the
maintainer's intended retrieval-and-generation accumulation and supersedes any
application of the earlier generation-only defer conclusion to that combined
policy. The same twelve frozen cases score **8/12 → 12/12** when only retrieval
query construction changes and generation keeps the complete pending dialogue.
All four lost user facts are restored within the unchanged 4,096-token budget.
At this historical stage production defaults were unchanged; the later production
receipt records integration.

- Primary local archive: `artifacts/archive/clarification-query-v3/evidence.tar.gz`
  under the primary SillyMemory worktree; 63,263,044 bytes, 33 members; SHA-256
  `1db2fad3cd2aa0e9b453656dc007b683e6a0392c0264b8a347f4afa30c6d50a4`.
- Manifest: `artifacts/archive/clarification-query-v3/manifest.json`; SHA-256
  `c41a8f495a59a1bc22c9cec13d12516b7e08e5fb5635b21b94469460603e9caa`.
- Producing base: `80dab585491fb3cccdc840c1140fa86544465b95`; pinned host
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Exact prototype/runtime files,
  three producer scripts, frozen plans, phase bounds, provider pacing and summary
  are retained. Full benchmark source stays in its prior checksum-locked archive.
- Capture stage: 24 actual-host/live managed LambdaDB queries with emulated
  completions. Known pending roots isolate query construction; assistant turns
  are excluded from the accumulated search string, retained in generation.
- Paired answers: 24 unchanged captured host requests sent to Sol and 24
  released-judge/custom-absence calls. All 48 attempts completed without retries
  or rate-header waits. This does not re-run native paid reply delivery.
- Lifecycle stage: twelve actual-host flows with live managed retrieval and 39
  controlled status replies. They verify opening without a seeded root, repeated
  accumulation and terminal closure. Final answer text is reused from the paired
  stage, not generated anew against that stage's ranking; automatic model status
  classification, mutation/isolation and provider integration are not established.
- Total: 11,989 document submissions, 970 LambdaDB requests and 14 owned
  collections, all deleted with HTTP 404 verification. Browser storage and exact
  archived bytes contain zero key matches. Every archive member was read back
  and matched to its original checksum. No environment/private host profiles are
  included. The inherited broad audit report label is qualified by its explicit
  zero paid-call count; it is not live-answer evidence.
- The archive is local-only, ignored, unavailable in fresh clones and never a CI
  dependency. Earlier v1/v2 evidence archives were neither removed nor rewritten.

## Clarification production integration

The [adoption record](clarification-context-evaluation.md#production-adoption)
completes PR #73's response/state integration, rather than treating another
diagnostic run as a separate merge milestone. Maintained runtime and small native
host/unit scenarios stay in Git; the bounded live producer and detailed evidence
remain ignored.

- Primary local archive: `artifacts/archive/clarification-production-v1/evidence.tar.gz`
  under the primary SillyMemory worktree; 1,038,847 bytes, 70 members; SHA-256
  `df1bd4111075221b1700b0e8b430439a9a65c3d4d8968e0b13afe76b70aafa43`.
- Manifest: `artifacts/archive/clarification-production-v1/manifest.json`; SHA-256
  `1a071305b0c91d5661ede9ad970713ba8c157e5617649d84c030c78c761030de`.
- Producing base: `47824651f1ac7b35d3bfe68e762e56bee72965db`; pinned host
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Exact paid-run runtime snapshot,
  frozen plan, ten native prompts/replies/statuses, queries, selected memory,
  source/cleanup receipts, one-off producer and pacing implementation are retained.
  The plan SHA-256 is `67c3303ea0eb00dc4423307a9150f73dd88430d2aff53f288bed95567a59ab90`.
- Final runtime/test sources and patch, 351-test receipt, 66-check host emulator
  report and 78-check fault report are included separately. The fault run disables
  continuity to isolate existing synchronization/cancellation contracts. Final YAML
  override-shape guards were added after the paid run and verified with unit/native
  emulator tests, not additional paid calls. Intermediate failure logs preserve the
  fixed stream event-ordering defect and harness reload/expected-stop corrections.
- All ten live statuses match the frozen expectations; three known-fact answers
  supply their references. This functional gate has no judge calls and is not an
  official benchmark score. All three created collections were deleted/404 verified;
  no credentials remained in browser storage. All archive members were read back
  byte-for-byte, and an exact credential scan found zero matches. No environment
  file or private browser/host profile is included.
- Local-only, ignored, unavailable in fresh clones and not a CI dependency.
  Earlier v1/v2/v3/v4 clarification evidence remains intact. Production scripts
  do not depend on those private archive paths.

The final review correction excludes the full pending span in both remote search
legs before bounded ranking, and skips search for a root at message zero. This
prevents retained dialogue from displacing older evidence in the returned slots.
It was validated with 352 unit tests and 67 actual-host emulator checks, including
the native query boundary; no paid answer-quality run was repeated.

- Follow-up archive: `artifacts/archive/clarification-production-review-v1/evidence.tar.gz`
  under the primary worktree; 39,846 bytes, eight members; SHA-256
  `a219c8c4a43740e303a2ddcb6811080cc2a82d2af71239ace94b689bc62c7956`.
- Manifest: `artifacts/archive/clarification-production-review-v1/manifest.json`;
  SHA-256 `f8c9f2700922713bf8cc4a233c8506c8bfda5c9ee57e24507e82d925a90fddd0`.
- Base `f1c9e253d1fb8170365e7ea2ab4ceb57904733f1`; exact source/patch and final
  emulator/unit receipts retained. Byte-for-byte archive read-back and credential
  scanning passed. Local-only, ignored and unavailable in fresh clones. The paid
  production snapshot and all previous archives remain unchanged.

A second review correction removes owned incomplete protocol placeholders from
later generation prompts, independently of storage eligibility, while preserving
the native recovery UI. Deferred completion also ignores a reply deleted before
recovery. Both pending and post-terminal actual requests omit the placeholder.

- Follow-up archive: `artifacts/archive/clarification-production-review-v2/evidence.tar.gz`
  under the primary worktree; 46,027 bytes, ten members; SHA-256
  `76e9bb16f0532237e85d15cf3b5663efa362e71a93a34108f31f7440e371b65c`.
- Manifest: `artifacts/archive/clarification-production-review-v2/manifest.json`;
  SHA-256 `a0f80b5e0fc2a19721610cd1e9ec680a138416f577372b85676f3705ae33e4b3`.
- Base `5d9abfe234aaae83e7fdc96deea9c3815c0ec9b0`; exact runtime/test sources,
  patch, 353-unit-test receipt and 69-check native-host emulator report retained.
  Archive byte-readback and credential scan passed. No paid rerun or new answer
  score; previous archives remain unchanged. Local-only and not a CI dependency.

The final state-safety review adds recovery for a chat already open at initialization,
plus candidate hashing before native reply mutation. A source edit or ownership
change during hashing leaves raw text and its in-flight marker recoverable.

- Follow-up archive: `artifacts/archive/clarification-production-review-v3/evidence.tar.gz`
  under the primary worktree; 47,755 bytes, ten members; SHA-256
  `71cf8e2409fae92cba75b75a2bef57bb6ecc1adff7f683a0fcba483ae035527c`.
- Manifest: `artifacts/archive/clarification-production-review-v3/manifest.json`;
  SHA-256 `6fbd7f415567f905700ed77f12b9c62faa35ee26f2185d378b8b459be1a4af91`.
- Base `3e941c33383672d59ef4e082e4c8c5bfabbbcd44`; exact sources/patch,
  355-unit-test receipt and 70-check native-host emulator report retained. The
  startup fixture delays extension initialization until native auto-load has opened
  the marked chat, proving recovery without a later chat switch. Unit tests change
  source/ownership while the real asynchronous digest is pending, without replacing
  global crypto or changing other tests' state. Archive read-back and credential
  scan passed. No paid rerun; prior archives remain unchanged. Local-only and not CI.

The final target/recovery review limits the reply protocol to the actual nonempty
plain-user insertion/replacement target. Blank or special active inputs cannot
redirect it to an older eligible user/assistant pair. Non-streaming completion now
establishes the same recoverable in-flight marker before asynchronous validation.

- Follow-up archive: `artifacts/archive/clarification-production-review-v4/evidence.tar.gz`
  under the primary worktree; 66,577 bytes, thirteen members; SHA-256
  `8c747c221c1a6c386076a6eea35ec012913a2d520203358f171ad74abacfe541`.
- Manifest: `artifacts/archive/clarification-production-review-v4/manifest.json`;
  SHA-256 `8e0bab0a4726eec01df6d0553f5124368411b42a986dcac0cf1550610559abc3`.
- Base `9c2bfcc37030d1badf4e44ad52b31aa3fbb98b34`; exact sources/patch,
  356-unit-test receipt and 71-check native-host emulator report retained, including
  plain native generation after a blank active input. File/media/tool target guards
  are unit evidence, not live attachment/provider support. Ownership-loss recovery
  is tested for streaming and non-streaming replies. Intermediate non-streaming
  recovery receipts are retained too. Archive read-back and credential scan passed;
  no paid rerun. Prior archives remain unchanged; local-only and not a CI dependency.

The request-ownership review binds preparation and cleanup to one interceptor
attempt. A late older failure cannot clear newer state, and an invalidated digest
cannot install a stale prepared request. These concurrency invariants are focused
unit evidence; normal native-host integration remains a separate check.

- Follow-up archive: `artifacts/archive/clarification-production-review-v5/evidence.tar.gz`
  under the primary worktree; 47,310 bytes, ten members; SHA-256
  `5918e674b8b2b1fc78098901483a12494a22087ea80b6c0a7fbd95e1f86eb3e7`.
- Manifest: `artifacts/archive/clarification-production-review-v5/manifest.json`;
  SHA-256 `ba7cd2d99e4242f45f4a8eed806174b22b6631112fbce16485f93a86033588a4`.
- Base `b911b94677038b397bdfaa3b8ec31672d74bd4e7`; exact source/patch,
  358-unit-test receipt and 71-check native-host emulator report retained.
  Archive read-back and credential scan passed; no new paid run or quality score.
  Prior archives remain unchanged; local-only and not a CI dependency.

The source-position recovery correction turns stale owned assistant markers into
visible incomplete recovery state with no stale root. Stream writes remain bound
to the original reply object; re-authored user/system text is preserved.

- Follow-up archive: `artifacts/archive/clarification-production-review-v6/evidence.tar.gz`
  under the primary worktree; 48,891 bytes, ten members; SHA-256
  `93a3ed75ba0aa34d3c3748c674cbd09e52dc4a6c50aa1ca09b3f7f72e8ad9161`.
- Manifest: `artifacts/archive/clarification-production-review-v6/manifest.json`;
  SHA-256 `5df4b97458d010b27d85ac8661346a2c0d84f384b564fa34a0887a9e4b8a02c2`.
- Base `e2313e6a58324a4d791898568bcd3ee5aabef7f9`; exact source/patch,
  361-unit-test receipt and 72-check native-host emulator report retained.
  Archive read-back and credential scan passed; no paid rerun or new quality score.
  Previous archives remain unchanged; local-only and not a CI dependency.

## Saved browser connection verification

The candidate replaces session-only keys with explicit Save and connect and
verified automatic reconnection. Native account and exact endpoint/project
scoping, enabled/disabled retention, blocked tabs, 401 removal, transient-error
retention and complete Forget key are verified without real credentials or paid
provider calls. Original session-only acceptance remains historical evidence.

- Archive: `artifacts/archive/saved-connection-v1/evidence.tar.gz` under the
  primary worktree; 122,774 bytes, 30 members; SHA-256
  `694550c0c740cf827dcf3e5688060da71f9bfbb0b830ec98007c58db391cc297`.
- Manifest: `artifacts/archive/saved-connection-v1/manifest.json`; SHA-256
  `3144e25dd3a49dc0e9ee7f4ecb7034c31be7d8b12cfb1dbad234b223bcd5f741`.
- Base `15c781289aff2448ed5e7afce595d677121f7479`; dirty patch and new runtime/test
  sources retained with 346-unit, 52-browser, 84-fault and 17-delivery receipts.
  Intermediate browser failures and the generation runner's missing-env preflight
  are retained; no provider run is claimed. Earlier fault/delivery snapshots precede
  the final storage-error sanitization and unsupported-lock UI guard; final browser
  and unit receipts include them. Archive byte-readback passed.
- All emulator runs ended with zero remaining collections and no browser errors.
  Local-only, ignored, unavailable in fresh clones and never a CI dependency.

The review correction preserves the previous validated key when an explicit
candidate is rejected. Only the exact restored endpoint/project/key can be removed
after failed validation. Final verification passed 347 units and 53 native-host
emulator checks, including a different-project rejected candidate and successful
password-free recovery of the prior connection. No paid calls or real keys.

- Follow-up archive: `artifacts/archive/saved-connection-review-v1/evidence.tar.gz`
  under the primary worktree; 53,384 bytes, 13 members; SHA-256
  `e5c3ee9836795344c97b373ce05029d5cac2ac0066fc0e7dcb07bdbc87d39dfe`.
- Manifest: `artifacts/archive/saved-connection-review-v1/manifest.json`; SHA-256
  `a246a6989b6010cd07bb57f99c4b7c7101ba1f94d49ee1bfcb69a4e8ca5d58e6`.
- Base `fc5191e69abee1568363e34fd25a85ab90beaba0`; exact sources/patch and
  reports/logs retained, including an intermediate assertion requiring lowercase
  wording. Byte-readback passed; original archive unchanged. Local-only and not CI.

The final removal review makes Forget key independent of ordinary connection
settings. A deliberately lost settings record cannot leave its separate account
credential behind. An explicit retry after transient reconnection failure restores
the saved enabled preference after authentication. Final units: 347; native-host
emulator checks: 54; no browser errors or remaining collections; no paid calls.

- Follow-up archive: `artifacts/archive/saved-connection-review-v2/evidence.tar.gz`
  under the primary worktree; 37,894 bytes, 8 members; SHA-256
  `fcae192749eec8bca3ffb74a15beb2817060131d77a43feacfa6d69a865bdeff`.
- Manifest: `artifacts/archive/saved-connection-review-v2/manifest.json`; SHA-256
  `86f466163e2b96b549660e684213c60bb82d08da3d4189a5e6aa02c9cac8545a`.
- Base `af241c0d1f35da8274eba0f83574580383dd6ab2`; exact sources/patch and
  verification receipts retained. Byte-readback passed; all previous archives
  remain unchanged. Local-only and not a CI dependency.

The storage-failure review writes ordinary settings before replacing the key,
restores their exact previous bytes if credential storage fails and adopts runtime
state only after both writes succeed. Unit tests independently cover settings-write
failure, credential-write failure, failed initial save and unavailable rollback;
a scoped native browser quota fixture restores its prototype in a finally block.
Final units: 350; native-host emulator checks: 55; zero browser errors/remaining
collections; no real keys or paid calls.

- Follow-up archive: `artifacts/archive/saved-connection-review-v3/evidence.tar.gz`
  under the primary worktree; 41,493 bytes, 10 members; SHA-256
  `d5592de1c1a12a9073a42765f3a0c673db9cc54d48c857975f1dc8955546ab57`.
- Manifest: `artifacts/archive/saved-connection-review-v3/manifest.json`; SHA-256
  `f8f5f3ee933e70859a99c10e14a19ac1d7b4c545d6c41f145757748032ceb221`.
- Base `47057276f0cae1f75ef00f4a90ba7d873b7c7632`; sources/patch and
  verification receipts retained. Byte-readback passed; all prior archives
  unchanged. Local-only and not a CI dependency.


The post-PR #73 merge revalidation preserves both product behaviors. Final units:
371; actual-host browser/completion/LambdaDB emulator checks: 83; fault checks: 88.
No page errors or remaining collections, real keys or paid provider calls. The
initial auto-load fixture failure and diagnosis are retained alongside the fixed
fixture and final reports; see [combined validation](saved-connection.md#integration-with-clarification-continuity).

- Integration archive: `artifacts/archive/saved-connection-integration-v1/evidence.tar.gz`
  under the primary worktree; 114,911 bytes, 35 members; SHA-256
  `cad8aef6d98ee01bd9215036556b545ccc3a66e0426f39a8f72ccf569a34470b`.
- Manifest: `artifacts/archive/saved-connection-integration-v1/manifest.json`;
  SHA-256 `36da33024df8a04d31a119ffef24f0b0ac69024629a57d304ba014fc8ca8da1f`.
- Topic base `f9252389f7ac78f9fbef18540f4c9991871ee54c`, develop base
  `effc2211724280dc49e664800124356c847e3f2f`; dirty integration patch, exact
  source files, complete reports and logs retained. Every archived member was read
  back and matched to its source. The manifest records the initial manually copied
  fault count correction; the unchanged run report is authoritative. Initial bytes
  and all prior archives remain preserved. Local-only, ignored, unavailable in a
  fresh clone and never a CI dependency.

## Recent dialogue retention

The [decision and complete interpretation](recent-dialogue-retention.md) records
Retain 5 as a native source-delivery/usability contract. Two known ordinary
follow-up failures are restored on replay; the independent twelve-case cohort
scores 11/12 in both conditions. The 24 regression reference matches change from
23/24 to 24/24 only on the already interpretively ambiguous Target coupon case,
without new linking evidence. Do not claim independent quality superiority.

- Primary archive: `artifacts/archive/recent-dialogue-retention-v1/evidence.tar.gz`
  under the primary SillyMemory worktree; 13,211,182 bytes, 82 members; SHA-256
  `fc8412bc5fe36792724d872b535b3a926b26360652208e0977a7093d4520b9c8`.
- Manifest: `artifacts/archive/recent-dialogue-retention-v1/manifest.json`;
  SHA-256 `36070476ae9b1ae399c191053fe5a885a73750ece6d4f841c6e89a1ccc345b98`.
- Producer base `a728fc81e47398e23393c685904d23cdcc00016c`; dirty final patch,
  maintained source/fixtures, exact isolated experimental extension with its
  count-only control, source/settings/input locks, pacing/runner/preparation source,
  all phase plans/amendments, all 76 final answers/queries/prompts/provider receipts,
  92 controlled prefixes, complete answer audit, native observations and cleanup
  receipts are retained. The two discovery replays are mechanism checks, not a new
  confirmation cohort. No paid judge or quality retries were used.
- Retains the failed regression source-hash preflight and initial delivery failures.
  Regression inputs/references did not change: the full dataset hash and all 24
  raw source hashes match the archived v4 producer. Its original dataset stays in
  the existing checksum-locked failure-discovery archive; it is not duplicated.
- Final validation: 375 units, 82 browser, 88 fault checks and 17 delivery scenarios
  with local emulators. Live calls: 76 attempts, 667,734 admission tokens (not billed
  usage), 2,234 LambdaDB requests and 26,888 document submissions. All 32 owned
  collection creations, including gates/preflight, were deleted and HTTP 404 verified.
  Keys were removed from browser/native settings and contain zero report matches;
  temporary profiles/servers were removed and the host link restored.
- Every archive member was read back and matched to its source bytes. Earlier
  archives and original failure outputs remain unchanged. Local-only, ignored,
  unavailable in fresh clones and never a CI dependency. This is neither an
  official LongMemEval score nor a release/main deployment.


The active-position review correction separates native generation retention from
query eligibility and replacement suffixes, preserving the existing query range.
Final validation passes 377 units, 86 browser, 91 fault checks and 17 delivery
cases, with no page errors/resources. File/media/tool metadata is tested at the
native hook and blank input through actual native generation; real uploaded-file
or multimodal provider processing is not newly certified. No paid calls; earlier
eligible-normal evaluation paths remain unchanged.

- Follow-up archive: `artifacts/archive/recent-dialogue-retention-review-v1/evidence.tar.gz`
  under the primary worktree; 102,667 bytes, 22 members; SHA-256
  `85fe8dfc071712ac6a817c239304e198b3224ff4d56343f5da17402a8eec8792`.
- Manifest: `artifacts/archive/recent-dialogue-retention-review-v1/manifest.json`;
  SHA-256 `c2044df69c57564166a77e7c95b6e6dfb66519b76f0efec96f6ffbbddca16cc9`.
- Base `02b73475de7c159d75ef393e16ac796e99e074a4`; exact correction sources,
  patch and verification receipts retained with byte-readback. Original archives
  are unchanged; local-only, ignored, unavailable in fresh clones and not CI.


## Recent query and storage

`recent-query-storage-v1` preserves the completed follow-up to Retain 5: all
36 Sol final answers, 48 controlled native prefixes and 84 delivered prompts,
managed LambdaDB request/response and cleanup receipts, all three frozen conditions,
the ignored producer/experimental extension, agent answer audit, original plans,
local failures, current native browser/fault/delivery reports and logs. The source
dataset remains in its existing checksum-locked archive and is not duplicated.
No configured credentials or personal conversations are included.

- Producing base: `f39a567eb8b688d06a979be498100cd3f1aae249` plus
  `checkout/changes.patch` and the snapshotted changed source/new input lock.
- Local archive: `/Users/steven/Dev/sillymemory/artifacts/archive/recent-query-storage-v1/evidence.tar.gz`.
- SHA-256: `13c37f783d456b1a2dd0b0f7df4466ad45d233decd8f46f42e0f2a1793219219`;
  5,949,095 bytes, 66 members.
- Manifest: same directory, `manifest.json`; SHA-256
  `ebc809357315e6d8c90e9c55d1502d43446e857ef78d32f47e740db75c84e09f`.
  Every member's original bytes were read back from the archive and verified.
- Availability: ignored local-only evidence, not downloadable from a fresh clone
  and not a CI dependency. The existing Retain 5 and review archives are unchanged.
  This index's receipt append follows archive creation; the final committed index
  supplies the archive location without a self-referential archive hash.

[Decision, interpretation and limits](recent-dialogue-retention.md#query-2-and-immediate-archival-follow-up)
and the [frozen follow-up lock](recent-query-storage-inputs.json) are maintained in
Git. Only the small fixed correctness inputs remain in CI; no raw provider answer,
large prompt/result fixture, private path dependency or one-off generator is added.


## Complete-pair archival

`complete-pair-archival-v1` preserves the pair-boundary refinement's exact dirty
source/patch, unit/native browser/fault/delivery results and failures, all live
synthetic query attempts and controlled-completion producers, the request-budget
recovery cleanup, completed SDK write comparison, and offline 28-state normal
source/query parity. No new paid generation/judge quality run is claimed. The
original Retain 5 and 36-answer Query 2 archives are preserved unchanged.

- Base: `50ba01decff406a2e70ce8ff3de6f0d7cec67dad` plus `checkout/changes.patch`.
- Local archive: `/Users/steven/Dev/sillymemory/artifacts/archive/complete-pair-archival-v1/evidence.tar.gz`.
- SHA-256: `6a02c01c3597ddbccd7355a1d62d165282a1ff1b4aa25b6bfed6bbc02cac37ad`;
  903,753 bytes, 81 members, each read back and verified against original bytes.
- Same-directory manifest SHA-256:
  `a390372685cdbb60f8b2eb0359bdb6472dfe1458121a9bdf8e9e8d44626ce195`.
- Availability: ignored local-only evidence, unavailable in a fresh clone and not
  required by CI. The index append follows archive creation; no self-reference.
- All eleven live diagnostic/SDK collections have verified deletion and absence,
  including the two recorded in `write-verification-1/recovery-cleanup.json`.
  Earlier failed reports are preserved rather than silently rewritten as success.
  Their inherited live-Sol wording does not establish a model call: all generation
  counters are zero, as clarified in the [interpretation](recent-dialogue-retention.md#complete-pair-archival-refinement).

The maintained tests use small fixed synthetic sources and expected message-index
pairs. One-off live producers, full prompts, raw service errors and cleanup records
remain in the archive; no permanent experiment runner or large fixture was added.
