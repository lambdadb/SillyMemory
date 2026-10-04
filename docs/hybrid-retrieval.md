# Controlled hybrid retrieval decision

## Frozen question and stopping rule

Does adding lexical retrieval improve final English answers over the current
vector-only policy without losing existing correct answers? Test one candidate:
equal-rank RRF over managed `knn.queryText` and text retrieval. Keep the current
boundary-aware chunks, 30 returned candidates per query, two-query construction,
recent 4, 800-token injection budget, 32K context and prompt assembly unchanged.
The vector leg still has k=30; the lexical leg necessarily adds an independent
candidate pool before fusion. Equal final result size is not equal server work.

The lexical query uses up to 128 unique literal word/code tokens joined with OR.
Both legs apply the same owner/scope restriction. Punctuation is not executable
syntax; punctuation-only input uses vector-only search. This tests one explicit
tokenization policy, not every possible BM25 or hybrid configuration.

Freeze eight synthetic English cases before traffic: exact code, rare name,
expression, place, semantic paraphrase, correction, speaker attribution and
revoked/unknown fact. Each history has 40 older turns (target facts among similar distractors) and
four recent neutral turns; alternate arm order. Keep identical history and
queries per pair; expected answers stay outside the browser. This is a retrieval
competition test under a limited memory budget, not a claim that the histories
overflow 32K or are a representative character-chat benchmark.

Run the pinned SillyTavern host, actual built-in proxy, LambdaDB managed
embeddings and `gpt-4.1-mini-2025-04-14` at temperature 0/output 256. At most 16
successful answers, 24 provider attempts, two transient retries per sample/eight
per run, and provider starts at least 15 seconds apart. Never retry a successful
answer. Use one owned disposable chat collection plus separate preflight and transport
gate collections; confirm remote cleanup. Before generation, verify both hybrid filters and
query-syntax input against a small synthetic remote corpus. A preflight error
blocks paid generation until its cause is understood.

Adopt only if all safety/transport checks pass, at least one previously incorrect
answer becomes correct, and no previously correct answer becomes incorrect.
Report candidate coverage, selected evidence, exact answers, tokens and latency
separately. An equal or negative result retains vector-only production behavior.
Do not tune this candidate or the cases after observing results. Stop after this
comparison and include the completed result or concrete blocker in one PR.

API contracts checked on 2026-10-02:
[hybrid RRF](https://docs.lambdadb.ai/guides/search/hybrid),
[Boolean filters](https://docs.lambdadb.ai/guides/search/boolean), and
[query-string syntax](https://docs.lambdadb.ai/guides/search/query-string).

## Completed result — 2026-10-02

**Decision: retain vector-only production retrieval.** The frozen RRF candidate
produced no additional correct answers and lost one existing correct answer.
It therefore failed the adoption rule. No hybrid setting or runtime import is
added; the candidate lives only in the explicitly invoked evaluation runner.

| Observation | Vector | Hybrid RRF |
| --- | ---: | ---: |
| Correct final answers | 6/8 | 5/8 |
| Required fact in at least one returned candidate list | 7/8 | 8/8 |
| Required fact in injected passages | 6/8 | 5/8 |
| Median injected memory tokens | 764 | 773.5 |
| Median provider input tokens | 941 | 951.5 |
| Median query round trip | 330 ms | 383 ms |
| Median retrieval preparation | 740 ms | 803 ms |
| Median generation elapsed, excluding initial provider pacing | 1.86 s | 2.19 s |

Query latency is measured per request (two per answer); retrieval preparation
includes reconciliation and token packing. Generation elapsed includes retrieval
and completion delivery. These single-run observations do not establish service
latency guarantees or a general cost difference. Managed embedding token usage
and cost are not exposed in this report.

| Case | Vector answer | Hybrid answer |
| --- | --- | --- |
| Exact code | ORCHID-PIER — correct | ORCHID-PIER — correct |
| Rare name | UNKNOWN — incorrect | UNKNOWN — incorrect |
| Exact expression | MARBLE-CHEST — correct | MARBLE-CHEST — correct |
| Place | COPPER-HALL — correct | COPPER-HALL — correct |
| Semantic paraphrase | UNKNOWN — incorrect | UNKNOWN — incorrect |
| Correction | ELM-907 — correct | OAK-412 — incorrect |
| Speaker attribution | SILVER-FOUNTAIN — correct | SILVER-FOUNTAIN — correct |
| Revoked / unknown | UNKNOWN — correct | UNKNOWN — correct |

### Interpretation of the misses and regression

The rare-name fact was absent from both vector top-30 lists. Hybrid returned it
at ranks 23 (current question) and 22 (preceding neutral turn), but neither was
high enough to survive the unchanged interleaving and 800-token packing. This
is a candidate-coverage gain, not an answer-quality gain. The paraphrase fact
also appeared among candidates in both arms but was not selected by either.

In the correction case, both arms ranked the original OAK-412 statement first
for the current question. The newer ELM-907 correction was rank 24 in vector
question results and rank 2 in its context results, so vector injected both and
answered correctly. Hybrid moved the correction to question rank 17 but context
rank 23. The budget admitted the old statement without the correction, and the
model answered OAK-412. Improving one list did not compensate for losing the
other list's early correction. The corpus and queries were identical per pair.

The old statement is still a legitimate historical source message; this is not
a deleted-message leak, failed upsert or stale index result. The observed issue
is evidence ranking/selection under the fixed budget. The experiment does not
isolate RRF from this lexical tokenization or the existing two-query policy, so
it is not evidence that all hybrid search is inferior. It also does not establish
that ANN caused the misses: there was no exact-vector-search comparison.

Do not add this equal-rank fusion as a default or expose an unproven option. Any
future candidate should protect correction/context evidence and demonstrate
final-answer gains on independently frozen cases. These eight cases are now
diagnostic/regression material, not fresh held-out evidence. Do not automatically
start another weight, budget or overlap sweep on the same answers.

## Verification and retention

- **Unit / source:** 326 unit tests, runtime syntax, all 166 script/test syntax
  checks, release metadata and whitespace checks passed. New tests cover literal
  query handling, scope filters, result limits and cancellation. Runtime files
  are unchanged from the merged boundary-chunking baseline.
- **Actual host / live services:** SillyTavern 1.19.0 at
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, actual built-in CORS proxy,
  LambdaDB managed embeddings and `gpt-4.1-mini-2025-04-14`. Six preflight
  searches verified each leg and combined results with ordinary and syntax-like
  inputs, excluding foreign owner/chat documents. Document deletion and owned
  collection disappearance were verified.
- All 16 answer requests completed with zero retries and no observed LambdaDB
  request failures. Expected deletion/not-found responses are not counted as
  failures. Complete provider answers matched saved host messages; selected
  passages reached actual outgoing prompts; recent messages remained present.
  Frozen producer hashes, paired source/documents/queries, the 800-token ceiling
  and at least 15-second provider spacing were checked. Expected answers and
  grading stayed outside the browser. All owned collections were cleaned up,
  no pending cleanup record remains, and keys were absent from persisted host
  and browser settings.
- No separate browser-emulator suite was rerun: the shipped runtime did not
  change. Live coverage here does not establish general chat quality, scale,
  context overflow, multilingual behavior or arbitrary hybrid configuration
  safety. A report's `passed: true` means the run and cleanup completed, **not**
  that the candidate met the answer-quality adoption rule.

Reproduce only when a new authorized question requires another paid run:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/path/outside/repo/.env.local \
SM_ARTIFACT_TAG=unique-run-name \
node scripts/generation-smoke.mjs --hybrid
```

The extension symlink must point to the tested checkout. Inputs/settings and
producer hashes are written to the report's `.plan.json` before traffic. The
runner checkpoints each completed case, permits at most 24 generation attempts,
and uses three owned collections including the transport and isolation gates.
Resolve any pending cleanup record before retrying. Do not rerun to improve a
successful but incorrect answer or merely to refresh documentation.

Full reports, the frozen pre-result protocol, producer overlay, rollup script,
fixture, plan and console log are in the local-only ignored archive
`artifacts/archive/hybrid-rrf-v1/evidence.tar.gz` in the
`sillymemory-hybrid-retrieval` worktree: 31 files, 166,144 bytes; SHA-256
`1ebec5a36c90e32a0839366146cbb34d6b20080413cb7b65801a4790939409ac`.
Every archived entry was byte-verified. The overlay applies to
`c72c983b196561c0305294b79167acc823437216`. It is not downloadable from a fresh
clone. The full report is `artifacts/generation-hybrid-rrf-v1.json`; result text
added to this document afterward does not alter its frozen protocol archive.

## Follow-up: budget versus ranking

The [completed budget diagnosis and fresh confirmation](budget-confirmation.md)
separates absent candidates from budget-related omissions. At 1,600, the old
hybrid correction still does not fit; it first appears at 1,717 for those exact
recorded lists. The new vector-only answer comparison does not justify raising
the default either. Keep vector/800 and the existing adjustable budget; these
are bounded findings, not proof of a globally optimal search policy or budget.

## Follow-up: managed reranking

The [staged Jev comparison](rerank-rescue.md) reproduced these failures and recovered
all eight diagnostic answers with hybrid + Jev. A separate pre-frozen confirmation
set then exposed a new baseline-correct answer loss. This supports further work on
the reranking relevance target, not automatic adoption of the old hybrid policy.
