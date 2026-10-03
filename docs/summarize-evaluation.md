# Native Summarize comparison protocol

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Compare native Summarize with a concurrent memory-off control on the existing
16 fixed English/Korean 60-message cases. One answer per case/mode (32 answers),
alternating answer order by case. Prior native-vector and SillyMemory cohorts
remain historical references, not concurrent arms. This is a familiar synthetic
regression cohort, not held-out or general product-quality evidence.

Use pinned SillyTavern 1.19.0, the existing model snapshot, temperature 0, context
1,536 and response cap 256 for BOTH summaries and answers. Choose built-in
Summarize Main API / Raw blocking, its unchanged default summarization prompt,
a 100-word target and default summary injection template/position. Disable native
Vector Storage and SillyMemory; no LambdaDB or embedding calls are permitted.

For new runs, install native-vector route guards before host navigation and
record/block embedding requests at the local bridge, including failed attempts.
Block native indexing as well as queries to prevent server-side embedding calls.
Any attempt fails the run; checkpoints and final reports retain the attempts and
collector coverage. Empty arrays without collector coverage do not verify absence.
The historical v1/v2 runs predate these guards; their embedding/vector absence is
unverified, including when their samples are reused in an instrumented continuation.

Import the source history and invoke the real `/summarize` command repeatedly
until its source cursor covers index 58. The host always excludes the last
message; index 59 remains recent raw context. Each invocation incorporates the
previous summary and the next source messages fitting its context. At most six
summary calls per case, 96 overall. The question and answer rubric are never
provided during summarization. This is manual catch-up of imported history using
the native rolling update mechanism, not verification of automatic message-event
scheduling. Pause automatic updates to preserve the declared call schedule.

Preserve every intermediate summary, exact model request, source cursor, provider
usage and finish reason, including truncated or inaccurate summaries. Never retry
a successful low-quality result. Stop on missing progress or protocol failure;
do not omit a difficult case or silently increase its context/call bound.

Then create isolated summary-on and summary-off chats from the identical source.
Use the generated native summary metadata only in the on arm. Record exact
summary delivery, recent-turn preservation, answer text, input/cache/output tokens
and elapsed times. Separate summary-generation overhead from answer usage. Do
not equate paraphrased summaries with exact-source quotation coverage: answer
and summary fidelity require explicit provisional annotations against the rubric.

Total bound: 128 scheduled provider requests plus eight transient HTTP retries;
136 maximum, at least 15 seconds between provider starts. Transport policy stays
the existing bounded retry policy. No extra retry for HTTP 429, ambiguous transport
failure, answer quality or summary truncation. Remove the disposable host profile
and stop the server; audit saved settings for credentials. No product changes.

```sh
ST_SOURCE=/pinned/host node scripts/summarize-plan.mjs artifacts/summarize-plan.json
ST_SOURCE=/pinned/host SM_ENV_FILE=/outside/repo/.env.local \
SM_MODEL=gpt-4.1-mini-2025-04-14 SM_NATURAL_PLAN=artifacts/summarize-plan.json \
SM_ARTIFACT_TAG=v1 node scripts/generation-smoke.mjs --summarize --retry-transient
```

## Declared continuation

The first execution stopped after 34 successful calls (24 summaries and ten
answers): four summaries of the Korean negation case covered only through index
55. Its frozen four-call per-case cap was insufficient. Preserve the interrupted
report and initial plan. Version 2 changes only that capacity bound to six and
the corresponding global bound; settings, source, prompts and scoring stay fixed.
Resume its exact ten completed answers and 24 summaries without regeneration.
Restore prior summary metadata at its recorded source indexes and continue from
index 56. Verify provider spacing separately for each process lifetime and report
the restart boundary independently; never rewrite monotonic timestamps.

```sh
ST_SOURCE=/pinned/host node scripts/summarize-plan.mjs artifacts/summarize-plan-v2.json docs/results/summarize-v1-interrupted.json
# Use this plan with a fresh SM_ARTIFACT_TAG for the continuation.
```
