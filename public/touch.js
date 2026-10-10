/*
 * Dogfight — commandes tactiles (téléphone / tablette).
 *
 * - Joystick flottant sur la moitié gauche : il apparaît sous le pouce.
 *   Haut = sauter, bas = s'accroupir, gauche/droite = avancer/reculer (reculer = garde).
 * - 4 boutons à droite : légère, lourde, spéciale, super.
 *
 * Expose window.DogTouch = { bits(), setVisible(bool), setSuperReady(bool), onChange }.
 */
(function () {
  'use strict';
  const IN = window.DogGame.IN;

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  const root = document.getElementById('touch');
  const zone = document.getElementById('stick-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  // Distances en pixels d'écran, proportionnelles à la taille des boutons
  let DEAD_X = 10, DEAD_Y = 16, MAX_R = 36;
  let HOME = { x: 110, y: 280 };
  function measure() {
    const b = Math.min(92, Math.max(54, window.innerHeight * 0.17));
    MAX_R = b * 0.55; DEAD_X = b * 0.16; DEAD_Y = b * 0.26;
    const left = Math.max(12, window.innerWidth * 0.02);
    HOME = { x: left + b * 1.0, y: window.innerHeight - b * 1.05 };
    if (origin === null) placeBase(HOME);
  }

  let stickId = null, origin = null, stickBits = 0;
  const buttonBits = new Map(); // pointerId → bit
  const api = { isTouch, onChange: null };

  // Le joystick travaille directement en pixels d'écran
  function toStage(ev) { return { x: ev.clientX, y: ev.clientY }; }

  function placeBase(p) {
    base.style.left = p.x + 'px';
    base.style.top = p.y + 'px';
  }

  function moveKnob(dx, dy) {
    const d = Math.hypot(dx, dy);
    const k = d > MAX_R ? MAX_R / d : 1;
    knob.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k)}px)`;
  }

  function changed() { if (api.onChange) api.onChange(); }

  function updateStick(p) {
    const dx = p.x - origin.x, dy = p.y - origin.y;
    moveKnob(dx, dy);
    let b = 0;
    if (dx > DEAD_X) b |= IN.RIGHT;
    if (dx < -DEAD_X) b |= IN.LEFT;
    if (dy < -DEAD_Y) b |= IN.UP;
    if (dy > DEAD_Y) b |= IN.DOWN;
    // Le joystick suit le pouce s'il dépasse la limite (plus confortable)
    const d = Math.hypot(dx, dy);
    if (d > MAX_R * 1.6) {
      origin = { x: p.x - dx / d * MAX_R * 1.6, y: p.y - dy / d * MAX_R * 1.6 };
      placeBase(origin);
    }
    if (b !== stickBits) { stickBits = b; changed(); }
  }

  function releaseStick() {
    stickId = null;
    origin = null;
    base.classList.remove('active');
    placeBase(HOME);
    moveKnob(0, 0);
    if (stickBits) { stickBits = 0; changed(); }
  }

  zone.addEventListener('pointerdown', (ev) => {
    if (stickId !== null) return;
    ev.preventDefault();
    stickId = ev.pointerId;
    zone.setPointerCapture(ev.pointerId);
    origin = toStage(ev);
    placeBase(origin);
    base.classList.add('active');
    moveKnob(0, 0);
  });
  zone.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== stickId) return;
    ev.preventDefault();
    updateStick(toStage(ev));
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(t, (ev) => { if (ev.pointerId === stickId) releaseStick(); });
  }

  for (const btn of root.querySelectorAll('.tbtn')) {
    const bit = IN[btn.dataset.bit];
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      btn.setPointerCapture(ev.pointerId);
      buttonBits.set(ev.pointerId, bit);
      btn.classList.add('down');
      if (navigator.vibrate) navigator.vibrate(12);
      changed();
    });
    const up = (ev) => {
      if (!buttonBits.has(ev.pointerId)) return;
      buttonBits.delete(ev.pointerId);
      if (![...buttonBits.values()].includes(bit)) btn.classList.remove('down');
      changed();
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }

  // Empêche le menu contextuel (appui long) et le zoom par double-tap
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  api.bits = () => {
    let b = stickBits;
    for (const v of buttonBits.values()) b |= v;
    return b;
  };

  api.setVisible = (v) => {
    root.classList.toggle('hidden', !v);
    if (!v) {
      releaseStick();
      buttonBits.clear();
      for (const btn of root.querySelectorAll('.tbtn')) btn.classList.remove('down');
    }
  };

  let superReady = false;
  api.setSuperReady = (v) => {
    if (v === superReady) return;
    superReady = v;
    root.querySelector('.tbtn.super').classList.toggle('ready', v);
  };

  window.addEventListener('resize', measure);
  measure();
  if (isTouch) document.documentElement.classList.add('touch');
  window.DogTouch = api;
})();
