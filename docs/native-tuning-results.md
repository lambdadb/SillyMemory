# Native Insert# sensitivity results — 2026-10-01

The earlier quality gap was substantially configuration-dependent. This follow-up
changes only built-in Vector Storage's **Insert# from 3 to 10**. Source retrieval
and final answer quality are separate outcomes; delivering all required source
text does not guarantee that the model states every required fact.

## Matched actual-host comparison

The [frozen protocol](native-tuning-evaluation.md) and
[exact plan](results/native-tuning-v1-plan.json) repeat the same 16 English/Korean
60-message cases twice per setting. Settings alternate within each case and
reverse order for repetition two. Both settings use SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, `gpt-4.1-mini-2025-04-14`, temperature 0,
output limit 256, context setting 1,536, protect 8, query 2, threshold 0.25,
chunk 400 and the original native template/placement. Every answer comes from
the actual SillyTavern generation path. Native embeddings use live OpenAI
`text-embedding-3-small` through the host's existing adapter and a private test
bridge. SillyMemory is disabled; this cohort makes no LambdaDB requests.

| Measure | Native Insert# 3 | Native Insert# 10 |
| --- | ---: | ---: |
| Actual-host answers | 32 | 32 |
| All required evidence in known-answer prompts | 14/28 | 28/28 |
| Provisional strict answer passes, including unknowns | 18/32 | 29/32 |
| Unknown-price controls without invented prices | 4/4 | 4/4 |
| Median provider input tokens | 1,225.5 | 1,232.5 |
| Median cached input tokens | 1,024 | 0 |
| Median host generation time | 1.542 s | 1.511 s |
| Median preparation/synchronization time | 0.977 s | 0.946 s |
| Maximum injected memory tokens | 117 | 472 |
| Exact recent seven source turns and current question retained | 32/32 | 32/32 |

Insert# 3 passed 9/16 in each repeat. Insert# 10 passed 14/16 and 15/16:
the English locker identity was omitted once, and the Korean signed-note author
was omitted twice despite complete evidence. There were no incorrect unknown-price
answers. No existing strict pass was lost when increasing Insert# in either repeat.

The run completed **64/64 answers**, **774 execution checks**, zero generation
retries and zero native embedding failures. All 64 native indexes were purged
and listed empty. The disposable profile was removed, the child server stopped,
and the persisted-key audit passed. LambdaDB received zero requests. Native
embeddings used 256 calls and 40,200 tokens. Actual generation-provider starts
were at least 15,000.014 ms apart. Generation time includes retrieval, excludes
the deliberate spacing wait, and is separate from fresh-chat preparation time.

For context only, the [earlier SillyMemory cohort](three-mode-results.md) passed
30/32 with 28/28 complete evidence and median input 690.5 tokens. The tuned native
result almost closes the provisional answer-quality gap and fully closes source
delivery on these cases. A one-answer difference across separate cohorts is not
robust evidence of SillyMemory quality superiority. SillyMemory's remaining
measured distinction is its lower input-token use under its bounded replacement
policy; the earlier median is about 44% below this tuned-native median. This is
not a total-cost saving estimate: cache usage differs, and managed embedding and
storage usage are unavailable. Given tolerance for second-scale latency, prioritize
answer fidelity and context efficiency over the small observed timing difference.

## Why the setting matters

The pinned native implementation requests `topK = Insert#`, then excludes recent
protected messages from insertion without refilling those slots. In the Korean
negation case the top three were a recent topic cue, the old incorrect leaflet
and a recent assistant question. The correction was fourth. Insert# 3 therefore
injected only the false leaflet; Insert# 10 included the correction. Both repeats
show the same correction recovery. This is evidence about query selection and
insertion policy, not evidence of an ANN defect or a superior storage engine.

More retrieved passages also include irrelevant older padding. Native keeps
other history until the host's context packing trims it. Increasing Insert#
therefore changes prompt composition without implementing SillyMemory's policy
of replacing eligible old history with a separately bounded memory budget.
Do not assume 10 is optimal or always fits a different context, model or chat.

## Evidence and limits

The [raw report](results/native-tuning-v1-raw.json),
[mechanically derived summary](results/native-tuning-v1-summary.json),
[unfilled review packet](results/native-tuning-v1-review.json),
[assistant annotations](results/native-tuning-v1-assistant-annotations.json) and
[derived provisional score](results/native-tuning-v1-assistant-score.json) retain
all scheduled answers. The coding assistant read every answer against the source
and rubric. These grades are not blinded or independent human review. All source
hashes resolve to current or exact archived bytes. `npm test` revalidates evidence,
settings, provider responses, cleanup, exact recent-turn order and annotations;
mutation tests reject changed settings, foreign chat queries, missing samples,
lost prompts, altered answers, LambdaDB traffic and incomplete cleanup.

This is a declared post-hoc sensitivity study on familiar synthetic cases with
repeated padding, not held-out generalization. Earlier SillyMemory scores are a
separate cohort, not a simultaneous third arm. Timing and cache differences
across cohorts are not causal estimates, and embedding/storage usage does not
support a total-cost comparison. No successful low-quality answer is retried.
Product runtime, installation version, public main and release state are unchanged.
