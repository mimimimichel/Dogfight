/*
 * Matcha & Ainu — Niveau 4 : « Les Îles du Ciel ».
 * Un parcours de plates-formes à faire seul ou à plusieurs, au-dessus de la mer.
 * Données pures (aucune dépendance) : utilisé par le jeu et par les tests (Node).
 *
 * Parcours (le nord est vers -z) :
 *   Île du Départ (Mamie) → 1. les Pas Nuageux → île des Ballons (drapeau)
 *   → 2. le Courant d'Air (plates-formes qui bougent, colonne de vent) → île du Moulin (drapeau)
 *   → 3. le Pont des Copains (deux dalles à presser ensemble, ou nuages fragiles)
 *   → île de l'Écho (drapeau) → 4. la Tour du Vent (manège de nuages, spirale)
 *   → île du Trophée (arrivée). 5 Étoiles du ciel sont cachées en chemin.
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
export const WORLD = 260;
export const RADAR = 70;
export const GRASS_K = 0.55;

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
  { id: 'goal', x: 0, z: -102, r: 10, top: 34, name: 'Île du Trophée' },
  { id: 'nest', x: 17, z: 66, r: 2.8, top: 15.5 },               // îlot caché (étoile 1)
];
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

// Champignons-ressorts (bounce = vitesse vers le haut)
export const springs = [];
const spring = (x, z, base, bounce, r) => { const s = { x, z, base, top: base + 0.7, r: r || 1.2, bounce }; s.col = cyl(x, z, s.r, base - 0.3, s.top, { kind: 'bouncer', bounce }); springs.push(s); return s; };
spring(7.6, 62.2, 11.6, 17);                  // vers l'îlot caché (étoile 1)
pad(7.6, 62.2, 11.6, 1.7);                    // (son socle)
spring(-4.2, 44.5, 12.2, 15);                 // sur l'île des Ballons, pour jouer

// 2. Le Courant d'Air : plates-formes qui glissent, ascenseur, colonne de vent
export const movers = [];
const mover = (kind, def) => {
  const m = Object.assign({ kind, r: 2.3 }, def);
  m.col = cyl(m.x0, m.z0, m.r, m.y0 - 1, m.y0, { kind: 'pad', moving: true, mover: m, dx: 0, dz: 0 });
  movers.push(m);
  return m;
};
mover('slide', { x0: 0, z0: 39, y0: 12.4, ax: 6.5, az: 0, ay: 0, period: 6.5, phase: 0 });
mover('lift', { x0: 0, z0: 29.5, y0: 12.6, ax: 0, az: 0, ay: 4.2, period: 5.5, phase: 0 });
// un nuage qui fait l'aller-retour, sur le côté (raccourci)
mover('slide', { x0: -7, z0: 24, y0: 15.6, ax: 0, az: 4, ay: 0, period: 5, phase: 1.5, r: 2, look: 'cloud' });

/** Position d'une plate-forme mobile au temps t. */
export function moverAt(m, t) {
  if (m.kind === 'orbit') {
    const a = m.a0 + t * m.w;
    return { x: m.cx + Math.cos(a) * m.R, z: m.cz + Math.sin(a) * m.R, y: m.y0 };
  }
  const k = Math.sin((t / m.period) * Math.PI * 2 + m.phase);
  return { x: m.x0 + m.ax * k, z: m.z0 + m.az * k, y: m.y0 + m.ay * (k * 0.5 + 0.5) };
}

// Colonnes de vent : on y monte en planant (ou en sautant dedans)
export const FINISH = { x: 0, z: -95.5 };   // l'arche d'arrivée (chrono)
export const UPDRAFTS = [
  { x: 0, z: 11, r: 2.8, y0: 6, y1: 27, lift: 50 },
  { x: 0, z: -90, r: 2.6, y0: 18, y1: 37, lift: 46 },          // au pied de l'île du Trophée
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
export const spiral = [];
for (let i = 0; i < 11; i++) {
  const a = Math.PI / 2 + i * (3 * Math.PI / 10);   // départ côté sud, arrivée côté nord (vers le Trophée)
  const x = TOWER.x + Math.cos(a) * 6, z = TOWER.z + Math.sin(a) * 6, top = 21.2 + i * 1.45;
  spiral.push(pad(x, z, top, 1.75, i % 4 === 3 ? 'crystal' : 'rock'));
}

// Points de passage (drapeaux) : on y revient après une chute
export const CHECKPOINTS = [
  { id: 0, x: 0, z: 100, name: 'Départ' },
  { id: 1, x: 0, z: 52, name: 'Île des Ballons' },
  { id: 2, x: 0, z: 4, name: 'Île du Moulin' },
  { id: 3, x: 0, z: -31, name: 'Île de l\'Écho' },
  { id: 4, x: 0, z: -65.5, name: 'Manège des Nuages', y: 19.8 },
  { id: 5, x: 0, z: -97, name: 'Île du Trophée' },
].map(c => Object.assign(c, { y: c.y === undefined ? heightAt(c.x, c.z) : c.y }));

// ---------------------------------------------------------------------------
// Support : sol le plus haut sous un point
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
/** Met les plates-formes mobiles à leur place au temps t (et note leur déplacement). */
export function updateMovers(t) {
  for (const m of movers) {
    const p = moverAt(m, t), c = m.col;
    c.dx = c.x === undefined ? 0 : p.x - c.x; c.dz = p.z - c.z;
    c.x = p.x; c.z = p.z; c.y1 = p.y; c.y0 = p.y - 1;
  }
}
updateMovers(0);
for (const m of movers) { m.col.dx = 0; m.col.dz = 0; }

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
// départ
lineTo(0, 92, 0, 84, 5);
arc(0, 96, 9, 8, Math.PI * 0.15, Math.PI * 0.85, 11.2);
// pas nuageux : une pièce au-dessus de chaque pierre, et entre deux
for (const p of pads.slice(0, 4)) at(p.x, p.z);
pts.push({ x: 1.6, z: 75.3, y: 12.4 }, { x: 1.1, z: 69.8, y: 12.9 }, { x: 0.6, z: 64.2, y: 13.3 });
// au-dessus du ressort vers l'îlot
for (let i = 0; i < 4; i++) pts.push({ x: 7.6 + i * 2.6, z: 62.2 + i * 1.0, y: 15 + i * 1.2 });
// île des Ballons
arc(0, 50, 5.5, 8, 0, Math.PI * 2 - 0.6, 13.3);
// courant d'air
lineTo(-5, 39, 5, 39, 5, 1.3);
for (let i = 0; i < 4; i++) pts.push({ x: 0, z: 29.5, y: 14.2 + i * 1.3 });
at(0, 20); at(-1.8, 21.5); at(1.8, 21.5);
for (let i = 0; i < 5; i++) pts.push({ x: 0, z: 13 - i * 0.2, y: 19 + i * 1.6 });   // dans la colonne de vent
// île du Moulin
arc(0, 2, 5.6, 7, Math.PI * 0.1, Math.PI * 0.9, 19.3);
// pont des copains (au-dessus de là où il sortira)
for (let i = 0; i < 6; i++) pts.push({ x: 0, z: -8.5 - i * 3.1, y: 19.4 });
// nuages fragiles
for (const c of crumbles) at(c.x, c.z, 1.2);
// île de l'Écho
arc(0, -34, 6, 9, -Math.PI * 0.9, Math.PI * 0.4, 19.3);
// manège
arc(CAROUSEL.cx, CAROUSEL.cz, CAROUSEL.R, 8, 0, Math.PI * 2 * 7 / 8, CAROUSEL.y0 + 1.2);
// spirale
for (const p of spiral) at(p.x, p.z);
// île du Trophée
arc(0, -102, 6.5, 10, 0, Math.PI * 2 - 0.4, 35.3);
// colonne de vent du trophée
for (let i = 0; i < 4; i++) pts.push({ x: 0, z: -90, y: 25 + i * 2.4 });
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'q' + i, x: p.x, y: p.y, z: p.z }));
export const balls = [];

const nest = ISLANDS.find(I => I.id === 'nest');
export const medals = [
  { id: 'm_s1', x: nest.x, z: nest.z, y: nest.top + 1.5, label: 'L\'îlot du ressort', visible: true },
  { id: 'm_s2', x: UPDRAFTS[0].x, z: UPDRAFTS[0].z, y: 26.5, label: 'Tout en haut du courant d\'air', visible: true },
  { id: 'm_s3', x: 14.6, z: -17.6, y: 22.2, label: 'Au-dessus des nuages fragiles', visible: true },
  { id: 'm_s4', x: PILLAR.x, z: PILLAR.z, y: PILLAR.top + 1.5, label: 'Le Tremplin des Copains', visible: true },
  { id: 'm_s5', x: TOWER.x, z: TOWER.z, y: TOWER.top + 1.5, label: 'Le sommet de la Tour du Vent', visible: true },
  { id: 'm_goal', x: 0, z: -104, y: 34 + 0.35 + 1.8, label: 'Le Trophée du Ciel', visible: true },
];

export const crates = [
  { id: 'c1', x: 4, z: 47, content: 'heart' },
  { id: 'c2', x: -5, z: 6, content: 'heart' },
  { id: 'c3', x: -6, z: -30, content: 'heart' },
  { id: 'c4', x: 5.5, z: -98, content: 'heart' },
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

export const signs = [
  { x: 3.6, z: 86, text: ['Les Îles du Ciel', 'Sautez de pierre en pierre jusqu\'au Trophée !', 'Les drapeaux gardent votre place si vous tombez.'] },
  { x: -3.5, z: 44, text: ['Le Courant d\'Air', 'Les plates-formes bougent : attendez le bon moment.', 'Dans la colonne de vent, planez : elle vous porte !'] },
  { x: 0, z: 7.4, text: ['Le Pont des Copains', 'Appuyez ensemble sur les deux dalles :', 'le pont sortira pour de bon !', 'Seul ? Une dalle le sort quelques secondes. Courez !'] },
  { x: -3.5, z: -27.5, text: ['Le Tremplin des Copains', 'Sautez sur la tête d\'un ami pour monter plus haut !', '(ou essayez le champignon…)'] },
];

export const START = { x: 0, z: 104, y: heightAt(0, 104), yaw: Math.PI };
export const PATHS = [[[0, 108], [0, 84]], [[0, 56], [0, 44]], [[0, 9], [0, -5]], [[0, -27], [0, -42]], [[0, -93], [0, -110]]];
export const CRYSTALS = [[-9, 92, 0x7ad8ff], [9.5, 99, 0xff8ad8], [-5.5, 2, 0xb08aff], [6.5, -30, 0x7ad8ff], [-7, -104, 0xffd060], [7, -106, 0xff8ad8]];
export const ruins = [];

// Portail de retour vers le Parc, sur l'île du départ
export const PORTALS = [{ x: 8.5, z: 103, to: 1 }];

// Arbres en fleurs sur les grandes îles
export const trees = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const want = { start: 7, balloon: 2, mill: 2, echo: 3, goal: 3 };
  for (const I of ISLANDS) {
    const n = want[I.id] || 0;
    let guard = 0, made = 0;
    while (made < n && guard++ < 400) {
      const a = rnd() * Math.PI * 2, d = I.r * (0.55 + rnd() * 0.32);
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      if (Math.abs(x) < 3.2) continue;                                   // l'allée centrale reste libre
      if (colliders.some(c => !c.off && inside(c, x, z, 1.6))) continue;
      if (Math.hypot(x - npcs.mamie.x, z - npcs.mamie.z) < 3) continue;
      if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
      if (PLATES.some(p => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
      if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 2)) continue;
      if (PORTALS.some(p => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      const s = 0.75 + rnd() * 0.35;
      trees.push({ x, z, y: heightAt(x, z), s, h: 5.5 + rnd() * 2 });
      made++;
    }
  }
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}

/** Mini-carte : îles et plates-formes. */
export function mapColor(x, z) {
  if (heightAt(x, z) > 0) return [122, 208, 90];
  for (const c of colliders) {
    if (c.kind === 'tree' || c.moving || !inside(c, x, z, 0)) continue;
    if (c.kind === 'bridge') return [196, 150, 96];
    if (!c.off) return c.kind === 'cloud' ? [244, 244, 255] : [200, 184, 160];
  }
  return [92, 160, 220];
}
export { clamp as _clamp };
