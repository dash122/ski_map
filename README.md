# Slop Niseko

Snowboard the real terrain of Mt. Niseko Annupuri, Hokkaido, in the browser with [three.js](https://threejs.org/). Inspired by mrdoob's [Slop New York](https://github.com/mrdoob/slop-newyork).

Start at the top of the highest lift, carve down Grand Hirafu, Hanazono, Niseko Village or Annupuri through birch and fir woods, and ride the real chairlifts and gondolas back up at their real speeds.

## Controls

Every drop-in starts at rest. Press W (or the touch tuck button), steer, or jump to push off. Gravity builds speed gradually; carving and braking manage it. Upright riding is tuned for controlled cruising, while tucking permits faster descents. NPCs start from zero, pause before setting off, accelerate according to the slope, and brake for stations.

| Key | Action |
| --- | --- |
| A / D | Carve left / right (spin while airborne) |
| W | Tuck for speed, skate on the flats, fast-forward a lift queue or ride |
| S | Skid to brake |
| Space | Ollie |
| F | Take off / put on board; W/S walk forward/back, A/D turn |
| E | Ride the lift you're standing at |
| M | Trail map; click anywhere to drop in there |
| C | Cycle cameras (chase, low, helmet, drone) |
| R | Back to your last drop point |
| 1–5 | Top of each resort's highest lift, then the summit |

On touch screens, on-screen buttons replace the keys. Tap the walking button to carry the board and walk uphill or downhill. W/S move forward/back and A/D turn. The camera faces the direction of travel, including when walking backward. Drag the scene to change heading. On touch screens, use the forward/back buttons and the pad to turn. Switch modes on the ground; boarding a lift or dropping in puts the board back on.

## Resorts

Pick the mountain and your kit on the home screen, or deep-link past it with `?resort=niseko`, `?resort=appi` or `?resort=gala`. A loading bar names each step (terrain, lifts, villages…) while the resort builds. Card thumbnails in `public/thumbs/` are bluebird-daylight screenshots of the game framing each resort's signature view, rendered by `tools/render_thumbs.mjs` (Niseko overlooks Mt. Yotei, Appi faces Mt. Iwate, Gala looks down the gondola to the Shinkansen station):

- **Niseko United** (default): Mt. Niseko Annupuri, Hokkaido. Data in `public/data/`.
- **Appi Kogen**: Mt. Maemori, Iwate, with Mt. Iwate on the horizon. Data in `public/data/appi/`.
- **Gala Yuzawa**: Mt. Takanokura, Niigata, with its gondola rising straight from the Shinkansen station and Mt. Naeba on the horizon. Data in `public/data/gala/`.

All use the same page and logic; `src/resorts.js` holds each resort's names, base areas and data folder, and `tools/resorts.json` holds the map boxes the data tools bake. Set `RESORT=appi` when running a tool by hand, e.g. `RESORT=appi python3 tools/fetch_dem_gsi.py public/data/appi/dem.json`.

## Run it

It's a static page. Serve the folder and open it:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Data

- `public/data/dem.json`: elevation, baked by `tools/fetch_dem.py` from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (terrarium, zoom 14) over lon 140.615–140.745, lat 42.815–42.905. 640 × 512 grid, about 17 m spacing.
- `public/data/osm.json`: downhill pistes (`piste:type=downhill`, with `piste:difficulty`) and lifts (`aerialway=*`) from OpenStreetMap, fetched with `tools/ski.overpassql` and converted by `tools/build_osm.py`. The **Fetch OSM ski data** GitHub Action refreshes it monthly, on demand, or when the query changes.

- `public/data/land.json`: woods, scrub, farmland, water, roads, rail, buildings and resort areas from OpenStreetMap, fetched with `tools/land.overpassql` by the same Action and simplified by `tools/build_land.py` (about 300 KB).

## Lifts

Each lift runs at a speed set by its type, refined by the OSM ride time (`aerialway:duration`) when that's plausible:

| Type | Line speed | Notes |
| --- | --- | --- |
| Fixed-grip chair (pairs, singles) | 1.5–2.6 m/s | Loads at line speed |
| Detachable chair (quads, hooded six-packs) | 4–5.5 m/s | Slows to 0.85 m/s in the terminals |
| Gondola | 4.5–6 m/s | Cabins, enclosed halls, heavier white towers |
| Drag lift / magic carpet | 2.8 / 0.7 m/s | Ridden standing on the board |

At a base station, ride the lift (E or tap the prompt), step up to the loading line and wait for your chair, then sit back with the board hanging until the unload ramp at the top.

Runs are graded the way Japanese trail maps do it: green for beginner, red for intermediate, black for advanced and expert, dashed orange for off-piste.

The mountain also has up to 378 autonomous snowboarders (162 on lower-powered devices), with eighteen riders per safe lift route (nine on lower-powered devices) and starting positions spread along each run. They follow terrain-checked pistes, wait at stations, ride actual uphill lift carriers, and repeat their runs with varied speeds and pauses. They carry their boards on short uphill/flat station approaches. Routes stay within the resort boundary and avoid roads; lifts without a safe return route do not spawn visitors. Nearby visitors use the player's detailed skinned rider, fabric textures, gear, board and bone posing with varied outfits. A pool of independent skeletons shares geometry and textures; distant visitors use lightweight instanced models. Bumping a visitor slows and deflects the player, transfers momentum along the visitor's safe route, and briefly staggers the visitor. Hard impacts also unbalance the player. Swept contact checks catch fast collisions and ignore riders on elevated lift carriers.

Run `node tools/test-visitors.mjs` for navigation checks. Set `VISITOR_BROWSER_TEST=1` (with Playwright installed, or `PLAYWRIGHT_PATH` pointing to its module) after `npm run build` to test 90 simulated minutes against the real map, including downhill elevation checks, boundaries, and completed lift/run cycles.

## Rider model

`public/models/rider.glb` is a skinned humanoid that the page poses bone by bone (legs, hips, spine, arms and head) for carving, tucking, jumping and riding lifts.

It's built from scratch by `tools/make_rider.py`: the [MakeHuman](http://www.makehumancommunity.org/) base mesh (CC0) shaped into a 1.80 m young East Asian man, smoothed with a Catmull-Clark pass and rigged with Mixamo bone names. The kit is modelled around the body in the style of a technical backcountry outfit (no brand marks): a long sage shell with the hood up over a helmet, tall collar and black zips, light grey cargo pants, black gloves and boots, and amber goggles. Fabrics get generated tileable normal maps (ripstop, twill, leather) and baked fold shading:

```sh
python3 tools/make_rider.py /tmp/rider_raw.glb      # downloads the MakeHuman assets on first run
npm run build:rider -- /tmp/rider_raw.glb public/models/rider.glb
```

Any other GLB with Mixamo-style bone names (`Hips`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftArm`, … with or without the `mixamorig` prefix) works too, and gets a helmet, goggles and mitts added at runtime:

```sh
npm run build:rider -- path/to/character.glb public/models/rider.glb
```

## License and data

Code: MIT. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Elevation: AWS Terrain Tiles (SRTM and other public sources).

## Roads and mapped lighting

Roads use the existing OSM centreline geometry, draped at 3 m intervals with a procedural asphalt grain and snow verges. Vehicle roads are hard riding boundaries, including while airborne; snow-covered access tracks remain passable. Widths are estimates by OSM road class (9 / 7 / 5 m), not surveyed carriageway widths. The trail map uses the same centreline data. Road clicks cannot create a drop point inside a carriageway.

`public/data/infrastructure.json` contains only individually mapped lamp nodes, with OSM IDs, source links, original tags and optional mapped heights. Run `node --use-system-ca tools/fetch_infrastructure.mjs` to refresh it, or pass a saved Overpass JSON response as its first argument. The monthly OSM workflow also refreshes it. A failed request preserves existing data; an empty successful response means there are no matching mapped nodes, not that no lights exist in reality.

**Current lighting coverage:** the initial Overpass requests were rejected or timed out, so the checked-in lighting dataset explicitly records `status: unavailable` and contains no poles. No pole positions have been invented. The renderer supports mapped street lamps and floodlight masts, with estimated dimensions when height is absent, and stores metadata for future night lighting. Night mode uses a rider headlamp; mapped resort illumination awaits verified pole data. Resort night-ski maps indicate lit runs, not surveyed pole locations; those cannot establish exact mast coordinates.

Boundary regression checks: `node tools/test-road-boundaries.mjs`.

## Time and weather

Open **時間／天氣** in the upper-left HUD. Choose day, sunset or night independently of clear (Bluebird), overcast, snow or snowstorm. Changes apply immediately and are remembered on this browser. Night enables a rider headlamp; storms increase snowfall and wind and shorten visibility. These controls simulate conditions, rather than reporting live resort weather. Tests: `node tools/test-weather.mjs`.

Building windows now glow at night with stable, varied room occupancy and warm interior tones; hotels have more lit rooms than small chalets. Sunset uses dimmer lighting and daytime switches it off. Up to six nearby exterior entrance lights illuminate walls and snow. Occupancy and entrance positions are illustrative, based on mapped building footprints rather than surveyed fixtures. Checks: `node tools/test-building-lighting.mjs`.

Signature dining buildings use the existing named OSM footprints for The Barn, Ebisutei, Fuji Sushi, Ichimura Soba, Rin and Ezo Seafoods Fresh. `src/signature-restaurants.js` adds timber framing, glass storefronts, snow-covered entrance canopies, noren and lanterns where appropriate, and readable 3D signs. Red map footprints and dining labels identify them alongside the hotel landmarks. These are illustrative architectural treatments, not surveyed replicas; entrances use the longest mapped facade and may differ from the real entrance. Venue reference links are recorded with each profile. Ezo Seafoods Fresh is labeled as its current takeaway business, rather than its former dine-in restaurant.

Course edges preserve mapped OSM piste polygons. Centreline-only trails use gently varying estimated widths around 32 m for beginners, 27 m for intermediates and 23 m for advanced runs. Woodland shoulders reinforce corridors below the treeline, excluding mapped open land and infrastructure. These are illustrative estimates, not surveyed trail edges.
