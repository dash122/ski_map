# Slop Niseko

Snowboard the real terrain of Mt. Niseko Annupuri, Hokkaido, in the browser with [three.js](https://threejs.org/). Inspired by mrdoob's [Slop New York](https://github.com/mrdoob/slop-newyork).

Drop in at the summit, carve down Grand Hirafu, Hanazono, Niseko Village or Annupuri, and ride the lifts back up.

## Controls

| Key | Action |
| --- | --- |
| A / D | Carve left / right (spin while airborne) |
| W | Tuck for speed, skate on the flats, fast-forward a lift ride |
| S | Skid to brake |
| Space | Ollie |
| E | Ride the lift you're standing at |
| M | Trail map; click anywhere to drop in there |
| C | Cycle cameras (chase, low, helmet, drone) |
| R | Back to your last drop point |
| 1–5 | Summit and the top of each resort |

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

Runs are graded the way Japanese trail maps do it: green for beginner, red for intermediate, black for advanced and expert, dashed orange for off-piste.

## Rider model

`public/models/rider.glb` is a skinned humanoid that the page poses bone by bone (legs, hips, spine, arms and head) for carving, tucking, jumping and riding lifts.

It's built from scratch by `tools/make_rider.py`: the [MakeHuman](http://www.makehumancommunity.org/) base mesh (CC0) shaped into a young East Asian man, rigged with Mixamo bone names, and dressed in a colour-blocked shell jacket, baggy pants, neck gaiter, gloves, boots, helmet and goggles modelled around the body:

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
