import * as THREE from 'three';
import { insidePolygon, edgeDistance, signMesh } from './base-landmarks.js';

// Signature landmarks with no OSM footprint, placed beside a mapped lift end or building.
// The models are illustrative treatments, not surveyed replicas. Every position here is approximate:
// each is the flattest clear spot near its anchor, away from lift lines and mapped buildings.
//   anchor: { lift, end: 0 bottom | -1 top } or { building } · near: search radius [min, max] m · size: footprint [w, d] m
export const SIGNATURE_LANDMARKS = [
  // Year-long Hello Kitty collaboration (2025-26); photo spot at the gondola base, outside APPI Plaza.
  { resort: 'appi', name: 'Hello Kitty', sub: 'ハローキティ × APPI', model: 'kitty', anchor: { building: /^APPI Plaza$/ }, face: { lift: /^Appi Gondola$/, end: 0 }, near: [4, 40], size: [3, 3], source: 'https://www.appi.co.jp/en/news/hello-kitty-announcement/' },
  // At the base of the north (Kita) area: curry and noodles, reachable only on skis.
  { resort: 'gala', name: 'Restaurant OLE', sub: 'レストラン オーレ', model: 'ole', anchor: { lift: /^Chariot$/, end: 0 }, near: [30, 110], size: [24, 15], source: 'https://ja.wikipedia.org/wiki/ガーラ湯沢スキー場' },
  // 1972 Olympic flame holder: an old ~5 m concrete tower on the slope at about 450 m, by the Seikadai lift.
  { resort: 'teine', name: 'Sapporo 1972 Olympic Flame', sub: '札幌五輪聖火台', model: 'cauldron', anchor: { lift: /^Seikadai No\. 1 Lift$/, end: -1 }, near: [14, 60], size: [4, 4], source: 'https://www.hokkaido-np.co.jp/movies/detail/5558524991001/' },
  // Herzog & de Meuron's spruce summit restaurant (2015), set perpendicular to the cable-car top station.
  { resort: 'chaserrugg', name: 'Gipfelrestaurant Chäserrugg', sub: 'Herzog & de Meuron', model: 'summit', anchor: { lift: /^Luftseilbahn Iltios-Chäserrugg$/, end: -1 }, near: [20, 70], size: [34, 15], across: true, source: 'https://www.yatzer.com/chaserrugg-herzog-de-meuron' },
];

const centroid = pts => pts.reduce((c, p) => ({ x: c.x + p.x / pts.length, z: c.z + p.z / pts.length }), { x: 0, z: 0 });
function distanceToLine(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

export function createSignatureLandmarks({ scene, resort, lifts, buildings, footprints = [], height }) {
  const root = new THREE.Group(); root.name = 'Signature landmarks'; scene.add(root);
  const landmarks = [], placed = [];
  const lambert = color => new THREE.MeshLambertMaterial({ color });
  const M = {
    snow: lambert(0xf1f5f9), stone: lambert(0x8d8b86), concrete: lambert(0x9b978c), darkConcrete: lambert(0x6f6c65),
    timber: lambert(0x5b4330), dark: lambert(0x2f2b28), spruce: lambert(0xb08a5a), greySpruce: lambert(0x8f8574),
    glass: new THREE.MeshStandardMaterial({ color: 0x3b5361, roughness: 0.15, metalness: 0.4, emissive: 0x3a2a18, emissiveIntensity: 0.3 }),
    white: lambert(0xfbfbf8), red: lambert(0xd81e3a), yellow: lambert(0xf3c623), black: lambert(0x141414),
    bronze: new THREE.MeshStandardMaterial({ color: 0x6e5133, roughness: 0.5, metalness: 0.6 }),
  };

  const findLift = (re, end) => { const L = lifts.find(l => re.test(l.name) && l.pts?.length > 1); return L && { L, ...L.pts.at(end) }; };
  const findBuilding = re => buildings.find(b => re.test(b.name) && b.pts.length > 2);
  const blocked = (x, z, r) => footprints.concat(placed).some(f => insidePolygon(x, z, f) || edgeDistance(x, z, f) < r + 4) ||
    lifts.some(L => L.pts?.length > 1 && (distanceToLine(x, z, L.pts) < r + 8 || [L.pts[0], L.pts.at(-1)].some(p => Math.hypot(p.x - x, p.z - z) < r + 18)));
  // Rectangle corners for a footprint w × d centred on (x, z), its depth axis along yaw.
  const rect = (x, z, yaw, w, d) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({
    x: x + Math.cos(yaw) * u * w / 2 + Math.sin(yaw) * v * d / 2, z: z - Math.sin(yaw) * u * w / 2 + Math.cos(yaw) * v * d / 2,
  }));

  // The flattest clear spot on rings round the anchor; nearer wins between equally flat spots.
  function site(spec, ax, az, yawOf) {
    const [w, d] = spec.size, r = Math.hypot(w, d) / 2;
    let best = null;
    for (let ring = spec.near[0]; ring <= spec.near[1]; ring += 3) {
      for (let k = 0; k < 36; k++) {
        const t = k / 36 * Math.PI * 2, x = ax + Math.sin(t) * ring, z = az + Math.cos(t) * ring;
        if (blocked(x, z, r)) continue;
        const yaw = yawOf(x, z), corners = rect(x, z, yaw, w, d), hs = corners.map(p => height(p.x, p.z)).concat(height(x, z));
        const score = Math.max(...hs) - Math.min(...hs) + ring / 40;
        if (!best || score < best.score) best = { x, z, yaw, corners, score, base: Math.max(...hs), low: Math.min(...hs) };
      }
    }
    return best;
  }

  function box(group, w, h, d, x, y, z, material, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.rotation.x = rx; group.add(mesh); return mesh;
  }
  function ball(group, r, sx, sy, sz, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material);
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); group.add(mesh); return mesh;
  }
  // Gabled timber hall in local space: depth along z (front +z), ridge along x.
  function hall(group, { w, d, wall, rise, eave, cladding, roof = M.snow }) {
    box(group, w, wall, d, 0, wall / 2, 0, cladding);
    const half = d / 2 + eave, slope = Math.hypot(half, rise), pitch = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const panel = box(group, w + eave * 2, 0.35, slope, 0, wall + rise / 2, s * half / 2, roof);
      panel.rotation.x = s * pitch;
    }
    const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.ShapeGeometry(gable), cladding);
      g.material.side = THREE.DoubleSide; g.rotation.y = Math.PI / 2; g.position.set(s * w / 2, wall, 0); group.add(g);
    }
  }

  const MODELS = {
    // Statue on a stone plinth: wide white head, red bow on her left ear, yellow nose, whiskers, no mouth; red ski suit.
    kitty(g) {
      box(g, 1.8, 0.8, 1.8, 0, 0.4, 0, M.stone); box(g, 1.9, 0.12, 1.9, 0, 0.86, 0, M.snow);
      const y = 0.92;
      ball(g, 0.5, 1, 0.9, 0.85, 0, y + 0.75, 0, M.red);                     // body in a red ski suit
      ball(g, 0.2, 1, 0.75, 1.3, -0.24, y + 0.12, 0.08, M.white); ball(g, 0.2, 1, 0.75, 1.3, 0.24, y + 0.12, 0.08, M.white);
      for (const s of [-1, 1]) { const arm = ball(g, 0.17, 1, 2.2, 1, s * 0.52, y + 0.8, 0.06, M.white); arm.rotation.z = s * 0.5; }
      ball(g, 0.18, 1.6, 0.5, 1.1, 0, y + 1.2, 0.18, M.yellow);              // collar
      const head = y + 1.95;
      ball(g, 0.72, 1.3, 0.95, 1.0, 0, head, 0, M.white);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.48, 16), M.white);
        ear.position.set(s * 0.6, head + 0.68, 0); ear.rotation.z = -s * 0.45; g.add(ear);
        ball(g, 0.07, 1, 1.5, 0.6, s * 0.34, head + 0.02, 0.69, M.black);     // eyes
        for (const k of [-1, 0, 1]) {
          const whisker = box(g, 0.36, 0.03, 0.03, s * 0.86, head - 0.1 + k * 0.1, 0.5, M.black);
          whisker.rotation.z = s * k * 0.18; whisker.rotation.y = -s * 0.35;
        }
      }
      ball(g, 0.07, 1.3, 0.85, 0.8, 0, head - 0.14, 0.72, M.yellow);         // nose
      // Bow on her left ear (the viewer's right): two loops and a knot.
      for (const s of [-1, 1]) { const loop = ball(g, 0.2, 1.25, 0.9, 0.55, 0.62 + s * 0.24, head + 0.62 - s * 0.06, 0.25, M.red); loop.rotation.z = s * 0.5; }
      ball(g, 0.1, 1, 1, 0.8, 0.62, head + 0.62, 0.32, M.yellow);
      const sign = signMesh('Hello Kitty', 1.6, { sub: 'ハローキティ × APPI', bg: '#d81e3a' });
      sign.position.set(0, 0.45, 0.91); g.add(sign);
      return 3.6;
    },
    // Slope-side restaurant: timber hall, glass towards the run, sun deck with tables, orange signboard.
    ole(g, spec) {
      const [w, d] = spec.size;
      hall(g, { w, d: d - 4, wall: 5, rise: 3.2, eave: 1.2, cladding: M.timber });
      box(g, w * 0.86, 3.6, 0.15, 0, 2.3, (d - 4) / 2 + 0.05, M.glass);
      for (let x = -w * 0.43; x <= w * 0.43 + 0.01; x += w * 0.86 / 8) box(g, 0.14, 3.8, 0.24, x, 2.3, (d - 4) / 2 + 0.12, M.dark);
      box(g, w, 0.3, 4, 0, 0.6, d / 2 - 2, M.greySpruce); box(g, w + 0.1, 0.12, 4.05, 0, 0.8, d / 2 - 2, M.snow);
      for (const x of [-w * 0.35, -w * 0.12, w * 0.12, w * 0.35]) {
        box(g, 1.4, 0.08, 0.8, x, 1.55, d / 2 - 1.8, M.timber); box(g, 0.1, 0.75, 0.1, x, 1.15, d / 2 - 1.8, M.dark);
      }
      const sign = signMesh('Restaurant OLE', 9, { sub: 'レストラン オーレ', bg: '#c75a1a' });
      sign.position.set(0, 5.6, (d - 4) / 2 + 1.25); g.add(sign);
      return 9;
    },
    // Weathered concrete tower ~5 m with the (unlit) flame bowl on top and a bronze plaque.
    cauldron(g) {
      box(g, 3, 0.5, 3, 0, 0.25, 0, M.darkConcrete); box(g, 3.05, 0.1, 3.05, 0, 0.55, 0, M.snow);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 4, 4), M.concrete);
      tower.rotation.y = Math.PI / 4; tower.position.y = 2.5; g.add(tower);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.55, 0.6, 20, 1, true), M.bronze);
      bowl.material.side = THREE.DoubleSide; bowl.position.y = 4.8; g.add(bowl);
      const sign = signMesh('SAPPORO 1972', 1.3, { sub: '札幌五輪聖火台', bg: '#4b3a26', fg: '#f3dcb0' });
      sign.position.set(0, 1.6, 0.72); g.add(sign);
      return 6;
    },
    // Spruce hall under a broad, low gable: glazed on three sides, covered terrace along the front, timber posts.
    summit(g, spec) {
      const [w, d] = spec.size;
      hall(g, { w, d, wall: 6, rise: 3.6, eave: 3, cladding: M.spruce });
      box(g, w * 0.9, 4, 0.16, 0, 2.6, d / 2 + 0.05, M.glass);
      for (const s of [-1, 1]) box(g, 0.16, 4, d * 0.8, s * (w / 2 + 0.05), 2.6, 0, M.glass);
      for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 10) {
        box(g, 0.12, 4.2, 0.22, x, 2.6, d / 2 + 0.14, M.greySpruce);
        box(g, 0.3, 6, 0.3, x, 3, d / 2 + 2.7, M.spruce);                 // terrace posts at the eave line
      }
      box(g, w, 0.3, 3, 0, 0.15, d / 2 + 1.6, M.greySpruce);
      const sign = signMesh('CHÄSERRUGG', 6, { sub: 'Gipfelrestaurant · 2262 m', bg: '#3a2d22' });
      sign.position.set(0, 5.2, d / 2 + 0.3); g.add(sign);
      return 10;
    },
  };

  for (const spec of SIGNATURE_LANDMARKS) {
    if (spec.resort !== resort) continue;
    let anchor = null, target = null;
    if (spec.anchor.lift) anchor = findLift(spec.anchor.lift, spec.anchor.end);
    else { const B = findBuilding(spec.anchor.building); if (B) anchor = { ...centroid(B.pts), pts: B.pts }; }
    if (spec.face) target = findLift(spec.face.lift, spec.face.end);
    if (!anchor) { console.warn(`${spec.name}: anchor not found`); continue; }
    // A summit building turns side-on to its lift line; others face the target, else back toward the anchor.
    const line = anchor.L && (({ pts }) => { const a = pts.at(-2), b = pts.at(-1); return Math.atan2(b.x - a.x, b.z - a.z); })(anchor.L);
    const yawOf = (x, z) => spec.across ? Math.round((Math.atan2(x - anchor.x, z - anchor.z) - line) / (Math.PI / 2)) * (Math.PI / 2) + line
      : target ? Math.atan2(target.x - x, target.z - z) : Math.atan2(anchor.x - x, anchor.z - z);
    const s = site(spec, anchor.x, anchor.z, yawOf);
    if (!s) { console.warn(`${spec.name}: no clear site`); continue; }
    const group = new THREE.Group(); group.name = `${spec.name} landmark`;
    const tall = MODELS[spec.model](group, spec);
    // Sit on the highest corner; a plinth fills down to the lowest ground.
    if (s.base - s.low > 0.3) {
      const [w, d] = spec.size;
      box(group, w, s.base - s.low + 0.6, d, 0, -(s.base - s.low) / 2 + 0.2, 0, M.stone);
    }
    group.position.set(s.x, s.base, s.z); group.rotation.y = s.yaw;
    group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(group);
    placed.push(s.corners);
    const [w, d] = spec.size;
    landmarks.push({ name: spec.name, x: s.x, z: s.z, area: Math.max(900, w * d), restaurant: spec.model === 'ole' || spec.model === 'summit', hotel: false, height: tall });
    console.log(`landmark ${spec.name} at ${s.x.toFixed(0)}, ${s.z.toFixed(0)} · ${s.base.toFixed(0)} m`);
  }
  return { root, landmarks, footprints: placed };
}
