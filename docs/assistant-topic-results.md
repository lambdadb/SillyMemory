# Assistant-topic selection results

Neither candidate qualified for runtime adoption. Adding a third assistant query
recovered the Korean first-user boundary, but lost the previously recovered
Korean prior-user reference. The Korean assistant-topic case still failed.
Runtime remains `latest-anchor-plus-prior-user-v3`; this change adds a development
diagnostic, not an installed-extension fix.

## Frozen shared-hit comparison

The [protocol](assistant-topic-evaluation.md), policies and fixtures were fixed
before the run and their SHA-256 values matched at start and finish. All 32
existing natural-dialogue, speaker-native and long-dialogue cases plus six
assistant-topic boundaries ran once. Six unknown cases have no required source;
the remaining 32 cases each have one required source. Every distinct text was
queried once per case (112 searches total), with exact hits reused by all policies.
There were no generation calls, quality retries, oracle queries or budget changes.

| Policy | Existing required sources | Boundary targets | Total | Lost from baseline |
| --- | ---: | ---: | ---: | ---: |
| Baseline v3 | 26/26 | 4/6 | 30/32 | — |
| Question, prior user, prior assistant | 25/26 | 5/6 | 30/32 | 1 |
| Question, prior assistant, prior user | 25/26 | 5/6 | 30/32 | 1 |

Both English and Korean explicit-topic switches passed under all policies. Equal
total coverage hides the regression; the decision uses individual required-source
coverage and requires both Korean boundary recoveries. Both candidates fail it.
The six unknown cases do not establish safe abstention without generation.

## Where the budget is lost

For `ko-long-reference`, the primary question returns message 8 at rank 7 and
the prior-user banner query returns it at rank 2. Baseline v3 selects messages
39, 6, 1 and 8 using 330/400 host tokens. Adding the generic assistant
acknowledgment as another query introduces other rank-1 hits before the useful
rank-2 result. Both candidates select five other messages using 395/400 tokens
and exclude message 8. Swapping the two context streams does not repair this.

For `ko-first-user`, the assistant supplies the only context query. Its target
rank is 2 and both candidates select it using 332/400 tokens. Baseline has only
the generic question, whose target rank 7 falls outside its 398-token selection.

For `ko-assistant-topic`, the assistant query again returns the target at rank 2,
but the unrelated prior-user stream consumes budget before it fits. Both
candidates stop at 395/400 tokens without that target. This is directly observed
candidate-to-budget selection loss: the desired result exists in the returned
hits. The experiment does not compare ANN against exhaustive search and makes
no new claim about ANN recall or committed-index quality.

[Checked-in evidence](results/assistant-topic-selection-v1.json) retains every
case's query text, target ranks, selected source indices, budget, fixture hashes,
source hashes and lifecycle checks. Full synthetic hit payloads remain in the
ignored raw artifact `artifacts/live-assistant-topic-assistant-topic-v1.json`.
Its byte SHA-256 is
`b08d7dac176c88a6af9fd566c068f023cfc032fdb47e7bad0f6cc0b61e633ac8`.

## Validation and limits

- Real SillyTavern 1.19.0 at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`,
  Chromium, built-in proxy and live LambdaDB managed embeddings: **50 integrity
  checks passed**. The selector used the real host's gpt-4.1-mini tokenizer,
  30 candidates per query and each original fixture's token budget.
- **274 LambdaDB responses**: 207 HTTP 200, 61 HTTP 202, two HTTP 201, one
  intentional invalid-key HTTP 400 and three expected absent-resource HTTP 404.
  No transport or HTTP 5xx failure was recorded.
- Both exclusively owned collections were deleted and confirmed absent. Key
  absence from browser storage and host settings, reload key loss and disabled
  memory state all passed. Source hashes remained unchanged throughout the run.
- **122 unit tests** pass on Node.js 20.12.0 and 24.15.0, including query bounds,
  deduplication, replacement-answer exclusion, source indexability, decision
  regressions and parity against every recorded live query. Syntax and release
  metadata checks pass.
- No runtime file changed. Emulator recovery and model generation were not rerun
  for these rejected test-only policies. Prior actor-attribution limitations and
  independent human-review status are unchanged. No release or deployment.

The next candidate should address competition between context streams within a
fixed budget, rather than simply append queries. Design and freeze a separate
comparison of context selection or rank fusion against these same bidirectional
controls before changing runtime. The current observations are development
examples, not held-out generalization evidence; a qualifying change will still
need fresh controls and actual host-generated-answer validation.

## Reproduce

Prepare the pinned host with this checkout installed at
`public/scripts/extensions/third-party/sillymemory`, then run:

```sh
npm ci
npm test
npm run check
npm run check:release
SM_ENV_FILE=/absolute/path/to/.env.local \
  ST_SOURCE=/absolute/path/to/pinned/SillyTavern \
  SM_ARTIFACT_TAG=assistant-topic-next \
  node scripts/live-smoke.mjs --assistant-topic
```

Use a fresh artifact tag. This incurs LambdaDB/embedding usage and creates only
synthetic owned collections. The report's `passed` means integrity and cleanup
passed, not that a query policy qualified; inspect `assistantTopic.adopt` and all
per-case outcomes. A failed cleanup retains the pending-resource record for
recovery. Do not share credentials or personal chats in reports.
