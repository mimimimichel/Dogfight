"""
Visage de Matcha d'après la vue de face haute définition, calé par points de
repère (yeux, sourcils, truffe, gueule, menton, joues, oreilles) : la projection
de la tête est déformée en douceur (plaque mince) pour que chaque repère du
modèle tombe sur le même repère de la capture. Remplace l'avant de la tête dans
la texture déjà cuite, avec un fondu sur les côtés.
Usage : python facebake.py <bake prefix> <calib.json> <capture.png> <vue> <repères.json>
repères.json : {"model": [[u, v], ...], "image": [[u, v], ...]}  (pixels de la capture)
"""
import sys, json, numpy as np
from PIL import Image
from scipy.interpolate import RBFInterpolator
from scipy.ndimage import gaussian_filter

prefix, cal_f, cap_f, view, lm_f = sys.argv[1:6]
c = json.load(open(cal_f))[view]
lm = json.load(open(lm_f))
d = np.load(prefix + '.npz'); V, N, UV, F = d['v'].astype(float), d['n'].astype(float), d['uv'].astype(float), d['f']
tex = np.asarray(Image.open(prefix + '.jpg').convert('RGB')).astype(float)
T = tex.shape[0]
img = np.asarray(Image.open(cap_f).convert('RGB')).astype(float)
H, W = img.shape[:2]

# rasterisation UV : position et normale de chaque texel (texture retournée verticalement à l'enregistrement)
pos = np.zeros((T, T, 3)); nrm = np.zeros((T, T, 3)); cov = np.zeros((T, T), bool)
uvp = UV * (T - 1)
for t in F:
    a, b, cc = uvp[t]
    x0, x1 = int(np.floor(min(a[0], b[0], cc[0]))), int(np.ceil(max(a[0], b[0], cc[0])))
    y0, y1 = int(np.floor(min(a[1], b[1], cc[1]))), int(np.ceil(max(a[1], b[1], cc[1])))
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    px, py = xs.ravel() + 0.0, ys.ravel() + 0.0
    den = (b[1] - cc[1]) * (a[0] - cc[0]) + (cc[0] - b[0]) * (a[1] - cc[1])
    if abs(den) < 1e-12: continue
    l1 = ((b[1] - cc[1]) * (px - cc[0]) + (cc[0] - b[0]) * (py - cc[1])) / den
    l2 = ((cc[1] - a[1]) * (px - cc[0]) + (a[0] - cc[0]) * (py - cc[1])) / den
    l3 = 1 - l1 - l2
    ok = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    X, Y = xs.ravel()[ok], ys.ravel()[ok]
    inb = (X >= 0) & (X < T) & (Y >= 0) & (Y < T)
    L = np.stack([l1[ok], l2[ok], l3[ok]], 1)[inb]; X, Y = X[inb], Y[inb]
    pos[Y, X] = L @ V[t]; nrm[Y, X] = L @ N[t]; cov[Y, X] = True
nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-9)

ca, sa, ce, se = np.cos(c['az']), np.sin(c['az']), np.cos(c['el']), np.sin(c['el'])
R = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]]) @ np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
def project(P):
    q = (P - np.array(c['center'])) @ R.T; w = 1 / (1 - c['k'] * q[:, 2])
    return np.stack([q[:, 0] * w * c['s'] + c['tx'], -q[:, 1] * w * c['s'] + c['ty']], 1), q[:, 2]

# déformation en plaque mince : repères du modèle -> repères de la capture
src, dst = np.array(lm['model'], float), np.array(lm['image'], float)
warp = RBFInterpolator(src, dst - src, kernel='thin_plate_spline', smoothing=1.0)

ys, xs = np.nonzero(cov)
P, Nn = pos[ys, xs], nrm[ys, xs]
x, y, z = P.T
head = (y > 1.70) & (z > -0.02)
vd = R.T @ np.array([0, 0, 1.0])
facing = Nn @ vd
# visibilité depuis cette vue (z-buffer des texels de Matcha eux-mêmes : les oreilles cachent l'arrière)
uv2, depth = project(P)
k = 2
iu, iv = (uv2[:, 0] / k).astype(int), (uv2[:, 1] / k).astype(int)
zb = np.full((H // k + 1, W // k + 1), -1e9)
okp = (iu >= 0) & (iu < W // k) & (iv >= 0) & (iv < H // k)
np.maximum.at(zb, (iv[okp], iu[okp]), depth[okp])
vis = depth >= zb[np.clip(iv, 0, H // k), np.clip(iu, 0, W // k)] - 0.01
sel = head & (facing > 0.12) & vis
uvw = uv2[sel] + warp(uv2[sel])
u, v = uvw[:, 0], uvw[:, 1]
u0, v0 = np.clip(np.floor(u).astype(int), 0, W - 2), np.clip(np.floor(v).astype(int), 0, H - 2)
fu, fv = np.clip(u - u0, 0, 1)[:, None], np.clip(v - v0, 0, 1)[:, None]
col = img[v0, u0] * (1 - fu) * (1 - fv) + img[v0, u0 + 1] * fu * (1 - fv) + img[v0 + 1, u0] * (1 - fu) * fv + img[v0 + 1, u0 + 1] * fu * fv
wgt = np.clip((facing[sel] - 0.12) / 0.3, 0, 1)
wgt = wgt * wgt * (3 - 2 * wgt)
wgt *= np.clip((y[sel] - 1.70) / 0.05, 0, 1)
out = tex[::-1].copy()          # repère UV (ligne 0 = v 0)
wmap = np.zeros((T, T)); cmap = np.zeros((T, T, 3))
wmap[ys[sel], xs[sel]] = wgt; cmap[ys[sel], xs[sel]] = col
wmap = np.minimum(wmap, gaussian_filter(wmap, 1.0) * 1.5)
out = out * (1 - wmap[..., None]) + cmap * wmap[..., None]
Image.fromarray(np.clip(out[::-1], 0, 255).astype(np.uint8)).save(prefix + '.jpg', quality=92)
print('texels du visage', int(sel.sum()))
