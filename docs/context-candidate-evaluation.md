# Label removal and adjacent-turn candidates v1

Freeze this protocol, fixture and implementation before requests. This is a
controlled development comparison of concrete selectors, not a production rollout
or a new retrieval benchmark. Runtime files remain unchanged while the candidates
are evaluated in the test harness.

## Candidates and budget

Use the same ordered seed source indices for all conditions. For the four old
pronoun cases these are every selected passage, in ranking order, from the first
memory-on repetition in the original actor diagnostic. Four new controls reuse
the corresponding fixed indices, with newly authored source wording. They have
not been queried against LambdaDB: do not describe their seed sets as live search
results or general recall evidence. Reconstruct documents from the frozen current
source, never from remote text or answer/rubric data.

1. **current:** the production labelled selector, within 400 host tokens. The
   experimental state machine must equal `selectMemory` on the same inputs.
2. **raw:** retain exactly the current selector's passages, remove only excerpt
   labels, keep native roles and production literal escaping. No backfill.
3. **adjacent:** start with raw; try adding the next assistant message for each
   retained user passage, or the previous user message for each retained assistant
   passage. Process anchors in original selected ranking order. Skip already
   retained neighbors and same-role runs; add the whole eligible neighboring
   message (all missing chunks) only if the final chronological text fits 400
   tokens. Continue to later candidates if one does not fit. Never evict a seed,
   recurse into newly added neighbors, or cross owner/scope/recent boundaries.

The window remains recent 12 including the new question; context is 8192 tokens.
All old text and participant names retain literal macro protections. Selected
messages stay in chronological order and original user/assistant roles. The
algorithm does not resolve or rewrite pronouns, paraphrase sources, or add answer
instructions. Missing/deleted/ineligible sources are absent from the local eligible
document set and cannot be reintroduced from a remote hit.

## Frozen sample and real-host execution

Eight cases, three conditions, two repetitions = **48 answers**, at most **56
provider attempts** with the existing bounded 5xx retry policy. Rotate condition
order by case plus repetition index; this is not perfectly position-balanced
because eight cases do not divide evenly into three conditions. Keep 15-second
provider-start spacing, gpt-4.1-mini-2025-04-14, temperature 0, output limit 256 and
the existing generation instruction. Never retry an HTTP-200 answer for quality.

The four development cases are unchanged English/Korean user/assistant pronoun
reports. Four new controls cover English and Korean third-party quotations,
an English actor correction in the adjacent turn, and a Korean question whose
price is never stated. These use familiar synthetic surroundings and are not an
independent held-out benchmark. The correction deliberately tests whether an
adjacent correction can be admitted within budget; it does not estimate how often
search would omit or find that correction. Keep development and new-control
scores separate as well as showing paired condition results.

Use the pinned SillyTavern 1.19.0 Generate/UI path and a test-only interceptor,
as in the earlier ablation. Production retrieval stays disabled during generation.
Actual host token counts drive every decision and are recorded as an ordered
text/count trace. Offline summarization replays every budget decision, reconstructs
all expected local source chunks, and compares the exact outgoing text, roles,
order and system prompts. Also check saved source preservation, one intervention,
unchanged code hashes, attempt bounds, provider spacing and owned cleanup.
The shared live LambdaDB proxy setup/cleanup gate is retained; it is not evidence
that either candidate has passed end-to-end retrieval/sync integration.

Missing required evidence is a measured quality result, not a reason to drop a
case: the correction may be absent in current/raw. Preserve these rows and use the
full-source semantic rubric. Judge actors, locations, correction precedence and
unknown answers manually; unsupported claims fail strict scoring. Produce an
unscored randomized human packet separately from provisional assistant labels.

## Stop and adoption rules

Stop after the frozen run. Report candidate regressions and residual failures,
including cases with missing evidence. Do not change the selector, fixture or
prompt in response to intermediate answers. This experiment does not create a
release quality gate. A candidate with unresolved development failures or new
control regressions stays experimental. Even a clean result needs broader held-out
cases, malicious-source/quotation checks and production lifecycle integration
before a separate runtime PR; unit tests of literal escaping do not prove semantic
prompt-injection resistance. No automatic promotion is authorized by this protocol.

```sh
node scripts/natural-dialogue.mjs --output artifacts/candidate-plan-v1.json --fixture actor-candidate-v1
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local \
  SM_NATURAL_PLAN=artifacts/candidate-plan-v1.json SM_ARTIFACT_TAG=candidate-v1 \
  node scripts/generation-smoke.mjs --natural --retry-transient
node scripts/natural-summary.mjs artifacts/generation-natural-candidate-v1.json \
  --output-dir artifacts/candidate-review-v1
```
