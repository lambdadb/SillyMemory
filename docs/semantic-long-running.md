# Running the semantic long-dialogue baseline

Use the pinned SillyTavern checkout from the [protocol](semantic-long-evaluation.md)
with its extension symlink pointing to this worktree. Keep credentials in the
existing ignored environment file, outside any new worktree. This live run uses
64 generation answers and up to eight bounded transport retries, plus managed
embedding/search calls; it requires explicit authorization for those calls.

```sh
npm ci
npm test
npm run check
npm run check:release

ST_SOURCE=/path/to/pinned/SillyTavern \
  node scripts/semantic-long.mjs artifacts/semantic-plan-next.json

ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/path/to/.env.local \
SM_NATURAL_PLAN=artifacts/semantic-plan-next.json \
SM_ARTIFACT_TAG=semantic-next \
  node scripts/generation-smoke.mjs --semantic --retry-transient

node scripts/semantic-results.mjs \
  artifacts/generation-semantic-semantic-next.json artifacts/semantic-review-next
```

Use new plan, tag and output-directory names for every run. The plan fixes exact
source hashes before any provider call. Do not change the fixture, protocol,
retrieval runtime, adapter or verifier during execution. A preflight failure
makes no answer-quality claim. A later failure retains its report and pending
owned-resource record for cleanup; never overwrite a failed run to hide it.

The results command revalidates the raw report against the current frozen source
and creates `summary.json`, randomized unfilled `packet.json` and a separate
condition `key.json`. Review the packet against the complete two-turn fact source,
question, expected rule, evidence and forbidden claims. The 58 later turns are
fixed filler and answer-free topic cues; they remain available in the fixture.
Do not use the key to decide grades. The packet is not independently blinded
research: an assistant developing this experiment already knows its design.

Copy `packet.json` to a separate annotation file. Preserve all content, IDs and
report hash, set `reviewer` and `reviewerType` (`assistant` or `human`), and fill
`grade` and a nonempty `rationale` for all answers. Grades are `correct`, `partial`,
`incorrect`, or `abstained`. Known questions pass strictly only when correct.
Unknown questions use `abstained` for justified refusal to invent facts and
`incorrect` otherwise. Keep the original packet unfilled for a human reviewer.

```sh
node scripts/semantic-score.mjs \
  artifacts/generation-semantic-semantic-next.json \
  artifacts/semantic-review-next/packet.json \
  artifacts/semantic-review-next/key.json \
  artifacts/semantic-review-next/assistant-annotations.json \
  artifacts/semantic-review-next/assistant-score.json
```

The scorer rejects changed evidence/rules/answers, duplicate or foreign mappings,
unfilled annotations and false unknown-answer passes. It reports per-mode counts
and paired strict-pass changes. Assistant results remain provisional. Merely
labeling annotations `human` does not establish reviewer independence; that field
remains unset until an independently documented review occurs.

No runtime policy, release version or main installation baseline changes as a
result of running this experiment. Semantic source delivery and generated-answer
accuracy are different measurements; both have synthetic-data limitations.

## Bounded diagnosis after a transport failure

Before spending more generation calls, the existing probe can compare one
ordinary document with one managed-embedding document through the real browser
and built-in proxy:

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/path/to/.env.local \
SM_ARTIFACT_TAG=semantic-diagnostic-next \
SM_PROBE_BATCH_SIZE=1 SM_PROBE_TIMEOUT_MS=45000 SM_PROBE_QUERY=1 \
  node scripts/live-smoke.mjs --probe
```

The 45-second timeout belongs only to this diagnostic client. It does not change
production's 15-second deadline, retry the generated-answer cohort, or establish
that the product passes under its normal limits. Each probe owns and removes two
collections. A scope query runs immediately after fresh creation, so a single
503 is not proof of sustained service unavailability. Inspect each phase and
cleanup in the emitted report; a completed probe procedure can still have
`passed: false`. Do not retry the entire generation cohort until the normal
managed transport path is healthy.
