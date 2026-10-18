/*
 * Matcha & Ainu — scènes cinématiques (intro de l'histoire, ouverture de chaque chapitre).
 * Les images sont calculées en direct par le moteur du jeu : la caméra fait des
 * travellings dans le vrai décor, des acteurs (Capitaine, chats, médailles…)
 * sont posés le temps de la scène, avec bandes noires, sous-titres et fondus.
 *
 * Un plan : { d (s), from, to, look, lookTo (positions [x, y, z]), fov,
 *   say: { who, text } (sous-titre ; sans « who » : voix du conteur),
 *   title: [grand, petit], night (0..1), enter(c), update(c, k, dt) }
 */
import * as THREE from '../vendor/three.module.min.js';
import { speak, stopVoice } from './voices.js';

const ease = (k) => k * k * (3 - 2 * k);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class Cinema {
  constructor(game, shots, onDone) {
    this.game = game; this.shots = shots; this.onDone = onDone;
    this.i = -1; this.t = 0; this.actors = []; this.done = false;
    this.fov0 = game.camera.fov;
    const el = this.el = document.createElement('div');
    el.className = 'adv-cine';
    el.innerHTML = `<div class="cine-night"></div><div class="cine-bar top"></div><div class="cine-bar bot"></div>
      <div class="cine-title"><b></b><small></small></div>
      <div class="cine-cap"><span class="who"></span><span class="txt"></span></div>
      <div class="cine-fade"></div><button class="cine-skip" type="button">Passer ⏭</button>`;
    game.dom.root.appendChild(el);
    game.dom.root.classList.add('cine-on');
    this.$ = (s) => el.querySelector(s);
    // (la gare et les arrêts de train font partie du décor : ils restent dans l'histoire)
    this.hidden = [];
    this.$('.cine-skip').addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    this.$('.cine-skip').addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); this.finish(); }, { passive: false });
    this.next();
  }

  /** Ajoute un objet à la scène pour la durée de la cinématique. */
  add(o) { this.game.scene.add(o); this.actors.push(o); return o; }

  next() {
    this.i++; this.t = 0;
    if (this.i >= this.shots.length) { this.finish(); return; }
    const s = this.shot = this.shots[this.i];
    this.from = V(s.from); this.to = V(s.to || s.from);
    this.look = V(s.look); this.lookTo = V(s.lookTo || s.look);
    if (s.enter) s.enter(this);
    const cap = this.$('.cine-cap');
    if (s.say) {
      cap.classList.toggle('narr', !s.say.who);
      this.$('.who').textContent = s.say.who || '';
      this.full = s.say.text; this.shown = 0;
      // la voix : le plan dure au moins le temps de la réplique, le texte s'écrit à son rythme
      const dur = speak(this.game.sfx, s.say.who || '', s.say.text);
      this.voiced = dur > 0;
      if (this.voiced) s.d = Math.max(s.d, dur + 0.8);
      this.rate = this.voiced ? Math.max(18, s.say.text.length / Math.max(0.5, dur * 0.85)) : 38;
      this.$('.txt').textContent = '';
      cap.classList.add('on');
    } else { cap.classList.remove('on'); this.full = null; }
    const ti = this.$('.cine-title');
    if (s.title) { ti.querySelector('b').textContent = s.title[0]; ti.querySelector('small').textContent = s.title[1] || ''; ti.classList.add('on'); if (this.game.sound) this.game.sound('lantern'); }
    else ti.classList.remove('on');
  }

  update(dt) {
    if (this.done) return;
    const s = this.shot;
    this.t += dt;
    const k = Math.min(1, this.t / s.d);
    if (s.update) s.update(this, k, dt);
    // texte qui s'écrit, avec la petite voix du personnage
    if (this.full && this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * this.rate);
      const after = Math.floor(this.shown);
      if (after !== before) {
        this.$('.txt').textContent = this.full.slice(0, after);
        if (!this.voiced && s.say.who && after % 3 === 0 && this.game.voice) this.game.voice(s.say.who);
      }
    }
    // fondus au noir entre les plans, nuit
    const fade = s.fadeIn === false ? 0 : Math.max(0, 1 - this.t / 0.45);
    const out = s.fadeOut === false ? 0 : Math.max(0, 1 - (s.d - this.t) / 0.45);
    this.$('.cine-fade').style.opacity = Math.max(fade, out).toFixed(3);
    this.$('.cine-night').style.opacity = ((s.night || 0) * 0.62).toFixed(3);
    if (this.t >= s.d) this.next();
  }

  /** Place la caméra (appelé par le moteur juste avant de dessiner). */
  applyCamera() {
    if (this.done || !this.shot) return;
    const k = ease(Math.min(1, this.t / this.shot.d)), cam = this.game.camera;
    cam.position.lerpVectors(this.from, this.to, k);
    cam.lookAt(new THREE.Vector3().lerpVectors(this.look, this.lookTo, k));
    const fov = this.shot.fov || 50;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  /** Distance de mise au point : ce que la caméra regarde. */
  focusDist() {
    if (!this.shot) return 10;
    const k = Math.min(1, this.t / this.shot.d);
    return this.game.camera.position.distanceTo(new THREE.Vector3().lerpVectors(this.look, this.lookTo, k * k * (3 - 2 * k)));
  }

  /** Touche ou bouton « Passer ». */
  skip() { this.finish(); }

  finish() {
    if (this.done) return;
    this.done = true;
    stopVoice(this.game.sfx);
    for (const o of this.actors) this.game.scene.remove(o);
    this.actors = [];
    for (const o of this.hidden) o.visible = true;
    if (this.cleanup) this.cleanup();
    const cam = this.game.camera;
    cam.fov = this.fov0; cam.updateProjectionMatrix();
    this.el.remove();
    this.game.dom.root.classList.remove('cine-on');
    this.game.camInit = false;
    const cb = this.onDone; this.onDone = null;
    if (cb) cb();
  }
}
