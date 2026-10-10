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
const gloss = () => glossMat || (glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }));

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
// Le duo : Ainu (eurasier roux) avec Matcha (pinscher) sur le dos
// Repère : avant = +z, pattes au sol en y = 0
// ---------------------------------------------------------------------------
export function buildDuo() {
  const root = new THREE.Group();
  const ainu = new THREE.Group();
  root.add(ainu);
  const OR = 0xe0702e, OR_D = 0xc85a22, CR = 0xfbe6c8, PINK = 0xf6a0a8, DK = 0x2a1810;

  // Corps : haricot lisse, ventre et poitrail crème
  const bodyK = new Kit();
  // (capsule couchée : y local = avant, z local = bas)
  bodyK.add(new THREE.CapsuleGeometry(0.42, 0.36, 10, 24), (x, y, z, c) => mix(c, OR, CR, Math.max(sstep(0.12, 0.32, z), sstep(0.2, 0.45, y) * sstep(-0.1, 0.1, z))), { y: 0.82, rx: Math.PI / 2, sx: 0.95 });
  // collerette (le pelage épais du cou), crème devant
  bodyK.add(S(0.44, 28, 20), (x, y, z, c) => mix(c, OR, CR, sstep(0.1, 0.35, z) * sstep(0.15, -0.15, y)), { y: 1.08, z: 0.45, sx: 1.05, sy: 0.95 });
  // bandana bleu noué au cou
  bodyK.add(new THREE.ConeGeometry(0.3, 0.36, 20), 0x2d6ae0, { y: 0.98, z: 0.8, rx: Math.PI + 0.25, sz: 0.35 });
  bodyK.add(new THREE.TorusGeometry(0.37, 0.065, 10, 32), 0x2d6ae0, { y: 1.12, z: 0.5, rx: Math.PI / 2 - 0.3 });
  const body = bodyK.build();
  ainu.add(body);

  // Tête : grosse et ronde, masque crème en bas du visage
  const head = new THREE.Group(); at(head, 0, 1.52, 0.62); ainu.add(head);
  const headK = new Kit();
  headK.add(S(0.55, 32, 24), (x, y, z, c) => mix(c, OR, CR, sstep(0.1, 0.35, z) * sstep(0.02, -0.18, y + Math.abs(x) * 0.25)), { sx: 1.08, sy: 0.95, sz: 0.95 });
  // joues douces (fourrure crème sur les côtés)
  headK.add(S(0.19, 20, 16), CR, { y: -0.15, z: 0.44, sx: 1.15, sy: 0.78, sz: 0.8 }); // museau court
  headK.add(S(0.075, 12, 10), 0xf06a80, { y: -0.3, z: 0.52, sx: 1, sy: 0.45, sz: 0.9 });  // petite langue
  for (const sx of [-1, 1]) {
    headK.add(earGeo(0.19, 0.3, 0.09, 1), (x, y, z, c) => c.set(y > 0.2 ? OR_D : OR), { x: sx * 0.33, y: 0.42, z: -0.02, rz: -sx * 0.32 });
    headK.add(earGeo(0.1, 0.2, 0.04, 1), PINK, { x: sx * 0.31, y: 0.42, z: 0.05, rz: -sx * 0.32 });
    headK.add(S(0.085, 14, 10), PINK, { x: sx * 0.36, y: -0.1, z: 0.39, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.75 }); // joues roses
  }
  head.add(headK.build());
  const faceK = new Kit();
  addEyes(faceK, { x: 0.2, y: 0.04, z: 0.47, r: 0.105, ry: 0.4 });
  faceK.add(S(0.075, 14, 12), DK, { y: -0.04, z: 0.66, sx: 1.35, sy: 0.9, sz: 0.9 }); // truffe
  head.add(faceK.build(gloss()));

  // Queue en panache enroulé (pivot à la base ; sert d'hélice pour planer)
  const tail = new THREE.Group(); at(tail, 0, 1.15, -0.6); ainu.add(tail);
  const tt = taperTube([[0, 0, 0], [0, 0.18, -0.12], [0, 0.38, -0.1], [0, 0.48, 0.05], [0, 0.42, 0.2]], (t) => 0.08 + Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.08, 28, 16);
  const tailK = new Kit();
  const tailCol = (x, y, z, c) => mix(c, OR, CR, sstep(0.36, 0.46, y) * sstep(0.0, 0.15, z));
  tailK.add(tt.tube, tailCol);
  tailK.add(S(tt.r1 + 0.005, 14, 10), CR, { x: tt.end.x, y: tt.end.y, z: tt.end.z });
  tailK.add(S(tt.r0, 14, 10), OR, { x: tt.start.x, y: tt.start.y, z: tt.start.z });
  tail.add(tailK.build());

  // Pattes courtes (pivot à la hanche), chaussettes crème
  const legs = [];
  for (const [lx, lz] of [[-0.24, 0.36], [0.24, 0.36], [-0.24, -0.34], [0.24, -0.34]]) {
    const g = at(new THREE.Group(), lx, 0.46, lz);
    const lk = new Kit();
    lk.add(new THREE.CapsuleGeometry(0.13, 0.2, 8, 16), (x, y, z, c) => mix(c, OR, CR, sstep(-0.1, -0.2, y)), { y: -0.2 });
    lk.add(S(0.15, 16, 12), CR, { y: -0.4, z: 0.05, sx: 1, sy: 0.6, sz: 1.2 });
    g.add(lk.build());
    ainu.add(g);
    legs.push(g);
  }

  // Matcha, perchée sur le dos
  const matcha = new THREE.Group(); at(matcha, 0, 1.38, -0.22); ainu.add(matcha);
  const BK = 0x23202c, TAN = 0xd27a34;
  const mk = new Kit();
  mk.add(new THREE.CapsuleGeometry(0.2, 0.22, 8, 18), (x, y, z, c) => mix(c, BK, TAN, sstep(0.1, 0.25, y) * sstep(-0.05, 0.1, z)), { y: 0.1, rx: Math.PI / 2 });
  mk.add(new THREE.TorusGeometry(0.15, 0.04, 10, 24), 0x7cc040, { y: 0.27, z: 0.17, rx: Math.PI / 2 - 0.5 });
  mk.add(new THREE.CapsuleGeometry(0.04, 0.14, 4, 10), BK, { y: 0.26, z: -0.3, rx: -0.6 });
  matcha.add(mk.build());
  const tag = at(new THREE.Mesh(S(0.05, 12, 10), GOLD()), 0, 0.17, 0.32); matcha.add(tag);
  const mhead = new THREE.Group(); at(mhead, 0, 0.47, 0.2); matcha.add(mhead);
  const mhk = new Kit();
  mhk.add(S(0.3, 28, 22), (x, y, z, c) => {
    // masque feu : museau, joues et deux points au-dessus des yeux
    let k = sstep(0.12, 0.24, z) * sstep(-0.02, -0.12, y);
    const brow = Math.hypot(Math.abs(x) - 0.11, y - 0.13);
    k = Math.max(k, z > 0.1 ? sstep(0.06, 0.035, brow) : 0);
    mix(c, BK, TAN, k);
  }, { sx: 1.05, sy: 0.95 });
  mhk.add(S(0.13, 18, 14), TAN, { y: -0.1, z: 0.25, sx: 1.15, sy: 0.8, sz: 1 });
  for (const sx of [-1, 1]) {
    mhk.add(earGeo(0.11, 0.3, 0.045, 1), BK, { x: sx * 0.17, y: 0.26, z: -0.03, rz: -sx * 0.22 });
    mhk.add(earGeo(0.06, 0.2, 0.02, 1), PINK, { x: sx * 0.165, y: 0.27, z: 0.0, rz: -sx * 0.22 });
    mhk.add(S(0.05, 12, 10), PINK, { x: sx * 0.2, y: -0.07, z: 0.21, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.75 });
  }
  mhead.add(mhk.build());
  const mfk = new Kit();
  addEyes(mfk, { x: 0.11, y: 0.03, z: 0.255, r: 0.07, ry: 0.4, iris: 0x0a0606 });
  mfk.add(S(0.045, 12, 10), 0x0a0808, { y: -0.04, z: 0.37, sx: 1.3, sy: 0.9 });
  mhead.add(mfk.build(gloss()));
  const mlegs = [];
  for (const sx of [-1, 1]) for (const lz of [0.14, -0.14]) {
    const g = at(new THREE.Group(), sx * 0.15, 0.03, lz);
    const lk = new Kit();
    lk.add(new THREE.CapsuleGeometry(0.055, 0.12, 4, 12), (x, y, z, c) => mix(c, BK, TAN, sstep(-0.05, -0.1, y)), { y: -0.1 });
    g.add(lk.build());
    g.rotation.z = sx * 0.5;
    matcha.add(g);
    mlegs.push(g);
  }

  root.userData = { ainu, head, tail, legs, matcha, mhead, mlegs, body };
  return root;
}

// ---------------------------------------------------------------------------
// Chat bandit (masque noir, queue rayée, bandana de pirate)
// ---------------------------------------------------------------------------
export function buildCat() {
  const g = new THREE.Group();
  const GR = 0x9a9ab0, DK = 0x34344a, WH = 0xf2f2f8, PINK = 0xf6a0b0;
  const bk = new Kit();
  bk.add(new THREE.CapsuleGeometry(0.28, 0.22, 8, 18), (x, y, z, c) => mix(c, GR, WH, sstep(0.08, 0.22, z)), { y: 0.48, rx: Math.PI / 2 });
  g.add(bk.build());
  const head = new THREE.Group(); at(head, 0, 0.95, 0.28); g.add(head);
  const hk = new Kit();
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
    for (const dy of [-0.025, 0.025]) hk.add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), 0xffffff, { x: sx * 0.32, y: -0.12 + dy, z: 0.3, rz: Math.PI / 2 + sx * dy * 5 });
  }
  head.add(hk.build());
  const fk = new Kit();
  addEyes(fk, { x: 0.15, y: 0.06, z: 0.34, r: 0.075, ry: 0.42, iris: 0x2a5a10, white: true });
  fk.add(S(0.045, 10, 8), 0xff7a98, { y: -0.07, z: 0.43, sx: 1.3, sy: 0.8 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.6, -0.42); g.add(tail);
  const tt = taperTube([[0, 0, 0], [0, 0.2, -0.15], [0, 0.45, -0.12], [0, 0.6, 0.02]], (t) => 0.08 - t * 0.02, 24, 12);
  const tk = new Kit();
  tk.add(tt.tube, (x, y, z, c) => c.set(Math.floor((y + 0.03) / 0.12) % 2 ? DK : GR));
  tk.add(S(tt.r1, 12, 8), DK, { x: tt.end.x, y: tt.end.y, z: tt.end.z });
  tail.add(tk.build());
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
  const bk = new Kit();
  bk.add(new THREE.CapsuleGeometry(0.5, 0.35, 10, 24), (x, y, z, c) => mix(c, Y, LT, sstep(0.2, 0.4, z) * sstep(0.4, 0.1, y)), { y: 0.82, sx: 1, sz: 0.9 });
  for (const sx of [-1, 1]) {
    bk.add(new THREE.CapsuleGeometry(0.13, 0.32, 6, 14), (x, y, z, c) => mix(c, Y, LT, sstep(-0.15, -0.25, y)), { x: sx * 0.24, y: 0.3, z: 0.38 });
    bk.add(S(0.3, 20, 16), Y, { x: sx * 0.38, y: 0.3, z: -0.1, sx: 0.8, sy: 0.8, sz: 1.25 });
  }
  bk.add(new THREE.TorusGeometry(0.36, 0.11, 12, 30), (x, y, z, c) => c.set(((Math.atan2(y, x) * 6 / Math.PI) | 0) % 2 ? 0xe04848 : 0xc83434), { y: 1.42, z: 0.05, rx: Math.PI / 2 });
  bk.add(new THREE.ConeGeometry(0.22, 0.32, 16), 0xd03c3c, { y: 1.2, z: 0.42, rx: Math.PI + 0.3, sz: 0.4 });
  g.add(bk.build());
  const head = new THREE.Group(); at(head, 0, 1.85, 0.12); g.add(head);
  const hk = new Kit();
  hk.add(S(0.5, 30, 22), (x, y, z, c) => mix(c, Y, LT, sstep(0.15, 0.35, z) * sstep(0.0, -0.2, y)), { sx: 1.08, sy: 0.95, sz: 0.95 });
  hk.add(S(0.26, 20, 16), LT, { y: -0.15, z: 0.4, sx: 1.15, sy: 0.8, sz: 0.95 });
  // touffe de poils blancs sur le dessus (Mamie !)
  hk.add(S(0.16, 16, 12), 0xffffff, { y: 0.45, z: 0.05, sx: 1.4, sy: 0.6 });
  for (const sx of [-1, 1]) {
    hk.add(earGeo(0.16, 0.34, 0.08, 0), YD, { x: sx * 0.48, y: -0.12, z: -0.02, rz: Math.PI - sx * 0.15 });
    hk.add(S(0.08, 12, 10), PINK, { x: sx * 0.33, y: -0.14, z: 0.37, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.7 });
  }
  head.add(hk.build());
  const fk = new Kit();
  addEyes(fk, { x: 0.18, y: 0.07, z: 0.43, r: 0.08, ry: 0.4, iris: 0x2a1608 });
  fk.add(S(0.08, 12, 10), 0x3a2010, { y: -0.06, z: 0.64, sx: 1.3, sy: 0.85 });
  for (const sx of [-1, 1]) fk.add(new THREE.TorusGeometry(0.12, 0.018, 8, 28), 0xd0a040, { x: sx * 0.18, y: 0.07, z: 0.52, ry: sx * 0.3 });
  fk.add(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), 0xd0a040, { y: 0.09, z: 0.55, rz: Math.PI / 2 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.35, -0.45); g.add(tail);
  const tk = new Kit();
  tk.add(new THREE.CapsuleGeometry(0.08, 0.45, 6, 12), Y, { z: -0.25, rx: Math.PI / 2.2 });
  tail.add(tk.build());
  g.userData = { head, tail };
  return g;
}

export function buildPuppy() {
  const g = new THREE.Group();
  const C = 0xfaecd6, B = 0xc0905c, PINK = 0xf6a0a8;
  const bk = new Kit();
  bk.add(new THREE.CapsuleGeometry(0.22, 0.16, 8, 18), (x, y, z, c) => c.set(Math.hypot(x - 0.12, y - 0.1, z + 0.05) < 0.16 ? B : C), { y: 0.4, rx: Math.PI / 2 });
  bk.add(new THREE.TorusGeometry(0.16, 0.035, 8, 24), 0xe04870, { y: 0.55, z: 0.18, rx: Math.PI / 2 - 0.4 });
  g.add(bk.build());
  const head = new THREE.Group(); at(head, 0, 0.82, 0.2); g.add(head);
  const hk = new Kit();
  // tache marron autour d'un œil
  hk.add(S(0.32, 28, 20), (x, y, z, c) => c.set(Math.hypot(x + 0.12, y - 0.05) < 0.13 && z > 0 ? B : C), { sx: 1.08, sy: 0.95 });
  hk.add(S(0.13, 16, 12), 0xffffff, { y: -0.1, z: 0.25, sx: 1.2, sy: 0.8 });
  for (const sx of [-1, 1]) {
    hk.add(earGeo(0.11, 0.24, 0.05, 0), B, { x: sx * 0.3, y: -0.03, z: -0.01, rz: Math.PI - sx * 0.25 });
    hk.add(S(0.05, 10, 8), PINK, { x: sx * 0.2, y: -0.09, z: 0.25, sx: 1.2, sy: 0.6, sz: 0.4, ry: sx * 0.7 });
  }
  head.add(hk.build());
  const fk = new Kit();
  addEyes(fk, { x: 0.12, y: 0.03, z: 0.27, r: 0.07, ry: 0.4, iris: 0x2a1408 });
  fk.add(S(0.045, 10, 8), 0x2a1408, { y: -0.05, z: 0.37, sx: 1.3, sy: 0.85 });
  head.add(fk.build(gloss()));
  const tail = new THREE.Group(); at(tail, 0, 0.5, -0.28); g.add(tail);
  const tk = new Kit();
  tk.add(new THREE.CapsuleGeometry(0.045, 0.18, 4, 10), C, { y: 0.1, z: -0.05, rx: -0.5 });
  tail.add(tk.build());
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
