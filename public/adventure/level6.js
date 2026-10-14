/*
 * Matcha & Ainu — Niveau 6 : « La Plage aux Coquillages ».
 * Données pures (aucune dépendance) : relief, obstacles, objets, personnages.
 * Utilisé par le jeu (beach.js, beachplay.js) et par les tests (Node).
 *
 * Plan (le nord est vers -z, la mer est au nord) :
 *   départ au sud, sur la promenade (Mamie et Biscotte, les cabines de plage) ;
 *   les dunes, puis la grande plage de sable et les vagues ;
 *   à l'ouest, le Fort de Sable des chats (et la Capitaine Moustache) et les rochers aux flaques
 *   (le bébé phoque) ; au centre, le poste de secours de Mistral et les planches de bodyboard ;
 *   à l'est, le ponton de Barnabé, puis la falaise et le phare rouge et blanc.
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
export const GRASS_K = 0.25;
export const HALF = 90;                // le terrain couvre ±90 m

// Ambiance : plein été, ciel bleu, soleil derrière le départ (la mer est bien éclairée)
export const SKY = { top: 0x2f86e6, horizon: 0xcdeeff, bottom: 0xf4f8ff, sunDir: [0.3, 0.62, 0.62] };
export const LIGHT = { hemi: [0xf4fbff, 0xe8d0a8, 0.95], sun: [0xfff2dc, 2.7], fog: [110, 360] };
export const GRADE = { bloom: 0.5, saturation: 1.1, highTint: [0.02, 0.014, 0.0], shadowTint: [0.0, 0.008, 0.03] };
export const TREE_STYLE = { min: 3, extra: 2, rad: 1.1, big: 1.8, small: 1.3, bushes: 1 };
export const PALETTE = {
  ground: [0xf0d9a4, 0xf6e4b8, 0xe2c48a],
  leaves: [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const mix = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------------------
// Relief
// ---------------------------------------------------------------------------
/** Ligne du rivage : z de la limite eau / sable (la mer est du côté des z plus petits). */
export function shoreZ(x) { return -5 + 4.5 * Math.sin(x * 0.035 + 0.6); }
/** Distance au rivage (positive sur la plage, négative dans la mer). */
export const fromShore = (x, z) => z - shoreZ(x);

/** Houle des rouleaux (la même que celle dessinée par beach.js) : hauteur de l'eau au temps t. */
export function swell(x, z, t) {
  const u = fromShore(x, z);
  return 0.16 * Math.sin(u * 0.5 - t * 1.4) * smooth(-17, -10, u) * (1 - smooth(-2.5, 0, u));
}

export const PROMENADE_Y = 3.2;
export const PLATEAU_Y = 11;          // dessus de la falaise du phare

// Rochers aux flaques (ouest) : plateau de roche bas, avec trois flaques
export const POOLS = [
  { id: 'seal', x: -51, z: 9, r: 2.6 },
  { id: 'p2', x: -59, z: 2, r: 2.2 },
  { id: 'p3', x: -45, z: -1, r: 1.9 },
];
const ROCKY = { x0: -67, x1: -39 };

function rockShelf(x, z) {
  const u = fromShore(x, z);
  const m = smooth(ROCKY.x1 + 3, ROCKY.x1 - 4, x) * smooth(-4, -1, u) * smooth(24, 17, u);
  if (m <= 0) return null;
  let h = 0.95 + 0.25 * Math.sin(x * 0.7 + z * 0.4) * Math.cos(z * 0.55 - x * 0.2);
  for (const p of POOLS) { const d = Math.hypot(x - p.x, z - p.z); h -= 0.75 * (1 - smooth(p.r * 0.55, p.r, d)); }
  return { h, m };
}

/** Hauteur du terrain (sans les obstacles). */
export function heightAt(x, z) {
  const u = fromShore(x, z);
  let h;
  if (u >= 0) {
    h = 1.9 * (1 - Math.exp(-u / 13));
    // dunes : des bosses douces entre la plage et la promenade
    const band = Math.exp(-(((u - 36) / 8) ** 2));
    h += band * (1.1 + 0.9 * Math.sin(x * 0.11 + 1) + 0.45 * Math.sin(x * 0.27 - 0.6)) * 0.85;
    // la promenade, plate
    h = mix(h, PROMENADE_Y, smooth(44, 50, u));
  } else {
    h = Math.max(-9, 0.13 * u - 0.0045 * u * u);
  }
  // rochers aux flaques
  const rs = rockShelf(x, z);
  if (rs) h = mix(h, Math.max(h, rs.h), rs.m);
  // la falaise du phare (à l'est) : un plateau d'herbe, une pente douce au sud
  const head = smooth(39.6, 41.2, x) * smooth(84.5, 83, x) * smooth(-50.5, -49, z);
  if (head > 0) {
    const hh = PLATEAU_Y - (PLATEAU_Y - PROMENADE_Y) * smooth(4, 46, z);
    h = mix(h, Math.max(h, hh), head);
  }
  // bords du monde : falaises à l'ouest et à l'est, talus au sud
  h = mix(h, Math.max(h, 12), smooth(-69.5, -71, x));
  h = mix(h, Math.max(h, 12), smooth(84.5, 86, x) * smooth(-52, -40, z));
  h = mix(h, Math.max(h, 12), smooth(60, 62, z));
  return h;
}
/** Dans l'eau (assez profond pour mouiller) ? */
export function inWater(x, z, m) { return heightAt(x, z) < WATER_Y + (m || 0); }
/** Pas d'herbe sur le sable : seulement sur la falaise, le talus du sud et quelques touffes des dunes. */
export function noGrass(x, z) {
  if (x > 41.5 && heightAt(x, z) > 4) return false;               // falaise du phare
  const u = fromShore(x, z);
  if (z > 58) return false;                                        // talus du sud
  if (u > 30 && u < 44 && Math.sin(x * 0.9) * Math.cos(z * 0.8) > 0.45) return false;   // oyats des dunes
  return true;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export const colliders = [];
const box = (x, z, w, d, y0, y1, extra) => { const c = Object.assign({ type: 'box', x, z, w, d, y0, y1 }, extra); colliders.push(c); return c; };
const cyl = (x, z, r, y0, y1, extra) => { const c = Object.assign({ type: 'cyl', x, z, r, y0, y1 }, extra); colliders.push(c); return c; };

// Le ponton de Barnabé (à l'est), qui s'avance dans la mer ; son bateau au bout
export const PIER = { x: 23, z0: 17, z1: -36, w: 3.2, top: 1.6, endW: 10, endD: 5 };
box(PIER.x, (PIER.z0 + PIER.z1) / 2, PIER.w, PIER.z0 - PIER.z1, -9, PIER.top, { kind: 'deck', map: '#c8a070' });
box(PIER.x, PIER.z1 - PIER.endD / 2 + 0.01, PIER.endW, PIER.endD, -9, PIER.top, { kind: 'deck', map: '#c8a070' });
export const BOAT = { x: PIER.x + PIER.endW / 2 + 2.2, z: PIER.z1 - 2.5, yaw: 0 };

// Le phare, sur la falaise
export const LIGHTHOUSE = { x: 64, z: -36, r: 2.4, base: PLATEAU_Y, top: PLATEAU_Y + 15, capR: 3.4 };
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.r, LIGHTHOUSE.base - 1, LIGHTHOUSE.top - 0.6, { kind: 'lighthouse', solid: true, cam: true });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.capR, LIGHTHOUSE.top - 0.6, LIGHTHOUSE.top, { kind: 'cap' });
cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, 0.95, LIGHTHOUSE.top, LIGHTHOUSE.top + 2.2, { kind: 'lamp', solid: true });
export const lighthouseSteps = [];
for (let i = 0; i < 12; i++) {
  const a = Math.PI * 0.5 + i * 0.62;                          // départ côté sud (on arrive de la pente)
  const x = LIGHTHOUSE.x + Math.cos(a) * 3.9, z = LIGHTHOUSE.z + Math.sin(a) * 3.9;
  const top = LIGHTHOUSE.base + 1.0 + i * 1.18;
  lighthouseSteps.push({ x, z, top, a, r: 1.3 });
  cyl(x, z, 1.3, top - 0.35, top, { kind: 'stone' });
}

// Le Fort de Sable des chats (ouest de la plage) : un rempart de tours, porte au sud
export const FORT = { x: -24, z: 14, r: 8, gate: Math.PI / 2 };
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
// la grande tour du nord, où trône la Capitaine
export const KEEP = { x: FORT.x, z: FORT.z - FORT.r - 0.4, r: 1.9 };
KEEP.y = heightAt(KEEP.x, KEEP.z); KEEP.top = KEEP.y + 3.6;
cyl(KEEP.x, KEEP.z, KEEP.r, KEEP.y - 1, KEEP.top, { kind: 'rock', sand: true });

// Rochers (ouest) : on grimpe dessus, il y a des coquillages
export const rocks = [
  { x: -55, z: 14, r: 1.8, h: 1.6 }, { x: -47, z: 4, r: 1.5, h: 1.2 }, { x: -62, z: 8, r: 2.0, h: 2.2 },
  { x: -56, z: -4, r: 1.6, h: 1.4 }, { x: -64, z: -6, r: 2.2, h: 2.6 }, { x: -42, z: 12, r: 1.3, h: 1.0 },
  { x: -50, z: 20, r: 1.7, h: 1.8 },
];
for (const r of rocks) { r.y = heightAt(r.x, r.z); r.top = r.y + r.h; cyl(r.x, r.z, r.r, r.y - 1.5, r.top, { kind: 'rock' }); }
// le gros rocher de Maman Phoque, dans la mer
export const SEAL_ROCK = { x: -44, z: -19, r: 2.4 };
SEAL_ROCK.top = 1.2;
cyl(SEAL_ROCK.x, SEAL_ROCK.z, SEAL_ROCK.r, -6, SEAL_ROCK.top, { kind: 'rock' });

// Poste de secours et planches de bodyboard (au centre)
export const LIFEGUARD = { x: 3, z: 9, top: 3.4 };
LIFEGUARD.y = heightAt(LIFEGUARD.x, LIFEGUARD.z);
cyl(LIFEGUARD.x, LIFEGUARD.z, 1.6, LIFEGUARD.top - 0.3, LIFEGUARD.top, { kind: 'deck' });
export const lifeguardSteps = [0, 1].map(i => ({ x: LIFEGUARD.x + 2.4 + i * 0.2, z: LIFEGUARD.z + 1.4 - i * 1.6, top: LIFEGUARD.y + 1.15 + i * 1.1 }));
for (const s of lifeguardSteps) cyl(s.x, s.z, 0.9, s.top - 0.25, s.top, { kind: 'deck' });
export const RACK = { x: 14, z: 5 };
RACK.y = heightAt(RACK.x, RACK.z);
/** Mise à l'eau des planches (juste devant le poste), le nez vers le large. */
export const LAUNCH = { x: 13, z: -6, yaw: Math.PI };
export const BOARDS = [0xff5a3a, 0x3ab0ff, 0xffd23a, 0x7ad83a, 0xff7ad8, 0xb07aff];

// Cabines de plage, sur le bord de la promenade
export const huts = [];
{
  const cols = [0x3a8ae0, 0xe04848, 0x40b060, 0xf0b020, 0xff7ab0, 0x3ac0c0, 0xe07a30, 0x8a6ae0];
  let i = 0;
  for (const x of [-52, -45, -38, -31, 16, 23, 30, 36]) {
    const z = shoreZ(x) + 50.5, y = heightAt(x, z);
    huts.push({ x, z, y, color: cols[i++ % cols.length] });
    box(x, z, 2.8, 2.4, y - 0.5, y + 3.1, { kind: 'hut', solid: true, cam: true, map: '#e8e0d0' });
  }
}

// Palmiers (troncs solides)
export const trees = [];
export const palms = [
  [-14, 40, 0.15], [-20, 44, -0.1], [10, 40, 0.2], [-6, 31, -0.2], [26, 34, 0.25], [-40, 32, 0.12], [-46, 25, -0.2],
  [-49, 31, 0.18], [44, 52, 0.1], [56, 49, -0.15], [33, 47, 0.2], [-58, 45, -0.1], [-26, 50, 0.1], [62, 22, 0.12], [70, 4, -0.2],
].map(([x, z, lean], i) => ({ x, z, y: heightAt(x, z), lean, h: 6.5 + (i % 3) * 0.9, rot: i * 1.7 }));
for (const p of palms) cyl(p.x, p.z, 0.42, p.y - 1, p.y + p.h, { kind: 'tree' });

// Parasols et serviettes (décor)
export const PARASOLS = [
  [-8, 18, 0xe04848], [2, 22, 0x3a8ae0], [-14, 26, 0xf0b020], [20, 26, 0x40b060], [30, 16, 0xff7ab0], [-34, 26, 0x3ac0c0],
  [8, 30, 0xe07a30], [-2, 14, 0xf0b020], [36, 22, 0x3a8ae0], [-40, 18, 0xe04848],
].map(([x, z, color], i) => ({ x, z, y: heightAt(x, z), color, rot: i * 0.9 }));

// Caisses (cassables)
export const crates = [
  { id: 'c1', x: -12, z: 33, content: 'heart' },
  { id: 'c2', x: 31, z: 9, content: 'heart' },
  { id: 'c3', x: -38, z: 10, content: 'heart' },
  { id: 'c4', x: 56, z: -14, content: 'heart' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

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
  for (const c of colliders) if (!c.off && c.y1 > best && inside(c, x, z, 0.2)) best = c.y1;
  return best;
}
export { groundY };

// ---------------------------------------------------------------------------
// Petits tas de sable qui scintillent : on y creuse (3 coquillages chacun)
// ---------------------------------------------------------------------------
export const MOUNDS = [
  [-6, 22], [15, 20], [-35, 4], [29, 26], [-13, 3], [35, 8], [-31, 36], [5, 37], [-17, 42], [24, 40], [-55, 31], [-3, 5],
].map(([x, z], i) => ({ id: 'd' + i, x, z, y: heightAt(x, z) }));
/** Le coffre de pirate de Barnabé, sous la croix rouge, près des trois palmiers. */
export const CHEST = { id: 'chest', x: -44, z: 29 };
CHEST.y = heightAt(CHEST.x, CHEST.z);
export const DIG_R = 1.9;          // distance pour creuser

// Crabes farceurs : chacun garde un coquillage volé (un « Ouaf ! » et il le lâche)
export const CRABS = [[-30, -2], [-12, 0], [3, 1], [-44, -7], [30, 3], [-20, -3]].map(([x, z], i) => ({ id: 'k' + i, x, z, y: heightAt(x, z) }));

// ---------------------------------------------------------------------------
// Coquillages : 100 (dont 36 enterrés dans les tas, 6 gardés par les crabes)
// ---------------------------------------------------------------------------
const pts = [];
const at = (x, z, lift) => pts.push({ x, z, y: groundY(x, z) + (lift || 1.1) });
const line = (ax, az, bx, bz, n, lift) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); at(ax + (bx - ax) * k, az + (bz - az) * k, lift); } };
const arc = (cx, cz, r, n, a0, a1, lift) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, lift); } };
line(0, 45, 0, 21, 7);                                                  // promenade → plage
arc(FORT.x, FORT.z, 11, 8, Math.PI * 0.62, Math.PI * 2.38);              // autour du fort (pas devant la porte)
line(PIER.x, 11, PIER.x, -31, 8);                                       // le ponton
line(62, 42, 57, 10, 6);                                                // la pente de la falaise
lighthouseSteps.filter((_, i) => i % 2 === 1).forEach(s => pts.push({ x: s.x, z: s.z, y: s.top + 1.1 }));   // l'escalier du phare
rocks.slice(0, 5).forEach(r => pts.push({ x: r.x, z: r.z, y: r.top + 1.1 }));                            // sur les rochers
line(-40, 40, -60, 38, 5);                                              // dunes de l'ouest
// au-dessus des vagues : à attraper en bodyboard (ou en pataugeant pour les premiers)
for (let i = 0; i < 10; i++) { const x = 4 - i * 6.5, z = shoreZ(x) - 6 - Math.sin(i * 0.8) * 3; pts.push({ x, z, y: WATER_Y + 1.1 }); }
line(31, 12, 37, 30, 3);                                                // plage de l'est
const visible = pts.slice(0, 58);
export const bones = visible.map((p, i) => ({ id: 's' + i, x: p.x, y: p.y, z: p.z }));
// enterrés : ils jaillissent autour du tas quand on creuse
MOUNDS.forEach((m) => {
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + m.x * 0.1, x = m.x + Math.cos(a) * 1.5, z = m.z + Math.sin(a) * 1.5;
    bones.push({ id: 'b' + m.id + k, x, z, y: groundY(x, z) + 1.0, mound: m.id });
  }
});
// gardés par les crabes : là où ils les lâchent (sinon, près de chez eux)
CRABS.forEach((c) => { bones.push({ id: 'c' + c.id, x: c.x, z: c.z, y: groundY(c.x, c.z) + 0.9, crab: c.id }); c.bone = 'c' + c.id; });
for (const b of bones) { b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; }
export const balls = [];

// ---------------------------------------------------------------------------
// Médailles (5 missions)
// ---------------------------------------------------------------------------
export const SEAL_HOME = { x: -42, z: -12 };       // là où la mer est assez profonde, près de Maman Phoque
export const RACE = {
  start: { x: 10, z: -9 },
  finish: { x: 8, z: -5 },
  // bouées : à franchir dans l'ordre (on revient vers le poste à la fin)
  buoys: [{ x: -14, z: -15 }, { x: -38, z: -27 }, { x: -60, z: -24 }, { x: -36, z: -36 }, { x: -12, z: -24 }, { x: 8, z: -9 }],
  r: 4.5,
};
export const medals = [
  { id: 'm_light', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z + 2.4, y: LIGHTHOUSE.top + 1.4, label: 'Le phare rallumé', visible: false },
  { id: 'm_chest', x: CHEST.x, z: CHEST.z, y: CHEST.y + 2.2, label: 'Le coffre de Barnabé', visible: false },
  { id: 'm_seal', x: -38, z: -6, y: heightAt(-38, -6) + 1.5, label: 'Le bébé phoque', visible: false },
  { id: 'm_race', x: RACE.finish.x, z: RACE.finish.z, y: WATER_Y + 1.2, label: 'La course de bodyboard', visible: false },
  { id: 'm_fort', x: FORT.x, z: FORT.z, y: FORT.y + 1.6, label: 'Le Fort de Sable', visible: false },
];

// Chats farceurs : 5 dans le fort, 3 qui se promènent
export const cats = [
  { id: 'cat1', x: FORT.x - 3, z: FORT.z - 1, group: 'clearing' },
  { id: 'cat2', x: FORT.x + 3, z: FORT.z + 1, group: 'clearing' },
  { id: 'cat3', x: FORT.x, z: FORT.z - 3.5, group: 'clearing' },
  { id: 'cat4', x: FORT.x - 1.5, z: FORT.z + 3.5, group: 'clearing' },
  { id: 'cat5', x: FORT.x + 3.5, z: FORT.z - 3, group: 'clearing' },
  { id: 'cat6', x: -6, z: 12, group: 'roam' },
  { id: 'cat7', x: 48, z: 44, group: 'roam' },
  { id: 'cat8', x: 32, z: 33, group: 'roam' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Personnages
export const SEAL = { x: POOLS[0].x, z: POOLS[0].z };
SEAL.y = heightAt(SEAL.x, SEAL.z);
export const GIVERS = {
  barnabe: { x: PIER.x - 0.6, z: PIER.z1 - 1.2, y: PIER.top, yaw: 0, name: 'Capitaine Barnabé' },
  mistral: { x: 9.5, z: 4.5, yaw: Math.PI * 0.9, name: 'Maître-Nageur Mistral' },
};
GIVERS.mistral.y = heightAt(GIVERS.mistral.x, GIVERS.mistral.z);
export const npcs = {
  mamie: { x: -4.5, z: 49, y: heightAt(-4.5, 49) },
  puppy: { x: -2.8, z: 50.2, y: heightAt(-2.8, 50.2) },
};

// Drapeaux : en cas de K.O., on repart du dernier touché
export const CHECKPOINTS = [
  { id: 0, x: 3, z: 47, name: 'La Promenade' },
  { id: 1, x: -24, z: 26, name: 'Le Fort de Sable' },
  { id: 2, x: -45, z: 16, name: 'Les Rochers' },
  { id: 3, x: 0, z: 15, name: 'Le Poste de Secours' },
  { id: 4, x: 27, z: 19, name: 'Le Ponton' },
  { id: 5, x: 55, z: 2, name: 'La Falaise' },
].map(c => Object.assign(c, { y: heightAt(c.x, c.z) }));

// Panneaux
export const signs = [
  { x: 3.5, z: 42, text: ['La Plage aux Coquillages', 'Les petits tas qui brillent cachent des trésors :', 'creusez-y avec le bouton Attaque !'] },
  { x: -21, z: 24.5, text: ['Le Fort de Sable', 'Interdit aux chiens ! (signé : les chats)', 'Un bon « Ouaf ! » les fait déguerpir…'] },
  { x: 17, z: 9, text: ['Poste de secours', 'Bodyboards à prêter : approchez-vous et montez !', 'Charge : la vague turbo. Saut : un petit bond.'] },
  { x: 46, z: 44, text: ['↑ Le phare', 'Montez la pente jusqu\'en haut de la falaise.'] },
  { x: -42, z: 22, text: ['Les Rochers aux flaques', 'Attention, ça glisse… et quelqu\'un pleure, là-bas !'] },
];

export const START = { x: 0, z: 53, y: heightAt(0, 53), yaw: Math.PI };
export const PATHS = [];
export const CRYSTALS = [];
export const ruins = [];
export const PORTALS = [{ x: 7.5, z: 55, to: 1 }];
// Passerelles en bois sur les dunes (décor)
export const BOARDWALKS = [[[0, 47], [0, 24]], [[-30, 44], [-27, 25]], [[22, 46], [23, 18]], [[44, 50], [60, 44]]];

/** Mini-carte : sable, sable mouillé, mer, herbe, fort. */
export function mapColor(x, z) {
  const h = heightAt(x, z);
  if (h < -2) return [40, 128, 200];
  if (h < 0) return [80, 190, 220];
  if (Math.abs(Math.hypot(x - FORT.x, z - FORT.z) - FORT.r) < 1.4) return [200, 160, 100];
  if (h > 9.5 || (x > 41 && h > 4)) return [130, 196, 96];
  if (z > 58) return [130, 196, 96];
  if (h > 2.9 && fromShore(x, z) > 46) return [226, 214, 190];
  if (rockShelf(x, z) && h > 0.6 && x < -40) return [170, 160, 150];
  if (h < 0.5) return [214, 190, 140];
  return [240, 220, 168];
}
export { clamp as _clamp };
