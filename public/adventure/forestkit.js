/*
 * Matcha & Ainu — Niveau 2 « La Forêt des Moustaches » : les modèles 3D des
 * habitants de la forêt (Noisette la hérissonne, Pistache l'écureuil, Mère
 * Hulotte et ses bébés hiboux, Gaston la grenouille) et quelques objets
 * (radeau, maison-champignon, buisson à baies). Formes lisses et couleurs
 * peintes sur les sommets : un seul maillage par morceau (léger sur téléphone).
 */
import * as THREE from '../vendor/three.module.min.js';
import { Kit, glossMat, vmat } from './farmkit.js';

const Sph = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 12);
const E = (rx, ry, rz, w, h) => { const g = new THREE.SphereGeometry(1, w || 18, h || 12); g.scale(rx, ry, rz); return g; };
const Cone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 10);
const Cyl = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 12);
const Cap = (r, l, a, b) => new THREE.CapsuleGeometry(r, l, a || 4, b || 10);
function eyes(k, o) {
  for (const sx of [-1, 1]) {
    k.add(Sph(o.r, 12, 10), o.iris || 0x1a120e, { x: sx * o.x, y: o.y, z: o.z, sx: 0.9, sy: 1.1, sz: 0.6, ry: sx * (o.ry || 0.35) });
    k.add(Sph(o.r * 0.36, 8, 6), 0xffffff, { x: sx * o.x + o.r * 0.25, y: o.y + o.r * 0.42, z: o.z + o.r * 0.45 });
  }
}
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------------------------------------------------------------------------
// Noisette la hérissonne (tablier blanc, cuillère en bois)
// ---------------------------------------------------------------------------
export function buildHedgehog(o) {
  o = o || {};
  const g = new THREE.Group();
  const BR = o.color || 0x9a6a44, SP = o.spines || 0x5a3a22, FACE = 0xf0d4a8;
  const body = new Kit();
  body.add(E(0.42, 0.4, 0.5), FACE, { y: 0.42 });
  if (o.apron) body.add(E(0.36, 0.3, 0.12), 0xfaf6ee, { y: 0.36, z: 0.36 });
  // les piquants : de petits cônes sur le dos (tout ronds, pas pointus de loin)
  const r = rng(7);
  for (let i = 0; i < 46; i++) {
    const u = r(), v = r();
    const th = u * Math.PI * 0.62, ph = (v - 0.5) * Math.PI * 1.55 + Math.PI;
    const nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
    if (nz > 0.45) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz));
    const e = new THREE.Euler().setFromQuaternion(q);
    body.add(Cone(0.075, 0.3, 6), (x, y, z, c) => c.set(y > 0.05 ? 0xe8d8c0 : SP), { x: nx * 0.44, y: 0.45 + ny * 0.42, z: nz * 0.5, rx: e.x, ry: e.y, rz: e.z });
  }
  body.add(E(0.46, 0.43, 0.48), BR, { y: 0.46, z: -0.08 });
  for (const sx of [-1, 1]) body.add(E(0.1, 0.07, 0.14), 0x6a4a30, { x: sx * 0.2, y: 0.05, z: 0.18 });
  if (o.spoon) { body.add(Cyl(0.025, 0.025, 0.7, 6), 0xc89a60, { x: 0.38, y: 0.55, z: 0.25, rz: -0.5 }); body.add(E(0.08, 0.04, 0.1), 0xc89a60, { x: 0.55, y: 0.85, z: 0.25, rz: -0.5 }); }
  g.add(body.mesh());
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.36); g.add(head);
  const hk = new Kit();
  hk.add(Cone(0.2, 0.42, 14), FACE, { z: 0.14, rx: Math.PI / 2 });
  hk.add(Sph(0.065, 10, 8), 0x2a1a14, { z: 0.36 });
  for (const sx of [-1, 1]) hk.add(Sph(0.08, 10, 8), BR, { x: sx * 0.17, y: 0.16, z: -0.04, sz: 0.5 });
  for (const sx of [-1, 1]) hk.add(E(0.05, 0.03, 0.02), 0xff9ab0, { x: sx * 0.13, y: -0.04, z: 0.12 });
  if (o.bow) hk.add(new THREE.TorusGeometry(0.07, 0.03, 6, 12), 0xe0405a, { x: 0.14, y: 0.2, z: -0.05 });
  head.add(hk.mesh());
  const fk = new Kit();
  eyes(fk, { x: 0.09, y: 0.08, z: 0.12, r: 0.045 });
  head.add(fk.mesh(glossMat()));
  g.scale.setScalar(o.scale || 1.3);
  g.userData = { head, body, height: 1.0 * (o.scale || 1.3) };
  return g;
}

// ---------------------------------------------------------------------------
// Pistache l'écureuil (roux, grande queue en panache)
// ---------------------------------------------------------------------------
export function buildSquirrel(o) {
  o = o || {};
  const g = new THREE.Group();
  const RED = 0xd8702a, CREAM = 0xf6e2c4;
  const k = new Kit();
  k.add(E(0.22, 0.3, 0.2), (x, y, z, c) => c.set(z > 0.08 ? CREAM : RED), { y: 0.36 });
  for (const sx of [-1, 1]) {
    k.add(E(0.08, 0.13, 0.12), RED, { x: sx * 0.15, y: 0.12, z: 0.03 });
    k.add(E(0.04, 0.09, 0.05), RED, { x: sx * 0.1, y: 0.38, z: 0.17, rx: -0.6 });
  }
  g.add(k.mesh());
  const tail = new THREE.Group(); tail.position.set(0, 0.25, -0.15); g.add(tail);
  const tk = new Kit();
  for (let i = 0; i < 6; i++) {
    const a = i / 5, rr = 0.12 + Math.sin(a * Math.PI) * 0.08;
    tk.add(Sph(rr, 12, 10), (x, y, z, c) => c.set(i === 5 ? 0xf0a060 : RED), { y: 0.1 + a * 0.62, z: -0.12 - Math.sin(a * 2.4) * 0.18 + a * a * 0.25 });
  }
  tail.add(tk.mesh());
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.04); g.add(head);
  const hk = new Kit();
  hk.add(E(0.17, 0.15, 0.16), RED);
  hk.add(E(0.1, 0.08, 0.09), CREAM, { y: -0.04, z: 0.1 });
  hk.add(Sph(0.03, 8, 6), 0x2a1a14, { y: -0.01, z: 0.19 });
  for (const sx of [-1, 1]) { hk.add(Cone(0.05, 0.13, 8), RED, { x: sx * 0.09, y: 0.15, z: -0.02, rz: -sx * 0.2 }); hk.add(Cone(0.02, 0.05, 6), 0xf0a060, { x: sx * 0.09, y: 0.24, z: -0.02 }); }
  head.add(hk.mesh());
  const fk = new Kit();
  eyes(fk, { x: 0.075, y: 0.035, z: 0.12, r: 0.035 });
  head.add(fk.mesh(glossMat()));
  // une noisette dans les pattes
  const nut = new Kit(); nut.add(Sph(0.06, 10, 8), 0xa0682e, { y: 0.34, z: 0.24 }); nut.add(Cyl(0.05, 0.06, 0.04, 10), 0x6a4020, { y: 0.39, z: 0.24 });
  g.add(nut.mesh());
  g.scale.setScalar(o.scale || 1.5);
  g.userData = { head, tail, height: 0.8 * (o.scale || 1.5) };
  return g;
}

// ---------------------------------------------------------------------------
// Mère Hulotte (chouette) et ses bébés tout ronds
// ---------------------------------------------------------------------------
export function buildOwl(o) {
  o = o || {};
  const baby = !!o.baby;
  const g = new THREE.Group();
  const BR = baby ? 0xc8a47c : 0x8a6440, BELLY = baby ? 0xfaf0e0 : 0xf0dcb8, DARK = baby ? 0x9a7650 : 0x5a3e26;
  const k = new Kit();
  k.add(E(0.42, baby ? 0.42 : 0.52, 0.38, 20, 16), (x, y, z, c) => {
    c.set(z > 0.12 && y < 0.25 ? BELLY : BR);
    if (!baby && z > 0.12 && y < 0.25 && Math.sin(y * 40) > 0.6) c.set(0xd8bc90);
  }, { y: baby ? 0.42 : 0.5 });
  if (!baby) for (const sx of [-1, 1]) k.add(E(0.12, 0.34, 0.26), DARK, { x: sx * 0.38, y: 0.5, z: -0.02, rz: sx * 0.15 });
  for (const sx of [-1, 1]) k.add(E(0.06, 0.04, 0.09), 0xe0a030, { x: sx * 0.12, y: 0.03, z: 0.1 });
  g.add(k.mesh());
  const wings = [];
  if (baby) for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * 0.36, 0.5, 0); g.add(w);
    const wk = new Kit(); wk.add(E(0.08, 0.22, 0.18), DARK, { y: -0.12 });
    w.add(wk.mesh()); wings.push(w);
  }
  const head = new THREE.Group(); head.position.set(0, baby ? 0.86 : 1.08, 0); g.add(head);
  const hk = new Kit();
  hk.add(E(0.34, 0.3, 0.3, 20, 14), BR);
  for (const sx of [-1, 1]) {
    hk.add(E(0.14, 0.14, 0.05), BELLY, { x: sx * 0.13, y: 0.02, z: 0.25 });
    hk.add(Cone(baby ? 0.06 : 0.07, baby ? 0.12 : 0.2, 8), BR, { x: sx * 0.22, y: baby ? 0.25 : 0.28, z: -0.02, rz: -sx * 0.4 });
  }
  hk.add(Cone(0.05, 0.13, 8), 0xe8a030, { y: -0.08, z: 0.3, rx: Math.PI / 2 + 0.5 });
  if (o.shawl) hk.add(new THREE.TorusGeometry(0.3, 0.06, 8, 20), 0x6a9ad0, { y: -0.24, rx: Math.PI / 2 });
  head.add(hk.mesh());
  const fk = new Kit();
  eyes(fk, { x: 0.13, y: 0.03, z: 0.27, r: 0.085, iris: 0x1a120e });
  for (const sx of [-1, 1]) fk.add(new THREE.TorusGeometry(0.09, 0.02, 6, 16), 0xf0b030, { x: sx * 0.13, y: 0.03, z: 0.285 });
  head.add(fk.mesh(glossMat()));
  g.scale.setScalar(o.scale || (baby ? 0.75 : 1.5));
  g.userData = { head, wings, height: (baby ? 1.1 : 1.4) * (o.scale || (baby ? 0.75 : 1.5)) };
  return g;
}

// ---------------------------------------------------------------------------
// Gaston la grenouille (chapeau de paille, perche de passeur)
// ---------------------------------------------------------------------------
export function buildFrog() {
  const g = new THREE.Group();
  const GR = 0x5abf3a, BELLY = 0xe8f0a0;
  const k = new Kit();
  k.add(E(0.42, 0.36, 0.4), (x, y, z, c) => c.set(z > 0.15 && y < 0.05 ? BELLY : GR), { y: 0.4 });
  for (const sx of [-1, 1]) {
    k.add(E(0.16, 0.1, 0.28), GR, { x: sx * 0.32, y: 0.12, z: -0.05 });
    k.add(E(0.12, 0.04, 0.12), 0x4aa030, { x: sx * 0.34, y: 0.03, z: 0.18 });
    k.add(Cap(0.05, 0.3, 3, 8), GR, { x: sx * 0.3, y: 0.42, z: 0.2, rx: 0.9, rz: sx * 0.3 });
  }
  k.add(new THREE.TorusGeometry(0.22, 0.025, 6, 20, Math.PI), 0x8a2a2a, { y: 0.42, z: 0.36, rz: Math.PI });
  // le chapeau de paille
  k.add(Cyl(0.36, 0.36, 0.03, 20), 0xe8c870, { y: 0.88 });
  k.add(Cyl(0.18, 0.2, 0.18, 16), 0xe8c870, { y: 0.97 });
  k.add(Cyl(0.205, 0.205, 0.05, 16), 0xd84a4a, { y: 0.92 });
  // la perche
  k.add(Cyl(0.03, 0.03, 2.6, 6), 0xa07040, { x: 0.45, y: 0.9, z: 0.1, rz: -0.25 });
  g.add(k.mesh());
  const fk = new Kit();
  for (const sx of [-1, 1]) { fk.add(Sph(0.12, 12, 10), 0xf4f4e8, { x: sx * 0.2, y: 0.72, z: 0.12 }); fk.add(Sph(0.06, 10, 8), 0x1a120e, { x: sx * 0.21, y: 0.73, z: 0.22 }); }
  g.add(fk.mesh(glossMat()));
  g.scale.setScalar(1.25);
  g.userData = { height: 1.3 };
  return g;
}

// ---------------------------------------------------------------------------
// Objets de la forêt
// ---------------------------------------------------------------------------
/** Le radeau : 7 rondins liés par deux cordes, une petite lanterne à l'avant. */
export function buildRaft(R) {
  const k = new Kit();
  const n = 7, w = (R * 2 * 0.92) / n;
  for (let i = 0; i < n; i++) {
    const x = -R * 0.92 + w * (i + 0.5), len = 2 * Math.sqrt(Math.max(0.3, R * R - x * x)) * 0.98;
    k.add(Cyl(w * 0.52, w * 0.52, len, 10), (px, y, pz, c) => c.set(Math.abs(y) > len / 2 - 0.02 ? 0xe0b878 : 0x9a6a3a), { x, y: 0.15, rx: Math.PI / 2 });
  }
  for (const z of [-R * 0.55, R * 0.55]) k.add(Cyl(0.05, 0.05, R * 1.9, 6), 0xd8c08a, { y: 0.36, z, rz: Math.PI / 2 });
  k.add(Cyl(0.05, 0.06, 1.3, 6), 0x6a4020, { x: 0, y: 0.8, z: R * 0.75 });
  k.add(Cyl(0.13, 0.15, 0.22, 8), 0xffd070, { x: 0, y: 1.42, z: R * 0.75 });
  return k.mesh();
}

function hash(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
/** Maison-champignon : pied crème (porte ronde, fenêtres), chapeau à pois. */
export function buildMushHouse(h) {
  const k = new Kit();
  const H = h.h, R = h.r;
  const capCol = new THREE.Color(h.col);
  k.add(Cyl(R * 0.92, R * 1.08, H + 0.6, 22), (x, y, z, c) => {
    c.set(0xf4e8d0);
    const a = Math.atan2(x, z), yy = y + (H + 0.6) / 2;
    if (Math.abs(a) < 0.32 && yy < 1.7) c.set(0x7a4a26);                         // la porte (vers +z)
    if (Math.abs(a) < 0.26 && yy < 1.75 && yy > 1.62) c.set(0x5a3418);
    if (Math.abs(Math.abs(a) - 1.4) < 0.2 && yy > 1.6 && yy < 2.3) c.set(0xffe08a);  // fenêtres allumées
    if (hash(Math.round(x * 6), Math.round(y * 6), Math.round(z * 6)) > 0.93) c.multiplyScalar(0.94);
  }, { y: (H + 0.6) / 2 - 0.6 });
  k.add(Sph(0.08, 8, 6), 0xffd040, { x: 0.32, y: 0.9, z: R * 1.0 });
  // le chapeau
  const cr = h.capR;
  const pts = [new THREE.Vector2(0.001, 0.95), new THREE.Vector2(cr * 0.55, 0.85), new THREE.Vector2(cr * 0.88, 0.5), new THREE.Vector2(cr, 0.1), new THREE.Vector2(cr * 0.98, -0.05), new THREE.Vector2(R * 0.9, -0.2), new THREE.Vector2(0.001, -0.2)];
  k.add(new THREE.LatheGeometry(pts.slice().reverse(), 28), (x, y, z, c) => {
    c.copy(capCol);
    if (y < 0.0) { c.set(0xf6e2c0); return; }
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    const sp = Math.sin(a * 5 + rr * 1.1) * Math.sin(rr * 2.2 + 1.3);
    if (sp > 0.55) c.set(0xfff6ec);
  }, { y: H - 0.05 });
  // un petit tuyau de cheminée
  k.add(Cyl(0.16, 0.18, 0.7, 10), 0x8a7a6a, { x: cr * 0.35, y: H + 0.9, z: -cr * 0.2 });
  const m = k.mesh();
  m.rotation.y = h.yaw;
  return m;
}

/** Buisson rond (les baies sont dessinées à part, instanciées). */
export function bushGeometry() {
  const k = new Kit();
  const r = rng(31);
  k.add(new THREE.IcosahedronGeometry(0.85, 2), 0x3e8a34, { y: 0.6, sy: 0.85 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + r(); k.add(new THREE.IcosahedronGeometry(0.5 + r() * 0.15, 1), i % 2 ? 0x4a9a3c : 0x367a2e, { x: Math.cos(a) * 0.6, y: 0.45 + r() * 0.3, z: Math.sin(a) * 0.6 }); }
  return k.geo();
}
export { vmat };
