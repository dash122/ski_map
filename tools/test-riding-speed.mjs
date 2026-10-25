import assert from 'node:assert/strict';
import { ridingResistance, visitorTargetSpeed, approachSpeed } from '../src/riding-speed.js';

assert.equal(approachSpeed(0, 12, 0, 0.3), 0, 'zero speed before time advances');
assert(approachSpeed(0, 12, 1 / 60, 0.3) < 0.05, 'gradual launch');
assert.equal(visitorTargetSpeed(0.5, 12), 12, 'individual cruise preference');
assert.equal(visitorTargetSpeed(0.5, 12, true), 1.25, 'walking pace');
assert(ridingResistance(15, 9) > ridingResistance(15, 9, { tuck: true }), 'tuck reduces resistance');
assert(ridingResistance(10, 9, { brake: true }) > ridingResistance(10, 9) + 7, 'effective braking');
assert(ridingResistance(10, 9, { steer: 0.3 }) > ridingResistance(10, 9) + 1.5, 'turns dissipate energy');
assert.equal(ridingResistance(10, 9, { steer: 0.3 }), ridingResistance(10, 9, { steer: -0.3 }), 'symmetric turn resistance');
function simulate(degrees, options = {}) {
  const angle = degrees * Math.PI / 180;
  let speed = 0;
  for (let i = 0; i < 60 * 60; i++) speed = Math.max(0, speed + (9.81 * Math.sin(angle) - ridingResistance(speed, 9.81 * Math.cos(angle), options)) / 60);
  return speed * 3.6;
}
const cruise = simulate(20), tucked = simulate(20, { tuck: true });
assert(cruise > 25 && cruise < 55, 'controlled cruising on a 20-degree slope');
assert(tucked > cruise && tucked < 75, 'faster tucked descent');
assert(simulate(20, { brake: true }) < 1, 'brake holds a stop');
console.log(`Riding speed checks passed: 20-degree cruise ${cruise.toFixed(1)} km/h, tucked ${tucked.toFixed(1)} km/h`);
