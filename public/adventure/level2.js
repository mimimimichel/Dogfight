/*
 * Matcha & Ainu — Niveau 2 : « La Forêt des Moustaches ».
 * Données pures (aucune dépendance) : relief, obstacles, objets, personnages.
 * Utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   départ au sud, Mamie et Biscotte à l'orée du bois ;
 *   au centre, l'autel des lucioles (5 lanternes à allumer dans la forêt) ;
 *   à l'ouest, la Tour des Champignons ; à l'est, le campement des chats ;
 *   au nord-ouest, le lac et le Rocher du Hibou (planer depuis la souche,
 *   ou faire pousser des feuilles avec la patte géante) ;
 *   au nord, le repaire de la Capitaine Moustache (4 médailles pour entrer).
 */

export const ID = 2;
export const NAME = 'La Forêt des Moustaches';
export const SAVE_KEY = 'dogfight.aventure.niveau2';
export const CAT_PLACE = 'au campement';
export const COLLECT_NAME = 'croquettes dorées';
export const WATER_Y = 0;
export const ISLAND_R = 70;

// Ambiance : fin d'après-midi dorée
export const SKY = { top: 0x3a6ad0, horizon: 0xffcf9a, bottom: 0xffe2b8, sunDir: [-0.55, 0.42, 0.5] };
export const LIGHT = { hemi: [0xffe6c8, 0x5a4a30, 0.8], sun: [0xffcf98, 2.3], fog: [60, 210] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.5, big: 2.4, small: 1.7, bushes: 1 };
export const PALETTE = {
  ground: [0x4c9e38, 0x74bc48, 0x2f7c2c],
  leaves: [0x3a8a34, 0x4a9a3c, 0x2e7a2c, 0x5aa844, 0xd8902a, 0x3e9236, 0xe0b030, 0x48a03a],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function gauss(x, z, cx, cz, r, h) { return h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)); }
const flatten = (h, x, z, c, r, y) => { const w = 1 - smooth(r * 0.7, r, Math.hypot(x - c.x, z - c.z)); return h * (1 - w) + y * w; };

// Lieux importants
export const SPOTS = {
  spawn: { x: 0, z: 52 },
  mamie: { x: -6, z: 46 },
  altar: { x: 0, z: 0 },
  tower: { x: -34, z: 10 },
  camp: { x: 32, z: 4 },
  lake: { x: -30, z: -36 },
  owl: { x: -35, z: -39 },
  arena: { x: 14, z: -42 },
};
export const OWL_TOP = 9;   // dessus du Rocher du Hibou
const OWL_R = 4.6;

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z) / ISLAND_R;
  let h = 2.4 * (1 - smooth(0.78, 1.0, r)) - 3.2 * smooth(0.92, 1.2, r);
  const inland = 1 - smooth(0.7, 0.95, r);
  h += (0.5 * Math.sin(x * 0.12 + 1) * Math.cos(z * 0.1) + 0.3 * Math.sin(x * 0.07 - z * 0.06)) * inland;
  // collines boisées
  h += gauss(x, z, 30, 34, 9, 2.4) + gauss(x, z, -8, -56, 12, 2.6) + gauss(x, z, -44, 30, 10, 1.8) + gauss(x, z, 46, -22, 9, 2);
  // lac du nord-ouest
  h -= 6.5 * Math.exp(-((x - SPOTS.lake.x) ** 2 + (z - SPOTS.lake.z) ** 2) / (11 * 11));
  // lieux aplanis
  h = flatten(h, x, z, SPOTS.camp, 14, 2.4);
  h = flatten(h, x, z, SPOTS.arena, 14, 2.6);
  h = flatten(h, x, z, SPOTS.altar, 9, 2.5);
  h = flatten(h, x, z, SPOTS.tower, 8, 2.6);
  // Rocher du Hibou : pilier abrupt au milieu du lac
  const d = Math.hypot(x - SPOTS.owl.x, z - SPOTS.owl.z);
  const k = 1 - smooth(OWL_R, OWL_R + 1.2, d);
  h = h * (1 - k) + OWL_TOP * k;
  return h;
}
export function inWater() { return false; }

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Tour des Champignons : pied central + chapeaux en spirale + grand chapeau au sommet
const TW = SPOTS.tower;
export const TOWER = { x: TW.x, z: TW.z, base: heightAt(TW.x, TW.z), stalkR: 1.5 };
export const towerCaps = [];
for (let i = 0; i < 9; i++) {
  const a = Math.PI * 0.35 + i * 0.8;
  const x = TW.x + Math.cos(a) * 4.5, z = TW.z + Math.sin(a) * 4.5;
  const top = TOWER.base + 1.7 + i * 1.75;
  towerCaps.push({ x, z, top, a, r: 1.55 });
  cyl(x, z, 1.55, top - 0.45, top, { kind: 'cap' });
}
export const TOWER_TOP = TOWER.base + 1.7 + 9 * 1.75;
cyl(TW.x, TW.z, TOWER.stalkR, TOWER.base - 2, TOWER_TOP - 0.6, { kind: 'trunk' });
export const TOWER_TOP_R = 3.1;
cyl(TW.x, TW.z, TOWER_TOP_R, TOWER_TOP - 0.6, TOWER_TOP, { kind: 'cap' });

// Champignons rebondissants (bounce = vitesse verticale donnée)
export const bouncers = [];
const bouncer = (x, z, h, r, bounce, base) => {
  const g = base === undefined ? heightAt(x, z) : base;
  const b = { x, z, r, top: g + h, base: g, bounce };
  bouncers.push(b);
  b.col = cyl(x, z, r, g - 0.5, g + h, { kind: 'bouncer', bounce });
  return b;
};
bouncer(TW.x + 6.5, TW.z + 4, 0.9, 1.3, 15);      // au pied de la tour, pour s'amuser
bouncer(-3, 30, 0.8, 1.2, 14);                     // près du départ, pour découvrir
bouncer(24, -16, 0.9, 1.3, 15);                    // sur le chemin du repaire

// Souche-tremplin au bord du lac : on y monte par deux champignons, puis on plane
export const STUMP = { x: -19, z: -25, r: 2.3 };
STUMP.base = heightAt(STUMP.x, STUMP.z);
STUMP.top = STUMP.base + 11;
cyl(STUMP.x, STUMP.z, STUMP.r, STUMP.base - 1, STUMP.top, { kind: 'stump', solid: true });
bouncer(STUMP.x + 4.6, STUMP.z + 4.2, 0.8, 1.2, 15);                       // petit, au sol
export const BIG_BOUNCER = bouncer(STUMP.x + 3.4, STUMP.z + 0.4, 4.6, 1.6, 21); // grand, à côté de la souche

// Rocher du Hibou (le terrain fait la falaise ; on marche sur le relief)
export const OWL = { x: SPOTS.owl.x, z: SPOTS.owl.z, top: OWL_TOP, r: OWL_R };

// Patte géante : fait pousser des feuilles-plates-formes pendant quelques secondes
export const SWITCH = { x: -22.5, z: -26.5, r: 1.3 };   // au bord du lac, juste devant les feuilles
SWITCH.y = heightAt(SWITCH.x, SWITCH.z);
cyl(SWITCH.x, SWITCH.z, SWITCH.r, SWITCH.y - 0.5, SWITCH.y + 0.25, { kind: 'switch' });
export const LEAF_TIME = 14;
export const leaves = [
  { x: -23.2, z: -30.2, top: 3.4 },
  { x: -26.4, z: -32.6, top: 5.6 },
  { x: -29.6, z: -35.0, top: 7.6 },
].map(l => Object.assign(l, { col: cyl(l.x, l.z, 1.45, l.top - 0.35, l.top, { kind: 'leaf', off: true }) }));

// Campement des chats : tentes (solides) et feu de camp
const CP = SPOTS.camp;
export const tents = [[-6, -5, 0.6], [6.5, -4, -0.7], [-5.5, 6, 2.4], [7, 5.5, -2.3]].map(([dx, dz, rot]) => {
  const x = CP.x + dx, z = CP.z + dz, g = heightAt(x, z);
  cyl(x, z, 1.7, g - 1, g + 2.2, { kind: 'rock' });
  return { x, z, y: g, rot };
});
export const CAMPFIRE = { x: CP.x, z: CP.z, y: heightAt(CP.x, CP.z) };

// Repaire de la Capitaine Moustache : cercle de rochers, porte au sud
const AR = SPOTS.arena;
export const ARENA = { x: AR.x, z: AR.z, r: 10.5, y: heightAt(AR.x, AR.z) };
export const arenaRocks = [];
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2;
  if (Math.abs(a - Math.PI / 2) < 0.2) continue; // l'ouverture (vers le sud, +z)
  const x = AR.x + Math.cos(a) * ARENA.r, z = AR.z + Math.sin(a) * ARENA.r;
  const g = heightAt(x, z), h = 3.2 + ((i * 7) % 5) * 0.35;
  arenaRocks.push({ x, z, y: g, h });
  cyl(x, z, 1.45, g - 1, g + h, { kind: 'rock' });
}
export const GATE = box(AR.x, AR.z + ARENA.r, 3.4, 1.2, ARENA.y - 1, ARENA.y + 3.4, { kind: 'gate', solid: true });
export const GATE_MEDALS = 4;

// Arbres géants (décor, troncs solides)
export const giants = [[-15, 24, 1.15], [17, 22, 1.25], [-48, -10, 1.1], [42, -12, 1.2], [-6, -30, 1.0], [48, 20, 1.0], [-30, 40, 1.05]]
  .map(([x, z, s]) => ({ x, z, s, y: heightAt(x, z) }));
for (const g of giants) cyl(g.x, g.z, 1.5 * g.s, g.y - 1, g.y + 16 * g.s, { kind: 'trunk' });

// Rochers à grimper (lanterne, croquettes)
export const rocks = [{ x: 30, z: 34, r: 2.2, h: 2.6 }, { x: -46, z: 28, r: 1.8, h: 2.2 }];
for (const r of rocks) { const g = heightAt(r.x, r.z); r.top = g + r.h; cyl(r.x, r.z, r.r, g - 2, r.top, { kind: 'rock' }); }

// Caisses (cassables)
export const crates = [
  { id: 'c1', x: 27, z: 11, content: 'heart' },
  { id: 'c2', x: 38, z: -2, content: 'heart' },
  { id: 'c3', x: 9, z: -27, content: 'heart' },
  { id: 'c4', x: -20, z: 32, content: 'heart' },
  { id: 'c5', x: -27, z: 15, content: 'none' },
  { id: 'c6', x: -14, z: -14, content: 'heart' },
];
for (const c of crates) c.y = heightAt(c.x, c.z);

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

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
function groundY(x, z) {
  // ignore les feuilles (absentes au départ) et la porte
  let best = heightAt(x, z);
  for (const c of colliders) if (!c.off && c.kind !== 'gate' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return best;
}
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

// Lanternes de la forêt (on les allume d'un coup de queue tournoyant)
export const lanterns = [
  { id: 'l1', x: 6, z: 32 },
  { id: 'l2', x: towerCaps[4].x, z: towerCaps[4].z, y: towerCaps[4].top },
  { id: 'l3', x: 21, z: -1 },
  { id: 'l4', x: -12, z: -17 },
  { id: 'l5', x: rocks[0].x, z: rocks[0].z, y: rocks[0].top },
].map(l => Object.assign(l, { y: l.y === undefined ? groundY(l.x, l.z) : l.y }));

// 100 croquettes dorées
const all = [].concat(
  line(0, 46, 0, 12, 12),                                         // départ → clairière
  ring(SPOTS.altar.x, SPOTS.altar.z, 5.5, 6),                     // autour de l'autel
  line(-6, 5, -26, 9, 7),                                         // vers la tour
  towerCaps.map(c => ({ x: c.x, z: c.z, y: c.top + 1.1 })),       // spirale de champignons
  ring(TW.x, TW.z, 2.6, 3, 0).map(p => ({ x: p.x, z: p.z, y: TOWER_TOP + 1.1 })),
  line(6, 4, 21, 3, 6),                                           // vers le campement
  ring(CP.x, CP.z, 10, 9, 1.1, 0.3),                              // campement
  line(-3, -6, -14, -18, 6),                                      // vers le lac
  [{ x: STUMP.x, z: STUMP.z, y: STUMP.top + 1.1 }, { x: BIG_BOUNCER.x, z: BIG_BOUNCER.z, y: BIG_BOUNCER.top + 3 }],
  leaves.map(l => ({ x: l.x, z: l.z, y: l.top + 1.1 })),          // au-dessus des feuilles magiques
  ring(OWL.x, OWL.z, 2.4, 4, 0).map(p => ({ x: p.x, z: p.z, y: OWL_TOP + 1.1 })),
  line(3, -7, 12, -27, 7),                                        // vers le repaire
  ring(AR.x, AR.z, 6, 6, 1.1, 0.5),                               // dans le repaire
  line(22, 40, 42, 24, 7),                                        // plage est
  [{ x: rocks[1].x, z: rocks[1].z, y: rocks[1].top + 1.1 }],
  line(-28, 38, -12, 49, 6),                                      // plage ouest
  line(30, -8, 40, -18, 4),                                       // sous-bois de l'est
  line(-40, -8, -44, 6, 4),                                       // sous-bois de l'ouest
);
export const bones = all.slice(0, 100).map((p, i) => ({ id: 'k' + i, x: p.x, y: p.y, z: p.z }));

export const balls = [];

// Médailles Patounes
export const medals = [
  { id: 'm_mush', x: TW.x, z: TW.z, y: TOWER_TOP + 1.4, label: 'Le sommet de la Tour des Champignons', visible: true },
  { id: 'm_cats', x: CP.x, z: CP.z - 3.5, y: groundY(CP.x, CP.z - 3.5) + 1.6, label: 'Le campement des chats', visible: false },
  { id: 'm_lanterns', x: SPOTS.altar.x, z: SPOTS.altar.z, y: heightAt(SPOTS.altar.x, SPOTS.altar.z) + 2.6, label: 'Les lanternes des lucioles', visible: false },
  { id: 'm_owl', x: OWL.x, z: OWL.z, y: OWL_TOP + 1.4, label: 'Le Rocher du Hibou', visible: true },
  { id: 'm_boss', x: AR.x, z: AR.z, y: ARENA.y + 1.4, label: 'La Capitaine Moustache', visible: false },
];

// Chats bandits
export const cats = [
  { id: 'cat1', x: CP.x - 3, z: CP.z - 1, group: 'clearing' },
  { id: 'cat2', x: CP.x + 3, z: CP.z + 1, group: 'clearing' },
  { id: 'cat3', x: CP.x, z: CP.z - 5, group: 'clearing' },
  { id: 'cat4', x: CP.x - 2, z: CP.z + 6, group: 'clearing' },
  { id: 'cat5', x: CP.x + 5, z: CP.z - 2, group: 'clearing' },
  { id: 'cat6', x: -8, z: 20, group: 'roam' },
  { id: 'cat7', x: -24, z: -6, group: 'roam' },
  { id: 'cat8', x: 30, z: -26, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));

// Personnages
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: groundY(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.mamie.x + 1.6, z: SPOTS.mamie.z + 1.2, y: groundY(SPOTS.mamie.x + 1.6, SPOTS.mamie.z + 1.2) },
};

// Panneaux
export const signs = [
  { x: 3.5, z: 40, text: ['↑ Clairière des Lucioles', '← Tour des Champignons', '→ Campement des chats'] },
  { x: -10, z: -12, text: ['Rocher du Hibou, au milieu du lac.', 'Montez sur la souche et planez !', 'Ou sautez sur la patte magique, au bord du lac…'] },
  { x: -20.2, z: -28.6, text: ['Patte magique !', 'Sautez dessus : des feuilles', 'poussent sur le lac pour aller au rocher.'] },
  { x: 9, z: -24, text: ['Repaire de la Capitaine Moustache.', `Il faut ${GATE_MEDALS} médailles pour entrer !`] },
  { x: 3.5, z: 6, text: ['Autel des lucioles.', 'Allumez les 5 lanternes de la forêt', 'd\'un coup de queue tournoyant !'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: groundY(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Chemins de terre
export const PATHS = [
  [[0, 48], [0, 8]], [[-5, 4], [-28, 9]], [[5, 4], [22, 4]], [[-3, -6], [-14, -18]], [[3, -6], [13, -29]], [[0, 46], [-5, 45]],
];

// Cristaux lumineux (champignons phosphorescents)
export const CRYSTALS = [[-4.5, 4.5, 0x3ee8d8], [4.5, -4.5, 0xb070ff], [-16, -21, 0x3ee8d8], [10, -31, 0xff70c8], [-38, 15, 0xb070ff], [27, 30, 0x3ee8d8]];

export const ruins = [];

// Arbres (forêt dense)
export const trees = [];
{
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const keep = [[SPOTS.camp, 15], [SPOTS.arena, 14], [SPOTS.altar, 9], [SPOTS.tower, 9], [SPOTS.mamie, 7], [SPOTS.spawn, 6], [STUMP, 8], [SWITCH, 4]];
  let guard = 0;
  while (trees.length < 72 && guard++ < 4000) {
    const a = rnd() * Math.PI * 2, d = 10 + rnd() * 52;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < 1.0) continue;
    if (keep.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
    if (Math.abs(x) < 3.5 && z > 6) continue; // chemin du départ
    if (PATHS.some(([[ax, az], [bx, bz]]) => {
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
      return Math.hypot(x - ax - t * dx, z - az - t * dz) < 3;
    })) continue;
    if (colliders.some(c => inside(c, x, z, 2.2))) continue;
    if (lanterns.some(l => Math.hypot(l.x - x, l.z - z) < 3)) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 5.2)) continue;
    const sc = 0.95 + rnd() * 0.7;
    trees.push({ x, z, y: h, s: sc, h: 8.5 + rnd() * 3 });
  }
  // pas d'arbre à cheval sur une falaise (la moitié des racines dans le vide)
  const onCliff = (t) => { for (let a = 0; a < 6.28; a += 0.785) if (Math.abs(heightAt(t.x + Math.cos(a) * 2.2, t.z + Math.sin(a) * 2.2) - t.y) > 1.3) return true; return false; };
  // ni sur le Rocher du Hibou (la statue a besoin de place)
  for (let i = trees.length - 1; i >= 0; i--) if (onCliff(trees[i]) || Math.hypot(trees[i].x - OWL.x, trees[i].z - OWL.z) < OWL.r + 2.5) trees.splice(i, 1);
  for (const t of trees) cyl(t.x, t.z, 0.55 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
}
