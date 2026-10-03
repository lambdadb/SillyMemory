# Vector memory budget confirmation

## Frozen protocol — 2026-10-02

Question: after boundary-aware indexing, does increasing the vector-only memory
budget from 800 to 1,600 improve final English answers without losing existing
correct answers? This follows the completed hybrid diagnostic, not a new ranker.
Use the shipped query construction, k/size 30, source validation and selection.
Keep recent 4, 32K context, output 256, temperature 0 and the pinned
`gpt-4.1-mini-2025-04-14` model. Compare only 800 and 1,600; no budget sweep.

Eight newly authored, frozen English histories cover two checklists, ledger
arithmetic, venue constraints, an updated booking, user/assistant attribution,
an unassigned replacement key and a single-fact control. They have not received
provider answers before this run. They were authored with knowledge of earlier
failure categories, so they are not an external or statistically independent
held-out benchmark. Each has 40 older turns and four neutral recent turns.
Histories fit 32K; this tests bounded memory selection, not context overflow.

Alternate budget order by case. The first arm obtains live managed-embedding
query results through the actual host proxy; the second reuses those exact
ordered candidates after verifying identical source document IDs and text.
Restore the source history between arms. Thus search variability cannot explain
a paired budget difference. Record which requests are live and which are replayed;
this is live generation on fixed candidates, not two fresh retrieval runs.
Expected answers and evidence labels remain outside the browser. Both arms must
deliver selected memory and retain recent turns in actual model requests.

Complete 16 fresh host-generated answers, at most 24 provider attempts, at most
two transient retries per sample/eight per run, with provider starts at least
15 seconds apart. Never retry a successful answer. Use the existing owned
transport-gate and chat collections and verify remote cleanup. Stop on a
concrete infrastructure blocker; do not switch embedding providers or tune inputs.

For a provisional 1,600-token product recommendation, require at least one newly
correct answer, no loss of an 800-token correct answer, no loss of required
evidence selected at 800, and all isolation/delivery/cleanup checks. Report input
tokens and latency alongside answers. An equal or negative result retains the
800 default. Even a pass is narrow synthetic evidence, not a universal optimum;
existing saved user budget values must remain unchanged. No additional policy
or fresh paid sweep follows automatically. Retain the completed decision and
cleanup in the existing hybrid PR rather than opening a preflight PR.

## Completed diagnosis and confirmation

**Decision: keep vector-only retrieval and the 800-token default.** The cached
diagnosis identifies real budget-related omissions, but 1,600 did not resolve
the hybrid regression and the new answer comparison did not meet adoption
criteria. This does not establish that 800 is optimal or sufficient for every
chat. The existing memory budget remains adjustable.

### Cached-hit diagnosis: no service calls

The pinned host's `tiktoken` 1.0.22 / `o200k_base` counter with six-token nonempty
content padding exactly reproduced all 16 recorded 800-token selections,
messages and token counts from the hybrid run. Request-completion telemetry was
restored to primary/context query order before interleaving. The same lists and
production selector were then replayed at 1,600, without new retrieval,
embedding or generation calls.

| Required fact coverage, out of 8 | 800 tokens | 1,600 tokens |
| --- | ---: | ---: |
| Vector | 6 | 7 |
| Hybrid | 5 | 6 |

| Previously omitted fact | Vector | Hybrid |
| --- | --- | --- |
| Rare name | Absent from both candidate lists; budget cannot recover it | First selected at 2,105 tokens |
| Semantic paraphrase | First selected at 872 tokens | First selected at 872 tokens |
| Updated badge code | Already selected at 800 | First selected at 1,717 tokens |

Thresholds are the first successful integer budget **at or above 800**, found
by enumeration up to 4,096. They are specific to these recorded lists and greedy
whole-passage selection, not recommended global settings or a monotonicity
guarantee. No baseline required fact was lost at 1,600 in this replay. Selecting
a fact is not a newly correct answer: these recorded questions received no new
completions. In particular, raising hybrid to 1,600 still omitted its correction.

### Fresh answers on fixed vector candidates

All eight new histories were frozen before service traffic. Sixteen new answers
completed through the actual pinned SillyTavern host. Each case made two live
LambdaDB managed queries in its first budget arm; its second arm replayed those
exact ordered hits, with identical expected document IDs/text, source hashes and
query bodies checked. Thus there were 16 live and 16 replayed query operations.
This is real host generation with live-derived fixed candidates, not two
independent live searches per case.

| Observation | 800 | 1,600 |
| --- | ---: | ---: |
| Correct answers | 8/8 | 7/8 |
| Required facts delivered | 30/30 | 30/30 |
| Cases with all required facts delivered | 8/8 | 8/8 |
| Median memory tokens | 753 | 1,555.5 |
| Median provider input tokens | 947.5 | 1,794 |
| Observed median generation elapsed, excluding initial pacing | 1.68 s | 2.03 s |

The stock ledger answer should be `12 + 9 - 5 + 8 - 3 + 7 = 28`.
The 800-token answer was `28`; the 1,600-token answer was `38`. All six ledger
facts reached both outgoing prompts. This loss is not explained by missing
evidence. Distraction or generation variability are plausible explanations,
but this run cannot distinguish them. Temperature zero is not a guarantee of
identical model reasoning. No answer was retried or regraded to improve its score.

The seven other cases passed at both budgets: dispatch checklist, qualified
venues, travel kit, updated booking, speaker attribution, unassigned key and
single-fact control. Median input rose about 89%. Latency is descriptive only:
one arm used live queries while the other replayed them, although arm order
alternated. It is not a clean service-latency comparison.

**Design limitation:** every required fact already fit at 800 in the new set,
and the baseline answered all eight correctly. These cases therefore offer no
headroom to demonstrate a capacity benefit. They test unnecessary-context
exposure/control behavior better than they test budget pressure. They do not
negate the earlier LongMemEval development gain at 1,600 or the cached omissions
above. Do not interpret 8/8 versus 7/8 as a statistically established universal
budget ranking. One completion per arm and authored synthetic histories are
insufficient for that claim.

The practical outcome is three distinct failure classes: absent candidates need
retrieval improvement; low-ranked candidates may need selection/capacity work;
incorrect answers with complete evidence need evidence-use evaluation. Raising
the default indiscriminately does not address all three. Stop this comparison;
do not tune these now-consumed cases or launch another paid sweep automatically.
Any later capacity confirmation should include a separately frozen real-history
cohort with known pre-generation budget pressure, plus controls, and disclose
that selection rule rather than selecting cases after viewing answer scores.

## Validation, cleanup and reproduction

The producing checkout passed 327 unit tests, runtime/development syntax and
release metadata checks. The actual-host run completed all 16 provider requests
on the first attempt, with no observed LambdaDB request failures; expected
not-found cleanup responses are excluded. It verified complete provider/saved
answer equality, delivered memory, retained recent turns, exact candidate reuse,
frozen source hashes, budget bounds and at least 15-second provider spacing.
Both owned collections were deleted and confirmed absent. No pending cleanup
record remains; keys were absent from browser/host persistence. No new general
browser-emulator suite was run because the shipped runtime did not change.

The one-off budget mode, adapter and its input test were archived and removed
from maintained code after completion. The final maintained unit suite has 326
tests; runtime and settings remain unchanged. Keep the small frozen
[new input cohort](../tests/fixtures/budget-confirmation-v1.json) and this decision
record. Do not add an evaluation mode or PR for every subsequent replay.

Two ignored, local-only archives in the `sillymemory-hybrid-retrieval` worktree
retain byte-verified inputs, reports, scripts and producing sources. Neither is
downloadable from a fresh clone:

| Archive | Files | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `artifacts/archive/hybrid-budget-diagnostic-v1/evidence.tar.gz` | 9 | 127,326 | `6ad5c8279b6164100209f0b20b90bc0a63f413e8cc267d19a08964f8dfefd2e1` |
| `artifacts/archive/budget-confirmation-v1/evidence.tar.gz` | 34 | 202,501 | `842b7422027f768c77d94cf4ce49a25221f794a048a31847f899af59e5700909` |

Both overlays use `fb7dbb576f874fa0ec2a53bb547a672bde0d3408` as their base.
Restore them in separate isolated checkouts. For the no-network diagnosis, run
`ST_SOURCE=/pinned/host node artifacts/hybrid-budget-replay.mjs`, moving the
archived output aside first because it refuses to overwrite. For an explicitly
authorized new paid reproduction, the confirmation overlay restores
`scripts/generation-smoke.mjs --budget-confirmation`; this mode intentionally
does not exist in maintained code. It requires `ST_SOURCE`, `SM_ENV_FILE` outside
Git and a new `SM_ARTIFACT_TAG`. The full accepted report is
`artifacts/generation-budget-confirmation-vector-1600-v1.json`. This document's
post-result additions do not change the pre-result protocol in that archive.
