import * as THREE from 'three';

// Split triangles, preserving every vertex attribute (including facade lighting IDs).
// Assign whole triangles to cells so boundaries never introduce cracks.
export function chunkGeometry(geometry, cellSize = 300) {
  const position = geometry.attributes.position, index = geometry.index;
  const cells = new Map(), count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
    const x = ids.reduce((n, id) => n + position.getX(id), 0) / 3;
    const z = ids.reduce((n, id) => n + position.getZ(id), 0) / 3;
    const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(...ids);
  }
  return [...cells.values()].map(ids => {
    const chunk = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const data = new attribute.array.constructor(ids.length * attribute.itemSize);
      ids.forEach((id, i) => data.set(attribute.array.subarray(id * attribute.itemSize, (id + 1) * attribute.itemSize), i * attribute.itemSize));
      chunk.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize, attribute.normalized));
    }
    chunk.computeBoundingSphere();
    return chunk;
  });
}

export function chunkInstances(source, cellSize = 300) {
  const cells = new Map(), matrix = new THREE.Matrix4();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const key = `${Math.floor(matrix.elements[12] / cellSize)},${Math.floor(matrix.elements[14] / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  return [...cells.values()].map(ids => {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, ids.length);
    ids.forEach((id, i) => { source.getMatrixAt(id, matrix); mesh.setMatrixAt(i, matrix); });
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    mesh.computeBoundingSphere();
    return mesh;
  });
}

// A separate instance list means the shadow pass transforms only nearby casters.
// WebGL r170 tests main-camera layers during its shadow pass. An invisible
// colour/depth material keeps proxies eligible there without covering the scene.
export function createNearbyShadows(radius = 100) {
  const entries = [], matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return {
    add(source) {
      const proxy = new THREE.InstancedMesh(source.geometry, material, source.instanceMatrix.count);
      proxy.castShadow = true; proxy.frustumCulled = false;
      proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      proxy.count = 0; source.castShadow = false;
      // Share the parent's coordinate system, including any future transforms.
      source.parent.add(proxy);
      entries.push({ source, proxy });
      return proxy;
    },
    update(center) {
      for (const { source, proxy } of entries) {
        source.updateWorldMatrix(true, false);
        let count = 0;
        proxy.position.copy(source.position); proxy.quaternion.copy(source.quaternion); proxy.scale.copy(source.scale);
        if (source.visible && source.parent.visible) for (let i = 0; i < source.count; i++) {
          source.getMatrixAt(i, matrix);
          // Zero-scaled instances are hidden when a detailed visitor replaces them.
          if (matrix.elements[0] ** 2 + matrix.elements[1] ** 2 + matrix.elements[2] ** 2 < 1e-10) continue;
          point.setFromMatrixPosition(matrix).applyMatrix4(source.matrixWorld);
          if (point.distanceToSquared(center) > radius * radius) continue;
          proxy.setMatrixAt(count++, matrix);
        }
        proxy.count = count; proxy.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
