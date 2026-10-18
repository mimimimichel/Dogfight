/*
 * Matcha & Ainu — Niveau 3 : « Port-Croquette », une grande ville ouverte.
 * Données pures (aucune dépendance) : relief, rues, immeubles, quartiers,
 * missions, circulation. Utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z, l'île fait 440 m de côté) :
 *   centre-ville en damier (place de la Fontaine, gratte-ciel, mairie, commissariat) ;
 *   au sud, le Vieux Port, sa jetée et son phare ; au sud-est, la grande plage ;
 *   à l'ouest, les docks (conteneurs, grues, cargo) ;
 *   au nord, les collines (villas, observatoire, lettres géantes, château d'eau) ;
 *   à l'est, le parc et son lac, la fête foraine et sa grande roue,
 *   le quartier des maisons et le circuit du stade.
 */

export const ID = 3;
export const NAME = 'Port-Croquette';
export const SAVE_KEY = 'dogfight.aventure.niveau3b';
export const CAT_PLACE = 'en ville';
export const COLLECT_NAME = 'pièces d\'or';
export const MEDAL_TITLE = 'TROPHÉE !';
export const FINAL_MEDAL = 'm_boss';
export const WATER_Y = 0;
export const GROUND = 2;
export const WORLD = 440;           // côté du monde (m)
export const RADAR = 75;            // demi-côté de la mini-carte (m)
export const GRASS_K = 1.3;         // un peu plus d'herbe : le monde est grand

export const SKY = { top: 0x2a7ae0, horizon: 0xc4e6fa, bottom: 0xe0f2ff, sunDir: [0.42, 0.62, 0.36] };
export const LIGHT = { hemi: [0xeaf4ff, 0x8a7a68, 0.85], sun: [0xfff0d8, 2.5], fog: [110, 330] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 0.95, big: 1.7, small: 1.25, bushes: 0 };
export const PALETTE = {
  ground: [0x62b444, 0x7cc650, 0x4aa03c],
  leaves: [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const gauss = (x, z, cx, cz, r, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
let seed = 31;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------------------
// Relief
// ---------------------------------------------------------------------------
export const PORT_QUAY = 118;      // quai du Vieux Port (z)
export const DOCK_QUAY = 140;      // quai des docks (z)
export const BEACH_X = 24;         // la plage commence à l'est de x = 24
export const LAKE = { x: 68, z: -22, r: 20 };
export const STADIUM = { x: 145, z: -112, half: 20, r: 22, w: 11 };
export const OBS = { x: -82, z: -170 };

function hills(x, z) {
  const m = 1 - smooth(-95, -72, z);       // pas de collines au sud de la route du nord
  if (m <= 0) return 0;
  const h = gauss(x, z, -82, -168, 46, 26) + gauss(x, z, -150, -150, 36, 17) + gauss(x, z, 4, -176, 42, 15)
    + gauss(x, z, -30, -128, 26, 6) + gauss(x, z, -120, -105, 26, 5)
    + 1.2 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06);
  return Math.max(0, h) * m;
}
const flat = (h, x, z, cx, cz, r, y) => { const w = 1 - smooth(r, r * 1.35, Math.hypot(x - cx, z - cz)); return h * (1 - w) + y * w; };
const OBS_H = GROUND + hills(OBS.x, OBS.z);
export const OBS_Y = OBS_H;

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  let h = GROUND + hills(x, z);
  h = flat(h, x, z, OBS.x, OBS.z, 13, OBS_H);
  h = flat(h, x, z, STADIUM.x, STADIUM.z, 50, GROUND);
  // lac du parc
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 4) h -= 5.5 * smooth(LAKE.r + 4, LAKE.r - 6, dl);
  // côtes
  if (x < BEACH_X) {
    const q = x < -125 ? DOCK_QUAY : PORT_QUAY;
    if (z > q) h = Math.min(h, GROUND - 6 * smooth(q, q + 1.6, z));
  } else {
    h = Math.min(h, GROUND - 4.5 * smooth(104, 152, z));         // la plage descend doucement vers la mer
  }
  if (x > 196) h = Math.min(h, h - 8 * smooth(196, 206, x));
  if (x < -203) h = Math.min(h, GROUND - 6 * smooth(-203, -205, x));
  if (z < -203) h = h * (1 - smooth(-203, -213, z)) - 4 * smooth(-203, -213, z);
  return h;
}

// ---------------------------------------------------------------------------
// Rues
// ---------------------------------------------------------------------------
export const ROAD_HW = 4;
export const SIDEWALK = 2.5;
export const AVENUES = [-108, -82, -56, -30, -4];            // centre-ville, rues nord-sud (x)
export const STREETS = [-66, -40, -14, 12, 38, 64];          // centre-ville, rues est-ouest (z)
export const COAST = 90;                                      // boulevard du Port (z)
export const ROADS = [];
const road = (ax, az, bx, bz, extra) => { const r = Object.assign({ ax, az, bx, bz, hw: ROAD_HW, flat: true }, extra); ROADS.push(r); return r; };
for (const x of AVENUES) road(x, -66, x, COAST);
for (const z of STREETS) road(-108, z, 24, z);
road(-200, COAST, 196, COAST, { name: 'Boulevard du Port' });
road(24, -66, 24, COAST);                    // avenue de l'Est
road(-160, -66, -108, -66); road(24, -66, 196, -66);   // route du nord
road(104, -66, 104, COAST);                  // entre le parc et le quartier des maisons
road(150, -66, 150, COAST);
road(24, 24, 196, 24);                       // rue de la Foire
road(-160, -66, -160, COAST);                // route des docks
road(-200, 12, -108, 12);
road(145, -66, 145, -84, { hw: 5 });         // entrée du stade
// route des collines : elle serpente jusqu'à l'observatoire
export const HILL_ROAD = [[-30, -66], [-30, -84], [-8, -100], [-8, -114], [-44, -124], [-62, -140], [-36, -152], [-46, -170], [-70, -178]];
for (let i = 1; i < HILL_ROAD.length; i++) road(HILL_ROAD[i - 1][0], HILL_ROAD[i - 1][1], HILL_ROAD[i][0], HILL_ROAD[i][1], { flat: false, hill: true });

const segDist = (x, z, r) => {
  const dx = r.bx - r.ax, dz = r.bz - r.az, l = dx * dx + dz * dz;
  const t = clamp(((x - r.ax) * dx + (z - r.az) * dz) / l, 0, 1);
  return Math.hypot(x - r.ax - t * dx, z - r.az - t * dz);
};
export function onRoad(x, z, m) { m = m || 0; for (const r of ROADS) if (segDist(x, z, r) <= r.hw + m) return r; return null; }

// ---------------------------------------------------------------------------
// Quartiers (pâtés de maisons)
// ---------------------------------------------------------------------------
export const BLOCKS = [];
const blk = (x0, x1, z0, z1, type, district) => { const b = { x0, x1, z0, z1, type, district }; BLOCKS.push(b); return b; };
const XS = [[-104, -86], [-78, -60], [-52, -34], [-26, -8], [0, 20]];
const ZS = [[-62, -44], [-36, -18], [-10, 8], [16, 34], [42, 60], [68, 86]];
const DOWNTOWN = { '2,0': 'hall', '2,2': 'plaza', '0,2': 'police', '0,4': 'garage', '4,3': 'bakery', '3,3': 'market', '1,3': 'shop', '3,1': 'tower', '1,1': 'tower', '4,0': 'tower' };
XS.forEach(([x0, x1], i) => ZS.forEach(([z0, z1], j) => blk(x0, x1, z0, z1, DOWNTOWN[i + ',' + j] || (j === 5 ? 'port' : 'city'), 'centre')));
// quartier ouest et docks
for (const [x0, x1] of [[-196, -164], [-156, -112]]) { blk(x0, x1, -62, 8, 'city', 'ouest'); blk(x0, x1, 16, 86, 'warehouse', 'docks'); }
// quartier des maisons (est)
for (const [x0, x1] of [[108, 146], [154, 196]]) { blk(x0, x1, -62, 20, 'houses', 'est'); blk(x0, x1, 28, 86, 'houses', 'est'); }
export const PARK = { x0: 28, x1: 100, z0: -62, z1: 20 };
export const FAIR = { x0: 28, x1: 100, z0: 28, z1: 86 };
export const PROMENADE = { x0: -125, x1: BEACH_X, z0: COAST + ROAD_HW, z1: PORT_QUAY };
export const YARD = { x0: -203, x1: -125, z0: COAST + ROAD_HW, z1: DOCK_QUAY };
const inRect = (r, x, z, m) => { m = m || 0; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; };
const blockAt = (x, z) => BLOCKS.find(b => inRect(b, x, z));

/** Vrai là où il n'y a pas d'herbe (sols pavés, rues, quais). */
export function inWater(x, z) {
  if (onRoad(x, z, 0.5)) return true;
  if (inRect(PROMENADE, x, z) || inRect(YARD, x, z)) return true;
  const b = blockAt(x, z);
  if (b) return b.type !== 'houses';
  if (inRect(FAIR, x, z)) return true;
  if (Math.hypot(x - STADIUM.x, z - STADIUM.z) < 48 && z > STADIUM.z - 30) return Math.abs(z - STADIUM.z) < 32;
  return false;
}

/** Couleur de la mini-carte (null : couleur du relief). */
export function mapColor(x, z) {
  if (onRoad(x, z)) return [84, 88, 100];
  if (inRect(PROMENADE, x, z) || inRect(YARD, x, z)) return heightAt(x, z) > 1 ? [200, 196, 186] : null;
  const b = blockAt(x, z);
  if (b) return b.type === 'houses' ? [120, 184, 96] : b.type === 'plaza' ? [236, 214, 170] : [206, 200, 190];
  if (inRect(FAIR, x, z)) return [232, 206, 170];
  return null;
}

// ---------------------------------------------------------------------------
// Obstacles + grille spatiale (le monde est grand : on ne teste que les voisins)
// ---------------------------------------------------------------------------
export const colliders = [];
export const movers = [];           // plates-formes qui bougent (nacelles), toujours testées
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };
const boxR = (x0, x1, z0, z1, y0, y1, extra) => box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y0, y1, extra);
/** Sol le plus bas sous un rectangle (pour poser un bâtiment sur une pente). */
function baseOf(x0, x1, z0, z1) { let m = Infinity; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) m = Math.min(m, heightAt(x, z)); return m; }

export const FACADES = [0xf4c8a8, 0xf6e0a0, 0xbfe0c8, 0xb8d4f0, 0xf0b8c0, 0xeadccb, 0xd0c4ea, 0xf8eedc, 0xe8a888, 0xa8d8d8];
export const buildings = [];
export const balconies = [];
export const awnings = [];
export const bouncers = [];

/**
 * Immeuble (boîte solide) posé sur le sol. side : façade côté rue ('n', 's', 'e', 'w').
 * feat : 'balcony' (balcons en escalier jusqu'au toit), 'awning' (auvent rebondissant).
 */
function building(x0, x1, z0, z1, h, side, feat, extra) {
  const base = Math.min(GROUND, baseOf(x0, x1, z0, z1));
  const g = Math.max(GROUND, heightAt((x0 + x1) / 2, (z0 + z1) / 2));
  const b = Object.assign({ x0, x1, z0, z1, h, base, ground: g, top: g + h, side, color: pick(FACADES), roof: pick([0x8a7a70, 0x6e7480, 0xb06a4a, 0x7a8a6a]) }, extra || {});
  b.col = boxR(x0, x1, z0, z1, base - 1, b.top, { kind: 'bldg', solid: true, cam: true, map: b.mapCol || '#9a8a7c' });
  buildings.push(b);
  if (feat === 'balcony') addBalconies(b);
  else if (feat === 'awning') addAwning(b);
  return b;
}
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
    const top = b.ground + 1.9 * (i + 1);
    const w = f.ux ? W : D, d = f.ux ? D : W;
    const c = box(x, z, w, d, top - 0.25, top, { kind: 'balcony' });
    const bl = { x, z, w, d, top, nx: f.nx, nz: f.nz, col: c };
    balconies.push(bl); b.balconies.push(bl);
  }
}
function addAwning(b) {
  const f = facade(b), D = 1.6, W = Math.min(3.6, f.len - 1);
  const x = f.ox + f.nx * D / 2, z = f.oz + f.nz * D / 2;
  const top = b.ground + 1.5;
  const w = f.ux ? W : D, d = f.ux ? D : W;
  const a = { b, x, z, w, d, top, base: top - 0.3, nx: f.nx, nz: f.nz, color: pick([0xe04848, 0x3a8ae0, 0x40b060, 0xf0a020, 0xc050c0]) };
  a.col = box(x, z, w, d, top - 0.3, top, { kind: 'bouncer', bounce: 18.5 });
  a.r = Math.max(w, d) / 2;
  awnings.push(a);
  bouncers.push({ x, z, r: a.r, top, base: a.base, bounce: 18.5, col: a.col, awning: a });
}
const inner = (b, m) => { m = m === undefined ? SIDEWALK : m; return { x0: b.x0 + m, x1: b.x1 - m, z0: b.z0 + m, z1: b.z1 - m }; };

/** Pâté ordinaire : 1 à 3 immeubles séparés par des ruelles. */
function cityBlock(blk, heights) {
  const r = inner(blk);
  const pat = Math.floor(rnd() * 4);
  const feature = (h) => (h <= 7.5 ? (rnd() < 0.6 ? 'awning' : null) : (rnd() < 0.5 ? 'balcony' : null));
  const mk = (x0, x1, z0, z1, side) => { const h = pick(heights); building(x0, x1, z0, z1, h, side, feature(h)); };
  const xm = (r.x0 + r.x1) / 2, zm = (r.z0 + r.z1) / 2;
  if (pat === 0) { mk(r.x0, xm - 1.5, r.z0, r.z1, 'w'); mk(xm + 1.5, r.x1, r.z0, r.z1, 'e'); }
  else if (pat === 1) { mk(r.x0, r.x1, r.z0, zm - 1.5, 'n'); mk(r.x0, r.x1, zm + 1.5, r.z1, 's'); }
  else if (pat === 2) { mk(r.x0 + 1, r.x1 - 1, r.z0 + 1, r.z1 - 1, rnd() < 0.5 ? 's' : 'n'); }
  else { mk(r.x0, xm - 1.5, r.z0, r.z1, 'w'); mk(xm + 1.5, r.x1, r.z0, zm - 1.5, 'n'); mk(xm + 1.5, r.x1, zm + 1.5, r.z1, 's'); }
}
/** Pâté de longs immeubles (bords de grands pâtés : quartier ouest). */
function longBlock(blk) {
  const r = inner(blk);
  for (let z = r.z0; z < r.z1 - 6; z += 17) {
    const z1 = Math.min(r.z1, z + 14);
    const xm = (r.x0 + r.x1) / 2;
    const h1 = pick([7.5, 9, 10.5, 13]), h2 = pick([6, 7.5, 9, 13]);
    building(r.x0, xm - 1.5, z, z1, h1, 'w', h1 <= 7.5 ? 'awning' : (rnd() < 0.5 ? 'balcony' : null));
    building(xm + 1.5, r.x1, z, z1, h2, 'e', h2 <= 7.5 ? 'awning' : (rnd() < 0.5 ? 'balcony' : null));
  }
}
/** Hangars des docks. */
function warehouseBlock(blk) {
  const r = inner(blk);
  for (let z = r.z0; z < r.z1 - 10; z += 24) building(r.x0 + 2, r.x1 - 2, z, Math.min(r.z1, z + 20), pick([8, 10, 12]), rnd() < 0.5 ? 'w' : 'e', 'balcony', { roof: 0x7a8494, color: pick([0xd8d4cc, 0xc8d0d8, 0xe0c8a8]), warehouse: true });
}
/** Maisons avec jardin (quartier est). */
export const houses = [];
function housesBlock(blk) {
  const r = inner(blk, 1.5);
  for (let x = r.x0 + 1; x < r.x1 - 8; x += 13) for (let z = r.z0 + 1; z < r.z1 - 8; z += 13) {
    if (rnd() < 0.15) continue;
    const w = 8 + rnd() * 2, d = 8 + rnd() * 2;
    const b = building(x, x + w, z, z + d, pick([4.5, 5, 6]), pick(['n', 's', 'e', 'w']), rnd() < 0.35 ? 'awning' : null, { house: true, roof: pick([0xc85a3a, 0xb04a3a, 0x7a5a4a, 0x5a6a8a]), color: pick([0xf8eedc, 0xf6e0a0, 0xbfe0c8, 0xf4d0c0, 0xe0e8f4]) });
    houses.push(b);
  }
}
for (const b of BLOCKS) {
  if (b.type === 'city') (b.district === 'ouest' ? longBlock : (bk) => cityBlock(bk, [6, 7.5, 9, 10.5, 13, 16, 19]))(b);
  else if (b.type === 'port') cityBlock(b, [6, 7.5, 7.5, 9]);
  else if (b.type === 'warehouse') warehouseBlock(b);
  else if (b.type === 'houses') housesBlock(b);
}
const blockOf = (type, n) => BLOCKS.filter(b => b.type === type)[n || 0];

// --- Centre-ville : bâtiments remarquables -----------------------------------
export const HALL = (() => {
  const r = inner(blockOf('hall'));
  const b = building(r.x0, r.x1, r.z0, r.z1 - 3.5, 11, 's', 'balcony', { color: 0xf2e6d0, roof: 0x5a6a80, hall: true });
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1 - 3.5) / 2;
  const tower = boxR(cx - 2, cx + 2, cz - 2, cz + 2, GROUND, GROUND + 20, { kind: 'bldg', solid: true, cam: true, map: '#9a8a7c' });
  return { b, tower, top: GROUND + 20 };
})();
export const POLICE = (() => { const r = inner(blockOf('police')); return building(r.x0, r.x1 - 3, r.z0, r.z1, 9, 'e', 'balcony', { color: 0xdfe8f4, roof: 0x4a5a7a, police: true }); })();
export const GARAGE = (() => { const r = inner(blockOf('garage')); return building(r.x0, r.x0 + 6.5, r.z0 + 1, r.z1, 6, 'e', 'awning', { color: 0xf0d070, roof: 0x8a5a3a, garage: true }); })();
export const BAKERY = (() => { const r = inner(blockOf('bakery')); return building(r.x0, r.x1, r.z0 + 2.5, r.z1, 7.5, 'n', 'awning', { color: 0xf8e2c0, roof: 0xb06a4a, bakery: true }); })();
export const SHOP = (() => { const r = inner(blockOf('shop')); return building(r.x0, r.x1, r.z0 + 2.5, r.z1, 9, 'n', 'awning', { color: 0xf0c8e0, roof: 0x8a4a6a, shop: true }); })();
// Gratte-ciel avec ascenseur vitré
export const elevators = [];
export const TOWERS = [];
[[blockOf('tower', 0), 32, 'Tour Bleue'], [blockOf('tower', 1), 44, 'Tour Croquette'], [blockOf('tower', 2), 26, 'Tour du Nord']].forEach(([blkT, h, name], i) => {
  const r = inner(blkT);
  const b = building(r.x0 + 1.5, r.x1 - 1.5, r.z0 + 1.5, r.z1 - 1.5, h, 's', i === 2 ? 'balcony' : null, { tower: true, name, color: [0x9ac8e8, 0xf0d8a8, 0xc8e0c8][i], roof: 0x5a6070 });
  TOWERS.push(b);
  if (i === 2) return;
  // cabine d'ascenseur collée à la façade sud
  const x = (b.x0 + b.x1) / 2, z = b.z1 + 1.4;
  const e = box(x, z, 2.4, 2.4, GROUND - 0.4, GROUND, { kind: 'elev', y0e: GROUND, y1e: b.top, period: 22, phase: i * 7 });
  elevators.push(e);
});
/** Hauteur du plancher d'un ascenseur à l'instant t (pause en bas et en haut). */
export function elevTop(c, t) {
  const p = (((t + c.phase) % c.period) + c.period) % c.period / c.period;   // 0..1
  let k;
  if (p < 0.2) k = 0; else if (p < 0.5) k = smooth(0.2, 0.5, p); else if (p < 0.7) k = 1; else k = 1 - smooth(0.7, 1, p);
  return c.y0e + (c.y1e - c.y0e) * k;
}

// Marché couvert
export const stalls = (() => {
  const b = blockOf('market'), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return [[-4.5, -2.5], [4.5, -2.5], [-4.5, 2.5], [4.5, 2.5]].map(([dx, dz], i) => {
    const s = { x: cx + dx, z: cz + dz, w: 3, d: 2, top: GROUND + 1, canopy: GROUND + 2.7, color: [0xe04848, 0x3a8ae0, 0x40b060, 0xf0a020][i] };
    box(s.x, s.z, s.w, s.d, GROUND - 0.5, s.top, { kind: 'stall', solid: true });
    box(s.x, s.z, s.w + 0.6, s.d + 0.8, s.canopy - 0.2, s.canopy, { kind: 'canopy' });
    return s;
  });
})();
// Place de la Fontaine
export const PLAZA = blockOf('plaza');
export const FOUNTAIN = { x: (PLAZA.x0 + PLAZA.x1) / 2, z: (PLAZA.z0 + PLAZA.z1) / 2 - 1, r: 4, top: GROUND + 0.7, col: 0.8, colTop: GROUND + 4.2 };
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r, GROUND - 0.5, FOUNTAIN.top, { kind: 'fountain', solid: true });
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.col, GROUND - 0.5, FOUNTAIN.colTop, { kind: 'fountain', solid: true });

// --- Vieux Port : quais, pontons, jetée et phare --------------------------------
export const QUAY_Z = PORT_QUAY;
export const PIER = { x0: 6, x1: 14, z0: PORT_QUAY - 0.4, z1: 166, px0: 1, px1: 19, pz0: 166, pz1: 176 };
boxR(PIER.x0, PIER.x1, PIER.z0, PIER.z1, -5, GROUND, { kind: 'pier', map: '#b08a5a', shore: true });
boxR(PIER.px0, PIER.px1, PIER.pz0, PIER.pz1, -5, GROUND, { kind: 'pier', map: '#b08a5a', shore: true });
export const PONTOONS = [-100, -72, -44].map(x => { boxR(x - 1.5, x + 1.5, PORT_QUAY - 0.4, PORT_QUAY + 16, -3, GROUND - 0.3, { kind: 'pier', map: '#b08a5a', shore: true }); return { x, z0: PORT_QUAY, z1: PORT_QUAY + 16 }; });
export const LIGHTHOUSE = { x: 10, z: 171, r: 2.4, top: GROUND + 18, capR: 3.3 };
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.r, GROUND - 1, LIGHTHOUSE.top - 0.6, { kind: 'lighthouse', solid: true, cam: true });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.capR, LIGHTHOUSE.top - 0.6, LIGHTHOUSE.top, { kind: 'cap' });
export const lighthouseSteps = [];
for (let i = 0; i < 11; i++) {
  const a = Math.PI * 0.5 + i * 0.72;
  const x = LIGHTHOUSE.x + Math.cos(a) * 3.9, z = LIGHTHOUSE.z - Math.sin(a) * 3.9;
  const top = GROUND + 1.5 * (i + 1);
  lighthouseSteps.push({ x, z, top, a, r: 1.3 });
  cyl(x, z, 1.3, top - 0.35, top, { kind: 'step' });
}
// garde-corps des quais (on saute par-dessus, pas les karts) — ouverts devant la jetée et les pontons
export const RAILS = [];
{
  const gaps = [[PIER.x0 - 0.5, PIER.x1 + 0.5], ...PONTOONS.map(p => [p.x - 2, p.x + 2])].sort((a, b) => a[0] - b[0]);
  let x = -125;
  for (const [g0, g1] of gaps) { RAILS.push({ x0: x, x1: g0, z: PORT_QUAY }); x = g1; }
  RAILS.push({ x0: x, x1: BEACH_X, z: PORT_QUAY });
  RAILS.push({ x0: -203, x1: -168, z: DOCK_QUAY }, { x0: -152, x1: -125, z: DOCK_QUAY });
  for (const r of RAILS) boxR(r.x0, r.x1, r.z - 0.15, r.z + 0.15, GROUND - 0.5, GROUND + 1, { kind: 'rail', solid: true });
  // muret entre les docks et le port (bord du bassin)
  boxR(-125.3, -124.7, PORT_QUAY, DOCK_QUAY, GROUND - 0.5, GROUND + 1, { kind: 'rail', solid: true });
  RAILS.push({ x: -125, z0: PORT_QUAY, z1: DOCK_QUAY });
}
export const BOATS = [
  { x: -96, z: 128, yaw: 0, color: 0xe04848 }, { x: -68, z: 130, yaw: 0, color: 0x3a8ae0 }, { x: -48, z: 128, yaw: 0, color: 0x40b060 },
  { x: -20, z: 140, yaw: 0.4, color: 0xf0b020 }, { x: 60, z: 160, yaw: 1.2, color: 0xffffff },
];

// --- Docks : conteneurs, grues, cargo ----------------------------------------------
export const containers = [];
const CRANE_X = [-186, -142], CRANE_Z0 = DOCK_QUAY - 21, CRANE_Z1 = DOCK_QUAY - 1;
const craneFree = (x, z) => CRANE_X.every(cx => !((Math.abs(x - (cx - 5)) < 4.4 || Math.abs(x - (cx + 5)) < 4.4) && z > CRANE_Z0 - 4.5 && z < CRANE_Z1 + 2) && !(x > cx - 9 && x < cx - 1 && z > CRANE_Z0 - 5.5 && z < CRANE_Z0 + 1));
{
  const cols = [0xd84a3a, 0x3a7ad8, 0x40a060, 0xf0a020, 0x8a5ad0, 0x2aa8a8];
  for (let x = -196; x <= -134; x += 9) for (let z = 100; z <= 132; z += 5.5) {
    if (Math.abs(x + 160) < 6 || !craneFree(x, z)) continue;   // allée centrale, pieds des grues
    if (rnd() < 0.25) continue;
    const n = 1 + Math.floor(rnd() * 3.2);
    for (let k = 0; k < n; k++) {
      const y0 = GROUND + k * 2.6;
      box(x, z, 6.1, 2.5, y0, y0 + 2.6, { kind: 'container', solid: true, map: k ? null : '#c86a4a' });
      containers.push({ x, z, y0, color: pick(cols) });
    }
  }
}
export const CRANES = CRANE_X.map(x => {
  const z0 = CRANE_Z0, z1 = CRANE_Z1, top = GROUND + 22;
  for (const [lx, lz] of [[x - 5, z0], [x + 5, z0], [x - 5, z1], [x + 5, z1]]) boxR(lx - 0.6, lx + 0.6, lz - 0.6, lz + 0.6, GROUND - 4, top - 1, { kind: 'bldg', solid: true });
  const beam = boxR(x - 6, x + 6, z0 - 1, z1 + 1, top - 1, top, { kind: 'crane' });
  // escalier en zigzag le long d'un pied
  const steps = [];
  for (let i = 0; i < 16; i++) {
    const t = GROUND + 1.3 * (i + 1);
    const sx = x - 5 + (i % 2 ? 1.8 : -1.8), sz = z0 - 2.2;
    box(sx, sz, 2.2, 2.2, t - 0.25, t, { kind: 'step' });
    steps.push({ x: sx, z: sz, top: t });
  }
  return { x, z0, z1, top, beam, steps };
});
export const SHIP = { x0: -196, x1: -136, z0: DOCK_QUAY + 6, z1: DOCK_QUAY + 20, deck: GROUND + 6 };
boxR(SHIP.x0, SHIP.x1, SHIP.z0, SHIP.z1, -4, SHIP.deck, { kind: 'ship', map: '#4a5a7a', shore: true });
export const SHIP_CABIN = boxR(SHIP.x0 + 3, SHIP.x0 + 13, SHIP.z0 + 2, SHIP.z1 - 2, SHIP.deck, SHIP.deck + 8, { kind: 'bldg', solid: true, cam: true });
for (const [x, z] of [[-150, SHIP.z0 + 4], [-160, SHIP.z0 + 4], [-150, SHIP.z1 - 4]]) { box(x, z, 6.1, 2.5, SHIP.deck, SHIP.deck + 2.6, { kind: 'container', solid: true }); containers.push({ x, z, y0: SHIP.deck, color: 0xd84a3a }); }
export const GANGWAY = { x: -160, z0: DOCK_QUAY - 8, z1: SHIP.z0 + 0.5 };
// (la passerelle est une rampe : elle est créée avec les autres plus bas)

// --- Collines : villas, observatoire, château d'eau, lettres géantes ---------------
export const villas = [];
const VILLA_SPOTS = [[-48, -96], [-22, -136], [12, -128], [-84, -132], [-82, -150], [-14, -166], [-125, -92], [-60, -194]];
for (const [x, z] of VILLA_SPOTS) {
  const b = building(x - 4.5, x + 4.5, z - 4, z + 4, pick([4.5, 5.5]), 's', null, { villa: true, color: pick([0xf8f0e4, 0xf4e4c8, 0xe8f0f8]), roof: 0xc85a3a });
  villas.push(Object.assign(b, { pool: { x: x + (x < -30 ? 8 : -8), z, y: b.ground } }));
}
export const OBSERVATORY = { x: OBS.x, z: OBS.z, r: 6, y: OBS_H, top: OBS_H + 9 };
cyl(OBS.x, OBS.z, 6, OBS_H - 2, OBS_H + 9, { kind: 'obs', solid: true, cam: true });
export const obsSteps = [];
for (let i = 0; i < 6; i++) {
  const a = -Math.PI / 2 + i * 0.75, x = OBS.x + Math.cos(a) * 7.8, z = OBS.z + Math.sin(a) * 7.8, top = OBS_H + 1.5 * (i + 1);
  cyl(x, z, 1.3, top - 0.3, top, { kind: 'step' }); obsSteps.push({ x, z, top });
}
export const WATER_TOWER = (() => {
  const x = -150, z = -132, g = heightAt(x, z), top = g + 16;
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) cyl(x + dx, z + dz, 0.35, g - 1, top - 3, { kind: 'post', solid: true });
  cyl(x, z, 4, top - 3, top, { kind: 'tank', cam: true });
  const steps = [];
  for (let i = 0; i < 9; i++) { const t = g + 1.6 * (i + 1); const a = i * 0.9; const sx = x + Math.cos(a) * 5.4, sz = z + Math.sin(a) * 5.4; cyl(sx, sz, 1.1, t - 0.25, t, { kind: 'step' }); steps.push({ x: sx, z: sz, top: t }); }
  return { x, z, g, top, steps };
})();
// Lettres géantes sur la colline (police de 5 × 7 pixels)
const FONT = {
  P: ['1111', '1001', '1001', '1110', '1000', '1000', '1000'], O: ['0110', '1001', '1001', '1001', '1001', '1001', '0110'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001', '1001'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  C: ['0111', '1000', '1000', '1000', '1000', '1000', '0111'], Q: ['0110', '1001', '1001', '1001', '1011', '1001', '0111'],
  U: ['1001', '1001', '1001', '1001', '1001', '1001', '0110'], E: ['1111', '1000', '1000', '1110', '1000', '1000', '1111'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
};
export const LETTERS = [];
{
  const word = 'PORT-CROQUETTE', px = 1.0;
  let x = -176;
  const zl = -116;
  for (const ch of word) {
    const rows = FONT[ch], wl = rows[0].length;
    const cx = x + wl * px / 2, g = heightAt(cx, zl) - 0.3;
    const L = { ch, x, z: zl, g, rows, px, boxes: [] };
    rows.forEach((row, ri) => {
      const y1 = g + (7 - ri) * px, y0 = y1 - px;
      let i = 0;
      while (i < row.length) {
        if (row[i] !== '1') { i++; continue; }
        let j = i; while (j < row.length && row[j] === '1') j++;
        const c = boxR(x + i * px, x + j * px, zl - 0.6, zl + 0.6, ri === 6 ? g - 2 : y0, y1, { kind: 'letter', solid: true });
        L.boxes.push(c);
        i = j;
      }
    });
    LETTERS.push(L);
    x += wl * px + 1.2;
  }
}

// --- Parc : lac, kiosque, skatepark --------------------------------------------------
export const KIOSK = { x: 44, z: 6, r: 3, floor: GROUND + 0.9, roofR: 3.6, roof: GROUND + 5.2 };
cyl(KIOSK.x, KIOSK.z, KIOSK.r, GROUND - 0.5, KIOSK.floor, { kind: 'kiosk' });
cyl(KIOSK.x, KIOSK.z, KIOSK.roofR, KIOSK.roof - 0.4, KIOSK.roof, { kind: 'kiosk', cam: true });
for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cyl(KIOSK.x + Math.cos(a) * 2.6, KIOSK.z + Math.sin(a) * 2.6, 0.15, KIOSK.floor, KIOSK.roof - 0.4, { kind: 'post', solid: true }); }
const mushroom = (x, z, top, r, bounce) => { const c = cyl(x, z, r, GROUND - 0.5, top, { kind: 'bouncer', bounce }); bouncers.push({ x, z, r, top, base: GROUND, bounce, col: c, mushroom: true }); };
mushroom(KIOSK.x + 5.2, KIOSK.z + 3.6, GROUND + 0.9, 1.2, 17);
export const SKATE = { x0: 32, x1: 56, z0: -61, z1: -47 };
export const ramps = [];
function ramp(x, z, w, d, h, dir, base) {
  base = base === undefined ? GROUND : base;
  const c = box(x, z, w, d, base - 0.2, base + h, { kind: 'ramp', dir, h, base, map: '#e0a040' });
  ramps.push(c);
  return c;
}
/** Dessus d'une rampe au point (x, z). */
export function rampTop(c, x, z) {
  let t;
  if (c.dir === 'px') t = (x - (c.x - c.w / 2)) / c.w;
  else if (c.dir === 'nx') t = ((c.x + c.w / 2) - x) / c.w;
  else if (c.dir === 'pz') t = (z - (c.z - c.d / 2)) / c.d;
  else t = ((c.z + c.d / 2) - z) / c.d;
  return c.base + c.h * clamp(t, 0, 1);
}

// --- Fête foraine --------------------------------------------------------------------
export const WHEEL = { x: 64, z: 74, hub: GROUND + 19, R: 17, n: 12, period: 70, size: 2.6 };
WHEEL.gondolas = [];
for (let i = 0; i < WHEEL.n; i++) {
  const c = { type: 'box', x: WHEEL.x, z: WHEEL.z, w: WHEEL.size, d: WHEEL.size, y0: 0, y1: 0, kind: 'gondola', dx: 0, dz: 0, i };
  movers.push(c); WHEEL.gondolas.push(c);
}
// pieds de la grande roue
for (const sx of [-1, 1]) boxR(WHEEL.x + sx * 6 - 0.6, WHEEL.x + sx * 6 + 0.6, WHEEL.z + 2.2, WHEEL.z + 3.4, GROUND - 1, WHEEL.hub, { kind: 'bldg', solid: true });
/** Position des nacelles à l'instant t (la roue tourne lentement). */
export function wheelAt(t) {
  const out = [];
  for (let i = 0; i < WHEEL.n; i++) {
    const a = (t / WHEEL.period) * Math.PI * 2 + (i / WHEEL.n) * Math.PI * 2;
    out.push({ x: WHEEL.x + Math.cos(a) * WHEEL.R, y: WHEEL.hub + Math.sin(a) * WHEEL.R - 1.4, z: WHEEL.z });
  }
  return out;
}
/** Met à jour les nacelles (et leur déplacement depuis la dernière fois, pour emporter le chien). */
export function updateWheel(t) {
  const ps = wheelAt(t);
  WHEEL.gondolas.forEach((c, i) => {
    const p = ps[i];
    c.dx = c.y1 ? p.x - c.x : 0; c.dz = 0;
    c.x = p.x; c.z = p.z; c.y1 = p.y; c.y0 = p.y - 0.3;
  });
}
updateWheel(0);
export const CAROUSEL = { x: 40, z: 60, r: 6, top: GROUND + 0.8 };
cyl(CAROUSEL.x, CAROUSEL.z, CAROUSEL.r, GROUND - 0.5, CAROUSEL.top, { kind: 'carousel' });
cyl(CAROUSEL.x, CAROUSEL.z, 0.8, CAROUSEL.top, GROUND + 6, { kind: 'post', solid: true });
export const RINK = { x0: 72, x1: 96, z0: 32, z1: 50 };          // auto-tamponneuses (les karts y entrent)
for (const [a, b, c, d] of [[RINK.x0, RINK.x1, RINK.z0, RINK.z0 + 0.4], [RINK.x0, RINK.x0 + 0.4, RINK.z0, RINK.z1], [RINK.x1 - 0.4, RINK.x1, RINK.z0, RINK.z1]]) boxR(a, b, c, d, GROUND - 0.3, GROUND + 0.9, { kind: 'rail', solid: true });
RAILS.push({ x0: RINK.x0, x1: RINK.x1, z: RINK.z0 + 0.2 }, { x: RINK.x0 + 0.2, z0: RINK.z0, z1: RINK.z1 }, { x: RINK.x1 - 0.2, z0: RINK.z0, z1: RINK.z1 });
mushroom(48, 40, GROUND + 0.8, 1.5, 22);    // trampolines géants
mushroom(56, 66, GROUND + 0.8, 1.5, 22);
mushroom(88, 66, GROUND + 0.8, 1.5, 22);
export const fairStalls = [[34, 34], [40, 34], [46, 34], [34, 80], [44, 80]].map(([x, z], i) => {
  const s = { x, z, w: 3.6, d: 2.4, top: GROUND + 1, canopy: GROUND + 2.9, color: [0xe04848, 0x3a8ae0, 0xf0a020, 0xc050c0, 0x40b060][i] };
  box(x, z, s.w, s.d, GROUND - 0.5, s.top, { kind: 'stall', solid: true });
  box(x, z, s.w + 0.6, s.d + 0.8, s.canopy - 0.2, s.canopy, { kind: 'canopy' });
  return s;
});

// --- Plage ---------------------------------------------------------------------------
export const LIFEGUARD = { x: 110, z: 118, top: heightAt(110, 118) + 5 };
cyl(LIFEGUARD.x, LIFEGUARD.z, 1.6, LIFEGUARD.top - 0.3, LIFEGUARD.top, { kind: 'step' });
export const lifeguardSteps = [1.4, 2.8, 4.2].map((dy, i) => { const x = LIFEGUARD.x - 2.6 + i * 0.2, z = LIFEGUARD.z - 2.2 + i * 1.6; const t = heightAt(x, z) + dy; cyl(x, z, 0.9, t - 0.25, t, { kind: 'step' }); return { x, z, top: t }; });
export const huts = [40, 52, 64, 76, 128, 140, 152, 164].map((x, i) => { const z = 100, g = GROUND; boxR(x - 2, x + 2, z - 1.6, z + 1.6, g - 0.5, g + 3, { kind: 'bldg', solid: true }); return { x, z, color: [0xe04848, 0x3a8ae0, 0xf0a020, 0x40b060][i % 4] }; });
export const PARASOLS = [];
for (let i = 0; i < 18; i++) PARASOLS.push({ x: 34 + rnd() * 160, z: 108 + rnd() * 12, color: pick([0xe04848, 0x3a8ae0, 0xf0d040, 0x40b060, 0xff7ab0]) });

// --- Stade et circuit ---------------------------------------------------------------
/** Ligne médiane du circuit (anneau fermé, sens inverse des aiguilles d'une montre vu du dessus). */
export const TRACK = (() => {
  const S = STADIUM, pts = [];
  for (let i = 0; i < 64; i++) {
    const u = i / 64 * (2 * S.half * 2 + 2 * Math.PI * S.r), L1 = 2 * S.half, A = Math.PI * S.r;
    let x, z;
    if (u < L1) { x = S.x - S.half + u; z = S.z + S.r; }
    else if (u < L1 + A) { const a = Math.PI / 2 - (u - L1) / S.r; x = S.x + S.half + Math.cos(a) * S.r; z = S.z + Math.sin(a) * S.r; }
    else if (u < 2 * L1 + A) { x = S.x + S.half - (u - L1 - A); z = S.z - S.r; }
    else { const a = -Math.PI / 2 - (u - 2 * L1 - A) / S.r; x = S.x - S.half + Math.cos(a) * S.r; z = S.z + Math.sin(a) * S.r; }
    pts.push({ x, z });
  }
  return pts;
})();
export const TRACK_WALLS = [];
{
  // murets intérieur et extérieur (segments), entrée au milieu de la ligne droite sud
  const S = STADIUM;
  for (const off of [-S.w / 2 - 0.5, S.w / 2 + 0.5]) {
    const n = TRACK.length;
    for (let i = 0; i < n; i++) {
      const a = TRACK[i], b = TRACK[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      // décalage vers l'extérieur (off > 0) ou l'intérieur
      const ax = a.x + nx * -off, az = a.z + nz * -off, bx = b.x + nx * -off, bz = b.z + nz * -off;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (off > 0 && Math.abs(mx - S.x) < 7 && mz > S.z) continue;    // entrée
      const c = Object.assign({ type: 'box', x: mx, z: mz, w: Math.max(0.5, Math.abs(bx - ax) + 0.5), d: Math.max(0.5, Math.abs(bz - az) + 0.5), y0: GROUND - 0.3, y1: GROUND + 1.1 }, { kind: 'rail', solid: true });
      colliders.push(c);
      TRACK_WALLS.push({ ax, az, bx, bz });
    }
  }
}
export const STANDS = [];
for (let i = 0; i < 6; i++) { const top = GROUND + 0.8 * (i + 1), z = STADIUM.z - STADIUM.r - 9 - i * 1.4; boxR(STADIUM.x - 22, STADIUM.x + 22, z - 0.7, z + 0.7, GROUND - 0.5, top, { kind: 'stand', solid: true }); STANDS.push({ z, top }); }

// Rampes et sauts acrobatiques
ramp(SKATE.x0 + 4, (SKATE.z0 + SKATE.z1) / 2, 5.5, 5, 2.0, 'px');
ramp(SKATE.x1 - 4, (SKATE.z0 + SKATE.z1) / 2, 5.5, 5, 2.0, 'nx');
ramp(-30, -27, 6, 6, 1.5, 'nz');                   // avenue du centre
ramp(24, 52, 6, 7, 2.2, 'pz');                     // avenue de l'Est, au-dessus de la foire
ramp(-160, 104, 6, 8, 2.6, 'pz');                  // docks : on décolle vers les conteneurs
ramp(150, 108, 7, 8, 2.4, 'pz');                   // plage : saut dans la mer !
ramp(145, -76, 6, 6, 1.6, 'nz');                   // entrée du circuit
ramp(-8, -107, 6, 7, 1.8, 'nz', heightAt(-8, -107)); // route des collines
ramp(GANGWAY.x, (GANGWAY.z0 + GANGWAY.z1) / 2, 3.2, GANGWAY.z1 - GANGWAY.z0, SHIP.deck - GROUND, 'pz');   // passerelle du cargo
export const FENCE = { x0: SKATE.x1 + 0.4, x1: SKATE.x1 + 1.0, z0: SKATE.z0 - 1, z1: SKATE.z1 + 1, top: GROUND + 3.6 };
boxR(FENCE.x0, FENCE.x1, FENCE.z0, FENCE.z1, GROUND - 0.5, FENCE.top, { kind: 'rail', solid: true, map: '#5a8ad0' });
/** Sauts acrobatiques : décoller de la rampe et atterrir dans la zone. */
export const STUNTS = [
  { id: 's1', ramp: 0, x: SKATE.x1 - 4, z: (SKATE.z0 + SKATE.z1) / 2, r: 4.5, name: 'Le trou du skatepark' },
  { id: 's2', ramp: 2, x: -30, z: -44, r: 6, name: 'Le tremplin du centre' },
  { id: 's3', ramp: 3, x: 24, z: 70, r: 7, name: 'Par-dessus la foire' },
  { id: 's4', ramp: 4, x: -160, z: 122, r: 8, name: 'Le saut des docks' },
  { id: 's5', ramp: 5, x: 150, z: 128, r: 9, name: 'Le grand plongeon' },
  { id: 's6', ramp: 6, x: 145, z: -90, r: 6, name: 'L\'entrée du stade' },
  { id: 's7', ramp: 7, x: -8, z: -120, r: 6, name: 'La bosse de la colline' },
];

// Caisses (cassables)
export const crates = [
  { id: 'c1', x: -105.2, z: 6.8, content: 'heart' }, { id: 'c2', x: 18.8, z: -9.2, content: 'heart' },
  { id: 'c3', x: -35.2, z: 41.2, content: 'none' }, { id: 'c4', x: 31, z: -12, content: 'heart' },
  { id: 'c5', x: -150, z: 96, content: 'heart' }, { id: 'c6', x: 98, z: 84, content: 'none' },
  { id: 'c7', x: 110, z: 96.5, content: 'heart' }, { id: 'c8', x: -44, z: -88, content: 'heart' },
];
for (const c of crates) c.y = heightAt(c.x, c.z);

// Aérodrome (au nord-est, sur le plateau) : ni arbre ni herbe sur la piste
export const RUNWAY = { x0: 30, x1: 182, z: -158, w: 12 };
export function noGrass(x, z) { return x > RUNWAY.x0 - 3 && x < RUNWAY.x1 + 3 && Math.abs(z - RUNWAY.z) < RUNWAY.w / 2 + 1.5; }

// Arbres
export const trees = [];
{
  const add = (x, z, s, h) => { const y = heightAt(x, z); trees.push({ x, z, y, s, h }); };
  const free = (x, z, m) => !onRoad(x, z, 2.5) && !colliders.some(c => (c.solid || c.kind === 'ramp' || c.kind === 'kiosk' || c.kind === 'bouncer') && inside(c, x, z, m || 2));
  // promenade du port
  for (let x = -118; x <= 16; x += 12) add(x, PORT_QUAY - 3, 0.85, 5.2);
  // parc
  for (let i = 0; i < 140 && trees.length < 70; i++) {
    const x = PARK.x0 + 3 + rnd() * (PARK.x1 - PARK.x0 - 6), z = PARK.z0 + 3 + rnd() * (PARK.z1 - PARK.z0 - 6);
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3 || inRect(SKATE, x, z, 4) || Math.hypot(x - KIOSK.x, z - KIOSK.z) < 7) continue;
    if (!free(x, z) || trees.some(t => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    add(x, z, 0.95 + rnd() * 0.4, 6 + rnd() * 2);
  }
  // jardins et collines
  for (let i = 0; i < 900 && trees.length < 190; i++) {
    const x = -200 + rnd() * 396, z = -200 + rnd() * 300;
    const inBlock = blockAt(x, z), hill = z < -76;
    if (!(hill || (inBlock && inBlock.type === 'houses'))) continue;
    if (heightAt(x, z) < 1.5 || !free(x, z, 2.5) || trees.some(t => Math.hypot(t.x - x, t.z - z) < (hill ? 7 : 5.5))) continue;
    if (Math.abs(x - STADIUM.x) < 62 && Math.abs(z - STADIUM.z) < 46) continue;
    if (hill && (Math.hypot(x - OBS.x, z - OBS.z) < 18 || LETTERS.some(l => Math.abs(z - l.z) < 5 && x > -180 && x < -105))) continue;
    add(x, z, 0.9 + rnd() * 0.5, 5.5 + rnd() * 2.5);
  }
  // coins de la place
  const P = PLAZA;
  for (const [x, z] of [[P.x0 + 2.4, P.z0 + 2.4], [P.x1 - 2.4, P.z0 + 2.4], [P.x1 - 2.4, P.z1 - 2.4]]) add(x, z, 0.9, 5.5);
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
  // la piste de l'aérodrome reste dégagée (arbres plantés au hasard : on retire ceux qui la gênent)
  for (let k = trees.length - 1; k >= 0; k--) if (trees[k].x > RUNWAY.x0 - 8 && trees[k].x < RUNWAY.x1 + 8 && Math.abs(trees[k].z - RUNWAY.z) < RUNWAY.w / 2 + 6) trees.splice(k, 1);
}

// ---------------------------------------------------------------------------
// Grille spatiale et support
// ---------------------------------------------------------------------------
const CELL = 16, OFF = 32;
const grid = new Map();
const key = (i, j) => (i + OFF) * 128 + (j + OFF);
function bbox(c) { return c.type === 'box' ? [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r]; }
function indexCollider(c) {
  const [x0, x1, z0, z1] = bbox(c);
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
  }
}
for (const c of colliders) indexCollider(c);
/** Obstacles ajoutés après coup (objets solides de la couche de vie : tonneaux, terrasses, cloches…). */
const added = new Set();
export function addColliders(list) { for (const c of list) { const k = c.life ? c.life + ':' + c.x + ':' + c.z : null; if (k && added.has(k)) continue; if (k) added.add(k); colliders.push(c); indexCollider(c); } }
let stamp = 1;
/** Obstacles proches de (x, z) dans un rayon r (plus les plates-formes mobiles). */
export function near(x, z, r) {
  r = r || 0;
  const out = [], s = ++stamp;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
    const list = grid.get(key(i, j));
    if (list) for (const c of list) if (c._s !== s) { c._s = s; out.push(c); }
  }
  for (const c of movers) out.push(c);
  return out;
}

export function colliderTop(c, t, x, z) {
  if (c.off) return -Infinity;
  if (c.kind === 'ramp' && x !== undefined) return rampTop(c, x, z);
  if (c.kind === 'elev') return elevTop(c, t || 0);
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
  for (const c of near(x, z, 0.3)) {
    if (!inside(c, x, z, 0.25)) continue;
    const top = colliderTop(c, t, x, z);
    if (top > best && top <= yFeet + step) { best = top; col = c; }
  }
  return { y: best, collider: col };
}
const WALLS = new Set(['bldg', 'stall', 'fountain', 'rail', 'container', 'letter', 'stand', 'obs']);
/** Un chat (ou un passant) ne traverse pas les murs. */
export function blockedAt(x, z) {
  for (const c of near(x, z, 0.5)) if (WALLS.has(c.kind) && inside(c, x, z, 0.4)) return true;
  return false;
}
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of near(x, z, 0.3)) if (!c.off && c.kind !== 'gondola' && inside(c, x, z, 0.25)) { const t = colliderTop(c, 0, x, z); if (t > best) best = t; }
  return best;
}
export { groundY };

// ---------------------------------------------------------------------------
// Pièces d'or (100)
// ---------------------------------------------------------------------------
function line(ax, az, bx, bz, n, lift) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const x = ax + (bx - ax) * t, z = az + (bz - az) * t; pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) }); }
  return pts;
}
const at = (x, z, y) => ({ x, z, y });
const center = (b) => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
const LH = LIGHTHOUSE;
const coinList = [].concat(
  line(-50, 12, -36, 12, 3),                                                     // devant la place
  line(-56, -60, -56, 60, 6), line(-100, 38, 16, 38, 6),                        // grandes rues du centre
  TOWERS.map(b => { const [x, z] = center(b); return [at(x - 2, z, b.top + 1.1), at(x + 2, z, b.top + 1.1)]; }).flat(),
  elevators.map(e => at(e.x, e.z, e.y1e + 1.4)),
  balconies.filter((_, i) => i % 5 === 0).map(b => at(b.x, b.z, b.top + 1.1)).slice(0, 12),
  [at(center(HALL.b)[0] + 4.5, center(HALL.b)[1], HALL.b.top + 1.1)],
  line(-110, 104, 0, 104, 6),                                                    // promenade du port
  line(10, 124, 10, 160, 3), lighthouseSteps.filter((_, i) => i % 3 === 1).map(s => at(s.x, s.z, s.top + 1.1)), [at(LH.x, LH.z + 1.8, LH.top + 1.1)],
  line(-195, 92, -168, 92, 3),
  containers.filter((c, i) => i % 7 === 3).slice(0, 6).map(c => at(c.x, c.z, groundY(c.x, c.z) + 1.1)),
  CRANES.map(c => [at(c.x, (c.z0 + c.z1) / 2, c.top + 1.1), at(c.x, c.z0 + 2, c.top + 1.1)]).flat(),
  [at(-170, SHIP.z0 + 7, SHIP.deck + 1.1), at(SHIP.x0 + 8, SHIP.z0 + 7, SHIP.deck + 9.1)],
  HILL_ROAD.slice(1, -1).map(([x, z]) => at(x, z, heightAt(x, z) + 1.1)),
  [at(OBS.x, OBS.z, OBSERVATORY.top + 1.1), at(WATER_TOWER.x, WATER_TOWER.z, WATER_TOWER.top + 1.1)],
  LETTERS.filter((_, i) => i % 3 === 0).map(l => at(l.x + 1.5, l.z, l.g + 7 * l.px + 1.1)),
  [0.25, 0.5, 0.75].map(k => at(SKATE.x0 + 6.75 + (SKATE.x1 - SKATE.x0 - 13.5) * k, (SKATE.z0 + SKATE.z1) / 2, GROUND + 3.4 + Math.sin(k * Math.PI) * 1.0)),
  [at(KIOSK.x, KIOSK.z, KIOSK.roof + 1.1)],
  [0, 1, 2, 3, 4, 5].map(i => { const a = i * 1.05; const x = LAKE.x + Math.cos(a) * (LAKE.r + 1), z = LAKE.z + Math.sin(a) * (LAKE.r + 1); return at(x, z, Math.max(0.6, heightAt(x, z)) + 1.1); }),
  [at(WHEEL.x, WHEEL.z, WHEEL.hub + WHEEL.R + 0.2), at(WHEEL.x - WHEEL.R, WHEEL.z, WHEEL.hub + 0.2)],
  [at(48, 40, GROUND + 9), at(56, 66, GROUND + 9), at(88, 66, GROUND + 9)],
  line(40, 108, 190, 108, 6), [at(LIFEGUARD.x, LIFEGUARD.z, LIFEGUARD.top + 1.1)],
  TRACK.filter((_, i) => i % 8 === 4).map(p => at(p.x, p.z, GROUND + 1.1)),
  [at(STADIUM.x, STANDS[5].z, STANDS[5].top + 1.1)],
  line(150, -60, 150, 20, 4), line(104, 30, 104, 80, 3), line(-196, 12, -120, 12, 4),
);
export const bones = coinList.slice(0, 100).map((p, i) => ({ id: 'p' + i, x: p.x, y: p.y, z: p.z }));
export const balls = [];

// ---------------------------------------------------------------------------
// Personnages, missions
// ---------------------------------------------------------------------------
const P0 = PLAZA;
export const npcs = {
  mamie: { x: P0.x0 + 3.5, z: P0.z1 - 3.8, y: GROUND },
  puppy: { x: P0.x0 + 5, z: P0.z1 - 2.6, y: GROUND },
};
export const START = { x: (P0.x0 + P0.x1) / 2, z: P0.z1 - 1.4, y: GROUND, yaw: Math.PI };

const ring = (type, side, along, n) => {   // point sur le trottoir d'un pâté
  const b = typeof type === 'string' ? blockOf(type, n) : type;
  const u = along === undefined ? 0.5 : along;
  if (side === 'n') return { x: b.x0 + (b.x1 - b.x0) * u, z: b.z0 + 1.2 };
  if (side === 's') return { x: b.x0 + (b.x1 - b.x0) * u, z: b.z1 - 1.2 };
  if (side === 'e') return { x: b.x1 - 1.2, z: b.z0 + (b.z1 - b.z0) * u };
  return { x: b.x0 + 1.2, z: b.z0 + (b.z1 - b.z0) * u };
};
const villaFront = (i) => { const v = villas[i]; return { x: (v.x0 + v.x1) / 2, z: v.z1 + 2.2 }; };
export const GIVERS = {
  delivery: Object.assign(ring('bakery', 'n', 0.5), { look: 'baker', name: 'Bruno le boulanger', short: 'Bruno', yaw: Math.PI }),
  race: Object.assign(ring('garage', 'n', 0.3), { look: 'mechanic', name: 'Rita la mécano', short: 'Rita', yaw: Math.PI }),
  thief: Object.assign(ring('police', 'e', 0.5), { look: 'police', name: 'Commissaire Pataud', short: 'Pataud', yaw: Math.PI / 2 }),
  posters: Object.assign(ring('hall', 's', 0.3), { look: 'mayor', name: 'Madame la Maire', short: 'la Maire', yaw: 0 }),
  kitten: Object.assign(villaFront(1), { look: 'lady', name: 'Madame Persane', short: 'Mme Persane', yaw: 0 }),
  smuggle: { x: -175, z: 136, look: 'sailor', name: 'Capitaine Barnabé', short: 'Barnabé', yaw: Math.PI },
  balloons: { x: 52, z: 30.5, look: 'clown', name: 'Zazou le forain', short: 'Zazou', yaw: Math.PI },
  champion: { x: 138.4, z: -73, look: 'director', name: 'Monsieur Turbo', short: 'M. Turbo', yaw: Math.PI },
  treasure: { x: 88, z: 104, look: 'pirate', name: 'Vieux Loup', short: 'Vieux Loup', yaw: 0 },
  downhill: { x: OBS.x + 9, z: OBS.z + 4, look: 'astro', name: 'Professeur Lunette', short: 'Pr Lunette', yaw: Math.PI / 2 },
  taxi: Object.assign(ring('plaza', 'e', 0.55), { look: 'driver', name: 'Fernand le taxi', short: 'Fernand', yaw: Math.PI / 2 }),
  shop: Object.assign(ring('shop', 'n', 0.5), { look: 'seller', name: 'Mimi la vendeuse', short: 'Mimi', yaw: Math.PI }),
  boss: { x: npcs.mamie.x, z: npcs.mamie.z, look: 'mamie', name: 'Mamie Labrador', short: 'Mamie' },
};
for (const k in GIVERS) GIVERS[k].y = heightAt(GIVERS[k].x, GIVERS[k].z);

export const MISSIONS = [
  { id: 'delivery', medal: 'm_delivery', title: 'Livraison express', where: 'boulangerie, centre-ville', reward: 40 },
  { id: 'race', medal: 'm_race', title: 'Grand Prix de la ville', where: 'garage de Rita', reward: 60 },
  { id: 'thief', medal: 'm_thief', title: 'Au voleur !', where: 'commissariat', reward: 50 },
  { id: 'posters', medal: 'm_posters', title: 'Grand nettoyage', where: 'hôtel de ville', reward: 50 },
  { id: 'kitten', medal: 'm_kitten', title: 'Le chaton perché', where: 'villas des collines', reward: 40 },
  { id: 'smuggle', medal: 'm_smuggle', title: 'Contrebande aux docks', where: 'quai des docks', reward: 60 },
  { id: 'balloons', medal: 'm_balloons', title: 'La fête des ballons', where: 'fête foraine', reward: 40 },
  { id: 'champion', medal: 'm_champion', title: 'Championnat du stade', where: 'stade', reward: 80 },
  { id: 'treasure', medal: 'm_treasure', title: 'Le trésor de la plage', where: 'plage', reward: 50 },
  { id: 'downhill', medal: 'm_downhill', title: 'La descente infernale', where: 'observatoire', reward: 60 },
  { id: 'taxi', medal: 'm_taxi', title: 'Taxi Croquette', where: 'place de la Fontaine', reward: 0 },
  { id: 'boss', medal: 'm_boss', title: 'Le gang de la Capitaine', where: 'Mamie, place de la Fontaine', needs: 8, reward: 150 },
];

// Livraison : 3 colis aux quatre coins de la ville
export const DELIVERY = {
  time: 180,
  drops: [
    Object.assign(villaFront(0), { id: 'd1', label: 'la villa des Collines', short: 'villa' }),
    { id: 'd2', x: LH.x - 4, z: PIER.pz0 + 1, label: 'le gardien du phare', short: 'phare' },
    { id: 'd3', x: 50, z: 30.5, label: 'la fête foraine', short: 'foire' },
  ].map(d => Object.assign(d, { y: heightAt(d.x, d.z) > 0 ? heightAt(d.x, d.z) : GROUND })),
};
// Grand Prix : un tour de la ville, contre 3 karts
export const RACE = {
  start: { x: -95, z: 64, yaw: Math.PI / 2 },
  cps: [[-30, 64], [24, 64], [24, 90], [104, 90], [104, 24], [150, 24], [150, -66], [24, -66], [-30, -66], [-82, -66], [-108, -66], [-108, 12], [-108, 64], [-95, 64]].map(([x, z]) => ({ x, z })),
  r: 7, rivals: 3,
};
// Le voleur file vers le cargo des docks
export const THIEF = {
  speed: 9.8,
  route: [[-82, -8], [-82, -40], [-30, -40], [-30, 12], [-82, 12], [-108, 12], [-160, 12], [-160, 90], [-160, 100], [-160, GANGWAY.z0 + 1], [-160, SHIP.z0 + 4], [-176, SHIP.z0 + 6]].map(([x, z]) => ({ x, z })),
};
// Affiches de la Capitaine
export const POSTERS = [
  { id: 'a1', x: -24, z: 15, rot: Math.PI, y: GROUND },
  { id: 'a2', x: 36, z: -8, rot: Math.PI / 4, y: GROUND },
  { id: 'a3', x: ((TOWERS[1].x0 + TOWERS[1].x1) / 2), z: (TOWERS[1].z0 + TOWERS[1].z1) / 2, rot: 0, y: TOWERS[1].top },
  { id: 'a4', x: LH.x, z: LH.z + 2.2, rot: 0, y: LH.top },
  { id: 'a5', x: -176 + 2, z: -116 - 3, rot: Math.PI, y: heightAt(-174, -119) },
  { id: 'a6', x: CRANES[0].x, z: (CRANES[0].z0 + CRANES[0].z1) / 2, rot: Math.PI / 2, y: CRANES[0].top },
  { id: 'a7', x: 120, z: 112, rot: 0, y: heightAt(120, 112) },
  { id: 'a8', x: OBS.x - 3, z: OBS.z, rot: Math.PI / 2, y: OBSERVATORY.top },
];
// Le chaton perché sur le château d'eau
export const KITTEN = { x: WATER_TOWER.x, z: WATER_TOWER.z, y: WATER_TOWER.top, home: GIVERS.kitten };
// Contrebande : 5 caisses dorées dans les docks
export const SMUGGLE = {
  time: 180,
  crates: [
    { id: 'g1', x: containers[3].x, z: containers[3].z },
    { id: 'g2', x: CRANES[1].x, z: (CRANES[1].z0 + CRANES[1].z1) / 2 + 3 },
    { id: 'g3', x: -150, z: SHIP.z1 - 4 },
    { id: 'g4', x: -132, z: 96 },
    { id: 'g5', x: containers[containers.length - 9].x, z: containers[containers.length - 9].z },
  ].map(c => Object.assign(c, { y: groundY(c.x, c.z) })),
};
// Ballons de la foire
export const BALLOONS = {
  time: 120,
  list: [
    [36, 46, 4], [60, 40, 7], [48, 40, 11], [56, 66, 11], [88, 66, 12], [80, 58, 3.5], [40, 60, 4], [WHEEL.x, WHEEL.z, WHEEL.R + 19 - 0.8],
    [WHEEL.x + WHEEL.R - 1, WHEEL.z, 21], [94, 80, 3], [70, 34, 3], [30, 76, 3.5],
  ].map(([x, z, h], i) => ({ id: 'b' + i, x, z, y: GROUND + h })),
};
// Championnat : 3 tours de circuit contre 5 karts
export const CHAMPION = { laps: 3, rivals: 5, start: TRACK[4] };
// Trésor de la plage : 8 endroits où creuser, 3 morceaux de carte au trésor
export const TREASURE = {
  spots: [[40, 112], [62, 118], [84, 112], [98, 122], [126, 114], [142, 120], [170, 112], [186, 118]].map(([x, z], i) => ({ id: 't' + i, x, z, y: heightAt(x, z), gold: [1, 4, 6].includes(i) })),
};
// Descente : de l'observatoire au port en moins de 45 s
export const DOWNHILL = {
  time: 45,
  start: { x: -70, z: -178 },
  cps: [...HILL_ROAD.slice(0, -1).reverse().map(([x, z]) => ({ x, z })), { x: -30, z: -40 }, { x: -30, z: 38 }, { x: -30, z: 90 }],
  r: 8,
};
// Taxi : stations de départ et destinations
export const TAXI = {
  places: [
    { x: -43, z: 12, label: 'la place de la Fontaine' }, { x: 10, z: 112, label: 'la jetée' }, { x: 52, z: 92, label: 'la fête foraine' },
    { x: 104, z: -2, label: 'le parc' }, { x: 145, z: -70, label: 'le stade' }, { x: -160, z: 96, label: 'les docks' },
    { x: -30, z: -84, label: 'le pied des collines' }, { x: 130, z: 92, label: 'la plage' }, { x: -95, z: 64, label: 'le garage' },
    { x: -82, z: -66, label: 'la mairie' }, { x: 175, z: 24, label: 'le quartier des maisons' }, { x: -185, z: -30, label: 'le quartier ouest' },
  ],
  fares: 5,
};
// Grand final : le gang aux docks, puis la Capitaine en kart sur le boulevard
export const BOSS = {
  hp: 3, speed: 15,
  start: { x: -150, z: COAST, yaw: Math.PI / 2 },
  route: [[-108, 90], [24, 90], [24, -66], [-108, -66]].map(([x, z]) => ({ x, z })),
};

// Boutique de Mimi : chapeaux, peintures de kart, turbo
export const SHOP_ITEMS = [
  { id: 'h_cap', kind: 'hat', name: 'Casquette', price: 30 },
  { id: 'h_sun', kind: 'hat', name: 'Lunettes de soleil', price: 40 },
  { id: 'h_cowboy', kind: 'hat', name: 'Chapeau de cowboy', price: 60 },
  { id: 'h_pirate', kind: 'hat', name: 'Chapeau de pirate', price: 80 },
  { id: 'h_crown', kind: 'hat', name: 'Couronne', price: 150 },
  { id: 'p_gold', kind: 'paint', name: 'Kart doré', price: 120, color: 0xffc830 },
  { id: 'p_black', kind: 'paint', name: 'Kart noir', price: 60, color: 0x23252e },
  { id: 'p_pink', kind: 'paint', name: 'Kart rose', price: 40, color: 0xff7ab0 },
  { id: 'turbo', kind: 'turbo', name: 'Super turbo (pour tous)', price: 200 },
];

// Trophées (remis en fin de mission)
export const medals = MISSIONS.map(m => { const g = GIVERS[m.id]; return { id: m.medal, x: g.x, z: g.z, y: g.y + 2.6, label: m.title, visible: false }; });

// Chats bandits
export const cats = [
  { x: 40, z: -30 }, { x: 90, z: 10 }, { x: -20, z: 30 }, { x: -70, z: 104 }, { x: 46, z: -52 }, { x: -60, z: -45.4 },
  { x: 128, z: 24 }, { x: 150, z: -30 }, { x: -160, z: -30 }, { x: 60, z: 110 },
].map((c, i) => ({ id: 'cat' + (i + 1), x: c.x, z: c.z, group: 'roam' }))
  .concat([[-184, 98], [-157, 112], [-168, 98], [-152, 98], [-163, 118], [-136, 98], [-130, 110], [-188, 116]].map(([x, z], i) => ({ id: 'gang' + i, x, z, group: 'gang' })))
  .map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Karts garés (6 joueurs au maximum)
export const KARTS = [
  { id: 'k1', x: -88.6, z: 46, yaw: Math.PI / 2, color: 0xe03a3a },
  { id: 'k2', x: -88.6, z: 50, yaw: Math.PI / 2, color: 0x3a8ae0 },
  { id: 'k3', x: -88.6, z: 54, yaw: Math.PI / 2, color: 0x40c060 },
  { id: 'k4', x: START.x + 6, z: P0.z1 + 1.8, yaw: Math.PI / 2, color: 0xf0b020 },
  { id: 'k5', x: START.x - 6, z: P0.z1 + 1.8, yaw: Math.PI / 2, color: 0xc050e0 },
  { id: 'k6', x: -84.6, z: -6, yaw: Math.PI, color: 0xff7aa8 },
  { id: 'k7', x: 20, z: 96.8, yaw: Math.PI / 2, color: 0x2ac8c8 },
  { id: 'k8', x: -164, z: 96, yaw: 0, color: 0x8a6ae0 },
].map(k => Object.assign(k, { y: heightAt(k.x, k.z) }));

// Circulation : boucles de rues (voitures à droite)
export const TRAFFIC = [
  { n: 3, pts: [[-82, -40], [-30, -40], [-30, 38], [-82, 38]] },
  { n: 5, pts: [[-108, -66], [24, -66], [24, 90], [-108, 90]] },
  { n: 4, pts: [[24, 24], [150, 24], [150, 90], [24, 90]] },
  { n: 3, pts: [[104, -66], [150, -66], [150, 24], [104, 24]] },
  { n: 3, pts: [[-160, -66], [-108, -66], [-108, 12], [-160, 12]] },
  { n: 3, pts: [[-160, 12], [-108, 12], [-108, 90], [-160, 90]] },
  { n: 2, pts: [...HILL_ROAD, ...HILL_ROAD.slice(1, -1).reverse()] },
  { n: 2, pts: [[-56, -66], [-56, 90], [-4, 90], [-4, -66]] },
];
// Passants : tours de pâtés de maisons sur les trottoirs
export const WALKS = BLOCKS.filter(b => b.district === 'centre' && ['city', 'port', 'shop', 'market', 'plaza'].includes(b.type)).filter((_, i) => i % 2 === 0)
  .map(b => [[b.x0 + 1.2, b.z0 + 1.2], [b.x1 - 1.2, b.z0 + 1.2], [b.x1 - 1.2, b.z1 - 1.2], [b.x0 + 1.2, b.z1 - 1.2]]);

// Panneaux
export const signs = [
  { x: START.x + 3.2, z: START.z + 0.4, text: ['Bienvenue à Port-Croquette !', 'Les habitants ont besoin d\'aide :', 'cherchez les « ! » sur la carte.'] },
  { x: GIVERS.race.x + 3, z: GIVERS.race.z, text: ['Garage de Rita.', 'Les karts sont en libre-service :', 'approchez-vous et montez dedans !'] },
  { x: PIER.x0 - 2, z: PORT_QUAY - 2, text: ['La jetée et le phare.', 'Grimpez l\'escalier du phare', 'pour voir toute la ville !'] },
  { x: -158, z: 94, text: ['Docks de Port-Croquette.', 'Interdit aux chats bandits !'] },
  { x: 30.5, z: 30.5, text: ['Fête foraine !', 'Grande roue, manège, trampolines', 'et auto-tamponneuses.'] },
  { x: 141, z: -70, text: ['Stade de Port-Croquette.', 'Circuit ouvert à tous les karts !'] },
  { x: -26.5, z: -70, text: ['Route des collines ↑', 'Observatoire, villas', 'et château d\'eau.'] },
];

// Arrêt de train « Retour au Parc », sur la place (côté est, à côté du départ)
export const PORTALS = [{ x: -37.5, z: -3, to: 1 }];
export const PATHS = [];
export const CRYSTALS = [];
export const ruins = [];
