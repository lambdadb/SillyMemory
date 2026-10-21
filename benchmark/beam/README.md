# BEAM

Run SillyMemory with the pinned Past public evaluation protocol.

| Split | Conversations | Questions | Recorded score /100 |
| --- | ---: | ---: | ---: |
| 100K | 20 | 400 | 89.00 |
| 500K | 35 | 700 | 85.99 |
| 1M | 35 | 700 | 86.62 |
| 10M | 10 | 200 | 80.64 |

Scores are question-weighted partial-credit means, including normalized event
ordering. The cohorts contain different histories and questions.

[results.json](results.json) includes recorded token usage, available timings and
resource counts. Unavailable measurements are `null`; modeled costs are labelled
separately from billed cost.

## Settings

| Component | Setting |
| --- | --- |
| Dataset | `Mohammadta/BEAM` (100K–1M), `Mohammadta/BEAM-10M` (10M); revisions, shard sizes and hashes in `config.json` |
| Protocol | Past commit `1faac1e70fa50d92d966904358be98bb1beca0c8` |
| Embedding | Managed OpenAI `text-embedding-3-small`, original source text |
| Chunking | 800 characters |
| Retrieval | Literal question, Bayesian hybrid, k200, source as-of filter |
| Reranking | `jev-1.13.0`, candidate 200, final 100; role, batch-date context, text |
| Evidence budget | 8,000 estimated source-only tokens; JSON metadata excluded |
| Generator and judge | `gpt-5.6-luna`, reasoning `none`, direct OpenAI Chat Completions |
| Prompt/scoring | Pinned Past answer, rubric and event-ordering routines |

The upstream protocol supplies evaluation annotations to answer generation.
Annotations do not enter ingestion or retrieval. Session dates are batch
references. No recent-dialogue window or extra product system prompt is added.
The evidence estimate sums `ceil((content code points + source-excerpt code
points) / 4)` per result. Full serialized context tokens are recorded separately.

## Run

Use Python 3.14, Node.js 24 and Git on Linux or macOS. The Python protocol requires
`pyarrow` for Parquet input, `scipy` for event-order scoring and `httpx` for model
requests.
[requirements.txt](requirements.txt) pins these packages and their transitive
dependencies. `setup` installs the locked Node.js tokenizer into the run directory.

Run from the repository root after `npm ci`:

```sh
python3.14 -m venv artifacts/beam-venv
artifacts/beam-venv/bin/python -m pip install -r benchmark/beam/requirements.txt

artifacts/beam-venv/bin/python benchmark/beam/run.py setup \
  --split 100k --root artifacts/beam-100k
artifacts/beam-venv/bin/python benchmark/beam/run.py prepare \
  --split 100k --root artifacts/beam-100k

artifacts/beam-venv/bin/python benchmark/beam/run.py recall \
  --split 100k --root artifacts/beam-100k --env-file /path/to/evaluation.env
artifacts/beam-venv/bin/python benchmark/beam/run.py score \
  --split 100k --root artifacts/beam-100k --env-file /path/to/evaluation.env

artifacts/beam-venv/bin/python benchmark/beam/run.py verify \
  --split 100k --root artifacts/beam-100k
```

Repeat with `--split 500k`, `1m` or `10m`, using a separate output directory for
each. `setup` fetches pinned upstream code and data and installs the locked
JavaScript tokenizer. Downloads enforce each pinned byte count and a 15-minute
total deadline per shard, including response-body reads; failed downloads leave
no partial dataset file. The deadline uses POSIX signals. `prepare` checks every
shard before parsing and freezes the settings, source hashes and full cohort.

`recall` indexes each conversation, retrieves and packs evidence, then deletes
its owned test collection with a verified absence check. `score` generates one
answer per question and applies the upstream judges. Each live phase has an
eight-hour bound. The model phase allows up to 10,000 attempts within a $25
reservation at the runner's fixed accounting rates; this is not a total-service
price estimate. Database operation limits are 10,000 /20,000 /20,000 /50,000 for
100K /500K /1M /10M. Inspect `memory/memory-state.json` if recall stops before
cleanup completes. Retry owned-data cleanup with:

```sh
artifacts/beam-venv/bin/python benchmark/beam/run.py cleanup \
  --split 100k --root artifacts/beam-100k --env-file /path/to/evaluation.env
```

Cleanup uses the saved connection, split and cumulative request count; it verifies
ownership and absence without loading the dataset, tokenizer or upstream code.
Cleanup restores `completed` only when every conversation in the frozen cohort
was retrieved and all owned collections are confirmed absent. Partial cohorts
remain `cleaned` and cannot be scored. If the final deletion was the only failure,
rebuild the packed recall offline and then run `score`:

```sh
artifacts/beam-venv/bin/python benchmark/beam/run.py repack \
  --split 100k --root artifacts/beam-100k
```

`repack` uses the pinned source input, tokenizer and saved HTTP query receipts;
it makes no provider calls. An existing packed recall is not overwritten.
If the request budget is exhausted, cleanup stops and retains the unresolved
ownership records.
Recall and cleanup hold `memory/.running` exclusively. After a hard kill, remove
that empty directory only after confirming no process is using the run.

Existing scored output is never overwritten or silently rerun.

Outputs include `protocol-lock.json`, `memory/`, `recall/`, `scored/calls/`,
`scored/results.jsonl` and `scored/summary.json`. `verify` reconstructs source-bound
recall and checks linked answer contexts and saved score arithmetic offline.
Model call receipts retain raw response bodies, including HTTP and JSON failures,
with known credentials redacted.
The recorded aggregates are in [results.json](results.json).

## Sources

- [Past BEAM protocol](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam).
- [BEAM dataset (100K–1M)](https://huggingface.co/datasets/Mohammadta/BEAM).
- [BEAM-10M dataset](https://huggingface.co/datasets/Mohammadta/BEAM-10M).

Setup retains upstream code and its original license notices under the run's
`upstream/past/` directory. The Python entry point is
[`run.py`](run.py), the execution protocol is [`protocol.py`](protocol.py),
and the Node.js storage and recall adapter is [`adapter.mjs`](adapter.mjs).
