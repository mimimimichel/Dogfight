/*
 * Dogfight — contrôleur client : menus, entrées, réseau, boucles de jeu.
 */
(function () {
  'use strict';
  const C = window.DogGame;
  const R = window.DogRender;
  const { IN, CHARACTERS, CHAR_IDS } = C;
  const STEP = 1000 / C.TICK_RATE;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const sfx = new window.DogSfx();
  sfx.music('menu'); // démarre au premier contact avec l'écran
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Mise à l'échelle de la scène
  // ---------------------------------------------------------------------------
  function fit() {
    const touchDevice = document.documentElement.classList.contains('touch');
    const vw = window.innerWidth, vh = window.innerHeight;
    // Largeur du rendu adaptée au format de l'écran : sur un téléphone allongé,
    // le décor s'élargit au lieu de laisser des bandes noires (l'arène reste centrée).
    const cw = Math.max(480, Math.min(R.MAX_W, Math.round((270 * vw / vh) / 2) * 2));
    if (canvas.width !== cw) canvas.width = cw;
    const st = document.getElementById('stage');
    st.style.width = (cw * 2) + 'px';
    canvas.style.width = (cw * 2) + 'px';
    // Agrandissement : pas entiers sur grand écran (pixels nets), plein cadre sur tactile
    const raw = Math.min(vw / cw, vh / 270);
    const k = raw >= 2 && !touchDevice ? Math.floor(raw) : raw;
    st.style.setProperty('--scale', String(Math.max(0.3, k / 2)));
    // Tablette : s'il reste beaucoup de place en bas, la scène monte et les commandes tactiles s'y logent
    const spare = vh - 270 * k;
    st.classList.toggle('top', touchDevice && spare > vh * 0.18);
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------------------------------------------------------------------------
  // Entrées (codes physiques : ZQSD en AZERTY = WASD en QWERTY)
  // ---------------------------------------------------------------------------
  const KEYMAPS = {
    solo: {
      LEFT: ['KeyA', 'ArrowLeft'], RIGHT: ['KeyD', 'ArrowRight'], UP: ['KeyW', 'ArrowUp', 'Space'], DOWN: ['KeyS', 'ArrowDown'],
      LIGHT: ['KeyJ', 'Numpad1'], HEAVY: ['KeyK', 'Numpad2'], SPECIAL: ['KeyL', 'Numpad3'], SUPER: ['KeyI', 'Numpad0'],
    },
    p1: {
      LEFT: ['KeyA'], RIGHT: ['KeyD'], UP: ['KeyW'], DOWN: ['KeyS'],
      LIGHT: ['KeyF'], HEAVY: ['KeyG'], SPECIAL: ['KeyH'], SUPER: ['KeyT'],
    },
    p2: {
      LEFT: ['ArrowLeft'], RIGHT: ['ArrowRight'], UP: ['ArrowUp'], DOWN: ['ArrowDown'],
      LIGHT: ['KeyJ', 'Numpad1'], HEAVY: ['KeyK', 'Numpad2'], SPECIAL: ['KeyL', 'Numpad3'], SUPER: ['KeyI', 'Numpad0'],
    },
  };
  const GAME_KEYS = new Set(Object.values(KEYMAPS).flatMap(m => Object.values(m).flat()));
  const held = new Set();

  function keyBits(map) {
    let b = 0;
    for (const k in map) if (map[k].some(code => held.has(code))) b |= IN[k];
    return b;
  }

  function padBits(index) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list = Array.from(pads || []).filter(Boolean);
    const p = list[index];
    if (!p) return 0;
    const btn = (i) => p.buttons[i] && p.buttons[i].pressed;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    let b = 0;
    if (btn(14) || ax < -0.5) b |= IN.LEFT;
    if (btn(15) || ax > 0.5) b |= IN.RIGHT;
    if (btn(12) || ay < -0.6 || btn(0)) b |= IN.UP;
    if (btn(13) || ay > 0.6) b |= IN.DOWN;
    if (btn(2)) b |= IN.LIGHT;
    if (btn(3)) b |= IN.HEAVY;
    if (btn(1)) b |= IN.SPECIAL;
    if (btn(5) || btn(7) || btn(4) || btn(6)) b |= IN.SUPER;
    return b;
  }

  const T = window.DogTouch;
  const IS_TOUCH = !!(T && T.isTouch);

  function playerBits(slot) {
    if (app.mode === 'local') return keyBits(slot === 0 ? KEYMAPS.p1 : KEYMAPS.p2) | padBits(slot) | (slot === 0 && T ? T.bits() : 0);
    return keyBits(KEYMAPS.solo) | padBits(0) | (T ? T.bits() : 0);
  }

  // ---------------------------------------------------------------------------
  // État de l'application
  // ---------------------------------------------------------------------------
  const app = {
    screen: 'menu',
    mode: null, // 'cpu' | 'local' | 'online'
    name: '',
    game: null, // jeu local
    brain: null,
    cpuLevel: 0.15,
    snap: null,
    fx: new R.Effects(),
    names: ['', ''],
    alts: [false, false],
    chars: [null, null],
    paused: false,
    resultShown: false,
    // sélection
    sel: { picks: [null, null], ready: [false, false], cursor: [0, 1], active: 0 },
    // réseau
    ws: null,
    slot: 0,
    code: null,
    lobby: null,
    queue: [],
    lastSent: -1,
    ping: undefined,
    netStarted: false,
    rematchVotes: [false, false],
    // démo en arrière-plan
    demo: null,
    demoBrains: null,
    debug: false,
  };

  try { app.name = localStorage.getItem('dogfight.name') || ''; } catch (e) { /* ignore */ }
  try {
    const lv = parseFloat(localStorage.getItem('dogfight.cpuLevel'));
    const chip = [...document.querySelectorAll('[data-level]')].find(c => parseFloat(c.dataset.level) === lv);
    if (chip) {
      app.cpuLevel = lv;
      for (const c of document.querySelectorAll('[data-level]')) c.classList.toggle('active', c === chip);
    }
  } catch (e) { /* ignore */ }
  $('name').value = app.name;
  $('name').addEventListener('input', () => {
    app.name = $('name').value;
    try { localStorage.setItem('dogfight.name', app.name); } catch (e) { /* ignore */ }
  });

  function show(screen) {
    app.screen = screen;
    if (screen === 'menu' || screen === 'levels') updateAdventureButton();
    // musique : aventure, combat (partie, pause, résultat) ou menus
    sfx.music(screen === 'adventure' ? 'adventure' : (screen === 'game' || screen === 'pause' || screen === 'result') ? 'fight' : 'menu');
    for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
    const el = $('screen-' + screen);
    if (el) el.classList.remove('hidden');
    const playing = screen === 'game';
    if (IS_TOUCH) {
      T.setVisible(playing);
      $('pause-btn').classList.toggle('hidden', !playing);
    }
  }

  /** Progression sauvegardée d'un niveau de l'aventure (ou null). */
  function levelSave(n) {
    try { return JSON.parse(localStorage.getItem('dogfight.aventure.niveau' + n + (n === 3 ? 'b' : '')) || 'null'); } catch (e) { return null; }
  }
  /** Le gros bouton d'aventure indique la progression sauvegardée. */
  function updateAdventureButton() {
    const s1 = levelSave(1), s2 = levelSave(2), s3 = levelSave(3), s4 = levelSave(4);
    const started = (s) => s && s.intro && ((s.bones || []).length || (s.medals || []).length);
    const medals = (s) => (s && s.medals ? s.medals.length : 0);
    const any = started(s1) || started(s2) || started(s3) || started(s4);
    $('adv-play-label').textContent = any ? 'Continuer' : 'Jouer';
    $('adv-play-sub').textContent = any
      ? `4 niveaux · Récompenses ${medals(s1) + medals(s2) + medals(s3) + medals(s4)}/28`
      : "Explore l'île avec tes chiens !";
    const prog = (s, what) => (started(s) ? `Médailles ${medals(s)}/5 · ${what} ${(s.bones || []).length}/100` : 'Nouveau !');
    $('lv1-prog').textContent = prog(s1, 'Os');
    $('lv2-prog').textContent = prog(s2, 'Croquettes');
    $('lv3-prog').textContent = started(s3) ? `Trophées ${medals(s3)}/12 · Pièces ${(s3.bones || []).length}/100` : 'Nouveau !';
    [[s1, 5], [s2, 5], [s3, 12], [s4, 6]].forEach(([s, n], i) => {
      const p = s ? Math.round((Math.min((s.medals || []).length, n) / n * 0.7 + Math.min((s.bones || []).length, 100) / 100 * 0.3) * 100) : 0;
      $('lv' + (i + 1) + '-bar').style.setProperty('--p', p + '%');
    });
    const best = s4 && s4.sky && s4.sky.best;
    $('lv4-prog').textContent = started(s4) ? `Étoiles ${(s4.medals || []).filter(m => m !== 'm_goal').length}/5${best ? ` · record ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : ''}` : 'Nouveau !';
  }
  // ---------------------------------------------------------------------------
  // « Qui joue ? » : un joueur = sa propre progression (profiles.js)
  // ---------------------------------------------------------------------------
  const PR = window.Profiles;
  function updatePlayerButton() {
    const me = PR.current();
    $('player-btn').textContent = PR.AVATARS[me.avatar || 0] + ' ' + me.name;
  }
  function renderPlayers() {
    editPlayer(null);
    const me = PR.active();
    $('players').innerHTML = PR.list().map(p => `<div class="player${p.id === me ? ' on' : ''}" data-player="${p.id}">
        <div class="av" style="--c:${PR.COLORS[p.color % PR.COLORS.length]}">${PR.AVATARS[p.avatar % PR.AVATARS.length]}</div>
        <b>${p.name.replace(/[<>&"]/g, '')}</b><small>${PR.progress(p.id)} %</small>
        <span class="edit" data-edit="${p.id}">✏️</span></div>`).join('')
      + (PR.list().length < 6 ? '<div class="player add" data-player="new"><div class="av">＋</div><b>Nouveau</b><small>joueur</small></div>' : '');
    $('players-back').classList.toggle('hidden', PR.shouldAsk());
  }
  function editPlayer(id) {
    app.editing = id;
    $('player-edit').classList.toggle('hidden', !id);
    $('players').classList.toggle('hidden', !!id);
    if (!id) return;
    const p = id === 'new' ? { name: '', color: PR.list().length % PR.COLORS.length, avatar: PR.list().length % PR.AVATARS.length } : PR.list().find(q => q.id === id);
    app.editColor = p.color; app.editAvatar = p.avatar;
    $('player-name').value = p.name;
    $('player-delete').classList.toggle('hidden', id === 'new' || id === 'p0');
    const pick = () => {
      $('player-avatars').innerHTML = PR.AVATARS.map((a, i) => `<button data-av="${i}" class="${i === app.editAvatar ? 'on' : ''}">${a}</button>`).join('');
      $('player-colors').innerHTML = PR.COLORS.map((c, i) => `<button data-col="${i}" style="--c:${c}" class="${i === app.editColor ? 'on' : ''}" aria-label="couleur ${i + 1}"></button>`).join('');
    };
    pick();
    app.repick = pick;
    setTimeout(() => $('player-name').focus(), 50);
  }
  function savePlayer() {
    const name = $('player-name').value;
    if (app.editing === 'new') PR.select(PR.create(name, app.editColor, app.editAvatar));
    else { PR.rename(app.editing, name, app.editColor, app.editAvatar); renderPlayers(); updatePlayerButton(); }
  }
  document.addEventListener('click', (e) => {
    const av = e.target.closest('[data-av]'), col = e.target.closest('[data-col]');
    if (av) { app.editAvatar = +av.dataset.av; app.repick(); return; }
    if (col) { app.editColor = +col.dataset.col; app.repick(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); editPlayer(ed.dataset.edit); return; }
    const pl = e.target.closest('[data-player]');
    if (pl) {
      if (pl.dataset.player === 'new') { editPlayer('new'); return; }
      PR.markChosen();
      if (pl.dataset.player === PR.active()) { show('menu'); return; }
      PR.select(pl.dataset.player);
    }
  });
  updatePlayerButton();
  // plusieurs joueurs sur cet appareil : on demande qui joue, une fois par visite
  if (PR.shouldAsk()) { renderPlayers(); show('profiles'); }

  // ---------------------------------------------------------------------------
  // Coin des parents (parents.js) : minuteur, temps de la semaine, réglages
  // ---------------------------------------------------------------------------
  const PS = window.ParentSettings, PT = window.ParentTimer;
  const minutes = (m) => (m < 1 ? (m > 0 ? '< 1 min' : '0 min') : m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0'));
  /** Applique les réglages des parents à l'accueil (mode combat caché ou non). */
  function applyParents() {
    const hide = PS.hideCombat;
    document.querySelector('.combat-box').classList.toggle('hidden', hide);
    document.querySelector('[data-action="ctl-fight"]').classList.toggle('hidden', hide);
    if (hide) {
      $('combat-panel').classList.add('hidden');
      document.querySelector('.combat-box').classList.remove('open');
      document.querySelector('.combat-toggle').setAttribute('aria-expanded', false);
    }
  }
  function renderParents() {
    const st = PS.get();
    for (const b of document.querySelectorAll('#par-timers [data-action]')) b.classList.toggle('on', +b.dataset.action.slice(10) === st.timerMin);
    const used = PT.used() / 60;
    $('par-session').textContent = st.timerMin
      ? `Cette séance : ${minutes(used)} jouées · encore ${minutes(PT.remaining() / 60)}`
      : `Cette séance : ${minutes(used)} jouées · pas de limite`;
    $('par-extend').classList.toggle('hidden', !st.timerMin);
    const wk = PT.week(), max = Math.max(30, ...wk.map(d => d.min));
    $('par-week').innerHTML = wk.map(d => `<div class="par-day${d.label === 'Auj.' ? ' today' : ''}" title="${minutes(d.min)}">
        <small>${d.min >= 1 ? Math.round(d.min) : ''}</small><span class="par-bar"><i style="height:${Math.round(d.min / max * 100)}%"></i></span><b>${d.label}</b></div>`).join('');
    $('par-week-sum').textContent = `Total sur 7 jours : ${minutes(wk.reduce((t, d) => t + d.min, 0))} (compté sur cet appareil seulement)`;
    const sw = (id, on) => { $(id).classList.toggle('on', on); $(id).setAttribute('aria-checked', on); $(id).textContent = on ? 'Oui' : 'Non'; };
    sw('par-combat', st.hideCombat);
    sw('par-mic', st.mic);
    sw('par-netlog', st.netlog);
  }
  /** Action des boutons du coin des parents (vrai si traitée). */
  function parentsAction(a) {
    const st = PS.get();
    if (a.startsWith('par-timer-')) PS.set({ timerMin: +a.slice(10) });
    else if (a === 'par-extend') PT.extend(10);
    else if (a === 'par-reset') PT.reset();
    else if (a === 'par-combat') PS.set({ hideCombat: !st.hideCombat });
    else if (a === 'par-mic') PS.set({ mic: !st.mic });
    else if (a === 'par-netlog') PS.set({ netlog: !st.netlog });
    else return false;
    applyParents();
    renderParents();
    return true;
  }
  applyParents();

  /** « Mon aventure » : progression des quatre mondes, rang et badges. */
  function renderAlbum() {
    const S = [1, 2, 3, 4].map(levelSave);
    const has = (s, id) => !!(s && s.medals && s.medals.includes(id));
    const count = (s, k) => (s && s[k] ? s[k].length : 0);
    const W = [
      { n: 'Le Parc des Toutous', med: 5, medName: 'Médailles', col: 'Os', s: S[0] },
      { n: 'La Forêt des Moustaches', med: 5, medName: 'Médailles', col: 'Croquettes', s: S[1], extra: S[1] && S[1].boss ? 'Capitaine chassée !' : '' },
      { n: 'Port-Croquette', med: 12, medName: 'Trophées', col: 'Pièces', s: S[2], extra: has(S[2], 'm_boss') ? 'Ville sauvée !' : '' },
      { n: 'Les Îles du Ciel', med: 6, medName: 'Étoiles + Trophée', col: 'Pièces', s: S[3],
        extra: S[3] && S[3].sky && S[3].sky.best ? `Record ${Math.floor(S[3].sky.best / 60)}:${String(Math.round(S[3].sky.best) % 60).padStart(2, '0')}` : '' },
    ];
    let got = 0, all = 0;
    $('album-worlds').innerHTML = W.map((w, i) => {
      const m = count(w.s, 'medals'), b = count(w.s, 'bones');
      const pct = Math.round((Math.min(m, w.med) / w.med * 0.7 + Math.min(b, 100) / 100 * 0.3) * 100);
      got += Math.min(m, w.med) * 4 + Math.min(b, 100) / 100 * 10; all += w.med * 4 + 10;
      const dots = Array.from({ length: w.med }, (_, k) => `<i class="${k < m ? 'on' : ''}"></i>`).join('');
      return `<div class="album-world l${i + 1}${w.s && w.s.intro ? '' : ' new'}" style="--i:${i}">
        <span class="pct">${pct}%</span><h4>${i + 1}. ${w.n}</h4>
        <div class="row">${w.medName} ${Math.min(m, w.med)}/${w.med}</div><div class="dots">${dots}</div>
        <div class="row">${w.col} ${b}/100 <span class="bar" style="--p:${b}%"><i></i></span></div>
        ${w.extra ? `<span class="tag">${w.extra}</span>` : (w.s && w.s.intro ? '' : '<span class="tag">Pas encore visité</span>')}
      </div>`;
    }).join('');
    const total = Math.round(got / all * 100);
    $('album-ring').style.setProperty('--p', total + '%');
    $('album-pct').textContent = total + '%';
    const ranks = [[0, 'Chiot curieux'], [10, 'Petit explorateur'], [30, 'Renifleur de pistes'], [50, 'Toutou aventurier'], [75, 'Héros du parc'], [95, 'Toutous légendaires']];
    $('album-rank').textContent = ranks.filter(r => total >= r[0]).pop()[1];
    const medTotal = W.reduce((a, w) => a + Math.min(count(w.s, 'medals'), w.med), 0);
    $('album-sum').textContent = `${medTotal}/28 récompenses · ${W.reduce((a, w) => a + count(w.s, 'bones'), 0)}/400 trésors`;
    const anyBones100 = W.some(w => count(w.s, 'bones') >= 100);
    const stars = S[3] ? (S[3].medals || []).filter(x => x !== 'm_goal').length : 0;
    const badges = [
      ['🏅', 'Première médaille', medTotal > 0],
      ['🐶', 'Biscotte retrouvé', has(S[0], 'm_puppy')],
      ['🐱', 'Chasseurs de chats', has(S[0], 'm_cats')],
      ['🏮', 'Allumeurs de lanternes', has(S[1], 'm_lanterns')],
      ['🦉', 'Ami du hibou', has(S[1], 'm_owl')],
      ['🌲', 'Gardiens de la forêt', !!(S[1] && S[1].boss)],
      ['🏎️', 'Champions du kart', has(S[2], 'm_champion') || has(S[2], 'm_race')],
      ['🚕', 'Taxi toutou', has(S[2], 'm_taxi')],
      ['🏙️', 'Sauveurs de la ville', has(S[2], 'm_boss')],
      ['🎈', 'Montgolfière dégonflée', !!(S[3] && S[3].sky && S[3].sky.boss)],
      ['🏆', 'Trophée du Ciel', has(S[3], 'm_goal')],
      ['⭐', 'Toutes les étoiles', stars >= 5],
      ['⏱️', 'Plus rapide que le vent', !!(S[3] && S[3].sky && S[3].sky.best && S[3].sky.best < 300)],
      ['🦴', 'Grand collectionneur', anyBones100],
      ['👑', 'Toutous légendaires', total >= 95],
    ];
    $('album-badges').innerHTML = badges.map(([ic, n, on], i) => `<div class="abadge${on ? '' : ' off'}" style="--i:${i}" title="${n}"><div class="ic"><span>${ic}</span></div>${n}</div>`).join('');
    // carnet des bêtises
    const C = window.Carnet;
    if (C) {
      $('carnet-sum').textContent = `${C.stamps()}/${C.LIST.length} tampons`;
      $('album-carnet').innerHTML = C.LIST.map((it) => {
        const p = C.progress(it.id), ok = p >= it.need;
        return `<div class="cline${ok ? ' ok' : ''}"><span class="st">${ok ? it.icon : '·'}</span><span>${it.text}</span>${it.need > 1 && !ok ? `<small>${p}/${it.need}</small>` : ''}</div>`;
      }).join('');
    }
    renderPhotos();
  }

  /** Mes souvenirs : les photos du joueur (cartes postales), on touche pour voir en grand. */
  let photoUrls = [];
  function renderPhotos() {
    const box = $('album-photos'), MEM = window.Memories;
    if (!MEM || !box) return;
    MEM.list().then((list) => {
      for (const u of photoUrls) URL.revokeObjectURL(u);
      photoUrls = [];
      if (!list.length) return;
      box.innerHTML = list.map((p) => {
        const u = URL.createObjectURL(p.blob); photoUrls.push(u);
        return `<button class="aphoto" data-pid="${p.id}"><img src="${u}" alt="${escapeHtml(p.label || 'Photo')}" loading="lazy"><small>${escapeHtml(p.label || '')}</small></button>`;
      }).join('');
      box.querySelectorAll('.aphoto').forEach((b) => b.addEventListener('click', () => viewPhoto(list.find(p => p.id === +b.dataset.pid))));
    }).catch(() => {});
  }
  function viewPhoto(p) {
    if (!p) return;
    const url = URL.createObjectURL(p.blob);
    const v = document.createElement('div'); v.className = 'photo-view';
    v.innerHTML = `<img src="${url}" alt=""><div class="pv-bar"><button class="hbtn go" data-pv="share">📤 Envoyer</button><button class="hbtn" data-pv="del">🗑️</button><button class="hbtn" data-pv="close">Fermer</button></div>`;
    const close = () => { v.remove(); URL.revokeObjectURL(url); };
    v.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.pv;
      if (a === 'close' || e.target === v) close();
      else if (a === 'del') { if (confirm('Supprimer cette photo ?')) window.Memories.remove(p.id).then(() => { close(); renderPhotos(); }); }
      else if (a === 'share') {
        const file = new File([p.blob], 'matcha-ainu.jpg', { type: p.blob.type || 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Matcha & Ainu' }).catch(() => {});
        else { const a2 = document.createElement('a'); a2.href = url; a2.download = 'matcha-ainu.jpg'; document.body.appendChild(a2); a2.click(); a2.remove(); }
      }
    });
    document.body.appendChild(v);
  }

  function renderModes() {
    let m = 'aventure';
    try { m = localStorage.getItem('dogfight.mode') || 'aventure'; } catch (e) { /* ignore */ }
    for (const b of document.querySelectorAll('.mpick')) b.classList.toggle('active', b.dataset.action === 'mode-' + m);
  }
  renderModes();
  updateAdventureButton();

  // Plein écran + paysage sur téléphone (Android ; iOS ignore poliment)
  function goFullscreen() {
    if (!IS_TOUCH || isFullscreen()) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const pr = req.call(el, { navigationUI: 'hide' });
      if (pr && pr.then) pr.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function updateFullscreenUi() {
    if (!IS_TOUCH) return;
    // Android & co : bouton « plein écran » tant qu'on n'y est pas
    $('fs-btn').classList.toggle('hidden', !fsSupported || isFullscreen() || standalone);
    // iPhone : Safari n'autorise pas le plein écran d'une page → passer par l'écran d'accueil
    $('ios-tip').classList.toggle('hidden', !(isIOS && !fsSupported && !standalone));
  }
  // Plein écran par défaut sur téléphone : dès qu'on tourne le téléphone, un grand écran
  // « touche pour jouer » ; le premier toucher (n'importe où) passe en plein écran.
  // (Les navigateurs exigent un geste ; l'iPhone ne le permet qu'à l'appli de l'écran d'accueil.)
  let fsRefused = false;
  function updateFsInvite() {
    const inv = $('fs-invite');
    if (!inv) return;
    const landscape = window.innerWidth > window.innerHeight;
    const want = IS_TOUCH && !standalone && !isFullscreen() && landscape && !fsRefused && (fsSupported || isIOS) && !inv.dataset.seen;
    inv.classList.toggle('hidden', !want);
    inv.querySelector('.fs-ios').classList.toggle('hidden', !(isIOS && !fsSupported));
  }
  if (IS_TOUCH) {
    const onGesture = () => {
      if (fsSupported && !standalone && !isFullscreen()) {
        goFullscreen();
        // si le navigateur refuse, on n'insiste pas jusqu'à la prochaine rotation
        setTimeout(() => { if (!isFullscreen()) { fsRefused = true; updateFsInvite(); } }, 600);
      }
      const inv = $('fs-invite');
      if (inv && !inv.classList.contains('hidden')) { if (!fsSupported) inv.dataset.seen = '1'; inv.classList.add('hidden'); sfx.unlock(); }
    };
    document.addEventListener('touchend', onGesture, { capture: true, passive: true });
    document.addEventListener('click', onGesture, { capture: true });
    const reorient = () => { fsRefused = false; setTimeout(updateFsInvite, 250); };
    window.addEventListener('orientationchange', reorient);
    window.addEventListener('resize', () => setTimeout(updateFsInvite, 250));
    $('fs-invite').addEventListener('click', (e) => e.stopPropagation());
    updateFsInvite();
  }
  document.addEventListener('fullscreenchange', () => { updateFullscreenUi(); updateFsInvite(); fit(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFullscreenUi(); updateFsInvite(); fit(); });

  function togglePause() {
    if (app.screen === 'game') { app.paused = app.mode !== 'online'; show('pause'); }
    else if (app.screen === 'pause') { app.paused = false; show('game'); }
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 3200);
  }

  // ---------------------------------------------------------------------------
  // Démo en arrière-plan (ordi contre ordi)
  // ---------------------------------------------------------------------------
  function newDemo() {
    app.demo = new C.Game(['ainu', 'matcha']);
    app.demoBrains = [new C.CpuBrain(0.9), new C.CpuBrain(0.9)];
    app.demoFx = new R.Effects();
  }
  newDemo();

  function stepDemo() {
    const g = app.demo;
    for (let i = 0; i < 2; i++) g.setInput(i, app.demoBrains[i].think(g, i));
    g.tick();
    const snap = g.snapshot();
    app.demoFx.handleEvents(snap.events, snap, null, null);
    app.demoFx.update();
    app.demoSnap = snap;
    if (g.phase === 'matchover' && g.phaseTimer > 180) newDemo();
  }

  // ---------------------------------------------------------------------------
  // Sélection des personnages
  // ---------------------------------------------------------------------------
  const STATS = {
    ainu: { Puissance: 5, Vitesse: 2, Endurance: 5, Portée: 4 },
    matcha: { Puissance: 3, Vitesse: 5, Endurance: 3, Portée: 3 },
  };
  const previewCanvases = {};

  function buildCards() {
    const wrap = $('cards');
    wrap.innerHTML = '';
    CHAR_IDS.forEach((id, idx) => {
      const ch = CHARACTERS[id];
      const card = document.createElement('div');
      card.className = 'card';
      card.title = ch.desc;
      card.dataset.char = id;
      const m = ch.moves;
      card.innerHTML = `
        <div class="badges"></div>
        <canvas width="153" height="75"></canvas>
        <h4>${ch.name}</h4>
        <div class="breed">${ch.breed}</div>
        <div class="stats">${Object.entries(STATS[id]).map(([k, v]) => `<span>${k}</span><div class="bar"><i style="width:${v * 20}%"></i></div>`).join('')}</div>
        <div class="moves">
          <div><b>Spéciale :</b> ${m.special.name}</div>
          <div><b>Super :</b> ${m.super.name}</div>
        </div>`;
      card.addEventListener('click', () => onCardClick(id, idx));
      wrap.appendChild(card);
      previewCanvases[id] = card.querySelector('canvas');
    });
  }
  buildCards();

  function enterSelect() {
    app.sel = { picks: [null, null], ready: [false, false], cursor: [0, 1], active: 0 };
    if (app.mode === 'cpu') app.sel.picks = ['ainu', 'matcha'];
    if (app.mode === 'local') app.sel.picks = ['ainu', 'matcha'];
    if (app.mode === 'online') {
      app.sel.picks = [null, null];
      app.sel.picks[app.slot] = app.slot === 0 ? 'ainu' : 'matcha';
      sendPick(false);
    }
    $('cpu-options').classList.toggle('hidden', app.mode !== 'cpu');
    show('select');
    updateSelectUI();
  }

  function onCardClick(id) {
    goFullscreen();
    sfx.unlock();
    sfx.click();
    const s = app.sel;
    if (app.mode === 'online') {
      if (s.ready[app.slot]) return;
      s.picks[app.slot] = id;
      sendPick(false);
    } else if (app.mode === 'cpu') {
      s.picks[0] = id;
      s.picks[1] = id === 'ainu' ? 'matcha' : 'ainu';
    } else {
      s.picks[s.active] = id;
    }
    updateSelectUI();
  }

  function updateSelectUI() {
    const s = app.sel;
    for (const card of document.querySelectorAll('.card')) {
      const id = card.dataset.char;
      const b = card.querySelector('.badges');
      const tags = [];
      card.classList.remove('p1', 'p2');
      for (let i = 0; i < 2; i++) {
        if (s.picks[i] === id) {
          card.classList.add('p' + (i + 1));
          let label = 'J' + (i + 1);
          if (app.mode === 'cpu' && i === 1) label = 'ORDI';
          if (app.mode === 'online') label = i === app.slot ? 'TOI' : (app.lobby && app.lobby.players[i] ? app.lobby.players[i].name : 'ADV.');
          tags.push(`<span class="badge p${i + 1}${s.ready[i] ? ' ready' : ''}">${escapeHtml(label)}</span>`);
        }
      }
      b.innerHTML = tags.join('');
    }
    const st = $('select-status');
    const btn = $('ready-btn');
    btn.disabled = false;
    if (app.mode === 'cpu') {
      st.textContent = IS_TOUCH ? 'Touche un chien pour le choisir' : 'Q/D ou clic pour choisir, J pour valider';
      btn.textContent = 'Combattre !';
    } else if (app.mode === 'local') {
      st.textContent = s.active === 0
        ? 'Joueur 1 : Q/D puis F pour valider'
        : 'Joueur 2 : flèches puis J pour valider';
      btn.textContent = s.active === 0 ? 'Valider J1' : 'Valider J2';
    } else {
      const other = app.lobby && app.lobby.players[1 - app.slot];
      const meReady = s.ready[app.slot];
      if (meReady) st.textContent = other && other.ready ? 'C\'est parti !' : `En attente de ${other ? other.name : 'l\'adversaire'}…`;
      else st.textContent = `Contre ${other ? other.name : '…'} — salon ${app.code}`;
      btn.textContent = meReady ? 'Pas prêt' : 'Prêt !';
    }
  }

  function confirmSelect() {
    sfx.unlock();
    const s = app.sel;
    if (app.mode === 'cpu') {
      startLocal(s.picks.slice());
    } else if (app.mode === 'local') {
      if (s.active === 0) { s.ready[0] = true; s.active = 1; sfx.click(); updateSelectUI(); }
      else { s.ready[1] = true; startLocal(s.picks.slice()); }
    } else if (app.mode === 'online') {
      s.ready[app.slot] = !s.ready[app.slot];
      sendPick(s.ready[app.slot]);
      updateSelectUI();
    }
  }

  function selectKey(code) {
    const s = app.sel;
    let player = 0;
    let dir = 0, ok = false;
    if (app.mode === 'local') {
      player = s.active;
      const map = player === 0 ? KEYMAPS.p1 : KEYMAPS.p2;
      if (map.LEFT.includes(code)) dir = -1;
      if (map.RIGHT.includes(code)) dir = 1;
      if (map.LIGHT.includes(code)) ok = true;
    } else {
      if (KEYMAPS.solo.LEFT.includes(code)) dir = -1;
      if (KEYMAPS.solo.RIGHT.includes(code)) dir = 1;
      if (KEYMAPS.solo.LIGHT.includes(code) || code === 'Enter') ok = true;
    }
    if (code === 'Enter') ok = true;
    if (dir) {
      const slot = app.mode === 'online' ? app.slot : player;
      if (app.mode === 'online' && s.ready[app.slot]) return;
      const cur = Math.max(0, CHAR_IDS.indexOf(s.picks[slot]));
      const next = CHAR_IDS[(cur + dir + CHAR_IDS.length) % CHAR_IDS.length];
      onCardClick(next);
    }
    if (ok) confirmSelect();
  }

  function drawPreviews(time) {
    for (const id of CHAR_IDS) {
      const cv = previewCanvases[id];
      if (!cv) continue;
      const c = cv.getContext('2d');
      R.cardBackground(c, cv.width, cv.height);
      const picked = app.sel.picks.includes(id);
      const mirror = app.sel.picks[0] === id && app.sel.picks[1] === id;
      const gy = cv.height - 5;
      if (mirror) {
        R.drawDogPreview(c, id, false, cv.width / 2 - 34, gy, 1, 1, time, 'win');
        R.drawDogPreview(c, id, true, cv.width / 2 + 34, gy, 1, -1, time + 20, 'win');
      } else {
        R.drawDogPreview(c, id, false, cv.width / 2 - 6, gy, 1, 1, time, picked ? 'win' : 'idle');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Partie locale (ordi ou 2 joueurs)
  // ---------------------------------------------------------------------------
  function startLocal(chars) {
    app.chars = chars;
    // Contre l'ordi : il frappe moins fort en Facile
    app.game = new C.Game(chars, app.mode === 'cpu' ? { damageScale: [1, C.cpuDamageScale(app.cpuLevel)] } : undefined);
    app.brain = app.mode === 'cpu' ? new C.CpuBrain(app.cpuLevel) : null;
    app.alts = [false, chars[0] === chars[1]];
    const n = app.name.trim();
    app.names = app.mode === 'cpu'
      ? [n || CHARACTERS[chars[0]].name, 'Ordi']
      : ['J1 · ' + CHARACTERS[chars[0]].name, 'J2 · ' + CHARACTERS[chars[1]].name];
    app.fx = new R.Effects();
    app.snap = app.game.snapshot();
    app.paused = false;
    app.resultShown = false;
    $('pause-restart').classList.remove('hidden');
    show('game');
  }

  function stepLocal() {
    const g = app.game;
    g.setInput(0, playerBits(0));
    if (app.mode === 'cpu') g.setInput(1, app.brain.think(g, 1));
    else g.setInput(1, playerBits(1));
    g.tick();
    const snap = g.snapshot();
    app.fx.handleEvents(snap.events, snap, app.names, sfx);
    app.fx.update();
    app.snap = snap;
    checkResult();
  }

  function checkResult() {
    const snap = app.snap;
    if (!snap) return;
    if (snap.phase === 'matchover' && snap.pt > 90 && !app.resultShown) {
      app.resultShown = true;
      app.rematchVotes = [false, false];
      $('rematch-btn').disabled = false;
      $('result-status').textContent = '';
      show('result');
    }
  }

  // ---------------------------------------------------------------------------
  // Réseau
  // ---------------------------------------------------------------------------
  // Transport : serveur Node (WebSocket) s'il répond, sinon pair-à-pair WebRTC
  let transportKind = null;
  function detectTransport() {
    if (transportKind) return Promise.resolve(transportKind);
    if (location.protocol === 'file:') return Promise.resolve(transportKind = 'p2p');
    return fetch('health', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (transportKind = j && j.transport === 'ws' ? 'ws' : 'p2p'))
      .catch(() => (transportKind = 'p2p'));
  }

  function connect(onOpen) {
    if (app.ws && app.ws.readyState === 1) { onOpen(); return; }
    $('online-status').textContent = 'Connexion…';
    detectTransport().then((kind) => {
      const ws = kind === 'ws'
        ? new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host)
        : window.DogP2P.connect();
      app.ws = ws;
      ws.onopen = () => { $('online-status').textContent = ''; onOpen(); };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        onNet(msg);
      };
      ws.onclose = () => {
        const wasOnline = app.mode === 'online' && app.screen !== 'menu' && app.screen !== 'online';
        app.ws = null;
        if (wasOnline) {
          toast(ws.lostReason === 'host-left' ? 'L\'hôte a quitté la partie.' : 'Connexion perdue.');
          leaveToMenu();
        } else {
          $('online-status').textContent = 'Connexion impossible.';
        }
      };
    });
  }

  function send(msg) { if (app.ws && app.ws.readyState === 1) app.ws.send(JSON.stringify(msg)); }
  function sendPick(ready) { send({ t: 'pick', char: app.sel.picks[app.slot], ready }); }

  setInterval(() => { if (app.ws && app.ws.readyState === 1) send({ t: 'ping', ts: performance.now() }); }, 2000);

  function onNet(msg) {
    switch (msg.t) {
      case 'joined':
        app.slot = msg.slot;
        app.code = msg.code;
        if (app.screen === 'game' || app.screen === 'result' || app.screen === 'pause' || app.screen === 'select') {
          // retour en attente (adversaire parti)
        }
        app.queue = [];
        app.snap = null;
        app.netStarted = false;
        showWait(msg.quick);
        break;
      case 'lobby':
        app.lobby = msg;
        if (msg.players[0] && msg.players[1]) {
          if (app.screen === 'wait') enterSelect();
          else if (app.screen === 'select') {
            const other = 1 - app.slot;
            app.sel.picks[other] = msg.players[other].pick;
            app.sel.ready[other] = msg.players[other].ready;
            app.sel.ready[app.slot] = msg.players[app.slot].ready;
            updateSelectUI();
          }
        }
        break;
      case 'start':
        app.chars = msg.chars;
        app.alts = [false, msg.chars[0] === msg.chars[1]];
        app.names = msg.names.map((n, i) => n || CHARACTERS[msg.chars[i]].name);
        app.fx = new R.Effects();
        app.queue = [];
        app.snap = null;
        app.netStarted = false;
        app.resultShown = false;
        app.lastSent = -1;
        app.paused = false;
        $('pause-restart').classList.add('hidden');
        show('game');
        break;
      case 's':
        app.queue.push(msg.s);
        if (app.queue.length > 30) app.queue.splice(0, app.queue.length - 30);
        break;
      case 'rematch': {
        app.rematchVotes = msg.votes;
        const other = msg.votes[1 - app.slot];
        $('result-status').textContent = msg.votes[app.slot]
          ? 'En attente de l\'adversaire…'
          : other ? 'Ton adversaire veut une revanche !' : '';
        break;
      }
      case 'select':
        enterSelect();
        break;
      case 'opponentLeft':
        toast('Ton adversaire a quitté la partie.');
        break;
      case 'error':
        toast(msg.msg);
        $('online-status').textContent = msg.msg;
        break;
      case 'pong':
        app.ping = Math.round(performance.now() - msg.ts);
        break;
    }
  }

  function showWait(quick) {
    $('wait-title').textContent = quick ? 'Match rapide' : 'Salon privé';
    $('wait-code').textContent = app.code;
    const link = `${location.origin}${location.pathname}?salon=${app.code}`;
    $('wait-link').value = link;
    $('wait-hint').textContent = quick
      ? 'Recherche d\'un adversaire… Tu peux aussi partager ce code :'
      : 'Envoie ce code (ou le lien) à ton adversaire :';
    show('wait');
  }

  function stepOnline() {
    // Tampon anti-gigue : on consomme environ un instantané par tick
    if (!app.netStarted) {
      if (app.queue.length >= 2) app.netStarted = true;
      else return false;
    }
    if (!app.queue.length) return false;
    const snap = app.queue.shift();
    app.fx.handleEvents(snap.events, snap, app.names, sfx);
    app.fx.update();
    app.snap = snap;
    checkResult();
    return true;
  }

  function sendInputs() {
    if (app.mode !== 'online' || app.screen === 'menu') return;
    const b = (app.screen === 'game' || app.screen === 'result') ? playerBits(app.slot) : 0;
    if (b !== app.lastSent) {
      app.lastSent = b;
      send({ t: 'i', b });
    }
  }

  function leaveToMenu() {
    if (app.ws && app.mode === 'online') send({ t: 'leave' });
    app.game = null;
    app.snap = null;
    app.queue = [];
    app.mode = null;
    app.paused = false;
    show('menu');
  }

  // ---------------------------------------------------------------------------
  // Boutons
  // ---------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) { sfx.unlock(); sfx.click(); onAction(btn.dataset.action); }
    const chip = e.target.closest('[data-level]');
    if (chip) {
      app.cpuLevel = parseFloat(chip.dataset.level);
      try { localStorage.setItem('dogfight.cpuLevel', String(app.cpuLevel)); } catch (err) { /* ignore */ }
      for (const c of document.querySelectorAll('[data-level]')) c.classList.toggle('active', c === chip);
    }
  });

  // Mode aventure 3D : chargé à la demande (Three.js n'alourdit pas le jeu de combat)
  let adventureLoading = false;
  function startAdventure(coop, coopHost, level) {
    if (adventureLoading || app.mode === 'adventure') { if (coop) coop.link.close(); if (coopHost) coopHost.close(); return; }
    adventureLoading = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    app.mode = 'adventure';
    show('adventure');
    const LV = { 1: ['Le Parc des Toutous', 'Niveau 1'], 2: ['La Forêt des Moustaches', 'Niveau 2'], 3: ['Port-Croquette', 'Niveau 3 · la grande ville'], 4: ['Les Îles du Ciel', 'Niveau 4 · parcours à plusieurs'] }[level || 1] || ['Aventure', ''];
    if (window.AppLoader) { window.AppLoader.show(LV[0], coop ? 'On rejoint le monde de ton ami…' : LV[1]); window.AppLoader.progress(0.12, 'Chargement de l\'aventure…'); }
    import('./adventure/game.js').then((mod) => {
      adventureLoading = false;
      return mod.start({
        sfx,
        coop,
        coopHost,
        level: level || 1,
        onExit: () => { app.mode = null; show('menu'); },
      });
    }).catch((err) => {
      adventureLoading = false;
      if (coop) coop.link.close();
      if (coopHost) coopHost.close();
      console.error(err);
      if (window.AppLoader) window.AppLoader.hide();
      toast('Impossible de charger l\'aventure : ' + err.message, 5000);
      app.mode = null;
      show('menu');
    });
  }

  // ---------------------------------------------------------------------------
  // Aventure à deux (coop.js)
  // ---------------------------------------------------------------------------
  // Profil du joueur (gardé sur l'appareil) : prénom, chien, couleur, trésors ramassés
  const COLORS = ['#ff7a3c', '#3ca8ff', '#7ad83c', '#ffcc2a', '#c86aff', '#ff6ab0'];
  // les copains (à partir du 3e joueur ; les 2 premiers sont Ainu et Matcha)
  const EXTRAS = [['giorgio', 'Giorgio', 'carlin beige'], ['django', 'Django', 'carlin noir'], ['cayla', 'Cayla', 'petite yorkshire'], ['neo', 'Neo', 'petit yorkshire'], ['ashton', 'Ashton', 'yorkshire moyen']];
  function loadProfile() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('dogfight.profile') || '{}'); } catch (e) { /* ignore */ }
    return { name: p.name || '', kind: p.kind === 'matcha' ? 'matcha' : 'ainu', extra: EXTRAS.some(e => e[0] === p.extra) ? p.extra : 'giorgio', color: (p.color | 0) % COLORS.length, total: p.total || 0 };
  }
  function saveProfile(pr) {
    try {
      const old = JSON.parse(localStorage.getItem('dogfight.profile') || '{}');
      localStorage.setItem('dogfight.profile', JSON.stringify(Object.assign(old, { name: pr.name, kind: pr.kind, extra: pr.extra, color: pr.color })));
    } catch (e) { /* ignore */ }
  }
  let profile = loadProfile();
  function renderProfile() {
    $('coop-name').value = profile.name;
    for (const b of document.querySelectorAll('.kpick')) b.classList.toggle('active', b.dataset.action === 'coop-kind-' + profile.kind);
    $('coop-extras').innerHTML = EXTRAS.map(([k, n, d]) => `<button class="hbtn kpick extra${k === profile.extra ? ' active' : ''}" data-action="coop-extra-${k}" title="${n}, ${d}">${n}</button>`).join('');
    $('coop-colors').innerHTML = COLORS.map((c, i) => `<button class="cswatch${i === profile.color ? ' active' : ''}" data-action="coop-color-${i}" style="--c:${c}" aria-label="Couleur ${i + 1}"></button>`).join('');
    const code = window.AdvCoop && window.AdvCoop.savedCode();
    $('coop-mycode').textContent = code ? `Ton monde : code ${code}` + (profile.total ? ` · tu as ramassé ${profile.total} trésors` : '') : 'Tes amis le retrouveront toujours avec le même code.';
  }
  $('coop-name').addEventListener('input', () => { profile.name = $('coop-name').value.trim().slice(0, 12); saveProfile(profile); });
  function readyProfile() {
    profile.name = ($('coop-name').value || '').trim().slice(0, 12);
    if (!profile.name) { $('coop-status').textContent = 'Écris ton prénom d\'abord !'; $('coop-name').focus(); return null; }
    saveProfile(profile);
    return { name: profile.name, kind: profile.kind, extra: profile.extra, color: profile.color };
  }

  // Deux étapes : 1. qui es-tu ? (prénom, chien) 2. rejoindre un ami ou ouvrir son monde
  let coopInviteCode = '', coopEditing = false;
  function coopStep(id) { for (const k of ['coop-step1', 'coop-step2', 'coop-invite']) $(k).classList.toggle('hidden', k !== id); }
  function coopReset(status) {
    $('coop-choose').classList.remove('hidden');
    $('coop-wait').classList.add('hidden');
    $('coop-status').textContent = status || '';
    profile = loadProfile();
    renderProfile();
    const me = `Tu es <b>${escapeHtml(profile.name)}</b> avec ${profile.kind === 'matcha' ? 'Matcha' : 'Ainu'}`;
    $('coop-me').innerHTML = me; $('coop-me2').innerHTML = me;
    if (coopInviteCode) { $('coop-code').value = coopInviteCode; $('coop-invite-btn').textContent = `Rejoindre le monde ${coopInviteCode} ▶`; }
    coopStep(!profile.name || coopEditing ? 'coop-step1' : coopInviteCode ? 'coop-invite' : 'coop-step2');
  }
  function coopStart(link, level, pr) {
    if (app.screen !== 'coop') { link.close(); return; }
    coopInviteCode = '';
    coopReset();
    startAdventure({ link, isHost: false, profile: pr }, null, level);
  }
  let coopSession = null, coopLevel = 1;
  function coopHost() {
    const pr = readyProfile();
    if (!pr) return;
    $('coop-choose').classList.add('hidden');
    $('coop-wait').classList.remove('hidden');
    $('coop-show-code').textContent = '····';
    $('coop-link').value = '';
    $('coop-status').textContent = '';
    $('coop-go').disabled = true;
    coopSession = null;
    openWorld(pr, null);
  }
  /** Ouvre un monde (le sien si code est vide) ; si un ami le garde déjà, on le rejoint. */
  function openWorld(pr, code, noTaken) {
    $('coop-choose').classList.add('hidden');
    $('coop-wait').classList.remove('hidden');
    $('coop-wait-status').textContent = code ? 'On ouvre le monde ' + code + '…' : 'Tes amis (jusqu\'à 5) peuvent arriver quand ils veulent, même en pleine partie !';
    window.AdvCoop.host(pr, {
      onTaken: (c) => {
        $('coop-wait-status').textContent = 'Ton monde est déjà ouvert par un ami : on te connecte…';
        window.AdvCoop.join(c, {
          onReady: (link, level) => coopStart(link, level, pr),
          onEmpty: () => openWorld(pr, code, true),
          onError: () => openWorld(pr, code, true),
        });
      },
      onCode: (code, session) => {
        coopSession = session;
        session.level = coopLevel;
        $('coop-show-code').textContent = code;
        $('coop-go').disabled = false;
        const q = new URLSearchParams(location.search).get('peer');
        $('coop-link').value = location.origin + location.pathname + '?coop=' + code + (q ? '&peer=' + q : '');
        // QR code : l'ami dans la même pièce le flashe avec l'appareil photo
        try {
          const qr = window.qrcode(0, 'M'); qr.addData($('coop-link').value); qr.make();
          $('coop-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + '<small>Ton ami flashe ce code avec son téléphone</small>';
        } catch (e) { $('coop-qr').innerHTML = ''; }
        // si un ami arrive avant qu'on ait lancé, on démarre tout de suite
        session.onJoin = () => coopGo();
        // le monde d'un ami : on y entre directement, au niveau où il était
        if (!session.own) coopGo();
      },
      onError: (msg) => coopReset(msg),
    }, { code: code || undefined, noTaken, maxTries: 8 });
    if (code) {
      const lv = window.AdvCoop.worldLevel(code);
      if (lv) { coopLevel = lv; for (const b of document.querySelectorAll('.lvpick')) b.classList.toggle('active', b.dataset.action === 'coop-lv-' + lv); }
    }
  }
  function coopGo() {
    const ses = coopSession;
    if (!ses || app.screen !== 'coop') return;
    coopSession = null;
    ses.onJoin = null;
    coopReset();
    startAdventure(null, ses, ses.level || coopLevel);
  }
  function coopJoin() {
    const pr = readyProfile();
    if (!pr) return;
    const code = $('coop-code').value.trim().toUpperCase();
    if (code.length !== 4) { $('coop-status').textContent = 'Le code fait 4 lettres.'; return; }
    $('coop-status').textContent = 'Connexion au monde ' + code + '…';
    window.AdvCoop.join(code, {
      onReady: (link, level) => coopStart(link, level, pr),
      onError: (msg) => coopReset(msg),
      // personne n'est dans ce monde en ce moment : on peut l'ouvrir soi-même
      onEmpty: (c) => {
        if (window.AdvCoop.hasCopy(c)) { openWorld(pr, c === window.AdvCoop.savedCode() ? null : c); return; }
        coopReset();
        $('coop-status').innerHTML = `Personne n'est dans le monde <b>${c}</b> en ce moment. <button class="hbtn cbtn" data-action="coop-open-${c}">L'ouvrir quand même</button>`;
      },
    });
  }

  // les sauvegardes ne doivent pas être effacées par le navigateur (Safari vide un site non visité depuis 7 jours)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {}); } catch (e) { /* ignore */ }

  function playerName() { return (app.name || '').trim() || 'Anonyme'; }

  function onAction(a) {
    goFullscreen(); // sur tactile, chaque bouton remet en plein écran si on en est sorti
    if (a.startsWith('coop-open-')) { const pr = readyProfile(); if (pr) openWorld(pr, a.slice(10)); return; }
    if (a.startsWith('par-') && parentsAction(a)) return;
    switch (a) {
      case 'online': app.mode = 'online'; show('online'); $('online-status').textContent = ''; break;
      case 'cpu': app.mode = 'cpu'; enterSelect(); break;
      case 'local': app.mode = 'local'; enterSelect(); break;
      case 'adventure': show('levels'); break;
      case 'ctl-adv': case 'ctl-fight':
        for (const id of ['ctl-adv', 'ctl-fight']) $(id).classList.toggle('hidden', id !== a);
        for (const b of document.querySelectorAll('.ctl-tabs .btn')) b.classList.toggle('on', b.dataset.action === a);
        break;
      case 'level-1': startAdventure(null, null, 1); break;
      case 'level-2': startAdventure(null, null, 2); break;
      case 'level-3': startAdventure(null, null, 3); break;
      case 'level-4': startAdventure(null, null, 4); break;
      case 'mode-promenade': case 'mode-aventure': case 'mode-defi':
        try { localStorage.setItem('dogfight.mode', a.slice(5)); } catch (e) { /* ignore */ }
        renderModes();
        break;
      case 'coop-lv-1': case 'coop-lv-2': case 'coop-lv-3': case 'coop-lv-4': {
        coopLevel = +a.slice(-1);
        for (const b of document.querySelectorAll('.lvpick')) b.classList.toggle('active', b.dataset.action === a);
        if (coopSession) coopSession.level = coopLevel;
        break;
      }
      case 'coop': show('coop'); coopReset(); break;
      case 'install': promptInstall(); break;
      case 'coop-host': coopHost(); break;
      case 'coop-kind-ainu': case 'coop-kind-matcha': profile.kind = a === 'coop-kind-ainu' ? 'ainu' : 'matcha'; saveProfile(profile); renderProfile(); break;
      case 'coop-join': coopJoin(); break;
      case 'coop-next': if (readyProfile()) { coopEditing = false; coopReset(); } break;
      case 'coop-edit': coopEditing = true; coopReset(); break;
      case 'coop-extra-giorgio': case 'coop-extra-django': case 'coop-extra-cayla': case 'coop-extra-neo': case 'coop-extra-ashton':
        profile.extra = a.slice('coop-extra-'.length); saveProfile(profile); renderProfile(); break;
      case 'coop-color-0': case 'coop-color-1': case 'coop-color-2': case 'coop-color-3': case 'coop-color-4': case 'coop-color-5':
        profile.color = +a.slice(-1); saveProfile(profile); renderProfile(); break;
      case 'coop-cancel': window.AdvCoop.cancel(); coopSession = null; coopReset(); break;
      case 'coop-go': coopGo(); break;
      case 'coop-back': window.AdvCoop.cancel(); coopSession = null; coopInviteCode = ''; coopEditing = false; show('menu'); break;
      case 'coop-copy': {
        // le partage du téléphone (SMS, WhatsApp…), sinon on copie le lien
        const inp = $('coop-link'), url = inp.value, code = $('coop-show-code').textContent;
        const copy = () => {
          inp.select();
          (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
            .then(() => toast('Lien copié ! Colle-le dans un message à ton ami.', 2200))
            .catch(() => { document.execCommand('copy'); toast('Lien copié !', 1500); });
        };
        if (navigator.share) navigator.share({ title: 'Matcha & Ainu', text: `Viens jouer avec moi dans mon monde (code ${code}) !`, url }).catch((e) => { if (!e || e.name !== 'AbortError') copy(); });
        else copy();
        break;
      }
      case 'controls': show('controls'); break;
      case 'album': renderAlbum(); show('album'); break;
      case 'niche': if (window.Niche) window.Niche.open($('niche-root')); show('niche'); break;
      case 'profiles': renderPlayers(); show('profiles'); break;
      case 'parents': window.ParentGate.open(() => { renderParents(); show('parents'); }); break;
      case 'player-save': savePlayer(); break;
      case 'player-cancel': editPlayer(null); break;
      case 'player-delete': if (app.editing && app.editing !== 'new' && confirm('Supprimer ce joueur et toute sa progression ?')) { window.Profiles.remove(app.editing); renderPlayers(); } break;
      case 'combat-menu': {
        const open = $('combat-panel').classList.toggle('hidden') === false;
        document.querySelector('.combat-toggle').setAttribute('aria-expanded', open);
        document.querySelector('.combat-box').classList.toggle('open', open);
        break;
      }
      case 'fullscreen': break; // déjà traité par goFullscreen()
      case 'back': app.mode = null; show('menu'); break;
      case 'quick': connect(() => send({ t: 'quick', name: playerName() })); break;
      case 'create': connect(() => send({ t: 'create', name: playerName() })); break;
      case 'join': {
        const code = $('join-code').value.trim().toUpperCase();
        if (code.length < 2 || code.length > 4) { toast('Le code fait 4 caractères.'); return; }
        connect(() => send({ t: 'join', code, name: playerName() }));
        break;
      }
      case 'copy': {
        const inp = $('wait-link');
        inp.select();
        (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject())
          .then(() => toast('Lien copié !', 1500))
          .catch(() => { document.execCommand('copy'); toast('Lien copié !', 1500); });
        break;
      }
      case 'leave': send({ t: 'leave' }); app.mode = 'online'; show('online'); break;
      case 'select-back':
        if (app.mode === 'online') { send({ t: 'leave' }); show('online'); }
        else if (app.mode === 'local' && app.sel.active === 1) { app.sel.active = 0; app.sel.ready[0] = false; updateSelectUI(); }
        else { app.mode = null; show('menu'); }
        break;
      case 'ready': confirmSelect(); break;
      case 'resume': app.paused = false; show('game'); break;
      case 'restart': if (app.game) startLocal(app.chars); break;
      case 'quit': leaveToMenu(); break;
      case 'rematch':
        if (app.mode === 'online') { send({ t: 'rematch' }); $('rematch-btn').disabled = true; }
        else startLocal(app.chars);
        break;
      case 'reselect':
        if (app.mode === 'online') send({ t: 'reselect' });
        else enterSelect();
        break;
    }
  }

  $('mute').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.unlock();
    $('mute').textContent = sfx.toggleMute() ? '🔇' : '🔊';
  });
  $('mute').textContent = sfx.muted ? '🔇' : '🔊';

  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') onAction('join'); });

  // ---------------------------------------------------------------------------
  // Clavier
  // ---------------------------------------------------------------------------
  function typingInField(e) {
    return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  }

  window.addEventListener('keydown', (e) => {
    if (typingInField(e)) return;
    sfx.unlock();
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);

    if (e.code === 'KeyM') { $('mute').textContent = sfx.toggleMute() ? '🔇' : '🔊'; return; }
    if (e.code === 'F2') { app.debug = !app.debug; return; }

    if (app.screen === 'select') { selectKey(e.code); return; }

    if (e.code === 'Escape') { togglePause(); return; }
    if (app.screen === 'game' || app.screen === 'result') onInputEvent();
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (app.screen === 'game' || app.screen === 'result') onInputEvent();
  });

  window.addEventListener('blur', () => { held.clear(); onInputEvent(); });

  // Appliqué immédiatement pour ne jamais perdre un appui bref
  function onInputEvent() {
    if (app.mode === 'online') sendInputs();
    else if (app.game && !app.paused) {
      app.game.setInput(0, playerBits(0));
      if (app.mode === 'local') app.game.setInput(1, playerBits(1));
    }
  }

  // ---------------------------------------------------------------------------
  // Boucle principale
  // ---------------------------------------------------------------------------
  updateFullscreenUi();
  if (IS_TOUCH) {
    T.onChange = () => { if (app.screen === 'game') onInputEvent(); };
    $('pause-btn').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  }
  // Débloque le son au premier contact (exigence des navigateurs mobiles)
  window.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

  function updateTouchHud() {
    if (!IS_TOUCH || app.screen !== 'game' || !app.snap) return;
    const me = app.mode === 'online' ? app.slot : 0;
    const f = app.snap.fighters[me];
    T.setSuperReady(!!f && f.meter >= C.METER_MAX);
  }

  let last = performance.now();
  let acc = 0;
  let netAcc = 0;

  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (app.screen === 'adventure') { requestAnimationFrame(frame); return; }
    const inGame = app.screen === 'game' || app.screen === 'pause' || app.screen === 'result';

    if (inGame && app.mode === 'online') {
      sendInputs();
      netAcc += dt;
      let steps = 0;
      while (netAcc >= STEP && steps < 4) {
        if (!stepOnline()) { netAcc = Math.min(netAcc, STEP); break; }
        netAcc -= STEP;
        steps++;
      }
      // Rattrapage si le tampon grossit trop
      while (app.queue.length > 4) stepOnline();
    } else if (inGame && app.game) {
      if (!app.paused) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) { stepLocal(); acc -= STEP; steps++; }
        if (steps === 5) acc = 0;
      }
    } else {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) { stepDemo(); acc -= STEP; steps++; }
      if (steps === 5) acc = 0;
    }

    // Rendu
    if (inGame && app.snap) {
      R.drawScene(ctx, app.snap, {
        fx: app.fx, names: app.names, alts: app.alts, paused: app.paused,
        extra: app.mode === 'online' ? { ping: app.ping } : null,
        debug: app.debug, game: app.game, touch: IS_TOUCH,
      });
    } else if (inGame) {
      ctx.fillStyle = '#120a1c';
      ctx.fillRect(0, 0, canvas.width, R.H);
      R.textOutlined(ctx, 'SYNCHRONISATION...', canvas.width / 2, R.H / 2, 8, '#fff');
    } else if (app.demoSnap) {
      R.drawScene(ctx, app.demoSnap, { fx: app.demoFx, noHud: true });
    }

    if (app.screen === 'select') drawPreviews(Math.floor(now / STEP));
    updateTouchHud();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------------------
  // Lien d'invitation ?salon=CODE
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const invite = (params.get('salon') || '').toUpperCase();
  const coopInvite = (params.get('coop') || '').toUpperCase();
  if (coopInvite) {
    show('coop');
    coopInviteCode = coopInvite;
    coopReset(profile.name ? '' : `Tu es invité dans le monde ${coopInvite} ! Dis-nous qui tu es :`);
    history.replaceState(null, '', location.pathname + (params.get('peer') ? '?peer=' + params.get('peer') : ''));
  } else if (params.get('menu') === 'coop') {
    // raccourci « Monde partagé » de l'appli installée
    show('coop');
    coopReset();
    history.replaceState(null, '', location.pathname);
  }
  if (invite && PS.hideCombat) history.replaceState(null, '', location.pathname);   // combat caché par les parents
  else if (invite) {
    app.mode = 'online';
    show('online');
    $('join-code').value = invite;
    $('online-status').textContent = `Invitation au salon ${invite} : clique sur « Rejoindre ».`;
    history.replaceState(null, '', location.pathname);
  }

  // ---------------------------------------------------------------------------
  // Appli installable : bouton « Installer » (Android) et service worker (hors-ligne)
  // ---------------------------------------------------------------------------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de bandeau automatique : on propose notre bouton discret
    installEvt = e;
    $('install-btn').classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => { installEvt = null; $('install-btn').classList.add('hidden'); });
  function promptInstall() {
    if (!installEvt) return;
    const e = installEvt;
    installEvt = null;
    $('install-btn').classList.add('hidden');
    e.prompt();
    if (e.userChoice) e.userChoice.catch(() => {});
  }
  if ('serviceWorker' in navigator) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (!(local && params.has('nosw'))) {
      const register = () => navigator.serviceWorker.register('sw.js').catch(() => { /* hors HTTPS, navigation privée… */ });
      if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
    } else {
      // développement : ?nosw retire aussi un service worker déjà installé
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // L'écran de chargement du démarrage s'efface quand l'accueil est prêt
  {
    const img = new Image(); img.src = 'img/duo.png';
    const ready = Promise.all([new Promise(r => { img.onload = img.onerror = r; }), document.fonts ? document.fonts.ready : null]);
    let gone = false;
    const done = () => { if (gone || app.mode === 'adventure') return; gone = true; if (window.AppLoader) window.AppLoader.hide(); };
    if (window.AppLoader) window.AppLoader.progress(0.6, '');
    ready.then(() => setTimeout(done, 350));
    setTimeout(done, 4000);
  }
})();
