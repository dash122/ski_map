import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Only call on explicitly static landmark roots, after their builders finish.
// Keep the original objects for names/metadata; materials stay shared so their
// lighting controls still work. Transparent surfaces retain their sorting.
export function batchStaticLandmarks(scene, roots, cellSize = 200) {
  const groups = new Map(), center = new THREE.Vector3();
  for (const root of roots.filter(Boolean)) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.morphTargetInfluences ||
          Array.isArray(mesh.material) || mesh.material.transparent || mesh.material.alphaTest > 0 || mesh.matrixWorld.determinant() < 0 ||
          mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity ||
          Object.hasOwn(mesh, 'onBeforeRender') || Object.hasOwn(mesh, 'onAfterRender')) return;
      mesh.geometry.computeBoundingSphere(); center.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
      const signature = Object.entries(mesh.geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
      const key = [Math.floor(center.x / cellSize), Math.floor(center.z / cellSize), mesh.material.uuid,
        mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, signature].join('/');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    });
  }
  let sources = 0, batches = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 3) continue;
    const geometries = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const geometry = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    if (!geometry) continue;
    const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    batch.name = 'Static landmark cell'; batch.matrixAutoUpdate = false;
    geometry.computeBoundingSphere(); scene.add(batch);
    for (const mesh of meshes) { mesh.visible = false; mesh.matrixAutoUpdate = false; }
    sources += meshes.length; batches++;
  }
  return { sources, batches, savedDrawsPerPass: sources - batches };
}
