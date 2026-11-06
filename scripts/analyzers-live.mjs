// Bounded live check of the text-analyzer setting against a real LambdaDB project.
// Creates at most two owned story collections and three small documents (managed
// embeddings, one reranked search, one lexical query), then deletes them and
// confirms absence. Credentials come from .env.local or SM_ENV_FILE; no generation calls.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LambdaClient, collectionAnalyzers, scopeFilter } = await import(path.join(root, 'src/client.js'));
const { ChatCollections } = await import(path.join(root, 'src/chat-collections.js'));
const { options } = await import(path.join(root, 'src/memory.js'));
const { analyzerNotice } = await import(path.join(root, 'src/status.js'));
const { poll } = await import(path.join(root, 'src/gate.js'));

const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY);
const owner = randomBytes(16).toString('hex');
const hex = () => randomBytes(16).toString('hex');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sets = a => [...a].sort().join(',');
const created = [];
const collections = new ChatCollections(client, owner, e => created.push(e), () => {});
const snapshot = () => ({ memory: { story: hex() }, chat: hex(), character: 'analyzers-live.png' });

try {
    // 1. A new story collection is created with the configured analyzers and reports them from the 201 path.
    const bilingual = options({ analyzers: ['english', 'korean'] });
    const storyA = snapshot();
    const entryA = await collections.ensure(storyA, undefined, bilingual);
    const getA = await client.get(entryA.collection);
    check('new collection created with english+korean', sets(entryA.analyzers) === 'english,korean' && sets(collectionAnalyzers(getA)) === 'english,korean', `server reports ${JSON.stringify(collectionAnalyzers(getA))}`);
    check('no notice when the setting matches', analyzerNotice(entryA.analyzers, bilingual.analyzers) === '');

    // 2. Korean lexical matching works on that collection.
    const docs = [
        { id: `${owner}-ko`, owner, scope: entryA.scope, revision: '1', text: '미라는 파란 나침반을 삼나무 아래에 숨겼다.' },
        { id: `${owner}-en`, owner, scope: entryA.scope, revision: '1', text: 'The weather in the harbor town was calm all week.' },
        { id: `${owner}-ko2`, owner, scope: entryA.scope, revision: '1', text: '항구 마을의 날씨는 일주일 내내 잔잔했다.' },
    ];
    await poll(async () => { await client.upsert(entryA.collection, docs, undefined, entryA.branch); return true; });
    let hits = [];
    const found = await poll(async () => { hits = await client.search(entryA.collection, owner, entryA.scope, '나침반을 어디에 숨겼지?', undefined, entryA.branch); return hits.length > 0; }, { attempts: 60, delayMs: 2000 }).then(() => true).catch(() => false);
    check('Korean query returns results', found, `${hits.length} hits`);
    check('Korean compass passage ranks first', hits[0]?.id === `${owner}-ko`);
    const lexical = await client.query(entryA.collection, { bool: [{ ...scopeFilter(owner, entryA.scope), occur: 'filter' }, { queryString: { query: '나침반', defaultField: 'text', skipSyntax: true }, occur: 'must' }] }, { branch: entryA.branch, size: 10 });
    check('lexical-only match on a Korean noun hits only the compass passage', lexical.length === 1 && lexical[0].id === `${owner}-ko`, `${lexical.length} lexical hits`);

    // 3. A story created with english only reports a mismatch once the setting changes; rebuild recreates it.
    const englishOnly = options({ analyzers: ['english'] });
    const storyB = snapshot();
    const entryB1 = await collections.ensure(storyB, undefined, englishOnly);
    check('second story created with english only', sets(entryB1.analyzers) === 'english');
    const entryB2 = await collections.ensure(storyB, undefined, bilingual);
    const notice = analyzerNotice(entryB2.analyzers, bilingual.analyzers);
    check('existing collection keeps english and the notice appears', sets(entryB2.analyzers) === 'english' && notice.includes('indexed with: english') && notice.includes('english, korean'), notice);
    await client.deleteOwnedCollection(entryB2.collection, owner, entryB2.scope);
    const entryB3 = await collections.ensure(storyB, undefined, bilingual);
    check('rebuild recreates the story collection with english+korean', entryB3.collection === entryB2.collection && sets(entryB3.analyzers) === 'english,korean' && analyzerNotice(entryB3.analyzers, bilingual.analyzers) === '');
} finally {
    for (const name of [...new Set(created.map(e => e.collection))]) {
        const entry = created.find(e => e.collection === name);
        try { await client.deleteOwnedCollection(name, owner, entry.scope); } catch (e) { console.log(`cleanup ${name}: ${e.message}`); }
        let gone = false;
        try { await client.get(name); } catch (e) { gone = e.status === 404; }
        check(`cleanup: ${name.slice(0, 16)}… deleted`, gone);
    }
    client.forget();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
