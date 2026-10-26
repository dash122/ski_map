import { insidePolygon, edgeDistance } from './base-landmarks.js';

// Where a rider stands after a lift: off the unload area, clear of the terminal, huts, buildings and trees, on gentle
// snow with a clear descending run-out ahead (on the piste when there is one). And where they wait at a lift base:
// at the queue maze entrance, facing the gates. Terminal sizes match the models in index.html.
const RING = [10, 13, 16, 19, 22, 26, 30, 35, 40, 46, 52];
const HEADINGS = 24, AHEAD = [4, 8, 12, 18, 24, 30];
const deg = ny => Math.acos(Math.min(1, ny)) * 180 / Math.PI;

export function createLiftExits({ lifts, height, normalAt, onPiste, isRough, footprints = [], queueBases = [], cableSide = 2.6 }) {
  // Keep-out boxes in each terminal's frame: s along the line at that end, u across it (+ is the up-cable side).
  const boxes = [];
  for (const L of lifts) {
    if (!L.path || L.path.length < 2) continue;
    for (const [c, D, end] of [[L.path[0], L.d0, 0], [L.path.at(-1), L.dEnd, 1]]) {
      const back = end ? -1 : 1, add = (s0, s1, u0, u1) => boxes.push({ c, D, s0: Math.min(s0, s1), s1: Math.max(s0, s1), u0: Math.min(u0, u1), u1: Math.max(u0, u1) });
      if (L.surface) { add(-2.5, 2.5, 1.5, 6.5); continue; }
      if (L.gondola) add(back * -6, back * 24, -9, 9);   // hall (9 m in from the bullwheel, 26 m long) and machine room
      else {
        add(back * -3, back * 5.5, -5, 5);               // bullwheel housing
        add(back * 9.5, back * 14.5, -(cableSide + 8), -(cableSide + 2));   // operator hut
      }
    }
  }
  const inBox = (x, z) => boxes.some(({ c, D, s0, s1, u0, u1 }) => {
    const dx = x - c.x, dz = z - c.z, s = dx * D.x + dz * D.z, u = -dx * D.z + dz * D.x;
    return s > s0 && s < s1 && u > u0 && u < u1;
  });
  // Under a line, within reach of the cable or a passing chair.
  const underLine = (x, z, reach) => lifts.some(L => {
    const p = L.path; if (!p || Math.min(Math.hypot(p[0].x - x, p[0].z - z), Math.hypot(p.at(-1).x - x, p.at(-1).z - z)) > 3000) return false;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l));
      if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < reach) return true;
    }
    return false;
  });

  function blockers(cx, cz, rough = isRough) {
    const near = footprints.filter(f => f.some(q => Math.abs(q.x - cx) < 160 && Math.abs(q.z - cz) < 160));
    return (x, z) => rough(x, z) || inBox(x, z) || near.some(f => insidePolygon(x, z, f) || edgeDistance(x, z, f) < 3);
  }

  // Best descending heading from (x, z): drop over 30 m, share on the piste, and whether every step is clear.
  function runOut(x, z, blocked, maxSlope, minSlope) {
    let best = null;
    const h0 = height(x, z);
    for (let a = 0; a < HEADINGS; a++) {
      const ang = a / HEADINGS * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      let prev = h0, ok = true, piste = 0;
      for (const d of AHEAD) {
        const px = x + dx * d, pz = z + dz * d, h = height(px, pz);
        if (blocked(px, pz) || h > prev + 0.3) { ok = false; break; }
        if (onPiste(px, pz)) piste++;
        prev = h;
      }
      if (!ok) continue;
      const drop = h0 - prev, slope = Math.atan2(drop, 30) * 180 / Math.PI;
      if (slope < minSlope || slope > maxSlope) continue;
      // Rideable beats steep: best near 8–18°, with the run underfoot.
      const score = piste / AHEAD.length * 3 - Math.abs(slope - 13) * 0.12;
      if (!best || score > best.score) best = { score, dx, dz, slope, piste: piste / AHEAD.length };
    }
    return best;
  }

  // Top or mid station: search rings round the unload point for clear, gentle snow with a run-out.
  function exitSpot(L, centre = L.path.at(-1), name = `Top of ${L.name}`) {
    const blocked = blockers(centre.x, centre.z), hc = height(centre.x, centre.z);
    // Look first on the side the rider leaves the terminal: ahead of the bullwheel and the up-cable side.
    const D = L.dEnd;
    let best = null;
    // Gentle ground first; where the top sits on a steep face, the least steep spot that still runs out clear;
    // on a flat summit plateau, any clear heading that doesn't climb.
    for (const [maxStand, maxSlope, minSlope] of [[22, 30, 3], [34, 42, 3], [34, 42, 0.3]]) {
    for (const r of RING) for (let a = 0; a < 36; a++) {
      const ang = a / 36 * Math.PI * 2, x = centre.x + Math.cos(ang) * r, z = centre.z + Math.sin(ang) * r;
      if (blocked(x, z) || underLine(x, z, cableSide + 4)) continue;
      const n = normalAt(x, z), stand = deg(n.y);
      if (stand > maxStand) continue;
      const h = height(x, z);
      if (h > hc + 3) continue;                      // never a climb from the station
      const run = runOut(x, z, blocked, maxSlope, minSlope);
      if (!run) continue;
      const s = (x - centre.x) * D.x + (z - centre.z) * D.z;
      const score = run.score + (onPiste(x, z) ? 2.5 : 0) - Math.abs(stand - 9) * 0.08 - r * 0.05 + (s > -6 ? 0.4 : 0);
      if (!best || score > best.score) best = { score, x, z, direction: { x: run.dx, z: run.dz } };
    }
    if (best) break;
    }
    return best && { name, x: best.x, z: best.z, direction: best.direction };
  }

  // Bottom station: just outside the queue maze entrance, facing in, close enough to board.
  function baseSpot(L, name) {
    const base = queueBases.find(b => b.L === L), c = L.path[0];
    if (base && base.path.length > 1) {
      const [e, n] = base.path, dx = e.x - n.x, dz = e.z - n.z, l = Math.hypot(dx, dz) || 1;
      const x = e.x + dx / l * 2.5, z = e.z + dz / l * 2.5;
      if (Math.hypot(x - c.x, z - c.z) < 30 && !isRough(x, z)) return { name, x, z, direction: { x: -dx / l, z: -dz / l } };
    }
    // No maze: clear, level ground behind the loading area, facing the terminal.
    const D = L.d0;
    let best = null;
    // Woods and verges are cleared round a lift base, so a second pass only keeps off buildings and terminals.
    for (const blocked of [blockers(c.x, c.z), blockers(c.x, c.z, () => false)]) {
    for (let s = -8; s >= -40; s -= 2) for (let u = -20; u <= 20; u += 2) {
      const x = c.x + D.x * s - D.z * u, z = c.z + D.z * s + D.x * u;
      if (blocked(x, z) || underLine(x, z, cableSide + 2)) continue;
      const score = -deg(normalAt(x, z).y) * 0.2 - Math.hypot(s + 10, u) * 0.1;
      if (!best || score > best.score) best = { score, x, z };
    }
    if (best) break;
    }
    return best && { name, x: best.x, z: best.z, direction: { x: c.x - best.x, z: c.z - best.z } };
  }

  return { exitSpot, baseSpot, inTerminal: inBox };
}
