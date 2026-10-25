#!/usr/bin/env python3
"""Convert an Overpass `out geom` response for tools/land.overpassql into public/data/land.json:
land cover polygons, roads, rivers, rail, buildings and the ski-area boundary, simplified and integer-encoded.

    python3 tools/build_land.py tools/data/osm_land.json public/data/land.json

Coordinates are integers in 1e-5 degree units from the north-west corner (x east, y south), delta-encoded
per ring or line: [x0, y0, dx1, dy1, ...]. Each area feature is a list of rings (outers and holes) filled even-odd.
"""
import json, sys, math, datetime

from resort import W, S, E, N
PAD = 0.003                      # keep a little beyond the terrain edge so fills don't stop short
BOX = (W - PAD, S - PAD, E + PAD, N + PAD)
LAT0 = (N + S) / 2
M_LAT = 111132.92 - 559.82 * math.cos(2 * math.radians(LAT0))
M_LON = 111412.84 * math.cos(math.radians(LAT0))
Q = 1e5

AREA_KIND = [  # (tag, values, kind) in priority order
    ('landuse', {'winter_sports'}, 'ski'),
    ('natural', {'water'}, 'water'), ('waterway', {'riverbank'}, 'water'), ('landuse', {'reservoir', 'basin'}, 'water'),
    ('natural', {'wood'}, 'forest'), ('landuse', {'forest'}, 'forest'),
    ('natural', {'scrub', 'heath'}, 'scrub'),
    ('natural', {'wetland'}, 'wetland'),
    ('natural', {'bare_rock', 'scree'}, 'rock'),
    ('landuse', {'farmland', 'farmyard', 'orchard', 'vineyard', 'allotments', 'greenhouse_horticulture', 'plant_nursery'}, 'farm'),
    ('landuse', {'meadow', 'grass', 'village_green', 'recreation_ground'}, 'grass'), ('natural', {'grassland'}, 'grass'),
    ('leisure', {'golf_course', 'park', 'pitch'}, 'grass'),
    ('landuse', {'residential', 'commercial', 'retail', 'industrial', 'construction', 'religious', 'cemetery', 'railway', 'garages', 'brownfield', 'quarry', 'landfill'}, 'town'),
    ('amenity', {'parking'}, 'paved'),
]
ROAD_CLASS = {
    'motorway': 'road1', 'trunk': 'road1', 'primary': 'road1', 'secondary': 'road1',
    'tertiary': 'road2', 'unclassified': 'road2', 'residential': 'road3', 'living_street': 'road3', 'service': 'road3',
    'track': 'track',
}
WATER_LINE = {'river': 'river', 'canal': 'river', 'stream': 'stream', 'ditch': 'stream'}


def area_kind(tags):
    for k, vals, kind in AREA_KIND:
        if tags.get(k) in vals:
            return kind
    return None


def to_m(p):
    return ((p[0] - W) * M_LON, (N - p[1]) * M_LAT)


def simplify(pts, tol):
    """Douglas-Peucker in metres; pts are (lon, lat)."""
    if len(pts) < 3:
        return pts
    m = [to_m(p) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = m[a]; bx, by = m[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            px, py = m[i]
            d = abs(dx * (ay - py) - dy * (ax - px)) / L if L > 1e-6 else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def clip_ring(ring, box):
    """Sutherland-Hodgman against an axis-aligned box."""
    x0, y0, x1, y1 = box
    edges = [(lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
             (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1))]
    out = ring
    for inside, cut in edges:
        if not out:
            break
        src, out = out, []
        for i, cur in enumerate(src):
            prev = src[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
    return out


def in_box(p, box=BOX):
    return box[0] <= p[0] <= box[2] and box[1] <= p[1] <= box[3]


def clip_line(pts):
    """Split a polyline into runs that touch the box (a segment survives if either end is inside)."""
    runs, cur = [], []
    for i, p in enumerate(pts):
        ok = in_box(p) or (i > 0 and in_box(pts[i - 1])) or (i + 1 < len(pts) and in_box(pts[i + 1]))
        if ok:
            cur.append(p)
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def enc(pts):
    out, px, py = [], 0, 0
    for i, (lon, lat) in enumerate(pts):
        x, y = round((lon - W) * Q), round((N - lat) * Q)
        if i == 0:
            out += [x, y]
        elif x != px or y != py:
            out += [x - px, y - py]
        else:
            continue
        px, py = x, y
    return out


def geom(g):
    return [(p['lon'], p['lat']) for p in g if p]


def assemble(ways):
    """Join open ways into closed rings by matching end points."""
    rings, open_ = [], []
    for w in ways:
        if len(w) < 2:
            continue
        (rings if w[0] == w[-1] else open_).append(list(w))
    while open_:
        cur = open_.pop()
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(open_):
                if w[0] == cur[-1]: cur += w[1:]
                elif w[-1] == cur[-1]: cur += w[::-1][1:]
                elif w[-1] == cur[0]: cur = w[:-1] + cur
                elif w[0] == cur[0]: cur = w[::-1][:-1] + cur
                else: continue
                open_.pop(i); changed = True
                break
        if len(cur) >= 4:
            rings.append(cur)              # close leftovers anyway; even-odd fill tolerates it
    return rings


def ring_area_m2(r):
    m = [to_m(p) for p in r]
    return abs(sum(m[i][0] * m[i - 1][1] - m[i - 1][0] * m[i][1] for i in range(len(m)))) / 2


def num(s):
    try:
        return float(str(s).split(';')[0].replace('m', '').strip())
    except ValueError:
        return None


def building_height(tags, area):
    h = num(tags.get('height', ''))
    if h:
        return h
    lv = num(tags.get('building:levels', ''))
    if lv:
        return lv * 3.1 + 1.0
    b = tags.get('building', 'yes')
    if b in ('hotel', 'apartments', 'dormitory'): return 13
    if b in ('commercial', 'retail', 'office', 'public', 'civic', 'train_station', 'transportation'): return 8
    if b in ('garage', 'garages', 'shed', 'roof', 'hut', 'cabin', 'carport', 'kiosk', 'toilets'): return 3.5
    if b in ('industrial', 'warehouse', 'barn', 'farm_auxiliary', 'greenhouse'): return 6
    return 4 if area < 50 else 7 if area < 400 else 9


def main(src, dst):
    data = json.load(open(src))
    areas, lines, buildings, labels, pois = {}, {}, [], [], []
    seen = set()

    def add_area(kind, rings, tol):
        feat = []
        for r in rings:
            r = clip_ring(r, BOX)
            if len(r) < 3: continue
            r = simplify(r + [r[0]], tol)[:-1] if len(r) > 3 else r
            if len(r) >= 3 and ring_area_m2(r) > 150:
                feat.append(enc(r))
        if feat:
            areas.setdefault(kind, []).append(feat)   # one feature: outer ring(s) then holes, filled even-odd

    for el in data['elements']:
        t, tags = el['type'], el.get('tags', {})
        if t == 'node':
            nm = tags.get('name:en') or tags.get('name')
            kind = tags.get('amenity') or tags.get('tourism') or tags.get('shop')
            if nm and kind and in_box((el['lon'], el['lat'])):
                pois.append({'n': nm, 'k': kind, 'c': enc([(el['lon'], el['lat'])])})   # names footprints, places café stands
            elif nm:
                labels.append({'n': nm, 'k': 'peak' if tags.get('natural') == 'peak' else 'place',
                               'e': num(tags.get('ele', '')), 'c': enc([(el['lon'], el['lat'])])})
            continue
        if (t, el['id']) in seen: continue
        seen.add((t, el['id']))
        if t == 'way':
            g = geom(el.get('geometry', []))
            if len(g) < 2: continue
            closed = g[0] == g[-1] and len(g) >= 4
            if 'building' in tags and tags['building'] != 'no' and closed:
                r = clip_ring(g[:-1], BOX)
                if len(r) < 3 or not all(in_box(p) for p in r): continue
                a = ring_area_m2(r)
                if a < 12: continue
                r = simplify(r + [r[0]], 0.6)[:-1]
                b = {'h': round(building_height(tags, a), 1), 'c': enc(r)}
                nm = tags.get('name:en') or tags.get('name')
                if nm: b['n'] = nm
                rs = tags.get('roof:shape')
                if rs: b['r'] = rs
                buildings.append(b)
                continue
            if tags.get('highway') in ROAD_CLASS or tags.get('highway', '').endswith('_link'):
                cls = ROAD_CLASS.get(tags['highway'], 'road2')
                for run in clip_line(g):
                    lines.setdefault(cls, []).append(enc(simplify(run, 2.5)))
                continue
            if tags.get('railway') == 'rail':
                for run in clip_line(g): lines.setdefault('rail', []).append(enc(simplify(run, 2.5)))
                continue
            if tags.get('waterway') in WATER_LINE:
                for run in clip_line(g): lines.setdefault(WATER_LINE[tags['waterway']], []).append(enc(simplify(run, 3)))
                continue
            if tags.get('natural') == 'tree_row':
                for run in clip_line(g): lines.setdefault('treerow', []).append(enc(simplify(run, 3)))
                continue
            if tags.get('natural') == 'cliff':
                for run in clip_line(g): lines.setdefault('cliff', []).append(enc(simplify(run, 3)))
                continue
            kind = area_kind(tags)
            if kind and closed:
                add_area(kind, [g[:-1]], 4)
                if kind == 'ski' and (tags.get('name:en') or tags.get('name')):
                    labels.append({'n': tags.get('name:en') or tags['name'], 'k': 'resort', 'c': enc([g[0]])})
        elif t == 'relation':
            outer = [geom(m.get('geometry', [])) for m in el.get('members', []) if m.get('type') == 'way' and m.get('role') != 'inner']
            inner = [geom(m.get('geometry', [])) for m in el.get('members', []) if m.get('type') == 'way' and m.get('role') == 'inner']
            rings = [r[:-1] for r in assemble(outer) + assemble(inner)]
            if 'building' in tags:
                for r in assemble(outer)[:1]:
                    r = r[:-1]
                    if len(r) >= 3 and all(in_box(p) for p in r):
                        buildings.append({'h': round(building_height(tags, ring_area_m2(r)), 1), 'c': enc(simplify(r + [r[0]], 0.6)[:-1]),
                                          **({'n': tags.get('name:en') or tags['name']} if tags.get('name:en') or tags.get('name') else {})})
                continue
            kind = area_kind(tags)
            if kind:
                add_area(kind, rings, 4)
                if kind == 'ski' and rings and (tags.get('name:en') or tags.get('name')):
                    labels.append({'n': tags.get('name:en') or tags['name'], 'k': 'resort', 'c': enc([rings[0][0]])})

    out = {'fetched': datetime.date.today().isoformat(), 'source': '© OpenStreetMap contributors (ODbL)',
           'origin': [W, N], 'q': Q, 'areas': areas, 'lines': lines, 'buildings': buildings, 'labels': labels, 'pois': pois}
    json.dump(out, open(dst, 'w'), separators=(',', ':'), ensure_ascii=False)
    print({k: len(v) for k, v in areas.items()}, {k: len(v) for k, v in lines.items()}, len(buildings), 'buildings', len(labels), 'labels', len(pois), 'pois ->', dst)


if __name__ == '__main__':
    main(*sys.argv[1:3])
