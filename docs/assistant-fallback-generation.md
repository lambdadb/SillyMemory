# Assistant fallback host generation v1

Freeze after the search comparison and before generation. Six cases reuse the
first-user boundary and new explicit-switch/correction input shapes in English
and Korean, with the same old facts and answer rules. This is a development
follow-up, not held-out content. Source histories are assistant-only synthetic
imports, followed by the first user question. Names match the actual host
character. Ordinary first-user greetings without old indexable history are not
the problem demonstrated here.

Run two repetitions of memory off/on for each case (24 scheduled answers), using
the existing natural host-generation harness, OpenAI gpt-4.1-mini-2025-04-14,
temperature 0, context 2,048, recent 12, memory budget 400 and output limit 256.
Preserve the instruction, source, question and oracle. Freeze hashes in a new
plan. Require measured source overflow and actually truncated off prompts;
verify selected text/roles, required-source delivery, recent/question retention,
persisted source immutability and the real outgoing provider payload.

Use the existing bounded transient retry policy for HTTP 500/502/503/504 only,
with identical payloads, fixed budgets and at least 15 seconds between provider
starts. No quality retries. Retain all failures and provider attempts. Complete
key audits and cleanup of exclusively owned test resources.

Report source delivery separately from provisional semantic answer review.
Read randomized answers with their frozen evidence before aggregate scoring;
keep the human review packet unfilled and independent human status unset.
Off/on outcomes do not directly measure a v3/v4 answer-quality difference:
the search-only shared-hit comparison establishes that narrower retrieval change.
No unknown-answer or general actor-attribution claim follows from these cases.
