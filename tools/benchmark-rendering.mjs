import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await (pw.chromium || pw.default.chromium).launch({
    ...(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
    args: process.env.SOFTWARE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?resort=niseko`);
  console.log('Loading benchmark scene');
  await page.waitForFunction(() => window.__ski, null, { timeout: 240000 });
  const result = await page.evaluate(async () => {
    window.__noRender = true;
    const k = window.__ski, { renderer, scene, camera, S } = k;
    k.weather.set('day', 'clear');
    renderer.setPixelRatio(1); renderer.setSize(1280, 720, false);
    for (let i = 0; i < 30; i++) window.__sim.updateTrees(0, 99);
    const start = S.p.clone(), forward = S.f.clone().setY(0).normalize();
    const samples = [];
    // A fixed 120 m downhill camera path. No dependence on wall-clock physics.
    for (let i = -4; i < 24; i++) {
      const p = start.clone().addScaledVector(forward, Math.max(0, i) * 5);
      p.y = k.height(p.x, p.z);
      camera.position.copy(p).addScaledVector(forward, -9); camera.position.y += 6;
      camera.lookAt(p.clone().addScaledVector(forward, 30)); camera.updateMatrixWorld();
      k.detail?.update(camera, 720);
      const began = performance.now(); renderer.render(scene, camera);
      // Finish deliberately measures completed GPU work, not just submission.
      renderer.getContext().finish();
      if (i >= 0) samples.push({ ms: performance.now() - began, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
    }
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const screenshot = renderer.domElement.toDataURL('image/png');
    return { screenshot, detail: k.detail?.stats(), staticBatches: k.staticBatchStats, treeStream: k.treeStream?.stats(),
      method: '24 fixed camera positions, 120 m downhill, 1280x720 at 1x, gl.finish; scene animation frozen during sampling',
      gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      samples, meanMs: samples.reduce((n, s) => n + s.ms, 0) / samples.length,
      meanTriangles: samples.reduce((n, s) => n + s.triangles, 0) / samples.length,
      meanCalls: samples.reduce((n, s) => n + s.calls, 0) / samples.length };
  });
  const screenshot = result.screenshot; delete result.screenshot;
  await writeFile(process.env.OUTPUT || 'tools/render-benchmark.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
  await writeFile(process.env.SCREENSHOT || 'tools/render-benchmark.png', Buffer.from(screenshot.split(',')[1], 'base64'));
  if (process.env.CHECK_GAMEPLAY) {
    await page.evaluate(() => { window.__noRender = false; window.__ski.renderMetrics.enabled = true; window.__ski.renderMetrics.reset(); window.__ski.treeStream.request(0, 0); });
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__ski.renderMetrics.snapshot().samples >= 24 && window.__ski.treeStream.stats().pending === 0, null, { timeout: 120000 });
    console.log('Gameplay diagnostics:', JSON.stringify(await page.evaluate(() => ({ metrics: window.__ski.renderMetrics.snapshot(),
      treeStream: window.__ski.treeStream.stats() }))));
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser?.close(); await server.close(); }
