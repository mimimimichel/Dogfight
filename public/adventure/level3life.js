/*
 * Matcha & Ainu — Niveau 3 « Port-Croquette » : la couche de vie (données pures).
 *
 * Une grande ville qui fourmille : pigeons sur la place, goélands voleurs de frites sur le port,
 * chats qui somnolent sur les auvents et les balcons, canards du parc, crabes de la plage,
 * papillons des jardins ; pots de fleurs, cageots du marché, terrasses de café, cordes à linge,
 * châteaux gonflables, bouées, ballons de plage, châteaux de sable, cloches, bouches d'incendie ;
 * des marchands qui crient, un mime, une peintre, un accordéoniste, un facteur, un serveur, un
 * laveur de carreaux sur sa nacelle, des enfants à la marelle… 16 défis éclair, des traînées
 * de paillettes et 7 cachettes.
 *
 * Rien sur les rues (karts, circulation, courses), le circuit du stade, la piste de l'aérodrome,
 * ni sur les chemins des passants, les lieux de mission ou les pièces d'or.
 * Le plan est calculé ici (lifeplan.js, graine fixe) ; cityplay.js le donne à life.js.
 */
import * as S from './level3.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const inRect = (r, x, z, m) => { m = m || 0; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; };
const G = S.GROUND;
const h = (x, z) => S.heightAt(x, z);
/** Le sol sous les pattes : terrain, quais, plancher du kiosque… mais pas les auvents ni les balcons au-dessus. */
const gy = (x, z) => S.supportAt(x, z, Math.max(S.heightAt(x, z), S.GROUND) + 0.5, 0).y;
const TG = new PointGrid(10);
for (const t of S.trees) TG.add(t);
const treeAt = (x, z, m) => TG.within(x, z, 3).some(t => Math.hypot(t.x - x, t.z - z) < 0.5 * t.s + (m || 0.3));
const PONT = S.PONTOONS.map(p => ({ x0: p.x - 1.5, x1: p.x + 1.5, z0: p.z0 - 0.4, z1: p.z1 }));
const PIER_R = [{ x0: S.PIER.x0, x1: S.PIER.x1, z0: S.PIER.z0, z1: S.PIER.z1 }, { x0: S.PIER.px0, x1: S.PIER.px1, z0: S.PIER.pz0, z1: S.PIER.pz1 }];
const onPier = (x, z) => PIER_R.some(r => inRect(r, x, z, -0.3)) || PONT.some(r => inRect(r, x, z, -0.3));
const slope = (x, z) => Math.hypot(h(x + 0.5, z) - h(x - 0.5, z), h(x, z + 0.5) - h(x, z - 0.5));

/** Un point où l'on peut marcher : sur la terre ferme ou un quai, pas dans un mur ni un arbre, pas sur un toit. */
export function walkable(x, z) {
  if (x < -205 || x > 200 || z < -205 || z > 178) return false;
  const y = gy(x, z);
  if (y < 0.4) return false;                                    // la mer, le lac
  if (S.blockedAt(x, z) || treeAt(x, z)) return false;
  if (onPier(x, z)) return true;
  if (y > Math.max(h(x, z), 0) + 1.0) return false;             // toits, conteneurs, cargo, rampes hautes
  return slope(x, z) < 1.5;
}
/** Hauteur du sol « sur lequel on marche » (quais et kiosque compris). */
export const ground = (x, z) => gy(x, z);

// ---------------------------------------------------------------------------
// Où rien ne doit être posé
// ---------------------------------------------------------------------------
const TRACK_D = (x, z) => { let d = 1e9; const T = S.TRACK, n = T.length; for (let i = 0; i < n; i++) { const a = T[i], b = T[(i + 1) % n]; d = Math.min(d, segD(x, z, a.x, a.z, b.x, b.z)); } return d; };
const nearStadium = (x, z) => Math.abs(x - S.STADIUM.x) < 50 && Math.abs(z - S.STADIUM.z) < 40;
const onTrack = (x, z, m) => nearStadium(x, z) && TRACK_D(x, z) < S.STADIUM.w / 2 + (m || 0);
const onRunway = (x, z, m) => x > S.RUNWAY.x0 - 6 - (m || 0) && x < S.RUNWAY.x1 + 6 + (m || 0) && Math.abs(z - S.RUNWAY.z) < S.RUNWAY.w / 2 + 3 + (m || 0);
const WALK_SEGS = S.WALKS.flatMap(pts => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]));
const onWalk = (x, z, m) => WALK_SEGS.some(([a, b]) => segD(x, z, a[0], a[1], b[0], b[1]) < m);
// coins des trottoirs : lampadaires, bouches d'incendie et poubelles du décor
const LAMPS = [];
for (const b of S.BLOCKS) if (b.district === 'centre' || b.district === 'ouest') for (const [x, z] of [[b.x0 + 0.9, b.z0 + 0.9], [b.x1 - 0.9, b.z0 + 0.9], [b.x0 + 0.9, b.z1 - 0.9], [b.x1 - 0.9, b.z1 - 0.9]]) LAMPS.push([x, z]);
for (let x = -118; x <= 190; x += 14) LAMPS.push([x, S.COAST + S.ROAD_HW + 0.8]);
const PLZ = S.PLAZA;
const DECOR = [
  ...LAMPS.map(([x, z]) => [x, z, 2.8]),
  ...[[PLZ.x0 + 4, PLZ.z0 + 3], [PLZ.x1 - 4, PLZ.z1 - 6], [PLZ.x1 - 4, PLZ.z0 + 3], [S.KIOSK.x - 3.5, S.KIOSK.z + 4.5], [PLZ.x0 + 1.4, (PLZ.z0 + PLZ.z1) / 2], [PLZ.x0 + 1.5, PLZ.z0 + 7], [PLZ.x0 + 6.2, PLZ.z0 + 3], [PLZ.x1 - 6.2, PLZ.z1 - 6]].map(([x, z]) => [x, z, 1.8]),
  ...Array.from({ length: 12 }, (_, i) => [-106 + i * 12, S.PORT_QUAY - 1.4, 1.6]),   // bancs du quai
  ...S.PARASOLS.map(p => [p.x, p.z, 1.6]), ...S.huts.map(t => [t.x, t.z, 3.2]),
];
// lieux de quête et de mission
const KEEP = [
  ...Object.values(S.GIVERS).map(g => [g.x, g.z, 4.5]), [S.npcs.mamie.x, S.npcs.mamie.z, 4.5], [S.npcs.puppy.x, S.npcs.puppy.z, 3], [S.START.x, S.START.z, 5],
  ...S.signs.map(s => [s.x, s.z, 2.5]), ...S.PORTALS.map(p => [p.x, p.z, 4]), ...S.crates.map(c => [c.x, c.z, 2.5]), ...S.KARTS.map(k => [k.x, k.z, 4]),
  ...S.POSTERS.map(p => [p.x, p.z, 2.5]), ...S.SMUGGLE.crates.map(c => [c.x, c.z, 3]), ...S.TREASURE.spots.map(s => [s.x, s.z, 3]), ...S.DELIVERY.drops.map(d => [d.x, d.z, 3.5]),
  ...S.TAXI.places.map(p => [p.x, p.z, 5]), ...S.STUNTS.map(s => [s.x, s.z, s.r + 1]), ...S.cats.map(c => [c.x, c.z, 2]),
  ...S.elevators.map(e => [e.x, e.z, 3]), ...S.bouncers.map(b => [b.x, b.z, b.r + 2]), ...S.ramps.map(r => [r.x, r.z, Math.max(r.w, r.d) / 2 + 3]),
  [S.LIFEGUARD.x, S.LIFEGUARD.z, 4.5], [S.CAROUSEL.x, S.CAROUSEL.z, S.CAROUSEL.r + 2], [S.KIOSK.x, S.KIOSK.z, S.KIOSK.roofR + 1], [S.LIGHTHOUSE.x, S.LIGHTHOUSE.z, 6],
  [S.WATER_TOWER.x, S.WATER_TOWER.z, 7.5], [S.OBSERVATORY.x, S.OBSERVATORY.z, 10.5], [S.WHEEL.x, S.WHEEL.z + 2.8, 8], [S.GANGWAY.x, (S.GANGWAY.z0 + S.GANGWAY.z1) / 2, 6],
  [S.RACE.start.x, S.RACE.start.z, 6], [S.CHAMPION.start.x, S.CHAMPION.start.z, 6], [S.DOWNHILL.start.x, S.DOWNHILL.start.z, 6],
  ...S.BALLOONS.list.map(b => [b.x, b.z, 1.6]),
];
const near = (list, x, z) => list.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r);
const hitCollider = (x, z, m) => S.near(x, z, m + 1).some(c => !c.off && c.kind !== 'tree' && c.kind !== 'gondola' && S.inside(c, x, z, m));

/** Interdit pour un objet / un habitant / une bête au point (x, z) ? (les temps forts sont aussi vérifiés par les tests) */
export function avoid(x, z, type, kind) {
  if (S.onRoad(x, z, type === 'fauna' ? 0.5 : 1.2)) return true;
  if (onTrack(x, z, 2.5) || onRunway(x, z)) return true;
  if (near(KEEP, x, z)) return true;
  if (S.bones.some(b => Math.abs(b.x - x) < 1.6 && Math.abs(b.z - z) < 1.6 && b.y < gy(x, z) + 3)) return true;
  if (type === 'props' || type === 'villagers') {
    if (near(DECOR, x, z)) return true;
    if (onWalk(x, z, 1.1)) return true;
    if (treeAt(x, z, 1.3) || hitCollider(x, z, 0.9)) return true;
    if (inRect(S.SKATE, x, z, 2) || inRect(S.RINK, x, z, 2)) return true;
    if (onPier(x, z)) return true;                                     // la jetée reste dégagée
    if (Math.hypot(x - S.LAKE.x, z - S.LAKE.z) < S.LAKE.r + 4) return true;
    if (h(x, z) < 0.9) return true;                                   // bord de l'eau
  }
  if (type === 'fauna' && kind !== 'canard' && h(x, z) < 0.6) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Le « milieu » d'un point
// ---------------------------------------------------------------------------
const blockAt = (x, z) => S.BLOCKS.find(b => inRect(b, x, z));
export function zone(x, z) {
  if (S.onRoad(x, z, 0.5)) return 'road';
  if (inRect(S.PROMENADE, x, z) || onPier(x, z)) return 'port';
  if (inRect(S.YARD, x, z)) return 'docks';
  const b = blockAt(x, z);
  if (b) return b.type === 'plaza' ? 'plaza' : b.type === 'market' ? 'market' : b.district === 'docks' ? 'docks' : b.district === 'est' ? 'houses' : b.district === 'ouest' ? 'ouest' : 'centre';
  if (inRect(S.PARK, x, z)) return 'park';
  if (inRect(S.FAIR, x, z)) return 'fair';
  if (x > S.BEACH_X && z > S.COAST + 4) return 'beach';
  if (nearStadium(x, z)) return 'stadium';
  if (z < -70) return x > S.BEACH_X ? 'plateau' : 'hills';
  return 'edge';
}
function info(x, z) {
  const zn = zone(x, z);
  return { zone: zn, trees: TG.within(x, z, 12).length, town: ['centre', 'plaza', 'market', 'ouest'].includes(zn), green: ['park', 'houses', 'hills', 'plateau', 'edge'].includes(zn) };
}
const Z = (...zs) => (x, z, i) => zs.includes(i.zone);

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
const KI = S.KIOSK, TB = S.TOWERS[0];
export const VILLAGERS = [
  { id: 'silencio', name: 'Silencio le mime', body: 'dog', x: -47.5, z: -4.5, yaw: Math.PI / 2, act: 'mime', fur: 0xf8f6f2, cloth: 0x22242e, defi: 'd_fontaine' },
  { id: 'gege', name: 'Gégé des frites', body: 'dog', x: -30, z: 108, yaw: Math.PI, act: 'call', tool: 'pc_fries', fur: 0xc89a6a, cloth: 0xe8b020, defi: 'd_goeland', shout: ['Frites !', 'Chaudes !', 'Bien dorées !'] },
  { id: 'pepe', name: 'Pépé Mouette', body: 'dog', x: -75.5, z: 116, yaw: 0, act: 'fish', tool: 'rod', fur: 0xb8b0a8, cloth: 0x2a5a8a, focus: true, defi: 'd_peche' },
  { id: 'jules', name: 'Jules le serveur', body: 'dog', x: -64, z: 102, act: 'serve', tool: 'pc_tray', fur: 0x3a2a24, cloth: 0xf4f0e8, moves: true, route: { pts: [[-64, 102], [-52, 102], [-52, 108.5], [-64, 108.5]], speed: 1.25, pause: 1.8 } },
  { id: 'leon', name: 'Léon l\'accordéoniste', body: 'dog', x: KI.x, z: KI.z, yaw: Math.PI, act: 'play', tool: 'pc_accordion', fur: 0x9a7a5a, cloth: 0x2a3a6a, defi: 'd_cloches' },
  { id: 'zoe', name: 'Zoé', body: 'dog', x: -6, z: 100, yaw: 0.5, act: 'hop', fur: 0xf2d0a0, cloth: 0xff6ab0, scale: 0.68, moves: true, defi: 'd_marelle' },
  { id: 'tom', name: 'Tom', body: 'dog', x: -2, z: 103, yaw: -2.2, act: 'cheer', fur: 0x6a4a3a, cloth: 0x3ac0e0, scale: 0.64, moves: true },
  { id: 'lila', name: 'Lila', body: 'dog', x: -9, z: 104, yaw: 2.4, act: 'hop', fur: 0xe8e0d8, cloth: 0xf0c030, scale: 0.62, moves: true },
  { id: 'gaston', name: 'Gaston le jardinier', body: 'dog', x: 46, z: -8, yaw: 2.2, act: 'water', tool: 'pc_can', fur: 0xa87850, cloth: 0x3a8a4a, focus: true, defi: 'd_canetons' },
  { id: 'bob', name: 'Bob le maître-nageur', body: 'dog', x: 116, z: 103, yaw: Math.PI, act: 'flag', tool: 'pc_whistle', fur: 0xd8a060, cloth: 0xe83a3a, defi: 'd_crabes' },
  { id: 'coco', name: 'Coco la glacière', body: 'dog', x: 60, z: 104, yaw: Math.PI, act: 'call', tool: 'pc_icecream', fur: 0xf6ecdc, cloth: 0x7ad0f0, defi: 'd_bouees', shout: ['Glaces !', 'Vanille !', 'Fraise !'] },
  { id: 'lili', name: 'Lili des ballons', body: 'dog', x: 62, z: 52, yaw: 0.6, act: 'call', tool: 'pc_balloons', fur: 0xe0b890, cloth: 0xc050c0, defi: 'd_foire', shout: ['Ballons !', 'Qui en veut ?'] },
  { id: 'firmin', name: 'Firmin le facteur', body: 'dog', x: 110, z: -36, act: 'idle', tool: 'pc_letter', fur: 0x8a6a4a, cloth: 0x2a4ab0, moves: true, defi: 'd_lettres', route: { pts: [[110, -36], [144, -36], [144, -10], [110, -10]], speed: 1.35, pause: 2.2 } },
  { id: 'chaussette', name: 'Madame Chaussette', body: 'dog', x: -186, z: -44.5, yaw: 0, act: 'idle', fur: 0xd8d0c8, cloth: 0x9a6ae0, defi: 'd_chatons' },
  { id: 'margot', name: 'Margot la poissonnière', body: 'dog', x: -17, z: 31, yaw: Math.PI, act: 'call', fur: 0xc8a070, cloth: 0x3a7ad8, defi: 'd_poisson', shout: ['Poissons !', 'Sardines !'] },
  { id: 'fanny', name: 'Fanny la primeur', body: 'dog', x: -17, z: 19.5, yaw: 0, act: 'call', tool: 'pc_bouquet', fur: 0xf0c890, cloth: 0x40a050, shout: ['Fraises !', 'Melons !', 'Tomates !'] },
  { id: 'rosalie', name: 'Rosalie la peintre', body: 'dog', x: -56, z: -112, yaw: Math.PI * 0.85, act: 'paint', tool: 'pc_brush', fur: 0xe8c8a8, cloth: 0xd84a6a, focus: true, defi: 'd_collines' },
  { id: 'gerard', name: 'Gérard le laveur de carreaux', body: 'dog', x: TB.x0 - 0.7, z: (TB.z0 + TB.z1) / 2, yaw: -Math.PI / 2, act: 'wipe', tool: 'pc_squeegee', fur: 0xa0a0a8, cloth: 0xf08a20, moves: true, focus: true, platform: 'pc_nacelle',
    lift: { y0: G, y1: TB.top - 6, top: TB.top, period: 46, phase: 0 } },
  { id: 'marius', name: 'Marius du kiosque', body: 'dog', x: -100, z: 101, yaw: 0, act: 'read', tool: 'pc_paper', fur: 0x5a4a3a, cloth: 0x7a5a3a, shout: ['Le journal !', 'Demandez !'] },
  { id: 'rose', name: 'Mamie Rose', body: 'dog', x: 165, z: -35.5, yaw: 0, act: 'water', tool: 'pc_can', fur: 0xf0ece6, cloth: 0xe87aa8, defi: 'd_taupes' },
];
for (const v of VILLAGERS) v.y = gy(v.x, v.z);

const L_ = (who) => (text) => ({ who, text });
const Si = L_('Silencio le mime'), Ge = L_('Gégé des frites'), Pe = L_('Pépé Mouette'), Ju = L_('Jules le serveur'), Le = L_('Léon l\'accordéoniste'), Zo = L_('Zoé'), To = L_('Tom'), Li = L_('Lila'),
  Ga = L_('Gaston le jardinier'), Bo = L_('Bob le maître-nageur'), Co = L_('Coco la glacière'), Ll = L_('Lili des ballons'), Fi = L_('Firmin le facteur'), Ch = L_('Madame Chaussette'),
  Ma = L_('Margot la poissonnière'), Fa = L_('Fanny la primeur'), Ro = L_('Rosalie la peintre'), Gr = L_('Gérard le laveur de carreaux'), Mr = L_('Marius du kiosque'), Rs = L_('Mamie Rose'),
  Mt = L_('Matcha'), Ai = L_('Ainu');
export const LINES = {
  silencio: {
    ask: [Si('(Le mime ouvre un chapeau invisible… puis le retourne. Il est vide ! Il fait semblant de pleurer.)'), Ai('Je crois qu\'il dit : les pigeons ont fait tomber toutes les pièces de son chapeau !'),
      Si('(Il montre la fontaine, puis compte sur ses doigts : huit !)'), Mt('Huit pièces autour de la fontaine ? On les rapporte, au signal doré !')],
    thanks: [Si('(Il fait une grande révérence, sort un bouquet invisible… et vous l\'offre !)'), Ai('Un bouquet invisible. C\'est le plus beau cadeau du monde.')],
    talk: [[Si('(Le mime est coincé dans une boîte invisible. Il pousse les murs… rien à faire !)')], [Si('(Il tire une corde invisible… et c\'est vous qui êtes au bout !)'), Mt('Hé ! Il nous a eus !')], [Si('(Chut ! Il pose un doigt sur sa bouche et marche sur la pointe des pieds.)')]],
  },
  gege: {
    ask: [Ge('Frites ! Frites toutes chaudes ! Oh non… pas encore lui !'), Ge('Un goéland m\'a chipé un cornet entier ! Il tourne au-dessus du quai en rigolant.'),
      Ge('Attrapez-le ! Sautez quand il pique vers vous. Le signal doré est juste là, devant ma friterie.')],
    thanks: [Ge('Mon cornet ! Bon, il en manque trois… mais c\'est la vie d\'un marchand de frites au bord de la mer !'), Ge('Tenez, des paillettes. Les frites, c\'est pas pour les toutous : trop salé !')],
    talk: [[Ge('Le secret des bonnes frites ? Deux cuissons, et beaucoup d\'amour.')], [Ge('Les goélands, ils ont l\'œil ! Ne tenez jamais un cornet en l\'air sur le port.')], [Ge('Frites ! Chaudes ! Croustillantes !')]],
  },
  pepe: {
    ask: [Pe('Chut, petits… Ça mord pas aujourd\'hui. Les poissons préfèrent sauter tout autour du ponton !'), Pe('Allez au bout du ponton, au signal doré, et attrapez-en cinq au vol. On les relâche après, hein !')],
    thanks: [Pe('Cinq au vol ! Même les mouettes n\'en reviennent pas. Plouf, plouf, les voilà repartis.')],
    talk: [[Pe('Soixante ans que je pêche sur ce quai. J\'ai jamais rien attrapé… mais quelle belle vue !')], [Pe('Les goélands m\'appellent Pépé Mouette. Je crois que c\'est un compliment.')]],
  },
  jules: {
    talk: [[Ju('Un café, un chocolat chaud, un croissant… Attention, ça glisse, mon plateau !')], [Ju('Le Café du Port est ouvert depuis cent ans. Les tables, elles, sont un peu plus jeunes.')],
      [Ju('Vous voyez le bouton près de la terrasse ? Appuyez dessus : on allume les lampions !')]],
  },
  leon: {
    ask: [Le('Bonjour, les toutous ! Je joue de l\'accordéon, et les cloches du parc me répondent.'), Le('Écoutez bien ma petite mélodie… puis faites sonner les cloches dans le même ordre. Le signal doré est au pied du kiosque !')],
    thanks: [Le('Bravo ! Vous avez l\'oreille. Allez, je vous joue une valse… en votre honneur !')],
    talk: [[Le('Tagada, tsoin-tsoin ! Ah, la musique, ça met de bonne humeur.')], [Le('Un jour, je jouerai sur la grande roue. Tout en haut !')]],
  },
  zoe: {
    ask: [Zo('On joue à la marelle, mais c\'est trop facile ! On fait un chat perché ?'), To('Il faut nous toucher tous les trois avant la fin du chrono !'), Li('Mais on court super vite, hein !')],
    thanks: [Zo('Tu nous as tous attrapés ! T\'es le roi de la récré !')],
    talk: [[Zo('Un, deux, trois… ciel ! J\'ai gagné !')], [Zo('Ma maman dit qu\'il faut pas jouer sur la route. Alors on joue sur la promenade !')]],
  },
  tom: { talk: [[To('Moi, je saute à cloche-pied jusqu\'au phare !')], [To('Hé, t\'as vu ? Il y a un chat qui dort sur l\'auvent de la boulangerie !')]] },
  lila: { talk: [[Li('Hi hi ! Je suis la plus petite, mais la plus rapide !')], [Li('J\'ai lancé mon caillou dans la case 7. C\'est un record !')]] },
  gaston: {
    ask: [Ga('Oh là là, quelle histoire ! Les canetons de Madame Cane se sont sauvés dans tout le parc.'), Ga('Touchez chaque caneton pour qu\'il vous suive, et ramenez-les près de moi, au bord du lac. Le rond doré, là !')],
    thanks: [Ga('Toute la famille est réunie ! Coin coin, dit Madame Cane. Ça veut dire merci, je crois.')],
    talk: [[Ga('J\'arrose les fleurs du matin au soir. Elles me le rendent bien : regardez ces couleurs !')], [Ga('Ne marchez pas sur les massifs, hein… Bon, si, un peu, pour voir les papillons s\'envoler.')]],
  },
  bob: {
    ask: [Bo('Tuuut ! Hé, les toutous ! Des crabes farceurs sortent du sable et pincent les orteils des baigneurs !'), Bo('Faites-les rentrer dans leurs trous : sautez dessus ou faites la toupie. Le signal doré est près de mon poste.')],
    thanks: [Bo('Plage tranquille ! Merci, les toutous. Vous ferez d\'excellents maîtres-nageurs.')],
    talk: [[Bo('Tuuut ! On ne se baigne pas après avoir mangé une glace ! Enfin… attendez un peu.')], [Bo('Le ballon de plage, on peut le pousser, et même le shooter très loin !')]],
  },
  coco: {
    ask: [Co('Glaces ! Vanille, fraise, pistache ! Dites, vous savez rebondir ?'), Co('Mes grosses bouées sont posées sur le sable. Rebondissez sur toutes celles qui brillent, au signal doré !')],
    thanks: [Co('Boing, boing, boing ! Vous êtes des champions. Une glace ? Non ? Alors des paillettes !')],
    talk: [[Co('Une boule vanille, une boule fraise, et un toutou content !')], [Co('Les châteaux de sable, c\'est fait pour être démolis. Mais chut, ne le dites pas aux enfants !')]],
  },
  lili: {
    ask: [Ll('Ballons, ballons ! Oh, des chiens ! Vous voulez voler, comme mes ballons ?'), Ll('Rebondissez sur les châteaux gonflables et passez dans tous les anneaux dorés, dans l\'ordre !')],
    thanks: [Ll('Vous avez volé ! Comme de vrais ballons. Je vous en garde un rouge, promis.')],
    talk: [[Ll('Un ballon s\'est échappé ce matin. Il doit être tout là-haut, au-dessus de la grande roue !')], [Ll('Le rouge, c\'est mon préféré. Et vous ?')]],
  },
  firmin: {
    ask: [Fi('Bonjour, bonjour ! Catastrophe : un coup de vent a ouvert ma sacoche !'), Fi('Mes lettres se sont envolées dans tout le quartier des maisons. Vous me les ramassez avant la tournée ? Le signal doré est au coin de la rue.')],
    thanks: [Fi('Toutes mes lettres ! Pas une de perdue. Tenez, il y en a même une pour vous : « Merci les toutous ! »')],
    talk: [[Fi('Une lettre pour le numéro 3, un colis pour le numéro 7… et une caresse pour le chat du numéro 12.')], [Fi('Je fais le tour du quartier deux fois par jour. Bonjour Madame, bonjour Monsieur !')]],
  },
  chaussette: {
    ask: [Ch('Mes petits chatons ! Ils sont sortis jouer dans les ruelles, et ils ne savent plus rentrer.'), Ch('Ce ne sont pas des chats bandits, hein ! Juste des bébés. Touchez-les, ils vous suivront : ramenez-les dans le rond doré, devant chez moi.')],
    thanks: [Ch('Tous mes petits sont là ! Vous êtes les plus gentils des chiens. Je le dirai à tout le quartier.')],
    talk: [[Ch('Mes chatons s\'appellent Pompon, Grisou, Caramel et Mistigri.')], [Ch('Les chats bandits ? Ma famille n\'a rien à voir avec ces voyous !')]],
  },
  margot: {
    ask: [Ma('Poisson frais ! Sardines ! Au voleur ! Un chat m\'a pris la plus belle sardine de l\'étal !'), Ma('Il file entre les étals du marché. Rattrapez-le ! Le signal doré est juste devant mon étal.')],
    thanks: [Ma('Ma sardine ! Bon… je la lui laisse, il avait l\'air d\'avoir faim. Mais merci, les toutous !')],
    talk: [[Ma('Le poisson du matin, c\'est le meilleur. Celui du soir, c\'est pour les chats.')], [Ma('Sardines, maquereaux, crevettes ! Approchez, approchez !')]],
  },
  fanny: { talk: [[Fa('Fraises ! Melons ! Tomates ! Tout vient du jardin de ma tante.')], [Fa('Attention aux cageots : un coup de patte, et les oranges roulent partout !')], [Fa('Les pigeons adorent mon marché. Moi, un peu moins.')]] },
  rosalie: {
    ask: [Ro('Bonjour ! Je peins la ville, d\'ici on voit tout : le port, le phare, la grande roue…'), Ro('Mais le vent a renversé ma palette ! Mes gouttes de peinture rouge ont roulé partout sur la colline. Vous les ramassez ? Le signal doré est juste là.')],
    thanks: [Ro('Ma peinture rouge ! Je vais pouvoir peindre les toits. Et deux petits chiens, là, au milieu du tableau.')],
    talk: [[Ro('Un peu de bleu pour la mer, un peu de jaune pour le soleil… et beaucoup de patience.')], [Ro('Mon tableau sera exposé à la mairie. Enfin… si je le finis !')]],
  },
  gerard: {
    talk: [[Gr('Je lave les vitres de la Tour Bleue. Trois cent douze fenêtres ! Quand j\'arrive en haut, celles du bas sont déjà sales.')], [Gr('De là-haut, on voit les chats qui dorment sur les toits. Ils ont la belle vie, eux !')]],
  },
  marius: { talk: [[Mr('Le journal ! Demandez le journal ! Gros titre : « Deux chiens sauvent la ville » !')], [Mr('Paraît que la Capitaine se cache aux docks. Moi, je dis ça, je dis rien.')]] },
  rose: {
    ask: [Rs('Mon jardin ! Des taupes creusent partout dans mes tulipes !'), Rs('Quand elles sortent la tête, sautez dessus ou faites la toupie : elles iront creuser ailleurs. Le signal doré est près du portail.')],
    thanks: [Rs('Plus une seule taupe ! Mes tulipes vous disent merci. Et moi aussi, mes chéris.')],
    talk: [[Rs('Un jardin, c\'est comme un chien : il faut s\'en occuper tous les jours.')], [Rs('Les papillons adorent mes fleurs. Moi, j\'adore les papillons.')]],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const up = (x, z, hh) => ({ x, z, y: gy(x, z) + (hh === undefined ? 1.1 : hh) });
const ringAt = (x, z, hh, yaw) => ({ x, z, y: gy(x, z) + hh, yaw: yaw || 0 });
const FO = S.FOUNTAIN, LK = S.LAKE;
const WATER = S.WATER_Y;
export const DEFIS = [
  { id: 'd_fontaine', type: 'coins', name: 'Les pièces du mime', hint: 'Les pigeons ont éparpillé les 8 pièces du chapeau de Silencio autour de la fontaine !', x: -41.5, z: -8.5, time: 40, model: 'pc_wishcoin', glow: 0xffd23a,
    items: [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * Math.PI * 2 + 0.3, r = i % 2 ? 6.4 : 5.6; return up(FO.x + Math.cos(a) * r, FO.z + Math.sin(a) * r); }) },
  { id: 'd_goeland', type: 'chase', name: 'Le goéland voleur', hint: 'Il a chipé les frites de Gégé ! Sautez pour l\'attraper quand il pique vers vous', x: -36, z: 102.5, critter: 'goeland_voleur', air: 2.7, time: 45, leash: 13, speed: 6.0 },
  { id: 'd_peche', type: 'fish', name: 'La pêche au ponton', hint: 'Les poissons sautent autour du ponton : attrapez-en 5 au vol !', x: -68.5, z: 113.5, critter: 'poisson_peche', time: 50, need: 5, noHole: true,
    holes: [[-74.6, 122], [-69.4, 124.5], [-74.6, 127.5], [-69.4, 130], [-74.6, 132.5], [-69.4, 120.5]].map(([x, z]) => [x, z, WATER]) },
  { id: 'd_cloches', type: 'xylo', name: 'Les cloches du kiosque', hint: 'Écoutez la mélodie de Léon, puis faites sonner les cloches dans le même ordre', x: KI.x - 5.5, z: KI.z - 5, chimes: ['cl_1', 'cl_2', 'cl_3', 'cl_4', 'cl_5'], seq: [0, 2, 4, 1, 3], time: 90 },
  { id: 'd_marelle', type: 'tag', name: 'Chat perché sur la promenade', hint: 'Touchez Zoé, Tom et Lila avant la fin du chrono !', x: -13, z: 99.5, time: 40, leash: 12, speed: 6.0, kids: ['zoe', 'tom', 'lila'] },
  { id: 'd_canetons', type: 'herd', name: 'Les canetons du parc', hint: 'Touchez les canetons perdus et ramenez-les dans le rond doré, au bord du lac', x: 53, z: -2, critter: 'caneton', time: 120, pen: { x: 49, z: -9.5, r: 3.6 },
    chicks: [[34, -36], [92, -56], [36, 16], [96, -30]] },
  { id: 'd_crabes', type: 'whack', name: 'Les crabes farceurs', hint: 'Les crabes sortent du sable : sautez dessus ou faites la toupie !', x: 111, z: 106, critter: 'crabe', time: 35, need: 8,
    holes: [[120, 104], [123, 106.5], [118.5, 107.5], [125, 103], [121.5, 101.5], [127, 106]] },
  { id: 'd_bouees', type: 'pads', name: 'Les bouées géantes', hint: 'Rebondissez sur les 6 bouées qui brillent !', x: 46, z: 101, time: 35, pads: ['bo_1', 'bo_2', 'bo_3', 'bo_4', 'bo_5', 'bo_6'] },
  { id: 'd_foire', type: 'rings', name: 'Les anneaux de la foire', hint: 'Rebondissez sur les châteaux gonflables et passez dans les anneaux, dans l\'ordre !', x: 71, z: 53, time: 45,
    rings: [ringAt(75, 57, 1.6), ringAt(80, 56, 4.6), ringAt(86, 57.5, 2.0), ringAt(92, 60, 4.8, 0.6), ringAt(95, 66, 2.0, 1.4), ringAt(96, 72, 4.8, 1.6), ringAt(91, 77, 2.0, 2.4), ringAt(84, 78, 4.6, 3.0)] },
  { id: 'd_lettres', type: 'coins', name: 'Les lettres envolées', hint: 'Ramassez les 8 lettres de Firmin dans le quartier des maisons !', x: 108.5, z: -44, time: 75, model: 'pc_letteritem', glow: 0xfff0c0,
    items: [up(112, -48), up(132, -48), up(118, -36), up(140, -22), up(112, -22), up(126, -10), up(140, 16), up(116, 16)] },
  { id: 'd_chatons', type: 'herd', name: 'Les chatons de Madame Chaussette', hint: 'Touchez les chatons perdus dans les ruelles et ramenez-les dans le rond doré', x: -198, z: -36, critter: 'chaton', time: 150, pen: { x: -198.5, z: -46, r: 3.2 },
    chicks: [[-180, -30], [-198, -12], [-180, 0], [-198, -60]] },
  { id: 'd_poisson', type: 'chase', name: 'Le chat du marché', hint: 'Il a volé la plus belle sardine de Margot : attrapez-le !', x: -23.5, z: 30.5, critter: 'chat_voleur', time: 45, leash: 13, speed: 6.4 },
  { id: 'd_course', type: 'race', name: 'La course de Filou', hint: 'Filou le chien coursier file vers le drapeau à damier : arrivez avant lui !', x: -118, z: 107, critter: 'coursier', speed: 6.9,
    path: [[-116, 111.5], [-96, 111.5], [-78, 111.2], [-60, 111.5], [-42, 111.5], [-22, 111.5]] },
  { id: 'd_docks', type: 'coins', name: 'Les pièces rouges des docks', hint: '8 pièces rouges cachées entre les conteneurs !', x: -140, z: 97, time: 60,
    items: [up(-160, 100), up(-160, 112), up(-160, 124), up(-176, 96), up(-146, 108), up(-190, 97), up(-138, 116), up(-186, 108)] },
  { id: 'd_collines', type: 'coins', name: 'La peinture de Rosalie', hint: 'Ramassez les 8 gouttes de peinture rouge sur la colline !', x: -51, z: -106, time: 60,
    items: [up(-70, -104), up(-80, -112), up(-64, -120), up(-46, -118), up(-40, -104), up(-88, -98), up(-58, -96), up(-74, -88)] },
  { id: 'd_taupes', type: 'whack', name: 'Les taupes de Mamie Rose', hint: 'Les taupes sortent dans le jardin : sautez dessus ou faites la toupie !', x: 157, z: -35.5, critter: 'taupe', time: 35, need: 8,
    holes: [[157.5, -27], [163, -26.5], [166.5, -30], [158, -23.5], [163.5, -22.5], [167, -25.5]] },
];
for (const d of DEFIS) d.y = gy(d.x, d.z);

// ---------------------------------------------------------------------------
// Objets posés à la main (temps forts)
// ---------------------------------------------------------------------------
const bellAt = (i) => { const a = -2.2 + i * 1.05, r = 8.5; return { x: Math.round((KI.x + Math.cos(a) * r) * 10) / 10, z: Math.round((KI.z + Math.sin(a) * r) * 10) / 10 }; };
const PROPS = [
  // la terrasse du Café du Port, ses lampions, son bouton
  ...[[-61, 99], [-55, 99], [-61, 105], [-55, 105]].map(([x, z], i) => ({ id: 'cafe_' + i, kind: 'terrasse', x, z, rot: i * 0.7 })),
  ...[[-66.5, 97.5], [-49.5, 97.5], [-66.5, 106.5], [-49.5, 106.5]].map(([x, z], i) => ({ id: 'lp_' + i, kind: 'lantern', group: 'cafe', x, z })),
  { id: 'b_cafe', kind: 'button', x: -47, z: 102, effect: 'lights', group: 'cafe' },
  // le bouton de la fontaine (un grand jet d'eau !)
  { id: 'b_fontaine', kind: 'button', x: -41.5, z: -6.8, effect: 'geyser', gx: FO.x, gz: FO.z, gy: FO.colTop + 0.2 },
  // les cloches de Léon autour du kiosque
  ...[0, 1, 2, 3, 4].map(i => Object.assign({ id: 'cl_' + (i + 1), kind: 'cloche', rot: 0, note: [67, 69, 72, 74, 76][i] }, bellAt(i))),
  // les bouées géantes de Coco, les châteaux gonflables de la foire
  ...[[48, 107], [55, 112], [66, 113], [74, 117.5], [78, 108], [69, 121]].map(([x, z], i) => ({ id: 'bo_' + (i + 1), kind: 'bouee', x, z, rot: i })),
  ...[[80, 56], [92, 60], [96, 72], [84, 78]].map(([x, z], i) => ({ id: 'ch_' + (i + 1), kind: 'chateau', x, z, rot: [0.1, 0.6, 1.6, 3.0][i] })),
  { id: 'lili_cart', kind: 'charrette', x: 64.5, z: 54.5, rot: 0.6 },
  // le marché : cageots, cagettes de poissons
  { id: 'm_c1', kind: 'cageot', x: -23, z: 19.5 }, { id: 'm_c2', kind: 'pommes', x: -11, z: 19.5, rot: 0.3 }, { id: 'm_c3', kind: 'cageot', x: -23, z: 25, rot: 1.2 },
  { id: 'm_c4', kind: 'pommes', x: -11, z: 25 }, { id: 'm_p1', kind: 'poissons', x: -13.5, z: 30.5 }, { id: 'm_p2', kind: 'poissons', x: -20.5, z: 30.5, rot: 0.2 },
  // le quai : casiers, tonneaux, poissons, pots
  { id: 'q_1', kind: 'casier', x: -112, z: 112.5, rot: 0.3 }, { id: 'q_2', kind: 'tonneau', x: -88, z: 112.5 }, { id: 'q_3', kind: 'poissons', x: -80, z: 113 }, { id: 'q_4', kind: 'casier', x: -50, z: 113.5, rot: 2.0 },
  { id: 'q_5', kind: 'tonneau', x: -40, z: 113.5 }, { id: 'q_6', kind: 'poissons', x: -38.5, z: 112 }, { id: 'q_7', kind: 'casier', x: -16, z: 113, rot: 1.0 }, { id: 'q_8', kind: 'tonneau', x: -104, z: 113 },
  // la marelle des enfants, le chevalet de Rosalie
  { id: 'marelle', kind: 'marelle', x: -5, z: 100.5, rot: 0.2 },
  { id: 'chevalet', kind: 'chevalet', x: -55.8, z: -110.6, rot: Math.PI + 0.15 },
  // la plage : châteaux de sable, ballons, transats
  { id: 'pl_s1', kind: 'chateausable', x: 34, z: 114 }, { id: 'pl_s2', kind: 'chateausable', x: 94, z: 104 }, { id: 'pl_s3', kind: 'chateausable', x: 150, z: 118 },
  { id: 'pl_b1', kind: 'ballon', x: 70, z: 108 + 2.5 }, { id: 'pl_b2', kind: 'ballon', x: 118, z: 114 }, { id: 'pl_b3', kind: 'ballon', x: 176, z: 108 },
  { id: 'pl_t1', kind: 'transat', x: 84, z: 116, rot: 3.3 }, { id: 'pl_t2', kind: 'transat', x: 87, z: 116, rot: 3.1 }, { id: 'pl_t3', kind: 'transat', x: 160, z: 114, rot: 2.9 },
  // le jardin de Mamie Rose, le quartier de Firmin
  { id: 'r_f1', kind: 'fleurs', x: 171, z: -22.5 }, { id: 'r_f2', kind: 'fleurs', x: 156.5, z: -31.5 }, { id: 'r_b1', kind: 'buisson', x: 160.5, z: -34.5 },
  { id: 'f_m1', kind: 'boiteauxlettres', x: 109.2, z: -38.5 }, { id: 'f_m2', kind: 'boiteauxlettres', x: 141.5, z: -12.5 },
  // les cordes à linge des ruelles de l'ouest
  { id: 'w_l1', kind: 'linge', x: -180, z: -37, rot: Math.PI / 2 }, { id: 'w_l2', kind: 'linge', x: -180, z: -18, rot: Math.PI / 2 }, { id: 'w_l3', kind: 'linge', x: -134, z: -52, rot: Math.PI / 2 },
];
for (const p of PROPS) p.y = gy(p.x, p.z);

// Bêtes posées à la main
const FAUNA = [
  { id: 'pig_place', kind: 'pigeon', x: -41.5, z: -9 }, { id: 'pig_marche', kind: 'pigeon', x: -17, z: 25 }, { id: 'pig_quai', kind: 'pigeon', x: -90, z: 101 }, { id: 'pig_mairie', kind: 'pigeon', x: -43, z: -46.5 },
  { id: 'gl_frites', kind: 'goeland', x: -38, z: 112 }, { id: 'gl_jetee', kind: 'goeland', x: 10, z: 150 }, { id: 'gl_docks', kind: 'goeland', x: -160, z: 118 }, { id: 'gl_plage', kind: 'goeland', x: 104, z: 119 },
  { id: 'cn_1', kind: 'canard', x: LK.x, z: LK.z }, { id: 'cn_2', kind: 'cane', x: LK.x - 8, z: LK.z - 8 }, { id: 'cn_3', kind: 'canard', x: LK.x + 9, z: LK.z + 6 },
  { id: 'px_1', kind: 'poisson', x: -86, z: 126 }, { id: 'px_2', kind: 'poisson', x: -58, z: 128 }, { id: 'px_3', kind: 'poisson', x: -28, z: 127 }, { id: 'px_4', kind: 'poisson', x: -92, z: 133 }, { id: 'px_5', kind: 'poisson', x: LK.x + 4, z: LK.z - 6 },
  { id: 'cr_1', kind: 'crabe', x: 140, z: 117 }, { id: 'cr_2', kind: 'crabe', x: 102, z: 120 }, { id: 'cr_3', kind: 'crabe', x: 172, z: 120 },
  { id: 'pa_1', kind: 'papillon', x: 40, z: -20 }, { id: 'pa_2', kind: 'citron', x: 162, z: -28 }, { id: 'pa_3', kind: 'papillon', x: 90, z: -42 },
  { id: 'ch_1', kind: 'chien', x: 130, z: -24 }, { id: 'ch_2', kind: 'chat', x: -182, z: -10 },
];

// Cachettes (coffres) : sur un toit, au bout de la jetée, sur le cargo, derrière les lettres géantes,
// sur le toit du kiosque, en haut des tribunes, au bout de la plage
const roofB = S.buildings.filter(b => b.balconies && b.balconies.length >= 3 && !b.tower && !b.hall && !b.warehouse && Math.abs(b.ground - G) < 0.1)
  .sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 + 60, (a.z0 + a.z1) / 2 - 50) - Math.hypot((b.x0 + b.x1) / 2 + 60, (b.z0 + b.z1) / 2 - 50))[0];
const ST5 = S.STANDS[S.STANDS.length - 1];
const SECRETS = [
  { id: 's_toit', x: (roofB.x0 + roofB.x1) / 2, z: (roofB.z0 + roofB.z1) / 2, y: roofB.top, rot: 0.4, found: 'Sur le toit ! Les chats des toits gardaient ce trésor.' },
  { id: 's_phare', x: 3, z: 174.5, rot: Math.PI / 2, found: 'Tout au bout de la jetée, au pied du phare !' },
  { id: 's_cargo', x: S.SHIP.x1 - 3, z: (S.SHIP.z0 + S.SHIP.z1) / 2, y: S.SHIP.deck, rot: -Math.PI / 2, found: 'Sur le pont du cargo ! Moussaillons, bravo !' },
  { id: 's_lettres', x: -160, z: -119.5, rot: Math.PI, found: 'Caché derrière les lettres géantes de Port-Croquette !' },
  { id: 's_kiosque', x: KI.x, z: KI.z, y: KI.roof, rot: 0.8, found: 'Sur le toit du kiosque à musique ! Léon n\'en savait rien.' },
  { id: 's_tribune', x: S.STADIUM.x + 19, z: ST5.z, y: ST5.top, rot: Math.PI, found: 'Tout en haut des tribunes du stade !' },
  { id: 's_plage', x: 194, z: 106, rot: -Math.PI / 2, found: 'Au bout de la grande plage, là où personne ne va !' },
];
for (const s of SECRETS) if (s.y === undefined) s.y = gy(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des sauts…)
const line = (a, b, n, hh) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: gy(x, z) + (hh || 1.0) }; });
const arc = (a, b, n, top, base) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: Math.max(gy(x, z) + 1, (base === undefined ? gy(a[0], a[1]) : base) + 1 + Math.sin(k * Math.PI) * top) }; });
const ring = (cx, cz, r, n, a0, hh) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return { x, z, y: gy(x, z) + (hh || 1.0) }; });
const SK = S.SKATE, skz = (SK.z0 + SK.z1) / 2;
const TRAILS = [
  { id: 't_toit', pts: roofB.balconies.map(b => ({ x: b.x, z: b.z, y: b.top + 1.0 })).concat([{ x: (roofB.x0 + roofB.x1) / 2, z: (roofB.z0 + roofB.z1) / 2, y: roofB.top + 1.2 }]), say: 'Jusque sur le toit !' },
  { id: 't_phare', pts: line([8, 126], [8, 164], 9), say: 'Au bout de la jetée…' },
  { id: 't_cargo', pts: line([S.GANGWAY.x, S.GANGWAY.z0 + 1], [S.GANGWAY.x, S.GANGWAY.z1 + 2], 6), say: 'À l\'abordage !' },
  { id: 't_lettres', pts: line([-128, -126], [-156, -121], 7), say: 'Derrière les lettres…' },
  { id: 't_kiosque', pts: arc([KI.x + 5.2, KI.z + 3.6], [KI.x + 1.2, KI.z + 0.8], 6, 4.5, KI.roof - 2.4), say: 'Boing ! Sur le toit !' },
  { id: 't_tribune', pts: S.STANDS.map(s => ({ x: S.STADIUM.x + 19, z: s.z, y: s.top + 1.0 })), say: 'Tout en haut !' },
  { id: 't_plage', pts: line([168, 106], [190, 106], 7) },
  { id: 't_lac', pts: ring(LK.x, LK.z, LK.r + 5.5, 22, 0.3) },
  { id: 't_skate', pts: arc([SK.x0 + 4, skz], [SK.x1 - 4, skz], 7, 3.5, G + 2), say: 'Quel saut !' },
  { id: 't_quai', pts: line([-122, 108], [-108, 108], 5) },
  { id: 't_marche', pts: line([-17, 17.5], [-17, 31.5], 6, 1.2) },
  { id: 't_foire', pts: arc([88, 66], [80, 72], 6, 6, G) },
];

// ---------------------------------------------------------------------------
// Palette : bêtes et objets de la ville
// ---------------------------------------------------------------------------
const CAT_TINTS = [0xf0a050, 0xa8a8ae, 0x48484e, 0xf6f0e6, 0xc8a078, 0xe8c090];
export const PALETTE = {
  fauna: {
    pigeon: { model: 'pc_pigeon', ai: 'flock', group: 6, scale: 1.45, flee: 4.5, sound: 'chirp' },
    goeland: { model: 'pc_gull', ai: 'flock', group: 3, scale: 1.25, flee: 6, sound: 'honk' },
    chat: { model: 'pc_cat', ai: 'wander', pet: true, shy: false, hopper: false, speed: 0.9, run: 5, home: 6, sound: 'meow', say: ['Miaou !', 'Mrrr…'], follow: 12, tints: CAT_TINTS, scale: 1.0 },
    chatperche: { model: 'pc_catloaf', ai: 'perch', lounge: true, pet: true, sound: 'meow', say: ['Mrraou !', 'Pfff !', 'Miaou ?'], tints: CAT_TINTS, scale: 1.05 },
    canard: { model: 'pc_duck', ai: 'wander', water: WATER, group: 2, shy: true, hopper: false, flee: 4, run: 2.6, speed: 0.6, home: 7, sound: 'honk', say: ['Coin !'] },
    cane: { model: 'pc_duck', ai: 'wander', water: WATER, group: 2, shy: true, hopper: false, flee: 4, run: 2.6, speed: 0.6, home: 7, sound: 'honk', say: ['Coin coin !'], colors: { female: true } },
    caneton: { model: 'pc_duckling', ai: 'none', hopper: false, scale: 1.3 },
    crabe: { model: 'pc_crab', ai: 'wander', sideways: true, shy: true, hopper: false, flee: 3.5, run: 4, speed: 0.8, home: 4, sound: 'squeak', say: ['Clac !'], scale: 1.4 },
    papillon: { model: 'pc_butterfly', ai: 'hover', group: 2, glow: false, alt: 1.0, scale: 1.7 },
    citron: { model: 'pc_butterfly', ai: 'hover', group: 2, glow: false, alt: 0.9, scale: 1.6, colors: { wing: 0xf6e04a, low: 0xf0d040, edge: 0x6a5a20 } },
    ecureuil: { model: 'squirrel', ai: 'wander', scale: 1.5, hopper: true, flee: 5, run: 7, speed: 2, home: 6, sound: 'squeak', say: ['Tchik !'] },
    lievre: { model: 'hare', ai: 'wander', group: 2, scale: 1.25, tints: [0xc8a880, 0xa88a68, 0xd8c8b0], hopper: true, flee: 6.5, run: 8.5, speed: 1.6, home: 9, sound: 'squeak', say: ['Couic !', 'Hop !'], colors: { fur: 0xffffff, tip: 0x2a2a2e } },
    chien: { model: 'puppy', ai: 'wander', pet: true, shy: false, hopper: false, speed: 1.4, run: 6, home: 6, sound: 'yip', say: ['Waf !', 'Wouf !'], follow: 18, tints: [0xe8c49a, 0xf6f0e8, 0x8a5a3a, 0x3a3030, 0xd8a070] },
    poisson: { model: 'fish', ai: 'jump', water: WATER, colors: { fur: 0x9ab4c8 } },
    poisson_peche: { model: 'fish', ai: 'none', colors: { fur: 0xb8c8d4 } },
    goeland_voleur: { model: 'pc_gull', ai: 'none', scale: 1.5 },
    chat_voleur: { model: 'pc_cat', ai: 'none', hopper: false, scale: 1.0 },
    chaton: { model: 'pc_cat', ai: 'none', hopper: false, scale: 0.6 },
    coursier: { model: 'puppy', ai: 'none', hopper: false, scale: 1.15, colors: { bonnet: 0xf0b020 } },
    taupe: { model: 'marmot', ai: 'none', scale: 1.1, colors: { fur: 0x3a3434, belly: 0x6a5a58 } },
  },
  props: {
    pot: { model: 'pc_pot', act: 'break', drop: 2, chance: 0.6, respawn: 45, color: 0xc4683e },
    potbalcon: { model: 'pc_pot', act: 'break', drop: 2, chance: 0.7, respawn: 45, color: 0xc4683e },
    potrue: { model: 'pc_pot', act: 'break', drop: 2, chance: 0.6, respawn: 45, color: 0xc4683e },
    jardiniere: { model: 'pc_planter', act: 'shake', drop: 1, color: 0xf0a0c0 },
    cageot: { model: 'pc_crate', act: 'break', drop: 2, chance: 0.7, color: 0xf08a20 },
    pommes: { model: 'pc_crate', act: 'break', drop: 2, chance: 0.7, color: 0xd8302a, colors: { fruit: 0xc8282a, fruit2: 0x8ac040 } },
    poissons: { model: 'pc_fishbox', act: 'break', drop: 1, chance: 0.6, color: 0xd8f0ff },
    tonneau: { model: 'pc_barrel', act: 'shake', drop: 1, solid: 0.42, sound: 'bump', color: 0xb08a60 },
    casier: { model: 'pc_lobster', act: 'shake', drop: 1, color: 0xe8402a },
    terrasse: { model: 'pc_cafe', act: 'shake', drop: 1, solid: 0.42, color: 0xf4f0e6 },
    linge: { model: 'pc_laundry', act: 'shake', drop: 1, color: 0xffffff },
    chateau: { model: 'pc_bouncy', act: 'bounce', power: 19, r: 1.25 },
    trampo: { model: 'pc_trampo', act: 'bounce', power: 17, r: 1.15 },
    bouee: { model: 'pc_float', act: 'bounce', power: 15.5, r: 1.05 },
    ballon: { model: 'pc_beachball', act: 'push', grow: false, r0: 0.45, friction: 0.8 },
    chateausable: { model: 'pc_sandcastle', act: 'break', drop: 2, chance: 0.8, respawn: 50, color: 0xe2c48a },
    transat: { model: 'pc_deckchair', act: 'shake', drop: 1, color: 0x7ab0e8 },
    cloche: { model: 'pc_bell', act: 'chime', solid: 0.15 },
    button: { model: 'pc_button', act: 'press', r: 0.7 },
    lantern: { model: 'pc_lamp', solid: 0.15 },
    boiteauxlettres: { model: 'pc_mailbox', act: 'shake', drop: 1, solid: 0.25, color: 0xfff4c0 },
    chevalet: { model: 'pc_easel', act: 'shake', solid: 0.3, color: 0x5ab0e8 },
    plot: { model: 'pc_cone', act: 'break', drop: 1, chance: 0.35, respawn: 30, color: 0xf06a1a },
    buisson: { model: 'pc_bush', act: 'shake', drop: 1, solid: 0.55, color: 0x7ab050 },
    fleurs: { model: 'pc_flowers', act: 'shake', drop: 1, color: 0xf0d040 },
    borne: { model: 'pc_hydrant', act: 'shake', spray: 3.5, sprayY: 0.9, solid: 0.25, sound: 'switch', color: 0xbfeaff },
    charrette: { model: 'pc_ballooncart', act: 'shake', drop: 2, solid: 0.7, color: 0xff7ab0 },
    piquenique: { model: 'pc_picnic', act: 'shake', drop: 1, color: 0xd83a3a },
    marelle: { model: 'pc_marelle' },
  },
};

// ---------------------------------------------------------------------------
// Perchoirs : auvents (chats) et balcons (chats, pots de fleurs) — un seul occupant chacun
// ---------------------------------------------------------------------------
const PERCH = new PointGrid(12);
for (const a of S.awnings) PERCH.add({ x: a.x, z: a.z, y: a.top, nx: a.nx, nz: a.nz, awning: true, id: 'a' + S.awnings.indexOf(a) });
S.balconies.forEach((b, i) => PERCH.add({ x: b.x + b.nx * 0.35, z: b.z + b.nz * 0.35, y: b.top, nx: b.nx, nz: b.nz, awning: false, id: 'b' + i }));
// pieds de façade (pots de fleurs le long des trottoirs, contre le mur, hors du chemin des passants)
const FACADE = new PointGrid(12);
{
  let k = 0;
  for (const b of S.buildings) {
    if (b.house || b.villa || b.tower || b.warehouse || Math.abs(b.ground - G) > 0.2) continue;
    for (const [ax, az, bx, bz, nx, nz] of [[b.x0, b.z0, b.x1, b.z0, 0, -1], [b.x0, b.z1, b.x1, b.z1, 0, 1], [b.x0, b.z0, b.x0, b.z1, -1, 0], [b.x1, b.z0, b.x1, b.z1, 1, 0]]) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 5.5);
      for (let i = 1; i < n; i++) {
        const t = i / n, x = ax + (bx - ax) * t + nx * 0.5, z = az + (bz - az) * t + nz * 0.5;
        if (S.onRoad(x, z, 0.5) || onWalk(x, z, 0.75) || S.blockedAt(x + nx * 0.2, z + nz * 0.2) || near(KEEP, x, z) || near(DECOR.map(([a, c]) => [a, c, 1.6]), x, z)) continue;
        if (S.awnings.some(a => Math.hypot(a.x - x, a.z - z) < 2.6) || S.elevators.some(e => Math.hypot(e.x - x, e.z - z) < 3) || S.bones.some(c => Math.hypot(c.x - x, c.z - z) < 1.6)) continue;
        if (!walkable(x, z)) continue;
        FACADE.add({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, y: G, nx, nz, id: 'f' + (k++) });
      }
    }
  }
}
const taken = new Set();
const freePerch = (x, z, r, kind) => (kind === 'potrue' ? FACADE : PERCH).nearest(x, z, r, p => !taken.has(p.id) && (kind !== 'potbalcon' || !p.awning) && !near(KEEP, p.x, p.z) && (!p.awning || p.y < G + 4)).p;
const hasPerch = (x, z, kind) => { const p = freePerch(x, z, 10, kind); return !!p && Math.hypot(p.x - x, p.z - z) < 10; };

export function avoidAll(x, z, type, kind) {
  if (kind === 'chatperche' || kind === 'potbalcon' || kind === 'potrue') return S.onRoad(x, z, 0.5) && kind !== 'potrue' || !hasPerch(x, z, kind);
  return avoid(x, z, type, kind);
}

const town = Z('centre', 'plaza', 'market', 'ouest'), sea = Z('port', 'docks');
export const SPEC = {
  init() { taken.clear(); },
  seed: 3003, extent: 205, spacing: 15, cover: 11, grid: 3,
  walkable, ground: gy, info, avoid: avoidAll,
  highlights: { fauna: FAUNA, props: PROPS, villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    // en ville : pigeons, chats sur les auvents et les balcons, pots de fleurs aux balcons
    { type: 'fauna', kind: 'pigeon', w: 1.6, min: 24, when: (x, z, i) => i.town || i.zone === 'port' || i.zone === 'edge', data: { n: 4 } },
    { type: 'props', kind: 'potrue', w: 3.2, min: 6, when: (x, z, i) => i.town || i.zone === 'road' },
    { type: 'fauna', kind: 'chatperche', w: 2.6, min: 16, when: (x, z, i) => i.town || i.zone === 'houses' || i.zone === 'docks' || i.zone === 'road' },
    { type: 'props', kind: 'potbalcon', w: 3.0, min: 7, when: (x, z, i) => i.town || i.zone === 'docks' || i.zone === 'road' },
    { type: 'fauna', kind: 'chat', w: 0.8, min: 30, when: Z('ouest', 'houses', 'docks', 'edge') },
    { type: 'props', kind: 'pot', w: 1.6, min: 9, when: (x, z, i) => i.town || i.zone === 'houses' || i.zone === 'edge' },
    { type: 'props', kind: 'boiteauxlettres', w: 0.5, min: 40, when: Z('ouest', 'houses', 'edge') },
    { type: 'props', kind: 'borne', w: 0.7, min: 34, when: Z('ouest', 'houses') },
    { type: 'props', kind: 'linge', w: 0.8, min: 28, when: Z('ouest', 'houses') },
    // le port et les docks : goélands, cageots, casiers, tonneaux, terrasses
    { type: 'fauna', kind: 'goeland', w: 2.4, min: 26, when: (x, z, i) => sea(x, z, i) || i.zone === 'beach' },
    { type: 'props', kind: 'casier', w: 1.4, min: 12, when: sea },
    { type: 'props', kind: 'tonneau', w: 1.4, min: 10, when: sea },
    { type: 'props', kind: 'cageot', w: 1.4, min: 10, when: (x, z, i) => sea(x, z, i) || i.zone === 'market' || i.zone === 'ouest' },
    { type: 'props', kind: 'poissons', w: 1.0, min: 14, when: sea },
    { type: 'props', kind: 'terrasse', w: 0.6, min: 30, when: Z('port', 'plaza', 'centre') },
    { type: 'props', kind: 'plot', w: 1.0, min: 12, when: Z('docks', 'stadium') },
    // la plage
    { type: 'fauna', kind: 'crabe', w: 2.2, min: 10, when: Z('beach') },
    { type: 'props', kind: 'chateausable', w: 1.8, min: 11, when: Z('beach') },
    { type: 'props', kind: 'ballon', w: 1.0, min: 22, when: Z('beach') },
    { type: 'props', kind: 'transat', w: 1.3, min: 12, when: Z('beach') },
    { type: 'props', kind: 'bouee', w: 0.7, min: 24, when: Z('beach') },
    // la foire
    { type: 'props', kind: 'charrette', w: 1.0, min: 26, when: Z('fair') },
    { type: 'props', kind: 'chateau', w: 0.7, min: 26, when: Z('fair') },
    { type: 'fauna', kind: 'pigeon', w: 1.0, min: 22, when: Z('fair'), data: { n: 4 } },
    // le parc, les jardins, les collines, le plateau de l'aérodrome
    { type: 'fauna', kind: 'papillon', w: 1.6, min: 22, when: (x, z, i) => i.green },
    { type: 'fauna', kind: 'citron', w: 1.2, min: 22, when: (x, z, i) => i.green },
    { type: 'fauna', kind: 'ecureuil', w: 1.6, min: 16, when: (x, z, i) => i.green && i.trees >= 2 },
    { type: 'fauna', kind: 'lievre', w: 2.2, min: 18, when: Z('hills', 'plateau', 'stadium') },
    { type: 'fauna', kind: 'chien', w: 0.7, min: 40, when: Z('houses', 'park') },
    { type: 'props', kind: 'buisson', w: 2.2, min: 10, when: (x, z, i) => i.green || i.zone === 'stadium' },
    { type: 'props', kind: 'fleurs', w: 2.0, min: 11, when: (x, z, i) => i.green || i.zone === 'stadium' },
    { type: 'props', kind: 'trampo', w: 0.6, min: 40, when: Z('park', 'houses') },
    { type: 'props', kind: 'piquenique', w: 0.6, min: 40, when: Z('park', 'hills', 'plateau') },
    { type: 'props', kind: 'jardiniere', w: 0.8, min: 24, when: Z('park', 'port', 'fair', 'houses') },
    // (dernier recours : un pigeon passe toujours par là)
    { type: 'fauna', kind: 'pigeon', w: 0.3, data: { n: 2 } },
  ],
  /** Chats perchés et pots de fleurs sur les balcons ; cordes à linge dégagées. */
  place(e) {
    if (e.kind === 'chatperche' || e.kind === 'potbalcon' || e.kind === 'potrue') {
      const p = freePerch(e.x, e.z, 12, e.kind);
      if (p) { taken.add(p.id); e.x = Math.round(p.x * 100) / 100; e.z = Math.round(p.z * 100) / 100; e.y = p.y; e.rot = Math.atan2(p.nx, p.nz); if (e.kind === 'chatperche') e.perch = p.y; e.on = p.id; }
      else if (e.kind === 'chatperche') e.kind = 'pigeon';
      else e.kind = 'pot';
    }
    if (e.kind === 'linge') {
      // la corde (3,8 m) doit tenir entre deux points dégagés
      const ok = (a) => [-1.9, 1.9].every(s => walkable(e.x + Math.cos(a) * s, e.z - Math.sin(a) * s) && !hitCollider(e.x + Math.cos(a) * s, e.z - Math.sin(a) * s, 0.5) && !S.onRoad(e.x + Math.cos(a) * s, e.z - Math.sin(a) * s, 1));
      if (ok(e.rot)) { /* bon */ } else if (ok(e.rot + Math.PI / 2)) e.rot = Math.round((e.rot + Math.PI / 2) * 100) / 100; else e.kind = 'pot';
    }
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 205 }, opts || {}));

