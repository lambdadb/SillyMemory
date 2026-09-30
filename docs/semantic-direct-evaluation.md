# Temporary direct-embedding semantic experiment

This is a separate `semantic-direct-v1` experiment, not managed-path recovery or
release acceptance. The final product remains LambdaDB managed embeddings with
no separate embedding-provider setup for users. No product runtime, LambdaDB
server, plugin, credential storage, or settings UI changes are made.

Preserve the [managed cohort](semantic-long-evaluation.md)'s 16 cases, 60-message
sources, 64 off/on answers, generation settings, prompt budgets, recent window,
selector and generation retry/spacing policy. Freeze a new plan and artifact tag.
Keep all historical failures. Keys come from the existing ignored environment
file; the embedding key remains in the Node test process.

The Playwright harness transforms only owned LambdaDB requests to the configured
project. It changes the collection's embedding field to an unmanaged 1,536-dimension
cosine vector, embeds the exact text array of each actual upsert batch, and adds
vectors to those same documents. IDs, order, owner/scope/revision and all other
fields stay identical. There is no splitting, coalescing, precomputation or cache:
a 50-document batch is one embedding call; remainder and incremental batches
retain their observed sizes. A queryText becomes one direct embedding and a
queryVector with the original filter, k, size, consistency and reference.

Direct requests explicitly set `text-embedding-3-small`, `dimensions: 1536` and
`encoding_format: float`, consistent with the inspected LambdaDB client and the
[official OpenAI embedding guide](https://developers.openai.com/api/docs/guides/embeddings).
Array positions are matched using response indices; malformed or missing vectors
stop the operation. At most 400 embedding calls are allowed. No new embedding
retry or concurrency policy is added. Existing runtime scheduling and gate polls
remain; an adapter failure is terminal for that operation and the cohort stops
on missing synchronized/retrieved evidence. No successful answer is retried.

The browser's original 15-second deadline still covers embedding plus database
transport. An additional adapter deadline and request-cancellation signal prevent
late forwarding after an embedding failure. All LambdaDB operations still pass
through the real SillyTavern built-in proxy. Record embedding time, database leg
(from forwarding through response completion), total browser request time,
provider status, input/body hashes and token usage, never vectors or secrets.
The local direct credential/account/network differs from the managed server and
is not a controlled reproduction of its provider connection or retry behavior.

Run after the normal local checks:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
  node scripts/semantic-direct.mjs artifacts/semantic-direct-plan-next.json
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/path/to/existing/.env.local \
SM_NATURAL_PLAN=artifacts/semantic-direct-plan-next.json \
SM_ARTIFACT_TAG=direct-next \
  node scripts/generation-smoke.mjs --semantic --retry-transient --direct-embeddings
node scripts/semantic-results.mjs \
  artifacts/generation-semantic-direct-next.json artifacts/semantic-direct-review-next
```

The gate UI retains its product wording, including "managed", but intercepted
gate operations in this mode use direct embeddings. Reports and summaries must
label this explicitly. The standard source-to-prompt checks, secret audit, owned
collection cleanup and separate unfilled human review packet still apply. A full
direct run cannot replace final managed-path revalidation before public promotion.
