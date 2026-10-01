# Historical quality and integration context

These records preceded the 0.2.0 candidate. Their limitations and evidence
boundaries remain applicable; the current results are in
[managed recall validation](managed-packed-results.md) and the subsequent
[equal-context three-mode comparison](three-mode-results.md) and its
[native Insert# sensitivity follow-up](native-tuning-results.md). The later
[built-in Summarize comparison](summarize-results.md) adds a concurrent summary-on
versus memory-off arm; it does not pool scores across cohorts.

Development now includes [repeated passage packing](repeated-passage-packing.md):
identical selected excerpts share one body with all selected source positions,
freeing budget for distinct retrieved context without evicting existing sources.
This recovers the missing signature in both recorded Korean quotation failures;
at that milestone, actual-host tests verified delivery only. The subsequent
managed run delivered all required evidence but still omitted the author in both
Korean quotation answers (provisional 30/32).

**Validation status:** experimental. Unit/CI coverage is separate from host and provider validation; see the [latest capacity audit](prompt-capacity-results.md). The prior 48-answer [candidate comparison](context-candidate-results.md) scored current labels 9/16, label removal 10/16 and label removal plus adjacent turns 11/16 provisionally. On the new controls, however, scores regressed from current 7/8 to 4/8 and 6/8; the original English user-report failure remained. Both candidates stay test-only. This was a frozen-seed prompt experiment with generation-time retrieval disabled, not a runtime fix or retrieval benchmark. Independent human review is pending.

The preceding [label/context ablation](actor-ablation-results.md) isolated contributions from both labels and omitted surroundings (full-raw 8/8, full-labelled 4/8, sparse-raw 6/8, sparse-labelled 2/8). These controlled results did not establish that label removal or local context expansion would generalize.

The preceding [reported-actor diagnostic](actor-perspective-results.md) found six memory-only actor failures (off 16/16, on 10/16) despite complete baselines and correct source API roles. Its separate search-only boundary check selected 4/6 targets in both v3 and historical v2, missing two Korean assistant-topic references.

The [assistant-topic query comparison](assistant-topic-results.md) added two fixed assistant-context policies across 38 search-only cases. Both recovered one boundary but lost the prior-user Korean reference; neither qualified in that experiment. Adding queries alone did not resolve competition within the token budget.

The [v4 assistant fallback](assistant-fallback-results.md) introduced prior assistant context only when no earlier nonempty user message exists. In 48 search cases, required-source selection improved from 37/42 to 41/42 without losing an existing success. A 24-answer real-host follow-up delivered all 12 required on-mode sources (provisional off 0/12, on 12/12). That version left the ordinary Korean assistant-topic case unresolved; independent human review is pending.

The [v5 context selection](context-turn-results.md) uses a newer assistant
turn when its local lexical match to older history is stronger than the prior
user's. A frozen 62-case live search comparison selected 54/54 required sources
versus v4's 53/54, recovering the remaining Korean boundary in that search configuration with no existing loss.
The new English/Korean corpus was already 12/12 under v4, so it supplies regression
coverage rather than a further comparative gain. This does not resolve the earlier
actor-attribution failures or establish general semantic understanding. A separate
64-answer actual-host run scored off 4/32 and on 28/32 provisionally. Its effective
budget was 320 tokens: the historical Korean target was again excluded, and two
Korean paraphrase answers were partial despite receiving the source. The assistant
quality gate remains false; independent human review is pending.

The earlier [v3 long-dialogue evaluation](context-selection-results.md) used a smaller 2,048-token context and demonstrated retrieval of evidence lost by truncated baselines (on 12/12; provisional off 4/16, on 12/16). These are different cohorts and settings, not pooled results or general quality/release-readiness guarantees. See the [validation record](validation.md).

The real Git URL installation/update check passed 17 assertions for the `SillyMemory` URL, including settings retention and session-key clearing. This tested two unreleased 0.1.0 commits, not an upgrade between published releases; see the [installation validation](validation.md#repository-naming-and-installation--2026-09-28).
