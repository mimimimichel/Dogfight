/*
 * Dogfight Aventure — Niveau 1 : « Le Parc des Toutous ».
 * Données pures (aucune dépendance) : relief, obstacles, objets à ramasser,
 * personnages. Utilisé par le jeu et par les tests (Node).
 */

export const WATER_Y = 0;
export const ISLAND_R = 68;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function gauss(x, z, cx, cz, r, h) { return h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)); }

// Lieux importants
export const SPOTS = {
  spawn: { x: 0, z: 50 },
  mamie: { x: -6, z: 45 },
  tree: { x: 0, z: 0 },
  clearing: { x: 36, z: 4 },
  lake: { x: -38, z: 5 },
  islet: { x: -45, z: 5 },
  plateau: { x: 34, z: -34 },
  pedestal: { x: 0, z: -44 },
};
const PLATEAU_R = 9.5;      // rayon du sommet plat
const PLATEAU_H = 11;       // hauteur de la falaise

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  let h = 2.2 * (1 - smooth(0.78, 1.0, r)) - 3.2 * smooth(0.92, 1.2, r);
  const inland = 1 - smooth(0.7, 0.95, r);
  h += (0.45 * Math.sin(x * 0.13) * Math.cos(z * 0.11) + 0.3 * Math.sin(x * 0.07 + z * 0.05)) * inland;
  // Colline du Grand Chêne
  h += gauss(x, z, 0, 0, 16, 5);
  // Collines du nord
  h += gauss(x, z, -16, -36, 11, 3.2) + gauss(x, z, 12, -44, 9, 2.2);
  // Lac de l'ouest
  h -= 6.2 * Math.exp(-((x - SPOTS.lake.x) ** 2 + (z - SPOTS.lake.z) ** 2) / (14 * 14));
  // Clairière des chats : aplanie
  const wc = Math.exp(-((x - SPOTS.clearing.x) ** 2 + (z - SPOTS.clearing.z) ** 2) / (15 * 15));
  h = h * (1 - wc) + 2.4 * wc;
  // Plateau de la cascade (falaise abrupte)
  const dp = Math.hypot(x - SPOTS.plateau.x, z - SPOTS.plateau.z);
  h += PLATEAU_H * (1 - smooth(PLATEAU_R, PLATEAU_R + 1.4, dp));
  return h;
}

// ---------------------------------------------------------------------------
// Obstacles solides
//   box : { type:'box', x, z, w, d, y0, y1 }  (centré en x/z)
//   cyl : { type:'cyl', x, z, r, y0, y1 }
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
// Le tronc s'arrête sous la plate-forme du sommet (la médaille est au centre)
TREE.height = TREE_TOP - 0.6 - treeBase;
cyl(0, 0, TREE.trunkR, treeBase - 2, TREE_TOP - 0.6, { kind: 'trunk' });
cyl(0, 0, 4.6, TREE_TOP - 0.6, TREE_TOP, { kind: 'canopy' });

// Lac : pierres de gué et îlot
export const stones = [-26.5, -30, -33.5, -37, -40.5].map((x, i) => ({ x, z: 5 + (i % 2 ? 1 : -1) * 0.8, top: 0.75 }));
for (const s of stones) cyl(s.x, s.z, 1.15, -4, s.top, { kind: 'stone' });
cyl(SPOTS.islet.x - 1.5, SPOTS.islet.z, 4.2, -4, 1.3, { kind: 'islet' });

// Rochers du nord (balles de tennis perchées)
export const rocks = [
  { x: -18, z: -28, r: 2.0, h: 3.0 },
  { x: 9, z: -31, r: 1.6, h: 1.6 },
  { x: 11.5, z: -33.5, r: 1.6, h: 3.4 },
  { x: 24, z: 30, r: 2.2, h: 2.0 },
];
for (const r of rocks) { const g = heightAt(r.x, r.z); r.top = g + r.h; cyl(r.x, r.z, r.r, g - 2, r.top, { kind: 'rock' }); }

// Ruines anciennes (colonnes, arche, murets) : solides, on peut grimper dessus
export const ruins = [];
{
  const pillar = (x, z, h, broken) => {
    const g = heightAt(x, z);
    const r = { type: 'pillar', x, z, y: g, h, broken: !!broken };
    ruins.push(r);
    cyl(x, z, 0.6, g - 1, g + h, { kind: 'rock' });
  };
  // Arche d'entrée sur le chemin du départ
  pillar(-2.9, 34, 4.2); pillar(2.9, 34, 4.2);
  ruins.push({ type: 'arch', x: 0, z: 34, y: heightAt(0, 34) + 4.2, span: 5.8 });
  // Colonnes le long du chemin du nord
  pillar(-3.6, -15, 3.6); pillar(3.6, -19, 2.0, true); pillar(-3.6, -26, 1.3, true); pillar(3.6, -31, 3.8);
  // Cercle de colonnes autour du piédestal (ouvert côté chemin)
  for (const [a, h, b] of [[0.4, 3.4], [1.0 + Math.PI, 2.2, true], [Math.PI * 0.85, 3.6], [Math.PI * 1.3, 1.5, true], [Math.PI * 1.65, 3.4], [-0.2, 2.6, true]]) {
    pillar(SPOTS.pedestal.x + Math.cos(a) * 6.5, SPOTS.pedestal.z + Math.sin(a) * 6.5, h, b);
  }
  // Murets écroulés
  const wall = (x, z, w, d, h) => {
    const g = heightAt(x, z);
    ruins.push({ type: 'wall', x, z, y: g, w, d, h });
    box(x, z, w, d, g - 1, g + h, { kind: 'rock' });
  };
  wall(-15, 19, 5, 0.9, 1.5);
  wall(17, 22, 0.9, 4.5, 2.1);
  wall(-20, -14, 0.9, 4, 1.2);
}

// Ascenseur vers le plateau (diagonale sud-ouest, à 15 du centre) + passerelle
const DIAG = Math.SQRT1_2;
export const ELEVATOR = { x: SPOTS.plateau.x - 15 * DIAG, z: SPOTS.plateau.z + 15 * DIAG, w: 3, d: 3 };
ELEVATOR.low = heightAt(ELEVATOR.x, ELEVATOR.z) + 0.35;
ELEVATOR.high = heightAt(SPOTS.plateau.x, SPOTS.plateau.z) + 0.05;
export const elevator = box(ELEVATOR.x, ELEVATOR.z, ELEVATOR.w, ELEVATOR.d, ELEVATOR.low - 0.5, ELEVATOR.low, { kind: 'elevator', moving: true });

/** Hauteur du dessus de l'ascenseur à l'instant t (secondes). */
export function elevatorTop(t) {
  const p = (t % 9) / 9;
  // pause en bas, montée, pause en haut, descente
  let k = 0;
  if (p >= 0.2 && p < 0.45) k = smooth(0.2, 0.45, p);
  else if (p >= 0.45 && p < 0.7) k = 1;
  else if (p >= 0.7 && p < 0.95) k = 1 - smooth(0.7, 0.95, p);
  return ELEVATOR.low + (ELEVATOR.high - ELEVATOR.low) * k;
}

// Passerelle entre l'ascenseur (en haut) et le bord du plateau
export const BRIDGE = { x: SPOTS.plateau.x - 11 * DIAG, z: SPOTS.plateau.z + 11 * DIAG, top: ELEVATOR.high, size: 2.4 };
box(BRIDGE.x, BRIDGE.z, BRIDGE.size, BRIDGE.size, BRIDGE.top - 0.5, BRIDGE.top, { kind: 'bridge' });

// Clôture de la clairière (bas, on saute par-dessus) : purement décorative

// Caisses (cassables) : sur l'îlot + quelques-unes ailleurs
export const crates = [
  { id: 'c1', x: -46.5, z: 3.4, content: 'medal' },
  { id: 'c2', x: -44.5, z: 7.2, content: 'heart' },
  { id: 'c3', x: -48, z: 6.6, content: 'heart' },
  { id: 'c4', x: -43.6, z: 3.6, content: 'none' },
  { id: 'c5', x: 30, z: 12, content: 'heart' },
  { id: 'c6', x: -10, z: -20, content: 'heart' },
];
for (const c of crates) {
  const top = c.x < -40 ? 1.3 : heightAt(c.x, c.z);
  c.y = top; // pied de la caisse
}

// ---------------------------------------------------------------------------
// Support : hauteur du sol sous un point (terrain + dessus des obstacles)
// ---------------------------------------------------------------------------
export function colliderTop(c, t) { return c.moving ? elevatorTop(t) : c.y1; }

export function inside(c, x, z, margin) {
  margin = margin || 0;
  if (c.type === 'box') return Math.abs(x - c.x) <= c.w / 2 + margin && Math.abs(z - c.z) <= c.d / 2 + margin;
  return (x - c.x) ** 2 + (z - c.z) ** 2 <= (c.r + margin) ** 2;
}

/**
 * Sol le plus haut sous (x, z) dont le dessus est sous yFeet + step.
 * Retourne { y, collider }.
 */
export function supportAt(x, z, yFeet, t, step) {
  step = step === undefined ? 0.6 : step;
  let best = heightAt(x, z), col = null;
  for (const c of colliders) {
    const top = colliderTop(c, t);
    if (top > best && top <= yFeet + step && inside(c, x, z, 0.25)) { best = top; col = c; }
  }
  return { y: best, collider: col };
}

// ---------------------------------------------------------------------------
// Objets à ramasser
// ---------------------------------------------------------------------------
function groundY(x, z) { return supportAt(x, z, 999, 0, 0).y; }

function line(ax, az, bx, bz, n, lift) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
  }
  return pts;
}
function ring(cx, cz, r, n, lift) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
  }
  return pts;
}

// 100 os dorés, en chemins qui guident vers les défis
export const bones = [].concat(
  line(0, 46, 0, 16, 12),                                   // plage → colline
  treeSteps.map(s => ({ x: s.x, z: s.z, y: s.top + 1.1 })),  // escalier du chêne
  ring(0, 0, 3.2, 3, 0).map(p => ({ x: p.x, z: p.z, y: TREE_TOP + 1.1 })),
  line(6, 10, 25, 5, 8),                                    // vers la clairière
  ring(SPOTS.clearing.x, SPOTS.clearing.z, 6, 8),           // clairière
  stones.map(s => ({ x: s.x, z: s.z, y: s.top + 1.1 })),    // gué
  ring(SPOTS.islet.x - 1.5, SPOTS.islet.z, 2.2, 3, 0).map(p => ({ x: p.x, z: p.z, y: 1.3 + 1.1 })),
  line(-8, 8, -22, 5, 6),                                   // vers le lac
  line(0, -9, 0, -38, 10),                                  // chemin du nord
  rocks.slice(0, 3).map(r => ({ x: r.x, z: r.z, y: r.top + 1.1 })).concat([{ x: -13, z: -24, y: groundY(-13, -24) + 1.1 }]),
  line(20, 40, 42, 28, 8),                                  // plage est
  line(16, -10, ELEVATOR.x + 2, ELEVATOR.z + 2.5, 6),       // vers l'ascenseur
  ring(SPOTS.plateau.x, SPOTS.plateau.z, 5, 6),             // plateau
  ring(SPOTS.spawn.x, SPOTS.spawn.z - 2, 4.5, 6),           // autour du départ
  line(-30, 38, -14, 50, 6),                                // plage ouest
).map((p, i) => ({ id: 'b' + i, x: p.x, y: p.y, z: p.z }));

// 5 balles de tennis
export const balls = [
  { id: 'ball1', x: rocks[0].x, z: rocks[0].z, y: rocks[0].top + 0.9 },
  { id: 'ball2', x: rocks[2].x, z: rocks[2].z, y: rocks[2].top + 0.9 },
  { id: 'ball3', x: -24, z: -42, y: groundY(-24, -42) + 0.9 },
  { id: 'ball4', x: 44, z: -4, y: groundY(44, -4) + 0.9 },
  { id: 'ball5', x: rocks[3].x, z: rocks[3].z, y: rocks[3].top + 0.9 },
];

// Médailles Patounes
export const medals = [
  { id: 'm_tree', x: 0, z: 0, y: TREE_TOP + 1.4, label: 'Le sommet du Grand Chêne', visible: true },
  { id: 'm_cats', x: SPOTS.clearing.x, z: SPOTS.clearing.z, y: groundY(SPOTS.clearing.x, SPOTS.clearing.z) + 1.4, label: 'Les chats bandits', visible: false },
  { id: 'm_crate', x: crates[0].x, z: crates[0].z, y: 1.3 + 1.4, label: 'Les caisses de l\'îlot', visible: false },
  { id: 'm_balls', x: SPOTS.pedestal.x, z: SPOTS.pedestal.z, y: groundY(SPOTS.pedestal.x, SPOTS.pedestal.z) + 2.4, label: 'Les balles de tennis', visible: false },
  { id: 'm_puppy', x: SPOTS.mamie.x + 3, z: SPOTS.mamie.z - 2.5, y: groundY(SPOTS.mamie.x + 3, SPOTS.mamie.z - 2.5) + 1.4, label: 'Biscotte le chiot', visible: false },
];

// Chats bandits
export const cats = [
  { id: 'cat1', x: 32, z: 0, group: 'clearing' },
  { id: 'cat2', x: 40, z: 1, group: 'clearing' },
  { id: 'cat3', x: 34, z: 9, group: 'clearing' },
  { id: 'cat4', x: 41, z: 8, group: 'clearing' },
  { id: 'cat5', x: -6, z: -30, group: 'roam' },
  { id: 'cat6', x: 18, z: -18, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: groundY(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.plateau.x + 3, z: SPOTS.plateau.z - 3, y: groundY(SPOTS.plateau.x + 3, SPOTS.plateau.z - 3) },
};

// Panneaux
export const signs = [
  { x: 3, z: 40, text: ['↑ Le Grand Chêne', '→ Clairière des chats', '← Lac aux Galets'] },
  { x: 14, z: -14, text: ['La cascade est tout là-haut !', 'Prenez l\'ascenseur en bois.'] },
  { x: -3, z: -36, text: ['Piédestal des balles de tennis.', 'Trouvez les 5 balles du parc !'] },
];

// Arbres décoratifs (positions fixes, pseudo-aléatoires)
export const trees = [];
{
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let guard = 0;
  while (trees.length < 46 && guard++ < 2000) {
    const a = rnd() * Math.PI * 2, d = 14 + rnd() * 46;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < 1.0) continue;
    if (Math.hypot(x - SPOTS.clearing.x, z - SPOTS.clearing.z) < 14) continue;
    if (Math.hypot(x - SPOTS.plateau.x, z - SPOTS.plateau.z) < 13) continue;
    if (Math.abs(x) < 4 && z > 8) continue; // chemin du départ
    if (Math.abs(x) < 4 && z < -6 && z > -40) continue; // chemin du nord
    if (Math.hypot(x - SPOTS.mamie.x, z - SPOTS.mamie.z) < 7) continue;
    if (Math.hypot(x - ELEVATOR.x, z - ELEVATOR.z) < 6) continue;
    if (colliders.some(c => c.kind !== 'trunk' && inside(c, x, z, 2))) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z, y: h, s: 0.8 + rnd() * 0.6 });
  }
  for (const t of trees) cyl(t.x, t.z, 0.55 * t.s, t.y - 1, t.y + 5 * t.s, { kind: 'tree' });
}

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: groundY(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };
