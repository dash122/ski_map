# Rendering optimizations

The implementation extends the spatial batching and visibility approach in
[Slop New York](https://github.com/mrdoob/slop-newyork/blob/main/js/scene-culling.js)
while retaining the existing Three.js r170 WebGL renderer.

## Changes

- Detailed terrain and distant mountains use four index-only detail levels.
  Full vertex attributes are shared, and every level retains the complete tile
  perimeter to avoid cracks between neighbours. Original normals remain shared.
  Nearby terrain remains exact (180 m minimum range; 300 m for horizon tiles).
  Distant levels use an estimated screen-error budget of 1.25 physical pixels
  (0.8 on Ultra) with hysteresis. Collision physics still uses the original DEM.
- Individual conifers choose detailed/far geometry by projected tree height,
  rather than switching an entire 400 m chunk together. Detail stays full within
  65 m; tints and transforms stay paired. Stable partitions do not upload again.
- Detailed visitor slots prioritise camera-visible people. Their positions update
  every frame; skeletal poses beyond 60 m update at 30 Hz. Slot reassignment,
  walking/seated changes and bumps refresh the pose immediately.
- Eligible opaque static meshes in base/signature landmark roots are merged by
  spatial cell, material, vertex format, shadow flags, render order and layers.
  Original metadata and shared lighting materials remain available. Transparent,
  animated, mirrored, instanced and skinned meshes are excluded.
- Tree placement runs in a module worker during normal streaming, with at most
  four requests outstanding. Completed chunks are installed within the existing
  3 ms scheduling budget (a single chunk upload may exceed it). Initial/forced
  loads and unsupported/failed workers use the same synchronous generator.
  Placement, clearings and collision data are deterministic in both paths.
- Antialiasing, render scale, tree density, textures and shadow-map resolution
  remain unchanged. Extra index lists and partition buffers trade some memory
  for lower rendering work; distant terrain silhouettes use an error estimate,
  rather than a mathematical guarantee on every view.

## Diagnostics and repeatable measurements

Open a resort with `&profile=1`, or use `window.__ski.renderMetrics.enabled = true`
in browser DevTools. `window.__ski.renderMetrics.snapshot()` returns rolling FPS,
95th-percentile frame/CPU/GPU times, triangles and draw calls. GPU times use
asynchronous timer queries every tenth frame; unsupported/disjoint timers return
null. The normal game loop never uses blocking GPU readbacks.

`node tools/benchmark-rendering.mjs` starts its own Vite server and runs a fixed
24-position, 120 m camera path at 1280×720 and pixel ratio 1. It freezes simulation
during sampling and deliberately uses `gl.finish()` to measure completed render
work. This is a rendering benchmark, not end-to-end gameplay FPS. It writes raw
JSON and a canvas screenshot. Playwright must be installed or supplied through
PLAYWRIGHT_PATH; CHANNEL=msedge selects installed Edge. SOFTWARE=1 selects
SwiftShader; omit it for hardware measurements. CHECK_GAMEPLAY=1 also starts a
run and checks live metrics and worker completion.

Use the same browser, GPU, viewport, preset and camera path when comparing runs.
Default browser storage is fresh (Auto/High). A real-laptop comparison should
also record active GPU, power mode, viewport and display scale.

## Regression checks

### Local measurement, 2026-10-26

Edge/SwiftShader, fresh Auto/High profile, fixed camera path at 1280×720/1×:

| Metric | Before this pass | Final implementation |
| --- | ---: | ---: |
| Mean submitted triangles | 10,386,022 | 9,327,998 |
| Mean draw calls | 805.5 | 644.9 |
| Completed-render time in isolated benchmark | 12.94 ms | 11.65 ms |

This is approximately 10% fewer submitted triangles and 20% fewer draw calls.
An intermediate run measured 7.41 ms; the timing variation means a hardware FPS
gain cannot be inferred from these runs. Isolated render timings also do not
represent continuous software-rendered gameplay, whose live GPU timings were
much slower. Crowd initialization and tree detail hysteresis can vary between
fresh loads. Use hardware diagnostics and multiple runs for FPS conclusions.

The final browser run started gameplay, collected 24 live CPU/GPU samples, loaded
the module worker without page errors, and showed 8 static source meshes merged
into 2 batches. The final canvas was inspected for terrain seams and near detail.

### Commands

- `node tools/test-render-detail.mjs`: surface coverage, winding, exact tile
  boundaries, nearby fidelity, error detection, tree counts/tints, hysteresis,
  and camera-visible visitor selection.
- `node tools/test-tree-stream.mjs`: deterministic generation, clearings,
  collision/height consistency and actual worker/fallback parity.
- `node tools/test-static-batches.mjs`: world geometry, shared materials,
  shadows, transparent exclusions and duplicate-draw prevention.
- `node tools/test-render-metrics.mjs`: opt-in profiling, timer lifecycle,
  unavailable/disjoint timers and long-frame reporting.
- Existing spatial rendering, render quality, visitors and lift queue tests.
