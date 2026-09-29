# Actor labels and surrounding context — results, 2026-09-29

Both excerpt labels and surrounding-context removal contributed to actor errors
in this controlled development sample. Removing labels improved the sparse
condition from **2/8 to 6/8** provisional strict passes, but did not restore the
complete-history baseline's **8/8**. No runtime fix or release-readiness claim
follows from this small experiment; independent human review is pending.

## Experiment and results

The [protocol](actor-ablation-evaluation.md), [fixture](../tests/fixtures/actor-ablation-v1.json)
and harness were frozen in `2554080` before calls. Four pronoun cases from the
[previous diagnostic](actor-perspective-results.md) each ran four conditions twice.
Every old selected passage, including distractors, came from the prior first
memory-on repetition; no new retrieval or oracle-based selection occurred.
Native roles, source order, participant names, questions and model instructions
were fixed. Full-labelled adds production labels only to the same selected
messages; sparse-raw removes labels without adding replacement passages.

| Reporting source → actual actor | Full raw | Full labelled | Sparse raw | Sparse labelled |
| --- | ---: | ---: | ---: | ---: |
| English user → assistant | 2/2 | 0/2 | 0/2 | 0/2 |
| English assistant → user | 2/2 | 2/2 | 2/2 | 0/2 |
| Korean user → assistant | 2/2 | 0/2 | 2/2 | 0/2 |
| Korean assistant → user | 2/2 | 2/2 | 2/2 | 2/2 |
| **Total** | **8/8** | **4/8** | **6/8** | **2/8** |

Each condition had eight answers. Both repetitions agreed on pass/fail for every
case and condition. All twelve incorrect answers gave the correct map location
but the wrong actor. One also reversed the observer's action. Omitting optional
observer details did not fail an otherwise correct answer.

Adding labels caused four paired regressions with full context and four with
sparse context. Removing surrounding history caused two paired regressions
without labels and two with labels. There were no strict-pass improvements in
those directions. These aggregate counts hide case-specific interactions:

- English user reports failed with either labels alone or sparse context alone.
- English assistant reports failed only with sparse context plus labels.
- Korean user reports failed with labels at both context sizes; unlabelled sparse
  context remained correct.
- Korean assistant reports passed all four conditions.

Labels are therefore implicated even when no history is omitted. Surrounding
context also matters, including an error that persists after label removal.
Neither ANN ranking nor absent answer evidence can explain these controlled
differences: the selected source set was frozen, every required source appeared
exactly once in its original API role, and no retrieval ran during generation.
This does not settle other retrieval misses, including the separate assistant-topic
budget failures. It also does not identify a model-internal mechanism or prove a
general effect across chats, languages or models.

## Actual execution and limits

SillyTavern 1.19.0 at `06bde939fb1e9c4c8d8641d810f0a916b5bce127` generated the
requests through its normal UI/Generate path. A test-only interceptor modified
the ephemeral prompt array, while production retrieval was disabled. The private
bridge forwarded the host-generated payload unchanged to
`gpt-4.1-mini-2025-04-14`, temperature 0 and maximum 256 output tokens.
This is a real-host/live-model prompt ablation, **not a new retrieval or sync E2E**.
Shared harness setup and cleanup still used the real LambdaDB proxy.

- **197 integrity checks** passed. All 32 requests returned HTTP 200 on the first
  attempt, with complete answers matching saved host responses.
- All full prompts retained 64 source messages. Sparse English prompts retained
  six selected + eleven recent source messages; Korean retained five + eleven.
  The new question was preserved in every condition. Exact text, roles, order,
  labels, three system messages and one interceptor invocation were verified.
- All **16 reference-condition requests** (full-raw and sparse-labelled across
  both repetitions) exactly matched the corresponding previous first-repeat
  prompt **and request options**. Other than the intended label/context changes,
  the controlled pipeline did not change those reference inputs.
- The labelled selected slice used 361, 367, 396 and 398 tokens by case, unchanged
  across all conditions and within the 400-token budget. `memoryTokens` in the
  evidence means this fixed reference slice, not per-condition total prompt size
  or freshly retrieved memory. The actual full contexts fit the 8,192-token cap.
- Usage was **74,520 prompt + 717 completion tokens**. Minimum provider-start gap
  was **15,000.060 ms**. No transient or answer-quality retries occurred.
- All **14 LambdaDB requests** completed; the four 404s were expected absence
  checks during setup/cleanup. Both owned test collections were deleted and their
  absence verified. Browser/persisted settings and repository/artifact key audits
  passed; no pending cleanup record remains. Embedding/service cost is unmeasured.
- Initial/final evaluated source hashes matched. Runtime files remain identical
  to PR #18/develop. **111 unit tests** passed on Node 20.12.0 and 24.15.0; runtime
  and development syntax, release metadata and whitespace checks passed. The
  previous actor report still passes the updated offline summary verifier.
  Historical emulator results were not rerun or counted as new evidence.

These are four previously examined development cases, two repetitions each, one
model snapshot and one synthetic history per language. Source labels add tokens
and alter how a passage is framed; the experiment does not isolate individual
label fields or their token cost. Do not generalize the counts into accuracy
estimates or tune repeated prompts on these same failures until they pass.

## Review and next decision

[Committed evidence](results/actor-ablation-v1.json) records all answers, provisional
semantic rationales, all four paired contrasts, source indices, prompt hashes,
fixed-selection identities, exact historical reference checks and lifecycle data.
Scores were assigned from randomized answer records before opening their condition
key; the assistant knew the experiment objective, so this is not independent human
review. The original human packet remains unscored. Diagnostic gates are unset;
the earlier product quality limitation remains unresolved.

The local offline form `artifacts/ablation-human-review-v1.html` was opened and
checked at 0/32 completed. Use the [human-review workflow](human-review.md), giving
an independent reviewer only that form, without this result table, condition key
or assistant annotations.

The next implementation candidate can test label removal while preserving native
roles and literal-text protections, and separately test surrounding-turn retention
for the residual English user-report failure. Any candidate needs a frozen
comparison against current behavior under the same budget, broader/held-out
reported-speech cases and existing isolation/injection-safety regressions. The
present run does not authorize a blanket pronoun rewrite or prove that adding a
neighboring turn will solve the residual error. No further model calls or runtime
changes were made after this fixed diagnostic.

Raw report byte SHA-256:
`5b37eef64d0d111553efc90400e9c1fbfc3e0d5253ccd4c9bfbec64f3559afef`.
Fixture semantic hash:
`0ab79ff869e469a32cbcf7254d0d04ecaa21231a1538287a078a26c281aabc40`.
Local ignored artifacts: `generation-natural-ablation-v1.json`,
`ablation-plan-v1.json`, `ablation-review-v1/` and the HTML form under `artifacts/`.
Reproduce with the frozen-plan commands in the protocol and fresh output paths.
