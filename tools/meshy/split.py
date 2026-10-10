"""
Étape 2 : sépare Matcha (debout sur la selle) d'Ainu dans la forme dense.
Matcha = composante connexe de la tête de Matcha parmi les faces situées
au-dessus de la selle, dans un couloir étroit au-dessus du dos.
"""
import sys, numpy as np, trimesh
from pathlib import Path
d = Path(sys.argv[1])
D = np.load(d / 'dense.npz'); V, F = D['v'], D['f']
x, y, z = V.T
# arrière (corps et pattes arrière posées sur la selle) / avant (pattes avant
# enfoncées dans la collerette d'Ainu : coupées sous la fourrure)
cand = (np.abs(x) < 0.26) & (z > -0.45) & np.where(z < 0.12, y > 1.27, y > 1.5 + np.maximum(0, z - 0.12) * 0.5)
fc = cand[F].all(1)
sub = trimesh.Trimesh(V, F[fc], process=False)
lab = trimesh.graph.connected_component_labels(sub.face_adjacency, node_count=len(sub.faces))
top = np.argmax(y)  # sommet le plus haut : oreille de Matcha
fidx = np.where(fc)[0]
seed = np.where((F[fidx] == top).any(1))[0]
keep = lab == lab[seed[0]]
mF = np.zeros(len(F), bool); mF[fidx[keep]] = True
def part(mask):
    p = trimesh.Trimesh(V, F[mask], process=True); p.remove_unreferenced_vertices()
    p = max(p.split(only_watertight=False), key=lambda c: len(c.faces))
    trimesh.repair.fill_holes(p)
    return p
a, m = part(~mF), part(mF)
for n, p in (('ainu', a), ('matcha', m)):
    print(n, len(p.vertices), len(p.faces), p.bounds.round(3).tolist())
    np.savez(d / f'{n}_dense.npz', v=p.vertices.astype(np.float32), f=p.faces.astype(np.int32))
