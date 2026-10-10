"""
Étape 5 : exporte Ainu et Matcha texturés pour le jeu, avec un petit squelette
(Ainu : corps, tête, queue, 4 pattes ; Matcha : corps, tête).
Sortie : public/adventure/assets/duo3d[-lite].json + textures .jpg
Usage : python export.py <dossier bake> <suffixe ('' ou '-lite')>
"""
import sys, json, base64, shutil, numpy as np
from pathlib import Path
bake, suf = Path(sys.argv[1]), sys.argv[2]
ASSETS = Path(__file__).resolve().parents[2] / 'public' / 'adventure' / 'assets'

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def skin_ainu(P):
    x, y, z = P.T
    bones = {'root': [0, 0, 0], 'head': [0, 1.15, 0.66], 'tail': [0, 1.12, -0.76],
             'legFL': [-0.2, 0.72, 0.38], 'legFR': [0.2, 0.72, 0.38], 'legBL': [-0.2, 0.75, -0.62], 'legBR': [0.2, 0.75, -0.62]}
    names = list(bones); W = np.zeros((len(P), len(names)))
    wh = ss(0.62, 0.84, z) * ss(0.88, 1.05, y)
    wt = ss(-0.74, -0.88, z) * ss(0.92, 1.08, y)
    wl = ss(0.78, 0.5, y) * (1 - wh) * (1 - wt)
    W[:, names.index('head')] = wh
    W[:, names.index('tail')] = wt
    for n, front, right in (('legFL', 1, 0), ('legFR', 1, 1), ('legBL', 0, 0), ('legBR', 0, 1)):
        W[:, names.index(n)] = wl * ((z > -0.05) == front) * ((x > 0) == right)
    W[:, 0] = np.clip(1 - W[:, 1:].sum(1), 0, 1)
    return names, bones, W

def skin_matcha(P):
    # Matcha (forme détaillée) : corps, tête, queue, 4 pattes — il marche tout seul à deux
    x, y, z = P.T
    bones = {'root': [0, 1.7, 0.0], 'head': [0, 1.8, 0.16], 'tail': [0, 1.72, -0.33],
             'legFL': [-0.115, 1.56, 0.19], 'legFR': [0.115, 1.56, 0.19], 'legBL': [-0.1, 1.56, -0.32], 'legBR': [0.1, 1.56, -0.32]}
    names = list(bones); W = np.zeros((len(P), len(names)))
    wh = ss(1.70, 1.80, y) * ss(0.0, 0.12, z)
    wt = ss(-0.33, -0.39, z) * ss(1.66, 1.74, y)
    wl = ss(1.53, 1.42, y) * (1 - wh) * (1 - wt)
    W[:, names.index('head')] = wh
    W[:, names.index('tail')] = wt
    for n, front, right in (('legFL', 1, 0), ('legFR', 1, 1), ('legBL', 0, 0), ('legBR', 0, 1)):
        W[:, names.index(n)] = wl * ((z > -0.07) == front) * ((x > 0) == right)
    W[:, 0] = np.clip(1 - W[:, 1:].sum(1), 0, 1)
    return names, bones, W

def pack(part, skin):
    d = np.load(bake / f'{part}.npz')
    P, N, UV, F = d['v'], d['n'], d['uv'], d['f']
    names, bones, W = skin(P)
    order = np.argsort(-W, axis=1)[:, :2]
    w2 = np.take_along_axis(W, order, 1); w2 /= np.maximum(w2.sum(1, keepdims=True), 1e-6)
    lo, hi = P.min(0), P.max(0); n = len(P)
    b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    tex = f'{part}{suf}.jpg'
    shutil.copy(bake / f'{part}.jpg', ASSETS / tex)
    return {'n': n, 'min': lo.tolist(), 'max': hi.tolist(),
            'pos': b(np.round((P - lo) / (hi - lo) * 65535).astype(np.uint16)),
            'nrm': b(np.round(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9) * 127).astype(np.int8)),
            'uv': b(np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16)),
            'idx': b(F.astype(np.uint16 if n < 65536 else np.uint32)), 'big': n >= 65536,
            'skinIndex': b(order.astype(np.uint8)), 'skinWeight': b(np.round(w2 * 255).astype(np.uint8)),
            'bones': [{'name': k, 'pivot': [float(v) for v in bones[k]]} for k in names], 'tex': tex}

out = {'version': 3, 'parts': {'ainu': pack('ainu', skin_ainu), 'matcha': pack('matcha', skin_matcha)}}
f = ASSETS / f'duo3d{suf}.json'
f.write_text(json.dumps(out))
print(f.name, f.stat().st_size // 1024, 'Ko')
