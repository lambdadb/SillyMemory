# LongMemEval-S: the 95% experiment, comparison arms and cost estimates

Historical analysis date: **2026-10-19**; the dated **2026-10-21** sections add
hosted-service billing and retention comparisons. This extends the
[benchmark reference](memory-benchmark-reference.md) using retained receipts and
offline reconstruction. No new model or database calls were made. All USD figures
use the rates stated in their respective sections, not invoices or controlled cost trials.

## Consolidated LongMemEval-S comparison

Measured rows combine quality, final-answer input and cost for the same 500 released
question IDs. The explicitly marked Summarize row projects usage and cost from
the frozen 50-question subset; its accuracy is observed on those 50 only.
Answer costs use each run's recorded cache categories plus output;
memory costs use audited receipts, source reconstruction or the marked projection. Totals exclude
host infrastructure, extra synchronization, retries and evaluation judging.
Host and direct-provider paths are different experiments, and
the 95% result is a consumed-cohort regression, not a held-out or actual-host result.

| Condition, 500 answers or marked projection | Accuracy (observed cohort) | Total final-answer input | Answer generation USD | Memory construction/maintenance + retrieval USD, before storage | Combined USD, before storage |
| --- | ---: | ---: | ---: | --- | --- |
| Plain SillyTavern, 32K | 32.8% | 14,028,181 | $30.41 | None | $30.41 |
| Native Vector Storage, 32K | 34.4% | 14,028,603 | $14.12 | **$1.04 receipt-priced embeddings** | **$15.16** |
| Native Summarize, **500-question projection (50 × 10)** | **32% on 50; 500 unmeasured** | **14,049,900 projected** | **$35.46 projected** | **$1,584.74 projected summary maintenance** | **$1,620.21 projected** |
| Plain SillyTavern, 128K, complete history | 93.0% | 52,591,554 | $131.83 | None | $131.83 |
| **SillyMemory direct, assembly/refill** | **95.0%** | **2,138,377** | **$5.67** | **$1.85–$2.61 modeled** | **$7.52–$8.28 modeled** |

The direct setup indexes complete histories, searches with the original question,
and uses native depth100/final50 retrieval with a 4,096-token memory budget and
source assembly/refill. Answers use `gpt-6.1-sol` with low reasoning; judgments use
`gpt-4o-2024-08-06` with the frozen upstream prompt. It has no separate generative
memory extraction, summary or query-rewrite stage; embeddings and Jev inference
are paid memory work. All host/direct rows share these generator/judge identities,
but differ in prompts and source partitions as detailed below.

For the 95% row, cold construction is **$1.60**, serving 500 questions is
**$0.26–$1.02**, and keeping all 500 histories for one month adds **$1.14–$4.57**.
The resulting **$8.67–$12.85** includes answer generation, construction, queries and
that month's storage, but excludes extra synchronization, failed attempts and
judging. These are sensitivity scenarios, not guaranteed billing bounds. The
historical direct replay reused retrievals; modeled deployment costs are included
here so that reuse does not appear to make memory free.

The supported input comparison is **95.93% less final-answer input** than the
complete-history arm, with scores of 95.0% versus 93.0% across the different paths.
The receipt-priced dollar gap also reflects cache state; it is not a controlled
warm-cache saving or a speed claim. The Summarize projection assumes the observed
50-question workload and cache mix scale linearly; it is not a completed
500-question run. The measured subset and projection arithmetic are retained below.

## Which 95% result is being compared?

The [source-assembly regression](jev-depth-100.md#completed-fresh-source-assembly-answer-regression)
scored **475/500 (95.0%)** with `gpt-6.1-sol`, low reasoning, and the frozen upstream
judge prompt using `gpt-4o-2024-08-06`. It generated new answers from previously
captured depth100/final50 retrievals under a 4,096-token memory budget. Its fresh
control scored 469/500 (93.8%); 11 questions improved and five worsened.

This is consumed-cohort regression, not held-out confirmation. It is a direct
provider experiment with complete-history indexing and an evidence-oriented
prompt, separate from the [historical actual-host runs](product-comparison.md). The
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
| **SillyMemory direct, assembly/refill** | **475** | **95.0%** | **2,138,377** | **4,277 / 4,275** | Answer HTTP only, about 2.03 s |

The host timing medians above use the existing report's common 481-question
timing subset. The direct HTTP-only median excludes retrieval, packing, host
overhead and history setup. The original direct-run report uses its recorded percentile
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
| **SillyMemory direct, assembly/refill, 95%** | **$5.67** | **$4.61** |

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
Native Vector Storage's audited embedding component is $1.04; its $15.16 combined
estimate has the same exclusions for local host resources and failed requests.

The native Summarize comparison used only a preselected stratified 50-question
subset. Filtering the retained 95% answers to those exact IDs gives **47/50 (94%)**.
This adds no new answers or judgments and does not make the different host/direct
prompt pipelines contemporaneous or equivalent.

| Same 50 question IDs | Accuracy | Generative input, answer + maintenance | Answer-generation USD | Construction/maintenance and retrieval USD |
| --- | ---: | ---: | ---: | --- |
| Plain 32K, host | 16/50 (32%) | 1,400,832 | $2.86 | None |
| Native vectors, host | 16/50 (32%) | 1,400,668 | $1.38 | **$0.1043** receipt-priced embeddings; combined **$1.49** |
| Native Summarize, host | 16/50 (32%) | **62,464,386** | $3.55 | **$158.47** summary maintenance; combined $162.02 |
| Plain complete history, host | 44/50 (88%) | 5,262,912 | $13.19 | None |
| **SillyMemory direct, assembly/refill** | **47/50 (94%)** | **213,787** | **$0.57** | **$0.160** modeled cold build + **$0.025–$0.100** queries; combined about **$0.75–$0.83**, before storage |

Summarize required 2,475 successful maintenance calls, besides 50 answers. Its
combined estimate includes 719,812 output tokens and recorded cache categories.
The 95% method has no separate generative extraction, summarization or query-rewrite
call, but does use paid embedding and structured Jev inference. The wide cost gap
describes these declared configurations and full-history replay, not every possible
summary architecture. The native summary continues to coexist with roughly 28K
answer input rather than enforcing a 4K replacement policy.

### Summarize: projecting the measured 50-question workload to 500

The consolidated table uses a **10× linear projection**, calculated from unrounded
50-question receipt estimates at the same rates and observed cache mix:

```text
500-question answer generation = 10 * $3.54625 = $35.4625
500-question summary maintenance = 10 * $158.4743122 = $1,584.743122
combined projection = $1,620.205622, rounded to $1,620.21
```

Projected final-answer input is **14,049,900 tokens**; summary-maintenance input is
**610,593,960**, making **624,643,860 total generative input tokens**. The same
scaling gives 24,750 summary calls plus 500 answer calls. The remaining 450
questions were not run: **32% is the observed 16/50 accuracy**, not a measured
500-question score or a forecast with a confidence interval. History lengths,
summary frequency, output lengths and caching can change the actual 500-question
cost. This is a workload projection for the declared native Summarize setting,
not the cost of every summary architecture or of 500 later turns reusing one
already-built summary. Storage, host infrastructure, retries and judging are
excluded, consistently with the consolidated cost table.

Both indexes and summaries can be reused across later questions. For Q questions
on an unchanged history, separate **construction / Q + per-query work + generation**,
and add storage for the actual retention duration. New conversation turns, edits,
reindexing and incremental summaries change those terms. Do not charge the full
replayed-history summary or index build anew on every ordinary user turn, or claim
that these single-question-per-history experiments measure steady-state costs.

## External products: what is and is not comparable

These observations come from the dated [public-source review](memory-benchmark-reference.md),
not new vendor runs. Their generators, judges, budgets and ingestion differ.

| System | Published/inspected S result | Input-volume evidence | Memory processing and cost evidence |
| --- | --- | --- | --- |
| Our direct assembly/refill | 95.0%, 475/500 | 4,277 mean final-answer input; 4,275 median | Modeled construction + 500 queries $1.85–$2.61 before storage; $7.52–$8.28 including answer generation. No generative extraction/summary calls |
| Exabase M-1 | 96.4% top-50, reported | No run-bound absolute final-answer token total established in that review | Proprietary; no comparable construction bill established |
| Mem0 | Documentation 94.4%/94.8%; inspected JSONs 93.4%/90.4% | Documentation mean 6,787 tokens/query; not bound to the mismatching saved score files | Hosted Pro $249/month accommodates the planned 124,333 adds + 500 searches; excludes application answer generation. Starter + overages unresolved; scenarios below are not observed run costs |
| Hindsight inspected S artifact | 94.6%, 473/500 | About 43.6K mean **retrieved context**, not measured full generation input | Structured memory processing; construction bill not established from the reviewed artifact |
| Supermemory | Reported 97% with GPT-4o; 84.6% GPT-5; 85.2% Gemini 3 Pro | Top-20 aggregation; no bound input-total artifact established | Derived atomic memories/source relations; comparable ingestion bill not established |

Cognee and past.dev are additional architecture references, not S score entries
established by that review. Cognee documents LLM extraction, summaries and session
distillation; past.dev describes typed source-backed temporal memory without
disclosing its hosted extraction call budget. Their BEAM results have the cohort
and answer-assistance qualifications in the reference document. Neither supports
a numerical claim that our construction is a particular multiple cheaper.

### Hosted storage and retention terms (2026-10-21)

A separate GB-month charge is not universal among hosted memory products.
Storage can be included in ingestion charges or a subscription; this billing
observation does not disclose a vendor's internal costs or guarantee perpetual
retention. Current public terms differ:

| Service | Published billing basis | Storage and retention qualification |
| --- | --- | --- |
| [LambdaDB](https://docs.lambdadb.ai/guides/costs/understanding-costs) | Writes, reads, managed inference and storage | Active storage is metered. Historical snapshot/deleted-data retention is a separate concept from keeping a live collection or branch. |
| [past.dev](https://past.dev/pricing) | Ingestion bytes; PAYG also meters recall; Flex includes unlimited recall | No separate storage charge. Data retention: PAYG 365 days, Flex 3 years, Enterprise unlimited under its agreement. |
| [Zep](https://www.getzep.com/pricing/) | Episode-size credits and a subscription | Storage, graph storage and retrieval are unmetered. This pricing page alone does not establish lifetime retention. |
| [Mem0](https://mem0.ai/pricing) | Subscription allowances for adds and retrievals | No separate GB-month rate in the inspected public sheet; do not infer unlimited storage or lifetime retention from its absence. |
| [Supermemory](https://supermemory.ai/pricing/) | Ingestion SM tokens, queries, additional operations and plan credits | No separate GB-month rate in the inspected public sheet; retention guarantees are not established by that sheet. |

Past's unlimited Enterprise retention is not an unconditional lifetime-storage
promise: its [public terms](https://past.dev/terms) allow 30 days to export after
account closure, then delete the data. Credit expiry and API-log retention are
also separate from memory-data retention. Unused data continues to incur service
cost, but an upfront ingestion payment may cover that cost; inactivity alone
does not establish that a customer is unprofitable.

### Past PAYG benchmark budget (2026-10-21)

This is an **offline list-price estimate**, not a Past API run, quote or invoice.
It excludes final-answer generation and evaluation judging entirely. Count the
retained cleaned LongMemEval-S 500 histories and the four completed
[BEAM cohorts](beam-evaluation.md#complete-fixed-ranked-8k-length-grid-2026-10-21).
Each history is independent: no cross-history reuse or deduplication is assumed.

The pinned [Past BEAM loader](https://github.com/pastdotdev/benchmarks/blob/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/dataset.py)
sends each nonempty message as one data point. Apply that same explicit assumption
to S; count only literal message content in UTF-8, excluding profiles, metadata,
transport JSON and added headers. One question makes one recall. The
[pricing rules](https://past.dev/pricing) are:

```text
ingestion credits = sum(max(1, ceil(message UTF-8 bytes / 350)))
recall credits = questions * 0.1
base-rate usage USD = (ingestion credits + recall credits) * 0.0003
```

| Cohort | Histories / questions | Content MB (decimal) | Ingestion credits | Total credits, including recall | Base-rate usage USD | Cash purchase USD, no signup credit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LongMemEval-S | 500 / 500 | 244.779 | 826,504 | 826,554 | 247.97 | **215.02** |
| BEAM 100K | 20 / 400 | 12.232 | 37,633 | 37,673 | 11.30 | **30.00** |
| BEAM 500K | 35 / 700 | 77.592 | 240,665 | 240,735 | 72.22 | **72.30** |
| BEAM 1M | 35 / 700 | 160.080 | 497,297 | 497,367 | 149.21 | **130.00** |
| BEAM 10M | 10 / 200 | 463.502 | 1,434,949 | 1,434,969 | 430.49 | **315.70** |
| All BEAM, one purchase | 100 / 2,000 | 713.406 | 2,210,544 | 2,210,744 | 663.22 | **486.42** |
| S + all BEAM, one purchase | 600 / 2,500 | 958.185 | 3,037,048 | 3,037,298 | 911.19 | **668.36** |

Cash minimizes a single purchase under the published volume tiers, with at least
100,000 credits bought in increments of 1,000. Per-credit rates are $0.00030 from
100K, $0.00026 from 500K, $0.00022 from 1M, $0.00017 from 5M and $0.00013 from
10M; the attained rate applies to the whole purchase. Unspent credits remain.
For example, 500K credits for $130 cover BEAM 1M, while the $30 minimum purchase
exceeds 100K's $11.30 base-rate usage. Joint purchases receive their own discount;
do not add the per-cohort cash column to obtain the joint budget.

The joint budget is 3,038,000 purchased credits for $668.36, with 702 left.
Applying the one-time 400K work-email signup grant to the entire joint workload
requires 2,638,000 purchased credits for **$580.36**. Do not apply that grant
separately to each cohort and add the discounted results. Purchased PAYG credits
expire after 90 days. Base-rate recall cost alone is **$0.015 for S** and
**$0.060 for all BEAM**; most of this workload's estimated charge is ingestion.

These are the benchmark buckets' nominal lengths, not identical corpus sizes or
tokenizers: BEAM 1M is 35 histories, not one 1M-token corpus. Its literal content
totals 160,079,877 bytes; embedding input is a different measurement.

Implementation assumptions matter. The current
[sending guide](https://past.dev/docs/memory-api/sending-data) recommends
conversation/day grouping and conversation parts below 16,000 characters, unlike
the pinned per-message benchmark client. The retained inputs contain respectively
13 / 3 / 15 / 30 / 100 messages at or above that character threshold for
S / 100K / 500K / 1M / 10M. A production adapter must handle those messages;
splitting, grouping and speaker/date headers change the billable bytes and
per-point rounding. The table prices the declared historical message units,
not a validated current-service import. Webhooks, retries, optional diagnostic
recalls and taxes are excluded.

PAYG permits one project, whereas the public BEAM runner creates one per
conversation. An actual PAYG reproduction needs scoped audiences/readers or
sequential isolated cleanup; it cannot run that project-creation path unchanged.
See the [operational comparison](memory-benchmark-reference.md#operational-boundaries-and-lifecycle-2026-10-21).
No quality, latency or universal cost ratio against Past follows from this budget;
our LambdaDB estimates above model different configurations and exclude some costs.

The calculation, input checksums and dated source captures are retained in the
local-only ignored `artifacts/memory-product-comparison-2026-10-21/` bundle.
Detailed availability and its verified archive checksum are recorded below.

### Mem0 Platform subscription scenarios

Checked **2026-10-19**. The hosted product's [public pricing](https://mem0.ai/pricing)
meters add and retrieval requests separately, with unlimited end users:

| Plan | Monthly subscription | Included adds/month | Included retrievals/month |
| --- | ---: | ---: | ---: |
| Hobby | Free | 10,000 | 1,000 |
| Starter | $19 | 50,000 | 5,000 |
| Pro | $249 | 500,000 | 50,000 |

The pinned [LongMemEval runner](https://github.com/mem0ai/memory-benchmarks/blob/4b61c5d31b9c668a12b4f5e78064248a02c82d2b/benchmarks/longmemeval/run.py#L283)
uses a separate user ID for each question, slices each session into consecutive
two-message groups, skips groups containing empty content, and calls `add` once
for every remaining group. Applied offline to the same cleaned dataset SHA-256
recorded below, its **23,867 sessions and 246,750 messages** yield **124,333 add
calls**, excluding 12 skipped groups. One search per question adds **500 retrievals**.
These are planned logical calls, not observed Mem0 billing or a reproduced score;
retries, event polling and other account usage are not measured.

| One 500-question run in one billing month | Planned add calls | Subscription scenario, answer generation excluded |
| --- | ---: | --- |
| Pinned runner's two-message ingestion | 124,333 | **$249 Pro** fits entirely within published included allowances |
| Hypothetical ten-message ingestion batches | About 39,500 | **$19 Starter** may fit the basic request allowances |
| Hypothetical whole-session ingestion | About 23,900 | **$19 Starter** may fit the basic request allowances |

The larger batches are sizing illustrations, not validated integrations: request
size limits, extraction behavior and resulting accuracy remain untested. The
pricing page places Graph Memory and Dream on Pro; a request count that fits
Starter does not establish access to the benchmark's full feature configuration.
The hosted service manages its own extraction LLM, embeddings and stores
([Platform/OSS distinction](https://docs.mem0.ai/platform/platform-vs-oss)). Do not
add a guessed self-hosted extraction-model bill to the subscription. Application
answer generation and evaluation judging remain separate. The published 6,787
tokens/query figure is not a run-bound final-answer usage receipt and cannot
establish an exact answer-generation bill for these scenarios.

**Overage pricing remains unresolved.** [Terms section 4.1](https://mem0.ai/terms)
allows usage-based overages at rates published on the Platform or agreed in an
Order Form. The public pricing page offers usage-based pricing through the sales
team, but no numerical overage rate was found in the inspected public pricing,
terms or [official FAQ](https://github.com/mem0ai/mem0/blob/main/docs/platform/faqs.mdx).
The app redirects unauthenticated access to login, so account-level billing rates
were not inspected. Neither automatic overage access nor a universal hard stop is
established here. **Pro is an included-allowance budget, not a proven minimum bill.**

If Starter permits the workload, its 74,333 excess adds and 500 included retrievals
would cost `19 + 74,333 * r`, where `r` is the unknown USD/add overage rate.
Hypothetical rates of $1 or $3 per 1,000 extra adds yield **$93.33 or $242.00**;
the break-even against $249 is about **$3.09/1,000**. These are arithmetic examples,
not Mem0's prices, and feature differences can still require Pro.

The $249 is a monthly account charge, not the marginal cost of this one run.
The planned adds consume 24.9% of Pro's add allowance; allocating the subscription
by that fraction gives **$61.92**, not a quoted per-run or overage price. An existing
Pro account with sufficient remaining allowances may incur no additional
subscription payment. Conversely, new ingestion, retries or other workloads can
exhaust those allowances. The LambdaDB estimate is usage-based list pricing;
comparing it with an entire subscription or an arbitrary quota allocation does
not establish an intrinsic cost ratio between the products. No Mem0 API calls,
subscription purchase or plan changes were made for this analysis.

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

The additional native-vector audit is retained at
`artifacts/native-vector-cost-2026-10-19/native-vector-cost.json`, with per-request
hashes/usage, a one-off analyzer, pinned native source and the same-date pricing
snapshot. Its source archive is the unchanged, local-only
`/Users/steven/Dev/sillymemory-longmemeval-product-comparison/artifacts/archive/product-comparison-final-v4.tar`,
verified SHA-256 `cf90037b2a5e0b06202b0c4645af47469eb3dc31b850dbff1d4a9287e75ad44a`.
The audit archive is `artifacts/archive/native-vector-cost-2026-10-19.tar.gz`,
SHA-256 `957c3c1f022615b1ad8d19251823e3e5b224a35a05762b83c3a747c25aadf2ba`.
All 13 members were read back and checked; the adjacent `.tar.gz.receipt.json`
records verification. These details are local-only evidence, not fresh-clone or
CI dependencies. The earlier cost archive and original source archives are unchanged.

The October 21 hosted-service extension is retained at
`artifacts/archive/memory-product-comparison-2026-10-21.tar.gz`, **114,419 bytes**,
SHA-256 `404ecd51d5f8a6d86044dc4685c183aefa2d9ba9d9f566949b831bcc01af9de1`.
All **28 file members** were read back against their originals. The adjacent
`.tar.gz.receipt.json` records verification. The bundle contains the one-off
calculator, exact byte/credit results and input hashes, fifteen dated primary-source
captures, maintainer policy provenance and local validation logs. Its
`RESTORE.md` identifies the existing cleaned-S and four BEAM source bundles needed
for full byte-count replay. Documentation base is
`03a592a9bc7e45b68238ed6f90b34b611d2d01f3`; calculation needs only the saved
Python standard-library script and original inputs. Availability is local-only,
with no new public download, remote backup or CI dependency promised. No source
archive or benchmark answer/score was modified.
