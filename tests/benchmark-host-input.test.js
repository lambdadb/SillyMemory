import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { adaptLongMemEval, sha } from '../scripts/benchmark-audit.mjs';
import { prepareHostCase, sourceView, promptCoverage } from '../scripts/benchmark-host-input.mjs';

test('host adapter preserves empty turns, macro spellings and roles without labels', () => {
    const row = { question_id: 'fixture', question: 'When?', answer: 'SECRET',
        question_date: '2023/01/03 (Tue) 12:00', haystack_dates: ['2023/01/02 (Mon) 12:00'],
        haystack_session_ids: ['SECRET'], haystack_sessions: [[
            { role: 'assistant', content: '{{char}} literal', has_answer: true }, { role: 'user', content: '' }]] };
    const sample = { id: row.question_id, split: 'development', inputSha256: sha(JSON.stringify(adaptLongMemEval(row))) };
    const actual = prepareHostCase(row, sample);
    assert.equal(actual.chat[0].is_user, false);
    assert(actual.chat[0].mes.endsWith('{{char}} literal'));
    assert.equal(actual.chat[1].mes, '');
    assert(!JSON.stringify(actual).includes('SECRET'));
    assert.throws(() => prepareHostCase(row, { ...sample, split: 'evaluation' }), /held-out/);
    assert.throws(() => prepareHostCase({ ...row, question: 'Changed?' }, sample));
    const copy = structuredClone(actual.chat); copy[0].extra.memory = 'summary';
    assert.deepEqual(sourceView(copy), sourceView(actual.chat));
});

test('coverage distinguishes native roles from flattened text and ignores empty matches', () => {
    const chat = [{ mes: 'alpha', is_user: true }, { mes: 'beta', is_user: false }, { mes: '', is_user: true }];
    const coverage = promptCoverage(chat, [{ role: 'system', content: 'alpha' }, { role: 'assistant', content: 'beta' }]);
    assert.equal(coverage.exactTextMessages, 2);
    assert.equal(coverage.exactNativeRoleMessages, 1);
    assert.deepEqual(coverage.nativeSourceIndexes, [1]);
});

test('host network guard blocks HTTP, HTTPS and fetch before outbound transport', () => {
    const preload = new URL('../scripts/benchmark-loopback-guard.cjs', import.meta.url).pathname;
    execFileSync(process.execPath, ['--require', preload, '--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import http from 'node:http'; import https from 'node:https';
        assert.throws(() => http.get('http://example.invalid'), /loopback/);
        assert.throws(() => https.get('https://example.invalid'), /loopback/);
        await assert.rejects(fetch('https://example.invalid'), e => /loopback/.test(e.cause?.message));
        const server = http.createServer((req,res) => res.end('local'));
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        assert.equal(await (await fetch('http://127.0.0.1:' + server.address().port)).text(), 'local');
        await new Promise(r => server.close(r));
    `], { stdio: 'pipe' });
});
