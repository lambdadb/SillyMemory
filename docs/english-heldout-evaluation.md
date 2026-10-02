# English held-out evaluation — 2026-10-02

## Result and decision

**The retained policy has a useful token/accuracy tradeoff, but does not match
full-history accuracy.** All 42 reserved questions completed through the pinned
SillyTavern host, LambdaDB managed embeddings and OpenAI: 126 fresh answers and
126 fresh official-prompt judgments, with no reuse, quality retries or tuning.
The runtime remains unchanged at `db1c0c2c611d159d73786986a24a8c95b2a20034`.

| Condition | Correct / 42 | Accuracy | Median actual answer-input tokens |
| --- | ---: | ---: | ---: |
| Plain 32K | 14 | 33.3% | 31,403 |
| SillyMemory 32K | 24 | 57.1% | 3,282 |
| Plain 128K, full history | 29 | 69.0% | 104,933.5 |

SillyMemory gains 17 answers and loses 7 against plain 32K; against plain 128K it
gains 5 and loses 10. Median **paired** input reduction is 89.5% and 96.9%,
respectively. The 14-question development result of equal aggregate accuracy
with 128K did not carry over to this question split. Fewer input tokens and better
accuracy than a truncated window are supported here; equal full-history quality,
general superiority, and release readiness are not.

| Stratum (6 questions each) | Plain 32K | SillyMemory 32K | Plain 128K |
| --- | ---: | ---: | ---: |
| Abstention | 3 | 4 | 5 |
| Knowledge update | 4 | 3 | 6 |
| Multi-session | 0 | 4 | 3 |
| Single-session assistant | 3 | 5 | 6 |
| Single-session preference | 1 | 2 | 0 |
| Single-session user | 2 | 4 | 6 |
| Temporal reasoning | 1 | 2 | 3 |

Six cases per stratum are descriptive, not a stable ranking. Preference is weak
across all conditions, including full history; simply supplying more history
does not guarantee that the answer uses personal preferences.

## What the failures show

All **59 labeled source messages** across the 36 answerable questions appear in
valid retrieved candidates. Selection includes passages from 41 of them. This is
message-level overlap, **not exact-span recall or measured ANN recall**: a labeled
message can span multiple chunks, and labels can omit necessary neighbors. The
trace does not support increasing ANN candidate count as the demonstrated fix.

Of the 16 answerable SillyMemory misses, six selected no labeled message, five
selected only some, and five delivered all labeled message text. Two additional
misses are abstention questions. These are diagnostic groups, not causal labels:

- Selection competition: `cf22b7bf` retrieves both weight-update messages at
  primary ranks 5 and 7 but selects neither, answering 5 pounds instead of the
  10-pound update. `eaca4986` retrieves the second song's chunks at ranks 6, 7 and
  9 but selects none, then gives the wrong chorus progression.
- Update use: `852ce960` delivers both the old $350,000 and later dated $400,000
  mortgage statements, yet answers the old amount. Missing candidates do not
  explain this observation; conflict handling and distractors remain candidates
  for development work, not isolated causal findings.
- Preference use: `6b7dfb22` and `fca70973` deliver their labeled preference turns
  in full but give general recommendations. The theme-park answer even asks for
  preferences already stated. Complete rubric-supporting context was not
  independently annotated, so labeled-turn delivery alone is not proof that
  retrieval has supplied every required detail.
- Neighboring context: `51a45a95` delivers the labeled coupon turn, which does not
  name the store. The earlier user turn naming Target is candidate rank 27 but
  not selected. A delivered assistant example mentioning Target is weaker
  evidence. This shows why full labeled-turn coverage can overstate completeness.
- Source/gold inconsistency: in `370a8ff4`, the two labeled sessions are dated
  January 19 and April 10, 2023, 81 calendar days apart; released gold says 15
  weeks. Both dates reach the SillyMemory prompt. Preserve this apparent
  inconsistency and every original grade: no exclusion, corrected gold or rejudge
  was applied. All three conditions are officially incorrect on this question.

Every one of the **348 prepared memory messages** reached the final API prompt;
all memory counts stay within 800 tokens (maximum observed 799). No invalid
candidate was found. Packing replay reproduces the exact selected passages and
memory token counts from the recorded candidates. Thus no prepared-to-host
injection loss was observed; that does not establish complete semantic evidence.

The next product work should target selection of related update/neighbor context
and use of current facts/preferences, using development questions and small
regressions. Choose and validate one change before another untouched evaluation;
do not start another series of infrastructure-only experiment PRs. These 42
questions are now consumed and must not be presented as unseen validation after
future tuning. No runtime change, main promotion or release is made here.

## Verification, usage and limitations

The actual-host/local-service preflight passed all three conditions on one
**development** question; its synthetic responses are not quality evidence.
The paid run completed in 64.37 minutes. All 252 OpenAI completions succeeded on
first attempts. Receipt checks verified 630 stored requests/responses/observations,
source and input hashes, strict yes/no judgments, unchanged runtime, matching
host/API prompts, preserved source order, truncated 32K controls, complete
nonempty source coverage at 128K, and the owned-data cleanup records.

Generation used 5,852,089 input / 11,248 output tokens; judging used 29,966 / 216.
The frozen uncached-price estimate is **$2.4359074**, versus a conservative
$4.8122928 reservation within the $6 ceiling. This is not an invoice and excludes
LambdaDB/managed embedding charges. LambdaDB recorded 1,116 non-cleanup requests,
37,855 document-write attempts and 4,613,116 estimated embedding-input tokens.
Both owned collections were verified inaccessible after deletion; the temporary
host checkout/profile was removed. No native embeddings or summaries were run.
Unit tests **309/309**, syntax checks and release metadata checks passed.

This is a balanced, small **held-out question** split with shared histories, one
generator snapshot, one judge snapshot and one generation per condition. It is
not an unseen-conversation benchmark, human grading, a multilingual/persona
study, or a new comparison against native Vector Storage/Summarize. Their prior
results remain development-only. Provider/model variability and managed-service
ranking variability remain possible. The artificial 15-second dispatch spacing
means total run time is not a user-facing latency benchmark. No independent
ANN/exhaustive-vector comparison was performed in this run.

## Evidence and reproduction

The [frozen plan](benchmarks/english-heldout-plan-v1.json) retains all 42 input
hashes, the 126-task allowlist, model settings and limits. Inherited native/
summary settings in `arms` are inactive: only the task allowlist was authorized.
The [compact manifest](benchmarks/english-heldout-summary-v1.json) retains every
condition's grade/token count, paired wins/losses, diagnostics and archive hash.

The verified 73,163,473-byte archive is
`artifacts/archive/english-heldout-v1/evidence.tar.gz` in the
`sillymemory-english-heldout` worktree; SHA-256
`d82c2402bba4c8ee8d834e28980706e7dba316944d97599c9a3a3bed9a94fe37`.
All 671 archived files were verified byte-for-byte with zero configured-secret
matches. It is **local-only**, not uploaded and not available in a fresh clone.
It includes full private run/fixture evidence, one-off executor/adapter/ledger,
analysis and source bindings, and the exact pre-dispatch protocol in
`artifacts/frozen-decision.md`. `decisionDocumentSha256` binds that original
protocol, before this document's result sections were added.

For an offline audit, check out the producer revision above, extract the archive,
provide the pinned dataset/scorer cache and host dependencies from the source
lock, and run `node artifacts/analyze-heldout.mjs` with `BENCHMARK_CACHE` and
`ST_SOURCE` set to their absolute paths. Move the archived
`artifacts/heldout-analysis.json` aside first: the analyzer refuses overwrite.
It makes no provider calls. The one-off producer scripts are intentionally
archived instead of added to maintained CI or copied as historical fixtures.
The development adapter's rejection of held-out inputs remains intact; the
archived evaluation adapter separately allows only the frozen 42 question IDs.

## Development follow-up: compression candidates closed

After this evaluation, two small source-preserving candidates were implemented
and screened on **development data only**. The consumed 42 questions were not
replayed or used to choose between candidates. Both candidates are rejected and
the product implementation is restored byte-for-byte to the baseline.

The first joined consecutive chunks from the same message under one full-range
label, retaining every byte and all prior selected sources. It failed its frozen
minimum-gain screen before any paid calls. A separately frozen second and final
candidate shortened repeated role/speaker/coordinate wording across distinct
messages; it retained every field and used the new formatting only when another
distinct retrieved passage fitted. That candidate failed the same screen too.

| Cached cohort | Baseline evidence selected | Contiguous candidate | Compact-label candidate |
| --- | ---: | ---: | ---: |
| English follow-ups: 112 case/budget rows | 98 | 98 | 98 |
| Development: 12 saved retrieval traces | 14 / 21 labeled messages | 14 / 21 | 14 / 21 |

Neither candidate evicted a previously selected passage. Contiguous packing added
one passage in the development cohort; compact labels added four development
passages and 35 follow-up passages. **None added a required/labeled source.**
Saving label space can admit more text without admitting the missing evidence.
The two reused development pilot rows have no retained retrieval traces and are
excluded; repeated budgets and overlapping fixtures are not independent samples.

This closes these formatting-only approaches for the current development task.
It does not prove all compression is ineffective, or that a particular new
ranking policy will work. The next design should address relevance and competing
candidate allocation, including when contextual-query results deserve space,
rather than accumulating further label variants. Preserve the rejected 2:1
answer-level result too; a future policy needs answer-use and generation-variation
checks, not only a larger count of selected passages.

The candidate-specific unit subsets passed 41 and 39 tests, covering source
boundaries, literal macros, provenance, invalid hits and token-counter failure.
These are synthetic/offline checks, not host integration or answer-quality
results. Observed required-source gain was zero, below the predeclared minimum,
so no live fixture,
provider call, new answer, judge or remote resource was started. Rejected code and
tests were archived and removed from maintained source. The restored baseline
passes all 309 unit tests plus syntax and release metadata checks.

The [compact decision manifest](benchmarks/english-compression-summary-v1.json)
records both source/patch/result hashes and the verified 84,545-byte, 21-file
local-only archive at `artifacts/archive/english-compression-v1/evidence.tar.gz`
in the `sillymemory-contiguous-packing` worktree. It is not uploaded or available
in a fresh clone. Reproduction requires producer revision
`33fc1278f1e0c8c6ec7f0279862ec35b5f5b51db`, the separately retained development
archive linked by its checksum in the manifest, and the recorded tokenizer.
The bundle's `compression-bindings.json` records required local paths; restore
the baseline checkout there, apply each archived patch in a separate worktree,
and copy that candidate's replay script to the worktree's `artifacts/` root before
running it (its relative imports expect that location). There is no new maintained runner or historical-source
fixture. No generated-answer improvement or release readiness is claimed.

## Frozen protocol

Decision: test whether the retained SillyMemory policy preserves useful long-history
answers while reducing final-answer input on the 42 reserved English questions.
Use the `evaluation` split in `selection-v1.json`, six questions per each of seven
strata. This is a held-out **question** split, not an unseen-history or independent
conversation benchmark; shared histories and the balanced sampling limit claims.
Do not inspect answers for tuning, remove cases, tune the runtime or repeat answers
for quality once this run starts. No release or deployment follows automatically.

The maintained runtime is frozen at the PR40 merge: v5 query construction, equal
primary/context interleaving, managed embeddings, candidate size 30 per query,
800-character chunks, recent 12 messages and an 800-token memory budget. Preserve
original message order/dates and the existing uniform macro-literalization adapter.
Record all adaptation hashes and audit flags before provider dispatch. Gold enters
only the pinned judge and post-run diagnostics, never retrieval or generation.

Compare **plain 32K, SillyMemory 32K and plain 128K** through the actual pinned
SillyTavern 1.19.0 host at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
The first is the context-pressure control; the last is a full-history reference,
not an oracle. Native Vector Storage and Summarize results remain development-only;
no held-out comparison against those methods will be claimed from this matrix.
There are 126 new answers and 126 new judgments, with no pilot/development reuse.
Models/settings remain `gpt-4.1-mini-2025-04-14`, temperature 0, output cap 1,024;
judge `gpt-4o-2024-08-06`, temperature 0, cap 10, exact normalized yes/no and the
locked official LongMemEval scorer prompt. An ambiguous judge stops, retaining its
receipt; it is not converted to a favorable grade or automatically regenerated.

Report per-condition/per-stratum accuracy, paired wins/losses, provider prompt and
output tokens, median paired input reduction, source/delivery failures, known usage
and cleanup. Keep all misses. Do not pool these questions with development results
or claim statistical equivalence to 128K from equal counts. Do not attribute every
answer difference to retrieval: isolate candidate availability, selection, prompt
delivery and answer use where retained evidence permits. Single-run generation
variability remains unmeasured beyond the previous identical-request observation.

Bound the execution to two hours and a conservative USD 6 OpenAI reservation
using the previously frozen uncached price assumptions (not a billing quote).
At most 264 completion attempts: 252 planned plus 12 transient retries, no summary
or native embedding calls. Starts are at least 15 seconds apart. Each request has
at most three attempts, a 90-second attempt timeout and a 180-second logical
window; only received HTTP 500/502/503/504 responses permit bounded automatic
retry. Unknown delivery or other provider errors stop with durable evidence.
Never reset aggregate budgets or rerun completed answers after interruption.

LambdaDB bounds: 4,000 non-cleanup requests, 60,000 document-write attempts,
10M estimated embedding-input tokens, 200MB POST bodies and six owned collections.
These are workload limits, not measured managed embedding charges. Verify owned
remote/native cleanup and remove disposable host profiles even on failure. Keep
credentials in the original ignored environment file and session memory only.

Before the paid run, validate the complete 126-slot frozen matrix, disjoint
question IDs, source/input hashes, and an actual-host/local-service execution of
all three conditions on one development case (not a held-out quality observation).
This fixture uses synthetic responses. Archive the one-off derivatives of the
existing runner/ledger with the completed run; keep only the frozen inputs/settings,
small result manifest and conclusions in the maintained repository. No separate
preflight, retry-helper or intermediate-result PR.
