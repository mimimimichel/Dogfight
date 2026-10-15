/*
 * Matcha & Ainu — Niveau 7 : « La Ferme de Papi Berger ».
 * Une grande campagne (400 m de côté) : prés qui ondulent, grange rouge, moulin
 * sur sa colline, verger, mare aux canards, champ de tournesols, enclos des
 * cochons, belvédère, rochers… et des choses à découvrir loin des chemins.
 * Données pures (aucune dépendance) : utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   départ au sud (Mamie et Biscotte) ; la cour de la ferme au centre, avec la
 *   maison de Papi Berger à l'ouest et la grande grange à l'est (le grenier à foin
 *   s'ouvre sur sa façade) ; le poulailler à l'ouest ; le pré des moutons et leur
 *   enclos au nord-ouest ; le moulin sur sa colline au nord-est ; le belvédère tout
 *   au nord ; le verger et les vaches à l'est ; l'enclos des cochons (la flaque de
 *   boue !) et la mare aux canards au sud-est ; le champ de tournesols au sud-ouest ;
 *   le Rocher aux Corbeaux à l'ouest.
 *
 * Les 5 médailles demandent d'explorer : 6 moutons dans le pré + 2 agneaux perdus
 * très loin, 3 poules dans la cour + 3 poules échappées, Caramel perdu dans les
 * tournesols, les chats du grenier, 3 ailes du moulin dispersées à rapporter au moulin.
 */

export const ID = 7;
export const NAME = 'La Ferme de Papi Berger';
export const SAVE_KEY = 'dogfight.aventure.niveau7';
export const CAT_PLACE = 'dans le grenier à foin';
export const COLLECT_NAME = 'os dorés';
export const MUSIC = 'adv1';            // l'air joyeux du parc (au marimba) : la campagne en été
export const WATER_Y = 0;
export const WORLD = 400;               // côté du monde (m)
export const RADAR = 80;                // demi-côté de la mini-carte (m)
export const ISLAND_R = 182;
export const GRASS_K = 1.6;             // le monde est grand : un peu plus d'herbe

// Ambiance : matinée d'été, ciel bleu franc, lumière dorée
export const SKY = { top: 0x3a7ee0, horizon: 0xcfe8ff, bottom: 0xf4f0d8, sunDir: [0.45, 0.55, 0.42] };
export const LIGHT = { hemi: [0xeaf4ff, 0x6a5a30, 0.85], sun: [0xfff0d0, 2.5], fog: [90, 300] };
export const GRADE = { bloom: 0.55, saturation: 1.1, highTint: [0.02, 0.015, 0.0], shadowTint: [0.0, 0.005, 0.02] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.2, big: 2.1, small: 1.5, bushes: 1 };
export const PALETTE = {
  ground: [0x5cb83c, 0x8ad24e, 0x46a036],
  leaves: [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e, 0x62b844],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function gauss(x, z, cx, cz, r, h) { return h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)); }
const flatten = (h, x, z, c, r, y) => { const w = 1 - smooth(r * 0.65, r, Math.hypot(x - c.x, z - c.z)); return h * (1 - w) + y * w; };

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------
export const SPOTS = {
  spawn: { x: 0, z: 150 },
  mamie: { x: -7, z: 145 },
  yard: { x: 0, z: 62 },
  papi: { x: -16, z: 75 },
  margot: { x: 62, z: 8 },
  lookout: { x: 0, z: -140 },
};
export const BARN = { x: 22, z: 52, w: 12, d: 14, h: 6.2, ridge: 10.4 };      // façade (le grenier) au sud
export const HOUSE = { x: -22, z: 66, w: 10, d: 8, h: 4.6, ridge: 7.6 };      // porte au sud
export const HENS_YARD = { x: -62, z: 52, r: 8.5 };
export const HENHOUSE = { x: HENS_YARD.x - 9, z: HENS_YARD.z - 1, w: 4.2, d: 4.2, h: 2.6, ridge: 4.0 };
export const BASKET = { x: HENS_YARD.x - 4.6, z: HENS_YARD.z + 3.2 };
export const PEN = { x: -50, z: -70, w: 16, d: 11 };                           // enclos des moutons (porte au sud)
export const GATE = { x: PEN.x, w: 7 };                                        // ouverture de la porte de l'enclos
export const FUNNEL = 4.5;                                                     // profondeur de l'avant en V de l'enclos
export const MILL = { x: 95, z: -75, r: 2.4, h: 12 };
export const ORCHARD = { x: 115, z: 15 };
export const POND = { x: 95, z: 118, r: 8.6 };
export const PIGPEN = { x: 55, z: 112, w: 10, d: 8 };
export const MUD = { x: PIGPEN.x + 1.5, z: PIGPEN.z + 1.6, r: 2.7 };
export const SUNFLOWERS = { x: -95, z: 105, w: 22, d: 16 };
export const GARDEN = { x: -12, z: 86 };
export const TRACTOR = { x: 8, z: 74, yaw: Math.PI / 2 };
export const CROWS = { x: -125, z: -55 };                                       // le Rocher aux Corbeaux

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  let h = 2.4 * (1 - smooth(0.86, 1.0, r)) - 3.2 * smooth(0.95, 1.2, r);
  const inland = 1 - smooth(0.78, 0.96, r);
  // prés qui ondulent
  h += (0.6 * Math.sin(x * 0.045 + 0.6) * Math.cos(z * 0.04 - 0.3) + 0.4 * Math.sin(x * 0.025 - z * 0.035 + 1.2)) * inland;
  // collines
  h += gauss(x, z, MILL.x, MILL.z, 30, 5) + gauss(x, z, SPOTS.lookout.x, SPOTS.lookout.z, 28, 6) + gauss(x, z, -62, -38, 30, 1.4)
    + gauss(x, z, 60, 40, 25, 1.6) + gauss(x, z, -130, 60, 20, 2) + gauss(x, z, 140, -30, 22, 2.2) + gauss(x, z, -40, 125, 20, 1.5);
  // la mare aux canards
  h -= 6 * Math.exp(-((x - POND.x) ** 2 + (z - POND.z) ** 2) / (POND.r * POND.r * 0.82));
  // lieux aplanis
  h = flatten(h, x, z, SPOTS.yard, 30, 2.5);
  h = flatten(h, x, z, { x: PEN.x, z: PEN.z + 3 }, 17, 2.6);
  h = flatten(h, x, z, PIGPEN, 9, 2.45);
  h = flatten(h, x, z, HENS_YARD, 13, 2.5);
  h = flatten(h, x, z, SUNFLOWERS, 18, 2.55);
  h = flatten(h, x, z, MILL, 8, 7.2);
  h = flatten(h, x, z, { x: SPOTS.lookout.x, z: SPOTS.lookout.z + 2 }, 10, 8.0);
  h = flatten(h, x, z, SPOTS.spawn, 9, 2.45);
  return h;
}
export function inWater(x, z, margin) { return heightAt(x, z) < WATER_Y + (margin || 0); }
/** Pas d'herbe haute : cour, mare, boue, champ de tournesols. */
export function noGrass(x, z) {
  if (Math.hypot(x - SPOTS.yard.x, z - SPOTS.yard.z) < 8) return true;
  if (Math.hypot(x - MUD.x, z - MUD.z) < MUD.r + 0.6) return true;
  if (Math.abs(x - SUNFLOWERS.x) < SUNFLOWERS.w / 2 && Math.abs(z - SUNFLOWERS.z) < SUNFLOWERS.d / 2) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// bâtiments (solides ; la caméra se rapproche quand ils la cachent)
const building = (B, map) => { const g = heightAt(B.x, B.z); B.y = g; return box(B.x, B.z, B.w, B.d, g - 1, g + B.ridge, { kind: 'house', solid: true, cam: true, map }); };
building(BARN, '#c8463a'); building(HOUSE, '#f0e6d2'); building(HENHOUSE, '#b07a48');

// Le grenier à foin : un plancher qui sort de la façade de la grange (on y monte par les bottes de foin)
const BG = BARN.y, BF = BARN.z + BARN.d / 2, BX = BARN.x - BARN.w / 2;
export const LOFT = { x: BARN.x - 0.5, z: BF + 1.5, w: 9, d: 3, top: BG + 4.4 };
box(LOFT.x, LOFT.z, LOFT.w, LOFT.d, LOFT.top - 0.4, LOFT.top, { kind: 'plank' });
export const LOFT_BALES = [
  { x: BX - 0.4, z: BF + 7.4, w: 2.1, d: 1.4, top: BG + 1.1 },
  { x: BX - 0.4, z: BF + 5.1, w: 2.1, d: 1.4, top: BG + 2.2 },
  { x: BX + 0.1, z: BF + 2.6, w: 2.1, d: 1.6, top: BG + 3.3 },
].map(b => Object.assign(b, { y: heightAt(b.x, b.z), col: box(b.x, b.z, b.w, b.d, heightAt(b.x, b.z) - 0.5, b.top, { kind: 'hay' }) }));

// Pyramide de bottes de foin dans la cour (une aile du moulin est tout en haut)
export const HAY_STACK = [
  { x: -12.2, z: 50, w: 2.1, d: 1.4 }, { x: -10.1, z: 50, w: 2.1, d: 1.4, lv: 1 }, { x: -8.0, z: 50, w: 2.1, d: 1.4, lv: 2 },
].map((b) => { const g = heightAt(b.x, b.z); b.y = g; b.top = g + 1.1 * ((b.lv || 0) + 1); b.col = box(b.x, b.z, b.w, b.d, g - 0.5, b.top, { kind: 'hay' }); return b; });
// grosses bottes rondes un peu partout (on peut grimper dessus : il y a parfois un os en haut)
export const ROUND_BALES = [[-4, 74, 0.3], [-2, 76, 1.2], [34, 66, 0.2], [10, 30, 1.4], [-30, 30, 0.7], [70, -30, 0.4], [-80, 20, 1.0], [40, 80, 2.0],
  [-30, -100, 0.6], [130, 60, 1.1], [-110, 128, 0.3], [20, -60, 0.9], [-150, -10, 1.6], [80, 150, 0.5]]
  .map(([x, z, rot]) => { const g = heightAt(x, z); cyl(x, z, 0.95, g - 0.5, g + 1.6, { kind: 'rock' }); return { x, z, y: g, rot }; });

// Le moulin : tour de pierre, escalier de bois tout autour, balcon en haut
const MG = heightAt(MILL.x, MILL.z);
MILL.y = MG;
cyl(MILL.x, MILL.z, MILL.r, MG - 1, MG + MILL.h, { kind: 'rock' });
export const MILL_STEPS = [];
for (let i = 0; i < 9; i++) {
  const a = 2.66 + i * 0.48, R = 4.5;
  const s = { x: MILL.x + Math.cos(a) * R, z: MILL.z + Math.sin(a) * R, top: MG + 0.95 * (i + 1), r: 0.95, a };
  s.col = cyl(s.x, s.z, s.r, s.top - 0.35, s.top, { kind: 'plank' });
  MILL_STEPS.push(s);
}
export const BALCONY = { x: MILL.x, z: MILL.z, r: 3.6, top: MG + 9.2 };
cyl(BALCONY.x, BALCONY.z, BALCONY.r, BALCONY.top - 0.35, BALCONY.top, { kind: 'plank' });
export const SAIL_HUB = { x: MILL.x, z: MILL.z + 2.95, y: MG + 10.6, R: 6 };

// Le Rocher aux Corbeaux : des blocs de pierre en escalier (une aile du moulin est tout en haut)
export const CROW_ROCKS = [[4, 5, 1.6, 1.2], [1.5, 2.5, 1.5, 2.4], [-1, 0, 1.6, 3.5], [-3.5, -2.5, 1.9, 4.6]].map(([dx, dz, r, h]) => {
  const x = CROWS.x + dx, z = CROWS.z + dz, g = heightAt(x, z);
  const rk = { x, z, r, top: g + h, y: g };
  rk.col = cyl(x, z, r, g - 1, rk.top, { kind: 'rock' });
  return rk;
});

// La mare : un ponton, deux pierres de gué et un îlot
const PG = (x, z) => Math.max(WATER_Y, heightAt(x, z));
export const JETTY = { x: POND.x, z0: POND.z + 9.5, z1: POND.z + 3.2, w: 1.8, top: 1.05 };
box(JETTY.x, (JETTY.z0 + JETTY.z1) / 2, JETTY.w, JETTY.z0 - JETTY.z1, PG(JETTY.x, POND.z + 6) - 1, JETTY.top, { kind: 'plank' });
export const STONES = [{ x: POND.x + 1.4, z: POND.z + 1.4, r: 0.95, top: 0.85 }, { x: POND.x - 0.7, z: POND.z - 0.9, r: 0.95, top: 0.95 }];
for (const s of STONES) s.col = cyl(s.x, s.z, s.r, -2, s.top, { kind: 'stone', shore: true });
export const ISLET = { x: POND.x + 0.6, z: POND.z - 3.8, r: 1.7, top: 1.0 };
cyl(ISLET.x, ISLET.z, ISLET.r, -2, ISLET.top, { kind: 'islet', shore: true });

// Clôtures (segments) : enclos des moutons, enclos des cochons, poulailler
export const FENCES = [];
function fence(x1, z1, x2, z2, low) {
  const f = { x1, z1, x2, z2, low: !!low };
  FENCES.push(f);
  const len = Math.hypot(x2 - x1, z2 - z1);
  let g = -9;
  for (let k = 0; k <= 8; k++) g = Math.max(g, heightAt(x1 + (x2 - x1) * k / 8, z1 + (z2 - z1) * k / 8));
  const top = g + (low ? 0.85 : 1.15);
  if (Math.abs(x1 - x2) < 1e-6 || Math.abs(z1 - z2) < 1e-6) {
    box((x1 + x2) / 2, (z1 + z2) / 2, Math.max(0.35, Math.abs(x2 - x1)), Math.max(0.35, Math.abs(z2 - z1)), g - 1, top, { kind: 'fence', solid: true });
  } else {
    const n = Math.max(1, Math.round(len / 1.1));
    for (let k = 0; k <= n; k++) cyl(x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, 0.55, g - 1, top, { kind: 'fence', solid: true });
  }
  return f;
}
export const PEN_FRONT = PEN.z + PEN.d / 2;                                   // l'avant du carré de l'enclos
export const GATE_Z = PEN_FRONT + FUNNEL;                                      // la porte, au bout de l'avant en V
{
  // le carré de l'enclos, puis l'avant en V : toute la largeur de l'enclos mène à la porte (pas de recoin où se coincer)
  const P = PEN, x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = PEN_FRONT;
  fence(x0, z0, x1, z0); fence(x0, z0, x0, z1); fence(x1, z0, x1, z1);
  fence(x0, z1, GATE.x - GATE.w / 2, GATE_Z);
  fence(x1, z1, GATE.x + GATE.w / 2, GATE_Z);
}
{
  const P = PIGPEN, x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = P.z + P.d / 2;
  fence(x0, z0, P.x - 1.6, z0, true); fence(P.x + 1.6, z0, x1, z0, true);          // entrée au nord
  fence(x0, z0, x0, z1, true); fence(x1, z0, x1, z1, true); fence(x0, z1, x1, z1, true);
}
{
  // poulailler : barrière ronde basse, ouverte vers la cour (à l'est)
  const Y = HENS_YARD, n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (Math.cos((a0 + a1) / 2) > 0.93) continue;
    fence(Y.x + Math.cos(a0) * Y.r, Y.z + Math.sin(a0) * Y.r, Y.x + Math.cos(a1) * Y.r, Y.z + Math.sin(a1) * Y.r, true);
  }
}
export const PEN_INSIDE = { x0: PEN.x - PEN.w / 2 + 0.7, x1: PEN.x + PEN.w / 2 - 0.7, z0: PEN.z - PEN.d / 2 + 0.7, z1: PEN_FRONT - 0.5 };
/** Demi-largeur de l'avant en V à la profondeur z (de la porte au carré). */
export const vHalf = (z) => GATE.w / 2 + (GATE_Z - z) * ((PEN.w - GATE.w) / 2 / FUNNEL);
/** Un mouton est-il entré dans l'enclos ? (porte franchie, dans le carré ou dans l'avant en V) */
export function inPen(x, z) {
  if (z >= GATE_Z - 0.6 || z < PEN_INSIDE.z0 - 0.3) return false;
  if (z <= PEN_FRONT) return x > PEN_INSIDE.x0 - 0.3 && x < PEN_INSIDE.x1 + 0.3;
  return Math.abs(x - GATE.x) < vHalf(z) - 0.4;
}

// Le belvédère : un banc et une longue-vue tout en haut de la colline du nord
export const LOOKOUT = { x: SPOTS.lookout.x, z: SPOTS.lookout.z, y: heightAt(SPOTS.lookout.x, SPOTS.lookout.z) };
box(LOOKOUT.x - 2.5, LOOKOUT.z - 1, 2, 0.6, LOOKOUT.y - 0.5, LOOKOUT.y + 0.5, { kind: 'plank' });

// Caisses (cassables) : un cœur dedans
export const crates = [
  { id: 'c1', x: -4, z: 96, content: 'heart' },
  { id: 'c2', x: 60, z: -40, content: 'heart' },
  { id: 'c3', x: -75, z: -15, content: 'heart' },
  { id: 'c4', x: 128, z: 30, content: 'heart' },
  { id: 'c5', x: -70, z: 120, content: 'heart' },
  { id: 'c6', x: 20, z: -120, content: 'heart' },
  { id: 'c7', x: -112, z: -40, content: 'heart' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// ---------------------------------------------------------------------------
// Support : sol le plus haut sous un point (terrain + dessus des obstacles)
// ---------------------------------------------------------------------------
export function colliderTop(c) { return c.off ? -Infinity : c.y1; }
export function inside(c, x, z, margin) {
  margin = margin || 0;
  if (c.type === 'box') return Math.abs(x - c.x) <= c.w / 2 + margin && Math.abs(z - c.z) <= c.d / 2 + margin;
  return (x - c.x) ** 2 + (z - c.z) ** 2 <= (c.r + margin) ** 2;
}
export function supportAt(x, z, yFeet, t, step) {
  step = step === undefined ? 0.6 : step;
  let best = heightAt(x, z), col = null;
  for (const c of colliders) {
    const top = colliderTop(c, t);
    if (top > best && top <= yFeet + step && inside(c, x, z, 0.25)) { best = top; col = c; }
  }
  return { y: best, collider: col };
}
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of colliders) if (!c.off && c.kind !== 'house' && c.kind !== 'fence' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return Math.max(best, WATER_Y + 0.4);
}

// ---------------------------------------------------------------------------
// Animaux et objets de la ferme
// ---------------------------------------------------------------------------
// 6 moutons dans le pré au sud de leur enclos, et 2 agneaux perdus très loin (ils suivent le chien qui les trouve)
export const SHEEP = [[-58, -38], [-52, -34], [-46, -40], [-62, -31], [-50, -28], [-42, -33], [24, -142, 1], [-152, 22, 1]]
  .map(([x, z, lamb], i) => ({ id: 's' + i, x, z, y: heightAt(x, z), lamb: !!lamb }));
// 6 poules : 3 dans leur cour, 3 échappées (verger, tournesols, pied du moulin). Chacune a un œuf.
export const HENS = [
  [HENS_YARD.x + 2, HENS_YARD.z - 3, HENS_YARD], [HENS_YARD.x - 2, HENS_YARD.z + 3, HENS_YARD], [HENS_YARD.x + 4, HENS_YARD.z + 2, HENS_YARD],
  [ORCHARD.x + 2, ORCHARD.z + 12, { x: ORCHARD.x + 2, z: ORCHARD.z + 12, r: 5 }],
  [SUNFLOWERS.x - 5, SUNFLOWERS.z + 15, { x: SUNFLOWERS.x - 5, z: SUNFLOWERS.z + 15, r: 5 }],
  [MILL.x - 22, MILL.z + 24, { x: MILL.x - 22, z: MILL.z + 24, r: 5 }],
].map(([x, z, home], i) => ({ id: 'h' + i, x, z, y: heightAt(x, z), home: { x: home.x, z: home.z, r: home.r }, yard: home === HENS_YARD }));
export const EGGS_NEEDED = 6;
// Caramel, le cochonnet perdu au milieu des tournesols
export const PIGLET = { x: SUNFLOWERS.x - 6, z: SUNFLOWERS.z + 3.2 };
PIGLET.y = heightAt(PIGLET.x, PIGLET.z);
export const PIGLET_HOME = { x: PIGPEN.x - 2.5, z: PIGPEN.z - 1 };
PIGLET_HOME.y = heightAt(PIGLET_HOME.x, PIGLET_HOME.z);
// les 3 ailes du moulin, emportées par le vent (et un peu par les chats…) : à rapporter au moulin
const crowTop = CROW_ROCKS[CROW_ROCKS.length - 1];
export const SAIL_PARTS = [
  { id: 'p1', x: HAY_STACK[2].x, z: HAY_STACK[2].z, y: HAY_STACK[2].top + 1.0, where: 'en haut des bottes de foin, dans la cour' },
  { id: 'p2', x: crowTop.x, z: crowTop.z, y: crowTop.top + 1.0, where: 'tout en haut du Rocher aux Corbeaux, à l\'ouest' },
  { id: 'p3', x: ISLET.x, z: ISLET.z, y: ISLET.top + 1.0, where: 'sur l\'îlot de la mare aux canards, au sud-est' },
];
// Margot la vache et ses copines (on peut leur parler, elles ne bougent pas beaucoup)
export const COWS = [
  { id: 'margot', x: SPOTS.margot.x, z: SPOTS.margot.z, yaw: -0.9 },
  { id: 'cow2', x: 72, z: 0, yaw: -0.8 },
  { id: 'cow3', x: 55, z: -3, yaw: 1.2 },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));
for (const c of COWS) cyl(c.x, c.z, 1.1, c.y - 0.5, c.y + 1.6, { kind: 'cow', solid: true });

// Points de passage (drapeaux) : on y repart après une grosse chute
export const CHECKPOINTS = [
  { id: 0, x: 4, z: 146, name: 'Départ' },
  { id: 1, x: 9, z: 48, name: 'La cour de la ferme' },
  { id: 2, x: -60, z: -20, name: 'Le pré des moutons' },
  { id: 3, x: 80, z: -58, name: 'La colline du moulin' },
  { id: 4, x: 100, z: 32, name: 'Le verger' },
  { id: 5, x: -76, z: 96, name: 'Les tournesols' },
  { id: 6, x: 74, z: 124, name: 'La mare aux canards' },
  { id: 7, x: 9, z: -132, name: 'Le belvédère' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// ---------------------------------------------------------------------------
// Os dorés (100), dans tout le monde : sur les chemins, et cachés loin d'eux
// ---------------------------------------------------------------------------
function line(ax, az, bx, bz, n, lift) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
  }
  return pts;
}
function ring(cx, cz, r, n, lift, a0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (a0 || 0);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
  }
  return pts;
}
const all = [].concat(
  line(0, 140, 0, 82, 5),                                                  // départ → cour
  ring(SPOTS.yard.x, SPOTS.yard.z, 6, 4, 1.1, 0.4),                        // la cour
  LOFT_BALES.map(b => ({ x: b.x, z: b.z, y: b.top + 1.1 })),               // escalier de foin
  line(LOFT.x - 3.5, LOFT.z, LOFT.x + 3.5, LOFT.z, 3).map(p => ({ x: p.x, z: p.z, y: LOFT.top + 1.1 })),
  HAY_STACK.map(b => ({ x: b.x, z: b.z, y: b.top + 1.1 })),                // pyramide de foin
  line(-12, 57, -48, 53, 4),                                               // vers le poulailler
  ring(HENS_YARD.x, HENS_YARD.z, 4.5, 4, 1.1, 0.5),                        // le poulailler
  line(-8, 46, -46, -50, 5),                                               // vers le pré
  line(-64, -26, -40, -26, 3),                                             // le pré des moutons
  line(GATE.x - 3, GATE_Z + 2, GATE.x + 3, GATE_Z + 2, 2),                 // devant la porte de l'enclos
  [{ x: PEN.x, z: PEN.z, y: groundY(PEN.x, PEN.z) + 1.1 }],                // dans l'enclos
  line(12, 44, 76, -54, 4),                                                // vers le moulin
  MILL_STEPS.map(s => ({ x: s.x, z: s.z, y: s.top + 1.1 })),               // l'escalier du moulin
  line(76, -84, 16, -128, 3),                                              // du moulin au belvédère
  ring(LOOKOUT.x, LOOKOUT.z + 2, 5, 4, 1.1, 0.3),                          // le belvédère
  line(-14, -130, -44, -82, 3),                                            // du belvédère à l'enclos
  line(36, 66, 96, 26, 3),                                                 // vers le verger
  ring(ORCHARD.x, ORCHARD.z, 3.5, 4, 1.1, 0.8),                            // le verger
  line(10, 80, 46, 106, 3),                                                // vers les cochons
  [{ x: PIGPEN.x - 2, z: PIGPEN.z + 2, y: groundY(PIGPEN.x - 2, PIGPEN.z + 2) + 1.1 }],
  line(64, 114, 84, 124, 3),                                               // vers la mare
  [{ x: JETTY.x, z: JETTY.z0 - 1.5, y: JETTY.top + 1.1 }, { x: JETTY.x, z: JETTY.z1 + 1, y: JETTY.top + 1.1 }],
  STONES.map(s => ({ x: s.x, z: s.z, y: s.top + 1.1 })),                   // pierres de gué
  line(-14, 80, -76, 100, 3),                                              // vers les tournesols
  line(SUNFLOWERS.x + 8, SUNFLOWERS.z, SUNFLOWERS.x - 8, SUNFLOWERS.z, 3), // l'allée des tournesols
  line(-68, 42, -116, -44, 3),                                             // vers le Rocher aux Corbeaux
  CROW_ROCKS.map(k => ({ x: k.x, z: k.z, y: k.top + 1.1 })),               // sur les rochers
  ROUND_BALES.slice(6).map(b => ({ x: b.x, z: b.z, y: b.y + 1.6 + 1.1 })), // cachés en haut des grosses bottes rondes
  [{ x: SPOTS.margot.x + 3, z: SPOTS.margot.z + 3, y: groundY(SPOTS.margot.x + 3, SPOTS.margot.z + 3) + 1.1 }],
);
export const _POINTS = all.length;
export const bones = all.slice(0, 100).map((p, i) => ({ id: 'f' + i, x: p.x, y: p.y, z: p.z }));
export const balls = [];

// Médailles Patounes (les 5 missions de la ferme)
export const medals = [
  { id: 'm_sheep', x: PEN.x, z: PEN.z - 2, y: heightAt(PEN.x, PEN.z) + 1.6, label: 'Les moutons à l\'enclos', visible: false },
  { id: 'm_eggs', x: BASKET.x + 1.6, z: BASKET.z + 0.6, y: heightAt(BASKET.x, BASKET.z) + 1.6, label: 'Le panier d\'œufs', visible: false },
  { id: 'm_piglet', x: PIGPEN.x - 2.5, z: PIGPEN.z + 1.5, y: heightAt(PIGPEN.x, PIGPEN.z) + 1.6, label: 'Caramel le cochonnet', visible: false },
  { id: 'm_cats', x: LOFT.x + 2.5, z: LOFT.z, y: LOFT.top + 1.4, label: 'Le grenier à foin', visible: false },
  { id: 'm_mill', x: MILL.x - 1.2, z: MILL.z + 2.5, y: BALCONY.top + 1.5, label: 'Le moulin réparé', visible: false },
];

// Chats farceurs : 4 au grenier, et d'autres qui se promènent partout
export const cats = [
  { id: 'cat1', x: LOFT.x - 3.2, z: LOFT.z - 0.4, group: 'clearing' },
  { id: 'cat2', x: LOFT.x - 1, z: LOFT.z + 0.6, group: 'clearing' },
  { id: 'cat3', x: LOFT.x + 1.4, z: LOFT.z - 0.5, group: 'clearing' },
  { id: 'cat4', x: LOFT.x + 3.4, z: LOFT.z + 0.5, group: 'clearing' },
  { id: 'cat5', x: ORCHARD.x - 4, z: ORCHARD.z - 12, group: 'roam' },
  { id: 'cat6', x: 80, z: 105, group: 'roam' },
  { id: 'cat7', x: -100, z: -20, group: 'roam' },
  { id: 'cat8', x: 60, z: -90, group: 'roam' },
  { id: 'cat9', x: -70, z: 85, group: 'roam' },
].map(c => Object.assign(c, { y: c.group === 'clearing' ? LOFT.top : heightAt(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: heightAt(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.mamie.x + 1.6, z: SPOTS.mamie.z + 1.2, y: heightAt(SPOTS.mamie.x + 1.6, SPOTS.mamie.z + 1.2) },
  papi: { x: SPOTS.papi.x, z: SPOTS.papi.z, y: heightAt(SPOTS.papi.x, SPOTS.papi.z) },
};
cyl(npcs.papi.x, npcs.papi.z, 0.7, npcs.papi.y - 0.5, npcs.papi.y + 1.4, { kind: 'npc', solid: true });

// Panneaux
export const signs = [
  { x: 3.6, z: 132, text: ['La Ferme de Papi Berger', '↑ La cour, la grange et la maison de Papi', 'Tout est grand ici : suivez les chemins de terre !'] },
  { x: 5, z: 80, text: ['La cour de la ferme', '← Les tournesols et le poulailler', '↑ Le pré des moutons et le moulin', '→ Le verger, les cochons et la mare'] },
  { x: -40, z: -48, text: ['Le pré des moutons', 'Poussez les moutons doucement', 'vers la porte de l\'enclos !', 'Un « Ouaf ! » les fait courir plus loin.'] },
  { x: -50, z: 60, text: ['Le poulailler', 'Attrapez les poules : elles donnent un œuf !', 'Posez les œufs dans le panier.', 'Trois poules se sont sauvées très loin…'] },
  { x: 75, z: -50, text: ['Le moulin', 'Le vent a emporté trois de ses ailes…', 'Rapportez-les en haut du moulin !'] },
  { x: -108, z: -38, text: ['Le Rocher aux Corbeaux', 'Sautez de pierre en pierre jusqu\'en haut.'] },
  { x: 8, z: -124, text: ['Le belvédère', 'D\'ici, on voit toute la ferme !'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: heightAt(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Chemins de terre
export const PATHS = [
  [[0, 148], [0, 70]], [[-8, 58], [-52, 53]], [[-6, 48], [-48, -54]], [[8, 46], [78, -58]], [[6, 70], [32, 68]], [[32, 68], [98, 24]],
  [[8, 78], [50, 106]], [[60, 112], [86, 122]], [[-10, 78], [-82, 100]], [[78, -82], [12, -128]], [[-10, -128], [-46, -80]], [[-66, 46], [-118, -46]],
  [[-6, 66], [-16, 72]],
];

export const CRYSTALS = [];
export const ruins = [];

// Arbres : le verger (pommiers), et de grands arbres au bord des prés et sur la côte
export const trees = [];
export const APPLE_TREES = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const x = ORCHARD.x - 6 + i * 6 + (j % 2) * 1.2, z = ORCHARD.z - 6 + j * 6;
  if (i === 1 && j === 1) continue;                       // une clairière au milieu du verger
  const t = { x, z, y: heightAt(x, z), s: 0.85, h: 3.8, apple: true };
  trees.push(t); APPLE_TREES.push(t);
}
{
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const keep = [[SPOTS.yard, 32], [{ x: PEN.x, z: PEN.z + 4 }, 18], [HENS_YARD, 13], [MILL, 10], [POND, 13], [PIGPEN, 10], [SUNFLOWERS, 17], [SPOTS.spawn, 12],
    [ORCHARD, 14], [SPOTS.margot, 14], [{ x: 62, z: -2 }, 12], [HOUSE, 12], [GARDEN, 6], [LOOKOUT, 9], [CROWS, 9], [{ x: -52, z: -33 }, 18]];
  let guard = 0;
  while (trees.length < APPLE_TREES.length + 58 && guard++ < 20000) {
    const a = rnd() * Math.PI * 2, d = 20 + rnd() * 155;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < 1.4) continue;
    if (keep.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
    if (SHEEP.some(s => Math.hypot(x - s.x, z - s.z) < 6)) continue;
    if (PATHS.some(([[ax, az], [bx, bz]]) => {
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
      return Math.hypot(x - ax - t * dx, z - az - t * dz) < 4;
    })) continue;
    if (colliders.some(c => inside(c, x, z, 2.5))) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 8)) continue;
    if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (signs.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (CHECKPOINTS.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    if (HENS.some(c => Math.hypot(c.home.x - x, c.home.z - z) < (c.home.r || 5) + 2)) continue;
    if (all.some(b => Math.hypot(b.x - x, b.z - z) < 2)) continue;
    trees.push({ x, z, y: h, s: 0.9 + rnd() * 0.5, h: 6 + rnd() * 2.5 });
  }
  for (const t of trees) cyl(t.x, t.z, (t.apple ? 0.45 : 0.55) * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}

/** Mini-carte : la boue, les tournesols, l'enclos, le moulin. */
export function mapColor(x, z) {
  if (Math.hypot(x - MUD.x, z - MUD.z) < MUD.r) return [122, 84, 50];
  const S = SUNFLOWERS;
  if (Math.abs(x - S.x) < S.w / 2 && Math.abs(z - S.z) < S.d / 2) return [236, 200, 60];
  if (x > PEN.x - PEN.w / 2 && x < PEN.x + PEN.w / 2 && z > PEN.z - PEN.d / 2 && z < PEN_FRONT) return [150, 205, 110];
  if (Math.hypot(x - MILL.x, z - MILL.z) < MILL.r + 0.6) return [190, 180, 168];
  return null;
}
export { clamp as _clamp };
