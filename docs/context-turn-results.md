# Context-turn selection

Runtime `latest-anchor-with-context-selection-v5` keeps at most two searches. It
replaces the prior-user context only when a newer assistant turn has more than
1.25 times its lexical similarity to earlier conversation messages. Missing user
context retains v4's fallback. Primary anchoring, query bounds, interleaving,
local-source validation, token budgets and failure/cancellation behavior remain
unchanged. This is a bounded local lexical heuristic, not semantic reference
resolution; see [the query policy](query-policy.md).

## Frozen live search comparison

Before new live searches, the [protocol](context-turn-evaluation.md) froze two
candidates: relative comparison and a fixed assistant-score threshold. Development
replay of 38 previously recorded hit sets had selected 32/32 targets at relative
factors 1.0 and 1.25. That replay used known data and is not independent evidence.
The more conservative 1.25 was fixed before writing new source conversations.

The real SillyTavern 1.19.0 browser/built-in proxy comparison then ran all 48 prior
fallback cases and 14 new English theatre/Korean observatory cases. The new source
text, people, objects and schedules differ, while input shapes derive from prior
failures. Distinct queries were searched once per case with live LambdaDB managed
embeddings; both candidates and v4 shared the exact returned hit lists. No quality
retry, answer oracle, extra generation call or LambdaDB change was involved.

| Required-source cohort | v4 | Relative | Topical-latest |
| --- | ---: | ---: | ---: |
| Previous 48 cases | 41/42 | 42/42 | 42/42 |
| New 14 cases | 12/12 | 12/12 | 12/12 |
| Total | 53/54 | 54/54 | 54/54 |

Eight unknown cases have no required-source coverage score. Both candidates met
the fixed rule without a baseline-selected source loss; the preregistered priority
selects Relative. The new corpus supplies regression coverage, **not an additional
comparative gain**, because v4 already selected all twelve answerable targets.

For `boundaries/ko-assistant-topic`, v4's unrelated user context did not return
the required banner source. The primary query returned it at rank 7, outside the
selected budget. The newer assistant context returns it at rank 2; v5 selects it
in 330/400 content tokens (v4 used 394/400 without that source). Relative changes
eight context choices across the full cohort, including four Korean workshop
cases, the known boundary and three fresh controls. All selections and both
candidate policies are retained in [the comparison evidence](results/context-turn-search-v1.json).
The new English assistant-topic and both paraphrase cases do not switch under
Relative; their target selection alone does not demonstrate topic resolution.

All 74 live integrity checks passed across 388 responses: 287 HTTP 200, two 201,
95 accepted writes, one expected invalid-key 400 and three expected absence 404s.
The source remained frozen during execution; session-key/reload checks and
owned collection cleanup passed. The search report identifies the pre-integration
v4 runtime plus the frozen candidate module. Later runtime parity tests and the
separate generation run establish which code was integrated.

## Follow-up evidence

The [generation preflight amendment](context-turn-generation.md) preserves the
original search protocol and records a separate generation fixture at context
1,536: the 14 new cases plus both historical assistant-topic boundaries, off/on
twice each (64 answers). Local pinned-tokenizer preflight found the new English
source was shorter than the originally proposed 2,048 context. This correction
and the two historical controls were frozen before the first model call.

Actual SillyTavern Generate, live LambdaDB and OpenAI
`gpt-4.1-mini-2025-04-14` completed all 64 answers. Temperature was 0, maximum
output 256, recent window 8 and configured memory budget 400. Every source
exceeded context, and all 32 off prompts were actually truncated.

The **effective** memory budget was 320, not 400: the pinned host passes
`1536 - 256 = 1280` prompt tokens to the interceptor, which caps memory at one
quarter. The preflight amendment checked source overflow but did not identify
this cap before the run. The configured 400 remains an upper bound; the smaller
cap and recent-window change limit comparison with the 400-token/recent-12 search
boundary. No settings or answers were adjusted after observing this result.

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Answers | 32 | 32 |
| Required old source delivered | 0/28 | 26/28 |
| Provisional strict passes, including unknowns | 4/32 | 28/32 |
| Correct known answers | 0 | 24 |
| Partially answered paraphrases | 0 | 2 |
| Abstained from known answers | 28 | 2 |
| Unknown prices handled | 4/4 | 4/4 |
| Maximum memory content tokens | 0 | 320/320 |

Two distinct failures remain, in both repetitions:

- **Historical Korean assistant topic:** the target is returned at primary rank 7
  and assistant-context rank 3, but not selected. The model abstains because the
  source never reaches its prompt. This remains an end-to-end miss under these
  generation settings, despite the earlier search-configuration recovery.
- **New Korean paraphrase:** memory delivers the correct source and the model
  names Yujin/Monday evening, but it treats the synonymous tangerine paper lamp
  as unspecified rather than resolving it to the orange paper lantern. These
  are partial answers, not strict passes. The English paraphrase passes twice.

The remaining new shapes and English historical boundary pass with memory.
Paired strict results are 24 improved, eight tied and zero regressed, comparing
**v5 off/on**, not v4/v5 generated answers. The assistant quality gate is **false**;
independent human review remains unset. These scores were manually assigned after
reading randomized records against full source/rubrics, before condition-key
aggregation. This assistant knew the development objective, so the review is not
independent or blinded human evidence. All rationales and failures are retained.

All **773 live integrity checks** passed. All **64 first provider attempts** were
HTTP 200, with no retry; minimum measured start spacing was 15,000.071 ms.
Frozen source hashes, source roles, recent/question retention, source immutability,
session-key audits and owned/native cleanup passed. Provider usage was 60,646
prompt and 1,602 completion tokens; managed embedding usage/cost was not measured.
No general latency or cost claim is made.

[Checked-in generation evidence](results/context-turn-generation-v1.json) retains
all answers, memory text/hits, source delivery, provisional judgments, provider
attempts, source identities and the recovery report. Raw report byte SHA-256:
`fcf8dffc7e2c9ba594e7f686c91d5431da120157df31629e6aac337e4c99d8cd`.
The separate local `artifacts/context-turn-human-review.html` was opened and
checked: all 64 records remain unscored and reviewer identity is empty. No human
annotations were submitted.

## Post-result budget diagnosis

An offline replay using recorded hits and the pinned host tokenizer exactly
reproduced all 32 live on-mode selections, token counts and selected IDs. It made
no new service/model calls. For both historical Korean misses:

| Recorded-hit replay | Target selected | Used tokens |
| --- | ---: | ---: |
| Recent 8, effective budget 320 (actual run) | No | 320 |
| Recent 8, budget 400 | No | 398 |
| Filter to recent 12, budget 320 | No | 250 |
| Filter to recent 12, budget 400 | Yes | 340 |

Recent 8 indexes four more old messages than recent 12. One newly eligible
message takes the assistant stream's first rank, moving the target to third.
The smaller cap independently prevents selection in the filtered replay; raising
only the budget to 400 does not repair this recorded case. Recent-12 replay
filters the recorded top-30 lists and is **not** a new managed query or generation.
It does not establish performance at a different configuration. The evidence
locates the observed loss in candidate competition/selection, not missing ANN
candidates; it is not an ANN-versus-exact benchmark.

See [replay evidence](results/context-turn-budget-replay-v1.json) and the
[replay tool](../scripts/context-turn-budget-replay.mjs). Runtime settings,
thresholds and ranking were not tuned after these results. A next experiment
should freeze **effective** host budgets and recent windows before comparing
selection changes, and retain the paraphrase failures as separate semantic tests.

## Runtime regression

137 unit tests pass on Node.js 20.12.0 and 24.15.0. Coverage includes exact parity
with the frozen candidate over 62 cases and four anchor types, recorded-query
parity, reference-window/text bounds, Unicode normalization, ineligible history,
replacement-answer exclusion, failed-sibling cancellation and late-result rejection
on the new assistant-selection path. Historical query evidence remains tested
against its frozen policy rather than being rewritten as v5 behavior.

Runtime/development syntax and release checks pass. The pinned real host with
emulated LambdaDB passes 188 recovery checks, including two actual process
crashes/restarts and 24 edit/swipe/delete cycles, with zero browser page errors
and zero remaining emulator collections. This emulator result is separate from
live search, actual generation and provisional semantic review. No main promotion,
release or deployment was performed.

## Limits and reproduction

The fixed heuristic ignores words shorter than three characters and references
older than its last 256 eligible-message window. It can mistake quotations or
miss paraphrases. English/Korean synthetic coverage does not establish other
languages, real-chat quality, general actor attribution, ANN recall or release
readiness. The previously observed actor/perspective failures remain a separate
open problem. Independent human semantic review remains pending.

Install the worktree extension in the pinned host's
`public/scripts/extensions/third-party/sillymemory` directory, then run:

```sh
npm ci
npm test
npm run check
npm run check:release
SM_ENV_FILE=/absolute/path/to/.env.local ST_SOURCE=/pinned/host \
  SM_ARTIFACT_TAG=turn-next node scripts/live-smoke.mjs --context-turn
ST_SOURCE=/pinned/host SM_ARTIFACT_TAG=turn-next \
  node scripts/browser-smoke.mjs --recovery
node scripts/natural-dialogue.mjs --output artifacts/turn-next-plan.json \
  --fixture context-turn-generation-v1
SM_ENV_FILE=/absolute/path/to/.env.local ST_SOURCE=/pinned/host \
  SM_NATURAL_PLAN=artifacts/turn-next-plan.json SM_ARTIFACT_TAG=turn-next \
  node scripts/generation-smoke.mjs --natural --retry-transient
```

Live commands incur usage. Preserve unique tags, all failures and any pending
cleanup file. The shared-query search mode compares frozen v4/candidates on
either runtime; a new result is a separate service observation. Do not combine
historical and current reports as if they were one experiment.

Replay the recorded generation misses without service calls:

```sh
ST_SOURCE=/pinned/host node scripts/context-turn-budget-replay.mjs \
  docs/results/context-turn-generation-v1.json artifacts/turn-replay-next.json
```
