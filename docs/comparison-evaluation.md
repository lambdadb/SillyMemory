# Three-mode Korean recall evaluation

Protocol fixed before the first generation. Fixture version: `ko-three-modes-v1`.

Run `npm run test:comparison:live` with the existing ignored `.env.local` credentials. Use `SM_ARTIFACT_TAG` to preserve a named run. `--comparison-setup` prepares both indexes without generation. A failed run may resume at the first missing sample using `SM_COMPARE_START`; completed answers must not be replayed or removed from analysis.

## Fixed design

- Pinned SillyTavern 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
- OpenAI `gpt-4.1-mini-2025-04-14`, temperature 0, nonstreaming, maximum output 256 tokens, context 32,768 tokens; starts spaced at least 15 seconds apart.
- Three synthetic Korean histories: 240 messages with early/middle/recent facts; 120 messages with similar people and objects; 180 messages containing successive plan/password revisions. Three questions per history, including two absent facts.
- Memory off, SillyMemory, and native Vector Storage; two repetitions, 54 generations. Six fixed mode permutations balance positions across question/repetition triplets. Each sample restores exactly the same source, excluding previous generated answers.
- SillyMemory: keep 12 recent messages, memory budget 800 tokens. The original run queried the last 3 messages chronologically; the separately recorded [query-policy follow-up](query-policy.md) uses latest-user plus contextual retrieval. Fixture questions, mode schedule and all other settings remain fixed.
- Native Vector Storage: retain 12, query 3, insert 3, threshold 0.25, chunk 400 characters, original `Past events:` template, prompt position 0/depth 2, summarization/files/World Info disabled. These are specified evaluation settings, not factory defaults.
- Native uses its existing vLLM/OpenAI-compatible embedding adapter with `text-embedding-3-small`. A loopback test bridge forwards embedding requests to OpenAI and holds the key only in process memory. No vLLM model runs locally; no host code modification or server plugin is installed. Native indexing, retrieval, ranking and prompt placement remain unmodified.
- Native embeddings are capped at 300 requests/run, batches of at most 5 inputs. Generation is capped at the remaining scheduled samples plus one HTTP 503 retry/run. No automatic quota retry.

Both indexes are prepared before generation. Native index hashes must exactly match the current source. The harness checks source preservation, recent messages, isolation between memory modes, actual native retrieval, provider usage, and the SillyMemory token budget. It verifies that the entire baseline source fits. Setup/index time is recorded separately. Question-time generation latency includes retrieval and any synchronization triggered by generation; it is not model-only latency.

## Interpretation boundaries

[Native Vector Storage](https://docs.sillytavern.app/extensions/chat-vectorization/) moves relevant messages into the prompt and removes those selected messages from their old positions. It retains other old history when context permits. SillyMemory omits older history and injects a bounded selection. Consequently these are real product behaviors, not equal prompt budgets. Native may retain all source facts at approximately baseline token cost. The harness reports its actual injection size rather than imposing a foreign budget.

Native and SillyMemory construct queries and split text differently; sharing an embedding model name does not make retrieval identical. Native recent-query order is reverse chronological. The test uses warm indexes, a single isolated profile/chat, no concurrent user editing, and synthetic questions with predefined phrase grading. It does not establish real-user preference or statistical superiority. Historical obsolete facts intentionally remain in the revisions source; this differs from deletion/edit synchronization, which has separate tests.

Answers are scored without a judge model: Unicode/whitespace/punctuation normalization, required phrases, forbidden distractor/obsolete phrases, and exact `UNKNOWN` for absent facts. Synonyms can fail this strict grader. Preserve raw answers and all failures. Report each question/repetition and per-mode counts, prompt/cache/output tokens and end-to-end latency. Do not treat infrastructure checks as quality success.

Generation-only cost estimates use the [fixed model's published rates](https://developers.openai.com/api/docs/models/gpt-4.1-mini): $0.40/M uncached input, $0.10/M cached input, $1.60/M output tokens. They exclude embeddings, LambdaDB queries/storage, other provider charges and taxes. Cache state/order affect cost and latency. This is an estimate from reported usage, not an invoice or total operating cost comparison.

All test-owned LambdaDB collections are removed through ownership-checked cleanup. The native synthetic collection is purged and listed empty; the isolated host profile is removed. Reports contain synthetic prompts and answers, never real API keys.

## Original query results

Completed on 2026-09-27 with real OpenAI generation/embeddings, live LambdaDB, and the pinned host. All 54 scheduled generations completed without provider retries. The run logged 403 harness checks and verified cleanup. `passed: true` means execution/cleanup success, **not answer-quality success**. Local unit tests: 25 passed.

| Mode | Correct | Median prompt tokens | Median generation | Cache hits | Maximum injected tokens | Estimated generation cost (18 answers) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Memory off | 18/18 | 9,420 | 1.042 s | 14/18 | 0 | $0.030709 |
| SillyMemory | 6/18 | 1,443 | 1.880 s | 9/18 | 781 | $0.007018 |
| Native Vector Storage | 18/18 | 9,423 | 1.524 s | 9/18 | 159 | $0.043828 |

Each of the three histories scored 6/6 for off/native and 2/6 for SillyMemory. Both repetitions produced the same correctness pattern. No answer contained a predefined forbidden obsolete/distractor phrase. The six SillyMemory successes were two recent-fact answers and four correct `UNKNOWN` answers for absent facts. All twelve failures were `UNKNOWN` despite the source containing the requested older fact. Every failure's outgoing prompt lacked all required answer phrases. This is a meaningful retrieval/selection failure that must be addressed before claiming useful general long-term recall.

The captured injection for the first boat-name question contains many similarly worded routine-activity messages and no boat name. The current query combines the last three messages; recent routine text can dominate that query. This is a plausible explanation, not an isolated causal result: the run did not capture every LambdaDB candidate score or test alternate queries, ranking, or selection rules. Question-focused retrieval and diversity of selected passages are the next hypotheses to test without changing this frozen baseline.

Native kept every source message in its final prompts. Its injected excerpts contained the required old fact in the four similar-owner trials, but not the eight long-history/revision trials. Its 18/18 therefore does **not** establish successful retrieval of all facts under a small budget or beyond the model context window. All complete histories fit the baseline context.

SillyMemory reduced the median input count by 84.7% in this test, with lower answer accuracy and higher median generation latency. Total reported input/cache/output tokens were 172,380/128,128/122 off, 26,080/11,520/26 with SillyMemory, and 172,442/84,480/122 native. Generation ranges were 0.857–5.692 s, 1.527–2.519 s, and 1.119–2.060 s respectively. These tiny latency samples and differing cache hits do not establish a performance distribution or total cost advantage. In particular, shorter `UNKNOWN` completions contribute to the lower generation estimate.

The native embedding bridge made 135 successful requests with 51,374 reported embedding tokens during the main run. A separate zero-generation setup preflight made 48 requests/20,587 tokens. LambdaDB managed embedding usage is not included in those counts. Initial/replacement indexing durations remain in the raw setup records; the two systems index different numbers of messages and this is not a comparable indexing-throughput benchmark.

### Measurement correction and evidence

Generation-end events clear the live SillyMemory extension prompt. Consequently the raw harness's post-generation `evaluation.rows[].injected` and `memoryTokens` snapshot fields are false/zero for SillyMemory, despite real injection. Its snapshot-based budget checks alone are insufficient. The summary derives injection from each **actual outgoing request**, requires the stored inspection text to match it, and independently recounts all injection text with the pinned host's GPT-4o tiktoken mapping and six extension-count overhead tokens. All 18 SillyMemory injections were present and at most 781/800 tokens; all native counts matched too. The original report is preserved unchanged; the summary retains the raw values as `postGenerationInjectionSnapshot`.

The summarizer requires the pinned host checkout (`ST_SOURCE`, default `/tmp/sillymemory-st-source`) and its installed `tiktoken` dependency for that independent recount. It verifies the host revision and unchanged tokenizer sources, current evaluated source hashes, complete fixed schedule, source hashes, actual provider usage, mode isolation, and both cleanup results. Unit tests reject missing/duplicate/mixed evidence, altered usage, missing integrity checks, budget overflow, and inspection/request mismatch.

Review the [raw run](../artifacts/generation-comparison-openai-gpt-4.1-mini.json), [validated summary](../artifacts/comparison-summary-openai-gpt-4.1-mini.json), and [setup preflight](../artifacts/generation-comparison-setup-preflight.json). The raw report includes all synthetic outgoing prompts/answers and native query results. Remote test collections were confirmed absent, the native index listed empty, and the isolated host profile was removed. Earlier correctness and failure-recovery results remain separate in [validation](validation.md).


## Retrieval-only follow-up

The [subsequent controlled diagnosis](retrieval-diagnostic.md) reproduced all six old-fact misses with exhaustive search using the current query. Using only the latest user message recovered all six targets in managed retrieval and the same 800-token selector. No additional answers were generated, so the 6/18 answer score above is unchanged. The copied-vector comparison used the consistent-read path before ordinary index visibility and does not establish committed ANN graph recall.


## Implemented query-policy follow-up

The [latest-user/context follow-up](query-policy.md) completed the first 36 scheduled
samples before repeated live preparation failures blocked the last scenario. Each
mode scored 12/12 on that subset, but SillyMemory injected in only ten samples and
used full-source fallback in two. The original policy scored 4/12 on the same
subset. The partial summary records missing indices 36–53 and does not pool these
results into the historical 54-answer table above. The subsequent continuation completed all 18 revision samples. The new policy's
complete 54-sample result is 18/18 per mode; SillyMemory injected in 16/18 and used
the full-source error fallback in two. Its maximum injection was 800 tokens,
median input 1,439 tokens and median generation time 2.086 seconds, compared with
9,420 tokens / 1.094 seconds off. These separate results do not replace the
original-policy table above. See the [complete validated summary](../artifacts/comparison-summary-query-policy-complete.json).
The current-policy lifecycle rerun also passed nine real generations and 45 checks;
it is separate from the fixed 54-sample recall comparison.
