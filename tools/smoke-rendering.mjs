// PLAYWRIGHT_PATH may point to a bundled Playwright package outside this repo.
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const server = process.env.URL ? null : await (await import('vite')).createServer({ server: { host: '127.0.0.1', port: 0 } });
await server?.listen();
let browser;
try {
  browser = await (pw.chromium || pw.default.chromium).launch({
    ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  const base = process.env.URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(`${base}?resort=niseko`);
  console.log('Niseko document loaded; waiting for scene initialization.');
  await page.waitForFunction(() => window.__ski && !document.getElementById('start').hidden, null, { timeout: 240000 });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__ski.renderer.info.render.frame > 15, null, { timeout: 60000 });
  console.log(JSON.stringify(await page.evaluate(() => {
    const { renderer, scene } = window.__ski;
    const proxies = [];
    scene.traverse(o => {
      if (o.isInstancedMesh && o.material.colorWrite === false) proxies.push(o);
    });
    return { render: renderer.info.render, shadowProxies: proxies.length,
      activeShadowProxies: proxies.filter(p => p.visible).length,
      selectedShadowInstances: proxies.reduce((n, p) => n + p.count, 0),
      shadowCapacity: proxies.reduce((n, p) => n + p.instanceMatrix.count, 0) };
  }), null, 2));
  await page.screenshot({ path: process.env.SCREENSHOT || 'tools/rendering-smoke.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Resort loaded, start control worked, scene rendered without page errors. Software-rendered smoke test; not a hardware FPS benchmark.');
} finally {
  await browser?.close();
  await server?.close();
}
