// Software-rendered (SwiftShader) phone-mode profile: draw calls, triangles and relative frame cost
// with and without the sun's shadow pass, per graphics level. Relative numbers only; not a hardware FPS benchmark.
// Usage: node tools/profile-phone.mjs [resort] [levels comma-separated]
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const resort = process.argv[2] || 'niseko', levels = (process.argv[3] || 'low,medium').split(',');
const server = process.env.URL ? null : await (await import('vite')).createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server?.listen();
const base = process.env.URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await (pw.chromium || pw.default.chromium).launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
try {
  for (const level of levels) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(l => { try { localStorage.setItem('graphics', l); } catch {} }, level);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error(e.message));
    await page.goto(`${base}?resort=${resort}`);
    await page.waitForFunction(() => window.__ski && !document.getElementById('start').hidden, null, { timeout: 300000 });
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__ski.renderer.info.render.frame > 10, null, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      window.__noRender = true;
      await new Promise(res => setTimeout(res, 3000));   // let tree streaming settle
      const { renderer, scene, camera } = window.__ski;
      const sample = () => {
        renderer.info.autoReset = false;
        const ms = [];
        for (let i = 0; i < 6; i++) {
          renderer.info.reset();
          const gl = renderer.getContext(), t = performance.now();
          window.__ski.render(0); gl.finish();
          ms.push(performance.now() - t);
        }
        ms.sort((a, b) => a - b);
        const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ms: +ms[2].toFixed(1) };
        renderer.info.autoReset = true;
        return info;
      };
      const on = sample();
      scene.traverse(o => { if (o.isDirectionalLight) o.castShadow = false; });
      renderer.shadowMap.needsUpdate = true;
      const off = sample();
      scene.traverse(o => { if (o.isDirectionalLight) o.castShadow = true; });
      return { ratio: renderer.getPixelRatio(), shadowType: renderer.shadowMap.type, on, off };
    });
    rows.push({ level, ...r });
    console.log(JSON.stringify({ level, ...r }));
    await ctx.close();
  }
} finally { await browser.close(); await server?.close(); }
