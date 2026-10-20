# Branch and checkpoint operating cost

## Product question

Does reusing inherited memory reduce actual waiting time and indexing work when a
user branches a chat or resumes a checkpoint, compared with SillyTavern's existing
Vector Storage? Local embedding has no per-request provider charge, but still
requires model execution and index writes. Reduced embedding work alone does not
establish faster completion: remote commit and verification waits also matter.

This comparison concerns operating cost and readiness, not retrieval accuracy or
generated-answer quality. It does not add a new user-facing workflow or change
product defaults. Native branching and native checkpoints already exist.

## Readiness correction

Review identified that the original managed verification fetched only expected
IDs after the timer stopped. It could not detect an inherited suffix whose
deletions were acknowledged but not yet committed. The original 1–2 second
midpoint/resume results therefore establish UI synchronization time only, **not
exact committed branch readiness**. They remain historical observations below.

The corrective [v2 plan](benchmarks/branch-checkpoint-v2.json) repeats both sizes
and both arms once, with full committed document enumeration inside the timer.
It requires exactly the expected ID set and matching document fields; missing,
changed, duplicate and unexpected documents prevent completion. It records the
first enumeration and subsequent wait, so a delayed suffix deletion is visible.
Checkpoint open uses the same full-set check. Product code is unchanged.

This conservative boundary is distinct from the product's `consistentRead: true`
search/fetch path. It does not establish how long a first successful semantic
query or generated answer takes. Initial synchronization now includes its commit
wait instead of leaving that wait to the first branch. Combined initial+branch
and checkpoint save+open remain the useful comparisons.

## Corrective v2 result

All **28/28 operations completed**, with one observation per size and arm.
The input hashes, product files, host and local model match v1. Native ran first
for each size. These are single observations, not replacement v1 medians or a
service latency guarantee. Values below are seconds through exact committed-set
verification, including its polling requests.

| Messages | Operation | Native local Vector Storage | SillyMemory managed |
| --- | --- | ---: | ---: |
| 50 | Initial synchronization + first end branch | 25.463 | 77.708 |
| 50 | End branch after committed initial index | 12.720 | 1.176 |
| 50 | Subsequent midpoint branch | 6.381 | 56.678 |
| 50 | Checkpoint save + open/index | 12.973 | 57.554 |
| 50 | First resume + synchronization | 12.829 | 67.377 |
| 50 | Second resume + synchronization | 12.884 | 48.481 |
| 500 | Initial synchronization + first end branch | 284.050 | 68.239 |
| 500 | End branch after committed initial index | 142.350 | 1.998 |
| 500 | Subsequent midpoint branch | 67.703 | 63.567 |
| 500 | Checkpoint save + open/index | 142.888 | 50.050 |
| 500 | First resume + synchronization | 142.930 | 56.366 |
| 500 | Second resume + synchronization | 142.768 | 63.657 |

The first midpoint enumeration still contained **24 / 250 unwanted documents**
at 50 / 500 messages; each resumed path still contained six retained-recent
documents awaiting deletion. Every timed full-set check eventually matched the
expected set. This directly confirms why v1 could not establish committed
isolation from expected-ID fetches alone.

SillyMemory checkpoint save alone took 57.387 / 49.635 seconds; open plus the
full-set check took 0.167 / 0.416 seconds. Native save took 0.142 / 0.148 seconds;
open/index took 12.831 / 142.740 seconds. Saving a chat file and preparing a
complete memory index are different completion boundaries.

**Decision:** inherited memory avoids repeated submissions even against a local
embedding baseline. A previously committed end branch is fast in these cases.
At 500 messages, combined initial+branch, checkpoint save+open and repeated resume
were faster at the verified committed boundary; midpoint branching was close
(63.567 versus 67.703 seconds), so do not claim a robust win there. At 50 messages,
commit waits outweighed the avoided local work for midpoint branches, checkpoints
and resumes. Do not claim that all branches are ready in 1–2 seconds or that
reduced submissions imply a particular monetary saving. Keep product defaults
unchanged and defer broad latency/quality claims and duplicate UX controls.

V2 recorded 3,026 local embedding inputs, 551 managed document submissions and
110,119 submitted text characters, including setup. Inherited branch/resume
upserts remained zero; each checkpoint submitted the six recent messages.
Verification polling inflates the benchmark request count; it is not the normal
product request count or a provider invoice. No generation/judge calls were made.

The live run passed 12 timed managed full-set checks, 12 native exact hash-set
checks and 16 transcript-prefix/resume assertions. All three owned collections
were independently rechecked as HTTP 404 after cleanup. Temporary native data
was removed, host instrumentation restored and no listener remained on port
18188. Unit/syntax/SDK/release checks passed; the live producer hashes match
the maintained runner and unchanged product files.

The separate local-only archive is
`/Users/steven/Dev/sillymemory/artifacts/branch-checkpoint-v2/evidence.tar.gz`,
SHA-256 `ba68a99a04ffd69d44ca17e58f3ef5eb93c69be94adf6d95d8f3997d3799d0a9`.
All 18 members were read back and matched byte-for-byte. It contains the exact
producer, frozen plan, raw report/counters, model hashes, offline analysis and
verification, cleanup receipt and restoration instructions. It is unavailable
in a fresh clone and is not a CI dependency. The v1 archive is unchanged.

## Historical v1 UI synchronization results

The completed paired comparisons contain three repetitions at 50 messages and two
at 500. The table uses only those complete pairs. Values are median seconds,
followed by the observed minimum–maximum; these are synchronization timings, not
chat-screen opening or generated-answer latency.

The run reached its predeclared **45-minute limit** during the third native
500-message end branch. It completed 71 of 84 planned operations and returned
exit code 1 with `timedOut: true`; the full frozen matrix did **not** pass.
The unmatched third native initial-index result and interrupted work remain in
the raw evidence and are excluded from paired summaries. No replacement cases
were added to this historical summary. A separate corrective run uses the v2
boundary above.

| Messages | Operation | Native local Vector Storage | SillyMemory managed |
| --- | --- | ---: | ---: |
| 50 | Initial synchronization + first end branch | 25.687 (25.586–25.695) | 57.208 (48.685–90.087) |
| 50 | End branch after initial synchronization | 12.914 (12.884–12.940) | 55.290 (47.090–88.222) |
| 50 | Subsequent midpoint branch | 6.456 (6.452–6.464) | 1.083 (1.034–1.095) |
| 50 | Checkpoint save + open/index | 13.019 (12.992–13.036) | 62.678 (60.406–64.692) |
| 50 | First resume + synchronization | 12.922 (12.849–12.963) | 1.425 (1.341–1.453) |
| 50 | Second resume + synchronization | 12.905 (12.849–12.921) | 1.441 (1.369–1.529) |
| 500 | Initial synchronization + first end branch | 284.345 (284.321–284.369) | 52.527 (47.026–58.028) |
| 500 | End branch after initial synchronization | 142.691 (142.668–142.715) | 44.557 (39.723–49.392) |
| 500 | Subsequent midpoint branch | 67.836 (67.741–67.931) | 1.874 (1.857–1.892) |
| 500 | Checkpoint save + open/index | 142.742 (142.629–142.855) | 57.509 (57.068–57.949) |
| 500 | First resume + synchronization | 142.593 (142.438–142.749) | 2.142 (2.142–2.142) |
| 500 | Second resume + synchronization | 142.696 (142.489–142.904) | 2.170 (2.158–2.183) |

Native checkpoint **save alone** took a median 0.131/0.140 seconds for 50/500
messages. Its later open/index step took 12.884/142.602 seconds. SillyMemory's
checkpoint save took 62.555/57.354 seconds and its later open took 0.112/0.155
seconds: it prepares and verifies the frozen memory during saving.

| Work per completed operation | Native, 50 / 500 messages | SillyMemory, 50 / 500 messages |
| --- | ---: | ---: |
| Initial index | 50 / 500 local embedding inputs | 44 / 494 managed upsert documents |
| End branch | 50 / 500 local embedding inputs | 0 / 0 additional upsert documents |
| Midpoint branch | 25 / 250 local embedding inputs | 0 / 0 additional upsert documents |
| Checkpoint save + open/index | 50 / 500 local embedding inputs | 6 / 6 additional upsert documents |
| Each resume | 50 / 500 local embedding inputs | 0 / 0 additional upsert documents |

The six checkpoint upserts are the retained recent messages, deliberately
excluded from normal archival but included in a frozen checkpoint. These are
client-side submission counts, not LambdaDB's internal embedding execution or
billing records.

On the measured Apple M5 Pro machine, native first-resume embedding execution
used median process CPU times of 7.052 seconds at 50 messages and 70.340 seconds at
500, excluding index/request work. Download/loading plus one warmup input took
7.942 seconds separately. Local embeddings therefore have a measurable compute
cost even without a per-request provider fee; this is not an electricity or
hardware-cost estimate.

The submission reduction is established independently of readiness timing.
The historical timings do not establish that the midpoint/resumed branch has
already committed every required deletion. Do not use their 1–2 second values as
a complete isolation or readiness claim.

## Historical v1 method

The [input and operation plan](benchmarks/branch-checkpoint-v1.json) uses 50 and
500 deterministic English messages, each approximately 200 characters, with three
repetitions per size. Each message has a distinct numbered fact, and all fit in
one chunk under both arms. The runner uses a new saved chat for each arm and
repetition, alternates arm order, and tests the following sequence:

1. Fully index the original chat.
2. Branch at its end and finish the new path's memory synchronization.
3. Return to the original, branch at its midpoint, and finish synchronization.
4. Save a checkpoint; then open it and finish any required synchronization.
5. Return to the saved checkpoint and create two independent resumed paths,
   finishing each path's memory synchronization.

The inherited message text is unchanged. This screen does not measure additional
messages, edits, conflicting writers or recovery from provider failures.

The native arm runs the pinned host's real Vector Storage and default local
Transformers model, using **Vectorize All** to finish indexing. This measures an
explicit complete-index operation, not the default background worker's catch-up
schedule. The pinned handler processes local Transformers inputs one at a time;
this is the native default, not an optimized batch-embedding baseline. Native
checkpoint save does not itself prepare a vector index; its
later open/index cost is reported separately. A native resumed path is a normal
branch from the saved checkpoint.

The SillyMemory arm runs current defaults against live managed LambdaDB, including
OpenAI Small embeddings, real branch creation and checkpoint verification. Native
chat vectorization is disabled for this arm. Ordinary SillyMemory synchronization
excludes the retained recent-five window (six messages after an assistant reply);
checkpoint creation synchronizes the full completed transcript. The remaining
recent messages stay available in the native chat. Counts disclose this difference.

Both arms use the same original transcript. Native vectors are checked against
the complete expected hash set. SillyMemory's expected inherited documents were
fetched and checked field by field; this did not detect extra remote documents.
Branches and resumed chats are checked against
their expected source text. These checks do not measure semantic retrieval or
claim that a model will answer correctly.

The host revision is `06bde939fb1e9c4c8d8641d810f0a916b5bce127`
(SillyTavern 1.19.0). The local model is the configuration default,
`Cohee/jina-embeddings-v2-base-en`, using its quantized ONNX weights. The actual
downloaded model/tokenizer file hashes are retained with the run.
Model download/loading and a warmup input are timed separately. A disposable
host instrumentation patch records wall time and process CPU time around each
actual local embedding call, without changing its inputs or outputs.

Operation timing includes native chat creation/open and the explicit index
completion, or the equivalent SillyMemory UI action and synchronization.
Native synchronization also includes one final completeness-list request.
SillyMemory source verification happens after its timed operation. Return
navigation, setup and final cleanup are excluded. Different models and deployment
locations prevent interpreting this as a storage-engine-only comparison.

SillyMemory's initial synchronization can finish before writes are committed for
branching. Its first branch then pays that remaining wait. Compare **initial
synchronization plus first branch**, as well as the individual operations, to
avoid treating shifted work as saved work. Similarly, compare **checkpoint save
plus open/index** when the user needs a usable saved path. The midpoint branch
runs after the end branch; its latency is not an independent cold-start result.
This experiment does not measure first successful semantic query or final answer
delivery after each operation.

## Cost interpretation

- Local embedding inputs, model wall time and CPU time are measured. Hardware,
  electricity and depreciation are not monetized.
- Managed upsert documents/characters and API request counts are measured.
  An upsert is submitted work, not an invoice or proof of a particular provider
  billing policy. Zero inherited upserts does not imply zero remote read, storage
  or branch cost.
- No answer generation or judge calls are made. The synthetic transport check
  uses the existing managed retrieval test and is excluded from operation timing.
- These are short synthetic histories, not LongMemEval/BEAM quality evaluations
  or evidence of BEAM 10M latency. Three repetitions are a small operational
  screen, not a service-level latency guarantee.

## Validation and retention

The run exercised a real pinned host and Chromium, real local model execution,
and live managed LambdaDB; neither backend was emulated. Forty named transcript
checks passed alongside native index-hash and inherited-document assertions.
There were no uncaught page errors, and the producing source hashes stayed
unchanged during execution. The recorded run failure was the wall-time cap; the
later review also found the
managed full-set verification gap described above.

Including setup and interrupted work, the run recorded 7,271 local embedding
inputs and 1,151 managed document submissions containing 230,132 characters.
All six generated owned collections were deleted and independently rechecked
with HTTP 404 responses. The disposable native data directory was removed and
the host instrumentation was restored.

Original evidence includes the exact uncommitted producer, input lock, raw report,
local embedding counters, model file hashes, ownership/deletion records and the
summary calculation. The archived producer remains the authority for v1 timings.
Initial maintenance
removed unused code, retained collection identities and made Node cleanup
independent of browser shutdown errors. The current runner additionally implements
the v2 verification boundary; do not attribute v1 timings to that later runner.

Local unit validation passed all 384 tests. Runtime syntax, SDK bundle, release
metadata and every script/test syntax check passed. The final measured product
files match the archived hashes. These local checks do not convert the partial
live matrix into a completed run.

The local-only archive is
`/Users/steven/Dev/sillymemory/artifacts/branch-checkpoint-v1/evidence.tar.gz`,
SHA-256 `c2e0c24520415112e00f0565f6bab6d8fc398ca53818e90ca4f45f8e2dea4708`.
All 17 archived files were read back and matched their original bytes. It is not
available in a fresh clone and is not required by ordinary CI. Historical evidence
was not modified or deleted.

## Reproduction

Use a disposable checkout of the pinned host with its locked dependencies
installed and a `public/scripts/extensions/third-party/sillymemory` symlink to this
repository. The runner temporarily instruments the host's embedding function and
restores it in cleanup. It creates a disposable native user/data directory.

```sh
ST_SOURCE=/absolute/path/to/disposable-pinned-host \
SM_ENV_FILE=/absolute/path/to/primary-repository/.env.local \
ST_TEST_PORT=18188 \
node scripts/branch-checkpoint-cost.mjs artifacts/branch-checkpoint-unique
```

The current runner uses the v2 plan; reproduce v1 only from its archived producer
and frozen plan. The output directory must not contain a prior plan. Credentials
are read directly
from the specified file and are not copied into the worktree or reports. Keep
`pending.json` if cleanup fails; it records only the generated owned collections
that the runner may delete. Preserve complete reports, instrumentation and logs
under ignored artifacts. Do not reuse historical outputs as fresh-run evidence.
