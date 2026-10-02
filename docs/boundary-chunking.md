# Boundary-aware indexing

## Frozen product question and acceptance

Can deterministic paragraph/sentence boundaries avoid cutting English facts in
half while preserving exact source text, isolation and the current token budget?
This change indexes new chunks; it does not shorten already retrieved passages.

Keep the 800-code-point ceiling, 800-token injection budget, recent window,
managed embedding model and vector query policy fixed. Prefer the last paragraph,
then sentence, then whitespace boundary in the second half of a full chunk. If
none fits, split at the code-point ceiling. Short messages remain whole. Store
exact UTF-16 source offsets and include boundaries/policy in document IDs so that
reconciliation deletes old layout IDs before searching. No overlap is introduced:
partial-overlap deduplication and neighbor expansion are separate variables.
The indexing cap is still characters, not an embedding-token or linguistic
correctness guarantee. Host-tokenizer accounting still governs injection.

Complete unit/source-provenance checks, actual-host fixture regressions, and a
bounded synthetic live comparison before deciding adoption. Compare the former
fixed splitter and this single frozen candidate using fresh managed embeddings
and real answers for six English cases (12 answers, the existing bounded retry policy
(up to two transient retries per call/eight per run, at most 20 generation requests)). Hold 32K model context, recent 4,
memory budget 800 and the same source/query fixed. Include boundary-crossing
facts, a correction, short-message control and a long unpunctuated control.
Freeze the inputs/rubrics before requests. Use a disposable profile/owned
collections, and confirm cleanup. Source coverage and final answer correctness
are distinct. Stop after this comparison; do not tune on observed misses or
claim a general benchmark win. No new broad or held-out evaluation is included.

Adopt only with exact source reconstruction, bounded chunks, no deleted/stale
source injection, verified reindexing and no final-answer regressions in the
bounded comparison. A negative or externally blocked result must remain visible;
do not relabel a smoke check as proof of retrieval quality.

## Completed comparison — 2026-10-02

**Decision: adopt `boundary-v1` for source-preserving indexing.** No answer-quality
improvement was established. The four deliberately boundary-crossing sentences
now remain whole without adding documents, and the bounded controls showed no
answer regression. This is a mechanical improvement with narrow live evidence,
not a general recall benchmark win or proof that the heuristic is optimal.

| Observation | Fixed 800-character baseline | Boundary-aware candidate |
| --- | ---: | ---: |
| Exact expected answers | 6/6 | 6/6 |
| Whole required fact in one indexed chunk | 1/6 | 5/6 |
| Whole required fact in one selected passage | 1/6 | 5/6 |
| Median injected memory tokens | 659.5 | 648.5 |
| Median provider input tokens | 829.5 | 820.5 |

The baseline already assembled enough split evidence to answer every question.
Whole-fact preservation must not be mislabeled as four additional correct
answers. The short-message control was identical (490 input tokens in both
arms). The unpunctuated control still split its fact and used 16 more input
tokens under the candidate (841 vs 825), while both answered correctly. Aggregate
token differences are small and do not establish a general cost advantage.
Each arm indexed 11 documents per long case and 9 for the short control at the
observed generation boundary. The source corpus fits 32K: this isolates chunk
boundaries and does not measure overflow performance on long conversations.

The completed run used real SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, LambdaDB managed embeddings and
`gpt-4.1-mini-2025-04-14`, temperature 0, output limit 256, through the actual
SillyTavern generation path. Twelve requests completed without retries; actual
provider starts were at least 15 seconds apart. There were no observed LambdaDB
request failures, and all owned test collections were deleted and confirmed
absent. Expected answers/rubrics stayed in the test process; the browser received
only source history, query and policy selection. Complete outgoing requests,
provider answers, usage and retrieval traces are retained in the archive.

The test adapter switches between the frozen parent engine at
`20f818b106af2c8fcf5a13a7a5db865f77cdbe4d` and the candidate in one owned chat
collection, reconciling IDs before each query. The runtime ships only the new
splitter. No second production implementation or direct embedding adapter is
introduced. This six-case, one-response-per-arm synthetic set is intentionally
boundary-focused; independent natural-history/held-out quality, cross-message
neighbors, overlap and multilingual optimization remain unverified.

### Verification and reporting failure

- 323 unit regressions passed, including exact Unicode source reconstruction,
  bounded spans, source coordinates, old-layout ID exclusion, reindex deletion
  order, reload reconciliation and unchanged-sync deduplication.
- Actual pinned host/Chromium/proxy with local LambdaDB fixture: 28 checks passed,
  including edits, swipes, deletion, branch/copy isolation and request races.
- Actual host prompt dispatch with local completion/LambdaDB fixtures: 11 cases
  plus repeated-passage packing passed. No page errors or remaining collections.
- Runtime/development syntax, release metadata and whitespace checks passed.
- Final live input/settings/source hashes were frozen before traffic and verified
  at completion. The new splitter was not tuned after observing answers.

An earlier run generated 12 successful responses and confirmed owned cleanup,
but a harness `ReferenceError` during final serialization prevented retaining its
full report. It is **not** used as the accepted quantitative record. Its console
log is retained; its exact provider retry count is unavailable. The reporting
code was fixed to define the frozen producer map and checkpoint each case before
one complete rerun. Thus at least 24 successful responses were generated across
the two attempts; the accepted run contains 12 calls with zero retries. This was
a harness failure, not evidence of an embedding or generation-provider outage.

## Reproduce and review

```sh
ST_SOURCE=/path/to/pinned/SillyTavern \
SM_ENV_FILE=/path/outside/repo/.env.local \
SM_ARTIFACT_TAG=unique-run-name \
node scripts/generation-smoke.mjs --chunking
```

Install this checkout as the host's extension symlink. The maintained command
uses the existing generation runner, six small fixtures and bounded transport
retry policy (20 calls maximum per run). It incurs actual LambdaDB/OpenAI usage.
Do not repeat the accepted run merely to change documentation. Use a new artifact
tag, and resolve any `generation-*-pending.json` record before another run.

The local-only ignored archive
`artifacts/archive/boundary-chunking-v1/evidence.tar.gz` contains 47 files,
365,521 bytes; SHA-256
`3d8e3939c26deb8768a8742af3efab1aaa1f577569c0cf58aa6f67a96b235020`.
It includes the pre-result protocol, fixture, producing source files, settings
plan, full accepted run, browser/delivery reports and initial failure log. Entries
were byte-verified after creation. The source overlay applies to parent revision
`20f818b106af2c8fcf5a13a7a5db865f77cdbe4d`. It is available in the author's
`sillymemory-boundary-chunking` worktree, not downloadable from a fresh clone.
Results added to this document afterward do not change the frozen protocol in
that archive. The accepted report is
`artifacts/generation-chunking-boundary-v1-complete.json`.

After updating the extension, reconnect and enable memory normally. The first
sync reindexes each activated chat and deletes journal-tracked old IDs. If the
browser journal was lost, use owned collection deletion/recreation for complete
remote cleanup; current-source/ID validation still prevents old-layout injection.
