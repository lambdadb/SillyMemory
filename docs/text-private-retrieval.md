# Text-private retrieval evaluation

## Decision: adopt

**Adopt the text-private mode design.** This is the adoption decision for the
product question below, not an intermediate diagnosis. Implementation is a
separate follow-up change.

- **Embedding:** the user connects any OpenAI-compatible `/v1/embeddings`
  endpoint and picks a provider when enabling the mode. There is no zero-setup
  default.
- **Search:** dense KNN only. Raw text is not sent to or stored in LambdaDB; the
  client restores the text of returned chunks from the local chat.
- **Known cost:** rerank is not available in this mode. Answers were 476/500 for
  the rerank default (A, same day) versus 457 for OpenAI small (K), 472 for
  Qwen3-Embedding-0.6B (Q3) and 468 for EmbeddingGemma (G).
- **Deferred:** client-side sparse/BM25. It reproduces server BM25 but did not
  help OpenAI small (C below K). Its evaluation code and results are kept.
- **Recommended models, each validated on English LongMemEval-S only** (no
  multilingual quality claim):
  - Remote: OpenAI `text-embedding-3-small`.
  - Local server (Ollama default tags): `qwen3-embedding:0.6b`, with
    `embeddinggemma` as a lighter alternative. Their model-card prompt prefixes
    must be applied client-side, because Ollama adds none.
- **Not recommended:** the transformers.js Qwen3 q8 ONNX port (broken, see
  [parity](#local-multilingual-candidates-retrieval-only)), multilingual-e5-small
  (weak, arm M) and English-only models such as bge-small-en (references only).
- **Not performed** (not required for this decision): a same-day K rerun,
  multilingual quality evaluation, live LambdaDB ANN on large collections and
  browser WASM embedding speed.
- **LambdaDB validation gaps** (recorded, handled separately in LambdaDB): a sparse
  query weight of `0` returns HTTP 500, and 4,095/4,096 query terms return HTTP 500
  while 3,000 succeed. See [Stage 2](#stage-2-live-contract-smoke-project-stest).

## Results summary

Evaluated November 9–10, 2026, on LongMemEval-S (500 questions, English).

| Arm (no stored text unless noted) | Delivered complete | Answers (Jev ≥0.50) |
| --- | ---: | ---: |
| A: current default, stores text, Jev rerank (same day / Oct 22) | 98.10% / 98.43% | 476 / 480 |
| B: stores text, server hybrid, no rerank | 93.40% | 455 |
| **K: client OpenAI small, dense KNN** | **95.30%** | **457** |
| D: local bge-small-en + client sparse (English-only diagnostic) | 92.39% | 458 |
| M: local multilingual-e5-small q8, dense KNN | 84.45% | 427 |
| Q3: local qwen3-embedding:0.6b (Ollama), dense KNN (Nov 10) | 95.64% | 472 |
| G: local embeddinggemma (Ollama), dense KNN (Nov 10) | 95.41% | 468 |

Evidence: K, D and B have equal answer quality (457/458/455,
within noise), and K has the best retrieval among the arms without rerank.
Client sparse hurt OpenAI small (C below K) and helped only the weak bge-small
(D above E). The ~4–5 point loss versus A is attributed to the missing rerank,
which text-private mode cannot use. The multilingual local model tested on November 9 (M)
lost about 6 more points on English.

**Update (November 10):** three larger local multilingual models
served through Ollama reach K's retrieval level on the full English set. Delivered
complete was 95.64% for Qwen3-Embedding-0.6B, 95.41% for EmbeddingGemma 300M and
94.97% for BGE-M3, against 95.30% for K. All three pass the pre-registered ≥ 93.30%
criterion. Answers for Qwen3 and Gemma (approved afterwards) were 472/500 and 468/500,
versus 457/500 for K, at least K-level. These are English-only results, and multilingual
quality is not measured. See [Local multilingual candidates](#local-multilingual-candidates-retrieval-only).

## Product question

Some users object to raw chat text being stored in LambdaDB. A text-private mode
keeps LambdaDB mandatory but stores only client-computed vectors, filter metadata
and source coordinates (message, chunk, `[start, end)`). The client restores the
text of returned chunks from the local chat. Native embedding (`sourceField: text`)
and server reranking both need stored text, so neither is available in this mode.
Server BM25 can only be replaced by a client-computed `sparseVector` field.

## Arms

All arms use the frozen LongMemEval-S protocol: pinned dataset, product chunking,
the Query 1 role-labelled question, the recent-five window and 4,096-token
packing (`benchmark/longmemeval/config.json`). Current code reproduces all 500
historical arm-A generation requests byte-for-byte.

| Arm | Stores text | Dense | Lexical | Fusion / rerank |
| --- | --- | --- | --- | --- |
| A | yes | managed OpenAI small (`queryText`) | server BM25 | Bayesian, Jev 1.13.0 rerank 200→50 (current default) |
| B | yes | managed OpenAI small | server BM25 | Bayesian, candidateSize 200, no rerank |
| F | yes | managed OpenAI small | – | KNN k200, top 50 |
| L | yes | – | server BM25 | top 50 (lexical leg only) |
| C | no | client OpenAI small (`queryVector`) | client sparse BM25 | Bayesian, candidateSize 200 |
| K | no | client OpenAI small | – | KNN k200, top 50 |
| D | no | local bge-small-en-v1.5 (English-only) | client sparse BM25 | Bayesian, candidateSize 200 |
| E | no | local bge-small-en-v1.5 (English-only) | – | KNN k200, top 50 |
| S | no | – | client sparse BM25 | top 50 (lexical leg only) |
| M | no | local multilingual-e5-small | – | exact KNN top 50 (computed locally; see below) |

"A-historical" is the October 22 run (480/500). "A" is a same-day retrieval with
the same query, run against today's native collection.

## Client-side English analyzer and sparse BM25

`benchmark/text-private/analyzer.mjs` approximates Lucene 10.4.0 `new EnglishAnalyzer()`
(the server's `english` analyzer). The chain is verified from the Lucene source:
StandardTokenizer → EnglishPossessiveFilter → LowerCaseFilter →
StopFilter(33-word `ENGLISH_STOP_WORDS_SET`) → PorterStemFilter. The JS port uses
`Intl.Segmenter` word segments (UAX #29) and a direct port of Lucene's
`PorterStemmer`.

Document weights are BM25 TF terms, `tf·(k1+1)/(tf + k1·(1−b+b·len/avglen))` with
k1 = 1.2 and b = 0.75, keyed by the first 64 bits of HMAC-SHA256 (a random secret
per collection, term). Query weights are IDF, `ln(1+(N−df+0.5)/(df+0.5))`, computed
locally over exactly the searched range. Duplicate terms are summed and capped at 64.
Terms absent from the range are omitted. A document with no terms omits the
field, because LambdaDB rejects `{}`.

### Stage 1: offline parity (local only)

A dev-only Lucene harness (`LuceneParity.java`, run against the Lucene 10.4.0 jars)
was compared with the JS analyzer.

| Input | Texts | Exact sequence | Token multiset Jaccard |
| --- | ---: | ---: | ---: |
| LongMemEval unique chunks | 375,526 | 99.988% (375,480) | 0.999994 |
| Retrieval queries | 500 | 100% | 1.0 |
| Synthetic edge cases (contractions, possessives, numbers, URLs, emoji, hyphens, curly quotes, scripts, long tokens) | 20 | 100% | 1.0 |

**Gate: passed.** The remaining 46 mismatching chunks are all non-English:
Hangul attached to a preceding `word.` (41), Thai/Khmer dictionary segmentation
(2), and isolated symbols such as ☉ ☰ that Lucene emits as tokens (3). Two
classes found in the first pass were fixed in the port: ICU word-like
underscore-only runs, and ICU splitting of Hangul/Southeast Asian runs.

Ranking parity was measured as Lucene BM25 top 200 versus the JS sparse dot
product per question, with emulated FeatureField truncation:

| Length normalizer | Overlap@10 | Overlap@50 | Same top 1 | Evidence in top 50 (Lucene / JS) |
| --- | ---: | ---: | ---: | ---: |
| Fixed 60 (adopted) | 0.992 | 0.995 | 495 | 456 / 456 |
| Per-collection mean (Lucene equivalent) | 0.992 | 0.995 | 494 | 456 / 456 |
| Fixed 86 (mean of near-full 800-char chunks) | 0.943 | 0.973 | 468 | 456 / 453 |
| Fixed 100 (a-priori chunk-size estimate) | 0.921 | 0.964 | 448 | 456 / 453 |

FeatureField quantization did not matter (the unquantized result was within 0.001).
The fixed `avglen` did. A chunk-size-derived constant (86–100) over-normalizes
LongMemEval's mostly short messages. The adopted 60 ≈ the measured corpus mean
(58.1 terms). This is parity calibration on the evaluation corpus itself, not a
held-out choice. Roleplay chats with longer messages would have a higher
average.

### Stage 2: live contract smoke (project `stest`)

One collection with 30 synthetic documents, plus two 2-document probe collections.
All were deleted and confirmed absent (HTTP 404).

- Accepted and sensible: dense `queryVector` + `bool(filter, sparseVector)` in
  Bayesian with top-level `candidateSize`. The top hit was a sourdough document
  for a sourdough query. Owner/scope and `message` range filters isolated
  correctly. A strong read immediately after the write returned all 30 documents.
  With `includeVectors:false`, neither vectors nor sparse values are returned.
- Bayesian without `candidateSize` is rejected (400). `sparse: {}` and zero
  document weights are rejected (400). A stored weight of 1e6 scored 999,424,
  confirming FeatureField 8-bit-mantissa truncation.
- **Service validation gaps (not fixed here):** a query weight of `0` passes
  validation but returns **HTTP 500**, because Lucene requires a weight above 0.
  4,095–4,096 query terms also return **HTTP 500**, while 3,000 succeed. The
  client therefore caps queries at 3,000 terms and never sends a zero weight.

## Stage 3: LongMemEval-S retrieval and delivery

Each question was ingested into its own owned collection, once for the native
layout (A/B/F/L) and once for the text-private layout (C/D/E/K/S). Arm M was not
ingested; see below. Annotated messages are `has_answer` turns that map to chunks
by message index and UTF-16 `[start, end)`. The denominator is 894 indexed
annotated messages in 478 questions; 22 questions have no indexed annotation and
2 annotated messages fall in the recent window. "All complete" counts questions
whose every annotated message is fully covered.

| Arm | Returned any | Returned complete | Returned all-complete Qs | Evidence in top 10 | Delivered any | Delivered complete | Delivered all-complete Qs | Mean memory tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A-historical | 99.66% | 99.33% | 472 | 455 | 98.77% | 98.43% | 464 | 4,053 |
| A | 99.55% | 99.22% | 471 | 454 | 98.55% | 98.10% | 461 | 4,053 |
| B | 96.53% | 95.64% | 441 | 449 | 94.18% | 93.40% | 425 | 4,049 |
| F | 97.65% | 96.98% | 452 | 459 | 95.97% | 95.30% | 439 | 4,052 |
| L | 89.15% | 87.81% | 385 | 380 | 85.46% | 84.23% | 364 | 4,045 |
| C | 96.53% | 95.64% | 441 | 449 | 94.18% | 93.40% | 425 | 4,049 |
| K | 97.65% | 96.98% | 452 | 459 | 95.97% | 95.30% | 439 | 4,052 |
| D | 95.53% | 94.52% | 435 | 437 | 93.51% | 92.39% | 420 | 4,051 |
| E | 94.07% | 93.18% | 426 | 420 | 90.94% | 90.04% | 403 | 4,054 |
| S | 89.37% | 88.03% | 386 | 379 | 85.46% | 84.23% | 365 | 4,045 |
| M | 88.26% | 87.36% | 390 | 386 | 85.68% | 84.45% | 372 | 4,052 |

Every arm hit an answer session in its returned 50 for all 500 questions (499 for
E, 498 for M). No query needed the empty-sparse KNN fallback. The minimum sparse query had
12 terms, and 93 of 483,385 documents had no terms.

Observations (measured):

- **Client sparse BM25 reproduces server BM25.** C versus B top-50 overlap is
  0.997. Coverage is identical, and 425/500 generation requests are byte-identical.
  The sparse-only leg S matches L.
- **Hybrid fusion without rerank is worse than dense-only KNN** with OpenAI small:
  F/K beat B/C by +1.9 points of delivered complete coverage, +14 all-complete
  questions. The lexical leg alone is weak (84%).
- Sparse helped the weaker bge-small (D over E by +2.35 points), but it hurt OpenAI
  small (C below K).
- Rerank is the largest retrieval factor. A versus B: 42 questions with more
  complete delivered messages, 5 with fewer.
- **multilingual-e5-small (M) is the weakest dense arm on this English benchmark:**
  84.45% delivered complete, versus 90.04% for bge-small (E) and 95.30% for OpenAI
  small (K). Versus B, 16 questions gained complete messages and 78 lost them.
  A spot check found no pipeline error: re-embedding rows from the prefix and from
  each shard boundary matched the stored vectors (cosine ≥ 0.9995), and query rows
  carry the `query: ` prefix (1.0). A q8-versus-fp32 diagnostic (below) found no
  quantization effect on coverage.
- Client OpenAI vectors equal the managed ones. On 300 sampled chunks, the
  native-versus-client cosine had a median of 1.0000, p5 0.999996 and minimum
  0.9982. K and F returned identical results.

### Local exact KNN substitution for arm M

Dense-only KNN needs no server-side text or scoring feature, so M's top 50 was
computed locally by exact cosine over each question's indexed range. The vectors
used the same 8-significant-digit rounding that is uploaded. This substitution
was validated against live LambdaDB results before use. Local exact KNN
reproduced the live **K** results (1,536-d) and **E** results (384-d) with
**identical top-50 order on 500/500 questions** (overlap@10 and @50 both 1.0,
first-evidence rank equal on 500/500). This holds for per-chat ranges of about
1,000 chunks. It is not evidence about ANN behaviour on much larger collections,
and it applies only to dense-only arms; sparse, BM25 and rerank arms used the
live server.

### q8 versus fp32 for arm M

To separate quantization loss from model quality, the 91,507 unique texts of a
100-question subset (every 5th question in dataset file order: 27 multi-session,
27 temporal, 15 knowledge-update, 14 single-session-user, 11 single-session-assistant,
6 preference) were re-embedded with the fp32 `model.onnx`
(`precompute.mjs --dtype fp32 --name e5-fp32 --questions ...`) and ranked by the same
local exact KNN (`dtype-compare.mjs`). Retrieval only: no generation, judge, API or
LambdaDB calls. The recomputed q8 top 50 matched the stored M results on 100/100
questions.

| Subset (100 Qs, 176 indexed annotated messages) | Returned any | Returned complete | Returned all-complete Qs | Delivered any | Delivered complete | Delivered all-complete Qs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| M q8 | 92.05% | 90.91% | 82 | 89.77% | 88.07% | 78 |
| M fp32 | 92.61% | 91.48% | 84 | 89.20% | 87.50% | 77 |
| E (bge-small-en q8) | 93.75% | 93.18% | 85 | 89.77% | 89.20% | 79 |
| K (OpenAI small) | 96.59% | 95.45% | 89 | 95.45% | 94.32% | 87 |
| B (server hybrid) | 96.02% | 94.32% | 87 | 93.18% | 92.05% | 84 |

- fp32 versus q8 cosine: chunks median 0.9990, p5 0.9988, min 0.9961 (91,407
  texts); queries median 0.9991, min 0.9986.
- fp32 versus q8 top-50 overlap: @10 0.936, @50 0.943 (min 0.88); no question had
  an identical top-50 order; first-evidence rank equal on 76/100. The reordering is
  among near-tied candidates: coverage changed on 4 questions (returned complete
  +1 message net, delivered −1), and delivered all-complete differs on one question,
  where fp32 is worse.
- Truncation: 1 of 91,407 prefixed passages exceeds 512 e5 tokens (515); queries are
  at most 89. The pipeline uses the model-card `query: `/`passage: ` prefixes,
  attention-masked mean pooling and L2 normalization (checked in the transformers.js
  4.3.1 source; truncation comes from the tokenizer's `model_max_length` 512).
- fp32 throughput: 693 s wall for 91,507 texts in 3 processes × 5 intra-op threads
  (~132 texts/s combined), close to the q8 run (~140 texts/s).

**Conclusion (inference).** q8 quantization does not explain M's weak retrieval;
fp32 coverage is equal within one message. The gap is attributed to the model
itself on this English benchmark. A full-500 fp32/fp16 rerun is not warranted by
this result. Caveat: this subset is easier than the full set for M (88.07% versus
84.45% delivered complete), and its M–E gap is smaller (1.1 versus 5.6 points), so
the subset measures the paired q8/fp32 difference, not the size of M's deficit.

## Local multilingual candidates (retrieval only)

Evaluated November 9–10, 2026. The question was whether a larger local multilingual
model served through Ollama, the product's local path, reaches K-level retrieval. The
candidates were EmbeddingGemma 300M, BGE-M3 (dense output only) and
Qwen3-Embedding-0.6B. English-only models were out of scope. Retrieval and delivery
were measured only, with no generation, judge, paid API or LambdaDB calls. Each model
uses its full output dimension, with no MRL truncation. Ranking is the validated local
exact KNN described above.

**Pre-registered criteria** (fixed before any results):

- Subset screen: on the 100-question subset used for the q8/fp32 diagnostic,
  delivered complete must be no more than 2 points below K (≥ 92.32%; K = 94.32%).
- Full 500: delivered complete must be ≥ 93.30% (K's 95.30% minus 2).

Passing the subset screen is not validation, because the subset is easier than the
full set.

| Model | Ollama tag (weights) | Dim | Query prompt | Passage prompt | Pooling | Source |
| --- | --- | ---: | --- | --- | --- | --- |
| EmbeddingGemma 300M | `embeddinggemma` (BF16 GGUF, 622 MB) | 768 | `task: search result \| query: ` | `title: none \| text: ` | Mean pooling + dense projections (in the model) | Model card "Prompt Instructions" and usage example (`onnx-community/embeddinggemma-300m-ONNX`, a mirror of the gated `google/embeddinggemma-300m` card) |
| BGE-M3 | `bge-m3` (F16 GGUF, 1,158 MB) | 1024 | none | none | CLS | `BAAI/bge-m3` card (no query instruction, `dense_vecs`) and the `Xenova/bge-m3` usage (`pooling: 'cls'`) |
| Qwen3-Embedding-0.6B | `qwen3-embedding:0.6b` (Q8_0 GGUF, 639 MB) | 1024 | `Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:` | none | Last token (EOS `<\|endoftext\|>` appended) | `Qwen/Qwen3-Embedding-0.6B` card and `config_sentence_transformers.json` (`prompts.query`), with `padding_side='left'` and last-token pooling |

**Runtime.** The harness calls Ollama's OpenAI-compatible `/v1/embeddings` (Ollama
0.40.15, `--runtime ollama` in `precompute.mjs`), as the product would. Ollama's
template for all three models is `{{ .Prompt }}` (`/api/show`), so it adds no
prompt, and the prefixes are applied client-side. Its GGUF metadata sets the
expected pooling: mean for Gemma, CLS for BGE-M3 and last token for Qwen3, with
BOS/EOS added. The returned vectors were already unit-length (norms 1 ± 1e-6). The
client re-normalizes them anyway.

**Parity with the reference implementation.** As a reference, the ONNX ports
(`onnx-community/embeddinggemma-300m-ONNX`, `Xenova/bge-m3`,
`onnx-community/Qwen3-Embedding-0.6B-ONNX`) run in transformers.js 4.3.1 on the CPU.
In fp32, the ONNX ports reproduce each model card's example similarities: Gemma and
Qwen3 to 4–6 decimals, and BGE-M3 within 0.001 of BAAI's official example. The
Ollama outputs were then compared with ONNX fp32 on the first 2,000 hash-ordered
unique subset passages plus the 100 subset queries:

| Cosine to ONNX fp32 | Passages median / p5 / min | Queries median / min |
| --- | --- | --- |
| Gemma, Ollama BF16 | 0.99999 / 0.99999 / 0.985 | 0.99999 / 0.99998 |
| BGE-M3, Ollama F16 | 0.99998 / 0.9993 / 0.995 | 0.99999 / 0.9997 |
| Qwen3, Ollama Q8_0 | 0.9996 / 0.9995 / 0.9990 | 0.9997 / 0.9995 |
| Gemma, ONNX q8 | 0.992 / 0.989 / 0.980 | 0.993 / 0.989 |
| BGE-M3, ONNX q8 | 0.992 / 0.989 / 0.985 | 0.992 / 0.989 |
| **Qwen3, ONNX q8 (`model_quantized.onnx`)** | **0.816 / 0.741 / 0.594** | **0.837 / 0.726** |

For Gemma, all 91,507 subset texts were also embedded with ONNX fp32. Only 257 had a
cosine to Ollama below 0.999, mostly long numeric-table chunks. Delivered coverage was
identical on every question, and top-50 overlap was 0.997. Ollama therefore
reproduces the reference models, and its results are treated as the product-path
measurement. The transformers.js q8 port of Qwen3 is badly degraded. It must not be
used: the throughput rule below had initially selected it.

**Throughput and dtype choice** (measured on this Apple M5 Pro, not a claim about user
hardware). ONNX on CPU used 3 processes × 5 intra-op threads for 90 s probes, with
batches of 32 texts. The pre-registered rule was fp32 unless the subset would take
more than about 75 minutes. That selected fp32 for Gemma (55.9 texts/s, about 28
minutes) and BGE-M3 (22.7 texts/s, about 69 minutes). Qwen3 fp32 ran at 13.8 texts/s
(about 114 minutes), so the rule selected q8 (21.9 texts/s). Before that run started,
Ollama with Metal GPU (installed with Steven's approval) became available as the
product path, and the ONNX subset runs for BGE-M3 and Qwen3 were dropped. The broken Qwen3 q8 port was never used for a
result. Only the Gemma fp32 ONNX subset run was completed: 2,204 s wall, partly
overlapping the Ollama runs.

Ollama ran one model at a time, with one request in flight and batches of 64
length-sorted texts:

| Model | Subset (91,507 texts) wall | Texts/s | Full (376,026 texts) wall | Texts/s |
| --- | ---: | ---: | ---: | ---: |
| embeddinggemma | 1,005 s | 91 | 3,307 s | 114 |
| bge-m3 | 1,604 s | 57 | 5,752 s | 65 |
| qwen3-embedding:0.6b | 1,570 s | 58 | 6,124 s | 61 |

The subset wall times partly overlapped CPU work (the Gemma ONNX run and the parity
checks). No input was truncated. Over all 500 questions, the longest prefixed passages
were 805 (Gemma), 704 (BGE-M3) and 797 (Qwen3) tokens, against limits of 2,048 / 8,192 /
8,192. Queries were at most 110 tokens.

### Subset screen (100 questions, 176 indexed annotated messages)

| Arm | Returned any | Returned complete | Returned all-complete Qs | Delivered any | Delivered complete | Delivered all-complete Qs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| K (OpenAI small; reproduced locally, identical top 50 on 100/100) | 96.59% | 95.45% | 89 | 95.45% | **94.32%** | 87 |
| **Qwen3-Embedding-0.6B (Ollama Q8_0)** | 97.16% | 96.59% | 91 | 96.59% | **96.02%** | 90 |
| **EmbeddingGemma (Ollama BF16)** | 97.16% | 95.45% | 89 | 96.02% | **94.32%** | 87 |
| EmbeddingGemma (ONNX fp32) | 97.16% | 95.45% | 89 | 96.02% | 94.32% | 87 |
| **BGE-M3 (Ollama F16)** | 96.02% | 96.02% | 90 | 93.75% | **93.18%** | 87 |
| B (server hybrid, stores text) | 96.02% | 94.32% | 87 | 93.18% | 92.05% | 84 |
| E (bge-small-en, English-only) | 93.75% | 93.18% | 85 | 89.77% | 89.20% | 79 |
| M (multilingual-e5-small q8) | 92.05% | 90.91% | 82 | 89.77% | 88.07% | 78 |

Paired with K on delivered complete messages per question (model better / worse):
Qwen3 4/1, Gemma 1/1, BGE-M3 3/5. **All three pass the subset screen** (≥ 92.32%).
BGE-M3 returns more complete messages than K, but it delivers fewer within the
4,096-token budget. That is consistent with its evidence ranking lower in the top 50
(inference).

### Full 500 (retrieval only)

All three models passed the subset screen, so each was run on all 500 questions
(375,526 unique chunks + 500 queries) through Ollama, then ranked by the same local
exact KNN. The analysis used the same denominator of 894 indexed annotated messages
in 478 questions.

| Arm | Returned any | Returned complete | Returned all-complete Qs | Delivered any | Delivered complete | Delivered all-complete Qs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A (stores text, Jev rerank; same day) | 99.55% | 99.22% | 471 | 98.55% | 98.10% | 461 |
| **Qwen3-Embedding-0.6B (Ollama Q8_0)** | 97.54% | 97.09% | 455 | 96.31% | **95.64%** | 446 |
| **EmbeddingGemma (Ollama BF16)** | 98.21% | 97.43% | 457 | 96.31% | **95.41%** | 442 |
| K (OpenAI small, dense KNN) | 97.65% | 96.98% | 452 | 95.97% | **95.30%** | 439 |
| **BGE-M3 (Ollama F16)** | 96.87% | 96.42% | 449 | 95.64% | **94.97%** | 440 |
| B (stores text, server hybrid) | 96.53% | 95.64% | 441 | 94.18% | 93.40% | 425 |
| E (bge-small-en, English-only) | 94.07% | 93.18% | 426 | 90.94% | 90.04% | 403 |
| M (multilingual-e5-small q8) | 88.26% | 87.36% | 390 | 85.68% | 84.45% | 372 |

Paired with K on delivered complete messages per question (model better / worse):
Qwen3 15/11, Gemma 12/11, BGE-M3 17/20. All three hit an answer session in the
returned 50 for 500/500 questions.

**Outcome against the pre-registered criteria.** All three models pass the full-500
retrieval criterion (≥ 93.30% delivered complete). Qwen3 (95.64%) and Gemma (95.41%)
are at K's level (95.30%), and BGE-M3 (94.97%) is 0.33 points below it. The
per-question paired differences with K are balanced (11–20 questions each way), so
the three models and K are not distinguishable on this retrieval metric (inference).
All three are far above M (84.45%).

**Interpretation and boundaries.**

- The retrieval result alone does not measure answer quality. Answers were generated
  and judged for Qwen3 and Gemma (below). BGE-M3 was not scored.
- English LongMemEval-S only. **No multilingual quality claim follows from these
  results**, for these models or for M.
- The measurement is of model quality as served by Ollama 0.40.15's default tags
  (BF16 / F16 / Q8_0), with parity to the ONNX fp32 reference shown above. It is
  not a measurement of other GGUF quantizations, and the throughput figures are not
  claims about user hardware. Ollama ran on this machine's Metal GPU; browser
  (WASM/WebGPU) embedding was not measured.
- Vector size affects LambdaDB upload volume. By the payload model under Resources, 768
  floats (Gemma) cost about half of K's 1,536, and 1,024 floats (BGE-M3, Qwen3)
  about two thirds. This is an estimate from dimension count, not a measured
  upload.

### Answers for Qwen3 (Q3) and EmbeddingGemma (G), English only

Steven approved generation and judging for the two strongest arms, both dense-only:
Q3 is `qwen3-embedding:0.6b` (Q8_0) and G is `embeddinggemma` (BF16). Both used the
protocol of K, B, D and M. Requests were built from each model's full-500 local
exact-KNN top 50 by the same packing path (`requestFor`, 4,096-token budget). The
generator was `gpt-6.1-sol` (reasoning low) with the original task-specific rules,
and the judge was `jev-1.13.0` at Yes ≥ 0.50 (`score.py`, 3 shards per arm). Raw
probabilities are retained.

Before any paid call, the request builder (`screen.mjs --requests-out`) reproduced the
stored K requests byte-for-byte on the 100-question subset. For one question per arm,
the Q3 and G requests matched K's in every field and message except the recalled-memory
block.

| Arm | Correct | Accuracy | Only arm correct / only K correct | Wrong, all evidence delivered | Wrong, some evidence missing | Wrong, partial only | Wrong, no indexed annotation | Borderline (0.35–0.65) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Q3: qwen3-embedding:0.6b** | **472** | **94.4%** | 25 / 10 | 14 | 12 | 1 | 1 | 20 |
| **G: embeddinggemma** | **468** | **93.6%** | 18 / 7 | 18 | 12 | 1 | 1 | 17 |
| K: OpenAI small (Nov 9) | 457 | 91.4% | – | 19 | 21 | 1 | 2 | 18 |
| M: multilingual-e5-small (Nov 9) | 427 | 85.4% | 18 / 48 | 11 | 60 | 0 | 2 | 26 |

Correct answers by question type:

| Type (n) | K | Q3 | G | M |
| --- | ---: | ---: | ---: | ---: |
| knowledge-update (78) | 75 | 78 | 77 | 73 |
| multi-session (133) | 114 | 121 | 115 | 104 |
| single-session-assistant (56) | 55 | 55 | 55 | 55 |
| single-session-preference (30) | 25 | 27 | 27 | 21 |
| single-session-user (70) | 68 | 69 | 69 | 65 |
| temporal-reasoning (133) | 120 | 122 | 125 | 109 |

Q3 versus G is 17 / 13 (only Q3 correct / only G correct).

**Interpretation (inference).** Both local models answered at least as well as K on
English LongMemEval-S: +15 (Q3) and +11 (G) questions. The paired discordant counts
favour them (25/10, exact two-sided sign test p ≈ 0.02; 18/7, p ≈ 0.04). However,
Q3 and G were generated on November 10 and K on November 9. Same-day A versus
A-historical varied by 5/9 questions, so part of the gap may be generator or judge
variation. The defensible reading is "not worse than K", not "better than K".
Fewer wrong answers had evidence missing at delivery (12 versus 21), although
delivered-complete coverage was nearly equal (95.6% / 95.4% versus 95.3%). The two
local models therefore appear to miss on different, possibly easier-to-recover
questions. That is not established. The loss versus rerank arm A (476–480) remains.
**This is English-only evidence, and it makes no multilingual quality claim** for
either model.

Spend (modeled from usage at the frozen rate card): Q3 $6.38 and G $6.38, together
$12.76. The cumulative external total is $45.47 against the $100 cap, within the
$50 limit set for this step.

## Answers (Jev 1.13.0 Noul, Yes ≥ 0.50)

The generator is `gpt-6.1-sol` (reasoning low), using the original task-specific
rules. Raw probabilities are retained in the artifact bundle. C was not generated,
because its requests were identical to B's for 425/500 questions and its coverage
was equal. K replaced C as the best text-private OpenAI candidate.

| Arm | Correct | Accuracy | Wrong with all evidence delivered | Wrong with some evidence missing/partial | Borderline (0.35–0.65) |
| --- | ---: | ---: | ---: | ---: | ---: |
| A-historical (Oct 22) | 480 | 96.0% | 19 | 0 | 15 |
| A same-day control | 476 | 95.2% | 22 | 1 | 16 |
| B | 455 | 91.0% | 15 | 28 | 18 |
| K | 457 | 91.4% | 19 | 22 | 18 |
| D | 458 | 91.6% | 14 | 26 | 14 |
| M | 427 | 85.4% | 11 | 60 | 26 |

Paired against same-day A, the counts are questions that only the arm answered
correctly / only A answered correctly: B 9/30, K 8/27, D 10/28, M 8/57. Same-day A versus
A-historical is 5/9, which bounds day-to-day generator/judge variation at about
0.8 points. That is small compared with the ~4-point gap between the rerank arm
and every no-rerank arm. The gap coincides with retrieval loss: 22–28 of each
no-rerank arm's wrong answers had evidence missing or partial at delivery, versus
0–1 for A.

**Interpretation (inference).** The answer differences among B, K and D
(455–458) are within judge/generation noise. The loss versus A (95.2–96.0%) is
attributed to the missing rerank, not to removing stored text, the embedding
location or the sparse leg. M (85.4%) is clearly below
the other text-private arms. That matches its retrieval loss: 60 of its 73 wrong
answers had evidence missing or partial at delivery. This is English-only
evidence. **It does not establish multilingual quality for any model, including
M.** It shows that M (q8; fp32 retrieval was equal on a 100-question subset) costs about 6 points on English
LongMemEval relative to K. No local multilingual model was validated by this
November 9 run; the November 10 Ollama candidates are evaluated above.

## Resources

Measured on this machine (Apple silicon, CPU, onnxruntime-node via transformers.js
4.3.1, q8 ONNX — the browser WASM default dtype):

| Model | Download | Unique texts | Embedding time |
| --- | ---: | ---: | ---: |
| bge-small-en-v1.5 (English-only) | 34.0 MB ONNX + 0.7 MB tokenizer | 376,026 | 3,851 s, ~98 texts/s, one process under contention |
| multilingual-e5-small | 118.3 MB ONNX + 17.1 MB tokenizer | 376,026 | ≈2,725 s wall: 8,384 rows in one process (~86 texts/s), then 367,642 rows in 3 processes × 5 intra-op threads (~140 texts/s combined) |

| Item | Native (A/B/F/L) | Text-private (C/D/E/K/S) |
| --- | ---: | ---: |
| Collections created and deleted (404-confirmed) | 500 | 500 |
| Documents | 483,385 | 483,385 |
| LambdaDB operations | 18,965 | 19,462 |
| Client upload bytes (measured) | 0.587 GB | 12.92 GB (both vector fields + sparse) |
| Median server query time | A 545 ms, B 200, F 193, L 21 | C 43 ms, D 36, E 35, K 42, S 19 |

The modeled client upload per single-arm deployment (JSON, 483,385 chunks) is
0.51 GB for native text docs, **9.68 GB for K** (1,536 floats), 10.48 GB for C,
3.35 GB for D and 2.55 GB for E/M (384 floats). At $1/GB writes, K's import write
meter is ~19× the native layout's. Native also bills ~1.03M LIU of managed
embedding (~$1.09), while K pays OpenAI directly (~$1.03 for 51.7M tokens).
Text-private queries are faster because the query vector is precomputed, but the
client-side query embedding call is not included in these times.

Experiment spend (modeled from usage at the frozen rate card in
[the public evaluation](longmemeval-public-evaluation.md); not invoices):

| Item | USD |
| --- | ---: |
| OpenAI client embeddings, 39,937,441 tokens | 0.80 |
| Generation + Jev judging: B / K / D / A control | 6.37 / 6.39 / 6.37 / 6.40 |
| Generation + Jev judging: M | 6.38 |
| Generation + Jev judging: Q3 / G (Nov 10) | 6.38 / 6.38 |
| **External total (OpenAI + Typesafe; cap $100)** | **45.47** |
| LambdaDB, gross list estimate: writes 13.5 GB ≈ $13.5; managed embedding ≈ $1.09; Jev rerank ≈ $0.5 (estimated tokens); reads < $0.3 | ≈ 15.4 (separate) |

## Limitations

- English LongMemEval only, one generator and one judge. Answer differences of
  ≤3 questions are within observed variation.
- The fixed `avglen` was calibrated on this corpus. Structural message coverage is
  not necessary-fact recall.
- Hashed sparse keys with term-frequency weights are not encryption. Anyone who
  holds the per-collection secret, or who can mount frequency analysis over many
  documents, could learn term statistics. Vectors are also subject to inversion
  attacks. Text-private mode removes plaintext storage; it does not make the
  stored representation non-sensitive.
- The local-KNN substitution for M is validated only for per-chat ranges of
  about 1,000 chunks.
- Not measured: browser (WASM) embedding speed, mobile devices, live ANN on
  large collections, and multilingual retrieval quality. BGE-M3 was measured for
  retrieval only; Q3 and G answers were generated on a different day from K.

## Evidence

Detailed outputs are stored under the ignored, local-only
`artifacts/text-private-retrieval-v1/` directory, with `SHA256SUMS` and a `README`.
They are unavailable in a fresh clone. Reusable code is in
`benchmark/text-private/` (`screen.mjs` runs the local-model retrieval screen); the regression test is
`tests/text-private-retrieval.test.js`.
