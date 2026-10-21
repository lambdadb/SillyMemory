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
| Dataset | `Mohammadta/BEAM`; revisions and every Parquet shard hash in `config.json` |
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

From the repository root after `npm ci`:

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
JavaScript tokenizer. `prepare` checks every shard before parsing and freezes
the settings, source hashes and full cohort.

`recall` indexes each conversation, retrieves and packs evidence, then deletes
its owned test collection with a verified absence check. `score` generates one
answer per question and applies the upstream judges. Each live phase has an
eight-hour bound. The model phase allows up to 10,000 attempts within a $25
reservation at the runner's fixed accounting rates; this is not a total-service
price estimate. Database operation limits are 10,000 /20,000 /20,000 /50,000 for
100K /500K /1M /10M. Inspect `memory/memory-state.json` if recall stops before
cleanup completes. Existing scored output is never overwritten or silently rerun.

Outputs include `protocol-lock.json`, `memory/`, `recall/`, `scored/calls/`,
`scored/results.jsonl` and `scored/summary.json`. `verify` reconstructs source-bound
recall and checks linked answer contexts and saved score arithmetic offline.
The recorded aggregates are in [results.json](results.json).

## Sources

- [Past BEAM protocol](https://github.com/pastdotdev/benchmarks/tree/1faac1e70fa50d92d966904358be98bb1beca0c8/beam).
- [BEAM dataset](https://huggingface.co/datasets/Mohammadta/BEAM).

Setup retains upstream code and its original license notices under the run's
`upstream/past/` directory. The storage adapter and runner remain in
[`scripts/beam-past-memory.mjs`](../../scripts/beam-past-memory.mjs) and
[`scripts/beam-past-protocol.py`](../../scripts/beam-past-protocol.py).
