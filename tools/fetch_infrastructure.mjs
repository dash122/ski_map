import fs from 'node:fs/promises';
// Only surveyed/mapped OSM nodes. Never manufacture positions from lit=yes.
const query = '[out:json][timeout:60];(node["highway"="street_lamp"](42.815,140.615,42.905,140.745);node["man_made"~"^(mast|tower)$"]["tower:type"="lighting"](42.815,140.615,42.905,140.745););out body;';
let data;
if (process.argv[2]) data = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
else {
  for (const host of ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee']) {
    try {
      const response = await fetch(`https://${host}/api/interpreter?data=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(75000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      data = await response.json(); break;
    } catch (e) { console.warn(`${host}: ${e.message}`); }
  }
}
if (!Array.isArray(data?.elements)) throw Error('No OSM response; existing infrastructure file has been preserved.');
const lamps = data.elements.filter(e => e.type === 'node' && (e.tags?.highway === 'street_lamp' || e.tags?.['tower:type'] === 'lighting')).map(e => {
  const h = Number.parseFloat(e.tags.height);
  return { id: `node/${e.id}`, lon: e.lon, lat: e.lat, kind: e.tags.highway === 'street_lamp' ? 'street_lamp' : 'floodlight', height: Number.isFinite(h) && h > 2 && h < 80 ? h : null, tags: e.tags, source: `https://www.openstreetmap.org/node/${e.id}` };
});
await fs.writeFile('public/data/infrastructure.json', JSON.stringify({ source: '© OpenStreetMap contributors (ODbL)', fetched: data.osm3s?.timestamp_osm_base || new Date().toISOString(), status: 'queried', lamps }, null, 2));
console.log(`${lamps.length} mapped lamps; no inferred pole positions`);
