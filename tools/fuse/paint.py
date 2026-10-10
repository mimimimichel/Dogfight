"""
Étape 2 : peint le maillage généré avec la palette des sculpteurs (couleurs de
sommets), calcule le décalque du visage (uv projetées de face + atténuation),
les poids de peau (os : corps, tête, queue, 4 pattes) et écrit
public/adventure/assets/duo.json (+ duo-lite.json).
Usage : python paint.py
"""
import json, base64, numpy as np, trimesh, fast_simplification as fs
from pathlib import Path
HERE = Path(__file__).parent
ASSETS = HERE.parent.parent / 'public' / 'adventure' / 'assets'

def lin(h):
    c = np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255]) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def mix(c, col, k): return c * (1 - k[:, None]) + lin(col)[None, :] * k[:, None]
def noise(P, f, seed=0.0):
    p = P * f + seed
    return 0.5 + 0.25 * np.sin(p[:, 0] * 1.7 + np.sin(p[:, 1] * 2.3)) + 0.25 * np.sin(p[:, 2] * 1.9 + np.cos(p[:, 0] * 1.3 + p[:, 1]))

def cavity(m):
    """Creux (> 0) / bosses (< 0) : écart au barycentre des voisins selon la normale."""
    V = m.vertices; N = m.vertex_normals
    nb = m.vertex_neighbors
    out = np.zeros(len(V))
    for i, ns in enumerate(nb):
        if ns: out[i] = np.dot(V[ns].mean(0) - V[i], N[i])
    e = np.mean(m.edges_unique_length)
    return out / e

def load(name, target):
    d = np.load(HERE / f'src_{name}.npz')
    v, f = d['v'], d['f']
    if target < len(f):
        v, f = fs.simplify(v, f, target_reduction=1 - target / len(f))
    return trimesh.Trimesh(v, f, process=True)

# ---------------------------------------------------------------------------
# AINU
# ---------------------------------------------------------------------------
def paint_ainu(m):
    P = m.vertices; N = m.vertex_normals; x, y, z = P.T
    head = (z > 0.82) & (y > 0.98)
    hv = np.where(head & (y > 1.15))[0]
    nose = P[hv[np.argmax(P[hv, 2])]]
    MX = nose[0]                                # milieu du visage
    hx = x - MX; ax = np.abs(hx)
    c = np.tile(lin(0xe5682a), (len(P), 1))
    c = mix(c, 0xc84a18, ss(0.2, 0.8, N[:, 1]) * ss(1.1, 1.4, y) * 0.5)             # dos plus rouge
    c = mix(c, 0xf07e34, ss(0.3, 0.9, N[:, 2]) * ss(0.7, 1.0, z) * ss(1.5, 1.2, y) * 0.35)
    # tête : masque crème (museau, joues sous les yeux, gorge)
    eyeY = nose[1] + 0.17
    yb = eyeY - 0.035 - np.maximum(0, ax - 0.16) * 0.9
    mask = head * ss(yb + 0.015, yb - 0.015, y) * ss(0.9, 0.98, z) * ss(0.34, 0.26, ax)
    c = mix(c, 0xfbe3c0, mask)
    c = mix(c, 0xf07e34, mask * ss(0.03, 0.0, ax) * ss(-0.5, 0.6, N[:, 1]) * ss(nose[1] - 0.01, nose[1] + 0.05, y) * ss(nose[2] - 0.03, nose[2] - 0.12, z) * 0.7)  # arête du nez
    throat = ss(0.95, 0.82, y) * 0 + ss(1.16, 1.02, y) * ss(0.8, 0.95, z) * ss(0.24, 0.16, ax)
    c = mix(c, 0xfbe3c0, np.clip(throat, 0, 1))
    # taches crème au-dessus des yeux
    for sx in (-1, 1):
        dd = np.hypot((hx - sx * 0.115) / 0.032, (y - (eyeY + 0.075)) / 0.02)
        c = mix(c, 0xfbe3c0, head * ss(1.0, 0.6, dd) * ss(0.1, 0.4, N[:, 2]))
    # oreilles : intérieur crème/rosé (faces avant), pointes foncées
    ear = head & (y > eyeY + 0.17)
    c = mix(c, 0xa83a10, ear * ss(eyeY + 0.27, eyeY + 0.35, y) * 0.7)
    inner = ear * ss(0.15, 0.55, N[:, 2]) * ss(eyeY + 0.19, eyeY + 0.24, y)
    c = mix(c, 0xf6d6b8, inner * 0.9)
    # truffe
    c = mix(c, 0x16100e, head * ss(0.075, 0.05, np.linalg.norm(P - nose, axis=1)) * ss(nose[2] - 0.09, nose[2] - 0.05, z))
    # gueule : intérieur sombre, langue sur la mâchoire
    mouthY = nose[1] - 0.12
    inside = head * ss(0.03, 0.015, np.abs(y - (mouthY + 0.02))) * ss(nose[2] - 0.32, nose[2] - 0.2, z) * ss(0.16, 0.1, ax)
    c = mix(c, 0x3a0e0a, inside)
    tongue = head * ss(0.025, 0.01, np.abs(y - (mouthY - 0.015))) * ss(0.2, 0.7, N[:, 1]) * ss(nose[2] - 0.22, nose[2] - 0.12, z) * ss(0.09, 0.05, ax)
    c = mix(c, 0xec6f84, tongue)
    # plastron et ventre crème
    bib = ss(0.5, 0.65, z) * ss(1.2, 1.0, y) * ss(0.45, 0.65, y) * ss(-0.1, 0.4, N[:, 2]) * ss(0.3, 0.18, ax) * (1 - head)
    c = mix(c, 0xfbe3c0, bib * 0.95)
    belly = ss(-0.2, -0.7, N[:, 1]) * ss(0.85, 0.6, y) * ss(-0.75, -0.5, z) * ss(0.7, 0.5, z)
    c = mix(c, 0xf6c896, belly * 0.8)
    # pattes : bas plus clair, pieds crème
    c = mix(c, 0xf5a95a, ss(0.55, 0.3, y) * 0.8)
    c = mix(c, 0xfbe3c0, ss(0.16, 0.06, y))
    # queue : intérieur de la boucle et bout crème
    tail = (z < -0.72) & (y > 0.95)
    c = mix(c, 0xfbe3c0, tail * (ss(0.0, 0.6, N[:, 2]) * 0.7 + ss(1.85, 1.98, y) * 0.8))
    # harnais : couverture turquoise bordée d'or, selle et sacoches en cuir
    back = (1 - head) * ss(1.12, 1.2, y) * ss(-0.5, -0.42, z) * ss(0.3, 0.22, z) * ss(0.1, 0.5, N[:, 1])
    c = mix(c, 0x1e8a86, back)
    rim = (1 - head) * ss(0.02, 0.0, np.abs(y - 1.15)) * ss(-0.5, -0.42, z) * ss(0.3, 0.22, z)
    c = mix(c, 0xe0b040, rim * 0.9)
    saddle = back * ss(0.2, 0.14, np.abs(x - MX + 0.03)) * ss(1.25, 1.3, y)
    c = mix(c, 0x7a4220, saddle)
    bag = (1 - head) * ss(0.3, 0.36, np.abs(x - MX)) * ss(0.85, 0.92, y) * ss(1.32, 1.24, y) * ss(-0.36, -0.28, z) * ss(0.42, 0.34, z)
    c = mix(c, 0x8a4e24, bag)
    # sangles du harnais (poitrail et sangle ventrale)
    strap = (1 - head) * (ss(0.03, 0.015, np.abs(z - 0.38)) + ss(0.03, 0.015, np.abs(z + 0.42))) * ss(0.7, 0.8, y) * ss(1.32, 1.22, y)
    c = mix(c, 0x5e3218, np.clip(strap, 0, 1) * 0)
    # collerette des joues dorée sur les bords, roux plus soutenu derrière
    ruff = head * ss(0.18, 0.3, ax) * ss(eyeY - 0.02, eyeY - 0.15, y)
    c = mix(c, 0xf5a95a, ruff * 0.55)
    # traits de fourrure peints dans le sens du poil (hors masque du visage)
    comb = np.stack([np.sign(hx) * 0.6, -np.ones_like(hx), -0.5 * np.ones_like(hx)], 1)
    q = P - comb * (np.sum(P * comb, 1, keepdims=True) * 0.8 / np.sum(comb * comb, 1, keepdims=True))
    st = noise(q, 38.0, 1.3) * 0.6 + noise(q, 81.0, 7.1) * 0.4
    face = mask * ss(0.22, 0.12, ax)
    c = c * (1 - 0.32 * ss(0.62, 0.78, st) * (1 - face))[:, None]
    c = c * (1 + 0.12 * ss(0.3, 0.15, st) * (1 - face))[:, None]
    # ombrage peint : faces tournées vers le bas et l'arrière plus foncées
    c = c * (0.78 + 0.22 * ss(-0.6, 0.4, N[:, 1]))[:, None]
    return np.clip(c, 0, 1), nose, MX, eyeY

# ---------------------------------------------------------------------------
# MATCHA
# ---------------------------------------------------------------------------
def paint_matcha(m):
    P = m.vertices; N = m.vertex_normals; x, y, z = P.T
    hv = np.where(y > 1.88)[0]
    nose = P[hv[np.argmax(P[hv, 2])]]
    MX = nose[0]; hx = x - MX; ax = np.abs(hx)
    head = (y > 1.9) & (z > 0.12)
    c = np.tile(lin(0x1e1c28), (len(P), 1))
    c = mix(c, 0x3a3a52, ss(0.3, 0.9, N[:, 1]) * 0.6)
    eyeY = nose[1] + 0.085
    # feu : museau, joues, points au-dessus des yeux, poitrail, bas des pattes
    muzzle = head * ss(nose[2] - 0.13, nose[2] - 0.1, z) * ss(nose[1] + 0.005, nose[1] - 0.015, y) * ss(nose[1] - 0.075, nose[1] - 0.06, y)
    cheek = head * ss(eyeY - 0.025, eyeY - 0.045, y) * ss(nose[1] + 0.0, nose[1] - 0.04, y + 0.03) * ss(0.11, 0.08, ax) * ss(0.05, 0.4, N[:, 2])
    c = mix(c, 0xc6662a, np.clip(muzzle + cheek, 0, 1))
    c = mix(c, 0x1e1c28, head * ss(0.02, 0.008, ax) * ss(-0.2, 0.5, N[:, 1]) * ss(eyeY - 0.06, eyeY - 0.03, y) * ss(nose[2] - 0.03, nose[2] - 0.07, z))  # arête noire
    for sx in (-1, 1):
        dd = np.hypot((hx - sx * 0.05) / 0.018, (y - (eyeY + 0.045)) / 0.012)
        c = mix(c, 0xe08a46, head * ss(1.0, 0.6, dd) * ss(0.1, 0.4, N[:, 2]))
    chest = sum(ss(1.0, 0.6, np.hypot((hx - sx * 0.03) / 0.02, (y - 1.79) / 0.025)) for sx in (-1, 1)) * ss(0.15, 0.22, z) * ss(0.2, 0.6, N[:, 2])
    c = mix(c, 0xc6662a, chest)
    c = mix(c, 0xc6662a, ss(1.5, 1.44, y))
    # oreilles : creux rose-feu
    ear = head * ss(eyeY + 0.07, eyeY + 0.1, y) * np.maximum(ss(0.06, 0.09, ax), ss(eyeY + 0.15, eyeY + 0.18, y))
    c = mix(c, 0xe89280, ear * ss(0.1, 0.4, N[:, 2]) * 0.95)
    # truffe
    c = mix(c, 0x0c0a0c, ss(0.04, 0.028, np.linalg.norm(P - nose, axis=1)))
    # collier rouge au cou, harnais orange clouté sur le poitrail et les épaules, sac à dos brun
    neckY = nose[1] - 0.09
    collar = ss(0.022, 0.01, np.abs(y - (neckY - (nose[2] - 0.25 - z) * 0.35))) * ss(nose[2] - 0.38, nose[2] - 0.3, z) * ss(nose[2] - 0.12, nose[2] - 0.18, z)
    harness = ss(0.03, 0.018, np.abs(z - 0.1 + (y - 1.8) * 0.4)) * ss(1.6, 1.64, y) * ss(1.9, 1.86, y)
    harness = np.maximum(harness, ss(0.025, 0.012, np.abs(y - 1.8 - (z - 0.15) * 0.3)) * ss(0.1, 0.16, z) * ss(0.3, 0.25, z))
    c = mix(c, 0x8a4a1e, harness)
    c = mix(c, 0xd02828, collar)
    bag = ss(1.81, 1.85, y) * ss(-0.16, -0.12, z) * ss(0.08, 0.04, z) * ss(-0.1, 0.3, N[:, 1])
    c = mix(c, 0x8a5428, bag)
    return c, nose, MX, eyeY

# ---------------------------------------------------------------------------
def skin_ainu(m, nose, MX):
    P = m.vertices; x, y, z = P.T
    bones = {  # nom : pivot
        'root': [MX, 0.0, 0.0], 'head': [MX, 1.32, 0.8], 'tail': [MX, 1.2, -0.72],
        'legFL': [MX - 0.18, 0.72, 0.5], 'legFR': [MX + 0.18, 0.72, 0.5], 'legBL': [MX - 0.2, 0.75, -0.55], 'legBR': [MX + 0.2, 0.75, -0.55],
    }
    names = list(bones)
    W = np.zeros((len(P), len(names)))
    wh = ss(0.74, 0.92, z) * ss(0.95, 1.12, y)
    wt = ss(-0.62, -0.8, z) * ss(1.0, 1.2, y)
    wl = ss(0.72, 0.52, y) * np.maximum(ss(0.2, 0.32, z), ss(-0.3, -0.42, z))
    front = z > -0.05
    side = x > MX
    W[:, names.index('head')] = wh
    W[:, names.index('tail')] = wt * (1 - wh)
    for n, f, s in (('legFL', 1, 0), ('legFR', 1, 1), ('legBL', 0, 0), ('legBR', 0, 1)):
        W[:, names.index(n)] = wl * (front == f) * (side == s) * (1 - wh) * (1 - wt)
    W[:, 0] = np.clip(1 - W[:, 1:].sum(1), 0, 1)
    return names, bones, W

def skin_matcha(m, nose, MX):
    P = m.vertices; x, y, z = P.T
    bones = {'root': [MX, 1.4, 0.0], 'head': [MX, nose[1] - 0.06, nose[2] - 0.27]}
    W = np.zeros((len(P), 2)); W[:, 1] = ss(nose[1] - 0.09, nose[1] - 0.03, y) * ss(nose[2] - 0.36, nose[2] - 0.28, z); W[:, 0] = 1 - W[:, 1]
    return list(bones), bones, W

def pack(m, col, names, bones, W, decal):
    P = m.vertices.astype(np.float32); N = m.vertex_normals; n = len(P)
    lo, hi = P.min(0), P.max(0)
    Pq = np.round((P - lo) / (hi - lo) * 65535).astype(np.uint16)
    Nq = np.round(N * 127).astype(np.int8)
    Cq = np.round(np.clip(col, 0, 1) * 255).astype(np.uint8)
    # 2 os max par sommet
    order = np.argsort(-W, axis=1)[:, :2]
    w2 = np.take_along_axis(W, order, 1); w2 /= np.maximum(w2.sum(1, keepdims=True), 1e-6)
    Sk = order.astype(np.uint8); Sw = np.round(w2 * 255).astype(np.uint8)
    F = m.faces.astype(np.uint16 if n < 65536 else np.uint32)
    x0, x1, y0, y1, fade = decal
    U = np.stack([np.clip((P[:, 0] - x0) / (x1 - x0), 0, 1), np.clip((P[:, 1] - y0) / (y1 - y0), 0, 1)], 1)
    Uq = np.round(U * 65535).astype(np.uint16)
    Fd = np.round(np.clip(fade(P, N), 0, 1) * 255).astype(np.uint8)
    b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    return {'n': n, 'min': lo.tolist(), 'max': hi.tolist(), 'pos': b(Pq), 'nrm': b(Nq), 'col': b(Cq), 'idx': b(F), 'big': n >= 65536,
            'skinIndex': b(Sk), 'skinWeight': b(Sw), 'bones': [{'name': k, 'pivot': [float(v) for v in bones[k]]} for k in names],
            'uv': b(Uq), 'fade': b(Fd), 'decal': {'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1}}

def build(lite):
    out = {'version': 1, 'parts': {}}
    a = load('ainu', 9000 if lite else 26000)
    ca, nose, MX, eyeY = paint_ainu(a)
    cav = cavity(a)
    ca = ca * (1 - 0.6 * ss(0.1, 0.5, cav))[:, None]          # encre dans les creux de la fourrure
    names, bones, W = skin_ainu(a, nose, MX)
    dec = (MX - 0.32, MX + 0.32, nose[1] - 0.26, nose[1] + 0.38,
           lambda P, N: ss(0.15, 0.5, N[:, 2]) * ss(nose[2] - 0.4, nose[2] - 0.3, P[:, 2]))
    out['parts']['ainu'] = pack(a, ca, names, bones, W, dec)
    out['parts']['ainu']['face'] = {'nose': [float(v) for v in nose], 'mid': float(MX), 'eyeY': float(eyeY)}
    mt = load('matcha', 3500 if lite else 9000)
    cm, nose, MX, eyeY = paint_matcha(mt)
    cav = cavity(mt)
    cm = cm * (1 - 0.35 * ss(0.15, 0.6, cav))[:, None]
    names, bones, W = skin_matcha(mt, nose, MX)
    dec = (MX - 0.13, MX + 0.13, nose[1] - 0.08, nose[1] + 0.18,
           lambda P, N: ss(0.15, 0.5, N[:, 2]) * ss(nose[2] - 0.25, nose[2] - 0.17, P[:, 2]))
    out['parts']['matcha'] = pack(mt, cm, names, bones, W, dec)
    out['parts']['matcha']['face'] = {'nose': [float(v) for v in nose], 'mid': float(MX), 'eyeY': float(eyeY)}
    f = ASSETS / ('duo-lite.json' if lite else 'duo.json')
    f.write_text(json.dumps(out))
    print(f.name, f.stat().st_size // 1024, 'Ko', 'ainu', len(a.faces), 'matcha', len(mt.faces), 'nez', out['parts']['ainu']['face'], out['parts']['matcha']['face'])

build(False); build(True)
