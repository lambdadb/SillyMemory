# BEAM evaluation decisions

## Complete fixed ranked-8K length grid (2026-10-21)

**Complete the scale baseline and pause further optimization.** The two remaining
full runs score **85.99/100 at 500K** and **80.64/100 at 10M**. Retain the original
ranked-8K reference; no presentation candidate or product default is promoted.
The four rows below use original full cohorts, not the 651-question source-frame
subset. Scores are **partial-credit means**, including the pinned normalized
event-ordering score, not binary accuracy.

| History bucket | Conversations / questions | SillyMemory /100 | Historical Past /100 | Gap |
| --- | ---: | ---: | ---: | ---: |
| 100K | 20 /400 | **89.00** | 92.08 | −3.08 |
| 500K | 35 /700 | **85.99** | 89.63 | −3.63 |
| 1M | 35 /700 | **86.62** | 90.65 | −4.03 |
| 10M | 10 /200 | **80.64** | 85.03 | −4.39 |

Past's scores are recomputed from the pinned historical
[public results](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam/results),
not a newly matched vendor execution. Across **2,000 question occurrences** there
are **1,999 distinct question texts**; only one text overlaps between 500K and
1M, with zero overlap for other bucket pairs. Histories, references and task
difficulty also differ. These are descriptive dataset buckets, **not a controlled
causal length-effect curve**, an unseen holdout or a SOTA/parity result.

### Ability comparison

| Ability | 100K /40 each | 500K /70 each | 1M /70 each | 10M /20 each |
| --- | ---: | ---: | ---: | ---: |
| Abstention | 97.50 | 90.71 | 88.57 | 85.00 |
| Contradiction resolution | 67.81 | 70.36 | 67.86 | 64.38 |
| Event ordering | 100.00 | 100.00 | 99.37 | 98.89 |
| Information extraction | 88.91 | 87.89 | 78.83 | 72.50 |
| Instruction following | 95.62 | 87.14 | 95.30 | 93.75 |
| Knowledge update | 83.12 | 76.19 | 75.71 | 80.00 |
| Multi-session reasoning | 66.55 | 58.45 | 67.34 | 29.42 |
| Preference following | 99.38 | 98.45 | 98.63 | 97.50 |
| Summarization | 96.72 | 97.88 | 98.57 | 93.75 |
| Temporal reasoning | 94.38 | 92.86 | 96.07 | 91.25 |

Multi-session reasoning is especially difficult in the 10M cohort: SillyMemory
**29.42**, historical Past **28.17**. That shared difficulty does not identify
a causal retrieval failure or a benefit from widening retrieval. Contradiction,
update and extraction weaknesses and previously documented source/reference/judge
ambiguities remain; no labels are corrected and no follow-up tuning is performed.
Annotation-derived generation hints remain part of this public protocol, so these
scores do not establish annotation-blind product behavior.

### Answer tokens, model-rate proxies and construction

| Bucket | Total answer input | Median answer input | Answer output | Judge input | All model input |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100K | 5,098,292 | 12,597.5 | 100,717 | 563,836 | 5,662,128 |
| 500K | 9,188,001 | 12,757 | 198,546 | 1,329,189 | 10,517,190 |
| 1M | 9,096,396 | 12,619 | 221,530 | 1,591,124 | 10,687,520 |
| 10M | 2,728,229 | 13,420 | 52,560 | 306,829 | 3,035,058 |

Mean answer input is **12,745.73 /13,125.72 /12,994.85 /13,641.15** tokens. The
fixed source-only estimate keeps answer inputs in a similar observed range;
metadata and prompt overhead mean this is not an 8K cap on final model input.
Different question counts explain why 10M's total answer input is lower.

| Bucket | Answer USD | Judge USD | Construction + query embedding proxy USD | Answer + embedding proxy USD |
| --- | ---: | ---: | ---: | ---: |
| 100K | 1.395373 | 0.177641 | 0.052111 | 1.447484 |
| 500K | 2.535150 | 0.403336 | 0.351818 | 2.886969 |
| 1M | 2.539830 | 0.486461 | 0.719194 | 3.259024 |
| 10M | 0.745099 | 0.097004 | 2.158827 | 2.903926 |

These use the same frozen historical comparison rates: input $0.20/M, cache reads
$0.02/M, cache writes $0.25/M, output $1.20/M, and embeddings $0.02/M. Cache
writes are subsets of input. They are **not invoices or complete system costs**:
managed-service margins, DB, search, native reranking and storage charges are
excluded. Embedding inputs are independently counted text, not provider receipts;
global/service cache reuse and cold-cache independence are unmeasured. Judge
costs are evaluation overhead, separate from production answer costs. The two
historical 100K setup calls (79 input /22 output tokens) are outside this table.

| Bucket | Source chunks | Construction embedding tokens | Literal-query embedding tokens | Memory HTTP requests | Deleted collections |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100K | 21,119 | 2,597,266 | 8,271 | 1,152 | 20 |
| 500K | 134,198 | 17,576,375 | 14,546 | 4,940 | 35 |
| 1M | 278,332 | 35,944,747 | 14,949 | 9,259 | 35 |
| 10M | 786,869 | 107,936,429 | 4,908 | 23,868 | 10 |

No generative memory-construction calls occur. Memory-request totals include
benchmark strong-fetch audits and owned cleanup, not just production ingestion
or search. All **100** owned collections across the four original runs have
verified 404 absence. Provider request durations remain available in raw receipts;
no SillyTavern host latency, peak indexing throughput or deployment claim follows.

### New-run verification and decision

The new **900 first answers** use **3,486 HTTP-200 model calls** (500K: 2,658;
10M: 828), with no model transport retries, failed questions/verdicts, empty
answers or truncated outputs. All **28,808** memory requests succeed without
unexpected errors/retries; expected cleanup 404s confirm absence. The original
100K/1M archives, answers and scores remain unchanged.

The frozen maintained verifier reconstructs all 900 contexts from original source
and saved queries, validates exact roles/offsets/as-of eligibility and budgets,
binds saved answer inputs and recomputes scoring. Offline transport replay feeds
every recorded judge response through the original scorer and reproduces all
900 score/verdict records exactly, with no model call. Native prompts, strict
schemas/settings and usage sums verify separately. This is retained-source and
arithmetic consistency, not independent judge calibration or receipt authentication.

One local completion-helper launch selected base Python by resolving a venv
symlink, then failed to import `httpx` **before any model call or scored directory**.
Preserve the failure/producer under `preparation-history/python-launch/`; retain
the venv launcher path and check dependencies before starting. No retrieval or
answer was repeated. Local checks pass **395 Node tests**, **13 Python policy
tests**, runtime/release syntax and SDK validation. No host/browser integration
or deployment is performed. This closes the authorized scale baseline with
further optimization paused.

### Evidence retention and summary replay

The new frozen producer is repository base
`e4e22d0100c8f82d49dd3a39e50df1d78c9627d5` plus the retained pre-call patch;
each run also includes the exact executed `source-runtime/` tree, upstream
revision, inputs/settings, original notices and dependency lock. No raw run,
scratch producer, local report or large fixture is committed to Git.

All archives below are under
`/Users/steven/Dev/sillymemory/artifacts/archive/`:

| Archive | Bytes | Verified members | SHA-256 |
| --- | ---: | ---: | --- |
| `beam-past-500k-v1.tar.gz` | 279,383,384 | 7,842 | `2422acee82048921391457ef7535cd88e942c78a1856055225d794c4b5e143ed` |
| `beam-past-10m-v1.tar.gz` | 1,096,834,072 | 24,889 | `8132339c03bda171615135dec3a33fbb0fe075e783cf4251a6caed33cdb992d6` |
| `beam-length-completion-v1.tar.gz` | 142,390 | 53 | `4ddb03b376a768e552c4ecbe36b0e67646b783affd66d868dc2c6fa3e781c5c1` |

Every member is read back and size/hash-verified, with zero configured-secret
matches. Both new active manifests verify; original 100K/1M archive checksums
are unchanged. The per-run `RESTORE.md` explains offline source/native/scoring
verification. The small summary archive retains copied original and new
analyses, published Past summaries, exact question texts, overlap arithmetic,
the plan and report producer. In a fresh directory, `python3 summarize.py`
reproduces `summary.json` and `report.html` byte-for-byte using only retained JSON
and the Python standard library, with no provider call or worktree dependency.

The active report is
`/Users/steven/Dev/sillymemory/artifacts/beam-length-completion-v1/report.html`.
Detailed active runs remain under the roots recorded below. These archives are
**local-only**, unavailable in a fresh clone and without an independent remote
backup. Checksums establish byte consistency, not provider authenticity or an
independent answer-quality audit. No unresolved owned remote resources remain.

### Frozen scope and source provenance

Pause further quality optimization. The user authorized the remaining **500K
(35 conversations /700 questions)** and **10M (10 /200)** full runs, then one
four-length summary with the original 100K and 1M results. Retain Small managed
embeddings, original 800-character chunks, literal Query1/k200, native Jev
candidate 200/final 100, strong source reads, ranked **8,000 estimated source
tokens**, pinned Past/ExaBase answer/judge instructions and annotation hints,
`gpt-5.6-luna`/reasoning `none`, and direct OpenAI transport. None of the three
deferred presentation candidates is used. The old GPT-4.1/4K 10M results remain
a separate protocol and do not populate this table.

The runner now pins the 500K Parquet at BEAM revision
`3205395e897e7318c7b094ef4e6047b9b82dbb03`, SHA-256
`af05921c979355038e1761b7cde3d2dd713200dd3071b278de0200f6c7f30122`.
10M uses BEAM-10M revision `9b2096193fe74e2837e4713e483351e19817773c` and two
ordered shards, verified together before either is parsed:

- `10m-00000-of-00002.parquet`:
  `31d96fd47ec56221d202e68792f26c00e49467dd4b36ee105c36ebd19ef78ad5`.
- `10m-00001-of-00002.parquet`:
  `a4f13fe25af51d57405ae41008689c31d1421377f3efde56a024b441deb2ee65`.

The complete original pretty 10M input exceeds V8's single-string limit
(**549,136,780 bytes**). Compact only its JSON envelope to **519,696,042 bytes**;
parsed objects compare equal, with every source string and question preserved.
Retain the pre-paid original input/lock and exact producer under
`preparation-history/pretty-input/`. Historical 100K/1M policy values and all
answer/scoring/source-verification function bodies remain unchanged. The harness
extension changes supported split metadata, pinned shard reading and input-file
serialization, not retrieval or answer quality policy. Node uses an 8GB heap for
these runs; no source or recent-dialogue truncation is introduced.

Offline preflight verifies the published Past score arithmetic (**89.63** for
500K, **85.03** for 10M) and all input/query constraints. 500K has **134,198
chunks /17,576,375** independently counted embedding tokens and **4,940** normal
memory requests; 10M has **786,869 /107,936,429** and **23,868**. Frozen $0.02/M
embedding-rate proxies are **$0.351528 /$2.158729**, excluding query embeddings,
managed-service margins, DB, search, reranking and storage. These are estimates,
not provider receipts or invoices.

Freeze **900 new first answers**, **20,000 aggregate model attempts**, a
**$50 conservative aggregate model reservation ceiling** ($25 per split), and
**70,000 memory operations** (20,000 /50,000, each including its 51-request owned
cleanup reserve). Each live recall/score phase has an eight-hour bound. Stop on
bounds/account refusal, retain incomplete evidence and verify owned cleanup.
No tuning, favorable answer repeats, new prompt track or default promotion.
Complete both runs, verify exact source/answer/scoring/usage receipts, and report
the four original full cohorts, abilities, construction/search counts, generation
tokens and modeled costs, or the precise external blocker. Length cohorts and
historical vendor runs are not a controlled causal length intervention.

The aggregate plan SHA-256 is
`80f64f4a512d651f6026cf3068f4b5eb8acc4267ae2864bc956058630b85e390`.
Ignored roots are `/Users/steven/Dev/sillymemory/artifacts/beam-past-500k-v1/`
and `/Users/steven/Dev/sillymemory/artifacts/beam-past-10m-v1/`; frozen runtime
snapshots, base revision/patches and original notices are retained before calls.
Keep the harness, both runs or concrete blockers, final comparison and cleanup
in the existing BEAM PR. The product decision is completing the evaluated scale
baseline, not adopting another improvement candidate.

## Verbatim source-frame follow-up (2026-10-21)

**Defer adoption and retain ranked 8K.** Fresh answers on **651 paired questions**
score **91.14 → 90.18/100 (−0.96 points)**. The 95% conversation-cluster interval
is **−2.34 to +0.31 points**, failing the predeclared positive-lower-bound quality
gate. This does not establish statistically significant harm either. Generation
input falls only **1.38%**. No runtime/default or generation/judge instruction
change is adopted; close this single candidate without a wider sweep.

### Frozen method

The user authorized a memory-side comparison with the generation prompt fixed.
Continue the existing BEAM decision branch/PR rather than open another
intermediate experiment PR. Test one source-frame candidate on the saved 1M
top100 retrievals: attach the source message's verbatim opening paragraph and
active ATX heading path before each passage. Ignore headings in fenced code;
retain original source IDs and UTF-16 spans. Do not infer actual/example labels,
filter roles, change retrieval order, summarize or add answer instructions.
Charge every attached source character under the same 8,000 estimated evidence
token rule and keep ranked greedy admission and at most 100 passages.

The concrete discovery witness is `27_knowledge_update_0`: a delivered numerical
sample loses its original **Example Metrics to Track** heading. The candidate
restores that heading and retains the user's **60%** report. This establishes
source-context restoration, not a causal answer-quality gain. The candidate
combines opening and heading context; it will not isolate their contributions.
Across all 700 offline contexts, baseline reconstruction matches exactly and
source/budget readback passes for both arms. The candidate attaches **18,622**
frames containing **4,999,329** source characters. Selected passage occurrences
fall **39,074 → 30,682**: **8,645** baseline occurrences leave and **253** enter.
This tradeoff must remain in the quality result; framing is not lossless packing.

Freeze the **651 questions** outside the 49 source-reviewed discovery cases
before constructing or generating the candidate. Historical scores are known;
this is a separate confirmation cohort, not an unseen benchmark. Freshly answer
and judge both arms with unchanged pinned Past/ExaBase prompts, annotations,
strict judge schemas, `gpt-5.6-luna`/reasoning `none` and direct OpenAI route.
Verify all 700 reconstructed baseline prompts against original native requests
before calls. Use per-question SHA-256 parity for consecutive arm launch order
and four concurrent conversations. Bounds: **1,302 first answers**, **12,000
model attempts**, **$25 conservative model reservation ceiling**, eight hours
and **zero memory-service calls**. One candidate, no favorable answer reruns or
post-score tuning. Stop on account refusal or resource bounds.

Adopt only with an improved overall paired score whose **95% conversation-cluster
bootstrap lower bound is positive** (20,000 resamples, seed 20261021), plus source
review without an unresolved material failure. Otherwise defer/reject. Report
the complete cohort, ability results, source losses/additions, actual model usage
and costs, and gain/regression examples. No product/default promotion occurs
without that evidence. Full source retrieval for frames is replayed from the
archive; live parent-source fetch costs and host integration are not measured.

The frozen plan SHA-256 is
`3638d2e057485990a5a6b482d6a73478d788c2b78e10478bb536fac33bacb977`.
Detailed candidate inputs, source locks, one-off producers and receipts belong
to ignored `artifacts/beam-source-frame-v1/`. The original 1M archive and scores
remain unchanged. The historical ranked 8K configuration remains the reference
at completion.

### Complete paired result and source review

All **1,302 first answers** and their judgments complete; **39** pairs improve,
**55** regress and **557** tie. None has identical contexts across arms. The
**476 historically full-credit controls** score **98.42 → 97.07** in the fresh
comparison. They are a predefined regression partition, not discovery evidence.
This selected 651-question mean is **not a new full-700 BEAM score** and cannot
replace the original **86.62497/100**. All 49 source-reviewed discovery questions
were excluded. The 35-conversation percentile cluster bootstrap uses 20,000
resamples with seed 20261021 and retains each sampled conversation's question
count. Historical outcomes are known, so this is not an unseen holdout.

| Ability | Questions | Ranked baseline /100 | Source frame /100 | Difference |
| --- | ---: | ---: | ---: | ---: |
| Abstention | 63 | 96.83 | 95.63 | −1.19 |
| Contradiction resolution | 65 | 69.23 | 69.23 | 0.00 |
| Event ordering | 69 | 99.90 | 99.71 | −0.19 |
| Information extraction | 63 | 86.22 | 83.76 | −2.47 |
| Instruction following | 69 | 95.59 | 94.63 | −0.97 |
| Knowledge update | 54 | 94.44 | 90.74 | −3.70 |
| Multi-session reasoning | 61 | 71.59 | 72.46 | +0.87 |
| Preference following | 69 | 98.61 | 96.62 | −1.99 |
| Summarization | 69 | 99.13 | 98.65 | −0.48 |
| Temporal reasoning | 69 | 97.10 | 97.10 | 0.00 |
| **Overall** | **651** | **91.14** | **90.18** | **−0.96** |

Ability differences are descriptive. Source framing both adds context and
displaces other passages. Within confirmation, passage occurrences fall
**36,298 → 28,490**, with **8,044** baseline occurrences excluded and **236**
other saved hits admitted. Added frames contain **4,653,500** source characters.
These are source-text counts, not unique facts or causal error prevalence.

The largest gain and regression per ability, ties by question ID, select **19**
answer/judgment/source packets for inspection. These outcome-selected examples
are not a prevalence sample:

- **Concrete dependency loss:** `32_instruction_following_1` loses the user
  exchange-rate witness **23,400 VND/USD** at baseline position 61. The $900 laptop
  price remains, but the candidate declines conversion and scores 1 → 0.
- **Target still available:** `15_knowledge_update_0` delivers the user's
  **3-liter** update in both arms at position 17; candidate answers older
  **2.5 liters**. Literal old-value occurrences increase **9 → 17** through repeated
  opening paragraphs. This identifies a salience risk, not an isolated causal
  estimate. The **$200** unexpected-expense witness likewise survives both arms
  in `35_information_extraction_0`, while the candidate chooses $50.
- **Nominal gain without new recall:** `14_knowledge_update_1` uses a DeFi
  security module already present in both arms. `5_instruction_following_0`
  gains version-format credit while generating versions such as `express@4.18.2`
  and `helmet@7.1.0` absent from its entire input; that is not validated grounding.
- **Whole-prompt availability matters:** `6_summarization_0` physically loses
  the Clairaut source and omits the theorem, but the full requirement remains
  in the generation hint. `23_summarization_1` gains dough-elasticity coverage
  supplied in hints despite no checked source-body occurrence. Neither supports
  a simple causal source-recall interpretation.
- **Judge/reference variability:** `10_event_ordering_0` and `15_abstention_1`
  have byte-identical answers across arms but different scores. In
  `18_temporal_reasoning_1`, independent date subtraction gives **47 days**;
  candidate's reference-matching **46** receives full credit. Preserve original
  labels; do not count these examples as recovered factual quality.

### Usage, validation and retention

| Phase | Baseline calls | Baseline input | Candidate calls | Candidate input |
| --- | ---: | ---: | ---: | ---: |
| Answer | 651 | 8,448,835 | 651 | 8,332,295 |
| Rubric | 1,715 | 1,505,639 | 1,715 | 1,498,663 |
| Equivalence | 588 | 51,785 | 589 | 52,061 |
| **Total successful** | **2,954** | **10,006,259** | **2,955** | **9,883,019** |

Answer output is **216,740 → 214,669** tokens; median input **12,579 → 12,452**.
At the same frozen historical comparison rates, answer costs are
**$2.372199 → $2.340579** and all successful model phases
**$2.846482 → $2.812941**, combined **$5.659423**. These are usage-based proxies,
not invoices. Three attempts end after about 90 seconds without a recorded HTTP
response and succeed through the unchanged transport retry policy with identical
requests. There are **5,912 total attempts / 5,909 HTTP-200 receipts**, no failed
questions/verdicts, empty answers or output truncation. Usage excludes unknown
provider treatment of the three response-less attempts. No new memory resources
are created and no generative ingestion or memory-service calls occur.

Answer cache reads are zero in both arms; writes are subsets of input.
Candidate rubric calls report 1,471 cached input tokens. No controlled cache or
host-speed claim follows. Live parent-source fetch cost is unmeasured.

All 700 baseline contexts and native answer prompts match the original archive.
Both arms' source spans, roles, as-of eligibility and 8K budgets verify. All 651
paired scores, native answer/judge instructions, schemas/settings and receipt
usage recompute. A fresh-directory offline replay recreates the frozen plan,
contexts, source lock and passage accounting byte-for-byte. Local validation:
**395** unit tests, **11** Python policy tests, runtime/release syntax and SDK
checks pass. No browser/host integration, deployment or independent judge
calibration is performed. Original evidence is unchanged.

The complete local-only bundle is
`/Users/steven/Dev/sillymemory/artifacts/archive/beam-source-frame-v1.tar.gz`:
**97,259,161 bytes**, SHA-256
`946055de09e90804a396337ce28a3e4cd1a206e9ecaf7165a503ea6852105e67`.
All **5,981 members** are read back byte-for-byte; configured-secret matches are
zero. Original source-frame inputs, prompts/responses, all paired results,
19 review packets, frozen locks, producers, dependency versions and restoration
instructions are retained. The active report is
`/Users/steven/Dev/sillymemory/artifacts/beam-source-frame-v1/report.html`.
The immutable original 1M archive is required for full source replay. This bundle
is unavailable in a fresh clone and has no independent remote backup; archive
checks establish byte consistency, not provider-receipt authentication or judge
calibration. No owned remote resources require cleanup.

## Past public-protocol 1M extension: frozen scope (2026-10-20)

The user authorized one full **1M, 35-conversation / 700-question** run after the
100K packing candidates failed their quality gates. Keep the original ranked
layout, Small managed embeddings, 800-character chunks, Query1/k200, native Jev
candidate 200/final 100, strong reads and **8,000 estimated evidence tokens**.
Neither deferred packing candidate is adopted. Use the same pinned Past loader,
annotation-assisted answer/judge prompts, `gpt-5.6-luna`/reasoning `none` and
approved direct OpenAI route as the 100K public-protocol result below.

The product question is fixed-budget quality at larger history sizes. Complete
all 700 first answers, report ability scores, source-return versus final-delivery
losses and source-reviewed interpretation failures, and retain exact receipts.
There is no tuning, second prompt track, favorable rerun, or default promotion.
The 100K and 1M cohorts differ, so aggregate changes do not isolate history length.
An offline comparison finds **zero identical question texts** across their 400
and 700 questions. All 400 100K question IDs reappear in 1M but identify different
texts; ID overlap is not a paired comparison or permission to reuse old answers.
Past's 1M **90.650340136/100** is a historical public report, not a new matched
vendor execution. Both prior SillyMemory length results and 100K scores are known;
this is not an unseen holdout or an annotation-blind product evaluation.

The dataset revision is unchanged. The complete `1M` Parquet has SHA-256
`41b5acbbb55a586b1305514ef9d9fb03365d9b3331b598a1c2dd7603d93ef533`, matching
[Hugging Face's pinned object](https://huggingface.co/datasets/Mohammadta/BEAM/blob/3205395e897e7318c7b094ef4e6047b9b82dbb03/data/1M-00000-of-00001.parquet).
Offline preflight verifies 35 conversations, 700 unique questions, the published
score arithmetic, **278,332 chunks / 35,944,747 independently counted embedding
input tokens**, and approximately **9,259** normal memory API calls. The frozen
historical $0.02/M embedding rate gives **$0.719**, excluding managed-service,
DB, search, reranking and storage charges. This is not a provider usage receipt.

Bounds are **700 first answers**, 10,000 total model attempts, a **$25 conservative
model-cost reservation ceiling**, **20,000 memory operations** including retries,
and eight hours per live phase. Stop on account refusal or bounds; an interrupted
run is incomplete. Verify each random owned collection and delete it with a 404
check. Detailed inputs, `plan.json`, protocol/source/dependency locks, original
receipts and results belong to ignored `artifacts/beam-past-1m-v1/`; never overwrite
an existing run. The plan hash is
`6e84d1567415e2d5544ada78a52ea544dbef4ca81b763062cb8070acc3450cf8`.
Use the same maintained phases with `--split 1m --root artifacts/beam-past-1m-v1`;
`prepare`/`verify` are offline and `recall`/`score` are paid. Retain the producing
source separately so later harness hardening cannot rewrite this run's policy.

### Complete 1M result

**SillyMemory: 86.624971655/100**, versus Past's historical public
**90.650340136/100** (a descriptive **−4.02537-point** gap). All **700 first
answers** complete, with **zero failed questions/verdicts**, no transport retries,
empty answers or output truncation. This is a partial-credit mean, not binary
accuracy. The earlier public-protocol 100K result is **88.999107143/100**;
its **−2.37414-point** descriptive difference from 1M is across distinct cohorts,
with zero identical question texts, so it is not a paired length-effect estimate.

| Ability | SillyMemory 100K /400 | SillyMemory 1M /700 | Published Past 1M /700 |
| --- | ---: | ---: | ---: |
| Abstention | 97.50 | 88.57 | 97.14 |
| Contradiction resolution | 67.81 | 67.86 | 75.36 |
| Event ordering | 100.00 | 99.37 | 99.81 |
| Information extraction | 88.91 | 78.83 | 83.98 |
| Instruction following | 95.62 | 95.30 | 96.43 |
| Knowledge update | 83.12 | 75.71 | 85.71 |
| Multi session reasoning | 66.55 | 67.34 | 72.82 |
| Preference following | 99.38 | 98.63 | 98.87 |
| Summarization | 96.72 | 98.57 | 99.60 |
| Temporal reasoning | 94.38 | 96.07 | 96.79 |
| **Overall** | **89.00** | **86.62** | **90.65** |

Each 1M ability has 70 questions (100K: 40). Against Past's same 1M cohort,
knowledge update (−10.00 points), abstention (−8.57), contradiction resolution
(−7.50), multi-session reasoning (−5.48) and extraction (−5.15) account for most
of the gap. Category means are descriptive; source/reference ambiguity affects
some low scores and is not corrected after observing results.

### 1M tokens, cost and cleanup

All usage below is summed from **3,127 successful HTTP-200 model receipts**:
700 answers, 1,817 rubric judgments and 610 ordering-equivalence judgments.
Native requests retain the exact pinned prompts, strict schemas and approved
model parameters. There are no additional generative ingestion calls.

| Phase | Calls | Input tokens | Output tokens | Cache reads | Cache writes | Frozen-rate USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Answer | 700 | 9,096,396 | 221,530 | 0 | 9,094,296 | $2.539830 |
| Rubric | 1,817 | 1,537,619 | 93,320 | 0 | 949,364 | $0.466976 |
| Equivalence | 610 | 53,505 | 7,320 | 0 | 0 | $0.019485 |
| **Total** | **3,127** | **10,687,520** | **322,170** | **0** | **10,043,660** | **$3.026291** |

Answer input averages **12,994.85 tokens**, median **12,619**. The 100K run
averaged 12,745.73, median 12,597.5. A fixed evidence budget keeps generation
input similar despite the larger corpus; these distinct cohorts do not establish
an isolated scaling law. Full answer input is larger than the 8,000 source-only
estimate because the prompt and JSON provenance also consume tokens.

Use the same frozen comparison rates as 100K: ordinary input $0.20/M, cache
read $0.02/M, cache write $0.25/M and output $1.20/M. Writes are subsets of input,
not added tokens. Zero observed cache reads does not establish an independently
controlled cold-cache experiment; the service and prior runs share infrastructure.
These usage-based estimates are **not invoices or a controlled cache study**.

Construction indexes **278,332 chunks** without generative extraction or
summarization. Independently counted cl100k embedding input is **35,944,747**
construction tokens and **14,949** literal-query tokens. At the frozen $0.02/M
rate, the proxies are **$0.718895 + $0.000299**. The combined model/embedding-rate
proxy is **$3.745485**, excluding managed-service margins, DB writes/reads,
reranking and storage; do not describe it as the complete billed system cost.

The memory ledger contains **9,259 HTTP operations**: 35 creates, 5,583 upserts,
2,801 strong fetches, 700 queries, 105 ownership/absence reads and 35 deletes.
There are no retries/errors. All **35 owned temporary collections** have verified
404 absence. Model-call durations are retained, but no SillyTavern host response
speed, browser integration or deployment claim follows from this independent run.

### 1M source audit and interpretation

The structural audit covers **5,357 per-question annotation references**:
**198 ambiguous** repeated turn-ID references stay separate; 5,159 map uniquely
to eligible source messages. Returned coverage is **1,129 complete / 397 partial /
3,633 absent**; final delivery is **897 complete / 292 partial / 3,970 absent**.
Of 224 imperfect answers, their 1,473 uniquely mapped references have final
coverage **365 complete / 88 partial / 1,020 absent**, with another 61 ambiguous
references. **98** mapped messages on imperfect answers are found but entirely
excluded by packing (337 over all questions). These are message-span statistics,
**not necessary-fact recall, missing-fact counts or causal failure prevalence**.

Before answers, diagnostic selection was fixed to one lowest-scoring case per
ability, ties by numeric conversation ID and question ID. All ten packets were
opened and source-reviewed; original scores/rubrics remain unchanged:

| Diagnostic | Score | Source-bound observation |
| --- | ---: | --- |
| `1_abstention_1` | 0 | Rank-1 user message explicitly reports **90% satisfaction** for the queried feature and reaches generation. The no-information rubric rejects that supported answer; Past's public answer also reports 90% and scores 0. |
| `2_contradiction_resolution_1` | .375 | Both annotated user statements say **92% Cypress pass rate** and are delivered. The answer omits 92% and substitutes a generic-example contradiction; the annotated witnesses do not contain the rubric's never-created assertion. Clarification wording is also ambiguous. |
| `15_event_ordering_0` | .7556 | All ten topics match but their order differs. Only 4/36 annotated messages are returned and 1 is fully delivered; rank-69 August exercise evidence is packed out. Provided topic hints and sparse delivery prevent a single causal attribution. |
| `7_information_extraction_0` | 0 | Explicit **k=0.035** reaches generation at rank 50 alongside repeated older 0.03 values; the answer chooses 0.03. The target is delivered, but public extraction guidance favoring original mentions adds interpretation ambiguity. Past's answer also chooses 0.03 and scores 0. |
| `4_instruction_following_1` | 0 | The original version-reporting instruction is returned at **rank 94** and packed out, but annotation guidance repeats it in the actual generation prompt. The answer gives unversioned/latest images. This does **not** establish causal instruction-delivery loss; availability of all requested version numbers remains unverified. |
| `5_knowledge_update_0` | 0 | Both the eligible later **12-hour** request (rank 6) and older daily setup (rank 5) reach generation; answer says daily. Goal-versus-current-configuration interpretation also matters. Past answers 12 hours. |
| `6_multi_session_reasoning_1` | 0 | Target counts **8 + 10** are delivered, but the answer sums other reports to 39. One target message also says both completed eight and never solved any; cumulative/repeated-count interpretation is required. |
| `27_preference_following_0` | .6667 | Evening/Riverside preference is respected; a wording-sensitive item penalizes explicitly mentioning cooler conditions. This is not factual preference retrieval failure. |
| `29_summarization_0` | .875 | Original user shoulder-pain report and annotated physiotherapy discussion are absent from top100. Summary covers wrist injury instead. The full shoulder criterion is independently supplied in generation guidance: source-witness loss is verified, but its causal role in the omission is unresolved. |
| `24_temporal_reasoning_0` | .5 | Delivered sources say March 15/April 27 and the answer correctly computes **43 days**. Rubric also demands April 17 (33 days), conflicting with its 43-day item. Past's public answer receives the same .5. |

The result supports continuing the fixed-budget backend at 1M as an evaluated
configuration, with explicit quality gaps. It does **not** support a SOTA or
quality-parity claim. Do not attribute every lower label to retrieval: verified
packing loss, missing source witnesses, delivered-but-misused values and shared
reference inconsistencies coexist. A next quality hypothesis should target one
of those demonstrated mechanisms and freeze separate confirmation cases before
paid optimization. Neither previous packing candidate nor a new product default
is promoted by this length run.

### Expanded offline 1M error classification (2026-10-20)

The product question is which observed losses justify a retrieval, packing or
answer-use hypothesis. The bounded offline scope is a census of all **700**
recorded answers, structural triage of all **224 imperfect answers**, and source
review of **49** fixed cases: all **35 zeros**, the original ten diagnostics,
and the five lowest nonzero imperfect cases in each of contradiction resolution
and multi-session reasoning. Ties use numeric conversation ID and question ID;
the union is fixed before opening the additional packets. No provider call,
regrading, candidate generation, runtime/default change or paid follow-up occurs.
Original answers and the **86.624971655/100** score remain unchanged.

There are **476 full-credit, 189 partial-credit and 35 zero-credit answers**.
The following four abilities account for **82.44% of total lost score mass**;
counts of imperfect answers alone overemphasize small event-ordering penalties.

| Ability | Full / partial / zero | Mean /100 | Lost score mass |
| --- | ---: | ---: | ---: |
| Multi-session reasoning | 20 / 46 / 4 | 67.34 | 22.86369 |
| Contradiction resolution | 1 / 69 / 0 | 67.86 | 22.50000 |
| Knowledge update | 52 / 2 / 16 | 75.71 | 17.00000 |
| Information extraction | 40 / 23 / 7 | 78.83 | 14.81786 |

Lost score mass sums `1 - original question score`; divide by seven to obtain
its contribution to the 700-question overall score loss in percentage points.
This is score accounting, not a binary error rate.

All-224 structural triage finds **170** with some eligible annotated message
delivered and **62** with every eligible annotated message completely delivered;
**122** have an annotation absent from top100 and **59** have a returned
annotation entirely excluded by packing. **16** lack eligible uniquely mapped
annotations. These overlapping message-span flags are not necessary-fact recall
or causal failure counts. For example, `31_information_extraction_1` has missing
annotated parade messages, yet equivalent user evidence of choosing Sanja Matsuri
over Tokyo Tower reaches generation at rank 3. The answer selects another day's
sushi class; annotation absence alone would misclassify the mechanism.

The 49 source-reviewed cases have these **overlapping observations**, not an
estimate of their prevalence in all 224 imperfect answers:

| Observation | Selected cases | Interpretation |
| --- | ---: | --- |
| Delivered target omitted or another value selected | 25 | A target fact/qualifier is already available; an ambiguous target can still accompany the mismatch. |
| Provenance or modality concern | 13 | Assistant examples/proposals, hypothetical changes or other people's facts mix with claims about actual user state; certainty can remain ambiguous. |
| Aggregation or scope mismatch | 10 | Cumulative progress, transaction identity, taxonomy or accounting scope differs from the reference. |
| Reviewed relevant source witness absent from top100 | 7 | Source-specific absence; equivalent facts elsewhere are not ruled out. |
| Reviewed witness returned but target phrase packed out | 4 | Physical memory-selection loss; complete-prompt hints can defeat a causal attribution. |
| Question, source, reference or judge ambiguity | 32 | Competing interpretations, not an adjudication that 32 original labels are invalid. |

Concrete answer-use failures include selecting an assistant sample **80%**
shooting result over the delivered user **60%** update
(`27_knowledge_update_0`), and summing assistant **proposed** budgets of
**$12,000 + $6,000** instead of delivered user-confirmed **$10,000 + $5,000**
(`26_multi_session_reasoning_1`). The arithmetic is correct for the wrong factual
status. The **4,550 TRY** rent update, **180-ball** practice update and **April 1**
appointment also reach generation but lose to older values. A separate packing
candidate is the **h=0.25** user update, returned but excluded in
`7_knowledge_update_0`; no counterfactual quality benefit is established.

Full-prompt inspection corrects the earlier attribution for
`4_instruction_following_1`: its packed-out instruction is independently repeated
in annotation-derived generation guidance. The shoulder criterion is likewise
supplied as a summary hint in `29_summarization_0`. Keep source-witness loss,
information availability in the entire generation prompt and actual answer use
separate. These task hints are part of this public comparison protocol, not a
validated annotation-blind product behavior.

Four expected knowledge updates were not located explicitly in eligible dialogue:
**17 minutes**, **30 LinkedIn connections**, **50 contest participants**, and
**April 4** in `6_knowledge_update_1`, `11_knowledge_update_0`,
`23_knowledge_update_0` and `24_knowledge_update_1`. Probe metadata describes the
updates, but reviewed source annotations are mismatched or empty. Searches cover
both source roles and the question's eligible time prefix; literal/near-literal
searches do not rule out every semantic paraphrase. Retain these as unresolved
source/reference support, not confirmed retrieval failures. Past's archived
public answers also score **zero on all four**, so they do not explain the
product-to-product score gap.

All **70** contradiction answers receive full credit for identifying a
contradiction. The fourth criterion receives **55 zeros / 12 halves / 3 full
scores**, accounting for **15.25 of 22.50** lost score units in this ability
(**67.78%**), or **2.17857 points** of the original overall loss. Some judgment
reasons demand determining which claim is true despite generation guidance
requesting no definitive conclusion; similar indeterminate answers sometimes
receive full credit. Missing an explicit clarification request can still be a
rubric mismatch. This is diagnostic accounting, **not recovered points or a
rescored benchmark**; actual target-detail omissions remain.

**Decision: defer a grounding modification and retain the fixed ranked 8K
reference.** The diagnosis identifies useful targets—user reports versus
assistant examples/proposals, subject/status-bound updates and cumulative
counts—but does not establish an effective intervention. Source roles are already
labelled, and public multi-session guidance already restricts counting to explicit
user mentions; repeating those requirements is not evidence of a working fix.
The 49 cases are selected discovery evidence, with overlapping mechanisms and
reference ambiguities, not a frozen comparison establishing a candidate's quality
effect. There is no measured gain to justify adopting a new default, and the two
completed 100K packing candidates remain deferred after their failed quality
gates. This closes the requested offline attribution with a retain/defer decision,
rather than treating a nominated hypothesis as completed quality improvement.
Retrieval and packing retain concrete witnesses to revisit, but widening retrieval
alone does not address delivered-but-misused facts. A future authorized grounding
comparison needs a specific intervention, a frozen confirmation cohort and a
quality gate before paid calls; none is implemented or run in this diagnosis.

The analysis starts from repository revision
`525574b93408079d81a8b2b10d2820ad95e1ea39`; its one-off uncommitted producers
are retained in the derived bundle and read immutable original-run evidence.
The derived local-only archive is
`/Users/steven/Dev/sillymemory/artifacts/archive/beam-past-1m-error-analysis-v2.tar.gz`:
**2,438,204 bytes**, SHA-256
`43b26f49b1256d451f9cee53a82d11775006159a1a16df3819c8ee6529284a4f`.
All **64 members** are read back; their file manifest verifies. The bundle retains
the fixed selection, 700-outcome census, 49 case findings and source packets,
exact native answer prompts, local review HTML, and one-off producers/verifier.
All **98 selected query/answer receipts** bind directly to the original archive;
source phrases, eligibility and selected witness ranks verify. Extracting this
bundle into a fresh empty directory and running its four recorded producers
recreates every manifest file byte-for-byte using only the original archive and
Python's standard library, with no separately restored inputs or provider calls.
The earlier derived v1 archive remains unchanged; v2 completes its producer and
restoration recipe and records the explicit defer decision without changing the
selected cases, classifications or benchmark labels.
The original 1M bundle remains unchanged and is required for full-corpus
reproduction via `RESTORE.json`. Neither archive is available in a fresh clone
or independently backed up remotely. Mechanical verification does not calibrate
the judge or prove the semantic/causal classification.

### 1M validation and retention

The producing tree passes **393** `npm test` cases; after integrating the latest
`develop` (including PR #93) and the cleanup regression below, the combined suite
passes **395**. The Python policy suite passes **11**. Runtime/release syntax and
SDK checks pass. The offline `verify` phase
reconstructs all **700** contexts from retained source and raw retrieval receipts,
checks their linked answer contexts and recomputes score arithmetic. Independent
analysis binds native answer/judge prompts and schemas to recorded calls and
recomputes phase usage. This is source/context consistency and arithmetic, not
provider-receipt authentication or independent judge calibration.

Post-run automatic review found that exhausting the original operation counter
could also block owned cleanup. Future runs now reserve **51 of the existing
10,000/20,000 total requests**: ownership + deletion + up to 15 absence polls,
across at most three cleanup attempts. Ordinary work cannot spend that reserve,
rejected requests do not increment the counter, cleanup mode resets after each
operation, and the hard aggregate ceiling still applies. A synthetic real-SDK
transport regression exhausts ordinary work, verifies GET/DELETE/404 cleanup,
checks mode reset and exhausts the bounded cleanup allowance. This is a failure
safety fix, not a new paid quality run. The completed 1M run used only 9,259 calls
and already verified all deletions; its original producer/locks/archive remain
unchanged. Source, query, packing and evidence-accounting function bodies are
identical to that producer. Historical verification uses the retained
`producer/scripts/beam-past-protocol.py` from the restored 1M bundle; its full
700-context offline verification passes after the fix. New producer hashes and
the declared cleanup reserve intentionally require a new lock for future runs.

The one-off analysis, structural audit and diagnostic verifiers remain ignored
with original records and producer snapshots. An initial offline analysis
assumption about where `additionalProperties` is added was corrected; its source
and failure note are retained. No paid call, prompt, answer or label changed.
Previous completed working copies were removed only after byte-for-byte archive
verification; all prior archives remain. Transparent filesystem compression
preserves input read bytes and frozen hashes. No source evidence was discarded.

Retained evidence: `artifacts/archive/beam-past-1m-v1.tar.gz`, **343,356,154 bytes**,
SHA-256 `bc8cbb9f6b8572f98b8b3279dc5608a300fb6fbf5eac6ce946318d737b42d0b9`. All **12,572** archive members were read
back and verified, with zero configured-secret matches. The canonical archive is
at `/Users/steven/Dev/sillymemory/artifacts/archive/`; it is **local-only**,
unavailable in a fresh clone, with no independent remote backup. The bundle
retains exact producer source, pinned upstream/data/dependency locks, raw memory
and model receipts, all 700 answers, audit/diagnostic packets and restoration
instructions. Read its `RESTORE.md`; recreating the 1M verification does not
require rerunning paid calls. The separate 100K archive preserves its comparison
source, even after archived working copies were removed to free local space.

## Past public-protocol comparison: frozen scope (2026-10-20)

The user approved one full **100K / 128K, 20-conversation / 400-question** run,
replacing the memory backend in Past's public experiment with SillyMemory.
The question is performance under that published evaluation protocol, not an
annotation-blind product-quality improvement claim. This explicitly separate
track does not change the original baselines or product defaults.

- Past harness: [`1faac1e70fa50d92d966904358be98bb1beca0c8`](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam).
  Reuse its loader, answer and judge prompts, strict judge schemas, rounding,
  event alignment/Kendall tau-b, and question-weighted aggregation unchanged.
- Dataset: Hugging Face `Mohammadta/BEAM`, revision
  `3205395e897e7318c7b094ef4e6047b9b82dbb03`, complete `100K` split. Parquet SHA-256:
  `c0519be25907005ba873c927c50877471d550873039d96c041554d0075a78ace`.
  This follows Past's loader, rather than assuming the earlier GitHub source is
  byte-identical. Past's saved 92.082142857 score and full question coverage
  reconstruct offline; the three prompt bodies verify against ExaBase's file.
- Answer and judge: `gpt-5.6-luna`, reasoning `none`, one user prompt, no added
  temperature or output cap. **Direct OpenAI Chat Completions is user-approved**
  instead of Past's OpenRouter route. Translate only routing-specific request
  fields; retain strict JSON schema for rubric and equivalence judging.
- Evaluation annotations enter answer generation exactly as Past's prompt uses
  them. They never enter ingestion or retrieval. No recent dialogue, extra
  product system prompt, or independent query rewrite enters generation.
- Same source messages, speaker identities and supplied user-profile traits.
  Same question as-of instants, including knowledge-update cutoffs at microsecond
  precision. Session dates remain batch references, not actual message send times.
- SillyMemory backend: original-text 800-character product chunks, managed OpenAI
  Small embeddings, Bayesian Query1/k200, native Jev 1.13.0/default criteria,
  role/batch-context/text reranking and strong reads. One query returns up to
  **100 chunks**, with ranked source-validated evidence admitted within **8,000
  estimated evidence tokens**, excluding JSON metadata. The observed rule is
  `sum(ceil((content code points + source-excerpt code points) / 4))` per result;
  it reproduces `usedEvidenceTokens` in all 400 published records. This is an
  empirical accounting match, not verification of Past's private implementation.
  Count full serialized JSON separately with cl100k. Context rendering and chunk
  units belong to the backend; matching budgets does not make evidence identical.
- Bounds: 400 first answers, no quality tuning or favorable repeats, four
  transport attempts per model call as upstream, 10,000 model attempts / a $25
  conservative model-cost reservation ceiling, 10,000 memory operations, and
  eight-hour wall limits per live phase. Account refusal stops the run; exhausted
  upstream answer/judge failures retain its zero-credit policy. Resource-limit
  interruption is an incomplete run, never a full-cohort score.
- Record all model request/response usage by phase, retrieval receipts and exact
  sources under ignored `artifacts/beam-past-100k-v1/`. Verify collection ownership
  before mutation and deletion, then confirm all temporary collections return 404.
  Preserve raw evidence with checksums and a local-only restoration record.

Before any answer generation, an offline audit found that the initial packing
counted full JSON against 8,000 cl100k tokens. Past's published recall JSON instead
averages 10,982 cl100k tokens, while its reported evidence estimate averages 7,987.
Retain those unscored initial contexts, then repack the same saved top-100 queries
using the matched accounting rule. This makes no new provider calls and does not
select answers or tune to scores. Separate retrieval and generation source locks
retain this pre-generation correction.

Entry points are `scripts/beam-past-protocol.py` and
`scripts/beam-past-memory.mjs`. The former imports the pinned upstream source from
the ignored bundle, preserving its original MIT/BEAM/ExaBase notices rather than
vendoring third-party prompts. Its `prepare`, `recall`, `score`, and `verify`
phases, plus an offline `repack` phase, keep source freezing separate from paid
calls. The final decision is a complete comparison or a documented concrete
blocker; no second prompt track,
larger history bucket, or product promotion is included.

For a new authorized replication, create the ignored bundle using the pinned
sources above. This run used Python 3.14 with `httpx==0.28.1`, `scipy==1.18.1`,
and `pyarrow==26.0.0`; the bundle retains the complete dependency lock.
Install `tiktoken@1.0.22` separately under the bundle's `tokenizer/` directory,
not as a production dependency. The minimal setup and execution are:

```sh
beam_run=artifacts/beam-past-100k-v1
mkdir -p "$beam_run/upstream"
git clone https://github.com/pastdotdev/benchmarks.git "$beam_run/upstream/past"
git -C "$beam_run/upstream/past" checkout --detach 1faac1e70fa50d92d966904358be98bb1beca0c8
curl --fail --location https://huggingface.co/datasets/Mohammadta/BEAM/resolve/3205395e897e7318c7b094ef4e6047b9b82dbb03/data/100K-00000-of-00001.parquet -o "$beam_run/100k.parquet"
python3 -m venv "$beam_run/venv"
"$beam_run/venv/bin/pip" install httpx==0.28.1 scipy==1.18.1 pyarrow==26.0.0
npm install --prefix "$beam_run/tokenizer" --no-audit --no-fund tiktoken@1.0.22
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py prepare
# Paid phases: use an existing credential file; never copy it into the bundle.
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py recall --env-file /path/to/evaluation.env
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py score --env-file /path/to/evaluation.env
"$beam_run/venv/bin/python" scripts/beam-past-protocol.py verify
```

## Past public-protocol result (2026-10-20)

**SillyMemory scores 89.00/100 over all 400 questions, versus Past's published
92.08/100: a descriptive gap of −3.08 points.** This is the question-weighted
partial-credit score, with normalized event-ordering Kendall tau-b. It is not a
binary answer-accuracy rate. Past's row is its saved September 29 run, not a fresh
service rerun; this run uses the user-approved direct OpenAI route. It therefore
matches the public evaluation protocol without claiming identical execution dates,
provider routing, memory representation, or a controlled vendor win.

| Ability | Questions | Past published /100 | SillyMemory /100 |
| --- | ---: | ---: | ---: |
| Abstention | 40 | 98.75 | 97.50 |
| Contradiction resolution | 40 | 78.13 | 67.81 |
| Event ordering | 40 | 100.00 | 100.00 |
| Information extraction | 40 | 95.00 | 88.91 |
| Instruction following | 40 | 96.25 | 95.63 |
| Knowledge update | 40 | 89.38 | 83.13 |
| Multi session reasoning | 40 | 68.95 | 66.55 |
| Preference following | 40 | 100.00 | 99.38 |
| Summarization | 40 | 99.38 | 96.72 |
| Temporal reasoning | 40 | 95.00 | 94.38 |
| **Overall** | **400** | **92.08** | **89.00** |

The largest category gaps are contradiction resolution (−10.31 points), knowledge
update (−6.25) and information extraction (−6.09), using unrounded scores. Event ordering scores 100 in
both runs. Evaluation annotations explicitly supply its topics and supply strong
hints in several other categories; these results do not establish annotation-blind
memory quality or perfect independent chronology reconstruction. No hints-off
comparison, quality tuning, favorable answer repeats, or other bucket ran.

Three post-result, source-bound diagnostics inspect the largest score deficit in
those three categories (ties by question ID), without changing any labels:

- `13_information_extraction_1`: the original $120 print-book budget reaches
  top100 at rank 68 but is omitted by packing. The answer describes a later $60
  print/audio plan. Returning another fragment of the original assistant message
  does not establish delivery of the required budget-allocation details.
- `15_knowledge_update_0`: the eligible user's 4 PM update is delivered alongside
  repeated older 3 PM assistant plans. The answer still says 3 PM. This is an
  evidence-use failure, not absence of the updated statement from the prompt.
- `19_contradiction_resolution_0`: both planned-meeting and never-met statements
  are delivered. The answer identifies a contradiction, but substitutes prior
  consultation for the planned meeting and omits the clarification request.
  Preserve the original rubric labels and their interpretation limits.

This selected review does not estimate failure prevalence. The older GitHub-based
SillyMemory runs use different source adaptation, generation and judging; the
score increase over those records does not isolate a memory-system improvement.
The cohort is known, not an unseen confirmation set. Keep product defaults and
close this bounded protocol comparison without a new optimization grid.

### Tokens, costs and completion

All 400 answers, 838 rubric judgments and 212 event-equivalence judgments complete:
**1,450 successful benchmark model calls, no HTTP failures, transport retries,
empty answers, failed verdicts, or output truncations**. Two separate synthetic
transport checks add 79 input / 22 output tokens and approximately $0.000042;
they are not benchmark answers. The generated and judged model identifier is
`gpt-5.6-luna`, with reasoning disabled throughout.

| Benchmark model phase | Calls | Total input tokens | Output tokens | Estimated USD |
| --- | ---: | ---: | ---: | ---: |
| Answer generation | 400 | 5,098,292 | 100,717 | $1.395373 |
| Rubric judging | 838 | 545,486 | 40,222 | $0.170918 |
| Event alignment | 212 | 18,350 | 2,544 | $0.006723 |
| **Total** | **1,450** | **5,662,128** | **143,483** | **$1.573015** |

Answer input averages **12,745.73 tokens**, median **12,597.5**. The evidence budget
is an estimate over source text; the full API input also includes JSON metadata,
question/category guidance and evaluation hints. Token totals above are recorded
provider usage, not median-times-question-count projections.

No cached input reads are reported. Answer generation reports 5,097,092 cache-write
tokens; rubric judging reports 271,095. They are subsets of prompt input, not extra
input tokens. Costs use the frozen [OpenAI Luna rate card](https://developers.openai.com/api/docs/models/gpt-5.6-luna):
$0.20/M ordinary input, $0.02/M cached reads, $0.25/M cache writes and $1.20/M output.
The formula is `(input − reads − writes)×ordinary + reads×cached + writes×write +
output×output-rate`, with rates per million. These are usage-based estimates,
not invoices or a controlled cross-provider cache comparison.

The backend indexes **21,119 source/profile chunks**. Independent cl100k counting
estimates **2,597,266 initial embedding input tokens**; this is not a managed
provider usage receipt. There is no generative extraction/summarization during
memory construction. Managed query embeddings, native reranking, writes/reads and
physical storage are separate costs; the model table is not total system cost.
Recorded HTTP timings do not establish SillyTavern reply latency, TTFT or a
matched speed comparison with Past.

All 400 retrievals and all stored source fields verify against the normalized
input. Exact microsecond filters, top100 rankings, original and corrected packing,
answer prompt bodies, native model settings and saved score arithmetic reconstruct
offline. All 20 owned collections are deleted with 404 evidence. `npm test` passes
388 tests; `npm run check`, `npm run check:release`, `npm run check:sdk`, Node
syntax and Python compilation pass. This is a live API benchmark, not a browser
integration run, deployment, or calibrated judge-accuracy study.

The complete local-only bundle is
`artifacts/archive/beam-past-100k-v1.tar.gz`: **86,082,977 bytes**, SHA-256
`ad9d7a629b71c12c8037efdb1aca2684706ff53e2aad6a314f73c6acc9db1f15`.
All **2,748 members** were read back and checked; the configured-secret scan
found zero matches. Identical archive copies exist in the primary `sillymemory`
and `sillymemory-beam-past-protocol` worktrees on the same machine. They are not
independent remote backups and are unavailable in a fresh clone. Restore into a
new directory and follow the bundle's `RESTORE.md`; the frozen retrieval and
generation producers, protocol/recall locks, dependency locks, source review and
all original receipts remain available without new provider calls. The producing
public base is `cbd27ab470e67af105b2bd56fd3f642c6702cf17` plus the archived
experiment source snapshots; original historical bundles remain unchanged.

Post-run review hardens the maintained runner's failure and input guards. HTTP
status classification survives non-JSON model/memory-service errors; receipt
logging leaves the SDK response readable. Repacking selects successful query
attempts while retaining failures in the ledger. An existing protocol is rejected
before input rewrites, and every phase checks canonical settings plus the complete
required source/input manifest. Scoring requires exactly the 20 expected recall
paths derived from the pinned dataset, then verifies every digest before model
calls. The final suites pass **390 JavaScript and seven Python tests**.

These guards make no new paid calls or label changes. The original measured
protocol matches the canonical settings, and its complete 20-file recall manifest
passes the new check. The archive retains the exact executed producer; use its
restoration instructions for historical verification rather than assume the later
maintained runner has the same source hash.

## Lossless context layout follow-up (2026-10-20)

**Defer adoption and the quality-improvement claim.** A user-authorized follow-up
compares one lossless presentation candidate with a fresh baseline on 397 paired
questions: **88.92 → 89.77/100 (+0.85 points)**. The 95% conversation-cluster
bootstrap interval is **−0.32 to +2.06 points**, crossing zero and failing the
predeclared positive-lower-bound quality gate. Answer input falls **11.87%**.
Text preservation establishes an input-saving opportunity, not equivalent answer
quality or an established quality improvement. Keep the ranked baseline and
product defaults; close this candidate without a wider optimization grid.

### Frozen method and source audit

The original 400-question run and receipts remain unchanged. Before candidate
answers, the 397 questions other than the three previously source-reviewed
discovery cases were frozen.
Historical scores and aggregates were already known: this is
**not an unseen holdout**. Both arms were freshly generated and judged, preserving the
pinned Past/ExaBase prompts, annotations, strict schemas, score arithmetic,
`gpt-5.6-luna`/reasoning `none`, direct OpenAI route and as-of cutoffs. Per-question
SHA-256 parity determines which arm launches first; retain four concurrent
conversations and up to 20 question pairs per conversation. One answer per arm,
no favorable repeats. Bounds: 794 answers, 12,000 model attempts, $25 conservative
reservation ceiling, eight hours, zero new memory-service calls. The frozen plan
SHA-256 is `ff037a057de8eef9f78d94fdc012a6e5b97d107e0d091b94a6a84ce23fc6f5c1`.

The candidate keeps exactly the original selected chunks and 8,000 estimated
source-text budget. Group passages by source message, sort messages by ordinal
and passages by source offset, and dictionary-encode repeated time-meaning labels.
Preserve all source text, roles, authors, source/turn IDs, ordinals, passage IDs,
offsets, batch reference dates, time meanings and original selected retrieval
positions. No deduplication, summarization, source addition, reranking or answer
instruction change. This tests a presentation bundle; it does not isolate the
contributions of ordering and metadata compaction. It cannot recover the $120
budget excluded from the original selected evidence.

Offline reconstruction verifies all text, metadata, source eligibility and budget
on all 400 saved contexts, with zero loss or selected-chunk changes. Serialized
cl100k context tokens fall 5,060,535 → 4,454,643 (11.97%), with no increases in any
question. These are context-only diagnostics; actual API answer input is below.

The historical 400-question baseline has 103 imperfect answers. Their 284 annotated
message references include 151 complete deliveries, 41 partial deliveries, 29 found in top100
but unselected, and 63 absent from top100. These are **message-coverage statuses,
not causal failure counts or verified necessary-fact recall**; equivalent facts
can occur elsewhere and partial messages require manual review. All 40 baseline
contradiction answers are imperfect. Their fourth rubric item, asking which
statement is correct, receives zero in 36 cases and half-credit in four. The
answer guidance asks for both claims without a definitive answer, while some
judge reasons read this item as determining the correct claim. Keep the existing
labels and prompts; do not attribute this whole category gap to retrieval.

### Paired scores and resource use

| Ability | Paired questions | Fresh baseline /100 | Candidate /100 |
| --- | ---: | ---: | ---: |
| Abstention | 40 | 92.50 | 92.50 |
| Contradiction resolution | 39 | 70.83 | 70.19 |
| Event ordering | 40 | 100.00 | 100.00 |
| Information extraction | 39 | 89.16 | 91.99 |
| Instruction following | 40 | 94.38 | 93.13 |
| Knowledge update | 39 | 80.13 | 89.10 |
| Multi session reasoning | 40 | 68.37 | 68.24 |
| Preference following | 40 | 100.00 | 99.38 |
| Summarization | 40 | 97.54 | 97.69 |
| Temporal reasoning | 40 | 95.63 | 95.00 |
| **Overall** | **397** | **88.92** | **89.77** |

Across pairs, 33 improve, 27 regress and 337 are unchanged. The interval uses
20,000 conversation-cluster resamples, seed 20261020. Knowledge update improves
80.13 → 89.10, while instruction following falls 94.38 → 93.13 and several other
categories also decline; category means are descriptive, not separate established
wins. The historical baseline on these same 397 questions was 89.55; do not
compare the candidate with the original 400-question 89.00 as a paired effect.

A post-result source review illustrates both outcomes: `13_knowledge_update_1`
changes the answer from an older $35 budget to the updated $50 budget (0 → 1),
with both values present in the same selected evidence. In
`17_instruction_following_0`, the MM/DD/YYYY instruction is present in both arms,
but only the baseline follows it (1 → 0). These selected examples do not estimate
failure prevalence.

| Recorded usage | Fresh baseline | Candidate |
| --- | ---: | ---: |
| Answer input tokens, 397 calls | 5,060,310 | 4,459,748 |
| Mean / median answer input | 12,746.37 / 12,599 | 11,233.62 / 11,097 |
| Answer output tokens | 101,590 | 108,891 |
| Answer model estimated USD | $1.386926 | $1.245547 |
| Rubric judge input tokens, 831 calls | 542,881 | 576,644 |
| Equivalence judge input tokens, 212 calls | 18,350 | 18,350 |
| All model phases estimated USD | $1.564188 | $1.430674 |

All **2,880 model calls** finish with HTTP 200, without retries, empty answers,
failed verdicts or truncation: 794 answers, 1,662 rubric and 424 equivalence
judgments. Total estimated model cost is **$2.994862**, using the frozen rate card
above; these are usage estimates, not invoices. Both arms report zero cached
reads. Answer cache writes are 5,059,119 / 4,458,557 and rubric writes are
279,483 / 303,450; writes are subsets of input. Candidate answer output increases,
so do not equate input savings with total-cost savings. This interleaved replay
does not isolate cache effectiveness or establish host-latency improvements.

All saved score arithmetic, native model parameters, exact answer and judge
prompts, source reconstruction and usage totals verify offline. The candidate's
small synthetic regression and the full 391-test JavaScript suite pass; seven
Python tests, runtime/release and SDK checks pass. Retain the unadopted prototype
and regression in the evidence bundle rather than add an unused maintained mode.
After removing that prototype, the final maintained suite passes 390 tests and
the archived producer still verifies offline.
Subsequent review fixes an external `--root` failure: run-local manifest keys now
use a stable `run/` namespace instead of requiring paths beneath the checkout.
An eighth Python regression verifies an external root, relocated/symlinked bundle
and rejection of a changed input. Historical manifests remain with their exact
producers; this guard change makes no new paid calls or score changes.
No runtime/default change, new ingestion/retrieval, collection creation, browser
integration or deployment occurred.

Retained evidence: `artifacts/archive/beam-context-layout-v1.tar.gz`,
**23,285,832 bytes**, SHA-256
`41448cdb1332666a9a1fe0516f0919e5af1a7e3da65bf6f47778e85dcd96f338`.
All **2,909 members** were read back and checked; configured-secret matches: zero.
Identical copies exist in the primary and protocol worktrees on the same machine.
This bundle is local-only and unavailable in a fresh clone. Restore it beside
`beam-past-100k-v1/` from the original archive recorded above, then follow its
`RESTORE.md` for offline verification. The original archive provides the pinned
upstream source/data and dependency locks; the follow-up retains its exact
producer, frozen plan/cohort/context hashes, source audits and complete fresh
requests, responses, usage and results. Preserved source precedes removal of the
unadopted active-tree prototype. Producing checkout: `f9e495bc0297f7c6ab10293c1806551a33567498`
plus the archived candidate source. Neither archive was overwritten.

## Exact repeated-evidence grouping and refill (2026-10-20)

**Defer adoption: the paired comparison does not establish a quality gain.**
One user-authorized exact-repeat/refill candidate preserves all baseline sources
and adds relevant evidence, but fresh answers on 392 paired questions score
**89.99 → 89.54/100 (−0.44 points)**. The 95% conversation-cluster interval is
**−1.59 to +0.52 points**; the predeclared positive-lower-bound quality gate fails.
Actual answer input rises **0.36%**. This does not establish harm either; keep
product defaults and close the single candidate without a wider sweep.

### Offline source preservation and delivery

The offline plan was frozen before the screen (SHA-256
`bf18ed48011d45ffd650e51f62416a52f2947b260d6f51fc931a4528081e8fbd`).
Group byte-identical whole passages only within the same conversation, role,
author, source kind and batch-date/time meaning. An explicit identical-occurrence
list preserves every source/turn ID, ordinal, passage, offset and verbatim body;
the first retrieval occurrence remains the display location. No paraphrase
matching, whitespace normalization, summary, message quota, retrieval expansion or
reranking. Reserve every baseline selected chunk first, refund only repeated text,
then admit previously unselected saved top100 hits in retrieval order. Keep the
same 8,000 source-only estimate and at most 100 source chunks. Count each rendered
unique body as `ceil(code points / 4)`; provenance remains outside that estimate.

Across all 400 contexts: 266 repeated occurrences in 124 questions refund 43,953
estimated source tokens, permitting 429 additional source-chunk occurrences in
155 questions. These are not 429 unique facts; some add another occurrence of an
already delivered body. All baseline text and provenance reconstruct exactly.
Serialized cl100k context input changes **5,060,535 → 5,079,094 (+0.37%)**:
145 contexts increase, 245 are equal and ten decrease. These are offline
context-only diagnostics, not provider usage or measured full-prompt cost.

Over 1,094 annotated message references, four formerly absent references become
complete and two partial; three existing partial references gain more text.
These nine extensions occur in seven questions, only three with imperfect
historical answers. Message coverage changes from 478 complete / 145 partial /
471 absent to 482 / 147 / 465, without losses. Structural coverage and correct
controls do not establish necessary-fact recall or answer-quality improvement.

Source review verifies one relevant gain: `12_summarization_0` newly receives the
paragraph in `12_s000_t0059` linking declining a meeting with Stephen to the
startup offer, an opening event omitted from the historical answer. No baseline
body mentions the startup offer. Its exact source span and eligibility verify.
The $120 discovery fact in `13_information_extraction_1` remains absent.

A preliminary diagnostic accidentally exposed a retrieval-position field absent
from the baseline, increasing input 3.02%. Preserve those bytes under the screen's
`preparation-history/rank-diagnostics/`. Before any candidate answer, remove only
that added diagnostic; positions remain in selected IDs and raw receipts. Every
selected ID, grouping/refill decision, source field and budget stays unchanged.
Candidate context files were copied byte-for-byte into confirmation and remained
unchanged throughout the quality comparison.

### Quality scope correction and frozen confirmation

The original offline plan included an assistant-added non-increasing-input gate
and initially deferred paid evaluation when it failed. **Before any candidate
answer**, that extra cost prefilter was removed to follow the authorized
relevant-fact and no-source-loss conditions and the repository's quality-first
policy. Both source conditions passed; the small input increase became a reported
resource outcome. The original plan, decision and archive remain unchanged. This is a disclosed
pre-quality scope revision, with no candidate/prompt/model change or observed
candidate quality used to choose it.

The corrected plan SHA-256 is
`16e487f8e54b4721ea615a80bf97c0b22d53230abd1965637d1f37cf107130e1`.
The **392-question** confirmation was frozen, excluding all eight previously source-reviewed cases:
the original three diagnostics, the prior layout's two examples and this screen's
three imperfect source-gain questions. All have historical scores; this is
**not an unseen holdout**. Both arms were freshly called with hash-based launch order,
unchanged Past/ExaBase prompts/annotations, strict schemas and score arithmetic,
`gpt-5.6-luna`/reasoning `none`, direct OpenAI and identical as-of cutoffs. Four
conversations run concurrently with up to 20 question pairs each. Bounds: 784
answers, 12,000 model attempts, $25 conservative reservation ceiling, eight hours,
zero new memory calls. One answer per arm; no favorable repeats or candidate sweep.

| Ability | Pairs | Fresh baseline /100 | Candidate /100 |
| --- | ---: | ---: | ---: |
| Abstention | 40 | 97.50 | 97.50 |
| Contradiction resolution | 38 | 69.74 | 69.74 |
| Event ordering | 40 | 100.00 | 100.00 |
| Information extraction | 39 | 90.92 | 91.13 |
| Instruction following | 39 | 95.51 | 94.87 |
| Knowledge update | 38 | 83.55 | 78.29 |
| Multi session reasoning | 39 | 71.08 | 71.27 |
| Preference following | 40 | 99.38 | 100.00 |
| Summarization | 39 | 98.27 | 97.24 |
| Temporal reasoning | 40 | 92.50 | 93.75 |
| **Overall** | **392** | **89.99** | **89.54** |

Sixteen pairs improve, 17 regress and 359 are unchanged. The interval uses 20,000
conversation-cluster resamples, seed 20261020. Do not compare this candidate with
the historical full-400 89.00 as a paired effect. Category scores are descriptive:
knowledge update falls 83.55 → 78.29; no independent category win is established.

Exact serialized inputs are unchanged in **242 pairs**: these controls score
89.14 → 88.84, with seven improvements, nine regressions and 226 unchanged scores.
Their differences reflect generation/judge variability, not the candidate layout.
The **150 changed-input pairs** score 91.35 → 90.69, with nine improvements,
eight regressions and 133 unchanged scores. These source-defined partitions are
descriptive; the full 392-pair result stays primary. The four confirmation
questions gaining annotated source coverage were historically correct controls;
the three imperfect source-gain questions were excluded as discovery cases.

A post-result illustrative regression, `14_knowledge_update_0`, retains the user's
$75 snack-budget update (`14_s001_t0046`) in both arms. The fresh baseline answers
$75; the candidate answers older $45/$65 values (1 → 0). Source preservation does
not establish correct update use. This case and the control variation do not
isolate layout causality or estimate failure prevalence.

### Recorded API usage and retention

| Usage, 392 answers per arm | Fresh baseline | Candidate |
| --- | ---: | ---: |
| Answer input tokens | 4,995,732 | 5,013,544 |
| Answer output tokens | 101,183 | 101,443 |
| Answer cached-read tokens | 1,584,538 | 1,532,551 |
| Answer cache-write tokens | 3,410,018 | 3,479,817 |
| Mean / median answer input | 12,744.21 / 12,603 | 12,789.65 / 12,665.5 |
| Answer model estimated USD | $1.005850 | $1.022572 |
| Rubric input tokens, 820 calls | 541,366 | 544,508 |
| Equivalence input tokens, 212 calls | 18,350 | 18,350 |
| All model phases estimated USD | $1.182128 | $1.199182 |

All **2,848 model calls** complete with HTTP 200: 784 answers, 1,640 rubric and
424 equivalence judgments, without retries, empty answers, failed verdicts or
truncation. Combined modeled model cost is **$2.381310**, using the frozen rate
card above, not an invoice. Both arms have substantial cached reads; rubric reads
are 0 / 1,357 and writes 283,013 / 283,365. Cache writes are subsets of input.
Interleaving, identical controls and reuse across experiments mean these are
observed-cache costs, **not cold-cache independent system costs** or a controlled
cache-effectiveness comparison. No new embedding, retrieval, storage or collection
calls occurred. No host-latency, browser integration or deployment claim.

Exact frozen contexts/cohort, native parameters, answer/judge prompts and strict
schemas, saved score arithmetic, source-defined partitions and usage verify
offline. The archived synthetic check covers exact reconstruction, different
values, role/author/date/time isolation, budget refill and foreign-source rejection;
an independent source verifier checks all 400 contexts and the relevant fact gain.
Final maintained checks pass 392 JavaScript and ten Python tests, runtime/release
and SDK checks. Keep one-off producers and full output ignored and archived;
there is no new maintained candidate mode or product/runtime change.

The offline screen remains at `artifacts/archive/beam-repeated-evidence-v1.tar.gz`,
17,158,271 bytes, SHA-256
`0c6b661944f43dd5792da9caf3214cd7a57459ab0d64360d573de8e44cca8753`
(71 members checked). The paired confirmation is
`artifacts/archive/beam-repeated-evidence-confirm-v1.tar.gz`, **23,100,258 bytes**,
SHA-256 `e4034408608c99ea5970372daf2e610412122e410bcf26ca8cd1c8a6037211aa`
(**2,871 members** checked). Both have zero configured-secret matches and identical
same-machine copies in the primary and protocol worktrees. They are local-only,
unavailable in a fresh clone; no archive was overwritten. Follow each bundle's
`RESTORE.md` with the original baseline archive above. Exact producers, plan/input
hashes, source audits, raw model requests/responses, usage and complete results
remain available without provider calls. The confirmation producer is checkout
`d5cb63f067ddf56737b18cbb7df0dbeef055b5f5` plus its archived one-off scorer; the
unchanged candidate was produced at `2c5b1e3380133cf390d798ef50bee4b7620a6389`.

Post-result review makes offline repacking publish all files and their lock
together. New runs build in a temporary directory, then rename it to `recall/`
after every conversation validates; the current scorer reads `recall/lock.json`.
Failed validation removes only its own staging directory, leaving original
receipts intact and permitting a retry. An added synthetic lifecycle regression
covers failure, retry, complete publication and refusal to overwrite published
data. An offline CLI replay injects a source mismatch in conversation 20, verifies
cleanup, repairs the copied receipt and successfully republishes all 400 contexts;
all 20 output files are byte-identical to the original canonical recalls, their
complete manifest passes the Python check, and another publication is rejected.
This makes no provider calls or measured-score changes. Historical top-level
`recall-lock.json` files remain with their archived producers; no archive is
rewritten to match the new output layout.

Before paid scoring, the maintained runner also reconstructs all recall bytes
from saved query receipts and the normalized source through an internal
`--verify-recall` check. Its independently derived manifest must match the
published lock; the scorer hashes and parses the same input bytes against that
derived map. Editing a recall file and its mutable digest together therefore
does not authorize altered evidence. Small JavaScript/Python regressions and the
full provider-free replay cover this coordinated-edit case, reject it against
reconstructed source, and accept the restored originals. They also confirm all
400 consumed records match the source-derived values. Existing source/query,
cutoff, packing and file-count checks remain in place; no paid rerun or score
change accompanies these post-result integrity guards.
The final `verify` phase shares the same retained-state/lock/source validation,
then links each successful saved answer's context to the reconstructed recall
before reporting score-arithmetic success. A CLI-entry regression rejects corrupt
retained source even when the arithmetic verifier would succeed. The full offline
replay also confirms that post-score receipt corruption and altered saved answer
contexts fail `verify`, and that restoring the originals passes. This command
reports source/context consistency and score arithmetic, without claiming a new
provider call or independent model-receipt authentication.

## Decision and scope (2026-10-19)

PR #84 closed the 128K, 1M and 10M baselines and bounded follow-up comparisons.
Keep original-text managed OpenAI Small retrieval, default native Jev criteria,
k200/candidate200/final50, ranked 4096-token memory and the original BEAM judge.
The full 10M retrievalText comparison does **not establish reliable general answer
benefit**: other-198 rubric 63.05→64.09, mixed 60.10→60.18, with 22.8% more embedding
input and 41 newly missing source references. **Defer retrievalText adoption.**
Keep the 8192-budget and message-diversity candidates unadopted; close the judge grid.

Role and verified host-time context in product reranking are a separate,
user-approved semantic decision, not a promotion justified by these scores.
BEAM batch dates remain distinct from host timestamps. Historical controls and
labels below are unchanged. Small→Large was unexecuted at PR #84 closure. The
[subsequent 40-question screen](beam-large-embedding-evaluation.md) now closes that
separate decision with adoption deferred; it does not replace these prior scores.
The [remaining-failure summary](#remaining-failure-types-summary-updated-2026-10-20)
keeps the unresolved problems and their model/evidence scope in one place.

After [LongMemEval-S closure](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18),
use all **20 conversations / 400 questions** in `chats/100K`, called **128K** by the
[MIT-licensed upstream dataset](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a).
Pin that source revision and prefer `chat_trunecated.json` as its loader does.
Source conversations measure 92,928–121,849 cl100k tokens; that is not generation
input length. This is an independent memory evaluation, not a SillyTavern browser
run. The 1M and 10M buckets are reported separately below; 500K and an exhaustive
fact-level error census remain untested.

## Remaining failure types (summary updated 2026-10-20)

**Model scope: Small.** This summary draws on the completed 200-question BEAM 10M
comparison of original-text retrieval and role/date `retrievalText`, both using
managed OpenAI Small. It organizes existing evidence into five failure types;
it is not a new run or an exhaustive classification of every wrong answer.

| Failure type | Observed problem | What remains unresolved |
| --- | --- | --- |
| **1. Retrieval omission** | A needed fact never enters candidate 200. The original arm misses the specific MQTT and Redis incidents. | Recover concrete incidents and relationships without losing existing facts. Reranking or a larger prompt cannot recover facts absent from the candidates. |
| **2. Reranking loss** | A retrieved source reaches candidate 200 but falls outside final 50. | Keep question-relevant facts through final selection; higher message coverage alone does not prove that the required clause survives. |
| **3. Prompt-packing loss** | A source reaches final 50 but is omitted from the 4096-token memory. AWS pricing/instance count and the Udemy choice demonstrate this mechanism. | Deliver necessary facts within the budget. Blanket budget expansion has not established a general remedy. |
| **4. Answer use or interpretation error** | Delivered facts are ignored, competing dates are selected, or assistant examples/plans are treated as user experience or completed events. | Use the available facts with correct attribution, chronology and uncertainty. More retrieved sources alone do not resolve these errors. |
| **5. Reference or judging ambiguity** | Equivalent 2.6M-document answers receive different labels; a source year can conflict with the rubric year. | Separate actual answer failures from inconsistent grading or ambiguous targets. Preserve original labels and report ambiguity rather than count every low score as a confirmed model error. |

The original Small arm has **1,142 absent annotated source messages**: 1,023 are
already absent at candidate 200, 75 disappear at final 50 and 44 at packing.
These count **source annotations, not wrong answers or missing necessary facts**.
An alternative message may still supply the fact. Of the selected 69 answer pairs
reviewed, 27 show changed answer use/provenance/sequence and 41 have judge/reference
ambiguity; these overlapping labels are not all-200 error rates. See the
[detailed failure-stage analysis](#offline-10m-failure-stage-attribution-2026-10-19).

**Current status:** retain Small. The later [Small/Large 40-question screen](beam-large-embedding-evaluation.md)
found concrete gains and losses and deferred Large adoption. It generated no new
answers or judgments, so it adds retrieval/delivery evidence, **not a Large-answer
error classification**. No fix covering all five failure types has been validated;
these remain unresolved quality categories.

## Frozen policy and scoring

These are the initial 128K baseline controls. Later sections explicitly identify
role/batch-date reranking and display changes; the 1M and 10M runs inherit that
benchmark adapter. They do not retroactively change the initial text-only control.

- Managed OpenAI Small embeds original text; English Bayesian Query1, vector k 200,
  native Jev 1.13.0/default criteria/text field, candidate 200/final 50, strong reads.
- Product 800-character boundary-aware chunks, overlap/source assembly and quoted
  chronological archive; 4096 memory tokens including framing/guidance. Retain four
  original recent messages plus the probe. Each probe starts from identical history.
- Generator: `gpt-6.1-sol`, low reasoning, 4096 output cap, nonstreaming, product
  memory guidance and a neutral history-answering system message. This is our
  memory policy, not the paper's generation configuration.
- Reference judge: `gpt-4.1-mini-2025-04-14`, temperature 0, exact upstream rubric
  prompt and 0/0.5/1 credit. That prompt does not separately include the question.
- Preserve upstream newline splitting, greedy first-unmatched semantic alignment
  and Kendall tau. The [reporting script](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/evaluation/report_results.py)
  substitutes normalized event-ordering tau for that category's rubric mean.
  Report both aggregates; neither is a pass rate or LongMemEval answer accuracy.

References never enter runtime. Do not invent message dates, change judge labels,
select favorable repeats or confuse structural message-span coverage with verified
necessary-fact recall. LongMemEval's adopted Jev Yes/No policy remains separate.

## Full baseline results

**Mixed mean 71.92/100; uniform rubric mean 76.66/100.** All 400 included: 230 full,
133 partial and 37 zero rubric scores. Event-ordering tau is 24.25/100, explaining
the lower mixed aggregate. Rubric compliance and event alignment measure different
behavior; neither establishes independently calibrated answer correctness.

| Ability | Questions | Rubric mean /100 |
| --- | ---: | ---: |
| Abstention | 40 | 97.50 |
| Information extraction | 40 | 90.42 |
| Preference following | 40 | 88.13 |
| Contradiction resolution | 40 | 79.06 |
| Knowledge update | 40 | 77.50 |
| Instruction following | 40 | 72.50 |
| Event ordering | 40 | 71.70 |
| Multi-session reasoning | 40 | 71.64 |
| Temporal reasoning | 40 | 67.50 |
| Summarization | 40 | 50.71 |

Mean generation input: 6,024.57 tokens. Query median/p95: 1.381/1.706 seconds;
generation: 4.922/19.950; per-case sum: 6.266/21.355. These exclude import, packing,
queue waits and judging; they are not browser latency or time to first token.
Generation estimate: $7.025; judging/alignment: $0.692; initial write/managed
embedding: $0.0677. Native rerank billed tokens and physical GB-hours are unknown.
All cost figures use recorded usage/frozen gross rates, not invoices; do not add
direct-provider inference charges to LambdaDB LIU charges.

## Follow-up: source-stage audit (2026-10-18)

Four diagnostic questions trace unchanged final 50, reranked 200, fused 200 and
component top 200 results without new generation. Some required facts already in
fused 200 are demoted by reranking; others miss both components, are omitted by
packing, or reach generation but are unused. Recurring assistant plans can crowd
out personal facts. Repeated queries differ, so fresh ranks do not prove original
candidate membership. Neither blanket candidate expansion nor a larger token
budget addresses every mechanism. Preserve the evaluator's target/alignment
ambiguities separately from memory failures. No product change follows this audit.

## Fixed-answer Jev judge comparison (2026-10-18)

**Do not replace the BEAM judge with this adapter.** Choice maps original rubrics
to 1/0.5/0; Noul>=0.50 supplies event alignment, preserving upstream matching.
The partial-credit control fails. Three full 400 passes give mixed 64.41/64.18/64.39
and rubric 66.54/66.22/66.45. On identical inputs, 26/1,051 criterion labels and
25/400 question averages vary. Low cost and similar aggregate repeats do not
establish correctness or determinism. First-pass estimate: $0.05892. No retrieval
or generation changes; retain these labels as diagnostic evidence only.

## Fixed-answer Sol-medium judge comparison (2026-10-18)

**Keep as a second opinion.** Original prompts/scale with medium reasoning and no
temperature yield full 400 mixed 70.08, rubric 71.92; estimate: $4.079. Controls and
several inspected judgments improve, but 4/40 preselected question averages vary
across three calls. Missing question context and debatable rubric interpretation
remain. No independently calibrated judge-accuracy claim or primary replacement.

## Fixed-answer Luna-medium judge comparison (2026-10-18)

**End the model grid without replacement.** Same saved answers and Sol protocol,
changing only model to `gpt-6-luna`: full 400 mixed 70.86, rubric 72.33; estimate: $0.251.
Controls pass, but 10/40 repeated question averages vary versus Sol's 4/40.
GPT-4.1-mini has no matched repeats; this does not establish its superiority.
A future judge change needs a defined task-context protocol and independent
calibration, not selection by aggregate score. No memory-quality change occurred.

## Evidence-oriented reranking criteria (2026-10-18)

**Keep native default criteria.** Five evidence/provenance-oriented instructions
improve some source delivery but do not establish net benefit. Freshly paired
40-case mixed 79.85→72.72; rubric 84.79→75.63; complete injected annotations 38→45/95.
Personal-history gains coexist with personalization loss and inconsistent judging.
The selected five diagnostic cases improve 23→48 rubric, not representative quality.
Exact instructions and source reviews are archived; no runtime/default promotion.

## Speaker role in native reranking (2026-10-18)

**Retain as a promising candidate.** `fields:['text']` versus `['role','text']`,
with explicit `role:keyword` schema in both arms, gives fresh 40-case mixed
74.01→75.02 and rubric 78.38→80.42; event tau 27.19→19.80, complete annotations 37→39/95.
Measured gains deserve further comparison, despite source tradeoffs and judge
artifacts. The earlier blanket recommendation against expansion was too strong.
No default promotion; the user-requested date screen below follows this trial.

## Batch-reference dates in reranking and generation (2026-10-19)

**Full-cohort evidence; subsequent semantic adoption is separate.** BEAM supplies a batch
reference date, not each message's send time or every event's date. Map original
batch membership to chunk metadata; explicit event dates remain authoritative.
The [generation prompt](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/prompts.py)
and source inspection support this distinction. Do not label the anchor `sent`.

The earlier 45-question screen compared role, role+date and date display. Its fixed
40 mixed means were 71.27/71.52/73.59, with five diagnostic rubric means 34/24/20.
That screen justified the completed full comparison below, not default adoption.

All 400 questions now have fresh paired retrieval, generation and judging:

- **Default:** rerank `['text']`; original generation rendering.
- **Candidate:** rerank `['role','batch_time_context','text']`; metadata says
  `Conversation batch reference date: YYYY-MM-DD. This is not a message send time
  or an event date.` Display `batch_time_anchor` with interpretation guidance,
  include date in grouping identity and repack under the same 4096 budget.

Both arms share an enriched schema/collection and unchanged embedding text, query,
models, criteria and recent dialogue; recent messages receive no added anchors.
This tests the combined reranking/display policy, not isolated date effects or
identical selected passages. The complete 200-candidate ID sets are not exposed.

| Full paired 400 | Default | Candidate |
| --- | ---: | ---: |
| Mixed mean /100 | 71.55 | 72.17 |
| Uniform rubric /100 | 76.64 | 77.41 |
| Event tau /100 | 22.36 | 21.91 |
| Complete returned annotations /1,094 | 435 | 455 |
| Complete/partial/absent delivered annotations /1,094 | 377/115/600 | 395/116/581 |
| Native-recent annotations /1,094 | 2 | 2 |
| Mean selected chunks | 27.10 | 25.46 |

Rubric labels improve in 56 questions, decline in 50 and tie in 294. The prior 45
screen questions score 71.30→73.67 uniform rubric; the remaining 355 score
77.32→77.88. Neither group is unseen: historical baseline answers existed for all.
The mixed gain is +0.62 points; a 10,000-replicate paired conversation bootstrap
gives a descriptive 95% interval of -1.43 to +2.56. It measures corpus sampling,
not judge validity or inference-repeat uncertainty. Annotation coverage is not
necessary-fact recall; preserve raw labels without a corrected score.

Source inspection finds a real date-format gain: a scheduling-format preference
enters the candidate prompt, with batch context supporting the event year. But a
98%-accuracy target is returned in both arms and lost during candidate packing.
Some already-delivered facts are used better; several large label changes are
judge errors, including identical answers receiving different credit and 19 movies
being accepted for a 13-movie target. Thirty selected answer pairs and all 25
changed event-alignment mappings were inspected; this is not an exhaustive fact
audit or independent calibration. BEAM batch anchors also do not validate a host
message-send-time deployment. The trial recommendation was to defer promotion
on score alone. The subsequent [product decision](conversation-time.md) exposes
source role and verified host-time meaning to Jev without changing existing
generation labels. No further grid or claim of reliable quality uplift follows.

Mean generation input: 6,023.32→6,024.09 tokens. Query median/p95: 1.338/1.652s →
1.477/1.734s; generation: 5.378/19.633s → 5.278/19.735s. These exclude queueing,
packing and judging. Generation costs about $7.029 per arm; total generation and
evaluation $15.450, initial shared write/managed embedding $0.0704. These are
frozen-rate estimates, not invoices; native rerank tokens and physical storage
remain unknown. The enriched shared schema is not a bare-product cost baseline.
All 800 queries, 800 answers, 2,102 rubric and 2,348 alignment calls complete.
One upsert 429 recovers; no completion retries. All 20 collections deleted/404.

## Fixed retrieval, 4096 versus 8192 memory tokens (2026-10-19)

**Retain the 4096-token default.** Reuse the preceding role/date candidate's exact
top 50 results for all 400 questions, changing only the memory budget. Both arms
generate and judge fresh answers; the 4096 inputs reproduce the parent exactly.
Ranking, source metadata, recent dialogue, models, guidance and output cap stay
fixed. No new LambdaDB calls occur. This is independent memory evaluation, not a
SillyTavern run or a change to the product's budget limit.

| Full paired 400 | 4096 | 8192 |
| --- | ---: | ---: |
| Mixed mean /100 | 72.67 | 72.20 |
| Uniform rubric /100 | 78.34 | 77.38 |
| Event tau /100 | 22.35 | 23.85 |
| Complete delivered annotations /1,094 | 395 | 451 |
| Mean selected chunks | 25.46 | 47.83 |
| Mean generation input tokens | 6,024 | 9,537 |
| Generation median / p95 seconds | 4.61 / 17.17 | 4.78 / 18.78 |
| 400-generation estimated USD | 7.01 | 10.58 |

Labels improve in 50 questions, decline in 62 and tie in 288. The mixed difference
is -0.47 points, with a descriptive conversation-bootstrap 95% interval of
-2.43 to +1.52. Neither score is a pass rate. Additional source-span coverage in
66 questions establishes delivery gains, not necessary-fact recall or answer
improvement. At 8192, 251 questions fit all 50 chunks; one other question loses a
short previously selected chunk, without losing any annotated-message coverage.

Inspection confirms useful recoveries: the September 98% target, a date-format
preference and reasons for a book choice enter the larger prompt and answer.
But changed event interpretation and substantial judge inconsistencies remain:
equivalent dates receive different credit, 19 movies is credited for 13, and one
score contradicts its own rationale. Eleven prespecified rubric pairs and three
largest event-metric movements were inspected without relabeling. The previous
identical 4096 input run scored 77.41 rubric; the fresh reference scores 78.34.
Thus this does not establish that more context harms answers. It establishes
additional delivery without demonstrated aggregate answer benefit, at about 51%
higher generation cost. Do not promote 8192 or reopen the judge-model grid on
these results alone.

All 800 answers, 2,102 rubric calls and 2,375 event-equivalence calls complete
without errors or retries. Request/source bindings and upstream metrics verify;
380 unit tests and runtime/release checks pass. Costs use recorded usage and the
frozen rate card, not invoices; latency excludes queueing, packing and search.
Search cost is unchanged, not zero in production. The local-only
`beam-budget4096-8192-v1` bundle retains the plan, raw responses, source review,
costs, verification and restoration instructions; product defaults are unchanged.

## Message-diverse selection: offline gate (2026-10-19)

**Keep ranked selection; do not adopt unconditional message rounds.** Reuse the
same saved top 50 and 4096 budget for all 400 questions. Change only admission
order: each original message contributes its highest-ranked chunk, then its next
chunk in subsequent rounds. Preserve source validation, assembly, chronological
rendering, framing and recent dialogue. All 400 baseline outputs reproduce exactly.
This is message diversity, not semantic deduplication.

| Offline delivery metric | Ranked | Message rounds |
| --- | ---: | ---: |
| Mean distinct messages | 18.26 | 24.38 |
| Mean selected chunks | 25.46 | 25.14 |
| Complete / partial / absent annotations | 395 / 116 / 581 | 402 / 152 / 538 |
| Mean memory tokens | 4067.18 | 4066.44 |

Two further annotations remain in native recent dialogue, for 1094 total.
Annotated non-whitespace source coverage gains only in 21 questions, loses only
in 29, changes both ways in 14 and is unchanged in 336. These are not answer
wins/losses or necessary-fact recall. Selection changes in 383 questions.

Nine cases were inspected: the three largest net span gains/losses and three
previous budget-loss discoveries. Date-format preference, the September 98%
target and May 15 filing date enter the candidate memory. But source rank 4's
capped-backoff instruction and rank 3's compliance-checklist instruction disappear
in other questions. Separate messages still repeat generic advice. Conversely,
large span loss in the mentor-call case leaves most requested facts in a retained
user message; character coverage alone overstates that loss. The book-choice
reasons remain missing. This selective source audit does not establish an answer
score or a new legal/technical advice assessment.

One message can contain several necessary facts; different messages can repeat
the same content. The unconditional rule therefore fails the offline promotion
gate. Stop without paid generation/judging; no answer-level effect is measured.
No product changes, new remote calls or collections. Budget/chronology/source
hash checks pass. The local-only `beam-message-diversity-v1` bundle preserves
all 400 selections, changed spans, reviewed excerpts and reproduction instructions.

## Full 1M baseline (2026-10-19)

Run all **35 conversations / 700 probes** in pinned `chats/1M`, without tuning or
variants. Keep Small managed embeddings, English Bayesian Query1, k 200, native
Jev 1.13.0 candidate 200/final 50, strong reads, ranked 4096-token assembly and
four recent original messages plus the probe. Use the latest 128K role/batch-date
rerank and display adapter, Sol low generation, and original GPT-4.1-mini rubric
and event alignment. This is an independent memory run, not a browser test.

Histories contain 795,979–1,016,246 cl100k tokens (median 981,578), totaling
33,261,995 tokens and 255,192 indexed chunks. Chats 5 and 26 reuse 190 original
message IDs. Preserve every message and index/date-map by position; report the
26 ambiguous annotation references separately rather than choose an occurrence.
The preflight correction preceded all paid calls; source bytes/rubrics are intact.

**Mixed mean 68.13/100; uniform rubric mean 71.91/100; event tau 26.08/100.**
There are 346 full-credit, 277 partial and 77 zero-credit rubric results. These
are partial-credit metrics, not pass rates. The latest 128K/4096 arm scored
72.67 mixed and 78.34 rubric. The cohorts have different conversations/questions:
the lower 1M aggregates do not isolate history length or establish a paired
regression. Instruction following and summarization are descriptively higher.

| Ability | Questions | Rubric mean /100 |
| --- | ---: | ---: |
| Abstention | 70 | 88.57 |
| Preference following | 70 | 86.79 |
| Instruction following | 70 | 83.33 |
| Information extraction | 70 | 80.65 |
| Knowledge update | 70 | 72.86 |
| Contradiction resolution | 70 | 67.14 |
| Multi-session reasoning | 70 | 65.35 |
| Event ordering | 70 | 63.95 |
| Summarization | 70 | 56.92 |
| Temporal reasoning | 70 | 53.57 |

Of 5,357 per-question source annotations, returned coverage is 801 complete,
321 partial and 4,205 absent; delivered coverage is 622 complete, 201 partial and
4,504 absent. Four remain in native recent dialogue and 26 are ambiguous. These
are message-body spans, **not necessary-fact recall**. Mean selected memory is
25.10 chunks / 19.36 messages and 4,066.91 tokens, with a 4,096 maximum.

Inspect one lowest-rubric case per ability, breaking ties by numeric chat/ID.
This selective review explains failures; it neither estimates their prevalence
nor changes labels:

- Retrieval misses: the game-component timeline's annotated sources and the
  explicit middleware-version instruction do not appear in the final 50.
- Delivery losses: the updated Lambda allocation of 384 MB is rank 33 and omitted,
  while older 512 MB is delivered. The first vector field is rank 39 and omitted;
  the eight-book example is rank 22 and omitted.
- Available evidence unused: numerical variance examples and requests for examples
  reach the prompt, but the answer asks for the problem and gives only formulas.
- Reference/judge disagreements: the Kong abstention rubric denies configuration
  information present in delivered source. The timeline rubric requires 45 days
  from original dates, while delivered, explicitly accepted revisions support
  the answer's 51 days. Some rubric judgments deny facts explicitly in answers.
  Preserve these separately from genuine memory losses, without a corrected score.

Query median/p95 is **1.530/1.852 s**; generation is **5.448/30.384 s**. Per-case
query-plus-answer sum is 7.118/32.093 s, excluding import, packing, queueing and
judging; it is not browser latency or TTFT. Mean generation input is 6,330 tokens
(p95 7,444), including recent dialogue and instructions beyond the memory budget.
Frozen-rate estimates: generation **$13.410 for 700 answers**; judging/alignment
$1.905; initial LambdaDB write/managed embedding $1.011. Query embedding and
minimum query reads add $0.00734; verification fetches add a $0.02566 minimum.
Native rerank text-volume proxies are $0.823 document-only or $0.967 with repeated
query text, not billing bounds: actual candidate tokens, metadata/protocol overhead
and physical storage GB-hours are unavailable. These are gross estimates before
free allowances, not invoices or a precise total price.

All 700 answers, 2,415 rubric calls and 5,651 event comparisons complete without
generation/judge errors, retries or truncations. One initial upsert 429 recovers;
all 35 owned collections are deleted with 404 verification. All request/source,
packing/final-input bindings, phase hashes and upstream score reconstruction pass.
`npm test` passes 380 tests; runtime syntax, release metadata and locked SDK checks
pass. No new browser validation is claimed for this experiment-only addition.
**Close this scale baseline and keep current defaults.** Future candidates must
target verified retrieval/delivery failures separately from evaluator ambiguity;
this run does not justify another model grid or blanket budget increase. The
local-only `beam1m-current-v1` bundle retains exact sources, receipts, runtime,
rate card, ten-case review and restoration instructions.

## Full 10M baseline (2026-10-19)

All **10 conversations / 200 probes** in pinned `chats/10M` complete under the
same Small/Query1/k200/Jev200/final50/ranked4096 policy, recent dialogue, Sol low
and original GPT-4.1-mini rubric/event alignment. **500K remains excluded**;
this is not the full 2,000-question BEAM evaluation. Source histories total
96,139,143 cl100k tokens and 702,393 indexed chunks. Preserve original order,
roles, bytes and unique source IDs. Omit dates for one unanchored 244-message
batch; exclude the one non-ID `--` annotation from structural coverage only.
Batch anchors are neither message-send nor event dates.

| Frozen current-policy cohort | Questions | Mixed /100 | Rubric /100 | Event tau /100 |
| --- | ---: | ---: | ---: | ---: |
| Latest 128K, 4096 arm | 400 | 72.67 | 78.34 | 22.35 |
| 1M | 700 | 68.13 | 71.91 | 26.08 |
| 10M | 200 | **59.54** | **61.93** | **25.97** |

These partial-credit metrics are not pass rates. Different bucket cohorts do not
isolate a causal length effect. The 10M rubric gives 88 full, 69 partial and
43 zero-credit answers. Of 1,325 distinct per-question integer source references
across 176 probes, final50 coverage is 194 complete / 36 partial / 1,095 absent;
actual delivery is 159 / 28 / 1,138. This is not necessary-fact recall. Selected
memory averages 4,066.91 tokens within the 4,096 limit.

Ten source-reviewed failures distinguish broad timeline/summary retrieval misses,
packing loss of AWS pricing and Elasticsearch counts, competing Milvus versions,
and reference ambiguity such as a five-problem target mistaken for completion.
No labels are corrected. Query median/p95 is 1.659/1.979 s; generation is
6.531/22.998 s. These exclude import/packing/queueing and are not host latency.
Frozen gross estimates separate $3.718 generation, $0.496 judging/alignment and
$2.894 initial write/managed embedding. Native rerank and storage costs remain
incomplete proxies, not an invoice.

All 200 answers, 621 rubric calls and 2,466 event comparisons finish without
completion errors, retries or truncation. One upsert 429 recovers; all ten owned
collections are deleted with 404 confirmation. Source/query/packing/phase-lock
and upstream scoring checks pass; 380 unit tests, syntax, release metadata and
locked SDK checks pass. **Close the baseline with defaults unchanged.** The
local-only `beam10m-current-v1` bundle preserves complete results, per-ability
scores, source review, costs, receipts and restoration instructions. The original
detailed baseline section is also preserved in the full-cohort comparison bundle.

## Full 10M retrieval representation comparison (2026-10-19)

**Defer default adoption.** All 200 questions compare original text with one full
role/batch-date retrieval representation, including the explicit disclaimer that
the date is neither a send time nor an event date. Only English full-text and
managed embedding input change; original text, metadata, rerank fields, recent
context and generation instructions stay fixed. The compact variant is excluded.
Managed OpenAI Small, Bayesian Query 1 k 200, native Jev 1.13.0 candidate 200,
final 50 and 4,096-token injection remain fixed across 702,393 chunks.

Live retrieval completes 800 queries. Complete/partial/absent source-message
coverage changes from 260/42/1,023 to 253/58/1,014 at candidate 200,
193/34/1,098 to 192/52/1,081 at final 50, and **154/29/1,142 to
156/40/1,129 at delivery**. Outside the two discovery questions, delivered
complete coverage stays 153 while partial rises 29 to 40. Overall, 54 absent
references become available and 41 existing references disappear. These sparse
annotations are not exhaustive necessary-fact recall. All 79 changed-coverage
questions were source reviewed; concrete gains admitted the conditional answer run.

Both arms then generate 200 fresh answers using unchanged original generation,
rubric and event-equivalence settings. Scores are on a 0–100 partial-credit scale:

| Cohort | Rubric: original → candidate | Mixed: original → candidate | Event tau: original → candidate |
| --- | --- | --- | --- |
| All 200 | 62.52 → 63.75 | 59.85 → 60.03 | 26.25 → 24.86 |
| Other 198 | 63.05 → 64.09 | 60.10 → 60.18 | 26.81 → 24.61 |
| Diagnostic 2 | 10.00 → 30.00 | 12.76 → 24.80 | 15.52 → 29.60 |

The diagnostic mixed score covers only two abilities and tau one question. The
other 198 are not entirely unseen. Overall rubric gains/losses/ties are 34/29/137;
full-credit answers fall 93 to 89. A ten-conversation bootstrap (10,000 replicates)
gives other-198 rubric delta +1.04 points, 95% interval **−3.40 to +5.70**,
conditional on this one provider realization. No reliable general benefit is shown.

Manual answer review covers all 63 unequal-rubric pairs, three prespecified source
losses with tied scores and three subsequent tau-only changes. AWS and Udemy gains
use recovered facts; operator-theory facts and historical dates regress. Some
answers mistake assistant examples for user experience, and equivalent answers
sometimes receive inconsistent labels. Original labels remain unchanged.

Embedding input grows **22.80%** (96,124,799 to 118,041,870 tokens). Native-query
median/p95 is 1.612/1.841 s versus 1.610/1.880 s; generation 4.844/17.966 s versus
5.004/18.386 s. Concurrent requests and cache warming prevent causal latency claims.
Frozen gross proxies: retrieval $6.572791, generation $7.409480, judging $0.982110,
and aborted pre-search overhead $0.277530; combined incomplete proxy $15.241911.
These are not invoices or current prices; storage and native billing overhead are
unknown. Dual embedding fields are experimental overhead.

All 400 answers, 1,242 rubric calls and 4,746 event comparisons finish without
retry or truncation. Exact query/source, packing, scoring and phase-lock replay
pass. All ten trial collections and four aborted-attempt collections are deleted
and confirmed 404. The abort rejected whitespace-only text before retrieval; the
final run preserves every chunk. Existing evidence remains intact. The bounded
trial is closed with defaults unchanged; no extra model or phrase search follows.

## Offline 10M failure-stage attribution (2026-10-19)

Reanalyze the saved paired run without provider calls or new answers. Of the
original arm's 1,142 absent annotated source messages, 1,023 are already absent
at candidate 200, 75 disappear at final 50 and 44 at 4096 packing. The candidate
counts are 1,014/67/48. Of 41 newly lost delivered references, 27 disappear before
candidate 200, two at final 50 and 12 at packing. These are message annotations,
not counts of missing necessary facts or actual answer errors.

The 79 source reviews and 69 answer reviews distinguish concrete facts from
source IDs. Explicit overlapping codes find availability gains in 26 reviewed
pairs, losses in 16, changed answer use/provenance/sequence in 27, and judge or
reference ambiguity in 41. Sixteen have only the ambiguity label. This selected
sample is not an all-200 error-rate estimate; labels and scores remain unchanged.

Thirteen source-bound factual witnesses from 12 questions pass independent
original-span checks. AWS pricing and Udemy preference already reached original
candidate200/final50 but were unpacked; their gain is improved delivery. MQTT and
Redis enter candidate200 anew. The Corolla clause disappears while another chunk
of the same assistant message remains, demonstrating why message presence alone
cannot establish fact coverage. A November 7 statement remains delivered despite
the candidate answer choosing competing dates; its assistant-plan provenance
still does not establish an actual completed event.

The future hypothesis selected at PR #84 closure was managed Small→Large on
original text, targeting candidate-200 concrete-incident recall. It was unexecuted
in that PR; the earlier LongMemEval 463→465 result did not justify its higher cost.
The local follow-up bundle preserves the proposed 40/160 cohorts and fact gates
for a later bounded decision. The [subsequent screen](beam-large-embedding-evaluation.md)
reports that later run separately; this historical analysis adds no provider,
browser or quality result.

Separately, the approved PR review fix generalizes product guidance from
`today/yesterday` to `relative dates`, covering tomorrow too. Stored benchmark
prompts keep the original wording; existing 10M results do not validate this new
wording's model behavior. Retrieval defaults and all resource limits stay unchanged.

## Validation and evidence retention

Initial quality screens use 5 diagnostics + 40 fixed comparisons; the final date
comparison uses all 400. Preserve English, source validation, isolation and budget
checks. Repeatedly inspected cohorts are
not unseen confirmation. Only within-run paired scores estimate treatment effects;
fresh baselines vary with retrieval, generation and judging. Judge comparisons
instead reuse fixed answers. Unit/emulator checks do not establish live quality.

All owned collections from these runs are deleted with 404 checks. Original-input
replay, request/source bindings, 4096 packing and upstream score reconstruction
pass. At those recorded run revisions, `npm test`: 380, `npm run check`, `npm run check:release`, `npm run check:sdk`
and script/test syntax pass; no browser rerun for these experiment-only changes.

All bundles below are **local-only**, unavailable in a fresh clone. Paths are
`artifacts/archive/<name>.tar.gz`; exact hashes retain provenance, not a download
promise. Original bundles remain unchanged. The detail bundle preserves the entire
775-line report before condensation, including all costs, case interpretations,
producer revisions, dependency paths and offline restoration commands.

| Bundle name | SHA-256 |
| --- | --- |
| `beam128k-current-v1` | `4475551abc48c906aad589e3f75d63fa4b26491188694b74a7d509e4c6e95587` |
| `beam-stage-audit-v2` | `17fb345023e9659ba0de4da7e21e8e197695b435f60fd9cc0027a4a3ce003b7f` |
| `beam-jev-judge-v1` | `cc9aa1738f1a56a1dd315dba677d406a41f50d67d964c2c7573f064247330f0b` |
| `beam-sol-judge-v1` | `0c2fb8121adf8baf05154c58e8ac96e20cb3c0369d518cb65b61d1034e2ab1b8` |
| `beam-luna-judge-v1` | `6f638f7f136072583f54d967ccb0318974accde5cae9393ad341d5bf4d459562` |
| `beam-evidence-criteria-v1` | `f67cf6f3108b818974f319fa9ac322dca57a10b7b4946076e97c9b5bf470e9a3` |
| `beam-role-rerank-v2` | `f9edd7b5d335cfa19c6a3f9de8664ceaf6d37556a8066e7a966c419404fd01ad` |
| `beam-anchor-v1` | `72f9bafb07c7aa4081f5a41643c9364e4bf35fe5cc5df9bc2411840b931b62b4` |
| `beam-evaluation-detail-v1` | `f7f74d64059f78190145a4b844770a8daa422c7f775ca0945d27293ad77c3003` |
| `beam-anchor-full-v1` | `217c769b5a1fa18f0081fa37bb8eba6cfd94f61e2c58d31f02603e160f0600a4` |
| `beam-budget4096-8192-v1` | `06980646a852a074128479ed030e72db4648f697e14336c763e960cc0b352993` |
| `beam-message-diversity-v1` | `8ec2e9210e89a574d63880d8c931a5a1400677ac1254ddea144876ac88ef304f` |
| `beam1m-current-v1` | `0c72b49c2afd353f471d45892b7282561755755dd4a6270e346c68b8c6cbaa3f` |
| `beam10m-current-v1` | `1c16bb89318225721e6ee0a7f0bb906877866a0f3265ab0e0b2eed50fb38334c` |
| `beam10m-index-context-full-v1` (aborted before search) | `1c2ff5e07c3e65ff7895669fd9e54268207b9daad3f0555d31f2e4e641bbab7c` |
| `beam10m-index-context-full-v2` | `c3047e6176f91f9ec0ab74d4765a93db63a1ad142aca52a5bcd0a24542513154` |
| `beam10m-failure-stage-v1` | `8d328e76be57a62df7b061e0d80adb10c3b07f3268f930231d499ed493726ecc` |

The offline failure-stage bundle has 21 verified members (53,815 bytes), produced
at `524dd735bc5dfca44f12cfeab71da6f606d12a10` plus its recorded product patch.
Configured-secret scan and full member readback pass. Its `RESTORE.md` requires
the unchanged full-v2 and baseline bundles; no provider calls are needed. It
preserves the explicit review coding, original-span checks and unexecuted next
hypothesis, separately from the completed full-cohort live comparison.

The full 10M comparison bundle has 14,999 verified members (77,453,845 bytes),
produced at `c0b9153779e7a1f66ac5f669741702ef3d19067a`. Configured-secret scan and
full member readback pass. Restore under `artifacts/` and follow its `RESTORE.md`,
including the unchanged baseline dependency. `RESULTS.md`, source/answer reviews,
all receipts and phase locks preserve the complete decision. The prior 527-line
maintained report is retained byte-for-byte. The aborted bundle contains its
pre-search failure, costs and four verified deletions; it is not a quality result.

The original 10M baseline bundle has 7,523 verified members (313,271,263 bytes), produced at
`7aa1831356fc26911ba061a8aecd203a4931d106`. Configured-secret scanning and full
member readback pass. Restore under `artifacts/` and follow
`beam10m-current-v1/RESTORE.md`; sources, phase locks, runtime and all first-success
receipts are preserved for offline review. No original evidence was deleted.

The 1M bundle has 20,602 verified members (182,827,887 bytes), produced at
`ba19e1a45a03c20d5c568e96578d8c51a67dfa42`. Configured-secret scanning and full
member readback pass. Restore under `artifacts/` and follow
`beam1m-current-v1/RESTORE.md`; its original raw source bytes, phase locks and
runtime snapshot support offline verification without new provider calls.

The full paired bundle contains 13,871 verified members (68,797,556 bytes), produced
at `ea46b6566a46c82ebe670851c2b1a7a8e05a92e7`. Restore it under `artifacts/` and read
`beam-anchor-full-v1/RESTORE.md`: offline replay also needs the original baseline,
anchor-screen and recorded rate-card dependencies. Its `RESULTS.md`, phase locks,
raw receipts and selective review notes preserve the decision and its limits.
The prior 199-line report is retained byte-for-byte in that bundle.

The detail archive is 20,275 bytes with 2 members, copied from commit
`78054bb36524f7db8e853e953bcbf8f5a0821e0a` before removing tracked detail. Full
member readback verifies identical bytes. Restore it under `artifacts/` and read
`beam-evaluation-detail-v1/beam-evaluation-before-condensation.md` for each run's
producer and dependency instructions. The source and all run archives have verified
hashes; original secret-scan/readback receipts remain with the runs. Never rerun paid
producers just to inspect results. Follow the [retention policy](../CONTRIBUTING.md#experiment-lifecycle-and-retention).
