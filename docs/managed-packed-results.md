# Managed recall after repeated passage packing

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

This follow-up runs the merged PR #30 product path through the actual pinned
SillyTavern host, LambdaDB managed embeddings and the live generation provider.
The earlier packing replay established source retention at a fixed budget; this
run checks whether complete source delivery also produces correct answers under
the existing semantic rubric.

## Fixed method

- SillyTavern 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.
- The existing 16 English/Korean, 60-message synthetic cases, with memory off/on
  twice: 64 scheduled answers. Source text, questions, rubrics and pair order are
  unchanged from the semantic long-dialogue protocol.
- `gpt-4.1-mini-2025-04-14`, temperature 0, output limit 256, context 1,536,
  eight recent messages, configured memory 400 and observed effective cap 320.
- Ordinary upsert batches, managed embeddings and `knn.queryText` through the
  built-in proxy. No direct embedding adapter, vector injection or search replay.
- The loopback test bridge forwards the host-generated completion request and
  keeps the model key out of the browser. It applies the existing bounded retry
  policy only to HTTP 500/502/503/504, never to a successful low-quality answer.
  Provider starts are spaced by at least 15 seconds.

The evidence verifier now accepts both full ordinary labels and full grouped
labels, requiring every selected source coordinate and native role. A repeated
body without the complete provenance label does not count. Mutation tests reject
a removed coordinate, `13:1` substituted for `3:1`, a role change and missing
attribution. Exact archived producer bytes preserve the historical reports.

## Completion record

The [complete managed report](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/managed-packed-baseline-v1.json) passed
all 837 integrity checks: 64/64 scheduled provider answers, zero generation
retries, zero failed LambdaDB requests, intact recent history and source chats,
and verified deletion of both owned test collections. Provider starts were at
least 15,000.058 ms apart. The runtime matches merged PR #30; the candidate
changes its version metadata but does not add a new memory policy.

| Evidence | Memory off | Memory on |
| --- | ---: | ---: |
| Samples | 32 | 32 |
| Known-answer samples with all required evidence in the prompt | 0/28 | 28/28 |
| Provisional strict answer passes, including unknowns | 4/32 | 30/32 |
| Unknown-price questions handled without inventing a price | 4/4 | 4/4 |

The [separate answer score](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/managed-packed-baseline-review-v1/assistant-score.json)
records every grade and paired outcome. The
[unfilled review packet](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/managed-packed-baseline-review-v1/packet.json)
and [assistant annotations](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/managed-packed-baseline-review-v1/assistant-annotations.json)
remain separate. The coding assistant inspected all source rules and 64 answers;
this is neither independent nor blinded grading.

Both Korean quotation samples received the signer, quote and quotation-status
passage in 266 memory tokens, but their answers omitted Haesol. This is a model
interpretation failure after successful selection and delivery, not an ANN miss
or a missing-signature token-budget failure. No inference is made about the cause
of the older managed embedding timeouts; this run simply did not reproduce them.

## Rejected guidance pilots

Three general recall-instruction variants were tested on the same Korean
quotation case, off/on twice each. They contained no case names or answer facts.
The instruction was added as a host system injection only if it fit inside the
existing memory budget without displacing any selected source. The actual
memory-on totals were 305, 308 and 314 tokens respectively.

All [12 pilot responses and instruction texts](results/recall-guide-pilots-v1.json)
are retained with producer hashes, provisional grades and cleanup status.
The complete raw reports and frozen plans are retained for
[pilot 1](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/recall-guide-pilot-v1-raw.json),
[pilot 2](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/recall-guide-pilot-v2-raw.json), and
[pilot 3](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/recall-guide-pilot-v3-raw.json).
Every recorded producer hash resolves to current or archived exact bytes.
The offline verifier checks the focused schedule, source passages against captured
prompts, provider answers, request settings, spacing, and deletion followed by
HTTP 404 for both owned collections before comparing the derived fields with
the pilot summary. It rejects missing evidence even when summary booleans remain
true. Token totals remain recorded host measurements; semantic grades remain
provisional annotations. These checks do not turn rejected pilots into full-cohort
quality passes.
The first variant passed one of two on-mode answers; the second continued to
hedge the supplied identity; the third said it could not identify the promiser.
Each pilot completed transport and cleanup, but none reliably met the unchanged
answer rubric. These familiar-case pilots do not establish generalization.

The guide, its host injection and delivery changes were removed from the product.
No targeted fact rule, larger budget, changed rubric or successful-answer retry
was used to turn the failed cases into passes.

## Candidate decision

Prepare 0.2.0 as an **experimental candidate** with the validated PR #30 runtime,
updated installation/rollback checks and explicit known limitations. The strict
semantic quality gate remains unmet (30/32). This is not approval to publish or
a claim that the requested attribution problem has been completely solved.
Main promotion and pre-release publication require review of that remaining issue.

## Git installation, update and rollback

The [actual-host installation report](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/install-0.2.0-v1.json) passes
20 checks. The pinned host installed public `main` 0.1.0 at
`b55b78f28feb769683da723206bf3b37c83ec04b`, then its real Update UI pulled the
candidate branch at `b63cdeeae8ed8bc2180ce52a75117986239cee98` (0.2.0).
It retained ownership and every existing nonsecret setting, added only the
new `stopOnLoss: true` default, cleared the key and started memory disabled.
An explicit warning-only preference survived reload. The manager displayed
0.2.0, rollback to published tag `v0.1.0` preserved ownership/budget, and returning
to the candidate restored 0.2.0. There were zero proxy requests or uncaught page
errors, and the temporary profile was removed.

The initial local attempt compared serialized settings byte-for-byte and rejected
the legitimate new default; the check now requires all existing values unchanged
and exactly the documented addition. A second attempt reached rollback but
recorded two unclassified JSON-response page errors. The installation profile now
uses disconnected OpenAI instead of the host's automatic default Horde polling;
the completed attempt has no page errors. This is test isolation, not a product
network-error fix. Earlier failed attempts remain in ignored local artifacts.

The candidate's product JavaScript is identical to PR #30. Subsequent report and
test-harness commits do not change the runtime or manifest exercised by this
installation run. The full managed run preceded the version bump; its runtime
hashes match the candidate's product modules.

## Interpretation

Answer annotations by the coding assistant are provisional, not independent
human review. The cases use correlated synthetic padding and are familiar
regression cases, not a new held-out corpus. The previous completed cohort used
a temporary direct embedding adapter; a difference from that older answer score
does not isolate the causal effect of packing. PR #30's fixed-rank replay supplies
the narrower evidence for packing's source-selection benefit.

This follow-up does not establish broad actor-attribution reliability, cross-host
compatibility, production availability or stable-release readiness. Prior
reported-actor failures in other corpora remain separate evidence.

## Reproduce

Install this checkout into a separate pinned host as the extension symlink.
Keep the credentials file outside this worktree. These commands incur LambdaDB
managed embedding and generation usage with synthetic data only.

```sh
export ST_SOURCE=/absolute/path/to/pinned/SillyTavern
export SM_ENV_FILE=/absolute/path/to/.env.local
mkdir -p artifacts
node scripts/semantic-long.mjs artifacts/managed-packed-new-plan.json
SM_MODEL=gpt-4.1-mini-2025-04-14 \
SM_ARTIFACT_TAG=managed-packed-new \
SM_NATURAL_PLAN=artifacts/managed-packed-new-plan.json \
node scripts/generation-smoke.mjs --semantic --retry-transient
node scripts/semantic-results.mjs \
  artifacts/generation-semantic-managed-packed-new.json \
  artifacts/managed-packed-new-review
```

Use new plan/tag/review paths for each attempt; the harness refuses to overwrite
an existing report. Final success requires a complete cohort, unchanged source
hashes, intact recent history, verified provenance, normal provider completion,
keys absent from persisted settings and confirmed owned remote cleanup. Review
annotations remain separate from these transport/integrity checks.

For a focused diagnostic, append existing case IDs when creating the plan (for
example, `node scripts/semantic-long.mjs artifacts/target-plan.json long-ko-quotation`).
The source, question, settings and pair order stay fixed. A focused report cannot
pass the full 64-answer summarizer and must not be presented as a complete cohort.
