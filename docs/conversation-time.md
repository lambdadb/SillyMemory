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
  "timestampSource": "host_message",
  "conversationTimeContext": "Message sent at 2025-04-03T12:00:00.000Z (UTC), supplied by the host; not an event date. UTC alone does not establish the speaker's local date."
}
```

The same source metadata accompanies every chunk of that message. LambdaDB stores
and indexes the timestamp as `datetime` and the source as `keyword`. Managed
embeddings and lexical search still evaluate only `text`. Native Jev receives
`['role', 'conversationTimeContext', 'text']`; role and the derived time explanation
have explicit `keyword` indexes because native reranking accepts stored string
fields with text/keyword indexes, not datetime indexes. See the
[LambdaDB contract](https://docs.lambdadb.ai/guides/search/managed-reranking).
Missing/unsupported source time omits the entire explanation. This adds no model
call or event-date extraction, and never declares the newest statement correct.
The query, candidate limits and default relevance criteria stay unchanged.
The extra strings consume reranker input capacity and may add inference cost;
existing provider size limits and fail-closed handling still apply.

This is a semantic adoption: the reranker should see who made a statement and
what a supplied clock means. The [BEAM comparison](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/beam-evaluation.md#batch-reference-dates-in-reranking-and-generation-2026-10-19)
does not establish reliable net quality improvement or validate host timestamps.
Its batch reference dates must remain separately labelled, never converted to
host send times. No BEAM-specific metadata enters product documents.

## Selection and generation

The complete assembled or separate excerpt layout, including its time labels and
shared system guidance, is counted during retrieval-order chunk admission. A dated
chunk either fits with its date or is omitted; the extension does not silently inject `today` while dropping its available date.
For example:

```text
[Past conversation excerpt: user "User", message 1, passage 1, sent: 2025-04-03T12:00:00.000Z]
I started flute lessons today.
```

The stored `timestampSource` remains validation metadata; it is not repeated in
each prompt header. One shared explanation is delivered as system memory guidance,
including no-hit/undated requests, and counted within the same budget. It states
that sent dates are conversation clocks rather than necessarily event dates, and
that relative dates require a known local conversation date; UTC alone is insufficient.
No instruction is inserted into the quoted source body.

UTC identifies the supplied clock representation; it does not establish the
speaker's original local timezone. Do not infer a historical timezone from the
browser's current location. Literal `today/yesterday/tomorrow` can refer to a
conversation date, a narrated event, a quotation or a fictional story calendar.
Explicit narrative dates and story context must remain distinguishable from
host provenance. A conversation timestamp alone is not an event-state resolver.

Missing source timestamps produce no invented labels. Current local source
remains authoritative: remote time/source fields must match reconstructed source
metadata (including the derived explanation) before a ranked hit is accepted. An
altered remote label cannot override
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
configurations. Previously created experimental collections lack the new keyword
indexes and must be rebuilt through owned collection deletion/resynchronization
before
using this policy. No automatic schema migration or text-only fallback is added;
do not modify unrelated collections or infer missing dates.


## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/conversation-time.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
