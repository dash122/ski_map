#!/usr/bin/env python3
"""Bake public/data/dem.json from Japan's GSI 10 m DEM (dem_png, zoom 14), filling gaps from AWS terrarium.

    python3 tools/fetch_dem_gsi.py public/data/dem.json
    RESORT=appi python3 tools/fetch_dem_gsi.py public/data/appi/dem.json

GSI tiles: https://maps.gsi.go.jp/development/ichiran.html (出典: 国土地理院 基盤地図情報数値標高モデル)
"""
import math, io, urllib.request, json, sys, base64, time
import numpy as np
from PIL import Image

Z = 14
from resort import W, E, S, N
GX, GY = 960, 768          # about 11 m x 13 m spacing


def tx(lon): return (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ski_map data build (github.com/dash122/ski_map)'})
            return urllib.request.urlopen(req, timeout=30).read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 ** attempt)
        except Exception:
            time.sleep(2 ** attempt)
    return None


def gsi_tile(x, y):
    raw = get(f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{Z}/{x}/{y}.png')
    if raw is None:
        return np.full((256, 256), np.nan, np.float32)
    a = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).astype(np.int64)
    v = a[..., 0] * 65536 + a[..., 1] * 256 + a[..., 2]
    h = np.where(v < 2 ** 23, v, v - 2 ** 24).astype(np.float32) * 0.01
    h[v == 2 ** 23] = np.nan
    return h


def terrarium_tile(x, y):
    raw = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png')
    a = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).astype(np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


x0, x1, y0, y1 = int(tx(W)), int(tx(E)), int(ty(N)), int(ty(S))
shape = ((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256)
gsi, ter = np.zeros(shape, np.float32), np.zeros(shape, np.float32)
for j in range(y1 - y0 + 1):
    for i in range(x1 - x0 + 1):
        sl = (slice(j * 256, (j + 1) * 256), slice(i * 256, (i + 1) * 256))
        gsi[sl] = gsi_tile(x0 + i, y0 + j)
        ter[sl] = terrarium_tile(x0 + i, y0 + j)
missing = np.isnan(gsi)
print(f'GSI coverage {100 * (1 - missing.mean()):.1f}%')
mos = np.where(missing, ter, gsi)

px = (np.array([tx(l) for l in np.linspace(W, E, GX)]) - x0) * 256
py = (np.array([ty(l) for l in np.linspace(N, S, GY)]) - y0) * 256
X, Y = np.meshgrid(px, py)
xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
fx, fy = X - xi, Y - yi
g = lambda a, b: mos[np.clip(b, 0, shape[0] - 1), np.clip(a, 0, shape[1] - 1)]
out = (g(xi, yi) * (1 - fx) + g(xi + 1, yi) * fx) * (1 - fy) + (g(xi, yi + 1) * (1 - fx) + g(xi + 1, yi + 1) * fx) * fy
print('elevation', out.min(), out.max())
q = np.clip(np.round(out * 10), 0, 65535).astype('<u2')
json.dump(dict(w=W, e=E, s=S, n=N, gx=GX, gy=GY, scale=0.1,
               source='GSI 10 m DEM (dem_png z14), gaps from AWS Terrain Tiles',
               format='uint16le decimetres, row-major north to south, base64',
               data=base64.b64encode(q.tobytes()).decode()), open(sys.argv[1], 'w'))
