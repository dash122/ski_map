import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createAceSummit } from '../src/ace-summit.js';

const data = JSON.parse(fs.readFileSync('public/data/ace-summit.json'));
const lifts = JSON.parse(fs.readFileSync('public/data/osm.json')).lifts;
const end = lifts.find(l => l.n === 'Ace Gondola').c.slice(-2);
assert(Math.hypot((data.osm.geometry[0].lon - end[0]) * 81500, (data.osm.geometry[0].lat - end[1]) * 111100) < 40, 'footprint belongs to Ace summit');
assert.equal(data.restaurant.levels, 2);
const geometry = data.osm.geometry.slice(0, -1);
const pts = geometry.map(p => ({ x: (p.lon - geometry[0].lon) * 81500, z: (geometry[0].lat - p.lat) * 111100 }));
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
const scene = new THREE.Scene();
const model = createAceSummit({ scene, pts, height: () => 813 });
const bounds = new THREE.Box3().setFromObject(model);
assert(bounds.max.y >= 822.2 && bounds.max.y < 823, 'two floors rise above mapped ground');
assert(bounds.min.y >= 813, 'model stays above snow');
assert(model.children.filter(o => o.material?.transparent).length === 4, 'panoramic glazing follows all mapped edges');
assert(model.getObjectByName('Solid roof and ceiling').geometry.type === 'ExtrudeGeometry', 'roof is a closed solid visible from inside');
assert(model.getObjectByName('Restaurant floor').geometry.type === 'ExtrudeGeometry', 'floor has a visible underside');
assert(model.getObjectByName('Restaurant timber and furnishings'), 'restaurant contains opaque furnishings');
model.traverse(o => {
  if (o.geometry) assert([...o.geometry.attributes.position.array].every(Number.isFinite), 'finite model geometry');
});
assert.equal(scene.children[0], model);
console.log('Ace summit: OSM identity, floor count, glazing, placement and finite geometry passed.');
