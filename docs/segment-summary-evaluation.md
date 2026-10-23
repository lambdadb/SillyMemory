# Segment-summary memory comparison

## Completed 400-character result and decision

The bounded follow-up completed all 50 questions with **34/50 (68%)** for
400-character summaries, versus **44/50 (88%)** for saved 400-word answers and
**47/50 (94%)** for saved historical Query1 answers. Every arm was judged once
under the adopted **Jev 1.13.0 Noul >=0.50** protocol. Only the 400-character arm
produced new summaries, selections and answers; the 99 comparison answers were
reused byte-for-byte. No control generation, retrieval or indexing was repeated.

| Jev-graded condition | Correct / cohort | Operational failures | Median answer input tokens |
| --- | ---: | ---: | ---: |
| New 400-character summaries | 34 / 50 | 2 | 1,574 |
| Saved 400-word summary answers | 44 / 50 | 1 | 3,784 |
| Saved historical SillyMemory Query1 answers | 47 / 50 | 0 | 5,056.5 |

All operational failures remain incorrect in the full 50-case denominator. The
400-character arm generated 48 answers, of which 34 passed; the other two fail
because the selector chooses an already included newest memory as an older ID.
Input medians exclude cases without generated answers, so they describe cohorts
of 48, 49 and 50 respectively. Against the 400-word arm there are **10 losses,
zero gains**, 34 shared passes and six shared failures. Five losses are temporal
reasoning questions, whose score changes from 13/13 to 8/13.

**Decision:** retain the 400-character setting as the more source-grounded
approximate comparator and retain both results, but do not adopt it as a
replacement for source retrieval. Defer the earlier suggested 500-case expansion.
The substantial observed quality loss warrants clarifying the actual memory
composition and automatic-summary limit before investing in a larger product
replication. This is a completed bounded decision, not authorization for another
experiment. No product default changes follow. The same consumed 50 questions,
English character budget, assumed hard cap and omitted relationship/state memory
prevent a claim about the named service's production quality or general superiority.

| Question type | 400 characters | 400 words | Historical Query1 |
| --- | ---: | ---: | ---: |
| User facts | 4 / 7 | 6 / 7 | 7 / 7 |
| Assistant facts | 4 / 6 | 5 / 6 | 6 / 6 |
| Preferences | 1 / 3 | 2 / 3 | 1 / 3 |
| Multi-session | 10 / 13 | 11 / 13 | 12 / 13 |
| Temporal reasoning | 8 / 13 | 13 / 13 | 13 / 13 |
| Knowledge updates | 7 / 8 | 7 / 8 | 8 / 8 |

The [frozen follow-up plan](benchmarks/segment-summary-400chars-plan-v1.json) and
[aggregate results with all probabilities](benchmarks/segment-summary-400chars-results-v1.json)
record exact settings and outcomes. The saved 400-word Jev labels equal its
historical GPT-4o labels. The control total also stays 47/50, but two labels change:
`195a1a1b` becomes No (0.46) and `75f70248` becomes Yes (0.58). Equal totals do not
make the evaluators interchangeable. All original GPT-4o records remain intact.

### Failure inspection and character-limit effect

All 16 failures and the one summary-only pass against the control were inspected
against annotated source messages, stored summaries and final requests. Separate
mechanisms rather than calling every failure compression loss:

- Missing facts: Grand Ballroom (`d52b4f67`), the $500 retail price (`bb7c3b45`),
  chocolate birthday cake (`9a707b82`) and the fifth bottle, Absinthe (`3249768e`),
  disappear even though their source segments are selected. The relevant facts
  are absent from raw summaries too, not merely their clipped tails.
- Missing temporal anchors: `9a707b81` retains the baking-class date but loses the
  cake event that defines the requested interval; `993da5e2` loses the furniture
  rearrangement date. `e4e14d04` reduces the meetup relation to an ambiguous phrase.
- Answer use: selected summaries retain consecutive-day charity events
  (`b46e15ed`), the 9:30pm wind-down preference (`195a1a1b`) and power-bank ownership
  (`09d032c9`), yet the answer fails. Recent-context interpretation and compressed
  date associations are relevant; these are not all absent-fact failures.
- Selection: `bc8a6e93` and `4fd1909e` fail the older-ID contract without an answer;
  the latter also omits the concert venue. `gpt4_a56e767c` preserves all four
  festivals across three older summaries but can select only two.
- Mixed/ambiguous cases: fundraising (`d851d5ba`) has selection loss, cap loss and
  a true extra event outside the reference total. Sneaker location (`07741c45`)
  loses an explicit current-state relation amid mixed future wording. The only
  pass over the control (`51c32626`) equates an ACL deadline with an actual paper
  submission date; it is not demonstrated retrieval advantage.
- Ordinal list contents remain fragile: `1903aded` omits the seventh job in both
  summary conditions. The 400-character limit does not explain this existing loss
  by itself.

Of 637 raw summaries, **221 exceeded 400 characters** and were capped exactly as
prespecified; **88 capped summaries were selected**. Excess length was 1–27 code
points (median 6); the longest raw summary was 427, stored maximum 400 and stored
median 395. The selected-memory median was 537.5 tokens, maximum 580. The cap
removed a relevant `$1,000` amount in `d851d5ba`, although that older summary was
also unselected and the reference has a separate ambiguity. No no-cap
counterfactual was run, so the effects of the shorter prompt and deterministic
storage cap cannot be estimated separately from these observations.

### Follow-up workload and verification

| New stage | Calls | Input tokens | Output tokens | Estimated USD | Median HTTP time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Summaries | 637 | 6,031,118 | 69,622 | 15.771821 | 4.271 s |
| Selection | 50 | 114,502 | 2,829 | 0.314470 | 2.503 s |
| 400-character answers | 48 | 74,633 | 2,849 | 0.210274 | 2.532 s |
| Jev judgments of all three arms | 147 | 69,458 | 2,940 | 0.002917 | 0.196 s |

**Total estimated new cost: $16.299482**, including rejudging saved answers.
The $45.768496 reservation is a conservative limit charge, not billed usage.
All 882 provider requests returned HTTP 200; no transport or quality retry was
performed. Paid execution took 13.40 minutes. Jev uses the frozen October 19
[$0.042/M input-token rate, free output](https://docs.typesafe.ai/models).
Generator/cache-write rates match the historical rate model below. Historical
control generation/retrieval costs are not charged again or claimed as zero.

- `npm test`: 383 passed, including character-boundary and Noul-contract coverage.
- Runtime/development syntax, release metadata and locked SDK checks passed.
- Independent Python audit verified all 1,764 request/response receipt hashes,
  every source partition and retained native prompt shell, the prompt-only length
  wording change, raw-to-stored caps and byte-identical saved answers.
- All 147 Jev requests reconstruct the exact official task-specific rule wording,
  reference and answer; all ten adopted rule variants also matched offline.
  Independent arithmetic reproduced scores and stage costs.
- No LambdaDB, indexing, retrieval or browser resources were created. The runner
  exited with no pending intents and released its ledger lock.

## Method and reproduction

This is an approximate summary-memory comparator, not a verified replication
of a hosted product. Each chronological segment has a 400-character target,
counting Unicode code points including whitespace; deterministic storage caps
retain the first 400 code points. English character limits do not provide the
same information budget as Korean. No uncapped counterfactual was run.

The final prompt combines four recent historical messages with three newest
summaries and two selected older summaries, within a 4,096-token memory cap.
Generation uses `gpt-6.1-sol`, low reasoning and a 4,096-token completion limit.
Invalid selections remain operational failures in the full denominator.
The original dataset, 50-question split, task rules and references are frozen in
the [plan](benchmarks/segment-summary-400chars-plan-v1.json).

`scripts/segment-summary-eval.mjs` retains the `prepare` and `run` entry points,
source validation, bounded checkpoint ledger and pinned tokenizer. Reproduction
requires the separately supplied original dataset, official judge, captured
baseline answers and historical comparison results; these inputs are not
published in a fresh clone. The original producer and raw receipts remain at
the availability locations in the frozen evidence record below. Retired
400-word source/results are preserved there rather than maintained as another
current experiment. The [current public-profile comparison](longmemeval-public-evaluation.md)
uses the measured 400-character row; its SillyMemory control is a separate run.

## Historical evidence

[Earlier experiments, methods and receipts](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/segment-summary-evaluation.md) remain available at the recorded revision. They describe their original settings, not the current product or benchmark profile. See [evidence recovery](evidence-retention.md) for retained source and raw-run availability.
