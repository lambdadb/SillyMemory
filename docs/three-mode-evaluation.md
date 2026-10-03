# Equal-context long-dialogue comparison

Freeze the existing 16 English/Korean, 60-message semantic cases and their
rubrics. Run all three modes twice (96 answers): plain SillyTavern, built-in
Vector Storage, and SillyMemory. Rotate the six mode orders; do not rerun a
successful low-quality answer or tune settings after observing answers.

All modes use pinned SillyTavern 1.19.0 (`06bde939`), the same OpenAI
`gpt-4.1-mini-2025-04-14`, temperature 0, 256 output tokens and a 1,536-token
context setting. SillyMemory keeps eight recent messages and uses configured
memory 400/effective 320. Native Vector Storage uses protect 8, query 2, insert
3, threshold 0.25, 400-character chunks and its original `Past events:` prompt at
position 0/depth 2. These are declared evaluation settings, not factory defaults.
Native keeps its own history/retrieval behavior; no SillyMemory token cap or
history-pruning rule is imposed on it. Summarization, files and World Info are off.

Each sample gets a fresh chat with exactly restored synthetic source. Native
indexes are verified against all unique source hashes before generation.
SillyMemory uses managed embeddings and ordinary upsert/queryText through the
built-in proxy. Native uses its existing vLLM/OpenAI-compatible adapter and a
test-only loopback bridge forwarding `text-embedding-3-small` requests to OpenAI;
there is no local vLLM or product server plugin. Native embedding calls are bounded
at 800 with at most five inputs each. Generation calls are bounded at 104 (96
scheduled plus at most eight transient HTTP retries), with the existing 15-second
provider-start spacing. Retry status/delay/deadline rules remain unchanged.

Record actual outgoing prompts, selected source, native query results, provider
answers/usage, preparation and generation latency. Compute evidence delivery
separately from provisional assistant semantic grades. An unfilled review packet
remains available for human review. Verify every producer hash, all 96 samples,
recent-history preservation, source integrity, both remote collection deletions
and all 32 native collection purges. Mutation tests must reject incomplete source,
missing native delivery and unbalanced samples. Source-token totals count repeated
source occurrences, not unique messages. Token counts do not establish total cost;
managed embedding usage is unavailable and prefix-cache effects can differ.

The fixed context permits a direct constrained-context recall comparison.
Observed prompt sizes also show each product's actual input behavior, but this
is not a search-tuned native baseline or a matched-quality token-efficiency frontier.
These familiar synthetic cases do not establish general superiority or real-user
preference. Do not compare new timings causally with runs on different dates.

```sh
ST_SOURCE=/pinned/host node scripts/three-mode-plan.mjs artifacts/three-mode-plan.json
ST_SOURCE=/pinned/host SM_ENV_FILE=/outside/repo/.env.local \
SM_MODEL=gpt-4.1-mini-2025-04-14 SM_NATURAL_PLAN=artifacts/three-mode-plan.json \
SM_ARTIFACT_TAG=three-mode-v1 node scripts/generation-smoke.mjs --three-modes --retry-transient
node scripts/three-mode-results.mjs artifacts/generation-three-modes-three-mode-v1.json artifacts/three-mode-summary.json
```

Use fresh paths/tags. Preserve failed reports and explicitly separate zero-answer
setup failures from completed answer samples. No product policy, main promotion,
release or deployment is included in this comparison.
