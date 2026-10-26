// Graphics quality presets, chosen on the home screen or the pause menu and remembered per browser.
// "Auto" picks Balanced on touch devices (a modern phone holds 60 fps there) and High elsewhere.
// Antialiasing stays on at every level: on phone GPUs MSAA is cheap, while pixel ratio, soft shadows
// and tree draw distance are what cost frame rate, so those are what the levels trade.
import { pref } from './riders.js';

export const TOUCH = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

export const LEVELS = [
  { id: 'auto', name: '自動', en: 'Auto' },
  { id: 'low', name: '低', en: 'Low' },
  { id: 'medium', name: '均衡', en: 'Balanced' },
  { id: 'high', name: '高', en: 'High' },
  { id: 'ultra', name: '極致', en: 'Ultra' },
];

// ratio: [min, start, max] pixel ratio (the adaptive controller moves within it, capped by the screen).
// lowEnd thins crowds, queues, lift lamps and shared textures; trees* set how far and how dense forests are.
const PRESETS = {
  low: { ratio: [0.75, 1, 1.25], antialias: true, shadows: 'basic', shadowMap: 1024, shadowRange: 90,
    treeR: 750, treeChunk: 200, treeStep: 6.5, treeKeep: 0.5, nearLod: 260, landMask: 1024, horizonStep: 2,
    poleGap: 80, snow: 1500, anisotropy: 4, miniFps: 12, lowEnd: true },
  medium: { ratio: [1, 1.25, 1.5], antialias: true, shadows: 'pcf', shadowMap: 1024, shadowRange: 110,
    treeR: 1100, treeChunk: 200, treeStep: 5.5, treeKeep: 0.58, nearLod: 320, landMask: 2048, horizonStep: 1,
    poleGap: 55, snow: 2500, anisotropy: 8, miniFps: 15, lowEnd: true },
  high: { ratio: [1, 2, 2], antialias: true, shadows: 'soft', shadowMap: 2048, shadowRange: 140,
    treeR: 1700, treeChunk: 400, treeStep: 5, treeKeep: 0.62, nearLod: 420, landMask: 2048, horizonStep: 1,
    poleGap: 55, snow: 4000, anisotropy: 8, miniFps: 24, lowEnd: false },
  ultra: { ratio: [1.5, 3, 3], antialias: true, shadows: 'soft', shadowMap: 4096, shadowRange: 180,
    treeR: 2400, treeChunk: 400, treeStep: 4.5, treeKeep: 0.66, nearLod: 560, landMask: 2048, horizonStep: 1,
    poleGap: 55, snow: 6000, anisotropy: 16, miniFps: 30, lowEnd: false },
};

export function graphicsChoice() {
  const v = pref.get('graphics');
  return LEVELS.some(l => l.id === v) ? v : 'auto';
}
export const setGraphicsChoice = id => pref.set('graphics', id);

// The resolved preset for this page load; settings are baked into geometry at load, so a change reloads.
export function graphicsPreset(choice = graphicsChoice(), touch = TOUCH) {
  const level = choice === 'auto' ? (touch ? 'medium' : 'high') : choice;
  const preset = { choice, level, ...PRESETS[level] };
  // Phones: soft shadows cost several times plain PCF for little visible gain on a small screen,
  // and past 1.75× the extra pixels are hard to see but halve the frame rate.
  if (touch) {
    if (preset.shadows === 'soft') preset.shadows = 'pcf';
    const [lo, start, hi] = preset.ratio;
    preset.ratio = [Math.min(lo, 1.25), Math.min(start, 1.75), Math.min(hi, 2)];
  }
  return preset;
}

// Wire a radiogroup of buttons (each with data-g) to the stored choice; onPick runs after it is saved.
export function bindGraphicsPicker(buttons, onPick = () => {}) {
  const sync = () => { const c = graphicsChoice(); for (const b of buttons) b.setAttribute('aria-checked', b.dataset.g === c); };
  for (const b of buttons) b.addEventListener('click', () => { setGraphicsChoice(b.dataset.g); sync(); onPick(b.dataset.g); });
  sync();
}
