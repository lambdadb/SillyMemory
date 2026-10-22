# LongMemEval-S benchmark results

**SillyMemory scored 480/500 (96.0%) on LongMemEval-S**, evaluated on October 22,
2026 with **Jev 1.13.0 Noul, Yes probability >=0.50**. The benchmark measures
answer quality and resource use from ingestion through retrieval, memory assembly,
answer generation and judging.

All 500 histories were ingested, read back, retrieved and packed; all 500
answers and Jev judgments passed the public offline verifier. Final-answer input
averaged **4,886.1 tokens**, versus **105,183.1** for the full-history
reference: **95.35% less input** across these runs. Estimated generation cost for
the 500 successful answers is **$6.366401**, excluding memory work and judging.

The full-history reference scored 476/500 (95.2%) under the same Jev rules.
SillyMemory alone passed 13 questions and full history alone passed nine. The
four-answer aggregate difference does not establish general superiority or
held-out gains. The supported finding is high measured answer quality with much
smaller final-answer inputs under these disclosed configurations.

Source-span annotation coverage and necessary-fact recall were not measured at
retrieval or final-prompt delivery. The verifier checks source and request
integrity, not evidence sufficiency. The 20 Jev-incorrect answers therefore have
no measured attribution to retrieval, memory assembly, generation or judging.

## Comparison protocol

All alternatives use the same Jev protocol and pinned task-specific rules.
The Plain, Vector Storage, Full-history and native Summarize answers come from
[actual-host runs](product-comparison.md); 1,550 retained answers were verified
against their generation receipts and evaluated with Jev. The
[400-character summary results](segment-summary-evaluation.md) use the same
protocol. All scores evaluate the recorded answers without regenerating them.

The rules SHA-256 is
`0e2c981b54ecea007bc538982671b474b77cf857065327bb7f2f332a00e81e42`.
The 1,550 comparison judgments used 736,867 input tokens, with a list-rate estimate
of **$0.030948**. Judging is evaluation overhead, separate from answer serving cost.
Raw probabilities and request/response receipts are retained.

### Full 500-question comparison

| Configuration | Jev correct / 500 | Accuracy | Mean answer input tokens | Estimated answer generation USD |
| --- | ---: | ---: | ---: | ---: |
| Plain 32K | 163 | 32.6% | 28,056.4 | 30.4061 |
| Native Vector Storage, 32K | 173 | 34.6% | 28,057.2 | 14.1193 |
| Full-history 128K | 476 | 95.2% | 105,183.1 | 131.8259 |
| **SillyMemory** | **480** | **96.0%** | **4,886.1** | **6.3664** |

The full-history reference contains the complete source transcript in all 500
requests. Every accuracy in this table uses the same Jev rules and threshold.

### Common 50-question comparison

The summary experiments share the same frozen stratified 50-question subset.
All rows below use those same 50 question IDs.

| Configuration | Jev correct / 50 | Accuracy | Median answer input tokens | Estimated answer generation USD |
| --- | ---: | ---: | ---: | ---: |
| Plain 32K | 16 | 32% | 28,022 | 2.8643 |
| Native Vector Storage, 32K | 16 | 32% | 28,014 | 1.3829 |
| Native Summarize, 32K | 17 | 34% | 28,102 | 3.5463 |
| 400-character segment summaries | 34 | 68% | 1,574 | 0.2103 |
| Full-history 128K | 48 | 96% | 105,466.5 | 13.1910 |
| **SillyMemory** | **45** | **90%** | **4,891** | **0.6355** |

On these 50 questions, SillyMemory scored below full history (45 versus 48),
while passing 12 cases the 400-character arm missed and missing one it passed.

The 400-character arm includes two operational failures as incorrect, with 48
generated answers. Its token median and answer cost cover those 48 answers.
It additionally incurred **$15.771821** in summary construction and
**$0.314470** in selection at the recorded rates. Construction is the accumulated
work for replaying the source histories, not a charge on every future answer.
Native Summarize also performs summary maintenance, excluded from the
answer-generation column; see its source report for usage.

The [memory cost audit](memory-cost-comparison.md#native-vector-storage-construction-and-query-embeddings)
prices the same native alternatives' memory work separately:

| Memory work | Measured cohort | Input tokens | Estimated USD |
| --- | ---: | ---: | ---: |
| Native Vector construction and query embeddings | 500 | 52,104,465 | 1.0420893 |
| Native Vector construction and query embeddings, common subset | 50 | 5,214,430 | 0.1042886 |
| Native Summarize maintenance | 50 | 61,059,396 | 158.4743122 |
| 400-character summary construction | 50 | 6,031,118 | 15.771821 |
| 400-character summary selection | 50 | 114,502 | 0.314470 |

Summary estimates also include generated output. These costs cover processing
the source histories; judging the recorded answers does not repeat that work.
Unknown failed-attempt usage and host infrastructure are excluded. No 50-to-500
projection is used here.

## Configuration and comparison boundaries

The [public LongMemEval profile](../benchmark/longmemeval/README.md) fixes the
dataset revision, source hashes, prompts and evaluator. It uses managed
`text-embedding-3-small`, 800-character chunks, the role-labelled current question,
Bayesian hybrid retrieval with k200, `jev-1.13.0` reranking over **text only**,
200 candidates and 50 returned chunks. Rank-ordered admission and chronological
presentation enforce a 4,096-token memory allocation. Recent pair-aligned dialogue
stays outside the index. The generator is `gpt-6.1-sol`, low reasoning, with a
4,096-token completion limit.

Each question gets an isolated collection, source upload/readback,
retrieval and memory assembly, followed by deletion and an absence check.
Generation and judging use the retrieved prompts. The public runner
reuses product modules directly; this run does not exercise the SillyTavern UI.
Its text-only reranking profile differs from the current product's role/date/text
reranking fields.

This replays 500 separately indexed histories, not 500 consecutive turns in one
persisted chat. Database operation counts include source-readback audits and
cleanup. The ingestion-to-packing duration includes that setup and audit work.
Model timings stop at response headers and do not measure a rendered SillyTavern
reply.

The alternatives used the pinned SillyTavern host and native prompt builder,
with the same generator model, low reasoning and completion limit. Plain and
Vector Storage use a 32,768-token context ceiling; full history uses 131,072.
Native Vector Storage uses remote OpenAI Small embeddings, protect 5, query 2,
insert 3, 400-character chunks and threshold 0.25. Native Summarize uses the main
API, native placement, a 200-word target and interval 10. These are measured
configurations, not claims about all tuned native memory options.

The 400-character alternative summarizes source segments of at most 40 messages,
preserves adjacent user/assistant pairs, and combines the newest three summaries
with two older summaries selected by an LLM. It is a documented approximation of
a segment-summary method, not a reproduction or benchmark score of a named
commercial service. Its protocol and operational failures are documented in the
linked report.

This compares separate runs on English data used during development. A common
judge removes the evaluator mismatch; it does not make the host and
standalone generation paths identical, establish unseen-test performance,
or certify human answer correctness.

## Token and cost interpretation

Answer input tokens are provider-reported final-prompt usage, including recent
dialogue and instructions. They are distinct from the 4,096-token memory limit.
Answer costs use reported ordinary input, cache reads, cache writes and output
at October 22 Standard list rates. Cache conditions differ across runs; this is
not a controlled-cache experiment or a provider invoice.

At the recorded [generator rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
one million ordinary input / cached input / cache-write / output tokens costs
$2 / $0.10 / $2.50 / $10. Cached and cache-write tokens are subtracted from total
input before charging ordinary input. [Jev judging](https://docs.typesafe.ai/models)
uses $0.042 per million input tokens with free output.

The answer-generation columns exclude memory construction, maintenance, retrieval,
reranking, storage, host operation and judging. The LambdaDB responses do
not expose complete billable embedding/reranking usage, so a complete service
bill cannot be inferred from database operation counts. See the
[LambdaDB rate definitions](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Independent `tiktoken` 1.0.22 / `cl100k_base` accounting of the frozen source text
gives 51,721,513 construction tokens for 483,385 indexed documents and 19,505
question-embedding tokens for the full cohort. At the managed Small embedding
rate of $0.021/M, these imply **$1.086152** for construction and **$0.000410** for
question embeddings. The common 50-question subset is 5,175,400 construction and
1,914 query tokens, or **$0.108724** combined. These are tokenization estimates,
not provider-reported usage, and exclude reranking, database and storage costs.

## Resource measurements and verification

- Retrieval: 500 questions, 483,385 indexed documents and 17,962 database
  operations. All 500 owned collections were deleted and independently confirmed
  absent by the recorded HTTP 404 checks.
- Successful answer usage: 2,443,045 input and 31,351 output tokens, including
  7,488 cached-input and 2,362,057 cache-write tokens. Median input was 4,805.5.
- SillyMemory judging: 500 calls and 239,354 input tokens, estimated **$0.010053**,
  separate from the alternatives' $0.030948 judging overhead.
- The public offline verifier passed for all 500 questions. An independent audit
  of raw responses reproduced full-cohort and subset scores, token usage and
  generation costs.

Server-reported median query time was 1,252.5 ms, including a 1,049 ms median
reranking component. Median successful-generation response-header time was
2,617.4 ms. These measurements cover different operations; their sum does not
represent browser send-to-reply latency.

## Reproduction

Use the [benchmark commands](../benchmark/longmemeval/README.md#run)
with a separate output directory and an existing credentials file. `prepare`
freezes inputs before paid calls; `verify` checks source reconstruction, delivered
prompts, raw query receipts, owned cleanup, judge probabilities and aggregates
without provider requests. A new run can differ because retrieval and model
outputs are not deterministic.

The producing checkout is
[`cae42d58d955a1688ced3075ad05227923f36772`](https://github.com/lambdadb/SillyMemory/tree/cae42d58d955a1688ced3075ad05227923f36772).

## Result data

The [comparison data](benchmarks/longmemeval-public-evaluation-v1.json) contains
full-cohort and subset scores, paired outcomes, usage, rates and failure accounting.
The [benchmark data](../benchmark/longmemeval/results.json) records the score and
resource measurements. Source provenance and evidence availability are listed in
the [evidence index](evidence-retention.md#october-22-public-longmemeval-evaluation).

The benchmark needs no SillyTavern installation. To try the product in
SillyTavern, follow the [extension installation instructions](../README.md#install);
the standalone benchmark and host experience remain distinct validation paths.
