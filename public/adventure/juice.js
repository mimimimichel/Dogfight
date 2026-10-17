/*
 * Matcha & Ainu — les « sensations » (game feel) partagées par tous les niveaux.
 *
 *  - Particles : un seul système de particules pour tout le jeu, un seul appel de dessin
 *    (THREE.Points), sans allocation à chaque image (tableaux préalloués, on retire en
 *    échangeant avec le dernier). Plusieurs formes dans une petite planche de textures :
 *    halo doux (l'ancien point lumineux), étoile scintillante, confetti qui papillonne,
 *    cœur, bouffée de poussière qui gonfle.
 *  - Juice : des « recettes » prêtes à l'emploi (poussière d'atterrissage, étoiles d'un coup,
 *    confettis d'une récompense, « pop » d'un trésor ramassé, cœurs d'une caresse), le petit
 *    coup de zoom de la caméra, l'éclat doré au bord de l'écran (médaille), et les vibrations
 *    (Android seulement : iOS n'a pas navigator.vibrate ; réglable dans Réglages).
 */
import * as THREE from '../vendor/three.module.min.js';

export const KIND = { glow: 0, star: 1, confetti: 2, heart: 3, puff: 4, spark: 5 };
const CELL = [0, 1, 2, 3, 0, 1];          // case de la planche pour chaque sorte
const TAU = Math.PI * 2;
const CONFETTI = [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x8ae05a, 0xc88aff, 0xff9ad8, 0xffffff];

let atlasTex = null;
/** Planche 2×2 : halo, étoile à 4 branches, confetti arrondi, cœur (blanc, teinté au dessin). */
function atlas() {
  if (atlasTex) return atlasTex;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const x = c.getContext('2d');
  // 0 : halo (le même que l'ancien point lumineux)
  let gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  // 1 : étoile scintillante (4 branches fines + cœur brillant)
  x.save(); x.translate(S * 1.5, S / 2);
  gr = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.22);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, S * 0.22, 0, TAU); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  const R = S * 0.45, r = S * 0.075;
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, d = i % 2 ? r : R; x.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  x.closePath(); x.fill(); x.restore();
  // 2 : confetti (petit rectangle aux coins ronds, un reflet)
  x.save(); x.translate(S * 0.5, S * 1.5);
  const w = S * 0.22, h = S * 0.38, rr = 5;
  gr = x.createLinearGradient(-w, -h, w, h);           // un reflet : clair en haut, plus mat en bas
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#f2f2f2'); gr.addColorStop(1, '#b8b8b8');
  x.fillStyle = gr;
  x.beginPath(); x.moveTo(-w + rr, -h); x.lineTo(w - rr, -h); x.quadraticCurveTo(w, -h, w, -h + rr); x.lineTo(w, h - rr); x.quadraticCurveTo(w, h, w - rr, h);
  x.lineTo(-w + rr, h); x.quadraticCurveTo(-w, h, -w, h - rr); x.lineTo(-w, -h + rr); x.quadraticCurveTo(-w, -h, -w + rr, -h); x.fill();
  x.restore();
  // 3 : cœur
  x.save(); x.translate(S * 1.5, S * 1.5);
  x.fillStyle = '#fff'; x.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = i / 48 * TAU, hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    x.lineTo(hx * S * 0.024, -hy * S * 0.024 - S * 0.03);
  }
  x.fill(); x.restore();
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  // (pas de mipmaps : une forme ne doit jamais « baver » dans la case voisine)
  atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter;
  return atlasTex;
}

/** Le système de particules partagé (un seul THREE.Points). */
export class Particles {
  constructor(scene, max) {
    const N = this.max = max || 600;
    this.n = 0;
    // état (simulation)
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.lmax = new Float32Array(N);
    this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    this.size = new Float32Array(N); this.kind = new Uint8Array(N);
    this.rot = new Float32Array(N); this.rotV = new Float32Array(N); this.seed = new Float32Array(N);
    this.col = new Float32Array(N * 3);
    // ce que la carte graphique lit
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('info', new THREE.BufferAttribute(new Float32Array(N * 3), 3));   // case, rotation, aplatissement
    for (const k of ['position', 'color', 'size', 'info']) g.attributes[k].setUsage(THREE.DynamicDrawUsage);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas() }, uScale: { value: 400 } },
      vertexShader: `
        attribute float size;
        attribute vec4 color;
        attribute vec3 info;
        varying vec4 vColor;
        varying vec3 vInfo;
        uniform float uScale;
        void main() {
          vColor = color; vInfo = info;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec4 vColor;
        varying vec3 vInfo;
        void main() {
          vec2 p = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);
          float c = cos(vInfo.y), s = sin(vInfo.y);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          p.x /= max(vInfo.z, 0.12);
          if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
          float cell = vInfo.x;
          vec2 uv = (p * 0.96 + 0.5) * 0.5 + vec2(mod(cell, 2.0), 1.0 - floor(cell / 2.0)) * 0.5;
          vec4 t = texture2D(uMap, uv);
          float a = cell < 0.5 ? min(1.0, t.a * 1.3) : t.a;
          if (a * vColor.a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb * t.rgb, a * vColor.a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }
  get length() { return this.n; }
  /** Une particule. kind : KIND.* (0 = halo, comme avant). */
  spawn(x, y, z, vx, vy, vz, color, size, life, grav, kind, o) {
    let i = this.n;
    if (i >= this.max) {
      // plein : on remplace la plus vieille (la plus proche de sa fin)
      let best = 0, bl = Infinity;
      for (let j = 0; j < this.max; j += 7) if (this.life[j] < bl) { bl = this.life[j]; best = j; }
      i = best;
    } else this.n++;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = this.lmax[i] = Math.max(0.01, life);
    this.grav[i] = grav === undefined ? 9 : grav;
    this.size[i] = size;
    const k = this.kind[i] = kind || 0;
    this.drag[i] = o && o.drag !== undefined ? o.drag : k === KIND.confetti ? 2.4 : k === KIND.puff ? 3.2 : k === KIND.heart ? 1.5 : k === KIND.star || k === KIND.spark ? 1.6 : 0;
    this.rot[i] = o && o.rot !== undefined ? o.rot : Math.random() * TAU;
    this.rotV[i] = o && o.spin !== undefined ? o.spin : k === KIND.confetti ? (Math.random() - 0.5) * 14 : k === KIND.star ? (Math.random() - 0.5) * 6 : 0;
    this.seed[i] = Math.random() * TAU;
    const c = this._c.setHex(color);
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  step(dt) {
    const p = this.p, v = this.v;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      if ((this.life[i] -= dt) <= 0) {
        // on remplace par la dernière
        const j = --this.n, j3 = j * 3;
        if (i !== j) {
          for (let a = 0; a < 3; a++) { p[i3 + a] = p[j3 + a]; v[i3 + a] = v[j3 + a]; this.col[i3 + a] = this.col[j3 + a]; }
          this.life[i] = this.life[j]; this.lmax[i] = this.lmax[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
          this.size[i] = this.size[j]; this.kind[i] = this.kind[j]; this.rot[i] = this.rot[j]; this.rotV[i] = this.rotV[j]; this.seed[i] = this.seed[j];
          i--;
        }
        continue;
      }
      const d = this.drag[i];
      if (d) { const f = Math.exp(-d * dt); v[i3] *= f; v[i3 + 1] *= f; v[i3 + 2] *= f; }
      v[i3 + 1] -= this.grav[i] * dt;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
    }
  }
  /** Remplit les tampons pour la carte graphique (une fois par image). */
  upload(t, scale) {
    const g = this.geo, pa = g.attributes.position.array, ca = g.attributes.color.array, sa = g.attributes.size.array, ia = g.attributes.info.array;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4, k = this.kind[i], lr = this.life[i] / this.lmax[i], age = this.lmax[i] - this.life[i];
      pa[i3] = this.p[i3]; pa[i3 + 1] = this.p[i3 + 1]; pa[i3 + 2] = this.p[i3 + 2];
      ca[i4] = this.col[i3]; ca[i4 + 1] = this.col[i3 + 1]; ca[i4 + 2] = this.col[i3 + 2];
      let s = this.size[i] * 2.2, a = 1, rot = this.rot[i], sq = 1;
      if (k === KIND.glow) s *= Math.min(1, lr * 2);
      else if (k === KIND.puff) { s *= 0.55 + (1 - lr) * 1.1; a = 0.6 * Math.min(1, lr * 1.6) * Math.min(1, age * 14); }
      else if (k === KIND.star || k === KIND.spark) {
        // éclot vite, scintille, puis rapetisse
        s *= Math.min(1, age * 16) * (0.35 + 0.65 * Math.sqrt(lr)) * (k === KIND.spark ? 0.8 + 0.35 * Math.sin(t * 30 + this.seed[i]) : 1);
        a = Math.min(1, lr * 3);
      } else if (k === KIND.confetti) {
        sq = Math.abs(Math.cos(t * 9 + this.seed[i] * 3));      // il papillonne en tombant
        a = Math.min(1, lr * 4);
      } else if (k === KIND.heart) {
        s *= Math.min(1, age * 10) * (1 + Math.sin(age * 14) * 0.08 * lr);
        rot = Math.sin(age * 5 + this.seed[i]) * 0.35;
        a = Math.min(1, lr * 3);
      }
      ca[i4 + 3] = a;
      sa[i] = s;
      ia[i3] = CELL[k]; ia[i3 + 1] = rot; ia[i3 + 2] = sq;
    }
    g.setDrawRange(0, this.n);
    if (this.n) for (const k of ['position', 'color', 'size', 'info']) { const at = g.attributes[k]; at.needsUpdate = true; if (at.addUpdateRange) { at.clearUpdateRanges(); at.addUpdateRange(0, this.n * at.itemSize); } }
    this.points.material.uniforms.uScale.value = scale;
  }
}

// ---------------------------------------------------------------------------
// Vibrations (Android) : courtes et discrètes, coupables dans les Réglages
// ---------------------------------------------------------------------------
const HKEY = 'dogfight.haptics';
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export function hapticsOn() { try { return localStorage.getItem(HKEY) !== '0'; } catch (e) { return true; } }
export function setHaptics(on) { try { localStorage.setItem(HKEY, on ? '1' : '0'); } catch (e) { /* ignore */ } if (!on && canVibrate()) try { navigator.vibrate(0); } catch (e) { /* ignore */ } }
let lastBuzz = 0, hOn = null;
/** Une petite vibration (ms, ou motif [ms, pause, ms…]) ; gap : pas plus souvent que ça (ms). */
export function buzz(pattern, gap) {
  if (!canVibrate()) return;           // iPhone : pas de vibration, on n'insiste pas
  if (hOn === null) hOn = hapticsOn();
  if (!hOn) return;
  const now = performance.now();
  if (now - lastBuzz < (gap === undefined ? 40 : gap)) return;
  lastBuzz = now;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}
export function refreshHaptics() { hOn = hapticsOn(); }

// ---------------------------------------------------------------------------
// Les recettes
// ---------------------------------------------------------------------------
let cssDone = false;
function edgeCss() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
  .juice-edge { position: absolute; inset: 0; pointer-events: none; z-index: 6; overflow: hidden; opacity: 0; }
  .juice-edge.on { animation: juiceEdge 2.4s ease-out forwards; }
  .juice-edge::before { content: ''; position: absolute; inset: 0;
    box-shadow: inset 0 0 70px 18px rgba(255, 214, 90, 0.55), inset 0 0 18px 4px rgba(255, 246, 200, 0.7);
    border-radius: 6px; }
  .juice-edge i { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; opacity: 0;
    background: radial-gradient(circle, #fff 0 12%, rgba(255,236,150,0.9) 22%, rgba(255,214,90,0) 60%);
    clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%); }
  .juice-edge.on i { animation: juiceTwinkle 1.1s ease-out both; }
  @keyframes juiceEdge { 0% { opacity: 0; } 8% { opacity: 1; } 55% { opacity: 0.85; } 100% { opacity: 0; } }
  @keyframes juiceTwinkle { 0% { opacity: 0; transform: scale(0.2) rotate(0deg); } 30% { opacity: 1; transform: scale(1.25) rotate(45deg); } 100% { opacity: 0; transform: scale(0.4) rotate(120deg); } }
  @media (prefers-reduced-motion: reduce) { .juice-edge.on { animation-duration: 1.2s; } .juice-edge.on i { animation: none; } }`;
  document.head.appendChild(st);
}

export class Juice {
  constructor(game, opts) {
    this.game = game;
    this.lite = !!(opts && opts.lite);
    this.parts = new Particles(game.scene, this.lite ? 480 : 640);
    this.punchV = 0; this.punchX = 0;
  }
  /** Moins de particules sur téléphone. */
  count(n) { return Math.max(1, Math.round(n * (this.lite ? 0.65 : 1))); }
  spawn(...a) { this.parts.spawn(...a); }

  /** Bouffées de poussière en couronne (atterrissage, dérapage) ; k : 0..1 la force. */
  dust(x, y, z, k, color) {
    const n = this.count(5 + k * 7), col = color === undefined ? 0xe2d6bc : color;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.random() * 0.5, v = 2 + Math.random() * 1.8 + k * 2.2;
      this.parts.spawn(x + Math.cos(a) * 0.35, y + 0.12, z + Math.sin(a) * 0.35, Math.cos(a) * v, 0.5 + Math.random() * 0.9, Math.sin(a) * v, col, 0.32 + k * 0.14 + Math.random() * 0.1, 0.5 + k * 0.25, -0.6, KIND.puff);
    }
  }
  /** Étoiles d'un coup (toupie qui touche, caisse cassée) : une étoile-éclair + des étoiles en couronne. */
  hitStars(x, y, z, n, color) {
    n = this.count(n || 6);
    this.parts.spawn(x, y, z, 0, 0, 0, 0xffffff, 0.9, 0.14, 0, KIND.glow);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.random() * 0.4, v = 4.5 + Math.random() * 2;
      this.parts.spawn(x, y, z, Math.cos(a) * v, 2 + Math.random() * 2.5, Math.sin(a) * v, i % 2 ? 0xffffff : (color || 0xffe066), 0.3 + Math.random() * 0.12, 0.45 + Math.random() * 0.15, 4, KIND.star);
    }
  }
  /** Le « pop » d'un trésor ramassé ; plus il y en a d'affilée (chain), plus ça brille. */
  pop(x, y, z, color, chain) {
    const c = Math.min(9, chain || 0);
    this.parts.spawn(x, y, z, 0, 0.6, 0, 0xffffff, 0.55 + c * 0.03, 0.16, 0, KIND.glow);
    const n = this.count(4 + (c >> 1));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.random() * 0.6, v = 2.2 + Math.random() * 1.6;
      this.parts.spawn(x, y, z, Math.cos(a) * v, 1.5 + Math.random() * 2, Math.sin(a) * v, i % 2 ? 0xffffff : color, 0.16 + c * 0.012, 0.4 + Math.random() * 0.2, 3, KIND.spark);
    }
  }
  /** Scintillement doux (étoiles qui montent), pour un trésor ou une récompense. */
  sparkle(x, y, z, n, color, r) {
    n = this.count(n || 10); r = r || 0.8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = Math.random() * r;
      this.parts.spawn(x + Math.cos(a) * d, y + (Math.random() - 0.3) * r, z + Math.sin(a) * d, Math.cos(a) * 0.8, 1.2 + Math.random() * 1.6, Math.sin(a) * 0.8, i % 3 ? (color || 0xffe680) : 0xffffff, 0.2 + Math.random() * 0.16, 0.7 + Math.random() * 0.5, -0.4, KIND.spark);
    }
  }
  /** Pluie de confettis (médaille, défi réussi, coffre). */
  confetti(x, y, z, n, spread) {
    n = this.count(n || 40); spread = spread || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (2 + Math.random() * 3.5) * spread;
      this.parts.spawn(x, y, z, Math.cos(a) * v, 5 + Math.random() * 5, Math.sin(a) * v, CONFETTI[i % CONFETTI.length], 0.075 + Math.random() * 0.035, 1.6 + Math.random() * 0.9, 6, KIND.confetti);
    }
  }
  /** Des petits cœurs qui montent (caresse). */
  hearts(x, y, z, n) {
    n = this.count(n || 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.parts.spawn(x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, Math.cos(a) * 0.6, 1.6 + Math.random() * 0.8, Math.sin(a) * 0.6, i % 3 === 2 ? 0xffb0cc : 0xff5a8a, 0.24 + Math.random() * 0.1, 1.0 + Math.random() * 0.4, -0.2, KIND.heart);
    }
  }

  /** Le petit coup de zoom de la caméra (k ≈ 0.3 : léger ; 1 : fort). */
  punch(k) { if (!this.game.cine) this.punchV = Math.max(this.punchV, k * 9); }
  /** Appelé après le placement de la caméra : un ressort qui rapproche la caméra puis revient. */
  applyCamera(cam, target, dt) {
    if (!this.punchV && Math.abs(this.punchX) < 1e-4) return;
    // ressort amorti : on « tire » la caméra vers le chien puis elle revient
    this.punchX += this.punchV * dt;
    this.punchV += (-this.punchX * 160 - this.punchV * 18) * dt;
    if (Math.abs(this.punchV) < 0.01 && Math.abs(this.punchX) < 0.002) { this.punchV = 0; this.punchX = 0; return; }
    const k = Math.max(-0.05, Math.min(0.12, this.punchX));
    cam.position.lerp(target, k);
  }

  /** Éclat doré au bord de l'écran, avec des étoiles qui scintillent (médaille). */
  edge() {
    const root = this.game.dom && this.game.dom.root;
    if (!root) return;
    edgeCss();
    let el = this.edgeEl;
    if (!el) {
      el = this.edgeEl = document.createElement('div');
      el.className = 'juice-edge';
      const n = this.lite ? 14 : 22;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('i'), side = i % 4, u = 4 + Math.random() * 92, w = 2 + Math.random() * 6;
        const [l, t] = side === 0 ? [u, w] : side === 1 ? [100 - w, u] : side === 2 ? [u, 100 - w] : [w, u];
        s.style.left = l + '%'; s.style.top = t + '%';
        s.style.animationDelay = (Math.random() * 1.1).toFixed(2) + 's';
        const sz = 14 + Math.random() * 18; s.style.width = s.style.height = sz + 'px'; s.style.margin = (-sz / 2) + 'px 0 0 ' + (-sz / 2) + 'px';
        el.appendChild(s);
      }
      root.appendChild(el);
    }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this.edgeTo);
    this.edgeTo = setTimeout(() => el.classList.remove('on'), 2600);
  }
}
