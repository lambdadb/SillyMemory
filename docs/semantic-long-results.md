# Semantic long-dialogue baseline attempts — 2026-09-30

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

The new real-host adapter and offline review tools are implemented, but the
planned 64-answer experiment is **incomplete**. Three attempts stopped on failed
LambdaDB requests near the existing 15-second client deadline. Two additional
single-document diagnostics observed managed-upsert HTTP 504 responses. No
answer-quality score, successful full-cohort comparison, or release-readiness
claim follows from these attempts. Runtime retrieval and timeouts are unchanged.

## Frozen design and actual execution

The [protocol](semantic-long-evaluation.md), 16-case synthetic long fixture,
adapter, source-delivery verifier and production source hashes were frozen at
commit `4c7ac77` before the first provider call. The first two attempts used that same plan
and those unchanged inputs; attempt v3 regenerated a byte-identical plan. The later annotation scorer was added separately;
it did not control retrieval or generation. The original PR #25 semantic
criteria remain assistant-authored and have no independent human approval.

Each case has 60 messages, with its first two source turns followed by repeated
housekeeping padding and two answer-free cues. The pinned host tokenizer
confirmed 2,169–3,139 source tokens, beyond the 1,536-token context. Recent history
used 223–325 tokens before the prompt reserve; the effective memory budget is
320, despite the configured 400. This is controlled synthetic padding, not
natural-dialogue diversity.

Requests originated in SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, through its Generate path and built-in
proxy. Managed LambdaDB upsert/queryText was live. The generation bridge forwarded
actual host messages to `gpt-4.1-mini-2025-04-14`, temperature 0, output 256.
No direct-model-only substitute or sentence-selector candidate was used.

| Observation | Attempt v1 | Attempt v2 |
| --- | ---: | ---: |
| Fully audited sample rows | 10/64 | 0/64 |
| Saved generated answers | 11 | 0 |
| Generation provider attempts | 11, all HTTP 200 | 0 |
| Generation transport retries | 0 | 0 |
| Passed checks before stopping/cleanup | 139 | 2 |
| Browser/proxy LambdaDB request records | 62 | 7 |
| Failed query requests | 1 | 1 |
| Owned collections removed and GET-confirmed absent | 2 | 1 |
| Full-cohort quality result | Unavailable | Unavailable |

Attempt v1 reached `long-ko-negation/r1/on`. One query failed after
15,046 ms; the other query returned HTTP 200. The memory retrieval fell back,
while the generation request still succeeded and its answer was saved. The
adapter correctly stopped because the experiment requires on-mode retrieval
without fallback. The failed sample is the eleventh generation in the raw
report, even though it has no completed evaluation row. It is not discarded or
counted as a successful memory-on sample.

After preserving that failure and verifying cleanup, one fresh attempt used the
same frozen plan. Its initial transport gate accepted upsert, then its query
failed after 15,003 ms. The gate never passed, and the host wait ended without any
generation call. A later attempt and diagnostics are recorded below. These timings are consistent
with the client's fixed deadline, but the browser trace does not identify whether
network, LambdaDB service latency, or an underlying embedding provider caused the
stall. In particular, **there is no observed generation-model HTTP 500** here.

The ten completed rows verify source immutability, native role/header delivery,
actual effective budget, token counting, recent/question retention, fixed model
settings and off-mode truncation. Their limited source delivery is not a
64-sample result or generated-answer accuracy. All eleven answers, actual outgoing
messages, attempt ledgers and both failed-request records are retained below,
ungraded. Total recorded generation usage is 10,836 prompt and 328 completion
tokens; managed embedding usage/cost was not measured.

## Evidence, cleanup and validation boundaries

The complete synthetic reports are checked in, byte-identical to the raw files:

- [Attempt v1](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-long-incomplete-v1.json), SHA-256
  `67c91a76e13e614b4799c4ed6420652439c187a2cb8eff89962767740c734e0d`.
- [Attempt v2](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-long-incomplete-v2.json), SHA-256
  `22b22c60f139c7207e8bd724701092ce0b755deb22bd10f6c79730dab7381a3e`.

Both retain matching initial/final source hashes and successful owned-resource
cleanup. All three created collections returned 404 after deletion. The first
run also exercised the settings deletion path, draining extension writes. The
second transport gate cleaned its collection before the harness confirmed its
absence again. These cleanup facts do not turn `passed: false` into success.

The normal end-of-run browser/host persisted-key audit was **not reached** in
either attempt. Do not carry forward a key-persistence pass from older runs.
The harness still used process/session-only keys and scanned exported artifacts
for configured secret values, but a static artifact scan is a separate check.
No independent human semantic review or complete answer packet was produced.

Local unit tests cover the source-to-prompt adapter, frozen fixture constraints,
paired annotation scoring, changed-rubric/duplicate-key rejection, and rejection
of incomplete reports by the successful-summary/review-packet path. Historical
negative results and prior fixtures remain unchanged. These are unit/report
replay checks, not substitutes for the incomplete live experiment.

## Pre-merge follow-up

The maintainer requested full-cohort completion before merging PR #26. It remains
open and must not be treated as ready to merge based on unit checks alone.

[Attempt v3](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-long-incomplete-v3.json) used the unchanged runtime,
fixture and generation settings. Its initial managed upsert failed after
15,002 ms, so it made **zero generation calls**. The owned transport-gate
collection was deleted and confirmed absent. This run adds no answer-quality
observations. Its raw SHA-256 is
`18ca06b3dfb39a7d7fdbd7aca3ac2ac17662d3e42da9ce9e7bf814be14163ac3`.

Two separate one-document browser/proxy diagnostics used the existing bounded
probe with a **45-second diagnostic-only timeout**; production stays at 15 seconds.
They do not count as the 64-answer cohort or successful product validation.

| Diagnostic | Ordinary upsert | Ordinary scope query | Managed upsert |
| --- | --- | --- | --- |
| [v1](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-long-diagnostic-v1.json) | 202, 218 ms | 503, 120 ms | 504, 29,042 ms |
| [v2](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/semantic-long-diagnostic-v2.json) | 202, 1,371 ms | 200, 117 ms | 504, 29,041 ms |

The first ordinary query immediately followed fresh collection creation and is
not a sustained-readiness test. The second confirms that ordinary storage/query
can succeed while the managed path still fails. The two actual HTTP 504 responses
show that increasing the browser deadline alone does not make the request
succeed. They do **not** distinguish LambdaDB's managed ingestion path from its
underlying embedding provider. No server, model, timeout or retry change was made
to force a passing result. Neither probe reached managed queryText after the
managed upsert failure.

Both probes deleted their two owned collections, verified absence, checked the
key was absent from browser storage/host settings, and confirmed reload clears
session credentials. Those independent probe checks do not retroactively fill in
the generation runs' skipped final credential audits. All five collections
created during this follow-up were cleaned up. Total generation calls across
all three attempts remain eleven; there were no extra generation retries.

The PR review also identified that the offline verifier trusted
`sourceMessagesPresent`. It now independently recomputes literal source presence
from the captured outgoing prompt, requires matching row metadata, and rejects
an off prompt containing the entire source. A regression covers both forged
counts and a complete prompt with truthful metadata. The original verifier is
preserved as `tests/fixtures/semantic-results-v1.txt` solely to validate historical
report hashes; it is not an execution fallback. A future run must freeze a new
plan containing the corrected verifier. Historical failures remain unchanged.

## Continue from here

Use the [reproduction commands](semantic-long-running.md) after the query path is
stable, with a new artifact tag and plan filename. Preserve all failed attempts;
do not append a successful suffix and describe it as one uninterrupted run.
A complete run must finish all 64 scheduled answers, source/prompt checks,
credential-persistence audit and owned cleanup before creating the separate
unfilled human packet and provisional assistant annotations.

Do not increase production timeouts or adopt retrieval changes merely to obtain
a green experiment. A separately scoped latency diagnosis can distinguish the
query/embedding service path from generation, without changing LambdaDB. Main,
release version and the public installation baseline are unchanged.


## Separate temporary direct-path completion

The maintainer authorized a diagnostic cohort preserving actual runtime upsert
batches while supplying vectors computed directly in the Node harness. The
[direct-path result](semantic-direct-results.md) completed all 64 answers, final
credential audit and owned cleanup. It retains the same product runtime,
generation settings and budgets. Its provisional answer grades and remaining
Korean quotation failure are reported separately. It does not replace the managed
failures above or establish managed-path recovery. The final product requirement
remains managed embeddings without a separate user-configured embedding provider.
