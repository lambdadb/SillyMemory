import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { adaptLongMemEval } from '../../scripts/benchmark-audit.mjs';
import { literalBenchmarkText } from '../../scripts/benchmark-development-input.mjs';
import { archiveBoundary, documents, memoryMessages, packedMemoryMessages } from '../../src/memory.js';
import { scopeFilter } from '../../src/client.js';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function recordResponse(file, response, metadata, clean = text => text) {
    const saved = { ...metadata, status: response.status, rawResponse: await response.text() };
    async function persist() {
        await writeFile(file + '.tmp', clean(JSON.stringify(saved)));
        await rename(file + '.tmp', file);
    }
    await persist();
    assert.equal(response.status, 200, `Provider HTTP ${response.status}; receipt retained`);
    saved.response = JSON.parse(saved.rawResponse);
    await persist();
    return saved.response;
}
export async function prepareCase(row, config, owner = sha256(row.question_id)) {
    const source = adaptLongMemEval(row);
    source.messages = source.messages.map(m => ({ ...m, content: literalBenchmarkText(m.content) }));
    source.question = literalBenchmarkText(source.question);
    const messages = [...source.messages, { role: 'user', content: source.question }].map((m, index) => ({
        index, text: m.content, name: m.role === 'user' ? 'User' : 'Assistant', user: m.role === 'user', swipe: 0, eligible: true,
    }));
    const snapshot = { character: 'longmemeval', chat: row.question_id, memory: { story: row.question_id }, messages };
    const boundary = archiveBoundary(snapshot);
    const { docs, scope } = await documents(snapshot, owner, { chunkChars: config.retrieval.chunkCharacters, archiveBefore: boundary });
    const times = row.haystack_sessions.flatMap((session, i) => session.map(() => ({
        benchmarkSession: i + 1, benchmarkDate: row.haystack_dates[i],
    })));
    return { id: row.question_id, owner, scope, boundary, question: source.question,
        docs: docs.map(d => ({ ...d, ...times[d.message] })), recent: source.messages.slice(boundary) };
}

export function recallQuery(prepared, config) {
    const queryText = `User: ${prepared.question}`, filter = scopeFilter(prepared.owner, prepared.scope);
    filter.queryString.query += ` AND message:[0 TO ${prepared.boundary - 1}]`;
    assert(prepared.boundary > 0 && Buffer.byteLength(queryText) <= 8192, 'Unsupported retrieval input');
    return { size: config.retrieval.final, query: { bayesian: [
        { knn: { field: 'embedding', queryText, k: config.retrieval.k, filter } },
        { bool: [{ ...filter, occur: 'filter' }, { queryString: { query: queryText, defaultField: 'text', skipSyntax: true }, occur: 'must' }] },
    ] }, rerank: { provider: 'typesafe', model: config.retrieval.reranker, queryText,
        fields: config.retrieval.rerankFields, candidateSize: config.retrieval.candidates, onFailure: 'error' },
    consistentRead: true, includeVectors: false, ref: { kind: 'branch', name: 'main' } };
}

export function returnedDocs(result, prepared, config) {
    assert(result.isDocsInline !== false && Array.isArray(result.docs));
    assert(result.docs.length <= config.retrieval.final);
    assert.equal(new Set(result.docs.map(h => h.doc.id)).size, result.docs.length);
    const rerank = result.rerank;
    assert.equal(rerank?.model, config.retrieval.reranker); assert.equal(rerank.provider, 'typesafe');
    assert.equal(rerank.status, 'applied'); assert.equal(rerank.scoredCount, rerank.candidateCount);
    assert(Number.isSafeInteger(rerank.candidateCount) && rerank.candidateCount >= result.docs.length
        && rerank.candidateCount <= config.retrieval.candidates);
    const byId = new Map(prepared.docs.map(doc => [doc.id, doc]));
    return result.docs.map(hit => {
        assert(Number.isFinite(hit.score) && Number.isFinite(hit.retrievalScore));
        const doc = byId.get(hit.doc.id); assert(doc, 'Unknown returned source');
        for (const [key, value] of Object.entries(doc)) assert.deepEqual(hit.doc[key], value, `Returned source differs: ${key}`);
        return doc;
    });
}

// Session clocks are rendering provenance, never native message timestamps.
function render(passages, config, packed) {
    const display = passages.map(d => ({ ...d,
        conversationTimestamp: d.benchmarkDate.replace(/^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]+\) /, '$1-$2-$3 '),
        timestampSource: `benchmark-session-${d.benchmarkSession}`,
    }));
    const messages = (packed ? packedMemoryMessages : memoryMessages)(display);
    if (messages.length) {
        const at = messages[0].mes.indexOf('\n') + 1;
        messages[0].mes = messages[0].mes.slice(0, at) + config.prompts.date + '\n' + messages[0].mes.slice(at);
    }
    return messages.map(m => m.mes).join('\n');
}

export function requestFor(prepared, hits, config, countTokens) {
    const count = text => {
        const n = countTokens(text); assert(Number.isSafeInteger(n) && n >= 0); return n;
    };
    const cost = text => text ? count(config.prompts.packingGuidance + '\n' + text) + 6 : 0;
    const selected = []; let text = '', reservedTokens = 0;
    for (const hit of hits) {
        const next = [...selected, hit], separate = render(next, config, false), packed = render(next, config, true);
        const candidate = cost(packed) < cost(separate) ? packed : separate, tokens = cost(candidate);
        if (tokens <= config.retrieval.memoryTokens) { selected.push(hit); text = candidate; reservedTokens = tokens; }
    }
    const memory = text ? [{ role: 'user', content: config.prompts.archivePrefix + text }] : [];
    const memoryTokens = memory.length ? count(config.prompts.guidance + '\n' + memory[0].content) + 6 : 0;
    assert(memoryTokens <= config.retrieval.memoryTokens, 'Quoted memory exceeds budget');
    const body = { ...config.generator, messages: [
        { role: 'system', content: config.prompts.system },
        ...memory, ...prepared.recent, { role: 'user', content: prepared.question },
        { role: 'system', content: config.prompts.guidance },
    ] };
    return { body, selectedIds: selected.map(d => d.id), reservedTokens, memoryTokens, requestSha256: sha256(JSON.stringify(body)) };
}
export function judgeRequest(row, response, rule, config) {
    assert(typeof response === 'string' && response.trim());
    return { model: config.judge.model,
        state: { Question: row.question, [rule.referenceField]: row.answer, 'Model Response': response },
        questions: { correct: { type: 'noul', instructions: rule.instructions } } };
}
export function verdict(result, config) {
    assert.equal(result?.model, config.judge.model);
    assert.deepEqual(Object.keys(result.answers || {}), ['correct']);
    const answer = result.answers.correct;
    assert.equal(answer.type, 'noul');
    assert(Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1);
    assert(Number.isSafeInteger(result.usage?.input_tokens) && result.usage.input_tokens >= 0);
    return { probability: answer.noul, correct: answer.noul >= config.judge.threshold };
}

export function summarizeResources({ answers, judgments, database, operations, indexedDocuments, memoryMilliseconds }) {
    const milliseconds = value => { assert(Number.isFinite(value) && value >= 0); return value; };
    const tokens = value => { assert(Number.isSafeInteger(value) && value >= 0); return value; };
    const models = (receipts, input, output) => ({
        calls: receipts.length,
        inputTokens: receipts.reduce((sum, r) => sum + tokens(r.response.usage[input]), 0),
        outputTokens: receipts.some(r => r.response.usage[output] === undefined) ? null
            : receipts.reduce((sum, r) => sum + tokens(r.response.usage[output]), 0),
        responseHeaderMilliseconds: receipts.reduce((sum, r) => sum + milliseconds(r.milliseconds), 0),
    });
    assert.equal(database.length, operations);
    return {
        generation: models(answers, 'prompt_tokens', 'completion_tokens'),
        judging: models(judgments, 'input_tokens', 'output_tokens'),
        memory: { indexedDocuments: tokens(indexedDocuments), databaseOperations: tokens(operations),
            httpResponseMilliseconds: database.reduce((sum, r) => sum + milliseconds(r.milliseconds), 0),
            ingestRetrievePackMilliseconds: milliseconds(memoryMilliseconds) },
        billedCostUsd: null,
    };
}
