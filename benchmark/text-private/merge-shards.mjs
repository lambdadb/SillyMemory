// Concatenate a local provider's prefix file and its row-range shards (precompute.mjs
// --suffix .sN) into OUT/<provider>.f32 and write the shared index.
//   node merge-shards.mjs --provider e5 --out DIR --shards 3 --index-from local
import assert from 'node:assert/strict';
import { appendFile, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { provider: { type: 'string' }, out: { type: 'string' }, shards: { type: 'string' },
    'index-from': { type: 'string' }, dims: { type: 'string', default: '384' } } });
const file = name => path.join(args.out, name), rowBytes = 4 * Number(args.dims);
// Every provider enumerates the same unique texts in the same order.
const keys = JSON.parse(await readFile(file(`${args['index-from']}-index.json`)));
const prefix = JSON.parse(await readFile(file(`${args.provider}-progress.json`)));
const parts = [{ data: `${args.provider}.f32`, rows: prefix.rows, progress: prefix }];
for (let i = 0; i < Number(args.shards); i++) {
    const progress = JSON.parse(await readFile(file(`${args.provider}.s${i}-progress.json`)));
    assert(progress.complete, `Shard ${i} incomplete`);
    parts.push({ data: `${args.provider}.s${i}.f32`, rows: progress.rows, progress });
}
for (const p of parts) assert.equal((await stat(file(p.data))).size, p.rows * rowBytes, `${p.data} size differs`);
assert.equal(parts.reduce((n, p) => n + p.rows, 0), keys.length, 'Merged row count differs');
const merged = file(`${args.provider}.merged.f32`);
await writeFile(merged, Buffer.alloc(0));
for (const p of parts) await appendFile(merged, await readFile(file(p.data)));
await rename(merged, file(`${args.provider}.f32`));
await writeFile(file(`${args.provider}-index.json`), JSON.stringify(keys));
const summary = { rows: keys.length, complete: true, parts: parts.map(p => ({ data: p.data, rows: p.rows, milliseconds: p.progress.milliseconds })) };
await writeFile(file(`${args.provider}-progress.json`), JSON.stringify(summary));
console.log(JSON.stringify(summary));
