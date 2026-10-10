/*
 * Corps d'Ainu (eurasier roux) d'après les illustrations : chien compact au
 * poitrail profond, collerette et plastron crème volumineux, pattes épaisses
 * frangées, « culottes » aux cuisses, grand panache enroulé sur le dos et
 * harnais (Y sur le poitrail, couverture turquoise bordée d'or, selle, sacoches).
 *
 * La fourrure est faite de mèches sculptées (feuilles effilées couchées dans le
 * sens du poil, pointe légèrement soulevée) plutôt que de bruit : silhouette
 * festonnée lisible et surfaces douces sous le cel shading.
 *
 * Repère : sol y = 0, avant +z. Pivots utilisés par le jeu : tête (0,1.6,0.78),
 * queue (0,1.15,-0.72), pattes (±0.16,0.62,0.4) et (±0.16,0.62,-0.5).
 */
import { ell, rcone, smin, smax, strands, noise, sstep, clamp, norm, sub, add, mul, dot, len, mixv } from './sculpt.mjs';

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const lerp = mixv;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hash1 = (i) => { const h = Math.sin(i * 91.17 + 7.3) * 43758.5453; return h - Math.floor(h); };

export const K = {
  red: lin(0xb4441e), deep: lin(0x8a2c12), org: lin(0xe46a26), org2: lin(0xf08238), gold: lin(0xf6ae62), cream: lin(0xfde8c8),
  cream2: lin(0xf2cc96), dark: lin(0x5a1a06), ink: lin(0x2a0c04), pad: lin(0x3a2418),
};

// ---------------------------------------------------------------------------
// Mèches : feuille effilée en deux segments (racine → milieu → pointe),
// aplatie contre la peau selon la normale n.
// ---------------------------------------------------------------------------
function makeLock(base, n, dir, length, w, o = {}) {
  const lift = o.lift ?? 0.3, droop = o.droop ?? 0, flat = o.flat ?? 2.0;
  let t = sub(dir, mul(n, dot(dir, n))); t = norm(t);
  const d1 = norm(add(t, mul(n, lift)));
  const d2 = norm(add(add(t, mul(n, lift * 0.5)), [0, -droop, 0]));
  const a = sub(base, add(mul(n, w * 0.5), mul(d1, w * 0.6)));
  const m = add(a, mul(d1, length * 0.5 + w * 0.6));
  const b = add(m, mul(d2, length * 0.5));
  const c = mul(add(a, b), 0.5), R = len(sub(b, a)) * 0.5 + w + 0.02;
  return { a, m, b, n, w, flat, c, R, tip: o.tip ?? 0.004, col: o.col || 0, id: o.id || 0 };
}
function lockDist(p, L) {
  const pa = sub(p, L.a), dn = dot(pa, L.n);
  const q = add(p, mul(L.n, dn * (L.flat - 1)));
  const d1 = rcone(q, L.a, L.m, L.w, L.w * 0.78);
  const d2 = rcone(q, L.m, L.b, L.w * 0.78, L.tip);
  const ab = sub(L.b, L.a);
  const t = clamp(dot(pa, ab) / dot(ab, ab), 0, 1);
  return { d: Math.min(d1, d2) / L.flat, t };
}
function locksAt(p, list) {
  let d = 1e9, d2 = 1e9, t = 0, L0 = null;
  for (const L of list) {
    const dx = p[0] - L.c[0], dy = p[1] - L.c[1], dz = p[2] - L.c[2];
    if (dx * dx + dy * dy + dz * dz > (L.R + 0.04) * (L.R + 0.04)) continue;
    const r = lockDist(p, L);
    if (r.d < d) { d2 = d; d = r.d; t = r.t; L0 = L; } else if (r.d < d2) d2 = r.d;
  }
  return { d, d2, t, L: L0 };
}
const gradOf = (f, p, e = 0.002) => norm([f(add(p, [e, 0, 0])) - f(sub(p, [e, 0, 0])), f(add(p, [0, e, 0])) - f(sub(p, [0, e, 0])), f(add(p, [0, 0, e])) - f(sub(p, [0, 0, e]))]);
function hit(f, from, to) {
  const dir = norm(sub(to, from)), L = len(sub(to, from));
  let t = 0;
  for (let i = 0; i < 200 && t < L; i++) { const d = f(add(from, mul(dir, t))); if (d < 0.0008) return add(from, mul(dir, t)); t += Math.max(d * 0.7, 0.001); }
  return null;
}

// ---------------------------------------------------------------------------
// CORPS
// ---------------------------------------------------------------------------
const NECK_A = [0, 1.12, 0.4], NECK_B = [0, 1.5, 0.7];
export function bodyBase(p) {
  let d = ell(p, [0, 0.84, 0.36], [0.33, 0.46, 0.37]);                 // poitrail profond (bas ≈ 0.38)
  d = smin(d, ell(p, [0, 0.86, -0.14], [0.31, 0.39, 0.52]), 0.14);     // dos (dessus ≈ 1.25 sous la selle)
  d = smin(d, ell(p, [0, 0.9, -0.56], [0.3, 0.36, 0.31]), 0.12);      // croupe
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.15, 0.92, 0.38], [0.18, 0.34, 0.22]), 0.08); // épaules
  d = smin(d, rcone(p, NECK_A, NECK_B, 0.28, 0.22), 0.12);             // cou
  d = smin(d, ell(p, [0, 1.2, 0.52], [0.36, 0.33, 0.28]), 0.1);        // base de la collerette
  d = smin(d, ell(p, [0, 0.8, 0.62], [0.22, 0.34, 0.15]), 0.1);       // plastron
  return d;
}
const mouthClear = (p, d) => smax(d, -ell(p, [0, 1.42, 1.02], [0.17, 0.11, 0.2]), 0.04);

// Zones des sangles : pas de mèches dessous (elles bomberaient à travers le cuir)
const STRAP_PATHS = [];
function onStrap(p, margin) {
  for (const P of STRAP_PATHS) for (let i = 0; i < P.pts.length - 1; i++) if (rcone(p, P.pts[i], P.pts[i + 1], P.w + margin, P.w + margin) < 0) return true;
  if (Math.abs(dot(sub(p, GIRTH1.c), GIRTH1.n)) < GIRTH1.w + margin && p[1] < 1.3) return true;
  if (Math.abs(dot(sub(p, GIRTH2.c), GIRTH2.n)) < GIRTH2.w + margin && p[1] < 1.3) return true;
  return false;
}
const GIRTH1 = { c: [0, 0.9, 0.04], n: norm([0, 0.12, 1]), w: 0.038 };
const GIRTH2 = { c: [0, 0.9, -0.24], n: norm([0, -0.05, 1]), w: 0.038 };
// Couverture : zone (z, y) sur le dos
const blanketBox = (p) => (Math.pow(Math.pow(Math.abs(p[2] + 0.13) / 0.3, 4) + Math.pow(Math.abs(p[1] - 1.32) / 0.33, 4), 0.25) - 1) * 0.3;
const underBlanket = (p, m) => blanketBox(p) < m;

{
  // trajets des sangles en Y : épaule → médaillon → entre les pattes
  const f = bodyBase;
  const onS = (pt, from) => { const h = hit(f, from, pt); return h || pt; };
  for (const sx of [-1, 1]) {
    STRAP_PATHS.push({ w: 0.04, pts: [
      onS([sx * 0.22, 1.12, 0.1], [sx * 0.9, 1.3, 0.1]),
      onS([sx * 0.28, 1.04, 0.32], [sx * 0.9, 1.1, 0.32]),
      onS([sx * 0.25, 0.97, 0.52], [sx * 0.8, 1.0, 0.9]),
      onS([sx * 0.11, 0.8, 0.66], [sx * 0.3, 0.8, 1.4]),
      onS([0, 0.73, 0.7], [0, 0.73, 1.4]),
    ] });
  }
  STRAP_PATHS.push({ w: 0.038, pts: [onS([0, 0.73, 0.7], [0, 0.73, 1.4]), onS([0, 0.6, 0.66], [0, 0.62, 1.4]), onS([0, 0.45, 0.5], [0, 0.0, 0.8]), onS([0, 0.42, 0.06], [0, 0.0, 0.06])] });
}
const BODY_LOCKS = [];
{
  const f = bodyBase;
  let k = 1;
  const add1 = (base, dir, length, w, o) => {
    if (!base) return;
    if (onStrap(base, w * 0.6) || underBlanket(base, 0.03)) return;
    if (ell(base, [0, 1.62, 0.84], [0.33, 0.27, 0.28]) < 0) return;   // caché dans la tête
    BODY_LOCKS.push(makeLock(base, gradOf(f, base), dir, length, w, { ...o, id: k }));
  };
  // Collerette : anneaux autour du cou, mèches vers le bas et l'arrière
  const ax = norm(sub(NECK_B, NECK_A)), u1 = [1, 0, 0], u2 = cross(ax, u1);
  const rings = [[0.12, 16, 0.33, 0.085], [0.38, 15, 0.31, 0.082], [0.64, 13, 0.27, 0.078], [0.9, 11, 0.21, 0.07]];
  rings.forEach(([s, n, L, w], ri) => {
    const c0 = add(NECK_A, mul(sub(NECK_B, NECK_A), s));
    for (let i = 0; i < n; i++) {
      const phi = -2.7 + (i + 0.5 * (ri % 2) + (hash1(k++) - 0.5) * 0.3) * (5.4 / (n - 1 + 0.5));
      if (phi > 2.75) continue;
      const r = add(mul(u2, -Math.cos(phi)), mul(u1, Math.sin(phi)));    // phi = 0 : gorge
      const base = hit(f, add(c0, mul(r, 1.0)), c0);
      const side = Math.abs(Math.sin(phi)), top = sstep(1.6, 2.6, Math.abs(phi));
      const dir = norm(add(lerp([0, -1, 0.12], [0, -0.55, -0.85], side), mul(r, 0.15)));
      add1(base, lerp(dir, [Math.sign(phi) * 0.2, 0.1, -1], top), L * (0.85 + 0.3 * hash1(k++)) * (1 - top * 0.3), w, { lift: 0.32, droop: 0.3, col: 1 });
    }
  });
  // Plastron crème : rangées en écailles vers le bas, la dernière pend entre les pattes
  for (let row = 0; row < 6; row++) {
    const y = 1.1 - row * 0.11, nx = 5 - (row > 2 ? 1 : 0);
    for (let i = 0; i < nx; i++) {
      const x = (i - (nx - 1) / 2) * 0.085 + (row % 2 ? 0.04 : 0) + (hash1(k++) - 0.5) * 0.02;
      const base = hit(f, [x, y, 1.4], [x * 0.5, y, 0.2]);
      const L = row === 5 ? 0.24 : 0.2;
      add1(base, [x * 0.6, -1, 0.15], L * (0.9 + 0.2 * hash1(k++)), 0.075, { lift: 0.3, droop: 0.35, col: 2 });
    }
  }
  // Frange du ventre
  for (let z = 0.3; z > -0.56; z -= 0.1) for (const x of [-0.21, -0.1, 0.0, 0.1, 0.21]) {
    const zz = z + (hash1(k++) - 0.5) * 0.04 + (Math.abs(x) > 0.15 ? 0.05 : 0);
    const base = hit(f, [x * 1.4, 0.2, zz], [x * 0.5, 0.95, zz]);
    add1(base, [Math.sign(x) * 0.35, -0.75, -0.6], 0.15 * (0.85 + 0.3 * hash1(k++)), 0.065, { lift: 0.45, droop: 0.4, col: 3 });
  }
  // Flancs, épaules et croupe : mèches couchées vers l'arrière
  for (const sx of [-1, 1]) {
    for (let z = 0.3; z > -0.95; z -= 0.12) for (let y = 0.6; y < 1.25; y += 0.14) {
      if (y > 0.9 && z > -0.45) continue;
      const zz = z + (Math.round(y / 0.14) % 2 ? 0.06 : 0) + (hash1(k++) - 0.5) * 0.04;
      const base = hit(f, [sx * 0.8, y, zz], [0, y, zz]);
      add1(base, [0, -0.5, -1], 0.3 * (0.85 + 0.3 * hash1(k++)), 0.055, { lift: 0.1, droop: 0.2, col: 0 });
    }
  }
  // Arrière de la croupe : mèches vers le bas
  for (let y = 0.68; y < 1.2; y += 0.11) for (const x of [-0.18, -0.06, 0.06, 0.18]) {
    const base = hit(f, [x, y, -1.4], [x * 0.5, y, -0.4]);
    add1(base, [x * 0.5, -1, -0.4], 0.26, 0.05, { lift: 0.22, droop: 0.3, col: 0 });
  }
}

export function body(p) {
  let d = bodyBase(p);
  if (d < 0.32) {
    const lk = locksAt(p, BODY_LOCKS);
    if (lk.d < 0.2) d = smin(d, lk.d, 0.03);
  }
  return mouthClear(p, d);
}
// teinte d'une mèche selon sa région
function regionColor(p, n, col) {
  if (col === 2) return K.cream;
  if (col === 3) return lerp(K.gold, K.cream, 0.55);
  if (col === 1) {
    // collerette : crème devant / sous la gorge, doré puis roux sur les côtés
    const front = sstep(0.2, 0.75, n[2]) * sstep(1.45, 1.1, p[1]) + sstep(0.48, 0.66, p[2]) * sstep(1.3, 1.1, p[1]);
    return lerp(lerp(K.org2, K.gold, sstep(0.0, 0.5, n[2])), K.cream, clamp(front, 0, 1));
  }
  return K.org;
}
export function bodyColor(p, n) {
  let c = K.org;
  c = lerp(c, K.red, sstep(0.3, 0.9, n[1]) * sstep(1.05, 1.25, p[1]) * 0.45);                 // dos plus soutenu
  c = lerp(c, K.gold, sstep(0.3, 0.8, n[2]) * sstep(1.5, 1.0, p[1]) * sstep(0.4, 0.55, p[2]) * 0.6);
  const bib = sstep(0.46, 0.62, p[2]) * sstep(1.25, 1.05, p[1]) + sstep(0.2, 0.5, p[2]) * sstep(0.56, 0.44, p[1]);
  c = lerp(c, K.cream, clamp(bib, 0, 1));                                                   // plastron crème
  c = lerp(c, lerp(K.gold, K.cream, 0.5), sstep(-0.2, -0.75, n[1]) * sstep(0.72, 0.55, p[1]) * 0.9); // ventre clair
  const lk = locksAt(p, BODY_LOCKS);
  if (lk.d < 0.02 && lk.L) {
    const wl = sstep(0.02, 0.004, lk.d);
    let lc = regionColor(p, n, lk.L.col);
    if (lk.L.col === 0) lc = c;
    lc = lerp(lc, lerp(lc, lk.L.col >= 2 ? K.cream : K.gold, lk.L.col ? 0.7 : 0.35), sstep(0.5, 1.0, lk.t) * 0.7);   // pointe éclaircie
    lc = lerp(lc, lerp(lc, K.deep, 0.6), sstep(0.3, 0.0, lk.t) * 0.5);                             // racine ombrée
    c = lerp(c, lc, wl);
    // trait d'encre entre deux mèches qui se chevauchent
    const crease = sstep(0.012, 0.0, lk.d2 - lk.d) * wl;
    c = lerp(c, lerp(K.dark, K.ink, lk.L.col >= 2 ? 0 : 0.4), crease * (lk.L.col >= 2 ? 0.35 : lk.L.col ? 0.38 : 0.25));
  }
  const s = strands(p, [0, -0.5, -1], 24, 7.3);
  const occ = (0.8 + 0.2 * sstep(-0.9, 0.3, n[1])) * (0.88 + 0.12 * sstep(-0.3, 0.6, n[2]));
  return mul(c, (0.95 + s * 0.1) * occ);
}

// ---------------------------------------------------------------------------
// QUEUE : grand panache enroulé sur le dos, dessous crème
// ---------------------------------------------------------------------------
const TAIL = [[0, 1.1, -0.78], [0, 1.36, -1.06], [0, 1.72, -1.16], [0, 2.0, -0.98], [0, 2.06, -0.72], [0, 1.93, -0.55], [0, 1.74, -0.55]];
const TAIL_R = [0.12, 0.15, 0.16, 0.15, 0.12, 0.08, 0.04];
const TAIL_CURL = [0, 1.64, -0.8];
function tailCore(p) {
  let best = 1e9, bu = 0, bi = 0;
  for (let i = 0; i < TAIL.length - 1; i++) {
    const a = TAIL[i], b = TAIL[i + 1], ba = sub(b, a);
    const t = clamp(dot(sub(p, a), ba) / dot(ba, ba), 0, 1);
    const d = len(sub(p, add(a, mul(ba, t)))) - (TAIL_R[i] + (TAIL_R[i + 1] - TAIL_R[i]) * t);
    if (d < best) { best = d; bu = (i + t) / (TAIL.length - 1); bi = i; }
  }
  return { d: best, u: bu, i: bi };
}
const tailPt = (u) => { const f = u * (TAIL.length - 1), i = Math.min(TAIL.length - 2, Math.floor(f)), t = f - i; return { p: lerp(TAIL[i], TAIL[i + 1], t), tan: norm(sub(TAIL[i + 1], TAIL[i])), r: TAIL_R[i] + (TAIL_R[i + 1] - TAIL_R[i]) * t }; };
const TAIL_LOCKS = [];
{
  let k = 500;
  const nU = 14;
  for (let j = 0; j < nU; j++) {
    const u = 0.02 + j * (0.95 / (nU - 1));
    const { p: c, tan, r } = tailPt(u);
    const out = norm(sub(c, TAIL_CURL));               // vers l'extérieur de la boucle
    const side = [1, 0, 0];
    const nA = 9;
    for (let i = 0; i < nA; i++) {
      const a = (i + (j % 2) * 0.5) / nA * Math.PI * 2;
      let rd = norm(add(mul(out, Math.cos(a)), mul(side, Math.sin(a))));
      const inner = Math.cos(a) < -0.3;                 // côté intérieur (contre le dos) : mèches plus courtes
      const base = add(c, mul(rd, r * 0.75));
      const L = (0.4 - 0.12 * sstep(0.65, 1.0, u)) * (inner ? 0.55 : 1) * (0.85 + 0.3 * hash1(k++)) * (0.8 + 0.2 * sstep(0.0, 0.2, u));
      const dir = norm(add(add(mul(tan, 1.0), mul(rd, 0.6)), mul(out, 0.45)));
      TAIL_LOCKS.push(makeLock(base, rd, dir, L, (0.115 - 0.035 * u) * (inner ? 0.8 : 1), { tip: 0.028, lift: inner ? 0.25 : 0.5, droop: 0.12, flat: 1.6, col: Math.cos(a) > 0.2 ? 1 : 0, id: k }));
    }
  }
}
export function tail(p) {
  const tc = tailCore(p);
  let d = tc.d;
  if (d > 0.5) return d;
  const lk = locksAt(p, TAIL_LOCKS);
  return smin(d, lk.d, 0.035);
}
export function tailColor(p, n) {
  const tc = tailCore(p);
  let c = lerp(K.org, K.org2, sstep(0.3, 0.9, tc.u) * 0.5);
  const lk = locksAt(p, TAIL_LOCKS);
  // dessous et intérieur de la boucle crème, bout pâle
  const toC = norm(sub(TAIL_CURL, p));
  const under = sstep(0.0, -0.6, dot(n, toC)) * sstep(0.08, 0.3, tc.u) * 0.75 + sstep(0.8, 1.0, tc.u) * 0.5;
  c = lerp(c, lerp(K.gold, K.cream, 0.45), clamp(under, 0, 0.8));
  if (lk.L && lk.d < 0.02) {
    const wl = sstep(0.02, 0.004, lk.d);
    let lc = lk.L.col ? lerp(c, K.cream, 0.35) : c;
    lc = lerp(lc, lerp(lc, K.gold, 0.5), sstep(0.55, 1.0, lk.t) * 0.4);
    lc = lerp(lc, lerp(lc, K.deep, 0.4), sstep(0.3, 0.0, lk.t) * 0.35);
    c = lerp(c, lc, wl);
    c = lerp(c, lerp(K.dark, c, 0.3), sstep(0.01, 0.0, lk.d2 - lk.d) * wl * 0.45);
  }
  return mul(c, 0.94 + strands(p, [0, 1, 0], 26, 3.1) * 0.12);
}
export const tailBox = [[-0.5, 0.9, -1.45], [0.5, 2.45, -0.15]];

// ---------------------------------------------------------------------------
// PATTES : avant épaisses frangées derrière, arrière avec cuisse et culotte
// ---------------------------------------------------------------------------
function legBase(p, x, z, back) {
  const sx = Math.sign(x);
  if (!back) {
    x = x * 1.35;
    let d = ell(p, [x, 0.68, z + 0.0], [0.14, 0.27, 0.17]);                               // bras (dans le corps)
    d = smin(d, rcone(p, [x, 0.48, z + 0.0], [x, 0.18, z + 0.02], 0.142, 0.102), 0.07);    // avant-bras musclé
    d = smin(d, rcone(p, [x, 0.18, z + 0.02], [x, 0.08, z + 0.08], 0.102, 0.1), 0.04);  // métacarpe incliné
    d = smin(d, ell(p, [x, 0.074, z + 0.11], [0.118, 0.074, 0.14]), 0.05);              // pied rond
    return d;
  }
  x = x * 1.22;
  let d = ell(p, [x + sx * 0.02, 0.72, z - 0.02], [0.17, 0.3, 0.28]);                       // cuisse
  d = smin(d, rcone(p, [x, 0.56, z - 0.08], [x, 0.24, z - 0.22], 0.135, 0.08), 0.07);       // jambe
  d = smin(d, rcone(p, [x, 0.24, z - 0.22], [x, 0.1, z - 0.12], 0.08, 0.09), 0.03);         // jarret
  d = smin(d, ell(p, [x, 0.072, z - 0.08], [0.108, 0.072, 0.13]), 0.04);                   // pied rond
  return d;
}
function legLocks(x0, z, back) {
  const out = [];
  const x = x0 * (back ? 1.22 : 1.35);
  const f = (p) => legBase(p, x0, z, back);
  let k = Math.round((x + 1) * 100 + (z + 1) * 1000);
  const sx = Math.sign(x);
  const put = (base, dir, L, w, o) => { if (base) out.push(makeLock(base, gradOf(f, base), dir, L, w, o)); };
  if (!back) {
    // franges derrière l'avant-bras
    for (let y = 0.56; y > 0.22; y -= 0.075) for (const ax of [-0.6, 0, 0.6]) {
      const from = [x + ax * 0.25, y, z - 0.5];
      put(hit(f, from, [x, y, z + 0.02]), [0, -0.75, -0.6], 0.15 * (0.85 + 0.3 * hash1(k++)), 0.06, { lift: 0.45, droop: 0.35, col: 3 });
    }
    // côté et devant : mèches couchées vers le bas
    for (let y = 0.6; y > 0.2; y -= 0.1) for (const a of [-1.3, -0.4, 0.5, 1.4]) {
      const r = [Math.sin(a), 0, Math.cos(a)];
      put(hit(f, add([x, y + (hash1(k++) - 0.5) * 0.03, z], mul(r, 0.5)), [x, y, z]), [0, -1, 0], 0.13, 0.06, { lift: 0.12, droop: 0.1, col: 0 });
    }
  } else {
    // culotte : grosses mèches derrière la cuisse, pendantes
    for (let y = 0.92; y > 0.34; y -= 0.09) for (const ax of [-0.9, -0.3, 0.3, 0.9]) {
      const from = [x + ax * 0.3, y, z - 0.8];
      const L = (0.2 + 0.1 * sstep(0.85, 0.5, y)) * (0.85 + 0.3 * hash1(k++));
      put(hit(f, from, [x, y, z - 0.02]), [ax * 0.25, -0.8, -0.55], L, 0.075, { lift: 0.4, droop: 0.45, col: y < 0.62 ? 3 : 4 });
    }
    // flanc de la cuisse : mèches couchées vers le bas et l'arrière
    for (let y = 0.95; y > 0.45; y -= 0.11) for (const dz of [0.14, 0.0, -0.14]) {
      put(hit(f, [x + sx * 0.6, y, z + dz - 0.04], [x, y, z + dz - 0.04]), [0, -0.8, -0.6], 0.17, 0.07, { lift: 0.14, droop: 0.15, col: 0 });
    }
    // devant de la jambe
    for (let y = 0.6; y > 0.3; y -= 0.1) put(hit(f, [x, y, z + 0.5], [x, y, z - 0.12]), [0, -1, 0.1], 0.12, 0.055, { lift: 0.12, col: 0 });
  }
  return out;
}
export function legSdf(x, z, back) {
  const locks = legLocks(x, z, back);
  const f = (p) => {
    let d = legBase(p, x, z, back);
    if (d > 0.3) return d;
    const lk = locksAt(p, locks);
    return smin(d, lk.d, 0.025);
  };
  f.locks = locks;
  return f;
}
export function legColorFn(x0, z, back, locks) {
  const x = x0 * (back ? 1.22 : 1.35);
  return (p, n) => {
    let c = lerp(K.org, K.gold, sstep(0.5, 0.2, p[1]) * 0.8);
    c = lerp(c, K.cream, sstep(0.0, -0.6, n[2]) * sstep(0.7, 0.4, p[1]) * 0.6);         // arrière des pattes clair
    c = lerp(c, K.cream, sstep(0.24, 0.12, p[1]) * 0.85);                                 // pieds crème
    if (!back) c = lerp(c, K.cream, sstep(0.3, 0.8, n[2]) * sstep(0.42, 0.2, p[1]) * 0.5);
    const lk = locksAt(p, locks);
    if (lk.L && lk.d < 0.02) {
      const wl = sstep(0.02, 0.004, lk.d);
      let lc = lk.L.col === 3 ? lerp(K.gold, K.cream, 0.6) : lk.L.col === 4 ? lerp(K.org2, K.gold, 0.6) : c;
      lc = lerp(lc, lerp(lc, K.cream, 0.7), sstep(0.5, 1.0, lk.t) * 0.7);
      lc = lerp(lc, lerp(lc, K.deep, 0.5), sstep(0.3, 0.0, lk.t) * 0.4);
      c = lerp(c, lc, wl);
      c = lerp(c, lerp(K.dark, c, 0.3), sstep(0.01, 0.0, lk.d2 - lk.d) * wl * 0.5);
    }
    // doigts : traits sombres sur le dessus du pied
    if (p[1] < 0.13) {
      const fz = back ? z - 0.08 : z + 0.11;
      const ax = (p[0] - x) / 0.11;
      const toe = sstep(0.05, 0.0, Math.abs(Math.abs(ax) - 0.33)) * sstep(fz + 0.02, fz + 0.09, p[2]) * sstep(0.02, 0.06, p[1]);
      c = lerp(c, K.cream2, toe * 0.8);
      c = lerp(c, lerp(K.dark, K.cream2, 0.4), toe * 0.5);
    }
    const occ = (0.8 + 0.2 * sstep(-0.9, 0.3, n[1]));
    return mul(c, occ * (0.95 + strands(p, [0, -1, -0.3], 26, 1.7) * 0.1));
  };
}

// ---------------------------------------------------------------------------
// HARNAIS : sangles en Y sur le poitrail, sangle ventrale, couverture
// turquoise bordée d'or, selle brune, sacoches. Coques posées sur le corps.
// ---------------------------------------------------------------------------
const H = { br: lin(0x5a2e16), br2: lin(0x7a4222), brL: lin(0x9a5a2e), gold: lin(0xe8b84a), gold2: lin(0xfff0a0), teal: lin(0x1f8c88), teal2: lin(0x146a6a), gem: lin(0x40d0d8) };
export const MEDAL = (() => { const h = hit(body, [0, 0.73, 1.4], [0, 0.73, 0.3]); return { c: h, n: gradOf(bodyBase, h) }; })();
function bagSdf(p) {
  // sacoche : boîte arrondie bombée, rabat
  const ax = Math.abs(p[0]);
  const q = [ax - 0.4, p[1] - 0.86, p[2] + 0.34];
  const b = [0.06, 0.12, 0.13], r = 0.045;
  const dq = [Math.abs(q[0]) - b[0] + r, Math.abs(q[1]) - b[1] + r, Math.abs(q[2]) - b[2] + r];
  let d = len([Math.max(dq[0], 0), Math.max(dq[1], 0), Math.max(dq[2], 0)]) + Math.min(Math.max(dq[0], dq[1], dq[2]), 0) - r;
  d = smin(d, ell(p, [Math.sign(p[0]) * 0.42, 0.87, -0.34], [0.07, 0.11, 0.12]), 0.04);
  // rabat
  const fl = [ax - 0.465, p[1] - 0.95, p[2] + 0.34];
  const df = Math.max(Math.abs(fl[0]) - 0.02, Math.abs(fl[2]) - 0.135, Math.abs(fl[1]) - 0.06);
  return smin(d, df - 0.008, 0.02);
}
function strapD(p) {
  let d = 1e9;
  for (const P of STRAP_PATHS) for (let i = 0; i < P.pts.length - 1; i++) d = Math.min(d, rcone(p, P.pts[i], P.pts[i + 1], P.w, P.w));
  return d;
}
export function harnessParts(p) {
  const bb = bodyBase(p);
  if (bb > 0.25 && Math.abs(p[0]) < 0.3) return { d: bb - 0.2, k: 0 };
  // couverture (coque fine) et selle (plus épaisse, au-dessus)
  const bx = blanketBox(p);
  const blanket = smax(Math.abs(bb - 0.045) - 0.02, bx, 0.01);
  const sfp = (Math.hypot((p[2] + 0.12) / 0.25, (p[1] - 1.42) / 0.31) - 1) * 0.2;
  let saddle = smax(Math.abs(bb - 0.08) - 0.03, sfp, 0.02);
  saddle = smin(saddle, ell(p, [0, 1.3, -0.3], [0.15, 0.08, 0.06]), 0.04);              // troussequin
  saddle = smin(saddle, ell(p, [0, 1.29, 0.05], [0.11, 0.06, 0.05]), 0.04);             // pommeau
  saddle = Math.max(saddle, p[1] - 1.39);                                               // dessus plat pour Matcha
  // sangles : posées sur la fourrure (champ complet du corps) près de leur trajet
  let sd = strapD(p);
  if (sd < 0.2) sd = strapD(sub(p, mul(gradOf(bodyBase, p, 0.004), bb)));         // distance mesurée sur la peau
  const g1p = Math.abs(dot(sub(p, GIRTH1.c), GIRTH1.n)) - GIRTH1.w, g2p = Math.abs(dot(sub(p, GIRTH2.c), GIRTH2.n)) - GIRTH2.w;
  const md = len(sub(p, MEDAL.c));
  let yStr = 1e9, g1 = 1e9, g2 = 1e9;
  if (Math.min(sd, g1p, g2p, md - 0.1) < 0.06) {
    const fb = body(p);
    const shell = Math.abs(fb - 0.012) - 0.017;
    yStr = smax(shell, sd * 0.7, 0.006);
    g1 = smax(shell, Math.max(g1p, bx < 0 ? 1 : -1, p[1] - 1.1), 0.006);
    g2 = smax(shell, Math.max(g2p, bx < 0 ? 1 : -1, p[1] - 1.1), 0.006);
  }
  const medal = Math.max(Math.abs(dot(sub(p, MEDAL.c), MEDAL.n) - 0.02) - 0.02, md - 0.075);
  const bag = bagSdf(p);
  const parts = [[blanket, 1], [saddle, 2], [yStr, 3], [g1, 3], [g2, 3], [medal, 4], [bag, 5]];
  let d = 1e9, kk = 0;
  for (const [v, id] of parts) if (v < d) { d = v; kk = id; }
  return { d, k: kk };
}
export const harness = (p) => harnessParts(p).d;
export function harnessColor(p, n) {
  const P = harnessParts(p);
  const bb = bodyBase(p);
  let c;
  if (P.k === 1) {
    const edge = -blanketBox(p);
    c = edge < 0.03 ? lerp(H.gold, H.gold2, sstep(0.2, 0.8, n[1]) * 0.4) : lerp(H.teal2, H.teal, sstep(-0.2, 0.6, n[1]));
    if (edge > 0.03 && edge < 0.042) c = H.teal2;
  } else if (P.k === 2) {
    c = lerp(H.br2, H.brL, sstep(0.2, 0.9, n[1]) * 0.6);
    // couture et rivets dorés
    const sfp = (Math.hypot((p[2] + 0.12) / 0.25, (p[1] - 1.42) / 0.31) - 1) * 0.2;
    if (Math.abs(sfp + 0.018) < 0.004) c = lerp(c, H.gold, 0.6);
    for (const sx of [-1, 1]) if (len(sub(p, [sx * 0.22, 1.2, -0.12])) < 0.028) c = H.gold;
  } else if (P.k === 3) {
    c = lerp(H.br, H.br2, sstep(-0.2, 0.7, n[1]) * 0.6);
    // boucles dorées sur les sangles ventrales
    if (p[1] > 0.6 && p[1] < 0.68 && Math.abs(p[0]) > 0.22) c = lerp(H.gold, H.gold2, 0.3);
  } else if (P.k === 4) {
    const r = len(sub(p, MEDAL.c));
    c = r < 0.05 ? lerp(H.teal, H.gem, sstep(0.4, 0.9, n[1] + n[2] * 0.3)) : lerp(H.gold, H.gold2, sstep(0.3, 0.9, n[1]));
  } else {
    c = lerp(H.br2, H.brL, sstep(0.0, 0.8, n[1]) * 0.5);
    if (p[1] > 0.9) c = lerp(H.br, H.br2, 0.5);                                         // rabat
    if (Math.abs(p[2] + 0.34) < 0.022 && Math.abs(p[1] - 0.9) < 0.025) c = H.gold;      // fermoir
  }
  void bb;
  return mul(c, 0.82 + 0.18 * sstep(-0.6, 0.6, n[1]));
}
export const harnessBox = [[-0.56, 0.4, -0.62], [0.56, 1.5, 0.92]];
