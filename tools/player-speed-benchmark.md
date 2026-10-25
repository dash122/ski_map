# Player speed benchmark

Run `node tools/benchmark-player-speed.mjs` to execute the current player physics directly from `index.html` at 120 Hz, for 60 seconds from rest on uniform 10°, 20°, and 30° slopes. Rendering, trees, roads, and NPC contact are excluded to isolate movement. Gentle linked turns use sinusoidal steering of amplitude 0.3 and period 6 seconds. This steering pattern is a test input, not a recorded rider trajectory.

Rider skill (`src/riding-speed.js` `SKILLS`, chosen on the home screen) scales the soft speed targets, turn losses and snow friction. `TABLE=1 node tools/benchmark-player-speed.mjs` prints every skill; the default (intermediate) means below were measured at 20-30 degrees: linked turns 39-44 km/h, straight upright 52-55, tucked 63-66. Advanced: linked turns 51-60, straight 67-71, tucked 83-86. Beginner: linked turns 23-27, straight 36-39. These are gameplay targets from the studies below, not telemetry.

Earlier retuning, km/h (averages from seconds 10–60):

| Slope | Straight upright | Gentle linked turns | Tucked straight |
| --- | ---: | ---: | ---: |
| 10° | 35.0 | 17.2 | 45.3 |
| 20° | 41.9 | 29.2 | 57.8 |
| 30° | 44.6 | 33.0 | 60.5 |

Before retuning, linked turns averaged 43.9 km/h on 20° and 46.2 km/h on 30°, barely slower than upright straight riding. The changes lower the upright/tucked soft speed targets, increase turn-dependent resistance, lower the comfortable speed while engaging an edge, and return less lateral energy along the board. The stronger turn losses represent controlled carving/skidding as a gameplay approximation. They are not calibrated biomechanical coefficients.

On the 20° plane, straight upright riding reaches 30 km/h in 3.28 seconds and 40 km/h in 4.94 seconds. Tucked riding settles below 60 km/h. All scenarios start at exactly zero. These acceleration figures have not been validated against measured rider acceleration.

## Real measurements

- Stepan et al., *Skier and snowboarder speeds at US ski areas* (2023), https://pmc.ncbi.nlm.nih.gov/articles/PMC12980607/ : 4,164 observations across both sports, with snowboarder mean measured speed 33.0 ± 13.2 km/h. The intermediate mean of 32.4 km/h and advanced mean of 44.5 km/h combine skiers and snowboarders; they must not be presented as snowboard-only figures. Measurements are local peaks in a 60 m observation region, rather than whole-run averages.
- Carus & Castillo, *Injury prevention: Individual factors affecting adult recreational snowboarders' actual and estimated speeds on regular slopes* (2021), https://doi.org/10.1371/journal.pone.0246931 : 312 adult snowboarders measured with GPS during normal groomed runs. Mean individual maximum was 43.33 ± 14.07 km/h overall and 57.12 ± 6.28 km/h for the more-skilled group (advanced/experts); highest observed individual maximum was 72.7 km/h. These are peak speeds, not cruising averages.

## Assessment

Controlled turns now average approximately 29–33 km/h on 20–30° slopes, with straight upright riding at 42–45 km/h and deliberate tucked descents at 58–61 km/h. This better separates intermediate cruising, advanced straight riding, and faster descents. Resistance still includes an artificial soft speed governor, not independently calibrated snow and aerodynamic coefficients. The studies do not match the simulated slope, rider, snow, and turn trajectory, so this remains a plausibility comparison rather than validation of a particular real snowboarder. Regression checks in the benchmark require meaningful speed loss through linked turns without eliminating faster straight tucked riding.
