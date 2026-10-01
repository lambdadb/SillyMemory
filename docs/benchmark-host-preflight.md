# LongMemEval host preflight — 2026-10-01

This follows the [offline data audit](benchmark-data-audit.md) and its
[two-question pilot design](benchmarks/pilot-design-v1.json). It exercises real
SillyTavern 1.19.0 (`06bde939`) and Chromium with local service fixtures. It is
**host integration evidence, not a model-quality benchmark or live LambdaDB test**.
The 42 evaluation questions remain unused by generation.

## Reproduce

```sh
npm ci
ST_SOURCE=/pinned/SillyTavern node scripts/benchmark-host-preflight.mjs \
  /path/to/checksum-verified-dataset-cache artifacts/host-preflight.json
```

The host checkout needs its installed dependencies and Playwright needs Chromium.
The script creates its own detached host worktree, extension symlink, configuration
and disposable profile. It does not change the supplied host checkout, read
`.env.local`, or use personal profiles. The output filename must not already exist.
The [report](benchmarks/host-preflight-v1.json) records source/plan hashes and the
host revision. Raw source dialogues, questions and outgoing prompts are not
included in the committed report; prompt hashes and coverage counts are retained.

A Node preload rejects non-loopback TCP connections from the host, and browser
routing rejects non-host origins. Unit tests exercise HTTP, HTTPS and native
fetch rejection plus permitted loopback traffic. Completion and LambdaDB fixtures
also reject unexpected operations. LambdaDB calls traverse the actual built-in
CORS proxy to a temporary local HTTPS service. Native Vector Storage's browser
API requests are intercepted locally; its server embedding/index backend is **not
tested**. No real model, embedding, LambdaDB collection or paid service is used.

## Input and execution boundaries

- The adapter admits only the frozen development questions `8ebdbe50` and
  `eeda8a6d_abs`, verifying their prepared-input hashes. It preserves all 487 and
  477 source messages, roles, order and explicit session/question date markers.
  Reference answers and evidence labels never enter the browser or service fixtures.
- The same input is independently restored for each of four modes at 32,768 and
  131,072 context tokens. Assistant messages are named `Assistant`, user messages
  `User`; this is conversational QA, not a fictional-character consistency test.
- The answer instruction asks for an answer from conversation history or an
  admission that it is unknown. The host is configured with the frozen model
  identifier, temperature zero and 1,024 output tokens. Every answer is a local
  marker. Inspect final outgoing messages, not only extension prompt variables.
- Vector Storage retains Protect 5, Insert 3, Query 2, chunk size 400 and its
  default prompt/placement. Its source is changed to the compatible `vllm` route;
  no embedding provider is actually invoked. Use the real **Vectorize All** UI
  handler and require its indexed hashes to match the restored source. This is
  an index-ready check, not a measurement of incremental indexing lag.
- SillyMemory retains Recent 12 / Budget 800 / Chunk 800 and managed-embedding
  collection requests. The local fixture stores real extension-generated documents
  and returns the first scoped source-order documents; native retrieval similarly
  returns the first source-order hashes. Neither fixture computes embeddings,
  semantic relevance or answer-aware ranking. Document counts apply to each scope.
- Summarize changes Extras to Main API and retains Classic, interval 10, 200-word
  instruction, default template/placement and no response-length override. Replay
  imported messages in order through user/assistant render events, waiting for
  each automatic summary to settle. No `/summarize` command, forced catch-up or
  edited summary cursor is used. Summaries are short local markers, so their
  fidelity, natural length and influence on future summaries are unmeasured.
- Summarize is frozen after replay for the isolated answer observation, preventing
  the fixture answer's render event from initiating another summary. This is a
  declared harness difference from continuous use; a live online experiment must
  account for subsequent automatic updates.

## Observations

The committed report contains the complete 16-row matrix. All benchmark source
messages remain unchanged through import/reload and answer generation, and every
dated question reaches the final request. At 128K the plain mode delivers all
source messages in their original roles; at 32K it omits older messages. Every
native memory block and SillyMemory's delivery verification reaches the final
completion fixture. These checks do not establish whether the right evidence was
retrieved or whether a model can answer correctly.

Plain-mode host counts illustrate the context boundary without depending on
the retrieval or summary fixtures:

| Development question | Context limit | Input budget after output reservation | Host prompt tokens | Source messages found verbatim in native roles |
| --- | ---: | ---: | ---: | ---: |
| `8ebdbe50` | 32,768 | 31,744 | 31,741 | 132 / 487 |
| `8ebdbe50` | 131,072 | 130,048 | 106,927 | 487 / 487 |
| `eeda8a6d_abs` | 32,768 | 31,744 | 31,651 | 156 / 477 |
| `eeda8a6d_abs` | 131,072 | 130,048 | 104,482 | 477 / 477 |

Text-coverage counts are substring checks, not semantic recall scores or a
one-to-one accounting of repeated identical text. The separate source hashes
verify chat preservation, and prompt hashes bind the observed host boundary to
the local completion transport.

SillyTavern's prompt-manager token count is captured synchronously at the non-dry-run
`CHAT_COMPLETION_PROMPT_READY` event. The same snapshot must match the completion
fixture's received messages by hash. This avoids a discovered measurement race:
reading the global UI counter after generation can observe a background dry-run's
count for a different prompt. Record the effective prompt budget separately from a
local `o200k_base` count of final content plus six tokens per message. The latter
is an estimate, not provider billing or the host's exact accounting. Do not
interpret a difference between these counters as an overflow.

Automatic summaries occur 49 times for the first question and 48 for the second
at each context size, within the frozen 51/50 call caps. Each update records its
trigger message, saved cursor, prompt hash, token estimate and output cap. All
updates after the first include the preceding local summary. These observations
validate event scheduling with immediate local responses, not provider latency,
timeout behavior, summary quality or paid execution cost.

Separate synthetic probes expose two host adaptation boundaries:

1. Empty messages survive chat storage but are omitted from the final request.
   Future evidence-position mapping must keep source indexes independent of
   outgoing-message indexes. The two selected questions contain no empty messages.
2. Macro spellings such as `{{char}}` and `{{setvar::...}}` expand during host
   generation and can change the stored first message. The pinned
   [Generate path](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L4488)
   explicitly substitutes macros into `chat[0].mes`. They are not simply inert
   dataset text. Neither selected history contains the checked macro spellings. Future
   cases need an explicit literalization/preservation policy and a new input hash;
   do not silently apply the current adapter to macro-containing histories.

An empty chat reload also restores the character greeting. The replay importer
removes that greeting before adding benchmark messages, preventing extra source
content from entering automatic summaries.

## What this enables next

The two development inputs can enter a separately bounded **32K live pilot** once
model availability, the official judge, finite request/storage limits and monetary
caps are verified. Preserve managed embeddings for SillyMemory. Keep failures and
unfavorable answers in the result; do not retry a successful low-quality response.

Do not promote the fixture token counts to token-savings claims: retrieval ranks
are arbitrary and summary text is deliberately tiny. Do not expand to the held-out
questions or claim general import compatibility from two macro-free inputs. The
ConvoMem usage decision remains as recorded in the [data audit](benchmark-data-audit.md#convomem-use-the-actual-schema-and-resolve-usage-terms-first).

## Validation boundaries and development findings

Unit tests cover adapter label isolation, input-hash/holdout checks, empty and
macro text preservation before host processing, role-aware coverage, network
rejection, and the committed report's provenance. The executable report covers
real host loading, import/reload, native event scheduling, final prompt assembly,
the proxy path and local owned-data deletion. It does not test live services.

Earlier local attempts exposed greeting insertion and macro expansion; those
failed attempts are not presented as passing reports. A subsequent diagnostic run
was intentionally interrupted before completion while correcting the macro probe.
A complete diagnostic run then exposed the post-generation UI counter race above.
Only the complete rerun with prompt-boundary token capture is committed.
Disposable host profiles and worktrees are
removed after both successful and failed runs; the successful run also confirms
explicit deletion of the locally emulated memory and native collections.

Validation completed: 249 unit tests, runtime/tool/test syntax, release metadata
and 57 local documentation links passed. The final local host run completed 16
answer-path checks, 194 automatic summary fixture calls and one synthetic edge
probe (211 local completions total), with zero blocked outbound attempts. No live
model or embedding results are claimed.
