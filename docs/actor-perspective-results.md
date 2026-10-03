# Reported actors and assistant-topic boundaries — 2026-09-29

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

The controlled actor diagnostic found **six memory-on actor errors that were
absent with the complete source history**. Provisional strict scores are off
16/16 and on 10/16. Required evidence and native API roles were correct in every
sample. This is a memory-condition regression on this fixture, not an ANN miss
or a basis to dismiss the problem as a model-only baseline failure.

No extension runtime changed from PR #18 (`2a5e83f`). This work adds reproducible
diagnostics and records negative evidence. The assistant quality gate remains
false, and independent human review is pending. Do not promote this result as a
quality fix or stable-release readiness.

## Frozen actor experiment

The [protocol](actor-perspective-evaluation.md), [fixture](../tests/fixtures/actor-perspective-v1.json)
and prompt-integrity assertions were committed as `612ac23` before model calls.
Eight cases cross language, reporting speaker and pronoun/explicit-name wording,
with two off/on repetitions: 32 answers. Within a wording pair only the reported
source message changes; the question, surrounding 64-message history, source
roles and expected actor/location stay fixed.

The existing host harness requests a reply as `SillyMemory E2E Mira`, but earlier
fixtures used other assistant names in source labels. The new fixture matches
source names to the actual host identity and verifies both. This removes that
confound for this run; it does not show that name alignment caused a difference
from historical trials. We also made the new container wording unambiguously
"in" and used a different context limit. Historical fixtures/oracles are unchanged.

Host: SillyTavern 1.19.0, `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
Model: `gpt-4.1-mini-2025-04-14`, temperature 0, output limit 256, unchanged
natural-dialogue instruction. Context 8,192, recent window 12, memory budget 400.
Every off request retained all 64 source messages; every on request contained the
required passage in its original API role. The test bridge forwarded the real
SillyTavern payload; it did not replace the host with direct synthetic API calls.

| Language | Reporter → actual actor | Wording | Off correct | On correct |
| --- | --- | --- | ---: | ---: |
| English | user → assistant | you / I | 2/2 | 0/2 |
| English | user → assistant | explicit names | 2/2 | 2/2 |
| English | assistant → user | you / I | 2/2 | 0/2 |
| English | assistant → user | explicit names | 2/2 | 2/2 |
| Korean | user → assistant | 네가 / 나는 | 2/2 | 0/2 |
| Korean | user → assistant | explicit names | 2/2 | 2/2 |
| Korean | assistant → user | 네가 / 나는 | 2/2 | 2/2 |
| Korean | assistant → user | explicit names | 2/2 | 2/2 |

All six incorrect answers gave the right location but the wrong actor. For a user
report about the assistant, the failed answer repeated "You" / "네가". For the
English assistant report about the user, the failed answer instead claimed "I".
So this is not uniformly copying a pronoun; failures reversed actors in both
reporting directions. The paired result is 0 improvements, 10 ties, 6 regressions.

Explicit-name controls passed 8/8 in each mode; pronoun cases passed off 8/8,
on 2/8. This supports sensitivity to source wording in this development sample.
It does **not** justify blindly replacing pronouns in real chats, where reported
speech, multiple participants and context can change their referents.

Memory-on differs from full history in both source labels and omitted surrounding
messages. Named variants can also alter ranking, token costs and other selected
passages. This run does not isolate those effects or prove a model-internal cause.
The appropriate next control is to hold the selected source set/roles/order fixed
and separate labels from surrounding-context removal before proposing a runtime
change. Do not repeat prompt wording tweaks until these same cases pass.

The [completed label/context ablation](actor-ablation-results.md) now separates
those factors with frozen selections: full-raw 8/8, full-labelled 4/8,
sparse-raw 6/8 and sparse-labelled 2/8 provisional strict passes. Both labels and
surrounding-context removal contributed in these cases; label removal alone left
two errors. This follow-up did not change the runtime.

Earlier [native-role trials](speaker-attribution-results.md) had failures in both
modes on a different corpus; that observation remains valid for those trials.
It cannot explain away the new six off-correct/on-wrong pairs. Conversely, the
old [overflow evaluation](context-selection-results.md) still demonstrates its
bounded source-retrieval benefit. These cohorts/settings must not be pooled.

## Assistant-topic search boundaries

The separate [six-case protocol](context-edge-evaluation.md) was frozen as
`e5b5e1d` before its live queries. It reused the old long-dialogue banner facts,
400-token budget and production selector. Each distinct query ran once; current
v3 and historical v2 reused the exact same response per query text. No generation
model calls or quality retries occurred.

| Case | v3 selected | v2 selected |
| --- | --- | --- |
| English first-user, imported assistant-only history | yes | yes |
| English assistant topic, generic question | yes | yes |
| English explicit question after unrelated topic | yes | yes |
| Korean first-user, imported assistant-only history | no | no |
| Korean assistant topic, generic question | no | no |
| Korean explicit question after unrelated topic | yes | yes |

Both policies selected 4/6 targets. Both explicit topic switches succeeded. The
Korean generic question returned the target at rank 7; v2's concatenated context
returned it at rank 5, but neither policy selected it within budget. In the normal
assistant-topic case, v3's unrelated preceding-user query did not return the target
in its top 30. Rank 0 in the report means absent, not a first-place result.

This confirms an unresolved assistant-topic boundary, not a newly demonstrated
v3-only regression: v2 also failed. Returning to v2 would also lose the separately
verified user-topic benefit. The unusual first-user case has many imported or
continued assistant messages; an ordinary single greeting has no indexable old
history. These observations are not six generated-answer scores or an ANN verdict.

## Validation and resource accounting

- **373 real-host actor integrity checks** passed. All 32 model attempts returned
  HTTP 200 without retry. Required evidence reached 16/16 off and 16/16 on
  prompts, with exact expected API roles and verified host identity. Off baselines
  retained 64/64 source messages. Maximum recalled content was 399/400 tokens.
- The actor run recorded **142 LambdaDB requests**, no transport/HTTP 5xx failures,
  and verified deletion/absence of both owned collections. Initial/final evaluated
  source hashes matched. The minimum actual provider-start interval was
  **15,000.019 ms**; provider usage was 74,596 prompt + 750 completion tokens.
  Embedding/LambdaDB usage and cost are unmeasured; no cost-saving claim follows.
- The search-boundary run passed **18 lifecycle/check groups** over **80 proxy
  responses**, with initial/final source hashes, budget bounds, session-key audits
  and owned cleanup verified. Its `passed` field is an integrity result, despite
  the two retained quality misses.
- **108 unit tests** passed on Node.js 20.12.0 and 24.15.0, plus syntax, release
  metadata and whitespace checks. New assertions reject incomplete off histories,
  missing/duplicated/wrong-role sources and host/source identity drift. An offline
  re-summary of the historical PR #18 report also passed the updated verifier.
- No runtime files changed, so the prior 188 emulator recovery checks were not
  rerun or relabelled as new results. Current actor and boundary runs use real
  LambdaDB and the real host. Configured keys were absent from repository files
  and generated artifacts; no pending cleanup record remains.

## Review artifacts

[Actor evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/actor-perspective-v1.json) includes all 32 answers,
source meanings, provisional rationale, factor counts, prompt-role evidence,
selected text/ranks and source identities. [Search-boundary evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/context-edges-v1.json)
keeps all six comparisons, misses, budgets, queries and lifecycle status.

Raw actor report SHA-256:
`a3387673de8ab058f83bf17ccac5cd11b07eed63a1c30576794855c41b8c4518`.
Raw boundary report SHA-256:
`491d3531672a20e7a4f8a9ca68d22f1ff42382e8f00de6adb477cffb7070c92d`.
Fixture semantic hash:
`ecec3b4cac3683d7b7239d388331880a586669aa94ecbbd9f8d7b4dbe526db37`.

Local ignored artifacts are `generation-natural-actor-v1.json`, `actor-plan-v1.json`,
`live-context-edges-actor-v1.json`, and `actor-review-v1/` under `artifacts/`.
`actor-human-review-v1.html` is an unfilled, offline human form. Assistant judgments
were recorded from randomized answers before using the condition key; the assistant
already knew the development objective, so this is not independent human blinding.
Keep the human packet separate from assistant labels and the condition key, and
follow [the human-review workflow](human-review.md). The older spatial ambiguity
still needs a separate human judgment; this new unambiguous fixture does not
retroactively settle it.

Reproduce the actor run using the protocol's frozen-plan commands. Run the separate
search boundary with a new tag:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local \
  SM_ARTIFACT_TAG=next-edges node scripts/live-smoke.mjs --context-edges
```
