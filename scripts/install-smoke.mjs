// Real GitHub clone/pull through the pinned host UI. Optional live memory; no model calls.
import { installMemory } from './install-memory.mjs';
import { parseEnv } from 'node:util';
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
const updateBranch = process.env.SM_UPDATE_BRANCH;
const liveMemory = process.argv.includes('--live-memory');
const env = liveMemory ? parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8')) : {};
const credentials = liveMemory ? { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY } : null;
if (liveMemory) assert(Object.values(credentials).every(Boolean), 'Missing LambdaDB credentials');
assert(source, 'ST_SOURCE must be an isolated pinned host without an extension symlink');
assert(updateBranch && !['main', 'develop'].includes(updateBranch), 'SM_UPDATE_BRANCH must name the published test PR branch');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
git(root, 'check-ref-format', '--branch', updateBranch);
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(git(source, 'rev-parse', 'HEAD'), revision);
for (const folder of ['sillymemory', 'SillyMemory']) await assert.rejects(lstat(path.join(source, 'public/scripts/extensions/third-party', folder)), { code: 'ENOENT' });
const repository = 'https://github.com/lambdadb/SillyMemory';
const installFolder = 'SillyMemory';
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
const installed = path.join(work, 'data/default-user/extensions', installFolder);
const entries = [], pendingPath = path.join(artifacts, `${artifactTag}-pending.json`);
if (liveMemory) await writeFile(pendingPath, '[]', { flag: 'wx' });
const redact = value => { let result = JSON.stringify(value, null, 2); for (const secret of Object.values(credentials || {})) result = result.replaceAll(secret, '[REDACTED]'); return result; };
const harnessSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const report = { liveMemory, cleanupComplete: !liveMemory, helperSha256: createHash('sha256').update(await readFile(new URL('./install-memory.mjs', import.meta.url))).digest('hex'), harnessSha256, host: revision, repository, installFolder, initialBranch: 'main', mainSha, updateBranch, updateSha, checks: [], api: [], pageErrors: [], proxyRequests: 0, directRequests: 0, traffic: { legacy: { proxy: 0, direct: 0 }, candidate: { proxy: 0, direct: 0 }, rollback: { proxy: 0, direct: 0 } }, passed: false };
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };
let server, browser, page, memory, phase = 'legacy';
try {
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    async function startHost(enableProxy) {
        server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', String(enableProxy)], { cwd: source, stdio: 'ignore' });
        let ready = false;
        for (let i = 0; i < 90; i++) { assert(server.exitCode === null, 'Host exited'); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
        assert(ready, 'Host startup timeout');
    }
    // Only the published 0.1.0 live setup still requires the old host proxy.
    await startHost(liveMemory);
    // The host default automatically polls remote Horde. Installation requires
    // no model connection; keep this profile offline, as in the live harness.
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai'; await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('dialog', dialog => { void dialog.accept().catch(error => report.pageErrors.push(error.message)); });
    const observeMemory = async route => {
        const req = route.request(), requestUrl = new URL(req.url());
        const proxy = requestUrl.origin === url && requestUrl.pathname.startsWith('/proxy/');
        const transport = proxy ? 'proxy' : 'direct';
        report[proxy ? 'proxyRequests' : 'directRequests']++;
        report.traffic[phase][transport]++;
        if (!liveMemory) return route.abort();
        try {
            assert(!(phase === 'candidate' && proxy), 'Updated client must not use the host proxy');
            const target = proxy ? new URL(decodeURIComponent(requestUrl.pathname.slice('/proxy/'.length))) : requestUrl;
            assert.equal(target.origin, new URL(credentials.endpoint).origin);
            if (req.method() === 'POST' && target.pathname.endsWith('/collections')) {
                assert(entries.length < 4, 'Live installation collection bound'); const body = req.postDataJSON();
                entries.push({ collection: body.collectionName, owner: body.tags.owner, scope: body.tags.chat, transport });
                await writeFile(pendingPath, JSON.stringify(entries, null, 2));
            }
            await route.continue();
        } catch (error) { report.pageErrors.push(error.message); await route.abort().catch(() => {}); }
    };
    await page.route('**/proxy/**', observeMemory);
    if (liveMemory) await page.route(`${new URL(credentials.endpoint).origin}/**`, observeMemory);
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
    check('installed directory preserves the requested repository spelling', (await readdir(path.dirname(installed))).includes(installFolder));
    report.initialVersion = JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8')).version;
    report.rollbackTag = `v${report.initialVersion}`;
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
    if (liveMemory) { memory = installMemory({ page, field, settings, check, credentials, entries }); await memory.beforeUpdate(); }
    const saved = await page.evaluate(() => { const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner; return { owner, state: localStorage.getItem(`sillymemory:state:${owner}`) }; });
    // Prepare a behind-the-remote test branch in this disposable installed clone.
    // GitHub main is never changed. The actual update still uses the host UI + git pull.
    git(installed, 'remote', 'set-branches', '--add', 'origin', updateBranch);
    git(installed, 'fetch', '--unshallow', 'origin');
    git(installed, 'fetch', 'origin', 'tag', report.rollbackTag);
    report.rollbackSha = git(installed, 'rev-parse', `${report.rollbackTag}^{commit}`);
    check('published baseline tag matches the installed main revision', report.rollbackSha === mainSha);
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
    if (liveMemory) {
        server.kill('SIGTERM'); await new Promise(r => server.once('exit', r));
        await startHost(false);
        const response = await fetch(`${url}/proxy/${encodeURIComponent(`${credentials.endpoint}/projects/${credentials.project}/collections`)}`);
        check('host proxy is disabled before upgraded memory is enabled', response.status === 404 && (await response.text()).includes('CORS proxy is disabled'));
    }
    phase = 'candidate';
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await settings();
    const upgraded = await page.evaluate(() => { const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner; return { owner, state: JSON.parse(localStorage.getItem(`sillymemory:state:${owner}`)) }; });
    assert.equal(upgraded.owner, saved.owner);
    // Preserve legacy values and the cleanup pointer while adding documented defaults.
    const previous = JSON.parse(saved.state);
    assert.deepEqual(upgraded.state, { ...previous, enabled: false, stopOnLoss: true, chatCollections: [], ready: Boolean(previous.collection) });
    check('update reload preserves ownership, settings and cleanup pointers with documented collection defaults', true);
    check('update reload clears the session key and leaves memory disabled', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('updated controls retain configured budget and recent messages', await field('recent').inputValue() === '14' && await field('budget').inputValue() === '600');
    check('0.1.0 upgrades enable the missing-context stop by default', await field('stopOnLoss').isChecked());
    await field('stopOnLoss').uncheck();
    // Flush the real host save path before reloading the isolated profile.
    await page.evaluate(async () => { const { saveSettings } = await import('/script.js'); await saveSettings(); });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' }); await settings();
    check('explicit warning-only preference survives reload', !await field('stopOnLoss').isChecked());
    check('updated settings link to the canonical source and license', await page.locator('#sillymemory a', { hasText: 'Source' }).getAttribute('href') === repository && await page.locator('#sillymemory a', { hasText: 'AGPL-3.0-only' }).getAttribute('href') === `${repository}/blob/main/LICENSE`);
    check('candidate panel explains direct CORS without a host proxy setup', (await page.locator('#sillymemory').innerText()).includes('No SillyTavern proxy setting or restart is needed.'));
    if (memory) { await memory.afterUpdate(); await memory.cleanup(); report.cleanupComplete = true; await rm(pendingPath); }
    const candidate = JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8'));
    check('candidate manifest version agrees with package version', candidate.version === JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')).version);
    report.updatedVersion = candidate.version;
    await page.locator('#extensions_details').click();
    await page.getByText('Loading third-party extensions... Please wait...', { exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].some(d => d.querySelector('.extensions_info') && Number(getComputedStyle(d).opacity) === 1));
    check('extension manager displays the candidate version', (await page.locator('.extensions_info .extension_block').filter({ hasText: 'SillyMemory' }).innerText()).includes(candidate.version));
    if (!liveMemory) await page.screenshot({ path: path.join(artifacts, `${artifactTag}.png`) });
    // Exercise the published baseline tag only in the disposable clone.
    phase = 'rollback';
    git(installed, 'switch', '--detach', report.rollbackTag);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await settings();
    check('published-tag rollback loads the previous version without changing owned settings', git(installed, 'rev-parse', 'HEAD') === report.rollbackSha && JSON.parse(await readFile(path.join(installed, 'manifest.json'), 'utf8')).version === report.initialVersion && await field('budget').inputValue() === '600' && await page.evaluate(owner => SillyTavern.getContext().extensionSettings.sillymemory.owner === owner, saved.owner));
    git(installed, 'switch', updateBranch);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    check('returning to the test branch restores the candidate', git(installed, 'rev-parse', 'HEAD') === updateSha);
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    check('session keys are absent from persistent browser state', !persisted.includes('synthetic-release-session-key') && (!credentials || !persisted.includes(credentials.key)));
    if (liveMemory) check('real key is absent from persisted host settings', !(await readFile(profilePath, 'utf8')).includes(credentials.key));
    check('installation/update/rollback has no uncaught page errors or unexpected proxy traffic', report.pageErrors.length === 0 && report.traffic.candidate.proxy === 0 && (liveMemory ? report.traffic.legacy.proxy > 0 && report.traffic.candidate.direct > 0 : report.proxyRequests === 0 && report.directRequests === 0));
    if (liveMemory) check('both legacy and direct collection creation are journaled within the four-collection bound', entries.filter(e => e.transport === 'proxy').length === 2 && entries.filter(e => e.transport === 'direct').length === 2);
    report.passed = true;
} catch (error) {
    report.failure = error.message;
    report.lastStatus = await page?.locator('[data-sm="status"]').textContent().catch(() => 'unavailable');
    report.createdCollections = entries.length;
    await writeFile(reportPath, redact(report));
    console.error('FAIL', liveMemory ? error.name : error.message);
    if (!liveMemory) await page?.screenshot({ path: path.join(artifacts, `${artifactTag}-failure.png`) }).catch(() => {});
    process.exitCode = 1;
} finally {
    if (liveMemory && !report.cleanupComplete) {
        try {
            if (entries.length) { assert(memory, 'Cleanup adapter unavailable'); await memory.cleanup(); }
            report.cleanupComplete = true; await rm(pendingPath);
        } catch (error) { report.cleanupFailure = error.message; report.cleanupComplete = false; report.passed = false; process.exitCode = 1; }
    }
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    if (report.cleanupComplete) { await rm(work, { recursive: true, force: true }); report.localProfileRemoved = true; }
    else { report.localProfileRemoved = false; report.recoveryProfile = work; }
    report.createdCollections = entries.length;
    await writeFile(reportPath, redact(report));
}
