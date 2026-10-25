// Renders the home-screen card thumbnails: bluebird daylight, each resort's signature view.
// Drawn at 2x (1920x1080) and saved as 1280x720 WebP so cards stay sharp on retina screens.
// CHANNEL=msedge (or chrome) uses an installed browser with the GPU instead of the bundled software one.
//   npm run build && npx vite preview --port 4173 &   then   node tools/render_thumbs.mjs [resort…]
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright'), { chromium } = pw.default ?? pw;
import sharp from 'sharp';

// Rider stands at `from`, facing `at` (lon, lat, metres above sea level).
const VIEWS = {
  niseko: { from: [140.6622, 42.8715], at: [140.811, 42.826, 1300] }, // Top of King #4 above the trees, overlooking Mt. Yotei
  appi: { from: [140.9586, 39.9768], at: [141.0007, 39.8528, 1500] }, // Maemori summit slopes toward Mt. Iwate
  cypress: { from: [-123.2062, 49.3972], at: [-123.0043, 49.8503, 1600] }, // Top of Eagle Express looking north-east to Mt. Garibaldi
  chaserrugg: { from: [9.3150, 47.1590], at: [9.3432, 47.2494, 2400] }, // Chäserrugg summit ridge looking north to the Säntis
  teine: { from: [141.1960, 43.0790], at: [141.33, 43.17, 0] }, // Highland summit slopes looking down to Ishikari Bay
  gala: { from: [138.7712, 36.9466], at: [138.7996, 36.9503, 350] }, // Steep upper slopes below the Coach summit, facing the station
};
const base = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  await page.goto(`${base}?resort=${id}`);
  await page.waitForFunction(() => window.__ski && !document.getElementById('start')?.hidden, null, { timeout: 300000, polling: 1000 });
  const url = await page.evaluate(async ({ from, at }) => {
    const k = window.__ski, a = k.toWorld(...from), b = k.toWorld(at[0], at[1]);
    k.weather.set('day', 'clear');
    k.dropIn({ ...a, direction: { x: b.x - a.x, z: b.z - a.z } });
    for (let i = 0; i < 40; i++) window.__sim.updateTrees(0, 99);
    k.renderer.setPixelRatio(2);
    k.renderer.setSize(960, 540, false);
    k.render(0);
    // Pull the chase camera up and back so the landmark fills the frame behind the rider.
    const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
    const y = k.height(a.x, a.z);
    k.camera.position.set(a.x - ux * 9, y + 6, a.z - uz * 9);
    k.camera.lookAt(b.x, at[2], b.z);
    k.renderer.render(k.scene, k.camera);
    return k.renderer.domElement.toDataURL('image/png'); // same task as the render, so the buffer is intact
  }, VIEWS[id]);
  await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(1280, 720).webp({ quality: 86 }).toFile(`public/thumbs/${id}.webp`);
  console.log(id, 'done');
  await page.close();
}
await browser.close();
