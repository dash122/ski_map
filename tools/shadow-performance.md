# Shadow selection performance

This pass follows the spatial culling / shadow stand-in approach in
[Slop New York](https://github.com/mrdoob/slop-newyork/blob/main/js/scene-culling.js).
Its WebGPU storage-buffer changes do not directly apply to our Three.js r170
WebGL renderer. A renderer migration needs separate compatibility and visual work.

Changes preserve preset pixel ratios, MSAA, terrain, tree density, avatar detail,
shadow resolution, shadow radius and per-frame moving shadow updates:

- Partition detailed terrain into 64-cell tiles for frustum culling. Every original
  triangle is retained and normals/UVs share their original GPU attribute buffers.
  Tile bounds include interior peaks; there is no terrain simplification or LOD seam.
- Compact nearby transforms directly from typed arrays instead of decoding all
  source matrices into Matrix4 objects and encoding selected ones again.
- Upload only the selected prefix rather than the full allocated instance buffer.
- Skip unchanged batches; invalidate on buffer version, count, world transform,
  player position and ancestor visibility changes.
- Hide empty proxies to avoid submitting empty draws in both render passes.
- Reject distant lift routes using their existing conservative route envelopes.
  Do not use auto-generated bounds for moving crowds: these can become stale.

## Reproducible subsystem benchmark

`node tools/benchmark-shadows.mjs [path-to-before-module.mjs]`

Fixture: 24 batches × 1,000 instances, radius 140 m, 100 warm-up updates,
600 measured updates per scenario. The moving scenario changes the player
position and invalidates each source buffer every update. Includes neither
scene rendering nor GPU execution. Upload bytes model steady-state WebGL
update ranges; initial buffer allocation still uploads full capacity.

Measured locally on 2026-10-26 against the pre-change module:

| Scenario | Before CPU ms/update | After CPU ms/update | Before upload bytes/update | After upload bytes/update |
| --- | ---: | ---: | ---: | ---: |
| Unchanged | 0.447 | 0.007 | 1,536,000 | 0 |
| Moving | 0.500 | 0.164 | 1,536,000 | 107,517 |

These numbers establish a subsystem improvement, not game FPS or GPU utilization.
Real play still includes physics, crowd animation, terrain/forest streaming,
draw submission and shading. Hardware frame-time profiling remains necessary
to identify the dominant remaining bottleneck on a particular laptop.

## Browser check

Niseko loaded, the Start button worked, and the running scene rendered without
page errors in Edge at 1280×720 using SwiftShader. Before terrain tiling, a
startup sample submitted 11,545,901 triangles and 793 calls; after tiling,
10,541,576 triangles and 858 calls (about 9% fewer triangles). These are startup
samples, not a deterministic camera-path benchmark; tree streaming and simulation
timing can vary. Tiling trades some draw calls for reduced vertex submission.
Both samples selected 32 shadow instances from 6,789 allocated slots, with 2 of
47 proxy batches active. Screenshots were inspected for terrain continuity.

The remaining ~10.5 million triangles/frame are still substantial. These changes
do not establish a target FPS on the ROG Strix; further work should use hardware
CPU/GPU frame timings to prioritize terrain/horizon versus forest rendering.

`node tools/test-spatial-rendering.mjs` checks selection, parent movement,
visibility restoration, hidden placeholders, route bounds and upload ranges.
`node tools/smoke-rendering.mjs` loads Niseko and starts a rendered run; it needs
Playwright (or PLAYWRIGHT_PATH), with CHANNEL=msedge supported. Its default
software renderer is a correctness check, not a performance measurement.
