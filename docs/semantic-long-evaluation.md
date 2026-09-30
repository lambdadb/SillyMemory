# Semantic long-dialogue live baseline protocol

This experiment measures the current v5 runtime with memory off/on. It does not
adopt or compare a sentence-selector candidate, rescore old failures, or change
LambdaDB. The PR #25 semantic rules are retained; assistant inspection and merge
approval are not independent human semantic grading.

## Frozen inputs and settings

The 16 short cases are expanded to 60 messages each: the original two turns,
56 ordinary housekeeping turns from a fixed eight-paragraph language-specific
pool, then two topic cues without answer facts. This is intentionally controlled
synthetic padding, not natural-dialogue diversity. English/Korean shapes remain
correlated. Only assistant speaker metadata and corresponding name references
in the answer rubric are mapped to the host's fixed `SillyMemory E2E Mira` label;
source fact text, question and all required span coordinates remain unchanged.

Run all 16 cases off/on twice, alternating pair order by case/repetition:
**64 completed answers**, with at most eight eligible transport retries (72
attempts). Use the existing test bridge only to forward the actual host request,
keep the provider key out of the browser, and retry unchanged HTTP
500/502/503/504 responses under the existing bounded policy. No successful
answer is retried for quality. Actual starts remain at least 15 seconds apart.

Pin SillyTavern 1.19.0 `06bde939fb1e9c4c8d8641d810f0a916b5bce127`,
`gpt-4.1-mini-2025-04-14`, temperature 0, output 256, context 1,536, recent 8,
configured memory 400, and **effective memory 320**. Chunk size stays 800 Unicode
code points. The local pinned tokenizer must prove source overflow and recent
history plus memory/prompt reserve fit before a plan is created. Capture the
actual effective retrieval budget at runtime rather than assuming settings
budget equals effective budget.

Freeze/hash the fixture, plan, runtime, adapter, report verifier, protocol and
retry/spacing code before provider calls. Failed preflight is not a quality
result. A harness failure must preserve its report and verified cleanup status;
any corrected run gets a new tag and retains the earlier failure.

## Observed evidence

Use the real host Generate/UI path and built-in CORS proxy for live managed
LambdaDB indexing and queryText search. No direct model-only prompt experiment.
Each sample gets an isolated native chat restored from the exact source.
Check original source immutability, full recent/question retention, fixed model
settings, off-mode actual truncation, and on-mode no retrieval fallback.

The adapter matches selected chunks to current local documents, converts Unicode
chunk boundaries to original UTF-16 offsets, and verifies literal excerpt
headers/text and native roles in the outgoing provider messages. Compute
answer-span and mandatory-context coverage separately in memory and the final
prompt. Unknowns have null evidence completeness. Retained full native source
turns also count as prompt evidence. Coverage is not a generated-answer score.

Stop on integrity errors; preserve provider failures and cleanup records. Drain
extension writes and delete only owned collections through the existing cleanup
path. Verify keys are absent from browser/host persisted settings. No release,
main promotion or deployment is part of this experiment.

## Answer review and limits

After successful transport/integrity completion, create a randomized answer
packet without off/on labels. Review the full core source, expected rule and
forbidden claims. Use `correct`, `partial`, `incorrect` or `abstained`; unknown
cases pass only with justified abstention. Any assistant grading is provisional,
not blinded or independent human review, even if conditions were not shown while
grading. Keep a separate unfilled human packet. Report paired outcomes and every
failure; do not turn source delivery into an answer-quality pass.

This is a new synthetic baseline under an explicit rubric, not a guarantee of
real-chat quality, ANN recall, latency/cost improvement or release readiness.
Do not tune a candidate on these results and then call it untouched held-out data.
