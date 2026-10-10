/*
 * Dogfight Aventure — moteur du mode aventure 3D (niveau 1).
 *
 * Plates-formes 3D façon « collect-a-thon » : le duo Ainu + Matcha explore
 * l'île, ramasse 100 os dorés et récupère 5 Médailles Patounes.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L, setLevel } from './current.js';
import * as F from './forest.js';
import * as M from './models.js';
import * as W from './world.js';
import * as T from './toon.js';

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
const MAX_HEARTS = 3;

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
  kibble: svg('<g fill="#8a5200"><circle cx="32" cy="32" r="22"/></g><circle cx="32" cy="32" r="18" fill="url(#g)"/><g fill="#c07a08"><circle cx="25" cy="27" r="3"/><circle cx="38" cy="25" r="2.6"/><circle cx="36" cy="38" r="3.2"/><circle cx="24" cy="39" r="2.4"/></g><ellipse cx="25" cy="22" rx="5" ry="3" fill="#fff" opacity=".55"/>'),
  ball: svg('<circle cx="32" cy="32" r="24" fill="url(#t)" stroke="#5a7000" stroke-width="3"/><path d="M12 20c10 6 10 18 0 24M52 20c-10 6-10 18 0 24" fill="none" stroke="#fff" stroke-width="3.5"/>'),
};

// ---------------------------------------------------------------------------
export async function start(opts) {
  opts = opts || {};
  setLevel(opts.level || 1);
  W.applySky(L.SKY);
  await M.preloadDogs();
  return new Adventure(opts);
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
    this.remote = { mx: 0, mz: 0, h: false };
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

    this.loadSave();
    this.buildDom();
    this.initThree();
    this.buildWorld();
    this.buildEntities();
    if (this.lite) {
      // ombres figées : seuls les éléments immobiles du décor en projettent
      const moving = [this.player.mesh, this.player2.mesh, this.puppy.mesh, this.elevatorMesh, this.bonesI, ...(this.levelLogic ? this.levelLogic.moving : []),
        ...this.cats.map(c => c.mesh), ...this.medals.map(m => m.mesh), ...this.balls.map(b => b.mesh), ...this.crates.map(c => c.mesh)];
      for (const o of moving) if (o) o.traverse(k => { k.castShadow = false; });
    }
    // Cel shading : aplats de lumière + contours sombres
    T.toonify(this.scene);
    const chars = [this.player.mesh, this.player2.mesh, this.mamie, this.puppy.mesh, ...this.cats.map(c => c.mesh), ...(this.levelLogic ? this.levelLogic.chars : [])];
    for (const c of chars) T.outlineTree(c, 0.018, 0x1e120c);
    const vista = this.vista.group;
    T.outlineTree(this.scene, 0.035, 0x2a1c14, (o) => {
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
    else if (this.hasProgress()) this.showOverlay('continue');
    else this.beginLevel(true);
  }

  // -------------------------------------------------------------------------
  // Sauvegarde
  // -------------------------------------------------------------------------
  emptySave() { return { bones: [], medals: [], balls: [], crates: [], cats: [], lanterns: [], boss: false, puppy: L.ID === 1 ? 'lost' : 'home', intro: false, done: false, time: 0 }; }
  loadSave() {
    this.save = this.emptySave();
    try {
      const s = JSON.parse(localStorage.getItem(L.SAVE_KEY) || 'null');
      if (s) Object.assign(this.save, s);
    } catch (e) { /* ignore */ }
  }
  persist() { if (this.guest) return; try { localStorage.setItem(L.SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }
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
            <div class="adv-count"><img src="${L.ID === 2 ? ICONS.kibble : ICONS.bone}" alt=""><span id="adv-bones">0</span><small>/100</small></div>
            <div class="adv-count"><img src="${ICONS.medal}" alt=""><span id="adv-medals">0</span><small>/5</small></div>
            <div class="adv-count adv-balls hidden"><img src="${ICONS.ball}" alt=""><span id="adv-balls">0</span><small>/5</small></div>
          </div>
          <div class="adv-mapcol">
            <div class="adv-map"><canvas width="160" height="160"></canvas><span class="adv-north">N</span></div>
            <div class="adv-quest"><b>Quête</b><span></span></div>
          </div>
        </div>
      </div>
      <div class="adv-banner hidden"></div>
      <div class="adv-prompt hidden"></div>
      <div class="adv-dialog hidden"><div class="adv-dname"></div><div class="adv-dtext"></div><div class="adv-dnext">▼</div></div>
      <button class="adv-pause" aria-label="Pause"><svg viewBox="0 0 20 20" width="18" height="18"><rect x="4" y="3" width="4" height="14" rx="1.5" fill="#fff"/><rect x="12" y="3" width="4" height="14" rx="1.5" fill="#fff"/></svg></button>
      <div class="adv-touch ${this.isTouch ? '' : 'hidden'}">
        <div class="adv-stick-zone"></div>
        <div class="adv-cam-zone"></div>
        <div class="adv-stick"><div class="adv-knob"></div></div>
        <button class="adv-btn jump" data-btn="jump"><svg viewBox="0 0 48 48"><path d="M24 8 12 22h8v14h8V22h8z" fill="currentColor"/><rect x="14" y="39" width="20" height="4" rx="2" fill="currentColor" opacity=".6"/></svg><span>Saut</span></button>
        <button class="adv-btn attack" data-btn="attack"><svg viewBox="0 0 48 48" fill="currentColor"><ellipse cx="24" cy="31" rx="9" ry="8"/><ellipse cx="12" cy="20" rx="4" ry="5"/><ellipse cx="19" cy="13" rx="4" ry="5"/><ellipse cx="29" cy="13" rx="4" ry="5"/><ellipse cx="36" cy="20" rx="4" ry="5"/></svg><span>Attaque</span></button>
        <button class="adv-btn dash" data-btn="dash"><svg viewBox="0 0 48 48" fill="currentColor"><path d="M10 12h6l10 12-10 12h-6l10-12z"/><path d="M24 12h6l10 12-10 12h-6l10-12z"/></svg><span>Charge</span></button>
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
  }

  updateHud() {
    const s = this.save;
    this.dom.bones.textContent = s.bones.length;
    this.dom.medals.textContent = s.medals.length;
    this.dom.balls.textContent = s.balls.length;
    this.dom.ballsBox.classList.toggle('hidden', !(s.balls.length > 0 && !s.medals.includes('m_balls')));
    const hp = this.player ? this.me.hearts : MAX_HEARTS;
    // à deux, le joueur de Matcha voit Matcha en grand
    const mt = this.player && this.me.kind === 'matcha';
    if (this.dom.partyMatcha !== mt && this.dom.pAinu.src) {
      this.dom.partyMatcha = mt;
      const [a, b] = [this.dom.pAinu.src, this.dom.pMatcha.src];
      this.dom.pAinu.src = b; this.dom.pMatcha.src = a;
      this.dom.root.querySelector('.adv-name').innerHTML = mt ? 'Matcha <small>&amp; Ainu</small>' : 'Ainu <small>&amp; Matcha</small>';
    }
    this.dom.hearts.innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<img src="${i < hp ? ICONS.heart : ICONS.heartEmpty}" alt="">`).join('');
    let q;
    if (!s.intro) q = 'Parle à Mamie Labrador';
    else if (this.puppy && this.puppy.state === 'follow') q = 'Ramène Biscotte à Mamie';
    else if (s.medals.length < 5) q = `Trouve les Médailles Patounes (${s.medals.length}/5)`;
    else q = 'Tu as tout trouvé, bravo !';
    this.dom.quest.textContent = q;
  }

  /** Portraits ronds d'Ainu et de Matcha, rendus une fois depuis leurs modèles 3D. */
  makePortraits() {
    const r = this.renderer, cv = r.domElement;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x9ad4ea);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a6a4a, 1.4));
    const l = new THREE.DirectionalLight(0xfff0d8, 2.4); l.position.set(2, 3, 4); sc.add(l);
    const duo = M.buildDuo(); sc.add(duo);
    duo.updateMatrixWorld(true);
    const shot = (target, dist, side) => {
      const p = new THREE.Vector3(); target.getWorldPosition(p);
      const cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.05, 50);
      cam.position.set(p.x + side, p.y + 0.05, p.z + dist); cam.lookAt(p.x, p.y - 0.02, p.z);
      r.render(sc, cam);
      const s = Math.min(cv.width, cv.height) * 0.9;
      const c = document.createElement('canvas'); c.width = c.height = 160;
      c.getContext('2d').drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, 160, 160);
      return c.toDataURL('image/jpeg', 0.85);
    };
    try {
      this.dom.pAinu.src = shot(duo.userData.headFace, 2.1, 0.75);
      this.dom.pMatcha.src = shot(duo.userData.mheadFace, 1.0, 0.35);
    } catch (e) { /* pas de portrait : pas grave */ }
    sc.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }

  /** Mini-carte : relief peint une fois, puis repères mis à jour en jeu. */
  buildMinimap() {
    const N = 160, base = document.createElement('canvas'); base.width = base.height = N;
    const x = base.getContext('2d'), img = x.createImageData(N, N);
    const R = 75; // demi-côté couvert (unités du monde)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i / N) * 2 * R - R, wz = (j / N) * 2 * R - R, h = L.heightAt(wx, wz);
      let c;
      if (h < -1.5) c = [38, 120, 190]; else if (h < 0) c = [70, 170, 210]; else if (h < 1) c = [236, 214, 160];
      else if (h > 9) c = [150, 190, 110]; else c = [96 + h * 4, 170 + h * 3, 70];
      if (W.onPath(wx, wz) && h > 0) c = [214, 196, 150];
      const k = (j * N + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = 'rgba(40,90,40,0.55)';
    for (const t of L.trees) { x.beginPath(); x.arc((t.x + R) / (2 * R) * N, (t.z + R) / (2 * R) * N, 2.4, 0, 7); x.fill(); }
    x.fillStyle = '#ece6da';
    for (const ru of L.ruins) if (ru.type !== 'arch') x.fillRect((ru.x + R) / (2 * R) * N - 1.5, (ru.z + R) / (2 * R) * N - 1.5, 3, 3);
    this.mapBase = base; this.mapR = R; this.mapT = 0;
  }

  drawMinimap() {
    const c = this.dom.map, x = c.getContext('2d'), N = c.width, R = this.mapR;
    const P = (wx, wz) => [(wx + R) / (2 * R) * N, (wz + R) / (2 * R) * N];
    x.drawImage(this.mapBase, 0, 0);
    const dot = (wx, wz, col, rad) => { const [px, py] = P(wx, wz); x.fillStyle = '#3a2410'; x.beginPath(); x.arc(px, py, rad + 1.5, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); };
    for (const m of this.medals) if (m.mesh.visible) dot(m.def.x, m.def.z, '#ffd23a', 4);
    dot(L.npcs.mamie.x, L.npcs.mamie.z, '#ff8a5a', 3.5);
    if (this.puppy.state !== 'home') dot(this.puppy.pos.x, this.puppy.pos.z, '#8ad0ff', 3.5);
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
    this.scene = new THREE.Scene();
    const LT = Object.assign({ hemi: [0xd8ecff, 0xa87a4a, 0.7], sun: [0xfff1d6, 2.6], fog: [80, 230] }, L.LIGHT || {});
    this.scene.fog = new THREE.Fog(W.SKY.horizon.getHex(), LT.fog[0], LT.fog[1]);
    this.sky = W.buildSky(this.scene);
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1200);
    this.scene.add(new THREE.HemisphereLight(...LT.hemi));
    const sun = new THREE.DirectionalLight(...LT.sun);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    if (touch) {
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
    const maxRatio = this.isTouch ? 1.25 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio) * this.pixelScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Mesure la fluidité et baisse la résolution si besoin (téléphones modestes). */
  adaptQuality(dt) {
    const p = this.perf;
    if (p.checks >= 8 || this.paused || this.dialog) { p.t = 0; p.n = 0; return; }
    p.t += dt; p.n++;
    if (p.t < 2) return;
    const fps = p.n / p.t;
    p.t = 0; p.n = 0; p.checks++;
    if (fps < 45 && this.pixelScale > 0.8) {
      this.pixelScale = Math.max(0.8, this.pixelScale * 0.9);
      this.resize();
    }
  }

  // -------------------------------------------------------------------------
  // Le monde
  // -------------------------------------------------------------------------
  buildWorld() {
    const sc = this.scene;
    const q0 = this.quality;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();

    W.buildTerrain(sc, q0);
    this.water = W.buildWater(sc, sc.fog);
    this.grass = W.buildGrass(sc, q0, this.wind);
    W.buildFlowers(sc, q0);
    W.buildTrees(sc, q0);
    this.fallTex = this.makeWaterfallTexture();
    this.pedestalBalls = [];
    if (L.ID === 1) this.buildParc();
    else this.levelLogic = F.buildForest(this, { THREE, M, W, T });

    // Nuages et papillons
    this.clouds = W.buildPaintedClouds(sc);
    this.vista = W.buildVista(sc, this.fallTex);
    W.buildRuins(sc);
    W.buildPaths(sc);
    this.crystals = W.buildCrystals(sc);
    this.butterflies = W.buildButterflies(sc);

    // Panneaux
    for (const s of L.signs) {
      const m = M.buildSign(s.text);
      m.position.set(s.x, L.heightAt(s.x, s.z), s.z);
      m.rotation.y = Math.atan2(L.START.x - s.x, L.START.z - s.z) * 0.3;
      sc.add(m);
    }
  }

  /** Décor propre au niveau 1 : Grand Chêne, îlot, ascenseur, cascade, niche, clôture, piédestal. */
  buildParc() {
    const sc = this.scene;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();

    // Grand Chêne : tronc noueux, branches rondes en spirale, grand feuillage
    const T = L.TREE;
    const bark = M.mat(0x7a5030, { roughness: 0.95 });
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
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.2, 4, 10), bark);
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
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.35, 0.5, 28), branchTop);
      pad.position.set(s.x, s.top - 0.25, s.z);
      pad.castShadow = pad.receiveShadow = true;
      sc.add(pad);
      // bras qui relie la plate-forme au tronc
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 12), bark);
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
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.3, 0.6, 40), branchTop);
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
      const m = new THREE.Mesh(W.rockGeometry(40 + i, r.r * 1.05, hgt / 2, r.r * 1.05), rm);
      m.position.set(r.x, g - 1.2 + hgt / 2, r.z);
      // dessus aplati pour qu'on voie bien où se poser
      const p = m.geometry.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > hgt / 2 - 0.15) p.setY(k, hgt / 2 - 0.15 + (p.getY(k) - (hgt / 2 - 0.15)) * 0.15);
      m.geometry.computeVertexNormals();
      m.position.y = r.top - (hgt / 2 - 0.12);
      m.castShadow = m.receiveShadow = true;
      sc.add(m);
    });
    L.stones.forEach((s, i) => {
      const m = new THREE.Mesh(W.rockGeometry(60 + i, 1.25, 2.4, 1.25), rm);
      const p = m.geometry.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 2.1) p.setY(k, 2.1 + (p.getY(k) - 2.1) * 0.2);
      m.geometry.computeVertexNormals();
      m.position.set(s.x, s.top - 2.18, s.z);
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
    kb.position.y = 0.8; kennel.add(kb);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.55, 0); roofShape.lineTo(0, 1.25); roofShape.lineTo(1.55, 0); roofShape.lineTo(-1.55, 0);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 2.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), M.mat(0xd8443a, { roughness: 0.6 }));
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
      shadow: this.makeShadow(kind === 'ainu' ? 0.8 : 0.5), active: true,
    });
    this.player = mkPlayer(duo, 'ainu');
    this.shadow = this.player.shadow;
    // À deux, Matcha descend du dos d'Ainu et court tout seul
    const solo = M.buildMatchaSolo();
    sc.add(solo);
    this.player2 = mkPlayer(solo, 'matcha');
    this.setSeparated(false, true);

    // Os dorés (instanciés)
    this.bonesI = new THREE.InstancedMesh(L.ID === 2 ? F.kibbleGeometry() : M.boneGeometry(), M.mat(0xffd34d, { metalness: 0.7, roughness: 0.3, emissive: 0x6a4800, emissiveIntensity: 0.6 }), L.bones.length);
    this.boneTaken = new Set(s.bones);
    sc.add(this.bonesI);

    // Médailles
    this.medals = L.medals.map(md => {
      const m = M.buildMedal();
      m.position.set(md.x, md.y, md.z);
      sc.add(m);
      const taken = s.medals.includes(md.id);
      return { def: md, mesh: m, taken, visible: md.visible };
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
      const dead = c.group === 'clearing' && s.cats.includes(c.id);
      m.visible = !dead;
      return { def: c, mesh: m, pos: new THREE.Vector3(c.x, c.y, c.z), home: new THREE.Vector3(c.x, c.y, c.z), yaw: Math.random() * 6, dead, target: null, t: Math.random() * 3, phase: 0, shadow: this.makeShadow(0.6), stun: 0 };
    });

    // Mamie
    this.mamie = M.buildMamie();
    this.mamie.position.set(L.npcs.mamie.x, L.npcs.mamie.y, L.npcs.mamie.z);
    this.mamie.rotation.y = Math.atan2(L.START.x - L.npcs.mamie.x, L.START.z - L.npcs.mamie.z);
    sc.add(this.mamie);
    // Biscotte
    this.puppy = { mesh: M.buildPuppy(), state: s.puppy, pos: new THREE.Vector3(), yaw: 0, phase: 0, shadow: this.makeShadow(0.45) };
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

  /** Les joueurs présents (Ainu seul avec Matcha sur le dos, ou les deux chiens séparés). */
  get players() { return this.player2 && this.player2.active ? [this.player, this.player2] : [this.player]; }
  /** Le chien contrôlé sur cet écran (la caméra le suit). */
  get me() { return this.player2 && this.player2.active && this.coop && this.coop.role === 'matcha' ? this.player2 : this.player; }
  nearestPlayer(pos) {
    let best = this.player, bd = Infinity;
    for (const P of this.players) { const d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z); if (d < bd) { bd = d; best = P; } }
    return best;
  }
  /** Sépare (à deux) ou réunit (seul) Ainu et Matcha. */
  setSeparated(on, init) {
    const P = this.player, Q = this.player2;
    if (!init && on === Q.active) return;
    Q.active = on; Q.mesh.visible = on; Q.shadow.visible = on;
    P.mesh.userData.matcha.visible = !on;
    if (on && !init) {
      Q.pos.set(P.pos.x + Math.cos(P.yaw) * 1.5, P.pos.y + 0.5, P.pos.z - Math.sin(P.yaw) * 1.5);
      Q.vel.set(0, 7, 0); Q.grounded = false; Q.jumps = 1; Q.hearts = MAX_HEARTS; Q.yaw = P.yaw;
      Q.lastSafe.copy(P.pos); Q.invuln = 1;
      this.burst(Q.pos.x, Q.pos.y + 1, Q.pos.z, 12, 0xfff0a0, 3, 0.5);
    }
    this.camInit = this.camInit && !(this.coop && this.coop.role === 'matcha');
    if (this.dom) this.updateHud();
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
    }
  }

  // -------------------------------------------------------------------------
  // Entrées
  // -------------------------------------------------------------------------
  bindInput() {
    const KEYMAP = {
      Space: 'jump', KeyJ: 'attack', KeyK: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyF: 'talk', Enter: 'talk',
    };
    this.onKeyDown = (e) => {
      if (this.disposed) return;
      if (e.code === 'Escape') { this.togglePause(); return; }
      const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Space'];
      if (moveKeys.includes(e.code) || KEYMAP[e.code]) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEYMAP[e.code]) this.pressed.add(KEYMAP[e.code]);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.onResize = () => this.resize();
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
    if (this.guest) this.guestFrame(dt);
    else if (!this.paused) {
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
    let inputs = [input], presses = [this.pressed];
    if (this.coop && players.length > 1) {
      const [lx, lz] = this.worldMove(input.x, input.y);
      const local = { wx: lx, wz: lz, jumpHeld: input.jumpHeld }, remote = { wx: this.remote.mx, wz: this.remote.mz, jumpHeld: this.remote.h };
      const lp = new Set(this.pressed), rp = new Set(this.remotePressed);
      for (const a of rp) this.pressed.add(a);   // l'un ou l'autre fait avancer les dialogues
      const ainuHere = this.coop.role === 'ainu';
      inputs = ainuHere ? [local, remote] : [remote, local];
      presses = ainuHere ? [lp, rp] : [rp, lp];
    }
    this.remotePressed.clear();
    const still = () => { for (const i of inputs) { i.x = 0; i.y = 0; i.wx = 0; i.wz = 0; } for (const p of presses) p.clear(); };
    if (this.dialog) { this.stepDialog(dt); still(); }
    if (this.freeze > 0) { this.freeze -= dt; still(); this.pressed.clear(); }
    this.stepCamera(dt);
    players.forEach((P, i) => this.stepPlayer(dt, inputs[i], P, presses[i]));
    this.stepCats(dt);
    this.stepNpcs(dt);
    this.stepCollect(dt);
    if (this.levelLogic) this.levelLogic.step(dt);
    this.stepParticles(dt);
    this.stepEnd(dt);
    this.pressed.clear();
    if (this.coop) this.coopAfterStep();
  }

  // -------------------------------------------------------------------------
  // Aventure à deux : le navigateur qui a créé la partie fait tourner le jeu ;
  // l'autre envoie ses commandes et affiche l'état reçu.
  // -------------------------------------------------------------------------
  /** Invité : il joue le chien que l'hôte lui laisse. */
  initCoop() {
    const { link, role } = this.coop;
    this.localBanner = this.banner.bind(this);
    this.coopBadge(role, `<b>À deux</b> · tu es <span>${role === 'ainu' ? 'Ainu' : 'Matcha'}</span>`);
    link.onmessage = (m) => this.onCoopMessage(m);
    link.onclose = () => this.onCoopClose();
    this.roleHelp(role, 900);
    this.lastSent = { mx: 0, mz: 0, h: false, at: 0 };
    this.hpKey = '';
    this.setSeparated(true);
    link.send({ t: 'ready' }); // l'hôte renvoie alors toute la progression
  }

  coopBadge(role, html) {
    const root = this.dom.root;
    root.classList.remove('coop', 'role-ainu', 'role-matcha');
    if (role) root.classList.add('coop', 'role-' + role);
    let badge = this.dom.coopBadge;
    if (!badge) {
      badge = this.dom.coopBadge = document.createElement('div');
      badge.className = 'adv-coop';
      root.querySelector('.adv-party-info').appendChild(badge);
    }
    badge.innerHTML = html;
  }

  roleHelp(role, delay) {
    const name = role === 'ainu' ? 'Ainu' : 'Matcha';
    const help = role === 'ainu'
      ? 'Matcha est descendu de ton dos : chacun se promène avec son chien !'
      : 'Tu cours tout seul : saute, fais des saltos et attaque les chats !';
    setTimeout(() => { if (!this.disposed && this.coop) this.localBanner(`Tu joues ${name} !`, help, 4200); }, delay);
  }

  /** Hôte : joue seul avec les deux chiens tant que personne n'a rejoint. */
  initHostSession() {
    const ses = this.hostSession;
    ses.level = L.ID;
    this.localBanner = this.banner.bind(this);
    // les effets (sons, particules, bandeaux) sont rejoués chez l'autre joueur
    this.coopEvents = [];
    this.coopTick = 0;
    for (const n of ['sound', 'burst', 'banner', 'fade']) {
      const f = this[n].bind(this);
      this[n] = (...a) => { if (this.coop) this.coopEvents.push([n, ...a]); return f(...a); };
    }
    ses.detach();
    ses.onJoin = (link) => this.guestJoined(link);
    this.showWaiting();
    if (ses.link && !ses.link.closed) this.guestJoined(ses.link);
    if (this.hasProgress()) this.showOverlay('continue');
    else this.beginLevel(true);
  }

  showWaiting() {
    this.coopBadge(null, `<b>Code ${this.hostSession.code}</b> · en attente d'un ami…`);
  }

  guestJoined(link) {
    if (this.disposed) return;
    const role = this.hostSession.role;
    this.coop = { link, role, isHost: true };
    this.setSeparated(true);
    this.lastSaveSent = undefined; // renvoie toute la progression au nouveau venu
    this.coopEvents.length = 0;
    this.remote = { mx: 0, mz: 0, h: false };
    this.remotePressed.clear();
    link.onmessage = (m) => this.onCoopMessage(m);
    link.onclose = () => this.onCoopClose();
    this.coopBadge(role, `<b>À deux</b> · tu es <span>${role === 'ainu' ? 'Ainu' : 'Matcha'}</span>`);
    if (!this.dom.overlay.classList.contains('hidden')) this.paused = false;
    const other = role === 'ainu' ? 'Matcha' : 'Ainu';
    this.localBanner('Un ami vous rejoint !', `Il joue ${other}.`, 2600);
    this.roleHelp(role, 2800);
    if (this.sfx && this.sfx.ok) this.sound('reveal');
  }

  coopAfterStep() {
    if (this.guest || (this.coopTick = (this.coopTick + 1) % 3) !== 0) return;
    const r = (v) => Math.round(v * 100) / 100;
    const pp = this.puppy, d = this.dialog;
    const pack = (P) => [r(P.pos.x), r(P.pos.y), r(P.pos.z), r(P.vel.x), r(P.vel.y), r(P.vel.z), r(P.yaw), (P.grounded ? 1 : 0) | (P.gliding ? 2 : 0),
      r(P.attackT), r(P.dashT), r(P.flipT), r(P.cheerT), r(P.invuln), P.hearts];
    const other = this.coop.role === 'ainu' ? this.player2 : this.player;   // le chien de l'ami
    const snap = {
      t: 's', time: r(this.t),
      p: pack(this.player), p2: this.player2.active ? pack(this.player2) : 0,
      c: this.cats.map(c => (c.dead ? 0 : [r(c.pos.x), r(c.pos.y), r(c.pos.z), r(c.yaw), r(c.phase), c.chasing ? 1 : 0])),
      pp: [pp.state, r(pp.pos.x), r(pp.pos.y), r(pp.pos.z), r(pp.yaw), r(pp.phase)],
      hp: this.hearts.filter(h => !h.taken).map(h => [r(h.x), r(h.y), r(h.z)]),
      d: d ? [d.lines[d.i].who, d.lines[d.i].text, Math.floor(d.chars)] : 0,
      n: other.active && other.nearby ? (other.nearby.kind === 'sign' ? 'LIRE' : 'PARLER') : '',
      ev: this.coopEvents.splice(0),
    };
    if (this.levelLogic) snap.x = this.levelLogic.snapshot();
    const sv = JSON.stringify(Object.assign({}, this.save, { time: 0 }));
    if (sv !== this.lastSaveSent) { snap.sv = this.save; this.lastSaveSent = sv; }
    this.coop.link.send(snap);
  }

  onCoopMessage(m) {
    if (!this.guest && m.t === 'ready') { this.lastSaveSent = undefined; this.coop.link.send({ t: 'level', id: L.ID }); }
    else if (this.guest && m.t === 'level' && m.id !== L.ID) this.guestSwitch(m.id);
    else if (!this.guest && m.t === 'in') {
      const l = Math.hypot(m.mx, m.mz) || 1;
      this.remote.mx = l > 1 ? m.mx / l : m.mx; this.remote.mz = l > 1 ? m.mz / l : m.mz;
      this.remote.h = !!m.h;
      for (const a of m.p || []) if (['jump', 'attack', 'dash', 'talk'].includes(a)) this.remotePressed.add(a);
    } else if (this.guest && m.t === 's') this.applySnapshot(m);
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
    if (this.disposed) return;
    if (this.guest) { this.showOverlay('lost'); return; }
    // L'hôte continue seul avec les deux chiens ; l'ami peut revenir avec le code
    this.coop = null;
    this.setSeparated(false);
    this.showWaiting();
    this.localBanner('Ton ami est parti', `Il peut revenir avec le code ${this.hostSession.code}.`, 3200);
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
      const follow = (P, q) => {
        const tgt = new THREE.Vector3(q[0] + q[3] * age, q[1] + (q[7] & 1 ? 0 : q[4] * age), q[2] + q[5] * age);
        if (P.pos.distanceTo(tgt) > 4) P.pos.copy(tgt); else P.pos.lerp(tgt, k);
        P.yaw = lerpAngle(P.yaw, q[6], k);
      };
      follow(this.player, s.p);
      if (s.p2 && this.player2.active) follow(this.player2, s.p2);
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
    this.setSeparated(!!s.p2);
    const hp0 = this.me.hearts;
    const take = (P, q) => {
      P.vel.set(q[3], q[4], q[5]);
      P.grounded = !!(q[7] & 1); P.gliding = !!(q[7] & 2);
      if (q[10] > P.flipT + 0.1 || q[10] === 0) P.flipT = q[10];
      P.attackT = q[8]; P.dashT = q[9]; P.cheerT = q[11]; P.invuln = q[12]; P.hearts = q[13];
    };
    take(this.player, s.p);
    if (s.p2) take(this.player2, s.p2);
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
      if (s.d[2] > before && s.d[2] < s.d[1].length) this.voice(s.d[0]);
    } else if (this.dialog) { this.dialog = null; dl.classList.add('hidden'); }
    // bouton « parler »
    this.nearby = s.n ? { kind: s.n } : null;
    this.dom.talkBtn.classList.toggle('hidden', !s.n);
    this.dom.talkBtn.textContent = s.n;
    const prompt = this.dom.prompt;
    if (s.n && !this.isTouch) { prompt.textContent = `F : ${s.n.toLowerCase()}`; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
    if (s.x && this.levelLogic) this.levelLogic.apply(s.x);
    // effets
    for (const [n, ...a] of s.ev) {
      if (n === 'overlay') this.showOverlay(a[0]);
      else if (['sound', 'burst', 'banner', 'fade'].includes(n)) this[n](...a);
    }
  }

  applySave(sv) {
    this.save = Object.assign(this.emptySave(), sv);
    const s = this.save;
    this.boneTaken = new Set(s.bones);
    for (const b of this.balls) { b.taken = s.balls.includes(b.def.id); b.mesh.visible = !b.taken; }
    this.pedestalBalls.forEach((b, i) => { b.visible = i < s.balls.length; });
    for (const c of this.crates) { c.broken = s.crates.includes(c.def.id); c.mesh.visible = !c.broken; }
    for (const m of this.medals) m.taken = s.medals.includes(m.def.id);
    this.updateMedalVisibility();
    if (this.levelLogic && this.levelLogic.applySave) this.levelLogic.applySave();
    this.updateHud();
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
  pushOut(p, y) {
    const r = PLAYER_R;
    const solids = [];
    for (const c of L.colliders) if ((SOLID.has(c.kind) || c.solid) && !c.off) solids.push(c);
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
    const ap = pr, mp = pr;
    // Direction souhaitée, relative à la caméra (ou déjà dans le monde, à deux)
    const [wx, wz] = input.wx !== undefined ? [input.wx, input.wz] : this.worldMove(input.x, input.y);
    const wlen = Math.hypot(wx, wz);

    P.invuln = Math.max(0, P.invuln - dt);
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.flipT = Math.max(0, P.flipT - dt);
    P.cheerT = Math.max(0, P.cheerT - dt);
    if (P.grounded) { P.coyote = 0.12; P.jumps = 0; P.airDash = false; } else P.coyote -= dt;

    // Actions
    if (!this.dialog && this.freeze <= 0) {
      if (pr.has('talk') && P.nearby) { this.interact(P.nearby); pr.delete('talk'); }
      const onGround = P.coyote > 0 && P.jumps === 0;
      if (ap.has('jump') && onGround) {
        P.vel.y = JUMP_V; P.jumps = 1; P.grounded = false; P.coyote = 0;
        this.sound('jump');
        this.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 6, 0xf0e0c0, 2.5, 0.35);
      } else if (mp.has('jump') && !onGround) {
        if (P.jumps < 2) {
          P.vel.y = DOUBLE_JUMP_V; P.jumps = 2; P.flipT = 0.45;
          this.sound('double');
          this.burst(P.pos.x, P.pos.y + 0.5, P.pos.z, 10, 0x8bc34a, 3, 0.4);
        }
      }
      if (mp.has('attack') && P.attackT <= 0) {
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
      if (P.kind === 'ainu' && input.jumpHeld && P.vel.y < 0 && P.dashT <= 0 && (P.jumps >= 1 || P.coyote < -0.25)) {
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
    // Champignons rebondissants
    if (P.grounded && P.onCol && P.onCol.bounce) {
      P.vel.y = P.onCol.bounce; P.grounded = false; P.jumps = 1; P.coyote = 0;
      P.onCol.squashT = this.t;
      this.sound('boing');
      this.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 8, 0xffe0f0, 3, 0.4);
    }

    // Point sûr pour réapparaître
    if (P.grounded && sup.y > 0.4 && !(sup.collider && sup.collider.moving) && this.t - P.lastSafeT > 0.4) {
      P.lastSafe.copy(P.pos); P.lastSafeT = this.t;
    }
    // Plouf !
    if (P.pos.y < L.WATER_Y - 0.9) {
      this.burst(P.pos.x, L.WATER_Y + 0.2, P.pos.z, 16, 0x9ae0ff, 4, 0.6);
      this.sound('splash');
      P.pos.copy(P.lastSafe); P.vel.set(0, 0, 0); P.invuln = 1; P.dashT = 0;
      if (P === this.player && this.puppy.state === 'follow') this.puppy.pos.copy(P.pos).add(new THREE.Vector3(1, 0, 1));
      this.banner('Plouf !', `${P.kind === 'ainu' ? 'Ainu' : 'Matcha'} n'aime pas l'eau…`, 1400);
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
    if (P.invuln > 0) return;
    P.hearts--;
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
      if (solo) { this.freeze = 1.4; this.fade(true); }
      setTimeout(() => {
        if (this.disposed) return;
        P.ko = false;
        P.hearts = MAX_HEARTS;
        const sp = (this.levelLogic && this.levelLogic.respawn(P)) || L.START;
        P.pos.set(sp.x + (P.kind === 'matcha' ? 1.2 : 0), sp.y, sp.z); P.vel.set(0, 0, 0); P.invuln = 2;
        if (P === this.me) this.camYaw = (sp.yaw === undefined ? Math.PI : sp.yaw) + Math.PI;
        if (P === this.player && this.puppy.state === 'follow') this.puppy.pos.copy(P.pos);
        this.updateHud();
        if (solo) this.fade(false);
        this.banner('Ouille !', solo ? 'On repart du début, avec tous tes trésors.' : `${P.kind === 'ainu' ? 'Ainu' : 'Matcha'} repart du début.`, 2400);
      }, 700);
    }
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
    if (this.t - this.lastCamManual > 1.5 && speed > 2 && !this.dialog) {
      this.camYaw = lerpAngle(this.camYaw, P.yaw + Math.PI, Math.min(1, dt * 0.9 * (speed / RUN_SPEED)));
    }
  }

  // -------------------------------------------------------------------------
  // Chats bandits
  // -------------------------------------------------------------------------
  stepCats(dt) {
    for (const c of this.cats) {
      if (c.dead) { c.shadow.visible = false; continue; }
      const P = this.nearestPlayer(c.pos);
      c.t -= dt;
      c.stun = Math.max(0, c.stun - dt);
      const toP = new THREE.Vector3(P.pos.x - c.pos.x, 0, P.pos.z - c.pos.z);
      const dist = toP.length();
      let speed = 0, dir = null;
      const fromHome = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);
      if (c.stun <= 0 && dist < 9 && Math.abs(P.pos.y - c.pos.y) < 3 && fromHome < 15 && !this.dialog) {
        dir = toP.normalize(); speed = 3.6;
        // petit miaulement aigu quand un chat repère le duo
        if (!c.chasing && this.t - (c.lastMeow || -9) > 4) { c.lastMeow = this.t; this.sound('meowHi'); }
        c.chasing = true;
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
      if (dir) {
        const nx = c.pos.x + dir.x * speed * dt, nz = c.pos.z + dir.z * speed * dt;
        const h = L.heightAt(nx, nz);
        if (h > 0.5 && Math.abs(h - c.pos.y) < 0.8) { c.pos.x = nx; c.pos.z = nz; c.pos.y = h; }
        c.yaw = lerpAngle(c.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 8));
        c.phase += dt * speed * 3;
      }
      // Contact avec le duo
      const dy = P.pos.y - c.pos.y;
      if (dist < 1.25 && dy > -1 && dy < 1.6) {
        if (P.attackT > 0 || P.dashT > 0) this.defeatCat(c);
        else if (P.vel.y < -1 && dy > 0.5) { this.defeatCat(c); P.vel.y = 11; P.jumps = 1; }
        else this.hurtPlayer(c.pos, P);
      }
    }
  }

  defeatCat(c) {
    if (c.dead) return;
    c.dead = true;
    c.mesh.visible = false;
    this.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 18, 0xffffff, 4, 0.6);
    this.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 8, 0x8a8a9a, 3, 0.5);
    this.sound('poof');
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
    cr.mesh.visible = false;
    this.save.crates.push(cr.def.id);
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
    L.signs.forEach((s, i) => cand.push({ kind: 'sign', i, x: s.x, z: s.z, y: L.heightAt(s.x, s.z) }));
    for (const Q of this.players) {
      let n = null, best = 3.4;
      for (const c of cand) {
        const d = Math.hypot(c.x - Q.pos.x, c.z - Q.pos.z);
        if (d < best && Math.abs(c.y - Q.pos.y) < 3) { best = d; n = c; }
      }
      Q.nearby = this.dialog ? null : n;
    }
    const near = this.me.nearby;
    this.nearby = near;
    const label = near ? (near.kind === 'sign' ? 'LIRE' : 'PARLER') : '';
    this.dom.talkBtn.classList.toggle('hidden', !this.nearby);
    this.dom.talkBtn.textContent = label;
    const prompt = this.dom.prompt;
    if (this.nearby && !this.isTouch) { prompt.textContent = `F : ${label.toLowerCase()}`; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
  }

  interact(n) {
    if (n.kind === 'mamie') this.talkMamie();
    else if (n.kind === 'puppy') this.talkPuppy();
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
    this.dialog = { lines, i: 0, chars: 0, onDone };
    this.dom.dialog.classList.remove('hidden');
    this.renderDialog();
  }

  renderDialog() {
    const d = this.dialog;
    const l = d.lines[d.i];
    this.dom.dname.textContent = l.who;
    this.dom.dtext.textContent = l.text.slice(0, Math.floor(d.chars));
    this.dom.dialog.classList.toggle('done', d.chars >= l.text.length);
  }

  stepDialog(dt) {
    const d = this.dialog;
    const l = d.lines[d.i];
    const before = Math.floor(d.chars);
    if (d.chars < l.text.length) d.chars = Math.min(l.text.length, d.chars + dt * 45);
    const after = Math.floor(d.chars);
    if (after !== before && after % 3 === 0 && l.text[after - 1] !== ' ') this.voice(l.who);
    const adv = this.pressed.has('talk') || this.pressed.has('jump') || this.pressed.has('attack');
    if (adv) {
      if (d.chars < l.text.length) d.chars = l.text.length;
      else if (d.i < d.lines.length - 1) { d.i++; d.chars = 0; }
      else {
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
    // Os
    for (let i = 0; i < L.bones.length; i++) {
      const b = L.bones[i];
      if (this.boneTaken.has(b.id)) continue;
      if ((b.x - px) ** 2 + (b.y - py) ** 2 + (b.z - pz) ** 2 < 1.6 * 1.6) {
        this.boneTaken.add(b.id); s.bones.push(b.id);
        this.burst(b.x, b.y, b.z, 6, 0xffe070, 2.5, 0.35);
        this.sound('bone', s.bones.length);
        if (s.bones.length % 20 === 0) {
          if (P.hearts < MAX_HEARTS) P.hearts++;
          this.banner(`${s.bones.length} ${L.COLLECT_NAME || 'os dorés'} !`, P.hearts === MAX_HEARTS ? 'Les cœurs sont pleins' : '+1 cœur', 1500);
        }
        if (s.bones.length === L.bones.length) this.banner(`TOUS LES ${(L.COLLECT_NAME || 'os dorés').toUpperCase()} !`, 'Bravo, chasseurs de trésor !', 3000);
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
    m.taken = true; m.mesh.visible = false;
    s.medals.push(m.def.id);
    this.persist(); this.updateHud();
    this.burst(m.def.x, m.def.y, m.def.z, 30, 0xffd34d, 5, 0.9);
    this.burst(m.def.x, m.def.y, m.def.z, 14, 0xffffff, 4, 0.7);
    for (const Q of this.players) Q.cheerT = 1.4;
    this.freeze = 1.4;
    this.sound('win');
    this.banner('MÉDAILLE PATOUNE !', `${m.def.label} — ${s.medals.length}/5`, 2800);
    if (s.medals.length >= 5 && !s.done) this.endTimer = 1.7;
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
      { who: 'Ainu', text: 'Ouaf ! On la rattrapera, promis !' },
      { who: 'Mamie Labrador', text: '(À suivre dans le niveau 2 !)' },
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
    const s = this.sfx;
    if (!s || !s.ok) return;
    switch (name) {
      case 'jump': s.tone(300, 0.12, { type: 'triangle', to: 620, vol: 0.12 }); break;
      case 'double': s.tone(520, 0.14, { type: 'square', to: 1040, vol: 0.08 }); s.bark('matcha'); break;
      case 'spin': s.swing(true); break;
      case 'dash': s.noise(0.2, { filter: 'bandpass', freq: 800, freqTo: 2400, vol: 0.2 }); break;
      case 'bone': s.tone(900 + ((n || 0) % 8) * 70, 0.07, { type: 'square', vol: 0.07 }); s.tone(1400 + ((n || 0) % 8) * 70, 0.06, { type: 'square', vol: 0.05, delay: 0.05 }); break;
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
      case 'reveal': [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); break;
    }
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  render(dt) {
    const P = this.player;
    const t = this.t;
    // Duo
    const duo = P.mesh, u = duo.userData;
    duo.position.copy(P.pos);
    let yaw = P.yaw;
    if (P.attackT > 0) yaw += (1 - P.attackT / ATTACK_TIME) * Math.PI * 4;
    duo.rotation.y = yaw;
    const speed = Math.hypot(P.vel.x, P.vel.z);
    P.phase += dt * speed * 1.7;
    const run = Math.min(1, speed / 5);
    u.legs.forEach((l, i) => {
      if (P.grounded) l.rotation.x = Math.sin(P.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.8 * run;
      else l.rotation.x = i < 2 ? -0.7 : 0.7;
    });
    u.ainu.position.y = P.grounded ? Math.abs(Math.sin(P.phase)) * 0.08 * run : 0;
    u.ainu.rotation.x = P.dashT > 0 ? 0.18 : P.grounded ? 0 : clamp(-P.vel.y * 0.02, -0.25, 0.3);
    u.tail.rotation.set(P.gliding ? -1.2 : 0, P.gliding ? t * 28 : Math.sin(t * (speed > 1 ? 14 : 7)) * 0.45, 0);
    u.tail.position.y = u.tailY0 + (P.gliding ? 0.3 : 0);
    u.matcha.rotation.x = P.flipT > 0 ? (1 - P.flipT / 0.45) * Math.PI * 2 : (P.dashT > 0 ? 0.4 : 0);
    u.matcha.position.y = u.matchaY0 + (P.grounded ? Math.abs(Math.sin(P.phase + 0.6)) * 0.06 * run : 0.05) + (P.flipT > 0 ? Math.sin((1 - P.flipT / 0.45) * Math.PI) * 0.8 : 0);
    u.head.rotation.x = Math.sin(t * 2) * 0.05;
    if (P.cheerT > 0) { u.ainu.position.y = Math.abs(Math.sin(P.cheerT * 9)) * 0.5; u.matcha.rotation.z = Math.sin(P.cheerT * 12) * 0.3; } else u.matcha.rotation.z = 0;
    duo.visible = !(P.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    this.placeShadow(this.shadow, P.pos, 0.8);
    if (this.player2.active) this.renderMatcha(this.player2, dt, t);

    // Os (rotation)
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4());
    const q = this.q || (this.q = new THREE.Quaternion());
    const e = this.e || (this.e = new THREE.Euler());
    const v = this.v || (this.v = new THREE.Vector3());
    const one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < L.bones.length; i++) {
      const b = L.bones[i];
      const taken = this.boneTaken.has(b.id);
      q.setFromEuler(e.set(0, t * 2.5 + i * 0.4, 0.35));
      m4.compose(v.set(b.x, b.y + Math.sin(t * 3 + i) * 0.12, b.z), q, taken ? zero : one);
      this.bonesI.setMatrixAt(i, m4);
    }
    this.bonesI.instanceMatrix.needsUpdate = true;

    for (const m of this.medals) if (m.mesh.visible) { m.mesh.rotation.y = t * 2; m.mesh.position.y = m.def.y + Math.sin(t * 2.5) * 0.2; }
    for (const b of this.balls) if (b.mesh.visible) { b.mesh.rotation.y = t * 3; b.mesh.position.y = b.def.y + Math.abs(Math.sin(t * 4)) * 0.3; }
    for (const h of this.hearts) if (!h.taken) { h.mesh.rotation.y = t * 3; h.mesh.position.y = h.y + Math.sin(t * 4) * 0.15; }

    // Chats
    for (const c of this.cats) {
      if (c.dead) continue;
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.y = c.yaw;
      const cu = c.mesh.userData;
      cu.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.phase + (i % 3 ? Math.PI : 0)) * 0.7; });
      cu.tail.rotation.x = -0.3 + Math.sin(t * 5 + c.home.x) * 0.25;
      cu.head.rotation.z = c.chasing ? Math.sin(t * 20) * 0.08 : 0;
      this.placeShadow(c.shadow, c.pos, 0.6);
    }

    // Personnages
    const mu = this.mamie.userData;
    mu.tail.rotation.y = Math.sin(t * 6) * 0.5;
    mu.head.rotation.z = Math.sin(t * 1.3) * 0.08;
    this.mamie.rotation.y = lerpAngle(this.mamie.rotation.y, Math.atan2(P.pos.x - L.npcs.mamie.x, P.pos.z - L.npcs.mamie.z), 0.05);
    const pp = this.puppy, pu = pp.mesh.userData;
    pp.mesh.position.copy(pp.pos);
    pp.mesh.rotation.y = pp.yaw;
    pu.tail.rotation.y = Math.sin(t * (pp.state === 'lost' ? 3 : 16)) * 0.6;
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
    this.water.material.uniforms.uTime.value = t;
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
    if (!this.lite) {
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

    // Caméra
    const ME = this.me;
    const target = v.set(ME.pos.x, ME.pos.y + (ME.kind === 'matcha' ? 1.2 : 1.6), ME.pos.z);
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
      for (const c of L.colliders) {
        if (c.type !== 'cyl' || !CAM_BLOCK.has(c.kind)) continue;
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

    if ((this.mapT = (this.mapT || 0) + 1) % 4 === 0) this.drawMinimap();
    this.renderer.render(this.scene, this.camera);
  }

  /** Matcha qui court tout seul (à deux) : petits bonds, saltos, attaque tournoyante. */
  renderMatcha(Q, dt, t) {
    const m = Q.mesh, u = m.userData;
    m.position.copy(Q.pos);
    let yaw = Q.yaw;
    if (Q.attackT > 0) yaw += (1 - Q.attackT / ATTACK_TIME) * Math.PI * 4;
    m.rotation.y = yaw;
    const speed = Math.hypot(Q.vel.x, Q.vel.z);
    Q.phase += dt * speed * 2.4;
    const run = Math.min(1, speed / 5);
    u.matcha.position.y = u.matchaY0 + (Q.grounded ? Math.abs(Math.sin(Q.phase)) * 0.25 * run : 0);
    u.matcha.rotation.x = Q.flipT > 0 ? (1 - Q.flipT / 0.45) * Math.PI * 2 : Q.dashT > 0 ? 0.45 : Q.grounded ? Math.sin(Q.phase * 2) * 0.1 * run : clamp(-Q.vel.y * 0.02, -0.25, 0.3);
    u.mhead.rotation.x = Math.sin(t * 2.3) * 0.06;
    if (Q.cheerT > 0) { u.matcha.position.y += Math.abs(Math.sin(Q.cheerT * 9)) * 0.45; u.matcha.rotation.z = Math.sin(Q.cheerT * 12) * 0.3; } else u.matcha.rotation.z = 0;
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

  showOverlay(kind) {
    const o = this.dom.overlay;
    const s = this.save;
    const time = Math.floor(s.time);
    const fmt = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    let html = '';
    if (kind === 'pause') {
      html = `<h2>Pause</h2>
        <div class="adv-stats">Médailles ${s.medals.length}/5 · Os ${s.bones.length}/100</div>
        ${this.hostSession ? `<div class="adv-stats">Code pour jouer à deux : <b class="adv-code">${this.hostSession.code}</b></div>` : ''}
        <button class="btn primary" data-a="resume">Reprendre</button>
        ${this.coop ? '' : '<button class="btn" data-a="restart">Recommencer le niveau</button>'}
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'continue') {
      html = `<h2>${L.NAME}</h2>
        <div class="adv-stats">Médailles ${s.medals.length}/5 · Os ${s.bones.length}/100</div>
        <button class="btn primary" data-a="resume-save">Continuer l'aventure</button>
        <button class="btn" data-a="new">Nouvelle partie</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'confirm') {
      html = `<h2>Tout recommencer ?</h2>
        <div class="adv-stats">Les médailles et les os ramassés seront perdus.</div>
        <button class="btn primary" data-a="new">Oui, recommencer</button>
        <button class="btn ghost" data-a="back-pause">Non</button>`;
    } else if (kind === 'lost') {
      html = `<h2>Connexion perdue</h2>
        <div class="adv-stats">L'autre joueur a quitté la partie.</div>
        <button class="btn primary" data-a="lost">Menu principal</button>`;
    } else if (kind === 'complete') {
      html = `<h2>Niveau ${L.ID} terminé !</h2>
        <div class="adv-medals">${('<img src="' + ICONS.medal + '" alt="">').repeat(5)}</div>
        <div class="adv-stats">Os dorés ${s.bones.length}/100 · Temps ${fmt}</div>
        ${L.ID === 1 && !this.guest ? '<button class="btn primary" data-a="next">Niveau 2 : la Forêt des Moustaches →</button>' : ''}
        <button class="btn ${L.ID === 1 && !this.guest ? '' : 'primary'}" data-a="resume">Continuer à explorer</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    }
    o.innerHTML = `<div class="adv-panel">${html}</div>`;
    o.dataset.kind = kind;
    o.classList.remove('hidden');
    this.dom.banner.classList.add('hidden');
    this.paused = !this.coop;
    o.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => this.overlayAction(b.dataset.a)));
  }

  hideOverlay() {
    this.dom.overlay.classList.add('hidden');
    this.dom.overlay.dataset.kind = '';
    this.paused = false;
    this.lastFrame = performance.now();
  }

  overlayAction(a) {
    if (this.sfx) { this.sfx.unlock(); this.sfx.click(); }
    switch (a) {
      case 'resume': this.hideOverlay(); break;
      case 'resume-save': this.hideOverlay(); this.beginLevel(false); break;
      case 'restart': this.showOverlay('confirm'); break;
      case 'back-pause': this.showOverlay('pause'); break;
      case 'new':
        try { localStorage.removeItem(L.SAVE_KEY); } catch (e) { /* ignore */ }
        if (this.coop) { this.coop.link.onclose = null; this.coop = null; }
        this.dispose(true);
        start({ sfx: this.sfx, onExit: this.onExit, coopHost: this.hostSession, level: L.ID });
        break;
      case 'next': this.switchLevel(2); break;
      case 'quit': this.dispose(); this.onExit(); break;
      case 'lost': this.dispose(); this.onExit(); break;
    }
  }

  /** Passe à un autre niveau (l'ami connecté suit). */
  switchLevel(id) {
    if (this.coop) { this.coop.link.onclose = null; this.coop = null; }
    this.dispose(true);
    start({ sfx: this.sfx, onExit: this.onExit, coopHost: this.hostSession, level: id });
  }

  beginLevel(fresh) {
    this.camInit = false;
    if (fresh || !this.save.intro) {
      // Mamie accueille le duo
      this.freeze = 0.6;
      setTimeout(() => { if (!this.disposed && !this.dialog) this.talkMamie(true); }, 700);
    } else {
      this.banner(L.NAME, `Médailles ${this.save.medals.length}/5`, 2200);
    }
  }

  dispose(keepSession) {
    this.disposed = true;
    if (this.coop) { this.coop.link.onclose = null; this.coop.link.close(); }
    if (this.hostSession && !keepSession) { this.hostSession.onJoin = null; this.hostSession.close(); }
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.bannerTimer);
    this.renderer.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.dom.root.remove();
    if (window.__adv === this) window.__adv = null;
  }
}
