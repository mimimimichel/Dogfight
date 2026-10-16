"""Atlas de feuillage des feuillus (arbres, buissons, cerisiers) d'après de vraies feuilles scannées.

Sources (Poly Haven, CC0) :
  - island_tree_01 : planche de feuilles (couleur + transparence) -> feuilles ovales
  - shrub_01       : feuilles dentées (couleur + transparence)
Les feuilles sont découpées une à une puis disposées le long de rameaux dessinés : des « bouquets »
(cartes de feuillage) que foliage.js pose par dizaines autour de chaque couronne.

Sortie : public/adventure/assets/ph/broadleaf.webp (1024 px) et broadleaf_s.webp (512 px, téléphones)
Disposition (en pixels de l'image 1024, origine en haut à gauche) :
  [0,0]-[512,512]      A : rameau feuillu (feuilles ovales)            tige en bas au milieu
  [512,0]-[1024,512]   B : rameau feuillu (feuilles dentées, plus clair) tige en bas au milieu
  [0,512]-[512,1024]   C : rameau de cerisier en fleurs                 tige en bas au milieu
  [512,512]-[768,768]  D1 : feuillage dense opaque (cœur des couronnes)
  [768,512]-[1024,768] D2 : fleurs denses opaques (cœur des cerisiers)
  [512,768]-[768,1024] D3 : touffe ronde de petites feuilles (buissons)
  [768,768]-[1024,1024] D4 : touffe ronde de feuilles dentées (buissons)
Usage : python3 tools/polyhaven/broadleaf.py [dossier_cache]
"""
import io, json, math, os, random, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'adventure', 'assets', 'ph')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '.cache')
os.makedirs(CACHE, exist_ok=True)
API = 'https://api.polyhaven.com/files/'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MatchaAinu-asset-fetch/1.0'})
    with urllib.request.urlopen(req) as r:
        return r.read()


def fetch(asset, key):
    dst = os.path.join(CACHE, f'{asset}__{key}.png')
    if not os.path.exists(dst):
        f = json.loads(get(API + asset))
        open(dst, 'wb').write(get(f[key]['1k']['png']['url']))
    return Image.open(dst)


def components(mask, min_pts):
    """Composantes connexes (4-voisins) d'un masque booléen : [(pts, x0, y0, x1, y1, masque_local)]."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    out, n = [], 0
    for y in range(H):
        row = mask[y]
        for x in np.nonzero(row & (lab[y] == 0))[0]:
            if lab[y, x]:
                continue
            n += 1
            st = [(y, x)]; lab[y, x] = n; pts = 0; x0 = x1 = x; y0 = y1 = y
            while st:
                cy, cx = st.pop(); pts += 1
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for yy, xx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n; st.append((yy, xx))
            if pts >= min_pts:
                out.append((pts, x0, y0, x1 + 1, y1 + 1, lab[y0:y1 + 1, x0:x1 + 1] == n))
    return out


def sprites(diff, alpha, green_only):
    """Découpe les feuilles d'une planche : liste d'images RGBA, pointe en haut, tige en bas."""
    rgb = diff.convert('RGB'); al = alpha.convert('L').resize(rgb.size)
    A = np.array(al) > 128
    if green_only:   # planche avec des débris : on ne garde que le vert, et on ouvre un peu le masque
        c = np.array(rgb).astype(int)
        A &= (c[:, :, 1] > c[:, :, 0] + 4) & (c[:, :, 1] > c[:, :, 2] + 25)
        m = Image.fromarray((A * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        A = np.array(m) > 128
    out = []
    for pts, x0, y0, x1, y1, m in components(A, 15000):
        fill = pts / ((x1 - x0) * (y1 - y0))
        if fill < 0.45 or (y1 - y0) < 150:
            continue
        crop = rgb.crop((x0, y0, x1, y1)).convert('RGBA')
        a = np.array(al.crop((x0, y0, x1, y1))).astype(np.float32)
        mm = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
        a = a * (np.array(mm) / 255.0)
        lum = np.array(crop.convert('L')).astype(np.float32)
        a = a * np.clip((lum - 28) / 20, 0, 1)          # (débris sombres collés aux pointes)
        crop.putalpha(Image.fromarray(a.astype(np.uint8)))
        out.append(crop)
    return out


rnd = random.Random(7)


def leaf_on(canvas, sp, x, y, ang, length, bright=1.0, tint=(1, 1, 1), widen=1.0):
    """Pose une feuille : sa tige en (x, y), orientée selon ang (radians, 0 = vers le haut, + = vers la droite)."""
    w, h = sp.size
    L = max(4, int(length)); Wd = max(2, int(w / h * L * widen))
    im = sp.resize((Wd, L), Image.LANCZOS)
    arr = np.array(im).astype(np.float32)
    arr[:, :, 0] *= bright * tint[0]; arr[:, :, 1] *= bright * tint[1]; arr[:, :, 2] *= bright * tint[2]
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    sq = Image.new('RGBA', (2 * L, 2 * L), (0, 0, 0, 0))
    sq.paste(im, (L - Wd // 2, 0))
    sq = sq.rotate(-math.degrees(ang), resample=Image.BICUBIC)
    canvas.alpha_composite(sq, (int(x - L), int(y - L)))


def twig_path(x0, y0, ang, length, bend, n=10):
    pts = [(x0, y0)]
    x, y, a = x0, y0, ang
    for i in range(n):
        a += bend / n
        x += math.sin(a) * length / n; y -= math.cos(a) * length / n
        pts.append((x, y))
    return pts


def draw_twig(d, pts, w0, w1, col):
    for i in range(len(pts) - 1):
        w = w0 + (w1 - w0) * i / (len(pts) - 1)
        d.line([pts[i], pts[i + 1]], fill=col, width=max(1, int(w)))
        d.ellipse([pts[i + 1][0] - w / 2, pts[i + 1][1] - w / 2, pts[i + 1][0] + w / 2, pts[i + 1][1] + w / 2], fill=col)


def blossom(canvas, x, y, r, rr):
    """Fleur de cerisier : 5 pétales blanc rosé (rose plus soutenu vers le cœur), étamines jaunes."""
    S = int(r * 2.6) * 2
    im = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))   # x2 : bords lisses
    d = ImageDraw.Draw(im)
    c = S
    base = rr.uniform(0, 72)
    v = rr.uniform(0.9, 1.0)
    outer = (int(255 * v), int(rr.randint(214, 232) * v), int(rr.randint(226, 240) * v))
    inner = (int(244 * v), int(rr.randint(150, 175) * v), int(rr.randint(182, 200) * v))
    for k in range(5):
        a = math.radians(base + k * 72 + rr.uniform(-10, 10))
        for sc, col, off in ((1.0, outer, 0.55), (0.5, inner, 0.3)):
            L = r * 2 * sc; Wd = r * 1.5 * sc
            px, py = c + math.cos(a) * r * 2 * off, c + math.sin(a) * r * 2 * off
            pet = Image.new('RGBA', (int(L * 1.1) + 2, int(Wd) + 2), (0, 0, 0, 0))
            ImageDraw.Draw(pet).ellipse([0, 0, L * 1.05, Wd], fill=col + (255,))
            pet = pet.rotate(-math.degrees(a), expand=True, resample=Image.BICUBIC)
            im.alpha_composite(pet, (int(px - pet.size[0] / 2), int(py - pet.size[1] / 2)))
    d.ellipse([c - r * 0.32, c - r * 0.32, c + r * 0.32, c + r * 0.32], fill=(176, 70, 96, 255))
    for k in range(10):
        a = rr.uniform(0, 6.28); q = r * rr.uniform(0.3, 0.7)
        d.ellipse([c + math.cos(a) * q - 2, c + math.sin(a) * q - 2, c + math.cos(a) * q + 2, c + math.sin(a) * q + 2], fill=(240, 200, 80, 255))
    im = im.resize((S, S), Image.LANCZOS)
    canvas.alpha_composite(im, (int(x - S / 2), int(y - S / 2)))


def spray(S, leaves, twig_col, leaf_len, bright=(0.72, 1.12), widen=1.0, tints=None, flowers=False, rr=None):
    """Rameau feuillu dans une case S x S : tige en bas au milieu, bouquet arrondi qui remplit la case."""
    rr = rr or rnd
    cv = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    cx, cy, R = S * 0.5, S * 0.5, S * 0.46
    main = twig_path(S * 0.5, S * 0.99, rr.uniform(-0.1, 0.1), S * 0.8, rr.uniform(-0.25, 0.25), 16)
    twigs = [(main, S * 0.02, S * 0.005)]
    def grow(pts, depth, count, t0):
        for k in range(count):
            t = t0 + (1 - t0) * (k + 0.5) / count + rr.uniform(-0.04, 0.04)
            i = min(len(pts) - 2, max(1, int(t * (len(pts) - 1)))); x, y = pts[i]
            side = -1 if (k + depth) % 2 else 1
            base = math.atan2(pts[i + 1][0] - x, -(pts[i + 1][1] - y))
            ang = base + side * rr.uniform(0.7, 1.25)
            # longueur : jusqu'au bord du bouquet (ellipse), un peu moins
            L = 0
            for step in range(1, 60):
                q = step * S * 0.01
                if math.hypot((x + math.sin(ang) * q - cx) / R, (y - math.cos(ang) * q - cy) / R) > 0.9:
                    break
                L = q
            L *= rr.uniform(0.7, 0.95) * (0.75 if depth else 1)
            if L < S * 0.06:
                continue
            tw = twig_path(x, y, ang, L, -side * rr.uniform(0.2, 0.5), 8)
            twigs.append((tw, S * (0.011 if not depth else 0.006), S * 0.003))
            if depth == 0:
                grow(tw, 1, 2, 0.3)
    grow(main, 0, 9, 0.12)
    for pts, w0, w1 in twigs:
        draw_twig(d, pts, w0, w1, twig_col)
    items = []
    for pts, w0, w1 in twigs:
        n = len(pts)
        for i in range(1, n):
            x, y = pts[i]
            a = math.atan2(pts[i][0] - pts[i - 1][0], -(pts[i][1] - pts[i - 1][1]))
            for side in (-1, 1):
                if rr.random() < 0.15:
                    continue
                L = leaf_len * rr.uniform(0.75, 1.2)
                items.append((x, y, a + side * rr.uniform(0.4, 1.1), L))
        x, y = pts[-1]
        a = math.atan2(pts[-1][0] - pts[-2][0], -(pts[-1][1] - pts[-2][1]))
        items.append((x, y, a + rr.uniform(-0.2, 0.2), leaf_len * 1.1))
    rr.shuffle(items)
    for x, y, a, L in items:
        tx, ty = x + math.sin(a) * L, y - math.cos(a) * L
        if math.hypot((tx - cx) / R, (ty - cy) / R) > 1.0 or tx < 6 or tx > S - 6 or ty < 6:
            L *= 0.6
            tx, ty = x + math.sin(a) * L, y - math.cos(a) * L
            if math.hypot((tx - cx) / R, (ty - cy) / R) > 1.04 or tx < 6 or tx > S - 6 or ty < 6:
                continue
        if flowers and rr.random() < 0.8:
            continue
        sp = leaves[rr.randrange(len(leaves))]
        tint = tints[rr.randrange(len(tints))] if tints else (1, 1, 1)
        # les feuilles du bord du bouquet sont plus claires (elles prennent la lumière)
        edge = math.hypot((tx - cx) / R, (ty - cy) / R)
        leaf_on(cv, sp, x, y, a, L, rr.uniform(*bright) * (0.85 + 0.2 * edge), tint, widen)
    if flowers:
        spots = []
        for pts, w0, w1 in twigs:
            for i in range(2, len(pts)):
                if rr.random() < 0.3:
                    continue
                x, y = pts[i]
                for k in range(rr.randint(2, 4)):
                    fx, fy = x + rr.uniform(-1, 1) * S * 0.045, y + rr.uniform(-1, 1) * S * 0.045
                    if math.hypot((fx - cx) / R, (fy - cy) / R) < 0.95:
                        spots.append((fx, fy))
        rr.shuffle(spots)
        for fx, fy in spots:
            blossom(cv, fx, fy, S * rr.uniform(0.018, 0.026), rr)
    return cv


def mat(S, leaves, bg, n, leaf_len, bright, tints=None, flowers=False, rr=None):
    """Feuillage dense et opaque (cœur des couronnes)."""
    rr = rr or rnd
    cv = Image.new('RGBA', (S, S), bg + (255,))
    for k in range(n):
        x, y = rr.uniform(-0.1, 1.1) * S, rr.uniform(-0.1, 1.1) * S
        sp = leaves[rr.randrange(len(leaves))]
        tint = tints[rr.randrange(len(tints))] if tints else (1, 1, 1)
        leaf_on(cv, sp, x, y, rr.uniform(0, 6.28), leaf_len * rr.uniform(0.8, 1.2), rr.uniform(*bright), tint)
        if flowers and k % 2 == 0:
            for j in range(3):
                blossom(cv, rr.uniform(0, S), rr.uniform(0, S), S * rr.uniform(0.04, 0.06), rr)
    if flowers:
        for j in range(60):
            blossom(cv, rr.uniform(0, S), rr.uniform(0, S), S * rr.uniform(0.04, 0.06), rr)
    a = np.array(cv); a[:, :, 3] = 255
    return Image.fromarray(a)


def clump(S, leaves, n, leaf_len, bright, tints=None, rr=None):
    """Touffe ronde et dense (buissons) : au bord, les feuilles pointent vers l'extérieur."""
    rr = rr or rnd
    cv = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    R = S * 0.44
    items = []
    for k in range(n):
        a = rr.uniform(0, 6.28); dd = math.sqrt(rr.random())
        items.append((dd, a))
    items.sort(key=lambda p: p[0])
    for dd, a in items:
        L = leaf_len * rr.uniform(0.8, 1.15)
        rad = max(0.0, dd * R - L * 0.8)
        x, y = S / 2 + math.sin(a) * rad, S / 2 - math.cos(a) * rad
        la = a + rr.uniform(-0.5, 0.5) if dd > 0.4 else rr.uniform(0, 6.28)
        sp = leaves[rr.randrange(len(leaves))]
        tint = tints[rr.randrange(len(tints))] if tints else (1, 1, 1)
        leaf_on(cv, sp, x, y, la, L, rr.uniform(*bright) * (0.75 + 0.35 * dd), tint)
    return cv


def bleed(img, iters=24):
    """Remplit la couleur des pixels transparents avec celle des feuilles voisines (pas de halo au loin)."""
    a = np.array(img).astype(np.float32)
    rgb, al = a[:, :, :3], a[:, :, 3:] / 255.0
    known = (al > 0.5).astype(np.float32)
    acc = rgb * known
    for i in range(iters):
        blur = Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))
        kb = Image.fromarray((known[:, :, 0] * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))
        kb = np.array(kb).astype(np.float32)[:, :, None] / 255.0
        nb = np.array(blur).astype(np.float32)
        fill = (known == 0) & (kb > 0.01)
        rgbn = np.where(kb > 0.01, nb / np.maximum(kb, 1e-3), 0)
        acc = np.where(fill, rgbn, acc)
        known = np.maximum(known, fill.astype(np.float32))
    mean = rgb[al[:, :, 0] > 0.5].mean(0) if (al > 0.5).any() else np.array([60, 80, 40])
    acc = np.where(known > 0, acc, mean)
    out = np.concatenate([np.clip(acc, 0, 255), a[:, :, 3:]], axis=2).astype(np.uint8)
    return Image.fromarray(out)


def main():
    isl = sprites(fetch('island_tree_01', 'leaves_diff'), fetch('island_tree_01', 'leaves_alpha'), False)
    ser = sprites(fetch('shrub_01', 'Diffuse'), fetch('shrub_01', 'Alpha'), True)
    print('feuilles :', len(isl), 'ovales,', len(ser), 'dentées')
    S = 1024                          # on compose en 2048, puis on réduit (bords nets)
    A2 = Image.new('RGBA', (2 * S, 2 * S), (0, 0, 0, 0))
    greens = [(0.92, 1.0, 0.8), (1.0, 1.0, 1.0), (0.85, 1.0, 0.95), (0.95, 1.02, 0.8), (0.8, 0.95, 0.85)]
    A2.paste(spray(S, isl, (92, 70, 46, 255), S * 0.1, widen=1.5, tints=greens, rr=random.Random(11)), (0, 0))
    A2.paste(spray(S, ser, (98, 84, 52, 255), S * 0.1, bright=(0.8, 1.1), widen=0.95, tints=[(1, 1, 1), (0.9, 1, 0.9), (1.05, 1.0, 0.85)], rr=random.Random(12)), (S, 0))
    young = [(1.15, 1.0, 0.75), (1.1, 0.95, 0.8)]
    A2.paste(spray(S, ser, (78, 46, 40, 255), S * 0.075, bright=(0.85, 1.1), tints=young, flowers=True, rr=random.Random(13)), (0, S))
    H = S // 2
    A2.paste(mat(H, isl, (34, 52, 22), 260, H * 0.22, (0.42, 0.75), tints=greens, rr=random.Random(14)), (S, S))
    A2.paste(mat(H, ser, (120, 70, 86), 60, H * 0.2, (0.5, 0.7), tints=young, flowers=True, rr=random.Random(15)), (S + H, S))
    A2.paste(clump(H, isl, 420, H * 0.12, (0.75, 1.15), tints=greens, rr=random.Random(16)), (S, S + H))
    A2.paste(clump(H, ser, 160, H * 0.13, (0.7, 1.05), rr=random.Random(17)), (S + H, S + H))
    A2 = bleed(A2)
    big = A2.resize((1024, 1024), Image.LANCZOS)
    small = A2.resize((512, 512), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    big.save(os.path.join(OUT, 'broadleaf.webp'), 'WEBP', quality=82, method=6)
    small.save(os.path.join(OUT, 'broadleaf_s.webp'), 'WEBP', quality=84, method=6)
    for n in ('broadleaf.webp', 'broadleaf_s.webp'):
        print('ok', n, os.path.getsize(os.path.join(OUT, n)) // 1024, 'Ko')
    if os.environ.get('PREVIEW'):
        bg = Image.new('RGBA', big.size, (190, 200, 230, 255)); bg.alpha_composite(big)
        bg.convert('RGB').save(os.environ['PREVIEW'], quality=88)


main()
