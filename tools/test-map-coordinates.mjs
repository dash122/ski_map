import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapFraction, mapPoint, mapHeading } from '../src/map-coordinates.js';

const meta = JSON.parse(readFileSync(new URL('../public/data/dem.json', import.meta.url)));
const lat = (meta.n + meta.s) / 2 * Math.PI / 180;
const width = (meta.e - meta.w) * 111412.84 * Math.cos(lat);
const depth = (meta.n - meta.s) * (111132.92 - 559.82 * Math.cos(2 * lat));
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} should equal ${b}`);

for (const [cw, ch] of [[400, 320], [1400, 1120]]) {
  const project = (x, z) => mapPoint(x, z, width, depth, cw, ch);
  assert.deepEqual(project(-width / 2, -depth / 2), [0, 0]);
  assert.deepEqual(project(width / 2, depth / 2), [cw, ch]);
  assert.deepEqual(project(0, 0), [cw / 2, ch / 2]);

  // A known gondola mid-station must coincide with its geographic image pixel,
  // DOM station marker, and the player marker when standing at that station.
  const lon = 140.68966, stationLat = 42.89039;
  const u = (lon - meta.w) / (meta.e - meta.w);
  const v = (meta.n - stationLat) / (meta.n - meta.s);
  const x = (u - 0.5) * width, z = (v - 0.5) * depth;
  const [px, py] = project(x, z);
  near(px, u * cw); near(py, v * ch);
  const marker = mapFraction(x, z, width, depth);
  near(px, marker.u * cw); near(py, marker.v * ch);

  // Arrow direction follows projected travel even when map/world aspects differ.
  const end = project(x + 100, z + 100);
  near(mapHeading(100, 100, width, depth, cw, ch), Math.atan2(end[1] - py, end[0] - px));
  near(mapHeading(0, -1, width, depth, cw, ch), -Math.PI / 2);
}
console.log('Map alignment checks passed for terrain bounds, station/player markers, and heading.');
