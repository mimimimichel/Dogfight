"""
Remplace Matcha par une forme plus détaillée (générée depuis un gros plan) :
orientation vers +z, puis recalage (échelle, position, lacet) sur l'ancienne
forme de Matcha par minimisation de la distance entre surfaces (ICP simplifié).
Usage : python place_matcha.py <matcha_hr.glb> <ancien matcha_dense.npz> <sortie.npz>
"""
import sys, numpy as np, trimesh
from scipy.spatial import cKDTree
src, old_f, outp = sys.argv[1:4]
m = trimesh.load(src).to_geometry()
V = np.asarray(m.vertices); F = np.asarray(m.faces)
q = np.round(V * 2e4).astype(np.int64)
u, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
V = V[idx]; F = inv.reshape(-1)[F]
m = trimesh.Trimesh(V, F, process=True); m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices()
m = max(m.split(only_watertight=False), key=lambda c: len(c.faces))
V = np.stack([m.vertices[:, 2], m.vertices[:, 1], -m.vertices[:, 0]], 1)   # nez vers +z
F = np.asarray(m.faces)
O = np.load(old_f)['v'].astype(float)
# initialisation : même hauteur, mêmes centres
s = np.ptp(O[:, 1]) / np.ptp(V[:, 1])
V0 = V * s
V0 += np.array([O[:, 0].mean() - V0[:, 0].mean(), O[:, 1].min() - V0[:, 1].min(), (O[:, 2].max() + O[:, 2].min()) / 2 - (V0[:, 2].max() + V0[:, 2].min()) / 2])
P = V0.copy()
tO = cKDTree(O)
rng = np.random.default_rng(0)
samp = rng.choice(len(P), min(20000, len(P)), replace=False)
Osamp = O[rng.choice(len(O), min(20000, len(O)), replace=False)]
for it in range(40):
    A = P[samp]
    d1, j1 = tO.query(A)
    tP = cKDTree(P)
    d2, j2 = tP.query(Osamp)
    src_pts = np.vstack([A, P[j2]]); dst = np.vstack([O[j1], Osamp])
    w = np.ones(len(src_pts))
    mu_s, mu_d = src_pts.mean(0), dst.mean(0)
    X, Y = src_pts - mu_s, dst - mu_d
    # rotation uniquement autour de y (lacet) + échelle uniforme
    a = np.sum(X[:, 2] * Y[:, 0] - X[:, 0] * Y[:, 2]); b = np.sum(X[:, 0] * Y[:, 0] + X[:, 2] * Y[:, 2])
    th = np.arctan2(a, b)
    R = np.array([[np.cos(th), 0, np.sin(th)], [0, 1, 0], [-np.sin(th), 0, np.cos(th)]])
    XR = X @ R.T
    sc = np.sum(XR * Y) / np.sum(XR * XR)
    P = (P - mu_s) @ R.T * sc + mu_d
    if it % 10 == 0: print(it, 'écart moyen', round(float(d1.mean()), 4), 'lacet', round(float(np.degrees(th)), 2), 'échelle', round(float(sc), 4))
print('final', P.min(0).round(3), P.max(0).round(3), len(P), len(F))
np.savez(outp, v=P.astype(np.float32), f=F.astype(np.int32))
