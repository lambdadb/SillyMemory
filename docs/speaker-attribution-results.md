# Speaker attribution development results — 2026-09-29

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Recalled passages now retain their original user/assistant API role and source
order instead of combining different speakers in one system extension prompt.
The two original failure cases (studio key and ferry correction) passed both
repetitions with memory enabled in the final run. **The broader diagnostic gate
still failed:** an added English user-report-of-assistant-action case had a wrong
actor in both conditions and repetitions. Independent human review is pending.

## Separate trials

All trials used the pinned SillyTavern 1.19.0 checkout
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, live LambdaDB managed embeddings and
`gpt-4.1-mini-2025-04-14` through the real host generation path. The test-only
loopback bridge held the OpenAI key and forwarded the host request. Each trial
froze its source hashes, synthetic inputs, temperature 0, context 8192, output
limit 256, recent window 12 and memory budget 800 before generation.

| Trial | Answers | Provisional strict off / on | Integrity checks | Result |
| --- | ---: | --- | ---: | --- |
| [Role labels in system wrapper](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-attribution-v1.json) | 24 | 12/12 / 8/12 | 257 | Original four attribution flags remained |
| [Stronger perspective instruction](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-attribution-v2.json) | 24 | 11/12 / 10/12 | 257 | Key-action flags remained; one off-mode notebook actor error |
| [Native source roles](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-native-v1.json) | 32 | 14/16 / 14/16 | 341 | Original failures absent; English reported-action error in both modes |

The first two trials have six cases and two repetitions per condition. The final
trial preserves all six and adds two actor-versus-speaker cases. These are
**development regressions informed by observed failures**, not held-out evidence.
The failed trials are preserved, excluded from aggregation and not successful-
answer retries. Their implementations are retained in commits `82fd295` and
`97080cd`; the original 64-answer corpus and results are unchanged.

The final run's six inherited cases passed 12/12 in each mode. The Korean
assistant-reporting-user-action case passed 2/2 in each mode. The English user
said “You put the violet folder…” about the assistant, but all four replies
failed to name the assistant as the actor (three repeated “You put…”, one said
“You mentioned putting…”). Retrieval and API roles were correct. The matching
baseline failures show this is not unique to memory compression; they do not
prove a particular model-internal cause. Do not label it an ANN miss.

There were **0 improved, 16 tied and 0 regressed** final off/on pairs. The strict
16/16 on-mode gate is false. An assistant read source histories, rubrics and all
randomized answers before opening condition mappings; this is provisional review,
not independent human blinding. The human gate remains `null`. Exact answers,
selected text, per-answer rationale and all pairs are in the linked JSON files.

## Final live measurements

- 32/32 generations completed; all 32 attempts returned HTTP 200 first time.
  Bounded retry support was enabled but no live retry occurred in any trial.
- Required source evidence reached memory and the outgoing prompt in all 16
  on-mode samples. Every selected excerpt reached an API message with its source
  user/assistant role. Maximum recalled content was **748/800 host tokens**.
- All 126 LambdaDB requests were free of transport failures and HTTP 5xx. Both
  owned collections were deleted and API absence verified; no pending-cleanup
  record remains. This does not establish provider backup erasure.
- Actual upstream-send spacing was verified: minimum **15,000.528 ms**, no gap
  below 15 seconds. Earlier trials also verified spacing (15,000.040 and
  15,000.055 ms minimum). This does not repair the historical 64-answer run's
  missing dispatch evidence.
- Provider usage: **27,004 prompt + 628 completion tokens**. Median prompt usage
  was off 723 / on 1,090. All short baselines fit; **no token saving or general
  recall improvement is demonstrated**. Embedding usage/cost is not measured.
- Browser/persisted-settings key audit passed. A separate local scan found no
  configured secret values in tracked work or speaker reports/logs. Current
  evaluated source files and frozen plan still match their recorded hashes.

Raw report byte SHA-256:
`bb3e6f88cae6f7202460b08fa84588e2e6e1d6b5da3ac5fcc50f4db111b987cb`.
Frozen plan SHA-256:
`434f69780d583f56cd5f675a98c956f9dddc7c2309830c52833759ff0c17d6fc`.
Fixture semantic hash:
`dd1ee3d4c69bf49e558f1c2f74caf2f7ff002390038388b9affb4e36809b2b1a`.
The exact per-file source hashes are included in the evidence JSON.

## Local and real-host validation

All **96 unit tests** passed on Node.js 20.12.0 and 24.15.0, plus runtime/tool
syntax and release metadata checks. Regressions cover local role authority over
forged remote metadata, role-change identity invalidation, exact budget limits,
source/chunk order, macro literals and fixture/scoring separation.

The final [real-host/local-emulator recovery run](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-native-recovery.json)
passed **188 checks**, including two SIGKILL/restarts, 24 edit/swipe/delete/reload
cycles, stale-result cancellation, branch isolation, key clearing/re-entry,
write-response loss and draining owned deletion. It left zero collections and
zero uncaught page errors. This test calls neither LambdaDB nor a model and is
not a sustained-load or live-service outage test.

A separate [real-host/live-LambdaDB generation fixture](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-native-generation-fixture.json)
passed **27 checks across nine generations**, covering streaming regenerate,
swipe, native branch creation, edit/delete, retrieval-failure fallback and disable.
Its model replies are deterministic local fixtures, not real LLM quality evidence.
Owned remote cleanup and the persisted-settings key audit passed. Reproduce with
`ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/original/.env.local
SM_ARTIFACT_TAG=new-fixture-tag npm run test:generation`.

Earlier emulator attempts are retained locally. The first wrapper test used a
250-token fault fixture that could not fit its edited last-ranked passage; fault
scenarios now use 800 while the initial budget checks still use 250. Later
attempts reached cleanup but failed on uncaught JSON errors from default-profile
Horde API HTTP 500 responses (`/api/horde/status`, `/api/horde/text-models`). The
final harness sets only its temporary test profile to the unconnected OpenAI UI,
removing that unrelated startup dependency. It does not ignore page errors.

## Review and reproduction

Follow the [frozen native-role protocol](speaker-native-evaluation.md) to create a
new plan and run tag. Inspect [architecture](architecture.md) and
[pinned contracts](contracts.md): excerpt content and labels are budgeted, while
provider message-envelope overhead and final context fitting remain host duties.
World Info scans history after this interceptor and may see the excerpts. World
Info/other prompt-rewriter interoperability and non-chat-completion providers
remain unverified. No main promotion, release or deployment accompanies this work.

The remaining quality task is independent human scoring and a separately frozen
broader natural/long-context regression. Do not repeatedly tune these eight cases
until they pass or claim the new reported-action failure is resolved.

Ignored local evidence (not distributed in a fresh clone):

- `artifacts/generation-natural-speaker-v1.json`, `generation-natural-speaker-v2.json`
  and `generation-natural-speaker-native-v1.json`: three distinct raw live reports.
- `artifacts/speaker-review-v1/`, `speaker-review-v2/` and
  `speaker-native-review-v1/`: unfilled human packets, assistant annotations,
  condition mappings, summaries and scores.
- `artifacts/recovery-smoke-speaker-native-v3.json`: final 188-check recovery
  report; the failed `speaker-native-v2` report records the Horde diagnostics.

The additional generation-fixture raw report is
`artifacts/generation-fixture-model-speaker-native-fixture-v1.json`.
