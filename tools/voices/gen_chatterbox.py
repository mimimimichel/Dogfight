# Voix naturelles : Chatterbox multilingue (Resemble AI, licence MIT), qui imite
# la voix d'un court extrait de référence. Références : lecteurs du corpus
# Multilingual LibriSpeech français (CC BY 4.0), choisis d'après leur hauteur,
# leur expressivité et la propreté de l'enregistrement ; pour Matcha et
# Biscotte, l'extrait est rendu plus aigu (voix d'enfant) avant d'être imité.
# Chaque réplique est vérifiée par transcription (Whisper) et refaite si elle
# est ratée.
#
#   python gen_chatterbox.py lignes.json refs/ ../../public/adventure/assets/voices
import json, os, re, subprocess, sys, tempfile, unicodedata
import numpy as np
import torch, torchaudio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voicetext import line_id, speakable   # mêmes empreintes et même texte prononcé que gen.py

SHARD, NSHARD = int(os.environ.get('SHARD', 0)), int(os.environ.get('NSHARD', 1))   # plusieurs processus en parallèle
torch.set_num_threads(int(os.environ.get('THREADS', 4)))
SRC, REFS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

# personnage : (référence, exagération des émotions, cfg) — cfg plus bas = débit plus posé
CAST = {
    '': ('conteur', 0.5, 0.5),
    'Mamie Labrador': ('mamie', 0.55, 0.45),
    'Capitaine Moustache': ('capitaine', 0.75, 0.5),
    'Matcha': ('matcha', 0.7, 0.5),
    'Ainu': ('ainu', 0.5, 0.45),
    'Biscotte': ('biscotte', 0.75, 0.5),
    'Filou': ('filou', 0.7, 0.5),
    'Commissaire Pataud': ('pataud', 0.5, 0.5),
    'Madame Persane': ('persane', 0.6, 0.5),
    'Bruno le boulanger': ('bruno', 0.55, 0.5),
    'Rita la mécano': ('rita', 0.6, 0.5),
    'Madame la Maire': ('maire', 0.5, 0.5),
    'Capitaine Barnabé': ('barnabe', 0.6, 0.5),
    'Zazou le forain': ('zazou', 0.7, 0.5),
    'Monsieur Turbo': ('turbo', 0.6, 0.5),
    'Vieux Loup': ('loup', 0.6, 0.45),
    'Professeur Lunette': ('lunette', 0.55, 0.5),
    'Fernand le taxi': ('fernand', 0.55, 0.5),
    'Mimi la vendeuse': ('mimi', 0.6, 0.5),
    'Bernard': ('pataud', 0.55, 0.45),
    'Myrtille': ('persane', 0.6, 0.5),
    'Maître-Nageur Mistral': ('turbo', 0.6, 0.5),
    'Bébé Phoque': ('biscotte', 0.75, 0.5),
    'Maman Phoque': ('maire', 0.6, 0.5),
    'Caramel': ('biscotte', 0.8, 0.5),
    'Gardienne Perle': ('maire', 0.55, 0.5),
    'Gino le glacier': ('bruno', 0.7, 0.5),
    'Maman Pingouin': ('persane', 0.6, 0.5),
    'Margot la vache': ('rita', 0.6, 0.45),
    'Papi Berger': ('loup', 0.55, 0.45),
    'Pingo': ('zazou', 0.75, 0.5),
    'Pompon': ('matcha', 0.7, 0.5),
    'Gaston': ('fernand', 0.65, 0.5),
    # Station des Neiges : les habitants de la couche de vie (level5life.js)
    'Gaspard le déneigeur': ('bruno', 0.6, 0.5),
    'Lulu la patineuse': ('rita', 0.7, 0.5),
    'Tino le patineur': ('zazou', 0.7, 0.5),
    'Firmin le pêcheur': ('loup', 0.5, 0.45),
    'Moniteur Flocon': ('turbo', 0.6, 0.5),
    'Praline': ('biscotte', 0.8, 0.5),
    'Noisette': ('filou', 0.75, 0.5),
    'Chouquette': ('biscotte', 0.75, 0.5),
    'Olga la sculptrice': ('maire', 0.55, 0.5),
    'Marcel des marrons': ('fernand', 0.65, 0.5),
    'Monsieur Bonhomme': ('lunette', 0.6, 0.5),
    'Le Yéti': ('pataud', 0.45, 0.45),
}
# les rôles principaux d'abord
ORDER = ['', 'Mamie Labrador', 'Matcha', 'Ainu', 'Biscotte', 'Capitaine Moustache']


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z ]', ' ', s).split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return round(float(r.stdout.strip() or 0), 2)


def main():
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from faster_whisper import WhisperModel
    model = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
    asr = WhisperModel('base', device='cpu', compute_type='int8', cpu_threads=2)
    lines = json.load(open(SRC))
    lines.sort(key=lambda l: (ORDER.index(l['who']) if l['who'] in ORDER else 99, len(l['text'])))
    work = os.path.dirname(os.path.abspath(SRC))
    done = set()
    for f in os.listdir(work):
        if f.startswith('chatterbox_done'): done |= set(open(os.path.join(work, f)).read().split())
    done_path = os.path.join(work, f'chatterbox_done{SHARD}.txt' if NSHARD > 1 else 'chatterbox_done.txt')
    for n, l in enumerate(lines):
        who, text = l['who'], l['text']
        lid = line_id(who, text)
        if lid in done or n % NSHARD != SHARD:
            continue
        ref, ex, cfg = CAST.get(who, CAST['Bruno le boulanger'])
        say = speakable(text)
        best = None
        for attempt in range(3):
            torch.manual_seed(1234 + attempt)
            wav = model.generate(say, language_id='fr', audio_prompt_path=os.path.join(REFS, ref + '.wav'), exaggeration=ex, cfg_weight=cfg, temperature=0.75 + attempt * 0.05)
            x = wav.squeeze(0).numpy()
            x16 = np.interp(np.arange(0, len(x) / model.sr, 1 / 16000), np.arange(len(x)) / model.sr, x).astype(np.float32)
            segs, _ = asr.transcribe(x16, language='fr', beam_size=1)
            e = wer(say, ' '.join(s.text for s in segs))
            if best is None or e < best[0]:
                best = (e, wav)
            if e <= 0.35:
                break
        e, wav = best
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, 'raw.wav')
            torchaudio.save(raw, wav, model.sr)
            out = os.path.join(OUT, lid + '.mp3')
            af = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=70,loudnorm=I=-17:TP=-2:LRA=9,afade=t=in:d=0.02,apad=pad_dur=0.1'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', af, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', out], check=True)
        done.add(lid)
        open(done_path, 'a').write(lid + '\n')
        print(f'{n + 1}/{len(lines)} {who or "conteur"} wer={e:.2f} {text[:50]}', flush=True)


def write_index():
    """index.json : la durée de chaque réplique de la liste (fichiers présents)."""
    lines = json.load(open(SRC))
    index = {}
    for l in lines:
        lid = line_id(l['who'], l['text'])
        p = os.path.join(OUT, lid + '.mp3')
        if os.path.exists(p): index[lid] = duration(p)
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:-4] not in index: os.remove(os.path.join(OUT, f))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
    print(len(index), 'répliques dans index.json')


if __name__ == '__main__':
    if os.environ.get('INDEX_ONLY'): write_index()
    else: main()
