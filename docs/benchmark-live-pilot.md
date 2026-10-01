# LongMemEval 32K live development pilot

This follows the [real-host preflight](benchmark-host-preflight.md) and the
[frozen pilot design](benchmarks/pilot-design-v1.json). It runs only the two
selected development questions in four modes: plain host, native Vector Storage,
automatic Summarize, and SillyMemory. The 42 held-out questions remain untouched.
This is a small pipeline/quality pilot, not a benchmark accuracy estimate.

## Results — 2026-10-01

All eight actual model answers passed the pinned official judge. This establishes
completion of this small pilot, **not superior recall or general accuracy**.
The positive question's marked evidence remains inside the plain 32K window.
SillyMemory delivered that same complete source message with much less final
input; the unknown question was correctly treated as unanswerable in all modes.

| Mode | `8ebdbe50` provider input tokens | `eeda8a6d_abs` provider input tokens | Official judge |
| --- | ---: | ---: | --- |
| Plain host | 31,608 | 31,494 | 2/2 |
| Native Vector Storage | 31,092 | 31,494 | 2/2 |
| Automatic Summarize | 31,337 | 31,360 | 2/2 |
| SillyMemory, managed embeddings | 2,896 | 4,126 | 2/2 |

SillyMemory reduced final input by **90.8% and 86.9%** versus plain mode on these
two questions. Its 7/7 and 8/8 prepared passages and 12/12 recent messages reached
the captured final host prompts, whose hashes matched the dispatched requests.
Its observed memory scopes contained 892 and 867 unique submitted document IDs at
answer observation. These are not a server-side storage census or a recall metric.

The second native row's outgoing payload exactly matched the plain row, so no
additional native memory was present in that request. Its provider tokens, answer
and request hash are direct observations. Coverage was recovered by identical
payload hash; its missing host counter and stored-source snapshot remain null.
See the recovery section below before treating all rows as equally instrumented.

| Work | Actual calls | Input / output tokens | Usage-price estimate (USD) |
| --- | ---: | --- | ---: |
| Final answers | 8 | 195,407 / 264 | 0.060000 |
| Automatic summaries | 97 (49 + 48) | 2,660,996 / 22,378 | 1.075090 |
| Official judges | 8 | 1,232 / 11 | 0.003190 |
| Native embeddings | 440, containing 3,565 inputs | 210,162 input | 0.004203 |

Returned OpenAI usage totals approximately **USD 1.1425**, versus a
conservative reservation of USD 1.6358 and a USD 3 ceiling. Actual cached tokens
were 61,952 for final answers and 83,712 for summaries. These estimates exclude
LambdaDB charges, taxes and any provider billing adjustments. LambdaDB managed
inference usage is not returned through this contract and is not replaced with
an invented exact charge.

There were **113 completion attempts and zero provider retries** across the
initial run and continuation. Native embedding requests dispatched to OpenAI and the LambdaDB
workload operations succeeded in this run. This does not establish long-term
availability or disprove the earlier intermittent embedding timeouts. The harness
interruption and blocked cleanup-time embedding attempt are preserved below.

All four created remote collections were verified inaccessible after owned
deletion across the two runs. Both native indexes were listed empty, and both
disposable host profiles/worktrees were removed. This does not claim immediate
physical erasure from provider backups.

Review the [combined execution report](benchmarks/live-pilot-v1.json),
[validated usage summary](benchmarks/live-pilot-summary-v1.json), and
[unchanged interrupted report](benchmarks/live-pilot-interrupted-v1.json).
Local validation passed 255 tests plus runtime/tool syntax and release checks;
these checks are separate from the actual provider execution above.

## Frozen execution conditions

- SillyTavern `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, real Chromium,
  32,768 context, generator `gpt-4.1-mini-2025-04-14`, temperature 0,
  1,024 maximum output tokens. Host prompts are captured before dispatch and
  compared with the actual completion bridge request.
- Native Vector Storage uses its real server backend and OpenAI
  `text-embedding-3-small` through a loopback OpenAI-compatible bridge. The pinned
  backend splits requests into at most 10 embedding inputs. UI settings and
  index-ready preparation match the frozen preflight. This is a paid remote
  embedding comparison, not a local hardware benchmark.
- Summarize uses its default Classic prompt, 200-word target, interval 10,
  Main API and real message-render events. No forced catch-up or summary calls.
  Freeze only after replay, for the isolated answer, as in preflight.
- SillyMemory uses the unchanged UI extension, built-in CORS proxy, ordinary
  upsert batches of at most 50 and LambdaDB managed embeddings with `queryText`.
  Its 15-second client timeout remains unchanged. No direct-embedding fallback.
- Keys are read from the existing environment file; the OpenAI key stays in the
  Node bridge, and the LambdaDB key stays in the disposable browser session.
  Reports contain no keys or LambdaDB connection values. Raw source histories
  and full outgoing prompts are not stored. Public benchmark questions, generated
  answers/summaries and hashes are recorded; generated text can restate source facts.
- The official LongMemEval scorer function is extracted from the SHA-256-verified
  `evaluate_qa.py` at revision
  [`9e0b455`](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py).
  Its exact prompt and `gpt-4o-2024-08-06`, temperature 0, 10-token settings are
  retained. Gold answers are supplied only to the judge after generation.
  The official `yes` substring scoring is retained; exact yes/no formatting is
  separately recorded. Judge agreement is not independent human accuracy proof.

## Bounds fixed before live calls

`benchmark-live-budget.mjs` rejects a request before dispatch if it exceeds any
limit. Each failed or retried attempt still consumes its full reservation.

| Resource | Limit |
| --- | ---: |
| Logical answers / judges / automatic summaries | 8 / 8 / 101 |
| Completion attempts including retries | 125 |
| Extra retries, only HTTP 500/502/503/504 | 8 total, 2 per request |
| Minimum completion attempt start spacing | 15 seconds |
| OpenAI reservation ceiling | USD 3 |
| Native embedding calls / inputs / reserved input tokens | 1,000 / 4,000 / 1,000,000 |
| LambdaDB non-cleanup requests / created collections | 300 / 4 |
| Managed document write attempts / input token estimate | 3,000 / 1,000,000 |
| LambdaDB POST body bytes | 20,000,000 |
| Run duration before accepting further work | 90 minutes |

Cleanup GET/DELETE requests are allowed after the workload cap and only for
recorded owned collections; ownership must match before deletion. Native indexes
are explicitly purged and listed empty. The disposable host/profile is removed.
Creation intent is checkpointed before forwarding the create request, so an
ambiguous failure retains a cleanup identity. Reports are never overwritten by a
new run. There is no automatic full-run restart. The one-time recovery described
below accepts only the preserved interrupted report, verified by hash.

Prices checked on 2026-10-01:
[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
USD 0.40/M input and 1.60/M output;
[GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o)
USD 2.50/M input and 10/M output;
[text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)
USD 0.02/M input. Reservations assume no cached discounts or free quota.
Generator attempts reserve 32,768 input + 1,024 output; judges reserve 4,096 input
+ 10 output. Native embeddings use `cl100k_base` plus per-input margin.

[LambdaDB pricing](https://lambdadb.ai/pricing) lists USD 1.05/M LIU and 0.02 LIU
per `text-embedding-3-small` input token, plus USD 1/GB written. At the client
bounds, these two components estimate USD 0.021 + 0.020. This is **not a server
billing ceiling**: internal inference retries, indexing overhead, storage and
retention are not visible to the harness. No account free quota is assumed.
The report distinguishes reserved costs, returned OpenAI usage, and unobservable
managed-provider usage.

## Run

Use the verified dataset/scorer cache from the audit, an existing installation of
the pinned host including its dependencies, Node 20.12+ and Python 3. Then:

```sh
npm ci
ST_SOURCE=/tmp/sillymemory-st-source node scripts/benchmark-live-pilot.mjs \
  /absolute/path/to/benchmark-audit-cache \
  artifacts/benchmark-live-pilot/run-1.json \
  /absolute/path/to/existing/.env.local
```

This command makes paid calls. `LLM_BASE_URL` must be OpenAI's standard `/v1`
endpoint and `LLM_MODEL` must match the pinned generator. Required keys are
`LLM_API_KEY`, `LAMBDADB_BASE_URL`, `LAMBDADB_PROJECT_NAME` and
`LAMBDADB_PROJECT_API_KEY`. Do not copy the credential file into a worktree.

Live results are recorded above. Local budget tests alone are not integration
evidence. Run `node scripts/benchmark-live-results.mjs <report.json> [new-summary.json]`
to recheck source hashes and derive usage totals. The result validator rejects
incomplete matrices, ambiguous judges,
missing/zero SillyMemory delivery, changed answers, unverified cleanup, call-limit
violations and mismatched usage reservations. Native Vector Storage may legitimately
inject nothing. The recorded recovery exception requires identical outgoing
payload hashes and leaves the missing native host observations null. It does not
establish semantic retrieval recall from hashes or verbatim-message counts.

Durations include index preparation, replay and the test bridge's 15-second
completion spacing. They are not estimates of continuous-user interaction latency.
Generation usage, automatic summary usage and native embedding usage are separate.
Modes run once in the frozen order off → vectors → summary → sillymemory.
Provider caches are not reset between modes; reported cached tokens and calculated
usage costs describe this run, not an expected user bill or a latency ranking.

LongMemEval is by Di Wu and collaborators. The pinned dataset card declares MIT;
the official scorer repository carries the [MIT copyright and permission notice](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/LICENSE).
Dataset/scorer caches remain local. Reports retain only the two public development
questions and generated outputs, with source revisions and hashes. ConvoMem is
outside this run.

## One-time recovery of the native empty-injection assertion

The first execution completed six model answers but stopped before recording the
sixth host-observation row: the harness incorrectly required nonempty native
memory injection. Its sixth outgoing message payload has exactly the same SHA-256
as the separately captured plain-mode payload for the same question. The
successful model answer and usage were already checkpointed. The failure report
and original producer snapshots are retained; no successful answer is regenerated.

Recovery copies the plain row's outgoing-message coverage only because those
payload hashes match. The native host token counter and persisted-source snapshot
were not retained, so they remain null, rather than being presented as observed.
This row does not establish why native retrieval inserted no memory (threshold,
protected-message filtering, or another selection condition). Its answer receives
the missing official judge call. All remaining summaries/answers run normally.

The continuation inherits all completion, embedding, document, byte and monetary
reservations. The sole increased limit is collection creations: from two to four
across two disposable profiles, to rerun the synthetic transport gate and recreate
the owned collection after verified cleanup. No native reindexing or embedding
repeat is scheduled. The completion attempt ceiling remains 125 and USD 3.

The interrupted cleanup also encountered a delayed native post-answer insert;
its embedding call was blocked before dispatch because cleanup had begun. Both
indexes were listed empty and the disposable profile was removed. The updated
harness disables native indexing and drains outstanding requests before purging.
The continuation does not rerun a native generation, so that new drain path is
not itself live evidence for a subsequent native-generation cleanup race.

```sh
node scripts/benchmark-live-pilot.mjs /absolute/path/to/benchmark-audit-cache \
  artifacts/benchmark-live-pilot/run-2.json /absolute/path/to/existing/.env.local \
  docs/benchmarks/live-pilot-interrupted-v1.json
```

## Interpreting token counts

On the pinned host, Classic Main API summarization calls `generateQuietPrompt`;
it uses normal host prompt construction rather than the separate raw incremental
summary builder. `setMemoryContext` installs the resulting summary as an extension
prompt and stores its cursor in message metadata. It does not replace all old
messages in the final generation history. Source: the inspected
[pinned memory extension](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions/memory/index.js#L679).
Consequently, a long conversation may continue filling the context window while
also carrying a summary. Compare final provider input tokens separately from the
input/output tokens consumed by all automatic summary updates.

The positive pilot question's dataset-marked answer message is source position
404, which the plain 32K prompt still contains. This is a post-generation
interpretation, not a selection or retrieval input. This pair cannot establish
SillyMemory's superiority on forgotten old facts: one answer remains in the plain
window, and the other question is unanswerable. Keep this result even if all four
modes answer correctly; use the separately frozen development strata to design
the next discriminating quality evaluation without retuning on held-out answers.
