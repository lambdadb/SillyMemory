# Korean long-dialogue evaluation

This is a bounded synthetic integration evaluation, not a representative roleplay benchmark. It compares SillyMemory off and on with the same source history, questions, model, and host settings. It does not compare against SillyTavern Vector Storage or another memory product.

## Current result

The OpenAI comparison is **complete: 16 of 16 responses**, using `gpt-4.1-mini-2025-04-14` in a single run. Both modes scored 8/8, with no forbidden answers. Median provider input tokens were 6,417 off versus 1,398 on; median warm generation durations were 1.20 s versus 1.93 s. Memory stayed within 800 host-counted tokens. All requests succeeded on their first attempt and owned remote collections were deleted. Seven of eight off-mode requests had cached input tokens, while none of the on-mode requests did; latency and cost cannot be inferred from input-token reduction alone.

The earlier Gemini 3.7 comparison remains **partial: 15 of 16 responses**, in three non-overlapping segments. Seven complete question pairs scored 7/7 in each mode. Its final off-mode request hit the daily free quota. OpenAI results do not fill that missing Gemini sample and are not pooled with it. See the [validation record](validation.md) for interpretation and limits.

## Reproduce

Use the pinned SillyTavern checkout and extension symlink described in the [README](../README.md). The ignored `.env.local` must contain the LambdaDB connection values and `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`. For OpenAI use `https://api.openai.com/v1`, `gpt-4.1-mini-2025-04-14`, and an empty `LLM_REASONING_EFFORT`. The earlier Gemini configuration uses its own endpoint/key and `LLM_REASONING_EFFORT=low`; a model override does not switch providers.

```sh
npm test
ST_SOURCE=/absolute/path/to/pinned/SillyTavern SM_ARTIFACT_TAG=openai-gpt-4.1-mini npm run test:korean:live
node scripts/korean-summary.mjs \
  --output artifacts/korean-evaluation-summary-openai-gpt-4.1-mini.json \
  artifacts/generation-korean-eval-openai-gpt-4.1-mini.json
```

`SM_MODEL` selects a model for this run without editing `.env.local`; omit it to use `LLM_MODEL`. Both modes always use the same selected model. The harness creates an isolated local host, uses the real built-in proxy and live LambdaDB, and sends only synthetic conversations to the configured generation provider. There are 16 planned generation requests, spaced by at least 15 seconds. Real provider quotas and service usage apply. Preserve the report before rerunning, or use a new `SM_ARTIFACT_TAG`, and ensure the selected model has enough remaining quota for all 16 requests. The summary's `--output` path keeps different providers' evidence separate. The runner allows at most one HTTP 503 retry per run, waits at least ten seconds, and records the attempt. A quota error is not retried. Other unresolved generation failures stop the run and trigger owned collection cleanup; the harness does not change billing or upgrade the account. A failed cleanup retains the segment's `artifacts/generation-korean-eval*-pending.json` record and blocks that segment's rerun until cleanup is resolved.

## Fixed protocol

- The fixture starts with 120 Korean messages, containing early and middle facts, an old plan and a later correction, recent plans, and a quoted instruction that should not be followed. The facts, questions, grading rules, and order are defined before the live run in [korean-fixture.mjs](../scripts/korean-fixture.mjs).
- Index the original conversation, edit the compass location with the native message editor, and delete the password message through the native host API. The comparison uses the resulting 119-message source. This exercises removal of already-indexed obsolete records, not just a fresh index of edited text.
- Eight questions each run with memory off and on. Mode order alternates by question. Restore the exact same source before every request so generated answers and earlier questions cannot contaminate later retrieval. Source hashes are checked before and after each generation.
- Keep 12 recent messages and an 800-token memory budget. The host context is 32,768 tokens for both modes. Every off-mode request is checked to contain the complete source; it is not an artificially truncated baseline. Every on-mode request must preserve the latest 11 source messages plus the new question. If memory is injected, its complete wrapper must fit the configured host-token budget.
- Check the outgoing final prompt for the edited-away location and deleted password independently of answer correctness. Record injection use and per-question failures. A model-quality miss does not stop the remaining cases or get silently rerun; transport or prompt-integrity failures do stop the run.
- The provider must return HTTP 200, finish normally, and produce the same text saved by the host. Grade factual spans with explicit forbidden answers. Missing facts require `UNKNOWN`; the grader tolerates whitespace and punctuation, but is not a general semantic judge. [Grader tests](../tests/korean-fixture.test.js) cover partial locations, obsolete facts, invented unknown answers, and the quoted instruction.

## Measurements and interpretation

The segment reports contain final outgoing prompts, provider replies and returned usage, memory inspection text, tested file hashes, and completed scores in `generations[].evaluation`. `passed` means the segment completed with cleanup. Interrupted segments remain failed even when earlier samples succeeded. The combined summary reports factual accuracy separately and only compares complete question pairs.

- **Prompt tokens:** use the provider's returned `prompt_tokens`, independently of the host's content-token estimate and 800-token memory cap. Preserve unknown usage as missing rather than zero. Provider billing and hidden token categories are not inferred.
- **Generation duration:** wall-clock time from invoking the real host `Generate` until its promise resolves, including prompt preparation, in-generation synchronization/retrieval, model response, and host completion handling. It excludes artificial pacing, restoring the fixture, and pre-generation synchronization. This measures a warm-index workflow. Initial indexing is excluded; the completed OpenAI report retains its measured setup duration of 2.10 s. That duration was not retained in the interrupted Gemini segments and is unavailable for those results.
- **Provider duration:** time spent in the loopback forwarding bridge receiving the upstream response, including a recorded transient retry/backoff if one occurs. It excludes retrieval and is not the entire user-visible wait.
- Each question/mode has one sample. Latency medians describe this run only; they are not a speed guarantee, a confidence interval, or a controlled provider-performance study. Token reduction on this fixture does not establish general cost reduction or equal recall on arbitrary chats.

## Continue interrupted comparisons

`SM_SAMPLE_START` is a zero-based index in the fixed question/mode order. Continue after the last completed sample, preserving earlier report files. It does not resume a prior remote collection: each segment creates an isolated host/collection and repeats original indexing plus native edit/deletion before measuring the remaining samples. `SM_CASE_START` is a convenience for starting at an entire question pair.

The Gemini 3.7 comparison used these continuations after two transient HTTP 503 failures. The final segment ended on a daily quota error, with only sample 15 remaining. These historical commands require the Gemini endpoint/key and `LLM_REASONING_EFFORT=low` in `.env.local`; do not run them with the OpenAI connection:

```sh
# After six completed samples (three full question pairs):
SM_MODEL=gemini-3.7-flash SM_CASE_START=3 npm run test:korean:live
# After nine completed samples (next uncompleted mode of question five):
SM_MODEL=gemini-3.7-flash SM_SAMPLE_START=9 npm run test:korean:live
```

Aggregate only non-overlapping samples from the same model and fixture:

```sh
node scripts/korean-summary.mjs --allow-partial \
  artifacts/generation-korean-eval-gemini-3.7-flash-partial.json \
  artifacts/generation-korean-eval-from-3.json \
  artifacts/generation-korean-eval-from-sample-9.json
```

Without `--allow-partial`, the summary command rejects missing samples. With that flag, it explicitly records incompleteness and compares only matched pairs. It always rejects duplicate case/mode results, different model/host settings, different runtime/fixture hashes, unconfirmed cleanup, or missing prompt-integrity checks. It preserves each segment's file hash and tested source hashes. It never chooses a better answer from repeated attempts. After quota reset, run `SM_MODEL=gemini-3.7-flash SM_SAMPLE_START=15 npm run test:korean:live`, then add its report to the summary inputs and omit `--allow-partial`. Source restoration and the fixed fixture keep the comparison identical across fresh collections; latency remains subject to provider load and cache state across segments.

## Evidence

- [Complete OpenAI comparison](../artifacts/korean-evaluation-summary-openai-gpt-4.1-mini.json) and [full OpenAI run](../artifacts/generation-korean-eval-openai-gpt-4.1-mini.json)
- [Partial Gemini comparison](../artifacts/korean-evaluation-summary.json)
- [Gemini 3.7 first segment](../artifacts/generation-korean-eval-gemini-3.7-flash-partial.json), [continuation from case three](../artifacts/generation-korean-eval-from-3.json), and [continuation from sample nine](../artifacts/generation-korean-eval-from-sample-9.json)
- [Summary command](../scripts/korean-summary.mjs)
- [Initial setup failure](../artifacts/generation-korean-eval-setup-failure.json): the host initially renders only the newest 100 messages, so the old edit target was absent. No generation calls occurred and cleanup succeeded. The harness now clicks the native Show more messages control before editing.
- [Host runner](../scripts/generation-smoke.mjs), [evaluation runner](../scripts/korean-eval.mjs), and [fixture](../scripts/korean-fixture.mjs)

- [Gemini 3.8 partial run](../artifacts/generation-korean-eval-gemini-3.8-flash-partial.json): nine completed answers, followed by a quota failure on the tenth request. Cleanup succeeded; this is not a complete eight-question comparison.
- [Quota diagnostic](../artifacts/korean-quota-diagnostic.json): one bounded retry after the indicated delay confirmed `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20 for `gemini-3.8-flash`. The short retry delay did not mean the daily quota had reset.
- [Alternative model probe](../artifacts/korean-alternative-model-probe.json): Gemini 3.7 returned a complete response before starting a separate full evaluation. No results are pooled across models.

Complete OpenAI results and the separate partial Gemini results are summarized in the [validation record](validation.md). All reports are local, Git-ignored review evidence. Credentials are never part of these artifacts.
