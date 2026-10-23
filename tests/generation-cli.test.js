import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('unsupported generation modes fail before credentials, host startup or provider work', () => {
    const script = fileURLToPath(new URL('../scripts/generation-smoke.mjs', import.meta.url));
    for (const args of [['--natural'], ['--summarize'], ['--hybrid'], ['--live-model', '--live-model']]) {
        const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, SM_ENV_FILE: '/missing/synthetic-credentials.env' } });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Usage: node scripts\/generation-smoke.mjs \[--live-model\]/);
        assert(!result.stderr.includes('ENOENT'));
    }
});
