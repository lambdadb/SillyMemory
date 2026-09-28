import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkRelease, checkPromotion, compareVersions, validVersion } from '../scripts/check-release.mjs';
function fixture(date = 'Unreleased', version = '0.1.0') {
    return { manifest: { version }, pkg: { version }, lock: { version, packages: { '': { version } } }, changelog: `# Changelog\n\n## [${version}] - ${date}\n\n- Experimental release notes.\n` };
}
test('release versions agree across both manifests and both lockfile locations', () => {
    assert.equal(checkRelease(fixture()).version, '0.1.0');
    for (const file of ['pkg', 'lock']) { const f = fixture(); f[file].version = '0.1.1'; assert.throws(() => checkRelease(f), /must match/); }
    const f = fixture(); f.lock.packages[''].version = '0.1.1'; assert.throws(() => checkRelease(f), /must match/);
});
test('publication rejects an undated candidate or a mismatched tag', () => {
    assert.throws(() => checkRelease({ ...fixture(), tag: 'v0.1.0' }), /dated changelog/);
    assert.throws(() => checkRelease({ ...fixture(), requireDate: true }), /dated changelog/);
    assert.throws(() => checkRelease({ ...fixture('2026-09-28'), tag: 'v0.2.0' }), /Release tag/);
    assert.equal(checkRelease({ ...fixture('2026-09-28'), tag: 'v0.1.0' }).tag, 'v0.1.0');
});
test('release notes require exactly one current entry, real date and nonempty notes', () => {
    for (const changelog of ['', '## [0.2.0] - Unreleased\n- Other release.', '## [0.1.0] - Unreleased\n## [0.1.0] - Unreleased\n- Duplicate.', '## [0.1.0] - Unreleased\n\n### Added\n']) assert.throws(() => checkRelease({ ...fixture(), changelog }));
    assert.throws(() => checkRelease(fixture('2026-02-30')), /Changelog date/);
});
test('SemVer allows prereleases but rejects malformed and leading-zero versions', () => {
    for (const v of ['0.1.0', '1.2.3-rc.1', '1.2.3+build.01']) assert(validVersion(v));
    for (const v of ['v0.1.0', '01.2.3', '1.2', '1.2.3-01', '1.2.3-', '1.2.3\n', null]) assert(!validVersion(v));
});
test('promotion precedence handles numeric versions, prereleases and build metadata', () => {
    const ordered = ['0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-alpha.beta', '0.1.0-beta', '0.1.0-beta.2', '0.1.0-beta.11', '0.1.0-rc.1', '0.1.0', '0.1.9', '0.1.10', '0.2.0', '1.0.0'];
    for (let i = 1; i < ordered.length; i++) {
        assert.equal(compareVersions(ordered[i - 1], ordered[i]), -1);
        assert.equal(compareVersions(ordered[i], ordered[i - 1]), 1);
    }
    assert.equal(compareVersions('0.1.0+new', '0.1.0+old'), 0);
});
test('main promotion allows first publication but requires an increase after dated main', () => {
    checkPromotion({ version: '0.1.0', baseVersion: '0.1.0' });
    checkPromotion({ version: '0.1.0', baseVersion: '0.1.0', baseChangelog: fixture().changelog });
    const base = { baseVersion: '0.1.0', baseChangelog: fixture('2026-09-28').changelog };
    for (const version of ['0.1.0', '0.1.0+new', '0.0.9', '0.1.0-rc.1']) assert.throws(() => checkPromotion({ ...base, version }), /advance/);
    checkPromotion({ ...base, version: '0.1.1' });
});
test('existing published tags block reuse even without a dated base entry', () => {
    for (const version of ['0.1.0', '0.1.0+new']) assert.throws(() => checkPromotion({ version, baseVersion: '0.1.0', tags: ['v0.1.0'] }), /reuse published/);
    checkPromotion({ version: '0.1.1', baseVersion: '0.1.0', tags: ['v0.1.0', 'unrelated', 'v-invalid'] });
});
test('promotion CLI reads actual Git base metadata and tags and rejects stale release notes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sillymemory-release-test-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const writeFixture = (date, version = '0.1.0') => {
        const f = fixture(date, version);
        for (const [file, value] of [['manifest.json', f.manifest], ['package.json', f.pkg], ['package-lock.json', f.lock]]) writeFileSync(path.join(root, file), JSON.stringify(value));
        writeFileSync(path.join(root, 'CHANGELOG.md'), f.changelog);
    };
    try {
        mkdirSync(path.join(root, 'scripts'));
        const script = path.join(root, 'scripts/check-release.mjs');
        copyFileSync(new URL('../scripts/check-release.mjs', import.meta.url), script);
        git('init'); git('config', 'user.name', 'Release test'); git('config', 'user.email', 'release-test@example.invalid');
        writeFixture('Unreleased'); rmSync(path.join(root, 'CHANGELOG.md'));
        git('add', '.'); git('commit', '-m', 'Initial candidate before release tooling');
        const initial = git('rev-parse', 'HEAD');
        // Run via a symlink outside the fixture cwd: the CLI must execute and read its own checkout.
        const linkedScript = path.join(root, 'linked-check.mjs'); symlinkSync(script, linkedScript);
        const run = base => spawnSync(process.execPath, [linkedScript, '--base-ref', base], { cwd: tmpdir(), encoding: 'utf8' });
        writeFixture('Unreleased');
        assert.notEqual(run(initial).status, 0, 'undated candidate cannot be promoted');
        writeFixture('2026-09-28'); assert.equal(run(initial).status, 0, 'first publication can keep the initial version');
        git('add', '.'); git('commit', '-m', 'Publish first version');
        const published = git('rev-parse', 'HEAD');
        assert.match(run(published).stderr, /advance/, 'dated main requires a bump even before tag publication');
        git('tag', 'v0.1.0');
        assert.match(run(initial).stderr, /reuse published/, 'tag prevents reuse even against a candidate base');
        writeFixture('2026-09-29', '0.1.1'); assert.equal(run(published).status, 0);
        writeFileSync(path.join(root, 'CHANGELOG.md'), fixture('2026-09-28').changelog);
        assert.match(run(published).stderr, /exactly one entry/, 'version bump also needs its own notes');
        writeFixture('2026-09-29', '0.1.1'); assert.notEqual(run('missing-ref').status, 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
