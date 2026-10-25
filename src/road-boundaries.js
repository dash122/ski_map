// World metres; use vector geometry rather than the low-resolution terrain mask.
const distance2 = (x, z, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
};
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function sweptDistance2(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(distance2(a.x, a.z, c, d), distance2(b.x, b.z, c, d), distance2(c.x, c.z, a, b), distance2(d.x, d.z, a, b));
}
export function createRoadBarrier(segments) {
  const cells = new Map(), size = 100;
  const visit = (x0, z0, x1, z1, fn) => {
    for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++)
      for (let z = Math.floor(z0 / size); z <= Math.floor(z1 / size); z++) fn(`${x},${z}`);
  };
  for (const s of segments) visit(Math.min(s.a.x, s.b.x) - s.radius, Math.min(s.a.z, s.b.z) - s.radius,
    Math.max(s.a.x, s.b.x) + s.radius, Math.max(s.a.z, s.b.z) + s.radius, k => { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(s); });
  return {
    contains(x, z) { return (cells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) || []).some(s => distance2(x, z, s.a, s.b) <= s.radius ** 2); },
    blocks(x, z, nx, nz) {
      const candidates = new Set();
      visit(Math.min(x, nx), Math.min(z, nz), Math.max(x, nx), Math.max(z, nz), k => { for (const s of cells.get(k) || []) candidates.add(s); });
      for (const s of candidates) {
        const start = distance2(x, z, s.a, s.b), end = distance2(nx, nz, s.a, s.b), r2 = s.radius ** 2;
        // Allow a lift unload or old save inside a road to escape toward its nearest edge.
        if (start <= r2 && end > start) {
          const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
          const side0 = dx * (z - s.a.z) - dz * (x - s.a.x), side1 = dx * (nz - s.a.z) - dz * (nx - s.a.x);
          if (side0 * side1 >= 0) continue;
        }
        if (sweptDistance2({ x, z }, { x: nx, z: nz }, s.a, s.b) <= r2) return true;
      }
      return false;
    },
  };
}
