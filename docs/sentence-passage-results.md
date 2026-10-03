# Sentence passage replay results

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Neither fixed candidate passes the conservative source-retention gate. The
production extension keeps its existing whole-passage selector. This work adds
an offline excerpt selector, regression tests and reproducible evidence; no
runtime, indexed document, API key handling or service behavior changes.

The [protocol](sentence-passage-evaluation.md) was written before the first
candidate replay and is hashed in the report. Two candidates select one sentence
or two adjacent sentences using query-only lexical similarity, then try to
restore full parent passages if budget permits. Native speaker roles, source
headers, explicit omission markers and exact source offsets are preserved.
No additional candidate or threshold was introduced after observing results.

## Results and interpretation

All **218 baseline configuration rows** exactly reproduce PR #23's selection
and token counts with the pinned host tokenizer. Required-source coverage uses
unchanged original evidence quotes, not merely a selected parent document:

| Policy | Search 320 | Search 400 | Search 800 | Recorded generation hits 320 | Baseline source losses / gains |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whole passage baseline | 48/54 | 54/54 | 54/54 | 26/28 | 0 / 0 |
| One sentence | 28/54 | 28/54 | 34/54 | 4/28 | 89 / 1 |
| Two adjacent sentences | 46/54 | 49/54 | 51/54 | 26/28 | 11 / 1 |

The 62 search cases retain their original recent windows (48 at 12, 14 at 8)
and reuse their recorded ranks across budgets. The generation cohort is 16
cases repeated twice, at recent 8/effective 320. These overlapping synthetic
inputs provide 190 required-source observations, not 190 independent samples.
Unknowns remain in source/token checks but not the coverage denominator.

A parent containing the required quote is selected but the full quote is absent
from its excerpt in **96 one-sentence** and **16 two-sentence** observations.
Counting parent IDs alone would incorrectly mark these complete. The only new
full-quote success for either candidate is the Korean long-dialogue reference at
320. Neither restores both historical Korean generation targets under the
unchanged full-quote rubric, and both lose previously selected full quotes.

These are **source-retention losses, not measured answer regressions**. Some
legacy rubrics quote an entire paragraph, including context beyond the minimal
answer. For example, in both Korean historical assistant-topic repetitions the
one-sentence candidate includes the precise actor/object/time sentence:

> 자주색 천 현수막은 소연이 수요일 저녁에 가져오기로 했어요.

It fits at **319/320 tokens**, with a later-source omission marker. The required
legacy quote also contains preparation details and a different person's object
and schedule. Those sentences are absent, so this result is a partial parent
match and fails the declared gate. It suggests potential answer coverage but
**no new answer was generated or graded**. The two-sentence candidate does not
select that parent (299 tokens used in the first repetition).

In the Korean correction control at 320, both excerpts retain the corrected
3:35 time and the cancellation of 2:15, but omit part of the original quoted
paragraph. They also fail the full-quote rubric. This illustrates why the
conservative metric must not be mislabeled as generated-answer accuracy.
Other source losses are retained in the full report rather than being waived.

Shorter excerpts are not automatically cheaper: speaker/source headers and
omission markers consume tokens. The first pass can fill available space with
partial parents, leaving too little room for whole-parent restoration. A first
pass window that does not fit is skipped even if a different rendering of the
parent might fit. These are limitations of the tested, fixed policies, not
proof that every sentence-based design must fail.

## Validation and limits

- **151 unit tests pass locally on Node 24.15.0.** New checks cover exact Unicode
  source partitions, deterministic query-only windows, invalid remote copies
  before deduplication, cross-scope/deleted-source exclusion, macro escaping,
  native roles/order, full rendered budgets, unavailable token counts, omission
  markers and partial-source accounting.
- Full offline replay completed all 218 rows. Every excerpt maps to a valid
  source message/chunk and contiguous offset range; all original required quotes
  and negative results remain in the report. Producer/protocol/input hashes are
  verified against the checked-in evidence.
- Runtime/development syntax, release metadata and whitespace checks pass.
- **Zero new service, embedding or generation calls.** No browser/emulator run,
  new ANN observation, independently graded answer or deployment is claimed.

The sentence splitter is a bounded punctuation heuristic, not a linguistic
parser. Abbreviations can split, and selecting a contiguous exact quote still
can omit a later negation or speaker clarification. Unit checks establish
provenance/rendering behavior, not semantic safety in arbitrary conversations.
This experiment shortens already-returned parent passages; it does not test
separately indexed sentence embeddings or associated ID/migration behavior.

## Reproduce and decide the next experiment

From this result's recorded revision, install development dependencies and use
SillyTavern 1.19.0 at `06bde939fb1e9c4c8d8641d810f0a916b5bce127` with its pinned
tokenizer dependency (`tiktoken` 1.0.22). The host need not run; no credentials
are read. Use a new output filename to preserve evidence:

```sh
npm ci
npm test
npm run check
npm run check:release
ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
  node scripts/sentence-passage-replay.mjs artifacts/sentence-next.json
```

Review the [selector](../scripts/sentence-passages.mjs),
[runner](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/scripts/sentence-passage-replay.mjs),
[tests](../tests/sentence-passages.test.js) and
[full result](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/sentence-passage-replay-v1.json).

Stop tuning ranking/splitting on these known cases. Before another optimization,
define a fresh semantic fixture that distinguishes the minimum answer-bearing
span from mandatory cancellation, qualification and speaker context. Freeze
those criteria before a candidate run, retain the historical full-quote losses,
and obtain semantic review before treating partial snippets as success. That
would be a new evaluation, not a retroactive pass for either candidate here.
Paraphrase and actor/perspective errors remain separate unresolved work.
