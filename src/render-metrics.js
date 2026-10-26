// Opt-in diagnostics: CPU submission time and asynchronous GPU timer queries
// stay separate. No gl.finish() or blocking GPU readback in the game loop.
export function createRenderMetrics(renderer, enabled = false) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const samples = [], pending = [];
  let active = null, gpuMs = null, frame = 0, began = 0;
  const percentile = (values, p) => values.length ? values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
  return {
    enabled,
    begin() { if (this.enabled) began = performance.now(); },
    beginGpu() {
      if (!this.enabled || !ext) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length && (disjoint || gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE))) {
        const query = pending.shift();
        if (!disjoint) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
      }
      if (disjoint) gpuMs = null;
      if (!disjoint && ++frame % 10 === 0 && pending.length < 3) {
        active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
      }
    },
    end(frameSeconds) {
      if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; }
      if (!this.enabled) return;
      samples.push({ frameMs: frameSeconds * 1000, cpuMs: performance.now() - began,
        gpuMs, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
      if (samples.length > 240) samples.shift();
    },
    reset() { samples.length = 0; gpuMs = null; },
    snapshot() {
      const durations = samples.map(s => s.frameMs).filter(n => Number.isFinite(n) && n > 0);
      return { samples: samples.length, gpuTimerAvailable: !!ext,
        fps: durations.length ? 1000 / (durations.reduce((a, b) => a + b, 0) / durations.length) : null,
        frameP95Ms: percentile(durations, 0.95), cpuP95Ms: percentile(samples.map(s => s.cpuMs), 0.95),
        gpuP95Ms: percentile(samples.map(s => s.gpuMs).filter(n => n !== null), 0.95), latest: samples.at(-1) || null };
    },
  };
}
