// Renders the home-screen card thumbnails: bluebird daylight, each resort's signature view.
//   npm run build && npx vite preview --port 4173 &   then   node tools/render_thumbs.mjs [resort…]
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright'), { chromium } = pw.default ?? pw;
import sharp from 'sharp';

// Rider stands at `from`, facing `at` (lon, lat, metres above sea level).
const VIEWS = {
  niseko: { from: [140.6622, 42.8715], at: [140.811, 42.826, 1300] }, // Top of King #4 above the trees, overlooking Mt. Yotei
  appi: { from: [140.9586, 39.9768], at: [141.0007, 39.8528, 1500] }, // Maemori summit slopes toward Mt. Iwate
  gala: { from: [138.7748, 36.9492], at: [138.7996, 36.9503, 400] }, // Top of Sociable above Cheers, down the gondola to the Shinkansen station
};
const base = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${base}?resort=${id}`);
  await page.waitForFunction(() => window.__ski && !document.getElementById('start')?.hidden, null, { timeout: 300000, polling: 1000 });
  const url = await page.evaluate(async ({ from, at }) => {
    const k = window.__ski, a = k.toWorld(...from), b = k.toWorld(at[0], at[1]);
    k.weather.set('day', 'clear');
    k.dropIn({ ...a, direction: { x: b.x - a.x, z: b.z - a.z } });
    for (let i = 0; i < 40; i++) window.__sim.updateTrees(0, 99);
    k.render(0);
    // Pull the chase camera up and back so the landmark fills the frame behind the rider.
    const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
    const y = k.height(a.x, a.z);
    k.camera.position.set(a.x - ux * 9, y + 6, a.z - uz * 9);
    k.camera.lookAt(b.x, at[2], b.z);
    k.renderer.render(k.scene, k.camera);
    return k.renderer.domElement.toDataURL('image/png'); // same task as the render, so the buffer is intact
  }, VIEWS[id]);
  await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(640, 360).webp({ quality: 78 }).toFile(`public/thumbs/${id}.webp`);
  console.log(id, 'done');
  await page.close();
}
await browser.close();
