/*
 * Matcha & Ainu — Niveau 4 : « Les Îles du Ciel ».
 * Un parcours de plates-formes à faire seul ou à plusieurs, au-dessus de la mer.
 * Données pures (aucune dépendance) : utilisé par le jeu et par les tests (Node).
 *
 * Parcours (le nord est vers -z) :
 *   Île du Départ (Mamie) → 1. les Pas Nuageux → île des Ballons (drapeau)
 *   → 2. le Courant d'Air (plates-formes qui bougent, colonne de vent) → île du Moulin (drapeau)
 *      (à l'ouest du Moulin, un nuage-bac mène au Jardin Suspendu)
 *   → 3. le Pont des Copains (deux dalles à presser ensemble, ou nuages fragiles)
 *   → île de l'Écho (drapeau) → 4. la Tour du Vent (manège de nuages, spirale)
 *   → Île du Carillon : Nimbus, le gardien des cloches. Le pont arc-en-ciel vers
 *     l'Île du Trophée dort tant que les trois cloches du ciel n'ont pas sonné :
 *       ouest      : les Nuages-Trampolines → Cloche Rose
 *       est        : le Col des Rafales (le vent pousse, on s'abrite) → Cloche Bleue
 *       nord-ouest : le Tourniquet, la Grande Roue, le Canon à Nuages → Cloche d'Or
 *     Chaque cloche dessine un chemin d'arc-en-ciel (ou un canon) pour revenir au Carillon.
 *   → le pont arc-en-ciel → Île du Trophée (la Capitaine, puis le Trophée).
 * 5 Étoiles du ciel et 6 Plumes arc-en-ciel sont cachées en chemin.
 */

export const ID = 4;
export const NAME = 'Les Îles du Ciel';
export const SAVE_KEY = 'dogfight.aventure.niveau4';
export const CAT_PLACE = 'sur les îles';
export const COLLECT_NAME = 'pièces du ciel';
export const MEDAL_TITLE = 'ÉTOILE DU CIEL !';
export const FINAL_MEDAL = 'm_goal';
export const WATER_Y = -46;           // la mer, tout en bas
export const KILL_Y = 1;              // en dessous : on est tombé des îles
export const NO_TERRAIN = true;       // le sol, ce sont les îles (construites par sky.js)
export const WORLD = 360;
export const RADAR = 70;
export const GRASS_K = 0.75;

// Ambiance : ciel du matin, rose et doré
export const SKY = { top: 0x3f86e8, horizon: 0xffd6c8, bottom: 0xffe8d8, sunDir: [-0.35, 0.5, 0.62] };
export const LIGHT = { hemi: [0xf0f4ff, 0x9a8a9a, 0.95], sun: [0xffecd0, 2.5], fog: [120, 330] };
export const GRADE = { bloom: 0.7, saturation: 1.08, highTint: [0.03, 0.012, 0.0], shadowTint: [0.0, 0.006, 0.03] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.1, big: 1.8, small: 1.3, bushes: 1 };
export const PALETTE = {
  ground: [0x62c24a, 0x8ad85a, 0x48a840],
  leaves: [0x6ac850, 0x8ad860, 0xf0a0c8, 0x58b848, 0xffc0d8, 0x7ad058, 0xf8d070, 0x60c050],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------
// Îles (le sol où l'on marche) : disques un peu bombés
// ---------------------------------------------------------------------------
export const ISLANDS = [
  { id: 'start', x: 0, z: 96, r: 14, top: 10, name: 'Île du Départ' },
  { id: 'balloon', x: 0, z: 50, r: 8, top: 12, name: 'Île des Ballons' },
  { id: 'hop', x: 0, z: 20, r: 4.6, top: 16.5 },
  { id: 'mill', x: 0, z: 2, r: 8, top: 18, name: 'Île du Moulin' },
  { id: 'echo', x: 0, z: -34, r: 9, top: 18, name: 'Île de l\'Écho' },
  { id: 'hub', x: 0, z: -102, r: 11, top: 34, name: 'Île du Carillon' },
  { id: 'nest', x: 17, z: 66, r: 2.8, top: 15.5 },               // îlot caché (étoile 1)
  { id: 'cave', x: 12, z: 115, r: 3.2, top: 5.5, name: 'Le Nid sous l\'île' },   // sous l'île du départ (plume)
  { id: 'garden', x: -30, z: 3, r: 5.5, top: 18.6, name: 'Jardin Suspendu' },
  // ouest : les Nuages-Trampolines
  { id: 'fluff', x: -30, z: -102, r: 6.5, top: 34.5, name: 'Île Moelleuse' },
  { id: 'rose', x: -67, z: -102, r: 6, top: 40, name: 'Île de la Cloche Rose' },
  // est : le Col des Rafales
  { id: 'breeze', x: 28.5, z: -102, r: 6, top: 34.5, name: 'Île Venteuse' },
  { id: 'col', x: 64, z: -102, r: 5.5, top: 37, name: 'Île du Col' },
  { id: 'souffle', x: 64, z: -80, r: 3.5, top: 32, name: 'Îlot du Souffle' },     // secret (étoile 4)
  { id: 'blue', x: 90, z: -102, r: 6.5, top: 39, name: 'Île de la Cloche Bleue' },
  // nord-ouest : le Tourniquet, la Grande Roue, le Canon
  { id: 'roue', x: -22, z: -131.5, r: 5.5, top: 34.5, name: 'Île de la Grande Roue' },
  { id: 'canon', x: -22, z: -157.3, r: 5.5, top: 44.5, name: 'Île du Canon' },
  { id: 'gold', x: -78, z: -150, r: 6.5, top: 46, name: 'Île de la Cloche d\'Or' },
  { id: 'ledge', x: -92, z: -161, r: 3.8, top: 41, name: 'Le Balcon d\'Or' },    // sous la Cloche d'Or (plume)
  // tout au nord, la plus haute : le Trophée
  { id: 'goal', x: 0, z: -162, r: 10, top: 50, name: 'Île du Trophée' },
];
export const isle = (id) => ISLANDS.find(I => I.id === id);
const dome = (I, x, z) => {
  const d = Math.hypot(x - I.x, z - I.z) / I.r;
  return d > 1 ? null : I.top + 0.35 * (1 - d * d);
};
/** Hauteur du sol (îles) ; très bas ailleurs : le vide. */
export function heightAt(x, z) {
  let h = -100;
  for (const I of ISLANDS) { const y = dome(I, x, z); if (y !== null && y > h) h = y; }
  return h;
}
export function inWater() { return false; }
export function islandAt(x, z) { return ISLANDS.find(I => Math.hypot(x - I.x, z - I.z) <= I.r) || null; }

// ---------------------------------------------------------------------------
// Obstacles et plates-formes
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Petites îles de pierre (fixes)
export const pads = [];
const pad = (x, z, top, r, look) => { const p = { x, z, top, r, look: look || 'rock' }; p.col = cyl(x, z, r, top - 1.2, top, { kind: 'pad' }); pads.push(p); return p; };

// 1. Les Pas Nuageux : de pierre en pierre, en montant doucement
pad(0, 78, 10.2, 2.3);
pad(3.2, 72.5, 10.7, 2.2);
pad(-1, 67, 11.2, 2.2);
pad(2.2, 61.5, 11.6, 2.4);

// Champignons-ressorts et nuages-trampolines (bounce = vitesse vers le haut)
export const springs = [];
const spring = (x, z, base, bounce, r, look) => { const s = { x, z, base, top: base + 0.7, r: r || 1.2, bounce, look: look || 'shroom' }; s.col = cyl(x, z, s.r, base - 0.3, s.top, { kind: 'bouncer', bounce, tramp: look === 'tramp' }); springs.push(s); return s; };
spring(7.6, 62.2, 11.6, 17);                  // vers l'îlot caché (étoile 1)
pad(7.6, 62.2, 11.6, 1.7);                    // (son socle)
spring(-4.2, 44.5, 12.2, 15);                 // sur l'île des Ballons, pour jouer

// 2. Le Courant d'Air : plates-formes qui glissent, ascenseur, colonne de vent
export const movers = [];
const mover = (kind, def) => {
  const m = Object.assign({ kind, r: 2.3 }, def);
  m.col = cyl(m.x0 || 0, m.z0 || 0, m.r, (m.y0 || 0) - 1, m.y0 || 0, { kind: 'pad', moving: true, mover: m, dx: 0, dz: 0 });
  movers.push(m);
  return m;
};
mover('slide', { x0: 0, z0: 39, y0: 12.4, ax: 6.5, az: 0, ay: 0, period: 6.5, phase: 0 });
mover('lift', { x0: 0, z0: 29.5, y0: 12.6, ax: 0, az: 0, ay: 4.2, period: 5.5, phase: 0 });
// un nuage qui fait l'aller-retour, sur le côté (raccourci)
mover('slide', { x0: -7, z0: 24, y0: 15.6, ax: 0, az: 4, ay: 0, period: 5, phase: 1.5, r: 2, look: 'cloud' });
// le nuage-bac du Jardin Suspendu, à l'ouest du Moulin
export const FERRY = mover('slide', { x0: -17, z0: 3, y0: 18.4, ax: 5, az: 0, ay: 0, period: 8, phase: 0, r: 2.1, look: 'cloud' });

/** Position d'une plate-forme mobile au temps t. */
export function moverAt(m, t) {
  if (m.kind === 'orbit') {
    const a = m.a0 + t * m.w;
    return { x: m.cx + Math.cos(a) * m.R, z: m.cz + Math.sin(a) * m.R, y: m.y0 };
  }
  if (m.kind === 'wheel') {
    // nacelle de la Grande Roue : elle tourne dans un plan vertical et reste à plat
    const a = m.a0 + t * m.w;
    return { x: m.cx + m.dx * Math.cos(a) * m.R, z: m.cz + m.dz * Math.cos(a) * m.R, y: m.cy + Math.sin(a) * m.R };
  }
  const k = Math.sin((t / m.period) * Math.PI * 2 + m.phase);
  return { x: m.x0 + m.ax * k, z: m.z0 + m.az * k, y: m.y0 + m.ay * (k * 0.5 + 0.5) };
}

// Colonnes de vent : on y monte en planant (ou en sautant dedans)
export const UPDRAFTS = [
  { x: 0, z: 12.7, r: 2.5, y0: 8, y1: 27, lift: 50 },          // dans le vide, entre l'îlot et le Moulin
  { x: 0, z: -89, r: 2.6, y0: 18, y1: 37, lift: 46 },          // au pied de l'Île du Carillon
  { x: 64, z: -87, r: 2.2, y0: 29, y1: 40.5, lift: 46 },     // retour de l'Îlot du Souffle vers le Col
];

// 3. Le Pont des Copains : deux dalles à presser en même temps (à plusieurs),
// ou une seule qui sort le pont quelques secondes (seul)
export const PLATES = [
  { id: 'a', x: -4.6, z: -1.5 },
  { id: 'b', x: 4.6, z: -1.5 },
].map(p => Object.assign(p, { y: heightAt(p.x, p.z) }));
// le moulin de l'île du Moulin (décor solide)
export const MILL = { x: 5.4, z: 6.6, r: 1.5, h: 7 };
MILL.y = heightAt(MILL.x, MILL.z);
cyl(MILL.x, MILL.z, MILL.r, MILL.y - 1, MILL.y + MILL.h, { kind: 'rock' });
export const BRIDGE = { x: 0, z0: -6, z1: -25.2, w: 3.2, top: 18.2 };
export const BRIDGE_SOLO_TIME = 7;
export const bridgeCol = box(BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2, BRIDGE.w, BRIDGE.z0 - BRIDGE.z1, BRIDGE.top - 0.5, BRIDGE.top, { kind: 'bridge', off: true });

// Nuages fragiles (ils tombent peu après qu'on s'y pose), à l'est
export const crumbles = [];
const crumble = (x, z, top, r) => { const c = { x, z, top, r: r || 1.9 }; c.col = cyl(x, z, c.r, top - 0.8, top, { kind: 'cloud', crumble: c }); crumbles.push(c); return c; };
crumble(8.6, -9.5, 18.4);
crumble(11.6, -15.2, 19);
crumble(9.4, -20.8, 19.4);
crumble(5.4, -26.2, 19);
export const CRUMBLE_TIME = 0.75;       // secondes avant de tomber
export const CRUMBLE_BACK = 3.2;        // secondes avant de revenir

// Le Tremplin des Copains : un pilier haut, sur l'île de l'Écho
export const PILLAR = { x: 6.2, z: -40.5, r: 1.8, top: 23.2 };
cyl(PILLAR.x, PILLAR.z, PILLAR.r, 10, PILLAR.top, { kind: 'rock' });
spring(-4.5, -41.5, 18.15, 17);

// 4. La Tour du Vent : manège de nuages, puis spirale autour du cristal
export const CAROUSEL = { cx: 0, cz: -55, R: 6.2, w: 0.55, y0: 19.2, n: 4 };
for (let i = 0; i < CAROUSEL.n; i++) mover('orbit', { cx: CAROUSEL.cx, cz: CAROUSEL.cz, R: CAROUSEL.R, w: CAROUSEL.w, a0: (i / CAROUSEL.n) * Math.PI * 2, y0: CAROUSEL.y0, x0: 0, z0: 0, r: 2.1, look: 'cloud' });
pad(0, -65.5, 19.8, 2.4);                    // sortie du manège
export const TOWER = { x: 0, z: -79, r: 2.6, top: 37.4 };
cyl(TOWER.x, TOWER.z, TOWER.r, 8, TOWER.top, { kind: 'rock' });
cyl(TOWER.x, TOWER.z, TOWER.r * 1.6, 18.1, 19.3, { kind: 'pad' });   // le socle de pierre au pied de la tour : on peut s'y poser
export const spiral = [];
for (let i = 0; i < 11; i++) {
  const a = Math.PI / 2 + i * (3 * Math.PI / 10);   // départ côté sud, arrivée côté nord (vers le Carillon)
  const x = TOWER.x + Math.cos(a) * 6, z = TOWER.z + Math.sin(a) * 6, top = 21.2 + i * 1.45;
  spiral.push(pad(x, z, top, 1.75, i % 4 === 3 ? 'crystal' : 'rock'));
}

// Le Nid sous l'île (sous l'île du départ) : un champignon pour remonter
spring(11, 116, heightAt(11, 116), 18.5);
// Le Jardin Suspendu : un champignon vers un nuage perché (plume)
spring(-27.6, 5.6, heightAt(-27.6, 5.6), 16);
export const GARDEN_CLOUD = pad(-33.5, 7.5, 23.2, 1.9, 'cloud');

// ---------------------------------------------------------------------------
// 5. L'Île du Carillon et ses trois branches
// ---------------------------------------------------------------------------
// --- ouest : les Nuages-Trampolines --------------------------------------------
pad(-17.3, -102, 34.4, 2.2);
export const TRAMPS = [
  spring(-30, -104.5, heightAt(-30, -104.5), 15.5, 1.7, 'tramp'),       // le premier, au milieu de l'île : pour essayer sans risque
  spring(-41, -102, 33.3, 17, 1.9, 'tramp'),
  spring(-48, -99.5, 35.3, 17, 1.9, 'tramp'),
  spring(-55, -103, 37.3, 17, 1.9, 'tramp'),
  spring(-67, -106.5, heightAt(-67, -106.5), 22.5, 1.6, 'tramp'),       // le Grand Trampoline (étoile 3)
];
export const PERCH = pad(-67, -114.5, 47.5, 2.4, 'cloud');   // le nuage perché

// --- est : le Col des Rafales -------------------------------------------------
pad(17.3, -102, 34.4, 2.2);
export const GUST_PADS = [
  pad(38.6, -102.5, 35, 2.2), pad(44, -101.5, 35.6, 2.2), pad(49.4, -103, 36.2, 2.2), pad(55, -102, 36.6, 2.2),
  pad(73.6, -101, 37.6, 2.2), pad(79, -103, 38.2, 2.2),
];
// Les rafales : toutes les quelques secondes, le vent souffle (on est prévenu avant)
export const GUST_CYCLE = 6.5, GUST_WARN = 3.6, GUST_ON = 4.8;   // calme, puis alerte, puis rafale
export const GUSTS = [
  { id: 'g1', x0: 22, x1: 35, z0: -109, z1: -95, dx: 0, dz: 1, k: 0.6, off: 0, y0: 33, y1: 40 },        // Île Venteuse (il y a une haie)
  { id: 'g2', x0: 35, x1: 58.5, z0: -110, z1: -94, dx: 0, dz: 1, k: 1, off: 2.2, y0: 33, y1: 42 },
  { id: 'g3', x0: 69.5, x1: 83.5, z0: -110, z1: -94, dx: 0, dz: -1, k: 1.1, off: 4.4, y0: 35, y1: 44 },
];
/** État d'une rafale au temps t : 0 calme, 1 alerte, 2 souffle. */
export function gustState(g, t) {
  const p = ((t + g.off) % GUST_CYCLE + GUST_CYCLE) % GUST_CYCLE;
  return p < GUST_WARN ? 0 : p < GUST_ON ? 1 : 2;
}
// gros rochers-abris : derrière eux (sous le vent), la rafale ne pousse pas
export const SHELTERS = [];
for (const p of GUST_PADS) {
  const g = GUSTS.find(q => p.x > q.x0 && p.x < q.x1);
  const s = { x: p.x, z: p.z - g.dz * 1.15, r: 0.85, h: 2.1, dz: g.dz, base: p.top };
  cyl(s.x, s.z, s.r, p.top - 0.5, p.top + s.h, { kind: 'rock' });
  SHELTERS.push(s);
}
/** Abrité du vent (rafale g) ? */
export function sheltered(g, x, z) {
  return SHELTERS.some(s => s.dz === g.dz && Math.abs(x - s.x) < s.r + 0.35 && (z - s.z) * g.dz > 0 && (z - s.z) * g.dz < 3.4);
}
export function gustAt(x, y, z) { return GUSTS.find(g => x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1 && y > g.y0 && y < g.y1) || null; }
// la haie de l'Île Venteuse : on peut s'y adosser pendant la rafale
export const HEDGE = [];
{
  const I = isle('breeze');
  for (let a = 0.35; a <= Math.PI - 0.35 + 1e-6; a += 0.3) {
    const x = I.x + Math.cos(a) * (I.r - 0.6), z = I.z + Math.sin(a) * (I.r - 0.6);
    HEDGE.push({ x, z, y: heightAt(x, z) });
    cyl(x, z, 0.65, I.top - 0.5, I.top + 1.25, { kind: 'rock' });
  }
}

// --- nord-ouest : le Tourniquet, la Grande Roue, le Canon ------------------------
pad(-12.5, -112.5, 34.4, 2.3);
/** Le Tourniquet : une longue planche qui tourne autour d'un pivot. */
export const TURNSTILE = { x: -17, z: -121, top: 34.6, hl: 5.4, hw: 1.2, w: 0.45, a0: 0.2 };
export const turnCol = { type: 'obox', x: TURNSTILE.x, z: TURNSTILE.z, hl: TURNSTILE.hl, hw: TURNSTILE.hw, a: TURNSTILE.a0, y0: TURNSTILE.top - 0.5, y1: TURNSTILE.top, kind: 'pad', moving: true, turn: TURNSTILE };
colliders.push(turnCol);
cyl(TURNSTILE.x, TURNSTILE.z, 1.4, TURNSTILE.top - 0.4, TURNSTILE.top + 0.05, { kind: 'pad' });     // le pivot, immobile
export function turnAngle(t) { return TURNSTILE.a0 + t * TURNSTILE.w; }
/** La Grande Roue des Nuages : quatre nacelles qui montent vers l'Île du Canon. */
export const WHEEL = { cx: -22, cy: 40, cz: -142.8, R: 6.5, w: 0.3, n: 4, dx: 0, dz: 1 };
for (let i = 0; i < WHEEL.n; i++) mover('wheel', { cx: WHEEL.cx, cy: WHEEL.cy, cz: WHEEL.cz, R: WHEEL.R, w: WHEEL.w, dx: WHEEL.dx, dz: WHEEL.dz, a0: (i / WHEEL.n) * Math.PI * 2, r: 1.8, look: 'cloud', gondola: true });
// le moyeu doré, au cœur de la roue : on peut s'y poser (étoile 5)
export const HUB_DRUM = { x: WHEEL.cx, z: WHEEL.cz, top: WHEEL.cy + 1.2, w: 4.2, d: 2.4 };
box(HUB_DRUM.x, HUB_DRUM.z, HUB_DRUM.w, HUB_DRUM.d, WHEEL.cy - 1.2, HUB_DRUM.top, { kind: 'pad', moving: true });   // (« mobile » : on n'y réapparaît pas après une chute)
/** Canons à nuages : on se met sur la cible, et BOUM ! */
export const CANNONS = [
  { id: 'aller', x: -25.6, z: -157.3, to: { x: -74, z: -149.5 }, T: 2.5, h: 9, name: 'Canon à Nuages' },
  { id: 'retour', x: -77, z: -154.8, to: { x: -2, z: -95.5 }, T: 3.2, h: 13, name: 'Canon du Retour' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z), r: 1.25, to: Object.assign(c.to, { y: heightAt(c.to.x, c.to.z) }) }));
export const CANNON_WAIT = 0.9;
/** Position en vol (k de 0 à 1) : une belle parabole. */
export function cannonAt(c, k) {
  const y0 = c.y + 0.9, y1 = c.to.y;
  return { x: c.x + (c.to.x - c.x) * k, z: c.z + (c.to.z - c.z) * k, y: y0 + (y1 - y0) * k + 4 * c.h * k * (1 - k) };
}
spring(-90, -159.5, heightAt(-90, -159.5), 18.5);           // le Balcon d'Or : remonter à la Cloche d'Or

// --- les trois cloches ----------------------------------------------------------
export const BELLS = [
  { id: 'rose', x: -69.5, z: -100, color: 0xff7ab0, name: 'la Cloche Rose' },
  { id: 'bleue', x: 92.5, z: -102, color: 0x6ab8ff, name: 'la Cloche Bleue' },
  { id: 'or', x: -82, z: -148.5, color: 0xffcc3a, name: 'la Cloche d\'Or' },
].map(b => Object.assign(b, { y: heightAt(b.x, b.z) }));

// --- les chemins d'arc-en-ciel (ils apparaissent quand on sonne les cloches) ----
export const RIBBONS = [];
/** Chemin d'arc-en-ciel : une courbe de Bézier (a → c → b), en pas de 0,8 m. */
function ribbon(id, a, c, b, w) {
  const R = { id, pts: [], w: w || 3.4, cols: [] };
  const len = Math.hypot(a[0] - b[0], a[2] - b[2]) * 1.15;
  const n = Math.max(2, Math.round(len / 0.8));
  for (let i = 0; i <= n; i++) {
    const k = i / n, u = 1 - k;
    const x = u * u * a[0] + 2 * u * k * c[0] + k * k * b[0];
    const z = u * u * a[2] + 2 * u * k * c[2] + k * k * b[2];
    const y = a[1] + (b[1] - a[1]) * k;
    R.pts.push({ x, y, z });
    R.cols.push(cyl(x, z, R.w / 2, y - 0.5, y, { kind: 'rainbow', off: true, ribbon: id }));
  }
  RIBBONS.push(R);
  return R;
}
const edgeY = (id) => isle(id).top + 0.02;
ribbon('rose', [-61.4, edgeY('rose'), -101], [-36, 37, -84], [-10.5, edgeY('hub'), -100]);
ribbon('bleue', [86, edgeY('blue'), -107], [50, 36.5, -132], [10.5, edgeY('hub'), -104]);
// le grand pont arc-en-ciel : du Carillon au Trophée, tout droit et en montant
export const RAINBOW = ribbon('pont', [0, edgeY('hub'), -112.5], [0, 42, -132], [0, edgeY('goal'), -152.4], 3.8);

// ---------------------------------------------------------------------------
// Points de passage (drapeaux) : on revient au dernier drapeau touché.
// back : le drapeau d'avant (mode Défi, quand on n'a plus de cœurs)
// ---------------------------------------------------------------------------
export const CHECKPOINTS = [
  { id: 0, x: 0, z: 100, name: 'Départ', fx: -3.4, fz: -6 },
  { id: 1, x: 0, z: 52, name: 'Île des Ballons', back: 0 },
  { id: 2, x: 0, z: 4, name: 'Île du Moulin', back: 1 },
  { id: 3, x: 0, z: -31, name: 'Île de l\'Écho', back: 2 },
  { id: 4, x: 0, z: -65.5, name: 'Manège des Nuages', y: 19.8, fx: 1.5, back: 3 },
  { id: 5, x: 0, z: -95, name: 'Île du Carillon', back: 4 },
  { id: 6, x: -30, z: -98.5, name: 'Île Moelleuse', back: 5 },
  { id: 7, x: -66, z: -98.5, name: 'Île de la Cloche Rose', fx: 2, back: 6 },
  { id: 8, x: 28.5, z: -105, name: 'Île Venteuse', fx: -2.3, back: 5 },
  { id: 9, x: 64, z: -104, name: 'Île du Col', back: 8 },
  { id: 10, x: 87, z: -99.5, name: 'Île de la Cloche Bleue', back: 9 },
  { id: 11, x: -22, z: -129, name: 'Île de la Grande Roue', back: 5 },
  { id: 12, x: -21.5, z: -153.8, name: 'Île du Canon', fx: 1.8, back: 11 },
  { id: 13, x: -75, z: -146, name: 'Île de la Cloche d\'Or', fx: -2, back: 12 },
  { id: 14, x: 0, z: -158, name: 'Île du Trophée', fx: -5, back: 5 },
].map(c => Object.assign(c, { y: c.y === undefined ? heightAt(c.x, c.z) : c.y, back: c.back === undefined ? 0 : c.back }));
/** Le chemin principal (drapeaux à suivre dans l'ordre, pour le mode Promenade). */
export const MAIN_PATH = [0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Grille : les obstacles proches d'un point (les mobiles sont à part)
// ---------------------------------------------------------------------------
const CELL = 8, grid = new Map(), dyn = [];
const gkey = (i, j) => i * 4096 + j;
function bbox(c) {
  if (c.type === 'box') return [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2];
  const r = c.type === 'obox' ? c.hl + c.hw : c.r;
  return [c.x - r, c.x + r, c.z - r, c.z + r];
}
function index(c) {
  if (c.moving) { if (!dyn.includes(c)) dyn.push(c); return; }
  const [x0, x1, z0, z1] = bbox(c);
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = gkey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
  }
}
let stamp = 1;
/** Obstacles proches de (x, z) dans un rayon r (plates-formes mobiles comprises). */
export function near(x, z, r) {
  r = r || 0;
  const out = dyn.slice(), s = ++stamp;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
    const list = grid.get(gkey(i, j));
    if (list) for (const c of list) if (c._s !== s) { c._s = s; out.push(c); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Support : sol le plus haut sous un point
// ---------------------------------------------------------------------------
export function colliderTop(c) { return c.off ? -Infinity : c.y1; }
export function inside(c, x, z, margin) {
  margin = margin || 0;
  if (c.type === 'box') return Math.abs(x - c.x) <= c.w / 2 + margin && Math.abs(z - c.z) <= c.d / 2 + margin;
  if (c.type === 'obox') {
    const dx = x - c.x, dz = z - c.z, ca = Math.cos(c.a), sa = Math.sin(c.a);
    return Math.abs(dx * ca + dz * sa) <= c.hl + margin && Math.abs(-dx * sa + dz * ca) <= c.hw + margin;
  }
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
/** Met les plates-formes mobiles à leur place au temps t (et note leur déplacement). */
export function updateMovers(t) {
  for (const m of movers) {
    const p = moverAt(m, t), c = m.col;
    c.dx = c.x === undefined ? 0 : p.x - c.x; c.dz = p.z - c.z;
    c.x = p.x; c.z = p.z; c.y1 = p.y; c.y0 = p.y - 1;
  }
  const a = turnAngle(t);
  turnCol.da = a - turnCol.a; turnCol.a = a;
}
updateMovers(0);
for (const m of movers) { m.col.dx = 0; m.col.dz = 0; }
turnCol.da = 0;

function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of colliders) if (!c.off && !c.moving && c.kind !== 'bouncer' && c.y1 > best && inside(c, x, z, 0.2)) best = c.y1;
  return best;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const lineTo = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const arc = (cx, cz, r, n, a0, a1, y) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y }); } };
const garc = (id, r, n, a0, a1) => { const I = isle(id); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); at(I.x + Math.cos(a) * r, I.z + Math.sin(a) * r); } };
// --- première moitié (54) ---
lineTo(0, 92, 0, 84, 4);                                        // départ
arc(0, 96, 9, 4, Math.PI * 0.2, Math.PI * 0.8, 11.2);
for (const p of pads.slice(0, 4)) at(p.x, p.z);                 // pas nuageux
for (let i = 0; i < 3; i++) pts.push({ x: 10.2 + i * 2.6, z: 63.2 + i * 1.0, y: 16.2 + i * 1.2 });   // au-dessus du ressort vers l'îlot
arc(0, 50, 5.5, 5, 0.3, Math.PI * 2 - 0.9, 13.3);              // île des Ballons
lineTo(-4.5, 39, 4.5, 39, 3, 1.3);                              // courant d'air
for (let i = 0; i < 2; i++) pts.push({ x: 0, z: 29.5, y: 14.6 + i * 2 });
at(0, 20);
for (let i = 0; i < 3; i++) pts.push({ x: 0, z: 12.9, y: 19.5 + i * 2.2 });   // dans la colonne de vent
garc('mill', 5.6, 3, Math.PI * 0.25, Math.PI * 0.75);           // île du Moulin
pts.push({ x: -12.5, z: 3, y: 19.6 }, { x: -21.5, z: 3, y: 19.6 }); // le nuage-bac
garc('garden', 3.4, 2, -0.6, 1.2);                               // jardin suspendu
for (let i = 0; i < 3; i++) pts.push({ x: 0, z: -9.5 - i * 6.2, y: 19.4 });   // pont des copains
for (const c of crumbles.slice(0, 3)) at(c.x, c.z, 1.2);        // nuages fragiles
garc('echo', 6, 3, -Math.PI * 0.85, Math.PI * 0.3);              // île de l'Écho
arc(CAROUSEL.cx, CAROUSEL.cz, CAROUSEL.R, 4, Math.PI * 0.25, Math.PI * 1.75, CAROUSEL.y0 + 1.2);   // manège
for (const p of spiral.filter((_, i) => i % 3 === 1)) at(p.x, p.z);   // spirale
garc('cave', 1.6, 3, 0, Math.PI * 1.3);                          // le nid sous l'île
// --- l'Île du Carillon et ses branches (46) ---
garc('hub', 7.5, 3, Math.PI * 0.2, Math.PI * 0.8);
at(-17.3, -102); garc('fluff', 3.6, 2, Math.PI * 0.7, Math.PI * 1.3);   // ouest
for (const T of TRAMPS.slice(1, 4)) pts.push({ x: T.x, z: T.z, y: T.top + 3.6 });
garc('rose', 3.4, 2, 0.2, Math.PI * 0.6);
pts.push({ x: -67, z: -110.5, y: 47.2 }, { x: -67, z: -114.5, y: 48.7 });   // vers le nuage perché
at(17.3, -102); at(28.5, -100);              // est
for (const p of GUST_PADS) at(p.x, p.z + 0.6 * (p.x < 60 ? 1 : -1));
garc('col', 3, 2, Math.PI * 1.1, Math.PI * 1.9);
garc('souffle', 1.4, 2, 0, Math.PI);
pts.push({ x: 64, z: -87, y: 35 });
garc('blue', 3.6, 2, Math.PI * 0.7, Math.PI * 1.3);
at(-12.5, -112.5); pts.push({ x: TURNSTILE.x, z: TURNSTILE.z, y: TURNSTILE.top + 1.2 });   // nord-ouest
at(-24.5, -131.5);
at(-22, -160);
garc('gold', 3.5, 2, Math.PI * 0.3, Math.PI * 1.1);
at(-92, -161);
for (const k of [0.3, 0.5, 0.7]) { const p = cannonAt(CANNONS[0], k); pts.push(p); }   // en plein vol !
for (const k of [0.45, 0.6]) { const p = cannonAt(CANNONS[1], k); pts.push(p); }
for (let i = 0; i < 4; i++) { const p = RAINBOW.pts[Math.round((i + 0.5) / 4 * (RAINBOW.pts.length - 1))]; pts.push({ x: p.x, z: p.z, y: p.y + 1.1 }); }   // le pont arc-en-ciel
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'q' + i, x: p.x, y: p.y, z: p.z }));
export const COIN_COUNT = pts.length;
export const balls = [];

const nest = isle('nest'), souffle = isle('souffle');
export const medals = [
  { id: 'm_s1', x: nest.x, z: nest.z, y: nest.top + 1.5, label: 'L\'îlot du ressort', visible: true },
  { id: 'm_s2', x: UPDRAFTS[0].x, z: UPDRAFTS[0].z, y: 26.5, label: 'Tout en haut du courant d\'air', visible: true },
  { id: 'm_s3', x: PERCH.x, z: PERCH.z, y: PERCH.top + 1.5, label: 'Le nuage perché du Grand Trampoline', visible: true },
  { id: 'm_s4', x: souffle.x, z: souffle.z, y: souffle.top + 0.35 + 1.5, label: 'L\'Îlot du Souffle', visible: true },
  { id: 'm_s5', x: HUB_DRUM.x, z: HUB_DRUM.z, y: HUB_DRUM.top + 1.5, label: 'Au cœur de la Grande Roue', visible: true },
  { id: 'm_goal', x: 0, z: -164, y: 50 + 0.35 + 1.8, label: 'Le Trophée du Ciel', visible: true },
];

// Plumes arc-en-ciel de Nimbus (bonus, dans les coins secrets)
export const FEATHERS = [
  { id: 'f1', x: 13, z: 114.2, y: 5.5 + 1.5, label: 'Le Nid sous l\'île' },
  { id: 'f2', x: PILLAR.x, z: PILLAR.z, y: PILLAR.top + 1.4, label: 'Le Tremplin des Copains' },
  { id: 'f3', x: TOWER.x, z: TOWER.z, y: TOWER.top + 1.4, label: 'Le sommet de la Tour du Vent' },
  { id: 'f4', x: 14.6, z: -17.6, y: 22.2, label: 'Au-dessus des nuages fragiles' },
  { id: 'f5', x: GARDEN_CLOUD.x, z: GARDEN_CLOUD.z, y: GARDEN_CLOUD.top + 1.3, label: 'Le nuage du Jardin Suspendu' },
  { id: 'f6', x: -93, z: -162.2, y: 41 + 1.6, label: 'Le Balcon d\'Or' },
];

export const crates = [
  { id: 'c1', x: 4, z: 47, content: 'heart' },
  { id: 'c2', x: -5, z: 6, content: 'heart' },
  { id: 'c3', x: -6, z: -30, content: 'heart' },
  { id: 'c4', x: 6.5, z: -99, content: 'heart' },
  { id: 'c5', x: -33, z: -106, content: 'heart' },
  { id: 'c6', x: 66.5, z: -99.5, content: 'heart' },
  { id: 'c7', x: -19.5, z: -133, content: 'heart' },
  { id: 'c8', x: 6, z: -157, content: 'heart' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Quelques chats bandits qui gardent les îles (ils restent chez eux)
export const cats = [
  { id: 'cat1', x: 3, z: 0, group: 'roam' },
  { id: 'cat2', x: -3, z: -37, group: 'roam' },
  { id: 'cat3', x: 3, z: -36, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

export const npcs = {
  mamie: { x: -5, z: 101, y: heightAt(-5, 101) },
  puppy: { x: -3.4, z: 102.2, y: heightAt(-3.4, 102.2) },
};
/** Nimbus, le carlin aviateur, gardien des cloches du ciel (sur l'Île du Carillon). */
export const NIMBUS = { x: -4, z: -99, y: heightAt(-4, -99) };

export const signs = [
  { x: 3.6, z: 86, text: ['Les Îles du Ciel', 'Sautez de pierre en pierre jusqu\'au Trophée !', 'Les drapeaux gardent votre place si vous tombez.'] },
  { x: -3.5, z: 44, text: ['Le Courant d\'Air', 'Les plates-formes bougent : attendez le bon moment.', 'Dans la colonne de vent, planez : elle vous porte !'] },
  { x: 0, z: 7.4, text: ['Le Pont des Copains', 'Appuyez ensemble sur les deux dalles :', 'le pont sortira pour de bon !', 'Seul ? Une dalle le sort quelques secondes. Courez !'] },
  { x: -3.5, z: -27.5, text: ['Le Tremplin des Copains', 'Sautez sur la tête d\'un ami pour monter plus haut !', '(ou essayez le champignon…)'] },
  { x: 5.5, z: 107.5, text: ['Bord de l\'île', 'On raconte qu\'un nid se cache juste en dessous…', 'Pour y descendre : sautez, et planez tout doucement.'] },
  { x: -6.5, z: 0.5, text: ['Le Jardin Suspendu', 'Montez sur le nuage-bac : il vous emmène à l\'ouest.'] },
  { x: -6.8, z: -106.5, text: ['L\'Île du Carillon', 'Ouest : les Nuages-Trampolines et la Cloche Rose.', 'Est : le Col des Rafales et la Cloche Bleue.', 'Nord-ouest : le Tourniquet, la Grande Roue, le Canon… et la Cloche d\'Or !'] },
  { x: -33.5, z: -98, text: ['Les Nuages-Trampolines', 'Sautez dessus : ils vous renvoient très haut !', 'Essayez d\'abord celui du milieu de l\'île.'] },
  { x: 25, z: -98.5, text: ['Le Col des Rafales', 'Écoutez : quand le vent siffle, une rafale arrive.', 'Restez derrière un gros rocher, ou contre la haie !', 'Et tout en bas, au sud du Col, il y a un îlot secret…'] },
  { x: -18.5, z: -159.3, text: ['Le Canon à Nuages', 'Montez sur la cible et ne bougez plus…', '3, 2, 1… BOUM !'] },
];

export const START = { x: 0, z: 104, y: heightAt(0, 104), yaw: Math.PI };
export const PATHS = [[[0, 108], [0, 84]], [[0, 56], [0, 44]], [[0, 9], [0, -5]], [[0, -27], [0, -42]],
  [[0, -92], [0, -112]], [[-11, -102], [11, -102]], [[-35, -102], [-24, -102]], [[23, -102], [34, -102]], [[-4, -159], [0, -152]]];
export const CRYSTALS = [[-9, 92, 0x7ad8ff], [9.5, 99, 0xff8ad8], [-5.5, 2, 0xb08aff], [6.5, -30, 0x7ad8ff], [7.5, -108, 0xffd060], [-7, -167, 0xff8ad8],
  [-71, -97, 0xff8ad8], [94, -98, 0x7ad8ff], [-82, -153, 0xffd060]];
export const ruins = [];

// Portail de retour vers le Parc, sur l'île du départ
export const PORTALS = [{ x: 8.5, z: 103, to: 1 }];

// L'arche d'arrivée (chrono), sur l'Île du Trophée
const GI = isle('goal');
export const FINISH = { x: 0, z: GI.z + 6.5, y: GI.top };
for (const sx of [-1, 1]) cyl(GI.x + sx * 3.2, FINISH.z, 0.45, GI.top - 1, GI.top + 5.3, { kind: 'arch', solid: true });

// Arbres en fleurs sur les grandes îles
export const trees = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // l'Île du Trophée reste dégagée : c'est l'arène du combat final
  const want = { start: 7, balloon: 2, mill: 2, echo: 3, hub: 2, garden: 2, fluff: 1, rose: 1, col: 1, blue: 2, roue: 1, canon: 1, gold: 2 };
  for (const I of ISLANDS) {
    const n = want[I.id] || 0;
    let guard = 0, made = 0;
    while (made < n && guard++ < 400) {
      const a = rnd() * Math.PI * 2, d = I.r * (0.55 + rnd() * 0.32);
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      if (Math.abs(x - I.x) < 3.2 && I.x === 0) continue;                // l'allée centrale reste libre
      if (colliders.some(c => (!c.off || c.kind === 'rainbow') && inside(c, x, z, 1.6))) continue;
      if (Math.hypot(x - npcs.mamie.x, z - npcs.mamie.z) < 3 || Math.hypot(x - NIMBUS.x, z - NIMBUS.z) < 3) continue;
      if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
      if (PLATES.some(p => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
      if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 2)) continue;
      if (PORTALS.some(p => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      if ([...BELLS, ...CANNONS, ...signs, ...CHECKPOINTS].some(p => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
      if (CHECKPOINTS.some(c => Math.hypot(c.x + (c.fx === undefined ? 2.3 : c.fx) - x, c.z + (c.fz || 0) - z) < 2.5)) continue;
      if (bones.some(b => Math.hypot(b.x - x, b.z - z) < 1.2)) continue;
      const s = 0.75 + rnd() * 0.35;
      trees.push({ x, z, y: heightAt(x, z), s, h: 5.5 + rnd() * 2 });
      made++;
    }
  }
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}
for (const c of colliders) index(c);

/** Mini-carte : îles et plates-formes. */
export function mapColor(x, z) {
  if (heightAt(x, z) > 0) return [122, 208, 90];
  for (const c of near(x, z, 0)) {
    if (c.kind === 'tree' || c.moving || !inside(c, x, z, 0)) continue;
    if (c.kind === 'bridge') return [196, 150, 96];
    if (c.kind === 'rainbow') continue;
    if (!c.off) return c.kind === 'cloud' ? [244, 244, 255] : [200, 184, 160];
  }
  return [92, 160, 220];
}
export { clamp as _clamp };
