import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Lift-base landmarks. Footprints, names and positions come from OSM where it maps them;
// the models are illustrative treatments, not surveyed replicas.
export const BASE_LANDMARKS = [
  // Two storeys under split timber eaves on slender pillars, glass towards the slope, entry deck 1.3 m up; ~13 m tall.
  { resort: 'niseko', match: /^Hanazono EDGE$/i, name: 'HANAZONO EDGE', style: 'edge', height: 7.5, upper: 5.5, source: 'https://architizer.com/projects/niseko-hanazono-resort-new-restaurant-cafebar-hanazono-edge/' },
  // GALA Yuzawa Station / Skicenter Kawabanga (JR East, 1990): a four-storey steel-frame station and ski centre,
  // white walls with the vermilion GALA name. The Shinkansen platform runs underneath; the Diligence gondola
  // boards inside the building and leaves through its mountain-side wall. The station houses the gondola terminal.
  { resort: 'gala', match: /^GALA YUZAWA SKI RESORT$/i, name: 'GALA湯沢 Kawabanga', style: 'station', station: true, lift: /^Diligence$/, storeys: 4, storey: 4.6, source: 'https://www.koken-archi.co.jp/works/station/w007475/' },
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
// Lettering painted straight onto a wall: transparent background.
function letteringMesh(text, width, { color = '#e0452b', weight = 800, aspect = 6 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = Math.round(1536 / aspect);
  const g = canvas.getContext('2d');
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${Math.round(canvas.height * 0.78)}px sans-serif`; g.fillText(text, canvas.width / 2, canvas.height * 0.54, canvas.width * 0.96);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.2 }));
  mesh.name = `${text} lettering`; return mesh;
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

  // GALA Yuzawa Station: the OSM footprint extruded to four storeys of white panels with ribbon windows, a grey
  // metal parapet, a glazed gable hall rising through the middle, and a portal where the gondola leaves.
  // The terminal hall projects out of the portal; the generic gondola hall is skipped (see housesTerminal).
  const housed = [];
  function createStation(pts, gmin, gmax, profile) {
    const group = new THREE.Group(); group.name = `${profile.name} model`;
    const white = new THREE.MeshLambertMaterial({ color: 0xeceeea });
    const metal = new THREE.MeshLambertMaterial({ color: 0x8b949b });
    const pieces = { white: [], metal: [], glass: [], snow: [] };
    const c = centroid(pts), y0 = gmin - 1, top = gmax + profile.storeys * profile.storey;
    const box = (list, length, h, depth, x, y, z, yaw) => {
      const g = new THREE.BoxGeometry(length, h, depth); g.rotateY(yaw); g.translate(x, y, z); list.push(g);
    };
    // Long axis from the vertex spread: s runs along the building, v across it.
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of pts) { const dx = p.x - c.x, dz = p.z - c.z; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), A = { x: Math.cos(th), z: Math.sin(th) }, N = { x: -A.z, z: A.x };
    const S = p => (p.x - c.x) * A.x + (p.z - c.z) * A.z, V = p => (p.x - c.x) * N.x + (p.z - c.z) * N.z;
    const W = (s, v) => ({ x: c.x + A.x * s + N.x * v, z: c.z + A.z * s + N.z * v });
    // The gondola: bottom terminal inside the footprint, cable heading out through a wall.
    const L = lifts.find(l => profile.lift.test(l.name) && l.pts?.length > 1 && insidePolygon(l.pts[0].x, l.pts[0].z, pts));
    let T = null, D = null;
    if (L) {
      T = L.pts[0]; const q = L.pts[1], l = Math.hypot(q.x - T.x, q.z - T.z) || 1; D = { x: (q.x - T.x) / l, z: (q.z - T.z) / l };
      housed.push({ x: T.x, z: T.z });
    }
    const groundT = T ? height(T.x, T.z) : gmin, portalTop = groundT + 11, PORTAL = 19;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length, yaw = -Math.atan2(tz, tx);
      let n = { x: -tz, z: tx };
      if (((a.x + b.x) / 2 - c.x) * n.x + ((a.z + b.z) / 2 - c.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      // Where the cable crosses this wall, an opening PORTAL m wide up to portalTop.
      let open = null;
      if (T) {
        const den = D.x * tz - D.z * tx;
        if (Math.abs(den) > 1e-3) {
          const r = ((a.x - T.x) * tz - (a.z - T.z) * tx) / den, u = ((a.x - T.x) * D.z - (a.z - T.z) * D.x) / den;
          if (r > 0 && u > -PORTAL / 2 && u < length + PORTAL / 2) open = [u - PORTAL / 2, u + PORTAL / 2];
        }
      }
      // Wall runs [u0, u1] along the segment, from y = lo to hi.
      const run = (list, u0, u1, lo, hi, out, depth) => {
        u0 = Math.max(0, u0); u1 = Math.min(length, u1); if (u1 - u0 < 0.2 || hi - lo < 0.05) return;
        const m = (u0 + u1) / 2;
        box(list, u1 - u0 + (out ? 0 : depth), hi - lo, depth, a.x + tx * m + n.x * out, (lo + hi) / 2, a.z + tz * m + n.z * out, yaw);
      };
      const spans = (lo, hi) => (open && lo < portalTop) ? [[0, open[0]], [open[1], length]] : [[0, length]];
      const band = (list, lo, hi, out, depth) => {
        for (const [u0, u1] of spans(lo, hi)) run(list, u0, u1, lo, hi, out, depth);
        if (open && lo < portalTop && hi > portalTop) run(list, open[0], open[1], portalTop, hi, out, depth);
      };
      // Solid wall, then a dark ribbon window and a thin white sill on each storey above the ground floor.
      band(pieces.white, y0, top, 0, 0.5);
      if (open) run(pieces.white, open[0], open[1], portalTop, top, 0, 0.5);
      for (let k = 1; k < profile.storeys; k++) {
        const fy = gmax + k * profile.storey;
        band(pieces.glass, fy + 0.9, fy + 2.9, 0.28, 0.08);
        band(pieces.white, fy + 0.75, fy + 0.9, 0.4, 0.3);
      }
      // Ground floor: glazed entrance front on the long façades, a white plinth on the rest.
      // On the downhill side the ground floor sits on the street, below the uphill floor level.
      const gl = Math.max(height(a.x, a.z), height(b.x, b.z));
      if (length > 12) band(pieces.glass, gl + 0.4, gl + 3.4, 0.28, 0.08);
      // Grey metal parapet and its snow cap.
      band(pieces.metal, top, top + 1.3, 0.3, 0.7);
      band(pieces.snow, top + 1.3, top + 1.5, 0.3, 0.8);
      // Columns between window bays.
      const bays = Math.round(length / 7.2);
      for (let j = 1; j < bays; j++) {
        const u = length * j / bays;
        if (open && u > open[0] && u < open[1]) continue;
        box(pieces.white, 0.6, top - gmax - 1, 0.5, a.x + tx * u + n.x * 0.35, (gmax + 1 + top) / 2, a.z + tz * u + n.z * 0.35, yaw);
      }
    }
    // Roof slab (ceiling inside, snow on top).
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.z)));
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }); slab.rotateX(-Math.PI / 2); slab.translate(0, top - 0.4, 0);
    pieces.snow.push(slab);
    // Gable hall over the middle: glass roof and glazed gable ends looking up the mountain and down to the road.
    const ss = pts.map(S), vs = pts.map(V);
    const halfLong = (Math.max(...ss) - Math.min(...ss)) / 2, sMid = (Math.max(...ss) + Math.min(...ss)) / 2;
    const vAt = s => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const s1 = ss[i], s2 = ss[(i + 1) % pts.length], v1 = vs[i], v2 = vs[(i + 1) % pts.length];
        if ((s1 - s) * (s2 - s) > 0 || s1 === s2) continue;
        const v = v1 + (v2 - v1) * (s - s1) / (s2 - s1); lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      return [lo, hi];
    };
    const hallS = sMid - halfLong * 0.15, hallLen = Math.min(26, halfLong * 0.45);
    let [hv0, hv1] = [-Infinity, Infinity];
    for (const f of [-0.5, 0, 0.5]) { const [lo, hi] = vAt(hallS + f * hallLen); hv0 = Math.max(hv0, lo); hv1 = Math.min(hv1, hi); }
    let hall = null;
    if (Number.isFinite(hv0) && hv1 - hv0 > 20) {
      hv0 += 1.5; hv1 -= 1.5;
      const rise = 9, h0 = top + 1.3, s0 = hallS - hallLen / 2, s1 = hallS + hallLen / 2;
      hall = { s0, s1, v0: hv0, v1: hv1 };
      const P = (s, v, y) => { const w = W(s, v); return [w.x, y, w.z]; };
      // Ridge runs across the building (v), so the gables face the slope and the road.
      const ridge = [P(hallS, hv0, h0 + rise), P(hallS, hv1, h0 + rise)];
      const corner = [P(s0, hv0, h0), P(s1, hv0, h0), P(s1, hv1, h0), P(s0, hv1, h0)];
      const tris = [
        corner[0], corner[3], ridge[1], corner[0], ridge[1], ridge[0],       // roof slope toward s0
        corner[1], ridge[0], ridge[1], corner[1], ridge[1], corner[2],       // roof slope toward s1
        corner[0], ridge[0], corner[1], corner[3], corner[2], ridge[1],      // gable ends
      ].flat();
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3)); gg.computeVertexNormals();
      const glassHall = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x5d7480, roughness: 0.1, metalness: 0.5, emissive: 0x3a2a18, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
      glassHall.name = `${profile.name} glass hall`; group.add(glassHall);
      // White steel frame: rafters across the slopes, ridge beam and gable mullions.
      const ryaw = -Math.atan2(N.z, N.x), pitch = Math.atan2(rise, hallLen / 2), rl = Math.hypot(rise, hallLen / 2);
      for (let k = 0; k <= 8; k++) {
        const v = hv0 + (hv1 - hv0) * k / 8;
        for (const sg of [-1, 1]) {
          const g = new THREE.BoxGeometry(rl, 0.35, 0.35); g.rotateZ(sg * pitch); g.rotateY(-Math.atan2(A.z, A.x));
          const w = W(hallS - sg * hallLen / 4, v); g.translate(w.x, h0 + rise / 2, w.z); pieces.white.push(g);
        }
      }
      { const w = W(hallS, (hv0 + hv1) / 2); box(pieces.white, hv1 - hv0 + 0.6, 0.6, 0.6, w.x, h0 + rise, w.z, ryaw); }
      for (const v of [hv0, hv1]) for (let k = -3; k <= 3; k++) {
        const s = hallS + k * hallLen / 8, hh = rise * (1 - Math.abs(s - hallS) / (hallLen / 2)), w = W(s, v);
        if (hh > 0.3) box(pieces.white, 0.3, hh, 0.3, w.x, h0 + hh / 2, w.z, ryaw);
      }
      // The vermilion GALA name on the gable glass, both ends.
      for (const [v, sgn] of [[hv0, -1], [hv1, 1]]) {
        const w = W(hallS, v + sgn * 0.35), sign = letteringMesh('GALA', hallLen * 0.5, { aspect: 3.2 });
        sign.position.set(w.x, h0 + rise * 0.3, w.z); sign.rotation.y = Math.atan2(N.x * sgn, N.z * sgn); group.add(sign);
      }
    }
    // Lettering on the two long façades, and a JR-style station name board over the entrance on the road side.
    const sides = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      let n = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if ((mx - c.x) * n.x + (mz - c.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      if (length > 15) sides.push({ a, b, length, n, mx, mz });
    }
    // The longest wall on each side of the long axis: the mountain side carries the name, the road side the entrance.
    const longSides = [1, -1].map(sgn => sides.filter(f => (f.n.x * N.x + f.n.z * N.z) * sgn > 0.6).sort((p, q) => q.length - p.length)[0]).filter(Boolean);
    for (const f of longSides) {
      const yaw = -Math.atan2(f.b.z - f.a.z, f.b.x - f.a.x), w = Math.min(40, f.length * 0.7), t = letteringMesh('GALA YUZAWA', w, { aspect: 7 });
      t.position.set(f.mx + f.n.x * 0.62, top - 0.5 - w / 14, f.mz + f.n.z * 0.62); t.rotation.y = Math.atan2(f.n.x, f.n.z); group.add(t);
      if (T && (f.n.x * D.x + f.n.z * D.z) > 0) continue;
      const gl = Math.max(height(f.a.x, f.a.z), height(f.b.x, f.b.z));
      const board = signMesh('ガーラ湯沢駅', 14, { sub: 'GALA YUZAWA STATION · スキーセンター カワバンガ', bg: '#fbfbf7', fg: '#1d2a23', band: '#2a8a4a' });
      board.position.set(f.mx + f.n.x * 0.65, gl + 5.8, f.mz + f.n.z * 0.65); board.rotation.y = Math.atan2(f.n.x, f.n.z); group.add(board);
      // Entrance canopy.
      box(pieces.metal, Math.min(22, f.length * 0.8), 0.45, 4, f.mx + f.n.x * 2.3, gl + 3.7, f.mz + f.n.z * 2.3, yaw);
      box(pieces.snow, Math.min(22, f.length * 0.8) + 0.2, 0.15, 4.2, f.mx + f.n.x * 2.3, gl + 4.0, f.mz + f.n.z * 2.3, yaw);
    }
    // Gondola terminal hall projecting through the portal: white-clad roof on steel columns over the loading bay.
    if (T) {
      const cy = groundT + 3.55, hallW = 14.2, hallL = 26, yaw = Math.atan2(D.x, D.z);
      const hc = { x: T.x + D.x * 9, z: T.z + D.z * 9 };
      box(pieces.white, hallW, 1.6, hallL, hc.x, cy + 3.6, hc.z, yaw);
      box(pieces.snow, hallW + 0.8, 0.3, hallL + 0.8, hc.x, cy + 4.55, hc.z, yaw);
      box(pieces.metal, hallW + 0.4, 0.5, hallL + 0.4, hc.x, cy + 2.6, hc.z, yaw);
      for (const a of [-1, 1]) for (const b of [-1, -0.33, 0.33, 1]) {
        const x = hc.x + D.z * a * (hallW / 2 - 0.3) + D.x * b * (hallL / 2 - 0.3), z = hc.z - D.x * a * (hallW / 2 - 0.3) + D.z * b * (hallL / 2 - 0.3);
        const gy = height(x, z), g = new THREE.CylinderGeometry(0.28, 0.28, cy + 2.6 - gy + 1, 8); g.translate(x, (cy + 2.6 + gy - 1) / 2, z); pieces.metal.push(g);
      }
      // Canopy band over the portal on the outside.
      box(pieces.metal, PORTAL + 2, 0.8, 0.9, T.x + D.x * 0.1, portalTop + 0.4, T.z + D.z * 0.1, yaw + Math.PI / 2);
    }
    // Boxes, cylinders and the extruded slab differ in index and uv layout; merge them as plain triangles.
    const plain = g => { const out = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k); return out; };
    for (const [key, material] of Object.entries({ white, metal, glass, snow })) {
      if (!pieces[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(pieces[key].map(plain)), material);
      pieces[key].forEach(g => g.dispose()); mesh.name = `${profile.name} ${key}`; group.add(mesh);
    }
    group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(group);
    landmarks.push({ name: profile.name, ...c, area: 5000, restaurant: true, hotel: false });
    named.push({ B: { name: profile.name }, pts, profile });
  }
  const housesTerminal = p => housed.some(h => Math.hypot(h.x - p.x, h.z - p.z) < 1);

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
  return { root, building, station: createStation, housesTerminal, finish, landmarks, footprints: extraFootprints };
}
