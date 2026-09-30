// Offline candidates and diagnostics only; no product import or provider calls.
import assert from 'node:assert/strict';
import { memoryMessages } from '../src/memory.js';
export const bundlePolicies = Object.freeze(['passage', 'previous-turn', 'adjacent-turns']);
const content = docs => memoryMessages(docs).map(message => message.mes).join('\n');

function localSource(expected) {
    const local = new Map(), messages = new Map();
    for (const doc of expected) {
        assert(!local.has(doc.id), 'Duplicate local document');
        assert(doc.owner === expected[0].owner && doc.scope === expected[0].scope, 'Mixed local memory scope');
        assert(Number.isInteger(doc.message) && doc.message >= 0 && Number.isInteger(doc.chunk) && doc.chunk >= 0, 'Invalid local coordinates');
        local.set(doc.id, doc);
        const parts = messages.get(doc.message) || []; parts.push(doc); messages.set(doc.message, parts);
    }
    for (const parts of messages.values()) {
        parts.sort((a, b) => a.chunk - b.chunk);
        assert(parts.every((doc, i) => doc.chunk === i && ['revision', 'speaker', 'role'].every(field => doc[field] === parts[0][field])), 'Incomplete or inconsistent local message');
    }
    return { local, messages };
}

export async function selectContextBundles(hits, expected, budget, policy, countTokens) {
    assert(bundlePolicies.includes(policy), 'Unknown context bundle policy');
    assert(Number.isFinite(budget) && budget >= 0, 'Invalid memory budget');
    const { local, messages } = localSource(expected), seen = new Set(), chosen = new Set();
    const passages = [], decisions = []; let tokens = 0;
    const count = async docs => {
        const text = content(docs), value = text ? await countTokens(text) : 0;
        assert(Number.isFinite(value) && value >= 0, 'Token counting unavailable');
        return value;
    };
    for (const [index, hit] of hits.entries()) {
        const doc = local.get(hit?.id), base = { rank: index + 1, seed: doc?.id ?? null };
        if (!doc || ['scope', 'owner', 'revision', 'text'].some(field => hit[field] !== doc[field])) {
            decisions.push({ ...base, reason: 'invalid-hit' }); continue;
        }
        if (seen.has(doc.id)) { decisions.push({ ...base, reason: 'duplicate-hit' }); continue; }
        seen.add(doc.id);
        const indices = policy === 'previous-turn' ? [doc.message - 1, doc.message]
            : policy === 'adjacent-turns' ? [doc.message - 1, doc.message, doc.message + 1] : [];
        const bundle = policy === 'passage' ? [doc] : indices.flatMap(i => messages.get(i) || []);
        const added = bundle.filter(part => !chosen.has(part.id));
        const trace = { ...base, bundle: bundle.map(part => part.id), added: added.map(part => part.id), beforeTokens: tokens };
        if (!added.length) { decisions.push({ ...trace, reason: 'already-covered' }); continue; }
        const trialTokens = await count([...passages, ...added]);
        if (trialTokens > budget) {
            decisions.push({ ...trace, reason: 'budget-exceeded', trialTokens, overBy: trialTokens - budget }); continue;
        }
        passages.push(...added); added.forEach(part => chosen.add(part.id)); tokens = trialTokens;
        decisions.push({ ...trace, reason: 'selected', trialTokens });
    }
    assert.equal(await count(passages), tokens); assert(tokens <= budget, 'Memory budget exceeded');
    return { passages, tokens, text: content(passages), messages: memoryMessages(passages), decisions,
        available: expected.map(doc => ({ id: doc.id, message: doc.message, chunk: doc.chunk, retrieved: seen.has(doc.id), selected: chosen.has(doc.id) })) };
}
