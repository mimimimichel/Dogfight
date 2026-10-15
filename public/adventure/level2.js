/*
 * Matcha & Ainu — Niveau 2 : « La Forêt des Moustaches ».
 * Une grande forêt enchantée (400 m de côté) : une rivière la traverse d'ouest en
 * est, depuis la cascade du Plateau Moussu jusqu'à la mer, en passant par le lac
 * du Rocher du Hibou. Données pures (aucune dépendance) : relief, obstacles,
 * objets, personnages. Utilisé par le jeu et par les tests (Node).
 *
 * Plan (le nord est vers -z) :
 *   au sud de la rivière : le départ (Mamie et Biscotte), l'autel des lucioles,
 *   le Village des Hérissons et la Tour des Champignons à l'ouest, le campement
 *   des chats à l'est, le Rocher de la Plage, un rond de fées caché au sud-ouest ;
 *   la rivière : le grand pont de bois, les rondins pour sauter, le radeau de
 *   Gaston la grenouille (il s'arrête à l'Îlot aux Roseaux), le lac du Rocher du
 *   Hibou (souche-tremplin, patte magique et feuilles) ;
 *   au nord : le Bosquet des Lucioles, les cabanes dans les arbres (ponts de
 *   cordes), le Vieux Tronc Creux plein de cristaux, le Plateau Moussu et sa
 *   cascade (un chemin secret passe derrière l'eau), le repaire de la Capitaine
 *   Moustache tout au nord (4 médailles pour entrer).
 *
 * Les 5 médailles demandent d'explorer :
 *   - m_lanterns : 6 lanternes à allumer, partout dans la forêt → médaille sur l'autel ;
 *   - m_owl      : les 3 bébés hiboux de Mère Hulotte à ramener sur le Rocher du Hibou ;
 *   - m_mush     : 12 baies (3 buissons dans 3 coins de la forêt) pour le festin des
 *                  hérissons → la médaille apparaît en haut de la Tour des Champignons ;
 *   - m_cats     : les 5 chats du campement et les 3 chats guetteurs des cabanes ;
 *   - m_boss     : la Capitaine Moustache, dans son repaire.
 */

export const ID = 2;
export const NAME = 'La Forêt des Moustaches';
export const SAVE_KEY = 'dogfight.aventure.niveau2';
export const CAT_PLACE = 'dans la forêt';
export const COLLECT_NAME = 'croquettes dorées';
export const WATER_Y = 0;
export const WORLD = 400;               // côté du monde (m)
export const RADAR = 80;                // demi-côté de la mini-carte (m)
export const ISLAND_R = 182;
export const GRASS_K = 1.2;
export const OWN_TREES = true;          // les arbres sont dessinés par forest.js (par quartiers)

// Ambiance : fin d'après-midi dorée
export const SKY = { top: 0x3a6ad0, horizon: 0xffcf9a, bottom: 0xffe2b8, sunDir: [-0.55, 0.42, 0.5] };
export const LIGHT = { hemi: [0xffe6c8, 0x5a4a30, 0.8], sun: [0xffcf98, 2.3], fog: [70, 250] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.5, big: 2.4, small: 1.7, bushes: 1 };
export const PALETTE = {
  ground: [0x4c9e38, 0x74bc48, 0x2f7c2c],
  leaves: [0x3a8a34, 0x4a9a3c, 0x2e7a2c, 0x5aa844, 0xd8902a, 0x3e9236, 0xe0b030, 0x48a03a],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const len = (a, b) => Math.sqrt(a * a + b * b);   // (plus rapide que Math.hypot : le relief est calculé très souvent)
function gauss(x, z, cx, cz, r, h) { const d2 = (x - cx) ** 2 + (z - cz) ** 2; return d2 > 9 * r * r ? 0 : h * Math.exp(-d2 / (r * r)); }
const flatten = (h, x, z, c, r, y) => { const dx = x - c.x, dz = z - c.z; if (dx > r || dx < -r || dz > r || dz < -r) return h; const w = 1 - smooth(r * 0.65, r, len(dx, dz)); return h * (1 - w) + y * w; };

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------
export const SPOTS = {
  spawn: { x: 0, z: 140 },
  mamie: { x: -7, z: 135 },
  altar: { x: 0, z: 45 },
  village: { x: -70, z: 100 },
  tower: { x: -100, z: 60 },
  camp: { x: 80, z: 60 },
  lake: { x: -75, z: -40 },
  owl: { x: -80, z: -43 },
  arena: { x: 15, z: -140 },
  glade: { x: 45, z: -55 },
  hollow: { x: -25, z: -95 },
  beachRock: { x: 150, z: 45 },
  fairy: { x: -100, z: 118 },
  treehouses: { x: 95, z: -82 },
};
export const OWL_TOP = 9;   // dessus du Rocher du Hibou
const OWL_R = 4.6;

// La rivière : de la cascade du Plateau Moussu jusqu'à la mer (elle traverse le lac du hibou)
export const PLATEAU = { x: -112, z: -108, r: 22, top: 14 };
export const RIVER = [[-96.7, -80], [-86, -60], [-75, -40], [-50, -44], [-25, -30], [0, -18], [30, -12], [60, -10], [90, -16], [120, -10], [150, -2], [195, 4]]
  .map(([x, z]) => ({ x, z }));
{ let s = 0; RIVER.forEach((p, i) => { if (i) s += Math.hypot(p.x - RIVER[i - 1].x, p.z - RIVER[i - 1].z); p.s = s; }); }
export const RIVER_BED = -2.2;
const riverW = (s) => (s < 14 ? 6 : 4.6);
/** Distance au milieu de la rivière, abscisse le long du courant, point le plus proche et direction. */
export function riverInfo(x, z) {
  let best = 1e9, bs = 0, bx = 0, bz = 0, tx = 1, tz = 0;
  for (let i = 1; i < RIVER.length; i++) {
    const a = RIVER[i - 1], b = RIVER[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { const l = Math.sqrt(l2); best = d; bs = a.s + l * t; bx = px; bz = pz; tx = dx / l; tz = dz / l; }
  }
  return { d: best, s: bs, x: bx, z: bz, tx, tz };
}
// (version rapide pour le relief : seulement les tronçons dont la boîte est à moins de m mètres)
const SEGS = RIVER.slice(1).map((b, i) => { const a = RIVER[i]; return { a, b, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; });
const FAR = { d: 1e9, s: 0 };
function riverNear(x, z, m) {
  let best = 1e9, bs = 0;
  for (const g of SEGS) {
    if (x < g.x0 - m || x > g.x1 + m || z < g.z0 - m || z > g.z1 + m) continue;
    const a = g.a, b = g.b, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
    const d = len(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; bs = a.s + Math.sqrt(l2) * t; }
  }
  return best < 1e9 ? { d: best, s: bs } : FAR;
}
/** Point de la rivière à l'abscisse s (milieu du courant). */
export function riverAt(s) {
  s = clamp(s, 0, RIVER[RIVER.length - 1].s);
  for (let i = 1; i < RIVER.length; i++) {
    const a = RIVER[i - 1], b = RIVER[i];
    if (s <= b.s || i === RIVER.length - 1) {
      const k = (s - a.s) / (b.s - a.s), l = b.s - a.s;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
    }
  }
  return { x: RIVER[0].x, z: RIVER[0].z, tx: 1, tz: 0 };
}
// l'Îlot aux Roseaux : un petit élargissement de la rivière, l'îlot au bord du courant
export const POND = { x: 60, z: -19, r: 11 };
export const ISLET = { x: 60, z: -18.8, r: 4.2, top: 1.1 };

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const r = len(x, z) / ISLAND_R;
  let h = 2.4 * (1 - smooth(0.86, 1.0, r)) - 3.2 * smooth(0.95, 1.2, r);
  const inland = 1 - smooth(0.78, 0.96, r);
  // sous-bois qui ondule
  h += (0.5 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06) + 0.35 * Math.sin(x * 0.04 - z * 0.05 + 0.7)) * inland;
  // collines boisées
  h += gauss(x, z, 35, 100, 16, 3) + gauss(x, z, -112, 110, 16, 3) + gauss(x, z, 135, -48, 14, 2.6) + gauss(x, z, -125, -20, 13, 2.6)
    + gauss(x, z, 140, 95, 14, 2.4) + gauss(x, z, -40, 10, 12, 1.8) + gauss(x, z, -60, -120, 14, 2.4) + gauss(x, z, 60, -100, 10, 1.6);
  // le Plateau Moussu (nord-ouest) : une falaise, une cascade
  {
    const P = PLATEAU, d = len(x - P.x, z - P.z), k = 1 - smooth(P.r - 0.8, P.r + 1.2, d);
    h = h * (1 - k) + P.top * k;
  }
  // lieux aplanis
  h = flatten(h, x, z, SPOTS.camp, 16, 2.4);
  h = flatten(h, x, z, SPOTS.arena, 15, 2.6);
  h = flatten(h, x, z, SPOTS.altar, 11, 2.5);
  h = flatten(h, x, z, SPOTS.tower, 9, 2.6);
  h = flatten(h, x, z, SPOTS.village, 17, 2.5);
  h = flatten(h, x, z, SPOTS.glade, 15, 2.4);
  h = flatten(h, x, z, SPOTS.hollow, 11, 2.5);
  h = flatten(h, x, z, SPOTS.treehouses, 30, 2.6);
  h = flatten(h, x, z, SPOTS.spawn, 9, 2.45);
  // la rivière (et son lit)
  {
    const ri = riverNear(x, z, 9), w = riverW(ri.s);
    const k = 1 - smooth(w - 1, w + 2.6, ri.d);
    if (k > 0) h = Math.min(h, h * (1 - k) + RIVER_BED * k);
    const kp = 1 - smooth(POND.r - 2.5, POND.r + 1, len(x - POND.x, z - POND.z));
    h = Math.min(h, h * (1 - kp) + RIVER_BED * kp);
    const ki = 1 - smooth(ISLET.r - 0.8, ISLET.r + 0.6, len(x - ISLET.x, z - ISLET.z));
    h = h * (1 - ki) + ISLET.top * ki;
  }
  // le lac du Rocher du Hibou
  h -= gauss(x, z, SPOTS.lake.x, SPOTS.lake.z, 11, 6.5);
  // Rocher du Hibou : pilier abrupt au milieu du lac
  const d = len(x - SPOTS.owl.x, z - SPOTS.owl.z);
  const k = 1 - smooth(OWL_R, OWL_R + 1.2, d);
  h = h * (1 - k) + OWL_TOP * k;
  return h;
}
export function inWater(x, z, margin) { return heightAt(x, z) < WATER_Y + (margin || 0); }
/** Pas d'herbe haute : dans le Vieux Tronc Creux, au pied de l'autel, au village. */
export function noGrass(x, z) {
  if (Math.hypot(x - SPOTS.hollow.x, z - SPOTS.hollow.z) < 7) return true;
  if (Math.hypot(x - SPOTS.altar.x, z - SPOTS.altar.z) < 3) return true;
  if (Math.hypot(x - SPOTS.village.x, z - SPOTS.village.z) < 4) return true;
  // le ruisseau et la source du Plateau Moussu
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < 3) return true;
  const ux = FALLS.nx, uz = FALLS.nz, px = x - SPRING.x, pz = z - SPRING.z, along = px * ux + pz * uz;
  if (along > 0 && along < PLATEAU.r - 8 && Math.abs(px * uz - pz * ux) < 1.8) return true;
  return false;
}

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
bouncer(-3, 118, 0.8, 1.2, 14);                    // près du départ, pour découvrir

// Lac du hibou : souche-tremplin (on y monte par deux champignons, puis on plane)
export const STUMP = { x: -64, z: -29, r: 2.3 };
STUMP.base = heightAt(STUMP.x, STUMP.z);
STUMP.top = STUMP.base + 11;
cyl(STUMP.x, STUMP.z, STUMP.r, STUMP.base - 1, STUMP.top, { kind: 'stump', solid: true });
bouncer(STUMP.x + 4.6, STUMP.z + 4.2, 0.8, 1.2, 15);                       // petit, au sol
export const BIG_BOUNCER = bouncer(STUMP.x + 3.4, STUMP.z + 0.4, 4.6, 1.6, 21); // grand, à côté de la souche

// Rocher du Hibou (le terrain fait la falaise ; on marche sur le relief)
export const OWL = { x: SPOTS.owl.x, z: SPOTS.owl.z, top: OWL_TOP, r: OWL_R };

// Patte géante : fait pousser des feuilles-plates-formes pendant quelques secondes
export const SWITCH = { x: -67.5, z: -30.5, r: 1.3 };   // au bord du lac, juste devant les feuilles
SWITCH.y = heightAt(SWITCH.x, SWITCH.z);
cyl(SWITCH.x, SWITCH.z, SWITCH.r, SWITCH.y - 0.5, SWITCH.y + 0.25, { kind: 'switch' });
export const LEAF_TIME = 14;
export const leaves = [];
{
  // en ligne droite de la patte jusqu'au rocher, de plus en plus haut
  const dx = SPOTS.owl.x - SWITCH.x, dz = SPOTS.owl.z - SWITCH.z, d = Math.hypot(dx, dz);
  [[3.0, 2.2], [6.0, 4.3], [9.0, 6.4], [11.9, 8.1]].forEach(([o, top]) => leaves.push({ x: SWITCH.x + dx / d * o, z: SWITCH.z + dz / d * o, top: SWITCH.y + top - 0.2 }));
  for (const l of leaves) l.col = cyl(l.x, l.z, 1.45, l.top - 0.35, l.top, { kind: 'leaf', off: true });
}

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

// Le grand pont de bois (sur la rivière, au milieu de la forêt)
export const BRIDGE = { x: 0, z0: -29, z1: -7, w: 3.2, top: 3.0 };
box(BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2, BRIDGE.w, BRIDGE.z1 - BRIDGE.z0, BRIDGE.top - 0.4, BRIDGE.top, { kind: 'bridge' });

// Les rondins : on traverse la rivière en sautant de l'un à l'autre (près du lac)
export const LOGS = [];
{
  const ri = riverInfo(-57, -43), nx = -ri.tz, nz = ri.tx;   // en travers du courant
  for (let i = 0; i < 5; i++) {
    const o = -4.4 + i * 2.2;
    const x = ri.x + nx * o, z = ri.z + nz * o;
    const l = { x, z, r: 0.85, top: 0.6 + (i % 2) * 0.15 };
    l.col = cyl(x, z, l.r, RIVER_BED, l.top, { kind: 'stone', shore: true });
    LOGS.push(l);
  }
}

// Le radeau de Gaston la grenouille : il descend la rivière (arrêt à l'Îlot aux Roseaux)
const proj = (x, z) => riverInfo(x, z).s;
export const RAFT = { r: 1.9, top: 0.45, speed: 5.5 };
RAFT.stops = { A: proj(-40, -38), I: proj(ISLET.x, ISLET.z - 4), B: proj(115, -11) };
/** Les deux pontons : le premier au sud (près du lac), le second au nord (côté cabanes). */
export const DOCKS = [];
for (const [k, side] of [['A', 1], ['B', -1]]) {
  // vers la berge (A : rive sud, +z ; B : rive nord, -z)
  const p = riverAt(RAFT.stops[k]), f = Math.sign(p.tx) * side || side, nxx = -p.tz * f, nzz = p.tx * f;
  const d0 = RAFT.r + 0.3, d1 = 8.5, cx = p.x + nxx * (d0 + d1) / 2, cz = p.z + nzz * (d0 + d1) / 2;
  const D = { id: k, x: cx, z: cz, len: d1 - d0, yaw: Math.atan2(nxx, nzz), top: 0.8, end: { x: p.x + nxx * (d0 + 0.6), z: p.z + nzz * (d0 + 0.6) }, nx: nxx, nz: nzz };
  // le ponton : une suite de petites cases (les obstacles sont alignés sur les axes)
  for (let o = d0 + 0.6; o <= d1 + 0.01; o += 1.1) cyl(p.x + nxx * o, p.z + nzz * o, 1.0, RIVER_BED, D.top, { kind: 'plank' });
  DOCKS.push(D);
}
// le petit ponton de l'îlot (le radeau s'arrête juste au bout)
export const ISLET_JETTY = (() => {
  const p = riverAt(RAFT.stops.I), dx = p.x - ISLET.x, dz = p.z - ISLET.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  const d0 = ISLET.r - 1.4, d1 = d - RAFT.r - 0.75, top = ISLET.top - 0.15;
  for (let o = d0; o <= d1 + 0.01; o += (d1 - d0) / Math.max(1, Math.round((d1 - d0) / 1.0))) cyl(ISLET.x + ux * o, ISLET.z + uz * o, 0.85, RIVER_BED, top, { kind: 'plank' });
  return { x0: ISLET.x + ux * d0, z0: ISLET.z + uz * d0, x1: ISLET.x + ux * d1, z1: ISLET.z + uz * d1, top, yaw: Math.atan2(ux, uz), end: { x: ISLET.x + ux * d1, z: ISLET.z + uz * d1 } };
})();
export const RAFT_COL = { type: 'cyl', x: 0, z: 0, r: RAFT.r, y0: -1, y1: RAFT.top, kind: 'raft', moving: true, dx: 0, dz: 0 };
{ const p = riverAt(RAFT.stops.A); RAFT_COL.x = p.x; RAFT_COL.z = p.z; }
colliders.push(RAFT_COL);

// Les cabanes dans les arbres : 4 grands arbres, des plates-formes, des ponts de cordes
export const TREEHOUSES = [{ x: 80, z: -62 }, { x: 100, z: -72 }, { x: 110, z: -92 }, { x: 88, z: -100 }]
  .map((t, i) => Object.assign(t, { id: i, y: heightAt(t.x, t.z), r: 4.2, trunk: 1.6 }));
export const TH_TOP = heightAt(SPOTS.treehouses.x, SPOTS.treehouses.z) + 8;
for (const t of TREEHOUSES) {
  t.top = TH_TOP;
  cyl(t.x, t.z, t.trunk, t.y - 1, t.y + 19, { kind: 'trunk' });
  cyl(t.x, t.z, t.r, TH_TOP - 0.35, TH_TOP, { kind: 'plank' });
}
// escalier de planches qui tourne autour du premier arbre
export const TH_STEPS = [];
{
  const T = TREEHOUSES[0], n = 8, R = 5.5;
  for (let i = 0; i < n; i++) {
    const a = 1.9 + i * 0.36;                      // du sud-ouest vers le nord
    const s = { x: T.x + Math.cos(a) * R, z: T.z + Math.sin(a) * R, r: 0.95, top: T.y + 0.95 * (i + 1), a };
    s.col = cyl(s.x, s.z, s.r, s.top - 0.3, s.top, { kind: 'plank' });
    TH_STEPS.push(s);
  }
}
export const ROPE_BRIDGES = [];
for (let i = 1; i < TREEHOUSES.length; i++) {
  const a = TREEHOUSES[i - 1], b = TREEHOUSES[i], d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
  const x0 = a.x + ux * (a.r - 0.4), z0 = a.z + uz * (a.r - 0.4), x1 = b.x - ux * (b.r - 0.4), z1 = b.z - uz * (b.r - 0.4);
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 1.1);
  const br = { x0, z0, x1, z1, len, yaw: Math.atan2(ux, uz), top: TH_TOP };
  for (let k = 0; k <= n; k++) cyl(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, 1.0, TH_TOP - 0.3, TH_TOP, { kind: 'plank' });
  ROPE_BRIDGES.push(br);
}

// Le Vieux Tronc Creux : un arbre géant tout creux, plein de cristaux qui brillent (entrée au sud)
const HO = SPOTS.hollow;
export const HOLLOW = { x: HO.x, z: HO.z, r: 6.2, h: 3.6, y: heightAt(HO.x, HO.z), door: 3.4 };
{
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = HO.x + Math.cos(a) * HOLLOW.r, z = HO.z + Math.sin(a) * HOLLOW.r;
    if (z > HO.z && Math.abs(x - HO.x) < HOLLOW.door / 2 + 0.9) continue;   // la porte (vers le sud, +z)
    cyl(x, z, 0.85, HOLLOW.y - 1, HOLLOW.y + HOLLOW.h, { kind: 'rock', cam: true, wall: true });
  }
}
export const HOLLOW_CRYSTALS = [];
{
  let s = 41;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.6) continue;   // pas devant la porte
    const d = 4.3 + r() * 0.8;
    HOLLOW_CRYSTALS.push({ x: HO.x + Math.cos(a) * d, z: HO.z + Math.sin(a) * d, h: 0.9 + r() * 1.3, a, c: [0x3ee8d8, 0xb070ff, 0xff70c8, 0x70b0ff][i % 4] });
  }
}

// Le Plateau Moussu : un escalier de rochers contre la falaise ; la cascade tombe dans la mare
export const PLATEAU_STEPS = [];
{
  const P = PLATEAU, R = P.r + 1.1;
  for (let i = 0; i < 10; i++) {
    const a = 0.62 - i * 0.068;                 // le long de la falaise, côté est
    const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R, g = heightAt(x, z);
    const k = { x, z, r: 1.0, y: g, top: 2.4 + 1.18 * (i + 1) };
    k.col = cyl(x, z, k.r, g - 1, k.top, { kind: 'rock' });
    PLATEAU_STEPS.push(k);
  }
}
export const FALLS = (() => {
  const P = PLATEAU, ux = (RIVER[0].x - P.x), uz = (RIVER[0].z - P.z), l = Math.hypot(ux, uz);
  const d = P.r + 3.2;
  return { x: P.x + ux / l * d, z: P.z + uz / l * d, nx: ux / l, nz: uz / l, w: 9, top: P.top, yaw: Math.atan2(ux / l, uz / l) };
})();
/** Derrière la cascade : la petite corniche entre la falaise et le rideau d'eau. */
export const BEHIND_FALLS = { x: PLATEAU.x + FALLS.nx * (PLATEAU.r + 2.2), z: PLATEAU.z + FALLS.nz * (PLATEAU.r + 2.2) };
export const SPRING = { x: PLATEAU.x + FALLS.nx * 9, z: PLATEAU.z + FALLS.nz * 9 };

// Le Rocher de la Plage (à l'est) et quelques gros rochers à grimper
export const rocks = [{ x: SPOTS.beachRock.x, z: SPOTS.beachRock.z, r: 2.4, h: 3.0 }, { x: SPOTS.beachRock.x - 4.2, z: SPOTS.beachRock.z + 2.6, r: 1.5, h: 1.4 },
  { x: -146, z: 26, r: 1.8, h: 2.2 }, { x: 128, z: 108, r: 1.6, h: 1.8 }, { x: 64, z: -132, r: 1.7, h: 2.0 }];
for (const r of rocks) { const g = heightAt(r.x, r.z); r.y = g; r.top = g + r.h; cyl(r.x, r.z, r.r * 1.15, g - 2, r.top, { kind: 'rock' }); }

// Le Village des Hérissons : maisons-champignons autour de la grande marmite
const VG = SPOTS.village;
export const POT = { x: VG.x, z: VG.z, r: 1.2, y: heightAt(VG.x, VG.z) };
cyl(POT.x, POT.z, POT.r, POT.y - 1, POT.y + 1.1, { kind: 'rock' });
export const MUSH_HOUSES = [0.3, 1.25, 2.2, 3.3, 4.3, 5.35].map((a, i) => {
  const R = 11 + (i % 2) * 1.5, x = VG.x + Math.cos(a) * R, z = VG.z + Math.sin(a) * R, g = heightAt(x, z);
  const hgt = 3.4 + (i % 3) * 0.5, capR = 2.8 + (i % 2) * 0.4;
  const h = { x, z, y: g, h: hgt, r: 1.8, capR, yaw: Math.atan2(VG.x - x, VG.z - z), col: ['#e0453a', '#f08a2a', '#a066e0', '#e85a9a', '#3a9ae0', '#e0b030'][i] };
  cyl(x, z, h.r, g - 1, g + hgt, { kind: 'rock', solid: true });
  h.cap = cyl(x, z, capR, g + hgt, g + hgt + 0.55, { kind: 'cap' });
  h.top = g + hgt + 0.55;
  return h;
});
// un champignon rebondissant pour monter sur les toits du village
export const VILLAGE_BOUNCER = bouncer(VG.x + Math.cos(1.75) * 8, VG.z + Math.sin(1.75) * 8, 0.8, 1.2, 14.5);

// Les baies : 3 coins de la forêt, 4 buissons chacun (une poignée de baies par buisson)
export const BERRY_PATCHES = [
  { id: 'east', x: 122, z: 100, name: 'à l\'est, près de la plage' },
  { id: 'west', x: -142, z: 18, name: 'tout à l\'ouest' },
  { id: 'north', x: 55, z: -124, name: 'au nord, de l\'autre côté de la rivière' },
];
export const BUSHES = [];
BERRY_PATCHES.forEach((P, pi) => {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + pi * 0.6, x = P.x + Math.cos(a) * 4.2, z = P.z + Math.sin(a) * 4.2;
    BUSHES.push({ id: 'b' + (pi * 4 + i), patch: P.id, x, z, y: heightAt(x, z), col: [0x3a5ad8, 0xe0304a, 0x8a3ab8][pi] });
  }
});
export const BERRIES_NEEDED = 12;

// Le Bosquet des Lucioles (fleurs qui brillent, champignons lumineux)
export const GLADE = { x: SPOTS.glade.x, z: SPOTS.glade.z, r: 13, y: heightAt(SPOTS.glade.x, SPOTS.glade.z) };

// Le rond de fées (caché dans un coin, au sud-ouest)
export const FAIRY = { x: SPOTS.fairy.x, z: SPOTS.fairy.z, r: 3.6, y: heightAt(SPOTS.fairy.x, SPOTS.fairy.z) };

// Arbres géants (décor, troncs solides)
export const giants = [[-20, 112, 1.15], [22, 110, 1.25], [-120, 80, 1.1], [120, 30, 1.2], [-40, 60, 1.0], [48, 20, 1.0], [-130, 140, 1.05],
  [-55, -78, 1.1], [30, -95, 1.15], [-150, -55, 1.0], [140, -70, 1.1], [-25, -140, 1.05], [70, 130, 1.0]]
  .map(([x, z, s]) => ({ x, z, s, y: heightAt(x, z) }));
for (const g of giants) cyl(g.x, g.z, 1.5 * g.s, g.y - 1, g.y + 16 * g.s, { kind: 'trunk' });

// Caisses (cassables, un cœur dedans)
export const crates = [
  { id: 'c1', x: 70, z: 70, content: 'heart' },
  { id: 'c2', x: 95, z: 52, content: 'heart' },
  { id: 'c3', x: 10, z: -60, content: 'heart' },
  { id: 'c4', x: -20, z: 120, content: 'heart' },
  { id: 'c5', x: -86, z: 75, content: 'none' },
  { id: 'c6', x: -40, z: -18, content: 'heart' },
  { id: 'c7', x: 22, z: -128, content: 'heart' },
  { id: 'c8', x: -90, z: -100, content: 'heart' },
  { id: 'c9', x: 76, z: -78, content: 'heart' },
];
for (const c of crates) c.y = heightAt(c.x, c.z);

// ---------------------------------------------------------------------------
// Grille spatiale et support : sol le plus haut sous un point (terrain + obstacles)
// ---------------------------------------------------------------------------
const CELL = 16, OFF = 32;
let grid = new Map();
const ALWAYS = [];                   // obstacles qui bougent (le radeau) : toujours examinés
const key = (i, j) => (i + OFF) * 128 + (j + OFF);
function bbox(c) { return c.type === 'box' ? [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r]; }
function indexAll() {
  grid = new Map(); ALWAYS.length = 0;
  for (const c of colliders) {
    if (c.moving) { ALWAYS.push(c); continue; }
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
  const out = ALWAYS.slice(), s = ++stamp;
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
/** Un chat ne traverse pas les murs (tentes, tronc creux, maisons). */
export function blockedAt(x, z) {
  for (const c of near(x, z, 0.5)) if ((c.solid || c.kind === 'rock' || c.kind === 'trunk') && !c.off && inside(c, x, z, 0.4)) return true;
  return false;
}
indexAll();

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
function groundY(x, z) {
  // ignore les feuilles (absentes au départ), la porte, le radeau et les murs
  let best = heightAt(x, z);
  for (const c of near(x, z, 0.3)) if (!c.off && c.kind !== 'gate' && c.kind !== 'raft' && c.kind !== 'tree' && c.kind !== 'trunk' && !c.wall && c.kind !== 'bridge' && c.y1 > best && inside(c, x, z, 0.25)) best = c.y1;
  return Math.max(best, WATER_Y + 0.4);
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
const on = (o, top, dy) => ({ x: o.x, z: o.z, y: top + (dy || 1.15) });

// Lanternes de la forêt (on les allume d'un coup de queue tournoyant) : 6, une par coin de forêt
const TH4 = TREEHOUSES[3];
export const lanterns = [
  { id: 'l1', x: towerCaps[4].x, z: towerCaps[4].z, y: towerCaps[4].top, where: 'sur la Tour des Champignons' },
  { id: 'l2', x: BEHIND_FALLS.x, z: BEHIND_FALLS.z, where: 'derrière la cascade' },
  { id: 'l3', x: HOLLOW.x + 0.8, z: HOLLOW.z - 1.2, where: 'dans le Vieux Tronc Creux' },
  { id: 'l4', x: TH4.x - 2.7, z: TH4.z + 1.2, y: TH_TOP, where: 'en haut des cabanes dans les arbres' },
  { id: 'l5', x: GLADE.x + 1, z: GLADE.z, where: 'au Bosquet des Lucioles' },
  { id: 'l6', x: rocks[0].x, z: rocks[0].z, y: rocks[0].top, where: 'sur le Rocher de la Plage' },
].map(l => Object.assign(l, { y: l.y === undefined ? groundY(l.x, l.z) : l.y }));

// Les bébés hiboux de Mère Hulotte (il faut les ramener sur le Rocher du Hibou)
const TH3 = TREEHOUSES[2];
export const OWLETS = [
  { id: 'o1', name: 'Plume', x: SPRING.x + 2.5, z: SPRING.z + 1.5, where: 'en haut du Plateau Moussu, près de la source' },
  { id: 'o2', name: 'Pompon', x: ISLET.x - 1.2, z: ISLET.z - 1.0, where: 'sur l\'Îlot aux Roseaux, au milieu de la rivière' },
  { id: 'o3', name: 'Myrtille', x: TH3.x + 2.6, z: TH3.z - 1.2, y: TH_TOP, where: 'en haut des cabanes dans les arbres' },
].map(o => Object.assign(o, { y: o.y === undefined ? groundY(o.x, o.z) : o.y }));
/** Le nid de Mère Hulotte, en haut du Rocher du Hibou. */
export const NEST = { x: OWL.x + 1.4, z: OWL.z + 0.8, y: OWL_TOP };
export const HULOTTE = { x: OWL.x - 1.6, z: OWL.z - 1.2, y: OWL_TOP };

// Personnages de la forêt
export const npcs = {
  mamie: { x: SPOTS.mamie.x, z: SPOTS.mamie.z, y: groundY(SPOTS.mamie.x, SPOTS.mamie.z) },
  puppy: { x: SPOTS.mamie.x + 1.6, z: SPOTS.mamie.z + 1.2, y: groundY(SPOTS.mamie.x + 1.6, SPOTS.mamie.z + 1.2) },
};
export const FRIENDS = {
  noisette: { x: POT.x + 2.6, z: POT.z + 2.2, kind: 'hedgehog', name: 'Noisette la hérissonne' },
  pistache: { x: TREEHOUSES[0].x - 2.4, z: TREEHOUSES[0].z + 1.6, y: TH_TOP, kind: 'squirrel', name: 'Pistache l\'écureuil' },
  gaston: { kind: 'frog', name: 'Gaston la grenouille' },
};
for (const k of ['noisette', 'pistache']) { const f = FRIENDS[k]; if (f.y === undefined) f.y = groundY(f.x, f.z); f.yaw = Math.atan2(SPOTS.spawn.x - f.x, SPOTS.spawn.z - f.z); }
FRIENDS.pistache.yaw = Math.atan2(TH_STEPS[TH_STEPS.length - 1].x - FRIENDS.pistache.x, TH_STEPS[TH_STEPS.length - 1].z - FRIENDS.pistache.z);
cyl(FRIENDS.noisette.x, FRIENDS.noisette.z, 0.6, FRIENDS.noisette.y - 0.5, FRIENDS.noisette.y + 0.9, { kind: 'npc', solid: true });
indexAll();

// 100 croquettes dorées, dans toute la forêt : sur les chemins, et cachées loin d'eux
const HOLLOW_IN = { x: HOLLOW.x, z: HOLLOW.z };
const all = [].concat(
  line(0, 128, 0, 58, 5),                                                   // départ → autel
  ring(SPOTS.altar.x, SPOTS.altar.z, 5.5, 4, 1.1, 0.3),                     // autour de l'autel
  line(-8, 50, -56, 90, 4),                                                 // vers le village
  ring(VG.x, VG.z, 6, 3, 1.1, 0.8),                                         // la place du village
  MUSH_HOUSES.slice(0, 3).map(h => on(h, h.top)),                           // sur les toits (champignon rebondissant)
  [1, 3, 5, 7].map(i => on(towerCaps[i], towerCaps[i].top)),                // la spirale de la tour
  ring(TW.x, TW.z, 2.2, 2, 0, 0.4).map(p => ({ x: p.x, z: p.z, y: TOWER_TOP + 1.1 })),
  line(8, 50, 66, 64, 3),                                                   // vers le campement
  ring(CP.x, CP.z, 10, 4, 1.1, 0.3),                                        // le campement
  line(94, 62, 140, 48, 2),                                                 // vers le Rocher de la Plage
  [on(rocks[1], rocks[1].top), on(rocks[0], rocks[0].top, 1.1)].map((p, i) => (i ? { x: p.x + 1.3, z: p.z - 0.6, y: p.y } : p)),
  BUSHES.filter((b, i) => i % 4 === 1).map(b => ({ x: b.x + (BERRY_PATCHES.find(p => p.id === b.patch).x - b.x) * 0.5, z: b.z + (BERRY_PATCHES.find(p => p.id === b.patch).z - b.z) * 0.5, y: groundY(b.x, b.z) + 1.1 })),
  [on(rocks[2], rocks[2].top), on(rocks[3], rocks[3].top), on(rocks[4], rocks[4].top)],   // sur les rochers près des baies
  ring(FAIRY.x, FAIRY.z, 1.7, 4, 1.1, 0.2),                                 // le rond de fées (secret)
  line(0, 32, 0, 2, 2),                                                    // vers le pont
  [BRIDGE.z0 + 4, BRIDGE.z1 - 4].map(z => ({ x: BRIDGE.x, z, y: BRIDGE.top + 1.1 })),
  LOGS.filter((l, i) => i % 2 === 1).map(l => on(l, l.top)),                // sur les rondins
  [on(ISLET, ISLET.top), { x: ISLET.x + 1.8, z: ISLET.z - 1.2, y: ISLET.top + 1.1 }, { x: ISLET.x - 2, z: ISLET.z + 1.5, y: ISLET.top + 1.1 }],
  line(-10, 36, -52, -16, 2),                                               // vers le lac
  [on(STUMP, STUMP.top), { x: BIG_BOUNCER.x, z: BIG_BOUNCER.z, y: BIG_BOUNCER.top + 3 }],
  leaves.map(l => on(l, l.top)),                                            // au-dessus des feuilles magiques
  ring(OWL.x, OWL.z, 2.4, 2, 0, 0.9).map(p => ({ x: p.x, z: p.z, y: OWL_TOP + 1.1 })),
  line(2, -36, 13, -118, 3),                                                // le chemin du nord
  ring(AR.x, AR.z, 6, 3, 1.1, 0.5),                                         // dans le repaire
  ring(GLADE.x, GLADE.z, 6, 4, 1.1, 0.1),                                   // le Bosquet des Lucioles
  TH_STEPS.filter((s, i) => i % 2 === 1).map(s => on(s, s.top)),            // l'escalier de la cabane
  ROPE_BRIDGES.map(b => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: b.top + 1.1 })),   // les ponts de cordes
  TREEHOUSES.slice(2).map(t => ({ x: t.x + 2.6, z: t.z + 2.2, y: TH_TOP + 1.1 })),
  ring(HOLLOW_IN.x, HOLLOW_IN.z, 3.2, 4, 1.1, 0.5),                         // dans le Vieux Tronc Creux
  line(-32, -100, -84, -100, 2),                                            // vers le Plateau Moussu
  PLATEAU_STEPS.filter((k, i) => i % 3 === 1).map(k => on(k, k.top)),       // l'escalier de rochers
  [on(SPRING, PLATEAU.top), { x: SPRING.x - 5, z: SPRING.z + 3, y: PLATEAU.top + 1.1 }, { x: SPRING.x + 4, z: SPRING.z - 5, y: PLATEAU.top + 1.1 }],
  [-1.6, 1.6].map(o => ({ x: BEHIND_FALLS.x - FALLS.nz * o * 1.4, z: BEHIND_FALLS.z + FALLS.nx * o * 1.4, y: groundY(BEHIND_FALLS.x - FALLS.nz * o * 1.4, BEHIND_FALLS.z + FALLS.nx * o * 1.4) + 1.1 })),
  giants.slice(7, 9).map(g => { const x = g.x + 3, z = g.z + 2.4; return { x, z, y: groundY(x, z) + 1.1 }; }),   // au pied des grands arbres du nord
);
export const _POINTS = all.length;
export const bones = all.slice(0, 100).map((p, i) => ({ id: 'k' + i, x: p.x, y: p.y, z: p.z }));

export const balls = [];

// Médailles Patounes (les 5 missions de la forêt) — toutes cachées au départ
export const medals = [
  { id: 'm_mush', x: TW.x, z: TW.z, y: TOWER_TOP + 1.4, label: 'Le festin des hérissons', visible: false },
  { id: 'm_cats', x: CP.x, z: CP.z - 3.5, y: groundY(CP.x, CP.z - 3.5) + 1.6, label: 'Le campement des chats', visible: false },
  { id: 'm_lanterns', x: SPOTS.altar.x, z: SPOTS.altar.z, y: heightAt(SPOTS.altar.x, SPOTS.altar.z) + 2.6, label: 'Les lanternes des lucioles', visible: false },
  { id: 'm_owl', x: OWL.x, z: OWL.z, y: OWL_TOP + 1.4, label: 'Les bébés de Mère Hulotte', visible: false },
  { id: 'm_boss', x: AR.x, z: AR.z, y: ARENA.y + 1.4, label: 'La Capitaine Moustache', visible: false },
];

// Chats bandits : 5 au campement, 3 guetteurs dans les cabanes (ils comptent tous), et des errants
export const cats = [
  { id: 'cat1', x: CP.x - 3, z: CP.z - 1, group: 'clearing' },
  { id: 'cat2', x: CP.x + 3, z: CP.z + 1, group: 'clearing' },
  { id: 'cat3', x: CP.x, z: CP.z - 5, group: 'clearing' },
  { id: 'cat4', x: CP.x - 2, z: CP.z + 6, group: 'clearing' },
  { id: 'cat5', x: CP.x + 5, z: CP.z - 2, group: 'clearing' },
  { id: 'cat9', x: TREEHOUSES[1].x - 2.6, z: TREEHOUSES[1].z - 1.8, group: 'clearing', lookout: true },
  { id: 'cat10', x: TREEHOUSES[2].x - 2.4, z: TREEHOUSES[2].z + 2.2, group: 'clearing', lookout: true },
  { id: 'cat11', x: TREEHOUSES[3].x + 2.6, z: TREEHOUSES[3].z - 1.6, group: 'clearing', lookout: true },
  { id: 'cat6', x: -20, z: 80, group: 'roam' },
  { id: 'cat7', x: -110, z: 30, group: 'roam' },
  { id: 'cat8', x: 30, z: -80, group: 'roam' },
  { id: 'cat12', x: 110, z: 85, group: 'roam' },
  { id: 'cat13', x: -60, z: -110, group: 'roam' },
].map(c => Object.assign(c, { y: groundY(c.x, c.z) }));
export const CAMP_CATS = cats.filter(c => c.group === 'clearing' && !c.lookout).length;

// Panneaux
export const signs = [
  { x: 4, z: 126, text: ['La Forêt des Moustaches', '↑ L\'autel des lucioles et la rivière', 'La forêt est grande : suivez les chemins !'] },
  { x: 5, z: 55, text: ['Autel des lucioles', 'Allumez les 6 lanternes de la forêt', 'd\'un coup de queue tournoyant !'] },
  { x: -8, z: 56, text: ['← Le Village des Hérissons', '← La Tour des Champignons', '→ Le campement des chats'] },
  { x: -50, z: -12, text: ['Le lac du Rocher du Hibou', 'Montez sur la souche et planez,', 'ou sautez sur la patte magique !'] },
  { x: -42, z: -30, text: ['Le radeau de Gaston', 'Montez dessus : il descend la rivière', 'et s\'arrête à l\'Îlot aux Roseaux.'] },
  { x: 4.5, z: -36, text: ['↑ Le repaire de la Capitaine', '← Le Vieux Tronc Creux et la cascade', '→ Le Bosquet des Lucioles et les cabanes'] },
  { x: 8, z: -122, text: ['Repaire de la Capitaine Moustache.', `Il faut ${GATE_MEDALS} médailles pour entrer !`] },
  { x: -70, z: 88, text: ['Le Village des Hérissons', 'Noisette prépare un grand festin…', 'mais il lui manque des baies !'] },
];

export const START = { x: SPOTS.spawn.x, z: SPOTS.spawn.z, y: groundY(SPOTS.spawn.x, SPOTS.spawn.z), yaw: Math.PI };

// Chemins de terre
export const PATHS = [
  [[0, 138], [0, 52]], [[-5, 48], [-60, 94]], [[-78, 92], [-96, 66]], [[5, 48], [70, 64]], [[90, 62], [140, 48]],
  [[0, 40], [0, -6]], [[0, -30], [13, -127]], [[3, -46], [36, -54]], [[54, -58], [76, -62]], [[-2, -62], [-22, -88]],
  [[-30, -100], [-88, -98]], [[-4, 38], [-50, -16]], [[0, 136], [-5, 135]],
];

// Cristaux lumineux (champignons phosphorescents) dans la forêt
export const CRYSTALS = [[-4.5, 49.5, 0x3ee8d8], [4.5, 40.5, 0xb070ff], [-58, -20, 0x3ee8d8], [8, -40, 0xff70c8], [-96, 98, 0xb070ff], [36, 118, 0x3ee8d8],
  [-95, -96, 0x70b0ff], [124, -40, 0xb070ff]];

export const ruins = [];

// Arbres (forêt dense, partout)
export const trees = [];
{
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const keep = [[SPOTS.camp, 17], [SPOTS.arena, 16], [SPOTS.altar, 12], [SPOTS.tower, 10], [SPOTS.mamie, 8], [SPOTS.spawn, 10], [STUMP, 9], [SWITCH, 5],
    [SPOTS.village, 18], [GLADE, 14], [HOLLOW, 9], [SPOTS.treehouses, 24], [FAIRY, 6], [POND, 14], [PLATEAU, PLATEAU.r + 5], [SPOTS.beachRock, 8]];
  BERRY_PATCHES.forEach(p => keep.push([p, 8]));
  const tgrid = new Map(), tk = (x, z) => Math.floor(x / 8) + ',' + Math.floor(z / 8);
  const tooClose = (x, z, d) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = tgrid.get((Math.floor(x / 8) + i) + ',' + (Math.floor(z / 8) + j));
      if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < d) return true;
    }
    return false;
  };
  const pathD = (x, z) => {
    let b = 1e9;
    for (const [[ax, az], [bx, bz]] of PATHS) {
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1);
      b = Math.min(b, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return b;
  };
  let guard = 0;
  while (trees.length < 340 && guard++ < 30000) {
    const x = (rnd() - 0.5) * 340, z = (rnd() - 0.5) * 340;
    if (Math.hypot(x, z) > 160) continue;
    const h = heightAt(x, z);
    if (h < 1.2 || h > 5) continue;
    if (keep.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
    if (pathD(x, z) < 3.4) continue;
    if (riverInfo(x, z).d < 10) continue;
    if (near(x, z, 3).some(c => inside(c, x, z, 2.2))) continue;
    if (lanterns.some(l => Math.hypot(l.x - x, l.z - z) < 3.5)) continue;
    if (all.some(b => Math.hypot(b.x - x, b.z - z) < 2.2)) continue;
    if (crates.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (signs.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (BUSHES.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    if (cats.some(c => Math.hypot(c.x - x, c.z - z) < 3)) continue;
    if (tooClose(x, z, 6.2)) continue;
    // pas d'arbre à cheval sur une pente (la moitié des racines dans le vide)
    let cliff = false;
    for (let a = 0; a < 6.28 && !cliff; a += 0.785) if (Math.abs(heightAt(x + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2) - h) > 1.3) cliff = true;
    if (cliff) continue;
    // des grands arbres, et des plus petits entre eux (la forêt paraît plus touffue)
    const small = rnd() < 0.33;
    const t = small ? { x, z, y: h, s: 0.85 + rnd() * 0.35, h: 4.6 + rnd() * 1.8 } : { x, z, y: h, s: 0.95 + rnd() * 0.7, h: 8.5 + rnd() * 3 };
    trees.push(t);
    const k = tk(x, z); if (!tgrid.has(k)) tgrid.set(k, []); tgrid.get(k).push(t);
  }
  for (const t of trees) cyl(t.x, t.z, 0.55 * t.s, t.y - 1, t.y + t.h, { kind: 'tree' });
  indexAll();
}

/** Mini-carte : le plateau, le tronc creux, le village, le bosquet. */
export function mapColor(x, z) {
  const P = PLATEAU;
  if (Math.hypot(x - P.x, z - P.z) < P.r) return [128, 168, 96];
  if (Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.r + 0.8) return [122, 84, 50];
  if (Math.hypot(x - POT.x, z - POT.z) < 3) return [200, 160, 110];
  return null;
}
export function drawMap(x, X, k) {
  // ponts et pontons (traits de bois)
  x.strokeStyle = '#a0703e'; x.lineCap = 'round';
  x.lineWidth = Math.max(2, BRIDGE.w * k);
  x.beginPath(); x.moveTo(X(BRIDGE.x), X(BRIDGE.z0)); x.lineTo(X(BRIDGE.x), X(BRIDGE.z1)); x.stroke();
  x.lineWidth = Math.max(1.5, 1.6 * k);
  for (const b of ROPE_BRIDGES) { x.beginPath(); x.moveTo(X(b.x0), X(b.z0)); x.lineTo(X(b.x1), X(b.z1)); x.stroke(); }
  x.fillStyle = '#a0703e';
  for (const t of TREEHOUSES) { x.beginPath(); x.arc(X(t.x), X(t.z), t.r * k, 0, 7); x.fill(); }
  for (const h of MUSH_HOUSES) { x.fillStyle = h.col; x.beginPath(); x.arc(X(h.x), X(h.z), Math.max(2, h.capR * k * 0.8), 0, 7); x.fill(); }
}
export { clamp as _clamp };
