/*
 * Matcha & Ainu — la couche de vie : nouveaux modèles réutilisables (parc, jardins, mares…).
 *
 * Bêtes : canards et canetons, grenouilles, papillons, hérissons, chiens du parc.
 * Objets : buissons et arbustes en vrai feuillage, massifs de fleurs, tas de feuilles mortes,
 * flaques d'eau, arroseurs, bains d'oiseaux en pierre, champignons géants, trampolines,
 * ballons de plage, boules de pétanque (acier), tuyaux musicaux, chariot de glaces,
 * machine à bulles, ballons, frisbees, taupinières, ronds dans l'eau.
 * Outils des habitants : cerf-volant, accordéon, râteau, bouquet de ballons, pain, cornet, boule.
 *
 * Tout ce qui peut avoir une vraie matière en a une (feuillage et écorce des arbres du jeu,
 * terre, pierre et bois photographiés — realtex.js) ; le reste reçoit un léger grain
 * (grainMaterial) pour ne pas faire « jouet en plastique ».
 * life.js fusionne ces modèles dans les siens.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as RT from './realtex.js';
import * as W from './world.js';
import * as FOL from './foliage.js';
import * as FACE from './lifeface.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** Pièce peinte et placée (garde les UV, pour les matières photo). */
function P(geo, color, o) {
  o = o || {};
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color === undefined ? 0xffffff : color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), _s.set(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1));
  g.applyMatrix4(_m);
  if (o.uv) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, o.uv[0] + u.getX(i) * o.uv[2], o.uv[1] + u.getY(i) * o.uv[3]); }
  if (o.rig) FACE.tag(g, o.rig[0], o.rig[1], o.rig[2], o.rig[3]);   // (pièce animée : œil qui cligne… — lifeface.js)
  return g;
}
/** Fusionne des pièces ; groups = [[pièces du matériau 0], [pièces du matériau 1], …]. */
function mergeG(groups) {
  if (!Array.isArray(groups[0])) groups = [groups];
  const out = new THREE.BufferGeometry();
  const all = groups.flat();
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    let n = 0; for (const g of all) n += g.attributes[name].count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of all) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  if (groups.length > 1) { let s = 0; groups.forEach((list, i) => { let n = 0; for (const g of list) n += g.attributes.position.count; out.addGroup(s, n, i); s += n; }); }
  FACE.mergeRig(all, out);
  out.computeBoundingSphere();
  return out;
}
const sph = (r, w, h, ...a) => new THREE.SphereGeometry(r, w || 8, h || 6, ...a);
const cyl = (a, b, h, n, ...o) => new THREE.CylinderGeometry(a, b, h, n || 6, ...o);
const cone = (r, h, n) => new THREE.ConeGeometry(r, h, n || 6);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tor = (r, t, a, b, arc) => new THREE.TorusGeometry(r, t, a || 6, b || 16, arc);
const eyes = (x, y, z, r) => [P(sph(r, 6, 4), 0x141414, { x, y, z, rig: [FACE.RIG.EYE, x, y, z] }), P(sph(r, 6, 4), 0x141414, { x: -x, y, z, rig: [FACE.RIG.EYE, -x, y, z] }), P(sph(r * 0.35, 4, 3), 0xffffff, { x: x + r * 0.3, y: y + r * 0.4, z: z + r * 0.6, rig: [FACE.RIG.EYE, x, y, z] }), P(sph(r * 0.35, 4, 3), 0xffffff, { x: -x + r * 0.3, y: y + r * 0.4, z: z + r * 0.6, rig: [FACE.RIG.EYE, -x, y, z] })];
const wing = (len, w, col, spots) => {
  const parts = [P(sph(0.5, 8, 4), col, { x: len * 0.5, sx: len, sy: 0.18 * w, sz: w })];
  if (spots) parts.push(P(sph(0.5, 6, 3), spots, { x: len * 0.62, y: 0.02 * w, sx: len * 0.35, sy: 0.12 * w, sz: w * 0.35 }));
  return mergeG(parts);
};

// ---------------------------------------------------------------------------
// Matières
// ---------------------------------------------------------------------------
const cache = {};
const once = (k, fn) => cache[k] || (cache[k] = fn());
/**
 * Couleurs par sommet + un grain doux (bruit en coordonnées locales : il suit la bête) :
 * pelage, plumes, bois peint… plus de surface lisse « plastique ».
 */
export function grainMaterial(opts = {}) {
  const k = 'grain' + (opts.side ? 'd' : '') + (opts.rough || '');
  return once(k, () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.rough || 0.86, side: opts.side ? THREE.DoubleSide : THREE.FrontSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vGrainP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainP = position;');
      sh.fragmentShader = `varying vec3 vGrainP;
        float gHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float gNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
        ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float g1 = gNoise(vGrainP * 14.0), g2 = gNoise(vGrainP * vec3(60.0, 18.0, 60.0)), g3 = gNoise(vGrainP * 3.0);
          diffuseColor.rgb *= 0.8 + g1 * 0.16 + g2 * 0.12 + g3 * 0.08;
        }`);
    };
    m.customProgramCacheKey = () => 'life-grain';
    return m;
  });
}
const photoMat = (name, rx, ry, extra) => {
  const ph = RT.hasPhotos() ? RT.photo(name, rx, ry) : null;
  return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.95, map: ph ? ph.map : null, normalMap: ph ? ph.normalMap : null }, extra || {}));
};
export const barkMat = () => once('bark', () => photoMat('bark_willow_02', 1, 2));
export const soilMat = () => once('soil', () => photoMat('forest_ground_04', 1, 1));
export const stoneMat = () => once('stone', () => photoMat('mossy_rock', 1, 1, { roughness: 0.9 }));
export const woodMat = () => once('wood', () => photoMat('brown_planks_03', 1, 1, { roughness: 0.8 }));
export const leafMat = () => W.leafMaterial();
export const metalMat = () => once('metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.92, roughness: 0.28 }));
export const paintMetalMat = () => once('pmetal', () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.38 }));
export const glossMat = () => once('gloss', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.05 }));
export const waterMat = () => once('water', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
export const rippleMat = () => once('ripple', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
export const bubbleMat = () => once('bubble', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.45, depthWrite: false }));

/** Planche de fleurs (canevas : pétales en dégradés, cœurs, tiges) + terre photo. */
function flowerAtlas() {
  return once('flowerAtlas', () => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    // moitié gauche : la terre (photo si chargée)
    const soil = RT.photoImage('forest_ground_04_d');
    if (soil) x.drawImage(soil, 0, 0, 256, 256); else { x.fillStyle = '#5a4430'; x.fillRect(0, 0, 256, 256); }
    let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    x.fillStyle = 'rgba(60,40,24,0.25)'; x.fillRect(0, 0, 256, 256);
    // moitié droite : touffe de fleurs détourée (tiges, feuilles, corolles)
    const cols = [['#ff4a6a', '#ffd0d8'], ['#ffd23a', '#fff6c0'], ['#a070ff', '#e8d8ff'], ['#ff8a2a', '#ffe0b0'], ['#ffffff', '#fff8e0'], ['#ff6ab0', '#ffe0f0']];
    for (let i = 0; i < 26; i++) {
      const bx = 268 + r() * 232, by = 120 + r() * 124;
      x.strokeStyle = `rgb(${50 + r() * 30},${110 + r() * 40},${40 + r() * 20})`; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(bx, 256); x.quadraticCurveTo(bx + (r() - 0.5) * 30, (by + 256) / 2, bx, by); x.stroke();
      x.fillStyle = '#3e8a2e'; x.beginPath(); x.ellipse(bx + 7, by + 40, 4, 11, 0.6, 0, TAU); x.fill();
    }
    for (let i = 0; i < 30; i++) {
      const bx = 266 + r() * 236, by = 20 + r() * 150, s = 9 + r() * 9, [a, b] = cols[i % cols.length];
      for (let p = 0; p < 6; p++) {
        const an = p / 6 * TAU + r() * 0.3;
        const g = x.createRadialGradient(bx, by, 1, bx + Math.cos(an) * s * 0.6, by + Math.sin(an) * s * 0.6, s);
        g.addColorStop(0, b); g.addColorStop(1, a);
        x.fillStyle = g; x.beginPath(); x.ellipse(bx + Math.cos(an) * s * 0.55, by + Math.sin(an) * s * 0.55, s * 0.55, s * 0.32, an, 0, TAU); x.fill();
      }
      x.fillStyle = i % 3 ? '#f0b020' : '#5a3a1a'; x.beginPath(); x.arc(bx, by, s * 0.28, 0, TAU); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  });
}
/** Planche de feuilles mortes (les vraies feuilles du jeu, roussies). */
function autumnMat() {
  return once('autumn', () => {
    const im = RT.photoImage('leaves');
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    let seed = 21; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 60; i++) {
      const cx = 20 + r() * 216, cy = 20 + r() * 216, s = 26 + r() * 30, a = r() * TAU;
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.filter = `hue-rotate(${-(60 + r() * 50).toFixed(0)}deg) saturate(${(1.3 + r() * 0.6).toFixed(2)}) brightness(${(0.8 + r() * 0.5).toFixed(2)})`;
      if (im) { const k = Math.floor(r() * 5); x.drawImage(im, k * 205, 0, 205, 470, -s * 0.22, -s * 0.5, s * 0.44, s); }
      else { x.fillStyle = ['#c8642a', '#e0a030', '#a0401a', '#d88a3a'][i % 4]; x.beginPath(); x.ellipse(0, 0, s * 0.2, s * 0.45, 0, 0, TAU); x.fill(); }
      x.restore();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
  });
}
function beachMat() {
  return once('beach', () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    const cols = ['#e8402e', '#ffffff', '#2a7ae0', '#ffffff', '#ffc020', '#ffffff'];
    cols.forEach((k, i) => { x.fillStyle = k; x.fillRect(i * 256 / 6, 0, 256 / 6 + 1, 128); });
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 118, 256, 10);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.32, vertexColors: true });
  });
}

/** Touffe de feuillage (géométrie des arbres du jeu), avec UV vides pour aller avec l'écorce. */
function leafBlob(detail, o) {
  const g = W.leafClusterGeo(detail);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  // (les arbres du jeu reçoivent leur vert par objet ; ici il est dans la géométrie)
  const col = g.attributes.color, t = new THREE.Color(o.tint === undefined ? 0x5aa63e : o.tint);
  for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) * t.r, col.getY(i) * t.g, col.getZ(i) * t.b);
  _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, 0)), _s.set(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1));
  g.applyMatrix4(_m);
  return g;
}
const LITE = () => document.documentElement.classList.contains('touch');

// ---------------------------------------------------------------------------
// Bêtes (pieds en y = 0, regard vers +z)
// ---------------------------------------------------------------------------
export const MODELS = {
  duck(c) {
    const body = c.body || 0x9a8a78, head = c.head || 0x2a7a4a, ring = c.ring, bill = c.bill || 0xf0a020, breast = c.breast || 0x8a5a3a, wingC = c.wing || 0x7a6a5a;
    const parts = [P(sph(0.24, 12, 8), body, { y: 0.2, sx: 0.85, sy: 0.62, sz: 1.25 }), P(sph(0.16, 10, 6), breast, { y: 0.24, z: 0.16, sx: 0.85, sy: 0.85 }),
      P(cone(0.12, 0.22, 6), body, { y: 0.27, z: -0.32, rx: -Math.PI / 2 - 0.5 }), P(sph(0.06, 6, 4), 0x2a2a2a, { y: 0.31, z: -0.4 }),
      P(cyl(0.06, 0.08, 0.2, 7), head, { y: 0.38, z: 0.2, rx: 0.25 }), P(sph(0.115, 10, 8), head, { y: 0.52, z: 0.24 }),
      P(sph(0.07, 8, 5), bill, { y: 0.49, z: 0.37, sx: 0.85, sy: 0.32, sz: 1.3 }), ...eyes(0.07, 0.55, 0.3, 0.022)];
    if (ring) parts.push(P(tor(0.065, 0.014, 4, 12), ring, { y: 0.36, z: 0.2, rx: Math.PI / 2 + 0.25 }));
    return { body: mergeG(parts), flap: wing(0.3, 0.2, wingC, c.spec), pivots: [0.13, 0.27, -0.02], flapAxis: 'z', h: 0.65, r: 0.3 };
  },
  duckling(c) {
    const f = c.fur || 0xffe060;
    return { body: mergeG([P(sph(0.12, 10, 7), f, { y: 0.11, sz: 1.25, sy: 0.85 }), P(sph(0.085, 8, 6), f, { y: 0.24, z: 0.08 }), P(sph(0.04, 6, 4), 0xf09a20, { y: 0.225, z: 0.16, sy: 0.4, sz: 1.3 }),
      P(cone(0.05, 0.08, 5), f, { y: 0.14, z: -0.15, rx: -2.1 }), ...eyes(0.045, 0.26, 0.135, 0.016)]), flap: wing(0.08, 0.07, f), pivots: [0.08, 0.13, 0], flapAxis: 'z', h: 0.33, r: 0.15 };
  },
  frog(c) {
    const g = c.fur || 0x4a9a3a, belly = c.belly || 0xd8e8a0, dark = 0x2a5a24;
    const parts = [P(sph(0.2, 10, 7), g, { y: 0.13, sx: 1.05, sy: 0.6, sz: 1.15 }), P(sph(0.16, 8, 6), belly, { y: 0.1, z: 0.05, sx: 0.95, sy: 0.5 }),
      P(sph(0.16, 10, 6), g, { y: 0.2, z: 0.13, sx: 1.05, sy: 0.6 }), P(sph(0.07, 8, 6), g, { x: 0.09, y: 0.29, z: 0.16 }), P(sph(0.07, 8, 6), g, { x: -0.09, y: 0.29, z: 0.16 }),
      P(sph(0.045, 6, 4), 0x141414, { x: 0.1, y: 0.31, z: 0.2, rig: [FACE.RIG.EYE, 0.1, 0.31, 0.2] }), P(sph(0.045, 6, 4), 0x141414, { x: -0.1, y: 0.31, z: 0.2, rig: [FACE.RIG.EYE, -0.1, 0.31, 0.2] }), P(sph(0.015, 4, 3), 0xffffff, { x: 0.11, y: 0.34, z: 0.24, rig: [FACE.RIG.EYE, 0.1, 0.31, 0.2] }), P(sph(0.015, 4, 3), 0xffffff, { x: -0.09, y: 0.34, z: 0.24, rig: [FACE.RIG.EYE, -0.1, 0.31, 0.2] }),
      P(box(0.16, 0.012, 0.02), 0x2a3a20, { y: 0.15, z: 0.29 })];
    for (const s of [-1, 1]) {
      parts.push(P(sph(0.09, 7, 5), g, { x: s * 0.17, y: 0.08, z: -0.08, sx: 0.7, sz: 1.6, ry: s * 0.4 }), P(sph(0.06, 6, 4), dark, { x: s * 0.22, y: 0.02, z: 0.05, sx: 1.3, sy: 0.4, sz: 1.2 }));
      parts.push(P(sph(0.04, 6, 4), g, { x: s * 0.14, y: 0.05, z: 0.22, sy: 1.5 }));
    }
    for (let i = 0; i < 5; i++) parts.push(P(sph(0.03, 5, 3), dark, { x: Math.sin(i * 2.3) * 0.11, y: 0.22, z: -0.05 + Math.cos(i * 2.3) * 0.08, sy: 0.4 }));
    return { body: mergeG(parts), h: 0.4, r: 0.22 };
  },
  butterfly(c) {
    const wc = c.wing || 0xffa020, sp = c.spots || 0x2a1a10;
    const w = mergeG([P(sph(0.5, 8, 4), wc, { x: 0.08, z: 0.04, sx: 0.17, sy: 0.012, sz: 0.13 }), P(sph(0.5, 6, 4), wc, { x: 0.06, z: -0.05, sx: 0.12, sy: 0.012, sz: 0.1 }),
      P(sph(0.5, 6, 3), sp, { x: 0.1, y: 0.004, z: 0.05, sx: 0.06, sy: 0.012, sz: 0.045 }), P(sph(0.5, 6, 3), 0xffffff, { x: 0.135, y: 0.005, z: 0.08, sx: 0.025, sy: 0.012, sz: 0.02 })]);
    return { body: mergeG([P(cyl(0.012, 0.01, 0.12, 5), 0x2a2018, { rx: Math.PI / 2 }), P(sph(0.018, 5, 4), 0x2a2018, { z: 0.065 }),
      P(cyl(0.003, 0.003, 0.06, 3), 0x2a2018, { x: 0.012, y: 0.02, z: 0.09, rx: 1.0 }), P(cyl(0.003, 0.003, 0.06, 3), 0x2a2018, { x: -0.012, y: 0.02, z: 0.09, rx: 1.0 })]),
    flap: w, pivots: [0.008, 0, 0], h: 0.1, r: 0.12 };
  },
  hedgehog(c) {
    const sp = c.fur || 0x6a5038, face = c.face || 0xd8b890;
    const parts = [P(sph(0.2, 10, 7), sp, { y: 0.15, sx: 1.0, sy: 0.75, sz: 1.2 }), P(sph(0.1, 8, 6), face, { y: 0.12, z: 0.2, sz: 1.3 }), P(sph(0.03, 5, 4), 0x141414, { y: 0.13, z: 0.33 }),
      ...eyes(0.05, 0.16, 0.25, 0.018), P(sph(0.04, 5, 4), face, { x: 0.07, y: 0.2, z: 0.17 }), P(sph(0.04, 5, 4), face, { x: -0.07, y: 0.2, z: 0.17 })];
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996, u = (i % 7) / 7;
      const nx = Math.cos(a) * (0.6 + u * 0.4), ny = 0.4 + u * 0.6, nz = -0.2 + Math.sin(a) * 0.6;
      const l = Math.hypot(nx, ny, nz);
      const dir = new THREE.Vector3(nx / l, ny / l, nz / l), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      parts.push(P(cone(0.035, 0.14, 4), i % 3 ? 0x4a3828 : 0xc8b090, { x: dir.x * 0.17, y: 0.15 + dir.y * 0.13, z: -0.02 + dir.z * 0.19, rx: e.x, ry: e.y, rz: e.z }));
    }
    return { body: mergeG(parts), h: 0.35, r: 0.25 };
  },
};

// ---------------------------------------------------------------------------
// Objets ({ geo, mat?, h, r } ; pied en y = 0)
// ---------------------------------------------------------------------------
export const PROPS = {
  /** Buisson : touffes du feuillage des arbres du parc (même matière), quelques baies. */
  bush(c) {
    const R = W.LOOK.real ? FOL.propBush(LITE()) : null;     // (réaliste : vraies feuilles, foliage.js)
    if (R) return { geo: R.geo, mat: R.mat, depth: R.depth, h: 1.5, r: 1.3, shadow: !LITE() };
    const d = LITE() ? 6 : 12;
    const parts = [leafBlob(d, { y: 0.7, s: 1.0, sy: 0.7, tint: c.tint }), leafBlob(d, { x: 0.75, y: 0.5, z: 0.25, s: 0.7, sy: 0.65, ry: 1, tint: c.tint }), leafBlob(d, { x: -0.7, y: 0.52, z: -0.2, s: 0.75, sy: 0.65, ry: 2, tint: c.tint }),
      leafBlob(d, { x: 0.1, y: 0.45, z: 0.7, s: 0.6, sy: 0.6, ry: 3, tint: c.tint })];
    return { geo: mergeG(parts), mat: leafMat(), h: 1.5, r: 1.3, shadow: !LITE() };
  },
  /** Arbuste : tronc en écorce photo, feuillage du parc ; on le secoue. */
  sapling(c) {
    const R = W.LOOK.real ? FOL.propSapling(LITE()) : null;
    if (R) return { geo: R.geo, mat: R.mat, depth: R.depth, h: 3.4, r: 0.5, shadow: !LITE() };
    const d = LITE() ? 6 : 12;
    const trunk = [P(cyl(0.09, 0.15, 2.0, 8), 0xffffff, { y: 1.0 }), P(cyl(0.04, 0.07, 0.9, 6), 0xffffff, { x: 0.25, y: 1.7, rz: -0.6 }), P(cyl(0.04, 0.07, 0.8, 6), 0xffffff, { x: -0.22, y: 1.8, rz: 0.55 })];
    const leaves = [leafBlob(d, { y: 2.6, s: 1.05, tint: c.tint }), leafBlob(d, { x: 0.75, y: 2.25, z: 0.2, s: 0.7, ry: 1 }), leafBlob(d, { x: -0.7, y: 2.3, z: -0.2, s: 0.72, ry: 2 }), leafBlob(d, { z: 0.6, y: 2.2, s: 0.62, ry: 3 })];
    return { geo: mergeG([trunk, leaves]), mat: [barkMat(), leafMat()], h: 3.4, r: 0.5, shadow: !LITE() };
  },
  /** Massif de fleurs : terre photo, bordure de pierres, touffes de fleurs en cartes. */
  flowers() {
    const parts = [P(cyl(1.6, 1.7, 0.2, 18), 0xffffff, { y: 0.07, uv: [0, 0, 0.5, 1] })];
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; parts.push(P(sph(0.2, 6, 4), 0xffffff, { x: Math.cos(a) * 1.72, y: 0.09, z: Math.sin(a) * 1.72, sy: 0.6, uv: [0.05, 0.05, 0.1, 0.1] })); }
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, d = i ? 0.5 + (i % 3) * 0.35 : 0, s = 0.95 + (i % 3) * 0.15;
      for (const ry of [0, Math.PI / 2]) parts.push(P(new THREE.PlaneGeometry(1.25 * s, 0.85 * s), 0xffffff, { x: Math.cos(a) * d, y: 0.16 + 0.42 * s, z: Math.sin(a) * d, ry: ry + a, uv: [0.5, 0, 0.5, 1] }));
    }
    return { geo: mergeG(parts), mat: flowerAtlas(), h: 1.1, r: 1.7 };
  },
  /** Tas de feuilles mortes (on fonce dedans : elles volent). */
  leafpile() {
    const parts = [];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, d = Math.sqrt(i / 22) * 1.0, h = 0.45 * (1 - d * d * 0.85);
      parts.push(P(new THREE.PlaneGeometry(0.9, 0.9), 0xffffff, { x: Math.cos(a) * d, y: h, z: Math.sin(a) * d, rx: -Math.PI / 2 + (Math.sin(i * 7.1)) * 0.5, ry: a, rz: Math.cos(i * 3.3) * 0.4 }));
    }
    return { geo: mergeG(parts), mat: autumnMat(), h: 0.6, r: 1.0 };
  },
  /** Flaque : eau qui reflète le ciel, bord boueux. */
  puddle() {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU, r = 1.0 + Math.sin(a * 3 + 1) * 0.16 + Math.sin(a * 5) * 0.08; const x = Math.cos(a) * r * 1.25, z = Math.sin(a) * r; if (i) shape.lineTo(x, z); else shape.moveTo(x, z); }
    const water = new THREE.ShapeGeometry(shape, 1).rotateX(Math.PI / 2);
    const g = P(water, 0x6a7a84, { y: 0.05 });
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return { geo: mergeG([g, P(new THREE.ShapeGeometry(shape, 1).rotateX(Math.PI / 2), 0x4a3a2a, { y: 0.035, s: 1.15 })]), mat: waterMat(), h: 0.1, r: 1.3 };
  },
  /** Arroseur de jardin (l'eau, ce sont des gouttes : voir pk.spray). */
  sprinkler() {
    return { geo: mergeG([P(cyl(0.22, 0.28, 0.12, 12), 0x3a7a3a, { y: 0.06 }), P(cyl(0.05, 0.05, 0.35, 8), 0xc8c8c8, { y: 0.28 }), P(box(0.7, 0.05, 0.06), 0xd8d8d8, { y: 0.47 }),
      P(cyl(0.05, 0.04, 0.08, 6), 0xd8d8d8, { x: 0.35, y: 0.5 }), P(cyl(0.05, 0.04, 0.08, 6), 0xd8d8d8, { x: -0.35, y: 0.5 }), P(cyl(0.035, 0.035, 2.5, 5), 0x2a8a3a, { x: 1.3, y: 0.03, rz: Math.PI / 2, ry: 0.4 })]), mat: paintMetalMat(), h: 0.5, r: 0.4 };
  },
  /** Bain d'oiseaux en pierre (photo), une coupelle d'eau. */
  birdbath() {
    const stone = [P(cyl(0.45, 0.55, 0.15, 12), 0xffffff, { y: 0.07 }), P(cyl(0.17, 0.24, 0.85, 10), 0xffffff, { y: 0.55 }), P(cyl(0.72, 0.4, 0.22, 16), 0xffffff, { y: 1.05 }), P(tor(0.66, 0.07, 6, 18), 0xffffff, { y: 1.16, rx: Math.PI / 2 })];
    const water = [P(cyl(0.62, 0.62, 0.02, 16), 0x7a90a0, { y: 1.14 })];
    return { geo: mergeG([stone, water]), mat: [stoneMat(), waterMat()], h: 1.2, r: 0.7, shadow: !LITE() };
  },
  /** Champignon géant (trampoline des bois). */
  mushroom(c) {
    const cap = c.cap || 0xd8402e;
    const parts = [P(cyl(0.35, 0.45, 0.9, 10), 0xf2e8d4, { y: 0.45 }), P(sph(1.25, 16, 8, 0, TAU, 0, Math.PI / 2), cap, { y: 0.82, sy: 0.55 }), P(cyl(1.2, 1.15, 0.12, 16), 0xf0dcc0, { y: 0.84 })];
    for (let i = 0; i < 9; i++) { const a = i * 2.39996, d = 0.3 + (i % 3) * 0.3; parts.push(P(sph(0.12 + (i % 2) * 0.05, 6, 4), 0xfff8ec, { x: Math.cos(a) * d, y: 0.82 + 0.66 * Math.sqrt(Math.max(0, 1 - (d / 1.25) ** 2)) * 0.98, z: Math.sin(a) * d, sy: 0.4 })); }
    return { geo: mergeG(parts), mat: grainMaterial(), h: 1.5, r: 1.25 };
  },
  /** Trampoline de jardin : cadre métal, toile noire, coussins bleus. */
  trampoline() {
    const parts = [P(cyl(1.25, 1.25, 0.04, 20), 0x1a1a1e, { y: 0.62 }), P(tor(1.32, 0.13, 6, 24), 0x2a8ae0, { y: 0.64, rx: Math.PI / 2 })];
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; parts.push(P(cyl(0.035, 0.035, 0.66, 5), 0x9a9aa0, { x: Math.cos(a) * 1.3, y: 0.31, z: Math.sin(a) * 1.3 })); }
    return { geo: mergeG(parts), mat: grainMaterial(), h: 0.7, r: 1.3 };
  },
  beachball() { return { geo: mergeG([P(sph(1, 16, 12), 0xffffff)]), mat: beachMat(), h: 1, r: 1 }; },
  /** Boule de pétanque en acier strié (rayon 1 : life.js la met à l'échelle). */
  boule() {
    const parts = [P(sph(1, 14, 10), 0xc8ccd2)];
    for (const k of [-0.45, 0, 0.45]) parts.push(P(tor(Math.sqrt(1 - k * k) * 1.005, 0.03, 4, 24), 0x5a5e66, { y: k, rx: Math.PI / 2 }));
    return { geo: mergeG(parts), mat: metalMat(), h: 1, r: 1 };
  },
  /** Le cochonnet (petite boule de bois). */
  jack() { return { geo: mergeG([P(sph(0.09, 10, 8), 0xf0c040, { y: 0.09 }), P(cyl(0.9, 0.9, 0.02, 24), 0xc8b490, { y: 0.01 })]), mat: grainMaterial(), h: 0.2, r: 0.1 }; },
  /** Tuyau musical (aire de jeux) : teinté objet par objet. */
  tube(c) {
    const h = c.len || 1.6;
    return { geo: mergeG([P(cyl(0.16, 0.16, h, 12, 1, true), 0xffffff, { y: h / 2 }), P(tor(0.16, 0.035, 5, 14), 0xffffff, { y: h, rx: Math.PI / 2 }), P(cyl(0.3, 0.34, 0.1, 12), 0x8a8a90, { y: 0.05 }),
      P(sph(0.13, 8, 6), 0x2a2a2a, { y: h + 0.02, sy: 0.15 })]), mat: paintMetalMat(), h: h + 0.1, r: 0.3 };
  },
  /** Chariot de glaces (bois photo, parasol rayé, clochette). */
  cart() {
    const wood = [P(box(1.8, 0.9, 1.0), 0xffffff, { y: 0.85 }), P(box(1.9, 0.08, 1.1), 0xffffff, { y: 1.33 })];
    const paint = [P(cyl(0.38, 0.38, 0.08, 16), 0x2a2a30, { x: 0.6, y: 0.38, z: 0.52, rx: Math.PI / 2 }), P(cyl(0.38, 0.38, 0.08, 16), 0x2a2a30, { x: 0.6, y: 0.38, z: -0.52, rx: Math.PI / 2 }),
      P(cyl(0.04, 0.04, 1.6, 6), 0xdddddd, { x: -0.3, y: 2.1 }), P(cone(1.3, 0.55, 12), 0xff8ab0, { x: -0.3, y: 3.0 }), P(cone(1.32, 0.5, 12, 1), 0xffffff, { x: -0.3, y: 2.96, s: 0.98, ry: 0.26 }),
      P(cyl(0.03, 0.03, 0.8, 5), 0x8a8a8a, { x: -1.05, y: 1.4, rz: 1.2 }), P(sph(0.09, 8, 6, 0, TAU, 0, Math.PI / 2), 0xe8c040, { x: 0.7, y: 1.47, z: 0.3, rx: Math.PI })];
    for (const [x, col] of [[0.2, 0xffd0e0], [0.45, 0xfff0c0], [0.7, 0xc0f0d0]]) paint.push(P(cone(0.1, 0.24, 8), 0xe8b070, { x, y: 1.5, z: -0.25, rx: Math.PI }), P(sph(0.11, 8, 6), col, { x, y: 1.66, z: -0.25 }));
    return { geo: mergeG([wood, paint]), mat: [woodMat(), grainMaterial()], h: 3.2, r: 0.9, shadow: !LITE() };
  },
  /** Machine à bulles : le gros bouton est dessus. */
  bubbler() {
    return { geo: mergeG([P(box(0.9, 0.7, 0.7), 0x3ab0e0, { y: 0.35 }), P(cyl(0.3, 0.34, 0.16, 14), 0xe8403a, { y: 0.78 }), P(cyl(0.16, 0.12, 0.3, 10), 0xffffff, { x: 0.3, y: 0.85, z: -0.2, rz: -0.7 }),
      P(tor(0.14, 0.03, 5, 14), 0xffe040, { x: 0.48, y: 1.0, z: -0.2, ry: Math.PI / 2 }), P(sph(0.07, 6, 4), 0xffe040, { x: -0.3, y: 0.5, z: 0.36 })]), mat: grainMaterial(), h: 1.0, r: 0.6 };
  },
  balloon() { return { geo: mergeG([P(sph(0.42, 14, 10), 0xffffff, { y: 0.15, sy: 1.18 }), P(cone(0.07, 0.1, 6), 0xffffff, { y: -0.38, rx: Math.PI }), P(cyl(0.006, 0.006, 1.1, 3), 0xeeeeee, { y: -0.95 })]), mat: glossMat(), h: 0.6, r: 0.4 }; },
  bubble() { return { geo: mergeG([P(sph(0.42, 14, 10), 0xd8f0ff)]), mat: bubbleMat(), h: 0.5, r: 0.4 }; },
  frisbee() { return { geo: mergeG([P(cyl(0.3, 0.27, 0.05, 18), 0xffffff, { y: 0.03 }), P(tor(0.29, 0.025, 4, 18), 0xffffff, { y: 0.04, rx: Math.PI / 2 })]), mat: glossMat(), h: 0.1, r: 0.3 }; },
  molehill() { return { geo: mergeG([P(sph(0.62, 12, 6, 0, TAU, 0, Math.PI / 2), 0xffffff, { sy: 0.45 }), P(cyl(0.3, 0.3, 0.02, 12), 0x140c08, { y: 0.27 })]), mat: soilMat(), h: 0.3, r: 0.6 }; },
  ripple() { return { geo: mergeG([P(tor(0.6, 0.05, 4, 20), 0xeef8ff, { y: 0.03, rx: Math.PI / 2 }), P(tor(0.95, 0.035, 4, 24), 0xd8ecf8, { y: 0.03, rx: Math.PI / 2 })]), mat: rippleMat(), h: 0.05, r: 0.9 }; },
  lilypad() {
    return { geo: mergeG([P(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 16, 1, false, 0.3, TAU - 0.5), 0x4a8a3a, { y: 0.02 }), P(sph(0.12, 8, 5), 0xffb0d0, { x: 0.15, y: 0.08, sy: 0.6 })]), mat: grainMaterial(), h: 0.1, r: 0.55 };
  },
};

// ---------------------------------------------------------------------------
// Outils des habitants (origine = bout du bras ; le bras pend vers -y)
// ---------------------------------------------------------------------------
export const TOOLS = {
  kite() {
    // la ficelle prolonge le bras levé, le cerf-volant tout au bout
    const parts = [P(cyl(0.006, 0.006, 9, 3), 0xf4f4f4, { y: -4.5 })];
    parts.push(P(cone(0.55, 0.6, 4), 0xe8402e, { y: -9.3, sz: 0.06, rx: 0 }), P(cone(0.55, 0.9, 4), 0xffd040, { y: -9.3 - 0.75, rx: Math.PI, sz: 0.06 }));
    for (let i = 0; i < 4; i++) parts.push(P(box(0.18, 0.06, 0.02), [0x2a8ae0, 0xe8402e, 0x40c060, 0xffd040][i], { y: -10.4 - i * 0.45, x: Math.sin(i) * 0.12 }));
    return mergeG(parts);
  },
  balloons() {
    const parts = [];
    const cols = [0xe8402e, 0xffd040, 0x2a8ae0, 0x40c060, 0xff6ab0, 0xa070ff];
    cols.forEach((col, i) => {
      const a = i / cols.length * TAU, x = Math.cos(a) * 0.35, z = Math.sin(a) * 0.35, y = -1.9 - (i % 2) * 0.35;
      parts.push(P(cyl(0.005, 0.005, Math.hypot(x, y, z), 3), 0xeeeeee, { x: x / 2, y: y / 2, z: z / 2, rz: Math.atan2(x, -y), rx: -Math.atan2(z, -y) }));
      parts.push(P(sph(0.26, 10, 8), col, { x, y: y - 0.2, z, sy: 1.18 }));
    });
    return mergeG(parts);
  },
  accordion() {
    const parts = [P(box(0.22, 0.34, 0.24), 0xc8302a, { x: -0.18, z: 0.1 }), P(box(0.22, 0.34, 0.24), 0xc8302a, { x: -0.62, z: 0.1 })];
    for (let i = 0; i < 6; i++) parts.push(P(box(0.035, 0.32, 0.22), i % 2 ? 0xf4f0e8 : 0x2a2a2a, { x: -0.31 - i * 0.04, z: 0.1 }));
    for (let i = 0; i < 4; i++) parts.push(P(box(0.05, 0.05, 0.02), 0xffffff, { x: -0.13, y: 0.1 - i * 0.07, z: 0.23 }));
    return mergeG(parts);
  },
  rake() { return mergeG([P(cyl(0.025, 0.025, 1.5, 5), 0x9a6a3a, { y: 0.05, rx: 0.25 }), P(box(0.5, 0.05, 0.05), 0x7a7a80, { y: -0.68, z: -0.18, rx: 0.25 }), ...[-0.2, -0.1, 0, 0.1, 0.2].map(x => P(cyl(0.01, 0.01, 0.14, 3), 0x7a7a80, { x, y: -0.75, z: -0.2, rx: 0.25 }))]); },
  bread() { return mergeG([P(cyl(0.06, 0.06, 0.45, 7), 0xd89a50, { y: -0.12, z: 0.08, rx: 1.2 }), P(sph(0.06, 6, 4), 0xd89a50, { y: -0.03, z: 0.27 })]); },
  scoop() { return mergeG([P(cyl(0.02, 0.025, 0.3, 5), 0xc8c8c8, { y: -0.12, rx: 0.4 }), P(sph(0.07, 8, 6, 0, TAU, 0, Math.PI / 2), 0xd8d8d8, { y: -0.27, z: 0.08, rx: Math.PI + 0.4 }), P(sph(0.06, 8, 6), 0xffc8d8, { y: -0.31, z: 0.1 })]); },
  boule() { return mergeG([P(sph(0.1, 10, 8), 0xa8acb4, { y: -0.08, z: 0.06 })]); },
  wand() { return mergeG([P(cyl(0.012, 0.012, 0.5, 4), 0xff6ab0, { y: -0.2, rx: 0.6 }), P(tor(0.1, 0.018, 4, 14), 0xffe040, { y: -0.43, z: 0.16, rx: 0.6 })]); },
  binoculars() { return mergeG([P(cyl(0.05, 0.05, 0.16, 8), 0x2a3a2a, { x: -0.05, y: -0.05, z: 0.1, rx: Math.PI / 2 }), P(cyl(0.05, 0.05, 0.16, 8), 0x2a3a2a, { x: -0.17, y: -0.05, z: 0.1, rx: Math.PI / 2 })]); },
  searod() { return mergeG([P(cyl(0.02, 0.03, 2.4, 5), 0x6a4a2a, { y: 0.3, z: 0.9, rx: 1.0 }), P(cyl(0.004, 0.004, 1.9, 3), 0xe8e8e8, { y: 0.0, z: 1.95, rx: 0.12 }), P(sph(0.05), 0xff3a3a, { y: -0.95, z: 2.0 })]); },
};
