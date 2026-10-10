/*
 * Génère les modèles sculptés d'Ainu (eurasier roux) et de Matcha (pinscher
 * nain) : public/adventure/assets/dogs.json
 * Usage : node tools/build-dogs.mjs
 */
import fs from 'node:fs';
import { ell, rcone, flatCone, smin, smax, strands, noise, mesh, pack, sstep, clamp, norm, sub, add, mul, dot, len, mixv } from './sculpt.mjs';

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const C = {
  red: lin(0xcc5520), org: lin(0xe8732e), gold: lin(0xf8b058), cream: lin(0xfbe0b4), dark: lin(0x6a2408), earIn: lin(0xf4b890),
  blk: lin(0x16131c), blk2: lin(0x2c2a3c), tan: lin(0xc2622a), tan2: lin(0xe08a44),
};
const lerp = mixv;

// Mèches : profil de touffe (pointe vers la direction du peigné)
function lockField(p, comb, freq, seed) {
  const c = norm(comb);
  const along = dot(p, c);
  const sel = strands(p, c, freq, seed);                       // quelles mèches ressortent
  const off = noise(p[0] * freq * 0.7 + seed, p[1] * freq * 0.7, p[2] * freq * 0.7) * 1.7;
  let s = (along * freq * 0.55 + off) % 1; if (s < 0) s += 1;   // dent de scie le long du peigné
  return sstep(0.0, 0.8, s) * sstep(1.0, 0.8, s) * sstep(0.3, 0.62, sel);
}
// Variation peinte des couleurs (coups de pinceau dans le sens du poil)
function stroke(p, comb, freq) { return strands(p, comb, freq, 7.3); }

// ---------------------------------------------------------------------------
// AINU — repère : sol y = 0, avant +z. Pivots utilisés par le jeu :
// tête (0,1.6,0.78) ; queue (0,1.15,-0.72) ; pattes (±0.2,0.8,0.42) et (±0.21,0.8,-0.46)
// ---------------------------------------------------------------------------
const RUFF_C = [0, 1.36, 0.6];
function ainuBodyBase(p) {
  let d = ell(p, [0, 1.0, -0.06], [0.37, 0.38, 0.62]);
  d = smin(d, ell(p, [0, 1.02, 0.36], [0.37, 0.43, 0.36]), 0.12);
  d = smin(d, ell(p, [0, 0.99, -0.48], [0.36, 0.37, 0.33]), 0.1);
  d = smin(d, ell(p, RUFF_C, [0.47, 0.46, 0.34]), 0.14);          // grosse collerette autour du cou
  d = smin(d, ell(p, [0, 1.06, 0.62], [0.3, 0.34, 0.24]), 0.1);   // plastron
  return d;
}
function ainuBodyComb(p) {
  const r = sub(p, RUFF_C);
  const wr = sstep(0.75, 0.35, len([r[0], r[1], r[2] * 1.4]));
  const back = [0, -0.35, -1];
  const radial = norm([r[0], r[1] - 0.25, -0.5]);
  const chest = p[2] > 0.55 && p[1] < 1.2 ? [0, -1, 0.25] : null;
  let c = lerp(back, radial, wr);
  if (chest) c = lerp(c, chest, sstep(0.55, 0.75, p[2]));
  return norm(c);
}
function ainuBody(p) {
  const d = ainuBodyBase(p);
  if (d > 0.12) return d;
  return d - 0.045 * lockField(p, ainuBodyComb(p), 9, 1.3);
}
function ainuBodyColor(p, n) {
  let c = C.org;
  c = lerp(c, C.red, sstep(0.0, 0.8, n[1]) * sstep(1.2, 1.38, p[1]) * 0.5);           // dos plus foncé
  c = lerp(c, C.gold, sstep(0.25, 0.75, n[2]) * sstep(1.45, 0.9, p[1]) * 0.9);         // poitrail doré
  c = lerp(c, C.cream, sstep(0.72, 0.9, p[2]) * sstep(1.0, 0.75, p[1]) * 0.8);         // bas du plastron crème
  c = lerp(c, C.gold, sstep(-0.3, -0.85, n[1]) * 0.6);                                 // ventre
  const s = stroke(p, ainuBodyComb(p), 22);
  return mul(c, 0.92 + s * 0.2);
}

const HEAD_C = [0, 1.62, 0.8];
function ainuHeadBase(p) {
  let d = ell(p, HEAD_C, [0.3, 0.28, 0.29]);
  d = smin(d, ell(p, [0, 1.5, 1.04], [0.15, 0.11, 0.19]), 0.09);           // museau
  d = smin(d, ell(p, [0, 1.42, 0.97], [0.11, 0.06, 0.12]), 0.06);           // mâchoire
  for (const sx of [-1, 1]) {
    d = smin(d, ell(p, [sx * 0.23, 1.5, 0.82], [0.2, 0.18, 0.16]), 0.08);   // joues duveteuses
    d = smin(d, flatCone(p, [sx * 0.16, 1.8, 0.76], [sx * 0.24, 1.95, 0.74], 0.07, 0.014, [0, 0.15, 1], 2.4), 0.03); // oreilles
  }
  d = smin(d, ell(p, [0, 1.62, 0.66], [0.32, 0.3, 0.22]), 0.08);           // arrière du crâne
  return d;
}
function ainuHeadComb(p) {
  const r = sub(p, [0, 1.58, 0.85]);
  return norm([r[0] * 1.2, r[1] * 0.6 - 0.35, -0.6]);
}
function ainuHead(p) {
  const d = ainuHeadBase(p);
  if (d > 0.1) return d;
  // poils sur les joues et l'arrière de la tête (pas sur le museau ni les oreilles)
  const mask = sstep(1.0, 0.9, p[2]) * sstep(1.86, 1.75, p[1]);
  return d - 0.04 * mask * lockField(p, ainuHeadComb(p), 11, 4.1);
}
function ainuHeadColor(p, n) {
  let c = C.org;
  c = lerp(c, C.red, sstep(1.66, 1.86, p[1]) * 0.6);
  // oreilles : bord foncé, intérieur clair
  const ear = p[1] > 1.78 && Math.abs(p[0]) > 0.12;
  if (ear) c = n[2] > 0.45 && Math.abs(Math.abs(p[0]) - (0.16 + (p[1] - 1.8) * 0.5)) < 0.035 ? C.earIn : lerp(C.red, C.dark, sstep(1.88, 1.96, p[1]));
  // masque : museau et bas des joues dorés/crème
  c = lerp(c, C.gold, sstep(0.88, 1.0, p[2]) * sstep(1.66, 1.52, p[1]));
  c = lerp(c, C.cream, sstep(0.98, 1.08, p[2]) * sstep(1.56, 1.46, p[1]));
  c = lerp(c, C.gold, sstep(0.1, 0.25, Math.abs(p[0])) * sstep(1.52, 1.4, p[1]) * 0.8);
  // joues claires sous les yeux (masque du spitz)
  c = lerp(c, C.cream, sstep(0.86, 0.98, p[2]) * sstep(1.6, 1.5, p[1]) * sstep(0.06, 0.12, Math.abs(p[0])) * 0.7);
  // sourire : un trait sombre qui remonte vers les joues
  const ax = Math.abs(p[0]);
  const smileY = 1.44 + ax * ax * 3.2;
  if (p[2] > 0.95 && ax < 0.14) c = lerp(c, lin(0x2a0c04), sstep(0.02, 0.009, Math.abs(p[1] - smileY)));
  if (p[2] > 1.08 && ax < 0.012) c = lerp(c, C.dark, sstep(1.5, 1.46, p[1]) * sstep(1.43, 1.46, p[1]));
  const s = stroke(p, ainuHeadComb(p), 28);
  return mul(c, 0.88 + s * 0.22);
}

// Queue : panache épais enroulé sur le dos
const TAIL = [[0, 1.12, -0.7], [0, 1.38, -0.88], [0, 1.68, -0.8], [0, 1.82, -0.56], [0, 1.74, -0.3], [0, 1.58, -0.18]];
const TAIL_R = [0.1, 0.16, 0.2, 0.19, 0.15, 0.08];
function tailInfo(p) {
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < TAIL.length - 1; i++) {
    const a = TAIL[i], b = TAIL[i + 1], ba = sub(b, a);
    const t = clamp(dot(sub(p, a), ba) / dot(ba, ba), 0, 1);
    const q = sub(p, add(a, mul(ba, t)));
    const d = len(q) - (TAIL_R[i] + (TAIL_R[i + 1] - TAIL_R[i]) * t);
    if (d < best) { best = d; bi = i; bt = t; }
  }
  const tan = norm(sub(TAIL[bi + 1], TAIL[bi]));
  return { d: best, u: (bi + bt) / (TAIL.length - 1), tan };
}
function ainuTail(p) {
  const { d, tan } = tailInfo(p);
  if (d > 0.12) return d;
  return d - 0.06 * lockField(p, tan, 8, 9.2);
}
function ainuTailColor(p, n) {
  const { u, tan } = tailInfo(p);
  let c = lerp(C.org, C.gold, sstep(0.3, 0.9, u));
  // dessous / intérieur du panache crème
  c = lerp(c, C.cream, sstep(0.0, -0.7, n[1]) * sstep(0.35, 0.6, u) * 0.8 + sstep(0.85, 1.0, u) * 0.5);
  return mul(c, 0.86 + stroke(p, tan, 20) * 0.28);
}

// Pattes
function legBase(p, x, z, back) {
  if (!back) {
    let d = ell(p, [x, 0.74, z], [0.16, 0.25, 0.16]);
    d = smin(d, rcone(p, [x, 0.6, z + 0.01], [x, 0.1, z + 0.03], 0.12, 0.1), 0.06);
    d = smin(d, ell(p, [x, 0.06, z + 0.07], [0.11, 0.07, 0.14]), 0.04);
    return d;
  }
  let d = ell(p, [x, 0.8, z], [0.19, 0.27, 0.23]);
  d = smin(d, rcone(p, [x, 0.62, z - 0.06], [x, 0.32, z - 0.12], 0.13, 0.1), 0.06);
  d = smin(d, rcone(p, [x, 0.32, z - 0.12], [x, 0.08, z - 0.05], 0.1, 0.09), 0.04);
  d = smin(d, ell(p, [x, 0.06, z + 0.01], [0.11, 0.07, 0.14]), 0.04);
  return d;
}
function legSdf(x, z, back) {
  return (p) => {
    const d = legBase(p, x, z, back);
    if (d > 0.1) return d;
    // franges à l'arrière des pattes, « culotte » sur les cuisses
    const backSide = sstep(0.0, -0.08, p[2] - z + (back ? 0.02 : 0));
    const amp = back ? 0.05 * sstep(0.35, 0.6, p[1]) + 0.03 * backSide : 0.035 * backSide * sstep(0.15, 0.4, p[1]);
    return d - amp * lockField(p, [0, -1, -0.5], 10, x * 3 + z);
  };
}
function legColor(p, n) {
  let c = lerp(C.org, C.gold, sstep(0.35, 0.1, p[1]));
  c = lerp(c, C.cream, sstep(0.14, 0.04, p[1]) * 0.7);
  return mul(c, 0.88 + stroke(p, [0, -1, -0.3], 24) * 0.22);
}

// ---------------------------------------------------------------------------
// MATCHA — repère : pattes au sol en y = 0, avant +z. Tête pivot (0,0.56,0.27)
// ---------------------------------------------------------------------------
function matchaBody(p) {
  let d = ell(p, [0, 0.24, -0.01], [0.095, 0.105, 0.2]);
  d = smin(d, ell(p, [0, 0.28, 0.14], [0.088, 0.115, 0.09]), 0.05);
  d = smin(d, rcone(p, [0, 0.31, 0.17], [0, 0.48, 0.25], 0.06, 0.048), 0.04);   // cou fier
  for (const sx of [-1, 1]) for (const [z, back] of [[0.13, 0], [-0.14, 1]]) {
    const x = sx * 0.06;
    d = smin(d, ell(p, [x, 0.21, z - (back ? 0.01 : 0)], [0.045, 0.07, back ? 0.06 : 0.045]), 0.03);
    d = smin(d, rcone(p, [x, 0.17, z + (back ? -0.02 : 0.01)], [x, 0.015, z + 0.01], 0.027, 0.02), 0.02);
    d = smin(d, ell(p, [x, 0.012, z + 0.025], [0.026, 0.015, 0.034]), 0.012);
  }
  d = smin(d, rcone(p, [0, 0.29, -0.2], [0, 0.4, -0.26], 0.025, 0.014), 0.02);  // queue courte relevée
  return d;
}
function matchaBodyColor(p, n) {
  let c = lerp(C.blk, C.blk2, sstep(0.3, 0.9, n[1]) * 0.6);
  c = lerp(c, C.tan, sstep(0.12, 0.2, p[2]) * sstep(0.38, 0.22, p[1]));    // poitrail feu
  c = lerp(c, C.tan, sstep(0.16, 0.12, p[1]) * sstep(-0.05, 0.05, n[2] + 0.3) * 0.0);
  c = lerp(c, C.tan, sstep(0.11, 0.06, p[1]));                            // bas des pattes
  return c;
}
function matchaHead(p) {
  let d = ell(p, [0, 0.56, 0.27], [0.09, 0.085, 0.09]);
  d = smin(d, rcone(p, [0, 0.535, 0.32], [0, 0.515, 0.43], 0.048, 0.027), 0.04);   // museau fin
  for (const sx of [-1, 1]) {
    d = Math.min(d, flatCone(p, [sx * 0.06, 0.615, 0.255], [sx * 0.145, 0.8, 0.24], 0.04, 0.006, [sx * 0.2, 0.1, 1], 3.0)); // grandes oreilles bien séparées
  }
  return d;
}
function matchaHeadColor(p, n) {
  let c = lerp(C.blk, C.blk2, sstep(0.3, 0.9, n[1]) * 0.6);
  const ax = Math.abs(p[0]);
  // oreilles : intérieur rose-feu (face avant), bord noir
  if (p[1] > 0.635 && ax > 0.04) {
    const t = (p[1] - 0.615) / 0.185, axisX = 0.06 + t * 0.085, half = 0.034 * (1 - t);
    const inner = sstep(half * 0.95, half * 0.55, Math.abs(ax - axisX)) * sstep(0.1, 0.4, n[2]);
    c = lerp(c, lin(0xe89a84), inner * 0.9);
  }
  // marques feu : museau, joues, points au-dessus des yeux
  c = lerp(c, C.tan, sstep(0.33, 0.37, p[2]) * sstep(0.545, 0.52, p[1]));
  c = lerp(c, C.tan, sstep(0.28, 0.33, p[2]) * sstep(0.53, 0.505, p[1]) * sstep(0.03, 0.06, ax));
  c = lerp(c, C.tan, sstep(0.022, 0.012, Math.hypot(ax - 0.04, p[1] - 0.6)) * sstep(0.32, 0.34, p[2] + 0.02));
  return c;
}

// ---------------------------------------------------------------------------
const LITE = process.argv.includes('--lite');
const out = { version: 1, parts: {} };
const H = LITE ? 0.026 : 0.017;
const t0 = Date.now();
const run = (name, sdf, col, bmin, bmax, h) => {
  const m = mesh(sdf, col, bmin, bmax, (h || H) * (LITE ? 1.6 : 1));
  out.parts[name] = pack(m);
  console.log(name, m.pos.length, 'sommets', m.idx.length / 3, 'triangles');
};
run('body', ainuBody, ainuBodyColor, [-0.55, 0.45, -0.95], [0.55, 1.95, 1.0]);
run('head', ainuHead, ainuHeadColor, [-0.42, 1.25, 0.4], [0.42, 2.1, 1.25], 0.012);
run('tail', ainuTail, ainuTailColor, [-0.32, 0.9, -1.15], [0.32, 2.1, 0.0]);
for (const [name, x, z, back] of [['legFL', -0.2, 0.42, 0], ['legFR', 0.2, 0.42, 0], ['legBL', -0.21, -0.46, 1], ['legBR', 0.21, -0.46, 1]]) {
  run(name, legSdf(x, z, back), legColor, [x - 0.28, -0.05, z - 0.4], [x + 0.28, 1.12, z + 0.3]);
}
run('mBody', matchaBody, matchaBodyColor, [-0.15, -0.02, -0.32], [0.15, 0.56, 0.33], 0.006);
run('mHead', matchaHead, matchaHeadColor, [-0.18, 0.45, 0.15], [0.18, 0.88, 0.47], 0.005);
fs.writeFileSync(new URL('../public/adventure/assets/' + (LITE ? 'dogs-lite.json' : 'dogs.json'), import.meta.url), JSON.stringify(out));
console.log('fini en', (Date.now() - t0) / 1000, 's');
