# Benchmarks

Reproduce the evaluated LongMemEval-S and BEAM profiles from a fresh clone.

| Benchmark | Questions | Recorded score | Protocol |
| --- | ---: | ---: | --- |
| [LongMemEval-S](longmemeval/) | 500 | 95.0% | LambdaDB retrieval, answer generation and judging |
| [BEAM 100K](beam/) | 400 | 89.00 /100 | Past public protocol |
| [BEAM 500K](beam/) | 700 | 85.99 /100 | Past public protocol |
| [BEAM 1M](beam/) | 700 | 86.62 /100 | Past public protocol |
| [BEAM 10M](beam/) | 200 | 80.64 /100 | Past public protocol |

Use Node.js 24. BEAM also requires Python 3.14 and Git. From the repository root:

```sh
npm ci
```

Each folder contains fixed settings, recorded results and execution commands.
Public datasets are downloaded at pinned revisions and checked by SHA-256.
Runs write to ignored `artifacts/` directories. Keep credentials outside the run;
pass an existing file explicitly with `--env-file`. The required variable names
are shown in [credentials.example](credentials.example).

`setup` downloads public inputs and installs the tokenizer. `prepare` and `verify`
do not call model or database APIs. Both benchmarks use paid `recall` and `score`
phases. Neither requires a running SillyTavern or extension; clone the repository
because the runners reuse its source modules. Model access and
provider availability are required; new responses can produce different scores.
