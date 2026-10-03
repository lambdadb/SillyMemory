# Sentence passage development protocol

This offline follow-up to PR #23 compares two source-preserving excerpt policies.
It is development on known recorded hits, not a new independent quality trial.
The candidates below are fixed before running their comparison. Production
selection, indexed chunk IDs and managed searches stay unchanged.

## Fixed candidates

Both candidates validate remote hits against current local documents before
first-occurrence deduplication. They keep the v5 primary/context interleaved
parent order. For each parent they choose its highest-scoring contiguous window:

- `sentence-1`: one sentence.
- `sentence-2`: at most two adjacent sentences.

A sentence ends at `.`, `!`, `?`, `。`, `！` or `？`, optional closing quotes or
brackets, then whitespace/end. Whitespace is retained in exact source offsets.
This deterministic splitter is deliberately conservative in scope, not a general
linguistic parser: abbreviations such as `Dr.` may be split. No LLM, translation,
answer label, evidence quote or semantic rewrite participates in selection.

Window score is the maximum set cosine with either query, using Unicode
letter/number word trigrams after NFKC/lowercase normalization; inputs are bounded
to 6,000 UTF-16 units. Ties keep the earliest window. A document with fewer
sentences uses all available sentences. First pass greedily packs one window per
parent. A second pass tries restoring each selected parent to its whole original
passage in parent rank order, within the same budget. No extra ranking/candidate
will be added after observing these results.

Rendering keeps the original native role/name and existing source header. It
adds explicit `[Earlier source text omitted]` / `[Later source text omitted]`
markers when the contiguous span excludes a prefix/suffix. Source text is copied
literally; macro escaping and chronological order use production rendering.
Every trial counts the complete rendered content, including headers and omission
markers. A partial excerpt must not be reported as full source coverage merely
because its parent document was selected.

## Dataset, budget and gate

Use the same 94 recorded inputs and 218 configurations as PR #23: 62 search cases
at 320/400/800, preserving each original recent window; 32 generation-on records
at recent 8 / effective 320. Pin the same SillyTavern revision and tokenizer.
First reproduce every PR #23 baseline selection and token count. Preserve the
full required evidence quotes, including corrections and distractor context;
do not shorten the rubric after observing a partial match. Evidence coverage
requires the entire original quote inside the selected contiguous source span.
This conservative source-retention score is not an answer-quality score.

A candidate can advance only if it gains at least one required source, loses
none selected by the baseline, and recovers both recorded Korean historical
assistant-topic misses at effective 320. Record partial parent-only matches
separately without counting them as success. Unknown cases remain in budget and
source-integrity checks but have no required-source denominator.

For a passing candidate, freeze a fresh holdout and actual-host generation
protocol before new service calls. Replay only changes excerpts of already
returned parent documents; it does not establish retrieval quality for separately
indexed sentence chunks. Such indexing needs new searches, ID/sync migration
checks and its own protocol. If neither candidate passes, retain production
selection and stop this bounded experiment without paid follow-up.
