# Long dialogue evaluation v1 — frozen before execution

## Purpose and boundaries

Evaluate the reviewed native-role runtime from PR #16 without changing retrieval,
prompt wording, actor handling or generation instructions after seeing answers.
The previous eight-case speaker diagnostic remains failed. This separate test
asks whether source roles, corrections and contextual references survive a host
context limit and whether an unknown price remains unknown.

The fixture has two new 64-message invented conversations (canal archive in
English; railway exhibition in Korean), with different people, objects and times.
Each turn is written out; no repeated filler loop expands the history. The scenes
share preparation topics and structure, so they are **two related synthetic
stories, not independent natural user data**. Their author knows the runtime and
prior failures. This is a frozen development evaluation, not blind held-out data
or proof of general usefulness. No personal chats are used.

## Inputs, budget and execution

Source: [long-dialogue-v1.json](../tests/fixtures/long-dialogue-v1.json).
Four cases per language: reported actor/location, explicitly corrected time,
contextual reference to a named delivery, and an unspecified admission price.
All answer-bearing and superseded evidence lies outside the last 12 messages.
Reference cases add two recent turns naming the object but not the answer.
The oracle remains outside browser/model inputs.

Use the unchanged reviewed runtime, pinned SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, OpenAI
`gpt-4.1-mini-2025-04-14`, temperature 0 and the existing natural-dialogue
instruction. Fix host context at **2,048 tokens**, recent window **12**, memory
content budget **400**, maximum output **256**. The smaller host context is an
intentional stress condition, not the model's maximum context. The memory budget
stays below the runtime's one-quarter-context cap. Provider message envelopes and
other host prompts are outside the memory-content budget.

Eight cases × two repetitions × off/on = **32 scheduled answers**, with alternating
condition order reversed in repetition two. Restore an isolated exact source chat
before each sample. Verify with the host tokenizer that source text alone exceeds
2,048 tokens **before generation**, and verify actual truncation in every outgoing
off prompt. Record recent/source preservation, each excerpt's native API role,
selected/current IDs, required/superseded evidence presence and ranks, usage,
latency, actual provider starts, secret audit and owned-data cleanup.

Use the existing bounded transport-only retry policy: at most two retries per
sample and eight extra attempts per complete run (at most 40 planned attempts),
only explicit 500/502/503/504 responses, identical request bodies, and actual
upstream starts at least 15 seconds apart. Do not retry a successful but wrong
answer. Preserve incomplete/failed reports; never splice runs or change inputs
based on results. Resolve owned cleanup before another run.

## Frozen semantic rules

Accept paraphrases of every required meaning; do not require verbatim quotes or
a code-only response. For actor questions, the person described must be correct,
not just the source speaker. A correct location with the wrong actor is incorrect.
A corrected time must be the current answer; endorsing both old and new is wrong.
For references, both the correct person and arrival time are required. An unknown
price must be acknowledged as unspecified; guessing a price or free admission is
incorrect. Record unsupported extra assertions separately, including personal acts.

Score randomized answers against the full source before opening mode/repetition
mappings. Preserve partial/incorrect/abstained distinctions and written rationales.
Assistant annotations are explicitly provisional; only an identified human review
can populate the human semantic gate. Keep every case/repetition pair. The strict
on-mode diagnostic requires 16/16 passed answers, including unknown handling.
A failed gate is still a valid reported evaluation, not grounds to relabel answers.

Compare prompt evidence before interpreting answer differences: an off failure
without its source is a context-truncation effect; a correct hit absent from the
selected memory is a selection/budget issue; a wrong answer with the evidence in
the outgoing prompt is a generation/interpretation failure. These observations do
not establish ANN ground truth. Report both outcomes, prompt tokens and latency;
do not infer total cost savings without embedding and LambdaDB usage accounting.

## Reproduction and review

```sh
node scripts/natural-dialogue.mjs --output artifacts/long-dialogue-plan-v1.json --fixture long-dialogue-v1
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/original/.env.local \
SM_NATURAL_PLAN=artifacts/long-dialogue-plan-v1.json SM_ARTIFACT_TAG=long-dialogue-v1 \
npm run test:natural:live -- --retry-transient
node scripts/natural-summary.mjs artifacts/generation-natural-long-dialogue-v1.json --output-dir artifacts/long-dialogue-review-v1
# Have an independent reviewer fill a copy of blind-review.json; withhold review-key.json.
node scripts/natural-score.mjs artifacts/generation-natural-long-dialogue-v1.json annotations.json artifacts/long-dialogue-review-v1/review-key.json --output artifacts/long-dialogue-human-score-v1.json
```

Freeze and retain byte hashes for runtime, fixture, protocol and harness before
requests. Do not edit this protocol to fit observations; record results separately.
Main promotion, release, World Info integration and sustained-use testing remain
separate work.
