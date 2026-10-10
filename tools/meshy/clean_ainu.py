"""
Retire du maillage d'Ainu les bouts de pattes de Matcha restés collés sur son
dos lors de la séparation (Matcha a maintenant des pattes complètes).
Les sommets concernés sont aplatis sur le dos (lissage harmonique, le reste du
maillage ne bouge pas) et repeints avec la couleur du pelage voisin.
Usage : python clean_ainu.py <bake dir> <matcha_hr.npz>   (modifie ainu.npz / ainu.jpg)
"""
import sys, numpy as np
from pathlib import Path
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import binary_dilation

bake, hr_f = Path(sys.argv[1]), sys.argv[2]
d = dict(np.load(bake / 'ainu.npz'))
V, UV, F = d['v'].astype(np.float64), d['uv'].astype(np.float64), d['f'].astype(np.int64)
tex = np.asarray(Image.open(bake / 'ainu.jpg').convert('RGB')).astype(np.float64)
H, W = tex.shape[:2]
def sample(uv):
    return tex[np.clip(((1 - uv[:, 1]) * (H - 1)).round().astype(int), 0, H - 1), np.clip((uv[:, 0] * (W - 1)).round().astype(int), 0, W - 1)]
col = sample(UV)
lum = col.mean(1) / 255
dist, _ = cKDTree(np.load(hr_f)['v']).query(V)

# voisins dans le maillage (les coutures UV dupliquent les sommets : on les relie par la position)
key = np.unique(np.round(V * 1e5).astype(np.int64), axis=0, return_inverse=True)[1].reshape(-1)
nbr = [set() for _ in range(len(V))]
for a, b, c in F:
    for i, j in ((a, b), (b, c), (c, a)):
        nbr[i].add(j); nbr[j].add(i)
same = {}
for i, k in enumerate(key): same.setdefault(k, []).append(i)
for g in same.values():
    if len(g) > 1:
        u = set().union(*(nbr[i] for i in g))
        for i in g: nbr[i] = u

# graines : tout près des pattes de Matcha, au-dessus du dos ; on étend aux voisins sombres
R = (dist < 0.03) & (V[:, 1] > 1.3)
# taches très sombres restées à l'avant du dos (patte avant de Matcha)
R |= (lum < 0.2) & (V[:, 1] > 1.35) & (V[:, 2] > 0.05) & (V[:, 2] < 0.45) & (np.abs(V[:, 0]) < 0.25)
for _ in range(6):
    grow = R.copy()
    for i in np.nonzero(R)[0]:
        for j in nbr[i]:
            if not R[j] and dist[j] < 0.09 and V[j, 1] > 1.22 and lum[j] < 0.3: grow[j] = True
    R = grow
for g in same.values():          # mêmes positions = même décision
    if R[g].any(): R[g] = True
print('sommets retirés', int(R.sum()))

# aplatissement : chaque sommet retiré prend la moyenne de ses voisins (bord fixe)
idx = np.nonzero(R)[0]
nb = [np.array(sorted(nbr[i])) for i in idx]
for _ in range(120):
    newp = np.array([V[n].mean(0) for n in nb])
    V[idx] = newp

# repeinture : texels des triangles concernés = couleur des sommets voisins non retirés
keep = np.nonzero(~R)[0]
tk = cKDTree(V[keep])
mask = np.zeros((H, W), bool); pos = np.zeros((H, W, 3))
for t in F[R[F].any(1)]:
    p = UV[t] * np.array([W - 1, H - 1]); p[:, 1] = (H - 1) - p[:, 1]
    x0, x1 = int(np.floor(p[:, 0].min())) - 1, int(np.ceil(p[:, 0].max())) + 1
    y0, y1 = int(np.floor(p[:, 1].min())) - 1, int(np.ceil(p[:, 1].max())) + 1
    xs, ys = np.meshgrid(np.arange(max(0, x0), min(W, x1 + 1)), np.arange(max(0, y0), min(H, y1 + 1)))
    px, py = xs.ravel() + 0.0, ys.ravel() + 0.0
    a, b, c = p
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-9: continue
    l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den
    l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den
    l3 = 1 - l1 - l2
    ok = (l1 > -0.15) & (l2 > -0.15) & (l3 > -0.15)
    X, Y = xs.ravel()[ok], ys.ravel()[ok]
    mask[Y, X] = True
    pos[Y, X] = np.stack([l1[ok], l2[ok], l3[ok]], 1) @ V[t]
mask2 = binary_dilation(mask, iterations=1)
ys, xs = np.nonzero(mask2)
P = pos[ys, xs]
miss = ~mask[ys, xs]
if miss.any():                  # texels de la marge : position du texel peint le plus proche
    yy, xx = np.nonzero(mask)
    j = cKDTree(np.stack([yy, xx], 1)).query(np.stack([ys[miss], xs[miss]], 1))[1]
    P[miss] = pos[yy[j], xx[j]]
dd, jj = tk.query(P, k=8)
w = 1 / (dd + 1e-3)
newc = (col[keep][jj] * w[..., None]).sum(1) / w.sum(1, keepdims=True)
rng = np.random.default_rng(0)
newc *= 1 + (rng.random((len(newc), 1)) - 0.5) * 0.08     # léger grain de pelage
tex[ys, xs] = np.clip(newc, 0, 255)
Image.fromarray(tex.astype(np.uint8)).save(bake / 'ainu.jpg', quality=90)
# normales recalculées pour les sommets aplatis
Fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
acc = np.zeros((key.max() + 1, 3))
for k in range(3): np.add.at(acc, key[F[:, k]], Fn)
N = d['n'].astype(np.float64)
N[idx] = acc[key[idx]] / np.maximum(np.linalg.norm(acc[key[idx]], axis=1, keepdims=True), 1e-12)
d['n'] = N.astype(np.float32)
d['v'] = V.astype(np.float32)
np.savez(bake / 'ainu.npz', **d)
print('texels repeints', len(ys))
