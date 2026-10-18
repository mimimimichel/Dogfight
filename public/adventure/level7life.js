/*
 * Matcha & Ainu — Niveau 7 « La Ferme de Papi Berger » : la couche de vie (données pures).
 *
 * Bêtes (poules et leurs poussins en file, canes et canetons sur la mare, chèvres qui donnent
 * des petits coups de tête, l'âne Pompon, porcelets dans les flaques, chat de grange, souris,
 * lapins du potager, moineaux, corbeaux sur les épouvantails, abeilles autour des ruches,
 * papillons, grenouilles, poissons de la mare), objets (meules-trampolines, bottes de paille,
 * citrouilles, carottes à arracher, buissons fleuris, pommiers et poiriers à secouer,
 * épouvantails à chapeau, ruches, le puits, la girouette, les cloches de Mélodie, flaques de
 * boue, fleurs des champs), 13 défis éclair, des traînées de paillettes, 14 habitants occupés
 * et 7 cachettes.
 *
 * Le plan est calculé ici (lifeplan.js, graine fixe : identique chez tous les joueurs) ;
 * farm.js le donne à life.js qui le fait vivre. Les tests (Node) l'importent aussi.
 */
import * as S from './level7.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const g = (x, z) => S.heightAt(x, z);
/** Le sol de la couche de vie : la surface de la mare compte comme sol (canards, poissons). */
export const ground = (x, z) => Math.max(g(x, z), S.WATER_Y);
const slope = (x, z) => Math.hypot(g(x + 0.5, z) - g(x - 0.5, z), g(x, z + 0.5) - g(x, z - 0.5));
const TG = new PointGrid(10);
for (const t of S.trees) TG.add(t);
const treeAt = (x, z, m) => TG.within(x, z, 3).some(t => Math.hypot(t.x - x, t.z - z) < 0.55 * t.s + (m || 0.3));
/** Distance au chemin de terre le plus proche (les chemins du tracteur restent libres). */
export const pathD = (x, z) => { let d = 99; for (const [[ax, az], [bx, bz]] of S.PATHS) d = Math.min(d, segD(x, z, ax, az, bx, bz)); return d; };
const pondD = (x, z) => Math.hypot(x - S.POND.x, z - S.POND.z);
/** De l'eau (la mare) ? */
export const wet = (x, z) => g(x, z) < S.WATER_Y - 0.25;
/** Une bête de terre peut-elle se tenir là ? (pas dans la mare) */
export const dry = (x, z) => g(x, z) > S.WATER_Y + 0.35;

/** Un point où l'on peut marcher (sur l'île, pas dans l'eau, un mur, une barrière, un tronc ou un rocher). */
export function walkable(x, z) {
  if (Math.hypot(x, z) > 168) return false;
  if (g(x, z) < 0.8) return false;
  if (S.lifeBlockedAt(x, z) || treeAt(x, z)) return false;
  return slope(x, z) < 1.6;
}

// ---------------------------------------------------------------------------
// Lieux de la couche de vie
// ---------------------------------------------------------------------------
const CARROTS = { x: 34, z: 128 };          // le carré de carottes de Lucien (les lapins gourmands)
const BROOD = { x: -36, z: 24, r: 3.4 };     // la caisse à poussins de Mémé Cocotte
const DUCKPEN = { x: 103, z: 102, r: 3.4 };  // le nid de la cane Capucine
const CROWFIELD = { x: -126, z: 12 };        // le champ de l'épouvantail
const HIVES = { x: 148, z: 0 };            // le rucher
const BELLS = { x: 140, z: 64 };             // les cloches de Mélodie
const HAYFIELD = { x: -58, z: 140 };         // le pré aux meules (trampolines)
const GOATS = { x: 140, z: -30 };            // la colline aux chèvres
export const PLACES = { CARROTS, BROOD, DUCKPEN, CROWFIELD, HIVES, BELLS, HAYFIELD, GOATS };

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
export const VILLAGERS = [
  { id: 'rosalie', name: 'Rosalie la fermière', body: 'dog', x: -92, z: 36, yaw: 0.6, act: 'scatter', busy: true, tool: 'basket', fur: 0xd8a070, cloth: 0xe86a8a, throwColor: 0xf0d070, defi: 'd_oeufs' },
  { id: 'cocotte', name: 'Mémé Cocotte', body: 'dog', x: -31, z: 20, yaw: -2.2, act: 'scatter', busy: true, tool: 'basket', fur: 0xf0e6d6, cloth: 0x8a6ae0, scale: 0.92, defi: 'd_poussins' },
  { id: 'lucien', name: 'Lucien le jardinier', body: 'dog', x: 27, z: 121, yaw: 0.9, act: 'rake', busy: true, tool: 'rake', fur: 0x8a6a4a, cloth: 0x4a8a4a, defi: 'd_lapins' },
  { id: 'basile', name: 'Basile le muletier', body: 'dog', x: -34, z: -115, yaw: -1.6, act: 'idle', tool: 'crook', fur: 0xc08a5a, cloth: 0x3a6ab0, defi: 'd_ane' },
  { id: 'blaise', name: 'Blaise le chevrier', body: 'dog', x: 128, z: -42, yaw: 0.8, act: 'flag', tool: 'crook', fur: 0x5a4030, cloth: 0xc8a040, defi: 'd_chevrette' },
  { id: 'melodie', name: 'Mélodie la vachère', body: 'dog', x: 133, z: 70, yaw: 0.7, act: 'idle', tool: 'mallet', fur: 0xe8c49a, cloth: 0xd84a3a, defi: 'd_cloches' },
  { id: 'capucine', name: 'Capucine la cane', body: 'critter', model: 'capucine', x: 106, z: 99, yaw: -2.6, scale: 1.7, act: 'idle', defi: 'd_canetons' },
  { id: 'pirouette', name: 'Pirouette', body: 'dog', x: -32, z: 128, yaw: 2.4, act: 'jumpy', fur: 0xc08a5a, cloth: 0xff6ab0, scale: 0.72, moves: true, defi: 'd_enfants' },
  { id: 'brindille', name: 'Brindille', body: 'dog', x: -24, z: 135, yaw: -2.2, act: 'jumpy', fur: 0x8a5a3a, cloth: 0x5ac8ff, scale: 0.68, moves: true },
  { id: 'galopin', name: 'Galopin', body: 'dog', x: -38, z: 137, yaw: 0.8, act: 'jumpy', fur: 0xf2e6d0, cloth: 0xffb020, scale: 0.66, moves: true },
  { id: 'epouvantail', name: 'Monsieur Épouvantail', body: 'scarecrow', x: -120, z: 4, yaw: 0.9, sleepy: true, hat: 0x5a4a3a, defi: 'd_corbeaux' },
  { id: 'hippolyte', name: 'Hippolyte le pêcheur', body: 'dog', x: 99.5, z: 131, yaw: Math.PI + 0.3, act: 'fish', busy: true, tool: 'rod', fur: 0x9a7a5a, cloth: 0x3a7a8a, defi: 'd_peche' },
  { id: 'jules', name: 'Jules le meunier', body: 'dog', x: 82, z: -90, yaw: 0.4, act: 'idle', tool: 'sack', fur: 0xf4ecdc, cloth: 0xd8d0c0, defi: 'd_epis' },
  { id: 'miel', name: 'Mamie Miel l\'apicultrice', body: 'dog', x: 141, z: 7, yaw: 2.2, act: 'water', busy: true, tool: 'can', fur: 0xe8b060, cloth: 0xf2f0e6 },
];
for (const v of VILLAGERS) v.y = g(v.x, v.z);

const W = (who, text) => ({ who, text });
export const LINES = {
  rosalie: {
    ask: [W('Rosalie la fermière', 'Petits, petits, petits ! Oh, bonjour les toutous ! Mes poules ont pondu des œufs dorés… partout dans le pré !'),
      W('Rosalie la fermière', 'Vous me les ramassez tous avant la fin du chrono ? Le signal doré est juste là, près de moi.'), W('Ainu', 'Des œufs en or ? Ouaf, on y va !')],
    thanks: [W('Rosalie la fermière', 'Tous les œufs dorés ! Ce soir, on fera une omelette… en or ! Tenez, des paillettes pour vous.')],
    talk: [[W('Rosalie la fermière', 'Mes poules se promènent avec leurs poussins en file indienne. C\'est mignon comme tout !')],
      [W('Rosalie la fermière', 'Un bon « Ouaf ! » et toutes les poules s\'envolent… enfin, elles sautillent très fort.')]],
  },
  cocotte: {
    ask: [W('Mémé Cocotte', 'Oh mes lunettes… Où sont passés mes poussins ? Ils étaient là, dans ma caisse en paille !'),
      W('Mémé Cocotte', 'Touchez chaque poussin perdu, il vous suivra. Ramenez-les tous dans le rond doré, près de moi.')],
    thanks: [W('Mémé Cocotte', 'Piou piou piou ! Tout le monde est rentré ! Merci, mes petits chiens. Vous êtes de vrais bergers !')],
    talk: [[W('Mémé Cocotte', 'Un poussin, c\'est léger comme une plume. Et ça piaille comme une trompette !')],
      [W('Mémé Cocotte', 'Quand j\'étais jeune, je courais plus vite que les poules. Si si !')]],
  },
  lucien: {
    ask: [W('Lucien le jardinier', 'Les lapins ! Ils sortent de leurs terriers et ils grignotent toutes mes carottes !'),
      W('Lucien le jardinier', 'Faites-les rentrer : sautez près d\'eux ou faites la toupie. Mais doucement, hein, on ne leur fait pas mal !')],
    thanks: [W('Lucien le jardinier', 'Mes carottes sont sauvées ! Je laisserai quand même les petites aux lapins. Ils ont le droit de goûter.')],
    talk: [[W('Lucien le jardinier', 'Un coup de râteau ici, un coup de râteau là… et ça pousse !')],
      [W('Lucien le jardinier', 'Les carottes, il faut les tirer d\'un coup sec. Essayez, pour voir !')]],
  },
  basile: {
    ask: [W('Basile le muletier', 'Pompon, mon âne, veut faire la course. Il est têtu… mais il court vite quand il veut !'),
      W('Basile le muletier', 'Battez-le jusqu\'au drapeau à damier, près du Rocher aux Corbeaux. Le signal doré, c\'est le départ.')],
    thanks: [W('Basile le muletier', 'Battu, Pompon ! Il boude un peu… Une carotte, et il ira mieux.')],
    talk: [[W('Basile le muletier', 'Hi-han ! C\'est comme ça qu\'il dit bonjour. Et au revoir. Et j\'ai faim.')],
      [W('Basile le muletier', 'Caressez-le : il vous suivra partout, comme un gros chien gris.')]],
  },
  blaise: {
    ask: [W('Blaise le chevrier', 'Ma chevrette Noisette s\'est encore échappée ! Elle a filé avec mon foulard dans la bouche.'),
      W('Blaise le chevrier', 'Elle saute partout sur la colline. Attrapez-la, au signal doré ! Attention, elle est rapide.')],
    thanks: [W('Blaise le chevrier', 'Mon foulard ! Un peu mâchouillé, mais il est là. Merci les toutous !')],
    talk: [[W('Blaise le chevrier', 'Les chèvres adorent donner des petits coups de tête. C\'est leur façon de jouer.')],
      [W('Blaise le chevrier', 'Une chèvre, ça grimpe partout. Même sur le toit de la grange, une fois !')]],
  },
  melodie: {
    ask: [W('Mélodie la vachère', 'Bonjour ! Chaque vache a sa cloche, et chaque cloche a sa note. Écoutez ma petite chanson…'),
      W('Mélodie la vachère', 'Refaites-la dans le même ordre, en touchant les cloches. Si vous vous trompez, je la rejoue !')],
    thanks: [W('Mélodie la vachère', 'Bravo ! Les vaches ont tout entendu : regardez, elles remuent la queue en rythme !')],
    talk: [[W('Mélodie la vachère', 'Ding, dong, ding ! La musique, ça donne du bon lait, vous saviez ?')],
      [W('Mélodie la vachère', 'Margot, la vache aux fleurs, chante faux. Mais chut, ne lui dites pas !')]],
  },
  capucine: {
    ask: [W('Capucine la cane', 'Coin coin ! Mes canetons sont partis se promener… et ils se sont perdus autour de la mare !'),
      W('Capucine la cane', 'Touchez-les, ils vous suivront. Ramenez-les dans mon nid, dans le rond doré. Coin !')],
    thanks: [W('Capucine la cane', 'Coin coin coin ! Mes petits ! Un, deux, trois, quatre… tout le monde est là. Merci !')],
    talk: [[W('Capucine la cane', 'La mare, c\'est notre piscine. Mais attention, les chiens, ça mouille !')],
      [W('Capucine la cane', 'Un caneton, ça suit sa maman en file. Comme un petit train !')]],
  },
  pirouette: {
    ask: [W('Pirouette', 'On joue à chat perché autour des meules ? Tu dois nous toucher tous les trois !'),
      W('Brindille', 'Avant la fin du chrono, hein !'), W('Galopin', 'Mais on court très, très vite !')],
    thanks: [W('Pirouette', 'Tu nous as tous attrapés ! On recommence ? Cette fois je me cache derrière une meule !')],
    talk: [[W('Pirouette', 'Les grosses meules de foin, ça rebondit ! Boing, boing !')],
      [W('Pirouette', 'Papi Berger dit qu\'il ne faut pas sauter dans la boue. Mais Caramel, il a le droit, lui !')]],
  },
  brindille: { talk: [[W('Brindille', 'J\'ai trouvé une plume de poule ! Je vais la mettre dans mes cheveux.')]] },
  galopin: { talk: [[W('Galopin', 'Hi hi ! Tu ne m\'attraperas pas !')]] },
  epouvantail: {
    ask: [W('Monsieur Épouvantail', 'Hein ? Qui aboie ? Oh, des chiens ! Je faisais une petite sieste…'),
      W('Monsieur Épouvantail', 'Pendant que je dormais, les corbeaux sont venus picorer les graines de mon champ. Faites-les s\'envoler, s\'il vous plaît : un bon « Ouaf ! » suffit !')],
    thanks: [W('Monsieur Épouvantail', 'Plus un seul corbeau ! Vous êtes de bien meilleurs épouvantails que moi. Je retourne dormir…')],
    talk: [[W('Monsieur Épouvantail', 'Je suis rempli de paille. Ça gratte un peu, mais c\'est très confortable.')],
      [W('Matcha', 'Il parle, l\'épouvantail !'), W('Monsieur Épouvantail', 'Bien sûr. Mais seulement quand on me réveille poliment.')]],
  },
  hippolyte: {
    ask: [W('Hippolyte le pêcheur', 'Chut… Les poissons de la mare sautent tout près du ponton. Moi, je n\'en attrape jamais !'),
      W('Hippolyte le pêcheur', 'Montez sur le ponton et attrapez-en cinq au vol, au signal doré. Ne tombez pas à l\'eau, hein !')],
    thanks: [W('Hippolyte le pêcheur', 'Cinq poissons au vol ! Et hop, tous relâchés dans la mare. Vous êtes champions !')],
    talk: [[W('Hippolyte le pêcheur', 'La pêche, c\'est de la patience. Et une bonne casquette contre le soleil.')],
      [W('Hippolyte le pêcheur', 'Les canards me volent toujours mes vers de terre. Coin coin, qu\'ils disent. Tu parles !')]],
  },
  jules: {
    ask: [W('Jules le meunier', 'Bonjour, les farinés ! Le vent a soufflé si fort qu\'il a éparpillé mes épis dorés sur la colline du moulin.'),
      W('Jules le meunier', 'Ramassez-les vite, avant que les moineaux les mangent ! Le signal doré est juste là.')],
    thanks: [W('Jules le meunier', 'Tous mes épis ! Avec ça, je ferai la plus belle farine du pays. Et des crêpes pour Papi Berger !')],
    talk: [[W('Jules le meunier', 'Quand les ailes du moulin tournent, la meule écrase le blé. Et ça fait de la farine !')],
      [W('Jules le meunier', 'Mon sac de farine pèse plus lourd que moi. Heureusement que je suis costaud !')]],
  },
  miel: {
    talk: [[W('Mamie Miel l\'apicultrice', 'Bzz bzz… Mes abeilles butinent toutes les fleurs de la ferme. Ne les embêtez pas, elles travaillent !')],
      [W('Mamie Miel l\'apicultrice', 'J\'arrose les fleurs pour mes abeilles. Plus il y a de fleurs, plus il y a de miel !')],
      [W('Mamie Miel l\'apicultrice', 'Si vous secouez une ruche, attention : les abeilles sortent voir qui frappe !')]],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const up = (x, z, h) => ({ x, z, y: g(x, z) + (h === undefined ? 1.1 : h) });
const ringAt = (x, z, h, yaw) => ({ x, z, y: g(x, z) + h, yaw: yaw || 0 });
const around = (cx, cz, r0, r1, n, a0, h) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * Math.PI * 2, r = i % 2 ? r1 : r0; return up(cx + Math.cos(a) * r, cz + Math.sin(a) * r, h); });

// la descente du belvédère : des anneaux qui dévalent la colline vers l'ouest
const lookRings = [];
for (let i = 0; i < 7; i++) { const x = -18 - 6.5 * i, z = -146 + i * 1.5; lookRings.push(ringAt(x, z, i % 2 ? 3.4 : 1.7, -Math.PI / 2)); }
const J = S.JETTY;

export const DEFIS = [
  { id: 'd_oeufs', type: 'coins', name: 'Les œufs dorés', hint: 'Ramassez les 8 œufs dorés cachés dans le pré !', x: -88, z: 40, time: 60,
    items: [up(-104, 22), up(-114, 44), up(-95, 65), up(-78, 58), up(-70, 26), up(-86, 8), up(-108, 2), up(-122, 30)] },
  { id: 'd_poussins', type: 'herd', name: 'Les poussins de Mémé Cocotte', hint: 'Touchez les poussins perdus et ramenez-les dans le rond doré', x: -27, z: 25, critter: 'chick', time: 100, pen: BROOD,
    chicks: [[-52, 10], [-20, 38], [-46, 40], [-14, 10]] },
  { id: 'd_lapins', type: 'whack', name: 'Les lapins gourmands', hint: 'Les lapins sortent pour croquer les carottes : sautez dessus ou faites la toupie !', x: 25, z: 129, critter: 'rabbitwhack', time: 35, need: 8,
    holes: [[32, 124], [36, 128], [32, 132], [38, 134], [40, 124], [28, 130]] },
  { id: 'd_ane', type: 'race', name: 'La course de Pompon', hint: 'Pompon l\'âne file vers le drapeau à damier : arrivez avant lui !', x: -38, z: -118, critter: 'donkey', speed: 6.6,
    path: [[-42, -120], [-62, -124], [-84, -118], [-102, -104], [-112, -84], [-116, -70]] },
  { id: 'd_chevrette', type: 'chase', name: 'La chevrette coquine', hint: 'Elle a le foulard de Blaise : attrapez-la !', x: 132, z: -38, critter: 'goatkid', time: 45, leash: 15, speed: 6.6 },
  { id: 'd_meules', type: 'pads', name: 'Les meules rebondissantes', hint: 'Rebondissez sur les 6 meules de foin qui brillent !', x: -46, z: 146, time: 35, pads: ['m_1', 'm_2', 'm_3', 'm_4', 'm_5', 'm_6'] },
  { id: 'd_belvedere', type: 'rings', name: 'La descente du belvédère', hint: 'Dévalez la colline à travers les anneaux : sautez pour les plus hauts !', x: -12, z: -146, time: 30, rings: lookRings },
  { id: 'd_cloches', type: 'xylo', name: 'La chanson des cloches', hint: 'Écoutez, puis faites sonner les cloches dans le même ordre', x: 136, z: 74, chimes: ['cl_1', 'cl_2', 'cl_3', 'cl_4', 'cl_5'], seq: [0, 2, 1, 4, 3], time: 90 },
  { id: 'd_canetons', type: 'herd', name: 'Les canetons de Capucine', hint: 'Touchez les canetons perdus et ramenez-les au nid de Capucine', x: 109, z: 96, critter: 'duckling', time: 100, pen: DUCKPEN,
    chicks: [[122, 110], [105, 129], [76, 108], [118, 84]] },
  { id: 'd_enfants', type: 'tag', name: 'Chat perché dans le foin', hint: 'Touchez Pirouette, Brindille et Galopin !', x: -28, z: 132, time: 40, leash: 15, speed: 5.8, kids: ['pirouette', 'brindille', 'galopin'] },
  { id: 'd_corbeaux', type: 'scare', name: 'Ouste, les corbeaux !', hint: 'Faites s\'envoler les 8 corbeaux du champ : approchez-vous ou aboyez !', x: -116, z: 8, critter: 'crowdefi', time: 40, hear: 7, sound: 'caw',
    spots: [[-130, 2], [-136, 14], [-128, 22], [-140, 26], [-118, 22], [-146, 6], [-124, -8], [-138, -6]] },
  { id: 'd_peche', type: 'fish', name: 'La pêche du ponton', hint: 'Les poissons sautent près du ponton : attrapez-en 5 au vol !', x: 96.5, z: 134, critter: 'fish', time: 50, need: 5,
    holes: [[J.x + 2.1, 123.6], [J.x - 2.1, 123.6], [J.x + 2.1, 121.4], [J.x - 2.1, 121.4], [J.x, 119.6]] },
  { id: 'd_epis', type: 'coins', name: 'Les épis du meunier', hint: 'Ramassez les 8 épis dorés sur la colline du moulin !', x: 78, z: -94, time: 60,
    items: [up(66, -84), up(70, -104), up(86, -110), up(104, -100), up(114, -84), up(112, -62), up(76, -66), up(96, -54)] },
];
for (const d of DEFIS) d.y = g(d.x, d.z);

// ---------------------------------------------------------------------------
// Objets posés à la main (temps forts)
// ---------------------------------------------------------------------------
const HF = HAYFIELD;
const PROPS = [
  // les 6 meules-trampolines du pré aux meules
  ...[[-70, 132], [-80, 140], [-74, 148], [-62, 150], [-50, 148], [-62, 140]].map(([x, z], i) => ({ id: 'm_' + (i + 1), kind: 'haystack', x, z })),
  // les cloches de Mélodie
  ...[0, 1, 2, 3, 4].map(i => ({ id: 'cl_' + (i + 1), kind: 'cowbell', x: BELLS.x + (i - 2) * 3.2, z: BELLS.z - Math.abs(i - 2) * 1.2, rot: 0, note: [67, 69, 72, 74, 76][i] })),
  // le champ de l'épouvantail
  { id: 'ep_1', kind: 'scarecrow', x: -134, z: 28, rot: 0.5, hat: 0x6a4a2a }, { id: 'ep_2', kind: 'scarecrow', x: -142, z: -4, rot: 1.4, hat: 0x2a4a8a },
  // le rucher de Mamie Miel
  { id: 'ru_1', kind: 'hive', x: HIVES.x, z: HIVES.z }, { id: 'ru_2', kind: 'hive', x: HIVES.x + 3.2, z: HIVES.z - 1.5 }, { id: 'ru_3', kind: 'hive', x: HIVES.x + 1.2, z: HIVES.z - 4.2 },
  ...[[HIVES.x - 4, HIVES.z - 4], [HIVES.x + 5, HIVES.z + 2.5], [HIVES.x - 3, HIVES.z + 4]].map(([x, z], i) => ({ id: 'ru_f' + i, kind: 'wildflowers', x, z })),
  // le puits (un gros bouton : de l'eau qui jaillit) et la girouette
  { id: 'puits', kind: 'well', x: -40, z: 34, effect: 'fountain', rot: 0.3 },
  { id: 'girouette', kind: 'vane', x: 42, z: 88 },
  // le carré de carottes de Lucien
  ...[[24, 134], [42, 130], [44, 122], [26, 138], [36, 138]].map(([x, z], i) => ({ id: 'ca_' + i, kind: 'carrots', x, z })),
  // citrouilles du potager et bottes de paille dans la cour aux poules
  ...[[-48, 76], [-54, 72], [-44, 70], [-58, 80]].map(([x, z], i) => ({ id: 'ci_' + i, kind: 'pumpkin', x, z, rot: i })),
  ...[[-80, 64], [-84, 40], [-64, 20]].map(([x, z], i) => ({ id: 'bo_' + i, kind: 'bale', x, z, rot: i * 1.3 })),
  // les flaques des porcelets
  { id: 'fl_1', kind: 'mudpuddle', x: 20, z: 100 }, { id: 'fl_2', kind: 'mudpuddle', x: 72, z: 92 },
  // le nid de Capucine (des fleurs autour) et la caisse de Mémé Cocotte
  { id: 'nid_f', kind: 'wildflowers', x: DUCKPEN.x + 4, z: DUCKPEN.z - 2 }, { id: 'cai_b', kind: 'bale', x: BROOD.x - 4.5, z: BROOD.z - 2, rot: 0.4 },
];
for (const p of PROPS) p.y = g(p.x, p.z);

// Bêtes posées à la main
const FAUNA = [
  { id: 'can_1', kind: 'ducks', x: S.POND.x - 3, z: S.POND.z + 1, rot: 0.5 }, { id: 'can_2', kind: 'ducks', x: S.POND.x + 3, z: S.POND.z - 2, rot: 2.5 },
  { id: 'pou_1', kind: 'hens', x: -84, z: 50 }, { id: 'pou_2', kind: 'hens', x: -40, z: 30 },
  { id: 'che_1', kind: 'goats', x: GOATS.x + 6, z: GOATS.z + 6 }, { id: 'che_2', kind: 'goats', x: GOATS.x - 8, z: GOATS.z - 10 },
  { id: 'pompon', kind: 'donkey', x: -46, z: -110 },
  { id: 'por_1', kind: 'piglets', x: 20, z: 100 }, { id: 'por_2', kind: 'piglets', x: 72, z: 92 },
  { id: 'abe_1', kind: 'bees', x: HIVES.x + 1, z: HIVES.z - 1 }, { id: 'abe_2', kind: 'bees', x: HIVES.x - 3, z: HIVES.z + 3 },
  { id: 'cha_g', kind: 'cat', x: 34, z: 60 },
  { id: 'lap_1', kind: 'rabbits', x: 46, z: 140 },
  { id: 'gre_1', kind: 'frogs', x: 84, z: 112 }, { id: 'gre_2', kind: 'frogs', x: 106, z: 126 },
  { id: 'poi_1', kind: 'fish', x: 92, z: 114 }, { id: 'poi_2', kind: 'fish', x: 99, z: 119 },
  // corbeaux perchés au bout des bras des épouvantails
  { id: 'cor_1', kind: 'crow', x: -134 + Math.cos(0.5) * 1.0, z: 28 - Math.sin(0.5) * 1.0, perch: g(-134, 28) + 1.82 }, { id: 'cor_2', kind: 'crow', x: -142 - Math.cos(1.4) * 1.0, z: -4 + Math.sin(1.4) * 1.0, perch: g(-142, -4) + 1.82 },
];

// Cachettes (coffres)
const bale3 = S.ROUND_BALES[3];
const SECRETS = [
  { id: 's_grange', x: 22, z: 41.5, rot: Math.PI, found: 'Caché derrière la grange ! Les souris le gardaient bien.' },
  { id: 's_rocher', x: S.CROWS.x - 8, z: S.CROWS.z - 7, rot: 0.8, found: 'Derrière le Rocher aux Corbeaux ! Les corbeaux adorent ce qui brille.' },
  { id: 's_belvedere', x: -6, z: -164, rot: Math.PI, found: 'Tout au bout de l\'île, derrière le belvédère !' },
  { id: 's_botte', x: bale3.x, z: bale3.z, y: bale3.y + 1.6, rot: 1.4, found: 'Tout en haut d\'une grosse botte de foin !' },
  { id: 's_mare', x: 110, z: 119, rot: -2, found: 'Au bord de la mare, entre les roseaux !' },
  { id: 's_moulin', x: 99, z: -88, rot: 0.6, found: 'Derrière le moulin, à l\'abri du vent !' },
  { id: 's_ruches', x: 158, z: -8, rot: -0.6, found: 'Derrière les ruches de Mamie Miel : un trésor tout sucré !' },
];
for (const s of SECRETS) if (s.y === undefined) s.y = g(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des meules…)
const line = (a, b, n, h) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: g(x, z) + (h || 1.0) }; });
const arc = (a, b, n, top) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: Math.max(g(x, z) + 1, g(a[0], a[1]) + 1 + Math.sin(k * Math.PI) * top) }; });
const TRAILS = [
  { id: 't_grange', pts: [...line([8, 38], [16, 38], 4), ...line([18, 39], [22, 39], 3)], say: 'Des paillettes derrière la grange…' },
  { id: 't_rocher', pts: line([-116, -62], [-131, -64], 6) },
  { id: 't_belvedere', pts: line([-2, -150], [-6, -161], 6) },
  { id: 't_botte', pts: [...line([10, 40], [10, 33.5], 4), { x: bale3.x, z: bale3.z + 1.0, y: bale3.y + 2.6 }], say: 'Tout en haut !' },
  { id: 't_mare', pts: line([103, 129], [109, 123], 5) },
  { id: 't_moulin', pts: line([88, -94], [97, -90], 5) },
  { id: 't_ruches', pts: line([150, -2], [156, -7], 4) },
  { id: 't_saut1', pts: arc([-70, 132], [-76, 138], 6, 4.5), say: 'Joli saut !' },
  { id: 't_saut2', pts: arc([-62, 150], [-50, 148], 6, 4.5), say: 'Joli saut !' },
  { id: 't_tournesols', pts: line([-108, 105], [-82, 105], 9, 2.4), say: 'Au-dessus des tournesols !' },
  { id: 't_verger', pts: around(S.ORCHARD.x, S.ORCHARD.z, 11, 11, 8, 0.2, 1.0) },
  { id: 't_pre', pts: arc([-90, -30], [-78, -6], 8, 1.4) },
];

// ---------------------------------------------------------------------------
// Palette : bêtes et objets de la ferme
// ---------------------------------------------------------------------------
export const PALETTE = {
  fauna: {
    hens: { model: 'hen', ai: 'wander', group: 4, line: true, young: 'chick', gap: 0.75, hopper: false, flee: 4, run: 4.5, speed: 1.0, home: 7, sound: 'cluck', say: ['Cot cot !', 'Codêêêt !'], tints: [0xffffff, 0xd08a50, 0xf0d8b0, 0x9a5a34] },
    chick: { liteNear: 30, model: 'chick', ai: 'wander', pet: true, shy: false, hopper: true, speed: 1.4, run: 5, home: 4, sound: 'peep', say: ['Piou !', 'Piou piou !'], follow: 15, scale: 1.2, tints: [0xffffff, 0xfff0c0], extra: 4 },
    ducks: { flapNear: 12, model: 'duck', ai: 'swim', water: true, group: 4, line: true, young: 'duckling', gap: 0.65, speed: 0.7, run: 3.2, home: 5.5, flee: 3, sound: 'quack', say: ['Coin !', 'Coin coin !'], colors: { body: 0xf6f2e8, head: 0xfbfaf4, breast: 0xf0ebe0, wing: 0xe6e0d4, bill: 0xf09a2a } },
    duckling: { liteNear: 40, flapNear: 10, model: 'duckling', ai: 'swim', water: true, colors: { fur: 0xffe070 }, extra: 4 },
    goats: { model: 'goat', ai: 'wander', group: 2, pet: true, shy: false, hopper: false, speed: 1.0, run: 5.5, home: 10, sound: 'bleat', say: ['Bêêh !', 'Mêêê !'], butt: 5, buttText: ['Boing !', 'Les chèvres adorent jouer à coups de tête'], tints: [0xffffff, 0xf0e2c8, 0x9a6a4a, 0x6a5a52] },
    goatkid: { model: 'goat', ai: 'none', scale: 0.62, extra: 1 },
    donkey: { model: 'donkey', ai: 'wander', pet: true, shy: false, hopper: false, speed: 0.9, run: 4, home: 10, sound: 'bray', say: ['Hi-han !', 'Hiiii-han !'], follow: 18, extra: 1 },
    piglets: { model: 'piglet', ai: 'wander', group: 3, pet: true, shy: false, hopper: false, speed: 1.3, run: 5, home: 4, sound: 'oink', say: ['Groin !', 'Groin groin !'], follow: 12 },
    cat: { model: 'cat', skin: 'fur', ai: 'wander', pet: true, shy: false, hopper: false, speed: 0.8, run: 5, home: 6, sound: 'meow', say: ['Miaou !', 'Rrrrr…'], follow: 14, tints: [0xe8a05a, 0x8a8a8a, 0xf4ece0, 0x4a4040] },
    mice: { liteNear: 30, model: 'mouse', skin: 'fur', ai: 'wander', group: 2, hopper: false, flee: 4, run: 7, speed: 1.8, home: 4, sound: 'squeak', say: ['Couic !'] },
    rabbits: { liteNear: 40, model: 'hare', ai: 'wander', group: 2, scale: 1.0, colors: { fur: 0xb89470, tip: 0x5a4030 }, hopper: true, flee: 6, run: 8, speed: 1.5, home: 8, sound: 'squeak', say: ['Hop !'] },
    rabbitwhack: { model: 'hare', ai: 'none', colors: { fur: 0xb08a62, tip: 0x5a4030 }, scale: 1.1 },
    sparrows: { liteNear: 45, flapNear: 30, model: 'bird', foldWings: true, ai: 'flock', group: 5, scale: 1.1, flyH: 9, flee: 5, sound: 'chirp', colors: { back: 0x8a6a4a, breast: 0xe8d8c0, cap: 0x6a4a34, tip: 0x5a4030, fold: true } },
    crows: { liteNear: 50, flapNear: 35, model: 'bird', foldWings: true, ai: 'flock', group: 4, scale: 1.7, flyH: 10, flee: 6, sound: 'caw', colors: { back: 0x22222a, breast: 0x2e2e36, cap: 0x18181e, beak: 0x2a2a2a, tip: 0x111116, fold: true } },
    crow: { model: 'bird', foldWings: true, ai: 'perch', scale: 1.7, sound: 'caw', say: ['Croâ !'], colors: { back: 0x22222a, breast: 0x2e2e36, cap: 0x18181e, beak: 0x2a2a2a, tip: 0x111116, fold: true } },
    crowdefi: { model: 'bird', foldWings: true, ai: 'none', scale: 1.7, colors: { back: 0x22222a, breast: 0x2e2e36, cap: 0x18181e, beak: 0x2a2a2a, tip: 0x111116, fold: true } },
    bees: { liteNear: 35, flapNear: 20, model: 'bee', ai: 'hover', group: 4, glow: false, flapRate: 70, alt: 1.1, range: 2.2, scale: 1.6, sound: 'buzz' },
    butterflies: { liteNear: 24, model: 'butterfly', ai: 'hover', group: 2, glow: false, flapRate: 13, alt: 0.9, range: 3, scale: 1.2, colors: { wing: 0xffb020 } },
    frogs: { liteNear: 35, model: 'frog', ai: 'hop', group: 2, flee: 3.5, home: 4, sound: 'croak', say: ['Croâ !'], scale: 1.2 },
    fish: { model: 'fish', ai: 'jump', water: true, hole: true, colors: { fur: 0xff8a3a } },
    capucine: { flapNear: 10, model: 'duck', ai: 'none', colors: { body: 0xf6f2e8, head: 0xfbfaf4, breast: 0xf0ebe0, wing: 0xe6e0d4, bill: 0xf09a2a, ring: 0xff6ab0 }, extra: 1 },
  },
  props: {
    haystack: { act: 'bounce', power: 17, r: 1.3, model: 'haystackHD' },
    bale: { liteNear: 50, act: 'break', drop: 2, chance: 0.6, respawn: 45, color: 0xf0d478, model: 'baleHD' },
    pumpkin: { liteNear: 45, act: 'break', drop: 2, chance: 0.7, respawn: 50, color: 0xf08a28 },
    carrots: { liteNear: 40, act: 'break', drop: 1, chance: 0.6, respawn: 40, color: 0xf07a20 },
    bush: { act: 'shake', drop: 2, solid: 0.6, color: 0x6ac04a },
    fruittree: { act: 'shake', drop: 2, solid: 0.35, color: 0x6ac04a },
    wildflowers: { liteNear: 35, act: 'shake', drop: 1, color: 0xffb0d0 },
    scarecrow: { act: 'hat', solid: 0.4, drop: 1, hatY: 2.45 },
    hive: { act: 'shake', drop: 1, solid: 0.6, color: 0xffd23a, sound: 'buzz' },
    well: { act: 'press', r: 1.1, solid: 1.0 },
    vane: { act: 'spin', solid: 0.2, color: 0xffe070 },
    cowbell: { act: 'chime', solid: 0.15 },
    mudpuddle: { liteNear: 40, act: 'splash', r: 1.35, top: 0.6, color: 0x6a4a2a, mud: true },
    hole: { colors: { inner: 0x1e3a3a, rim: 0x9ac8c8 } },
    coin: { model: 'egg' },
    marker: {},
  },
};

// ---------------------------------------------------------------------------
// Où rien ne doit être posé (chemins du tracteur, lieux de quête, l'enclos…)
// ---------------------------------------------------------------------------
const KEEP = [
  [S.npcs.mamie.x, S.npcs.mamie.z, 5], [S.npcs.puppy.x, S.npcs.puppy.z, 3], [S.npcs.papi.x, S.npcs.papi.z, 5], [S.START.x, S.START.z, 6],
  ...S.CHECKPOINTS.map(c => [c.x, c.z, 4]), ...S.signs.map(s => [s.x, s.z, 3]), ...S.crates.map(c => [c.x, c.z, 2.5]), ...S.medals.map(m => [m.x, m.z, 3.5]),
  ...S.SAIL_PARTS.map(p => [p.x, p.z, 3.5]), ...S.COWS.map(c => [c.x, c.z, 4]), [S.TRACTOR.x, S.TRACTOR.z, 7], [S.BASKET.x, S.BASKET.z, 3],
  ...S.HENS.map(h => [h.home.x, h.home.z, h.home.r + 1.5]), [S.PIGLET.x, S.PIGLET.z, 3.5], [S.PIGLET_HOME.x, S.PIGLET_HOME.z, 4],
  [S.MILL.x, S.MILL.z, 7.5], [S.LOOKOUT.x, S.LOOKOUT.z, 6], [S.CROWS.x, S.CROWS.z, 7], [S.GARDEN.x, S.GARDEN.z, 5],
  [S.LOFT.x, S.LOFT.z + 3, 8], ...S.HAY_STACK.map(b => [b.x, b.z, 3]), ...S.LOFT_BALES.map(b => [b.x, b.z, 2.5]),
  ...S.SHEEP.filter(s => s.lamb).map(s => [s.x, s.z, 5]),
  ...DEFIS.map(d => [d.x, d.z, 3.5]), ...VILLAGERS.map(v => [v.x, v.z, 2.5]), ...SECRETS.map(s => [s.x, s.z, 3]),
];
const inRect = (x, z, R, m) => Math.abs(x - R.x) < R.w / 2 + m && Math.abs(z - R.z) < R.d / 2 + m;
/** Le pré des moutons et leur enclos : une arène de rassemblement (rien de solide, rien au sol). */
export const meadow = (x, z) => x > -86 && x < -16 && z > -84 && z < -14;
export function avoid(x, z, type, kind) {
  if (KEEP.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r)) return true;
  if (S.bones.some(b => Math.abs(b.x - x) < 1.5 && Math.abs(b.z - z) < 1.5)) return true;
  if (S.colliders.some(c => !c.off && Math.abs(c.x - x) < 12 && Math.abs(c.z - z) < 12 && S.inside(c, x, z, type === 'props' ? 1.6 : 0.6))) return true;
  const flying = kind === 'sparrows' || kind === 'crows' || kind === 'butterflies' || kind === 'bees';
  if (meadow(x, z) && !flying) return true;
  if (S.inPen(x, z) || inRect(x, z, S.PIGPEN, 1.5)) return !flying;
  if (type === 'props' || type === 'villagers') {
    if (pathD(x, z) < 4) return true;                                     // les chemins du tracteur restent libres
    if (Math.hypot(x - S.SPOTS.yard.x, z - S.SPOTS.yard.z) < 24) return true;   // la cour (tracteur, grange, foin)
    if (inRect(x, z, S.SUNFLOWERS, 2)) return true;
    if (pondD(x, z) < S.POND.r + 3.5) return true;
    if (Math.hypot(x - S.HENS_YARD.x, z - S.HENS_YARD.z) < S.HENS_YARD.r + 3) return true;
    if (treeAt(x, z, 2)) return true;
  }
  if (type === 'fauna' && kind !== 'ducks' && kind !== 'fish' && !flying && !dry(x, z)) return true;
  return false;
}

/** Le « milieu » d'un point : mare, colline, verger, prés, près de la ferme… */
function info(x, z) {
  const h = g(x, z), yard = Math.hypot(x - S.SPOTS.yard.x, z - S.SPOTS.yard.z);
  return { h, forest: TG.within(x, z, 11).length, pond: pondD(x, z), wet: wet(x, z), farm: yard < 55, hill: h > 3.5, flat: slope(x, z) < 0.3, meadow: meadow(x, z), path: pathD(x, z) };
}

export const SPEC = {
  seed: 7007, extent: 172, spacing: 15, cover: 10, grid: 3,
  walkable: (x, z) => walkable(x, z) || (wet(x, z) && pondD(x, z) < S.POND.r), ground, info, avoid,
  highlights: { fauna: FAUNA, props: PROPS, villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    { type: 'fauna', kind: 'ducks', w: 6, min: 7, when: (x, z, i) => i.wet && i.pond < S.POND.r - 2, max: 4 },
    { type: 'fauna', kind: 'frogs', w: 4, min: 8, when: (x, z, i) => !i.wet && i.pond < S.POND.r + 7 },
    { type: 'fauna', kind: 'butterflies', w: 1.0, min: 22, when: (x, z, i) => !i.wet },
    { type: 'fauna', kind: 'sparrows', w: 1.8, min: 22, when: (x, z, i) => !i.wet },
    { type: 'fauna', kind: 'crows', w: 1.0, min: 30, when: (x, z, i) => !i.wet && Math.hypot(x - CROWFIELD.x, z - CROWFIELD.z) < 45 },
    { type: 'fauna', kind: 'rabbits', w: 2.2, min: 16, when: (x, z, i) => !i.wet && !i.farm && i.forest < 3 },
    { type: 'fauna', kind: 'hens', w: 1.4, min: 26, when: (x, z, i) => !i.wet && i.farm },
    { type: 'fauna', kind: 'mice', w: 1.4, min: 14, when: (x, z, i) => !i.wet && i.farm },
    { type: 'fauna', kind: 'cat', w: 0.7, min: 40, when: (x, z, i) => !i.wet && i.farm },
    { type: 'fauna', kind: 'goats', w: 1.2, min: 30, when: (x, z, i) => i.hill && !i.farm },
    { type: 'fauna', kind: 'bees', w: 0.8, min: 26, when: (x, z, i) => !i.wet && i.forest >= 1 },
    { type: 'props', kind: 'haystack', w: 1.6, min: 26, when: (x, z, i) => i.flat && !i.farm },
    { type: 'props', kind: 'bush', w: 3.2, min: 11, when: (x, z, i) => !i.wet },
    { type: 'props', kind: 'wildflowers', w: 2.4, min: 9, when: (x, z, i) => !i.wet && (i.farm || i.pond < 30) },
    { type: 'props', kind: 'fruittree', w: 1.4, min: 20, when: (x, z, i) => !i.wet && i.forest < 4 },
    { type: 'props', kind: 'bale', w: 1.2, min: 16, when: (x, z, i) => !i.wet && i.flat },
    { type: 'props', kind: 'pumpkin', w: 0.8, min: 18, when: (x, z, i) => !i.wet && i.farm },
    { type: 'props', kind: 'scarecrow', w: 0.6, min: 30, when: (x, z, i) => i.flat && Math.hypot(x - CROWFIELD.x, z - CROWFIELD.z) < 55, data: { hat: 0x5a4a3a } },
    { type: 'fauna', kind: 'butterflies', w: 0.5 },
  ],
  /** Chapeaux variés ; un peu de couleur dans les épouvantails. */
  place(e) {
    if (e.kind === 'scarecrow') e.hat = [0x5a4a3a, 0x2a4a8a, 0x8a2a2a, 0x3a6a3a][Math.floor(e.rot * 10) % 4];
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 172 }, opts || {}));
