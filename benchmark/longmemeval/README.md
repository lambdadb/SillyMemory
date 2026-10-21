# LongMemEval-S

**Recorded result: 475/500 correct (95.0%).**

Run ingestion, retrieval, memory selection, answer generation and judging from
the public dataset. The recorded score used saved retrieval responses; this runner
performs retrieval again and reports the new run's score separately.

[results.json](results.json) includes recorded token usage, available timings and
resource counts. Unavailable measurements and billed cost are `null`.

## Settings

| Component | Setting |
| --- | --- |
| Dataset | `xiaowu0162/longmemeval-cleaned`, LongMemEval-S, all 500 questions |
| Dataset revision | `98d7416c24c778c2fee6e6f3006e7a073259d48f` |
| Embedding | Managed OpenAI `text-embedding-3-small`, original chunk text |
| Retrieval | Role-labelled current question, Bayesian hybrid, k200, consistent reads |
| Reranking | `jev-1.13.0`, text field, candidate 200, final 50 |
| Chunking | 800 characters, source-bound sentence/paragraph partitions |
| Recent dialogue | At least five eligible messages including the question, aligned to a user/assistant pair; excluded from indexing |
| Memory | Rank-ordered admission, chronological source presentation, quoted user-context block, 4,096-token allocation |
| Generator | `gpt-6.1-sol`, reasoning `low`, max completion tokens 4,096 |
| Judge | `jev-1.13.0`, Noul Yes probability ≥0.50 |
| Scoring | Correct answers / evaluated questions, using the original task-specific rules |

[config.json](config.json) fixes the prompts and parameters. Admission counts
`packingGuidance`, source excerpts and six overhead tokens against 4,096, using
`tiktoken` 1.0.22 / `cl100k_base`. The final quoted archive plus generation guidance
is also checked against 4,096. Session clocks remain dataset provenance, without
assigning UTC or inferring event dates. References and answer annotations never
enter indexing, retrieval or generation; references enter judging only.

## Run

Use Python 3.14 and Node.js 24 on Linux or macOS. Run from the repository root
after `npm ci`. The Python runner uses only the standard library, so no additional
Python packages or `pip install` step are required. `setup` installs the locked
Node.js tokenizer into the run directory. Download size is approximately 277 MB.

The Python runner handles data preparation, generation, judging and result
verification. The Node.js adapter reuses SillyMemory source modules for chunking,
retrieval and memory assembly. No SillyTavern server or extension installation is
required.

```sh
python3.14 benchmark/longmemeval/run.py setup --root artifacts/longmemeval
python3.14 benchmark/longmemeval/run.py prepare --root artifacts/longmemeval

python3.14 benchmark/longmemeval/run.py recall --root artifacts/longmemeval \
  --env-file /path/to/evaluation.env
python3.14 benchmark/longmemeval/run.py score --root artifacts/longmemeval \
  --env-file /path/to/evaluation.env

python3.14 benchmark/longmemeval/run.py verify --root artifacts/longmemeval
```

`setup` downloads the pinned dataset with a 15-minute total download deadline,
verifies its byte count and SHA-256, and installs the locked tokenizer. `prepare`
freezes dataset, source, runner and tokenizer hashes before any paid call. For a
smoke run, add `--limit 1` to `prepare` in a separate output directory; this fixes
the first question in sorted ID order. Partial runs are marked `fullCohort: false`.

`recall` creates one isolated collection per question, uploads 50-document batches,
verifies stored source fields, retrieves and packs memory, and deletes its owned
collection with a verified absence check. `score` makes at most 500 generation and
500 judge calls. Each live phase has an eight-hour bound; recall allows at most
50,000 database operations with a cleanup reserve. Calls are not retried
automatically. Scoring reuses completed receipts and blocks ambiguous interrupted
requests to avoid duplicate spending. `score-clock.json` records the first model
attempt's start time; resumes share the same eight-hour deadline. Cached results
remain available for offline verification after the deadline.

Outputs include `lock.json`, `score-clock.json`, `memory/`, `recall/`, `answer/`,
`judge/`, `scores.json`
and `summary.json`. `verify` reconstructs every indexed source and delivered
request, matches retrieval to its original HTTP query receipt and checks cleanup
records, then compares all per-question scores and the aggregate without provider
calls.
The summary includes generation/judge token totals, indexed documents, database
operations and measured timings. Model timings run through response headers;
database HTTP timings include response-body reads. Billed cost remains `null`
because the runner does not receive provider invoices.

A `.running` directory prevents concurrent runs. Inspect a lock left by a
terminated process before removing it. If recall fails, inspect `memory/state.json`
and finish owned-resource cleanup before starting a new run directory:

```sh
python3.14 benchmark/longmemeval/run.py cleanup --root artifacts/longmemeval \
  --env-file /path/to/evaluation.env
```

If only the final collection deletion failed, successful cleanup restores the
completed run so `score` can proceed. An unfinished frozen question set remains
incomplete.

## Sources

- [Recorded aggregate](results.json).
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval), MIT license.
- [Pinned cleaned dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/tree/98d7416c24c778c2fee6e6f3006e7a073259d48f).
- [judge-rules.json](judge-rules.json) adapts the [pinned official evaluator](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py)
  to a Noul proposition, preserving the task-specific criteria. The upstream
  notice is retained in [LICENSE.upstream](LICENSE.upstream).
