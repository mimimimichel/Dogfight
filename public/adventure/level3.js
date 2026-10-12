/*
 * Matcha & Ainu — Niveau 3 : « Port-Croquette ».
 * Un quartier de ville au bord de la mer, à explorer à pied ou en kart.
 * Données pures (aucune dépendance) : rues, immeubles, port, missions.
 * Utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   au centre, la place de la Fontaine (Mamie) ;
 *   au sud, le boulevard du Port, les quais, la jetée et le phare ;
 *   au sud-ouest, le garage de Rita (karts) ; au sud-est, la boulangerie de Bruno ;
 *   à l'ouest, le commissariat ; au nord, l'hôtel de ville ;
 *   au nord-est, le parc des Mouettes et le terrain de skate.
 */

export const ID = 3;
export const NAME = 'Port-Croquette';
export const SAVE_KEY = 'dogfight.aventure.niveau3';
export const CAT_PLACE = 'en ville';
export const COLLECT_NAME = 'pièces d\'or';
export const MEDAL_TITLE = 'TROPHÉE !';
export const WATER_Y = 0;
export const GROUND = 2;

// Ambiance : matinée ensoleillée au bord de la mer
export const SKY = { top: 0x2a7ae0, horizon: 0xc4e6fa, bottom: 0xe0f2ff, sunDir: [0.42, 0.62, 0.36] };
export const LIGHT = { hemi: [0xeaf4ff, 0x8a7a68, 0.85], sun: [0xfff0d8, 2.5], fog: [90, 260] };
export const TREE_STYLE = { min: 4, extra: 2, rad: 0.95, big: 1.6, small: 1.15, bushes: 0 };
export const PALETTE = {
  ground: [0x62b444, 0x7cc650, 0x4aa03c],
  leaves: [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// Limites de la ville (au-delà : plage puis mer ; au sud : le quai)
export const CITY = { x0: -66, x1: 66, z0: -66, z1: 42 };
export const QUAY_Z = 41.6;

/** Hauteur du terrain : la ville est plate, la plage descend vers la mer. */
export function heightAt(x, z) {
  const dx = Math.max(0, Math.abs(x) - CITY.x1), dn = Math.max(0, CITY.z0 - z);
  const d = Math.hypot(dx, dn);
  let h = GROUND;
  if (d > 0) h = 1.4 * (1 - smooth(1, 12, d)) + 0.6 * (1 - smooth(0, 1.5, d)) - 3 * smooth(8, 16, d);
  // le quai : à pic sur la mer
  if (z > CITY.z1) h = Math.min(h, GROUND - 6 * smooth(CITY.z1, CITY.z1 + 1.5, z));
  return h;
}

// ---------------------------------------------------------------------------
// Rues et pâtés de maisons
// ---------------------------------------------------------------------------
export const ROAD_HW = 4;               // demi-largeur d'une rue
export const SIDEWALK = 2.5;            // trottoir à l'intérieur de chaque pâté
export const AVENUES = [-40, -14, 14, 40];       // rues nord-sud (x)
export const STREETS = [-40, -14, 12];           // rues est-ouest (z)
export const BOULEVARD = 34;                      // boulevard du Port (z)
export const ROADS = [
  ...AVENUES.map(x => ({ x0: x - ROAD_HW, x1: x + ROAD_HW, z0: CITY.z0, z1: BOULEVARD + ROAD_HW })),
  ...STREETS.map(z => ({ x0: CITY.x0, x1: CITY.x1, z0: z - ROAD_HW, z1: z + ROAD_HW })),
  { x0: CITY.x0, x1: CITY.x1, z0: BOULEVARD - ROAD_HW, z1: BOULEVARD + ROAD_HW },
];
export function onRoad(x, z) { return ROADS.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1); }

const XS = [[-66, -44], [-36, -18], [-10, 10], [18, 36], [44, 66]];
const ZS = [[-66, -44], [-36, -18], [-10, 8], [16, 30]];
const SPECIAL = { '2,0': 'hall', '0,1': 'police', '3,1': 'park', '4,1': 'skate', '2,2': 'plaza', '1,3': 'garage', '2,3': 'market', '3,3': 'bakery' };
export const BLOCKS = [];
XS.forEach(([x0, x1], i) => ZS.forEach(([z0, z1], j) => BLOCKS.push({ i, j, x0, x1, z0, z1, type: SPECIAL[i + ',' + j] || 'city' })));
const blockOf = (type) => BLOCKS.find(b => b.type === type);
const inner = (b) => ({ x0: b.x0 + SIDEWALK, x1: b.x1 - SIDEWALK, z0: b.z0 + SIDEWALK, z1: b.z1 - SIDEWALK });

export const PARK = inner(blockOf('park'));
export const PLAZA = blockOf('plaza');

/** Vrai là où il n'y a pas d'herbe (la ville est pavée, sauf le parc). */
export function inWater(x, z) {
  if (x < CITY.x0 || x > CITY.x1 || z < CITY.z0 || z > CITY.z1 + 0.5) return false;
  return !(x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1);
}

/** Couleur de la mini-carte (null : couleur du relief). */
export function mapColor(x, z) {
  if (x < CITY.x0 || x > CITY.x1 || z < CITY.z0 || z > CITY.z1) return null;
  if (onRoad(x, z)) return [84, 88, 100];
  if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return [110, 180, 80];
  if (x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1) return [236, 214, 170];
  return [206, 200, 190];
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };
const boxR = (x0, x1, z0, z1, y0, y1, extra) => box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y0, y1, extra);

let seed = 31;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];

export const FACADES = [0xf4c8a8, 0xf6e0a0, 0xbfe0c8, 0xb8d4f0, 0xf0b8c0, 0xeadccb, 0xd0c4ea, 0xf8eedc, 0xe8a888, 0xa8d8d8];
export const buildings = [];
export const balconies = [];
export const awnings = [];
export const bouncers = [];   // auvents rebondissants (interface commune avec la forêt)

/**
 * Immeuble (boîte solide). side : façade côté rue ('n', 's', 'e', 'w').
 * feat : 'balcony' (balcons en escalier jusqu'au toit), 'awning' (auvent rebondissant).
 */
function building(x0, x1, z0, z1, h, side, feat, extra) {
  const b = Object.assign({ x0, x1, z0, z1, h, top: GROUND + h, side, color: pick(FACADES), roof: pick([0x8a7a70, 0x6e7480, 0xb06a4a, 0x7a8a6a]) }, extra || {});
  b.col = boxR(x0, x1, z0, z1, GROUND - 1, b.top, { kind: 'bldg', solid: true, cam: true, map: '#9a8a7c' });
  buildings.push(b);
  if (feat === 'balcony') addBalconies(b);
  else if (feat === 'awning') addAwning(b);
  return b;
}

/** Repère de façade : point au ras du mur, direction le long du mur, normale vers la rue. */
function facade(b) {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  switch (b.side) {
    case 'n': return { ox: cx, oz: b.z0, ux: 1, uz: 0, nx: 0, nz: -1, len: b.x1 - b.x0 };
    case 's': return { ox: cx, oz: b.z1, ux: 1, uz: 0, nx: 0, nz: 1, len: b.x1 - b.x0 };
    case 'e': return { ox: b.x1, oz: cz, ux: 0, uz: 1, nx: 1, nz: 0, len: b.z1 - b.z0 };
    default: return { ox: b.x0, oz: cz, ux: 0, uz: 1, nx: -1, nz: 0, len: b.z1 - b.z0 };
  }
}

function addBalconies(b) {
  const f = facade(b), n = Math.floor((b.h - 0.3) / 1.9), off = Math.min(f.len * 0.25, 2.2);
  const W = 2.6, D = 1.3;
  b.balconies = [];
  for (let i = 0; i < n; i++) {
    const u = (i % 2 ? 1 : -1) * off;
    const x = f.ox + f.ux * u + f.nx * D / 2, z = f.oz + f.uz * u + f.nz * D / 2;
    const top = GROUND + 1.9 * (i + 1);
    const w = f.ux ? W : D, d = f.ux ? D : W;
    const c = box(x, z, w, d, top - 0.25, top, { kind: 'balcony', map: null });
    const bl = { x, z, w, d, top, nx: f.nx, nz: f.nz, col: c };
    balconies.push(bl); b.balconies.push(bl);
  }
}

function addAwning(b) {
  const f = facade(b), D = 1.6, W = Math.min(3.6, f.len - 1);
  const x = f.ox + f.nx * D / 2, z = f.oz + f.nz * D / 2;
  const top = GROUND + 1.5;
  const w = f.ux ? W : D, d = f.ux ? D : W;
  const a = { b, x, z, w, d, top, base: top - 0.3, nx: f.nx, nz: f.nz, color: pick([0xe04848, 0x3a8ae0, 0x40b060, 0xf0a020, 0xc050c0]) };
  a.col = box(x, z, w, d, top - 0.3, top, { kind: 'bouncer', bounce: 18.5 });
  a.r = Math.max(w, d) / 2;
  awnings.push(a);
  bouncers.push({ x, z, r: a.r, top, base: a.base, bounce: 18.5, col: a.col, awning: a });
}

const HEIGHTS = [6, 7.5, 7.5, 9, 10.5, 13, 16];
function feature(h) { return h <= 7.5 ? (rnd() < 0.6 ? 'awning' : null) : (rnd() < 0.5 ? 'balcony' : null); }

/** Pâté ordinaire : 1 à 3 immeubles séparés par des ruelles. */
function cityBlock(blk) {
  const r = inner(blk);
  const pat = Math.floor(rnd() * 4);
  const sideX = (x0, x1) => (x0 <= r.x0 + 0.01 ? 'w' : 'e');
  const sideZ = (z0, z1) => (z1 >= r.z1 - 0.01 ? 's' : 'n');
  const mk = (x0, x1, z0, z1, side) => { const h = pick(HEIGHTS); building(x0, x1, z0, z1, h, side, feature(h)); };
  const xm = (r.x0 + r.x1) / 2, zm = (r.z0 + r.z1) / 2;
  if (pat === 0) { mk(r.x0, xm - 1.5, r.z0, r.z1, sideX(r.x0)); mk(xm + 1.5, r.x1, r.z0, r.z1, 'e'); }
  else if (pat === 1) { mk(r.x0, r.x1, r.z0, zm - 1.5, 'n'); mk(r.x0, r.x1, zm + 1.5, r.z1, sideZ(0, r.z1)); }
  else if (pat === 2) { mk(r.x0 + 1, r.x1 - 1, r.z0 + 1, r.z1 - 1, rnd() < 0.5 ? 's' : 'n'); }
  else { mk(r.x0, xm - 1.5, r.z0, r.z1, 'w'); mk(xm + 1.5, r.x1, r.z0, zm - 1.5, 'n'); mk(xm + 1.5, r.x1, zm + 1.5, r.z1, 's'); }
}

for (const blk of BLOCKS) if (blk.type === 'city') cityBlock(blk);

// Hôtel de ville (nord) avec son beffroi
export const HALL = (() => {
  const r = inner(blockOf('hall'));
  const b = building(r.x0, r.x1, r.z0, r.z1 - 3.5, 11, 's', 'balcony', { color: 0xf2e6d0, roof: 0x5a6a80, hall: true });
  const tower = boxR(-2, 2, -59, -55, GROUND, GROUND + 20, { kind: 'bldg', solid: true, cam: true, map: '#9a8a7c' });
  return { b, tower, top: GROUND + 20 };
})();

// Commissariat (ouest)
export const POLICE = (() => {
  const r = inner(blockOf('police'));
  return building(r.x0, r.x1 - 3, r.z0, r.z1, 9, 'e', 'balcony', { color: 0xdfe8f4, roof: 0x4a5a7a, police: true });
})();

// Garage de Rita (sud-ouest) : atelier + parking des karts
export const GARAGE = (() => {
  const r = inner(blockOf('garage'));
  return building(r.x0, r.x0 + 6.5, r.z0 + 1, r.z1, 6, 'e', 'awning', { color: 0xf0d070, roof: 0x8a5a3a, garage: true });
})();

// Boulangerie de Bruno (sud-est)
export const BAKERY = (() => {
  const r = inner(blockOf('bakery'));
  return building(r.x0, r.x1, r.z0 + 2.5, r.z1, 7.5, 'n', 'awning', { color: 0xf8e2c0, roof: 0xb06a4a, bakery: true });
})();

// Marché couvert : étals (comptoir solide + toile sur laquelle on peut sauter)
export const stalls = [[-4.5, 21], [4.5, 21], [-4.5, 26], [4.5, 26]].map(([x, z], i) => {
  const s = { x, z, w: 3, d: 2, top: GROUND + 1, canopy: GROUND + 2.7, color: [0xe04848, 0x3a8ae0, 0x40b060, 0xf0a020][i] };
  box(x, z, s.w, s.d, GROUND - 0.5, s.top, { kind: 'stall', solid: true });
  box(x, z, s.w + 0.6, s.d + 0.8, s.canopy - 0.2, s.canopy, { kind: 'canopy' });
  return s;
});

// Place de la Fontaine (centre)
export const FOUNTAIN = { x: 0, z: -1, r: 4, top: GROUND + 0.7, col: 0.8, colTop: GROUND + 4.2 };
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r, GROUND - 0.5, FOUNTAIN.top, { kind: 'fountain', solid: true });
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.col, GROUND - 0.5, FOUNTAIN.colTop, { kind: 'fountain', solid: true });

// Parc des Mouettes : kiosque à musique (plancher, toit) et champignon de jeu
export const KIOSK = { x: (PARK.x0 + PARK.x1) / 2, z: (PARK.z0 + PARK.z1) / 2, r: 3, floor: GROUND + 0.9, roofR: 3.6, roof: GROUND + 5.2 };
cyl(KIOSK.x, KIOSK.z, KIOSK.r, GROUND - 0.5, KIOSK.floor, { kind: 'kiosk' });
cyl(KIOSK.x, KIOSK.z, KIOSK.roofR, KIOSK.roof - 0.4, KIOSK.roof, { kind: 'kiosk', cam: true });
for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cyl(KIOSK.x + Math.cos(a) * 2.6, KIOSK.z + Math.sin(a) * 2.6, 0.15, KIOSK.floor, KIOSK.roof - 0.4, { kind: 'post', solid: true }); }
{
  const x = KIOSK.x + 5.2, z = KIOSK.z + 3.6, top = GROUND + 0.9;
  const c = cyl(x, z, 1.2, GROUND - 0.5, top, { kind: 'bouncer', bounce: 17 });
  bouncers.push({ x, z, r: 1.2, top, base: GROUND, bounce: 17, col: c, mushroom: true });
}

// Rampes de saut (la hauteur monte vers dir : 'px', 'nx', 'pz', 'nz')
export const ramps = [];
function ramp(x, z, w, d, h, dir) {
  const c = box(x, z, w, d, GROUND - 0.2, GROUND + h, { kind: 'ramp', dir, h, base: GROUND, map: '#e0a040' });
  ramps.push(c);
  return c;
}
const SK = inner(blockOf('skate'));
export const SKATE = SK;
ramp(SK.x0 + 3.2, (SK.z0 + SK.z1) / 2, 5.5, 5, 2.0, 'px');
ramp(SK.x1 - 3.2, (SK.z0 + SK.z1) / 2, 5.5, 5, 2.0, 'nx');
ramp(40, -26, 6, 6, 1.4, 'nz');            // sur l'avenue de l'est (la course y passe)
ramp(-14, 24, 6, 6, 1.4, 'nz');            // avenue du garage (la course y passe)

/** Dessus d'une rampe au point (x, z). */
export function rampTop(c, x, z) {
  let t;
  if (c.dir === 'px') t = (x - (c.x - c.w / 2)) / c.w;
  else if (c.dir === 'nx') t = ((c.x + c.w / 2) - x) / c.w;
  else if (c.dir === 'pz') t = (z - (c.z - c.d / 2)) / c.d;
  else t = ((c.z + c.d / 2) - z) / c.d;
  return c.base + c.h * clamp(t, 0, 1);
}

// Jetée, phare et quai
export const PIER = { x0: 22, x1: 30, z0: QUAY_Z - 0.4, z1: 64, px0: 17, px1: 35, pz0: 64, pz1: 73 };
boxR(PIER.x0, PIER.x1, PIER.z0, PIER.z1, -5, GROUND, { kind: 'pier', map: '#b08a5a' });
boxR(PIER.px0, PIER.px1, PIER.pz0, PIER.pz1, -5, GROUND, { kind: 'pier', map: '#b08a5a' });
export const LIGHTHOUSE = { x: 26, z: 69.5, r: 2.4, top: GROUND + 18, capR: 3.3 };
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.r, GROUND - 1, LIGHTHOUSE.top - 0.6, { kind: 'lighthouse', solid: true, cam: true });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.capR, LIGHTHOUSE.top - 0.6, LIGHTHOUSE.top, { kind: 'cap' });
export const lighthouseSteps = [];
for (let i = 0; i < 11; i++) {
  const a = Math.PI * 0.5 + i * 0.72;   // on commence côté terre
  const x = LIGHTHOUSE.x + Math.cos(a) * 3.9, z = LIGHTHOUSE.z - Math.sin(a) * 3.9;
  const top = GROUND + 1.5 * (i + 1);
  lighthouseSteps.push({ x, z, top, a, r: 1.3 });
  cyl(x, z, 1.3, top - 0.35, top, { kind: 'step' });
}
// garde-corps du quai (on peut sauter par-dessus, pas les karts)
export const RAILS = [[CITY.x0, PIER.x0 - 0.5], [PIER.x1 + 0.5, CITY.x1]].map(([a, b]) => {
  boxR(a, b, QUAY_Z - 0.15, QUAY_Z + 0.15, GROUND - 0.5, GROUND + 1, { kind: 'rail', solid: true });
  return { x0: a, x1: b, z: QUAY_Z };
});

// palissade au bout du skatepark (sinon les karts filent à la mer)
export const FENCE = { x0: CITY.x1 - 0.6, x1: CITY.x1, z0: SK.z0 - 2.5, z1: SK.z1 + 2.5, top: GROUND + 3.6 };
boxR(FENCE.x0, FENCE.x1, FENCE.z0, FENCE.z1, GROUND - 0.5, FENCE.top, { kind: 'rail', solid: true, map: '#5a8ad0' });

// Bateaux amarrés (décor) ; le dernier attend le voleur au bout de la jetée
export const BOATS = [
  { x: -32, z: 50, yaw: 0.3, color: 0xe04848 }, { x: -10, z: 53, yaw: -0.2, color: 0x3a8ae0 },
  { x: 48, z: 51, yaw: 0.5, color: 0x40b060 }, { x: 13.5, z: 69, yaw: Math.PI / 2, color: 0x2a2a3a, thief: true },
];

// Caisses (cassables)
export const crates = [
  { id: 'c1', x: -45.2, z: 6.8, content: 'heart' },
  { id: 'c2', x: 45.2, z: -8.8, content: 'heart' },
  { id: 'c3', x: 19.2, z: 6.8, content: 'none' },
  { id: 'c4', x: 8.8, z: -19.2, content: 'heart' },
  { id: 'c5', x: -19.2, z: -45.2, content: 'heart' },
  { id: 'c6', x: -64.6, z: 17.4, content: 'none' },
];
for (const c of crates) c.y = GROUND;

// Arbres : promenade du port, parc, coins de la place
export const trees = [];
{
  const add = (x, z, s, h) => trees.push({ x, z, y: GROUND, s, h });
  for (let x = -60; x <= 60; x += 12) if (Math.abs(x - 26) > 9) add(x, 39.8, 0.85, 5.2);
  for (const [x, z] of [[PARK.x0 + 1.2, PARK.z0 + 1.2], [PARK.x1 - 1.2, PARK.z0 + 1.2], [PARK.x0 + 1.2, PARK.z1 - 1.2], [PARK.x1 - 1.2, PARK.z1 - 1.2], [KIOSK.x - 6, KIOSK.z], [KIOSK.x, KIOSK.z - 6]]) add(x, z, 1.05, 6.5);
  for (const [x, z] of [[-7.6, -7.6], [7.6, -7.6], [7.6, 5.6]]) add(x, z, 0.9, 5.5);
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}

// ---------------------------------------------------------------------------
// Support : sol le plus haut sous un point (terrain + dessus des obstacles)
// ---------------------------------------------------------------------------
export function colliderTop(c, t, x, z) {
  if (c.off) return -Infinity;
  if (c.kind === 'ramp' && x !== undefined) return rampTop(c, x, z);
  return c.y1;
}

export function inside(c, x, z, margin) {
  margin = margin || 0;
  if (c.type === 'box') return Math.abs(x - c.x) <= c.w / 2 + margin && Math.abs(z - c.z) <= c.d / 2 + margin;
  return (x - c.x) ** 2 + (z - c.z) ** 2 <= (c.r + margin) ** 2;
}

export function supportAt(x, z, yFeet, t, step) {
  step = step === undefined ? 0.6 : step;
  let best = heightAt(x, z), col = null;
  for (const c of colliders) {
    if (!inside(c, x, z, 0.25)) continue;
    const top = colliderTop(c, t, x, z);
    if (top > best && top <= yFeet + step) { best = top; col = c; }
  }
  return { y: best, collider: col };
}

/** Un chat (ou un passant) ne traverse pas les murs. */
export function blockedAt(x, z) {
  for (const c of colliders) if ((c.kind === 'bldg' || c.kind === 'stall' || c.kind === 'fountain' || c.kind === 'rail') && inside(c, x, z, 0.4)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of colliders) if (!c.off && inside(c, x, z, 0.25)) { const t = colliderTop(c, 0, x, z); if (t > best) best = t; }
  return best;
}
export { groundY };
function line(ax, az, bx, bz, n, lift) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
  }
  return pts;
}
const at = (x, z, y) => ({ x, z, y });

// 100 pièces d'or
const roofCoins = [];
for (const b of buildings) {
  if (!b.balconies && !b.hall) continue;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const o = b.hall ? 4.5 : 1.2;
  roofCoins.push(at(cx - o, cz, b.top + 1.1), at(cx + o, cz, b.top + 1.1));
}
const awningCoins = awnings.map(({ b }) => at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.top + 1.1));
const LH = LIGHTHOUSE;
const all = [].concat(
  line(-8, 9.5, 8, 9.5, 4),                                   // devant la place
  line(-24, 12, -60, 12, 5),                                  // rue du garage vers l'ouest
  line(20, 12, 60, 12, 5),                                    // rue de la boulangerie vers l'est
  line(-14, -6, -14, -34, 4),                                 // avenue des Tilleuls
  line(14, -6, 14, -34, 4),                                   // avenue des Mouettes
  line(-50, BOULEVARD, 10, BOULEVARD, 6),                     // boulevard du Port
  line(PIER.x0 + 4, 46, PIER.x0 + 4, 60, 4),                 // la jetée
  lighthouseSteps.map(s => at(s.x, s.z, s.top + 1.1)),        // l'escalier du phare
  [at(LH.x, LH.z - 1.6, LH.top + 1.1), at(LH.x, LH.z + 1.6, LH.top + 1.1)],
  balconies.filter((_, i) => i % 2 === 0).map(b => at(b.x, b.z, b.top + 1.1)),
  roofCoins, awningCoins,
  [at(KIOSK.x, KIOSK.z, KIOSK.roof + 1.1), at(KIOSK.x + 1.5, KIOSK.z, KIOSK.roof + 1.1), at(KIOSK.x - 1.5, KIOSK.z, KIOSK.roof + 1.1)],
  // au-dessus du trou du skatepark : il faut sauter en kart !
  [0.25, 0.5, 0.75].map(k => at(SK.x0 + 6 + (SK.x1 - SK.x0 - 12) * k, (SK.z0 + SK.z1) / 2, GROUND + 3.6 + Math.sin(k * Math.PI) * 1.2)),
  [at(40, -31.5, GROUND + 3.4), at(40, -35, GROUND + 3.2)],    // après la rampe de l'avenue
  [at(-14, 17.5, GROUND + 3.4)],
  stalls.map(s => at(s.x, s.z, s.canopy + 1.1)),
  line(-40, -6, -40, -34, 3), line(40, -6, 40, 6, 2),
  line(-30, -40, 30, -40, 6),                                 // rue de l'hôtel de ville
  line(-65, -55, -65, -20, 4), line(65, -60, 65, -42, 3),     // ruelles des bords
  line(-6, 39.5, 6, 39.5, 3),                                 // promenade
);
export const bones = all.slice(0, 100).map((p, i) => ({ id: 'p' + i, x: p.x, y: p.y, z: p.z }));
export const balls = [];

// ---------------------------------------------------------------------------
// Personnages et missions
// ---------------------------------------------------------------------------
export const npcs = {
  mamie: { x: -6, z: 4.2, y: GROUND },
  puppy: { x: -4.4, z: 5.4, y: GROUND },
};
export const START = { x: 0, z: 6.6, y: GROUND, yaw: Math.PI };

export const GIVERS = {
  delivery: { x: 27, z: 17.4, look: 'baker', name: 'Bruno le boulanger', short: 'Bruno' },
  race: { x: -30, z: 17.6, look: 'mechanic', name: 'Rita la mécano', short: 'Rita' },
  thief: { x: -45.6, z: -27, look: 'police', name: 'Commissaire Pataud', short: 'Pataud' },
  posters: { x: 0, z: -45.6, look: 'mayor', name: 'Madame la Maire', short: 'la Maire' },
  boss: { x: npcs.mamie.x, z: npcs.mamie.z, look: 'mamie', name: 'Mamie Labrador', short: 'Mamie' },
};
GIVERS.delivery.yaw = Math.PI; GIVERS.race.yaw = Math.PI; GIVERS.thief.yaw = Math.PI / 2; GIVERS.posters.yaw = 0;
for (const k in GIVERS) GIVERS[k].y = GROUND;

export const MISSIONS = [
  { id: 'delivery', medal: 'm_delivery', title: 'Livraison express' },
  { id: 'race', medal: 'm_race', title: 'Grand Prix de Port-Croquette' },
  { id: 'thief', medal: 'm_thief', title: 'Au voleur !' },
  { id: 'posters', medal: 'm_posters', title: 'Grand nettoyage' },
  { id: 'boss', medal: 'm_boss', title: 'Le gang de la Capitaine', needs: 4 },
];

// Livraison : 3 colis à porter (dans l'ordre que l'on veut)
export const DELIVERY = {
  time: 120,
  drops: [
    { id: 'd1', x: -55, z: 28.6, label: 'la Villa des Roses', short: 'Villa des Roses' },
    { id: 'd2', x: -45.6, z: -21.6, label: 'le commissariat', short: 'commissariat' },
    { id: 'd3', x: 26, z: 61, label: 'le gardien du phare', short: 'phare' },
  ],
};

// Course de karts : un tour de la ville
export const RACE = {
  time: 60,
  start: { x: -24, z: 12, yaw: Math.PI / 2 },
  cps: [[0, 12], [40, 12], [40, -14], [40, -40], [0, -40], [-40, -40], [-40, -14], [-40, 12], [-40, 34], [-14, 34], [-14, 12]].map(([x, z]) => ({ x, z })),
  r: 6.5,
};

// Le voleur Filou : s'échappe du commissariat et file vers son bateau
export const THIEF = {
  speed: 9.6,
  route: [[-40, -31], [-40, -40], [14, -40], [14, -14], [-14, -14], [-14, 12], [14, 12], [14, 34], [26, 37], [26, 50], [26, 62], [19, 68.5]].map(([x, z]) => ({ x, z })),
};

// Affiches de la Capitaine Moustache à arracher (coup de queue)
const hallTop = HALL.b.top;
const roofB = buildings.find(b => b.balconies && !b.hall && !b.police) || POLICE;
export const POSTERS = [
  { id: 'a1', x: -6, z: 17.3, rot: Math.PI, y: GROUND },
  { id: 'a2', x: PARK.x0 + 2.5, z: PARK.z1 - 2.5, rot: Math.PI / 4, y: GROUND },
  { id: 'a3', x: SK.x1 - 1.5, z: SK.z0 + 1.5, rot: -Math.PI / 2, y: GROUND },
  { id: 'a4', x: (roofB.x0 + roofB.x1) / 2, z: (roofB.z0 + roofB.z1) / 2, rot: 0, y: roofB.top },
  { id: 'a5', x: LH.x, z: LH.z + 2.2, rot: 0, y: LH.top, onCap: true },
  { id: 'a6', x: 4, z: -52 + 0.0, rot: 0, y: hallTop },
];

// Grand final : le gang sur le quai, puis la Capitaine en kart
export const BOSS = {
  hp: 3,
  speed: 13,
  start: { x: 0, z: 36, yaw: -Math.PI / 2 },
  route: [[-40, 34], [-40, -14], [40, -14], [40, 34]].map(([x, z]) => ({ x, z })),
};

// Trophées (remis en fin de mission, pas ramassés)
export const medals = MISSIONS.map(m => {
  const g = GIVERS[m.id];
  return { id: m.medal, x: g.x, z: g.z, y: GROUND + 2.6, label: m.title, visible: false };
});

// Chats bandits
export const cats = [
  { id: 'cat1', x: PARK.x0 + 3, z: PARK.z0 + 3, group: 'roam' },
  { id: 'cat2', x: PARK.x1 - 3, z: PARK.z1 - 3, group: 'roam' },
  { id: 'cat3', x: 0, z: 29, group: 'roam' },
  { id: 'cat4', x: -30, z: 39.5, group: 'roam' },
  { id: 'cat5', x: SK.x0 + 8.5, z: SK.z0 + 1.5, group: 'roam' },
  { id: 'cat6', x: -27, z: -45.4, group: 'roam' },
  ...[-9, -5, -2.2, 2.2, 6].map((x, i) => ({ id: 'gang' + i, x, z: 39.4 - (i % 2) * 1.6, group: 'gang' })),
].map(c => Object.assign(c, { y: GROUND }));

// Karts garés (un par joueur au maximum)
export const KARTS = [
  { id: 'k1', x: -21.6, z: 19.6, yaw: Math.PI / 2, color: 0xe03a3a },
  { id: 'k2', x: -21.6, z: 23.6, yaw: Math.PI / 2, color: 0x3a8ae0 },
  { id: 'k3', x: -21.6, z: 27.6, yaw: Math.PI / 2, color: 0x40c060 },
  { id: 'k4', x: 6, z: 9.8, yaw: Math.PI / 2, color: 0xf0b020 },
  { id: 'k5', x: -24, z: 36.8, yaw: Math.PI / 2, color: 0xc050e0 },
  { id: 'k6', x: -37.4, z: -24, yaw: Math.PI, color: 0xff7aa8 },
].map(k => Object.assign(k, { y: GROUND }));

// Panneaux
export const signs = [
  { x: 3.2, z: 7.2, text: ['Bienvenue à Port-Croquette !', 'Les habitants ont besoin d\'aide :', 'cherchez les « ! » sur la carte.'] },
  { x: -26.5, z: 17.4, text: ['Garage de Rita.', 'Les karts sont en libre-service :', 'approchez-vous et montez dedans !'] },
  { x: 21.2, z: 40.6, text: ['La jetée et le phare.', 'Grimpez l\'escalier du phare', 'pour voir toute la ville !'] },
  { x: SK.x0 + 1.4, z: SK.z1 + 1.2, text: ['Skatepark.', 'En kart : prenez de l\'élan', 'et sautez par-dessus le trou !'] },
];

// Rien de tout ça ici
export const PATHS = [];
export const CRYSTALS = [];
export const ruins = [];
