# Ambiguous references, continuation, and context overflow

Protocol `recall-challenges-v1` fixes six synthetic cases before the first live
run: English and Korean versions of three stressors, with one memory-off and
one memory-on generation per case (12 planned answers). This is a diagnostic
sample, not a statistically reliable quality benchmark. No personal chats are
used. The fixture hash is
`8b8bc5fd5a4fa4962c3bab2a18c5be9d69b9c964c3e516b38fd2ef9c77309780`.

- **Reference:** the named referent is four messages before the new question,
  beyond the current contextual query's two preceding messages. Forty similar
  old compass records compete with the target; the recent source still makes
  the reference resolvable to the generation model.
- **Continue:** seven consecutive assistant messages move from the last user's
  topic to another named object. The host runs an actual `continue` generation.
  Grade only the new provider text, and verify that the host saved the original
  prefix plus that text. The existing policy anchors on the earlier user topic.
- **Overflow:** 180 source messages exceed the configured 8,192-token host
  context. Measure actual host-token size and outgoing source inclusion. The
  off-mode baseline is expected to be truncated, unlike the earlier full-source
  comparison. This is a host context limit, not the model's maximum capacity.

Use pinned SillyTavern 1.19.0, `gpt-4.1-mini-2025-04-14`, temperature zero,
256 output tokens, 12 retained recent messages, and 800 memory tokens. Alternate
mode order by case; restore the exact same source before every answer. Answers
from an earlier sample cannot contaminate later prompts. Accept only the fixed
locker label (case and a final punctuation mark may differ); alternative labels,
explanations, and UNKNOWN are scored incorrect. Record exact answers so format
failures can be distinguished from missing facts.

For each sample, record source identity and size, retained source count, target
presence in the outgoing prompt and injected memory, memory tokens, query text
and target rank per successful search, provider prompt tokens, and latency.
Answer correctness alone is not successful recall: full-source fallback can
also answer correctly. Missing target hits do not establish an ANN defect; this
protocol does not supply exhaustive-vector ground truth.

```sh
SM_ENV_FILE=/absolute/path/to/existing/.env.local \
ST_SOURCE=/absolute/path/to/isolated/pinned/SillyTavern \
SM_ARTIFACT_TAG=challenge-run-unique npm run test:challenges:live
```

`SM_ENV_FILE` selects an existing local credential file for the generation
harness; the default remains this checkout's `.env.local`. It is read into the
parent test process, not copied into a worktree or exported to the host. The
extension still keeps its LambdaDB key only in browser memory. The host symlink
must point at the checkout being evaluated. Each run starts an isolated host
profile, creates only tagged synthetic collections, and performs ownership-
checked cleanup. Do not start another run while cleanup remains pending.

At most 12 generation calls plus one bounded transient 503 retry are allowed
per complete run; starts are at least 15 seconds apart. Real LambdaDB managed
embedding and model usage incur costs. Product request deadlines and retry
behavior are unchanged. Raw reports and pending-cleanup files are ignored local
artifacts named `generation-challenges-<tag>.json` and
`generation-challenges-<tag>-pending.json`.

On interruption or failure, preserve the report for diagnosis, complete owned
cleanup, then rerun the full evaluation with a new tag. Failed reports cannot
supply a prefix for aggregation, even if all sample rows and cleanup exist.
`SM_CHALLENGE_START=N` can run a diagnostic suffix; it does not repair a failed
report. Partial rows are not a completed 12-answer comparison.


## Aggregation and interpretation

```sh
node scripts/challenge-summary.mjs artifacts/generation-challenges-<tag>.json \
  --output artifacts/challenge-summary-<tag>.json
```

Every input report must have `passed: true`, no failure record, and verified
cleanup, including when supplying multiple paths or using `--partial`.
The summarizer rejects duplicate samples, incomplete comparisons unless
explicitly `--partial`, mixed runtime or evaluation sources (including the generation and cleanup harnesses), missing
source hashes, missing cleanup, mismatched provider answers, missing source
integrity checks, and injection claims inconsistent with the outgoing request.
It records input file hashes. Summarize different policy versions separately;
never pool the pre-fix and post-fix samples as repetitions of one policy.

## Baseline findings and scoped fix

The first live run completed all 12 answers and 93 integrity checks, with owned
collection cleanup. Strict label scores were 3/6 without memory and 4/6 with
memory. Both reference cases and both overflow cases succeeded with memory.
Both continuation cases failed with memory: English answered UNKNOWN and Korean
answered RUBY-592 (the earlier topic). The English target was absent from both
top-30 result lists. The Korean target appeared at primary rank 18 but did not
survive budgeted selection. Thus failure can occur during query construction or
selection; this evidence does not identify an ANN defect.

The Korean no-memory continuation returned `LOTUS-683입니다.`: it contained the
correct label but failed the protocol's frozen label-only format rule. That is a
format failure, not evidence that full-context generation forgot the fact. The
grader was not relaxed after observing this answer.

The overflow fixtures measured 22,324 English and 31,155 Korean source-text host
tokens against the configured 8,192-token context. Memory-off requests retained
48/180 and 35/180 source messages respectively and omitted the target label.
Memory-on requests selected the old fact under the same 800-token memory budget.
The smaller reference/continuation fixtures fit the off-mode context completely.

The scoped fix is `latest-user-or-continuation-plus-context-v2`: an explicit host
`continue` operation anchors retrieval on the latest message being extended.
Normal, regenerate, and swipe still anchor on the last user question. A unit
regression reproduced the old continuation anchor before the fix. No generic
context-window expansion, LambdaDB changes, ANN tuning, or timeout increase was
made. A second complete run uses the same frozen fixtures and grader; results
are separate from the baseline, and are a development-set retest, not held-out
validation of the selected fix.


## Retest results — 2026-09-28

Both policy runs completed all 12 scheduled OpenAI requests and 93 pipeline
integrity checks each, with no model retries or pending cleanup. Only `index.js`
and `src/memory.js` differ in their recorded source hashes; fixtures, evaluation
logic, host/model configuration and grader are identical across the runs.

| Case | Off strict score, both runs | v1 memory-on strict score | v2 memory-on strict score | v2 target selected |
| --- | --- | --- | --- | --- |
| English reference | Pass | Pass | Pass | Yes |
| English continuation | Pass | Fail: UNKNOWN | Pass | Yes |
| English overflow | Fail: UNKNOWN | Pass | Pass | Yes |
| Korean reference | Pass | Pass | Pass | Yes |
| Korean continuation | Fail: correct label plus 입니다 | Fail: earlier-topic label | Fail: correct label plus 입니다 | Yes |
| Korean overflow | Fail: UNKNOWN | Pass | Pass | Yes |

Target-containing memory increased from **4/6 to 6/6** and strict label answers
from **4/6 to 5/6** for memory-on. Both continuation targets ranked first in both
v2 queries. Maximum injected memory was **799/800 host tokens**. The corrected
Korean continuation answered `LOTUS-683입니다.`; preserve its strict failure
rather than reporting 6/6 formatted answers. In both rounds the off baseline
scored 3/6, including the same Korean format failure and two truncated-history
failures. No automatic quality retry or sample substitution was used.

The reference cases remain a weak test of reference resolution: their generic
primary query already returned the required passage (English rank 1, Korean
rank 16), while the contextual query missed it. They do not demonstrate that
the system resolved the pronoun, or that the second query improved these cases.
Use independent, counterbalanced referents and more natural assistant-topic
transitions in the next evaluation. The post-fix run reuses development cases,
not held-out cases; one answer per condition cannot support statistical claims.

Local evidence (ignored `artifacts/` under the evaluation checkout):

- [v1 raw run](../artifacts/generation-challenges-challenge-baseline-v1.json)
  and [v1 summary](../artifacts/challenge-summary-baseline-v1.json);
- [v2 raw run](../artifacts/generation-challenges-challenge-continuation-v2.json)
  and [v2 summary](../artifacts/challenge-summary-continuation-v2.json);
- [v2 emulator regression report](../artifacts/fault-smoke-continuation-policy-v2.json).

All final generation and emulator source hashes match the implementation.
The existing fault suite passed **68 checks** with no uncaught primary-page
errors, remaining emulator collections, or journal residue. **51 unit tests**
passed on Node.js 20.12.0 and 24.15.0. Real credentials stayed in the existing
ignored file and process/browser memory, with no copy in this worktree and no
known secret in the reviewed reports or publishable files. This is an
experimental behavior improvement; no release or deployment occurred.

## Review regression — 2026-09-28

PR #7 review identified that aggregation omitted the already-recorded hashes of
`scripts/generation-smoke.mjs` and `scripts/generation-cleanup.mjs`. Both hashes
are now required and compared across reports, preventing resumed evaluations
from combining different request-capture or cleanup implementations. Regression
tests reproduced the omission and now reject changed or missing hashes for each
harness. All **53 unit tests** pass on Node.js 20.12.0 and 24.15.0.

The existing live reports were reaggregated separately with the stricter checks:
[v1 reviewed summary](../artifacts/challenge-summary-baseline-v1-reviewed.json)
and [v2 reviewed summary](../artifacts/challenge-summary-continuation-v2-reviewed.json).
Their sample rows and metrics are unchanged, and both harness hashes match the
current files. This review fix changes only offline aggregation, tests and
documentation; no additional model calls or live/emulator runs were made.
