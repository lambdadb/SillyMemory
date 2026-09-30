# Context bundle results and prompt-capacity boundary

Both structural context-bundle candidates recover the Korean quotation signature
missed in PR #26 at the same 320-token cap, but lose previously retained evidence
elsewhere. **Neither qualifies for fresh live validation or production adoption.**
The implementation adds offline candidates, detailed selection diagnostics, new
synthetic controls and a read-only inspection command. Product selection,
managed embeddings, chunk IDs, settings and API key handling remain unchanged.

The [protocol](context-bundle-evaluation.md) and candidates were committed as
`8dcb264` before the fresh controls were authored or replay was run. A
[frozen input plan](results/context-bundle-plan-v1.json) binds all execution
sources and evidence. The [complete result](results/context-bundle-replay-v1.json)
retains every candidate, corpus and budget, including regressions. No candidate
parameters were changed after seeing results.

## What was implemented

- `previous-turn` includes the complete seed message and its immediate predecessor.
- `adjacent-turns` includes the complete seed message and its immediate neighbors.
- Both use only eligible local source within one owner/chat scope. Missing indices
  are boundaries. A bundle is accepted whole or skipped; it is not shortened to
  drop a dependency. Exact source, roles, labels and current document validation
  remain intact. No model, evidence labels or expected answer is used to select.
- The `passage` diagnostic reproduces the shipped selector. The trace identifies
  invalid/duplicate seeds, already-covered bundles, accepted sources and budget
  rejections, with before/trial token counts and excess over the cap.
- Evaluation separately records whether each required evidence unit is represented
  in eligible local chunks, present in ranked candidates and finally selected.
  Source expansion can select a neighbor even if it was not itself retrieved.

These candidates use physical adjacency as a proxy for dependency. They do not
identify semantic relationships or know whether a neighbor is necessary. That
limitation was specified before the run and appears in the observed losses.

## Fixed-budget results

All **218 historical configuration rows** and **32 PR #26 memory-on rows** first
reproduced the exact shipped passage order and recorded token counts. The full
comparison has **362 corpus/budget rows**, each evaluated under three policies.
It includes 16 newly authored English/Korean ranked-input controls and separate
320/400/800 configurations. Synthetic ranks are supplied inputs, not new ANN
results. Repeated cases/budgets are not independent observations.

Complete required-source coverage at **320 tokens**:

| Corpus | Existing passage selector | Previous turn | Adjacent turns |
| --- | ---: | ---: | ---: |
| Historical search, original full-quote rubric | 48/54 | 43/54 | 40/54 |
| Historical generation ranks, original full-quote rubric | 26/28 | 24/28 | 24/28 |
| PR #26 ranks, answer plus mandatory context | 26/28 | 28/28 | 28/28 |
| Fresh synthetic ranks, answer plus mandatory context | 13/14 | 12/14 | 10/14 |

Unknown cases remain in integrity/token checks but have null evidence completeness.
These are source-retention measurements, **not new generated-answer grades**.
The older full-quote rubric is preserved separately and not retroactively relaxed.
The current semantic fixture is exposed development data; fresh controls were
assistant-authored with knowledge of candidate structure, not independently blinded
holdout. Both candidates fail the predeclared no-baseline-unit-loss gate: previous
turn loses 21 and adjacent turns 38 required units across the entire configuration
grid. Those counts include repeated cases and budgets.

For the PR #26 corpus alone, the existing selector remains at 26/28 at budget 400
and reaches 28/28 at 800; both candidates reach 28/28 at all three budgets. This
separates an allocation change from a same-budget selection change. It does not
establish that 800 is an optimal product default or that larger input is always
beneficial. No generation, latency or paid-token effect was measured here.

## Diagnosed examples

- **Korean quotation, same-budget gain:** the current selector reaches 295 tokens
  before the signature, whose addition would require 333 (13 over the cap).
  Previous-turn selection admits quote plus signature together at 108 tokens;
  both candidates finish with the signature present at 257/320. Both repetitions
  are recovered without increasing the cap.
- **English correction, historical regression:** `search/fallback-controls/en-correction`
  previously retains source message 20 at 312/320 total. Previous-turn selection
  consumes 240 tokens on earlier bundles, then rejects messages 19+20 at a trial
  367. The adjacent candidate rejects 19+20+21 at 483. Expanding unrelated seeds
  consumes the space needed for the actual correction.
- **Long Korean message, fresh regression:** the baseline retains the answer-bearing
  later chunk and signature at 179 tokens. Requiring the whole message includes a
  long housekeeping preamble, making the initial bundles 687 or 731 tokens, so
  both candidates omit the answer at 320. Whole-message expansion is not a
  generally safe substitute for identifying necessary source spans.
- **Distant reference, fresh regression:** the adjacent candidate fills 270 tokens
  before the antecedent's bundle. That bundle needs 324 tokens and is rejected;
  the baseline includes the antecedent and reservation together at 153 tokens.
  Adjacency can both miss a distant dependency and add unrelated context.

The [new controls](../tests/fixtures/context-bundles-v1.json) also cover quotation
authors before/after the quote, later corrections/negation, conditional access,
speaker perspective, split messages and unknowns. Their literal annotations are
not independent semantic review. No new answer accuracy claim is made.

## Prompt-capacity source inspection

The discussion distinguishes a hard total model limit from an optional memory
allocation policy. The current default of 800 and one-quarter cap are heuristics.
This work does not claim that either is optimal and does not enlarge them to
make a candidate pass.

Pinned SillyTavern 1.19.0 source establishes an integration constraint:

- [`script.js`, interceptor call](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4559)
  passes `getMaxPromptTokens()` before final chat-completion assembly. That helper
  subtracts reserved response tokens from the configured context limit; it does
  not subtract all system/character prompts, examples, recent messages or control
  overhead to give the extension an exact remaining-memory allowance.
- [`prepareOpenAIMessages`](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/openai.js#L1542)
  later prepares ordered system/character/extension prompts and populates the
  native ChatCompletion budget. It also handles role/control/tool overhead.
- The [`GENERATE_AFTER_DATA` event](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L5318)
  sees assembled data after host packing. Reading its size is useful for an audit
  but does not automatically provide a safe earlier insertion/repacking contract.

Therefore `contextSize - recentTextTokens` alone must not be presented as exact
free space. The next capacity task should instrument the real host's final
accounting and protected prompt content before choosing a dynamic policy. The
source inspection above is not a newly executed host-capacity integration test.

## Validation and reproduction

All **186 local unit/report tests** pass, including whole-bundle rejection,
Unicode/macros/native roles, split-message integrity, stale/foreign/deleted hits,
invalid-before-valid deduplication, scope and eligibility boundaries, exact
baseline replay, frozen source hashes, unknown evidence and retained losses.
Runtime/development syntax, release metadata and whitespace checks pass.

This experiment made **zero service, embedding and generation calls**. It did not
run a new host/browser scenario. The tokenizer came from the pinned local host
(tiktoken 1.0.22, gpt-4o, six-token nonempty padding). This content/label accounting
is not the full native provider-message overhead. No credentials were read and no
remote resources were created. Final managed embeddings still need their own
live revalidation before public promotion.

```sh
npm ci
npm test
npm run check
npm run check:release
mkdir -p artifacts
node scripts/context-bundle-replay.mjs --freeze artifacts/bundle-plan-next.json
ST_SOURCE=/path/to/pinned/SillyTavern \
  node scripts/context-bundle-replay.mjs --run \
  artifacts/bundle-plan-next.json artifacts/bundle-result-next.json

# Inspect a saved result without a tokenizer, server, credential or API call.
node scripts/context-bundle-inspect.mjs \
  docs/results/context-bundle-replay-v1.json \
  semantic/long-ko-quotation/r1/on 320 passage
```

The [candidate API](../scripts/context-bundles.mjs) returns all seed decisions.
The report stores all reason counts and evidence-related decisions; evidence
labels filter that diagnostic view only after selection. The
[inspection command](../scripts/context-bundle-inspect.mjs) rejects incomplete
reports or ambiguous/missing case-budget selections. It cannot infer unknown
semantic dependencies from arbitrary unlabeled chat.

The next selection experiment should identify which exact context spans are
required, handle preceding/following/distant dependencies and prefer informative
bundles over redundant ones. It must preserve the losses discovered here as
regressions and use additional untouched cases after candidate freeze. Do not
promote unconditional adjacency or inflate a cap to hide these failures. Main,
release version and production behavior remain unchanged.
