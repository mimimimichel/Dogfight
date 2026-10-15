/*
 * Matcha & Ainu — Niveau 5 : « La Station des Neiges ».
 * Une grande montagne enneigée à explorer (environ 400 m de côté) : village de chalets,
 * patinoire, jardin des bonshommes de neige, rivière gelée, lac gelé et village des
 * pingouins, forêt de sapins (et son renard), Crevasse de Cristal, Cascade Gelée,
 * télésiège, la Grande Glissade (longue piste de luge avec bosses, tunnel et embranchements)
 * et, tout au nord-est, le Fort Moustache.
 * Données pures (aucune dépendance) : utilisé par le jeu (snow.js) et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   au sud, le Village des Chalets (départ, Mamie, Myrtille), la patinoire (Pingo) à l'ouest
 *   du village, le jardin des bonshommes de neige à l'est ;
 *   la rivière gelée traverse la plaine d'ouest en est jusqu'au lac gelé ;
 *   au nord, la Montagne (télésiège, Bernard au sommet, la Grande Glissade) ;
 *   à l'est, le lac gelé et le village des pingouins ; au nord-est, le Fort Moustache ;
 *   à l'ouest, la forêt (le renard), la Cascade Gelée et la Crevasse de Cristal.
 *
 * Les 5 médailles demandent chacune plusieurs étapes :
 *   m_bonnets  : Bernard (au sommet) a perdu 5 bonnets, éparpillés partout ; on les lui rapporte.
 *   m_sled     : descendre toute la Grande Glissade en passant au moins GATES_NEEDED portes.
 *   m_penguins : chasser les chats du lac, puis ramener le bébé pingouin chez sa maman.
 *   m_snowman  : rouler 3 boules de neige au jardin, puis rapporter la carotte de Myrtille.
 *   m_fort     : le fort ne s'ouvre qu'avec FORT_MEDALS médailles ; bataille de boules de neige.
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
export const WORLD = 420;              // grand monde : carte en radar
export const RADAR = 75;
export const FORT_MEDALS = 3;          // médailles pour ouvrir le Fort Moustache
export const GATES_NEEDED = 8;         // portes à passer pendant la descente pour la médaille de luge

// Ambiance : grand ciel bleu d'hiver, lumière blanche et froide
export const SKY = { top: 0x3f7fd8, horizon: 0xe4eefa, bottom: 0xf2f6fc, sunDir: [0.42, 0.5, 0.5] };
export const LIGHT = { hemi: [0xeaf2ff, 0x8a98b8, 0.9], sun: [0xfff2e2, 2.1], fog: [100, 340] };
export const GRADE = { bloom: 0.45, saturation: 1.04, highTint: [0.0, 0.004, 0.014], shadowTint: [0.0, 0.01, 0.04] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const flatten = (h, x, z, c, r, y) => { const d2 = (x - c.x) ** 2 + (z - c.z) ** 2; if (d2 > r * r) return h; const w = 1 - smooth(r * 0.7, r, Math.sqrt(d2)); return h * (1 - w) + y * w; };

// ---------------------------------------------------------------------------
// Lignes lissées (pistes de luge, rivière) : courbe de Catmull-Rom + grille de recherche
// ---------------------------------------------------------------------------
function makeLine(id, P0, reach) {
  const P = [P0[0], ...P0, P0[P0.length - 1]], pts = [];
  for (let i = 1; i + 2 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      pts.push({ x: cr(p0[0], p1[0], p2[0], p3[0]), z: cr(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = P0[P0.length - 1];
  pts.push({ x: last[0], z: last[1] });
  let acc = 0;
  pts.forEach((c, i) => { if (i) acc += Math.hypot(c.x - pts[i - 1].x, c.z - pts[i - 1].z); c.s = acc; });
  const G = 8, grid = new Map();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let gx = Math.floor((Math.min(a.x, b.x) - reach) / G); gx <= Math.floor((Math.max(a.x, b.x) + reach) / G); gx++) {
      for (let gz = Math.floor((Math.min(a.z, b.z) - reach) / G); gz <= Math.floor((Math.max(a.z, b.z) + reach) / G); gz++) {
        const key = gx * 4096 + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  }
  const line = { id, pts, total: acc, waypoints: P0 };
  /** Point à la distance s : { x, z, dx, dz }. */
  line.at = (s) => {
    s = clamp(s, 0, acc);
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], l = (b.s - a.s) || 1, k = (s - a.s) / l;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
  };
  /** Distance à la ligne : { d, along, dir, line } (d très grand si loin). */
  line.info = (x, z) => {
    const list = grid.get(Math.floor(x / G) * 4096 + Math.floor(z / G));
    let best = null;
    if (!list) return null;
    for (const i of list) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, l = Math.sqrt(l2);
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
      const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
      if (!best || d < best.d) best = { d, along: a.s + t * l, dir: [dx / l, dz / l], line };
    }
    return best;
  };
  return line;
}

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------
export const BASE_Y = 3;
export const VILLAGE_Y = 3;
export const SPOTS = {
  spawn: { x: 0, z: 172 },
  mamie: { x: -5, z: 166 },
  village: { x: 0, z: 150 },
  rink: { x: -52, z: 150 },
  garden: { x: 52, z: 128 },
  mountain: { x: 0, z: -130 },
  lake: { x: 132, z: 22 },
  igloos: { x: 150, z: 88 },
  fort: { x: 150, z: -112 },
  falls: { x: -150, z: -40 },
  crevasse: { x: -140, z: -118 },
  den: { x: -112, z: -62 },
  liftBase: { x: 22, z: 30 },
};
export const MOUNTAIN = { x: 0, z: -130, r: 142, h: 58 };
export const SUMMIT_Y = 61;
export const LAKE = { x: 132, z: 22, r: 27, y: 1.4, islet: 3.4, isletY: 2.1 };
export const RINK = { x: -52, z: 150, rx: 16, rz: 10, y: VILLAGE_Y };
export const FORT = { x: 150, z: -112, r: 11, y: BASE_Y };
export const GARDEN = { x: 52, z: 128, r: 3 };          // où l'on bâtit le bonhomme de neige
export const LEDGE = { x0: -186, x1: -164.6, z0: -62, z1: -26, top: 17 };
export const CREVASSE = { x: -140, z: -118, y: BASE_Y };

// La Grande Glissade : une piste principale et deux embranchements (creusés dans la neige)
export const RUN_W = 5;                 // demi-largeur du fond de la piste
// la piste descend toujours (on s'éloigne sans cesse du sommet) : d'abord un grand tour de la
// montagne en colimaçon, puis de larges virages jusqu'à la plaine
const spiralPt = (k, bulge) => { const a = (90 - 360 * k) * Math.PI / 180, d = 18 + 54 * k + (bulge || 0); return [Math.round((MOUNTAIN.x + Math.cos(a) * d) * 10) / 10, Math.round((MOUNTAIN.z + Math.sin(a) * d) * 10) / 10]; };
const SPIRAL = []; for (let i = 0; i <= 12; i++) SPIRAL.push(spiralPt(i / 12));
export const RUNS = [
  makeLine('main', [...SPIRAL, [26, -46], [38, -30], [30, -12], [10, 0], [-12, 10]], 16),
  // la piste des sapins : un raccourci plus raide, tout droit par le flanc est, au milieu des sapins
  makeLine('foret', [spiralPt(0.35), [50, -140], [70, -118], [72, -90], [52, -62], [26, -46]], 16),
  // la piste des bosses : par l'est, avant l'arrivée
  makeLine('bosses', [[26, -46], [48, -38], [54, -18], [34, -4], [10, 0]], 16),
];
export const RUN = RUNS[0];
export const RUN_TOTAL = RUN.total;
export const SLED_START = { s: 2 };
export const FINISH = { x: -12, z: 10, r: 7 };
/** Bosses (petits tremplins) sur les pistes : [piste, distance, hauteur]. */
export const BUMPS = [['main', 60, 0.9], ['main', 200, 1.0], ['main', 290, 1.1], ['main', 335, 1.1], ['foret', 40, 1.0], ['foret', 75, 1.1], ['foret', 110, 1.0], ['bosses', 12, 0.9], ['bosses', 24, 1.0], ['bosses', 36, 1.1]];
// le tunnel de neige, sur la piste principale
export const TUNNEL = { line: 'main', s0: 0, s1: 0, len: 16 };
/** Distance aux pistes (la plus proche) : { d, along, dir, line } ou { d: 1e9 }. */
const FAR = { d: 1e9, along: 0, dir: [0, 1], line: null };
export function runInfo(x, z) {
  let best = FAR;
  for (const r of RUNS) { const i = r.info(x, z); if (i && i.d < best.d) best = i; }
  return best;
}
// la rivière gelée
export const RIVER = makeLine('river', [[-157, -57], [-140, -36], [-130, -8], [-110, 26], [-74, 58], [-36, 80], [0, 88], [36, 86], [72, 72], [104, 50], [118, 36]], 10);
export const RIVER_W = 3.6;
export function riverInfo(x, z) { return RIVER.info(x, z) || FAR; }

// Congères : petits monticules de neige poudreuse
export const DRIFTS = [[24, 120, 3, 1.2], [-24, 116, 3.4, 1.4], [80, 150, 3, 1.2], [-90, 140, 3.4, 1.3], [100, 110, 3, 1.2], [-70, 100, 3, 1.1],
  [60, 40, 3.2, 1.3], [-100, 20, 3, 1.2], [120, -30, 3, 1.2], [90, -70, 2.8, 1.1], [-120, -90, 3, 1.2], [170, 40, 3, 1.3],
  [-160, 80, 3.2, 1.3], [40, 170, 3, 1.2], [-40, 180, 2.8, 1.1], [150, 150, 3, 1.3], [-150, 150, 3, 1.2], [170, -60, 3, 1.2]];

/** Relief de base (montagne, bords du monde). */
function landHeight(x, z) {
  let h = BASE_Y + 0.7 * Math.sin(x * 0.05 + 1) * Math.cos(z * 0.045) + 0.45 * Math.sin(x * 0.031 - z * 0.04) + 0.3 * Math.sin(x * 0.11 + z * 0.09);
  // la Montagne, au nord
  const dm = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  if (dm < MOUNTAIN.r) { const k = 1 - dm / MOUNTAIN.r; h += MOUNTAIN.h * (k * k * (3 - 2 * k)); }
  // des collines boisées à l'ouest et au nord-est
  for (const [cx, cz, r, hh] of HILLS) { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); if (d2 < 9) h += hh * Math.exp(-d2); }
  // une corniche infranchissable, puis des sommets en dents de scie tout autour
  const e = Math.pow(x ** 4 + z ** 4, 0.25) + Math.sin(x * 0.07) * 2 + Math.cos(z * 0.06) * 2;
  if (e > 186) {
    const ang = Math.atan2(z, x), peaks = 46 + 14 * Math.sin(ang * 7 + 1) + 8 * Math.sin(ang * 17 + 2) + 4 * Math.sin(ang * 37);
    h += 8 * smooth(190, 192, e) + peaks * smooth(192, 199, e) + 16 * smooth(199, 210, e) * (0.5 + 0.5 * Math.sin(ang * 11));
  }
  return h;
}
export const HILLS = [[-120, 100, 22, 7], [-176, 64, 18, 7], [168, -42, 18, 6], [150, 150, 22, 7]];

export const PLAIN_SPOTS = [[SPOTS.village, 36, VILLAGE_Y], [SPOTS.rink, 24, VILLAGE_Y], [SPOTS.garden, 16, BASE_Y], [SPOTS.fort, 20, FORT.y], [SPOTS.falls, 26, BASE_Y],
  [SPOTS.crevasse, 24, CREVASSE.y], [SPOTS.igloos, 18, BASE_Y], [SPOTS.den, 12, BASE_Y + 1], [SPOTS.liftBase, 12, BASE_Y]];

/** Hauteur du sol (neige, glace, corniche, pistes). */
export function heightAt(x, z) {
  let h = landHeight(x, z);
  h = flatten(h, x, z, SPOTS.mountain, 18, SUMMIT_Y);
  for (const [c, r, y] of PLAIN_SPOTS) h = flatten(h, x, z, c, r, y);
  h = flatten(h, x, z, FINISH, 34, 0.8);   // l'arrivée est dans un creux : les luges y glissent toutes seules
  // congères
  for (const [cx, cz, r, dh] of DRIFTS) { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); if (d2 < 9) h += dh * Math.exp(-d2); }
  // les pistes : une gouttière creusée avec des bords relevés (murs de neige), et des bosses
  // (plusieurs pistes se rejoignent : on garde le creux le plus profond et le bourrelet le plus haut, hors des creux)
  let carve = 0, berm = 0, inside = 0, bump = 0;
  for (const r of RUNS) {
    const ri = r.info(x, z);
    if (!ri || ri.d > 12) continue;
    const k = 1 - smooth(RUN_W - 2, RUN_W + 0.5, ri.d);
    carve = Math.min(carve, (-1.3 + (r.prof ? r.prof(ri.along) : 0)) * k); inside = Math.max(inside, k);
    berm = Math.max(berm, 1.1 * Math.exp(-(((ri.d - RUN_W - 1.3) / 1.3) ** 2)));
    if (ri.d < RUN_W + 1 && !profiling) for (const [id, s, bh] of BUMPS) if (id === r.id) bump = Math.max(bump, bh * Math.exp(-(((ri.along - s) / 2.6) ** 2)) * (1 - smooth(RUN_W - 1, RUN_W + 1, ri.d)));
  }
  h += carve + berm * (1 - inside) + bump;
  // la rivière gelée : un lit plat, un peu plus bas que les berges
  const rv = riverInfo(x, z);
  if (rv.d < RIVER_W + 5) { const k = 1 - smooth(RIVER_W, RIVER_W + 3.5, rv.d); h = h * (1 - k) + (riverY(rv.along)) * k; }
  // le lac gelé : plat (la glace), avec son îlot au milieu
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 4) {
    const k = smooth(LAKE.r + 3, LAKE.r - 0.5, dl);
    h = h * (1 - k) + LAKE.y * k;
    if (dl < LAKE.islet + 1.5) h = Math.max(h, LAKE.y + (LAKE.isletY - LAKE.y) * smooth(LAKE.islet + 1.2, LAKE.islet - 0.6, dl));
  }
  // la corniche de la cascade (bords à pic)
  const L = LEDGE;
  if (x < L.x1 + 1 && z > L.z0 - 1 && z < L.z1 + 1) {
    const k = smooth(L.x1 + 0.6, L.x1 - 0.9, x) * smooth(L.x0 - 0.9, L.x0 + 0.6, x) * smooth(L.z0 - 0.75, L.z0 + 0.75, z) * smooth(L.z1 + 0.75, L.z1 - 0.75, z);
    if (k > 0) h = Math.max(h, h * (1 - k) + L.top * k);
  }
  return h;
}
/** Hauteur de la glace de la rivière (elle descend doucement vers le lac). */
export function riverY(along) { return BASE_Y - 0.9 - 0.6 * along / RIVER.total; }
export function inWater() { return false; }

/** Sur la glace (on glisse) ? lac, rivière, patinoire, mare de la cascade. */
export const FALLS_POOL = { x: -159.6, z: -54, r: 3.4 };
export function iceAt(x, z, y) {
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r - 0.4 && dl > LAKE.islet + 0.3) return y === undefined || y < LAKE.y + 0.5;
  const rk = ((x - RINK.x) / RINK.rx) ** 2 + ((z - RINK.z) / RINK.rz) ** 2;
  if (rk < 1) return y === undefined || y < RINK.y + 0.5;
  const rv = riverInfo(x, z);
  if (rv.d < RIVER_W - 0.3) return y === undefined || y < riverY(rv.along) + 0.5;
  if (Math.hypot(x - FALLS_POOL.x, z - FALLS_POOL.z) < FALLS_POOL.r) return y === undefined || y < BASE_Y + 0.5;
  return false;
}

// Les pistes descendent toujours d'au moins 5 % : dans la plaine, on creuse un peu plus la gouttière
// (sinon la luge s'arrête bien avant l'arrivée)
let profiling = true;
{
  const MIN_SLOPE = 0.05, DS = 2;
  const bases = RUNS.map((r) => { const n = Math.ceil(r.total / DS), b = []; for (let i = 0; i <= n; i++) { const p = r.at(Math.min(r.total, i * DS)); b.push(heightAt(p.x, p.z)); } return b; });
  RUNS.forEach((r, j) => {
    const b = bases[j], extra = [0];
    let prof = b[0];
    for (let i = 1; i < b.length; i++) {
      const p = r.at(Math.min(r.total, i * DS));
      // dans le creux de l'arrivée, on ne creuse plus
      if (Math.hypot(p.x - FINISH.x, p.z - FINISH.z) < 24) { extra.push(extra[i - 1]); prof = b[i] + extra[i - 1]; continue; }
      prof = Math.min(b[i], prof - MIN_SLOPE * DS); extra.push(prof - b[i]);
    }
    r.prof = (s) => { const f = clamp(s / DS, 0, extra.length - 1), i = Math.min(extra.length - 2, Math.floor(f)), t = f - i; return extra[i] * (1 - t) + extra[i + 1] * t; };
  });
}
profiling = false;

// ---------------------------------------------------------------------------
// Obstacles (avec une grille pour les retrouver vite : le monde est grand)
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Village : chalets (w, d : taille au sol ; door : côté de la porte, vers la place)
export const CHALETS = [
  { x: -20, z: 140, w: 7, d: 6, h: 3.4, door: 1, col: 0xb06a3a, roof: 0x8a3a2a },
  { x: -20, z: 158, w: 7, d: 6, h: 3.4, door: 1, col: 0xc08050, roof: 0x5a6a8a },
  { x: 20, z: 140, w: 7, d: 6, h: 3.4, door: -1, col: 0xa8643a, roof: 0x3a6a4a },
  { x: 20, z: 158, w: 7.5, d: 6.5, h: 3.6, door: -1, col: 0xd08a5a, roof: 0xc0303a, choco: true },   // le chalet-chocolat de Myrtille
  { x: -8, z: 128, w: 6, d: 5.5, h: 3.2, door: 0, col: 0xb87848, roof: 0x8a3a2a },
  { x: 9, z: 127, w: 6, d: 5.5, h: 3.2, door: 0, col: 0xa06038, roof: 0x5a6a8a },
  { x: -24, z: 176, w: 6, d: 5.5, h: 3.2, door: 1, col: 0xb07040, roof: 0x3a6a4a },
  { x: 24, z: 176, w: 6, d: 5.5, h: 3.2, door: -1, col: 0xc07a4a, roof: 0x8a3a2a },
];
for (const c of CHALETS) { c.y = VILLAGE_Y; c.col_ = box(c.x, c.z, c.w, c.d, c.y - 1, c.y + c.h, { kind: 'rock', solid: true, map: '#a07050' }); }
// le grand sapin décoré de la place
export const BIG_TREE = { x: 0, z: 146, r: 1.1, h: 9 };
cyl(BIG_TREE.x, BIG_TREE.z, BIG_TREE.r, VILLAGE_Y - 1, VILLAGE_Y + 2.2, { kind: 'trunk' });
export const LAMPS = [[-5, 156], [5, 156], [-5, 136], [5, 136], [-9, 168], [11, 166], [-34, 140], [34, 132], [0, 110], [20, 60], [-30, 150], [-30, 160]].map(([x, z]) => ({ x, z, y: 0 }));
for (const l of LAMPS) { l.y = heightAt(l.x, l.z); cyl(l.x, l.z, 0.18, l.y - 1, l.y + 3, { kind: 'rock' }); }

// Patinoire : des plots pour la course contre Pingo (dans l'ordre, deux tours)
export const RINK_CONES = [];
for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 2; RINK_CONES.push({ i, x: RINK.x + Math.cos(a) * (RINK.rx - 5), z: RINK.z + Math.sin(a) * (RINK.rz - 3.6) }); }
export const RINK_LAPS = 2;
// bancs de neige autour de la patinoire (décor bas, on les enjambe)
export const RINK_PODIUM = { x: RINK.x, z: RINK.z - RINK.rz - 3.5, h: 1.2 };
RINK_PODIUM.y = heightAt(RINK_PODIUM.x, RINK_PODIUM.z);
box(RINK_PODIUM.x, RINK_PODIUM.z, 2.4, 1.8, RINK_PODIUM.y - 1, RINK_PODIUM.y + RINK_PODIUM.h, { kind: 'rock' });

// Jardin des bonshommes de neige : un socle, et 3 boules à rouler (elles grossissent en roulant)
export const SNOWBALLS = [{ id: 's1', x: 52, z: 99 }, { id: 's2', x: 30, z: 108 }, { id: 's3', x: 74, z: 146 }];
export const SNOWMAN_SIZES = [1.25, 0.95, 0.7];       // rayon final du bas, du milieu, de la tête

// Télésiège : gare du bas (dans la plaine) → gare du haut (au sommet)
export const LIFT = { base: { x: 22, z: 30 }, top: { x: 6, z: -116 } };
LIFT.base.y = heightAt(LIFT.base.x, LIFT.base.z); LIFT.top.y = heightAt(LIFT.top.x, LIFT.top.z);
export const STATION = { x: LIFT.base.x + 5.5, z: LIFT.base.z + 2, w: 4, d: 4.5, h: 3.4 };
STATION.y = heightAt(STATION.x, STATION.z);
box(STATION.x, STATION.z, STATION.w, STATION.d, STATION.y - 1, STATION.y + STATION.h, { kind: 'rock', solid: true, map: '#9a7a5a' });
export const WOODPILE = { x: STATION.x - 3.1, z: STATION.z + 1.4, w: 1.8, d: 1.4, h: 1.7 };
WOODPILE.y = heightAt(WOODPILE.x, WOODPILE.z);
box(WOODPILE.x, WOODPILE.z, WOODPILE.w, WOODPILE.d, WOODPILE.y - 1, WOODPILE.y + WOODPILE.h, { kind: 'rock', solid: true });
export const TOP_DECK = { x: LIFT.top.x + 2, z: LIFT.top.z - 3 };
export const LIFT_PTS = [];
export const PYLONS = [];
{
  const B = LIFT.base, T = LIFT.top, len = Math.hypot(T.x - B.x, T.z - B.z), n = Math.round(len / 12);
  const groundMax = (k0, k1) => { let m = -1e9; for (let j = 0; j <= 8; j++) { const k = k0 + (k1 - k0) * j / 8; m = Math.max(m, heightAt(B.x + (T.x - B.x) * k, B.z + (T.z - B.z) * k)); } return m; };
  LIFT_PTS.push({ x: B.x, z: B.z, y: B.y + 4.6 });
  // (jamais au milieu d'une piste : on décale le pylône le long du câble)
  const ks = [];
  for (let i = 1; i < n; i++) {
    let k = i / n;
    for (const dk of [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06, 0.08, -0.08, 0.1, -0.1]) { const kk = i / n + dk; if (kk > 0.03 && kk < 0.97 && runInfo(B.x + (T.x - B.x) * kk, B.z + (T.z - B.z) * kk).d > RUN_W + 3.5) { k = kk; break; } }
    ks.push(k);
  }
  ks.sort((p, q) => p - q);
  for (const k of ks) {
    const x = B.x + (T.x - B.x) * k, z = B.z + (T.z - B.z) * k;
    const top = groundMax(Math.max(0, k - 0.7 / n), Math.min(1, k + 0.7 / n)) + 7.5;
    PYLONS.push({ x, z, y: heightAt(x, z), top });
    LIFT_PTS.push({ x, z, y: top });
  }
  LIFT_PTS.push({ x: T.x, z: T.z, y: T.y + 4.6 });
  // (les pylônes plantés dans une piste sont décalés sur le côté)
  for (const p of PYLONS) cyl(p.x, p.z, 0.35, p.y - 1, p.top, { kind: 'rock', pylon: true });
  let s = 0;
  LIFT_PTS.forEach((p, i) => { if (i) s += Math.hypot(p.x - LIFT_PTS[i - 1].x, p.y - LIFT_PTS[i - 1].y, p.z - LIFT_PTS[i - 1].z); p.s = s; });
}
export const LIFT_LEN = LIFT_PTS[LIFT_PTS.length - 1].s;
export const LIFT_SPEED = 8;
export const SEAT_DROP = 2.1;
export function liftAt(s) {
  s = clamp(s, 0, LIFT_LEN);
  let i = 1;
  while (i < LIFT_PTS.length - 1 && LIFT_PTS[i].s < s) i++;
  const a = LIFT_PTS[i - 1], b = LIFT_PTS[i], k = (s - a.s) / ((b.s - a.s) || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z };
}

// Sommet : le poste de secours de Bernard, le râtelier à luges
export const HUT = { x: 14, z: -136, w: 5, d: 4.5, h: 3.2 };
HUT.y = heightAt(HUT.x, HUT.z);
box(HUT.x, HUT.z, HUT.w, HUT.d, HUT.y - 1.5, HUT.y + HUT.h, { kind: 'rock', solid: true, map: '#c04a3a' });
{ const p = RUN.at(SLED_START.s); SLED_START.x = p.x; SLED_START.z = p.z; SLED_START.yaw = Math.atan2(p.dx, p.dz); }
export const SLED_RACK = { x: SLED_START.x - 4, z: SLED_START.z - 3 };
SLED_RACK.y = heightAt(SLED_RACK.x, SLED_RACK.z);

// Portes de la Grande Glissade (une paire de fanions tous les ~30 m, sur chaque piste)
export const GATES = [];
for (const r of RUNS) {
  const step = r.id === 'main' ? 30 : 22;
  for (let s = r.id === 'main' ? 24 : 12; s < r.total - 10; s += step) {
    const p = r.at(s);
    GATES.push({ id: GATES.length, line: r.id, s, x: p.x, z: p.z, dx: p.dx, dz: p.dz, half: RUN_W + 1.2 });
  }
}
// le tunnel de neige : un morceau de la piste principale, dans la plaine
{
  // (loin des embranchements : ses murs ne doivent pas barrer une autre piste)
  const clear = (s0) => {
    for (let s = s0; s <= s0 + TUNNEL.len; s += 2) {
      const p = RUN.at(s), nx = p.dz, nz = -p.dx;
      for (const sd of [-1, 1]) for (const r of RUNS) { if (r === RUN) continue; const i = r.info(p.x + nx * sd * (RUN_W + 1.6), p.z + nz * sd * (RUN_W + 1.6)); if (i && i.d < RUN_W + 3) return false; }
    }
    return true;
  };
  let s0 = RUN.total - 72;
  for (const ds of [0, -8, 8, -16, 16, -24, -32, -40, -48, -56]) if (clear(RUN.total - 72 + ds)) { s0 = RUN.total - 72 + ds; break; }
  TUNNEL.s0 = s0; TUNNEL.s1 = s0 + TUNNEL.len;
  // ses murs (on ne passe pas au travers)
  for (let s = s0; s <= TUNNEL.s1 + 0.01; s += 2) {
    const p = RUN.at(s), nx = p.dz, nz = -p.dx;
    for (const sd of [-1, 1]) { const x = p.x + nx * sd * (RUN_W + 1.6), z = p.z + nz * sd * (RUN_W + 1.6), g = heightAt(x, z); cyl(x, z, 0.8, g - 1, g + 4.2, { kind: 'rock', tunnel: true }); }
  }
}

// Cascade Gelée : blocs de glace pour monter sur la corniche
export const ICE_STEPS = [
  { x: -155, z: -24 },
  { x: -157.6, z: -28 },
  { x: -160.6, z: -31.5 },
  { x: -158.6, z: -35.6 },
  { x: -161.4, z: -39.2 },
  { x: -159.4, z: -43.2 },
  { x: -163.4, z: -46.4 },
].map((s, i) => Object.assign(s, { r: 1.55, top: BASE_Y + 1.6 + i * 1.75 }));
for (const s of ICE_STEPS) s.col = cyl(s.x, s.z, s.r, heightAt(s.x, s.z) - 1, s.top, { kind: 'rock', ice: true });
export const ICEFALL = { x: LEDGE.x1 - 0.2, z: -54, w: 7 };

// Crevasse de Cristal : un couloir en zigzag entre de hauts murs de glace
export const CREVASSE_WALLS = [];
{
  const C = CREVASSE, W = (x, z, w, d) => { const c = box(C.x + x, C.z + z, w, d, C.y - 1, C.y + 5.5, { kind: 'rock', solid: true, map: '#a8d8f0', ice: true }); CREVASSE_WALLS.push(c); };
  // l'entrée est au sud (z = +14) ; on serpente jusqu'au fond, au nord
  W(-5, 6, 1.2, 18); W(5, 9, 1.2, 12);              // le premier couloir
  W(0, -3, 11.2, 1.2); W(10.4, 3, 11, 1.2);          // virage à droite
  W(15.4, -5, 1.2, 17); W(5.6, -9, 1.2, 12);         // deuxième couloir
  W(0, -14.6, 12, 1.2); W(10.5, -14, 1.2, 1.2);
  W(-6, -9, 1.2, 12.4); W(-0.4, -20.4, 10, 1.2); W(16, -17.5, 1.2, 7); W(10, -20.4, 10, 1.2);
  W(-5.5, -15.4, 1.2, 1.2);
}
export const CREVASSE_END = { x: CREVASSE.x + 8, z: CREVASSE.z - 17.5 };

// Fort Moustache : un cercle de blocs de neige, ouvert au sud — avec une porte de neige
export const fortBlocks = [];
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2;
  if (Math.abs(a - Math.PI / 2) < 0.36) continue;   // l'entrée (vers +z)
  const x = FORT.x + Math.cos(a) * FORT.r, z = FORT.z + Math.sin(a) * FORT.r, h = 2.6 + (i % 3) * 0.3;
  fortBlocks.push({ x, z, y: FORT.y, h, a });
  cyl(x, z, 1.5, FORT.y - 1, FORT.y + h, { kind: 'rock' });
}
export const FORT_TOWERS = [-1, 1].map(s => ({ x: FORT.x + s * 4.4, z: FORT.z + FORT.r + 0.6, r: 1.5, h: 3.6 }));
for (const t of FORT_TOWERS) cyl(t.x, t.z, t.r, FORT.y - 1, FORT.y + t.h, { kind: 'rock' });
export const FORT_GATE = box(FORT.x, FORT.z + FORT.r + 0.6, 3.4, 1.2, FORT.y - 1, FORT.y + 4.2, { kind: 'gate', solid: true });

// Igloos du village des pingouins
export const IGLOOS = [[146, 84, 3.2], [158, 92, 2.8], [140, 96, 2.6]].map(([x, z, r]) => ({ x, z, r }));
for (const g of IGLOOS) { g.y = heightAt(g.x, g.z); g.top = g.y + g.r * 0.85; cyl(g.x, g.z, g.r * 0.92, g.y - 1, g.top, { kind: 'rock' }); }
// ponts de bois sur la rivière gelée (on passe dessus, ou dessous en glissant)
export const BRIDGES = [];
for (const s of [RIVER.total * 0.52, RIVER.total * 0.8, RIVER.total * 0.2]) {
  const p = RIVER.at(s), yaw = Math.atan2(p.dx, p.dz), sx = Math.cos(yaw), sz = -Math.sin(yaw), half = RIVER_W + 4.5;
  const y = Math.max(heightAt(p.x + sx * half, p.z + sz * half), heightAt(p.x - sx * half, p.z - sz * half)) + 0.3;
  BRIDGES.push({ x: p.x, z: p.z, yaw, y, len: half * 2 });
}
for (const b of BRIDGES) {
  // le tablier est une suite de petites cases (les obstacles sont alignés sur les axes)
  const sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw);
  for (let k = -b.len / 2 + 1; k <= b.len / 2 - 1; k += 1.5) colliders.push({ type: 'cyl', x: b.x + sx * k, z: b.z + sz * k, r: 1.6, y0: b.y - 0.35, y1: b.y, kind: 'bridge' });
}

// Tanière du renard (dans la forêt de l'ouest)
export const DEN = { x: SPOTS.den.x, z: SPOTS.den.z };
DEN.y = heightAt(DEN.x, DEN.z);
cyl(DEN.x - 3, DEN.z - 2.5, 2.2, DEN.y - 1, DEN.y + 1.8, { kind: 'rock' });      // le gros rocher de la tanière

// ---------------------------------------------------------------------------
// Grille spatiale et support
// ---------------------------------------------------------------------------
const CELL = 16, OFF = 32;
let grid = new Map();
const key = (i, j) => (i + OFF) * 128 + (j + OFF);
function bbox(c) { return c.type === 'box' ? [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r]; }
function indexAll() {
  grid = new Map();
  for (const c of colliders) {
    const [x0, x1, z0, z1] = bbox(c);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    }
  }
}
let stamp = 1;
/** Obstacles proches de (x, z) dans un rayon r. */
export function near(x, z, r) {
  r = r || 0;
  const out = [], s = ++stamp;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
    const list = grid.get(key(i, j));
    if (list) for (const c of list) if (c._s !== s) { c._s = s; out.push(c); }
  }
  return out;
}
export function colliderTop(c) { return c.off ? -Infinity : c.y1; }
export function inside(c, x, z, margin) {
  margin = margin || 0;
  if (c.type === 'box') return Math.abs(x - c.x) <= c.w / 2 + margin && Math.abs(z - c.z) <= c.d / 2 + margin;
  return (x - c.x) ** 2 + (z - c.z) ** 2 <= (c.r + margin) ** 2;
}
export function supportAt(x, z, yFeet, t, step) {
  step = step === undefined ? 0.6 : step;
  let best = heightAt(x, z), col = null;
  for (const c of near(x, z, 0.3)) {
    const top = colliderTop(c, t);
    if (top > best && top <= yFeet + step && inside(c, x, z, 0.25)) { best = top; col = c; }
  }
  return { y: best, collider: col };
}
/** Un chat ne traverse pas les murs (chalets, crevasse, fort). */
export function blockedAt(x, z) {
  for (const c of near(x, z, 0.5)) if ((c.solid || c.kind === 'rock') && !c.off && inside(c, x, z, 0.4)) return true;
  return false;
}
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of near(x, z, 0.3)) if (!c.off && c.kind !== 'tree' && c.kind !== 'trunk' && c.kind !== 'gate' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return best;
}
indexAll();

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const lineTo = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const ring = (cx, cz, r, n, a0, lift, rz) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (a0 || 0); at(cx + Math.cos(a) * r, cz + Math.sin(a) * (rz || r), lift); } };
// village (autour du grand sapin, derrière les chalets)
ring(BIG_TREE.x, BIG_TREE.z, 4.4, 6, 0.2);
at(-26, 132); at(26, 132); at(-28, 166); at(30, 168); at(0, 180);
// patinoire (sur la glace)
ring(RINK.x, RINK.z, RINK.rx - 3, 6, 0.4, 1.1, RINK.rz - 2);
// jardin des bonshommes
ring(GARDEN.x, GARDEN.z, 6, 4, 0.3);
// sur la rivière gelée (on les attrape en glissant)
for (let k = 0.06; k < 0.98; k += 0.09) { const p = RIVER.at(k * RIVER.total); at(p.x, p.z, 1.0); }
// lac et îlot
ring(LAKE.x, LAKE.z, 14, 8, 0.1);
at(LAKE.x + 1.8, LAKE.z - 1.2); at(LAKE.x - 1.6, LAKE.z + 1.4);
// village des pingouins (et sur les igloos)
at(IGLOOS[0].x, IGLOOS[0].z, 0.9); at(IGLOOS[1].x, IGLOOS[1].z, 0.9); at(152, 78); at(166, 100);
// la Grande Glissade (on les attrape en luge !)
for (let k = 0.05; k < 0.97; k += 0.07) { const p = RUN.at(k * RUN.total); at(p.x, p.z, 1.0); }
for (const r of RUNS.slice(1)) for (let k = 0.25; k < 0.9; k += 0.3) { const p = r.at(k * r.total); at(p.x, p.z, 1.0); }
// le sommet
ring(SPOTS.mountain.x, SPOTS.mountain.z, 7, 5, 0.6);
// la forêt de l'ouest et la tanière du renard
lineTo(-70, 120, -96, 74, 4); lineTo(-120, 40, -120, 6, 3);
at(DEN.x + 3, DEN.z + 3); at(DEN.x - 3, DEN.z - 2.5, 3.0); at(DEN.x + 6, DEN.z - 4);
// la Cascade Gelée : sur chaque bloc, puis sur la corniche, et derrière la mare
for (const s of ICE_STEPS) at(s.x, s.z);
lineTo(-172, -30, -172, -56, 3);
at(FALLS_POOL.x - 1, FALLS_POOL.z + 1.5);
// la Crevasse de Cristal (tout au fond du couloir)
at(CREVASSE.x, CREVASSE.z + 10); at(CREVASSE.x + 10, CREVASSE.z + 2); at(CREVASSE.x + 10, CREVASSE.z - 8); at(CREVASSE.x + 2, CREVASSE.z - 9); at(CREVASSE.x + 2, CREVASSE.z - 17.5);
// le fort
ring(FORT.x, FORT.z, 6, 4, 0.3);
// coins cachés : les collines boisées, le haut de la gare du télésiège, les congères
at(STATION.x - 0.8, STATION.z - 0.8); at(WOODPILE.x, WOODPILE.z);
for (const [cx, cz] of HILLS) at(cx, cz);
for (const d of DRIFTS.slice(0, 6)) at(d[0], d[1]);
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'f' + i, x: p.x, y: p.y, z: p.z }));
export const BONES_FOUND = pts.length;
export const balls = [];

// Bonnets à pompon de l'école de ski (mission de Bernard) — le renard et Pingo en gardent un
export const BONNETS = [
  { id: 'b1', x: -176, z: -44, col: 0xe8403a, where: 'en haut de la Cascade Gelée' },
  { id: 'b2', x: CREVASSE_END.x, z: CREVASSE_END.z, col: 0x3a8ae8, where: 'au fond de la Crevasse de Cristal' },
  { id: 'b3', x: STATION.x, z: STATION.z, col: 0xf0c020, where: 'sur le toit de la gare du télésiège' },
  { id: 'b4', x: DEN.x, z: DEN.z, col: 0x40c060, where: 'chez le renard, dans la forêt de l\'ouest', fox: true },
  { id: 'b5', x: RINK_PODIUM.x, z: RINK_PODIUM.z, col: 0xc060e0, where: 'à la patinoire : il faut battre Pingo à la course', race: true },
].map(b => Object.assign(b, { y: groundY(b.x, b.z) }));

// Médailles des Neiges (toutes cachées au départ : il faut jouer pour les faire apparaître)
export const medals = [
  { id: 'm_bonnets', x: 4, z: -127, y: SUMMIT_Y + 1.5, label: 'Les bonnets de l\'école de ski', visible: false },
  { id: 'm_sled', x: FINISH.x + 3, z: FINISH.z + 5, label: 'La Grande Glissade', visible: false },
  { id: 'm_penguins', x: 152, z: 86, label: 'Le bébé pingouin', visible: false },
  { id: 'm_snowman', x: GARDEN.x + 3.5, z: GARDEN.z, label: 'Le bonhomme de neige', visible: false },
  { id: 'm_fort', x: FORT.x, z: FORT.z - 2, label: 'La bataille de boules de neige', visible: false },
].map(m => Object.assign(m, { y: m.y || groundY(m.x, m.z) + 1.5 }));

export const crates = [
  { id: 'c1', x: 14, z: 112, content: 'heart' },
  { id: 'c2', x: -40, z: 100, content: 'heart' },
  { id: 'c3', x: 168, z: -88, content: 'heart' },
  { id: 'c4', x: -150, z: -10, content: 'heart' },
  { id: 'c5', x: 110, z: 60, content: 'none' },
  { id: 'c6', x: -128, z: -100, content: 'heart' },
  { id: 'c7', x: 30, z: -138, content: 'heart' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Chats farceurs : 4 patineurs autour du bébé pingouin, d'autres qui se promènent (et lancent des boules de neige)
export const cats = [
  { id: 'cat1', x: LAKE.x - 9, z: LAKE.z - 5, group: 'clearing' },
  { id: 'cat2', x: LAKE.x + 8, z: LAKE.z + 6, group: 'clearing' },
  { id: 'cat3', x: LAKE.x - 3, z: LAKE.z + 10, group: 'clearing' },
  { id: 'cat4', x: LAKE.x + 9, z: LAKE.z - 7, group: 'clearing' },
  { id: 'cat5', x: 40, z: 96, group: 'roam' },
  { id: 'cat6', x: -70, z: 120, group: 'roam' },
  { id: 'cat7', x: 100, z: -10, group: 'roam' },
  { id: 'cat8', x: -130, z: 0, group: 'roam' },
  { id: 'cat9', x: FORT.x + 18, z: FORT.z + 4, group: 'roam' },
  { id: 'cat10', x: FORT.x - 16, z: FORT.z + 18, group: 'roam' },
  { id: 'cat11', x: -90, z: -40, group: 'roam' },
  { id: 'cat12', x: 80, z: -100, group: 'roam' },
  { id: 'cat13', x: 120, z: 120, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: groundY(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.mamie.x + 1.6, z: SPOTS.mamie.z + 1.2, y: groundY(SPOTS.mamie.x + 1.6, SPOTS.mamie.z + 1.2) },
};
/** Les habitants de la station. */
export const FOLKS = {
  bernard: { x: -4, z: -124, yaw: Math.PI * 0.85, name: 'Bernard' },
  myrtille: { x: 15, z: 158, yaw: -Math.PI / 2, name: 'Myrtille' },
  pingo: { x: RINK.x + 4, z: RINK.z - RINK.rz - 3, yaw: 0, name: 'Pingo' },
  maman: { x: 152, z: 90, yaw: Math.PI, name: 'Maman Pingouin' },
};
for (const k in FOLKS) FOLKS[k].y = groundY(FOLKS[k].x, FOLKS[k].z);
export const BABY = { x: LAKE.x, z: LAKE.z, y: LAKE.isletY };

// Panneaux
export const signs = [
  { x: 4, z: 166, text: ['Station des Neiges', '↑ Télésiège et Montagne · ← Patinoire · → Jardin des bonshommes', '↗ Lac Gelé et pingouins · ↖ Forêt, Cascade et Crevasse'] },
  { x: -36, z: 142, text: ['La Patinoire', 'Pingo le pingouin adore faire la course !', 'Passez tous les plots, deux tours.'] },
  { x: 44, z: 136, text: ['Jardin des bonshommes', 'Poussez les grosses boules de neige jusqu\'ici :', 'elles grossissent en roulant !'] },
  { x: 106, z: 30, text: ['Le Lac Gelé', 'Attention, ça glisse !', 'Courez, puis lâchez tout : on patine…'] },
  { x: LIFT.base.x + 4, z: LIFT.base.z + 6, text: ['Télésiège de la Montagne', 'Montez dans un siège :', 'il vous emmène tout en haut !'] },
  { x: SLED_START.x - 7, z: SLED_START.z + 2, text: ['La Grande Glissade', 'Prenez une luge et descendez jusqu\'en bas !', 'Gauche, droite : on tourne. En arrière : on freine.'] },
  { x: -146, z: -16, text: ['La Cascade Gelée', 'Sautez de bloc en bloc', 'jusqu\'en haut de la cascade !'] },
  { x: CREVASSE.x - 4, z: CREVASSE.z + 18, text: ['La Crevasse de Cristal', 'Un couloir de glace qui serpente…', 'Qui sait ce qu\'on trouve au fond ?'] },
  { x: FORT.x + 6, z: FORT.z + FORT.r + 6, text: ['Fort Moustache', `Il faut ${FORT_MEDALS} Médailles des Neiges pour entrer !`, 'Ensuite : bataille de boules de neige ! — La Capitaine'] },
  { x: 128, z: 78, text: ['Village des Pingouins', 'Chut… un bébé pingouin s\'est perdu', 'sur le lac gelé !'] },
  { x: -100, z: -50, text: ['Forêt des Sapins', 'Un renard malin vit par ici.', 'Il n\'aime pas les gros « Ouaf ! »'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: groundY(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Drapeaux : on y repart après une chute de cœurs (en mode Défi)
export const CHECKPOINTS = [
  { id: 0, x: 6, z: 162, name: 'Village des Chalets' },
  { id: 1, x: -40, z: 134, name: 'Patinoire' },
  { id: 2, x: LIFT.base.x - 5, z: LIFT.base.z + 5, name: 'Télésiège' },
  { id: 3, x: -14, z: -132, name: 'Sommet' },
  { id: 4, x: 108, z: 24, name: 'Lac Gelé' },
  { id: 5, x: 140, z: 76, name: 'Village des Pingouins' },
  { id: 6, x: -146, z: -26, name: 'Cascade Gelée' },
  { id: 7, x: CREVASSE.x - 8, z: CREVASSE.z + 20, name: 'Crevasse de Cristal' },
  { id: 8, x: FORT.x - 6, z: FORT.z + FORT.r + 12, name: 'Fort Moustache' },
  { id: 9, x: -104, z: -56, name: 'Forêt du renard' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Chemins de neige tassée (dessinés sur le sol par snow.js)
export const PATHS = [];
export const SNOW_PATHS = [[[0, 168], [0, 120]], [[0, 120], [18, 40]], [[-6, 140], [-36, 150]], [[8, 136], [44, 130]], [[10, 118], [100, 40]], [[100, 40], [140, 76]],
  [[-10, 118], [-80, 100]], [[-80, 100], [-120, 30]], [[-120, 30], [-104, -56]], [[-120, 30], [-146, -18]], [[-146, -26], [-140, -96]], [[100, 40], [130, -20]], [[130, -20], [150, -92]],
  [[30, 30], [60, -40]], [[60, -40], [20, -110]]];
export const CRYSTALS = [];
export const ruins = [];

// Portail de retour vers le Parc, au village
export const PORTALS = [{ x: 9, z: 176, to: 1 }];

// Sapins : forêts sur les collines, le long des flancs de la montagne, et des bosquets partout
export const trees = [];
{
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const segDist = (x, z, [[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  };
  const keep = [[SPOTS.village, 38], [SPOTS.rink, 22], [SPOTS.garden, 32], [LAKE, LAKE.r + 4], [SPOTS.fort, 22], [SPOTS.mountain, 20], [SPOTS.falls, 16], [SPOTS.igloos, 16],
    [SPOTS.crevasse, 26], [SPOTS.den, 9], [FINISH, 14], [SPOTS.liftBase, 12]];
  const liftLine = [[LIFT.base.x, LIFT.base.z], [LIFT.top.x, LIFT.top.z]];
  // densité : forêts (beaucoup) et plaine (peu)
  const forest = (x, z) => Math.max(...HILLS.map(([cx, cz, r]) => 1 - smooth(r * 0.8, r * 2.2, Math.hypot(x - cx, z - cz))), smooth(60, 30, Math.abs(Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) - 90)) * 0.7);
  let guard = 0;
  while (trees.length < 520 && guard++ < 60000) {
    const x = (rnd() - 0.5) * 380, z = (rnd() - 0.5) * 380;
    if (Math.pow(x ** 4 + z ** 4, 0.25) > 182) continue;
    if (rnd() > 0.12 + forest(x, z) * 0.9) continue;
    const h = heightAt(x, z);
    if (keep.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
    if (runInfo(x, z).d < RUN_W + 4) continue;
    if (riverInfo(x, z).d < RIVER_W + 3) continue;
    if (segDist(x, z, liftLine) < 6) continue;
    if (SNOW_PATHS.some(p => segDist(x, z, p) < 3.4)) continue;
    if (x < LEDGE.x1 + 8 && z > LEDGE.z0 - 8 && z < LEDGE.z1 + 10) continue;
    if (near(x, z, 3).some(c => inside(c, x, z, 2.5))) continue;
    if (trees.some(t => Math.abs(t.x - x) < 4.4 && Math.abs(t.z - z) < 4.4 && Math.hypot(t.x - x, t.z - z) < 4.4)) continue;
    if (signs.some(s => Math.hypot(s.x - x, s.z - z) < 3) || crates.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (cats.some(c => Math.hypot(c.x - x, c.z - z) < 3) || CHECKPOINTS.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    if (bones.some(b => Math.hypot(b.x - x, b.z - z) < 1.6) || SNOWBALLS.some(b => segDist(x, z, [[b.x, b.z], [GARDEN.x, GARDEN.z]]) < 5)) continue;
    let cliff = false;
    for (let a = 0; a < 6.28; a += 0.785) if (Math.abs(heightAt(x + Math.cos(a) * 2, z + Math.sin(a) * 2) - h) > 1.6) cliff = true;
    if (cliff) continue;
    const s = 0.8 + rnd() * 0.6;
    trees.push({ x, z, y: h, s, h: 7 * s });
  }
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree', camR: 1.7 * t.s });
  indexAll();
}

/** Mini-carte : neige, glace, rochers. */
export function mapColor(x, z) {
  const h = heightAt(x, z);
  if (iceAt(x, z)) return [168, 214, 240];
  if (runInfo(x, z).d < 3 && h > 1) return [196, 214, 236];
  if (h > 64) return [176, 184, 200];
  const k = clamp(h / 60, 0, 1);
  return [Math.round(240 - 34 * k), Math.round(244 - 28 * k), Math.round(250 - 14 * k)];
}
