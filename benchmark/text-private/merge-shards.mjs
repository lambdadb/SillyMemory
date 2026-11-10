// Concatenate a local provider's prefix file and its row-range shards (precompute.mjs
// --suffix .sN) into OUT/<provider>.f32 and write the shared index.
//   node merge-shards.mjs --provider e5 --out DIR --shards 3 --index-from local
// Without a prefix file (<provider>-progress.json absent), only the shards are merged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { provider: { type: 'string' }, out: { type: 'string' }, shards: { type: 'string' },
    'index-from': { type: 'string' }, dims: { type: 'string', default: '384' }, 'remove-shards': { type: 'boolean' } } });
const file = name => path.join(args.out, name), rowBytes = 4 * Number(args.dims);
// Every provider enumerates the same unique texts in the same order.
const keys = JSON.parse(await readFile(file(`${args['index-from']}-index.json`)));
const prefix = await readFile(file(`${args.provider}-progress.json`)).then(JSON.parse, () => null);
const parts = prefix ? [{ data: `${args.provider}.f32`, rows: prefix.rows, progress: prefix }] : [];
for (let i = 0; i < Number(args.shards); i++) {
    const progress = JSON.parse(await readFile(file(`${args.provider}.s${i}-progress.json`)));
    assert(progress.complete, `Shard ${i} incomplete`);
    parts.push({ data: `${args.provider}.s${i}.f32`, rows: progress.rows, progress });
}
const keysSha256 = createHash('sha256').update(JSON.stringify(keys)).digest('hex');
for (const p of parts) assert.equal((await stat(file(p.data))).size, p.rows * rowBytes, `${p.data} size differs`);
// Parts must share the index ordering and cover [0, keys.length) contiguously, in order.
let at = 0;
for (const [n, p] of parts.entries()) {
    assert.equal(p.progress.keysSha256, keysSha256, `${p.data} row ordering differs`);
    assert.equal(p.progress.start, at, `${p.data} does not start where the previous part ends`);
    if (!(prefix && n === 0)) assert.equal(p.rows, p.progress.end - p.progress.start, `${p.data} rows differ from its range`);
    at += p.rows;
}
assert.equal(parts.reduce((n, p) => n + p.rows, 0), keys.length, 'Merged row count differs');
const merged = file(`${args.provider}.merged.f32`);
await writeFile(merged, Buffer.alloc(0));
for (const p of parts) await appendFile(merged, await readFile(file(p.data)));
assert.equal((await stat(merged)).size, keys.length * rowBytes, 'Merged size differs');
await rename(merged, file(`${args.provider}.f32`));
// --remove-shards: delete shard vectors only after the size-checked merge.
if (args['remove-shards']) for (const p of parts.slice(prefix ? 1 : 0)) await unlink(file(p.data));
await writeFile(file(`${args.provider}-index.json`), JSON.stringify(keys));
const summary = { rows: keys.length, complete: true, keysSha256, start: 0, end: keys.length, parts: parts.map(p => ({ data: p.data, rows: p.rows, milliseconds: p.progress.milliseconds })) };
await writeFile(file(`${args.provider}-progress.json`), JSON.stringify(summary));
console.log(JSON.stringify(summary));
