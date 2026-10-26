import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createNearbyShadows } from '../src/spatial-rendering.js';

// Optional snapshot of the previous module for an apples-to-apples CPU comparison.
// This measures selection and requested steady-state upload bytes, not GPU time/FPS.
const implementations = { current: createNearbyShadows };
if (process.argv[2]) {
  const source = (await readFile(process.argv[2], 'utf8')).replace("'three'", JSON.stringify(import.meta.resolve('three')));
  implementations.before = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).createNearbyShadows;
}
for (const [name, create] of Object.entries(implementations)) {
  for (const moving of [false, true]) {
    const scene = new THREE.Scene(), shadows = create(140), sources = [], proxies = [];
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial(), matrix = new THREE.Matrix4();
    for (let batch = 0; batch < 24; batch++) {
      const source = new THREE.InstancedMesh(geometry, material, 1000);
      for (let i = 0; i < source.count; i++) source.setMatrixAt(i, matrix.makeTranslation(i * 4 - 2000, batch * 0.1, 0));
      scene.add(source); sources.push(source); proxies.push(shadows.add(source));
    }
    const center = new THREE.Vector3();
    const update = frame => {
      if (moving) {
        center.x = Math.sin(frame / 60) * 50;
        for (const source of sources) source.instanceMatrix.needsUpdate = true;
      }
      shadows.update(center);
    };
    for (let i = 0; i < 100; i++) update(i);
    let bytes = 0;
    const start = performance.now();
    for (let frame = 0; frame < 600; frame++) {
      const versions = proxies.map(p => p.instanceMatrix.version);
      update(frame);
      proxies.forEach((p, i) => {
        const attribute = p.instanceMatrix;
        if (attribute.version !== versions[i]) bytes += (attribute.updateRanges.length
          ? attribute.updateRanges.reduce((n, r) => n + r.count, 0) * 4 : attribute.array.byteLength);
        attribute.clearUpdateRanges(); // renderer clears these after an upload
      });
    }
    console.log(JSON.stringify({ implementation: name, scenario: moving ? 'moving' : 'unchanged',
      cpuMsPerUpdate: +((performance.now() - start) / 600).toFixed(3), uploadBytesPerUpdate: Math.round(bytes / 600) }));
  }
}
