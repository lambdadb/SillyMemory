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
and packing/assembly; the [latest retained validation](prompt-capacity-evaluation.md#retired-tool-preservation)
records 18 delivery cases plus packing/assembly.

The historical reports below instead used the built-in proxy, separate recalled
messages and four recent messages. Their counts and key-handling results describe
that producer, not the current archive contract. The [report](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/prompt-delivery-v1.json) binds runtime,
UI, runner and pinned host source hashes before/after execution.

The historical checks cover:

- All three selected passages and four recent messages present in the outgoing
  short prompt, with accurate panel counts.
- Zero completion requests after pressure stops in normal, streaming, swipe and
  regenerate modes, and when search returns no hits. Generation locks/UI recover;
  normal cancellation adds no phantom assistant response.
- An explicit warning-only choice sends the truncated prompt with a visible
  `0/3` memory and `2/4` recent warning.
- Increasing context after a stop and manually regenerating in the same chat
  completes, without duplicating the question or changing preceding text.
- Larger-context recovery, continuation-prefix uncertainty, no-hit short prompts,
  memory disabled, preference persistence, reload key clearing and owned cleanup.

The [22-check browser integration report](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/prompt-delivery-browser-v1.json)
also checks synchronization, edits/swipes,
deletion, chat-switch races, isolation, failure fallback and proxy/key boundaries.
Unit tests cover role/content mismatches, repeated messages, macros, dry runs,
stale checks and supersession. Historical experiments retain their original
runtime hashes and archived producer source; they are not relabeled as evidence
for the new runtime. Reproduce historical generation cohorts at their recorded
revision: older inspection-text parsers are not the new final-prompt contract.

```sh
npm ci
npm test
npm run check
npm run check:release
# Use an isolated pinned host linked to this extension checkout.
ST_SOURCE=/path/to/SillyTavern \
  node scripts/prompt-delivery-smoke.mjs artifacts/delivery-new.json
ST_SOURCE=/path/to/SillyTavern npm run test:browser
```

The runner uses port 18136 by default (`ST_DELIVERY_PORT` override). Keep a new
report filename per run; its plan file prevents accidental evidence overwrite.
This is host integration with emulated services. Managed-provider reliability,
semantic answer quality and public release validation are separate; this change
does not assert they have passed.

### Review correction

The [review regression](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/prompt-delivery-review-v1.json) holds an actual
normal generation at `GENERATE_AFTER_DATA`, attempts another generation and then
releases the old event. The overlapping generation emits no final event, neither
stale/rejected request reaches the completion endpoint, and a manual retry is
verified and completes. The full 11-scenario suite and same-chat recovery also
pass. The [22-check browser rerun](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/prompt-delivery-review-browser-v1.json)
retains latest-read-wins behavior during retrieval. That dispatcher-only suite
now emits a synthetic final event to complete its lifecycle; full host packing
and request assertions remain in the separate real-generation runner.
