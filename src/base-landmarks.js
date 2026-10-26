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
  { resort: 'gala', match: /^GALA YUZAWA SKI RESORT$/i, name: 'GALA湯沢 Kawabanga', style: 'station', station: true, lift: /^Diligence$/, storeys: 4, storey: 4.6, look: 'white',
    glassHall: 'GALA', lettering: 'GALA YUZAWA', board: { text: 'ガーラ湯沢駅', sub: 'GALA YUZAWA STATION · スキーセンター カワバンガ', bg: '#fbfbf7', fg: '#1d2a23', band: '#2a8a4a' },
    source: 'https://www.koken-archi.co.jp/works/station/w007475/' },
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

// Station claddings by region: Japanese resorts favour pale metal panels, Swiss and Canadian ones timber over stone.
const STATION_LOOKS = {
  white: { wall: 0xeceeea, trim: 0x8b949b, plinth: 0xb9bcb8, sign: '#1f4e79' },
  panel: { wall: 0xd9dcd7, trim: 0x6d767d, plinth: 0x9fa39f, sign: '#1f4e79' },
  timber: { wall: 0x6b4a32, trim: 0x3a3430, plinth: 0x8f8a82, sign: '#2a2724' },
};
const TIMBER_RESORTS = /^(chaserrugg|cypress)$/;
const lookFor = resort => TIMBER_RESORTS.test(resort) ? 'timber' : 'panel';
const SURFACE = /t-bar|j-bar|platter|drag_lift|magic_carpet|rope_tow/;

// Both ends of every mapped lift, with the unit direction from the end toward the line.
export function liftEnds(lifts) {
  const ends = [];
  for (const L of lifts) {
    const p = L.pts; if (!p || p.length < 2) continue;
    const kind = SURFACE.test(L.type) ? 'surface' : /gondola|cable_car/.test(L.type) ? 'gondola' : 'chair';
    for (const [e, q, end] of [[p[0], p[1], 0], [p.at(-1), p.at(-2), 1]]) {
      const l = Math.hypot(q.x - e.x, q.z - e.z) || 1;
      ends.push({ L, kind, end, x: e.x, z: e.z, dx: (q.x - e.x) / l, dz: (q.z - e.z) / l });
    }
  }
  return ends;
}
const polygonArea = pts => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.z - q.x * p.z; }, 0)) / 2;
// A terminal stands inside the building, or a building named as a gondola station all but touches one.
function housesEnd(pts, e, name = '') {
  return insidePolygon(e.x, e.z, pts) || (e.kind === 'gondola' && STATION.test(name) && !/ticket|券/i.test(name) && edgeDistance(e.x, e.z, pts) < 8);
}
// The working area each terminal model needs clear, in its frame: s from the end toward the line, u across.
// Sizes match the terminal models in index.html and src/lift-exits.js.
const WORK = { gondola: [-6, 24, 9], chair: [-3, 5.5, 5], surface: [-2.5, 2.5, 6.5] };
function overlapsWork(pts, e) {
  const [s0, s1, uh] = WORK[e.kind], at = (s, u) => ({ x: e.x + e.dx * s - e.dz * u, z: e.z + e.dz * s + e.dx * u });
  for (let s = s0; s <= s1; s += 1.5) for (let u = -uh; u <= uh; u += 1.5) { const p = at(s, u); if (insidePolygon(p.x, p.z, pts)) return true; }
  return pts.some(p => { const dx = p.x - e.x, dz = p.z - e.z, s = dx * e.dx + dz * e.dz, u = -dx * e.dz + dz * e.dx; return s > s0 && s < s1 && Math.abs(u) < uh; });
}
// How a mapped building relates to the lift terminals around it:
//   'station': a chair or gondola terminal stands inside it, so it is kept and modelled around the terminal;
//   'clash':   it overlaps a terminal's loading area, hall or bullwheel without housing it, so it gives way;
//   'keep':    anything else, built as usual.
// Applies to every resort, so new resorts get their lift stations without hand work.
export function terminalRelation(B, ends) {
  const pts = B.pts;
  if (!pts || pts.length < 3) return 'keep';
  const c = centroid(pts), r = Math.max(...pts.map(p => Math.hypot(p.x - c.x, p.z - c.z)));
  const near = ends.filter(e => Math.hypot(e.x - c.x, e.z - c.z) < r + 40);
  if (!near.length) return 'keep';
  if (polygonArea(pts) >= 120 && near.some(e => e.kind !== 'surface' && housesEnd(pts, e, B.name))) return 'station';
  return near.some(e => overlapsWork(pts, e)) ? 'clash' : 'keep';
}

// Unnamed footprints take the name of a mapped café, restaurant or hotel point inside them.
export function namePoiBuildings(buildings, pois) {
  for (const poi of pois) {
    const B = buildings.find(b => insidePolygon(poi.x, poi.z, b.pts));
    if (!B) continue;
    poi.building = B;
    if (!B.name) { B.name = poi.name; B.poi = poi.kind; }
  }
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

  // Station buildings around lift terminals (see terminalRelation): the OSM footprint extruded to whole storeys of
  // regional cladding with ribbon windows, a parapet, and a portal wherever a cable leaves through a wall. A housed
  // gondola gets its loading hall projecting out of the portal (the generic timber hall is skipped, see housesTerminal);
  // a housed chair keeps its steel bullwheel housing inside. Profiles add hand-made extras (GALA's glass hall and signs).
  const housed = [];
  function createStation(pts, gmin, gmax, profile, B = {}) {
    const look = STATION_LOOKS[profile.look ?? lookFor(resort)];
    const group = new THREE.Group(); group.name = `${profile.name} model`;
    const white = new THREE.MeshLambertMaterial({ color: look.wall });
    const metal = new THREE.MeshLambertMaterial({ color: look.trim });
    const plinth = new THREE.MeshLambertMaterial({ color: look.plinth });
    const pieces = { white: [], metal: [], glass: [], snow: [], plinth: [] };
    const c = centroid(pts);
    const box = (list, length, h, depth, x, y, z, yaw) => {
      const g = new THREE.BoxGeometry(length, h, depth); g.rotateY(yaw); g.translate(x, y, z); list.push(g);
    };
    // Long axis from the vertex spread: s runs along the building, v across it.
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of pts) { const dx = p.x - c.x, dz = p.z - c.z; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), A = { x: Math.cos(th), z: Math.sin(th) }, N = { x: -A.z, z: A.x };
    const S = p => (p.x - c.x) * A.x + (p.z - c.z) * A.z, V = p => (p.x - c.x) * N.x + (p.z - c.z) * N.z;
    const W = (s, v) => ({ x: c.x + A.x * s + N.x * v, z: c.z + A.z * s + N.z * v });
    // Terminals this building houses, each with its cable heading out through a wall.
    const inside = liftEnds(lifts).filter(e => e.kind !== 'surface' && (!profile.lift || profile.lift.test(e.L.name)) && housesEnd(pts, e, B.name));
    for (const e of inside) {
      e.ground = height(e.x, e.z); e.width = e.kind === 'gondola' ? 19 : 12; e.portalTop = e.ground + (e.kind === 'gondola' ? 11 : 6.5);
      housed.push({ x: e.x, z: e.z });
    }
    // Whole storeys of the OSM height, tall enough to clear every portal.
    const storeys = profile.storeys ?? Math.max(1, Math.round((B.h || 9) / 4.2));
    const storey = profile.storey ?? Math.max(3.6, (B.h || 9) / storeys);
    // Floor level at the terminal: on a slope the downhill side shows a tall plinth and the uphill side digs in.
    const T = inside.find(e => e.kind === 'gondola') ?? inside[0], D = T && { x: T.dx, z: T.dz };
    const floor = T ? T.ground : gmax;
    const y0 = gmin - 1, top = Math.max(floor + storeys * storey, gmax + 3.5, ...inside.map(e => e.portalTop + 2.5));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length, yaw = -Math.atan2(tz, tx);
      let n = { x: -tz, z: tx };
      if (((a.x + b.x) / 2 - c.x) * n.x + ((a.z + b.z) / 2 - c.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      // Where a cable crosses this wall, an opening as wide as its loading bay, up to its portalTop.
      const opens = [];
      for (const e of inside) {
        const den = e.dx * tz - e.dz * tx;
        if (Math.abs(den) < 1e-3) continue;
        const r = ((a.x - e.x) * tz - (a.z - e.z) * tx) / den, u = ((a.x - e.x) * e.dz - (a.z - e.z) * e.dx) / den;
        if (r > 0 && u > -e.width / 2 && u < length + e.width / 2) opens.push({ u0: u - e.width / 2, u1: u + e.width / 2, top: e.portalTop });
      }
      // Wall runs [u0, u1] along the segment, from y = lo to hi.
      const run = (list, u0, u1, lo, hi, out, depth) => {
        u0 = Math.max(0, u0); u1 = Math.min(length, u1); if (u1 - u0 < 0.2 || hi - lo < 0.05) return;
        const m = (u0 + u1) / 2;
        box(list, u1 - u0 + (out ? 0 : depth), hi - lo, depth, a.x + tx * m + n.x * out, (lo + hi) / 2, a.z + tz * m + n.z * out, yaw);
      };
      // A horizontal band of wall, interrupted by any portal it reaches down into.
      const band = (list, lo, hi, out, depth) => {
        const cuts = opens.filter(o => lo < o.top).sort((p, q) => p.u0 - q.u0);
        let u = 0;
        for (const o of cuts) { run(list, u, o.u0, lo, hi, out, depth); if (hi > o.top) run(list, o.u0, o.u1, o.top, hi, out, depth); u = Math.max(u, o.u1); }
        run(list, u, length, lo, hi, out, depth);
      };
      // Plinth up to the floor, solid wall above, then a dark ribbon window and a thin sill on each upper storey.
      band(pieces.plinth, y0, floor + 0.4, 0.05, 0.6);
      band(pieces.white, floor + 0.4, top, 0, 0.5);
      for (let k = 1; k < storeys; k++) {
        const fy = floor + k * storey;
        if (fy + 2.9 > top - 0.3) break;
        band(pieces.glass, fy + 0.9, fy + 2.9, 0.28, 0.08);
        band(pieces.white, fy + 0.75, fy + 0.9, 0.4, 0.3);
      }
      // Ground floor: glazed front on longer façades. On the downhill side it sits on the street, below the uphill floor.
      const gl = Math.max(height(a.x, a.z), height(b.x, b.z));
      if (length > 12) band(pieces.glass, gl + 0.4, gl + 3.0, 0.28, 0.08);
      // Metal parapet and its snow cap.
      band(pieces.metal, top, top + 1.1, 0.3, 0.7);
      band(pieces.snow, top + 1.1, top + 1.3, 0.3, 0.8);
      // Columns between window bays.
      const bays = Math.round(length / 7.2);
      for (let j = 1; j < bays; j++) {
        const u = length * j / bays;
        if (opens.some(o => u > o.u0 && u < o.u1)) continue;
        box(pieces.white, 0.6, top - floor - 1, 0.5, a.x + tx * u + n.x * 0.35, (floor + 1 + top) / 2, a.z + tz * u + n.z * 0.35, yaw);
      }
    }
    // Roof slab (ceiling inside, snow on top).
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.z)));
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }); slab.rotateX(-Math.PI / 2); slab.translate(0, top - 0.4, 0);
    pieces.snow.push(slab);
    // GALA: a glass gable hall over the middle, its gables looking up the mountain and down to the road.
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
    if (profile.glassHall && Number.isFinite(hv0) && hv1 - hv0 > 20) {
      hv0 += 1.5; hv1 -= 1.5;
      const rise = 9, h0 = top + 1.1, s0 = hallS - hallLen / 2, s1 = hallS + hallLen / 2;
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
        const w = W(hallS, v + sgn * 0.35), sign = letteringMesh(profile.glassHall, hallLen * 0.5, { aspect: 3.2 });
        sign.position.set(w.x, h0 + rise * 0.3, w.z); sign.rotation.y = Math.atan2(N.x * sgn, N.z * sgn); group.add(sign);
      }
    }
    // Façades: the longest wall on each side of the long axis.
    const sides = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      let n = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if ((mx - c.x) * n.x + (mz - c.z) * n.z < 0) n = { x: -n.x, z: -n.z };
      if (length > 6) sides.push({ a, b, length, n, mx, mz });
    }
    const longSides = [1, -1].map(sgn => sides.filter(f => (f.n.x * N.x + f.n.z * N.z) * sgn > 0.6).sort((p, q) => q.length - p.length)[0]).filter(Boolean);
    // Hand-made profiles: painted lettering on both, and a station board and entrance canopy on the side away from the cable.
    if (profile.lettering) for (const f of longSides) {
      const yaw = -Math.atan2(f.b.z - f.a.z, f.b.x - f.a.x), w = Math.min(40, f.length * 0.7), t = letteringMesh(profile.lettering, w, { aspect: 7 });
      t.position.set(f.mx + f.n.x * 0.62, top - 0.5 - w / 14, f.mz + f.n.z * 0.62); t.rotation.y = Math.atan2(f.n.x, f.n.z); group.add(t);
      if (!profile.board || (D && (f.n.x * D.x + f.n.z * D.z) > 0)) continue;
      const gl = Math.max(height(f.a.x, f.a.z), height(f.b.x, f.b.z));
      const board = signMesh(profile.board.text, 14, profile.board);
      board.position.set(f.mx + f.n.x * 0.65, gl + 5.8, f.mz + f.n.z * 0.65); board.rotation.y = Math.atan2(f.n.x, f.n.z); group.add(board);
      box(pieces.metal, Math.min(22, f.length * 0.8), 0.45, 4, f.mx + f.n.x * 2.3, gl + 3.7, f.mz + f.n.z * 2.3, yaw);
      box(pieces.snow, Math.min(22, f.length * 0.8) + 0.2, 0.15, 4.2, f.mx + f.n.x * 2.3, gl + 4.0, f.mz + f.n.z * 2.3, yaw);
    }
    // Every other station: its name over the portal the main cable leaves through.
    if (!profile.lettering && T) {
      const label = B.name || T.L.name, f = sides.filter(f => f.n.x * T.dx + f.n.z * T.dz > 0.5).sort((p, q) => q.length - p.length)[0];
      if (label && f) {
        const sign = signMesh(label, Math.min(12, Math.max(4, f.length * 0.6)), { bg: look.sign });
        sign.position.set(f.mx + f.n.x * 0.62, Math.min(top - 1, T.portalTop + 1.8), f.mz + f.n.z * 0.62); sign.rotation.y = Math.atan2(f.n.x, f.n.z); group.add(sign);
      }
    }
    for (const e of inside) {
      const yaw = Math.atan2(e.dx, e.dz);
      // Canopy band over the portal on the outside.
      box(pieces.metal, e.width + 2, 0.8, 0.9, e.x + e.dx * 0.1, e.portalTop + 0.4, e.z + e.dz * 0.1, yaw + Math.PI / 2);
      if (e.kind !== 'gondola') continue;
      // Gondola loading hall projecting through the portal: clad roof on steel columns over the loading bay.
      const cy = e.ground + 3.55, hallW = 14.2, hallL = 26, hc = { x: e.x + e.dx * 9, z: e.z + e.dz * 9 };
      box(pieces.white, hallW, 1.6, hallL, hc.x, cy + 3.6, hc.z, yaw);
      box(pieces.snow, hallW + 0.8, 0.3, hallL + 0.8, hc.x, cy + 4.55, hc.z, yaw);
      box(pieces.metal, hallW + 0.4, 0.5, hallL + 0.4, hc.x, cy + 2.6, hc.z, yaw);
      for (const a of [-1, 1]) for (const b of [-1, -0.33, 0.33, 1]) {
        const x = hc.x + e.dz * a * (hallW / 2 - 0.3) + e.dx * b * (hallL / 2 - 0.3), z = hc.z - e.dx * a * (hallW / 2 - 0.3) + e.dz * b * (hallL / 2 - 0.3);
        const gy = height(x, z), g = new THREE.CylinderGeometry(0.28, 0.28, cy + 2.6 - gy + 1, 8); g.translate(x, (cy + 2.6 + gy - 1) / 2, z); pieces.metal.push(g);
      }
    }
    // Boxes, cylinders and the extruded slab differ in index and uv layout; merge them as plain triangles.
    const plain = g => { const out = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k); return out; };
    for (const [key, material] of Object.entries({ white, metal, glass, snow, plinth })) {
      if (!pieces[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(pieces[key].map(plain)), material);
      pieces[key].forEach(g => g.dispose()); mesh.name = `${profile.name} ${key}`; group.add(mesh);
    }
    group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(group);
    if (profile.lettering || B.name) landmarks.push({ name: profile.name, ...c, area: profile.lettering ? 5000 : 900, restaurant: !!profile.lettering, hotel: false });
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
