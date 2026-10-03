# Latest-user and contextual retrieval

The original fixed comparison scored 6/18 with SillyMemory. A subsequent vector diagnostic reproduced all six unique old-fact misses with exhaustive search, and retrieved all six when querying the latest user question. That motivated `latest-user-plus-context-v1`; no LambdaDB implementation changes are involved. Historical reports remain unchanged.

## Policy

The current `latest-anchor-with-context-selection-v5` policy searches the latest
non-empty user message independently. Its second query normally uses the prior
non-empty user turn. If a newer eligible assistant turn, strictly before the
anchor, has more than 1.25 times that user's lexical similarity to earlier history, use the
assistant turn instead. Missing user context retains the assistant fallback using
the last eligible nonempty turn.
Assistant turns carrying file, media or tool metadata cannot supply the second
query, whether selected by scoring or by the missing-user fallback.

The comparison uses distinct Unicode word trigrams, NFKC/lowercase normalization
and smoothed inverse-document-frequency weighted cosine similarity. Each score
is the maximum similarity to one of the last 256 eligible nonempty messages
strictly before the prior user. Both candidates and the anchor are excluded;
each text is bounded to 6,000 UTF-16 code units. Ties and an empty reference corpus
retain the user. This is a local heuristic; there is no extra provider request.
It can misread quoted topics or paraphrases, and ignores words shorter than three
characters. The bound limits scoring work but is not a latency guarantee.

See the [frozen comparison and actual-host follow-up](context-turn-results.md).
The [v4 fallback](assistant-fallback-results.md) and
[prior-user comparison](context-selection-results.md) are historical evidence.

Explicit `continue` anchors on the latest non-empty message being extended,
including assistant text, and applies the same context selection before that
anchor. Regenerate/swipe exclude retained answers after the user anchor. Without
any non-empty user message, use the latest non-empty message. Bound each query
to 6,000 UTF-16 code units and remove duplicate strings.

The historical v2 continuation fix and [six-case results](recall-challenges.md)
remain unchanged below. Historical v1/v2 evidence is not a v5 benchmark.

Run at most two scoped managed `knn.queryText` requests concurrently, 30 candidates each. Interleave their ranks, starting with the question-only result, then validate against the exact current local source and deduplicate. The existing complete-passage selector counts the full wrapper against the same configured budget. Source isolation, synchronization journals and prompt mutation rules stay as described in [architecture](architecture.md).

If either search fails, cancel the other and preserve the full original prompt. Invalidation cancels both and rejects any late result. This costs up to two embedding/query operations per retrieval. It is a bounded heuristic, not a relevance guarantee or semantic reference resolver. A very small budget can still exclude a contextual result; the six-case continuation evaluation is bounded synthetic evidence, not a general guarantee.

## Validation protocol

Run the original 54-generation schedule again with the same synthetic histories, question wording, ordering, model snapshot and settings. Do not tune the policy after observing these answers or replace failed samples. The comparison harness now measures raw injection presence/tokens from actual outgoing messages and matching inspection, rather than the already-cleared post-generation prompt slot. Its independent summary still verifies and recounts all injection tokens. Original raw reports retain the earlier measurement defect and their explicit correction.

A separate held-out retrieval-only fixture has four scenarios: English passport and lantern references, a Korean violin reference, and an explicit topic switch. Each contains 80 messages, including similar-object distractors and a target outside the retained recent window. Test each with and without an incorrect assistant answer after the user question. Perform one retrieval after synchronization/readiness; record all selection misses without retrying for quality. These eight cases use real managed embeddings and the built-in proxy, but no answer-generation model. The retained-answer snapshots test the engine's query anchor; actual host swipe/regenerate is covered separately by the nine-generation lifecycle test.

The browser fault suite uses the real pinned host with an HTTPS emulator. The live fault suite injects response loss/delay after real service operations. Both are distinct from actual provider outages.

## Reproduce

Use the existing ignored `.env.local`, pinned host checkout and installed development dependencies. A fresh tag preserves each result. The two generation commands share port 18128 and must run sequentially.

```sh
npm test
npm run check
SM_ARTIFACT_TAG=next-policy npm run test:faults
SM_ARTIFACT_TAG=next-policy node scripts/live-smoke.mjs --context --faults
SM_ARTIFACT_TAG=next-policy npm run test:comparison:live
node scripts/comparison-summary.mjs artifacts/generation-comparison-next-policy.json --output artifacts/comparison-summary-next-policy.json
SM_ARTIFACT_TAG=next-policy npm run test:generation:live
```

Real runs incur LambdaDB/embedding/model usage and delete only their owned synthetic collections. A pending-cleanup file is retained if cleanup fails. The held-out runner performs eight scored retrievals (16 managed searches), plus the existing transport, lifecycle and controlled-failure checks. Comparison runs perform 54 scheduled completions with at most one transient 503 retry; lifecycle runs perform nine completions. Full histories still fit the baseline model context; this protocol does not establish recall beyond that context, real-user usefulness, total operating cost, committed ANN graph quality or statistical superiority.

## Held-out retrieval and recovery results

The live v3 run completed 19 lifecycle/fault/context checks and selected the required old passage in all eight held-out retrievals. Maximum injected memory was 792/800 **host tokens**. This retrieval-only harness keeps the pinned host's default tokenizer configuration; these counts are not GPT-4.1 prompt-token measurements and are not pooled with generation usage. The comparison/lifecycle generation harness explicitly configures OpenAI and measures that model's token usage separately.

For the Korean question “그건 어디에 보관했지?”, the question-only query placed the target first in both snapshots; the contextual query missed it in the top 30. That contextual query also included an unrelated routine message; its separate contribution was not isolated. The interleaved selection retained the primary hit. Both English reference cases and the explicit topic switch also selected their targets. In this small fixture the primary query already retrieved every target; these cases do not demonstrate an incremental recall benefit from the second query. Stronger ambiguous-reference histories remain necessary. Query records are stored in response-completion order: identify each result by its query text, not its array position. Queries were unchanged when an incorrect assistant answer was appended after the user question. These are small, synthetic retrieval observations, not eight generated correct answers.

The emulator run passed 48 checks, including two actual 15-second timeout paths, concurrent-query invalidation, 429/503 fallback, reload/key re-entry and draining deletion. It reported no uncaught page errors or remaining collections. The live v3 run also exercised accepted-write response loss, journal recovery and completed stale responses delivered after invalidation. Its owned collections were deleted and confirmed absent, and reload dropped the key.

Two earlier live test attempts are retained:

- V1 stopped at the delayed-query test. Its old single-response barrier allowed the sibling query to abort normally; the test expected a completed stale-response result instead. The harness now captures **both** completed responses before invalidation to test the intended late-delivery case. Product runtime was unchanged.
- V2 passed that recovery test, then stopped before the first scored contextual retrieval. The fixture's readiness query used the client's default 30-result limit while expecting 74 records. The harness now explicitly requests the expected document count. No question/answer/fact was changed, and no failed retrieval sample was replaced. Both failed attempts completed owned collection cleanup.

Evidence: emulator faults (`artifacts/fault-smoke-query-policy-v1.json`, local-only), failed live v1 (`artifacts/live-context-query-policy-v1.json`, local-only), failed live v2 (`artifacts/live-context-query-policy-v2.json`, local-only), complete live v3 (`artifacts/live-context-query-policy-v3.json`, local-only). The live runner records source hashes and synthetic query/inspection text. Test failure-injection is controlled and does not represent a real service outage.


## Service latency observed during answer evaluation

The first answer run completed samples 0–35, then timed out while preparing the revisions scenario. Samples 32 and 33 had already fallen back to the complete source after a memory operation failed; they took 16.32 and 16.10 seconds end to end. Their correct answers are not counted as successful memory injection. The first continuation failed the transport gate before any model call. After the bounded probe succeeded, a second continuation passed the gate but again timed out while preparing the revisions scenario, also before any model call. All three generation runs completed cleanup.

A separate real-proxy transport test also failed during managed upsert while collection operations succeeded. A subsequent bounded probe submitted one unmanaged and one managed document upsert: both completed, in 0.193 and 14.297 seconds respectively. The latter was close to the unchanged 15-second request timeout. This narrows the observation to managed-operation latency at that time; the backend/provider cause is unverified, and it does not prove the earlier timeout had the identical cause. No LambdaDB changes, timeout increase or automatic model retry was introduced. Each diagnostic collection was deleted and confirmed absent.

Review the failed zero-generation continuation (`artifacts/generation-comparison-from-36-query-policy-v1.json`, local-only), second failed continuation (`artifacts/generation-comparison-from-36-query-policy-v2.json`, local-only), failed live gate diagnostic (`artifacts/live-service-diagnostic-smoke.json`, local-only), and bounded upsert comparison (`artifacts/live-probe-service-diagnostic.json`, local-only). To rerun that small probe, use `SM_ARTIFACT_TAG=next-service node scripts/live-smoke.mjs --probe`; it uses the existing credentials, real browser/proxy, synthetic owned collections and no text-generation model.

The summary supports an explicit `--partial` mode for complete, balanced scenario blocks forming the scheduled prefix. It reports missing sample indices and refuses arbitrary subsets or unbalanced blocks. By default it still requires all 54 samples. Injection counts, correct injected/uninjected answers and full-source counts are reported separately so safe fallback cannot masquerade as retrieval success.


## Partial generated-answer results

Completed on 2026-09-27: **36/54 scheduled generations**, covering the complete long-history and similar-owner scenarios, two repetitions and all three modes. At this milestone the revisions scenario (indices 36–53) was still untested; its subsequent completion is recorded below. No completed answer was rerun or dropped. A model request was made exactly once per completed sample. Both continuation attempts generated zero answers.

| Mode | Correct in completed subset | Memory injected | Full source retained | Median input tokens | Median generation time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Memory off | 12/12 | 0/12 | 12/12 | 9,654 | 1.094 s |
| SillyMemory | 12/12 | 10/12 | 2/12 | 1,443 | 2.226 s |
| Native Vector Storage | 12/12 | 12/12 | 12/12 | 9,658.5 | 1.635 s |

All ten answers with actual SillyMemory injection were correct; their maximum injection was 778/800 tokens, independently recounted with the pinned host's configured OpenAI tokenizer. Seven of the eight old-fact trials included the required fact in the actual memory text. The eighth (second Yuna-key trial) failed memory retrieval and answered from all 120 source messages. The other full-source fallback was the second unknown-locker question. Both fallback answers were correct, but neither demonstrates search success.

On these same first 36 scheduled samples, the historical original policy scored 4/12 for SillyMemory: only recent and absent facts passed. The current 12/12 includes error fallback, so it is not a clean 12/12 retrieval claim. The successful injected old-fact trials demonstrate improvement on seven tested cases; changed-plan/password handling was still unverified at this milestone. The later completion below covers those fixed questions; stronger reference ambiguity and real personal conversations remain unverified. Native retained the complete histories and is not an equal-budget retrieval baseline.

Provider/cache/output usage, all answers, source preservation and cleanup checks are retained. Median prompt tokens fell by about 85.1% relative to off on this subset, but median end-to-end time increased and the two failure paths took about 16 seconds. Generation-only estimates for 12 answers were $0.016195 off, $0.005790 SillyMemory and $0.025656 native; these exclude embedding and LambdaDB costs. Cache effects and service instability prevent general cost/performance conclusions.

Review the 36-answer raw report (`artifacts/generation-comparison-query-policy-v1.json`, local-only) and validated partial summary (`artifacts/comparison-summary-query-policy-v1-partial.json`, local-only). The summary explicitly marks `complete: false`, `completedSamples: 36` and all 18 missing indices. A failed attempt's `passed: false` is preserved even though its completed answers can be analyzed. The separate historical nine-generation streaming/edit/swipe/branch result predates this runtime. A later current-policy lifecycle rerun is recorded below; it is a distinct experiment.

After managed operations are reliable again, continue without replaying completed samples:

```sh
SM_COMPARE_START=36 SM_ARTIFACT_TAG=query-policy-resume npm run test:comparison:live
node scripts/comparison-summary.mjs artifacts/generation-comparison-query-policy-v1.json artifacts/generation-comparison-from-36-query-policy-resume.json --output artifacts/comparison-summary-query-policy-complete.json
SM_ARTIFACT_TAG=query-policy-resume npm run test:generation:live
```

The summarizer requires identical evaluated runtime/harness source hashes across segments. If those change, use a new full comparison rather than combining incompatible runs. The nine-generation lifecycle command was outstanding at this partial milestone; its later successful rerun is recorded below. All owned collections from completed, failed and diagnostic runs were removed and confirmed absent; API keys remained unpersisted, and `.env.local` was unchanged.

## Follow-up transport diagnosis

The operator suggested that another session's bulk embedding workload may have
shared the same OpenAI account. This is a hypothesis: concurrent-job state,
provider limit headers and backend traces were not available, so no shared-quota
root cause is confirmed.

A fresh single-document probe completed ordinary upsert in 1.643 s and managed
upsert in 7.060 s. The next comparison continuation passed connection setup but
again failed preparation of sample 36, before making any model call. It preserved
the original runtime, questions, schedule and 15-second request timeout, and
confirmed both remote cleanup and native-index purge.

The test-only probe now accepts bounded `SM_PROBE_BATCH_SIZE` (1–50),
`SM_PROBE_TIMEOUT_MS` (1,000–45,000) and optional `SM_PROBE_QUERY=1`. The extended
observation deadline applies only to this isolated diagnostic client and is reset
before cleanup. It does not change the extension or generation evaluation.
Oversized and invalid values are rejected before remote operations.

Using the first 50 synthetic messages of the fixed revisions fixture, the
45-second diagnostic observed:

| Operation | Documents/results | Elapsed | Completed |
| --- | ---: | ---: | --- |
| Ordinary upsert | 50 documents | 0.213 s | Yes |
| Ordinary scoped query | 50 results | 0.132 s | Yes |
| Managed-embedding upsert | 50 documents | 25.890 s | Yes |
| Managed `queryText` | 30 results | 1.019 s | Yes |

All returned IDs/text/ownership/scope matched the submitted source. The managed
write exceeded the product's 15-second request deadline; the succeeding query did
not. This separates a slow initial write from a blanket authentication/proxy or
search failure in this observation. It is one bounded sample, not a latency
distribution or proof of rate limiting. Both owned collections were deleted and
confirmed absent. No text-generation model was called by either probe.

Evidence: single-document check (`artifacts/live-probe-query-policy-resume-check.json`, local-only),
failed continuation (`artifacts/generation-comparison-from-36-query-policy-resume.json`, local-only),
and 50-document diagnostic (`artifacts/live-probe-query-policy-batch-diagnostic.json`, local-only).

```sh
SM_PROBE_BATCH_SIZE=50 SM_PROBE_TIMEOUT_MS=45000 SM_PROBE_QUERY=1 SM_ARTIFACT_TAG=next-batch-diagnostic node scripts/live-smoke.mjs --probe
```

A diagnostic completing under 45 seconds must not be reported as a pass under the
shipped 15-second policy. Preserve each report with a fresh artifact tag.


## Current-policy generation lifecycle rerun

`SM_ARTIFACT_TAG=query-policy-resume npm run test:generation:live` completed
**nine real OpenAI generations and 45 checks** with live LambdaDB and the pinned
SillyTavern host. Runtime/evaluation source hashes still match the earlier
comparison segment; the product timeout remains 15 seconds.

All nine answers matched their synthetic source expectations and the exact
provider output saved by the host. The run exercised memory off/on, native edit,
streaming regenerate, streaming swipe, native branch, native deletion, controlled
retrieval failure with full-prompt fallback, and disabling memory again. Recent
messages and persisted source were preserved. Real keys were absent from browser
storage and saved host settings, and both owned collections were confirmed absent.

This closes the previously outstanding small-fixture generation lifecycle check.
It did not itself complete the 18 remaining revision-comparison samples or
demonstrate reliable large initial indexing. The later comparison completion is
recorded below. The runtime and frozen comparison protocol were
not changed to accommodate the slow batch operation.

Review generation lifecycle evidence (`artifacts/generation-live-model-query-policy-resume.json`, local-only).
The 32 unit tests and runtime syntax checks also passed again; see the
unit-test log (`artifacts/unit-query-policy-resume.log`, local-only).

### Readiness under the shipped deadline

After the successful lifecycle run, the same 50-document diagnostic was repeated
with the shipped 15-second deadline. Managed upsert completed in 1.063 s and
managed queryText in 0.471 s. Ordinary upsert completed in 0.147 s, but its separate
scoped query returned HTTP 503 after 0.099 s. The readiness report (`artifacts/live-probe-query-policy-batch-readiness.json`, local-only)
is therefore correctly marked **failed overall**, despite the managed path
completing successfully. All owned collections were deleted and confirmed absent.
No requests were automatically retried by that diagnostic. The observed recovery
in managed write time justified another continuation of the missing comparison
samples; it does not establish sustained availability or the proposed shared-load
root cause.


## Complete fixed comparison

The final continuation, `SM_COMPARE_START=36 SM_ARTIFACT_TAG=query-policy-resume-2 npm run test:comparison:live`, completed all 18 missing samples, with no additional
memory-operation fallback in that segment. Together with the original 36-sample
segment, **all 54 scheduled samples are present exactly once**. No failed answer
was removed or replayed. The two segments made 54 provider attempts for 54 saved
answers, with no model retry. They recorded 269 and 137 execution checks,
respectively, including successful remote cleanup and native purge. Earlier
zero-generation preparation failures remain separate preserved artifacts.

The strict complete summarizer verifies identical runtime/evaluation source
hashes and configuration, sample schedule/uniqueness, original source preservation,
provider answer/usage correspondence, actual injection, independent pinned-host
token recount and cleanup. `complete` is now true, `completedSamples` is 54 and
`missingSampleIndices` is empty. The earlier partial summary remains unchanged.

| Mode | Correct | Memory injected | Full source retained | Median input tokens | Median generation | Maximum injected tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Memory off | 18/18 | 0/18 | 18/18 | 9,420 | 1.094 s | 0 |
| SillyMemory | 18/18 | 16/18 | 2/18 | 1,439 | 2.086 s | 800 |
| Native Vector Storage | 18/18 | 18/18 | 18/18 | 9,423 | 1.582 s | 159 |

All 16 answers with actual SillyMemory injection were correct. Eleven of the
12 old-fact trials contained the required answer phrases in the actual memory
text; the remaining Yuna-key trial used full-history fallback. The other fallback
was an absent-fact question. Both fallbacks remain in these totals. All six newly
completed SillyMemory revision/absent-fact answers used real injection, including
both repetitions of the final shelter and current password. No answer matched a
predefined forbidden stale/distractor phrase.

Relative to the original frozen policy's 6/18, this demonstrates improvement on
the fixed synthetic questions, with the explicit fallback qualification above.
It is not 18/18 successful bounded retrieval. Median input decreased by 84.7%
relative to memory off, while median generation time increased; the two historical
failure paths still took about 16 seconds. The segments ran at different times
and under uncontrolled provider load/cache conditions. Native retained full source
history, so its correctness is not an equal-budget retrieval comparison.

Review the complete validated summary (`artifacts/comparison-summary-query-policy-complete.json`, local-only),
original 36-sample segment (`artifacts/generation-comparison-query-policy-v1.json`, local-only),
and successful 18-sample continuation (`artifacts/generation-comparison-from-36-query-policy-resume-2.json`, local-only).
Rebuild without further model calls using the exact recorded source versions
(the final review subsequently changed test-harness cleanup/accounting; the
strict CLI intentionally rejects those historical reports against that new
harness, although product runtime hashes are unchanged):

```sh
node scripts/comparison-summary.mjs artifacts/generation-comparison-query-policy-v1.json artifacts/generation-comparison-from-36-query-policy-resume-2.json --output artifacts/comparison-summary-query-policy-complete.json
```

The planned 54-sample comparison and nine-generation lifecycle verification are
now complete. Remaining research includes strongly ambiguous contextual references,
long assistant-only continuation, histories exceeding the baseline context, the
incremental value/cost of the second query, and sustained service reliability.
The concurrent-bulk-workload explanation remains unconfirmed. Product timeout,
retrieval policy, fixture and generation harness were unchanged throughout this
continuation. Only the separate diagnostic harness gained bounded observation
options. All test-owned remote data was cleaned up; no publication or deployment
was performed.
