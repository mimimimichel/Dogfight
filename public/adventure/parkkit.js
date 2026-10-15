/*
 * Matcha & Ainu — Niveau 1 « Le Parc des Toutous » : les modèles 3D du parc
 * (petit train, pédalos-cygnes, manège, kiosque, toboggan, balançoires, lanternes,
 * longue-vue, obstacles d'agility, cabane perchée, indices de Biscotte…).
 * Formes lisses et couleurs peintes sur les sommets (un seul maillage par objet) ;
 * les objets fixes sont fusionnés par tuiles dans park.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { Kit, paint, vmat, plankTex } from './farmkit.js';

export { Kit, paint, vmat, plankTex };
const _c2 = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const Sph = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 12);
const E = (rx, ry, rz, w, h) => { const g = new THREE.SphereGeometry(1, w || 18, h || 12); g.scale(rx, ry, rz); return g; };
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (r0, r1, h, s, open) => new THREE.CylinderGeometry(r0, r1, h, s || 14, 1, !!open);
const Cone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 16);
const Tor = (R, r, a, b, arc) => new THREE.TorusGeometry(R, r, a || 8, b || 24, arc);
const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
const stripes = (a, b, n) => (x, y, z, c) => c.set(Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * n) % 2 ? a : b);

/** Une liste de géométries déjà peintes, posées puis fusionnées (pour les tuiles du décor). */
export class Pack {
  constructor() { this.list = []; }
  put(geo, t) { this.list.push(Object.assign({ geo }, t || {})); return this; }
  get size() { return this.list.length; }
  geo() { return M.mergeGeos(this.list); }
}

// ---------------------------------------------------------------------------
// Le petit train
// ---------------------------------------------------------------------------
function wheels(k, z0, z1, r) {
  for (const z of [z0, z1]) for (const sx of [-1, 1]) {
    k.add(Cyl(r, r, 0.16, 16), (x, y, z2, c) => c.set(Math.abs(y) > 0.07 ? 0xd83a2a : 0x2a2a30), { x: sx * 0.72, y: r, z, rz: Math.PI / 2 });
    k.add(Cyl(r * 0.3, r * 0.3, 0.2, 8), 0xf0c040, { x: sx * 0.8, y: r, z, rz: Math.PI / 2 });
  }
}
/** Locomotive (l'avant vers +z), hauteur du siège 1.0. */
export function locoGeo() {
  const k = new Kit();
  k.add(Box(1.5, 0.35, 3.2), 0x3a3a46, { y: 0.55 });
  k.add(Cyl(0.62, 0.62, 1.9, 20), (x, y, z, c) => c.set(Math.abs(y) > 0.82 ? 0xf0c040 : 0x2a8a4a), { y: 1.25, z: 0.55, rx: Math.PI / 2 });
  k.add(Cyl(0.62, 0.62, 0.12, 20), 0xf0c040, { y: 1.25, z: 1.52, rx: Math.PI / 2 });
  k.add(Sph(0.18, 12, 8), 0xfff6c0, { y: 1.3, z: 1.6 });                       // le phare
  k.add(Cyl(0.18, 0.3, 0.7, 12), 0x2a2a30, { y: 2.15, z: 1.0 });                // la cheminée
  k.add(Cyl(0.34, 0.2, 0.18, 12), 0x2a2a30, { y: 2.55, z: 1.0 });
  k.add(Sph(0.22, 12, 8), 0xf0c040, { y: 1.95, z: 0.2 });                       // le dôme
  k.add(Box(1.5, 1.3, 1.2), 0xd83a2a, { y: 1.35, z: -0.95 });                   // la cabine
  k.add(Box(1.7, 0.14, 1.5), 0x2a2a30, { y: 2.08, z: -0.95 });
  for (const sx of [-1, 1]) k.add(Box(0.04, 0.5, 0.6), 0xbfe8ff, { x: sx * 0.76, y: 1.6, z: -0.95 });
  k.add(Box(1.6, 0.2, 0.2), 0xf0c040, { y: 0.5, z: 1.65 });                     // pare-chocs
  k.add(Cone(0.5, 0.5, 4), 0x2a2a30, { y: 0.45, z: 1.85, rx: Math.PI / 2, ry: Math.PI / 4, sy: 0.6 });
  wheels(k, 0.9, -0.9, 0.42);
  return k.geo();
}
/** Wagon ouvert (deux bancs), couleur au choix. */
export function wagonGeo(col) {
  const k = new Kit();
  k.add(Box(1.5, 0.3, 2.6), 0x3a3a46, { y: 0.5 });
  k.add(Box(1.6, 0.5, 2.5), col, { y: 0.9 });
  k.add(Box(1.3, 0.35, 2.2), 0xfff4e0, { y: 1.0 });
  for (const z of [-0.6, 0.6]) { k.add(Box(1.2, 0.18, 0.5), 0x8a5a30, { y: 1.05, z }); k.add(Box(1.2, 0.5, 0.12), 0x8a5a30, { y: 1.3, z: z - 0.22 }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Cyl(0.05, 0.05, 1.5, 6), 0xf0c040, { x: sx * 0.7, y: 1.9, z: sz * 1.1 });
  k.add(Box(1.7, 0.1, 2.6), col, { y: 2.65 });
  k.add(Box(1.75, 0.06, 2.65), 0xffffff, { y: 2.73 });
  wheels(k, 0.75, -0.75, 0.32);
  return k.geo();
}

// ---------------------------------------------------------------------------
// Pédalo-cygne (l'avant vers +z)
// ---------------------------------------------------------------------------
export function swanGeo() {
  const k = new Kit();
  k.add(E(0.95, 0.42, 1.45, 22, 12), (x, y, z, c) => c.set(y < -0.1 ? 0xe8e8f0 : 0xffffff), { y: 0.15 });
  k.add(E(0.75, 0.2, 1.1), 0x5a8ad8, { y: 0.48 });                            // banquette
  k.add(Box(1.2, 0.5, 0.18), 0x5a8ad8, { y: 0.75, z: -0.55 });
  for (const sx of [-1, 1]) k.add(E(0.18, 0.4, 0.95), 0xffffff, { x: sx * 0.92, y: 0.62, z: -0.15, rz: sx * 0.5 });   // ailes
  // le cou en S et la tête
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.45, 1.05), new THREE.Vector3(0, 1.2, 1.35), new THREE.Vector3(0, 1.9, 1.1), new THREE.Vector3(0, 2.2, 1.35)]);
  k.add(new THREE.TubeGeometry(curve, 16, 0.16, 10), 0xffffff);
  k.add(Sph(0.24, 14, 10), 0xffffff, { y: 2.25, z: 1.42 });
  k.add(Cone(0.1, 0.36, 10), 0xf08a20, { y: 2.18, z: 1.72, rx: Math.PI / 2 + 0.25 });
  k.add(Sph(0.06, 8, 6), 0x1a1a1a, { y: 2.18, z: 1.62 });
  for (const sx of [-1, 1]) k.add(Sph(0.045, 8, 6), 0x1a1a1a, { x: sx * 0.16, y: 2.32, z: 1.5 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Manège : la partie qui tourne (toit, chevaux, plancher décoré) — centre en (0, 0)
// ---------------------------------------------------------------------------
export function horseGeo(col) {
  const k = new Kit();
  k.add(E(0.24, 0.26, 0.6), col, { y: 0 });
  k.add(E(0.14, 0.32, 0.16), col, { y: 0.3, z: 0.45, rx: -0.5 });
  k.add(E(0.13, 0.13, 0.28), col, { y: 0.55, z: 0.62, rx: 0.3 });
  k.add(E(0.06, 0.24, 0.3), 0x8a4a2a, { y: 0.5, z: 0.36, rx: -0.4 });          // crinière
  k.add(E(0.07, 0.16, 0.1), 0x8a4a2a, { y: 0.05, z: -0.62, rx: 0.6 });         // queue
  for (const sx of [-1, 1]) {
    k.add(Cap(0.06, 0.4), col, { x: sx * 0.12, y: -0.32, z: 0.38, rx: -0.9 });
    k.add(Cap(0.06, 0.4), col, { x: sx * 0.12, y: -0.32, z: -0.38, rx: 0.9 });
    k.add(Sph(0.035, 6, 5), 0x111111, { x: sx * 0.1, y: 0.62, z: 0.74 });
  }
  k.add(Box(0.3, 0.08, 0.34), 0xe03a6a, { y: 0.24 });                          // selle
  return k.geo();
}
export function carouselTopGeo(R, h) {
  const k = new Kit();
  // le toit à rayures (rouge et blanc), festonné
  k.add(Cone(R + 0.6, 1.8, 24), stripes(0xe0303a, 0xfff4e8, 12), { y: h + 0.9 });
  k.add(Cyl(R + 0.6, R + 0.6, 0.45, 24, true), stripes(0xf0c040, 0x3a8ae0, 24), { y: h - 0.15 });
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; k.add(Sph(0.2, 8, 6), i % 2 ? 0xf0c040 : 0xff8ab0, { x: Math.cos(a) * (R + 0.6), y: h - 0.42, z: Math.sin(a) * (R + 0.6), sy: 0.7 }); }
  k.add(Sph(0.3, 12, 8), 0xf0c040, { y: h + 1.95 });
  k.add(Cone(0.12, 0.6, 8), 0xe0303a, { y: h + 2.4 });
  // colonne centrale dorée avec miroirs
  k.add(Cyl(0.9, 0.9, h, 16), (x, y, z, c) => c.set(Math.floor((Math.atan2(z, x) + 4) * 2.5) % 2 ? 0xf0d080 : 0xe8f4ff), { y: h / 2 });
  // les barres des chevaux
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(Cyl(0.04, 0.04, h - 0.2, 6), 0xf0c040, { x: Math.cos(a) * (R - 1.6), y: h / 2 + 0.1, z: Math.sin(a) * (R - 1.6) }); }
  return k.geo();
}
export function carouselBaseGeo(R, floorH) {
  const k = new Kit();
  k.add(Cyl(R, R + 0.1, floorH, 32), (x, y, z, c) => c.set(y > floorH / 2 - 0.02 ? (Math.floor(Math.hypot(x, z) * 1.2) % 2 ? 0xf6e2b8 : 0xe8c890) : 0xd83a5a), { y: floorH / 2 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.add(Sph(0.09, 6, 4), 0xfff2a0, { x: Math.cos(a) * (R + 0.08), y: floorH * 0.5, z: Math.sin(a) * (R + 0.08) }); }
  return k.geo();
}

// ---------------------------------------------------------------------------
// Kiosque à musique (centre en (0, 0), sol au niveau 0)
// ---------------------------------------------------------------------------
export function kioskGeo(R, floorH, roofY) {
  const k = new Kit();
  k.add(Cyl(R, R + 0.15, floorH, 8), (x, y, z, c) => c.set(y > floorH / 2 - 0.02 ? 0xd8b888 : 0xf0ece0), { y: floorH / 2, ry: Math.PI / 8 });
  k.add(Cyl(R - 0.3, R - 0.3, 0.02, 8), 0xc8a070, { y: floorH + 0.005, ry: Math.PI / 8 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * (R - 0.45), z = Math.sin(a) * (R - 0.45);
    k.add(Cyl(0.16, 0.18, roofY - 0.5 - floorH, 10), 0xfaf6ee, { x, y: floorH + (roofY - 0.5 - floorH) / 2, z });
    // garde-corps entre les colonnes (sauf l'entrée, au sud)
    if (i === 1) continue;
    const b = a + Math.PI / 4, x2 = Math.cos(b) * (R - 0.45), z2 = Math.sin(b) * (R - 0.45);
    const mx = (x + x2) / 2, mz = (z + z2) / 2, len = Math.hypot(x2 - x, z2 - z), yaw = Math.atan2(x2 - x, z2 - z);
    k.add(Box(0.08, 0.08, len), 0xfaf6ee, { x: mx, y: floorH + 0.85, z: mz, ry: yaw });
    for (let j = 1; j < 5; j++) k.add(Cyl(0.03, 0.03, 0.8, 5), 0xfaf6ee, { x: x + (x2 - x) * j / 5, y: floorH + 0.45, z: z + (z2 - z) * j / 5 });
  }
  // le toit : un chapeau vert à 8 pans, liseré doré
  k.add(Cone(R + 0.6, 0.85, 8), (x, y, z, c) => c.set(0x3a9a6a).lerp(_c2.set(0x2a7a52), Math.floor((Math.atan2(z, x) + 4) * 8 / Math.PI) % 2 ? 0.4 : 0), { y: roofY + 0.17, ry: Math.PI / 8 });
  k.add(Cyl(R + 0.6, R + 0.6, 0.25, 8, true), 0xf0c040, { y: roofY - 0.36, ry: Math.PI / 8 });
  k.add(Sph(0.22, 10, 8), 0xf0c040, { y: roofY + 0.7 });
  k.add(Cone(0.08, 0.5, 6), 0xf0c040, { y: roofY + 1.05 });
  return k.geo();
}
/** Caisse de la fanfare (dessus au niveau h), avec une étoile peinte. */
export function bandCrateGeo(w, h, col) {
  const k = new Kit();
  k.add(Box(w, h, w), (x, y, z, c) => { c.set(col); if (Math.abs(Math.abs(x) - w / 2) < 0.06 || Math.abs(Math.abs(z) - w / 2) < 0.06 || Math.abs(y - h / 2) < 0.06) c.multiplyScalar(0.7); }, { y: h / 2 });
  k.add(Sph(0.2, 5, 2), 0xfff0a0, { y: h / 2, z: w / 2 + 0.01, sz: 0.1 });
  return k.geo();
}
/** Un tambour (déco du kiosque). */
export function drumGeo() {
  const k = new Kit();
  k.add(Cyl(0.45, 0.45, 0.5, 18), (x, y, z, c) => c.set(Math.abs(y) > 0.2 ? 0xf6f0e0 : 0xd8303a), { y: 0.25 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.add(Cyl(0.015, 0.015, 0.52, 4), 0xf0c040, { x: Math.cos(a) * 0.46, y: 0.25, z: Math.sin(a) * 0.46, rz: (i % 2 ? 1 : -1) * 0.5 }); }
  return k.geo();
}

// ---------------------------------------------------------------------------
// Aire de jeux
// ---------------------------------------------------------------------------
/** Tour du toboggan (pieds, plancher, toit pointu) ; la glissière part vers +x. */
export function slideGeo(S, groundY) {
  const k = new Kit();
  const H = S.top - groundY, w = S.w / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Cyl(0.12, 0.12, H + 2.2, 8), 0x3a8ae0, { x: sx * (w - 0.15), y: (H + 2.2) / 2, z: sz * (w - 0.15) });
  k.add(Box(S.w, 0.2, S.d), 0xf0c040, { y: H - 0.1 });
  for (const sz of [-1, 1]) k.add(Box(S.w, 0.5, 0.08), 0xe03a3a, { y: H + 0.45, z: sz * (w - 0.05) });
  k.add(Box(0.08, 0.5, S.d), 0xe03a3a, { x: -w + 0.05, y: H + 0.45, z: 0.6, sz: 0.5 });
  k.add(Cone(w * 1.55, 1.4, 4), (x, y, z, c) => c.set(Math.abs(x) > Math.abs(z) ? 0xe03a3a : 0xf6f0e0), { y: H + 2.9, ry: Math.PI / 4 });
  // la glissière : une gouttière en pente (vers +x), jusqu'au sol
  const len = S.len, ang = Math.atan2(H - 0.35, len);
  const L2 = Math.hypot(len, H - 0.35);
  k.add(Box(L2, 0.08, 1.1), 0x5ad06a, { x: w + len / 2, y: (H + 0.35) / 2 - 0.05, rz: -ang });
  for (const sz of [-1, 1]) k.add(Box(L2, 0.3, 0.08), 0x3aa04a, { x: w + len / 2, y: (H + 0.35) / 2 + 0.1, z: sz * 0.55, rz: -ang });
  k.add(Box(0.9, 0.08, 1.1), 0x5ad06a, { x: w + len + 0.4, y: 0.3 });
  return k.geo();
}
/** Marche du toboggan (cube coloré). */
export function stepGeo(w, h, d, col) { const k = new Kit(); k.add(Box(w, h, d), col, { y: h / 2 }); return k.geo(); }
/** Portique des balançoires (centre en (0, 0)) : barre à 2.9 m, l'axe le long de x. */
export function swingFrameGeo() {
  const k = new Kit();
  for (const sx of [-2.4, 2.4]) for (const sz of [-1, 1]) k.add(Cyl(0.1, 0.12, 3.2, 8), 0xe06a2a, { x: sx, y: 1.45, z: sz * 0.7, rx: sz * 0.24 });
  k.add(Cyl(0.11, 0.11, 5.1, 10), 0x3a8ae0, { y: 2.95, rz: Math.PI / 2 });
  return k.geo();
}
/** Une balançoire (pivot en haut, siège 2.4 m plus bas). */
export function swingSeatGeo(col) {
  const k = new Kit();
  for (const sx of [-1, 1]) k.add(Cyl(0.02, 0.02, 2.4, 4), 0xc8c8c8, { x: sx * 0.32, y: -1.2 });
  k.add(Box(0.8, 0.08, 0.42), col, { y: -2.42 });
  return k.geo();
}
/** Bascule de l'aire de jeux (déco). */
export function seesawToyGeo() {
  const k = new Kit();
  k.add(Cyl(0.25, 0.3, 0.5, 10), 0xe03a3a, { y: 0.25 });
  k.add(Box(3.2, 0.1, 0.36), 0xf0c040, { y: 0.55, rz: 0.15 });
  for (const sx of [-1, 1]) k.add(Cyl(0.03, 0.03, 0.3, 6), 0x3a8ae0, { x: sx * 1.3, y: 0.7 + sx * -0.2, rz: Math.PI / 2 });
  return k.geo();
}
/** Bordure de rondins autour du bac à sable. */
export function sandBorderGeo(R) {
  const k = new Kit();
  const n = Math.round(R * 2 * Math.PI / 0.36);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.add(Cyl(0.17, 0.17, 0.35 + (i % 3) * 0.06, 8), i % 2 ? 0xb07a48 : 0xa06a3a, { x: Math.cos(a) * R, y: 0.15, z: Math.sin(a) * R }); }
  return k.geo();
}
/** Seau et pelle oubliés dans le sable. */
export function bucketGeo() {
  const k = new Kit();
  k.add(Cyl(0.22, 0.16, 0.35, 12), 0xff6a3a, { y: 0.17 });
  k.add(Tor(0.2, 0.015, 4, 12, Math.PI), 0xffffff, { y: 0.35 });
  k.add(Box(0.1, 0.03, 0.5), 0x3aa0ff, { x: 0.45, y: 0.05, ry: 0.6 });
  k.add(Box(0.22, 0.03, 0.2), 0x3aa0ff, { x: 0.6, y: 0.05, z: 0.22, ry: 0.6 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Pique-nique
// ---------------------------------------------------------------------------
export function blanketGeo(a, b) {
  const g = new THREE.PlaneGeometry(3, 2.4, 12, 10); g.rotateX(-Math.PI / 2);
  return paint(g, (x, y, z, c) => c.set((Math.floor((x + 1.5) * 2) + Math.floor((z + 1.2) * 2)) % 2 ? a : b));
}
export function basketGeo() {
  const k = new Kit();
  k.add(Box(0.7, 0.4, 0.45), (x, y, z, c) => c.set(0xc8945a).multiplyScalar(0.85 + Math.abs(Math.sin(x * 40 + y * 30)) * 0.2), { y: 0.2 });
  k.add(Tor(0.3, 0.03, 6, 14, Math.PI), 0x8a5a30, { y: 0.4 });
  k.add(Box(0.72, 0.04, 0.47), 0xe04040, { y: 0.41 });
  k.add(Sph(0.08, 8, 6), 0xd8282a, { x: 0.5, y: 0.08, z: 0.3 });
  return k.geo();
}
export function parasolGeo(col) {
  const k = new Kit();
  k.add(Cyl(0.04, 0.04, 2.4, 6), 0xf6f6f6, { y: 1.2 });
  k.add(Cone(1.4, 0.6, 12), stripes(col, 0xffffff, 6), { y: 2.45 });
  return k.geo();
}
export function sandwichGeo() {
  const k = new Kit();
  k.add(Box(0.3, 0.05, 0.3), 0xf0d8a0, { y: 0.03 }); k.add(Box(0.32, 0.03, 0.32), 0x6ac040, { y: 0.07 });
  k.add(Box(0.3, 0.03, 0.3), 0xe85a5a, { y: 0.1 }); k.add(Box(0.3, 0.05, 0.3), 0xf0d8a0, { y: 0.14 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Agility
// ---------------------------------------------------------------------------
export function hurdleGeo(half) {
  const k = new Kit();
  for (const s of [-1, 1]) k.add(Cyl(0.1, 0.1, 1.2, 8), 0xffffff, { z: s * (half + 0.15), y: 0.6 });
  k.add(Cyl(0.06, 0.06, half * 2 + 0.2, 10), (x, y, z, c) => c.set(Math.floor((y + 3) * 2.5) % 2 ? 0xe03a3a : 0xffffff), { y: 0.62, rx: Math.PI / 2 });
  for (const s of [-1, 1]) k.add(Box(0.5, 0.08, 0.3), 0x3a8ae0, { z: s * (half + 0.15), y: 0.04 });
  return k.geo();
}
export function tunnelGeo(len, r) {
  const g = new THREE.CylinderGeometry(r, r, len, 22, 8, true, Math.PI / 2, Math.PI); g.rotateZ(Math.PI / 2);
  const k = new Kit();
  k.add(g, (x, y, z, c) => c.set(Math.floor((x + len) * 1.4) % 2 ? 0x3ab0e0 : 0xf0c040), { y: 0.05 });
  // l'intérieur aussi (double face)
  const g2 = g.clone(); g2.scale(0.97, 0.97, 0.97);
  const idx = g2.index; if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; } }
  k.add(g2, 0x2a6a90, { y: 0.05 });
  return k.geo();
}
export function weavePoleGeo() {
  const k = new Kit();
  k.add(Cyl(0.05, 0.05, 1.25, 8), (x, y, z, c) => c.set(Math.floor((y + 1) * 4) % 2 ? 0xe03a3a : 0xffffff), { y: 0.62 });
  k.add(Cyl(0.12, 0.14, 0.06, 10), 0x2a2a30, { y: 0.03 });
  return k.geo();
}
export function seesawBaseGeo() {
  const k = new Kit();
  k.add(Box(0.4, 0.42, 1.0), 0x3a8ae0, { y: 0.21 });
  return k.geo();
}
export function seesawPlankGeo(len) {
  const k = new Kit();
  k.add(Box(len, 0.12, 1.0), (x, y, z, c) => c.set(Math.abs(x) > len / 2 - 0.9 ? 0xf0c040 : 0x4ab04a));
  for (let i = -3; i <= 3; i++) k.add(Box(0.06, 0.04, 0.9), 0xffffff, { x: i * len / 8, y: 0.07 });
  return k.geo();
}
export function tireGeo(cy) {
  const k = new Kit();
  for (const s of [-1, 1]) k.add(Cyl(0.11, 0.11, 2.2, 8), 0xffffff, { z: s * 1.25, y: 1.1 });
  k.add(Cyl(0.08, 0.08, 2.6, 8), 0xffffff, { y: 2.2, rx: Math.PI / 2 });
  k.add(Tor(0.62, 0.17, 10, 26), (x, y, z, c) => c.set(Math.floor((Math.atan2(y, z) + 4) * 2) % 2 ? 0xf0c040 : 0x2a2a30), { y: cy, ry: Math.PI / 2 });
  for (const s of [-1, 1]) k.add(Cyl(0.015, 0.015, 2.2 - cy - 0.6, 4), 0x8a8a8a, { z: s * 0.6, y: (2.2 + cy + 0.6) / 2 });
  return k.geo();
}
export function tableGeo(w, h) {
  const k = new Kit();
  k.add(Box(w, 0.14, w), 0xe06a2a, { y: h - 0.07 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Box(0.14, h, 0.14), 0xffffff, { x: sx * (w / 2 - 0.15), y: h / 2, z: sz * (w / 2 - 0.15) });
  return k.geo();
}
export function archGeo(half, label) {
  const k = new Kit();
  for (const s of [-1, 1]) k.add(Cyl(0.13, 0.13, 3.2, 10), (x, y, z, c) => c.set(Math.floor((y + 4) * 2.2) % 2 ? 0x3a8ae0 : 0xffffff), { z: s * half, y: 1.6 });
  k.add(Box(0.14, 0.7, half * 2 + 0.3), (x, y, z, c) => c.set(Math.floor((z + 9) * 2) % 2 ? 0x2a2a30 : 0xffffff), { y: 3.0 });
  void label;
  return k.geo();
}
export function podiumGeo(w, h) {
  // le podium des champions : la grande marche au milieu, deux petites de chaque côté
  const k = new Kit();
  const side = (x, y, z, c) => c.set(y > h / 2 - 0.06 ? 0xf6f0e0 : 0x3a8ae0);
  k.add(Box(w, h, w), side, { y: h / 2 });
  k.add(Box(w * 0.9, h * 0.6, w), (x, y, z, c) => c.set(y > h * 0.3 - 0.06 ? 0xf6f0e0 : 0xe05a3a), { y: h * 0.3, z: w * 0.95 });
  k.add(Box(w * 0.9, h * 0.35, w), (x, y, z, c) => c.set(y > h * 0.175 - 0.06 ? 0xf6f0e0 : 0x4ab04a), { y: h * 0.175, z: -w * 0.95 });
  // les chiffres 1, 2, 3 (des petites plaques dorées)
  k.add(Box(0.12, 0.5, 0.04), 0xf0c040, { x: w / 2 + 0.02, y: h / 2, ry: Math.PI / 2 });
  for (const [z, hh, n] of [[w * 0.95, h * 0.3, 2], [-w * 0.95, h * 0.175, 3]]) for (let i = 0; i < n; i++) k.add(Box(0.1, 0.06, 0.3), 0xf0c040, { x: w * 0.45 + 0.02, y: hh - 0.15 + i * 0.13, z });
  return k.geo();
}
/** Clôture basse et colorée (poteau + 2 lisses), le long de x, longueur len. */
export function lowFenceGeo(len) {
  const k = new Kit();
  const n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= n; i++) k.add(Cyl(0.07, 0.07, 0.8, 6), 0xffffff, { x: -len / 2 + i * len / n, y: 0.4 });
  for (const h of [0.35, 0.7]) k.add(Box(len, 0.08, 0.06), h > 0.5 ? 0x3a8ae0 : 0xffffff, { y: h });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Lanterne magique, longue-vue, banc, quai de gare
// ---------------------------------------------------------------------------
/** Le pied et la cage de la lanterne (le verre est à part : il s'allume). */
export function lanternPostGeo() {
  const k = new Kit();
  k.add(Cyl(0.07, 0.1, 2.2, 8), 0x2a4a3a, { y: 1.1 });
  k.add(Cyl(0.22, 0.26, 0.12, 8), 0x2a4a3a, { y: 0.06 });
  k.add(Box(0.5, 0.06, 0.5), 0x2a4a3a, { y: 2.22 });
  k.add(Cone(0.38, 0.32, 4), 0x2a4a3a, { y: 2.95, ry: Math.PI / 4 });
  k.add(Sph(0.07, 8, 6), 0xf0c040, { y: 3.16 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Box(0.05, 0.6, 0.05), 0x2a4a3a, { x: sx * 0.22, y: 2.52, z: sz * 0.22 });
  return k.geo();
}
export function lanternGlassGeo() { return new THREE.BoxGeometry(0.4, 0.55, 0.4).translate(0, 2.52, 0); }
export function telescopeGeo() {
  const k = new Kit();
  k.add(Cyl(0.08, 0.12, 1.2, 8), 0x5a5a64, { y: 0.6 });
  k.add(Cyl(0.15, 0.1, 1.1, 12), 0xc8a040, { y: 1.35, z: 0.2, rx: Math.PI / 2 - 0.25 });
  k.add(Cyl(0.17, 0.17, 0.08, 12), 0x2a2a30, { y: 1.47, z: 0.73, rx: Math.PI / 2 - 0.25 });
  return k.geo();
}
export function benchGeo() {
  const k = new Kit();
  for (let i = 0; i < 3; i++) k.add(Box(1.8, 0.06, 0.14), 0xa86a3a, { y: 0.48, z: -0.18 + i * 0.18 });
  for (let i = 0; i < 2; i++) k.add(Box(1.8, 0.12, 0.05), 0xa86a3a, { y: 0.7 + i * 0.18, z: -0.3, rx: -0.15 });
  for (const sx of [-0.75, 0.75]) k.add(Box(0.08, 0.48, 0.5), 0x2a2a30, { x: sx, y: 0.24 });
  return k.geo();
}
export function stationGeo(name) {
  const k = new Kit();
  k.add(Box(3.2, 0.35, 3.2), 0xd8c8b0, { y: 0.175 });
  k.add(Box(3.24, 0.06, 3.24), 0xf0c040, { y: 0.36 });
  // (le quai regarde la voie vers +z : les poteaux derrière, le toit au-dessus des voyageurs)
  for (const sx of [-1, 1]) k.add(Cyl(0.08, 0.08, 2.8, 8), 0x2a6a4a, { x: sx * 1.3, y: 1.7, z: -1.2 });
  k.add(Box(3.4, 0.12, 2.6), 0xc84a3a, { y: 3.0, z: -0.2, rx: -0.14 });
  k.add(Box(3.4, 0.18, 0.1), 0xf0c040, { y: 2.85, z: 1.05 });
  void name;
  return k.geo();
}
/** Panneau de gare (texte sur une planche). */
export function nameBoard(text, w) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6e0'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#2a6a4a'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 118);
  x.fillStyle = '#2a4a3a'; x.font = '700 50px Fredoka, Arial Rounded MT Bold, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 66, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 1.8, (w || 1.8) / 4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide }));
  return m;
}

// ---------------------------------------------------------------------------
// Cabane perchée, barque, statue, tronc creux, champignons
// ---------------------------------------------------------------------------
export function treehouseGeo(deckR) {
  const k = new Kit();
  k.add(Cyl(deckR, deckR, 0.45, 18), (x, y, z, c) => c.set(Math.floor((x + 9) * 3) % 2 ? 0xb07a48 : 0xa06a3a), { y: -0.225 });
  // garde-corps
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; if (Math.abs(a - 3.6) < 0.35) continue; k.add(Cyl(0.05, 0.05, 0.9, 5), 0x8a5a30, { x: Math.cos(a) * (deckR - 0.1), y: 0.45, z: Math.sin(a) * (deckR - 0.1) }); }
  k.add(Tor(deckR - 0.1, 0.06, 4, 32), 0x8a5a30, { y: 0.9, rx: Math.PI / 2 });
  // la petite maison (porte vers le sud-ouest)
  const hx = -1.5, hz = -1.4;
  k.add(Box(2.0, 1.8, 1.8), (x, y, z, c) => c.set(Math.floor((y + 3) * 4) % 2 ? 0x6ab0d8 : 0x5aa0c8), { x: hx, y: 0.9, z: hz });
  k.add(Box(0.7, 1.2, 0.04), 0x3a2a1a, { x: hx, y: 0.6, z: hz + 0.92 });
  k.add(Box(0.45, 0.45, 0.04), 0xfff6c0, { x: hx + 0.6, y: 1.2, z: hz + 0.92 });
  const roof = new THREE.ConeGeometry(1.75, 1.3, 4); roof.rotateY(Math.PI / 4);
  k.add(roof, 0xe05a3a, { x: hx, y: 2.45, z: hz });
  return k.geo();
}
export function rowboatGeo() {
  const k = new Kit();
  k.add(E(0.85, 0.4, 2.0, 18, 10), (x, y, z, c) => c.set(y > 0.25 ? 0xf6f0e0 : 0x3a7ac8), { y: 0.3, sy: 1 });
  k.add(Box(1.4, 0.08, 0.3), 0xa86a3a, { y: 0.55, z: 0.3 });
  k.add(Box(0.12, 0.06, 2.4), 0xa86a3a, { x: 0.6, y: 0.6, z: -0.2, ry: 0.3 });
  return k.geo();
}
export function statueGeo() {
  const k = new Kit(), S = 0xc8c4bc;
  k.add(Box(1.2, 0.7, 1.6), 0xb8b2a8, { y: 0.35 });
  k.add(E(0.35, 0.33, 0.6), S, { y: 1.1 });
  k.add(Sph(0.3, 14, 10), S, { y: 1.55, z: 0.45 });
  k.add(E(0.15, 0.12, 0.2), S, { y: 1.47, z: 0.72 });
  for (const sx of [-1, 1]) { k.add(E(0.08, 0.2, 0.1), S, { x: sx * 0.22, y: 1.72, z: 0.4, rz: sx * 0.3 }); k.add(Cap(0.08, 0.4), S, { x: sx * 0.18, y: 0.9, z: 0.35 }); }
  k.add(Cap(0.06, 0.4), S, { y: 1.3, z: -0.6, rx: -0.8 });
  return k.geo();
}
export function logGeo() {
  const k = new Kit();
  k.add(Cyl(0.7, 0.75, 4, 16, true), (x, y, z, c) => c.set(0x7a5232).multiplyScalar(0.85 + Math.sin(Math.atan2(z, x) * 9) * 0.1), { y: 0.65, rz: Math.PI / 2 });
  k.add(Cyl(0.55, 0.55, 4.02, 16, true), 0x3a2414, { y: 0.65, rz: Math.PI / 2 });
  for (let i = 0; i < 4; i++) k.add(Sph(0.18, 8, 6), 0x5aa040, { x: -1.5 + i, y: 1.3, z: (i % 2) * 0.3, sy: 0.4 });
  return k.geo();
}
export function mushroomGeo() {
  const k = new Kit();
  k.add(Cyl(0.08, 0.1, 0.3, 8), 0xf6f0e0, { y: 0.15 });
  k.add(Sph(0.22, 12, 8), (x, y, z, c) => c.set(Math.sin(x * 30) * Math.sin(z * 30) > 0.6 ? 0xffffff : 0xe03a3a), { y: 0.3, sy: 0.55 });
  return k.geo();
}
/** Petite fontaine (entrée du parc et jardin secret) : bassin et vasque. */
export function fountainGeo(R, rimH, tall) {
  const k = new Kit();
  k.add(Cyl(R, R + 0.15, rimH, 24), 0xd8d0c4, { y: rimH / 2 });
  k.add(Tor(R - 0.08, 0.14, 6, 30), 0xe8e2d8, { y: rimH, rx: Math.PI / 2 });
  k.add(Cyl(0.45, 0.6, tall, 12), 0xd8d0c4, { y: tall / 2 });
  k.add(Cyl(1.0, 0.4, 0.35, 16), 0xe8e2d8, { y: tall + 0.15 });
  k.add(Sph(0.2, 10, 8), 0xe8e2d8, { y: tall + 0.5 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Petits animaux : lapins, canards (instanciés)
// ---------------------------------------------------------------------------
export function rabbitGeo() {
  const k = new Kit(), F = 0xd8c0a0;
  k.add(E(0.18, 0.17, 0.24), F, { y: 0.18 });
  k.add(Sph(0.13, 12, 9), F, { y: 0.34, z: 0.17 });
  for (const sx of [-1, 1]) {
    k.add(E(0.04, 0.16, 0.06), F, { x: sx * 0.06, y: 0.52, z: 0.12, rz: sx * 0.15 });
    k.add(E(0.025, 0.12, 0.03), 0xf0b0b8, { x: sx * 0.06, y: 0.52, z: 0.145, rz: sx * 0.15 });
    k.add(Sph(0.025, 6, 5), 0x111111, { x: sx * 0.08, y: 0.37, z: 0.27 });
  }
  k.add(Sph(0.07, 8, 6), 0xffffff, { y: 0.22, z: -0.24 });
  k.add(Sph(0.02, 6, 5), 0xf08a9a, { y: 0.33, z: 0.3 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Les indices de Biscotte
// ---------------------------------------------------------------------------
/** Le collier rouge et sa médaille dorée en forme d'os. */
export function collarGeo() {
  const k = new Kit();
  k.add(Tor(0.24, 0.05, 8, 24), 0xe0303a, { y: 0.06, rx: Math.PI / 2 });
  k.add(Sph(0.06, 8, 6), 0xf0c040, { z: 0.29, y: 0.05, sx: 1.6, sy: 0.5 });
  return k.geo();
}
/** Le doudou : un petit lapin en tissu bleu. */
export function doudouGeo() {
  const k = new Kit(), F = 0x8ab8f0;
  k.add(E(0.16, 0.2, 0.14), F, { y: 0.2 });
  k.add(Sph(0.14, 12, 9), F, { y: 0.45 });
  for (const sx of [-1, 1]) {
    k.add(E(0.05, 0.18, 0.04), F, { x: sx * 0.07, y: 0.66, rz: sx * 0.3 });
    k.add(Sph(0.02, 6, 5), 0x1a1a1a, { x: sx * 0.05, y: 0.48, z: 0.13 });
    k.add(Sph(0.06, 8, 6), F, { x: sx * 0.15, y: 0.22, z: 0.06 });
  }
  k.add(Sph(0.03, 6, 5), 0xff8aa0, { y: 0.44, z: 0.14 });
  k.add(Box(0.12, 0.05, 0.02), 0xff6a8a, { y: 0.34, z: 0.1 });
  return k.geo();
}
/** Le jouet qui couine : un os en caoutchouc rose. */
export function squeakyGeo() {
  const k = new Kit(), P = 0xff7ab8;
  k.add(Cyl(0.07, 0.07, 0.5, 10), P, { y: 0.08, rz: Math.PI / 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(Sph(0.09, 10, 8), P, { x: sx * 0.27, y: 0.08, z: sz * 0.07 });
  return k.geo();
}
/** Petit tas de sable qui scintille (un trou à creuser). */
export function moundGeo() {
  const k = new Kit();
  k.add(Sph(0.7, 14, 8), 0xe8cc88, { y: 0, sy: 0.35 });
  for (let i = 0; i < 5; i++) { const a = i * 1.3; k.add(E(0.1, 0.03, 0.14), 0xa07a40, { x: Math.cos(a) * 0.9, y: 0.02, z: Math.sin(a) * 0.9, ry: a }); }
  return k.geo();
}
/** Le chien de Gaston (carlin entraîneur, avec un sifflet). */
export function buildGaston() {
  const g = M.buildPug({ fur: 0xd8b07a, mask: 0x2a2420, belly: 0xf0dcb8, collar: 0x3a6ae0, scale: 1.25 });
  const k = new Kit();
  k.add(Cyl(0.03, 0.03, 0.08, 6), 0xd8d8e0, { y: 0.55, z: 0.36, rx: Math.PI / 2 });
  k.add(E(0.06, 0.04, 0.05), 0xd8d8e0, { y: 0.52, z: 0.4 });
  const w = k.mesh(vmat(0.3)); w.position.y = -0.486;
  (g.userData.matcha || g).add(w);
  // une casquette bleue
  const ck = new Kit();
  ck.add(Sph(0.2, 14, 8), 0x3a6ae0, { sy: 0.5 });
  ck.add(Cyl(0.16, 0.16, 0.03, 12), 0x3a6ae0, { z: 0.17, y: -0.03, sz: 1.2 });
  const cap = ck.mesh(vmat(0.6));
  const head = g.userData.mhead || g.userData.head;
  if (head) { cap.position.set(0, 0.22, -0.02); head.add(cap); } else { cap.position.set(0, 1.25, 0.35); g.add(cap); }
  return g;
}
export function hedgeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3e8a34'; x.fillRect(0, 0, 256, 256);
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const v = 0.7 + r() * 0.5;
    x.fillStyle = `rgb(${Math.round(62 * v)},${Math.round(140 * v)},${Math.round(52 * v)})`;
    x.beginPath(); x.ellipse(r() * 256, r() * 256, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 7); x.fill();
  }
  for (let i = 0; i < 70; i++) {
    x.fillStyle = ['#ff8ab8', '#fff070', '#ffffff', '#c89aff'][i % 4];
    const px = r() * 256, py = r() * 256;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.beginPath(); x.arc(px + Math.cos(a) * 2.5, py + Math.sin(a) * 2.5, 2, 0, 7); x.fill(); }
    x.fillStyle = '#ffd040'; x.beginPath(); x.arc(px, py, 1.5, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function checkerTexture(a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
export { sstep };
