# Génère la voix de chaque réplique de l'aventure (synthèse vocale Piper, voix
# françaises libres), puis donne à chaque personnage son timbre (hauteur,
# formants, débit) avec ffmpeg/rubberband.
#
#   python gen.py lignes.json ../../public/adventure/assets/voices
#
# Voix de base (rhasspy/piper-voices) :
#   fr_FR-siwis-medium  (SIWIS, CC BY 4.0)          — voix féminine
#   fr_FR-upmc-medium   (UPMC Pierre/Jessica, CC BY-SA 4.0) — 0 : Jessica, 1 : Pierre
# Chaque fichier : <empreinte>.mp3, empreinte = FNV-1a de « qui|texte » (voir voices.js).
import json, os, re, subprocess, sys, wave, tempfile
from concurrent.futures import ThreadPoolExecutor
from piper import PiperVoice, SynthesisConfig

VOICES = os.environ.get('PIPER_VOICES', 'voices')
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# personnage : voix de base, locuteur, débit (length_scale), hauteur (rapport), formants préservés ?, expressivité
CAST = {
    '':                    ('siwis', None, 1.06, 1.00, True, 0.667),   # le conteur
    'Mamie Labrador':      ('upmc', 0, 1.12, 0.90, True, 0.6),
    'Capitaine Moustache': ('upmc', 0, 0.95, 1.07, True, 0.8),
    'Matcha':              ('siwis', None, 0.88, 1.18, True, 0.75),
    'Ainu':                ('upmc', 1, 1.08, 0.88, True, 0.6),
    'Biscotte':            ('siwis', None, 0.92, 1.32, True, 0.75),
    'Filou':               ('upmc', 1, 0.86, 1.20, True, 0.8),
    'Commissaire Pataud':  ('upmc', 1, 1.02, 0.82, True, 0.6),
    'Madame Persane':      ('siwis', None, 1.10, 1.05, True, 0.7),
    'Bruno le boulanger':  ('upmc', 1, 0.96, 1.00, True, 0.7),
    'Rita la mécano':      ('upmc', 0, 0.90, 1.10, True, 0.75),
    'Madame la Maire':     ('siwis', None, 1.04, 0.93, True, 0.6),
    'Capitaine Barnabé':   ('upmc', 1, 1.10, 0.86, True, 0.7),
    'Zazou le forain':     ('upmc', 1, 0.88, 1.12, True, 0.8),
    'Monsieur Turbo':      ('upmc', 1, 0.86, 1.05, True, 0.75),
    'Vieux Loup':          ('upmc', 1, 1.16, 0.80, True, 0.7),
    'Professeur Lunette':  ('upmc', 1, 1.00, 1.16, True, 0.65),
    'Fernand le taxi':     ('upmc', 1, 0.92, 0.95, True, 0.7),
    'Mimi la vendeuse':    ('upmc', 0, 0.95, 1.14, True, 0.7),
}
FILES = {'siwis': 'fr_FR-siwis-medium', 'upmc': 'fr_FR-upmc-medium'}


def line_id(who, text):
    h = 0x811c9dc5
    for ch in (who or '') + '|' + text:
        # comme String.charCodeAt : unités UTF-16
        for unit in ([ord(ch)] if ord(ch) < 0x10000 else [0xD800 + ((ord(ch) - 0x10000) >> 10), 0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            h ^= unit
            h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'


def speakable(text):
    """Texte à prononcer : sans emoji ni guillemets, majuscules adoucies, abréviations développées."""
    t = text
    t = re.sub(r'[\U0001F000-\U0001FFFF☀-➿️]', '', t)
    t = t.replace('«', '').replace('»', '').replace('…', '... ')
    t = re.sub(r'\bM\. ', 'Monsieur ', t)
    t = re.sub(r'\bMme\b', 'Madame', t)
    t = re.sub(r'\bPr\b', 'Professeur', t)
    t = re.sub(r'(\d+),(\d+)', r'\1 virgule \2', t)
    # prononciation (le texte affiché ne change pas)
    t = re.sub(r'\bAinu\b', 'Aïnou', t)
    t = re.sub(r'\bpinscher\b', 'pinchère', t)
    t = re.sub(r'\beurasier\b', 'eurasié', t)
    # mots en capitales (touches : ESPACE, SAUT…) : en minuscules, sinon ils sont épelés
    t = re.sub(r'\b([A-ZÀ-Ý]{2,})\b', lambda m: m.group(1).lower(), t)
    t = re.sub(r'\(([A-Z])\)', r'(touche \1)', t)
    return re.sub(r'\s+', ' ', t).strip()


loaded = {}
def voice(base):
    if base not in loaded:
        loaded[base] = PiperVoice.load(os.path.join(VOICES, FILES[base] + '.onnx'))
    return loaded[base]


def render(item):
    who, text = item['who'], item['text']
    lid = line_id(who, text)
    out = os.path.join(OUT, lid + '.mp3')
    if os.path.exists(out) and not os.environ.get('FORCE'):
        return lid, duration(out)
    base, spk, length, pitch, keep, noise = CAST.get(who, CAST['Bruno le boulanger'])
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, 'raw.wav')
        with wave.open(raw, 'wb') as wf:
            voice(base).synthesize_wav(speakable(text), wf, syn_config=SynthesisConfig(speaker_id=spk, length_scale=length, noise_scale=noise, noise_w_scale=0.8))
        filt = []
        if abs(pitch - 1) > 0.01:
            filt.append(f'rubberband=pitch={pitch}:formant={"preserved" if keep else "shifted"}:pitchq=quality')
        filt += ['highpass=f=70', 'loudnorm=I=-17:TP=-2:LRA=9', 'afade=t=in:d=0.02', 'apad=pad_dur=0.08']
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', ','.join(filt), '-ar', '22050', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', out], check=True)
    return lid, duration(out)


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return round(float(r.stdout.strip() or 0), 2)


lines = json.load(open(SRC))
for b in FILES: voice(b)
with ThreadPoolExecutor(max_workers=4) as ex:
    res = list(ex.map(render, lines))
index = {lid: d for lid, d in res}
# fichiers d'anciennes répliques qui n'existent plus
for f in os.listdir(OUT):
    if f.endswith('.mp3') and f[:-4] not in index: os.remove(os.path.join(OUT, f))
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
print(len(index), 'répliques,', round(sum(index.values())), 's au total')
