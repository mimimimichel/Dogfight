/*
 * Matcha & Ainu — « Ma niche » : la maison des chiens, à décorer.
 * Les trésors ramassés dans tous les mondes (os, croquettes, pièces) servent à acheter
 * des meubles et des jouets qu'on pose où on veut, du bout du doigt. Les récompenses
 * gagnées s'exposent toutes seules sur l'étagère, et les dernières photos souvenirs
 * s'accrochent au mur. Rangé dans la sauvegarde du joueur (voir profiles.js).
 */
(function () {
  'use strict';
  const KEY = 'dogfight.profile.niche', PROFILE = 'dogfight.profile';
  // prix en trésors ; « need » : nombre de récompenses pour le débloquer
  const SHOP = [
    { id: 'basket', icon: '🧺', name: 'Panier douillet', price: 0 },
    { id: 'bone', icon: '🦴', name: 'Gros os', price: 10 },
    { id: 'ball', icon: '⚽', name: 'Balle', price: 15 },
    { id: 'plant', icon: '🪴', name: 'Plante', price: 20 },
    { id: 'teddy', icon: '🧸', name: 'Nounours', price: 30 },
    { id: 'lamp', icon: '🪔', name: 'Lampe', price: 30 },
    { id: 'books', icon: '📚', name: 'Livres de Mamie', price: 35 },
    { id: 'balloon', icon: '🎈', name: 'Ballon', price: 40 },
    { id: 'clock', icon: '🕰️', name: 'Horloge', price: 50 },
    { id: 'guitar', icon: '🎸', name: 'Guitare', price: 60 },
    { id: 'tv', icon: '📺', name: 'Télé', price: 80 },
    { id: 'aquarium', icon: '🐠', name: 'Aquarium', price: 100 },
    { id: 'piano', icon: '🎹', name: 'Piano', price: 120 },
    { id: 'kite', icon: '🪁', name: 'Cerf-volant', price: 60, need: 5 },
    { id: 'rocket', icon: '🚀', name: 'Fusée', price: 150, need: 12 },
    { id: 'crown', icon: '👑', name: 'Couronne dorée', price: 200, need: 20 },
    { id: 'cat', icon: '🐈', name: 'La Capitaine en visite', price: 0, story: true },
  ];
  const WALLS = [
    { id: 'w0', name: 'Crème', css: 'linear-gradient(#fff4dc, #ffe6b8)', price: 0 },
    { id: 'w1', name: 'Ciel', css: 'linear-gradient(#bfe6ff, #e8f6ff)', price: 25 },
    { id: 'w2', name: 'Pois roses', css: 'radial-gradient(#ffb3d1 18%, transparent 20%) 0 0 / 34px 34px, #ffe3ef', price: 40 },
    { id: 'w3', name: 'Rayures menthe', css: 'repeating-linear-gradient(90deg, #c8f0dc 0 22px, #e6fff2 22px 44px)', price: 40 },
    { id: 'w4', name: 'Nuit étoilée', css: 'radial-gradient(#fff 1.5px, transparent 2px) 0 0 / 40px 40px, linear-gradient(#24305e, #3a4a8a)', price: 90 },
  ];
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const state = () => Object.assign({ spent: 0, owned: ['basket'], walls: ['w0'], wall: 'w0', placed: [] }, read(KEY, {}));
  const save = (s) => write(KEY, s);
  const earned = () => (read(PROFILE, {}).total || 0);
  const wallet = () => Math.max(0, earned() - state().spent);

  /** Récompenses gagnées (médailles, trophées, étoiles) dans les 4 mondes. */
  function rewards() {
    let n = 0;
    for (const k of ['niveau1', 'niveau2', 'niveau3b', 'niveau4', 'niveau7']) { const s = read('dogfight.aventure.' + k, null); if (s && s.medals) n += s.medals.length; }
    return n;
  }
  function storyDone() { const s = read('dogfight.aventure.niveau4', null); return !!(s && s.medals && s.medals.includes('m_goal')); }

  let root = null, room = null, drag = null, urls = [];

  function open(container) {
    root = container;
    render();
  }

  function render() {
    const s = state(), w = WALLS.find(x => x.id === s.wall) || WALLS[0];
    const rw = rewards();
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    root.innerHTML = `
      <div class="niche-top"><b>🏠 Ma niche</b><span class="niche-wallet">🦴 ${wallet()} trésors</span></div>
      <div class="niche-room" style="background:${w.css}">
        <div class="niche-shelf" title="Mes récompenses">${'🏅'.repeat(Math.min(rw, 14)) || '<small>Tes médailles viendront ici</small>'}</div>
        <div class="niche-frames"></div>
        <div class="niche-floor"></div>
        ${s.placed.map((p, i) => { const it = SHOP.find(x => x.id === p.id); return it ? `<div class="niche-item" data-i="${i}" style="left:${p.x}%;top:${p.y}%;font-size:${p.big ? 64 : 46}px">${it.icon}</div>` : ''; }).join('')}
        <img class="niche-dogs" src="img/duo.webp" alt="Ainu et Matcha">
        <div class="niche-trash" title="Glisse ici pour ranger">🧺 Ranger</div>
      </div>
      <p class="niche-help">Touche un objet pour le poser, puis fais-le glisser où tu veux. Glisse-le sur « Ranger » pour l'enlever.</p>
      <div class="niche-shop">${SHOP.filter(it => !it.story || storyDone()).map((it) => {
        const own = s.owned.includes(it.id), locked = it.need && rw < it.need;
        return `<button class="niche-buy${own ? ' own' : ''}${locked ? ' locked' : ''}" data-buy="${it.id}"><span>${it.icon}</span><small>${locked ? `🔒 ${it.need} récompenses` : own ? it.name : `${it.name} · 🦴${it.price}`}</small></button>`;
      }).join('')}</div>
      <div class="niche-walls">${WALLS.map(x => `<button class="niche-wall${s.wall === x.id ? ' on' : ''}" data-wall="${x.id}" style="background:${x.css}"><small>${s.walls.includes(x.id) ? x.name : `🦴${x.price}`}</small></button>`).join('')}</div>`;
    room = root.querySelector('.niche-room');
    // les dernières photos souvenirs, encadrées au mur
    if (window.Memories) window.Memories.list().then((list) => {
      const fr = root.querySelector('.niche-frames');
      if (!fr) return;
      fr.innerHTML = list.slice(0, 3).map((p) => { const u = URL.createObjectURL(p.blob); urls.push(u); return `<img src="${u}" alt="">`; }).join('');
    }).catch(() => {});
    root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => buy(b.dataset.buy)));
    root.querySelectorAll('[data-wall]').forEach(b => b.addEventListener('click', () => setWall(b.dataset.wall)));
    room.querySelectorAll('.niche-item').forEach(el => el.addEventListener('pointerdown', (e) => startDrag(e, el)));
  }

  function toast(t) {
    const el = document.createElement('div'); el.className = 'niche-toast'; el.textContent = t;
    root.appendChild(el); setTimeout(() => el.remove(), 1800);
  }

  function buy(id) {
    const s = state(), it = SHOP.find(x => x.id === id);
    if (!it) return;
    if (it.need && rewards() < it.need) { toast(`Gagne encore ${it.need - rewards()} récompense(s) pour l'avoir !`); return; }
    if (!s.owned.includes(id)) {
      if (wallet() < it.price) { toast(`Il te manque ${it.price - wallet()} trésors. Va en ramasser dans les mondes !`); return; }
      s.spent += it.price; s.owned.push(id);
    }
    // on le pose au milieu (un objet acheté peut être posé plusieurs fois)
    if (s.placed.length >= 30) { toast('La niche est pleine !'); save(s); render(); return; }
    s.placed.push({ id, x: 40 + Math.random() * 20, y: 55 + Math.random() * 15 });
    save(s); render();
  }
  function setWall(id) {
    const s = state(), w = WALLS.find(x => x.id === id);
    if (!s.walls.includes(id)) {
      if (wallet() < w.price) { toast(`Il te manque ${w.price - wallet()} trésors pour ce papier peint.`); return; }
      s.spent += w.price; s.walls.push(id);
    }
    s.wall = id; save(s); render();
  }

  function startDrag(e, el) {
    e.preventDefault();
    const r = room.getBoundingClientRect();
    drag = { el, i: +el.dataset.i, r };
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    const move = (ev) => {
      const x = Math.max(0, Math.min(92, (ev.clientX - r.left) / r.width * 100 - 4));
      const y = Math.max(8, Math.min(88, (ev.clientY - r.top) / r.height * 100 - 6));
      el.style.left = x + '%'; el.style.top = y + '%';
      drag.x = x; drag.y = y;
      const t = room.querySelector('.niche-trash').getBoundingClientRect();
      drag.trash = ev.clientX > t.left && ev.clientX < t.right && ev.clientY > t.top && ev.clientY < t.bottom;
      room.querySelector('.niche-trash').classList.toggle('hot', drag.trash);
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      const s = state();
      if (drag.trash) s.placed.splice(drag.i, 1);
      else if (drag.x !== undefined) Object.assign(s.placed[drag.i], { x: drag.x, y: drag.y });
      else s.placed[drag.i].big = !s.placed[drag.i].big;   // un simple toucher : plus gros / plus petit
      save(s); drag = null; render();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  window.Niche = { open, wallet };
})();
