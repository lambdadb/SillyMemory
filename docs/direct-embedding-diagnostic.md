# Direct OpenAI embedding diagnostic

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

This diagnostic bypasses LambdaDB and SillyTavern to test the local machine's
OpenAI embedding path. It does not replace managed embeddings in the product.
The fixed model and single synthetic sentence match the earlier managed probe:
`text-embedding-3-small` and
`Synthetic diagnostic: the blue compass is under the cedar tree.`

Run ten sequential requests, at least 15 seconds between starts, with no automatic
retry and a 45-second diagnostic deadline. Use `encoding_format: float`, omit
`dimensions` to select the model's default, and verify a finite 1,536-element
vector for every input. The LambdaDB source resolves the same default dimension
and sends it explicitly; this experiment matches the model/input/output dimension,
not byte-identical HTTP bodies. No generated answers or database writes are made.

```sh
SM_ENV_FILE=/path/to/existing/.env.local \
  node scripts/direct-embedding-probe.mjs artifacts/direct-embedding-next.json
```

The existing `LLM_API_KEY` is read into process memory. Neither keys, account IDs,
raw response/error bodies nor embedding vectors are written to the report. The
report retains source/request hashes, UTC times, HTTP status, total/header latency,
vector validation, token usage and safe provider request IDs/processing times
when supplied. Those IDs can support provider-side investigation. Rejected input,
authentication, endpoint or rate-limit responses stop the diagnostic rather than
repeatedly sending requests. Timeout/network/5xx failures remain separate samples.
Output names must be new; checkpoints preserve partial runs.

This is not a controlled comparison of identical credentials, network location,
HTTP client or deployment. LambdaDB uses its own server-side secret and network;
credential/organization/project equality is unverified. Local Node fetch uses its
own connection pool and the first request may have connection setup overhead.
A successful local run does not rule out an earlier incident or a server-specific
problem. A local failure alone does not prove that LambdaDB saw the same cause.
Do not present ten samples as an availability guarantee or treat the direct path
as completion of the 64-answer managed-memory experiment.

The [official embedding guide](https://developers.openai.com/api/docs/guides/embeddings)
describes array input, per-input vectors and the default dimensions. The product
runtime remains unchanged; this diagnostic uses an explicitly authorized direct
API call from Node, not browser CORS or persistent key storage.

## Product requirement and temporary experiment boundary

Confirmed on 2026-09-30: the final product must use LambdaDB managed embeddings
with ordinary upserts and `knn.queryText`. Users must not need a separate embedding
provider account, API key, or model configuration. This requirement concerns
memory embeddings; the existing conversation-generation provider is separate.

Direct embeddings are a temporary diagnostic and evaluation path only. They must
not become the product default, an automatic runtime fallback, or an additional
settings requirement. Preserve the UI extension, built-in proxy, and session-only
LambdaDB key design.

The separate [full-cohort direct experiment](semantic-direct-evaluation.md)
preserves the runtime's actual upsert batch contents, order and sizes (including partial and
incremental batches), retrieval filters, prompt budgets and generation schedule.
Only the embedding execution and corresponding vector write/query representation
change. Record embedding, database and total latency separately without
silently expanding the end-to-end deadline. The single-input diagnostic above
does not validate that adapter; its implementation and full-cohort results are
recorded [separately](semantic-direct-results.md).

Keep any direct-path cohort and its protocol separate from managed-path results.
Even a complete direct-path run would not establish managed-path recovery or
release readiness. The final managed-embedding path must be revalidated before
public promotion; retain the earlier incomplete attempts as evidence.

## Observed result — 2026-09-30

The [complete direct-call report](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/direct-embedding-v1.json) records all ten
requests. Every request returned HTTP 200 and one valid 1,536-dimensional vector.
No retries, database writes or generation requests were made.

| Measurement | Result |
| --- | ---: |
| Completed and valid requests | 10/10 |
| Total latency: minimum / median / maximum | 179 / 225 / 2,808 ms |
| `openai-processing-ms` response header: minimum / maximum | 45 / 64 ms |
| Recorded input/total tokens | 130 / 130 |
| Observed HTTP errors or timeouts | 0 |

The first request was the slowest. Connection setup or network effects may
contribute to the difference between total latency and the provider-reported
header; this report does not isolate that difference. All sample starts obeyed
the 15-second spacing, and the script hash was unchanged after execution.

The earlier managed probes failed at approximately 29,041 ms, but these were
separate runs, credentials were not proven equal, and traffic originated from
different machines. The direct result establishes only that this local path and
key successfully embedded the same sentence/model during this short window. It
does not prove global OpenAI availability, rule out an earlier transient delay,
or identify LambdaDB as the root cause. The next discriminating evidence is the
managed server's provider status, request ID, elapsed time and credential/account
context for a failed request. The 64-answer memory cohort remains incomplete.

The diagnostic script and vector-shape regression are included in PR #26. Local
unit tests total 171 passing, separate from these ten live provider requests.
