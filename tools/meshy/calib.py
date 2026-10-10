"""
Étape 3 : calage des caméras. Pour chaque capture (silhouette du rendu gris du
visualiseur Meshy), retrouve l'orientation (azimut, élévation) et le cadrage
(échelle, décalage) qui superposent au mieux la silhouette du maillage.
Projection orthographique « faible perspective ».
Usage : python calib.py <dossier captures> <dense.npz> <sortie.json>
"""
import sys, json, glob, numpy as np
from PIL import Image
from pathlib import Path
cap, dense, outp = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
KFIX = float(sys.argv[4]) if len(sys.argv) > 4 else None
# tours de caméra : anneau -> (azimut initial, pas en degrés, élévation min, max)
SEQ = {0: (46.0, -22.67, 5, 40), 1: (43.3, -22.67, -45, -3)} if len(sys.argv) > 5 and sys.argv[5] == 'seq' else None
D = np.load(dense); V, F = D['v'].astype(np.float64), D['f']
# points échantillonnés sur la surface
rng = np.random.default_rng(1)
A = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
def sample(n):
    fi = rng.choice(len(F), n, p=A / A.sum()); r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
    return V[F[fi, 0]] * (1 - s)[:, None] + V[F[fi, 1]] * (s * (1 - r2))[:, None] + V[F[fi, 2]] * (s * r2)[:, None]
P0 = sample(30000); P1 = sample(200000)
C = V.mean(0); P0 -= C; P1 -= C

def rot(az, el):
    # caméra en orbite : azimut autour de y, élévation (caméra au-dessus si el > 0)
    ca, sa, ce, se = np.cos(az), np.sin(az), np.cos(el), np.sin(el)
    Ry = np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
    Rx = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]])
    return Rx @ Ry  # coordonnées caméra : x droite, y haut, z vers la caméra

def load_mask(f, k):
    im = np.asarray(Image.open(f).convert('L')).astype(float)
    m = im > 70
    m[:100, :200] = False  # panneau de statistiques
    from scipy.ndimage import label
    lab, n = label(m)
    if n > 1: m = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)  # plus grande tache (retire les icônes)
    H, W = m.shape
    m = m[: H // k * k, : W // k * k].reshape(H // k, k, W // k, k).mean((1, 3)) > 0.5
    return m

def proj(P, R, k):
    q = P @ R.T
    w = 1.0 / (1.0 - k * q[:, 2])  # perspective : k = 1 / distance de la caméra
    return q[:, 0] * w, q[:, 1] * w

def raster(P, R, mask_shape, s, tx, ty, k=0.0):
    qx, qy = proj(P, R, k)
    u = (qx * s + tx).astype(int); v = (-qy * s + ty).astype(int)
    H, W = mask_shape
    ok = (u >= 0) & (u < W) & (v >= 0) & (v < H)
    g = np.zeros(mask_shape, bool); g[v[ok], u[ok]] = True
    return g

def fit_frame(P, R, m, k=0.0):
    qx, qy = proj(P, R, k)
    ys, xs = np.nonzero(m)
    hm, wm = ys.max() - ys.min(), xs.max() - xs.min()
    hq, wq = np.ptp(qy), np.ptp(qx)
    s = (hm / hq + wm / wq) / 2
    tx = (xs.max() + xs.min()) / 2 - (qx.max() + qx.min()) / 2 * s
    ty = (ys.max() + ys.min()) / 2 + (qy.max() + qy.min()) / 2 * s
    return s, tx, ty

def iou(a, b):
    from scipy.ndimage import binary_closing
    a = binary_closing(a, iterations=2)
    return (a & b).sum() / max(1, (a | b).sum())

res = {}
files = sorted(glob.glob(str(cap / 's*_*.png')))
for f in files:
    m4 = load_mask(f, 4)
    best = (-1, None)
    name0 = Path(f).name[1:]
    ring, idx = int(name0[0]), int(name0[2:4])
    if SEQ:
        # séquence connue : azimut prédit par le tour de caméra, élévation bornée
        az0, daz, elo, ehi = SEQ[ring]
        pred = np.radians(az0 + daz * idx)
        azs = pred + np.radians(np.arange(-12, 12.1, 2))
        els = np.radians(np.arange(elo, ehi + 0.1, 3))
    else:
        azs = np.radians(np.arange(0, 360, 4)); els = np.radians(np.arange(-10, 61, 5))
    for el in els:
        for az in azs:
            R = rot(az, el); s, tx, ty = fit_frame(P0, R, m4, KFIX or 0.0)
            sc = iou(raster(P0, R, m4.shape, s, tx, ty, KFIX or 0.0), m4)
            if sc > best[0]: best = (sc, (az, el))
    # affinage à pleine résolution : orientation, perspective, échelle
    m1 = load_mask(f, 2)
    az, el = best[1]
    def score(az, el, k, ds=1.0):
        R = rot(az, el); s, tx, ty = fit_frame(P1, R, m1, k)
        return iou(raster(P1, R, m1.shape, s * ds, tx, ty, k), m1), (s * ds, tx, ty)
    k = KFIX if KFIX is not None else 0.0
    cur, fr = score(az, el, k)
    if KFIX is None:
        for kk in np.arange(0.05, 0.46, 0.05):
            sc, f2 = score(az, el, kk)
            if sc > cur: cur, fr, k = sc, f2, kk
    for step in (np.radians(2), np.radians(1), np.radians(0.5)):
        for _ in range(6):
            improved = False
            cands = [(step, 0, 0), (-step, 0, 0), (0, step, 0), (0, -step, 0)]
            if KFIX is None: cands += [(0, 0, 0.02), (0, 0, -0.02)]
            for dz, de, dk in cands:
                for ds in (1.0, 0.99, 1.01):
                    sc, f2 = score(az + dz, el + de, k + dk, ds)
                    if sc > cur: cur, fr, az, el, k, improved = sc, f2, az + dz, el + de, k + dk, True
            if not improved: break
    s, tx, ty = fr
    name = Path(f).name[1:]
    res[name] = {'az': float(az), 'el': float(el), 'k': float(k), 's': float(s * 2), 'tx': float(tx * 2), 'ty': float(ty * 2), 'iou': float(cur), 'center': C.tolist()}
    print(name, f'az {np.degrees(az):6.1f} el {np.degrees(el):5.1f} k {k:.2f} iou {cur:.3f}', flush=True)
json.dump(res, open(outp, 'w'), indent=1)
