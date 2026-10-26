import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { generateTrees } from '../src/tree-placement.js';
import { createTreeStream } from '../src/tree-stream.js';
const config = { WIDTH: 800, DEPTH: 800, TREE_CHUNK: 200, TREE_STEP: 5, TREE_KEEP: 0.62, TREE_CELL: 10,
  LW: 80, LH: 80, LPX: 0.1, DEN: new Uint8Array(6400).fill(255),
  FLORA: { treeline: 880, conifer: 0.32, low: 520, rime: true, larch: 0, conifers: 'sakhalin', broadleaf: 'birch' },
  FIXED_HITS: [40, 40, 4], H: new Float32Array(81 * 81).fill(600), GX: 81,
  CX: 10, CZ: 10, MESH_ST: 1, MESH_X: 81, MESH_Z: 81 };
const result = generateTrees(config, 0, 0);
assert.deepEqual(generateTrees(config, 0, 0), result, 'placement is deterministic');
assert(result.fir.length + result.rime.length + result.card.length > 0);
const colliders = result.collisions.flatMap(([, values]) => Array.from({ length: values.length / 3 }, (_, i) => values.slice(i * 3, i * 3 + 3)));
assert.equal(colliders.length, result.fir.length + result.rime.length + result.card.length, 'every drawn tree retains a collider');
assert(colliders.every(([x, z]) => Math.hypot(x - 40, z - 40) >= 12), 'landmark clearings survive');
assert([...result.fir, ...result.rime, ...result.card].every(t => Math.abs(t[1] - 599.7) < 1e-6), 'placement uses the collision DEM');
const url = new URL('../src/tree-worker.js', import.meta.url).href;
const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(`
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
self.postMessage = data => parentPort.postMessage(data);
await import(${JSON.stringify(url)});
parentPort.on('message', data => self.onmessage({ data }));
`)}`));
try {
  const received = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  worker.postMessage({ config }); worker.postMessage({ ci: 0, cj: 0, key: '0,0' });
  const data = await received;
  assert.deepEqual(data.result, result, 'worker and fallback produce identical visuals and collision data');
  assert.equal(config.H.length, 81 * 81, 'main-thread DEM is never detached');
} finally { await worker.terminate(); }
let fake;
globalThis.Worker = class {
  constructor() { fake = this; this.messages = []; }
  postMessage(data) { this.messages.push(data); }
  terminate() { this.terminated = true; }
};
const stream = createTreeStream(config);
for (let i = 0; i < 10; i++) stream.request(i, 0);
stream.request(0, 0);
assert.equal(stream.stats().pending, 4, 'stream limits outstanding work and deduplicates requests');
fake.onmessage({ data: { key: '0,0', result } });
assert.equal(stream.stats().completed, 1);
assert.deepEqual(stream.take(0, 0), result);
assert.equal(stream.take(0, 0), undefined, 'a completed chunk is installed once');
fake.onmessage({ data: { key: '1,0', result } });
stream.prune(new Set()); assert.equal(stream.stats().ready, 0, 'discard completed work outside the desired forest');
fake.onerror(); assert.equal(stream.available, false); assert.equal(stream.stats().pending, 0);
assert(fake.terminated, 'failed workers release resources and allow synchronous fallback');
globalThis.Worker = class { constructor() { throw new Error('Worker unavailable'); } };
assert.equal(createTreeStream(config).available, false, 'unsupported workers allow synchronous fallback');
delete globalThis.Worker;
console.log('Tree worker: deterministic placement, clearings, colliders, DEM heights and fallback parity passed.');
