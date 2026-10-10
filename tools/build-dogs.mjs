/*
 * Génère les modèles sculptés d'Ainu (eurasier roux) et de Matcha (pinscher
 * nain) : public/adventure/assets/dogs.json
 * Usage : node tools/build-dogs.mjs
 */
import fs from 'node:fs';
import * as HD from './heads.mjs';
import * as AI from './ainu.mjs';
import { ell, rcone, flatCone, smin, smax, strands, noise, mesh, pack, sstep, clamp, norm, sub, add, mul, dot, len, mixv } from './sculpt.mjs';

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const C = {
  red: lin(0xc24c1c), org: lin(0xe46c2a), gold: lin(0xf6aa5c), cream: lin(0xfde6c2), dark: lin(0x5a2008), earIn: lin(0xf6c8a4),
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
// AINU — spitz élancé. Repère : sol y = 0, avant +z. Pivots utilisés par le jeu :
// tête (0,1.6,0.78) ; queue (0,1.15,-0.72) ; pattes (±0.16,0.62,0.4) et (±0.16,0.62,-0.5)
// ---------------------------------------------------------------------------
const RUFF_C = [0, 1.24, 0.55];
function ainuBodyBase(p) {
  let d = ell(p, [0, 0.99, 0.32], [0.3, 0.37, 0.34]);                 // poitrail profond
  d = smin(d, ell(p, [0, 1.0, -0.12], [0.27, 0.29, 0.52]), 0.12);      // dos
  d = smin(d, ell(p, [0, 0.99, -0.55], [0.28, 0.3, 0.29]), 0.1);       // croupe
  d = smin(d, rcone(p, [0, 1.12, 0.45], [0, 1.47, 0.74], 0.25, 0.17), 0.1); // cou porté haut
  d = smin(d, ell(p, RUFF_C, [0.33, 0.37, 0.3]), 0.12);                // collerette
  d = smin(d, ell(p, [0, 0.96, 0.6], [0.22, 0.28, 0.17]), 0.08);       // plastron
  // dégagement sous la tête : rien ne doit apparaître dans la gueule ouverte
  d = smax(d, -ell(p, [0, 1.45, 1.0], [0.17, 0.11, 0.2]), 0.04);
  return d;
}
function ainuBodyComb(p) {
  const r = sub(p, RUFF_C);
  const wr = sstep(0.6, 0.25, len([r[0], r[1], r[2] * 1.3]));
  const back = [0, -0.3, -1];
  const radial = norm([r[0], r[1] - 0.3, -0.6]);
  let c = lerp(back, radial, wr);
  if (p[2] > 0.45 && p[1] < 1.15) c = lerp(c, [0, -1, 0.2], sstep(0.45, 0.62, p[2]));
  if (p[1] < 0.82) c = lerp(c, [0, -1, -0.4], sstep(0.82, 0.72, p[1]));
  return norm(c);
}
function ainuBody(p) {
  const d = ainuBodyBase(p);
  if (d > 0.12) return d;
  const r = sub(p, RUFF_C);
  const edge = Math.max(sstep(0.62, 0.3, len([r[0], r[1], r[2] * 1.3])), sstep(0.8, 0.7, p[1]), sstep(0.55, 0.65, p[2]) * sstep(1.15, 0.9, p[1]));
  const amp = 0.008 + 0.022 * edge;
  return d - amp * lockField(p, ainuBodyComb(p), 20, 1.3);
}
function ainuBodyColor(p, n) {
  let c = C.org;
  c = lerp(c, C.red, sstep(0.2, 0.9, n[1]) * sstep(1.15, 1.3, p[1]) * 0.45);            // dos plus soutenu
  c = lerp(c, C.gold, sstep(0.2, 0.7, n[2]) * sstep(1.5, 1.0, p[1]) * 0.8);              // devant doré
  c = lerp(c, C.cream, sstep(0.55, 0.7, p[2]) * sstep(1.12, 0.85, p[1]));                // plastron crème
  c = lerp(c, C.cream, sstep(-0.2, -0.8, n[1]) * sstep(0.9, 0.75, p[1]) * 0.85);         // ventre crème
  const s = stroke(p, ainuBodyComb(p), 26);
  const h = strands(p, ainuBodyComb(p), 50, 8.8);
  c = lerp(c, mul(c, 0.55), sstep(0.62, 0.7, h) * 0.5);
  const occ = 0.82 + 0.18 * sstep(-0.9, 0.2, n[1]);
  return mul(c, (0.94 + s * 0.12) * occ);
}

const HEAD_C = [0, 1.6, 0.82];
function ainuHeadBase(p) {
  let d = ell(p, HEAD_C, [0.29, 0.235, 0.245]);
  d = smin(d, ell(p, [0, 1.52, 1.0], [0.135, 0.095, 0.12]), 0.08);               // museau court et large
  d = smin(d, ell(p, [0, 1.47, 0.99], [0.1, 0.045, 0.1]), 0.05);                 // mâchoire
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.1, 1.68, 0.99], [0.07, 0.035, 0.05]), 0.04); // arcades
  for (const sx of [-1, 1]) {
    d = smin(d, ell(p, [sx * 0.22, 1.5, 0.8], [0.19, 0.17, 0.16]), 0.07);       // joues duveteuses (rouflaquettes)
    d = smin(d, flatCone(p, [sx * 0.17, 1.76, 0.77], [sx * 0.225, 1.875, 0.75], 0.07, 0.03, [sx * 0.2, 0.1, 1], 2.4), 0.025); // petites oreilles écartées
  }
  d = smin(d, ell(p, [0, 1.58, 0.7], [0.3, 0.27, 0.2]), 0.08);              // arrière de la tête duveteux
  return d;
}
function ainuHeadComb(p) {
  const r = sub(p, [0, 1.56, 0.86]);
  return norm([r[0] * 1.3, r[1] * 0.5 - 0.35, -0.6]);
}
function ainuHead(p) {
  const d = ainuHeadBase(p);
  if (d > 0.1) return d;
  const cheek = sstep(0.12, 0.26, Math.abs(p[0])) * sstep(1.66, 1.45, p[1]);
  const mask = sstep(1.0, 0.9, p[2]) * sstep(1.8, 1.7, p[1]);
  return d - (0.012 + 0.06 * cheek) * mask * lockField(p, ainuHeadComb(p), 13, 4.1);
}
function ainuHeadColor(p, n) {
  let c = C.org;
  c = lerp(c, C.red, sstep(1.6, 1.78, p[1]) * 0.6);
  const ax = Math.abs(p[0]);
  // oreilles : intérieur clair, pointes foncées
  if (p[1] > 1.75 && ax > 0.08) {
    const t = (p[1] - 1.75) / 0.15, axisX = 0.14 + t * 0.06, half = 0.062 * (1 - t * 0.7);
    const inner = sstep(half * 0.95, half * 0.5, Math.abs(ax - axisX)) * sstep(0.1, 0.45, n[2]);
    c = lerp(lerp(C.org, C.dark, sstep(1.85, 1.93, p[1]) * 0.8), C.earIn, inner);
  }
  // masque : sourcils dorés, museau et joues crème
  c = lerp(c, C.gold, sstep(0.9, 1.0, p[2]) * sstep(1.64, 1.56, p[1]) * 0.8);
  c = lerp(c, C.cream, sstep(0.9, 1.0, p[2]) * sstep(1.6, 1.54, p[1]));                  // masque crème sous les yeux
  c = lerp(c, C.cream, sstep(0.05, 0.13, ax) * sstep(1.58, 1.5, p[1]) * sstep(0.8, 0.95, p[2]));
  c = lerp(c, C.gold, sstep(0.16, 0.26, ax) * sstep(1.56, 1.44, p[1]) * 0.75);          // rouflaquettes dorées
  c = lerp(c, lin(0x6a2208), sstep(0.022, 0.01, Math.hypot(ax - 0.11, (p[1] - 1.685) * 2.2)) * sstep(0.93, 1.0, p[2]));  // sourcils sombres
  // babines noires : sourire qui remonte vers les joues
  const smileY = 1.465 + ax * ax * 6;
  if (p[2] > 0.98 && ax < 0.11) c = lerp(c, lin(0x1e0a04), sstep(0.016, 0.007, Math.abs(p[1] - smileY)));
  const s = stroke(p, ainuHeadComb(p), 30);
  return mul(c, 0.95 + s * 0.12);
}

// Queue : grand panache enroulé en cercle sur le dos, dessous crème
const TAIL = [[0, 1.12, -0.76], [0, 1.4, -0.96], [0, 1.72, -0.92], [0, 1.9, -0.68], [0, 1.84, -0.42], [0, 1.62, -0.34], [0, 1.48, -0.46]];
const TAIL_R = [0.1, 0.17, 0.22, 0.22, 0.19, 0.14, 0.07];
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
  if (d > 0.14) return d;
  return d - 0.07 * lockField(p, tan, 9, 9.2);
}
function ainuTailColor(p, n) {
  const { u, tan } = tailInfo(p);
  let c = lerp(C.org, C.gold, sstep(0.45, 1.0, u) * 0.55);
  // l'intérieur de la boucle (vers le dos) et le bout sont crème
  const toCenter = norm(sub([0, 1.6, -0.62], p));
  c = lerp(c, C.cream, sstep(0.1, 0.7, dot(n, toCenter)) * 0.55 + sstep(0.85, 1.0, u) * 0.6);
  return mul(c, 0.92 + stroke(p, tan, 22) * 0.2);
}

// Pattes : longues et fines, cuisses musclées à « culotte »
function legBase(p, x, z, back) {
  if (!back) {
    let d = ell(p, [x, 0.8, z], [0.11, 0.2, 0.12]);
    d = smin(d, rcone(p, [x, 0.64, z + 0.02], [x, 0.13, z + 0.03], 0.078, 0.058), 0.05);
    d = smin(d, ell(p, [x, 0.05, z + 0.07], [0.075, 0.05, 0.1]), 0.035);
    return d;
  }
  let d = ell(p, [x, 0.83, z], [0.14, 0.24, 0.2]);
  d = smin(d, rcone(p, [x, 0.66, z - 0.08], [x, 0.33, z - 0.17], 0.09, 0.058), 0.05);
  d = smin(d, rcone(p, [x, 0.33, z - 0.17], [x, 0.08, z - 0.09], 0.055, 0.052), 0.03);
  d = smin(d, ell(p, [x, 0.05, z - 0.04], [0.075, 0.05, 0.1]), 0.03);
  return d;
}
function legSdf(x, z, back) {
  return (p) => {
    const d = legBase(p, x, z, back);
    if (d > 0.1) return d;
    const backSide = sstep(0.0, -0.06, p[2] - z + (back ? 0.05 : 0));
    const amp = back ? 0.05 * sstep(0.5, 0.7, p[1]) * backSide + 0.012 : 0.03 * backSide * sstep(0.25, 0.5, p[1]) + 0.01;
    return d - amp * lockField(p, [0, -1, -0.5], 13, x * 3 + z);
  };
}
function legColor(p, n) {
  let c = lerp(C.org, C.gold, sstep(0.45, 0.15, p[1]));
  c = lerp(c, C.cream, sstep(-0.1, -0.7, n[2]) * 0.6 + sstep(0.12, 0.04, p[1]) * 0.7);   // arrière des pattes et pieds clairs
  return mul(c, 0.94 + stroke(p, [0, -1, -0.3], 26) * 0.14);
}

// ---------------------------------------------------------------------------
// MATCHA — repère : pattes au sol en y = 0, avant +z. Tête pivot (0,0.56,0.27)
// ---------------------------------------------------------------------------
function matchaBodyBase(p) {
  let d = ell(p, [0, 0.245, -0.02], [0.088, 0.1, 0.2]);                          // tronc fin
  d = smin(d, ell(p, [0, 0.27, 0.13], [0.085, 0.118, 0.095]), 0.05);             // poitrail profond
  d = smax(d, -ell(p, [0, 0.1, -0.05], [0.2, 0.06, 0.12]), 0.04);                // ventre levretté
  d = smin(d, rcone(p, [0, 0.31, 0.17], [0, 0.48, 0.25], 0.058, 0.044), 0.04);   // cou fier
  for (const sx of [-1, 1]) for (const [z, back] of [[0.13, 0], [-0.14, 1]]) {
    const x = sx * 0.058;
    d = smin(d, ell(p, [x, 0.21, z - (back ? 0.01 : 0)], [0.043, 0.075, back ? 0.065 : 0.045]), 0.03);
    d = smin(d, rcone(p, [x, 0.17, z + (back ? -0.03 : 0.01)], [x, 0.015, z + 0.01], 0.025, 0.018), 0.02);
    d = smin(d, ell(p, [x, 0.012, z + 0.025], [0.024, 0.014, 0.032]), 0.012);
  }
  d = smin(d, rcone(p, [0, 0.3, -0.2], [0, 0.4, -0.25], 0.022, 0.012), 0.02);   // queue courte relevée
  return d;
}
// Harnais orange clouté : sangles moulées sur le corps (coque épaisse limitée à des bandes)
const MN_C = [0, 0.345, 0.195], MN_N = norm([0, 0.905, 0.426]);   // anneau à la base du cou
const MG_C = [0, 0.25, 0.06], MG_N = norm([0, 0.3, 1]);           // sangle derrière les pattes avant
function harnessBand(p) {
  const neck = Math.abs(dot(sub(p, MN_C), MN_N)) - 0.02;
  const girth = Math.abs(dot(sub(p, MG_C), MG_N)) - 0.021;
  const sternum = Math.max(Math.abs(p[0]) - 0.032, 0.14 - p[2], p[1] - 0.36, 0.17 - p[1]);
  const spine = Math.max(Math.abs(p[0]) - 0.018, 0.3 - p[1], p[2] - 0.2, 0.04 - p[2]);
  // épaulières : bandes en biais du cou vers la sangle
  const sh = Math.max(Math.abs(dot(sub([Math.abs(p[0]), p[1], p[2]], [0.06, 0.3, 0.13]), norm([0, 0.55, -0.83]))) - 0.018, 0.03 - Math.abs(p[0]), p[1] - 0.36, 0.22 - p[1]);
  return Math.min(neck, girth, sternum, spine, sh);
}
// clous : posés à la surface, le long du plastron et de l'anneau du cou
const surfPt = (dir0, from) => { let t = 0; for (let i = 0; i < 80; i++) { const q = add(from, mul(dir0, t)); const d = matchaBodyBase(q); if (d < 0.0004) return q; t += Math.max(d * 0.8, 0.0008); } return add(from, mul(dir0, t)); };
const STUDS = [];
for (let i = 0; i < 6; i++) STUDS.push(surfPt([0, 0, -1], [0, 0.185 + i * 0.03, 0.4]));
for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const a = 0.5 + i * 0.32; STUDS.push(surfPt(norm([sx * Math.sin(a), 0, Math.cos(a)]), add(MN_C, [sx * Math.sin(a) * 0.3, -0.02, Math.cos(a) * 0.3]))); }
for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const a = 0.35 + i * 0.3; STUDS.push(surfPt(norm([sx * Math.sin(a), Math.cos(a) * 0.3, 0]), [sx * 0.3, 0.25 + Math.cos(a) * 0.09, 0.06 - (Math.cos(a) * 0.09) * 0.3])); }
for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) STUDS.push(surfPt([-sx, 0, 0], [sx * 0.3, 0.33 - i * 0.04, 0.155 - i * 0.026 / 0.55 * 0.83 * 0.5]));
const STUD_BIG = surfPt([0, 0, -1], [0, 0.27, 0.4]);
function harness(p, bd) {
  const shell = Math.abs(bd - 0.007) - 0.0068;
  let h = smax(shell, harnessBand(p), 0.003);
  for (const s of STUDS) h = Math.min(h, len(sub(p, s)) - 0.01);
  h = Math.min(h, len(sub(p, STUD_BIG)) - 0.014);
  return h;
}
function matchaBody(p) {
  const bd = matchaBodyBase(p);
  if (bd > 0.05) return bd;
  return Math.min(bd, harness(p, bd));
}
function matchaBodyColor(p, n) {
  const bd = matchaBodyBase(p);
  // noir bleuté, reflets bleus sur le dessus
  let c = lerp(C.blk, C.blk2, sstep(0.3, 0.95, n[1]) * 0.6);
  // feu : gorge et deux taches au poitrail, intérieur et bas des pattes
  const throat = sstep(0.15, 0.55, n[2] * 0.9 - n[1] * 0.3) * sstep(0.3, 0.34, p[1]) * sstep(0.5, 0.44, p[1]);
  const chest = sstep(0.3, 0.65, n[2]) * sstep(0.33, 0.29, p[1]) * sstep(0.17, 0.21, p[1]) * sstep(0.055, 0.035, Math.abs(p[0]));
  const legs = sstep(0.085, 0.06, p[1]) + sstep(0.15, 0.1, p[1]) * sstep(0.2, 0.6, -Math.sign(p[0]) * n[0]) * 0.9;
  const front = sstep(0.1, 0.07, p[1]) * sstep(0.3, 0.7, n[2]) * sstep(0.05, 0.12, p[2]);
  c = lerp(c, C.tan, clamp(throat + chest + legs + front, 0, 1));
  c = mul(c, 0.82 + 0.18 * sstep(-0.8, 0.3, n[1]));
  // harnais
  if (bd > 0.0006) {
    const hb = harnessBand(p);
    let hc = lerp(lin(0x4a1e0c), lin(0xb4521c), sstep(-0.001, -0.006, hb));
    let isStud = false;
    for (const s of STUDS) if (len(sub(p, s)) < 0.0112) isStud = true;
    if (isStud) hc = lin(0xffe6a8);
    if (len(sub(p, STUD_BIG)) < 0.0155) hc = lerp(lin(0xb8c0cc), lin(0xf4f6fa), sstep(0.2, 0.9, n[1] + n[2] * 0.3));
    c = mul(hc, 0.85 + 0.15 * sstep(-0.5, 0.6, n[1]));
  }
  return c;
}
function matchaHead(p) {
  let d = ell(p, [0, 0.56, 0.27], [0.09, 0.085, 0.09]);
  d = smin(d, rcone(p, [0, 0.535, 0.32], [0, 0.515, 0.43], 0.048, 0.027), 0.04);   // museau fin
  for (const sx of [-1, 1]) {
    d = Math.min(d, flatCone(p, [sx * 0.06, 0.615, 0.255], [sx * 0.13, 0.77, 0.24], 0.038, 0.008, [sx * 0.2, 0.1, 1], 3.0)); // grandes oreilles bien séparées
  }
  return d;
}
function matchaHeadColor(p, n) {
  let c = lerp(C.blk, C.blk2, sstep(0.3, 0.9, n[1]) * 0.6);
  const ax = Math.abs(p[0]);
  // oreilles : intérieur rose-feu (face avant), bord noir
  if (p[1] > 0.635 && ax > 0.04) {
    const t = (p[1] - 0.615) / 0.155, axisX = 0.06 + t * 0.07, half = 0.032 * (1 - t);
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
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const out = { version: 1, parts: {} };
const OUTF = new URL('../public/adventure/assets/' + (LITE ? 'dogs-lite.json' : 'dogs.json'), import.meta.url);
const prev = ONLY.length ? JSON.parse(fs.readFileSync(OUTF)) : { parts: {} };
const H = LITE ? 0.026 : 0.017;
const t0 = Date.now();
const run = (name, sdf, col, bmin, bmax, h, decal) => {
  if (ONLY.length && !ONLY.includes(name)) { if (prev.parts[name]) out.parts[name] = prev.parts[name]; return; }
  const m = mesh(sdf, col, bmin, bmax, (h || H) * (LITE ? 1.6 : 1));
  if (decal) m.decal = decal;
  out.parts[name] = pack(m);
  console.log(name, m.pos.length, 'sommets', m.idx.length / 3, 'triangles');
};
run('body', AI.body, AI.bodyColor, [-0.55, 0.3, -1.05], [0.55, 1.75, 1.0]);
run('head', HD.ainuHead, HD.ainuHeadColor, ...HD.ainuHeadBox, 0.0062, HD.ainuDecal);
run('tail', AI.tail, AI.tailColor, ...AI.tailBox, 0.015);
for (const [name, x, z, back] of [['legFL', -0.16, 0.4, 0], ['legFR', 0.16, 0.4, 0], ['legBL', -0.16, -0.5, 1], ['legBR', 0.16, -0.5, 1]]) {
  const f = AI.legSdf(x, z, back);
  run(name, f, AI.legColorFn(x, z, back, f.locks), [x - 0.3, -0.05, z - (back ? 0.75 : 0.45)], [x + 0.3, 1.12, z + 0.35], 0.011);
}
run('harness', AI.harness, AI.harnessColor, ...AI.harnessBox, 0.011);
run('mBody', matchaBody, matchaBodyColor, [-0.15, -0.02, -0.32], [0.15, 0.56, 0.33], 0.006);
run('mHead', HD.matchaHead, HD.matchaHeadColor, ...HD.matchaHeadBox, 0.0028, HD.matchaDecal);
fs.writeFileSync(OUTF, JSON.stringify(out));
console.log('fini en', (Date.now() - t0) / 1000, 's');
