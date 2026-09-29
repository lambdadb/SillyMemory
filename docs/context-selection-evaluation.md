# Context selection diagnostic v1

Frozen before live calls. This development comparison investigates the Korean
banner-reference miss in the long-dialogue run. It is not a held-out quality test.

Use every case in the existing natural-dialogue-v1 (16), speaker-native-v1 (8),
and long-dialogue-v1 (8) fixtures once. Keep each fixture's recent window, chunk
size and content token budget. Use the pinned SillyTavern 1.19.0 browser, built-in
proxy, managed embeddings, 30 candidates per query and the OpenAI host tokenizer
for gpt-4.1-mini-2025-04-14. No generation calls are made in this diagnostic.

Compare the following fixed query pairs, retaining rank interleaving and the
current whole-passage selection/validation algorithm:

- Baseline: latest user question; question plus previous two nonempty messages
  in reverse order (the existing v2 policy).
- Context-only: latest question; previous two messages without the question.
- Prior-user: latest question; preceding nonempty user message alone.

Bound each query to 6,000 characters and deduplicate identical queries. Send each
distinct query once and reuse its exact response for all variants. Poll only for
complete scoped source visibility before queries; do not retry a query because
an expected fact is missing. Persist query text, raw ranks, selected message IDs,
content tokens and per-required-source coverage. Unknown cases have no required
source and cannot establish safe abstention without subsequent generation.

Prefer context-only if it recovers the known miss without losing any required
source selected by baseline anywhere in this cohort. Consider prior-user only
if that criterion fails for context-only. If neither qualifies, retain the
runtime and report the negative result before designing another comparison.
No budget increase, source/rubric edit, oracle-generated query or scoring change.
This checks source selection, not actor interpretation or answer quality.

If a candidate qualifies, implement it and rerun the unchanged long-dialogue
32-answer schedule with a new frozen plan and artifact identity. Preserve prior
results and all failures. Keep assistant grading provisional and the human gate
unset. Run unit tests and relevant pinned-host emulator regression checks.
