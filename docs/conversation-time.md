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
what a supplied clock means. The [BEAM comparison](beam-evaluation.md#batch-reference-dates-in-reranking-and-generation-2026-10-19)
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

### Role/time reranking acceptance (2026-10-19)

The adopted fields pass 380 unit tests, runtime/release/SDK checks and script/test
syntax checks. A final timestamp-edit assertion also passes with 61 related tests.
Pinned SillyTavern 1.19.0/Chromium with real managed LambdaDB/direct CORS passes 22
lifecycle checks, including dated/unknown documents, rerank fields, recall, branch
isolation, reload and owned cleanup. Local-provider browser tests pass 103 checks;
final prompt dispatch passes 18 cases plus packing/assembly. No live generation
calls, full benchmark rerun or deployment; fresh checkpoint-manager live modes
were not rerun. All tested runtime source hashes match; owned data is cleaned.

Evidence is local-only at `artifacts/archive/role-time-product-v1.tar.gz`:
SHA-256 `4a802f87cd5aa53050d18c38c69172326e1a8a7db0bcced825c307589ca7099e`.
All 35 members (443,248 bytes) pass secret scanning and hash readback. Restore under
`artifacts/` and read `role-time-product-final/RESULTS.md` for exact commands and
boundaries. Producer: `8f86e55df1d9aa92bf52e3d0ab0adc838d0b7239` plus its bundled
`product.patch`. Initial failures and the pre-wording-change validation remain
preserved; this is not a fresh-clone download promise.
