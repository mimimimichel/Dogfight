/*
 * Matcha & Ainu — Port-Croquette : les bêtes, objets et outils de la couche de vie (life.js).
 *
 * Pigeons, goélands, chats des toits, canards, crabes, papillons ; pots de fleurs, cageots,
 * terrasses de café, cordes à linge, châteaux gonflables, ballons de plage, cloches, boîtes aux
 * lettres, bouches d'incendie… Chaque modèle est peint (couleur par sommet) puis habillé d'une
 * matière de détail (plumes, fourrure, bois, terre cuite, toile, métal) tirée des photos de
 * matières (realtex.js) ou dessinée à la volée : pas de « jouet en plastique ».
 *
 * Les noms sont préfixés « pc_ » pour ne pas gêner les autres mondes (MODELS / PROPS sont partagés).
 */
import * as THREE from '../vendor/three.module.min.js';
import * as RT from './realtex.js';
import { SHAPES, MODELS, PROPS, VILLAGER } from './life.js';

const { P, merge, sph, cyl, cone, box, tor, eyes, wingGeo, TAU } = SHAPES;

// ===========================================================================
// Matières de détail (une par sorte de surface ; en niveaux de gris, la couleur vient des sommets)
// ===========================================================================
const cache = {};
const once = (k, fn) => cache[k] || (cache[k] = fn());
function canvasTex(seed, draw, strength, rep) {
  const t = RT.realTex(256, 256, seed, draw, { strength: strength || 3 });
  for (const m of [t.map, t.normalMap]) m.repeat.set(rep || 1, rep || 1);
  return t;
}
const grayFill = (x, w, h, v) => { x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, w, h); };
/** Fourrure : mille petits traits de poils. */
const furTex = () => once('furT', () => canvasTex(41, (x, y, w, h, r) => {
  grayFill(x, w, h, 214);
  for (let i = 0; i < 4200; i++) {
    const px = r() * w, py = r() * h, l = 4 + r() * 9, a = Math.PI / 2 + (r() - 0.5) * 0.7, v = 170 + Math.floor(r() * 85);
    x.strokeStyle = `rgba(${v},${v},${v},0.55)`; x.lineWidth = 1 + r();
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    y.strokeStyle = `rgba(${v},${v},${v},0.5)`; y.lineWidth = 1.2;
    y.beginPath(); y.moveTo(px, py); y.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); y.stroke();
  }
}, 2.2, 7));
/** Plumes : écailles arrondies qui se chevauchent. */
const featherTex = () => once('featherT', () => canvasTex(43, (x, y, w, h, r) => {
  grayFill(x, w, h, 210);
  for (let row = 0; row < 18; row++) for (let i = 0; i < 14; i++) {
    const px = (i + (row % 2) * 0.5) * (w / 14), py = row * (h / 18), rr = w / 20;
    const v = 185 + Math.floor(r() * 60);
    x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.ellipse(px, py, rr, rr * 1.2, 0, 0, Math.PI); x.fill();
    x.strokeStyle = 'rgba(90,90,90,0.35)'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(px, py, rr, rr * 1.2, 0, 0, Math.PI); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.25)'; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py + rr * 1.1); x.stroke();
    y.fillStyle = `rgb(${v},${v},${v})`; y.beginPath(); y.ellipse(px, py, rr, rr * 1.2, 0, 0, Math.PI); y.fill();
  }
}, 2.5, 6));
/** Toile / tissu : trame croisée. */
const clothTex = () => once('clothT', () => canvasTex(47, (x, y, w, h, r) => {
  grayFill(x, w, h, 222);
  for (let i = 0; i < w; i += 3) { const v = 200 + Math.floor(r() * 40); x.fillStyle = `rgba(${v},${v},${v},0.6)`; x.fillRect(i, 0, 1.5, h); y.fillStyle = 'rgba(160,160,160,0.6)'; y.fillRect(i, 0, 1.5, h); }
  for (let j = 0; j < h; j += 3) { const v = 195 + Math.floor(r() * 45); x.fillStyle = `rgba(${v},${v},${v},0.45)`; x.fillRect(0, j, w, 1.5); y.fillStyle = 'rgba(200,200,200,0.45)'; y.fillRect(0, j, w, 1.5); }
  for (let i = 0; i < 900; i++) { const v = Math.floor(r() * 255); x.fillStyle = `rgba(${v},${v},${v},0.06)`; x.fillRect(r() * w, r() * h, 2, 2); }
}, 1.6, 5));
/** Grain léger (peinture usée, métal, plastique mat) : taches et rayures. */
const grainTex = () => once('grainT', () => canvasTex(53, (x, y, w, h, r) => {
  grayFill(x, w, h, 226);
  for (let i = 0; i < 60; i++) { const v = 190 + Math.floor(r() * 60); x.fillStyle = `rgba(${v},${v},${v},0.25)`; x.beginPath(); x.ellipse(r() * w, r() * h, 8 + r() * 30, 6 + r() * 20, r() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 2500; i++) { const v = 150 + Math.floor(r() * 105); x.fillStyle = `rgba(${v},${v},${v},0.2)`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 40; i++) { const px = r() * w, py = r() * h; x.strokeStyle = 'rgba(120,120,120,0.25)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 40, py + (r() - 0.5) * 8); x.stroke(); y.strokeStyle = 'rgba(90,90,90,0.5)'; y.beginPath(); y.moveTo(px, py); y.lineTo(px + 10, py + 2); y.stroke(); }
}, 1.5, 2));
/** Sable, terre : grains serrés. */
const sandTex = () => once('sandT', () => canvasTex(59, (x, y, w, h, r) => {
  grayFill(x, w, h, 220);
  for (let i = 0; i < 9000; i++) { const v = 160 + Math.floor(r() * 95); x.fillStyle = `rgba(${v},${v},${v},0.5)`; const px = r() * w, py = r() * h; x.fillRect(px, py, 1.5, 1.5); y.fillStyle = `rgba(${v},${v},${v},0.6)`; y.fillRect(px, py, 1.5, 1.5); }
}, 3, 3));
/** Une photo de matière (Poly Haven) passée en gris, ou la texture dessinée de secours. */
function photoOr(name, rep, fallback) {
  const p = RT.photoGray(name, rep, rep, 228);
  return p && p.map ? p : fallback();
}
function mat(k, tex, o) {
  return once('m_' + k, () => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, map: tex.map, normalMap: tex.normalMap || null, roughness: 0.85, metalness: 0 }, o || {})));
}
export const SURF = {
  fur: () => mat('fur', furTex(), { roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }),
  feather: () => mat('feather', featherTex(), { roughness: 0.8, normalScale: new THREE.Vector2(0.6, 0.6) }),
  wing: () => mat('wing', featherTex(), { roughness: 0.8, side: THREE.DoubleSide }),
  cloth: () => mat('cloth', clothTex(), { roughness: 0.92, normalScale: new THREE.Vector2(0.5, 0.5) }),
  grain: () => mat('grain', grainTex(), { roughness: 0.6, normalScale: new THREE.Vector2(0.4, 0.4) }),
  metal: () => mat('metal', grainTex(), { roughness: 0.45, metalness: 0.45, normalScale: new THREE.Vector2(0.4, 0.4) }),
  wood: () => mat('wood', photoOr('brown_planks_03', 1.6, () => canvasTex(61, (x, y, w, h, r) => { grayFill(x, w, h, 210); for (let i = 0; i < 160; i++) { const v = 150 + Math.floor(r() * 90), py = r() * h; x.strokeStyle = `rgba(${v},${v},${v},0.5)`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(0, py); x.bezierCurveTo(w * 0.3, py + (r() - 0.5) * 10, w * 0.6, py + (r() - 0.5) * 10, w, py); x.stroke(); } }, 2, 2)), { roughness: 0.9 }),
  clay: () => mat('clay', photoOr('painted_plaster_wall', 2.2, sandTex), { roughness: 0.95 }),
  stone: () => mat('stone', photoOr('rectangular_paving', 0.8, sandTex), { roughness: 0.9 }),
  sand: () => mat('sand', sandTex(), { roughness: 1 }),
  leaf: () => mat('leaf', photoOr('leafy_grass', 2.5, furTex), { roughness: 0.9 }),
  rubber: () => mat('rubber', grainTex(), { roughness: 0.55, normalScale: new THREE.Vector2(0.3, 0.3) }),
};
/** Matières par défaut des bêtes / habitants / objets de la ville (cfg.mats de buildLife). */
export function cityMats() {
  return { fauna: SURF.fur(), wing: SURF.wing(), props: SURF.grain(), fur: SURF.fur(), cloth: SURF.cloth(), tool: SURF.grain(), platform: SURF.metal() };
}

// ===========================================================================
// Bêtes
// ===========================================================================
const leg = (x, z, h, col, r) => P(cyl(r || 0.012, r || 0.012, h, 4), col, { x, y: h / 2, z });
const pupils = (x, y, z, r, iris) => [P(sph(r, 6, 4), iris, { x, y, z }), P(sph(r, 6, 4), iris, { x: -x, y, z }), P(sph(r * 0.55, 5, 3), 0x101010, { x, y, z: z + r * 0.6 }), P(sph(r * 0.55, 5, 3), 0x101010, { x: -x, y, z: z + r * 0.6 })];

Object.assign(MODELS, {
  /** Pigeon biset : gris, gorge irisée, barres noires sur les ailes, pattes roses. */
  pc_pigeon() {
    const grey = 0x8f96a2, dark = 0x4a5260, pink = 0xd87a7a;
    return {
      body: merge([P(sph(0.13, 10, 8), grey, { y: 0.17, sz: 1.4, sy: 0.92 }), P(sph(0.115, 10, 8), 0xa496ae, { y: 0.17, z: 0.07, sx: 0.95 }),
        P(sph(0.088, 10, 6), 0x5e9282, { y: 0.26, z: 0.1 }), P(sph(0.07, 10, 6), 0x7c84a0, { y: 0.27, z: 0.13, sx: 1.05 }), P(sph(0.074, 10, 8), 0x7a8290, { y: 0.33, z: 0.15 }),
        P(cone(0.018, 0.065, 5), 0x3a3234, { y: 0.32, z: 0.24, rx: Math.PI / 2 }), P(sph(0.017, 5, 4), 0xf0eef0, { y: 0.335, z: 0.215 }),
        ...pupils(0.042, 0.345, 0.19, 0.015, 0xe8702a), P(box(0.13, 0.025, 0.17), dark, { y: 0.17, z: -0.2, rx: 0.25 }), P(box(0.13, 0.02, 0.04), 0x2a2e36, { y: 0.15, z: -0.29, rx: 0.25 }),
        leg(0.04, 0.02, 0.08, pink, 0.014), leg(-0.04, 0.02, 0.08, pink, 0.014), P(box(0.05, 0.01, 0.07), pink, { x: 0.04, y: 0.005, z: 0.04 }), P(box(0.05, 0.01, 0.07), pink, { x: -0.04, y: 0.005, z: 0.04 })]),
      flap: merge([P(sph(0.5, 10, 4), grey, { x: 0.12, sx: 0.24, sy: 0.03, sz: 0.13 }), P(box(0.12, 0.012, 0.018), 0x2a2e36, { x: 0.12, z: -0.02 }), P(box(0.12, 0.012, 0.018), 0x2a2e36, { x: 0.12, z: -0.06 }), P(sph(0.5, 6, 3), 0x3a3e46, { x: 0.22, sx: 0.06, sy: 0.02, sz: 0.1 })]),
      pivots: [0.09, 0.2, 0.0], h: 0.4, r: 0.16, mat: SURF.feather(), flapMat: SURF.wing(),
    };
  },
  /** Goéland : blanc, manteau gris perle, bec jaune à tache rouge, bouts d'ailes noirs. */
  pc_gull() {
    const white = 0xf6f6f2, grey = 0xaab2bc, yel = 0xf2c230;
    return {
      body: merge([P(sph(0.2, 12, 8), white, { y: 0.27, sz: 1.5, sy: 0.85 }), P(sph(0.17, 10, 6), grey, { y: 0.33, z: -0.04, sx: 0.95, sy: 0.55, sz: 1.5 }),
        P(sph(0.12, 10, 8), white, { y: 0.45, z: 0.24 }), P(cone(0.028, 0.13, 6), yel, { y: 0.44, z: 0.38, rx: Math.PI / 2 }), P(sph(0.016, 5, 4), 0xd82a2a, { y: 0.43, z: 0.4 }),
        ...pupils(0.07, 0.48, 0.32, 0.018, 0xf2e070), P(box(0.18, 0.03, 0.22), white, { y: 0.27, z: -0.36, rx: 0.15 }), P(box(0.14, 0.03, 0.08), 0x22242a, { y: 0.31, z: -0.42, rx: 0.15 }),
        leg(0.06, 0.02, 0.14, 0xe8b070, 0.02), leg(-0.06, 0.02, 0.14, 0xe8b070, 0.02), P(box(0.08, 0.012, 0.1), 0xe8b070, { x: 0.06, y: 0.006, z: 0.05 }), P(box(0.08, 0.012, 0.1), 0xe8b070, { x: -0.06, y: 0.006, z: 0.05 })]),
      flap: merge([P(sph(0.5, 10, 4), grey, { x: 0.26, sx: 0.52, sy: 0.04, sz: 0.2 }), P(sph(0.5, 8, 4), 0x1e2026, { x: 0.5, sx: 0.14, sy: 0.035, sz: 0.12 }), P(sph(0.02, 4, 3), 0xffffff, { x: 0.53, y: 0.01 })]),
      pivots: [0.14, 0.36, -0.02], h: 0.6, r: 0.3, mat: SURF.feather(), flapMat: SURF.wing(),
    };
  },
  /** Chat debout (teinté : roux, gris, noir…), queue en point d'interrogation. */
  pc_cat() {
    const f = 0xffffff, pink = 0xf0a0b0;
    const tail = []; for (let i = 0; i < 6; i++) { const k = i / 5; tail.push(P(sph(0.045 - k * 0.01, 7, 5), f, { y: 0.36 + Math.sin(k * 1.6) * 0.34, z: -0.3 - Math.sin(k * 2.6) * 0.14 + k * 0.02 })); }
    const parts = [P(sph(0.17, 12, 8), f, { y: 0.34, sz: 1.75, sy: 0.88 }), P(sph(0.125, 10, 8), 0xfff6ee, { y: 0.34, z: 0.2, sy: 1.05 }), P(sph(0.14, 12, 10), f, { y: 0.52, z: 0.33 }),
      P(sph(0.075, 8, 6), 0xfff6ee, { x: 0.06, y: 0.48, z: 0.41 }), P(sph(0.075, 8, 6), 0xfff6ee, { x: -0.06, y: 0.48, z: 0.41 }), P(sph(0.02, 5, 4), pink, { y: 0.51, z: 0.465 }),
      P(cone(0.058, 0.13, 4), f, { x: 0.085, y: 0.66, z: 0.31, rz: -0.3 }), P(cone(0.058, 0.13, 4), f, { x: -0.085, y: 0.66, z: 0.31, rz: 0.3 }),
      P(cone(0.032, 0.08, 4), pink, { x: 0.083, y: 0.65, z: 0.325, rz: -0.3 }), P(cone(0.032, 0.08, 4), pink, { x: -0.083, y: 0.65, z: 0.325, rz: 0.3 }),
      ...pupils(0.055, 0.56, 0.435, 0.028, 0xb8d040), ...tail];
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) parts.push(P(box(0.14, 0.004, 0.004), 0xf8f8f8, { x: s * 0.12, y: 0.485 + k * 0.02, z: 0.43, rz: s * (k ? 0.12 : -0.08) }));
    for (const [x, z] of [[0.08, 0.2], [-0.08, 0.2], [0.08, -0.17], [-0.08, -0.17]]) parts.push(P(cyl(0.04, 0.035, 0.3, 6), f, { x, y: 0.15, z }), P(sph(0.045, 6, 4), 0xfff6ee, { x, y: 0.02, z: z + 0.02, sy: 0.6 }));
    return { body: merge(parts), h: 0.75, r: 0.32, tint: true };
  },
  /** Chat couché en « pain » (sur un auvent, un balcon…), queue enroulée. */
  pc_catloaf() {
    const f = 0xffffff, pink = 0xf0a0b0;
    const parts = [P(sph(0.2, 12, 8), f, { y: 0.15, sy: 0.68, sz: 1.45 }), P(sph(0.14, 12, 10), f, { y: 0.3, z: 0.27 }),
      P(sph(0.07, 8, 6), 0xfff6ee, { x: 0.055, y: 0.26, z: 0.35 }), P(sph(0.07, 8, 6), 0xfff6ee, { x: -0.055, y: 0.26, z: 0.35 }), P(sph(0.02, 5, 4), pink, { y: 0.29, z: 0.405 }),
      P(cone(0.055, 0.12, 4), f, { x: 0.08, y: 0.43, z: 0.26, rz: -0.3 }), P(cone(0.055, 0.12, 4), f, { x: -0.08, y: 0.43, z: 0.26, rz: 0.3 }),
      P(box(0.05, 0.012, 0.01), 0x222222, { x: 0.05, y: 0.33, z: 0.4, rz: -0.15 }), P(box(0.05, 0.012, 0.01), 0x222222, { x: -0.05, y: 0.33, z: 0.4, rz: 0.15 }),   // yeux mi-clos
      P(sph(0.05, 6, 4), 0xfff6ee, { x: 0.07, y: 0.04, z: 0.3, sz: 1.3 }), P(sph(0.05, 6, 4), 0xfff6ee, { x: -0.07, y: 0.04, z: 0.3, sz: 1.3 }),
      P(tor(0.2, 0.035, 5, 12, Math.PI * 1.1), f, { x: 0.02, y: 0.05, z: -0.05, rx: Math.PI / 2, rz: 0.4 })];
    return { body: merge(parts), h: 0.45, r: 0.3, tint: true };
  },
  /** Colvert : tête vert bouteille, collier blanc, flancs gris, miroir bleu. */
  pc_duck(c) {
    const fem = c.female, body = fem ? 0x9a7a58 : 0xb8b0a4, head = fem ? 0x8a6a48 : 0x1e5a3a;
    return {
      body: merge([P(sph(0.2, 12, 8), body, { y: 0.1, sz: 1.45, sy: 0.72 }), P(sph(0.16, 10, 6), fem ? 0x7a5a3a : 0x6a4a3a, { y: 0.15, z: 0.17, sy: 0.8 }),
        P(sph(0.09, 8, 6), 0x2a2a2a, { y: 0.16, z: -0.3, sy: 0.8 }), P(cone(0.05, 0.1, 5), 0xf4f4f0, { y: 0.2, z: -0.34, rx: -1.0 }),
        P(cyl(0.06, 0.07, 0.14, 8), head, { y: 0.27, z: 0.22 }), ...(fem ? [] : [P(tor(0.065, 0.014, 4, 12), 0xffffff, { y: 0.22, z: 0.22, rx: Math.PI / 2 })]),
        P(sph(0.095, 10, 8), head, { y: 0.37, z: 0.25 }), P(box(0.06, 0.025, 0.13), fem ? 0xd88a30 : 0xe8c030, { y: 0.35, z: 0.37 }),
        ...pupils(0.06, 0.39, 0.29, 0.016, 0x2a1a10)]),
      flap: merge([P(sph(0.5, 8, 4), fem ? 0x8a6a48 : 0x9a9488, { x: 0.12, sx: 0.24, sy: 0.04, sz: 0.2 }), P(box(0.1, 0.012, 0.05), 0x3a5ad8, { x: 0.1, y: 0.015, z: -0.04 })]),
      pivots: [0.1, 0.17, 0.0], h: 0.45, r: 0.26, mat: SURF.feather(), flapMat: SURF.wing(),
    };
  },
  /** Caneton jaune tout rond. */
  pc_duckling() {
    return { body: merge([P(sph(0.12, 10, 8), 0xf6d84a, { y: 0.12, sz: 1.2 }), P(sph(0.08, 10, 8), 0xf8de58, { y: 0.25, z: 0.08 }), P(box(0.05, 0.02, 0.07), 0xf09030, { y: 0.24, z: 0.17 }),
      ...eyes(0.04, 0.27, 0.14, 0.015), P(sph(0.04, 6, 4), 0xf0c840, { y: 0.15, z: -0.14, sy: 0.6 }), P(box(0.04, 0.01, 0.06), 0xf09030, { x: 0.05, y: 0.005, z: 0.03 }), P(box(0.04, 0.01, 0.06), 0xf09030, { x: -0.05, y: 0.005, z: 0.03 })]),
      h: 0.32, r: 0.15, mat: SURF.feather() };
  },
  /** Crabe : carapace orange, grosses pinces, yeux pédonculés (il marche de côté). */
  pc_crab() {
    const sh = 0xd8542a, light = 0xf0a070;
    const parts = [P(sph(0.17, 12, 8), sh, { y: 0.11, sx: 1.3, sy: 0.42 }), P(sph(0.13, 10, 6), light, { y: 0.07, sx: 1.25, sy: 0.3 }),
      P(cyl(0.012, 0.012, 0.08, 4), sh, { x: 0.05, y: 0.18, z: 0.1 }), P(cyl(0.012, 0.012, 0.08, 4), sh, { x: -0.05, y: 0.18, z: 0.1 }), P(sph(0.022, 6, 4), 0x141414, { x: 0.05, y: 0.23, z: 0.1 }), P(sph(0.022, 6, 4), 0x141414, { x: -0.05, y: 0.23, z: 0.1 })];
    for (const s of [-1, 1]) {
      parts.push(P(cyl(0.022, 0.026, 0.14, 5), sh, { x: s * 0.17, y: 0.1, z: 0.12, rz: s * 1.0, rx: 0.5 }), P(sph(0.06, 8, 6), sh, { x: s * 0.2, y: 0.13, z: 0.22, sz: 1.3 }),
        P(cone(0.03, 0.08, 4), sh, { x: s * 0.18, y: 0.15, z: 0.3, rx: Math.PI / 2 }), P(cone(0.025, 0.07, 4), light, { x: s * 0.23, y: 0.12, z: 0.29, rx: Math.PI / 2 }));
      for (let i = 0; i < 3; i++) parts.push(P(cyl(0.012, 0.01, 0.2, 4), sh, { x: s * 0.24, y: 0.06, z: -0.06 + i * 0.07, rz: s * 1.15 }));
    }
    return { body: merge(parts), h: 0.3, r: 0.26, mat: SURF.grain() };
  },
  /** Papillon : corps fin, deux ailes peintes (battement). */
  pc_butterfly(c) {
    const w1 = c.wing || 0xf08a20, w2 = c.edge || 0x1a1410;
    return {
      body: merge([P(cyl(0.012, 0.008, 0.13, 5), 0x1a1410, { z: 0, rx: Math.PI / 2 }), P(sph(0.016, 5, 4), 0x1a1410, { z: 0.07 }),
        P(cyl(0.002, 0.002, 0.07, 3), 0x1a1410, { x: 0.015, y: 0.03, z: 0.09, rx: -0.6 }), P(cyl(0.002, 0.002, 0.07, 3), 0x1a1410, { x: -0.015, y: 0.03, z: 0.09, rx: -0.6 })]),
      flap: merge([P(sph(0.5, 10, 3), w2, { x: 0.075, z: 0.02, sx: 0.15, sy: 0.006, sz: 0.11 }), P(sph(0.5, 10, 3), w1, { x: 0.072, y: 0.002, z: 0.02, sx: 0.12, sy: 0.006, sz: 0.085 }),
        P(sph(0.5, 8, 3), w2, { x: 0.05, z: -0.05, sx: 0.09, sy: 0.006, sz: 0.08 }), P(sph(0.5, 8, 3), c.low || w1, { x: 0.048, y: 0.002, z: -0.05, sx: 0.07, sy: 0.006, sz: 0.06 }),
        P(sph(0.012, 4, 3), 0xffffff, { x: 0.12, y: 0.004, z: 0.04 })]),
      pivots: [0.008, 0, 0], h: 0.1, r: 0.1, flapMat: once('m_bfly', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })),
    };
  },
});

// ===========================================================================
// Outils et plates-formes des habitants (origine = bout du bras droit)
// ===========================================================================
Object.assign(VILLAGER, {
  pc_brush() { return merge([P(cyl(0.015, 0.02, 0.4, 5), 0x9a6a3a, { y: -0.12 }), P(cyl(0.022, 0.012, 0.08, 6), 0xb8b8c0, { y: -0.34 }), P(cone(0.02, 0.07, 6), 0x3a6ad8, { y: -0.41, rx: Math.PI })]); },
  pc_tray() {
    const parts = [P(cyl(0.24, 0.24, 0.02, 14), 0xc8c8cc, { z: 0.06, rx: Math.PI / 2 })];
    for (const [x, y] of [[-0.08, 0.05], [0.09, -0.04]]) parts.push(P(cyl(0.04, 0.03, 0.07, 8), 0xf6f2ea, { x, y, z: 0.1, rx: Math.PI / 2 }), P(cyl(0.032, 0.032, 0.01, 8), 0x4a2a1a, { x, y, z: 0.135, rx: Math.PI / 2 }));
    parts.push(P(box(0.1, 0.06, 0.05), 0xe0a050, { x: 0.02, y: 0.12, z: 0.1 }));   // un croissant
    return merge(parts);
  },
  pc_accordion() {
    const parts = [P(box(0.18, 0.3, 0.32), 0xc82a2a, { x: -0.06, y: -0.05, z: 0.05 }), P(box(0.18, 0.3, 0.32), 0xc82a2a, { x: -0.55, y: -0.05, z: 0.05 })];
    for (let i = 0; i < 6; i++) parts.push(P(box(0.05, 0.28, 0.3), i % 2 ? 0x2a2a2e : 0xf0e8d8, { x: -0.17 - i * 0.055, y: -0.05, z: 0.05 }));
    for (let i = 0; i < 5; i++) parts.push(P(box(0.02, 0.02, 0.24), 0xffffff, { x: -0.6, y: -0.15 + i * 0.05, z: 0.05 }));
    return merge(parts);
  },
  pc_fries() {
    const parts = [P(cone(0.075, 0.22, 8), 0xe8e0d0, { y: 0.06, rx: Math.PI }), P(tor(0.072, 0.012, 4, 10), 0xd83a2a, { y: 0.15, rx: Math.PI / 2 })];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.035; parts.push(P(box(0.022, 0.18, 0.022), 0xf2c450, { x: Math.cos(a) * r, y: 0.24, z: Math.sin(a) * r, rz: (i % 3 - 1) * 0.2, rx: (i % 2 - 0.5) * 0.3 })); }
    return merge(parts);
  },
  pc_letter() { return merge([P(box(0.2, 0.01, 0.13), 0xf8f4ea, { y: -0.05, z: 0.04 }), P(box(0.05, 0.012, 0.03), 0xd83a2a, { y: -0.044, z: 0.06 }), P(box(0.2, 0.011, 0.06), 0xe8e2d4, { y: -0.046, z: 0.0, rx: 0.3 })]); },
  pc_balloons() {
    const cols = [0xe03a4a, 0x3a8ae0, 0xf0c030, 0x40b060, 0xd060c0];
    const parts = [];
    cols.forEach((c, i) => { const a = i * 1.26, x = Math.cos(a) * 0.22, z = Math.sin(a) * 0.22, h = 1.25 + (i % 2) * 0.2; parts.push(P(cyl(0.004, 0.004, h, 3), 0xf0f0f0, { x: x / 2, y: h / 2, z: z / 2, rz: -x * 0.4, rx: z * 0.4 }), P(sph(0.17, 10, 8), c, { x, y: h + 0.1, z, sy: 1.2 }), P(cone(0.03, 0.05, 5), c, { x, y: h - 0.1, z, rx: Math.PI })); });
    return merge(parts);
  },
  pc_squeegee() { return merge([P(cyl(0.015, 0.015, 0.5, 5), 0xd8d8e0, { y: -0.2 }), P(box(0.42, 0.06, 0.04), 0x2a6ad0, { y: -0.47 }), P(box(0.42, 0.02, 0.05), 0x1a1a1a, { y: -0.5 })]); },
  pc_can() { return merge([P(cyl(0.13, 0.15, 0.24, 10), 0x4a9a5a, { y: -0.2, z: 0.05 }), P(cyl(0.02, 0.025, 0.35, 5), 0x4a9a5a, { y: -0.12, z: 0.26, rx: 1.0 }), P(cyl(0.04, 0.02, 0.04, 6), 0x3a8a4a, { y: -0.02, z: 0.4, rx: 1.0 }), P(tor(0.08, 0.012, 4, 10, Math.PI), 0x3a7a4a, { y: -0.08, z: 0.05 })]); },
  pc_paper() { return merge([P(box(0.42, 0.006, 0.3), 0xeeeae0, { y: -0.04, z: 0.15 }), P(box(0.18, 0.007, 0.1), 0x8a8a8a, { x: -0.1, y: -0.046, z: 0.2 }), P(box(0.16, 0.007, 0.03), 0x2a2a2a, { x: 0.09, y: -0.046, z: 0.24 })]); },
  pc_bouquet() {
    const parts = [P(cone(0.08, 0.3, 6), 0xf4e0c8, { y: 0.05, rx: Math.PI })];
    const cols = [0xe84a6a, 0xf0d040, 0xffffff, 0xd060a0, 0xf07040];
    for (let i = 0; i < 9; i++) { const a = i * 2.3, r = 0.05 + (i % 3) * 0.02; parts.push(P(sph(0.04, 6, 4), cols[i % 5], { x: Math.cos(a) * r, y: 0.24 + (i % 2) * 0.04, z: Math.sin(a) * r }), P(sph(0.03, 5, 3), 0x3a8a3a, { x: Math.cos(a + 1) * r * 1.3, y: 0.2, z: Math.sin(a + 1) * r * 1.3 })); }
    return merge(parts);
  },
  pc_icecream() {
    return merge([P(cone(0.06, 0.2, 10), 0xd8a050, { y: 0.02, rx: Math.PI }), P(sph(0.07, 10, 8), 0xf8f0e0, { y: 0.15 }), P(sph(0.062, 10, 8), 0xf09ab0, { y: 0.25 }), P(sph(0.015, 5, 4), 0xd82a2a, { y: 0.32 })]);
  },
  pc_whistle() { return merge([P(box(0.08, 0.05, 0.04), 0xd83a2a, { y: -0.05 }), P(cyl(0.004, 0.004, 0.3, 3), 0xf0f0f0, { y: 0.1 })]); },
  /** Nacelle du laveur de carreaux : plateau, garde-corps, seau. */
  pc_nacelle() {
    const m = 0x8a9098, parts = [P(box(2.6, 0.1, 0.9), 0x6a7078, { y: -0.05 })];
    for (const z of [-0.42, 0.42]) parts.push(P(box(2.6, 0.05, 0.05), m, { y: 1.0, z }), P(box(2.6, 0.05, 0.05), m, { y: 0.5, z }));
    for (const x of [-1.27, 1.27]) for (const z of [-0.42, 0.42]) parts.push(P(box(0.05, 1.0, 0.05), m, { x, y: 0.5, z }));
    for (const x of [-1.27, 1.27]) parts.push(P(box(0.05, 0.05, 0.9), m, { x, y: 1.0 }));
    parts.push(P(cyl(0.16, 0.13, 0.3, 10), 0x3a7ad8, { x: 0.8, y: 0.15 }), P(cyl(0.14, 0.14, 0.02, 10), 0xd8ecff, { x: 0.8, y: 0.28 }));
    return merge(parts);
  },
});

// ===========================================================================
// Objets
// ===========================================================================
const flowersOn = (parts, cx, cy, cz, r, n, seed, cols) => {
  cols = cols || [0xe84a6a, 0xf0d040, 0xffffff, 0xd060c0, 0xf07a3a, 0x6a8ae8];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + seed, d = Math.sqrt((i + 0.5) / n) * r;
    parts.push(P(sph(0.075, 6, 5), [0x3a7a2e, 0x4a8a34, 0x2e6a28][i % 3], { x: cx + Math.cos(a) * d * 0.9, y: cy + 0.03, z: cz + Math.sin(a) * d * 0.9, sy: 0.7 }));
    if (i % 2 === 0) parts.push(P(sph(0.045, 6, 4), cols[(i / 2 + seed) % cols.length | 0], { x: cx + Math.cos(a) * d, y: cy + 0.1, z: cz + Math.sin(a) * d }));
  }
};
Object.assign(PROPS, {
  /** Pot de fleurs en terre cuite (à faire tomber). */
  pc_pot(c) {
    const parts = [P(cyl(0.25, 0.18, 0.42, 14), 0xc4683e, { y: 0.21 }), P(tor(0.25, 0.035, 5, 16), 0xb85e36, { y: 0.42, rx: Math.PI / 2 }), P(cyl(0.22, 0.22, 0.02, 12), 0x4a3424, { y: 0.4 })];
    flowersOn(parts, 0, 0.42, 0, 0.2, 12, c.seed || 1, c.cols);
    parts.push(P(sph(0.13, 8, 6), 0x3a7a2e, { y: 0.55 }));
    return { geo: merge(parts), mat: SURF.clay(), h: 0.75, r: 0.35 };
  },
  /** Jardinière en bois fleurie. */
  pc_planter() {
    const parts = [P(box(1.6, 0.45, 0.5), 0x8a5a36, { y: 0.225 }), P(box(1.66, 0.06, 0.56), 0x6e4628, { y: 0.45 })];
    for (let i = 0; i < 5; i++) parts.push(P(box(0.02, 0.4, 0.51), 0x5e3a20, { x: -0.64 + i * 0.32, y: 0.22 }));
    flowersOn(parts, -0.45, 0.45, 0, 0.25, 10, 2); flowersOn(parts, 0.1, 0.45, 0, 0.25, 10, 5); flowersOn(parts, 0.6, 0.45, 0, 0.22, 8, 3);
    return { geo: merge(parts), mat: SURF.wood(), h: 0.7, r: 0.8 };
  },
  /** Cageot de fruits (oranges, pommes, citrons…). */
  pc_crate(c) {
    const w = 0xb88a58, parts = [];
    for (const y of [0.06, 0.2, 0.34]) for (const z of [-0.24, 0.24]) parts.push(P(box(0.72, 0.09, 0.025), w, { y, z }));
    for (const y of [0.06, 0.2, 0.34]) for (const x of [-0.35, 0.35]) parts.push(P(box(0.025, 0.09, 0.48), w, { x, y }));
    parts.push(P(box(0.7, 0.02, 0.46), 0x9a7048, { y: 0.02 }));
    for (const [x, z] of [[-0.35, -0.24], [0.35, -0.24], [-0.35, 0.24], [0.35, 0.24]]) parts.push(P(box(0.05, 0.42, 0.05), 0x8a6040, { x, y: 0.21, z }));
    const fr = c.fruit || 0xf08a20;
    for (let i = 0; i < 12; i++) parts.push(P(sph(0.075, 8, 6), i % 5 === 0 ? (c.fruit2 || fr) : fr, { x: -0.24 + (i % 4) * 0.16, y: 0.38 + (i % 3 === 1 ? 0.04 : 0), z: -0.13 + Math.floor(i / 4) * 0.13 }));
    return { geo: merge(parts), mat: SURF.wood(), h: 0.5, r: 0.5 };
  },
  /** Cagette de poissons sur glace (quai). */
  pc_fishbox() {
    const parts = [P(box(0.8, 0.28, 0.5), 0x5a8ab0, { y: 0.14 }), P(box(0.74, 0.03, 0.44), 0xe8f4fa, { y: 0.27 })];
    for (let i = 0; i < 5; i++) { const z = -0.16 + i * 0.08; parts.push(P(sph(0.06, 8, 5), 0xb8c4cc, { x: (i % 2 ? 0.08 : -0.08), y: 0.31, z, sx: 4, sy: 0.6 }), P(cone(0.05, 0.08, 4), 0x9aa8b4, { x: (i % 2 ? 0.08 : -0.08) + 0.27, y: 0.31, z, rz: -Math.PI / 2, sz: 0.3 })); }
    return { geo: merge(parts), mat: SURF.rubber(), h: 0.35, r: 0.5 };
  },
  /** Tonneau cerclé. */
  pc_barrel() {
    const parts = [P(cyl(0.36, 0.36, 0.95, 14), 0x8a5a34, { y: 0.475 }), P(cyl(0.4, 0.4, 0.45, 14), 0x946238, { y: 0.475 })];
    for (const y of [0.12, 0.4, 0.55, 0.83]) parts.push(P(tor(0.395 - Math.abs(y - 0.475) * 0.1, 0.022, 4, 18), 0x3a3a3e, { y, rx: Math.PI / 2 }));
    parts.push(P(cyl(0.34, 0.34, 0.02, 14), 0x7a4a2a, { y: 0.95 }));
    return { geo: merge(parts), mat: SURF.wood(), h: 1.0, r: 0.42 };
  },
  /** Casier à homards (filet sur arceaux) et sa bouée. */
  pc_lobster() {
    const parts = [P(box(0.9, 0.05, 0.6), 0x7a5a3a, { y: 0.03 })];
    for (const x of [-0.4, 0, 0.4]) parts.push(P(tor(0.3, 0.02, 4, 12, Math.PI), 0x6a4a2a, { x, y: 0.05, rx: 0, ry: Math.PI / 2 }));
    parts.push(P(sph(0.31, 10, 6, 0, TAU, 0, Math.PI / 2), 0x3a4a3a, { y: 0.04, sx: 1.45 }));
    parts.push(P(sph(0.13, 8, 6), 0xe8402a, { x: 0.55, y: 0.13, z: 0.3 }), P(cyl(0.012, 0.012, 0.35, 3), 0xd8c8a0, { x: 0.4, y: 0.12, z: 0.3, rz: 1.2 }));
    return { geo: merge(parts), mat: SURF.cloth(), h: 0.4, r: 0.55 };
  },
  /** Table de terrasse de café avec parasol rayé et deux chaises. */
  pc_cafe(c) {
    const can = c.canopy || 0xc83a3a, iron = 0x2a2e32, parts = [];
    parts.push(P(cyl(0.38, 0.38, 0.03, 16), 0xe8e4dc, { y: 0.74 }), P(cyl(0.025, 0.04, 0.72, 6), iron, { y: 0.37 }), P(cyl(0.22, 0.24, 0.03, 10), iron, { y: 0.015 }));
    parts.push(P(cyl(0.025, 0.025, 2.3, 6), 0xe0e0e0, { y: 1.15 }));
    for (let i = 0; i < 8; i++) parts.push(P(cyl(0.0, 1.2, 0.42, 3, 1, false, i * TAU / 8, TAU / 8), i % 2 ? can : 0xf4f0e6, { y: 2.2 }));
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * TAU; parts.push(P(sph(0.07, 5, 3), i % 2 ? can : 0xf4f0e6, { x: Math.cos(a) * 1.17, y: 1.97, z: Math.sin(a) * 1.17, sy: 0.6 })); }
    for (const s of [-1, 1]) {
      const z = s * 0.65;
      parts.push(P(cyl(0.2, 0.2, 0.04, 10), 0x8a5a36, { y: 0.45, z }), P(box(0.36, 0.38, 0.03), 0x8a5a36, { y: 0.68, z: z + s * 0.19, rx: s * 0.12 }));
      for (const [x, dz] of [[0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]]) parts.push(P(cyl(0.012, 0.012, 0.45, 4), iron, { x, y: 0.225, z: z + dz }));
    }
    parts.push(P(cyl(0.04, 0.03, 0.08, 8), 0xffffff, { x: 0.1, y: 0.8 }), P(cyl(0.035, 0.035, 0.005, 8), 0x3a2010, { x: 0.1, y: 0.84 }), P(cyl(0.06, 0.06, 0.008, 10), 0xffffff, { x: 0.1, y: 0.76 }));
    return { geo: merge(parts), mat: SURF.cloth(), h: 2.4, r: 0.9 };
  },
  /** Corde à linge entre deux poteaux, linge coloré. */
  pc_laundry() {
    const parts = [P(cyl(0.05, 0.06, 2.3, 6), 0x7a5a3a, { x: -1.9, y: 1.15 }), P(cyl(0.05, 0.06, 2.3, 6), 0x7a5a3a, { x: 1.9, y: 1.15 }), P(box(3.8, 0.012, 0.012), 0xe8e8e0, { y: 2.12 })];
    const cl = [[0xf0f0ea, 'shirt'], [0x4a7ad8, 'pants'], [0xe84a6a, 'shirt'], [0xf0d040, 'sock'], [0x7ac05a, 'shirt'], [0xffffff, 'sheet']];
    let x = -1.55;
    for (const [col, k] of cl) {
      if (k === 'shirt') { parts.push(P(box(0.45, 0.5, 0.02), col, { x: x + 0.22, y: 1.85 }), P(box(0.18, 0.16, 0.02), col, { x: x + 0.02, y: 1.98, rz: 0.6 }), P(box(0.18, 0.16, 0.02), col, { x: x + 0.42, y: 1.98, rz: -0.6 })); x += 0.62; }
      else if (k === 'pants') { parts.push(P(box(0.4, 0.14, 0.02), col, { x: x + 0.2, y: 2.04 }), P(box(0.17, 0.6, 0.02), col, { x: x + 0.1, y: 1.72 }), P(box(0.17, 0.6, 0.02), col, { x: x + 0.3, y: 1.72 })); x += 0.55; }
      else if (k === 'sock') { parts.push(P(box(0.09, 0.3, 0.02), col, { x: x + 0.05, y: 1.96 }), P(box(0.15, 0.08, 0.02), col, { x: x + 0.08, y: 1.82 })); x += 0.25; }
      else { parts.push(P(box(0.7, 0.85, 0.015), col, { x: x + 0.35, y: 1.68 })); x += 0.8; }
      parts.push(P(box(0.03, 0.07, 0.03), 0xc8a070, { x: x - 0.1, y: 2.12 }));
    }
    return { geo: merge(parts), mat: SURF.cloth(), h: 2.3, r: 1.9 };
  },
  /** Château gonflable (trampoline) : coussin rebondi, quatre tourelles. */
  pc_bouncy(c) {
    const a = c.a || 0xe8403a, b = c.b || 0xf0c030, d = c.d || 0x3a7ad8, parts = [P(box(2.4, 0.3, 2.4), a, { y: 0.15 })];
    parts.push(P(sph(1.2, 16, 6, 0, TAU, 0, Math.PI / 2), b, { y: 0.28, sy: 0.12 }));
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) parts.push(P(cyl(0.22, 0.24, 1.2, 10), d, { x, y: 0.6, z }), P(sph(0.24, 10, 6), a, { x, y: 1.26, z, sy: 1.4 }), P(cone(0.05, 0.25, 6), b, { x, y: 1.6, z }));
    for (const [x, z, w, dd] of [[0, -1.15, 2.0, 0.22], [0, 1.15, 2.0, 0.22], [-1.15, 0, 0.22, 2.0]]) parts.push(P(box(w, 0.5, dd), d, { x, y: 0.55, z }), P(box(w, 0.08, dd + 0.06), b, { x, y: 0.82, z }));
    return { geo: merge(parts), mat: SURF.rubber(), h: 1.6, r: 1.3 };
  },
  /** Trampoline rond (jardins, parc). */
  pc_trampo() {
    const parts = [P(cyl(1.15, 1.15, 0.04, 22), 0x1e1e22, { y: 0.55 }), P(tor(1.2, 0.09, 6, 26), 0x2a8ad0, { y: 0.56, rx: Math.PI / 2 })];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(cyl(0.03, 0.03, 0.56, 5), 0x8a9098, { x: Math.cos(a) * 1.15, y: 0.28, z: Math.sin(a) * 1.15 })); }
    return { geo: merge(parts), mat: SURF.rubber(), h: 0.6, r: 1.2 };
  },
  /** Grosse bouée gonflable couchée sur le sable (on rebondit dessus). */
  pc_float(c) {
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push(P(tor(0.85, 0.32, 8, 6, TAU / 8), i % 2 ? (c.a || 0xff6a9a) : 0xfaf6f0, { y: 0.32, rx: Math.PI / 2, rz: i * TAU / 8 }));
    return { geo: merge(parts), mat: SURF.rubber(), h: 0.64, r: 1.15 };
  },
  /** Ballon de plage (rayon 1 : life.js le met à l'échelle). */
  pc_beachball() {
    const cols = [0xe8403a, 0xffffff, 0x3a8ae0, 0xffffff, 0xf0c030, 0xffffff];
    const parts = cols.map((col, i) => P(sph(1, 10, 10, i * TAU / 6, TAU / 6), col, {}));
    parts.push(P(sph(0.16, 8, 4), 0xffffff, { y: 0.98 }), P(sph(0.16, 8, 4), 0xffffff, { y: -0.98 }));
    return { geo: merge(parts), mat: SURF.rubber(), h: 1, r: 1 };
  },
  /** Château de sable (à démolir !) avec son petit drapeau. */
  pc_sandcastle() {
    const s = 0xe2c48a, parts = [P(sph(0.75, 12, 6, 0, TAU, 0, Math.PI / 2), s, { sy: 0.4 }), P(cyl(0.38, 0.45, 0.45, 10), s, { y: 0.45 })];
    for (const [x, z] of [[0.45, 0.3], [-0.45, 0.3], [0, -0.5]]) { parts.push(P(cyl(0.16, 0.2, 0.55, 8), s, { x, y: 0.4, z })); for (let k = 0; k < 4; k++) parts.push(P(box(0.07, 0.08, 0.07), s, { x: x + Math.cos(k * 1.57) * 0.13, y: 0.71, z: z + Math.sin(k * 1.57) * 0.13 })); }
    parts.push(P(cone(0.24, 0.35, 8), s, { y: 0.84 }), P(cyl(0.008, 0.008, 0.4, 3), 0xffffff, { y: 1.15 }), P(box(0.01, 0.1, 0.16), 0xe8403a, { y: 1.3, z: 0.08 }));
    for (let i = 0; i < 5; i++) parts.push(P(sph(0.05, 6, 4), [0xf4f0e8, 0xe8c0b0, 0xd8d4cc][i % 3], { x: Math.cos(i * 1.3) * 0.65, y: 0.04, z: Math.sin(i * 1.3) * 0.65, sy: 0.5 }));
    return { geo: merge(parts), mat: SURF.sand(), h: 1.0, r: 0.7 };
  },
  /** Transat rayé. */
  pc_deckchair(c) {
    const w = 0xb88a58, parts = [];
    for (const s of [-1, 1]) parts.push(P(box(0.04, 0.04, 1.3), w, { x: s * 0.3, y: 0.38, z: 0, rx: 0.5 }), P(box(0.04, 0.04, 0.8), w, { x: s * 0.31, y: 0.3, z: 0.2, rx: -0.75 }));
    for (let i = 0; i < 6; i++) parts.push(P(box(0.56, 0.015, 0.2), i % 2 ? (c.a || 0x3a7ad8) : 0xf8f4ea, { y: 0.16 + i * 0.105, z: 0.48 - i * 0.18, rx: 0.5 }));
    return { geo: merge(parts), mat: SURF.cloth(), h: 0.8, r: 0.6 };
  },
  /** Cloche sur un poteau (le carillon du marché). */
  pc_bell() {
    const parts = [P(cyl(0.07, 0.09, 2.0, 8), 0x5a4030, { y: 1.0 }), P(box(0.6, 0.08, 0.08), 0x5a4030, { x: 0.25, y: 1.98 }), P(cyl(0.12, 0.16, 0.12, 8), 0x3a3a3e, { y: 0.06 })];
    parts.push(P(cyl(0.012, 0.012, 0.14, 4), 0x2a2a2a, { x: 0.45, y: 1.88 }), P(sph(0.2, 12, 8, 0, TAU, 0, Math.PI * 0.6), 0xc89a3a, { x: 0.45, y: 1.65, sy: 1.15 }), P(tor(0.19, 0.03, 5, 14), 0xb0842a, { x: 0.45, y: 1.55, rx: Math.PI / 2 }), P(sph(0.04, 6, 4), 0x8a6a2a, { x: 0.45, y: 1.5 }));
    return { geo: merge(parts), mat: SURF.metal(), h: 2.1, r: 0.35 };
  },
  /** Gros bouton de laiton sur un socle de pierre. */
  pc_button() {
    return { geo: merge([P(cyl(0.6, 0.7, 0.4, 12), 0xd8d0c0, { y: 0.2 }), P(cyl(0.4, 0.42, 0.2, 14), 0xd8a83a, { y: 0.48 }), P(cyl(0.2, 0.2, 0.04, 10), 0xf0d070, { y: 0.6 })]), mat: SURF.stone(), h: 0.6, r: 0.6 };
  },
  /** Réverbère de café (la lanterne brille à 2,35 m quand on l'allume). */
  pc_lamp() {
    const iron = 0x22262a;
    return { geo: merge([P(cyl(0.05, 0.08, 2.2, 8), iron, { y: 1.1 }), P(cyl(0.16, 0.2, 0.2, 8), iron, { y: 0.1 }), P(cyl(0.2, 0.14, 0.38, 6), 0xfff0c0, { y: 2.35 }),
      P(cone(0.26, 0.2, 6), iron, { y: 2.64 }), P(sph(0.05, 6, 4), iron, { y: 2.78 }), P(cyl(0.15, 0.17, 0.05, 6), iron, { y: 2.15 })]), mat: SURF.metal(), h: 2.8, r: 0.2 };
  },
  /** Boîte aux lettres jaune sur son pied. */
  pc_mailbox() {
    return { geo: merge([P(cyl(0.04, 0.05, 1.0, 6), 0x3a3a3e, { y: 0.5 }), P(box(0.42, 0.5, 0.32), 0xf0c020, { y: 1.15 }), P(cyl(0.21, 0.21, 0.32, 10, 1, false, 0, Math.PI), 0xf0c020, { y: 1.4, rz: Math.PI / 2, ry: Math.PI / 2 }),
      P(box(0.26, 0.03, 0.02), 0x2a2a2a, { y: 1.28, z: 0.165 }), P(box(0.2, 0.12, 0.01), 0x3a5ad8, { y: 1.08, z: 0.165 })]), mat: SURF.metal(), h: 1.6, r: 0.3 };
  },
  /** Chevalet du peintre et sa toile (un port au coucher du soleil). */
  pc_easel() {
    const w = 0x9a6a3a, parts = [P(box(0.04, 1.7, 0.04), w, { x: -0.3, y: 0.85, rz: -0.15 }), P(box(0.04, 1.7, 0.04), w, { x: 0.3, y: 0.85, rz: 0.15 }), P(box(0.04, 1.6, 0.04), w, { y: 0.8, z: -0.4, rx: -0.3 }), P(box(0.7, 0.04, 0.06), w, { y: 0.8 })];
    parts.push(P(box(0.8, 0.6, 0.03), 0xf4eedc, { y: 1.15, z: 0.04 }));
    const pts = [[0x5ab0e8, 0, 1.3, 0.7, 0.25], [0x2a6ab0, 0, 1.02, 0.7, 0.14], [0xf0a040, 0.15, 1.32, 0.1, 0.1], [0xffffff, -0.18, 1.0, 0.12, 0.2], [0xe8403a, -0.18, 1.12, 0.02, 0.08], [0x5a8a3a, 0.25, 0.95, 0.2, 0.06]];
    for (const [c, x, y, sw, sh] of pts) parts.push(P(box(sw, sh, 0.01), c, { x, y, z: 0.06 }));
    return { geo: merge(parts), mat: SURF.wood(), h: 1.7, r: 0.5 };
  },
  /** Plot de chantier (on le renverse). */
  pc_cone() {
    return { geo: merge([P(box(0.42, 0.04, 0.42), 0x2a2a2a, { y: 0.02 }), P(cone(0.17, 0.62, 12), 0xf06a1a, { y: 0.33 }), P(cyl(0.1, 0.125, 0.1, 12), 0xf4f4f0, { y: 0.36 })]), mat: SURF.rubber(), h: 0.65, r: 0.25 };
  },
  /** Buisson fleuri (on le secoue : pétales). */
  pc_bush(c) {
    const parts = [];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, d = i ? 0.35 : 0; parts.push(P(sph(0.42 - (i ? 0.1 : 0), 9, 7), [0x3e7a2e, 0x4a8a36, 0x356a28][i % 3], { x: Math.cos(a) * d, y: 0.45 + (i % 3) * 0.08, z: Math.sin(a) * d })); }
    const cols = c.flowers || [0xf0a0c0, 0xffffff];
    for (let i = 0; i < 16; i++) { const a = i * 2.39996, r = 0.5 + (i % 3) * 0.05, y = 0.35 + (i % 5) * 0.12; parts.push(P(sph(0.055, 6, 4), cols[i % cols.length], { x: Math.cos(a) * r, y, z: Math.sin(a) * r })); }
    return { geo: merge(parts), mat: SURF.leaf(), h: 0.95, r: 0.7 };
  },
  /** Massif de fleurs des champs, bas (on peut marcher autour, pas dessus). */
  pc_flowers() {
    const parts = [P(sph(0.9, 12, 4, 0, TAU, 0, Math.PI / 2), 0x4a7a32, { sy: 0.12 })];
    flowersOn(parts, 0, 0.05, 0, 0.8, 26, 4, [0xf0d040, 0xffffff, 0xd060c0, 0x6a8ae8, 0xe8403a]);
    return { geo: merge(parts), mat: SURF.leaf(), h: 0.3, r: 0.9 };
  },
  /** Bouche d'incendie (un coup : le jet d'eau !). */
  pc_hydrant() {
    return { geo: merge([P(cyl(0.18, 0.2, 0.08, 12), 0xb02a20, { y: 0.04 }), P(cyl(0.14, 0.15, 0.6, 12), 0xc8382a, { y: 0.38 }), P(sph(0.15, 12, 6, 0, TAU, 0, Math.PI / 2), 0xc8382a, { y: 0.68 }),
      P(cyl(0.18, 0.18, 0.05, 12), 0xa82a20, { y: 0.66 }), P(cyl(0.04, 0.04, 0.08, 6), 0xd8c070, { y: 0.84 }), P(cyl(0.065, 0.065, 0.14, 8), 0xc8382a, { x: 0.16, y: 0.46, rz: Math.PI / 2 }), P(cyl(0.065, 0.065, 0.14, 8), 0xc8382a, { x: -0.16, y: 0.46, rz: Math.PI / 2 })]),
      mat: SURF.metal(), h: 0.85, r: 0.25 };
  },
  /** Charrette de ballons de la foire. */
  pc_ballooncart() {
    const parts = [P(box(1.3, 0.6, 0.7), 0xd8403a, { y: 0.75 }), P(box(1.36, 0.06, 0.76), 0xf0f0e6, { y: 1.06 }), P(cyl(0.3, 0.3, 0.06, 12), 0x3a3a3e, { x: 0.45, y: 0.3, z: 0.38, rx: Math.PI / 2 }), P(cyl(0.3, 0.3, 0.06, 12), 0x3a3a3e, { x: -0.45, y: 0.3, z: 0.38, rx: Math.PI / 2 }),
      P(cyl(0.3, 0.3, 0.06, 12), 0x3a3a3e, { x: 0.45, y: 0.3, z: -0.38, rx: Math.PI / 2 }), P(cyl(0.3, 0.3, 0.06, 12), 0x3a3a3e, { x: -0.45, y: 0.3, z: -0.38, rx: Math.PI / 2 }), P(cyl(0.03, 0.03, 1.6, 5), 0xd8d8d8, { y: 1.85 })];
    const cols = [0xe03a4a, 0x3a8ae0, 0xf0c030, 0x40b060, 0xd060c0, 0xff8a3a, 0x6ad8e0];
    cols.forEach((c, i) => { const a = i * 0.9, x = Math.cos(a) * 0.35, z = Math.sin(a) * 0.35, y = 2.75 + (i % 3) * 0.22; parts.push(P(sph(0.2, 10, 8), c, { x, y, z, sy: 1.2 }), P(cyl(0.004, 0.004, y - 2.6, 3), 0xf0f0f0, { x: x / 2, y: (y + 2.6) / 2 - 0.2, z: z / 2 })); });
    return { geo: merge(parts), mat: SURF.rubber(), h: 3.2, r: 0.8 };
  },
  /** Pique-nique : nappe à carreaux, panier, pommes. */
  pc_picnic() {
    const parts = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) parts.push(P(box(0.3, 0.012, 0.3), (i + j) % 2 ? 0xd83a3a : 0xf6f2ea, { x: -0.75 + i * 0.3, y: 0.006, z: -0.75 + j * 0.3 }));
    parts.push(P(box(0.5, 0.3, 0.34), 0xb88a50, { x: 0.3, y: 0.15, z: -0.2 }), P(tor(0.2, 0.025, 4, 12, Math.PI), 0x9a7040, { x: 0.3, y: 0.3, z: -0.2 }), P(box(0.5, 0.02, 0.34), 0xd83a3a, { x: 0.3, y: 0.31, z: -0.2 }));
    for (let i = 0; i < 3; i++) parts.push(P(sph(0.07, 8, 6), 0xd82a2a, { x: -0.3 + i * 0.13, y: 0.07, z: 0.3 }));
    parts.push(P(cyl(0.05, 0.05, 0.3, 8), 0x3a8a4a, { x: -0.4, y: 0.15, z: -0.3 }), P(box(0.3, 0.06, 0.12), 0xe8b060, { x: -0.1, y: 0.04, z: -0.4 }));
    return { geo: merge(parts), mat: SURF.cloth(), h: 0.4, r: 0.9 };
  },
  /** Marelle dessinée à la craie sur les pavés (1 à 8, puis le ciel). */
  pc_marelle() {
    const chalk = 0xf4f2ee, parts = [];
    const cell = (x, z, col) => { parts.push(P(box(0.62, 0.012, 0.05), chalk, { x, y: 0.012, z: z - 0.31 }), P(box(0.62, 0.012, 0.05), chalk, { x, y: 0.012, z: z + 0.31 }), P(box(0.05, 0.012, 0.62), chalk, { x: x - 0.31, y: 0.012, z }), P(box(0.05, 0.012, 0.62), chalk, { x: x + 0.31, y: 0.012, z })); if (col) parts.push(P(box(0.5, 0.008, 0.5), col, { x, y: 0.008, z })); };
    const tints = [0xf0a0b8, 0xa8d0f0, 0xf6e08a, 0xb8e8a8];
    let z = 0, k = 0;
    for (const row of [[0], [0], [-0.33, 0.33], [0], [-0.33, 0.33], [0]]) { for (const x of row) cell(x, z, (k++ % 3 === 0) ? tints[k % 4] : 0); z += 0.66; }
    parts.push(P(cyl(0.45, 0.45, 0.012, 16, 1, false, 0, Math.PI), chalk, { y: 0.012, z: z - 0.1, ry: -Math.PI / 2 }));
    parts.push(P(sph(0.05, 6, 4), 0x9a9a98, { x: 0.12, y: 0.03, z: 1.3, sy: 0.5 }));   // le caillou
    return { geo: merge(parts), mat: SURF.stone(), h: 0.02, r: 0.6 };
  },
  /** Lettre envolée (objet à ramasser du défi du facteur). */
  pc_letteritem() {
    return { geo: merge([P(box(0.5, 0.34, 0.03), 0xfaf6ec, {}), P(box(0.5, 0.02, 0.032), 0xd8d0c0, { y: 0.06, rz: 0.55, x: -0.12 }), P(box(0.5, 0.02, 0.032), 0xd8d0c0, { y: 0.06, rz: -0.55, x: 0.12 }), P(cyl(0.06, 0.06, 0.04, 10), 0xd82a2a, { y: -0.02, z: 0.02, rx: Math.PI / 2 })]), h: 0.4, r: 0.3, unlit: true };
  },
  /** Pièce d'un vœu (objet à ramasser du défi de la fontaine). */
  pc_wishcoin() { return { geo: merge([P(cyl(0.3, 0.3, 0.06, 16), 0xffd23a, { rx: Math.PI / 2 }), P(cyl(0.2, 0.2, 0.07, 12), 0xf0b020, { rx: Math.PI / 2 })]), h: 0.6, r: 0.3, unlit: true }; },
});
