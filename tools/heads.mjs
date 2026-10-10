/*
 * Têtes d'Ainu et de Matcha, sculptées d'après les illustrations de référence.
 * Repère local : origine au pivot de la tête, +z vers l'avant, +y vers le haut.
 */
import { ell, rcone, smin, smax, strands, noise, sstep, clamp, norm, sub, add, mul, dot, len, mixv } from './sculpt.mjs';

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const lerp = mixv;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Mèches de poils (dent de scie le long du peigné, sélection par bruit)
export function lockField(p, comb, freq, seed) {
  const c = norm(comb);
  const along = dot(p, c);
  const sel = strands(p, c, freq, seed);
  const off = noise(p[0] * freq * 0.7 + seed, p[1] * freq * 0.7, p[2] * freq * 0.7) * 1.7;
  let s = (along * freq * 0.55 + off) % 1; if (s < 0) s += 1;
  return sstep(0.0, 0.8, s) * sstep(1.0, 0.8, s) * sstep(0.3, 0.62, sel);
}

/**
 * Oreille : triangle arrondi, épaisseur décroissante vers la pointe, creusé devant.
 * Retourne { d, u, v, w, h, inner } (inner > 0 = dans le creux, pour la couleur).
 */
export function ear(p, base, tip, face, width, thick, cup, round) {
  const vax = norm(sub(tip, base)), h = len(sub(tip, base));
  let wax = sub(face, mul(vax, dot(face, vax))); wax = norm(wax);
  const uax = cross(vax, wax);
  const d0 = sub(p, base);
  const u = dot(d0, uax), v = dot(d0, vax), w = dot(d0, wax);
  const tri = (hw, hh, uu, vv) => {
    const s = hw / hh, k = Math.sqrt(1 + s * s);
    return Math.max((Math.abs(uu) - hw * (1 - vv / hh)) / k, -vv - 0.02);
  };
  const r = Math.min(width, h) * (round || (width / h > 0.9 ? 0.28 : 0.17));
  const d2 = tri(width / 2 - r, h - r * 1.4, u, v) - r;
  const t = thick * (1 - 0.65 * clamp(v / h, 0, 1));
  const a = d2, b = Math.abs(w) - t;
  let d = Math.min(Math.max(a, b), 0) + len([Math.max(a, 0), Math.max(b, 0), 0]) - t * 0.25;
  // creux à l'avant de l'oreille
  const di = tri(width * 0.3, h * 0.82, u, v - h * 0.06) - r * 0.5;
  const cupD = Math.max(di, -(w - t * 0.15));
  if (cup) d = smax(d, -cupD, t * 0.5);
  return { d, u, v, w, h, inner: -di };
}

// ===========================================================================
// AINU — eurasier roux. Tête ronde et duveteuse (collerette en cœur), museau
// court et rond, gueule ouverte en volume (babines, mâchoire, langue).
// ===========================================================================
const A = {
  red: lin(0xb4441e), deep: lin(0x8a2c12), earDk: lin(0xb0602e), org: lin(0xf08440), org2: lin(0xf6984e), gold: lin(0xf8b46a), cream: lin(0xfde8c8),
  cream2: lin(0xf4d0a0), earIn: lin(0xfbe2c4), earPink: lin(0xe8a48c), nose: lin(0x16100e), noseHi: lin(0x6a5e5a),
  dark: lin(0x5a1a06), ink: lin(0x2a0c04), mouth: lin(0x4a1210), tongue: lin(0xec7088), tongue2: lin(0xd85470),
  lip: lin(0x1a0806),
};
const EAR_L = { base: [-0.108, 0.14, -0.035], tip: [-0.178, 0.34, -0.05], face: [-0.18, 0.12, 1], width: 0.235, thick: 0.05 };
const EAR_R = { base: [0.108, 0.14, -0.035], tip: [0.178, 0.34, -0.05], face: [0.18, 0.12, 1], width: 0.235, thick: 0.05 };
// Triangle isocèle 2D (pointe en (0, 0), base en y = q[1]), distance exacte
function triIso(px, py, qx, qy) {
  px = Math.abs(px);
  const t = clamp((px * qx + py * qy) / (qx * qx + qy * qy), 0, 1);
  const ax = px - qx * t, ay = py - qy * t;
  const bx = px - qx * clamp(px / qx, 0, 1), by = py - qy;
  const da = ax * ax + ay * ay, db = bx * bx + by * by;
  const sa = -(px * qy - py * qx), sb = -(py - qy);
  const dd = Math.min(da, db), sg = Math.min(sa, sb);
  return -Math.sqrt(dd) * Math.sign(sg);
}
/**
 * Oreille d'Ainu : triangle large à pointe vraiment arrondie, épaisseur
 * décroissante vers la pointe, creusée devant. Même interface que ear().
 */
function earA(p, e) {
  const { base, tip, face, width, thick } = e;
  const vax = norm(sub(tip, base)), h = len(sub(tip, base));
  const wax = norm(sub(face, mul(vax, dot(face, vax))));
  const uax = cross(vax, wax);
  const d0 = sub(p, base);
  const u = dot(d0, uax), v = dot(d0, vax), w = dot(d0, wax);
  const r = width * 0.1;
  const tri = (hw, hh, uu, vv) => Math.max(triIso(uu, hh - vv, hw, hh), -vv - 0.03);
  const d2 = tri(width / 2 - r * 0.7, h - r * 1.2, u, v) - r;
  const t = thick * (1 - 0.6 * clamp(v / h, 0, 1));
  const a = d2, b = Math.abs(w) - t;
  let d = Math.min(Math.max(a, b), 0) + len([Math.max(a, 0), Math.max(b, 0), 0]) - t * 0.25;
  const di = tri(width * 0.42, h * 0.82, u, v - h * 0.02) - r * 0.4;
  d = smax(d, -Math.max(di, -(w - t * 0.15)), t * 0.5);
  return { d, u, v, w, h, inner: -di };
}
const HC = [0, -0.02, -0.04];                               // centre de la tête (pour les touffes)
const TF = 14;                                              // fréquence des touffes
const NOSE = [[0, -0.036, 0.282], [0.053, 0.032, 0.031]];  // truffe

// gueule ouverte : creux entre la babine et la mâchoire, coins qui remontent vers les joues
function ainuMouth(p) {
  let c = ell(p, [0, -0.15, 0.188], [0.094, 0.046, 0.12]);
  for (const sx of [-1, 1]) c = smin(c, ell(p, [sx * 0.104, -0.104, 0.108], [0.036, 0.02, 0.055]), 0.028);
  return c;
}
const ainuTongue = (p) => ell(p, [0, -0.19 - Math.max(0, p[2] - 0.19) * 0.35, 0.183], [0.06, 0.017, 0.088]);

function ainuHeadBase(p) {
  const x = p[0], y = p[1], z = p[2];
  let d = ell(p, [0, 0.05, -0.04], [0.21, 0.195, 0.2]);                          // crâne en dôme
  d = smin(d, ell(p, [0, -0.015, 0.045], [0.165, 0.14, 0.14]), 0.05);           // face, joues hautes
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.074, 0.085, 0.12], [0.058, 0.032, 0.04]), 0.035); // arcades
  // museau court, rond, dessus plat
  const m = rcone([x, (y + 0.05) * 1.18 - 0.05, z], [0, -0.058, 0.12], [0, -0.058, 0.212], 0.09, 0.077);
  d = smin(d, m, 0.07);
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.085, -0.065, 0.12], [0.075, 0.065, 0.075]), 0.05);  // joues sous les yeux
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.052, -0.092, 0.197], [0.058, 0.03, 0.065]), 0.03);  // babines
  d = smin(d, ell(p, NOSE[0], NOSE[1]), 0.016);                                  // truffe
  d = smin(d, ell(p, [0, -0.212, 0.152], [0.074, 0.03, 0.09]), 0.035);           // mâchoire (gueule ouverte)
  // collerette des joues (tête en cœur) et gorge
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.19, -0.085, -0.05], [0.17, 0.165, 0.155]), 0.08);
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.17, -0.19, -0.06], [0.15, 0.12, 0.13]), 0.08);
  d = smin(d, ell(p, [0, -0.24, -0.05], [0.18, 0.13, 0.15]), 0.08);
  d = smax(d, -ainuMouth(p), 0.012);
  d = Math.min(d, ainuTongue(p));
  d = smin(d, earA(p, EAR_L).d, 0.022);
  d = smin(d, earA(p, EAR_R).d, 0.022);
  return d;
}
// sens du poil : vers l'arrière sur le crâne, vers le bas et l'extérieur sur les joues
function ainuHeadComb(p) {
  const ax = Math.abs(p[0]), sx = Math.sign(p[0]) || 1;
  if (p[1] > 0.1) return norm([p[0] * 1.5, 0.35, -1]);
  return norm([sx * (0.6 + ax * 2), -1.0 + Math.max(0, p[1]) * 3, -0.35]);
}
// touffes pointues dans le sens du poil (rangées décalées, pointes vers le peigné)
export function tuftInfo(p, comb, center, freq, seed) {
  const c = norm(comb);
  let t = cross(c, norm(sub(p, center)));
  const tl = len(t); if (tl < 1e-4) return { h: 0, s: 0, e: 1, id: 0 }; t = mul(t, 1 / tl);
  const n1 = noise(p[0] * 9 + seed, p[1] * 9, p[2] * 9), n2 = noise(p[0] * 13, p[1] * 13 + seed, p[2] * 13);
  const a = dot(p, c) * freq + n1 * 0.9;
  const row = Math.floor(a), s = a - row;
  const fl = dot(p, t) * freq * 1.6 + row * 0.5 + n2 * 0.6;
  const col = Math.floor(fl), f = fl - col - 0.5;
  const w = 0.5 * Math.pow(1 - s, 0.8) + 0.02;
  const h = Math.pow(s, 0.7) * clamp(1 - Math.abs(f) / w, 0, 1) * sstep(1.0, 0.88, s);
  // e : distance (monde) au bord latéral de la touffe ; id : identifiant pseudo-aléatoire de la touffe
  const e = (w - Math.abs(f)) / (freq * 1.6);
  const id = (Math.sin(row * 12.9898 + col * 78.233 + seed) * 43758.5453) % 1;
  return { h, s, e, id: Math.abs(id) };
}
export const tuftField = (p, comb, center, freq, seed) => tuftInfo(p, comb, center, freq, seed).h;
// zone sans touffes : visage, museau, intérieur des oreilles
function faceZone(p) {
  const ax = Math.abs(p[0]);
  return sstep(0.02, 0.1, p[2]) * sstep(0.17, 0.11, ax) * sstep(0.15, 0.09, p[1]) * sstep(-0.26, -0.19, p[1]);
}
// Mèches : cônes pointus posés sur la collerette, l'arrière du crâne et dans
// les oreilles. Ils dessinent la silhouette « en flammes » des illustrations
// sous tous les angles (une touffe peinte de face disparaîtrait de trois quarts).
const hash1 = (i) => { const h = Math.sin(i * 91.17 + 7.3) * 43758.5453; return h - Math.floor(h); };
function surfaceHit(o, dir) {
  for (let t = 0; t < 0.8; t += 0.003) { const p = add(o, mul(dir, t)); if (ainuHeadBase(p) > 0) return p; }
  return null;
}
const LOCKS = (() => {
  const out = []; let k = 1;
  const e = 0.002;
  const nrm = (p) => norm([ainuHeadBase(add(p, [e, 0, 0])) - ainuHeadBase(sub(p, [e, 0, 0])), ainuHeadBase(add(p, [0, e, 0])) - ainuHeadBase(sub(p, [0, e, 0])), ainuHeadBase(add(p, [0, 0, e])) - ainuHeadBase(sub(p, [0, 0, e]))]);
  // mèche couchée dans le sens du poil, légèrement soulevée, aplatie contre la peau
  const lock = (base, lift, length, rb) => {
    const n = nrm(base), dir = norm(add(mul(n, lift), ainuHeadComb(base)));
    const a = sub(base, add(mul(dir, rb * 1.2), mul(n, rb * 0.3))), b = add(base, mul(dir, length));
    const lo = [0, 1, 2].map(i => Math.min(a[i], b[i]) - rb - 0.03), hi = [0, 1, 2].map(i => Math.max(a[i], b[i]) + rb + 0.03);
    out.push({ a, b, rb, n, lo, hi });
  };
  // collerette : joues et gorge, sur trois profondeurs, pointes vers le bas et l'extérieur
  for (const [zc, n0, ph] of [[-0.15, 0, 0], [-0.06, 0, 0.1], [0.03, 3, 0]]) for (let i = n0; i <= 8; i++) for (const sx of [-1, 1]) {
    if (sx < 0 && i === 8) continue;
    const phi = 0.15 - i * 0.21 - ph + (hash1(k++) - 0.5) * 0.12;
    const d2 = [sx * Math.cos(phi), Math.sin(phi), 0];
    const base = surfaceHit([0, -0.08, zc], d2); if (!base) continue;
    lock(base, 0.35, (0.05 + 0.03 * hash1(k++)) * (1 - 0.35 * sstep(4, 8, i)), 0.05 + 0.014 * hash1(k++));
  }
  // arrière du crâne et nuque : mèches couchées vers l'arrière
  for (let i = 0; i < 4; i++) for (const xs of [-0.75, -0.25, 0.25, 0.75]) {
    const th = -0.5 + i * 0.4 + (hash1(k++) - 0.5) * 0.15;
    const d2 = norm([xs, Math.sin(th), -Math.cos(th)]);
    const base = surfaceHit([0, 0.0, -0.04], d2); if (!base) continue;
    lock(base, 0.22, 0.045 + 0.03 * hash1(k++), 0.042 + 0.01 * hash1(k++));
  }
  return out;
})();
// cône pointu (rayon nul au bout) : distance et position le long de la mèche
function lockDist(p, L) {
  const ba = sub(L.b, L.a), pa = sub(p, L.a);
  const t = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
  const q = sub(pa, mul(ba, t)), qn = dot(q, L.n);
  return { d: len(add(q, mul(L.n, qn * 0.8))) / 1.4 - L.rb * (1 - t) / 1.4, t };
}
function locksField(p) {
  let d = 1e9, t = 0;
  for (const L of LOCKS) {
    if (p[0] < L.lo[0] || p[1] < L.lo[1] || p[2] < L.lo[2] || p[0] > L.hi[0] || p[1] > L.hi[1] || p[2] > L.hi[2]) continue;
    const r = lockDist(p, L);
    if (r.d < d) { d = r.d; t = r.t; }
  }
  return { d, t };
}
export function ainuHead(p) {
  let d = ainuHeadBase(p);
  if (d > 0.12) return d;
  const lk = locksField(p);
  if (lk.d < 0.1) d = smin(d, lk.d, 0.024);
  const amp = furAmp(p);
  if (amp < 1e-4) return d;
  return d - amp * tuftField(p, ainuHeadComb(p), HC, TF, 4.1);
}
function furAmp(p) {
  const ax = Math.abs(p[0]);
  const face = faceZone(p);
  // collerette : bas des joues, gorge, arrière du crâne
  const ruff = clamp(sstep(0.2, 0.32, ax) * sstep(0.08, -0.06, p[1]) + sstep(-0.18, -0.28, p[1]) + sstep(-0.14, -0.26, p[2]) * 0.7, 0, 1);
  let earZ = 0;
  for (const e of [EAR_L, EAR_R]) { const E = earA(p, e); if (E.d < 0.03) earZ = Math.max(earZ, sstep(0.03, 0.0, E.d) * sstep(0.02, 0.06, E.v)); }
  const outer = clamp(sstep(0.27, 0.37, ax) + sstep(-0.27, -0.37, p[1]), 0, 1);
  return (0.003 + 0.014 * ruff + 0.0 * outer) * (1 - face) * (1 - earZ * 0.8);
}
export function ainuHeadColor(p, n) {
  const ax = Math.abs(p[0]), sx = Math.sign(p[0]) || 1;
  let c = A.org;
  c = lerp(c, A.red, clamp(sstep(0.08, 0.24, p[1]) * 0.55 + sstep(-0.05, -0.22, p[2]) * 0.45 + sstep(0.2, 0.32, Math.abs(p[0])) * 0.3, 0, 0.8));  // dessus et arrière plus rouges
  c = lerp(c, A.gold, sstep(0.0, 0.1, p[1]) * sstep(0.13, 0.03, ax) * sstep(0.05, 0.14, p[2]) * 0.45); // front clair
  c = lerp(c, A.org2, sstep(-0.02, -0.12, p[1]) * sstep(0.12, 0.24, ax) * 0.5);         // joues dorées
  // masque crème : museau, joues sous les yeux (jusqu'à la collerette), gorge
  // limite : sous l'œil, descend en biais vers l'arrière ; l'arête du nez reste rousse
  const yb = ax < 0.03 ? -0.06 + ax * 0.6 : ax < 0.1 ? -0.042 + (ax - 0.03) * 0.65 : ax < 0.16 ? 0.0035 : 0.0035 - (ax - 0.16) * 0.55;
  const ragged = (noise(p[0] * 60, p[1] * 25, p[2] * 60) - 0.5) * 0.03;
  const mask = sstep(yb + 0.01, yb - 0.01, p[1] + ragged + Math.max(0, -p[2]) * 0.15) * sstep(0.36, 0.28, ax);
  const throat = sstep(-0.16, -0.24, p[1] + ragged) * sstep(0.2, 0.1, ax) * sstep(-0.16, -0.04, p[2]);
  const m = clamp(mask + throat, 0, 1);
  c = lerp(c, A.cream, m);
  c = lerp(c, A.cream2, m * sstep(0.12, 0.22, ax) * 0.6);
  // taches crème au-dessus des yeux
  for (const s of [-1, 1]) {
    const dd = Math.hypot((p[0] - s * 0.07) / 0.026, (p[1] - 0.112) / 0.017);
    c = lerp(c, A.cream, sstep(1.0, 0.65, dd) * sstep(0.08, 0.13, p[2]));
  }
  // oreilles : dos roux foncé, creux crème duveteux, base rosée
  let earK = 0;
  for (const e of [EAR_L, EAR_R]) {
    const E = earA(p, e);
    if (E.d < 0.03 && E.v > -0.015) {
      const k = sstep(-0.015, 0.03, E.v);
      earK = Math.max(earK, k * sstep(0.02, 0.0, E.d));
      let ce = lerp(A.red, A.deep, sstep(0.3, 1.0, E.v / E.h) * 0.6 + sstep(0.0, -0.02, E.w) * 0.3);
      if (E.inner > 0.0 && E.w > -0.01) {
        const fz = strands(p, [-sx * 0.3, 1, 0], 70, 3.3);
        // creux : fond roux sombre, touffes crème qui partent du bord intérieur
        const edge = clamp(1 - E.inner / 0.03, 0, 1);
        ce = lerp(A.earDk, A.earIn, clamp(sstep(0.45, 0.65, fz) * 0.9 + edge * 0.5 + sstep(0.35, 0.0, E.v / E.h) * 0.6, 0, 1));
      }
      c = lerp(c, ce, k);
    }
  }
  // truffe noire avec reflet
  const nd = ell(p, NOSE[0], NOSE[1]);
  const nk = sstep(0.014, 0.006, nd) * sstep(0.245, 0.258, p[2]);
  c = lerp(c, lerp(A.nose, A.noseHi, sstep(0.3, 0.9, n[1]) * sstep(0.0, 0.4, n[2]) * 0.8), nk);
  // gueule : intérieur sombre, babines noires, langue rose
  const mo = ainuMouth(p);
  const inMouth = sstep(0.008, 0.003, mo);
  c = lerp(c, lerp(A.mouth, A.lip, sstep(0.15, 0.1, p[2])), inMouth);
  c = lerp(c, A.lip, sstep(0.02, 0.01, mo) * (1 - inMouth) * sstep(-0.21, -0.1, p[1]) * sstep(0.08, 0.12, p[2]));
  const to = ainuTongue(p);
  if (to < 0.006) c = lerp(c, lerp(A.tongue, A.tongue2, sstep(0.009, 0.002, Math.abs(p[0])) * 0.8 * sstep(0.2, 0.24, p[2]) + sstep(0.04, 0.06, Math.abs(p[0])) * 0.3), sstep(0.006, 0.0, to));
  // babine du dessous (mâchoire) : liseré noir
  // mèches sculptées : pointe éclaircie, racine dans l'ombre
  const lk = locksField(p);
  if (lk.d < 0.012) {
    const wl = sstep(0.012, 0.002, lk.d) * (1 - nk);
    c = lerp(c, lerp(c, m > 0.5 ? A.cream : A.gold, 0.6), sstep(0.45, 1.0, lk.t) * wl * 0.6);
    c = lerp(c, lerp(c, A.dark, 0.5), sstep(0.25, 0.0, lk.t) * wl * 0.35);
  }
  // mèches peintes : racine des touffes plus sombre (trait d'encre), pointes claires
  const comb = ainuHeadComb(p);
  const face = faceZone(p);
  const T = tuftInfo(p, comb, HC, TF, 4.1), tf = T.h;
  const furW = (1 - face * 0.9) * (1 - nk) * sstep(-0.002, 0.012, mo) * (1 - m * 0.4) * (1 - earK);
  const fw = furW * clamp(furAmp(p) / 0.03, 0.4, 1);
  c = lerp(c, lerp(c, A.dark, 0.5), sstep(0.04, 0.0, tf) * fw * 0.28);
  c = lerp(c, lerp(c, A.gold, 0.5), sstep(0.6, 0.95, tf) * fw * (1 - m) * 0.45);
  // traits d'encre : bord des pointes de mèches (en V), une mèche sur deux
  const ink = sstep(0.0, 0.003, T.e) * sstep(0.012, 0.007, T.e) * sstep(0.3, 0.5, T.s) * sstep(0.45, 0.4, T.id) * furW * (1 - nk);
  c = lerp(c, lerp(A.dark, A.ink, m * 0.3), ink * (0.75 - m * 0.25));
  // mèches claires (reflets) sur le haut des touffes
  const s = strands(p, comb, 22, 2.2);
  // ombrage peint : bords et dessous plus foncés, front plus clair
  const occ = (0.42 + 0.58 * sstep(-0.5, 0.8, n[2])) * (0.8 + 0.2 * sstep(-0.8, 0.2, n[1])) * (1 + 0.1 * sstep(0.2, 0.9, n[1]));
  const deep = 1;
  return mul(c, (0.94 + s * 0.12) * occ * deep);
}
export const ainuHeadBox = [[-0.5, -0.46, -0.42], [0.5, 0.46, 0.4]];
export const ainuDecal = { x0: -0.32, x1: 0.32, y0: -0.4, y1: 0.24, fade: (p, n) => sstep(0.1, 0.4, n[2]) * sstep(0.04, 0.09, p[2]) };

// ===========================================================================
// MATCHA (pinscher nain) — origine au pivot de la tête
// ===========================================================================
const B = {
  blk: lin(0x1c1f2e), blk2: lin(0x3c4562), tan: lin(0xc0702e), tan2: lin(0xe2964e), tanD: lin(0x8e4a1e),
  earIn: lin(0xe0806a), earIn2: lin(0xf2b496), nose: lin(0x0c0a10), mouth: lin(0x4a1010), tongue: lin(0xe86a7c),
};
// grandes oreilles dressées, larges à la base, un peu écartées, pointe arrondie
// (profil en feuille : bords bombés, plus large un peu au-dessus de la base)
const MEAR_L = { base: [-0.044, 0.066, -0.02], tip: [-0.11, 0.192, -0.036], face: [-0.42, 0.04, 1], width: 0.086, thick: 0.011 };
const MEAR_R = { base: [0.044, 0.066, -0.02], tip: [0.11, 0.192, -0.036], face: [0.42, 0.04, 1], width: 0.086, thick: 0.011 };
const leafW = (t) => (t <= 0 ? 1 : t >= 1 ? 0 : Math.pow(1 - t, 0.95) * (1 + 0.38 * t));
function earB(p, e) {
  const vax = norm(sub(e.tip, e.base)), h = len(sub(e.tip, e.base));
  const wax = norm(sub(e.face, mul(vax, dot(e.face, vax))));
  const uax = cross(vax, wax);
  const d0 = sub(p, e.base);
  const u = dot(d0, uax), v = dot(d0, vax), w = dot(d0, wax);
  const prof = (hw, hh, uu, vv) => {
    const t = vv / hh, f = (x) => leafW(x) * hw;
    const sl = (f(clamp(t + 0.02, 0, 1)) - f(clamp(t - 0.02, 0, 1))) / (0.04 * hh);
    const dd = (Math.abs(uu) - f(clamp(t, 0, 1))) / Math.sqrt(1 + Math.min(sl * sl, 9));
    return Math.max(dd, vv - hh, -vv - 0.025);
  };
  const d2 = prof(e.width / 2, h, u, v);
  const t = e.thick * (1 - 0.6 * clamp(v / h, 0, 1));
  const a = d2, b = Math.abs(w) - t;
  let d = Math.min(Math.max(a, b), 0) + len([Math.max(a, 0), Math.max(b, 0), 0]) - t * 0.3;
  // creux à l'avant (conque), bord noir laissé tout autour
  const di = prof(e.width * 0.37, h * 0.88, u, v + h * 0.01);
  const pink = -prof(e.width * 0.43, h * 0.93, u, v);
  const cupD = Math.max(di, -(w - t * 0.2));
  d = smax(d, -cupD, t * 0.5);
  return { d, u, v, w, h, inner: -di, pink };
}
// gueule ouverte : cavité entre la babine et la mâchoire, langue au fond
const MCAV = (p) => ell([p[0], p[1] + (p[2] - 0.03) * 0.14, p[2]], [0, -0.055, 0.08], [0.022, 0.013, 0.048]);
const MTONGUE = (p) => ell([p[0], p[1] + (p[2] - 0.03) * 0.26, p[2]], [0, -0.062, 0.075], [0.017, 0.0075, 0.038]);
function matchaHeadBase(p) {
  let d = ell(p, [0, 0.016, -0.016], [0.074, 0.072, 0.074]);                 // crâne en pomme
  d = smin(d, ell(p, [0, 0.022, 0.02], [0.056, 0.05, 0.05]), 0.02);          // front bombé (stop marqué)
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.033, -0.028, 0.014], [0.028, 0.03, 0.034]), 0.022); // joues
  // museau de longueur moyenne, un peu étroit, dessus droit
  const q = [p[0] * 1.22, (p[1] + 0.03) * 1.08 - 0.03, p[2]];
  d = smin(d, rcone(q, [0, -0.024, 0.04], [0, -0.03, 0.095], 0.04, 0.025), 0.022);
  d = smin(d, ell(p, [0, -0.025, 0.107], [0.0155, 0.012, 0.012]), 0.007);    // truffe
  d = smin(d, ell([p[0], p[1] + (p[2] - 0.03) * 0.28, p[2]], [0, -0.066, 0.06], [0.022, 0.013, 0.04]), 0.016);     // mâchoire inférieure, gueule entrouverte
  d = smin(d, ell(p, [0, -0.056, -0.02], [0.034, 0.028, 0.038]), 0.03);         // gorge
  d = smax(d, -MCAV(p), 0.005);
  d = Math.min(d, MTONGUE(p));
  d = smin(d, earB(p, MEAR_L).d, 0.014);
  d = smin(d, earB(p, MEAR_R).d, 0.014);
  return d;
}
export function matchaHead(p) { return matchaHeadBase(p); }
export function matchaHeadColor(p, n) {
  const ax = Math.abs(p[0]);
  // noir bleuté avec reflets bleus sur le dessus
  let c = lerp(B.blk, B.blk2, sstep(0.25, 0.95, n[1]) * 0.55 + sstep(0.3, 0.9, -n[0] * 0.6 + n[1] * 0.5) * 0.2);
  // feu : côtés du museau, joues sous les yeux, mâchoire et gorge
  const cheekTop = 0.004 - Math.max(0, p[2] - 0.03) * 0.25 - Math.max(0, 0.02 - p[2]) * 0.35;
  const cheek = sstep(cheekTop + 0.004, cheekTop - 0.004, p[1]) * sstep(0.072, 0.058, ax + Math.max(0, -p[2]) * 0.6) * sstep(-0.012, 0.008, p[2]);
  const muzzle = sstep(0.045, 0.055, p[2]) * sstep(-0.004, -0.012, p[1]);
  const jaw = sstep(-0.048, -0.058, p[1]) * sstep(-0.06, -0.03, p[2]);
  c = lerp(c, B.tan, clamp(cheek + muzzle + jaw, 0, 1));
  c = lerp(c, B.tan2, clamp(cheek + muzzle, 0, 1) * sstep(0.1, 0.6, n[1]) * 0.5);
  // arête du museau noire, qui s'élargit vers le front et descend jusqu'à la truffe
  const bridgeW = 0.021 + Math.max(0, 0.07 - p[2]) * 0.45;
  c = lerp(c, B.blk, sstep(bridgeW, bridgeW - 0.007, ax) * sstep(-0.034, -0.024, p[1]) * sstep(0.03, 0.045, p[2]));
  // points feu nets au-dessus des yeux
  for (const sx of [-1, 1]) {
    const dd = Math.hypot((p[0] - sx * 0.031) / 0.0115, (p[1] - 0.043) / 0.0085);
    c = lerp(c, B.tan2, sstep(1.0, 0.75, dd) * sstep(0.035, 0.05, p[2]));
  }
  // oreilles : creux rose-orangé, bord noir
  for (const e of [MEAR_L, MEAR_R]) {
    const E = earB(p, e);
    if (E.d < 0.008 && E.v > 0.0 && E.pink > 0.0 && E.w > -0.004) c = lerp(lerp(B.earIn, B.earIn2, sstep(0.15, 0.75, E.v / E.h)), lin(0xb05a40), sstep(0.004, 0.0, E.pink) * 0.6);
  }
  if (p[2] > 0.097 && p[1] > -0.044) c = lerp(c, B.nose, sstep(0.097, 0.103, p[2]));
  // ombrage peint
  c = mul(c, (0.78 + 0.22 * sstep(-0.3, 0.7, n[2])) * (0.85 + 0.15 * sstep(-0.8, 0.2, n[1])));
  // gueule
  c = lerp(c, B.mouth, sstep(0.004, -0.001, MCAV(p)));
  if (MTONGUE(p) < 0.002) c = lerp(B.tongue, lin(0xf49aa6), sstep(0.2, 0.9, n[1]) * 0.5);
  return c;
}
export const matchaHeadBox = [[-0.17, -0.12, -0.12], [0.17, 0.25, 0.2]];
export const matchaDecal = { x0: -0.1, x1: 0.1, y0: -0.11, y1: 0.09, fade: (p, n) => sstep(0.1, 0.45, n[2]) * sstep(-0.0, 0.03, p[2]) };
