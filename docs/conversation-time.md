# Conversation-time metadata

Each indexed chunk preserves an optional `conversationTimestamp` (canonical UTC
ISO string) and `timestampSource: 'host_message'`, separately from its verbatim
`text`. The timestamp is the selected SillyTavern message's `send_date`; it is not
an inferred event date, import time, current-clock fallback or immutable creation
time. The parser accepts the pinned host's ISO UTC values and positive integer
Unix milliseconds; unsupported, malformed and missing values remain unknown.

```json
{
  "text": "I started flute lessons today.",
  "conversationTimestamp": "2025-04-03T12:00:00.000Z",
  "timestampSource": "host_message"
}
```

The same source metadata accompanies every chunk of that message. LambdaDB stores
and indexes the timestamp as `datetime` and the source as `keyword`. Managed
embeddings and Jev evaluate `text`, so time labels are not inserted into the
embedding source or reranker body. Time metadata does not automatically change
retrieval ranking, introduce date filters, or make the newest statement authoritative.

## Selection and generation

The complete excerpt, including its provenance label, is counted during whole-
chunk selection. A dated chunk either fits with its date or is omitted; the
extension does not silently inject `today` while dropping its available date.
For example:

```text
[Past conversation excerpt: user "User", message 1, passage 1]
[Conversation timestamp: 2025-04-03T12:00:00.000Z; source=host_message; UTC, not story/event date; original local timezone unknown]
I started flute lessons today.
```

UTC identifies the supplied clock representation; it does not establish the
speaker's original local timezone. Do not infer a historical timezone from the
browser's current location. Literal `today/yesterday/tomorrow` can refer to a
conversation date, a narrated event, a quotation or a fictional story calendar.
Explicit narrative dates and story context must remain distinguishable from
host provenance. A conversation timestamp alone is not an event-state resolver.

Missing source timestamps produce no invented labels. Current local source
remains authoritative: remote time/source fields must match reconstructed source
metadata before a ranked hit is accepted. An altered remote label cannot override
local text or timestamps. Duplicate-text packing only combines equal time/source
metadata; distinct dates and unknown-versus-known dates cannot be collapsed.
Source roles, speaker, message/chunk coordinates and full bodies are retained.
The host's overall prompt limit still applies after memory selection.

## Synchronization and checkpoints

Time metadata participates in the source revision and chunk identity. A timestamp
change or removal deletes obsolete IDs and submits the current chunk with its
metadata. Reload checks full expected fields before reusing a remote document.
Selected swipes supply their current host date. Native story branches and
checkpoints retain the existing ownership, transcript and commit checks; metadata
is reconciled against the current source path, not borrowed from another branch.
Do not claim an embedding-cost saving for timestamp edits: reconciliation uses
ordinary managed-embedding upserts and may invoke embedding again.

No legacy conversion mode is introduced: this project has no installed users.
Use a fresh owned collection for pre-release experiments with changed index
configurations; do not modify unrelated collections or infer missing dates.

## Historical evidence and validation

PR #66 added local, optional post-selection time labels. This change replaces that
representation with stored, fully budgeted metadata. Its historical contract and
complete validation are preserved at
[28342fd](https://github.com/lambdadb/SillyMemory/blob/28342fdb44cb196027bf8ad1fa7d92bae702704b/docs/conversation-time.md)
and the local-only host-time archives described in [evidence retention](evidence-retention.md).
The earlier benchmark experiment used explicit dataset session dates, which are
not real host timestamps. Imported histories without `send_date` remain unknown;
this feature does not claim to recover their 24-day answer automatically.

The current bounded evaluation is recorded in [the default-candidate decision](conversation-memory-defaults.md).
Whole user/assistant pairs and unconditional neighbor expansion are excluded.
