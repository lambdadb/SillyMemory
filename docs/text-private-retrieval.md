# Text-private retrieval evaluation

**Recommended direction, pending Steven's final adoption decision:** build the
first text-private mode as an **OpenAI-compatible embedding adapter + dense-only
KNN + local text restoration** (arm K). Defer client-side sparse/BM25: keep its
evaluation code and results, but do not implement it now. Any recommended local
embedding model must be multilingual; the English-only bge-small arms (D, E) are
diagnostics, not product candidates.

Evaluated November 9, 2026, on LongMemEval-S (500 questions, English).

| Arm (no stored text unless noted) | Delivered complete | Answers (Jev ≥0.50) |
| --- | ---: | ---: |
| A: current default, stores text, Jev rerank (same day / Oct 22) | 98.10% / 98.43% | 476 / 480 |
| B: stores text, server hybrid, no rerank | 93.40% | 455 |
| **K: client OpenAI small, dense KNN** | **95.30%** | **457** |
| D: local bge-small-en + client sparse (English-only diagnostic) | 92.39% | 458 |
| M: local multilingual-e5-small q8, dense KNN | 84.45% | 427 |

Evidence for the direction: K, D and B have equal answer quality (457/458/455,
within noise), and K has the best retrieval among the arms without rerank.
Client sparse hurt OpenAI small (C below K) and helped only the weak bge-small
(D above E). The ~4–5 point loss versus A is attributed to the missing rerank,
which text-private mode cannot use. The only multilingual local model tested (M)
lost about 6 more points on English, so the first version should not default to
it.

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
  carry the `query: ` prefix (1.0). Only the q8 weights were tested; fp32 was not,
  so quantization loss is not separated from model quality.
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
M.** It shows that M, as tested (q8), costs about 6 points on English
LongMemEval relative to K. No local multilingual model is validated as a
product candidate by this run.

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
| **External total (OpenAI + Typesafe; cap $100)** | **32.71** |
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
- Not measured: browser (WASM) embedding speed, mobile devices, and
  multilingual retrieval quality.

## Evidence

Detailed outputs are stored under the ignored, local-only
`artifacts/text-private-retrieval-v1/` directory, with `SHA256SUMS` and a `README`.
They are unavailable in a fresh clone. Reusable code is in
`benchmark/text-private/`; the regression test is
`tests/text-private-retrieval.test.js`.
