// Fresh GitHub installation through the pinned host UI. No provider calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.env.ST_SOURCE;
const installBranch = process.env.SM_INSTALL_BRANCH || 'main';
assert(source, 'ST_SOURCE must be an isolated pinned host without an extension symlink');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
git(root, 'check-ref-format', '--branch', installBranch);
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(git(source, 'rev-parse', 'HEAD'), revision);
for (const folder of ['sillymemory', 'SillyMemory']) await assert.rejects(lstat(path.join(source, 'public/scripts/extensions/third-party', folder)), { code: 'ENOENT' });
const repository = 'https://github.com/lambdadb/SillyMemory';
const installFolder = 'SillyMemory';
const expected = ref => git(root, 'ls-remote', repository, `refs/heads/${ref}`).split(/\s+/)[0];
const installSha = expected(installBranch);
assert(/^[a-f0-9]{40}$/.test(installSha), 'The requested installation branch must exist on GitHub');
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-install-'));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const artifactTag = process.env.SM_ARTIFACT_TAG || 'install';
assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag));
const reportPath = path.join(artifacts, `${artifactTag}.json`);
await writeFile(reportPath, '{}', { flag: 'wx' });
const port = Number(process.env.ST_INSTALL_PORT || 18129), url = `http://127.0.0.1:${port}`;
const installed = path.join(work, 'data/default-user/extensions', installFolder);
const harnessSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const report = { harnessSha256, host: revision, repository, installFolder, installBranch, installSha, checks: [], api: [], pageErrors: [], remoteRequests: 0, passed: false };
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };
let server, browser, page;
try {
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    async function startHost(enableProxy) {
        server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', String(enableProxy)], { cwd: source, stdio: 'ignore' });
        let ready = false;
        for (let i = 0; i < 90; i++) { assert(server.exitCode === null, 'Host exited'); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
        assert(ready, 'Host startup timeout');
    }
    await startHost(false);
    // The host default automatically polls remote Horde. Installation requires
    // no model connection; keep this profile offline, as in the live harness.
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai'; await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('dialog', dialog => { void dialog.accept().catch(error => report.pageErrors.push(error.message)); });
    await page.route('**/proxy/**', route => { report.remoteRequests++; return route.abort(); });
    await page.route('https://release-test.invalid/**', route => { report.remoteRequests++; return route.abort(); });
    page.on('response', response => { if (/\/api\/extensions\/(install|update)$/.test(new URL(response.url()).pathname)) report.api.push({ operation: new URL(response.url()).pathname.split('/').at(-1), status: response.status() }); });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#third_party_extension_button').click();
    await page.locator('dialog[open] .popup-input').fill(repository);
    await page.locator('#extension_branch_name').fill(installBranch);
    await page.getByText('Install just for me', { exact: true }).click();
    await page.getByText('Yes, install it', { exact: true }).click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 90000 });
    check('Git URL UI installation clones the requested branch', git(installed, 'rev-parse', 'HEAD') === installSha && git(installed, 'branch', '--show-current') === installBranch);
    check('user-scoped installation is a real Git checkout, not a symlink', !(await lstat(installed)).isSymbolicLink() && git(installed, 'remote', 'get-url', 'origin').replace(/\/$/, '') === repository);
    check('installed directory preserves the requested repository spelling', (await readdir(path.dirname(installed))).includes(installFolder));
    report.initialVersion = JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8')).version;
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    async function settings() {
        if (!await field('endpoint').isVisible()) {
            if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
            if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
        }
    }
    await settings();
    check('installed extension shows product branding', (await page.locator('#sillymemory').innerText()).includes('Powered by LambdaDB'));
    await field('endpoint').fill('https://release-test.invalid'); await field('project').fill('release-test');
    await field('key').fill('synthetic-release-session-key'); await field('connect').click();
    await field('recent').fill('14'); await field('recent').dispatchEvent('change');
    await field('budget').fill('600'); await field('budget').dispatchEvent('change');
    await field('stopOnLoss').uncheck();
    check('session key input clears after connecting', await field('key').inputValue() === '');
    const owner = await page.evaluate(() => SillyTavern.getContext().extensionSettings.sillymemory.owner);
    await page.evaluate(async () => { const { saveSettings } = await import('/script.js'); await saveSettings(); });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' }); await settings();
    check('reload preserves installation ownership', await page.evaluate(owner => SillyTavern.getContext().extensionSettings.sillymemory.owner === owner, owner));
    check('reload clears the key and leaves memory disabled', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('configured token bounds and warning-only preference survive reload', await field('recent').inputValue() === '14' && await field('budget').inputValue() === '600' && !await field('stopOnLoss').isChecked());
    check('settings link to the canonical source and license', await page.locator('#sillymemory a', { hasText: 'Source' }).getAttribute('href') === repository && await page.locator('#sillymemory a', { hasText: 'AGPL-3.0-only' }).getAttribute('href') === `${repository}/blob/main/LICENSE`);
    check('panel explains direct CORS without a proxy setup', (await page.locator('#sillymemory').innerText()).includes('No SillyTavern proxy setting or restart is needed.'));
    const candidate = JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8'));
    check('candidate manifest version agrees with package version', candidate.version === JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')).version);
    report.updatedVersion = candidate.version;
    await page.locator('#extensions_details').click();
    await page.getByText('Loading third-party extensions... Please wait...', { exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => d.querySelector('.extensions_info') && Number(getComputedStyle(d).opacity) === 1));
    check('extension manager displays the candidate version', (await page.locator('.extensions_info .extension_block').filter({ hasText: 'SillyMemory' }).innerText()).includes(candidate.version));
    await page.screenshot({ path: path.join(artifacts, `${artifactTag}.png`) });
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    check('session keys are absent from persistent browser state', !persisted.includes('synthetic-release-session-key'));
    check('fresh installation and reload have no uncaught errors or provider requests', report.pageErrors.length === 0 && report.remoteRequests === 0);
    report.passed = true;
 } catch (error) {
    report.failure = error.message;
    console.error('FAIL', error.message);
    await page?.screenshot({ path: path.join(artifacts, `${artifactTag}-failure.png`) }).catch(() => {});
    process.exitCode = 1;
} finally {
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    await rm(work, { recursive: true, force: true }); report.localProfileRemoved = true;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
}
