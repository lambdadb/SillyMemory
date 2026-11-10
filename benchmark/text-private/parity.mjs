// Stage 1 (local only): analyzer parity and offline BM25-versus-sparse ranking parity
// against the Lucene 10.4.0 reference harness. No network or paid calls.
//   node benchmark/text-private/parity.mjs --dataset longmemeval_s_cleaned.json --out DIR \
//     --lucene-core lucene-core-10.4.0.jar --lucene-analysis lucene-analysis-common-10.4.0.jar
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prepareCase, recallQuery, sha256 } from '../longmemeval/protocol.mjs';
import { analyze as analyzeText } from './analyzer.mjs';
import { coverage, evidence } from './metrics.mjs';
import { AVERAGE_LENGTH, B, K1, documentFrequencies, documentWeights, featureFieldValue, queryWeights } from './sparse.mjs';

const memo = new Map();
const analyze = text => { let t = memo.get(text); if (!t) { t = analyzeText(text); memo.set(text, t); } return t; };
const { values: args } = parseArgs({ options: { dataset: { type: 'string' }, out: { type: 'string' },
    'lucene-core': { type: 'string' }, 'lucene-analysis': { type: 'string' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256, 'Dataset checksum mismatch');
const rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
await mkdir(args.out, { recursive: true });
const java = (mode, input, output) => execFileSync('java', ['-cp', `${args['lucene-core']}:${args['lucene-analysis']}`,
    path.join(here, 'LuceneParity.java'), mode, input, output], { stdio: 'inherit', maxBuffer: 1 << 30 });
const b64 = text => Buffer.from(text, 'utf8').toString('base64');

export const SYNTHETIC = [
    "I can't believe it's not butter; we'd've gone if they'd known.", "Don’t forget Sarah’s birthday — it's James' party.",
    "The dog's bone and the dogs' bones; CHRIS'S car; O'Neill's pub", 'Call 555-123-4567 or +1 (800) 555 0199 ext. 42.',
    'Version 3.14.159, 1,000,000 items, 2023/05/30 at 10:18, 4th of July, 1990s, $12.50, 50% off, 3x faster.',
    'Visit https://example.com/path/to_file.html?q=a&b=c#frag or www.foo-bar.org and email me@example.co.uk',
    'Emoji test 😀👍🏽 👨‍👩‍👧 🇰🇷 ❤️ ☕ ✔ © ® ™ #1 *', 'state-of-the-art well-known e-mail co-op re-enter x-ray T-shirt',
    '“Curly quotes” and ‘single’ ones; « guillemets »; „low“', 'Mixed scripts: 東京タワー ひらがな カタカナ 한국어 텍스트 ภาษาไทย Ελληνικά Русский',
    'Ünïcödé café naïve façade résumé İstanbul ǅemal ß Straße ﬁnance', 'snake_case camelCase PascalCase kebab-case CONSTANT_CASE __init__',
    'Running runners ran easily; happiness, relational, conditional, hopefulness, generalizations.',
    'A'.repeat(300) + ' ' + 'b1'.repeat(140), 'Tab\tseparated\nnew\r\nlines   and    spaces', 'U.S.A. e.g. i.e. Ph.D. a.m. p.m. No. 5',
    'C++ C# .NET node.js Node.JS v24.15.0 IPv6 ::1 192.168.0.1', 'The 3rd item, 21st century, 100km/h, 5\'11", 72°F, 1/2 cup',
    "Rock 'n' roll, 'quoted' words, ''double'' and trailing' apostrophe's", 'Hyphen‐nonbreaking‑figure‒en–em—minus−',
];

// ---- 1a: analyzer parity over unique LongMemEval chunk texts, queries and synthetic cases.
const prepared = new Map();
for (const row of rows) prepared.set(row.question_id, await prepareCase(row, config, '0'.repeat(64)));
const texts = new Map();
const add = (text, kind) => { if (!texts.has(text)) texts.set(text, kind); };
for (const p of prepared.values()) {
    add(recallQuery(p, config).query.bayesian[0].knn.queryText, 'query');
    for (const doc of p.docs) add(doc.text, 'chunk');
}
for (const text of SYNTHETIC) add(text, 'synthetic');
const list = [...texts.keys()];
await writeFile(path.join(args.out, 'analyze-input.b64'), list.map(b64).join('\n') + '\n');
java('analyze', path.join(args.out, 'analyze-input.b64'), path.join(args.out, 'analyze-lucene.txt'));
const lucene = (await readFile(path.join(args.out, 'analyze-lucene.txt'), 'utf8')).split('\n');
assert.equal(lucene.length - 1, list.length);

const classify = (a, b) => {
    const text = [...a, ...b].join(' ');
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|[\u{1F3FB}-\u{1F3FF}]/u.test(text)) return 'emoji';
    if (/[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u.test(text)) return 'southeast-asian';
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return 'cjk';
    if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text)) return 'other-script';
    if (/\p{N}/u.test(text)) return 'number';
    if (a.concat(b).some(t => t.length >= 255)) return 'long-token';
    return 'latin-other';
};
const multiset = terms => { const m = new Map(); for (const t of terms) m.set(t, (m.get(t) || 0) + 1); return m; };
const stats = {};
const examples = {};
for (let i = 0; i < list.length; i++) {
    const kind = texts.get(list[i]);
    const expected = lucene[i] === '' ? [] : lucene[i].split('\u0001'), actual = analyzeText(list[i]);
    const s = stats[kind] ||= { texts: 0, exact: 0, luceneTokens: 0, jsTokens: 0, intersection: 0, union: 0, mismatchClasses: {} };
    s.texts++; s.luceneTokens += expected.length; s.jsTokens += actual.length;
    const ea = multiset(expected), aa = multiset(actual);
    let inter = 0, union = 0;
    for (const key of new Set([...ea.keys(), ...aa.keys()])) {
        inter += Math.min(ea.get(key) || 0, aa.get(key) || 0); union += Math.max(ea.get(key) || 0, aa.get(key) || 0);
    }
    s.intersection += inter; s.union += union;
    if (expected.length === actual.length && expected.every((t, j) => t === actual[j])) { s.exact++; continue; }
    const onlyLucene = expected.filter(t => !aa.has(t)), onlyJs = actual.filter(t => !ea.has(t));
    const cls = onlyLucene.length || onlyJs.length ? classify(onlyLucene, onlyJs) : 'order-or-count';
    s.mismatchClasses[cls] = (s.mismatchClasses[cls] || 0) + 1;
    (examples[cls] ||= []).length < 12 && examples[cls].push({ kind, onlyLucene: onlyLucene.slice(0, 8), onlyJs: onlyJs.slice(0, 8),
        sample: kind === 'synthetic' ? list[i] : undefined });
}
for (const s of Object.values(stats)) { s.exactRate = s.exact / s.texts; s.tokenJaccard = s.intersection / s.union; }
await writeFile(path.join(args.out, 'analyzer-parity.json'), JSON.stringify({ stats, examples }, null, 2));
console.log(JSON.stringify(stats, null, 2));

// Length statistics for the fixed sparse length normalizer.
const lengths = [], fullLengths = [];
for (const [text, kind] of texts) if (kind === 'chunk') {
    const n = analyze(text).length; lengths.push(n); if (text.length >= 700) fullLengths.push(n);
}
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const lengthStats = { uniqueChunks: lengths.length, meanTerms: mean(lengths), nearFullChunks: fullLengths.length,
    meanTermsNearFull: mean(fullLengths), averageLengthConstant: AVERAGE_LENGTH };
console.log(lengthStats);

// ---- 1b: Lucene BM25 vs JS sparse dot product (FeatureField quantized), per question.
const HITS = 200;
const blocks = [];
for (const row of rows) {
    const p = prepared.get(row.question_id);
    blocks.push(`Q ${row.question_id} ${p.docs.length} ${HITS}`, ...p.docs.map(d => b64(d.text)), b64(recallQuery(p, config).query.bayesian[0].knn.queryText));
}
await writeFile(path.join(args.out, 'bm25-input.b64'), blocks.join('\n') + '\n');
java('bm25', path.join(args.out, 'bm25-input.b64'), path.join(args.out, 'bm25-lucene.txt'));
const luceneRanks = new Map((await readFile(path.join(args.out, 'bm25-lucene.txt'), 'utf8')).trim().split('\n').map(line => {
    const [id, rest = ''] = line.split('\t');
    return [id, rest ? rest.split(' ').map(x => Number(x.split(':')[0])) : []];
}));

function sparseRank(p, variant) {
    const terms = p.docs.map(d => analyze(d.text));
    const query = queryWeights(recallQuery(p, config).query.bayesian[0].knn.queryText, documentFrequencies(terms));
    if (!query) return [];
    const avg = variant === 'collection-avg' ? mean(terms.map(t => t.length)) : typeof variant === 'number' ? variant : AVERAGE_LENGTH;
    const scored = [];
    terms.forEach((t, i) => {
        let weights = documentWeights(t);
        if (!weights) return;
        if (variant === 'collection-avg' || typeof variant === 'number') {
            const norm = K1 * (1 - B + B * t.length / avg); weights = {};
            for (const [term, tf] of multiset(t)) weights[term] = tf * (K1 + 1) / (tf + norm);
        }
        let score = 0;
        for (const [term, w] of Object.entries(query)) if (weights[term]) score += w * (variant === 'unquantized' ? weights[term] : featureFieldValue(weights[term]));
        if (score > 0) scored.push([i, score]);
    });
    return scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, HITS).map(x => x[0]);
}
const overlap = (a, b, n) => { const s = new Set(a.slice(0, n)); return b.slice(0, n).filter(x => s.has(x)).length / Math.max(1, Math.min(n, a.length, b.length)); };
const ranking = {};
for (const variant of ['fixed-avg', 'collection-avg', 'unquantized', 86, 100]) {
    const r = { overlap10: 0, overlap50: 0, questions: 0, firstEvidenceSame: 0, firstEvidenceBetter: 0, firstEvidenceWorse: 0,
        evidenceAt50Lucene: 0, evidenceAt50Js: 0, sessionAt50Lucene: 0, sessionAt50Js: 0, top1Same: 0 };
    for (const row of rows) {
        const p = prepared.get(row.question_id), ev = evidence(row, p);
        const l = luceneRanks.get(row.question_id), j = sparseRank(p, variant);
        r.questions++; r.overlap10 += overlap(l, j, 10); r.overlap50 += overlap(l, j, 50); r.top1Same += l[0] === j[0];
        const cl = coverage(ev, l.slice(0, 50).map(i => p.docs[i].id)), cj = coverage(ev, j.slice(0, 50).map(i => p.docs[i].id));
        r.evidenceAt50Lucene += cl.partial + cl.complete > 0; r.evidenceAt50Js += cj.partial + cj.complete > 0;
        r.sessionAt50Lucene += cl.sessionHit; r.sessionAt50Js += cj.sessionHit;
        const fl = coverage(ev, l.map(i => p.docs[i].id)).firstEvidence, fj = coverage(ev, j.map(i => p.docs[i].id)).firstEvidence;
        if (fl === fj) r.firstEvidenceSame++; else if (fj !== null && (fl === null || fj < fl)) r.firstEvidenceBetter++; else r.firstEvidenceWorse++;
    }
    r.overlap10 /= r.questions; r.overlap50 /= r.questions;
    ranking[variant] = r;
}
await writeFile(path.join(args.out, 'ranking-parity.json'), JSON.stringify({ lengthStats, hits: HITS, ranking }, null, 2));
console.log(JSON.stringify(ranking, null, 2));
