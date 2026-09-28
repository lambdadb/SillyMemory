# Held-out recall and interruption recovery

## Protocol frozen before execution — 2026-09-28

Test the unchanged `latest-user-or-continuation-plus-context-v2` runtime from
PR #7, using pinned SillyTavern 1.19.0 commit
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`.

`heldout-recall-v1` has 12 synthetic cases: English/Korean × reference,
continuation, context overflow × two counterbalanced target objects. Each pair
shares its old history but changes the recent referent. Names, objects and
codes differ from the development experiment. Reference subjects occur four
messages before the new question. Continuation uses three consecutive assistant
messages describing a visitor transition. Overflow histories contain 180 turns
of varied scene text. They remain synthetic and repetitive, not personal chats.

Frozen fixture SHA-256:
`961182cc341b14f58c8b1060c0a4cc8297a6d4c8bea57b238383e8824b1e93d9`.
Do not change fixtures, grading, runtime or selection after observing answers.
A subsequent fix would make these development cases; report any retest separately.

Run memory off/on once per case with alternating order: 24 planned answers,
maximum 25 provider attempts including one transient 503 retry. Use
`gpt-4.1-mini-2025-04-14`, temperature zero, 256 output tokens, 8,192 host context
tokens, 12 recent messages and 800 memory tokens. Restore source before every
sample. No hidden retries or sample substitution. Existing credentials are read
from `SM_ENV_FILE`, never copied into the worktree or exported to the host.

Integrity gates: identical saved source, complete provider output matching the
host's saved answer, recent-message preservation, actual outgoing injection
within budget, verified context boundary, all scheduled samples, consistent
runtime/harness hashes, and owned collection cleanup. Keep partial/failed runs.

Report selection and answers separately: target in retrieved memory, target in
outgoing prompt, strict code-only answer, and expected code present without any
competing code. The latter is a lexical diagnostic, not a semantic correctness
claim; inspect exact answers for negation and explanations. Desired quality gate:
all 12 memory-on samples select the target and answer with its code without a
competing code. Format failures remain visible. Failure does not justify tuning
these cases or claiming an ANN defect. No statistical superiority claim.

## Recovery protocol

Use the real pinned host, browser and built-in proxy with the local HTTPS
LambdaDB emulator. Kill the host with SIGKILL in two controlled write states:
request received but not applied, and applied remotely but acknowledgment held.
Restart with the same host profile and browser storage, reload, re-enter the
session key, and verify saved source and exact remote document IDs. Delete the
uncertain source and verify it is absent remotely and from injection.

Then run 24 bounded cycles across a parent chat and native branch. Each cycle
edits a source message, swipes another, retrieves, deletes/appends, retrieves
again, and explicitly resynchronizes unchanged source. Check source/remote ID
agreement, scope isolation, deletion filtering, recent source, token budget and
zero redundant upserts. Reload every six cycles and re-enter the key. Existing
fault regressions and final owned collection/journal deletion also run.

This is a sequential repetition test, not a long-duration soak, concurrent-load
benchmark, or proof of live LambdaDB outage recovery. Actual host process death
is distinct from simulated remote acceptance. Every integrity check must pass.

## Reproduction

Use an isolated host checkout whose extension symlink points at this checkout.

```sh
ST_SOURCE=/path/to/pinned/host SM_ARTIFACT_TAG=heldout-v1 \
  SM_ENV_FILE=/path/to/existing/.env.local npm run test:heldout:live
node scripts/challenge-summary.mjs --heldout \
  artifacts/generation-heldout-heldout-v1.json \
  --output artifacts/heldout-summary-v1.json
ST_SOURCE=/path/to/pinned/host SM_ARTIFACT_TAG=recovery-v1 npm run test:recovery
```

For interrupted evaluation, use a new artifact tag and `SM_CHALLENGE_START=N`
with the first missing index (0–23), then supply all report paths to the summary.
Preserve the fixture/runtime/harness identity. A partial summary requires
`--partial` and does not meet completion. Clear pending owned cleanup before
resuming. Raw reports stay in ignored local `artifacts/`.

## Recovery result — 2026-09-28

All **188 checks passed** with the real pinned SillyTavern and Chromium, using
an emulated LambdaDB upstream. The two SIGKILL/restart cases and 24 parent/branch
cycles completed in **75.2 seconds** (recovery portion), with **642 total proxy
requests** including the pre-existing fault suite. Four periodic reloads and
two post-kill reloads required session-key re-entry. No uncaught primary-page
errors, remaining remote emulator collections, or journal residue were found.
The full deletion path still waited for outstanding writes before removing its
owned collection. No runtime fix was required.

This establishes bounded interruption/repetition behavior only. A 75-second
exercise is not hours/days of use, multiple devices, or a real LambdaDB service
outage. The test deliberately controls pre-acceptance rejection and post-write
acknowledgment loss at the upstream emulator.

Local evidence:

- [Recovery report](../artifacts/recovery-smoke-recovery-v1.json)
- [Recovery log](../artifacts/recovery-v1.log)
- [Frozen held-out cases](../artifacts/heldout-frozen.json)
- [Node 20 unit log](../artifacts/unit-20.log)
- [Node 24 unit log](../artifacts/unit-24.log)


## Held-out live result — 2026-09-28

The fixed protocol completed **24 OpenAI requests** with live LambdaDB managed
embeddings through the built-in proxy, **183 integrity checks**, no model retry,
and verified owned-collection cleanup. Runtime and all recorded harness hashes
match the tested files; the runtime is unchanged from PR #7. The frozen fixture
hash is unchanged. All exact provider answers were inspected.

| Measure | Memory off | SillyMemory on |
| --- | --- | --- |
| Samples | 12 | 12 |
| Target in injected memory | 0 | 12 |
| Target in outgoing prompt | 8 | 12 |
| Expected code, no competing code | 8 | 12 |
| Strict code-only answer | 6 | 11 |

The predeclared selection/code-evidence gate passed **12/12**. The strict score
remains **11/12**, not 12/12: Korean continuation 0 answered `PINE-649이다.` with
memory both off and on. Korean continuation 1 answered `ASH-273이다.` with memory
off and `ASH-273` with memory on. These are observed format differences, not
missing facts; the grader was not relaxed. Every other non-overflow answer was
the expected code alone. All four overflow baselines answered `UNKNOWN`.

| Case pair | Off strict | On strict | On expected code | On target selected |
| --- | --- | --- | --- | --- |
| English reference | 2/2 | 2/2 | 2/2 | 2/2 |
| English continuation | 2/2 | 2/2 | 2/2 | 2/2 |
| English overflow | 0/2 | 2/2 | 2/2 | 2/2 |
| Korean reference | 2/2 | 2/2 | 2/2 | 2/2 |
| Korean continuation | 0/2 | 1/2 | 2/2 | 2/2 |
| Korean overflow | 0/2 | 2/2 | 2/2 | 2/2 |

Maximum injection was **797/800 tokens**. Overflow sources contained **23,482
English** and **33,524 Korean** host text tokens. The off prompts retained 52/180
and 36/180 source messages respectively, omitting the old target; on prompts
included target memory while preserving the recent source. Non-overflow off
prompts retained all 64 source messages.

All four continuation targets ranked first in both captured queries. In three
of four overflow samples, the target appeared only in the contextual query;
the fourth had it only in the primary query. This is an observation, not a query
ablation: query order, index readiness and candidate variability are not
controlled independently. It does not establish an ANN defect or prove the
incremental benefit of either query. The counterbalanced reference pairs show
correct answers for either referent, but do not prove that retrieval itself
resolved the pronoun: all four reference injections contained both candidate
codes, and the generation model selected the requested one. Histories and
targets remain deliberately simple; one answer per condition is insufficient for a general quality or cost claim.

The unit suite passes **58 tests** on Node.js 20.12.0 and 24.15.0; runtime and all
33 script/test files pass syntax checks. The old v1/v2 reports still aggregate
under their original protocol with unchanged metrics. No application code,
LambdaDB service, timeout policy, or prompt policy was changed; no merge,
release or deployment is part of this validation.

Local live evidence:

- [Raw live report](../artifacts/generation-heldout-heldout-v1.json)
- [Validated summary](../artifacts/heldout-summary-v1.json)
- [Live run log](../artifacts/heldout-v1.log)
- [Historical v1 compatibility summary](../artifacts/historical-baseline-compatibility.json)
- [Historical v2 compatibility summary](../artifacts/historical-v2-compatibility.json)
- [Source identity, credential and cleanup verification](../artifacts/verification.json)
