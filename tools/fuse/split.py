"""
Étape 1 : nettoie le maillage généré (Hunyuan3D-2 d'après l'illustration),
sépare Matcha d'Ainu, passe dans le repère du jeu (+z avant, +y haut, sol y=0)
et décime. Sortie : tools/fuse/src_ainu.npz, src_matcha.npz
Usage : python split.py <pair_shape.glb>
"""
import sys, numpy as np, trimesh, fast_simplification as fs
from pathlib import Path
OUT = Path(__file__).parent
S = 1.3          # échelle source → jeu
XSHIFT = 0.05    # recentrage avant/arrière (unités source)

m = trimesh.load(sys.argv[1]).to_geometry()
V = np.asarray(m.vertices); F = np.asarray(m.faces)
q = np.round(V * 2e4).astype(np.int64)
u, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
V = V[idx]; F = inv.reshape(-1)[F]
m = trimesh.Trimesh(V, F, process=True)
m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices()
m = max(m.split(only_watertight=False), key=lambda c: len(c.faces))
V = m.vertices; F = m.faces
# Matcha : au-dessus du dos d'Ainu, entre la croupe et le cou
isM = ((V[:, 1] > 0.15 + np.maximum(0, V[:, 0] - 0.12) * 0.5) & (V[:, 0] < 0.36) & (V[:, 0] > -0.36)) | ((V[:, 1] > 0.5) & (V[:, 0] < 0.56) & (V[:, 0] > -0.36))
fM = isM[F].all(axis=1)
def part(mask, target):
    p = trimesh.Trimesh(V, F[mask], process=True); p.remove_unreferenced_vertices()
    p = max(p.split(only_watertight=False), key=lambda c: len(c.faces))
    v, f = fs.simplify(p.vertices.astype(np.float32), p.faces.astype(np.int32), target_reduction=1 - target / len(p.faces))
    p = trimesh.Trimesh(v, f, process=True)
    trimesh.smoothing.filter_taubin(p, lamb=0.5, nu=-0.53, iterations=6)
    g = np.stack([-p.vertices[:, 2], p.vertices[:, 1], p.vertices[:, 0] - XSHIFT], axis=1) * S
    return g, np.asarray(p.faces)
va, fa = part(~fM, 60000)
vm, fm = part(fM, 16000)
y0 = va[:, 1].min(); va[:, 1] -= y0; vm[:, 1] -= y0
# Matcha : le modèle généré à partir de Matcha seul est bien plus détaillé ;
# on le recale à la place (même longueur, même centre) et on retire ses socles plats.
if len(sys.argv) > 2:
    s2 = trimesh.load(sys.argv[2]).to_geometry()
    W = np.asarray(s2.vertices); G = np.asarray(s2.faces)
    q = np.round(W * 2e4).astype(np.int64)
    u, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    W = W[idx]; G = inv.reshape(-1)[G]
    keep = (W[:, 1] > W[:, 1].min() + 0.045)[G].all(axis=1)
    mm = trimesh.Trimesh(W, G[keep], process=True)
    mm.update_faces(mm.nondegenerate_faces()); mm.remove_unreferenced_vertices()
    mm = max(mm.split(only_watertight=False), key=lambda c: len(c.faces))
    v, f = fs.simplify(mm.vertices.astype(np.float32), mm.faces.astype(np.int32), target_reduction=1 - 16000 / len(mm.faces))
    mm = trimesh.Trimesh(v, f, process=True)
    trimesh.smoothing.filter_taubin(mm, lamb=0.5, nu=-0.53, iterations=4)
    g = np.stack([-mm.vertices[:, 2], mm.vertices[:, 1], mm.vertices[:, 0]], axis=1)
    k = (vm[:, 2].max() - vm[:, 2].min()) / (g[:, 2].max() - g[:, 2].min())
    g = g * k
    g[:, 0] += vm[:, 0].mean() - g[:, 0].mean()
    g[:, 2] += (vm[:, 2].max() + vm[:, 2].min()) / 2 - (g[:, 2].max() + g[:, 2].min()) / 2
    g[:, 1] += 1.33 - g[:, 1].min()
    vm, fm = g, np.asarray(mm.faces)
np.savez(OUT / 'src_ainu.npz', v=va.astype(np.float32), f=fa.astype(np.int32))
np.savez(OUT / 'src_matcha.npz', v=vm.astype(np.float32), f=fm.astype(np.int32))
for n, v, f in (('ainu', va, fa), ('matcha', vm, fm)):
    print(n, len(v), 'sommets', len(f), 'triangles', 'min', v.min(0).round(3), 'max', v.max(0).round(3))
