"""Build the snowboarder model: a MakeHuman (CC0) young East Asian man, rigged, dressed in a
colour-blocked shell jacket, baggy pants, gaiter, gloves, boots, helmet and goggles.

    python3 tools/make_rider.py /tmp/rider_raw.glb
    node tools/build_rider.mjs /tmp/rider_raw.glb public/models/rider.glb

The MakeHuman base mesh, targets, skeleton and weights are downloaded on first run.
Everything is in metres, facing +Z, character's left at +X, soles at y = 0.
"""
import json, os, struct, sys, urllib.request
import numpy as np

MH = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.mh-cache')
FILES = {
    'base.obj': '3dobjs/base.obj',
    'skel.json': 'rigs/default.mhskel',
    'weights.json': 'rigs/default_weights.mhw',
    'asian.target': 'targets/macrodetails/asian-male-young.target',
    'muscle.target': 'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target',
}
HEIGHT = 1.74


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        urllib.request.urlretrieve(MH + FILES[name], p)
    return p


# ---------- MakeHuman body ----------
verts, groups, cur = [], {}, None
for line in open(fetch('base.obj')):
    if line.startswith('v '):
        verts.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        groups.setdefault(cur, []).append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
V = np.array(verts)


def apply_target(name, w):
    for line in open(fetch(name)):
        if line[0].isdigit():
            i, dx, dy, dz = line.split()
            V[int(i)] += w * np.array([float(dx), float(dy), float(dz)])


apply_target('asian.target', 1.0)
apply_target('muscle.target', 0.45)   # athletic, not bulky

skel = json.load(open(fetch('skel.json')))
joint_pos = {k: V[v].mean(0) for k, v in skel['joints'].items()}
head_of = lambda b: joint_pos[skel['bones'][b]['head']]
tail_of = lambda b: joint_pos[skel['bones'][b]['tail']]

faces = np.array([f for f in groups['body'] if len(f) == 4])
used = np.unique(faces)
ground = V[used, 1].min()
scale = HEIGHT / (V[used, 1].max() - ground)
to_m = lambda p: (np.asarray(p) - [0, ground, 0]) * scale
V = to_m(V)
for k in joint_pos:
    joint_pos[k] = to_m(joint_pos[k])

# ---------- Game skeleton (Mixamo names) ----------
SIDE = {'L': 'Left', 'R': 'Right'}
bones = [('Hips', None, head_of('spine05')), ('Spine', 'Hips', head_of('spine04')),
         ('Spine1', 'Spine', head_of('spine03')), ('Spine2', 'Spine1', head_of('spine02')),
         ('Neck', 'Spine2', head_of('neck01')), ('Head', 'Neck', head_of('head')),
         ('HeadTop_End', 'Head', tail_of('head'))]
for s, n in SIDE.items():
    toe_tip = np.mean([tail_of(f'toe{i}-{3 if i > 1 else 2}.{s}') for i in range(1, 6)], 0)
    bones += [(n + 'Shoulder', 'Spine2', head_of(f'clavicle.{s}')), (n + 'Arm', n + 'Shoulder', head_of(f'upperarm01.{s}')),
              (n + 'ForeArm', n + 'Arm', head_of(f'lowerarm01.{s}')), (n + 'Hand', n + 'ForeArm', head_of(f'wrist.{s}')),
              (n + 'HandMiddle1', n + 'Hand', head_of(f'finger3-1.{s}')),
              (n + 'UpLeg', 'Hips', head_of(f'upperleg01.{s}')), (n + 'Leg', n + 'UpLeg', head_of(f'lowerleg01.{s}')),
              (n + 'Foot', n + 'Leg', head_of(f'foot.{s}')), (n + 'ToeBase', n + 'Foot', head_of(f'toe3-1.{s}')),
              (n + 'Toe_End', n + 'ToeBase', toe_tip)]
BI = {b[0]: i for i, b in enumerate(bones)}


def game_bone(mh):
    s = SIDE.get(mh[-1]) if mh[-2:] in ('.L', '.R') else None
    b = mh[:-2] if s else mh
    if b in ('root', 'spine05') or b.startswith('pelvis'): return 'Hips'
    if b == 'spine04': return 'Spine'
    if b == 'spine03': return 'Spine1'
    if b in ('spine02', 'spine01') or b.startswith('breast'): return 'Spine2'
    if b.startswith('neck'): return 'Neck'
    if not s: return 'Head'                       # head, jaw, tongue and face bones
    if b.startswith(('clavicle', 'shoulder')): return s + 'Shoulder'
    if b.startswith('upperarm'): return s + 'Arm'
    if b.startswith('lowerarm'): return s + 'ForeArm'
    if b.startswith(('wrist', 'metacarpal', 'finger')): return s + 'Hand'
    if b.startswith('upperleg'): return s + 'UpLeg'
    if b.startswith('lowerleg'): return s + 'Leg'
    if b == 'foot': return s + 'Foot'
    if b.startswith('toe'): return s + 'ToeBase'
    return 'Head'


W = np.zeros((len(V), len(bones)))
for mh, lst in json.load(open(fetch('weights.json')))['weights'].items():
    j = BI[game_bone(mh)]
    for vi, w in lst:
        W[vi, j] += w

# ---------- Mesh helpers ----------
def compact(quads):
    idx = np.unique(quads)
    remap = -np.ones(len(V), int); remap[idx] = np.arange(len(idx))
    return idx, remap[quads]


def tris(q):
    return np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])


def normals(P, T):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, T[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def neighbours(q, n):
    e = np.concatenate([q[:, [0, 1]], q[:, [1, 2]], q[:, [2, 3]], q[:, [3, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=n).astype(float)
    return e, np.maximum(deg, 1)


def smooth(X, e, deg, it, keep=None):
    for _ in range(it):
        acc = np.zeros_like(X); np.add.at(acc, e[:, 0], X[e[:, 1]])
        Y = acc / deg[:, None]
        if keep is not None: Y[keep] = X[keep]
        X = 0.5 * X + 0.5 * Y
    return X


body_idx, bq = compact(faces)
P0 = V[body_idx]; Wb = W[body_idx]
E, DEG = neighbours(bq, len(P0))
N0 = normals(P0, tris(bq))
Nsm = smooth(N0, E, DEG, 12); Nsm /= np.linalg.norm(Nsm, axis=1, keepdims=True)
dom = np.array([bones[i][0] for i in Wb.argmax(1)])
x, y, z = P0.T
J = {b[0]: b[2] for b in bones}


def along(a, b):                                   # 0 at joint a, 1 at joint b
    d = J[b] - J[a]
    return (P0 - J[a]) @ d / (d @ d)


def has(*names): return np.isin(dom, names)

wsum = lambda *names: Wb[:, [BI[n] for n in names]].sum(1)
LR = ('Left', 'Right')
hand = (wsum('LeftHand', 'RightHand') > 0.5)
fore_t = np.maximum(np.where(x > 0, along('LeftForeArm', 'LeftHand'), 0), np.where(x < 0, along('RightForeArm', 'RightHand'), 0))
arm = has(*[s + p for s in LR for p in ('Shoulder', 'Arm', 'ForeArm')])
crotch = min(J['LeftLeg'][1] + (J['LeftUpLeg'][1] - J['LeftLeg'][1]) * 0.78, J['Hips'][1] - 0.06)
legs = has(*[s + p for s in LR for p in ('UpLeg', 'Leg')])
torso = has('Hips', 'Spine', 'Spine1', 'Spine2')
neck = has('Neck')
head = has('Head')
foot = has(*[s + p for s in LR for p in ('Foot', 'ToeBase')])
ankle_y = J['LeftFoot'][1]
shin_t = np.maximum(np.where(x > 0, along('LeftLeg', 'LeftFoot'), 0), np.where(x < 0, along('RightLeg', 'RightFoot'), 0))

jacket = ((torso | arm | (legs & (y > crotch + 0.02)) | (neck & (y < J['Neck'][1] + 0.02))) & ~hand & ~(fore_t > 0.97))
pants = ((legs | (torso & (y < J['Hips'][1] + 0.09))) & (y > ankle_y + 0.03)) | (foot & (y > ankle_y + 0.03))
boots = foot | (legs & (shin_t > 0.6))
gloves = hand | (fore_t > 0.72)
gaiter = (neck | (head & (y < J['Head'][1] + 0.01))) & (y > J['Spine2'][1] + 0.08)

# Eye level from the eye helper groups.
eye_vs = np.unique(np.concatenate([np.array(groups['helper-l-eye']).ravel(), np.array(groups['helper-r-eye']).ravel()]))
eye_c = V[eye_vs].mean(0)
ey = eye_c[1]
gaiter = (neck | (head & (y < ey - 0.085))) & (y > J['Spine2'][1] + 0.08)
skull = P0[head & (y > ey - 0.03)]
hc = (skull.min(0) + skull.max(0)) / 2


def head_radius(D, extra):
    """Distance from the head centre to the skin along each direction, plus `extra`."""
    rel = P0[head & (y > ey - 0.07)] - hc
    R = np.empty(len(D))
    for i, d in enumerate(D):
        u = rel / np.linalg.norm(rel, axis=1, keepdims=True)
        near = u @ d > np.cos(np.radians(14))
        R[i] = (rel[near] @ d).max() if near.any() else np.nan
    return np.clip(np.nan_to_num(R, nan=np.nanmean(R)), 0.07, 0.125) + extra


def band(az0, az1, y0, y1, extra, n_az, n_el, smooth_it, closed=False, colour=0):
    """Clean parametric shell around the head between heights y0(az) and y1(az), rigid on the Head bone."""
    az = np.linspace(az0, az1, n_az + 1)[:-1] if closed else np.linspace(az0, az1, n_az)
    t = np.linspace(0, 1, n_el)
    A, Tt = np.meshgrid(az, t, indexing='ij')
    lo, hi = y0(A), y1(A)
    el = np.arcsin(np.clip((lo + (hi - lo) * Tt - hc[1]) / 0.105, -1, 1))
    D = np.stack([np.cos(el) * np.sin(A), np.sin(el), np.cos(el) * np.cos(A)], -1).reshape(-1, 3)
    R = head_radius(D, extra).reshape(A.shape)
    for _ in range(smooth_it):                       # relax the radius field into a smooth shell
        Rp = np.pad(R, 1, mode='wrap' if closed else 'edge')
        if closed: Rp[:, 0], Rp[:, -1] = Rp[:, 1], Rp[:, -2]
        R = np.maximum(R * 0.2 + 0.2 * (Rp[:-2, 1:-1] + Rp[2:, 1:-1] + Rp[1:-1, :-2] + Rp[1:-1, 2:]), head_radius(D, extra * 0.7).reshape(A.shape)) if _ == smooth_it - 1 else \
            R * 0.2 + 0.2 * (Rp[:-2, 1:-1] + Rp[2:, 1:-1] + Rp[1:-1, :-2] + Rp[1:-1, 2:])
    P = hc + D * R.reshape(-1, 1)
    na = len(az); g = np.arange(na * n_el).reshape(na, n_el)
    a2 = np.roll(g, -1, 0) if closed else g[1:]
    a1 = g if closed else g[:-1]
    q = np.stack([a1[:, :-1], a2[:, :-1], a2[:, 1:], a1[:, 1:]], -1).reshape(-1, 4)
    w = np.zeros((len(P), len(bones))); w[:, BI['Head']] = 1
    return P, q[:, ::-1] if az1 < az0 else q, None, np.tile(colour, (len(P), 1)), w


mixc = lambda f, b: (lambda A: b + (f - b) * np.clip(np.cos(A), 0, 1) ** 2)   # front value f, back value b
helmet_part = band(-np.pi, np.pi, mixc(ey + 0.022, ey - 0.04), lambda A: np.full_like(A, hc[1] + 0.104), 0.028, 48, 18, 25, True, None)
lens_part = band(-1.25, 1.25, lambda A: np.full_like(A, ey - 0.032), lambda A: np.full_like(A, ey + 0.03), 0.026, 28, 8, 30)
frame_part = band(-1.33, 1.33, lambda A: np.full_like(A, ey - 0.038), lambda A: np.full_like(A, ey + 0.036), 0.015, 28, 8, 30)
strap_part = band(1.25, 2 * np.pi - 1.25, lambda A: np.full_like(A, ey - 0.012), lambda A: np.full_like(A, ey + 0.026), 0.036, 30, 4, 25)


def shell(mask, offset, it=6, colour=None, flat_bottom=None):
    """Region of the body pushed out along smoothed normals, then relaxed like fabric."""
    q = bq[mask[bq].all(1)]
    if len(q) == 0: raise RuntimeError('empty region')
    idx, sq = compact_local(q)
    off = offset[idx] if np.ndim(offset) else np.full(len(idx), offset)
    P = P0[idx] + Nsm[idx] * off[:, None]
    e, deg = neighbours(sq, len(idx))
    border = np.zeros(len(idx), bool); P = smooth(P, e, deg, it)
    # Relaxation shrinks; push back out so the shell never dips under the skin.
    d = ((P - P0[idx]) * Nsm[idx]).sum(1)
    P += Nsm[idx] * np.clip(off * 0.8 - d, 0, None)[:, None]
    if flat_bottom is not None:
        P[:, 1] = np.maximum(P[:, 1], flat_bottom)
    C = colour(P, idx) if callable(colour) else np.tile(colour, (len(idx), 1))
    return P, sq, idx, C, Wb[idx]


def compact_local(q):
    idx = np.unique(q)
    remap = -np.ones(len(P0), int); remap[idx] = np.arange(len(idx))
    return idx, remap[q]


def rgb(h): return np.array([(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]) ** 2.2   # linear


# Colour-blocked shell jacket: olive body, sand yoke and sleeves, dark zip and cuffs.
OLIVE, SAND, INK, CHAR = rgb(0x5b6640), rgb(0xc9b48a), rgb(0x1b1d20), rgb(0x2c2f33)


def jacket_colour(P, idx):
    C = np.tile(OLIVE, (len(idx), 1))
    yy, xx, zz = P[:, 1], P[:, 0], P[:, 2]
    yoke = (yy > J['Spine2'][1] + 0.13) & (np.abs(xx) < np.abs(J['LeftArm'][0]) + 0.03)
    C[yoke] = SAND
    C[(np.abs(xx) < 0.009) & (zz > J['Spine'][2])] = INK               # front zip
    C[fore_t[idx] > 0.85] = CHAR                                       # cuffs
    C[(yy < crotch + 0.07)] = CHAR                                     # hem
    return C


jk_off = np.where(arm, 0.04, 0.052) + np.where(y < J['Spine'][1], 0.012, 0)
pt_off = 0.032 + 0.045 * np.clip(shin_t, 0, 1)
def lens_colour(P):                                  # mirrored amber, darker at the top
    t = np.clip((P[:, 1] - (ey - 0.032)) / 0.062, 0, 1)[:, None]
    return rgb(0xffa040) * (1 - t) + rgb(0x8a2c10) * t


parts = {
    'Jacket': shell(jacket, jk_off, 12, jacket_colour),
    'Pants': shell(pants, pt_off, 10, rgb(0x2b2e33)),
    'Boots': shell(boots, np.where(foot, 0.022, 0.03), 5, rgb(0x3b2f26), flat_bottom=0.0),
    'Gloves': shell(gloves, np.where(hand, 0.012, 0.042), 4, rgb(0x2a2b2d)),
    'Gaiter': shell(gaiter, 0.02, 10, rgb(0x6d2f2a)),
    'Helmet': helmet_part[:3] + (np.tile(rgb(0x2b2e33), (len(helmet_part[0]), 1)), helmet_part[4]),
    'Strap': strap_part[:3] + (np.tile(rgb(0x111214), (len(strap_part[0]), 1)), strap_part[4]),
    'Lens': lens_part[:3] + (lens_colour(lens_part[0]), lens_part[4]),
    'Frame': frame_part[:3] + (np.tile(rgb(0x141516), (len(frame_part[0]), 1)), frame_part[4]),
}
skin_q = bq[(head | neck)[bq].all(1)]
sidx, ssq = compact_local(skin_q)
parts['Skin'] = (P0[sidx], ssq, sidx, np.tile(rgb(0xd8a982), (len(sidx), 1)), Wb[sidx])

MATS = {  # name: (roughness, metalness, double sided)
    'Skin': (0.55, 0.0, False), 'Jacket': (0.82, 0.0, True), 'Pants': (0.9, 0.0, True), 'Boots': (0.65, 0.0, True),
    'Gloves': (0.85, 0.0, True), 'Gaiter': (0.95, 0.0, True), 'Helmet': (0.35, 0.0, True), 'Strap': (0.8, 0.0, True),
    'Lens': (0.12, 0.35, True), 'Frame': (0.7, 0.0, True),
}

# ---------- glTF ----------
blob = bytearray()
views, accessors = [], []


def add(arr, comp, typ, target=None, minmax=False):
    arr = np.ascontiguousarray(arr)
    while len(blob) % 4: blob.append(0)
    views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes, **({'target': target} if target else {})})
    blob.extend(arr.tobytes())
    acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: acc.update(min=arr.min(0).tolist(), max=arr.max(0).tolist())
    accessors.append(acc)
    return len(accessors) - 1


def weights4(Wv):
    order = np.argsort(-Wv, 1)[:, :4]
    w = np.take_along_axis(Wv, order, 1)
    w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    return order.astype(np.uint16), w.astype(np.float32)


materials, prims_body, prims_gear = [], [], []
for name, (P, q, idx, C, Wv) in parts.items():
    T = tris(q)
    N = normals(P, T)
    j, w = weights4(Wv)
    prim = {'attributes': {'POSITION': add(P.astype(np.float32), 5126, 'VEC3', 34962, True),
                           'NORMAL': add(N.astype(np.float32), 5126, 'VEC3', 34962),
                           'COLOR_0': add(C.astype(np.float32), 5126, 'VEC3', 34962),
                           'JOINTS_0': add(j, 5123, 'VEC4', 34962), 'WEIGHTS_0': add(w, 5126, 'VEC4', 34962)},
            'indices': add(T.astype(np.uint32).ravel(), 5125, 'SCALAR', 34963), 'material': len(materials)}
    r, m, ds = MATS[name]
    materials.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'roughnessFactor': r, 'metallicFactor': m}, 'doubleSided': ds})
    (prims_body if name == 'Skin' else prims_gear).append(prim)

nodes = [{'name': 'RiderBody', 'mesh': 0, 'skin': 0}, {'name': 'RiderGear', 'mesh': 1, 'skin': 0}]
first = len(nodes)
for i, (n, parent, pos) in enumerate(bones):
    ppos = bones[BI[parent]][2] if parent else np.zeros(3)
    nodes.append({'name': n, 'translation': (pos - ppos).tolist()})
for i, (n, parent, pos) in enumerate(bones):
    if parent: nodes[first + BI[parent]].setdefault('children', []).append(first + i)
ibm = np.stack([np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [-p[0], -p[1], -p[2], 1]], np.float32) for _, _, p in bones])
skin = {'joints': list(range(first, first + len(bones))), 'skeleton': first, 'inverseBindMatrices': add(ibm.reshape(-1, 16), 5126, 'MAT4')}
gltf = {'asset': {'version': '2.0', 'generator': 'ski_map tools/make_rider.py',
                  'copyright': 'Body: MakeHuman (CC0). Outfit and rig: ski_map (MIT).'},
        'scene': 0, 'scenes': [{'nodes': [0, 1, first]}], 'nodes': nodes,
        'meshes': [{'name': 'RiderBody', 'primitives': prims_body}, {'name': 'RiderGear', 'primitives': prims_gear}],
        'materials': materials, 'skins': [skin], 'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(blob)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
while len(blob) % 4: blob.append(0)
with open(sys.argv[1], 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
print('height', HEIGHT, 'verts', sum(len(p[0]) for p in parts.values()), 'bytes', len(blob))
