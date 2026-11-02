import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trailRoutes, createTrailSigns } from '../src/trail-signs.js';
// Canvas stub: counts how many board textures get drawn.
let drawn = 0;
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => { drawn++; return { width: 0, height: 0, getContext: () => ctx }; } };
// Two straight 3 km runs, 2 km apart, so boards spread far beyond the sign range.
const run = (name, x) => ({ name, diff: 'easy', pts: Array.from({ length: 31 }, (_, i) => ({ x, z: i * 100 })) });
const routes = trailRoutes([run('A', 0), run('B', 2000)], () => 0);
const scene = new THREE.Scene();
const signs = createTrailSigns({ THREE, scene, routes, height: () => 0, diffOf: () => ({ color: '#0a0', label: 'Easy' }), range: 400 });
const boards = [];
signs.traverse(o => { if (o.isMesh && !o.isInstancedMesh) boards.push(o); });
assert(boards.length >= 20, 'boards are placed along both runs');
assert.equal(drawn, 0, 'no board texture is drawn before the camera is known');
signs.update(new THREE.Vector3(0, 0, 0));
const near = boards.filter(b => b.visible);
assert(near.length > 0 && near.length < boards.length / 2, 'only boards near the camera are shown');
assert(near.every(b => b.material.map), 'every shown board has its texture');
// Boards of the same run and kind share one texture; only those whose material has a board in range hold one.
const mats = new Set(boards.map(b => b.material)), held = [...mats].filter(m => m.map);
assert(held.length < mats.size, 'materials with no board in range hold no texture');
assert(held.every(m => near.some(b => b.material === m)), 'every held texture belongs to a board in range');
const first = near[0].material.map;
signs.update(new THREE.Vector3(2000, 0, 3000));
assert(!near[0].visible && near[0].material.map === null, 'leaving the area hides boards and frees their textures');
signs.update(new THREE.Vector3(2000, 0, 3010));
const drawsBefore = drawn; signs.update(new THREE.Vector3(2000, 0, 3015));
assert.equal(drawn, drawsBefore, 'small camera moves do not redraw boards');
const all = createTrailSigns({ THREE, scene, routes, height: () => 0, diffOf: () => ({ color: '#0a0', label: 'Easy' }) });
all.update(new THREE.Vector3());
all.traverse(o => { if (o.isMesh && !o.isInstancedMesh) assert(o.visible && o.material.map, 'with no range every board shows'); });
console.log(`Trail signs: ${near.length} of ${boards.length} boards shown near the camera, textures freed when out of range.`);
