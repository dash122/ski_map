// Estimated corridors for OSM centrelines; mapped area outlines remain authoritative.
// Slow world-space variation avoids identical parallel edges without noisy scallops.
export function courseWidth(difficulty, x, z, mappedWidth) {
  if (Number.isFinite(mappedWidth) && mappedWidth > 0) return mappedWidth;
  const base = /novice|easy/.test(difficulty) ? 32 : /advanced|expert|extreme/.test(difficulty) ? 23 : 27;
  return base * (1 + 0.09 * Math.sin(x / 135 + z / 190));
}

// OSM rarely carries a width, and one default corridor made cat tracks like Gala Yuzawa's Gezan (下山) course
// as wide as a main piste. Runs named as connectors, access or descent tracks are a narrow lane.
const NARROW_NAME = /下山|連絡|renraku|林道|帰り|ツアー|connector|access|ski[ -]?out|return|cat[ -]?(walk|track)|link|road/i;
export const isConnectorName = name => NARROW_NAME.test(name || '');

// Measure a run's cleared corridor against mapped woods: every ~20 m, step out from the centreline on both
// sides until the trees start. Samples where the woods cover the centreline (woods mapped right over the run)
// or never reach within 60 m (open slopes) say nothing. With enough clean samples the median is the width.
export function measureCourseWidth(points, woodAt, { step = 20, reach = 60 } = {}) {
  const widths = [];
  let tried = 0, next = step / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-3) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (; next < len; next += step) {
      const x = a.x + ux * next, z = a.z + uz * next;
      tried++;
      if (woodAt(x, z)) continue;
      const side = sgn => { for (let r = 2; r <= reach; r += 2) if (woodAt(x - uz * r * sgn, z + ux * r * sgn)) return r; return 0; };
      const l = side(1), r = side(-1);
      if (l && r) widths.push(l + r);
    }
    next -= len;
  }
  if (widths.length < 3 || widths.length < tried * 0.5) return undefined;
  widths.sort((p, q) => p - q);
  return Math.max(8, Math.min(90, widths[widths.length >> 1]));
}

export function courseSegments(points, difficulty, mappedWidth) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 12));
    for (let j = 0; j < steps; j++) {
      const at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      const p = at(j / steps), q = at((j + 1) / steps);
      segments.push({ a: p, b: q, width: courseWidth(difficulty, (p.x + q.x) / 2, (p.z + q.z) / 2, mappedWidth) });
    }
  }
  return segments;
}
