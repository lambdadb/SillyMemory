# Evaluation and device continuity follow-ups

Discussion record: 2026-10-01. This records the current evidence boundaries and
proposed follow-up work; it does not report new live tests or implemented device
continuity. Historical protocols, raw reports and scores remain unchanged.

## What the existing comparisons establish

The [three-mode comparison](three-mode-results.md) and
[Insert# sensitivity study](native-tuning-results.md) used a 1,536-token host
context. This is a useful constrained-context regression test: source facts fall
outside ordinary history and must be recovered. It does not establish typical
user experience, broad recall superiority, or savings at larger context sizes.
The observed roughly 44% lower SillyMemory answer input is configuration-specific,
not a general cost saving. Cache usage and embedding/storage costs also matter.

The discussion accepted the rationale for the Vector Storage adjustments, while
retaining their limitations. Against pinned SillyTavern 1.19.0 (`06bde939`):

| Setting or procedure | Host default | Recent comparison and rationale |
| --- | --- | --- |
| Embeddings | Local (Transformers) | Live OpenAI `text-embedding-3-small`, matching the managed model name; this changes quality, resources and setup experience. |
| Retain# | 5 | 8, matching the recent-message count used by SillyMemory; this can change which retrieved messages are excluded from insertion. |
| Insert# | 3 | Initially 3; a separately declared sensitivity study compared 3 and 10. Ten is not established as optimal. |
| Index preparation | Background indexing on message events | Import fixed source and complete the native Vectorize All action before questions; tests ready-index quality, not automatic indexing delay or recovery. |
| Query / chunk / threshold | 2 / 400 characters / 0.25 | Unchanged, as were the native injection template and placement. |

Native retrieval, ranking and prompt insertion were not rewritten. Its existing
OpenAI-compatible adapter used a private key-holding bridge; this was not a test
of normal provider-key setup. The [earlier Korean comparison](comparison-evaluation.md)
instead used context 32,768, Retain# 12 and Query 3; do not mix those conditions
with the recent cohort. Its full source fit the baseline context.

### Summarize needs a baseline closer to ordinary use

The Summarize experiment is recorded in [PR #33](https://github.com/lambdadb/SillyMemory/pull/33)
and its immutable [protocol](https://github.com/lambdadb/SillyMemory/blob/2bc0b1c6f2a312430e46032eeae5a5f6c8ab66a6/docs/summarize-evaluation.md)
and [results](https://github.com/lambdadb/SillyMemory/blob/2bc0b1c6f2a312430e46032eeae5a5f6c8ab66a6/docs/summarize-results.md).
Those results apply to Raw blocking, a 100-word target and manual catch-up of
imported history, not to enabling Summarize with otherwise default settings.

| Difference | Reason for the experiment | Consequence for interpretation |
| --- | --- | --- |
| Extras source to Main API | Use the configured chat model without an Extras summarization service. | An explicit setup choice, accepted in the discussion. |
| Classic to Raw blocking | Trace contiguous source consumption and previous-summary input. | Changes the model's input; not a default Classic comparison. |
| Automatic updates to paused/manual calls | Fix preparation and answer-call order and finish imported-history catch-up. | Does not verify updates during ordinary conversation. |
| 200 to 100 target words | Use a short summary in the small context. | No validated basis for choosing 100; stronger compression may contribute to missing facts. |
| Inherited response limit to explicit 256 | Bound output using the existing answer-test limit. | May equal an inherited 256 limit, but adequacy for a 200-word summary was not established. |

The provisional 10/16 answer score cannot be attributed to the default feature.
Neither the effect of the 100-word target nor repeated summarization was isolated.
No truncation at the output limit does not prove that the requested summary
length had no effect on omissions.

For a follow-up, choose Main API and retain Classic blocking, 200 target words,
automatic updates enabled, interval 10, the inherited response limit and the
default instruction/wrapper/placement. Advance source messages sequentially
through the real host event path; capture when automatic summaries actually run.
The interval counts messages since the summary marker, not ten user/assistant
turn pairs. Do not replace automatic updates with forced catch-up calls. Declare
the shared chat response cap in advance, allow adequate summary output, and keep
truncation or missed triggers as results rather than silently retuning them.

## Larger-context evaluation proposal

Distinguish model capability, the configured host limit, actual prompt occupancy
and output reservation. GPT-4.1 mini, used in the existing experiment, supports
about [1M context tokens](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
For another scale reference, the original Qwen3 8B/32B family documents
[32K native context and 128K with YaRN](https://github.com/QwenLM/Qwen3/blob/main/docs/source/deployment/vllm.md).
These are capability examples, not evidence of SillyTavern users' typical settings
or a requirement to fill every request to the model maximum.

Proposed next settings are **32K for the main comparison and 128K for a robustness
check**, retaining 1,536 only as a small regression case. These are not yet a
frozen protocol, measured user defaults, or completed experiments. Separate:

1. **History fits:** compare against plain SillyTavern with all source available.
   Determine whether memory preserves answer fidelity while reducing actual
   input and cost; include cases where memory is unnecessary or harms answers.
2. **History exceeds the configured context:** use histories long enough to
   exclude old facts from the ordinary prompt. Verify that exclusion in actual
   requests, then measure recovery by native Vector Storage, native Summarize
   and SillyMemory.

Use coherent bilingual histories with multiple events, speakers, corrections,
conditions and unknown facts. Avoid scaling solely by repeating housekeeping
padding. Reserve held-out cases before tuning; do not reuse familiar questions
as generalization evidence. Use matched source/model/context within each cohort,
retain default and explicitly tuned native conditions as separate arms, and
record every deviation from shipped defaults before running.

Measure answer fidelity, evidence delivery, summary fidelity, recent-history
preservation, input/cache/output tokens, embedding and summary-generation usage,
latency, failures and fallback use. Separate one-time ingestion from ongoing
updates. Freeze call/spend bounds, retry policy and cleanup before paid runs.
Use human-review packets and label assistant grading as provisional. Larger
context can change rankings, prompt composition and summary-update behavior;
the small-context results cannot simply be extrapolated.

## Local embeddings and the managed-service distinction

Native Vector Storage already supports embeddings without an external provider
API key. Therefore, avoiding a separate embedding API key is not a unique
advantage over every native configuration. The managed-service distinction is
offloading embedding inference and vector storage/search from the host, with
network, service-availability, data-transfer and service-cost tradeoffs.

The native [Local (Transformers) provider](https://docs.sillytavern.app/usage/core-concepts/data-bank/#local)
runs on the SillyTavern Node server, not necessarily the device displaying the
browser. The pinned shipped config selects `Cohee/jina-embeddings-v2-base-en`;
the pipeline requests a quantized model and caches the loaded instance. The
underlying [Jina model](https://huggingface.co/jinaai/jina-embeddings-v2-base-en)
has 137M parameters and targets English. Its model size alone is not a runtime
RAM estimate or evidence of Korean retrieval quality. This is a smaller workload
than running a multi-billion-parameter chat generator, but not resource-free.

Measure model download/load, peak and steady memory, CPU use, initial full-chat
indexing, incremental updates and query latency separately on declared hardware.
Include interference with other work if claiming a resource advantage. Do not
claim that local embeddings require a dedicated GPU, are always expensive, or
are negligible without measurements. No local-embedding resource or bilingual
quality benchmark was completed in this discussion.

## Same-server device continuity: current limits and follow-up

Remote memory storage does not currently provide automatic cross-device resume.
The implementation's state is split as follows:

| State | Current location |
| --- | --- |
| Original chats, characters, per-account owner ID | SillyTavern server/account settings |
| Indexed older source excerpts and vectors | LambdaDB |
| Endpoint, project, collection identity, preferences, mutation journal | Browser localStorage, namespaced by owner |
| API key | Current browser memory only |

Another device using the **same server and account** can access the host chat
and owner identity, but does not automatically receive the browser-local
collection mapping. Entering the same API key does not discover/reconnect the old
collection; current provisioning can create a separate collection. A fresh
SillyTavern installation also has different owner/source identities. Chat export
alone is not a supported memory-ownership migration.

The full current chat is authoritative: scope includes owner, avatar filename
and chat filename, and remote hits must match locally reconstructed source IDs,
revisions and text. A remote index is not a full chat backup or an independent
account-wide memory store. It cannot restore missing source history. These checks
protect against deleted/edited messages and cross-chat leakage and must remain.

The first proposed continuity scope is **sequential use of the same server/account
and chat from another device**. Share validated non-secret connection/collection
metadata via account settings; keep API keys session-only on each device. Verify
ownership when reconnecting and avoid duplicate provisioning. Reconcile deletion
history across devices: moving the collection pointer alone does not migrate the
browser-local mutation journal or recover uncertain writes.

Before supporting simultaneous use, design coordination for stale chat snapshots,
write/delete races, collection creation and full cleanup. The current Web Lock
covers one browser's tabs only, not other browsers/devices. An initial sequential
handoff policy also needs enforceable ownership or safe stale-client behavior;
do not advertise concurrency safety based on a UI instruction alone. Preserve the
UI-extension/built-in-proxy design, with no LambdaDB changes or server plugin.

Observable acceptance checks should include fresh-browser reconnect without a
new collection, identical scope for the same host chat, key re-entry, visibility
of edits/deletions, rejection of another account/branch, interrupted-write
recovery and safe behavior when an old device reconnects during/after cleanup.
Independent-installation migration and memory without original chat are separate
design questions, not implied by this scope. No multi-device integration test or
continuity implementation is claimed here.

## Source anchors and next work

Host defaults and execution paths: pinned
[Vector Storage](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/vectors/index.js),
[Summarize](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/memory/index.js),
[model configuration](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/default/config.yaml),
and [Transformers pipeline](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/transformers.js).
Product state/source validation: [adapter](../index.js),
[memory engine](../src/memory.js) and [architecture](architecture.md).

Prioritize freezing the larger-context protocol and default-behavior Summarize
baseline together, then complete that comparison and report unfavorable outcomes
as well as improvements. Keep local-embedding measurements as a distinct cohort.
Device continuity is a separate product follow-up, not a prerequisite for the
evaluation or a feature delivered by this documentation change.
