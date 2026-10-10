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
export function ear(p, base, tip, face, width, thick, cup) {
  const vax = norm(sub(tip, base)), h = len(sub(tip, base));
  let wax = sub(face, mul(vax, dot(face, vax))); wax = norm(wax);
  const uax = cross(vax, wax);
  const d0 = sub(p, base);
  const u = dot(d0, uax), v = dot(d0, vax), w = dot(d0, wax);
  const tri = (hw, hh, uu, vv) => {
    const s = hw / hh, k = Math.sqrt(1 + s * s);
    return Math.max((Math.abs(uu) - hw * (1 - vv / hh)) / k, -vv - 0.02);
  };
  const r = Math.min(width, h) * (width / h > 0.9 ? 0.28 : 0.17);
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
// AINU
// ===========================================================================
const A = {
  red: lin(0xc84a18), org: lin(0xe5682a), org2: lin(0xf07e34), gold: lin(0xf5a95a), cream: lin(0xfbe3c0),
  cream2: lin(0xf2cfa0), earIn: lin(0xfbe6cc), earPink: lin(0xe9a089), nose: lin(0x1a1210), dark: lin(0x4a1606),
  mouth: lin(0x3a0e0a),
};
const EAR_L = { base: [-0.14, 0.16, -0.04], tip: [-0.175, 0.3, -0.04], face: [-0.2, 0.08, 1], width: 0.25, thick: 0.055 };
const EAR_R = { base: [0.14, 0.16, -0.04], tip: [0.175, 0.3, -0.04], face: [0.2, 0.08, 1], width: 0.25, thick: 0.055 };
const earA = (p, e) => ear(p, e.base, e.tip, e.face, e.width, e.thick, true);

function ainuHeadBase(p) {
  let d = ell(p, [0, 0.03, -0.03], [0.235, 0.215, 0.235]);                      // crâne en dôme
  d = smin(d, ell(p, [0, -0.02, 0.09], [0.2, 0.15, 0.15]), 0.06);            // face
  // museau : coin arrondi, dessus plat, qui s'affine vers la truffe
  const m = rcone([p[0], (p[1] + 0.06) * 1.15 - 0.06, p[2]], [0, -0.05, 0.12], [0, -0.062, 0.235], 0.115, 0.075);
  d = smin(d, m, 0.06);
  d = smin(d, ell(p, [0, -0.05, 0.262], [0.054, 0.037, 0.034]), 0.02);       // truffe
  // mâchoire inférieure (gueule ouverte)
  d = smin(d, ell(p, [0, -0.165, 0.15], [0.085, 0.04, 0.1]), 0.05);
  // joues touffues qui font une tête en cœur, et gorge
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.2, -0.1, -0.03], [0.18, 0.17, 0.15]), 0.09);
  d = smin(d, ell(p, [0, -0.24, -0.03], [0.22, 0.14, 0.15]), 0.08);
  // gueule : cavité entre la babine et la mâchoire
  const cav = ell(p, [0, -0.128, 0.19], [0.08, 0.03, 0.12]);
  d = smax(d, -cav, 0.015);
  // oreilles
  d = smin(d, earA(p, EAR_L).d, 0.04);
  d = smin(d, earA(p, EAR_R).d, 0.04);
  return d;
}
function ainuHeadComb(p) {
  if (p[1] > 0.12) return norm([p[0] * 2, 0.6, -1]);
  return norm([p[0] * 3, -1.1 + Math.abs(p[0]) * 1.5, -0.3]);
}
export function ainuHead(p) {
  const d = ainuHeadBase(p);
  if (d > 0.1) return d;
  const ax = Math.abs(p[0]);
  // visage lisse (masque, yeux, museau) ; touffes fines partout ailleurs, plus longues sur la collerette
  const face = sstep(0.0, 0.1, p[2]) * sstep(0.2, 0.12, ax) * sstep(0.15, 0.08, p[1]) * sstep(-0.26, -0.18, p[1]);
  const ruff = sstep(0.24, 0.36, ax) * sstep(0.06, -0.08, p[1]) + sstep(-0.22, -0.32, p[1]);
  let earIn = 0;
  for (const e of [EAR_L, EAR_R]) { const E = earA(p, e); if (E.d < 0.03) earIn = Math.max(earIn, sstep(-0.01, 0.01, E.inner) * sstep(0, 0.01, E.w)); }
  const amp = (0.01 + 0.03 * clamp(ruff, 0, 1)) * (1 - face) * (1 - earIn * 0.6);
  return d - amp * 0.8 * lockField(p, ainuHeadComb(p), 12, 4.1);
}
export function ainuHeadColor(p, n) {
  const ax = Math.abs(p[0]);
  let c = A.org;
  c = lerp(c, A.red, sstep(0.08, 0.2, p[1]) * 0.55);                                 // dessus du crâne plus rouge
  c = lerp(c, A.org2, sstep(0.0, 0.12, p[1]) * sstep(0.2, 0.05, ax) * 0.4);
  // masque « urajiro » : museau, joues sous les yeux, gorge crème
  // limite du masque : remonte jusque sous les yeux, laisse l'arête du nez rousse
  const yb = ax < 0.035 ? -0.05 + ax * 0.6 : ax < 0.13 ? -0.03 + (ax - 0.035) * 0.42 : ax < 0.2 ? 0.01 - (ax - 0.13) * 0.6 : -0.032 - (ax - 0.2) * 1.4;
  const mask = sstep(yb + 0.008, yb - 0.008, p[1]) * sstep(-0.02, 0.06, p[2]) * sstep(0.27, 0.22, ax);
  const throat = sstep(-0.18, -0.25, p[1]) * sstep(0.19, 0.12, ax) * sstep(-0.1, 0.0, p[2]);
  c = lerp(c, A.cream, clamp(mask + throat, 0, 1));
  c = lerp(c, A.cream2, mask * sstep(0.17, 0.24, ax) * 0.7);
  // taches crème au-dessus des yeux
  for (const sx of [-1, 1]) {
    const dd = Math.hypot((p[0] - sx * 0.072) / 0.03, (p[1] - 0.088) / 0.02);
    c = lerp(c, A.cream, sstep(1.0, 0.6, dd) * sstep(0.08, 0.14, p[2]));
  }
  // oreilles : extérieur roux foncé, creux crème avec base rosée
  for (const e of [EAR_L, EAR_R]) {
    const E = earA(p, e);
    if (E.d < 0.03 && E.v > -0.01) {
      c = lerp(A.org, A.red, sstep(0.0, 1.0, E.v / E.h) * 0.6);
      if (E.inner > -0.004 && E.w > 0) c = lerp(A.earPink, A.earIn, sstep(0.0, 0.5, E.v / E.h));
    }
  }
  // truffe
  if (p[2] > 0.24 && p[1] > -0.088) c = lerp(c, A.nose, sstep(0.24, 0.255, p[2]));
  // intérieur de la gueule
  const cav = ell(p, [0, -0.128, 0.19], [0.08, 0.03, 0.12]);
  c = lerp(c, A.mouth, sstep(0.012, -0.002, cav));
  const s = strands(p, ainuHeadComb(p), 24, 2.2);
  // hachures d'encre dans le sens du poil (hors du masque du visage)
  const h = strands(p, ainuHeadComb(p), 55, 8.8);
  const hatch = sstep(0.62, 0.7, h) * (1 - mask * sstep(0.2, 0.1, ax)) * sstep(0.05, -0.05, p[1] - 0.2 + ax * 0.2);
  c = lerp(c, lerp(c, A.dark, 0.6), hatch * 0.55);
  // ombrage peint : bords et dessous plus foncés, comme sur l'illustration
  const occ = (0.62 + 0.38 * sstep(-0.4, 0.8, n[2])) * (0.85 + 0.15 * sstep(-0.8, 0.3, n[1])) * (1 + 0.08 * sstep(0.3, 0.9, n[1]));
  return mul(c, (0.95 + s * 0.1) * occ);
}
export const ainuHeadBox = [[-0.5, -0.5, -0.42], [0.5, 0.45, 0.42]];
export const ainuDecal = { x0: -0.32, x1: 0.32, y0: -0.4, y1: 0.24, fade: (p, n) => sstep(0.15, 0.5, n[2]) * sstep(-0.02, 0.05, p[2]) };

// ===========================================================================
// MATCHA (pinscher nain) — origine au pivot de la tête
// ===========================================================================
const B = {
  blk: lin(0x1e1c28), blk2: lin(0x3a3a52), tan: lin(0xc6662a), tan2: lin(0xe08a46),
  earIn: lin(0xe89280), earIn2: lin(0xf3b49c), nose: lin(0x0c0a0c), mouth: lin(0x3a0e0a),
};
const MEAR_L = { base: [-0.046, 0.054, -0.018], tip: [-0.084, 0.148, -0.03], face: [-0.25, 0.1, 1], width: 0.096, thick: 0.014 };
const MEAR_R = { base: [0.046, 0.054, -0.018], tip: [0.084, 0.148, -0.03], face: [0.25, 0.1, 1], width: 0.096, thick: 0.014 };
const earB = (p, e) => ear(p, e.base, e.tip, e.face, e.width, e.thick, true);
function matchaHeadBase(p) {
  let d = ell(p, [0, 0.012, -0.014], [0.079, 0.072, 0.076]);                  // crâne rond
  d = smin(d, ell(p, [0, -0.02, 0.04], [0.06, 0.05, 0.06]), 0.03);           // face
  // museau fin et pointu
  const m = rcone([p[0], (p[1] + 0.03) * 1.12 - 0.03, p[2]], [0, -0.026, 0.045], [0, -0.038, 0.094], 0.048, 0.03);
  d = smin(d, m, 0.025);
  d = smin(d, ell(p, [0, -0.034, 0.11], [0.022, 0.016, 0.013]), 0.008);     // truffe
  d = smin(d, ell(p, [0, -0.066, 0.075], [0.03, 0.016, 0.05]), 0.02);        // mâchoire
  const cav = ell(p, [0, -0.053, 0.095], [0.026, 0.011, 0.055]);
  d = smax(d, -cav, 0.006);
  for (const sx of [-1, 1]) d = smin(d, ell(p, [sx * 0.045, -0.04, 0.02], [0.03, 0.03, 0.03]), 0.03); // joues
  d = smin(d, earB(p, MEAR_L).d, 0.015);
  d = smin(d, earB(p, MEAR_R).d, 0.015);
  return d;
}
export function matchaHead(p) { return matchaHeadBase(p); }
export function matchaHeadColor(p, n) {
  const ax = Math.abs(p[0]);
  let c = lerp(B.blk, B.blk2, sstep(0.2, 0.9, n[1]) * 0.6);
  // feu : museau, joues, dessous de la mâchoire
  const muzzle = sstep(0.05, 0.06, p[2]) * sstep(-0.01, -0.02, p[1]);
  const cheek = sstep(0.004, -0.004, p[1]) * sstep(0.074, 0.062, ax) * sstep(0.005, 0.02, p[2]);
  const jaw = sstep(-0.05, -0.06, p[1]);
  c = lerp(c, B.tan, clamp(muzzle + cheek + jaw, 0, 1));
  // arête du museau noire qui descend vers la truffe
  c = lerp(c, B.blk, sstep(0.026, 0.016, ax + Math.max(0, p[2] - 0.06) * 0.15) * sstep(-0.034, -0.022, p[1]) * sstep(0.03, 0.05, p[2]));  // arête noire du museau
  // points feu au-dessus des yeux
  for (const sx of [-1, 1]) {
    const dd = Math.hypot((p[0] - sx * 0.031) / 0.012, (p[1] - 0.042) / 0.009);
    c = lerp(c, B.tan2, sstep(1.0, 0.6, dd) * sstep(0.04, 0.06, p[2]));
  }
  // oreilles : creux rose-feu
  for (const e of [MEAR_L, MEAR_R]) {
    const E = earB(p, e);
    if (E.d < 0.01 && E.v > 0.0 && E.inner > -0.002 && E.w > 0) c = lerp(B.earIn, B.earIn2, sstep(0.2, 0.8, E.v / E.h));
  }
  if (p[2] > 0.099 && p[1] > -0.052) c = lerp(c, B.nose, sstep(0.099, 0.106, p[2]));
  c = mul(c, 0.8 + 0.2 * sstep(-0.3, 0.7, n[2]));
  const cav = ell(p, [0, -0.053, 0.095], [0.026, 0.011, 0.055]);
  c = lerp(c, B.mouth, sstep(0.005, -0.001, cav));
  return c;
}
export const matchaHeadBox = [[-0.17, -0.12, -0.12], [0.17, 0.25, 0.2]];
export const matchaDecal = { x0: -0.1, x1: 0.1, y0: -0.11, y1: 0.09, fade: (p, n) => sstep(0.1, 0.45, n[2]) * sstep(-0.0, 0.03, p[2]) };
