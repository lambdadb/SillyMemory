# Shared-question reranking protocol

Freeze inputs, producer and this protocol before traffic. Product question: does
using a common current request plus reference context for both reranked candidate
lists recover the observed medicine loss without losing the earlier gains?

Only the experimental rerank.queryText changes. Keep the two retrieval queries,
hybrid fusion, default Jev criteria, text field, candidateSize=30, k=30, size=30,
owner/scope/branch filters, consistent reads, 800-token budget, recent=4, chunking,
interleaving and prompt rendering unchanged. No product/UI default is changed.

The shared text labels the first retrieval query as `Current request` and the
second as `Prior conversation (reference context, not a separate request)`.
It is built from the runtime's actual retrievalQueries result for the generation
type. Do not use expected answers, source facts or case labels. Preserve the current
request verbatim. Fail safely if that labeled request exceeds 8 KiB UTF-8. If only
the context overflows, keep a code-point-safe prefix with an explicit truncation
marker; never split a character or truncate the current request to make room for
context. The common text is identical for both search legs.

Arms: vector; original hybrid + Jev (each retrieval query is its own rerank target);
shared-question hybrid + Jev. Record actual candidate sets per query. Comparing the
two hybrid arms isolates the intended queryText change only when candidate sets
match. Keep raw retrieval/final scores and report mismatches rather than claiming
pure reordering across different pools.

1. Probe all three arms on the 14 previously observed cases (hybrid-v1 plus
   rerank-confirmation-v1) using the existing real-host MemoryEngine/tokenizer and
   live LambdaDB path, without generation. These are diagnostic inputs, not held-out.
   Require the medicine fact to be selected, every candidate rerank response applied,
   and no loss of any tagged fact delivered by either comparator before proceeding.
2. Replay the two hybrid arms' fixed candidates through actual host generation for
   five preselected cases: new-paraphrase-medicine, rare-name, correction,
   new-revocation and new-historical-state. Require an answer gain and zero losses
   versus original hybrid + Jev. These ten answers test the concrete correction,
   an earlier gain and current/unknown/historical controls without regenerating
   every previously consumed case.
3. Only then probe all three arms on six new cases in rerank-intent-v1.json and
   generate their 18 paired answers from the exact live-derived lists. They include
   a new paraphrase, entity/person references, a topic switch, flashback and revocation.
   Require no answer loss versus either comparator. Report new gains separately;
   new control cases need not manufacture another gain to pass a non-regression gate.
   Manually inspect all answers against the sources as well as the frozen identifier
   grader. The flashback's earlier statement can also independently support its answer;
   tagged fact coverage is not a complete semantic evidence metric.

SillyTavern 1.19.0 revision 06bde939fb1e9c4c8d8641d810f0a916b5bce127,
gpt-4.1-mini-2025-04-14, temperature=0, max output=256, 32K host context. Maximum
28 successful answers, 36 attempts, two eligible transient retries per sample/eight
per run, 15-second provider-start spacing. Maximum three owned collections, 4,000
submitted documents, 200 live query calls. The existing six-token nonempty token
padding and production packing remain unchanged. No successful-answer retry.

Stop if a gate fails; do not change the shared text, criteria, budget or fixtures
in response to the results. Preserve all raw outcomes and verified cleanup. These
are compact authored conversations, not natural 32K overflow or a public benchmark.
All-known-case evidence retention and a new six-case gate provide a narrow correction
check, not proof of universal non-regression. Any default adoption remains a separate
reviewed product decision. Keep the source/settings plan and a checksummed local-only
archive; extend the existing PR instead of adding a PR for each stage.
