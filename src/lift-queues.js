import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chunkInstances } from './spatial-rendering.js';
import { signMesh, insidePolygon, edgeDistance } from './base-landmarks.js';

// Lift-base queue mazes: rope-and-post lanes edged with orange net, a row of RFID pass gates and a lift sign,
// behind each chair and gondola bottom terminal. Waiting riders are instanced and only drawn at the nearest bases.
const LANE_W = 1.6, SPACING = 1.85, POST_GAP = 2.4, ROPE_Y = 0.95, NET_H = 1.1;

// Layout in a gate frame: x across the gate row, y back from the gates (riders walk toward -y).
// toSU maps it to the terminal frame: s along the line (up is +), u across it (+ is the up-cable side).
// Chairs queue straight behind the bottom terminal; gondolas beside the open side of the station hall.
const HALL_SIDE = 7.9;     // just outside the gondola hall's pillars (index.html: hallW / 2 + 0.8)
export function planQueue({ gondola, occ }, isClear = () => true) {
  const most = gondola ? 6 : occ >= 6 ? 6 : occ >= 4 ? 5 : 3;
  const width = gondola ? 10 : occ >= 4 ? 9 : 7;
  const gates = gondola ? 4 : Math.max(2, Math.min(6, occ));
  const front = 1.3;
  // Beside the line, gates facing it: the gondola hall's open side, or a side corral for a crowded chair base.
  const beside = (offset, mids) => [1, -1].flatMap(side => mids.map(mid => ({ side, mid, lat: 0, toSU: ({ x, y }) => ({ s: mid + side * x, u: side * (offset + y) }), walk: { s: 0, u: -side } })));
  const frames = gondola ? beside(HALL_SIDE, [4, 9, 0, 14])
    : [...[0, 3, -3, 6, -6, 9, -9, 12, -12].map(lat => ({ lat, toSU: ({ x, y }) => ({ s: -5 - y, u: lat + x }), walk: { s: 1, u: 0 } })), ...beside(5.5, [-8, -14, -20])];
  // Shorter mazes only where a full one fits nowhere.
  for (let lanes = most; lanes >= Math.min(3, most); lanes--) for (const frame of frames) {
    const back = front + lanes * LANE_W;
    let ok = true;
    for (let y = -0.6; y <= back + 0.5 && ok; y += 1.2) for (let x = -width / 2 - 0.5; x <= width / 2 + 0.5 && ok; x += 1.2) {
      const p = frame.toSU({ x, y }); ok = isClear(p.s, p.u);
    }
    if (!ok) continue;
    const ropes = [], nets = [], path = [];
    // Enter on the side away from the line.
    const entrySide = gondola ? 1 : frame.lat >= 0 ? 1 : -1;
    // Rows from the back (entrance) to the front, alternating direction; each divider leaves a gap at the turn.
    for (let k = lanes - 1; k >= 0; k--) {
      const startSide = (lanes - 1 - k) % 2 ? -entrySide : entrySide, y = front + LANE_W * (k + 0.5);
      path.push({ x: startSide * (width / 2 - 0.7), y }, { x: -startSide * (width / 2 - 0.7), y });
      if (k > 0) ropes.push([{ x: startSide * width / 2, y: front + LANE_W * k }, { x: -startSide * (width / 2 - 1.4), y: front + LANE_W * k }]);
    }
    path.unshift({ x: entrySide * (width / 2 - 0.7), y: back + 2.2 });
    const gateX = i => (i - (gates - 1) / 2) * 1.15, lane = gateX(Math.floor((gates - 1) / 2));
    path.push({ x: lane, y: 0.6 }, { x: lane, y: -0.4 });
    nets.push([{ x: -width / 2, y: back }, { x: -width / 2, y: front }], [{ x: width / 2, y: back }, { x: width / 2, y: front }]);
    // Back edge, with the entrance gap on the entry side.
    nets.push([{ x: -entrySide * width / 2, y: back }, { x: entrySide * (width / 2 - 1.4), y: back }]);
    // Short wings funnel the front lane into the gates.
    const gw = gates * 1.15 / 2 + 0.2;
    nets.push([{ x: -width / 2, y: front }, { x: -gw, y: 0 }], [{ x: width / 2, y: front }, { x: gw, y: 0 }]);
    return { ...frame, width, lanes, front, back, gates, gateX, ropes, nets, path };
  }
  return null;
}

// Distance along a polyline to a point and its heading.
export function alongPath(path, lengths, d, out) {
  let i = 1; while (i < lengths.length - 1 && lengths[i] < d) i++;
  const a = path[i - 1], b = path[i], t = Math.max(0, Math.min(1, (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)));
  out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return out;
}

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

export function createLiftQueues({ scene, lifts, height, footprints = [], clock, lowEnd = false, registerShadow = () => {} }) {
  const root = new THREE.Group(); root.name = 'Lift queues'; scene.add(root);
  const bases = [];
  const posts = [], ropes = [], nets = [], pedestals = [], readers = [], arms = [];
  const bottoms = lifts.filter(L => !L.surface && L.n && L.path?.length > 1);
  for (const L of bottoms) {
    const c = L.path[0], f = L.d0, r = { x: -f.z, z: f.x };
    const world = ({ s, u }) => ({ x: c.x + f.x * s + r.x * u, z: c.z + f.z * s + r.z * u });
    const local = footprints.filter(p => p.some(q => Math.hypot(q.x - c.x, q.z - c.z) < 80));
    const others = lifts.filter(o => o !== L && o.path?.length > 1 && Math.hypot(o.path[0].x - c.x, o.path[0].z - c.z) < 120);
    const isClear = (s, u) => {
      const p = world({ s, u });
      // Keep clear of walls and the eaves that overhang them.
      if (local.some(fp => insidePolygon(p.x, p.z, fp) || edgeDistance(p.x, p.z, fp) < 3.5)) return false;
      // Stay off other lifts' lines and loading areas, and off steep ground.
      for (const o of others) {
        const a = o.path[0], dx = o.d0.x, dz = o.d0.z, along = (p.x - a.x) * dx + (p.z - a.z) * dz;
        if (along > -32 && along < 40 && Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) < 6) return false;
      }
      return Math.abs(height(p.x + 1, p.z) - height(p.x - 1, p.z)) < 1.3 && Math.abs(height(p.x, p.z + 1) - height(p.x, p.z - 1)) < 1.3;
    };
    const plan = planQueue(L, isClear);
    if (!plan) continue;
    const su = p => world(plan.toSU(p)), w = world(plan.walk), yaw = Math.atan2(w.x - c.x, w.z - c.z);
    // Posts every couple of metres along each rope and net run.
    const run = (list, a, b, kind) => {
      const A = su(a), B = su(b), length = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(1, Math.ceil(length / POST_GAP));
      for (let i = 0; i <= n; i++) { const x = A.x + (B.x - A.x) * i / n, z = A.z + (B.z - A.z) * i / n; posts.push([x, height(x, z), z, kind]); }
      for (let i = 0; i < n; i++) {
        const x0 = A.x + (B.x - A.x) * i / n, z0 = A.z + (B.z - A.z) * i / n, x1 = A.x + (B.x - A.x) * (i + 1) / n, z1 = A.z + (B.z - A.z) * (i + 1) / n;
        list.push([x0, height(x0, z0), z0, x1, height(x1, z1), z1]);
      }
    };
    for (const [a, b] of plan.ropes) run(ropes, a, b, 0);
    for (const [a, b] of plan.nets) run(nets, a, b, 1);
    for (let i = 0; i <= plan.gates; i++) {
      const p = su({ x: plan.gateX(i) - 0.575, y: 0 });
      pedestals.push([p.x, height(p.x, p.z), p.z, yaw]);
      if (i < plan.gates) { readers.push([p.x, height(p.x, p.z), p.z, yaw]); arms.push([p.x, height(p.x, p.z), p.z, yaw]); }
    }
    // Overhead banner across the gates and a lift sign at the maze entrance.
    const gateMid = su({ x: 0, y: 0 }), span = plan.gates * 1.15 + 0.6;
    const banner = signMesh('TOUCH YOUR PASS', Math.min(span, 5.5), { sub: 'ICリフト券をタッチ · 觸碰票卡', bg: '#0f5132', band: '#7ed957' });
    banner.position.set(gateMid.x, height(gateMid.x, gateMid.z) + 2.75, gateMid.z); banner.rotation.y = yaw + Math.PI; root.add(banner);
    for (const side of [-1, 1]) {
      const p = su({ x: side * span / 2, y: 0 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), poleMaterial);
      pole.position.set(p.x, height(p.x, p.z) + 1.65, p.z); root.add(pole);
    }
    const entry = plan.path[0], signPoint = su({ x: entry.x + Math.sign(entry.x) * 1.8, y: entry.y + 1.2 });
    const kind = L.gondola ? 'GONDOLA ゴンドラ' : `${L.occ}-SEAT CHAIR · ${L.occ}人乗りリフト`;
    const sign = signMesh(L.name, 2.8, { sub: kind, bg: L.gondola ? '#8f1d21' : '#1d3f73', band: '#f2c230' });
    const sy = height(signPoint.x, signPoint.z);
    sign.position.set(signPoint.x, sy + 2.1, signPoint.z); sign.rotation.y = yaw + Math.PI; root.add(sign);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), poleMaterial);
      pole.position.set(signPoint.x + Math.cos(yaw) * side * 1.3, sy + 1.4, signPoint.z - Math.sin(yaw) * side * 1.3); root.add(pole);
    }
    // Queue walking line in world space, from the maze entrance to the gates.
    const path = plan.path.map(su), lengths = [0];
    for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const busy = 0.3 + 0.65 * hash(L.name) * (L.gondola ? 1 : 0.85);
    const capacity = Math.floor((lengths.at(-1) - 2) / SPACING);
    bases.push({ L, x: c.x, z: c.z, path, lengths, riders: Math.max(3, Math.round(capacity * busy)), capacity, plan });
  }

  // Static props: one instanced mesh per kind, split into cells so distant bases are culled.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const place = (geometry, material, list, set, shadow = false) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((item, i) => { set(item); mesh.setMatrixAt(i, m4.compose(v, q, sc)); });
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    for (const chunk of chunkInstances(mesh, 400)) { chunk.name = 'Lift queue props'; root.add(chunk); }
    mesh.dispose();
  };
  const segment = ([x0, y0, z0, x1, y1, z1], lift) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    v.set((x0 + x1) / 2, (y0 + y1) / 2 + lift, (z0 + z1) / 2);
    q.setFromEuler(e.set(0, Math.atan2(x1 - x0, z1 - z0), 0, 'YXZ'));
    const pitch = Math.atan2(y1 - y0, length); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
    sc.set(1, 1, Math.hypot(length, y1 - y0));
  };
  place(new THREE.CylinderGeometry(0.045, 0.06, 1.15, 6).translate(0, 0.575, 0), new THREE.MeshLambertMaterial({ color: 0x1e2226 }), posts, ([x, y, z, kind]) => { v.set(x, y - 0.05, z); q.identity(); sc.set(1, kind ? 1 : 0.9, 1); });
  place(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshLambertMaterial({ color: 0x1f5fbf }), ropes, s => segment(s, ROPE_Y));
  // Orange safety net: a tiled mesh texture cut out with alpha test.
  const netCanvas = document.createElement('canvas'); netCanvas.width = netCanvas.height = 64;
  const ng = netCanvas.getContext('2d'); ng.strokeStyle = '#ff6a13'; ng.lineWidth = 7;
  for (let i = -64; i <= 128; i += 21) { ng.beginPath(); ng.moveTo(i, 0); ng.lineTo(i + 64, 64); ng.stroke(); ng.beginPath(); ng.moveTo(i + 64, 0); ng.lineTo(i, 64); ng.stroke(); }
  ng.fillStyle = '#ff6a13'; ng.fillRect(0, 0, 64, 8);
  const netTexture = new THREE.CanvasTexture(netCanvas); netTexture.wrapS = THREE.RepeatWrapping; netTexture.colorSpace = THREE.SRGBColorSpace;
  const netGeo = new THREE.PlaneGeometry(1, NET_H).translate(0, NET_H / 2, 0).rotateY(Math.PI / 2);
  const uv = netGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * POST_GAP / 0.45, uv.getY(i) * NET_H / 0.45 + 0.02);
  netTexture.wrapT = THREE.RepeatWrapping;
  place(netGeo, new THREE.MeshLambertMaterial({ map: netTexture, alphaTest: 0.4, side: THREE.DoubleSide, transparent: false }), nets, s => { segment(s, 0); sc.set(1, 1, sc.z); });
  // RFID gates: grey pedestals with a reader panel and a swing arm across each lane.
  place(new THREE.BoxGeometry(0.26, 1.05, 1.0).translate(0, 0.525, 0), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.4, metalness: 0.5 }), pedestals, ([x, y, z, yaw]) => { v.set(x, y, z); q.setFromEuler(e.set(0, yaw, 0)); sc.set(1, 1, 1); }, true);
  place(new THREE.BoxGeometry(0.2, 0.2, 0.05).rotateX(-0.6).translate(-0.2, 1.1, -0.3), new THREE.MeshStandardMaterial({ color: 0x1b2a33, emissive: 0x38d26b, emissiveIntensity: 0.9 }), readers, ([x, y, z, yaw]) => { v.set(x, y, z); q.setFromEuler(e.set(0, yaw, 0)); sc.set(1, 1, 1); });
  place(new THREE.BoxGeometry(0.85, 0.06, 0.06).translate(-0.55, 0.9, 0), new THREE.MeshLambertMaterial({ color: 0xe8b51c }), arms, ([x, y, z, yaw]) => { v.set(x, y, z); q.setFromEuler(e.set(0, yaw, 0)); sc.set(1, 1, 1); });

  // Waiting riders: low-poly, instanced, drawn for the nearest few bases only.
  const ACTIVE = lowEnd ? 2 : 4, PER = 40, count = ACTIVE * PER;
  const standard = color => new THREE.MeshLambertMaterial({ color });
  const parts = [];
  const part = (geometry, material, tint) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.count = 0; root.add(mesh); registerShadow(mesh); parts.push({ mesh, tint }); return mesh;
  };
  const legs = mergeGeometries([-1, 1].map(s => new THREE.CapsuleGeometry(0.1, 0.55, 2, 6).translate(s * 0.12, 0.42, 0)));
  const arms2 = mergeGeometries([-1, 1].map(s => new THREE.CapsuleGeometry(0.075, 0.42, 2, 5).rotateZ(s * 0.25).translate(s * 0.3, 1.05, 0.04)));
  const skis = mergeGeometries([
    ...[-1, 1].map(s => new THREE.BoxGeometry(0.085, 0.03, 1.7).translate(s * 0.13, 0.03, 0.12)),
    ...[-1, 1].map(s => new THREE.CylinderGeometry(0.012, 0.012, 1.15, 4).rotateX(0.25).translate(s * 0.42, 0.62, 0.15)),
  ]);
  part(legs, standard(0xffffff), (i, r) => [0x2b2f36, 0x4b5a3f, 0xc9c9c2, 0x1f2a44, 0x5b3a2e][r % 5]);
  part(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8).translate(0, 1.1, 0), standard(0xffffff), (i, r) => [0xd8452f, 0x2f7fb5, 0xe7b83a, 0x6f6fb8, 0x4f7f5a, 0xe8e6dc, 0x222630, 0xc0577f][(r >> 3) % 8]);
  part(arms2, standard(0xffffff), (i, r) => [0xd8452f, 0x2f7fb5, 0xe7b83a, 0x6f6fb8, 0x4f7f5a, 0xe8e6dc, 0x222630, 0xc0577f][(r >> 3) % 8]);
  part(new THREE.SphereGeometry(0.14, 10, 8).translate(0, 1.6, 0), standard(0xffffff), (i, r) => [0x1d2024, 0xf0f0ec, 0x8a1f22, 0x2e4a7a][(r >> 6) % 4]);
  part(new THREE.BoxGeometry(0.24, 0.08, 0.06).translate(0, 1.6, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.6 }), (i, r) => [0xe39a2d, 0x2a2f45, 0x9ac7e8][(r >> 2) % 3]);
  const boardMesh = part(new THREE.BoxGeometry(0.27, 0.035, 1.5).translate(0, 0.03, 0), standard(0xffffff), (i, r) => [0x202a3b, 0xe8e6dc, 0x8d2f2f, 0x2f6d6a][(r >> 4) % 4]);
  const skiMesh = part(skis, standard(0xffffff), (i, r) => [0x30343c, 0xb23a2e, 0xdedfe3][(r >> 5) % 3]);
  const color = new THREE.Color();
  const slots = [];    // which base each block of PER instances is showing
  let active = [], since = Infinity;
  const at = { x: 0, z: 0, yaw: 0 };
  const object = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function assign(player) {
    const near = bases.map(b => ({ b, d: Math.hypot(b.x - player.x, b.z - player.z) })).filter(e => e.d < 450).sort((a, b) => a.d - b.d).slice(0, ACTIVE).map(e => e.b);
    if (near.length === active.length && near.every((b, i) => b === active[i])) return;
    active = near;
    for (const { mesh } of parts) mesh.count = active.length * PER;
    active.forEach((b, k) => {
      slots[k] = b;
      for (let i = 0; i < PER; i++) {
        const seed = (hash(b.L.name + i) * 997) | 0;
        for (const { mesh, tint } of parts) mesh.setColorAt(k * PER + i, color.setHex(tint(i, seed)));
      }
    });
    for (const { mesh } of parts) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  function update(player, dt) {
    since += dt;
    if (since > 0.5 || !active.length) { since = 0; assign(player); }
    const t = clock();
    active.forEach((b, k) => {
      // The queue steps forward by one chair-load each time a carrier leaves.
      const gap = b.L.gap || 8, pulses = Math.floor(t / gap), stepT = THREE.MathUtils.smoothstep((t % gap) / Math.min(gap, 2.2), 0, 1);
      const shift = (pulses + stepT) * Math.min(8, b.L.occ) * SPACING, total = b.lengths.at(-1), span = Math.min(b.riders, PER) * SPACING;
      for (let i = 0; i < PER; i++) {
        const index = k * PER + i;
        if (i >= b.riders) { for (const { mesh } of parts) mesh.setMatrixAt(index, zero); continue; }
        // Riders fill the front of the maze; whoever passes the gates rejoins at the back of the line.
        const d = total - 0.4 - ((i * SPACING - shift) % span + span) % span;
        alongPath(b.path, b.lengths, d, at);
        const seed = (hash(b.L.name + i) * 997) | 0, skier = seed % 3 === 0;
        const sway = Math.sin(t * 0.7 + i * 1.7) * 0.15;
        object.position.set(at.x, height(at.x, at.z) + 0.02, at.z);
        object.rotation.set(0, at.yaw + (skier ? 0 : 0.35) + sway, 0);
        object.updateMatrix();
        for (const { mesh } of parts) {
          if ((mesh === boardMesh && skier) || (mesh === skiMesh && !skier)) mesh.setMatrixAt(index, zero);
          else mesh.setMatrixAt(index, object.matrix);
        }
      }
    });
    for (const { mesh } of parts) mesh.instanceMatrix.needsUpdate = true;
  }
  return { root, bases, update, get active() { return active; } };
}
const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
