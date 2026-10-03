# Memory budget calibration — 2026-10-02

**1,600 tokens is a useful next development setting, not a demonstrated universal
default.** It selected more labeled evidence and gained one answer without a
paired loss in this 12-question run. At 3,200, evidence coverage improved further
but answer accuracy returned to the 800-token level. All 36 fresh answers and
36 judgments completed; the product default is unchanged.

The later [boundary-aware vector confirmation](budget-confirmation.md) keeps the
800 default: its eight new synthetic cases already delivered all required facts
at 800, and 1,600 gained no answer and lost one. That set lacked budget-pressure
headroom, so it does not overturn this earlier development result or establish
a universal ranking. Both records and their limitations remain relevant.

## Question and controlled comparison

Does the default 800-token memory allocation unnecessarily limit useful evidence
and answer quality? Compare **800, 1,600 and 3,200 tokens**, keeping recent 12,
800-character chunks without overlap, query construction, candidate order,
packing and all model settings fixed. This isolates the budget from proposed
chunking, hybrid-search and per-chat-collection changes.

This is a development calibration, not a new held-out result. Twelve development
questions have retained managed-embedding retrieval traces; the other two pilot
questions do not and were excluded before execution. All three budgets receive
fresh answers and official-prompt judgments. Budget order rotates across cases.
Historical answers are not substituted for the 800-token control.

The real pinned SillyTavern 1.19.0 host, browser, extension and built-in proxy are
used. A local HTTPS service returns **the exact recorded candidates**, remapped
to current document identities only after matching source position, text, role
and speaker. This prevents new search/embedding variation from confounding the
budget comparison. OpenAI generation and judging are live. The comparison does
**not** make new LambdaDB search or embedding calls or claim fresh managed-service
integration evidence. A separate short synthetic live isolation check does.

Generator: `gpt-4.1-mini-2025-04-14`, temperature 0, 1,024 output tokens, 32,768
context. Judge: `gpt-4o-2024-08-06`, temperature 0, 10 output tokens, pinned official
LongMemEval prompt. The frozen bound is 36 answers + 36 judgments, at most six
extra transport attempts, a $2 conservative OpenAI reservation ceiling and a
60-minute execution window. Successful answers are never retried for quality.
The 15-second dispatch interval is operational spacing, not user latency.

## Offline evidence selection

Every original 800-token result was reproduced exactly before changing the budget.
The table counts answerable questions only; the answer matrix still includes its
abstention question. "Selected" means some chunk of a labeled message was chosen;
"full" requires all indexed chunks of that labeled message. Neither means that
the benchmark labels exhaustively describe every piece of context an answer needs.

| Cohort | Memory budget | Labeled messages selected | Full labeled messages | All labeled messages selected per question |
| --- | ---: | ---: | ---: | ---: |
| Development: 11 answerable / 12 total | 800 | 14 / 21 | 12 / 21 | 5 / 11 |
| Development | 1,600 | 19 / 21 | 17 / 21 | 9 / 11 |
| Development | 3,200 | 21 / 21 | 20 / 21 | 11 / 11 |
| Consumed evaluation: 36 answerable / 42 total | 800 | 41 / 59 | 38 / 59 | 23 / 36 |
| Consumed evaluation | 1,600 | 46 / 59 | 44 / 59 | 26 / 36 |
| Consumed evaluation | 3,200 | 56 / 59 | 56 / 59 | 33 / 36 |

No baseline labeled-message coverage was lost at either larger budget in these
rows. This is an observation, not a monotonicity guarantee for the greedy selector.
The 42 consumed evaluation questions are post-hoc diagnostic replay only; they
are not used as an unseen test or adoption gate, and receive no new answers here.

## Live answer result

| Memory budget | Correct / 12 | Median actual answer-input tokens | Median selected chunks |
| --- | ---: | ---: | ---: |
| 800 | 7 | 3,361.5 | 7 |
| 1,600 | 8 | 4,182.5 | 14.5 |
| 3,200 | 7 | 5,831 | 28.5 |

Against 800, 1,600 gains one answer and loses none; 3,200 gains one and loses one.
Against 1,600, 3,200 gains one and loses two. The ratio of median input tokens
increases about 24% at 1,600 and 73% at 3,200 compared with 800. These are small
known-development counts, not statistically established rankings.

The paired changes show why more selected evidence is not sufficient:

- `gpt4_2ba83207`, grocery spending: 800 selects three of four labeled messages
  and answers Walmart. At 1,600, all four are delivered in full and the answer
  correctly identifies Thrive Market. At 3,200, all four remain present but the
  answer returns to Walmart. The store name alone was present even at 800;
  entity overlap is not equivalent to complete evidence or correct comparison.
- `d23cf73b`, cuisines tried: 800 misses one labeled message. Both larger budgets
  include all four in full, but only 3,200 counts the fourth category and passes
  the official judge. This does not isolate whether extra unlabeled context or
  generation variability explains the difference.
- `778164c6`, a snapper dish with fruit: both 800 and 1,600 answer correctly;
  3,200 names another dish. The correct dish text and the competing dish text
  are present at **all three budgets**. The loss is not explained by removal of
  the correct phrase; distraction/evidence use and model variation are plausible,
  unisolated explanations.
- `d24813b1`, baking preferences: the labeled preference message is present in
  full at all budgets, but all three answers fail the official personalization
  criterion. Its fresh 800-token prompt messages are byte-identical to the prior
  recorded prompt, yet the answer differs and changes from a pass to a fail.

All 12 fresh 800-token prompt hashes match their historical counterparts. One
grade flips; this is another reason to compare the three **fresh** arms and not
attribute a single-answer difference entirely to retrieval. No score correction,
answer rerun or rejudging was applied. One generation/judgment per condition,
shared histories and prior development exposure limit the conclusion.

Use **1,600 as the provisional comparison setting for the next quality change**,
with an 800-token control. Do not promote 3,200 as the general recommendation,
and do not change the shipped default on this one-answer gain alone. This closes
the capacity question sufficiently to proceed to boundary-aware indexing/hybrid
retrieval instead of another label-compression variant or another budget sweep.

## Verification and cleanup

The actual-host/local-service fixture passed all three budgets before paid calls.
The paid run took 18.06 minutes; all 72 completions succeeded on their first
attempt. The audit verified 180 durable receipts, unchanged runtime/input
bindings, exact replay of query candidates and selected source text, matching
host/API prompts and all **615/615 prepared memory messages delivered**. The
temporary host checkout and browser profile were removed.

Generation used 167,968 input / 2,807 output tokens; judging used 8,186 / 59.
At the frozen historical uncached prices the successful-call estimate is
**$0.0927334**, against a conservative $0.9030816 reservation and $2 ceiling.
This is not an invoice and excludes the separate live LambdaDB isolation check.

Existing unit tests **309/309**, syntax and release metadata checks passed.
The independent actual-host/emulated-service browser suite passed 22 checks;
the real LambdaDB managed-embedding/proxy smoke passed 12, including synthetic
parent/branch/character isolation. Its two owned remote collections were deleted
and confirmed inaccessible, and its temporary host/profile were removed. These
checks validate current behavior, not a per-chat collection implementation.

## Product implications and remaining work

The budget has a clear effect on which known evidence fits. Formatting-only
compression was not an adequate substitute for checking this basic capacity
tradeoff. Any provisional budget recommendation must include final input tokens
and paired answer losses, not just the number of selected chunks.

An 800-character chunk is a maximum, not a constant-sized unit. Short messages
and remainder chunks explain why several excerpts fit inside 800 tokens. Larger
budgets can admit both useful context and distractors. They do not repair a
sentence split during indexing, guarantee recovery of neighboring turns or make
the generator consistently prefer a newer correction.

The [design review](memory-design-followups.md) records current live isolation
checks and concrete follow-ups for per-chat collections, boundary-aware chunking
and BM25/vector hybrid search. None of those variables changes in this comparison.
The runtime default remains 800; no main promotion or release follows from a
small development calibration.

## Evidence and reproduction

The [compact manifest](benchmarks/memory-budget-summary-v1.json) retains per-budget
results, paired wins/losses, frozen settings, source/input bindings and the archive
checksum. Detailed provider receipts, cached candidates, one-off runner, offline
replay and checks are in the verified local-only
`artifacts/archive/memory-budget-v1/evidence.tar.gz` in the
`sillymemory-budget-calibration` worktree. They are not uploaded or available in a
fresh clone, and are not a new permanent runner or historical CI fixture.

Reproduce from `6aa2600daa5e7f43802a7b30477659c8ae97dabb` and the archive. Its
`budget-bindings.json` records producer hashes and required source-cache/host
paths; restore the separately retained development/evaluation inputs there.
The archive contains 226 byte-verified files (17,583,304 bytes), with zero
configured-secret matches. SHA-256:
`03b033208609db20ff9035f202768ee98596561fd889786d22a3f511a59f9d5f`.
The host tokenizer is `tiktoken` 1.0.22 / `o200k_base`, with the pinned host's
six-token addition for nonempty memory text. Move the archived analysis aside
before running `node artifacts/analyze-budget.mjs`; it refuses to overwrite and
makes no provider calls. Raw source data and prompts remain private local
artifacts; the summary is not a promise of downloadable benchmark evidence.
