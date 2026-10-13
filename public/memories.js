/*
 * Matcha & Ainu — les souvenirs : les photos prises en jeu (mode photo, et une photo
 * automatique à chaque médaille), rangées sur l'appareil pour chaque joueur et
 * montrées dans l'album. Rien n'est envoyé nulle part.
 */
(function () {
  'use strict';
  const DB = 'dogfight-souvenirs', STORE = 'photos', MAX = 60;
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('pas de stockage')); return; }
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); s.createIndex('who', 'who'); };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  const who = () => (window.Profiles ? window.Profiles.active() : 'p0');
  const tx = (mode) => db().then(d => d.transaction(STORE, mode).objectStore(STORE));
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /** Range une photo (Blob JPEG) : { world, label, auto }. Les plus anciennes partent au-delà de 60. */
  async function add(blob, meta) {
    const s = await tx('readwrite');
    await req(s.add(Object.assign({ who: who(), at: Date.now(), blob }, meta || {})));
    const all = await list();
    // on garde en priorité les photos prises exprès ; les automatiques partent d'abord
    if (all.length > MAX) {
      const extra = all.length - MAX, autos = all.filter(p => p.auto).reverse(), drop = autos.slice(0, extra);
      if (drop.length < extra) drop.push(...all.filter(p => !p.auto).reverse().slice(0, extra - drop.length));
      const w = await tx('readwrite');
      for (const p of drop) w.delete(p.id);
    }
  }
  /** Les photos du joueur, la plus récente d'abord. */
  async function list() {
    const s = await tx('readonly');
    const all = await req(s.index('who').getAll(who()));
    return all.sort((a, b) => b.at - a.at);
  }
  async function remove(id) { const s = await tx('readwrite'); await req(s.delete(id)); }

  /**
   * Carte postale : la photo dans un cadre blanc, avec le nom du monde et la date.
   * Renvoie une promesse de Blob JPEG ; width = largeur de la photo dans le cadre.
   */
  function postcard(src, world, width) {
    const w = width || 1280, h = Math.round(w * src.height / src.width);
    const pad = Math.round(w * 0.035), foot = Math.round(w * 0.075);
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2 + foot;
    const x = c.getContext('2d');
    x.fillStyle = '#fffaf0'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, pad, pad, w, h);
    x.fillStyle = '#5a3a1a';
    x.font = `bold ${Math.round(foot * 0.42)}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
    x.textBaseline = 'middle';
    const y = pad + h + foot / 2 + pad / 2;
    x.textAlign = 'left'; x.fillText('🐾 Matcha & Ainu' + (world ? ' · ' + world : ''), pad, y);
    x.textAlign = 'right'; x.font = `${Math.round(foot * 0.34)}px Fredoka, Arial, sans-serif`;
    x.fillText(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), c.width - pad, y);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
  }

  window.Memories = { add, list, remove, postcard };
})();
