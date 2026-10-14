/*
 * Matcha & Ainu — Niveau 5 : « La Station des Neiges ».
 * Une montagne enneigée à explorer : village de chalets, lac gelé où l'on glisse,
 * télésiège, grande descente en luge, cascade gelée et fort de neige de la Capitaine.
 * Données pures (aucune dépendance) : utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   au sud, le Village des Chalets (départ, Mamie, Myrtille et son chalet-chocolat) ;
 *   à l'est, le Lac Gelé (on y glisse ; des chats patineurs) ;
 *   au nord, la Montagne : télésiège, Bernard le sauveteur au sommet, la Grande Glissade ;
 *   à l'ouest, la Cascade Gelée (blocs de glace à grimper) ;
 *   au nord-est, le Fort Moustache (bataille de boules de neige avec la Capitaine).
 */

export const ID = 5;
export const NAME = 'La Station des Neiges';
export const SAVE_KEY = 'dogfight.aventure.niveau5';
export const CAT_PLACE = 'sur le lac gelé';
export const COLLECT_NAME = 'flocons dorés';
export const MEDAL_TITLE = 'MÉDAILLE DES NEIGES !';
export const SURFACE = 'snow';          // bruit des pas
export const SNOW = true;              // monde enneigé (sol, sapins, flocons qui tombent : snow.js)
export const NO_WATER = true;          // pas de mer : des montagnes tout autour
export const WATER_Y = -30;
export const WORLD = 240;              // grand monde : carte en radar
export const RADAR = 62;

// Ambiance : grand ciel bleu d'hiver, lumière blanche et froide
export const SKY = { top: 0x3f7fd8, horizon: 0xe4eefa, bottom: 0xf2f6fc, sunDir: [0.42, 0.5, 0.5] };
export const LIGHT = { hemi: [0xeaf2ff, 0x8a98b8, 0.9], sun: [0xfff2e2, 2.1], fog: [80, 300] };
export const GRADE = { bloom: 0.45, saturation: 1.04, highTint: [0.0, 0.004, 0.014], shadowTint: [0.0, 0.01, 0.04] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const flatten = (h, x, z, c, r, y) => { const w = 1 - smooth(r * 0.7, r, Math.hypot(x - c.x, z - c.z)); return h * (1 - w) + y * w; };

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------
export const SPOTS = {
  spawn: { x: 0, z: 79 },
  mamie: { x: -4.5, z: 74.5 },
  village: { x: 0, z: 66 },
  lake: { x: 48, z: 6 },
  mountain: { x: -6, z: -66 },
  fort: { x: 62, z: -40 },
  falls: { x: -68, z: -24 },
};
export const MOUNTAIN = { x: -6, z: -66, r: 70, h: 26 };
export const SUMMIT_Y = 28;
export const LAKE = { x: 48, z: 6, r: 20, y: 1.7, islet: 3.2, isletY: 2.4 };
export const FORT = { x: 62, z: -40, r: 10, y: 2.5 };
export const VILLAGE_Y = 2.5;
// Corniche de la Cascade Gelée (on y monte par les blocs de glace)
export const LEDGE = { x0: -92, x1: -77.5, z0: -46, z1: -15.5, top: 15 };

// La Grande Glissade : la piste de luge, du sommet jusqu'à la plaine (creusée dans la neige)
export const RUN = [[-2, -58], [2, -46], [-10, -34], [0, -22], [-14, -10], [-24, 2], [-34, 12]];
export const RUN_W = 4.5;             // demi-largeur de la piste
export const SLED_START = { x: -2, z: -57, yaw: Math.atan2(4, 12), s: 1 };
export const FINISH = { x: -33, z: 11, r: 7 };

// Congères : petits monticules de neige poudreuse
export const DRIFTS = [[14, 40, 2.6, 1.1], [-12, 44, 3, 1.3], [26, 26, 2.4, 1.0], [-40, 46, 3, 1.2], [8, 18, 2.6, 1.1], [-50, -2, 3, 1.2],
  [30, 50, 2.8, 1.2], [70, 30, 3, 1.3], [-56, 30, 2.6, 1.1], [24, -26, 2.8, 1.2], [-30, -40, 2.4, 1.0], [72, -16, 2.6, 1.1]];

// la piste lissée (courbe de Catmull-Rom), un point tous les mètres environ
export const RUN_CURVE = [];
{
  const P = [RUN[0], ...RUN, RUN[RUN.length - 1]];
  for (let i = 1; i + 2 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      RUN_CURVE.push({ x: cr(p0[0], p1[0], p2[0], p3[0]), z: cr(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = RUN[RUN.length - 1];
  RUN_CURVE.push({ x: last[0], z: last[1] });
  let acc = 0;
  RUN_CURVE.forEach((c, i) => { if (i) acc += Math.hypot(c.x - RUN_CURVE[i - 1].x, c.z - RUN_CURVE[i - 1].z); c.s = acc; });
}
export const RUN_TOTAL = RUN_CURVE[RUN_CURVE.length - 1].s;
/** Point de la piste à la distance s du départ : { x, z, dx, dz } (direction unitaire). */
export function runAt(s) {
  s = clamp(s, 0, RUN_TOTAL);
  let lo = 0, hi = RUN_CURVE.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RUN_CURVE[m].s <= s) lo = m; else hi = m; }
  const a = RUN_CURVE[lo], b = RUN_CURVE[hi], l = (b.s - a.s) || 1, k = (s - a.s) / l;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
}
// grille de recherche : pour chaque case de 8 m, les morceaux de piste à moins de 12 m
const RG = 8, RUN_GRID = new Map();
{
  for (let i = 0; i + 1 < RUN_CURVE.length; i++) {
    const a = RUN_CURVE[i], b = RUN_CURVE[i + 1];
    for (let gx = Math.floor((Math.min(a.x, b.x) - 12) / RG); gx <= Math.floor((Math.max(a.x, b.x) + 12) / RG); gx++) {
      for (let gz = Math.floor((Math.min(a.z, b.z) - 12) / RG); gz <= Math.floor((Math.max(a.z, b.z) + 12) / RG); gz++) {
        const key = gx * 1000 + gz;
        if (!RUN_GRID.has(key)) RUN_GRID.set(key, []);
        RUN_GRID.get(key).push(i);
      }
    }
  }
}
const FAR = { d: 1e9, along: 0, dir: [0, 1] };
/** Distance au tracé de la piste : { d, along (m depuis le départ), dir }. */
export function runInfo(x, z) {
  const list = RUN_GRID.get(Math.floor(x / RG) * 1000 + Math.floor(z / RG));
  if (!list) return FAR;
  let best = FAR;
  for (const i of list) {
    const a = RUN_CURVE[i], b = RUN_CURVE[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, l = Math.sqrt(l2) || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (l2 || 1), 0, 1);
    const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (d < best.d) best = { d, along: a.s + t * l, dir: [dx / l, dz / l] };
  }
  return best;
}

/** Relief de la montagne (sans piste, ni congères). */
function landHeight(x, z) {
  let h = VILLAGE_Y + 0.55 * Math.sin(x * 0.08 + 1) * Math.cos(z * 0.07) + 0.35 * Math.sin(x * 0.05 - z * 0.06);
  // la Montagne, au nord
  const dm = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  h += MOUNTAIN.h * (1 - smooth(0, MOUNTAIN.r, dm));
  // des montagnes tout autour : on ne sort pas de la station
  // (une corniche de neige infranchissable, puis des sommets en dents de scie)
  const e = Math.pow(x ** 4 + z ** 4, 0.25) + Math.sin(x * 0.13) * 1.5 + Math.cos(z * 0.11) * 1.5;
  if (e > 94) {
    const ang = Math.atan2(z, x), peaks = 42 + 12 * Math.sin(ang * 5 + 1) + 7 * Math.sin(ang * 13 + 2) + 3 * Math.sin(ang * 29);
    h += 7.5 * smooth(97, 99, e) + peaks * smooth(99, 105, e) + 12 * smooth(105, 118, e) * (0.5 + 0.5 * Math.sin(ang * 9));
  }
  return h;
}

/** Hauteur du sol (neige, glace du lac, corniche). */
export function heightAt(x, z) {
  let h = landHeight(x, z);
  // lieux aplanis
  h = flatten(h, x, z, SPOTS.mountain, 14, SUMMIT_Y);
  h = flatten(h, x, z, SPOTS.village, 30, VILLAGE_Y);
  h = flatten(h, x, z, SPOTS.fort, 17, FORT.y);
  h = flatten(h, x, z, SPOTS.falls, 14, VILLAGE_Y);
  // congères
  for (const [cx, cz, r, dh] of DRIFTS) { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); if (d2 < 9) h += dh * Math.exp(-d2); }
  // la piste de luge : une gouttière creusée, avec un petit bourrelet de chaque côté
  const ri = runInfo(x, z);
  if (ri.d < 9) h += -1.0 * (1 - smooth(1.5, RUN_W, ri.d)) + 0.55 * Math.exp(-(((ri.d - RUN_W - 0.6) / 1.1) ** 2));
  // le lac gelé : plat (la glace), avec son îlot au milieu
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 4) {
    const k = smooth(LAKE.r + 3, LAKE.r - 0.5, dl);
    h = h * (1 - k) + LAKE.y * k;
    if (dl < LAKE.islet + 1.5) h = Math.max(h, LAKE.y + (LAKE.isletY - LAKE.y) * smooth(LAKE.islet + 1.2, LAKE.islet - 0.6, dl));
  }
  // la corniche de la cascade (bords à pic)
  const L = LEDGE;
  const k = smooth(L.x1 + 0.6, L.x1 - 0.9, x) * smooth(L.x0 - 0.9, L.x0 + 0.6, x) * smooth(L.z0 - 0.75, L.z0 + 0.75, z) * smooth(L.z1 + 0.75, L.z1 - 0.75, z);
  if (k > 0) h = Math.max(h, h * (1 - k) + L.top * k);
  return h;
}
export function inWater() { return false; }

/** Sur la glace (on glisse) ? */
export const FALLS_POOL = { x: -73.5, z: -31, r: 3.4 };
export function iceAt(x, z, y) {
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r - 0.4 && dl > LAKE.islet + 0.3 && (y === undefined || y < LAKE.y + 0.5)) return true;
  return Math.hypot(x - FALLS_POOL.x, z - FALLS_POOL.z) < FALLS_POOL.r && (y === undefined || y < heightAt(x, z) + 0.3);
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Village : chalets (w, d : taille au sol ; door : côté de la porte, vers la place)
export const CHALETS = [
  { x: -18, z: 56, w: 7, d: 6, h: 3.4, door: 1, col: 0xb06a3a, roof: 0x8a3a2a },
  { x: -18, z: 73, w: 7, d: 6, h: 3.4, door: 1, col: 0xc08050, roof: 0x5a6a8a },
  { x: 18, z: 56, w: 7, d: 6, h: 3.4, door: -1, col: 0xa8643a, roof: 0x3a6a4a },
  { x: 18, z: 73, w: 7.5, d: 6.5, h: 3.6, door: -1, col: 0xd08a5a, roof: 0xc0303a, choco: true },   // le chalet-chocolat de Myrtille
  { x: -7, z: 46, w: 6, d: 5.5, h: 3.2, door: 0, col: 0xb87848, roof: 0x8a3a2a },
  { x: 8, z: 45, w: 6, d: 5.5, h: 3.2, door: 0, col: 0xa06038, roof: 0x5a6a8a },
];
for (const c of CHALETS) { c.y = VILLAGE_Y; c.col_ = box(c.x, c.z, c.w, c.d, c.y - 1, c.y + c.h, { kind: 'rock', solid: true, map: '#a07050' }); }
// le grand sapin décoré de la place
export const BIG_TREE = { x: 0, z: 60, r: 1.1, h: 9 };
cyl(BIG_TREE.x, BIG_TREE.z, BIG_TREE.r, VILLAGE_Y - 1, VILLAGE_Y + 2.2, { kind: 'trunk' });
// lampadaires et bancs (petits)
export const LAMPS = [[-5, 69], [5, 69], [-5, 52], [5, 52], [-9, 80], [11, 78], [24, 40], [-22, 36]].map(([x, z]) => ({ x, z, y: 0 }));
for (const l of LAMPS) { l.y = heightAt(l.x, l.z); cyl(l.x, l.z, 0.18, l.y - 1, l.y + 3, { kind: 'rock' }); }

// Télésiège : gare du bas (dans la plaine) → gare du haut (au sommet)
export const LIFT = { base: { x: -18, z: 24 }, top: { x: -12, z: -59 } };
LIFT.base.y = heightAt(LIFT.base.x, LIFT.base.z); LIFT.top.y = heightAt(LIFT.top.x, LIFT.top.z);
// gare du bas : une cabane au toit plat (on peut y grimper par le tas de bois)
export const STATION = { x: LIFT.base.x - 4.5, z: LIFT.base.z + 1, w: 4, d: 4.5, h: 3.4 };
STATION.y = heightAt(STATION.x, STATION.z);
box(STATION.x, STATION.z, STATION.w, STATION.d, STATION.y - 1, STATION.y + STATION.h, { kind: 'rock', solid: true, map: '#9a7a5a' });
export const WOODPILE = { x: STATION.x + 3.1, z: STATION.z + 1.4, w: 1.8, d: 1.4, h: 1.7 };
WOODPILE.y = heightAt(WOODPILE.x, WOODPILE.z);
box(WOODPILE.x, WOODPILE.z, WOODPILE.w, WOODPILE.d, WOODPILE.y - 1, WOODPILE.y + WOODPILE.h, { kind: 'rock', solid: true });
// gare du haut : une plate-forme de bois
export const TOP_DECK = { x: LIFT.top.x - 1.5, z: LIFT.top.z - 2.5 };
// pylônes et câble (le siège pend 2 m sous le câble)
export const LIFT_PTS = [];
export const PYLONS = [];
{
  const B = LIFT.base, T = LIFT.top, len = Math.hypot(T.x - B.x, T.z - B.z), n = Math.round(len / 11);
  const groundMax = (k0, k1) => { let m = -1e9; for (let j = 0; j <= 8; j++) { const k = k0 + (k1 - k0) * j / 8; m = Math.max(m, heightAt(B.x + (T.x - B.x) * k, B.z + (T.z - B.z) * k)); } return m; };
  LIFT_PTS.push({ x: B.x, z: B.z, y: B.y + 4.6 });
  for (let i = 1; i < n; i++) {
    const k = i / n, x = B.x + (T.x - B.x) * k, z = B.z + (T.z - B.z) * k;
    const top = groundMax(Math.max(0, k - 0.6 / n), Math.min(1, k + 0.6 / n)) + 7.5;
    PYLONS.push({ x, z, y: heightAt(x, z), top });
    LIFT_PTS.push({ x, z, y: top });
  }
  LIFT_PTS.push({ x: T.x, z: T.z, y: T.y + 4.6 });
  for (const p of PYLONS) cyl(p.x, p.z, 0.35, p.y - 1, p.top, { kind: 'rock' });
  let s = 0;
  LIFT_PTS.forEach((p, i) => { if (i) s += Math.hypot(p.x - LIFT_PTS[i - 1].x, p.y - LIFT_PTS[i - 1].y, p.z - LIFT_PTS[i - 1].z); p.s = s; });
}
export const LIFT_LEN = LIFT_PTS[LIFT_PTS.length - 1].s;
export const LIFT_SPEED = 7;
export const SEAT_DROP = 2.1;
/** Point du câble à la distance s depuis la gare du bas. */
export function liftAt(s) {
  s = clamp(s, 0, LIFT_LEN);
  let i = 1;
  while (i < LIFT_PTS.length - 1 && LIFT_PTS[i].s < s) i++;
  const a = LIFT_PTS[i - 1], b = LIFT_PTS[i], k = (s - a.s) / ((b.s - a.s) || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z };
}

// Sommet : le poste de secours de Bernard
export const HUT = { x: 7, z: -70, w: 5, d: 4.5, h: 3.2 };
HUT.y = heightAt(HUT.x, HUT.z);
box(HUT.x, HUT.z, HUT.w, HUT.d, HUT.y - 1.5, HUT.y + HUT.h, { kind: 'rock', solid: true, map: '#c04a3a' });
export const SLED_RACK = { x: SLED_START.x - 2.8, z: SLED_START.z - 1.5 };
SLED_RACK.y = heightAt(SLED_RACK.x, SLED_RACK.z);

// Cascade Gelée : blocs de glace pour monter sur la corniche
export const ICE_STEPS = [
  { x: -70, z: -12, top: 3.9 },
  { x: -71.2, z: -16.6, top: 5.7 },
  { x: -74.4, z: -19.6, top: 7.5 },
  { x: -72.6, z: -23.8, top: 9.3 },
  { x: -74.2, z: -28, top: 11.1 },
  { x: -76.2, z: -32.3, top: 12.9 },
].map(s => Object.assign(s, { r: 1.55 }));
for (const s of ICE_STEPS) s.col = cyl(s.x, s.z, s.r, heightAt(s.x, s.z) - 1, s.top, { kind: 'rock', ice: true });
export const ICEFALL = { x: LEDGE.x1 - 0.2, z: -36.5, w: 7 };    // le rideau de glace (décor)

// Fort Moustache : un cercle de blocs de neige, ouvert au sud
export const fortBlocks = [];
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  if (Math.abs(a - Math.PI / 2) < 0.4) continue;   // l'entrée (vers +z)
  const x = FORT.x + Math.cos(a) * FORT.r, z = FORT.z + Math.sin(a) * FORT.r, h = 1.9 + (i % 3) * 0.25;
  fortBlocks.push({ x, z, y: FORT.y, h, a });
  cyl(x, z, 1.45, FORT.y - 1, FORT.y + h, { kind: 'rock' });
}
// deux tours de neige près de l'entrée
export const FORT_TOWERS = [-1, 1].map(s => ({ x: FORT.x + s * 4.2, z: FORT.z + FORT.r + 0.6, r: 1.5, h: 3.2 }));
for (const t of FORT_TOWERS) cyl(t.x, t.z, t.r, FORT.y - 1, FORT.y + t.h, { kind: 'rock' });

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
  for (const c of colliders) if (!c.off && c.kind !== 'tree' && c.kind !== 'trunk' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return best;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const lineTo = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const ring = (cx, cz, r, n, a0, lift) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (a0 || 0); at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, lift); } };
// village
lineTo(0, 75, 0, 67, 3);
ring(BIG_TREE.x, BIG_TREE.z, 4.2, 8, 0.2);
lineTo(-9, 64, -9, 50, 3); lineTo(9, 64, 9, 52, 3);
// vers le lac
lineTo(14, 48, 30, 22, 7);
// sur la glace, tout autour de l'îlot
ring(LAKE.x, LAKE.z, 11, 12, 0.1);
ring(LAKE.x, LAKE.z, 1.6, 3, 0.5);
lineTo(LAKE.x - 16, LAKE.z - 4, LAKE.x - 5, LAKE.z - 2, 3);
// du lac au fort
lineTo(56, -16, 62, -26, 5);
ring(FORT.x, FORT.z, 5, 6, 0.3);
// vers le télésiège
lineTo(-4, 44, -15, 28, 6);
// sur le toit de la gare du bas et le tas de bois
at(WOODPILE.x, WOODPILE.z); at(STATION.x - 0.8, STATION.z - 0.8); at(STATION.x + 0.8, STATION.z + 0.8);
// la Grande Glissade (on les attrape en luge !)
for (let k = 0.08; k < 0.97; k += 0.06) { const p = runAt(k * RUN_TOTAL); at(p.x, p.z, 1.0); }
// au sommet
ring(SPOTS.mountain.x, SPOTS.mountain.z, 6, 6, 0.6);
// le chemin à pied vers le sommet (flanc est de la montagne)
lineTo(14, 30, 16, -14, 5);
lineTo(14, -22, 4, -48, 5);
// la Cascade Gelée : sur chaque bloc, puis sur la corniche
for (const s of ICE_STEPS) at(s.x, s.z);
lineTo(-82, -20, -82, -40, 4);
lineTo(-60, -4, -66, -12, 3);
// la plaine ouest et est
lineTo(-24, 50, -44, 34, 4);
lineTo(60, 36, 74, 18, 3);
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'f' + i, x: p.x, y: p.y, z: p.z }));
export const BONES_FOUND = pts.length;
export const balls = [];

// Bonnets à pompon de l'école de ski (mission de Bernard)
export const BONNETS = [
  { id: 'b1', x: LAKE.x + 1.6, z: LAKE.z + 1.2, col: 0xe8403a, where: 'sur l\'îlot du lac gelé' },
  { id: 'b2', x: ICE_STEPS[3].x, z: ICE_STEPS[3].z, col: 0x3a8ae8, where: 'sur un bloc de la Cascade Gelée' },
  { id: 'b3', x: STATION.x, z: STATION.z, col: 0xf0c020, where: 'sur le toit de la gare du télésiège' },
].map(b => Object.assign(b, { y: groundY(b.x, b.z) }));

// Médailles des Neiges
export const medals = [
  { id: 'm_lake', x: LAKE.x - 0.8, z: LAKE.z - 1, y: LAKE.isletY + 1.5, label: 'Les chats patineurs', visible: false },
  { id: 'm_bonnets', x: 0, z: -66.5, y: SUMMIT_Y + 1.5, label: 'Les bonnets de l\'école de ski', visible: false },
  { id: 'm_sled', x: FINISH.x - 2, z: FINISH.z + 2.5, y: heightAt(FINISH.x - 2, FINISH.z + 2.5) + 1.5, label: 'La Grande Glissade', visible: false },
  { id: 'm_falls', x: -86, z: -30, y: LEDGE.top + 1.5, label: 'Le haut de la Cascade Gelée', visible: true },
  { id: 'm_fort', x: FORT.x, z: FORT.z - 2, y: FORT.y + 1.5, label: 'La bataille de boules de neige', visible: false },
];

export const crates = [
  { id: 'c1', x: 10, z: 36, content: 'heart' },
  { id: 'c2', x: -36, z: 28, content: 'heart' },
  { id: 'c3', x: 76, z: -30, content: 'heart' },
  { id: 'c4', x: -62, z: -8, content: 'heart' },
  { id: 'c5', x: 34, z: 26, content: 'none' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Chats farceurs : 4 patineurs sur le lac, d'autres qui se promènent (et lancent des boules de neige)
export const cats = [
  { id: 'cat1', x: LAKE.x - 9, z: LAKE.z - 5, group: 'clearing' },
  { id: 'cat2', x: LAKE.x + 8, z: LAKE.z + 6, group: 'clearing' },
  { id: 'cat3', x: LAKE.x - 3, z: LAKE.z + 10, group: 'clearing' },
  { id: 'cat4', x: LAKE.x + 9, z: LAKE.z - 7, group: 'clearing' },
  { id: 'cat5', x: 22, z: 30, group: 'roam' },
  { id: 'cat6', x: -34, z: 40, group: 'roam' },
  { id: 'cat7', x: 30, z: -24, group: 'roam' },
  { id: 'cat8', x: -56, z: -10, group: 'roam' },
  { id: 'cat9', x: FORT.x + 16, z: FORT.z - 6, group: 'roam' },
  { id: 'cat10', x: FORT.x - 14, z: FORT.z + 16, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: groundY(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.mamie.x + 1.6, z: SPOTS.mamie.z + 1.2, y: groundY(SPOTS.mamie.x + 1.6, SPOTS.mamie.z + 1.2) },
};
/** Les habitants de la station. */
export const FOLKS = {
  bernard: { x: 3, z: -62, yaw: Math.PI * 0.85, name: 'Bernard' },
  myrtille: { x: 13, z: 73, yaw: -Math.PI / 2, name: 'Myrtille' },
};
for (const k in FOLKS) FOLKS[k].y = groundY(FOLKS[k].x, FOLKS[k].z);

// Panneaux
export const signs = [
  { x: 3.5, z: 72, text: ['Station des Neiges', '→ Lac Gelé · ↑ Télésiège et Montagne', '← Cascade Gelée · ↗ Fort Moustache'] },
  { x: 30, z: 18, text: ['Le Lac Gelé', 'Attention, ça glisse !', 'Courez, puis lâchez tout : on patine…'] },
  { x: LIFT.base.x + 3, z: LIFT.base.z + 4, text: ['Télésiège de la Montagne', 'Montez dans un siège :', 'il vous emmène tout en haut !'] },
  { x: SLED_START.x - 6.5, z: SLED_START.z + 1, text: ['La Grande Glissade', 'Prenez une luge et descendez !', 'Penchez-vous pour tourner.'] },
  { x: -63, z: -16, text: ['La Cascade Gelée', 'Sautez de bloc en bloc', 'jusqu\'en haut de la cascade !'] },
  { x: FORT.x + 3, z: FORT.z + FORT.r + 5, text: ['Fort Moustache', 'Défense d\'entrer… sauf pour jouer', 'aux boules de neige ! — La Capitaine'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: groundY(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Drapeaux : on y repart après une chute de cœurs (en mode Défi)
export const CHECKPOINTS = [
  { id: 0, x: 5, z: 76, name: 'Village des Chalets' },
  { id: 1, x: 27, z: 14, name: 'Lac Gelé' },
  { id: 2, x: -8, z: -71, name: 'Sommet' },
  { id: 3, x: -62, z: -22, name: 'Cascade Gelée' },
  { id: 4, x: 67, z: -24, name: 'Fort Moustache' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Chemins de neige tassée (dessinés sur le sol par snow.js)
export const PATHS = [];
export const SNOW_PATHS = [[[0, 84], [0, 46]], [[2, 46], [28, 22]], [[-2, 46], [-16, 27]], [[30, 18], [44, -10]], [[56, -14], [62, -28]],
  [[14, 30], [16, -14]], [[14, -22], [4, -48]], [[-14, 26], [-56, -6]], [[-56, -6], [-66, -12]]];
export const CRYSTALS = [];
export const ruins = [];

// Portail de retour vers le Parc, au village
export const PORTALS = [{ x: 8, z: 82, to: 1 }];

// Sapins (forêt clairsemée, beaucoup sur les flancs de la montagne)
export const trees = [];
{
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const segDist = (x, z, [[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  };
  const keep = [[SPOTS.village, 31], [LAKE, LAKE.r + 4], [SPOTS.fort, 17], [SPOTS.mountain, 15], [SPOTS.falls, 13], [FINISH, 11], [START, 8]];
  const liftLine = [[LIFT.base.x, LIFT.base.z], [LIFT.top.x, LIFT.top.z]];
  let guard = 0;
  while (trees.length < 130 && guard++ < 9000) {
    const x = (rnd() - 0.5) * 196, z = (rnd() - 0.5) * 196;
    if (Math.pow(x ** 4 + z ** 4, 0.25) > 93) continue;
    const h = heightAt(x, z);
    if (keep.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
    if (runInfo(x, z).d < RUN_W + 3.5) continue;
    if (segDist(x, z, liftLine) < 5) continue;
    if (SNOW_PATHS.some(p => segDist(x, z, p) < 3.2)) continue;
    if (x < LEDGE.x1 + 6 && z > LEDGE.z0 - 6 && z < LEDGE.z1 + 8) continue;     // la corniche et ses blocs
    if (colliders.some(c => inside(c, x, z, 2.5))) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 4.6)) continue;
    if (signs.some(s => Math.hypot(s.x - x, s.z - z) < 3) || crates.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (cats.some(c => Math.hypot(c.x - x, c.z - z) < 3) || CHECKPOINTS.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    let cliff = false;
    for (let a = 0; a < 6.28; a += 0.785) if (Math.abs(heightAt(x + Math.cos(a) * 2, z + Math.sin(a) * 2) - h) > 1.6) cliff = true;
    if (cliff) continue;
    const s = 0.8 + rnd() * 0.6;
    trees.push({ x, z, y: h, s, h: 7 * s });
  }
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}

/** Mini-carte : neige, glace, rochers. */
export function mapColor(x, z) {
  const h = heightAt(x, z);
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r - 0.4 && dl > LAKE.islet + 0.3) return [168, 214, 240];
  if (runInfo(x, z).d < 2.6 && h > 2.5) return [196, 214, 236];
  for (const c of colliders) if (c.map && inside(c, x, z, 0)) return null;
  if (h > 34) return [176, 184, 200];
  const k = clamp(h / 30, 0, 1);
  return [Math.round(240 - 30 * k), Math.round(244 - 24 * k), Math.round(250 - 12 * k)];
}
