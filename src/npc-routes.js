// Terrain navigation shared by all visitors. Every edge is checked at 0.5 m intervals,
// including diagonals, so neither a boundary corner nor a DEM rise is skipped.
export function createVisitorNavigation({ height, contains, blocks = () => false, cell = 18 }) {
  const nodes = new Map();
  const point = (i, j) => {
    const key = `${i},${j}`;
    if (!nodes.has(key)) {
      const x = i * cell, z = j * cell;
      nodes.set(key, contains(x, z) ? { x, z, y: height(x, z), key, i, j } : null);
    }
    return nodes.get(key);
  };
  function edge(a, b) {
    if (blocks(a.x, a.z, b.x, b.z)) return null;
    const length = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(length / 0.5));
    let prev = height(a.x, a.z), ascent = 0, walk = false;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!contains(x, z)) return null;
      const y = height(x, z), rise = y - prev;
      if (rise > 0.00001) { walk = true; ascent += rise; }
      if (k && (rise > length / n * 0.22 || -rise > length / n * 0.9)) return null;
      prev = y;
    }
    return { length, walk, cost: length * (walk ? 5 : 1) + ascent * 100 };
  }
  function nearby(p) {
    const out = [], i = Math.round(p.x / cell), j = Math.round(p.z / cell);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const q = point(i + dx, j + dz);
      if (q && edge(p, q)) out.push(q);
    }
    return out;
  }
  function route(start, end, variant = 0) {
    if (!contains(start.x, start.z) || !contains(end.x, end.z)) return null;
    const starts = nearby(start), goals = new Set(nearby(end).filter(p => edge(p, end)).map(p => p.key));
    const costs = new Map(), parents = new Map(), heap = [];
    const push = item => { let i = heap.length; heap.push(item); while (i) { const p = (i - 1) >> 1; if (heap[p].f <= item.f) break; heap[i] = heap[p]; i = p; } heap[i] = item; };
    const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return first; };
    const heuristic = p => Math.hypot(p.x - end.x, p.z - end.z);
    for (const p of starts) { const g = edge(start, p).cost; costs.set(p.key, g); push({ p, g, f: g + heuristic(p) }); }
    let visits = 0;
    while (heap.length && visits++ < 45000) {
      const { p, g } = pop(); if (g !== costs.get(p.key)) continue;
      if (goals.has(p.key)) {
        const path = [end, p]; let q = p;
        while (parents.has(q.key)) { q = parents.get(q.key); path.push(q); }
        path.push(start); path.reverse();
        return roundVisitorRoute(path.slice(1).map((b, i) => ({ a: path[i], b, ...edge(path[i], b) })), edge);
      }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const q = point(p.i + dx, p.j + dz); if (!q) continue;
        // Only short, gentle rises may be walked; never hike back up the mountain.
        if (q.y > height(start.x, start.z) + 3) continue;
        const e = edge(p, q); if (!e) continue;
        const variation = 1 + variant * 0.25 * (1 + Math.sin(q.i * 1.73 + q.j * 2.31));
        const next = g + e.cost * variation;
        if (next >= (costs.get(q.key) ?? Infinity)) continue;
        costs.set(q.key, next); parents.set(q.key, p); push({ p: q, g: next, f: next + heuristic(q) });
      }
    }
    return null;
  }
  return { route, edge };
}

// Round each bend with a tangent quadratic arc. Validate the entire replacement
// before accepting it: smoothing must never cut across a rope, road or uphill patch.
export function roundVisitorRoute(route, checkEdge) {
  if (route.length < 2) return route;
  const points = [route[0].a];
  for (let i = 0; i < route.length - 1; i++) {
    const incoming = route[i], outgoing = route[i + 1], corner = incoming.b;
    const trim = Math.min(8, incoming.length * 0.35, outgoing.length * 0.35);
    if (trim < 0.1 || incoming.walk !== outgoing.walk) { points.push(corner); continue; }
    const entry = { x: corner.x + (incoming.a.x - corner.x) * trim / incoming.length, z: corner.z + (incoming.a.z - corner.z) * trim / incoming.length };
    const exit = { x: corner.x + (outgoing.b.x - corner.x) * trim / outgoing.length, z: corner.z + (outgoing.b.z - corner.z) * trim / outgoing.length };
    const arc = [entry], steps = Math.max(4, Math.ceil(trim * 2 / 0.5));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, s = 1 - t;
      arc.push({ x: s * s * entry.x + 2 * s * t * corner.x + t * t * exit.x, z: s * s * entry.z + 2 * s * t * corner.z + t * t * exit.z });
    }
    const candidate = [points.at(-1), ...arc, outgoing.b];
    const safe = candidate.slice(1).every((b, j) => {
      const e = checkEdge(candidate[j], b);
      return e && e.walk === incoming.walk;
    });
    points.push(...(safe ? arc : [corner]));
  }
  points.push(route.at(-1).b);
  return points.slice(1).flatMap((b, i) => {
    const a = points[i], e = checkEdge(a, b);
    return e && e.length > 0.00001 ? [{ a, b, ...e }] : [];
  });
}

// Choose broad S-turns once per descent, rather than adding frame-by-frame jitter.
// Each arc tapers to the original line with zero lateral speed at both ends.
export function carveVisitorRoute(route, checkEdge, random = Math.random) {
  const result = [];
  for (let i = 0; i < route.length;) {
    if (route[i].walk) { result.push({ ...route[i++] }); continue; }
    const section = [], wavelength = 45 + random() * 35;
    let length = 0;
    do { const e = route[i++]; section.push(e); length += e.length; }
    while (i < route.length && !route[i].walk && length < wavelength);
    if (length < 15) { result.push(...section.map(e => ({ ...e }))); continue; }
    const samples = [{ p: section[0].a, distance: 0, dx: 0, dz: 0 }];
    let distance = 0;
    for (const e of section) {
      const steps = Math.max(1, Math.ceil(e.length / 1.5));
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        samples.push({ p: { x: e.a.x + (e.b.x - e.a.x) * t, z: e.a.z + (e.b.z - e.a.z) * t },
          distance: distance + e.length * t, dx: (e.b.x - e.a.x) / e.length, dz: (e.b.z - e.a.z) / e.length });
      }
      distance += e.length;
    }
    let amplitude = (2.5 + random() * 3) * (random() < 0.5 ? -1 : 1), accepted;
    for (let attempt = 0; attempt < 4 && !accepted; attempt++, amplitude *= 0.5) {
      const points = samples.map(({ p, distance, dx, dz }, j) => {
        if (!j || j === samples.length - 1) return p;
        const t = distance / length;
        const offset = amplitude * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t) ** 2;
        return { x: p.x - dz * offset, z: p.z + dx * offset };
      });
      const edges = [];
      for (let j = 1; j < points.length; j++) {
        const a = points[j - 1], b = points[j], e = checkEdge(a, b);
        if (!e || e.walk) break;
        edges.push({ a, b, ...e });
      }
      if (edges.length === points.length - 1) accepted = edges;
    }
    result.push(...(accepted || section.map(e => ({ ...e }))));
  }
  let remaining = 0;
  for (let i = result.length - 1; i >= 0; i--) { result[i].remaining = remaining; remaining += result[i].length; }
  return result;
}
