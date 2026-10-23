# Evidence retention and recovery

Current source maintains product behavior, focused regressions, current host
checks and the public [LongMemEval-S and BEAM profiles](../benchmark/README.md).
Superseded query policies, label/adjacency candidates, fixed-window generation
modes and their cohort-only tests/protocols are not maintained as alternate
implementations. This cleanup introduces no new quality score or deployment.

## Preserved source

The complete pre-cleanup tracked tree is
[`e858fbaff040e60ee0de2ed9264cdd10bc37d722`](https://github.com/lambdadb/SillyMemory/tree/e858fbaff040e60ee0de2ed9264cdd10bc37d722).
All **397 tracked files** were archived before editing. Every regular archive
member was read back and compared byte-for-byte with that commit.

- Local archive: `/Users/steven/Dev/sillymemory/artifacts/archive/intermediate-cleanup-v1/source.tar.gz`.
- Archive SHA-256: `83f386aa014560c7d7d161ec763ca55c86f82d79abc8c72d947b89025d3e47ac`.
- Adjacent `manifest.json` records each file's path, size and SHA-256; manifest
  SHA-256: `64bfd2752be20786049b966d971cb88b6708b7f55ad94f723e17d2dfb4a8e6a6`.
- The archive is ignored and local-only, unavailable in a fresh clone. Its tracked
  source is independently recoverable from the public Git revision above.
- Environment files, private chat data, browser profiles and untracked datasets
  are excluded. Existing raw-run archives and pending ownership records were not
  removed or relocated; the source archive does not duplicate those artifacts.

The [original evidence index](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/evidence-retention.md) and
[retired-file receipts](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/evidence-retention.json) preserve all
previous archive locations, producer revisions, checksums, adverse results,
limitations and availability. Historical raw artifacts retain those boundaries;
a Git commit or checksum does not make a private archive downloadable.

## Recovery

Create a detached checkout of the recorded producer to inspect an old experiment:

```sh
git worktree add --detach /path/to/historical-checkout e858fbaff040e60ee0de2ed9264cdd10bc37d722
```

Use the experiment's own producing revision and source overlay when recorded;
the cleanup baseline is an index, not a substitute for every original producer.
Read its dataset/settings locks, local-archive availability and dependency notices
before reproduction. Do not run retired modes through the current generation
smoke, bypass current budget guards or infer a new score from old receipts.

Public aggregate results and interpretation remain in the current
[LongMemEval-S report](longmemeval-public-evaluation.md),
[BEAM report](beam-evaluation.md), [actual-host comparison](product-comparison.md),
[summary comparison](segment-summary-evaluation.md) and
[checkpoint report](branch-checkpoint-cost.md). Earlier trials and detailed
receipts are linked at immutable revisions. Git history is not rewritten.
