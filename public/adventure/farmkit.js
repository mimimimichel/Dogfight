/*
 * Matcha & Ainu — Niveau 7 « La Ferme de Papi Berger » : les modèles 3D
 * (moutons, poules, canards, vaches, cochons, Papi Berger, tracteur, grange,
 * maison, poulailler, moulin, tournesols…). Formes lisses et couleurs peintes
 * sur les sommets : un seul maillage par objet (léger sur téléphone).
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import * as FACE from './lifeface.js';

const _c = new THREE.Color(), _c2 = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, k) => a + (b - a) * k, c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/** Peint les sommets d'une géométrie (couleur fixe ou fonction (x, y, z, couleur)). */
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    if (typeof color === 'function') color(p.getX(i), p.getY(i), p.getZ(i), _c); else _c.set(color);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** Petit assembleur : des morceaux peints, fusionnés en une seule géométrie. */
export class Kit {
  constructor() { this.list = []; }
  add(geo, color, t) { this.list.push(Object.assign({ geo: paint(geo, color) }, t || {})); return this; }
  geo() { return M.mergeGeos(this.list); }
  mesh(mat) { const m = new THREE.Mesh(this.geo(), mat || vmat()); m.castShadow = true; m.receiveShadow = true; return m; }
}
const mats = {};
/** Matériau à couleurs de sommets (mis en cache par rugosité). */
export function vmat(rough) { const k = 'v' + (rough || 0.8); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough || 0.8 })); }
/** Yeux brillants (pas de contour en mode dessin animé). */
export function glossMat() { return mats.gloss || (mats.gloss = Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 }), { userData: { gloss: true } })); }
const Sph = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 12);
const E = (rx, ry, rz, w, h) => { const g = new THREE.SphereGeometry(1, w || 20, h || 14); g.scale(rx, ry, rz); return g; };
const Cap = (r, l, a, b) => new THREE.CapsuleGeometry(r, l, a || 4, b || 10);
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 12);
function eyes(k, o) {
  for (const sx of [-1, 1]) {
    k.add(Sph(o.r, 12, 10), o.iris || 0x1a120e, { x: sx * o.x, y: o.y, z: o.z, sx: 0.9, sy: 1.1, sz: 0.55, ry: sx * (o.ry || 0.35) });
    k.add(Sph(o.r * 0.35, 8, 6), 0xffffff, { x: sx * o.x + o.r * 0.25, y: o.y + o.r * 0.4, z: o.z + o.r * 0.42 });
  }
}

// ---------------------------------------------------------------------------
// Moutons (instanciés) : laine bouclée, tête sombre, pattes
// ---------------------------------------------------------------------------
/** Géométries d'un mouton : laine (corps), tête (pivot au cou), patte (pivot en haut). */
export function sheepGeos(lite) {
  const wool = new Kit();
  const det = lite ? 1 : 2;
  const puff = (r, x, y, z) => {
    const g = new THREE.IcosahedronGeometry(r, det);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const n = vnoise((vx + x) * 7, (vy + y) * 7, (vz + z) * 7);
      const k = 1 + (n - 0.5) * 0.28;
      p.setXYZ(i, vx * k, vy * k, vz * k);
    }
    g.computeVertexNormals();
    wool.add(g, (px, py, pz, c) => { const n = vnoise((px + x) * 5, (py + y) * 5, (pz + z) * 5); c.setRGB(0.95 + n * 0.05, 0.93 + n * 0.05, 0.86 + n * 0.06); }, { x, y, z });
  };
  puff(0.5, 0, 0.78, 0);
  puff(0.42, 0, 0.84, 0.32); puff(0.42, 0, 0.8, -0.34);
  for (const sx of [-1, 1]) { puff(0.32, sx * 0.3, 0.72, 0.18); puff(0.3, sx * 0.3, 0.74, -0.24); puff(0.26, sx * 0.18, 1.04, 0.05); }
  puff(0.24, 0, 1.08, -0.3); puff(0.24, 0, 1.06, 0.36); puff(0.2, 0, 0.78, -0.62);
  const head = new Kit();
  const FACE = 0x3a2e28, EAR = 0x4a3a32;
  head.add(E(0.17, 0.2, 0.26), FACE, { y: -0.04, z: 0.14, rx: 0.35 });
  head.add(E(0.12, 0.1, 0.1), 0x2a221e, { y: -0.13, z: 0.34 });
  for (const sx of [-1, 1]) {
    head.add(E(0.13, 0.05, 0.07), EAR, { x: sx * 0.2, y: 0.04, z: 0.05, rz: sx * -0.4 });
    head.add(Sph(0.045, 10, 8), 0x0a0806, { x: sx * 0.11, y: 0.03, z: 0.27 });
    head.add(Sph(0.016, 6, 4), 0xffffff, { x: sx * 0.11 + 0.012, y: 0.05, z: 0.31 });
  }
  // houppette de laine sur le front
  const tuft = new THREE.IcosahedronGeometry(0.15, det);
  head.add(tuft, 0xf6f2e8, { y: 0.15, z: 0.04, sy: 0.8 });
  const leg = paint(Cap(0.065, 0.36, 3, 8).translate(0, -0.25, 0), (x, y, z, c) => c.set(y < -0.36 ? 0x1e1814 : 0x3a2e28));
  return { wool: wool.geo(), head: head.geo(), leg };
}

// ---------------------------------------------------------------------------
// Poules, canards, œufs, pommes (instanciés)
// ---------------------------------------------------------------------------
export function henGeo() {
  const k = new Kit();
  const W = 0xfaf6ee;
  k.add(E(0.2, 0.18, 0.24), W, { y: 0.3 });
  k.add(E(0.13, 0.15, 0.08), W, { y: 0.4, z: -0.2, rx: -0.6 });                    // queue
  for (const sx of [-1, 1]) k.add(E(0.04, 0.11, 0.17), 0xf0eadc, { x: sx * 0.19, y: 0.31, z: -0.02 });
  k.add(Sph(0.11, 14, 10), W, { y: 0.55, z: 0.14 });                                // tête
  for (let i = 0; i < 3; i++) k.add(Sph(0.04, 8, 6), 0xe0302a, { y: 0.66 + (i === 1 ? 0.02 : 0), z: 0.1 + i * 0.05 });   // crête
  k.add(new THREE.ConeGeometry(0.035, 0.09, 8), 0xf0a020, { y: 0.54, z: 0.27, rx: Math.PI / 2 });   // bec
  k.add(E(0.025, 0.04, 0.02), 0xe0302a, { y: 0.48, z: 0.22 });                       // barbillon
  for (const sx of [-1, 1]) {
    k.add(Sph(0.022, 8, 6), 0x111111, { x: sx * 0.07, y: 0.58, z: 0.22 });
    k.add(Cyl(0.014, 0.014, 0.16, 6), 0xf0a020, { x: sx * 0.07, y: 0.1, z: 0.02 });
    k.add(Box(0.07, 0.02, 0.09), 0xf0a020, { x: sx * 0.07, y: 0.015, z: 0.05 });
  }
  return k.geo();
}
export function duckGeo() {
  const k = new Kit();
  const W = 0xffffff;
  k.add(E(0.2, 0.13, 0.28), W, { y: 0.1 });
  k.add(E(0.09, 0.08, 0.11), W, { y: 0.17, z: -0.24, rx: -0.5 });
  k.add(Sph(0.11, 14, 10), W, { y: 0.32, z: 0.18 });
  k.add(E(0.06, 0.025, 0.09), 0xf0a020, { y: 0.29, z: 0.32 });
  for (const sx of [-1, 1]) k.add(Sph(0.02, 6, 5), 0x111111, { x: sx * 0.07, y: 0.35, z: 0.25 });
  return k.geo();
}
export function eggGeo() { return paint(E(0.085, 0.11, 0.085, 12, 9), 0xfaf0dc); }
export function appleGeo() {
  const k = new Kit();
  const g = Sph(0.19, 12, 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * 0.92 - (Math.abs(y) > 0.12 ? 0.02 * Math.sign(y) : 0)); }
  g.computeVertexNormals();
  k.add(g, (x, y, z, c) => c.set(0xd8282a).lerp(_c2.set(0xf0a028), sstep(0.0, -0.15, x + y * 0.4) * 0.5));
  k.add(Cyl(0.014, 0.014, 0.1, 5), 0x5a3a1a, { y: 0.19 });
  k.add(E(0.08, 0.014, 0.04), 0x4caa30, { x: 0.06, y: 0.2, rz: -0.4 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Vaches (Margot a une couronne de fleurs et une cloche)
// ---------------------------------------------------------------------------
export function buildCow(o) {
  o = o || {};
  const g = new THREE.Group();
  const WH = 0xfaf6ee, BK = 0x2a2420, PINK = 0xf2a8a8;
  const spot = (x, y, z) => vnoise(x * 2.1 + (o.seed || 0), y * 2.1, z * 2.1) > 0.58;
  const body = new Kit();
  body.add(Cap(0.55, 1.1, 8, 18), (x, y, z, c) => c.set(spot(x, y, z) ? (o.brown ? 0x8a5a32 : BK) : WH), { y: 1.15, rx: Math.PI / 2 });
  body.add(E(0.3, 0.16, 0.3), PINK, { y: 0.66, z: -0.35 });                         // mamelle
  g.add(body.mesh());
  const head = new THREE.Group(); head.position.set(0, 1.45, 0.95); g.add(head);
  const hk = new Kit();
  hk.add(E(0.33, 0.32, 0.38), (x, y, z, c) => c.set(spot(x + 3, y, z) && z < 0.1 ? BK : WH), { y: 0.02 });
  hk.add(E(0.27, 0.2, 0.2), PINK, { y: -0.14, z: 0.28 });
  for (const sx of [-1, 1]) {
    hk.add(Sph(0.035, 8, 6), 0x7a3a3a, { x: sx * 0.1, y: -0.12, z: 0.47 });
    hk.add(E(0.17, 0.06, 0.1), WH, { x: sx * 0.36, y: 0.1, z: -0.05, rz: sx * -0.35 });
    hk.add(new THREE.ConeGeometry(0.05, 0.18, 8), 0xf0e0b0, { x: sx * 0.2, y: 0.33, z: -0.08, rz: sx * -0.5 });
  }
  if (o.flowers) {
    const cols = [0xff7aa8, 0xffe040, 0xffffff, 0xb48aff, 0xff9a4a];
    for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22; hk.add(Sph(0.06, 8, 6), cols[i % cols.length], { x: Math.sin(a) * 0.3, y: 0.3 + Math.cos(a * 2) * 0.02, z: Math.cos(a) * 0.12 - 0.08 }); }
  }
  head.add(hk.mesh());
  const fk = new Kit();
  eyes(fk, { x: 0.15, y: 0.1, z: 0.3, r: 0.06 });
  head.add(fk.mesh(glossMat()));
  if (o.bell) {
    const bell = new THREE.Mesh(Cyl(0.08, 0.13, 0.16, 12), M.GOLD());
    bell.position.set(0, -0.42, 0.12); head.add(bell);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20), M.mat(0x8a3a2a));
    strap.rotation.x = Math.PI / 2 - 0.3; strap.position.set(0, -0.2, -0.05); head.add(strap);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.45, -1.05); g.add(tail);
  const tk = new Kit();
  tk.add(Cyl(0.03, 0.03, 0.7, 6), WH, { y: -0.35 });
  tk.add(E(0.07, 0.13, 0.07), BK, { y: -0.72 });
  tail.add(tk.mesh());
  const legs = [];
  for (const [x, z] of [[-0.32, 0.55], [0.32, 0.55], [-0.32, -0.55], [0.32, -0.55]]) {
    const l = new THREE.Group(); l.position.set(x, 0.85, z); g.add(l);
    const lk = new Kit();
    lk.add(Cap(0.12, 0.6, 4, 10), (px, y, pz, c) => c.set(y < -0.32 ? 0x3a3028 : WH), { y: -0.42 });
    l.add(lk.mesh()); legs.push(l);
  }
  g.userData = { head, tail, legs, height: 2.2 };
  return g;
}

// ---------------------------------------------------------------------------
// Cochons (les grands et Caramel le cochonnet)
// ---------------------------------------------------------------------------
export function buildPig(o) {
  o = o || {};
  const g = new THREE.Group();
  const PK = o.color || 0xf4b0b0, DK = 0xd88888;
  const body = new Kit();
  body.add(Cap(0.38, 0.55, 8, 16), (x, y, z, c) => { c.set(PK); if (o.spot && Math.hypot(x - 0.2, y - 0.15, z + 0.1) < 0.25) c.set(0xc08a50); }, { y: 0.52, rx: Math.PI / 2 });
  if (o.bow) body.add(new THREE.TorusGeometry(0.2, 0.04, 8, 20), 0x3a8ae0, { y: 0.7, z: 0.42, rx: Math.PI / 2 - 0.3 });
  g.add(body.mesh());
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.62); g.add(head);
  const hk = new Kit();
  hk.add(Sph(0.33, 18, 14), PK, { sx: 1.05, sy: 0.95 });
  hk.add(Cyl(0.15, 0.16, 0.12, 16), DK, { z: 0.31, rx: Math.PI / 2 });
  for (const sx of [-1, 1]) {
    hk.add(E(0.03, 0.05, 0.02), 0x8a4a4a, { x: sx * 0.055, z: 0.375 });
    hk.add(new THREE.ConeGeometry(0.12, 0.2, 10), PK, { x: sx * 0.2, y: 0.28, z: 0.02, rz: sx * -0.5, rx: 0.4, sz: 0.4 });
    hk.add(E(0.06, 0.04, 0.02), 0xff9ab0, { x: sx * 0.22, y: -0.05, z: 0.27 });
  }
  head.add(hk.mesh());
  const fk = new Kit();
  eyes(fk, { x: 0.13, y: 0.09, z: 0.27, r: 0.05 });
  head.add(fk.mesh(glossMat()));
  const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.62); g.add(tail);
  const tk = new Kit();
  tk.add(new THREE.TorusGeometry(0.07, 0.025, 6, 14, Math.PI * 1.6), PK, { z: -0.04, ry: Math.PI / 2 });
  tail.add(tk.mesh());
  const legs = [];
  for (const [x, z] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) {
    const l = new THREE.Group(); l.position.set(x, 0.3, z); g.add(l);
    const lk = new Kit();
    lk.add(Cap(0.08, 0.14, 3, 8), (px, y, pz, c) => c.set(y < -0.17 ? 0x8a5a5a : PK), { y: -0.16 });
    l.add(lk.mesh()); legs.push(l);
  }
  g.scale.setScalar(o.scale || 1);
  g.userData = { head, tail, legs, height: 1.0 * (o.scale || 1) };
  return g;
}

// ---------------------------------------------------------------------------
// Papi Berger : un vieux border collie, assis, chapeau de paille et foulard
// ---------------------------------------------------------------------------
export function buildPapi() {
  const g = new THREE.Group();
  const BK = 0x23201e, WH = 0xf6f2ea, GR = 0xc8c4bc;
  const body = new Kit();
  body.add(Cap(0.46, 0.35, 10, 20), (x, y, z, c) => c.set(z > 0.18 && Math.abs(x) < 0.32 ? WH : BK), { y: 0.8, sz: 0.9 });
  for (const sx of [-1, 1]) {
    body.add(Cap(0.12, 0.3, 6, 12), (x, y, z, c) => c.set(y < -0.12 ? WH : BK), { x: sx * 0.22, y: 0.3, z: 0.36 });
    body.add(Sph(0.28, 18, 14), BK, { x: sx * 0.34, y: 0.3, z: -0.1, sx: 0.8, sy: 0.8, sz: 1.2 });
    body.add(E(0.11, 0.06, 0.16), WH, { x: sx * 0.24, y: 0.05, z: 0.46 });
  }
  // foulard bleu à carreaux
  body.add(new THREE.TorusGeometry(0.33, 0.1, 10, 28), (x, y, z, c) => c.set((Math.floor(x * 14) + Math.floor(z * 14)) % 2 ? 0x3a6ad0 : 0xf0f4ff), { y: 1.32, z: 0.05, rx: Math.PI / 2 });
  body.add(new THREE.ConeGeometry(0.2, 0.3, 14), 0x3a6ad0, { y: 1.12, z: 0.38, rx: Math.PI + 0.3, sz: 0.4 });
  g.add(body.mesh());
  const head = new THREE.Group(); head.position.set(0, 1.72, 0.1); g.add(head);
  const hk = new Kit();
  // tête noire, liste blanche au milieu, museau blanc (le gris des vieux jours autour)
  hk.add(Sph(0.44, 26, 20), (x, y, z, c) => {
    const blaze = Math.abs(x) < 0.07 + Math.max(0, -y) * 0.3 && z > 0.1;
    c.set(blaze ? WH : BK);
    if (!blaze && z > 0.25 && y < 0.05) c.lerp(_c2.set(GR), 0.6);
  }, { sx: 1.05, sy: 0.95 });
  hk.add(E(0.2, 0.15, 0.24), WH, { y: -0.13, z: 0.36 });
  hk.add(Sph(0.07, 10, 8), 0x1a1210, { y: -0.06, z: 0.6, sx: 1.3, sy: 0.85 });
  for (const sx of [-1, 1]) {
    // oreilles à demi dressées, la pointe qui retombe
    hk.add(E(0.13, 0.22, 0.06), BK, { x: sx * 0.3, y: 0.36, z: -0.02, rz: sx * -0.3 });
    hk.add(E(0.1, 0.1, 0.05), BK, { x: sx * 0.38, y: 0.5, z: 0.06, rz: sx * -1.2, rx: 0.4 });
    hk.add(E(0.1, 0.035, 0.04), 0xf2f2f2, { x: sx * 0.15, y: 0.2, z: 0.37, rz: sx * 0.25 });   // gros sourcils blancs
  }
  // brin de paille au coin de la bouche
  hk.add(Cyl(0.012, 0.012, 0.42, 5), 0xf0d060, { x: 0.18, y: -0.22, z: 0.5, rz: 1.25, ry: 0.4 });
  head.add(hk.mesh());
  // les yeux (un maillage à part, centré sur leur ligne : ils clignent tout seuls)
  const ek = new Kit(), eo = { x: 0.16, y: 0.09, z: 0.38, r: 0.065 };
  for (const sx of [-1, 1]) {
    ek.add(Sph(eo.r, 12, 10), 0x3a2410, { x: sx * eo.x, sx: 0.9, sy: 1.1, sz: 0.55, ry: sx * 0.35 });
    ek.add(Sph(eo.r * 0.35, 8, 6), 0xffffff, { x: sx * eo.x + eo.r * 0.25, y: eo.r * 0.4, z: eo.r * 0.42 });
  }
  const eyeM = ek.mesh(glossMat()); eyeM.position.set(0, eo.y, eo.z); FACE.selfBlink(eyeM); head.add(eyeM);
  // chapeau de paille
  const hat = new Kit();
  const straw = (x, y, z, c) => c.set(0xe8c868).multiplyScalar(0.85 + vnoise(x * 30, y * 30, z * 30) * 0.25);
  hat.add(Cyl(0.62, 0.62, 0.04, 28), straw, { y: 0.0 });
  hat.add(Cyl(0.3, 0.34, 0.26, 22), straw, { y: 0.14 });
  hat.add(Cyl(0.345, 0.345, 0.07, 22), 0xd03a2a, { y: 0.05 });
  const hatM = hat.mesh(); hatM.position.set(0, 0.36, -0.02); hatM.rotation.x = -0.12; head.add(hatM);
  const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.45); g.add(tail);
  const tk = new Kit();
  tk.add(Cap(0.1, 0.5, 6, 12), (x, y, z, c) => c.set(y > 0.25 ? WH : BK), { z: -0.25, rx: Math.PI / 2.2 });
  tail.add(tk.mesh());
  // le bâton de berger, posé à côté de lui
  const crook = new Kit();
  crook.add(Cyl(0.035, 0.035, 2.0, 8), 0x8a5a2a, { y: 1.0 });
  crook.add(new THREE.TorusGeometry(0.16, 0.035, 8, 16, Math.PI * 1.3), 0x8a5a2a, { y: 2.12, x: 0.16, rz: -0.3 });
  const cm = crook.mesh(); cm.position.set(0.62, 0, 0.28); cm.rotation.z = -0.12; g.add(cm);
  g.userData = { head, tail, height: 2.3 };
  return g;
}

// ---------------------------------------------------------------------------
// Le tracteur rouge de Papi (avant = +z, roues au sol en y = 0)
// ---------------------------------------------------------------------------
export function buildTractor() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const RED = 0xd8302a, DK = 0x26262c;
  const k = new Kit();
  k.add(Box(1.1, 0.75, 1.7), RED, { y: 1.05, z: 0.75 });                          // capot
  k.add(Box(1.14, 0.12, 1.74), 0xb82420, { y: 1.47, z: 0.75 });
  k.add(Box(0.9, 0.55, 0.06), 0x3a3a40, { y: 1.0, z: 1.62 });                       // calandre
  for (let i = 0; i < 4; i++) k.add(Box(0.86, 0.04, 0.03), 0x9a9aa0, { y: 0.82 + i * 0.12, z: 1.66 });
  for (const sx of [-1, 1]) k.add(Cyl(0.1, 0.1, 0.06, 12), 0xfff6c0, { x: sx * 0.38, y: 1.36, z: 1.64, rx: Math.PI / 2 });
  k.add(Box(1.3, 0.5, 1.3), RED, { y: 1.0, z: -0.45 });                             // siège / moteur
  k.add(Box(0.7, 0.12, 0.6), DK, { y: 1.3, z: -0.4 });                               // coussin
  k.add(Box(0.7, 0.55, 0.1), DK, { y: 1.58, z: -0.72 });                             // dossier
  k.add(Cyl(0.06, 0.06, 0.9, 8), DK, { x: 0.32, y: 1.9, z: 1.1 });                   // pot d'échappement
  k.add(Cyl(0.08, 0.06, 0.12, 8), 0x9a9aa0, { x: 0.32, y: 2.38, z: 1.1 });
  k.add(Cyl(0.03, 0.03, 0.5, 6), DK, { y: 1.55, z: 0.15, rx: -0.6 });                // volant
  k.add(new THREE.TorusGeometry(0.2, 0.03, 6, 16), DK, { y: 1.78, z: 0.3, rx: -0.95 });
  // arceau de sécurité
  for (const sx of [-1, 1]) k.add(Cyl(0.05, 0.05, 1.5, 8), 0xf0c020, { x: sx * 0.62, y: 1.95, z: -0.95 });
  k.add(Cyl(0.05, 0.05, 1.24, 8), 0xf0c020, { y: 2.7, z: -0.95, rz: Math.PI / 2 });
  // garde-boue
  for (const sx of [-1, 1]) k.add(new THREE.CylinderGeometry(0.98, 0.98, 0.46, 18, 1, true, -Math.PI / 2, Math.PI), RED, { x: sx * 0.92, y: 0.92, z: -0.5, rz: Math.PI / 2 });
  const bm = k.mesh(vmat(0.5)); body.add(bm);
  const wheelGeo = (r, w) => {
    const wk = new Kit();
    wk.add(Cyl(r, r, w, 22), (x, y, z, c) => { const a = Math.atan2(z, y); c.set(Math.abs(Math.sin(a * 8)) > 0.7 && Math.hypot(y, z) > r * 0.85 ? 0x18181c : 0x2a2a30); }, { rz: Math.PI / 2 });
    wk.add(Cyl(r * 0.55, r * 0.55, w + 0.04, 16), 0xf0c020, { rz: Math.PI / 2 });
    wk.add(Cyl(r * 0.18, r * 0.18, w + 0.08, 10), 0xd8d8d8, { rz: Math.PI / 2 });
    return wk.geo();
  };
  const big = wheelGeo(0.82, 0.4), small = wheelGeo(0.46, 0.26);
  const wheels = [];
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(big, vmat(0.7)); r.position.set(sx * 0.92, 0.82, -0.5); r.castShadow = true; body.add(r); wheels.push({ m: r, r: 0.82 });
    const f = new THREE.Mesh(small, vmat(0.7)); f.position.set(sx * 0.7, 0.46, 1.2); f.castShadow = true; body.add(f); wheels.push({ m: f, r: 0.46, front: true });
  }
  g.userData = { body, wheels, seatY: 1.36, seatZ: -0.4 };
  return g;
}

// ---------------------------------------------------------------------------
// Textures peintes (planches, tuiles, pierres)
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = 4;
  return t;
}
const texCache = {};
/** Planches verticales (rouge grange, ou bois naturel). */
export function plankTex(base, rx, ry) {
  const key = 'pl' + base + rx + ry;
  return texCache[key] || (texCache[key] = canvasTex(256, 256, (x, w, h) => {
    const b = new THREE.Color(base);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 8; i++) {
      const v = 0.86 + r() * 0.2;
      x.fillStyle = `rgb(${Math.round(b.r * 255 * v)},${Math.round(b.g * 255 * v)},${Math.round(b.b * 255 * v)})`;
      x.fillRect(i * 32, 0, 32, h);
      for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; x.fillRect(i * 32 + 3 + r() * 24, 0, 1 + r() * 2, h); }
      x.fillStyle = 'rgba(30,10,5,0.55)'; x.fillRect(i * 32, 0, 2, h);
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i * 32 + 2, 0, 2, h);
      if (r() < 0.6) { x.fillStyle = 'rgba(40,20,10,0.5)'; x.beginPath(); x.arc(i * 32 + 8 + r() * 16, r() * h, 1.6, 0, 7); x.fill(); }
    }
  }, rx, ry));
}
export function tileTex(base, rx, ry) {
  const key = 'tl' + base + rx + ry;
  return texCache[key] || (texCache[key] = canvasTex(256, 256, (x, w, h) => {
    const b = new THREE.Color(base);
    x.fillStyle = '#' + b.getHexString(); x.fillRect(0, 0, w, h);
    for (let row = 0; row < 10; row++) for (let i = -1; i < 9; i++) {
      const v = 0.8 + ((row * 7 + i * 13) % 10) / 28, px = i * 32 + (row % 2) * 16, py = row * 26;
      x.fillStyle = `rgb(${Math.round(b.r * 255 * v)},${Math.round(b.g * 255 * v)},${Math.round(b.b * 255 * v)})`;
      x.beginPath(); x.roundRect(px + 1, py, 30, 25, [0, 0, 12, 12]); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px + 1, py + 22, 30, 3);
    }
  }, rx, ry));
}
export function stoneWallTex(rx, ry) {
  const key = 'st' + rx + ry;
  return texCache[key] || (texCache[key] = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#8a8070'; x.fillRect(0, 0, w, h);
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 8; row++) {
      let px = -r() * 30;
      while (px < w) {
        const sw = 26 + r() * 30, v = 0.8 + r() * 0.35;
        x.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(186 * v)},${Math.round(168 * v)})`;
        x.beginPath(); x.roundRect(px + 2, row * 32 + 2, sw - 4, 28, 7); x.fill();
        px += sw;
      }
    }
  }, rx, ry));
}
const texMat = (map, o) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85 }, o || {}));

/** Toit à deux pans (le faîte suit l'axe z). w : largeur du bâtiment, len : longueur, h0 : bas du toit, ridge : faîte. */
function roof(group, mat, w, len, h0, ridge, over, thick) {
  over = over || 0.5; thick = thick || 0.22;
  const half = w / 2 + over, rise = ridge - h0, slope = Math.atan2(rise, w / 2), L = Math.hypot(half, rise * half / (w / 2));
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(Box(L, thick, len + over * 2), mat);
    p.rotation.z = -sx * slope;
    p.position.set(sx * (L / 2) * Math.cos(slope), ridge - (L / 2) * Math.sin(slope) + thick / 2, 0);
    p.castShadow = p.receiveShadow = true; group.add(p);
  }
}
/** Pignon triangulaire (face en z = ±len/2). */
function gable(w, h0, ridge, thick) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, ridge - h0); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, h0, -thick / 2);
  // UV en mètres (pour la texture des planches)
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getY(i) / 3);
  return g;
}
function boxUV(w, h, d, per) {
  const g = Box(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const fu = ax > 0.5 ? d : w, fv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * fu / per, uv.getY(i) * fv / per);
  }
  return g;
}

// ---------------------------------------------------------------------------
// La grande grange rouge (façade et grenier à foin au sud, +z)
// ---------------------------------------------------------------------------
export function buildBarn(B, loft) {
  const g = new THREE.Group();
  const red = texMat(plankTex(0xb8322a), { roughness: 0.8 });
  const walls = new THREE.Mesh(boxUV(B.w, B.h, B.d, 3), red);
  walls.position.y = B.h / 2 - 0.3; walls.castShadow = walls.receiveShadow = true; g.add(walls);
  for (const sz of [-1, 1]) {
    const gb = new THREE.Mesh(gable(B.w, B.h - 0.3, B.ridge - 0.3, 0.3), red);
    gb.position.z = sz * (B.d / 2 - 0.15); gb.castShadow = true; g.add(gb);
  }
  roof(g, texMat(tileTex(0x6a4a40), { roughness: 0.75 }), B.w, B.d, B.h - 0.3, B.ridge - 0.1, 0.6, 0.25);
  // garnitures blanches, portes en X, ouverture du grenier, poulie
  const k = new Kit();
  const WH = 0xf4f0e6, F = B.d / 2 + 0.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Box(0.3, B.h, 0.3), WH, { x: sx * (B.w / 2), y: B.h / 2 - 0.3, z: sz * B.d / 2 });
  const lh = loft.top - B.y;                              // hauteur du plancher du grenier
  // grandes portes (au rez-de-chaussée, sous le grenier)
  const dw = 2.2, dh = lh - 0.7;
  for (const sx of [-1, 1]) {
    k.add(Box(dw, dh, 0.12), 0x9a2620, { x: sx * dw / 2, y: dh / 2 - 0.3, z: F + 0.05 });
    k.add(Box(dw, 0.16, 0.16), WH, { x: sx * dw / 2, y: dh - 0.3, z: F + 0.12 });
    k.add(Box(dw, 0.16, 0.16), WH, { x: sx * dw / 2, y: -0.2, z: F + 0.12 });
    k.add(Box(0.16, dh, 0.16), WH, { x: sx * dw, y: dh / 2 - 0.3, z: F + 0.12 });
    const diag = Math.hypot(dw, dh), ang = Math.atan2(dh, dw);
    for (const s2 of [-1, 1]) k.add(Box(diag - 0.1, 0.14, 0.12), WH, { x: sx * dw / 2, y: dh / 2 - 0.3, z: F + 0.13, rz: s2 * ang });
  }
  k.add(Box(0.16, dh, 0.16), WH, { y: dh / 2 - 0.3, z: F + 0.12 });
  // ouverture du grenier : sombre, encadrée de blanc, foin à l'intérieur
  const ow = 4.2, oh = 2.5, oy = lh + oh / 2 - 0.2;
  k.add(Box(ow, oh, 0.1), 0x2a1810, { x: loft.x - B.x, y: oy - 0.3, z: F + 0.01 });
  k.add(Box(ow + 0.3, 0.18, 0.2), WH, { x: loft.x - B.x, y: oy + oh / 2 - 0.3, z: F + 0.08 });
  for (const sx of [-1, 1]) k.add(Box(0.18, oh, 0.2), WH, { x: loft.x - B.x + sx * ow / 2, y: oy - 0.3, z: F + 0.08 });
  for (let i = 0; i < 3; i++) k.add(Box(1.2, 0.8, 0.9), (x, y, z, c) => c.set(0xe8c860).multiplyScalar(0.85 + vnoise(x * 9 + i, y * 9, z * 9) * 0.3), { x: loft.x - B.x - 1.2 + i * 1.25, y: lh + 0.1 - 0.3 + (i === 1 ? 0.8 : 0), z: F - 0.3 });
  // la poutre et sa poulie au-dessus de l'ouverture
  k.add(Box(0.25, 0.25, 1.6), 0x6a4a2a, { x: loft.x - B.x, y: oy + oh / 2 + 0.3 - 0.3, z: F + 0.7 });
  k.add(Cyl(0.18, 0.18, 0.12, 14), 0x3a3a40, { x: loft.x - B.x, y: oy + oh / 2 + 0.05 - 0.3, z: F + 1.3, rz: Math.PI / 2 });
  k.add(Cyl(0.02, 0.02, 1.8, 4), 0xb89a6a, { x: loft.x - B.x, y: oy + oh / 2 - 0.9 - 0.3, z: F + 1.3 });
  // fenêtres rondes sur les côtés
  for (const sx of [-1, 1]) for (const z of [-3.5, 3.5]) {
    k.add(Cyl(0.55, 0.55, 0.1, 18), WH, { x: sx * (B.w / 2 + 0.03), y: 3.7, z, rz: Math.PI / 2 });
    k.add(Cyl(0.42, 0.42, 0.12, 18), 0x2a3a4a, { x: sx * (B.w / 2 + 0.04), y: 3.7, z, rz: Math.PI / 2 });
  }
  // girouette en forme de coq sur le faîte
  k.add(Cyl(0.04, 0.04, 1.2, 6), 0x3a3a40, { y: B.ridge + 0.4, z: B.d / 2 - 1.5 });
  k.add(E(0.3, 0.22, 0.04), 0x3a3a40, { y: B.ridge + 1.05, z: B.d / 2 - 1.5 });
  k.add(new THREE.ConeGeometry(0.16, 0.36, 3), 0x3a3a40, { x: -0.3, y: B.ridge + 1.15, z: B.d / 2 - 1.5, rz: 0.8 });
  g.add(k.mesh(vmat(0.7)));
  // plancher du grenier (il sort de la façade) et ses poteaux
  const wood = texMat(plankTex(0xa87a4a, 2, 1), { roughness: 0.85 });
  const fl = new THREE.Mesh(boxUV(loft.w, 0.4, loft.d + 1.2, 2), wood);
  fl.position.set(loft.x - B.x, lh - 0.2 - 0.3 + 0.3, loft.z - B.z - 0.6);
  fl.castShadow = fl.receiveShadow = true; g.add(fl);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(Box(0.3, lh, 0.3), wood);
    post.position.set(loft.x - B.x + sx * (loft.w / 2 - 0.3), lh / 2 - 0.3, loft.z - B.z + loft.d / 2 - 0.3);
    post.castShadow = true; g.add(post);
  }
  g.position.set(B.x, B.y, B.z);
  return g;
}

// ---------------------------------------------------------------------------
// La maison de Papi (enduit crème, volets bleus, tuiles)
// ---------------------------------------------------------------------------
export function buildHouse(H, real) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.9 });
  const walls = new THREE.Mesh(Box(H.w, H.h, H.d), wallMat);
  walls.position.y = H.h / 2 - 0.3; walls.castShadow = walls.receiveShadow = true; g.add(walls);
  // pignons sur les côtés (le faîte suit l'axe x)
  const gk = new Kit();
  for (const sx of [-1, 1]) {
    const gg = gable(H.d, H.h - 0.3, H.ridge - 0.3, 0.3);
    gg.rotateY(Math.PI / 2);
    gk.add(gg, 0xf2e6cc, { x: sx * (H.w / 2 - 0.15) });
  }
  g.add(gk.mesh(vmat(0.9)));
  const rg = new THREE.Group(); rg.rotation.y = Math.PI / 2; g.add(rg);
  roof(rg, texMat(tileTex(0xc8603a, 2, 2), { roughness: 0.7 }), H.d, H.w, H.h - 0.3, H.ridge, 0.55, 0.22);
  const k = new Kit();
  const F = H.d / 2 + 0.03, BLUE = 0x4a7ac8, WH = 0xffffff;
  // porte
  k.add(Box(1.2, 2.2, 0.12), 0x4a7ac8, { y: 0.8, z: F });
  k.add(Box(1.5, 0.16, 0.2), WH, { y: 1.95, z: F + 0.04 });
  k.add(Sph(0.06, 8, 6), 0xf0c040, { x: 0.4, y: 0.8, z: F + 0.1 });
  k.add(Box(1.6, 0.18, 0.8), 0xb0a090, { y: -0.21, z: F + 0.35 });               // marche
  // fenêtres et volets
  const win = (x, y, z, rotY) => {
    const o = { ry: rotY || 0 };
    const px = (dx, dz) => ({ x: x + Math.cos(o.ry) * dx + Math.sin(o.ry) * dz, z: z - Math.sin(o.ry) * dx + Math.cos(o.ry) * dz });
    let p = px(0, 0);
    k.add(Box(1.0, 1.1, 0.1), 0x9ac8e8, { x: p.x, y, z: p.z, ry: o.ry });
    k.add(Box(1.1, 0.08, 0.14), WH, { x: p.x, y, z: p.z, ry: o.ry });
    k.add(Box(0.08, 1.2, 0.14), WH, { x: p.x, y, z: p.z, ry: o.ry });
    for (const sx of [-1, 1]) { p = px(sx * 0.82, 0.02); k.add(Box(0.55, 1.2, 0.08), BLUE, { x: p.x, y, z: p.z, ry: o.ry }); }
    p = px(0, 0.22); k.add(Box(1.2, 0.25, 0.35), 0x9a6a3a, { x: p.x, y: y - 0.72, z: p.z, ry: o.ry });
    for (let i = 0; i < 5; i++) { p = px(-0.45 + i * 0.22, 0.25); k.add(Sph(0.11, 8, 6), [0xff5a7a, 0xffd040, 0xffffff, 0xff8ab0, 0xe03a3a][i], { x: p.x, y: y - 0.52, z: p.z }); }
  };
  win(-2.8, 1.6, F); win(2.8, 1.6, F);
  win(-2.2, 1.6, -F, Math.PI); win(2.2, 1.6, -F, Math.PI);
  // cheminée
  k.add(Box(0.8, 2.2, 0.8), 0xa89a88, { x: 2.6, y: H.ridge - 0.5, z: -1.2 });
  k.add(Box(0.95, 0.18, 0.95), 0x8a7c6c, { x: 2.6, y: H.ridge + 0.65, z: -1.2 });
  // banc devant la maison
  k.add(Box(1.8, 0.1, 0.45), 0x9a6a3a, { x: 3.4, y: 0.25, z: F + 0.6 });
  for (const sx of [-1, 1]) k.add(Box(0.1, 0.5, 0.4), 0x7a4a2a, { x: 3.4 + sx * 0.75, y: -0.05, z: F + 0.6 });
  g.add(k.mesh(vmat(0.7)));
  void real;
  g.position.set(H.x, H.y, H.z);
  return g;
}

// ---------------------------------------------------------------------------
// Le poulailler (petite cabane, rampe, porte ronde) et le panier à œufs
// ---------------------------------------------------------------------------
export function buildHenhouse(H) {
  const g = new THREE.Group();
  const wood = texMat(plankTex(0xc8945a), { roughness: 0.85 });
  const walls = new THREE.Mesh(boxUV(H.w, H.h, H.d, 2), wood);
  walls.position.y = H.h / 2 + 0.3; walls.castShadow = walls.receiveShadow = true; g.add(walls);
  for (const sz of [-1, 1]) { const gb = new THREE.Mesh(gable(H.w, H.h + 0.3, H.ridge + 0.3, 0.2), wood); gb.position.z = sz * (H.d / 2 - 0.1); g.add(gb); }
  roof(g, texMat(tileTex(0xb8402a), { roughness: 0.7 }), H.w, H.d, H.h + 0.3, H.ridge + 0.4, 0.35, 0.16);
  const k = new Kit();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Box(0.22, 0.6, 0.22), 0x7a4a2a, { x: sx * (H.w / 2 - 0.2), y: 0.15, z: sz * (H.d / 2 - 0.2) });
  // porte ronde côté cour (+x) et rampe
  k.add(Cyl(0.45, 0.45, 0.1, 18), 0x2a1810, { x: H.w / 2 + 0.03, y: 1.4, rz: Math.PI / 2 });
  k.add(new THREE.TorusGeometry(0.47, 0.06, 6, 20), 0xf4f0e6, { x: H.w / 2 + 0.05, y: 1.4, ry: Math.PI / 2 });
  k.add(Box(1.9, 0.08, 0.7), 0xa87a4a, { x: H.w / 2 + 0.8, y: 0.62, rz: -0.55 });
  for (let i = 0; i < 4; i++) k.add(Box(0.06, 0.05, 0.7), 0x7a4a2a, { x: H.w / 2 + 0.3 + i * 0.38, y: 0.95 - i * 0.22, rz: -0.55 });
  g.add(k.mesh(vmat(0.8)));
  g.position.set(H.x, H.y, H.z);
  return g;
}
export function buildBasket() {
  const k = new Kit();
  k.add(Cyl(0.55, 0.42, 0.45, 20, 1), (x, y, z, c) => { const a = Math.atan2(z, x); c.set(0xb88a4a).multiplyScalar(0.8 + ((Math.floor(a * 8) + Math.floor(y * 18)) % 2) * 0.25); }, { y: 0.22 });
  k.add(Cyl(0.5, 0.5, 0.04, 20), 0x6a4a2a, { y: 0.4 });
  k.add(new THREE.TorusGeometry(0.5, 0.05, 6, 24, Math.PI), 0x9a6a3a, { y: 0.44 });
  k.add(new THREE.TorusGeometry(0.56, 0.05, 6, 24), 0x9a6a3a, { y: 0.44, rx: Math.PI / 2 });
  return k.mesh(vmat(0.85));
}

// ---------------------------------------------------------------------------
// Le moulin : tour de pierre, toit, balcon, escalier, ailes
// ---------------------------------------------------------------------------
export function buildMill(Mi, steps, balcony) {
  const g = new THREE.Group();
  const stone = texMat(stoneWallTex(4, 3), { roughness: 0.9 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(Mi.r * 0.86, Mi.r * 1.04, Mi.h + 1, 24, 1), stone);
  tower.position.y = (Mi.h + 1) / 2 - 1; tower.castShadow = tower.receiveShadow = true; g.add(tower);
  const capM = texMat(tileTex(0x8a3a2a, 3, 1), { roughness: 0.7 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(Mi.r * 1.25, 3.2, 24), capM);
  cap.position.y = Mi.h + 1.6; cap.castShadow = true; g.add(cap);
  const k = new Kit();
  const W = 0xa87a4a, DW = 0x7a5030;
  // porte et fenêtres
  k.add(Box(1.1, 1.9, 0.2), 0x6a3a1a, { y: 0.7, z: Mi.r * 1.0 });
  k.add(Cyl(0.55, 0.55, 0.2, 16, 1), 0x6a3a1a, { y: 1.65, z: Mi.r * 1.0, rx: Math.PI / 2 });
  for (const [a, y] of [[2.2, 4.2], [4.2, 6.6], [0.6, 8.0]]) k.add(Box(0.6, 0.8, 0.15), 0x2a3a4a, { x: Math.cos(a) * Mi.r * 0.93, y, z: Math.sin(a) * Mi.r * 0.93, ry: Math.PI / 2 - a });
  // balcon (plancher, garde-corps avec une ouverture vers l'escalier)
  const by = balcony.top - Mi.y;
  k.add(Cyl(balcony.r, balcony.r, 0.3, 32), W, { y: by - 0.15 });
  const last = steps[steps.length - 1].a;
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    const d = Math.abs(Math.atan2(Math.sin(a - last), Math.cos(a - last)));
    if (d < 0.5) continue;
    k.add(Cyl(0.05, 0.05, 0.9, 6), DW, { x: Math.cos(a) * (balcony.r - 0.15), y: by + 0.45, z: Math.sin(a) * (balcony.r - 0.15) });
    const a2 = (i + 1) / 26 * Math.PI * 2, d2 = Math.abs(Math.atan2(Math.sin(a2 - last), Math.cos(a2 - last)));
    if (d2 < 0.5) continue;
    const mx = (Math.cos(a) + Math.cos(a2)) / 2 * (balcony.r - 0.15), mz = (Math.sin(a) + Math.sin(a2)) / 2 * (balcony.r - 0.15);
    k.add(Box(0.07, 0.07, 2 * Math.PI * (balcony.r - 0.15) / 26 + 0.05), DW, { x: mx, y: by + 0.9, z: mz, ry: -(a + a2) / 2 });
  }
  // consoles sous le balcon
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.add(Box(0.15, 0.15, balcony.r - Mi.r + 0.3), DW, { x: Math.cos(a) * (balcony.r + Mi.r) / 2, y: by - 0.5, z: Math.sin(a) * (balcony.r + Mi.r) / 2, ry: Math.PI / 2 - a, rx: 0.5 }); }
  // escalier : marches rondes sur leurs piquets
  for (const s of steps) {
    const sx = s.x - Mi.x, sz = s.z - Mi.z, sy = s.top - Mi.y;
    k.add(Cyl(s.r, s.r * 0.95, 0.35, 16), W, { x: sx, y: sy - 0.175, z: sz });
    k.add(Cyl(0.12, 0.14, sy + 0.2, 8), DW, { x: sx, y: sy / 2 - 0.2, z: sz });
  }
  g.add(k.mesh(vmat(0.85)));
  // les ailes (4 bras : treillis de bois et toile)
  const sails = new THREE.Group();
  sails.position.set(0, Mi.hubY - Mi.y, Mi.r * 1.0 + 0.55);
  const hub = new THREE.Mesh(Cyl(0.32, 0.32, 0.6, 14), M.mat(0x5a3a1a, { roughness: 0.7 }));
  hub.rotation.x = Math.PI / 2; sails.add(hub);
  const axle = new THREE.Mesh(Cyl(0.15, 0.15, 1.2, 10), M.mat(0x3a3a40, { roughness: 0.5 }));
  axle.rotation.x = Math.PI / 2; axle.position.z = -0.5; sails.add(axle);
  const blades = [];
  const R = Mi.R;
  for (let i = 0; i < 4; i++) {
    const b = new Kit();
    b.add(Box(0.16, R, 0.12), DW, { y: R / 2 });
    for (let j = 0; j < 7; j++) b.add(Box(1.3, 0.06, 0.06), W, { x: 0.6, y: 1.1 + j * (R - 1.3) / 6 });
    b.add(Box(0.06, R - 1.0, 0.06), W, { x: 1.25, y: 0.6 + R / 2 });
    b.add(new THREE.PlaneGeometry(1.1, R - 1.2), 0xfaf4e4, { x: 0.65, y: 0.6 + R / 2, z: 0.04 });
    const m = b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    m.rotation.z = i * Math.PI / 2;
    sails.add(m); blades.push(m);
  }
  g.add(sails);
  g.position.set(Mi.x, Mi.y, Mi.z);
  g.userData = { sails, blades };
  return g;
}
/** Une aile perdue du moulin (petit treillis à ramasser). */
export function sailPartGeo() {
  const b = new Kit();
  b.add(Box(0.1, 1.4, 0.08), 0x7a5030, { y: 0 });
  for (let j = 0; j < 4; j++) b.add(Box(0.7, 0.05, 0.05), 0xa87a4a, { x: 0.3, y: -0.5 + j * 0.33 });
  b.add(new THREE.PlaneGeometry(0.6, 1.1), 0xfaf4e4, { x: 0.32, z: 0.03 });
  b.add(new THREE.PlaneGeometry(0.6, 1.1), 0xfaf4e4, { x: 0.32, z: -0.03, ry: Math.PI });
  return b.geo();
}

// ---------------------------------------------------------------------------
// Tournesols, choux, roseaux, nénuphars (instanciés)
// ---------------------------------------------------------------------------
export function sunflowerGeos() {
  const st = new Kit();
  st.add(Cyl(0.035, 0.05, 2.0, 6), 0x5a9a3a, { y: 1.0 });
  for (const [y, a] of [[0.7, 0], [1.2, 2.4], [1.55, 4.4]]) st.add(E(0.24, 0.02, 0.11, 8, 6), 0x4c9a30, { x: Math.cos(a) * 0.2, y, z: Math.sin(a) * 0.2, ry: -a });
  const hd = new Kit();
  hd.add(Cyl(0.2, 0.22, 0.08, 12), (x, y, z, c) => c.set(0x5a3a18).multiplyScalar(0.8 + vnoise(x * 40, 0, z * 40) * 0.4), { rx: Math.PI / 2 });
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; hd.add(E(0.08, 0.17, 0.02, 6, 4), i % 2 ? 0xffd020 : 0xffc010, { x: Math.cos(a) * 0.29, y: Math.sin(a) * 0.29, z: -0.01, rz: a - Math.PI / 2 }); }
  hd.add(Cyl(0.08, 0.1, 0.1, 8), 0x5a9a3a, { z: -0.08, rx: Math.PI / 2 });
  return { stem: st.geo(), head: hd.geo() };
}
export function cabbageGeo() {
  const k = new Kit();
  k.add(Sph(0.28, 12, 9), 0x8ac850, { y: 0.22, sy: 0.85 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(E(0.24, 0.05, 0.16, 8, 6), 0x5aa83a, { x: Math.cos(a) * 0.22, y: 0.14, z: Math.sin(a) * 0.22, ry: -a, rz: 0.5 }); }
  return k.geo();
}
export function reedGeo() {
  const k = new Kit();
  for (let i = 0; i < 5; i++) { const a = i * 1.3; k.add(Cyl(0.02, 0.03, 1.4 + (i % 3) * 0.3, 5), 0x6aa040, { x: Math.cos(a) * 0.15, y: 0.7, z: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.12, rx: Math.sin(a) * 0.12 }); }
  k.add(Cyl(0.05, 0.05, 0.3, 6), 0x6a4020, { x: 0.15, y: 1.55, z: 0 });
  k.add(Cyl(0.05, 0.05, 0.3, 6), 0x6a4020, { x: -0.1, y: 1.4, z: 0.12 });
  return k.geo();
}
export function lilyGeo() {
  const k = new Kit();
  k.add(new THREE.CircleGeometry(0.42, 14, 0.3, Math.PI * 2 - 0.6), 0x4c9a30, { rx: -Math.PI / 2 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Drapeau de passage (on y repart après une chute) : poteau et fanion
// ---------------------------------------------------------------------------
export function buildFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(Cyl(0.06, 0.07, 3.6, 8), M.mat(0xf4f0e6, { roughness: 0.5 }));
  pole.position.y = 1.8; pole.castShadow = true; g.add(pole);
  const ball = new THREE.Mesh(Sph(0.12, 10, 8), M.GOLD()); ball.position.y = 3.65; g.add(ball);
  const geo = new THREE.PlaneGeometry(1.2, 0.8, 8, 1); geo.translate(0.6, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: flagTex(), side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.y = 1.0; cloth.castShadow = true; g.add(cloth);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 32), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.userData.noOutline = true; g.add(halo);
  g.userData = { cloth, halo, base: Float32Array.from(geo.attributes.position.array) };
  return g;
}
let _flagTex = null;
function flagTex() {
  if (_flagTex) return _flagTex;
  _flagTex = canvasTex(128, 96, (x, w, h) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { x.fillStyle = (i + j) % 2 ? '#e8402a' : '#ffffff'; x.fillRect(i * 32, j * 32, 32, 32); }
    x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(64, 48, 22, 0, 7); x.fill();
    x.fillStyle = '#8a5200';
    x.beginPath(); x.ellipse(64, 54, 9, 8, 0, 0, 7); x.fill();
    for (const [dx, dy] of [[-11, -4], [-4, -11], [4, -11], [11, -4]]) { x.beginPath(); x.arc(64 + dx, 48 + dy, 4, 0, 7); x.fill(); }
  });
  return _flagTex;
}

// ---------------------------------------------------------------------------
// Boue sur le chien : des taches marron qui s'accrochent au pelage
// ---------------------------------------------------------------------------
/** pts : des points [x, y, z] pris sur le pelage du chien (sinon une forme de chien moyenne). */
export function mudSpots(pts) {
  const k = new Kit();
  let s = 17; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  if (!pts) { pts = []; for (let i = 0; i < 30; i++) { const a = r() * Math.PI * 2; pts.push([Math.cos(a) * 0.4, 0.2 + r() * 0.7, Math.sin(a) * 0.6]); } }
  for (const [x, y, z] of pts) {
    const w = 0.08 + r() * 0.06;
    k.add(E(w * 1.3, w * 0.6, w * (1 + r() * 0.5), 8, 6), r() < 0.5 ? 0x5a3a1c : 0x6e4a26, { x, y, z, rx: r() * 3, ry: r() * 6 });
  }
  const m = k.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  m.castShadow = false;
  return m;
}
