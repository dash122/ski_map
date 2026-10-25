// Fetch a resort's OSM data from the main OpenStreetMap API (api/0.6/map) instead of Overpass, for when the public
// Overpass servers are down or crawling. The box is fetched in small tiles (split further if a tile is too dense)
// and written in Overpass "out geom" form, so tools/build_osm.py and tools/build_land.py read it unchanged.
//   RESORT=cypress node tools/fetch_osm_api.mjs tools/data/osm_cypress.json /tmp/osm_land_cypress.json
import fs from 'node:fs/promises';

const id = process.env.RESORT || 'niseko';
const [skiOut, landOut] = process.argv.slice(2);
const resort = JSON.parse(await fs.readFile(new URL('resorts.json', import.meta.url), 'utf8'))[id];
const [W, S, E, N] = resort.bbox;
const API = 'https://api.openstreetmap.org/api/0.6/map.json';
const nodes = new Map(), ways = new Map(), rels = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tile(w, s, e, n, depth = 0) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}?bbox=${w},${s},${e},${n}`, { headers: { 'User-Agent': 'ski_map data tools (github.com/dash122/ski_map)' }, signal: AbortSignal.timeout(120000) }).catch(err => ({ ok: false, status: 0, err }));
    if (res.ok) {
      for (const el of (await res.json()).elements) {
        if (el.type === 'node') nodes.set(el.id, el);
        else if (el.type === 'way') ways.set(el.id, el);
        else rels.set(el.id, el);
      }
      return;
    }
    if (res.status === 400 && depth < 4) {   // too many nodes: split in four
      const mx = (w + e) / 2, my = (s + n) / 2;
      for (const [a, b, c, d] of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) await tile(a, b, c, d, depth + 1);
      return;
    }
    console.warn(`tile ${w},${s} attempt ${attempt + 1}: HTTP ${res.status}`);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`tile ${w},${s},${e},${n} failed`);
}

const STEP = 0.025;
let count = 0;
for (let s = S; s < N - 1e-9; s += STEP) for (let w = W; w < E - 1e-9; w += STEP) {
  await tile(+w.toFixed(5), +s.toFixed(5), +Math.min(E, w + STEP).toFixed(5), +Math.min(N, s + STEP).toFixed(5));
  count++;
  await sleep(300);
}
console.log(`${id}: ${count} tiles, ${nodes.size} nodes, ${ways.size} ways, ${rels.size} relations`);

const geom = w => w.nodes.map(ref => nodes.get(ref)).map(p => (p ? { lat: p.lat, lon: p.lon } : null));
const wayOut = w => ({ type: 'way', id: w.id, tags: w.tags || {}, nodes: w.nodes, geometry: geom(w) });
const relOut = r => ({
  type: 'relation', id: r.id, tags: r.tags || {},
  members: r.members.filter(m => m.type !== 'way' || ways.has(m.ref)).map(m => (m.type === 'way' ? { ...m, geometry: geom(ways.get(m.ref)) } : m)),
});
const meta = { version: 0.6, generator: 'tools/fetch_osm_api.mjs (OpenStreetMap API 0.6 map)', osm3s: { timestamp_osm_base: new Date().toISOString() } };

// Same selection as tools/ski.overpassql.
const ski = [];
for (const w of ways.values()) if (w.tags?.['piste:type'] === 'downhill' || w.tags?.aerialway) ski.push(wayOut(w));
for (const r of rels.values()) if (r.tags?.['piste:type'] === 'downhill') ski.push(relOut(r));
await fs.writeFile(skiOut, JSON.stringify({ ...meta, elements: ski }));

// A superset of tools/land.overpassql; build_land.py keeps only the classes it knows.
const LAND_KEYS = ['landuse', 'natural', 'waterway', 'highway', 'railway', 'leisure', 'amenity', 'building'];
const land = [];
for (const n of nodes.values()) if (n.tags && (n.tags.natural === 'peak' || /^(village|hamlet|neighbourhood|suburb|locality)$/.test(n.tags.place || ''))) land.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.tags });
for (const w of ways.values()) if (w.tags && LAND_KEYS.some(k => k in w.tags)) land.push(wayOut(w));
for (const r of rels.values()) if (r.tags?.type === 'multipolygon' && LAND_KEYS.some(k => k in r.tags)) land.push(relOut(r));
await fs.writeFile(landOut, JSON.stringify({ ...meta, elements: land }));
console.log(`${id}: ${ski.length} ski elements, ${land.length} land elements`);
