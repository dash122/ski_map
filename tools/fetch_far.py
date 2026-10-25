#!/usr/bin/env python3
"""Fetch a coarse wide-area DEM (AWS terrarium z11) for the horizon: Mt. Yotei, the Niseko range, Shiribetsu
(or the $RESORT area from tools/resorts.json).

    python3 tools/fetch_far.py public/data/far.json
"""
import math, io, urllib.request, json, sys, base64
import numpy as np
from PIL import Image
Z = 11
from resort import FAR
W, S, E, N = FAR
GX, GY = 512, 464
def tx(lon): return (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
x0, x1, y0, y1 = int(tx(W)), int(tx(E)), int(ty(N)), int(ty(S))
mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
for j in range(y1 - y0 + 1):
    for i in range(x1 - x0 + 1):
        u = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x0+i}/{y0+j}.png"
        a = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(u).read())).convert('RGB')).astype(np.float32)
        mos[j*256:(j+1)*256, i*256:(i+1)*256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
px = (np.array([tx(l) for l in np.linspace(W, E, GX)]) - x0) * 256
py = (np.array([ty(l) for l in np.linspace(N, S, GY)]) - y0) * 256
X, Y = np.meshgrid(px, py); xi = X.astype(int); yi = Y.astype(int); fx = X - xi; fy = Y - yi
g = lambda a, b: mos[np.clip(b, 0, mos.shape[0]-1), np.clip(a, 0, mos.shape[1]-1)]
out = (g(xi, yi)*(1-fx) + g(xi+1, yi)*fx)*(1-fy) + (g(xi, yi+1)*(1-fx) + g(xi+1, yi+1)*fx)*fy
print(out.min(), out.max())
q = np.clip(np.round(np.maximum(out, 0)), 0, 65535).astype('<u2')  # metres
json.dump(dict(w=W, e=E, s=S, n=N, gx=GX, gy=GY, scale=1, source="AWS Terrain Tiles (terrarium z11)",
               format="uint16le metres, row-major north to south, base64",
               data=base64.b64encode(q.tobytes()).decode()), open(sys.argv[1], 'w'))
