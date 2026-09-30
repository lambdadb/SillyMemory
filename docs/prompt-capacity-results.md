# Native prompt capacity results

## Finding

The real pinned SillyTavern run confirms that the extension allocation and final
host capacity are different quantities. The same 1,280-token hook value and
320-token effective memory cap left either **886 or 175 tokens** after host
packing when only system instructions changed. With long recent messages, the
extension selected three excerpts and preserved four recent messages, but the
actual completion request contained **zero excerpts and only two recent messages**.

This is an allocation/visibility limitation, independent of ANN recall or
embedding-provider latency. The product is unchanged. In particular, the current
“Last injected memory” view describes the interceptor's result, not guaranteed
final delivery to the model. The result does not justify deleting the token cap
or replacing it with `contextSize - recentTextTokens`.

## Evidence and controls

Run: 2026-09-30, SillyTavern 1.19.0 at
[`06bde939`](https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127),
real Chromium and normal host `Generate`. The real extension loader, tokenizer
and built-in proxy executed. Both the LambdaDB HTTPS endpoint and completion
endpoint were local fixtures. The latter returned `LOCAL_FIXTURE_OK` regardless
of the prompt; answer quality was not evaluated. No live embedding/model API
was called and no `.env.local` was loaded.

The [protocol](prompt-capacity-evaluation.md), [pre-run plan](results/prompt-capacity-plan-v1.json)
and [full report](results/prompt-capacity-v1.json) retain every condition and
boundary observation. The host tokenizer label was `gpt-4.1-mini-2025-04-14`.
Its counts are estimates used by this host configuration, not provider usage.
The final request exactly matched both the native completion object and the
non-dry-run prompt-ready event in all six cases. Native ledgers closed and source
chat stayed unchanged inside the interceptor. Owned emulator collections were
deleted through the UI, with no remaining collections or synthetic key in checked
browser/settings storage. There were no uncaught page/emulator errors.

| Control | Hook capacity | Memory cap | Selected → sent excerpts | Recent kept by hook → sent | Native message tokens | Remaining |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Memory off, short prompt | 1280 | — | 0 → 0 | 4 → 4 | 795 | 482 |
| Memory on, short prompt | 1280 | 320 | 3 → 3 | 4 → 4 | 391 | 886 |
| Longer system instructions | 1280 | 320 | 3 → 3 | 4 → 4 | 1102 | 175 |
| Longer recent messages | 1280 | 320 | 3 → 0 | 4 → 2 | 671 | 606 |
| Context increased to 4096 | 3840 | 800 | 8 → 8 | 4 → 4 | 859 | 2978 |
| Output reserve increased to 768 | 768 | 192 | 2 → 2 | 4 → 4 | 298 | 467 |

All rows additionally reserve three reply-priming tokens, so
`native message tokens + remaining + 3 = hook capacity`. The base context/output
are 1536/256. Configured memory is 800, and recent count is four including the
new question. System squashing and custom post-processing are disabled.

## Why the boundaries matter

For the short memory-on case, the selector counts 271 tokens across joined
excerpt content/labels, while native per-message accounting costs 280. The final
prompt additionally uses 66 recent-message tokens, 15 system-instruction tokens,
19 character-description tokens and an 11-token new-chat control, totaling 391.
The three-token reply reservation is separate. For eight excerpts, text counting
is 714 while native memory-message accounting is 748. Neither count is the full
prompt, and the discrepancy depends on message structure.

The pressure case's recent messages alone cost 1,848 native tokens, exceeding
the 1,280-token input capacity. SillyTavern walks history backward and
[stops at the first message it cannot afford](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/openai.js#L1070).
After the question and newest 611-token recent message, the next 611-token
message cannot fit in the remaining 606 tokens. The host does not continue to
the smaller older excerpts. Thus unused tokens and lost memory can coexist.
Raising the memory cap alone cannot make all protected recent content fit here.

The [hook](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4559)
runs before [native prompt assembly](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/openai.js#L1567).
Observing that final assembly does not itself establish a safe earlier insertion
or repacking API. These source findings agree with the executed fixture cases;
they do not prove behavior for every host preset/provider.

## Validation and next work

The first harness attempt stopped before measurement because its character UI
selector incorrectly anchored the visible text. Correcting that selector let all
six cases finish. A subsequent run added native per-message costs and verified
host source hashes; it reproduced the same six prompt totals and remaining
budgets. Both earlier local attempt artifacts remain in the dedicated worktree;
the committed v1 report is the complete instrumented run.

All 197 local unit/report tests pass, together with runtime/development syntax,
release metadata and whitespace checks. Unit/report regressions verify plan/harness
hashes, ledger closure, prompt identity, native role costs, pressure losses and
context/output separation.
Corrupted, incomplete or uncleaned reports are rejected. Run:

```sh
npm test
npm run check
npm run check:release
node scripts/prompt-capacity-inspect.mjs docs/results/prompt-capacity-v1.json
```

Next, specify protected prompt content and overflow behavior, then prototype
host-aware allocation and final-delivery diagnostics behind tests. Treat the
current fixed cap as a preference bound, not as measured free capacity. Preserve
these truncation cases and PR #27's selection losses as regressions. Required
context/dependency selection remains a separate experiment; unconditional
adjacency did not qualify for adoption. Final managed embeddings, provider
acceptance, human semantic review and public promotion remain unverified by this
audit. No main/release change was made.
