// Estimated corridors for OSM centrelines; mapped area outlines remain authoritative.
// Slow world-space variation avoids identical parallel edges without noisy scallops.
export function courseWidth(difficulty, x, z, mappedWidth) {
  if (Number.isFinite(mappedWidth) && mappedWidth > 0) return mappedWidth;
  const base = /novice|easy/.test(difficulty) ? 32 : /advanced|expert|extreme/.test(difficulty) ? 23 : 27;
  return base * (1 + 0.09 * Math.sin(x / 135 + z / 190));
}

// OSM rarely carries a width, and one default corridor made cat tracks like Gala Yuzawa's Gezan (下山) course
// as wide as a main piste. Connectors and long, gentle return tracks are a narrow lane; everything else keeps
// the difficulty default. A mapped width tag always wins.
const NARROW_NAME = /下山|連絡|林道|帰り|ツアー|connector|access|ski[ -]?out|return|cat[ -]?(walk|track)|link|road/i;
export function narrowCourseWidth(name, points, height) {
  if (NARROW_NAME.test(name || '')) return 11;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  const drop = Math.abs(height(points[0].x, points[0].z) - height(points.at(-1).x, points.at(-1).z));
  return length > 250 && drop / length < 0.09 ? 13 : undefined;
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
