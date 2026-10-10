/*
 * Dogfight Aventure — modèles 3D (formes lisses, matériaux PBR, ombres).
 */
import * as THREE from '../vendor/three.module.min.js';

const matCache = new Map();
/** Matériau standard mis en cache. opts : roughness, metalness, emissive… */
export function mat(color, opts) {
  opts = Object.assign({ roughness: 0.75, metalness: 0 }, opts || {});
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(Object.assign({ color }, opts));
  matCache.set(key, m);
  return m;
}
// Compatibilité avec l'ancien nom
export const toon = mat;

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, typeof color === 'object' ? color : mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
// Finesse des sphères (0.7 : assez rond à l'écran, deux fois moins de triangles)
const DET = 0.7;
const S = (r, w, h) => new THREE.SphereGeometry(r, Math.max(6, Math.round((w || 24) * DET)), Math.max(4, Math.round((h || 18) * DET)));
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

/** Géométrie à facettes plates (rochers). */
export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Personnages : style « chibi » tout doux (grosse tête, petit corps lisse,
// grands yeux brillants). Chaque partie animée est UN seul maillage dont les
// couleurs sont peintes sur les sommets : rendu propre et très léger.
// ---------------------------------------------------------------------------
const _c = new THREE.Color(), _c2 = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Mélange deux couleurs hexadécimales (k = 0 → a, 1 → b). */
const mix = (out, a, b, k) => out.set(a).lerp(_c2.set(b), k);

/** Colore une géométrie sommet par sommet : fn(x, y, z, couleur) en coordonnées locales. */
function paint(geo, fn) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    if (typeof fn === 'function') fn(p.getX(i), p.getY(i), p.getZ(i), _c); else _c.set(fn);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

let skinMat = null, glossMat = null;
const skin = () => skinMat || (skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }));
const gloss = () => glossMat || (glossMat = Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }), { userData: { gloss: true } }));

/** Assemble des morceaux colorés en un seul maillage. */
class Kit {
  constructor() { this.list = []; }
  add(geo, color, t) { this.list.push(Object.assign({ geo: paint(geo.index ? geo.toNonIndexed() : geo, color) }, t || {})); return this; }
  build(material) {
    const m = new THREE.Mesh(mergeGeos(this.list), material || skin());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

/** Oreille : goutte aplatie, pointue en haut (pointe = 1) ou tombante (pointe = 0). */
function earGeo(w, h, d, point) {
  const g = new THREE.SphereGeometry(1, 16, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 - Math.max(0, y) * point * 0.85;
    p.setXYZ(i, x * w * k, (y + 0.15) * h, z * d * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Tube effilé et lisse le long d'une courbe (queues). radius(t) donne le rayon. */
function taperTube(points, radius, seg, radial) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  seg = seg || 24; radial = radial || 14;
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, P = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const r = radius(i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(P).multiplyScalar(r).add(P);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  // embouts arrondis
  const a = curve.getPointAt(0), b = curve.getPointAt(1);
  return { tube: g, start: a, end: b, r0: radius(0), r1: radius(1), curve };
}

/** Grands yeux brillants (pupille sombre + deux reflets), ajoutés au kit brillant. */
function addEyes(k, o) {
  // o : { x, y, z, r, ry, iris, white }
  for (const sx of [-1, 1]) {
    const ry = sx * o.ry;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    if (o.white) k.add(S(o.r * 1.3, 18, 14), 0xffffff, { x: sx * o.x, y: o.y, z: o.z - 0.01, sx: 1, sy: 1.1, sz: 0.45, ry });
    k.add(S(o.r, 18, 14), o.iris || 0x1a120e, { x: sx * o.x + fx * 0.01, y: o.y - (o.white ? o.r * 0.1 : 0), z: o.z + fz * 0.01, sx: 0.85, sy: 1.12, sz: 0.5, ry });
    k.add(S(o.r * 0.34, 10, 8), 0xffffff, { x: sx * o.x + fx * o.r * 0.45 + sx * o.r * 0.12 * 0, y: o.y + o.r * 0.42, z: o.z + fz * o.r * 0.45 + 0.01, ry });
    k.add(S(o.r * 0.16, 8, 6), 0xffffff, { x: sx * o.x + fx * o.r * 0.45 - o.r * 0.28, y: o.y - o.r * 0.35, z: o.z + fz * o.r * 0.45 + 0.005, ry });
  }
}

// ---------------------------------------------------------------------------
// Fourrure : coques successives (« shells ») dessinées en une seule fois par
// instanciation. Chaque couche est un peu plus loin de la peau ; un bruit 3D
// découpe les mèches, qui s'affinent vers la pointe et se couchent vers l'arrière.
// ---------------------------------------------------------------------------
export const FUR = { layers: 10, mode: 'smooth' };
const FUR_VERT = `
      #include <begin_vertex>
      vLayer = aLayer; vBase = position;
      float fh = aLayer * uLen;
      transformed += normalize(objectNormal) * fh + uComb * fh * aLayer;`;
const FUR_FRAG_HEAD = `
uniform float uDen;
varying float vLayer;
varying vec3 vBase;
float fhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fhash(i), fhash(i + vec3(1,0,0)), f.x), mix(fhash(i + vec3(0,1,0)), fhash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fhash(i + vec3(0,0,1)), fhash(i + vec3(1,0,1)), f.x), mix(fhash(i + vec3(0,1,1)), fhash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;
const FUR_FRAG = `
      #include <color_fragment>
      if (vLayer > 0.0) {
        vec3 q = vBase * uDen;
        float n = fnoise(q) * 0.55 + fnoise(q * 2.9 + 7.0) * 0.45;
        if (n < 0.18 + vLayer * 0.78) discard;
      }
      diffuseColor.rgb *= mix(0.72, 1.06, sqrt(vLayer));`;

// Bruit de valeur 3D (pour placer les touffes de poils)
function vhash(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(vhash(ix, iy, iz), vhash(ix + 1, iy, iz), fx), l(vhash(ix, iy + 1, iz), vhash(ix + 1, iy + 1, iz), fx), fy),
           l(l(vhash(ix, iy, iz + 1), vhash(ix + 1, iy, iz + 1), fx), l(vhash(ix, iy + 1, iz + 1), vhash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

/**
 * Pelage façon dessin animé : la surface se soulève en touffes (mèches
 * peignées vers l'arrière) qui découpent la silhouette ; le contour les souligne.
 */
function tuftMesh(geo, opts) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal, col = g.attributes.color;
  const den = (opts.density || 40) / 5, len = opts.length * 2.4;
  const comb = new THREE.Vector3(...(opts.comb || [0, -0.35, -0.5]));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = vnoise3(x * den, y * den, z * den) * 0.7 + vnoise3(x * den * 2.3 + 5, y * den * 2.3, z * den * 2.3) * 0.3;
    const t = Math.pow(Math.min(1, Math.max(0, (f - 0.38) / 0.4)), 1.6);
    v.set(n.getX(i), n.getY(i), n.getZ(i)).addScaledVector(comb, 0.7 * t).normalize();
    p.setXYZ(i, x + v.x * len * t, y + v.y * len * t, z + v.z * len * t);
    if (col) { const k = 1 + t * 0.12; col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k)); }
  }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Maillage à fourrure. opts : length (longueur des poils), density, comb (direction du peigné). */
export function furMesh(geo, opts) {
  if (FUR.mode === 'tufts') return tuftMesh(geo, opts);
  if (FUR.mode === 'smooth') return tuftMesh(geo, Object.assign({}, opts, { length: 0 }));
  const layers = Math.max(3, Math.round(FUR.layers * (opts.layerScale || 1)));
  const g = geo.index ? geo.toNonIndexed() : geo;
  const lay = new Float32Array(layers);
  for (let i = 0; i < layers; i++) lay[i] = i / layers;
  g.setAttribute('aLayer', new THREE.InstancedBufferAttribute(lay, 1));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const u = {
    uLen: { value: opts.length }, uDen: { value: opts.density || 55 },
    uComb: { value: new THREE.Vector3(...(opts.comb || [0, -0.35, -0.5])) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aLayer;\nuniform float uLen;\nuniform vec3 uComb;\nvarying float vLayer;\nvarying vec3 vBase;\n' + sh.vertexShader.replace('#include <begin_vertex>', FUR_VERT);
    sh.fragmentShader = FUR_FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', FUR_FRAG);
  };
  m.customProgramCacheKey = () => 'fur';
  const mesh = new THREE.InstancedMesh(g, m, layers);
  const id = new THREE.Matrix4();
  for (let i = 0; i < layers; i++) mesh.setMatrixAt(i, id);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.fur = { length: opts.length };
  return mesh;
}

/** Kit à fourrure : comme Kit, mais le résultat est couvert de poils. */
class FurKit extends Kit {
  build(opts) { return furMesh(mergeGeos(this.list), opts); }
}
/** Ellipsoïde lisse (rayons rx, ry, rz). */
const E = (rx, ry, rz, seg) => { const g = new THREE.SphereGeometry(1, seg || 40, Math.round((seg || 40) * 0.7)); g.scale(rx, ry, rz); return g; };

// ---------------------------------------------------------------------------
// Mèches de poils (style cel shading) : une goutte aplatie, pointue au bout.
// Chaque mèche est posée sur le corps avec une direction (vers la pointe) et
// une normale (le côté plat) ; le contour dessine le trait entre les mèches.
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3();
function lock(k, pos, dir, nrm, w, len, thick, base, tip) {
  const g = new THREE.SphereGeometry(1, 10, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + 1) / 2;                       // 0 à la base, 1 à la pointe
    const k2 = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)), 0.6);
    p.setXYZ(i, x * w * k2, t * len, z * thick * k2 - t * t * len * 0.28);
  }
  g.computeVertexNormals();
  paint(g, (x, y, z, c) => mix(c, base, tip, sstep(0.15, 0.95, y / len)));
  _vy.set(...dir).normalize();
  _vz.set(...nrm);
  _vx.crossVectors(_vy, _vz).normalize();
  _vz.crossVectors(_vx, _vy).normalize();
  _m4.makeBasis(_vx, _vy, _vz).setPosition(pos[0], pos[1], pos[2]);
  g.applyMatrix4(_m4);
  k.list.push({ geo: g.toNonIndexed() });
}
const toonSkin = (rough) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough || 0.85 });

// ---------------------------------------------------------------------------
// Le duo : Ainu (eurasier roux) et Matcha (pinscher nain) debout sur la selle.
// Corps sculptés hors ligne (tools/build-dogs.mjs) ; yeux, truffe, harnais
// et accessoires ajoutés ici. Repère : avant = +z, pattes au sol en y = 0.
// ---------------------------------------------------------------------------
const SCULPT_OUTLINE = 0.006;
function sculpt(name, pivot, rough) {
  const m = sculptMesh(name, pivot, rough);
  m.userData.outlineThick = SCULPT_OUTLINE;
  return m;
}
export function buildDuo() {
  const root = new THREE.Group();
  const ainu = new THREE.Group();
  root.add(ainu);
  const DK = 0x140a06;

  const body = sculpt('body', [0, 0, 0]);
  ainu.add(body);

  // Harnais en Y sur le poitrail, sangle, couverture turquoise, selle et sacoches
  const lk = new Kit();
  const BR = 0x5e3218, BRL = 0x7a4422, GD = 0xe0b040;
  lk.add(new THREE.TorusGeometry(0.31, 0.03, 8, 34), BR, { y: 1.3, z: 0.6, rx: Math.PI / 2 - 0.75, sx: 1.05 });   // collier du harnais
  lk.add(new THREE.BoxGeometry(0.07, 0.42, 0.03), BR, { y: 0.97, z: 0.66, rx: -0.15 });                           // sangle du poitrail
  lk.add(new THREE.TorusGeometry(0.34, 0.034, 8, 34), BR, { y: 0.98, z: 0.16, sy: 1.12 });                         // sangle derrière les épaules
  lk.add(new THREE.TorusGeometry(0.33, 0.03, 8, 34), BR, { y: 1.0, z: -0.38, sy: 1.0 });
  lk.add(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 14), GD, { y: 1.15, z: 0.72, rx: Math.PI / 2 - 0.4 });     // boucle dorée
  lk.add(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, 0.85), (x, y, z, c) => c.set(y < 0.7 ? GD : 0x1e8a86), { y: 0.97, z: -0.1, sx: 0.36, sy: 0.36, sz: 0.4 });
  lk.add(E(0.17, 0.06, 0.22), BRL, { y: 1.33, z: -0.12 });
  for (const sx of [-1, 1]) {
    lk.add(new THREE.BoxGeometry(0.12, 0.24, 0.26), 0x8a4e24, { x: sx * 0.35, y: 0.86, z: 0.0 });
    lk.add(new THREE.BoxGeometry(0.135, 0.07, 0.28), BR, { x: sx * 0.355, y: 0.98, z: 0.0, rz: sx * 0.2 });
    lk.add(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), GD, { x: sx * 0.415, y: 0.9, z: 0.0, rz: Math.PI / 2 });
  }
  ainu.add(lk.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));

  // Tête
  const HP = [0, 1.6, 0.78];
  const head = new THREE.Group(); at(head, ...HP); ainu.add(head);
  head.scale.setScalar(1.18);
  head.add(sculpt('head', HP));
  const fk = new Kit();
  for (const sx of [-1, 1]) {
    // petits yeux en amande, bruns, légèrement tombants (regard doux)
    fk.add(E(0.04, 0.026, 0.014, 16), 0x2a0e04, { x: sx * 0.105, y: 0.03, z: 0.262, ry: sx * 0.4, rz: sx * 0.28 }); // contour sombre
    fk.add(E(0.031, 0.021, 0.016, 16), 0x1c0c06, { x: sx * 0.105, y: 0.03, z: 0.268, ry: sx * 0.4, rz: sx * 0.28 });
    fk.add(S(0.009, 8, 6), 0xffffff, { x: sx * 0.105 + 0.008, y: 0.038, z: 0.282 });
  }
  fk.add(E(0.042, 0.032, 0.034, 16), DK, { y: -0.07, z: 0.295 });          // truffe
  fk.add(E(0.06, 0.022, 0.05, 14), 0x4a1008, { y: -0.135, z: 0.215 });    // bouche ouverte souriante
  fk.add(E(0.042, 0.014, 0.05, 12), 0xf0607a, { y: -0.148, z: 0.24, rx: 0.3 }); // langue
  head.add(fk.build(gloss()));

  // Queue (pivot à la base)
  const TP = [0, 1.15, -0.72];
  const tail = new THREE.Group(); at(tail, ...TP); ainu.add(tail);
  tail.add(sculpt('tail', TP));

  // Pattes (pivot à la hanche)
  const legs = [];
  for (const [name, lx, lz] of [['legFL', -0.16, 0.4], ['legFR', 0.16, 0.4], ['legBL', -0.16, -0.5], ['legBR', 0.16, -0.5]]) {
    const pv = [lx, 0.8, lz];
    const g = at(new THREE.Group(), ...pv);
    g.add(sculpt(name, pv));
    ainu.add(g);
    legs.push(g);
  }

  // Matcha, debout sur la selle
  const matcha = new THREE.Group(); at(matcha, 0, 1.36, -0.14); matcha.scale.setScalar(1.3); ainu.add(matcha);
  matcha.add(sculpt('mBody', [0, 0, 0], 0.4));
  const mk = new Kit();
  mk.add(new THREE.TorusGeometry(0.058, 0.014, 6, 18), 0xd02828, { y: 0.43, z: 0.225, rx: Math.PI / 2 + 0.6 });
  mk.add(S(0.018, 8, 6), 0xffd34d, { y: 0.39, z: 0.28 });
  mk.add(new THREE.BoxGeometry(0.13, 0.09, 0.15), 0x8a5428, { y: 0.35, z: -0.04 });
  mk.add(new THREE.BoxGeometry(0.14, 0.035, 0.11), 0x6a3a1c, { y: 0.4, z: 0.0, rx: 0.2 });
  for (const sx of [-1, 1]) mk.add(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10), 0xa06a34, { x: sx * 0.08, y: 0.33, z: -0.06, rx: Math.PI / 2 });
  matcha.add(mk.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  const MP = [0, 0.56, 0.27];
  const mhead = new THREE.Group(); at(mhead, ...MP); matcha.add(mhead);
  mhead.add(sculpt('mHead', MP, 0.4));
  const mfk = new Kit();
  for (const sx of [-1, 1]) {
    mfk.add(E(0.024, 0.026, 0.014, 12), 0x120604, { x: sx * 0.045, y: 0.022, z: 0.074, ry: sx * 0.45 });
    mfk.add(S(0.008, 6, 4), 0xffffff, { x: sx * 0.045 + 0.007, y: 0.032, z: 0.086 });
  }
  mfk.add(E(0.022, 0.016, 0.016, 10), 0x050505, { y: -0.045, z: 0.185 });
  mhead.add(mfk.build(gloss()));
  const mlegs = [];

  root.userData = { ainu, head, tail, legs, matcha, mhead, mlegs, body };
  return root;
}

// ---------------------------------------------------------------------------
// Chat bandit (masque noir, queue rayée, bandana de pirate)
// ---------------------------------------------------------------------------
const NPC_FUR = { length: 0.045, density: 30, layerScale: 0.6 };
const NPC_FUR_HEAD = { length: 0.035, density: 36, layerScale: 0.6 };

export function buildCat() {
  const g = new THREE.Group();
  const GR = 0x9a9ab0, DK = 0x34344a, WH = 0xf2f2f8, PINK = 0xf6a0b0;
  const bk = new FurKit();
  bk.add(new THREE.CapsuleGeometry(0.28, 0.22, 8, 18), (x, y, z, c) => mix(c, GR, WH, sstep(0.08, 0.22, z)), { y: 0.48, rx: Math.PI / 2 });
  g.add(bk.build(NPC_FUR));
  const head = new THREE.Group(); at(head, 0, 0.95, 0.28); g.add(head);
  const hk = new FurKit();
  hk.add(S(0.4, 30, 22), (x, y, z, c) => {
    const band = sstep(0.11, 0.07, Math.abs(y - 0.06)) * sstep(0.0, 0.15, z);
    mix(c, GR, WH, sstep(0.18, 0.3, z) * sstep(-0.04, -0.14, y));
    if (band > 0) c.lerp(_c2.set(DK), band);
  }, { sx: 1.12, sy: 0.92, sz: 0.95 });
  // bandana rouge à pois
  hk.add(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), (x, y, z, c) => {
    const d = (Math.sin(x * 40) + Math.sin(z * 40) + Math.sin(y * 40)) > 2.0;
    c.set(d ? 0xffffff : 0xd83030);
  }, { y: 0.07, z: -0.02, sx: 1.12, sy: 0.75, sz: 0.98 });
  hk.add(S(0.08, 10, 8), 0xd83030, { x: -0.38, y: 0.12, z: -0.25 });
  hk.add(S(0.15, 16, 12), WH, { y: -0.12, z: 0.3, sx: 1.3, sy: 0.75, sz: 0.8 });
  for (const sx of [-1, 1]) {
    hk.add(earGeo(0.15, 0.24, 0.07, 1), GR, { x: sx * 0.27, y: 0.3, z: -0.02, rz: -sx * 0.35 });
    hk.add(earGeo(0.08, 0.15, 0.03, 1), PINK, { x: sx * 0.26, y: 0.3, z: 0.03, rz: -sx * 0.35 });
  }
  head.add(hk.build(NPC_FUR_HEAD));
  const fk = new Kit();
  addEyes(fk, { x: 0.15, y: 0.06, z: 0.34, r: 0.075, ry: 0.42, iris: 0x2a5a10, white: true });
  fk.add(S(0.045, 10, 8), 0xff7a98, { y: -0.07, z: 0.43, sx: 1.3, sy: 0.8 });
  for (const sx of [-1, 1]) for (const dy of [-0.025, 0.025]) fk.add(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 4), 0xffffff, { x: sx * 0.34, y: -0.12 + dy, z: 0.34, rz: Math.PI / 2 + sx * dy * 5 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.6, -0.42); g.add(tail);
  const tt = taperTube([[0, 0, 0], [0, 0.2, -0.15], [0, 0.45, -0.12], [0, 0.6, 0.02]], (t) => 0.08 - t * 0.02, 24, 12);
  const tk = new FurKit();
  tk.add(tt.tube, (x, y, z, c) => c.set(Math.floor((y + 0.03) / 0.12) % 2 ? DK : GR));
  tk.add(S(tt.r1, 12, 8), DK, { x: tt.end.x, y: tt.end.y, z: tt.end.z });
  tail.add(tk.build(NPC_FUR));
  const legs = [];
  for (const [lx, lz] of [[-0.17, 0.2], [0.17, 0.2], [-0.17, -0.2], [0.17, -0.2]]) {
    const l = at(new THREE.Group(), lx, 0.32, lz);
    const lk = new Kit();
    lk.add(new THREE.CapsuleGeometry(0.09, 0.16, 6, 12), (x, y, z, c) => mix(c, GR, WH, sstep(-0.12, -0.2, y)), { y: -0.17 });
    l.add(lk.build());
    g.add(l); legs.push(l);
  }
  g.userData = { head, tail, legs };
  return g;
}

// ---------------------------------------------------------------------------
// Mamie Labrador (assise, foulard rouge et lunettes) et Biscotte le chiot
// ---------------------------------------------------------------------------
export function buildMamie() {
  const g = new THREE.Group();
  const Y = 0xeac47c, LT = 0xfaeacb, YD = 0xd8a858, PINK = 0xf6a0a8;
  const bk = new FurKit();
  bk.add(new THREE.CapsuleGeometry(0.5, 0.35, 10, 24), (x, y, z, c) => mix(c, Y, LT, sstep(0.2, 0.4, z) * sstep(0.4, 0.1, y)), { y: 0.82, sx: 1, sz: 0.9 });
  for (const sx of [-1, 1]) {
    bk.add(new THREE.CapsuleGeometry(0.13, 0.32, 6, 14), (x, y, z, c) => mix(c, Y, LT, sstep(-0.15, -0.25, y)), { x: sx * 0.24, y: 0.3, z: 0.38 });
    bk.add(S(0.3, 20, 16), Y, { x: sx * 0.38, y: 0.3, z: -0.1, sx: 0.8, sy: 0.8, sz: 1.25 });
  }
  bk.add(new THREE.TorusGeometry(0.36, 0.11, 12, 30), (x, y, z, c) => c.set(((Math.atan2(y, x) * 6 / Math.PI) | 0) % 2 ? 0xe04848 : 0xc83434), { y: 1.42, z: 0.05, rx: Math.PI / 2 });
  bk.add(new THREE.ConeGeometry(0.22, 0.32, 16), 0xd03c3c, { y: 1.2, z: 0.42, rx: Math.PI + 0.3, sz: 0.4 });
  g.add(bk.build(NPC_FUR));
  const head = new THREE.Group(); at(head, 0, 1.85, 0.12); g.add(head);
  const hk = new FurKit();
  hk.add(S(0.5, 30, 22), (x, y, z, c) => mix(c, Y, LT, sstep(0.15, 0.35, z) * sstep(0.0, -0.2, y)), { sx: 1.08, sy: 0.95, sz: 0.95 });
  hk.add(S(0.26, 20, 16), LT, { y: -0.15, z: 0.4, sx: 1.15, sy: 0.8, sz: 0.95 });
  // touffe de poils blancs sur le dessus (Mamie !)
  hk.add(S(0.16, 16, 12), 0xffffff, { y: 0.45, z: 0.05, sx: 1.4, sy: 0.6 });
  for (const sx of [-1, 1]) {
    hk.add(earGeo(0.16, 0.34, 0.08, 0), YD, { x: sx * 0.48, y: -0.12, z: -0.02, rz: Math.PI - sx * 0.15 });
    hk.add(S(0.08, 12, 10), PINK, { x: sx * 0.33, y: -0.14, z: 0.37, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.7 });
  }
  head.add(hk.build(NPC_FUR_HEAD));
  const fk = new Kit();
  addEyes(fk, { x: 0.18, y: 0.07, z: 0.43, r: 0.08, ry: 0.4, iris: 0x2a1608 });
  fk.add(S(0.08, 12, 10), 0x3a2010, { y: -0.06, z: 0.64, sx: 1.3, sy: 0.85 });
  for (const sx of [-1, 1]) fk.add(new THREE.TorusGeometry(0.12, 0.018, 8, 28), 0xd0a040, { x: sx * 0.18, y: 0.07, z: 0.52, ry: sx * 0.3 });
  fk.add(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), 0xd0a040, { y: 0.09, z: 0.55, rz: Math.PI / 2 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.35, -0.45); g.add(tail);
  const tk = new FurKit();
  tk.add(new THREE.CapsuleGeometry(0.08, 0.45, 6, 12), Y, { z: -0.25, rx: Math.PI / 2.2 });
  tail.add(tk.build(NPC_FUR));
  g.userData = { head, tail };
  return g;
}

export function buildPuppy() {
  const g = new THREE.Group();
  const C = 0xfaecd6, B = 0xc0905c, PINK = 0xf6a0a8;
  const bk = new FurKit();
  bk.add(new THREE.CapsuleGeometry(0.22, 0.16, 8, 18), (x, y, z, c) => c.set(Math.hypot(x - 0.12, y - 0.1, z + 0.05) < 0.16 ? B : C), { y: 0.4, rx: Math.PI / 2 });
  bk.add(new THREE.TorusGeometry(0.16, 0.035, 8, 24), 0xe04870, { y: 0.55, z: 0.18, rx: Math.PI / 2 - 0.4 });
  g.add(bk.build(NPC_FUR));
  const head = new THREE.Group(); at(head, 0, 0.82, 0.2); g.add(head);
  const hk = new FurKit();
  // tache marron autour d'un œil
  hk.add(S(0.32, 28, 20), (x, y, z, c) => c.set(Math.hypot(x + 0.12, y - 0.05) < 0.13 && z > 0 ? B : C), { sx: 1.08, sy: 0.95 });
  hk.add(S(0.13, 16, 12), 0xffffff, { y: -0.1, z: 0.25, sx: 1.2, sy: 0.8 });
  for (const sx of [-1, 1]) {
    hk.add(earGeo(0.11, 0.24, 0.05, 0), B, { x: sx * 0.3, y: -0.03, z: -0.01, rz: Math.PI - sx * 0.25 });
    hk.add(S(0.05, 10, 8), PINK, { x: sx * 0.2, y: -0.09, z: 0.25, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.7 });
  }
  head.add(hk.build(NPC_FUR_HEAD));
  const fk = new Kit();
  addEyes(fk, { x: 0.12, y: 0.03, z: 0.27, r: 0.07, ry: 0.4, iris: 0x2a1408 });
  fk.add(S(0.045, 10, 8), 0x2a1408, { y: -0.05, z: 0.37, sx: 1.3, sy: 0.85 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.5, -0.28); g.add(tail);
  const tk = new FurKit();
  tk.add(new THREE.CapsuleGeometry(0.045, 0.18, 4, 10), C, { y: 0.1, z: -0.05, rx: -0.5 });
  tail.add(tk.build(NPC_FUR));
  const legs = [];
  for (const [lx, lz] of [[-0.13, 0.13], [0.13, 0.13], [-0.13, -0.13], [0.13, -0.13]]) {
    const l = at(new THREE.Group(), lx, 0.26, lz);
    const lk = new Kit();
    lk.add(new THREE.CapsuleGeometry(0.07, 0.1, 4, 10), C, { y: -0.13 });
    l.add(lk.build());
    g.add(l); legs.push(l);
  }
  g.userData = { head, tail, legs };
  return g;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
/** Fusionne des géométries (non indexées) en une seule (pour l'instanciation). */
export function mergeGeos(list) {
  const geos = list.map(({ geo, x, y, z, rx, ry, rz, sx, sy, sz }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x || 0, y || 0, z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
    g.applyMatrix4(m);
    return g;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const hasColor = geos.every(g => g.attributes.color);
  const col = hasColor ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export function boneGeometry() {
  return mergeGeos([
    { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.62, 10, 1, true), rz: Math.PI / 2 },
    { geo: S(0.13, 12, 9), x: -0.36, y: 0.08 }, { geo: S(0.13, 12, 9), x: -0.36, y: -0.08 },
    { geo: S(0.13, 12, 9), x: 0.36, y: 0.08 }, { geo: S(0.13, 12, 9), x: 0.36, y: -0.08 },
  ]);
}

export const GOLD = () => mat(0xffc830, { metalness: 0.85, roughness: 0.22, emissive: 0x5a3a00, emissiveIntensity: 0.6 });

export function buildMedal() {
  const g = new THREE.Group();
  const gold = GOLD();
  const coin = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 40), gold);
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  const rim = mesh(new THREE.TorusGeometry(0.6, 0.06, 12, 40), gold); g.add(rim);
  // Empreinte de patte en relief sur les deux faces
  const paw = mat(0xd89a10, { metalness: 0.7, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const add = (x, y, r) => { const p = at(mesh(new THREE.CylinderGeometry(r, r, 0.05, 20), paw), x, y, side * 0.08); p.rotation.x = Math.PI / 2; g.add(p); };
    add(0, -0.1, 0.2);
    add(-0.22, 0.14, 0.08); add(-0.08, 0.26, 0.08); add(0.08, 0.26, 0.08); add(0.22, 0.14, 0.08);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.4, 3.4, 1);
  g.add(glow);
  return g;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function buildBall() {
  const g = new THREE.Group();
  g.add(mesh(S(0.32), 0xd8f040, { roughness: 0.9 }));
  const seam = mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 40), 0xffffff); seam.rotation.x = 1.1; g.add(seam);
  return g;
}

export function buildHeart() {
  const g = new THREE.Group();
  const m = mat(0xf03848, { roughness: 0.3, emissive: 0x500010, emissiveIntensity: 0.6 });
  g.add(at(mesh(S(0.22), m), -0.15, 0.08, 0));
  g.add(at(mesh(S(0.22), m), 0.15, 0.08, 0));
  const c = at(mesh(new THREE.ConeGeometry(0.31, 0.42, 24), m), 0, -0.2, 0); c.rotation.z = Math.PI; g.add(c);
  return g;
}

/** Texture de bois pour les caisses (dessinée). */
function crateTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c08848'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(90,50,20,${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 128, 30 + Math.random() * 40, 1.5); }
  x.fillStyle = '#7a4a1e';
  for (let i = 32; i < 128; i += 32) x.fillRect(0, i - 1, 128, 3);
  x.fillStyle = '#6a3c14'; x.fillRect(0, 0, 128, 12); x.fillRect(0, 116, 128, 12); x.fillRect(0, 0, 12, 128); x.fillRect(116, 0, 12, 128);
  x.save(); x.translate(64, 64); x.rotate(Math.PI / 4); x.fillRect(-80, -6, 160, 12); x.restore();
  x.fillStyle = '#c8c0b0';
  for (const [a, b] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { x.beginPath(); x.arc(a, b, 3, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let crateMat = null;
export function buildCrate() {
  if (!crateMat) crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildSign(text) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 10), 0x7a4a24), 0, 0.8, 0));
  const board = at(mesh(new THREE.BoxGeometry(1.4, 0.8, 0.12), 0xc08c58), 0, 1.5, 0);
  g.add(board);
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.07, 0.02), 0x5a3418), 0, 1.6, 0.07));
  g.add(at(mesh(new THREE.BoxGeometry(0.8, 0.07, 0.02), 0x5a3418), 0, 1.42, 0.07));
  g.userData.text = text;
  return g;
}

export function buildPedestal() {
  const g = new THREE.Group();
  const stone = mat(0xd8d0c0, { roughness: 0.6 });
  g.add(at(mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.6, 24), stone), 0, 0.3, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 24), stone), 0, 1.0, 0));
  const ring = at(mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), GOLD()), 0, 1.5, 0);
  ring.rotation.x = Math.PI / 2; g.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(at(mesh(S(0.14, 12, 8), 0x8a8270), Math.cos(a) * 0.95, 0.62, Math.sin(a) * 0.95));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Modèles sculptés (générés par tools/build-dogs.mjs) : chargement et décodage
// ---------------------------------------------------------------------------
let dogData = null;
export async function preloadDogs() {
  if (dogData) return dogData;
  const lite = document.documentElement.classList.contains('touch');
  const res = await fetch(new URL(lite ? './assets/dogs-lite.json' : './assets/dogs.json', import.meta.url));
  dogData = await res.json();
  return dogData;
}
const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
const geoCache = new Map();
/** Géométrie d'une partie sculptée, dans le repère du personnage. */
export function sculptGeo(name) {
  if (geoCache.has(name)) return geoCache.get(name);
  const d = dogData.parts[name];
  const P = new Uint16Array(b64(d.pos)), N = new Int8Array(b64(d.nrm)), Co = new Uint8Array(b64(d.col));
  const pos = new Float32Array(d.n * 3), nrm = new Float32Array(d.n * 3), col = new Float32Array(d.n * 3);
  for (let i = 0; i < d.n * 3; i++) {
    const k = i % 3;
    pos[i] = d.min[k] + (P[i] / 65535) * (d.max[k] - d.min[k]);
    nrm[i] = N[i] / 127;
    col[i] = Co[i] / 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(d.big ? new Uint32Array(b64(d.idx)) : new Uint16Array(b64(d.idx)), 1));
  geoCache.set(name, g);
  return g;
}
/** Maillage d'une partie sculptée, recentré sur son pivot. */
export function sculptMesh(name, pivot, rough) {
  const m = new THREE.Mesh(sculptGeo(name), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough || 0.85 }));
  m.position.set(-pivot[0], -pivot[1], -pivot[2]);
  m.castShadow = m.receiveShadow = true;
  return m;
}
