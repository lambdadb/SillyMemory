# Natural dialogue recall: frozen protocol v1

## Status and purpose

This is an **offline corpus and scoring protocol**, prepared after v0.1.0. No
model or LambdaDB calls have been made for these cases. The exporter does not
execute generations, retrieve live results, or calculate answer quality. A
browser/live runner and human-scored results remain subsequent work.

The previous held-out corpus used short storage codes and repeated scene text.
This corpus uses ordinary locations, changed travel/delivery plans, distinct guest
requests, topic changes and unanswered questions. All people and conversations
are invented. The four 32-message histories are short, curated synthetic dialogues;
they are not personal chats, independent human-authored data, a context-overflow
benchmark, or evidence of long-duration reliability. English and Korean versions
share scene structure but differ in names and facts; they are not 16 independent
stories. The corpus was authored with the current query policy visible and must
not be described as blind held-out evidence of that policy.

## Frozen corpus and sample schedule

Source: [natural-dialogue-v1.json](../tests/fixtures/natural-dialogue-v1.json).
Version: `natural-dialogue-v1`. SHA-256 of the parsed fixture serialized with
`JSON.stringify` (including oracle and settings):
`17fa71452939ed093a5e16e67973a17380e806eade85ebe9754ff0a904e0555e`.
The offline plan also records byte hashes of the protocol, fixture, exporter and
runtime. Freeze that plan before the first model request. Changes after observing
answers require a new version and a separately reported development retest.

| Scene | Languages | Cases per story |
| --- | --- | --- |
| Observatory outing: meeting point, equipment, corrected return transport | English, Korean | Topic return, correction, reference, unknown |
| Print workshop: key, guest requests, corrected delivery day | English, Korean | Topic return, correction, reference, unknown |

There are 16 cases. All answer-bearing evidence is outside the 12-message recent
window, including the final question. Reference cases add a two-message exchange
naming the referent without its answer. Correction cases contain both an earlier
claim and a later explicit correction; the old text remains valid conversation
history. This is semantic correction handling, not deletion synchronization.
Unknown cases ask about an admission price or delivery fee that was never stated.

Use memory off/on twice per case: **64 scheduled answers, at most 64 provider
attempts**, no automatic retries or sample substitution. The condition order
alternates by case and reverses on the second repetition. Restore the exact source
and use isolated chat identity before each sample; clear any prior generated answer
and memory injection. Preserve failures and incomplete runs; do not splice failed
prefixes into a later successful run or report partial data as complete.

Planned fixed configuration: SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, the reviewed runtime pinned in the
exported plan, `gpt-4.1-mini-2025-04-14`, temperature zero, 256 maximum output tokens,
8,192 host context tokens, 12 recent messages and 800 memory tokens. Availability
must be checked before execution; do not silently substitute a model. Two samples
at temperature zero measure bounded repeatability, not an independent population.

Use the exact `generation.instruction` in the fixture as the character prompt in
both conditions (the instruction asks for the language of the question):

> Answer the user's question using only this conversation. Follow explicit corrections. If the requested information is not stated, say so without guessing. Reply in the language of the question.

Do not prescribe a code-only format. Render
only `input.source` and `input.question` as conversation messages. `rubric`,
expected meanings, evidence quotes and case-kind labels are evaluator-only data;
never send the complete exported case object to the model.

## Scoring before observing outputs

The fixture supplies exact zero-based source message indices and quotations plus
the required meaning. Accept paraphrases, normal Korean particles, punctuation
and natural time expressions. A reviewer assesses the *assertion*, not whether a
keyword appears. Keep each raw answer and a short rationale next to its score.
Blind the reviewer to mode and repetition until annotations are final. Unclear
cases stay unscored pending a second review; do not resolve ambiguity by changing
the oracle or accepting the observed wording retroactively.

| Outcome | Rule |
| --- | --- |
| Correct | Every required meaning is asserted, with no incompatible current answer. |
| Partial | Some required detail is missing (for example, only the closet but not its shelf), with no contradictory answer. |
| Incorrect | The answer endorses a wrong place/time/person/ingredient, including a superseded fact, or contradicts the expected meaning. |
| Abstained | An answerable case is explicitly unanswered. Report separately from incorrect. |
| Unknown handled | An unknown case explicitly says the requested value was not stated and invents no value. |

Record an additional `unsupportedAssertion` flag for invented material even if
the required answer is present. A qualified guess of an unstated price fails the
unknown case. Saying "not Saturday" is not correct merely because it contains
"Saturday". Mentioning both Friday and Saturday passes the delivery correction
only if Saturday is clearly identified as the final date and Friday is rejected.
Likewise, listing both guests' restrictions is acceptable only when each is
correctly attributed. Never use the old code-presence grader for these cases.

Score retrieval separately: whether every required source passage is in injected
memory and in the outgoing prompt, and whether a correction's old passage appears
without the later correction. Both old and corrected passages may legitimately
appear together. Unknown cases can retrieve related context; retrieving anything
is not itself hallucination. Generated unsupported assertions are a separate axis.
Do not label a miss as an ANN defect without controlled indexing/ranking evidence.

## Integrity and measurements for the future live runner

A valid sample requires original source equality before/after generation, current
source IDs only in injected passages, complete provider output matching the saved
host answer, recent-message retention, injection within the host-tokenized budget,
and per-stage request/response evidence. Measure the actual host context boundary;
if ordinary off-mode history is truncated, report it explicitly and stratify those
cases instead of claiming equivalent context. No padding to force overflow.

Record sample IDs, exact source/runtime/harness identities, selected source IDs,
query texts/ranks, injected and outgoing text, generation parameters, host token
counts, provider usage, and monotonic timings for sync, retrieval and generation.
Record LambdaDB request counts and status codes; distinguish initial indexing from
per-question retrieval. Managed-embedding token charges may not be observable:
mark unavailable usage/cost fields unknown, never zero or inferred savings. Keep
credentials and any unrelated chats out of reports. End the run with verified
owned collection cleanup; preserve pending-cleanup identity if cleanup fails.

Report outcomes by language, case kind and mode with both individual repetitions.
Primary quality gate: all 24 answerable on-mode samples are correct without
unsupported assertions, and all 8 unknown on-mode samples are handled. Partial
answers do not pass. This is a deliberately strict diagnostic gate; failure should
identify cases for follow-up, not motivate tuning the frozen corpus. Report off
results and paired differences even when on-mode loses. No significance or
superiority claim from these 32 paired observations, which reuse four histories.
Summarize timing medians and ranges; retain every request/failure count. Do not
turn synthetic results into a universal usefulness or cost claim.

## Offline reproduction

```sh
node scripts/natural-dialogue.mjs --output artifacts/natural-dialogue-plan-v1.json
node --test tests/natural-dialogue.test.js
```

The exporter refuses to overwrite an existing file. Use another filename for a
new plan. It verifies that required evidence is indexable using the production
`capture`/`documents` functions and checks the actual query builder's question
anchor. It does not emulate ranking, tokenization, provider answers or cleanup.
`results: null` is intentional. Inspect `cases[].input` and the separate oracle
in `cases[].rubric` before implementing or running the live adapter. This corpus
preparation does not run the separate sustained-use/recovery workstream.
