import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeather } from '../src/weather.js';
const elements = new Map();
globalThis.document = { getElementById(id) { if (!elements.has(id)) elements.set(id, { addEventListener() {} }); return elements.get(id); } };
// Storage failures must not prevent playing or changing the weather.
globalThis.localStorage = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } };
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2();
const sky = { material: { uniforms: Object.fromEntries(['top', 'horizon', 'sunDir'].map(k => [k, { value: k === 'sunDir' ? new THREE.Vector3() : new THREE.Color() }]).concat(['cloud', 'night', 'disc'].map(k => [k, { value: 0 }]))) } };
const renderer = {}, ambient = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight();
const snowGeo = new THREE.BufferGeometry(), snow = new THREE.Points(snowGeo, new THREE.PointsMaterial());
const weather = createWeather({ scene, renderer, sky, ambient, sun, sunDirection: new THREE.Vector3(), snow, snowGeo, snowCount: 4000, mappedLighting: new THREE.Group() });
assert.equal(weather.time, 'day'); assert.equal(snow.visible, false);
for (const time of ['day', 'sunset', 'night']) for (const kind of ['clear', 'overcast', 'snow', 'storm']) {
  assert(weather.set(time, kind));
  assert(Number.isFinite(scene.fog.density) && scene.fog.density > 0);
  assert.equal(scene.getObjectByName('Rider night headlamp').visible, time === 'night');
  assert.equal(snow.visible, kind === 'snow' || kind === 'storm');
  if (kind === 'snow' || kind === 'overcast') {
    // FogExp2 retains exp(-(density * distance)^2) of the terrain's contrast.
    // Nearby slopes and the mountain across the valley must retain their relief in every time mode.
    for (const distance of [1000, 5000, 8000]) {
      assert(Math.exp(-((scene.fog.density * distance) ** 2)) > 0.75,
        `${time} ${kind} washes out terrain at ${distance}m`);
    }
  }
}
weather.set('day', 'snow'); const snowFog = scene.fog.density, snowCount = snowGeo.drawRange.count, wind = weather.wind;
assert(snowCount >= 3200, 'Ordinary snowfall should use most of the available flakes');
assert(snow.material.size >= 0.2 && snow.material.opacity >= 0.9, 'Flakes should be clearly visible');
weather.set('night', 'storm'); assert(scene.fog.density > snowFog); assert(snowGeo.drawRange.count > snowCount); assert(weather.wind > wind);
weather.update({ p: new THREE.Vector3(100, 500, 100), f: new THREE.Vector3(1, 0, 0) });
assert.equal(scene.getObjectByName('Rider night headlamp').position.y, 501.65);
assert.equal(weather.set('bad', 'clear'), false); assert.equal(weather.time, 'night');
console.log('All 12 time/weather combinations pass; storm, headlamp, and unavailable-storage checks pass.');
