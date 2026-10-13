/*
 * Dogfight Aventure — moteur du mode aventure 3D (niveau 1).
 *
 * Plates-formes 3D façon « collect-a-thon » : le duo Ainu + Matcha explore
 * l'île, ramasse 100 os dorés et récupère 5 Médailles Patounes.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L, setLevel, LEVELS } from './current.js';

// Mondes déjà visités : les portails ne mènent qu'à eux
const VISITED_KEY = 'dogfight.visited';
function visitedLevels() {
  const out = new Set();
  try {
    for (const id of JSON.parse(localStorage.getItem(VISITED_KEY) || '[]')) out.add(+id);
    for (const id in LEVELS) if (localStorage.getItem(LEVELS[id].SAVE_KEY)) out.add(+id);   // parties d'avant
  } catch (e) { /* ignore */ }
  return out;
}
function markVisited(id) {
  try { const v = visitedLevels(); v.add(id); localStorage.setItem(VISITED_KEY, JSON.stringify([...v])); } catch (e) { /* ignore */ }
}
import * as F from './forest.js';
import * as C from './city.js';
import * as SK from './sky.js';
import { voiceFor } from './voice.js';
import * as M from './models.js';
import * as W from './world.js';
import * as T from './toon.js';
import { Post } from './post.js';
import * as RT from './realtex.js';
import { Cinema } from './cinema.js';
import { loadVoices, speak, stopVoice, prefetchVoices } from './voices.js';
import * as WR from './wardrobe.js';
import { storyShots } from './story.js';
import { buildSeasons } from './seasons.js';
import * as N from './npcs.js';

const STEP = 1 / 60;
const GRAVITY = 32;
const RUN_SPEED = 8.5;
const JUMP_V = 12;
const DOUBLE_JUMP_V = 10.5;
const GLIDE_FALL = 2.2;
const DASH_SPEED = 19;
const DASH_TIME = 0.3;
const ATTACK_TIME = 0.45;
const PLAYER_R = 0.55;
const STEP_UP = 0.6;
const SOLID = new Set(['trunk', 'tree', 'rock']);
const CAM_BLOCK = new Set(['trunk', 'tree', 'stump']);
let MAX_HEARTS = 3;
/**
 * Modes de jeu pour tous les âges :
 *  promenade : pour les petits — on ne perd pas de cœurs, on plane tout seul, un chemin d'étincelles guide ;
 *  aventure  : le jeu normal ;
 *  defi      : pour les grands — 2 cœurs, les chutes coûtent un cœur.
 */
export const MODES = { promenade: 'Promenade', aventure: 'Aventure', defi: 'Défi' };
export function getMode() { try { const m = localStorage.getItem('dogfight.mode'); return MODES[m] ? m : 'aventure'; } catch (e) { return 'aventure'; } }

// Monde partagé : couleurs des joueurs, prénoms, profil gardé sur l'appareil
export const DOG_COLORS = ['#ff7a3c', '#3ca8ff', '#7ad83c', '#ffcc2a', '#c86aff', '#ff6ab0'];
const dogName = (k) => (k === 'duo' ? 'Ainu & Matcha' : k === 'matcha' ? 'Matcha' : k === 'ainu' ? 'Ainu' : (M.FRIENDS[k] ? M.FRIENDS[k].name : k));
const cleanName = (n) => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 14);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PROFILE_KEY = 'dogfight.profile';
function addToProfile(n) {
  try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); p.total = (p.total || 0) + n; localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}
// Le monde est semi-persistant : la progression reste, mais ce qu'on ramasse repousse
const REGROW_MS = 8 * 60 * 1000;     // os / croquettes
const CRATE_MS = 10 * 60 * 1000;     // caisses (sauf celles à médaille)
const CAT_RESPAWN = 90;              // secondes de jeu pour les chats errants

/**
 * Fusionne deux sauvegardes du même monde (deux joueurs ont joué avec des copies
 * différentes) : on garde tout ce que chacun a trouvé.
 */
function mergeSave(a, b) {
  for (const k of Object.keys(b || {})) {
    const x = a[k], y = b[k];
    if (Array.isArray(x) && Array.isArray(y)) {
      const seen = new Set(x.map(v => JSON.stringify(v)));
      for (const v of y) { const j = JSON.stringify(v); if (!seen.has(j)) { seen.add(j); x.push(v); } }
    } else if (x && y && typeof x === 'object' && typeof y === 'object') mergeSave(x, y);
    else if (typeof x === 'number' && typeof y === 'number') a[k] = Math.max(x, y);
    else if (typeof x === 'boolean' && typeof y === 'boolean') a[k] = x || y;
    else if (k === 'puppy') { const R = ['lost', 'follow', 'home']; if (R.indexOf(y) > R.indexOf(x)) a[k] = y; }
    else if (x === undefined) a[k] = y;
  }
  return a;
}

/** Tuiles de bois rouges (toit de la niche, rendu réaliste). */
function shingleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7a2a1e'; x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 12; row++) for (let i = -1; i < 9; i++) {
    const w = 32, px = i * w + (row % 2) * 16, py = row * 22;
    const v = 0.75 + ((row * 7 + i * 13) % 10) / 30;
    x.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(70 * v)},${Math.round(56 * v)})`;
    x.fillRect(px + 1, py, w - 2, 21);
    x.fillStyle = 'rgba(40,10,6,0.45)'; x.fillRect(px + 1, py + 18, w - 2, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.45, 0.45);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let micAsked = false;
// hôte : les amis dont la connexion vient de tomber (par identifiant de joueur) — s'ils
// reviennent, ils retrouvent leur chien et leur place au lieu d'en créer un nouveau
const ghosts = new Map();
/** Identifiant stable de ce joueur sur cet appareil (rangé dans son profil). */
function playerUid() {
  let id = null;
  try { id = localStorage.getItem('dogfight.profile.uid'); } catch (e) { /* ignore */ }
  if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); try { localStorage.setItem('dogfight.profile.uid', id); } catch (e) { /* ignore */ } }
  return id;
}
/** Secondes à attendre dans un portail avant de partir (seul : presque tout de suite). */
const PORTAL_WAIT = (n) => (n > 1 ? 3 : 0.8);   // on ne propose le micro qu'une fois par partie

/** Le prénom de l'enfant (profil « Qui joue ? » ou prénom du jeu à plusieurs), s'il est connu. */
function kidName() {
  let n = '';
  try { n = (JSON.parse(localStorage.getItem('dogfight.profile') || '{}').name || '').trim(); } catch (e) { /* ignore */ }
  if (!n && window.Profiles) { const c = window.Profiles.current(); if (c && !/^Joueur \d+$/.test(c.name)) n = c.name; }
  return n.slice(0, 16);
}
window.kidName = kidName;
// Mamie (modèle scanné) : redressement du buste (radians) et taille
const MAMIE_UPRIGHT = { x: -0.34, z: 0.13, neck: 0.14, head: 0.16 };
const MAMIE_SCALE = 1.25;
const medalWord = () => (L.ID === 3 ? 'Trophées' : L.ID === 4 ? 'Étoiles' : 'Médailles');
const collectWord = (long) => ({ 2: 'Croquettes', 3: long ? 'Pièces d\'or' : 'Pièces', 4: 'Pièces du ciel' })[L.ID] || (long ? 'Os dorés' : 'Os');
const NEXT_LEVEL = { 1: 'Niveau 2 : la Forêt des Moustaches', 2: 'Niveau 3 : Port-Croquette', 3: 'Niveau 4 : les Îles du Ciel' };

const isChild = (o, root) => { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

// ---------------------------------------------------------------------------
// Icônes vectorielles de l'interface
// ---------------------------------------------------------------------------
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".55" stop-color="#ffcf3a"/><stop offset="1" stop-color="#e89a10"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a94"/><stop offset="1" stop-color="#e0283a"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efff7a"/><stop offset="1" stop-color="#a8d020"/></linearGradient></defs>${body}</svg>`);
const ICONS = {
  bone: svg('<g transform="rotate(-35 32 32)"><g fill="#8a5200" stroke="#8a5200" stroke-width="6"><rect x="15" y="26" width="34" height="12" rx="4"/><circle cx="15" cy="25" r="7.5"/><circle cx="15" cy="39" r="7.5"/><circle cx="49" cy="25" r="7.5"/><circle cx="49" cy="39" r="7.5"/></g><g fill="url(#g)"><rect x="15" y="26" width="34" height="12" rx="4"/><circle cx="15" cy="25" r="7.5"/><circle cx="15" cy="39" r="7.5"/><circle cx="49" cy="25" r="7.5"/><circle cx="49" cy="39" r="7.5"/></g></g>'),
  medal: svg('<path d="M20 4h10l4 16H24zM34 4h10l-4 16H30z" fill="#3a8ae0" stroke="#1a4a90" stroke-width="2"/><circle cx="32" cy="40" r="20" fill="url(#g)" stroke="#8a5200" stroke-width="3"/><g fill="#c07a08"><ellipse cx="32" cy="45" rx="7" ry="6"/><circle cx="23" cy="36" r="3.4"/><circle cx="29" cy="31" r="3.4"/><circle cx="35" cy="31" r="3.4"/><circle cx="41" cy="36" r="3.4"/></g>'),
  heart: svg('<path d="M32 56 9 33a13 13 0 0 1 23-17 13 13 0 0 1 23 17z" fill="url(#r)" stroke="#7a0a18" stroke-width="3" stroke-linejoin="round"/><ellipse cx="20" cy="24" rx="5" ry="3.5" fill="#fff" opacity=".6" transform="rotate(-35 20 24)"/>'),
  heartEmpty: svg('<path d="M32 56 9 33a13 13 0 0 1 23-17 13 13 0 0 1 23 17z" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linejoin="round"/>'),
  coin: svg('<circle cx="32" cy="32" r="23" fill="#9a6a00"/><circle cx="32" cy="32" r="19" fill="url(#g)"/><circle cx="32" cy="32" r="13" fill="none" stroke="#c88a08" stroke-width="3"/><path d="M32 22v20M27 26h8a3 3 0 0 1 0 6h-6a3 3 0 0 0 0 6h8" fill="none" stroke="#a06a00" stroke-width="3" stroke-linecap="round"/><ellipse cx="24" cy="21" rx="5" ry="3" fill="#fff" opacity=".55"/>'),
  kibble: svg('<g fill="#8a5200"><circle cx="32" cy="32" r="22"/></g><circle cx="32" cy="32" r="18" fill="url(#g)"/><g fill="#c07a08"><circle cx="25" cy="27" r="3"/><circle cx="38" cy="25" r="2.6"/><circle cx="36" cy="38" r="3.2"/><circle cx="24" cy="39" r="2.4"/></g><ellipse cx="25" cy="22" rx="5" ry="3" fill="#fff" opacity=".55"/>'),
  ball: svg('<circle cx="32" cy="32" r="24" fill="url(#t)" stroke="#5a7000" stroke-width="3"/><path d="M12 20c10 6 10 18 0 24M52 20c-10 6-10 18 0 24" fill="none" stroke="#fff" stroke-width="3.5"/>'),
};

// ---------------------------------------------------------------------------
export async function start(opts) {
  opts = opts || {};
  setLevel(opts.level || 1);
  // écran de chargement (déjà affiché par le menu, ou quand on change de niveau en jeu)
  const LD = window.AppLoader;
  if (LD) {
    if (!LD.visible) LD.show(L.NAME, `Niveau ${L.ID}`);
    LD.progress(0.35, 'Les chiens se préparent…');
  }
  W.applySky(L.SKY);
  if (opts.sfx) opts.sfx.music('adv' + L.ID);     // l'ambiance musicale du niveau
  let style = null;
  try { style = localStorage.getItem('dogfight.style'); } catch (e) { /* ignore */ }
  // rendu réaliste : matières photographiées et ciel (chargés une seule fois)
  const photos = style !== 'toon' ? RT.preloadPhotos((k) => { if (LD) LD.progress(0.35 + k * 0.3, 'Les décors arrivent…'); }, L.ID) : null;
  const ultra = photos && RT.isUltra() ? RT.preloadUltra() : null;
  // personnages non joueurs réalistes (modèles gratuits CC-BY)
  const npcs = photos ? N.preloadNpcs(L.ID === 3 ? ['mamie', 'mamie2', 'biscotte', 'shiba', 'berger', 'bouledogue'] : ['mamie', 'mamie2', 'biscotte']) : null;
  await M.preloadDogs();
  if (photos) await photos;
  if (npcs) await npcs;
  await loadVoices();                                // voix des personnages (liste des répliques enregistrées)
  if (ultra) { if (LD) LD.progress(0.68, 'Les grands arbres arrivent…'); await ultra; }
  if (LD) {
    LD.progress(0.7, L.ID === 3 ? 'Construction de la ville…' : 'Construction du monde…');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // laisse l'écran se dessiner
  }
  const adv = new Adventure(opts);
  if (LD) { LD.progress(1, 'C\'est parti !'); setTimeout(() => LD.hide(), 300); }
  return adv;
}

class Adventure {
  constructor(opts) {
    this.sfx = opts.sfx || null;
    this.onExit = opts.onExit || (() => {});
    // Aventure à deux : { link, role: 'ainu' | 'matcha', isHost }
    this.coop = opts.coop || null;
    // Partie ouverte : l'hôte joue seul en attendant, l'autre rejoint quand il veut
    this.hostSession = opts.coopHost || null;
    this.guest = !!(this.coop && !this.coop.isHost);
    this.remoteIn = new Map();   // hôte : commandes reçues de chaque ami (par numéro de joueur)
    this.remotePressed = new Set();
    this.isTouch = document.documentElement.classList.contains('touch');
    this.t = 0;          // temps de jeu
    this.acc = 0;
    this.paused = false;
    this.dialog = null;
    this.freeze = 0;      // gel du joueur (célébrations)
    this.keys = new Set();
    this.pressed = new Set();
    this.stick = { x: 0, y: 0 };
    this.camInput = { dx: 0, dy: 0 };
    this.lastCamManual = -10;
    this.disposed = false;
    this.localBanner = (...a) => this.banner(...a);   // bandeau seulement sur cet écran (remplacé à plusieurs)

    this.setMode(getMode(), true);
    this.loadSave();
    this.buildDom();
    this.initThree();
    this.buildWorld();
    this.buildEntities();
    if (this.lite) {
      // ombres figées : seuls les éléments immobiles du décor en projettent
      const moving = [this.player.mesh, this.puppy.mesh, this.elevatorMesh, this.bonesI, ...(this.levelLogic ? this.levelLogic.moving : []),
        ...this.cats.map(c => c.mesh), ...this.medals.map(m => m.mesh), ...this.balls.map(b => b.mesh), ...this.crates.map(c => c.mesh)];
      for (const o of moving) if (o) o.traverse(k => { k.castShadow = false; });
    }
    // Style « dessin animé » (au choix dans la pause) : aplats de lumière + contours sombres.
    // Par défaut : rendu réaliste (lumière douce du ciel, reflets, pas de contours).
    const chars = [this.player.mesh, this.mamie, this.puppy.mesh, ...this.cats.map(c => c.mesh), ...(this.levelLogic ? this.levelLogic.chars : [])];
    const vista = this.vista.group;
    if (!this.realistic) T.toonify(this.scene);
    if (!this.realistic) for (const c of chars) T.outlineTree(c, 0.018, 0x1e120c);
    // grande ville sur téléphone : contours seulement sur les personnages (trop d'objets sinon)
    if (!this.realistic && !(this.lite && L.WORLD)) T.outlineTree(this.scene, 0.035, 0x2a1c14, (o) => {
      if (chars.some(c => c === o || isChild(o, c)) || isChild(o, vista)) return false;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      return o.geometry.boundingSphere.radius < 14;
    });
    this.bindInput();
    this.resize();
    this.makePortraits();
    this.buildMinimap();
    this.updateHud();

    window.__adv = this; // accès pour les tests
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));

    if (this.coop) this.initCoop();
    else if (this.hostSession) this.initHostSession();
    else this.beginLevel(!this.hasProgress());     // on arrive directement dans le monde (« Recommencer le niveau » est dans le menu pause)
  }

  // -------------------------------------------------------------------------
  // Sauvegarde
  // -------------------------------------------------------------------------
  emptySave() { return { bones: [], gone: {}, crateT: {}, visitors: [], medals: [], balls: [], crates: [], cats: [], lanterns: [], boss: false, puppy: L.ID === 1 ? 'lost' : 'home', intro: false, done: false, time: 0 }; }
  setMode(m, init) {
    this.mode = m;
    MAX_HEARTS = m === 'defi' ? 2 : 3;
    this.guide = m === 'promenade';
    try { localStorage.setItem('dogfight.mode', m); } catch (e) { /* ignore */ }
    if (init) return;
    for (const P of this.players) P.hearts = Math.min(P.hearts, MAX_HEARTS) || MAX_HEARTS;
    this.updateHud();
  }
  get easy() { return this.mode === 'promenade'; }

  /** Code du monde partagé où l'on joue (ou null en solo). */
  get worldCode() { return this.hostSession ? this.hostSession.code : (this.coop && this.coop.link && this.coop.link.code) || null; }
  /** Sa propre sauvegarde (solo et son monde), ou la copie du monde d'un ami. */
  get saveKey() {
    const code = this.worldCode, AC = window.AdvCoop;
    return !code || !AC || code === AC.savedCode() ? L.SAVE_KEY : AC.worldKey(code, L.ID);
  }
  loadSave() {
    this.save = this.emptySave();
    try {
      const code = this.worldCode;
      if (code && window.AdvCoop) localStorage.setItem(window.AdvCoop.worldKey(code, 'lv'), String(L.ID));
      const s = JSON.parse(localStorage.getItem(this.saveKey) || 'null');
      if (s) Object.assign(this.save, s);
      // anciennes sauvegardes : les os déjà ramassés repousseront
      if (s && !s.gone) { const now = Date.now(); for (const id of this.save.bones) this.save.gone[id] = now; }
    } catch (e) { /* ignore */ }
  }
  persist() { if (this.guest) return; this.writeSave(); }
  writeSave() { try { localStorage.setItem(this.saveKey, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }
  hasProgress() { const s = this.save; return s.intro && (s.bones.length || s.medals.length || s.balls.length); }

  // -------------------------------------------------------------------------
  // Interface (DOM)
  // -------------------------------------------------------------------------
  buildDom() {
    const root = document.createElement('div');
    root.id = 'adv';
    root.innerHTML = `
      <canvas id="adv-canvas"></canvas>
      <div class="adv-hud">
        <div class="adv-party">
          <div class="adv-portrait main"><img class="p-ainu" alt=""></div>
          <div class="adv-party-info">
            <div class="adv-name">Ainu <small>&amp; Matcha</small></div>
            <div class="adv-hearts"></div>
          </div>
          <div class="adv-portrait small"><img class="p-matcha" alt=""></div>
        </div>
        <div class="adv-right">
          <div class="adv-counts">
            <div class="adv-count"><img src="${L.ID === 2 ? ICONS.kibble : L.ID >= 3 ? ICONS.coin : ICONS.bone}" alt=""><span id="adv-bones">0</span><small>/100</small></div>
            <div class="adv-count"><img src="${ICONS.medal}" alt=""><span id="adv-medals">0</span><small>/${L.medals.length}</small></div>
            <div class="adv-count adv-balls hidden"><img src="${ICONS.ball}" alt=""><span id="adv-balls">0</span><small>/5</small></div>
          </div>
          <div class="adv-mapcol">
            <div class="adv-map"><canvas width="160" height="160"></canvas><span class="adv-north">N</span></div>
            <div class="adv-quest" role="button" aria-label="Où aller ?"><b><i class="qi">🐾</i> Quête</b><span></span></div>
          </div>
        </div>
      </div>
      <div class="adv-banner hidden"></div>
      <div class="adv-prompt hidden"></div>
      <div class="adv-dialog hidden"><div class="adv-dname"></div><div class="adv-dtext"></div><div class="adv-dnext">▼</div></div>
      <button class="adv-mic hidden" aria-label="Micro"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="9" y="3" width="6" height="11" rx="3" fill="#fff"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><path class="slash" d="M4 4 20 20" stroke="#ff6a5a" stroke-width="2.6" stroke-linecap="round"/></svg><span class="lbl"></span></button>
      <div class="adv-micask hidden"><b>🎤 Parler avec tes amis&nbsp;?</b><button data-m="yes">Activer le micro</button><button data-m="no" class="no">Plus tard</button></div>
      <button class="adv-saydog hidden" aria-label="Parler à Ainu"><span>🗣️</span><small>Dis-lui !</small></button>
      <button class="adv-pause" aria-label="Pause"><svg viewBox="0 0 20 20" width="18" height="18"><rect x="4" y="3" width="4" height="14" rx="1.5" fill="#fff"/><rect x="12" y="3" width="4" height="14" rx="1.5" fill="#fff"/></svg></button>
      <div class="adv-touch ${this.isTouch ? '' : 'hidden'}">
        <div class="adv-stick-zone"></div>
        <div class="adv-cam-zone"></div>
        <div class="adv-stick"><div class="adv-knob"></div></div>
        <button class="adv-btn jump" data-btn="jump"><svg viewBox="0 0 48 48"><path d="M24 8 12 22h8v14h8V22h8z" fill="currentColor"/><rect x="14" y="39" width="20" height="4" rx="2" fill="currentColor" opacity=".6"/></svg><span>Saut</span></button>
        <button class="adv-btn attack" data-btn="attack"><svg viewBox="0 0 48 48" fill="currentColor"><ellipse cx="24" cy="31" rx="9" ry="8"/><ellipse cx="12" cy="20" rx="4" ry="5"/><ellipse cx="19" cy="13" rx="4" ry="5"/><ellipse cx="29" cy="13" rx="4" ry="5"/><ellipse cx="36" cy="20" rx="4" ry="5"/></svg><span>Attaque</span></button>
        <button class="adv-btn dash" data-btn="dash"><svg viewBox="0 0 48 48" fill="currentColor"><path d="M10 12h6l10 12-10 12h-6l10-12z"/><path d="M24 12h6l10 12-10 12h-6l10-12z"/></svg><span>Charge</span></button>
        <button class="adv-btn bark" data-btn="bark"><span class="big">🐾</span><span>Ouaf !</span></button>
        <button class="adv-btn talk hidden" data-btn="talk"><svg viewBox="0 0 48 48" fill="currentColor"><path d="M8 10h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-9 8v-8H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z"/></svg><span>Parler</span></button>
      </div>
      <div class="adv-overlay hidden"></div>
      <div class="adv-fade"></div>`;
    document.body.appendChild(root);
    this.dom = {
      root,
      canvas: root.querySelector('#adv-canvas'),
      hearts: root.querySelector('.adv-hearts'),
      bones: root.querySelector('#adv-bones'),
      medals: root.querySelector('#adv-medals'),
      balls: root.querySelector('#adv-balls'),
      ballsBox: root.querySelector('.adv-balls'),
      banner: root.querySelector('.adv-banner'),
      prompt: root.querySelector('.adv-prompt'),
      dialog: root.querySelector('.adv-dialog'),
      dname: root.querySelector('.adv-dname'),
      dtext: root.querySelector('.adv-dtext'),
      overlay: root.querySelector('.adv-overlay'),
      fade: root.querySelector('.adv-fade'),
      touch: root.querySelector('.adv-touch'),
      stick: root.querySelector('.adv-stick'),
      knob: root.querySelector('.adv-knob'),
      talkBtn: root.querySelector('.adv-btn.talk'),
      map: root.querySelector('.adv-map canvas'),
      quest: root.querySelector('.adv-quest span'),
      pAinu: root.querySelector('.p-ainu'),
      pMatcha: root.querySelector('.p-matcha'),
    };
    root.querySelector('.adv-pause').addEventListener('click', () => this.togglePause());
    root.querySelector('.adv-quest').addEventListener('click', (e) => { e.stopPropagation(); this.showWay(); });
    // commandes vocales « Ainu, saute ! » (si le téléphone sait reconnaître la voix)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const sayBtn = root.querySelector('.adv-saydog');
    if (SR) sayBtn.addEventListener('click', (e) => { e.stopPropagation(); this.listenCommand(); });
    this.voiceCmdOn = () => { try { return !!SR && localStorage.getItem('dogfight.voicecmd') === '1'; } catch (e) { return false; } };
    sayBtn.classList.toggle('hidden', !this.voiceCmdOn());
    this.dom.mic = root.querySelector('.adv-mic');
    this.dom.mic.addEventListener('click', () => this.toggleMic());
    this.dom.micAsk = root.querySelector('.adv-micask');
    this.dom.micAsk.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.dom.micAsk.classList.add('hidden');
      if (b.dataset.m === 'yes') this.toggleMic();
    });
  }

  updateHud() {
    const s = this.save;
    // petit rebond du compteur qui vient d'augmenter, secousse des cœurs perdus, éclat de la quête qui change
    const bump = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const prev = this.hudPrev || {};
    const hp0 = this.player ? this.me.hearts : MAX_HEARTS;
    if (prev.bones !== undefined && s.bones.length > prev.bones) { bump(this.dom.bones.closest('.adv-count'), 'bump'); this.progressAt = this.t; }
    if (prev.medals !== undefined && s.medals.length > prev.medals) bump(this.dom.medals.closest('.adv-count'), 'bump');
    if (prev.hp !== undefined && hp0 < prev.hp) bump(this.dom.hearts, 'hurt');
    if (prev.hp !== undefined && hp0 > prev.hp) bump(this.dom.hearts, 'bump');
    this.hudPrev = { bones: s.bones.length, medals: s.medals.length, hp: hp0, quest: prev.quest };
    this.dom.bones.textContent = s.bones.length;
    this.dom.medals.textContent = s.medals.length;
    this.dom.balls.textContent = s.balls.length;
    this.dom.ballsBox.classList.toggle('hidden', !(s.balls.length > 0 && !s.medals.includes('m_balls')));
    const hp = this.player ? this.me.hearts : MAX_HEARTS;
    this.updatePortraits();
    this.dom.hearts.innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<img src="${i < hp ? ICONS.heart : ICONS.heartEmpty}" alt="">`).join('');
    let q;
    if (!s.intro) q = 'Parle à Mamie Labrador';
    else if (this.puppy && this.puppy.state === 'follow') q = 'Ramène Biscotte à Mamie';
    else if (s.medals.length < 5) q = `Trouve les Médailles Patounes (${s.medals.length}/5)`;
    else q = 'Tu as tout trouvé, bravo !';
    if (this.levelLogic && this.levelLogic.questText) q = this.levelLogic.questText() || q;
    if (this.dom.quest.textContent !== q) {
      this.dom.quest.textContent = q;
      const key = q.replace(/[\d:]/g, '');
      if (prev.quest !== undefined && prev.quest !== key) {
        bump(this.dom.quest.closest('.adv-quest') || this.dom.quest, 'flash');
        this.progressAt = this.t;
        if (this.easy) this.sayQuest();   // les petits : la quête est lue à voix haute
      }
      this.hudPrev.quest = key;
      const icon = [[/Mamie/, '👵'], [/Biscotte|chiot/i, '🐶'], [/[Mm]édaille|trophée/i, '🏅'], [/lanterne/i, '🏮'], [/kart|voiture|avion/i, '🏎️'], [/Capitaine|chat/i, '😼'], [/étoile/i, '⭐'], [/mission|livr/i, '📜'], [/bravo/i, '🎉']].find(([re]) => re.test(q));
      const qi = this.dom.root.querySelector('.adv-quest .qi'); if (qi) qi.textContent = icon ? icon[1] : '🐾';
    }
  }

  /** Portraits ronds d'Ainu et de Matcha, rendus une fois depuis leurs modèles 3D. */
  makePortraits() {
    this.portraits = {};
    const duo = M.buildDuo();
    this.portraits.ainu = this.portraitOf(duo, duo.userData.headFace, 2.1, 0.75);
    this.portraits.matcha = this.portraitOf(duo, duo.userData.mheadFace, 1.0, 0.35);
    if (this.portraits.ainu) this.dom.pAinu.src = this.portraits.ainu;
    if (this.portraits.matcha) this.dom.pMatcha.src = this.portraits.matcha;
  }

  /** Portrait rond d'un chien, rendu une fois depuis son modèle 3D. */
  portraitOf(root, target, dist, side) {
    const r = this.renderer, cv = r.domElement;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x9ad4ea);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a6a4a, 1.4));
    const l = new THREE.DirectionalLight(0xfff0d8, 2.4); l.position.set(2, 3, 4); sc.add(l);
    sc.add(root);
    root.updateMatrixWorld(true);
    let url = null;
    try {
      const p = new THREE.Vector3(); target.getWorldPosition(p);
      const cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.05, 50);
      cam.position.set(p.x + side, p.y + 0.05, p.z + dist); cam.lookAt(p.x, p.y - 0.02, p.z);
      r.render(sc, cam);
      const s = Math.min(cv.width, cv.height) * 0.9;
      const c = document.createElement('canvas'); c.width = c.height = 160;
      c.getContext('2d').drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, 160, 160);
      url = c.toDataURL('image/jpeg', 0.85);
    } catch (e) { /* pas de portrait : pas grave */ }
    sc.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return url;
  }

  /** En-tête : le portrait et le nom du chien joué sur cet écran. */
  updatePortraits() {
    if (!this.portraits || !this.player) return;
    const k = this.me.kind;
    if (this.dom.portraitKind === k) return;
    this.dom.portraitKind = k;
    let main = this.portraits[k === 'matcha' ? 'matcha' : 'ainu'];
    if (M.FRIENDS[k]) {
      if (!this.portraits[k]) { const m = M.FRIENDS[k].build(); T.toonify(m); this.portraits[k] = this.portraitOf(m, m.userData.mheadFace, 1.3, 0.45); }
      main = this.portraits[k];
    }
    if (main) this.dom.pAinu.src = main;
    const duo = k === 'duo';
    this.dom.root.querySelector('.adv-portrait.small').classList.toggle('hidden', !duo);
    this.dom.root.querySelector('.adv-name').innerHTML = duo ? 'Ainu <small>&amp; Matcha</small>' : `${dogName(k)}${this.party.size > 1 ? ` <small>${escapeHtml(this.me.name)}</small>` : ''}`;
  }

  /** Mini-carte : relief peint une fois, puis repères mis à jour en jeu. */
  buildMinimap() {
    const base = document.createElement('canvas'); base.width = base.height = 160;
    let x, img;
    // grand monde : la carte entière est peinte en grand, on n'en affiche qu'un morceau autour du joueur (radar)
    const R = L.WORLD ? L.WORLD / 2 : 75; // demi-côté couvert (unités du monde)
    if (L.WORLD) { base.width = base.height = 512; }
    const N = base.width;
    x = base.getContext('2d'); img = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i / N) * 2 * R - R, wz = (j / N) * 2 * R - R, h = L.heightAt(wx, wz);
      let c;
      if (h < -1.5) c = [38, 120, 190]; else if (h < 0) c = [70, 170, 210]; else if (h < 1) c = [236, 214, 160];
      else if (h > 9) c = [150, 190, 110]; else c = [96 + h * 4, 170 + h * 3, 70];
      if (W.onPath(wx, wz) && h > 0) c = [214, 196, 150];
      if (L.mapColor) { const mc = L.mapColor(wx, wz); if (mc) c = mc; }
      const k = (j * N + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = 'rgba(40,90,40,0.55)';
    for (const t of L.trees) { x.beginPath(); x.arc((t.x + R) / (2 * R) * N, (t.z + R) / (2 * R) * N, L.WORLD ? 1.6 : 2.4, 0, 7); x.fill(); }
    if (L.drawMap) L.drawMap(x, (wx) => (wx + R) / (2 * R) * N, N / (2 * R));
    x.fillStyle = '#ece6da';
    for (const co of L.colliders) {
      if (!co.map || co.type !== 'box') continue;
      x.fillStyle = co.map;
      x.fillRect((co.x - co.w / 2 + R) / (2 * R) * N, (co.z - co.d / 2 + R) / (2 * R) * N, co.w / (2 * R) * N, co.d / (2 * R) * N);
    }
    x.fillStyle = '#ece6da';
    for (const ru of L.ruins) if (ru.type !== 'arch') x.fillRect((ru.x + R) / (2 * R) * N - 1.5, (ru.z + R) / (2 * R) * N - 1.5, 3, 3);
    this.mapBase = base; this.mapR = R; this.mapT = 0;
  }

  drawMinimap() {
    const c = this.dom.map, x = c.getContext('2d'), N = c.width;
    let P, R = this.mapR;
    if (L.RADAR) {
      // radar : fenêtre de ±RADAR mètres autour du joueur, nord en haut
      const me = this.me, Rr = L.RADAR, B = this.mapBase, k = B.width / (2 * R);
      x.fillStyle = '#2a78c0'; x.fillRect(0, 0, N, N);
      x.drawImage(B, (me.pos.x - Rr + R) * k, (me.pos.z - Rr + R) * k, 2 * Rr * k, 2 * Rr * k, 0, 0, N, N);
      P = (wx, wz) => [(wx - me.pos.x + Rr) / (2 * Rr) * N, (wz - me.pos.z + Rr) / (2 * Rr) * N];
    } else {
      P = (wx, wz) => [(wx + R) / (2 * R) * N, (wz + R) / (2 * R) * N];
      x.drawImage(this.mapBase, 0, 0);
    }
    const dot = (wx, wz, col, rad, edge) => {
      let [px, py] = P(wx, wz);
      // repère hors du radar : collé au bord, dans sa direction
      if (L.RADAR && edge) { const cx = px - N / 2, cy = py - N / 2, m = Math.max(Math.abs(cx), Math.abs(cy)) / (N / 2 - 7); if (m > 1) { px = N / 2 + cx / m; py = N / 2 + cy / m; } }
      if (px < -6 || py < -6 || px > N + 6 || py > N + 6) return; x.fillStyle = '#3a2410'; x.beginPath(); x.arc(px, py, rad + 1.5, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); };
    for (const m of this.medals) if (m.mesh.visible) dot(m.def.x, m.def.z, '#ffd23a', 4);
    if (this.levelLogic && this.levelLogic.minimapMarks) for (const [mx, mz, col, rad, edge] of this.levelLogic.minimapMarks()) dot(mx, mz, col, rad, edge);
    dot(L.npcs.mamie.x, L.npcs.mamie.z, '#ff8a5a', 3.5);
    if (this.puppy.state !== 'home') dot(this.puppy.pos.x, this.puppy.pos.z, '#8ad0ff', 3.5);
    for (const g of this.pings || []) {
      const [px, py] = P(g.x, g.z), r = 4 + ((this.t - g.t0) * 10) % 9;
      x.strokeStyle = g.col; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, r, 0, 7); x.stroke();
      x.fillStyle = g.col; x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill();
    }
    for (const Q of this.players) {
      const [px, py] = P(Q.pos.x, Q.pos.z);
      const k = Q === this.me ? 1 : 0.75;
      x.save(); x.translate(px, py); x.rotate(-Q.yaw + Math.PI); x.scale(k, k);
      x.fillStyle = Q.kind === 'ainu' ? '#20e0e0' : '#9ae05a'; x.strokeStyle = '#0a3040'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, -9); x.lineTo(6.5, 7); x.lineTo(0, 3.5); x.lineTo(-6.5, 7); x.closePath(); x.stroke(); x.fill();
      x.restore();
    }
  }

  banner(text, sub, ms) {
    const b = this.dom.banner;
    b.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.remove('hidden');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), ms || 2200);
  }

  fade(on) { this.dom.fade.classList.toggle('on', on); }

  // -------------------------------------------------------------------------
  // Three.js
  // -------------------------------------------------------------------------
  initThree() {
    const touch = this.isTouch;
    // Mode « téléphone » : rendu allégé pour rester fluide sur les mobiles
    this.lite = touch;
    this.quality = { high: !touch, lite: touch };
    const r = new THREE.WebGLRenderer({ canvas: this.dom.canvas, antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer = r;
    // post-traitement « cinéma » (halo lumineux, étalonnage, vignettage) ; ?post=0 pour le couper
    this.post = new Post(r, touch ? 'lite' : 'high', L.GRADE);
    if (/[?&]post=0/.test(location.search)) this.post.enabled = false;
    this.scene = new THREE.Scene();
    const LT = Object.assign({ hemi: [0xd8ecff, 0xa87a4a, 0.7], sun: [0xfff1d6, 2.6], fog: [80, 230] }, L.LIGHT || {});
    this.scene.fog = new THREE.Fog(W.SKY.horizon.getHex(), LT.fog[0], LT.fog[1]);
    this.sky = W.buildSky(this.scene);
    let style = null;
    try { style = localStorage.getItem('dogfight.style'); } catch (e) { /* ignore */ }
    this.realistic = style !== 'toon';
    W.LOOK.real = this.realistic;
    if (this.realistic && RT.hasPhotos()) {
      // vrai ciel photographié : il éclaire aussi la scène (reflets, lumière douce)
      const im = RT.photoImage('sky');
      const tex = new THREE.Texture(im); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      // on tourne le ciel pour que son soleil soit là où le niveau le veut
      const want = W.SKY.sunDir, azWant = Math.atan2(want.z, want.x);
      const SUN_U = 0.596, SUN_EL = 0.84;                 // position du soleil sur la photo
      const phi = SUN_U * Math.PI * 2, azPhoto = Math.atan2(Math.sin(phi), -Math.cos(phi));
      const rot = azPhoto - azWant;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.rotation.y = rot; dome.renderOrder = -10; dome.frustumCulled = false;
      this.sky.visible = false;
      this.scene.add(dome);
      this.photoSky = dome;
      W.SKY.sunDir.set(Math.cos(SUN_EL) * Math.cos(azWant), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(azWant)).normalize();
      // brume : la couleur de l'horizon de la photo
      this.scene.fog.color.setRGB(0.70, 0.78, 0.88, THREE.SRGBColorSpace);
      const envScene = new THREE.Scene();
      const envDome = dome.clone(); envDome.material = dome.material.clone(); envDome.scale.setScalar(0.1);
      envScene.add(envDome);
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(envScene, 0.04, 0.1, 1000).texture;
      pm.dispose();
      this.scene.environment = this.envTex;
      // plus de contraste : soleil franc, ombres plus profondes (moins de lumière ambiante)
      // lumière de fin d'après-midi : soleil doré, ombres claires et un peu bleutées (lumière du ciel)
      this.scene.environmentIntensity = 0.62;
      LT.hemi = [0xcfe0ff, LT.hemi[1], LT.hemi[2] * 0.38];
      LT.sun = [0xffe2b4, LT.sun[1] * 1.25];
    } else if (this.realistic) {
      // lumière du ciel tout autour (reflets doux sur l'herbe, le pelage, l'or des os)
      const envScene = new THREE.Scene();
      W.buildSky(envScene);
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(envScene, 0.04, 0.1, 1000).texture;
      pm.dispose();
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.55;
      LT.hemi = [LT.hemi[0], LT.hemi[1], LT.hemi[2] * 0.55];
      LT.sun = [LT.sun[0], LT.sun[1] * 1.15];
    }
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1200);
    this.scene.add(new THREE.HemisphereLight(...LT.hemi));
    const sun = new THREE.DirectionalLight(...LT.sun);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    if (touch && L.WORLD) {
      // grand monde sur téléphone : ombres du décor recalculées quand on s'éloigne
      sun.shadow.mapSize.set(2048, 2048);
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.08;
      r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
      this.shadowFollow = true;
    } else if (touch) {
      // Sur téléphone : les ombres du décor sont calculées une seule fois pour
      // toute l'île (les personnages gardent leur ombre ronde sous les pattes).
      sun.shadow.mapSize.set(2048, 2048);
      sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0015;
      sun.shadow.normalBias = 0.08;
      sun.position.copy(W.SKY.sunDir).multiplyScalar(120);
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = true;
    } else {
      sun.shadow.mapSize.set(2048, 2048);
      sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 160;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
      sun.shadow.radius = 3;
    }
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.wind = { value: 0 };
    this.camYaw = L.START.yaw + Math.PI;
    this.camPitch = 0.38;
    this.camDist = 9;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    // Qualité adaptative : on baisse la résolution si l'appareil peine
    this.pixelScale = 1;
    this.perf = { t: 0, n: 0, checks: 0 };
    this.qualityStep = 0;
  }

  /** Remplace les matériaux mats par des matériaux plus simples (téléphones). */
  simplifyMaterials(root) {
    const cache = new Map();
    root.traverse(o => {
      const m = o.material;
      if (!o.isMesh || !m || !m.isMeshStandardMaterial || m.metalness > 0.3 || m.roughness < 0.5) return;
      if (!cache.has(m)) {
        const l = new THREE.MeshLambertMaterial({
          color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
          side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
          polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        });
        if (m.onBeforeCompile) l.onBeforeCompile = m.onBeforeCompile;
        cache.set(m, l);
      }
      o.material = cache.get(m);
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const maxRatio = this.isTouch ? 1.1 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio) * this.pixelScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Vise 60 images/s : on mesure par tranches de 2 s et, tant que ça ne suit
   * pas, on renonce à un effet de plus (du moins visible au plus visible).
   */
  adaptQuality(dt) {
    const p = this.perf;
    // (les premières secondes ne comptent pas : le téléphone prépare encore les effets)
    if (this.paused || this.dialog || (p.skip = (p.skip || 0) + dt) < 3) { p.t = 0; p.n = 0; return; }
    p.t += dt; p.n++;
    if (p.t < 2) return;
    const fps = p.n / p.t;
    p.t = 0; p.n = 0;
    if (fps >= 55) return;
    const steps = [
      () => { this.post.shaftsOn = false; },                                    // rayons de soleil
      () => { if (this.pixelScale > 0.9) { this.pixelScale = 0.9; this.needResize = true; } else return false; },
      () => { this.post.bloomOn = false; },                                     // halo lumineux
      () => { if (this.grass) this.grass.count = Math.floor(this.grass.count * 0.6); },
      () => { if (this.pixelScale > 0.8) { this.pixelScale = 0.8; this.needResize = true; } else return false; },
      () => { this.post.enabled = false; this.post.dispose(); },               // plus de post-traitement
      () => { if (this.pixelScale > 0.7) { this.pixelScale = 0.7; this.needResize = true; } else return false; },
      () => { this.sun.castShadow = false; },
    ];
    while (this.qualityStep < steps.length) { const r = steps[this.qualityStep++](); if (r !== false) break; }
  }

  // -------------------------------------------------------------------------
  // Le monde
  // -------------------------------------------------------------------------
  buildWorld() {
    const sc = this.scene;
    const q0 = this.quality;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();

    if (!L.NO_TERRAIN) W.buildTerrain(sc, q0);
    this.water = L.NO_TERRAIN ? null : W.buildWater(sc, sc.fog);
    this.grass = W.buildGrass(sc, q0, this.wind);
    W.buildFlowers(sc, q0);
    W.buildTrees(sc, q0);
    this.fallTex = this.makeWaterfallTexture();
    this.pedestalBalls = [];
    if (L.ID === 1) this.buildParc();
    else if (L.ID === 3) this.levelLogic = C.buildCity(this);
    else if (L.ID === 4) this.levelLogic = SK.buildSky(this);
    else this.levelLogic = F.buildForest(this, { THREE, M, W, T });

    // Nuages et papillons
    this.clouds = W.buildPaintedClouds(sc);
    this.vista = W.buildVista(sc, this.fallTex);
    W.buildRuins(sc);
    W.buildPaths(sc);
    this.crystals = W.buildCrystals(sc);
    this.butterflies = W.buildButterflies(sc);

    this.buildPortals();

    // Panneaux
    for (const s of L.signs) {
      const m = M.buildSign(s.text);
      m.position.set(s.x, L.heightAt(s.x, s.z), s.z);
      m.rotation.y = Math.atan2(L.START.x - s.x, L.START.z - s.z) * 0.3;
      sc.add(m);
    }
  }

  /**
   * Portails magiques vers les autres niveaux : un tourbillon de lumière ;
   * on s'en approche et on appuie sur « ENTRER ».
   */
  buildPortals() {
    const list = (L.PORTALS || []).slice();
    if (!L.PORTALS && L.ID !== 1) {
      // portail de retour vers le Parc, à côté du départ, sur un sol libre
      for (const [dx, dz] of [[-6, 4], [6, 4], [5, -2], [-5, -2], [7, 0]]) {   // de préférence derrière le départ (pas devant la vue)
        const x = L.START.x + dx, z = L.START.z + dz, h = L.heightAt(x, z);
        if (Math.abs(h - L.START.y) > 0.8 || (L.near ? L.near(x, z, 1.5) : L.colliders).some(c => !c.off && L.inside(c, x, z, 1.3))) continue;
        list.push({ x, z, to: 1 }); break;
      }
    }
    const NAMES = { 1: 'Le Parc des Toutous', 2: 'La Forêt des Moustaches', 3: 'Port-Croquette', 4: 'Les Îles du Ciel' };
    const COLS = { 1: [0x3affa0, 0x0a4a3a], 2: [0x4ab0ff, 0x10206a], 3: [0xffb04a, 0x5a2008], 4: [0xc070ff, 0x2a0a5a] };
    markVisited(L.ID);
    const visited = visitedLevels();
    this.portals = list.map(p => {
      const [c1, c2] = COLS[p.to] || COLS[1];
      const y = L.heightAt(p.x, p.z);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; uniform vec3 uC1, uC2; varying vec2 vUv;
          void main() {
            vec2 p = vUv * 2.0 - 1.0; p.y *= 0.92;
            float r = length(p), a = atan(p.y, p.x);
            float sw = sin(a * 3.0 + r * 11.0 - uTime * 5.0) * 0.5 + 0.5;
            float sw2 = sin(a * 5.0 - r * 7.0 + uTime * 3.0) * 0.5 + 0.5;
            float rim = smoothstep(0.62, 0.9, r) * smoothstep(1.0, 0.9, r);
            vec3 col = mix(uC2 * 0.12, uC1 * 1.5, smoothstep(0.3, 0.9, r) * (0.45 + 0.55 * sw));
            col += uC1 * sw2 * smoothstep(0.35, 0.85, r) * 0.7 + vec3(0.9, 0.95, 1.0) * rim * (1.6 + sw * 1.4);
            float alpha = smoothstep(1.0, 0.92, r) * (0.75 + 0.25 * sw);
            gl_FragColor = vec4(col, alpha);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.0), mat);
      disc.position.set(p.x, y + 1.7, p.z);
      disc.userData.noOutline = true; disc.renderOrder = 4;
      this.scene.add(disc);
      // lueur au sol
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: c1, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(p.x, y + 0.05, p.z); glow.userData.noOutline = true;
      this.scene.add(glow);
      // nom du niveau au-dessus
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      label.scale.set(3.4, 1.06, 1); label.position.set(p.x, y + 4.0, p.z);
      label.userData.noOutline = true;
      this.scene.add(label);
      const portal = { def: p, y, disc, mat, glow, label, cv, tex, name: NAMES[p.to], n: 0, t: 0, text: null, cols: [c1, c2], locked: false };
      this.setPortalLock(portal, !this.guest && !visited.has(p.to));
      this.portalLabel(portal);
      return portal;
    });
  }

  /** Où aller maintenant ? (pour le chemin d'étincelles) */
  guideTarget() {
    const s = this.save, me = this.me;
    if (!s.intro) return { x: L.npcs.mamie.x, y: L.npcs.mamie.y, z: L.npcs.mamie.z };
    const LG = this.levelLogic;
    if (LG && LG.guideTarget) { const g = LG.guideTarget(me); if (g) return g; }
    if (this.puppy && this.puppy.state === 'follow') return { x: L.npcs.mamie.x, y: L.npcs.mamie.y, z: L.npcs.mamie.z };
    let best = null, bd = Infinity;
    for (const m of this.medals) {
      if (!m.mesh.visible) continue;
      const d = Math.hypot(m.def.x - me.pos.x, m.def.z - me.pos.z);
      if (d < bd) { bd = d; best = m.def; }
    }
    return best;
  }
  /** « Où aller ? » : la quête lue à voix haute et le chemin d'étincelles pendant 12 s. */
  showWay(auto) {
    this.guideUntil = this.t + 12;
    this.progressAt = this.t;
    const el = this.dom.root.querySelector('.adv-quest');
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    if (!auto) this.sayQuest();
    else this.banner('Suis les étincelles !', 'Elles montrent où aller', 2000);
  }
  /** Lit la quête à voix haute (voix du téléphone). */
  sayQuest() {
    try {
      const S = window.speechSynthesis;
      if (!S || this.dialog) return;
      const q = this.dom.quest.textContent.replace(/\((\d+)\/(\d+)\)/, ': $1 sur $2');
      S.cancel();
      const u = new SpeechSynthesisUtterance(q);
      u.lang = 'fr-FR'; u.rate = 0.95; u.pitch = 1.15;
      const v = S.getVoices().filter(x => /^fr/i.test(x.lang));
      if (v.length) u.voice = v.find(x => /Amélie|Audrey|Marie|Google français|Thomas/i.test(x.name)) || v[0];
      S.speak(u);
    } catch (e) { /* pas de voix sur ce téléphone */ }
  }
  /** Mode Promenade : des étincelles dorées montrent le chemin. */
  renderGuide(dt) {
    this.guideT = (this.guideT || 0) + dt;
    if (this.guideT < 0.12 || this.dialog) return;
    this.guideT = 0;
    const g = this.guideTarget(), me = this.me;
    if (!g) return;
    const dx = g.x - me.pos.x, dz = g.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d < 3) return;
    const k = (this.guideK = ((this.guideK || 0) + 1) % 6);
    const along = Math.min(d - 1, 1.6 + k * 1.3);
    const x = me.pos.x + dx / d * along, z = me.pos.z + dz / d * along;
    const y = Math.max(me.pos.y, L.heightAt(x, z)) + 0.5 + Math.sin(k) * 0.1;
    this.spawnParticle(x, y, z, 0, 0.6, 0, 0xffe680, 0.32, 0.9, 0);
  }

  /** Nom du niveau, et à plusieurs : combien de joueurs sont dans le portail. */
  /** Portail fermé (monde jamais visité) : gris, cadenas, on ne passe pas. */
  setPortalLock(p, locked) {
    p.locked = locked;
    const [c1, c2] = locked ? [0x9aa0ac, 0x22242a] : p.cols;
    p.mat.uniforms.uC1.value.set(c1); p.mat.uniforms.uC2.value.set(c2);
    p.glow.material.color.set(c1);
    p.text = null;
  }

  portalLabel(p) {
    const total = this.party ? this.party.size : 1;
    const need = PORTAL_WAIT(total);
    const sub = p.locked ? 'Monde pas encore découvert' : p.n > 0 && p.n < total ? `${p.n}/${total} dans le portail : on attend tout le monde !`
      : p.n > 0 && total > 1 ? `Tout le monde est là ! Départ dans ${Math.max(1, Math.ceil(need - p.t))}…`
        : total > 1 ? 'Entrez tous dedans pour y aller' : '';
    const name = (p.locked ? '🔒 ' : '') + p.name;
    const text = name + '|' + sub;
    if (text === p.text) return;
    p.text = text;
    const cx = p.cv.getContext('2d');
    cx.clearRect(0, 0, 512, 160);
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    cx.font = '700 46px Fredoka, system-ui, sans-serif';
    cx.lineWidth = 10; cx.strokeStyle = 'rgba(30,16,8,0.85)'; cx.strokeText(name, 256, 46);
    cx.fillStyle = p.locked ? '#d8dce4' : '#fff4d0'; cx.fillText(name, 256, 46);
    if (sub) {
      cx.font = '600 28px Fredoka, system-ui, sans-serif';
      cx.lineWidth = 8; cx.strokeText(sub, 256, 112);
      cx.fillStyle = p.locked ? '#c8ccd4' : p.n > 0 && p.n === total ? '#a8ff8a' : '#ffe08a'; cx.fillText(sub, 256, 112);
    }
    p.tex.needsUpdate = true;
  }

  /** Hôte : on part quand tous les joueurs sont dans le même portail (seul : tout de suite). */
  stepPortals(dt) {
    if (!this.portals || !this.portals.length || this.portalBusy) return;
    const players = this.players, total = players.length;
    for (const p of this.portals) {
      p.n = players.filter(P => Math.hypot(P.pos.x - p.def.x, P.pos.z - p.def.z) < 1.7 && Math.abs(P.pos.y - p.y) < 2.5).length;
      if (p.locked) {
        if (p.n > 0 && this.t - (this.lockMsgT || -9) > 4) { this.lockMsgT = this.t; this.banner('🔒 Monde pas encore découvert', `Commence « ${p.name} » depuis le menu principal : ensuite, ce portail t'y ramènera.`, 3000); }
        p.n = 0; p.t = 0; continue;
      }
      const prev = p.t;
      p.t = p.n === total ? p.t + dt : 0;
      if (p.n === total && prev === 0 && total > 1) this.sound('switch');
      if (p.t >= PORTAL_WAIT(total)) { this.usePortal(p.def.to); return; }
    }
  }

  usePortal(to) {
    if (this.guest || this.portalBusy) return;
    this.portalBusy = true;
    this.sound('reveal');
    for (const P of this.players) this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 30, 0xd8c0ff, 5, 0.8);
    this.fade(true);
    setTimeout(() => { if (!this.disposed) this.switchLevel(to); }, 650);
  }

  /** Décor propre au niveau 1 : Grand Chêne, îlot, ascenseur, cascade, niche, clôture, piédestal. */
  buildParc() {
    const sc = this.scene;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();

    // Grand Chêne : tronc noueux, branches rondes en spirale, grand feuillage
    const T = L.TREE;
    // écorce photographiée (comme les autres arbres), répétée selon la taille de chaque pièce
    const barkPh = (rx, ry) => (W.LOOK.real && RT.hasPhotos() ? RT.photo('bark_willow_02', rx, ry) : null);
    const barkOf = (rx, ry) => { const ph = barkPh(rx, ry); return ph ? new THREE.MeshStandardMaterial({ map: ph.map, normalMap: ph.normalMap, color: new THREE.Color(1.45, 1.35, 1.25), roughness: 0.95 }) : M.mat(0x7a5030, { roughness: 0.95 }); };
    const bark = barkOf(5, 6), barkSmall = barkOf(1.2, 1);
    // dessus des branches : bois coupé avec ses cernes
    const ringsTex = (() => {
      if (!W.LOOK.real) return null;
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#b88a58'; x.fillRect(0, 0, 256, 256);
      for (let r = 124; r > 2; r -= 5 + (r % 3)) { x.strokeStyle = `rgba(110,70,35,${0.25 + (r % 7) * 0.04})`; x.lineWidth = 1.5 + (r % 4) * 0.5; x.beginPath(); x.ellipse(128 + Math.sin(r) * 2, 128, r, r * 0.97, 0, 0, Math.PI * 2); x.stroke(); }
      x.strokeStyle = '#6a4424'; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const woodTop = ringsTex ? new THREE.MeshStandardMaterial({ map: ringsTex, normalMap: RT.normalFor(ringsTex, 3), roughness: 0.85 }) : null;
    const trunkGeo = new THREE.CylinderGeometry(T.trunkR * 0.9, T.trunkR * 1.25, T.height + 2.4, 24, 16);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 7 + y * 0.6) * 0.05 + Math.sin(a * 3 - y * 0.3) * 0.04 + (y < -(T.height / 2) + 1 ? 0.25 : 0);
      tp.setX(i, x * k); tp.setZ(i, z * k);
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.position.set(T.x, T.base - 2.4 + (T.height + 2.4) / 2, T.z);
    trunk.castShadow = trunk.receiveShadow = true;
    sc.add(trunk);
    // Racines
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.3;
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.2, 4, 10), barkSmall);
      root.position.set(Math.cos(a) * 2.6, T.base + 0.2, Math.sin(a) * 2.6);
      root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.35);
      root.castShadow = root.receiveShadow = true;
      sc.add(root);
    }
    const branchTop = M.mat(0x9a6a3c, { roughness: 0.9 });
    const leafMat = M.mat(0x58b440, { roughness: 0.85 });
    const leafGeo = W.leafClusterGeo(this.lite ? 10 : 16);
    for (const s of L.treeSteps) {
      // plate-forme ronde (même forme que la collision : rayon 1.5)
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.35, 0.5, 28), woodTop ? [barkSmall, woodTop, barkSmall] : branchTop);
      pad.position.set(s.x, s.top - 0.25, s.z);
      pad.castShadow = pad.receiveShadow = true;
      sc.add(pad);
      // bras qui relie la plate-forme au tronc
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 12), barkSmall);
      arm.position.set(s.x * 0.62, s.top - 0.7, s.z * 0.62);
      arm.rotation.set(0, -s.a, 0); arm.rotateZ(Math.PI / 2 + 0.35);
      arm.castShadow = true;
      sc.add(arm);
      const tuft = new THREE.Mesh(leafGeo, W.leafMaterial());
      tuft.customDepthMaterial = W.leafDepthMaterial();
      tuft.scale.setScalar(0.75);
      tuft.position.set(s.x * 1.35, s.top + 0.15, s.z * 1.35);
      tuft.castShadow = true;
      sc.add(tuft);
    }
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.3, 0.6, 40), woodTop ? [barkOf(4, 0.3), woodTop, barkSmall] : branchTop);
    canopy.position.set(0, L.TREE_TOP - 0.3, 0);
    canopy.castShadow = canopy.receiveShadow = true;
    sc.add(canopy);
    const crown = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      crown.push([Math.cos(a) * 6.6, L.TREE_TOP - 2.6 + (i % 2) * 0.6, Math.sin(a) * 6.6, 2.1 + (i % 3) * 0.4]);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      crown.push([Math.cos(a) * 6.6, L.TREE_TOP - 7 - (i % 3) * 3, Math.sin(a) * 6.6, 1.8]);
    }
    const crownI = new THREE.InstancedMesh(leafGeo, W.leafMaterial(), crown.length);
    crownI.customDepthMaterial = W.leafDepthMaterial();
    const cc = new THREE.Color();
    crown.forEach(([x, y, z, s], i) => {
      m4.compose(v.set(x, y, z), q.setFromEuler(e.set(i, i * 2, 0)), sv.set(s, s * 0.85, s));
      crownI.setMatrixAt(i, m4);
      crownI.setColorAt(i, cc.set([0x4caf3a, 0x5cc046, 0x6ccf4e][i % 3]));
    });
    crownI.castShadow = crownI.receiveShadow = true;
    sc.add(crownI);
    // feuilles détaillées en bordure, comme les autres arbres du parc
    if (W.LOOK.real) W.buildLeafFringe(sc, crownI, crown.map(([x, y, z, s]) => ({ x, y, z, s })), { lite: this.lite }, this.lite ? 8 : 30);
    // Petit drapeau au sommet
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), M.mat(0xf4f4f4, { roughness: 0.4 }));
    pole.position.set(-2.8, L.TREE_TOP + 1.3, -2.8); pole.castShadow = true; sc.add(pole);
    const flagGeo = new THREE.PlaneGeometry(1.2, 0.75, 8, 1);
    this.flag = new THREE.Mesh(flagGeo, M.mat(0xe03a3a, { side: THREE.DoubleSide, roughness: 0.7 }));
    this.flag.position.set(-2.8, L.TREE_TOP + 2.2, -2.2); this.flag.rotation.y = Math.PI / 2;
    this.flag.castShadow = true; sc.add(this.flag);
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array);

    // Rochers des balles, pierres de gué, îlot
    const rm = W.rockMat();
    L.rocks.forEach((r, i) => {
      const g = L.heightAt(r.x, r.z);
      const hgt = r.top - g + 1.2;
      // (un peu plus large que la collision : le dessus plat la couvre jusqu'au bord)
      const m = new THREE.Mesh(W.rockGeometry(40 + i, r.r * 1.3, hgt / 2, r.r * 1.3), rm);
      // dessus aplati pour qu'on voie bien où se poser, exactement à la hauteur de la collision
      const top = W.flattenRockTop(m.geometry, hgt / 2 * 0.4);
      m.position.set(r.x, r.top - top + 0.03, r.z);
      m.castShadow = m.receiveShadow = true;
      sc.add(m);
    });
    L.stones.forEach((s, i) => {
      const m = new THREE.Mesh(W.rockGeometry(60 + i, 1.5, 2.4, 1.5), rm);
      const top = W.flattenRockTop(m.geometry, 0.95);
      m.position.set(s.x, s.top - top + 0.03, s.z);
      m.castShadow = m.receiveShadow = true;
      sc.add(m);
    });
    const IS = { x: L.SPOTS.islet.x - 1.5, z: L.SPOTS.islet.z };
    const isletGeo = new THREE.CylinderGeometry(4.25, 5.2, 5.3, 40, 4);
    const ip = isletGeo.attributes.position, icol = [];
    const sand = new THREE.Color(0xf0d8a0), grassC = new THREE.Color(0x66bf44);
    for (let k = 0; k < ip.count; k++) {
      const a = Math.atan2(ip.getZ(k), ip.getX(k));
      const w = 1 + Math.sin(a * 5) * 0.04;
      ip.setX(k, ip.getX(k) * w); ip.setZ(k, ip.getZ(k) * w);
      const c = ip.getY(k) > 2.6 && Math.hypot(ip.getX(k), ip.getZ(k)) < 3.9 ? grassC : sand;
      icol.push(c.r, c.g, c.b);
    }
    isletGeo.setAttribute('color', new THREE.Float32BufferAttribute(icol, 3));
    isletGeo.computeVertexNormals();
    const islet = new THREE.Mesh(isletGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    islet.position.set(IS.x, 1.3 - 2.65, IS.z);
    islet.receiveShadow = true;
    sc.add(islet);
    // un petit palmier sur l'îlot
    const palm = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.7, 10), M.mat(0x9a7448, { roughness: 0.9 }));
      seg.position.set(k * 0.12, 0.35 + k * 0.65, 0); seg.rotation.z = -0.12; seg.castShadow = true; palm.add(seg);
    }
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), M.mat(0x4cae3c, { roughness: 0.8 }));
      leaf.scale.set(1.5, 0.12, 0.38);
      const a = (k / 7) * Math.PI * 2;
      leaf.position.set(0.7 + Math.cos(a) * 1.2, 4.0 - 0.25, Math.sin(a) * 1.2);
      leaf.rotation.set(0, -a, -0.35);
      leaf.castShadow = true; palm.add(leaf);
    }
    palm.position.set(IS.x - 2.2, 1.3, IS.z - 1.6);
    sc.add(palm);

    // Ascenseur (plate-forme en bois) + poteaux + passerelle
    const woodMap = M.buildCrate().material.map;
    const plankMat = M.mat(0xc08848, { roughness: 0.8 }).clone();
    if (woodMap) { plankMat.map = woodMap; plankMat.color.set(0xffffff); }
    this.elevatorMesh = new THREE.Mesh(new THREE.BoxGeometry(L.ELEVATOR.w, 0.5, L.ELEVATOR.d), plankMat);
    this.elevatorMesh.castShadow = this.elevatorMesh.receiveShadow = true;
    sc.add(this.elevatorMesh);
    const ropeMat = M.mat(0x6a4a2a, { roughness: 0.9 });
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, L.ELEVATOR.high - L.ELEVATOR.low + 3, 10), ropeMat);
      p.position.set(L.ELEVATOR.x + ox * 1.15, (L.ELEVATOR.high + L.ELEVATOR.low) / 2 + 1, L.ELEVATOR.z + oz * 1.15);
      p.castShadow = true;
      sc.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), M.mat(0xe0b040, { metalness: 0.6, roughness: 0.35 }));
      cap.position.set(p.position.x, L.ELEVATOR.high + 2.5, p.position.z);
      sc.add(cap);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(L.BRIDGE.size, 0.5, L.BRIDGE.size), plankMat);
    bridge.position.set(L.BRIDGE.x, L.BRIDGE.top - 0.25, L.BRIDGE.z);
    bridge.castShadow = bridge.receiveShadow = true;
    sc.add(bridge);

    // Cascade : un ruisseau traverse le plateau puis se jette du bord de la falaise
    const fallTex = this.fallTex;
    const S = L.STREAM, PL = L.POOL, fz = S.z;
    const edgeX = S.x1, topY = S.y, baseY = PL.y;
    const fallH = topY - baseY + 0.1;
    const waterMat = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.8, fallH), waterMat(fallTex, 0.9));
    fall.position.set(edgeX, baseY + fallH / 2, fz);
    fall.rotation.y = Math.PI / 2;
    fall.renderOrder = 2;
    sc.add(fall);
    // ruisseau sur le plateau (s'avance un peu au-dessus du vide, comme un bec)
    const streamTex = fallTex.clone(); streamTex.needsUpdate = true;
    streamTex.repeat.set(1, 3);
    this.streamTex = streamTex;
    const x0 = S.x0 - 0.6, len = edgeX - x0;
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(S.half * 2 + 0.3, len), waterMat(streamTex, 0.85));
    stream.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // le courant file vers le bord
    stream.position.set(x0 + len / 2, topY, fz);
    stream.renderOrder = 2;
    sc.add(stream);
    // berges et source
    const rockMat = M.mat(0x9a948a, { roughness: 0.9 });
    const spring = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), rockMat);
    spring.scale.set(1, 0.8, 1.2); spring.position.set(x0 - 0.5, topY + 0.3, fz);
    spring.castShadow = true; sc.add(spring);
    for (let i = 0; i < 6; i++) {
      for (const side of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + ((i * 7 + side * 3) % 5) * 0.06, 0), rockMat);
        const sx = x0 + 0.6 + i * (len - 2.2) / 5, sz = fz + side * (S.half + 0.45 + (i % 2) * 0.15);
        st.position.set(sx, L.heightAt(sx, sz) + 0.12, sz);
        st.rotation.set(i, side * i, 0); st.castShadow = true; sc.add(st);
      }
    }
    // écume en haut et en bas
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.1, 10), foamMat);
    lip.rotation.x = Math.PI / 2; lip.position.set(edgeX, topY + 0.12, fz); sc.add(lip);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(PL.r + 0.25, 40), new THREE.MeshStandardMaterial({ color: 0x5fd0f0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(PL.x, PL.y, PL.z);
    sc.add(pool);
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.6, 24), foamMat);
    foam.rotation.x = -Math.PI / 2; foam.position.set(edgeX + 0.6, PL.y + 0.03, fz); sc.add(foam);
    this.fallPos = new THREE.Vector3(edgeX - 0.4, baseY + 0.3, fz);

    // Niche de Mamie
    const kennel = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.2), M.mat(0xe0b070, { roughness: 0.8 }));
    if (woodMap) { kb.material = kb.material.clone(); kb.material.map = woodMap; kb.material.color.set(0xffe0b0); }
    const planks = this.realistic && RT.hasPhotos() ? RT.photo('brown_planks_03', 1) : null;
    if (planks) { kb.material = new THREE.MeshStandardMaterial({ map: planks.map, normalMap: planks.normalMap, roughness: 0.85, color: 0xd8c0a0 }); kb.material.color.multiplyScalar(1.5); }
    kb.position.y = 0.8; kennel.add(kb);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.55, 0); roofShape.lineTo(0, 1.25); roofShape.lineTo(1.55, 0); roofShape.lineTo(-1.55, 0);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 2.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), this.realistic && RT.hasPhotos() ? (() => { const t = RT.photo('clay_roof_tiles', 0.5); return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.75 }); })()
      : this.realistic ? new THREE.MeshStandardMaterial({ map: shingleTexture(), roughness: 0.75 }) : M.mat(0xd8443a, { roughness: 0.6 }));
    roof.position.set(0, 1.55, -1.35); kennel.add(roof);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), M.mat(0x2a1608, { roughness: 1 }));
    door.position.set(0, 0.65, 1.11); kennel.add(door);
    const doorB = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.65), door.material);
    doorB.position.set(0, 0.33, 1.11); kennel.add(doorB);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.2, 20), M.mat(0x3a8ae0, { roughness: 0.4 }));
    bowl.position.set(1.0, 0.1, 1.7); kennel.add(bowl);
    kennel.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    kennel.position.set(L.SPOTS.mamie.x - 3, L.heightAt(L.SPOTS.mamie.x - 3, L.SPOTS.mamie.z - 1), L.SPOTS.mamie.z - 1);
    kennel.rotation.y = 0.5;
    sc.add(kennel);

    // Clôture de la clairière : poteaux arrondis + traverses
    const posts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(Math.sin(a + 0.2)) < 0.15 && Math.cos(a) < 0) continue; // ouverture côté ouest
      posts.push(a);
    }
    const fenceMat = M.mat(0xd8aa6a, { roughness: 0.85 });
    const postI = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.13, 0.95, 4, 10), fenceMat, posts.length);
    const railI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.14, 1), fenceMat, posts.length * 2);
    const CL = L.SPOTS.clearing, R = 13.5;
    let rails = 0;
    posts.forEach((a, i) => {
      const x = CL.x + Math.cos(a) * R, z = CL.z + Math.sin(a) * R;
      m4.compose(v.set(x, L.heightAt(x, z) + 0.5, z), q.identity(), sv.set(1, 1, 1));
      postI.setMatrixAt(i, m4);
      const b = a + (Math.PI * 2) / 40;
      if (!posts.some(p => Math.abs(p - b) < 1e-6) && !(i === posts.length - 1 && posts[0] < 1e-6)) return;
      const x2 = CL.x + Math.cos(b) * R, z2 = CL.z + Math.sin(b) * R;
      const len = Math.hypot(x2 - x, z2 - z), yaw = Math.atan2(x2 - x, z2 - z);
      for (const hh of [0.35, 0.75]) {
        const y = (L.heightAt(x, z) + L.heightAt(x2, z2)) / 2 + hh;
        m4.compose(v.set((x + x2) / 2, y, (z + z2) / 2), q.setFromEuler(e.set(0, yaw, 0)), sv.set(1, 1, len));
        railI.setMatrixAt(rails++, m4);
      }
    });
    railI.count = rails;
    postI.castShadow = railI.castShadow = true;
    sc.add(postI, railI);

    // Piédestal des balles
    this.pedestal = M.buildPedestal();
    const P = L.SPOTS.pedestal;
    this.pedestal.position.set(P.x, L.heightAt(P.x, P.z), P.z);
    sc.add(this.pedestal);
    this.pedestalBalls = [];
    for (let i = 0; i < 5; i++) {
      const b = M.buildBall(); const a = (i / 5) * Math.PI * 2;
      b.scale.setScalar(0.6);
      b.position.set(Math.cos(a) * 0.95, 0.85, Math.sin(a) * 0.95);
      b.visible = false;
      this.pedestal.add(b);
      this.pedestalBalls.push(b);
    }
  }

  makeWaterfallTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(120,210,255,0.6)'); g.addColorStop(0.5, 'rgba(170,230,255,1)'); g.addColorStop(1, 'rgba(120,210,255,0.6)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 70; i++) {
      x.fillStyle = `rgba(255,255,255,${0.25 + (i % 5) * 0.12})`;
      const w = 1 + (i % 3), h = 10 + (i * 7) % 30;
      x.beginPath(); x.roundRect((i * 37) % 64, (i * 53) % 128, w, h, w / 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2);
    return t;
  }

  // -------------------------------------------------------------------------
  // Entités
  // -------------------------------------------------------------------------
  buildEntities() {
    M.FUR.layers = this.lite ? 8 : 14; // couches de fourrure
    // rendu réaliste : vrai pelage en couches pour tout le monde (sur ordinateur ; le téléphone garde des pelages simples)
    M.FUR.mode = this.realistic && !this.lite ? 'shells' : 'smooth';
    const sc = this.scene;
    const s = this.save;
    // Joueur
    const duo = M.buildDuo();
    sc.add(duo);
    const mkPlayer = (mesh, kind) => ({
      kind, mesh, pos: new THREE.Vector3(L.START.x, L.START.y, L.START.z), vel: new THREE.Vector3(),
      yaw: L.START.yaw, grounded: true, coyote: 0, jumps: 0, gliding: false, attackT: 0, dashT: 0, dashCd: 0,
      airDash: false, invuln: 0, hearts: MAX_HEARTS, flipT: 0, phase: 0, cheerT: 0, onCol: null, nearby: null,
      lastSafe: new THREE.Vector3(L.START.x, L.START.y, L.START.z), lastSafeT: 0, hitIds: new Set(),
      shadow: this.makeShadow(kind === 'matcha' ? 0.5 : 0.8), active: true, score: 0, color: 0, name: '',
    });
    this.mkPlayer = mkPlayer;
    this.player = mkPlayer(duo, 'duo');           // seul : Ainu avec Matcha sur le dos
    this.player.id = 0; this.player.meshes = { duo };
    this.player.name = 'Ainu'; this.player.color = 0;
    this.shadow = this.player.shadow;
    this.party = new Map([[0, this.player]]);

    // Os dorés (instanciés)
    this.bonesI = new THREE.InstancedMesh(L.ID === 2 ? F.kibbleGeometry() : L.ID === 3 ? C.coinGeometry() : L.ID === 4 ? SK.starCoinGeometry() : M.boneGeometry(), M.mat(0xffd34d, { metalness: 0.7, roughness: 0.3, emissive: 0x6a4800, emissiveIntensity: 0.6 }), L.bones.length);
    this.boneTaken = new Set(Object.keys(s.gone || {}));
    sc.add(this.bonesI);
    if (L.ID === 1 && this.realistic) this.bonesI.material = M.mat(0xf2dcb4, { metalness: 0.05, roughness: 0.5, emissive: 0x5a3c10, emissiveIntensity: 0.3 });
    // halo doré autour de chaque trésor (on les repère de loin)
    {
      const n = L.bones.length, gp = new THREE.BufferGeometry();
      gp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      gp.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
      const gm = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: M.glowTexture() }, uScale: { value: 400 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.45) } },
        vertexShader: `attribute float size; uniform float uScale; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; void main() { float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uColor * a * 0.45, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.boneGlow = new THREE.Points(gp, gm);
      this.boneGlow.frustumCulled = false; this.boneGlow.renderOrder = 4;
      sc.add(this.boneGlow);
    }

    // Médailles
    this.medals = L.medals.map(md => {
      const m = M.buildMedal();
      m.position.set(md.x, md.y, md.z);
      sc.add(m);
      // rayon de lumière : on voit de loin qu'une médaille est apparue
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 16, 18, 1, true), this.beamMaterial());
      beam.position.set(md.x, md.y + 7, md.z);
      beam.userData.noOutline = true; beam.renderOrder = 3;
      sc.add(beam);
      const taken = s.medals.includes(md.id);
      return { def: md, mesh: m, beam, taken, visible: md.visible };
    });
    this.updateMedalVisibility();

    // Balles
    this.balls = L.balls.map(b => {
      const m = M.buildBall();
      m.position.set(b.x, b.y, b.z);
      sc.add(m);
      const taken = s.balls.includes(b.id);
      m.visible = !taken;
      return { def: b, mesh: m, taken };
    });
    this.pedestalBalls.forEach((b, i) => { b.visible = i < s.balls.length; });

    // Caisses
    this.crates = L.crates.map(c => {
      const m = M.buildCrate();
      m.position.set(c.x, c.y + 0.6, c.z);
      sc.add(m);
      const broken = s.crates.includes(c.id);
      m.visible = !broken;
      return { def: c, mesh: m, broken };
    });

    // Cœurs à ramasser (sortis des caisses)
    this.hearts = [];

    // Chats bandits
    this.cats = L.cats.map(c => {
      const m = M.buildCat();
      m.position.set(c.x, c.y, c.z);
      sc.add(m);
      const dead = (c.group === 'clearing' && s.cats.includes(c.id)) || c.group === 'gang';   // le gang n'arrive qu'avec sa mission
      m.visible = !dead;
      return { def: c, mesh: m, pos: new THREE.Vector3(c.x, c.y, c.z), home: new THREE.Vector3(c.x, c.y, c.z), yaw: Math.random() * 6, dead, target: null, t: Math.random() * 3, phase: 0, shadow: this.makeShadow(0.6), stun: 0 };
    });

    // Mamie
    // (?mamie=scan|debout|dessin pour comparer les modèles)
    const mq = new URLSearchParams(location.search).get('mamie');
    this.mamie = mq === 'dessin' ? M.buildMamie()
      : mq === 'assise' && N.hasNpc('mamie') ? N.buildMamieReal()
        : this.realistic && N.hasNpc('mamie2') ? N.buildMamieStanding() : M.buildMamie();
    this.mamie.position.set(L.npcs.mamie.x, L.npcs.mamie.y, L.npcs.mamie.z);
    if (this.mamie.userData.rig) this.mamie.scale.multiplyScalar(MAMIE_SCALE);   // un peu plus grande
    this.mamie.rotation.y = Math.atan2(L.START.x - L.npcs.mamie.x, L.START.z - L.npcs.mamie.z);
    sc.add(this.mamie);
    // la vraie saison et l'heure du jour (flocons, feuilles, lucioles, fêtes)
    try { this.seasons = buildSeasons(this, { lite: this.lite, L }); } catch (e) { this.seasons = null; }
    // Biscotte
    this.puppy = { mesh: this.realistic && N.hasNpc('biscotte') ? N.buildNpc('biscotte', { head: 0.3, tail: 0.12 }) : M.buildPuppy(), state: s.puppy, pos: new THREE.Vector3(), yaw: 0, phase: 0, shadow: this.makeShadow(0.45) };
    sc.add(this.puppy.mesh);
    if (s.puppy === 'home') this.puppy.pos.set(L.npcs.mamie.x + 1.6, L.npcs.mamie.y, L.npcs.mamie.z + 1.2);
    else { this.puppy.state = 'lost'; this.puppy.pos.set(L.npcs.puppy.x, L.npcs.puppy.y, L.npcs.puppy.z); }
    // Bulle « ! » au-dessus des personnages
    this.marks = {
      mamie: this.makeMark('!', 0xffd34d),
      puppy: this.makeMark('?', 0x8ad0ff),
    };

    // Particules : points lumineux doux
    this.particles = [];
    const PMAX = 400;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
    pg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(PMAX), 1));
    pg.setDrawRange(0, 0);
    const pm = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: M.glowTexture() }, uScale: { value: 400 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, min(1.0, t.a * 1.3));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.partPts = new THREE.Points(pg, pm);
    this.partPts.frustumCulled = false;
    this.partPts.renderOrder = 5;
    sc.add(this.partPts);
  }

  makeShadow(r) {
    if (!Adventure.shadowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      Adventure.shadowTex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4), new THREE.MeshBasicMaterial({ map: Adventure.shadowTex, color: 0x0a1a08, transparent: true, opacity: 0.3, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }

  makeMark(ch, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const hex = '#' + color.toString(16).padStart(6, '0');
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 8; x.shadowOffsetY = 4;
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(64, 58, 46, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(50, 96); x.lineTo(64, 120); x.lineTo(78, 96); x.fill();
    x.shadowColor = 'transparent';
    x.fillStyle = hex;
    x.beginPath(); x.arc(64, 58, 38, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff';
    x.font = 'bold 64px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, 64, 62);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(0.9, 0.9, 1);
    s.renderOrder = 10;
    this.scene.add(s);
    return s;
  }

  /** Tous les chiens présents dans le monde (1 seul hors ligne : le duo Ainu + Matcha). */
  get players() { return [...this.party.values()]; }
  /** Le chien contrôlé sur cet écran (la caméra le suit). */
  get me() { return (this.myId !== undefined && this.party.get(this.myId)) || this.player; }
  nearestPlayer(pos) {
    let best = this.player, bd = Infinity;
    for (const P of this.players) { const d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z); if (d < bd) { bd = d; best = P; } }
    return best;
  }
  /** Change l'apparence d'un joueur : 'duo' (Ainu + Matcha sur le dos), 'ainu' ou 'matcha'. */
  dogMesh(P, kind) {
    const want = kind === 'matcha' ? 'matcha' : M.FRIENDS[kind] ? kind : 'duo';
    if (!P.meshes[want]) {
      const m = want === 'matcha' ? M.buildMatchaSolo() : M.FRIENDS[want] ? M.FRIENDS[want].build() : M.buildDuo();
      this.scene.add(m);
      if (M.FRIENDS[want]) T.toonify(m);
      T.outlineTree(m, 0.018, 0x1e120c);
      if (this.lite) m.traverse(k => { k.castShadow = false; });
      P.meshes[want] = m;
    }
    for (const k in P.meshes) P.meshes[k].visible = false;
    P.mesh = P.meshes[want]; P.mesh.visible = true; P.kind = kind;
    if (want === 'duo') P.mesh.userData.matcha.visible = kind === 'duo';
    P.shadow.scale.setScalar(1);
    if (this.dom) this.updateHud();
  }
  /** Monde semi-persistant (hôte) : les trésors repoussent, les chats errants reviennent. */
  stepWorld() {
    if (this.guest) return;
    for (const c of this.cats) {
      if (!c.dead || c.def.group !== 'roam' || this.t - (c.deadAt || 0) < CAT_RESPAWN) continue;
      c.dead = false; c.fly = null; c.mesh.scale.setScalar(1); c.mesh.rotation.set(0, c.yaw, 0); c.mesh.visible = true; c.pos.copy(c.home); c.stun = 1;
      this.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 8, 0xd8d8e8, 2.5, 0.4);
    }
    if ((this.worldT = (this.worldT || 0) + 1) % 120) return;   // toutes les 2 secondes
    const s = this.save, now = Date.now();
    let changed = false;
    for (const id in s.gone) if (now - s.gone[id] > REGROW_MS) { delete s.gone[id]; this.boneTaken.delete(id); changed = true; }
    for (const id in s.crateT) {
      if (now - s.crateT[id] <= CRATE_MS) continue;
      delete s.crateT[id];
      s.crates = s.crates.filter(c => c !== id);
      const cr = this.crates.find(c => c.def.id === id);
      if (cr) { cr.broken = false; cr.mesh.visible = true; }
      changed = true;
    }
    if (changed) this.persist();
  }

  /** Prénom au-dessus du chien (seulement à plusieurs). */
  dogTag(P) {
    const key = P.name + '|' + P.color;
    if (P.tagKey !== key) {
      if (P.tag) this.scene.remove(P.tag);
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.font = 'bold 34px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
      const w = Math.min(244, x.measureText(P.name).width + 34);
      x.fillStyle = 'rgba(30,18,10,0.75)';
      x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 24); x.fill();
      x.fillStyle = DOG_COLORS[P.color % DOG_COLORS.length];
      x.beginPath(); x.arc(128 - w / 2 + 22, 32, 9, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(P.name, 128 + 8, 33);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      P.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      P.tag.scale.set(2.2, 0.55, 1); P.tag.renderOrder = 12;
      this.scene.add(P.tag);
      P.tagKey = key;
    }
    P.tag.visible = this.party.size > 1;
  }

  beamMaterial() {
    if (!this._beamMat) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = g; x.fillRect(0, 0, 4, 128);
      const t = new THREE.CanvasTexture(c);
      this._beamMat = new THREE.MeshBasicMaterial({ color: 0xffd860, map: t, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    }
    return this._beamMat;
  }

  updateMedalVisibility() {
    const s = this.save;
    const reveal = this.levelLogic ? this.levelLogic.reveal() : {
      m_tree: true,
      m_cats: L.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
      m_crate: s.crates.includes('c1'),
      m_balls: s.balls.length >= 5,
      m_puppy: s.puppy === 'home',
    };
    for (const m of this.medals) {
      m.visible = reveal[m.def.id];
      m.mesh.visible = m.visible && !m.taken;
      if (m.beam) m.beam.visible = m.mesh.visible;
    }
  }

  // -------------------------------------------------------------------------
  // Entrées
  // -------------------------------------------------------------------------
  bindInput() {
    const KEYMAP = {
      Space: 'jump', KeyJ: 'attack', KeyK: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyF: 'talk', Enter: 'talk', KeyB: 'bark', KeyN: 'trick',
    };
    this.onKeyDown = (e) => {
      if (this.disposed) return;
      if (this.cine) { if (['Escape', 'Enter', 'Space', 'KeyF'].includes(e.code)) { e.preventDefault(); this.cine.skip(); } return; }
      if (e.code === 'Escape') { this.togglePause(); return; }
      if (e.code === 'KeyV' && !e.repeat) { this.toggleMic(); return; }
      const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Space'];
      if (moveKeys.includes(e.code) || KEYMAP[e.code]) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEYMAP[e.code]) this.pressed.add(KEYMAP[e.code]);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.onResize = () => { this.needResize = true; };
    window.addEventListener('resize', this.onResize);

    // Souris : glisser pour tourner la caméra
    const cv = this.dom.canvas;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); } });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerType !== 'mouse') return;
      this.camInput.dx += e.clientX - drag.x; this.camInput.dy += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointerup', () => { drag = null; });

    // Tactile
    const d = this.dom;
    let stickId = null, origin = null, camId = null, camLast = null;
    const R = () => Math.max(40, Math.min(70, window.innerHeight * 0.12));
    const placeStick = (x, y) => { d.stick.style.left = x + 'px'; d.stick.style.top = y + 'px'; };
    const home = () => placeStick(Math.max(24, window.innerWidth * 0.03) + R() * 1.2, window.innerHeight - R() * 1.6);
    home();
    const zone = d.root.querySelector('.adv-stick-zone');
    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      e.preventDefault();
      stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY }; placeStick(origin.x, origin.y);
      d.stick.classList.add('active');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const r = R(), dist = Math.hypot(dx, dy);
      if (dist > r * 1.5) { origin.x = e.clientX - dx / dist * r * 1.5; origin.y = e.clientY - dy / dist * r * 1.5; placeStick(origin.x, origin.y); dx = e.clientX - origin.x; dy = e.clientY - origin.y; }
      const k = Math.min(1, Math.hypot(dx, dy) / r);
      const a = Math.atan2(dy, dx);
      this.stick.x = Math.cos(a) * k; this.stick.y = Math.sin(a) * k;
      if (k < 0.15) { this.stick.x = 0; this.stick.y = 0; }
      d.knob.style.transform = `translate(${Math.cos(a) * k * r}px, ${Math.sin(a) * k * r}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; this.stick.x = 0; this.stick.y = 0;
      d.knob.style.transform = ''; d.stick.classList.remove('active'); home();
    };
    zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);

    const camZone = d.root.querySelector('.adv-cam-zone');
    camZone.addEventListener('pointerdown', (e) => { if (camId !== null) return; camId = e.pointerId; camZone.setPointerCapture(e.pointerId); camLast = { x: e.clientX, y: e.clientY }; });
    camZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== camId) return;
      this.camInput.dx += (e.clientX - camLast.x) * 1.4; this.camInput.dy += (e.clientY - camLast.y) * 1.4;
      camLast = { x: e.clientX, y: e.clientY };
    });
    const endCam = (e) => { if (e.pointerId === camId) camId = null; };
    camZone.addEventListener('pointerup', endCam); camZone.addEventListener('pointercancel', endCam);

    this.touchHeld = new Set();
    for (const b of d.root.querySelectorAll('.adv-btn')) {
      const name = b.dataset.btn;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); b.setPointerCapture(e.pointerId);
        this.pressed.add(name); this.touchHeld.add(name); b.classList.add('down');
        if (navigator.vibrate) navigator.vibrate(10);
      });
      const up = () => { this.touchHeld.delete(name); b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
    d.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.dom.dialog.addEventListener('pointerdown', () => this.pressed.add('talk'));
  }

  /** Stick (x, y) relatif à la caméra → direction dans le monde. */
  worldMove(x, y) {
    const cy = this.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    return [fx * -y + rx * x, fz * -y + rz * x];
  }

  readInput() {
    const k = this.keys;
    let x = this.stick.x, y = this.stick.y;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyQ')) this.camInput.dx -= 6;
    if (k.has('KeyE')) this.camInput.dx += 6;
    // Manette
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = Array.from(pads || []).find(Boolean);
    if (p) {
      if (Math.abs(p.axes[0]) > 0.2) x += p.axes[0];
      if (Math.abs(p.axes[1]) > 0.2) y += p.axes[1];
      if (Math.abs(p.axes[2] || 0) > 0.2) this.camInput.dx += p.axes[2] * 10;
      if (Math.abs(p.axes[3] || 0) > 0.2) this.camInput.dy += p.axes[3] * 6;
      const btn = (i) => p.buttons[i] && p.buttons[i].pressed;
      const prev = this.padPrev || {};
      const map = { 0: 'jump', 2: 'attack', 1: 'dash', 3: 'talk' };
      for (const i in map) { if (btn(i) && !prev[i]) this.pressed.add(map[i]); }
      if (btn(9) && !prev[9]) this.togglePause();
      this.padPrev = Object.fromEntries([0, 1, 2, 3, 9].map(i => [i, btn(i)]));
      this.padJump = btn(0);
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const held = k.has('Space') || this.touchHeld.has('jump') || !!this.padJump;
    return { x, y, jumpHeld: held };
  }

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------
  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    // cinématique : le jeu attend (un ami qui arrive l'interrompt)
    if (this.cine) { if (this.party.size > 1 || this.guest) this.cine.skip(); else if (!this.paused) this.cine.update(dt); }
    if (this.guest) this.guestFrame(dt);
    else if (this.hitStop > 0) this.hitStop -= dt;
    else if (this.photoMode) {
      // mode photo : le monde est figé, on tourne la caméra ; la pirouette continue de s'animer
      this.stepCamera(dt);
      const P = this.me;
      if (P.trickT > 0 || !P.grounded) { this.acc += dt; while (this.acc >= STEP) { this.acc -= STEP; P.trickT = Math.max(0, P.trickT - STEP); P.vel.x = P.vel.z = 0; P.vel.y -= 32 * STEP; P.pos.y += P.vel.y * STEP; const g = this.support(P.pos.x, P.pos.z, P.pos.y + 0.5).y; if (P.pos.y <= g) { P.pos.y = g; P.vel.y = 0; P.grounded = true; } } }
    }
    else if (!this.paused && !this.cine) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 5) this.acc = 0;
    }
    this.render(dt);
    this.adaptQuality(dt);
  }

  step(dt) {
    this.t += dt;
    if (!this.save.done) this.save.time += dt;
    const input = this.readInput();
    const players = this.players;
    const lp = new Set(this.pressed);
    const inputs = [], presses = [];
    for (const P of players) {
      if (P === this.player) { inputs.push(input); presses.push(lp); continue; }
      const r = this.remoteIn.get(P.id) || { mx: 0, mz: 0, h: false, pressed: new Set() };
      // plus de nouvelles depuis un moment (réseau qui coince) : son chien s'arrête au lieu d'avancer tout seul
      if (r.at && performance.now() - r.at > 450) { r.mx = 0; r.mz = 0; r.h = false; }
      inputs.push({ wx: r.mx, wz: r.mz, jumpHeld: r.h });
      presses.push(new Set(r.pressed));
      for (const a of r.pressed) this.pressed.add(a);   // n'importe qui fait avancer les dialogues
      r.pressed.clear();
    }
    const still = () => { for (const i of inputs) { i.x = 0; i.y = 0; i.wx = 0; i.wz = 0; } for (const p of presses) p.clear(); };
    if (this.dialog) { this.stepDialog(dt); still(); }
    if (this.freeze > 0) { this.freeze -= dt; still(); this.pressed.clear(); }
    this.stepCamera(dt);
    players.forEach((P, i) => this.stepPlayer(dt, inputs[i] || { x: 0, y: 0, wx: 0, wz: 0 }, P, presses[i] || new Set()));
    this.stepCats(dt);
    this.stepThrow(dt);
    if (this.party.size > 1) this.stepRevive(dt);
    this.stepNpcs(dt);
    this.stepCollect(dt);
    this.stepPortals(dt);
    if (this.levelLogic) this.levelLogic.step(dt);
    this.stepParticles(dt);
    this.stepEnd(dt);
    this.pressed.clear();
    this.stepWorld();
    if (this.hostSession) this.coopAfterStep();
  }

  // -------------------------------------------------------------------------
  // Monde partagé (jusqu'à 6 joueurs) : le navigateur de l'hôte fait tourner
  // le jeu ; chaque ami envoie ses commandes et affiche l'état reçu.
  // Messages : invité -> hôte  join {name, kind, color}, ready, in {mx, mz, h, p}
  //            hôte -> invité  level {id}, welcome {id}, roster {list}, s (état)
  // -------------------------------------------------------------------------
  /** Invité : se présente (prénom, chien, couleur) puis suit l'état du monde. */
  initCoop() {
    const { link, profile } = this.coop;
    this.vc = voiceFor(link.peer);
    this.localBanner = this.banner.bind(this);
    this.coopBadge(`<b>Monde partagé</b> · connexion…`);
    link.onmessage = (m) => this.onCoopMessage(m);
    link.onclose = () => this.onCoopClose();
    this.lastSent = { mx: 0, mz: 0, h: false, at: 0 };
    this.hpKey = '';
    // sa copie du monde : rien de ce qu'on y a trouvé ne se perd, même si le gardien a changé
    const copy = this.save.intro ? this.save : null;
    link.send({ t: 'join', name: profile.name, kind: profile.kind, extra: profile.extra, color: profile.color, sv: copy, uid: playerUid() });
    link.send({ t: 'ready' }); // l'hôte renvoie alors tout l'état du monde
  }

  /**
   * Dès qu'on est à plusieurs : le micro s'allume tout seul si on l'avait déjà
   * activé une fois, sinon on propose de l'activer (une fois par partie).
   */
  micHint() {
    if (this.micHinted || !this.vc) return;
    this.micHinted = true;
    if (this.vc.on) { this.dom.mic.classList.add('on'); return; }
    let pref = null;
    try { pref = localStorage.getItem('dogfight.mic'); } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (this.disposed || this.vc.on) return;
      if (pref === '1') this.toggleMic(true);
      else if (!micAsked) { micAsked = true; this.dom.micAsk.classList.remove('hidden'); }
    }, 1200);
  }

  /** Chat vocal : allume ou coupe mon micro. */
  async toggleMic(auto) {
    if (this.micBusy) return;
    this.dom.micAsk.classList.add('hidden');
    if (!this.vc) { this.localBanner('Micro', 'Pour parler avec tes amis, choisis « Jouer ensemble » dans le menu', 3600); return; }
    this.micBusy = true;
    const r = await this.vc.toggle();
    this.micBusy = false;
    if (this.disposed) return;
    this.dom.mic.classList.toggle('on', r === 'on');
    if (r === 'on' || r === 'off') { try { localStorage.setItem('dogfight.mic', r === 'on' ? '1' : '0'); } catch (e) { /* ignore */ } }
    if (r === 'on') this.localBanner('Micro allumé', 'Tout le monde t\'entend ! Avec des écouteurs, c\'est encore mieux.', 3000);
    else if (r === 'off') this.localBanner('Micro coupé', '', 1200);
    else if (auto) this.dom.micAsk.classList.remove('hidden');   // (le navigateur veut un appui pour l'allumer)
    else this.localBanner('Micro', r, 3000);
  }

  /** Qui parle ? (liste des joueurs, note au-dessus du chien, bouton micro) */
  showVoices() {
    const v = this.vc;
    if ((this.voiceT = (this.voiceT || 0) + 1) % 6) return;
    // micro allumé : le son du jeu passe par le chemin que l'anti-écho connaît (voir audio.js)
    if (this.sfx && this.sfx.echoSafe) this.sfx.echoSafe(!!(v && v.on));
    if (!v || this.party.size < 2) {
      if (this.chatDuck !== 0 && this.sfx && this.sfx.duck) { this.chatDuck = 0; this.sfx.duck(false, 'chat'); this.sfx.duck(false, 'chatting'); }
      return;
    }
    let others = false;
    const spans = this.dom.roster ? this.dom.roster.querySelectorAll('span[data-id]') : [];
    for (const P of this.players) {
      const talk = !!P.peerId && v.speaking(P.peerId);
      if (talk && P !== this.me) others = true;
      for (const sp of spans) if (+sp.dataset.id === P.id) sp.classList.toggle('talk', talk);
      if (talk && !P.voiceMark) P.voiceMark = this.makeMark('♪', 0x40c060);
      if (P.voiceMark) {
        P.voiceMark.visible = talk && P.mesh && P.mesh.visible !== false;
        P.voiceMark.position.set(P.pos.x, P.pos.y + (P.mesh && P.mesh.userData.ainu ? 3.3 : 2.4), P.pos.z);
      }
    }
    this.dom.mic.classList.toggle('speak', !!v.on && v.speaking(v.myId));
    // on se parle : la musique et les bruitages se font discrets (la voix passe mieux, et
    // l'anti-écho du téléphone n'a plus à lutter contre le jeu, ce qui hachait la voix)
    if (this.sfx && this.sfx.duck) {
      const chat = v.on || v.in.size > 0;
      if (others) this.chatHold = 8;
      else if (this.chatHold > 0) this.chatHold--;
      const state = (chat ? 1 : 0) + (this.chatHold > 0 ? 2 : 0);
      if (state !== this.chatDuck) {
        this.chatDuck = state;
        this.sfx.duck(chat, 'chatting', 0.45);
        this.sfx.duck(this.chatHold > 0, 'chat', 0.15);
      }
    }
  }

  coopBadge(html) {
    const root = this.dom.root;
    let badge = this.dom.coopBadge;
    if (!badge) {
      badge = this.dom.coopBadge = document.createElement('div');
      badge.className = 'adv-coop';
      root.querySelector('.adv-party-info').appendChild(badge);
    }
    badge.innerHTML = html;
    root.classList.toggle('coop', this.party.size > 1);
  }

  /** Bandeau du haut : les joueurs présents, avec leur couleur. */
  updateRoster() {
    let el = this.dom.roster;
    if (!el) { el = this.dom.roster = document.createElement('div'); el.className = 'adv-roster'; this.dom.root.querySelector('.adv-hud').appendChild(el); }
    const list = this.players;
    el.classList.toggle('hidden', list.length < 2);
    el.innerHTML = list.map(P => `<span data-id="${P.id}" style="--c:${DOG_COLORS[P.color % DOG_COLORS.length]}" class="${P === this.me ? 'me' : ''}">${escapeHtml(P.name)} <small>${dogName(P.kind)}</small></span>`).join('');
    if (this.vc) this.vc.setRoster(list.map(P => ({ pid: P.peerId, id: P.id })));
    this.dom.mic.classList.toggle('hidden', !this.vc);
    const n = list.length;
    if (this.guest) this.coopBadge(`<b>Monde de ${escapeHtml(this.player.name)}</b> · ${n} joueur${n > 1 ? 's' : ''}`);
    else if (this.hostSession) this.coopBadge(`<b>Monde ${this.hostSession.code}</b> · ${n > 1 ? n + ' joueurs' : 'en attente d\'amis…'}`);
    for (const P of list) this.dogTag(P);
    this.updateHud();
  }

  /** Hôte : son monde est ouvert ; il joue seul avec les deux chiens tant que personne n'est là. */
  initHostSession() {
    const ses = this.hostSession;
    ses.level = L.ID;
    const pr = ses.profile || {};
    this.player.name = cleanName(pr.name) || 'Moi';
    this.player.color = (pr.color | 0) % DOG_COLORS.length;
    this.player.peerId = ses.peer && ses.peer.id;
    this.vc = voiceFor(ses.peer);
    this.hostKind = pr.kind === 'matcha' ? 'matcha' : 'ainu';
    this.localBanner = this.banner.bind(this);
    // les effets (sons, particules, bandeaux) sont rejoués chez les amis
    this.coopEvents = [];
    this.coopTick = 0;
    for (const n of ['sound', 'burst', 'banner', 'fade']) {
      const f = this[n].bind(this);
      this[n] = (...a) => { if (this.party.size > 1) this.coopEvents.push([n, ...a]); return f(...a); };
    }
    ses.detach();
    ses.onJoin = (link) => this.linkJoined(link);
    for (const l of ses.links) if (!l.closed) this.linkJoined(l);   // amis déjà là (changement de niveau)
    this.updateRoster();
    this.beginLevel(!this.hasProgress());
  }

  linkJoined(link) {
    if (this.disposed) return;
    link.pid = undefined;
    link.onmessage = (m) => this.onLinkMessage(link, m);
    link.onclose = () => this.onLinkClose(link);
    link.send({ t: 'level', id: L.ID });   // si l'hôte vient de changer de niveau, l'ami suit
  }

  onLinkMessage(link, m) {
    if (this.disposed) return;
    if (m.t === 'join' && link.pid === undefined) this.addGuest(link, m);
    else if (m.t === 'ready') { link.lastSave = undefined; link.send({ t: 'level', id: L.ID }); }
    else if (m.t === 'lv' && link.pid !== undefined && this.levelLogic && this.levelLogic.remote) this.levelLogic.remote(this.party.get(link.pid), m);
    else if (m.t === 'leave') link.close();
    else if (m.t === 'in' && link.pid !== undefined) {
      const r = this.remoteIn.get(link.pid);
      if (!r) return;
      r.at = performance.now();
      const l = Math.hypot(m.mx, m.mz) || 1;
      r.mx = l > 1 ? m.mx / l : +m.mx || 0; r.mz = l > 1 ? m.mz / l : +m.mz || 0;
      r.h = !!m.h;
      for (const a of m.p || []) if (['jump', 'attack', 'dash', 'talk', 'bark', 'trick'].includes(a)) r.pressed.add(a);
    }
  }

  addGuest(link, m) {
    const uid = typeof m.uid === 'string' ? m.uid.slice(0, 40) : '';
    // il revient (page rechargée, connexion retrouvée) alors que son ancien chien est encore là : il le reprend
    const again = uid && this.players.find(Q => Q !== this.player && Q.uid === uid);
    if (again) {
      for (const l of this.hostSession.links) if (l !== link && l.pid === again.id) { l.replaced = true; l.close(); }
      link.pid = again.id; link.lastSave = undefined;
      again.peerId = link.conn && link.conn.peer;
      again.name = cleanName(m.name) || again.name;
      this.remoteIn.set(again.id, { mx: 0, mz: 0, h: false, pressed: new Set() });
      link.send({ t: 'welcome', id: again.id });
      this.broadcastRoster();
      this.banner(`${again.name} est de retour !`, '', 1800);
      return;
    }
    let id = 1;
    while (this.party.has(id)) id++;
    if (id > 5) { link.send({ t: 'full' }); link.close(); return; }
    // les 2 premiers joueurs sont Ainu et Matcha, les suivants ont un des copains
    const others = this.players.filter(Q => Q !== this.player);
    const mainOther = this.hostKind === 'ainu' ? 'matcha' : 'ainu';
    let kind;
    if (!others.some(Q => Q.kind === mainOther)) kind = mainOther;
    else {
      const taken = new Set(others.map(Q => Q.kind));
      const keys = Object.keys(M.FRIENDS);
      kind = (M.FRIENDS[m.extra] && !taken.has(m.extra)) ? m.extra : keys.find(k => !taken.has(k)) || keys[id % keys.length];
    }
    const P = this.mkPlayer(null, 'ainu');
    P.id = id; P.meshes = {};
    P.name = cleanName(m.name) || 'Ami ' + id;
    P.peerId = link.conn && link.conn.peer;
    P.color = (m.color | 0) % DOG_COLORS.length;
    const H = this.player;
    const a = (id / 6) * Math.PI * 2;
    P.pos.set(H.pos.x + Math.cos(a) * 2, H.pos.y + 0.5, H.pos.z + Math.sin(a) * 2);
    P.lastSafe.copy(H.pos); P.vel.set(0, 6, 0); P.grounded = false; P.jumps = 1; P.invuln = 1.5; P.yaw = H.yaw;
    P.uid = uid;
    // il revient après une coupure : même chien, même endroit
    const gh = uid && ghosts.get(uid);
    if (gh && Date.now() - gh.at < 5 * 60000) {
      if (gh.level === L.ID) { P.pos.set(gh.x, gh.y + 0.5, gh.z); P.lastSafe.set(gh.x, gh.y, gh.z); }
      if (!this.players.some(Q => Q.kind === gh.kind) && (gh.kind === mainOther || M.FRIENDS[gh.kind])) kind = gh.kind;
    }
    ghosts.delete(uid);
    this.dogMesh(P, kind);
    this.party.set(id, P);
    this.remoteIn.set(id, { mx: 0, mz: 0, h: false, pressed: new Set() });
    link.pid = id;
    link.lastSave = undefined;
    this.coop = { isHost: true };
    if (m.sv && typeof m.sv === 'object' && m.sv.intro) {
      try { const before = JSON.stringify(this.save); mergeSave(this.save, m.sv); if (JSON.stringify(this.save) !== before) { this.applySave(this.save); this.persist(); } } catch (e) { /* ignore */ }
    }
    // l'hôte quitte le duo : chacun son chien
    if (this.player.kind === 'duo') this.dogMesh(this.player, this.hostKind);
    if (!this.dom.overlay.classList.contains('hidden')) this.paused = false;
    // le monde se souvient de ses visiteurs
    const v = this.save.visitors || (this.save.visitors = []);
    if (!v.includes(P.name)) { v.push(P.name); if (v.length > 30) v.shift(); this.persist(); }
    link.send({ t: 'welcome', id });
    this.broadcastRoster();
    this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 14, 0xfff0a0, 3, 0.6);
    this.banner(`${P.name} arrive avec ${dogName(kind)} !`, `${this.party.size} joueurs dans le monde`, 2400);
    this.micHint();
    this.sound('reveal');
  }

  onLinkClose(link) {
    if (this.disposed) return;
    this.hostSession.links.delete(link);
    if (link.replaced) return;   // (il est revenu par un nouveau lien : son chien reste)
    const P = this.party.get(link.pid);
    if (!P) return;
    if (P.uid) ghosts.set(P.uid, { at: Date.now(), level: L.ID, x: P.lastSafe.x, y: P.lastSafe.y, z: P.lastSafe.z, kind: P.kind });
    this.party.delete(link.pid);
    this.remoteIn.delete(link.pid);
    for (const k in P.meshes) { this.scene.remove(P.meshes[k]); }
    this.scene.remove(P.shadow);
    if (P.tag) this.scene.remove(P.tag);
    if (P.voiceMark) this.scene.remove(P.voiceMark);
    if (this.party.size === 1) { this.coop = null; this.dogMesh(this.player, 'duo'); }
    this.broadcastRoster();
    if (link.dropped) this.localBanner(`${P.name} a perdu la connexion`, 'Son chien revient dès que ça repasse !', 2600);
    else this.localBanner(`${P.name} est parti`, `Il peut revenir avec le code ${this.hostSession.code}.`, 2600);
  }

  broadcastRoster() {
    const list = this.players.map(P => ({ id: P.id, kind: P.kind, color: P.color, name: P.name, pid: P.peerId }));
    for (const l of this.hostSession.links) if (!l.closed && l.pid !== undefined) l.send({ t: 'roster', list });
    this.updateRoster();
  }

  coopAfterStep() {
    if (this.guest || !this.hostSession || (this.coopTick = (this.coopTick + 1) % 3) !== 0) return;
    const links = [...this.hostSession.links].filter(l => !l.closed && l.pid !== undefined);
    if (!links.length) { this.coopEvents.length = 0; return; }
    const r = (v) => Math.round(v * 100) / 100;
    const pp = this.puppy, d = this.dialog;
    const pack = (P) => [P.id, r(P.pos.x), r(P.pos.y), r(P.pos.z), r(P.vel.x), r(P.vel.y), r(P.vel.z), r(P.yaw), (P.grounded ? 1 : 0) | (P.gliding ? 2 : 0) | (P.down ? 4 : 0),
      r(P.attackT), r(P.dashT), r(P.flipT), r(P.cheerT), r(P.invuln), P.hearts, P.score, r(P.barkT || 0), r(P.trickT || 0)];
    const base = {
      t: 's', time: r(this.t),
      pl: this.players.map(pack),
      c: this.cats.map(c => (c.dead ? 0 : [r(c.pos.x), r(c.pos.y), r(c.pos.z), r(c.yaw), r(c.phase), c.chasing ? 1 : 0])),
      pp: [pp.state, r(pp.pos.x), r(pp.pos.y), r(pp.pos.z), r(pp.yaw), r(pp.phase)],
      hp: this.hearts.filter(h => !h.taken).map(h => [r(h.x), r(h.y), r(h.z)]),
      d: d ? [d.lines[d.i].who, d.lines[d.i].text, Math.floor(d.chars)] : 0,
      ev: this.coopEvents.splice(0),
      pt: (this.portals || []).map(p => [p.n, Math.round(p.t * 10) / 10, p.locked ? 1 : 0]),
    };
    if (this.levelLogic) base.x = this.levelLogic.snapshot();
    const sv = JSON.stringify(Object.assign({}, this.save, { time: 0 }));
    for (const l of links) {
      // réseau encombré : on saute cet état plutôt que d'empiler du retard (l'état suivant le remplace)
      if (l.backlog > 48000) { l.skipped = (l.skipped || 0) + 1; continue; }
      const P = this.party.get(l.pid);
      const msg = Object.assign({}, base, { n: P && P.nearby ? (P.nearby.label || (P.nearby.kind === 'sign' ? 'LIRE' : 'PARLER')) : '' });
      if (sv !== l.lastSave) { msg.sv = this.save; l.lastSave = sv; }
      l.send(msg);
    }
  }

  onCoopMessage(m) {
    if (!this.guest) return;
    if (m.t === 'level' && m.id !== L.ID) this.guestSwitch(m.id);
    else if (m.t === 'welcome') { this.myId = m.id; this.camInit = false; this.updateRoster(); this.welcomeBanner(); }
    else if (m.t === 'roster') this.syncRoster(m.list);
    else if (m.t === 's') this.applySnapshot(m);
    else if (m.t === 'full') this.showOverlay('full');
    else if (m.t === 'bye') { this.hostBye = true; this.onCoopClose(); }
  }

  welcomeBanner() {
    const P = this.me;
    setTimeout(() => {
      if (this.disposed) return;
      this.localBanner(`Bienvenue, ${P.name} !`, `Tu joues ${dogName(P.kind)} dans le monde de ${this.player.name}.`, 3600);
      this.micHint();
    }, 600);
  }

  /** Invité : met à jour la liste des chiens présents. */
  syncRoster(list) {
    this.lastRoster = list;
    const ids = new Set(list.map(e => e.id));
    for (const [id, P] of [...this.party]) {
      if (id === 0 || ids.has(id)) continue;
      for (const k in P.meshes) this.scene.remove(P.meshes[k]);
      this.scene.remove(P.shadow); if (P.tag) this.scene.remove(P.tag); if (P.voiceMark) this.scene.remove(P.voiceMark);
      this.party.delete(id);
    }
    for (const e of list) {
      let P = this.party.get(e.id);
      if (!P) { P = this.mkPlayer(null, 'ainu'); P.id = e.id; P.meshes = {}; this.party.set(e.id, P); }
      P.name = e.name; P.color = e.color; P.peerId = e.pid;
      if (P.kind !== e.kind || !P.mesh) this.dogMesh(P, e.kind);
    }
    this.coop.multi = this.party.size > 1;
    this.updateRoster();
  }

  /** Invité : l'hôte a changé de niveau, on recharge le même. */
  guestSwitch(id) {
    const coop = this.coop;
    coop.link.onmessage = null; coop.link.onclose = null;
    this.coop = null;
    this.dispose();
    start({ sfx: this.sfx, onExit: this.onExit, coop, level: id });
  }

  onCoopClose() {
    if (this.disposed || !this.guest || this.handingOff) return;
    const link = this.coop.link, code = link.code, AC = window.AdvCoop;
    if (!code || !AC) { this.showOverlay('lost'); return; }
    // le gardien du monde est parti : le monde continue. Un des amis encore là le
    // reprend (toujours le même, choisi pareil par tout le monde), les autres le rejoignent.
    this.handingOff = true;
    const hostPid = link.conn && link.conn.peer, me = link.peer && link.peer.id;
    const pids = (this.lastRoster || []).map(e => e.pid).filter(p => p && p !== hostPid).sort();
    const keeper = pids[0] === me;
    const { sfx, onExit } = this, profile = this.coop.profile, level = L.ID;
    const hostName = this.player.name;
    this.dispose();
    const LD = window.AppLoader, dropped = !this.hostBye;
    if (LD && dropped) { LD.show('Oups, la connexion a sauté !', `On revient dans le monde de ${hostName || 'ton ami'}…`); LD.progress(0.1, 'Reconnexion…'); }
    else if (LD) { LD.show('Le monde continue !', `${hostName || 'Le gardien'} est parti${keeper ? ' : tu deviens le gardien du monde ' + code : ', on reste dans le monde ' + code}`); LD.progress(0.1, 'Passage de relais…'); }
    const back = (msg) => { if (LD) LD.hide(); onExit(); if (msg) setTimeout(() => alert(msg), 50); };
    // (le serveur de mise en relation met un instant à libérer le nom du monde)
    const becomeKeeper = () => AC.host(profile, {
      onCode: (c, ses) => { ses.level = level; start({ sfx, onExit, coopHost: ses, level }); },
      onError: () => AC.join(code, { onReady: asGuest, onError: back }),   // un autre ami l'a repris avant
    }, { code, noTaken: true, maxTries: 10 });
    const asGuest = (lk, lv) => start({ sfx, onExit, coop: { link: lk, isHost: false, profile }, level: lv });
    if (dropped) {
      // la connexion a sauté (le gardien, lui, n'a rien dit) : on revient tout de suite dans son monde.
      // S'il n'est vraiment plus là, le monde continue comme d'habitude.
      const fallback = () => (keeper ? becomeKeeper() : AC.join(code, { onReady: asGuest, onError: back, onEmpty: becomeKeeper }, { retryFor: 20000 }));
      AC.join(code, { onReady: asGuest, onError: fallback, onEmpty: fallback }, { retryFor: 15000 });
      return;
    }
    if (keeper) becomeKeeper();
    else AC.join(code, { onReady: asGuest, onError: back, onEmpty: becomeKeeper }, { retryFor: 20000 });
  }

  /** Invité : envoie ses commandes, suit l'état reçu de l'hôte. */
  guestFrame(dt) {
    this.t += dt;
    const input = this.readInput();
    this.stepCamera(dt);
    const [mx, mz] = this.worldMove(input.x, input.y);
    const p = [...this.pressed]; this.pressed.clear();
    const ls = this.lastSent, now = performance.now();
    if (p.length || Math.abs(mx - ls.mx) > 0.04 || Math.abs(mz - ls.mz) > 0.04 || input.jumpHeld !== ls.h || now - ls.at > 120) {
      this.coop.link.send({ t: 'in', mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, h: input.jumpHeld, p });
      Object.assign(ls, { mx, mz, h: input.jumpHeld, at: now });
    }
    const s = this.snap;
    for (const P of this.players) for (const k of ['attackT', 'dashT', 'flipT', 'cheerT', 'invuln']) P[k] = Math.max(0, P[k] - dt);
    if (s) {
      const age = Math.min(0.15, (now - this.snapAt) / 1000), k = 1 - Math.exp(-dt * 16);
      for (const q of s.pl) {
        const P = this.party.get(q[0]);
        if (!P) continue;
        const tgt = new THREE.Vector3(q[1] + q[4] * age, q[2] + (q[8] & 1 ? 0 : q[5] * age), q[3] + q[6] * age);
        if (P.pos.distanceTo(tgt) > 4) P.pos.copy(tgt); else P.pos.lerp(tgt, k);
        P.yaw = lerpAngle(P.yaw, q[7], k);
      }
      s.c.forEach((d, i) => {
        const c = this.cats[i];
        if (!d || !c) return;
        c.pos.x += (d[0] - c.pos.x) * k; c.pos.y += (d[1] - c.pos.y) * k; c.pos.z += (d[2] - c.pos.z) * k;
        c.yaw = lerpAngle(c.yaw, d[3], k); c.phase += (d[4] - c.phase) * k;
      });
      const pp = this.puppy, e = s.pp;
      if (pp.pos.distanceTo(new THREE.Vector3(e[1], e[2], e[3])) > 6) pp.pos.set(e[1], e[2], e[3]);
      else { pp.pos.x += (e[1] - pp.pos.x) * k; pp.pos.y += (e[2] - pp.pos.y) * k; pp.pos.z += (e[3] - pp.pos.z) * k; }
      pp.yaw = lerpAngle(pp.yaw, e[4], k); pp.phase += (e[5] - pp.phase) * k;
    }
    this.stepParticles(dt);
  }

  applySnapshot(s) {
    this.snap = s; this.snapAt = performance.now();
    if (Math.abs(this.t - s.time) > 0.3) this.t = s.time;
    if (s.sv) this.applySave(s.sv);
    const hp0 = this.me.hearts, sc0 = this.me.score;
    for (const q of s.pl) {
      const P = this.party.get(q[0]);
      if (!P) continue;
      P.vel.set(q[4], q[5], q[6]);
      P.grounded = !!(q[8] & 1); P.gliding = !!(q[8] & 2); P.down = !!(q[8] & 4);
      if (q[11] > P.flipT + 0.1 || q[11] === 0) P.flipT = q[11];
      P.attackT = q[9]; P.dashT = q[10]; P.cheerT = q[12]; P.invuln = q[13]; P.hearts = q[14]; P.score = q[15] || 0;
      if ((q[16] || 0) > (P.barkT || 0) + 0.2) { this.bubble(P, 'Ouaf !'); this.barkReact(P); }
      P.barkT = q[16] || 0; P.trickT = q[17] || 0;
    }
    if (this.myId !== undefined && this.me.score > sc0) addToProfile(this.me.score - sc0);
    if (this.me.hearts !== hp0) this.updateHud();
    s.c.forEach((d, i) => {
      const c = this.cats[i];
      if (!c) return;
      if (!d) { c.dead = true; c.mesh.visible = false; return; }
      if (c.dead) { c.dead = false; c.mesh.visible = true; c.pos.set(d[0], d[1], d[2]); }
      c.chasing = !!d[5];
    });
    const pp = this.puppy;
    if (pp.state !== s.pp[0]) { pp.state = s.pp[0]; this.updateHud(); }
    // cœurs à ramasser
    const hk = JSON.stringify(s.hp);
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      for (const h of this.hearts) this.scene.remove(h.mesh);
      this.hearts = [];
      for (const h of s.hp) this.spawnHeart(h[0], h[1], h[2]);
    }
    // dialogue
    const dl = this.dom.dialog;
    if (s.d) {
      const before = this.dialog ? this.dialog.chars : 0;
      this.dialog = { remote: true, chars: s.d[2] };
      dl.classList.remove('hidden');
      this.dom.dname.textContent = s.d[0];
      this.dom.dtext.textContent = s.d[1].slice(0, s.d[2]);
      dl.classList.toggle('done', s.d[2] >= s.d[1].length);
      const key = s.d[0] + '|' + s.d[1];
      if (this.remoteLine !== key) { this.remoteLine = key; this.remoteVoiced = speak(this.sfx, s.d[0], s.d[1]) > 0; if (this.sfx && this.sfx.duck) this.sfx.duck(true, 'dialog'); }
      if (!this.remoteVoiced && s.d[2] > before && s.d[2] < s.d[1].length) this.voice(s.d[0]);
    } else if (this.dialog) {
      this.dialog = null; dl.classList.add('hidden'); this.remoteLine = null;
      stopVoice(this.sfx); if (this.sfx && this.sfx.duck) this.sfx.duck(false, 'dialog');
    }
    // bouton « parler »
    this.nearby = s.n ? { kind: s.n } : null;
    this.dom.talkBtn.classList.toggle('hidden', !s.n);
    this.dom.talkBtn.textContent = s.n;
    const prompt = this.dom.prompt;
    if (s.n && !this.isTouch) { prompt.textContent = `F : ${s.n.toLowerCase()}`; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
    if (s.x && this.levelLogic) this.levelLogic.apply(s.x);
    if (s.pt && this.portals) s.pt.forEach(([n, t, lk], i) => { const p = this.portals[i]; if (p) { p.n = n; p.t = t; if (!!lk !== p.locked) this.setPortalLock(p, !!lk); } });
    // effets
    for (const [n, ...a] of s.ev) {
      if (n === 'overlay') this.showOverlay(a[0]);
      else if (['sound', 'burst', 'banner', 'fade'].includes(n)) this[n](...a);
    }
  }

  applySave(sv) {
    this.save = Object.assign(this.emptySave(), sv);
    const s = this.save;
    this.boneTaken = new Set(Object.keys(s.gone || {}));
    for (const b of this.balls) { b.taken = s.balls.includes(b.def.id); b.mesh.visible = !b.taken; }
    this.pedestalBalls.forEach((b, i) => { b.visible = i < s.balls.length; });
    for (const c of this.crates) { c.broken = s.crates.includes(c.def.id); c.mesh.visible = !c.broken; }
    for (const m of this.medals) m.taken = s.medals.includes(m.def.id);
    this.updateMedalVisibility();
    if (this.levelLogic && this.levelLogic.applySave) this.levelLogic.applySave();
    this.updateHud();
    if (this.guest) this.writeSave();   // copie du monde : on pourra le rouvrir si le gardien s'en va
  }

  // -------------------------------------------------------------------------
  // Physique
  // -------------------------------------------------------------------------
  /** Sol sous (x, z) pour des pieds à la hauteur y (terrain, plates-formes, caisses). */
  support(x, z, y) {
    const s = L.supportAt(x, z, y, this.t, STEP_UP);
    for (const c of this.crates) {
      if (c.broken) continue;
      const top = c.def.y + 1.2;
      if (top > s.y && top <= y + STEP_UP && Math.abs(x - c.def.x) < 0.85 && Math.abs(z - c.def.z) < 0.85) { s.y = top; s.collider = c; }
    }
    return s;
  }

  /** Repousse un cercle hors des obstacles solides (troncs, rochers, caisses). */
  pushOut(p, y, rad) {
    const r = rad || PLAYER_R;
    const solids = [];
    for (const c of (L.near ? L.near(p.x, p.z, r + 1) : L.colliders)) if ((SOLID.has(c.kind) || c.solid) && !c.off) solids.push(c);
    for (const c of this.crates) if (!c.broken) solids.push({ type: 'box', x: c.def.x, z: c.def.z, w: 1.2, d: 1.2, y0: c.def.y, y1: c.def.y + 1.2 });
    for (const c of solids) {
      if (c.y1 <= y + 0.35 || c.y0 >= y + 1.5) continue;
      if (c.type === 'cyl') {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-6) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
      } else {
        const hx = c.w / 2, hz = c.d / 2;
        const cx = clamp(p.x, c.x - hx, c.x + hx), cz = clamp(p.z, c.z - hz, c.z + hz);
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-6) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
          else {
            const ox = hx - Math.abs(p.x - c.x) + r, oz = hz - Math.abs(p.z - c.z) + r;
            if (ox < oz) p.x += Math.sign(p.x - c.x || 1) * ox; else p.z += Math.sign(p.z - c.z || 1) * oz;
          }
        }
      }
    }
  }

  stepPlayer(dt, input, P, pr) {
    P = P || this.player;
    pr = pr || this.pressed;
    if (P.down) pr = new Set();
    const ap = pr, mp = pr;
    // Direction souhaitée, relative à la caméra (ou déjà dans le monde, à deux)
    let [wx, wz] = input.wx !== undefined ? [input.wx, input.wz] : this.worldMove(input.x, input.y);
    // tombé (à plusieurs) : il attend qu'un ami vienne le relever
    if (P.down) { wx = 0; wz = 0; input = Object.assign({}, input, { jumpHeld: false }); pr = new Set(); }
    const wlen = Math.hypot(wx, wz);
    // en kart (niveau 3) : c'est la ville qui gère la conduite
    if (this.levelLogic && this.levelLogic.playerStep && this.levelLogic.playerStep(P, wx, wz, input.jumpHeld, pr, dt)) return;

    P.invuln = Math.max(0, P.invuln - dt);
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.flipT = Math.max(0, P.flipT - dt);
    P.cheerT = Math.max(0, P.cheerT - dt);
    P.barkT = Math.max(0, (P.barkT || 0) - dt); P.trickT = Math.max(0, (P.trickT || 0) - dt);
    if (P.grounded) { P.coyote = 0.12; P.jumps = 0; P.airDash = false; } else P.coyote -= dt;

    // Actions
    if (!this.dialog && this.freeze <= 0) {
      if (pr.has('talk') && P.nearby) { this.interact(P.nearby, P); pr.delete('talk'); }
      const onGround = P.coyote > 0 && P.jumps === 0;
      // saut demandé un peu trop tôt (double saut déjà utilisé) : gardé en mémoire jusqu'à l'atterrissage
      if (ap.has('jump') && !onGround && P.jumps >= 2) P.jumpBuf = 0.18;
      P.jumpBuf = Math.max(0, (P.jumpBuf || 0) - dt);
      if ((ap.has('jump') || P.jumpBuf > 0) && onGround) {
        P.vel.y = JUMP_V; P.jumps = 1; P.grounded = false; P.coyote = 0; P.jumpBuf = 0;
        this.sound('jump');
        this.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 6, 0xf0e0c0, 2.5, 0.35);
      } else if (mp.has('jump') && !onGround) {
        if (P.jumps < 2) {
          P.vel.y = DOUBLE_JUMP_V; P.jumps = 2; P.flipT = 0.45;
          this.sound('double');
          this.burst(P.pos.x, P.pos.y + 0.5, P.pos.z, 10, 0x8bc34a, 3, 0.4);
        }
      }
      // Ouaf ! (les chats sursautent, Biscotte répond) et pirouette
      // deux « Ouaf ! » d'affilée : pirouette (un bouton de moins à l'écran)
      if (mp.has('bark') && P.barkT > 0 && P.barkT < 0.62 && P.grounded && P.trickT <= 0 && P.attackT <= 0) { P.trickT = 0.9; P.vel.y = 7.5; P.grounded = false; P.jumps = 1; this.sound('trick'); this.betise(P, 'tricks'); }
      else if (mp.has('bark') && P.barkT <= 0) { P.barkT = 0.7; this.dogBark(P); }
      if (mp.has('trick') && P.grounded && P.trickT <= 0 && P.attackT <= 0) { P.trickT = 0.9; P.vel.y = 7.5; P.grounded = false; P.jumps = 1; this.sound('trick'); this.betise(P, 'tricks'); }
      // deuxième appui pendant la toupie (en duo) : Ainu lance Matcha !
      if (mp.has('attack') && P.attackT > 0 && P.attackT < ATTACK_TIME - 0.05 && !this.throwM && P.mesh && P.mesh.userData.ainu && P.mesh.userData.matcha.visible && P === this.player && this.party.size === 1) this.throwMatcha(P, wx, wz, wlen);
      else if (mp.has('attack') && P.attackT <= 0) {
        P.attackT = ATTACK_TIME; P.hitIds.clear();
        if (!P.grounded) P.vel.y = Math.max(P.vel.y, 2);
        this.sound('spin');
      }
      if (ap.has('dash') && P.dashCd <= 0 && (P.grounded || !P.airDash)) {
        P.dashT = DASH_TIME; P.dashCd = 0.6; P.hitIds.clear();
        if (!P.grounded) { P.airDash = true; P.vel.y = Math.max(P.vel.y, 3); }
        const dx = wlen > 0.2 ? wx / wlen : Math.sin(P.yaw), dz = wlen > 0.2 ? wz / wlen : Math.cos(P.yaw);
        P.yaw = Math.atan2(dx, dz);
        this.sound('dash');
      }
    }

    // Vitesse horizontale
    if (P.dashT > 0) {
      P.dashT -= dt;
      P.vel.x = Math.sin(P.yaw) * DASH_SPEED; P.vel.z = Math.cos(P.yaw) * DASH_SPEED;
      if (this.t % 0.05 < dt) this.burst(P.pos.x, P.pos.y + 0.6, P.pos.z, 2, 0xffffff, 1, 0.25);
    } else {
      const target = RUN_SPEED * Math.min(1, wlen);
      const tx = wlen > 0.05 ? wx / wlen * target : 0, tz = wlen > 0.05 ? wz / wlen * target : 0;
      const acc = (P.grounded ? 55 : 20) * dt;
      const dvx = tx - P.vel.x, dvz = tz - P.vel.z, dl = Math.hypot(dvx, dvz);
      if (dl > acc) { P.vel.x += dvx / dl * acc; P.vel.z += dvz / dl * acc; } else { P.vel.x = tx; P.vel.z = tz; }
      if (wlen > 0.1) P.yaw = lerpAngle(P.yaw, Math.atan2(wx, wz), Math.min(1, dt * 14));
    }
    if (P.attackT > 0) P.attackT -= dt;

    // Gravité, planeur
    P.gliding = false;
    if (!P.grounded) {
      P.vel.y -= GRAVITY * dt;
      if (P.kind !== 'matcha' && (input.jumpHeld || (this.easy && P.jumps >= 1)) && P.vel.y < 0 && P.dashT <= 0 && (P.jumps >= 1 || P.coyote < -0.25)) {
        P.vel.y = Math.max(P.vel.y, -GLIDE_FALL);
        P.gliding = true;
      }
    }

    // Déplacement horizontal + collisions
    const prevY = P.pos.y;
    const wasGrounded = P.grounded;
    const next = { x: P.pos.x + P.vel.x * dt, z: P.pos.z + P.vel.z * dt };
    // Falaise / terrain trop raide = mur
    const blocked = (x, z) => L.heightAt(x, z) > P.pos.y + STEP_UP;
    if (blocked(next.x, next.z)) {
      if (!blocked(next.x, P.pos.z)) next.z = P.pos.z;
      else if (!blocked(P.pos.x, next.z)) next.x = P.pos.x;
      else { next.x = P.pos.x; next.z = P.pos.z; }
    }
    this.pushOut(next, P.pos.y);
    P.pos.x = next.x; P.pos.z = next.z;

    // Vertical
    P.pos.y += P.vel.y * dt;
    const sup = this.support(P.pos.x, P.pos.z, Math.max(prevY, P.pos.y));
    if (P.pos.y <= sup.y && P.vel.y <= 0) {
      if (!wasGrounded && P.vel.y < -14) this.burst(P.pos.x, sup.y + 0.1, P.pos.z, 8, 0xf0e0c0, 3, 0.4);
      P.pos.y = sup.y; P.vel.y = 0; P.grounded = true; P.onCol = sup.collider;
    } else if (wasGrounded && P.vel.y <= 0 && P.pos.y - sup.y < 0.45) {
      // Reste collé au sol en descente (pentes, ascenseur qui descend)
      P.pos.y = sup.y; P.vel.y = 0; P.grounded = true; P.onCol = sup.collider;
    } else {
      P.grounded = false; P.onCol = null;
    }
    // plates-formes mobiles (nacelles de la grande roue…) : elles emportent le chien
    if (P.grounded && P.onCol && P.onCol.dx !== undefined) {
      const nx = { x: P.pos.x + P.onCol.dx, z: P.pos.z + P.onCol.dz };
      P.pos.x = nx.x; P.pos.z = nx.z;
    }
    // Champignons rebondissants
    if (P.grounded && P.onCol && P.onCol.bounce) {
      P.vel.y = P.onCol.bounce; P.grounded = false; P.jumps = 1; P.coyote = 0;
      P.onCol.squashT = this.t;
      this.sound('boing');
      this.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 8, 0xffe0f0, 3, 0.4);
    }

    // planer longtemps, tomber de très haut (carnet des bêtises)
    if (P.gliding) { P.glideT = (P.glideT || 0) + dt; if (P.glideT > 5) { this.betise(P, 'glide'); P.glideT = -99; } }
    else if (P.grounded) P.glideT = 0;
    if (!P.grounded) P.airTop = Math.max(P.airTop === undefined ? P.pos.y : P.airTop, P.pos.y);
    else { if (P.airTop !== undefined && P.airTop - P.pos.y > 14) this.betise(P, 'fall_far'); P.airTop = P.pos.y; }

    // Point sûr pour réapparaître
    if (P.grounded && sup.y > 0.4 && !(sup.collider && sup.collider.moving) && this.t - P.lastSafeT > 0.4) {
      P.lastSafe.copy(P.pos); P.lastSafeT = this.t;
      // point de reprise après un K.O. : un endroit calme, sans chat autour
      if (!P.ko && this.t - (P.cpT || 0) > 2 && !this.cats.some(c => !c.dead && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 9)) {
        P.checkpoint = { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: this.camYaw - Math.PI }; P.cpT = this.t;
      }
    }
    // Plouf !
    if (P.pos.y < L.WATER_Y - 0.9) {
      this.burst(P.pos.x, L.WATER_Y + 0.2, P.pos.z, 16, 0x9ae0ff, 4, 0.6);
      this.sound('splash');
      this.betise(P, 'plouf');
      P.pos.copy(P.lastSafe); P.vel.set(0, 0, 0); P.invuln = 1; P.dashT = 0;
      if (P === this.player && this.puppy.state === 'follow') this.puppy.pos.copy(P.pos).add(new THREE.Vector3(1, 0, 1));
      this.banner('Plouf !', `${this.party.size > 1 ? P.name : (P.kind === 'matcha' ? 'Matcha' : 'Ainu')} n'aime pas l'eau…`, 1400);
    }

    // Attaques : chats et caisses
    const attacking = P.attackT > 0 || P.dashT > 0;
    if (attacking) {
      const reach = P.attackT > 0 ? 2.3 : 1.7;
      for (const c of this.cats) {
        if (c.dead || P.hitIds.has(c)) continue;
        if (c.pos.distanceTo(P.pos) < reach + 0.4 && Math.abs(c.pos.y - P.pos.y) < 1.6) { P.hitIds.add(c); this.defeatCat(c); }
      }
      for (const cr of this.crates) {
        if (cr.broken) continue;
        const d = Math.hypot(cr.def.x - P.pos.x, cr.def.z - P.pos.z);
        if (d < reach + 0.5 && P.pos.y < cr.def.y + 1.5 && P.pos.y > cr.def.y - 1.5) this.breakCrate(cr);
      }
    }
    if (P.attackT > 0 && this.t % 0.04 < dt) {
      const a = this.t * 30;
      this.spawnParticle(P.pos.x + Math.cos(a) * 1.6, P.pos.y + 0.8, P.pos.z + Math.sin(a) * 1.6, 0, 0.5, 0, 0xffe0a0, 0.18, 0.25);
    }
  }

  hurtPlayer(from, P) {
    P = P || this.player;
    if (P.invuln > 0 || P.down) return;
    if (!this.easy) P.hearts--;   // en Promenade, on est juste repoussé
    P.invuln = 1.6;
    const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    P.vel.set(dx / d * 9, 7, dz / d * 9);
    P.grounded = false;
    this.sound('hurt');
    this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 10, 0xff6a6a, 3.5, 0.5);
    this.updateHud();
    if (P.hearts <= 0 && !P.ko) {
      const solo = this.players.length === 1;
      P.ko = true;
      // à plusieurs : il tombe sur place, un ami vient le relever (câlin ou « Ouaf ! »)
      if (!solo && this.players.some(Q => Q !== P && !Q.ko)) {
        P.down = true; P.downT = 0; P.reviveT = 0;
        this.bubble(P, 'À l\'aide !');
        this.banner(`${P.name} est tombé !`, 'Va vite lui faire un câlin (ou aboie à côté de lui) !', 2600);
        return;
      }
      this.respawnKo(P, solo);
    }
  }

  /** Va relever les amis tombés : rester à côté d'eux ou aboyer près d'eux. */
  stepRevive(dt) {
    for (const P of this.players) {
      if (!P.down) continue;
      P.downT += dt;
      if ((P.downT % 3) < dt) this.bubble(P, 'À l\'aide !');
      let helper = null;
      for (const Q of this.players) {
        if (Q === P || Q.ko) continue;
        const d = Math.hypot(Q.pos.x - P.pos.x, Q.pos.z - P.pos.z);
        if (d < 4 && (Q.barkT || 0) > 0.5) { P.reviveT = 9; helper = Q; break; }
        if (d < 1.9) { P.reviveT += dt; helper = Q; }
      }
      if (helper && (this.t * 6 | 0) !== ((this.t - dt) * 6 | 0)) this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 3, 0xff8ab0, 1.5, 0.5);
      if (P.reviveT >= 1.2) {
        P.down = false; P.ko = false; P.hearts = MAX_HEARTS; P.invuln = 2; P.vel.set(0, 6, 0); P.grounded = false;
        this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 20, 0xff6a9a, 4, 0.7);
        this.sound('reveal');
        this.banner(`${helper.name} a relevé ${P.name} !`, 'Les amis, c\'est fait pour ça.', 2200);
        this.betise(helper, 'revive');
        this.updateHud();
      } else if (P.downT > 20 || !this.players.some(Q => Q !== P && !Q.ko)) {
        P.down = false;
        this.respawnKo(P, false);
      }
    }
  }

  respawnKo(P, solo) {
    if (solo) { this.freeze = 1.4; this.fade(true); }
      setTimeout(() => {
        if (this.disposed) return;
        P.ko = false;
        P.hearts = MAX_HEARTS;
        // on repart du dernier endroit calme (en mode Défi : du début du niveau)
        const cp = this.mode !== 'defi' && P.checkpoint;
        const sp = (this.levelLogic && this.levelLogic.respawn(P)) || cp || L.START;
        P.pos.set(sp.x + (P.kind === 'matcha' ? 1.2 : 0), sp.y, sp.z); P.vel.set(0, 0, 0); P.invuln = 2;
        if (P === this.me) this.camYaw = (sp.yaw === undefined ? Math.PI : sp.yaw) + Math.PI;
        if (P === this.player && this.puppy.state === 'follow') this.puppy.pos.copy(P.pos);
        this.updateHud();
        if (solo) this.fade(false);
        this.banner('Ouille !', cp && sp === cp ? (solo ? 'On repart d\'un peu plus loin, avec tous tes trésors.' : `${P.name} repart d'un peu plus loin.`) : (solo ? 'On repart du début, avec tous tes trésors.' : `${P.name} repart du début.`), 2400);
      }, 700);
  }

  // -------------------------------------------------------------------------
  // Caméra
  // -------------------------------------------------------------------------
  stepCamera(dt) {
    const P = this.me;
    const ci = this.camInput;
    if (Math.abs(ci.dx) > 0.01 || Math.abs(ci.dy) > 0.01) {
      this.camYaw -= ci.dx * 0.006;
      this.camPitch = clamp(this.camPitch + ci.dy * 0.004, 0.05, 1.15);
      this.lastCamManual = this.t;
      ci.dx = 0; ci.dy = 0;
    }
    // Suit doucement le duo quand il court (sauf si on vient de tourner la caméra)
    const speed = Math.hypot(P.vel.x, P.vel.z);
    if (P.kart) {
      // en kart : la caméra se replace vite derrière le volant
      if (this.t - this.lastCamManual > 0.8 && Math.abs(P.kart.speed) > 1) this.camYaw = lerpAngle(this.camYaw, P.kart.yaw + Math.PI, Math.min(1, dt * 3.2));
    } else if (this.camFocus) {
      // combat : la caméra se place derrière le chien, tournée vers le boss
      const f = this.camFocus;
      if (this.t - this.lastCamManual > 1.2 && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) > 1.5) this.camYaw = lerpAngle(this.camYaw, Math.atan2(P.pos.x - f.x, P.pos.z - f.z), Math.min(1, dt * 2.2));
    } else if (this.t - this.lastCamManual > 1.5 && speed > 2 && !this.dialog) {
      this.camYaw = lerpAngle(this.camYaw, P.yaw + Math.PI, Math.min(1, dt * 0.9 * (speed / RUN_SPEED)));
    }
  }

  // -------------------------------------------------------------------------
  // Chats bandits
  // -------------------------------------------------------------------------
  stepCats(dt) {
    for (const c of this.cats) {
      if (c.alert) c.alert.visible = !c.dead && (c.warn > 0 || (c.chasing && this.t - c.warnAt < 1));
      if (c.dead) {
        c.shadow.visible = false;
        // le chat touché s'envole en boule de poils, tourne, puis disparaît
        if (c.fly) {
          const f = c.fly;
          f.t += dt; f.vy -= 22 * dt;
          c.mesh.position.x += f.vx * dt; c.mesh.position.y += f.vy * dt; c.mesh.position.z += f.vz * dt;
          c.mesh.rotation.x += dt * 14; c.mesh.rotation.z += dt * 9;
          const k = Math.max(0.2, 1 - f.t * 0.6); c.mesh.scale.setScalar(k);
          if (f.t > 0.85) {
            c.fly = null; c.mesh.visible = false; c.mesh.rotation.set(0, c.yaw, 0); c.mesh.scale.setScalar(1);
            this.burst(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, 12, 0xffffff, 3, 0.5);
            this.sound('poof');
          }
        }
        continue;
      }
      const P = this.nearestPlayer(c.pos);
      c.t -= dt;
      c.stun = Math.max(0, c.stun - dt);
      const toP = new THREE.Vector3(P.pos.x - c.pos.x, 0, P.pos.z - c.pos.z);
      const dist = toP.length();
      let speed = 0, dir = null;
      const fromHome = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);
      // un gros « OUAF ! » : le chat saute en l'air et détale loin du chien
      if (c.flee > 0) {
        c.flee -= dt; c.hopT = Math.max(0, (c.hopT || 0) - dt);
        const ax = c.pos.x - c.fleeX, az = c.pos.z - c.fleeZ, l = Math.hypot(ax, az) || 1;
        const fx = c.pos.x + ax / l * 6.5 * dt, fz = c.pos.z + az / l * 6.5 * dt, h = L.heightAt(fx, fz);
        if (h > 0.5 && Math.abs(h - c.pos.y) < 0.8 && !(L.blockedAt && L.blockedAt(fx, fz))) { c.pos.x = fx; c.pos.z = fz; c.pos.y = h; }
        c.yaw = lerpAngle(c.yaw, Math.atan2(ax, az), Math.min(1, dt * 12));
        c.phase += dt * 22;
        c.chasing = false;
        continue;
      }
      if (c.stun <= 0 && dist < 9 && Math.abs(P.pos.y - c.pos.y) < 3 && fromHome < 15 && !this.dialog) {
        dir = toP.normalize(); speed = 3.6;
        // il repère le duo : un « ! » au-dessus de la tête, il se ramasse… puis bondit
        if (!c.chasing) {
          c.warn = this.easy ? 0.9 : 0.6; c.warnAt = this.t;
          if (!c.alert) { c.alert = this.makeMark('!', 0xff5a3a); c.alert.scale.set(0.7, 0.7, 1); this.scene.add(c.alert); }
          if (this.t - (c.lastMeow || -9) > 4) { c.lastMeow = this.t; this.sound('meowHi'); }
          if (this.sfx && this.sfx.stinger) this.sfx.stinger('danger');
        }
        c.chasing = true;
        if (c.warn > 0) { c.warn -= dt; speed = 0; c.yaw = lerpAngle(c.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 10)); }
      } else {
        c.chasing = false;
        if (!c.target || c.t <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
          c.target = new THREE.Vector3(c.home.x + Math.cos(a) * r, 0, c.home.z + Math.sin(a) * r);
          c.t = 2 + Math.random() * 3;
        }
        const tv = new THREE.Vector3(c.target.x - c.pos.x, 0, c.target.z - c.pos.z);
        if (tv.length() > 0.5) { dir = tv.normalize(); speed = 1.5; }
      }
      if (c.alert) c.alert.position.set(c.pos.x, c.pos.y + 1.55 + Math.sin(this.t * 12) * 0.05, c.pos.z);
      if (dir && speed > 0) {
        const nx = c.pos.x + dir.x * speed * dt, nz = c.pos.z + dir.z * speed * dt;
        const h = L.heightAt(nx, nz);
        if (h > 0.5 && Math.abs(h - c.pos.y) < 0.8 && !(L.blockedAt && L.blockedAt(nx, nz))) { c.pos.x = nx; c.pos.z = nz; c.pos.y = h; }
        c.yaw = lerpAngle(c.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 8));
        c.phase += dt * speed * 3;
      }
      // Contact avec le duo
      const dy = P.pos.y - c.pos.y;
      if (P.kart && dist < 1.9 && dy > -1 && dy < 2) {
        // en kart : on bouscule les chats si on roule, sinon ils ne peuvent rien
        if (Math.abs(P.kart.speed) > 3) this.defeatCat(c);
      } else if (dist < 1.25 && dy > -1 && dy < 1.6) {
        if (P.attackT > 0 || P.dashT > 0) this.defeatCat(c);
        else if (P.vel.y < -1 && dy > 0.5) { this.defeatCat(c); P.vel.y = 11; P.jumps = 1; }
        else this.hurtPlayer(c.pos, P);
      }
    }
  }

  defeatCat(c) {
    if (c.dead) return;
    c.dead = true;
    c.deadAt = this.t;
    // il s'envole, loin du chien qui l'a touché
    const P = this.nearestPlayer(c.pos), dx = c.pos.x - P.pos.x, dz = c.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    c.fly = { vx: dx / d * 7, vy: 9, vz: dz / d * 7, t: 0 };
    c.mesh.position.copy(c.pos);
    this.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 18, 0xffffff, 4, 0.6);
    this.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 8, 0x8a8a9a, 3, 0.5);
    this.kick(0.3, 0.06);
    this.sound('meow');
    if (c.def.group === 'clearing') {
      this.save.cats.push(c.def.id);
      this.persist();
      const left = L.cats.filter(k => k.group === 'clearing' && !this.save.cats.includes(k.id)).length;
      if (left === 0) {
        this.updateMedalVisibility();
        this.banner('Les chats bandits ont fui !', `Une Médaille Patoune est apparue ${L.CAT_PLACE} !`, 3000);
        this.sound('reveal');
      } else this.banner('Miaou… !', `Encore ${left} chat${left > 1 ? 's' : ''} bandit${left > 1 ? 's' : ''} ${L.CAT_PLACE}`, 1600);
    }
  }

  breakCrate(cr) {
    cr.broken = true;
    this.betise(this.me, 'crates');
    cr.mesh.visible = false;
    this.save.crates.push(cr.def.id);
    if (cr.def.content !== 'medal') this.save.crateT[cr.def.id] = Date.now();
    this.persist();
    this.burst(cr.def.x, cr.def.y + 0.6, cr.def.z, 16, 0xb07a3a, 4.5, 0.6);
    this.sound('crate');
    if (cr.def.content === 'heart') this.spawnHeart(cr.def.x, cr.def.y + 0.9, cr.def.z);
    if (cr.def.content === 'medal') {
      this.updateMedalVisibility();
      this.banner('Une Médaille Patoune !', 'Elle était cachée dans la caisse !', 2200);
      this.sound('reveal');
    }
  }

  spawnHeart(x, y, z) {
    const m = M.buildHeart();
    m.position.set(x, y, z);
    this.scene.add(m);
    this.hearts.push({ mesh: m, x, y, z });
  }

  // -------------------------------------------------------------------------
  // Personnages et dialogues
  // -------------------------------------------------------------------------
  stepNpcs(dt) {
    const P = this.player;
    const pp = this.puppy;
    // Biscotte suit le duo
    if (pp.state === 'follow') {
      const tx = P.pos.x - Math.sin(P.yaw) * 1.8, tz = P.pos.z - Math.cos(P.yaw) * 1.8;
      const dx = tx - pp.pos.x, dz = tz - pp.pos.z, d = Math.hypot(dx, dz);
      if (d > 16) pp.pos.set(tx, P.pos.y, tz);
      else if (d > 0.3) {
        const sp = Math.min(d * 3, 10) * dt;
        pp.pos.x += dx / d * sp; pp.pos.z += dz / d * sp;
        pp.yaw = lerpAngle(pp.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
        pp.phase += sp * 4;
      }
      const s = this.support(pp.pos.x, pp.pos.z, Math.max(pp.pos.y, P.pos.y) + 0.5);
      pp.pos.y += (s.y - pp.pos.y) * Math.min(1, dt * 12);
      if (pp.pos.y < 0) pp.pos.copy(P.pos);
      // Arrivée chez Mamie
      const near = Math.min(Math.hypot(pp.pos.x - L.npcs.mamie.x, pp.pos.z - L.npcs.mamie.z), Math.hypot(P.pos.x - L.npcs.mamie.x, P.pos.z - L.npcs.mamie.z));
      if (near < 7 && !this.dialog) this.puppyHome();
    } else if (pp.state === 'home') {
      pp.yaw = Math.atan2(P.pos.x - pp.pos.x, P.pos.z - pp.pos.z);
    } else {
      pp.yaw = Math.sin(this.t) * 0.8;
    }

    // Interaction la plus proche (pour chaque chien)
    const cand = [{ kind: 'mamie', x: L.npcs.mamie.x, z: L.npcs.mamie.z, y: L.npcs.mamie.y }];
    if (pp.state === 'lost') cand.push({ kind: 'puppy', x: pp.pos.x, z: pp.pos.z, y: pp.pos.y });
    else cand.push({ kind: 'pet', label: 'CARESSER', x: pp.pos.x, z: pp.pos.z, y: pp.pos.y });
    L.signs.forEach((s, i) => cand.push({ kind: 'sign', i, x: s.x, z: s.z, y: L.heightAt(s.x, s.z) }));
    const LG = this.levelLogic;
    for (const Q of this.players) {
      const own = LG && LG.nearFor ? LG.nearFor(Q) : undefined;
      if (own !== undefined) { Q.nearby = this.dialog ? null : own; continue; }
      let n = null, best = 3.4;
      for (const c of (LG && LG.extraCandidates ? cand.concat(LG.extraCandidates(Q)) : cand)) {
        const d = Math.hypot(c.x - Q.pos.x, c.z - Q.pos.z);
        if (d < best && Math.abs(c.y - Q.pos.y) < 3) { best = d; n = c; }
      }
      Q.nearby = this.dialog ? null : n;
    }
    const near = this.me.nearby;
    this.nearby = near;
    const label = near ? (near.label || (near.kind === 'sign' ? 'LIRE' : 'PARLER')) : '';
    this.dom.talkBtn.classList.toggle('hidden', !this.nearby);
    this.dom.talkBtn.textContent = label;
    const prompt = this.dom.prompt;
    if (this.nearby && !this.isTouch) { prompt.textContent = `F : ${label.toLowerCase()}`; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
  }

  /** Ouaf ! : bulle, aboiement, les chats proches sursautent, Biscotte répond. */
  dogBark(P) {
    this.sound(P.kind === 'matcha' ? 'barkM' : 'bark');
    if (P.mesh && P.mesh.userData.ainu) setTimeout(() => { if (!this.disposed) this.sound('barkM'); }, 220);   // Matcha aboie aussi
    this.bubble(P, 'Ouaf !');
    this.barkReact(P);
    if (L.npcs && L.npcs.mamie && Math.hypot(L.npcs.mamie.x - P.pos.x, L.npcs.mamie.z - P.pos.z) < 3.2) this.betise(P, 'mamie_bark');
    // le gros « OUAF ! » : onde de choc, l'écran tremble, et les chats détalent en hurlant
    this.sound('woof');
    if (P === this.me) this.kick(0.35, 0.05);
    let fled = 0;
    for (const c of this.cats || []) {
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (c.dead || d > 11) continue;
      c.flee = 2.6; c.fleeX = P.pos.x; c.fleeZ = P.pos.z; c.stun = 0; c.chasing = false; c.warn = 0; c.hopT = 0.45;
      this.betise(P, 'bark_cats');
      this.burst(c.pos.x, c.pos.y + 1.2, c.pos.z, 10, 0xffffff, 3.5, 0.5);
      if (fled++ < 3) setTimeout(() => { if (!this.disposed) this.sound('meowHi'); }, 120 + fled * 140);
    }
    if (fled) this.bubble({ pos: this.cats.find(c => c.flee > 0).pos, small: true }, 'Miaaaou !');
    const pp = this.puppy;
    if (pp && pp.state !== 'lost' && Math.hypot(pp.pos.x - P.pos.x, pp.pos.z - P.pos.z) < 10) setTimeout(() => { if (this.disposed) return; this.sound('yip'); pp.happyT = 1.2; this.bubble({ pos: pp.pos, mesh: pp.mesh, small: true }, 'Waf !'); }, 450);
  }

  /**
   * Le monde répond à l'aboiement : les os tout proches sautillent (on les repère),
   * des pétales s'envolent, et à plusieurs une patte lumineuse dit « viens ici ! ».
   */
  barkReact(P) {
    this.shockwave(P);
    this.boneHop = { x: P.pos.x, z: P.pos.z, t: this.t };
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.spawnParticle(P.pos.x + Math.cos(a) * 0.8, P.pos.y + 0.3, P.pos.z + Math.sin(a) * 0.8, Math.cos(a) * 2.2, 1.2 + Math.random(), Math.sin(a) * 2.2, [0xff9ac8, 0xfff07a, 0xffffff][i % 3], 0.22, 0.9, 1);
    }
    if (this.party.size > 1) this.pingAt(P);
  }
  /** Onde de choc du « OUAF ! » : deux anneaux qui s'élargissent au sol. */
  shockwave(P) {
    this.waves = this.waves || [];
    const y = this.support(P.pos.x, P.pos.z, P.pos.y + 0.3).y + 0.08;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color: i ? 0xffd23a : 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(P.pos.x, y + i * 0.02, P.pos.z); m.userData.noOutline = true; m.scale.setScalar(0.3);
      this.scene.add(m);
      this.waves.push({ m, t: -i * 0.12 });
    }
    // un souffle de poussière et de feuilles tout autour
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      this.spawnParticle(P.pos.x + Math.cos(a) * 0.6, y + 0.2, P.pos.z + Math.sin(a) * 0.6, Math.cos(a) * 7, 1 + Math.random(), Math.sin(a) * 7, i % 3 ? 0xe8dcc0 : 0x8ad04a, 0.3, 0.6, 2);
    }
  }
  stepWaves(dt) {
    if (!this.waves || !this.waves.length) return;
    this.waves = this.waves.filter((w) => {
      w.t += dt;
      if (w.t < 0) return true;
      const k = w.t / 0.55;
      if (k >= 1) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); return false; }
      w.m.scale.setScalar(0.3 + k * 10);
      w.m.material.opacity = 0.9 * (1 - k);
      return true;
    });
  }

  /** « Viens ici ! » : colonne de lumière à la couleur du joueur, visible de tous et sur la carte. */
  pingAt(P) {
    this.pings = this.pings || [];
    if (this.pings.some(g => g.P === P && this.t - g.t0 < 1.5)) return;
    const col = new THREE.Color(DOG_COLORS[(P.color || 0) % DOG_COLORS.length]);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.set(P.pos.x, P.pos.y + 7, P.pos.z); beam.userData.noOutline = true;
    const mark = this.makeMark('🐾', col.getHex()); mark.position.set(P.pos.x, P.pos.y + 3.2, P.pos.z);
    this.scene.add(beam); this.scene.add(mark);
    this.pings.push({ P, x: P.pos.x, z: P.pos.z, t0: this.t, beam, mark, col: '#' + col.getHexString() });
  }
  stepPings() {
    if (!this.pings || !this.pings.length) return;
    this.pings = this.pings.filter((g) => {
      const age = this.t - g.t0;
      if (age > 6) { this.scene.remove(g.beam); this.scene.remove(g.mark); g.beam.geometry.dispose(); g.beam.material.dispose(); return false; }
      g.beam.material.opacity = 0.35 * Math.min(1, (6 - age) / 1.5) * (0.8 + Math.sin(age * 6) * 0.2);
      g.mark.position.y = g.beam.position.y - 3.8 + Math.sin(age * 3) * 0.15;
      return true;
    });
  }

  /**
   * Ainu lance Matcha (en duo) : elle file droit devant, ramasse les os, renverse les
   * chats, casse les caisses… puis revient se poser sur son dos.
   */
  throwMatcha(P, wx, wz, wlen) {
    const u = P.mesh.userData;
    const dx = wlen > 0.2 ? wx / wlen : Math.sin(P.yaw), dz = wlen > 0.2 ? wz / wlen : Math.cos(P.yaw);
    P.yaw = Math.atan2(dx, dz);
    // la vraie Matcha quitte le dos d'Ainu (un modèle animé ne se copie pas : sa copie restait invisible) ;
    // pendant le vol, l'animation du duo agit sur une doublure vide
    const fly = u.matcha, parent = fly.parent;
    const local = { p: fly.position.clone(), q: fly.quaternion.clone(), s: fly.scale.clone() };
    const start = new THREE.Vector3(); fly.getWorldPosition(start);
    this.scene.attach(fly);
    const q0 = fly.quaternion.clone();
    const stand = new THREE.Object3D(); stand.visible = false;
    u.matcha = stand; u.matchaFlying = true;
    this.throwM = { P, fly, parent, local, q0, pos: start.clone(), vel: new THREE.Vector3(dx * 12, 5.5, dz * 12), t: 0, back: false, hit: new Set() };
    this.sound('barkM'); this.sound('dash');
    this.bubble({ pos: this.throwM.pos, mesh: fly, small: true }, 'Youpi !');   // (la bulle suit Matcha)
    if (!this.save.threwOnce) { this.save.threwOnce = true; this.persist(); }
  }
  stepThrow(dt) {
    const T = this.throwM;
    if (!T) return;
    const P = T.P;
    T.t += dt;
    if (!T.back) {
      T.vel.y -= 14 * dt;
      T.pos.addScaledVector(T.vel, dt);
      const g = this.support(T.pos.x, T.pos.z, T.pos.y + 0.3).y;
      if (T.t > 0.55 || T.pos.y < g + 0.3) T.back = true;
    } else {
      // retour vers le dos d'Ainu
      const home = new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z), d = home.clone().sub(T.pos), L2 = d.length();
      const sp = Math.min(L2 / dt, 16 + T.t * 10);
      T.pos.addScaledVector(d.normalize(), sp * dt);
      if (L2 < 0.6 || T.t > 2.5) {
        // elle se repose sur le dos d'Ainu
        const u = P.mesh.userData;
        T.parent.add(T.fly);
        T.fly.position.copy(T.local.p); T.fly.quaternion.copy(T.local.q); T.fly.scale.copy(T.local.s);
        T.fly.visible = true;
        if (u.matchaFlying) { u.matcha = T.fly; u.matchaFlying = false; }
        this.throwM = null;
        this.sound('yip');
        return;
      }
    }
    T.fly.position.copy(T.pos);
    // elle file tête la première en faisant des roulés-boulés
    T.fly.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(T.back ? P.pos.x - T.pos.x : T.vel.x, T.back ? P.pos.z - T.pos.z : T.vel.z), 0));
    T.fly.rotateX(T.t * 12);
    T.fly.visible = true;
    // ce qu'elle touche en route
    const proxy = Object.create(P);
    proxy.pos = new THREE.Vector3(T.pos.x, T.pos.y - 0.8, T.pos.z);
    this.collectFor(proxy);
    P.score = proxy.score; P.chain = proxy.chain; P.chainAt = proxy.chainAt;
    for (const c of this.cats) if (!c.dead && T.pos.distanceTo(c.pos) < 1.6) { this.defeatCat(c); this.betise(P, 'throw_cat'); }
    for (const cr of this.crates) if (!cr.broken && !T.hit.has(cr) && Math.hypot(cr.def.x - T.pos.x, cr.def.z - T.pos.z) < 1.3 && Math.abs(cr.def.y + 0.5 - T.pos.y) < 1.2) { T.hit.add(cr); this.breakCrate(cr); }
    if ((T.t * 30 | 0) % 2 === 0) this.spawnParticle(T.pos.x, T.pos.y, T.pos.z, 0, 0.3, 0, 0x9ae05a, 0.22, 0.4, 0);
  }

  /**
   * « Ainu, saute ! » : l'enfant parle au chien. On écoute une phrase (3 s au plus) et on
   * cherche un mot connu : saute, aboie, pirouette, attaque, lance (Matcha), assis/sage,
   * viens/ici, bravo/gentil/je t'aime.
   */
  listenCommand() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, btn = this.dom.root.querySelector('.adv-saydog');
    if (!SR || this.listening) return;
    let rec;
    try { rec = new SR(); } catch (e) { return; }
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
    this.listening = true; btn.classList.add('on');
    if (this.sfx && this.sfx.duck) this.sfx.duck(true, 'listen', 0.2);
    let done = false;
    const finish = () => { if (!this.listening) return; this.listening = false; btn.classList.remove('on'); if (this.sfx && this.sfx.duck) this.sfx.duck(false, 'listen'); };
    const P = this.me;
    const act = (txt) => {
      const s = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const has = (...w) => w.some(x => s.includes(x));
      const name = P.mesh && P.mesh.userData.ainu ? (P.kind === 'matcha' ? 'Matcha' : 'Ainu') : 'Matcha';
      if (has('lance', 'jette') && P.mesh && P.mesh.userData.ainu && P.mesh.userData.matcha.visible && !this.throwM && this.party.size === 1) { this.throwMatcha(P, 0, 0, 0); return 'Lance !'; }
      if (has('saute', 'saut', 'hop', 'haut')) { this.pressed.add('jump'); return 'Saute !'; }
      if (has('aboie', 'ouaf', 'wouf', 'parle', 'crie')) { this.pressed.add('bark'); return 'Ouaf !'; }
      if (has('tourne', 'pirouette', 'roule', 'danse')) { this.pressed.add('trick'); return 'Pirouette !'; }
      if (has('attaque', 'toupie', 'chat')) { this.pressed.add('attack'); return 'Toupie !'; }
      if (has('viens', 'ici', 'au pied')) { if (this.party.size > 1) this.pingAt(P); else this.pressed.add('bark'); return 'J\'arrive !'; }
      if (has('assis', 'couche', 'sage', 'pas bouger', 'stop')) { P.vel.x = P.vel.z = 0; this.freeze = Math.max(this.freeze || 0, 1.2); P.cheerT = 0.6; return 'Je suis sage !'; }
      if (has('bravo', 'gentil', 'bon chien', 'je t\'aime', 'je taime', 'calin', 'bisou', 'mignon')) {
        P.cheerT = 1.4; this.sound('yip');
        for (let i = 0; i < 10; i++) this.spawnParticle(P.pos.x + (Math.random() - 0.5) * 0.8, P.pos.y + 1.6, P.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 1.8, (Math.random() - 0.5) * 0.8, 0xff5a8a, 0.35, 1.1, 0);
        return name === 'Matcha' ? 'Merci !' : 'Ouaf ! ♥';
      }
      return null;
    };
    rec.onresult = (e) => {
      if (done) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (let k = 0; k < e.results[i].length; k++) {
          const r = act(e.results[i][k].transcript);
          if (r) { done = true; this.bubble(P, r); try { rec.stop(); } catch (err) { /* ignore */ } finish(); return; }
        }
      }
    };
    rec.onerror = (e) => { finish(); if (e && e.error === 'not-allowed') this.localBanner ? this.localBanner('Micro', 'Autorise le micro pour parler à ton chien', 2600) : this.banner('Micro', 'Autorise le micro pour parler à ton chien', 2600); };
    rec.onend = () => { if (!done) this.bubble(P, '?'); finish(); };
    try { rec.start(); setTimeout(() => { try { rec.stop(); } catch (e) { /* ignore */ } }, 3500); } catch (e) { finish(); }
  }

  /** Bruits de pattes, selon le sol (herbe, chemin, pierre, bois, eau, neige). */
  footsteps(P) {
    const sp = Math.hypot(P.vel.x, P.vel.z), step = Math.floor((P.phase || 0) / Math.PI);
    if (step === P.lastStep) return;
    P.lastStep = step;
    if (!P.grounded || sp < 1.2 || P.kart || !this.sfx || !this.sfx.paw) return;
    const sup = this.support(P.pos.x, P.pos.z, P.pos.y + 0.3), k = sup.collider && sup.collider.kind;
    let s = L.SURFACE || 'grass';
    if (P.pos.y < L.WATER_Y + 0.25) s = 'water';
    else if (k === 'rock' || k === 'stone' || k === 'pad' || k === 'islet') s = 'stone';
    else if (k && /bridge|branch|trunk|tree|canopy|elevator|plank|wood|deck/.test(k)) s = 'wood';
    else if (!k && W.onPath && W.onPath(P.pos.x, P.pos.z)) s = L.SURFACE === 'snow' ? 'snow' : 'dirt';
    else if (!k && L.ID === 3) s = 'stone';
    // Ainu porte Matcha : des pas un peu plus lourds ; on ne joue qu'un pas sur deux en marchant
    if (sp < 4 && step % 2) return;
    this.sfx.paw(s, Math.min(1.2, 0.6 + sp / 10) * (P.mesh && P.mesh.userData.ainu ? 1 : 0.7));
  }

  /** Carnet des bêtises : avance une farce ; un tampon quand elle est réussie. */
  betise(P, id, n) {
    if ((P !== this.me && Object.getPrototypeOf(P) !== this.me) || !window.Carnet) return;
    const it = window.Carnet.bump(id, n);
    if (!it) return;
    const k = window.Carnet.stamps();
    setTimeout(() => {
      if (this.disposed) return;
      this.sound('reveal');
      if (k === window.Carnet.PRIZE_AT) this.banner('🧣 Écharpe des farceurs !', 'Elle t\'attend dans les déguisements (menu pause)', 3600);
      else this.banner(`Tampon ! ${it.icon}`, `${it.text} · Carnet des bêtises ${k}/${window.Carnet.LIST.length}`, 2600);
    }, 900);
  }

  /** Caresser Biscotte : il saute de joie, cœurs. */
  petPuppy(P) {
    const pp = this.puppy;
    pp.happyT = 2;
    this.betise(P, 'pet');
    this.sound('yip'); this.sound('heart');
    for (let i = 0; i < 8; i++) setTimeout(() => { if (!this.disposed) this.spawnParticle(pp.pos.x + (Math.random() - 0.5) * 0.6, pp.pos.y + 1.0, pp.pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1.6, (Math.random() - 0.5) * 0.6, 0xff5a8a, 0.35, 1.0, 0); }, i * 90);
    if (P) P.cheerT = 0.8;
  }

  /** Petite bulle de texte au-dessus d'un chien (« Ouaf ! »). */
  bubble(P, text) {
    if (!this.bubbleTex) this.bubbleTex = {};
    let tex = this.bubbleTex[text];
    if (!tex) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.strokeStyle = '#2a1408'; x.lineWidth = 8;
      x.beginPath(); x.ellipse(128, 56, 116, 46, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(110, 96); x.lineTo(96, 124); x.lineTo(138, 98); x.fill();
      x.font = 'bold 52px Fredoka, Arial Rounded MT Bold, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#e0541e';
      x.fillText(text, 128, 58);
      tex = this.bubbleTex[text] = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 10; sp.userData.noOutline = true;
    const k = P.small ? 0.7 : 1;
    sp.scale.set(1.6 * k, 0.8 * k, 1);
    this.scene.add(sp);
    (this.bubbles || (this.bubbles = [])).push({ sp, P, t: 0, h: P.small ? 1.3 : (P.mesh && P.mesh.userData.ainu ? 2.9 : 2.0) });
  }

  interact(n, P) {
    if (n.kind === 'lv') this.levelLogic.interact(n, P || this.player);
    else if (n.kind === 'mamie') this.talkMamie();
    else if (n.kind === 'puppy') this.talkPuppy();
    else if (n.kind === 'pet') this.petPuppy(P || this.player);
    else if (n.kind === 'sign') this.say(L.signs[n.i].text.map(t => ({ who: 'Panneau', text: t })));
  }

  controlsHelp() {
    return this.isTouch
      ? { jump: 'SAUT', attack: 'ATTAQUE', dash: 'CHARGE' }
      : { jump: 'ESPACE', attack: 'J', dash: 'K' };
  }

  talkMamie(first) {
    if (this.levelLogic) { this.levelLogic.talkMamie(first); return; }
    const s = this.save;
    const k = this.controlsHelp();
    if (first || !s.intro) {
      this.say([
        { who: 'Mamie Labrador', text: 'Ah ! Ainu ! Matcha ! Vous tombez à pic, mes toutous !' },
        { who: 'Mamie Labrador', text: 'La Capitaine Moustache et ses chats bandits ont volé les 5 Médailles Patounes du parc !' },
        { who: 'Matcha', text: 'Grrr… Ces chats vont nous entendre !' },
        { who: 'Ainu', text: 'Ouaf ! On va toutes les récupérer, Mamie !' },
        { who: 'Mamie Labrador', text: 'Et mon petit Biscotte a disparu… Il jouait près de la cascade, tout là-haut au nord-est.' },
        { who: 'Mamie Labrador', text: 'Suivez les os dorés, ils vous montreront le chemin !' },
        { who: 'Mamie Labrador', text: `${k.jump} pour sauter. Appuyez encore en l'air : Matcha vous propulse plus haut !` },
        { who: 'Mamie Labrador', text: `Gardez ${k.jump} appuyé en tombant : la queue d'Ainu fait l'hélice et vous planez !` },
        { who: 'Mamie Labrador', text: `${k.attack} : coup de queue tournoyant. ${k.dash} : Matcha fonce et casse les caisses !` },
        { who: 'Mamie Labrador', text: 'Bonne chance, mes toutous !' },
      ], () => { s.intro = true; this.persist(); this.banner('Le Parc des Toutous', 'Trouvez les 5 Médailles Patounes !', 2800); });
      return;
    }
    if (s.medals.length >= 5) {
      this.say([{ who: 'Mamie Labrador', text: 'Le parc est sauvé grâce à vous ! Profitez-en pour finir de ramasser les os dorés.' }]);
      return;
    }
    const left = this.medals.filter(m => !m.taken).map(m => m.def.label);
    const lines = [{ who: 'Mamie Labrador', text: `Il vous reste ${left.length} médaille${left.length > 1 ? 's' : ''} à trouver.` }];
    const hints = {
      'Le sommet du Grand Chêne': 'Grimpez les branches du Grand Chêne, au centre du parc, jusqu\'en haut !',
      'Les chats bandits': 'Des chats bandits rôdent dans la clairière à l\'est. Chassez-les tous !',
      'Les caisses de l\'îlot': 'Sur l\'îlot du lac, à l\'ouest, il y a de drôles de caisses. Sautez de galet en galet !',
      'Les balles de tennis': '5 balles de tennis sont éparpillées dans le parc. Il faut sauter très haut pour certaines !',
      'Biscotte le chiot': 'Mon Biscotte est perdu près de la cascade. Prenez l\'ascenseur en bois au nord-est !',
    };
    for (const l of left.slice(0, 2)) lines.push({ who: 'Mamie Labrador', text: hints[l] });
    this.say(lines);
  }

  talkPuppy() {
    this.say([
      { who: 'Biscotte', text: 'Ouiiin… Je suis perdu… Je veux ma Mamie…' },
      { who: 'Ainu', text: 'Viens avec nous, Biscotte ! On te ramène à Mamie.' },
      { who: 'Biscotte', text: 'Ouaf ! Je vous suis !' },
    ], () => { this.puppy.state = 'follow'; this.save.puppy = 'follow'; });
  }

  puppyHome() {
    const pp = this.puppy;
    pp.state = 'home';
    this.save.puppy = 'home';
    pp.pos.set(L.npcs.mamie.x + 1.6, L.npcs.mamie.y, L.npcs.mamie.z + 1.2);
    this.persist();
    this.say([
      { who: 'Mamie Labrador', text: 'Biscotte ! Mon chiot chéri !' },
      { who: 'Biscotte', text: 'Ouaf ouaf ! Mamie !' },
      { who: 'Mamie Labrador', text: 'Merci, les amis ! Tenez : la Capitaine Moustache avait caché ça derrière ma niche.' },
    ], () => { this.updateMedalVisibility(); this.sound('reveal'); });
  }

  say(lines, onDone) {
    this.dialog = { lines, i: 0, chars: 0, onDone, spoken: -1, rate: 45 };
    if (this.sfx && this.sfx.duck) this.sfx.duck(true, 'dialog');
    prefetchVoices(this.sfx, lines);
    this.dom.dialog.classList.remove('hidden');
    this.renderDialog();
  }

  renderDialog() {
    const d = this.dialog;
    const l = d.lines[d.i];
    // la voix de la réplique (le texte s'écrit au rythme de la voix)
    if (d.spoken !== d.i) {
      d.spoken = d.i;
      const dur = speak(this.sfx, l.who, l.text);
      d.voiced = dur > 0;
      d.rate = d.voiced ? Math.max(20, l.text.length / Math.max(0.5, dur * 0.85)) : 45;
    }
    this.dom.dname.textContent = l.who;
    this.dom.dtext.textContent = l.text.slice(0, Math.floor(d.chars));
    this.dom.dialog.classList.toggle('done', d.chars >= l.text.length);
  }

  stepDialog(dt) {
    const d = this.dialog;
    const l = d.lines[d.i];
    const before = Math.floor(d.chars);
    if (d.chars < l.text.length) d.chars = Math.min(l.text.length, d.chars + dt * d.rate);
    const after = Math.floor(d.chars);
    if (!d.voiced && after !== before && after % 3 === 0 && l.text[after - 1] !== ' ') this.voice(l.who);
    const adv = this.pressed.has('talk') || this.pressed.has('jump') || this.pressed.has('attack');
    if (adv) {
      if (d.chars < l.text.length) d.chars = l.text.length;
      else if (d.i < d.lines.length - 1) { d.i++; d.chars = 0; }
      else {
        stopVoice(this.sfx);
        if (this.sfx && this.sfx.duck) this.sfx.duck(false, 'dialog');
        this.dialog = null;
        this.dom.dialog.classList.add('hidden');
        this.pressed.clear();
        if (d.onDone) d.onDone();
        return;
      }
    }
    this.renderDialog();
  }

  // Voix « charabia » façon Yooka-Laylee
  voice(who) {
    const sfx = this.sfx;
    if (!sfx || !sfx.ok) return;
    const base = { 'Mamie Labrador': 210, Biscotte: 720, Ainu: 330, Matcha: 560, Panneau: 0 }[who] || 300;
    if (!base) return;
    sfx.tone(base * (0.85 + Math.random() * 0.4), 0.05, { type: 'square', vol: 0.06, to: base * (0.7 + Math.random() * 0.6) });
  }

  // -------------------------------------------------------------------------
  // Objets à ramasser
  // -------------------------------------------------------------------------
  stepCollect() { for (const P of this.players) this.collectFor(P); }

  collectFor(P) {
    const px = P.pos.x, py = P.pos.y + 0.8, pz = P.pos.z;
    const s = this.save;
    // Os (en chaîne, ils s'attrapent d'un peu plus loin)
    const reach = (P.chain || 0) >= 3 ? 2.3 : 1.6;
    for (let i = 0; i < L.bones.length; i++) {
      const b = L.bones[i];
      if (this.boneTaken.has(b.id)) continue;
      if ((b.x - px) ** 2 + (b.y - py) ** 2 + (b.z - pz) ** 2 < reach * reach) {
        // une ligne d'os ramassée d'affilée : la note monte, et tous les 5 ça scintille
        P.chain = this.t - (P.chainAt || -9) < 0.75 ? (P.chain || 0) + 1 : 0;
        P.chainAt = this.t;
        this.boneTaken.add(b.id);
        s.gone[b.id] = Date.now();          // il repoussera plus tard
        P.score = (P.score || 0) + 1;
        if (P === this.player) addToProfile(1);
        if (this.levelLogic && this.levelLogic.onCoin) this.levelLogic.onCoin(P);
        this.burst(b.x, b.y, b.z, 6, 0xffe070, 2.5, 0.35);
        this.sound('bone', P.chain);
        if (P.chain === 9) this.betise(P, 'chain10');
        if (P.chain && P.chain % 5 === 4) {
          this.burst(b.x, b.y + 0.4, b.z, 22, 0xfff3a0, 5, 0.8);
          this.sound('chain');
          if (P === this.me) this.kick(0.08);
        }
        const fresh = !s.bones.includes(b.id);
        if (fresh) s.bones.push(b.id);
        if (fresh && s.bones.length % 20 === 0) {
          if (P.hearts < MAX_HEARTS) P.hearts++;
          this.banner(`${s.bones.length} ${L.COLLECT_NAME || 'os dorés'} !`, P.hearts === MAX_HEARTS ? 'Les cœurs sont pleins' : '+1 cœur', 1500);
        }
        if (fresh && s.bones.length === L.bones.length) this.banner(`TOUS LES ${(L.COLLECT_NAME || 'os dorés').toUpperCase()} !`, 'Bravo, chasseurs de trésor !', 3000);
        this.persist(); this.updateHud();
      }
    }
    // Balles
    for (const b of this.balls) {
      if (b.taken) continue;
      if ((b.def.x - px) ** 2 + (b.def.y - py) ** 2 + (b.def.z - pz) ** 2 < 1.5 * 1.5) {
        b.taken = true; b.mesh.visible = false;
        s.balls.push(b.def.id);
        this.pedestalBalls.forEach((pb, i) => { pb.visible = i < s.balls.length; });
        this.burst(b.def.x, b.def.y, b.def.z, 12, 0xd8f040, 3, 0.5);
        this.sound('ball');
        if (s.balls.length >= 5) {
          this.updateMedalVisibility();
          this.banner('Les 5 balles de tennis !', 'Une médaille brille sur le piédestal du nord !', 3000);
          this.sound('reveal');
        } else this.banner(`Balle de tennis ${s.balls.length}/5`, null, 1300);
        this.persist(); this.updateHud();
      }
    }
    // Cœurs
    for (const h of this.hearts) {
      if (h.taken) continue;
      if ((h.x - px) ** 2 + (h.y - py) ** 2 + (h.z - pz) ** 2 < 1.4 * 1.4) {
        h.taken = true; this.scene.remove(h.mesh);
        if (P.hearts < MAX_HEARTS) P.hearts++;
        this.sound('heart');
        this.updateHud();
      }
    }
    // Médailles
    for (const m of this.medals) {
      if (m.taken || !m.visible) continue;
      if ((m.def.x - px) ** 2 + (m.def.y - py) ** 2 + (m.def.z - pz) ** 2 < 1.8 * 1.8) this.takeMedal(m);
    }
  }

  takeMedal(m) {
    const s = this.save;
    m.taken = true; m.mesh.visible = false; if (m.beam) m.beam.visible = false;
    s.medals.push(m.def.id);
    this.persist(); this.updateHud();
    this.burst(m.def.x, m.def.y, m.def.z, 30, 0xffd34d, 5, 0.9);
    this.burst(m.def.x, m.def.y, m.def.z, 14, 0xffffff, 4, 0.7);
    for (const Q of this.players) Q.cheerT = 1.4;
    this.freeze = 1.4;
    this.sound('win');
    if (this.sfx && this.sfx.stinger) this.sfx.stinger('medal');
    const kn = this.party.size > 1 ? '' : kidName();
    this.banner(L.MEDAL_TITLE || 'MÉDAILLE PATOUNE !', `${kn ? 'Bravo ' + kn + ' ! ' : ''}${m.def.label} — ${s.medals.length}/${L.medals.length}`, 2800);
    this.autoSnapAt = this.t + 0.6;   // photo souvenir, le temps que les chiens fêtent ça
    this.autoSnapLabel = m.def.label;
    const finished = L.FINAL_MEDAL ? s.medals.includes(L.FINAL_MEDAL) : s.medals.length >= L.medals.length;
    if (finished && !s.done) this.endTimer = 1.7;
  }

  // Dialogue de fin, déclenché en temps de jeu après la dernière médaille
  stepEnd(dt) {
    if (this.endTimer === undefined || this.dialog) return;
    this.endTimer -= dt;
    if (this.endTimer > 0) return;
    this.endTimer = undefined;
    const s = this.save;
    this.say(this.levelLogic ? this.levelLogic.endLines() : [
      { who: 'Mamie Labrador', text: 'Les 5 Médailles Patounes ! Le Parc des Toutous est sauvé !' },
      { who: 'Matcha', text: 'Ces chats bandits n\'avaient aucune chance !' },
      { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache s\'est enfuie vers la Forêt des Moustaches…' },
      { who: 'Mamie Labrador', text: 'Ces médailles, c\'est mon Firmin qui les avait gagnées, quand il était jeune chien. Merci, mes trésors.' },
      { who: 'Ainu', text: 'Ouaf ! On la rattrapera, promis !' },
      { who: 'Mamie Labrador', text: 'Regardez : des poils de moustache… tout droit vers la Forêt des Moustaches !' },
    ], () => { s.done = true; this.persist(); this.showOverlay('complete'); if (this.coop) this.coopEvents.push(['overlay', 'complete']); });
  }

  // -------------------------------------------------------------------------
  // Particules
  // -------------------------------------------------------------------------
  spawnParticle(x, y, z, vx, vy, vz, color, size, life, grav) {
    if (this.particles.length >= 400) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, color: new THREE.Color(color), size, life, max: life, grav: grav === undefined ? 9 : grav });
  }
  burst(x, y, z, n, color, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawnParticle(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + speed * 0.5, Math.sin(a) * Math.cos(e) * sp, color, 0.12 + Math.random() * 0.12, life * (0.6 + Math.random() * 0.6));
    }
  }
  stepParticles(dt) {
    const ps = this.particles;
    for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.grav * dt; p.life -= dt; }
    this.particles = ps.filter(p => p.life > 0);
  }

  // -------------------------------------------------------------------------
  // Sons
  // -------------------------------------------------------------------------
  sound(name, n) {
    const kick = { bossHit: [0.45, 0.1], hurt: [0.35, 0.07], crate: [0.16, 0.04], poof: [0.12, 0.05], bump: [0.2, 0], splash: [0.1, 0] }[name];
    if (kick) this.kick(kick[0], kick[1]);
    const s = this.sfx;
    if (!s || !s.ok) return;
    switch (name) {
      case 'jump': s.tone(300, 0.12, { type: 'triangle', to: 620, vol: 0.12 }); break;
      case 'double': s.tone(520, 0.14, { type: 'square', to: 1040, vol: 0.08 }); break;
      case 'spin': s.swing(true); break;
      case 'dash': s.noise(0.2, { filter: 'bandpass', freq: 800, freqTo: 2400, vol: 0.2 }); break;
      case 'bone': {
        // gamme pentatonique : une ligne d'os joue une petite mélodie qui monte
        const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
        const f = 784 * Math.pow(2, PENTA[Math.min(PENTA.length - 1, n || 0)] / 12);
        s.tone(f, 0.08, { type: 'triangle', vol: 0.09 }); s.tone(f * 2, 0.06, { type: 'sine', vol: 0.04, delay: 0.03 });
        break;
      }
      case 'chain': [1, 1.25, 1.5, 2].forEach((k, i) => s.tone(1046 * k, 0.18, { type: 'sine', vol: 0.06, delay: 0.05 + i * 0.05 })); break;
      case 'ball': s.tone(660, 0.1, { vol: 0.1 }); s.tone(990, 0.12, { vol: 0.1, delay: 0.08 }); break;
      case 'heart': s.tone(700, 0.1, { type: 'sine', vol: 0.15 }); s.tone(1050, 0.15, { type: 'sine', vol: 0.15, delay: 0.08 }); break;
      case 'meow': s.meow && s.meow(); break;
      case 'meowHi': s.meow && s.meow(1.35); break;
      case 'win': s.win(); break;
      case 'boing': s.tone(220, 0.25, { type: 'sine', to: 660, vol: 0.18 }); s.tone(330, 0.2, { type: 'triangle', to: 990, vol: 0.08, delay: 0.05 }); break;
      case 'lantern': [784, 988, 1175, 1568].forEach((f, i) => s.tone(f, 0.16, { type: 'sine', vol: 0.1, delay: i * 0.06 })); break;
      case 'switch': s.tone(180, 0.12, { type: 'square', to: 120, vol: 0.12 }); s.tone(520, 0.18, { type: 'triangle', to: 1040, vol: 0.1, delay: 0.1 }); break;
      case 'throw': s.noise(0.15, { filter: 'bandpass', freq: 600, freqTo: 1600, vol: 0.18 }); break;
      case 'bossHit': s.hit(true); s.meow && s.meow(0.8); break;
      case 'poof': s.noise(0.25, { freq: 1500, freqTo: 300, vol: 0.3 }); s.tone(500, 0.2, { type: 'sawtooth', to: 180, vol: 0.08 }); break;
      case 'crate': s.noise(0.2, { freq: 700, vol: 0.4 }); s.tone(160, 0.15, { type: 'square', to: 80, vol: 0.12 }); break;
      case 'hurt': s.hit(true); break;
      case 'splash': s.noise(0.45, { filter: 'bandpass', freq: 1200, freqTo: 300, vol: 0.35 }); break;
      case 'horn': s.tone(392, 0.22, { type: 'square', vol: 0.09 }); s.tone(494, 0.22, { type: 'square', vol: 0.07 }); break;
      case 'boost': s.noise(0.45, { filter: 'bandpass', freq: 500, freqTo: 2600, vol: 0.25 }); s.tone(180, 0.35, { type: 'sawtooth', to: 520, vol: 0.06 }); break;
      case 'engine': s.tone(90, 0.35, { type: 'sawtooth', to: 160, vol: 0.08 }); s.tone(120, 0.3, { type: 'square', to: 220, vol: 0.04, delay: 0.12 }); break;
      case 'bump': s.noise(0.18, { freq: 500, vol: 0.35 }); s.tone(110, 0.15, { type: 'square', to: 60, vol: 0.12 }); break;
      case 'cp': s.tone(880, 0.1, { type: 'triangle', vol: 0.13 }); s.tone(1320, 0.14, { type: 'triangle', vol: 0.11, delay: 0.07 }); break;
      case 'bark': s.bark('ainu'); break;
      case 'barkM': s.bark('matcha'); break;
      case 'woof':   // le gros « OUAF » : grondement grave + souffle
        s.tone(90, 0.3, { type: 'sine', to: 40, vol: 0.35 });
        s.noise(0.25, { filter: 'lowpass', freq: 500, freqTo: 100, vol: 0.2 });
        break;
      case 'yip': s.tone(900, 0.06, { type: 'sawtooth', to: 1300, vol: 0.1 }); s.tone(1000, 0.07, { type: 'sawtooth', to: 1400, vol: 0.09, delay: 0.1 }); break;
      case 'trick': [660, 880, 1100, 1320, 1760].forEach((f, i) => s.tone(f, 0.1, { type: 'triangle', vol: 0.08, delay: i * 0.05 })); break;
      case 'reveal': [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); break;
    }
  }

  /**
   * Ambiances sonores selon le niveau et l'endroit où l'on est (la caméra
   * écoute) : eau de la cascade et des lacs, fontaine, vagues du port, rumeur
   * de la ville, vent des Îles du Ciel, oiseaux, moteur du kart ou de l'avion.
   */
  ambience(dt) {
    const s = this.sfx;
    if (!s || !s.ctx) return;
    if (this.paused && !this.coop) { s.ambStop(); return; }
    const c = this.camera.position, near = (x, z, r) => Math.max(0, 1 - Math.hypot(c.x - x, c.z - z) / r) ** 1.6;
    let water = 0, wind = 0, windP = 0, waves = 0, city = 0, birds = 0, owls = 0, gulls = 0;
    if (L.ID === 1) {
      if (L.POOL) water = Math.max(near(L.POOL.x, L.POOL.z, 38), L.STREAM ? near((L.STREAM.x0 + L.STREAM.x1) / 2, L.STREAM.z, 22) * 0.6 : 0);
      if (L.SPOTS && L.SPOTS.lake) water = Math.max(water, near(L.SPOTS.lake.x, L.SPOTS.lake.z, 26) * 0.45);
      wind = 0.25; windP = 0.1; birds = 0.5;
    } else if (L.ID === 2) {
      if (L.SPOTS && L.SPOTS.lake) water = near(L.SPOTS.lake.x, L.SPOTS.lake.z, 24) * 0.5;
      wind = 0.3; windP = 0.25; birds = 0.35; owls = 0.04;
    } else if (L.ID === 3) {
      if (L.FOUNTAIN) water = near(L.FOUNTAIN.x, L.FOUNTAIN.z, 22) * 0.35;   // la fontaine : discrète (Mamie est juste à côté)
      if (L.PORT_QUAY) waves = Math.max(0, Math.min(1, 1 - (L.PORT_QUAY + 6 - c.z) / 70));
      const P = L.PARK, inPark = P && c.x > P.x0 - 15 && c.x < P.x1 + 15 && c.z > P.z0 - 15 && c.z < P.z1 + 15;
      city = 0.7 * (1 - waves * 0.6) * (inPark ? 0.5 : 1); birds = inPark ? 0.5 : 0.06; gulls = waves * 0.3;
      if (c.y > 25) { wind = Math.min(1, (c.y - 25) / 40); windP = wind; city *= 1 - wind * 0.7; }
    } else if (L.ID === 4) {
      const v = this.player ? this.player.vel : null, sp = v ? Math.hypot(v.x, v.y, v.z) : 0;
      wind = 0.6; windP = Math.min(1, 0.3 + sp / 25); birds = 0.06; gulls = 0.08;
    }
    // moteur : kart ou avion conduit par moi
    const k = this.player && this.player.kart;
    let eng = 0, engP = 0;
    if (k && !this.cine) { eng = k.plane ? 1 : 0.55; engP = Math.min(1, Math.abs(k.speed || 0) / (k.plane ? 34 : 26)) * (k.plane && !k.grounded ? 1 : 0.85); }
    if (this.cine) { eng = 0; wind *= 0.7; }
    s.amb('water', water); s.amb('wind', wind, windP); s.amb('waves', waves); s.amb('city', city); s.amb('engine', eng, engP);
    if (s.setIntensity) s.setIntensity(s.theme === 'boss' || this.camFocus ? 1 : ((k && Math.abs(k.speed || 0) > 3) || (this.cats || []).some(c => c.chasing && !c.dead)) ? 0.7 : 0.3);
    if (!s.ok) return;
    if (Math.random() < dt * birds * 0.9) s.bird('bird', 0.6 + Math.random() * 0.6);
    if (Math.random() < dt * gulls * 0.4) s.bird('gull', 0.7 + Math.random() * 0.5);
    if (Math.random() < dt * owls) s.bird('owl');
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  render(dt) {
    if (this.needResize) { this.needResize = false; this.resize(); }
    const P = this.player;
    const t = this.t;
    // bulles « Ouaf ! »
    if (this.bubbles) this.bubbles = this.bubbles.filter(b => {
      b.t += dt;
      b.sp.position.set(b.P.pos.x, b.P.pos.y + b.h + b.t * 0.5, b.P.pos.z);
      b.sp.material.opacity = Math.min(1, (1.1 - b.t) * 3);
      const pop = Math.min(1, b.t * 8); b.sp.scale.x = (b.P.small ? 1.12 : 1.6) * pop; b.sp.scale.y = (b.P.small ? 0.56 : 0.8) * pop;
      if (b.t > 1.1) { this.scene.remove(b.sp); b.sp.material.dispose(); return false; }
      return true;
    });
    // la tenue de mon chien (garde-robe)
    if (!this.outfit) this.outfit = WR.outfit();
    WR.dress(this.me, this.outfit);
    // Chiens (et leur prénom à plusieurs)
    for (const Q of this.players) {
      if (!Q.mesh) continue;
      if (Q.mesh.userData.ainu) this.renderDuo(Q, dt, t); else this.renderMatcha(Q, dt, t);
      if (Q === this.me) this.footsteps(Q);
      // tombé : couché sur le côté, petit flottement
      if (Q.down) { Q.mesh.rotation.z = 1.35; Q.mesh.position.y += 0.15 + Math.sin(t * 3) * 0.08; }
      else if (Q.mesh.rotation.z === 1.35) Q.mesh.rotation.z = 0;
      if (Q.tag) { Q.tag.visible = this.party.size > 1 && Q.mesh.visible !== false; Q.tag.position.set(Q.pos.x, Q.pos.y + (Q.mesh.userData.ainu ? 2.55 : (Q.mesh.userData.height || 1.1) + 0.65), Q.pos.z); }
    }

    // Os (rotation)
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4());
    const q = this.q || (this.q = new THREE.Quaternion());
    const e = this.e || (this.e = new THREE.Euler());
    const v = this.v || (this.v = new THREE.Vector3());
    const one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < L.bones.length; i++) {
      const b = L.bones[i];
      const taken = this.boneTaken.has(b.id);
      // aboiement tout près : les os sautillent pour se montrer
      let hop = 0;
      const bh = this.boneHop;
      if (bh && this.t - bh.t < 1.6 && !taken) {
        const d = Math.hypot(b.x - bh.x, b.z - bh.z);
        if (d < 12) { const a = this.t - bh.t - d * 0.04; if (a > 0) hop = Math.abs(Math.sin(a * 9)) * 0.7 * Math.max(0, 1 - a / 1.4); }
      }
      q.setFromEuler(e.set(0, t * 2.5 + i * 0.4 + hop * 4, 0.35));
      m4.compose(v.set(b.x, b.y + Math.sin(t * 3 + i) * 0.12 + hop, b.z), q, taken ? zero : one);
      this.bonesI.setMatrixAt(i, m4);
    }
    this.bonesI.instanceMatrix.needsUpdate = true;
    if (this.boneGlow) {
      const gp = this.boneGlow.geometry, pa = gp.attributes.position.array, sa = gp.attributes.size.array;
      for (let i = 0; i < L.bones.length; i++) {
        const b = L.bones[i];
        pa[i * 3] = b.x; pa[i * 3 + 1] = b.y + Math.sin(t * 3 + i) * 0.12; pa[i * 3 + 2] = b.z;
        sa[i] = this.boneTaken.has(b.id) ? 0 : 1.15 + Math.sin(t * 2.4 + i * 1.3) * 0.15;
      }
      gp.attributes.position.needsUpdate = true; gp.attributes.size.needsUpdate = true;
    }

    for (const m of this.medals) if (m.mesh.visible) { m.mesh.rotation.y = t * 2; m.mesh.position.y = m.def.y + Math.sin(t * 2.5) * 0.2; }
    if (this._beamMat) this._beamMat.opacity = 0.35 + Math.sin(t * 3) * 0.12;
    for (const b of this.balls) if (b.mesh.visible) { b.mesh.rotation.y = t * 3; b.mesh.position.y = b.def.y + Math.abs(Math.sin(t * 4)) * 0.3; }
    for (const h of this.hearts) if (!h.taken) { h.mesh.rotation.y = t * 3; h.mesh.position.y = h.y + Math.sin(t * 4) * 0.15; }

    // Chats
    for (const c of this.cats) {
      if (c.dead) continue;
      c.mesh.position.copy(c.pos);
      if (c.hopT > 0) c.mesh.position.y += Math.sin((0.45 - c.hopT) / 0.45 * Math.PI) * 1.1;   // il sursaute
      c.mesh.rotation.y = c.yaw;
      const cu = c.mesh.userData;
      cu.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.phase + (i % 3 ? Math.PI : 0)) * 0.7; });
      cu.tail.rotation.x = -0.3 + Math.sin(t * 5 + c.home.x) * 0.25;
      cu.head.rotation.z = c.chasing ? Math.sin(t * 20) * 0.08 : 0;
      this.placeShadow(c.shadow, c.pos, 0.6);
    }

    // Personnages
    const mu = this.mamie.userData;
    if (mu.rig) this.animateMamie(dt, t);
    else if (mu.mamie) this.animateMamieSitting(dt, t);
    else {
      mu.tail.rotation.y = Math.sin(t * 6) * 0.5;
      mu.head.rotation.z = Math.sin(t * 1.3) * 0.08;
      this.mamie.rotation.y = lerpAngle(this.mamie.rotation.y, Math.atan2(P.pos.x - L.npcs.mamie.x, P.pos.z - L.npcs.mamie.z), 0.05);
    }
    const pp = this.puppy, pu = pp.mesh.userData;
    pp.mesh.position.copy(pp.pos);
    pp.mesh.rotation.y = pp.yaw;
    pu.tail.rotation.y = Math.sin(t * (pp.state === 'lost' ? 3 : pp.happyT > 0 ? 24 : 16)) * (pp.happyT > 0 ? 0.9 : 0.6);
    if (pp.happyT > 0) { pp.happyT -= dt; pp.mesh.position.y += Math.abs(Math.sin(pp.happyT * 9)) * 0.35; pp.mesh.rotation.y += Math.sin(pp.happyT * 5) * 0.6; }
    pu.legs.forEach((l, i) => { l.rotation.x = pp.state === 'follow' ? Math.sin(pp.phase + (i % 3 ? Math.PI : 0)) * 0.8 : 0; });
    pu.head.rotation.x = pp.state === 'lost' ? 0.3 : 0;
    this.placeShadow(pp.shadow, pp.pos, 0.45);
    // Marques au-dessus des têtes
    const mk = this.marks;
    mk.mamie.visible = !this.save.intro || (this.puppy.state === 'follow');
    mk.mamie.position.set(L.npcs.mamie.x, L.npcs.mamie.y + 3.1 + Math.sin(t * 4) * 0.1, L.npcs.mamie.z);
    mk.puppy.visible = pp.state === 'lost';
    mk.puppy.position.set(pp.pos.x, pp.pos.y + 1.7 + Math.sin(t * 4) * 0.1, pp.pos.z);

    // Monde animé
    if (this.elevatorMesh) this.elevatorMesh.position.set(L.ELEVATOR.x, L.elevatorTop(t) - 0.25, L.ELEVATOR.z);
    this.fallTex.offset.y = (t * 1.4) % 1;
    if (this.streamTex) this.streamTex.offset.y = (t * 0.9) % 1;
    if (this.levelLogic) this.levelLogic.render(dt, t);
    if (this.seasons) this.seasons.step(dt, t);
    if (this.water) this.water.material.uniforms.uTime.value = t;
    // le chemin d'étincelles : toujours en Promenade, sinon à la demande (ou si on semble perdu)
    if (this.progressAt === undefined) this.progressAt = this.t;
    if (!this.guide && !this.guest && this.t - this.progressAt > 75 && !(this.t < (this.guideUntil || 0))) { this.showWay(true); }
    if (this.guide || this.t < (this.guideUntil || 0)) this.renderGuide(dt);
    this.stepPings();
    this.stepWaves(dt);
    for (const p of this.portals || []) {
      p.mat.uniforms.uTime.value = t;
      p.disc.rotation.y = Math.atan2(this.camera.position.x - p.def.x, this.camera.position.z - p.def.z);
      p.glow.material.opacity = p.n > 0 ? 0.45 + Math.sin(t * 8) * 0.12 : 0.22 + Math.sin(t * 3) * 0.06;
      this.portalLabel(p);
      if (Math.random() < dt * 14) { const a = Math.random() * 6.28; this.spawnParticle(p.def.x + Math.cos(a) * 1.2, p.y + 1.7 + Math.sin(a) * 1.35, p.def.z, Math.cos(a) * 0.8, 1 + Math.random(), 0, p.mat.uniforms.uC1.value.getHex(), 0.16, 0.8); }
    }
    this.wind.value = t;
    for (const c of this.clouds) { const u = c.userData, a = u.a + t * 0.004; c.position.set(Math.cos(a) * u.r, u.y, Math.sin(a) * u.r); }
    this.vista.isles.forEach((isl, i) => { isl.position.y = isl.userData.y0 + Math.sin(t * 0.35 + i * 1.7) * 1.6; });
    for (const [i, c] of this.crystals.entries()) c.children[c.children.length - 1].material.opacity = 0.4 + Math.sin(t * 2 + i) * 0.15;
    W.animateButterflies(this.butterflies, t);
    if (this.flag) {
      const fp = this.flag.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const bx = this.flagBase[i * 3], k = (bx + 0.6) / 1.2;
        fp.setZ(i, Math.sin(t * 6 - bx * 4) * 0.12 * k);
      }
      fp.needsUpdate = true;
    }
    if (this.fallPos && Math.random() < dt * 20) {
      const f = this.fallPos;
      this.spawnParticle(f.x + Math.random() * 2, f.y, f.z + (Math.random() - 0.5) * 3, (Math.random() - 0.3) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0xe8f8ff, 0.25 + Math.random() * 0.2, 0.6, 6);
    }
    // Le soleil suit le joueur pour garder des ombres nettes autour de lui
    const sun = this.sun;
    if (this.shadowFollow) {
      const me = this.me.pos, c0 = this.shadowAt;
      if (!c0 || Math.hypot(me.x - c0.x, me.z - c0.z) > 30) {
        this.shadowAt = { x: me.x, z: me.z };
        sun.target.position.set(Math.round(me.x), 0, Math.round(me.z));
        sun.position.copy(sun.target.position).addScaledVector(W.SKY.sunDir, 120);
        sun.target.updateMatrixWorld();
        this.renderer.shadowMap.needsUpdate = true;
      }
    } else if (!this.lite) {
      sun.target.position.set(Math.round(this.me.pos.x), Math.round(this.me.pos.y), Math.round(this.me.pos.z));
      sun.position.copy(sun.target.position).addScaledVector(W.SKY.sunDir, 70);
      sun.target.updateMatrixWorld();
    }

    // Particules
    const pg = this.partPts.geometry;
    const pa = pg.attributes.position.array, ca = pg.attributes.color.array, sa = pg.attributes.size.array;
    this.particles.forEach((p, i) => {
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z;
      ca[i * 3] = p.color.r; ca[i * 3 + 1] = p.color.g; ca[i * 3 + 2] = p.color.b;
      sa[i] = p.size * 2.2 * Math.min(1, p.life / p.max * 2);
    });
    pg.setDrawRange(0, this.particles.length);
    pg.attributes.position.needsUpdate = pg.attributes.color.needsUpdate = pg.attributes.size.needsUpdate = true;
    this.partPts.material.uniforms.uScale.value = this.renderer.domElement.height / 2 / Math.tan(this.camera.fov * Math.PI / 360);
    if (this.boneGlow) this.boneGlow.material.uniforms.uScale.value = this.partPts.material.uniforms.uScale.value;

    // Caméra
    const ME = this.me;
    // la caméra regarde un peu devant le chien, et ne suit pas chaque saut en hauteur
    const lead = this.camLead || (this.camLead = new THREE.Vector3());
    const lk = ME.kart ? 0.12 : 0.22;
    lead.lerp(v.set(clamp(ME.vel.x * lk, -2.6, 2.6), 0, clamp(ME.vel.z * lk, -2.6, 2.6)), 1 - Math.exp(-dt * 2.5));
    if (this.camY === undefined || ME.grounded || ME.kart || ME.pos.y < this.camY - 0.4 || ME.pos.y > this.camY + 3.5 || ME.gliding) this.camY = ME.pos.y;
    this.camYs = this.camYs === undefined ? this.camY : this.camYs + (this.camY - this.camYs) * (1 - Math.exp(-dt * 6));
    if (ME.pos.y < this.camYs - 0.4) this.camYs = ME.pos.y + 0.4;
    const target = v.set(ME.pos.x + lead.x, this.camYs + (ME.kind === 'matcha' ? 1.2 : 1.6), ME.pos.z + lead.z);
    this.camFocus = this.levelLogic && this.levelLogic.camFocus ? this.levelLogic.camFocus() : null;
    if (this.camFocus) target.y += clamp((this.camFocus.y - target.y) * 0.25, 0, 2.5);
    this.camDist += ((this.camDistOverride || (ME.kart ? 11.5 : this.camFocus ? 12 : 9)) - this.camDist) * Math.min(1, dt * 3);
    this.camTarget.lerp(target, 1 - Math.exp(-dt * 10));
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const desired = new THREE.Vector3(
      this.camTarget.x + Math.sin(this.camYaw) * cp * this.camDist,
      this.camTarget.y + sp * this.camDist,
      this.camTarget.z + Math.cos(this.camYaw) * cp * this.camDist);
    // un tronc entre la caméra et le duo : la caméra se rapproche
    {
      const tx = this.camTarget.x, tz = this.camTarget.z, dx = desired.x - tx, dz = desired.z - tz;
      const len2 = dx * dx + dz * dz;
      let f = 1;
      for (const c of (L.near ? L.near(tx, tz, this.camDist + 2) : L.colliders)) {
        if (c.type === 'box' && c.cam) {
          // immeuble : intersection segment / rectangle (plan horizontal)
          const hx = c.w / 2 + 0.3, hz = c.d / 2 + 0.3;
          if (Math.abs(tx - c.x) < hx && Math.abs(tz - c.z) < hz) continue;
          let t0 = 0, t1 = 1;
          for (const [o, d, lo, hi] of [[tx, dx, c.x - hx, c.x + hx], [tz, dz, c.z - hz, c.z + hz]]) {
            if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; } continue; }
            let a = (lo - o) / d, b2 = (hi - o) / d;
            if (a > b2) [a, b2] = [b2, a];
            t0 = Math.max(t0, a); t1 = Math.min(t1, b2);
          }
          if (t0 > t1 || t0 <= 0 || t0 >= f) continue;
          const y = this.camTarget.y + (desired.y - this.camTarget.y) * t0;
          if (y > c.y1 + 0.5 || y < c.y0) continue;
          f = t0;
          continue;
        }
        if (c.type !== 'cyl' || !(CAM_BLOCK.has(c.kind) || c.cam)) continue;
        const r = c.r + 0.35;
        // intersection segment / cercle (plan horizontal)
        const ox = tx - c.x, oz = tz - c.z;
        const b = ox * dx + oz * dz, cc = ox * ox + oz * oz - r * r;
        if (cc < 0) continue; // le duo est contre le tronc : on ignore
        const disc = b * b - len2 * cc;
        if (disc < 0) continue;
        const hit = (-b - Math.sqrt(disc)) / len2;
        if (hit <= 0 || hit >= f) continue;
        const y = this.camTarget.y + (desired.y - this.camTarget.y) * hit;
        if (y > c.y1 + 0.5 || y < c.y0) continue;
        f = hit;
      }
      if (f < 1) {
        f = Math.max(0.28, f - 0.06);
        desired.set(tx + dx * f, this.camTarget.y + (desired.y - this.camTarget.y) * f, tz + dz * f);
      }
    }
    const ground = Math.max(L.heightAt(desired.x, desired.z), L.WATER_Y) + 1.0;
    if (desired.y < ground) desired.y = ground;
    if (!this.camInit) { this.camPos.copy(desired); this.camTarget.copy(target); this.camInit = true; }
    this.camPos.lerp(desired, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const a = this.shakeA * (this.shakeT / this.shakeD), tt = this.t * 60;
      this.camera.position.x += Math.sin(tt * 1.7) * a; this.camera.position.y += Math.sin(tt * 2.3 + 1) * a * 0.8;
      this.camera.rotation.z += Math.sin(tt * 1.3 + 2) * a * 0.05;
    }

    if ((this.mapT = (this.mapT || 0) + 1) % 4 === 0) this.drawMinimap();
    this.showVoices();
    if (this.cine) this.cine.applyCamera();
    // mise au point sur le duo (ou sur ce que regarde la cinématique)
    this.ambience(dt);
    this.post.focus = this.cine ? this.cine.focusDist() : this.camera.position.distanceTo(this.camTarget);
    this.post.render(this.scene, this.camera, this.t, W.SKY.sunDir);
    if (this.snapPending) { this.snapPending = false; this.savePhoto(); }
    if (this.autoSnapAt && this.t >= this.autoSnapAt) { this.autoSnapAt = 0; this.autoPhoto(this.autoSnapLabel); }
  }

  /**
   * Mouvement « vivant » commun aux chiens : inclinaison dans les virages,
   * écrasement à l'atterrissage, étirement au saut, tête qui regarde ce qui
   * l'intéresse, queue qui traîne derrière les virages, petites animations
   * quand on attend (renifler, se gratter, regarder autour, s'ébrouer).
   */
  animState(P, dt, t, speed) {
    const a = P.anim || (P.anim = { yaw: P.yaw, rate: 0, bank: 0, land: 0, landK: 0, stretch: 0, air: !P.grounded, vy: 0, still: 0, idle: null, idleT: 0, look: 0, lookP: 0, tail: 0, tailV: 0, lookT: 0, target: null });
    const dy = ((P.yaw - a.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    a.yaw = P.yaw;
    a.rate += (clamp(dy / Math.max(dt, 1e-3), -8, 8) - a.rate) * (1 - Math.exp(-dt * 10));
    const run = Math.min(1, speed / 5);
    a.bank += (clamp(-a.rate * 0.05 * run, -0.22, 0.22) - a.bank) * (1 - Math.exp(-dt * 8));
    // atterrissage : écrasement proportionnel à la chute ; décollage : étirement
    if (a.air && P.grounded) { a.landK = clamp(-a.vy / 14, 0.25, 1); a.land = 1; if (a.vy < -9 && P === this.player) this.landDust(P, a.landK); }
    if (!a.air && !P.grounded && P.vel.y > 2) a.stretch = 1;
    a.air = !P.grounded; a.vy = P.vel.y;
    a.land = Math.max(0, a.land - dt * 5); a.stretch = Math.max(0, a.stretch - dt * 4);
    // petites bouffées de poussière quand on court vite
    if (P.grounded && speed > 6 && Math.random() < dt * 7 && P.pos.y > L.WATER_Y + 0.1) {
      this.spawnParticle(P.pos.x - Math.sin(P.yaw) * 0.6 + (Math.random() - 0.5) * 0.5, P.pos.y + 0.1, P.pos.z - Math.cos(P.yaw) * 0.6 + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, 0xd8ccb4, 0.22 + Math.random() * 0.12, 0.45, 2);
    }
    // queue : ressort qui traîne derrière les virages
    const tailGoal = clamp(a.rate * 0.12, -0.7, 0.7);
    a.tailV += ((tailGoal - a.tail) * 60 - a.tailV * 7) * dt; a.tail += a.tailV * dt;
    // ce que la tête regarde (le plus proche : chat, Mamie, médaille, ami), cherché 4 fois par seconde
    if ((a.lookT -= dt) <= 0) {
      a.lookT = 0.25; a.target = null;
      let best = 81;
      const consider = (x, z, w) => { const d = ((x - P.pos.x) ** 2 + (z - P.pos.z) ** 2) / (w || 1); if (d < best && d > 0.8) { best = d; a.target = { x, z }; } };
      for (const c of this.cats || []) if (!c.dead && c.mesh.visible) consider(c.pos.x, c.pos.z, 1.6);
      if (this.mamie) consider(this.mamie.position.x, this.mamie.position.z, 0.6);
      for (const m of this.medals || []) if (!m.taken && m.mesh.visible) consider(m.def.x, m.def.z);
      for (const b of this.balls || []) if (!b.taken) consider(b.def.x, b.def.z);
      for (const Q of this.players) if (Q !== P && Q.pos) consider(Q.pos.x, Q.pos.z, 0.5);
    }
    let look = clamp(a.rate * 0.12, -0.5, 0.5), lookP = 0;
    if (a.target && P.grounded) {
      const ang = Math.atan2(a.target.x - P.pos.x, a.target.z - P.pos.z);
      const rel = ((ang - P.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(rel) < 1.9) look = clamp(rel, -0.9, 0.9);
    }
    // attente
    if (speed < 0.3 && P.grounded && !P.attackT && !P.kart) a.still += dt; else { a.still = 0; a.idle = null; }
    if (a.still > 3.5 && !a.idle) { a.idle = ['sniff', 'scratch', 'look', 'shake', 'sniff', 'look'][Math.floor(Math.random() * 6)]; a.idleT = 0; }
    if (a.idle) {
      a.idleT += dt;
      const dur = { sniff: 2.6, scratch: 2.0, look: 3.2, shake: 1.1 }[a.idle];
      if (a.idleT > dur) { a.idle = null; a.still = 1.5 - Math.random() * 2; }
    }
    a.look += (look - a.look) * (1 - Math.exp(-dt * 6));
    a.lookP += (lookP - a.lookP) * (1 - Math.exp(-dt * 6));
    return a;
  }

  /** Étincelles de couleur autour d'un chien qui fait la pirouette. */
  trickSparkles(P, dt) {
    if (Math.random() > dt * 40) return;
    const a = Math.random() * Math.PI * 2, cols = [0xffd23a, 0xff6ab0, 0x5ac8ff, 0x8ae05a];
    this.spawnParticle(P.pos.x + Math.cos(a) * 0.9, P.pos.y + 0.6 + Math.random(), P.pos.z + Math.sin(a) * 0.9, Math.cos(a) * 1.2, 1.5, Math.sin(a) * 1.2, cols[(Math.random() * 4) | 0], 0.25, 0.6, 1);
  }

  /** Échelle d'écrasement / étirement (x, y, z) à partir de l'état d'animation. */
  squash(o, a) {
    const l = Math.sin(a.land * Math.PI) * a.landK * 0.2, st = Math.sin(a.stretch * Math.PI) * 0.12;
    o.scale.set(1 + l * 0.5 - st * 0.4, 1 - l + st, 1 + l * 0.5 - st * 0.4);
  }

  /** Secousse de l'écran et micro-arrêt de l'image (coups, chocs). */
  kick(amp, stop) {
    if (this.cine) return;
    if (amp > (this.shakeT > 0 ? this.shakeA * (this.shakeT / this.shakeD) : 0)) { this.shakeA = amp; this.shakeD = this.shakeT = 0.18 + amp * 0.5; }
    if (stop && this.party.size === 1 && !this.guest) this.hitStop = Math.max(this.hitStop || 0, stop);
    if (amp >= 0.3) try { if (navigator.vibrate) navigator.vibrate(Math.round(amp * 90)); } catch (e) { /* ignore */ }
  }

  /** Petit nuage de poussière (atterrissage lourd, démarrage, dérapage). */
  landDust(P, k) {
    const s = this.support(P.pos.x, P.pos.z, P.pos.y + 0.2);
    if (s.y < L.WATER_Y) return;
    if (P === this.me) this.kick(0.06 + k * 0.1);
    const n = Math.round(6 + k * 10);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = 1.4 + Math.random() * 1.6 * k;
      this.spawnParticle(P.pos.x + Math.cos(ang) * 0.4, s.y + 0.12, P.pos.z + Math.sin(ang) * 0.4, Math.cos(ang) * v, 0.6 + Math.random() * 0.8, Math.sin(ang) * v, 0xd8ccb4, 0.32, 0.55, 3);
    }
  }

  /**
   * Mamie Labrador (squelette complet) : elle respire, suit du regard le chien le plus
   * proche (cou et tête ; le corps ne tourne que si on passe derrière elle), hoche et
   * penche la tête quand elle parle, lève une patte pour dire bonjour, balaie le sol
   * de la queue (plus vite quand on est là).
   */
  animateMamie(dt, t) {
    const m = this.mamie, R = m.userData.rig, a = m.userData.anim || (m.userData.anim = { yaw: 0, pitch: 0, tilt: 0, tiltGoal: 0, wave: 0, near: false, nextTilt: 3, talkLine: null });
    const mx = L.npcs.mamie.x, mz = L.npcs.mamie.z;
    // qui regarder : le chien le plus proche (ou la caméra pendant une cinématique)
    let tx = this.camera.position.x, tz = this.camera.position.z, best = 1e9;
    if (!this.cine) for (const Q of this.players) { const d = Math.hypot(Q.pos.x - mx, Q.pos.z - mz); if (d < best) { best = d; tx = Q.pos.x; tz = Q.pos.z; } }
    const want = Math.atan2(tx - mx, tz - mz);
    let rel = ((want - m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    // le corps se tourne seulement si on est vraiment derrière elle
    if (Math.abs(rel) > 1.1) m.rotation.y = lerpAngle(m.rotation.y, want, Math.min(1, dt * 1.2));
    rel = ((want - m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const close = best < 7;
    a.yaw += (clamp(rel, -1.0, 1.0) * (best < 25 || this.cine ? 1 : 0.2) - a.yaw) * Math.min(1, dt * 3);
    a.pitch += ((close ? 0.55 : 0.4) - a.pitch) * Math.min(1, dt * 2);      // (le modèle regarde un peu en l'air au repos)
    // elle parle ?
    const d = this.dialog, cs = this.cine && this.cine.shot && this.cine.shot.say;
    const talking = (d && d.lines && d.lines[d.i] && d.lines[d.i].who === 'Mamie Labrador' && d.chars < d.lines[d.i].text.length + 4)
      || (cs && cs.who === 'Mamie Labrador' && this.cine.shown < (this.cine.full || '').length);
    const line = d && d.lines ? d.i + ':' + (d.lines[d.i] || {}).text : cs ? cs.text : null;
    if (talking && line !== a.talkLine) { a.talkLine = line; a.tiltGoal = (Math.random() - 0.5) * 0.4; }
    // pencher la tête de temps en temps (curieuse)
    if ((a.nextTilt -= dt) <= 0) { a.nextTilt = 3 + Math.random() * 4; a.tiltGoal = close ? (Math.random() - 0.5) * 0.45 : 0; }
    a.tilt += (a.tiltGoal - a.tilt) * Math.min(1, dt * 3);
    // bonjour : une patte levée quand un chien arrive près d'elle
    if (close && !a.near) a.wave = 1.6;
    a.near = close;
    a.wave = Math.max(0, a.wave - dt);
    const breath = Math.sin(t * 2.2);
    // corps immobile et bien droit (le modèle scanné se déformait dès qu'on le pliait) :
    // juste la respiration, la tête qui suit les chiens et la queue qui remue
    // le scan penche en avant (≈ 30°) et sur sa droite (≈ 9°) : on redresse le buste, les
    // pattes restent posées (elles suivent les hanches), et la tête regarde droit devant
    R.chest.scale.set(1, 1, 1 + breath * 0.012);
    R.chest.rotation.set(MAMIE_UPRIGHT.x, 0, MAMIE_UPRIGHT.z);
    const talk = talking ? Math.sin(t * 9) * 0.03 + Math.sin(t * 4.3) * 0.02 : 0;
    R.neck.rotation.set(a.pitch * 0.25 + talk * 0.5 + MAMIE_UPRIGHT.neck, a.yaw * 0.3, a.tilt * 0.15);
    R.head.rotation.set(a.pitch * 0.35 + talk + MAMIE_UPRIGHT.head, a.yaw * 0.35, a.tilt * 0.4 + (talking ? Math.sin(t * 2.1) * 0.04 : 0));
    R.legL.rotation.set(0, 0, 0); R.pawL.rotation.set(0, 0, 0);
    // dans le scan, la patte avant droite reste levée (≈ 11 cm) : on l'écarte un peu et on la pose au sol
    if (!R.pawR.userData.p0) R.pawR.userData.p0 = R.pawR.position.clone();
    R.legR.rotation.set(0, 0, 0.12); R.pawR.rotation.set(0, 0, 0);
    R.pawR.position.copy(R.pawR.userData.p0); R.pawR.position.y -= 0.105;
    R.tail.rotation.set(0, Math.sin(t * (close ? 9 : 3.5)) * (close ? 0.4 : 0.18), 0);
  }

  /**
   * Mamie assise (modèle « labrador assis ») : elle respire, suit les chiens du regard,
   * penche la tête quand on approche, hoche la tête quand elle parle, et sa queue
   * balaie le sol (vite quand un chien est tout près). Le corps se tourne doucement si
   * on passe derrière elle.
   */
  animateMamieSitting(dt, t) {
    const m = this.mamie, u = m.userData, a = u.anim || (u.anim = { yaw: 0, pitch: 0, tilt: 0, tiltGoal: 0, nextTilt: 2, wag: 0 });
    const mx = m.position.x, mz = m.position.z;
    let tx = this.camera.position.x, tz = this.camera.position.z, best = 1e9;
    if (!this.cine) for (const Q of this.players) { const d = Math.hypot(Q.pos.x - mx, Q.pos.z - mz); if (d < best) { best = d; tx = Q.pos.x; tz = Q.pos.z; } }
    const want = Math.atan2(tx - mx, tz - mz);
    let rel = ((want - m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(rel) > 0.9) m.rotation.y = lerpAngle(m.rotation.y, want, Math.min(1, dt * 1.0));
    rel = ((want - m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const close = best < 7;
    const d = this.dialog, cs = this.cine && this.cine.shot && this.cine.shot.say;
    const talking = (d && d.lines && d.lines[d.i] && d.lines[d.i].who === 'Mamie Labrador' && d.chars < d.lines[d.i].text.length + 4)
      || (cs && cs.who === 'Mamie Labrador' && this.cine.shown < (this.cine.full || '').length);
    a.yaw += (clamp(rel, -0.7, 0.7) * (best < 25 || this.cine ? 1 : 0.3) - a.yaw) * Math.min(1, dt * 3);
    if ((a.nextTilt -= dt) <= 0) { a.nextTilt = 2.5 + Math.random() * 3.5; a.tiltGoal = close ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.15; }
    a.tilt += (a.tiltGoal - a.tilt) * Math.min(1, dt * 3);
    const nod = talking ? Math.sin(t * 7) * 0.06 + Math.sin(t * 3.1) * 0.04 : 0;
    // la tête (et ses yeux) tourne, penche, hoche ; petit souffle du haletement quand on est là
    const pant = close && !talking ? Math.sin(t * 9) * 0.015 : 0;
    u.head.rotation.set(nod + pant, a.yaw, a.tilt);
    // respiration : le poitrail gonfle doucement
    const br = Math.sin(t * 2.0);
    u.body.scale.set(1 + br * 0.006, 1 + br * 0.004, 1 + br * 0.01);
    // la queue balaie le sol
    a.wag += dt * (close ? 11 : 4);
    if (u.tail) u.tail.rotation.set(0, Math.sin(a.wag) * (close ? 0.45 : 0.2), 0);
  }

  /** Ainu (avec ou sans Matcha sur le dos) : course, saut, hélice de la queue. */
  renderDuo(P, dt, t) {
    const duo = P.mesh, u = duo.userData;
    duo.position.copy(P.pos);
    let yaw = P.yaw;
    if (P.attackT > 0) yaw += (1 - P.attackT / ATTACK_TIME) * Math.PI * 4;
    if (P.trickT > 0) { yaw += (1 - P.trickT / 0.9) * Math.PI * 2; this.trickSparkles(P, dt); }
    duo.rotation.y = yaw;
    const speed = Math.hypot(P.vel.x, P.vel.z);
    const a = this.animState(P, dt, t, speed);
    P.phase += dt * (speed * 1.55 + (speed > 0.3 ? 1.2 : 0));
    const run = Math.min(1, speed / 5), gallop = Math.min(1, Math.max(0, (speed - 5) / 4));
    // trot (diagonales) qui devient galop (pattes avant puis arrière) quand on va vite
    u.legs.forEach((l, i) => {
      if (P.grounded) {
        const trot = P.phase + (i === 0 || i === 3 ? 0 : Math.PI);
        const gal = P.phase + (i < 2 ? 0 : Math.PI * 0.85) + (i % 2) * 0.35;
        const ph = trot + (gal - trot) * gallop;
        l.rotation.x = Math.sin(ph) * (0.8 + gallop * 0.25) * run;
      } else l.rotation.x = P.vel.y > 0 ? (i < 2 ? -0.9 : 0.8) : (i < 2 ? -0.35 : 0.3);
    });
    // le corps rebondit deux fois par foulée, et plonge un peu au galop
    const bob = Math.abs(Math.sin(P.phase)) * 0.08 * run;
    u.ainu.position.y = P.grounded ? bob - Math.sin(a.land * Math.PI) * a.landK * 0.12 : 0;
    const pitchRun = gallop * Math.sin(P.phase * 2) * 0.08;
    u.ainu.rotation.x = P.dashT > 0 ? 0.18 : P.grounded ? pitchRun + run * 0.04 : clamp(-P.vel.y * 0.02, -0.25, 0.3);
    u.ainu.rotation.z = a.bank;
    this.squash(duo, a);
    // queue : hélice en planant, sinon remue + ressort des virages ; plus heureuse près des amis
    const wag = Math.sin(t * (speed > 1 ? 14 : a.target ? 11 : 7)) * (a.target ? 0.6 : 0.45);
    u.tail.rotation.set(P.gliding ? -1.2 : -0.15 * run, P.gliding ? t * 28 : wag - a.tail, 0);
    u.tail.position.y = u.tailY0 + (P.gliding ? 0.3 : 0);
    u.matcha.rotation.x = P.flipT > 0 ? (1 - P.flipT / 0.45) * Math.PI * 2 : (P.dashT > 0 ? 0.4 : 0) + Math.sin(a.land * Math.PI) * a.landK * 0.3;
    u.matcha.position.y = u.matchaY0 + (P.grounded ? Math.abs(Math.sin(P.phase + 0.6)) * 0.06 * run : 0.05) + (P.flipT > 0 ? Math.sin((1 - P.flipT / 0.45) * Math.PI) * 0.8 : 0);
    u.matcha.rotation.y = -a.look * 0.6;
    // tête : regarde ce qui l'intéresse, compense le rebond
    let hx = Math.sin(t * 2) * 0.05 - bob * 1.2, hy = a.look, hz = 0;
    if (a.idle) {
      const k = a.idleT, ease = Math.min(1, k * 3) * Math.min(1, (({ sniff: 2.6, scratch: 2.0, look: 3.2, shake: 1.1 })[a.idle] - k) * 3);
      if (a.idle === 'sniff') { hx += (0.55 + Math.sin(k * 16) * 0.07) * ease; hy += Math.sin(k * 1.7) * 0.4 * ease; }
      else if (a.idle === 'look') { hy += Math.sin(k * 1.9) * 0.85 * ease; hx -= 0.15 * ease; u.matcha.rotation.y += Math.sin(k * 1.9 + 1) * 0.6 * ease; }
      else if (a.idle === 'scratch') { u.legs[3].rotation.x = (-1.0 + Math.sin(k * 34) * 0.35) * ease; u.ainu.rotation.z += 0.1 * ease; hz = 0.35 * ease; hy -= 0.4 * ease; }
      else if (a.idle === 'shake') { const sh = Math.sin(k * 38) * (1 - k / 1.1) * ease; u.ainu.rotation.z += sh * 0.14; hz = sh * 0.4; u.matcha.rotation.z = sh * 0.2; }
    }
    const bk = P.barkT > 0 ? Math.sin((0.7 - P.barkT) / 0.7 * Math.PI) : 0;    // ouaf : tête en l'air
    u.head.rotation.set(hx - bk * 0.5, hy, hz);
    if (u.mhead) u.mhead.rotation.x = -bk * 0.6;
    if (P.cheerT > 0) { u.ainu.position.y = Math.abs(Math.sin(P.cheerT * 9)) * 0.5; u.matcha.rotation.z = Math.sin(P.cheerT * 12) * 0.3; }
    else if (!(a.idle === 'shake')) u.matcha.rotation.z = 0;
    duo.visible = !(P.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    this.placeShadow(P.shadow, P.pos, 0.8);
  }

  /** Matcha qui court tout seul (à deux) : petits bonds, saltos, attaque tournoyante. */
  renderMatcha(Q, dt, t) {
    const m = Q.mesh, u = m.userData;
    m.position.copy(Q.pos);
    let yaw = Q.yaw;
    if (Q.attackT > 0) yaw += (1 - Q.attackT / ATTACK_TIME) * Math.PI * 4;
    if (Q.trickT > 0) { yaw += (1 - Q.trickT / 0.9) * Math.PI * 2; this.trickSparkles(Q, dt); }
    m.rotation.y = yaw;
    const speed = Math.hypot(Q.vel.x, Q.vel.z);
    const a = this.animState(Q, dt, t, speed);
    Q.phase += dt * (speed * 2.2 + (speed > 0.3 ? 1.5 : 0));
    const run = Math.min(1, speed / 5);
    const bob = Math.abs(Math.sin(Q.phase)) * (u.legs.length ? 0.07 : 0.25) * run;
    u.matcha.position.y = u.matchaY0 + (Q.grounded ? bob - Math.sin(a.land * Math.PI) * a.landK * 0.08 : 0);
    u.matcha.rotation.x = Q.flipT > 0 ? (1 - Q.flipT / 0.45) * Math.PI * 2 : Q.dashT > 0 ? 0.45 : Q.grounded ? Math.sin(Q.phase * 2) * 0.1 * run : clamp(-Q.vel.y * 0.02, -0.25, 0.3);
    u.matcha.rotation.z = a.bank;
    this.squash(m, a);
    let hx = Math.sin(t * 2.3) * 0.06 - bob, hy = a.look, hz = 0;
    if (a.idle) {
      const k = a.idleT, ease = Math.min(1, k * 3) * Math.min(1, (({ sniff: 2.6, scratch: 2.0, look: 3.2, shake: 1.1 })[a.idle] - k) * 3);
      if (a.idle === 'sniff') { hx += (0.5 + Math.sin(k * 18) * 0.07) * ease; hy += Math.sin(k * 1.7) * 0.4 * ease; }
      else if (a.idle === 'look') { hy += Math.sin(k * 1.9) * 0.85 * ease; hz = Math.sin(k * 0.9) * 0.3 * ease; }
      else if (a.idle === 'scratch') { if (u.legs[3]) u.legs[3].rotation.x = (-1.0 + Math.sin(k * 34) * 0.35) * ease; hz = 0.35 * ease; }
      else if (a.idle === 'shake') { const sh = Math.sin(k * 38) * (1 - k / 1.1) * ease; u.matcha.rotation.z += sh * 0.16; hz = sh * 0.4; }
    }
    const bk = Q.barkT > 0 ? Math.sin((0.7 - Q.barkT) / 0.7 * Math.PI) : 0;
    u.mhead.rotation.set(hx - bk * 0.6, hy, hz);
    u.legs.forEach((l, i) => {
      if (a.idle === 'scratch' && i === 3) return;
      if (Q.grounded) l.rotation.x = Math.sin(Q.phase * 2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.9 * run;
      else l.rotation.x = Q.vel.y > 0 ? (i < 2 ? -0.9 : 0.9) : (i < 2 ? -0.4 : 0.35);
    });
    if (u.mtail) u.mtail.rotation.y = Math.sin(t * (speed > 1 ? 16 : a.target ? 12 : 8)) * 0.5 - a.tail;
    if (Q.cheerT > 0) { u.matcha.position.y += Math.abs(Math.sin(Q.cheerT * 9)) * 0.45; u.matcha.rotation.z = Math.sin(Q.cheerT * 12) * 0.3; }
    m.visible = !(Q.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    this.placeShadow(Q.shadow, Q.pos, 0.5);
  }

  placeShadow(sh, pos, r) {
    const s = this.support(pos.x, pos.z, pos.y + 0.1);
    const h = Math.max(0, pos.y - s.y);
    sh.visible = s.y > L.WATER_Y - 0.1;
    sh.position.set(pos.x, s.y + 0.04, pos.z);
    const k = Math.max(0.35, 1 - h / 8);
    sh.scale.set(k, k, k);
    sh.material.opacity = 0.3 * k;
    void r;
  }

  // -------------------------------------------------------------------------
  // Menus (pause, reprise, fin)
  // -------------------------------------------------------------------------
  togglePause() {
    if (this.dom.overlay.dataset.kind === 'pause') { this.hideOverlay(); return; }
    if (!this.dom.overlay.classList.contains('hidden')) return;
    this.showOverlay('pause');
  }

  /** Mode photo : interface cachée, monde figé, caméra libre, bouton 📸. */
  setPhotoMode(on) {
    this.photoMode = on;
    this.paused = false;
    this.dom.root.classList.toggle('photo-on', on);
    if (!this.dom.photoBar) {
      const bar = document.createElement('div');
      bar.className = 'adv-photo';
      bar.innerHTML = `<div class="ph-tip">Glisse le doigt pour tourner autour de tes chiens</div>
        <button data-ph="out" aria-label="Reculer">➖</button><button data-ph="in" aria-label="Approcher">➕</button>
        <button data-ph="pose" aria-label="Pirouette">💫</button><button data-ph="snap" class="snap" aria-label="Prendre la photo">📸</button>
        <button data-ph="close" aria-label="Fermer">✖</button>`;
      bar.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-ph]'); if (!b) return;
        e.stopPropagation(); e.preventDefault();
        const a = b.dataset.ph;
        if (a === 'snap') { this.snapPending = true; this.sound('switch'); }
        else if (a === 'close') this.setPhotoMode(false);
        else if (a === 'in') this.camDistOverride = Math.max(3, (this.camDistOverride || this.camDist) - 1.5);
        else if (a === 'out') this.camDistOverride = Math.min(22, (this.camDistOverride || this.camDist) + 1.5);
        else if (a === 'pose') { const P = this.me; if (P.grounded) { P.trickT = 0.9; P.vel.y = 7.5; P.grounded = false; this.sound('trick'); } }
      });
      this.dom.root.appendChild(bar);
      this.dom.photoBar = bar;
    }
    if (!on) this.camDistOverride = 0;
  }

  /** Enregistre (ou partage, sur téléphone) l'image qui vient d'être dessinée. */
  /** Photo souvenir automatique (médaille…) : rangée dans l'album, sans flash ni partage. */
  autoPhoto(label) {
    const MEM = window.Memories;
    if (!MEM) return;
    try { MEM.postcard(this.renderer.domElement, L.NAME, 480).then(b => b && MEM.add(b, { world: L.NAME, label, auto: true })).catch(() => {}); } catch (e) { /* ignore */ }
  }
  savePhoto() {
    const cv = this.renderer.domElement;
    const flash = document.createElement('div'); flash.className = 'adv-flash'; this.dom.root.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
    const MEM = window.Memories;
    if (this.outfit && this.outfit.hat) this.betise(this.me, 'hat_photo');
    // carte postale (cadre, nom du monde, date) : partagée, et un exemplaire rangé dans l'album
    const make = MEM ? MEM.postcard(cv, L.NAME, Math.min(1280, cv.width)) : new Promise(res => cv.toBlob(res, 'image/png'));
    if (MEM) MEM.postcard(cv, L.NAME, 640).then(b => b && MEM.add(b, { world: L.NAME, label: 'Photo' })).catch(() => {});
    make.then((blob) => {
      if (!blob) return;
      const jpg = blob.type === 'image/jpeg';
      const name = `matcha-ainu-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${jpg ? 'jpg' : 'png'}`;
      const file = new File([blob], name, { type: blob.type });
      if (this.isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Matcha & Ainu' }).catch(() => {});
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      this.banner('Clic !', 'Photo enregistrée (et rangée dans ton album)', 1600);
    });
  }

  /** Change la tenue de mon chien (garde-robe). */
  setOutfit(part) {
    this.outfit = Object.assign(WR.outfit(), part);
    WR.setOutfit(this.outfit);
  }

  showOverlay(kind) {
    const o = this.dom.overlay;
    const s = this.save;
    const time = Math.floor(s.time);
    const fmt = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    let html = '';
    if (kind === 'pause') {
      html = `<h2>Pause</h2>
        <div class="adv-stats">${medalWord()} ${s.medals.length}/${L.medals.length} · ${collectWord()} ${s.bones.length}/100</div>
        ${this.hostSession ? `<div class="adv-stats">${this.hostSession.own === false ? 'Code du monde' : 'Code de ton monde'} : <b class="adv-code">${this.hostSession.code}</b> (jusqu'à 6 joueurs)</div>` : ''}
        ${this.visitorsLine()}
        <button class="btn primary" data-a="resume">Reprendre</button>
        <div class="adv-toggles">
          <button class="btn" data-a="music">🎵 Musique : ${this.sfx && this.sfx.musicOn === false ? 'non' : 'oui'}</button>
          ${this.guest ? '' : `<button class="btn" data-a="mode">${{ promenade: '🐣', aventure: '🐶', defi: '🏆' }[this.mode]} Mode : ${MODES[this.mode]}</button>`}
          ${this.isTouch ? '' : `<button class="btn" data-a="quality">✨ Qualité : ${RT.isUltra() ? 'ultra' : 'normale'}</button>`}
          ${this.guest ? '' : `<button class="btn" data-a="style">🎨 Style : ${this.realistic ? 'réaliste' : 'dessin animé'}</button>`}
          <button class="btn" data-a="mic">🎤 Micro : ${this.vc && this.vc.on ? 'allumé' : 'coupé'}</button>
          ${(window.SpeechRecognition || window.webkitSpeechRecognition) ? `<button class="btn" data-a="voicecmd">🗣️ Parler au chien : ${this.voiceCmdOn && this.voiceCmdOn() ? 'oui' : 'non'}</button>` : ''}
        </div>
        ${this.vc && this.party.size > 1 ? `<label class="adv-vol">🔊 Voix des amis <input type="range" min="0.5" max="5" step="0.25" value="${this.vc.volume}" data-vol="1"></label>` : ''}
        <div class="adv-stats adv-mic-note">${!this.vc ? 'Le micro sert à parler avec tes amis : choisis « Jouer ensemble » dans le menu pour ouvrir ton monde.' : this.party.size < 2 ? 'Personne n\'est encore là : tes amis t\'entendront dès qu\'ils arrivent.' : ''}
        </div>
        <button class="btn" data-a="wardrobe">🎩 Déguisements</button>
        ${this.party.size > 1 ? '' : '<button class="btn" data-a="photo">📷 Mode photo</button>'}
        ${this.guest || this.party.size > 1 ? '' : '<button class="btn" data-a="story">🎬 Revoir l\'histoire</button>'}
        ${this.coop ? '' : '<button class="btn" data-a="restart">Recommencer le niveau</button>'}
        <button class="btn ghost" data-a="credits">📜 Crédits</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'wardrobe') {
      const o = WR.outfit(), n = WR.rewards();
      const cell = (it) => {
        const ok = WR.unlocked(it), on = o[it.kind] === it.id;
        const lock = it.shop ? 'Boutique de Port-Croquette' : `${it.need} récompense${it.need > 1 ? 's' : ''}`;
        return `<button class="wr-item${on ? ' on' : ''}${ok ? '' : ' locked'}" ${ok ? `data-a="wear:${it.id}"` : 'disabled'}><span class="ic">${ok ? it.icon : '🔒'}</span><b>${it.name}</b><small>${ok ? (on ? 'Porté' : 'Mettre') : lock}</small></button>`;
      };
      html = `<h2>Déguisements</h2>
        <div class="adv-stats">${n} récompense${n > 1 ? 's' : ''} gagnée${n > 1 ? 's' : ''} : chaque récompense débloque de nouveaux déguisements !</div>
        <div class="wr-grid">${WR.ITEMS.map(cell).join('')}</div>
        <button class="btn primary" data-a="pause">Retour</button>`;
    } else if (kind === 'credits') {
      html = `<h2>Crédits</h2>
        <div class="adv-stats adv-credits">Modèles 3D gratuits (licence CC BY 4.0, Sketchfab) :<br>
        Mamie Labrador : « Ella of Golden House » par 3dfascination<br>
        Biscotte : « Retriever » par doinspire<br>
        Habitants : « Doge » par kitsuneko_3d, « Riley » par lopuh22721, « Bulldog Puppy » par doinspire<br>
        Matières, ciel, arbres et fougères scannés : Poly Haven (CC0)<br>
        Voix : synthèse vocale Chatterbox (Resemble AI, MIT), d'après des lecteurs du corpus Multilingual LibriSpeech (CC BY 4.0)</div>
        <button class="btn primary" data-a="pause">Retour</button>`;
    } else if (kind === 'continue') {
      html = `<h2>${L.NAME}</h2>
        <div class="adv-stats">${medalWord()} ${s.medals.length}/${L.medals.length} · ${collectWord()} ${s.bones.length}/100</div>
        ${this.hostSession ? `<div class="adv-stats">Ton monde : code <b class="adv-code">${this.hostSession.code}</b></div>` : ''}
        ${this.visitorsLine()}
        <button class="btn primary" data-a="resume-save">Continuer l'aventure</button>
        <button class="btn" data-a="new">Nouvelle partie</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'confirm') {
      html = `<h2>Recommencer ce niveau ?</h2>
        <div class="adv-stats">Les ${medalWord().toLowerCase()} et les ${collectWord().toLowerCase()} ramassés dans ce niveau seront perdus.</div>
        <button class="btn primary" data-a="new">Oui, recommencer</button>
        <button class="btn ghost" data-a="back-pause">Non</button>`;
    } else if (kind === 'full') {
      html = `<h2>Monde complet</h2>
        <div class="adv-stats">Il y a déjà 6 joueurs dans ce monde. Réessaie un peu plus tard !</div>
        <button class="btn primary" data-a="lost">Menu principal</button>`;
    } else if (kind === 'lost') {
      html = `<h2>Connexion perdue</h2>
        <div class="adv-stats">L'autre joueur a quitté la partie.</div>
        <button class="btn primary" data-a="lost">Menu principal</button>`;
    } else if (kind === 'complete') {
      html = `<h2>Niveau ${L.ID} terminé !</h2>
        <div class="adv-medals">${('<img src="' + ICONS.medal + '" alt="">').repeat(Math.min(5, L.medals.length))}</div>
        <div class="adv-stats">${collectWord(true)} ${s.bones.length}/100 · Temps ${fmt}</div>
        ${NEXT_LEVEL[L.ID] && !this.guest ? `<button class="btn primary" data-a="next">${NEXT_LEVEL[L.ID]} →</button>` : ''}
        <button class="btn ${NEXT_LEVEL[L.ID] && !this.guest ? '' : 'primary'}" data-a="resume">Continuer à explorer</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    }
    o.innerHTML = `<div class="adv-panel">${html}</div>`;
    o.dataset.kind = kind;
    o.classList.remove('hidden');
    this.dom.banner.classList.add('hidden');
    this.paused = !this.coop;
    o.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => this.overlayAction(b.dataset.a)));
    const vol = o.querySelector('[data-vol]');
    if (vol) vol.addEventListener('input', () => { if (this.vc) this.vc.setVolume(+vol.value); });
  }

  /** Les amis passés dans ce monde (il s'en souvient d'une fois sur l'autre). */
  visitorsLine() {
    const v = (this.save.visitors || []).slice(-8);
    return v.length ? `<div class="adv-stats">Ils sont passés dans ce monde : ${v.map(escapeHtml).join(', ')}</div>` : '';
  }

  hideOverlay() {
    this.dom.overlay.classList.add('hidden');
    this.dom.overlay.dataset.kind = '';
    this.paused = false;
    this.lastFrame = performance.now();
  }

  overlayAction(a) {
    if (this.sfx) { this.sfx.unlock(); this.sfx.click(); }
    if (a.startsWith('wear:')) { this.outfit = WR.toggle(a.slice(5)); this.showOverlay('wardrobe'); return; }
    switch (a) {
      case 'resume': this.hideOverlay(); break;
      case 'story': this.hideOverlay(); this.playStory(); break;
      case 'credits': this.showOverlay('credits'); break;
      case 'wardrobe': this.showOverlay('wardrobe'); break;
      case 'photo': this.hideOverlay(); this.setPhotoMode(true); break;
      case 'pause': this.showOverlay('pause'); break;
      case 'music': if (this.sfx && this.sfx.setMusic) this.sfx.setMusic(this.sfx.musicOn === false); this.showOverlay('pause'); break;
      case 'mode': {
        const order = ['promenade', 'aventure', 'defi'];
        this.setMode(order[(order.indexOf(this.mode) + 1) % 3]);
        this.showOverlay('pause');
        break;
      }
      case 'quality':
        try { localStorage.setItem('dogfight.quality', RT.isUltra() ? 'normal' : 'ultra'); } catch (e) { /* ignore */ }
        this.hideOverlay(); this.switchLevel(L.ID);
        break;
      case 'style':
        try { localStorage.setItem('dogfight.style', this.realistic ? 'toon' : 'real'); } catch (e) { /* ignore */ }
        this.hideOverlay(); this.switchLevel(L.ID);
        break;
      case 'mic': this.toggleMic().then(() => { if (this.dom.overlay.dataset.kind === 'pause') this.showOverlay('pause'); }); break;
      case 'voicecmd': {
        const on = !this.voiceCmdOn();
        try { localStorage.setItem('dogfight.voicecmd', on ? '1' : '0'); } catch (e) { /* ignore */ }
        this.dom.root.querySelector('.adv-saydog').classList.toggle('hidden', !on);
        this.showOverlay('pause');
        break;
      }
      case 'resume-save': this.hideOverlay(); this.beginLevel(false); break;
      case 'restart': this.showOverlay('confirm'); break;
      case 'back-pause': this.showOverlay('pause'); break;
      case 'new':
        try { localStorage.removeItem(this.saveKey); } catch (e) { /* ignore */ }
        if (this.coop && this.coop.link) this.coop.link.onclose = null;
        this.coop = null;
        this.dispose(true);
        start({ sfx: this.sfx, onExit: this.onExit, coopHost: this.hostSession, level: L.ID });
        break;
      case 'next': this.switchLevel(L.ID + 1); break;
      case 'quit': this.dispose(); this.onExit(); break;
      case 'lost': this.dispose(); this.onExit(); break;
    }
  }

  /** Passe à un autre niveau (l'ami connecté suit). */
  switchLevel(id) {
    if (this.coop && this.coop.link) this.coop.link.onclose = null;
    this.coop = null;
    this.dispose(true);
    start({ sfx: this.sfx, onExit: this.onExit, coopHost: this.hostSession, level: id });
  }

  /** Joue la cinématique du chapitre (intro de l'histoire au niveau 1). */
  playStory(done) {
    const shots = this.guest ? null : storyShots(this, L);
    if (!shots) { if (done) done(); return false; }
    if (this.cine) this.cine.finish();
    stopVoice(this.sfx);
    if (this.sfx && this.sfx.duck) this.sfx.duck(false, 'dialog');
    this.dialog = null; this.dom.dialog.classList.add('hidden');
    this.cine = new Cinema(this, shots, () => { this.cine = null; if (done) done(); });
    return true;
  }

  beginLevel(fresh) {
    this.camInit = false;
    if (!this.guest) markVisited(L.ID);
    // première visite du chapitre : la cinématique d'abord
    if (!this.guest && !this.save.story && this.party.size <= 1) {
      this.save.story = true; this.persist();
      if (this.playStory(() => this.beginLevel(fresh))) return;
    }
    if (fresh || !this.save.intro) {
      // Mamie accueille le duo
      this.freeze = 0.6;
      setTimeout(() => { if (!this.disposed && !this.dialog) this.talkMamie(true); }, 700);
    } else {
      // astuce : le lancer de Matcha, tant qu'on ne l'a jamais essayé
      if (!this.save.threwOnce && this.party.size === 1) setTimeout(() => { if (!this.disposed && !this.dialog && this.player.kind === 'duo') this.banner('Astuce : lance Matcha !', 'Appuie 2 fois vite sur Attaque : elle ramasse les os et renverse les chats', 4200); }, 9000);
      const kn = kidName();
      this.banner(kn ? `Coucou ${kn} !` : L.NAME, kn ? `${L.NAME} · ${medalWord()} ${this.save.medals.length}/${L.medals.length}` : `${medalWord()} ${this.save.medals.length}/${L.medals.length}`, 2400);
    }
  }

  dispose(keepSession) {
    this.disposed = true;
    // le chat vocal ne s'arrête que si on quitte vraiment le monde (pas en changeant de niveau)
    if (this.vc && ((this.coop && this.coop.link) || (this.hostSession && !keepSession))) { this.vc.close(); if (this.sfx && this.sfx.echoSafe) this.sfx.echoSafe(false); }
    if (this.coop && this.coop.link) { this.coop.link.onclose = null; this.coop.link.close(); }
    if (this.hostSession && !keepSession) { this.hostSession.onJoin = null; this.hostSession.close(); }
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.bannerTimer);
    if (this.sfx && this.sfx.ambStop) this.sfx.ambStop();
    stopVoice(this.sfx);
    if (this.sfx && this.sfx.duck) { this.sfx.duck(false, 'dialog'); this.sfx.duck(false, 'chat'); this.sfx.duck(false, 'chatting'); }
    this.post.dispose();
    this.renderer.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.dom.root.remove();
    if (window.__adv === this) window.__adv = null;
  }
}
