/*
 * Matcha & Ainu — Niveau 6 « La Plage aux Coquillages » : la couche de vie (données pures).
 *
 * Bêtes (crabes qui filent de côté dans leur trou, bernard-l'ermite, étoiles de mer, mouettes,
 * lapins des dunes, papillons, tortues et bébés tortues, phoques qui bronzent, dauphins qui sautent
 * au large, méduses, poissons des flaques, chiots des familles), objets (châteaux de sable à bâtir
 * ou à faire tomber, ballons de plage, parasols et matelas qui font rebondir, oyats et fleurs à
 * secouer, tonneaux et tas d'algues à casser, carillons de coquillages, cerfs-volants, seaux…),
 * 14 défis éclair, des traînées de paillettes, 16 habitants occupés et 7 cachettes.
 *
 * Le plan est calculé ici (lifeplan.js, graine fixe : identique chez tous les joueurs) ;
 * beachplay.js le donne à life.js qui le fait vivre. Les tests (Node) l'importent aussi.
 */
import * as S from './level6.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const g = (x, z) => S.heightAt(x, z);
const slope = (x, z) => Math.hypot(g(x + 0.5, z) - g(x - 0.5, z), g(x, z + 0.5) - g(x, z - 0.5));
const PG = new PointGrid(10);
for (const p of S.palms) PG.add(p);
const palmAt = (x, z, m) => PG.within(x, z, 3).some(p => Math.hypot(p.x - x, p.z - z) < 0.42 + (m || 0.3));
const GROUND_KINDS = new Set(['deck', 'cap', 'stone', 'lamp']);
/** Un obstacle posé au sol (maison, rocher, tour du fort, coque de l'épave…) à cet endroit. */
function solidHere(x, z, m) {
  const h = g(x, z);
  return S.near(x, z, (m || 0) + 0.5).some(c => !c.off && !c.life && S.inside(c, x, z, m || 0) && c.y0 < h + 1.6 && c.y1 > h + 0.25 && !(GROUND_KINDS.has(c.kind) && c.y0 > h + 1));
}

/** Un point où l'on peut marcher : sur le sable, les rochers, l'herbe (pas dans la mer ni dans un mur). */
export function walkable(x, z) {
  if (Math.abs(x) > 186 || z > 170 || z < -150) return false;
  if (g(x, z) < 0.05) return false;
  if (S.blockedAt(x, z) || solidHere(x, z, 0.3) || palmAt(x, z)) return false;
  return slope(x, z) < 1.6;
}

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
const VIL = S.VILLAGE;
export const VILLAGERS = [
  { id: 'sacha', name: 'Sacha', body: 'dog', x: -22, z: 34.5, yaw: 0.4, act: 'dig', tool: 'spade', outfit: 'summer', fur: 0xe8c49a, cloth: 0xff7ab0, scale: 0.72, defi: 'd_chateaux' },
  { id: 'lola', name: 'Lola', body: 'dog', x: 9, z: 52, yaw: 2.6, act: 'throw', outfit: 'summer', fur: 0xc08a5a, cloth: 0xffd23a, scale: 0.7, moves: true, puff: 0xff5a3a, defi: 'd_chat' },
  { id: 'tom', name: 'Tom', body: 'dog', x: 15, z: 58, yaw: -0.4, act: 'throw', outfit: 'summer', fur: 0x8a5a3a, cloth: 0x5ac8ff, scale: 0.66, moves: true, puff: 0x3a8ae0 },
  { id: 'zoe', name: 'Zoé', body: 'dog', x: 4, z: 59, yaw: 1.2, act: 'throw', outfit: 'summer', fur: 0xf2e6d0, cloth: 0x7ad83a, scale: 0.64, moves: true, puff: 0xffd23a },
  { id: 'mouna', name: 'Mouna la volleyeuse', body: 'dog', x: -84, z: 10, yaw: Math.PI / 2, act: 'serve', tool: 'vball', outfit: 'summer', fur: 0x5a4030, cloth: 0xe84a3a, defi: 'd_volley' },
  { id: 'nino', name: 'Nino', body: 'dog', x: -83, z: 4, yaw: Math.PI / 2 + 0.3, act: 'serve', outfit: 'summer', fur: 0xd8a070, cloth: 0xe84a3a, scale: 0.9 },
  { id: 'coralie', name: 'Coralie des flaques', body: 'dog', x: -126, z: 1, yaw: -2.2, act: 'net', tool: 'shrimpnet', outfit: 'summer', sunhat: true, fur: 0xf4ecdc, cloth: 0x3ac0c0, defi: 'd_flaques' },
  { id: 'zephyr', name: 'Papi Zéphyr', body: 'dog', x: -70, z: 84, yaw: Math.PI + 0.3, act: 'kite', tool: 'spool', outfit: 'summer', sunhat: true, fur: 0xd8d0c8, cloth: 0x8a6ae0, defi: 'd_dunes' },
  { id: 'kai', name: 'Kaï le surfeur', body: 'dog', x: -100, z: 121, yaw: 1.4, act: 'carry', tool: 'surfboard', outfit: 'summer', fur: 0xb07040, cloth: 0x3ab0e8, defi: 'd_matelas' },
  { id: 'leon', name: 'Léon des tortues', body: 'dog', x: 157, z: 66, yaw: -2.6, act: 'idle', outfit: 'summer', sunhat: true, fur: 0x9a7a5a, cloth: 0x40b060, defi: 'd_tortues' },
  { id: 'pepe', name: 'Pépé Hameçon', body: 'dog', x: -170, z: -15, yaw: Math.PI, act: 'fish', tool: 'rod', outfit: 'summer', sunhat: true, fur: 0xc8c0b8, cloth: 0x3a6ad0, defi: 'd_tape' },
  { id: 'odette', name: 'Madame Odette', body: 'dog', x: 2, z: 28.5, yaw: 0.2, act: 'lie', outfit: 'summer', sunhat: true, fur: 0xf0d8b0, cloth: 0xff6a8a, defi: 'd_chiot' },
  { id: 'hugo', name: 'Hugo l\'ukulélé', body: 'dog', x: 80, z: 113, yaw: Math.PI, act: 'strum', tool: 'ukulele', outfit: 'summer', fur: 0x6a4a3a, cloth: 0xf0b020, defi: 'd_melodie' },
  { id: 'marius', name: 'Marius des chouchous', body: 'dog', x: VIL.x + 23, z: VIL.z, act: 'walk', tool: 'tray', outfit: 'summer', sunhat: true, fur: 0xe8b880, cloth: 0xffffff,
    path: 'ellipse', ellipse: { x: VIL.x, z: VIL.z, rx: 23, rz: 8.5 }, speed: 0.07, phase: 0, moves: true, defi: 'd_perles', cry: ['Chouchous ! Beignets !', 'Qui veut des chouchous ?', 'Beignets tout chauds !'] },
  { id: 'calin', name: 'Gros-Câlin le phoque', body: 'critter', model: 'seal', x: -104, z: -18, yaw: 2.4, sleepy: true, scale: 1.6 },
  { id: 'lili', name: 'Lili', body: 'dog', x: -27.5, z: 37.5, yaw: -0.8, act: 'dig', tool: 'spade', outfit: 'summer', fur: 0xf2e6d0, cloth: 0x9a6ae0, scale: 0.62 },
];
for (const v of VILLAGERS) v.y = v.ellipse ? g(v.x, v.z) : S.supportAt(v.x, v.z, 200, 0).y;

const T = (who, text) => ({ who, text });
export const LINES = {
  sacha: {
    ask: [T('Sacha', 'Je construis le plus grand royaume de sable de toute la plage ! Mais tout seul, c\'est long…'),
      T('Sacha', 'Tu m\'aides ? Tape sur les tas de sable qui brillent, avec Attaque : à chaque coup, le château monte d\'un étage !'),
      T('Matcha', 'Un royaume de sable ? On arrive !')],
    thanks: [T('Sacha', 'Quatre châteaux avec leurs drapeaux ! C\'est le plus beau royaume du monde. Tiens, j\'ai trouvé ça en creusant.')],
    talk: [[T('Sacha', 'Attention : si tu fonces dessus avec ta charge… patatras ! Mais on peut toujours les reconstruire.')],
      [T('Sacha', 'Le secret d\'un bon château ? Du sable mouillé. Et beaucoup de patience.')]],
  },
  lili: { talk: [[T('Lili', 'Moi, je fais les douves. Glou glou glou, la mer va remplir mon fossé !')], [T('Lili', 'Sacha dit que c\'est son royaume. Moi, je suis la reine.')]] },
  lola: {
    ask: [T('Lola', 'On joue à chat perché ! Tu veux jouer avec nous ?'),
      T('Tom', 'Il faut nous toucher tous les trois avant la fin du chrono !'),
      T('Zoé', 'Mais attention : sur le sable, on court super vite !')],
    thanks: [T('Lola', 'Tu nous as tous attrapés ! Tu es le roi de la plage !')],
    talk: [[T('Lola', 'On rejoue ? Cette fois, je me cache derrière la cabine bleue !')], [T('Lola', 'Maman dit qu\'il faut attendre deux heures après le goûter pour se baigner. C\'est long, deux heures !')]],
  },
  tom: { talk: [[T('Tom', 'Je lance le ballon jusqu\'au phare ! Bon… presque.')]] },
  zoe: { talk: [[T('Zoé', 'Hi hi ! Raté ! Le ballon est parti dans les dunes !')]] },
  mouna: {
    ask: [T('Mouna la volleyeuse', 'Salut les toutous ! Il me manque un partenaire pour mon entraînement de volley.'),
      T('Mouna la volleyeuse', 'Je vous envoie le ballon par-dessus le filet : courez dessous et sautez pour le renvoyer ! Six fois de suite, et vous êtes champions.')],
    thanks: [T('Mouna la volleyeuse', 'Six renvois ! Quelle détente ! Vous êtes prêts pour le grand tournoi de la plage.')],
    talk: [[T('Mouna la volleyeuse', 'Au volley, on ne laisse jamais le ballon toucher le sable !')], [T('Mouna la volleyeuse', 'Nino sert comme un champion. Moi, je smashe !')]],
  },
  nino: { talk: [[T('Nino', 'Hop, hop, hop ! Je m\'échauffe les pattes.')], [T('Nino', 'Un jour, je servirai le ballon jusque sur l\'Île aux Mouettes !')]] },
  coralie: {
    ask: [T('Coralie des flaques', 'Chut… Regardez dans les flaques des rochers : des petits poissons y sautent !'),
      T('Coralie des flaques', 'Je les compte pour mon carnet de naturaliste. Attrapez-en cinq au vol, au signal doré, et on les remet dans l\'eau.')],
    thanks: [T('Coralie des flaques', 'Cinq petits poissons ! Je les note tous dans mon carnet. Plouf, plouf, ils sont rentrés chez eux.')],
    talk: [[T('Coralie des flaques', 'Dans une flaque, il y a tout un monde : des crabes, des étoiles de mer, des crevettes…')], [T('Coralie des flaques', 'On ne ramasse pas les étoiles de mer : on leur fait juste un petit coucou.')]],
  },
  zephyr: {
    ask: [T('Papi Zéphyr', 'Ah, le vent des dunes ! Mes cerfs-volants adorent ça. Et vous, vous savez voler ?'),
      T('Papi Zéphyr', 'Sautez du haut de la Grande Dune et passez dans tous mes anneaux dorés, dans l\'ordre. Le signal doré est près du sommet !')],
    thanks: [T('Papi Zéphyr', 'Quel vol ! On aurait dit deux cerfs-volants à poils. Tenez, pour vous.')],
    talk: [[T('Papi Zéphyr', 'Un cerf-volant, ça ne se tire pas : ça se promène, comme un chien en laisse.')], [T('Papi Zéphyr', 'Si vous aboyez près d\'un cerf-volant, il fait des loopings !')]],
  },
  kai: {
    ask: [T('Kaï le surfeur', 'Yo les toutous ! Avant d\'aller sur les vagues, un surfeur s\'échauffe. Sur les matelas gonflables !'),
      T('Kaï le surfeur', 'Rebondissez sur les six matelas qui brillent avant la fin du chrono. Allez, on s\'éclate !')],
    thanks: [T('Kaï le surfeur', 'Trop fort ! Vous avez l\'équilibre d\'un vrai surfeur. Ça mérite des paillettes !')],
    talk: [[T('Kaï le surfeur', 'La vague parfaite, ça n\'existe pas. Mais la vague rigolote, si !')], [T('Kaï le surfeur', 'Mistral prête les bodyboards, au poste de secours. Moi, je préfère ma grande planche.')]],
  },
  leon: {
    ask: [T('Léon des tortues', 'Oh là là ! Les bébés tortues viennent d\'éclore, et ils sont partis dans le mauvais sens !'),
      T('Léon des tortues', 'Touchez chaque bébé tortue pour qu\'il vous suive, et guidez-les jusqu\'au rond doré, au bord de la mer.')],
    thanks: [T('Léon des tortues', 'Ils sont tous dans les vagues ! Bon voyage, les petits. Merci, les toutous, vous êtes des héros.')],
    talk: [[T('Léon des tortues', 'Les tortues de mer reviennent pondre sur la plage où elles sont nées. Elles n\'oublient jamais !')], [T('Léon des tortues', 'Chut… Il y a peut-être encore des œufs dans le sable chaud.')]],
  },
  pepe: {
    ask: [T('Pépé Hameçon', 'Ces chenapans de crabes ! Ils sortent de leurs trous et me volent mes appâts !'),
      T('Pépé Hameçon', 'Sautez-leur dessus quand ils sortent, ou faites la toupie. Huit fois ! Le signal doré est tout près.')],
    thanks: [T('Pépé Hameçon', 'Ah, ils ont compris la leçon ! Je vais enfin pouvoir pêcher tranquille. Merci, mes petits.')],
    talk: [[T('Pépé Hameçon', 'Ça mord ? Non. Ça ne mord jamais. Mais j\'aime bien le bruit des vagues.')], [T('Pépé Hameçon', 'Un jour, j\'ai pêché une botte. Une botte de pirate, je vous jure !')]],
  },
  odette: {
    ask: [T('Madame Odette', 'Ah, mes toutous ! Un petit chiot farceur m\'a chipé ma sandale pendant ma sieste !'),
      T('Madame Odette', 'Il est parti tout au sud du village, derrière les maisons. Rattrapez-le, au signal doré !')],
    thanks: [T('Madame Odette', 'Ma sandale ! Toute mâchouillée, mais ma sandale ! Merci, mes chéris.')],
    talk: [[T('Madame Odette', 'Le soleil, la mer, une bonne sieste… c\'est ça, les vacances.')], [T('Madame Odette', 'N\'oubliez pas la crème solaire. Même sur le bout du nez !')]],
  },
  hugo: {
    ask: [T('Hugo l\'ukulélé', 'Écoutez mes carillons de coquillages : chacun chante une note.'),
      T('Hugo l\'ukulélé', 'Je joue une petite mélodie, puis vous la refaites en touchant les carillons dans le même ordre !')],
    thanks: [T('Hugo l\'ukulélé', 'Parfait ! Vous avez l\'oreille. Je vais l\'appeler « la chanson des toutous ».')],
    talk: [[T('Hugo l\'ukulélé', 'Plink, plonk ! L\'ukulélé, c\'est une petite guitare qui sourit tout le temps.')], [T('Hugo l\'ukulélé', 'Le soir, je joue pour les mouettes. Elles chantent faux, mais elles aiment ça.')]],
  },
  marius: {
    ask: [T('Marius des chouchous', 'Chouchous, beignets ! Oh, bonjour les toutous. Un coup de vent a renversé mes bonbons rouges !'),
      T('Marius des chouchous', 'Ils sont éparpillés dans tout le village. Rapportez-les-moi vite, au signal doré près de la place !')],
    thanks: [T('Marius des chouchous', 'Tous mes bonbons ! Tenez, un chouchou… euh, des paillettes. Le sucre, c\'est pas bon pour les chiens !')],
    talk: [[T('Marius des chouchous', 'Chouchous, beignets, qui en veut ? Pas les chiens, pas les chiens !')], [T('Marius des chouchous', 'Vous avez vu le gros bouton rouge, près des maisons ? Appuyez dessus pour voir !')]],
  },
  calin: {
    talk: [[T('Gros-Câlin le phoque', 'Hein ? Quoi ? Ourf… Je faisais ma sieste au soleil.'), T('Gros-Câlin le phoque', 'Bonjour, les petits chiens. Vous savez nager ? Moi, oui. Très, très bien. Mais d\'abord : dodo.')],
      [T('Gros-Câlin le phoque', 'Ourf ourf ! Les dauphins sautent au large, le matin. Ils friment un peu, si vous voulez mon avis.')],
      [T('Ainu', 'Il est tout doux, Matcha !'), T('Gros-Câlin le phoque', 'Évidemment. Je m\'appelle Gros-Câlin.')]],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const sup = (x, z) => S.supportAt(x, z, 200, 0).y;
const up = (x, z, h) => ({ x, z, y: sup(x, z) + (h === undefined ? 1.1 : h) });
const ringAt = (x, z, h, yaw) => ({ x, z, y: g(x, z) + h, yaw: yaw || 0 });
const W = S.WRECK;
// les anneaux de la Grande Dune : on saute du sommet, on descend vers l'est
const duneRings = [];
{ const x0 = -86, z0 = 99, dx = 0.85, dz = 0.53; for (let i = 0; i < 7; i++) { const d = 3 + 6.5 * i, x = x0 + dx * d, z = z0 + dz * d; duneRings.push(ringAt(x, z, i % 2 ? 3.0 : 1.6, Math.atan2(dx, dz))); } }
// les anneaux de la falaise : on dévale la pente herbue vers le sud
const cliffRings = [];
for (let i = 0; i < 7; i++) { const z = -6 + 7 * i; cliffRings.push(ringAt(100 + Math.sin(i * 1.3) * 3, z, i % 2 ? 3.0 : 1.6, 0)); }
const COURT = { x: -78, z: 10, yaw: Math.PI / 2 };

export const DEFIS = [
  { id: 'd_perles', type: 'coins', name: 'Les bonbons de Marius', hint: 'Attrapez les 8 bonbons rouges dans le village !', x: 52, z: 104, time: 70,
    items: [up(8, 112), up(40, 124), up(76, 100), up(30, 152), up(-14, 140), up(80, 142), up(56, 90), up(14, 80)] },
  { id: 'd_chiot', type: 'chase', name: 'Le chiot chapardeur', hint: 'Il a la sandale de Madame Odette : attrapez-le !', x: 40, z: 157, critter: 'thief', time: 45, leash: 12, speed: 7.0 },
  { id: 'd_melodie', type: 'xylo', name: 'La chanson des coquillages', hint: 'Écoutez, puis faites sonner les carillons dans le même ordre', x: 80, z: 102, chimes: ['x_1', 'x_2', 'x_3', 'x_4', 'x_5'], seq: [2, 0, 4, 1, 3], time: 90 },
  { id: 'd_chateaux', type: 'build', name: 'Le royaume de sable', hint: 'Tapez (Attaque) sur les 4 tas qui brillent pour bâtir les châteaux !', x: -8, z: 29, time: 50, props: ['cb_1', 'cb_2', 'cb_3', 'cb_4'] },
  { id: 'd_chat', type: 'tag', name: 'Chat perché sur la plage', hint: 'Touchez Lola, Tom et Zoé avant la fin du temps !', x: 12, z: 62, time: 40, leash: 14, speed: 6.0, kids: ['lola', 'tom', 'zoe'] },
  { id: 'd_volley', type: 'volley', name: 'Le volley de Mouna', hint: 'Courez sous le ballon et sautez : renvoyez-le 6 fois par-dessus le filet !', x: -71, z: 15, time: 75, need: 6, server: 'mouna', net: COURT },
  { id: 'd_flaques', type: 'fish', name: 'Les poissons des flaques', hint: 'Les petits poissons sautent hors des flaques : attrapez-en 5 au vol !', x: -119, z: 2, critter: 'poolfish', time: 50, need: 5, hole: 'pool',
    holes: [[S.POOLS[0].x, S.POOLS[0].z], [S.POOLS[1].x, S.POOLS[1].z], [S.POOLS[2].x, S.POOLS[2].z], [-116, -3], [-136, -12]] },
  { id: 'd_dunes', type: 'rings', name: 'Le vol de la Grande Dune', hint: 'Sautez du sommet et passez dans les anneaux, dans l\'ordre !', x: -88, z: 103, time: 30, rings: duneRings },
  { id: 'd_matelas', type: 'pads', name: 'L\'échauffement du surfeur', hint: 'Rebondissez sur les 6 matelas qui brillent !', x: -104, z: 114, time: 40, pads: ['m_1', 'm_2', 'm_3', 'm_4', 'm_5', 'm_6'] },
  { id: 'd_falaise', type: 'rings', name: 'La descente de la falaise', hint: 'Dévalez la pente à travers les anneaux : sautez pour les plus hauts !', x: 100, z: -14, time: 30, rings: cliffRings },
  { id: 'd_lapin', type: 'race', name: 'La course du lapin', hint: 'Le lapin file vers le drapeau à damier, près du phare : arrivez avant lui !', x: 80, z: -24, critter: 'rabbit', speed: 7.3,
    path: [[80, -28], [84, -46], [80, -62], [92, -74], [104, -82]] },
  { id: 'd_tortues', type: 'herd', name: 'Les bébés tortues', hint: 'Touchez les bébés tortues et guidez-les jusqu\'au rond doré, au bord de l\'eau', x: 152, z: 64, critter: 'hatchling', time: 110, pen: { x: 172, z: 9, r: 3.6 },
    chicks: [[146, 76], [178, 60], [140, 46], [183, 30]] },
  { id: 'd_tape', type: 'whack', name: 'Tape-crabe', hint: 'Les crabes sortent de leurs trous : sautez dessus, ou faites la toupie !', x: -163, z: -9, critter: 'crab', time: 35, need: 8, hole: 'burrow',
    holes: [[-167, -4], [-173, 0], [-168, 5], [-176, -7], [-179, 3], [-171, -10]] },
  { id: 'd_epave', type: 'coins', name: 'Les perles de l\'épave', hint: 'Attrapez les 8 perles rouges autour du vieux bateau !', x: 134, z: 44, time: 60,
    items: [up(W.at(11, 0).x, W.at(11, 0).z), up(W.at(-11, 0).x, W.at(-11, 0).z), up(W.at(0, 6.5).x, W.at(0, 6.5).z), up(W.at(4, -6).x, W.at(4, -6).z), up(W.at(-6, -6).x, W.at(-6, -6).z),
      { x: W.deck.x, z: W.deck.z, y: W.deck.top + 1.1 }, up(W.at(6, 6.5).x, W.at(6, 6.5).z), { x: W.steps[1].x, z: W.steps[1].z, y: W.steps[1].top + 1.1 }] },
];
for (const d of DEFIS) d.y = g(d.x, d.z);

// ---------------------------------------------------------------------------
// Objets posés à la main (temps forts)
// ---------------------------------------------------------------------------
const chimeC = { x: 80, z: 108 };
const PROPS = [
  // le royaume de sable de Sacha (4 châteaux à bâtir pour le défi) et le filet de volley
  ...[[-22, 30], [-27, 41], [-17, 38.5], [-29, 33]].map(([x, z], i) => ({ id: 'cb_' + (i + 1), kind: 'castle', x, z, stage: 1, rot: i * 1.3, s: 1.5 })),
  { id: 'v_net', kind: 'net', x: COURT.x, z: COURT.z, rot: COURT.yaw },
  // les carillons de coquillages de Hugo (pentatonique)
  ...[0, 1, 2, 3, 4].map((i) => ({ id: 'x_' + (i + 1), kind: 'shellchime', x: chimeC.x + (i - 2) * 3.4, z: chimeC.z, rot: 0, note: [72, 74, 76, 79, 81][i] })),
  // les six matelas de Kaï, entre les dunes et la palmeraie
  ...[[-108, 106], [-114, 115], [-107, 126], [-116, 134], [-106, 143], [-117, 152]].map(([x, z], i) => ({ id: 'm_' + (i + 1), kind: 'mattress', x, z, rot: i * 0.7, tint: [0xff8ab8, 0xffd23a, 0x5ac8ff, 0x7ad83a, 0xff9a4a, 0xb08aff][i] })),
  // la serviette de Madame Odette, son parasol, ses affaires
  { id: 'o_towel', kind: 'towel', x: 2, z: 28.5, rot: 0.2, tint: 0xff6a8a },
  { id: 'o_par', kind: 'parasol', x: 5.2, z: 31, tint: 0xff9ab8 },
  // les cerfs-volants de Papi Zéphyr, au-dessus des dunes
  { id: 'k_1', kind: 'kite', x: -66, z: 80, rot: Math.PI, tint: 0xff5a3a }, { id: 'k_2', kind: 'kite', x: -76, z: 78, rot: Math.PI + 0.4, tint: 0x3a8ae0 }, { id: 'k_3', kind: 'kite', x: -60, z: 92, rot: Math.PI - 0.3, tint: 0xffd23a },
  // les ballons de plage
  { id: 'bb_1', kind: 'bball', x: -4, z: 38 }, { id: 'bb_2', kind: 'bball', x: 30, z: 26 }, { id: 'bb_3', kind: 'bball', x: -70, z: 6 }, { id: 'bb_4', kind: 'bball', x: 18, z: 112 }, { id: 'bb_5', kind: 'bball', x: 146, z: 56 }, { id: 'bb_6', kind: 'bball', x: 7, z: 60 },
  // gros boutons : guirlande du chemin de la plage, jets d'eau de la place
  { id: 'b_path', kind: 'button', x: 30, z: 70, effect: 'lights', group: 'path' },
  { id: 'b_jets', kind: 'button', x: 56, z: 112, effect: 'geyser', gx: 50, gz: 113 },
  ...[0, 1, 2].flatMap(i => [{ id: `l_p${i}a`, kind: 'lantern', group: 'path', x: 20, z: 74 - i * 8 }, { id: `l_p${i}b`, kind: 'lantern', group: 'path', x: 27, z: 74 - i * 8 }]),
  // l'épave : tonneaux échoués ; les rochers : tas d'algues
  { id: 'e_b1', kind: 'barrel', x: W.at(-2, 7.5).x, z: W.at(-2, 7.5).z }, { id: 'e_b2', kind: 'barrel', x: W.at(9, -5).x, z: W.at(9, -5).z }, { id: 'e_b3', kind: 'barrel', x: W.at(-12, 3).x, z: W.at(-12, 3).z },
  // parasols autour du terrain de volley (les spectateurs)
  { id: 'v_p1', kind: 'parasol', x: -66, z: 2, tint: 0x5ac8ff }, { id: 'v_p2', kind: 'parasol', x: -88, z: 22, tint: 0xffd23a },
];
for (const p of PROPS) p.y = g(p.x, p.z);

// Bêtes posées à la main
const FAUNA = [
  // au large : dauphins (loin des bouées de la course et de la route de l'île), méduses
  { id: 'dauph_o', kind: 'dolphin', x: -105, z: -80 }, { id: 'dauph_e', kind: 'dolphin', x: 150, z: -45 }, { id: 'dauph_n', kind: 'dolphin', x: 40, z: -135 }, { id: 'dauph_c', kind: 'dolphin', x: -150, z: -100 },
  { id: 'med_1', kind: 'jelly', x: -72, z: -32 }, { id: 'med_2', kind: 'jelly', x: 150, z: -14 }, { id: 'med_3', kind: 'jelly', x: -165, z: -62 }, { id: 'med_4', kind: 'jelly', x: 80, z: -125 },
  // l'île : phoques et mouettes ; les rochers : un phoque
  { id: 'phoq_i', kind: 'seal', x: -30, z: -124, rot: 2.2 }, { id: 'phoq_r', kind: 'seal', x: -182, z: -22, rot: 3.6 },
  { id: 'mou_i', kind: 'gull', x: -44, z: -129 }, { id: 'mou_v', kind: 'gull', x: 8, z: 88 },
  // la crique : tortues adultes ; la palmeraie : papillons
  { id: 'tort_1', kind: 'turtle', x: 178, z: 44 }, { id: 'tort_2', kind: 'turtle', x: 128, z: 26 },
  { id: 'pap_g', kind: 'butterfly', x: -132, z: 138 }, { id: 'pap_v', kind: 'butterfly', x: 72, z: 150 },
  // les chiots des familles, près du royaume de sable et sur la promenade
  { id: 'chiot_1', kind: 'puppy', x: -12, z: 44 }, { id: 'chiot_2', kind: 'puppy', x: 46, z: 112 },
];

// Le long du rivage, tous les ~13 m : crabes, étoiles de mer, tas d'algues (le sable mouillé fourmille)
const SHORE = { fauna: [], props: [] };
{
  const kinds = ['crab', 'starfish', 'kelp', 'crab', 'starfish', 'crab', 'kelp'];
  let n = 0;
  for (let x = -94; x <= 184; x += 13) {
    const k = kinds[n % kinds.length], u = 2.5 + (n % 3) * 1.8, z = S.shoreZ(x) + u;
    n++;
    if (!walkable(x, z) || g(x, z) < 0.2) continue;
    const e = { id: 'r_' + k + n, kind: k, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot: (n * 1.7) % 6.28 };
    (k === 'kelp' ? SHORE.props : SHORE.fauna).push(e);
  }
}

// Cachettes (coffres)
const SECRETS = [
  { id: 's_palmeraie', x: -148, z: 138, rot: 0.6, found: 'Au cœur de la palmeraie, à l\'ombre des palmiers !' },
  { id: 's_phare', x: 104, z: -105, rot: -0.8, found: 'Tout au bout de la falaise, derrière le phare !' },
  { id: 's_ile', x: -50, z: -138, rot: 2.4, found: 'Sur l\'Île aux Mouettes ! Les mouettes le gardaient.' },
  { id: 's_epave', x: W.at(13, 0).x, z: W.at(13, 0).z, rot: W.yaw, found: 'Devant la proue de l\'épave : un vrai trésor de pirate !' },
  { id: 's_creux', x: -172, z: 91, rot: 1.2, found: 'Au fond d\'un creux des dunes, là où personne ne regarde !' },
  { id: 's_talus', x: 72, z: 166, rot: Math.PI, found: 'Derrière les maisons du village, au pied du talus !' },
  { id: 's_rochers', x: -182, z: 14, rot: -1.2, found: 'Tout au bout des rochers, face à la mer !' },
];
for (const s of SECRETS) s.y = g(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des rebonds…)
const line = (a, b, n, h) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: sup(x, z) + (h || 1.0) }; });
const arc = (a, b, n, top) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: Math.max(g(x, z) + 1, g(a[0], a[1]) + 1 + Math.sin(k * Math.PI) * top) }; });
const TRAILS = [
  { id: 't_palmeraie', pts: line([-122, 140], [-145, 139], 7), say: 'Une piste dans la palmeraie…' },
  { id: 't_phare', pts: line([96, -100], [103, -103], 4) },
  { id: 't_ile', pts: line([-38, -136], [-48, -137], 5) },
  { id: 't_epave', pts: line([W.at(6, 4).x, W.at(6, 4).z], [W.at(12, 1.5).x, W.at(12, 1.5).z], 5) },
  { id: 't_creux', pts: line([-158, 102], [-170, 93], 6), say: 'Des paillettes dans le creux !' },
  { id: 't_talus', pts: line([60, 150], [71, 163], 6) },
  { id: 't_rochers', pts: line([-176, 24], [-181, 16], 4) },
  { id: 't_saut1', pts: arc([-108, 106], [-113, 112], 6, 4.5), say: 'Joli saut !' },
  { id: 't_saut2', pts: arc([-107, 126], [-112, 131], 6, 4.5), say: 'Joli saut !' },
  { id: 't_ponton', pts: Array.from({ length: 7 }, (_, i) => ({ x: S.PIER.x, z: 12 - i * 4.5, y: S.PIER.top + 1.0 })), say: 'Au bout du ponton, on voit l\'île !' },
  { id: 't_rivage', pts: line([-58, -4], [-86, -6], 8, 0.9), say: 'Quelle balade sur le sable mouillé !' },
  { id: 't_dune', pts: arc([-104, 88], [-96, 95], 5, 2) },
];

// ---------------------------------------------------------------------------
// Palette : bêtes et objets de la plage
// ---------------------------------------------------------------------------
export const PALETTE = {
  fauna: {
    crab: { model: 'crab', ai: 'scuttle', side: true, hole: 'burrow', flee: 4.5, run: 6, speed: 1.3, home: 4, scale: 1.1, sound: 'squeak', say: ['Clic clac !', 'Pinces en l\'air !'], skin: 'shell', skinOpts: { roughness: 0.45, scale: 3 } },
    hermit: { model: 'hermit', ai: 'scuttle', liteNear: 45, shell: true, sink: 0.14, flee: 3.5, speed: 0.5, home: 3, scale: 1.2, colors: { shell: 0xf0dcc0, band: 0xc89070 }, say: ['…'], skin: 'shell', skinOpts: { roughness: 0.5, scale: 4 } },
    starfish: { model: 'starfish', ai: 'wander', liteNear: 40, pet: true, shy: false, hopper: false, speed: 0.12, run: 0.3, home: 1.2, scale: 1.3, sound: 'ting', say: ['Bloup !', 'Coucou !'], tints: [0xff8a4a, 0xff6a8a, 0xb07ad8, 0xffc040, 0xe8503a], skin: 'skin', skinOpts: { roughness: 0.75, scale: 6 } },
    gull: { model: 'bird', ai: 'flock', group: 4, scale: 2.5, flee: 5, sound: 'chirp', foldWings: true, colors: { back: 0xb8c0c8, breast: 0xffffff, cap: 0xffffff, beak: 0xf0b020, fold: true }, skin: 'fur', skinOpts: { k: 0.35, scale: 6 } },
    rabbit: { model: 'hare', ai: 'wander', group: 2, scale: 1.15, colors: { fur: 0xffffff, tip: 0x3a2a20 }, tints: [0xb08a60, 0xa07850, 0xc8a070], hopper: true, flee: 6, run: 8.5, speed: 1.4, home: 9, sound: 'squeak', say: ['Hop !', 'Couic !'], skin: 'fur', skinOpts: { k: 0.55, scale: 5 } },
    butterfly: { model: 'butterfly', ai: 'hover', group: 3, liteNear: 40, scale: 2.2, alt: 1.0, bob: 0.4, glow: false, colors: { wing: 0xffa030 } },
    turtle: { model: 'turtle', ai: 'wander', pet: true, shy: false, hopper: false, speed: 0.35, run: 0.8, home: 6, scale: 1.4, sound: 'grunt', say: ['…bonjour…', 'Mmm…'], follow: 12, skin: 'shell', skinOpts: { roughness: 0.6, scale: 3 } },
    hatchling: { model: 'turtle', ai: 'none', hopper: false, scale: 0.55, colors: { shell: 0x4a4a32, scute: 0x6a6a42, fur: 0x7a7a5a }, extra: 2, skin: 'shell', skinOpts: { roughness: 0.6, scale: 5 } },
    seal: { model: 'seal', ai: 'bask', pet: true, shy: false, scale: 1.5, sound: 'honk', say: ['Ourf !', 'Ourf ourf !'], skin: 'fur', skinOpts: { k: 0.4, roughness: 0.55, scale: 5 } },
    dolphin: { model: 'dolphin', ai: 'sea', water: true, group: 3, home: 16, speed: 3, leap: 2.8, leapSpeed: 7, depth: 1.5, sub: 0.25, scale: 1.2, skin: 'skin', skinOpts: { k: 0.3, roughness: 0.35, scale: 2 } },
    jelly: { model: 'jelly', ai: 'sea', water: true, group: 2, home: 5, speed: 0.4, depth: 1.0, sub: 0.15, bob: 0.12, pulse: 0.12, scale: 1.1, glow: 0xff9ad0, glowY: 0.1, glowSize: 1.4 },
    poolfish: { model: 'fish', ai: 'jump', colors: { fur: 0xffb030 }, extra: 1 },
    puppy: { model: 'puppy', ai: 'wander', pet: true, shy: false, hopper: false, speed: 1.6, run: 6, home: 6, sound: 'yip', say: ['Waf !', 'Wouf !'], follow: 20, colors: { collar: 0xe83a3a }, tints: [0xe8c49a, 0xf6f0e8, 0x8a5a3a, 0x3a3030, 0xd8a070], extra: 2, skin: 'fur', skinOpts: { k: 0.5, scale: 6 } },
    thief: { model: 'puppy', ai: 'none', colors: { collar: 0x3a8ae0 }, scale: 0.95, extra: 1, skin: 'fur', skinOpts: { k: 0.5, scale: 6 } },
  },
  props: {
    castle: { act: 'build', stages: 3, crown: 'pennant', drop: 2, color: 0xe8cc90, r: 0.9, skin: 'sand', skinOpts: { k: 0.85, scale: 3, roughness: 0.95 } },
    pennant: {},
    net: { skin: 'fabric', skinOpts: { k: 0.3 } },
    shellchime: { act: 'chime', skin: 'wood', skinOpts: { k: 0.6, scale: 1.5 } },
    mattress: { act: 'bounce', power: 16, r: 1.1, top: 0.3, tint: true, skinOpts: { roughness: 0.35 } },
    parasol: { act: 'bounce', power: 18, r: 1.4, top: 2.35, tint: true, solid: 0.18, skin: 'fabric', skinOpts: { k: 0.5, scale: 5 } },
    towel: { tint: true, skin: 'fabric', skinOpts: { k: 0.7, scale: 6 } },
    kite: { act: 'shake', sway: 0.07, tint: true, skin: 'fabric', skinOpts: { k: 0.4, scale: 4 } },
    bball: { act: 'push', model: 'beachball', r0: 0.42, grow: false, kick: 9, friction: 1.1 },
    beachball: {},
    oyat: { act: 'shake', drop: 1, liteNear: 55, skin: 'grain', skinOpts: { k: 0.5, scale: 4 } },
    wildflowers: { act: 'shake', drop: 1, liteNear: 50 },
    bucket: { act: 'shake', drop: 1, tint: true },
    barrel: { act: 'break', drop: 2, chance: 0.8, respawn: 45, color: 0x8a6038, skin: 'wood', skinOpts: { k: 0.8, scale: 1.2 } },
    kelp: { act: 'break', liteNear: 45, drop: 1, chance: 0.6, respawn: 40, color: 0x5a6a30, skin: 'grain', skinOpts: { k: 0.5, scale: 5 } },
    button: { act: 'press', r: 0.7 },
    lantern: { skin: 'wood', skinOpts: { k: 0.4 } },
    chest: { skin: 'wood', skinOpts: { k: 0.7, scale: 2 } },
    lid: { skin: 'wood', skinOpts: { k: 0.7, scale: 2 } },
    burrow: { model: 'hole', colors: { inner: 0x5a4028, rim: 0xd8bc80 } },
    pool: { model: 'hole', colors: { inner: 0x2a7a98, rim: 0x8a8278 } },
  },
  villagers: { skin: 'fur', skinOpts: { k: 0.45, scale: 6 }, clothSkin: 'fabric', clothOpts: { k: 0.45, scale: 7 }, hatSkin: 'grain' },
};

// ---------------------------------------------------------------------------
// Où rien ne doit être posé (personnages de quête, tas à creuser, courses, portail…)
// ---------------------------------------------------------------------------
const KEEP = [
  ...Object.values(S.GIVERS).map(f => [f.x, f.z, 5]), [S.npcs.mamie.x, S.npcs.mamie.z, 5], [S.npcs.puppy.x, S.npcs.puppy.z, 3], [S.START.x, S.START.z, 5],
  ...S.CHECKPOINTS.map(c => [c.x, c.z, 4]), ...S.signs.map(s => [s.x, s.z, 2.5]), ...S.PORTALS.map(p => [p.x, p.z, 4]), ...S.crates.map(c => [c.x, c.z, 2.5]),
  ...S.MOUNDS.map(m => [m.x, m.z, 3.5]), [S.PIECE_MOUND.x, S.PIECE_MOUND.z, 3.5], [S.CHEST.x, S.CHEST.z, 4], ...S.CRABS.map(c => [c.x, c.z, 3.5]),
  ...S.LENSES.map(l => [l.x, l.z, 3.5]), ...S.MAP_PIECES.map(p => [p.x, p.z, 3]), ...S.medals.map(m => [m.x, m.z, 3.5]), [S.SEAL.x, S.SEAL.z, 4],
  [S.RACK.x, S.RACK.z, 8], [S.LAUNCH.x, S.LAUNCH.z, 8], [S.LIFEGUARD.x, S.LIFEGUARD.z, 5], [S.CANS.x, S.CANS.z, 5], [S.ICECREAM.x, S.ICECREAM.z, 4.5],
  [S.FORT.x, S.FORT.z, S.FORT.r + 4], [S.CAVE.x, S.CAVE.z, S.CAVE.r + 3.5], [S.LIGHTHOUSE.x, S.LIGHTHOUSE.z, 7], [S.SEAL_ROCK.x, S.SEAL_ROCK.z, 6],
  ...DEFIS.map(d => [d.x, d.z, 3.5]), ...VILLAGERS.map(v => [v.x, v.z, v.ellipse ? 0 : 2.5]), ...SECRETS.map(s => [s.x, s.z, 3]),
];
const SEA_ROUTES = [...S.RACE.buoys.map((b, i) => [i ? S.RACE.buoys[i - 1] : S.RACE.start, b]), ...S.ISLAND_ROUTE.slice(1).map((p, i) => [{ x: S.ISLAND_ROUTE[i][0], z: S.ISLAND_ROUTE[i][1] }, { x: p[0], z: p[1] }]),
  [{ x: S.PIER.x, z: S.PIER.z1 }, { x: S.ISLAND_ROUTE[0][0], z: S.ISLAND_ROUTE[0][1] }], ...S.LESSON.map((b, i) => [i ? S.LESSON[i - 1] : S.LAUNCH, b])];
/** Les parcours de bodyboard (leçon, course, route de l'île) : rien n'y nage. */
export const onSeaRoute = (x, z, m) => SEA_ROUTES.some(([a, b]) => segD(x, z, a.x, a.z, b.x, b.z) < (m || 10));
const VOLLEY = (x, z) => Math.abs(x - COURT.x) < 9 && Math.abs(z - COURT.z) < 7;
export function avoid(x, z, type, kind) {
  if (KEEP.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r)) return true;
  if (S.cats.some(c => Math.hypot(c.x - x, c.z - z) < 3)) return true;
  const h = g(x, z);
  if (type === 'props' || type === 'villagers') {
    if (h < 0.15) return true;                                         // pas dans l'eau
    if (solidHere(x, z, 1.4) || S.blockedAt(x, z) || S.near(x, z, 3).some(c => !c.life && (c.kind === 'house' || c.kind === 'hut' || c.kind === 'stall') && S.inside(c, x, z, 2))) return true;
    if (palmAt(x, z, 1.4)) return true;
    if (S.PARASOLS.some(p => Math.hypot(p.x - x, p.z - z) < 2.6)) return true;
    if (S.bones.some(b => Math.abs(b.x0 - x) < 1.6 && Math.abs(b.z0 - z) < 1.6)) return true;
    if (S.BOARDWALKS.some(([a, b]) => segD(x, z, a[0], a[1], b[0], b[1]) < 2.2)) return true;
    if (segD(x, z, S.CAVE.x, S.CAVE.z, S.SEAL_HOME.x, S.SEAL_HOME.z) < 3.5) return true;   // le chemin du bébé phoque
    if (S.caveSteps.some(s => Math.hypot(s.x - x, s.z - z) < 3)) return true;
    if (Math.hypot(x - S.WRECK.x, z - S.WRECK.z) < 12 && kind !== 'barrel') return true;
    if (VOLLEY(x, z)) return true;
    if (kind === 'parasol' && h > S.PROMENADE_Y - 0.2 && x > -15) return true;
  }
  if (type === 'fauna' && VOLLEY(x, z) && kind !== 'gull') return true;
  return false;
}

/** Le « milieu » d'un point : sable mouillé, rochers, dunes, promenade, falaise… */
function info(x, z) {
  const h = g(x, z), u = S.fromShore(x, z);
  const island = Math.hypot(x - S.ISLAND.x, z - S.ISLAND.z) < S.ISLAND.r + 3;
  const grove = Math.hypot(x - S.GROVE.x, z - S.GROVE.z) < S.GROVE.r;
  const plateau = x > S.HEAD.x0 + 2 && x < S.HEAD.x1 - 2 && h > 4.5 && z < 60;
  const rocks = x < -95 && u > -4 && u < 26 && !island;
  const prom = Math.abs(h - S.PROMENADE_Y) < 0.1 && u > 46 && x > -15;
  const dunes = x < -12 && u > 44 && !grove && !prom;
  const crique = x > 118 && !plateau;
  const wet = !island && !rocks && u < 7 && h < 1.3;
  const beach = !plateau && !prom && !dunes && !grove && u >= 0 && u <= 46;
  return { h, u, island, grove, plateau, rocks, prom, dunes, crique, wet, beach, flat: slope(x, z) < 0.25, south: z > 150 };
}

export const SPEC = {
  seed: 6006, extent: 186, spacing: 14, cover: 10, grid: 3,
  walkable, ground: g, info, avoid,
  highlights: { fauna: [...FAUNA, ...SHORE.fauna.filter(e => !avoid(e.x, e.z, 'fauna', e.kind))], props: [...PROPS, ...SHORE.props.filter(e => !avoid(e.x, e.z, 'props', e.kind))], villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    { type: 'fauna', kind: 'crab', w: 3, min: 11, when: (x, z, i) => i.wet || (i.rocks && i.h < 1.6) || (i.crique && i.u < 22) || i.island },
    { type: 'fauna', kind: 'hermit', w: 1.2, min: 14, when: (x, z, i) => i.rocks || (i.beach && i.u < 26) || i.island },
    { type: 'fauna', kind: 'starfish', w: 2.2, min: 10, when: (x, z, i) => i.wet || (i.rocks && i.h < 1.4) },
    { type: 'fauna', kind: 'gull', w: 2.0, min: 26, when: (x, z, i) => (i.beach || i.island || i.plateau || i.prom || i.crique) && i.flat },
    { type: 'fauna', kind: 'rabbit', w: 2.6, min: 16, when: (x, z, i) => i.dunes || i.plateau || i.south },
    { type: 'fauna', kind: 'butterfly', w: 1.6, min: 20, when: (x, z, i) => i.grove || i.plateau || i.dunes || i.south },
    { type: 'fauna', kind: 'puppy', w: 0.8, min: 40, when: (x, z, i) => (i.prom || i.beach) && i.flat && !i.wet },
    { type: 'fauna', kind: 'turtle', w: 0.8, min: 36, when: (x, z, i) => (i.crique || i.island) && !i.wet },
    { type: 'fauna', kind: 'seal', w: 0.7, min: 45, when: (x, z, i) => i.rocks && i.u < 10 },
    { type: 'props', kind: 'castle', w: 3, min: 14, when: (x, z, i) => i.beach && i.u > 5 && i.u < 40 && i.flat, data: { stage: 3, s: 1.35 } },
    { type: 'props', kind: 'parasol', w: 2.6, min: 18, when: (x, z, i) => (i.beach || i.crique) && i.u > 9 && i.u < 42 && i.flat },
    { type: 'props', kind: 'mattress', w: 0.6, min: 30, when: (x, z, i) => (i.beach || i.crique || i.dunes) && i.u > 6 && i.flat },
    { type: 'props', kind: 'bball', w: 0.8, min: 30, when: (x, z, i) => (i.beach || i.prom || i.crique) && i.flat && i.u > 4 },
    { type: 'props', kind: 'oyat', w: 2.6, min: 8, when: (x, z, i) => i.dunes || (i.beach && i.u > 30) || (i.crique && i.u > 30) },
    { type: 'props', kind: 'wildflowers', w: 2.2, min: 9, when: (x, z, i) => i.plateau || i.grove || i.prom || i.south },
    { type: 'props', kind: 'kelp', w: 2.0, min: 10, when: (x, z, i) => i.wet || (i.rocks && i.h < 1.3) },
    { type: 'props', kind: 'barrel', w: 0.9, min: 20, when: (x, z, i) => i.rocks || (i.crique && i.u < 30) || i.island },
    { type: 'props', kind: 'kite', w: 0.5, min: 40, when: (x, z, i) => i.dunes || i.plateau },
    { type: 'fauna', kind: 'gull', w: 0.4 },
  ],
  /** Couleurs variées : seaux, parasols, matelas, cerfs-volants ; notes des carillons ; châteaux à moitié faits. */
  place(e) {
    const k = Math.floor(e.rot * 10);
    if (e.kind === 'parasol') e.tint = [0xff5a5a, 0x5ac8ff, 0xffd23a, 0x7ad83a, 0xff8ab8, 0xff9a4a][k % 6];
    if (e.kind === 'mattress') e.tint = [0xff8ab8, 0xffd23a, 0x5ac8ff, 0x7ad83a][k % 4];
    if (e.kind === 'bucket') e.tint = [0xff5a3a, 0x3a8ae0, 0xffd23a, 0x40c060, 0xff7ad8][k % 5];
    if (e.kind === 'kite') e.tint = [0xff5a3a, 0x3a8ae0, 0xffd23a, 0xb07aff][k % 4];
    if (e.kind === 'shellchime') e.note = [72, 74, 76, 79, 81, 84][k % 6];
    if (e.kind === 'castle') e.stage = k % 4;
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 186 }, opts || {}));
