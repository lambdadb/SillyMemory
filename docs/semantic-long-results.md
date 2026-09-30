# Semantic long-dialogue baseline attempts — 2026-09-30

The new real-host adapter and offline review tools are implemented, but the
planned 64-answer experiment is **incomplete**. Two attempts stopped on failed
LambdaDB query requests near the existing 15-second client deadline. No
answer-quality score, successful full-cohort comparison, or release-readiness
claim follows from these attempts. Runtime retrieval and timeouts are unchanged.

## Frozen design and actual execution

The [protocol](semantic-long-evaluation.md), 16-case synthetic long fixture,
adapter, source-delivery verifier and production source hashes were frozen at
commit `4c7ac77` before the first provider call. Both attempts used that same plan
and those unchanged inputs. The later annotation scorer was added separately;
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
generation call. No further live attempts were made. These timings are consistent
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

- [Attempt v1](results/semantic-long-incomplete-v1.json), SHA-256
  `67c91a76e13e614b4799c4ed6420652439c187a2cb8eff89962767740c734e0d`.
- [Attempt v2](results/semantic-long-incomplete-v2.json), SHA-256
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

## Continue from here

Use the [reproduction commands](semantic-long-running.md) after the query path is
stable, with a new artifact tag and plan filename. Preserve both failed attempts;
do not append a successful suffix and describe it as one uninterrupted run.
A complete run must finish all 64 scheduled answers, source/prompt checks,
credential-persistence audit and owned cleanup before creating the separate
unfilled human packet and provisional assistant annotations.

Do not increase production timeouts or adopt retrieval changes merely to obtain
a green experiment. A separately scoped latency diagnosis can distinguish the
query/embedding service path from generation, without changing LambdaDB. Main,
release version and the public installation baseline are unchanged.
