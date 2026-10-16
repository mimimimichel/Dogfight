/*
 * Matcha & Ainu — Niveau 5 « La Station des Neiges » : la couche de vie (données pures).
 *
 * Bêtes (lièvres, bouvreuils, hermines, chouettes des neiges, écureuils, marmottes, rennes,
 * poissons sous la glace, pingouins, lucioles de givre, chiots de l'école de ski), objets
 * (congères-trampolines, sapins à secouer, tas de neige et blocs de glace à casser,
 * bonshommes à chapeau, boules qui grossissent, carillons de glace, gros boutons, lanternes),
 * 14 défis éclair, des traînées de paillettes, 12 habitants occupés et 6 cachettes.
 *
 * Le plan est calculé ici (lifeplan.js, graine fixe : identique chez tous les joueurs) ;
 * snow.js le donne à life.js qui le fait vivre. Les tests (Node) l'importent aussi.
 */
import * as S from './level5.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rim = (x, z) => Math.pow(x ** 4 + z ** 4, 0.25);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const g = (x, z) => S.heightAt(x, z);
const slope = (x, z) => Math.hypot(g(x + 0.5, z) - g(x - 0.5, z), g(x, z + 0.5) - g(x, z - 0.5));
const TG = new PointGrid(10);
for (const t of S.trees) TG.add(t);
const treeAt = (x, z, m) => TG.within(x, z, 3).some(t => Math.hypot(t.x - x, t.z - z) < 0.5 * t.s + (m || 0.3));
const ledge = (x, z) => x < S.LEDGE.x1 + 2 && x > S.LEDGE.x0 - 2 && z > S.LEDGE.z0 - 2 && z < S.LEDGE.z1 + 2;

/** Un point où l'on peut marcher (dans la station, pas dans un mur, un sapin ou la falaise de la corniche). */
export function walkable(x, z) {
  if (rim(x, z) > 178) return false;
  if (ledge(x, z) && Math.abs(g(x, z) - S.LEDGE.top) > 0.5 && g(x, z) > S.BASE_Y + 1) return false;
  if (S.blockedAt(x, z) || treeAt(x, z)) return false;
  return slope(x, z) < 2.4;
}

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
const RK = S.RINK, LK = S.LAKE;
export const VILLAGERS = [
  { id: 'gaspard', name: 'Gaspard le déneigeur', body: 'dog', x: -10, z: 117, yaw: 0.6, act: 'shovel', tool: 'shovel', fur: 0xd8a070, cloth: 0xe8b020, defi: 'd_renardeau' },
  { id: 'lulu', name: 'Lulu la patineuse', body: 'penguin', model: 'skater', x: RK.x + 8, z: RK.z, path: 'ellipse', ellipse: { x: RK.x, z: RK.z, rx: 8, rz: 4.6, y: RK.y }, speed: 0.38, phase: 0, moves: true, defi: 'd_lac' },
  { id: 'tino', name: 'Tino le patineur', body: 'penguin', model: 'skater', x: RK.x - 8, z: RK.z, path: 'ellipse', ellipse: { x: RK.x, z: RK.z, rx: 6, rz: 3.2, y: RK.y }, speed: -0.5, phase: 2, moves: true, scale: 0.8 },
  { id: 'firmin', name: 'Octave le pêcheur', body: 'dog', x: 119.5, z: 37, yaw: 0.5, act: 'fish', tool: 'rod', fur: 0x8a6a4a, cloth: 0x3a7a5a, defi: 'd_poissons' },
  { id: 'flocon', name: 'Moniteur Flocon', body: 'dog', x: 4, z: 50, yaw: Math.PI * 0.8, act: 'flag', tool: 'flag', fur: 0xf4ecdc, cloth: 0xd83a3a, defi: 'd_chiots' },
  { id: 'praline', name: 'Praline', body: 'dog', x: -18, z: 90, yaw: 2.4, act: 'throw', tool: 'snowball', fur: 0xc08a5a, cloth: 0xff6ab0, scale: 0.72, moves: true, defi: 'd_bataille' },
  { id: 'noisette', name: 'Noisette', body: 'dog', x: -12, z: 96, yaw: -2.2, act: 'throw', tool: 'snowball', fur: 0x8a5a3a, cloth: 0x5ac8ff, scale: 0.68, moves: true },
  { id: 'chouquette', name: 'Chouquette', body: 'dog', x: -24, z: 96, yaw: 0.8, act: 'throw', tool: 'snowball', fur: 0xf2e6d0, cloth: 0x9a6ae0, scale: 0.66, moves: true },
  { id: 'olga', name: 'Olga la sculptrice', body: 'dog', x: -136, z: -97, yaw: Math.PI, act: 'chisel', tool: 'mallet', fur: 0xb8b0a8, cloth: 0x3a8ae0, defi: 'd_xylophone' },
  { id: 'marcel', name: 'Marcel des marrons', body: 'dog', x: -38, z: 167, yaw: 1.2, act: 'stir', tool: 'pan', fur: 0x5a4030, cloth: 0xa0522d, defi: 'd_village' },
  { id: 'bonhomme', name: 'Monsieur Bonhomme', body: 'snowman', x: 66, z: 126, yaw: -1.2, sleepy: true, hat: 0x3a6ad0 },
  { id: 'yeti', name: 'Le Yéti', body: 'yeti', x: -136, z: -153, yaw: 0.4, hidden: 22, act: 'idle' },
];
for (const v of VILLAGERS) v.y = v.ellipse ? v.ellipse.y : S.supportAt(v.x, v.z, 200, 0).y;

export const LINES = {
  gaspard: {
    ask: [
      { who: 'Gaspard le déneigeur', text: 'Ouf ! Je pelle, je pelle… et il neige encore ! Dites, les toutous, vous n\'auriez pas vu mon écharpe ?' },
      { who: 'Gaspard le déneigeur', text: 'Un renardeau me l\'a chipée ! Il court dans la plaine, à l\'ouest de la rivière. Attrapez-le, au signal doré !' },
      { who: 'Matcha', text: 'Un voleur d\'écharpe ? On s\'en occupe !' },
    ],
    thanks: [
      { who: 'Gaspard le déneigeur', text: 'Mon écharpe ! Toute chaude ! Merci, les toutous. Tenez, j\'ai trouvé des paillettes en pelletant.' },
    ],
    talk: [
      [{ who: 'Gaspard le déneigeur', text: 'Une pelletée pour le chemin, une pelletée pour Mamie… et une pelletée pour moi !' }],
      [{ who: 'Gaspard le déneigeur', text: 'Vous voyez les grosses congères avec un rond bleu ? Sautez dessus : boing !' }],
      [{ who: 'Gaspard le déneigeur', text: 'Secouez les petits sapins : parfois, il en tombe des paillettes.' }],
    ],
  },
  lulu: {
    ask: [
      { who: 'Lulu la patineuse', text: 'Coin ! Regardez-moi tourner ! Un, deux, trois… pirouette !' },
      { who: 'Lulu la patineuse', text: 'Sur le lac gelé, il y a des flocons rouges qui brillent. Vous les attrapez tous avant la fin du chrono ? Le signal doré est au bord du lac.' },
    ],
    thanks: [{ who: 'Lulu la patineuse', text: 'Tous les flocons rouges ! Vous patinez presque aussi bien que moi. Presque !' }],
    talk: [
      [{ who: 'Lulu la patineuse', text: 'Le secret du patinage ? Prendre de l\'élan… et ne plus rien toucher !' }],
      [{ who: 'Lulu la patineuse', text: 'Tino tourne dans l\'autre sens. Il dit que c\'est plus rigolo.' }],
    ],
  },
  tino: { talk: [[{ who: 'Tino le patineur', text: 'Coin coin ! Moi, je patine à l\'envers. Comme ça, je vois tout le monde arriver !' }], [{ who: 'Tino le patineur', text: 'Attention, ça tourne ! Wiiii !' }]] },
  firmin: {
    ask: [
      { who: 'Octave le pêcheur', text: 'Chut… Les poissons sautent par les trous dans la glace. Moi, je suis trop lent pour les attraper.' },
      { who: 'Octave le pêcheur', text: 'Vous, vous sautez haut ! Attrapez-en cinq au vol, au signal doré. Et après, on les relâche, hein !' },
    ],
    thanks: [{ who: 'Octave le pêcheur', text: 'Cinq poissons au vol ! Je n\'avais jamais vu ça. Plouf, plouf, ils sont tous retournés dans le lac.' }],
    talk: [
      [{ who: 'Octave le pêcheur', text: 'La pêche, c\'est surtout de la patience. Et un bon chocolat chaud.' }],
      [{ who: 'Octave le pêcheur', text: 'Si vous voyez un poisson sauter, dites-lui bonjour de ma part !' }],
    ],
  },
  flocon: {
    ask: [
      { who: 'Moniteur Flocon', text: 'Oh là là ! Mes petits élèves de l\'école de ski se sont éparpillés partout dans la plaine !' },
      { who: 'Moniteur Flocon', text: 'Touchez chaque chiot pour qu\'il vous suive, et ramenez-les tous dans le rond doré, près de moi.' },
    ],
    thanks: [{ who: 'Moniteur Flocon', text: 'Tout le monde est là ! Merci, les toutous. Allez, les enfants : chasse-neige, et on descend doucement !' }],
    talk: [
      [{ who: 'Moniteur Flocon', text: 'Pour tourner en luge, on se penche ! Et pour freiner, on tire en arrière.' }],
      [{ who: 'Moniteur Flocon', text: 'Mes élèves adorent les caresses. Mais pas pendant le cours, hein !' }],
    ],
  },
  praline: {
    ask: [
      { who: 'Praline', text: 'Bataille de boules de neige ! Tu joues avec nous ?' },
      { who: 'Noisette', text: 'C\'est chat perché ! Il faut nous toucher tous les trois avant la fin du temps !' },
      { who: 'Chouquette', text: 'Mais on court très vite, hein !' },
    ],
    thanks: [{ who: 'Praline', text: 'Tu nous as tous attrapés ! Tu es le champion de la bataille !' }],
    talk: [
      [{ who: 'Praline', text: 'On recommence ? Cette fois, je me cache derrière la congère !' }],
      [{ who: 'Praline', text: 'Ma maman dit qu\'il ne faut pas manger la neige. Même la neige toute blanche.' }],
    ],
  },
  noisette: { talk: [[{ who: 'Noisette', text: 'Je fais la plus grosse boule de neige du monde ! Bon… presque.' }]] },
  chouquette: { talk: [[{ who: 'Chouquette', text: 'Hi hi ! Pouf ! Raté !' }]] },
  olga: {
    ask: [
      { who: 'Olga la sculptrice', text: 'Bonjour ! Je sculpte la glace, et mes glaçons chantent quand on les touche. Écoutez…' },
      { who: 'Olga la sculptrice', text: 'Je vais jouer une petite mélodie. Refaites-la dans le même ordre, en touchant les carillons de glace !' },
    ],
    thanks: [{ who: 'Olga la sculptrice', text: 'Bravo ! Vous avez l\'oreille musicale. Ma mélodie de glace vous appartient maintenant !' }],
    talk: [
      [{ who: 'Olga la sculptrice', text: 'Un petit coup de maillet ici, un petit coup là… et voilà un cygne de glace !' }],
      [{ who: 'Olga la sculptrice', text: 'On raconte qu\'un grand bonhomme tout poilu se cache au nord, derrière la crevasse…' }],
    ],
  },
  marcel: {
    ask: [
      { who: 'Marcel des marrons', text: 'Marrons chauds, marrons chauds ! Oh, bonjour les toutous ! J\'ai perdu les flocons rouges de ma guirlande…' },
      { who: 'Marcel des marrons', text: 'Le vent les a éparpillés dans tout le village. Vous me les rapportez, vite, vite ? Le signal doré est près des chalets.' },
    ],
    thanks: [{ who: 'Marcel des marrons', text: 'Ma guirlande est complète ! Tenez, un cornet de marrons… euh, de paillettes. Les marrons, c\'est trop chaud pour les pattes !' }],
    talk: [
      [{ who: 'Marcel des marrons', text: 'Rien de tel qu\'un marron chaud pour se réchauffer les moustaches.' }],
      [{ who: 'Marcel des marrons', text: 'Vous avez vu le gros bouton rouge près de la patinoire ? Appuyez dessus, pour voir !' }],
    ],
  },
  bonhomme: {
    talk: [
      [{ who: 'Monsieur Bonhomme', text: 'Hein ? Qui m\'a réveillé ? Oh, des chiens ! Bonjour, bonjour !' }, { who: 'Monsieur Bonhomme', text: 'Ne le dites à personne : la nuit, les bonshommes de neige font la fête. Chut !' }],
      [{ who: 'Monsieur Bonhomme', text: 'Mon chapeau bleu vous plaît ? C\'est mon chapeau du dimanche.' }],
      [{ who: 'Ainu', text: 'Il parle ! Matcha, le bonhomme de neige parle !' }, { who: 'Monsieur Bonhomme', text: 'Évidemment que je parle. Je suis très bien élevé.' }],
    ],
  },
  yeti: {
    talk: [
      [{ who: 'Le Yéti', text: 'Oh ! Vous m\'avez trouvé… Personne ne me trouve jamais.' }, { who: 'Le Yéti', text: 'Je suis le Yéti. Je suis très gentil, mais un peu timide. Vous gardez le secret ?' }, { who: 'Matcha', text: 'Promis, Monsieur le Yéti !' }],
      [{ who: 'Le Yéti', text: 'Le coffre, là ? Prenez-le, c\'est un cadeau. J\'aime bien les visites.' }],
      [{ who: 'Le Yéti', text: 'Chut… J\'entends Bernard. Il me cherche depuis des années !' }],
    ],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const up = (x, z, h) => ({ x, z, y: g(x, z) + (h === undefined ? 1.1 : h) });
const ringAt = (x, z, h, yaw) => ({ x, z, y: g(x, z) + h, yaw: yaw || 0 });
const around = (cx, cz, r0, r1, n, a0, h) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * Math.PI * 2, r = i % 2 ? r1 : r0; return up(cx + Math.cos(a) * r, cz + Math.sin(a) * r, h); });

// le vol du sommet : des anneaux qui descendent la pente, à suivre en planant
const summitRings = [];
{
  const x0 = -10, z0 = -142, dx = -0.88, dz = -0.47;
  for (let i = 0; i < 7; i++) { const d = 5 + 7 * i, x = x0 + dx * d, z = z0 + dz * d; summitRings.push({ x, z, y: g(x, z) + (i % 2 ? 3.2 : 1.6), yaw: Math.atan2(dx, dz) }); }
}
const B0 = S.BRIDGES[0];

export const DEFIS = [
  { id: 'd_village', type: 'coins', name: 'Les flocons rouges du village', hint: 'Attrapez les 8 flocons rouges cachés dans le village !', x: -11, z: 163, time: 60,
    items: [up(-34, 130), up(-36, 171), up(34, 124), up(36, 168), up(-10, 177), up(12, 113), up(-13, 149), up(13, 150, 2.4)] },
  { id: 'd_jardin', type: 'rings', name: 'Les anneaux du jardin', hint: 'Passez dans les anneaux dorés, dans l\'ordre : les congères bleues font rebondir !', x: 80, z: 103, time: 40,
    rings: [ringAt(84, 108, 1.4), ringAt(90, 113, 5.6), ringAt(95.5, 118.5, 3.6), ringAt(100, 124, 6.2), ringAt(98, 132, 3.2), ringAt(91, 138, 1.4)] },
  { id: 'd_lievre', type: 'race', name: 'La course du lièvre', hint: 'Le lièvre file vers le drapeau à damier : arrivez avant lui !', x: -44, z: 108, critter: 'hare', speed: 7.4,
    path: [[-46, 106], [-62, 102], [-80, 100], [-91, 82], [-102, 62]] },
  { id: 'd_renardeau', type: 'chase', name: 'Le renardeau voleur', hint: 'Il a l\'écharpe de Gaspard : attrapez-le !', x: -84, z: -8, critter: 'foxcub', time: 45, leash: 16, speed: 7.2 },
  { id: 'd_marmottes', type: 'whack', name: 'Tape-marmotte', hint: 'Les marmottes sortent de leurs trous : sautez dessus, ou faites la toupie !', x: 117, z: -37, critter: 'marmot', time: 35, need: 8,
    holes: [[117, -46], [121, -44], [113, -43], [119, -50], [114, -49], [122, -48]] },
  { id: 'd_poissons', type: 'fish', name: 'La pêche sur la glace', hint: 'Les poissons sautent hors des trous : attrapez-en 5 au vol !', x: 111, z: 45, critter: 'fish', time: 50, need: 5,
    holes: [[124, 42], [131, 39], [138, 42], [127, 32], [140, 32]] },
  { id: 'd_bataille', type: 'tag', name: 'La bataille de boules de neige', hint: 'Chat perché : touchez Praline, Noisette et Chouquette !', x: -18, z: 99, time: 40, leash: 15, speed: 6.0, kids: ['praline', 'noisette', 'chouquette'] },
  { id: 'd_xylophone', type: 'xylo', name: 'La mélodie de glace', hint: 'Écoutez, puis faites sonner les carillons dans le même ordre', x: -127, z: -85, chimes: ['x_1', 'x_2', 'x_3', 'x_4', 'x_5'], seq: [0, 2, 4, 1, 3], time: 90 },
  { id: 'd_chiots', type: 'herd', name: 'Les chiots de l\'école de ski', hint: 'Touchez les chiots perdus et ramenez-les dans le rond doré', x: 10, z: 54, critter: 'puppy', time: 100, pen: { x: -1, z: 46, r: 3.6 },
    chicks: [[-28, 34], [40, 60], [-18, 74], [36, 22]] },
  { id: 'd_congeres', type: 'pads', name: 'Les congères-trampolines', hint: 'Rebondissez sur les 6 congères qui brillent !', x: -98, z: 127, time: 35, pads: ['c_1', 'c_2', 'c_3', 'c_4', 'c_5', 'c_6'] },
  { id: 'd_lac', type: 'coins', name: 'Les flocons rouges du lac', hint: 'Sur la glace, ça glisse ! Attrapez les 8 flocons rouges', x: 101, z: 8, time: 55,
    items: [...around(LK.x, LK.z, 11, 20, 7, 0.4), { x: LK.x, z: LK.z, y: LK.isletY + 1.1 }] },
  { id: 'd_sommet', type: 'rings', name: 'La descente du sommet', hint: 'Dévalez la pente à travers les anneaux : sautez pour les plus hauts !', x: -6, z: -139, time: 30, rings: summitRings },
  { id: 'd_colline', type: 'coins', name: 'Les flocons rouges de la colline', hint: '8 flocons rouges entre les sapins de la colline', x: 148, z: -28, time: 60, items: [] },
  { id: 'd_pingouin', type: 'race', name: 'La glissade du pingouin', hint: 'Le pingouin glisse sur le ventre jusqu\'au lac : battez-le !', x: 165, z: 108, critter: 'penguin', speed: 7.6,
    path: [[161, 104], [166, 86], [156, 66], [141, 52]] },
];
// les flocons de la colline : entre les sapins, là où on peut marcher
{
  const d = DEFIS.find(q => q.id === 'd_colline');
  for (let i = 0; d.items.length < 8 && i < 200; i++) {
    const a = i * 2.39996, r = 6 + (i % 5) * 3;
    const x = 166 + Math.cos(a) * r, z = -42 + Math.sin(a) * r;
    if (!walkable(x, z) || treeAt(x, z, 1.4) || d.items.some(p => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    d.items.push(up(x, z));
  }
}
for (const d of DEFIS) d.y = g(d.x, d.z);

// ---------------------------------------------------------------------------
// Objets posés à la main (temps forts)
// ---------------------------------------------------------------------------
const xyloC = { x: -136, z: -92 };
const PROPS = [
  // trampolines du parcours d'anneaux
  { id: 'j_1', kind: 'drift', x: 90, z: 113 }, { id: 'j_2', kind: 'drift', x: 100, z: 124 },
  // les 6 congères-trampolines de la colline de l'ouest
  ...[[-104, 120], [-112, 129], [-122, 125], [-131, 117], [-129, 105], [-116, 111]].map(([x, z], i) => ({ id: 'c_' + (i + 1), kind: 'drift', x, z })),
  // les carillons d'Olga (pentatonique)
  ...[0, 1, 2, 3, 4].map((i) => ({ id: 'x_' + (i + 1), kind: 'chime', x: xyloC.x + (i - 2) * 3.4, z: xyloC.z, rot: 0, note: [72, 74, 76, 79, 81][i] })),
  // bonshommes à chapeau, au jardin
  { id: 'sm_1', kind: 'snowman', x: 62, z: 115, hat: 0xd83a3a, rot: -0.6 }, { id: 'sm_2', kind: 'snowman', x: 42, z: 139, hat: 0x2a8a4a, rot: 2.6 },
  { id: 'sm_3', kind: 'snowman', x: 60, z: 140, hat: 0xffc020, rot: 3.4 }, { id: 'sm_4', kind: 'snowman', x: 37, z: 131, hat: 0x7a4ae0, rot: 1.8 },
  // gros boutons : lanternes de la patinoire, du chemin, geyser de neige aux igloos
  { id: 'b_rink', kind: 'button', x: -34, z: 156, effect: 'lights', group: 'rink' },
  { id: 'b_path', kind: 'button', x: 5, z: 116, effect: 'lights', group: 'path' },
  { id: 'b_igloo', kind: 'button', x: 136, z: 104, effect: 'geyser', gx: 147, gz: 101 },
  ...[0.6, 1.3, 2.0, 3.3, 4.2, 5.0].map((a, i) => ({ id: 'l_r' + i, kind: 'lantern', group: 'rink', x: RK.x + Math.cos(a) * (RK.rx + 4), z: RK.z + Math.sin(a) * (RK.rz + 3.2) })),
  ...[0, 1, 2, 3].flatMap(i => [{ id: `l_p${i}a`, kind: 'lantern', group: 'path', x: 3.6, z: 108 - i * 9 }, { id: `l_p${i}b`, kind: 'lantern', group: 'path', x: -3.6, z: 108 - i * 9 }]),
  // boules de neige qui grossissent, dans la plaine
  { id: 'bl_1', kind: 'ball', x: -60, z: 128 }, { id: 'bl_2', kind: 'ball', x: 86, z: 90 }, { id: 'bl_3', kind: 'ball', x: -70, z: 40 },
  // au village : sapins à secouer, tas de neige devant les chalets
  { id: 'v_p1', kind: 'pine', x: -30, z: 146 }, { id: 'v_p2', kind: 'pine', x: 30, z: 150 }, { id: 'v_p3', kind: 'pine', x: -14, z: 174 },
  { id: 'v_t1', kind: 'pile', x: -12, z: 138 }, { id: 'v_t2', kind: 'pile', x: 12, z: 160 }, { id: 'v_t3', kind: 'pile', x: -14, z: 124 }, { id: 'v_t4', kind: 'pile', x: 14, z: 134 },
  // blocs de glace au bord de la patinoire
  { id: 'r_i1', kind: 'iceblock', x: RK.x - 19, z: RK.z + 3 }, { id: 'r_i2', kind: 'iceblock', x: RK.x - 18, z: RK.z - 5 }, { id: 'r_i3', kind: 'iceblock', x: RK.x + 3, z: RK.z + 13 },
  // le trou de pêche d'Octave
];
for (const p of PROPS) p.y = g(p.x, p.z);

// Bêtes posées à la main
const FAUNA = [
  { id: 'chiot_1', kind: 'puppy', x: 9, z: 56 }, { id: 'chiot_2', kind: 'puppy', x: 12, z: 50 }, { id: 'chiot_3', kind: 'puppy', x: 6, z: 58 },
  { id: 'firmin_fish', kind: 'fish', x: 121, z: 40 },
  { id: 'renne_1', kind: 'reindeer', x: -64, z: 70 }, { id: 'renne_2', kind: 'reindeer', x: 70, z: 70 },
  { id: 'pingu_1', kind: 'penguin', x: 146, z: 76 }, { id: 'pingu_2', kind: 'penguin', x: 138, z: 82 }, { id: 'pingu_3', kind: 'penguin', x: 160, z: 78 },
  { id: 'bouv_v', kind: 'birds', x: 8, z: 142 }, { id: 'bouv_j', kind: 'birds', x: 44, z: 118 },
  { id: 'luc_c1', kind: 'sprite', x: -134, z: -112 }, { id: 'luc_c2', kind: 'sprite', x: -128, z: -128 },
];

// Cachettes (coffres)
const bx = Math.cos(B0.yaw), bz = -Math.sin(B0.yaw);
const SECRETS = [
  { id: 's_igloo', x: 165, z: 97, rot: -1.4, found: 'Caché derrière l\'igloo ! Les pingouins gardaient ce trésor.' },
  { id: 's_yeti', x: -140, z: -155, rot: 0.4, found: 'Le coffre du Yéti ! Il adore les visites.' },
  { id: 's_pont', x: B0.x + bx * 2.4, z: B0.z + bz * 2.4, rot: B0.yaw, found: 'Sous le pont de bois, sur la rivière gelée !' },
  { id: 's_corniche', x: -174, z: -59, rot: Math.PI / 2, found: 'Tout au bout de la corniche de la cascade !' },
  { id: 's_colline', x: 146, z: 150, rot: 2.4, found: 'Au sommet de la colline aux sapins !' },
  { id: 's_sommet', x: 20, z: -142, rot: -0.6, found: 'Derrière le poste de secours de Bernard !' },
];
for (const s of SECRETS) s.y = s.id === 's_pont' ? S.riverY(S.RIVER.info(s.x, s.z).along) : g(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des trampolines…)
const line = (a, b, n, h) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: g(x, z) + (h || 1.0) }; });
const arc = (a, b, n, top) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: Math.max(g(x, z) + 1, g(a[0], a[1]) + 1 + Math.sin(k * Math.PI) * top) }; });
const TRAILS = [
  { id: 't_yeti', pts: [...line([-152, -102], [-152, -138], 7), ...line([-150, -143], [-143, -152], 4)], say: 'Des traces de grands pieds…' },
  { id: 't_igloo', pts: line([150, 102], [164, 100], 6) },
  { id: 't_pont', pts: line([B0.x - Math.sin(B0.yaw) * -14 + bx * 2.4, B0.z - Math.cos(B0.yaw) * -14 + bz * 2.4], [B0.x + bx * 2.4 + Math.sin(B0.yaw) * -3, B0.z + bz * 2.4 + Math.cos(B0.yaw) * -3], 6, 0.9) },
  { id: 't_corniche', pts: line([-172, -30], [-174, -54], 6, 1.0) },
  { id: 't_colline', pts: line([132, 132], [143, 147], 6) },
  { id: 't_sommet', pts: [...line([8, -131], [19, -131], 4), ...line([19.5, -134], [19.5, -139], 3)] },
  { id: 't_saut1', pts: arc([90, 113], [96, 119], 6, 4.5), say: 'Joli saut !' },
  { id: 't_saut2', pts: arc([-104, 120], [-110, 127], 6, 4.5), say: 'Joli saut !' },
  { id: 't_lac', pts: around(LK.x, LK.z, 7, 7, 8, 0.2, 0.9) },
  { id: 't_riviere', pts: [0.3, 0.315, 0.33, 0.345, 0.36, 0.375, 0.39, 0.405].map(k => { const p = S.RIVER.at(S.RIVER.total * k); return { x: p.x, z: p.z, y: S.riverY(S.RIVER.total * k) + 0.9 }; }), say: 'Quelle glissade !' },
  { id: 't_marmottes', pts: line([100, -20], [113, -40], 6) },
  { id: 't_chalets', pts: arc([-20, 150], [20, 150], 9, 1.6) },
];

// ---------------------------------------------------------------------------
// Palette : bêtes et objets de la neige
// ---------------------------------------------------------------------------
export const PALETTE = {
  fauna: {
    hare: { model: 'hare', ai: 'wander', group: 2, scale: 1.3, tints: [0xffffff, 0xd8c8b0, 0xb8a890], hopper: true, flee: 6.5, run: 8.5, speed: 1.6, home: 9, sound: 'squeak', say: ['Couic !', 'Hop !'], onIce: false },
    birds: { model: 'bird', ai: 'flock', group: 6, scale: 1.6, flee: 5.5, sound: 'chirp', colors: { back: 0x6a7080, breast: 0xe8503a } },
    ermine: { model: 'ermine', ai: 'wander', scale: 1.5, hopper: true, flee: 5, run: 9, speed: 2.2, home: 8, sound: 'squeak', say: ['Kss !'], onIce: false },
    owl: { model: 'owl', ai: 'perch', sound: 'hoot', scale: 1.1 },
    squirrel: { model: 'squirrel', ai: 'wander', scale: 1.5, hopper: true, flee: 5, run: 7, speed: 2, home: 6, sound: 'squeak', say: ['Tchik !'], onIce: false },
    marmot: { model: 'marmot', ai: 'burrow', hole: true, flee: 7, sound: 'whistle', scale: 1.3 },
    reindeer: { model: 'reindeer', ai: 'wander', group: 2, pet: true, shy: false, hopper: false, speed: 0.9, run: 4, home: 12, sound: 'grunt', say: ['Brrouh !', 'Mmmh !'], follow: 18, scale: 0.95, onIce: false },
    fish: { model: 'fish', ai: 'jump', hole: true, colors: { fur: 0xff8a3a } },
    penguin: { model: 'penguin', ai: 'slide', pet: true, shy: false, hopper: false, speed: 1.1, run: 4.5, home: 8, sound: 'honk', say: ['Coin !', 'Coin coin !'], follow: 15, scale: 0.7, group: 2 },
    sprite: { model: 'sprite', ai: 'hover', group: 3, glow: 0x9ad8ff, colors: { fur: 0xdff4ff } },
    puppy: { model: 'puppy', ai: 'wander', pet: true, shy: false, hopper: false, speed: 1.6, run: 6, home: 5, sound: 'yip', say: ['Waf !', 'Wouf !'], follow: 20, colors: { bonnet: 0xd83a3a }, tints: [0xe8c49a, 0xf6f0e8, 0x8a5a3a, 0x3a3030, 0xd8a070], extra: 6, onIce: false },
    skater: { model: 'penguin', ai: 'none', colors: { scarf: 0xff6ab0, bonnet: 0x5ac8ff }, extra: 3 },
    foxcub: { model: 'fox', ai: 'none', colors: { scarf: 0xe8b020 }, scale: 0.85, extra: 1 },
  },
  props: {
    drift: { act: 'bounce', power: 17, r: 1.3, model: 'driftHD' },
    pine: { act: 'shake', drop: 2, solid: 0.45 },
    pile: { act: 'break', drop: 2, chance: 0.6, respawn: 45, model: 'pileHD' },
    iceblock: { act: 'break', drop: 2, chance: 0.7, respawn: 45, color: 0xbfeaff, model: 'iceblockHD' },
    snowman: { act: 'hat', solid: 0.6, drop: 1, model: 'snowmanHD' },
    ball: { act: 'push' },
    chime: { act: 'chime' },
    button: { act: 'press', r: 0.7 },
    lantern: { model: 'lanternHD' },
    // (modèles détaillés de life.js : coffres en planches cerclés d'or)
    chest: { model: 'chestHD' },
    lid: { model: 'lidHD' },
  },
};

// ---------------------------------------------------------------------------
// Où rien ne doit être posé (pistes, chemins des boules de neige, lieux de quête…)
// ---------------------------------------------------------------------------
const KEEP = [
  ...Object.values(S.FOLKS).map(f => [f.x, f.z, 5]), [S.npcs.mamie.x, S.npcs.mamie.z, 5], [S.START.x, S.START.z, 5], [S.npcs.puppy.x, S.npcs.puppy.z, 3],
  ...S.CHECKPOINTS.map(c => [c.x, c.z, 4]), ...S.signs.map(s => [s.x, s.z, 2.5]), ...S.PORTALS.map(p => [p.x, p.z, 3.5]), ...S.BONNETS.map(b => [b.x, b.z, 3]),
  ...S.crates.map(c => [c.x, c.z, 2.5]), [S.SLED_RACK.x, S.SLED_RACK.z, 6], [S.LIFT.base.x, S.LIFT.base.z, 7], [S.STATION.x, S.STATION.z, 6], [S.TOP_DECK.x, S.TOP_DECK.z, 5],
  [S.HUT.x, S.HUT.z, 5], [S.GARDEN.x, S.GARDEN.z, 6], [S.FORT.x, S.FORT.z, S.FORT.r + 4], [S.DEN.x, S.DEN.z, 6], [S.LAKE.x, S.LAKE.z, S.LAKE.islet + 2],
  ...S.IGLOOS.map(i => [i.x, i.z, i.r + 1.5]), [S.FINISH.x, S.FINISH.z, S.FINISH.r + 2], [S.RINK_PODIUM.x, S.RINK_PODIUM.z, 3],
  ...DEFIS.map(d => [d.x, d.z, 3.5]), ...VILLAGERS.map(v => [v.x, v.z, v.ellipse ? 0 : 2.5]), ...SECRETS.map(s => [s.x, s.z, 3]),
];
const chaletNear = (x, z, m) => S.CHALETS.some(c => Math.abs(x - c.x) < c.w / 2 + m && Math.abs(z - c.z) < c.d / 2 + m);
// le tunnel de neige (on n'y pose rien)
const TUN = S.RUN.at((S.TUNNEL.s0 + S.TUNNEL.s1) / 2);
const crevBox = (x, z) => x > S.CREVASSE.x - 8 && x < S.CREVASSE.x + 19 && z > S.CREVASSE.z - 23 && z < S.CREVASSE.z + 12;
export function avoid(x, z, type, kind) {
  if (KEEP.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r)) return true;
  if (S.near(x, z, 3).some(c => !c.off && c.kind !== 'bridge' && c.kind !== 'tree' && S.inside(c, x, z, 1.4))) return true;
  if (S.bones.some(b => Math.abs(b.x - x) < 1.4 && Math.abs(b.z - z) < 1.4)) return true;
  const ri = S.runInfo(x, z).d, rv = S.riverInfo(x, z).d;
  if (type === 'props' && treeAt(x, z, 1.4)) return true;
  if (type === 'props' || type === 'villagers') {
    if (ri < S.RUN_W + 4) return true;
    if (rv < S.RIVER_W + 1.5) return true;
    if (crevBox(x, z)) return true;
    if (S.RINK && ((x - RK.x) / (RK.rx + 1)) ** 2 + ((z - RK.z) / (RK.rz + 1)) ** 2 < 1) return true;
    if (S.SNOWBALLS.some(b => segD(x, z, b.x, b.z, S.GARDEN.x, S.GARDEN.z) < 4)) return true;
    if (segD(x, z, S.LIFT.base.x, S.LIFT.base.z, S.LIFT.top.x, S.LIFT.top.z) < 5) return true;
    if (S.GATES.some(gt => Math.abs(gt.x - x) < 9 && Math.abs(gt.z - z) < 9)) return true;
    if (Math.hypot(x - TUN.x, z - TUN.z) < 14) return true;
    if (kind === 'drift' && (chaletNear(x, z, 9) || Math.hypot(x - S.STATION.x, z - S.STATION.z) < 10 || Math.hypot(x - S.HUT.x, z - S.HUT.z) < 10)) return true;
    if (chaletNear(x, z, 2)) return true;
    if (kind !== 'iceblock' && S.iceAt(x, z)) return true;
  }
  if (type === 'fauna' && ri < S.RUN_W && kind === 'reindeer') return true;
  return false;
}

/** Le « milieu » d'un point : glace, forêt, pente… */
function info(x, z) {
  const forest = TG.within(x, z, 11).length;
  const h = g(x, z), ice = S.iceAt(x, z);
  return { forest, h, ice, lake: Math.hypot(x - LK.x, z - LK.z) < LK.r - 2, igloos: Math.hypot(x - S.SPOTS.igloos.x, z - S.SPOTS.igloos.z) < 40, crev: Math.hypot(x - S.CREVASSE.x, z - S.CREVASSE.z) < 40, flat: slope(x, z) < 0.25 };
}

export const SPEC = {
  seed: 5005, extent: 180, spacing: 14, cover: 10, grid: 3,
  walkable, ground: g, info, avoid,
  highlights: { fauna: FAUNA, props: PROPS, villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    { type: 'fauna', kind: 'hare', w: 3, when: (x, z, i) => !i.ice && i.forest < 5 },
    { type: 'fauna', kind: 'birds', w: 2.2, min: 24, when: (x, z, i) => !i.ice },
    { type: 'fauna', kind: 'ermine', w: 1.2, min: 14, when: (x, z, i) => !i.ice },
    { type: 'fauna', kind: 'owl', w: 2.4, min: 22, when: (x, z, i) => i.forest >= 2 },
    { type: 'fauna', kind: 'squirrel', w: 1.6, min: 16, when: (x, z, i) => !i.ice && i.forest >= 2 },
    { type: 'fauna', kind: 'marmot', w: 2.2, min: 12, when: (x, z, i) => !i.ice && i.h > 10 },
    { type: 'fauna', kind: 'reindeer', w: 0.8, min: 45, when: (x, z, i) => !i.ice && i.forest < 3 && i.h < 30 && i.flat },
    { type: 'fauna', kind: 'fish', w: 3, min: 8, when: (x, z, i) => i.ice },
    { type: 'fauna', kind: 'penguin', w: 2.2, min: 14, when: (x, z, i) => i.ice || i.igloos },
    { type: 'fauna', kind: 'sprite', w: 1.2, min: 24, when: (x, z, i) => i.forest >= 3 || i.crev || i.h > 38 },
    { type: 'props', kind: 'drift', w: 2.4, min: 22, when: (x, z, i) => !i.ice && i.h < 40 },
    { type: 'props', kind: 'pine', w: 2.0, min: 9, when: (x, z, i) => !i.ice },
    { type: 'props', kind: 'pile', w: 2.0, min: 10, when: (x, z, i) => !i.ice },
    { type: 'props', kind: 'iceblock', w: 2.5, min: 9, when: (x, z, i) => i.ice },
    { type: 'props', kind: 'snowman', w: 0.9, min: 40, when: (x, z, i) => !i.ice && i.h < 15 && i.flat, data: { hat: 0x2a2430 } },
    { type: 'props', kind: 'chime', w: 0.5, min: 50, when: (x, z, i) => !i.ice && i.flat, data: { note: 79 } },
    { type: 'fauna', kind: 'hare', w: 0.5 },
  ],
  /** Chouettes perchées sur un sapin ; chapeaux et notes variés. */
  place(e) {
    if (e.kind === 'owl') {
      const n = TG.nearest(e.x, e.z, 14, t => rim(t.x, t.z) < 175), best = n.p, bd = n.d;
      if (best && bd < 14) { const a = e.rot; e.x = Math.round((best.x + Math.cos(a) * 0.9 * best.s) * 10) / 10; e.z = Math.round((best.z + Math.sin(a) * 0.9 * best.s) * 10) / 10; e.perch = best.y + best.h * 0.55; }
      else e.kind = 'squirrel';
    }
    if (e.kind === 'snowman') e.hat = [0x2a2430, 0xd83a3a, 0x2a8a4a, 0xffc020, 0x7a4ae0, 0x3a8ae0][Math.floor(e.rot * 10) % 6];
    if (e.kind === 'chime') e.note = [72, 74, 76, 79, 81, 84][Math.floor(e.rot * 10) % 6];
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 180 }, opts || {}));
