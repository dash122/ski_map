import assert from 'node:assert/strict';
import * as THREE from 'three';
import { terrainLevel, createRenderDetail, createTreeDetail, selectTreeDetail } from '../src/render-detail.js';
import { selectVisibleVisitors } from '../src/visitor-avatars.js';

const width = 12, height = 10;
const positions = new Float32Array(width * height * 3);
for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) positions.set([x * 10, 0, z * 10], (z * width + x) * 3);
const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
for (const step of [1, 2, 4, 8]) {
  const level = terrainLevel(geometry.attributes.position, width, 0, 0, width - 1, height - 1, step);
  assert.equal(level.error, 0, 'flat terrain has zero approximation error');
  let area = 0;
  const edges = new Map();
  for (let i = 0; i < level.indices.length; i += 3) {
    const ids = level.indices.slice(i, i + 3);
    const [a, b, c] = ids.map(id => [id % width, Math.floor(id / width)]);
    const signed = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    assert(signed > 0, 'triangles face up and are nondegenerate'); area += signed / 2;
    for (let j = 0; j < 3; j++) {
      const key = [ids[j], ids[(j + 1) % 3]].sort((a, b) => a - b).join(',');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.equal(area, (width - 1) * (height - 1), 'no missing or overlapping terrain area');
  const boundary = [...edges].filter(([, count]) => count === 1).map(([key]) => key).sort();
  const expected = [];
  for (let x = 0; x < width - 1; x++) { expected.push(`${x},${x + 1}`); expected.push(`${(height - 1) * width + x},${(height - 1) * width + x + 1}`); }
  for (let z = 0; z < height - 1; z++) { expected.push(`${z * width},${(z + 1) * width}`); expected.push(`${z * width + width - 1},${(z + 1) * width + width - 1}`); }
  assert.deepEqual(boundary, expected.sort(), 'all levels have identical full-resolution tile edges');
}
const detail = createRenderDetail(), scene = new THREE.Scene();
detail.addGrid({ scene, geometry, material: new THREE.MeshBasicMaterial(), width, height, tile: 8 });
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
camera.position.set(50, 50, 120); camera.lookAt(50, 0, 30); camera.updateMatrixWorld();
detail.update(camera, 720);
assert(detail.tiles.every(t => t.level === 0), 'nearby geometry keeps exact collision surface');
camera.position.set(50, 100, 2000); camera.lookAt(50, 0, 30); detail.update(camera, 720);
assert(detail.tiles.some(t => t.level > 0), 'distant flat geometry simplifies');
detail.enabled = false; detail.update(camera, 720);
assert(detail.tiles.every(t => t.level === 0), 'diagnostic switch restores full geometry');
geometry.attributes.position.setY(1 * width + 1, 100);
assert(terrainLevel(geometry.attributes.position, width, 0, 0, 11, 9, 8).error > 0, 'interior peaks contribute to the LOD error');

const source = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 12, 2), new THREE.MeshBasicMaterial(), 3), matrix = new THREE.Matrix4();
for (let i = 0; i < 3; i++) { source.setMatrixAt(i, matrix.makeTranslation(i * 500, 0, 0)); source.setColorAt(i, new THREE.Color().setRGB(i / 3, 0.5, 1)); }
source.computeBoundingSphere();
const trees = createTreeDetail(source, new THREE.BoxGeometry(1, 12, 1));
camera.position.set(0, 0, 10); trees.update(camera, 720);
assert.equal(source.count + trees.far.count, 3, 'each tree is drawn exactly once');
assert(source.count > 0 && trees.far.count > 0);
for (const mesh of [source, trees.far]) for (let i = 0; i < mesh.count; i++) {
  const x = mesh.instanceMatrix.array[i * 16 + 12];
  assert(Math.abs(mesh.instanceColor.array[i * 3] - (x / 500) / 3) < 1e-6, 'tint stays attached to its transform');
}
const version = source.instanceMatrix.version; trees.update(camera, 720);
assert.equal(source.instanceMatrix.version, version, 'stable partitions do not upload');
assert(selectTreeDetail(30, true) && !selectTreeDetail(30, false), 'tree thresholds have hysteresis');

camera.position.set(0, 1, 0); camera.lookAt(0, 1, -10);
const people = [{ p: new THREE.Vector3(0, 0, 20) }, { p: new THREE.Vector3(0, 0, -30) }, { p: new THREE.Vector3(500, 0, -30) }];
assert.deepEqual(selectVisibleVisitors(people, camera, 1, 240), [1], 'visible riders receive limited detailed slots before nearer offscreen riders');
console.log('Render detail: seam topology, bounds, nearby fidelity, error, tree partitions, tints, hysteresis and crowd visibility passed.');
