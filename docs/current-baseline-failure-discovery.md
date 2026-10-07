# Current-baseline failure discovery

**Keep Bayesian+Jev and the 1,600-token default.** Six previously unexposed
English LongMemEval-S questions produced five released-target matches. One
multi-source answer failed because a retrieved source did not fit the injected
memory. Replaying that case at 3,200 tokens recovered the source and the answer.
This establishes a useful capacity diagnosis, not an independently confirmed
reason to increase the default. No runtime, instruction or user setting changes.

## Source-grounded answer results

| Discovery question | Result at 1,600 | Interpretation |
| --- | --- | --- |
| `184da446`: current reading progress | Correct: 220 pages | Both older 200 and later 220 were delivered. |
| `e66b632c`: previous 5K personal best | Target match: 27m45s | Later recollection says 26m30s; the source does not explicitly establish a new run. The answer's “newer best” relation is plausible, not uniquely established. |
| `4adc0475`: goals plus assists | Correct: 5 | Both 3 goals and 2 assists were delivered. |
| `gpt4_2f91af09`: completed writing pieces | Incomplete: 22, with an explicit unknown challenge count | Required challenge piece was retrieved but omitted by selection. |
| `gpt4_8279ba03`: appliance bought ten days ago | Correct: smoker | March 15 source and March 25 question support the interval. |
| `982b5123_abs`: Sacramento Airbnb booking date | Correct abstention | San Francisco recollection does not establish a Sacramento booking. |

These are assistant semantic audits of full answers, original source and exact
final prompts against criteria frozen before generation. They are not official
LongMemEval scores or independent human judgments. Preserve the 5/6 target-match
count and the 5K ambiguity separately; do not rewrite the released target or
claim an unambiguous evidence-interpretation failure there.

### The actual failure and controlled repair

The writing question asks for all completed short stories, poems and challenge
pieces. Source messages **59, 380 and 499** (one-based original message positions,
not chunk numbers) establish 17 poems, 5 short stories and one challenge piece,
“The Smell of Old Books”: total **23**. The first two sources arrive at 1,600;
the third is primary-query rank **6**, but does not fit the final selection.
A contextual query about unrelated flight-booking HTML also consumes space.
This is selection/capacity competition, not demonstrated ANN or reranker loss.

| Same source, rankings, host and Sol settings | Memory content tokens | Actual answer-input tokens | Complete answer |
| --- | ---: | ---: | --- |
| Baseline budget 1,600 | 1,579 | 6,249 | 22 known pieces; challenge count unknown |
| Diagnostic budget 3,200 | 3,185 | 7,903 | 23: 17 poems + 5 stories + 1 challenge piece |

The additional 1,654 actual input tokens include content and message framing;
“memory tokens” is the separately enforced extension content budget. The source
marker and full challenge text are present in the captured final 3,200 prompt.
Only one repair answer was generated; completed answers were not retried for
quality. Generation variability remains a limitation of this single observation.
The higher budget is already available in settings; no new feature is needed to
try it when memory inspection shows omitted evidence. More space can also admit
more distraction, so this is not a universal recommendation.

## Independent comparison eligibility and stopping decision

Before inspecting confirmation sources or answers, freeze one candidate:
change only memory budget from 1,600 to 3,200. The adoption gate requires at least
one independently confirmed answer gain and no lost correct answers. Preserve
all six reserved questions and the original candidate plan.

The actual-host fixture preflight then establishes that **all 12 labeled
supporting messages are already delivered in full at 1,600** across the five
answerable confirmation cases. Both budgets have identical coverage of those
sources. The sixth question is an abstention control. This is a source-delivery
ceiling for the diagnosed mechanism, **not** a measured answer-accuracy ceiling:
no confirmation quality answers were generated.

| Reserved confirmation | Coverage at both budgets |
| --- | --- |
| `6071bd76`: changed French-press ratio | 2/2 full labeled messages |
| `gpt4_ab202e7f`: replaced/fixed kitchen items | 5/5 |
| `1192316e`: morning routine plus commute | 2/2 |
| `gpt4_7bc6cf22`: reading date versus issue date | 1/1 |
| `gpt4_21adecb5`: degree-to-thesis interval | 2/2 |
| `bc8a6e93_abs`: uncle birthday baking | Abstention control; no labeled supporting message |

Stop before the planned 12 paid comparison answers. Retain the original plan and
a separate pre-answer eligibility/stopping receipt. Do not replace the cohort,
select questions after seeing wrong answers, or repeat an easy comparison to
produce a default change. The one discovery repair is a diagnosis, not an
adoption win. Independent efficacy is **unestablished**, not disproved.
Any later default-promotion trial needs independently frozen multi-source
capacity-pressure cases and the same no-answer-loss and safety gates. Do not
repeat the fixed 2:1 allocation change already rejected in the
[earlier selection comparison](english-selection-evaluation.md).

## Frozen inputs, settings and execution boundary

Producer baseline: `13a27f7713b9a5ce66fb4f3c15ab66ab1ca4a770`.
Dataset: LongMemEval-S cleaned500, revision
`98d7416c24c778c2fee6e6f3006e7a073259d48f`, SHA-256
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`;
see the existing [source/license lock](benchmarks/sources-v1.json).
Seed: `sillymemory-failure-discovery-v1`.

Exclude all previous 56 questions, shared session IDs and exact serialized
session-content hashes. This leaves 32 questions in ten connected history
components, rather than 40 under ID-only exclusion. Seeded SHA-256 ordering within
strata selects two knowledge-update, two multi-session and two temporal discovery
questions from the largest 21-question component. Exclude that entire component
from confirmation; select pairwise history-disjoint cases, with one knowledge
update and an extra abstention control because two disjoint update cases are not
available. All twelve selected IDs are listed above. No answer or quality score
participates in selection. This tiny diagnostic cohort is not representative.

Keep original dialogue roles/text, first-turn session date markers and questions;
literalize host macro spellings using the existing adapter. Gold targets and
evidence flags never enter model input. Imported dates have no stated timezone:
`send_date=0`, with no invented UTC metadata or event-time conversion. This does
not evaluate the benefit of native host conversation-time metadata.

Use stable SDK 0.8.0, managed `text-embedding-3-small`, raw English Bayesian search
plus Typesafe `jev-1.13.0`, k/size/candidateSize 30, strict rerank identity,
`onFailure='error'`, owner/scope filters, explicit `chat_eval` and consistent reads.
Upsert batches contain at most 50 documents; every source is read back exactly.
Replay deployed rankings only after matching current source/branch/coordinates.
This is not live browser querying the entire quality corpus. Separate live setup
checks exercise the product's direct CORS and ownership lifecycle.

Actual host: SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Model: `gpt-6.1-sol`, low reasoning,
4,096 output tokens, 32,768 context, recent 12, boundary-aware 800-character chunks.
Explicit `SM_MODEL` overrides the unrelated mini setting in the original local
environment file; that file was not modified or copied. No model sweep, native
storage/Summarize comparison, Korean optimization, release or deployment.

## Validation and retained evidence

- Deployed retrieval/readback completed all twelve cases. The original auth401,
  fetch503/retries and Bayesian400 failures remain preserved separately. A new
  service probe succeeded before resuming; old failed reports are not rewritten.
- Actual-host fixtures: 18 prompt/source/budget checks plus two READY fixtures,
  **zero OpenAI calls**. These are not answer-quality evidence.
- Actual-provider calls: seven quality answers (six discovery, one diagnostic)
  plus two READY checks, nine successful calls, zero provider retries; starts
  respect the 15-second interval. Quality usage: 36,810 input / 282 output tokens,
  excluding READY and managed embedding/reranking inference.
- Including failed submissions, probes and host setup: 13,340 documents, 35 query
  calls and 24 owned collections; every collection deleted/404 verified. Three
  bounded read retries belong to the retained failed service attempt. Work stayed
  within the revised pre-answer bounds: 13,500 writes, 72 queries, 24 collections,
  50 provider attempts and eight provider retries. No unrelated data was removed.
- Unchanged unit suite: 325/325 on Node 24.15.0 and 20.12.0. `npm run check`,
  `npm run check:release`, `npm run check:sdk`, all development/test syntax and
  `git diff --check` pass. No new isolation/recovery live suite is claimed.

Original sources, frozen plans/settings, exact queries/ranks/prompts, all answers,
separate semantic audits, ceiling receipt, failures, producing scripts/base and
cleanup/check receipts are preserved in the verified local-only archive described
in [evidence retention](evidence-retention.md#current-baseline-failure-discovery).
One-off scripts, raw reports and dataset copies remain ignored, not maintained
CI dependencies or incremental experiment PRs.
