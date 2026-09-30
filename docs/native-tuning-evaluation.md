# Native Insert# sensitivity check

This declared follow-up changes only native Vector Storage's Insert# from 3 to
10. Repeat the existing 16 English/Korean long-dialogue cases twice per setting
(64 actual-host answers), alternating settings within every case and reversing
their order in the second repetition. Keep context 1,536, model snapshot,
temperature, output limit, source, question, rubric, protect 8, query 2, threshold
0.25, chunk 400 and native template/placement unchanged. Use fresh chat scopes
and verify their indexes. Do not change settings based on these answers.

Only native Vector Storage runs: SillyMemory stays disabled, no LambdaDB key is
entered and no LambdaDB collections are created. Native embeddings still use
the actual host's existing OpenAI-compatible adapter through the test bridge.
Capture request topK, full queries/results, final prompts, source evidence,
answers, usage and timings. If a larger insertion crowds out recent messages,
record that loss instead of silently discarding the sample. The question and
fixed character instruction must remain. Retain source chats and verify all 64
native test index purges, credential absence and profile/server cleanup.

The generation policy permits at most 72 calls: 64 scheduled plus eight transient
HTTP retries, with at least 15 seconds between actual provider starts. No retry of
a successful low-quality answer. Native embedding calls are bounded at 800 and
five inputs per call. Use an unchanged frozen plan and a fresh artifact tag.

This is a post-hoc configuration-sensitivity study on familiar cases, not held-out
validation. Compare Insert# 3 and 10 within this new cohort. The earlier
SillyMemory 32-answer result remains a separately dated reference, not a concurrent
arm; do not make causal latency/cache comparisons across runs. Answer annotations
remain provisional assistant grades, separate from mechanical delivery checks.

```sh
ST_SOURCE=/pinned/host node scripts/native-tuning-plan.mjs artifacts/native-tuning-plan.json
ST_SOURCE=/pinned/host SM_ENV_FILE=/outside/repo/.env.local \
SM_MODEL=gpt-4.1-mini-2025-04-14 SM_NATURAL_PLAN=artifacts/native-tuning-plan.json \
SM_ARTIFACT_TAG=insert-v1 node scripts/generation-smoke.mjs --native-tuning --retry-transient
node scripts/three-mode-results.mjs artifacts/generation-native-tuning-insert-v1.json artifacts/native-tuning-summary.json
```

The plan CLIs create missing output directories and refuse to overwrite plans.
The installed SillyMemory product, public main and release state are unchanged.
