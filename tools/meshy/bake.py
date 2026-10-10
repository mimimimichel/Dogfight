"""
Étape 4 : cuisson de la texture. Décime une partie (Ainu ou Matcha), la déplie
(xatlas), puis projette sur chaque texel la couleur des captures « base color »
du visualiseur Meshy, en tenant compte de la visibilité (z-buffer) et de
l'orientation de la surface face à chaque caméra.
Usage : python bake.py <part_dense.npz> <dense_complet.npz> <calib.json> <captures> <nb_triangles> <taille_texture> <sortie_prefix>
"""
import sys, json, numpy as np
import trimesh, xatlas, fast_simplification as fs
from pathlib import Path
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, minimum_filter

part_f, full_f, cal_f, cap, ntri, T, outp = sys.argv[1:8]
ntri, T = int(ntri), int(T)
EXP = float(sys.argv[8]) if len(sys.argv) > 8 else 12
FACEVIEW = None; FACEREG = 'head'
for a in list(sys.argv[9:]):
    if a.startswith('face='): FACEVIEW = a[5:]; sys.argv.remove(a)
    elif a.startswith('facereg='): FACEREG = a[8:]; sys.argv.remove(a)
# corrections 2D par région (tête d'Ainu, Matcha) : regcal.py
REGS = {}
for a in sys.argv[9:]:
    rname, rfile, rexp = a.split(':')
    REGS[rname] = (json.load(open(rfile)), float(rexp))
def region_mask(Pp, rname):
    x, y, z = Pp.T
    if rname == 'head': return (z > 0.78) & (y > 0.95)
    if rname == 'mhead': return (y > 1.76) & (z > 0.05)
    if rname == 'matcha': return np.ones(len(Pp), bool)
    return np.zeros(len(Pp), bool)
cal = json.load(open(cal_f))

def load(f):
    d = np.load(f); return d['v'].astype(np.float64), d['f'].astype(np.int64)

# --- maillage de la partie, décimé et déplié ---------------------------------
V, F = load(part_f)
if ntri < len(F):
    v2, f2 = fs.simplify(V.astype(np.float32), F.astype(np.int32), target_reduction=1 - ntri / len(F))
    V, F = v2.astype(np.float64), f2.astype(np.int64)
m = trimesh.Trimesh(V, F, process=True)
trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=3)
V, F = np.asarray(m.vertices), np.asarray(m.faces)
vmap, IDX, UV = xatlas.parametrize(V.astype(np.float32), F.astype(np.uint32))
V2 = V[vmap]; N2 = trimesh.Trimesh(V, F, process=False).vertex_normals[vmap]
print('déplié', len(V2), 'sommets', len(IDX), 'triangles')

# --- rasterisation dans l'espace UV : position et normale par texel ----------
pos = np.zeros((T, T, 3)); nrm = np.zeros((T, T, 3)); cov = np.zeros((T, T), bool)
uvp = UV * (T - 1)
for t in IDX:
    a, b, c = uvp[t]
    x0, x1 = int(np.floor(min(a[0], b[0], c[0]))), int(np.ceil(max(a[0], b[0], c[0])))
    y0, y1 = int(np.floor(min(a[1], b[1], c[1]))), int(np.ceil(max(a[1], b[1], c[1])))
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    px, py = xs.ravel() + 0.0, ys.ravel() + 0.0
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d
    l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
    l3 = 1 - l1 - l2
    ok = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    if not ok.any(): continue
    L = np.stack([l1[ok], l2[ok], l3[ok]], 1)
    X, Y = xs.ravel()[ok], ys.ravel()[ok]
    inb = (X >= 0) & (X < T) & (Y >= 0) & (Y < T)
    X, Y, L = X[inb], Y[inb], L[inb]
    pos[Y, X] = L @ V2[t]; nrm[Y, X] = L @ N2[t]; cov[Y, X] = True
nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-9)
print('texels couverts', cov.sum())

# --- z-buffers des vues à partir du maillage complet (occultations mutuelles) -
FV, FF = load(full_f)
rng = np.random.default_rng(2)
A = np.linalg.norm(np.cross(FV[FF[:, 1]] - FV[FF[:, 0]], FV[FF[:, 2]] - FV[FF[:, 0]]), axis=1)
n = 1500000
fi = rng.choice(len(FF), n, p=A / A.sum()); r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
PS = FV[FF[fi, 0]] * (1 - s)[:, None] + FV[FF[fi, 1]] * (s * (1 - r2))[:, None] + FV[FF[fi, 2]] * (s * r2)[:, None]

def cam(c):
    ca, sa, ce, se = np.cos(c['az']), np.sin(c['az']), np.cos(c['el']), np.sin(c['el'])
    R = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]]) @ np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
    return R

def project(P, c, R):
    q = (P - np.array(c['center'])) @ R.T
    w = 1 / (1 - c['k'] * q[:, 2])
    return q[:, 0] * w * c['s'] + c['tx'], -q[:, 1] * w * c['s'] + c['ty'], q[:, 2]

acc = np.zeros((T, T, 3)); wsum = np.zeros((T, T)); best = np.zeros((T, T))
P = pos[cov]; Nn = nrm[cov]
for name, c in sorted(cal.items()):
    if c['iou'] < 0.72: continue
    if not Path(f'{cap}/c{name}').exists(): continue
    img = np.asarray(Image.open(f'{cap}/c{name}').convert('RGB')).astype(np.float64) / 255
    H, W = img.shape[:2]
    R = cam(c)
    # z-buffer à demi-résolution
    us, vs, zs = project(PS, c, R)
    h2, w2 = H // 2, W // 2
    iu, iv = (us / 2).astype(int), (vs / 2).astype(int)
    ok = (iu >= 0) & (iu < w2) & (iv >= 0) & (iv < h2)
    zb = np.full((h2, w2), -1e9)
    np.maximum.at(zb, (iv[ok], iu[ok]), zs[ok])
    zb = -minimum_filter(-zb, size=3)  # bouche les petits trous du nuage de points
    # silhouette érodée (évite de prendre le fond sur les bords)
    g = np.asarray(Image.open(f'{cap}/s{name}').convert('L')) > 70
    g[:240, :280] = False
    g = binary_erosion(g, iterations=max(3, W // 300))
    u, v, z = project(P, c, R)
    expo = np.full(len(P), EXP)
    u0, v0 = u.copy(), v.copy()   # chaque correction part de la projection brute ; la dernière région l'emporte
    for rname, (rc, rexp) in REGS.items():
        if name not in rc: continue
        r = rc[name]; inr = region_mask(P, rname)
        cr, sr, asp = np.cos(r.get('rot', 0.0)), np.sin(r.get('rot', 0.0)), r.get('asp', 1.0)
        a, b = (u0 - r['cx']) * r['ds'] * asp, (v0 - r['cy']) * r['ds'] / asp
        u, v = np.where(inr, cr * a - sr * b + r['cx'] + r['dx'], u), np.where(inr, sr * a + cr * b + r['cy'] + r['dy'], v)
        expo = np.where(inr, rexp, expo)
    ui, vi = np.clip(u.astype(int), 0, W - 1), np.clip(v.astype(int), 0, H - 1)
    zz = zb[np.clip(vi // 2, 0, h2 - 1), np.clip(ui // 2, 0, w2 - 1)]
    span = np.ptp(zs)
    tol = 0.012 * span
    if FACEVIEW and name == FACEVIEW:
        # orbites et coins de la gueule sont creux : tolérance plus large pour la vue de face
        tol = np.where(region_mask(P, FACEREG) & (Nn[:, 2] > 0.3), 0.06 * span, tol)
    vis = (z >= zz - tol) & g[vi, ui] & (u >= 0) & (u < W) & (v >= 0) & (v < H)
    # direction de vue (vers la caméra) dans le repère du modèle
    vd = R.T @ np.array([0, 0, 1.0])
    facing = np.clip(Nn @ vd, 0, 1)
    wgt = vis * facing ** expo * c["iou"] ** 6
    # avant de la tête : une seule vue (celle de face) pour des yeux et une truffe nets
    if FACEVIEW:
        front = region_mask(P, FACEREG) & (Nn[:, 2] > 0.3)
        wgt = np.where(front, wgt * (1e12 if name == FACEVIEW else 1.0), wgt)
    # échantillonnage bilinéaire
    u0, v0 = np.clip(np.floor(u).astype(int), 0, W - 2), np.clip(np.floor(v).astype(int), 0, H - 2)
    fu, fv = np.clip(u - u0, 0, 1)[:, None], np.clip(v - v0, 0, 1)[:, None]
    col = (img[v0, u0] * (1 - fu) * (1 - fv) + img[v0, u0 + 1] * fu * (1 - fv) + img[v0 + 1, u0] * (1 - fu) * fv + img[v0 + 1, u0 + 1] * fu * fv)
    a = acc[cov]; ws = wsum[cov]
    a += col * wgt[:, None]; ws += wgt
    acc[cov] = a; wsum[cov] = ws
    print(name, 'texels vus', int((wgt > 0.05).sum()), flush=True)

tex = np.zeros((T, T, 3))
have = wsum > 1e-4
tex[have] = acc[have] / wsum[have][:, None]
# remplissage : texels non vus (et marge autour des îlots) = couleur du texel vu le plus proche
idx = distance_transform_edt(~have, return_distances=False, return_indices=True)
tex = tex[idx[0], idx[1]]
print('texels sans vue', int((cov & ~have).sum()))
Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM).save(outp + '.jpg', quality=90)
np.savez(outp + '.npz', v=V2.astype(np.float32), n=N2.astype(np.float32), uv=UV.astype(np.float32), f=IDX.astype(np.int32))
print('écrit', outp)
