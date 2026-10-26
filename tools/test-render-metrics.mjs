import assert from 'node:assert/strict';
import { createRenderMetrics } from '../src/render-metrics.js';
let queries = 0, deleted = 0, disjoint = false;
const gl = { QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
  getExtension: () => ({ GPU_DISJOINT_EXT: 3, TIME_ELAPSED_EXT: 4 }),
  getParameter: () => disjoint, getQueryParameter: (_, parameter) => parameter === 1 ? true : 2e6,
  createQuery: () => ++queries, deleteQuery: () => deleted++, beginQuery() {}, endQuery() {} };
const renderer = { getContext: () => gl, info: { render: { triangles: 100, calls: 2 } } };
const metrics = createRenderMetrics(renderer);
metrics.begin(); metrics.beginGpu(); metrics.end(1 / 60);
assert.equal(queries, 0); assert.equal(metrics.snapshot().samples, 0, 'default gameplay does not profile');
metrics.enabled = true;
for (let i = 0; i < 11; i++) { metrics.begin(); metrics.beginGpu(); metrics.end(1 / 60); }
assert.equal(queries, 1); assert.equal(deleted, 1, 'completed queries release GPU resources');
assert.equal(metrics.snapshot().latest.gpuMs, 2, 'GPU duration converts nanoseconds to milliseconds');
metrics.begin(); metrics.beginGpu(); metrics.end(0.5);
assert.equal(metrics.snapshot().frameP95Ms, 500, 'long frames remain visible in diagnostics');
disjoint = true; metrics.begin(); metrics.beginGpu(); metrics.end(1 / 60);
assert.equal(metrics.snapshot().latest.gpuMs, null, 'disjoint GPU timings are invalidated');
metrics.reset(); assert.equal(metrics.snapshot().samples, 0);
const unsupported = createRenderMetrics({ ...renderer, getContext: () => ({ getExtension: () => null }) }, true);
unsupported.begin(); unsupported.beginGpu(); unsupported.end(1 / 60);
assert.equal(unsupported.snapshot().gpuTimerAvailable, false);
assert.equal(unsupported.snapshot().gpuP95Ms, null, 'missing timer support is not reported as zero cost');
console.log('Frame metrics: opt-in behavior, GPU query cleanup, disjoint timers, long frames and unsupported devices passed.');
