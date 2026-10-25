import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Footprint is OSM geometry. Vertical dimensions and facade rhythm are estimates,
// with the upper-floor restaurant confirmed by the operator (see data provenance).
export function createAceSummit({ scene, pts, height }) {
  const root = new THREE.Group(); root.name = 'Ace Gondola summit · NEST813 (2F)';
  const base = Math.max(...pts.map(p => height(p.x, p.z)));
  const floor = base + 4.8, top = base + 9.2;
  const dark = new THREE.MeshStandardMaterial({ color: 0x292d30, roughness: 0.78 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x141b20, roughness: 0.5, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x354852, roughness: 0.2, metalness: 0.32, transparent: true, opacity: 0.68, depthWrite: false });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x696c6c, roughness: 0.95 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x795740, roughness: 0.85 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0x403e36, roughness: 1 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffb861, emissiveIntensity: 0.7 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.95 });
  function edge(a, b, bottom, tall, depth, material, offset = 0) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, tall, depth), material);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.position.set((a.x + b.x) / 2 - dz / length * offset, bottom + tall / 2, (a.z + b.z) / 2 + dx / length * offset);
    root.add(mesh); return mesh;
  }
  // Winding matches the village footprints; left normal points outside.
  let area = pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + a.x * b.z - b.x * a.z; }, 0);
  if (area > 0) pts = [...pts].reverse();
  const center = pts.reduce((c, p) => ({ x: c.x + p.x / pts.length, z: c.z + p.z / pts.length }), { x: 0, z: 0 });
  // Longitudinal frame comes from the mapped outline, never a world-aligned box.
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return { a, b, len: Math.hypot(b.x - a.x, b.z - a.z) };
  });
  const long = edges.reduce((a, b) => a.len > b.len ? a : b);
  const ux = (long.b.x - long.a.x) / long.len, uz = (long.b.z - long.a.z) / long.len;
  const width = Math.min(...edges.map(e => e.len)), length = long.len;
  const batches = new Map();
  function box(name, x, y, z, w, h, d, material) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(-Math.atan2(uz, ux));
    geometry.translate(center.x + ux * x - uz * z, y, center.z + uz * x + ux * z);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
  }
  // Cable enters from downhill (east/south). Only that short facade is open.
  const portal = edges.filter(e => e.len < length * 0.85).sort((a, b) => (b.a.x + b.b.x + b.a.z + b.b.z) - (a.a.x + a.b.x + a.a.z + a.b.z))[0] || edges[0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    const isPortal = a === portal.a;
    // Enclosed station walls and a substantial plinth replace the open stilts.
    edge(a, b, base, 0.35, 0.5, concrete);
    if (!isPortal) edge(a, b, base + 0.35, floor - base - 0.8, 0.35, dark);
    else {
      const t = Math.min(0.22, 1.5 / len);
      const at = v => ({ x: a.x + (b.x - a.x) * v, z: a.z + (b.z - a.z) * v });
      edge(a, at(t), base + 0.35, floor - base - 0.8, 0.5, dark);
      edge(at(1 - t), b, base + 0.35, floor - base - 0.8, 0.5, dark);
    }
    edge(a, b, floor - 0.45, 0.45, 0.5, dark);
    edge(a, b, floor, 0.85, 0.4, dark);
    edge(a, b, floor + 0.85, 2.55, 0.16, glass);
    edge(a, b, floor + 3.4, 0.25, 0.4, dark);
    edge(a, b, top - 0.75, 0.75, 0.55, dark);
    // Horizontal metal-panel joints give the solid station scale and texture.
    for (let y = base + 0.8; y < floor - 0.5; y += 0.55) {
      if (!isPortal) edge(a, b, y, 0.025, 0.38, frame);
    }
    const bays = Math.ceil(len / 2.6);
    for (let j = 0; j <= bays; j++) {
      const t = j / bays, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.18, j % 3 === 0 ? top - base : 3.7, 0.18), frame);
      column.position.set(x, j % 3 === 0 ? (base + top) / 2 : floor + 1.85, z); root.add(column);
    }
  }
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.z)));
  for (const [y, depth, material, name] of [[base, 0.2, concrete, 'Station platform'], [floor - 0.4, 0.4, timber, 'Restaurant floor'], [top - 0.3, 0.38, snow, 'Solid roof and ceiling']]) {
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), material);
    slab.rotation.x = -Math.PI / 2; slab.position.y = y; slab.name = name; root.add(slab);
  }
  // Opaque service core prevents views straight through the entire building.
  box('Service core', -length * 0.28, floor + 1.8, 0, length * 0.23, 3.6, width * 0.48, timber);
  box('Island counter', length * 0.05, floor + 0.55, 0, length * 0.26, 1.1, 2.2, dark);
  box('Countertop', length * 0.05, floor + 1.14, 0, length * 0.28, 0.13, 2.4, timber);
  // Equipment housing and parallel guide rails give the loading hall a purpose.
  box('Terminal machinery', 0, base + 3.7, 0, length * 0.65, 0.7, 5.2, frame);
  for (const side of [-1, 1]) {
    box('Cabin guide rail', 0, base + 3.22, side * 2.2, length * 0.75, 0.16, 0.16, concrete);
    box('Loading platform', 0, base + 0.2, side * 4.5, length * 0.7, 0.25, 2.5, concrete);
  }
  // Window-side dining, with individual table tops, bases, seats and backs.
  for (const side of [-1, 1]) for (let x = -length * 0.3; x < length * 0.4; x += 3.6) {
    const z = side * (width / 2 - 2.3);
    box('Table top', x, floor + 0.78, z, 1.5, 0.12, 0.85, timber);
    box('Table pedestal', x, floor + 0.36, z, 0.15, 0.72, 0.15, frame);
    for (const chair of [-1, 1]) {
      box('Dining seat', x, floor + 0.43, z + chair * 0.92, 0.55, 0.16, 0.55, upholstery);
      box('Dining back', x, floor + 0.75, z + chair * 1.15, 0.55, 0.6, 0.1, timber);
      for (const leg of [-0.2, 0.2]) box('Chair legs', x + leg, floor + 0.18, z + chair * 0.92, 0.055, 0.36, 0.45, frame);
    }
    box('Ceiling light', x, top - 0.4, z, 1.1, 0.06, 0.25, warm);
  }
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.name = material === timber ? 'Restaurant timber and furnishings' : 'Station interior details';
    root.add(mesh); geometries.forEach(g => g.dispose());
  }
  const a = pts[0], b = pts[1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#292d30'; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#f5f3e9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 54px sans-serif';
  ctx.fillText('NEST813  ·  ACE GONDOLA', 512, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(len * 0.85, 15), 1.4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.rotation.y = Math.atan2(-dz, dx); sign.position.set((a.x + b.x) / 2 - dz / len * 0.4, top - 0.6, (a.z + b.z) / 2 + dx / len * 0.4); root.add(sign);
  if (portal.a !== a) {
    const p = portal.a, q = portal.b, px = q.x - p.x, pz = q.z - p.z;
    const entrySign = sign.clone();
    entrySign.rotation.y = Math.atan2(-pz, px);
    entrySign.position.set((p.x + q.x) / 2 - pz / portal.len * 0.4, floor - 0.25, (p.z + q.z) / 2 + px / portal.len * 0.4);
    entrySign.scale.set(0.8, 0.55, 1); root.add(entrySign);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  scene.add(root); return root;
}
