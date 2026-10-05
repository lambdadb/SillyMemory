# Managed reranker adoption decision

## Closed decision — 2026-10-05 KST

Keep the existing vector retrieval and 800-token default. Do not introduce a Jev
setting or shared-question reranking into the product in this change. The official
SDK/CORS integration works, and hybrid + Jev rescued specific difficult facts, but
these experiments did not establish a reliable semantic answer improvement without
regressions. Query latency was not the reason for this decision.

This closes PR #63's adoption review, including its final generation diagnostic and
retention cleanup. It is not a claim that rerankers are ineffective. Reopening the
product decision needs a concrete new requirement or evidence, not another rerun of
these authored cases until the score passes. No temporal schema or message-time
heuristic is added: message order does not establish the time of an event.

## Core results

| Stage | Comparison | Finding | Interpretation |
| --- | --- | --- | --- |
| Initial 12 cases | Vector / vector + Jev | Required evidence 12/12 each; exact matches 4/12 / 5/12 | Apparent gain was wording only, with no semantic gain |
| Known eight diagnostics | Vector / hybrid + Jev | Correct answers 6/8 / 8/8 | Rare-name and paraphrase misses rescued |
| Six new confirmation cases | Vector / hybrid + Jev | Correct answers 4/6 / 5/6 | Two gains, one baseline-correct answer lost; no-regression gate failed |
| Shared-question, 14 known probes | Original hybrid + Jev / shared-question hybrid + Jev | Tagged fact injected 14/14 each | Medicine secondary rank improved 30 → 1, with no delivery gain in this run |
| Five targeted answer pairs | Original hybrid + Jev / shared-question hybrid + Jev | Correct answers 5/5 / 4/5 | UNKNOWN despite the full medicine fact in the final prompt; answer gate failed |
| Final fixed-prompt diagnostic | Original full / shared full / shared relevant-only | 6/6 / 6/6 / 6/6 correct | Historical miss did not reproduce; no demonstrated benefit from removing distractors |

The initial answers shared an unsupported elaboration: both changed “blue tin” to
“blue paint tin.” Eleven other cases had supported answers. The exact-match gain
was “Theo was the orchard gardener” versus “Orchard gardener,” both correct. Preserve
that distinction; a format-sensitive score is not an adoption decision.

Hybrid + Jev's positive evidence is real but narrow. It rescued the known rare-name
and semantic cases, retained the six baseline-correct diagnostic answers, and
recovered a correction omitted by unreranked hybrid. In new confirmation it rescued
rare-name and exact-ticket answers, while losing the medicine-location answer.
Journal, revocation and historical-state answers were correct in both arms.

## What the failures mean

In the confirmation run, the medicine fact was absent from the primary top 30.
The secondary vector list ranked it second; hybrid fusion put it in a tied 25–30
range and Jev ranked it 30. The secondary relevance query was a neutral prior turn,
not the medicine question. The loss was candidate ordering/packing, not an edited
or deleted fact leaking back. Do not attribute the entire vector 2 → reranked 30
change to Jev; hybrid had already demoted it.

The next frozen comparison evaluated both hybrid lists against one current question
plus labeled reference context. Within that run all 14 paired candidate sets
matched, and only rerank.queryText changed. The medicine secondary rank improved
30 → 1, from score 0.3285 to 0.8925. However, its primary list now also contained the
fact and ranked it first in both arms. Relative to the prior run, each hybrid list
shared only 29/30 passage texts despite identical conversation source hashes. The
source of that cross-run candidate drift was not established; do not label it an
ANN defect, lexical-tie defect or reranker defect on this evidence.

Both final medicine prompts contained the complete BIRCH-CUPBOARD statement. Memory
used 776 tokens in the original arm and 764 in the shared-question arm, below 800.
Other selected distractors and speaker patterns differed. The original answer was
correct; the shared-question answer was UNKNOWN. This is a generation failure with
evidence present, not missing injection or budget exclusion. Rare-name, correction,
revocation and historical-state answers remained correct in the other four pairs.
The six newly frozen reference/temporal confirmation cases were not run because
the diagnostic answer gate failed.

## Final generation diagnostic

Replay the two stored actual-host medicine requests with identical message arrays
and recorded options; for the third arm, remove past-excerpt messages without the
medicine fact from the shared-question prompt. Keep the intact fact, speaker label,
system messages, recent turns and question. This third arm uses **oracle selection**:
it is a mechanism diagnostic, not an implementable retrieval improvement.

Each arm has six scheduled calls, in all six permutations of arm order. The protocol,
runner, source report and request hashes were frozen before traffic. The cap was
18 scheduled answers/22 attempts, up to four transient retries, 15-second start
spacing; no successful-answer retry or post-result prompt tuning. All 18 calls
completed without retries; every answer was exactly BIRCH-CUPBOARD.
Input/output totals were 5,700/36, 5,628/36 and 1,362/36 respectively. The lower
third-arm input reflects oracle removal, not a measured product token saving.

These are **direct OpenAI replays of retained SillyTavern requests**, not another
host integration or LambdaDB run. No remote memory data was created. Six repetitions
per arm do not estimate general reliability or establish that distractor removal
helps. The historical UNKNOWN remains in the evidence; it is not replaced by a
successful repeat. The historical failed request and the successful replays have
the same recorded messages/options. Fingerprints were stable within each replay arm but differed
between arms; the historical host report did not capture that field. These data
cannot separate model variability from backend changes across runs, or prove that
the surrounding excerpts caused the earlier miss. No further paid sweep is needed
to close this non-adoption decision.

## Shared method and practical limits

The three earlier stages used real SillyTavern 1.19.0, revision
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, browser CORS, SDK 0.7.0 and live LambdaDB
managed embeddings/Jev `jev-1.13.0`. Answers went through the actual host and its
local test forwarding bridge to OpenAI. The staged answers replayed exact captured
live candidates with query/owner/scope/branch identity and final-prompt checks.

All stages used gpt-4.1-mini-2025-04-14, temperature 0 and output cap 256. Host runs
kept a 32K context, recent=4, memory budget=800, k/size/candidateSize=30, existing
chunking/interleaving, explicit chat branch, owner/scope filters and consistent reads.
Default Jev criteria were used. Tagged-fact coverage is not complete semantic
coverage; earlier statements can independently answer some historical questions.

Initial vector/Jev median query latency was 322/673.5 ms; confirmation vector/hybrid
+ Jev latency was 344/665.7 ms; the shared-question comparison's two hybrid arms were
765.6/766.7 ms. Initial input/output totals were 11,310/69 and 11,260/71; confirmation
5,767/19 and 5,755/26; shared-question targeted pairs 4,744/22 and 4,733/17. These small
differences do not demonstrate cost savings. Managed embedding/reranker costs were
not measured. Compact synthetic dialogues, explicit temporal wording and single
host-answer pairs are not a public benchmark or natural 32K-overflow evaluation.

## Validation and retained changes

The earlier stages completed 24, 28 and 10 actual-host answers, without retries.
The latter two completed 44 and 42 live probes. They verified 461 and 438 selected
passages against local source; all rerank responses were applied. Three owned
collections per run were deleted and independently verified absent; no cleanup
ledger remains unresolved.

The initial raw report still records a teardown failure caused by an obsolete UI
completion phrase. Separate read-only verification confirmed all three collections
404 and owner lists empty, with no recovery deletion. Its final hash map also omitted
src/delivery.js despite a matching initial plan/end-of-run hash comparison. The
current generation harness retains both independent fixes: the current deletion
completion phrase and all initially frozen files in the final hash map.

Experiment-specific hooks, staged runners, fixtures, protocols and their nine unit
tests were archived before removal. The corrected exact-match evidence guard and
its regression test remain in that historical source, not as orphan active tests.
Current checks pass 315 unit tests, all script/runtime syntax, release metadata and
locked SDK rebuild. The pinned actual host/Chromium with a local HTTPS LambdaDB
emulator passes 37 lifecycle checks, ending with zero collections. This is emulator
evidence, separate from live provider results. Product runtime/UI and dependencies
are byte-for-byte unchanged from develop. Archived flags fail before reading keys
or making network requests; current CI needs no historical artifacts.

## Evidence and reproduction

All bundles are **local-only**, under
`/Users/steven/Dev/sillymemory-managed-reranking/artifacts/archive/` and unavailable
in a fresh clone. Preserve them before removing this worktree. Original bundles are
unchanged; full prompts, scores, failures, frozen inputs/settings and detailed
historical conclusions remain inspectable.

| Bundle | Exact producer / contents | SHA-256 |
| --- | --- | --- |
| managed-reranking-v1/evidence.tar.gz | 7af0568; initial comparison and separate cleanup receipt | 9a3081415fce4703aa111c019c6167bf859a16090dd7546815a11c874cb6bf03 |
| rerank-rescue-v1/evidence.tar.gz | f2f274a; diagnostic gains and confirmation regression | 35871f24ba6af95f0701cdc48b7fce71ce1749f8a78fcd98e7ea040de01e1393 |
| rerank-intent-v1/evidence.tar.gz | 763906a; shared-question run, its frozen stop and post-run guard patch | f16249c031d454fe55a38e405ed583accbc5b37d59f639834e052302a6144df0 |
| rerank-closeout-v1/evidence.tar.gz | Frozen replay runner/plan; full pre-cleanup source at 76293ab; retired-file index; final checks | 8af324a4388a28c451ed5b87437339f582982c73737a38c8b9af570e9b88e19e |

The closeout bundle is 1,260,312 bytes with 21 members, all read back byte-for-byte.
Its pre-cleanup source contains 311 files verified against commit 76293ab; all 15
retired/consolidated paths match the preservation index. Configured secrets were
absent. The frozen replay verified all 18 request hashes, exact source/options,
provider-start spacing and completion records.

For historical host reruns, restore the relevant archived source/protocol and pinned
host; original commands are in those preserved records. The current runner no
longer offers the retired reranking modes. The closeout runner's --freeze/--run
commands and exact retained request bodies live in its bundle. Reproduction is
paid traffic with possibly different outcomes, not a required CI step or unfinished
part of this adoption review.
