import assert from 'node:assert/strict';
import { planQueue, alongPath } from '../src/lift-queues.js';
import { insidePolygon, namePoiBuildings, liftEnds, terminalRelation } from '../src/base-landmarks.js';

const quad = planQueue({ gondola: false, occ: 4 });
assert.equal(quad.lanes, 5);
assert(quad.back > quad.front && quad.front > 0, 'maze sits behind the gates');
assert(quad.toSU({ x: 0, y: quad.back }).s < quad.toSU({ x: 0, y: 0 }).s && quad.toSU({ x: 0, y: 0 }).s < 0, 'chair maze is downhill of the terminal');
assert(quad.path.every(p => p.y >= -0.5), 'riders never walk past the gates');
assert(quad.path.every(p => Math.abs(p.x) <= quad.width / 2 + 1e-9), 'queue line stays inside the maze');
assert.equal(quad.ropes.length, quad.lanes - 1, 'a divider between each pair of lanes');
// Serpentine: consecutive rows run in opposite directions.
const rows = quad.path.slice(1, 1 + quad.lanes * 2);
for (let k = 0; k + 3 < rows.length; k += 2) assert(Math.sign(rows[k + 1].x - rows[k].x) === -Math.sign(rows[k + 3].x - rows[k + 2].x));
const blocked = planQueue({ gondola: false, occ: 4 }, (s, u) => u < -2);
assert(blocked.lat <= -6, 'shift the maze sideways away from a building');
const gondola = planQueue({ gondola: true, occ: 8 });
assert(gondola.path.every(p => Math.abs(gondola.toSU(p).u) > 7), 'gondola queue stays outside the station hall');
assert.equal(planQueue({ gondola: true, occ: 8 }, (s, u) => u < 0).side, -1, 'gondola queue moves to the other side of the hall');
assert.equal(planQueue({ gondola: false, occ: 2 }, () => false), null, 'no maze where nothing fits');

const path = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], at = {};
alongPath(path, [0, 10, 20], 15, at);
assert.deepEqual([at.x, at.z], [10, 5]);

const square = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 }];
assert(insidePolygon(5, 5, square) && !insidePolygon(25, 5, square));
// A chair running east from (40, 10) and a gondola running south from (10, 10).
const chairEnds = liftEnds([{ name: 'Quad', type: 'chair_lift', pts: [{ x: 40, z: 10 }, { x: 140, z: 10 }] }]);
const gondolaEnds = liftEnds([{ name: 'Gondola', type: 'gondola', pts: [{ x: 10, z: 10 }, { x: 10, z: 300 }] }]);
assert.equal(chairEnds[0].dx, 1, 'bottom end points up the line');
assert.equal(chairEnds[1].dx, -1, 'top end points back down the line');
assert.equal(terminalRelation({ name: 'Hanazono EDGE', pts: square }, chairEnds), 'keep', 'a building beside a terminal stays');
assert.equal(terminalRelation({ name: '', pts: square }, gondolaEnds), 'station', 'a terminal inside the footprint makes it the station');
const besideBay = [{ x: 40, z: 14 }, { x: 52, z: 14 }, { x: 52, z: 24 }, { x: 40, z: 24 }];
assert.equal(terminalRelation({ name: 'Ticket hut', pts: besideBay }, chairEnds), 'clash', 'a hut on the loading bay gives way');
assert.equal(terminalRelation({ name: 'Gondola Station', pts: square.map(p => ({ x: p.x + 14, z: p.z })) }, gondolaEnds.map(e => ({ ...e, x: e.x + 2 }))), 'station', 'a mapped station a few metres off its terminal houses it');
const tbar = liftEnds([{ name: 'T', type: 't-bar', pts: [{ x: 10, z: 10 }, { x: 10, z: 200 }] }]);
assert.notEqual(terminalRelation({ name: '', pts: square }, tbar), 'station', 'surface lifts never get a station');
assert.equal(terminalRelation({ name: '', pts: square.map(p => ({ x: p.x + 500, z: p.z })) }, gondolaEnds), 'keep');
const buildings = [{ name: '', pts: square }], pois = [{ name: 'Hana1 Café', kind: 'cafe', x: 5, z: 5 }, { name: 'Kiosk', kind: 'cafe', x: 50, z: 5 }];
namePoiBuildings(buildings, pois);
assert.equal(buildings[0].name, 'Hana1 Café', 'POI names its footprint');
assert(!pois[1].building, 'a POI outside every footprint stays free for a stand');
console.log('Lift queue layout, terminal footprint and POI naming checks passed');
