# Upsert batch size

Synchronization uploads missing or changed chunks in upsert requests of up to
200 documents (`src/memory.js`). Delete and fetch requests keep their 100-ID
batches. The size was raised from 50 on 2026-11-06 after the measurement below.

## Decision

A request costs about 0.45 s regardless of size plus about 5.5 ms per document,
so 50-document batches spend most of each request on fixed overhead. From 200
documents the throughput is close to its ceiling, each request still finishes in
little more than a second against the 15-second client timeout, and an embedding
failure or lost response affects at most 200 documents. Larger batches gain
little and widen the retry scope. Ordinary chatting is unaffected: it uploads
only the displaced message pair, which is one request either way. The change
roughly halves the first indexing of a long existing chat.

## Measurement

Live LambdaDB project, production schema (OpenAI `text-embedding-3-small`
managed embedding on `text`), synthetic English chunks of about 760 characters
with the production document fields, sequential requests from Node through the
vendored SDK with a 60-second timeout so real durations were recorded. Two runs:
400 documents per size in ascending order 50, 100, 200, 400; then 800 documents
per size in descending order 800, 400, 200, 100, 50 with 50 repeated. The
temporary collection was deleted and its disappearance confirmed after each run.

| Batch | Mean request time | Documents per second | Request body |
| --- | --- | --- | --- |
| 50 | 0.53–0.70 s | 71–94 | 57 KB |
| 100 | 0.66–0.76 s | 132–151 | 114 KB |
| 200 | 1.16–1.32 s | 151–173 | 229 KB |
| 400 | 2.22–2.25 s | 178–180 | 457 KB |
| 800 | 4.70 s | 170 | 914 KB |

No request returned HTTP 429 or 413 and no embedding failure occurred. The
request body limit is about 5.75 MiB, so even 800 documents use under a fifth of
it; time, not size, bounds the batch.

Limitations: one project and region, one time of day, synthetic English text,
no plan-quota or congestion data, no measurement of indexing visibility after
acceptance.

## Reproduction and evidence

```sh
SM_ENV_FILE=/absolute/path/to/.env.local SM_ARTIFACT_TAG=upsert-batch \
npm run benchmark:upsert-batch -- 50,100,200,400 400
```

The script creates one temporary owned collection, uploads synthetic chunks,
deletes the collection and writes `artifacts/<tag>/upsert-batch-benchmark.json`.
It sends only synthetic text and prints no credentials. Running it is a paid
live operation.

Raw results of the two decision runs are local ignored artifacts, not in Git:

| File | SHA-256 |
| --- | --- |
| `artifacts/upsert-batch-2026-11-06/run1-ascending-400.json` | `5f16c26702e2b9f83fed4e85094a1084997bc94f9e15028b85b6a2613f75cd11` |
| `artifacts/upsert-batch-2026-11-06/run2-descending-800.json` | `618d0d91f1955968082030e5ff7f2b695d6fc2b6f3b63535575e6758c5d97ce6` |
