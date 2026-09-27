# Contributing

## Branches and pull requests

- `main` is the reviewed public installation baseline. It remains the default
  branch; the current product is still experimental.
- `develop` integrates ongoing development.
- Start ordinary work from the latest `origin/develop`, using a focused
  `feat/`, `fix/`, `docs/`, or `chore/` branch. Target `develop` in its pull request.
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
changes before removing its clean local worktree/branch. Do not remove unrelated
or uncommitted work.

## Validation and evidence

Run `npm test` and `npm run check`. CI checks all runtime, script, and test syntax
and runs the unit suite on Node.js 20.12.0 and 24 for PRs and pushes to `main` or
`develop`. Unit coverage does not establish browser or provider compatibility.

For host integration changes, use the pinned SillyTavern checkout and the relevant
browser/emulator checks described in [README](README.md). Run paid live tests only
within the authorized scope, with synthetic data and verified owned-data cleanup.
Keep unit, emulator, and live results distinct in the PR. Document unverified
behavior and relevant failure cases; do not present local checks as deployed proof.

Development documents are English. Keep implementation and development records in
this repository. Do not change LambdaDB or add a server plugin as part of the MVP.
