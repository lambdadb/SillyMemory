# Built-in Summarize results — 2026-10-01

This actual-host comparison evaluates SillyTavern's built-in Summarize extension
against a concurrent memory-off control. Earlier Vector Storage and
SillyMemory results are references from separate runs.

## What ran

The [frozen protocol](summarize-evaluation.md) and
[plan](results/summarize-v2-plan.json) use the same 16 English/Korean 60-message
synthetic cases, unchanged questions/rubrics, SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, `gpt-4.1-mini-2025-04-14`, temperature 0,
context 1,536 and maximum output 256. Each case receives one answer per arm;
answer order alternates by case. Summaries and answers share the context limit.

Native Summarize uses Main API / Raw blocking, its original default instruction,
a 100-word target, and the default summary wrapper/placement. The real
[`/summarize` implementation](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/memory/index.js#L754) repeatedly consumes the next contiguous source messages plus
the previous summary until it covers source index 58. The host excludes the last
message, which remains in recent raw context. No question or answer rubric is
provided during summarization. Every intermediate summary and source cursor is
retained, including unfavorable outputs. Summary generation is separate from the
subsequent answer calls and its overhead is reported separately.

This is manual catch-up of imported history using the native rolling-summary
mechanism, not a test of automatic scheduling during interactive conversation.
Automatic updates remain paused, so answer generation cannot modify the summary.
Vector Storage and SillyMemory are disabled; LambdaDB and embedding APIs are not
used. The model key stays in the local test bridge process.

The initial run stopped at its four-summary-call per-case limit, after 34
successful provider calls. The Korean negation case had reached only index 55.
The [interrupted report](results/summarize-v1-interrupted.json) and
[initial frozen plan](results/summarize-v1-initial-plan.json) are retained. The
continuation increased the cap to six, restored the exact prior summary metadata,
and reused all ten existing answers and 24 summaries without regeneration.
The final report's prefix must match the interrupted report exactly. Provider
spacing is verified separately within each process; the restart boundary uses a
reported wall-clock lower bound rather than rewriting monotonic timestamps.

## Measured results

| Measure | Memory off | Native Summarize |
| --- | ---: | ---: |
| Actual-host answers | 16 | 16 |
| Provisional strict passes, including unknowns | 2/16 | 10/16 |
| English / Korean strict passes | 1/8 / 1/8 | 7/8 / 3/8 |
| Unknown-price controls without invented prices | 2/2 | 2/2 |
| Median answer input tokens | 1,234 | 1,235 |
| Median cached input tokens | 1,024 | 0 |
| Median answer generation time, excluding deliberate pacing | 1.346 s | 1.255 s |
| Median injected summary tokens, host count | 0 | 121.5 |
| Exact recent seven source turns and current question retained | 16/16 | 16/16 |

The 16 histories required **69 summary calls**, four or five per history, in
addition to the **32 answer calls**. Summary generation consumed **58,694 input
and 9,176 output tokens**, with zero cached input tokens and zero truncated
summaries. Median cumulative summary-generation time per history was 8.713 s,
excluding deliberate provider pacing. This is imported-history catch-up overhead;
it is not a per-answer charge or a measured steady-state update cost. Reusing a
summary for more questions changes amortized overhead. Provider input tokens do
not establish dollar cost, particularly with the observed cache differences.

All **101 provider calls** completed successfully with **zero transient retries**.
The one capacity-bound interruption is preserved as described above; it was not a
provider error. Both disposable profiles were removed and their servers stopped;
no LambdaDB collections were created and no embedding API calls were made. Persisted-key audits
passed. Provider starts were at least 15 seconds apart within each process, and
the restart boundary's conservative wall-clock gap was 171.156 s. The final
recent-turn role/order check passes on every answer, independently of substring
coverage in the live capture.

Provisional final-summary fidelity for the rubric’s required facts was complete
on **8/14 known-answer cases**,
partial on five and incorrect on one. The two unknown controls invented no price.
Final answer failures were: Korean minimal fact, English/Korean speaker assignment,
Korean leaflet correction, Korean locker reference and Korean signed quotation.
The first, locker and quotation answers abstained; English speaker assignment and
Korean leaflet correction were partial; Korean speaker assignment was incorrect.

For context only, the earlier [tuned native-vector cohort](native-tuning-results.md)
passed 29/32 with median input 1,232.5, and the earlier
[SillyMemory cohort](three-mode-results.md) passed 30/32 with median input 690.5.
Those have two repetitions and were collected in separate runs; this cohort has
one paired answer per case. They are not pooled or concurrent comparison arms.
The current experiment supports a benefit over no memory under this configuration,
but it does not establish superiority over an optimized summary system.

## Interpretation

Summarization is another form of memory: it retains a generated representation
of earlier conversation instead of searching for source passages at question
time. Here, every source message through index 58 was presented to the summarizer
in order. That establishes source consumption, not preservation of each fact.

The Korean minimal-fact case illustrates recursive information loss. The first
summary correctly contains Daeun, the jade telescope and Tuesday afternoon. The
second summary drops the person and time while retaining repeated housekeeping
details. Later summaries cannot recover those facts from their source windows;
the final answer abstains. The original chat still contains the facts, but they
are outside the final answer's context. This is distinct from the Korean
quotation failure previously observed after SillyMemory delivered all source.

The Korean speaker case adds a different failure: the final summary combines the
user's Friday bundle with the assistant's Sunday document case into one Friday
collection. The answer follows that incorrect summary and denies the assistant's
commitment. This is a transformation error in the summary, not merely a missing
retrieved chunk.

The 100-word target is an instruction, not a deterministic compression rule.
This is a declared configuration, not all factory defaults: the built-in UI's
original target is 200 words. No 200-word or optimized-summary comparison ran.
The test does not establish that a different summary prompt, target length,
update interval, language policy, stronger model or hybrid summary/retrieval
system would behave the same. The repetitive synthetic padding may particularly
favor the wrong details during summarization. Do not generalize this configuration
to all summary-based memory systems or claim knowledge of a commercial character
chat service's internal implementation.

Native Summarize injects its summary while the ordinary host still fills available
context with recent history. Summary generation by itself therefore does not
implement SillyMemory's bounded replacement policy, and should not automatically
be counted as a reduction in provider input tokens.

## Review and reproduction

The [raw report](results/summarize-v2-raw.json),
[derived transport/usage summary](results/summarize-v2-summary.json),
[unfilled review packet](results/summarize-v2-review.json),
[assistant annotations](results/summarize-v2-assistant-annotations.json), and
[derived provisional score](results/summarize-v2-assistant-score.json) separate
mechanical delivery checks from answer correctness and final-summary fidelity.
Exact-source quotation coverage is not used to grade paraphrased summaries.
Assistant grades are not blinded or independent human review.

`npm test` revalidates all recorded producer hashes, the immutable plan, source
cursors, exact previous-summary-plus-source requests, final summary injection,
provider responses, usage and the absence of embedding/LambdaDB traffic. Mutation
tests reject missing or reordered inputs, leaked questions, rewritten answers,
missing summary delivery and altered annotations. Successful inaccurate answers
or summaries are never retried.

The product remains experimental. This change adds test tooling and evidence;
it does not change the installed extension, publish a release, or promote main.
