# Contributing

## Branches and pull requests

- `main` is the reviewed public installation baseline. It remains the default
  branch; the current product is still experimental.
- `develop` integrates ongoing development.
- Start ordinary work from the latest `origin/develop`, using a focused
  `feat/`, `fix/`, `docs/`, or `chore/` branch. Target `develop` in its pull request.
- Squash ordinary work PRs into `develop`: one PR should represent one logical
  change, with a descriptive PR title used for the resulting commit message.
  Remove the merged topic branch and start the next task from current
  `origin/develop`; do not continue working on a squashed branch.
- Promote validated development with a separate `develop` → `main` PR. Preserve
  ancestry with a merge commit for this promotion rather than squashing the
  long-lived branch. A release tag or deployment is a separate action.
- An urgent fix may start from `main` and target `main`; then carry that fix back
  into `develop` through a PR before further promotion.

Keep routine work off both long-lived branches. Use a dedicated worktree so
parallel tasks do not share edits:

```sh
git fetch origin --prune
git worktree add -b feat/example ../sillymemory-example origin/develop
cd ../sillymemory-example
npm ci
# Implement and verify the change, then commit it.
git push -u origin feat/example
gh pr create --base develop
```

Choose a descriptive branch name instead of `feat/example`. Do not copy
`.env.local` or personal conversations into another worktree or commit them.
Open a regular PR when implementation and checks are ready; use Draft only for
unfinished work. Specify the base explicitly because the repository default
remains `main`. Merge, release, and deployment require maintainer authorization.

After a PR merges, fetch the destination and confirm that it contains the intended
changes before removing its clean local worktree/branch. After a squash merge,
the original topic commits may not be ancestors of the destination: verify the
merged PR, its resulting commit and included changes instead of treating an
ancestry check as proof that work is missing. Preserve ignored validation
artifacts separately or keep the worktree detached. Do not remove unrelated or
uncommitted work. Existing merged history is not rewritten for this policy.

## Release preparation

Follow [RELEASING.md](RELEASING.md) for version/changelog checks, installation
validation, main promotion and separately approved tag/Release publication.
Keep manifest, package and root lockfile versions equal. Development candidates
use an `Unreleased` changelog date; main promotion requires a reviewed date.
A main merge makes code available to branch-based installers immediately.

## Validation and evidence

Run `npm test`, `npm run check`, and `npm run check:release`. CI checks all runtime, script, and test syntax
and runs the unit suite on Node.js 20.12.0 and 24 for PRs and pushes to `main` or
`develop`. Unit coverage does not establish browser or provider compatibility.

For host integration changes, use the pinned SillyTavern checkout and the relevant
browser/emulator checks described in [README](README.md). Run paid live tests only
within the authorized scope, with synthetic data and verified owned-data cleanup.
Keep unit, emulator, and live results distinct in the PR. Document unverified
behavior and relevant failure cases; do not present local checks as deployed proof.

Development documents are English. Keep implementation and development records in
this repository. Do not change LambdaDB or add a server plugin as part of the MVP.

## Experiment lifecycle and retention

Before adding a benchmark or extending its harness, state the product question,
which observation will support a decision, the authorized input/cost/time bounds,
and the stopping condition. Prefer existing runners. Add infrastructure only when
it is necessary to complete that evaluation or has a concrete recurring use.

A normal experiment change includes the needed harness changes, the bounded run,
analysis of positive/negative results, limitations, and verified owned-data cleanup.
Do not split preparation, retry handling, another preflight, and each intermediate
result into successive PRs by default. If a real external blocker prevents the run,
record the exact blocker and retained evidence. A separately reviewable safety fix
or reusable regression can justify an earlier PR; state why it must land separately
and what observation is still missing. Do not describe such a PR as completed
quality evaluation or require repeated approvals for already authorized work.

Retention rules:

| Material | Retention |
| --- | --- |
| Product/runtime fixes and meaningful regressions | Keep in normal source and CI. |
| Reusable evaluation entry points, scoring, input splits, settings and seed/version locks | Keep the minimal maintained implementation. |
| Method, aggregate results, failures that affect interpretation, limitations and next decision | Keep concise repository documentation. |
| Full prompts/responses, large run reports, intermediate failures and logs | Keep under ignored `artifacts/` or an explicitly published artifact location, subject to data licenses and secret/privacy rules. |
| Historical producer source, local patches and one-off recovery scripts | Archive with the run when needed for reproduction; remove inactive copies and compatibility branches from maintained code. |

Before removing tracked run material, preserve and verify the original bytes in an
archive. Record the producing/revalidation revision, required patch if the tree
was dirty, input/settings locks, file/archive checksums and how to retrieve it.
Say when an archive is local-only and unavailable in a fresh clone. A checksum or
commit ID alone is not a promise that a downloadable archive exists. Do not upload
private checkpoints or change publication/release scope merely to archive a run.
Never discard unresolved cleanup/ownership records while remote resources remain.

CI should check current invariants with small synthetic fixtures. Validate a
historical run with its recorded revision and artifact bundle rather than copying
old implementations into fixtures after every edit or supporting every old report
in the latest validator. Label synthetic fixtures as unit evidence, never as an
actual host/provider run. Report product regressions, harness tests, actual-host
fixtures and paid-provider quality results separately; a larger test count does
not establish product improvement.

At completion, remove temporary branches of logic and unused tooling, preserve the
concise decision record, and identify any genuinely reusable follow-up. Apply this
policy to new work and touched experiment areas; do not rewrite existing Git
history or mass-migrate unrelated experiments solely for stylistic consistency.
