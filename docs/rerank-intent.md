# Shared-question reranking result

The [frozen protocol](rerank-intent-protocol.md) tests the medicine regression from
[the staged rescue run](rerank-rescue.md). Producer `763906ae68132b87cecb933480d5b5f1177baabe`
was committed before traffic. This is an evaluation-only change; product retrieval
and UI defaults remain unchanged.

## Decision — 2026-10-05 KST

Do not adopt shared-question hybrid + Jev as the default. It improved the secondary
medicine passage's rank from 30 to 1 with the same candidates, but did not improve
answers. The five targeted pairs scored **5/5 for original hybrid + Jev and 4/5 for
shared-question hybrid + Jev**. The latter answered UNKNOWN despite receiving the
correct medicine passage. The diagnostic answer gate failed, so the six frozen new
confirmation cases were **not executed**. No successful response was retried.

This completes the bounded investigation through its stopping condition. It does
not establish that a common relevance target is generally harmful or that Jev is
ineffective. A rank improvement and a no-regression answer improvement are different
claims; only the former was observed here.

## What changed and what was measured

Both retrieval queries, hybrid fusion, filters, explicit chat branch, consistent
reads, candidateSize=30, 800-token budget, recent=4, chunking and packing stayed
fixed. Only Jev's queryText changed: both lists used the current request plus the
preceding context, labeled as reference context. The helper enforces the API's
8 KiB UTF-8 bound without splitting characters or dropping the current request.

The actual SillyTavern browser ran MemoryEngine and its tokenizer against live
LambdaDB, including managed embeddings and Jev. Candidate lists were captured once
per arm and replayed through actual SillyTavern/OpenAI generation. The runner checked
query/owner/scope/branch identity, exact selected passages, recent messages and final
provider requests. Generation used gpt-4.1-mini-2025-04-14 at temperature 0, max output
256 and a 32K host context. These are small authored diagnostics, not 32K overflow,
a public benchmark, or a statistical reliability estimate.

| Known 14-case probes | Vector | Original hybrid + Jev | Shared-question hybrid + Jev |
| --- | ---: | ---: | ---: |
| Tagged fact in candidates | 13/14 | 14/14 | 14/14 |
| Tagged fact injected | 10/14 | 14/14 | 14/14 |
| Median memory tokens | 775.5 | 774.5 | 778 |
| Median query latency | 373.1 ms | 765.6 ms | 766.7 ms |

All 14 paired hybrid candidate sets matched within this run, and request comparison
confirmed that only rerank.queryText changed. All 56 probe rerank responses were
applied. All 438 selected probe passages matched the current local source exactly.
Tagged-fact coverage is a narrow metric: historical questions can also be answered
from an earlier passage. It is not a general semantic coverage measure.

| Targeted answer pair | Original hybrid + Jev | Shared-question hybrid + Jev |
| --- | --- | --- |
| Medicine location | BIRCH-CUPBOARD | UNKNOWN — incorrect |
| Rare name | VIOLET-WORKSHOP | VIOLET-WORKSHOP |
| Corrected credential | ELM-907 | ELM-907 |
| Revoked credential | UNKNOWN | UNKNOWN |
| Historical venue | BRONZE-ROOM | BRONZE-ROOM |

All ten responses were opened and checked against the synthetic source. Identifier
and exact-match grades agree; the nine successes have no unsupported extra detail.
The two arms consumed 4,744/22 and 4,733/17 input/output tokens respectively across
five answers each. Vector answers were not regenerated in this stage.

## Why the medicine result is not the previous failure

The source conversation hash is identical to the preceding run, but each hybrid
candidate list shares only 29 of 30 passage texts with that run. Previously the
primary list omitted the medicine fact. This time it included it with retrievalScore
0.5 and Jev placed it first in both arms. Thus the earlier omission did not reproduce
in the original arm. The evidence does not identify whether ANN, lexical ties,
index state or another retrieval detail caused the cross-run membership change.

Within this run the secondary list was identical between the two hybrid arms. The
medicine fact moved from rank 30 (score 0.3285) to rank 1 (0.8925); its retrievalScore
remained 0.4919355. This supports the common-question ranking mechanism. It does not
prove a delivered-evidence gain, because the primary list already rescued the fact.

Both actual final prompts contained the full statement that medicine stayed in
BIRCH-CUPBOARD after the cottage burned. Memory used 776 tokens in the original arm
and 764 in the shared-question arm, both below 800. Other selected distractors and
speaker patterns differed. The latter model response was UNKNOWN. This is an
observed **generation failure with the tagged evidence present**, not budget
exclusion, stale data, missing injection or an HTTP failure. The single pair cannot
separate sensitivity to the surrounding excerpts from generation variability.
Temperature 0 is not evidence of deterministic service behavior.

## Validation, limits and next decision

The frozen execution completed 42 probes, 10 provider calls/answers without retries,
89 total live query calls and 817 document submissions. All three owned collections
were deleted and independently verified 404 in the retained request log. No pending
cleanup record remains. Execution/cleanup passed; **answer-quality acceptance did
not**. No new confirmation answer, reference-resolution benefit, production rollout
or broad non-regression claim is established.

The producer passed 323 unit tests. A subsequent review fix requires complete
passage delivery in both arms before the initial experiment's exact-match gate can
pass. Its missing/empty-evidence, fallback and loss regressions bring the final suite
to 324 passing tests; syntax, locked SDK rebuild and release metadata also pass. The
fix is outside the executed shared-question path and is retained as a post-run patch.
It does not rewrite any raw result. The separate earlier emulator/lifecycle results
remain in the linked records; no new lifecycle emulator run is claimed here.

Keep vector retrieval as the product default and close this experiment at its
frozen stop. Before another quality sweep, isolate the remaining issue using the
retained failing final prompt and fixed candidates: distinguish generation variance
from distractor packing in a separately frozen comparison. Do not increase the
budget, add timestamp heuristics or run more new fixtures merely to seek a passing
score. Resolving references and new temporal scenarios remains unverified because
that stage was gated off.

## Evidence retention and reproduction

Local-only bundle: `artifacts/archive/rerank-intent-v1/evidence.tar.gz` in the
`/Users/steven/Dev/sillymemory-managed-reranking` worktree. Exact source, protocol,
raw report/plan, logs, analysis, verification and post-run review patch are retained.
The bundle is not available in a fresh clone. Earlier reranking archives remain
unchanged. The 1,245,420-byte bundle has 15 members, all read back and checked
byte-for-byte; configured secrets were absent. SHA-256:
`f16249c031d454fe55a38e405ed583accbc5b37d59f639834e052302a6144df0`.

To reproduce, use the archived producer, the pinned SillyTavern 1.19.0 revision
`06bde939fb1e9c4c8d8641d810f0a916b5bce127` and session credentials:

```sh
SM_ENV_FILE=/absolute/path/to/.env.local \
ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
SM_MODEL=gpt-4.1-mini-2025-04-14 \
node scripts/generation-smoke.mjs --rerank-intent
```

A new execution is paid traffic and may produce different candidate membership or
answers. Replay of this report's captured candidates is evidence for this run only.
