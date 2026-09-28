// Real GitHub clone/pull through the pinned host UI. No LambdaDB/model traffic.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.env.ST_SOURCE;
const updateBranch = process.env.SM_UPDATE_BRANCH;
assert(source, 'ST_SOURCE must be an isolated pinned host without an extension symlink');
assert(updateBranch && !['main', 'develop'].includes(updateBranch), 'SM_UPDATE_BRANCH must name the published test PR branch');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
git(root, 'check-ref-format', '--branch', updateBranch);
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(git(source, 'rev-parse', 'HEAD'), revision);
await assert.rejects(lstat(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), { code: 'ENOENT' });
const repository = 'https://github.com/lambdadb/sillymemory';
const expected = ref => git(root, 'ls-remote', repository, `refs/heads/${ref}`).split(/\s+/)[0];
const mainSha = expected('main'), updateSha = expected(updateBranch);
assert(/^[a-f0-9]{40}$/.test(mainSha) && /^[a-f0-9]{40}$/.test(updateSha));
assert.notEqual(mainSha, updateSha, 'Update must advance to a different revision');
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-install-'));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const artifactTag = process.env.SM_ARTIFACT_TAG || 'install';
assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag));
const reportPath = path.join(artifacts, `${artifactTag}.json`);
await writeFile(reportPath, '{}', { flag: 'wx' });
const port = Number(process.env.ST_INSTALL_PORT || 18129), url = `http://127.0.0.1:${port}`;
const installed = path.join(work, 'data/default-user/extensions/sillymemory');
const report = { host: revision, repository, initialBranch: 'main', mainSha, updateBranch, updateSha, checks: [], api: [], pageErrors: [], proxyRequests: 0, passed: false };
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };
let server, browser, page;
try {
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'true'], { cwd: source, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 90; i++) { assert(server.exitCode === null, 'Host exited'); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    assert(ready, 'Host startup timeout');
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.route('**/proxy/**', route => { report.proxyRequests++; return route.abort(); });
    page.on('response', response => { if (/\/api\/extensions\/(install|update)$/.test(new URL(response.url()).pathname)) report.api.push({ operation: new URL(response.url()).pathname.split('/').at(-1), status: response.status() }); });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#third_party_extension_button').click();
    await page.locator('dialog[open] .popup-input').fill(repository);
    await page.getByText('Install just for me', { exact: true }).click();
    await page.getByText('Yes, install it', { exact: true }).click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 90000 });
    check('Git URL UI installation clones the public default branch', git(installed, 'rev-parse', 'HEAD') === mainSha && git(installed, 'branch', '--show-current') === 'main');
    check('user-scoped installation is a real Git checkout, not a symlink', !(await lstat(installed)).isSymbolicLink() && git(installed, 'remote', 'get-url', 'origin').replace(/\/$/, '') === repository);
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
    check('session key input clears after connecting', await field('key').inputValue() === '');
    const saved = await page.evaluate(() => { const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner; return { owner, state: localStorage.getItem(`sillymemory:state:${owner}`) }; });
    // Prepare a behind-the-remote test branch in this disposable installed clone.
    // GitHub main is never changed. The actual update still uses the host UI + git pull.
    git(installed, 'remote', 'set-branches', '--add', 'origin', updateBranch);
    git(installed, 'fetch', '--unshallow', 'origin');
    const updateBase = git(installed, 'merge-base', mainSha, updateSha);
    check('test update base has exactly the installed main tree', git(installed, 'rev-parse', `${updateBase}^{tree}`) === git(installed, 'rev-parse', `${mainSha}^{tree}`));
    report.updateBase = updateBase;
    git(installed, 'switch', '-c', updateBranch, updateBase);
    git(installed, 'branch', '--set-upstream-to', `origin/${updateBranch}`);
    await page.locator('#extensions_details').click();
    const block = page.locator('.extensions_info .extension_block').filter({ hasText: 'SillyMemory' });
    const updateResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/extensions/update', { timeout: 90000 });
    await block.locator('.btn_update').click();
    const response = await updateResponse; assert(response.ok(), 'Update API failed');
    check('real UI update pulls the candidate from GitHub', git(installed, 'rev-parse', 'HEAD') === updateSha && !(await response.json()).isUpToDate);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await settings();
    check('update reload preserves ownership and nonsecret configuration', await page.evaluate(saved => { const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner; return owner === saved.owner && localStorage.getItem(`sillymemory:state:${owner}`) === saved.state; }, saved));
    check('update reload clears the session key and leaves memory disabled', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('updated controls retain configured budget and recent messages', await field('recent').inputValue() === '14' && await field('budget').inputValue() === '600');
    const candidate = JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8'));
    check('candidate manifest version agrees with package version', candidate.version === JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')).version);
    report.updatedVersion = candidate.version;
    await page.locator('#extensions_details').click();
    check('extension manager displays the candidate version', (await page.locator('.extensions_info .extension_block').filter({ hasText: 'SillyMemory' }).innerText()).includes(candidate.version));
    await page.screenshot({ path: path.join(artifacts, `${artifactTag}.png`) });
    // Exercise detached-commit rollback in the disposable clone. Public tags do not exist yet.
    git(installed, 'switch', '--detach', mainSha);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await settings();
    check('commit rollback loads the previous build without changing owned settings', git(installed, 'rev-parse', 'HEAD') === mainSha && await field('budget').inputValue() === '600' && await page.evaluate(owner => SillyTavern.getContext().extensionSettings.sillymemory.owner === owner, saved.owner));
    git(installed, 'switch', updateBranch);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    check('returning to the test branch restores the candidate', git(installed, 'rev-parse', 'HEAD') === updateSha);
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    check('synthetic key is absent from persistent browser state', !persisted.includes('synthetic-release-session-key'));
    check('installation/update/rollback made no proxy requests or uncaught page errors', report.proxyRequests === 0 && report.pageErrors.length === 0);
    report.passed = true;
} catch (error) {
    report.failure = error.message;
    console.error('FAIL', error.message);
    await page?.screenshot({ path: path.join(artifacts, `${artifactTag}-failure.png`) }).catch(() => {});
    process.exitCode = 1;
} finally {
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    await rm(work, { recursive: true, force: true });
    report.localProfileRemoved = true;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
}
