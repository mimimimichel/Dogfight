/*
 * Dogfight Aventure — moteur du mode aventure 3D (niveau 1).
 *
 * Plates-formes 3D façon « collect-a-thon » : le duo Ainu + Matcha explore
 * l'île, ramasse 100 os dorés et récupère 5 Médailles Patounes.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as L from './level1.js';
import * as M from './models.js';

const SAVE_KEY = 'dogfight.aventure.niveau1';
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
const MAX_HEARTS = 3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

// ---------------------------------------------------------------------------
// Icônes pixel pour l'interface
// ---------------------------------------------------------------------------
function pixelIcon(rows, palette) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (palette[ch]) { x.fillStyle = palette[ch]; x.fillRect(i, j, 1, 1); } }));
  return c.toDataURL();
}
const ICONS = {
  bone: pixelIcon(['..o.....o..', '.oyo...oyo.', '.oyyoooyyo.', '..oyyyyyo..', '.oyyoooyyo.', '.oyo...oyo.', '..o.....o..'].map(r => r), { o: '#6a3a00', y: '#ffd34d' }),
  medal: pixelIcon(['..ooooo..', '.oyyyyyo.', 'oyybybyyo', 'oyyyyyyyo', 'oyybbbyyo', 'oyybbbyyo', '.oyyyyyo.', '..ooooo..'], { o: '#6a3a00', y: '#ffd34d', b: '#a06a10' }),
  heart: pixelIcon(['.oo.oo.', 'orroRro', 'orrrrro', '.orrro.', '..oro..', '...o...'], { o: '#3a0a10', r: '#e8303a', R: '#ff9aa0' }),
  heartEmpty: pixelIcon(['.oo.oo.', 'o..o..o', 'o.....o', '.o...o.', '..o.o..', '...o...'], { o: '#3a0a10', '.': 'rgba(0,0,0,0.35)' }),
  ball: pixelIcon(['.ooo.', 'oyyyo', 'owyyo', 'oyywo', '.ooo.'], { o: '#4a5a00', y: '#d8f040', w: '#ffffff' }),
};

// ---------------------------------------------------------------------------
export function start(opts) { return new Adventure(opts || {}); }

class Adventure {
  constructor(opts) {
    this.sfx = opts.sfx || null;
    this.onExit = opts.onExit || (() => {});
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
    this.bindInput();
    this.resize();
    this.updateHud();

    window.__adv = this; // accès pour les tests
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));

    if (this.hasProgress()) this.showOverlay('continue');
    else this.beginLevel(true);
  }

  // -------------------------------------------------------------------------
  // Sauvegarde
  // -------------------------------------------------------------------------
  emptySave() { return { bones: [], medals: [], balls: [], crates: [], cats: [], puppy: 'lost', intro: false, done: false, time: 0 }; }
  loadSave() {
    this.save = this.emptySave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s) Object.assign(this.save, s);
    } catch (e) { /* ignore */ }
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }
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
        <div class="adv-hearts"></div>
        <div class="adv-counts">
          <div class="adv-count"><img src="${ICONS.bone}" alt=""><span id="adv-bones">0</span><small>/100</small></div>
          <div class="adv-count"><img src="${ICONS.medal}" alt=""><span id="adv-medals">0</span><small>/5</small></div>
          <div class="adv-count adv-balls hidden"><img src="${ICONS.ball}" alt=""><span id="adv-balls">0</span><small>/5</small></div>
        </div>
      </div>
      <div class="adv-banner hidden"></div>
      <div class="adv-prompt hidden"></div>
      <div class="adv-dialog hidden"><div class="adv-dname"></div><div class="adv-dtext"></div><div class="adv-dnext">▼</div></div>
      <button class="adv-pause" aria-label="Pause">II</button>
      <div class="adv-touch ${this.isTouch ? '' : 'hidden'}">
        <div class="adv-stick-zone"></div>
        <div class="adv-cam-zone"></div>
        <div class="adv-stick"><div class="adv-knob"></div></div>
        <button class="adv-btn jump" data-btn="jump">SAUT</button>
        <button class="adv-btn attack" data-btn="attack">ATTAQUE</button>
        <button class="adv-btn dash" data-btn="dash">CHARGE</button>
        <button class="adv-btn talk hidden" data-btn="talk">PARLER</button>
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
    };
    root.querySelector('.adv-pause').addEventListener('click', () => this.togglePause());
  }

  updateHud() {
    const s = this.save;
    this.dom.bones.textContent = s.bones.length;
    this.dom.medals.textContent = s.medals.length;
    this.dom.balls.textContent = s.balls.length;
    this.dom.ballsBox.classList.toggle('hidden', !(s.balls.length > 0 && !s.medals.includes('m_balls')));
    const hp = this.player ? this.player.hearts : MAX_HEARTS;
    this.dom.hearts.innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) => `<img src="${i < hp ? ICONS.heart : ICONS.heartEmpty}" alt="">`).join('');
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
    const r = new THREE.WebGLRenderer({ canvas: this.dom.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer = r;
    this.scene = new THREE.Scene();
    // Ciel en dégradé
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 128;
    const sg = sky.getContext('2d');
    const gr = sg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#5aa8f0'); gr.addColorStop(0.6, '#a8dcff'); gr.addColorStop(1, '#fff0d0');
    sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(0xcfe8ff, 70, 175);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a8a4a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(40, 60, 25);
    this.scene.add(sun);
    this.camYaw = L.START.yaw + Math.PI;
    this.camPitch = 0.38;
    this.camDist = 9;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // Rendu en basse résolution, agrandi en pixels nets (style du jeu + fluidité sur téléphone)
    const targetH = this.isTouch ? 300 : 400;
    const ratio = Math.min(1, targetH / h);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  // Le monde
  // -------------------------------------------------------------------------
  buildWorld() {
    const sc = this.scene;
    // Terrain : facettes plates colorées selon la hauteur et la pente
    const size = 180, seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, L.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const nrm = geo.attributes.normal;
    for (let f = 0; f < pos.count; f += 3) {
      const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
      const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
      const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      const ny = nrm.getY(f);
      const n = Math.sin(cx * 0.9) * Math.cos(cz * 0.7) + Math.sin(cx * 0.31 + cz * 0.47);
      if (cy < -0.2) col.set(0xd8c088);
      else if (cy < 1.0) col.set(n > 0.4 ? 0xf4dca0 : 0xf0d494);
      else if (ny < 0.62) col.set(n > 0 ? 0xa0806a : 0x8a6e5a);
      else if (cy > 11) col.set(n > 0.3 ? 0x8ad060 : 0x78c050);
      else col.set(n > 0.8 ? 0x8ad45a : n > -0.6 ? 0x6cc04a : 0x5aac3e);
      for (let k = 0; k < 3; k++) { colors[(f + k) * 3] = col.r; colors[(f + k) * 3 + 1] = col.g; colors[(f + k) * 3 + 2] = col.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: M.gradient })));

    // Eau
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshToonMaterial({ color: 0x3ab0e8, transparent: true, opacity: 0.82, gradientMap: M.gradient }));
    water.rotation.x = -Math.PI / 2; water.position.y = L.WATER_Y;
    sc.add(water);
    this.water = water;

    // Grand Chêne
    const T = L.TREE;
    const trunk = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(T.trunkR * 0.85, T.trunkR * 1.15, T.height + 2, 10)), M.toon(0x8a5a30));
    trunk.position.set(T.x, T.base - 2 + (T.height + 2) / 2, T.z);
    sc.add(trunk);
    const branchMat = M.toon(0xa0703c);
    const leafMat = M.toon(0x5aae3a);
    for (const s of L.treeSteps) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), branchMat);
      b.position.set(s.x, s.top - 0.25, s.z);
      sc.add(b);
      const tuft = new THREE.Mesh(M.flat(new THREE.IcosahedronGeometry(0.7, 0)), leafMat);
      tuft.position.set(s.x * 1.25, s.top + 0.1, s.z * 1.25);
      sc.add(tuft);
    }
    const canopy = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(4.6, 4.2, 0.6, 14)), branchMat);
    canopy.position.set(0, L.TREE_TOP - 0.3, 0);
    sc.add(canopy);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const f = new THREE.Mesh(M.flat(new THREE.IcosahedronGeometry(2.2 + (i % 3) * 0.5, 0)), leafMat);
      f.position.set(Math.cos(a) * 6.2, L.TREE_TOP - 1.2 + (i % 2) * 0.8, Math.sin(a) * 6.2);
      sc.add(f);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const f = new THREE.Mesh(M.flat(new THREE.IcosahedronGeometry(1.8, 0)), leafMat);
      f.position.set(Math.cos(a) * 6.5, L.TREE_TOP - 7 - (i % 3) * 3, Math.sin(a) * 6.5);
      sc.add(f);
    }
    // Petit drapeau au sommet
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), M.toon(0xffffff));
    pole.position.set(-2.8, L.TREE_TOP + 1.3, -2.8); sc.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.1), M.toon(0xd03434));
    flag.position.set(-2.8, L.TREE_TOP + 2.2, -2.25); sc.add(flag);

    // Arbres (instanciés)
    const n = L.trees.length;
    const trunkI = new THREE.InstancedMesh(M.flat(new THREE.CylinderGeometry(0.4, 0.55, 5, 7)), M.toon(0x7a4a28), n);
    const leafI = new THREE.InstancedMesh(M.flat(new THREE.IcosahedronGeometry(1.9, 0)), M.toon(0xffffff), n * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3();
    const greens = [0x4caa38, 0x5ec04a, 0x3e9a34, 0x7ac852];
    L.trees.forEach((t, i) => {
      m4.compose(v.set(t.x, t.y + 2.5 * t.s, t.z), q.identity(), sv.set(t.s, t.s, t.s));
      trunkI.setMatrixAt(i, m4);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + i;
        m4.compose(v.set(t.x + Math.cos(a) * 0.9 * t.s, t.y + (5 + k * 0.7) * t.s, t.z + Math.sin(a) * 0.9 * t.s),
          q.setFromEuler(new THREE.Euler(i, k, 0)), sv.set(t.s * (1 - k * 0.15), t.s * (1 - k * 0.15), t.s * (1 - k * 0.15)));
        leafI.setMatrixAt(i * 3 + k, m4);
        leafI.setColorAt(i * 3 + k, col.set(greens[(i + k) % greens.length]));
      }
    });
    sc.add(trunkI, leafI);

    // Rochers, pierres de gué, îlot
    const rockMat = M.toon(0xa8a098);
    for (const r of L.rocks) {
      const g = L.heightAt(r.x, r.z);
      const m = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(r.r * 0.85, r.r * 1.1, r.top - g + 1, 7)), rockMat);
      m.position.set(r.x, (r.top + g - 1) / 2, r.z);
      sc.add(m);
    }
    const stoneMat = M.toon(0x9a9a92);
    for (const s of L.stones) {
      const m = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(1.15, 1.3, 4.75, 8)), stoneMat);
      m.position.set(s.x, s.top - 2.375, s.z);
      sc.add(m);
    }
    const islet = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(4.2, 4.8, 5.3, 12)), M.toon(0xe8d098));
    islet.position.set(L.SPOTS.islet.x - 1.5, 1.3 - 2.65, L.SPOTS.islet.z);
    sc.add(islet);
    const isletGrass = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 12), M.toon(0x6cc04a));
    isletGrass.position.set(L.SPOTS.islet.x - 1.5, 1.33, L.SPOTS.islet.z);
    sc.add(isletGrass);

    // Ascenseur + passerelle + cascade
    const woodMat = M.toon(0xb07a3a);
    this.elevatorMesh = new THREE.Mesh(new THREE.BoxGeometry(L.ELEVATOR.w, 0.5, L.ELEVATOR.d), woodMat);
    sc.add(this.elevatorMesh);
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, L.ELEVATOR.high - L.ELEVATOR.low + 3), M.toon(0x7a4a28));
      p.position.set(L.ELEVATOR.x + ox * 1.15, (L.ELEVATOR.high + L.ELEVATOR.low) / 2 + 1, L.ELEVATOR.z + oz * 1.15);
      sc.add(p);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(L.BRIDGE.size, 0.5, L.BRIDGE.size), woodMat);
    bridge.position.set(L.BRIDGE.x, L.BRIDGE.top - 0.25, L.BRIDGE.z);
    sc.add(bridge);
    const fallTex = this.makeWaterfallTexture();
    this.fallTex = fallTex;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 11.5), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.9 }));
    const fx = L.SPOTS.plateau.x + 10.1, fz = L.SPOTS.plateau.z + 2;
    fall.position.set(fx, L.heightAt(fx - 0.5, fz) + 5.6, fz);
    fall.rotation.y = Math.PI / 2;
    sc.add(fall);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), M.toon(0x5ac8f0));
    pool.rotation.x = -Math.PI / 2; pool.position.set(fx + 2.5, L.heightAt(fx + 2.5, fz) + 0.08, fz);
    sc.add(pool);

    // Niche de Mamie
    const kennel = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.2), M.toon(0xd0a060));
    kb.position.y = 0.8; kennel.add(kb);
    const roof = new THREE.Mesh(M.flat(new THREE.CylinderGeometry(0.01, 1.9, 1.2, 4)), M.toon(0xc83a2a));
    roof.position.y = 2.2; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.25); kennel.add(roof);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), M.toon(0x3a2010));
    door.position.set(0, 0.6, 1.11); kennel.add(door);
    kennel.position.set(L.SPOTS.mamie.x - 3, L.heightAt(L.SPOTS.mamie.x - 3, L.SPOTS.mamie.z - 1), L.SPOTS.mamie.z - 1);
    kennel.rotation.y = 0.5;
    sc.add(kennel);

    // Clôture de la clairière
    const posts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(Math.sin(a + 0.2)) < 0.15 && Math.cos(a) < 0) continue; // ouverture côté ouest
      posts.push(a);
    }
    const postI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), M.toon(0xc89a5a), posts.length);
    posts.forEach((a, i) => {
      const x = L.SPOTS.clearing.x + Math.cos(a) * 13.5, z = L.SPOTS.clearing.z + Math.sin(a) * 13.5;
      m4.compose(v.set(x, L.heightAt(x, z) + 0.45, z), q.identity(), sv.set(1, 1, 1));
      postI.setMatrixAt(i, m4);
    });
    sc.add(postI);

    // Herbe et fleurs (instanciées)
    const tufts = [], flowers = [];
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000 && tufts.length < 900; i++) {
      const x = (rnd() - 0.5) * 140, z = (rnd() - 0.5) * 140;
      const h = L.heightAt(x, z);
      if (h < 1.2) continue;
      if (rnd() < 0.18) flowers.push([x, h, z]); else tufts.push([x, h, z]);
    }
    const blade = M.mergeGeos([
      { geo: new THREE.ConeGeometry(0.08, 0.6, 3), y: 0.3, rz: 0.25 },
      { geo: new THREE.ConeGeometry(0.08, 0.5, 3), y: 0.25, x: 0.12, rz: -0.3 },
      { geo: new THREE.ConeGeometry(0.08, 0.45, 3), y: 0.22, x: -0.1, z: 0.08, rx: 0.3 },
    ]);
    const tuftI = new THREE.InstancedMesh(blade, M.toon(0x4c9e34), tufts.length);
    tufts.forEach(([x, h, z], i) => { m4.compose(v.set(x, h, z), q.setFromEuler(new THREE.Euler(0, x * 3, 0)), sv.set(1, 1, 1)); tuftI.setMatrixAt(i, m4); });
    sc.add(tuftI);
    const flowerI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), M.toon(0xffffff), flowers.length);
    const fcols = [0xffffff, 0xffe050, 0xff8ab0, 0xb08aff];
    flowers.forEach(([x, h, z], i) => { m4.compose(v.set(x, h + 0.2, z), q.identity(), sv.set(1, 1, 1)); flowerI.setMatrixAt(i, m4); flowerI.setColorAt(i, col.set(fcols[i % 4])); });
    sc.add(flowerI);

    // Nuages
    this.clouds = [];
    const cloudMat = M.toon(0xffffff);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(M.flat(new THREE.IcosahedronGeometry(3 + k, 0)), cloudMat);
        c.position.set(k * 3.5 - 3.5, (k % 2) * 1.2, 0); c.scale.y = 0.6; g.add(c);
      }
      const a = (i / 9) * Math.PI * 2;
      g.position.set(Math.cos(a) * 90, 42 + (i % 3) * 8, Math.sin(a) * 90);
      sc.add(g);
      this.clouds.push(g);
    }

    // Panneaux
    for (const s of L.signs) {
      const m = M.buildSign(s.text);
      m.position.set(s.x, L.heightAt(s.x, s.z), s.z);
      m.rotation.y = Math.atan2(L.START.x - s.x, L.START.z - s.z) * 0.3;
      sc.add(m);
    }

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
    const c = document.createElement('canvas'); c.width = 16; c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#6ad0ff'; x.fillRect(0, 0, 16, 32);
    x.fillStyle = '#c8f0ff';
    for (let i = 0; i < 14; i++) x.fillRect((i * 7) % 16, (i * 11) % 32, 1, 4 + (i % 3));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.repeat.set(2, 3);
    return t;
  }

  // -------------------------------------------------------------------------
  // Entités
  // -------------------------------------------------------------------------
  buildEntities() {
    const sc = this.scene;
    const s = this.save;
    // Joueur
    const duo = M.buildDuo();
    sc.add(duo);
    this.player = {
      mesh: duo, pos: new THREE.Vector3(L.START.x, L.START.y, L.START.z), vel: new THREE.Vector3(),
      yaw: L.START.yaw, grounded: true, coyote: 0, jumps: 0, gliding: false, attackT: 0, dashT: 0, dashCd: 0,
      airDash: false, invuln: 0, hearts: MAX_HEARTS, flipT: 0, phase: 0, cheerT: 0, onCol: null,
      lastSafe: new THREE.Vector3(L.START.x, L.START.y, L.START.z), lastSafeT: 0, hitIds: new Set(),
    };
    this.shadow = this.makeShadow(0.8);

    // Os dorés (instanciés)
    this.bonesI = new THREE.InstancedMesh(M.boneGeometry(), M.toon(0xffd34d, { emissive: 0x6a4800 }), L.bones.length);
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

    // Particules
    this.particles = [];
    const PMAX = 400;
    this.partI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
    this.partI.count = 0;
    this.partI.frustumCulled = false;
    this.partI.setColorAt(0, new THREE.Color(1, 1, 1));
    sc.add(this.partI);
  }

  makeShadow(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0x1a2a10, transparent: true, opacity: 0.32, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }

  makeMark(ch, color) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = '#1a0c10'; x.fillRect(4, 0, 8, 16); x.fillRect(2, 2, 12, 12);
    x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(6, 2, 4, 8); x.fillRect(6, 11, 4, 3);
    if (ch === '?') { x.fillStyle = '#1a0c10'; x.fillRect(4, 0, 8, 16); x.fillRect(2, 2, 12, 12); x.fillStyle = '#8ad0ff'; x.fillRect(5, 2, 6, 2); x.fillRect(9, 4, 2, 3); x.fillRect(7, 6, 2, 3); x.fillRect(7, 11, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(0.8, 0.8, 1);
    s.renderOrder = 10;
    this.scene.add(s);
    return s;
  }

  updateMedalVisibility() {
    const s = this.save;
    const reveal = {
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
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; }
      if (n === 5) this.acc = 0;
    }
    this.render(dt);
  }

  step(dt) {
    this.t += dt;
    if (!this.save.done) this.save.time += dt;
    const input = this.readInput();
    if (this.dialog) {
      this.stepDialog(dt);
      input.x = 0; input.y = 0;
    }
    if (this.freeze > 0) { this.freeze -= dt; input.x = 0; input.y = 0; this.pressed.clear(); }
    this.stepCamera(dt);
    this.stepPlayer(dt, input);
    this.stepCats(dt);
    this.stepNpcs(dt);
    this.stepCollect(dt);
    this.stepParticles(dt);
    this.stepEnd(dt);
    this.pressed.clear();
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
    for (const c of L.colliders) if (SOLID.has(c.kind)) solids.push(c);
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

  stepPlayer(dt, input) {
    const P = this.player;
    const pr = this.pressed;
    // Direction souhaitée, relative à la caméra
    const cy = this.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    const wx = fx * -input.y + rx * input.x, wz = fz * -input.y + rz * input.x;
    const wlen = Math.hypot(wx, wz);

    P.invuln = Math.max(0, P.invuln - dt);
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.flipT = Math.max(0, P.flipT - dt);
    P.cheerT = Math.max(0, P.cheerT - dt);
    if (P.grounded) { P.coyote = 0.12; P.jumps = 0; P.airDash = false; } else P.coyote -= dt;

    // Actions
    if (!this.dialog && this.freeze <= 0) {
      if (pr.has('talk') && this.nearby) { this.interact(this.nearby); pr.delete('talk'); }
      if (pr.has('jump')) {
        if (P.coyote > 0 && P.jumps === 0) {
          P.vel.y = JUMP_V; P.jumps = 1; P.grounded = false; P.coyote = 0;
          this.sound('jump');
          this.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 6, 0xf0e0c0, 2.5, 0.35);
        } else if (P.jumps < 2) {
          P.vel.y = DOUBLE_JUMP_V; P.jumps = 2; P.flipT = 0.45;
          this.sound('double');
          this.burst(P.pos.x, P.pos.y + 0.5, P.pos.z, 10, 0x8bc34a, 3, 0.4);
        }
      }
      if (pr.has('attack') && P.attackT <= 0) {
        P.attackT = ATTACK_TIME; P.hitIds.clear();
        if (!P.grounded) P.vel.y = Math.max(P.vel.y, 2);
        this.sound('spin');
      }
      if (pr.has('dash') && P.dashCd <= 0 && (P.grounded || !P.airDash)) {
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
      if (input.jumpHeld && P.vel.y < 0 && P.dashT <= 0 && (P.jumps >= 1 || P.coyote < -0.25)) {
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

    // Point sûr pour réapparaître
    if (P.grounded && sup.y > 0.4 && !(sup.collider && sup.collider.moving) && this.t - P.lastSafeT > 0.4) {
      P.lastSafe.copy(P.pos); P.lastSafeT = this.t;
    }
    // Plouf !
    if (P.pos.y < L.WATER_Y - 0.9) {
      this.burst(P.pos.x, L.WATER_Y + 0.2, P.pos.z, 16, 0x9ae0ff, 4, 0.6);
      this.sound('splash');
      P.pos.copy(P.lastSafe); P.vel.set(0, 0, 0); P.invuln = 1; P.dashT = 0;
      if (this.puppy.state === 'follow') this.puppy.pos.copy(P.pos).add(new THREE.Vector3(1, 0, 1));
      this.banner('Plouf !', 'Ainu n\'aime pas l\'eau…', 1400);
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

  hurtPlayer(from) {
    const P = this.player;
    if (P.invuln > 0) return;
    P.hearts--;
    P.invuln = 1.6;
    const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    P.vel.set(dx / d * 9, 7, dz / d * 9);
    P.grounded = false;
    this.sound('hurt');
    this.burst(P.pos.x, P.pos.y + 1, P.pos.z, 10, 0xff6a6a, 3.5, 0.5);
    this.updateHud();
    if (P.hearts <= 0) {
      this.freeze = 1.4;
      this.fade(true);
      setTimeout(() => {
        if (this.disposed) return;
        P.hearts = MAX_HEARTS;
        P.pos.set(L.START.x, L.START.y, L.START.z); P.vel.set(0, 0, 0); P.invuln = 2;
        this.camYaw = L.START.yaw + Math.PI;
        if (this.puppy.state === 'follow') this.puppy.pos.copy(P.pos);
        this.updateHud();
        this.fade(false);
        this.banner('Ouille !', 'On repart du début, avec tous tes trésors.', 2400);
      }, 700);
    }
  }

  // -------------------------------------------------------------------------
  // Caméra
  // -------------------------------------------------------------------------
  stepCamera(dt) {
    const P = this.player;
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
    const P = this.player;
    for (const c of this.cats) {
      if (c.dead) { c.shadow.visible = false; continue; }
      c.t -= dt;
      c.stun = Math.max(0, c.stun - dt);
      const toP = new THREE.Vector3(P.pos.x - c.pos.x, 0, P.pos.z - c.pos.z);
      const dist = toP.length();
      let speed = 0, dir = null;
      const fromHome = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);
      if (c.stun <= 0 && dist < 9 && Math.abs(P.pos.y - c.pos.y) < 3 && fromHome < 15 && !this.dialog) {
        dir = toP.normalize(); speed = 3.6;
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
        else this.hurtPlayer(c.pos);
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
    if (c.def.group === 'clearing') {
      this.save.cats.push(c.def.id);
      this.persist();
      const left = L.cats.filter(k => k.group === 'clearing' && !this.save.cats.includes(k.id)).length;
      if (left === 0) {
        this.updateMedalVisibility();
        this.banner('Les chats bandits ont fui !', 'Une Médaille Patoune est apparue dans la clairière !', 3000);
        this.sound('reveal');
      } else this.banner('Miaou… !', `Encore ${left} chat${left > 1 ? 's' : ''} bandit${left > 1 ? 's' : ''} dans la clairière`, 1600);
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

    // Interaction la plus proche
    let near = null, best = 3.4;
    const cand = [{ kind: 'mamie', x: L.npcs.mamie.x, z: L.npcs.mamie.z, y: L.npcs.mamie.y }];
    if (pp.state === 'lost') cand.push({ kind: 'puppy', x: pp.pos.x, z: pp.pos.z, y: pp.pos.y });
    L.signs.forEach((s, i) => cand.push({ kind: 'sign', i, x: s.x, z: s.z, y: L.heightAt(s.x, s.z) }));
    for (const c of cand) {
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (d < best && Math.abs(c.y - P.pos.y) < 3) { best = d; near = c; }
    }
    this.nearby = this.dialog ? null : near;
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
  stepCollect() {
    const P = this.player;
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
          this.banner(`${s.bones.length} os dorés !`, P.hearts === MAX_HEARTS ? 'Les cœurs sont pleins' : '+1 cœur', 1500);
        }
        if (s.bones.length === L.bones.length) this.banner('TOUS LES OS DORÉS !', 'Bravo, chasseurs de trésor !', 3000);
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
    this.player.cheerT = 1.4;
    this.freeze = 1.4;
    if (this.sfx) this.sfx.win();
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
    this.say([
      { who: 'Mamie Labrador', text: 'Les 5 Médailles Patounes ! Le Parc des Toutous est sauvé !' },
      { who: 'Matcha', text: 'Ces chats bandits n\'avaient aucune chance !' },
      { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache s\'est enfuie vers la Forêt des Moustaches…' },
      { who: 'Ainu', text: 'Ouaf ! On la rattrapera, promis !' },
      { who: 'Mamie Labrador', text: '(À suivre dans le niveau 2 !)' },
    ], () => { s.done = true; this.persist(); this.showOverlay('complete'); });
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
    u.tail.position.y = P.gliding ? 1.45 : 1.15;
    u.matcha.rotation.x = P.flipT > 0 ? (1 - P.flipT / 0.45) * Math.PI * 2 : (P.dashT > 0 ? 0.4 : 0);
    u.matcha.position.y = 1.38 + (P.grounded ? Math.abs(Math.sin(P.phase + 0.6)) * 0.06 * run : 0.05) + (P.flipT > 0 ? Math.sin((1 - P.flipT / 0.45) * Math.PI) * 0.8 : 0);
    u.head.rotation.x = Math.sin(t * 2) * 0.05;
    if (P.cheerT > 0) { u.ainu.position.y = Math.abs(Math.sin(P.cheerT * 9)) * 0.5; u.matcha.rotation.z = Math.sin(P.cheerT * 12) * 0.3; } else u.matcha.rotation.z = 0;
    duo.visible = !(P.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    this.placeShadow(this.shadow, P.pos, 0.8);

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
    this.elevatorMesh.position.set(L.ELEVATOR.x, L.elevatorTop(t) - 0.25, L.ELEVATOR.z);
    this.fallTex.offset.y = (t * 1.6) % 1;
    this.water.position.y = L.WATER_Y + Math.sin(t * 0.8) * 0.06;
    for (const [i, c] of this.clouds.entries()) { const a = (i / 9) * Math.PI * 2 + t * 0.01; c.position.x = Math.cos(a) * 90; c.position.z = Math.sin(a) * 90; }

    // Particules
    const pI = this.partI;
    pI.count = this.particles.length;
    this.particles.forEach((p, i) => {
      const s = p.size * Math.min(1, p.life / p.max * 2);
      m4.compose(v.set(p.x, p.y, p.z), q.identity(), new THREE.Vector3(s, s, s));
      pI.setMatrixAt(i, m4);
      pI.setColorAt(i, p.color);
    });
    pI.instanceMatrix.needsUpdate = true;
    if (pI.instanceColor) pI.instanceColor.needsUpdate = true;

    // Caméra
    const target = v.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
    this.camTarget.lerp(target, 1 - Math.exp(-dt * 10));
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const desired = new THREE.Vector3(
      this.camTarget.x + Math.sin(this.camYaw) * cp * this.camDist,
      this.camTarget.y + sp * this.camDist,
      this.camTarget.z + Math.cos(this.camYaw) * cp * this.camDist);
    const ground = Math.max(L.heightAt(desired.x, desired.z), L.WATER_Y) + 1.0;
    if (desired.y < ground) desired.y = ground;
    if (!this.camInit) { this.camPos.copy(desired); this.camTarget.copy(target); this.camInit = true; }
    this.camPos.lerp(desired, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }

  placeShadow(sh, pos, r) {
    const s = this.support(pos.x, pos.z, pos.y + 0.1);
    const h = Math.max(0, pos.y - s.y);
    sh.visible = s.y > L.WATER_Y - 0.1;
    sh.position.set(pos.x, s.y + 0.04, pos.z);
    const k = Math.max(0.35, 1 - h / 8);
    sh.scale.set(k, k, k);
    sh.material.opacity = 0.32 * k;
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
        <button class="btn primary" data-a="resume">Reprendre</button>
        <button class="btn" data-a="restart">Recommencer le niveau</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'continue') {
      html = `<h2>Le Parc des Toutous</h2>
        <div class="adv-stats">Médailles ${s.medals.length}/5 · Os ${s.bones.length}/100</div>
        <button class="btn primary" data-a="resume-save">Continuer l'aventure</button>
        <button class="btn" data-a="new">Nouvelle partie</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    } else if (kind === 'confirm') {
      html = `<h2>Tout recommencer ?</h2>
        <div class="adv-stats">Les médailles et les os ramassés seront perdus.</div>
        <button class="btn primary" data-a="new">Oui, recommencer</button>
        <button class="btn ghost" data-a="back-pause">Non</button>`;
    } else if (kind === 'complete') {
      html = `<h2>Niveau 1 terminé !</h2>
        <div class="adv-medals">${('<img src="' + ICONS.medal + '" alt="">').repeat(5)}</div>
        <div class="adv-stats">Os dorés ${s.bones.length}/100 · Temps ${fmt}</div>
        <button class="btn primary" data-a="resume">Continuer à explorer</button>
        <button class="btn ghost" data-a="quit">Menu principal</button>`;
    }
    o.innerHTML = `<div class="adv-panel">${html}</div>`;
    o.dataset.kind = kind;
    o.classList.remove('hidden');
    this.dom.banner.classList.add('hidden');
    this.paused = true;
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
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        this.dispose();
        start({ sfx: this.sfx, onExit: this.onExit });
        break;
      case 'quit': this.dispose(); this.onExit(); break;
    }
  }

  beginLevel(fresh) {
    this.camInit = false;
    if (fresh || !this.save.intro) {
      // Mamie accueille le duo
      this.freeze = 0.6;
      setTimeout(() => { if (!this.disposed && !this.dialog) this.talkMamie(true); }, 700);
    } else {
      this.banner('Le Parc des Toutous', `Médailles ${this.save.medals.length}/5`, 2200);
    }
  }

  dispose() {
    this.disposed = true;
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
