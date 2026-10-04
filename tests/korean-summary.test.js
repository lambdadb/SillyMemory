import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cases, grade } from '../scripts/korean-fixture.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

function segment(mode) {
    const item = cases[0], answer = 'UNKNOWN', id = `${item.id}/${mode}`;
    const row = { case: item.id, mode, question: item.question, answer, ...grade(answer, item), promptTokens: 100, generationMs: 20, providerMs: 10, injected: false, memoryTokens: 0 };
    return { cleanupComplete: true, model: 'synthetic-model', sillyTavern: 'synthetic-host', hostContextTokens: 8192, maxOutputTokens: 256,
        sourceSha256: Object.fromEntries(['index.js', 'src/client.js', 'vendor/lambdadb.js', 'package-lock.json', 'src/gate.js', 'src/memory.js', 'src/context.js', 'scripts/korean-fixture.mjs'].map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])),
        checks: ['identical uncontaminated source restored', 'original conversation preserved by generation', 'edited/deleted source text absent from outgoing prompt', mode === 'off' ? 'full source fits the baseline context' : 'recent complete messages retained'].map(s => `${id}: ${s}`),
        generations: [{ evaluation: row, upstreamStatus: 200, finishReason: 'stop', providerAnswer: answer, answer, providerUsage: {prompt_tokens:100}, generationMs:20, responseMs:10, requestOptions:{model:'synthetic-model',temperature:0} }] };
}

test('Korean CLI rejects missing, mixed and outdated context hashes while accepting matching segments', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sillymemory-summary-'));
    try {
        const first = segment('off'), second = segment('on');
        const inputs = [path.join(dir, 'off.json'), path.join(dir, 'on.json')];
        const run = () => {
            [first, second].forEach((r, i) => writeFileSync(inputs[i], JSON.stringify(r)));
            return spawnSync(process.execPath, ['scripts/korean-summary.mjs', ...inputs, '--allow-partial', '--output', path.join(dir, 'summary.json')], {cwd:root,encoding:'utf8'});
        };
        assert.equal(run().status, 0);
        second.sourceSha256['src/context.js'] = '0'.repeat(64);
        let result = run(); assert.notEqual(result.status,0); assert.match(result.stderr,/Cannot combine different runtime or fixture sources/);
        delete second.sourceSha256['src/context.js'];
        result = run(); assert.notEqual(result.status,0); assert.match(result.stderr,/Missing source hash: src\/context.js/);
        first.sourceSha256['src/context.js'] = second.sourceSha256['src/context.js'] = '0'.repeat(64);
        result = run(); assert.notEqual(result.status,0); assert.match(result.stderr,/Current runtime\/fixture differs from evaluated inputs/);
    } finally { rmSync(dir, {recursive:true,force:true}); }
});
