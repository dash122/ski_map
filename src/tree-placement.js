import * as THREE from 'three';
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function generateTrees(config, ci, cj) {
  const { WIDTH, DEPTH, TREE_CHUNK, TREE_STEP, TREE_KEEP, TREE_CELL, LW, LH, LPX, DEN, FLORA, FIXED_HITS, H, GX, CX, CZ, MESH_ST, MESH_X, MESH_Z } = config;
  const treeGrid = new Map();
  const lidx = (x, z) => {
    const i = Math.floor((x + WIDTH / 2) * LPX), j = Math.floor((z + DEPTH / 2) * LPX);
    return i >= 0 && j >= 0 && i < LW && j < LH ? j * LW + i : -1;
  };
  const TREELINE = (x, z) => FLORA.treeline + (vnoise(x / 900, z / 900) - 0.5) * 260;
  const nearFixed = (x, z, pad) => {
    for (let k = 0; k < FIXED_HITS.length; k += 3) if (Math.hypot(x - FIXED_HITS[k], z - FIXED_HITS[k + 1]) < FIXED_HITS[k + 2] + pad) return true;
    return false;
  };
function height(x, z) {
  let fi = (x + WIDTH / 2) / (CX * MESH_ST), fj = (z + DEPTH / 2) / (CZ * MESH_ST);
  fi = Math.min(MESH_X - 1.001, Math.max(0, fi)); fj = Math.min(MESH_Z - 1.001, Math.max(0, fj));
  const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, k = (j * GX + i) * MESH_ST, e = MESH_ST, r = GX * MESH_ST;
  // Match the mesh's a-c-b / b-c-d split rather than bilinear, which bulges above or below flat triangles.
  const a = H[k], b = H[k + e], c = H[k + r], d = H[k + r + e];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
  const fir = [], rime = [], card = [];
  const x0 = ci * TREE_CHUNK, z0 = cj * TREE_CHUNK;
  for (let z = z0; z < z0 + TREE_CHUNK; z += TREE_STEP) for (let x = x0; x < x0 + TREE_CHUNK; x += TREE_STEP) {
    const jx = x + hash2(x * 7, z * 3) * TREE_STEP, jz = z + hash2(x * 5, z * 11) * TREE_STEP;
    if (Math.abs(jx) > WIDTH / 2 - 20 || Math.abs(jz) > DEPTH / 2 - 20) continue;
    const k = lidx(jx, jz); if (k < 0 || !DEN[k]) continue;
    if (hash2(jx * 13, jz * 17) > DEN[k] / 255 * TREE_KEEP) continue;
    if (nearFixed(jx, jz, 8)) continue;   // a clearing round statues and the like
    const h = height(jx, jz), tl = TREELINE(jx, jz), r = hash2(jx * 3, jz * 29), s0 = hash2(jx * 19, jz * 23), rot = hash2(jx, jz) * Math.PI * 2;
    const add = (list, s, sy, coll, extra, angle = rot) => {
      list.push([jx, h - 0.3, jz, s, sy, angle, extra]);
      const key = `${Math.floor(jx / TREE_CELL)},${Math.floor(jz / TREE_CELL)}`;
      if (!treeGrid.has(key)) treeGrid.set(key, []);
      treeGrid.get(key).push(jx, jz, coll);
    };
    // Juhyo: 4–9 m, a little stockier with height in the band, windward face to the north-west (rot -π/4).
    const addJuhyo = () => { const s = 0.65 + s0 * 0.8; add(rime, s, s * (0.9 + hash2(jx * 61, jz * 67) * 0.3), 1.5 * s + 0.3, 0, -Math.PI / 4 + (r - 0.5) * 0.6); };
    if (h > tl - 40) {
      // Treeline: rime-crusted firs (stunted, snow-laden firs outside Japan) and low stunted birch or larch.
      if (FLORA.juhyo) addJuhyo();   // Zao: nothing but snow monsters up to the ridge
      else if (r < 0.75) { const s = 0.5 + s0 * 0.6; if (FLORA.rime) add(rime, s, s, 0.6 * s + 0.4); else add(fir, s * 0.8, s * 0.85, 0.45 * s + 0.3); }
      else { const s = 3 + s0 * 2; add(card, s * 0.8, s, 0.3, 0); }
      continue;
    }
    // Zao's juhyo band starts lower and is almost pure monster by the top of it.
    const rimeShare = FLORA.juhyo ? THREE.MathUtils.smoothstep(h, tl - 420, tl - 120)
      : FLORA.rime ? THREE.MathUtils.smoothstep(h, tl - 200, tl - 40) * 0.7 : 0;
    const conifer = THREE.MathUtils.clamp((h < FLORA.low ? 0.5 : FLORA.conifer) + (vnoise(jx / 260, jz / 260) - 0.5) * 1.1, 0.05, FLORA.conifer > 0.8 ? 0.98 : 0.9);
    if (r < rimeShare) { if (FLORA.juhyo) addJuhyo(); else { const s = 0.6 + s0 * 0.7; add(rime, s, s, 0.6 * s + 0.4); } }
    // Zao's upper slopes are near-pure Maries fir: no beech in the juhyo band.
    else if (hash2(jx * 31, jz * 37) < conifer || (FLORA.juhyo && h > tl - 420)) {
      if (h < FLORA.low && vnoise(jx / 600 + 40, jz / 600) > 0.74) { const s = 11 + s0 * 7; add(card, s * 0.45, s, 0.3, 2); }   // larch plantation
      else { const s = 0.75 + s0 * 0.85; add(fir, s, s * (0.9 + hash2(jx * 41, jz) * 0.25), 0.45 * s + 0.35); }
    } else if (hash2(jx * 53, jz * 59) < FLORA.larch) {
      const s = 9 + s0 * 7; add(card, s * 0.45, s, 0.3, 2);                    // larch
    } else if (FLORA.broadleaf === 'beech') {
      const s = 10 + s0 * 7; add(card, s * 0.85, s, 0.3, 3);                   // beech (or red alder)
    } else {
      const white = h < FLORA.low && hash2(jx * 43, jz * 47) < 0.5;
      const s = (white ? 10 : 7) + s0 * (white ? 6 : 6);
      add(card, s * (white ? 0.55 : 0.85), s, 0.3, white ? 1 : 0);
    }
  }

  return { fir, rime, card, collisions: [...treeGrid] };
}
