/*
 * Matcha & Ainu — Niveau 6 : « La Plage aux Coquillages ».
 * Données pures (aucune dépendance) : relief, obstacles, objets, personnages.
 * Utilisé par le jeu (beach.js, beachplay.js) et par les tests (Node).
 *
 * Grand monde (±200 m), le nord est vers -z, la mer est au nord :
 *   au sud, le Village de la Plage (départ, Mamie, le glacier de Gino, le chamboule-tout) ;
 *   au centre, la Grande Plage : poste de secours de Mistral et ses bodyboards, fort de sable des chats ;
 *   le long ponton de Barnabé qui s'avance dans la mer ;
 *   au large, l'Île aux Mouettes (on y va en bodyboard) ;
 *   à l'est, la falaise du phare (la gardienne Perle), puis la Crique de l'Épave ;
 *   au sud-ouest, les grandes dunes (la Grande Dune, des creux cachés) et la palmeraie ;
 *   à l'ouest, les Rochers aux flaques et la Grotte aux Flaques (bébé phoque, Roi des Crabes).
 *   Des petits tas de sable qui scintillent cachent des coquillages : on y creuse (bouton Attaque).
 */

export const ID = 6;
export const NAME = 'La Plage aux Coquillages';
export const SAVE_KEY = 'dogfight.aventure.niveau6';
export const CAT_PLACE = 'dans le fort de sable';
export const COLLECT_NAME = 'coquillages';
export const MEDAL_TITLE = 'MÉDAILLE DE LA PLAGE !';
export const WATER_Y = 0;
export const NO_TERRAIN = true;        // le sable et la mer sont construits par beach.js
export const SURFACE = 'dirt';         // bruit de pas : sable doux
export const GRASS_K = 0.3;
export const HALF = 200;               // le terrain couvre ±200 m
export const WORLD = 400;              // grand monde : carte en radar, ombres qui suivent sur téléphone
export const RADAR = 75;

// Ambiance : plein été, ciel bleu, soleil derrière le départ (la mer est bien éclairée)
export const SKY = { top: 0x2f86e6, horizon: 0xcdeeff, bottom: 0xf4f8ff, sunDir: [0.3, 0.62, 0.62] };
export const LIGHT = { hemi: [0xf4fbff, 0xe8d0a8, 0.95], sun: [0xfff2dc, 2.7], fog: [110, 330] };
export const GRADE = { bloom: 0.5, saturation: 1.1, highTint: [0.02, 0.014, 0.0], shadowTint: [0.0, 0.008, 0.03] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.1, big: 1.8, small: 1.3, bushes: 1 };
export const PALETTE = {
  ground: [0xf0d9a4, 0xf6e4b8, 0xe2c48a],
  leaves: [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const mix = (a, b, k) => a + (b - a) * k;
const gauss = (x, z, cx, cz, r, h) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

// ---------------------------------------------------------------------------
// Relief
// ---------------------------------------------------------------------------
/** Ligne du rivage : z de la limite eau / sable (la mer est du côté des z plus petits). */
export function shoreZ(x) {
  let z = -5 + 4.5 * Math.sin(x * 0.035 + 0.6);
  z = mix(z, -22 + 5 * Math.sin(x * 0.05), smooth(-85, -110, x));      // côte rocheuse de l'ouest
  z = mix(z, 8 + 6 * Math.sin(x * 0.06), smooth(112, 125, x));         // la Crique de l'Épave, à l'est
  return z;
}
/** Distance au rivage (positive sur la plage, négative dans la mer). */
export const fromShore = (x, z) => z - shoreZ(x);
/** Houle des rouleaux (la même que celle dessinée par beach.js) : hauteur de l'eau au temps t. */
export function swell(x, z, t) {
  const u = fromShore(x, z);
  return 0.16 * Math.sin(u * 0.5 - t * 1.4) * smooth(-17, -10, u) * (1 - smooth(-2.5, 0, u));
}

export const PROMENADE_Y = 3.2;
export const PLATEAU_Y = 12;          // dessus de la falaise du phare
export const HEAD = { x0: 66, x1: 116, z0: -111 };   // la falaise du phare (plateau)
export const ISLAND = { x: -40, z: -130, r: 15, top: 3 };
export const GRANDE_DUNE = { x: -95, z: 95, r: 17, h: 7 };
export const GROVE = { x: -140, z: 128, r: 18 };
export const CAVE = { x: -150, z: -6, r: 9 };

// Rochers aux flaques (ouest) : un plateau de roche bas, avec des flaques
export const POOLS = [
  { id: 'p1', x: -122, z: -8, r: 2.6 }, { id: 'p2', x: -132, z: 6, r: 2.2 }, { id: 'p3', x: -110, z: -14, r: 2.0 },
  { id: 'seal', x: CAVE.x - 1.5, z: CAVE.z - 2.5, r: 2.4 },   // la flaque du bébé phoque, au fond de la grotte
];
function rockShelf(x, z) {
  const u = fromShore(x, z);
  const m = smooth(-92, -100, x) * smooth(-187, -180, x) * smooth(-4, -1, u) * smooth(30, 22, u);
  if (m <= 0) return null;
  let h = 1.0 + 0.25 * Math.sin(x * 0.7 + z * 0.4) * Math.cos(z * 0.55 - x * 0.2);
  for (const p of POOLS) { const d = Math.hypot(x - p.x, z - p.z); h -= 0.75 * (1 - smooth(p.r * 0.55, p.r, d)); }
  return { h, m };
}
// creux cachés dans les dunes (on n'y voit rien de loin)
export const HOLLOWS = [{ x: -128, z: 72, r: 6 }, { x: -62, z: 142, r: 6 }, { x: -168, z: 98, r: 5 }];

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const u = fromShore(x, z);
  let h;
  if (u >= 0) {
    h = 1.9 * (1 - Math.exp(-u / 13));
    // dunes : des bosses douces entre la plage et la promenade
    const band = Math.exp(-(((u - 36) / 8) ** 2));
    h += band * (1.1 + 0.9 * Math.sin(x * 0.11 + 1) + 0.45 * Math.sin(x * 0.27 - 0.6)) * 0.85;
    // la promenade et le village, à plat
    h = mix(h, PROMENADE_Y, smooth(44, 50, u));
  } else {
    h = Math.max(-9, 0.13 * u - 0.0045 * u * u);
  }
  // les grandes dunes du sud-ouest, la Grande Dune, les creux cachés, la palmeraie
  const dm = smooth(-12, -28, x) * smooth(44, 56, u) * smooth(186, 178, -x);
  if (dm > 0) {
    let d = 1.6 * (Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06) + 1) + 0.8 * Math.sin(x * 0.13 - z * 0.05);
    d += gauss(x, z, GRANDE_DUNE.x, GRANDE_DUNE.z, GRANDE_DUNE.r, GRANDE_DUNE.h);
    for (const o of HOLLOWS) d -= gauss(x, z, o.x, o.z, o.r, 2.6);
    const gw = 1 - smooth(GROVE.r * 0.6, GROVE.r, Math.hypot(x - GROVE.x, z - GROVE.z));
    d = mix(d, 0.5, gw);
    h += Math.max(-0.4, d) * dm;
  }
  // rochers aux flaques
  const rs = rockShelf(x, z);
  if (rs) h = mix(h, Math.max(h, rs.h), rs.m);
  // la falaise du phare (un plateau d'herbe, une longue pente douce au sud)
  const head = smooth(HEAD.x0, HEAD.x0 + 1.5, x) * smooth(HEAD.x1 + 0.5, HEAD.x1 - 1, x) * smooth(HEAD.z0 - 1, HEAD.z0 + 0.5, z);
  if (head > 0) {
    const hh = PLATEAU_Y - (PLATEAU_Y - PROMENADE_Y) * smooth(8, 72, z);
    h = mix(h, Math.max(h, hh), head);
  }
  // l'Île aux Mouettes
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r + 6) h = Math.max(h, ISLAND.top - 0.0133 * di * di);
  // bords du monde : falaises à l'ouest et à l'est, talus au sud
  h = mix(h, Math.max(h, 14), smooth(-187.5, -189, x));
  h = mix(h, Math.max(h, 14), smooth(188, 189.5, x));
  h = mix(h, Math.max(h, 12), smooth(172, 174, z));
  return h;
}
/** Dans l'eau (assez profond pour mouiller) ? */
export function inWater(x, z, m) { return heightAt(x, z) < WATER_Y + (m || 0); }
/** Pas d'herbe sur le sable : la falaise, le talus du sud, la palmeraie et quelques touffes des dunes. */
export function noGrass(x, z) {
  if (x > HEAD.x0 + 1.5 && x < HEAD.x1 - 1 && heightAt(x, z) > 8.5) return false;
  if (z > 170) return false;
  if (Math.hypot(x - GROVE.x, z - GROVE.z) < GROVE.r) return false;
  const u = fromShore(x, z);
  if (u > 30 && Math.sin(x * 0.9) * Math.cos(z * 0.8) > 0.5) return false;   // oyats
  return true;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Le long ponton de Barnabé, et son bateau au bout
export const PIER = { x: 35, z0: 18, z1: -62, w: 3.4, top: 1.6, endW: 12, endD: 6 };
box(PIER.x, (PIER.z0 + PIER.z1) / 2, PIER.w, PIER.z0 - PIER.z1, -9, PIER.top, { kind: 'deck', map: '#c8a070' });
box(PIER.x, PIER.z1 - PIER.endD / 2 + 0.01, PIER.endW, PIER.endD, -9, PIER.top, { kind: 'deck', map: '#c8a070' });
export const BOAT = { x: PIER.x + PIER.endW / 2 + 2.2, z: PIER.z1 - 3, yaw: 0 };

// Le phare, au bout de la falaise
export const LIGHTHOUSE = { x: 92, z: -97, r: 2.4, base: PLATEAU_Y, top: PLATEAU_Y + 15, capR: 3.4 };
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.r, LIGHTHOUSE.base - 1, LIGHTHOUSE.top - 0.6, { kind: 'lighthouse', solid: true, cam: true });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.capR, LIGHTHOUSE.top - 0.6, LIGHTHOUSE.top, { kind: 'cap' });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, 0.95, LIGHTHOUSE.top, LIGHTHOUSE.top + 2.2, { kind: 'lamp', solid: true });
export const lighthouseSteps = [];
for (let i = 0; i < 12; i++) {
  const a = Math.PI * 0.5 + i * 0.62;                          // départ côté sud (on arrive par le plateau)
  const x = LIGHTHOUSE.x + Math.cos(a) * 3.9, z = LIGHTHOUSE.z + Math.sin(a) * 3.9;
  const top = LIGHTHOUSE.base + 1.0 + i * 1.18;
  lighthouseSteps.push({ x, z, top, a, r: 1.3 });
  cyl(x, z, 1.3, top - 0.35, top, { kind: 'stone' });
}

// Le Fort de Sable des chats (ouest de la Grande Plage) : un rempart de tours, porte au sud
export const FORT = { x: -45, z: 16, r: 8, gate: Math.PI / 2 };
FORT.y = heightAt(FORT.x, FORT.z);
export const fortTowers = [];
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  if (Math.abs(a - FORT.gate) < 0.3) continue;                 // la porte (vers le sud, +z)
  const big = i % 5 === 0 || Math.abs(a - FORT.gate) < 0.5;
  const x = FORT.x + Math.cos(a) * FORT.r, z = FORT.z + Math.sin(a) * FORT.r, g = heightAt(x, z);
  const h = big ? 2.9 : 1.75, r = big ? 1.45 : 1.3;
  fortTowers.push({ x, z, y: g, h, r, big, a });
  cyl(x, z, r, g - 1, g + h, { kind: 'rock', sand: true });
}
export const KEEP = { x: FORT.x, z: FORT.z - FORT.r - 0.4, r: 1.9 };
KEEP.y = heightAt(KEEP.x, KEEP.z); KEEP.top = KEEP.y + 3.6;
cyl(KEEP.x, KEEP.z, KEEP.r, KEEP.y - 1, KEEP.top, { kind: 'rock', sand: true });
/** Les 4 drapeaux des chats, plantés sur les grandes tours : à faire tomber d'un coup de queue. */
export const FORT_FLAGS = [0, 2.3, 3.8, 5.3].map(a => fortTowers.reduce((best, t) => (Math.abs(t.a - a) < Math.abs(best.a - a) ? t : best))).map((t, i) => ({ id: 'f' + i, x: t.x, z: t.z, y: t.y + t.h }));

// La Grotte aux Flaques (ouest) : un cirque de grands rochers ouvert au sud-est, des flaques qui brillent
export const caveRocks = [];
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  if (a > Math.PI * 0.05 && a < Math.PI * 0.55) continue;     // l'entrée (vers +x / +z)
  const x = CAVE.x + Math.cos(a) * CAVE.r, z = CAVE.z + Math.sin(a) * CAVE.r, g = heightAt(x, z);
  const h = 4.5 + (i % 3) * 0.9;
  caveRocks.push({ x, z, y: g, h, r: 2.3, a });
  cyl(x, z, 2.3, g - 1.5, g + h, { kind: 'rock', cam: true });
}
// le promontoire au-dessus de la grotte (on y grimpe par trois rochers, une lentille du phare y brille)
export const CAVE_TOP = { x: CAVE.x - 4, z: CAVE.z - 7.5, r: 2.2 };
CAVE_TOP.top = heightAt(CAVE_TOP.x, CAVE_TOP.z) + 7.4;
cyl(CAVE_TOP.x, CAVE_TOP.z, CAVE_TOP.r, CAVE_TOP.top - 3, CAVE_TOP.top, { kind: 'rock' });
export const caveSteps = [[CAVE.x + 8, CAVE.z - 9, 1.6], [CAVE.x + 5, CAVE.z - 12, 3.5], [CAVE.x + 1, CAVE.z - 12, 5.4]].map(([x, z, dh]) => {
  const g = heightAt(x, z), r = { x, z, r: 1.5, y: g, top: g + dh };
  cyl(x, z, 1.5, g - 1, r.top, { kind: 'rock' });
  return r;
});

// Rochers (ouest) : on grimpe dessus
export const rocks = [
  { x: -118, z: 6, r: 1.8, h: 1.6 }, { x: -110, z: -4, r: 1.5, h: 1.2 }, { x: -128, z: -16, r: 2.0, h: 2.2 },
  { x: -170, z: 12, r: 2.2, h: 2.6 }, { x: -104, z: 14, r: 1.3, h: 1.0 }, { x: -138, z: 18, r: 1.7, h: 1.8 },
];
for (const r of rocks) { r.y = heightAt(r.x, r.z); r.top = r.y + r.h; cyl(r.x, r.z, r.r, r.y - 1.5, r.top, { kind: 'rock' }); }
// le gros rocher de Maman Phoque, dans la mer
export const SEAL_ROCK = { x: -140, z: -44, r: 2.6 };
SEAL_ROCK.top = 1.2;
cyl(SEAL_ROCK.x, SEAL_ROCK.z, SEAL_ROCK.r, -6, SEAL_ROCK.top, { kind: 'rock' });

// L'Épave (Crique de l'Épave, à l'est) : une vieille coque échouée, la poupe en l'air
export const WRECK = { x: 158, z: 26, yaw: 0.5, len: 18, w: 5.6 };
WRECK.y = heightAt(WRECK.x, WRECK.z);
{
  const W = WRECK, ca = Math.cos(W.yaw), sa = Math.sin(W.yaw);
  const at = (f, s) => ({ x: W.x + sa * f + ca * s, z: W.z + ca * f - sa * s });   // f : vers l'avant, s : à droite
  W.at = at;
  // flancs de la coque (le flanc droit est éventré au milieu : on entre par la brèche)
  for (let f = -8; f <= 8; f += 2) {
    for (const s of [-1, 1]) {
      if (s === 1 && f >= -2 && f <= 2) continue;
      const p = at(f, s * (W.w / 2 - 0.3 * Math.abs(f) / 8));
      cyl(p.x, p.z, 0.9, W.y - 1, W.y + 3.2 + (f < -4 ? 1.5 : 0), { kind: 'rock', wreck: true });
    }
  }
  // le pont arrière (on y monte par les caisses) et la hune du mât cassé
  const deck = at(-5.5, 0);
  W.deck = { x: deck.x, z: deck.z, top: W.y + 4.7 };
  cyl(deck.x, deck.z, 2.6, W.y + 3.6, W.deck.top, { kind: 'deck', wreck: true });
  W.steps = [[-3.5, 4.6, 1.2], [-5.5, 5.4, 2.4], [-7.5, 4.4, 3.6]].map(([f, s, dh]) => { const p = at(f, s); const r = { x: p.x, z: p.z, top: W.y + dh, r: 0.85 }; box(p.x, p.z, 1.6, 1.6, W.y - 0.5, r.top, { kind: 'crate', solid: true }); return r; });
  const mast = at(1.5, 0);
  W.mast = { x: mast.x, z: mast.z };
  cyl(mast.x, mast.z, 0.35, W.y, W.y + 7.6, { kind: 'trunk' });
  W.nest = { x: mast.x, z: mast.z, top: W.y + 8.2, r: 1.5 };
  cyl(mast.x, mast.z, 1.5, W.nest.top - 0.3, W.nest.top, { kind: 'deck', wreck: true });
  // des tonneaux pour grimper jusqu'à la hune, depuis le pont arrière
  W.barrels = [[-2.6, -1.2, 5.9], [-0.2, -1.7, 7.1]].map(([f, s, top]) => { const p = at(f, s); const r = { x: p.x, z: p.z, top: W.y + top, r: 0.75 }; cyl(p.x, p.z, 0.75, W.y + top - 0.8, r.top, { kind: 'deck', wreck: true }); return r; });
  W.hold = at(-1, 1.2);         // dans la cale (la bouteille avec un morceau de carte)
}

// Poste de secours et planches de bodyboard (au centre de la Grande Plage)
export const LIFEGUARD = { x: 6, z: 10, top: 3.4 };
LIFEGUARD.y = heightAt(LIFEGUARD.x, LIFEGUARD.z);
cyl(LIFEGUARD.x, LIFEGUARD.z, 1.6, LIFEGUARD.top - 0.3, LIFEGUARD.top, { kind: 'deck' });
export const lifeguardSteps = [0, 1].map(i => ({ x: LIFEGUARD.x + 2.4 + i * 0.2, z: LIFEGUARD.z + 1.4 - i * 1.6, top: LIFEGUARD.y + 1.15 + i * 1.1 }));
for (const s of lifeguardSteps) cyl(s.x, s.z, 0.9, s.top - 0.25, s.top, { kind: 'deck' });
export const RACK = { x: 17, z: 6 };
RACK.y = heightAt(RACK.x, RACK.z);
/** Mise à l'eau des planches (juste devant le poste), le nez vers le large. */
export const LAUNCH = { x: 16, z: -7, yaw: Math.PI };
export const BOARDS = [0xff5a3a, 0x3ab0ff, 0xffd23a, 0x7ad83a, 0xff7ad8, 0xb07aff];

// Le village : maisons, cabines, glacier, chamboule-tout
export const VILLAGE = { x: 28, z: 100 };
export const houses = [];
{
  const cols = [0xf6e0b0, 0xbfe0f0, 0xf6c8c0, 0xe0f0c8, 0xfff2d8, 0xd8d0f0];
  [[-6, 82, 0], [-8, 120, 0.1], [62, 82, -0.05], [66, 118, 0], [10, 138, 0], [48, 140, 0.05], [90, 128, 0], [-2, 100, 0]].forEach(([x, z, rot], i) => {
    const y = heightAt(x, z), w = 7, d = 6;
    houses.push({ x, z, y, w, d, rot, color: cols[i % cols.length], roof: [0xd8583a, 0x3a7ad8, 0xe8a030, 0x5aa850][i % 4] });
    box(x, z, w, d, y - 0.5, y + 4.2, { kind: 'house', solid: true, cam: true, map: '#e8dcc8' });
  });
}
export const ICECREAM = { x: 42, z: 96, yaw: Math.PI };
ICECREAM.y = heightAt(ICECREAM.x, ICECREAM.z);
box(ICECREAM.x, ICECREAM.z + 1.4, 3.2, 1.4, ICECREAM.y - 0.5, ICECREAM.y + 1.1, { kind: 'stall', solid: true });
export const CANS = { x: 16, z: 92 };
CANS.y = heightAt(CANS.x, CANS.z);
box(CANS.x, CANS.z - 1.6, 5, 1.0, CANS.y - 0.5, CANS.y + 1.0, { kind: 'stall', solid: true });
/** Le chamboule-tout : trois pyramides de boîtes, sur le comptoir. */
export const CAN_STACKS = [-1.6, 0, 1.6].map((dx, i) => ({ id: 'n' + i, x: CANS.x + dx, z: CANS.z - 1.6, y: CANS.y + 1.0 }));
export const huts = [];
{
  const cols = [0x3a8ae0, 0xe04848, 0x40b060, 0xf0b020, 0xff7ab0, 0x3ac0c0, 0xe07a30, 0x8a6ae0];
  let i = 0;
  for (const x of [-62, -55, -48, -27, -20, 22, 46, 53]) {
    const z = shoreZ(x) + 50.5, y = heightAt(x, z);
    huts.push({ x, z, y, color: cols[i++ % cols.length] });
    box(x, z, 2.8, 2.4, y - 0.5, y + 3.1, { kind: 'hut', solid: true, cam: true, map: '#e8e0d0' });
  }
}

// Palmiers (troncs solides) : sur la plage, la palmeraie, l'île, la crique
export const trees = [];
export const palms = [];
{
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const add = (x, z, lean) => palms.push({ x, z, y: heightAt(x, z), lean: lean === undefined ? (rnd() - 0.5) * 0.45 : lean, h: 6.5 + rnd() * 2, rot: rnd() * 6.28 });
  [[-14, 40], [-30, 44], [10, 40], [-6, 31], [30, 34], [-60, 32], [58, 50], [24, 64], [-20, 70], [80, 96], [100, 140], [140, 62], [170, 48], [128, 40], [176, 72]].forEach(([x, z]) => add(x, z));
  for (let k = 0; k < 14; k++) { const a = k * 2.399, r = 5 + Math.sqrt(k) * 3.6; add(GROVE.x + Math.cos(a) * r, GROVE.z + Math.sin(a) * r); }
  [[-44, -124], [-35, -137], [-46, -134]].forEach(([x, z]) => add(x, z, 0.3));
  // les trois palmiers penchés des dunes (Barnabé en parle)
  [[-112, 52, 0.35], [-116, 47, -0.3], [-108, 46, 0.25]].forEach(([x, z, l]) => add(x, z, l));
}
for (const p of palms) cyl(p.x, p.z, 0.42, p.y - 1, p.y + p.h, { kind: 'tree' });

// Parasols et serviettes (décor)
export const PARASOLS = [
  [-8, 18, 0xe04848], [2, 22, 0x3a8ae0], [-14, 26, 0xf0b020], [22, 26, 0x40b060], [44, 16, 0xff7ab0], [-30, 26, 0x3ac0c0],
  [8, 30, 0xe07a30], [-2, 14, 0xf0b020], [50, 24, 0x3a8ae0], [-62, 18, 0xe04848], [140, 30, 0xff7ab0], [150, 44, 0x3a8ae0], [-72, 26, 0xf0b020],
].map(([x, z, color], i) => ({ x, z, y: heightAt(x, z), color, rot: i * 0.9 }));

// Caisses (cassables : des cœurs)
export const crates = [
  { id: 'c1', x: -12, z: 33, content: 'heart' },
  { id: 'c2', x: 44, z: 8, content: 'heart' },
  { id: 'c3', x: -100, z: 22, content: 'heart' },
  { id: 'c4', x: 80, z: -40, content: 'heart' },
  { id: 'c5', x: 150, z: 46, content: 'heart' },
  { id: 'c6', x: -130, z: 112, content: 'heart' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// ---------------------------------------------------------------------------
// Grille spatiale et support (terrain + dessus des obstacles)
// ---------------------------------------------------------------------------
const CELL = 16, OFF = 32;
const grid = new Map();
const key = (i, j) => (i + OFF) * 128 + (j + OFF);
for (const c of colliders) {
  const [x0, x1, z0, z1] = c.type === 'box' ? [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2] : [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r];
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
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
const WALLS = new Set(['house', 'stall', 'hut', 'lighthouse']);
/** Un chat ne traverse pas les maisons. */
export function blockedAt(x, z) {
  for (const c of near(x, z, 0.5)) if (WALLS.has(c.kind) && inside(c, x, z, 0.4)) return true;
  return false;
}
function groundY(x, z) {
  let best = heightAt(x, z);
  for (const c of near(x, z, 0.3)) if (!c.off && c.y1 > best && inside(c, x, z, 0.2)) best = c.y1;
  return best;
}
export { groundY };

// ---------------------------------------------------------------------------
// Les quêtes : lentilles du phare, morceaux de carte, coffre, leçon et course
// ---------------------------------------------------------------------------
/** Les 3 lentilles du phare, que les chats ont cachées un peu partout. */
export const LENSES = [
  { id: 'l1', x: WRECK.nest.x, z: WRECK.nest.z, y: WRECK.nest.top + 1.2, where: 'en haut du mât de l\'épave' },
  { id: 'l2', x: GRANDE_DUNE.x, z: GRANDE_DUNE.z, y: 0, where: 'au sommet de la Grande Dune' },
  { id: 'l3', x: CAVE_TOP.x, z: CAVE_TOP.z, y: CAVE_TOP.top + 1.2, where: 'sur le rocher au-dessus de la grotte' },
];
LENSES[1].y = heightAt(LENSES[1].x, LENSES[1].z) + 1.2;
/** Les 3 morceaux de la carte au trésor de Barnabé. */
export const MAP_PIECES = [
  { id: 'p1', x: WRECK.hold.x, z: WRECK.hold.z, how: 'bottle', where: 'dans la cale de l\'épave' },
  { id: 'p2', x: HOLLOWS[0].x, z: HOLLOWS[0].z, how: 'dig', where: 'dans un creux des dunes, près des trois palmiers penchés' },
  { id: 'p3', x: CAVE.x + 1, z: CAVE.z + 1, how: 'crab', where: 'dans les pinces du Roi des Crabes, dans la grotte' },
];
for (const p of MAP_PIECES) p.y = heightAt(p.x, p.z);
/** Le coffre de pirate, sous la croix rouge de l'Île aux Mouettes. */
export const CHEST = { id: 'chest', x: ISLAND.x + 3, z: ISLAND.z + 2 };
CHEST.y = heightAt(CHEST.x, CHEST.z);
export const DIG_R = 1.9;          // distance pour creuser

// Petits tas de sable qui scintillent : 3 coquillages chacun
export const MOUNDS = [
  [-6, 22], [52, 30], [-25, 4], [-80, 36], [-150, 60], [HOLLOWS[1].x, HOLLOWS[1].z], [HOLLOWS[2].x, HOLLOWS[2].z],
  [GROVE.x + 2, GROVE.z - 3], [150, 16], [176, 34], [ISLAND.x - 6, ISLAND.z + 5], [-96, 6],
].map(([x, z], i) => ({ id: 'd' + i, x, z, y: heightAt(x, z) }));
/** Le tas du morceau de carte (il n'apparaît qu'après avoir parlé à Barnabé). */
export const PIECE_MOUND = { id: 'piece', x: MAP_PIECES[1].x, z: MAP_PIECES[1].z, y: MAP_PIECES[1].y };

// Crabes farceurs : chacun garde un coquillage volé (un « Ouaf ! » et il le lâche)
export const CRABS = [[-30, -2], [-12, 0], [3, 1], [52, 4], [140, 20], [168, 18], [-100, -10], [ISLAND.x + 8, ISLAND.z - 9]]
  .map(([x, z], i) => ({ id: 'k' + i, x, z, y: heightAt(x, z) }));
/** Le Roi des Crabes, dans la grotte : il garde un morceau de carte. */
export const CRAB_KING = { x: MAP_PIECES[2].x, z: MAP_PIECES[2].z, y: MAP_PIECES[2].y };

/** Leçon de bodyboard (bouées vertes), puis la course (bouées jaunes) jusqu'au large et retour. */
export const LESSON = [{ x: 4, z: -14 }, { x: -14, z: -20 }, { x: 8, z: -24 }];
export const RACE = {
  start: { x: 14, z: -12 },
  finish: { x: 12, z: -6 },
  buoys: [{ x: -20, z: -28 }, { x: -52, z: -62 }, { x: -6, z: -108 }, { x: 46, z: -84 }, { x: 56, z: -40 }, { x: 14, z: -12 }],
  r: 5,
};
/** La route des bouées vers l'Île aux Mouettes (depuis le bout du ponton). */
export const ISLAND_ROUTE = [[30, -72], [14, -88], [-4, -102], [-20, -114]];

// ---------------------------------------------------------------------------
// Coquillages : 100 (36 enterrés dans 12 tas, 8 chez les crabes, 5 au chamboule-tout)
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const line = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const arc = (cx, cz, r, n, a0, a1, lift) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, lift); } };
arc(VILLAGE.x, VILLAGE.z, 7, 3, 0.3, 2.6);                              // place du village
line(28, 76, 22, 42, 3);                                               // village → plage
arc(FORT.x, FORT.z, 11, 3, Math.PI * 0.7, Math.PI * 2.3);              // autour du fort
line(PIER.x, -20, PIER.x, -54, 3);                                     // le bout du ponton
line(96, 66, 84, 22, 3);                                               // la pente de la falaise
lighthouseSteps.filter((_, i) => i % 4 === 3).forEach(s => pts.push({ x: s.x, z: s.z, y: s.top + 1.1 }));   // l'escalier du phare
line(126, 70, 150, 54, 3);                                             // descente vers la crique
pts.push({ x: WRECK.hold.x + 1, z: WRECK.hold.z + 1, y: WRECK.y + 1.1 });               // dans la cale
pts.push({ x: WRECK.deck.x, z: WRECK.deck.z, y: WRECK.deck.top + 1.1 });               // sur le pont arrière
arc(GRANDE_DUNE.x, GRANDE_DUNE.z, 7, 3, 0, Math.PI * 1.3);             // la Grande Dune
at(HOLLOWS[0].x + 2.5, HOLLOWS[0].z - 1.5); at(-150, 92); at(-40, 120); // creux des dunes
arc(GROVE.x, GROVE.z, 11, 3, 0.5, 3.0);                                // la palmeraie
for (const c of [{ x: CAVE.x - 3, z: CAVE.z + 3 }, { x: CAVE.x + 3, z: CAVE.z - 2 }, { x: CAVE.x - 4, z: CAVE.z - 2 }]) at(c.x, c.z);   // dans la grotte
caveSteps.forEach(s => pts.push({ x: s.x, z: s.z, y: s.top + 1.1 }));   // les rochers vers le promontoire
rocks.slice(0, 2).forEach(r => pts.push({ x: r.x, z: r.z, y: r.top + 1.1 }));
arc(ISLAND.x, ISLAND.z, 9, 3, 0.3, 2.4);                               // l'Île aux Mouettes
// au-dessus des vagues : à attraper en bodyboard (route de l'île, et le long de la Grande Plage)
ISLAND_ROUTE.forEach(([x, z]) => pts.push({ x: x + 3, z: z + 2, y: WATER_Y + 1.1 }));
for (let i = 0; i < 4; i++) { const x = -60 - i * 9, z = shoreZ(x) - 8 - Math.sin(i) * 2; pts.push({ x, z, y: WATER_Y + 1.1 }); }
line(-176, 150, -176, 120, 2);                                         // le coin le plus perdu des dunes
export const VISIBLE = 100 - 36 - 8 - 5;
if (pts.length < VISIBLE) throw new Error(`niveau 6 : ${pts.length} coquillages visibles, il en faut ${VISIBLE}`);
export const bones = pts.slice(0, VISIBLE).map((p, i) => ({ id: 's' + i, x: p.x, y: p.y, z: p.z }));
// enterrés : ils jaillissent autour du tas quand on creuse
MOUNDS.forEach((m) => {
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + m.x * 0.1, x = m.x + Math.cos(a) * 1.5, z = m.z + Math.sin(a) * 1.5;
    bones.push({ id: 'b' + m.id + k, x, z, y: groundY(x, z) + 1.0, mound: m.id });
  }
});
// gardés par les crabes : là où ils les lâchent (sinon, près de chez eux)
CRABS.forEach((c) => { bones.push({ id: 'c' + c.id, x: c.x, z: c.z, y: groundY(c.x, c.z) + 0.9, crab: c.id }); c.bone = 'c' + c.id; });
// le prix du chamboule-tout : ils tombent devant le comptoir
for (let k = 0; k < 5; k++) { const x = CANS.x - 3 + k * 1.5, z = CANS.z + 1.6; bones.push({ id: 'g' + k, x, z, y: groundY(x, z) + 1.0, prize: true }); }
for (const b of bones) { b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; }
export const balls = [];

// ---------------------------------------------------------------------------
// Médailles (5 missions en plusieurs étapes)
// ---------------------------------------------------------------------------
export const SEAL_HOME = { x: -138, z: -38 };      // la mer profonde, près de Maman Phoque
export const medals = [
  { id: 'm_light', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z + 2.4, y: LIGHTHOUSE.top + 1.4, label: 'Le phare rallumé', visible: false },
  { id: 'm_chest', x: CHEST.x, z: CHEST.z, y: CHEST.y + 2.2, label: 'Le trésor de Barnabé', visible: false },
  { id: 'm_seal', x: -128, z: -24, y: 0, label: 'Le bébé phoque', visible: false },
  { id: 'm_race', x: RACE.finish.x, z: RACE.finish.z, y: WATER_Y + 1.2, label: 'La course de bodyboard', visible: false },
  { id: 'm_fort', x: FORT.x, z: FORT.z, y: FORT.y + 1.6, label: 'Le Fort de Sable', visible: false },
];
medals[2].y = groundY(medals[2].x, medals[2].z) + 1.5;

// Chats farceurs : 5 dans le fort, d'autres qui se promènent
export const cats = [
  { id: 'cat1', x: FORT.x - 3, z: FORT.z - 1, group: 'clearing' },
  { id: 'cat2', x: FORT.x + 3, z: FORT.z + 1, group: 'clearing' },
  { id: 'cat3', x: FORT.x, z: FORT.z - 3.5, group: 'clearing' },
  { id: 'cat4', x: FORT.x - 1.5, z: FORT.z + 3.5, group: 'clearing' },
  { id: 'cat5', x: FORT.x + 3.5, z: FORT.z - 3, group: 'clearing' },
  { id: 'cat6', x: -6, z: 12, group: 'roam' },
  { id: 'cat7', x: 145, z: 40, group: 'roam' },
  { id: 'cat8', x: -120, z: 90, group: 'roam' },
  { id: 'cat9', x: -70, z: 120, group: 'roam' },
  { id: 'cat10', x: 92, z: -60, group: 'roam' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Personnages
export const SEAL = { x: POOLS[3].x, z: POOLS[3].z };
SEAL.y = heightAt(SEAL.x, SEAL.z);
export const GIVERS = {
  barnabe: { x: PIER.x - 0.6, z: PIER.z1 - 1.4, y: PIER.top, yaw: 0, name: 'Capitaine Barnabé' },
  mistral: { x: 12.5, z: 4.5, yaw: Math.PI * 0.9, name: 'Maître-Nageur Mistral' },
  perle: { x: LIGHTHOUSE.x + 1, z: LIGHTHOUSE.z + 8, yaw: 0, name: 'Gardienne Perle' },
  gino: { x: ICECREAM.x, z: ICECREAM.z + 2.8, yaw: Math.PI, name: 'Gino le glacier' },
};
for (const k in GIVERS) if (GIVERS[k].y === undefined) GIVERS[k].y = heightAt(GIVERS[k].x, GIVERS[k].z);
export const npcs = {
  mamie: { x: VILLAGE.x - 4.5, z: VILLAGE.z - 2, y: heightAt(VILLAGE.x - 4.5, VILLAGE.z - 2) },
  puppy: { x: VILLAGE.x - 2.8, z: VILLAGE.z - 0.8, y: heightAt(VILLAGE.x - 2.8, VILLAGE.z - 0.8) },
};

// Drapeaux : en cas de K.O., on repart du dernier touché
export const CHECKPOINTS = [
  { id: 0, x: VILLAGE.x + 4, z: VILLAGE.z - 4, name: 'Le Village' },
  { id: 1, x: -2, z: 16, name: 'Le Poste de Secours' },
  { id: 2, x: FORT.x, z: FORT.z + 11, name: 'Le Fort de Sable' },
  { id: 3, x: -118, z: 16, name: 'Les Rochers' },
  { id: 4, x: GRANDE_DUNE.x + 16, z: GRANDE_DUNE.z + 6, name: 'La Grande Dune' },
  { id: 5, x: 90, z: -20, name: 'La Falaise' },
  { id: 6, x: 140, z: 52, name: 'La Crique de l\'Épave' },
  { id: 7, x: ISLAND.x + 4, z: ISLAND.z + 9, name: 'L\'Île aux Mouettes' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Panneaux
export const signs = [
  { x: VILLAGE.x + 8, z: VILLAGE.z + 6, text: ['La Plage aux Coquillages', '↑ La Grande Plage   → Le phare et la Crique de l\'Épave', '← Les Dunes, la Palmeraie et les Rochers'] },
  { x: 3, z: 42, text: ['La Grande Plage', 'Les petits tas qui brillent cachent des trésors :', 'creusez-y avec le bouton Attaque !'] },
  { x: FORT.x + 3, z: FORT.z + 10, text: ['Le Fort de Sable', 'Interdit aux chiens ! (signé : les chats)', 'Un bon « Ouaf ! » les fait déguerpir…'] },
  { x: 21, z: 9, text: ['Poste de secours', 'Bodyboards à prêter : approchez-vous et montez !', 'Gauche / droite : la planche tourne. Charge : la vague turbo.'] },
  { x: 92, z: 70, text: ['↑ Le phare', 'Montez la grande pente jusqu\'en haut de la falaise.'] },
  { x: 130, z: 60, text: ['La Crique de l\'Épave', 'Un vieux bateau échoué… on dit qu\'il cache des secrets !'] },
  { x: -112, z: 24, text: ['Les Rochers aux flaques', 'Plus loin, la Grotte aux Flaques… quelqu\'un y pleure !'] },
  { x: PIER.x + 2.4, z: PIER.z0 - 2, text: ['Le ponton de Barnabé', 'Du bout du ponton, on voit l\'Île aux Mouettes.', 'Elle est trop loin à la nage : prenez un bodyboard !'] },
];

export const START = { x: VILLAGE.x, z: VILLAGE.z + 6, y: heightAt(VILLAGE.x, VILLAGE.z + 6), yaw: Math.PI };
export const PATHS = [];
export const CRYSTALS = [];
export const ruins = [];
export const PORTALS = [{ x: VILLAGE.x + 8, z: VILLAGE.z + 11, to: 1 }];
// Passerelles en bois (décor) : sur les dunes, vers la crique, dans le village
export const BOARDWALKS = [[[24, 76], [22, 40]], [[-38, 50], [-36, 30]], [[60, 66], [62, 44]], [[118, 70], [146, 56]], [[0, 100], [56, 100]], [[28, 80], [28, 124]], [[-14, 96], [-60, 100]]];

/** Mini-carte : sable, sable mouillé, mer, herbe, fort, village. */
export function mapColor(x, z) {
  const h = heightAt(x, z);
  if (h < -2) return [40, 128, 200];
  if (h < 0) return [80, 190, 220];
  if (Math.abs(Math.hypot(x - FORT.x, z - FORT.z) - FORT.r) < 1.4) return [200, 160, 100];
  if (Math.abs(Math.hypot(x - CAVE.x, z - CAVE.z) - CAVE.r) < 2.2) return [140, 132, 124];
  if (x > HEAD.x0 + 1.5 && x < HEAD.x1 - 1 && h > 4) return [130, 196, 96];
  if (z > 172 || x < -188 || x > 188) return [130, 196, 96];
  if (Math.hypot(x - GROVE.x, z - GROVE.z) < GROVE.r) return [150, 200, 110];
  if (rockShelf(x, z) && h > 0.6 && x < -95) return [170, 160, 150];
  if (Math.abs(h - PROMENADE_Y) < 0.05 && fromShore(x, z) > 47 && x > -15) return [226, 214, 190];
  if (h < 0.5) return [214, 190, 140];
  return [240, 220, 168];
}
export { clamp as _clamp };
