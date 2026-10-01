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
- Preserve the UI-extension/built-in-proxy design and session-only API key handling.
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
