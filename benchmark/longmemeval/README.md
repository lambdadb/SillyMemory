# LongMemEval-S

**Recorded result: 475/500 correct (95.0%).**

This profile evaluates answers with a frozen retrieval selection. The committed
source coordinates reconstruct all 500 evaluated answer requests from the public
dataset, including quoted memory, recent dialogue and the question. It does not
rerun indexing or search.

## Settings

| Component | Setting |
| --- | --- |
| Dataset | `xiaowu0162/longmemeval-cleaned`, LongMemEval-S, all 500 questions |
| Dataset revision | `98d7416c24c778c2fee6e6f3006e7a073259d48f` |
| Embedding used for selection | OpenAI `text-embedding-3-small` |
| Retrieval used for selection | Current-message Query1, Bayesian hybrid, k200 |
| Reranking used for selection | `jev-1.13.0`, candidate 200, final 50 |
| Memory | 800-character chunks, 4,096-token allocation, quoted user-context block |
| Generator | `gpt-6.1-sol`, reasoning `low`, max completion tokens 4,096 |
| Judge | `jev-1.13.0`, Noul Yes probability ≥0.50 |
| Scoring | Correct answers / 500, using the original task-specific rules |

Exact generation prompts and parameters are in [config.json](config.json).
[selection.jsonl](selection.jsonl) records source spans, citations, recent-message
indexes and a SHA-256 for each complete answer request. Source offsets are UTF-16
positions after literal escaping. [judge-rules.json](judge-rules.json) contains
the task-specific instructions; references enter judging only.

## Run

Run from the repository root after `npm ci`. Download size is approximately 277 MB.

```sh
node benchmark/longmemeval/run.mjs prepare --root artifacts/longmemeval

node benchmark/longmemeval/run.mjs answer --root artifacts/longmemeval \
  --env-file /path/to/evaluation.env
node benchmark/longmemeval/run.mjs judge --root artifacts/longmemeval \
  --env-file /path/to/evaluation.env

node benchmark/longmemeval/run.mjs verify --root artifacts/longmemeval
```

`prepare` verifies the dataset, source coordinates and all 500 request hashes.
`answer` makes up to 500 generation calls; `judge` makes up to 500 judge calls.
Each paid phase has a four-hour limit. Completed responses are reused on resume;
failed or interrupted requests are retained for inspection and are not resent
automatically. A `.running` directory prevents concurrent runs; inspect the run
before removing a lock left by a terminated process.

Outputs are `answer/`, `judge/`, `scores.json` and `summary.json`. `verify`
reconstructs the requests, checks response bindings, and compares every saved
per-question score and the summary with the recomputed results
without provider calls. The recorded aggregate is in [results.json](results.json).

## Sources

- [LongMemEval](https://github.com/xiaowu0162/LongMemEval), MIT license.
- [Pinned cleaned dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/tree/98d7416c24c778c2fee6e6f3006e7a073259d48f).
- Judge rules adapt the [pinned official evaluator](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py)
  to a Noul proposition, preserving the task-specific criteria. The upstream
  notice is retained in [LICENSE.upstream](LICENSE.upstream).
