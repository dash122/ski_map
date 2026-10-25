# Slop Niseko

Snowboard the real terrain of Mt. Niseko Annupuri, Hokkaido, in the browser with [three.js](https://threejs.org/). Inspired by mrdoob's [Slop New York](https://github.com/mrdoob/slop-newyork).

Start at the top of the highest lift, carve down Grand Hirafu, Hanazono, Niseko Village or Annupuri through birch and fir woods, and ride the real chairlifts and gondolas back up at their real speeds.

## Controls

| Key | Action |
| --- | --- |
| A / D | Carve left / right (spin while airborne) |
| W | Tuck for speed, skate on the flats, fast-forward a lift queue or ride |
| S | Skid to brake |
| Space | Ollie |
| E | Ride the lift you're standing at |
| M | Trail map; click anywhere to drop in there |
| C | Cycle cameras (chase, low, helmet, drone) |
| R | Back to your last drop point |
| 1–5 | Top of each resort's highest lift, then the summit |

On touch screens, on-screen buttons replace the keys.

## Run it

It's a static page. Serve the folder and open it:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Data

- `public/data/dem.json`: elevation, baked by `tools/fetch_dem.py` from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (terrarium, zoom 14) over lon 140.615–140.745, lat 42.815–42.905. 640 × 512 grid, about 17 m spacing.
- `public/data/osm.json`: downhill pistes (`piste:type=downhill`, with `piste:difficulty`) and lifts (`aerialway=*`) from OpenStreetMap, fetched with `tools/niseko.overpassql` and converted by `tools/build_osm.py`. The **Fetch OSM ski data** GitHub Action refreshes it monthly, on demand, or when the query changes.

- `public/data/land.json`: woods, scrub, farmland, water, roads, rail, buildings and resort areas from OpenStreetMap, fetched with `tools/niseko_land.overpassql` by the same Action and simplified by `tools/build_land.py` (about 300 KB).

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
