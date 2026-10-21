# Benchmarks

Reproduce the evaluated LongMemEval-S and BEAM profiles from a fresh clone.

| Benchmark | Questions | Recorded score | Protocol |
| --- | ---: | ---: | --- |
| [LongMemEval-S](longmemeval/) | 500 | 95.0% | Answer evaluation with frozen retrieved evidence |
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

`prepare` and `verify` do not call model or database APIs. LongMemEval `answer`
and `judge`, and BEAM `recall` and `score`, are paid phases. Model access and
provider availability are required; new responses can produce different scores.
