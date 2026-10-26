import assert from 'node:assert/strict';
import { createRenderQuality } from '../src/render-quality.js';
import { graphicsPreset } from '../src/graphics.js';

const changes = [];
const quality = createRenderQuality({ range: [1, 1.5, 2], pixelRatio: 3, apply: r => changes.push(r) });
const run = (seconds, dt) => { for (let i = 0; i < Math.ceil(seconds / dt); i++) quality.sample(dt); };
assert.equal(quality.ratio, 1.5);
run(12, 1 / 30);
assert.equal(quality.ratio, 1, 'sustained overload reaches the mobile floor');
const beforeRecovery = changes.length;
run(4, 1 / 60);
assert.equal(changes.length, beforeRecovery, 'recovery needs sustained headroom');
run(100, 1 / 60);
assert.equal(quality.ratio, 2, 'recovery stops at the mobile cap');
quality.reset();
run(1, 1 / 30);
quality.sample(30);
run(1, 1 / 30);
assert.equal(quality.ratio, 2, 'tab pauses discard the partial sampling window');
run(3, 1 / 30);
assert(quality.ratio < 2);
const desktop = createRenderQuality({ range: [1, 2, 2], pixelRatio: 3, apply() {} });
assert.equal(desktop.ratio, 2);
const lowDpi = createRenderQuality({ range: [0.75, 1, 1.25], pixelRatio: 0.5, apply() {} });
for (let i = 0; i < 1000; i++) lowDpi.sample(1 / 30);
assert(lowDpi.ratio <= 0.5, 'never exceed the native resolution');
const levels = ['low', 'medium', 'high', 'ultra'].map(l => graphicsPreset(l, false));
for (let i = 1; i < levels.length; i++) {
  assert(levels[i].ratio[2] >= levels[i - 1].ratio[2] && levels[i].treeR > levels[i - 1].treeR, `${levels[i].level} is at least ${levels[i - 1].level}`);
}
assert.equal(graphicsPreset('auto', false).level, 'high', 'auto is High without a touch screen');
assert.equal(graphicsPreset('auto', true).level, 'medium', 'auto is Balanced on phones');
for (const l of ['low', 'medium', 'high', 'ultra']) {
  const phone = graphicsPreset(l, true);
  assert(phone.antialias, `${l} keeps antialiasing on phones`);
  assert(phone.shadows !== 'soft' && phone.ratio[2] <= 2, `${l} stays within phone limits`);
}
console.log('Render quality: overload, recovery, bounds and tab-pause checks passed.');
