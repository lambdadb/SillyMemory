// Offline corpus/schedule preparation only. This module makes no service calls.
import assert from 'node:assert/strict';
import { candidateSchedule } from './context-candidate.mjs';
import { ablationSchedule } from './actor-ablation.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { capture, documents, options, retrievalQueries } from '../src/memory.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function fixtureFiles(version = 'natural-dialogue-v1') {
    const protocols = {
        'natural-dialogue-v1': ['docs/natural-dialogue-evaluation.md'],
        'speaker-attribution-v1': ['docs/speaker-attribution-evaluation.md', 'docs/speaker-attribution-perspective-v2.md'],
        'speaker-native-v1': ['docs/speaker-native-evaluation.md'],
        'long-dialogue-v1': ['docs/long-dialogue-evaluation.md'],
        'actor-candidate-v1': ['docs/context-candidate-evaluation.md', 'scripts/context-candidate.mjs', 'scripts/actor-ablation-eval.mjs', 'scripts/actor-ablation.mjs', 'scripts/actor-perspective.mjs'],
        'actor-ablation-v1': ['docs/actor-ablation-evaluation.md', 'scripts/actor-ablation.mjs', 'scripts/actor-ablation-eval.mjs', 'scripts/actor-perspective.mjs'],
        'actor-perspective-v1': ['docs/actor-perspective-evaluation.md', 'scripts/actor-perspective.mjs'],
    };
    assert(Object.hasOwn(protocols, version), 'Unknown evaluation fixture');
    return [`tests/fixtures/${version}.json`, ...protocols[version]];
}
export const loadNaturalFixture = (version = 'natural-dialogue-v1') => JSON.parse(readFileSync(new URL(`../${fixtureFiles(version)[0]}`, import.meta.url), 'utf8'));

export function naturalCases(fixture = loadNaturalFixture()) {
    const stories = new Map(fixture.stories.map(story => [story.id, story]));
    assert.equal(stories.size, fixture.stories.length, 'Duplicate story');
    assert.equal(new Set(fixture.cases.map(item => item.id)).size, fixture.cases.length, 'Duplicate case');
    return fixture.cases.map(item => {
        const story = stories.get(item.story); assert(story, 'Missing story');
        assert(['return', 'correction', 'reference', 'unknown'].includes(item.kind), 'Unknown case kind');
        const messages = [...story.messages, ...item.context.map((text, i) => ({ role: i % 2 ? 'assistant' : 'user', text }))];
        assert(messages.every(m => ['user', 'assistant'].includes(m.role) && m.text.trim()), 'Invalid source message');
        const source = messages.map(m => ({ mes: m.text, name: m.role === 'user' ? 'User' : story.character, is_user: m.role === 'user', is_system: false, send_date: 0, extra: {} }));
        assert(item.question.trim(), 'Question required');
        assert.equal(item.requiredEvidence.length === 0, item.kind === 'unknown', 'Only unknown cases lack an answer source');
        assert.equal(item.supersededEvidence.length > 0, item.kind === 'correction', 'Only correction cases have superseded sources');
        // Include the new user question in the host's recent-message window.
        const recentStart = messages.length + 1 - fixture.settings.recent;
        for (const evidence of [...item.requiredEvidence, ...item.supersededEvidence]) {
            assert(Number.isInteger(evidence.message) && evidence.message >= 0 && evidence.message < recentStart, 'Evidence must be outside recent memory');
            assert(evidence.quote && messages[evidence.message]?.text.includes(evidence.quote), 'Evidence quote must match its source');
            assert(![...messages.slice(recentStart).map(m => m.text), item.question].some(text => text.includes(evidence.quote)), 'Answer evidence leaked into recent context/question');
        }
        if (item.kind === 'correction') assert(Math.min(...item.requiredEvidence.map(e => e.message)) > Math.max(...item.supersededEvidence.map(e => e.message)), 'Correction must follow superseded evidence');
        return {
            id: item.id, story: item.story, language: story.language, kind: item.kind,
            input: { source, question: item.question, type: 'normal' },
            // Oracle data is separate from generation input. Never send this to a model.
            rubric: structuredClone({ requiredEvidence: item.requiredEvidence, supersededEvidence: item.supersededEvidence, answerRule: item.answerRule }),
        };
    });
}

export function naturalSchedule(fixture = loadNaturalFixture()) {
    const cases = naturalCases(fixture);
    if (fixture.version === 'actor-candidate-v1') return candidateSchedule(cases, fixture.settings.repetitions);
    if (fixture.version === 'actor-ablation-v1') return ablationSchedule(cases, fixture.settings.repetitions);
    return Array.from({ length: fixture.settings.repetitions }, (_, repetition) => cases.flatMap((item, i) =>
        ((i + repetition) % 2 ? ['on', 'off'] : ['off', 'on']).map(mode => ({
            id: `${item.id}/r${repetition + 1}/${mode}`, case: item.id, repetition: repetition + 1, mode,
        })))).flat();
}

export async function auditNaturalDialogue(fixture = loadNaturalFixture()) {
    const cases = naturalCases(fixture), config = options(fixture.settings), rows = [];
    for (const item of cases) {
        const chat = [...item.input.source, { mes: item.input.question, name: 'User', is_user: true, is_system: false, extra: {} }];
        const snapshot = capture({ chat, characterId: 0, characters: [{ avatar: `${item.story}.png` }], getCurrentChatId: () => item.id });
        const prepared = await documents(snapshot, 'synthetic-natural-protocol-owner', config);
        const evidence = item.rubric.requiredEvidence.map(ref => {
            const matches = prepared.docs.filter(doc => doc.message === ref.message && doc.text.includes(ref.quote));
            assert(matches.length, 'Ground truth is not indexable under current chunking/recent settings');
            return { message: ref.message, documentIds: matches.map(doc => doc.id) };
        });
        const queries = retrievalQueries(snapshot, item.input.type);
        assert.equal(queries[0], item.input.question, 'Normal retrieval must anchor on the question');
        rows.push({ case: item.id, sourceMessages: snapshot.messages.length, indexableChunks: prepared.docs.length, queries, requiredEvidence: evidence });
    }
    return { passed: true, kind: 'offline fixture audit', serviceCalls: 0, fixtureHash: hash(fixture), cases: cases.length, scheduledSamples: naturalSchedule(fixture).length, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    const args = process.argv.slice(2);
    assert([2, 4].includes(args.length) && args[0] === '--output' && args[1] && (args.length === 2 || args[2] === '--fixture'), 'Usage: node scripts/natural-dialogue.mjs --output artifacts/unique-plan.json [--fixture version]');
    const fixture = loadNaturalFixture(args[3]), audit = await auditNaturalDialogue(fixture);
    const sourceFiles = ['index.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/status.js', 'scripts/natural-dialogue.mjs', ...fixtureFiles(fixture.version)];
    const sourceSha256 = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
    const plan = { version: fixture.version, settings: fixture.settings, generation: fixture.generation, sourceSha256, audit, cases: naturalCases(fixture), schedule: naturalSchedule(fixture), results: null };
    const output = path.resolve(args[1]); await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(plan, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ output, kind: audit.kind, passed: audit.passed, cases: audit.cases, scheduledSamples: audit.scheduledSamples, serviceCalls: audit.serviceCalls, fixtureHash: audit.fixtureHash }));
}
