// Renders the home-screen card thumbnails: bluebird daylight, each resort's signature view.
// Drawn at 2560x1440 and saved as 1920x1080 WebP: full HD for the home cards and the loading screen.
// CHANNEL=msedge (or chrome) uses an installed browser with the GPU instead of the bundled software one.
//   npm run build && npx vite preview --port 4173 &   then   node tools/render_thumbs.mjs [resort…]
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright'), { chromium } = pw.default ?? pw;
import sharp from 'sharp';

// Rider stands at `from`, facing `at` (lon, lat, metres above sea level); `cam` is the camera's [back, up] in metres.
const VIEWS = {
  niseko: { from: [140.6622, 42.8715], at: [140.811, 42.826, 1300] }, // Top of King #4 above the trees, overlooking Mt. Yotei
  appi: { from: [140.9586, 39.9768], at: [141.0007, 39.8528, 1500] }, // Maemori summit slopes toward Mt. Iwate
  cypress: { from: [-123.1962, 49.4082], at: [-123.32, 49.43, 0], cam: [30, 30] }, // Top of the Sky Chair, looking west over Howe Sound
  chaserrugg: { from: [9.3128, 47.1565], at: [9.3127, 47.1930, 1300] }, // Below the Chäserrugg summit, down the north slopes to Unterwasser and the Säntis
  rusutsu: { from: [140.9238, 42.7116], at: [140.811, 42.826, 1100], cam: [30, 28] }, // Isola summit looking north-west to Mt. Yotei
  teine: { from: [141.1935, 43.0770], at: [141.30, 43.16, 0] }, // Mt. Teine summit, looking down to Sapporo and Ishikari Bay
  zao: { from: [140.4300, 38.1548], at: [140.027, 38.549, 1500], cam: [25, 20] }, // Juhyo field below Mt. Jizo, over the Yamagata basin to Mt. Gassan
  gala: { from: [138.7712, 36.9466], at: [138.7996, 36.9503, 350] }, // Steep upper slopes below the Coach summit, facing the station
};
const base = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const id of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(VIEWS)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(`${base}?resort=${id}`);
  await page.waitForFunction(() => window.__ski && !document.getElementById('start')?.hidden, null, { timeout: 300000, polling: 1000 });
  const url = await page.evaluate(async ({ from, at, cam = [9, 6] }) => {
    const k = window.__ski, a = k.toWorld(...from), b = k.toWorld(at[0], at[1]);
    k.weather.set('day', 'clear');
    k.dropIn({ ...a, direction: { x: b.x - a.x, z: b.z - a.z } });
    for (let i = 0; i < 40; i++) window.__sim.updateTrees(0, 99);
    k.renderer.setPixelRatio(2);
    k.renderer.setSize(1280, 720, false);
    k.render(0);
    // Pull the chase camera up and back so the landmark fills the frame behind the rider.
    const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
    const y = k.height(a.x, a.z);
    k.camera.position.set(a.x - ux * cam[0], y + cam[1], a.z - uz * cam[0]);
    k.camera.lookAt(b.x, at[2], b.z);
    k.renderer.render(k.scene, k.camera);
    return k.renderer.domElement.toDataURL('image/png'); // same task as the render, so the buffer is intact
  }, VIEWS[id]);
  await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(1920, 1080).webp({ quality: 82 }).toFile(`public/thumbs/${id}.webp`);
  console.log(id, 'done');
  await page.close();
}
await browser.close();
