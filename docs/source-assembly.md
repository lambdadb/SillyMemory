# Source-preserving memory assembly

## Behavior

The memory injection path now assembles selected chunks from the same message and
revision using their returned text and UTF-16 `start`/`end` offsets. The formatter
needs no complete message, dataset, local source slice, extra retrieval or LLM.
The surrounding engine still synchronizes the current chat and validates returned
IDs, ownership, scope, revision, exact text and time metadata against current
source documents. Remote role/speaker/offset fields never override those documents.

The host adapter quotes the selected rendered excerpts in one user-context archive,
preserving their internal source labels and chronology. Its heading participates in
the caller's budget counter; source assembly still returns individual provenance
records. Final delivery verifies the whole block. See [current defaults](conversation-memory-defaults.md#quoted-archive-and-recent-dialogue).

- Visit valid hits once in retrieval order. Before accepting each hit, assemble
  it with the already accepted sources and count the complete final text. Select
  the cheaper of separate and assembled layouts for that same source set.
  Skip a hit that exceeds the budget and continue with later hits; do not reserve
  space for lower-ranked sources selected by an earlier unassembled pass.
- Keep identical-text groups opaque, with every source coordinate at their latest
  occurrence. Do not join across these groups, other messages/revisions, roles,
  speakers, owners/scopes or conversation timestamps.
- Adjacent singleton chunks share a message/passages/time header. Sort by original
  offsets, join touching ranges and remove overlap only when the returned overlapping
  UTF-16 text matches. Never fill a missing interval: insert
  `[Omitted original text between excerpts]` between separated ranges.
- Invalid coordinates, inconsistent chunk order or conflicting overlap retain
  the original separate excerpts. Literalize macros after joining; recall cannot
  execute a macro split across chunk boundaries.
- Count all provenance, time labels, gap markers and host guidance through the
  supplied token counter. An adjacent chunk can fit by sharing a header; no
  accepted body is shortened. Failed token counting stops selection.
- Keep a source timestamp inline as `sent` in its excerpt header. Explain the
  meaning once in system memory guidance, including no-hit requests, within the
  same allocation. Native UTC precision is unchanged; unknown dates stay absent.
  Message time does not establish the date of an undated story/event. Historical
  LongMemEval adapters used the same label for supplied session clocks without
  inventing UTC or seconds; restore their recorded producers for replay.
  Resolve relative days only against a known local conversation date: a UTC
  instant alone does not establish the speaker's calendar day. If that date is
  unknown, preserve the ambiguity rather than assuming a timezone.
- Render the selected sources in original conversation/chunk order. This
  presentation order does not change their retrieval-order admission priority.

Current defaults retain five recent eligible native messages (six after an
adjacent reply), plus recalled memory, memory budget4096 (maximum4096), chunk ceiling800
codepoints, vector k200/rerank candidate200/final size50, Bayesian English fusion with managed Jev and one
current-question query with independent completed-history indexing; see
[current policy](conversation-memory-defaults.md). The host's existing one-quarter-context budget cap,
current-chat validation, cancellation, credential handling and prompt-delivery
checks are unchanged by the selector change.
## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/source-assembly.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
