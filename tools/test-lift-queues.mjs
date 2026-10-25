import assert from 'node:assert/strict';
import { planQueue, alongPath } from '../src/lift-queues.js';
import { insidePolygon, keepBesideTerminal, namePoiBuildings } from '../src/base-landmarks.js';

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
assert(keepBesideTerminal({ name: 'Hanazono EDGE', pts: square }, [{ x: 40, z: 10 }]), 'named restaurant beside a terminal stays');
assert(!keepBesideTerminal({ name: 'Hanazono EDGE', pts: square }, [{ x: 10, z: 10 }]), 'terminal point on the footprint drops it');
assert(!keepBesideTerminal({ name: 'Gondola Station', pts: square }, [{ x: 40, z: 10 }]), 'mapped station buildings give way to the terminal model');
assert(!keepBesideTerminal({ name: '', pts: square }, [{ x: 40, z: 10 }]));
const buildings = [{ name: '', pts: square }], pois = [{ name: 'Hana1 Café', kind: 'cafe', x: 5, z: 5 }, { name: 'Kiosk', kind: 'cafe', x: 50, z: 5 }];
namePoiBuildings(buildings, pois);
assert.equal(buildings[0].name, 'Hana1 Café', 'POI names its footprint');
assert(!pois[1].building, 'a POI outside every footprint stays free for a stand');
console.log('Lift queue layout, terminal footprint and POI naming checks passed');
