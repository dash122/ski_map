import * as THREE from 'three';

// Every LOD retains every vertex on a tile's perimeter. Neighbours can choose
// different levels without skirts, cracks, or changes to the collision DEM.
export function terrainLevel(position, width, x, z, right, bottom, step) {
  const indices = [];
  const id = (col, row) => row * width + col;
  const axis = (start, end) => {
    const values = [start];
    for (let v = start + step; v < end; v += step) values.push(v);
    if (values.length > 1 && end - values.at(-1) === 1) values.pop();
    values.push(end); return values;
  };
  if (step === 1 || right - x < 2 || bottom - z < 2) {
    for (let row = z; row < bottom; row++) for (let col = x; col < right; col++) {
      const a = id(col, row), b = a + 1, c = a + width;
      indices.push(a, c, b, b, c, c + 1);
    }
    return { indices, error: 0 };
  }
  let error = 0;
  const xs = axis(x, right), zs = axis(z, bottom);
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
    const cx = Math.floor((a + b) / 2), cz = Math.floor((c + d) / 2), ring = [];
    // Clockwise in XZ gives upward facing triangles, as in the original DEM.
    for (let row = c; row < d; row += a === x ? 1 : d - c) ring.push([a, row]);
    for (let col = a; col < b; col += d === bottom ? 1 : b - a) ring.push([col, d]);
    for (let row = d; row > c; row -= b === right ? 1 : d - c) ring.push([b, row]);
    for (let col = b; col > a; col -= c === z ? 1 : b - a) ring.push([col, c]);
    const center = id(cx, cz), cy = position.getY(center);
    for (let r = 0; r < ring.length; r++) {
      const [ax, az] = ring[r], [bx, bz] = ring[(r + 1) % ring.length];
      const ai = id(ax, az), bi = id(bx, bz);
      indices.push(center, ai, bi);
      const ay = position.getY(ai), by = position.getY(bi);
      const den = (az - bz) * (cx - bx) + (bx - ax) * (cz - bz);
      for (let row = c; row <= d; row++) for (let col = a; col <= b; col++) {
        const u = ((az - bz) * (col - bx) + (bx - ax) * (row - bz)) / den;
        const v = ((bz - cz) * (col - bx) + (cx - bx) * (row - bz)) / den;
        if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
        error = Math.max(error, Math.abs(position.getY(id(col, row)) - (u * cy + v * ay + (1 - u - v) * by)));
      }
    }
  }
  // Conservative allowance for extrema at crossing fine/coarse diagonals.
  return { indices, error: error * 2 };
}

export function createRenderDetail({ pixelError = 1.25, near = 180 } = {}) {
  const tiles = [], frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  let enabled = true;
  return {
    get tiles() { return tiles; },
    get enabled() { return enabled; },
    set enabled(value) { enabled = value; },
    addGrid({ scene, geometry, material, width, height, tile = 64, name = 'Terrain', nearRange = near }) {
      const position = geometry.attributes.position, point = new THREE.Vector3();
      for (let z = 0; z < height - 1; z += tile) for (let x = 0; x < width - 1; x += tile) {
        const right = Math.min(width - 1, x + tile), bottom = Math.min(height - 1, z + tile);
        const box = new THREE.Box3();
        for (let row = z; row <= bottom; row++) for (let col = x; col <= right; col++) box.expandByPoint(point.fromBufferAttribute(position, row * width + col));
        const levels = [1, 2, 4, 8].map(step => {
          const { indices, error } = terrainLevel(position, width, x, z, right, bottom, step);
          const geo = new THREE.BufferGeometry();
          for (const [key, attribute] of Object.entries(geometry.attributes)) geo.setAttribute(key, attribute);
          geo.setIndex(indices); geo.boundingBox = box; geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          return { geometry: geo, error };
        });
        const mesh = new THREE.Mesh(levels[0].geometry, material);
        mesh.name = name; mesh.receiveShadow = name === 'Terrain tile'; scene.add(mesh);
        tiles.push({ mesh, levels, box, level: 0, nearRange });
      }
    },
    update(camera, viewportHeight) {
      camera.updateMatrixWorld();
      const scale = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * camera.zoom;
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const tile of tiles) {
        if (!frustum.intersectsBox(tile.box)) continue;
        const distance = Math.max(1, tile.box.distanceToPoint(camera.position));
        let level = 0;
        if (enabled && distance > tile.nearRange) for (let i = 1; i < tile.levels.length; i++) {
          // Hysteresis keeps a tile stable around its switching threshold.
          const threshold = pixelError * (i <= tile.level ? 1.15 : 0.85);
          if (tile.levels[i].error * scale / distance <= threshold) level = i;
        }
        if (level !== tile.level) { tile.mesh.geometry = tile.levels[level].geometry; tile.level = level; }
      }
    },
    stats() {
      return { tiles: tiles.length, levels: [0, 1, 2, 3].map(level => tiles.filter(t => t.level === level).length) };
    },
  };
}

export function selectTreeDetail(pixels, previous = false, threshold = 30) {
  return pixels >= threshold * (previous ? 0.85 : 1.15);
}

export function createTreeDetail(near, farGeometry, threshold = 30) {
  const count = near.count, matrices = near.instanceMatrix.array.slice();
  const colors = near.instanceColor?.array.slice(), selected = new Uint8Array(count);
  const far = new THREE.InstancedMesh(farGeometry, near.material, count);
  far.boundingSphere = near.boundingSphere; far.receiveShadow = near.receiveShadow;
  if (colors) far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors.length), 3);
  near.geometry.computeBoundingBox();
  const height = near.geometry.boundingBox.max.y - near.geometry.boundingBox.min.y;
  let initialized = false;
  return { far, update(camera, viewportHeight) {
    const scale = viewportHeight * camera.zoom / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let changed = !initialized;
    for (let i = 0; i < count; i++) {
      const o = i * 16, distance = Math.max(1, Math.hypot(matrices[o + 12] - camera.position.x,
        matrices[o + 13] - camera.position.y, matrices[o + 14] - camera.position.z));
      const treeHeight = height * Math.hypot(matrices[o + 4], matrices[o + 5], matrices[o + 6]);
      const detailed = distance < 65 || selectTreeDetail(treeHeight * scale / distance, !!selected[i], threshold);
      if (selected[i] !== +detailed) { selected[i] = +detailed; changed = true; }
    }
    if (!changed) return;
    initialized = true;
    let n = 0, f = 0;
    for (let i = 0; i < count; i++) {
      const mesh = selected[i] ? near : far, target = selected[i] ? n++ : f++;
      mesh.instanceMatrix.array.set(matrices.subarray(i * 16, i * 16 + 16), target * 16);
      if (colors) mesh.instanceColor.array.set(colors.subarray(i * 3, i * 3 + 3), target * 3);
    }
    near.count = n; far.count = f; near.visible = n > 0; far.visible = f > 0;
    for (const mesh of [near, far]) {
      if (!mesh.count) continue;
      for (const [attribute, size] of [[mesh.instanceMatrix, 16], [mesh.instanceColor, 3]]) {
        if (!attribute) continue;
        attribute.clearUpdateRanges(); attribute.addUpdateRange(0, mesh.count * size); attribute.needsUpdate = true;
      }
    }
  } };
}
