# Context bundle selection experiment v1

## Decision and scope

Following PR #26, distinguish finding adequate context from allocating prompt
space. The current 800-token default and one-quarter cap are heuristics, not
validated optima or model requirements. This experiment changes only offline
selection units at fixed budgets. It does not change the product, its managed
embeddings, index/chunk IDs, host integration or user settings. No provider key
or service call is needed. Dynamic prompt capacity is a separate policy question.

## Freeze before evaluation

Use exactly three policies, implemented before creating the fresh controls or
running replay. Do not tune their parameters after observing results:

- `passage`: reproduce the shipped greedy whole-chunk selector and its rendering.
- `previous-turn`: for a ranked seed, atomically include its complete eligible
  source message and the immediately preceding eligible message, if present.
- `adjacent-turns`: atomically include the seed's complete eligible message and
  its immediately preceding/following eligible messages, if present.

These are structural neighborhood heuristics, not semantic dependency detectors.
They can include irrelevant neighbors or miss distant attribution. Use only the
current local eligible source, within one owner/scope. Do not cross missing source
indices or recover recent/ineligible messages. Keep all chunks of included
messages, native roles, exact source text and normal labels. The ranked seed must
pass the same identity/text validation as production. Do not use the rubric,
evidence offsets, case ID, expected answer or a model to choose neighbors.

An over-budget bundle is skipped as a whole; later seeds can still be considered.
Never remove a dependency from an accepted bundle to squeeze in another seed.
Count the complete rendered union, including labels; do not sum per-chunk token
estimates. Repeated/invalid remote copies cannot suppress a valid seed. Report
seed rank, source membership, expansion, duplicates, invalid hits, trial tokens,
over-budget amount and accepted/rejected decisions. Record source availability,
retrieval presence and final selection separately for each required evidence unit.

## Corpora and evaluation

1. Reproduce PR #26's 32 memory-on rows from frozen direct-path result ranks,
   restoring query order rather than completion order. Reconstruct local source
   from its fixture and verify every recorded hit against it. Reproduce exact
   baseline passage order and observed 320-token counts first. Evaluate all three
   policies at 320, 400 and 800 as separate configurations, not new retrievals.
2. Retain the earlier 218-row historical search/generation replay and original
   full-quote metrics. Do not retroactively waive its losses as semantic passes.
3. After fixing candidates, author fresh English/Korean ranked-input controls
   with literal answer/context spans, corrections, quotation attribution,
   nonadjacent dependencies, long split messages and unknowns. Freeze their source,
   supplied rank lists and rubric before evaluation. These are authored synthetic
   selector controls, not fresh live retrieval, independent blind holdout, or
   generated-answer evidence. Treat them as exposed development data afterward.

Candidate input is only validated ranked documents, eligible local documents,
budget and tokenizer. The scorer receives labels afterward. Use the pinned
SillyTavern 1.19.0 tokenizer (tiktoken 1.0.22, gpt-4o, six-token nonempty padding).
Unknowns keep evidence completeness null, not vacuous success. Report answer
spans separately from mandatory context, every baseline evidence-unit loss,
complete-case gains/losses and token usage per corpus and budget. Eligibility for
fresh live validation requires no lost baseline required units across these
checks and recovery of both PR #26 quotation misses at 320. Passing this gate is
not authorization to adopt a candidate or evidence of better generated answers.

Freeze hashes of code, fixture, protocol, runtime and historical inputs into a
new plan before evaluation. Keep the plan/result and any failures. Source changes
invalidate the plan. Preserve all candidate outcomes; do not rerun tuned candidates
under the same version. Production adoption needs separate actual-host validation
and the final managed path must be revalidated before public promotion.
