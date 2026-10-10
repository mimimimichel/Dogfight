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
    for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
    const el = $('screen-' + screen);
    if (el) el.classList.remove('hidden');
    const playing = screen === 'game';
    if (IS_TOUCH) {
      T.setVisible(playing);
      $('pause-btn').classList.toggle('hidden', !playing);
    }
  }

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
  document.addEventListener('fullscreenchange', () => { updateFullscreenUi(); fit(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFullscreenUi(); fit(); });

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

  function playerName() { return (app.name || '').trim() || 'Anonyme'; }

  function onAction(a) {
    goFullscreen(); // sur tactile, chaque bouton remet en plein écran si on en est sorti
    switch (a) {
      case 'online': app.mode = 'online'; show('online'); $('online-status').textContent = ''; break;
      case 'cpu': app.mode = 'cpu'; enterSelect(); break;
      case 'local': app.mode = 'local'; enterSelect(); break;
      case 'controls': show('controls'); break;
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
  if (invite) {
    app.mode = 'online';
    show('online');
    $('join-code').value = invite;
    $('online-status').textContent = `Invitation au salon ${invite} : clique sur « Rejoindre ».`;
    history.replaceState(null, '', location.pathname);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
