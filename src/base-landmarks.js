import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Lift-base landmarks. Footprints, names and positions come from OSM where it maps them;
// the models are illustrative treatments, not surveyed replicas.
export const BASE_LANDMARKS = [
  // Two storeys under split timber eaves on slender pillars, glass towards the slope, entry deck 1.3 m up; ~13 m tall.
  { resort: 'niseko', match: /^Hanazono EDGE$/i, name: 'HANAZONO EDGE', style: 'edge', height: 7.5, upper: 5.5, source: 'https://architizer.com/projects/niseko-hanazono-resort-new-restaurant-cafebar-hanazono-edge/' },
];
// Places without an OSM footprint, set beside a mapped lift base. Positions are approximate.
// A matching OSM point of interest (poi) takes precedence over the placed position.
export const PLACED_LANDMARKS = [
  { resort: 'niseko', name: 'Hana1 Café', poi: /hana\s*1/i, lift: /^Hanazono Hooded Lift #1$/, toward: /^Hanazono EDGE$/i, accent: 0xb5412f, source: 'https://hanazononiseko.com/en/winter/resort/restaurants' },
];
const STATION = /station|terminal|駅|乗り場|乗場|のりば|リフト|ゴンドラ|lift|gondola|aerialway/i;
const NEAR_BASE = 180;      // named buildings this close to a lift's bottom terminal get signage
const KIOSK_POI = /^(cafe|restaurant|fast_food|bar|pub)$/;

export const baseLandmarkProfile = (name, resort) => BASE_LANDMARKS.find(p => p.resort === resort && p.match.test(name));

export function insidePolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function edgeDistance(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}
const centroid = pts => pts.reduce((c, p) => ({ x: c.x + p.x / pts.length, z: c.z + p.z / pts.length }), { x: 0, z: 0 });

// Unnamed footprints take the name of a mapped café, restaurant or hotel point inside them.
export function namePoiBuildings(buildings, pois) {
  for (const poi of pois) {
    const B = buildings.find(b => insidePolygon(poi.x, poi.z, b.pts));
    if (!B) continue;
    poi.building = B;
    if (!B.name) { B.name = poi.name; B.poi = poi.kind; }
  }
}

// Lift terminals have their own models, so OSM footprints on top of them are dropped. Named buildings
// beside a terminal (restaurants, ticket offices) stay unless the terminal point actually falls on them.
export function keepBesideTerminal(B, ends) {
  if (!B.name || STATION.test(B.name)) return false;
  return !ends.some(e => insidePolygon(e.x, e.z, B.pts) || edgeDistance(e.x, e.z, B.pts) < 6);
}

const signCache = new Map();
export function signMaterial(text, { bg = '#23292d', fg = '#fff4df', sub = '', band = '' } = {}) {
  const key = [text, bg, fg, sub, band].join('|');
  if (signCache.has(key)) return signCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = sub ? 256 : 160;
  const g = canvas.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height);
  if (band) { g.fillStyle = band; g.fillRect(0, 0, canvas.width, 22); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 72px sans-serif'; g.fillText(text, 512, sub ? 104 : 84, 960);
  if (sub) { g.globalAlpha = 0.85; g.font = '500 46px sans-serif'; g.fillText(sub, 512, 196, 960); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  material.userData.aspect = canvas.width / canvas.height;
  signCache.set(key, material); return material;
}
export function signMesh(text, width, options) {
  const material = signMaterial(text, options);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / material.userData.aspect), material);
  mesh.name = `${text} sign`; return mesh;
}

// The facade whose outward side faces a point: [a, b, unit tangent, outward normal, length].
function facadeToward(pts, target) {
  const c = centroid(pts);
  let best = null, score = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 3) continue;
    const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
    let nx = -tz, nz = tx;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) { nx = -nx; nz = -nz; }
    const tl = Math.hypot(target.x - mx, target.z - mz) || 1;
    const s = ((target.x - mx) * nx + (target.z - mz) * nz) / tl + Math.min(length, 20) / 40;
    if (s > score) { score = s; best = { a, b, tx, tz, nx, nz, mx, mz, length }; }
  }
  return best;
}

export function createBaseLandmarks({ scene, resort, lifts, height }) {
  const root = new THREE.Group(); root.name = 'Lift-base landmarks'; scene.add(root);
  const bottoms = lifts.filter(L => L.pts?.length > 1).map(L => ({ L, ...L.pts[0] }));
  const nearestBase = (x, z) => bottoms.reduce((best, b) => { const d = Math.hypot(b.x - x, b.z - z); return d < best.d ? { b, d } : best; }, { b: null, d: Infinity });
  const named = [], extraFootprints = [], landmarks = [];
  const timber = new THREE.MeshLambertMaterial({ color: 0x5b4330 });
  const darkTimber = new THREE.MeshLambertMaterial({ color: 0x3a2c22 });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3b5361, roughness: 0.15, metalness: 0.4, emissive: 0x3a2a18, emissiveIntensity: 0.3 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x2c3034 });

  function placeBox(group, w, h, d, x, y, z, yaw, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; group.add(mesh); return mesh;
  }

  // HANAZONO EDGE: the OSM footprint is the lower storey; an inset upper storey, split eaves, glazed slope side.
  function createEdge(pts, base, top, profile) {
    const group = new THREE.Group(); group.name = `${profile.name} model`;
    const c = centroid(pts), slope = nearestBase(c.x, c.z).b ?? c;
    const pieces = { timber: [], dark: [], snow: [], glass: [] };
    const beam = (list, a, b, y, h, depth, out, n) => {
      const length = Math.hypot(b.x - a.x, b.z - a.z); if (length < 0.2) return;
      const g = new THREE.BoxGeometry(length + depth, h, depth);
      g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
      g.translate((a.x + b.x) / 2 + n.x * out, y, (a.z + b.z) / 2 + n.z * out); list.push(g);
    };
    const upper = pts.map(p => ({ x: c.x + (p.x - c.x) * 0.62, z: c.z + (p.z - c.z) * 0.62 }));
    const upperTop = top + profile.upper;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      let n = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
      if (((a.x + b.x) / 2 - c.x) * n.x + ((a.z + b.z) / 2 - c.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      // Lower eave: wide and thin, snow on top, slender steel pillars at its edge.
      beam(pieces.timber, a, b, top + 0.2, 0.35, 3.2, 1.6, n);
      beam(pieces.snow, a, b, top + 0.45, 0.18, 3.3, 1.6, n);
      const bays = Math.max(1, Math.round(length / 4.5));
      for (let j = 0; j <= bays; j++) {
        const x = a.x + (b.x - a.x) * j / bays + n.x * 3, z = a.z + (b.z - a.z) * j / bays + n.z * 3, gy = height(x, z);
        const g = new THREE.CylinderGeometry(0.11, 0.11, top - gy + 0.1, 6); g.translate(x, (top + gy) / 2, z); pieces.dark.push(g);
      }
      // Full-height glass on the facades that look up the slope; timber cladding elsewhere.
      const facing = (slope.x - (a.x + b.x) / 2) * n.x + (slope.z - (a.z + b.z) / 2) * n.z > 0;
      if (facing) {
        beam(pieces.glass, a, b, (base - 2 + top) / 2 + 0.6, top - base + 0.6, 0.12, 0.12, n);
        for (let j = 0; j <= Math.ceil(length / 1.8); j++) {
          const t = j / Math.ceil(length / 1.8), x = a.x + (b.x - a.x) * t + n.x * 0.2, z = a.z + (b.z - a.z) * t + n.z * 0.2;
          const g = new THREE.BoxGeometry(0.08, top - base + 2, 0.08); g.translate(x, (base - 2 + top) / 2, z); pieces.dark.push(g);
        }
        // Entry deck raised 1.3 m above the snow, with steps down to it.
        beam(pieces.timber, a, b, base + 1.2, 0.2, 2.6, 1.4, n);
      } else beam(pieces.timber, a, b, (base - 2 + top) / 2, top - base + 2, 0.1, 0.06, n);
      // Upper storey: inset band of glass under its own, narrower eave.
      const ua = upper[i], ub = upper[(i + 1) % upper.length];
      beam(pieces.glass, ua, ub, (top + upperTop) / 2, profile.upper - 0.6, 0.15, 0, n);
      beam(pieces.timber, ua, ub, upperTop + 0.15, 0.3, 2.4, 1.0, n);
      beam(pieces.snow, ua, ub, upperTop + 0.36, 0.16, 2.5, 1.0, n);
    }
    const tris = THREE.ShapeUtils.triangulateShape(upper.map(p => new THREE.Vector2(p.x, -p.z)), []);
    const roof = [];
    for (const t of tris) for (const k of t) roof.push(upper[k].x, upperTop + 0.3, upper[k].z);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(roof, 3)); rg.computeVertexNormals();
    const roofMesh = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0xf1f5f9, side: THREE.DoubleSide })); group.add(roofMesh);
    for (const [key, material] of [['timber', timber], ['dark', steel], ['snow', snow], ['glass', glass]]) {
      if (!pieces[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(pieces[key]), material); pieces[key].forEach(g => g.dispose());
      mesh.name = `${profile.name} ${key}`; group.add(mesh);
    }
    const front = facadeToward(upper, slope);
    if (front) {
      const sign = signMesh(profile.name, Math.min(14, front.length * 0.8), { bg: '#2d2620', fg: '#f6efe2' });
      sign.position.set(front.mx + front.nx * 0.25, (top + upperTop) / 2 + 0.4, front.mz + front.nz * 0.25);
      sign.rotation.y = Math.atan2(front.nx, front.nz); group.add(sign);
    }
    group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(group);
  }

  // A small timber café stand with a serving hatch, awning and standing tables.
  function createStand(name, x, z, yaw, accent = 0x8a3d2a) {
    const group = new THREE.Group(); group.name = `${name} stand`;
    const y = height(x, z), w = 4.6, d = 3.2, h = 2.9;
    const ax = Math.cos(yaw), az = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    placeBox(group, w, h + 1, d, x, y + h / 2 - 0.5, z, yaw, timber);
    placeBox(group, w + 0.8, 0.25, d + 0.9, x, y + h + 0.1, z, yaw, darkTimber);
    placeBox(group, w + 0.9, 0.3, d + 1.0, x, y + h + 0.35, z, yaw, snow);
    placeBox(group, 2.8, 1.0, 0.1, x + fx * (d / 2 + 0.02), y + 1.65, z + fz * (d / 2 + 0.02), yaw, glass);
    placeBox(group, 3.0, 0.08, 0.5, x + fx * (d / 2 + 0.25), y + 1.1, z + fz * (d / 2 + 0.25), yaw, darkTimber);
    const awning = placeBox(group, 3.4, 0.08, 1.3, x + fx * (d / 2 + 0.6), y + 2.35, z + fz * (d / 2 + 0.6), yaw, new THREE.MeshLambertMaterial({ color: accent }));
    awning.rotation.x = 0.25;
    const sign = signMesh(name, 3.6, { bg: `#${new THREE.Color(accent).getHexString()}` });
    sign.position.set(x + fx * (d / 2 + 0.05), y + h - 0.3, z + fz * (d / 2 + 0.05)); sign.rotation.y = yaw; group.add(sign);
    for (const [side, out] of [[-1.6, 3.8], [1.6, 4.2], [0, 5.6]]) {
      const tx = x + ax * side + fx * out, tz = z + az * side + fz * out, ty = height(tx, tz);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), steel); table.position.set(tx, ty + 0.55, tz); group.add(table);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 10), darkTimber); top.position.set(tx, ty + 1.12, tz); group.add(top);
    }
    group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(group);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: x + ax * u * (w / 2 + 0.5) + fx * v * (d / 2 + 0.5), z: z + az * u * (w / 2 + 0.5) + fz * v * (d / 2 + 0.5) }));
    extraFootprints.push(corners.map(p => ({ ...p })), [{ x: x + fx * 3 - ax * 2.2, z: z + fz * 3 - az * 2.2 }, { x: x + fx * 3 + ax * 2.2, z: z + fz * 3 + az * 2.2 }, { x: x + fx * 6.2 + ax * 2.2, z: z + fz * 6.2 + az * 2.2 }, { x: x + fx * 6.2 - ax * 2.2, z: z + fz * 6.2 - az * 2.2 }]);
    landmarks.push({ name, x, z, area: w * d, restaurant: true, hotel: false });
  }

  // Called for each extruded OSM footprint (walls at base..top). profiled: a hotel or restaurant model already signed it.
  function building(B, pts, base, top, profiled) {
    const profile = baseLandmarkProfile(B.name, resort);
    if (profile) {
      createEdge(pts, base, top, profile);
      const c = centroid(pts);
      landmarks.push({ name: profile.name, ...c, area: 1000, restaurant: true, hotel: false });
      named.push({ B, pts, profile });
      return;
    }
    if (!B.name) return;
    named.push({ B, pts });
    if (profiled) return;
    const c = centroid(pts), near = nearestBase(c.x, c.z);
    if (near.d > NEAR_BASE) return;
    const front = facadeToward(pts, near.b);
    if (!front) return;
    const label = /^lift ticket/i.test(B.name) ? 'LIFT TICKETS' : B.name;
    const sub = /^lift ticket/i.test(B.name) ? 'リフト券売り場' : '';
    const sign = signMesh(label, Math.min(9, Math.max(3.5, front.length * 0.6)), { sub, bg: sub ? '#1f4e79' : '#2a2724' });
    const sy = Math.min(top - 0.6, base + 3.6);
    sign.position.set(front.mx + front.nx * 0.2, sy, front.mz + front.nz * 0.2);
    sign.rotation.y = Math.atan2(front.nx, front.nz); root.add(sign);
  }

  // After all footprints: OSM cafés with no footprint near a lift base, then hand-placed landmarks.
  function finish(pois = [], footprints = []) {
    const clear = (x, z, r) => !footprints.concat(extraFootprints).some(f => insidePolygon(x, z, f) || edgeDistance(x, z, f) < r);
    const offLine = (x, z) => bottoms.every(b => {
      const L = b.L, a = L.pts[0], q = L.pts[1], dx = q.x - a.x, dz = q.z - a.z, l = Math.hypot(dx, dz) || 1;
      const along = ((x - a.x) * dx + (z - a.z) * dz) / l, across = Math.abs((x - a.x) * dz - (z - a.z) * dx) / l;
      return along < -40 || along > 60 || across > 16;    // keep the loading area and queue maze free
    });
    const stand = (name, x, z, toward, accent) => {
      if (!clear(x, z, 4) || !offLine(x, z)) return false;
      createStand(name, x, z, Math.atan2(toward.x - x, toward.z - z), accent); return true;
    };
    for (const poi of pois) {
      if (poi.building || !KIOSK_POI.test(poi.kind)) continue;
      const near = nearestBase(poi.x, poi.z);
      if (near.d < 150) stand(poi.name, poi.x, poi.z, near.b, 0x7a3b2b);
    }
    for (const p of PLACED_LANDMARKS) {
      if (p.resort !== resort || pois.some(poi => p.poi.test(poi.name))) continue;
      const base = bottoms.find(b => p.lift.test(b.L.name));
      const target = named.find(n => p.toward.test(n.B.name));
      if (!base || !target) continue;
      // Just outside the building on the side facing the lift, moving round until the spot is clear.
      const c = centroid(target.pts), heading = Math.atan2(base.x - c.x, base.z - c.z);
      let placed = false;
      for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
        const dx = Math.sin(heading + turn), dz = Math.cos(heading + turn);
        let r = 2; while (r < 120 && (insidePolygon(c.x + dx * r, c.z + dz * r, target.pts) || edgeDistance(c.x + dx * r, c.z + dz * r, target.pts) < 7)) r += 1;
        for (let extra = 0; extra < 24 && !placed; extra += 3) placed = stand(p.name, c.x + dx * (r + extra), c.z + dz * (r + extra), base, p.accent);
        if (placed) break;
      }
    }
    return extraFootprints;
  }
  return { root, building, finish, landmarks, footprints: extraFootprints };
}
