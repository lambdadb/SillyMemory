# Memory cost accounting

The [current LongMemEval-S evaluation](longmemeval-public-evaluation.md) records
96.0% (480/500), its Jev protocol, measured answer usage and memory-operation
counts. The [public profile](../benchmark/longmemeval/README.md) is the source of
settings for a new run. Historical 95% trials used different source partitions,
rerank depths and judges; their modeled totals are not current-profile costs.

Answer generation, memory construction/maintenance, retrieval, storage and
evaluation judging are separate costs. Embedding token estimates and document
payloads do not establish billable reranker tokens or physical storage size.
Judge cost is evaluation overhead. Price estimates are not provider invoices;
cache categories, runtime duration, read consistency and retention must be explicit.
No one-month storage assumption should be silently applied to a short benchmark.

## Native Vector Storage: construction and query embeddings

The original archive retains **112,613 successful logical embedding receipts**
covering all **500 completed vector stages**. They are split between `calls`
(61,916 receipts, 275 stages) and `calls-empty-input` (50,697 receipts, 225 stages).
The latter directory is preserved history, not an instruction to count failed
empty-input requests. The two sets cover distinct completed stages. Each receipt's
identity, request-body SHA-256 binding, successful status, 1,536 dimensions and
usage were checked; usage also matches an entry in its worker's provider log.
Request ordinals are contiguous within every stage. Exactly one final single-input
request per stage contains that question and identifies its query embedding.

The actual model is `text-embedding-3-small`, through the native vLLM-compatible
route to the runner's OpenAI bridge. At the current
[OpenAI Standard rate](https://developers.openai.com/api/docs/models/text-embedding-3-small)
of **$0.02/M input tokens**, retained usage gives:

| Phase, 500 questions | Successful logical calls | Embedding input tokens | Estimated USD |
| --- | ---: | ---: | ---: |
| Construction | 112,113 | 51,927,905 | $1.0385581 |
| Query embeddings | 500 | 176,560 | $0.0035312 |
| **Combined memory inference** | **112,613** | **52,104,465** | **$1.0420893** |

Adding unrounded answer generation **$14.1193255** gives **$15.1614148**, or **$15.16**.
These are provider-reported token counts priced today, not a tokenization proxy or
invoice reconciliation. One retained successful receipt per logical identity is
counted; extra recovery/rebuild work and unknown failed-request usage are excluded.
Repeated provider-log entries are not added again. The 901,641 embedding inputs
are separate from final-answer input and include 500 query inputs.

The [pinned native backend](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/vectors.js#L289)
uses a local Vectra index for storage and similarity search, so this configuration
has no separate managed vector-database read/storage charge or Jev charge.
Local CPU, disk, hosting and retention still consume resources and remain outside
the service-cost totals for every arm. The 400-character source chunks and
recent-two-message queries differ from the SillyMemory direct path; the same
embedding model does not imply identical usage.

The same frozen 50 IDs account for **5,214,430 embedding tokens**, or **$0.1042886**;
adding their answer usage yields **$1.4871812**, rounded to **$1.49**. No new
inference, database or host run was required for this audit.

## Current LambdaDB accounting

The current report records 51,721,513 independently tokenized construction tokens,
19,505 question-embedding tokens, 483,385 indexed documents and 17,962 database
operations. At the recorded managed Small rate of $0.021/M, construction and
question embedding proxies are $1.086152 and $0.000410. These exclude database,
native reranking and storage charges. Operation counts include readback audits
and cleanup; they are not a production-only search count or a billing export.

A full modeled total must separately disclose write minima, read minima and
consistency, native reranking token/serialization assumptions, physical-size
sensitivity and measured retention time. Managed inference rates already include
the provider component; do not add a direct provider rate again. See
[LambdaDB metering](https://docs.lambdadb.ai/guides/costs/understanding-costs).


## Historical evidence

[Original cost reconstruction, rate sources and sensitivity calculations](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/memory-cost-comparison.md) remain available at the recorded revision. They describe their original settings, not the current product or benchmark profile. See [evidence recovery](evidence-retention.md) for retained source and raw-run availability.
