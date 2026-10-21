# Benchmarks

Reproduce the evaluated LongMemEval-S and BEAM profiles from a fresh clone.

| Benchmark | Questions | Recorded score | Protocol |
| --- | ---: | ---: | --- |
| [LongMemEval-S](longmemeval/) | 500 | 95.0% | LambdaDB retrieval, answer generation and judging |
| [BEAM 100K](beam/) | 400 | 89.00 /100 | Past public protocol |
| [BEAM 500K](beam/) | 700 | 85.99 /100 | Past public protocol |
| [BEAM 1M](beam/) | 700 | 86.62 /100 | Past public protocol |
| [BEAM 10M](beam/) | 200 | 80.64 /100 | Past public protocol |

Use Python 3.14 and Node.js 24. Install repository Node.js dependencies from the
repository root:

```sh
npm ci
```

| Benchmark | Python dependencies | Additional tools |
| --- | --- | --- |
| LongMemEval-S | Standard library only; no `pip install` required | Node.js and npm |
| BEAM | Install the pinned packages in [beam/requirements.txt](beam/requirements.txt) using the [BEAM setup commands](beam/README.md#run) | Node.js, npm and Git |

Each runner's `setup` phase installs the locked Node.js tokenizer into its run
directory. Both runners support Linux and macOS; their request or download
deadlines use POSIX signals.

Both benchmarks expose a Python `run.py` with the same execution phases and
use Node.js adapters for SillyMemory retrieval and memory assembly. Each folder
contains fixed settings, recorded results and execution commands.

| Code | Responsibility |
| --- | --- |
| `longmemeval/run.py`, `beam/run.py` | Python command-line entry points |
| `longmemeval/adapter.mjs`, `beam/adapter.mjs` | Node.js adapters for each benchmark's memory protocol |
| `beam/protocol.py` | Pinned Past loading, generation, scoring and verification |
| `longmemeval/protocol.mjs`, `longmemeval/storage.mjs` | LongMemEval source preparation, memory assembly and storage |
| `shared/memory-budget.mjs` | Database request limits with a reserved cleanup allowance |
| `tokenizer/` | Shared, locked tokenizer dependency |

Public datasets are downloaded at pinned revisions and checked by SHA-256.
Runs write to ignored `artifacts/` directories. Keep credentials outside the run;
pass an existing file explicitly with `--env-file`. The required variable names
are shown in [credentials.example](credentials.example).

`setup` downloads public inputs and installs the tokenizer. `prepare` and `verify`
do not call model or database APIs. Both benchmarks use paid `recall` and `score`
phases. Both also expose `cleanup` for retrying owned-collection deletion after
a failed recall. Neither requires a running SillyTavern or extension; clone the
repository because the runners reuse its source modules. Model access and
provider availability are required; new responses can produce different scores.
