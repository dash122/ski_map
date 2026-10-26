import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticLandmarks } from '../src/static-batches.js';
const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
root.position.set(10, 2, 20); root.rotation.y = 0.3;
const material = new THREE.MeshLambertMaterial(), geometry = new THREE.BoxGeometry();
const originals = [];
for (let i = 0; i < 4; i++) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.x = i * 4;
  mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); originals.push(mesh);
}
const glass = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 })); root.add(glass);
root.updateWorldMatrix(true, true);
const positions = originals.flatMap(mesh => {
  const geo = geometry.toNonIndexed().applyMatrix4(mesh.matrixWorld);
  return [...geo.attributes.position.array];
});
const result = batchStaticLandmarks(scene, [root]);
assert.deepEqual(result, { sources: 4, batches: 1, savedDrawsPerPass: 3 });
const batch = scene.getObjectByName('Static landmark cell');
assert.deepEqual([...batch.geometry.attributes.position.array], positions, 'world geometry is preserved exactly');
assert.equal(batch.material, material, 'lighting retains its original material');
assert(batch.castShadow && batch.receiveShadow && glass.visible);
assert(originals.every(mesh => !mesh.visible), 'originals no longer submit duplicate draws');
console.log('Static batches: world transforms, materials, shadows, transparency and duplicate-draw checks passed.');
