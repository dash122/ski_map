#!/usr/bin/env python3
"""Convert an Overpass `out geom` response into the compact public/data/osm.json the page loads.

    python3 tools/build_osm.py tools/data/osm_niseko.json public/data/osm.json
"""
import json, sys, datetime
from pathlib import Path

LIFT_TYPES = {'cable_car', 'gondola', 'mixed_lift', 'chair_lift', 'drag_lift', 't-bar', 'j-bar',
              'platter', 'rope_tow', 'magic_carpet', 'zip_line'}


def name_of(tags):
    return tags.get('name:en') or tags.get('name') or tags.get('ref') or ''


def flat(geom):
    return [round(v, 6) for g in geom if g for v in (g['lon'], g['lat'])]


def main(src, dst):
    data = json.load(open(src))
    # Ski coverage is narrower than the terrain/fetch box for some resorts.
    # Infer from the standard source filename used by both refresh workflows.
    resort = Path(src).stem.removeprefix('osm_')
    configs = json.loads(Path(__file__).with_name('resorts.json').read_text())
    bounds = configs.get(resort, {}).get('skiBounds')

    def in_ski_area(geom):
        if not bounds:
            return True
        w, s, e, n = bounds
        points = [p for p in (geom or []) if p]
        return bool(points) and all(w <= p['lon'] <= e and s <= p['lat'] <= n for p in points)

    pistes, lifts, seen = [], [], set()

    def add_piste(tags, geom, wid):
        if tags.get('piste:type') != 'downhill' or not geom or wid in seen or not in_ski_area(geom):
            return
        seen.add(wid)
        c = flat(geom)
        closed = len(c) >= 8 and c[:2] == c[-2:]
        piste = {'n': name_of(tags), 'd': tags.get('piste:difficulty', ''),
                 'a': 1 if closed and tags.get('area') == 'yes' else 0, 'c': c}
        width = tags.get('piste:width') or tags.get('width')
        try:
            if width and 2 <= float(width.split()[0]) <= 200: piste['w'] = float(width.split()[0])   # metres; corridor width on the hill
        except ValueError:
            pass
        pistes.append(piste)

    for el in data['elements']:
        tags = el.get('tags', {})
        if el['type'] == 'way':
            if tags.get('aerialway') in LIFT_TYPES and el.get('geometry') and in_ski_area(el['geometry']):
                lift = {'n': name_of(tags) or tags['aerialway'].replace('_', ' ').title(),
                        't': tags['aerialway'], 'c': flat(el['geometry'])}
                # Seats per chair/cabin, ride time in minutes, weather hood, detachable grip: the page sets speeds from these.
                for k, key in (('o', 'aerialway:occupancy'), ('du', 'aerialway:duration'), ('b', 'aerialway:bubble'), ('dt', 'aerialway:detachable')):
                    if tags.get(key): lift[k] = tags[key]
                lifts.append(lift)
            add_piste(tags, el.get('geometry'), ('w', el['id']))
        elif el['type'] == 'relation' and tags.get('piste:type') == 'downhill':
            # Route relations: give member ways the relation's name and grade.
            for m in el.get('members', []):
                if m.get('type') == 'way' and m.get('geometry'):
                    add_piste(tags, m['geometry'], ('w', m['ref']))

    out = {'fetched': datetime.date.today().isoformat(), 'source': '© OpenStreetMap contributors (ODbL)',
           'pistes': pistes, 'lifts': lifts}
    json.dump(out, open(dst, 'w'), separators=(',', ':'))
    print(f'{len(pistes)} pistes, {len(lifts)} lifts -> {dst}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
