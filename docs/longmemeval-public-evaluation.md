# LongMemEval public-profile evaluation

The October 22, 2026 evaluation reruns the public LongMemEval-S profile and grades
historical alternative answers with the same **Jev 1.13.0 Noul, Yes probability
>=0.50** protocol. The purpose is to compare answer quality and resource use for
the documented configurations, without treating SillyMemory's development history
as competing alternatives.

**The fresh run scored 480/500 (96.0%) after one transport-error recovery.**
All 500 histories were newly ingested, read back, retrieved and packed; all 500
answers and Jev judgments passed the public offline verifier. Final-answer input
averaged **4,886.1 tokens**, versus **105,183.1** for the saved full-history
reference: **95.35% less input** across these runs. Estimated generation cost for
the 500 successful answers is **$6.366401**, excluding memory work and judging.

The full-history reference scored 476/500 (95.2%) under the same Jev rules.
SillyMemory alone passed 13 questions and full history alone passed nine. The
four-answer aggregate difference does not establish general superiority or
held-out gains. The supported finding is high measured answer quality with much
smaller final-answer inputs under these disclosed configurations.

## Completed alternative regrading

Only the four alternatives without Jev results received new judge calls. Their
1,550 saved answers were checked against the original receipts and graded once;
no answer was regenerated and no database call was made. Existing GPT-4o labels
remain in the [historical host report](product-comparison.md). The existing
[400-character summary Jev result](segment-summary-evaluation.md) is reused
unchanged. The 400-word summary experiment is excluded from this comparison.

The same pinned task-specific rules and references used by the public benchmark
apply to every newly graded answer. The rules SHA-256 is
`0e2c981b54ecea007bc538982671b474b77cf857065327bb7f2f332a00e81e42`.
New judge usage was 736,867 input tokens across 1,550 successful calls, with a
list-rate estimate of **$0.030948**. This is evaluation overhead, not answer
serving cost. Raw probabilities and request/response receipts are retained.

### Full 500-question comparison

| Configuration | Jev correct / 500 | Accuracy | Mean answer input tokens | Estimated answer generation USD |
| --- | ---: | ---: | ---: | ---: |
| Plain 32K | 163 | 32.6% | 28,056.4 | 30.4061 |
| Native Vector Storage, 32K | 173 | 34.6% | 28,057.2 | 14.1193 |
| Full-history 128K | 476 | 95.2% | 105,183.1 | 131.8259 |
| **SillyMemory, fresh public profile** | **480** | **96.0%** | **4,886.1** | **6.3664** |

The full-history reference contains the complete source transcript in all 500
requests. Its Jev result is 476/500, replacing the historical GPT-4o 465/500 only
for this new comparison; the original label set is preserved. A claim that
SillyMemory beats full history must not use the old 93.0% result alongside the
new Jev score.

### Common 50-question comparison

The summary experiments share the same frozen stratified 50-question subset.
The other alternatives are filtered to these exact IDs; their full-500 scores
must not be substituted into this table.

| Configuration | Jev correct / 50 | Accuracy | Median answer input tokens | Estimated answer generation USD |
| --- | ---: | ---: | ---: | ---: |
| Plain 32K | 16 | 32% | 28,022 | 2.8643 |
| Native Vector Storage, 32K | 16 | 32% | 28,014 | 1.3829 |
| Native Summarize, 32K | 17 | 34% | 28,102 | 3.5463 |
| 400-character segment summaries | 34 | 68% | 1,574 | 0.2103 |
| Full-history 128K | 48 | 96% | 105,466.5 | 13.1910 |
| **SillyMemory, fresh public profile** | **45** | **90%** | **4,891** | **0.6355** |

On these 50 questions, SillyMemory scored below full history (45 versus 48),
while passing 12 cases the 400-character arm missed and missing one it passed.
The 96.0% full-cohort result must not replace the 90% subset result.

The 400-character arm includes two operational failures as incorrect, with 48
generated answers. Its token median and answer cost cover those 48 answers.
It additionally incurred **$15.771821** in historical summary construction and
**$0.314470** in selection at the recorded rates. Construction is the accumulated
work for replaying the source histories, not a charge on every future answer.
Native Summarize also performs historical maintenance work, excluded from the
answer-generation column; see its original report for retained usage.

The [retained cost audit](memory-cost-comparison.md#native-vector-storage-construction-and-query-embeddings)
prices the same native alternatives' memory work separately:

| Memory work | Measured cohort | Input tokens | Estimated USD |
| --- | ---: | ---: | ---: |
| Native Vector construction and query embeddings | 500 | 52,104,465 | 1.0420893 |
| Native Vector construction and query embeddings, common subset | 50 | 5,214,430 | 0.1042886 |
| Native Summarize maintenance | 50 | 61,059,396 | 158.4743122 |
| 400-character summary construction | 50 | 6,031,118 | 15.771821 |
| 400-character summary selection | 50 | 114,502 | 0.314470 |

Summary estimates also include generated output. These historical charges are
not incurred again by judge-only regrading. Unknown failed-attempt usage and host
infrastructure are excluded. No 50-to-500 projection is used here.

## Configuration and comparison boundaries

The [public LongMemEval profile](../benchmark/longmemeval/README.md) fixes the
dataset revision, source hashes, prompts and evaluator. It uses managed
`text-embedding-3-small`, 800-character chunks, the role-labelled current question,
Bayesian hybrid retrieval with k200, `jev-1.13.0` reranking over **text only**,
200 candidates and 50 returned chunks. Rank-ordered admission and chronological
presentation enforce a 4,096-token memory allocation. Recent pair-aligned dialogue
stays outside the index. The generator is `gpt-6.1-sol`, low reasoning, with a
4,096-token completion limit.

Each fresh question gets an isolated collection, source upload/readback,
retrieval and memory assembly, followed by deletion and an absence check.
Generation and judging use those newly retrieved prompts. The public runner
reuses product modules directly; this run does not exercise the SillyTavern UI.
Its text-only reranking profile differs from the current product's role/date/text
reranking fields.

This replays 500 separately indexed histories, not 500 consecutive turns in one
persisted chat. Database operation counts include source-readback audits and
cleanup. The ingestion-to-packing duration must not be presented as ordinary
per-turn response latency; model timings stop at response headers and do not
measure a rendered SillyTavern reply.

The saved alternatives used the pinned SillyTavern host and native prompt builder,
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
commercial service. Its original protocol and operational failures remain linked
above.

This is a cross-run comparison on consumed English development data. A common
judge removes the evaluator mismatch; it does not make the historical host and
fresh standalone generation paths identical, establish unseen-test performance,
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
reranking, storage, host operation and judging. The fresh LambdaDB responses do
not expose complete billable embedding/reranking usage, so a complete service
bill cannot be inferred from database operation counts. Available measurements
and missing costs must remain explicit; see the
[LambdaDB rate definitions](https://docs.lambdadb.ai/guides/costs/understanding-costs).

Independent `tiktoken` 1.0.22 / `cl100k_base` accounting of the frozen source text
gives 51,721,513 construction tokens for 483,385 indexed documents and 19,505
question-embedding tokens for the full cohort. At the managed Small embedding
rate of $0.021/M, these imply **$1.086152** for construction and **$0.000410** for
question embeddings. The common 50-question subset is 5,175,400 construction and
1,914 query tokens, or **$0.108723** combined. These are tokenization estimates,
not provider-reported usage; they do not fill in the missing reranking, database
or storage bill and must not be labelled a complete memory-service cost.

## Execution, recovery and verification

- Fresh retrieval: 500 questions, 483,385 indexed documents and 17,962 database
  operations. All 500 owned collections were deleted and independently confirmed
  absent by the recorded HTTP 404 checks.
- Successful answer usage: 2,443,045 input and 31,351 output tokens, including
  7,488 cached-input and 2,362,057 cache-write tokens. Median input was 4,805.5.
- New-run judging: 500 calls and 239,354 input tokens, estimated **$0.010053**,
  separate from the alternatives' $0.030948 regrading overhead.
- One OpenAI HTTP 500 interrupted generation at question `gpt4_a2d1d1f6` after
  468 completed answers and judgments. Its raw error and pending intent were
  preserved. An explicitly authorized, identical-request retry succeeded; all
  other completed answers were reused. The original source/configuration and
  eight-hour score deadline remained unchanged. Total generation attempts were
  **501**, comprising 500 successful responses and one error. No quality-driven
  regeneration was performed.
- Quality above is after that recovery. Counting the transport failure as
  incorrect gives **479/500 (95.8%)** on first attempts; 499/500 questions produced
  an answer on their first attempt. The error returned no token usage, so its
  tokens and possible billing are unknown and excluded from generation estimates.
- The unmodified public `verify` command passed. A separate audit parsed raw
  responses, checked exact cohort/attempt sets and reproduced the scores, subset,
  usage and generation estimate with decimal arithmetic. Original and successful
  retry request hashes match; the retained failure files match their checksums.

Repository checks on the final documentation/data change passed: `npm test`
(415 tests), `python3.14 -m unittest discover -s tests -p 'test_*.py'` (32 tests),
`npm run check`, `npm run check:release`, `npm run check:sdk`, development/benchmark
JavaScript syntax checks and `git diff --cached --check`. No product or runner
source changed. No new SillyTavern host/browser acceptance test was run.

Server-reported median query time was 1,252.5 ms, including a 1,049 ms median
reranking component. Median successful-generation response-header time was
2,617.4 ms. These differently bounded, unpaired medians must not be added together
or compared with historical browser send-to-reply latency as a speedup claim.

## Reproduction

Use the unchanged [benchmark commands](../benchmark/longmemeval/README.md#run)
with a separate output directory and an existing credentials file. `prepare`
freezes inputs before paid calls; `verify` checks source reconstruction, delivered
prompts, raw query receipts, owned cleanup, judge probabilities and aggregates
without provider requests. A new run can differ because retrieval and model
outputs are not deterministic.

The producing checkout is
[`cae42d58d955a1688ced3075ad05227923f36772`](https://github.com/lambdadb/SillyMemory/tree/cae42d58d955a1688ced3075ad05227923f36772).
The original 475/500 saved-retrieval result remains available at that revision's
[recorded aggregate](https://github.com/lambdadb/SillyMemory/blob/cae42d58d955a1688ced3075ad05227923f36772/benchmark/longmemeval/results.json).
It is separate evidence from this fresh ingestion-to-judge run.

## Retained evidence

The [machine-readable aggregate](benchmarks/longmemeval-public-evaluation-v1.json)
contains full/subset results, paired outcomes, usage, rates and failure accounting.
The [public benchmark aggregate](../benchmark/longmemeval/results.json) records
the fresh profile result. Raw prompts, responses, judge probabilities, original
HTTP 500, recovery authorization, frozen locks, producing source and offline
analysis scripts are in a verified local archive:

- `artifacts/archive/longmemeval-public-evaluation-v1/evidence.tar.gz`
- 255,548,796 bytes; SHA-256
  `2e1a5c0b6dd4bbd63bb2f850f78da032b32ec53950ca252c51a260f6f096cb21`
- All 24,042 file members were read back and matched their manifest hashes.
  Credential-content scanning found no matches.
- Identical archive and manifest copies are retained in the primary `sillymemory`
  and `sillymemory-longmemeval-blog-rerun` worktrees on the same machine. They are
  local-only, not remote backups or downloads available in a fresh clone.
- `RESTORE.md` explains restoring the pinned public dataset/dependencies and
  running offline verification. The historical native-answer source archive
  retains its separate documented location and is not duplicated here.

The fresh benchmark needs no SillyTavern installation. To try the product in
SillyTavern, follow the [extension installation instructions](../README.md#install);
the standalone benchmark and host experience remain distinct validation paths.
