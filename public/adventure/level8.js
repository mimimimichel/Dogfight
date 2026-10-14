/*
 * Matcha & Ainu — Niveau 8 : « Le Château des Chats ».
 * Le château de la Capitaine Moustache, sur sa colline entourée de douves.
 * Données pures (aucune dépendance) : utilisé par le jeu et par les tests (Node).
 *
 * Parcours (le nord est vers -z), d'énigme en énigme :
 *   la Prairie (Mamie) → 1. le Pont-Levis : deux pattes dorées à presser (un ami, ou la pelote géante)
 *   → 2. la Cour des Pelotes : pousser la pelote contre les remparts pour grimper au bouton
 *   → 3. la Salle du Point Rouge : les chats font la sieste devant la porte… la lampe-laser les attire
 *   → 4. le Jardin de l'Arbre à Chats : grimper de plateau en plateau jusqu'à la terrasse du donjon
 *   → 5. la Salle du Trône : on joue à chat avec la Capitaine… puis la grande fête de la réconciliation.
 */

export const ID = 8;
export const NAME = 'Le Château des Chats';
export const SAVE_KEY = 'dogfight.aventure.niveau8';
export const CAT_PLACE = 'au château';
export const COLLECT_NAME = 'poissons dorés';
export const MEDAL_TITLE = 'TRÉSOR DU CHÂTEAU !';
export const FINAL_MEDAL = 'm_goal';
export const MUSIC = 'adv1';          // le thème du jeu, clair et joyeux, pour le grand final
export const WATER_Y = 0;             // la mer et les douves
export const GRASS_K = 0.7;

// Ambiance : fin d'après-midi dorée, tout est chaud et lisible
export const SKY = { top: 0x4a7ad8, horizon: 0xffd2a8, bottom: 0xffe6c8, sunDir: [-0.42, 0.56, 0.6] };
export const LIGHT = { hemi: [0xfff0dc, 0x8a6a4a, 0.9], sun: [0xffdcb0, 2.4], fog: [70, 230] };
export const GRADE = { bloom: 0.72, saturation: 1.08, highTint: [0.035, 0.016, 0.0], shadowTint: [0.012, 0.0, 0.03] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.2, big: 2.0, small: 1.4, bushes: 1 };
export const PALETTE = {
  ground: [0x5cb83c, 0x86cf4a, 0x3f9a36],
  leaves: [0x5ab848, 0x7ac850, 0xf0a0c8, 0x4aa840, 0xffc0d8, 0x6ac050, 0xf8d070, 0x58b048],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------
// Le château : un grand rectangle sur la colline, entouré de douves
// ---------------------------------------------------------------------------
export const FLOOR = 4;               // sol du château (cour, salle, jardin)
export const TOP = 13;                // terrasse du donjon (salle du trône)
export const CASTLE = { x0: -22, x1: 22, z0: -72, z1: 12 };           // l'intérieur (murs compris)
export const MOAT = { x0: -28.5, x1: 28.5, z0: -78.5, z1: 18.5 };     // le bord extérieur des douves
export const KEEP_Z = -52;            // au nord de cette ligne : la terrasse du donjon
export const MOAT_FLOOR = -2.2;
// les grandes salles (bornes intérieures, entre les murs)
export const COURT = { x0: -21, x1: 21, z0: -13.2, z1: 11.2 };
export const HALL = { x0: -21, x1: 21, z0: -33.2, z1: -14.8 };
export const GARDEN = { x0: -21, x1: 21, z0: -51.1, z1: -34.8 };
export const THRONE = { x0: -13.4, x1: 13.4, z0: -71, z1: -55.1 };

/** Distance d'un point au rectangle r (0 dedans). */
function rectDist(r, x, z) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
const inRect = (r, x, z, m) => { m = m || 0; return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; };
export const inCastle = (x, z) => inRect(CASTLE, x, z);

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  if (inRect(CASTLE, x, z)) return z < KEEP_Z ? TOP : FLOOR;
  if (inRect(MOAT, x, z)) {
    // les douves, et leur berge extérieure qui plonge
    const edge = Math.min(x - MOAT.x0, MOAT.x1 - x, z - MOAT.z0, MOAT.z1 - z);
    return edge > 0.6 ? MOAT_FLOOR : FLOOR + (MOAT_FLOOR - FLOOR) * (edge / 0.6);
  }
  // la colline : plate au bord des douves, elle descend doucement vers la prairie
  const d = rectDist(MOAT, x, z);
  let h = 2.2 + 1.8 * (1 - smooth(7, 30, d));
  h += (0.35 * Math.sin(x * 0.11 + 1) * Math.cos(z * 0.09) + 0.2 * Math.sin(x * 0.07 - z * 0.05)) * smooth(9, 22, d);
  // l'île : plage, puis la mer
  const r = Math.hypot(x, z + 4) / 88;
  h = h * (1 - smooth(0.86, 1.0, r)) + 0.6 * smooth(0.86, 1.0, r) - 3.6 * smooth(0.96, 1.18, r);
  return h;
}
export function inWater(x, z, m) { return heightAt(x, z) < (m ? -m * 0.1 : 0); }
/** Pas d'herbe sur les dalles du château (sauf la pelouse du jardin). */
export function noGrass(x, z) {
  if (!inRect(CASTLE, x, z, 1.5)) return false;
  return !(Math.abs(x) < 17 && z < -36.5 && z > -49.5 && Math.hypot(x - TREE.x, z - TREE.z) > 6.5);
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };
/** Mur entre deux points (alignés sur x ou sur z). look : pour le décor (castle.js). */
export const walls = [];
const WALL_MAP = '#8a7a6a';
function wall(x0, z0, x1, z1, th, y0, y1, look) {
  const w = Math.abs(x1 - x0) || th, d = Math.abs(z1 - z0) || th;
  const c = box((x0 + x1) / 2, (z0 + z1) / 2, w, d, y0, y1, { kind: 'wall', solid: true, cam: true, map: WALL_MAP });
  walls.push({ c, look: look || 'wall' });
  return c;
}
// remparts extérieurs (on les dessine aussi au-dessus des douves)
const H_OUT = FLOOR + 6.5, H_KEEP = TOP + 4.5, TH = 2;
wall(-23.2, 12.2, -3, 12.2, TH, MOAT_FLOOR, H_OUT);              // façade sud, à gauche de la porte
wall(3, 12.2, 23.2, 12.2, TH, MOAT_FLOOR, H_OUT);                // façade sud, à droite
wall(-22.2, 13.2, -22.2, KEEP_Z, TH, MOAT_FLOOR, H_OUT);          // ouest
wall(22.2, 13.2, 22.2, KEEP_Z, TH, MOAT_FLOOR, H_OUT);            // est
wall(-22.2, KEEP_Z, -22.2, -73.2, TH, MOAT_FLOOR, H_KEEP);        // donjon ouest
wall(22.2, KEEP_Z, 22.2, -73.2, TH, MOAT_FLOOR, H_KEEP);          // donjon est
wall(-23.2, -72.2, 23.2, -72.2, TH, MOAT_FLOOR, H_KEEP);          // donjon nord
// le pied du donjon (falaise de pierre entre le jardin et la terrasse)
export const KEEP_FRONT = box(0, -51.9, 44, 1.6, FLOOR - 1, TOP, { kind: 'wall', solid: true, cam: true, map: WALL_MAP });
walls.push({ c: KEEP_FRONT, look: 'keep' });
// murs intérieurs : Cour | Salle du Point Rouge | Jardin
const H_IN = FLOOR + 5.5;
wall(-21.2, -14, -2.5, -14, 1.6, FLOOR - 1, H_IN, 'inner');
wall(2.5, -14, 21.2, -14, 1.6, FLOOR - 1, H_IN, 'inner');
wall(-21.2, -34, -2.5, -34, 1.6, FLOOR - 1, H_IN, 'inner');
wall(2.5, -34, 21.2, -34, 1.6, FLOOR - 1, H_IN, 'inner');
// linteaux au-dessus des passages (personne ne passe par-dessus)
box(0, -14, 5, 1.6, FLOOR + 4.6, H_IN, { kind: 'wall', solid: true });
box(0, -34, 5, 1.6, FLOOR + 4.6, H_IN, { kind: 'wall', solid: true });
// parapet de la terrasse (ouvert là où arrive la passerelle de l'Arbre à Chats)
wall(-21.2, -51.9, -1.8, -51.9, 1.2, TOP, TOP + 1.1, 'parapet');
wall(1.8, -51.9, 21.2, -51.9, 1.2, TOP, TOP + 1.1, 'parapet');
// salle du trône, sur la terrasse
const H_TH = TOP + 4.5;
wall(-14, -54.5, -14, -71.2, 1.2, TOP - 0.5, H_TH, 'throne');
wall(14, -54.5, 14, -71.2, 1.2, TOP - 0.5, H_TH, 'throne');
// devant : une colonnade ouverte sur la terrasse (la caméra voit toute la salle)
export const THRONE_COLS = [-12.4, -7.5, -2.6, 2.6, 7.5, 12.4];
for (const x of THRONE_COLS) cyl(x, -54.6, 0.6, TOP - 0.5, TOP + 4.5, { kind: 'rock', cam: true });
box(0, -54.6, 28.4, 1.2, TOP + 4.45, TOP + 5.2, { kind: 'wall', solid: true });

// tours (décor solide) : aux coins, à la porte, au donjon
export const TOWERS = [
  { x: -23.5, z: 13.5, r: 3.2, h: 14, ears: false }, { x: 23.5, z: 13.5, r: 3.2, h: 14, ears: false },
  { x: -5.2, z: 13.4, r: 2.5, h: 12.5, ears: true }, { x: 5.2, z: 13.4, r: 2.5, h: 12.5, ears: true },   // la porte : deux oreilles de chat
  { x: -23.5, z: -33, r: 2.8, h: 12, ears: false }, { x: 23.5, z: -33, r: 2.8, h: 12, ears: false },
  { x: -23.5, z: -73.5, r: 3.6, h: 25, ears: false }, { x: 23.5, z: -73.5, r: 3.6, h: 25, ears: false },
  { x: -9, z: -73.6, r: 3.0, h: 30, ears: true }, { x: 9, z: -73.6, r: 3.0, h: 30, ears: true },           // le donjon : les grandes oreilles
];
for (const T of TOWERS) cyl(T.x, T.z, T.r, MOAT_FLOOR, T.h, { kind: 'rock', cam: true });

// ---------------------------------------------------------------------------
// 1. Le Pont-Levis : deux pattes dorées (un chien, un ami… ou la pelote géante)
// ---------------------------------------------------------------------------
export const DRAWBRIDGE = { x: 0, hinge: 13.2, len: 6, w: 4.4, top: FLOOR + 0.05 };
export const bridgeCol = box(0, 15.7, 4.4, 7, FLOOR - 0.6, FLOOR + 0.05, { kind: 'bridge', off: true });
export const gateCol = box(0, 12.4, 6, 1.6, FLOOR - 1, FLOOR + 7, { kind: 'gate', solid: true, cam: true });
export const PLATES = [{ id: 'a', x: -5, z: 25 }, { id: 'b', x: 5, z: 25 }].map(p => Object.assign(p, { y: heightAt(p.x, p.z), r: 1.25 }));

// pelotes géantes à pousser
export const BALL_R = 1.2;
export const BALLS = [
  { id: 'b1', x: -10.5, z: 32, zone: 'out' },        // dans la prairie : elle peut aller sur une patte dorée
  { id: 'b2', x: 3, z: 0, zone: 'court' },           // dans la cour : marchepied pour les remparts
].map(b => Object.assign(b, { y: heightAt(b.x, b.z) }));

// ---------------------------------------------------------------------------
// 2. La Cour des Pelotes : les remparts de l'est, trop hauts pour sauter
// ---------------------------------------------------------------------------
export const LEDGE = { x0: 14.5, x1: 21.2, z0: -13.2, z1: -2, top: FLOOR + 5 };
export const ledgeCol = box((LEDGE.x0 + LEDGE.x1) / 2, (LEDGE.z0 + LEDGE.z1) / 2, LEDGE.x1 - LEDGE.x0, LEDGE.z1 - LEDGE.z0, FLOOR - 1, LEDGE.top, { kind: 'ledge', solid: true, cam: true, map: WALL_MAP });
// l'empreinte où la pelote se cale contre le mur
export const SLOT = { x: LEDGE.x0 - BALL_R - 0.05, z: -7.5 };
SLOT.y = heightAt(SLOT.x, SLOT.z);
// le bouton des remparts (ouvre la porte de la Salle du Point Rouge)
export const WALL_SWITCH = { x: 18.2, z: -10, y: LEDGE.top, r: 1.2 };
export const DOOR1 = box(0, -14, 5, 1.0, FLOOR - 1, FLOOR + 4.7, { kind: 'door', solid: true, cam: true });
// décor de la cour
export const FOUNTAIN = { x: -7, z: -1, r: 2.4, h: 0.85 };
cyl(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r, FLOOR - 0.5, FLOOR + FOUNTAIN.h, { kind: 'fountain', solid: true });
export const POSTS = [[-15, 8], [15, 8], [-15, -10], [-10, -31], [10, -31], [-12, -48], [12, -48]].map(([x, z]) => ({ x, z, y: heightAt(x, z), h: 4.6 }));
for (const p of POSTS) cyl(p.x, p.z, 0.6, p.y - 0.5, p.y + p.h, { kind: 'rock', cam: true });
export const YARNS = [[-17.5, 1, 1.4, 0xff6ab0], [9.5, 6.5, 1.1, 0x6ac8ff], [17.5, -18.5, 1.2, 0xffc83a], [-17, -44, 1.3, 0x8ae05a], [9, -66, 1.1, 0xc88aff], [-9.5, -66, 1.2, 0xff8a6a]]
  .map(([x, z, r, col]) => ({ x, z, r, col, y: heightAt(x, z) }));
for (const y of YARNS) cyl(y.x, y.z, y.r * 0.95, y.y - 0.5, y.y + y.r * 2, { kind: 'yarn', solid: true });
export const CUSHIONS = [[-10, -10, 1.7, 0xd84a6a], [-13.5, -8, 1.3, 0xffb040], [14.5, -29, 1.6, 0x7a5ad8], [-15, -40, 1.6, 0x4ab0a0], [15, -42, 1.5, 0xe86aa0], [16.5, 2, 1.4, 0x5a8ad8]]
  .map(([x, z, r, col]) => ({ x, z, r, col, y: heightAt(x, z), top: heightAt(x, z) + 0.75 }));
for (const c of CUSHIONS) cyl(c.x, c.z, c.r, c.y - 0.5, c.top, { kind: 'cushion' });

// ---------------------------------------------------------------------------
// 3. La Salle du Point Rouge
// ---------------------------------------------------------------------------
export const LASER_BUTTON = { x: -15, z: -17.5, r: 1.3 };
LASER_BUTTON.y = heightAt(LASER_BUTTON.x, LASER_BUTTON.z);
export const PROJECTOR = { x: -20.2, z: -24, y: FLOOR + 2.6 };
export const LASER_TIME = 16;         // secondes de point rouge après un appui (seul)
export const CAT_PILE = box(0, -31.6, 6.4, 3.2, FLOOR - 1, FLOOR + 5, { kind: 'catpile', solid: true });
export const NAP = [[-1.3, -32.3], [1.3, -32.3], [0, -31.0], [-2.4, -30.9], [2.4, -30.9]].map(([x, z]) => ({ x, z }));
/** Le point rouge, t secondes après l'allumage (il gambade dans la salle, loin de la porte). */
export function dotAt(t) {
  return { x: 14 * Math.sin(0.62 * t), z: -23.5 + 5.6 * Math.sin(1.13 * t + 0.4) };
}

// ---------------------------------------------------------------------------
// 4. Le Jardin de l'Arbre à Chats
// ---------------------------------------------------------------------------
export const TREE = { x: 0, z: -43.5, r: 1.0 };
export const TREE_R = 3.7;            // rayon de la spirale
export const catTree = [];
for (let i = 0; i < 7; i++) {
  const a = Math.PI / 2 + i * (70 * Math.PI / 180);   // départ côté sud (on arrive de la porte)
  catTree.push({ x: TREE.x + Math.cos(a) * TREE_R, z: TREE.z + Math.sin(a) * TREE_R, top: FLOOR + 1.2 + i * 1.1, r: 1.3, a });
}
for (const p of catTree) cyl(p.x, p.z, p.r, p.top - 0.4, p.top, { kind: 'pad' });
export const HAMMOCK = { x: TREE.x, z: TREE.z, r: 2.0, top: TOP };
cyl(HAMMOCK.x, HAMMOCK.z, HAMMOCK.r, TOP - 0.5, TOP, { kind: 'pad' });
cyl(TREE.x, TREE.z, TREE.r, FLOOR - 0.5, TOP - 0.5, { kind: 'trunk' });          // le grand poteau en corde
export const PERCH = { x: TREE.x, z: TREE.z, r: 1.25, top: TOP + 2.2 };
cyl(TREE.x, TREE.z, 0.45, TOP - 0.5, PERCH.top - 0.3, { kind: 'trunk' });
cyl(PERCH.x, PERCH.z, PERCH.r, PERCH.top - 0.35, PERCH.top, { kind: 'pad' });
// la passerelle : du hamac au sommet du donjon
export const PLANK = { x: 0, z0: TREE.z - HAMMOCK.r + 0.3, z1: -51.3, w: 2.2, top: TOP };
box(PLANK.x, (PLANK.z0 + PLANK.z1) / 2, PLANK.w, PLANK.z0 - PLANK.z1, TOP - 0.4, TOP, { kind: 'plank' });

// ---------------------------------------------------------------------------
// 5. La Salle du Trône
// ---------------------------------------------------------------------------
export const DAIS = { x: 0, z: -68.3, w: 7, d: 4, top: TOP + 0.5 };
box(DAIS.x, DAIS.z, DAIS.w, DAIS.d, TOP - 0.5, DAIS.top, { kind: 'dais' });
export const SEAT = { x: 0, z: -69.0, w: 2.6, d: 1.8, top: DAIS.top + 1.0 };
box(SEAT.x, SEAT.z, SEAT.w, SEAT.d, DAIS.top - 0.2, SEAT.top, { kind: 'seat' });
box(0, -70.3, 3.2, 0.8, DAIS.top - 0.2, DAIS.top + 3.4, { kind: 'rock' });       // dossier du trône
export const TAG_ZONE = { x0: -11.8, x1: 11.8, z0: -65, z1: -57 };              // là où l'on joue à chat
export const TAGS = 3;
export const PARTY = { x: 0, z: -62 };

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
/** Murs et obstacles pour les chats qui se promènent (ils ne traversent rien). */
export function blockedAt(x, z) {
  const h = heightAt(x, z);
  for (const c of colliders) if (!c.off && (c.solid || c.kind === 'rock' || c.kind === 'yarnball') && c.y1 > h + 0.6 && inside(c, x, z, 0.4)) return true;
  return false;
}

function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of colliders) if (!c.off && !c.moving && c.kind !== 'catpile' && c.kind !== 'door' && c.kind !== 'gate' && c.y1 > best && c.y1 < best + 6 && inside(c, x, z, 0.2)) best = c.y1;
  return best;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const lineTo = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const arc = (cx, cz, r, n, a0, a1, lift) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, lift); } };
// la prairie
lineTo(0, 55, 0, 31, 7);                                   // le chemin vers le château
arc(-5, 57.5, 3.4, 4, -0.4, Math.PI * 0.9);                 // autour de Mamie
arc(0, 25, 7.6, 5, Math.PI * 0.1, Math.PI * 0.9);           // autour des pattes dorées
lineTo(-24, 28, -34, 6, 4);                                 // le long des douves, à l'ouest
lineTo(24, 28, 34, 6, 4);                                   // à l'est
lineTo(-31.5, -8, -31.5, -40, 3);
lineTo(31.5, -8, 31.5, -40, 3);
// la cour
arc(FOUNTAIN.x, FOUNTAIN.z, 3.8, 6, 0, Math.PI * 2 * 5 / 6);
lineTo(5.5, 5, 10, -3, 3);                                  // vers le rempart
lineTo(16.8, -3.5, 16.8, -12, 4, 1.2);                       // sur le rempart
lineTo(-19.6, 9, -19.6, -10, 4);
lineTo(-1, 9, 5, 9, 4);
// la Salle du Point Rouge
lineTo(-15, -21, 15, -21, 7);
lineTo(-15, -27, 15, -27, 7);
arc(LASER_BUTTON.x, LASER_BUTTON.z, 2.4, 2, -0.5, 0.7);
// le jardin et l'Arbre à Chats
arc(TREE.x, TREE.z, 6.8, 6, Math.PI * 0.2, Math.PI * 1.3);
for (const p of catTree) at(p.x, p.z, 1.15);
arc(HAMMOCK.x, HAMMOCK.z, 1.4, 2, -2.4, -0.7, 1.15);
lineTo(PLANK.x, PLANK.z0 - 1.4, PLANK.x, PLANK.z1 + 0.6, 2, 1.15);
lineTo(-17, -37, -17, -48, 2);
lineTo(17.2, -40, 17.2, -48, 2);
// la terrasse et la salle du trône
lineTo(-7, -53.2, 7, -53.2, 3);
arc(0, -61.5, 5, 6, Math.PI * 0.1, Math.PI * 0.9);
lineTo(-7, -63.8, 7, -63.8, 3);
export const bones = pts.slice(0, 100).map((p, i) => ({ id: 'f' + i, x: p.x, y: p.y, z: p.z }));
export const balls = [];

// Les cinq trésors du château
export const medals = [
  { id: 'm_gate', x: 0, z: 16.2, y: FLOOR + 1.6, label: 'Le Pont-Levis', visible: false },
  { id: 'm_wall', x: 18.2, z: -4.6, y: LEDGE.top + 1.5, label: 'Les Remparts', visible: true },
  { id: 'm_laser', x: 0, z: -34, y: FLOOR + 1.5, label: 'La Salle du Point Rouge', visible: true },
  { id: 'm_tree', x: PERCH.x, z: PERCH.z, y: PERCH.top + 1.5, label: 'Le Sommet de l\'Arbre à Chats', visible: true },
  { id: 'm_goal', x: SEAT.x, z: SEAT.z, y: SEAT.top + 1.5, label: 'La Couronne de l\'Amitié', visible: false },
];

export const crates = [
  { id: 'c1', x: 14, z: 40, content: 'heart' },
  { id: 'c2', x: -18, z: -12, content: 'heart' },
  { id: 'c3', x: 17, z: -17.5, content: 'heart' },
  { id: 'c4', x: 18, z: -38, content: 'heart' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Chats farceurs (un « Ouaf ! » et ils filent)
export const cats = [
  { id: 'cat1', x: 13, z: 34, group: 'roam' },
  { id: 'cat2', x: -15, z: 42, group: 'roam' },
  { id: 'cat3', x: -16, z: -2, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

export const npcs = {
  mamie: { x: -5, z: 57, y: heightAt(-5, 57) },
  puppy: { x: -3.2, z: 58.4, y: heightAt(-3.2, 58.4) },
};
/** Où se tient Pompon, le petit neveu de la Capitaine, selon l'avancée (0 à 5). */
export const POMPON = [
  { x: 2.2, z: 14.6, y: H_OUT },                 // 0 : sur le rempart, au-dessus de la porte (il fait coucou)
  { x: -3.5, z: 6.5 },                           // 1 : dans la cour
  { x: -17.5, z: -20.5 },                        // 2 : près de la patte rouge
  { x: 5, z: -37.5 },                            // 3 : au pied de l'Arbre à Chats
  { x: 4.5, z: -58.5 },                          // 4 : dans la salle du trône
  { x: 2.6, z: -63.5 },                          // 5 : la fête
].map(p => Object.assign(p, { y: p.y === undefined ? groundY(p.x, p.z) : p.y }));
export const CAPTAIN = { x: SEAT.x, z: SEAT.z - 0.1, y: SEAT.top };

export const signs = [
  { x: 3.6, z: 47, text: ['Le Château des Chats', 'Le pont-levis est levé…', 'Appuyez sur les deux pattes dorées en même temps !', 'Seul ? Poussez la pelote géante sur l\'une d\'elles.'] },
  { x: 10.5, z: 3, text: ['Les Remparts', 'Le bouton est tout là-haut : trop haut pour sauter !', 'Poussez la pelote contre le mur, grimpez dessus, et sautez deux fois.'] },
  { x: -10.5, z: -16.4, text: ['La Salle du Point Rouge', 'Les chats font la sieste devant la porte.', 'Montez sur la patte rouge : le point rouge va les attirer !'] },
  { x: 6.5, z: -36.4, text: ['L\'Arbre à Chats', 'Sautez de plateau en plateau, tout en haut,', 'puis prenez la passerelle jusqu\'à la salle du trône.'] },
];

export const START = { x: 0, z: 63, y: heightAt(0, 63), yaw: Math.PI };
export const PATHS = [[[0, 66], [0, 19.5]], [[0, 26], [-5, 25]], [[0, 26], [5, 25]]];
export const CRYSTALS = [];
export const ruins = [];

// Points de passage (drapeaux) : après une chute ou un K.O., on repart d'ici
export const CHECKPOINTS = [
  { id: 0, x: 3.4, z: 57.5, name: 'La Prairie' },
  { id: 1, x: -7, z: 8.5, name: 'La Cour des Pelotes' },
  { id: 2, x: 7, z: -17.5, name: 'La Salle du Point Rouge' },
  { id: 3, x: -7, z: -37.5, name: 'Le Jardin' },
  { id: 4, x: 5.5, z: -53.4, name: 'Le Donjon' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Arbres en fleurs dans la prairie
export const trees = [];
{
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let guard = 0;
  while (trees.length < 34 && guard++ < 5000) {
    const x = (rnd() - 0.5) * 160, z = (rnd() - 0.5) * 160;
    const h = heightAt(x, z);
    if (h < 1.4 || rectDist(MOAT, x, z) < 5) continue;
    if (Math.hypot(x, z + 4) > 70) continue;
    if (Math.abs(x) < 4.5 && z > 15) continue;                                         // le chemin
    if (Math.hypot(x - npcs.mamie.x, z - npcs.mamie.z) < 6 || Math.hypot(x - START.x, z - START.z) < 10) continue;
    if (PLATES.some(p => Math.hypot(p.x - x, p.z - z) < 5) || BALLS.some(b => Math.hypot(b.x - x, b.z - z) < 5)) continue;
    if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 3) || cats.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    const s = 0.8 + rnd() * 0.4;
    trees.push({ x, z, y: h, s, h: 6 + rnd() * 2 });
  }
  for (const t of trees) cyl(t.x, t.z, 0.5 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}

/** Mini-carte : dalles du château, douves, terrasse. */
export function mapColor(x, z) {
  if (inRect(CASTLE, x, z)) {
    if (z < KEEP_Z) return inRect(THRONE, x, z) ? [196, 70, 80] : [204, 186, 160];
    if (inRect(GARDEN, x, z)) return [120, 196, 96];
    return [222, 206, 180];
  }
  return null;
}
export { clamp as _clamp, inRect as _inRect, rectDist as _rectDist };
