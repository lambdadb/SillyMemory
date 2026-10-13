import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SemVer core and identifiers; numeric prerelease identifiers cannot have leading zeros.
export function validVersion(value) {
    if (typeof value !== 'string') return false;
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
    return Boolean(match && (!match[4] || match[4].split('.').every(part => !/^\d+$/.test(part) || /^(0|[1-9]\d*)$/.test(part))));
}
// SemVer precedence ignores build metadata and compares numeric identifiers numerically.
export function compareVersions(left, right) {
    assert(validVersion(left) && validVersion(right), 'Cannot compare invalid SemVer versions');
    const parts = version => version.split('+')[0].match(/^([\d.]+)(?:-(.+))?$/).slice(1);
    const [leftCore, leftPre] = parts(left), [rightCore, rightPre] = parts(right);
    const compareNumber = (a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
    const a = leftCore.split('.'), b = rightCore.split('.');
    for (let i = 0; i < 3; i++) { const order = compareNumber(a[i], b[i]); if (order) return order; }
    if (leftPre === rightPre) return 0;
    if (leftPre === undefined) return 1;
    if (rightPre === undefined) return -1;
    const ap = leftPre.split('.'), bp = rightPre.split('.');
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        if (ap[i] === undefined) return -1;
        if (bp[i] === undefined) return 1;
        if (ap[i] === bp[i]) continue;
        const an = /^\d+$/.test(ap[i]), bn = /^\d+$/.test(bp[i]);
        if (an && bn) return compareNumber(ap[i], bp[i]);
        if (an !== bn) return an ? -1 : 1;
        return ap[i] < bp[i] ? -1 : 1;
    }
    return 0;
}
// These files are not loaded by the installed extension. Keep the allowlist
// narrow: documentation payloads such as JSON and general tooling are excluded.
export function documentationOnly(changes) {
    if (!changes.length) return false;
    return changes.every(({ path, beforeMode, afterMode, before = '', after = '' }) => {
        if (![beforeMode, afterMode].every(mode => ['000000', '100644'].includes(mode))) return false;
        if (['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'RELEASING.md',
            'scripts/check-release.mjs', 'tests/release.test.js'].includes(path)
            || /^docs\/.+\.md$/.test(path)) return true;
        if (path !== 'settings.html' || beforeMode !== '100644' || afterMode !== '100644') return false;
        // Only plain, attribute-free help paragraphs may change. Preserve every
        // control, attribute, tag and all other text byte-for-byte. Reject raw
        // script/style content so embedded markup cannot masquerade as help.
        if (/<(?:script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)\b/i.test(before + after)) return false;
        const withoutHelp = text => {
            // Quoted attributes are single tokens, even when they contain <p>.
            const tokens = [...text.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>|[^<]+/g)];
            let end = 0;
            for (const token of tokens) {
                if (token.index !== end) return null;
                end += token[0].length;
            }
            if (end !== text.length) return null;
            return tokens.map((token, i) => tokens[i - 1]?.[0] === '<p>'
                && tokens[i + 1]?.[0] === '</p>' && !/[<>&]/.test(token[0]) ? '' : token[0]).join('');
        };
        const normalized = withoutHelp(before);
        return normalized !== null && normalized === withoutHelp(after);
    });
}
export function checkPromotion({ version, baseVersion, baseChangelog = '', tags = [], changes = [] }) {
    const datedBase = [...baseChangelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)]
        .some(entry => entry[1] === baseVersion);
    if (datedBase && version === baseVersion && documentationOnly(changes)) return 'documentation';
    const order = compareVersions(version, baseVersion);
    assert(order >= 0 && (!datedBase || order > 0), 'Main promotion must advance the previously dated base version');
    const reusedTag = tags.find(tag => tag.startsWith('v') && validVersion(tag.slice(1)) && compareVersions(version, tag.slice(1)) === 0);
    assert(!reusedTag, `Main promotion cannot reuse published version ${reusedTag}`);
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
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    const args = process.argv.slice(2);
    let tag, baseRef, requireDate = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--tag') { assert(args[i + 1] && !args[i + 1].startsWith('--'), '--tag requires a value'); tag = args[++i]; }
        else if (args[i] === '--base-ref') { assert(args[i + 1] && !args[i + 1].startsWith('--'), '--base-ref requires a value'); baseRef = args[++i]; }
        else if (args[i] === '--require-date') requireDate = true;
        else throw new Error(`Unknown option: ${args[i]}`);
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const json = async file => JSON.parse(await readFile(new URL(file, pathToFileURL(root)), 'utf8'));
    const result = checkRelease({ manifest: await json('manifest.json'), pkg: await json('package.json'), lock: await json('package-lock.json'), changelog: await readFile(new URL('CHANGELOG.md', pathToFileURL(root)), 'utf8'), tag, requireDate: requireDate || baseRef !== undefined });
    if (baseRef !== undefined) {
        const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
        // Resolve before constructing file expressions; missing/invalid refs fail closed.
        const base = git('rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`);
        const baseVersion = JSON.parse(git('show', `${base}:manifest.json`)).version;
        const baseChangelog = git('ls-tree', '--name-only', base, '--', 'CHANGELOG.md') ? git('show', `${base}:CHANGELOG.md`) : '';
        // Only committed changes qualify. A dirty tracked file cannot borrow
        // a documentation-only committed diff to bypass release validation.
        const clean = !git('diff', 'HEAD', '--');
        const fields = git('diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, 'HEAD').split('\0');
        const changes = [];
        for (let i = 0; fields[i]; i += 2) {
            const [beforeMode, afterMode, beforeId, afterId] = fields[i].slice(1).split(' ');
            const path = fields[i + 1];
            const contents = id => execFileSync('git', ['cat-file', 'blob', id], { cwd: root, encoding: 'utf8' });
            changes.push({ path, beforeMode, afterMode, ...(path === 'settings.html' ? {
                before: beforeMode === '100644' ? contents(beforeId) : '',
                after: afterMode === '100644' ? contents(afterId) : '',
            } : {}) });
        }
        const kind = checkPromotion({ version: result.version, baseVersion, baseChangelog,
            tags: git('tag', '--list', 'v*').split('\n'), changes: clean ? changes : [] });
        if (kind === 'documentation') console.log('Documentation/help-text maintenance: keeping the published version; no new tag or release.');
    }
    console.log(`Release metadata valid: ${result.version} (${result.date})`);
}
