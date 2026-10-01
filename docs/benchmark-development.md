# LongMemEval development expansion

The next quality comparison uses the already frozen **14 development questions**
(two per stratum) from [selection-v1.json](benchmarks/selection-v1.json). The
42 held-out questions remain reserved. This work prepares and checks the expanded
host workload; it does not yet supply new paid quality results.

## Recorded host-fixture result — 2026-10-01

The [retained result summary](benchmarks/development-preflight-summary-v1.json) records
**70/70 passing slots**, 706 automatic local summaries, and 777 local completion
responses (70 answers + 706 summaries + one separate synthetic import probe).
All fixture stores and the disposable host/profile were cleaned up. External
provider calls and new paid quality scores are both zero.

All 14 plain 128K prompts retained every nonempty source message, using
102,468–106,927 observed host prompt tokens. Plain 32K prompts retained about
25.2–36.5% of source messages with their original role. These checks establish
that the two context conditions differ as intended; they do not score answers.
All 14 SillyMemory traces have complete delivery of their prepared memory within
the 800-token memory budget. Selection remains governed by the product policy.

The instrumented attempt first stopped after 63 retained rows because a delayed
native vector request crossed into the next summary arm. The archived interrupted report records
723 local completions and that error; it is not counted as a passing run. The
request was rejected before the fixture accessed its body or mutated its index.
Its full observations remain in the ignored checkpoint.

The [pinned native synchronizer](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/vectors/index.js#L440)
checks `enabled_chats` before waiting up to one second for generation/synchronization locks. Disabling the checkbox alone does
not cancel a call already past that check. The harness now disables native
indexing while the old stage/chat is still active, waits 1.5 seconds for that
pinned wait path with the configured `vllm` backend, drains active vector requests,
and requires a quiet interval before transitioning. It fails closed after 30
seconds. This is a benchmark orchestration barrier around the unmodified host
extension. The complete local-fixture rerun checks all
14 native boundaries. In three arms, six vector requests started after disable
and completed before transition (including the previously failing case). This
is actual-host/local-fixture evidence for the drain path; it does not establish
paid-provider timing behavior or repeat any paid pilot answer. The interrupted
producer snapshots are retained inside the archive for audit.

The offline observation validator rechecks all 70 saved host observations,
outgoing request hashes and response receipts without another provider call.
Private source/prompt checkpoints and full reports stay under ignored `artifacts/`;
only a concise result record and archive/file hashes are committed. All 273 unit tests, runtime/tool syntax
checks and release metadata checks passed.
Unit and process-reopen tests remain separate evidence from this
actual-host/local-fixture execution.

## Frozen schedule and bounds

[development-plan-v1.json](benchmarks/development-plan-v1.json) binds the dataset
lock, selection and original pilot design by SHA-256. Each case runs plain,
Vector Storage, automatic Summarize and SillyMemory at 32,768 context, followed by
plain host at 131,072. That is 70 answer slots. The eight already completed 32K
pilot answers are eligible for reuse only after matching input, runtime and
settings. Their existing observation limitations remain attached; the recovered
native row must not acquire invented host counters.

The paid expansion therefore requires **62 new answers and 62 official judges**,
with at most **643 new automatic summaries**. These are planned maxima, not calls
made by this change. Model/settings and the summary event policy remain those of
the [completed pilot](benchmark-live-pilot.md). This is a host-adapted benchmark,
not an official leaderboard submission.

| Resource | Planned aggregate limit |
| --- | ---: |
| Completion attempts, including at most 16 extra attempts | 783 |
| OpenAI reservation | USD 13 |
| Native embedding calls / inputs / reserved input tokens | 10,000 / 40,000 / 5,000,000 |
| LambdaDB non-cleanup requests / created collections | 3,000 / 30 |
| Managed document write attempts / input-token estimate | 30,000 / 5,000,000 |
| LambdaDB POST body bytes | 100,000,000 |
| Minimum completion dispatch spacing | 15 seconds |

These limits apply to new work; existing pilot usage remains separately recorded.
The reservation uses the price assumptions recorded in the pilot. All 16 extra
attempts reserve the expensive 128K generator context, even when the failed call
would be smaller. USD 13 is a conservative OpenAI reservation, not actual spend
or a LambdaDB billing ceiling. No discount/free quota is assumed. At the summary
cap, dispatch spacing alone takes **191.5 minutes**, excluding indexing and slow
responses. Do not launch the expansion with the old two-case pilot runner: its
limits and one-time recovery contract intentionally do not implement this plan.

## Uniform input adaptation

The original dataset hashes stay recorded. The source case `60bf93ed_abs` contains
four literal `<User>` spellings in source messages 220 and 224 (zero-based).
SillyTavern treats those as macros. The development adapter changes closed
`{{...}}` and the recognized legacy `<USER>/<BOT>/<CHAR>/<CHARIFNOTGROUP>/<GROUP>`
spellings to fullwidth delimiters, uniformly for every comparison mode and the
question. It leaves ordinary single-brace JSON alone and rejects unclosed macro
openings. Only that development case changes in the frozen cohort; both original
pilot inputs remain byte-identical and retain their reuse eligibility.

The adapted model-visible input has its own hash, alongside the original input
hash and changed-message indexes. Released chronology/date anomalies are kept,
not sorted away. Gold answers, evidence flags and scorer instructions never enter
the host, index, query or generator. The adapter rejects held-out inputs.

## Durable observations and diagnostics

`benchmark-checkpoint.mjs` persists call intent before dispatch, the returned
response before further assertions, and a complete host observation before its
validation. Completed responses can be read after reopening without dispatching
again. Request hashes, frozen plan/producer bindings and receipt hashes must match.
The observation is cloned on entry, and validators receive a separate clone, so
caller changes or mutating/failed validators cannot overwrite raw evidence.
The historical checkpoint producer is retained inside the source archive; the
archived host reports keep their original hashes. The mutation fix is verified by regression tests and
offline revalidation, without repeating the 70-slot host run. Both new mutation
regressions and the full 275-test suite pass.
Unknown delivery remains pending and is **not automatically resent**. Limits are
reserved before dispatch, failed calls retain their reservation, and an exclusive
writer lock rejects concurrent execution.

This is a reusable local persistence primitive, not a complete paid-provider
resume runner. Its process-reopen/failure behavior is tested separately from the
host fixture. The expanded fixture retains response receipts plus each question's
stored source, prompt-ready snapshot, actual outgoing request and memory trace in
an ignored local checkpoint directory. These include public benchmark source text;
they are not committed or uploaded. Callers must never pass keys or headers into
checkpoint data. A crashed process leaves a lock: first verify that its PID is no
longer running, preserve the directory, and investigate pending delivery. There is
no automatic stale-lock removal or claim of exactly-once remote execution.

The exact observation-validator producer used during the fixture is retained in
the source archive. The current read-only
validator resolves valid-hit coordinates from the current local document instead
of trusting remote metadata. Offline revalidation checks that this clarification
does not change the recorded fixture coordinates.

A test-only observer records the unchanged runtime's query results, current local
documents and selected memory. The generated report exposes source coordinates and
hashes, not raw histories; it is a run artifact, not a required CI fixture. It distinguishes:

- returned hits and hits matching the current local document;
- unique valid candidates and selected source passages;
- valid but unselected passages under whole-passage budget/packing policy;
- packed memory messages actually present with the correct role in the final
  outgoing request.

An unselected valid candidate is not automatically an ANN miss. Nor is exact text
presence a semantic recall or answer-correctness score. Native Vector Storage can
legitimately inject no additional memory; an empty block is recorded without
rejecting an otherwise completed answer. Test-only observation wraps the original
runtime methods; product code and retrieval policy are unchanged.

## Validation and commands

The host preflight runs all 70 slots, including the eight existing pilot slots,
using only local deterministic service fixtures. The paid schedule will reuse
those eight; fixture executions do not create duplicate paid answers. It checks
source preservation, questions, final prompt hashes, host token limits, 128K full
history, 32K truncation, automatic summary scheduling and SillyMemory delivery.
Local first-source-order retrieval has no embedding or ANN behavior. Local marker
summaries do not measure real summary length, fidelity, provider usage or cost.

```sh
# Requires the verified audit cache and the installed pinned SillyTavern checkout.
ST_SOURCE=/tmp/sillymemory-st-source node scripts/benchmark-development-preflight.mjs \
  /absolute/path/to/benchmark-audit-cache artifacts/development-preflight.json

# New-run report checks against the exact current producer files and full matrix.
node scripts/benchmark-development-results.mjs artifacts/development-preflight.json

# Revalidate retained observations without a host or any provider calls.
node scripts/benchmark-development-results.mjs artifacts/development-preflight.json \
  artifacts/development-preflight.json.checkpoint /absolute/path/to/benchmark-audit-cache
```

Use a fresh output path for a new host execution; the preflight refuses overwrite.
Neither command reads `.env.local`. Browser and host traffic are restricted to
loopback. The host profile/worktree and both local fixture stores are disposable.
Offline revalidation does not rerun generation or embeddings. It requires the
private checkpoint and dataset cache. CI checks the current validator with compact
synthetic cases, not a complete historical run. Use the archived revision for old
reports; the current validator intentionally rejects changed producer hashes.

## Archive and maintenance boundary — 2026-10-02

PR #38 originally included two full reports (80,172 lines) and three historical
producer copies. Those files are now removed from the active tree. Their exact
bytes and the tracked source at commit
`c86d7fdab01eed4b2d3206cf75911908ca7ebd40` are preserved in
`artifacts/archive/pr38-c86d7fd/source.tar.gz`. The
[small manifest](benchmarks/development-preflight-summary-v1.json) records the
archive/file hashes, success and failure separately, and the source revision.
That revision contains the report producers or their original historical snapshots,
as well as the subsequent observation-mutation fix used for revalidation.

This archive is **local-only**; it is not published and is not available in a fresh
clone. It contains only the tracked source tree, not `.env.local`, the dataset,
private checkpoints or `node_modules`. Dataset access remains subject to the
source license. The existing private checkpoints are retained separately under
ignored `artifacts/`. No Git history was rewritten and no remote data was deleted.

Before removing the active-tree copies, the archive was extracted and the original
report revalidated using its archived validator: 70/70 observations and 777 local
response receipts checked, zero new provider calls. File checksums and the failed
run's producer hashes were checked separately. This was offline revalidation, not
a repeated host or paid run. To inspect the original report, extract the archive
outside the maintained source tree, then run its validator there:

```sh
# First compare the archive SHA-256 with the committed manifest.
shasum -a 256 /path/to/source.tar.gz
mkdir /path/to/inspection
tar -xzf /path/to/source.tar.gz -C /path/to/inspection
cd /path/to/inspection
node scripts/benchmark-development-results.mjs \
  docs/benchmarks/development-preflight-v1.json
# Optional: append absolute private-checkpoint and dataset-cache directories.
```

The frozen development plan, current preflight/observation tools and meaningful
regressions remain reusable. Current CI uses a compact generated synthetic report;
it no longer depends on these old report files or their three producer snapshots.
Older experiments outside this PR are unchanged. The pending provider-ledger work
will be incorporated into the actual bounded executor and evaluated with its run,
not published as another standalone preparation PR. Complete that evaluation and
analysis before expanding the harness further unless a concrete blocker requires
an independently useful fix. See the [retention policy](../CONTRIBUTING.md#experiment-lifecycle-and-retention).

## Provider transport checkpoint — local validation

`scripts/benchmark-provider-ledger.mjs` adds the provider transport needed by the
development executor (`scripts/benchmark-development-live.mjs`). Product code, managed embeddings and the frozen
workload are unchanged. The complete suite passes **305 tests**, including 29 provider-ledger and one live zero-hit regression alongside the earlier
ledger tests. Runtime/tool syntax and release checks pass. This stage makes no
new paid calls and adds no answer-quality results.

The caller supplies a secret-bearing `send` closure and pinned-model tokenizers.
Only normalized request bodies enter the ledger; credentials and headers must
remain in that closure. The library accepts only the frozen fresh development
tasks and model/settings. It rejects pilot-reuse and held-out task IDs, extra
completion options, excess summary ordinals and native embedding batches larger
than ten inputs. Aggregate limits may be lowered, never raised. Reservation uses
the historical frozen plan's price assumptions, not a current billing guarantee.

Before dispatch, it persists the exact body and reserves the entire attempt's
upper cost. A complete HTTP response is saved before JSON parsing, response-shape,
finish-reason and token-usage assertions. Reopening the same checkpoint reuses
that receipt; an invalid success is retained and rejected, never regenerated.
Successful embedding vectors are also cached with their original input request.
A changed logical request fails instead of using or replacing the old response.
Concurrent identical calls coalesce within a process; the checkpoint writer lock
excludes a second process.

Completions are serialized with at least 15 seconds between dispatches. Only
HTTP 500/502/503/504 permit up to three attempts, within the aggregate 16 extra
attempts and 180-second logical deadline. HTTP 401/429, invalid success responses,
and native embedding failures are not retried. Backoff decisions are persisted;
process downtime consumes the deadline. Restart imposes a fresh conservative
15-second completion gap. Each attempt has a 90-second abort signal; the supplied
sender must honor it through response-body consumption.

A six-hour execution window starts at initial ledger creation, including downtime;
it blocks fresh paid work while allowing completed receipts to be inspected.
Unknown delivery or an interrupted response body leaves pending intent and blocks
further fresh provider work. Recovery requires inspection; deleting state to get a
new budget or assuming an unknown call was free is not a supported recovery path.
The file format/lock has the same crash boundary described above: this is not an
exactly-once remote execution guarantee.

The tests cover reservation exhaustion without partial charging, input/option
bounds, malformed/truncated successes, retry exhaustion, interrupted backoff,
caller mutation, concurrent dispatch, downtime, cached embeddings and separate
Node-process replay after downstream validation failure. Two loopback HTTP tests
exercise 503-to-success replay and a connection dropped mid-body. Test time and
provider bodies are controlled fixtures. These are **unit/process/loopback checks**,
not SillyTavern-host or OpenAI integration results. Authentication isolation is
checked using a synthetic header secret, not a real key.

```sh
node --test tests/benchmark-provider-ledger.test.js
```

The executor uses the same pinned host and native vector backend as the pilot.
It validates all eight pilot rows, input hashes, product source hashes and host
settings before reuse. It reserves LambdaDB requests/writes and records ownership
before forwarding through the built-in CORS proxy. Remote deletion checks owner
metadata and confirms inaccessibility. Private observations live in file-backed
receipts; a saved answer/observation bypasses indexing and generation on resume.
Native embeddings and summaries replay only exact request matches. Unknown
transport delivery fails closed; a stale writer lock requires investigation.

An actual-host/local-service run covered one development case across all five
conditions. It first interrupted after saving the plain answer observation, cleaned
up, then resumed to 5/5 rows without another answer dispatch for that slot. Native
Vector Storage used its real local backend with synthetic vectors. Remote fixtures,
native indexes and disposable profiles were cleaned up. Source and full run files
remain under ignored `artifacts/development-runner-fixture-v1*`. A later small edit
makes summary records idempotent, keeps unsuccessful generation observations out
of the reusable-answer slot, and clarifies fixture labels; unit checks pass, but
that edit is not a repeated full host fixture run. None of these fixture answers
are paid quality evidence. Zero-hit live retrieval is retained as an outcome,
while selected-but-undelivered memory still fails validation.

```sh
# Same output path resumes only with identical input/settings/source bindings.
ST_SOURCE=/absolute/path/to/pinned-SillyTavern node scripts/benchmark-development-live.mjs \
  /absolute/path/to/audit-cache artifacts/development-live-v1.json \
  /absolute/path/to/sillymemory/.env.local

# No credentials or external providers: one case, all five conditions.
ST_SOURCE=/absolute/path/to/pinned-SillyTavern node scripts/benchmark-development-live.mjs \
  /absolute/path/to/audit-cache artifacts/development-fixture.json --fixture --stop-after-observation
# Repeat without --stop-after-observation to exercise saved-observation recovery.
```

Paid execution and quality analysis are recorded below when complete or externally
blocked. Do not interpret the fixture or the local integration commit as completion
of the 62-answer paid comparison.

## Remaining sequence

1. Integrate these tested checkpoints/observations into a bounded development live
   executor, including completion and native-embedding receipts, attempt spacing,
   owned-resource cleanup and explicit pending-call recovery. Test interruption
   and native background-index cleanup and a wall-time acceptance limit there before a paid run.
2. Run the 62 new answer slots, judge them with the pinned official scorer, keep
   summaries/embedding work and final-answer usage separate, and retain all
   failures. Reuse the eight pilot answers only after compatibility checks.
3. Compare per-stratum quality and token/cost tradeoffs on development data;
   investigate retrieval, selection and delivery separately before changing policy.
4. Freeze the selected policy/settings before evaluating the 42 held-out questions.
   Make promotion/release decisions from that evidence, separately from this PR.
