/*
 * Matcha & Ainu — Niveau 1 : « Le Parc des Toutous » (et le carrefour des mondes).
 * Un grand parc (≈ 360 m de large) au bord de la mer. Données pures (aucune
 * dépendance) : relief, obstacles, objets, personnages. Utilisé par le jeu
 * (park.js, parkkit.js) et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   au sud, l'Entrée du parc : le départ, Mamie Labrador et la niche de Biscotte,
 *   les portails vers les autres mondes, la fontaine et le piédestal des balles ;
 *   au centre, la colline du Grand Chêne (on grimpe ses branches en spirale) ;
 *   autour : le kiosque à musique (nord-ouest), le manège (nord-est), la mare aux
 *   canards et ses pédalos-cygnes (ouest), le terrain d'agility de Gaston (est),
 *   l'aire de jeux et son bac à sable (sud-ouest), la prairie du pique-nique (sud-est) ;
 *   un petit train fait le tour du parc (4 gares) ;
 *   plus loin : le belvédère et sa longue-vue (nord), le labyrinthe fleuri (nord-ouest),
 *   la cabane perchée (nord-est), le Rocher aux Lapins (est), les cerisiers en fleurs
 *   (sud-est), le jardin secret (sud-ouest, caché derrière les haies), la crique (ouest)
 *   et le Bois des Écureuils (ouest-nord-ouest).
 *
 * Les 5 Médailles Patounes (les identifiants des anciennes sauvegardes sont gardés) :
 *   m_puppy : Biscotte a disparu → son collier près de la mare → son doudou dans le bac à
 *             sable (on creuse) → son jouet sur le manège → Biscotte au cœur du labyrinthe ;
 *             on le ramène à Mamie (la médaille était derrière la niche).
 *   m_cats  : 6 chats farceurs éparpillés dans le parc ; la médaille apparaît au kiosque.
 *   m_crate : la course d'agility de Gaston (8 obstacles dans l'ordre, chronométrée).
 *   m_balls : 5 balles de tennis cachées loin des chemins, à rapporter au piédestal.
 *   m_tree  : 6 lanternes à rallumer aux quatre coins du parc ; la médaille s'allume
 *             alors tout en haut du Grand Chêne.
 */

export const ID = 1;
export const NAME = 'Le Parc des Toutous';
export const SAVE_KEY = 'dogfight.aventure.niveau1';
export const CAT_PLACE = 'dans le parc';
export const COLLECT_NAME = 'os dorés';
export const WATER_Y = 0;
export const WORLD = 400;               // côté du monde (m)
export const RADAR = 80;                // demi-côté de la mini-carte (m)
export const ISLAND_R = 182;
export const GRASS_K = 1.5;
// Ambiance : soleil doré de fin de matinée, en contre-jour vers le nord (rayons à travers les arbres)
export const SKY = { top: 0x4a90e2, horizon: 0xf4e4c6, bottom: 0xd6e6dc, sunDir: [-0.34, 0.4, -0.66] };
export const LIGHT = { hemi: [0xe6f0ff, 0x8a7050, 0.75], sun: [0xffe0b0, 3.0], fog: [95, 300] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.15, big: 2.0, small: 1.4, bushes: 1 };
// Portails magiques, de part et d'autre de l'arche d'entrée (près du départ, sur un sol libre)
export const PORTALS = [{ x: -7.6, z: 36.5, to: 2 }, { x: 7.6, z: 36.5, to: 4 }, { x: -10.5, z: 40.5, to: 3 }, { x: 10.5, z: 40.5, to: 5 },
  { x: -13.5, z: 44.5, to: 6 }, { x: 13.5, z: 44.5, to: 7 }, { x: -13.5, z: 36.5, to: 8 }];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function gauss(x, z, cx, cz, r, h) { return h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)); }
const flatten = (h, x, z, c, r, y) => { const w = 1 - smooth(r * 0.6, r, Math.hypot(x - c.x, z - c.z)); return h * (1 - w) + y * w; };
const flattenRect = (h, x, z, c, hw, hd, edge, y) => { const d = Math.max(Math.abs(x - c.x) - hw, Math.abs(z - c.z) - hd); const w = 1 - smooth(0, edge, d); return h * (1 - w) + y * w; };

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------
export const SPOTS = {
  spawn: { x: 0, z: 50 },
  mamie: { x: -6, z: 45 },
  tree: { x: 0, z: 0 },
  lake: { x: -72, z: -2 },              // (le moteur s'en sert pour le bruit de l'eau)
};
export const POND = { x: -72, z: -2, r: 18 };
export const ISLET = { x: -78, z: -6, r: 3.2, top: 1.1 };
export const JETTY = { x0: -51, x1: -59.5, z: -2, w: 2, top: 1.05 };
export const KIOSK = { x: -32, z: -38, r: 4.6 };
export const CAROUSEL = { x: 34, z: -36, r: 5.2 };
export const AGILITY = { x: 70, z: 8, hw: 23, hd: 15 };
export const PLAYGROUND = { x: -44, z: 70, r: 16 };
export const SANDPIT = { x: -37, z: 79, r: 6.2 };
export const PICNIC = { x: 46, z: 70, r: 14 };
export const LOOKOUT = { x: 0, z: -148 };
export const MAZE = { x: -118, z: -100, n: 7, cell: 4.6 };
export const TREEHOUSE = { x: 120, z: -92 };
export const RABBIT_ROCK = { x: 150, z: 4 };
export const CHERRY = { x: 118, z: 102 };
export const GARDEN = { x: -104, z: 118, r: 9.5 };
export const COVE = { x: -156, z: 44 };
export const WOODS = { x: -142, z: -40 };
export const FOUNTAIN = { x: 0, z: 68, r: 3 };
export const PEDESTAL = { x: 11, z: 58 };
export const KENNEL = { x: SPOTS.mamie.x - 3, z: SPOTS.mamie.z - 1 };
export const GASTON = { x: 47, z: 4 };

/** Relief naturel (avant les lieux aplanis). */
function baseHeight(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  let h = 2.4 * (1 - smooth(0.86, 1.0, r)) - 3.2 * smooth(0.95, 1.2, r);
  const inland = 1 - smooth(0.78, 0.96, r);
  h += (0.55 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.045 - 0.2) + 0.35 * Math.sin(x * 0.027 - z * 0.033 + 1.1)) * inland;
  // la colline du Grand Chêne, celle du belvédère, et quelques bosses
  h += gauss(x, z, 0, 0, 16, 5);
  h += gauss(x, z, LOOKOUT.x, LOOKOUT.z, 26, 8);
  h += gauss(x, z, WOODS.x, WOODS.z, 24, 1.6) + gauss(x, z, TREEHOUSE.x, TREEHOUSE.z, 22, 1.8) + gauss(x, z, RABBIT_ROCK.x - 6, RABBIT_ROCK.z, 18, 1.4)
    + gauss(x, z, -70, -60, 22, 1.4) + gauss(x, z, 80, -60, 22, 1.2) + gauss(x, z, -20, 110, 20, 1.0) + gauss(x, z, 90, 50, 18, 1.1);
  // la crique : la plage entre dans les terres
  h -= gauss(x, z, COVE.x - 18, COVE.z, 20, 2.6);
  return h;
}
const LOOK_Y = baseHeight(LOOKOUT.x, LOOKOUT.z);

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  // la mare aux canards
  h -= 6.8 * Math.exp(-((x - POND.x) ** 2 + (z - POND.z) ** 2) / (POND.r * POND.r * 0.8));
  // lieux aplanis
  h = flatten(h, x, z, SPOTS.spawn, 24, 2.5);
  h = flatten(h, x, z, PLAYGROUND, 19, 2.45);
  h = flatten(h, x, z, PICNIC, 17, 2.5);
  h = flattenRect(h, x, z, AGILITY, AGILITY.hw, AGILITY.hd, 7, 2.5);
  h = flatten(h, x, z, KIOSK, 10, 3.0);
  h = flatten(h, x, z, CAROUSEL, 11, 2.9);
  h = flattenRect(h, x, z, MAZE, MAZE.n * MAZE.cell / 2 + 2, MAZE.n * MAZE.cell / 2 + 3.5, 6, 2.6);
  h = flatten(h, x, z, GARDEN, 14, 2.4);
  h = flatten(h, x, z, LOOKOUT, 11, LOOK_Y);
  h = flatten(h, x, z, CHERRY, 18, 2.6);
  return h;
}

/** Points couverts par l'eau (pas d'herbe ni de fleurs). */
export function inWater(x, z, m) { return heightAt(x, z) < WATER_Y + (m || 0); }
/** Pas d'herbe haute : bac à sable, terrain d'agility (gazon tondu), dalles. */
export function noGrass(x, z) {
  if (Math.hypot(x - SANDPIT.x, z - SANDPIT.z) < SANDPIT.r + 0.5) return true;
  if (Math.abs(x - AGILITY.x) < AGILITY.hw - 1 && Math.abs(z - AGILITY.z) < AGILITY.hd - 1) return true;
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 2.5) return true;
  if (Math.hypot(x - KIOSK.x, z - KIOSK.z) < KIOSK.r + 0.6 || Math.hypot(x - CAROUSEL.x, z - CAROUSEL.z) < CAROUSEL.r + 0.6) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Obstacles (index en grille pour aller vite dans un grand monde)
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Le Grand Chêne : tronc + escalier en spirale + plate-forme du sommet
const treeBase = heightAt(0, 0);
export const TREE = { x: 0, z: 0, base: treeBase, trunkR: 2.2, height: 0 };
export const treeSteps = [];
for (let i = 0; i < 9; i++) {
  const a = Math.PI * 0.5 + i * 0.78;
  const x = Math.cos(a) * 3.7, z = Math.sin(a) * 3.7;
  const top = treeBase + 1.7 + i * 1.75;
  treeSteps.push({ x, z, top, a });
  cyl(x, z, 1.5, top - 0.5, top, { kind: 'branch' });
}
export const TREE_TOP = treeBase + 1.7 + 9 * 1.75;
TREE.height = TREE_TOP - 0.6 - treeBase;
cyl(0, 0, TREE.trunkR, treeBase - 2, TREE_TOP - 0.6, { kind: 'trunk' });
cyl(0, 0, 4.6, TREE_TOP - 0.6, TREE_TOP, { kind: 'canopy' });

// L'arche d'entrée (ruines anciennes, comme avant) : on peut marcher sur le linteau
export const ruins = [];
{
  const pillar = (x, z, h, broken) => { const g = heightAt(x, z); ruins.push({ type: 'pillar', x, z, y: g, h, broken: !!broken }); cyl(x, z, 0.6, g - 1, g + h, { kind: 'rock' }); };
  pillar(-2.9, 30, 4.2); pillar(2.9, 30, 4.2);
  ruins.push({ type: 'arch', x: 0, z: 30, y: heightAt(0, 30) + 4.2, span: 5.8 });
  box(0, 30, 5.8 + 1.4, 1.2, heightAt(0, 30) + 4.1, heightAt(0, 30) + 5.25, { kind: 'rock' });
  // vieilles colonnes le long du chemin du belvédère
  pillar(-3.8, -40, 3.2); pillar(3.8, -46, 1.6, true); pillar(-3.8, -60, 2.4, true); pillar(3.8, -70, 3.4);
}

// La niche de Biscotte (à côté de Mamie) : on peut sauter sur le toit
{ const g = heightAt(KENNEL.x, KENNEL.z); cyl(KENNEL.x, KENNEL.z, 1.3, g - 1, g + 2.1, { kind: 'rock' }); }
// La fontaine de l'entrée (on peut sauter sur la margelle)
FOUNTAIN.y = heightAt(FOUNTAIN.x, FOUNTAIN.z);
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r, FOUNTAIN.y - 1, FOUNTAIN.y + 0.65, { kind: 'rock' });
cyl(FOUNTAIN.x, FOUNTAIN.z, 0.7, FOUNTAIN.y, FOUNTAIN.y + 1.9, { kind: 'rock' });
// Le piédestal des balles
PEDESTAL.y = heightAt(PEDESTAL.x, PEDESTAL.z);
cyl(PEDESTAL.x, PEDESTAL.z, 1.0, PEDESTAL.y - 1, PEDESTAL.y + 0.9, { kind: 'rock' });

// --- La mare : ponton, îlot ----------------------------------------------------------
box((JETTY.x0 + JETTY.x1) / 2, JETTY.z, JETTY.x0 - JETTY.x1, JETTY.w, -2, JETTY.top, { kind: 'plank' });
cyl(ISLET.x, ISLET.z, ISLET.r, -3, ISLET.top, { kind: 'islet', shore: true });
// deux pédalos-cygnes amarrés au ponton
export const BOATS = [{ id: 0, x: -58.5, z: -4.6, yaw: -Math.PI / 2 }, { id: 1, x: -58.5, z: 0.6, yaw: -Math.PI / 2 }];

// --- Le kiosque à musique : plancher, 8 colonnes, toit (on y monte par les caisses de la fanfare)
KIOSK.y = heightAt(KIOSK.x, KIOSK.z);
KIOSK.floor = KIOSK.y + 0.8;
KIOSK.roof = KIOSK.y + 5.0;
cyl(KIOSK.x, KIOSK.z, KIOSK.r, KIOSK.y - 1, KIOSK.floor, { kind: 'plank' });
for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; cyl(KIOSK.x + Math.cos(a) * (KIOSK.r - 0.45), KIOSK.z + Math.sin(a) * (KIOSK.r - 0.45), 0.18, KIOSK.floor, KIOSK.roof - 0.5, { kind: 'post', solid: true }); }
cyl(KIOSK.x, KIOSK.z, KIOSK.r + 0.5, KIOSK.roof - 0.5, KIOSK.roof, { kind: 'roof' });
// les caisses de la fanfare, en escalier jusqu'au bord du toit
export const KIOSK_STEPS = [[1.25, 6.0], [2.45, 6.4], [3.65, 6.2]].map(([top, d], i) => {
  const a = -0.35 + i * 0.36, x = KIOSK.x + Math.cos(a) * d, z = KIOSK.z + Math.sin(a) * d, g = heightAt(x, z);
  const s = { x, z, w: 1.5, d: 1.5, top: g + top, y: g };
  s.col = box(x, z, s.w, s.d, g - 0.5, s.top, { kind: 'plank' });
  return s;
});

// --- Le manège : plate-forme tournante, colonne centrale
CAROUSEL.y = heightAt(CAROUSEL.x, CAROUSEL.z);
CAROUSEL.floor = CAROUSEL.y + 0.55;
cyl(CAROUSEL.x, CAROUSEL.z, CAROUSEL.r, CAROUSEL.y - 1, CAROUSEL.floor, { kind: 'plank' });
cyl(CAROUSEL.x, CAROUSEL.z, 0.9, CAROUSEL.floor, CAROUSEL.floor + 4.2, { kind: 'post', solid: true });

// --- L'aire de jeux : tour du toboggan (3 marches), balançoires, bac à sable
PLAYGROUND.y = heightAt(PLAYGROUND.x, PLAYGROUND.z);
export const SLIDE = { x: -53, z: 62, w: 2.6, d: 2.6, top: PLAYGROUND.y + 3.6, len: 6.5, dir: 1 };   // le toboggan descend vers +x
box(SLIDE.x, SLIDE.z, SLIDE.w, SLIDE.d, PLAYGROUND.y - 0.5, SLIDE.top, { kind: 'plank' });
export const SLIDE_STEPS = [0.9, 1.8, 2.7].map((top, i) => {
  const s = { x: SLIDE.x - 2.3, z: SLIDE.z + 3.6 - i * 1.25, w: 1.4, d: 1.2, top: PLAYGROUND.y + top };
  s.col = box(s.x, s.z, s.w, s.d, PLAYGROUND.y - 0.5, s.top, { kind: 'plank' });
  return s;
});
export const SWINGS = { x: -33, z: 61, yaw: 0 };
for (const sx of [-2.4, 2.4]) cyl(SWINGS.x + sx, SWINGS.z, 0.2, PLAYGROUND.y - 0.5, PLAYGROUND.y + 3.0, { kind: 'post', solid: true });
// petit trou dans le bac à sable (une piste de Biscotte, à creuser)
export const DIG = { x: SANDPIT.x + 1.5, z: SANDPIT.z - 1 };

// --- Le terrain d'agility de Gaston ----------------------------------------------------
const AG = (x, z) => heightAt(x, z);
/** Les 8 obstacles, dans l'ordre. type : hurdle (haie), tunnel, weave (slalom), seesaw (bascule), tire (pneu), table, finish. */
export const COURSE = [
  { type: 'hurdle', x: 57, z: -1, ax: 'x', dir: 1, half: 1.6, name: 'la haie' },
  { type: 'tunnel', x: 64.5, z: -1, ax: 'x', dir: 1, half: 1.2, len: 5, name: 'le tunnel' },
  { type: 'weave', x: 71, z: -1, ax: 'x', dir: 1, half: 2.4, n: 6, gap: 1.8, name: 'le slalom' },
  { type: 'seesaw', x: 82, z: 10, ax: 'x', dir: -1, half: 0.6, len: 6.4, name: 'la bascule' },
  { type: 'tire', x: 73, z: 10, ax: 'x', dir: -1, half: 1.0, name: 'le pneu' },
  { type: 'hurdle', x: 66, z: 10, ax: 'x', dir: -1, half: 1.6, name: 'la grande haie' },
  { type: 'table', x: 60, z: 19, w: 2.4, name: 'la table' },
  { type: 'finish', x: 53, z: 19, ax: 'x', dir: -1, half: 2.6, name: 'l\'arrivée' },
];
for (const o of COURSE) {
  const g = AG(o.x, o.z); o.y = g;
  if (o.type === 'hurdle') {
    o.bar = o.type === 'hurdle' ? g + 0.7 : 0;
    box(o.x, o.z, 0.14, o.half * 2, g + 0.25, o.bar, { kind: 'bar', solid: true });
    for (const s of [-1, 1]) cyl(o.x, o.z + s * (o.half + 0.15), 0.12, g - 0.5, g + 1.1, { kind: 'post', solid: true });
  } else if (o.type === 'tunnel') {
    for (const s of [-1, 1]) box(o.x, o.z + s * (o.half + 0.12), o.len, 0.24, g - 0.5, g + 1.6, { kind: 'wall', solid: true });
  } else if (o.type === 'weave') {
    o.poles = [];
    for (let i = 0; i < o.n; i++) { const px = o.x + i * o.gap; o.poles.push({ x: px, z: o.z }); cyl(px, o.z, 0.11, g - 0.5, g + 1.3, { kind: 'post', solid: true }); }
    o.x = o.x + (o.n - 1) * o.gap + 1.2;       // la porte : juste après le dernier piquet
  } else if (o.type === 'seesaw') {
    o.top = g + 0.5;
    o.col = box(o.x - o.dir * o.len / 2 + o.dir * 0.2, o.z, o.len, 1.1, g - 0.5, o.top, { kind: 'plank', seesaw: true });
    o.cx = o.col.x;
  } else if (o.type === 'tire') {
    o.cy = g + 1.05;
    for (const s of [-1, 1]) cyl(o.x, o.z + s * 1.25, 0.13, g - 0.5, g + 2.2, { kind: 'post', solid: true });
  } else if (o.type === 'table') {
    o.top = g + 0.75;
    o.col = box(o.x, o.z, o.w, o.w, g - 0.5, o.top, { kind: 'plank', table: true });
  }
}
export const PODIUM = { x: 49.5, z: 13, w: 2.2, top: AG(49.5, 13) + 0.8 };
box(PODIUM.x, PODIUM.z, PODIUM.w, PODIUM.w, PODIUM.top - 1.5, PODIUM.top, { kind: 'plank' });
{ const g = AG(PODIUM.x, PODIUM.z) - 0.3, h = PODIUM.top - g; for (const [dz, k] of [[0.95, 0.6], [-0.95, 0.35]]) box(PODIUM.x, PODIUM.z + dz * PODIUM.w, PODIUM.w * 0.9, PODIUM.w, g - 1, g + h * k, { kind: 'plank' }); }
export const AGILITY_START = { x: 52.5, z: -1 };
/** Temps permis pour la course selon le mode (secondes ; 0 = sans chrono). */
export const AGILITY_TIME = { promenade: 0, aventure: 90, defi: 60 };

// --- Le belvédère : estrade, longue-vue, banc ------------------------------------------
LOOKOUT.y = heightAt(LOOKOUT.x, LOOKOUT.z);
export const DECK = { x: LOOKOUT.x, z: LOOKOUT.z - 1, w: 7, d: 5, top: LOOKOUT.y + 0.45 };
box(DECK.x, DECK.z, DECK.w, DECK.d, LOOKOUT.y - 1, DECK.top, { kind: 'plank' });
export const TELESCOPE = { x: LOOKOUT.x + 1.5, z: LOOKOUT.z - 2.8 };
cyl(TELESCOPE.x, TELESCOPE.z, 0.3, DECK.top, DECK.top + 1.4, { kind: 'post', solid: true });

// --- La cabane perchée : grand arbre, marches en spirale, plate-forme -----------------
TREEHOUSE.y = heightAt(TREEHOUSE.x, TREEHOUSE.z);
export const TH_STEPS = [];
for (let i = 0; i < 6; i++) {
  const a = 2.2 + i * 0.95, x = TREEHOUSE.x + Math.cos(a) * 3.1, z = TREEHOUSE.z + Math.sin(a) * 3.1;
  const top = TREEHOUSE.y + 1.4 + i * 1.3;
  TH_STEPS.push({ x, z, top, a, r: 1.15 });
  cyl(x, z, 1.15, top - 0.4, top, { kind: 'branch' });
}
export const TH_DECK = { x: TREEHOUSE.x, z: TREEHOUSE.z, r: 3.4, top: TREEHOUSE.y + 1.4 + 6 * 1.3 };
cyl(TREEHOUSE.x, TREEHOUSE.z, 1.3, TREEHOUSE.y - 1, TH_DECK.top - 0.4, { kind: 'trunk' });
cyl(TH_DECK.x, TH_DECK.z, TH_DECK.r, TH_DECK.top - 0.45, TH_DECK.top, { kind: 'plank' });
// la petite maison sur la plate-forme (un peu à l'ouest du tronc)
cyl(TH_DECK.x - 1.93, TH_DECK.z - 0.7, 0.85, TH_DECK.top, TH_DECK.top + 2.2, { kind: 'wall', solid: true });

// --- Le Rocher aux Lapins : des blocs en escalier ---------------------------------------
export const RABBIT_ROCKS = [[-6, 4, 1.7, 1.2], [-3.5, 1.5, 1.6, 2.4], [-1, -1, 1.7, 3.6], [2, -2.5, 2.2, 4.8]].map(([dx, dz, r, h]) => {
  const x = RABBIT_ROCK.x + dx, z = RABBIT_ROCK.z + dz, g = heightAt(x, z);
  const rk = { x, z, r, top: g + h, y: g };
  rk.col = cyl(x, z, r, g - 1, rk.top, { kind: 'rock' });
  return rk;
});

// --- La crique : un rocher plat près de l'eau -------------------------------------------
export const COVE_ROCK = { x: COVE.x - 5, z: COVE.z - 4, r: 1.6 };
COVE_ROCK.y = heightAt(COVE_ROCK.x, COVE_ROCK.z); COVE_ROCK.top = Math.max(COVE_ROCK.y, 0) + 1.2;
cyl(COVE_ROCK.x, COVE_ROCK.z, COVE_ROCK.r, -2, COVE_ROCK.top, { kind: 'rock', shore: true });
export const ROWBOAT = { x: COVE.x - 3, z: COVE.z + 9, yaw: 0.6 };

// --- Le labyrinthe fleuri : haies générées (toujours le même), Biscotte au centre --------
export const HEDGES = [];
export const MAZE_INFO = (() => {
  const N = MAZE.n, C = MAZE.cell, x0 = MAZE.x - N * C / 2, z0 = MAZE.z - N * C / 2;
  // passages : DFS déterministe depuis l'entrée (au sud, colonne du milieu)
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const open = new Set(), seen = new Set();
  const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const id = (c, r) => c + ',' + r;
  const mid = (N - 1) / 2;
  const stack = [[mid, N - 1]]; seen.add(id(mid, N - 1));
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(id(a, b)));
    if (!nb.length) { stack.pop(); continue; }
    const [a, b] = nb[Math.floor(rnd() * nb.length)];
    open.add(key(id(c, r), id(a, b))); seen.add(id(a, b)); stack.push([a, b]);
  }
  const T = 0.9, H = 2.2;
  const wall = (x, z, w, d) => { const g = Math.max(heightAt(x, z), 2.2); HEDGES.push({ x, z, w, d, y: g, h: H }); box(x, z, w, d, g - 1, g + H, { kind: 'hedge', solid: true }); };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    // mur à l'est de (c, r) et au sud de (c, r)
    if (c < N - 1 && !open.has(key(id(c, r), id(c + 1, r)))) wall(x0 + (c + 1) * C, z0 + (r + 0.5) * C, T, C + T);
    if (r < N - 1 && !open.has(key(id(c, r), id(c, r + 1)))) wall(x0 + (c + 0.5) * C, z0 + (r + 1) * C, C + T, T);
  }
  // le tour (avec l'entrée au sud, au milieu)
  for (let c = 0; c < N; c++) {
    wall(x0 + (c + 0.5) * C, z0, C + T, T);
    if (c !== mid) wall(x0 + (c + 0.5) * C, z0 + N * C, C + T, T);
  }
  for (let r = 0; r < N; r++) { wall(x0, z0 + (r + 0.5) * C, T, C + T); wall(x0 + N * C, z0 + (r + 0.5) * C, T, C + T); }
  const cellAt = (c, r) => ({ x: x0 + (c + 0.5) * C, z: z0 + (r + 0.5) * C });
  // impasses (3 murs) : la plus loin de l'entrée et du centre garde une lanterne
  const deg = (c, r) => [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => open.has(key(id(c, r), id(a, b)))).length;
  const ends = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (deg(c, r) === 1 && !(c === mid && r === mid) && !(c === mid && r === N - 1)) ends.push({ c, r, d: Math.hypot(c - mid, r - mid) + Math.hypot(c - mid, r - (N - 1)) });
  ends.sort((a, b) => b.d - a.d);
  return { x0, z0, N, C, mid, open, cellAt, center: cellAt(mid, mid), entrance: { x: cellAt(mid, N - 1).x, z: z0 + N * C + 2.5 }, ends: ends.map(e => cellAt(e.c, e.r)) };
})();

// --- Le jardin secret : un cercle de haies avec une seule petite ouverture, derrière les buissons
export const GARDEN_GAP = { a: Math.PI * 0.75 };      // l'ouverture regarde vers la mer (sud-ouest)
{
  const n = 22, R = GARDEN.r;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    const da = Math.abs(((a - GARDEN_GAP.a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    if (da < 0.2) continue;
    const x = GARDEN.x + Math.cos(a) * R, z = GARDEN.z + Math.sin(a) * R, g = heightAt(x, z);
    HEDGES.push({ x, z, w: 3.0, d: 1.0, y: g, h: 2.4, yaw: -a + Math.PI / 2, round: true });
    cyl(x, z, 1.45, g - 1, g + 2.4, { kind: 'hedge', solid: true });
  }
  GARDEN.y = heightAt(GARDEN.x, GARDEN.z);
  cyl(GARDEN.x, GARDEN.z, 1.4, GARDEN.y - 1, GARDEN.y + 0.7, { kind: 'rock' });   // la petite fontaine du jardin
}

// --- Le petit train : une boucle autour du parc, 4 gares ----------------------------------
const TRACK_CTRL = [];
for (let k = 0; k < 16; k++) {
  const a = k / 16 * Math.PI * 2;            // 0 = est, π/2 = sud (+z)
  let R = 121;
  const south = Math.cos(a - Math.PI / 2);   // 1 au sud
  if (south > 0.6) R = 121 - (south - 0.6) / 0.4 * 26;
  TRACK_CTRL.push([Math.cos(a) * R, Math.sin(a) * R]);
}
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export const TRACK = (() => {
  const pts = [], n = TRACK_CTRL.length, per = 24;
  for (let i = 0; i < n; i++) {
    const p0 = TRACK_CTRL[(i - 1 + n) % n], p1 = TRACK_CTRL[i], p2 = TRACK_CTRL[(i + 1) % n], p3 = TRACK_CTRL[(i + 2) % n];
    for (let k = 0; k < per; k++) { const t = k / per; pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) }); }
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    p.s = s; p.len = Math.hypot(q.x - p.x, q.z - p.z); s += p.len;
    p.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    p.y = Math.max(heightAt(p.x, p.z), 1.2);
  }
  // rails posés en douceur (moyenne glissante de la hauteur)
  const ys = pts.map((p, i) => { let a = 0; for (let k = -6; k <= 6; k++) a += pts[(i + k + pts.length) % pts.length].y; return a / 13; });
  pts.forEach((p, i) => { p.y = ys[i] + 0.12; });
  return { pts, total: s };
})();
/** Position (x, y, z, yaw) sur la voie à l'abscisse s (m). */
export function trackAt(s) {
  const P = TRACK.pts, T = TRACK.total;
  s = ((s % T) + T) % T;
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].s <= s) lo = m; else hi = m - 1; }
  const p = P[lo], q = P[(lo + 1) % P.length], k = p.len ? (s - p.s) / p.len : 0;
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k, yaw: p.yaw };
}
/** Distance (horizontale) au rail le plus proche, et l'abscisse correspondante. */
export function nearTrack(x, z) {
  let best = Infinity, bs = 0;
  for (const p of TRACK.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bs = p.s; } }
  return { d: Math.sqrt(best), s: bs };
}
// les gares : au sud (près de l'entrée), au nord (pied du belvédère), à l'est et à l'ouest
export const STATIONS = [
  { id: 'sud', name: 'Gare de l\'Entrée', ang: Math.PI / 2 },
  { id: 'est', name: 'Gare de la Cabane', ang: -Math.PI / 5 },
  { id: 'nord', name: 'Gare du Belvédère', ang: -Math.PI / 2 },
  { id: 'ouest', name: 'Gare du Labyrinthe', ang: -Math.PI * 0.8 },
].map((st) => {
  // la voie au plus près de cette direction
  let best = null, bd = Infinity;
  for (const p of TRACK.pts) { const d = Math.abs(((Math.atan2(p.z, p.x) - st.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI); if (d < bd) { bd = d; best = p; } }
  const t = trackAt(best.s), nx = Math.cos(t.yaw), nz = -Math.sin(t.yaw);   // à droite de la voie (vers l'intérieur : le train tourne dans le sens des aiguilles)
  const inner = (nx * -t.x + nz * -t.z) > 0 ? 1 : -1;
  const px = t.x + nx * inner * 2.6, pz = t.z + nz * inner * 2.6;
  return Object.assign(st, { s: best.s, x: px, z: pz, yaw: t.yaw, tx: t.x, tz: t.z, side: inner });
});
for (const st of STATIONS) {
  const g = Math.max(heightAt(st.x, st.z), trackAt(st.s).y - 0.12);
  st.top = g + 0.35; st.y = g;
  st.col = box(st.x, st.z, 3.2, 3.2, g - 1, st.top, { kind: 'plank', station: st.id });   // (quai simplifié : un carré, tourné en dessin seulement)
}

// --- Caisses (cassables) : un cœur dedans ---------------------------------------------------
export const crates = [
  { id: 'pk1', x: -40, z: 50, content: 'heart' },
  { id: 'pk2', x: 30, z: -10, content: 'heart' },
  { id: 'pk3', x: -88, z: 30, content: 'heart' },
  { id: 'pk4', x: 96, z: -30, content: 'heart' },
  { id: 'pk5', x: -60, z: -110, content: 'heart' },
  { id: 'pk6', x: 70, z: 120, content: 'heart' },
  { id: 'pk7', x: 140, z: -50, content: 'heart' },
  { id: 'pk8', x: -130, z: 80, content: 'heart' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// ---------------------------------------------------------------------------
// Support : sol le plus haut sous un point (terrain + dessus des obstacles)
// ---------------------------------------------------------------------------
const CELL = 8, OFF = 64;
let grid = new Map();
const gkey = (i, j) => (i + OFF) * 128 + (j + OFF);
function bbox(c) { return c.type === 'box' ? [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r]; }
function indexAll() {
  grid = new Map();
  for (const c of colliders) {
    const [x0, x1, z0, z1] = bbox(c);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = gkey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    }
  }
}
let stamp = 1;
/** Obstacles proches de (x, z) dans un rayon r. */
export function near(x, z, r) {
  r = r || 0;
  const out = [], s = ++stamp;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
    const list = grid.get(gkey(i, j));
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
/** Un chat ne traverse pas les haies ni les murs. */
export function blockedAt(x, z) {
  for (const c of near(x, z, 0.5)) if ((c.solid || c.kind === 'rock' || c.kind === 'trunk') && !c.off && inside(c, x, z, 0.4)) return true;
  return false;
}
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of near(x, z, 0.3)) if (!c.off && c.kind !== 'tree' && c.kind !== 'trunk' && c.kind !== 'hedge' && c.kind !== 'post' && c.kind !== 'bar' && c.kind !== 'wall' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return Math.max(best, WATER_Y + 0.4);
}
indexAll();
/** Obstacles ajoutés après coup (la couche de vie : arbustes, habitants immobiles, coffres). */
export function addColliders(list) { for (const c of list) colliders.push(c); indexAll(); }

// ---------------------------------------------------------------------------
// Les missions
// ---------------------------------------------------------------------------
// Biscotte : les indices, dans l'ordre (chacun n'apparaît qu'après le précédent)
export const CLUES = [
  { id: 'collar', x: -57, z: -15, what: 'le collier de Biscotte', act: 'REGARDER' },
  { id: 'doudou', x: DIG.x, z: DIG.z, what: 'le doudou de Biscotte', act: 'CREUSER', dig: true },
  { id: 'toy', x: CAROUSEL.x - 3.4, z: CAROUSEL.z + 2.2, what: 'le jouet qui couine', act: 'REGARDER', onCarousel: true },
].map(c => Object.assign(c, { y: c.onCarousel ? CAROUSEL.floor : groundY(c.x, c.z) }));
export const PUPPY_HIDE = { x: MAZE_INFO.center.x, z: MAZE_INFO.center.z };
PUPPY_HIDE.y = heightAt(PUPPY_HIDE.x, PUPPY_HIDE.z);

// 6 lanternes magiques à rallumer, aux quatre coins du parc
const thTop = TH_DECK.top;
export const LANTERNS = [
  { id: 'l_look', x: LOOKOUT.x - 2.6, z: LOOKOUT.z - 2.6, y: DECK.top, where: 'au belvédère, tout au nord' },
  { id: 'l_maze', x: MAZE_INFO.ends[0].x, z: MAZE_INFO.ends[0].z, y: heightAt(MAZE_INFO.ends[0].x, MAZE_INFO.ends[0].z), where: 'au fond du labyrinthe fleuri, au nord-ouest' },
  { id: 'l_woods', x: WOODS.x - 3, z: WOODS.z - 2, y: heightAt(WOODS.x - 3, WOODS.z - 2), where: 'dans le Bois des Écureuils, à l\'ouest' },
  { id: 'l_cove', x: COVE_ROCK.x, z: COVE_ROCK.z, y: COVE_ROCK.top, where: 'sur le rocher de la crique, au bord de la mer' },
  { id: 'l_cherry', x: CHERRY.x + 3, z: CHERRY.z + 2, y: heightAt(CHERRY.x + 3, CHERRY.z + 2), where: 'sous les cerisiers en fleurs, au sud-est' },
  { id: 'l_tree', x: TREEHOUSE.x + 1.9, z: TREEHOUSE.z + 1.9, y: thTop, where: 'en haut de la cabane perchée, au nord-est' },
];

// 5 balles de tennis (anciennes balles du parc : nouveaux identifiants)
const rabbitTop = RABBIT_ROCKS[RABBIT_ROCKS.length - 1];
export const balls = [
  { id: 'tb1', x: SLIDE.x, z: SLIDE.z, y: SLIDE.top + 0.9, where: 'tout en haut du toboggan' },
  { id: 'tb2', x: ISLET.x, z: ISLET.z, y: ISLET.top + 0.9, where: 'sur l\'îlot de la mare (prenez un pédalo !)' },
  { id: 'tb3', x: KIOSK.x + 2.4, z: KIOSK.z, y: KIOSK.roof + 0.9, where: 'sur le toit du kiosque à musique' },
  { id: 'tb4', x: rabbitTop.x, z: rabbitTop.z, y: rabbitTop.top + 0.9, where: 'en haut du Rocher aux Lapins, à l\'est' },
  { id: 'tb5', x: GARDEN.x, z: GARDEN.z, y: GARDEN.y + 0.7 + 0.9, where: 'dans le jardin secret, caché derrière les haies' },
];

// Points de passage (drapeaux) : on y repart après une grosse chute
export const CHECKPOINTS = [
  { id: 0, x: 5, z: 50, name: 'L\'Entrée du parc' },
  { id: 1, x: -26, z: 72, name: 'L\'aire de jeux' },
  { id: 2, x: -48, z: 8, name: 'La mare aux canards' },
  { id: 3, x: 45, z: -4, name: 'Le terrain d\'agility' },
  { id: 4, x: 8, z: -132, name: 'Le belvédère' },
  { id: 5, x: -110, z: -74, name: 'Le labyrinthe fleuri' },
  { id: 6, x: 108, z: -80, name: 'La cabane perchée' },
  { id: 7, x: -140, z: 30, name: 'La crique' },
  { id: 8, x: 104, z: 92, name: 'Les cerisiers' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// ---------------------------------------------------------------------------
// Os dorés (100) : sur les chemins, et beaucoup cachés loin d'eux
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const atY = (x, z, y) => pts.push({ x, z, y: y + 1.1 });
const lineTo = (ax, az, bx, bz, n) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k); } };
const ring = (cx, cz, r, n, a0) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (a0 || 0); at(cx + Math.cos(a) * r, cz + Math.sin(a) * r); } };
lineTo(0, 44, 0, 34, 2); lineTo(0, 26, 0, 16, 2);                              // entrée → colline (sous l'arche)
for (const s of treeSteps) atY(s.x, s.z, s.top);                               // escalier du Grand Chêne
for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; atY(Math.cos(a) * 3.2, Math.sin(a) * 3.2, TREE_TOP); }
lineTo(-10, 52, -30, 64, 2);                                                   // vers l'aire de jeux
for (const s of SLIDE_STEPS) atY(s.x, s.z, s.top);                             // marches du toboggan
ring(SANDPIT.x, SANDPIT.z, 4, 3, 0.4);                                         // bac à sable
lineTo(10, 54, 36, 66, 2);                                                     // vers le pique-nique
ring(PICNIC.x, PICNIC.z, 7, 3, 1.0);
lineTo(-16, 2, -48, 1, 3);                                                     // vers la mare
atY(JETTY.x1 + 1, JETTY.z, JETTY.top); atY(ISLET.x + 1.6, ISLET.z + 1.3, ISLET.top);
lineTo(16, 4, 44, 6, 2);                                                       // vers l'agility
atY(COURSE[6].x, COURSE[6].z, COURSE[6].top);
for (const s of KIOSK_STEPS) atY(s.x, s.z, s.top);                             // caisses du kiosque
ring(CAROUSEL.x, CAROUSEL.z, CAROUSEL.r + 2.5, 3, 0.3);                        // autour du manège
lineTo(0, -22, 0, -118, 3);                                                    // le grand chemin du nord
ring(LOOKOUT.x, LOOKOUT.z + 4, 6, 3, 0.2);                                     // le belvédère
{ const I = MAZE_INFO; for (const e of I.ends.slice(1, 5)) at(e.x, e.z); at(I.entrance.x, I.entrance.z); }   // impasses du labyrinthe
lineTo(-42, -46, -96, -78, 2);                                                 // kiosque → labyrinthe
for (const s of TH_STEPS.slice(1)) atY(s.x, s.z, s.top);                       // marches de la cabane
lineTo(42, -44, 104, -82, 2);                                                  // manège → cabane
for (const k of RABBIT_ROCKS.slice(0, 3)) atY(k.x, k.z, k.top);                // Rocher aux Lapins
lineTo(96, 4, 136, 6, 2);
ring(CHERRY.x, CHERRY.z, 8, 3, 0.7);                                           // cerisiers
lineTo(60, 80, 104, 96, 2);
ring(GARDEN.x, GARDEN.z, 5, 3, 0.2);                                           // jardin secret
lineTo(-92, 10, -138, 34, 2);                                                  // vers la crique
at(COVE.x - 2, COVE.z + 3); at(COVE.x + 4, COVE.z - 8);
ring(WOODS.x, WOODS.z, 7, 3, 0.9);                                             // Bois des Écureuils
// sur la voie du petit train (on les attrape aussi depuis le train !)
for (let k = 0; k < 4; k++) { const p = trackAt(TRACK.total * (k + 0.33) / 4); at(p.x, p.z); }
// cachés tout au bord du parc, loin de tout chemin
at(-160, -10); at(160, -40); at(-30, 150); at(40, 150); at(-80, 142);
// et dans des recoins : sur le linteau de l'arche, le toit de la niche, la cabane perchée…
atY(0, 30, heightAt(0, 30) + 5.25); atY(KENNEL.x, KENNEL.z, heightAt(KENNEL.x, KENNEL.z) + 2.1);
atY(TH_DECK.x - 1.6, TH_DECK.z + 2.2, TH_DECK.top);
at(WOODS.x + 12, WOODS.z - 14); at(WOODS.x - 10, WOODS.z + 16);
at(MAZE.x - 21, MAZE.z + 10); at(MAZE.x + 20, MAZE.z - 22);
at(160, 30); at(150, 60); at(-60, 160); at(20, -165); at(-30, -150); at(36, -140);
at(-30, 30); at(30, 30); at(-90, -40); at(80, -20);
export const _POINTS = pts.length;
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'b' + i, x: p.x, y: p.y, z: p.z }));

// Médailles Patounes (les identifiants des anciennes sauvegardes)
export const medals = [
  { id: 'm_tree', x: 0, z: 0, y: TREE_TOP + 1.4, label: 'Les lanternes du Grand Chêne', visible: false },
  { id: 'm_cats', x: KIOSK.x, z: KIOSK.z, y: KIOSK.floor + 1.4, label: 'Les chats farceurs', visible: false },
  { id: 'm_crate', x: PODIUM.x, z: PODIUM.z, y: PODIUM.top + 1.4, label: 'La course d\'agility', visible: false },
  { id: 'm_balls', x: PEDESTAL.x, z: PEDESTAL.z, y: PEDESTAL.y + 2.4, label: 'Les balles de tennis', visible: false },
  { id: 'm_puppy', x: SPOTS.mamie.x + 3, z: SPOTS.mamie.z - 2.5, y: groundY(SPOTS.mamie.x + 3, SPOTS.mamie.z - 2.5) + 1.4, label: 'Biscotte le chiot', visible: false },
];

// Chats farceurs : 6 éparpillés dans le parc (la mission), et des errants
export const cats = [
  { id: 'pc1', x: PICNIC.x + 3, z: PICNIC.z - 2, group: 'clearing', where: 'au pique-nique' },
  { id: 'pc2', x: PLAYGROUND.x + 2, z: PLAYGROUND.z - 6, group: 'clearing', where: 'à l\'aire de jeux' },
  { id: 'pc3', x: CAROUSEL.x + 7.5, z: CAROUSEL.z + 3, group: 'clearing', where: 'près du manège' },
  { id: 'pc4', x: 84, z: 18, group: 'clearing', where: 'sur le terrain d\'agility' },
  { id: 'pc5', x: COVE.x + 6, z: COVE.z + 12, group: 'clearing', where: 'à la crique' },
  { id: 'pc6', x: CHERRY.x - 6, z: CHERRY.z - 4, group: 'clearing', where: 'sous les cerisiers' },
  { id: 'cat7', x: -20, z: -70, group: 'roam' },
  { id: 'cat8', x: 70, z: -100, group: 'roam' },
  { id: 'cat9', x: -100, z: 40, group: 'roam' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: heightAt(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: PUPPY_HIDE.x, z: PUPPY_HIDE.z, y: PUPPY_HIDE.y },
  gaston: { x: GASTON.x, z: GASTON.z, y: heightAt(GASTON.x, GASTON.z) },
};
cyl(npcs.gaston.x, npcs.gaston.z, 0.5, npcs.gaston.y - 0.5, npcs.gaston.y + 1.0, { kind: 'npc', solid: true });

// Panneaux
export const signs = [
  { x: 3.5, z: 26, text: ['↑ Le Grand Chêne et le belvédère', '← La mare aux canards  ·  → Le terrain d\'agility', '↓ L\'aire de jeux, le pique-nique et la gare'] },
  { x: -46, z: -3.5, text: ['La mare aux canards', 'Pédalos-cygnes : montez au ponton !', 'Il y a un îlot au milieu…'] },
  { x: 49, z: -6, text: ['Le terrain d\'agility de Gaston', 'Haie, tunnel, slalom, bascule, pneu, haie, table…', 'et l\'arrivée ! Le plus vite possible !'] },
  { x: -24, z: 66, text: ['L\'aire de jeux', 'Toboggan, balançoires et bac à sable.', 'Les petits chiens adorent creuser !'] },
  { x: 4, z: -124, text: ['Le belvédère', 'Regardez dans la longue-vue :', 'on voit tout le parc !'] },
  { x: MAZE_INFO.entrance.x + 3.5, z: MAZE_INFO.entrance.z + 1, text: ['Le labyrinthe fleuri', 'Entrez… si vous osez !'] },
  { x: 5, z: 84, text: ['Le petit train du parc', 'Attendez sur le quai : il s\'arrête !', '4 gares : Entrée, Cabane, Belvédère, Labyrinthe.'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: heightAt(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Chemins de terre
export const PATHS = [
  [[0, 48], [0, 14]], [[0, 52], [0, 86]], [[0, 46], [-5, 44]],
  [[-8, -8], [-28, -33]], [[8, -8], [30, -31]], [[0, -14], [0, -126]],
  [[-14, 2], [-50, 0]], [[14, 4], [47, 5]],
  [[-8, 53], [-30, 64]], [[8, 54], [36, 66]],
  [[-38, -44], [-112, -82]], [[40, -42], [108, -84]],
  [[-90, 8], [-140, 36]], [[92, 6], [140, 4]], [[56, 76], [108, 98]],
];

export const CRYSTALS = [[-5.5, 36, 0x3ee8d8], [5.2, 32.5, 0xb070ff], [-5.5, -17, 0x3ee8d8], [5.6, -33, 0xb070ff]];

// ---------------------------------------------------------------------------
// Arbres : des bosquets partout, une vraie forêt à l'ouest (le Bois des Écureuils)
// ---------------------------------------------------------------------------
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
export const KEEP_OUT = [[SPOTS.spawn, 22], [{ x: 0, z: 0 }, 12], [POND, POND.r + 4], [KIOSK, 10], [CAROUSEL, 11], [{ x: AGILITY.x, z: AGILITY.z }, 28],
  [PLAYGROUND, 19], [PICNIC, 16], [LOOKOUT, 12], [{ x: MAZE.x, z: MAZE.z }, 24], [TREEHOUSE, 8], [RABBIT_ROCK, 12], [GARDEN, 13],
  [COVE, 16], [{ x: WOODS.x - 3, z: WOODS.z - 2 }, 5], [CHERRY, 15], [FOUNTAIN, 6]];
export const trees = [];
{
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ok = (x, z, h, gap) => {
    if (h < 1.5) return false;
    if (KEEP_OUT.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) return false;
    if (PATHS.some(([[ax, az], [bx, bz]]) => segDist(x, z, ax, az, bx, bz) < 4)) return false;
    if (nearTrack(x, z).d < 5) return false;
    if (STATIONS.some(s => Math.hypot(s.x - x, s.z - z) < 8)) return false;
    if (near(x, z, 2.5).some(c => !c.off && inside(c, x, z, 2.5))) return false;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < gap)) return false;
    if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 3) || signs.some(c => Math.hypot(c.x - x, c.z - z) < 3)) return false;
    if (CHECKPOINTS.some(c => Math.hypot(c.x - x, c.z - z) < 4) || cats.some(c => Math.hypot(c.x - x, c.z - z) < 3)) return false;
    if (pts.some(b => Math.hypot(b.x - x, b.z - z) < 2) || LANTERNS.some(b => Math.hypot(b.x - x, b.z - z) < 3)) return false;
    // le chemin caché vers l'ouverture du jardin secret reste libre
    const gx = GARDEN.x + Math.cos(GARDEN_GAP.a) * (GARDEN.r + 4), gz = GARDEN.z + Math.sin(GARDEN_GAP.a) * (GARDEN.r + 4);
    if (Math.hypot(x - gx, z - gz) < 5) return false;
    return true;
  };
  let guard = 0;
  // le Bois des Écureuils (serré)
  while (trees.length < 26 && guard++ < 6000) {
    const a = rnd() * Math.PI * 2, d = 6 + rnd() * 26, x = WOODS.x + Math.cos(a) * d, z = WOODS.z + Math.sin(a) * d * 1.3, h = heightAt(x, z);
    if (Math.hypot(x, z) > 168 || !ok(x, z, h, 5.5)) continue;
    trees.push({ x, z, y: h, s: 0.9 + rnd() * 0.5, h: 6.5 + rnd() * 3 });
  }
  // et partout ailleurs
  guard = 0;
  while (trees.length < 100 && guard++ < 30000) {
    const a = rnd() * Math.PI * 2, d = 18 + rnd() * 150, x = Math.cos(a) * d, z = Math.sin(a) * d, h = heightAt(x, z);
    if (!ok(x, z, h, 8.5)) continue;
    trees.push({ x, z, y: h, s: 0.85 + rnd() * 0.55, h: 5.5 + rnd() * 3 });
  }
  // pas d'arbre à cheval sur une pente raide
  const onCliff = (t) => { for (let a = 0; a < 6.28; a += 0.785) if (Math.abs(heightAt(t.x + Math.cos(a) * 2.2, t.z + Math.sin(a) * 2.2) - t.y) > 1.3) return true; return false; };
  for (let i = trees.length - 1; i >= 0; i--) if (onCliff(trees[i])) trees.splice(i, 1);
  for (const t of trees) cyl(t.x, t.z, 0.55 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}
// Les cerisiers en fleurs (dessinés à part : feuillage rose)
export const CHERRY_TREES = [];
for (let i = 0; i < 9; i++) {
  const a = i / 9 * Math.PI * 2 + 0.3, d = i % 2 ? 9.5 : 6, x = CHERRY.x + Math.cos(a) * d, z = CHERRY.z + Math.sin(a) * d;
  if (Math.hypot(x - LANTERNS[4].x, z - LANTERNS[4].z) < 3) continue;
  const t = { x, z, y: heightAt(x, z), s: 0.85 + (i % 3) * 0.1, h: 4.2 };
  CHERRY_TREES.push(t);
  cyl(x, z, 0.4, t.y - 1, t.y + t.h, { kind: 'tree' });
}
// le grand arbre de la cabane perchée (dessiné à part)
export const TH_TREE = { x: TREEHOUSE.x, z: TREEHOUSE.z, y: TREEHOUSE.y, top: TH_DECK.top };
indexAll();

/** Mini-carte : le bac à sable, l'agility, les haies, la voie du train, les dalles. */
export function mapColor(x, z) {
  if (Math.hypot(x - SANDPIT.x, z - SANDPIT.z) < SANDPIT.r) return [240, 220, 160];
  if (Math.abs(x - AGILITY.x) < AGILITY.hw - 1 && Math.abs(z - AGILITY.z) < AGILITY.hd - 1) return [140, 210, 110];
  if (Math.hypot(x - KIOSK.x, z - KIOSK.z) < KIOSK.r || Math.hypot(x - CAROUSEL.x, z - CAROUSEL.z) < CAROUSEL.r) return [230, 200, 160];
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r) return [120, 200, 240];
  for (const c of near(x, z, 0)) if (c.kind === 'hedge' && inside(c, x, z, 0)) return [40, 120, 50];
  return null;
}
/** Mini-carte : la voie du petit train et les gares. */
export function drawMap(x, P, k) {
  x.strokeStyle = 'rgba(110,70,40,0.9)'; x.lineWidth = Math.max(1.5, 1.6 * k);
  x.beginPath();
  TRACK.pts.forEach((p, i) => { if (i) x.lineTo(P(p.x), P(p.z)); else x.moveTo(P(p.x), P(p.z)); });
  x.closePath(); x.stroke();
  x.fillStyle = '#c84a3a';
  for (const s of STATIONS) x.fillRect(P(s.x) - 3, P(s.z) - 3, 6, 6);
  x.fillStyle = 'rgba(255,170,210,0.8)';
  for (const t of CHERRY_TREES) { x.beginPath(); x.arc(P(t.x), P(t.z), 2.2, 0, 7); x.fill(); }
}
export { clamp as _clamp };
