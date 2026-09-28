# Natural dialogue transport amendment v1

Frozen before the replacement run on 2026-09-28, after the maintainer explicitly
authorized bounded retries for provider server errors. This amendment changes
only the transport rule of the [original protocol](natural-dialogue-evaluation.md).
The original 22-attempt failed run stays intact and cannot be pooled with this run.
The corpus, 64-sample order, oracle, generation settings, retrieval runtime and
human scoring rules remain unchanged. This is not a new blind held-out corpus.

Run the entire schedule with a new artifact tag and `--retry-transient`.
`natural-transport-retry-v1` permits up to **2 retries per sample**, **8 retries
for the whole run**, and **72 total provider attempts** for 64 scheduled answers.
There is no sample substitution or retry of a successful but incorrect answer.

Only explicit HTTP **500, 502, 503 and 504** before any successful response body
are eligible. Network errors, timeouts, cancellation, 4xx (including 429),
malformed successful responses, truncated outputs, streaming-body failures and
semantic mistakes stop the run without automatic retry. This amendment is for
the fixed non-streaming natural evaluation, not a general API reliability layer.

Wait 15 seconds then 30 seconds, each with up to 999 ms jitter. A valid
`Retry-After` in seconds or HTTP-date sets a minimum delay. If the required wait
exceeds 60 seconds or the sample's 180-second transport deadline, return the
failure. Each attempt times out after at most 90 seconds, bounded by the remaining
sample deadline. Cancellation stops waits and outstanding fetches.

Retries happen in the **test-only loopback bridge**, after SillyTavern has built
the prompt and SillyMemory has injected memory. The exact serialized request body
is reused and hashed on every attempt; the host generates and saves only one
successful answer. The shipped extension gains no generation-retry behavior and
normal SillyTavern users do not receive this test bridge.

Record every attempt's status, request ID when available, body hash, elapsed time
and retry wait. Checkpoint failed attempts before waiting. Keep first-attempt
failure rate, extra attempts and recovery counts separate from answer quality.
Generation timing includes retry waits. Successful-response token usage excludes
any unreported usage on failed attempts; failed-attempt and managed-embedding
charges remain unknown. Cleanup, secret audit and all integrity checks still
must succeed before a report can be aggregated.

The report pins this policy and byte hashes of this amendment and its retry code
before any model request; it checks source identities again at shutdown. The
original plan still pins the unchanged fixture, exporter, runtime and original
protocol. A successful retry-enabled evaluation establishes bounded recall under
this test transport, not the unmodified host's first-attempt reliability.
