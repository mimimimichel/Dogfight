/*
 * Matcha & Ainu — Niveau 1 « Le Parc des Toutous » : les objets du parc, faits main.
 * Fini les jouets en plastique (boîtes, cylindres et sphères peints d'une couleur) : chaque objet
 * a une silhouette modelée (profils tournés, chanfreins, volutes, festons) et une vraie matière de
 * l'atelier (sculpt.js) : plumes du cygne, bois veiné, bois peint écaillé, fonte peinte, pierre de
 * taille, toile rayée, vichy, osier, tuiles en écailles. Mêmes dimensions que les anciens modèles
 * (parkkit.js) : les volumes de collision et les manèges ne bougent pas.
 * Toutes les géométries rendues ici vont avec SC.atlasMaterial() (un seul dessin par quartier).
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
/** Interpolation douce d'une table [[t, v], …]. */
function keys(tab) {
  return (t) => {
    if (t <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [t0, a] = tab[i - 1], [t1, b] = tab[i]; const k = (t - t0) / (t1 - t0); return a + (b - a) * k * k * (3 - 2 * k); }
    return tab[tab.length - 1][1];
  };
}
/** Ombre de contact au sol : plus sombre près de y0. */
const groundAO = (y0 = 0, k = 0.35, min = 0.55) => (x, y) => min + (1 - min) * sstep(y0, y0 + k, y);
/** Boîte aux arêtes adoucies, uv « en boîte » (veinage le long de la plus grande longueur si grain). */
const RB = (w, h, d, r = 0.02, seg = 1) => SC.roundBox(w, h, d, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3), seg);
/** Cylindre (uv : u autour × su, v le long × en mètres). */
function cyl(r0, r1, h, seg = 12, su = 1, open = false) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * h);
  return g;
}
/** Sphère / ellipsoïde (uv × su). */
function ell(rx, ry, rz, ws = 16, hs = 12, su = 1) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * su * 0.5); return g; }
/** Profil extrudé (Shape) d'épaisseur d, chanfrein arrondi ; uv = coordonnées de la forme × s. */
function extrude(shape, d, bevel = 0.015, s = 1, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve });
  g.translate(0, 0, -d / 2);
  const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  return g;
}
/** Tube à rayon variable le long d'une courbe (rad(t)), anneaux de rs côtés ; uv en mètres. */
function sweep(curve, seg, rad, rs = 10, vScale = 1, uScale = 1, caps = true) {
  const pos = [], nor = [], uv = [], idx = [];
  const frames = curve.computeFrenetFrames(seg, false), L = curve.getLength();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], r = rad(t);
    for (let j = 0; j <= rs; j++) {
      const a = j / rs * TAU, c = Math.cos(a), s = Math.sin(a);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r); nor.push(nx, ny, nz); uv.push(j / rs * uScale, t * L * vScale);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rs; j++) { const a = i * (rs + 1) + j, b = a + rs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  if (caps) for (const [i, sgn] of [[0, -1], [seg, 1]]) {
    if (rad(i / seg) < 1e-3) continue;
    const P = curve.getPointAt(i / seg), T = curve.getTangentAt(i / seg).multiplyScalar(sgn), c0 = pos.length / 3;
    pos.push(P.x, P.y, P.z); nor.push(T.x, T.y, T.z); uv.push(0.5, 0.5);
    for (let j = 0; j <= rs; j++) { const k = (i * (rs + 1) + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); nor.push(T.x, T.y, T.z); uv.push(0.5 + Math.cos(j / rs * TAU) * 0.3, 0.5 + Math.sin(j / rs * TAU) * 0.3); }
    for (let j = 0; j < rs; j++) { if (sgn > 0) idx.push(c0, c0 + 1 + j, c0 + 2 + j); else idx.push(c0, c0 + 2 + j, c0 + 1 + j); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** Retourne les triangles (après un miroir). */
function flipWinding(g) {
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } return g; }
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k], n = a.itemSize, arr = a.array; for (let i = 0; i < a.count; i += 3) for (let c = 0; c < n; c++) { const t = arr[i * n + c]; arr[i * n + c] = arr[(i + 2) * n + c]; arr[(i + 2) * n + c] = t; } }
  return g;
}
/** Coque « loftée » : sections fermées le long de z (ring(t) → [[x, y], …] de même taille), bouts fermés. */
function loft(n, ring, zOf, vScale = 1, uScale = 1) {
  const pos = [], uv = [], idx = [];
  let m = 0, acc = 0, prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, R = ring(t), z = zOf(t); m = R.length;
    const c = R.reduce((s, p) => [s[0] + p[0] / m, s[1] + p[1] / m], [0, 0]);
    if (prev) acc += Math.hypot(z - prev[0], c[1] - prev[1]); prev = [z, c[1]];
    let per = 0; const lens = [0];
    for (let j = 1; j <= m; j++) { const a = R[j - 1], b = R[j % m]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); lens.push(per); }
    for (let j = 0; j <= m; j++) { const p = R[j % m]; pos.push(p[0], p[1], z); uv.push(lens[j] * uScale, acc * vScale); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// =============================================================================
// Le pédalo-cygne (l'avant vers +z ; le bateau est posé 0,12 m sous l'eau)
// =============================================================================
/**
 * Corps de cygne en plumes (coque loftée, ventre rond, queue relevée en pointe), ailes repliées
 * en deux rangs de plumes festonnées, long cou en S qui s'affine, tête, bec orange à bouton noir ;
 * dans le creux du dos, une nacelle de bois peint et une banquette capitonnée bleue.
 */
export function swanGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit();
  const n = lite ? 14 : 22, rs = lite ? 18 : 28;
  const z0 = -1.5, z1 = 1.4, zOf = (t) => z0 + t * (z1 - z0);
  const halfW = keys([[0, 0.06], [0.07, 0.42], [0.2, 0.86], [0.45, 0.98], [0.7, 0.92], [0.82, 0.82], [1, 0.74]]);
  const yTop = keys([[0, 1.32], [0.06, 1.02], [0.18, 0.74], [0.45, 0.68], [0.75, 0.7], [0.82, 0.76], [1, 0.84]]);
  const yBot = keys([[0, 1.05], [0.06, 0.45], [0.18, -0.05], [0.45, -0.18], [0.82, -0.1], [1, 0.0]]);
  // creux du dos (là où l'on s'assoit) : ellipse centrée en z = -0,2
  const dip = (x, z) => { const e = (x / 0.66) ** 2 + ((z + 0.22) / 0.95) ** 2; return e < 1 ? (1 - e) ** 0.5 : 0; };
  const ring = (t) => {
    // poitrail : bout arrondi (en demi-sphère)
    const kb = t > 0.82 ? Math.sqrt(Math.max(0.0004, 1 - ((t - 0.82) / 0.18) ** 2)) : 1;
    const w = halfW(t) * kb, top = yTop(t), bot = yBot(t), mid = (top + bot) / 2 + (1 - kb) * 0.12, hh = (top - bot) / 2 * kb, z = zOf(t), out = [];
    for (let j = 0; j < rs; j++) {
      const a = j / rs * TAU, c = Math.cos(a), s = Math.sin(a);
      // flancs bombés (super-ellipse), ventre plus rond que le dos
      const ex = s > 0 ? 2.4 : 2.0;
      const x = w * Math.sign(c) * Math.abs(c) ** (2 / ex), y = mid + hh * Math.sign(s) * Math.abs(s) ** (2 / ex);
      out.push([x, s > 0 ? y - dip(x, z) * 0.42 * clamp(s * 1.6, 0, 1) : y]);
    }
    return out;
  };
  const hull = loft(n, ring, zOf, 1 / 0.9, 1 / 0.9);
  const white = [0.97, 0.96, 0.95];
  K.add(hull, {
    l: 'feather', r: 0.75, c: (x, y) => (y < 0.12 ? mix3(white, [0.78, 0.8, 0.74], sstep(0.12, -0.1, y)) : white),
    ao: (x, y, z) => 0.62 + 0.38 * sstep(-0.2, 0.45, y),
  });
  // nacelle : bord de bois peint (filet doré), fond sombre, banquette et dossier capitonnés
  const tub = SC.latheProfile([[0.02, 0.18], [0.5, 0.2], [0.58, 0.32], [0.6, 0.58], [0.66, 0.68], [0.7, 0.66], [0.66, 0.6]], lite ? 18 : 28, 3, 2);
  tub.scale(1, 1, 0.95 / 0.66);
  K.add(tub, { l: 'pwood', r: 0.55, c: (x, y) => (y > 0.62 ? hex(0xe8c060) : y > 0.25 ? hex(0x3a6aa8) : hex(0x2a3a5a)), ao: (x, y) => 0.6 + 0.4 * sstep(0.2, 0.6, y), t: { z: -0.22 } });
  const cushion = (w, h, d, t) => K.add(RB(w, h, d, Math.min(h, d) * 0.45, 2), { l: 'weave', r: 0.9, c: hex(0x5a8ac8), uv: 'box', us: 1.5, ao: (x, y) => 0.75 + 0.25 * sstep(t.y - h / 2, t.y + h / 2, y), t });
  cushion(1.0, 0.16, 0.5, { y: 0.44, z: -0.45 });
  cushion(1.0, 0.5, 0.14, { y: 0.78, z: -0.86, rx: -0.2 });
  // ailes : deux grands panneaux de plumes un peu relevés, qui montent vers l'arrière ; bord de fuite
  // festonné (rémiges arrondies) ; un rang de couvertures plus court par-dessus
  const wingShape = (len, hgt, tips) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(len * 0.2, hgt * 0.9, len * 0.6, hgt * 1.1, len, hgt * 0.62);
    for (let k = 0; k < tips; k++) {
      const a = k / tips, b = (k + 1) / tips;
      const xa = len * (1 - 0.72 * a), xb = len * (1 - 0.72 * b), ya = hgt * (0.62 - 0.8 * a), yb = hgt * (0.62 - 0.8 * b);
      s.quadraticCurveTo((xa + xb) / 2 - hgt * 0.12, Math.min(ya, yb) - hgt * 0.14, xb, yb);
    }
    s.quadraticCurveTo(len * 0.12, -hgt * 0.18, 0, 0);
    return s;
  };
  const wing = (side, len, hgt, tips, dz, dy, out, tint) => {
    const g = extrude(wingShape(len, hgt, tips), 0.05, 0.04, 1 / 0.9, lite ? 4 : 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i);
      const z = dz - sx, y = dy + sy, t = clamp((z - z0) / (z1 - z0), 0.08, 1);
      const x = side * (halfW(t) * 0.95 + out + sz + (y - 0.45) * 0.08 + Math.sin(clamp(sx / len, 0, 1) * Math.PI) * 0.1 + Math.sin(clamp(sy / hgt, 0, 1) * Math.PI) * 0.05);
      p.setXYZ(i, x, y, z);
    }
    if (side < 0) flipWinding(g);
    g.computeVertexNormals();
    K.add(g, { l: 'feather', r: 0.75, c: tint, ao: (x, y) => 0.7 + 0.3 * sstep(0.25, 0.9, y) });
  };
  for (const side of [-1, 1]) {
    wing(side, 1.4, 0.62, lite ? 3 : 4, 0.55, 0.36, 0.03, [0.95, 0.94, 0.93]);
    wing(side, 0.85, 0.4, lite ? 2 : 3, 0.58, 0.52, 0.08, [0.99, 0.98, 0.97]);
  }
  // le cou en S (s'affine vers la tête) et la tête
  const neck = new THREE.CatmullRomCurve3([v3(0, 0.62, 0.95), v3(0, 1.05, 1.4), v3(0, 1.6, 1.28), v3(0, 2.0, 1.02), v3(0, 2.25, 1.18), v3(0, 2.32, 1.36)]);
  K.add(sweep(neck, lite ? 14 : 26, (t) => 0.13 + 0.2 * (1 - sstep(0, 0.45, t)) + 0.02 * sstep(0.85, 1, t), lite ? 8 : 12, 1 / 0.38, 1.3), { l: 'feather', r: 0.75, c: white, ao: (x, y) => 0.75 + 0.25 * sstep(0.6, 1.4, y) });
  // tête en coin (front fuyant vers le bec), légèrement penchée
  const head = SC.latheProfile([[0.0, 0], [0.1, 0.015], [0.155, 0.08], [0.168, 0.16], [0.15, 0.25], [0.115, 0.33], [0.08, 0.39], [0.0, 0.415]], lite ? 12 : 18, 1.2, 1 / 0.38);
  head.rotateX(Math.PI / 2); head.scale(0.92, 1.05, 1);
  K.add(head, { l: 'feather', r: 0.7, c: white, t: { y: 2.37, z: 1.21, rx: 0.3 } });
  // yeux, masque noir de l'œil au bec, bouton noir sur le bec, bec orange effilé
  for (const sx of [-1, 1]) {
    K.add(ell(0.016, 0.028, 0.09, 10, 8), { l: 'plain', r: 0.5, c: [0.07, 0.07, 0.08], t: { x: sx * 0.1, y: 2.29, z: 1.52, ry: sx * 0.38, rx: 0.32 } });
    K.add(ell(0.02, 0.022, 0.02, 8, 6), { l: 'plain', r: 0.08, c: [0.03, 0.025, 0.02], t: { x: sx * 0.142, y: 2.33, z: 1.44 } });
    K.add(ell(0.006, 0.006, 0.006, 6, 4), { l: 'plain', r: 0.1, c: [1, 1, 1], t: { x: sx * 0.158, y: 2.338, z: 1.45 } });
  }
  K.add(ell(0.04, 0.042, 0.055, 10, 8), { l: 'plain', r: 0.45, c: [0.05, 0.05, 0.06], t: { y: 2.285, z: 1.585, rx: 0.3 } });
  const beak = SC.latheProfile([[0.0, -0.01], [0.07, 0.0], [0.066, 0.08], [0.052, 0.2], [0.03, 0.29], [0.0, 0.32]], lite ? 8 : 12, 1, 1);
  beak.scale(1, 1, 0.72);
  K.add(beak, { l: 'metal', r: 0.4, c: hex(0xf07a1e), t: { y: 2.25, z: 1.57, rx: Math.PI / 2 + 0.32 } });
  return K.geo();
}

// =============================================================================
// Banc public : flancs en fonte moulée (volutes), lattes de bois verni
// =============================================================================
const IRON = hex(0x2c4434), VARNISH = hex(0xa06a40);
let benchCache = {};
/** Banc (1,8 m le long de x ; assise à 0,48 m, dossier vers -z). */
export function benchGeo(opts = {}) {
  const lite = !!opts.lite;
  if (benchCache[lite]) return benchCache[lite];
  const K = new SC.AKit();
  // flanc en fonte : barreaux moulés (pied arrière qui monte en dossier, pied avant qui devient
  // accoudoir à volute, traverse d'assise), petits pieds en griffe
  const P2 = (z, y) => v3(0, y, z), sideParts = [];
  const bar = (pts, r0, r1, seg) => sideParts.push(sweep(new THREE.CatmullRomCurve3(pts.map(([z, y]) => P2(z, y))), lite ? Math.ceil(seg * 0.6) : seg, (t) => r0 + (r1 - r0) * t, lite ? 4 : 7, 2, 0.5, !lite));
  bar([[-0.34, 0.02], [-0.27, 0.2], [-0.2, 0.44], [-0.27, 0.7], [-0.37, 0.98]], 0.032, 0.022, lite ? 10 : 18);
  bar([[0.3, 0.02], [0.25, 0.2], [0.22, 0.44], [0.24, 0.6], [0.2, 0.69], [0.12, 0.7], [0.1, 0.64], [0.15, 0.62]], 0.03, 0.02, lite ? 10 : 20);
  bar([[0.12, 0.68], [-0.05, 0.66], [-0.24, 0.66]], 0.018, 0.018, 6);
  bar([[-0.24, 0.44], [0.0, 0.42], [0.24, 0.44]], 0.024, 0.024, 6);
  bar([[-0.25, 0.3], [0.0, 0.2], [0.26, 0.3]], 0.016, 0.016, 8);
  if (!lite) for (const z of [-0.36, 0.31]) { const f = ell(0.05, 0.025, 0.07, 8, 6); f.translate(0, 0.02, z); sideParts.push(f); }
  for (const sx of [-0.75, 0.75]) for (const g of sideParts) K.add(g, { l: 'metal', r: 0.42, m: 0.4, c: IRON, ao: groundAO(0, 0.3, 0.6), t: { x: sx } });
  // traverse en fonte sous l'assise
  K.add(cyl(0.02, 0.02, 1.5, 6), { l: 'metal', r: 0.45, m: 0.35, c: IRON, t: { y: 0.36, z: 0.02, rz: Math.PI / 2 } });
  const slat = (w, h, d, t, k) => K.add(RB(w, h, d, 0.018, 1), { l: 'wood', r: 0.55, c: VARNISH.map(v => v * k), uv: 'box', us: 1.2, uvT: true, uo: [k * 3.1, k * 1.7], t });
  [-0.2, -0.08, 0.04, 0.16].forEach((z, i) => slat(1.9, 0.045, 0.1, { y: 0.47, z }, [1, 0.94, 1.04, 0.97][i]));
  [0.62, 0.76, 0.9].forEach((y, i) => slat(1.9, 0.09, 0.035, { y, z: -0.28 - (y - 0.5) * 0.28, rx: -0.28 }, [0.97, 1.03, 0.95][i]));
  return (benchCache[lite] = K.geo());
}

// =============================================================================
// Fontaine de pierre : bassin mouluré (creux : on voit l'eau), balustre, vasque, pomme de pin
// =============================================================================
export function fountainGeo(R, rimH, tall, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 28 : 48, su = Math.round(TAU * R / 1.1);
  const stoneC = (x, y, z) => {
    const r = Math.hypot(x, z), inside = r < R - 0.1 && y < rimH - 0.05;
    let c = [0.93, 0.9, 0.84];
    if (inside) c = mix3(c, [0.62, 0.68, 0.6], sstep(rimH - 0.1, 0.35, y) * 0.9);   // pierre mouillée, un peu verte sous l'eau
    if (!inside && y < 0.2) c = mix3(c, [0.7, 0.74, 0.6], sstep(0.2, 0, y) * 0.6);     // pied moussu
    return c;
  };
  const basin = SC.latheProfile([
    [R + 0.3, -0.05], [R + 0.3, 0.06], [R + 0.22, 0.12], [R + 0.16, 0.18], [R + 0.14, rimH - 0.16], [R + 0.2, rimH - 0.1], [R + 0.24, rimH - 0.03],
    [R + 0.22, rimH + 0.03], [R + 0.1, rimH + 0.07], [R - 0.08, rimH + 0.06], [R - 0.16, rimH + 0.0], [R - 0.17, rimH - 0.08], [R - 0.18, 0.34], [R - 0.3, 0.3], [0.7, 0.3],
  ], seg, su, 1 / 1.1);
  K.add(basin, { l: 'stone', r: 0.85, c: stoneC, ao: (x, y, z) => { const r = Math.hypot(x, z); return r < R - 0.12 ? 0.6 + 0.4 * sstep(0.3, rimH, y) : 0.6 + 0.4 * sstep(-0.05, 0.25, y); } });
  // balustre central
  const T = tall;
  const col = SC.latheProfile([[0.72, 0.28], [0.7, 0.36], [0.56, 0.42], [0.5, 0.5], [0.36, T * 0.32], [0.33, T * 0.4], [0.44, T * 0.58], [0.4, T * 0.7], [0.27, T * 0.86], [0.3, T * 0.92], [0.24, T]], lite ? 16 : 24, 3, 1 / 1.1);
  K.add(col, { l: 'stone', r: 0.85, c: stoneC, ao: (x, y) => 0.65 + 0.35 * sstep(0.3, 0.8, y) });
  // vasque : coupe évasée, lèvre roulée, creux intérieur
  const bw = Math.max(0.6, Math.min(1.05, R * 0.34));
  const bowl = SC.latheProfile([[0.24, T - 0.02], [0.4, T + 0.06], [bw * 0.8, T + 0.18], [bw, T + 0.28], [bw + 0.05, T + 0.34], [bw, T + 0.39], [bw - 0.08, T + 0.37], [bw * 0.7, T + 0.27], [0.15, T + 0.2]], lite ? 16 : 28, 5, 1 / 1.1);
  K.add(bowl, { l: 'stone', r: 0.85, c: (x, y, z) => (Math.hypot(x, z) < bw - 0.06 && y > T + 0.15 ? [0.66, 0.72, 0.66] : [0.93, 0.9, 0.84]), ao: (x, y, z) => (y < T + 0.2 && Math.hypot(x, z) > 0.3 ? 0.7 : 1) });
  // pomme de pin au sommet (d'où sort le jet)
  const cone = SC.latheProfile([[0.12, T + 0.18], [0.17, T + 0.3], [0.15, T + 0.44], [0.08, T + 0.56], [0.02, T + 0.62]], lite ? 10 : 14, 2, 3);
  const cp = cone.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.08 * Math.sin(a * 6 + y * 40); cp.setX(i, x * k); cp.setZ(i, z * k); }
  cone.computeVertexNormals();
  K.add(cone, { l: 'stone', r: 0.85, c: [0.9, 0.88, 0.82] });
  if (opts.water) {
    // (petite fontaine du jardin : un peu d'eau dans le bassin et dans la vasque)
    const wv = new THREE.CircleGeometry(R - 0.16, seg); wv.rotateX(-Math.PI / 2);
    K.add(wv, { l: 'plain', r: 0.08, m: 0.1, c: [0.32, 0.55, 0.6], t: { y: rimH - 0.12 } });
    const wb = new THREE.CircleGeometry(bw - 0.07, 20); wb.rotateX(-Math.PI / 2);
    K.add(wb, { l: 'plain', r: 0.08, m: 0.1, c: [0.4, 0.62, 0.68], t: { y: T + 0.33 } });
  }
  return K.geo();
}

// =============================================================================
// Le petit train : locomotive à vapeur et voitures ouvertes (l'avant vers +z)
// =============================================================================
const SOOT = hex(0x2a2a2e), BRASS = hex(0xd8a848), LOCO_GREEN = hex(0x2c7a50), LOCO_RED = hex(0xc8352a), CREAM = hex(0xf2e8d0);
/** Roue de chemin de fer (axe x) : bandage et boudin, rayons, moyeu en laiton, contrepoids. */
function wheelGeo(r, lite) {
  const K = new SC.AKit();
  const tyre = SC.latheProfile([[r * 0.78, -0.07], [r, -0.07], [r, 0.04], [r * 1.1, 0.06], [r * 1.1, 0.08], [r * 0.78, 0.08]], lite ? 14 : 22, 3, 2);
  tyre.rotateZ(Math.PI / 2);
  K.add(tyre, { l: 'metal', r: 0.4, m: 0.5, c: (x, y, z) => (Math.hypot(y, z) > r * 0.97 ? hex(0x9a9aa0) : LOCO_RED) });
  const disc = SC.latheProfile([[r * 0.8, 0.0], [r * 0.25, 0.02], [r * 0.2, 0.06], [0.0001, 0.07]], lite ? 12 : 18, 2, 2);
  disc.rotateZ(-Math.PI / 2);
  K.add(disc, { l: 'metal', r: 0.5, m: 0.2, c: hex(0x3a1c18), t: { x: -0.02 } });
  const ns = lite ? 4 : 8;
  for (let k = 0; k < ns; k++) { const a = k / ns * TAU; K.add(RB(0.05, r * 0.62, 0.06, 0.02), { l: 'metal', r: 0.42, m: 0.4, c: LOCO_RED, uv: 'box', t: { x: 0.03, y: Math.cos(a) * r * 0.48, z: Math.sin(a) * r * 0.48, rx: -a } }); }
  K.add(SC.latheProfile([[0.0001, 0.12], [r * 0.2, 0.1], [r * 0.24, 0.0], [r * 0.2, -0.04]], 12, 1, 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { rz: -Math.PI / 2 } });
  return K.geo();
}
const wheelCache = {};
function addWheels(K, zs, r, lite, gauge = 0.72) {
  const key = r + (lite ? 'l' : 'h'), g = wheelCache[key] || (wheelCache[key] = wheelGeo(r, lite));
  for (const z of zs) for (const sx of [-1, 1]) K.add(g, { l: 'metal', keepAtl: true, t: { x: sx * gauge, y: r, z, ry: sx > 0 ? 0 : Math.PI } });
}
/** Châssis commun : longerons sombres, traverses rouges, tampons à plateau. */
function chassis(K, len, y, lite) {
  K.add(RB(1.36, 0.28, len, 0.04), { l: 'metal', r: 0.55, m: 0.3, c: SOOT, uv: 'box', t: { y } });
  for (const sz of [-1, 1]) {
    K.add(RB(1.62, 0.26, 0.14, 0.04), { l: 'pwood', r: 0.5, c: LOCO_RED, uv: 'box', t: { y: y - 0.02, z: sz * (len / 2 + 0.04) } });
    for (const sx of [-0.52, 0.52]) {
      const b = SC.latheProfile([[0.06, 0], [0.06, 0.12], [0.04, 0.14], [0.04, 0.2], [0.11, 0.21], [0.12, 0.25], [0.0001, 0.26]], lite ? 8 : 12, 1, 2);
      b.rotateX(sz * Math.PI / 2);
      K.add(b, { l: 'metal', r: 0.35, m: 0.6, c: hex(0x8a8a90), t: { x: sx, y: y - 0.02, z: sz * (len / 2 + 0.1) } });
    }
  }
}
/** Locomotive (hauteur du siège 1,0 ; mêmes encombrements que l'ancienne). */
export function locoGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 16 : 28;
  chassis(K, 3.1, 0.55, lite);
  // tablier (passerelles latérales) et marchepieds
  K.add(RB(1.66, 0.05, 2.9, 0.02), { l: 'metal', r: 0.55, m: 0.3, c: SOOT, uv: 'box', t: { y: 0.72, z: 0.05 } });
  // chaudière verte cerclée de laiton
  const boil = SC.latheProfile([[0.0001, -0.95], [0.58, -0.95], [0.6, -0.93], [0.6, 0.93], [0.0001, 0.95]], seg, 4, 1.5);
  boil.rotateX(Math.PI / 2);
  K.add(boil, { l: 'metal', r: 0.35, m: 0.25, c: LOCO_GREEN, uv: [1, 1], t: { y: 1.25, z: 0.45 } });
  for (const z of [-0.35, 0.3, 0.95]) { const band = new THREE.TorusGeometry(0.605, 0.025, 6, seg); K.add(band, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { y: 1.25, z } }); }
  // boîte à fumée noire et sa porte bombée à charnières, poignée
  const sb = SC.latheProfile([[0.0001, -0.18], [0.63, -0.18], [0.64, -0.16], [0.64, 0.16], [0.6, 0.2], [0.5, 0.24], [0.25, 0.28], [0.0001, 0.29]], seg, 4, 1.5);
  sb.rotateX(Math.PI / 2);
  K.add(sb, { l: 'metal', r: 0.5, m: 0.4, c: SOOT, t: { y: 1.25, z: 1.52 } });
  for (const y of [1.05, 1.45]) K.add(RB(0.5, 0.04, 0.03, 0.012), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x6a6a70), uv: 'box', t: { x: -0.1, y, z: 1.79 } });
  K.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { y: 1.25, z: 1.83 } });
  // lanterne de tête
  K.add(SC.latheProfile([[0.0001, -0.12], [0.13, -0.12], [0.14, 0.06], [0.16, 0.1], [0.0001, 0.1]], 14, 1, 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { y: 1.98, z: 1.62, rx: Math.PI / 2 } });
  K.add(new THREE.CircleGeometry(0.12, 14), { l: 'plain', r: 0.08, c: [1.0, 0.95, 0.75], t: { y: 1.98, z: 1.73 } });
  // cheminée « diabolo » en fonte, couronne de cuivre
  K.add(SC.latheProfile([[0.34, 1.78], [0.3, 1.86], [0.2, 1.95], [0.17, 2.15], [0.22, 2.36], [0.32, 2.5], [0.36, 2.56], [0.34, 2.6], [0.26, 2.58], [0.2, 2.5]], lite ? 12 : 20, 3, 2), { l: 'metal', r: 0.5, m: 0.4, c: (x, y) => (y > 2.45 ? hex(0xc87a40) : SOOT), t: { z: 1.2 } });
  // dôme de vapeur (laiton) et sifflet, cloche
  K.add(SC.latheProfile([[0.3, 1.78], [0.24, 1.86], [0.2, 1.95], [0.2, 2.02], [0.15, 2.13], [0.0001, 2.18]], lite ? 12 : 20, 2, 2), { l: 'brass', r: 0.22, m: 0.9, c: BRASS, t: { z: 0.25 } });
  K.add(SC.latheProfile([[0.03, 1.8], [0.03, 2.05], [0.05, 2.07], [0.05, 2.18], [0.0001, 2.2]], 8, 1, 2), { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { z: -0.3 } });
  // cabine rouge : panneaux moulurés, fenêtres encadrées de laiton, toit cintré qui déborde
  const cz = -0.95;
  const panel = (w, h, d, t) => K.add(RB(w, h, d, 0.03), { l: 'pwood', r: 0.45, c: LOCO_RED, uv: 'box', ao: (x, y) => 0.75 + 0.25 * sstep(0.75, 1.2, y), t });
  panel(1.5, 0.62, 1.2, { y: 1.02, z: cz });
  for (const sx of [-1, 1]) { panel(0.06, 0.78, 0.22, { x: sx * 0.72, y: 1.72, z: cz + 0.49 }); panel(0.06, 0.78, 0.22, { x: sx * 0.72, y: 1.72, z: cz - 0.49 }); }
  panel(1.5, 0.78, 0.06, { y: 1.72, z: cz + 0.58 });
  for (const sx of [-1, 1]) {
    // fenêtres latérales ouvertes (cadre de laiton) et vitres rondes à l'avant
    const fr = new THREE.TorusGeometry(0.25, 0.025, 6, 4, TAU); fr.rotateY(Math.PI / 2); fr.rotateX(Math.PI / 4); fr.scale(1, 1.1, 1.05);
    K.add(fr, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: sx * 0.74, y: 1.72, z: cz } });
    const ring = new THREE.TorusGeometry(0.16, 0.03, 8, lite ? 14 : 20);
    K.add(ring, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: sx * 0.38, y: 1.75, z: cz + 0.62 } });
    K.add(new THREE.CircleGeometry(0.15, 16), { l: 'plain', r: 0.05, m: 0.2, c: [0.25, 0.38, 0.5], t: { x: sx * 0.38, y: 1.75, z: cz + 0.615, ry: Math.PI } });
    K.add(new THREE.CircleGeometry(0.15, 16), { l: 'plain', r: 0.05, m: 0.2, c: [0.3, 0.45, 0.58], t: { x: sx * 0.38, y: 1.75, z: cz + 0.625 } });
  }
  K.add(RB(1.42, 0.04, 1.1, 0.01), { l: 'planks', r: 0.8, c: hex(0x8a6040), uv: 'box', t: { y: 1.34, z: cz } });
  const rs = new THREE.Shape(); rs.moveTo(-0.88, 0); rs.quadraticCurveTo(0, 0.32, 0.88, 0); rs.lineTo(0.88, -0.05); rs.quadraticCurveTo(0, 0.26, -0.88, -0.05); rs.lineTo(-0.88, 0);
  K.add(extrude(rs, 1.5, 0.02, 1, lite ? 6 : 12), { l: 'metal', r: 0.5, m: 0.3, c: SOOT, uv: 'box', t: { y: 2.08, z: cz } });
  // chasse-pierres en barreaux
  for (let k = -3; k <= 3; k++) {
    const a = v3(k * 0.21, 0.46, 1.66), b = v3(k * 0.15, 0.09, 1.98 - Math.abs(k) * 0.035), d = b.clone().sub(a), L = d.length();
    const g = cyl(0.022, 0.022, L, 6); g.translate(0, -L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, -1, 0), d.normalize())); g.translate(a.x, a.y, a.z);
    K.add(g, { l: 'metal', r: 0.45, m: 0.5, c: LOCO_RED });
  }
  { const c = new THREE.CatmullRomCurve3([v3(-0.5, 0.09, 1.88), v3(0, 0.09, 1.99), v3(0.5, 0.09, 1.88)]); K.add(sweep(c, 10, () => 0.03, 6, 2), { l: 'metal', r: 0.45, m: 0.5, c: LOCO_RED }); }
  // cylindres et bielles
  for (const sx of [-1, 1]) {
    const c = SC.latheProfile([[0.0001, -0.3], [0.14, -0.3], [0.15, -0.26], [0.15, 0.26], [0.14, 0.3], [0.0001, 0.3]], 14, 2, 2); c.rotateX(Math.PI / 2);
    K.add(c, { l: 'metal', r: 0.35, m: 0.3, c: LOCO_GREEN, t: { x: sx * 0.68, y: 0.62, z: 1.3 } });
    K.add(RB(0.04, 0.07, 1.85, 0.02), { l: 'metal', r: 0.3, m: 0.85, c: hex(0xb0b0b8), uv: 'box', t: { x: sx * 0.86, y: 0.36, z: 0.0 } });
  }
  addWheels(K, [0.9, -0.9], 0.42, lite);
  return K.geo();
}
/** Voiture ouverte (deux banquettes), caisse de bois peint à filets dorés, dais à lambrequin rayé. */
export function wagonGeo(col, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), C = hex(col), seg = lite ? 8 : 12;
  chassis(K, 2.5, 0.5, lite);
  // caisse : panneaux à cadres moulurés
  const box = (w, h, d, t, c = C) => K.add(RB(w, h, d, 0.025), { l: 'pwood', r: 0.5, c, uv: 'box', ao: (x, y) => 0.72 + 0.28 * sstep(0.65, 1.0, y), t });
  box(1.6, 0.1, 2.5, { y: 0.69 });
  for (const sx of [-1, 1]) box(0.08, 0.48, 2.5, { x: sx * 0.76, y: 0.95 });
  for (const sz of [-1, 1]) box(1.6, 0.48, 0.08, { y: 0.95, z: sz * 1.21 });
  // moulures (cadres) et main courante en laiton
  for (const sx of [-1, 1]) for (const z of [-0.6, 0.6]) {
    const fr = new THREE.TorusGeometry(0.3, 0.015, 4, 4); fr.rotateY(Math.PI / 2); fr.rotateX(Math.PI / 4); fr.scale(1, 0.55, 1.45);
    K.add(fr, { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { x: sx * 0.805, y: 0.95, z } });
  }
  for (const sx of [-1, 1]) K.add(cyl(0.025, 0.025, 2.46, 8), { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: sx * 0.76, y: 1.22, rx: Math.PI / 2 } });
  K.add(RB(1.46, 0.03, 2.36, 0.01), { l: 'planks', r: 0.8, c: hex(0x9a7050), uv: 'box', t: { y: 0.75 } });
  // banquettes de bois verni (assise à lattes, dossier)
  for (const z of [-0.6, 0.6]) {
    for (let k = 0; k < 3; k++) K.add(RB(1.3, 0.04, 0.15, 0.015), { l: 'wood', r: 0.55, c: VARNISH, uv: 'box', uvT: true, uo: [k * 0.37, z], t: { y: 1.07, z: z - 0.17 + k * 0.17 } });
    for (let k = 0; k < 2; k++) K.add(RB(1.3, 0.12, 0.035, 0.015), { l: 'wood', r: 0.55, c: VARNISH, uv: 'box', uvT: true, uo: [k * 0.5, z], t: { y: 1.28 + k * 0.17, z: z - 0.26, rx: -0.12 } });
    for (const sx of [-0.6, 0.6]) K.add(RB(0.05, 0.36, 0.42, 0.02), { l: 'metal', r: 0.45, m: 0.3, c: SOOT, uv: 'box', t: { x: sx, y: 0.92, z: z - 0.05 } });
  }
  // colonnettes torsadées en laiton
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = cyl(0.045, 0.045, 1.55, seg, 1); g.translate(0, 0.775, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.18 * Math.sin(a * 3 + y * 14); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    K.add(g, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: sx * 0.7, y: 1.15, z: sz * 1.1 } });
  }
  // dais : toit cintré de bois peint, lambrequin de toile rayée à festons
  const rs = new THREE.Shape(); rs.moveTo(-0.9, 0); rs.quadraticCurveTo(0, 0.24, 0.9, 0); rs.lineTo(0.9, -0.06); rs.quadraticCurveTo(0, 0.18, -0.9, -0.06); rs.lineTo(-0.9, 0);
  const roof = extrude(rs, 2.66, 0.025, 1, lite ? 6 : 12); roof.rotateY(0);
  K.add(roof, { l: 'pwood', r: 0.5, c: CREAM, uv: 'box', t: { y: 2.7 } });
  const fest = (len, n) => {
    const pos = [], uv = [], idx = [], N = n * (lite ? 4 : 8);
    for (let i = 0; i <= N; i++) { const u = i / N, x = -len / 2 + u * len, d = 0.16 + 0.08 * Math.sqrt(Math.abs(Math.sin(u * n * Math.PI))); pos.push(x, 0, 0, x, -d, 0); uv.push(u * len / 0.5, 0, u * len / 0.5, d / 0.5); }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  for (const sz of [-1, 1]) K.add(fest(1.84, 4), { l: 'stripe', r: 0.85, c: C, t: { y: 2.66, z: sz * 1.34, ry: sz > 0 ? 0 : Math.PI }, dbl: true });
  for (const sx of [-1, 1]) K.add(fest(2.7, 6), { l: 'stripe', r: 0.85, c: C, t: { x: sx * 0.92, y: 2.66, ry: sx * Math.PI / 2 }, dbl: true });
  addWheels(K, [0.75, -0.75], 0.32, lite);
  return K.geo();
}

// =============================================================================
// Le manège : toit rayé à lambrequin, colonne à miroirs, barres torsadées, chevaux de bois peints
// =============================================================================
const GOLD = hex(0xe0b04a), ROYAL = hex(0x2a4a8a);
/** Barre torsadée en laiton (de y0 à y1). */
function twisted(K, x, z, y0, y1, r = 0.045, lite = false) {
  const h = y1 - y0, g = cyl(r, r, h, lite ? 8 : 12, 1); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = Math.atan2(pz, px), k = 1 + 0.2 * Math.sin(a * 3 + py * 13); p.setX(i, px * k); p.setZ(i, pz * k); }
  g.computeVertexNormals();
  K.add(g, { l: 'brass', r: 0.22, m: 0.9, c: BRASS, t: { x, y: y0, z } });
}
/** Lambrequin : panneaux festonnés autour d'un cercle (rayon R, du haut y0 vers le bas), couleurs alternées. */
function valance(K, R, y0, hgt, n, cols, opts = {}) {
  const sub = opts.lite ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, pos = [], uv = [], idx = [];
    for (let k = 0; k <= sub; k++) {
      const f = k / sub, a = a0 + (a1 - a0) * f, sc = Math.sin(f * Math.PI), d = hgt * (0.62 + 0.38 * sc);
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, y0, z, x, y0 - d, z); uv.push(f * TAU * R / n, 0, f * TAU * R / n, d);
    }
    for (let k = 0; k < sub; k++) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    K.add(g, { l: opts.l || 'pwood', r: 0.5, c: cols[i % cols.length], dbl: true, ao: (x, y) => 0.8 + 0.2 * sstep(y0 - hgt, y0, y) });
  }
  // bourrelet doré en haut
  K.add(new THREE.TorusGeometry(R, 0.05, 6, opts.lite ? 32 : 64), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, t: { y: y0, rx: Math.PI / 2 } });
}
/** Petites ampoules (globes laiteux) en couronne. */
function bulbs(K, R, y, n, r = 0.07) {
  const g = ell(r, r, r, 8, 6);
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; K.add(g, { l: 'plain', r: 0.15, c: [1.0, 0.92, 0.72], t: { x: Math.cos(a) * R, y, z: Math.sin(a) * R } }); }
}
/** La partie qui tourne : toit, lambrequin, colonne centrale, barres (sans les chevaux). Centre en (0, 0), plancher en y = 0. */
export function carouselTopGeo(R, h, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 24 : 48, RR = R + 0.6;
  // toit en pavillon (profil creusé), toile rayée rouge et crème
  const roof = SC.latheProfile([[RR + 0.05, h - 0.02], [RR, h + 0.06], [RR * 0.75, h + 0.42], [RR * 0.5, h + 0.86], [RR * 0.28, h + 1.32], [0.4, h + 1.72], [0.0001, h + 1.82]], seg, 3, 1 / 2.4);
  K.add(roof, { l: 'stripe', r: 0.85, c: hex(0xd8302e), dbl: true, ao: (x, y) => 0.85 + 0.15 * sstep(h, h + 1, y) });
  valance(K, RR + 0.02, h + 0.02, 0.55, 24, [GOLD, ROYAL], { lite });
  bulbs(K, RR + 0.08, h - 0.5, 24);
  // lanterneau, boule et flèche dorées, fanion
  K.add(SC.latheProfile([[0.45, h + 1.68], [0.42, h + 1.86], [0.32, h + 1.95], [0.3, h + 2.02], [0.0001, h + 2.06]], 16, 2, 2), { l: 'pwood', r: 0.5, c: CREAM, t: {} });
  K.add(SC.latheProfile([[0.0001, h + 1.98], [0.2, h + 2.1], [0.26, h + 2.24], [0.2, h + 2.38], [0.06, h + 2.46], [0.05, h + 2.9], [0.0001, h + 3.0]], 16, 2, 2), { l: 'brass', r: 0.22, m: 0.9, c: GOLD });
  { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.3, 0.05, 0.55, -0.08); s.lineTo(0, -0.26); s.lineTo(0, 0); K.add(extrude(s, 0.015, 0.006, 2, 4), { l: 'weave', r: 0.8, c: hex(0xd8302e), t: { x: 0.05, y: h + 2.92 } }); }
  // colonne centrale : soubassement, panneaux à miroirs, chapiteau
  const col = SC.latheProfile([[1.0, 0], [1.0, 0.18], [0.92, 0.26], [0.9, h - 0.4], [0.98, h - 0.3], [1.02, h - 0.15], [0.95, h]], lite ? 16 : 24, 6, 1 / 1.5);
  K.add(col, { l: 'pwood', r: 0.5, c: (x, y) => (y < 0.25 || y > h - 0.42 ? GOLD : CREAM) });
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU;
    K.add(RB(0.08, h - 1.2, 0.5, 0.03), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, uv: 'box', t: { x: Math.cos(a) * 0.9, y: h / 2, z: Math.sin(a) * 0.9, ry: -a } });
    K.add(RB(0.03, h - 1.4, 0.4, 0.01), { l: 'plain', r: 0.05, m: 1.0, c: [0.9, 0.92, 0.95], uv: 'box', t: { x: Math.cos(a) * 0.95, y: h / 2, z: Math.sin(a) * 0.95, ry: -a } });
  }
  // plafond (sous le toit) et barres des chevaux
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; twisted(K, Math.cos(a) * (R - 1.6), Math.sin(a) * (R - 1.6), 0.0, h + 0.1, 0.045, lite); }
  return K.geo();
}
/** Plancher fixe du manège : estrade à jupe peinte, plancher de lames, ampoules. */
export function carouselBaseGeo(R, floorH, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 28 : 56;
  const skirt = SC.latheProfile([[R + 0.14, 0], [R + 0.14, 0.08], [R + 0.08, 0.12], [R + 0.08, floorH - 0.12], [R + 0.15, floorH - 0.06], [R + 0.15, floorH], [R - 0.02, floorH + 0.01]], seg, Math.round(TAU * R / 1.2), 1 / 1.2);
  K.add(skirt, { l: 'pwood', r: 0.5, c: (x, y) => (y > floorH - 0.13 || y < 0.1 ? GOLD : hex(0xb8303e)), ao: groundAO(0, 0.3, 0.6) });
  const top = new THREE.CircleGeometry(R, seg); top.rotateX(-Math.PI / 2);
  const tu = top.attributes.uv, tp = top.attributes.position; for (let i = 0; i < tu.count; i++) tu.setXY(i, tp.getX(i) / 1.4, tp.getZ(i) / 1.4);
  K.add(top, { l: 'planks', r: 0.75, c: hex(0xd8b890), t: { y: floorH + 0.005 } });
  bulbs(K, R + 0.17, floorH * 0.5, 20, 0.06);
  return K.geo();
}
/** Cheval de bois sculpté (corps centré en 0, tête vers +z) : au galop, crinière taillée, selle et bride peintes. */
export function horseGeo(col, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), C = hex(col), n = lite ? 10 : 16, rs = lite ? 10 : 14;
  const hw = keys([[0, 0.05], [0.08, 0.17], [0.3, 0.23], [0.6, 0.22], [0.85, 0.2], [1, 0.06]]);
  const hh = keys([[0, 0.05], [0.08, 0.2], [0.3, 0.25], [0.6, 0.24], [0.85, 0.24], [1, 0.07]]);
  const cy = keys([[0, 0.05], [0.3, 0.0], [0.8, 0.02], [1, 0.08]]);
  const body = loft(n, (t) => { const out = []; for (let j = 0; j < rs; j++) { const a = j / rs * TAU; out.push([Math.cos(a) * hw(t), cy(t) + Math.sin(a) * hh(t)]); } return out; }, (t) => -0.6 + t * 1.2, 1 / 0.6, 1 / 0.6);
  K.add(body, { l: 'pwood', r: 0.45, c: C, ao: (x, y) => 0.8 + 0.2 * sstep(-0.25, 0.1, y) });
  // encolure arquée et tête (chanfrein, naseaux), oreilles
  const neck = new THREE.CatmullRomCurve3([v3(0, 0.02, 0.38), v3(0, 0.32, 0.5), v3(0, 0.6, 0.5)]);
  K.add(sweep(neck, lite ? 6 : 10, (t) => 0.19 - t * 0.08, rs, 1 / 0.6, 1), { l: 'pwood', r: 0.45, c: C });
  // tête : crâne large, joues, chanfrein qui s'affine vers le bout du nez
  const hW = keys([[0, 0.08], [0.25, 0.1], [0.6, 0.075], [0.9, 0.07], [1, 0.035]]), hH = keys([[0, 0.11], [0.3, 0.13], [0.6, 0.09], [0.9, 0.085], [1, 0.045]]);
  const headG = loft(lite ? 6 : 10, (t) => { const out = []; for (let j = 0; j < rs; j++) { const a = j / rs * TAU; out.push([Math.cos(a) * hW(t), -0.02 * (1 - t) + Math.sin(a) * hH(t) * (Math.sin(a) < 0 ? 1.0 : 0.9)]); } return out; }, (t) => t * 0.44, 1 / 0.6, 1 / 0.6);
  K.add(headG, { l: 'pwood', r: 0.45, c: C, t: { y: 0.62, z: 0.5, rx: 0.9 } });
  for (const sx of [-1, 1]) {
    const ear = SC.latheProfile([[0.035, 0], [0.03, 0.06], [0.0001, 0.12]], 6, 1, 1); ear.scale(1, 1, 0.5);
    K.add(ear, { l: 'pwood', r: 0.45, c: C, t: { x: sx * 0.05, y: 0.7, z: 0.5, rx: -0.3, rz: -sx * 0.25 } });
    K.add(ell(0.02, 0.024, 0.024, 8, 6), { l: 'plain', r: 0.1, c: [0.05, 0.04, 0.04], t: { x: sx * 0.093, y: 0.56, z: 0.61 } });
    K.add(ell(0.014, 0.012, 0.01, 6, 4), { l: 'plain', r: 0.4, c: [0.15, 0.1, 0.1], t: { x: sx * 0.035, y: 0.32, z: 0.79, rx: 0.9 } });
  }
  // crinière taillée en mèches et queue qui ondule
  const mane = lite ? 5 : 8;
  for (let i = 0; i < mane; i++) { const t = i / (mane - 1), p = neck.getPoint(t * 0.9 + 0.08); K.add(ell(0.026, 0.12, 0.05, 8, 6), { l: 'pwood', r: 0.5, c: hex(0x9a5a30), t: { x: (i % 2 ? 0.02 : -0.02), y: p.y + 0.12, z: p.z - 0.08, rx: -0.6 } }); }
  const tail = new THREE.CatmullRomCurve3([v3(0, 0.12, -0.58), v3(0, 0.05, -0.75), v3(0, -0.18, -0.8), v3(0, -0.3, -0.72)]);
  K.add(sweep(tail, lite ? 6 : 10, (t) => 0.06 * (1 - t * 0.6), 8, 2), { l: 'pwood', r: 0.5, c: hex(0x9a5a30) });
  // pattes au galop (avant repliées, arrière tendues), sabots dorés
  const leg = (pts, r0) => K.add(sweep(new THREE.CatmullRomCurve3(pts.map(p => v3(...p))), lite ? 5 : 8, (t) => r0 * (1 - t * 0.4), 8, 2), { l: 'pwood', r: 0.45, c: C });
  const hoof = (p) => K.add(SC.latheProfile([[0.045, 0], [0.05, 0.05], [0.04, 0.07]], 8, 1, 2), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, t: { x: p[0], y: p[1], z: p[2], rx: p[3] || 0 } });
  for (const sx of [-1, 1]) {
    leg([[sx * 0.11, -0.1, 0.38], [sx * 0.12, -0.3, 0.5], [sx * 0.12, -0.32, 0.66]], 0.065); hoof([sx * 0.12, -0.34, 0.7, 1.6]);
    leg([[sx * 0.11, -0.1, -0.4], [sx * 0.12, -0.34, -0.55], [sx * 0.12, -0.5, -0.72]], 0.075); hoof([sx * 0.12, -0.53, -0.74, 2.3]);
  }
  // selle rouge à liseré d'or, tapis, bride
  K.add(ell(0.26, 0.06, 0.24, 14, 8), { l: 'pwood', r: 0.45, c: hex(0xc8303a), t: { y: 0.24, z: -0.02 } });
  K.add(new THREE.TorusGeometry(0.24, 0.018, 6, 20), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, t: { y: 0.23, z: -0.02, rx: Math.PI / 2, sy: 0.9 } });
  K.add(ell(0.27, 0.12, 0.2, 14, 6), { l: 'pwood', r: 0.5, c: ROYAL, t: { y: 0.15, z: -0.02 } });
  K.add(new THREE.TorusGeometry(0.085, 0.014, 6, 16), { l: 'pwood', r: 0.5, c: hex(0xc8303a), t: { y: 0.4, z: 0.7, rx: 0.9 } });
  K.add(new THREE.TorusGeometry(0.1, 0.012, 6, 16), { l: 'pwood', r: 0.5, c: hex(0xc8303a), t: { y: 0.55, z: 0.58, rx: 0.9 + Math.PI / 2 } });
  return K.geo();
}

// =============================================================================
// Le kiosque à musique : soubassement de pierre, colonnettes de fonte, garde-corps à balustres,
// toit en pavillon couvert d'écailles vert-de-gris, lambrequin, épi doré
// =============================================================================
export function kioskGeo(R, floorH, roofY, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), oct = (g) => { g.rotateY(Math.PI / 8); return g; };
  const base = oct(SC.latheProfile([[R + 0.25, -0.1], [R + 0.25, 0.1], [R + 0.15, 0.18], [R + 0.15, floorH - 0.16], [R + 0.25, floorH - 0.1], [R + 0.25, floorH], [R - 0.2, floorH + 0.01]], 8, 8, 1 / 1.1));
  K.add(base, { l: 'stone', r: 0.85, c: [0.9, 0.87, 0.8], ao: groundAO(-0.1, 0.4, 0.6) });
  const fl = new THREE.CircleGeometry(R - 0.1, 8); fl.rotateX(-Math.PI / 2); oct(fl);
  const fu = fl.attributes.uv, fp = fl.attributes.position; for (let i = 0; i < fu.count; i++) fu.setXY(i, fp.getX(i) / 1.2, fp.getZ(i) / 1.2);
  K.add(fl, { l: 'planks', r: 0.75, c: hex(0xc8a070), t: { y: floorH + 0.012 } });
  const colH = roofY - 0.5 - floorH, IRONC = hex(0xeae4d6);
  const column = SC.latheProfile([[0.22, 0], [0.22, 0.12], [0.15, 0.2], [0.12, 0.35], [0.1, colH * 0.5], [0.09, colH - 0.35], [0.12, colH - 0.25], [0.11, colH - 0.18], [0.2, colH - 0.06], [0.22, colH]], lite ? 8 : 12, 1, 2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + Math.PI / 8, x = Math.cos(a) * (R - 0.45), z = Math.sin(a) * (R - 0.45);
    K.add(column, { l: 'metal', r: 0.4, m: 0.3, c: IRONC, t: { x, y: floorH, z } });
    // consoles ajourées sous le toit (volutes)
    const br = new THREE.CatmullRomCurve3([v3(0, colH - 0.7, 0), v3(0.25, colH - 0.25, 0), v3(0.55, colH - 0.05, 0)]);
    if (!lite) for (const da of [-1, 1]) {
      const g = sweep(br, 8, () => 0.03, 5, 2); g.rotateY(-a + (da > 0 ? 0 : Math.PI));
      K.add(g, { l: 'metal', r: 0.4, m: 0.3, c: IRONC, t: { x, y: floorH, z } });
    }
    if (i === 1) continue;
    // garde-corps : main courante de bois, balustres tournés
    const b = a + Math.PI / 4, x2 = Math.cos(b) * (R - 0.45), z2 = Math.sin(b) * (R - 0.45);
    const mx = (x + x2) / 2, mz = (z + z2) / 2, len = Math.hypot(x2 - x, z2 - z), yaw = Math.atan2(x2 - x, z2 - z);
    K.add(RB(0.12, 0.08, len, 0.03), { l: 'wood', r: 0.5, c: VARNISH, uv: 'box', t: { x: mx, y: floorH + 0.88, z: mz, ry: yaw } });
    K.add(RB(0.08, 0.06, len, 0.02), { l: 'metal', r: 0.4, m: 0.3, c: IRONC, uv: 'box', t: { x: mx, y: floorH + 0.12, z: mz, ry: yaw } });
    const bal = SC.latheProfile(lite ? [[0.035, 0], [0.025, 0.1], [0.05, 0.3], [0.025, 0.55], [0.035, 0.7]] : [[0.035, 0], [0.035, 0.06], [0.025, 0.1], [0.05, 0.3], [0.025, 0.55], [0.03, 0.66], [0.035, 0.7]], lite ? 5 : 6, 1, 2);
    const nb = lite ? 4 : 8;
    for (let j = 1; j < nb; j++) K.add(bal, { l: 'metal', r: 0.4, m: 0.3, c: IRONC, t: { x: x + (x2 - x) * j / nb, y: floorH + 0.15, z: z + (z2 - z) * j / nb } });
  }
  // toit : pavillon à 8 pans creusés, écailles vert-de-gris, plafond de lames peintes
  const roof = oct(SC.latheProfile([[R + 0.68, roofY - 0.45], [R + 0.6, roofY - 0.36], [R * 0.75, roofY - 0.08], [R * 0.45, roofY + 0.25], [0.5, roofY + 0.75], [0.0001, roofY + 0.85]], 8, 8, 1 / 1.6));
  K.add(roof, { l: 'tiles', r: 0.7, m: 0.1, c: hex(0x5a9a80), ao: (x, y) => 0.8 + 0.2 * sstep(roofY - 0.4, roofY + 0.4, y) });
  const ceil = oct(SC.latheProfile([[0.0001, roofY + 0.7], [0.5, roofY + 0.6], [R * 0.45, roofY + 0.1], [R * 0.75, roofY - 0.22], [R + 0.6, roofY - 0.5]], 8, 8, 1 / 1.6));
  K.add(ceil, { l: 'pwood', r: 0.6, c: hex(0xf2ead8), ao: () => 0.75 });
  valance(K, R + 0.62, roofY - 0.42, 0.32, 32, [CREAM], { lite });
  K.add(SC.latheProfile([[0.0001, roofY + 0.78], [0.22, roofY + 0.86], [0.25, roofY + 0.98], [0.18, roofY + 1.1], [0.05, roofY + 1.16], [0.04, roofY + 1.5], [0.0001, roofY + 1.6]], 14, 2, 2), { l: 'brass', r: 0.22, m: 0.9, c: GOLD });
  return K.geo();
}
/** Caisse en bois de la fanfare (dessus au niveau h) : planches, cornières, pochoir d'étoile. */
export function bandCrateGeo(w, h, col, opts = {}) {
  const K = new SC.AKit(), C = mix3(hex(col), [0.75, 0.62, 0.45], 0.35);
  K.add(RB(w - 0.04, h - 0.02, w - 0.04, 0.03), { l: 'planks', r: 0.75, c: C, uv: 'box', us: 1.1, ao: groundAO(0, 0.5, 0.6), t: { y: h / 2 } });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(RB(0.1, h, 0.1, 0.02), { l: 'wood', r: 0.7, c: hex(0x6a4a30), uv: 'box', ao: groundAO(0, 0.5, 0.6), t: { x: sx * (w / 2 - 0.05), y: h / 2, z: sz * (w / 2 - 0.05) } });
  for (const y of [0.06, h - 0.05]) for (const r of [0, Math.PI / 2]) for (const s of [-1, 1]) K.add(RB(w, 0.1, 0.06, 0.02), { l: 'wood', r: 0.7, c: hex(0x6a4a30), uv: 'box', uvT: true, t: { x: r ? s * (w / 2 - 0.02) : 0, y, z: r ? 0 : s * (w / 2 - 0.02), ry: r } });
  const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, rr = i % 2 ? 0.09 : 0.2; if (i) st.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else st.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  K.add(new THREE.ShapeGeometry(st), { l: 'pwood', r: 0.6, c: hex(0xf6e6a0), t: { y: h / 2, z: w / 2 - 0.005 } });
  return K.geo();
}
/** Tambour : fût rouge, cercles de laiton, cordage en zigzag, peau tendue. */
export function drumGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 16 : 24;
  K.add(SC.latheProfile([[0.44, 0.04], [0.45, 0.25], [0.44, 0.46]], seg, 4, 2), { l: 'pwood', r: 0.45, c: hex(0xc8303a) });
  for (const y of [0.04, 0.46]) K.add(new THREE.TorusGeometry(0.46, 0.03, 6, seg), { l: 'brass', r: 0.25, m: 0.9, c: GOLD, t: { y, rx: Math.PI / 2 } });
  const skin = new THREE.CircleGeometry(0.44, seg); skin.rotateX(-Math.PI / 2);
  K.add(skin, { l: 'weave', r: 0.8, c: hex(0xf2e8d2), t: { y: 0.47 } });
  const pts = []; const nz = 8;
  for (let i = 0; i <= nz * 2; i++) { const a = i / (nz * 2) * TAU; pts.push(v3(Math.cos(a) * 0.465, i % 2 ? 0.08 : 0.42, Math.sin(a) * 0.465)); }
  K.add(sweep(new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.1), nz * 8, () => 0.012, 4, 3), { l: 'rope', r: 0.9, c: hex(0xf0e2c0) });
  return K.geo();
}

// =============================================================================
// L'aire de jeux : tour en bois et toboggan inox, portique en rondins, bascule, bac à sable
// =============================================================================
const TIMBER = hex(0xc89a66), PINE = hex(0xd8b080);
/** Toit en pyramide (4 pans) couvert de tuiles, avec débord, faîtières et plafond. */
function pyramidRoof(K, half, y0, hgt, col, lite) {
  const roof = SC.latheProfile([[half * 1.42, y0], [half * 1.36, y0 + 0.06], [half * 0.7, y0 + hgt * 0.55], [0.0001, y0 + hgt]], 4, 4, 1 / 1.2);
  roof.rotateY(Math.PI / 4);
  K.add(roof, { l: 'tiles', r: 0.75, c: col, ao: (x, y) => 0.8 + 0.2 * sstep(y0, y0 + hgt * 0.6, y) });
  const ceil = SC.latheProfile([[0.0001, y0 + hgt - 0.1], [half * 1.36, y0 - 0.04]], 4, 4, 1 / 1.2); ceil.rotateY(Math.PI / 4);
  K.add(ceil, { l: 'planks', r: 0.8, c: PINE, ao: () => 0.7 });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, c = new THREE.LineCurve3(v3(Math.cos(a) * half * 1.4, y0 + 0.03, Math.sin(a) * half * 1.4), v3(0, y0 + hgt + 0.02, 0));
    K.add(sweep(c, 4, () => 0.05, 6, 2), { l: 'pwood', r: 0.6, c: mix3(col, [1, 1, 1], 0.15) });
  }
  K.add(ell(0.1, 0.1, 0.1, 10, 8), { l: 'pwood', r: 0.5, c: hex(0xf0c040), t: { y: y0 + hgt + 0.05 } });
}
/** Tour du toboggan (poteaux, plancher, garde-corps à planches peintes, toit) ; glissière inox vers +x. */
export function slideGeo(S, groundY, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), H = S.top - groundY, w = S.w / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(RB(0.17, H + 2.2, 0.17, 0.035), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', us: 1.2, ao: groundAO(0, 0.5, 0.6), t: { x: sx * (w - 0.15), y: (H + 2.2) / 2, z: sz * (w - 0.15) } });
  // plancher en lames, ceinture
  K.add(RB(S.w - 0.05, 0.12, S.d - 0.05, 0.02), { l: 'planks', r: 0.8, c: PINE, uv: 'box', us: 1.2, t: { y: H - 0.06 } });
  for (const sz of [-1, 1]) K.add(RB(S.w, 0.16, 0.06, 0.02), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', uvT: true, t: { y: H - 0.14, z: sz * (w - 0.03) } });
  // garde-corps : deux planches peintes par côté (rouge, bleu), chant arrondi
  const board = (len, t, col) => K.add(RB(len, 0.2, 0.05, 0.02), { l: 'pwood', r: 0.55, c: col, uv: 'box', uvT: true, us: 1.1, t });
  for (const sz of [-1, 1]) for (const [y, col] of [[H + 0.3, hex(0xd84a3a)], [H + 0.62, hex(0x3a78c8)]]) board(S.w - 0.2, { y, z: sz * (w - 0.08) }, col);
  for (const [y, col] of [[H + 0.3, hex(0xd84a3a)], [H + 0.62, hex(0x3a78c8)]]) board(S.d * 0.5, { x: -w + 0.08, y, z: 0.6, ry: Math.PI / 2 }, col);
  pyramidRoof(K, w, H + 2.2, 1.4, hex(0xc84a3a), lite);
  // la glissière : gouttière d'inox à bords roulés, en pente jusqu'au sol, puis la sortie à plat
  const len = S.len, drop = H - 0.35, L2 = Math.hypot(len, drop), ang = Math.atan2(drop, len);
  const prof = new THREE.Shape();
  prof.moveTo(-0.58, 0.32); prof.quadraticCurveTo(-0.6, 0.36, -0.54, 0.36); prof.lineTo(-0.5, 0.06); prof.quadraticCurveTo(-0.5, 0.0, -0.44, 0.0); prof.lineTo(0.44, 0.0); prof.quadraticCurveTo(0.5, 0.0, 0.5, 0.06); prof.lineTo(0.54, 0.36); prof.quadraticCurveTo(0.6, 0.36, 0.58, 0.32); prof.lineTo(0.56, 0.02); prof.quadraticCurveTo(0.55, -0.05, 0.46, -0.05); prof.lineTo(-0.46, -0.05); prof.quadraticCurveTo(-0.55, -0.05, -0.56, 0.02); prof.lineTo(-0.58, 0.32);
  const chute = (L) => { const g = new THREE.ExtrudeGeometry(prof, { depth: L, bevelEnabled: false, curveSegments: lite ? 3 : 6 }); g.rotateY(Math.PI / 2); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * 0.5, p.getZ(i) * 0.5); return g; };
  const steel = { l: 'brass', r: 0.18, m: 0.95, c: [0.86, 0.88, 0.9] };
  K.add(chute(L2), { ...steel, t: { x: w, y: H - 0.1, rz: -ang } });
  K.add(chute(0.95), { ...steel, t: { x: w + len - 0.05, y: 0.25 } });
  for (const x of [w + len * 0.55, w + len + 0.6]) for (const sz of [-1, 1]) K.add(cyl(0.04, 0.04, x > w + len ? 0.25 : H * 0.42, 6), { l: 'metal', r: 0.4, m: 0.4, c: hex(0x6a6a70), ao: groundAO(0, 0.3, 0.6), t: { x, y: (x > w + len ? 0.25 : H * 0.42) / 2, z: sz * 0.42 } });
  return K.geo();
}
/** Marche du toboggan : gros bloc de bois, dessus peint. */
export function stepGeo(w, h, d, col, opts = {}) {
  const K = new SC.AKit(), C = hex(col);
  K.add(RB(w, h - 0.08, d, 0.04), { l: 'planks', r: 0.8, c: mix3(PINE, [1, 1, 1], 0.1), uv: 'box', us: 1.3, ao: groundAO(0.25, 0.4, 0.6), t: { y: (h - 0.08) / 2 } });
  K.add(RB(w + 0.04, 0.1, d + 0.04, 0.035), { l: 'pwood', r: 0.55, c: C, uv: 'box', us: 1.2, t: { y: h - 0.05 } });
  return K.geo();
}
/** Portique des balançoires (barre à 2,9 m le long de x) : rondins écorcés, ferrures, crochets. */
export function swingFrameGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 8 : 12;
  const log = (r0, r1, L, t) => { const g = cyl(r0, r1, L, seg, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.04 * Math.sin(p.getY(i) * 5 + Math.atan2(p.getZ(i), p.getX(i)) * 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); K.add(g, { l: 'wood', r: 0.75, c: TIMBER, ao: groundAO(0, 0.4, 0.6), t }); };
  for (const sx of [-2.4, 2.4]) for (const sz of [-1, 1]) log(0.1, 0.12, 3.2, { x: sx, y: 1.45, z: sz * 0.7, rx: sz * 0.24 });
  log(0.11, 0.11, 5.2, { y: 2.95, rz: Math.PI / 2 });
  for (const sx of [-2.4, 2.4]) { K.add(RB(0.06, 0.32, 0.34, 0.02), { l: 'metal', r: 0.45, m: 0.5, c: hex(0x4a4a50), uv: 'box', t: { x: sx + Math.sign(sx) * 0.1, y: 2.85 } }); K.add(RB(0.1, 0.06, 1.0, 0.02), { l: 'wood', r: 0.75, c: TIMBER, uv: 'box', t: { x: sx, y: 1.6 } }); }
  for (const x of [-1.52, -0.88, 0.88, 1.52]) { K.add(new THREE.TorusGeometry(0.12, 0.02, 6, 12), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x6a6a70), t: { x, y: 2.95, ry: Math.PI / 2 } }); }
  return K.geo();
}
/** Balançoire (pivot en haut, siège 2,4 m plus bas) : cordes tressées, planche de bois peinte. */
export function swingSeatGeo(col, opts = {}) {
  const K = new SC.AKit();
  for (const sx of [-1, 1]) {
    K.add(cyl(0.022, 0.022, 2.36, 6, 1), { l: 'rope', r: 0.9, c: hex(0xe8d8b0), uv: [1, 4], t: { x: sx * 0.32, y: -1.2 } });
    K.add(new THREE.TorusGeometry(0.05, 0.012, 6, 10), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x6a6a70), t: { x: sx * 0.32, y: -0.02, ry: Math.PI / 2 } });
  }
  K.add(RB(0.84, 0.07, 0.36, 0.03), { l: 'pwood', r: 0.55, c: hex(col), uv: 'box', uvT: true, t: { y: -2.42 } });
  return K.geo();
}
/** Bascule de l'aire de jeux (déco) : chevalet, planche peinte, poignées, sièges. */
export function seesawToyGeo(opts = {}) {
  const K = new SC.AKit();
  for (const sz of [-1, 1]) K.add(RB(0.6, 0.5, 0.08, 0.03), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { y: 0.25, z: sz * 0.22 } });
  K.add(cyl(0.05, 0.05, 0.54, 10), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x6a6a70), t: { y: 0.5, rx: Math.PI / 2 } });
  const pk = new SC.AKit();
  pk.add(RB(3.2, 0.08, 0.34, 0.03), { l: 'pwood', r: 0.55, c: hex(0xe8b040), uv: 'box', uvT: true, us: 1.1 });
  for (const sx of [-1, 1]) {
    pk.add(RB(0.42, 0.06, 0.38, 0.03), { l: 'pwood', r: 0.55, c: hex(0xd84a3a), uv: 'box', t: { x: sx * 1.3, y: 0.06 } });
    const hc = new THREE.CatmullRomCurve3([v3(sx * 1.0, 0.04, -0.14), v3(sx * 1.0, 0.3, -0.12), v3(sx * 1.0, 0.3, 0.12), v3(sx * 1.0, 0.04, 0.14)]);
    pk.add(sweep(hc, 10, () => 0.022, 6, 2), { l: 'metal', r: 0.4, m: 0.4, c: hex(0x3a78c8) });
  }
  K.add(pk.geo(), { keepAtl: true, t: { y: 0.58, rz: 0.15 } });
  return K.geo();
}
/** Bordure de rondins plantés autour du bac à sable. */
export function sandBorderGeo(R, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), n = Math.round(R * TAU / 0.36), rr = rng(7);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, h = 0.35 + (i % 3) * 0.06;
    const g = cyl(0.165, 0.17, h, lite ? 7 : 9, 1.2);
    const tone = 0.85 + rr() * 0.25;
    K.add(g, { l: 'bark', r: 0.85, c: (x, y, z, nx, ny) => (ny > 0.9 ? hex(0xd8b888, tone) : hex(0xb09070, tone)), ao: (x, y) => 0.6 + 0.4 * sstep(-0.05, 0.25, y), t: { x: Math.cos(a) * R, y: 0.15, z: Math.sin(a) * R, ry: rr() * 6 } });
  }
  return K.geo();
}
/** Seau de fer peint et pelle oubliés dans le sable. */
export function bucketGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.0001, 0.0], [0.16, 0.0], [0.17, 0.02], [0.22, 0.33], [0.235, 0.35], [0.22, 0.355], [0.2, 0.33], [0.15, 0.04], [0.0001, 0.04]], 16, 3, 2), { l: 'metal', r: 0.45, m: 0.2, c: hex(0xe8623a) });
  K.add(sweep(new THREE.CatmullRomCurve3([v3(-0.22, 0.3, 0), v3(-0.15, 0.48, 0), v3(0.15, 0.48, 0), v3(0.22, 0.3, 0)]), 12, () => 0.008, 5, 3), { l: 'metal', r: 0.35, m: 0.7, c: hex(0xa0a0a8) });
  // pelle : manche de bois, pelle de fer peint
  K.add(cyl(0.018, 0.018, 0.42, 6), { l: 'wood', r: 0.6, c: TIMBER, t: { x: 0.42, y: 0.03, z: -0.05, rx: Math.PI / 2, rz: 0.6, order: 'ZXY' } });
  const bl = new THREE.Shape(); bl.moveTo(-0.08, 0); bl.lineTo(0.08, 0); bl.quadraticCurveTo(0.1, 0.16, 0, 0.22); bl.quadraticCurveTo(-0.1, 0.16, -0.08, 0);
  K.add(extrude(bl, 0.01, 0.004, 3, 4), { l: 'metal', r: 0.45, m: 0.2, c: hex(0x3a8ad8), t: { x: 0.58, y: 0.03, z: 0.2, rx: -Math.PI / 2, rz: -0.6 + Math.PI / 2, order: 'XZY' } });
  return K.geo();
}

// =============================================================================
// Le pique-nique : nappe en vichy froissée, panier d'osier, parasol de toile, sandwich
// =============================================================================
/** Nappe (3 × 2,4) : vichy, plis doux, un coin replié (posée juste au-dessus du sol). */
export function blanketGeo(a, b, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), nx = lite ? 12 : 24, nz = lite ? 10 : 20;
  const g = new THREE.PlaneGeometry(3, 2.4, nx, nz); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv, seed = (a & 255) / 37;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let y = 0.012 + 0.018 * SC.noise3(x * 1.6 + seed, 0, z * 1.6) + 0.01 * Math.sin(x * 4 + z * 2 + seed);
    // coin replié (+x, +z)
    const fx = x + z - 2.2;
    if (fx > 0) { y += fx * 0.02; p.setX(i, x - fx * 0.45); p.setZ(i, z - fx * 0.45); }
    p.setY(i, y); uv.setXY(i, (x + 1.5) / 0.8, (z + 1.2) / 0.8);
  }
  g.computeVertexNormals();
  K.add(g, { l: 'gingham', r: 0.95, c: hex(a), ao: () => 0.92, dbl: true });
  void b;
  return K.geo();
}
/** Panier de pique-nique en osier : couvercle à deux rabats, anse, coin de serviette. */
export function basketGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(RB(0.7, 0.36, 0.45, 0.06, 2), { l: 'wicker', r: 0.9, c: hex(0xe0b070), uv: 'box', us: 2.2, ao: groundAO(0, 0.25, 0.65), t: { y: 0.18 } });
  for (const sz of [-1, 1]) K.add(RB(0.72, 0.04, 0.24, 0.02, 1), { l: 'wicker', r: 0.9, c: hex(0xd0a060), uv: 'box', us: 2.2, t: { y: 0.385 + (sz > 0 ? 0.02 : 0), z: sz * 0.115, rx: sz * (sz > 0 ? -0.18 : 0.05) } });
  K.add(sweep(new THREE.CatmullRomCurve3([v3(-0.3, 0.38, 0), v3(-0.26, 0.6, 0), v3(0, 0.66, 0), v3(0.26, 0.6, 0), v3(0.3, 0.38, 0)]), 14, () => 0.022, 6, 3), { l: 'wicker', r: 0.9, c: hex(0xc89858) });
  const cloth = new THREE.PlaneGeometry(0.3, 0.2, 4, 3); const cp = cloth.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 12) * 0.015);
  cloth.computeVertexNormals();
  K.add(cloth, { l: 'gingham', r: 0.95, c: hex(0xd83a3a), uv: [1.6, 1.6], dbl: true, t: { x: 0.1, y: 0.42, z: 0.24, rx: -0.6 } });
  K.add(ell(0.08, 0.075, 0.08, 10, 8), { l: 'plain', r: 0.25, c: hex(0xd8282a), t: { x: 0.5, y: 0.075, z: 0.3 } });
  K.add(cyl(0.006, 0.006, 0.05, 4), { l: 'wood', r: 0.7, c: hex(0x5a3a20), t: { x: 0.5, y: 0.17, z: 0.3, rz: 0.3 } });
  return K.geo();
}
/** Parasol : mât de bois et sa noix de laiton, toile rayée tendue à festons. */
export function parasolGeo(col, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit();
  K.add(cyl(0.035, 0.04, 2.45, 8, 1), { l: 'wood', r: 0.6, c: PINE, ao: groundAO(0, 0.4, 0.6), t: { y: 1.22 } });
  K.add(cyl(0.05, 0.05, 0.1, 10), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { y: 1.4 } });
  const can = SC.parasolCanopyGeometry(1.4, 0.6, 12, { lite });
  K.add(can, { l: 'stripe', r: 0.85, c: hex(col), uv: [3, 1.4], vc: true, dbl: true, t: { y: 2.45 } });
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; K.add(sweep(new THREE.LineCurve3(v3(0, 2.66, 0), v3(Math.sin(a) * 1.35, 2.18, Math.cos(a) * 1.35)), 2, () => 0.012, 4, 2), { l: 'wood', r: 0.6, c: PINE }); }
  return K.geo();
}
/** Sandwich : deux tranches de pain de mie (croûte), salade frisée, tomate. */
export function sandwichGeo(opts = {}) {
  const K = new SC.AKit();
  const bread = (y) => K.add(RB(0.3, 0.05, 0.3, 0.02, 2), { l: 'weave', r: 0.95, c: (x, yy, z, nx, ny) => (Math.abs(ny) > 0.7 ? hex(0xf2dca8) : hex(0xc88a48)), uv: 'box', us: 3, t: { y } });
  bread(0.03); bread(0.15);
  const lettuce = new THREE.CylinderGeometry(0.19, 0.19, 0.012, 20, 1); const lp = lettuce.attributes.position; for (let i = 0; i < lp.count; i++) { const a = Math.atan2(lp.getZ(i), lp.getX(i)); lp.setY(i, lp.getY(i) + Math.sin(a * 9) * 0.01); }
  lettuce.computeVertexNormals();
  K.add(lettuce, { l: 'weave', r: 0.6, c: hex(0x7ac040), t: { y: 0.07 } });
  for (const [x, z] of [[-0.06, -0.05], [0.07, 0.06]]) K.add(cyl(0.07, 0.07, 0.02, 12), { l: 'plain', r: 0.3, c: hex(0xe04a3a), t: { x, y: 0.095, z } });
  return K.geo();
}

// =============================================================================
// Lanterne magique, longue-vue, quai de gare, cabane perchée, barque, statue, tronc creux, champignons
// =============================================================================
const LAMP = hex(0x26382e);
/** Le pied de fonte et la cage de la lanterne (le verre est à part : il s'allume). */
export function lanternPostGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit();
  const post = SC.latheProfile([[0.26, 0], [0.26, 0.06], [0.2, 0.1], [0.19, 0.18], [0.13, 0.26], [0.1, 0.4], [0.08, 1.4], [0.075, 1.9], [0.1, 1.98], [0.08, 2.05], [0.12, 2.12], [0.2, 2.2], [0.24, 2.24]], lite ? 8 : 14, 2, 2);
  // cannelures du fût
  const pp = post.attributes.position;
  for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); if (y > 0.45 && y < 1.85) { const a = Math.atan2(pp.getZ(i), pp.getX(i)), k = 1 + 0.08 * Math.cos(a * 8); pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); } }
  post.computeVertexNormals();
  K.add(post, { l: 'metal', r: 0.45, m: 0.4, c: LAMP, ao: groundAO(0, 0.4, 0.6) });
  K.add(RB(0.5, 0.05, 0.5, 0.02), { l: 'metal', r: 0.45, m: 0.4, c: LAMP, uv: 'box', t: { y: 2.24 } });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(RB(0.04, 0.6, 0.04, 0.012), { l: 'metal', r: 0.45, m: 0.4, c: LAMP, uv: 'box', t: { x: sx * 0.22, y: 2.54, z: sz * 0.22 } });
  const cap = SC.latheProfile([[0.4, 2.8], [0.38, 2.85], [0.22, 2.98], [0.08, 3.08], [0.05, 3.12]], 4, 2, 2); cap.rotateY(Math.PI / 4);
  K.add(cap, { l: 'metal', r: 0.45, m: 0.4, c: LAMP, dbl: true });
  K.add(RB(0.48, 0.05, 0.48, 0.02), { l: 'metal', r: 0.45, m: 0.4, c: LAMP, uv: 'box', t: { y: 2.82 } });
  K.add(SC.latheProfile([[0.0001, 3.08], [0.07, 3.12], [0.08, 3.18], [0.05, 3.24], [0.0001, 3.27]], 10, 1, 2), { l: 'brass', r: 0.25, m: 0.9, c: GOLD });
  return K.geo();
}
/** Longue-vue de laiton sur pied de fonte. */
export function telescopeGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.22, 0], [0.22, 0.05], [0.12, 0.12], [0.07, 0.3], [0.06, 1.15], [0.09, 1.2], [0.08, 1.28]], 12, 1, 2), { l: 'metal', r: 0.45, m: 0.4, c: LAMP, ao: groundAO(0, 0.3, 0.6) });
  const tube = SC.latheProfile([[0.09, -0.55], [0.1, -0.5], [0.1, -0.1], [0.12, -0.05], [0.12, 0.3], [0.15, 0.36], [0.16, 0.55], [0.13, 0.57]], 14, 1, 2);
  K.add(tube, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { y: 1.38, z: 0.2, rx: Math.PI / 2 - 0.25 } });
  return K.geo();
}
/** Quai de gare : soubassement de pierre, plancher, bordure blanche, colonnes de fonte, marquise de zinc à lambrequin. */
export function stationGeo(name, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit();
  K.add(RB(3.2, 0.3, 3.2, 0.04), { l: 'stone', r: 0.85, c: [0.82, 0.78, 0.7], uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { y: 0.15 } });
  K.add(RB(3.0, 0.06, 3.0, 0.01), { l: 'planks', r: 0.8, c: hex(0xb89068), uv: 'box', us: 1.1, t: { y: 0.33 } });
  K.add(RB(3.26, 0.07, 0.3, 0.02), { l: 'stone', r: 0.8, c: [0.94, 0.92, 0.86], uv: 'box', t: { y: 0.34, z: 1.48 } });
  K.add(RB(3.26, 0.008, 0.08, 0.002), { l: 'pwood', r: 0.6, c: hex(0xf0c040), uv: 'box', t: { y: 0.378, z: 1.4 } });
  const col = SC.latheProfile([[0.14, 0], [0.14, 0.1], [0.09, 0.18], [0.07, 0.3], [0.06, 2.3], [0.09, 2.4], [0.08, 2.5], [0.14, 2.6]], lite ? 8 : 12, 1, 2);
  for (const sx of [-1, 1]) {
    K.add(col, { l: 'metal', r: 0.45, m: 0.35, c: hex(0x2c5a44), t: { x: sx * 1.3, y: 0.36, z: -1.2 } });
    const br = new THREE.CatmullRomCurve3([v3(0, 2.0, 0), v3(0, 2.6, 0.45), v3(0, 2.8, 1.2)]);
    K.add(sweep(br, 10, () => 0.03, 5, 2), { l: 'metal', r: 0.45, m: 0.35, c: hex(0x2c5a44), t: { x: sx * 1.3, y: 0.36, z: -1.2 } });
  }
  // marquise : zinc en pente vers l'avant, lambrequin de bois découpé
  K.add(RB(3.5, 0.08, 2.7, 0.02), { l: 'zinc', r: 0.4, m: 0.6, c: [0.82, 0.86, 0.86], uv: 'box', us: 0.9, t: { y: 3.0, z: -0.2, rx: -0.14 } });
  const pos = [], uv = [], idx = [], N = lite ? 28 : 56;
  for (let i = 0; i <= N; i++) { const u = i / N, x = -1.75 + u * 3.5, sc = Math.abs(Math.sin(u * 9 * Math.PI)), d = 0.18 + 0.12 * Math.sqrt(sc); pos.push(x, 0, 0, x, -d, 0); uv.push(u * 3.5 / 0.6, 0, u * 3.5 / 0.6, d / 0.6); }
  for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  const fest = new THREE.BufferGeometry(); fest.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fest.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fest.setIndex(idx); fest.computeVertexNormals();
  K.add(fest, { l: 'pwood', r: 0.55, c: hex(0xc84a3a), dbl: true, t: { y: 2.86, z: 1.12 } });
  K.add(RB(3.5, 0.14, 0.06, 0.02), { l: 'pwood', r: 0.55, c: hex(0xf0c040), uv: 'box', uvT: true, t: { y: 2.9, z: 1.1 } });
  // un banc sur le quai
  K.add(benchGeo({ lite }), { keepAtl: true, t: { y: 0.36, z: -0.75 } });
  void name;
  return K.geo();
}
/** Cabane perchée : plancher rond en lames, garde-corps en rondins, cabane en planches peintes, toit de tuiles. */
export function treehouseGeo(deckR, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 18 : 32;
  const top = new THREE.CircleGeometry(deckR, seg); top.rotateX(-Math.PI / 2);
  { const u = top.attributes.uv, p = top.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2); }
  K.add(top, { l: 'planks', r: 0.8, c: PINE, t: { y: 0.005 } });
  K.add(SC.latheProfile([[deckR, 0.0], [deckR + 0.03, -0.05], [deckR + 0.03, -0.4], [deckR - 0.1, -0.45], [0.0001, -0.45]], seg, Math.round(deckR * TAU / 1.2), 2), { l: 'wood', r: 0.75, c: TIMBER, ao: () => 0.8 });
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; if (Math.abs(a - 3.6) < 0.35) continue; K.add(cyl(0.05, 0.055, 0.9, 6, 1), { l: 'wood', r: 0.75, c: TIMBER, t: { x: Math.cos(a) * (deckR - 0.1), y: 0.45, z: Math.sin(a) * (deckR - 0.1) } }); }
  const rail = new THREE.TorusGeometry(deckR - 0.1, 0.06, 6, seg); const ru = rail.attributes.uv; for (let i = 0; i < ru.count; i++) ru.setXY(i, ru.getY(i), ru.getX(i) * deckR * TAU / 1.2);
  K.add(rail, { l: 'wood', r: 0.7, c: TIMBER, t: { y: 0.9, rx: Math.PI / 2 } });
  // la cabane (porte vers le sud-ouest)
  const hx = -1.5, hz = -1.4;
  K.add(RB(2.0, 1.8, 1.8, 0.03), { l: 'pwood', r: 0.6, c: hex(0x6aa8d0), uv: 'box', us: 1.1, ao: (x, y) => 0.75 + 0.25 * sstep(0, 0.6, y), t: { x: hx, y: 0.9, z: hz } });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(RB(0.1, 1.82, 0.1, 0.02), { l: 'pwood', r: 0.6, c: CREAM, uv: 'box', t: { x: hx + sx * 0.97, y: 0.91, z: hz + sz * 0.87 } });
  K.add(RB(0.72, 1.22, 0.05, 0.02), { l: 'planks', r: 0.8, c: hex(0x8a5a38), uv: 'box', us: 1.6, t: { x: hx, y: 0.61, z: hz + 0.92 } });
  K.add(new THREE.TorusGeometry(0.12, 0.025, 6, 14), { l: 'pwood', r: 0.6, c: CREAM, t: { x: hx, y: 0.95, z: hz + 0.955 } });
  K.add(new THREE.CircleGeometry(0.11, 14), { l: 'plain', r: 0.1, c: [0.3, 0.42, 0.52], t: { x: hx, y: 0.95, z: hz + 0.952 } });
  K.add(RB(0.55, 0.55, 0.05, 0.02), { l: 'pwood', r: 0.6, c: CREAM, uv: 'box', t: { x: hx + 0.6, y: 1.2, z: hz + 0.92 } });
  K.add(RB(0.42, 0.42, 0.04, 0.01), { l: 'plain', r: 0.1, c: [1.0, 0.95, 0.75], uv: 'box', t: { x: hx + 0.6, y: 1.2, z: hz + 0.935 } });
  const roof = SC.latheProfile([[1.75, 1.82], [1.68, 1.88], [0.8, 2.55], [0.0001, 3.1]], 4, 4, 1 / 1.1); roof.rotateY(Math.PI / 4);
  K.add(roof, { l: 'tiles', r: 0.75, c: hex(0xc85a3a), t: { x: hx, z: hz } });
  return K.geo();
}
/** Barque : coque à clins peinte (bleu dehors, bordé blanc), intérieur de bois, banc, rame. */
export function rowboatGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), rs = lite ? 12 : 18;
  const hw = keys([[0, 0.25], [0.15, 0.7], [0.5, 0.85], [0.85, 0.6], [1, 0.05]]), tp = keys([[0, 0.7], [0.5, 0.62], [1, 0.8]]), bt = keys([[0, 0.25], [0.5, 0.0], [1, 0.3]]);
  const ring = (t) => { const out = [], w = hw(t), a0 = tp(t), b0 = bt(t); for (let j = 0; j < rs; j++) { const a = j / rs * TAU, c = Math.cos(a), s = Math.sin(a); out.push(s > 0 ? [w * c, a0 - 0.42 * Math.max(0, 1 - Math.abs(c) / 0.82) ** 0.6 * Math.min(1, t * 6, (1 - t) * 6)] : [w * Math.sign(c) * Math.abs(c) ** 0.8, a0 + (b0 - a0) * Math.abs(s) ** 0.7]); } return out; };
  const hull = loft(lite ? 10 : 16, ring, (t) => -2.0 + t * 4.0, 1 / 1.2, 1 / 1.2);
  K.add(hull, { l: 'planks', r: 0.6, c: (x, y, z, nx, ny) => (ny > 0.35 && y < 0.6 ? hex(0xd8b890) : y > 0.5 ? hex(0xf8f4ea) : hex(0x5a9ae0)), ao: (x, y, z, nx, ny) => (ny > 0.35 && y < 0.6 ? 0.7 : 0.65 + 0.35 * sstep(0.0, 0.5, y)) });
  K.add(RB(1.4, 0.06, 0.3, 0.02), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', uvT: true, t: { y: 0.55, z: 0.3 } });
  K.add(cyl(0.035, 0.035, 2.2, 6), { l: 'wood', r: 0.7, c: PINE, t: { x: 0.55, y: 0.66, z: -0.2, rx: Math.PI / 2, rz: 0.3, order: 'ZXY' } });
  K.add(RB(0.14, 0.02, 0.5, 0.01), { l: 'pwood', r: 0.6, c: hex(0x3a78c0), uv: 'box', t: { x: 0.55 + Math.sin(0.3) * 1.2, y: 0.66, z: -0.2 - 1.2 * Math.cos(0.3) } });
  return K.geo();
}
/** Statue de chien assis sur un socle mouluré (pierre). */
export function statueGeo(opts = {}) {
  const K = new SC.AKit(), S = { l: 'stone', r: 0.9, c: [0.86, 0.84, 0.8] };
  K.add(RB(1.2, 0.62, 1.6, 0.05), { ...S, uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { y: 0.31 } });
  K.add(RB(1.32, 0.1, 1.72, 0.04), { ...S, uv: 'box', t: { y: 0.66 } });
  K.add(RB(1.36, 0.1, 1.76, 0.04), { ...S, uv: 'box', t: { y: 0.05 } });
  K.add(SC.lumpySphere(1, 2, 0.03, 3, 2, 1).scale(0.35, 0.36, 0.55), { ...S, uv: 2, t: { y: 1.12, rx: -0.3 } });
  K.add(SC.lumpySphere(1, 2, 0.03, 3, 4, 1).scale(0.28, 0.26, 0.3), { ...S, uv: 2, t: { y: 1.6, z: 0.42 } });
  K.add(SC.lumpySphere(1, 1, 0.02, 3, 6, 1).scale(0.13, 0.11, 0.16), { ...S, uv: 2, t: { y: 1.52, z: 0.68 } });
  for (const sx of [-1, 1]) {
    K.add(ell(0.07, 0.19, 0.11, 10, 8), { ...S, uv: 2, t: { x: sx * 0.22, y: 1.75, z: 0.38, rz: sx * 0.35 } });
    K.add(cyl(0.075, 0.065, 0.42, 10), { ...S, uv: 2, t: { x: sx * 0.16, y: 0.92, z: 0.38 } });
    K.add(ell(0.09, 0.05, 0.12, 8, 6), { ...S, uv: 2, t: { x: sx * 0.16, y: 0.74, z: 0.45 } });
    K.add(ell(0.13, 0.17, 0.24, 10, 8), { ...S, uv: 2, t: { x: sx * 0.22, y: 0.88, z: -0.25 } });
  }
  K.add(sweep(new THREE.CatmullRomCurve3([v3(0, 0.9, -0.55), v3(0, 1.05, -0.78), v3(0, 1.3, -0.82)]), 8, (t) => 0.06 - t * 0.025, 8, 2), { ...S });
  return K.geo();
}
/** Tronc creux couché (écorce, cœur sombre, mousse). */
export function logGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), seg = lite ? 12 : 18;
  const outer = cyl(0.7, 0.75, 4, seg, 3, true); const op = outer.attributes.position;
  for (let i = 0; i < op.count; i++) { const a = Math.atan2(op.getZ(i), op.getX(i)), k = 1 + 0.05 * Math.sin(a * 5 + op.getY(i)) + 0.03 * Math.sin(a * 11); op.setX(i, op.getX(i) * k); op.setZ(i, op.getZ(i) * k); }
  outer.computeVertexNormals();
  K.add(outer, { l: 'bark', r: 0.9, c: hex(0x9a7a5a), ao: (x, y) => 0.6 + 0.4 * sstep(0, 0.8, y), t: { y: 0.65, rz: Math.PI / 2 } });
  const inner = cyl(0.55, 0.55, 4.02, seg, 3, true); flipWinding(inner); const nn = inner.attributes.normal.array; for (let i = 0; i < nn.length; i++) nn[i] = -nn[i];
  K.add(inner, { l: 'wood', r: 0.9, c: hex(0x6a4a30), ao: () => 0.45, t: { y: 0.65, rz: Math.PI / 2 } });
  const rim = new THREE.RingGeometry(0.55, 0.72, seg);
  for (const sx of [-1, 1]) K.add(rim, { l: 'wood', r: 0.85, c: hex(0xc8a070), t: { x: sx * 2.0, y: 0.65, ry: sx * Math.PI / 2 }, dbl: true });
  for (let i = 0; i < 5; i++) K.add(SC.lumpySphere(0.22, 1, 0.25, 4, i, 0.4), { l: 'moss', r: 1, c: hex(0x9ad070), uv: 3, t: { x: -1.6 + i * 0.8, y: 1.28, z: (i % 2) * 0.25 - 0.1 } });
  return K.geo();
}
/** Champignon des bois : pied fibreux, chapeau rouge à verrues blanches en relief. */
export function mushroomGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.1, 0], [0.085, 0.08], [0.075, 0.24], [0.09, 0.3]], 10, 1, 3), { l: 'weave', r: 0.9, c: hex(0xf2ead8), ao: groundAO(0, 0.15, 0.6) });
  K.add(SC.latheProfile([[0.08, 0.27], [0.2, 0.28], [0.235, 0.31], [0.22, 0.36], [0.16, 0.42], [0.08, 0.45], [0.0001, 0.46]], 16, 2, 3), { l: 'plain', r: 0.45, c: (x, y) => (y < 0.29 ? hex(0xe8d8c0) : hex(0xd8382e)) });
  for (let k = 0; k < 7; k++) { const a = k * 2.4, d = k ? 0.1 + (k % 2) * 0.05 : 0, y = 0.46 - d * d * 2.5; K.add(ell(0.025, 0.012, 0.025, 6, 4), { l: 'plain', r: 0.6, c: [0.97, 0.95, 0.9], t: { x: Math.cos(a) * d, y, z: Math.sin(a) * d } }); }
  return K.geo();
}

// =============================================================================
// Le terrain d'agility de Gaston
// =============================================================================
const WHITE_P = hex(0xf4f0e6);
/** Barre rayée (axe y, longueur L) : bandes peintes rouge / blanc autour. */
function stripedPole(r, L, col, seg = 10, band = 0.2) { const g = cyl(r, r, L, seg, 1); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i), u.getY(i) / (band * 8)); return { g, o: { l: 'stripe', r: 0.5, c: col, uvT: true } }; }
export function hurdleGeo(half, opts = {}) {
  const K = new SC.AKit();
  for (const s of [-1, 1]) {
    K.add(RB(0.12, 1.2, 0.12, 0.025), { l: 'pwood', r: 0.55, c: WHITE_P, uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { z: s * (half + 0.15), y: 0.6 } });
    K.add(RB(0.55, 0.08, 0.14, 0.03), { l: 'pwood', r: 0.55, c: hex(0x3a78c8), uv: 'box', t: { z: s * (half + 0.15), y: 0.04 } });
    K.add(RB(0.06, 0.05, 0.14, 0.015), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x8a8a90), uv: 'box', t: { x: 0.08, y: 0.58, z: s * (half + 0.12) } });
  }
  const P = stripedPole(0.05, half * 2 + 0.2, hex(0xd83a3a));
  K.add(P.g, { ...P.o, t: { y: 0.62, rx: Math.PI / 2 } });
  return K.geo();
}
/** Tunnel de toile côtelée (demi-cylindre), anneaux alternés bleu / jaune. */
export function tunnelGeo(len, r, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), nRib = Math.round(len / 0.25);
  const g = new THREE.CylinderGeometry(r, r, len, lite ? 10 : 24, nRib * (lite ? 2 : 4), true, Math.PI / 2, Math.PI); g.rotateZ(Math.PI / 2);
  const p = g.attributes.position, u = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), k = 1 + 0.035 * Math.cos((x + len / 2) / 0.25 * TAU); p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); u.setXY(i, u.getX(i) * r * Math.PI / 0.8, x / 0.8); }
  g.computeVertexNormals();
  K.add(g, { l: 'weave', r: 0.85, c: (x) => (Math.floor((x + len) * 0.7) % 2 ? hex(0x3a9ad8) : hex(0xf0c040)), dbl: true, t: { y: 0.05 } });
  for (const sx of [-1, 1]) { const ring = new THREE.TorusGeometry(r, 0.05, 6, lite ? 14 : 24, Math.PI); ring.rotateY(Math.PI / 2); K.add(ring, { l: 'metal', r: 0.5, m: 0.3, c: hex(0x3a3a40), t: { x: sx * len / 2, y: 0.05 } }); }
  return K.geo();
}
export function weavePoleGeo(opts = {}) {
  const K = new SC.AKit(), P = stripedPole(0.04, 1.25, hex(0xd83a3a), 8, 0.12);
  K.add(P.g, { ...P.o, t: { y: 0.64 } });
  K.add(SC.latheProfile([[0.15, 0], [0.15, 0.03], [0.1, 0.06], [0.05, 0.08]], 12, 1, 2), { l: 'plain', r: 0.85, c: hex(0x2a2a2e), ao: groundAO(0, 0.1, 0.6) });
  return K.geo();
}
export function seesawBaseGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(RB(0.4, 0.42, 1.0, 0.04), { l: 'pwood', r: 0.55, c: hex(0x3a78c8), uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { y: 0.21 } });
  K.add(cyl(0.05, 0.05, 1.04, 10), { l: 'metal', r: 0.4, m: 0.6, c: hex(0x8a8a90), t: { y: 0.42, rx: Math.PI / 2 } });
  return K.geo();
}
export function seesawPlankGeo(len, opts = {}) {
  const K = new SC.AKit();
  K.add(RB(len, 0.12, 1.0, 0.03), { l: 'pwood', r: 0.6, c: (x) => (Math.abs(x) > len / 2 - 0.9 ? hex(0xf0c040) : hex(0x4aa04a)), uv: 'box', uvT: true, us: 1.1 });
  for (let i = -3; i <= 3; i++) K.add(RB(0.05, 0.035, 0.9, 0.012), { l: 'wood', r: 0.7, c: WHITE_P, uv: 'box', t: { x: i * len / 8, y: 0.07 } });
  return K.geo();
}
/** Pneu suspendu : vrai pneu (sculpture de la bande), portique de bois peint, cordes. */
export function tireGeo(cy, opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit();
  for (const s of [-1, 1]) K.add(RB(0.16, 2.2, 0.16, 0.03), { l: 'pwood', r: 0.55, c: WHITE_P, uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { z: s * 1.25, y: 1.1 } });
  K.add(RB(0.14, 0.14, 2.7, 0.03), { l: 'pwood', r: 0.55, c: WHITE_P, uv: 'box', uvT: true, t: { y: 2.2 } });
  const tyre = new THREE.TorusGeometry(0.62, 0.17, lite ? 10 : 14, lite ? 26 : 40);
  const tp = tyre.attributes.position, tu = tyre.attributes.uv;
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), a = Math.atan2(y, x), rr = Math.hypot(x, y), d = rr - 0.62; const out = d > 0.08 ? 1 : 0; const k = 1 + out * 0.025 * (Math.sin(a * 40) > 0 ? 1 : -1); tp.setXYZ(i, x * k, y * k, z); tu.setXY(i, tu.getX(i) * 6, tu.getY(i)); }
  tyre.computeVertexNormals();
  K.add(tyre, { l: 'plain', r: 0.9, c: hex(0x2a2a2c), t: { y: cy, ry: Math.PI / 2 } });
  for (const s of [-1, 1]) K.add(cyl(0.018, 0.018, 2.2 - cy - 0.6, 5, 1), { l: 'rope', r: 0.9, c: hex(0xe8d8b0), uv: [1, 4], t: { z: s * 0.6, y: (2.2 + cy + 0.6) / 2 } });
  return K.geo();
}
export function tableGeo(w, h, opts = {}) {
  const K = new SC.AKit();
  K.add(RB(w, 0.14, w, 0.04), { l: 'pwood', r: 0.55, c: hex(0xe06a2a), uv: 'box', us: 1.1, t: { y: h - 0.07 } });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.add(RB(0.14, h, 0.14, 0.03), { l: 'pwood', r: 0.55, c: WHITE_P, uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { x: sx * (w / 2 - 0.15), y: h / 2, z: sz * (w / 2 - 0.15) } });
  return K.geo();
}
/** Arche d'arrivée : poteaux rayés bleu et blanc, bandeau en damier. */
export function archGeo(half, label, opts = {}) {
  const K = new SC.AKit();
  for (const s of [-1, 1]) { const P = stripedPole(0.13, 3.2, hex(0x3a78c8), 12, 0.25); K.add(P.g, { ...P.o, ao: groundAO(0, 0.3, 0.6), t: { z: s * half, y: 1.6 } }); K.add(ell(0.16, 0.16, 0.16, 10, 8), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, t: { z: s * half, y: 3.25 } }); }
  K.add(RB(0.14, 0.7, half * 2 + 0.3, 0.04), { l: 'gingham', r: 0.7, c: hex(0x202024), uv: 'box', us: 0.6, t: { y: 3.0 } });
  void label;
  return K.geo();
}
/** Podium des champions : marches de bois peint, chiffres de laiton. */
export function podiumGeo(w, h, opts = {}) {
  const K = new SC.AKit();
  const step = (hh, z, col) => { K.add(RB(w * (z ? 0.9 : 1), hh - 0.08, w, 0.04), { l: 'pwood', r: 0.55, c: col, uv: 'box', ao: groundAO(0.3, 0.4, 0.6), t: { y: (hh - 0.08) / 2, z } }); K.add(RB(w * (z ? 0.9 : 1) + 0.04, 0.1, w + 0.04, 0.04), { l: 'pwood', r: 0.55, c: WHITE_P, uv: 'box', t: { y: hh - 0.05, z } }); };
  step(h, 0, hex(0x3a78c8)); step(h * 0.6, w * 0.95, hex(0xd85a3a)); step(h * 0.35, -w * 0.95, hex(0x4aa04a));
  K.add(RB(0.04, 0.5, 0.14, 0.01), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, uv: 'box', t: { x: w / 2 + 0.02, y: h / 2 } });
  for (const [z, hh, n] of [[w * 0.95, h * 0.3, 2], [-w * 0.95, h * 0.175, 3]]) for (let i = 0; i < n; i++) K.add(RB(0.04, 0.06, 0.3, 0.01), { l: 'brass', r: 0.3, m: 0.85, c: GOLD, uv: 'box', t: { x: w * 0.45 + 0.02, y: hh - 0.15 + i * 0.13, z } });
  return K.geo();
}
/** Clôture basse : piquets blancs à tête arrondie, deux lisses (bleue en haut). */
export function lowFenceGeo(len, opts = {}) {
  const K = new SC.AKit(), n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= n; i++) { const x = -len / 2 + i * len / n; K.add(RB(0.1, 0.8, 0.1, 0.02), { l: 'pwood', r: 0.6, c: WHITE_P, uv: 'box', ao: groundAO(0, 0.25, 0.6), t: { x, y: 0.4 } }); K.add(ell(0.065, 0.05, 0.065, 8, 5), { l: 'pwood', r: 0.6, c: WHITE_P, t: { x, y: 0.82 } }); }
  for (const h of [0.35, 0.68]) K.add(RB(len, 0.09, 0.05, 0.02), { l: 'pwood', r: 0.6, c: h > 0.5 ? hex(0x3a78c8) : WHITE_P, uv: 'box', uvT: true, t: { y: h, z: 0.06 } });
  return K.geo();
}

// =============================================================================
// Petits ouvrages en bois : belvédère, ponton, marches autour du tronc, traverses ; arche fleurie
// =============================================================================
/** Estrade du belvédère (w × d, dessus en y = 0) : plancher de lames, garde-corps en bois. */
export function deckGeo(D, opts = {}) {
  const K = new SC.AKit();
  K.add(RB(D.w, 0.5, D.d, 0.03), { l: 'planks', r: 0.8, c: hex(0xc89a6a), uv: 'box', us: 1.0, ao: (x, y) => 0.7 + 0.3 * sstep(-0.5, 0, y), t: { y: -0.25 } });
  for (const sx of [-1, 1]) K.add(RB(0.1, 0.1, D.d, 0.025), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', t: { x: sx * D.w / 2, y: 0.88 } });
  K.add(RB(D.w + 0.1, 0.1, 0.1, 0.025), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', uvT: true, t: { y: 0.88, z: -D.d / 2 } });
  for (let i = 0; i <= 8; i++) K.add(RB(0.08, 0.9, 0.08, 0.02), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', t: { x: -D.w / 2 + i * D.w / 8, y: 0.45, z: -D.d / 2 } });
  for (const sx of [-1, 1]) for (let i = 1; i <= 4; i++) K.add(RB(0.08, 0.9, 0.08, 0.02), { l: 'wood', r: 0.7, c: TIMBER, uv: 'box', t: { x: sx * D.w / 2, y: 0.45, z: -D.d / 2 + i * D.d / 5 } });
  return K.geo();
}
/** Ponton (lames sur pieux ronds), en coordonnées du parc le long de x, centré en z = 0. */
export function jettyGeo(J, opts = {}) {
  const K = new SC.AKit(), len = J.x0 - J.x1, n = Math.round(len / 0.5), r = rng(5);
  for (let i = 0; i < n; i++) K.add(RB(0.46, 0.1, J.w, 0.02), { l: 'wood', r: 0.75, c: hex(0xb08a60, 0.9 + r() * 0.2), uv: 'box', us: 1.1, uo: [r() * 3, r() * 3], t: { x: J.x1 + 0.25 + i * 0.5, y: J.top - 0.05, ry: (r() - 0.5) * 0.03 } });
  for (const sz of [-1, 1]) K.add(RB(len, 0.12, 0.12, 0.03), { l: 'wood', r: 0.75, c: hex(0x8a6a48), uv: 'box', uvT: true, t: { x: (J.x0 + J.x1) / 2, y: J.top - 0.16, z: sz * (J.w / 2 - 0.1) } });
  for (const sz of [-1, 1]) for (const x of [J.x1 + 0.3, (J.x0 + J.x1) / 2, J.x0 - 0.3]) K.add(cyl(0.11, 0.12, 3, 8, 1), { l: 'bark', r: 0.85, c: hex(0x9a7a5a), ao: (xx, y) => (y < 0.05 ? 0.55 : 0.9), t: { x, y: J.top - 1.4, z: sz * (J.w / 2 - 0.1) } });
  return K.geo();
}
/** Marches en rondelles de bois autour du tronc de la cabane, sur leurs consoles. */
export function treeStepsGeo(steps, T, g, opts = {}) {
  const K = new SC.AKit(), lite = !!opts.lite;
  for (const s of steps) {
    const disc = cyl(s.r, s.r * 0.92, 0.35, lite ? 10 : 16, 1.5);
    K.add(disc, { l: 'wood', r: 0.75, c: (x, y, z, nx, ny) => (ny > 0.8 ? hex(0xd8b080) : hex(0x9a7050)), uv: [1, 1], ao: (x, y) => 0.75 + 0.25 * sstep(s.top - g - 0.35, s.top - g, y), t: { x: s.x - T.x, y: s.top - 0.18 - g, z: s.z - T.z } });
    K.add(cyl(0.15, 0.22, 2.0, 8, 1), { l: 'bark', r: 0.85, c: hex(0x8a6a50), t: { x: (s.x - T.x) * 0.62, y: s.top - 0.6 - g, z: (s.z - T.z) * 0.62, ry: -s.a, rz: Math.PI / 2 + 0.4 } });
  }
  return K.geo();
}
/** Tronc de l'arbre de la cabane (écorce). */
export function trunkGeo(r0, r1, h, opts = {}) {
  const K = new SC.AKit(), g = cyl(r0, r1, h, opts.lite ? 12 : 18, Math.round((r0 + r1) * Math.PI / 0.9)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.05 * Math.sin(a * 5 + p.getY(i) * 0.7) + 0.03 * Math.sin(a * 13); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  K.add(g, { l: 'bark', r: 0.9, c: hex(0x9a7a5c), uv: [1, 1 / 1.4], ao: (x, y) => 0.65 + 0.35 * sstep(-h / 2, -h / 2 + 1.2, y) });
  return K.geo();
}
/** Traverse de la voie (instanciée). */
export function sleeperGeo() {
  const K = new SC.AKit();
  K.add(RB(2.0, 0.14, 0.3, 0.03), { l: 'wood', r: 0.85, c: hex(0x8a6a4a), uv: 'box', uvT: true, t: { y: 0.07 } });
  return K.geo();
}
/** Arche fleurie à l'entrée du labyrinthe : fer forgé blanc, rosiers grimpants (fleurs et feuilles). */
export function flowerArchGeo(opts = {}) {
  const lite = !!opts.lite, K = new SC.AKit(), r = rng(31), W2 = hex(0xf2efe8);
  for (const sx of [-1, 1]) for (const dz of [-0.15, 0.15]) K.add(cyl(0.05, 0.05, 3, 6, 1), { l: 'metal', r: 0.45, m: 0.3, c: W2, ao: groundAO(0, 0.4, 0.6), t: { x: sx * 2, y: 1.5, z: dz } });
  for (const dz of [-0.15, 0.15]) { const a = new THREE.TorusGeometry(2, 0.05, 6, lite ? 16 : 28, Math.PI); K.add(a, { l: 'metal', r: 0.45, m: 0.3, c: W2, t: { y: 3, z: dz } }); }
  for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; K.add(cyl(0.025, 0.025, 0.3, 5), { l: 'metal', r: 0.45, m: 0.3, c: W2, t: { x: Math.cos(a) * 2, y: 3 + Math.sin(a) * 2, rx: Math.PI / 2 } }); }
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) K.add(cyl(0.025, 0.025, 0.3, 5), { l: 'metal', r: 0.45, m: 0.3, c: W2, t: { x: sx * 2, y: 0.5 + k * 0.7, rx: Math.PI / 2 } });
  // feuillage (mottes) et roses le long de l'arche et des montants
  const pts = [];
  for (let i = 0; i < (lite ? 16 : 28); i++) { const t = i / ((lite ? 16 : 28) - 1); const a = t * Math.PI; pts.push([Math.cos(a) * 2, 3 + Math.sin(a) * 2]); }
  for (const sx of [-1, 1]) for (let k = 0; k < (lite ? 4 : 7); k++) pts.push([sx * 2 + (r() - 0.5) * 0.1, 0.5 + k * 0.38 + r() * 0.2]);
  const leaf = SC.lumpySphere(0.2, lite ? 0 : 1, 0.3, 4, 3, 0.8);
  for (const [x, y] of pts) {
    K.add(leaf, { l: 'moss', r: 0.9, c: hex(0x6aa848, 0.85 + r() * 0.3), uv: 2, t: { x: x + (r() - 0.5) * 0.15, y: y + (r() - 0.5) * 0.15, z: (r() - 0.5) * 0.25, s: 0.9 + r() * 0.5 } });
    if (r() < 0.75) { const col = [0xff7aa8, 0xffe07a, 0xc89aff, 0xffffff][(r() * 4) | 0]; K.add(SC.lumpySphere(0.1, lite ? 0 : 1, 0.25, 9, r() * 9, 0.75), { l: 'weave', r: 0.7, c: hex(col), uv: 3, t: { x: x + (r() - 0.5) * 0.3, y: y + (r() - 0.5) * 0.3, z: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.08) } }); }
  }
  return K.geo();
}

// =============================================================================
// Objets de la couche de vie du parc (level1life.js : props { kind: { model: '…HD' } }) : mêmes
// encombrements que ceux du kit (lifekit.js), en vraie matière. Enregistrés dans SC.LIFE_PROPS.
// =============================================================================
const LP = () => SC.atlasMaterial(SC.touchLite());
/** Tuyau musical (teinté objet par objet) : tuyau d'orgue en métal peint, lèvre évasée, bouche, socle. */
function tubeHD(c) {
  const h = c.len || 1.6, K = new SC.AKit(), lite = SC.touchLite();
  K.add(SC.latheProfile([[0.34, 0], [0.34, 0.05], [0.28, 0.1], [0.24, 0.16], [0.17, 0.22], [0.15, 0.3], [0.15, h - 0.08], [0.19, h - 0.02], [0.2, h], [0.14, h + 0.01], [0.13, h - 0.2]], lite ? 10 : 16, 2, 2), { l: 'metal', r: 0.35, m: 0.35, c: [0.95, 0.95, 0.95], ao: (x, y) => 0.6 + 0.4 * sstep(0, 0.4, y) });
  // bouche (lumière) et lèvre
  K.add(RB(0.2, 0.09, 0.04, 0.015), { l: 'plain', r: 0.6, c: [0.08, 0.07, 0.07], uv: 'box', t: { y: 0.48, z: 0.145 } });
  K.add(RB(0.22, 0.03, 0.05, 0.01), { l: 'brass', r: 0.3, m: 0.85, c: [1.0, 0.85, 0.5], uv: 'box', t: { y: 0.42, z: 0.15 } });
  K.add(new THREE.TorusGeometry(0.16, 0.02, 5, 14), { l: 'brass', r: 0.3, m: 0.85, c: [1.0, 0.85, 0.5], t: { y: 0.3, rx: Math.PI / 2 } });
  return { geo: K.geo(), mat: LP(), h: h + 0.1, r: 0.3 };
}
/** Chariot de glaces : caisse de bois peint à rayures, roues à rayons, poignée, parasol à festons, cornets. */
function cartHD() {
  const K = new SC.AKit(), lite = SC.touchLite();
  K.add(RB(1.8, 0.9, 1.0, 0.05), { l: 'stripe', r: 0.6, c: hex(0xf07aa0), uv: 'box', us: 1.0, ao: (x, y) => 0.7 + 0.3 * sstep(0.4, 1.0, y), t: { y: 0.85 } });
  K.add(RB(1.92, 0.08, 1.12, 0.03), { l: 'wood', r: 0.6, c: hex(0xc89a66), uv: 'box', uvT: true, t: { y: 1.33 } });
  K.add(RB(1.84, 0.1, 1.04, 0.03), { l: 'pwood', r: 0.55, c: CREAM, uv: 'box', uvT: true, t: { y: 0.42 } });
  for (const sz of [-1, 1]) {
    const t = new THREE.TorusGeometry(0.36, 0.04, 6, 18); K.add(t, { l: 'pwood', r: 0.5, c: hex(0xd8403a), t: { x: 0.6, y: 0.38, z: sz * 0.53 } });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; K.add(RB(0.03, 0.34, 0.03, 0.01), { l: 'pwood', r: 0.5, c: CREAM, uv: 'box', t: { x: 0.6 + Math.cos(a) * 0.17, y: 0.38 + Math.sin(a) * 0.17, z: sz * 0.53, rz: a + Math.PI / 2 } }); }
    K.add(cyl(0.06, 0.06, 0.06, 10).rotateX(Math.PI / 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { x: 0.6, y: 0.38, z: sz * 0.56 } });
  }
  for (const sz of [-1, 1]) K.add(RB(0.08, 0.5, 0.08, 0.02), { l: 'wood', r: 0.6, c: hex(0x8a6040), uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { x: -0.7, y: 0.25, z: sz * 0.35 } });
  K.add(sweep(new THREE.CatmullRomCurve3([v3(-0.9, 1.1, 0.4), v3(-1.25, 1.35, 0.4), v3(-1.25, 1.35, -0.4), v3(-0.9, 1.1, -0.4)]), 12, () => 0.025, 6, 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS });
  K.add(cyl(0.035, 0.035, 1.65, 6), { l: 'wood', r: 0.6, c: PINE, t: { x: -0.3, y: 2.15 } });
  K.add(SC.parasolCanopyGeometry(1.3, 0.55, 12, { lite }), { l: 'stripe', r: 0.85, c: hex(0xff8ab0), uv: [3, 1.4], vc: true, dbl: true, t: { x: -0.3, y: 3.0 } });
  for (const [x, col] of [[0.2, 0xffd0e0], [0.45, 0xfff0c0], [0.7, 0xc0f0d0]]) {
    K.add(SC.latheProfile([[0.0001, -0.24], [0.1, 0.0]], 8, 2, 4), { l: 'wicker', r: 0.8, c: hex(0xe8b070), t: { x, y: 1.6, z: -0.25 } });
    K.add(SC.lumpySphere(0.11, 1, 0.12, 6, x * 9, 0.95), { l: 'plain', r: 0.6, c: hex(col), t: { x, y: 1.66, z: -0.25 } });
  }
  K.add(SC.latheProfile([[0.0001, 0.0], [0.09, 0.0], [0.08, 0.06], [0.0001, 0.1]], 10, 1, 2), { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: 0.7, y: 1.37, z: 0.3 } });
  return { geo: K.geo(), mat: LP(), h: 3.2, r: 0.9, shadow: !SC.touchLite() };
}
/** Machine à bulles : caisse de bois peint, pavillon de laiton, gros bouton rouge, anneau à bulles. */
function bubblerHD() {
  const K = new SC.AKit();
  K.add(RB(0.9, 0.7, 0.7, 0.05), { l: 'pwood', r: 0.55, c: hex(0x3a9ad0), uv: 'box', ao: groundAO(0, 0.3, 0.6), t: { y: 0.35 } });
  for (const y of [0.05, 0.66]) K.add(RB(0.94, 0.06, 0.74, 0.02), { l: 'wood', r: 0.6, c: hex(0x8a6040), uv: 'box', uvT: true, t: { y } });
  K.add(SC.latheProfile([[0.34, 0], [0.34, 0.06], [0.3, 0.1], [0.26, 0.12]], 16, 2, 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { y: 0.7 } });
  K.add(SC.lumpySphere(0.25, 2, 0.02, 3, 2, 0.45), { l: 'plain', r: 0.25, c: hex(0xe8403a), t: { y: 0.84 } });
  const horn = SC.latheProfile([[0.08, 0], [0.08, 0.15], [0.1, 0.25], [0.16, 0.33], [0.2, 0.36], [0.17, 0.36]], 14, 1, 2); horn.rotateZ(-0.8);
  K.add(horn, { l: 'brass', r: 0.25, m: 0.9, c: BRASS, t: { x: 0.25, y: 0.68, z: -0.2 } });
  K.add(new THREE.TorusGeometry(0.14, 0.02, 5, 16), { l: 'brass', r: 0.3, m: 0.85, c: hex(0xffe040), t: { x: 0.52, y: 1.0, z: -0.2, ry: Math.PI / 2 } });
  K.add(ell(0.06, 0.06, 0.03, 8, 6), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { x: -0.3, y: 0.5, z: 0.36 } });
  return { geo: K.geo(), mat: LP(), h: 1.0, r: 0.6 };
}
/** Arroseur : pied de laiton, bras tournant à buses, tuyau d'arrosage vert qui serpente. */
function sprinklerHD() {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.28, 0], [0.28, 0.03], [0.2, 0.08], [0.08, 0.12], [0.05, 0.4]], 14, 1, 2), { l: 'metal', r: 0.4, m: 0.3, c: hex(0x3a7a3a), ao: groundAO(0, 0.1, 0.6) });
  K.add(RB(0.72, 0.05, 0.06, 0.02), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, uv: 'box', t: { y: 0.47 } });
  for (const sx of [-1, 1]) K.add(SC.latheProfile([[0.045, 0], [0.04, 0.07], [0.025, 0.1]], 8, 1, 2), { l: 'brass', r: 0.3, m: 0.85, c: BRASS, t: { x: sx * 0.35, y: 0.48, rz: -sx * 0.5 } });
  K.add(sweep(new THREE.CatmullRomCurve3([v3(0.2, 0.05, 0), v3(0.7, 0.04, 0.3), v3(1.3, 0.04, -0.1), v3(1.9, 0.04, 0.35), v3(2.5, 0.04, 0.0)]), 20, () => 0.035, 6, 3), { l: 'plain', r: 0.45, c: hex(0x2a8a3a) });
  return { geo: K.geo(), mat: LP(), h: 0.5, r: 0.4 };
}
/** Trampoline de jardin : cadre d'acier, coussin de protection en toile bleue, toile tressée sombre, pieds. */
function trampolineHD() {
  const K = new SC.AKit(), lite = SC.touchLite();
  K.add(new THREE.CircleGeometry(1.22, lite ? 20 : 32).rotateX(-Math.PI / 2), { l: 'weave', r: 0.85, c: hex(0x2a2a30), uv: [4, 4], t: { y: 0.62 } });
  const pad = new THREE.TorusGeometry(1.32, 0.13, 6, lite ? 24 : 40); pad.scale(1, 1, 0.55);
  K.add(pad, { l: 'weave', r: 0.85, c: hex(0x2a8ae0), uv: [8, 1], t: { y: 0.64, rx: Math.PI / 2 } });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; K.add(sweep(new THREE.CatmullRomCurve3([v3(Math.cos(a) * 1.32, 0.6, Math.sin(a) * 1.32), v3(Math.cos(a) * 1.36, 0.3, Math.sin(a) * 1.36), v3(Math.cos(a) * 1.3, 0.0, Math.sin(a) * 1.3)]), 6, () => 0.03, 6, 2), { l: 'metal', r: 0.4, m: 0.5, c: hex(0x9a9aa0), ao: groundAO(0, 0.2, 0.6) }); }
  return { geo: K.geo(), mat: LP(), h: 0.7, r: 1.3 };
}
/** Bain d'oiseaux : balustre de pierre tourné, vasque, un peu d'eau. */
function birdbathHD() {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.5, 0], [0.5, 0.08], [0.42, 0.14], [0.3, 0.2], [0.2, 0.32], [0.17, 0.5], [0.24, 0.66], [0.18, 0.84], [0.25, 0.92], [0.5, 1.02], [0.72, 1.12], [0.74, 1.18], [0.68, 1.2], [0.5, 1.12], [0.2, 1.06]], 18, 4, 1.5), { l: 'stone', r: 0.85, c: (x, y, z) => (y > 1.0 && Math.hypot(x, z) < 0.7 ? [0.66, 0.72, 0.66] : [0.88, 0.85, 0.78]), ao: groundAO(0, 0.4, 0.6) });
  K.add(new THREE.CircleGeometry(0.66, 18).rotateX(-Math.PI / 2), { l: 'plain', r: 0.06, m: 0.1, c: hex(0x6a90a0), t: { y: 1.15 } });
  return { geo: K.geo(), mat: LP(), h: 1.2, r: 0.7, shadow: !SC.touchLite() };
}
/** Champignon géant (trampoline des bois) : pied fibreux, chapeau charnu à verrues (sculpt.js). */
function mushroomHD(c) {
  const K = new SC.AKit(), lite = SC.touchLite();
  K.add(SC.latheProfile([[0.48, 0], [0.42, 0.1], [0.36, 0.3], [0.34, 0.6], [0.38, 0.84]], lite ? 10 : 16, 2, 2), { l: 'weave', r: 0.9, c: hex(0xf2e8d4), ao: groundAO(0, 0.4, 0.6) });
  const cap = SC.mushroomCapGeometry(1.25, c.cap || 0xd8402e, { lite, seed: 5 });
  K.add(cap, { l: 'plain', r: 0.5, vc: true, t: { y: 0.82, sy: 0.92 } });
  return { geo: K.geo(), mat: LP(), h: 1.5, r: 1.25 };
}
Object.assign(SC.LIFE_PROPS, { tubeHD, cartHD, bubblerHD, sprinklerHD, trampolineHD, birdbathHD, mushroomHD });

/** Niche de Mamie (repère de la niche, porte vers +z) : gamelle émaillée, encadrement de porte, plaque. */
export function kennelDecoGeo(opts = {}) {
  const K = new SC.AKit();
  K.add(SC.latheProfile([[0.0001, 0.0], [0.24, 0.0], [0.27, 0.03], [0.35, 0.17], [0.37, 0.2], [0.34, 0.205], [0.3, 0.17], [0.24, 0.06], [0.0001, 0.06]], 20, 3, 3), { l: 'metal', r: 0.3, m: 0.1, c: (x, y) => (y > 0.18 ? hex(0x2a3a5a) : hex(0x3a78c8)), ao: groundAO(0, 0.1, 0.65), t: { x: 1.0, z: 1.7 } });
  K.add(SC.lumpySphere(0.2, 1, 0.3, 8, 3, 0.35), { l: 'plain', r: 0.8, c: hex(0x8a5a30), t: { x: 1.0, y: 0.08, z: 1.7 } });
  // encadrement cintré autour de l'ouverture (rayon 0,55 au-dessus de 0,65)
  const arc = new THREE.CatmullRomCurve3([...Array(13)].map((_, i) => { const a = Math.PI * i / 12; return v3(Math.cos(a) * 0.6, 0.65 + Math.sin(a) * 0.6, 0); }));
  K.add(sweep(arc, 16, () => 0.05, 6, 2), { l: 'pwood', r: 0.55, c: CREAM, t: { z: 1.13 } });
  for (const sx of [-1, 1]) K.add(RB(0.1, 0.66, 0.08, 0.02), { l: 'pwood', r: 0.55, c: CREAM, uv: 'box', t: { x: sx * 0.6, y: 0.33, z: 1.13 } });
  K.add(RB(0.9, 0.26, 0.04, 0.03), { l: 'pwood', r: 0.55, c: hex(0xf2d27a), uv: 'box', t: { y: 1.42, z: 1.12 } });
  return K.geo();
}

// (atelier de prise de vue : adventure/_studio.html?i=…)
export const STUDIO = {
  swan: ({ lite }) => swanGeo({ lite }),
  bench: ({ lite }) => benchGeo({ lite }),
  fountain: ({ lite }) => fountainGeo(3, 0.65, 1.6, { lite }),
  fountain2: ({ lite }) => fountainGeo(1.4, 0.7, 0.6, { lite, water: true }),
  loco: ({ lite }) => locoGeo({ lite }),
  carousel: ({ lite }) => { const out = [carouselBaseGeo(5.2, 0.55, { lite }), SC.mergeAtl([{ geo: carouselTopGeo(5.2, 4.0, { lite }), y: 0.55 }])]; const cols = [0xffffff, 0xf6c8a0, 0xb0d8ff, 0xffe0f0, 0xd8b0ff, 0xfff0a0]; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; out.push(SC.mergeAtl([{ geo: horseGeo(cols[i], { lite }), x: Math.cos(a) * 3.6, y: 1.85, z: Math.sin(a) * 3.6, ry: -a }])); } return out; },
  horse: ({ lite }) => horseGeo(0xffffff, { lite }),
  misc: ({ lite }) => [lanternPostGeo({ lite }), SC.mergeAtl([{ geo: telescopeGeo(), x: 1.2 }, { geo: stationGeo('x', { lite }), x: -4, z: -1 }, { geo: rowboatGeo({ lite }), x: 4, z: 3, ry: 0.6 }, { geo: statueGeo(), x: 1, z: 4 }, { geo: logGeo({ lite }), x: -5, z: 5 }, { geo: mushroomGeo(), x: -1.5, z: 2 }, { geo: mushroomGeo(), x: -1.8, z: 2.4, sx: 1.4 }])],
  agility: ({ lite }) => [hurdleGeo(1.2), SC.mergeAtl([{ geo: tunnelGeo(4, 1.05, { lite }), x: 4, y: 0.9 }, { geo: weavePoleGeo(), x: -2 }, { geo: weavePoleGeo(), x: -2.8 }, { geo: tireGeo(1.2, { lite }), x: -5 }, { geo: tableGeo(1.4, 0.7), x: 1, z: 4 }, { geo: archGeo(2.2), x: 4, z: 5 }, { geo: podiumGeo(2.2, 1.1), x: -4, z: 5 }, { geo: lowFenceGeo(4), x: 0, z: -3 }, { geo: seesawBaseGeo(), x: -1, z: -6 }, { geo: seesawPlankGeo(5), x: -1, y: 0.5, z: -6 }])],
  treehouse: ({ lite }) => treehouseGeo(3.4, { lite }),
  life: () => { const L = SC.LIFE_PROPS; return [L.tubeHD({}).geo, SC.mergeAtl([{ geo: L.cartHD().geo, x: 3 }, { geo: L.bubblerHD().geo, x: -2 }, { geo: L.sprinklerHD().geo, x: -2, z: 3 }, { geo: L.trampolineHD().geo, x: 3, z: 4 }, { geo: L.birdbathHD().geo, x: -4, z: -2 }, { geo: L.mushroomHD({}).geo, x: 0, z: -4 }])]; },
  playground: ({ lite }) => { const S = { top: 3.6, w: 2.6, d: 2.6, len: 6.5 }; return [slideGeo(S, 0, { lite }), SC.mergeAtl([{ geo: stepGeo(1.2, 1.2, 1.2, 0xe03a3a), x: -2.5, z: -0.6 }, { geo: stepGeo(1.2, 2.1, 1.2, 0xf0c040), x: -2.5, z: 0.6 }]), SC.mergeAtl([{ geo: swingFrameGeo({ lite }), x: 6, z: -6 }]), SC.mergeAtl([{ geo: swingSeatGeo(0x3ab0e0), x: 4.8, y: 2.95, z: -6 }]), SC.mergeAtl([{ geo: seesawToyGeo(), x: 3, z: 5 }]), SC.mergeAtl([{ geo: sandBorderGeo(2.5, { lite }), x: -4, z: 6 }, { geo: bucketGeo(), x: -4, z: 6 }])]; },
  picnic: ({ lite }) => [blanketGeo(0xe03a3a, 0xffffff, { lite }), SC.mergeAtl([{ geo: basketGeo(), x: 0.6, z: -0.4 }, { geo: sandwichGeo(), x: -0.5, y: 0.03, z: 0.3 }, { geo: parasolGeo(0x3a8ae0, { lite }), x: -2.5, z: -2 }, { geo: benchGeo({ lite }), x: 2.5, z: -2.5, ry: 0.5 }])],
  kiosk: ({ lite }) => [kioskGeo(4.6, 0.8, 5, { lite }), SC.mergeAtl([{ geo: bandCrateGeo(1.2, 1.2, 0xe05a3a, { lite }), x: 0, z: 5.4 }]), SC.mergeAtl([{ geo: drumGeo({ lite }), x: -1.5, y: 0.8, z: -1.2 }])],
  train: ({ lite }) => [locoGeo({ lite }), SC.mergeAtl([{ geo: wagonGeo(0xf0c040, { lite }), z: -3.3 }]), SC.mergeAtl([{ geo: wagonGeo(0x3a8ae0, { lite }), z: -6.2 }])],
};
