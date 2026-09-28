import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SemVer core and identifiers; numeric prerelease identifiers cannot have leading zeros.
export function validVersion(value) {
    if (typeof value !== 'string') return false;
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
    return Boolean(match && (!match[4] || match[4].split('.').every(part => !/^\d+$/.test(part) || /^(0|[1-9]\d*)$/.test(part))));
}
export function checkRelease({ manifest, pkg, lock, changelog, tag, requireDate = false }) {
    const version = manifest.version;
    assert(validVersion(version), 'manifest.json must contain a valid SemVer version');
    assert.equal(pkg.version, version, 'package.json version must match manifest.json');
    assert.equal(lock.version, version, 'package-lock.json version must match manifest.json');
    assert.equal(lock.packages?.['']?.version, version, 'package-lock.json root package version must match manifest.json');
    const headings = [...changelog.matchAll(/^## \[([^\]]+)\] - (.+)$/gm)];
    const entries = headings.filter(match => match[1] === version);
    assert.equal(entries.length, 1, 'CHANGELOG.md must contain exactly one entry for the current version');
    const entry = entries[0], date = entry[2].trim();
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    assert(date === 'Unreleased' || validDate, 'Changelog date must be Unreleased or a valid YYYY-MM-DD');
    const end = changelog.indexOf('\n## ', entry.index + entry[0].length);
    const body = changelog.slice(entry.index + entry[0].length, end === -1 ? undefined : end);
    assert(/^[-*] \S.+/m.test(body), 'Current changelog entry must contain release notes');
    if (tag !== undefined) assert.equal(tag, `v${version}`, 'Release tag must equal v followed by the manifest version');
    if (requireDate || tag !== undefined) assert(validDate, 'Publication requires a dated changelog entry, not Unreleased');
    return { version, date, ...(tag !== undefined ? { tag } : {}) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    let tag, requireDate = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--tag') { assert(args[i + 1] && !args[i + 1].startsWith('--'), '--tag requires a value'); tag = args[++i]; }
        else if (args[i] === '--require-date') requireDate = true;
        else throw new Error(`Unknown option: ${args[i]}`);
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const json = async file => JSON.parse(await readFile(new URL(file, pathToFileURL(root)), 'utf8'));
    const result = checkRelease({ manifest: await json('manifest.json'), pkg: await json('package.json'), lock: await json('package-lock.json'), changelog: await readFile(new URL('CHANGELOG.md', pathToFileURL(root)), 'utf8'), tag, requireDate });
    console.log(`Release metadata valid: ${result.version} (${result.date})`);
}
