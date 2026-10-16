"""Télécharge des matières et un ciel de Poly Haven (CC0) et les compresse pour le web.
Sortie : public/adventure/assets/ph/  (<nom>_d.jpg couleur, <nom>_n.jpg relief)
Usage : python3 tools/polyhaven/fetch.py
"""
import io, json, os, sys, urllib.request
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'adventure', 'assets', 'ph')
os.makedirs(OUT, exist_ok=True)
API = 'https://api.polyhaven.com/files/'

TEXTURES = {
    'leafy_grass': 'herbe', 'forest_ground_04': 'sol de forêt', 'stone_pathway': 'chemin',
    'mossy_stone_wall': 'ruines', 'bark_willow_02': 'écorce', 'red_brick': 'briques',
    'painted_plaster_wall': 'enduit', 'asphalt_02': 'asphalte', 'cobblestone_floor_04': 'pavés',
    'rectangular_paving': 'trottoir', 'clay_roof_tiles': 'tuiles', 'brown_planks_03': 'bois', 'mossy_rock': 'roche',
    # Station des Neiges (niveau 5 seulement) : neige, roche de montagne, bardeaux des chalets
    'snow_02': 'neige', 'rock_face_03': 'roche de montagne', 'roof_slates_02': 'bardeaux',
}
SIZE = 1024

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MatchaAinu-asset-fetch/1.0'})
    with urllib.request.urlopen(req) as r:
        return r.read()

def save(img, name, q=82):
    img.convert('RGB').save(os.path.join(OUT, name), 'JPEG', quality=q, optimize=True, progressive=True)

for key in TEXTURES:
    files = json.loads(get(API + key))
    for kind, suffix, q in (('Diffuse', '_d.jpg', 80), ('nor_gl', '_n.jpg', 88)):
        dst = os.path.join(OUT, key + suffix)
        if os.path.exists(dst): continue
        url = files[kind]['1k']['jpg']['url']
        img = Image.open(io.BytesIO(get(url))).resize((SIZE, SIZE), Image.LANCZOS)
        save(img, key + suffix, q)
        print('ok', key + suffix, os.path.getsize(dst) // 1024, 'Ko')
    # variantes demi-taille (_s) pour les téléphones
    for suffix, q in (('_d', 78), ('_n', 80)):
        src, dst = os.path.join(OUT, key + suffix + '.jpg'), os.path.join(OUT, key + suffix + '_s.jpg')
        if os.path.exists(dst) or not os.path.exists(src): continue
        save(Image.open(src).resize((SIZE // 2, SIZE // 2), Image.LANCZOS), key + suffix + '_s.jpg', q)
        print('ok', key + suffix + '_s.jpg', os.path.getsize(dst) // 1024, 'Ko')

# feuilles (couleur + transparence) d'un arbre scanné
dst = os.path.join(OUT, 'leaves.webp')
if not os.path.exists(dst):
    f = json.loads(get(API + 'island_tree_01'))
    diff = Image.open(io.BytesIO(get(f['leaves_diff']['1k']['png']['url']))).convert('RGB')
    alpha = Image.open(io.BytesIO(get(f['leaves_alpha']['1k']['png']['url']))).convert('L')
    rgba = diff.copy(); rgba.putalpha(alpha.resize(diff.size))
    rgba.save(dst, 'WEBP', quality=85)
    print('ok leaves.webp', os.path.getsize(dst) // 1024, 'Ko')

# ciel photographié (équirectangulaire, sans sol)
dst = os.path.join(OUT, 'sky.jpg')
if not os.path.exists(dst):
    f = json.loads(get(API + 'kloofendal_48d_partly_cloudy_puresky'))
    img = Image.open(io.BytesIO(get(f['tonemapped']['url'])))
    img = img.resize((2048, 1024), Image.LANCZOS)
    save(img, 'sky.jpg', 85)
    print('ok sky.jpg', os.path.getsize(dst) // 1024, 'Ko')
