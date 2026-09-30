# Temporary direct-embedding cohort results

On 2026-09-30, the complete 64-answer experiment finished through the actual
SillyTavern 1.19.0 Generate path, live OpenAI generation, direct OpenAI embeddings,
and LambdaDB vector writes/search through the built-in proxy. This is the
[temporary experiment](semantic-direct-evaluation.md), not evidence of managed
embedding recovery. The final product still uses managed embeddings and requires
no separate embedding-provider setup.

## Execution and transport

The [complete report](results/semantic-direct-v1.json) passed 837 checks with
64 generation calls, no generation retries and no embedding errors or retries.
All 270 LambdaDB request records completed; the only non-success responses were
expected HTTP 404 checks after owned collection deletion. Both owned collections
were deleted and confirmed absent; no pending cleanup remains. Browser storage
and persisted host settings contained neither real key. A separate configured
secret scan of the report and review artifacts passed. Reload key-reset behavior
was not retested by this cohort; earlier separate diagnostics covered it.

The runtime, fixture, adapter, verifier and protocol hashes stayed fixed during
execution. Every sample had an isolated restored chat. Source preservation,
actual source overflow, off-mode truncation, recent-history retention, native
roles, literal source excerpts and the effective 320-token cap passed. All actual
generation starts were at least 15 seconds apart. Production deadlines stayed at
15 seconds, covering embedding plus database transport for each memory request.

The run used 162 direct embedding calls / 1,762 inputs / 104,825 reported input
tokens. Observed runtime upsert batches were exactly 32 batches of 50 documents,
32 batches of two, and 33 batches of one (including the gate). There were 65
single-input search embeddings. No batched input was split, merged, cached or
precomputed. Request hashes, ordered document IDs and the embedding-to-database
request mapping are retained without vectors or provider credentials.

| Observed latency (ms) | Count | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Direct embedding, all requests | 162 | 178 | 545 | 2,250 |
| Direct embedding, 50-input upsert batches | 32 | 324 | 658 | 805 |
| Database leg for embedding-backed requests | 162 | 199 | 514 | 2,450 |
| Embedding plus database, total request | 162 | 383 | 1,033 | 4,701 |

These are observed times for this local run, not service availability estimates.
The database leg includes the host/proxy/network and response transfer. Provider
credentials/account, network location and timing are not controlled against the
managed server. The earlier managed timeouts remain unexplained: this result
shows that preserving the client batches while bypassing managed embedding
completed the experiment; it does not prove an OpenAI or LambdaDB root cause.
Generation usage was 61,628 prompt and 2,006 completion tokens.

Raw report SHA-256:
`64fd3cb80d89fdb2d855f3bf8fea64a8cbac2239637f527737cf7f59ed8dcce3`.
The executable baseline was committed as `10686bb`; subsequent test-only
verification at `2fa3e96` did not alter any frozen execution input.

## Delivery and provisional answer review

The [delivery summary](results/semantic-direct-review-v1/summary.json) is distinct
from the [assistant score](results/semantic-direct-review-v1/assistant-score.json).
All 64 randomized answers were inspected against the frozen source, expected rule
and forbidden claims. This is provisional assistant review, not independent or
blinded human grading. Preserve the [unfilled human packet](results/semantic-direct-review-v1/packet.json),
[condition key](results/semantic-direct-review-v1/key.json) and
[separate assistant annotations](results/semantic-direct-review-v1/assistant-annotations.json).

| Measurement | Memory off | Memory on |
| --- | ---: | ---: |
| Known-answer samples | 28 | 28 |
| Complete source evidence in final prompt | 0/28 | 26/28 |
| Fully correct known answers | 0/28 | 26/28 |
| Partial known answers | 0 | 2 |
| Abstained on a known question | 28 | 0 |
| Unknown questions correctly left unanswered | 4/4 | 4/4 |
| Strict passes, including unknowns | 4/32 | 30/32 |

Across 32 off/on pairs, 26 improved, six tied and none regressed under this rubric.
The intentionally truncated off baseline had no answer evidence; do not generalize
this gap to ordinary chats or use it as a production quality guarantee. The two
language variants and repeated padding are correlated, not 64 independent tasks.

## Remaining Korean quotation failure

Both `long-ko-quotation` on samples gave Wednesday and correctly said the assistant
was quoting a note, but omitted **Haesol**, the person who made the promise. They
are partial answers, not strict passes.

The signature document (source message index 0) was present in both query result
lists: rank 9 for the question and rank 15 for the contextual query. The final
selector retained indices 1, 2, 27 and 42, using 295 tokens, but omitted index 0.
With the pinned tokenizer, adding the signature to that selected set would use
333 tokens, exceeding the 320 cap. The quote and signature alone use 108 tokens.
Thus the missing attribution is observed **after retrieval**, in ranking/selection
under the token budget; it is not a missing ANN candidate in these two samples.
This does not measure general ANN recall or establish that all other search
quality failures have the same cause.

The next retrieval task is to evaluate preservation of attribution/context around
selected quotes, without expanding the production budget to hide the issue. Use
this cohort as an exposed development baseline and introduce new untouched cases
for any candidate comparison. No selector was changed or retuned in this run.

## Validation and release boundary

All 178 local unit/report tests, runtime syntax and release metadata checks pass. CI on
Node 20.12 and 24 passed for the adapter commits. These are separate from the
actual-host live evidence above. Reproduction is in the
[temporary protocol](semantic-direct-evaluation.md); successful reports are
revalidated by `scripts/semantic-results.mjs` and annotations by
`scripts/semantic-score.mjs`.

The requested full cohort has completed for the temporary direct path. The
[managed attempts](semantic-long-results.md) remain incomplete. This does not
make managed production transport release-ready; revalidate it before public
promotion. PR merge, main promotion and release are separate maintainer actions.
