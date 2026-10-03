# Context-turn selection v1

## Design and development evidence

The v4 fallback does not switch away from an existing user topic. A new local
lexical heuristic compares context turns with earlier conversation vocabulary.
It uses distinct Unicode letter/number word trigrams (NFKC, lowercase), smoothed
IDF weights, and maximum TF-IDF cosine with an earlier eligible message. No
stopword list, answer oracle, generation-model call or LambdaDB change is used.
Each text is bounded to 6,000 UTF-16 code units; the reference corpus uses the
last 256 eligible nonempty messages strictly before the earlier context candidate.
Both candidate context turns and the generation anchor are excluded from that
corpus. This bounds cost and prevents a candidate scoring against itself.

Two fixed policies will be compared before new live searches:

- Relative: select the newer assistant context only if its score exceeds the
  prior user's score by a factor of 1.25. Ties retain the user context.
- Topical-latest: select the newer assistant context if its score is at least
  0.20, even when the prior user also has a specific topic. Otherwise retain v4.

Both require the assistant context to occur after the prior user, and before the
anchor. Missing user context keeps v4's existing assistant fallback. Continue,
regenerate/swipe, primary anchoring, query bounds/deduplication, two-query cap,
30 candidates, interleaving, source validation and token budgets are unchanged.
Lexical specificity is not semantic reference resolution. Paraphrases, brief
words, quoted distractions and different languages can defeat this heuristic.

Before writing the new corpus, replay of previous 38 recorded hit sets selected
32/32 sources at relative factors 1.0 and 1.25. Prefer the more conservative 1.25;
that result is development exploration on known data, not new live evidence.
The absolute threshold is a separately proposed recency rule for cases where
both context turns name concrete topics. Do not tune either threshold using
fresh results. Reference-corpus bounds did not change prior replay outcomes.

## Frozen comparison

Run all 48 previous fallback cases plus 14 new cases in context-turn-v1, once.
The new English theatre and Korean observatory dialogues have new people, objects,
locations, schedules and source text. Seven shapes per language: assistant topic,
user topic with acknowledgment, explicit switch, correction, quoted distraction,
paraphrase and unknown price. Only their question/context shapes are derived from
previous failures. This is a new synthetic development corpus, not an independent
human benchmark. There are 62 cases, 54 required sources and eight unknown cases.

Use the pinned SillyTavern 1.19.0 host/browser, built-in proxy and live managed
embeddings. Query every distinct text once per case and share exact hits among
v4 and both candidates; use the real host tokenizer and original case budgets.
Poll only complete scoped source visibility. No quality retries or source/rubric
edits. Preserve every score, query, rank, selection, token count and failure.

Prefer Relative if it selects the known Korean assistant-topic miss and both
languages' new assistant-topic/correction sources, with no loss of a v4-selected
required source anywhere. Otherwise consider Topical-latest by the same rule.
If neither qualifies, keep v4. Remaining paraphrase/other misses must be reported
even if v4 also misses them; unknown cases require generation to assess abstention.

## Conditional runtime and generation follow-up

If a candidate qualifies, integrate it exactly and verify runtime/query parity,
bounded scoring cost, replacement-answer exclusion, race/failure handling and
pinned-host recovery. Run the fixed new 14-case natural-dialogue schedule with
memory off/on, twice each: 56 answers, context 2,048, recent 8, memory budget 400,
output limit 256, gpt-4.1-mini-2025-04-14 at temperature 0. Require measured source
overflow and actual off-prompt truncation; verify source roles, recent/question
retention, source immutability, host-generated requests and key/data cleanup.
Use existing bounded identical-payload retries only for transient provider 5xx,
with at least 15 seconds between starts. No answer-quality retry. Read randomized
answers against the frozen rubric before condition-key aggregation. Assistant
scores remain provisional and the independent human gate stays unset.
