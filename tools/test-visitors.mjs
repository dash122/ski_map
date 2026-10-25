import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createVisitorNavigation, roundVisitorRoute, carveVisitorRoute } from '../src/npc-routes.js';
import { riderContact } from '../src/visitor-collisions.js';

const stationary = { x: 0, y: 0, z: 0 }, velocity = { x: 20, z: 0 };
assert(riderContact({ x: -5, z: 0 }, { x: 5, y: 0, z: 0 }, stationary, velocity, stationary)?.impulse > 0, 'swept high-speed collision');
assert.equal(riderContact({ x: -5, z: 2 }, { x: 5, y: 0, z: 2 }, stationary, velocity, stationary), null, 'near miss');
assert.equal(riderContact({ x: -5, z: 0 }, { x: 5, y: 3, z: 0 }, stationary, velocity, stationary), null, 'jumping above visitor');
assert.equal(riderContact(stationary, stationary, stationary, stationary, stationary).impulse, 0, 'resting overlap remains stable');

const nav = createVisitorNavigation({ height: (x, z) => 100 - x * 0.2, contains: (x, z) => x >= 0 && x <= 180 && Math.abs(z) <= 36 });
const route = nav.route({ x: 0, z: 0 }, { x: 180, z: 0 });
assert(route?.length, 'connected downhill route');
assert(route.every(e => !e.walk), 'descending edges are snowboardable');
assert.equal(nav.edge({ x: 0, z: 0 }, { x: -1, z: 0 }), null, 'reject boundary crossing');
assert(nav.edge({ x: 18, z: 0 }, { x: 0, z: 0 }).walk, 'uphill approach requires walking');
const gap = createVisitorNavigation({ height: () => 100, contains: (x, z) => !(x > 7 && x < 11) && Math.abs(z) < 1 });
assert.equal(gap.edge({ x: 0, z: 0 }, { x: 18, z: 0 }), null, 'sample entire segment across narrow boundary gap');
const bump = createVisitorNavigation({ height: x => x > 7 && x < 11 ? 0.1 : 0, contains: () => true });
assert(bump.edge({ x: 0, z: 0 }, { x: 18, z: 0 }).walk, 'detect DEM rise between equal-height endpoints');
const blocked = createVisitorNavigation({ height: () => 0, contains: () => true, blocks: () => true });
assert.equal(blocked.route({ x: 0, z: 0 }, { x: 100, z: 0 }), null, 'roads cannot be crossed');
console.log('Visitor navigation checks passed');

const flat = createVisitorNavigation({ height: () => 0, contains: () => true });
const corners = [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 18 }];
const sharp = corners.slice(1).map((b, i) => ({ a: corners[i], b, ...flat.edge(corners[i], b) }));
const rounded = roundVisitorRoute(sharp, flat.edge);
assert(rounded.length > 4, 'turn follows a gradual arc');
assert.deepEqual(rounded[0].a, corners[0], 'preserve start');
assert.deepEqual(rounded.at(-1).b, corners.at(-1), 'preserve destination');
for (let i = 1; i < rounded.length; i++) {
  const a = rounded[i - 1], b = rounded[i];
  const angle = e => Math.atan2(e.b.z - e.a.z, e.b.x - e.a.x);
  assert(Math.abs(angle(b) - angle(a)) < 0.15, 'no sudden heading change through a rounded corner');
}
const restricted = createVisitorNavigation({ height: () => 0, contains: (x, z) => z === 0 || x === 18 });
assert.deepEqual(roundVisitorRoute(sharp, restricted.edge), sharp, 'keep original corner when rounding leaves safe terrain');
console.log('Visitor corner smoothing checks passed');

const downhill = createVisitorNavigation({ height: x => 100 - x * 0.2, contains: () => true });
const a = { x: 0, z: 0 }, b = { x: 120, z: 0 };
const straight = [{ a, b, ...downhill.edge(a, b) }];
const carved = carveVisitorRoute(straight, downhill.edge, () => 0.25);
const otherLine = carveVisitorRoute(straight, downhill.edge, () => 0.75);
assert(carved.some(e => e.b.z > 1) && carved.some(e => e.b.z < -1), 'carve to both sides of the downhill line');
assert.notDeepEqual(carved, otherLine, 'individual descents take varied lines');
assert.deepEqual(carved[0].a, a);
assert.deepEqual(carved.at(-1).b, b);
assert(carved.every(e => downhill.edge(e.a, e.b) && !e.walk), 'all carved segments remain downhill');
for (let i = 1; i < carved.length; i++) {
  assert.deepEqual(carved[i - 1].b, carved[i].a, 'carving path stays connected');
  const heading = e => Math.atan2(e.b.z - e.a.z, e.b.x - e.a.x);
  assert(Math.abs(heading(carved[i]) - heading(carved[i - 1])) < 0.15, 'carving heading changes gradually');
}
const narrow = createVisitorNavigation({ height: x => 100 - x * 0.2, contains: (x, z) => Math.abs(z) < 0.01 });
const fallback = carveVisitorRoute(straight, narrow.edge, () => 0.25);
assert(fallback.every(e => e.a.z === 0 && e.b.z === 0), 'fall back to safe line in narrow terrain');
assert.equal(carved[0].remaining + carved[0].length, carved.reduce((n, e) => n + e.length, 0), 'cache remaining carved distance');
console.log('Visitor randomized carving checks passed');

if (process.env.VISITOR_BROWSER_TEST) {
  const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Serve the built static app in-process; no local server or external network needed.
    await page.route('http://visitors.test/**', async request => {
      const pathname = new URL(request.request().url()).pathname;
      const file = resolve('dist', '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(resolve('dist') + sep)) return request.fulfill({ status: 403 });
      try {
        const body = await readFile(file);
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
        await request.fulfill({ status: 200, body, contentType: types[extname(file)] || 'application/octet-stream' });
      } catch { await request.fulfill({ status: 404, body: '' }); }
    });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://visitors.test/');
    await page.waitForFunction(() => window.__visitors, null, { timeout: 180000 });
    await page.waitForFunction(() => window.__ski.AV.ready, null, { timeout: 60000 });
    const result = await page.evaluate(() => {
      window.__noRender = true;
      const v = window.__visitors, sim = window.__sim;
      if (window.__ski.S.v.length() !== 0 || v.people.some(p => p.currentSpeed !== 0 || p.velocity.length() !== 0)) throw new Error('All riders must start at rest');
      for (let i = 0; i < 120; i++) window.__ski.step(1 / 120);
      if (window.__ski.S.v.length() !== 0) throw new Error('Player must remain at rest until push-off input');
      let climbs = 0, invalid = 0; const states = new Set();
      for (const { route } of v.routes) for (const e of route) {
        if (!v.navigation.edge(e.a, e.b)) invalid++;
        if (!e.walk) for (let i = 1; i <= 100; i++) {
          const h = t => sim.height(e.a.x + (e.b.x - e.a.x) * t, e.a.z + (e.b.z - e.a.z) * t);
          if (h(i / 100) > h((i - 1) / 100) + 0.0001) climbs++;
        }
      }
      for (let t = 0; t < 5400; t += 0.5) { sim.updateLifts(0.5); v.update(0.5, false); for (const p of v.people) states.add(p.state); }
      return { people: v.people.length, routes: v.routes.map(r => r.L.name), climbs, invalid, states: [...states], minLaps: Math.min(...v.people.map(p => p.laps)), laps: v.people.reduce((n, p) => n + p.laps, 0) };
    });
    console.log(JSON.stringify(result, null, 2));
    assert(result.people >= 16, 'real map supports a visible crowd');
    assert.equal(result.climbs, 0, 'all snowboard segments descend on real DEM');
    assert.equal(result.invalid, 0, 'all routes remain inside boundaries and avoid roads');
    assert(result.minLaps >= 1, 'every visitor completes a lift/run cycle');
    assert.deepEqual(result.states.sort(), ['lift', 'run', 'wait']);
    const contactResult = await page.evaluate(() => {
      const v = window.__visitors, p = v.people.find(p => p.state === 'run');
      const before = p.p.clone().addScaledVector(p.dir, -2);
      const s = { p: p.p.clone().addScaledVector(p.dir, 0.2), v: p.dir.clone().multiplyScalar(20), crash: 0, ride: null };
      const hit = v.collide(s, 1 / 30, before);
      window.__ski.camera.position.copy(p.p).add({ x: 6, y: 4, z: 7 });
      v.update(0);
      const slot = v.avatars.pool.find(s => s.avatar.visible);
      return { hit, speed: s.v.length(), stagger: p.bumpTime, pool: v.avatars.pool.length, visible: !!slot,
        independent: slot.rig.B.Hips !== window.__ski.AV.B.Hips,
        sharedGeometry: slot.rig.model.getObjectByProperty('isSkinnedMesh', true)?.geometry === window.__ski.AV.model.getObjectByProperty('isSkinnedMesh', true)?.geometry };
    });
    console.log('Avatar and bump checks:', contactResult);
    assert(contactResult.hit && contactResult.speed < 20 && contactResult.stagger > 0, 'both riders respond to impact');
    assert(contactResult.visible && contactResult.independent && contactResult.sharedGeometry, 'player-quality mesh with independent skeleton');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    if (process.env.VISITOR_SCREENSHOT) {
      await page.evaluate(() => {
        const p = window.__visitors.people.find(p => p.state === 'run').p;
        document.getElementById('intro').hidden = true;
        window.__ski.S.p.copy(p); window.__sim.updateTrees(0, 99);
        window.__ski.camera.position.copy(p).add({ x: 6, y: 4, z: 7 });
        window.__ski.camera.lookAt(p.x, p.y + 0.7, p.z);
        window.__visitors.update(0);
        window.__ski.renderer.render(window.__ski.scene, window.__ski.camera);
      });
      await page.screenshot({ path: process.env.VISITOR_SCREENSHOT });
    }
  } finally { await browser.close(); }
}
