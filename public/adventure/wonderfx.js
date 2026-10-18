/*
 * Matcha & Ainu — les 8 merveilles des Fleurs Merveille (voir wonder.js).
 *
 *  1. Parc     « Le Grand Chœur »         : des fleurs géantes poussent en cercle et chantent en
 *                                            chœur (les accords de la musique), les arbres dansent.
 *  2. Forêt    « Champignons Lumineux »   : le crépuscule tombe, les lucioles sortent, des
 *                                            champignons géants qui brillent font rebondir jusqu'au ciel.
 *  3. Ville    « La Ville en Bulles »     : les chiens flottent au ralenti dans des bulles de savon,
 *                                            des chiots aussi, et des bulles montent partout.
 *  4. Ciel     « Toboggans Arc-en-ciel »  : des arcs-en-ciel se déroulent d'une île à l'autre : on glisse dessus.
 *  5. Neige    « Le Pays des Bonbons »    : la neige devient sucre rose, des sucres d'orge, sucettes,
 *                                            boules de gomme et bonshommes-guimauves sortent du sol.
 *  6. Plage    « Les Poissons Volants »   : un banc de poissons nage dans le ciel, d'autres bondissent de la mer.
 *  7. Ferme    « La Grande Parade »       : les animaux se mettent debout et défilent en rythme.
 *  8. Château  « Les Tableaux Vivants »   : les chats des tableaux se réveillent et font coucou.
 *
 * Chaque merveille : seedSpots() (8 graines, mêmes places chez tous les joueurs), begin() / end()
 * (derrière le tourbillon et le voile : le changement ne se voit pas), step(dt, t, host),
 * render(dt, t, k) (k : intensité 0..1), et pour certaines playerStep / support (hôte).
 * Tout est construit une seule fois (au premier begin) en quelques maillages instanciés.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import { SEEDS } from './wonderdata.js';
import { danceFoliage } from './foliage.js';
import * as M from './models.js';
import * as FK from './farmkit.js';
import { buildPup, posePup } from './puppies.js';
import { petal, prep, mergeIndexed, wonderGlow } from './wonder.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** Petit hasard reproductible (mêmes places chez l'hôte et chez les amis). */
function rng(seed) { let x = (seed >>> 0) || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** « Pop » d'apparition : 0 → 1 avec un petit rebond. */
const popK = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.35);

// ---------------------------------------------------------------------------
// Où poser les choses
// ---------------------------------------------------------------------------
const BLOCK = new Set(['tree', 'rock', 'trunk', 'wall', 'hedge', 'bldg', 'stump', 'container', 'crack', 'catpile', 'gate', 'obs', 'tank']);
const nearCols = (x, z, r) => (L.near ? L.near(x, z, r) : L.colliders);
/** Hauteur du sol (ou de la plate-forme) sous (x, z), en partant d'une hauteur proche de y. */
export function groundAt(x, z, y) { return L.supportAt(x, z, (y === undefined ? 200 : y) + 1.5, 0, 0.6).y; }
/** Un endroit libre (pas dans un mur, un arbre, l'eau ou le vide) à peu près à la hauteur y0 ? */
export function spotOk(x, z, y0, o) {
  o = o || {};
  const r = o.r === undefined ? 0.5 : o.r, tol = o.tol === undefined ? 2.2 : o.tol;
  const s = L.supportAt(x, z, y0 + 2, 0, 0.6), y = s.y;
  if (Math.abs(y - y0) > tol) return null;
  if (L.KILL_Y !== undefined && y < L.KILL_Y + 2) return null;
  if (!s.collider && L.WATER_Y !== undefined && y < L.WATER_Y + 0.08 && !L.NO_WATER) return null;
  if (!o.wet && L.inWater && L.inWater(x, z) && !s.collider && L.ID !== 3) return null;
  for (const c of nearCols(x, z, r + 1)) if (!c.off && !c.moving && (c.solid || BLOCK.has(c.kind)) && L.inside(c, x, z, r) && c.y0 < y + 1.6 && c.y1 > y + 0.1) return null;
  // sol à peu près plat
  for (let a = 0; a < TAU; a += TAU / 5) if (Math.abs(L.supportAt(x + Math.cos(a) * r, z + Math.sin(a) * r, y + 1, 0, 0.6).y - y) > (o.flat || 0.7)) return null;
  return y;
}
/** n places en spirale autour de c (graines, décors). */
export function ringSpots(c, n, r0, r1, o) {
  o = o || {};
  const out = [], R = rng(o.seed || (L.ID * 7919 + n));
  for (let i = 0; i < n; i++) {
    let got = null;
    for (let k = 0; k < 24 && !got; k++) {
      const a = (o.a0 || 0.6) + i * (o.step || 2.39996) + k * 0.41 + (o.jit ? (R() - 0.5) * o.jit : 0);
      const r = lerp(r0, r1, n === 1 ? 0.5 : (i + 0.5) / n) * (1 - (k % 6) * 0.07) + (k >= 6 ? (k - 6) * 0.35 : 0);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const y = spotOk(x, z, c.y, o);
      if (y !== null && !out.some(p => Math.hypot(p.x - x, p.z - z) < (o.gap || 1.6))) got = { x, z, y: y + (o.lift === undefined ? 0.75 : o.lift), gy: y, a, r };
    }
    if (got) out.push(got);
  }
  return out;
}
/** Les graines : 8 places au sol (ou plus haut), complétées si besoin. */
function seedRing(c, r0, r1, extra) {
  let s = (extra || []).slice(0, SEEDS);
  if (s.length < SEEDS) s = s.concat(ringSpots(c, SEEDS - s.length, r0, r1, { seed: 4242 + L.ID, gap: 2.2 }));
  let k = 0;
  while (s.length < SEEDS) { const a = k++ * 0.8; s.push({ x: c.x + Math.cos(a) * 2.5, y: c.y + 0.75, z: c.z + Math.sin(a) * 2.5 }); }
  return s.map(p => ({ x: p.x, y: p.y, z: p.z }));
}

/** Le temps de la musique (en temps, 4 par mesure) : les danses tombent pile sur la musique. */
const BPM = { 1: 112, 2: 96, 3: 100, 4: 126, 5: 128, 6: 108, 7: 124, 8: 104 };
function beatOf(g, t) {
  const S = g.sfx, cm = S && S.composer;
  if (S && S.ctx && cm && S.theme && /^wonder/.test(S.theme) && S.ctx.state === 'running') return (((S.ctx.currentTime - cm.tBar) / (cm.s16 * 4)) % 4 + 4) % 4;
  return t * (BPM[L.ID] || 110) / 60;
}

// ---------------------------------------------------------------------------
// L'ambiance : lumière, brume, ciel et étalonnage glissent vers ceux de la merveille
// ---------------------------------------------------------------------------
class Mood {
  constructor(g, to) { this.g = g; this.to = to || {}; this.k = -1; }
  grab() {
    const g = this.g, sc = g.scene;
    let hemi = null; sc.traverse(o => { if (!hemi && o.isHemisphereLight) hemi = o; });
    const f = g.post && g.post.mFinal ? g.post.mFinal.uniforms : null;
    this.o = {
      hemi, hs: hemi && hemi.color.clone(), hg: hemi && hemi.groundColor.clone(), hi: hemi && hemi.intensity,
      sun: g.sun, sc: g.sun.color.clone(), si: g.sun.intensity,
      fog: sc.fog, fc: sc.fog && sc.fog.color.clone(), fn: sc.fog && sc.fog.near, ff: sc.fog && sc.fog.far,
      dome: g.photoSky ? g.photoSky.material : null, dc: g.photoSky ? g.photoSky.material.color.clone() : null,
      env: sc.environmentIntensity,
      f, sat: f && f.saturation.value, exp: f && f.exposure.value, high: f && f.highTint.value.clone(), shad: f && f.shadowTint.value.clone(), bloom: g.post && g.post.grade ? g.post.grade.bloom : 0,
    };
  }
  apply(k) {
    if (Math.abs(k - this.k) < 0.002) return;
    if (!this.o) this.grab();
    this.k = k;
    const o = this.o, T = this.to;
    if (o.hemi) {
      if (T.hemi) { o.hemi.color.copy(o.hs).lerp(_c.set(T.hemi[0]), k * (T.hemiMix || 0.6)); o.hemi.groundColor.copy(o.hg).lerp(_c.set(T.hemi[1]), k * (T.hemiMix || 0.6)); }
      o.hemi.intensity = o.hi * lerp(1, T.hemiK || 1, k);
    }
    if (T.sun) o.sun.color.copy(o.sc).lerp(_c.set(T.sun), k * 0.7);
    o.sun.intensity = o.si * lerp(1, T.sunK || 1, k);
    if (o.fog) {
      if (T.fog) o.fog.color.copy(o.fc).lerp(_c.set(T.fog), k * (T.fogMix || 0.6));
      if (T.fogK) { o.fog.near = o.fn * lerp(1, T.fogK, k); o.fog.far = o.ff * lerp(1, T.fogK, k); }
    }
    if (o.dome && T.sky) o.dome.color.copy(o.dc).lerp(_c.set(T.sky), k * (T.skyMix || 0.7));
    if (o.env !== undefined && T.envK) this.g.scene.environmentIntensity = o.env * lerp(1, T.envK, k);
    if (o.f) {
      o.f.saturation.value = o.sat * lerp(1, T.sat || 1.12, k);
      o.f.exposure.value = o.exp * lerp(1, T.exp || 1, k);
      if (T.high) o.f.highTint.value.set(lerp(o.high.x, T.high[0], k), lerp(o.high.y, T.high[1], k), lerp(o.high.z, T.high[2], k));
      if (T.shadow) o.f.shadowTint.value.set(lerp(o.shad.x, T.shadow[0], k), lerp(o.shad.y, T.shadow[1], k), lerp(o.shad.z, T.shadow[2], k));
      if (T.bloom && this.g.post.grade) this.g.post.grade.bloom = lerp(o.bloom, T.bloom, k);
    }
  }
}

// ---------------------------------------------------------------------------
// Petits outils de modelage
// ---------------------------------------------------------------------------
/** Peint une géométrie (non indexée) : couleur fixe ou fn(x, y, z, couleur). */
const paint = (geo, col) => FK.paint(geo, col);
const merge = (list) => M.mergeGeos(list);
/** Matière à couleurs de sommets, qui brille un peu d'elle-même (glow) ; garde le PBR en mode dessin animé. */
function vmat(o) {
  o = o || {};
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough === undefined ? 0.6 : o.rough, metalness: 0, side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity, depthWrite: o.depthWrite === undefined ? true : o.depthWrite });
  m.userData.keepPBR = true;
  if (o.glow || o.rim || o.wiggle) {
    m.onBeforeCompile = (sh) => {
      if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
      if (o.wiggle) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.wiggle);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = 1.0 - abs(dot(normalize(normal + vec3(1e-5)), normalize(vViewPosition + vec3(1e-5))));
          totalEmissiveRadiance += diffuseColor.rgb * (${(o.glow || 0).toFixed(3)} + rim * rim * ${(o.rim || 0).toFixed(3)}); }`);
    };
    m.customProgramCacheKey = () => 'wfx-' + (o.key || 'm') + (o.glow || 0) + (o.rim || 0);
  }
  return m;
}
/** Un maillage instancié (n exemplaires) qui ne se cache pas hors champ (positions mises à jour à la main). */
function inst(geo, mat, n, colors) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.userData.noOutline = true; m.castShadow = false; m.receiveShadow = false;
  if (colors) { for (let i = 0; i < n; i++) m.setColorAt(i, _c.set(colors[i % colors.length])); m.instanceColor.needsUpdate = true; }
  return m;
}
const setM = (im, i, x, y, z, rx, ry, rz, sx, sy, sz, order) => {
  _e.set(rx, ry, rz, order || 'YXZ'); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz));
  im.setMatrixAt(i, _m4);
};
const done = (im, n) => { if (n !== undefined) im.count = n; im.instanceMatrix.needsUpdate = true; };
/** Tube le long d'une courbe, rayon r(u) ; couleur fn(u, angle). */
function tubeAlong(pts, radius, seg, rad, colFn) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = g.attributes.position, P = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; curve.getPointAt(u, P);
    const r = typeof radius === 'function' ? radius(u) : radius;
    for (let j = 0; j <= rad; j++) {
      const q = i * (rad + 1) + j; _v.fromBufferAttribute(p, q).sub(P).multiplyScalar(r).add(P); p.setXYZ(q, _v.x, _v.y, _v.z);
      colFn(u, j / rad * TAU, _c); col[q * 3] = _c.r; col[q * 3 + 1] = _c.g; col[q * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g.toNonIndexed();
}
/** Vrais modèles du jeu (groupes Three.js) cuits en une seule géométrie à couleurs de sommets. */
function bake(root) {
  root.updateMatrixWorld(true);
  const list = [];
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) paint(g, o.material && o.material.color ? o.material.color.getHex() : 0xffffff);
    g.applyMatrix4(o.matrixWorld);
    list.push({ geo: g });
  });
  return merge(list);
}

// ---------------------------------------------------------------------------
// La base commune
// ---------------------------------------------------------------------------
class Fx {
  constructor(ctx) { this.ctx = ctx; this.g = ctx.g; this.c = ctx.c; this.lite = ctx.lite; this.objs = []; this.built = false; this.mood = new Mood(this.g, this.moodTo()); this.U = { uTime: { value: 0 } }; }
  moodTo() { return { sat: 1.15 }; }
  add(o) { o.frustumCulled = false; o.userData.noOutline = true; o.visible = false; this.g.scene.add(o); this.objs.push(o); return o; }
  seedSpots() { return seedRing(this.c, 3, 10); }
  build() {}
  begin() {
    if (!this.built) { this.built = true; try { this.build(); } catch (e) { console.error(e); } }
    for (const o of this.objs) o.visible = true;
    this.on = true;
    this.start();
  }
  start() {}
  end() {
    this.on = false;
    for (const o of this.objs) o.visible = false;
    this.mood.apply(0);
    this.stop();
  }
  stop() {}
  step() {}
  render(dt, t, k) { this.U.uTime.value = this.g.t; this.mood.apply(k); }
  players() { return this.g.players; }
  dispose() { for (const o of this.objs) this.g.scene.remove(o); this.objs = []; this.mood.apply(0); }
}

// ===========================================================================
// 1. Le Grand Chœur des Fleurs (Parc)
// ===========================================================================
const CHOIR_COLS = [0xff5a9e, 0xffa63a, 0xffdc3a, 0x6ad86a, 0x4ec2ff, 0xa77aff, 0xff7a6a, 0x4ae0c8, 0xff8ad8, 0xffc85a, 0x8ab8ff, 0xd88aff];
class Choir extends Fx {
  moodTo() { return { sat: 1.18, exp: 1.03, high: [0.06, 0.02, 0.035], hemi: [0xfff0f6, 0xd8a870], hemiMix: 0.3, sun: 0xfff0e0 }; }
  seedSpots() {
    // au milieu du cercle des chanteuses, et quelques-unes juste derrière
    return seedRing(this.c, 0, 0, [...ringSpots(this.c, 5, 2.6, 4.6, { seed: 77, gap: 2 }), ...ringSpots(this.c, 3, 10, 11.5, { seed: 78, gap: 3 })]);
  }
  build() {
    const lite = this.lite, c = this.c;
    // les chanteuses : en cercle autour de la fleur, tournées vers le milieu
    const N = lite ? 9 : 12;
    this.sing = [];
    for (let i = 0; i < N * 2 && this.sing.length < N; i++) {
      const a = (i % N) / N * TAU + (i >= N ? 0.13 : 0), r = i >= N ? 8.6 : 7.2;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = spotOk(x, z, c.y, { r: 0.6 });
      if (y === null) continue;
      this.sing.push({ x, y, z, a, yaw: Math.atan2(c.x - x, c.z - z), s: 1.25 + ((i * 7) % 5) * 0.1, voice: this.sing.length % 3, ph: i * 1.7, open: 0 });
    }
    const n = this.sing.length;
    // tige + feuilles
    const stem = [prep(tubeAlong([[0, 0, 0], [0.04, 0.6, 0.02], [-0.03, 1.2, -0.02], [0, 1.6, 0]], (u) => 0.07 - u * 0.03, 12, 7, (u, a, C) => C.set(0x2f7a26).lerp(_c2.set(0x7ccf4a), u)), 0x000000)];
    // (prep repeint : on remet le dégradé de la tige)
    {
      const p = stem[0].attributes.position, col = stem[0].attributes.color;
      for (let i = 0; i < p.count; i++) { _c.set(0x2f7a26).lerp(_c2.set(0x7ccf4a), p.getY(i) / 1.6); col.setXYZ(i, _c.r, _c.g, _c.b); }
    }
    for (const [y, yaw, len] of [[0.45, 0.4, 0.62], [0.85, 0.4 + Math.PI, 0.55]]) { const lf = petal({ r0: 0.03, len, w: len * 0.3, cup: 0.9, pitch: 0.7, curl: 1.2, yaw, cols: [0x3a8a2a, 0x5cb83a, 0x9ae060], nu: 7, nv: 4, vein: 0.2 }); lf.translate(0, y, 0); stem.push(lf); }
    this.stemI = this.add(inst(mergeIndexed(stem), vmat({ rough: 0.65, glow: 0.05, side: THREE.DoubleSide }), n));
    // tête : 11 pétales autour d'un visage (le visage regarde +z)
    const pets = [];
    for (let i = 0; i < 8; i++) pets.push(petal({ r0: 0.24, len: 0.4, w: 0.27, cup: 0.45, pitch: 0.16, curl: 0.45, yaw: i / 8 * TAU, cols: [0xffffff, 0xf6f6f6, 0xdedede], ph: i * 0.4, nu: lite ? 6 : 8, nv: lite ? 4 : 5 }));
    for (let i = 0; i < 8; i++) pets.push(petal({ r0: 0.22, len: 0.27, w: 0.2, cup: 0.55, pitch: 0.42, curl: 0.4, yaw: (i + 0.5) / 8 * TAU, cols: [0xffffff, 0xffffff, 0xf2f2f2], ph: i * 0.3, nu: 5, nv: 4 }));
    const pg = mergeIndexed(pets); pg.rotateX(Math.PI / 2);
    this.petI = this.add(inst(pg, vmat({ rough: 0.55, glow: 0.18, rim: 0.4, side: THREE.DoubleSide, key: 'cp' }), n, CHOIR_COLS));
    // le visage : disque crème, yeux fermés de bonheur, joues roses
    const face = [];
    const disk = new THREE.CircleGeometry(0.24, lite ? 20 : 28); face.push({ geo: paint(disk.toNonIndexed(), (x, y, z, C) => C.set(0xfff6d8).lerp(_c2.set(0xffc83a), Math.hypot(x, y) / 0.24 * 0.8)) });
    const dome = new THREE.SphereGeometry(0.235, 18, 8, 0, TAU, 0, Math.PI * 0.32); dome.rotateX(Math.PI / 2); dome.scale(1, 1, 0.35); dome.translate(0, 0, -0.06);
    face.push({ geo: paint(dome.toNonIndexed(), (x, y, z, C) => C.set(0xfff0c0).lerp(_c2.set(0xffc23a), Math.hypot(x, y) / 0.24)) });
    for (const sx of [-1, 1]) {
      const eye = new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI); eye.translate(0, -0.012, 0);
      face.push({ geo: paint(eye.toNonIndexed(), 0x3a1a10), x: sx * 0.085, y: 0.06, z: 0.02 });
      face.push({ geo: paint(new THREE.CircleGeometry(0.04, 12).toNonIndexed(), 0xff8aa8), x: sx * 0.14, y: -0.03, z: 0.018 });
    }
    this.faceI = this.add(inst(merge(face), vmat({ rough: 0.7, glow: 0.12, key: 'cf', side: THREE.DoubleSide }), n));
    // la bouche qui chante (s'ouvre et se ferme sur les notes)
    const mouth = [{ geo: paint(new THREE.CircleGeometry(0.07, 16).toNonIndexed(), (x, y, z, C) => C.set(y < -0.03 ? 0xff6a8a : 0x5a1020)), z: 0.024 }];
    this.mouthI = this.add(inst(merge(mouth), vmat({ rough: 0.5, key: 'cm', side: THREE.DoubleSide }), n));
    // tapis de petites fleurs qui poussent partout (et dodelinent)
    const tiny = [];
    for (let i = 0; i < 6; i++) { const p = petal({ r0: 0.015, len: 0.07, w: 0.035, cup: 0.4, pitch: 0.25, curl: 0.3, yaw: i / 6 * TAU, cols: [0xffffff, 0xffffff, 0xeeeeee], nu: 3, nv: 2 }); tiny.push(p); }
    const hd = prep(new THREE.SphereGeometry(0.02, 6, 4), 0xffd040); tiny.push(hd);
    const st = prep(new THREE.CylinderGeometry(0.006, 0.008, 0.16, 4).translate(0, -0.08, 0), 0x4a9a30); tiny.push(st);
    const tg = mergeIndexed(tiny);
    this.carpet = ringSpots(c, lite ? 70 : 140, 1.5, 14, { seed: 31, gap: 0.55, r: 0.2, lift: 0.16, tol: 1.6, flat: 1 });
    this.carI = this.add(inst(tg, vmat({ rough: 0.6, glow: 0.2, side: THREE.DoubleSide, key: 'cc' }), this.carpet.length, [0xffffff, 0xff9ad0, 0xffe080, 0xb8a0ff, 0x9ad8ff, 0xffb0a0]));
    // notes de musique qui s'envolent (toujours face à la caméra)
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, 0.13, 0.095, 0, TAU, false, -0.4);
    const head = new THREE.ShapeGeometry(sh, 10);
    const stemN = new THREE.PlaneGeometry(0.035, 0.42).translate(0.115, 0.2, 0);
    const flag = new THREE.PlaneGeometry(0.16, 0.06).rotateZ(-0.6).translate(0.18, 0.36, 0);
    this.notes = [];
    for (let i = 0; i < (lite ? 12 : 22); i++) this.notes.push({ t: -i * 0.35, x: 0, y: 0, z: 0, vx: 0, life: 2.4 });
    this.noteI = this.add(inst(merge([{ geo: paint(head.toNonIndexed(), 0xffffff) }, { geo: paint(stemN.toNonIndexed(), 0xffffff) }, { geo: paint(flag.toNonIndexed(), 0xffffff) }]),
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false }), this.notes.length, CHOIR_COLS));
    this.noteI.renderOrder = 6;
  }
  start() {
    this.voices = [[], [], []];      // notes chantées par chaque voix : [début, fin] (temps audio)
    const S = this.g.sfx, self = this;
    if (S) S.onBar = (t, ch, barLen) => self.onBar(t, ch, barLen);
  }
  stop() { const S = this.g.sfx; if (S && S.onBar) S.onBar = null; danceFoliage(0, 0); }
  /** Le chœur chante les accords de la musique (deux « aaah » par mesure, trois voix). */
  onBar(t, ch, barLen) {
    if (!this.on) return;
    const S = this.g.sfx, d = this.g.me.pos.distanceTo(this.c), v = clamp(1.3 - d / 30, 0, 1);
    const fit = (m) => { while (m < 62) m += 12; while (m > 79) m -= 12; return m; };
    const notes = [fit(ch[0]), fit(ch[1]), fit(ch[2])].sort((a, b) => a - b);
    for (let h = 0; h < 2; h++) {
      const at = t + h * barLen / 2, len = barLen / 2 * 0.86;
      notes.forEach((m, k) => {
        if (v > 0.02) { S.inst(S.composer.out, 'pad', m, at, len, 0.035 * v, 0.6); S.inst(S.composer.out, 'flute', m + (k === 2 ? 0 : 0), at + 0.02, len * 0.9, 0.022 * v, 0.5); }
        this.voices[k].push([at, at + len]);
        if (this.voices[k].length > 6) this.voices[k].shift();
      });
    }
  }
  /** Ouverture de la bouche d'une voix maintenant (0..1). */
  mouth(k, t) {
    const S = this.g.sfx;
    if (S && S.ctx && this.voices && this.voices[k].length) {
      const now = S.ctx.currentTime;
      for (const [a, b] of this.voices[k]) if (now >= a && now <= b) { const u = (now - a) / (b - a); return Math.min(1, u * 8) * (1 - Math.pow(u, 6)) * (0.8 + 0.2 * Math.sin(now * 34 + k)); }
      return 0.08;
    }
    return 0.4 + 0.4 * Math.sin(t * 6 + k * 2);
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.sing) return;
    const g = this.g, b = beatOf(g, t), cam = g.camera;
    danceFoliage(k, b * Math.PI);
    const n = this.sing.length;
    for (let i = 0; i < n; i++) {
      const f = this.sing[i];
      const grow = popK(clamp((t + 1.2) * 1.4 - i * 0.12, 0, 1)) * k, s = f.s * Math.max(0.001, grow);
      const sway = Math.sin(b * Math.PI + (f.voice * 0.7)) * 0.16, nod = Math.cos(b * Math.PI * 2) * 0.06;
      const open = this.mouth(f.voice, t);
      f.open = lerp(f.open, open, Math.min(1, dt * 18));
      setM(this.stemI, i, f.x, f.y, f.z, 0, f.yaw, sway * 0.6, s);
      // la tête au bout de la tige qui se balance
      const hx = Math.sin(-sway * 0.6) * 1.6 * s, hy = Math.cos(sway * 0.6) * 1.6 * s;
      const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
      const X = f.x + hx * cy, Y = f.y + hy + f.open * 0.05 * s, Z = f.z - hx * sy;
      const tilt = -0.12 - f.open * 0.12 + nod;
      setM(this.petI, i, X, Y, Z, tilt, f.yaw, -sway * 0.9, s * (1 + f.open * 0.06));
      setM(this.faceI, i, X, Y, Z, tilt, f.yaw, -sway * 0.9, s);
      _e.set(tilt, f.yaw, -sway * 0.9, 'YXZ'); _q.setFromEuler(_e);
      _v2.set(0, -0.085 * s, 0.0).applyQuaternion(_q);
      _m4.compose(_v.set(X + _v2.x, Y + _v2.y, Z + _v2.z), _q, _s.set(s * (0.8 + f.open * 0.3), s * (0.25 + f.open * 1.1), s));
      this.mouthI.setMatrixAt(i, _m4);
      // une note s'envole quand elle chante fort
      if (f.open > 0.75 && Math.random() < dt * 0.9) this.emitNote(X, Y + 0.4 * s, Z, i);
    }
    done(this.stemI); done(this.petI); done(this.faceI); done(this.mouthI);
    // le tapis de fleurs
    for (let i = 0; i < this.carpet.length; i++) {
      const p = this.carpet[i], d = Math.hypot(p.x - this.c.x, p.z - this.c.z);
      const grow = popK(clamp((t + 1.4) * 1.2 - d * 0.09, 0, 1)) * k;
      const bob = 1 + Math.max(0, Math.sin(b * Math.PI + d * 0.6)) * 0.25;
      setM(this.carI, i, p.x, p.gy + 0.16 * grow * bob, p.z, Math.sin(b * Math.PI + i) * 0.2, i * 2.3, 0, Math.max(0.001, grow) * (1.4 + (i % 4) * 0.25) * bob);
    }
    done(this.carI);
    // les notes
    let m = 0;
    for (const nt of this.notes) {
      if (nt.t < 0 || nt.t > nt.life) { setM(this.noteI, m++, 0, -999, 0, 0, 0, 0, 0.001); nt.t += dt; continue; }
      nt.t += dt;
      nt.y += dt * 1.1; nt.x += Math.sin(nt.t * 3 + nt.ph) * dt * 0.6;
      const a = sst(0, 0.2, nt.t) * (1 - sst(nt.life * 0.7, nt.life, nt.t));
      _q.copy(cam.quaternion); _q2.setFromAxisAngle(_v2.set(0, 0, 1), Math.sin(nt.t * 4 + nt.ph) * 0.3); _q.multiply(_q2);
      _m4.compose(_v.set(nt.x, nt.y, nt.z), _q, _s.setScalar(0.9 * a + 0.001));
      this.noteI.setMatrixAt(m++, _m4);
    }
    done(this.noteI);
  }
  emitNote(x, y, z, i) {
    const nt = this.notes.find(q => q.t > q.life || q.t < -50) || this.notes.find(q => q.t > q.life);
    if (!nt) return;
    Object.assign(nt, { t: 0, x, y, z, ph: Math.random() * 6, life: 2 + Math.random() * 0.8 });
    if (this.noteI.instanceColor) { this.noteI.setColorAt(this.notes.indexOf(nt), _c.set(CHOIR_COLS[(i * 5 + Math.floor(Math.random() * 4)) % CHOIR_COLS.length])); this.noteI.instanceColor.needsUpdate = true; }
  }
}

// ===========================================================================
// 2. Les Champignons Lumineux (Forêt)
// ===========================================================================
const MUSH_COLS = [0x3ae0ff, 0xff4fd0, 0x9aff4a, 0xffc83a, 0xa77aff, 0x4affb0, 0xff7a5a, 0x5aa0ff, 0xff8ae8];
class Mushrooms extends Fx {
  moodTo() { return { hemi: [0x5a6aff, 0x2a1a5a], hemiMix: 0.85, hemiK: 0.45, sun: 0xff7ad0, sunK: 0.28, fog: 0x241e4e, fogMix: 0.85, fogK: 0.75, sky: 0x3a3c88, skyMix: 0.85, envK: 0.35, sat: 1.22, exp: 0.98, high: [0.0, 0.03, 0.08], shadow: [0.03, 0.0, 0.08], bloom: 0.9 }; }
  layout() {
    if (this.pads) return this.pads;
    const c = this.c, N = this.lite ? 7 : 9;
    const sp = ringSpots(c, N, 4.2, 11, { seed: 902, gap: 4.6, r: 1.6, tol: 1.8, lift: 0, step: 2.0 });
    this.pads = sp.map((p, i) => {
      const h = 1.5 + (i % 3) * 0.5, cr = 1.25 + ((i * 5) % 4) * 0.22;
      return { x: p.x, z: p.z, gy: p.gy, h, cr, top: p.gy + h + cr * 0.42, r: cr * 0.86, i, bounce: 21, moving: true, kind: 'wonderpad', squashT: -9 };
    });
    return this.pads;
  }
  seedSpots() {
    // au-dessus des champignons (on rebondit pour les attraper) et quelques-unes au sol
    const P = this.layout(), up = P.slice(0, 5).map((p, i) => ({ x: p.x, z: p.z, y: p.top + 4.6 + (i % 2) * 0.8 }));
    return seedRing(this.c, 0, 0, [...up, ...ringSpots(this.c, 3, 2.5, 6, { seed: 55, gap: 2.4 })]);
  }
  build() {
    const lite = this.lite, P = this.layout();
    // le pied (blanc nacré qui luit) et le chapeau (couleur vive, points blancs, lamelles dessous)
    const stemPts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; stemPts.push(new THREE.Vector2(0.3 - 0.12 * u + 0.12 * Math.pow(1 - u, 4), u)); }
    const stem = new THREE.LatheGeometry(stemPts, lite ? 10 : 16).toNonIndexed();
    paint(stem, (x, y, z, C) => C.set(0xe8f0ff).lerp(_c2.set(0xffffff), y));
    this.stemI = this.add(inst(stem, vmat({ rough: 0.5, glow: 0.35, rim: 0.6, key: 'ms' }), P.length));
    const capPts = [];
    for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 0.5; capPts.push(new THREE.Vector2(Math.sin(a) * 1.0 * (1 + 0.04 * Math.sin(a * 8)), Math.cos(a) * 0.62)); }
    for (let i = 0; i <= 6; i++) { const u = i / 6; capPts.push(new THREE.Vector2(1.0 - u * 0.86, -0.02 + u * 0.12)); }
    const cap = new THREE.LatheGeometry(capPts.reverse(), lite ? 16 : 26).toNonIndexed();
    const R = rng(5);
    const dots = Array.from({ length: 13 }, () => { const a = R() * TAU, e = 0.2 + R() * 1.0; return [Math.cos(a) * Math.sin(e), Math.cos(e), Math.sin(a) * Math.sin(e), 0.12 + R() * 0.1]; });
    paint(cap, (x, y, z, C) => {
      if (y < 0.05) { C.setRGB(0.95, 0.92, 0.85).multiplyScalar(0.7 + 0.3 * Math.abs(Math.sin(Math.atan2(z, x) * 30))); return; }   // lamelles
      const l = Math.hypot(x, y / 0.62, z) || 1, nx = x / l, ny = y / 0.62 / l, nz = z / l;
      const spot = dots.some(d => (nx - d[0]) ** 2 + (ny - d[1]) ** 2 + (nz - d[2]) ** 2 < d[3] * d[3]);
      if (spot) C.setRGB(1.6, 1.6, 1.6); else C.setRGB(1, 1, 1).multiplyScalar(0.75 + 0.25 * y / 0.62);
    });
    this.capI = this.add(inst(cap, vmat({ rough: 0.35, glow: 0.65, rim: 0.9, key: 'mc' }), P.length, MUSH_COLS));
    // flaques de lumière sous les chapeaux
    const gp = new THREE.BufferGeometry(), arr = new Float32Array(P.length * 3), col = new Float32Array(P.length * 3);
    P.forEach((p, i) => { arr.set([p.x, p.gy + p.h * 0.6, p.z], i * 3); _c.set(MUSH_COLS[i % MUSH_COLS.length]); col.set([_c.r, _c.g, _c.b], i * 3); });
    gp.setAttribute('position', new THREE.BufferAttribute(arr, 3)); gp.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.glow = this.add(new THREE.Points(gp, new THREE.PointsMaterial({ map: wonderGlow(), vertexColors: true, size: 6, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    this.glow.renderOrder = 5;
  }
  /** Les chapeaux sont des trampolines (game.support → collider à rebond). */
  support(x, z, y, s) {
    if (!this.pads || !this.on) return;
    for (const p of this.pads) {
      const top = p.top * 1 + (p.grow < 1 ? -9 : 0);
      if (top > s.y && top <= y + 0.6 && (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) { s.y = top; s.collider = p; }
    }
  }
  step(dt, t) {
    // lucioles : elles sortent tout autour de chaque chien (chaque écran voit les siennes)
    if (t < 0) return;
    const g = this.g, me = g.me, rate = this.lite ? 16 : 30;
    for (let i = 0; i < 3; i++) if (Math.random() < dt * rate / 3) {
      const a = Math.random() * TAU, r = 2 + Math.random() * 11;
      g.spawnParticle(me.pos.x + Math.cos(a) * r, me.pos.y + 0.4 + Math.random() * 4, me.pos.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.5,
        Math.random() < 0.75 ? 0xd8ff6a : 0x8affd8, 0.08 + Math.random() * 0.06, 3 + Math.random() * 2, -0.04, 5, { drag: 0.2 });
    }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.capI) return;
    const g = this.g, b = beatOf(g, t);
    this.pads.forEach((p, i) => {
      p.grow = popK(clamp((t + 1.2) * 1.3 - i * 0.15, 0, 1)) * k;
      const sq = g.t - p.squashT < 0.5 ? Math.sin((g.t - p.squashT) / 0.5 * Math.PI) * Math.exp(-(g.t - p.squashT) * 4) : 0;
      if (sq > 0 && !p.boinged) { p.boinged = true; g.juice && g.juice.sparkle(p.x, p.top, p.z, 16, MUSH_COLS[i % MUSH_COLS.length], p.cr); }
      if (g.t - p.squashT > 0.5) p.boinged = false;
      const breathe = 1 + Math.sin(b * Math.PI * 0.5 + i) * 0.03, s = Math.max(0.001, p.grow);
      setM(this.stemI, i, p.x, p.gy, p.z, 0, i, 0, s * 1.4, p.h * s * (1 - sq * 0.25), s * 1.4);
      setM(this.capI, i, p.x, p.gy + p.h * s * (1 - sq * 0.25), p.z, Math.sin(t * 0.7 + i) * 0.04, i * 1.3, Math.cos(t * 0.6 + i) * 0.04, p.cr * s * breathe * (1 + sq * 0.25), p.cr * s * breathe * (1 - sq * 0.4), p.cr * s * breathe * (1 + sq * 0.25));
    });
    done(this.stemI); done(this.capI);
    this.glow.material.opacity = 0.5 * k * (0.85 + 0.15 * Math.sin(t * 2));
  }
}

// ===========================================================================
// Bulles de savon (Ville ; et quelques-unes sous la mer de la Plage)
// ===========================================================================
function bubbleMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, fogColor: { value: new THREE.Color() } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vPh;
      uniform float uTime;
      void main() {
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        vPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        // la bulle tremblote
        vec3 p = position * (1.0 + 0.035 * sin(uTime * 5.0 + position.y * 6.0 + vPh * 3.0));
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vV; varying float vPh;
      uniform float uTime;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float h = f * 2.2 + vN.y * 0.6 + uTime * 0.25 + vPh;
        vec3 iri = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h));
        float a = 0.06 + pow(f, 2.2) * 0.75;
        // reflet de fenêtre (le soleil sur la bulle)
        vec3 r = reflect(-normalize(vV), normalize(vN));
        float sp = pow(max(0.0, dot(r, normalize(vec3(0.4, 0.8, 0.3)))), 40.0);
        gl_FragColor = vec4(mix(iri, vec3(1.0), 0.35) * (0.9 + f * 0.4) + sp * 1.5, min(1.0, a + sp));
      }`,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
}
class Bubbles extends Fx {
  moodTo() { return { sat: 1.14, exp: 1.03, high: [0.03, 0.03, 0.07], shadow: [0.02, 0.0, 0.05], hemi: [0xf0f4ff, 0xc8b8e8], hemiMix: 0.3 }; }
  seedSpots() {
    // en l'air : on saute et on flotte pour les attraper
    const S = ringSpots(this.c, SEEDS, 3, 9.5, { seed: 313, gap: 2.4, lift: 0 });
    return seedRing(this.c, 3, 9, S.map((p, i) => ({ x: p.x, z: p.z, y: p.gy + 1.8 + (i % 4) * 0.85 })));
  }
  build() {
    const lite = this.lite;
    this.nAmb = lite ? 22 : 40;
    this.nPup = lite ? 2 : 3;
    this.bubI = this.add(inst(new THREE.SphereGeometry(1, lite ? 18 : 26, lite ? 12 : 18), bubbleMaterial(this.U), 6 + this.nAmb + this.nPup));
    this.bubI.renderOrder = 7;
    const R = rng(77);
    this.amb = Array.from({ length: this.nAmb }, (_, i) => ({ a: R() * TAU, r: 2 + R() * 13, y: R() * 8, v: 0.6 + R() * 0.9, s: 0.18 + R() * 0.5, ph: R() * 6 }));
    // des chiots qui flottent dans leur bulle
    const LOOKS = [
      { pattern: 'spots', fur: 0xfaf6f0, b2: 0x1a1414, belly: 0xffffff, ears: 'drop', tail: 'wag', collar: 0xff5a8a },
      { pattern: 'solid', fur: 0xe89a4a, belly: 0xfaf0e0, ears: 'up', earLen: 1.1, tail: 'curl', leg: 0.6, body: 1.4, collar: 0x3a8ae0 },
      { pattern: 'solid', fur: 0xf4ecdc, belly: 0xffffff, ears: 'long', tail: 'plume', fluff: 0.8, bow: 0xb07aff },
    ];
    this.pups = [];
    for (let i = 0; i < this.nPup; i++) {
      let P;
      try { P = buildPup(LOOKS[i], { lite: true }); } catch (e) { continue; }
      P.group.traverse(o => { o.userData.noOutline = true; o.castShadow = false; });
      this.add(P.group);
      this.pups.push({ P, a: i / this.nPup * TAU, ph: i * 2, anim: { t: 0, phase: 0, move: 1, run: false, sit: 0, lie: 0, wag: 1, wagF: 14, hop: 0, headYaw: 0, headPitch: -0.2, headRoll: 0, eyes: 1, earUp: 0.4, earV: 0, sad: 0 } });
    }
  }
  stop() { for (const P of this.g.players) { P.gravK = 1; } }
  step(dt, t, host) {
    if (!host || t < 0) return;
    // les chiens flottent au ralenti
    for (const P of this.g.players) {
      if (P.kart || P.ride) { P.gravK = 1; continue; }
      P.gravK = 0.2;
      if (!P.grounded && P.vel.y < -3.6) P.vel.y = -3.6;
    }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.bubI) return;
    const g = this.g, me = g.me, B = this.bubI;
    let n = 0;
    // les bulles des chiens
    for (const P of g.players) {
      if (n >= 6) break;
      const s = (P.kart ? 0 : 1.15) * popK(clamp(t + 1, 0, 1)) * k;
      setM(B, n++, P.pos.x, P.pos.y + 0.75, P.pos.z, 0, t * 0.3, 0, Math.max(0.001, s) * (1 + Math.sin(t * 4 + n) * 0.03), Math.max(0.001, s) * (1 - Math.sin(t * 4 + n) * 0.03));
    }
    // bulles qui montent tout autour
    for (const a of this.amb) {
      a.y += a.v * dt;
      if (a.y > 9) {
        if (Math.random() < 0.5 && g.juice) { const x = me.pos.x + Math.cos(a.a) * a.r, z = me.pos.z + Math.sin(a.a) * a.r; g.juice.sparkle(x, me.pos.y + a.y, z, 5, 0xffffff, a.s); }
        a.y = 0; a.a = Math.random() * TAU; a.r = 2 + Math.random() * 13;
      }
      const x = me.pos.x + Math.cos(a.a) * a.r + Math.sin(t * 1.3 + a.ph) * 0.4, z = me.pos.z + Math.sin(a.a) * a.r;
      const gy = this.gy(x, z, me.pos.y);
      const s = a.s * sst(0, 0.6, a.y) * k;
      setM(B, n++, x, gy + a.y, z, 0, 0, 0, Math.max(0.001, s));
    }
    // chiots en bulle : ils pédalent dans le vide en tournant lentement autour de la fleur
    for (const p of this.pups) {
      const a = p.a + t * 0.12, r = 6.5 + Math.sin(t * 0.3 + p.ph) * 1.5;
      const x = this.c.x + Math.cos(a) * r, z = this.c.z + Math.sin(a) * r, y = this.c.y + 2.8 + Math.sin(t * 0.8 + p.ph) * 0.9 + p.ph * 0.4;
      const s = popK(clamp(t + 0.8, 0, 1)) * k;
      p.anim.t += dt; p.anim.phase += dt * 8; p.anim.earV = Math.sin(t * 3 + p.ph) * 0.5; p.anim.headRoll = Math.sin(t * 1.2 + p.ph) * 0.3;
      posePup(p.P.rig, p.anim);
      p.P.group.position.set(x, y - 0.35, z);
      p.P.group.rotation.set(Math.sin(t + p.ph) * 0.2, -a, Math.sin(t * 0.7 + p.ph) * 0.25);
      p.P.group.scale.setScalar(Math.max(0.001, s));
      setM(B, n++, x, y, z, 0, 0, 0, Math.max(0.001, s) * 1.0);
    }
    done(B, n);
  }
  gy(x, z, y) { return L.supportAt(x, z, y + 1, 0, 0.6).y; }
}

// ===========================================================================
// 4. Les Toboggans Arc-en-ciel (Ciel)
// ===========================================================================
const RB = [0xff4a5a, 0xff9a3a, 0xffe04a, 0x5ad86a, 0x4aa8ff, 0xa06aff];
class Rainbows extends Fx {
  moodTo() { return { sat: 1.22, exp: 1.04, high: [0.04, 0.03, 0.0], bloom: 0.75 }; }
  layout() {
    if (this.slides) return this.slides;
    const c = this.c, out = [];
    // destinations : les îles voisines (sinon des points autour)
    let dests = [];
    if (L.ISLANDS) {
      dests = L.ISLANDS.filter(I => I.r >= 4 && Math.hypot(I.x - c.x, I.z - c.z) > 18 && Math.hypot(I.x - c.x, I.z - c.z) < 72 && !['cave', 'swallow', 'nest', 'souffle', 'ledge'].includes(I.id))
        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, 3);
    }
    const pts = [];
    for (const I of dests) {
      // un point sûr sur l'île, du côté de la fleur
      const d = Math.hypot(c.x - I.x, c.z - I.z), ux = (c.x - I.x) / d, uz = (c.z - I.z) / d;
      let got = null;
      for (const f of [0.35, 0.2, 0.5, 0.05]) for (const da of [0, 0.5, -0.5]) {
        if (got) break;
        const ca = Math.cos(da), sa = Math.sin(da), vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
        const x = I.x + vx * I.r * f, z = I.z + vz * I.r * f, y = spotOk(x, z, I.top, { r: 0.8, tol: 4 });
        if (y !== null) got = { x, z, y, name: I.name || '' };
      }
      if (got) pts.push(got);
    }
    pts.forEach((B, i) => {
      const d = Math.hypot(B.x - c.x, B.z - c.z), ux = (B.x - c.x) / d, uz = (B.z - c.z) / d, px = -uz, pz = ux;
      // départ : au bord de l'île de la fleur, vers la destination
      let A = null;
      for (const r of [3.2, 2.6, 4, 2]) { const x = c.x + ux * r, z = c.z + uz * r, y = spotOk(x, z, c.y, { r: 0.6 }); if (y !== null) { A = { x, z, y }; break; } }
      if (!A) return;
      for (const back of [0, 1]) {
        const off = back ? 2.8 : 0;
        const P0 = back ? { x: B.x + px * off, z: B.z + pz * off, y: groundAt(B.x + px * off, B.z + pz * off, B.y) } : A;
        // (le retour se pose au milieu de l'île de la fleur, loin des anneaux de départ)
        const bx = c.x - ux * 0.6 + px * 0.9 * (i - 1), bz = c.z - uz * 0.6 + pz * 0.9 * (i - 1);
        const P1 = back ? { x: bx, z: bz, y: groundAt(bx, bz, c.y) } : B;
        if (back && (spotOk(P0.x, P0.z, B.y, { r: 0.6, tol: 3 }) === null || spotOk(P1.x, P1.z, c.y, { r: 0.6, tol: 3 }) === null)) continue;
        const h = Math.max(P0.y, P1.y) + 7 + d * 0.14;
        const dd = Math.hypot(P1.x - P0.x, P1.z - P0.z), vx = (P1.x - P0.x) / dd, vz = (P1.z - P0.z) / dd;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(P0.x - vx * 0.5, P0.y + 0.15, P0.z - vz * 0.5),
          new THREE.Vector3(P0.x + vx * dd * 0.12, P0.y + (h - P0.y) * 0.55, P0.z + vz * dd * 0.12),
          new THREE.Vector3(P0.x + vx * dd * 0.5, h, P0.z + vz * dd * 0.5),
          new THREE.Vector3(P0.x + vx * dd * 0.86, P1.y + (h - P1.y) * 0.5, P0.z + vz * dd * 0.86),
          new THREE.Vector3(P1.x + vx * 0.4, P1.y + 0.2, P1.z + vz * 0.4),
        ], false, 'centripetal');
        out.push({ curve, len: curve.getLength(), A: P0, B: P1, back: !!back, name: B.name, i: out.length });
      }
    });
    this.slides = out;
    return out;
  }
  seedSpots() {
    const S = this.layout(), sp = [];
    for (const s of S) for (const u of (s.back ? [0.5] : [0.32, 0.68])) { const p = s.curve.getPointAt(u); sp.push({ x: p.x, y: p.y + 0.95, z: p.z }); }
    return seedRing(this.c, 2.5, 5, sp.slice(0, SEEDS));
  }
  build() {
    const S = this.layout(), lite = this.lite;
    const pos = [], col = [], au = [], idx = [];
    const W = 2.3, seg = lite ? 70 : 110;
    const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3();
    for (const s of S) {
      const base = pos.length / 3;
      const cols = RB.length + 2;   // bord blanc + 6 couleurs + bord blanc
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        s.curve.getPointAt(u, P); s.curve.getTangentAt(u, T);
        Nn.set(-T.z, 0, T.x).normalize();
        // la piste se creuse un peu (en gouttière) pour qu'on se sente tenu
        for (let j = 0; j <= cols; j++) {
          const v = j / cols * 2 - 1, off = v * W / 2, dip = (1 - v * v) * -0.18 + (Math.abs(v) > 0.9 ? 0.12 : 0);
          pos.push(P.x + Nn.x * off, P.y + dip, P.z + Nn.z * off);
          const band = clamp(Math.floor((v * 0.5 + 0.5) * cols), 0, cols - 1);
          _c.set(band === 0 || band === cols - 1 ? 0xffffff : RB[band - 1]);
          col.push(_c.r, _c.g, _c.b); au.push(u);
        }
      }
      for (let i = 0; i < seg; i++) for (let j = 0; j < cols; j++) { const a = base + i * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(au, 1));
    g.setIndex(idx); g.computeVertexNormals();
    this.uGrow = { value: 0 };
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.94, depthWrite: true, fog: false });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGrow = this.uGrow; sh.uniforms.uTime = this.U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aS; varying float vS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGrow, uTime; varying float vS;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vS > uGrow) discard;
          // reflets qui filent le long du toboggan
          float sh = smoothstep(0.85, 1.0, sin(vS * 60.0 - uTime * 7.0)) * 0.45;
          diffuseColor.rgb = diffuseColor.rgb * 1.08 + sh + smoothstep(uGrow - 0.03, uGrow, vS) * 0.8;`);
    };
    this.ribbon = this.add(new THREE.Mesh(g, m));
    this.ribbon.renderOrder = 2;
    // anneaux de départ (on monte dessus pour glisser)
    const ring = new THREE.TorusGeometry(1.0, 0.13, 8, lite ? 24 : 36).rotateX(Math.PI / 2).toNonIndexed();
    paint(ring, (x, y, z, C) => C.setHSL(((Math.atan2(z, x) / TAU) % 1 + 1) % 1, 1, 0.62));
    this.ringI = this.add(inst(ring, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), S.length));
    this.sparkle = 0;
  }
  start() { this.uGrow.value = 0; }
  stop() {
    // personne ne reste en l'air : ceux qui glissaient arrivent tout de suite
    for (const P of this.g.players) if (P.ride && P.ride.kind === 'rainbow') this.arrive(P, this.slides[P.ride.i]);
  }
  step(dt, t, host) {
    if (!host || !this.slides || t < 0.6) return;
    const g = this.g;
    for (const P of g.players) {
      if (P.ride || P.down || P.kart) continue;
      for (const s of this.slides) {
        if (Math.hypot(P.pos.x - s.A.x, P.pos.z - s.A.z) < 1.25 && Math.abs(P.pos.y - s.A.y) < 1.2 && (P.rbCd || 0) < g.t) {
          P.ride = { kind: 'rainbow', i: s.i, u: 0, v: 7, speed: 7, yaw: P.yaw, camRate: 2.6 };
          P.vel.set(0, 0, 0); P.attackT = 0; P.dashT = 0; P.gliding = false;
          g.sound('jump'); const S = g.sfx;
          if (S && S.ok) { if (S.whoosh) S.whoosh(0.8, { lo: 400, hi: 2400, vol: 0.12 }); for (let k = 0; k < 8; k++) S.note('bell', 72 + [0, 2, 4, 7, 9, 12, 14, 16][k], 0.05, k * 0.06, 0.3); }
          if (g.juice) g.juice.sparkle(P.pos.x, P.pos.y + 0.5, P.pos.z, 14, 0xffffff, 0.8);
          break;
        }
      }
    }
  }
  /** Le chien glisse : on le pose sur l'arc-en-ciel (la gravité le fait accélérer dans la descente). */
  playerStep(P, dt) {
    const R = P.ride;
    if (!R || R.kind !== 'rainbow') return false;
    const s = this.slides[R.i];
    if (!s) { P.ride = null; return false; }
    const g = this.g, c = s.curve;
    c.getTangentAt(Math.min(0.999, R.u), _v2);
    R.v = clamp(R.v - _v2.y * 26 * dt + 2 * dt, 8, 24);
    R.u += R.v * dt / s.len;
    P.invuln = Math.max(0, P.invuln - dt); P.cheerT = Math.max(0, P.cheerT - dt);
    P.grounded = true; P.gliding = false; P.attackT = 0; P.dashT = 0; P.jumps = 0;
    if (R.u >= 1) { this.arrive(P, s); return true; }
    c.getPointAt(R.u, _v);
    P.pos.set(_v.x, _v.y + 0.12, _v.z);
    P.vel.set(_v2.x * R.v, _v2.y * R.v, _v2.z * R.v);
    P.yaw = Math.atan2(_v2.x, _v2.z); R.yaw = P.yaw; R.speed = R.v;
    // traînée d'étincelles arc-en-ciel
    if (Math.random() < dt * 30) g.spawnParticle(P.pos.x + (Math.random() - 0.5) * 0.8, P.pos.y + 0.3, P.pos.z + (Math.random() - 0.5) * 0.8, -P.vel.x * 0.1, 0.6, -P.vel.z * 0.1, RB[Math.floor(Math.random() * 6)], 0.16, 0.7, -0.3, 5);
    if (P === g.me && Math.floor(R.u * 14) !== Math.floor((R.u - R.v * dt / s.len) * 14)) { const S = g.sfx; if (S && S.ok) S.note('mallet', 72 + Math.round((1 - R.u) * 12) + (_v2.y > 0 ? 7 : 0), 0.04, 0, 0.15); }
    return true;
  }
  arrive(P, s) {
    const g = this.g;
    P.ride = null; P.rbCd = g.t + 1.2;
    if (!s) return;
    s.curve.getTangentAt(0.999, _v2);
    const B = s.B, y = groundAt(B.x, B.z, B.y + 1);
    P.pos.set(B.x, y + 0.3, B.z);
    _v2.y = 0; _v2.normalize();
    P.vel.set(_v2.x * 5, 5, _v2.z * 5);
    P.grounded = false; P.jumps = 1;
    P.lastSafe.set(B.x, y, B.z); P.lastSafeT = g.t;
    P.cheerT = 1;
    if (g.juice) { g.juice.confetti(B.x, y + 1, B.z, 24, 0.8); }
    g.sound('land', 0.5);
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.ribbon) return;
    // l'arc-en-ciel se déroule, puis se ré-enroule à la fin
    this.uGrow.value = k < 1 && t > 20 ? k * 1.02 : clamp((t + 0.8) / 2.2, 0, 1.02);
    this.slides.forEach((s, i) => {
      const pulse = 1 + Math.sin(this.g.t * 4 + i) * 0.08;
      setM(this.ringI, i, s.A.x, s.A.y + 0.12 + Math.sin(this.g.t * 3 + i) * 0.05, s.A.z, 0, this.g.t * 1.5, 0, Math.max(0.001, k * pulse));
      if (Math.random() < dt * 6 * k) this.g.spawnParticle(s.A.x + (Math.random() - 0.5) * 1.6, s.A.y + 0.2, s.A.z + (Math.random() - 0.5) * 1.6, 0, 1.5, 0, RB[Math.floor(Math.random() * 6)], 0.14, 0.8, -0.2, 5);
    });
    done(this.ringI);
  }
}

// ===========================================================================
// 5. Le Pays des Bonbons (Neige)
// ===========================================================================
class Candy extends Fx {
  moodTo() { return { hemi: [0xffb8e0, 0x9af0e0], hemiMix: 0.75, sun: 0xffc0d8, sunK: 0.95, fog: 0xffc8e8, fogMix: 0.7, sky: 0xffb0e0, skyMix: 0.6, sat: 1.35, exp: 1.0, high: [0.07, 0.0, 0.045], shadow: [0.04, 0.0, 0.06], bloom: 0.7 }; }
  seedSpots() { return seedRing(this.c, 3, 10.5); }
  build() {
    const lite = this.lite, c = this.c;
    // sucre d'orge (rayé rouge et blanc, en J)
    const caneCurve = []; for (let i = 0; i <= 12; i++) caneCurve.push([0, i / 12 * 1.4, 0]);
    for (let i = 1; i <= 9; i++) { const a = i / 9 * Math.PI; caneCurve.push([-0.3 + Math.cos(a) * 0.3, 1.4 + Math.sin(a) * 0.3, 0]); }
    const cane = tubeAlong(caneCurve, 0.085, lite ? 40 : 64, lite ? 8 : 12, (u, a, C) => C.set(Math.sin(u * 46 + a) > 0.1 ? 0xe8202a : 0xfff8f8));
    // sucette : bâton + disque en spirale
    const lol = [];
    lol.push({ geo: paint(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6).translate(0, 0.75, 0).toNonIndexed(), 0xfffaf2) });
    const disk = new THREE.CylinderGeometry(0.55, 0.55, 0.14, lite ? 28 : 44, 1).rotateX(Math.PI / 2).toNonIndexed();
    paint(disk, (x, y, z, C) => { const r = Math.hypot(x, y), a = Math.atan2(y, x); C.set(Math.sin(a * 1 + r * 22) > 0 ? 0xff5aa8 : 0xfff6fb); if (r > 0.52) C.set(0xffffff); });
    lol.push({ geo: disk, y: 1.75 });
    // boule de gomme (sucre en grains)
    const gum = new THREE.LatheGeometry(Array.from({ length: 11 }, (_, i) => { const u = i / 10; return new THREE.Vector2(Math.sin(u * Math.PI * 0.5 + Math.PI * 0.5) * 0.5 * (1 - u * 0.15) + 0.0001, u * 0.62); }).concat([new THREE.Vector2(0.0001, 0.62)]), lite ? 12 : 18).toNonIndexed();
    { const p = gum.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.03 * Math.sin(p.getX(i) * 60) * Math.sin(p.getZ(i) * 60) * Math.sin(p.getY(i) * 50); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } gum.computeVertexNormals(); }
    paint(gum, (x, y, z, C) => C.setRGB(1, 1, 1).multiplyScalar(0.85 + 0.15 * y / 0.62));
    // bonhomme-guimauve
    const mm = [];
    const puff = (r, h, y) => { const g = new THREE.CylinderGeometry(r, r, h, lite ? 18 : 26, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i) / (h / 2), k = 1 - Math.pow(Math.abs(yy), 6) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); return { geo: paint(g.toNonIndexed(), (x, yy, z, C) => C.set(0xfff4f8).lerp(_c2.set(0xffd0e4), clamp(-yy / h + 0.3, 0, 1) * 0.5)), y }; };
    mm.push(puff(0.62, 0.78, 0.42), puff(0.5, 0.64, 1.12), puff(0.4, 0.56, 1.7));
    for (const sx of [-1, 1]) mm.push({ geo: paint(new THREE.SphereGeometry(0.06, 8, 6).toNonIndexed(), 0x3a1a0a), x: sx * 0.14, y: 1.8, z: 0.38, sz: 0.5 });
    for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; mm.push({ geo: paint(new THREE.SphereGeometry(0.03, 6, 4).toNonIndexed(), [0xff5a8a, 0x5ac8ff, 0xffd23a, 0x6ad86a, 0xb07aff][i]), x: Math.sin(a) * 0.17, y: 1.62 - Math.cos(a) * 0.05 + 0.05, z: 0.39 }); }
    mm.push({ geo: paint(new THREE.ConeGeometry(0.07, 0.24, 8).rotateX(Math.PI / 2).toNonIndexed(), (x, y, z, C) => C.set(z > 0.06 ? 0xfff8e0 : z > -0.02 ? 0xffb020 : 0xff7a20)), y: 1.72, z: 0.46 });
    mm.push({ geo: paint(gum.clone(), 0xff3a5a), y: 1.96, sx: 0.62, sy: 0.6, sz: 0.62 });
    for (const sx of [-1, 1]) mm.push({ geo: paint(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6).toNonIndexed(), (x, y, z, C) => C.set(Math.sin(y * 30) > 0 ? 0xd88a3a : 0xb06a2a)), x: sx * 0.72, y: 1.25, rz: sx * 1.0 });
    for (let i = 0; i < 3; i++) mm.push({ geo: paint(new THREE.SphereGeometry(0.05, 6, 4).toNonIndexed(), 0x5a2a12), y: 0.9 + i * 0.22, z: 0.5 - i * 0.012 });
    // places
    const n = (k) => Math.round(k * (lite ? 0.7 : 1));
    const all = ringSpots(c, n(10) + n(8) + n(16) + 4, 3.5, 15, { seed: 515, gap: 1.9, r: 0.6, lift: 0, tol: 2.5, flat: 1 });
    const R = rng(9);
    this.items = all.map((p, i) => ({ ...p, kind: i < 4 ? 'mm' : i < 4 + n(10) ? 'cane' : i < 4 + n(10) + n(8) ? 'lol' : 'gum', yaw: R() * TAU, s: 0.8 + R() * 0.6, d: Math.hypot(p.x - c.x, p.z - c.z), ph: R() * 6 }));
    const cnt = (k) => this.items.filter(q => q.kind === k).length;
    this.caneI = this.add(inst(cane, vmat({ rough: 0.25, glow: 0.12, rim: 0.3, key: 'kc' }), Math.max(1, cnt('cane'))));
    this.lolI = this.add(inst(merge(lol), vmat({ rough: 0.2, glow: 0.12, rim: 0.3, key: 'kl' }), Math.max(1, cnt('lol')), [0xffffff, 0xd0fff0, 0xfff4b0, 0xe8d8ff]));
    this.gumI = this.add(inst(gum, vmat({ rough: 0.75, glow: 0.22, rim: 0.4, key: 'kg' }), Math.max(1, cnt('gum')), [0xff4a6a, 0xffb02a, 0xfff04a, 0x5ae06a, 0x4ab8ff, 0xb06aff, 0xff7ad8]));
    this.mmI = this.add(inst(merge(mm), vmat({ rough: 0.85, glow: 0.14, rim: 0.25, key: 'km' }), Math.max(1, cnt('mm')), [0xffc4dc, 0xc4ffe8, 0xfff0b8, 0xe0d0ff]));
  }
  step(dt, t) {
    if (t < 0) return;
    // vermicelles de toutes les couleurs à la place des flocons
    const g = this.g, me = g.me, rate = this.lite ? 16 : 30;
    for (let i = 0; i < 2; i++) if (Math.random() < dt * rate / 2) {
      const a = Math.random() * TAU, r = Math.random() * 12;
      g.spawnParticle(me.pos.x + Math.cos(a) * r, me.pos.y + 7 + Math.random() * 3, me.pos.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.6, -1, (Math.random() - 0.5) * 0.6, [0xff5a8a, 0x5ac8ff, 0xffd23a, 0x6ad86a, 0xb07aff, 0xffffff][Math.floor(Math.random() * 6)], 0.07, 4, 0.6, 2, { drag: 0.6 });
    }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.items) return;
    const b = beatOf(this.g, t), C = { cane: 0, lol: 0, gum: 0, mm: 0 }, IM = { cane: this.caneI, lol: this.lolI, gum: this.gumI, mm: this.mmI };
    for (const it of this.items) {
      const grow = popK(clamp((t + 1.3) * 1.3 - it.d * 0.07, 0, 1)) * k, s = Math.max(0.001, grow) * it.s;
      const hop = it.kind === 'mm' ? Math.abs(Math.sin(b * Math.PI)) * 0.25 : it.kind === 'gum' ? Math.abs(Math.sin(b * Math.PI + it.ph)) * 0.12 : 0;
      const sq = it.kind === 'gum' || it.kind === 'mm' ? 1 - Math.abs(Math.cos(b * Math.PI + it.ph * (it.kind === 'gum' ? 1 : 0))) * 0.08 : 1;
      const wob = it.kind === 'cane' || it.kind === 'lol' ? Math.sin(b * Math.PI + it.ph) * 0.08 : 0;
      const yaw = it.kind === 'mm' ? Math.atan2(this.g.me.pos.x - it.x, this.g.me.pos.z - it.z) : it.yaw + (it.kind === 'lol' ? t * 0.6 : 0);
      setM(IM[it.kind], C[it.kind]++, it.x, it.gy + hop * s - 0.05, it.z, wob, yaw, it.kind === 'mm' ? Math.sin(b * Math.PI) * 0.1 : 0, s, s * sq, s);
    }
    for (const kk in IM) done(IM[kk], C[kk]);
  }
}

// ===========================================================================
// 6. Les Poissons Volants (Plage)
// ===========================================================================
const FISH_COLS = [0xff8a2a, 0x3aa8ff, 0xffd83a, 0xff5a8a, 0x5ae0c0, 0xb07aff, 0xff6a3a, 0x7ad8ff];
function fishGeometry(lite) {
  const parts = [];
  const body = new THREE.SphereGeometry(1, lite ? 14 : 20, lite ? 10 : 14);
  { const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), k = z < 0 ? 1 - Math.pow(-z, 1.6) * 0.55 : 1 - Math.pow(z, 2) * 0.25; p.setXYZ(i, p.getX(i) * 0.16 * k, p.getY(i) * 0.26 * k, z * 0.5); } body.computeVertexNormals(); }
  parts.push({ geo: paint(body.toNonIndexed(), (x, y, z, C) => { C.setRGB(1, 1, 1); if (y > 0.1) C.multiplyScalar(0.72); if (y < -0.1) C.lerp(_c2.set(0xfff8f0), 0.6); if (Math.abs(Math.sin(z * 9)) > 0.93) C.lerp(_c2.set(0xffffff), 0.85); }) });
  const tail = new THREE.ConeGeometry(0.22, 0.32, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2); tail.scale(0.25, 1, 1);
  parts.push({ geo: paint(tail.toNonIndexed(), 0xdddddd), z: -0.58 });
  const fin = new THREE.ConeGeometry(0.12, 0.26, 3).rotateX(-0.7); fin.scale(0.2, 1, 1);
  parts.push({ geo: paint(fin.toNonIndexed(), 0xcccccc), y: 0.26, z: -0.05 });
  for (const sx of [-1, 1]) {
    parts.push({ geo: paint(new THREE.SphereGeometry(0.055, 8, 6).toNonIndexed(), 0xffffff), x: sx * 0.12, y: 0.06, z: 0.3 });
    parts.push({ geo: paint(new THREE.SphereGeometry(0.03, 6, 4).toNonIndexed(), 0x0a0a14), x: sx * 0.15, y: 0.065, z: 0.32 });
    parts.push({ geo: paint(new THREE.ConeGeometry(0.07, 0.18, 3).rotateZ(sx * 1.9).toNonIndexed(), 0xdddddd), x: sx * 0.14, y: -0.07, z: 0.08 });
  }
  return merge(parts);
}
class Fish extends Fx {
  moodTo() { return { sat: 1.2, exp: 1.02, high: [0.0, 0.035, 0.06], shadow: [0.0, 0.02, 0.05], hemi: [0xd8f8ff, 0xf0e0b0], hemiMix: 0.35 }; }
  seedSpots() { return seedRing(this.c, 3, 9.5); }
  build() {
    const lite = this.lite, c = this.c;
    const geo = fishGeometry(lite);
    const wig = `{ float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
      transformed.x += sin(uTime * 11.0 + ph + transformed.z * 4.0) * 0.09 * smoothstep(0.1, -0.7, transformed.z); }`;
    this.nAir = lite ? 12 : 20; this.nJump = lite ? 8 : 14;
    this.fishI = this.add(inst(geo, vmat({ rough: 0.3, glow: 0.1, rim: 0.5, key: 'fi', wiggle: wig, uniforms: { uTime: this.U.uTime } }), this.nAir + this.nJump, FISH_COLS));
    const R = rng(66);
    this.air = Array.from({ length: this.nAir }, (_, i) => ({ r: 4.5 + R() * 6, y: 2 + R() * 3.6, w: (0.45 + R() * 0.4) * (i % 3 === 0 ? -1 : 1), a: R() * TAU, ph: R() * 6, s: 0.6 + R() * 0.5 }));
    // la mer la plus proche : des points d'eau bien profonde autour de la fleur
    this.water = [];
    for (let r = 6; r < 40 && this.water.length < 40; r += 2) for (let a = 0; a < TAU; a += 0.25) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (L.heightAt(x, z) < (L.WATER_Y || 0) - 0.9 && (!L.inWater || L.inWater(x, z))) this.water.push({ x, z });
    }
    this.jump = Array.from({ length: this.nJump }, (_, i) => ({ t: -R() * 2.5, dur: 1.5 + R() * 0.8, A: null, B: null, s: 0.9 + R() * 0.6 }));
    // des bulles qui remontent du sable
    this.bubI = this.add(inst(new THREE.SphereGeometry(1, 14, 10), bubbleMaterial(this.U), lite ? 12 : 22));
    this.bub = Array.from({ length: this.bubI.count }, () => ({ a: R() * TAU, r: 1 + R() * 9, y: R() * 6, v: 0.7 + R() * 0.8, s: 0.08 + R() * 0.2 }));
    this.bubI.renderOrder = 7;
  }
  newJump(j) {
    const W = this.water, me = this.g.me;
    if (W.length < 2) { j.A = null; return; }
    // une eau pas trop loin du chien, et une autre un peu plus loin : l'arc passe au-dessus de la plage
    const near = W.slice().sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z)).slice(0, 14);
    const A = near[Math.floor(Math.random() * near.length)];
    const cand = W.filter(p => { const d = Math.hypot(p.x - A.x, p.z - A.z); return d > 6 && d < 16; });
    const B = cand.length ? cand[Math.floor(Math.random() * cand.length)] : W[Math.floor(Math.random() * W.length)];
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, tx = me.pos.x - mx, tz = me.pos.z - mz, tl = Math.hypot(tx, tz) || 1;
    j.A = A; j.B = B; j.C = { x: mx + tx / tl * Math.min(tl * 0.8, 9), z: mz + tz / tl * Math.min(tl * 0.8, 9) };
    j.h = 5 + Math.random() * 4; j.t = 0; j.dur = 1.5 + Math.random() * 0.8; j.splashed = 0;
  }
  splash(x, z) {
    const g = this.g, y = L.WATER_Y || 0;
    for (let i = 0; i < 8; i++) { const a = Math.random() * TAU; g.spawnParticle(x, y + 0.1, z, Math.cos(a) * 2, 3 + Math.random() * 2, Math.sin(a) * 2, 0xe8f8ff, 0.16 + Math.random() * 0.1, 0.6, 9); }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.fishI) return;
    const g = this.g, me = g.me, F = this.fishI;
    if (!this.mid) this.mid = me.pos.clone();
    this.mid.lerp(me.pos, Math.min(1, dt * 0.8));
    let n = 0;
    // le banc qui nage dans le ciel autour du chien
    for (const f of this.air) {
      const a = f.a + t * f.w, s = Math.max(0.001, popK(clamp(t + 1.2 - f.r * 0.05, 0, 1)) * k * f.s);
      const x = this.mid.x + Math.cos(a) * f.r, z = this.mid.z + Math.sin(a) * f.r, y = this.mid.y + f.y + Math.sin(t * 1.5 + f.ph) * 0.5;
      const yaw = Math.atan2(-Math.sin(a) * f.w, Math.cos(a) * f.w);
      setM(F, n++, x, y, z, Math.cos(t * 1.5 + f.ph) * -0.25, yaw, Math.sin(t * 2 + f.ph) * 0.15, s);
    }
    // les sauteurs : de l'eau à l'eau en passant au-dessus de la plage
    for (const j of this.jump) {
      j.t += dt;
      if (!j.A || j.t > j.dur) { if (j.t > j.dur + 0.3 || !j.A) this.newJump(j); setM(F, n++, 0, -999, 0, 0, 0, 0, 0.001); continue; }
      if (j.t < 0) { setM(F, n++, 0, -999, 0, 0, 0, 0, 0.001); continue; }
      const u = j.t / j.dur, w = L.WATER_Y || 0;
      const x = (1 - u) * (1 - u) * j.A.x + 2 * (1 - u) * u * j.C.x + u * u * j.B.x, z = (1 - u) * (1 - u) * j.A.z + 2 * (1 - u) * u * j.C.z + u * u * j.B.z;
      const y = w - 0.4 + 4 * u * (1 - u) * j.h;
      const dx = 2 * (1 - u) * (j.C.x - j.A.x) + 2 * u * (j.B.x - j.C.x), dz = 2 * (1 - u) * (j.C.z - j.A.z) + 2 * u * (j.B.z - j.C.z), dy = 4 * (1 - 2 * u) * j.h;
      if (u > 0.04 && !(j.splashed & 1)) { j.splashed |= 1; this.splash(j.A.x, j.A.z); }
      if (u > 0.96 && !(j.splashed & 2)) { j.splashed |= 2; this.splash(j.B.x, j.B.z); }
      setM(F, n++, x, y, z, -Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, j.s * k);
    }
    done(F, n);
    // bulles
    let m = 0;
    for (const b of this.bub) {
      b.y += b.v * dt; if (b.y > 6) { b.y = 0; b.a = Math.random() * TAU; b.r = 1 + Math.random() * 9; }
      const x = this.mid.x + Math.cos(b.a) * b.r, z = this.mid.z + Math.sin(b.a) * b.r;
      setM(this.bubI, m++, x + Math.sin(t * 2 + b.a) * 0.2, L.supportAt(x, z, me.pos.y + 2, 0, 0.6).y + b.y, z, 0, 0, 0, Math.max(0.001, b.s * k * sst(0, 0.5, b.y)));
    }
    done(this.bubI, m);
  }
}

// ===========================================================================
// 7. La Grande Parade (Ferme)
// ===========================================================================
function partyHat(col) {
  const g = new THREE.ConeGeometry(0.16, 0.42, 12).translate(0, 0.21, 0).toNonIndexed();
  paint(g, (x, y, z, C) => C.set(Math.sin(y * 28 + Math.atan2(z, x) * 2) > 0 ? col : 0xffffff));
  const pom = paint(new THREE.SphereGeometry(0.06, 8, 6).toNonIndexed(), 0xffd23a); pom.translate(0, 0.44, 0);
  return merge([{ geo: g }, { geo: pom }]);
}
/** Un animal de la ferme, debout sur ses pattes arrière (cuit en une seule géométrie). */
function standing(group, ud, o) {
  const a = o.a;
  if (ud.head) { ud.head.rotation.x += a * (o.headK === undefined ? 1 : o.headK); if (o.hat) { const h = new THREE.Mesh(partyHat(o.hatCol), new THREE.MeshBasicMaterial()); h.position.set(0, o.hatY, o.hatZ || 0); h.rotation.x = -0.25; ud.head.add(h); } }
  if (ud.tail) ud.tail.rotation.x += a;
  (ud.legs || []).forEach((l, i) => { if (i >= 2) l.rotation.x += a; else { l.rotation.x += a * 0.25; l.rotation.z = (i ? -1 : 1) * 0.5; } });
  group.rotation.x = -a;
  const g = bake(group);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeBoundingBox();
  return g;
}
function sheepGroup(lite) {
  const sg = FK.sheepGeos(lite), mat = FK.vmat();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sg.wool, mat));
  const head = new THREE.Group(); head.position.set(0, 0.98, 0.66); head.rotation.x = 0.2; head.add(new THREE.Mesh(sg.head, mat)); g.add(head);
  const legs = [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.3], [0.2, -0.3]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, 0.52, z); l.add(new THREE.Mesh(sg.leg, mat)); g.add(l); return l; });
  g.userData = { head, legs };
  return g;
}
class Parade extends Fx {
  moodTo() { return { sat: 1.2, exp: 1.03, high: [0.05, 0.03, 0.0], hemi: [0xfff4e0, 0xd8b070], hemiMix: 0.3 }; }
  radius() {
    if (this.R) return this.R;
    // le plus grand cercle libre autour de la fleur (entre 5 et 8 m)
    for (const R of [7, 6.2, 8, 5.5, 5, 4.4]) {
      let ok = 0; const N = 28;
      for (let i = 0; i < N; i++) { const a = i / N * TAU; if (spotOk(this.c.x + Math.cos(a) * R, this.c.z + Math.sin(a) * R, this.c.y, { r: 0.7, tol: 1.6 }) !== null) ok++; }
      if (ok >= N - 1) { this.R = R; return R; }
    }
    this.R = 4.4; return this.R;
  }
  seedSpots() {
    const R = this.radius(), sp = [];
    for (let i = 0; i < SEEDS; i++) { const a = i / SEEDS * TAU + 0.2, x = this.c.x + Math.cos(a) * R, z = this.c.z + Math.sin(a) * R; sp.push({ x, z, y: groundAt(x, z, this.c.y) + 0.75 }); }
    return seedRing(this.c, 2, R - 1, sp);
  }
  build() {
    const lite = this.lite;
    const geo = {};
    try {
      const cow = FK.buildCow({ flowers: true, bell: true }); geo.cow = standing(cow, cow.userData, { a: 1.2, hat: true, hatCol: 0xff4a6a, hatY: 0.32, hatZ: -0.05 });
      const pig = FK.buildPig({ bow: true }); pig.scale.setScalar(1); geo.pig = standing(pig, pig.userData, { a: 1.25, hat: true, hatCol: 0x4aa8ff, hatY: 0.3 });
      const sh = sheepGroup(lite); geo.sheep = standing(sh, sh.userData, { a: 1.15, hat: true, hatCol: 0x6ad86a, hatY: 0.18, hatZ: 0.05 });
      geo.hen = merge([{ geo: FK.henGeo() }, { geo: partyHat(0xb07aff), y: 0.66, z: 0.12, sx: 0.5 }]);
    } catch (e) { console.error(e); return; }
    const order = ['hen', 'hen', 'pig', 'sheep', 'cow', 'hen', 'pig', 'sheep', 'cow', 'hen', 'sheep', 'pig'].slice(0, lite ? 9 : 12);
    this.march = order.map((k, i) => ({ k, i, s: k === 'hen' ? 1.8 : k === 'pig' ? 1.1 : 1 }));
    const mat = vmat({ rough: 0.75, glow: 0.04, rim: 0.12, key: 'pa' });
    this.IM = {};
    for (const k of ['cow', 'pig', 'sheep', 'hen']) this.IM[k] = this.add(inst(geo[k], mat, this.march.filter(m => m.k === k).length));
    // ombres douces sous les pattes
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const x = sc.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.shI = this.add(inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.35, depthWrite: false, color: 0x1a1008 }), this.march.length));
  }
  stop() { danceFoliage(0, 0); }
  step(dt, t) {
    if (t < 0 || !this.march) return;
    const g = this.g;
    this.boomT = (this.boomT || 0) - dt;
    if (this.boomT <= 0 && g.juice) { this.boomT = 2.4; const a = Math.random() * TAU, R = this.radius() + 1.5; g.juice.confetti(this.c.x + Math.cos(a) * R, this.c.y + 0.5, this.c.z + Math.sin(a) * R, 30, 0.9); }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.march) return;
    const g = this.g, b = beatOf(g, t), R = this.radius(), N = this.march.length, C = { cow: 0, pig: 0, sheep: 0, hen: 0 };
    danceFoliage(k * 0.55, b * Math.PI);
    // on entre en marchant (depuis le centre, en spirale), puis on fait le tour en rythme
    const w = 0.32;
    this.march.forEach((m, i) => {
      const enter = sst(0, 1, (t + 1.2) * 0.9 - i * 0.12);
      const a = -t * w + i / N * TAU, r = R * (0.25 + 0.75 * enter);
      const x = this.c.x + Math.cos(a) * r, z = this.c.z + Math.sin(a) * r, y = groundAt(x, z, this.c.y);
      const step = Math.abs(Math.sin(b * Math.PI + i * 0.5)), hop = step * (m.k === 'hen' ? 0.18 : 0.22);
      const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI;   // dans le sens de la marche
      const s = Math.max(0.001, k * popK(clamp(enter * 1.5, 0, 1))) * m.s;
      setM(this.IM[m.k], C[m.k]++, x, y + hop * s, z, Math.sin(b * Math.PI * 2) * 0.04, yaw, Math.sin(b * Math.PI + i) * 0.14, s, s * (1 - step * 0.04), s);
      setM(this.shI, i, x, y + 0.04, z, 0, 0, 0, s * (m.k === 'cow' ? 1.6 : m.k === 'hen' ? 0.6 : 1.1));
    });
    for (const kk in this.IM) done(this.IM[kk], C[kk]);
    done(this.shI, N);
  }
}

// ===========================================================================
// 8. Les Tableaux Vivants (Château)
// ===========================================================================
/** Planche de 4 images : le chat du tableau (neutre, coucou à gauche, coucou à droite, clin d'œil). */
function catSheet() {
  const W = 256, H = 338, c = document.createElement('canvas'); c.width = W * 4; c.height = H;
  const x = c.getContext('2d');
  for (let f = 0; f < 4; f++) {
    x.save(); x.translate(f * W, 0);
    const bg = x.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.45, H * 0.75);
    bg.addColorStop(0, '#fff4e4'); bg.addColorStop(0.6, '#d8b890'); bg.addColorStop(1, '#5a4030'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${i % 2 ? '255,240,210' : '80,50,20'},${0.04 + (i % 5) * 0.008})`; x.beginPath(); x.ellipse((i * 73) % W, (i * 131) % H, 10 + (i % 7) * 3, 3 + (i % 3), i, 0, 7); x.fill(); }
    // étincelles magiques dans le tableau
    for (let i = 0; i < 9; i++) { const sx = (i * 61 + f * 37) % W, sy = (i * 97 + f * 53) % (H * 0.6); x.fillStyle = 'rgba(255,255,220,0.8)'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, r = k % 2 ? 2 : 7; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.fill(); }
    const cx = W / 2, ey = H * 0.36;
    // corps (manteau royal) et col d'hermine
    x.fillStyle = '#8a2a8a'; x.beginPath(); x.ellipse(cx, H * 1.02, W * 0.48, H * 0.36, 0, 0, 7); x.fill();
    x.fillStyle = '#f8f4ec'; x.beginPath(); x.ellipse(cx, H * 0.72, W * 0.32, H * 0.07, 0, 0, 7); x.fill();
    x.fillStyle = '#1a1414'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(cx - W * 0.26 + i * W * 0.065, H * 0.72 + (i % 2) * 6, 2.5, 5, 0, 0, 7); x.fill(); }
    // la patte qui fait coucou (images 1 et 2)
    const paw = (side, up) => {
      const px = cx + side * W * 0.36, py = up ? H * 0.42 : H * 0.62;
      x.strokeStyle = '#e8963a'; x.lineWidth = 26; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx + side * W * 0.22, H * 0.8); x.quadraticCurveTo(cx + side * W * 0.42, H * 0.7, px, py); x.stroke();
      x.fillStyle = '#f8b860'; x.beginPath(); x.arc(px, py, 20, 0, 7); x.fill();
      x.fillStyle = '#f4a0b0'; x.beginPath(); x.arc(px, py + 3, 8, 0, 7); x.fill();
      for (let k = -1; k <= 1; k++) { x.beginPath(); x.arc(px + k * 9, py - 10, 4.5, 0, 7); x.fill(); }
      // petits traits de mouvement
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(px, py, 30 + k * 7, side > 0 ? -1.2 : Math.PI + 0.2, side > 0 ? -0.2 : Math.PI + 1.2); x.stroke(); }
    };
    if (f === 1) paw(-1, true);
    if (f === 2) paw(1, true);
    // la tête
    x.fillStyle = '#e8963a';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * W * 0.12, ey - H * 0.12); x.lineTo(cx + s * W * 0.31, ey - H * 0.25 + (f === 3 && s > 0 ? 8 : 0)); x.lineTo(cx + s * W * 0.32, ey - H * 0.02); x.fill(); }
    x.fillStyle = '#f4a8b8'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * W * 0.16, ey - H * 0.12); x.lineTo(cx + s * W * 0.27, ey - H * 0.2); x.lineTo(cx + s * W * 0.27, ey - H * 0.07); x.fill(); }
    const hg = x.createRadialGradient(cx - 20, ey - 10, 10, cx, ey + 10, W * 0.33);
    hg.addColorStop(0, '#fcc070'); hg.addColorStop(1, '#c86a20'); x.fillStyle = hg;
    x.beginPath(); x.ellipse(cx, ey + H * 0.05, W * 0.31, H * 0.2, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(140,60,10,0.55)'; x.lineWidth = 5;
    for (const s of [-1, 0, 1]) { x.beginPath(); x.moveTo(cx + s * 16, ey - H * 0.13); x.lineTo(cx + s * 12, ey - H * 0.06); x.stroke(); }
    x.fillStyle = '#fff4e4'; x.beginPath(); x.ellipse(cx, ey + H * 0.12, W * 0.14, H * 0.075, 0, 0, 7); x.fill();
    x.fillStyle = '#e07a8a'; x.beginPath(); x.moveTo(cx - 9, ey + H * 0.08); x.lineTo(cx + 9, ey + H * 0.08); x.lineTo(cx, ey + H * 0.105); x.fill();
    // grand sourire (bouche ouverte quand il fait coucou)
    x.strokeStyle = '#5a2010'; x.lineWidth = 3.5;
    if (f === 1 || f === 2) { x.fillStyle = '#7a1a2a'; x.beginPath(); x.ellipse(cx, ey + H * 0.14, 16, 11, 0, 0, Math.PI); x.fill(); x.fillStyle = '#ff7a9a'; x.beginPath(); x.ellipse(cx, ey + H * 0.155, 9, 5, 0, 0, Math.PI); x.fill(); }
    else { x.beginPath(); x.arc(cx - 9, ey + H * 0.11, 9, 0.2, Math.PI - 0.2); x.stroke(); x.beginPath(); x.arc(cx + 9, ey + H * 0.11, 9, 0.2, Math.PI - 0.2); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(cx + s * 24, ey + H * 0.12 + k * 5); x.lineTo(cx + s * 82, ey + H * 0.1 + k * 9); x.stroke(); }
    // les yeux : grands, brillants (clin d'œil sur l'image 3)
    for (const s of [-1, 1]) {
      const exx = cx + s * W * 0.13;
      if (f === 3 && s > 0) { x.strokeStyle = '#3a1a08'; x.lineWidth = 5; x.beginPath(); x.arc(exx, ey + 4, 13, Math.PI + 0.3, -0.3); x.stroke(); continue; }
      x.fillStyle = '#fffdf4'; x.beginPath(); x.ellipse(exx, ey, 18, 17, 0, 0, 7); x.fill(); x.strokeStyle = '#5a3010'; x.lineWidth = 2.5; x.stroke();
      x.fillStyle = '#4a8a3a'; x.beginPath(); x.ellipse(exx + s * 2, ey + 2, 11, 13, 0, 0, 7); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(exx + s * 2, ey + 2, 5, 10, 0, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(exx - 3, ey - 5, 4.5, 0, 7); x.fill(); x.beginPath(); x.arc(exx + 5, ey + 6, 2, 0, 7); x.fill();
    }
    // joues roses
    x.fillStyle = 'rgba(255,120,150,0.45)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * W * 0.2, ey + H * 0.1, 14, 8, 0, 0, 7); x.fill(); }
    // la couronne
    x.fillStyle = '#ffd23a'; x.beginPath(); x.moveTo(cx - 30, ey - H * 0.14); for (let i = 0; i <= 4; i++) x.lineTo(cx - 30 + i * 15, ey - H * (i % 2 ? 0.16 : 0.24)); x.lineTo(cx + 30, ey - H * 0.14); x.fill();
    x.fillStyle = '#ff4a6a'; x.beginPath(); x.arc(cx, ey - H * 0.17, 4, 0, 7); x.fill();
    const vg = x.createRadialGradient(cx, H / 2, H * 0.3, cx, H / 2, H * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,0.42)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const CASTLE_PORTRAITS = [
  [-21.08, 2.5, Math.PI / 2, 0xffe0c0], [-21.08, 8.6, Math.PI / 2, 0xd8e8ff], [21.08, 6.5, -Math.PI / 2, 0xffd0e0],
  [-17.5, -14.92, Math.PI, 0xe0ffd8], [12.2, -14.92, Math.PI, 0xffe8b0], [-15, -33.08, 0, 0xd8d8ff], [15, -33.08, 0, 0xffd8c8],
  [21.08, -63.5, -Math.PI / 2, 0xffe0c0], [-21.08, -58.5, Math.PI / 2, 0xe8d8ff],
];
class Portraits extends Fx {
  moodTo() { return { sat: 1.18, exp: 1.04, high: [0.05, 0.02, 0.05], hemi: [0xfff0e0, 0xc8a0e0], hemiMix: 0.25, bloom: 0.7 }; }
  seedSpots() { return seedRing(this.c, 2.5, 8); }
  build() {
    const lite = this.lite, c = this.c;
    const ground = (x, z) => Math.max(L.heightAt(x, z), L.WATER_Y === undefined ? -99 : L.WATER_Y);
    // les vrais tableaux du château (level8life.js) + des tableaux qui flottent autour de la fleur
    this.walls = L.ID === 8 ? CASTLE_PORTRAITS.map(([x, z, rot, tint], i) => ({ x, z, y: ground(x, z) + 2.2, rot, tint, i })) : [];
    const nf = lite ? 4 : 6;
    this.floats = Array.from({ length: nf }, (_, i) => ({ a: i / nf * TAU, tint: [0xffe0c0, 0xd8e8ff, 0xffd0e0, 0xe0ffd8, 0xffe8b0, 0xe8d8ff][i % 6], i: this.walls.length + i }));
    const n = this.walls.length + nf;
    this.uT = { value: 0 };
    const m = new THREE.MeshBasicMaterial({ map: catSheet(), fog: false });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          {
            float id = float(gl_InstanceID);
            float k = floor(mod(uT * 4.0 + id * 2.7, 10.0));
            // coucou, coucou, coucou… un clin d'œil, puis on regarde
            float fr = k < 1.0 ? 0.0 : k < 6.0 ? 1.0 + mod(k, 2.0) : k < 7.0 ? 3.0 : 0.0;
            vMapUv = vec2((vMapUv.x + fr) * 0.25, vMapUv.y);
          }`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.z += sin(uT * 3.0 + float(gl_InstanceID)) * 0.03 * (1.0 - length(position.xy) * 0.9);');
    };
    m.customProgramCacheKey = () => 'wfx-portrait';
    const plane = new THREE.PlaneGeometry(1.14, 1.5, 4, 4);
    this.picI = this.add(inst(plane, m, n, [...this.walls.map(w => w.tint), ...this.floats.map(f => f.tint)]));
    // cadres dorés des tableaux qui flottent
    const fr = [];
    for (const [x, y, w, h] of [[0, 0.82, 1.36, 0.16], [0, -0.82, 1.36, 0.16], [-0.62, 0, 0.14, 1.6], [0.62, 0, 0.14, 1.6]]) fr.push({ geo: paint(new THREE.BoxGeometry(w, h, 0.1).toNonIndexed(), 0xe8b030), x, y, z: -0.03 });
    for (const [x, y] of [[-0.62, 0.82], [0.62, 0.82], [-0.62, -0.82], [0.62, -0.82]]) fr.push({ geo: paint(new THREE.SphereGeometry(0.1, 8, 6).toNonIndexed(), 0xffd860), x, y, z: 0 });
    fr.push({ geo: paint(new THREE.PlaneGeometry(1.2, 1.6).toNonIndexed(), 0x3a2010), z: -0.06 });
    this.frameI = this.add(inst(merge(fr), Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }), { userData: { keepPBR: true } }), nf));
    this.meowT = 1.5;
  }
  step(dt, t) {
    if (t < 0 || !this.walls) return;
    // un chat miaule de temps en temps (le plus proche du chien)
    this.meowT -= dt;
    if (this.meowT <= 0) {
      this.meowT = 2.2 + Math.random() * 1.6;
      const g = this.g, me = g.me, all = [...this.walls, ...this.floats.map(f => f.pos).filter(Boolean)];
      const near = all.filter(p => p && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 16);
      if (near.length && g.sfx && g.sfx.meow) g.sfx.meow(1 + Math.random() * 0.3);
      const p = near[Math.floor(Math.random() * near.length)];
      if (p && g.juice) g.juice.sparkle(p.x, p.y + 0.3, p.z, 10, 0xfff0a0, 0.6);
    }
  }
  render(dt, t, k) {
    super.render(dt, t, k);
    if (!this.picI) return;
    this.uT.value = this.g.t;
    const g = this.g, P = this.picI, b = beatOf(g, t);
    let n = 0;
    for (const w of this.walls) {
      const off = 0.1, cx = w.x + Math.sin(w.rot) * off, cz = w.z + Math.cos(w.rot) * off;
      setM(P, n++, cx, w.y, cz, 0, w.rot, Math.sin(b * Math.PI + w.i) * 0.04 * k, Math.max(0.001, k), Math.max(0.001, k), 1);
    }
    this.floats.forEach((f, i) => {
      const grow = popK(clamp((t + 1.2) * 1.2 - i * 0.15, 0, 1)) * k, s = Math.max(0.001, grow);
      const a = f.a + t * 0.18, R = 4.6;
      const x = this.c.x + Math.cos(a) * R, z = this.c.z + Math.sin(a) * R, y = this.c.y + 2.3 + Math.sin(t * 1.4 + i) * 0.35;
      const cam = g.camera.position, yaw = Math.atan2(cam.x - x, cam.z - z), roll = Math.sin(b * Math.PI + i) * 0.08;   // toujours tournés vers nous
      f.pos = { x, y, z };
      setM(P, n++, x + Math.sin(yaw) * 0.02, y, z + Math.cos(yaw) * 0.02, 0, yaw, roll, s);
      setM(this.frameI, i, x, y, z, 0, yaw, roll, s);
    });
    done(P, n); done(this.frameI, this.floats.length);
  }
}

// ---------------------------------------------------------------------------
const KINDS = { choir: Choir, mushrooms: Mushrooms, bubbles: Bubbles, rainbows: Rainbows, candy: Candy, fish: Fish, parade: Parade, portraits: Portraits };
/** La merveille du monde (kind : voir wonderdata.js). */
export function makeFx(kind, ctx) { const K = KINDS[kind] || Choir; return new K(ctx); }
