# LongMemEval-S: the 95% experiment, comparison arms and cost estimates

Analysis date: **2026-10-19**. This extends the
[benchmark reference](memory-benchmark-reference.md) using retained receipts and
offline reconstruction. No new model or database calls were made. All USD figures
are current Standard/list-rate estimates, not invoices or controlled cost trials.

## Which 95% result is being compared?

The [source-assembly regression](jev-depth-100.md#completed-fresh-source-assembly-answer-regression)
scored **475/500 (95.0%)** with `gpt-6.1-sol`, low reasoning, and the frozen upstream
judge prompt using `gpt-4o-2024-08-06`. It generated new answers from previously
captured depth100/final50 retrievals under a 4,096-token memory budget. Its fresh
control scored 469/500 (93.8%); 11 questions improved and five worsened.

This is consumed-cohort regression, not held-out confirmation. It is a direct
provider experiment with complete-history indexing and an evidence-oriented
prompt, not the actual-host Query1 run, which separately scored 469/500. The
95% run made **zero new LambdaDB calls** because it reused retrievals. A deployment
of that method still needs ingestion and retrieval; those costs are modeled below.
Do not label historical reservations near $50 or $100 as actual charges.

## Answer quality and generation input

All rows use the same released 500 question IDs and generator/judge identities,
but the host and direct-provider paths have different prompts and source partitions.
There is no new equal-prompt end-to-end comparison or speed claim here.

| Condition | Correct / 500 | Accuracy | Total answer input | Mean / median answer input | Observed time boundary |
| --- | ---: | ---: | ---: | --- | --- |
| Plain SillyTavern, 32K | 164 | 32.8% | 14,028,181 | 28,056 / 28,080 | Host reply median 4.08 s |
| Native Vector Storage, 32K | 172 | 34.4% | 14,028,603 | 28,057 / 28,078 | Host reply median 4.24 s |
| Plain SillyTavern, 128K, complete history | 465 | 93.0% | 52,591,554 | 105,183 / 105,319.5 | Host reply median 5.61 s |
| SillyMemory Query2, actual host | 414 | 82.8% | 2,526,647 | 5,053 / 4,988.5 | Host reply median 5.62 s |
| SillyMemory Query1, actual host | 469 | 93.8% | 2,524,361 | 5,049 / 4,970.5 | Later host run, median 4.47 s |
| Direct provider, existing packing | 469 | 93.8% | 2,158,498 | 4,317 / 4,316 | Answer HTTP only, about 2.06 s |
| **Direct provider, assembly/refill** | **475** | **95.0%** | **2,138,377** | **4,277 / 4,275** | Answer HTTP only, about 2.03 s |

The first four host timing medians use the existing report's common 481-question
timing subset. HTTP-only medians exclude retrieval, packing, host overhead and
history setup. The original direct-run report uses its recorded percentile
convention; the new usage extract uses the midpoint median. Neither supports a
cross-path speedup claim. [Host conditions and limitations](product-comparison.md)

The 95% row uses **95.93% less aggregate final-answer input** than complete history,
and 84.76% less than plain 32K. These are cross-run input-volume comparisons, not
proof that every answer improved. Assembly alone reduces input by only **0.93%**
versus its own fresh control: most recovered budget was spent on more source text.
Do not attribute the full-history input reduction to assembly alone.

## Generation costs with caching made explicit

Rates checked against the official
[GPT-6.1 Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
per million tokens, $2 ordinary input, $0.10 cached input, $2.50 cache writes and
$10 output. Recorded cache writes and hits are subsets of total input, so:

```text
generation USD = ((input - cached - cache_write) * 2
                 + cached * 0.10 + cache_write * 2.50
                 + output * 10) / 1,000,000
```

| Condition, 500 answers | Receipt input categories + output, priced today | All input at ordinary rate + same output, arithmetic only |
| --- | ---: | ---: |
| Plain 32K | $30.41 | $28.37 |
| Native Vector Storage | $14.12 | $28.38 |
| Plain 128K complete history | $131.83 | $105.53 |
| SillyMemory Query2, host | $6.59 | $5.35 |
| SillyMemory Query1, host | $6.58 | $5.35 |
| Direct existing packing | $5.70 | $4.65 |
| **Direct assembly/refill, 95%** | **$5.67** | **$4.61** |

This table includes final-answer generation only: no indexing, embeddings,
reranking, storage, summary maintenance or evaluation judge. The 95% row includes
33,298 output tokens, 4,373 cache-hit input tokens and 2,132,504 cache-write tokens;
all 500 receipts report the default service tier. Its 500 evaluation judgments
would add about $0.27 at current [GPT-4o rates](https://developers.openai.com/api/docs/models/gpt-4o),
separately from production serving cost.

The vector arm's cache-hit fraction was about 63.2%; plain 32K's was 14.8% and the
complete-history arm's was zero. Their identical-looking input totals therefore
produce different estimated bills. Shared prefixes, execution order and reuse
prevent attributing that difference to the vector algorithm.

An idealized 100%-cached-input arithmetic reference would price 500 complete-history
answers at $5.61 and the 95% answers at $0.55, before memory costs. This is not an
observed warm-cache comparison or a guarantee that new questions can cache all
input. It shows why the receipt-priced $131.83 must not be advertised as every
user's full-context bill. Contract, processing-tier, regional and gateway fees,
unknown failed-request usage and historical invoice rates remain unverified.

## LambdaDB: reconstructing cold setup and serving

The archived native producer and dataset were restored offline. All **500 corpus
document-array hashes** match the frozen run, totaling **487,285 documents**. No remote resources
were created. These are 500 isolated benchmark histories, not 500 turns in one chat;
shared filler is stored separately according to that experiment's isolation.

At the public [LambdaDB pricing](https://lambdadb.ai/pricing) and
[metering rules](https://docs.lambdadb.ai/guides/costs/understanding-costs), managed
`text-embedding-3-small` is $0.021/M input tokens and managed Jev 1.13.0 is
$0.0441/M. Those already cover managed inference; do not add the direct provider
rate a second time. Writes are $1/GB, storage $0.33/GB-month, reads $5/PB.
This models customer-facing LambdaDB list charges, not LambdaDB's internal
AWS/operational cost or a negotiated account contract.

| Component for 500 isolated histories | Reconstructed quantity / explicit assumption | Estimated USD |
| --- | --- | ---: |
| Initial embeddings | 52,134,671 `cl100k_base` tokens in exact stored text; assume no embedding cache/deduplication | **$1.095** |
| Initial writes | 468,422,630 serialized payload bytes; 10,000 batches with a 50 KB request minimum yield about 0.502 GB | **$0.502** |
| **Cold construction subtotal** | One successful build per corpus, no retries or diagnostic rebuilds | **$1.597** |
| Query embeddings | 9,005 tokens for the 500 original questions | $0.00019 |
| Query reads | 500 requests; small collections hit the 1 GB minimum, plus 1 GB for strong consistency | $0.005 |
| Jev scoring | Token proxy and overhead sensitivity below | **$0.253–$1.012** |
| **500-query serving subtotal** | Query embedding + read + Jev | **$0.258–$1.017** |
| **Cold construction + 500 queries** | Excludes regular storage and additional synchronization reads | **$1.85–$2.61** |

“50 KB” is modeled as 50,000 bytes. Using 51,200 bytes changes reconstructed writes
to $0.512 rather than $0.502. Payload sizes are reconstructed request proxies,
not a billing export. Real retries, text caching and provider token accounting
can change inference usage. Original R&D also rebuilt/diagnosed resources and
tested multiple retrieval arms; its total bill is not this one-build model.

### Reranking and storage uncertainty

Native rerank receipts did not expose billable tokens. The separately observed
no-rerank pool100 provides **4,848,296 passage tokens** and a conservative
**889,700 tokens** for repeating each question across all 100 candidates, using
`o200k_base`. This is a proxy: the auxiliary pool is not an exact capture of the
original candidate input, and Jev's tokenizer, criteria and batch serialization
can differ. It does establish the approximate text scale of the workload.

| Scenario | Rerank token-proxy multiplier | 500-query Jev USD | Physical-storage proxy multiplier | Storage USD/month |
| --- | ---: | ---: | ---: | ---: |
| Low | 1× | $0.253 | 1× | $1.14 |
| Central illustration | 2× | $0.506 | 2× | $2.28 |
| High | 4× | $1.012 | 4× | $4.57 |

These multipliers are disclosed sensitivity assumptions, **not confidence
intervals, measured physical sizes or guaranteed upper/lower bounds**. The storage
proxy is 3.462 GB: serialized documents plus 487,285 default 1,536-dimensional
float32 vectors. Real compression/index/version overhead is not known. Storage
scales with retention time; one month means keeping all 500 corpora for a full
month, unlike the short-lived historical experiment. The average corpus costs
roughly $0.0023–$0.0091/month under these scenarios.

Additional consistency/fetch/list requests are omitted from the serving subtotal.
As a sensitivity check, even 20,000 small strong read requests at 2 GB each price
at $0.20; this is an arithmetic scenario using the historical request ceiling,
not a count of billable reads. Captured query responses total about 26.5 MB:
at the published future $0.05/GB returned rate that is around $0.0013. Returned
data and deleted-data retention fees are currently promotional waivers; regular
active storage still applies. No free allowance is subtracted from these estimates.
Do not assume the whole 500-history build fits the Free plan's inference/storage
quotas or that a paid account receives those allowances automatically.

## Combined cost and the Summarize subset

For the 95% method, **500 answers + one cold build + 500 queries** cost about
**$7.52–$8.28**, before regular storage, extra synchronization and judging. The
central illustration is $7.78. Keeping all corpora for a month brings those
scenarios to **$8.67 / $10.06 / $12.85**. These combine measured answer usage with
modeled memory costs; they are not the actual incremental bill for the replay.
The other host rows above still exclude their own memory/indexing costs. In
particular, Native Vector Storage's direct embedding usage was not reconstructed
here; its $14.12 is not a complete operational total.

The native Summarize comparison used only a preselected stratified 50-question
subset. Filtering the retained 95% answers to those exact IDs gives **47/50 (94%)**.
This adds no new answers or judgments and does not make the different host/direct
prompt pipelines contemporaneous or equivalent.

| Same 50 question IDs | Accuracy | Generative input, answer + maintenance | Answer-generation USD | Construction/maintenance and retrieval USD |
| --- | ---: | ---: | ---: | --- |
| Plain 32K, host | 16/50 (32%) | 1,400,832 | $2.86 | None |
| Native vectors, host | 16/50 (32%) | 1,400,668 | $1.38 | Direct embedding/indexing cost not reconstructed |
| Native Summarize, host | 16/50 (32%) | **62,464,386** | $3.55 | **$158.47** summary maintenance; combined $162.02 |
| SillyMemory Query2, host | 38/50 (76%) | 252,070 | $0.66 | LambdaDB cost not reconstructed for this host path |
| Plain complete history, host | 44/50 (88%) | 5,262,912 | $13.19 | None |
| **Direct assembly/refill** | **47/50 (94%)** | **213,787** | **$0.57** | **$0.160** modeled cold build + **$0.025–$0.100** queries; combined about **$0.75–$0.83**, before storage |

Summarize required 2,475 successful maintenance calls, besides 50 answers. Its
combined estimate includes 719,812 output tokens and recorded cache categories.
The 95% method has no separate generative extraction, summarization or query-rewrite
call, but does use paid embedding and structured Jev inference. The wide cost gap
describes these declared configurations and full-history replay, not every possible
summary architecture. The native summary continues to coexist with roughly 28K
answer input rather than enforcing a 4K replacement policy.

Both indexes and summaries can be reused across later questions. For Q questions
on an unchanged history, separate **construction / Q + per-query work + generation**,
and add storage for the actual retention duration. New conversation turns, edits,
reindexing and incremental summaries change those terms. Do not charge the full
replayed-history summary or index build anew on every ordinary user turn, or claim
that these single-question-per-history experiments measure steady-state costs.

## External products: what is and is not comparable

These observations come from the dated [public-source review](memory-benchmark-reference.md),
not new vendor runs. Their generators, judges, budgets and ingestion differ.

| System | Published/inspected S result | Input-volume evidence | Memory-construction comparison |
| --- | --- | --- | --- |
| Our direct assembly/refill | 95.0%, 475/500 | 4,277 mean final-answer input; 4,275 median | Exact source reconstruction plus explicit LambdaDB scenarios above; no generative extraction/summary calls |
| Exabase M-1 | 96.4% top-50, reported | No run-bound absolute final-answer token total established in that review | Proprietary; no comparable construction bill established |
| Mem0 | Documentation 94.4%/94.8%; inspected JSONs 93.4%/90.4% | Documentation mean 6,787 tokens/query; not bound to the mismatching saved score files | LLM-extracted memory; managed implementation and complete construction usage not disclosed there |
| Hindsight inspected S artifact | 94.6%, 473/500 | About 43.6K mean **retrieved context**, not measured full generation input | Structured memory processing; construction bill not established from the reviewed artifact |
| Supermemory | Reported 97% with GPT-4o; 84.6% GPT-5; 85.2% Gemini 3 Pro | Top-20 aggregation; no bound input-total artifact established | Derived atomic memories/source relations; comparable ingestion bill not established |

Cognee and past.dev are additional architecture references, not S score entries
established by that review. Cognee documents LLM extraction, summaries and session
distillation; past.dev describes typed source-backed temporal memory without
disclosing its hosted extraction call budget. Their BEAM results have the cohort
and answer-assistance qualifications in the reference document. Neither supports
a numerical claim that our construction is a particular multiple cheaper.

## Supported implication and retained evidence

The strongest supported statement is **high accuracy on a consumed S cohort with
far smaller final-answer input and no generative memory-maintenance stage**.
Modeled construction and 500-query serving before storage are $1.85–$2.61 versus
$5.67 for answer generation at the observed cache state. With all 500 corpora
retained for one month, backend charges instead span $3.00–$7.18 (central $4.39):
storage can make backend cost comparable to or greater than generation. Retention
duration is therefore part of the comparison. Total-cost superiority over each
external vendor, speed superiority and SOTA remain unproven.

Detailed calculations, pricing snapshots, reconstructed-corpus hashes and one-off
producers are ignored local evidence at `artifacts/cost-comparison-2026-10-19/`.
They depend on the original local archives listed in
[evidence retention](evidence-retention.md#jev-depth100-complete-answer-comparison),
the cleaned dataset SHA-256
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`,
and `tiktoken` 0.14.0 (`cl100k_base` embedding count, `o200k_base` Jev proxy).
Sources and detailed prompts are not CI dependencies or available from a fresh
clone. This document preserves aggregate inputs and formulas for reviewing the
arithmetic without those local dependencies. Original archives remain unchanged.

The new evidence archive is `artifacts/archive/memory-cost-comparison-2026-10-19.tar.gz`,
SHA-256 `093c936428e73c0076c7e1099d6e7e97dd5c352bc9ea35ab42b3145b47a1834b`.
All 114 member files were checked against retained bytes. The adjacent
`memory-cost-comparison-2026-10-19.tar.receipt.json` records size and verification;
`artifacts/cost-comparison-2026-10-19/manifest.json` indexes file checksums.
This archive is local-only, not a promise of publicly hosted raw evidence.
