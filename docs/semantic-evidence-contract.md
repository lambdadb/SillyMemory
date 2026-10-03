# Answer-bearing spans and mandatory context

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

PR #24 found that sentence excerpts can retain the exact answer fact while
failing a paragraph-length quote rubric. It also demonstrated why a selected
parent ID cannot prove that all necessary context survives. This follow-up
implements a **proposed evaluation contract**, without changing those historical
scores, production retrieval, or the sentence candidates.

## What is implemented

A fresh [16-case English/Korean fixture](../tests/fixtures/semantic-evidence-v1.json)
separates two kinds of required evidence:

- **Answer-bearing spans:** the complete actor/action/object/time or other fact
  requested by the question. Unrelated decorative text need not be retained.
- **Mandatory context:** cancellation, negation, conditions/fallbacks, pronoun
  antecedents or quotation attribution needed to interpret those facts correctly.

Every annotation has an exact message index and UTF-16 `[start, end)` range,
verbatim quote, stable ID, kind and reason. Role and speaker are mandatory for
**every** excerpt, including facts without a separate attribution annotation.
Each case includes an expected answer rule and explicit forbidden claims for
future semantic answer review; those rules are not a substring-based grader.

The eight paired shapes are minimal fact, correction, negation, condition,
speaker perspective, cross-message reference, quotation attribution and unknown.
The English dock and Korean garden examples use fresh wording, names, objects
and schedules. Their shapes are informed by observed failures; assistant
authorship and correlated shapes do not establish independent human evidence.
These are short annotation microfixtures, not a prepared long-context generation
benchmark. No claim of forced truncation or recall improvement is made.

## Evaluator contract

The [offline module](../scripts/semantic-evidence.mjs) exports:

- `candidateInput`: source messages with role/name/content plus the question.
  It excludes annotation IDs, spans, rationales, expected answers and forbidden
  claims. It returns copies so later candidate code cannot mutate the rubric.
- `sourceExcerpt`: a literal span envelope with case identity, whole-source hash,
  message, role, speaker, offsets and text. This constructs test inputs; a later
  runtime adapter must independently recover and verify these fields.
- `evidenceCoverage`: validates every excerpt before computing separate answer
  span coverage and mandatory-context coverage. Altered text/roles/speakers,
  foreign cases, stale source snapshots, unknown messages, out-of-range offsets
  and surrogate-pair cuts are rejected, rather than silently ignored.
- `auditSemanticFixture`: checks annotations and exercises full-source,
  minimal-required, answer-only, empty and single-requirement omission probes.
  These excerpts are constructed using the oracle annotations: their results are
  evaluator checks, **not candidate retrieval or answer-quality measurements**.

A required unit is covered only if one validated contiguous excerpt encloses
its entire range. Duplicate excerpts do not inflate counts. Two fragments that
each contain half a required unit do not make it complete: the v1 contract does
not certify arbitrary reassembly, fragment order or intervening prompt content.
All annotated units must be covered for `completeEvidence: true` on a known
answer. An answer-only excerpt missing one required qualification remains
incomplete even if its actor/object/time appears correct.

Unknown cases have no known-answer annotations and return
`completeEvidence: null`, including with empty excerpts. They are not vacuous
recall successes. `answerQuality` is always null: source retention cannot prove
that a model interprets negation, roles, paraphrases or uncertainty correctly.

Source hashes bind case ID, question and the complete role/name/text history.
They do not substitute for a final outgoing-prompt audit. The API expects literal
source spans; macro escaping, excerpt labels and actual role/order preservation
must also be verified by a future host adapter. This is test infrastructure, not
a security boundary or a replacement for extension-side source validation.

## Review and execution boundary

The fixture is explicitly `proposed`, with `humanReview` and `candidateResults`
unset. Neither the audit nor a successful CI run approves its semantic labels.
The generated review packet shows the full source, question, required spans,
reasons and forbidden claims, with empty reviewer/date fields and unchecked
per-case review boxes. No annotations have been submitted as human review.

```sh
npm ci
npm test
npm run check
npm run check:release
# Offline; no host, credentials or tokenizer required. Parent directory must
# exist; the output directory must be new to protect human notes and old results.
node scripts/semantic-evidence.mjs artifacts/semantic-review-next
```

Before a candidate experiment, review and freeze the semantic criteria and
prepare a separate long-dialogue corpus with source overflow verified under the
actual pinned host. Preserve the distinction between answer spans and mandatory
context through that preparation. Commit/hash the source-only inputs, rubric,
candidate code, query policy, recent window, effective memory budget and model
settings before any provider calls. For the previous host setting, configured
400 / context 1,536 / output 256 means effective memory 320, not 400.

Compare baseline and candidate on identical fresh returned hits; count known
answer evidence and unknown abstention separately. Require no losses of complete
baseline evidence, then verify actual outgoing prompts and generated answers.
A live source-coverage pass is still not a semantic answer pass. Do not tune
candidates on this corpus and continue to call it an untouched holdout; once
used for development, reserve fresh data for the next comparison. Retain PR #23
and #24's negative results unchanged rather than rescoring them into successes.

## Current validation record

The [checked-in audit](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-evidence-audit-v1.json) validates 16 cases:
14 known answers, two unknowns, 30 required units and 30 single-unit omission
probes. Ten cases require context beyond answer-bearing spans. All omission
probes fail completeness as intended; full-source and minimal-required envelopes
pass known-answer coverage. These are deliberately constructed evaluator inputs,
not evidence that any memory policy found or injected those spans.

161 unit tests pass locally on Node 24.15.0. The new regressions cover foreign or
stale sources, changed speaker/role/text, Unicode boundaries, duplicate and
fragmented excerpts, malformed rubrics, unknown/null scoring, oracle exclusion
from candidate input, and output-directory overwrite protection. Runtime and
development syntax, release metadata and whitespace checks pass. No host,
LambdaDB, embedding or generation calls were made.

The [review packet](semantic-evidence-review.md) contains all 16 cases and remains
unfilled; assistant inspection is not human semantic approval. Start there to
review whether each fact/context requirement and forbidden claim is justified.
The [tests](../tests/semantic-evidence.test.js) and exact input hashes in the audit
allow the structural checks and generated packet to be reproduced.
