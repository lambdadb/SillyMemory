import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, validVersion } from '../scripts/check-release.mjs';
function fixture(date = 'Unreleased') {
    return { manifest: { version: '0.1.0' }, pkg: { version: '0.1.0' }, lock: { version: '0.1.0', packages: { '': { version: '0.1.0' } } }, changelog: `# Changelog\n\n## [0.1.0] - ${date}\n\n- First experimental release.\n` };
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
