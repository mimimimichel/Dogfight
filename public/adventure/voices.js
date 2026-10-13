/*
 * Matcha & Ainu — voix des personnages : une petite phrase enregistrée
 * (synthèse vocale Piper, voir tools/voices) par réplique. Chaque fichier est
 * nommé d'après qui parle et ce qu'il dit ; une réplique sans fichier garde le
 * petit « charabia » habituel. Les voix passent par la sortie du jeu (bouton
 * muet, compresseur) et baissent un peu la musique pendant qu'elles parlent.
 */
const BASE = new URL('./assets/voices/', import.meta.url).href;
let index = null, loading = null;
const buffers = new Map();
let current = null;

/** Empreinte d'une réplique (la même que dans tools/voices/gen.py). */
export function lineId(who, text) {
  let h = 0x811c9dc5;
  const s = (who || '') + '|' + text;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Charge la liste des répliques enregistrées (une seule fois). */
export function loadVoices() {
  if (!loading) loading = fetch(BASE + 'index.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(j => { index = j; return j; });
  return loading;
}

/** Durée de la réplique enregistrée (secondes), ou 0. */
export function voiceDuration(who, text) { return (index && index[lineId(who, text)]) || 0; }

function buffer(sfx, id) {
  if (!buffers.has(id)) {
    buffers.set(id, fetch(BASE + id + '.mp3').then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(a => new Promise((ok, ko) => sfx.ctx.decodeAudioData(a, ok, ko))).catch(() => null));
  }
  return buffers.get(id);
}

/** Prépare à l'avance les répliques d'un dialogue. */
export function prefetchVoices(sfx, lines) {
  if (!sfx || !sfx.ctx || !index) return;
  for (const l of lines) { const id = lineId(l.who, l.text); if (index[id]) buffer(sfx, id); }
}

/** Fait parler un personnage. Renvoie la durée (s) si la réplique a une voix, sinon 0. */
export function speak(sfx, who, text) {
  stopVoice(sfx);
  if (!sfx || !sfx.ctx || !index || sfx.muted) return 0;
  const id = lineId(who, text), dur = index[id];
  if (!dur) return 0;
  const token = current = { id, src: null };
  buffer(sfx, id).then(buf => {
    if (!buf || current !== token || !sfx.ctx) return;
    const src = sfx.ctx.createBufferSource(), g = sfx.ctx.createGain();
    src.buffer = buf; g.gain.value = 1.3;
    src.connect(g); g.connect(sfx.master);
    src.onended = () => { if (current === token) { current = null; if (sfx.duck) sfx.duck(false); } };
    token.src = src;
    if (sfx.duck) sfx.duck(true);
    src.start();
  });
  return dur;
}

/** Coupe la réplique en cours. */
export function stopVoice(sfx) {
  const c = current;
  current = null;
  if (c && c.src) { try { c.src.stop(); } catch (e) { /* déjà finie */ } }
  if (c && sfx && sfx.duck) sfx.duck(false);
}
