# Natural dialogue completed run — 2026-09-28

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

## Execution and transport

All **64 scheduled answers** completed through pinned SillyTavern 1.19.0,
SillyMemory, its built-in LambdaDB proxy, the test-only generation bridge and
OpenAI `gpt-4.1-mini-2025-04-14`. The unchanged frozen corpus and generation
settings were used with the separately recorded
[bounded transport amendment](natural-dialogue-retry.md).

The run made **64 provider attempts**, with **0 first-attempt failures**,
**0 extra attempts** and **0 recovered samples**. Its configured ceiling was 72
attempts. Thus this run does not demonstrate live provider-error recovery; the
HTTP 500-to-200 retry path is verified separately with a local HTTP server test.
This bridge is test infrastructure, not generation-retry behavior shipped to
ordinary SillyTavern users.

All **676 integrity checks** passed. There were **238 LambdaDB requests** with
no transport failures or HTTP 5xx. Both owned test collections were confirmed
inaccessible with HTTP 404 after cleanup, and the pending cleanup record was
removed. The browser/persisted-host-settings secret audit and a separate local
artifact key scan passed. Recorded start/end source hashes match the files used.
The original 22-attempt, HTTP-500-interrupted run is preserved separately and is
not combined with these results.

**Review correction (2026-09-29): the historical run does not establish the
required 15-second provider-start spacing.** Its runner paced host generation
before variable prompt preparation. Of 63 consecutive bridge-entry intervals,
32 were below 15 seconds; the minimum was 14,222 ms. Those timestamps are not
exact upstream-send times. The 676 checks did not validate that requirement.
The original raw report and its hashes remain unchanged, and the derived summary
now explicitly reports `providerSpacing.verified: false`. Answer completion,
cleanup and provisional observations remain evidence, not proof of full protocol
compliance. The corrected sender has local validation below; it has not had a
replacement 64-sample live run.

## Retrieval and provisional semantic review

The assistant read all four source histories and all 64 answers in a randomized
packet without condition/repetition labels, finalized its annotations, then
joined the condition mapping. This is a **provisional assistant review**, not
independent human scoring. The human semantic quality gate remains `null`.
The unchanged human-review packet is available for an independent reviewer.

| Measure | Memory off | Memory on |
| --- | --- | --- |
| Samples | 32 | 32 |
| Required answer facts correct, provisional | 24 / 24 | 24 / 24 |
| Unstated prices/fees acknowledged, provisional | 8 / 8 | 8 / 8 |
| Additional unsupported speaker-attribution flags, provisional | 0 | 4 |
| Correct/unknown handled without those flags, provisional | 32 / 32 | 28 / 32 |
| All required evidence in injected memory | 0 / 24 | 24 / 24 |
| All required evidence in outgoing prompt | 24 / 24 | 24 / 24 |
| Correction samples with old-only memory | 0 | 0 |
| Truncated baseline source | 0 / 32 | Not applicable |
| Maximum injection | 0 | 796 / 800 host tokens |

Both repetitions have the same provisional outcomes. The 4 flagged answers are
two English cases repeated twice, all in the on condition:

- `en-workshop-return`: the key location is correct, but the assistant adds
  **“I moved it there”**. In the source, the user said they had moved the key.
- `en-observatory-correction`: the ferry time is correct and the earlier time is
  rejected, but **“corrected me”** and **“My earlier”** turn the user's report
  into the assistant's own experience.

These are flags under the already-frozen unsupported-assertion criterion, not a
new keyword rule or a change to the answer oracle. All required facts remain
classified as correct; the separate flag makes the strict *provisional* gate
fail. A human reviewer should confirm the speaker-attribution interpretation.
Korean subject omission was not treated as an explicit first-person claim.
No retrieval/prompt changes or favorable retest followed these observations.

The offline score import now emits all **32 case/repetition pairs**: **0 improved,
28 tied, 4 regressed** on the frozen strict-pass criterion. Each pair retains both
outcome labels, unsupported-assertion flags, pass booleans and the on-minus-off
pass difference (-1, 0 or +1). A tie means equal strict-pass status, not necessarily
identical semantic labels. The four regressions are the cases above. No answer
was regenerated or annotation changed to produce these paired comparisons.

## Tokens and elapsed time

| Measurement, median [min–max] | Memory off | Memory on |
| --- | --- | --- |
| Provider prompt tokens | 898.5 [751–1,051] | 1,063 [912–1,183] |
| Initial sync, ms | 3.8 [3.5–5.1] | 1,062.6 [963.4–1,806.1] |
| Retrieval including its sync, ms | Not applicable | 735.8 [653.8–1,320.4] |
| Host generation including retrieval, ms | 1,315.0 [1,044.6–3,702.0] | 2,094.2 [1,798.8–2,774.2] |

Off-mode “sync” measures the disabled-setting operation, not a remote sync.
The stages overlap: do not add retrieval time to generation time. Each sample
has a fresh chat scope, so this measures cold per-sample indexing, not a warmed
ongoing chat. Historical generation timing excludes the host-start pacing wait,
which did not guarantee the required provider-start interval.

Successful responses reported **62,276 prompt tokens** and **1,384 completion
tokens** in total. Managed-embedding usage and total operating cost remain
unknown. The short histories all fit the 8,192-token host context without memory;
this run therefore shows neither a recall advantage over the full-history
baseline nor token savings. The reported prompt-token median is higher with
memory. The four curated histories and two repetitions do not establish broad
quality or provider reliability.

## Review and reproduction

Use the [runner instructions](natural-dialogue-live.md) with a new artifact tag
and `npm run test:natural:live -- --retry-transient`. The original frozen plan is
still required; the report additionally pins the retry amendment and tooling.
Unit tests after review fixes: **90 passing** on Node.js 20.12.0 and 24.15.0.
Runtime and all script/test syntax checks and release metadata pass. The extension runtime and frozen corpus
are unchanged. Main promotion, release and deployment are outside this work.

The corrected test bridge shares one monotonic dispatch clock across samples and
retries, records every actual send and pacing wait, and validates all send gaps.
New reports with spacing metadata reject missing timestamps or sub-15-second
gaps. Legacy reports remain usable for semantic review with spacing explicitly
unverified. Unit tests cover uneven preparation, early timers, concurrent sends,
cancellation, retry-to-next-sample spacing and shuffled paired annotations. A
separate local HTTP 500-to-200-to-next-sample check uses real 15-second timers;
it is not an OpenAI, LambdaDB or SillyTavern integration rerun.

The next product investigation is speaker attribution when quoted old passages
contain first-person claims. That needs a separately declared development change
and evaluation; do not tune the frozen oracle. Independent human review and
long-duration reliability validation remain outstanding.

Checked-in review evidence:

- [All 64 exact answers, provisional rationales, per-sample retrieval evidence,
  token usage and source identities](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/natural-dialogue-retry-v1.json)

Ignored local artifacts (available only in this validation checkout):

- Raw complete report (`artifacts/generation-natural-retry-v1.json`, local-only)
- Technical summary (`artifacts/natural-review-retry-v1/summary.json`, local-only)
- Unfilled human-review packet (`artifacts/natural-review-retry-v1/blind-review.json`, local-only)
- Assistant annotations (`artifacts/natural-review-retry-v1/assistant-review.json`, local-only)
- Decoded provisional scores (`artifacts/natural-review-retry-v1/assistant-scores.json`, local-only)
- Recomputed scores with 32 pairs (`artifacts/natural-review-retry-v1/assistant-scores-review-fixes.json`, local-only)
- Local HTTP spacing check with real timers (`artifacts/provider-spacing-real-timer.json`, local-only)
- Review-fix Node 20 tests (`artifacts/unit-review-fixes20.log`, local-only)
- Review-fix Node 24 tests (`artifacts/unit-review-fixes24.log`, local-only)
- Source, credential and cleanup verification (`artifacts/natural-retry-v1-verification.json`, local-only)
- Run log (`artifacts/natural-retry-v1.log`, local-only)
- Node 20 tests (`artifacts/unit-retry20.log`, local-only)
- Node 24 tests (`artifacts/unit-retry24.log`, local-only)

Raw report byte SHA-256:
`caa15b7cc020780f3aaa278db3e8e8d0a772324c03704e0ad7e9d0d2b277d69b`.
