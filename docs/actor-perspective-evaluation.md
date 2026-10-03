# Reported-actor diagnostic v1

Freeze this protocol and fixture before requests. This is a development diagnostic
of the remaining reported-action errors, not a runtime fix or held-out benchmark.
Do not tune wrapper instructions repeatedly on the earlier failed cases.

## Factors and controls

Eight synthetic cases cross English/Korean, user-reports-assistant versus
assistant-reports-user, and second-person versus explicit participant names.
Each matched wording pair has identical source roles, surrounding history,
question, settings and expected actor/location; only one source message changes.
The explicit-name variant also names the observer to separate both actions.
This is a test-fixture intervention, not a product rewrite of conversation text.

Reuse the 64-message long-dialogue surroundings but replace the old map exchange
with one unambiguous report and a neutral neighboring message. Both languages now
say the map is **in** the container. Historical fixtures and the unresolved old
spatial rubric are untouched. Source names use `User` and `SillyMemory E2E Mira`,
matching the existing host test identities. Earlier reports used other character
names in memory labels while the host requested a reply as SillyMemory E2E Mira;
that is a possible confound, not an established cause. This run does not isolate
that name-alignment effect from historical runs or estimate model-internal causes.

For every case, compare full-history memory-off with current v3 memory-on,
twice in the existing counterbalanced order: **32 answers**, maximum **40 provider
attempts** with the unchanged bounded 5xx retry policy and 15-second send spacing.
Use SillyTavern 1.19.0 at the pinned revision, live LambdaDB managed embeddings,
and gpt-4.1-mini-2025-04-14 through the real host. Keep the existing generation
instruction, temperature 0, output limit 256 and recent window 12. Use context
8192 so off-mode retains all 64 source messages; use memory budget 400 to keep
selection pressure comparable to the preceding long-dialogue experiment.

## Integrity and interpretation

Record the actual outgoing role of each required source and the host's requested
reply identity. Off-mode must contain the complete source; both modes must carry
the required evidence in its original API role. Missing evidence is an integrity
failure for this actor-specific comparison, not an actor error. Preserve failures
and partial output, source hashes, provider starts, immutable requests and cleanup.
Do not retry an HTTP-200 answer for quality or discard a difficult sample.

Assess actor and location semantically, and flag unsupported added actions or
observer claims. Correct location with a wrong actor fails. Valid first-person
assistant answers pass when the source supports them. Labels are provisional
assistant assessments until an independent human reviews the unscored packet.

Compare off/on within each wording and pronoun/name within each reporting
direction and language. If both modes fail with the evidence intact, memory
compression is not necessary for that observed failure. If explicit names improve
outcomes, report sensitivity to wording in these cases, not a general pronoun bug
or permission to rewrite real chats. Language/direction comparisons have different
histories/positions and are descriptive, not single-variable causal estimates.

Stop after the fixed run. Do not ship a prompt/rewriting fix solely to make these
eight cases pass. Keep the existing broader quality limitations, unknown-answer
checks and human adjudication requirement. A separately justified runtime change
needs its own frozen regression and broader validation.

```sh
node scripts/natural-dialogue.mjs --output artifacts/actor-plan-v1.json --fixture actor-perspective-v1
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/.env.local \
  SM_NATURAL_PLAN=artifacts/actor-plan-v1.json SM_ARTIFACT_TAG=actor-v1 \
  node scripts/generation-smoke.mjs --natural --retry-transient
```
