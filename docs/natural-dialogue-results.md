# Natural dialogue completed run — 2026-09-28

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
ongoing chat. Generation timing excludes the fixed 15-second inter-sample wait.

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
Unit tests: **84 passing** on Node.js 20.12.0 and 24.15.0. Runtime and all script/test
syntax checks and release metadata pass. The extension runtime and frozen corpus
are unchanged. Main promotion, release and deployment are outside this work.

The next product investigation is speaker attribution when quoted old passages
contain first-person claims. That needs a separately declared development change
and evaluation; do not tune the frozen oracle. Independent human review and
long-duration reliability validation remain outstanding.

Checked-in review evidence:

- [All 64 exact answers, provisional rationales, per-sample retrieval evidence,
  token usage and source identities](results/natural-dialogue-retry-v1.json)

Ignored local artifacts (available only in this validation checkout):

- [Raw complete report](../artifacts/generation-natural-retry-v1.json)
- [Technical summary](../artifacts/natural-review-retry-v1/summary.json)
- [Unfilled human-review packet](../artifacts/natural-review-retry-v1/blind-review.json)
- [Assistant annotations](../artifacts/natural-review-retry-v1/assistant-review.json)
- [Decoded provisional scores](../artifacts/natural-review-retry-v1/assistant-scores.json)
- [Source, credential and cleanup verification](../artifacts/natural-retry-v1-verification.json)
- [Run log](../artifacts/natural-retry-v1.log)
- [Node 20 tests](../artifacts/unit-retry20.log)
- [Node 24 tests](../artifacts/unit-retry24.log)

Raw report byte SHA-256:
`caa15b7cc020780f3aaa278db3e8e8d0a772324c03704e0ad7e9d0d2b277d69b`.
