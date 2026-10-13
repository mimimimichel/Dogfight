# Texte prononcé et empreinte des répliques, communs aux générateurs de voix.
import re


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
