# Reranking rescue protocol

Freeze this protocol, current producer and confirmation inputs before traffic.
Question: can default Jev recover evidence excluded from the 800-token memory,
and can hybrid + Jev recover evidence absent from vector candidates, without losing
current correct answers? This extends the open reranking PR, not production behavior.

Use the unchanged eight `hybrid-v1` cases as labeled diagnostic/regression data.
They are already observed failures, not held-out evidence. Use the six new cases
in `rerank-confirmation-v1.json` only after the diagnostic answer gate succeeds.
Those six use similar authored templates; unseen answers do not make them an
independent real-world benchmark. Do not modify cases after observing the run.

1. On the actual pinned host, probe the current MemoryEngine with the question
   appended to its captured snapshot, using real managed-embedding SDK queries and
   the host token counter, without calling the generation model. Compare vector
   against vector + default Jev on all eight diagnostic cases. Verify exact source,
   identities, budget and rerank status. These are retrieval/selection probes,
   not completed host generations.
2. Only if the vector pool lacks a required fact, probe hybrid and hybrid + Jev
   for that case. If the combination delivers a previously absent fact, complete
   both hybrid arms on the remaining diagnostic cases to check regressions before
   considering a global policy. Keep literal lexical-query construction unchanged.
3. Choose among `rerank` and `hybrid-rerank` using evidence delivery only. Require
   at least one rescued baseline omission, no loss of baseline-delivered evidence,
   and every rerank response applied. Prefer greater complete-evidence coverage;
   ties prefer vector + Jev. Record all arms, including negative outcomes. If no
   policy qualifies, stop without paid answer generation or custom-criteria tuning.
4. For a qualifying policy, compare actual SillyTavern generations for all eight
   diagnostic cases: vector versus that policy, alternating order. Replay each
   probe's exact candidate lists, bound to query text/branch/owner/scope and source,
   to prevent new retrieval variation from changing the tested evidence. Verify
   selected documents match the probe and are present in the final provider request.
   This is real generation with live-derived fixed candidates, not new live searches.
5. If answer gains exist and no baseline answer is lost, run the six pre-frozen
   confirmation cases with the same policy and vector baseline. Probe both arms
   once, then replay their lists through actual host generation. No retry for a
   successful wrong answer. If this gate fails, record the stop and preserve the
   remaining cases as unexecuted; do not manufacture an easier confirmation set.

Current runtime, query construction/interleaving, chunking and rendering stay fixed.
All arms: explicit chat branch, owner/scope filters, consistentRead=true, k=30,
size=30, recent=4, memory budget=800, host context=32768. Reranking uses fields=[text],
candidateSize=30, default criteria, returnOriginal. Hybrid uses the existing RRF
query; candidate equality is checked separately per query and pair. Never ascribe
changed candidate membership solely to reordering. Exact-score ties can matter.

Use SillyTavern 1.19.0 at 06bde939fb1e9c4c8d8641d810f0a916b5bce127 and OpenAI
`gpt-4.1-mini-2025-04-14`, temperature=0, maximum output=256. Maximum 28 successful
answers, 36 provider attempts, two transient retries per sample/eight total,
15-second provider-start spacing. Maximum three collections, 2,500 submitted
documents and 200 live retrieval calls. No new embedding provider key, schema,
event-time extraction, candidate-depth/budget sweep or custom criteria in this run.

Scoring: preserve exact-match scores but also extract the distinctive uppercase
hyphenated answer identifier. Require exactly the expected identifier and no other
identifier or explicit negation; UNKNOWN requires an otherwise empty UNKNOWN reply.
This accepts harmless sentence wrappers without treating conflicting identifiers
as correct. Review complete answers for unsupported claims and report disagreements;
identifier matching is not a general semantic evaluator or automatic adoption rule.
No expected answer enters retrieval, reranking criteria or provider instructions.

Report stage gates, per-arm candidate/selected evidence, final answers and supported
interpretation. Missing candidates, budget-excluded facts, and errors with complete
evidence are different failures. Preserve failed attempts and confirmed owned-data
cleanup with exact source/settings hashes. If confirmation succeeds, review scope
and limitations before a separate product adoption decision; this experiment does
not change the UI or default retrieval. Stop at the declared gates or bounds.
