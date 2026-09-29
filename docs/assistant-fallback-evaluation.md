# Assistant fallback evaluation v1

This is a narrower follow-up to the rejected three-stream query policies.
Exploration of five rank-fusion/score-density policies on the previous raw hits
found regressions in every candidate (28, 23, 31, 28 and 28 of 32 sources selected;
baseline 30). The best replay still lost the Korean time correction. Those are
development replays using the pinned host tokenizer's content-plus-six count,
verified against all 38 original baseline token counts; not fresh live evidence.
Do not adopt those rank-fusion candidates.

Freeze this smaller candidate before new live calls: keep the preceding user
query whenever one exists. Only if there is no preceding nonempty user message,
use the preceding nonempty assistant message. Both must be strictly before the
anchor. Keep v3 anchoring for normal/regenerate/swipe/continue, 6,000-character
query bounds, deduplication, at most two queries, candidate count 30, interleaving
and whole-passage/token-budget selection unchanged. The retained assistant answer
must never become context for its own replacement.

Compare baseline v3 and fallback once on all previous 38 cases plus ten new
controls: English/Korean first-user explicit switches, final-time corrections,
blank assistant turns, retained answers and blank user turns. The controls reuse
the long-dialogue source corpus; they are new input shapes, not held-out content.
Every distinct query runs once per case through pinned SillyTavern/browser/proxy
and live managed embeddings. Share exact responses across policies and poll only
complete scoped source visibility. Keep all original budgets, targets and misses.

Adopt only if both first-user boundary targets and all ten new controls are
selected, without losing any baseline-selected required source in all 48 cases.
The ordinary Korean assistant-topic miss is explicitly outside this narrower fix
and must remain reported. Do not change the criterion or retry for quality.
Unknown cases have no required source; coverage is not abstention evidence.

If qualified, integrate the exact candidate and verify parity across all cases,
query failure cancellation, pinned-host recovery, and actual host generation
with a separately frozen small schedule covering first-user references, explicit
switches and corrections. Preserve source hashes, key audits, owned cleanup,
provisional grading and the distinction from independent human quality evidence.
