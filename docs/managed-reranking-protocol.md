# Managed reranking v1 protocol

Frozen before live traffic. Product question: does default managed Jev reranking
improve delivered evidence and final English answers within the existing 800-token
budget, without losing baseline-correct answers? Production retrieval is unchanged.

Compare vector and vector + Jev (`typesafe`, `jev-1.13.0`, default criteria,
`onFailure: returnOriginal`). Both use k=30, size=30, consistent reads, the active
chat branch and owner/scope filters. Rerank candidateSize=30, fields=[text]. Keep
current query construction, interleaving, chunking and chronological rendering.
Only indexed passage text enters Jev; speaker/ordinal labels in the final prompt
are not additional reranker fields. Never infer event time from message time.

Freeze the 12 new synthetic English cases in `tests/fixtures/rerank-v1.json` before
traffic. Each has 40 older turns (facts at ordinals 2 and 24), four neutral recent
turns, and a new question. Alternate arm order. Recent window=4, budget=800,
host context=32768, pinned SillyTavern 1.19.0 revision
06bde939fb1e9c4c8d8641d810f0a916b5bce127, model=gpt-4.1-mini-2025-04-14,
temperature=0, maximum output=256. Generation must pass through the actual host.
This tests memory selection on compact synthetic chats, not natural 32K overflow.

Maximum 24 successful generations, 32 attempts, two eligible transient retries per
sample/eight overall, 15 seconds between provider starts. No retry for a successful
wrong answer. No runtime/schema edits, custom criteria, candidate expansion, budget
sweep, or post-result fixture tuning. Managed embeddings remain enabled. Bound the
run to three owned collections, 2,000 submitted documents and 160 retrieval calls
(including the gate/preflight and engine activity); fail closed at those caps.

Before answer generation, verify real browser/SDK reranking on a dedicated branch,
foreign owner/scope and sibling branch exclusion, applied score metadata, and
consistent-read deletion. If applied reranking is unavailable, stop with the exact
blocker and clean owned data. Earlier hybrid failures are diagnostic-only; the
first v1 run uses the new 12-case gate and does not add old-case generation calls.

Record both arms' actual candidate IDs/text and retrieval/final scores, status and
latency; compare candidate sets by query text before attributing a change purely
to ranking. Record selected passages, complete required evidence, exact normalized
answer accuracy, memory and provider input/output tokens, generation latency and
available reranker metadata. Allow only case/punctuation normalization; do not
silently award verbose/contradictory answers. Inspect raw answers when interpreting.

Distinguish absent candidate, ranked but budget-excluded evidence, and wrong answers
with complete evidence. A removed correction can cause stale-current-state answers;
returning both is intentionally counted as complete evidence where specified.
Fallback is availability evidence, not a successful Jev evaluation. No total-cost
claim without reranker/embedding billing data. Require >=1 gained correct answer,
zero lost baseline-correct answers, applied results and all isolation/budget/delivery
checks for provisional adoption. Otherwise retain production vector retrieval.
Even a positive narrow gate needs review; this runner does not activate Jev in the UI.

Stop at completion, a safety/cost bound, or an external blocker. Preserve partial
reports, frozen hashes and cleanup ledger; do not tune and restart unboundedly.
Raw artifacts and producer source stay in an ignored checksummed archive; concise
outcomes and interpretation belong in the repository.
