# Architecture

## Boundaries

`index.js` adapts the pinned SillyTavern context, events, prompt interceptor, and settings panel. `src/client.js` sends direct browser HTTPS/CORS requests; it has a private in-memory key and sanitizes errors without logging response bodies. `src/gate.js` validates a synthetic lifecycle before memory collection creation. `src/status.js` formats progress and recovery guidance and ensures only the current operation owns the status display. `src/memory.js` is independent synchronization and selection logic.

There is no server plugin. Runtime modules have no external dependencies. Playwright is development-only. The extension source and development tools are distributed under AGPL-3.0-only; see the root LICENSE.

## Identity and source authority

The current SillyTavern chat is authoritative. The owner is a random per-account identity kept in extension settings; its initial save is awaited and read back before the UI permits remote operations. Browser-local configuration and journals are keyed by that owner. Scope is SHA-256 of owner, character avatar filename, and the saved story ID. Every story has one owned collection; each chat path has its own writable branch. Native metadata is persisted and read back before remote use. Verified native forks inherit the story scope; independent copies start new stories. The source revision hashes message position, speaker, role, selected swipe, and full text. A chunk ID contains scope, revision, chunking policy, ordinal and source offsets. Insertion/deletion can renumber subsequent messages and require reindexing; content is never deduplicated across scopes.

Only older eligible text is indexed. Chunks are up to 800 Unicode code points by default. They retain message and chunk provenance. The current implementation selects whole chunks and does not perform neighbor expansion. Renaming a chat preserves its saved identity. Changing the character avatar identity is not a continuity guarantee.

## Write ordering and recovery

Accessing the same SillyTavern server/account from another device shares host
chats and the owner ID, but not the browser-local collection mapping or journal.
Reconnect with the endpoint/project/key and prepare memory to reuse the saved
story identity. On first use/reload, remote reconciliation supplements the local
journal. Remote excerpts cannot replace the authoritative source chat. Sequential
access to the same server is possible; concurrent writers across devices remain
unsupported because browser locks do not coordinate them.

A per-engine promise queue serializes mutations. A session-long Web Lock prevents a second active tab for that account/browser. The local journal writes the union of prior and desired IDs **before** remote requests. Obsolete IDs are deleted; missing current IDs use normal upsert batches of 50. A successful pass replaces the journal with the desired IDs. In-memory acknowledgements skip duplicate writes during the session. On first use/reload or an uncertain write, list committed branch documents and fetch expected IDs consistently. Reuse exact field matches, delete obsolete IDs and submit only missing/changed documents, including recovery after lost responses. Native forks first confirm committed source state; see [commit confirmation](commit-confirmation.md).

No chat text or API key is persisted in the journal. If local storage fails, remote writes do not begin. An interrupted mutation may still reach the service; the durable intent and next reconciliation repair it. There is no background retry loop against a failing service. A new event, explicit Sync, or next generation retries. The synthetic gate polls readiness with a bounded attempt count; ordinary queries use a 15-second per-request timeout. Full initial indexing can require multiple requests and take longer.

## Retrieval and prompt application

Queries use the selected `chat_<ID>` branch with `consistentRead: true`, not Tags/Aliases. The empty `main` branch is an independent-story fork source. Managed embedding `knn.queryText` uses an owner/scope prefilter. Remote hits are ranking signals: only exact current IDs, ownership, scope, revision, and source text are accepted; injection uses the locally reconstructed text. This prevents eventual-index lag, deleted records, malicious remote text changes, and sibling-chat results from resurrecting stale content.

The `latest-anchor-with-context-selection-v5` query policy normally anchors on the
last non-empty user message (or the last non-empty message if no user exists).
The second query normally uses the preceding non-empty user turn. A newer
eligible assistant turn strictly before the anchor replaces it only when its
maximum lexical similarity to earlier eligible history exceeds the user's by a factor
of 1.25. With no prior user, keep the preceding eligible assistant fallback.
Assistant file/media/tool turns cannot become the second query. The local
comparison uses word trigrams and smoothed IDF-weighted cosine on at most 256
eligible messages before both candidates; no additional service call is made.
This is a bounded heuristic, not semantic reference resolution. Each text/query
is capped at 6,000 UTF-16 code units; duplicate queries collapse to one request.
Regenerate/swipe exclude retained answers after the user anchor. Explicit host
`continue` anchors on the latest non-empty message being extended and applies
the same context rule before that anchor. See the [query policy](query-policy.md)
and [context-turn results and limitations](context-turn-results.md).

The distinct queries run concurrently, each requesting 30 candidates with the same scope filter. Candidate ranks are interleaved, question first, then context. Scores from separate queries are not added or compared. Current-source validation precedes deduplication; whole passages are accepted while the complete wrapper stays inside the same token budget. This reserves early selection opportunities for the question and the contextual reference without guaranteeing equal token shares. One query failure cancels the sibling and rejects the entire retrieval; the existing full-prompt fallback applies. Two requests can increase managed embedding/query usage and latency compared with the original single query.

An epoch and a full snapshot comparison invalidate work across events, chat switches, disabling, and connection replacement. Pending queries are canceled when possible; canceled server writes are never assumed rolled back. Token counting and the final validity check precede mutation. Failed sync/query/counting or empty selection preserves the full ephemeral prompt. A valid selection replaces older eligible messages while preserving recent full messages and special messages. Only the generated `coreChat` array is spliced; persisted chat objects are untouched.

Selected excerpts replace eligible older messages in the ephemeral `coreChat` at their source positions, using the locally reconstructed user/assistant role and display name. Presentation is chronological even when retrieval ranks differ. A system extension prompt no longer combines different speakers. Recent and special messages retain their original objects; source chat is untouched. Source labels identify recalled passages without rewriting pronouns or treating a speaker as the actor of every reported action.

Macro braces and legacy `<USER>`/`<CHAR>`-style markers are rendered with fullwidth delimiters before budgeting. The joined excerpt content, source labels and newline separators are counted with the host tokenizer, additionally capped at a quarter of the host context limit. Provider per-message envelopes and the complete system/persona/response overhead remain the host's responsibility; this is not a cap on total billed tokens or a guarantee that oversized recent history fits. Labeling and native roles are not a comprehensive prompt-injection defense.

The pinned host scans `coreChat` for World Info after interceptors. Recalled excerpts can therefore participate in its ordinary history scan, unlike the previous system extension prompt with scanning disabled. World Info, other prompt rewriters, non-chat-completion providers and different host revisions are unverified. See the [speaker results](speaker-attribution-results.md) for the bounded OpenAI validation and remaining actor-attribution failure.

## Ownership and deletion

Production and synthetic test collections have `application=sillymemory` and the random owner metadata tag. Sync and deletion check these tags. Deletion never adopts a mismatched collection. Full deletion first disables further work, invalidates reads, drains writes, deletes the selected owned branch or all discovered owned story collections, and verifies API absence. Branch deletion preserves siblings; family deletion removes every branch. Tags are ownership safeguards against accidental selection, not an authorization boundary against another holder of the project API key.

After confirmed collection deletion, local cleanup snapshots all matching journal
keys before removing them. It preserves other namespaces and host settings;
[Web Storage enumeration order](https://html.spec.whatwg.org/multipage/webstorage.html)
may change during removal, so deleting while enumerating can skip entries.

The extension retains target identity before creation so timeout cleanup is retryable. Collection deletion is an API visibility check; physical backup erasure is not established. Native chat deletion does not delete remote memory. All-owned discovery can recover cleanup after browser registry loss; loss of the account owner ID requires manual project-side inspection. Cross-device concurrent editing is not supported.

## Progress and failure display

Sync/retrieval callbacks report only phase names and numeric counts, never chat
text, scope identities, or keys. Delete/upload counts advance after acknowledgement;
upload totals include current chunks already acknowledged during this session.
A lost response is not counted even if the service accepted it. Existing durable
intent drives reconciliation on retry/reload. No timeout, batch-size, query-policy,
or automatic retry changes accompany the UI.

Each sync captures the engine epoch and checks validity before queued work and
between mutation batches. Invalidation stops further work and progress callbacks;
already-started writes may still complete and their IDs remain recoverable. A
display revision additionally prevents a superseded manual sync from replacing
a newer operation's progress, success, or failure. This display ownership does
not invalidate an otherwise current generation prompt. A generation that starts retrieval takes over a
pending debounce timer because retrieval already synchronizes the source. Quiet
prompts cancel older retrieval ownership and clear the injection without
invalidating pending or in-flight sync. Retrieval captures its read-cancellation
signal before synchronization and checks it again after search and token counting;
late responses cannot restore a canceled injection. A tab
without the session lock retains its lock-conflict explanation across chat events.

Terminal states hide the progress bar. Failure retains the last confirmed stage
and count, with separate key/permission, rate-limit, network, and timeout guidance.
Timeout classification covers both fetching headers and consuming a response body.
No raw exception or upstream response body is used in the generic UI failure path.
The live status is not persisted; reload still disables memory and clears the key.
