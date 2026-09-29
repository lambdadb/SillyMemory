# Independent prior-user retrieval — 2026-09-29

The v3 query policy searches the latest anchor and preceding user turn
independently. It fixes the observed Korean banner-reference selection miss
without increasing the 400-token memory budget. The source was already in the
old candidate lists; this result does not establish an ANN defect.

## Controlled selection comparison

The [protocol](context-selection-evaluation.md) and diagnostic were fixed before
comparison calls, then committed as `00e4707`. All recorded source hashes match
that commit. The comparison ran on the PR #17 baseline, before the runtime edit.
The original report records end-of-run hashes; subsequent harness runs also
capture initial hashes and reject source changes during execution.

All 32 cases across three existing synthetic fixtures were included: 16 natural,
8 speaker and 8 long-dialogue cases. Six are unknown questions, leaving 26
required sources. Cases overlap and are not 32 independent held-out examples.
Each distinct query ran once; variants reused exactly the same returned hits.
The production selector, native excerpt labels, pinned host tokenizer and each
fixture's existing 400/800-token budget were retained. No generation model was
called by this diagnostic.

| Query pair | Required sources selected | Previously selected sources lost |
| --- | ---: | ---: |
| Question + question/previous-two concatenation (v2) | 25/26 | — |
| Question + previous-two without the question | 25/26 | 0 |
| Question + prior user turn independently (v3) | 26/26 | 0 |

For `ko-long-reference`, the question-only source rank stayed 7. The second-query
rank was 4 with the baseline, 14 after merely removing the question, and 2 with
the prior user turn alone. Only the last variant selected message 8 (zero-based),
using 330/400 tokens. The baseline repeated the original selected messages
39, 3, 1, 16 and 38 at 399/400 tokens. The predeclared decision rule therefore
selected prior-user, not context-only. The unchanged question-only search still
runs first in rank interleaving; no oracle or scores enter runtime selection.

The diagnostic passed 45 browser/proxy checks and recorded 266 LambdaDB
responses, including the deliberate invalid-key test. Both exclusively owned
collections were deleted and confirmed absent. Browser storage/settings and
reload key-reset checks passed. [Checked-in comparison evidence](results/context-selection-v1.json)
retains all query pairs, per-source ranks, selected indices, budgets, hashes and
status checks. Full synthetic hit payloads remain in the ignored raw artifact.

## Real-host generation follow-up

The unchanged long-dialogue-v1 fixture and 32-answer schedule ran with the v3
runtime, a new frozen plan, the same pinned host, gpt-4.1-mini-2025-04-14,
temperature 0, 2,048-token host context, recent window 12, memory budget 400 and
output limit 256. Source hashes matched before and after execution. Requests
originated in SillyTavern; the private test bridge forwarded the host's payload.
No direct-model substitute, answer-quality retry, prompt/rubric change or
post-result runtime adjustment was used.

| Measurement | Off | On |
| --- | ---: | ---: |
| Samples | 16 | 16 |
| Required old evidence in outgoing prompt | 0/12 | 12/12 |
| Korean banner-reference answers correct | 0/2 | 2/2 |
| Provisional strict passes | 4/16 | 12/16 |
| Known answers: correct / partial / incorrect / abstained | 0 / 0 / 0 / 12 | 8 / 2 / 2 / 0 |
| Unknown prices handled | 4/4 | 4/4 |
| Median provider prompt tokens | 1,729 | 1,007 |
| Median generation-path duration, excluding initial pacing | 1,231 ms | 2,254 ms |
| Maximum recalled content tokens | 0 | 400/400 |

All 16 off prompts were actually truncated. Both formerly missed banner answers
now say Soyeon brings the purple cloth banner on Wednesday evening. On-mode
required-source delivery improved from the [prior run](long-dialogue-results.md)'s
10/12 to 12/12. All selected text/roles, recent messages and persisted source were
validated through outgoing host requests. Content budgets include excerpt labels;
provider message envelopes remain outside that memory budget.

Within this new run, provisional paired scores give 8 improvements, 8 ties and
no regressions against off. This is **not** a no-regression claim against the
historical v2 run: v2 scored 11/16 on, while v3 scored 12/16. Both new English map
answers say "by" the stand and are conservatively partial under the unchanged
"in" rubric; the old run had one such partial. That source/rubric ambiguity
requires independent human adjudication and is not a proven model/extension
regression. Both Korean map answers still reverse the reported actors despite
receiving the right source and native role. The strict assistant quality gate
therefore remains false; the human gate is unset.

Assistant annotations were written after reading randomized answers and the
frozen evidence, before using the condition key for aggregation. The assistant
already knew the prior experiment and development objective, so these are not
independent blinded human judgments. The original unfilled human packet and
local HTML remain separate from assistant annotations. No oracle was revised.

All **389 live integrity checks** passed. **32/32 provider attempts** returned 200
without retry; the smallest upstream-start gap was 15,000.055 ms. **142 LambdaDB
requests** had no transport failure or HTTP 5xx. Both owned collections were
deleted and confirmed absent. Browser/settings key checks passed. Total provider
usage was 44,560 prompt and 817 completion tokens; embedding/LambdaDB cost is not
measured. These observations do not establish cost or latency improvements.

[Checked-in follow-up evidence](results/context-selection-long-v1.json) contains
all answers, memory text, target ranks, paired provisional rationale, identity
hashes and regression reports. The raw report byte SHA-256 is
`5be1e62dfb1ca8c4b64b844a94c1d0322645922812f2af27bee516dacd76d687`.

## Regression validation

- **105 unit tests** pass on Node.js 20.12.0 and 24.15.0. These include query
  boundaries, retained-answer exclusion, continuation anchoring and equality
  with the independently recorded candidate across all 32 comparison cases.
- **188 pinned-host emulator checks** pass, including two real host restarts,
  24 edit/swipe/delete cycles, stale-hit rejection, race cancellation, source
  preservation, key reset and zero remaining emulator collections. This uses
  an emulated LambdaDB service and does not establish provider quality.
- The older four contextual-retrieval scenarios were rerun through the real
  browser/proxy/LambdaDB path: **8/8 targets selected**, with and without a
  retained incorrect answer. All **16 lifecycle/check groups** pass across
  86 responses; cleanup, key reset and initial/final source hashes pass. The
  topic-switch and assistant-authored context scenarios remain successful on
  this small fixture. No generation calls were made by this regression run.
- Runtime/tool syntax, release metadata and whitespace checks pass. Local
  scans found no configured API keys in tracked files or generated artifacts.

## Runtime behavior and limits

The policy is `latest-anchor-plus-prior-user-v3`. Normal, regenerate and swipe
anchor on the latest nonempty user message and ignore its retained answer.
Continue anchors on the message being extended, including assistant text, and
uses the preceding user turn independently. Each query is capped at 6,000 UTF-16
code units; duplicates collapse. No earlier user turn means one query.

This can lose second-query coverage for an assistant-only topic introduction
before the first user question. An older user turn can also be unrelated. The
cohort does not establish general reference resolution. It tests source
selection; correct actor interpretation and unknown-answer behavior require
separate generated-answer review. Source/chunk sizes, recent-window settings,
local validation, remote cleanup and prompt-insertion behavior are unchanged.

## Reproduce

Install this worktree as the extension symlink in the pinned SillyTavern checkout.
Use a new artifact tag and plan name for each run. `SM_ENV_FILE` points to the
existing ignored credentials file; no copying or key persistence is needed.

```sh
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local \
  SM_ARTIFACT_TAG=next-selection node scripts/live-smoke.mjs --selection
```

Freeze a new plan before generation:

```sh
node scripts/natural-dialogue.mjs --output artifacts/next-plan.json --fixture long-dialogue-v1
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local \
  SM_NATURAL_PLAN=artifacts/next-plan.json SM_ARTIFACT_TAG=next-long \
  node scripts/generation-smoke.mjs --natural --retry-transient
```

The comparison deliberately retains its explicit historical baseline construction,
so rerunning it after the fix still compares the same three query pairs. A unit
check verifies current runtime queries against the recorded selected candidate
across all 32 cases. Changing fixture or query policy requires new evidence.


## Local review artifacts and remaining work

The ignored `artifacts/` directory contains `live-selection-context-v1.json`,
`generation-natural-selection-long-v1.json`, `selection-long-plan-v1.json`,
`live-context-prior-user-v3.json`, and `recovery-smoke-selection-v1.json`.
`selection-long-review-v1/` keeps the untouched human packet, separate key,
provisional assistant annotations, integrity summary and paired score.
`selection-long-human-review.html` is an unscored offline human-review form;
follow [the review workflow](human-review.md). Historical PR #17 artifacts remain
in their detached worktree and were not overwritten.

Next work should investigate reported-actor interpretation separately and obtain
independent human judgments, including the spatial ambiguity. Broader held-out
answer-quality tests, assistant-only first-turn references, World Info interaction
and long-duration personal use remain unverified. This is develop-branch work,
not a main promotion, release or deployment.
