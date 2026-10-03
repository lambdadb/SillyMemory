# Releases

SillyMemory is installed from Git. The default installation follows `main`;
SillyTavern's Update button pulls the installed branch, not the latest GitHub
Release or highest version tag. Keep `main` at reviewed release boundaries.
`develop` integrates ongoing work. Merge `develop` into `main` with a merge
commit to preserve long-lived branch ancestry.

The current release boundary is **0.2.0 (experimental)**, dated **2026-10-03**.
See the [release notes](docs/releases/0.2.0.md) and
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) to confirm
publication. The development candidate is **0.3.0**, with an `Unreleased` entry
and opt-in [versioned story memory](docs/versioned-memory.md). It has not been
promoted or published; never reuse a published version. Main promotion, tag
push and GitHub Release publication require maintainer authorization, which may
cover the full sequence in one request.

## Version and changelog rules

- Keep `manifest.json`, `package.json`, and both root version fields in
  `package-lock.json` equal. The extension manager displays the manifest version.
- Use SemVer. During 0.x, use patch increments for compatible fixes and minor
  increments for features or incompatible behavior; call out incompatibilities
  and migration steps. Reserve 1.0.0 for an explicit stable-support commitment.
- Add one `## [VERSION] - Unreleased` entry to `CHANGELOG.md` for the candidate.
  Describe behavior, supported host, configuration/data changes and limitations.
  Never silently reuse or move a published version/tag.
- For a new version, update the manifest and run `npm version VERSION
  --no-git-tag-version` to update the package/lock files. Review the diff; this
  does not publish a tag or release.
- Run `npm run check:release`, `npm test`, and `npm run check` locally. Metadata
  validation also runs in CI. CI does not replace live/browser evidence.

## Prepare and promote

1. Work from current `origin/develop` in a dedicated release-preparation worktree.
   Open a regular PR into `develop` after validating the candidate. Include the
   version, changelog, installation instructions and migration/rollback notes.
2. Test the pinned SillyTavern installation and update UI in an isolated profile.
   Use the candidate PR branch to validate before changing public `main`. Record
   the installed/upgraded commit IDs. Run runtime/browser/live checks appropriate
   to the changes; distinguish paid live calls from emulated failures.
3. When ready to publish, replace the candidate's `Unreleased` with the agreed
   `YYYY-MM-DD` date in a reviewed preparation PR to `develop`. A dated entry
   alone is not a published release. Confirm all required checks and known limits.
4. Open `develop` → `main` with release notes and validation links. The main-target
   CI requires a dated current changelog entry and compares the candidate against
   the PR base commit and fetched version tags. Once main has a dated entry, the
   candidate must have higher SemVer precedence; a version already tagged cannot
   be reused (build metadata does not make a new version). The first untagged
   candidate may retain 0.1.0 when main has no dated entry. Obtain maintainer
   approval and merge with a **merge commit**, not squash/rebase.
5. Verify the resulting main tree and CI. Record its full commit SHA. Users who
   install or manually update `main` can receive it immediately after this merge,
   even before the tag or GitHub Release is created.

To run the promotion check locally, fetch the base and tags, then use
`npm run check:release -- --base-ref origin/main`. This also requires dated notes.
Development PRs may retain the current version while preparing the next release;
version advancement is checked for every PR targeting main, including hotfixes
and documentation changes. These checks rely on the PR workflow and do not
prevent direct main pushes without branch protection.

## Tag and announce (maintainer authorization required)

After approval, in a clean checkout synchronized with the reviewed remote main:

```sh
git fetch origin --tags
git switch main
git merge --ff-only origin/main
npm run check:release -- --tag v0.2.0
# Confirm HEAD is the approved main commit before creating the tag.
git tag -a v0.2.0 -m 'SillyMemory 0.2.0 (experimental)'
git push origin refs/tags/v0.2.0
```

Use the actual approved version in these commands. The tag CI checks metadata,
the dated changelog, tests and whether the tagged commit is contained in
`origin/main`. Wait for it to pass before publishing the GitHub Release at that
existing tag. Mark the experimental 0.2.0 release as **pre-release**, describing it as
experimental and linking the installation guide. Use a reviewed release-notes
file with `gh release create v0.2.0 --verify-tag --prerelease --title
'SillyMemory 0.2.0 (experimental)' --notes-file docs/releases/0.2.0.md`.

Tags and Releases are not published automatically. CI detects mistakes after a
push; it is not a server-side prohibition on changing branches or tags. Branch
and tag protection/rulesets are separate repository administration settings.
If tag checks fail, stop publication and investigate; do not silently move a
public tag. GitHub's pre-release flag does not prevent main-branch installation.
No npm package or compiled bundle is required for installation.

## User updates and rollback

Users install the repository URL from **Extensions → Install extension** and
normally leave the optional branch/tag field empty, selecting default `main`.
They update through **Manage extensions → SillyMemory → Update**, then reload.
Automatic updates are disabled in the manifest. Reload clears the session key
and starts memory disabled; reconnect and re-enable it when ready.

For a problem, first disable memory to preserve ordinary chat operation. Back up
SillyTavern data before changing versions. Do not uninstall or delete collections
just to change code versions. Advanced users can pin a known-good published tag
in the installed extension's Git directory (normally
`SillyTavern/data/<user-handle>/extensions/SillyMemory`):

```sh
git status --short
# Stop if there are local modifications; preserve them rather than discarding them.
git fetch origin --tags
git switch --detach v0.1.0
```

Reload afterward. A detached tag is a fixed build; do not use the Update button
while pinned. To resume normal updates: `git switch main`, then update through
the UI and reload. If installed with an explicit tag and no local main branch,
fetch `git fetch origin main:refs/remotes/origin/main`, then use
`git switch -c main --track origin/main` instead. These examples only work after
that tag exists. Check GitHub Releases before choosing a rollback target.

Code rollback does not undo LambdaDB writes, chat edits or data migrations.
Review each release's compatibility notes before downgrading. The installation
smoke test checks 0.1.0 → candidate → 0.1.0 → candidate code changes. In live
mode it removes the test's remote data before rollback; it does not prove that
0.1.0 can manage 0.2.0 per-chat collections or reverse data/metadata changes.

## Installation smoke test

The 0.2.0 direct-CORS release is tested with the host proxy disabled. Its
[current transport evidence](docs/direct-cors.md) supplements earlier proxy-path
release checks; the [final acceptance record](docs/releases/0.2.0-validation.md#final-publication-acceptance) covers the combined release tree.

Use an isolated pinned host checkout with no global SillyMemory symlink. The
script creates/removes its own host data directory and browser profile. It
installs public main from the actual GitHub URL through the UI. In the disposable
installed clone, it finds the common ancestor of main and the candidate and
requires its tree to equal the installed main tree. It creates a local branch
there tracking the published candidate PR branch, then clicks the actual UI
Update button. This avoids the divergent merge-commit history of the two
long-lived branches while preserving exactly the installed files. This
checks real GitHub fetch/pull without promoting public main or publishing a tag.
It also checks version display, settings/owner preservation, key clearing and
commit rollback/return. By default it makes no LambdaDB/model calls.

```sh
ST_SOURCE=/path/to/isolated/pinned/SillyTavern \
SM_UPDATE_BRANCH=your-published-candidate-branch SM_ARTIFACT_TAG=install-unique \
  npm run test:install
```

The test branch must exist on GitHub and differ from main. The report identifies
the exact commits; it must not be presented as a published main-to-main release
upgrade. Artifact tags must be unique. Reports/screenshots stay in ignored local
`artifacts/`; checked-in validation records retain results and limits.

For the bounded real managed-memory upgrade check, use the same isolated host:

```sh
ST_SOURCE=/path/to/isolated/pinned/SillyTavern \
SM_ENV_FILE=/absolute/path/to/.env.local \
SM_UPDATE_BRANCH=your-published-candidate-branch SM_ARTIFACT_TAG=upgrade-unique \
  npm run test:install -- --live-memory
```

This reads the existing `LAMBDADB_BASE_URL`, `LAMBDADB_PROJECT_NAME` and
`LAMBDADB_PROJECT_API_KEY` values. It creates at most four synthetic owned
collections: transport gate, 0.1.0 shared memory, upgraded parent and native
branch. Only the old 0.1.0 setup uses the proxy. After the UI update the runner
restarts the isolated host with its proxy disabled, then records direct requests
and collection intent at the canonical endpoint origin. This restart is a test
assertion, not a requirement for users updating the extension. It verifies
first-sync reindexing, legacy preservation, rename/branch/edit
isolation, managed queryText through the interceptor, key re-entry and both
remote deletion controls. No generation model is called; this is not a complete
provider-generation or answer-quality test. Screenshots are disabled in live
mode, credentials are redacted from reports, and keys must be absent from
persistent browser/host settings.

Cleanup confirms each recorded collection is unavailable. A failed cleanup
preserves `artifacts/<tag>-pending.json` and the isolated host profile named in
the report. Resolve those owned resources before rerunning; never discard the
pending record while remote cleanup is uncertain. Raw reports stay local and
ignored; archive exact reports/producer source with checksums and record their
availability in the release validation document.
