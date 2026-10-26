import * as THREE from 'three';

// Keep the DEM's exact topology and shared normals/UVs, but give the renderer
// small bounds so an offscreen hillside does not submit the entire resort.
// Attributes share their GPU buffers; only the index lists are partitioned.
export function chunkTerrainGrid(geometry, width, height, tile = 64) {
  const chunks = [], index = geometry.index.array, position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let z = 0; z < height - 1; z += tile) for (let x = 0; x < width - 1; x += tile) {
    const right = Math.min(width - 1, x + tile), bottom = Math.min(height - 1, z + tile);
    const indices = new index.constructor((right - x) * (bottom - z) * 6);
    let offset = 0;
    for (let row = z; row < bottom; row++) {
      const start = (row * (width - 1) + x) * 6, length = (right - x) * 6;
      indices.set(index.subarray(start, start + length), offset); offset += length;
    }
    const chunk = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) chunk.setAttribute(name, attribute);
    chunk.setIndex(new THREE.BufferAttribute(indices, 1));
    // computeBoundingSphere() uses all shared vertices, so calculate tile bounds
    // explicitly, including interior peaks rather than only its four corners.
    chunk.boundingBox = new THREE.Box3();
    for (let row = z; row <= bottom; row++) for (let col = x; col <= right; col++) {
      chunk.boundingBox.expandByPoint(point.fromBufferAttribute(position, row * width + col));
    }
    chunk.boundingSphere = chunk.boundingBox.getBoundingSphere(new THREE.Sphere());
    chunks.push(chunk);
  }
  return chunks;
}

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
  const entries = [], point = new THREE.Vector3();
  const radiusSquared = radius * radius, sphere = new THREE.Sphere();
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return {
    add(source, { bounds = null } = {}) {
      const proxy = new THREE.InstancedMesh(source.geometry, material, source.instanceMatrix.count);
      proxy.castShadow = true; proxy.frustumCulled = false;
      proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      proxy.count = 0; source.castShadow = false;
      // Share the parent's coordinate system, including any future transforms.
      source.parent.add(proxy);
      // Optional conservative envelope for moving batches (e.g. a whole lift
      // route). Never use an automatically computed, potentially stale bound.
      entries.push({ source, proxy, bounds, version: -1, count: -1,
        world: new THREE.Matrix4(), center: new THREE.Vector3(Infinity, Infinity, Infinity), visible: false });
      return proxy;
    },
    update(center) {
      for (const entry of entries) {
        const { source, proxy } = entry;
        source.updateWorldMatrix(true, false);
        let visible = true;
        for (let parent = source; parent; parent = parent.parent) {
          if (!parent.visible) { visible = false; break; }
        }
        if (visible && entry.bounds) {
          sphere.copy(entry.bounds).applyMatrix4(source.matrixWorld);
          if (sphere.center.distanceToSquared(center) > (radius + sphere.radius) ** 2) visible = false;
        }
        // A paused/static batch needs no new selection or GPU upload. The buffer
        // version also catches moving and zero-scaled visitor placeholders.
        if (entry.version === source.instanceMatrix.version && entry.count === source.count &&
            entry.visible === visible && entry.world.equals(source.matrixWorld) && entry.center.equals(center)) continue;
        entry.version = source.instanceMatrix.version; entry.count = source.count;
        entry.visible = visible; entry.world.copy(source.matrixWorld); entry.center.copy(center);
        let count = 0;
        proxy.position.copy(source.position); proxy.quaternion.copy(source.quaternion); proxy.scale.copy(source.scale);
        const input = source.instanceMatrix.array, output = proxy.instanceMatrix.array;
        if (visible) for (let i = 0; i < source.count; i++) {
          const offset = i * 16;
          // Zero-scaled instances are hidden when a detailed visitor replaces them.
          if (input[offset] ** 2 + input[offset + 1] ** 2 + input[offset + 2] ** 2 < 1e-10) continue;
          point.set(input[offset + 12], input[offset + 13], input[offset + 14]).applyMatrix4(source.matrixWorld);
          if (point.distanceToSquared(center) > radiusSquared) continue;
          // Copy only accepted transforms; avoid decoding/re-encoding 16 floats
          // through Matrix4 for every distant instance in every body-part batch.
          const target = count++ * 16;
          for (let j = 0; j < 16; j++) output[target + j] = input[offset + j];
        }
        proxy.count = count; proxy.visible = count > 0;
        if (count) {
          // WebGL otherwise uploads the full allocated crowd/route capacity.
          proxy.instanceMatrix.clearUpdateRanges();
          proxy.instanceMatrix.addUpdateRange(0, count * 16);
          proxy.instanceMatrix.needsUpdate = true;
        }
      }
    },
  };
}
