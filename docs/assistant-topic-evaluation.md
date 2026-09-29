# Assistant-topic selection v1

Frozen before live queries. This development comparison extends the previous
assistant-topic boundary diagnostic. It is not held-out answer-quality evidence.

Use all 32 existing natural-dialogue-v1, speaker-native-v1 and long-dialogue-v1
cases plus all six assistant-topic-boundaries-v1 cases unchanged. Keep each
fixture's recent window, chunk size and content token budget. Run once through
the pinned SillyTavern 1.19.0 browser and built-in proxy, using LambdaDB managed
embeddings, 30 candidates per query and the host gpt-4.1-mini tokenizer.
No generation calls. Query every distinct text once per case and share its exact
response across the following fixed policies:

- Baseline v3: latest user question, preceding nonempty user message.
- User-first: baseline plus preceding nonempty assistant message.
- Assistant-first: latest user question, preceding assistant, preceding user.

Only messages strictly before the question anchor provide context. Continue uses
the latest nonempty message as the anchor, matching v3. Trim each query to 6,000
characters, remove empty/duplicate queries, and keep rank interleaving and the
production whole-passage selector unchanged. Poll complete scoped source
visibility before searching; do not retry a query for missing evidence.

Prefer user-first if it selects both known Korean boundary targets (first-user
and assistant-topic), without losing any required source selected by the shared
baseline across all 38 cases. Otherwise consider assistant-first by the same
criterion. If neither qualifies, retain runtime v3 and report the negative result.
No post-result query, ordering, budget, fixture or threshold tuning in this run.
The six unknown cases cannot establish abstention without generation. Preserve
all query text, hit ranks, selected indices, token counts and source coverage.

If a candidate qualifies, integrate that exact policy, add query/race regression
tests and run pinned-host recovery tests. Before claiming generated-answer
improvement, separately freeze and run a host generation comparison covering the
boundary targets and the prior-user/topic-switch controls. Actor attribution is
a separate known limitation. Cleanup and session-key audits remain mandatory.
