# Long dialogue results — 2026-09-29

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

The reviewed PR #16 runtime completed the separately frozen 32-answer evaluation
without implementation changes. All 16 memory-off prompts were actually truncated
by the 2,048-token host limit. Required old evidence reached the outgoing prompt
in **0/12 answerable off samples and 10/12 on samples**. This shows a bounded
retrieval benefit under this configured limit, not general memory quality.

Provisional strict assistant scores are **off 4/16, on 11/16**: seven improved
pairs, nine ties and no regressions. Both modes handled all four unknown-price
samples without guessing. The **on-mode quality gate remains false** and the
human gate is unset. One partial score involves a source/rubric spatial ambiguity
and needs independent adjudication; it is not an established model defect.

## Frozen scope and identity

The [protocol](long-dialogue-evaluation.md) and
[fixture](../tests/fixtures/long-dialogue-v1.json) were committed as `53ed508`
before requests. Two new, related 64-message synthetic stories cover English and
Korean reported actions, corrections, contextual references and unknown prices.
They are curated development inputs with a shared scene structure, not held-out
personal-chat data. Cases and order were not changed after observing answers.

Runtime baseline: `cc37d44b2476b5a84a6bd76afd3891075a374d47` (PR #16).
Host: SillyTavern 1.19.0 at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
Model: `gpt-4.1-mini-2025-04-14`, temperature 0, output limit 256.
Host context 2,048, recent window 12, memory content budget 400. These stress-test
settings do not change the extension defaults. The model's maximum context is
not being measured. Each case ran off/on twice with counterbalanced order.

Fixture semantic hash:
`12ec656eb1909a9452dcafc6fb6ed7445d4aaaef0a75e333cb6a9914f7f3dbfb`.
Frozen plan byte SHA-256:
`7e003d34014bc40a78f2cd20476728f35a61b863a5b4846efa4622e26b618905`.
Raw report byte SHA-256:
`e07d5f6f48dd5a601c04cd41638a22b0688ca104f333fbd0711c84bea25d8df3`.
[Checked-in evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/long-dialogue-v1.json) preserves source hashes,
all answers, memory text, ranks, usage, source lengths, provisional rationale and
paired results. Current evaluated files and the plan match the recorded hashes.

## Results and interpretation

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Samples | 16 | 16 |
| Strict provisional passes | 4 | 11 |
| Known answers: correct / partial / incorrect / abstained | 0 / 0 / 0 / 12 | 7 / 1 / 2 / 2 |
| Unknown price handled | 4/4 | 4/4 |
| All required old evidence in outgoing prompt | 0/12 | 10/12 |
| Median provider prompt tokens | 1,729 | 1,043 |
| Median generation-path duration, excluding initial pacing | 1,238 ms | 2,182 ms |
| Median retrieval duration | — | 828 ms |
| Maximum recalled content tokens | 0 | 399/400 |

Host-tokenized source text was 2,643–2,669 English tokens and 3,853–3,886 Korean
tokens. The adapter checked overflow before each generation and actual omitted
source messages in each outgoing baseline. Recent complete messages and source
chat remained intact in both modes. The reported on-mode content budget includes
labels; provider message envelopes and overall fitting remain the host's job.

The lower prompt-token median is observed only for these cases/settings, with a
higher generation-path median that includes retrieval. Total provider usage was
44,708 prompt + 888 completion tokens. Embedding/LambdaDB usage and cost are not
measured, so this is not a total cost-saving claim. Repetitions are not independent
samples of a broader population, and earlier trials are not pooled with this run.

### Separate remaining failure modes

1. **Selection/ranking under the memory budget:** both Korean banner-reference
   samples found the exact source at rank 4 in the contextual query and rank 7 in
   the question-only query. It did not reach selected memory or the outgoing
   prompt. The selected source indices were 39, 3, 1, 16 and 38, using 399/400
   tokens. The model then abstained. This is a target present among candidates but
   absent from the bounded selection; it does not establish an ANN miss. Testing
   query/ranking or passage-selection changes requires a separate controlled run.
2. **Actor interpretation after successful retrieval:** both Korean map answers
   received the exact source in a native user-role message, then repeated its
   second-person report as if spoken by the assistant. They assigned the map action
   to the user and claimed the user's packaging/observation as their own. Correct
   retrieval and API roles therefore do not guarantee correct actor attribution.
3. **Human adjudication needed for spatial wording:** one English answer correctly
   identified the user and supported assistant observation but said the map was
   “by” the umbrella stand. The frozen required meaning says “in”; the source says
   “to the ... stand” and “put it there.” It was conservatively marked partial
   under the frozen meaning. The source itself leaves room for interpretation,
   so this should not be counted as a proven implementation failure. Keep the
   source, rubric and provisional annotation intact for independent review.

All off-mode known-fact answers abstained after losing their evidence to context
truncation. Their answers are not evidence that the original full source lacked
the facts. The unknown price was unspecified in the full source and was handled
correctly in all eight off/on samples. No extra paid run was used to tune these
answers or remove failures. The previous speaker diagnostic remains unresolved.

## Execution, cleanup and local checks

- **389 real-host/live integrity checks**, 32 completed OpenAI answers. All 32
  upstream attempts returned 200 first time; no retry was needed.
- Minimum actual upstream-start interval **15,000.023 ms**, with no gap below
  15 seconds. The existing bounded transport policy remained unchanged.
- **142 LambdaDB requests**, no transport failures or HTTP 5xx. Both owned test
  collections were deleted and API disappearance verified. No pending cleanup
  record remains; provider backup erasure is not established.
- Browser and persisted-settings key audits passed. A local secret scan of the
  repository and generated reports/forms/logs found no configured keys.
- **102 unit tests** passed on Node.js 20.12.0 and 24.15.0; runtime/tool syntax,
  release metadata and whitespace checks passed. No extension runtime changed.
- The new offline human-review form passed **eight local Chromium checks** for
  literal source text, draft/resume, protected output, valid completion and export;
  the UI test made no network requests and produced no real human quality scores.
  Historical emulator crash/recovery results were not rerun for this tooling work.

## Human review and next work

Follow [human-review instructions](human-review.md). The local HTML is populated
only with the unfilled blinded packet, not assistant grades. Reviewers get the
source, rubric and randomized answers but not condition mappings. Downloaded
annotations are validated against the original report before computing a human
score. Ambiguous judgments should receive a second review rather than a changed
oracle. Assistant labels remain explicitly provisional.

Local artifacts (ignored in Git):

- `artifacts/generation-natural-long-dialogue-v1.json`: full live report.
- `artifacts/long-dialogue-plan-v1.json`: pre-execution plan.
- `artifacts/long-dialogue-review-v1/`: unfilled packet, separate condition key,
  assistant annotations, paired score and integrity summary.
- `artifacts/long-dialogue-human-review.html`: unscored human form for this run.
- `artifacts/speaker-native-human-review.html`: unscored human form for the prior
  PR #16 run; do not pool those assessments with this evaluation.
- `artifacts/review-ui-smoke.json`: synthetic UI test evidence.

Next implementation work should target the candidate-to-budget selection failure
with controlled query/selection comparisons, while retaining actor-attribution
failures and obtaining independent human judgments. This run does not verify
World Info integration, other hosts/providers, hours/days of use or readiness for
main promotion, a release or deployment.
