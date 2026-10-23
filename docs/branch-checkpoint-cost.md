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

## Memory preparation after restore: UI excluded

Use these module-level timings for memory-performance comparisons. The later
workflow diagnostics include UI automation and are not memory-preparation latency.

On October 23, 2026, producer `5ae4a167be33e0ffe154f907763840e95f31605d`
ran the [frozen memory-preparation plan](benchmarks/checkpoint-memory-prepare-v1.json)
on the same deterministic 50/500-message fixtures and Apple M5 Pro / macOS arm64,
Node 24.15.0, Chromium and pinned SillyTavern 1.19.0 host. Both arms were rerun.
The local quantized Jina model was warmed before timing; LambdaDB used the
unchanged native Small embedding field and 800-character chunks.

| Restored transcript | Built-in Vector Storage: two preparations | LambdaDB memory: two preparations | New indexing inputs per preparation, built-in / LambdaDB |
| ---: | ---: | ---: | ---: |
| 50 messages | 12.876 / 12.680 s | 0.449 / 0.552 s | 50 / 0 |
| 500 messages | 142.170 / 142.469 s | 0.997 / 1.011 s | 500 / 0 |

Each timer starts after the restored JSONL is already selected and loaded. Browser
`performance.now()` surrounds only the actual memory synchronization functions.
For built-in Vector Storage, a disposable export invokes the existing
`synchronizeChat(getBatchSize())` batches until complete, retaining the default
batch size and embedding/indexing path while omitting button/progress UI. For
SillyMemory, a disposable browser-module export invokes the actual
`prepareMemory` and `MemoryEngine.sync` path, retaining saved-identity validation,
branch creation, ownership checks and full inherited-source reconciliation.
No production module behavior was changed.

Module imports, model warmup, copying/opening chat files, UI clicking, toggling,
settings drawers, automation waits and additional benchmark full-index checks
are outside both timers. No UI-inclusive total is reduced by an estimated
constant. Initial parent writes are verified committed before snapshot creation;
initial acknowledged-write timings are not used as a ready-index comparison.
These are memory-preparation measurements, not complete chat restoration or
first-answer latency. Each range covers two paths, not a percentile distribution.

The LambdaDB preparation made 7 requests for 50 messages and 15 for 500 messages,
with zero upserts. The included branch-create calls were 76.9 / 67.8 ms and
64.4 / 68.8 ms, respectively. The remaining time covers the real synchronization
path, including inherited-document checks; it is not UI automation. Complete
committed index/hash sets and every saved JSONL message field were verified
outside the timers for both arms. The inherited memory contains 44 / 494 passages,
with the six recent messages retained in the native transcript.

All twelve preparations and fourteen checks passed. Local embedding executions
were 1,651 including warmup and initial indexes; managed submissions were 539
including the transport-test document and initial 538 passages. No restored path
submitted managed documents. There were 3,307 native vector API requests and 305
browser LambdaDB requests, plus three independent Node cleanup reads. No
browser errors or generation/judge calls occurred. All three owned collection
intents were independently verified as HTTP 404; disposable host instrumentation
was restored and native data removed.

**Decision:** compare actual memory preparation, excluding UI automation on both
sides. Preserve UI-inclusive measurements below as workflow diagnostics only.
The persistence/isolation conclusion is unchanged; these timings do not establish
answer quality or latency across other models and hardware.

```sh
ST_SOURCE=/absolute/path/to/disposable/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local \
node scripts/branch-checkpoint-cost.mjs --memory-prepare-only artifacts/memory-prepare-run
```

The frozen plan bounds this to three collection intents, 550 managed documents,
2,000 local embedding inputs and 20 minutes with no generation calls. Detailed
raw evidence is retained locally, not bundled with a fresh clone or required by
CI. Archive SHA-256:
`7ff680c6c51e8b2950d174760355a62965954f1818155f7b602a39c655ed8543`;
raw report SHA-256:
`cb008a5102f6a2fa8b427645d9559917aff5bee18fd136809e662e7651d849a4`.
All 413 archived files, including exact source, test-only exposures, frozen plan
and raw counters, were read back and matched byte-for-byte. No credentials were
included. The earlier evidence archives remain unchanged.

## Checkpoint workflow diagnostics (UI included)

Frozen snapshots preserve the full native JSONL transcript with the same
older-history memory partition used in ordinary synchronization. Saving does not
index retained recent messages solely for the snapshot. Missing or changed older
passages still reconcile before readiness; resumed paths archive recent messages
when later dialogue displaces them. See [frozen memory snapshots](checkpoints.md).

The live run on October 23, 2026 used producer
`efa63096c73e782ca95be7f77b258befabea9d75` and the
[frozen checkpoint plan](benchmarks/checkpoint-memory-boundary-v1.json).
It ran real SillyTavern 1.19.0 (`06bde939fb1e9c4c8d8641d810f0a916b5bce127`),
Chromium and live LambdaDB on Node 24.15.0, macOS arm64 / Apple M5 Pro.
The default managed Small embedding field and 800-character chunks were unchanged.
Client/service locations were not recorded; no region-level latency claim is made.

| Transcript messages | Indexed passages | Snapshot save | Open / verify | Resume 1 / synchronize | Resume 2 / synchronize | New document submissions for each save/open/resume |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 44 | 1.540 s | 0.200 s | 3.439 s | 3.492 s | 0 |
| 500 | 494 | 2.154 s | 0.486 s | 4.477 s | 4.582 s | 0 |

These are single observations per operation and size, after a committed initial
index. Full timers include native UI actions and exact committed document-set
verification. The harness saved with memory off, then explicitly enabled and
synchronized each resumed path; these are not measurements of an enabled
snapshot's automatic first answer. Initial synchronization took 63.764 / 62.661
seconds and submitted 44 / 494 passages; it is excluded from the table above.

The `LambdaClient.createBranch` timer separately covers only the client-observed
API call, including transport and SDK validation, with retries disabled. Parent
commit preparation, transcript reconciliation and document verification are
outside this timer. Each call corresponded to one branch POST.

| Transcript messages | Stored passages inherited per fork | Snapshot / resume 1 / resume 2 branch-create calls | Median of the three calls |
| ---: | ---: | ---: | ---: |
| 50 | 44 | 66.4 / 84.2 / 69.0 ms | 69.0 ms |
| 500 | 494 | 66.9 / 60.0 / 61.9 ms | 61.9 ms |

All ten timed operations passed. Snapshot and resumed JSONL message rows matched
the original in every field, and all committed memory sets matched their intended
older-history partition without extra recent documents. An older-message edit in
one resumed path left the original path, frozen snapshot and sibling resume's
transcripts and committed memory unchanged. All three owned collection intents
were independently checked as HTTP 404 after cleanup. No browser errors,
generation/judge calls or local embedding calls occurred. The run recorded 566
browser LambdaDB requests and 541 managed document submissions: one transport-test
document, 538 initial passages and two isolated edit submissions. Three additional
Node reads independently verified cleanup.

The deterministic input hashes match the historical v2 comparison exactly.
Built-in Vector Storage was not rerun: its recorded checkpoint-open and each
resume indexed 50 / 500 inputs. The results below remain dated historical
observations, including the former six-document snapshot uploads; do not relabel
them as measurements of this implementation or pool their latency samples.

**Decision:** retain the shared recent-message boundary for snapshots. A complete
JSONL plus frozen older memory preserves the transcript and isolated paths while
avoiding recent-message indexing at save and subsequent recent-document deletion
at resume. No answer-quality conclusion follows from this persistence test.

Reproduce only the changed path on a disposable pinned host with its extension
symlink pointing at the checkout under test:

```sh
ST_SOURCE=/absolute/path/to/disposable/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local \
node scripts/branch-checkpoint-cost.mjs --checkpoints-only artifacts/checkpoint-run
```

The plan bounds this to three collection intents, 550 submitted documents,
125,000 submitted characters, 3,000 browser LambdaDB requests and 15 minutes, with
no generation calls. Detailed evidence is retained in a local-only archive,
not supplied by a fresh clone or required by CI. Archive SHA-256:
`ae247c4ff623b0ab17ec1760e444cb2f28865a96977b75947e13f529338b6cc5`;
raw report SHA-256:
`ba79c8e06f869975a1daabf2039c925e3f8a898038d3058cb4c1a46aecfdbfe8`.
All 408 archived files, including the exact producing source and frozen inputs,
were read back and verified byte-for-byte. No credentials were included.

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
18188. Unit/syntax/SDK/release checks passed. The executed producer and unchanged
product files are preserved with their verified hashes.

The separate local-only archive is
`/Users/steven/Dev/sillymemory/artifacts/branch-checkpoint-v2/evidence.tar.gz`,
SHA-256 `ba68a99a04ffd69d44ca17e58f3ef5eb93c69be94adf6d95d8f3997d3799d0a9`.
All 18 members were read back and matched byte-for-byte. It contains the exact
producer, frozen plan, raw report/counters, model hashes, offline analysis and
verification, cleanup receipt and restoration instructions. It is unavailable
in a fresh clone and is not a CI dependency. The v1 archive is unchanged.

Post-run review also hardened the maintained runner's cleanup constructor path.
A synthetic invalid-endpoint run (no remote requests) confirmed expected failure
exit 1, a saved recovery report, server termination, byte-exact host restoration
and temporary-directory removal. This cleanup-only change did not rerun or change
the live measurements. The separate `cleanup-evidence.tar.gz` sidecar under the
same retained directory contains the exact producer patch, failure report and
verification; SHA-256 `30c766f1d15add6b565ce6f7ac6254a10b7ce17fa57961a24a3f308860dbb8ed`.
All 12 members were read back and verified; the original v2 archive is unchanged.

The maintained runner subsequently gained occupied-port rejection, a bind-message
check tied to its own child process, and per-collection cleanup that continues
past individual failures while retaining unsuccessful entries. Four isolated
local regressions and the full 388-test suite passed. These startup/teardown
changes did not rerun the live matrix. Exact source and local verification are in
`hardening-evidence.tar.gz` under the same directory, SHA-256
`45123e7791778acc03a26bf5f9773704983fedd20f36df65278dd902a7922ecc`;
all eight members were read back and verified. Original archives remain unchanged.

The final maintenance change enforces the native input cap before each model
invocation, including failed attempts and warmup. A child-process fixture with a
cap of two and three concurrent inputs (one failing) confirmed only two pipeline
calls and rejection of the third before execution. All five safety regressions
and 389 full-suite tests pass. The pinned instrumentation passes syntax checking;
no new live matrix was run. `BUDGET-ADDENDUM.md` in the same retained directory
records the exact patch and verification, SHA-256
`b35ba99ba253b8ab8d2a72526061146ce416f23004387b7ed41bbe8efcda365d`.

The maintained entry point also rejects staged or unstaged tracked changes in the
pinned host before any native mutation. A temporary Git fixture and all 390 tests
pass. `HOST-PIN-ADDENDUM.md` records this preflight-only patch and local evidence,
SHA-256 `aa6c106d8b3612cc8a56da1c1429b2637672132e65d29d543301417a730cf3b3`.
No historical live measurements or archives changed.

Host mutation is now inside teardown protection and uses atomic file replacement.
A partial-write failure fixture preserves the original bytes and mode; cleanup
steps continue independently and native data is removed before final report save.
Seven local safety regressions and all 391 tests pass. The patch and local evidence
are in `ATOMIC-WRITE-ADDENDUM.md`, SHA-256
`398f58e91f8528892e4a03d1694de21022d0cbe095f1ae05a56ba6fd734e3c86`.
This is startup/teardown maintenance, without another live timing run.
The runner also opens optional Advanced/Checkpoints sections when present, so
it works with both the original settings markup and the settings-UX change.
Both actual HTML variants passed a local Chromium control-visibility check;
no live matrix was rerun for this UI-only runner adjustment.

## Interpreting user-visible waits

Native checkpoint save alone does not embed messages (0.142 / 0.148 seconds at
50 / 500 messages). In the pinned host, chat vectorization is event-driven:
message send, receive, edit, delete and swipe attempt synchronization, with up to
five unindexed messages per automatic call. Opening a checkpoint does not itself
run Vectorize All, and there is no continuously draining timer in this extension.
The explicit Vectorize All action used here repeats until complete. Consequently,
native timings below measure full-index readiness, not a mandatory pause before
continuing a conversation. Unindexed messages are unavailable to vector search.
See the [pinned host implementation](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/vectors/index.js).

The v2 logs separate managed processing from the additional committed full-list
verification. Subtracting that recorded verification interval gives:

| Messages | Operation | Before/without full-list verification | Full-list verification | Total seconds |
| --- | --- | ---: | ---: | ---: |
| 50 | End branch | 1.132 | 0.044 | 1.176 |
| 50 | Midpoint branch | 1.129 | 55.549 | 56.678 |
| 50 | First resume | 1.412 | 65.965 | 67.377 |
| 50 | Second resume | 1.457 | 47.024 | 48.481 |
| 500 | End branch | 1.768 | 0.230 | 1.998 |
| 500 | Midpoint branch | 1.985 | 61.581 | 63.567 |
| 500 | First resume | 2.209 | 54.158 | 56.366 |
| 500 | Second resume | 2.242 | 61.414 | 63.657 |

The verification column includes enumeration requests and polling, not pure server
commit time. Removing it does not establish first-query readiness. Checkpoint
save's internal product commit wait was not separately instrumented, so its
57.387 / 49.635 seconds cannot be decomposed from these logs.

## One OpenAI Small native comparison

A bounded follow-up used the same 500-message synthetic transcript and pinned host
for **one** fresh end branch with `text-embedding-3-small`. It ran the actual native
Vectorize All handler through the same `vllm` OpenAI-compatible loopback transport
as earlier quality benchmarks; credentials stayed in process memory. No new
SillyMemory run, generation, judging or checkpoint matrix was performed.

| Native Vector Storage, 500 messages | Local quantized Jina | OpenAI Small |
| --- | ---: | ---: |
| Full vectorization and index verification, including control overhead | 142.194 s | 47.821 s |
| Including branch creation | 142.350 s | 47.911 s |

OpenAI Small took **66.3% less time** in these single observations at different
times. The local Vectorize All handler processes one message per iteration;
OpenAI-compatible transport processes five. The result includes model, network
and batching differences, not an isolated model or backend speed comparison.
All **100 upstream requests returned HTTP 200**, with 500 inputs and **23,500
provider-reported tokens**. Provider request/response time totaled 28.904 seconds;
other index/control work took 18.917 seconds. No invoice or USD saving is claimed.

The branched transcript matched the source, its index was initially empty, and
all 500 expected message hashes matched on completion. Parent indexing was omitted
to keep this trial to 500 inputs; it does not independently repeat inheritance
testing with an already indexed parent. The reused dependency directory had an
identical lockfile, but its symlink caused avatar/image WASM path warnings. Do not
use this run as a precise chat-opening UI comparison; transcript/index checks
passed. Two setup-only failures made zero embedding calls; only one paid run was
performed. All temporary host/data directories were removed and port 18189 was
confirmed closed.

**Decision:** the earlier 143-second local baseline must not be generalized to
OpenAI-backed Vector Storage. OpenAI Small substantially reduced native rebuild
time in this case, while still embedding all 500 child messages. Keep the measured
reuse benefit distinct from first-answer latency, model quality and invoice costs.
No further trial or product default change is required for this operating-cost
screen; broader claims remain deferred.

The exact one-off producer, plan, reports, setup failures and cleanup evidence are
retained locally in `branch-checkpoint-openai-small-once/evidence.tar.gz` under the
primary repository artifacts directory; all members were read back and verified.
SHA-256 `cb4553e148b23d9e07b7e1ce6282acab04b47dff936eb102e5408e4378105660`. The archive is unavailable in a fresh clone and is not a CI
dependency; the one-off runner is not added to maintained scripts.

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

## Historical evidence

[Original v1 observations and method](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/branch-checkpoint-cost.md#historical-v1-ui-synchronization-results)
remain preserved separately; their UI timing does not establish committed readiness.
