# Host-message time provenance

## Product decision and contract

Recall can identify when a source message was recorded by SillyTavern without
claiming when a narrated event happened. After the existing packed selection,
SillyMemory adds a compact header to the first excerpt when spare memory tokens
permit it, for example:

```text
[Past conversation excerpt: user "User", message 1, passage 1]
[Host message timestamps (UTC; not story/event dates): 1=2024-02-29T12:34:56.123Z]
The treaty was signed in Frostmonth, year 812.
```

Coordinates use the same one-based message positions as excerpt labels. Repeated
packed passages retain distinct occurrence coordinates and timestamps. An omitted
coordinate has no supplied timestamp; it must not inherit another message's date.
Annotations may cover only some selected sources when the remaining budget is
small. They preserve every selected passage, its speaker/role, full body, ordering
and source coordinates. Complete injected text, including labels, must fit the
existing memory limit; the default remains 800 tokens. A full budget or absent
supported metadata leaves the shipped selection unchanged. No UI switch is added.

Only the current local snapshot supplies timestamps. The parser accepts canonical
UTC ISO timestamps (optional one-to-three millisecond digits) and positive integer
epoch milliseconds. Invalid calendar dates, missing timezone, date-only strings,
old display formats and unknown values are omitted. There is no current-clock
fallback, timezone guess, narrative date extraction or event chronology inference.

`recordedAt` exists only in the captured local snapshot. Remote document bodies,
IDs, revisions, schema, embedding requests, queries and branch identity are
unchanged. Timestamp-only edits invalidate an outstanding prompt but do not cause
another upsert or embedding. Reload and selected swipes use current host metadata;
remote timestamp fields are never trusted. Token-count failures remain fail-closed.

## Pinned source inspection

Supported host: SillyTavern 1.19.0 at
[`06bde939fb1e9c4c8d8641d810f0a916b5bce127`](https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127).
Its [`getMessageTimeStamp`](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/RossAscends-mods.js#L192)
returns ISO UTC. Generation/continue can update `send_date`, and
[`syncSwipeToMes`](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js#L6954)
restores the selected swipe's date. Therefore the label is **host message
timestamp**, not immutable creation time or an in-story event date. This inspection
establishes the source contract, not a new host compatibility claim.

The earlier [explicit session-date experiment](bayesian-sdk-validation.md#compact-session-provenance-follow-up--2026-10-06)
used benchmark session dates. Those are a different source. Its recovered 24-day
interval is not evidence that this host-metadata feature fixes that benchmark.

## Validation and limitations

Deterministic checks use synthetic inputs and the pinned actual host with a local
HTTPS LambdaDB emulator. They do not measure deployed retrieval quality:

- `npm test`: 321 passing unit tests, including parser rejection, unchanged remote
  documents, repeated occurrence coordinates, exact/partial token limits,
  timestamp-only edits/reload and asynchronous prompt invalidation.
- `npm run check`, `npm run check:release`, `npm run check:sdk`: pass; SDK 0.8.0
  and its locked bundle are unchanged.
- `ST_SOURCE=... SM_ARTIFACT_TAG=time-provenance-v2 ST_TEST_PORT=18148 npm run test:recovery`:
  192 host/emulator checks, zero uncaught page errors and zero remaining emulator
  collections. Timestamp labels reach the interceptor; timestamp-only edits add
  no upsert; annotations never enter stored source or remote documents.
- `ST_SOURCE=... ST_DELIVERY_PORT=18150 node scripts/prompt-delivery-smoke.mjs artifacts/time-provenance/prompt-delivery.json`:
  13 final-provider delivery cases plus repeated-passage packing pass. Existing
  fixtures without timestamps retain their delivery behavior.

The first recovery attempt failed an existing excerpt detector because the new
header preceded its identifying first line. The corrected implementation keeps
that original line first and inserts provenance beneath it. Both failed and
passing reports are retained, rather than erasing the failure.

## Bounded English answer check — 2026-10-06

Six frozen synthetic histories were run once per arm through actual host
`Generate`, GPT-6.1 Sol with low reasoning, 4,096 output tokens, 32K context,
recent=3 and the unchanged 800-token memory cap. Both arms replay the same fixed
source rankings; local sync validates source documents without uploading quality
histories. Baseline removes only local `recordedAt` in an ignored evaluator;
candidate runs the production retrieval method unchanged. Arm order alternates.
All histories, questions, expected meanings and exact selections were frozen before
calls. This is a representation/safety check, not deployed retrieval evaluation.

| Case | Baseline | Candidate | Interpretation |
| --- | --- | --- | --- |
| Explicit UTC host-message date | Appropriately abstains: timestamp absent | March 2, 2024, correct | Newly supplied provenance makes the request answerable. |
| Past narrated event | May 12, 2024 | May 12, 2024 | June host timestamps do not replace the event date. |
| Planned future move | Lantern remains in pantry | Same | A plan is not a completed move. |
| Canceled rehearsal | Canceled; no replacement date | Same | Cancellation remains authoritative. |
| Unknown story date | Appropriately unknown | Same | August host time is not invented story time. |
| Fictional calendar | Frostmonth day 7, year 812 | Same | September UTC does not replace the fictional date. |

Assistant semantic review inspected all twelve complete answers against source,
not an exact-string grader or independent human/official benchmark judgment. The
candidate makes one explicit host-date request answerable and preserves the other
five outcomes. Baseline abstention is expected, not a generation-model defect.
Every final provider request contains its exact selected excerpts/recent source
and question. No selected passage changes or disappears. Each candidate adds
50 host-counted memory tokens in these two-source cases: baseline 57–76, candidate
107–126; billed input grows by 50 in each pair. This is extra provenance, not a
token-saving claim. It fits comfortably here; typical full-budget recall may omit
all timestamps. No more difficult interval or event-resolution benchmark was run.

The run completes 32 host checks and 13 successful provider calls (twelve answers
plus READY), zero retries, within the frozen maximum of 21 attempts. Real
LambdaDB is used only for the existing connection gate/story setup; both owned
setup collections are deleted and verified 404. Keys are absent from persisted
host/browser settings. The final producer hashes match the pre-call freeze.
No new language, hybrid/reranker, embedding or capacity setting is adopted.

## Evidence retention

Base: `cf8c70a81a4e4036b529a0bf9e3c4cbd3fbdd278`; exact runtime patch/new files,
frozen inputs/settings, preparer/evaluator, full provider prompts/answers,
semantic review, both recovery reports and cleanup receipts are retained in
`artifacts/archive/host-time-v2/evidence.tar.gz` in the primary `sillymemory`
worktree and the `sillymemory-time-provenance` worktree. Local-only, unavailable
in a fresh clone: 1,000,227 bytes, 32 files plus manifest, SHA-256
`292bd6ff18e221bd8802223fd5745f4958980be9e042b71d5a28f2b26b8f5b1f`.
Both copies and every member are read back and byte-verified; configured-secret
matches are zero. The README describes restoration and separately required host,
dependencies and credentials. The first failed recovery report has no independently
captured producer hash; its known header-position error is not presented as a
byte-verified original producer. A raw-output v1 archive is also preserved; v2 adds
the completed semantic review after a local verifier's missing-field correction.
No provider answer or frozen input was rerun or changed for that correction.
Existing historical archives and detached evidence worktrees remain intact.

This feature supplies provenance; it is not an event-state resolver, a new
retrieval strategy or a general temporal benchmark.
