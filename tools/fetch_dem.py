#!/usr/bin/env python3
"""Fetch AWS Terrain Tiles (terrarium) for the Niseko area and bake data/dem.json.

    python3 tools/fetch_dem.py data/dem.json
"""
import math, io, urllib.request, numpy as np, json, sys, base64
from PIL import Image
Z=14
W,E,S,N=140.615,140.745,42.815,42.905
def tx(lon): return (lon+180)/360*2**Z
def ty(lat):
    r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**Z
x0,x1=int(tx(W)),int(tx(E)); y0,y1=int(ty(N)),int(ty(S))
nx,ny=x1-x0+1,y1-y0+1
mos=np.zeros((ny*256,nx*256),np.float32)
for j in range(ny):
  for i in range(nx):
    u=f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x0+i}/{y0+j}.png"
    a=np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(u).read())).convert('RGB')).astype(np.float32)
    mos[j*256:(j+1)*256,i*256:(i+1)*256]=a[...,0]*256+a[...,1]+a[...,2]/256-32768
# resample to regular lat/lon grid at ~20m
GX,GY=640,512
out=np.zeros((GY,GX),np.float32)
lons=np.linspace(W,E,GX); lats=np.linspace(N,S,GY)
px=(np.array([tx(l) for l in lons])-x0)*256; py=(np.array([ty(l) for l in lats])-y0)*256
X,Y=np.meshgrid(px,py); xi=np.floor(X).astype(int); yi=np.floor(Y).astype(int); fx=X-xi; fy=Y-yi
g=lambda a,b: mos[np.clip(b,0,mos.shape[0]-1),np.clip(a,0,mos.shape[1]-1)]
out=(g(xi,yi)*(1-fx)+g(xi+1,yi)*fx)*(1-fy)+(g(xi,yi+1)*(1-fx)+g(xi+1,yi+1)*fx)*fy
print(out.min(),out.max(), out.shape)
q=np.clip(np.round(out*10),0,65535).astype('<u2')  # decimetres
json.dump(dict(w=W,e=E,s=S,n=N,gx=GX,gy=GY,scale=0.1,source="AWS Terrain Tiles (terrarium z14)",
               format="uint16le decimetres, row-major north to south, base64",
               data=base64.b64encode(q.tobytes()).decode()),open(sys.argv[1],'w'))
