"""Build the snowboarder model: a MakeHuman (CC0) young East Asian man, 1.80 m, rigged with Mixamo
bone names and dressed in a technical backcountry kit modelled around the body: a long sage
three-layer shell with the hood up over a helmet and a tall collar, black zips, light grey baggy
cargo pants, black gloves and boots, and amber goggles. No brand marks.

    python3 tools/make_rider.py /tmp/rider_raw.glb
    node tools/build_rider.mjs /tmp/rider_raw.glb public/models/rider.glb

The MakeHuman base mesh, targets, skeleton and weights are downloaded on first run.
Everything is in metres, facing +Z, character's left at +X, soles at y = 0.
"""
import io, json, os, struct, sys, urllib.request
import numpy as np
from PIL import Image

MH = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.mh-cache')
FILES = {
    'base.obj': '3dobjs/base.obj',
    'skel.json': 'rigs/default.mhskel',
    'weights.json': 'rigs/default_weights.mhw',
    'asian.target': 'targets/macrodetails/asian-male-young.target',
    'muscle.target': 'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target',
}
HEIGHT = 1.80


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
quads = np.array([f for f in groups['body'] if len(f) == 4])
used = np.unique(quads)
ground = V[used, 1].min()
V = (V - [0, ground, 0]) * (HEIGHT / (V[used, 1].max() - ground))
joint_pos = {k: V[v].mean(0) for k, v in skel['joints'].items()}
head_of = lambda b: joint_pos[skel['bones'][b]['head']]
tail_of = lambda b: joint_pos[skel['bones'][b]['tail']]

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
J = {b[0]: b[2] for b in bones}
NB = len(bones)


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


W = np.zeros((len(V), NB))
for mh, lst in json.load(open(fetch('weights.json')))['weights'].items():
    j = BI[game_bone(mh)]
    for vi, w in lst:
        W[vi, j] += w
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)

eye_vs = np.unique(np.concatenate([np.ravel(groups['helper-l-eye']), np.ravel(groups['helper-r-eye'])]))
EY = V[eye_vs].mean(0)[1]                          # eye level


# ---------- Catmull-Clark subdivision of the body (positions and skin weights together) ----------
def catmull_clark(X, F):
    n, m = len(X), len(F)
    fp = X[F].mean(1)
    e = np.stack([F, np.roll(F, -1, 1)], -1).reshape(-1, 2)        # face i, edge k -> row 4i+k
    uniq, inv, cnt = np.unique(np.sort(e, 1), axis=0, return_inverse=True, return_counts=True)
    inv = inv.ravel()
    fsum = np.zeros((len(uniq), X.shape[1])); np.add.at(fsum, inv, np.repeat(fp, 4, 0))
    mid = (X[uniq[:, 0]] + X[uniq[:, 1]]) / 2
    ep = np.where((cnt == 2)[:, None], (X[uniq[:, 0]] + X[uniq[:, 1]] + fsum) / 4, mid)
    val = np.bincount(uniq.ravel(), minlength=n).astype(float)
    Q = np.zeros_like(X); np.add.at(Q, F.ravel(), np.repeat(fp, 4, 0))
    Q /= np.maximum(np.bincount(F.ravel(), minlength=n), 1)[:, None]
    R = np.zeros_like(X); np.add.at(R, uniq[:, 0], mid); np.add.at(R, uniq[:, 1], mid)
    R /= np.maximum(val, 1)[:, None]
    boundary = np.zeros(n, bool); boundary[uniq[cnt == 1].ravel()] = True
    vn = val[:, None]
    VP = np.where(boundary[:, None] | (vn < 3), X, (Q + 2 * R + (vn - 3) * X) / np.maximum(vn, 1))
    E = inv.reshape(m, 4) + n                      # edge k of face i runs F[i,k] -> F[i,k+1]
    C = np.arange(m) + n + len(uniq)
    out = [np.stack([F[:, k], E[:, k], C, E[:, k - 1]], 1) for k in range(4)]
    return np.concatenate([VP, ep, fp]), np.concatenate(out)


body_idx = np.unique(quads)
remap = -np.ones(len(V), int); remap[body_idx] = np.arange(len(body_idx))
X, Q4 = catmull_clark(np.hstack([V[body_idx], W[body_idx]]), remap[quads])
P0, W0 = X[:, :3], X[:, 3:]
T0 = np.concatenate([Q4[:, [0, 1, 2]], Q4[:, [0, 2, 3]]])


def vnormals(P, T):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, T[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def edges_of(T, n):
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    e = np.concatenate([e, e[:, ::-1]])
    return e, np.maximum(np.bincount(e[:, 0], minlength=n), 1).astype(float)


def laplace(X, e, deg, it, lam=0.5):
    for _ in range(it):
        acc = np.zeros_like(X); np.add.at(acc, e[:, 0], X[e[:, 1]])
        X = (1 - lam) * X + lam * acc / deg[:, None]
    return X


E0, D0 = edges_of(T0, len(P0))
Nsm = laplace(vnormals(P0, T0), E0, D0, 30); Nsm /= np.linalg.norm(Nsm, axis=1, keepdims=True)
dom = np.array([bones[i][0] for i in W0.argmax(1)])
x, y, z = P0.T
LR = ('Left', 'Right')
has = lambda *names: np.isin(dom, names)


def jn(name, B):                                   # joint position on the vertex's own side
    if 'Left' + name not in J: return np.broadcast_to(J[name], B.shape)
    return np.where(B[:, :1] > 0, J['Left' + name], J['Right' + name])


def sided(B, a, b):                                # 0 at joint a, 1 at joint b, on the vertex's own limb
    ja, jb = jn(a, B), jn(b, B)
    d = jb - ja
    return ((B - ja) * d).sum(1) / (d * d).sum(1)


hand = W0[:, [BI['LeftHand'], BI['RightHand']]].sum(1) > 0.5
arm = has(*[s + p for s in LR for p in ('Shoulder', 'Arm', 'ForeArm')])
legs = has(*[s + p for s in LR for p in ('UpLeg', 'Leg')])
torso = has('Hips', 'Spine', 'Spine1', 'Spine2')
neck = has('Neck')
head = has('Head')
foot = has(*[s + p for s in LR for p in ('Foot', 'ToeBase')])
fore_t = np.where(arm | hand, sided(P0, 'ForeArm', 'Hand'), 0)
shin_t = np.where(legs | foot, sided(P0, 'Leg', 'Foot'), 0)
ANKLE = J['LeftFoot'][1]
CROTCH = min(J['LeftLeg'][1] + (J['LeftUpLeg'][1] - J['LeftLeg'][1]) * 0.78, J['Hips'][1] - 0.06)
NOSE_Y = EY - 0.035
HEM_Y = CROTCH + 0.03


# ---------- Garment meshes ----------
# Per-vertex columns: P (final position), B (body point it came from), N (smoothed body normal),
# W (skin weights), F (fold depth, for shading).
class Mesh:
    def __init__(self, X, T): self.X, self.T = X, T
    P = property(lambda s: s.X[:, 0:3])
    B = property(lambda s: s.X[:, 3:6])
    N = property(lambda s: s.X[:, 6:9])
    F = property(lambda s: s.X[:, 9 + NB])

    def copy(self): return Mesh(self.X.copy(), self.T.copy())


def compact(X, T):
    idx = np.unique(T)
    r = -np.ones(len(X), int); r[idx] = np.arange(len(idx))
    return X[idx], r[T]


def shell(mask, off, it=10):
    """Body region pushed out along smoothed normals and relaxed like fabric."""
    T = T0[mask[T0].all(1)]
    idx = np.unique(T)
    r = -np.ones(len(P0), int); r[idx] = np.arange(len(idx))
    T = r[T]
    e, deg = edges_of(T, len(idx))
    off = laplace((off[idx] if np.ndim(off) else np.full(len(idx), off))[:, None], e, deg, 8)[:, 0]
    P = laplace(P0[idx] + Nsm[idx] * off[:, None], e, deg, it)
    d = ((P - P0[idx]) * Nsm[idx]).sum(1)          # relaxing shrinks: push back out so it never dips under the skin
    P += Nsm[idx] * np.clip(off * 0.85 - d, 0, None)[:, None]
    return Mesh(np.hstack([P, P0[idx], Nsm[idx], W0[idx], np.zeros((len(idx), 1))]), T)


def clip(m, f):
    """Keep the part of the mesh where f >= 0, cutting triangles exactly along f = 0."""
    keep = f >= 0
    k = keep[m.T].sum(1)
    extra, cache, tris = [], {}, []

    def cut(a, b):                                 # a inside, b outside
        key = (min(a, b), max(a, b))
        if key not in cache:
            cache[key] = len(m.X) + len(extra)
            extra.append(m.X[a] + (m.X[b] - m.X[a]) * (f[a] / (f[a] - f[b])))
        return cache[key]

    part = (k == 1) | (k == 2)
    for tri, kk in zip(m.T[part], k[part]):
        ins = keep[tri]
        odd = np.flatnonzero(ins if kk == 1 else ~ins)[0]
        o, p, q = tri[odd], tri[(odd + 1) % 3], tri[(odd + 2) % 3]
        if kk == 1:
            tris.append([o, cut(o, p), cut(o, q)])
        else:
            ep, eq = cut(p, o), cut(q, o)
            tris += [[ep, p, q], [ep, q, eq]]
    X = np.vstack([m.X] + ([np.array(extra)] if extra else []))
    T = np.vstack([m.T[k == 3]] + ([np.array(tris)] if tris else []))
    if len(T) == 0: return Mesh(X[:0], T[:0])
    return Mesh(*compact(X, T))


def split(m, f):
    return clip(m, f), clip(m, -f)


def boundary_edges(T):
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    s = set(map(tuple, e.tolist()))
    return np.array([ab for ab in e.tolist() if (ab[1], ab[0]) not in s], int).reshape(-1, 2)


def extrude(m, move, which=None, weights_to=None, blend=0.0):
    """Extrude the open edges (both ends in the vertex mask `which`) by move(rows) -> offsets."""
    be = boundary_edges(m.T)
    if which is not None: be = be[which[be[:, 0]] & which[be[:, 1]]]
    if len(be) == 0: return m
    vs = np.unique(be)
    newX = m.X[vs].copy()
    newX[:, 0:3] += move(m.X[vs])
    if weights_to is not None:
        newX[:, 9:9 + NB] = newX[:, 9:9 + NB] * (1 - blend) + weights_to * blend
    r = -np.ones(len(m.X), int); r[vs] = len(m.X) + np.arange(len(vs))
    a, b = be[:, 0], be[:, 1]
    T = np.vstack([m.T, np.stack([b, a, r[a]], 1), np.stack([b, r[a], r[b]], 1)])
    return Mesh(np.vstack([m.X, newX]), T)


def hem(m, depth=0.007):
    """Turn the open edges inward so cut edges read as thick fabric instead of paper."""
    return extrude(m, lambda X: -X[:, 6:9] * depth)


def noise3(B, scale, seed, octaves=3):
    """Smooth pseudo-noise from a handful of random plane waves."""
    r = np.random.default_rng(seed)
    out = np.zeros(len(B))
    for o in range(octaves):
        for _ in range(4):
            k = r.normal(size=3); k /= np.linalg.norm(k)
            out += np.sin(B @ k * (2 * np.pi / scale) * 2 ** o + r.uniform(0, 6.3)) / 2 ** o
    return out / 4


def displace(m, d):
    m.X[:, 0:3] += m.N * d[:, None]
    m.X[:, 9 + NB] += d
    return m


def folds(m, a, b, centre, sigma, amp, wavelength, seed):
    """Ring-shaped folds around the bone a->b, strongest near joint `centre`."""
    B = m.B
    ja, jb, jc = jn(a, B), jn(b, B), jn(centre, B)
    axis = jb - ja; axis = axis / np.linalg.norm(axis, axis=1, keepdims=True)
    rel = B - ja
    s = (rel * axis).sum(1)
    radial = rel - axis * s[:, None]
    ang = np.arctan2(radial[:, 2], radial[:, 0])
    env = np.exp(-(np.linalg.norm(B - jc, axis=1) / sigma) ** 2)
    return displace(m, amp * env * np.sin(2 * np.pi * s / wavelength + 1.3 * np.sin(2 * ang + seed) + 2.0 * noise3(B, 0.15, seed)))


def drape(m, amp, scale, seed):
    """Soft, irregular undulation so panels aren't perfectly smooth."""
    return displace(m, amp * noise3(m.B, scale, seed))


def lift(m, d):
    m.X[:, 0:3] += m.N * d
    return m


# ---------- Jacket: long sage shell, collar zipped to the nose ----------
jk_mask = (torso | arm | neck | (legs & (y > CROTCH - 0.02)) | (head & (y < NOSE_Y + 0.01))) & ~hand
jk_off = np.where(arm, 0.042, 0.055) + np.where(y < J['Spine'][1], 0.015, 0) + np.where(neck | head, -0.012, 0)
jacket = shell(jk_mask, jk_off, 16)
folds(jacket, 'Arm', 'Hand', 'ForeArm', 0.09, 0.006, 0.05, 1)            # elbows
folds(jacket, 'Arm', 'Hand', 'Hand', 0.08, 0.007, 0.035, 2)              # sleeve stacking at the cuff
folds(jacket, 'Shoulder', 'ForeArm', 'Arm', 0.07, 0.004, 0.06, 3)        # armpits
drape(jacket, 0.004, 0.22, 4)
jacket = clip(jacket, 0.96 - np.where(np.abs(jacket.B[:, 0]) > 0.2, sided(jacket.B, 'ForeArm', 'Hand'), 0))
jacket = clip(jacket, jacket.B[:, 1] - HEM_Y)
jacket = clip(jacket, (NOSE_Y - 0.004) - jacket.B[:, 1])
hipsW = np.zeros(NB); hipsW[BI['Hips']] = 1


def skirt_move(X):                                 # the hem hangs straight down past the hips, flaring a little
    out = X[:, 6:9].copy(); out[:, 1] = 0
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
    return out * 0.014 + [0, -0.1, 0]


sel = np.abs(jacket.B[:, 1] - HEM_Y) < 0.02
for i in range(4):                                 # in rings, so it shades and bends smoothly
    n = len(jacket.X)
    jacket = extrude(jacket, lambda X: skirt_move(X) / 4, sel, hipsW, 0.15)
    sel = np.arange(len(jacket.X)) >= n
jacket = hem(jacket, 0.008)

Bj = jacket.B
front = jacket.N[:, 2] > 0.35


def segment_field(B, x0, y0, x1, y1, half_width):
    p = B[:, :2]; a = np.array([x0, y0]); b = np.array([x1, y1])
    t = np.clip(((p - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    return half_width - np.linalg.norm(p - (a + (b - a) * t[:, None]), axis=1)


CHEST = J['Spine2'][1]
zips = [clip(jacket.copy(), np.where(front, 0.009 - np.abs(Bj[:, 0]), -1))]
zips += [clip(jacket.copy(), np.where(front, segment_field(Bj, sx * 0.08, CHEST + 0.1, sx * 0.075, CHEST - 0.1, 0.0065), -1)) for sx in (1, -1)]
zips = [hem(lift(zp, 0.003), 0.003) for zp in zips if len(zp.T)]
jk_main, jk_cuffs = split(jacket, 0.9 - np.where(np.abs(jacket.B[:, 0]) > 0.2, sided(jacket.B, 'ForeArm', 'Hand'), 0))

# ---------- Hood up over the helmet, helmet, goggles ----------
skull = P0[head & (y > EY - 0.03)]
HC = (skull.min(0) + skull.max(0)) / 2
REL = P0[head & (y > EY - 0.07)] - HC
RELU = REL / np.linalg.norm(REL, axis=1, keepdims=True)


def head_radius(D, extra):
    near = D @ RELU.T > np.cos(np.radians(14))
    R = np.where(near, D @ REL.T, -np.inf).max(1)
    R[~np.isfinite(R)] = np.nan
    return np.clip(np.nan_to_num(R, nan=np.nanmean(R)), 0.075, 0.125) + extra


def dome(az0, az1, y0, y1, extra, n_az, n_el, smooth_it, closed=False, wfun=None):
    """Parametric shell around the head between heights y0(az) and y1(az)."""
    az = np.linspace(az0, az1, n_az + 1)[:-1] if closed else np.linspace(az0, az1, n_az)
    A, Tt = np.meshgrid(az, np.linspace(0, 1, n_el), indexing='ij')
    lo, hi = y0(A), y1(A)
    el = np.arcsin(np.clip((lo + (hi - lo) * Tt - HC[1]) / 0.11, -1, 1))
    D = np.stack([np.cos(el) * np.sin(A), np.sin(el), np.cos(el) * np.cos(A)], -1).reshape(-1, 3)
    R = (extra(D) if callable(extra) else head_radius(D, extra)).reshape(A.shape)
    for _ in range(smooth_it):
        Rp = np.pad(R, 1, mode='edge')
        if closed: Rp[0, 1:-1], Rp[-1, 1:-1] = R[-1], R[0]
        R = 0.2 * R + 0.2 * (Rp[:-2, 1:-1] + Rp[2:, 1:-1] + Rp[1:-1, :-2] + Rp[1:-1, 2:])
    P = HC + D * R.reshape(-1, 1)
    g = np.arange(len(az) * n_el).reshape(len(az), n_el)
    a1, a2 = (g, np.roll(g, -1, 0)) if closed else (g[:-1], g[1:])
    q = np.stack([a1[:, :-1], a2[:, :-1], a2[:, 1:], a1[:, 1:]], -1).reshape(-1, 4)
    T = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])[:, ::-1]
    Wv = np.zeros((len(P), NB)); Wv[:, BI['Head']] = 1
    if wfun is not None: Wv = wfun(P)
    return Mesh(np.hstack([P, P, D, Wv, np.zeros((len(P), 1))]), T)


mixc = lambda f, b, p=2: (lambda A: b + (f - b) * np.clip(np.cos(A), 0, 1) ** p)


def hood_weights(P):                               # head at the crown, neck and upper back lower down
    t = np.clip((P[:, 1] - (EY - 0.13)) / 0.12, 0, 1)[:, None]
    w = np.zeros((len(P), NB)); w[:, BI['Head']] = 1
    v = np.zeros((len(P), NB)); v[:, BI['Neck']] = 0.6; v[:, BI['Spine2']] = 0.4
    return w * t + v * (1 - t)


def hood_radius(D):                                # roomy over the helmet, flaring toward the shoulders
    return head_radius(D, 0.04) + 0.045 * np.clip(-D[:, 1], 0, 1) ** 1.5 + 0.01 * np.clip(-D[:, 2], 0, 1)


hood = dome(-np.pi, np.pi, lambda A: EY - 0.17 + 0.215 * np.clip((1.3 - np.abs(A)) / 0.25, 0, 1), lambda A: np.full_like(A, HC[1] + 0.125), hood_radius, 64, 22, 20, True, hood_weights)
hood = hem(drape(hood, 0.004, 0.12, 9), 0.012)
helmet = dome(-np.pi, np.pi, mixc(EY + 0.024, EY - 0.04), lambda A: np.full_like(A, HC[1] + 0.11), 0.028, 48, 18, 25, True)
lens = dome(-1.2, 1.2, lambda A: np.full_like(A, EY - 0.03), lambda A: np.full_like(A, EY + 0.03), 0.03, 32, 10, 30)
frame = hem(dome(-1.28, 1.28, lambda A: np.full_like(A, EY - 0.036), lambda A: np.full_like(A, EY + 0.036), 0.024, 32, 10, 30), 0.006)
strap = dome(1.2, 2 * np.pi - 1.2, lambda A: np.full_like(A, EY - 0.01), lambda A: np.full_like(A, EY + 0.024), lambda D: head_radius(D, 0.052) + 0.002, 30, 4, 25)

# ---------- Pants: light grey, baggy, cargo pockets ----------
pt_mask = (legs | (torso & (y < J['Hips'][1] + 0.1)) | (foot & (y > ANKLE + 0.02))) & ~hand
pt_off = 0.036 + 0.05 * np.clip(shin_t, 0, 1) + 0.01 * np.clip(-(z - J['Hips'][2]) / 0.1, 0, 1)
pants = shell(pt_mask, pt_off, 16)
folds(pants, 'UpLeg', 'Foot', 'Leg', 0.09, 0.007, 0.06, 11)             # knees
folds(pants, 'UpLeg', 'Foot', 'Foot', 0.1, 0.01, 0.045, 12)             # stacking over the boots
folds(pants, 'Hips', 'Leg', 'Hips', 0.12, 0.004, 0.07, 13)
drape(pants, 0.005, 0.25, 14)
pants = clip(pants, (J['Hips'][1] + 0.085) - pants.B[:, 1])
pants = clip(pants, pants.B[:, 1] - (ANKLE - 0.015))
pants = hem(pants, 0.01)
Bp = pants.B
thigh_t = sided(Bp, 'UpLeg', 'Leg')
pocket_f = np.minimum.reduce([0.24 - np.abs(thigh_t - 0.55),
                              (np.abs(Bp[:, 0]) - np.abs(J['LeftUpLeg'][0]) - 0.03) * 3,
                              (0.065 - np.abs(Bp[:, 2] - J['LeftUpLeg'][2])) * 3])
cargo = clip(pants.copy(), pocket_f)
flap = hem(lift(clip(cargo.copy(), 0.42 - sided(cargo.B, 'UpLeg', 'Leg')), 0.013), 0.005)       # pocket flap
cargo = hem(lift(cargo, 0.009), 0.009)
pt_kick, pt_main = split(pants, (ANKLE + 0.09) - pants.B[:, 1])

# ---------- Gloves, boots, skin ----------
gl_mask = hand | (fore_t > 0.7)
gloves = shell(gl_mask, np.where(hand, 0.014, 0.03 + 0.05 * np.clip((0.97 - fore_t) / 0.25, 0, 1)), 6)
gloves = hem(clip(gloves, sided(gloves.B, 'ForeArm', 'Hand') - 0.74), 0.008)
glove_cuff, glove_hand = split(gloves, 0.95 - sided(gloves.B, 'ForeArm', 'Hand'))

boots = shell(foot | (legs & (shin_t > 0.55)), np.where(foot, 0.024, 0.032), 6)
boots.X[:, 1] = np.maximum(boots.X[:, 1], 0.0)
boots = hem(clip(boots, (ANKLE + 0.14) - boots.B[:, 1]), 0.01)
sole, upper = split(boots, 0.022 - boots.P[:, 1])

skin = Mesh(np.hstack([P0, P0, Nsm, W0, np.zeros((len(P0), 1))]), T0[(head | neck)[T0].all(1)])
skin = Mesh(*compact(skin.X, skin.T))
skin = clip(skin, skin.B[:, 1] - (NOSE_Y - 0.03))                        # the collar covers the rest


# ---------- Fabric textures (tileable normal maps) ----------
def tile_noise(n, scale, seed):
    r = np.random.default_rng(seed)
    f = np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2
    a = np.real(np.fft.ifft2(np.exp(-f * (n / scale) ** 2) * (r.normal(size=(n, n)) + 1j * r.normal(size=(n, n)))))
    return (a - a.mean()) / (a.std() + 1e-9)


def normal_png(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    buf = io.BytesIO(); Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(buf, 'PNG')
    return buf.getvalue()


S = 512
u, v = np.meshgrid(np.arange(S) / S, np.arange(S) / S)
TEX = {
    # Three-layer shell: fine plain weave, a ripstop grid and a little crinkle.
    'shell': lambda: normal_png(0.25 * np.sin(2 * np.pi * 32 * u) * np.sin(2 * np.pi * 32 * v)
                                + 0.8 * np.maximum(np.cos(2 * np.pi * 8 * u), np.cos(2 * np.pi * 8 * v)) ** 24
                                + 0.5 * tile_noise(S, 40, 1), 0.7),
    # Pants face fabric: diagonal twill.
    'twill': lambda: normal_png(0.6 * np.sin(2 * np.pi * (64 * u + 64 * v)) + 0.5 * tile_noise(S, 30, 2), 0.9),
    # Knit, for the goggle strap.
    'knit': lambda: normal_png(np.abs(np.sin(np.pi * 40 * u + 0.5 * np.sign(np.sin(np.pi * 56 * v)))) * np.sin(np.pi * 56 * v) ** 2 * 1.5, 1.2),
    # Pebbled synthetic leather for gloves and boots.
    'leather': lambda: normal_png(np.tanh(tile_noise(S, 70, 3) * 1.5) * 0.8 + 0.3 * tile_noise(S, 14, 4), 1.4),
    # Matte hard goods.
    'matte': lambda: normal_png(0.4 * tile_noise(S, 90, 5), 0.6),
}

SAGE, SAGE_DK, PANT, PANT_DK = 0xaebf96, 0x95a77e, 0xd3d6d6, 0xb4b9bb
# name: (colour, roughness, metalness, texture, metres per tile, normal scale, sheen)
MATS = {
    'Skin': (0xc99a78, 0.55, 0.0, None, 0, 0, None),
    'Jacket': (SAGE, 0.78, 0.0, 'shell', 0.05, 0.6, 0.35),
    'JacketCuff': (SAGE_DK, 0.82, 0.0, 'shell', 0.05, 0.6, 0.35),
    'Zip': (0x111214, 0.45, 0.0, 'twill', 0.012, 0.8, None),
    'Pants': (PANT, 0.85, 0.0, 'twill', 0.06, 0.55, 0.4),
    'PantsKick': (PANT_DK, 0.7, 0.0, 'twill', 0.04, 0.8, 0.3),
    'Gloves': (0x16171a, 0.55, 0.0, 'leather', 0.06, 0.8, None),
    'GloveCuff': (0x1f2124, 0.85, 0.0, 'shell', 0.04, 0.6, 0.3),
    'Boots': (0x1b1c1e, 0.6, 0.0, 'leather', 0.08, 0.7, None),
    'Sole': (0x0d0d0e, 0.9, 0.0, 'matte', 0.05, 0.5, None),
    'Helmet': (0xe9e4d6, 0.45, 0.0, 'matte', 0.2, 0.4, None),
    'Strap': (0x111214, 0.85, 0.0, 'knit', 0.03, 0.8, None),
    'Frame': (0x0e0f10, 0.6, 0.0, 'matte', 0.1, 0.4, None),
    'Lens': (0xf2a03a, 0.06, 0.6, None, 0, 0, None),
}
PARTS = ([('Skin', skin), ('Jacket', jk_main), ('JacketCuff', jk_cuffs), ('Jacket', hood)] + [('Zip', zp) for zp in zips]
         + [('Pants', pt_main), ('PantsKick', pt_kick), ('Pants', cargo), ('Pants', flap),
            ('Gloves', glove_hand), ('GloveCuff', glove_cuff), ('Boots', upper), ('Sole', sole),
            ('Helmet', helmet), ('Frame', frame), ('Lens', lens)])                 # the strap sits under the hood


def lin(h): return [((h >> s & 255) / 255) ** 2.2 for s in (16, 8, 0)]


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


def add_image(png):
    while len(blob) % 4: blob.append(0)
    views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(png)})
    blob.extend(png)
    return len(views) - 1


def weights4(Wv):
    order = np.argsort(-Wv, 1)[:, :4]
    w = np.take_along_axis(Wv, order, 1)
    w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
    return order.astype(np.uint16), w.astype(np.float32)


def box_uv(m, tile):
    """Per-triangle box projection; vertices are split where the projection axis changes."""
    P, T = m.P, m.T
    ax = np.abs(np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])).argmax(1)
    uk, inv = np.unique((T * 3 + ax[:, None]).ravel(), return_inverse=True)
    vi, a = uk // 3, uk % 3
    Pv = P[vi]
    UV = np.where((a == 0)[:, None], Pv[:, [2, 1]], np.where((a == 1)[:, None], Pv[:, [0, 2]], Pv[:, [0, 1]])) / tile
    UV[:, 1] *= -1
    return vi, inv.reshape(-1, 3), UV


images, textures, tex_index, materials, mat_index = [], [], {}, [], {}
for name, (col, rough, metal, tex, tile, nscale, sheen) in MATS.items():
    mat = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': lin(col) + [1], 'roughnessFactor': rough, 'metallicFactor': metal},
           'doubleSided': name != 'Skin'}
    if tex:
        if tex not in tex_index:
            images.append({'bufferView': add_image(TEX[tex]()), 'mimeType': 'image/png', 'name': tex})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            tex_index[tex] = len(textures) - 1
        mat['normalTexture'] = {'index': tex_index[tex], 'scale': nscale}
    if sheen:
        mat['extensions'] = {'KHR_materials_sheen': {'sheenColorFactor': [sheen] * 3, 'sheenRoughnessFactor': 0.6}}
    mat_index[name] = len(materials); materials.append(mat)

prims_body, prims_gear, total = [], [], 0
for name, m in PARTS:
    if len(m.T) == 0: continue
    tile = MATS[name][4]
    vi, T, UV = box_uv(m, tile) if tile else (np.arange(len(m.X)), m.T, None)
    X = m.X[vi]
    P = X[:, 0:3]
    N = vnormals(P, T)
    # Cheap ambient occlusion: fold valleys and concave spots get darker.
    e, deg = edges_of(T, len(P))
    concave = np.clip(((laplace(P, e, deg, 1, 1.0) - P) * N).sum(1) * -400, 0, 0.35)
    ao = np.clip(1 + X[:, 9 + NB] * 18 - concave * 0.5, 0.7, 1.0)
    j, w = weights4(X[:, 9:9 + NB])
    attrs = {'POSITION': add(P.astype(np.float32), 5126, 'VEC3', 34962, True),
             'NORMAL': add(N.astype(np.float32), 5126, 'VEC3', 34962),
             'COLOR_0': add(np.repeat(ao[:, None], 3, 1).astype(np.float32), 5126, 'VEC3', 34962),
             'JOINTS_0': add(j, 5123, 'VEC4', 34962), 'WEIGHTS_0': add(w, 5126, 'VEC4', 34962)}
    if UV is not None: attrs['TEXCOORD_0'] = add(UV.astype(np.float32), 5126, 'VEC2', 34962)
    (prims_body if name == 'Skin' else prims_gear).append(
        {'attributes': attrs, 'indices': add(T.astype(np.uint32).ravel(), 5125, 'SCALAR', 34963), 'material': mat_index[name]})
    total += len(P)

nodes = [{'name': 'RiderBody', 'mesh': 0, 'skin': 0}, {'name': 'RiderGear', 'mesh': 1, 'skin': 0}]
first = len(nodes)
for n, parent, pos in bones:
    nodes.append({'name': n, 'translation': (pos - (J[parent] if parent else 0)).tolist()})
for i, (n, parent, pos) in enumerate(bones):
    if parent: nodes[first + BI[parent]].setdefault('children', []).append(first + i)
ibm = np.stack([np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [-p[0], -p[1], -p[2], 1]], np.float32) for _, _, p in bones])
skin_def = {'joints': list(range(first, first + NB)), 'skeleton': first, 'inverseBindMatrices': add(ibm.reshape(-1, 16), 5126, 'MAT4')}
while len(blob) % 4: blob.append(0)
gltf = {'asset': {'version': '2.0', 'generator': 'ski_map tools/make_rider.py',
                  'copyright': 'Body: MakeHuman (CC0). Outfit, textures and rig: ski_map (MIT).'},
        'extensionsUsed': ['KHR_materials_sheen'],
        'scene': 0, 'scenes': [{'nodes': [0, 1, first]}], 'nodes': nodes,
        'meshes': [{'name': 'RiderBody', 'primitives': prims_body}, {'name': 'RiderGear', 'primitives': prims_gear}],
        'materials': materials, 'images': images, 'textures': textures,
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'skins': [skin_def], 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
with open(sys.argv[1], 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
print('height', HEIGHT, 'verts', total, 'bytes', len(blob))
