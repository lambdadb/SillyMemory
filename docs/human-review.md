# Independent human answer review

Retrieval and integrity checks do not establish answer quality. A successful live
report can still have a failed semantic gate. Assistant annotations are provisional;
keep the human gate unset until an identified human supplies the full assessment.

## Prepare a blinded packet

For a completed, integrity-checked, cleaned-up natural-dialogue report:

```sh
node scripts/natural-summary.mjs artifacts/generation-natural-long-dialogue-v1.json --output-dir artifacts/long-dialogue-review-v1
node scripts/natural-review.mjs artifacts/long-dialogue-review-v1/blind-review.json --output artifacts/long-dialogue-human-review.html
```

The same commands support the original natural-dialogue and speaker evaluations.
Use new output paths: preparation refuses to overwrite a file. The renderer reads
only the human packet; it rejects the review key, assistant annotations, or extra
mode fields. It does not contact any service, run inference, or assign scores.

Give an independent reviewer **only the HTML file**, or the unfilled
`blind-review.json`. Withhold the review key, condition-labelled answers, assistant
scores and results summary until annotations are final. The HTML contains the
question, full synthetic source, frozen rubric and answer for each randomized
record. It does not include mode, repetition or retrieval measurements. Textual
answer differences may still suggest the condition; this is not proof that a
reviewer cannot infer it. A person who already saw labelled results is not a new
blinded reviewer.

Open the HTML locally in a browser. Read the source and rubric, then enter an
outcome, whether it contains an unsupported assertion, and a short rationale.
Do not score by keyword presence alone: check who did an action, which correction
is current, and whether missing information was invented. Unknown-price cases
permit only `unknown-handled` or `incorrect`; answerable cases permit `correct`,
`partial`, `incorrect` or `abstained`.

The form has **no autosave or browser storage**. Use **Save draft JSON** before
closing or reloading. To resume a partial review, render that downloaded JSON to
a new HTML filename with the same command. **Export complete human annotations**
requires a reviewer name and valid annotations for every record. Downloading a
file does not calculate or approve a quality result. If a rubric is genuinely
ambiguous, preserve the draft and request a second review rather than changing
the oracle to match an observed answer.

## Validate and score the completed assessment

```sh
node scripts/natural-score.mjs artifacts/generation-natural-long-dialogue-v1.json \
  /path/to/human-annotations.json artifacts/long-dialogue-review-v1/review-key.json \
  --output artifacts/long-dialogue-human-score-v1.json
```

The scorer verifies report identity, source, question, rubric, answers, every
record identity and annotation compatibility before deriving paired results.
It rejects modified source/answers and incomplete annotations. Keep the original
unfilled packet and assistant scores separately; do not replace them with human
results or describe assistant-operated form tests as actual human review.

The renderer's local validation can be checked with `node scripts/review-ui-smoke.mjs`.
That browser test uses two synthetic annotations, verifies draft/resume/export,
blocks incomplete/contradictory completion and script injection, and makes no
network requests. It writes `artifacts/review-ui-smoke.json`; it creates no real
quality labels for an evaluation. Unit coverage is part of `npm test`.
