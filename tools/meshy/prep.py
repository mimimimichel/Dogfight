"""
Étape 1 : nettoie le maillage reconstruit (Hunyuan3D-2mv d'après les vues du
modèle Meshy « Adventure Companions »), le met dans le repère du jeu
(+z avant, +y haut, sol y = 0) et l'enregistre (forme dense + version décimée).
Usage : python prep.py <shape.glb> <out_dir>
"""
import sys, numpy as np, trimesh, fast_simplification as fs
from pathlib import Path
src, out = sys.argv[1], Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
S = 1.3
m = trimesh.load(src).to_geometry()
V = np.asarray(m.vertices); F = np.asarray(m.faces)
q = np.round(V * 2e4).astype(np.int64)
u, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
V = V[idx]; F = inv.reshape(-1)[F]
m = trimesh.Trimesh(V, F, process=True)
m.update_faces(m.nondegenerate_faces()); m.remove_unreferenced_vertices()
m = max(m.split(only_watertight=False), key=lambda c: len(c.faces))
m.vertices *= S
m.vertices[:, 1] -= m.vertices[:, 1].min()
m.vertices[:, 0] -= (m.vertices[:, 0].max() + m.vertices[:, 0].min()) / 2
print('dense', m.vertices.shape, m.faces.shape, m.bounds.round(3).tolist())
np.savez(out / 'dense.npz', v=m.vertices.astype(np.float32), f=m.faces.astype(np.int32))
