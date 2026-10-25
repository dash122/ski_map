import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ridingResistance } from '../src/riding-speed.js';

// Execute the game's actual step/landing functions on a repeatable groomed plane.
// Only terrain, input, rendering effects, and obstacle contacts are substituted.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const physics = html.slice(html.indexOf('function step(dt) {'), html.indexOf('// ---------- Camera ----------'));
if (!physics.startsWith('function step(dt) {')) throw new Error('Cannot locate player physics');

function benchmark(degrees, mode) {
  const angle = degrees * Math.PI / 180, grade = Math.tan(angle);
  const normal = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0);
  const S = { p: new THREE.Vector3(), v: new THREE.Vector3(), f: new THREE.Vector3(Math.cos(angle), -Math.sin(angle), 0), n: normal.clone(), ride: null, air: false, airTime: 0, spin: 0, steer: 0, lean: 0, crash: 0, top: 0, vert: 0, lastY: 0, awaitingPush: false };
  const touch = { steer: 0, T: mode === 'tuck', B: false };
  const noop = () => {};
  const context = vm.createContext({ THREE, S, touch, G: 9.81, keys: new Set(), liftQueue: null, wantJump: false, ridingResistance,
    tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(), right: new THREE.Vector3(), worldUp: new THREE.Vector3(0, 1, 0),
    HALF_W: 100000, HALF_D: 100000, normalAt: (x, z, out) => out.copy(normal), height: x => -x * grade,
    roadBarrier: { blocks: () => false }, visitors: { collide: noop }, treeHit: () => false,
    trail: {}, layTrack: noop, emitSpray: noop, toast: noop, performance,
  });
  vm.runInContext(physics + '\nglobalThis.advancePhysics = step;', context);
  const dt = 1 / 120, checkpoints = {}, reached = {}, samples = [];
  for (let i = 0; i < 60 / dt; i++) {
    const time = i * dt;
    touch.steer = mode === 'linked turns' ? 0.3 * Math.sin(2 * Math.PI * time / 6) : 0;
    context.advancePhysics(dt);
    const speed = S.v.length() * 3.6;
    for (const threshold of [30, 40, 50, 60]) if (reached[threshold] === undefined && speed >= threshold) reached[threshold] = +(time + dt).toFixed(2);
    if (i >= 10 / dt) samples.push(speed);
    if ([5, 10, 30, 60].includes((i + 1) * dt)) checkpoints[(i + 1) * dt] = +speed.toFixed(1);
  }
  return { slope: degrees, mode, initialKmh: 0, atSecondsKmh: checkpoints, meanAfter10sKmh: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1), peakKmh: +S.top.toFixed(1), secondsToSpeed: reached };
}

const results = [10, 20, 30].flatMap(slope => ['straight upright', 'linked turns', 'tuck'].map(mode => benchmark(slope, mode)));
// Guard the measured behavior, including turn losses in the actual physics step.
const value = (slope, mode) => results.find(r => r.slope === slope && r.mode === mode).meanAfter10sKmh;
for (const slope of [20, 30]) {
  assert(value(slope, 'straight upright') - value(slope, 'linked turns') > 8, 'linked turns must materially control speed');
  assert(value(slope, 'linked turns') >= 25 && value(slope, 'linked turns') <= 40, 'controlled intermediate/advanced turn benchmark');
  assert(value(slope, 'tuck') > value(slope, 'straight upright'), 'straight tucking remains faster');
}
assert(value(20, 'tuck') >= 53 && value(20, 'tuck') <= 61, 'fast descent target');
console.log(JSON.stringify({ method: 'Actual player step(), 120 Hz, 60 seconds from rest, constant slope, no obstacles. Linked turns use sinusoidal 0.3 steering with a 6-second period. Results are model outputs, not rider telemetry.', results }, null, 2));
