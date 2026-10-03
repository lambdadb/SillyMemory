# Retrieval diagnosis

This follow-up isolates search behavior behind the fixed 54-generation comparison. The recorded diagnostic did not generate any LLM answers or change the product retrieval algorithm. The later runtime change is documented in [query policy validation](query-policy.md).

## Design

Use the same three synthetic histories and nine questions from `comparison-fixture.mjs`, with a fresh owned namespace. Build documents with the shipped `documents()` function after appending the exact question used in the generation evaluation. This includes the one additional older message that becomes eligible when the new question moves the recent-message boundary. Keep 12 recent messages, 800-code-point chunks, top 30 candidates, and an 800-token memory budget.

For each question, use four fixed queries:

- `current`: the original shipped chronological concatenation of the latest three messages.
- `reverse`: the same three messages in native Vector Storage's reverse order.
- `latest`: the latest user message alone, including the evaluation's short-answer/UNKNOWN instruction.
- `question`: only the factual question, without that instruction or preceding dialogue.

All operations go through the actual pinned SillyTavern browser/CORS proxy. Create two dedicated LambdaDB collections: the production managed-embedding schema, and a diagnostic-only unmanaged cosine field. Normal text upserts produce the managed document vectors. Fetch every known ID with `includeVectors: true` and verify its source/ownership/scope/dimension. Copy those exact vector components into the diagnostic collection and fetch them back for equality checks.

[Managed fields accept `queryText`, not `queryVector`](https://docs.lambdadb.ai/guides/collections/managed-embeddings). Therefore each query string is also materialized as a managed-embedding probe document in a separate, excluded scope. Fetch its vector and use that exact numeric vector for both the diagnostic collection's `queryVector` request and a local exhaustive cosine scan of the same eligible document vectors. Record the ordinary managed `queryText` results separately. The internal vector used by `queryText` is not exposed: equivalence to a materialized probe embedding must not be assumed solely from the model name.

There are 36 paired server queries (72 kNN calls), 507 eligible corpus documents and 36 probe documents. The three corpus scopes share a collection so owner/scope filtering is exercised. No full user chat or real credential enters an artifact. The diagnostic does not call OpenAI directly or any text-generation endpoint; LambdaDB managed embedding operations still incur service/inference usage.

Record full local rankings, server IDs/scores in returned order, query text, target source ranks and production `selectMemory()` selections. Required old facts have one matching source document each; recent and unknown facts have no indexed target and are excluded from old-fact recall denominators. Token counting uses the pinned host's GPT-4o tiktoken mapping plus six content-only message overhead tokens. Ordinary Recall@30 is accompanied by a boundary-tie-tolerant measure (cosine tolerance `1e-6`). Candidate count, uniqueness and scope are checked.

Read-after-write consistency is used for queries; committed mirror document visibility is reported separately and is not required for the product-path comparison. A small corpus may use an exact execution path or a consistent-read overlay. No public API identifies the internal search path. Consequently agreement cannot establish general ANN graph recall at scale. Disagreement localizes a server/vector/filter issue but does not by itself prove an ANN approximation defect.

## Run and evidence

```sh
SM_ARTIFACT_TAG=diagnosis-next node scripts/retrieval-diagnostic.mjs
```

Requires the existing ignored `.env.local` LambdaDB settings, the pinned host checkout with installed dependencies (`ST_SOURCE`, default `/tmp/sillymemory-st-source`), and its extension symlink. It starts an isolated host on port 18129 (`ST_RETRIEVAL_PORT` overrides it). Keys remain in memory; host logs are suppressed. Cleanup ownership-checks both collections and verifies disappearance. A failed cleanup leaves a `retrieval-diagnostic-<tag>-pending.json` record. Use a fresh tag to preserve previous evidence.

Raw results and exported synthetic vectors are stored separately under ignored `artifacts/`; the report hashes the vector artifact and evaluated source files. Preserve both for audit and offline reanalysis.

## Results

Completed on 2026-09-27, with **zero text-generation calls**. The successful v2 run completed 36 query variants / 72 kNN requests in about 53 seconds, exported and checked all 507 corpus and 36 probe vectors, and confirmed deletion of both owned collections. Unit tests: 28 passed, including exact cosine/filtering, tie handling, duplicate/foreign candidate rejection, and query construction controls.

| Query construction | Old facts in managed top 30 | Old facts selected within 800 tokens |
| --- | ---: | ---: |
| Current: chronological recent 3 | 0/6 | 0/6 |
| Reverse the same 3 messages | 3/6 | 3/6 |
| Latest user message only | 6/6 | 6/6 |
| Factual question only | 6/6 | 6/6 |

The six targets are the unique old-fact questions behind the twelve misses in the earlier two-repetition generation evaluation. The recent fact and two absent facts have no indexed target and are excluded from this table.

| Target | Current query: exhaustive rank | Latest-message query: exhaustive / managed rank |
| --- | ---: | ---: |
| Boat name | 207 | 1 / 1 |
| Medicine location | 228 | 1 / 1 |
| Mira's silver key | 108 | 1 / 1 |
| Yuna's silver key | 39 | 1 / 1 |
| Final evacuation site | 167 | 1 / 1 |
| Current password | 166 | 1 / 1 |

All 36 **identical numeric-vector** server queries returned exactly the exhaustive top-30 set: minimum and mean Recall@30 were 1.0. Candidate scores were descending, and no foreign scope or duplicate candidate appeared. Keeping documents, document embeddings, candidate limit, selector and token budget fixed while changing only query construction recovered all six targets. The misses can therefore be reproduced without approximate search error: with the current query, even exhaustive search ranks every target outside the requested 30 candidates. The budget cannot select documents it never receives. Maximum selected memory across all variants was 800 tokens.

The managed `queryText` candidates matched the materialized-probe exhaustive top-30 set in 35/36 cases. The remaining bare Yuna-key query matched 29/30; its boundary cosine difference was about 0.000113 and the target stayed rank 1. Managed scores also differed slightly from the numeric-vector scores. This is **not** measured ANN recall loss: the internally generated query vector is unavailable and may differ from the separately materialized document embedding. The numeric-vector comparison is the controlled identity test.

### Important execution boundary

The mirror collection's ordinary, non-consistent query returned a total of zero documents both before and after the successful run. All corpus documents and copied vectors were verified with `consistentRead: true`. Thus this run covers the real service's consistent-read path and pending-write visibility; it does **not** demonstrate committed ANN graph execution. A separate long-lived committed-index experiment would be needed to measure graph recall. The query-construction result still holds: exhaustive ranking already reproduces the observed old-fact misses, and the real managed path retrieves/selects all six with the latest-message query.

The first v1 attempt incorrectly made committed visibility a prerequisite and stopped after twelve bounded visibility checks, before any kNN comparison. Its vector export/copy checks passed and both collections were cleaned up. V2 separates this additional visibility observation from the production consistent-read comparison. Preserve the failed v1 report (`artifacts/retrieval-diagnostic-v1.json`, local-only) and v1 vectors (`artifacts/retrieval-vectors-v1.json`, local-only); they are not a successful search comparison. Fresh embedding generation produced small rank differences between exports (for example, boat rank 208 in v1 versus 207 in v2), so the reported table uses only the complete v2 evidence.

### Review and reproduce

- Successful raw report (`artifacts/retrieval-diagnostic-v2.json`, local-only): all query strings, complete exhaustive ranks, server candidate IDs/scores, target ranks and selected text.
- Actual exported vectors (`artifacts/retrieval-vectors-v2.json`, local-only): synthetic corpus/probe text and vector components, bound to the raw report by SHA-256.
- Verified summary (`artifacts/retrieval-summary-v2.json`, local-only): independently recomputed rankings, target detection, selection and token counts.
- [Live runner](../scripts/retrieval-diagnostic.mjs), [analysis functions](../scripts/retrieval-analysis.mjs), [offline verifier](../scripts/retrieval-summary.mjs), and [tests](../tests/retrieval-analysis.test.js).

Rebuild the summary without network calls from the exact source hashes recorded in that historical report (the verifier intentionally rejects a changed runtime):

```sh
node scripts/retrieval-summary.mjs artifacts/retrieval-diagnostic-v2.json artifacts/retrieval-summary-v2.json
```

At the time of this diagnostic, the product runtime remained on the original query policy. This diagnostic establishes a query-construction failure on the frozen fixture; it does not establish improved generated-answer quality. The follow-up policy prioritizes the latest user question while testing contextual references, continuation, regenerate/swipe, unknown facts and held-out conversations. Simply discarding all earlier context can harm questions such as “Where was that?” and requires separate evaluation.
