# Label removal and adjacent-turn candidates — 2026-09-29

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Both candidates are implemented and tested, but **neither is adopted into the
extension runtime**. Provisional strict totals improved from current **9/16** to
raw **10/16** and adjacent **11/16**, while the new-control cohort regressed from
current **7/8** to raw **4/8** and adjacent **6/8**. The residual English user-report
failure was not fixed. Aggregate improvement is insufficient to adopt either
candidate; independent human review remains pending.

## What was implemented

The test-only [selector module](../scripts/context-candidate.mjs) implements label
removal and bounded adjacent-turn retention. Raw retains the exact baseline
passages without backfill. Adjacent starts from raw and tries the next assistant
turn for a user source, or the previous user turn for an assistant source, in
seed ranking order. It keeps every baseline passage, adds whole eligible neighbor
messages only when they fit, and preserves native roles, chronological order,
local-source validation and literal macro escaping. It does not rewrite pronouns.

Each tokenization request is recorded in order. Offline verification replays the
selector's decisions using those measured counts, reconstructs source documents,
and checks the outgoing prompt. Current-mode selections were also compared with
the actual production `selectMemory` implementation during every live sample.

The [protocol](context-candidate-evaluation.md), [fixture](../tests/fixtures/actor-candidate-v1.json)
and implementation were frozen as `fbe7508` before calls. Eight cases × three
conditions × two repetitions produced **48 actual SillyTavern/model answers**.
Four cases are unchanged development failures/controls; four newly authored
controls cover third-party quotations, a neighboring actor correction and an
unspecified price. Familiar surroundings and fixed source indices make these
controlled formatting probes, not an independent held-out retrieval benchmark.

## Semantic results

Strict passes require the correct actor/location or a supported unknown answer,
with no unsupported added assertion. Correct core facts plus an invented observer
claim are partial answers and strict failures.

| Cohort | Current labels | Labels removed | Labels removed + adjacent turns |
| --- | ---: | ---: | ---: |
| Existing development cases | 2/8 | 6/8 | 5/8 |
| New controls | 7/8 | 4/8 | 6/8 |
| **Total** | **9/16** | **10/16** | **11/16** |

| Case | Current | Raw | Adjacent |
| --- | ---: | ---: | ---: |
| English user reports assistant action | 0/2 | 0/2 | 0/2 |
| English assistant reports user action | 0/2 | 2/2 | 2/2 |
| Korean user reports assistant action | 0/2 | 2/2 | 1/2 |
| Korean assistant reports user action | 2/2 | 2/2 | 2/2 |
| English third-party quoted action | 1/2 | 0/2 | 0/2 |
| Korean third-party quoted action | 2/2 | 2/2 | 2/2 |
| English neighboring actor correction | 2/2 | 0/2 | 2/2 |
| Korean unspecified admission price | 2/2 | 2/2 | 2/2 |

Paired changes, matching each case and repetition:

- Current → raw: 4 improvements, 9 ties, **3 regressions**.
- Raw → adjacent: 2 improvements, 13 ties, **1 regression**.
- Current → adjacent: 3 improvements, 12 ties, **1 regression**.

The unchanged English user-report case still reversed the actor in all six
answers, including when four neighboring messages were added. Raw helped the
Korean user-report case, but adjacent reversed its actor in the second repetition.
This is not a generally monotonic benefit from adding local context.

In the English third-party case, raw and adjacent reversed Jo and Ellis in both
repetitions. Current correctly named Ellis twice, but one answer also claimed Jo
was absent even though Jo held the door and watched, so only one passed strictly.
The Korean third-party answers preserved the quote's explicit speaker/addressee
frame and conveyed the correct actor through that frame; copying a correctly
attributed quotation is not the same as using its pronoun as the assistant's own
unframed assertion. All six unknown-price answers appropriately withheld a price.

The correction case needs particular care. Current and raw **did not contain the
correction**, while adjacent included it at **399/400 tokens** and answered
correctly twice. Raw assigned the door-holding action to User and misreported the
earlier belief. Current nevertheless gave the final correct actor and observer
twice, despite lacking that supporting correction. Its 2/2 full-source answer
score cannot be credited as evidence that it followed or retrieved the correction.
Answer correctness and prompt evidence are separate measurements here.

The two repetitions had identical prompts, request options and selections for all
24 case/condition combinations. English third-party/current and Korean
user-report/adjacent nevertheless changed strict outcome between repetitions.
Temperature 0 did not establish deterministic answer quality; two repeats do not
support stable accuracy estimates or a model-internal explanation.

## Verification and resources

- **309 live integrity checks** passed through SillyTavern 1.19.0 at
  `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. All 48 provider requests returned
  HTTP 200 on the first attempt with complete answers matching saved host replies.
  Model: `gpt-4.1-mini-2025-04-14`, temperature 0, output limit 256, context 8192,
  recent window 12, unchanged generation instruction.
- The host built the real requests; a test-only interceptor changed only its
  ephemeral history array. Production retrieval was disabled. Both old and new
  conditions used frozen seed indices; the new controls were not searched against
  LambdaDB. This run does **not** validate production retrieval/synchronization or
  make a new ANN-quality claim.
- All 16 current controls matched the production selector on their inputs. All
  16 old-case current/raw reference requests exactly matched previous ablation
  prompts and options. Actual outgoing roles, order, text, system instructions,
  token decisions, saved source preservation and one intervention were checked.
- All memory slices fit **400 tokens**. Current ranged 354–400, raw 234–305, and
  adjacent 346–399. Adjacent added one to four messages without evicting seeds.
  Recent source messages and the question were retained in every request.
- Provider usage: **50,400 prompt + 1,401 completion tokens**. Minimum actual
  provider-start gap: **15,000.058 ms**. No transient or quality retries occurred.
- The shared setup/cleanup gate made **14 real LambdaDB proxy requests**, including
  four expected 404 absence checks. Both owned collections were deleted and
  absence verified; no pending cleanup remains. Keys were absent from browser and
  persisted host settings, tracked files and candidate artifacts. Service and
  embedding cost were not measured.
- **117 unit tests** passed on Node 20.12.0 and 24.15.0, covering production parity,
  stale/foreign hits, no-backfill behavior, literal escaping, all-or-nothing
  neighboring chunks, ineligible/recent source exclusion, token failure, replay
  tampering and missing-correction/unknown aggregation. Syntax, release metadata
  and whitespace checks passed; the prior ablation report still passes the updated
  verifier. Initial/final evaluated source hashes matched.
- Runtime files remain identical to develop/PR #18. Historical emulator checks
  were not rerun. Unit literal escaping is not a semantic prompt-injection defense
  evaluation; hostile sources, more models, longer/multipart turns and full
  production lifecycle integration remain outside this run.

## Review and decision

[Committed evidence](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/context-candidate-v1.json) contains all 48 answers,
provisional rationales, cohort and paired results, selected/added source messages,
token-trace hashes, prompt identities and resource accounting. Assistant judgments
were recorded from randomized records before opening the condition key, but the
assistant knew the experiment's objective. No independent human score is claimed.
The local `artifacts/candidate-human-review-v1.html` was opened and checked at
0/48 complete with no browser errors or network requests. Give an independent
reviewer only that unscored form using the [review workflow](human-review.md).

Keep both selectors experimental. The result does not support blanket label
removal or a universal adjacent-turn rule, and it does not fix the original
English user-report problem. The new quotation/correction regressions should be
retained as regression cases for any future design. Before another runtime
proposal, review the semantic judgments and define how direct turns, quoted
third-party speech and corrections should be represented and tested. Do not
repeatedly rewrite pronouns or tune prompts just to make these eight cases pass.
No runtime adoption, main promotion, release or deployment occurred.

Reproduce with the frozen-plan commands in the protocol and fresh output paths.
Local ignored evidence is `generation-natural-candidate-v1.json`,
`candidate-plan-v1.json`, `candidate-review-v1/` and the human HTML under
`artifacts/`. Raw report byte SHA-256:
`c93d15e563e2de8e25628b7228fd0733e548c2904ffd8dcb6a08da9b83483318`.
Fixture semantic hash:
`1a7c0f2d83c1ec953fe93d9d46965719bccbe8c41cb44af6737a26ad1a1436c9`.
