/*
 * Matcha & Ainu — Niveau 8 « Le Château des Chats » : la couche de vie (données pures).
 *
 * Les gens du château sont des chats : gardes en ronde (casque à plumet), écuyers qui
 * s'entraînent, bouffon qui jongle, cheffe cuisinière, orchestre (chef, luth, tambour, trompette),
 * jardinière, peintre, allumeur de braseros, blanchisseuse, pêcheur, un gros chat qui dort…
 * et un gentil fantôme-chat caché derrière le donjon.
 * Bêtes : chatons, souris, pigeons, chauves-souris sur les tours, lapins, écureuils, papillons,
 * grenouilles, carpes dans les douves, canes et canetons.
 * Objets : poufs-trampolines, buis taillés en chat, tonneaux, caisses, jarres, bottes de paille,
 * armures (clong !), cloches de l'orchestre, braseros et candélabres à allumer, portraits dont les
 * yeux suivent les chiens, une bibliothèque à passage secret, pelotes à pousser, mannequins.
 * 14 défis éclair, 17 habitants, 6 cachettes et leurs traînées de paillettes.
 *
 * Le plan est calculé ici (lifeplan.js, graine fixe) ; castle.js le donne à life.js.
 * Rien ne touche aux énigmes du château, au labyrinthe, au lac aux nénuphars, à la cachette
 * de la boîte à musique ni au jeu de chat de la salle du trône.
 */
import * as S from './level8.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const inRect = (r, x, z, m) => { m = m || 0; return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; };
const FL = S.FLOOR, TOPY = S.TOP;
/** Le sol de la vie : la terre, les dalles… et la surface de l'eau (canes, carpes). */
export const ground = (x, z) => Math.max(S.heightAt(x, z), S.WATER_Y);
const h0 = (x, z) => S.heightAt(x, z);
const TG = new PointGrid(10);
for (const t of S.trees) TG.add(t);
const treeAt = (x, z, m) => TG.within(x, z, 4).some(t => Math.hypot(t.x - x, t.z - z) < 0.5 * t.s + (m === undefined ? 0.3 : m));
const islandR = (x, z) => Math.hypot(x, z + 4) / 88;
const lakeE = (x, z) => ((x - S.LAKE.x) / S.LAKE.rx) ** 2 + ((z - S.LAKE.z) / S.LAKE.rz) ** 2;

/** Un point où l'on peut marcher (hors de l'eau, des murs, des haies et des arbres). */
export function walkable(x, z) {
  if (h0(x, z) < 0.25) return false;
  if (S.blockedAt(x, z) || treeAt(x, z)) return false;
  return true;
}
/** Dans l'eau (douves, lac, mer) : là où nagent les canes et sautent les carpes. */
export const inWater = (x, z) => h0(x, z) < -0.6;
/** Un point libre pour un objet ou un habitant posé à la main : on cherche autour, en spirale. */
function free(x, z, r) {
  r = r || 1.2;
  const ok = (px, pz) => walkable(px, pz) && !treeAt(px, pz, r + 0.3) && [0, 1, 2, 3, 4, 5].every(k => { const a = k * 1.047; return walkable(px + Math.cos(a) * r, pz + Math.sin(a) * r); });
  if (ok(x, z)) return [x, z];
  for (let i = 1; i < 400; i++) { const a = i * 2.39996, d = 0.4 * Math.sqrt(i); const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (ok(px, pz)) return [Math.round(px * 10) / 10, Math.round(pz * 10) / 10]; }
  return [x, z];
}
/** Au bord du lac, dans l'eau : à `inset` mètres de la berge, dans la direction a. */
function lakeEdge(a, inset) {
  let f = 0.4;
  while (f < 1.8 && h0(S.LAKE.x + Math.cos(a) * S.LAKE.rx * f, S.LAKE.z + Math.sin(a) * S.LAKE.rz * f) < 0.25) f += 0.01;
  const k = Math.hypot(Math.cos(a) * S.LAKE.rx, Math.sin(a) * S.LAKE.rz);
  const fi = f - inset / k, fo = f + 1.2 / k;
  return { water: [S.LAKE.x + Math.cos(a) * S.LAKE.rx * fi, S.LAKE.z + Math.sin(a) * S.LAKE.rz * fi], shore: [S.LAKE.x + Math.cos(a) * S.LAKE.rx * fo, S.LAKE.z + Math.sin(a) * S.LAKE.rz * fo] };
}
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Lieux (tout autour du château)
// ---------------------------------------------------------------------------
const SPOT = {
  ecuyers: free(-31, 44, 2), cuisine: free(-42, 6, 2), potager: free(44, 48, 2), buis: free(26, 33, 2), orchestre: free(75, -6, 2),
  plage: [-48, 66], coussins: free(-64, 2, 2), canetons: free(33, 22, 1.5), fantome: free(-28, -85, 1.5),
};

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
const V = (id, name, x, z, o) => { const [fx, fz] = o.exact ? [x, z] : free(x, z, o.moves ? 0.8 : 1.3); return Object.assign({ id, name, body: 'cat', x: fx, z: fz }, o); };
export const VILLAGERS = [
  V('moustachu', 'Sire Moustachu', SPOT.ecuyers[0] + 3, SPOT.ecuyers[1] - 6, { yaw: Math.PI, act: 'spar', tool: 'sword', cap: 'helmet', fur: 0xb0a8a0, cloth: 0x3a5ad8, defi: 'd_ecuyers' }),
  V('pistache', 'Pistache', SPOT.ecuyers[0] - 3, SPOT.ecuyers[1], { yaw: 0.4, act: 'spar', tool: 'sword', cap: 'helmet', fur: 0xf0b070, cloth: 0x5ab060, scale: 0.68, moves: true }),
  V('reglisse', 'Réglisse', SPOT.ecuyers[0] + 4, SPOT.ecuyers[1] + 2, { yaw: -2.6, act: 'spar', tool: 'sword', cap: 'helmet', fur: 0x4a4446, cloth: 0xd84a5a, scale: 0.66, moves: true }),
  V('capre', 'Câpre', SPOT.ecuyers[0], SPOT.ecuyers[1] + 6, { yaw: 2.9, act: 'spar', tool: 'sword', cap: 'helmet', fur: 0xf4ece0, cloth: 0xe8a020, scale: 0.64, moves: true }),
  V('croquette', 'Cheffe Croquette', SPOT.cuisine[0], SPOT.cuisine[1], { yaw: 0.9, act: 'stir', tool: 'ladle', cap: 'toque', fur: 0xf0a050, cloth: 0xf4f0e8, defi: 'd_pre' }),
  V('plume', 'Dame Plume', SPOT.potager[0] - 4, SPOT.potager[1] - 3, { yaw: 0.6, act: 'water', tool: 'can', cap: 'beret', fur: 0xd8d0c8, cloth: 0x5aa060, defi: 'd_potager' }),
  V('pinceau', 'Pinceau le peintre', SPOT.buis[0] - 5, SPOT.buis[1] - 2, { yaw: 1.2, act: 'paint', tool: 'brush', cap: 'beret', fur: 0x8a6a4a, cloth: 0xc87ad8, defi: 'd_buis' }),
  V('anatole', 'Anatole le garde', 10, 22, { yaw: 0, act: 'guard', tool: 'spear', cap: 'helmet', fur: 0xf4e0c0, cloth: 0x3a5ad8, defi: 'd_souris' }),
  V('ronron', 'Maestro Ronron', SPOT.orchestre[0], SPOT.orchestre[1] - 4, { yaw: 0, act: 'conduct', tool: 'baton', fur: 0x5a5458, cloth: 0x2a2a3a, busy: true, defi: 'd_orchestre' }),
  V('melodie', 'Mélodie', SPOT.orchestre[0] - 3.5, SPOT.orchestre[1] - 7, { yaw: 0.3, act: 'lute', tool: 'lute', fur: 0xffffff, cloth: 0xd84a7a, busy: true, inst: 'pluck', tune: [72, 76, 79, 76, 74, 77, 81, 0, 79, 77, 76, 74, 72, 0, 0, 0], beat: 0.32 }),
  V('tambourin', 'Tambourin', SPOT.orchestre[0] + 3.5, SPOT.orchestre[1] - 7, { yaw: -0.3, act: 'drum', tool: 'drumstick', fur: 0xf0b070, cloth: 0x3a8a5a, busy: true, inst: 'mallet', tune: [48, 0, 55, 0, 48, 48, 55, 0], beat: 0.32, vol: 0.05 }),
  V('fanfare', 'Fanfare', SPOT.orchestre[0], SPOT.orchestre[1] - 9, { yaw: 0, act: 'trumpet', tool: 'trumpet', fur: 0xc8a888, cloth: 0xe8b020, busy: true, inst: 'flute', tune: [0, 0, 0, 0, 0, 0, 0, 0, 84, 0, 83, 0, 81, 0, 79, 0], beat: 0.32, vol: 0.04 }),
  V('pirouette', 'Pirouette le bouffon', SPOT.orchestre[0] - 6, SPOT.orchestre[1] + 12, { yaw: 2.6, act: 'juggle', cap: 'jester', fur: 0xffffff, cloth: 0xd83a4a, defi: 'd_chaton' }),
  V('lili', 'Lili la blanchisseuse', SPOT.canetons[0] + 1.5, SPOT.canetons[1] - 1, { yaw: -2.3, act: 'sweep', tool: 'broom', fur: 0xf4e0c0, cloth: 0x7ab0e0, defi: 'd_canetons' }),
  V('lucien', 'Lucien l\'allumeur', -36, 18, { yaw: 2.2, act: 'pole', tool: 'pole', cap: 'hood', fur: 0x8a8088, cloth: 0x6a5a8a, defi: 'd_braseros' }),
  V('minet', 'Gros Minet', SPOT.coussins[0] - 7, SPOT.coussins[1] + 7, { yaw: 0.8, sleepy: true, act: 'idle', fur: 0xf0a050, cloth: 0xf4c0d0, scale: 1.2 }),
  V('fantomette', 'Fantômette', SPOT.fantome[0], SPOT.fantome[1], { yaw: 0.2, ghost: true, hidden: 16, act: 'idle', busy: false }),
];
// Ernest pêche au bord du lac, côté sud-est (face à l'eau)
{
  const e = lakeEdge(0.55, 0.9);
  const [x, z] = free(e.shore[0], e.shore[1], 0.9);
  VILLAGERS.push({ id: 'ernest', name: 'Ernest le pêcheur', body: 'cat', x, z, yaw: Math.atan2(S.LAKE.x - x, S.LAKE.z - z), act: 'fish', tool: 'rod', cap: 'beret', fur: 0x8a6a4a, cloth: 0x3a7a5a, defi: 'd_grenouilles' });
}
for (const v of VILLAGERS) v.y = ground(v.x, v.z);

const W = (who) => (text) => ({ who, text });
const MOU = W('Sire Moustachu'), CRO = W('Cheffe Croquette'), PLU = W('Dame Plume'), PIN = W('Pinceau le peintre'), ANA = W('Anatole le garde'), RON = W('Maestro Ronron'),
  PIR = W('Pirouette le bouffon'), LIL = W('Lili la blanchisseuse'), LUC = W('Lucien l\'allumeur'), ERN = W('Ernest le pêcheur'), MIN = W('Gros Minet'), FAN = W('Fantômette'),
  MAT = W('Matcha'), AIN = W('Ainu');
export const LINES = {
  moustachu: {
    ask: [MOU('En garde, les toutous ! Je suis Sire Moustachu, maître d\'armes du château.'), MOU('Mes trois écuyers sont des petits malins : ils filent dès qu\'on veut les attraper. Touchez-les tous les trois avant la fin du temps, au signal doré !'), MAT('Un entraînement de chevaliers ? On arrive !')],
    thanks: [MOU('Les trois touchés ! Vous êtes plus vifs qu\'un chat qui a vu une souris. Je vous nomme chevaliers d\'honneur !')],
    talk: [[MOU('Un chevalier, ça salue, ça partage et ça ne griffe jamais. Sauf les mannequins de paille.')], [MOU('Tapez les mannequins d\'entraînement : il en tombe parfois des paillettes.')], [MOU('Autrefois, chats et chiens se battaient en duel. Aujourd\'hui, on joue. C\'est bien mieux.')]],
  },
  pistache: { talk: [[{ who: 'Pistache', text: 'Hiya ! Je suis le plus rapide des écuyers ! Enfin… presque.' }], [{ who: 'Pistache', text: 'Mon épée est en bois. Comme ça, personne n\'a de bobo.' }]] },
  reglisse: { talk: [[{ who: 'Réglisse', text: 'Chut, je m\'entraîne à être un chevalier très silencieux. Comme un ninja. Mais en armure.' }]] },
  capre: { talk: [[{ who: 'Câpre', text: 'Quand je serai grand, je garderai le pont-levis ! Avec un casque encore plus gros !' }]] },
  croquette: {
    ask: [CRO('Saperlipopette ! Mon panier s\'est renversé et mes croquettes rouges ont roulé dans tout le pré !'), CRO('Vous me les rapportez, mes jolis toutous ? Huit croquettes rouges, vite, avant le dîner ! Le signal doré est près de ma cuisine.'), AIN('Des croquettes ? On a le nez qu\'il faut !')],
    thanks: [CRO('Toutes mes croquettes ! Ce soir, soupe de poisson pour les chats et pâtée royale pour les chiens. Tenez, un petit pourboire !')],
    talk: [[CRO('Un peu de sel, un peu de poivre… et beaucoup de poisson. C\'est le secret de la cuisine du château.')], [CRO('Les souris adorent ma cuisine. Moi, je les laisse goûter : ce sont mes premières clientes !')], [CRO('Si vous cassez mes vieux tonneaux vides, je ne dirai rien. Il y a parfois des paillettes au fond.')]],
  },
  plume: {
    ask: [PLU('Bonjour, les chiens ! Mon potager est envahi : les souris sortent de leurs trous et grignotent mes radis !'), PLU('Faites-les rentrer dans leurs trous : sautez dessus, ou faites la toupie. Huit fois, au signal doré !')],
    thanks: [PLU('Mes radis sont sauvés ! Les souris sont allées grignoter chez la cheffe Croquette, c\'est mieux.')],
    talk: [[PLU('J\'arrose mes buis taillés en forme de chat. C\'est moi qui les ai coupés, avec mes petits ciseaux.')], [PLU('Secouez un buis, pour voir. Des fois, il cache des paillettes.')]],
  },
  pinceau: {
    ask: [PIN('Ah, des modèles ! Je peins le jardin des buis… mais il manque du mouvement !'), PIN('Passez dans tous les anneaux dorés, dans l\'ordre. Les poufs vous feront sauter très haut. Le signal doré est au bord du jardin !')],
    thanks: [PIN('Magnifique ! Quelle grâce ! Je vais vous peindre en train de voler. Ce sera mon chef-d\'œuvre.')],
    talk: [[PIN('Vous avez vu les portraits du château ? Leurs yeux vous suivent. C\'est mon petit secret de peintre.')], [PIN('Du rose, du doré, un peu de bleu… La Capitaine adore les couleurs vives.')]],
  },
  anatole: {
    ask: [ANA('Halte-là ! Qui va là ? … Ah, c\'est vous, les toutous. Bonjour.'), ANA('Une souris me nargue tous les jours : elle court du pont-levis jusqu\'au potager, et je n\'arrive jamais à la battre.'), ANA('Vous, vous êtes rapides ! Arrivez au drapeau à damier avant elle, au signal doré !')],
    thanks: [ANA('Battue ! La souris n\'en revient pas. Elle dit que c\'était de la triche… mais elle rigole.')],
    talk: [[ANA('Je garde le pont-levis. Il ne se passe jamais rien. Sauf quand il se passe quelque chose.')], [ANA('Les gardes du château font leur ronde. Caressez-les, ils adorent ça. Mais chut, ils sont en service.')]],
  },
  ronron: {
    ask: [RON('Silence, silence ! L\'orchestre du château répète pour la grande fête.'), RON('Il me manque un carillonneur. Écoutez la mélodie des cloches, puis refaites-la dans le même ordre !')],
    thanks: [RON('Bravissimo ! Quelle oreille ! Vous jouerez avec nous à la fête de la Capitaine.')],
    talk: [[RON('Un, deux, trois, quatre… Non, Tambourin, pas si fort !')], [RON('La musique, c\'est comme une pelote : il ne faut pas tirer trop fort sur le fil.')]],
  },
  melodie: { talk: [[{ who: 'Mélodie', text: 'Tirelili, tirelilou… Mon luth a des cordes en moustaches de chat. Ça sonne doux, non ?' }], [{ who: 'Mélodie', text: 'Tu veux une chanson ? « Il était un petit chien, qui n\'avait jamais vu de chat… »' }]] },
  tambourin: { talk: [[{ who: 'Tambourin', text: 'Boum, boum, ta-boum ! Pardon, je n\'entends rien, je joue du tambour !' }]] },
  fanfare: { talk: [[{ who: 'Fanfare', text: 'Tûûût ! Quand la Capitaine arrive, je joue la fanfare. Tûûû-tû-tûûût !' }]] },
  pirouette: {
    ask: [PIR('Hop, hop, hop ! Je jongle, je jongle… Oh non ! Un chaton farceur m\'a chipé la clochette de mon bonnet !'), PIR('Il court dans le pré, tout près d\'ici. Attrapez-le, au signal doré ! Mais tout doux, hein, c\'est un bébé.')],
    thanks: [PIR('Ma clochette ! Ding, ding ! Pour vous remercier, je vous apprends un tour : regardez, trois balles, et… oups !')],
    talk: [[PIR('Pourquoi les chats n\'aiment pas l\'eau ? Parce qu\'ils ont peur de se faire « mouiller » le moral ! Hi hi !')], [PIR('Trois balles, c\'est facile. Quatre, c\'est difficile. Cinq… je fais tout tomber.')], [AIN('Il est drôle, lui !'), PIR('Merci, merci ! Je suis là toute la semaine !')]],
  },
  lili: {
    ask: [LIL('Oh là là ! Madame Cane m\'a confié ses canetons pendant qu\'elle nageait… et ils sont partis se promener partout !'), LIL('Touchez chaque caneton pour qu\'il vous suive, et ramenez-les tous dans le rond doré, au bord des douves.')],
    thanks: [LIL('Tous les canetons ! Madame Cane vous dit merci : coin, coin ! Ça veut dire « vous êtes adorables ».')],
    talk: [[LIL('Je lave les nappes du château. Après la fête, il y aura beaucoup de taches de crème !')], [LIL('Les canes nagent dans les douves, les carpes sautent… mais vous, n\'y allez pas : ça mouille !')]],
  },
  lucien: {
    ask: [LUC('Bonsoir, bonsoir… Je suis Lucien, l\'allumeur de braseros. Le soir tombe, et le vent a soufflé mes six braseros autour des douves !'), LUC('Allumez-les tous avant la fin du temps : il suffit de les toucher. Le signal doré est juste là.')],
    thanks: [LUC('Six petites flammes qui dansent ! Le château est tout doré. Merci, les toutous.')],
    talk: [[LUC('Les candélabres du donjon s\'allument aussi d\'une patte. Et il y a une patte dorée qui les allume tous d\'un coup !')], [LUC('Un « Ouaf ! » bien fort, et pfff… un brasero s\'allume. Vous êtes magiques, les chiens.')]],
  },
  ernest: {
    ask: [ERN('Chut… Les grenouilles sautent hors de l\'eau, juste au bord. Moi, je suis trop lent pour les attraper.'), ERN('Attrapez-en cinq au vol, au signal doré ! Et après, on les relâche, promis.')],
    thanks: [ERN('Cinq grenouilles au vol ! Elles ont fait « croâ » de bonheur. Plouf, plouf, toutes retournées dans le lac.')],
    talk: [[ERN('Pêcher, c\'est surtout attendre. Et faire la sieste. Surtout faire la sieste.')], [ERN('Sur l\'île du lac, il y a un kiosque. On dit qu\'un trésor y dort… et pas seulement la plume de la Capitaine.')]],
  },
  minet: {
    talk: [[MIN('Mmmh ? Qui me réveille ? Ah… des chiens. Bonjour, bonjour.'), MIN('Je suis Gros Minet. Je fais la sieste depuis… euh… quel jour on est ?')], [MIN('Les poufs, là, sont parfaits pour rebondir. Moi, je préfère m\'endormir dessus.')], [AIN('Tu dors encore ?'), MIN('Non, non, je réfléchis. Les yeux fermés. Très fort.')]],
  },
  fantomette: {
    talk: [[FAN('Bouh ! … Hi hi, je plaisante. Je suis Fantômette, le fantôme du château. Un tout gentil fantôme !'), FAN('Ça fait cent ans que je hante la plage derrière le donjon. Personne ne vient jamais me voir.'), MAT('Nous, on est venus ! Bonjour, Fantômette !')], [FAN('Le petit coffre, là ? C\'est pour vous. Les fantômes n\'ont pas de poches.')], [FAN('La nuit, je joue à cache-cache avec les chauves-souris. Elles gagnent toujours.')]],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const up = (x, z, h) => ({ x: r1(x), z: r1(z), y: ground(x, z) + (h === undefined ? 1.1 : h) });
const ringAt = (x, z, h, yaw) => ({ x: r1(x), z: r1(z), y: ground(x, z) + h, yaw: yaw || 0 });
// les cloches de l'orchestre, en arc devant le maestro
const BELLS = [0, 1, 2, 3, 4].map(i => { const a = -0.62 + i * 0.31, x = SPOT.orchestre[0] + Math.sin(a) * 7, z = SPOT.orchestre[1] - 4 + Math.cos(a) * 7; return { id: 'cl_' + (i + 1), kind: 'bell', x: r1(x), z: r1(z), rot: a + Math.PI, note: [72, 74, 76, 79, 81][i] }; });
// les poufs du parcours de Pinceau (jardin des buis) et du défi des coussins
const BU = SPOT.buis, CO = SPOT.coussins;
const POUFS_BUIS = [[BU[0] + 3, BU[1] + 3], [BU[0] + 9, BU[1] + 7]].map(([x, z], i) => ({ id: 'pb_' + (i + 1), kind: 'pouf', x: r1(x), z: r1(z), tint: [0xff9ab8, 0x9ac8ff][i] }));
const POUFS_CO = [0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2 + 0.3; return { id: 'po_' + (i + 1), kind: 'pouf', x: r1(CO[0] + Math.cos(a) * 7), z: r1(CO[1] + Math.sin(a) * 6), tint: [0xff9ab8, 0xffd27a, 0x9ac8ff, 0xb8f0a0, 0xd8b0ff, 0xffb890][i] }; });
// les braseros de Lucien, sur la berge ouest et sud des douves
const BRAZ = [[-31.5, 16], [-31.5, 6], [-31.5, -4], [-31.5, -14], [-23, 22.5], [-14, 22.5]].map(([x, z], i) => ({ id: 'br_' + (i + 1), kind: 'brazier', x, z }));
// les armures de la cour (et du donjon)
const ARMOURS = [
  { id: 'ar_1', x: -19.8, z: 9.8, rot: Math.PI * 0.75 }, { id: 'ar_2', x: 19.8, z: 9.8, rot: -Math.PI * 0.75 },
  { id: 'ar_3', x: -4.6, z: -12.2, rot: 0 }, { id: 'ar_4', x: 4.6, z: -12.2, rot: 0 }, { id: 'ar_5', x: -19.8, z: -3.5, rot: Math.PI / 2 },
  { id: 'ar_6', x: 19.6, z: -57.5, rot: -Math.PI / 2 }, { id: 'ar_7', x: -19.6, z: -57.5, rot: Math.PI / 2 },
].map(a => Object.assign(a, { kind: 'armour' }));
// la course de la souris : du pont-levis au potager
const raceMouse = [[13.5, 24], [18, 31], [25, 39], [32, 45], [38, 52]].map(([x, z]) => free(x, z, 0.4));
// les grenouilles sautent au bord du lac (côté sud), à portée de la berge
const FROG_HOLES = [0.9, 1.25, 1.6, 1.95, 2.3].map(a => lakeEdge(a, 0.8).water.map(r1));
const FROG_START = (() => { const e = lakeEdge(1.6, 0.8); return free(e.shore[0] + Math.cos(1.6) * 2.5, e.shore[1] + Math.sin(1.6) * 2.5, 0.8); })();
// le potager de Dame Plume : 6 trous de souris entre les rangs
const PG = SPOT.potager;
const MOUSE_HOLES = [[-3, -2], [0, -2.5], [3, -2], [-3, 2], [0, 2.5], [3, 2]].map(([dx, dz]) => [r1(PG[0] + dx), r1(PG[1] + dz)]);
// les anneaux de la plage du nord (à suivre en courant, les plus hauts sur les poufs)
const POUFS_NORD = [[22, -85], [33, -81]].map(([x, z], i) => ({ id: 'pn_' + (i + 1), kind: 'pouf', x, z, tint: [0xffd27a, 0xb8f0a0][i] }));
const NORD_RINGS = [ringAt(14, -86, 1.5), ringAt(22, -85, 5.2), ringAt(27.5, -83.3, 3.2), ringAt(33, -81, 5.4), ringAt(38, -78.5, 2.4), ringAt(42, -74, 1.5)];
for (let i = 0; i + 1 < NORD_RINGS.length; i++) NORD_RINGS[i].yaw = Math.atan2(NORD_RINGS[i + 1].x - NORD_RINGS[i].x, NORD_RINGS[i + 1].z - NORD_RINGS[i].z);
NORD_RINGS[NORD_RINGS.length - 1].yaw = NORD_RINGS[NORD_RINGS.length - 2].yaw;
// anneaux du jardin des buis
const BUIS_RINGS = [ringAt(BU[0] + 1, BU[1] + 1.5, 1.4), ringAt(BU[0] + 3, BU[1] + 3, 5.4), ringAt(BU[0] + 6, BU[1] + 5, 3.4), ringAt(BU[0] + 9, BU[1] + 7, 5.6), ringAt(BU[0] + 12, BU[1] + 10, 3.0), ringAt(BU[0] + 14, BU[1] + 14, 1.4)];
for (let i = 0; i + 1 < BUIS_RINGS.length; i++) BUIS_RINGS[i].yaw = Math.atan2(BUIS_RINGS[i + 1].x - BUIS_RINGS[i].x, BUIS_RINGS[i + 1].z - BUIS_RINGS[i].z);
BUIS_RINGS[5].yaw = BUIS_RINGS[4].yaw;
// les coquillages rouges de la plage du sud-ouest (sur le sable, le long de la mer)
const SHELLS = [];
for (let i = 0; SHELLS.length < 8 && i < 60; i++) {
  const a = (100 + i * 4.5) * Math.PI / 180, r = 74 + (i % 3) * 3;
  const x = Math.cos(a) * r, z = -4 + Math.sin(a) * r;
  if (!walkable(x, z) || h0(x, z) < 0.45 || SHELLS.some(p => Math.hypot(p.x - x, p.z - z) < 7)) continue;
  SHELLS.push(up(x, z));
}
const PLAGE = free(SHELLS[3].x + 2, SHELLS[3].z - 4, 1);
// les croquettes rouges du pré (au sud, entre les arbres)
const PRE = [];
for (let i = 0; PRE.length < 8 && i < 300; i++) {
  const a = i * 2.39996, r = 8 + (i % 6) * 3.4;
  const x = -22 + Math.cos(a) * r, z = 58 + Math.sin(a) * r * 0.8;
  if (!walkable(x, z) || treeAt(x, z, 1.4) || Math.hypot(x - S.npcs.mamie.x, z - S.npcs.mamie.z) < 4 || PRE.some(p => Math.hypot(p.x - x, p.z - z) < 6)) continue;
  PRE.push(up(x, z));
}
const D = (o) => { const [x, z] = o.exact ? [o.x, o.z] : free(o.x, o.z, 1.2); return Object.assign(o, { x, z }); };
export const DEFIS = [
  D({ id: 'd_pre', type: 'coins', name: 'Les croquettes rouges du pré', hint: 'Attrapez les 8 croquettes rouges de la cheffe Croquette !', x: SPOT.cuisine[0] + 3, z: SPOT.cuisine[1] + 5, time: 75, items: PRE, leave: 110 }),
  D({ id: 'd_plage', type: 'coins', name: 'Les coquillages rouges', hint: 'Sur la plage, 8 coquillages rouges brillent au soleil', x: PLAGE[0], z: PLAGE[1], time: 60, items: SHELLS, exact: true }),
  D({ id: 'd_buis', type: 'rings', name: 'Les anneaux du jardin des buis', hint: 'Passez dans les anneaux dorés, dans l\'ordre : les poufs font rebondir !', x: BU[0] - 2, z: BU[1] - 1, time: 40, rings: BUIS_RINGS }),
  D({ id: 'd_nord', type: 'rings', name: 'Le vol des pigeons', hint: 'Derrière le donjon, suivez les anneaux sur la plage : rebondissez sur les poufs !', x: 10, z: -85, time: 35, rings: NORD_RINGS }),
  D({ id: 'd_souris', type: 'race', name: 'La course de la souris', hint: 'La souris file vers le drapeau à damier, au potager : arrivez avant elle !', x: raceMouse[0][0] - 1.5, z: raceMouse[0][1] - 1.8, critter: 'mouse', speed: 7.6, path: raceMouse }),
  D({ id: 'd_chaton', type: 'chase', name: 'Le chaton farceur', hint: 'Il a la clochette de Pirouette : attrapez-le !', x: SPOT.orchestre[0] - 8, z: SPOT.orchestre[1] + 16, critter: 'kitten', time: 45, leash: 15, speed: 7.0 }),
  D({ id: 'd_potager', type: 'whack', name: 'Les souris du potager', hint: 'Les souris sortent de leurs trous : sautez dessus, ou faites la toupie !', x: PG[0] + 5.5, z: PG[1] + 1, critter: 'mouse', time: 35, need: 8, holes: MOUSE_HOLES }),
  D({ id: 'd_grenouilles', type: 'fish', name: 'Les grenouilles sauteuses', hint: 'Les grenouilles sautent hors de l\'eau : attrapez-en 5 au vol !', x: FROG_START[0], z: FROG_START[1], critter: 'frog', time: 50, need: 5, holes: FROG_HOLES, exact: true }),
  D({ id: 'd_ecuyers', type: 'tag', name: 'Les écuyers farceurs', hint: 'Chat perché : touchez Pistache, Réglisse et Câpre !', x: SPOT.ecuyers[0] - 2, z: SPOT.ecuyers[1] - 6, time: 40, leash: 14, speed: 6.0, kids: ['pistache', 'reglisse', 'capre'] }),
  D({ id: 'd_orchestre', type: 'xylo', name: 'Les cloches de l\'orchestre', hint: 'Écoutez, puis faites sonner les cloches dans le même ordre', x: SPOT.orchestre[0] + 6, z: SPOT.orchestre[1] - 6, chimes: BELLS.map(b => b.id), seq: [0, 2, 4, 3, 1], time: 90 }),
  D({ id: 'd_canetons', type: 'herd', name: 'Les canetons de Madame Cane', hint: 'Touchez les canetons perdus et ramenez-les dans le rond doré', x: SPOT.canetons[0] + 3, z: SPOT.canetons[1] + 3, critter: 'duckling', time: 110, pen: { x: SPOT.canetons[0], z: SPOT.canetons[1], r: 3.4 },
    chicks: [free(48, 30, 0.5), free(58, 12, 0.5), free(20, 44, 0.5), free(62, 30, 0.5)] }),
  D({ id: 'd_coussins', type: 'pads', name: 'Les poufs rebondissants', hint: 'Rebondissez sur les 6 poufs qui brillent !', x: CO[0] + 1, z: CO[1] - 0.5, time: 35, pads: POUFS_CO.map(p => p.id) }),
  D({ id: 'd_braseros', type: 'hits', name: 'Les braseros des douves', hint: 'Allumez les 6 braseros autour des douves : touchez-les !', x: -34, z: 15, time: 50, props: BRAZ.map(b => b.id) }),
  D({ id: 'd_armures', type: 'hits', name: 'Les armures qui font clong', hint: 'Faites sonner les 5 armures de la cour : foncez dedans !', x: -12, z: 9.5, time: 40, props: ['ar_1', 'ar_2', 'ar_3', 'ar_4', 'ar_5'], exact: true }),
];
for (const d of DEFIS) d.y = ground(d.x, d.z);

// ---------------------------------------------------------------------------
// Objets posés à la main
// ---------------------------------------------------------------------------
// portraits accrochés aux murs (le tableau regarde vers +z, on le tourne vers la salle)
const PORTRAITS = [
  [-21.08, 2.5, Math.PI / 2, 0xffe0c0], [-21.08, 8.6, Math.PI / 2, 0xd8e8ff], [21.08, 6.5, -Math.PI / 2, 0xffd0e0],
  [-17.5, -14.92, Math.PI, 0xe0ffd8], [12.2, -14.92, Math.PI, 0xffe8b0], [-15, -33.08, 0, 0xd8d8ff], [15, -33.08, 0, 0xffd8c8],
  [21.08, -63.5, -Math.PI / 2, 0xffe0c0], [-21.08, -58.5, Math.PI / 2, 0xe8d8ff],
].map(([x, z, rot, tint], i) => ({ id: 'pt_' + (i + 1), kind: 'portrait', x, z, rot, tint, wall: true }));
const KITCHEN = [[-4, -3, 'barrel'], [-5, 1, 'barrel'], [-6.5, -1, 'caisse'], [3.5, -4, 'urn'], [4.5, -2.4, 'urn'], [-2, 5, 'caisse'], [3.5, 4.5, 'barrel'], [-6, 5, 'hay']]
  .map(([dx, dz, kind], i) => ({ id: 'k_' + (i + 1), kind, x: r1(SPOT.cuisine[0] + dx), z: r1(SPOT.cuisine[1] + dz), rot: i * 0.8 }));
const PROPS = [
  ...BELLS, ...POUFS_BUIS, ...POUFS_CO, ...POUFS_NORD, ...BRAZ, ...ARMOURS, ...PORTRAITS, ...KITCHEN,
  // mannequins d'entraînement des écuyers
  ...[[-6, -3], [6, -2], [-5, 6], [5, 7]].map(([dx, dz], i) => ({ id: 'mq_' + (i + 1), kind: 'dummy', x: r1(SPOT.ecuyers[0] + dx), z: r1(SPOT.ecuyers[1] + dz), rot: Math.atan2(-dx, -dz) })),
  // le jardin des buis : des chats taillés en rond
  ...[0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2 + 2.2; return { id: 'bu_' + (i + 1), kind: 'topiary', x: r1(BU[0] + 6 + Math.cos(a) * 9), z: r1(BU[1] + 6 + Math.sin(a) * 9), rot: a + Math.PI }; }),
  // le potager : bottes de paille
  { id: 'pg_h1', kind: 'hay', x: r1(PG[0] + 6.5), z: r1(PG[1] - 4), rot: 0.3 }, { id: 'pg_h2', kind: 'hay', x: r1(PG[0] - 7), z: r1(PG[1] + 3), rot: 1.4 },
  // l'intérieur : pelotes à pousser (jardin, terrasse), candélabres du donjon et leur patte dorée
  { id: 'yb_1', kind: 'yarnball', x: -10.5, z: -38.2, tint: 0xff8ab0 }, { id: 'yb_2', kind: 'yarnball', x: 13, z: -45.5, tint: 0x8ad0ff }, { id: 'yb_3', kind: 'yarnball', x: -17.5, z: -62, tint: 0xffd27a },
  ...[[-17.8, -60.5], [-17.8, -65.5], [17.8, -60.5], [17.8, -65.5], [-10.5, -69.6], [10.5, -69.6]].map(([x, z], i) => ({ id: 'ca_' + (i + 1), kind: 'candelabra', x, z, group: 'donjon' })),
  { id: 'b_donjon', kind: 'pawbutton', x: 18, z: -70, effect: 'lights', group: 'donjon' },
  // la bibliothèque du donjon (à l'ouest) : derrière, un coffre
  { id: 'bib', kind: 'bookcase', x: -20.05, z: -64.5, rot: Math.PI / 2, slide: [0, 2.9] },
  // quelques poufs et jarres dans la cour et le jardin
  { id: 'c_po1', kind: 'pouf', x: 15.5, z: -38.5, tint: 0xd8b0ff }, { id: 'c_u1', kind: 'urn', x: -19.8, z: 5.6 }, { id: 'c_u2', kind: 'urn', x: 19.8, z: 5.2 },
  { id: 'c_b1', kind: 'barrel', x: 13.6, z: 10, rot: 0.4 }, { id: 'c_b2', kind: 'caisse', x: -13.6, z: 10.2, rot: 0.2 },
];
for (const p of PROPS) p.y = ground(p.x, p.z);

// Bêtes posées à la main
const TW = (i, a) => { const T = S.TOWERS[i], r = T.r + 0.1; return { x: r1(T.x + Math.cos(a) * r), z: r1(T.z + Math.sin(a) * r), perch: T.h + 0.8 }; };
const FAUNA = [
  // gardes en ronde
  { id: 'garde_cour1', kind: 'guard', x: -13, z: 8.5, route: [[-13, 8.5], [8, 9.5], [11, 2], [11, -3], [-2, -9.5], [-12.5, -4]] },
  { id: 'garde_cour2', kind: 'guard', x: 8, z: -9, route: [[8, -9], [-3, -9.8], [-13, -4], [-13, 8.5], [8, 9.5], [11, -3]] },
  { id: 'garde_pont', kind: 'guard', x: -14, z: 22.2, route: [[-14, 22.2], [-7, 21.5], [7, 21.5], [14, 22.2], [26, 23]] },
  { id: 'garde_donjon', kind: 'guard', x: 17.5, z: -58.5, route: [[17.5, -58.5], [17.5, -66], [16, -70.2]] },
  { id: 'garde_jardin', kind: 'guard', x: -14, z: -46, route: [[-14, -46], [-14, -38], [-9, -37.5], [9, -37.5], [14, -40], [14, -46.5]] },
  // chatons du château
  { id: 'chaton_cour', kind: 'kitten', x: -3, z: 3 }, { id: 'chaton_jardin', kind: 'kitten', x: 10, z: -42 }, { id: 'chaton_cuisine', kind: 'kitten', x: SPOT.cuisine[0] + 2, z: SPOT.cuisine[1] - 4 },
  // chauves-souris : sur les créneaux des tours et en haut des griffoirs
  { id: 'cs_t1', kind: 'bat', ...TW(0, Math.PI * 0.75) }, { id: 'cs_t2', kind: 'bat', ...TW(1, Math.PI * 0.25) }, { id: 'cs_t3', kind: 'bat', ...TW(6, -Math.PI * 0.7) }, { id: 'cs_t4', kind: 'bat', ...TW(7, -Math.PI * 0.3) },
  { id: 'cs_t5', kind: 'bat', ...TW(4, Math.PI) }, { id: 'cs_t6', kind: 'bat', ...TW(5, 0) },
  ...S.POSTS.map((p, i) => ({ id: 'cs_p' + i, kind: 'bat', x: p.x, z: p.z, perch: p.y + p.h + 0.35 })).filter((_, i) => i !== 2),
  // canes et canetons dans les douves, carpes qui sautent
  { id: 'cane_s', kind: 'duck', x: -12, z: 15.9 }, { id: 'cane_e', kind: 'duck', x: 25.8, z: -20 }, { id: 'cane_o', kind: 'duck', x: -25.8, z: -48 }, { id: 'cane_n', kind: 'duck', x: 6, z: -75.8 },
  { id: 'cane_lac', kind: 'duck', x: S.LAKE.x - 6, z: S.LAKE.z + 6 },
  ...[[25.8, 4], [25.8, -36], [25.8, -62], [-25.8, 6], [-25.8, -22], [-25.8, -64], [-18, -75.8], [16, -75.8], [16, 15.9], [-24, 15.9]].map(([x, z], i) => ({ id: 'carpe_' + i, kind: 'carp', x, z })),
  ...[[S.LAKE.x - 4, S.LAKE.z - 7], [S.LAKE.x + 7, S.LAKE.z - 4], [S.LAKE.x - 8, S.LAKE.z + 2]].map(([x, z], i) => ({ id: 'carpe_lac' + i, kind: 'carp', x, z })),
  // quelques souris dans la cuisine, des pigeons sur la terrasse
  { id: 'souris_cuisine', kind: 'mouse', x: SPOT.cuisine[0] - 3, z: SPOT.cuisine[1] + 2.5 }, { id: 'souris_cour', kind: 'mouse', x: 12, z: 6 },
  { id: 'pig_terrasse', kind: 'pigeon', x: -17.5, z: -59 }, { id: 'pig_cour', kind: 'pigeon', x: -2, z: -6 },
  // grenouilles au bord du lac et des douves, écureuils au pied des arbres en fleurs
  ...[2.6, 3.3, 4.0, 4.8, 5.6, 0.1].map((a, i) => { const e = lakeEdge(a, 0); const [x, z] = free(e.shore[0], e.shore[1], 0.3); return { id: 'gren_' + i, kind: 'frog', x, z }; }),
  ...[[31, -40], [-31.5, -58], [31.5, 10]].map(([x, z], i) => ({ id: 'gren_d' + i, kind: 'frog', x, z })),
  ...[0, 5, 11, 17, 23, 29].map(i => S.trees[i]).filter(Boolean).map((t, i) => { const [x, z] = free(t.x + 1.6, t.z + 0.8, 0.3); return { id: 'ecur_' + i, kind: 'squirrel', x, z }; }),
  { id: 'pap_jardin', kind: 'butterfly', x: -9, z: -44 }, { id: 'pap_lab', kind: 'butterfly', x: 50, z: -18 }, { id: 'pap_lab2', kind: 'butterfly', x: 57, z: -30 },
];

// Cachettes (coffres)
const ISLE = { x: S.LAKE.x + Math.cos(0.52) * 2.7, z: S.LAKE.z + Math.sin(0.52) * 2.7 };
const SECRETS = [
  { id: 's_biblio', x: -20.62, z: -64.5, rot: Math.PI / 2, behind: 'bib', found: 'Derrière la bibliothèque du donjon ! Un vrai passage secret.' },
  { id: 's_ile', x: r1(ISLE.x), z: r1(ISLE.z), rot: -2.6, found: 'Sur l\'île du lac, au pied du kiosque : de feuille en feuille, ça valait le coup !' },
  { id: 's_fantome', x: SPOT.fantome[0] - 3, z: SPOT.fantome[1] - 1.5, rot: 0.3, found: 'Le coffre de Fantômette ! Les fantômes n\'ont pas de poches.' },
  { id: 's_rempart', x: 20.2, z: -12.3, rot: Math.PI, found: 'Tout au bout des remparts, là où seuls les chats grimpent !' },
  { id: 's_dune', x: 0, z: 0, rot: -0.8, found: 'Caché dans les dunes du sud-est, face à la mer !' },
  { id: 's_cuisine', x: SPOT.cuisine[0] - 8, z: SPOT.cuisine[1] - 1, rot: 1.3, found: 'Derrière les tonneaux de la cheffe Croquette !' },
];
{
  // la dune : au bord de la plage, au sud-est
  const a = 52 * Math.PI / 180; let r = 72; while (r < 86 && h0(Math.cos(a) * r, -4 + Math.sin(a) * r) > 0.6) r += 0.5;
  const s = SECRETS.find(q => q.id === 's_dune'); [s.x, s.z] = free(Math.cos(a) * (r - 2.5), -4 + Math.sin(a) * (r - 2.5), 1);
}
for (const s of SECRETS) s.y = s.id === 's_rempart' ? S.LEDGE.top : s.id === 's_biblio' ? TOPY : ground(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des poufs…)
const line = (a, b, n, h, y0) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x: r1(x), z: r1(z), y: (y0 === undefined ? ground(x, z) : y0) + (h || 1.0) }; });
const arc = (a, b, n, top) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x: r1(x), z: r1(z), y: Math.max(ground(x, z) + 1, ground(a[0], a[1]) + 1 + Math.sin(k * Math.PI) * top) }; });
const sec = (id) => SECRETS.find(s => s.id === id);
const sF = sec('s_fantome'), sD = sec('s_dune'), sC = sec('s_cuisine'), sI = sec('s_ile');
const TRAILS = [
  { id: 't_biblio', pts: line([-18, -55.5], [-18.6, -63], 6, 1.0, TOPY), say: 'Des paillettes… vers la bibliothèque ?' },
  { id: 't_ile', pts: [0.2, 0.9, 1.6, 2.3, 3.0, 3.7].map(a => ({ x: r1(S.LAKE.x + Math.cos(a) * 2.9), z: r1(S.LAKE.z + Math.sin(a) * 2.9), y: ground(S.LAKE.x + Math.cos(a) * 2.9, S.LAKE.z + Math.sin(a) * 2.9) + 1 })) },
  { id: 't_fantome', pts: line([sF.x + 14, sF.z + 3], [sF.x + 2, sF.z + 0.5], 7), say: 'Brrr… un petit courant d\'air frais…' },
  { id: 't_rempart', pts: line([16.8, -4.5], [19.6, -11], 5, 1.0, S.LEDGE.top) },
  { id: 't_dune', pts: line([sD.x - Math.cos(0.9) * 12, sD.z - Math.sin(0.9) * 12], [sD.x - Math.cos(0.9) * 2, sD.z - Math.sin(0.9) * 2], 6) },
  { id: 't_cuisine', pts: line([sC.x + 6, sC.z + 7], [sC.x + 1.5, sC.z + 1.5], 5) },
  { id: 't_saut', pts: arc([POUFS_CO[0].x, POUFS_CO[0].z], [POUFS_CO[1].x, POUFS_CO[1].z], 6, 4.5), say: 'Joli saut !' },
  { id: 't_douves', pts: line([31, -24], [31, -6], 7), say: 'Les canes vous saluent !' },
  { id: 't_buis', pts: arc([POUFS_BUIS[0].x, POUFS_BUIS[0].z], [POUFS_BUIS[1].x, POUFS_BUIS[1].z], 6, 5) },
  { id: 't_pre', pts: arc([-14, 70], [14, 72], 8, 1.4) },
  { id: 't_nord', pts: line([-6, -82], [-26, -84], 7) },
];
void sI;

// ---------------------------------------------------------------------------
// Palette : bêtes et objets du château
// ---------------------------------------------------------------------------
export const PALETTE = {
  fauna: {
    kitten: { model: 'cat', ai: 'wander', pet: true, shy: false, hopper: false, speed: 1.3, run: 5, home: 6, sound: 'meow', say: ['Miaou !', 'Mrrrou ?', 'Prrr…'], follow: 15, scale: 0.72, colors: { collar: 0xd83a4a }, tints: [0xf0a050, 0xffffff, 0xb8b4b8, 0xf4e0c0, 0x8a6a4a, 0x4a4446], extra: 2 },
    guard: { model: 'cat', ai: 'patrol', pet: true, shy: false, hopper: false, speed: 1.5, run: 4, home: 40, sound: 'meow', say: ['Halte-là ! … Oh, un toutou. Miaou !', 'Rien à signaler !', 'Ronde terminée… ou presque !'], follow: 8, scale: 1.0, colors: { helmet: 0xc8ccd4, plume: 0xd83a3a, collar: 0x3a5ad8 }, tints: [0xffffff, 0xf4e0c0, 0xe0d8d0] },
    mouse: { model: 'mouse', ai: 'wander', hopper: false, flee: 5, run: 6.5, speed: 1.2, home: 5, sound: 'squeak', say: ['Couic !', 'Hiii !'], scale: 1.4, group: 2 },
    pigeon: { model: 'bird', ai: 'flock', group: 5, scale: 1.9, flee: 5, sound: 'flutter', colors: { back: 0x9098a8, breast: 0xc0a8c8, cap: 0x6a7a90 } },
    bat: { model: 'bat', ai: 'perch', sound: 'squeak', scale: 1.4 },
    rabbit: { model: 'hare', ai: 'wander', group: 2, scale: 1.2, tints: [0xc8a080, 0xe8d8c8, 0x8a6a50], hopper: true, flee: 6, run: 8, speed: 1.4, home: 8, sound: 'squeak', say: ['Hop !'] },
    squirrel: { model: 'squirrel', ai: 'wander', scale: 1.5, hopper: true, flee: 5, run: 7, speed: 2, home: 6, sound: 'squeak', say: ['Tchik !'] },
    butterfly: { model: 'butterfly', ai: 'hover', group: 3, glow: false, scale: 2.4, colors: { wing: 0xff9ad0, spots: 0x8a2a5a } },
    frog: { model: 'frog', ai: 'hop', home: 3.5, flee: 3, sound: 'croak', scale: 1.25, extra: 4 },
    carp: { model: 'fish', ai: 'jump', water: true, colors: { fur: 0xffa040 }, scale: 1.4 },
    // Madame Cane et ses canetons, en file indienne sur les douves (life.js : swim, line, young)
    duck: { model: 'duck', ai: 'swim', water: true, group: 4, line: true, gap: 0.75, young: 'duckling', home: 7, flee: 4, sound: 'quack', colors: { body: 0xf4f2ec, head: 0xf4f2ec, breast: 0xffffff, wing: 0xe8e4dc, bill: 0xf0a020 }, scale: 1.1 },
    duckling: { model: 'duckling', ai: 'none', sound: 'peep', colors: { fur: 0xffe060 }, scale: 1.25, extra: 6 },
  },
  props: {
    pouf: { act: 'bounce', power: 16, r: 1.25, tint: true },
    topiary: { act: 'shake', drop: 2, solid: 0.7, burst: 0x8ac860 },
    barrel: { act: 'break', drop: 2, chance: 0.6, respawn: 45, color: 0xc89a6a },
    caisse: { act: 'break', drop: 2, chance: 0.6, respawn: 45, color: 0xd8b080 },
    urn: { act: 'break', drop: 2, chance: 0.7, respawn: 45, color: 0xd88a5a },
    hay: { act: 'break', drop: 1, chance: 0.5, respawn: 40, color: 0xf0d890 },
    armour: { act: 'hat', topper: 'knight', topperTex: 'metal', topperY: 1.93, solid: 0.45, drop: 1, sound: 'clank', burst: 0xe8ecf4 },
    bell: { act: 'chime', glow: 0xffe090, glowY: 1.8, solid: 0.35 },
    brazier: { act: 'light', lamp: { y: 1.55, color: 0xff9a30, size: 3.2, fire: true }, burn: 150, solid: 0.4, r: 0.6 },
    candelabra: { act: 'light', lamp: { y: 2.12, color: 0xffc060, size: 2.4 }, burn: 240, solid: 0.3, r: 0.5 },
    portrait: { act: 'shake', tint: true, drop: 1, sound: 'meowHi', eyes: { x: 0.14, y: 2.42, z: 0.045, r: 0.045, range: 0.028 }, wall: true },
    bookcase: { act: 'slide', box: [2.4, 0.62], open: 30, sound: 'crate', say: 'Un passage secret derrière la bibliothèque !' },
    yarnball: { act: 'push', grow: false, r0: 0.6, tint: true },
    dummy: { act: 'shake', solid: 0.35, drop: 1, sound: 'bump', burst: 0xf0d890 },
    pawbutton: { act: 'press', r: 0.7 },
    hole: { colors: { dark: 0x2e2a24, rim: 0xe8e0c8 } },
    chest: { tex: 'wood' },
    lid: { tex: 'wood' },
  },
};

// ---------------------------------------------------------------------------
// Où rien ne doit être posé (énigmes, chemins de quête, personnages, arènes…)
// ---------------------------------------------------------------------------
const B1 = S.BALLS.find(b => b.zone === 'out'), B2 = S.BALLS.find(b => b.zone === 'court');
const KEEP = [
  [S.START.x, S.START.z, 5], [S.npcs.mamie.x, S.npcs.mamie.z, 5], [S.npcs.puppy.x, S.npcs.puppy.z, 3],
  ...S.CHECKPOINTS.map(c => [c.x, c.z, 4]), ...S.signs.map(s => [s.x, s.z, 2.5]), ...S.PLATES.map(p => [p.x, p.z, 3.5]), ...S.BALLS.map(b => [b.x, b.z, 3]),
  ...S.crates.map(c => [c.x, c.z, 2.5]), ...S.cats.map(c => [c.x, c.z, 2.5]), ...S.POMPON.map(p => [p.x, p.z, 2.5]), ...S.SOUVENIRS.map(v => [v.x, v.z, 3]), ...S.medals.map(m => [m.x, m.z, 3]),
  [S.LASER_BUTTON.x, S.LASER_BUTTON.z, 3], [S.WALL_SWITCH.x, S.WALL_SWITCH.z, 2.5], [S.PROJECTOR.x, S.PROJECTOR.z, 2.5], [S.FOUNTAIN.x, S.FOUNTAIN.z, S.FOUNTAIN.r + 1.5],
  ...S.YARNS.map(y => [y.x, y.z, y.r + 1.2]), ...S.CUSHIONS.map(c => [c.x, c.z, c.r + 1]), ...S.POSTS.map(p => [p.x, p.z, 1.6]), [S.TREE.x, S.TREE.z, 7.5],
  ...[[-17.5, -55], [17.5, -55], [-17.5, -68], [17.5, -68]].map(([x, z]) => [x, z, 2]), [S.SLOT.x, S.SLOT.z, 2.5],
  ...[[-19.5, -37.5, 1.2], [19.5, -37.5, 1.1], [-19.6, -49.4, 1.3], [19.6, -49.6, 1.2], [-8, -50, 0.9], [8, -50.2, 1.0]].map(([x, z, r]) => [x, z, r + 1]),
  ...DEFIS.map(d => [d.x, d.z, 3.5]), ...VILLAGERS.map(v => [v.x, v.z, v.moves ? 0 : 2.5]), ...SECRETS.map(s => [s.x, s.z, 3]),
];
const HIDE = { x0: S.HIDEOUT.x0 - 1, x1: S.HIDEOUT.x1 + 1.5, z0: S.HIDEOUT.z0 - 1, z1: S.HIDEOUT.z1 + 1.5 };
const THRONE_AREA = { x0: -14.5, x1: 14.5, z0: -72, z1: -53.6 };
const nearWall = (x, z, r) => [0, 1, 2, 3, 4, 5, 6, 7].some(k => { const a = k * 0.785; return S.blockedAt(x + Math.cos(a) * r, z + Math.sin(a) * r) || h0(x + Math.cos(a) * r, z + Math.sin(a) * r) < 0.3; });
const onBone = (x, z, r) => S.bones.some(b => Math.abs(b.x - x) < r && Math.abs(b.z - z) < r);
export function avoid(x, z, type, kind) {
  if (KEEP.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r)) return true;
  if (inRect(HIDE, x, z)) return true;                                   // la cachette de la boîte à musique
  if (inRect(S.HALL, x, z, 0.5)) return true;                              // la salle du point rouge (les chats y courent)
  if (inRect(THRONE_AREA, x, z)) return true;                              // le jeu de chat et la fête
  if (inRect(S.MAZE_RECT, x, z, 2.5) && !(type === 'fauna' && kind === 'butterfly')) return true;   // le labyrinthe reste un labyrinthe
  if (Math.hypot(x - S.LAKE.x, z - S.LAKE.z) < S.LAKE.isle + 1.5) return true;   // l'île de la plume
  if (type === 'props' || type === 'villagers') {
    if (Math.abs(x) < 4.5 && z > 13) return true;                          // le chemin et le pont-levis
    if (segD(x, z, B1.x, B1.z, S.PLATES[0].x, S.PLATES[0].z) < 3.5 || segD(x, z, B1.x, B1.z, S.PLATES[1].x, S.PLATES[1].z) < 3.5) return true;
    if (segD(x, z, B2.x, B2.z, S.SLOT.x, S.SLOT.z) < 3.5) return true;    // la pelote bleue de la cour
    if (inRect(S.LEDGE, x, z, 1.5)) return true;
    if (Math.abs(x - S.PLANK.x) < 3 && z < S.PLANK.z0 + 1 && z > S.PLANK.z1 - 1) return true;
    if (treeAt(x, z, 1.4) || nearWall(x, z, 1.3) || onBone(x, z, 1.4)) return true;
  }
  return false;
}

/** Le « milieu » d'un point : dans le château, en bord d'eau, à la plage, sous les arbres… */
function info(x, z) {
  const castle = S.inCastle(x, z), e = lakeE(x, z);
  const shore = (e > 0.9 && e < 2.2) || (!castle && S._rectDist(S.MOAT, x, z) < 3.5);
  return { castle, shore, beach: islandR(x, z) > 0.84, forest: TG.within(x, z, 9).length, terrace: castle && z < S.KEEP_Z, meadow: !castle && islandR(x, z) <= 0.84 };
}

// ce que le château fait déjà vivre (personnages, chats, énigmes) : compté pour la densité, pas redessiné
const ANCHORS = [
  { x: S.npcs.mamie.x, z: S.npcs.mamie.z, kind: 'mamie' }, { x: S.npcs.puppy.x, z: S.npcs.puppy.z, kind: 'biscotte' },
  ...S.cats.map(c => ({ x: c.x, z: c.z, kind: 'chat' })), ...S.NAP.map(n => ({ x: n.x, z: n.z, kind: 'cousin' })), ...S.POMPON.map(p => ({ x: p.x, z: p.z, kind: 'pompon' })),
  { x: S.CAPTAIN.x, z: S.CAPTAIN.z, kind: 'capitaine' }, ...S.crates.map(c => ({ x: c.x, z: c.z, kind: 'caisse' })), ...S.BALLS.map(b => ({ x: b.x, z: b.z, kind: 'pelote' })),
  ...S.PLATES.map(p => ({ x: p.x, z: p.z, kind: 'patte' })), { x: S.LASER_BUTTON.x, z: S.LASER_BUTTON.z, kind: 'patte rouge' }, ...S.signs.map(s => ({ x: s.x, z: s.z, kind: 'panneau' })),
  { x: S.dotAt(0).x, z: -23.5, kind: 'point rouge' },
];

export const SPEC = {
  seed: 8008, extent: 92, spacing: 14, cover: 10, grid: 3,
  walkable, ground, info, avoid, anchors: ANCHORS,
  highlights: { fauna: FAUNA, props: PROPS, villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    { type: 'fauna', kind: 'kitten', w: 2.2, min: 16, when: (x, z, i) => !i.beach },
    { type: 'fauna', kind: 'pigeon', w: 1.8, min: 22, when: (x, z, i) => !i.shore },
    { type: 'fauna', kind: 'mouse', w: 1.4, min: 14, when: (x, z, i) => i.castle || i.meadow },
    { type: 'fauna', kind: 'rabbit', w: 2.4, min: 14, when: (x, z, i) => i.meadow && !i.shore },
    { type: 'fauna', kind: 'squirrel', w: 2.0, min: 14, when: (x, z, i) => i.forest >= 1 },
    { type: 'fauna', kind: 'butterfly', w: 1.3, min: 18, when: (x, z, i) => !i.beach },
    { type: 'fauna', kind: 'frog', w: 4, min: 9, when: (x, z, i) => i.shore },
    { type: 'props', kind: 'topiary', w: 1.2, min: 18, when: (x, z, i) => i.meadow },
    { type: 'props', kind: 'hay', w: 1.2, min: 16, when: (x, z, i) => i.meadow && !i.shore },
    { type: 'props', kind: 'barrel', w: 1.0, min: 14, when: (x, z, i) => !i.shore },
    { type: 'props', kind: 'urn', w: 1.0, min: 14, when: (x, z, i) => i.castle || i.meadow },
    { type: 'props', kind: 'caisse', w: 0.8, min: 14, when: (x, z, i) => !i.beach },
    { type: 'props', kind: 'pouf', w: 0.9, min: 22, when: (x, z, i) => !i.shore, data: { tint: 0xff9ab8 } },
    { type: 'props', kind: 'yarnball', w: 0.6, min: 26, when: (x, z, i) => !i.beach && !i.shore, data: { tint: 0xff8ab0 } },
    { type: 'props', kind: 'dummy', w: 0.4, min: 30, when: (x, z, i) => i.meadow },
    { type: 'fauna', kind: 'butterfly', w: 0.5 },
  ],
  /** Couleurs variées (poufs, pelotes) ; les crabes… euh, les pigeons de la plage restent des pigeons. */
  place(e) {
    const k = Math.floor(e.rot * 10) % 6;
    if (e.kind === 'pouf') e.tint = [0xff9ab8, 0xffd27a, 0x9ac8ff, 0xb8f0a0, 0xd8b0ff, 0xffb890][k];
    if (e.kind === 'yarnball') e.tint = [0xff8ab0, 0x8ad0ff, 0xffd27a, 0xa8e08a, 0xc8a0ff, 0xff9a70][k];
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 92 }, opts || {}));
export { FROG_HOLES, MOUSE_HOLES, BELLS };
