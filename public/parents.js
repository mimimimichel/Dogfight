/*
 * Matcha & Ainu — coin des parents : réglages communs à l'appareil, porte parentale,
 * minuteur doux de temps de jeu et temps joué de la semaine.
 *
 * Script classique, chargé avant main.js. Expose :
 *  - window.ParentSettings : get(), set({...}), micAllowed, netlog, timerMin, hideCombat
 *  - window.ParentGate     : open(siOk) — appui long de 3 s, puis un petit calcul
 *  - window.ParentTimer    : tick(dt, paused, partie) appelé à chaque image par l'aventure
 *
 * Tout reste sur l'appareil (stockage local) ; 'dogfight.parents' n'est volontairement
 * pas rangé par joueur (voir profiles.js) : c'est le réglage de la famille.
 */
(function () {
  'use strict';
  const KEY = 'dogfight.parents', PLAY_KEY = 'dogfight.parents.play', SESSION_KEY = 'dogfight.parents.session';
  const DEFAULTS = { timerMin: 0, hideCombat: true, mic: true, netlog: true };
  const TIMERS = [0, 20, 30, 45, 60];
  const BREAK_MS = 60 * 60 * 1000;   // une pause d'une heure : nouvelle séance
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------
  let settings = Object.assign({}, DEFAULTS, read(KEY) || {});
  if (!TIMERS.includes(settings.timerMin)) settings.timerMin = 0;

  window.ParentSettings = {
    TIMERS,
    get: () => Object.assign({}, settings),
    set(patch) {
      settings = Object.assign({}, settings, patch || {});
      write(KEY, settings);
      try { window.dispatchEvent(new CustomEvent('parentsettings', { detail: this.get() })); } catch (e) { /* ignore */ }
      return this.get();
    },
    get micAllowed() { return settings.mic !== false; },
    get netlog() { return settings.netlog !== false; },
    get timerMin() { return settings.timerMin | 0; },
    get hideCombat() { return settings.hideCombat !== false; },
  };

  // ---------------------------------------------------------------------------
  // Temps de jeu : minutes par jour (7 derniers jours) et séance en cours
  // ---------------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  let session = read(SESSION_KEY);
  if (!session || typeof session.used !== 'number' || Date.now() - (session.at || 0) > BREAK_MS) session = { used: 0, extra: 0, at: Date.now() };
  let pending = 0, flushT = 0;   // secondes pas encore écrites (on n'écrit pas à chaque image)

  function flush() {
    session.at = Date.now();
    write(SESSION_KEY, session);
    if (pending <= 0) return;
    const play = read(PLAY_KEY) || {}, today = dayKey(new Date());
    play[today] = Math.round(((play[today] || 0) + pending / 60) * 100) / 100;
    pending = 0;
    // on ne garde que les 7 derniers jours
    const keep = new Set(week().map(d => d.key));
    for (const k of Object.keys(play)) if (!keep.has(k)) delete play[k];
    write(PLAY_KEY, play);
  }
  /** Les 7 derniers jours (le plus ancien d'abord) : { key, label, min }. */
  function week() {
    const play = read(PLAY_KEY) || {}, out = [], now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), k = dayKey(d);
      out.push({ key: k, label: i === 0 ? 'Auj.' : DAYS[d.getDay()], min: (play[k] || 0) + (i === 0 ? pending / 60 : 0) });
    }
    return out;
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // ---------------------------------------------------------------------------
  // Porte parentale : appui long de 3 secondes, puis un calcul (pas de mot de passe)
  // ---------------------------------------------------------------------------
  let gate = null;
  function closeGate() {
    if (!gate) return;
    gate.el.remove();
    window.removeEventListener('keydown', gate.onKey, true);
    window.removeEventListener('keyup', gate.onKey, true);
    gate = null;
  }
  function openGate(onOk, onCancel) {
    closeGate();
    const el = document.createElement('div');
    el.className = 'pg-veil';
    el.innerHTML = `<div class="pg-card" role="dialog" aria-modal="true" aria-label="Porte parentale">
      <h3>👪 Réservé aux parents</h3>
      <div class="pg-step pg-hold-step">
        <p>Maintiens le bouton appuyé 3 secondes.</p>
        <button class="pg-hold" type="button"><i></i><span>Maintenir</span></button>
      </div>
      <div class="pg-step pg-math-step hidden">
        <p class="pg-q"></p>
        <div class="pg-ans" aria-live="polite"></div>
        <div class="pg-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="del" aria-label="Effacer">⌫</button><button type="button" data-k="0">0</button><button type="button" data-k="ok" class="ok">OK</button></div>
      </div>
      <button class="pg-cancel" type="button">Annuler</button>
    </div>`;
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const g = gate = { el, a: 0, b: 0, ans: '' };
    const newQuestion = () => {
      g.a = 3 + Math.floor(Math.random() * 7); g.b = 3 + Math.floor(Math.random() * 7); g.ans = '';
      $('.pg-q').textContent = `${g.a} × ${g.b} = ?`;
      $('.pg-ans').textContent = '';
    };
    // appui long : la jauge se remplit en 3 s, lâcher trop tôt la vide
    const hold = $('.pg-hold'), bar = $('.pg-hold i');
    let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; bar.style.width = '0%'; hold.classList.remove('on'); };
    // lâcher : si les 3 s sont passées (appareil lent, image en retard), c'est bon quand même
    const release = () => { if (t0 && performance.now() - t0 >= 3000) loop(); else stop(); };
    const loop = () => {
      if (!t0) return;
      const p = Math.min(1, (performance.now() - t0) / 3000);
      bar.style.width = (p * 100) + '%';
      if (p < 1) { raf = requestAnimationFrame(loop); return; }
      stop();
      if ($('.pg-hold-step').classList.contains('hidden')) return;
      $('.pg-hold-step').classList.add('hidden');
      $('.pg-math-step').classList.remove('hidden');
      newQuestion();
    };
    const begin = (e) => { if (e) e.preventDefault(); if (t0) return; t0 = performance.now(); hold.classList.add('on'); raf = requestAnimationFrame(loop); };
    hold.addEventListener('pointerdown', (e) => { try { hold.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } begin(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(ev, release);
    hold.addEventListener('contextmenu', (e) => e.preventDefault());
    const key = (k) => {
      if (k === 'del') g.ans = g.ans.slice(0, -1);
      else if (k === 'ok') {
        if (g.ans && +g.ans === g.a * g.b) { closeGate(); if (onOk) onOk(); return; }
        el.querySelector('.pg-card').classList.remove('shake'); void el.offsetWidth; el.querySelector('.pg-card').classList.add('shake');
        newQuestion(); return;
      } else if (g.ans.length < 3) g.ans += k;
      $('.pg-ans').textContent = g.ans;
    };
    $('.pg-pad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    $('.pg-cancel').addEventListener('click', () => { closeGate(); if (onCancel) onCancel(); });
    // clavier : chiffres, Retour arrière, Entrée ; Espace/Entrée maintenus pour l'appui long
    g.onKey = (e) => {
      if (gate !== g) return;
      e.stopPropagation();
      const math = !$('.pg-math-step').classList.contains('hidden');
      if (e.type === 'keyup') { if (!math && (e.code === 'Space' || e.code === 'Enter')) release(); return; }
      if (e.code === 'Escape') { closeGate(); if (onCancel) onCancel(); return; }
      if (!math) { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) begin(e); return; }
      if (/^[0-9]$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Enter') key('ok');
      e.preventDefault();
    };
    window.addEventListener('keydown', g.onKey, true);
    window.addEventListener('keyup', g.onKey, true);
  }
  window.ParentGate = { open: openGate, close: closeGate, isOpen: () => !!gate };

  // ---------------------------------------------------------------------------
  // Minuteur doux : quand le temps est écoulé, on attend un moment calme
  // (pas de dialogue, pas en l'air), puis Matcha va faire la sieste
  // ---------------------------------------------------------------------------
  let nap = null, dueT = 0;
  const limit = () => (settings.timerMin > 0 ? (settings.timerMin + (session.extra || 0)) * 60 : Infinity);
  /** Moment calme dans la partie : pas de dialogue, de cinématique ni de saut en cours. */
  function calm(adv, paused) {
    if (!adv) return true;
    const P = adv.me || adv.player;
    return !paused && !adv.dialog && !adv.cine && !adv.photoMode && !adv.portalBusy && (!P || P.grounded !== false);
  }
  function showNap(adv) {
    if (adv && !adv.guest && adv.persist) { try { adv.persist(); } catch (e) { /* ignore */ } }
    flush();
    const el = document.createElement('div');
    el.className = 'pg-veil pg-nap';
    el.innerHTML = `<div class="pg-card pg-nap-card" role="dialog" aria-modal="true">
      <div class="pg-zzz" aria-hidden="true">z<i>z</i><b>z</b></div>
      <img src="img/duo.png" alt="">
      <h3>Matcha baille… 🥱</h3>
      <p>C'est l'heure de la sieste ! Tu as bien joué.</p>
      <button class="pg-bye" type="button">À demain !</button>
      <button class="pg-more" type="button">👪 Parents : +10 minutes</button>
    </div>`;
    document.body.appendChild(el);
    nap = { el, adv };
    if (adv) adv.paused = true;
    if (adv && adv.sfx && adv.sfx.duck) { try { adv.sfx.duck(true, 'nap'); } catch (e) { /* ignore */ } }
    el.querySelector('.pg-bye').addEventListener('click', () => {
      const a = nap && nap.adv;
      closeNap();
      // même sortie que « Menu principal » dans la pause (la partie est déjà sauvegardée)
      if (a && !a.disposed) { try { a.persist(); } catch (e) { /* ignore */ } a.dispose(); a.onExit(); }
    });
    el.querySelector('.pg-more').addEventListener('click', () => openGate(() => {
      const a = nap && nap.adv;
      extend(10);
      closeNap();
      // la partie reprend (sauf si le menu pause était ouvert)
      if (a && !a.disposed && a.dom && a.dom.overlay.classList.contains('hidden')) { a.paused = false; a.lastFrame = performance.now(); }
    }));
  }
  function closeNap() {
    if (!nap) return;
    const a = nap.adv;
    if (a && a.sfx && a.sfx.duck) { try { a.sfx.duck(false, 'nap'); } catch (e) { /* ignore */ } }
    nap.el.remove(); nap = null; dueT = 0;
  }
  function extend(min) {
    // on prolonge à partir de maintenant, pas du minuteur déjà dépassé
    if (settings.timerMin > 0) session.extra = Math.max(session.extra || 0, session.used / 60 - settings.timerMin) + min;
    flush();
  }

  window.ParentTimer = {
    /** À chaque image de l'aventure : compte le temps joué, déclenche la sieste au bon moment. */
    tick(dt, paused, adv) {
      if (!(dt > 0) || (adv && adv.disposed)) return;
      if (nap) { if (adv && nap.adv !== adv) nap.adv = adv; if (adv) adv.paused = true; return; }
      if (!paused) {
        session.used += dt; pending += dt;
        if ((flushT += dt) > 15) { flushT = 0; flush(); }
      }
      if (session.used < limit()) { dueT = 0; return; }
      dueT += dt;
      // le temps est écoulé : moment calme, ou au plus tard 45 s plus tard
      if (calm(adv, paused) || dueT > 45) showNap(adv);
    },
    calm,
    extend,
    /** Nouvelle séance (le compteur repart de zéro). */
    reset() { session = { used: 0, extra: 0, at: Date.now() }; dueT = 0; flush(); },
    used: () => session.used,
    remaining: () => Math.max(0, limit() - session.used),
    week() { return week(); },
    napOpen: () => !!nap,
    flush,
  };
})();
