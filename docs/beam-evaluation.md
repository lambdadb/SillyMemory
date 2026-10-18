# BEAM current-policy baseline

## Decision and scope (2026-10-18)

Close LongMemEval-S after the [117-case product regression check](small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18), then evaluate the frozen policy on BEAM instead of LongMemEval-M. This first baseline is complete. Retain current defaults; investigate concrete source losses before tuning or expanding to larger buckets. No additional model phase or BEAM-specific prompt was added to the product.

Use all **20 conversations / 400 questions** in `chats/100K`, called **128K** in the [upstream README](https://github.com/mohammadtavakoli78/BEAM/tree/b2da22eac88bb0874c64665f13457eb99835774a). The MIT-licensed source is pinned to that commit. Follow the official loader's preference for `chat_trunecated.json` when present. Actual source text measures 92,928–121,849 cl100k tokens per conversation, 2,294,811 total. The published size label uses a different measurement; it is not our generator's input length.

This is an independent memory pipeline importing product code at `3dd2a8584f78d9af797a5319dfc408023a6f430b`, not a new SillyTavern browser test. Flatten source turns chronologically, preserve roles/content and source IDs, and apply the existing product literalization only when rendering recalled text. Do not reinterpret BEAM's event `time_anchor` as a message's sent timestamp. No dates are invented. Each probe starts from the same history; evaluation questions and generated answers never become later probes' memory. Rubrics, references and source annotations are used only after generation.

## Frozen policy and scoring

- Managed `text-embedding-3-small`; English Bayesian Query1; vector k 200; native `jev-1.13.0`, text/default criteria, candidate 200/final 50, failure mode `error`; strong branch reads.
- Product 800-character boundary-aware chunks, overlap/source assembly, chronological quoted archive, 4096-token memory including current guidance/framing; retain four original recent messages plus the current probe.
- Generator `gpt-6.1-sol`, low reasoning, 4096 output cap, nonstreaming; current product guidance and neutral history-answering system message. This is our memory method, not the paper's generation configuration.
- Judge `gpt-4.1-mini` (responses identify `gpt-4.1-mini-2025-04-14`), temperature 0; exact upstream rubric prompt and 0/0.5/1 scores. One call per criterion, then mean per question and type. The upstream prompt does not separately interpolate the question; preserve that limitation.
- For event ordering, also preserve the upstream line splitting, first-unmatched binary semantic alignment and Kendall tau-b calculation. The [official reporting script](https://github.com/mohammadtavakoli78/BEAM/blob/b2da22eac88bb0874c64665f13457eb99835774a/src/evaluation/report_results.py) substitutes normalized tau for that category. Do not silently replace it with the more favorable rubric score.

LongMemEval's Jev Yes/No policy is unchanged. It is not applied to BEAM partial credit. No previous candidate grid, alternative generator/judge, selective regeneration or repeated judging is included.

## Results

**Upstream reporting aggregation: 71.92/100.** The separate uniform rubric mean is **76.66/100**. Neither is a LongMemEval-style answer accuracy. Under the rubric, 230 questions receive full credit, 133 partial credit and 37 zero; all 400 are included.

| Ability | Questions | Mean rubric score /100 |
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

Event ordering's separate normalized tau is **24.25/100**, producing the lower upstream aggregate. Rubric presence/compliance and one-to-one event alignment/order measure different behavior. For example, `chat1--event_ordering--1` receives full rubric credit, but only two of its five answer lines align with the expected event labels, yielding tau 0.26. Keep both results and the matching receipts; no post-hoc line cleanup or relabeling. This metric gap needs interpretation before comparing external published scores.

## What the source checks establish

Four source-inspected examples demonstrate different mechanisms; they are not an exhaustive error census:

- **Retrieval miss:** `chat5--instruction_following--1` omits a tree diagram. The user's explicit standing request at source 132 is absent from final 50 and delivery. Candidate 200 membership is unavailable, so this does not isolate ANN, fusion or reranking as the cause.
- **Returned but not injected, plus retrieval misses:** `chat20--summarization--1` misses milestones. Source 128 (10 tests/96% accuracy) is returned but omitted by 4096 selection; source 196 ($12,000 filing/PCT budget) and 208 (15 cycles/98% September target) are absent from final 50. This supports separate search and selection work, not a blanket budget increase.
- **Evidence available, conflict omitted:** `chat4--contradiction_resolution--1` receives complete user statements at 114 (eight median/altitude problems) and 134 (never completed such problems). The answer lists positive practice without acknowledging the contradiction. This is a source-use example, not a missing-memory diagnosis.
- **Target/source ambiguity:** `chat1--temporal_reasoning--0` has an early March 15 anchor and later April 15 MVP deadline. The answer uses the latter. The probe's own answer says four weeks while its rubric asks eight; keep the original zero and inspect scope before treating it as a date-metadata defect.

Source-ID annotations cover 355 questions; 40 abstention questions and five other probes provide no IDs. Across 1,094 unique referenced-message occurrences, 385 are complete in returned and injected text, 102 partial in both, 506 absent in both, and two retained natively. A further 38 complete and 51 partial returned bodies are absent after selection; 10 complete bodies become partial. These are **structural message-span diagnostics, not necessary-fact recall**. Annotation omissions and broad assistant bodies limit their meaning; the summary witnesses above were found in original source without feeding them to runtime.

The next useful investigation is to trace a small, declared set of concrete missing dependencies through candidate 200, final 50 and delivery. Include standing instructions and broad-summary milestones, and preserve current-policy controls. Do not introduce a new prompt, larger budget or model merely to fit a rubric. Larger BEAM buckets and a full error taxonomy remain unperformed.

## Latency, cost and operational verification

All 400 native queries confirm Jev applied to 200 candidates and return 50 valid source-bound documents. Initial import creates 18,265 chunks. All 20 owned collections are deleted with 404 confirmation. There are 1,049 measured LambdaDB operations and no provider retries. Generation/rubric evaluation makes 400 + 1,051 calls; event alignment adds 1,145 evaluation-only calls. One phase stops on malformed judge JSON, then resumes using the saved response and the official `json_repair` fallback. Three malformed JSON responses are repaired locally in total; none is regenerated.

| Measurement | Result |
| --- | ---: |
| Mean generation input | 6,024.57 tokens |
| Query API median / p95 | 1.381 / 1.706 seconds |
| Generation API median / p95 | 4.922 / 19.950 seconds |
| Per-case query+generation sum median / p95 | 6.266 / 21.355 seconds |
| Generation estimated cost, 400 answers | $7.025 |
| Rubric + event-alignment judging | $0.692 |
| Initial LambdaDB write + managed embedding estimate | $0.0677 |
| 400 strong-query minimum + query embedding estimate | $0.00419 |
| Benchmark-only validation fetch minimum | $0.00193 |

Query+generation is a sum of measured calls, excluding ingestion, packing, queue waits and judging; it is not browser end-to-end latency or time to first token. Generation uses the frozen prior bucket-aware Sol rates; judge rates follow [OpenAI pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini). All are list-rate estimates, not invoices.

Native rerank billing tokens are not returned. An explicitly nominal text-volume proxy (200 times each corpus's average chunk length, with query text counted once or per candidate) is about **$0.44–$0.52 for 400 queries**, before unknown protocol/tokenizer overhead. This is not a measured bill or a guaranteed range. Physical GB-hours remain unknown. [LambdaDB cost rules](https://docs.lambdadb.ai/guides/costs/understanding-costs) use decimal-byte assumptions here, before free allowances; returned-data/retention promotions are separate. Do not double-count direct-provider inference charges on top of LIU.

## Retention and reproduction

Full data snapshots, exact requests/responses, source mappings, frozen plans/locks, producer code, dependency versions, parser recovery, source reviews and cleanup evidence are kept in ignored local-only `artifacts/beam128k-current-v1/`. They are not CI fixtures or available in a fresh clone. No ongoing remote resources remain. The source data's MIT notice is preserved.

Restore the recorded product source overlay, dependencies and artifact paths before running its offline `analyze.py` verifier; verification does not resend model calls. Restore the `quoted-memory-product117-v1/` dependency for the frozen Sol rate card and S-closure decision lock. The original BEAM data and upstream scoring sources are included in the archive; no `/tmp` clone is needed for offline inspection.

Archive: `artifacts/archive/beam128k-current-v1.tar.gz` (local-only, 38,340,626 bytes, 6,953 members). SHA-256: `4475551abc48c906aad589e3f75d63fa4b26491188694b74a7d509e4c6e95587`. All members pass full hash readback and configured-secret scanning.
