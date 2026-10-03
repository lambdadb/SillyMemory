# Assistant-topic retrieval boundaries v1

Fixed before live queries, alongside the actor diagnostic. No generation model
calls and no runtime change. Use the existing English/Korean long-dialogue sources
and banner fact (message 8), with recent 12, chunk size 800, budget 400, candidate
size 30 and the pinned host's gpt-4.1-mini tokenizer.

For each language run three synthetic variants once:

- First-user: imported/continued assistant-only history, then an assistant banner
  topic cue and the first user question. Change source roles to assistant for this
  diagnostic only. A normal one-message greeting has no old indexable history;
  this is an intentionally unusual long-history boundary, not that common case.
- Assistant-topic: original source roles, then an assistant banner topic cue and
  a generic user question. The preceding user turn is the old unrelated setup.
- Explicit-switch: a recent user/assistant exchange about a different map, then
  an explicit question naming the banner. The primary query should carry the new
  topic even when the preceding user query concerns the map.

Compare current v3 retrieval with the historical v2 query construction and the
same selector on shared per-text search responses. Poll only complete scoped
source visibility; query each distinct text once, no quality retry. Record target
ranks, selected source indices and content tokens for both policies, retaining
all misses. Source, role, scope, budget and key/cleanup checks remain required.

This is a six-case development boundary check, not generated-answer accuracy or
a new general regression benchmark. A source selected by v2 but lost in v3 here
is evidence of a selection tradeoff on that input. Do not revert to v2 based only
on it: v2 lost the separately demonstrated user-topic banner case. Designing a
new context policy needs a separate frozen comparison covering both directions.
