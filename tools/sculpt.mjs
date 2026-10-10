/*
 * Outils de « sculpture » procédurale : champs de distance signée (SDF),
 * union lisse, poils en touffes, puis extraction d'un maillage lisse
 * (surface nets + projection sur la surface). Utilisé hors ligne pour
 * générer les modèles d'Ainu et Matcha.
 */
export const v3 = (x, y, z) => [x, y, z];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mixv = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Ellipsoïde (approximation classique). */
export function ell(p, c, r) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const k0 = len(q);
  const k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
/** Cône arrondi entre a (rayon ra) et b (rayon rb). */
export function rcone(p, a, b, ra, rb) {
  const ba = sub(b, a), pa = sub(p, a);
  const l2 = dot(ba, ba);
  const t = clamp(dot(pa, ba) / l2, 0, 1);
  // approximation suffisante : interpolation du rayon le long du segment
  const q = sub(pa, mul(ba, t));
  return len(q) - (ra + (rb - ra) * t);
}
/** Cône arrondi aplati (oreilles) : épaisseur réduite selon l'axe n. */
export function flatCone(p, a, b, ra, rb, n, k) {
  const pa = sub(p, a), d = dot(pa, n);
  const q = add(a, sub(pa, mul(n, d * (1 - 1 / k))));
  return rcone(q, a, b, ra, rb) * Math.min(1, k * 0.7);
}
export function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
export function smax(a, b, k) { return -smin(-a, -b, k); }

// Bruit de valeur 3D
function hash(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
export function noise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
           l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
/**
 * Champ de mèches : bruit étiré le long de la direction du peigné, ce qui
 * donne des mèches allongées. Retourne 0..1 (1 = pointe de mèche).
 */
export function strands(p, comb, freq, seed) {
  const c = norm(comb);
  const along = dot(p, c);
  const q = sub(p, mul(c, along * 0.72)); // compressé le long du peigné → mèches
  const n = noise(q[0] * freq + seed, q[1] * freq, q[2] * freq) * 0.65 + noise(q[0] * freq * 2.1, q[1] * freq * 2.1 + seed, q[2] * freq * 2.1) * 0.35;
  return n;
}

/**
 * Extraction du maillage : surface nets sur une grille, puis chaque sommet est
 * projeté sur la surface (Newton) ; normales = gradient du champ.
 */
export function mesh(sdf, colorFn, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const I = (x, y, z) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) F[I(x, y, z)] = sdf([bmin[0] + x * h, bmin[1] + y * h, bmin[2] + z * h]);
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const v = corners.map(([a, b, c]) => F[I(x + a, y + b, z + c)]);
    let neg = 0; for (const d of v) if (d < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const d0 = v[e0], d1 = v[e1];
      if ((d0 < 0) === (d1 < 0)) continue;
      const t = d0 / (d0 - d1);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; n++;
    }
    vid[I(x, y, z)] = pos.length;
    pos.push([bmin[0] + (x + sx / n) * h, bmin[1] + (y + sy / n) * h, bmin[2] + (z + sz / n) * h]);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (!flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const d0 = F[I(x, y, z)];
    // arête selon x
    if (x < nx - 1) { const d1 = F[I(x + 1, y, z)]; if ((d0 < 0) !== (d1 < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[I(x, y, z)], vid[I(x, y - 1, z)], d0 < 0); }
    if (y < ny - 1) { const d1 = F[I(x, y + 1, z)]; if ((d0 < 0) !== (d1 < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[I(x, y, z)], vid[I(x, y, z - 1)], d0 < 0); }
    if (z < nz - 1) { const d1 = F[I(x, y, z + 1)]; if ((d0 < 0) !== (d1 < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[I(x, y, z)], vid[I(x - 1, y, z)], d0 < 0); }
  }
  // projection + normales
  const e = h * 0.25;
  const grad = (p) => norm([sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e])]);
  const nrm = [];
  for (let i = 0; i < pos.length; i++) {
    let p = pos[i];
    for (let k = 0; k < 2; k++) { const d = sdf(p); if (Math.abs(d) > h) break; p = sub(p, mul(grad(p), d)); }
    pos[i] = p;
    nrm.push(grad(p));
  }
  const col = pos.map((p, i) => colorFn(p, nrm[i]));
  return { pos, nrm, col, idx };
}

/** Sérialise un maillage en tableaux compacts (base64). */
export function pack(m) {
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of m.pos) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const n = m.pos.length;
  const P = new Uint16Array(n * 3), N = new Int8Array(n * 3), C = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    P[i * 3 + k] = Math.round(((m.pos[i][k] - min[k]) / (max[k] - min[k] || 1)) * 65535);
    N[i * 3 + k] = Math.round(m.nrm[i][k] * 127);
    C[i * 3 + k] = Math.round(clamp(m.col[i][k], 0, 1) * 255);
  }
  const Ix = n > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return { n, min, max, pos: b64(P), nrm: b64(N), col: b64(C), idx: b64(Ix), big: n > 65535 };
}
