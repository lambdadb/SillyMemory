# Speaker attribution development evaluation v1

Declared before generation on 2026-09-29. This is a focused development
regression, not a new blind held-out benchmark or a replacement for the historical
64-answer natural run. Keep the original corpus, annotations and evidence intact.

## Change and hypothesis

The old memory wrapper labels display names but omits the user/assistant role
and presents first-person source text without a block quotation. Two English
cases produced correct facts with unsupported claims of personal involvement.
That suggests attribution ambiguity; it does not prove retrieval or ANN failure.
Keep the source text and retrieval policy, add locally derived roles and explicit
quotation boundaries, and explain that first-person words belong to the source
speaker. Assistant-authored actions must still be attributable to the assistant.

## Fixed inputs and execution

`tests/fixtures/speaker-attribution-v1.json` contains six cases: the unchanged
`en-workshop-return` and `en-observatory-correction` regressions, plus English and
Korean notebook cases with the same first-person claim spoken by either user or
assistant. Notebook questions explicitly ask who and where. Each has 32 source
messages; evidence is outside the recent 12-message window. These are synthetic
and short enough for the memory-off baseline to retain the full history.

Use the existing counterbalanced off/on schedule, two repetitions, **24 answers**.
Pin SillyTavern 1.19.0 / `06bde939fb1e9c4c8d8641d810f0a916b5bce127`,
`gpt-4.1-mini-2025-04-14`, temperature 0, output 256, context 8192, memory 800 tokens.
Freeze the changed source hashes before the first provider request. The usual
source-preservation, current-document, budget, final prompt, secret and owned-data
cleanup checks apply. Keep oracle data outside the browser and model input.

The [transport amendment](natural-dialogue-retry.md) permits at most two retries
per sample and eight per run: **32 attempts maximum for this 24-answer schedule**.
Only eligible 5xx responses may retry; no successful answer retries, suffix
resumes or substitutions. Record every actual upstream start and enforce 15-second
spacing. Keep failures and partial runs; do not tune after observing these answers.

## Assessment

Use the existing meaning-based rubric: correct facts with correct attribution
and no unsupported assertions. The strict on-mode diagnostic gate requires all
12 on answers to pass. Preserve individual repetitions and all 12 off/on pairs,
including losses. Wrong speaker is incorrect for explicit who-questions; an
otherwise correct answer with an extra false first-person claim gets the separate
unsupported-assertion flag. Natural Korean omitted subjects are not automatically
first-person claims. Review source and answer together; never grade by keywords.
Assistant annotations remain provisional with the human semantic gate unset.

Compare the two reused cases with the historical answers descriptively, not as
a controlled causal ablation. Added labels consume budget and may alter passage
selection. Provider variation is possible. No universal accuracy, retrieval
advantage, prompt-injection immunity or token-saving claim follows from this run.

## Commands

```sh
node scripts/natural-dialogue.mjs --output artifacts/speaker-plan-v1.json --fixture speaker-attribution-v1
ST_SOURCE=/path/to/isolated/pinned/SillyTavern \
SM_ENV_FILE=/path/to/original/.env.local \
SM_NATURAL_PLAN=artifacts/speaker-plan-v1.json \
SM_ARTIFACT_TAG=speaker-v1 npm run test:natural:live -- --retry-transient
node scripts/natural-summary.mjs artifacts/generation-natural-speaker-v1.json --output-dir artifacts/speaker-review-v1
```
