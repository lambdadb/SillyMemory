import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentHistory, summaryRequest, selectMemories, selectionRequest, replaceMemory } from '../scripts/segment-summary.mjs';
test('segment boundaries preserve each source message exactly once and keep recent dialogue outside summaries', () => {
    const messages = Array.from({ length: 87 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `source ${i}`, date: '2026/01/01' }));
    const { segments, recent } = segmentHistory(messages);
    assert.deepEqual(segments.map(s => [s.start, s.end]), [[0, 39], [39, 79], [79, 83]]);
    assert.deepEqual([...segments.flatMap(s => s.messages), ...recent], messages);
    assert.equal(recent[0].content, 'source 83');
    const request = summaryRequest({ ...segments[0], answer: 'secret', has_answer: true });
    assert(!JSON.stringify(request).includes('secret'));
});
test('selector sees all old memories but cannot invent IDs, duplicate selections or choose newest IDs', () => {
    const memories = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: `fact ${i}` }));
    const payload = JSON.parse(selectionRequest(memories, [], 'question')[1].content);
    assert.equal(payload.older.length, 5);
    assert.deepEqual(selectMemories(memories, '["m0","m3"]').map(m => m.id), ['m0', 'm3', 'm5', 'm6', 'm7']);
    for (const bad of ['["m0","m0"]', '["m0","m7"]', '["m0","invented"]', '{}']) assert.throws(() => selectMemories(memories, bad));
    assert.deepEqual(selectMemories(memories.slice(0, 4)), memories.slice(0, 4));
});
test('replacement preserves native shell and recent context and fails instead of truncating over-budget memory', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `message ${i}` }));
    const result = replaceMemory({ model: 'model', messages }, [{ id: 'a', text: 'fact' }], s => s.length);
    assert.deepEqual(result.body.messages.slice(0, 3), messages.slice(0, 3));
    assert.deepEqual(result.body.messages.slice(-6), messages.slice(-6));
    assert(!result.body.messages.some(m => m.content === 'message 3'));
    assert.throws(() => replaceMemory({ messages }, [], () => 4096), /exceed/);
});

test('tokenizer binding detects same-version implementation changes and rejects unpinned packages', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { createRequire } = await import('node:module');
    const { loadSummaryTokenizer } = await import('../scripts/segment-summary-tokenizer.mjs');
    const root = await mkdtemp(path.join(tmpdir(), 'summary-tokenizer-'));
    try {
        const dir = path.join(root, 'node_modules/tiktoken'); await mkdir(dir, { recursive: true });
        const pkg = version => JSON.stringify({ name: 'tiktoken', version, main: 'tiktoken.cjs' });
        await writeFile(path.join(dir, 'package.json'), pkg('1.0.22'));
        await writeFile(path.join(dir, 'tiktoken.cjs'), 'exports.get_encoding = () => ({ encode: s => [...s], free() {} });');
        await writeFile(path.join(dir, 'tiktoken_bg.cjs'), '// synthetic bridge');
        await writeFile(path.join(dir, 'tiktoken_bg.wasm'), 'synthetic vocabulary A');
        const require = createRequire(path.join(root, 'package.json'));
        const first = await loadSummaryTokenizer(require);
        assert.equal(first.count('abc'), 3); first.free();
        assert.deepEqual((await loadSummaryTokenizer(require)).identity, first.identity);
        await writeFile(path.join(dir, 'tiktoken_bg.wasm'), 'synthetic vocabulary B');
        assert.notDeepEqual((await loadSummaryTokenizer(require)).identity, first.identity);
        await writeFile(path.join(dir, 'package.json'), pkg('2.0.0'));
        await assert.rejects(loadSummaryTokenizer(require), /Unsupported tokenizer version/);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('400-character storage counts code points including spaces and preserves raw prefix', async () => {
    const { boundSummary } = await import('../scripts/segment-summary.mjs');
    const exact = '가 😀'.repeat(100) + 'x'.repeat(100);
    assert.equal(Array.from(exact).length, 400);
    assert.deepEqual(boundSummary(exact), { text: exact, originalCharacters: 400, storedCharacters: 400, truncated: false });
    assert.deepEqual(boundSummary(exact + ' omitted'), { text: exact, originalCharacters: 408, storedCharacters: 400, truncated: true });
});
test('Noul adapter preserves official rules and reference labels and accepts threshold ties', async () => {
    const { jevJudgeRequest, jevDecision } = await import('../scripts/segment-summary.mjs');
    for (const field of ['Correct Answer', 'Rubric', 'Explanation']) {
        const template = `Original rules.\n\nQuestion: __FROZEN_QUESTION__\n\n${field}: __FROZEN_REFERENCE__\n\nModel Response: __FROZEN_ANSWER__\n\nOriginal proposition? Answer yes or no only.`;
        const body = jevJudgeRequest(template, { question: 'Q', answer: 'R' }, 'A');
        assert.deepEqual(body.state, { Question: 'Q', [field]: 'R', 'Model Response': 'A' });
        assert.deepEqual(body.questions.correct, { type: 'noul', instructions: 'Original rules.\n\nOriginal proposition?' });
    }
    assert.throws(() => jevJudgeRequest('changed upstream format', {}, ''), /Unrecognized/);
    const response = p => ({ model: 'jev-1.13.0', answers: { correct: { type: 'noul', noul: p } }, usage: { input_tokens: 1 } });
    assert.deepEqual(jevDecision(response(0.5)), { probability: 0.5, correct: true });
    assert.equal(jevDecision(response(0.49)).correct, false);
    for (const p of [NaN, -0.1, 1.1, '0.9']) assert.throws(() => jevDecision(response(p)));
    assert.throws(() => jevDecision({ ...response(0.9), model: 'jev-latest' }), /version/);
});
