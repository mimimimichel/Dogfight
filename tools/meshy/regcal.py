"""
Étape 3 bis : calage fin par région (tête d'Ainu, Matcha). Pour chaque vue,
cherche une petite correction 2D (décalage, échelle) qui superpose au mieux le
contour de la région dans une fenêtre autour d'elle.
Usage : python regcal.py <dense.npz> <calib.json> <captures> <region> <sortie.json>
"""
import sys, json, numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, label
dense, cal_f, cap, region, outp = sys.argv[1:6]
cal = json.load(open(cal_f))
D = np.load(dense); V = D['v'].astype(float); F = D['f']
rng = np.random.default_rng(3)
A = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
n = 400000; fi = rng.choice(len(F), n, p=A / A.sum()); r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
P = V[F[fi, 0]] * (1 - s)[:, None] + V[F[fi, 1]] * (s * (1 - r2))[:, None] + V[F[fi, 2]] * (s * r2)[:, None]
x, y, z = P.T
REG = {
    'head': (z > 0.78) & (y > 0.95),
    'matcha': (y > 1.27) & (np.abs(x) < 0.26) & (z > -0.45) & np.where(z < 0.12, True, y > 1.5 + np.maximum(0, z - 0.12) * 0.5),
}[region]

def rot(c):
    ca, sa, ce, se = np.cos(c['az']), np.sin(c['az']), np.cos(c['el']), np.sin(c['el'])
    return np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]]) @ np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
out = {}
for name, c in sorted(cal.items()):
    R = rot(c); q = (P - np.array(c['center'])) @ R.T; w = 1 / (1 - c['k'] * q[:, 2])
    u = q[:, 0] * w * c['s'] + c['tx']; v = -q[:, 1] * w * c['s'] + c['ty']
    m = np.asarray(Image.open(f'{cap}/s{name}').convert('L')) > 70
    m[:100, :200] = False
    lab, k = label(m); m = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
    H, W = m.shape
    ur, vr = u[REG], v[REG]
    pad = 25
    x0, x1 = int(max(0, ur.min() - pad)), int(min(W, ur.max() + pad))
    y0, y1 = int(max(0, vr.min() - pad)), int(min(H, vr.max() + pad))
    if x1 - x0 < 20 or y1 - y0 < 20: continue
    mw = m[y0:y1, x0:x1]
    cx, cy = ur.mean(), vr.mean()
    def score(dx, dy, ds):
        uu = (u - cx) * ds + cx + dx - x0; vv = (v - cy) * ds + cy + dy - y0
        ok = (uu >= 0) & (uu < x1 - x0) & (vv >= 0) & (vv < y1 - y0)
        g = np.zeros(mw.shape, bool); g[vv[ok].astype(int), uu[ok].astype(int)] = True
        g = binary_closing(g, iterations=2)
        return (g & mw).sum() / max(1, (g | mw).sum())
    best = (score(0, 0, 1), 0.0, 0.0, 1.0)
    for step in (8, 4, 2, 1):
        for _ in range(8):
            imp = False
            _, dx, dy, ds = best
            for ddx, ddy, dds in ((step, 0, 0), (-step, 0, 0), (0, step, 0), (0, -step, 0), (0, 0, 0.01 * step / 2), (0, 0, -0.01 * step / 2)):
                sc = score(dx + ddx, dy + ddy, ds + dds)
                if sc > best[0]: best = (sc, dx + ddx, dy + ddy, ds + dds); imp = True
            if not imp: break
    out[name] = {'dx': best[1], 'dy': best[2], 'ds': best[3], 'cx': float(cx), 'cy': float(cy), 'iou': best[0]}
    print(name, region, {k: round(v, 3) for k, v in out[name].items()}, flush=True)
json.dump(out, open(outp, 'w'), indent=1)
