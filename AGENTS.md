# Repository instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing this repository.

- Branch ordinary work from the latest `origin/develop` in a dedicated worktree
  and target `develop` in the PR. Keep `main` as the public installation baseline.
- Use squash merge for ordinary work PRs into `develop`; use a merge commit
  for `develop` → `main` promotions. Do not reuse squashed topic branches.
- Do not merge PRs, create releases, or deploy without user authorization.
- Open completed, validated work as a regular PR; reserve Draft for unfinished work.
- Keep credentials and personal chat data out of Git, logs, PRs, and test artifacts.
- Distinguish source inspection, unit/emulator tests, live integration, and deployment.
- Preserve the UI-extension/direct-CORS design and session-only API key handling.
  Never forward SillyTavern cookies/CSRF headers or add a server plugin.
- Use English for repository documentation and follow the user's language in conversation.

## Experiment scope and retention

- Follow the experiment lifecycle in [CONTRIBUTING.md](CONTRIBUTING.md#experiment-lifecycle-and-retention).
- Define the product decision and a bounded completion criterion before expanding
  experiments. Default to one reviewable change covering the necessary harness,
  completed run or concrete blocker, analysis, and cleanup; do not open a new PR
  for every preflight, retry helper, or intermediate run.
- Keep reusable evaluation code, small regression fixtures, frozen inputs/settings
  and concise conclusions. Store detailed run outputs and historical source bundles
  as ignored artifacts with checksums and explicit availability, not permanent CI
  dependencies. Preserve evidence before removing its active-tree copies.
- Avoid general-purpose experiment infrastructure unless a concrete recurring use
  requires it. Test-count growth and infrastructure completion are not product or
  answer-quality progress. Report those boundaries explicitly.

## Hypothesis evaluation before optimization

- Start a new technique with the simplest formulation justified by its semantics.
  Do not add arbitrary message-count, token, threshold, or routing heuristics
  before establishing that the technique improves the relevant quality failures.
- Establish quality and meaning first, then optimize latency, cost, and resource
  use against that measured reference. Retain operational safety, provider context
  limits, source validity, isolation, and authorized total experiment bounds.
- For contextual query construction, the initial reference input is the complete
  recent dialogue outside the indexed older-history partition. Do not impose a
  separate four-message or 600-token context cap. Report model-context overflow as
  a limitation rather than silently truncate the reference input.

## Current evaluation priority

- Prioritize English for near-term answer-quality evaluation and optimization.
  Defer new Korean/other-language live experiments and targeted optimization.
- Preserve historical multilingual results and existing inexpensive unit tests.
  Korean-only quality regressions are not a blocking adoption gate for an
  explicitly English-focused candidate; disclose them and avoid multilingual
  quality claims. Isolation, synchronization, budget and failure-safety checks
  remain required regardless of language.
