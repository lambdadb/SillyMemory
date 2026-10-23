# Final prompt verification and overflow handling

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Historical reports require their recorded producer; commands below run the
> maintained runner against current code. See [evidence retention](evidence-retention.md)
> for archives and recovery.

## User-visible change

SillyMemory now checks the host's assembled Chat Completion prompt before a
generation request proceeds. It no longer describes prepared memory as confirmed
delivery. The panel reports how many memory archive blocks and protected recent
messages are verified. With selected memory, `1/1` means the complete quoted
archive passed verification; the prepared source-passage count is separate. The
inspection view separates included memory from missing/changed memory. This result
remains visible when background synchronization updates the separate operation-status
line.

**Stop on missing context** defaults to on, including for existing installations.
When verifiable content is missing or changed, SillyMemory calls the host's
`stopGeneration()` API before the completion request. It does not execute an
automatic retry, change the model context setting, summarize/delete source text
or silently relax delivery checks. Turn the option off to
continue with a visible warning. The choice is stored with non-secret settings.

If a generation stops, increase the model context limit within the provider's
supported range, reduce reserved output, then
generate again. The submitted question stays in the chat; it need not be sent a
second time. Regenerate can resume from that question. SillyTavern's normal
swipe/regenerate behavior still applies, including removal of a prior answer
when regenerating. The extension does not rewrite stored source chat.

This resolves silent loss, not semantic selection quality or the hard context
limit. The quarter cap and configured memory preference are unchanged. Managed
embeddings, ordinary upserts, `knn.queryText`, direct browser CORS and scoped saved
LambdaDB credentials remain the product path.

## Contract and limits

The adapter captures the prepared messages' expected roles and full text after
retrieval. Selected older excerpts form one user-role archive, beginning with
`[Recalled conversation excerpts]`, at the latest selected source index. Original
source roles, speakers, message/passage coordinates and available sent-time labels
remain embedded in the quoted text; they are not separate live conversation roles.
Protected recent messages keep their native roles and order. Expected content also
includes the active input and memory guidance even when no memory fits. It consumes
the non-dry-run `GENERATE_AFTER_DATA` event once for that generation, checks the
captured chat/scope revision, and compares against `data.prompt` for Chat
Completion. It uses the host's cancellation API because the host catches event
listener exceptions. No host method is patched and no prompt is repacked.

Matching requires the prepared carrier role and the entire expected text inside
a single prompt message, bounded by message edges or newlines. For memory, this
means the complete archive in one user message; losing one embedded excerpt or
changing the carrier role fails the check. Recent turns require their original
user/assistant roles. The known carrier speaker’s `name: ` prefix and
line-separated injections are allowed; arbitrary interior substrings (for example `OK` inside `BOOK A TRIP`) are not.
Each prompt message can satisfy at most one expected message, so one duplicate
cannot stand for two turns. CRLF is normalized. Text parts of multipart messages
can be checked; this does not verify media delivery.

`{{user}}`, `{{char}}`, `<USER>` and `<BOT>` are expanded using current names.
Arbitrary macros are not evaluated a second time: their turns are explicitly
unverified, as is the final continuation prefix. They do not trigger a false
missing-content stop. Empty/transformed messages and non-Chat-Completion formats
cannot provide full verification. A rewritten message can be reported as
missing or changed even if semantically equivalent; disable the stop option if
that transformation is intentional. Later listeners, provider-side transforms,
message-merging presets, other prompt-rewriting extensions and provider receipt
are not guaranteed by this boundary. This is not a token-usage estimator.

Dry runs leave a pending check intact. New retrievals supersede in-flight reads.
Once an interceptor finishes, it reserves the next final event: overlapping
interceptors are aborted before they can proceed to prompt packing. The pinned
host exposes no generation identity on the final event, so a FIFO queue cannot
reliably correlate reordered events. Invalidating a ready prompt cancels its check
but retains its reservation until that prompt's final event arrives; the stale
generation is then stopped. A subsequent generation can proceed normally.
If another extension aborts or throws during prompt preparation without emitting
a final event, reload to release the reservation. No timeout silently reassigns
an ambiguous late event. Chat changes and reload clear displayed evidence. Normal host
generation completion does not erase the last check result. No prompt evidence
or key is persisted by this feature.

## Verification and reproduction

The maintained `scripts/prompt-delivery-smoke.mjs` runner uses actual pinned
SillyTavern 1.19.0, Chromium, the manifest loader and normal generation, with local
LambdaDB/completion fixtures over the current direct-CORS path. It reads no
`.env.local` and calls no real embedding or generation provider. Current coverage
includes complete-archive delivery/loss, recent-five retention, stop/warn behavior
and packing/assembly. Its fixed synthetic ranks check source integrity and final
prompt delivery without importing an old quality corpus or simulating live search.

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
  node scripts/prompt-delivery-smoke.mjs artifacts/delivery-new.json
```

Use [development](development.md) for setup and the other current host checks.

## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/prompt-delivery.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
