import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insidePolygon, signMesh } from './base-landmarks.js';

// Buildings that house a gondola terminal: the OSM footprint gets its own model, with a portal where the
// cable comes through the wall and doors on the side away from the line. You can't explore inside, but walking
// in through the doors boards the gondola and arriving walks you out through them (see index.html).
// The façades are illustrative; floor counts and uses follow the resort's floor guide.
export const HOUSED_STATIONS = [
  // Gondola top station on the ground floor (ticket gates, lockers, ski school desk); Palpal food court above.
  { resort: 'gala', match: /^Rest House "Cheers"$/, lift: /^Diligence$/, end: -1, name: 'Rest House CHEERS', sub: 'レストハウス チアーズ',
    ground: 5.8, upper: 4.4, wall: 0xdcd9d1, accent: '#1f5d8c', source: 'https://gala.co.jp/winter/assets/media/pdf/facilities/gala_floormap.pdf' },
];
const DOOR_W = 5, DOOR_H = 3.3, PORTAL_W = 13, PORTAL_H = 6.2, CABLE_H = 3.55;

const segmentHit = (a, b, c, d) => {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
};

export function createHousedStations({ scene, resort, buildings, lifts, height }) {
  const root = new THREE.Group(); root.name = 'Housed gondola stations'; scene.add(root);
  const stations = [], doorways = [], landmarks = [];
  for (const profile of HOUSED_STATIONS) {
    if (profile.resort !== resort) continue;
    const B = buildings.find(b => profile.match.test(b.name) && b.pts.length > 2);
    const L = lifts.find(l => profile.lift.test(l.name) && l.pts?.length > 1);
    if (!B || !L) { console.warn(`${profile.name}: footprint or lift not found`); continue; }
    const pts = B.pts, end = L.pts.at(profile.end), prev = L.pts.at(profile.end < 0 ? -2 : 1);
    if (!insidePolygon(end.x, end.z, pts)) { console.warn(`${profile.name}: terminal is not inside the footprint`); continue; }
    const station = build(profile, pts, L, end, prev);
    if (!station) { console.warn(`${profile.name}: no wall to put the doors in`); continue; }
    stations.push(station); doorways.push(station.door);
    landmarks.push({ name: profile.name, x: end.x, z: end.z, area: 2000, restaurant: true, hotel: false });
  }

  function build(profile, pts, L, end, prev) {
    const group = new THREE.Group(); group.name = `${profile.name} station building`;
    const floor = height(end.x, end.z);
    let gmin = Infinity, gmax = -Infinity;
    for (const p of pts) { const h = height(p.x, p.z); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
    const mid = floor + profile.ground, top = Math.max(mid + profile.upper, gmax + 4.5), bottom = gmin - 1;
    // Outward normal per edge.
    const edges = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
      let nx = -tz, nz = tx;
      if (insidePolygon((a.x + b.x) / 2 + nx * 0.5, (a.z + b.z) / 2 + nz * 0.5, pts)) { nx = -nx; nz = -nz; }
      return { a, b, length, tx, tz, nx, nz, openings: [] };
    });
    // Portal where the incoming line crosses the wall; doors where the line, carried on, leaves the building.
    const line = L.pts.length > 2 ? (end === L.pts.at(-1) ? L.pts.slice(-4) : L.pts.slice(0, 4).reverse()) : [prev, end];
    const dir = { x: end.x - prev.x, z: end.z - prev.z }, dl = Math.hypot(dir.x, dir.z) || 1; dir.x /= dl; dir.z /= dl;
    const far = { x: end.x + dir.x * 500, z: end.z + dir.z * 500 };
    let door = null;
    edges.forEach((E, i) => {
      for (let k = 1; k < line.length; k++) {
        const hit = segmentHit(E.a, E.b, line[k - 1], line[k]);
        if (hit) E.openings.push({ at: hit.t * E.length, w: PORTAL_W, y0: bottom, y1: floor + PORTAL_H, portal: true });
      }
      const exit = segmentHit(E.a, E.b, end, far);
      if (exit && (!door || exit.u < door.u)) door = { i, u: exit.u, t: exit.t };
    });
    if (!door) return null;
    const DE = edges[door.i], dx = DE.a.x + (DE.b.x - DE.a.x) * door.t, dz = DE.a.z + (DE.b.z - DE.a.z) * door.t, dy = height(dx + DE.nx, dz + DE.nz);
    DE.openings.push({ at: door.t * DE.length, w: DOOR_W, y0: bottom, y1: dy + DOOR_H, door: true });

    const parts = { wall: [], plinth: [], glass: [], frame: [], snow: [], steel: [], ceiling: [] };
    // A box along an edge from s0 to s1 (metres along it), y0..y1, pushed out by `out`.
    const piece = (list, E, s0, s1, y0, y1, depth = 0.5, out = 0) => {
      if (s1 - s0 < 0.05 || y1 - y0 < 0.05) return;
      const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, depth);
      g.rotateY(-Math.atan2(E.tz, E.tx));
      const s = (s0 + s1) / 2;
      g.translate(E.a.x + E.tx * s + E.nx * out, (y0 + y1) / 2, E.a.z + E.tz * s + E.nz * out); list.push(g);
    };
    for (const E of edges) {
      const open = E.openings.map(o => ({ ...o, s0: Math.max(0, o.at - o.w / 2), s1: Math.min(E.length, o.at + o.w / 2) })).sort((p, q) => p.s0 - q.s0);
      let s = 0;
      for (const o of open) {
        piece(parts.wall, E, s, o.s0, bottom, top);
        piece(parts.wall, E, o.s0, o.s1, o.y1, top);                // lintel over the opening
        piece(parts.frame, E, o.s0, o.s1, o.y1 - 0.35, o.y1, 0.7, 0.05);
        s = o.s1;
      }
      piece(parts.wall, E, s, E.length, bottom, top);
      // Dark plinth along the snow line, a glazed band round the upper floor with mullions, snow on the parapet.
      piece(parts.plinth, E, 0, E.length, bottom, Math.max(bottom + 0.5, Math.min(mid - 1, gmin + 1)), 0.6);
      piece(parts.glass, E, 0.3, E.length - 0.3, mid + 0.7, top - 0.9, 0.2, 0.3);
      for (let m = 1; m < E.length / 2.2; m++) piece(parts.frame, E, m * 2.2 - 0.06, m * 2.2 + 0.06, mid + 0.7, top - 0.9, 0.3, 0.35);
      piece(parts.frame, E, 0, E.length, mid + 0.35, mid + 0.7, 0.7, 0.1);
      piece(parts.frame, E, 0, E.length, top - 0.3, top + 0.4, 0.8);
      piece(parts.snow, E, 0, E.length, top + 0.4, top + 0.6, 0.9);
    }
    // Slope side: glazed entrance hall round the doors, sliding glass doors, a canopy and the name board.
    const ds = door.t * DE.length;
    piece(parts.glass, DE, ds - 8, ds - DOOR_W / 2, dy + 0.2, mid - 0.8, 0.2, 0.3);
    piece(parts.glass, DE, ds + DOOR_W / 2, ds + 8, dy + 0.2, mid - 0.8, 0.2, 0.3);
    for (const sd of [-1, 1]) {
      piece(parts.glass, DE, ds + sd * DOOR_W / 4 - DOOR_W / 4 + 0.05, ds + sd * DOOR_W / 4 + DOOR_W / 4 - 0.05, dy, dy + DOOR_H - 0.35, 0.12, -0.15);
      piece(parts.frame, DE, ds + sd * (DOOR_W / 2) - 0.12, ds + sd * (DOOR_W / 2) + 0.12, dy, dy + DOOR_H, 0.4);
    }
    piece(parts.frame, DE, ds - 0.06, ds + 0.06, dy, dy + DOOR_H - 0.35, 0.3, -0.1);
    piece(parts.frame, DE, ds - 6, ds + 6, dy + DOOR_H + 0.9, dy + DOOR_H + 1.25, 3.4, 1.7);   // canopy
    piece(parts.snow, DE, ds - 6.05, ds + 6.05, dy + DOOR_H + 1.25, dy + DOOR_H + 1.45, 3.5, 1.7);
    for (const sd of [-1, 1]) piece(parts.steel, DE, ds + sd * 5.6 - 0.1, ds + sd * 5.6 + 0.1, dy - 0.5, dy + DOOR_H + 0.9, 0.2, 3.2);
    // Inside: the snow itself is the hall floor (cabins dip below the terminal level on the way in); the bullwheel,
    // a drive house over it, the ceiling and its lights.
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p.x, -p.z)), []);
    const slab = y => {
      const pos = [];
      for (const t of tris) for (const k of t) pos.push(pts[k].x, y, pts[k].z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
    };
    parts.ceiling.push(slab(mid));
    const yaw = Math.atan2(dir.x, dir.z);
    const wheel = new THREE.CylinderGeometry(2.9, 2.9, 0.35, 28); wheel.translate(end.x, floor + CABLE_H + 0.35, end.z); parts.steel.push(wheel);
    const drive = new THREE.BoxGeometry(7, 1.4, 7); drive.rotateY(yaw); drive.translate(end.x, floor + CABLE_H + 1.3, end.z); parts.steel.push(drive);
    const lights = [];
    for (let k = -2; k <= 2; k++) {
      const g = new THREE.BoxGeometry(1.2, 0.08, 6); g.rotateY(yaw); g.translate(end.x - dir.x * (9 + k * 5) + dir.z * 5.5, mid - 0.1, end.z - dir.z * (9 + k * 5) - dir.x * 5.5); lights.push(g);
      const h = g.clone(); h.translate(-dir.z * 11, 0, dir.x * 11); lights.push(h);
    }
    const mats = {
      wall: new THREE.MeshLambertMaterial({ color: profile.wall }), plinth: new THREE.MeshLambertMaterial({ color: 0x55595e }),
      glass: new THREE.MeshStandardMaterial({ color: 0x35505e, roughness: 0.12, metalness: 0.45, emissive: 0x3a2a18, emissiveIntensity: 0.35 }),
      frame: new THREE.MeshLambertMaterial({ color: 0x2d3236 }), snow: new THREE.MeshLambertMaterial({ color: 0xf1f5f9 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8c949b, roughness: 0.45, metalness: 0.6 }),
      ceiling: new THREE.MeshLambertMaterial({ color: 0x3a3d40, side: THREE.DoubleSide }),
    };
    for (const [key, list] of Object.entries(parts)) {
      if (!list.length) continue;
      // The slabs are unindexed and have no UVs, so merge everything that way.
      const flat = list.map(g => { const f = g.index ? g.toNonIndexed() : g; f.deleteAttribute('uv'); return f; });
      const mesh = new THREE.Mesh(mergeGeometries(flat), mats[key]); list.concat(flat).forEach(g => g.dispose());
      mesh.name = `${profile.name} ${key}`; mesh.castShadow = key !== 'ceiling'; mesh.receiveShadow = true; group.add(mesh);
    }
    const lit = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ color: 0xfff1d6 })); lights.forEach(g => g.dispose());
    lit.name = `${profile.name} ceiling lights`; group.add(lit);
    // Roof slab with snow.
    const roofMesh = new THREE.Mesh(slab(top + 0.45), new THREE.MeshLambertMaterial({ color: 0xf1f5f9, side: THREE.DoubleSide })); roofMesh.receiveShadow = true; group.add(roofMesh);
    // Name boards: over the entrance canopy and over the gondola portal.
    const face = E => Math.atan2(E.nx, E.nz);
    const sign = signMesh(profile.name, 11, { sub: profile.sub, bg: profile.accent });
    sign.position.set(dx + DE.nx * 0.45, dy + DOOR_H + 2.6, dz + DE.nz * 0.45); sign.rotation.y = face(DE); group.add(sign);
    for (const E of edges) for (const o of E.openings) {
      if (!o.portal) continue;
      const g = signMesh(`${L.name.toUpperCase()} GONDOLA`, 9, { sub: 'ゴンドラ 山頂駅', bg: profile.accent });
      g.position.set(E.a.x + E.tx * o.at + E.nx * 0.45, Math.min(top - 1.4, o.y1 + 1.4), E.a.z + E.tz * o.at + E.nz * 0.45); g.rotation.y = face(E); group.add(g);
    }
    root.add(group);
    console.log(`${profile.name}: floor ${floor.toFixed(1)} m, roof ${top.toFixed(1)} m, doors at ${dx.toFixed(0)}, ${dz.toFixed(0)}`);
    return {
      profile, pts, L, end,
      door: { L, end: profile.end, name: profile.name, x: dx, z: dz, out: { x: DE.nx, z: DE.nz }, inside: { x: dx - DE.nx * 4, z: dz - DE.nz * 4 } },
    };
  }

  return {
    root, landmarks, doorways,
    // Terminal ends these buildings model themselves, so the generic gondola hall is skipped there.
    housesTerminal: c => stations.some(s => Math.hypot(s.end.x - c.x, s.end.z - c.z) < 3),
    // Solid except at the doors.
    blocks: (x, z) => stations.some(s => insidePolygon(x, z, s.pts) && Math.hypot(x - s.door.x, z - s.door.z) > DOOR_W),
  };
}
