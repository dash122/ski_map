import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chunkGeometry, chunkInstances, chunkTerrainGrid, createNearbyShadows } from '../src/spatial-rendering.js';

const grid = new THREE.PlaneGeometry(1000, 1000, 10, 10).rotateX(-Math.PI / 2);
grid.attributes.position.setY(5 * 11 + 5, 200); grid.computeVertexNormals();
const tiles = chunkTerrainGrid(grid, 11, 11, 4);
assert.equal(tiles.length, 9, 'partial edge tiles are included');
const triangles = g => Array.from({ length: g.index.count / 3 }, (_, i) => [...g.index.array.slice(i * 3, i * 3 + 3)].join(',')).sort();
assert.deepEqual(tiles.flatMap(triangles).sort(), triangles(grid), 'every original triangle survives exactly once');
for (const tile of tiles) {
  for (const name of Object.keys(grid.attributes)) assert.equal(tile.attributes[name], grid.attributes[name], 'normals and UVs retain shared buffers');
  for (const id of tile.index.array) assert(tile.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(grid.attributes.position, id)), 'bounds enclose interior peaks');
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -320, 0, 0, -310, 0, 0, -315, 10, 0,
  310, 0, 0, 320, 0, 0, 315, 10, 0,
], 3));
geometry.setAttribute('buildingLight', new THREE.Float32BufferAttribute([1, 2, 1, 2, 1, 2, 3, 4, 3, 4, 3, 4], 2));
geometry.setIndex([0, 1, 2, 3, 4, 5]);
const chunks = chunkGeometry(geometry);
assert.equal(chunks.length, 2);
assert.deepEqual(chunks.flatMap(g => [...g.attributes.position.array]), [...geometry.attributes.position.array]);
assert.deepEqual(chunks.flatMap(g => [...g.attributes.buildingLight.array]), [...geometry.attributes.buildingLight.array]);
assert(chunks.every(g => g.boundingSphere.radius < 10));

const source = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), 100);
const matrix = new THREE.Matrix4();
for (let i = 0; i < 100; i++) source.setMatrixAt(i, matrix.makeTranslation(i * 100, 0, 0));
source.castShadow = source.receiveShadow = true;
const batches = chunkInstances(source);
assert.equal(batches.reduce((n, b) => n + b.count, 0), 100);
assert(batches.every(b => b.castShadow && b.receiveShadow));
const camera = new THREE.PerspectiveCamera(60, 1, 1, 250);
camera.position.set(0, 20, 50); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
const submitted = batches.filter(b => frustum.intersectsObject(b)).reduce((n, b) => n + b.count, 0);
assert(submitted < 10, 'offscreen cells avoid submitting the full instance batch');

const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent); parent.add(source);
parent.position.x = 1000;
const shadows = createNearbyShadows(120), proxy = shadows.add(source);
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 2, 'only nearby instances cast shadows, accounting for parent transforms');
assert.equal(source.castShadow, false);
assert.equal(proxy.material.colorWrite, false);
assert.equal(proxy.material.depthWrite, false);
source.setMatrixAt(0, matrix.makeTranslation(5000, 0, 0));
source.instanceMatrix.needsUpdate = true;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 1, 'moving instances leave the shadow pool');
source.setMatrixAt(1, matrix.makeScale(0, 0, 0));
source.instanceMatrix.needsUpdate = true;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 0, 'hidden visitor placeholders do not cast shadows');
parent.visible = false;
shadows.update(new THREE.Vector3(6000, 0, 0));
assert.equal(proxy.count, 0);
assert.equal(proxy.visible, false, 'empty proxies submit no draw in either pass');
parent.visible = true;
source.setMatrixAt(0, matrix.makeTranslation(0, 0, 0));
source.instanceMatrix.needsUpdate = true;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 1);
assert.deepEqual(proxy.instanceMatrix.updateRanges, [{ start: 0, count: 16 }], 'upload only the active prefix');
const version = proxy.instanceMatrix.version;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.instanceMatrix.version, version, 'unchanged batches do not upload again');
parent.position.x = 3000;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 0, 'parent movement invalidates cached selection');
parent.position.x = 1000;
const outer = new THREE.Group(); scene.add(outer); outer.add(parent); outer.visible = false;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 0, 'hidden ancestors suppress shadows');
outer.visible = true;
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 1, 'restoring ancestor visibility restores shadows');
const envelope = new THREE.Sphere(new THREE.Vector3(), 10000);
const bounded = createNearbyShadows(120), boundedProxy = bounded.add(source, { bounds: envelope });
bounded.update(new THREE.Vector3(1000, 0, 0));
assert.equal(boundedProxy.count, 1);
bounded.update(new THREE.Vector3(30000, 0, 0));
assert.equal(boundedProxy.count, 0, 'route envelope rejects distant batches');
bounded.update(new THREE.Vector3(1000, 0, 0));
assert.equal(boundedProxy.count, 1, 'approaching the route restores its casters');
console.log(`Spatial rendering passed: attributes preserved; fixture submits ${submitted}/100 view instances and 2/100 shadow instances.`);
