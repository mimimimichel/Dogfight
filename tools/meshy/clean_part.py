"""Retire les débris d'une partie cuite (petits morceaux détachés, triangles sous les pattes).
Les coutures UV dupliquent les sommets : les morceaux sont calculés sur les positions."""
import sys, numpy as np, trimesh
f, ymin = sys.argv[1], float(sys.argv[2])
d = dict(np.load(f)); V, F = d['v'], d['f']
key = np.unique(np.round(V.astype(np.float64) * 1e5).astype(np.int64), axis=0, return_inverse=True)[1].reshape(-1)
Fk = key[F]
m = trimesh.Trimesh(np.zeros((key.max() + 1, 3)), Fk, process=False)
lab = trimesh.graph.connected_component_labels(m.face_adjacency, node_count=len(Fk))
big = np.bincount(lab).argmax()
keep = (lab == big) & (V[F][:, :, 1].min(1) >= ymin)
if keep.sum() < 0.9 * len(F): sys.exit(f'refus : on retirerait {int((~keep).sum())} triangles sur {len(F)}')
d['f'] = F[keep]
np.savez(f, **d)
print('triangles retirés', int((~keep).sum()), 'sur', len(F))
