/*
 * Matcha & Ainu — Niveau 4 « Les Îles du Ciel » : les objets des îles, faits main.
 * Pierres flottantes en roche litée et motte d'herbe débordante (racines qui pendent), nuages en
 * grumeaux, Pont des Copains en planches et cordes, dalles de pierre moulurées, moulin de pierre
 * chaulée (ailes à lattes et toile), rochers-abris cabossés, haie feuillue, clocher de bois, arche
 * de pierre, canons sur affût de bois. Mêmes dimensions que les anciens modèles (sky.js) : les
 * volumes de collision ne bougent pas. Matière : SC.atlasMaterial() (l'atelier de sculpt.js).
 */
import * as THREE from '../vendor/three.module.min.js';
import * as SC from './sculpt.js';

const TAU = Math.PI * 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const RB = (w, h, d, r = 0.02, seg = 1) => SC.roundBox(w, h, d, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3), seg);
function cyl(r0, r1, h, seg = 12, su = 1, open = false) { const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * h); return g; }
const groundAO = (y0 = 0, k = 0.35, min = 0.55) => (x, y) => min + (1 - min) * sstep(y0, y0 + k, y);
// strates de la roche (du haut vers le bas) : sable chaud, ocre, brun rosé, mauve
const BANDS = [0xd8bc9a, 0xc4a080, 0xae8a72, 0x9a7a70, 0x8a6e78, 0x7a6478].map(c => hex(c));
const band = (y, k) => { const f = clamp(-y / k, 0, BANDS.length - 1.001), i = Math.floor(f); return mix3(BANDS[i], BANDS[i + 1], sstep(0.7, 1, f - i)); };

/**
 * Pierre flottante (dessus en y ≈ 0) : cône de roche litée, cabossé, qui s'effile vers le bas ;
 * motte d'herbe bombée qui déborde un peu (bord de terre), quelques racines qui pendent.
 */
export function padGeometry(rad, seed, opts = {}) {
  const lite = !!opts.lite, r = rng(seed * 13 + 5), K = new SC.AKit(), seg = lite ? 12 : 20;
  const depth = rad * (1.2 + r() * 0.4);
  const prof = [[rad * 0.98, -0.12], [rad * 1.05, -0.3], [rad * 0.95, -depth * 0.25], [rad * 0.78, -depth * 0.45], [rad * 0.55, -depth * 0.65], [rad * 0.3, -depth * 0.85], [0.05, -depth]];
  const rock = SC.latheProfile(prof, seg, Math.max(1, Math.round(rad * TAU / 3.5)), 1 / 3.5);
  const p = rock.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + (SC.noise3(Math.cos(a) * 1.7 + seed, y * 0.9, Math.sin(a) * 1.7) - 0.5) * 0.55 * clamp(-y / 0.6, 0, 1) + 0.06 * Math.sin(a * 3 + seed);
    p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, y + (SC.noise3(x * 0.8, seed, z * 0.8) - 0.5) * 0.35 * clamp(-y / 1.2, 0, 1));
  }
  rock.computeVertexNormals();
  K.add(rock, { l: 'rock', r: 0.9, c: (x, y) => band(y, depth / 5), ao: (x, y) => 0.6 + 0.4 * sstep(-depth, -0.3, y) * (y > -0.32 ? 0.85 : 1) });
  // motte d'herbe : dôme léger, bord de terre arrondi qui déborde
  const turf = SC.latheProfile([[rad * 1.02, -0.32], [rad * 1.08, -0.18], [rad * 1.04, -0.04], [rad * 0.9, 0.03], [rad * 0.5, 0.06], [0.0001, 0.07]], seg + 4, Math.max(2, Math.round(rad * TAU / 1.4)), 1 / 1.4);
  const tp = turf.attributes.position;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), a = Math.atan2(z, x), y = tp.getY(i); if (y < 0) { const k = 1 + 0.04 * Math.sin(a * 5 + seed) + (SC.noise3(Math.cos(a) * 3, seed, Math.sin(a) * 3) - 0.5) * 0.08; tp.setX(i, x * k); tp.setZ(i, z * k); } }
  turf.computeVertexNormals();
  K.add(turf, { l: 'moss', r: 1, c: (x, y, z, nx, ny) => (ny < 0.35 ? hex(0x8a6a48) : mix3(hex(0x86b850), hex(0x6a9a40), SC.noise3(x * 0.6, 1, z * 0.6))), ao: (x, y, z, nx, ny) => (ny < 0.35 ? 0.7 : 1) });
  // racines et petites touffes qui pendent du bord
  const nr = lite ? 3 : 6;
  for (let k = 0; k < nr; k++) {
    const a = r() * TAU, d = rad * (0.75 + r() * 0.2), len = 0.5 + r() * rad * 0.5, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const c = new THREE.CatmullRomCurve3([v3(x, -0.3, z), v3(x * 1.06 + (r() - 0.5) * 0.2, -0.3 - len * 0.5, z * 1.06), v3(x * 1.02, -0.3 - len, z * 1.02 + (r() - 0.5) * 0.2)]);
    K.add(new THREE.TubeGeometry(c, 5, 0.035 + r() * 0.03, 4, false), { l: 'bark', r: 0.9, c: hex(0x7a5a42), uv: [1, 3] });
  }
  return K.geo();
}

/** Nuage (plate-forme) : grumeaux cabossés serrés, ventre plus lavande. Couleurs de sommets seulement (matière émissive douce). */
export function cloudGeometry(rad, seed, opts = {}) {
  const lite = !!opts.lite, r = rng(seed * 7 + 3), parts = [];
  const n = lite ? 8 : 13, c = new THREE.Color(), lav = new THREE.Color(0xd2cbec);
  const add = (g, x, y, z) => {
    g.translate(x, y, z);
    const pp = g.attributes.position, col = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i++) { const yy = pp.getY(i); c.setRGB(1, 1, 1).lerp(lav, clamp((-yy - 0.15) * 1.1, 0, 1)); const k = 0.92 + 0.08 * clamp(yy + 0.6, 0, 1); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5, d = rad * (0.42 + r() * 0.32), s = rad * (0.36 + r() * 0.22);
    add(SC.lumpySphere(s, lite ? 1 : 2, 0.14, 2.2, seed + i * 1.7, 0.66), Math.cos(a) * d, -0.3 + r() * 0.12, Math.sin(a) * d);
  }
  for (let i = 0; i < (lite ? 2 : 4); i++) { const a = r() * TAU, d = rad * 0.2 * r(); add(SC.lumpySphere(rad * (0.4 + r() * 0.15), lite ? 1 : 2, 0.12, 2, seed - i, 0.7), Math.cos(a) * d, -0.12 + r() * 0.1, Math.sin(a) * d); }
  add(SC.lumpySphere(rad * 0.78, lite ? 2 : 2, 0.08, 1.6, seed * 3, 0.5), 0, -0.28, 0);
  const out = SC.mergeAtl(parts.map(geo => ({ geo })));
  out.deleteAttribute('atl'); out.deleteAttribute('uv');
  return out;
}

/** Planche du Pont des Copains (w × len), bords arrondis, veinage. */
export function bridgePlankGeo(w, len, seed = 1) {
  const K = new SC.AKit(), r = rng(seed);
  K.add(RB(w, 0.22, len, 0.04), { l: 'wood', r: 0.75, c: hex(0xb88a58, 0.9 + r() * 0.2), uv: 'box', us: 1.0, uvT: true, uo: [r() * 4, r() * 4], ao: (x, y) => 0.75 + 0.25 * sstep(-0.11, 0.11, y) });
  for (const sx of [-1, 1]) K.add(new THREE.SphereGeometry(0.03, 6, 4), { l: 'metal', r: 0.4, m: 0.7, c: hex(0x5a5a60), t: { x: sx * (w / 2 - 0.2), y: 0.105, z: 0 } });
  return K.geo();
}
/** Poteau du pont : rondin à tête arrondie, entouré d'une corde. */
export function bridgePostGeo() {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.21, -0.8], [0.2, 0.7], [0.17, 0.78], [0.08, 0.82], [0.0001, 0.83]], 10, 2, 2), { l: 'bark', r: 0.9, c: hex(0xa88a68), ao: groundAO(-0.8, 0.4, 0.6) });
  for (const y of [0.35, 0.5]) K.add(new THREE.TorusGeometry(0.215, 0.035, 5, 12), { l: 'rope', r: 0.9, c: hex(0xe8d8b0), uv: [6, 1], t: { y, rx: Math.PI / 2 } });
  return K.geo();
}
/** Corde (cylindre unité le long de y, étiré par le jeu). */
export function ropeGeo() { const K = new SC.AKit(); K.add(cyl(0.05, 0.05, 1, 6, 1), { l: 'rope', r: 0.9, c: hex(0xe8d8b0), uv: [1, 8] }); return K.geo(); }
/** Socle de dalle à pattes : pierre moulurée (le dessus à motif reste à part). */
export function plateBaseGeo() {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[1.52, -0.05], [1.52, 0.04], [1.44, 0.1], [1.4, 0.2], [1.34, 0.24], [1.15, 0.25]], 28, 6, 1.5), { l: 'stone', r: 0.85, c: [0.82, 0.76, 0.68], ao: groundAO(-0.05, 0.25, 0.6) });
  return K.geo();
}

// =============================================================================
// Le moulin de l'Île du Moulin (pied en 0) : tour de pierre chaulée, porte de planches, toit de tuiles
// =============================================================================
export function millTowerGeo(MI, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 12 : 20, R = MI.r, Hh = MI.h;
  const tower = SC.latheProfile([[R + 0.08, -0.2], [R + 0.08, 0.3], [R, 0.4], [R * 0.78, Hh - 0.1], [R * 0.82, Hh]], seg, Math.round(R * TAU / 1.4), 1 / 1.4);
  K.add(tower, { l: 'stone', r: 0.9, c: (x, y) => (y < 0.4 ? [0.78, 0.74, 0.68] : [0.97, 0.94, 0.88]), ao: (x, y) => 0.65 + 0.35 * sstep(-0.2, 1.2, y) });
  // corniche de bois, toit conique de tuiles, épi
  K.add(new THREE.TorusGeometry(R * 0.84, 0.09, 6, seg), { l: 'wood', r: 0.75, c: hex(0x8a5a38), t: { y: Hh + 0.02, rx: Math.PI / 2 } });
  K.add(SC.latheProfile([[R * 1.12, Hh - 0.05], [R * 1.08, Hh + 0.05], [R * 0.6, Hh + 1.1], [R * 0.2, Hh + 1.9], [0.0001, Hh + 2.25]], seg, Math.round(R * 6 / 1.2), 1 / 1.1), { l: 'tiles', r: 0.75, c: hex(0xc8503a), dbl: true });
  K.add(SC.latheProfile([[0.0001, Hh + 2.15], [0.08, Hh + 2.25], [0.05, Hh + 2.6], [0.0001, Hh + 2.7]], 8, 1, 2), { l: 'brass', r: 0.3, m: 0.85, c: hex(0xd8a848) });
  // porte en planches cintrée (vers -z), petites fenêtres
  const door = new THREE.Shape(); door.moveTo(-0.42, 0); door.lineTo(0.42, 0); door.lineTo(0.42, 1.15); door.quadraticCurveTo(0.42, 1.5, 0, 1.55); door.quadraticCurveTo(-0.42, 1.5, -0.42, 1.15); door.lineTo(-0.42, 0);
  const dg = new THREE.ExtrudeGeometry(door, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
  { const p = dg.attributes.position, uv = dg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.9, p.getY(i) / 0.9); }
  K.add(dg, { l: 'planks', r: 0.8, c: hex(0x8a5a38), t: { y: 0.0, z: -R * 0.99 - 0.04, ry: Math.PI } });
  for (const [y, a] of [[3.2, 0.9], [5.2, -0.9]]) {
    const rr = R * (1 - (y / Hh) * 0.22), x = Math.sin(a) * rr, z = -Math.cos(a) * rr;
    K.add(RB(0.5, 0.62, 0.12, 0.03), { l: 'pwood', r: 0.6, c: hex(0x4a7ab0), uv: 'box', t: { x, y, z, ry: -a } });
    K.add(RB(0.36, 0.46, 0.08, 0.01), { l: 'plain', r: 0.1, m: 0.2, c: [0.28, 0.36, 0.45], uv: 'box', t: { x: x * 1.01, y, z: z * 1.01, ry: -a } });
  }
  // moyeu des ailes
  K.add(cyl(0.22, 0.26, 0.6, 12), { l: 'wood', r: 0.75, c: hex(0x6a4a30), t: { y: Hh - 0.6, z: -R * 0.82, rx: Math.PI / 2 } });
  return K.geo();
}
/** Une aile du moulin (de y = 0,2 à 4,4, à plat dans le plan xy) : vergue, lattes, toile tendue. */
export function millSailGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(RB(0.14, 4.3, 0.12, 0.03), { l: 'wood', r: 0.75, c: hex(0x8a6040), uv: 'box', us: 1.2, t: { y: 2.3 } });
  for (const x of [0.14, 0.6]) K.add(RB(0.05, 3.6, 0.05, 0.015), { l: 'wood', r: 0.75, c: hex(0x9a7050), uv: 'box', t: { x, y: 2.55, z: 0.02 } });
  for (let k = 0; k < 8; k++) K.add(RB(0.6, 0.04, 0.04, 0.012), { l: 'wood', r: 0.75, c: hex(0x9a7050), uv: 'box', uvT: true, t: { x: 0.37, y: 0.85 + k * 0.5, z: 0.02 } });
  const sail = new THREE.PlaneGeometry(0.46, 3.5, 2, 6); const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, -0.05 * Math.cos(sp.getX(i) / 0.46 * Math.PI) - 0.02);
  sail.computeVertexNormals();
  K.add(sail, { l: 'weave', r: 0.9, c: hex(0xf2ead6), uv: [0.6, 3], dbl: true, t: { x: 0.37, y: 2.55, z: 0.04 } });
  return K.geo();
}

// =============================================================================
// Rochers-abris, haie, clocher, arche de pierre, canon, tourniquet
// =============================================================================
/** Rocher-abri (pied en 0, hauteur h, rayon r) : bloc cabossé, un peu aplati, lité. */
export function shelterRockGeo(rr, h, seed, opts = {}) {
  // bloc taillé : boîte arrondie, quelques plans de clivage (facettes), puis du bruit doux
  const K = new SC.AKit(), r = rng(seed * 31 + 7), g = SC.roundBox(2, 2, 2, 0.45, opts.lite ? 2 : 4), p = g.attributes.position, P = v3(0, 0, 0);
  const planes = [];
  for (let k = 0; k < 7; k++) { const a = r() * TAU, e = (r() - 0.3) * 1.2; planes.push([v3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)), 0.62 + r() * 0.3]); }
  for (let i = 0; i < p.count; i++) {
    P.set(p.getX(i), p.getY(i), p.getZ(i));
    for (const [n, d] of planes) { const t = P.dot(n) - d; if (t > 0) P.addScaledVector(n, -t * 0.9); }
    const k = 1 + (SC.noise3(P.x * 2.2 + seed, P.y * 2.2, P.z * 2.2) - 0.5) * 0.12;
    p.setXYZ(i, P.x * rr * 0.92 * k, (Math.max(-0.85, P.y) * 0.5 + 0.43) * h * k, P.z * rr * 0.8 * k);
  }
  g.computeVertexNormals();
  const grey = [0.74, 0.71, 0.66];
  K.add(g, { l: 'rock', r: 0.9, c: (x, y, z, nx, ny) => mix3(mix3(band(y - h, h / 2.5), grey, 0.45), hex(0x7aa04a), sstep(0.55, 0.9, ny) * 0.7), uv: 'box', us: 0.35, ao: (x, y) => 0.6 + 0.4 * sstep(0, h * 0.45, y) });
  return K.geo();
}
/** Clocher (pied en 0) : poteaux de bois, traverse, petit toit à deux pans couvert de tuiles. */
export function bellFrameGeo(color, opts = {}) {
  const K = new SC.AKit();
  for (const sx of [-1, 1]) {
    K.add(SC.latheProfile([[0.2, 0], [0.2, 0.15], [0.14, 0.25], [0.12, 3.3], [0.15, 3.4]], 10, 1, 1.5), { l: 'wood', r: 0.75, c: hex(0xb8804a), ao: groundAO(0, 0.4, 0.6), t: { x: sx * 1.35 } });
    K.add(RB(0.12, 0.5, 0.12, 0.03), { l: 'wood', r: 0.75, c: hex(0xa8703a), uv: 'box', t: { x: sx * 1.05, y: 3.1, rz: sx * 0.8 } });
  }
  K.add(RB(3.1, 0.22, 0.26, 0.04), { l: 'wood', r: 0.75, c: hex(0xa8703a), uv: 'box', uvT: true, t: { y: 3.35 } });
  for (const sz of [-1, 1]) K.add(RB(3.4, 0.07, 0.9, 0.02), { l: 'tiles', r: 0.75, c: hex(color), uv: 'box', us: 1.2, t: { y: 3.8, z: sz * 0.32, rx: sz * 0.55 } });
  K.add(cyl(0.07, 0.07, 3.45, 8), { l: 'wood', r: 0.75, c: hex(0x8a5a38), t: { y: 4.05, rz: Math.PI / 2 } });
  return K.geo();
}
/** Arche de pierre (porte du pont arc-en-ciel) : colonnes à base et chapiteau, arc de claveaux. */
export function stoneGateGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), ST = [0.95, 0.92, 0.85];
  const col = SC.latheProfile([[0.55, 0], [0.55, 0.2], [0.46, 0.3], [0.4, 0.5], [0.38, 4.2], [0.46, 4.35], [0.55, 4.45], [0.55, 4.6]], lite ? 10 : 16, 3, 1.2);
  for (const sx of [-1, 1]) K.add(col, { l: 'stone', r: 0.85, c: ST, ao: groundAO(0, 0.5, 0.6), t: { x: sx * 2.8 } });
  const n = lite ? 9 : 13;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI, am = (a0 + a1) / 2, gap = 0.004;
    const g = new THREE.TorusGeometry(2.8, 0.32, 6, 3, a1 - a0 - gap * 2); g.rotateZ(a0 + gap);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1.2, uv.getY(k) * 2);
    K.add(g, { l: 'stone', r: 0.85, c: i === (n >> 1) ? [0.98, 0.95, 0.88] : mix3(ST, [0.85, 0.8, 0.72], (i * 0.37) % 1 * 0.5), t: { y: 4.6 } });
    void am;
  }
  return K.geo();
}
/** Roue de bois à rayons (axe x), pour l'affût du canon. */
function woodWheel(K, x, y, z, R) {
  const t = new THREE.TorusGeometry(R, 0.08, 6, 20); t.rotateY(Math.PI / 2);
  K.add(t, { l: 'wood', r: 0.75, c: hex(0x9a6a40), t: { x, y, z } });
  K.add(new THREE.TorusGeometry(R + 0.04, 0.025, 4, 20).rotateY(Math.PI / 2), { l: 'metal', r: 0.4, m: 0.7, c: hex(0x4a4a50), t: { x, y, z } });
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; K.add(RB(0.06, R * 0.95, 0.07, 0.02), { l: 'wood', r: 0.75, c: hex(0x9a6a40), uv: 'box', t: { x, y: y + Math.cos(a) * R * 0.5, z: z + Math.sin(a) * R * 0.5, rx: -a } }); }
  K.add(cyl(0.12, 0.12, 0.26, 10).rotateZ(Math.PI / 2), { l: 'metal', r: 0.4, m: 0.7, c: hex(0x4a4a50), t: { x, y, z } });
}
/** Affût du canon (repère du groupe : roues de chaque côté). */
export function cannonCarriageGeo(opts = {}) {
  const K = new SC.AKit();
  for (const sx of [-1, 1]) { woodWheel(K, sx * 0.95, 0.75, -0.2, 0.72); K.add(RB(0.14, 0.5, 1.9, 0.04), { l: 'wood', r: 0.75, c: hex(0x8a5a38), uv: 'box', t: { x: sx * 0.55, y: 0.75, z: -0.3, rx: 0.25 } }); }
  K.add(cyl(0.07, 0.07, 2.1, 8).rotateZ(Math.PI / 2), { l: 'metal', r: 0.4, m: 0.7, c: hex(0x4a4a50), t: { y: 0.75, z: -0.2 } });
  return K.geo();
}
/** Fût du canon (axe z, bouche vers +z) : bronze peint bleu, frettes dorées, bourrelet de bouche. */
export function cannonBarrelGeo(opts = {}) {
  const K = new SC.AKit(), seg = opts.lite ? 14 : 22;
  const b = SC.latheProfile([[0.0001, -0.95], [0.5, -0.95], [0.8, -0.85], [0.84, -0.6], [0.76, -0.3], [0.68, 1.2], [0.72, 1.6], [0.82, 1.9], [0.86, 2.05], [0.7, 2.1], [0.5, 2.0]], seg, 4, 1.5);
  b.rotateX(Math.PI / 2);
  K.add(b, { l: 'metal', r: 0.35, m: 0.5, c: (x, y, z) => (z > 1.75 || (z > -0.5 && z < -0.3) ? hex(0xe0b04a) : hex(0x4a5a80)), t: { z: 0 } });
  for (const [z, col] of [[0.0, 0xff7ab0], [0.45, 0xffe050], [0.9, 0x6ab8ff]]) { const tor = new THREE.TorusGeometry(0.74, 0.06, 6, seg); K.add(tor, { l: 'pwood', r: 0.5, c: hex(col), t: { z } }); }
  K.add(SC.latheProfile([[0.0001, -1.2], [0.14, -1.18], [0.16, -1.05], [0.1, -0.95]], 10, 1, 2).rotateX(Math.PI / 2), { l: 'brass', r: 0.3, m: 0.85, c: hex(0xe0b04a) });
  return K.geo();
}
/** Planche du Tourniquet (centrée, dessus en 0) : lames, bouts peints, garde-corps. */
export function turnstilePlankGeo(TS, opts = {}) {
  const K = new SC.AKit(), n = Math.round(TS.hl * 2 / 0.6);
  for (let i = 0; i < n; i++) {
    const x = -TS.hl + (i + 0.5) * TS.hl * 2 / n, end = Math.abs(x) > TS.hl - 0.6;
    K.add(RB(TS.hl * 2 / n - 0.03, 0.42, TS.hw * 2, 0.03), { l: end ? 'pwood' : 'wood', r: 0.7, c: end ? hex(x < 0 ? 0xff7aa8 : 0x6ab8ff) : hex(0xc89058, 0.9 + (i % 3) * 0.06), uv: 'box', us: 1.0, ao: (xx, y) => 0.7 + 0.3 * sstep(-0.42, 0, y), t: { x, y: -0.21 } });
  }
  for (const sz of [-1, 1]) K.add(RB(TS.hl * 2, 0.1, 0.12, 0.03), { l: 'wood', r: 0.75, c: hex(0x8a5a38), uv: 'box', uvT: true, t: { y: -0.36, z: sz * (TS.hw + 0.02) } });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(SC.latheProfile([[0.08, 0], [0.07, 0.55], [0.1, 0.62], [0.0001, 0.7]], 8, 1, 2), { l: 'wood', r: 0.75, c: hex(0xb8804a), t: { x: sx * (TS.hl - 0.3), z: sz * (TS.hw - 0.12) } });
  return K.geo();
}
/** Arche d'arrivée dorée : colonnes cannelées à base et chapiteau, arc torsadé. */
export function goalArchGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), G = hex(0xffd23a);
  const col = SC.latheProfile([[0.55, 0], [0.55, 0.2], [0.45, 0.32], [0.38, 0.5], [0.35, 4.4], [0.45, 4.6], [0.55, 4.75], [0.5, 5.0]], lite ? 12 : 20, 2, 1.5);
  const p = col.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.55 && y < 4.35) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.07 * Math.cos(a * 10); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  col.computeVertexNormals();
  for (const sx of [-1, 1]) K.add(col, { l: 'brass', r: 0.25, m: 0.9, c: G, ao: groundAO(0, 0.5, 0.65), t: { x: sx * 3.2 } });
  const arc = new THREE.TorusGeometry(3.2, 0.32, lite ? 8 : 12, lite ? 32 : 56, Math.PI);
  const ap = arc.attributes.position;
  for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), y = ap.getY(i), z = ap.getZ(i), a = Math.atan2(y, x), cx = Math.cos(a) * 3.2, cy = Math.sin(a) * 3.2, dx = x - cx, dy = y - cy, b = Math.atan2(z, Math.hypot(dx, dy) * Math.sign(dx * Math.cos(a) + dy * Math.sin(a))), k = 1 + 0.06 * Math.sin(b * 4 + a * 24); ap.setXYZ(i, cx + dx * k, cy + dy * k, z * k); }
  arc.computeVertexNormals();
  K.add(arc, { l: 'brass', r: 0.25, m: 0.9, c: G, t: { y: 5 } });
  K.add(SC.latheProfile([[0.0001, 0], [0.3, 0.1], [0.36, 0.3], [0.25, 0.55], [0.08, 0.7], [0.0001, 0.75]], 14, 2, 2), { l: 'brass', r: 0.25, m: 0.9, c: G, t: { y: 8.42 } });
  return K.geo();
}
/** Ballon de baudruche (corps en goutte, nœud) — centré à peu près sur son ventre. */
export function balloonGeo(opts = {}) {
  const g = SC.latheProfile([[0.0001, -0.62], [0.06, -0.6], [0.3, -0.45], [0.5, -0.15], [0.56, 0.12], [0.52, 0.38], [0.36, 0.58], [0.0001, 0.66]], opts.lite ? 12 : 18, 1, 1);
  const knot = SC.latheProfile([[0.0001, -0.74], [0.06, -0.72], [0.05, -0.65], [0.03, -0.6]], 8, 1, 1);
  return SC.mergeAtl([{ geo: g }, { geo: knot }]);
}

/**
 * Bourrelet d'herbe au bord d'une île (rim(a) : rayon du bord, top : hauteur du dessus) : la motte
 * déborde un peu, puis la terre se replie sous le bord (fini l'arête vive du disque).
 */
export function islandLipGeo(cx, cz, rim, top, opts = {}) {
  const lite = !!opts.lite, seg = lite ? 28 : 48, K = new SC.AKit();
  const prof = [[0.92, 0, 0.075], [0.985, 0, 0.065], [1, 0.1, -0.05], [1, 0.15, -0.22], [1, 0.08, -0.42], [1, -0.1, -0.58]];
  const pos = [], uv = [], idx = [], rows = prof.length;
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * TAU, R = rim(a), wob = 1 + 0.03 * Math.sin(a * 7 + top);
    for (let j = 0; j < rows; j++) {
      const [k, dr, dy] = prof[j], rr = R * k + dr * wob;
      pos.push(cx + Math.cos(a) * rr, top + dy * (j > 1 ? wob : 1), cz + Math.sin(a) * rr);
      uv.push(a * R / 1.4, j * 0.25);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rows - 1; j++) { const p = i * rows + j, q = p + rows; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  K.add(g, { l: 'moss', r: 1, c: (x, y, z, nx, ny) => (ny > 0.25 ? hex(0x7aa848) : mix3(hex(0x7a5a3c), hex(0x6a9a40), clamp(ny * 3, 0, 1))), ao: (x, y) => 0.7 + 0.3 * sstep(top - 0.5, top, y) });
  return K.geo();
}
/** Racine qui pend (du point haut vers le bas) : courbe, effilée, deux radicelles. */
export function rootGeo(len, seed, opts = {}) {
  const r = rng(seed * 17 + 1), K = new SC.AKit(), lite = !!opts.lite;
  const pts = []; let x = 0, z = 0;
  for (let k = 0; k <= 4; k++) { pts.push(v3(x, -len * k / 4, z)); x += (r() - 0.5) * 0.4; z += (r() - 0.5) * 0.4; }
  const c = new THREE.CatmullRomCurve3(pts);
  const rad = (t) => 0.13 * (1 - t) + 0.025;
  const tube = (curve, rf, seg, rs) => {
    const g = new THREE.TubeGeometry(curve, seg, 1, rs, false), p = g.attributes.position, uv = g.attributes.uv;
    // rayon variable le long du tube (u de TubeGeometry = position le long de la courbe)
    for (let i = 0; i < p.count; i++) { const t = uv.getX(i), P = curve.getPointAt(Math.min(1, t)); const dx = p.getX(i) - P.x, dy = p.getY(i) - P.y, dz = p.getZ(i) - P.z, k = rf(t); p.setXYZ(i, P.x + dx * k, P.y + dy * k, P.z + dz * k); uv.setXY(i, uv.getY(i), t * curve.getLength() * 1.5); }
    g.computeVertexNormals();
    K.add(g, { l: 'bark', r: 0.9, c: hex(0x7a5a42) });
  };
  tube(c, rad, lite ? 6 : 10, lite ? 4 : 6);
  if (!lite) for (let k = 0; k < 2; k++) {
    const t0 = 0.3 + k * 0.3, P = c.getPointAt(t0), a = r() * TAU;
    tube(new THREE.CatmullRomCurve3([P, P.clone().add(v3(Math.cos(a) * 0.3, -0.35, Math.sin(a) * 0.3)), P.clone().add(v3(Math.cos(a) * 0.45, -0.9, Math.sin(a) * 0.45))]), (t) => rad(t0) * 0.5 * (1 - t) + 0.012, 5, 4);
  }
  return K.geo();
}

/** Fleur-trampoline : tige, sept pétales en cuillère (nervures, bord ourlé), cœur bombé de graines. */
export function flowerSpringGeo(rad, hue, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), c = new THREE.Color().setHSL(hue, 0.7, 0.66), C = [c.r, c.g, c.b];
  K.add(SC.latheProfile([[0.16, 0], [0.13, 0.2], [0.12, 0.45], [0.2, 0.55]], 8, 1, 2), { l: 'moss', r: 0.8, c: hex(0x5a9a3a), ao: groundAO(0, 0.3, 0.6) });
  const n = 7, nu = lite ? 4 : 7, nv = lite ? 5 : 8;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      const t = j / nv, w = rad * 0.4 * Math.sqrt(Math.max(0, Math.sin(t * Math.PI))) * (1 - 0.25 * t) + 0.004;
      for (let i = 0; i <= nu; i++) {
        const s = i / nu * 2 - 1, r0 = rad * (0.15 + t * 0.9);
        // cuillère : creux au milieu, bord qui remonte, pointe un peu relevée
        const y = 0.55 + 0.06 * s * s + 0.1 * t * t - 0.04 * Math.sin(t * Math.PI);
        pos.push(r0, y, s * w); uv.push(s * w / 0.4 + 0.5, t * rad / 0.4);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const p = j * (nu + 1) + i, q = p + nu + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    K.add(g, { l: 'weave', r: 0.55, c: (x, y, z) => { const t = clamp((Math.hypot(x, z) / rad - 0.15) / 0.9, 0, 1); return mix3(C.map(v => Math.min(1, v * 1.2)), C.map(v => v * 0.85), 1 - t); }, dbl: true, ao: (x, y, z) => 0.75 + 0.25 * clamp(Math.hypot(x, z) / rad, 0, 1), t: { ry: -a } });
  }
  K.add(SC.lumpySphere(rad * 0.4, lite ? 2 : 3, 0.07, 14, hue * 10, 0.42), { l: 'moss', r: 0.7, c: hex(0xffd860), uv: 3, t: { y: 0.64 } });
  return K.geo();
}

/** Grande Roue (axe x, centre en 0) : deux jantes de métal peint rose, rayons blancs, entretoises en croisillon. */
export function ferrisWheelGeo(R, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), PINK = hex(0xf08ab8), WHT = hex(0xf4f0ea);
  for (const x of [-2.1, 2.1]) {
    const rim = new THREE.TorusGeometry(R, 0.14, lite ? 6 : 8, lite ? 40 : 72); rim.rotateY(Math.PI / 2);
    const uv = rim.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * R * TAU / 0.8, uv.getY(i) * 0.5);
    K.add(rim, { l: 'metal', r: 0.4, m: 0.4, c: PINK, t: { x } });
    const inner = new THREE.TorusGeometry(R * 0.55, 0.06, 5, lite ? 24 : 40); inner.rotateY(Math.PI / 2);
    K.add(inner, { l: 'metal', r: 0.4, m: 0.4, c: PINK, t: { x } });
    for (let k = 0; k < 8; k++) K.add(cyl(0.065, 0.065, R, 6, 1).translate(0, R / 2, 0), { l: 'metal', r: 0.4, m: 0.4, c: WHT, t: { x, rx: k * Math.PI / 4 } });
  }
  // entretoises entre les deux jantes (au bout de chaque rayon) et croisillons
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, y = Math.cos(a) * R, z = Math.sin(a) * R;
    K.add(cyl(0.05, 0.05, 4.2, 6, 1).rotateZ(Math.PI / 2), { l: 'metal', r: 0.4, m: 0.4, c: WHT, t: { y, z } });
    if (!lite) { const b = a + Math.PI / 8, y2 = Math.cos(b) * R, z2 = Math.sin(b) * R, d = v3(4.2, y2 - y, z2 - z), L = d.length(); const g = cyl(0.03, 0.03, L, 5, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize())); K.add(g, { l: 'metal', r: 0.4, m: 0.4, c: PINK, t: { y: (y + y2) / 2, z: (z + z2) / 2 } }); }
  }
  return K.geo();
}

// (atelier de prise de vue : adventure/_studio.html?m=skyprops&i=…)
export const STUDIO = {
  pads: ({ lite }) => [padGeometry(2.3, 70, { lite }), SC.mergeAtl([{ geo: padGeometry(1.8, 71, { lite }), x: 5, y: 1 }]), SC.mergeAtl([{ geo: shelterRockGeo(0.8, 2.1, 3, { lite }), x: -4, y: 0 }])],
  mill: ({ lite }) => { const MI = { r: 1.5, h: 7 }; const out = [millTowerGeo(MI, { lite })]; for (let k = 0; k < 4; k++) out.push(SC.mergeAtl([{ geo: millSailGeo({ lite }), rz: k * Math.PI / 2 + 0.3 }]).translate(0, MI.h - 0.6, -MI.r * 0.95 - 0.3)); return out; },
  bridge: ({ lite }) => { const out = []; for (let i = 0; i < 6; i++) out.push(SC.mergeAtl([{ geo: bridgePlankGeo(3.2, 1.0, i), z: -i * 1.07, x: i % 2 ? 0.06 : -0.06 }])); out.push(SC.mergeAtl([{ geo: bridgePostGeo(), x: -1.8, y: 0.6, z: 0.6 }, { geo: bridgePostGeo(), x: 1.8, y: 0.6, z: 0.6 }, { geo: plateBaseGeo(), x: 0, z: 3 }])); return out; },
  gate: ({ lite }) => [stoneGateGeo({ lite }), SC.mergeAtl([{ geo: bellFrameGeo(0xff7ab0, { lite }), x: 6 }, { geo: goalArchGeo({ lite }), x: -8, ry: 0.3 }])],
  wheel: ({ lite }) => ferrisWheelGeo(6.5, { lite }).translate(0, 7, 0),
  flower: ({ lite }) => [flowerSpringGeo(1.3, 0.92, { lite }), SC.mergeAtl([{ geo: flowerSpringGeo(1.3, 0.55, { lite }), x: 3 }])],
  cannon: ({ lite }) => [cannonCarriageGeo({ lite }), SC.mergeAtl([{ geo: cannonBarrelGeo({ lite }), y: 1.3, rx: -0.65 }]), SC.mergeAtl([{ geo: turnstilePlankGeo({ hl: 5.4, hw: 1.2 }, { lite }), x: 0, y: 0.6, z: -5 }])],
};
