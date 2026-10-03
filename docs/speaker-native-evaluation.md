# Native speaker-role development evaluation

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Declared on 2026-09-29 after the two system-wrapper trials were closed and
preserved separately. [v1](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-attribution-v1.json) retained four
on-mode attribution flags; [v2](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-attribution-v2.json) retained two.
The second trial also had one wrong-actor **off-mode** response. Its unchanged
baseline shows that model variation is possible. Neither trial solved the issue.
Do not keep tuning the system-wrapper wording on those six cases.

## Structural change

Replace selected eligible older messages in the ephemeral host prompt with
literal excerpts **in their original user/assistant roles and chronological
positions**, preserving source indices and chunk order. Do not put all speakers
into one system message. Keep the user/character display name and a source label
on each excerpt; preserve special messages and the recent window. Do not mutate
persisted chat, rewrite pronouns or add a rule banning user reports of assistant
actions. Local source documents supply the role; remote hits only rank IDs.

The memory budget counts the complete recalled content and source labels using
the host tokenizer. As before, the host controls overall context and provider
message-envelope overhead; this is not a guarantee about total billed API tokens.
Source text, scope/identity rules and query policy remain unchanged. Selecting
passages still follows retrieval rank; only their presentation uses source order.

## Fixed evaluation

`speaker-native-v1.json` preserves the six earlier cases and adds two actor-versus-
speaker cases: an English user reporting the assistant's action, and a Korean
assistant reporting the user's action. Role labels alone must not be mistaken
for who performed an action. All facts remain outside the recent 12 messages.
This is a development regression informed by prior failures, not a held-out test.

Use eight cases, two repetitions and counterbalanced off/on conditions: **32
answers**, at most **40 provider attempts** under the unchanged bounded transport
policy. Keep the same pinned SillyTavern, model, generation instruction, context
8192, output 256 and memory budget 800. Freeze the new plan and source hashes
before requests. No successful-answer retries or partial schedule substitutions.
Record real upstream starts, source-role equality in the actual outgoing API
messages, token limits, source/recent preservation, secret audit and cleanup.

Assess all answers against their source meaning. Wrong actor on a who-question is
incorrect; an added unsupported personal claim on an otherwise correct answer is
a separate flag. First-person assistant answers are valid when supported. Preserve
all 16 off/on pairs and both repetitions. The strict diagnostic on gate requires
16/16 passes. Assistant review remains provisional, with the human gate unset.
Keep all failures and do not pool with either prior trial. Broader natural and
long-context evaluation remain separate; no general recall/cost claim follows.

```sh
node scripts/natural-dialogue.mjs --output artifacts/speaker-native-plan-v1.json --fixture speaker-native-v1
ST_SOURCE=/path/to/pinned/SillyTavern SM_ENV_FILE=/path/to/original/.env.local \
SM_NATURAL_PLAN=artifacts/speaker-native-plan-v1.json SM_ARTIFACT_TAG=speaker-native-v1 \
npm run test:natural:live -- --retry-transient
```
