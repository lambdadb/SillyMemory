# Staged reranking rescue evaluation

This is the bounded follow-up to the [initial Jev comparison](managed-reranking.md).
The [protocol](rerank-rescue-protocol.md), producer and six new confirmation cases
were frozen at `f2f274a` before traffic. No default retrieval or UI change is made.

## Decision — 2026-10-05 KST

The combination has demonstrated narrow benefits, but **does not pass the default
adoption gate**. Diagnostic answers improved from 6/8 to 8/8. New confirmation
answers improved from 4/6 to 5/6, with two gains and one loss of a baseline-correct
answer. Keep production vector retrieval unchanged. Do not describe the combination
as ineffective, regression-free, or generally superior based on this small run.

## Completed results

| Diagnostic retrieval policy | Target found in either candidate list | Target injected | Actual answers |
| --- | ---: | ---: | ---: |
| Vector | 7/8 | 6/8 | 6/8 |
| Vector + Jev | 7/8 | 6/8 | Not generated: no evidence gain |
| Hybrid | 8/8 | 5/8 | Not generated: retrieval diagnostic only |
| Hybrid + Jev | 8/8 | 8/8 | 8/8 |

Vector + Jev and hybrid + Jev retained their respective unreranked candidate sets
for all eight diagnostic cases. Those paired comparisons therefore demonstrate
ordering/packing changes with the same candidate membership. They do not show
that hybrid and vector had identical pools. The hybrid path was triggered only by
the rare-name fact's absence from both vector lists, then expanded to regression
controls after recovering it.

The combination rescued the rare-name and paraphrase cases, while retaining all
six baseline-correct diagnostic answers. It also restored the correction omitted
by unreranked hybrid. The primary-query target ranks were 23 → 1 for rare name,
24 → 1 for paraphrase, and 17 → 1 for the correction in the hybrid/Jev comparison.

| New confirmation observation | Vector | Hybrid + Jev |
| --- | ---: | ---: |
| Target found in either candidate list | 6/6 | 6/6 |
| Tagged target passage injected | 4/6 | 5/6 |
| Correct final answers | 4/6 | 5/6 |
| Median injected memory tokens | 784 | 787 |
| Median provider input tokens | 962.5 | 962.5 |
| Total provider input / output tokens | 5,767 / 19 | 5,755 / 26 |
| Median live probe query latency | 344 ms | 665.7 ms |

The tagged target is the designated fact passage, not a complete general semantic
coverage metric. In the historical-state case, the earlier passage can also support
the answer; both arms included the tagged passage and answered correctly here.

All 28 answers were manually checked against their synthetic source: the scored
successes contain only the supported answer identifiers or UNKNOWN; the misses are
UNKNOWN despite an answer in the source. Exact-match and identifier scores agree
in this run. There is no format-only gain or newly invented qualifier.

| Cohort / case | Vector answer | Hybrid + Jev answer |
| --- | --- | --- |
| diagnostic / exact-code | ORCHID-PIER | ORCHID-PIER |
| diagnostic / rare-name | UNKNOWN | VIOLET-WORKSHOP |
| diagnostic / exact-expression | MARBLE-CHEST | MARBLE-CHEST |
| diagnostic / place | COPPER-HALL | COPPER-HALL |
| diagnostic / semantic | UNKNOWN | CEDAR-HOLLOW |
| diagnostic / correction | ELM-907 | ELM-907 |
| diagnostic / speaker | SILVER-FOUNTAIN | SILVER-FOUNTAIN |
| diagnostic / revoked-unknown | UNKNOWN | UNKNOWN |
| confirmation / new-rare-name | UNKNOWN | PEARL-FOUNDRY |
| confirmation / new-exact-ticket | UNKNOWN | WILLOW-DEPOT |
| confirmation / new-paraphrase-journal | ELDER-LOCKER | ELDER-LOCKER |
| confirmation / new-paraphrase-medicine | BIRCH-CUPBOARD | UNKNOWN |
| confirmation / new-revocation | UNKNOWN | UNKNOWN |
| confirmation / new-historical-state | BRONZE-ROOM | BRONZE-ROOM |

The [shared-question follow-up](rerank-intent.md) now tests this hypothesis. It
retains the secondary ranking improvement but fails the answer gate; the result
below remains the historical observation from its own frozen run.

## The confirmation regression

`new-paraphrase-medicine` asks where tablets were stashed after a home burned.
The source says the medicine remains in BIRCH-CUPBOARD after a blaze destroyed a
cottage. Vector retained that passage and answered BIRCH-CUPBOARD. Hybrid + Jev
omitted it and answered UNKNOWN.

The target was absent from the primary query's top 30 in both compared arms. In
the secondary vector list it ranked second. The hybrid + Jev response's retained
`retrievalScore` places it in a tied **25–30** range before reranking, and Jev put
it at **30**, with score 0.357. Both ranks are outside what the 800-token packing
admitted. Do not attribute the entire 2 → 30 change to Jev: hybrid fusion had
already demoted the passage, and Jev failed to rescue it.

The rerank query for that secondary list was “Recent neutral turn 43: we sorted
plain paper and empty baskets.” It did not ask the medicine question. This gives a
concrete next hypothesis: retain the two retrieval queries but evaluate both lists
against a common current-question intent with enough preceding context to resolve
references. That is different from merely prioritizing recent documents or raising
the budget. Its benefit is **not verified** by this run. The actual prompts,
score envelopes and tied-rank evidence are retained for testing it.

## Question and stages

The initial 12 cases already delivered every required fact with vector retrieval.
This follow-up instead starts with the eight previously observed hybrid diagnostics,
including candidate absence, budget exclusion and a dropped correction. These are
known failures/regressions, not new held-out observations. The six later confirmation
cases have new entities, questions and answers but reuse related authored templates;
they are a small synthetic check, not an independent public benchmark.

First probe vector and vector + Jev on all eight cases through the actual browser's
MemoryEngine, host tokenizer and live LambdaDB. These probes append the question to
a captured snapshot without changing the saved chat or calling the generation model.
If a required fact is absent from the vector pool, probe hybrid and hybrid + Jev for
that case. Only if this recovers a fact do the two hybrid arms run on the remaining
cases as regression controls. Select a policy using evidence delivery, before answers.

For a qualifying policy, compare its answers with vector retrieval through the
actual SillyTavern generation path and fixed OpenAI snapshot. Replay the exact
live-derived candidate lists for each arm, bound to query text, branch, owner,
scope and source. Verify the selected passages match each probe and reach the
provider request. This separates answer generation from new search variation;
reported generation latency therefore does not include fresh LambdaDB queries.

Only diagnostic answer gains without a baseline loss allow the six pre-frozen
confirmation cases to run. There is no custom criterion, event-time extraction,
additional candidate-depth/budget sweep or successful-answer retry. All arms retain
30 returned candidates per query, vector k=30, Jev candidateSize=30, recent=4,
800-token memory, consistent reads and active chat-branch filters. The host context
is 32K, but these compact histories do not test natural 32K overflow.

## Interpretation

Default Jev receives a separate queryText for each search leg. In the comparison
adapter, that queryText is the same text used to retrieve the leg's candidates.
The secondary leg can be a preceding neutral turn rather than the current question.
A passage useful for the current question can consequently rank poorly against that
neutral turn. This is a limitation of the adapter's relevance target, not evidence
that a low Jev score means the underlying fact is false or obsolete.

The candidate preserves the current two-list interleaving and whole-passage packing.
It has no rule that protects all baseline-selected passages. Candidate recall,
relevance ranking, final budget selection and answer correctness must therefore be
reported separately. An aggregate answer gain alone is insufficient if a previously
correct answer is lost.

The identifier grader was frozen before traffic. It accepts a supported answer
identifier inside a harmless sentence wrapper and rejects conflicting identifiers
or explicit negation; UNKNOWN must stand alone. Every complete answer still needs
manual source review for unsupported extra claims. Exact-match and identifier
scores are retained separately, without post-result grading changes.

## Validation and stopping boundary

The run completed 44 live retrieval/selection probes and 28 actual-host answer
generations, using 28 OpenAI calls with no retries. It made 93 LambdaDB queries
(88 probe queries plus gate/preflight), submitted 1,517 documents and created three
owned collections, all within the frozen limits. All 44 probe rerank responses
were applied. No custom criteria or product policy was changed after results.

The raw report has `passed: true` for execution/cleanup and
`confirmationAnswers: false` for the quality gate. These mean different things.
The original eight-case diagnostic answer gate passed; the new six-case confirmation
gate rejected the baseline-correct medicine loss despite the net score increase.
The run stops here rather than tuning criteria or replacing the failed case.

Independent evidence checks verified all 28 frozen source hashes against producer
`f2f274a`, all 461 probe-selected passages against current local documents, every
replayed answer's selected memory in the actual provider request, and budget and
branch/owner/scope constraints. Keys were absent from persisted host/browser
settings. The corrected UI teardown completed normally, then all three recorded
collections were confirmed absent; there is no pending cleanup ledger.

All 322 unit tests passed before traffic, together with runtime/new-script syntax,
locked SDK reproducibility and release metadata checks. Product runtime/UI files
are unchanged. This live run exercises the corrected generation-runner teardown;
it does not replace the initial PR's separately recorded 37 emulator lifecycle
checks or establish provider reliability. No main promotion, release or deployment
was performed.

A follow-up should change the reranking relevance target, retain the observed
medicine regression as a diagnostic, and freeze a separate confirmation set before
traffic. Candidate coverage, shared-question reranking and temporal criteria must
remain separate decisions. There is no evidence here that timestamps or temporal
custom criteria are the next necessary fix.

## Retained evidence and reproduction

Local-only archive, unavailable in a fresh clone:
`/Users/steven/Dev/sillymemory-managed-reranking/artifacts/archive/rerank-rescue-v1/evidence.tar.gz`

- SHA-256: `35871f24ba6af95f0701cdc48b7fce71ce1749f8a78fcd98e7ea040de01e1393`
- Size: 1,239,051 bytes; ten members including a checksum manifest.
- Contains the complete frozen `f2f274a` source, source/settings plan, raw report,
  run/unit logs, analysis and independent verification scripts/receipts.
- All members were read back byte-for-byte. Candidate files and the decompressed
  archive passed a configured-secret scan. The original v1 archive remains intact.

Use the recorded producer and pinned host, with the host extension symlink pointing
to that checkout. Credentials remain in the original ignored environment file:

```sh
npm ci
SM_ENV_FILE=/absolute/path/to/.env.local \
ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
SM_MODEL=gpt-4.1-mini-2025-04-14 \
SM_ARTIFACT_TAG=independent-rescue-run \
node scripts/generation-smoke.mjs --rerank-rescue
```

Do not launch another paid run solely to obtain a green quality gate. A changed
relevance target needs a new frozen protocol and explicit reporting of reused
failures versus new confirmation inputs. This staged runner is retained to reuse
its fixed-candidate replay and safety checks for that specific follow-up.
