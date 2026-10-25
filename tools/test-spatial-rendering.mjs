import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chunkGeometry, chunkInstances, createNearbyShadows } from '../src/spatial-rendering.js';

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
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 1, 'moving instances leave the shadow pool');
source.setMatrixAt(1, matrix.makeScale(0, 0, 0));
shadows.update(new THREE.Vector3(1000, 0, 0));
assert.equal(proxy.count, 0, 'hidden visitor placeholders do not cast shadows');
parent.visible = false;
shadows.update(new THREE.Vector3(6000, 0, 0));
assert.equal(proxy.count, 0);
console.log(`Spatial rendering passed: attributes preserved; fixture submits ${submitted}/100 view instances and 2/100 shadow instances.`);
