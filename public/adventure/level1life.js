/*
 * Matcha & Ainu — Niveau 1 « Le Parc des Toutous » : la couche de vie (données pures).
 *
 * Bêtes : canards et canetons (en file derrière leur maman, sur la mare et dans l'herbe),
 * poissons rouges, grenouilles sur les nénuphars, pigeons qui s'envolent, rouges-gorges,
 * mouettes à la plage, écureuils, lapins, hérissons, papillons sur les massifs, chiens du
 * parc (on les caresse, ils jouent quand on aboie).
 * Objets : buissons et arbustes à secouer, massifs de fleurs, tas de feuilles mortes,
 * flaques et arroseurs où l'on patauge, bains d'oiseaux, champignons géants et trampolines,
 * ballons de plage et boules de pétanque à pousser, tuyaux musicaux, machine à bulles,
 * chariot de glaces.
 * 14 défis éclair, des habitants occupés (promeneurs, joggeur, cerf-volant, accordéoniste,
 * pétanque, pique-nique…), des traînées de paillettes et 6 cachettes.
 *
 * Le plan est calculé ici (lifeplan.js, graine fixe : identique chez tous les joueurs) ;
 * park.js le donne à life.js. Les tests (Node) l'importent aussi.
 */
import * as S from './level1.js';
import { planLife, densityProbe, PointGrid } from './lifeplan.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const g = (x, z) => S.heightAt(x, z);
const slope = (x, z) => Math.hypot(g(x + 0.5, z) - g(x - 0.5, z), g(x, z + 0.5) - g(x, z - 0.5));
const TG = new PointGrid(10);
for (const t of [...S.trees, ...S.CHERRY_TREES]) TG.add(t);
export const treeAt = (x, z, m) => TG.within(x, z, 4).some(t => Math.hypot(t.x - x, t.z - z) < 0.55 * t.s + (m || 0.3));
const pathD = (x, z) => Math.min(...S.PATHS.map(([[ax, az], [bx, bz]]) => segD(x, z, ax, az, bx, bz)));

/** De l'eau (la mare, la mer) : là où nagent les canards et sautent les poissons. */
export const isWater = (x, z) => g(x, z) < S.WATER_Y - 0.25;
/** La surface : le sol, ou l'eau par-dessus. */
export const surface = (x, z) => Math.max(g(x, z), S.WATER_Y);
const inMaze = (x, z, m) => { const h = S.MAZE.n * S.MAZE.cell / 2 + (m || 0); return Math.abs(x - S.MAZE.x) < h && Math.abs(z - S.MAZE.z) < h; };

/** Un point où l'on peut marcher (dans le parc, sur l'herbe ou la plage, pas dans une haie ni un arbre). */
export function walkable(x, z) {
  if (Math.hypot(x, z) > 170) return false;
  if (g(x, z) < 0.35) return false;
  if (S.blockedAt(x, z) || treeAt(x, z)) return false;
  return slope(x, z) < 1.6;
}

// ---------------------------------------------------------------------------
// Les habitants (et leurs répliques)
// ---------------------------------------------------------------------------
const POND = S.POND;
const ring = (cx, cz, r, n, a0) => Array.from({ length: n }, (_, i) => { const a = (a0 || 0) + i / n * Math.PI * 2; return [Math.round((cx + Math.cos(a) * r) * 10) / 10, Math.round((cz + Math.sin(a) * r) * 10) / 10]; });
export const VILLAGERS = [
  { id: 'cane', name: 'Maman Cane', body: 'critter', model: 'ducks', scale: 2.1, x: -61, z: 21, yaw: -2.4, defi: 'd_canetons' },
  { id: 'rosalie', name: 'Mémé Rosalie', body: 'dog', x: -61, z: -23, yaw: -0.4, act: 'feed', tool: 'bread', busy: true, fur: 0xe8e0d4, cloth: 0x8a5aa0, defi: 'd_poissons' },
  { id: 'ballon', name: 'Monsieur Ballon', body: 'dog', x: 20, z: 102, yaw: Math.PI, act: 'balloons', tool: 'balloons', fur: 0xc8905a, cloth: 0xe8402e, defi: 'd_ballons' },
  { id: 'lili', name: 'Lili', body: 'dog', x: 61, z: 121, yaw: 0.7, act: 'sad', actDone: 'cheer', scale: 0.7, fur: 0xf4ecdc, cloth: 0xff8ab8, defi: 'd_frisbee' },
  { id: 'leon', name: 'Léon le jardinier', body: 'dog', x: 72, z: -51, yaw: 2.6, act: 'rake', tool: 'rake', busy: true, fur: 0x8a6a4a, cloth: 0x3a7a3a, defi: 'd_taupes' },
  { id: 'pirouette', name: 'Pirouette', body: 'dog', x: -14, z: 103, yaw: 0.4, act: 'jumpy', scale: 0.66, moves: true, fur: 0xd8a070, cloth: 0xffd040, defi: 'd_chat' },
  { id: 'caline', name: 'Câline', body: 'dog', x: -8, z: 109, yaw: -2.2, act: 'jumpy', scale: 0.62, moves: true, fur: 0x3a3030, cloth: 0x5ac8ff },
  { id: 'fripouille', name: 'Fripouille', body: 'dog', x: -19, z: 110, yaw: 2.4, act: 'jumpy', scale: 0.64, moves: true, fur: 0xf2e6d0, cloth: 0x9a6ae0 },
  { id: 'papa', name: 'Papa Bouledogue', body: 'dog', x: 37, z: 81, yaw: 0.3, act: 'sit', fur: 0xb89070, cloth: 0x2a6ac0, defi: 'd_ecureuil' },
  { id: 'bebe', name: 'Bébé Bouledogue', body: 'dog', x: 39.5, z: 82.5, yaw: -0.6, act: 'sit', scale: 0.55, fur: 0xc8a080, cloth: 0xffe060 },
  { id: 'coach', name: 'Coach Turbo', body: 'dog', x: 22, z: 0, loop: ring(0, 0, 22, 18, 0), speed: 3.4, phase: 0, act: 'jog', moves: true, fur: 0x5a4030, cloth: 0xff5a2a, defi: 'd_course' },
  { id: 'caniche', name: 'Madame Caniche', body: 'dog', x: -48, z: -2, loop: ring(POND.x, POND.z, 24.5, 22, 0.3), speed: 1.2, phase: 40, act: 'walk', moves: true, fur: 0xf4f0f4, cloth: 0xff6ab0, pet: { kind: 'dog', tint: 0xf4ecea, scale: 0.85, back: 1.9 } },
  { id: 'django', name: 'Django l\'accordéoniste', body: 'dog', x: -24, z: -48, yaw: Math.PI * 0.95, act: 'play', tool: 'accordion', busy: true, fur: 0x6a4a3a, cloth: 0x2a2a3a, defi: 'd_melodie' },
  { id: 'marius', name: 'Papi Marius', body: 'dog', x: 18, z: -80, yaw: 2.4, act: 'throw', tool: 'boule', ball: 0x9aa0a8, ballSize: 0.14, throwV: 4.5, fur: 0xd8d0c8, cloth: 0x3a8ae0, defi: 'd_petanque' },
  { id: 'fernand', name: 'Papi Fernand', body: 'dog', x: 32, z: -94, yaw: -0.6, act: 'throw', tool: 'boule', ball: 0x9aa0a8, ballSize: 0.14, throwV: 4.5, fur: 0x9a8070, cloth: 0xe8b020 },
  { id: 'zoe', name: 'Zoé', body: 'dog', x: -20, z: -151, yaw: 0.2, act: 'kite', tool: 'kite', busy: true, scale: 0.7, fur: 0xe0b080, cloth: 0x40c060, defi: 'd_cerfvolant' },
  { id: 'gaby', name: 'Gaby', body: 'dog', x: 78, z: 45, yaw: -0.5, act: 'jumpy', splash: true, scale: 0.7, fur: 0x8a5a3a, cloth: 0xffd040, defi: 'd_flaques' },
  { id: 'glacier', name: 'Pépé Glacier', body: 'dog', x: 21.5, z: 73, yaw: 2.6, act: 'scoop', tool: 'scoop', busy: true, fur: 0xf4ecdc, cloth: 0xffffff },
  { id: 'pistache', name: 'Pistache', body: 'dog', x: -31, z: 27, yaw: 0.8, act: 'blow', tool: 'wand', scale: 0.66, fur: 0xc8d8a0, cloth: 0xff6ab0, defi: 'd_bulles' },
  { id: 'noisette', name: 'Garde Noisette', body: 'dog', x: -126, z: -58, yaw: -2.0, act: 'look', tool: 'binoculars', busy: true, fur: 0xa0602a, cloth: 0x5a6a3a, defi: 'd_champignons' },
  { id: 'loup', name: 'Papi Loup', body: 'dog', x: -147, z: 60, yaw: -Math.PI / 2, act: 'fish', tool: 'searod', fur: 0x8a8a90, cloth: 0x2a4a7a },
];
for (const v of VILLAGERS) v.y = g(v.x, v.z);

const W = (who) => (text) => ({ who, text });
const M = W('Matcha'), A = W('Ainu');
export const LINES = {
  cane: {
    ask: [W('Maman Cane')('Coin ! Coin coin ! Oh, des chiens… S\'il vous plaît, ne mangez pas mes bébés !'), M('On ne mange personne, madame ! Qu\'est-ce qui se passe ?'),
      W('Maman Cane')('Mes cinq canetons sont partis se promener tout seuls dans le parc ! Touchez-les pour qu\'ils vous suivent, et ramenez-les dans le rond doré, près de moi.')],
    thanks: [W('Maman Cane')('Un, deux, trois, quatre, cinq ! Tout le monde est là ! Merci, merci ! Coin !')],
    talk: [[W('Maman Cane')('En file indienne, les enfants ! Et on ne traîne pas derrière !')], [W('Maman Cane')('Le pain, ce n\'est pas bon pour les canards. Les graines, oui !')]],
  },
  rosalie: {
    ask: [W('Mémé Rosalie')('Bonjour mes mignons ! Je viens tous les jours donner des graines aux canards.'),
      W('Mémé Rosalie')('Regardez : les poissons rouges sautent vers la rive ! Vous arrivez à en attraper cinq au vol ? Au signal doré ! Et on les remet à l\'eau, hein.')],
    thanks: [W('Mémé Rosalie')('Cinq poissons rouges ! Vous êtes plus rapides que mon chat. Plouf, ils sont tous retournés dans la mare.')],
    talk: [[W('Mémé Rosalie')('Les grenouilles chantent le soir. Croâ, croâ ! C\'est ma chorale.')], [W('Mémé Rosalie')('Si vous aboyez près de la mare, les canards s\'écartent. Ils sont un peu peureux.')]],
  },
  ballon: {
    ask: [W('Monsieur Ballon')('Ballons ! Ballons ! Oh non… Un coup de vent, et huit de mes ballons se sont envolés !'),
      W('Monsieur Ballon')('Ils flottent au-dessus de la pelouse, au sud. Attrapez-les avant la fin du chrono, au signal doré !')],
    thanks: [W('Monsieur Ballon')('Mes huit ballons ! Vous sautez drôlement haut. Tenez, des paillettes : c\'est la maison qui offre !')],
    talk: [[W('Monsieur Ballon')('Un ballon rouge, un ballon jaune, un ballon bleu… Lequel vous plaît ?')], [A('Je peux en avoir un ?'), W('Monsieur Ballon')('Avec des pattes de chien ? Il s\'envolerait tout de suite !')]],
  },
  lili: {
    ask: [W('Lili')('Snif… Mon frisbee est coincé dans l\'arbre ! Et mes autres frisbees sont tombés dans les buissons…'),
      W('Lili')('Secouez l\'arbre pour faire tomber le premier, trouvez les autres, et rapportez-les-moi. Au signal doré !')],
    thanks: [W('Lili')('Mes quatre frisbees ! Youpi ! On joue ensemble ? Attrapez !')],
    talk: [[W('Lili')('Un frisbee, ça vole comme une soucoupe volante. Fiiiiou !')], [W('Lili')('Mon papa dit que je lance trop fort. Moi je dis que l\'arbre est trop grand.')]],
  },
  leon: {
    ask: [W('Léon le jardinier')('Saperlipopette ! Des taupes ! Elles font des trous partout dans ma belle pelouse.'),
      W('Léon le jardinier')('Quand une taupe sort la tête, sautez dessus ou faites la toupie ! Huit fois, et elles iront creuser ailleurs.')],
    thanks: [W('Léon le jardinier')('Ma pelouse est sauvée ! Les taupes sont parties chez le voisin. Merci, les toutous.')],
    talk: [[W('Léon le jardinier')('Les massifs de fleurs, on peut les secouer un peu : les papillons adorent.')], [W('Léon le jardinier')('Un coup de râteau à gauche, un coup de râteau à droite… Le jardinage, c\'est de la danse !')]],
  },
  pirouette: {
    ask: [W('Pirouette')('On joue à chat perché ! Tu nous attrapes ?'), W('Câline')('Il faut toucher nous trois avant la fin du temps !'), W('Fripouille')('Mais on court super vite, hein !')],
    thanks: [W('Pirouette')('Tu nous as tous eus ! T\'es le champion du chat perché !')],
    talk: [[W('Pirouette')('On recommence ? Cette fois, je me cache derrière le buisson !')], [W('Pirouette')('Un, deux, trois, soleil ! … Ah non, c\'est un autre jeu.')]],
  },
  caline: { talk: [[W('Câline')('Moi, je fais des roulades dans l\'herbe. C\'est tout chatouilleux !')]] },
  fripouille: { talk: [[W('Fripouille')('Hi hi ! Tu m\'attraperas pas !')]] },
  papa: {
    ask: [W('Papa Bouledogue')('Ah ! Le voleur ! Un écureuil a chipé le sandwich de Bébé, en plein pique-nique !'),
      W('Papa Bouledogue')('Il court par là, sur la pelouse. Attrapez-le, au signal doré : il rendra le sandwich, promis.')],
    thanks: [W('Papa Bouledogue')('Le sandwich est sauvé ! Bébé est tout content. Bon… il est un peu écrasé, mais c\'est meilleur comme ça.')],
    talk: [[W('Papa Bouledogue')('Un pique-nique au soleil, avec du jambon… La vie est belle.')], [W('Bébé Bouledogue')('Areuh ! Toutou ! Areuh !')]],
  },
  bebe: { talk: [[W('Bébé Bouledogue')('Areuh ! Toutou !')], [W('Bébé Bouledogue')('Sandwich ! Miam !')]] },
  coach: {
    ask: [W('Coach Turbo')('Une, deux ! Une, deux ! Salut les sportifs ! Vous courez vite ?'),
      W('Coach Turbo')('Mon lévrier Fusée vous défie : du signal doré jusqu\'au drapeau à damier, sur le grand chemin du nord. Prêts ?')],
    thanks: [W('Coach Turbo')('Plus rapides que Fusée ! Incroyable ! Vous avez mangé des croquettes à réaction ?')],
    talk: [[W('Coach Turbo')('Un tour de la colline, deux tours de la colline… Je ne compte plus !')], [W('Coach Turbo')('L\'échauffement, c\'est important : on remue la queue, et hop !')]],
  },
  caniche: {
    talk: [[W('Madame Caniche')('Bonjour, bonjour ! Pompon et moi faisons le tour de la mare. Trois fois par jour !')], [W('Madame Caniche')('Pompon adore les caresses. Mais pas les flaques. Surtout pas les flaques.')],
      [W('Madame Caniche')('Vous avez vu les canetons ? Ils suivent leur maman en file indienne. C\'est trop mignon !')]],
  },
  django: {
    ask: [W('Django l\'accordéoniste')('Bonjour les amis ! Vous aimez la musique ? Écoutez les tuyaux musicaux, derrière moi…'),
      W('Django l\'accordéoniste')('Je vais jouer une petite mélodie. Refaites-la dans le même ordre, en touchant les tuyaux !')],
    thanks: [W('Django l\'accordéoniste')('Bravo ! Quelle oreille ! On devrait monter un orchestre : la Fanfare des Toutous !')],
    talk: [[W('Django l\'accordéoniste')('Tralalalère… L\'accordéon, ça respire comme un gros chat qui dort.')], [W('Django l\'accordéoniste')('Le soir, je joue au kiosque. Les canards dansent !')]],
  },
  marius: {
    ask: [W('Papi Marius')('Té ! Des chiens ! Vous savez jouer à la pétanque ?'), W('Fernand')('Il faut amener les trois boules près du cochonnet, dans le rond doré.'),
      W('Papi Marius')('Poussez-les avec le museau… ou tirez dedans d\'un coup de toupie ! Au signal doré, et pas de triche !')],
    thanks: [W('Papi Marius')('Les trois boules dans le rond ! Carreau ! Fernand, ces chiens jouent mieux que toi.'), W('Papi Fernand')('Hé ! C\'est le soleil qui me gênait !')],
    talk: [[W('Papi Marius')('Tu tires ou tu pointes ?')], [W('Papi Marius')('La pétanque, c\'est un sport. Surtout pour le bras qui tient la limonade.')]],
  },
  fernand: { talk: [[W('Papi Fernand')('Je vais pointer… doucement… Oh, elle a roulé trop loin.')], [W('Papi Fernand')('Marius triche. Je ne dis rien, mais il triche.')]] },
  zoe: {
    ask: [W('Zoé')('Regardez mon cerf-volant ! Il monte, il monte !'),
      W('Zoé')('Le vent a fait des anneaux dorés dans le ciel de la colline. Passez dedans, dans l\'ordre ! Sautez et planez, au signal doré !')],
    thanks: [W('Zoé')('Vous avez volé comme mon cerf-volant ! Encore plus haut, même !')],
    talk: [[W('Zoé')('Le secret, c\'est de courir face au vent. Et de ne jamais lâcher la ficelle !')], [W('Zoé')('Du haut de la colline, on voit la mer. Et les bateaux !')]],
  },
  gaby: {
    ask: [W('Gaby')('Splash ! Splash ! J\'ai mes bottes de pluie ! Tu viens sauter dans les flaques ?'),
      W('Gaby')('Il y a six flaques qui brillent tout autour. Saute dans toutes avant la fin du temps ! Au signal doré !')],
    thanks: [W('Gaby')('Toutes les flaques ! T\'es tout mouillé ! Moi aussi ! Hi hi !')],
    talk: [[W('Gaby')('Maman dit qu\'il faut garder les bottes propres. Moi je dis que les bottes, c\'est fait pour les flaques.')], [W('Gaby')('Tu as vu l\'arroseur ? On peut courir dedans ! Brrr, c\'est froid !')]],
  },
  glacier: {
    talk: [[W('Pépé Glacier')('Glaces ! Glaces ! Vanille, fraise, pistache… et croquette pour les toutous !')], [W('Pépé Glacier')('Faites sonner la clochette de mon chariot : ding ding !')],
      [M('Une glace à la croquette ?'), W('Pépé Glacier')('Ma spécialité ! Bon… elle n\'est pas encore inventée.')]],
  },
  pistache: {
    ask: [W('Pistache')('Regarde mes bulles ! Elles sont toutes rondes et toutes brillantes !'),
      W('Pistache')('Huit grosses bulles magiques flottent entre la fontaine et la mare. Attrape-les toutes, au signal doré ! Et appuie sur le gros bouton de la machine, pour voir…')],
    thanks: [W('Pistache')('Toutes les bulles magiques ! Pop, pop, pop ! Tu es le roi des bulles !')],
    talk: [[W('Pistache')('Si on souffle doucement, la bulle devient géante. Si on souffle fort… pfuit, plus de bulle.')], [W('Pistache')('La machine à bulles, c\'est la meilleure machine du monde.')]],
  },
  noisette: {
    ask: [W('Garde Noisette')('Chut… J\'observe les écureuils. Mais dites, vous avez vu les champignons géants du bois ?'),
      W('Garde Noisette')('On rebondit dessus comme sur un trampoline ! Il y en a six qui brillent : rebondissez sur tous, au signal doré !')],
    thanks: [W('Garde Noisette')('Six rebonds ! Les écureuils n\'en revenaient pas. Moi non plus, d\'ailleurs.')],
    talk: [[W('Garde Noisette')('Les écureuils cachent des noisettes partout. Ils en oublient la moitié !')], [W('Garde Noisette')('Les tas de feuilles, foncez dedans : il y a parfois des paillettes cachées.')]],
  },
  loup: {
    talk: [[W('Papi Loup')('Ça mord pas, aujourd\'hui. Les poissons font la sieste.')], [W('Papi Loup')('J\'ai vu un coffre, un jour, derrière la barque. Mais j\'avais la flemme d\'aller voir.')],
      [A('Vous pêchez quoi ?'), W('Papi Loup')('Des bottes, surtout. Et une fois, une baleine. Enfin… une très grosse sardine.')]],
  },
};

// ---------------------------------------------------------------------------
// Les défis éclair
// ---------------------------------------------------------------------------
const up = (x, z, h) => ({ x, z, y: g(x, z) + (h === undefined ? 1.1 : h) });
const ringAt = (x, z, h, yaw) => ({ x, z, y: g(x, z) + h, yaw: yaw || 0 });
const polar = (a, r) => [Math.round((POND.x + Math.cos(a) * r) * 10) / 10, Math.round((POND.z + Math.sin(a) * r) * 10) / 10];
const BALLOON_COLS = [0xe8402e, 0xffd040, 0x2a8ae0, 0x40c060, 0xff6ab0, 0xa070ff, 0xff8a2a, 0x40d0d0];

// la descente de la colline du belvédère, à travers les anneaux (on saute, on plane)
const kiteRings = [];
{
  const x0 = -24, z0 = -142, dx = -0.42, dz = 0.91;
  for (let i = 0; i < 6; i++) { const d = 4 + 7 * i, x = x0 + dx * d, z = z0 + dz * d; kiteRings.push(ringAt(Math.round(x * 10) / 10, Math.round(z * 10) / 10, i % 2 ? 3.0 : 1.7, Math.atan2(dx, dz))); }
}

export const DEFIS = [
  { id: 'd_canetons', type: 'herd', name: 'Les canetons perdus', hint: 'Touchez les 5 canetons et ramenez-les dans le rond doré, près de Maman Cane', x: -57, z: 23, critter: 'duckling', time: 120, say: 'Piou !',
    pen: { x: -62, z: 25, r: 3.4 }, chicks: [[-36, 20], [-98, 34], [-104, -30], [-40, -26], [-64, 50]] },
  { id: 'd_poissons', type: 'fish', name: 'Les poissons rouges', hint: 'Les poissons sautent vers la rive : attrapez-en 5 au vol !', x: -58, z: -25, critter: 'koi', time: 50, need: 5, toward: true, reach: 1.3, hole: 'ripple',
    holes: [polar(-1.95, 15), polar(-1.7, 15), polar(-1.45, 15), polar(-1.2, 15), polar(-0.95, 15.2)] },
  { id: 'd_ballons', type: 'coins', item: 'balloon', colors: BALLOON_COLS, name: 'Les ballons envolés', hint: 'Attrapez les 8 ballons de Monsieur Ballon !', x: 24, z: 104, time: 60,
    items: [up(-20, 124, 2.2), up(4, 132, 1.6), up(30, 122, 2.6), up(52, 132, 1.8), up(44, 110, 2.4), up(10, 116, 2.0), up(-6, 140, 2.5), up(70, 112, 1.7)] },
  { id: 'd_frisbee', type: 'herd', item: 'frisbee', colors: [0xff5a2a, 0x2a8ae0, 0x40c060, 0xffd040], name: 'Les frisbees de Lili', hint: 'Secouez l\'arbre, trouvez les frisbees et rapportez-les à Lili', x: 57, z: 118, time: 120,
    pen: { x: 62, z: 118, r: 3.2 }, chicks: [{ x: 67.5, z: 126, y: 0, stuck: 'fr_tree' }, [84, 140], [36, 140], [90, 106]] },
  { id: 'd_taupes', type: 'whack', name: 'Tape-taupe', hint: 'Les taupes sortent de la pelouse : sautez dessus, ou faites la toupie !', x: 77, z: -56, critter: 'mole', hole: 'molehill', time: 40, need: 8,
    holes: [[80, -63], [85, -62], [77, -67], [83, -68], [88, -66], [80, -72]] },
  { id: 'd_chat', type: 'tag', name: 'Chat perché', hint: 'Touchez Pirouette, Câline et Fripouille !', x: -13, z: 98, time: 40, leash: 15, speed: 6.0, kids: ['pirouette', 'caline', 'fripouille'] },
  { id: 'd_ecureuil', type: 'chase', name: 'Le voleur de sandwich', hint: 'Un écureuil a chipé le sandwich de Bébé : attrapez-le !', x: 32, z: 88, critter: 'thief', time: 45, leash: 16, speed: 7.0 },
  { id: 'd_course', type: 'race', name: 'La course du lévrier', hint: 'Fusée file vers le drapeau à damier, au bout du grand chemin : battez-le !', x: 4, z: -26, critter: 'greyhound', speed: 7.8,
    path: [[0, -28], [0, -50], [0, -78], [0, -100], [1, -118]] },
  { id: 'd_melodie', type: 'xylo', name: 'Les tuyaux musicaux', hint: 'Écoutez, puis faites sonner les tuyaux dans le même ordre', x: -28, z: -51, chimes: ['tu_1', 'tu_2', 'tu_3', 'tu_4', 'tu_5'], seq: [0, 2, 1, 4, 3], time: 90 },
  { id: 'd_petanque', type: 'goal', name: 'La partie de pétanque', hint: 'Amenez les 3 boules dans le rond doré, près du cochonnet (poussez, ou tirez d\'un coup de toupie)', x: 15, z: -84, time: 75,
    balls: ['bo_1', 'bo_2', 'bo_3'], pen: { x: 26, z: -88, r: 2.0 } },
  { id: 'd_cerfvolant', type: 'rings', name: 'Le vol du cerf-volant', hint: 'Passez dans les anneaux dorés, dans l\'ordre : sautez, et planez !', x: -26, z: -146, time: 35, rings: kiteRings },
  { id: 'd_flaques', type: 'hits', name: 'Les flaques de Gaby', hint: 'Sautez dans les 6 flaques qui brillent !', x: 74, z: 43, time: 40, props: ['fl_1', 'fl_2', 'fl_3', 'fl_4', 'fl_5', 'fl_6'] },
  { id: 'd_bulles', type: 'coins', item: 'bubble', name: 'Les bulles magiques', hint: 'Attrapez les 8 bulles magiques !', x: -27, z: 31, time: 45,
    items: [up(-22, 18, 1.8), up(-40, 14, 2.4), up(-48, 30, 1.6), up(-36, 40, 2.6), up(-20, 48, 1.9), up(-56, 20, 2.2), up(-30, 4, 2.0), up(-44, -4, 2.5)] },
  { id: 'd_champignons', type: 'pads', name: 'Les champignons rebondissants', hint: 'Rebondissez sur les 6 champignons qui brillent !', x: -131, z: -58, time: 40, pads: ['ch_1', 'ch_2', 'ch_3', 'ch_4', 'ch_5', 'ch_6'] },
];
for (const d of DEFIS) d.y = g(d.x, d.z);
// le frisbee coincé : dans le feuillage de l'arbuste
{ const f = DEFIS.find(d => d.id === 'd_frisbee').chicks[0]; f.y = g(f.x, f.z) + 2.7; }

// ---------------------------------------------------------------------------
// Objets posés à la main (temps forts)
// ---------------------------------------------------------------------------
const tubeCols = [0xe8402e, 0xff9a2a, 0xffd040, 0x40c060, 0x2a8ae0];
const PROPS = [
  // les tuyaux musicaux de Django (gamme pentatonique)
  ...[0, 1, 2, 3, 4].map(i => ({ id: 'tu_' + (i + 1), kind: 'tube', x: -32 + i * 3.4, z: -57 + Math.abs(i - 2) * 0.8, rot: 0, tint: tubeCols[i], note: [72, 74, 76, 79, 81][i], s: 1.15 - i * 0.07 })),
  // les champignons du bois
  ...[[-136, -52], [-142, -60], [-150, -54], [-151, -47], [-135, -36], [-128, -44]].map(([x, z], i) => ({ id: 'ch_' + (i + 1), kind: 'mushroom', x, z })),
  // les flaques de Gaby
  ...[[70, 38], [84, 36], [92, 46], [88, 58], [74, 56], [64, 48]].map(([x, z], i) => ({ id: 'fl_' + (i + 1), kind: 'puddle', x, z, rot: i * 1.3 })),
  // la pétanque : trois boules, le cochonnet
  { id: 'bo_1', kind: 'boule', x: 17, z: -92 }, { id: 'bo_2', kind: 'boule', x: 14, z: -88 }, { id: 'bo_3', kind: 'boule', x: 18, z: -84.5 },
  { id: 'jack', kind: 'jack', x: 26, z: -88 },
  // l'arbre au frisbee
  { id: 'fr_tree', kind: 'sapling', x: 67.5, z: 126, rot: 0.4 },
  // les buissons où sont tombés les frisbees
  { id: 'fr_b1', kind: 'bush', x: 86, z: 142 }, { id: 'fr_b2', kind: 'bush', x: 34, z: 142.5 }, { id: 'fr_b3', kind: 'bush', x: 92.5, z: 104.5 },
  // la machine à bulles de Pistache, le chariot de Pépé Glacier
  { id: 'bulles', kind: 'bubbler', x: -27, z: 23, rot: 0.6, effect: 'bubbles', gx: -27, gz: 23 },
  { id: 'glaces', kind: 'cart', x: 24.5, z: 75.5, rot: -0.5, note: 88 },
  // arroseurs et trampolines
  { id: 'ar_1', kind: 'sprinkler', x: 60, z: 93.5 }, { id: 'ar_2', kind: 'sprinkler', x: -66, z: 92 }, { id: 'ar_3', kind: 'sprinkler', x: 52, z: -62 },
  { id: 'tr_1', kind: 'trampoline', x: -22, z: 82 }, { id: 'tr_2', kind: 'trampoline', x: -64, z: 66 },
  // ballons de plage sur la grande pelouse du sud
  { id: 'bp_1', kind: 'beachball', x: 2, z: 120 }, { id: 'bp_2', kind: 'beachball', x: -40, z: 108, tint: 0xffffff }, { id: 'bp_3', kind: 'beachball', x: 66, z: 70 },
  // massifs de fleurs de Léon
  ...[[64, -44], [60, -56], [66, -68], [92, -54], [58, -68]].map(([x, z], i) => ({ id: 'mf_' + (i + 1), kind: 'flowers', x, z, rot: i })),
  // bains d'oiseaux
  { id: 'bo_bain1', kind: 'birdbath', x: -96, z: 104 }, { id: 'bo_bain2', kind: 'birdbath', x: 128, z: 82 },
];
for (const p of PROPS) p.y = g(p.x, p.z);

// Bêtes posées à la main
const FAUNA = [
  // sur la mare : la famille cane (en file), des colverts, des poissons rouges, des grenouilles
  { id: 'cane_mare', kind: 'ducks', x: polar(0.9, 9)[0], z: polar(0.9, 9)[1], rot: 2.3 },
  { id: 'colvert_1', kind: 'mallards', x: polar(2.8, 10)[0], z: polar(2.8, 10)[1] }, { id: 'colvert_2', kind: 'mallards', x: polar(-1.0, 12)[0], z: polar(-1.0, 12)[1] },
  { id: 'colvert_3', kind: 'mallards', x: polar(-2.5, 9)[0], z: polar(-2.5, 9)[1] },
  ...[0.3, 2.0, -2.2, 3.6, -0.6].map((a, i) => ({ id: 'koi_' + i, kind: 'koi', x: polar(a, 6 + i * 1.6)[0], z: polar(a, 6 + i * 1.6)[1] })),
  ...[0.15, 0.6, 1.25, 1.75, 2.3, 2.75, 3.3, 4.0, 4.55, 5.15].map((a, i) => ({ id: 'gren_' + i, kind: 'frog', x: polar(a, POND.r - 2.2 + (i % 2) * 0.6)[0], z: polar(a, POND.r - 2.2 + (i % 2) * 0.6)[1], rot: a + Math.PI })),
  // dans l'herbe, près de la mare : une deuxième famille, à pied
  { id: 'cane_herbe', kind: 'canes', x: -50, z: 30, rot: 1.0 },
  // les chiens du parc
  { id: 'chien_1', kind: 'dog', x: 30, z: 40 }, { id: 'chien_2', kind: 'dog', x: -30, z: -20 }, { id: 'chien_3', kind: 'dog', x: 60, z: 100 },
  // papillons autour des massifs de Léon, pigeons de l'entrée
  { id: 'pap_l1', kind: 'butterfly', x: 62, z: -50 }, { id: 'pap_l2', kind: 'bluefly', x: 92, z: -62 },
  { id: 'pig_e1', kind: 'pigeons', x: 14, z: 72 }, { id: 'pig_e2', kind: 'pigeons', x: -14, z: 64 },
];

// Cachettes (coffres)
const SECRETS = [
  { id: 's_barque', x: S.ROWBOAT.x + 2.2, z: S.ROWBOAT.z + 3.6, rot: 0.6, found: 'Caché derrière la vieille barque de la crique !' },
  { id: 's_bois', x: -158, z: -30, rot: 1.2, found: 'Au fond du Bois des Écureuils, sous les feuilles !' },
  { id: 's_rocher', x: S.RABBIT_ROCK.x + 9, z: S.RABBIT_ROCK.z - 6, rot: -1.6, found: 'Derrière le Rocher aux Lapins : ils gardaient bien le secret !' },
  { id: 's_belvedere', x: 26, z: -162, rot: 2.6, found: 'Au bout de la colline du belvédère, face à la mer !' },
  { id: 's_cerisiers', x: 127.4, z: 112.2, rot: -0.8, found: 'Sous les pétales, au bout du verger de cerisiers !' },
  { id: 's_labyrinthe', x: S.MAZE_INFO.ends[6].x, z: S.MAZE_INFO.ends[6].z, rot: 0.8, found: 'Au fond d\'une impasse du labyrinthe fleuri !' },
];
for (const s of SECRETS) s.y = g(s.x, s.z);

// Traînées de paillettes (vers les cachettes, au-dessus des trampolines…)
const line = (a, b, n, h) => Array.from({ length: n }, (_, i) => { const k = n === 1 ? 0.5 : i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: g(x, z) + (h || 1.0) }; });
const arc = (a, b, n, top) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; return { x, z, y: Math.max(g(x, z) + 1, g(a[0], a[1]) + 1 + Math.sin(k * Math.PI) * top) }; });
const circle = (cx, cz, r, n, h) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return { x, z, y: g(x, z) + (h || 1) }; });
/** Traînée dans les allées du labyrinthe : de l'entrée jusqu'à une case (parcours en largeur). */
function mazeTrail(to) {
  const I = S.MAZE_INFO, N = I.N, id = (c, r) => c + ',' + r, key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const cell = (p) => [clamp(Math.floor((p.x - I.x0) / I.C), 0, N - 1), clamp(Math.floor((p.z - I.z0) / I.C), 0, N - 1)];
  const start = [I.mid, N - 1], goal = cell(to), prev = new Map([[id(...start), null]]), q = [start];
  while (q.length) { const [c, r] = q.shift(); for (const [a, b] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) { if (a < 0 || b < 0 || a >= N || b >= N || prev.has(id(a, b)) || !I.open.has(key(id(c, r), id(a, b)))) continue; prev.set(id(a, b), [c, r]); q.push([a, b]); } }
  const cells = []; for (let k = goal; k; k = prev.get(id(...k))) cells.unshift(k);
  const pts = [{ x: I.entrance.x, z: I.entrance.z }];
  for (const [c, r] of cells) { const p = I.cellAt(c, r); pts.push({ x: p.x, z: p.z }); }
  return pts.map(p => ({ x: p.x, z: p.z, y: g(p.x, p.z) + 1.0 }));
}
const TRAILS = [
  { id: 't_barque', pts: line([-140, 52], [S.ROWBOAT.x + 4, S.ROWBOAT.z + 4.5], 6), say: 'Des traces dans le sable…' },
  { id: 't_bois', pts: line([-140, -32], [-155, -31], 6) },
  { id: 't_rocher', pts: line([150, -12], [S.RABBIT_ROCK.x + 8, S.RABBIT_ROCK.z - 8], 5) },
  { id: 't_belvedere', pts: line([10, -150], [24, -160], 6) },
  { id: 't_cerisiers', pts: line([108, 90], [128, 112], 6) },
  { id: 't_labyrinthe', pts: mazeTrail(S.MAZE_INFO.ends[6]) },
  { id: 't_tramp1', pts: arc([-22, 82], [-17, 88], 6, 4.5), say: 'Joli saut !' },
  { id: 't_tramp2', pts: arc([-64, 66], [-59, 72], 6, 4.5), say: 'Joli saut !' },
  { id: 't_fontaine', pts: circle(S.FOUNTAIN.x, S.FOUNTAIN.z, 5.5, 8, 1.0) },
  { id: 't_chene', pts: circle(0, 0, 10, 10, 1.0) },
  { id: 't_ile', pts: line([S.JETTY.x1 - 1.5, S.JETTY.z], [S.ISLET.x + 3.5, S.ISLET.z + 1], 5, 0.9), say: 'Au ras de l\'eau !' },
  { id: 't_kiosque', pts: circle(S.KIOSK.x, S.KIOSK.z, 7.5, 8, 1.0) },
];
for (const t of TRAILS) for (const p of t.pts) if (p.y < S.WATER_Y + 0.9) p.y = S.WATER_Y + 0.9;

// ---------------------------------------------------------------------------
// Palette : bêtes et objets du parc
// ---------------------------------------------------------------------------
export const PALETTE = {
  fauna: {
    ducks: { model: 'duck', ai: 'swim', water: true, group: 5, line: true, gap: 0.75, young: 'duckling', home: 9, flee: 4, sound: 'quack', colors: { body: 0x9a7a58, head: 0x8a6a48, breast: 0xa88a68, wing: 0x7a5a3a, spec: 0x3a5ad0 }, scale: 1.1 },
    mallards: { model: 'duck', ai: 'swim', water: true, group: 2, home: 10, flee: 4.5, sound: 'quack', colors: { body: 0xb8b0a4, head: 0x1e6a3a, ring: 0xffffff, breast: 0x7a4a30, wing: 0x8a8a90, spec: 0x2a4ad0 }, scale: 1.15 },
    canes: { model: 'duck', ai: 'walk', group: 4, line: true, gap: 0.7, young: 'duckling', home: 10, speed: 0.9, run: 3.5, flee: 3, shy: true, sound: 'quack', say: ['Coin !'], colors: { body: 0xf4f2ec, head: 0xf4f2ec, breast: 0xffffff, wing: 0xe8e4dc, bill: 0xf0a020 }, scale: 1.0 },
    duckling: { model: 'duckling', ai: 'none', sound: 'peep', colors: { fur: 0xffe060 }, scale: 1.25 },
    koi: { model: 'fish', ai: 'jump', water: true, hole: 'lilypad', colors: { fur: 0xff7a2a } },
    frog: { model: 'frog', ai: 'hop', home: 3.5, flee: 3, sound: 'croak', scale: 1.2 },
    pigeons: { model: 'bird', ai: 'flock', group: 7, scale: 1.9, flee: 5, sound: 'coo', colors: { back: 0x8a909c, breast: 0xa898a8, cap: 0x5a6274 } },
    robins: { model: 'bird', ai: 'flock', group: 4, scale: 1.5, flee: 5.5, sound: 'chirp', colors: { back: 0x8a6a4a, breast: 0xe8603a, cap: 0x6a5038 } },
    gulls: { model: 'bird', ai: 'flock', group: 4, scale: 2.4, flee: 6, sound: 'chirp', colors: { back: 0xb8c0c8, breast: 0xf8f8f8, cap: 0xf4f4f4 } },
    squirrel: { model: 'squirrel', ai: 'wander', scale: 1.5, hopper: true, flee: 5, run: 7, speed: 2, home: 7, sound: 'squeak', say: ['Tchik !'] },
    bunny: { model: 'hare', ai: 'wander', group: 2, scale: 1.1, tints: [0xa08060, 0xc8b098, 0x8a7a6a, 0xf0e8e0], hopper: true, flee: 6, run: 8, speed: 1.4, home: 9, sound: 'squeak', say: ['Hop !'] },
    hedgehog: { model: 'hedgehog', ai: 'wander', curl: true, scale: 1.3, flee: 2.6, speed: 0.6, home: 6, sound: 'sniff', say: ['Snif snif !'] },
    butterfly: { model: 'butterfly', ai: 'hover', group: 2, glow: false, alt: 0.9, bob: 0.4, range: 2.6, scale: 2.6, colors: { wing: 0xffa020, spots: 0x2a1a10 } },
    bluefly: { model: 'butterfly', ai: 'hover', group: 2, glow: false, alt: 1.1, bob: 0.5, range: 3.2, scale: 2.4, colors: { wing: 0x4a8af0, spots: 0x10183a } },
    dog: { model: 'puppy', ai: 'wander', pet: true, shy: false, playful: true, hopper: false, speed: 1.4, run: 7, home: 10, sound: 'woof', say: ['Ouaf !', 'Wouf wouf !', 'Snif snif…'], follow: 18, scale: 1.55, tints: [0xc89a6a, 0x3a3030, 0xf4ecdc, 0x8a5a3a, 0xd8b890] },
    greyhound: { model: 'puppy', ai: 'none', hopper: false, scale: 1.7, tints: [0xb8b0a8], extra: 1 },
    thief: { model: 'squirrel', ai: 'none', hopper: true, scale: 2.2, extra: 1 },
    mole: { model: 'marmot', ai: 'none', scale: 0.9, colors: { fur: 0x3a3238, belly: 0x5a5058 } },
  },
  props: {
    bush: { act: 'shake', drop: 2, solid: 0.8, tint: true },
    sapling: { act: 'shake', drop: 2, solid: 0.35, tint: true },
    flowers: { act: 'shake', drop: 1, r: 1.2 },
    leafpile: { act: 'break', drop: 2, chance: 0.7, respawn: 40, color: 0xd8802a },
    puddle: { act: 'splash', drop: 1, r: 1.4, top: 1.0 },
    sprinkler: { act: 'splash', spray: true, r: 2.6, top: 2.5, drop: 1 },
    birdbath: { act: 'splash', r: 1.3, top: 2.6, drop: 2 },
    mushroom: { act: 'bounce', power: 18, r: 1.25 },
    trampoline: { act: 'bounce', power: 19, r: 1.25 },
    beachball: { act: 'push', r0: 0.7, grow: false, kick: 11, friction: 1.1, tint: true },
    boule: { act: 'push', r0: 0.3, grow: false, kick: 9, friction: 1.8 },
    tube: { act: 'chime', tint: true },
    cart: { act: 'chime', solid: 0.8 },
    bubbler: { act: 'press', r: 0.7 },
    jack: {},
    balloon: { tint: true },
    frisbee: { tint: true },
  },
};

// ---------------------------------------------------------------------------
// Où rien ne doit être posé (portails, quêtes, manèges, voie du train…)
// ---------------------------------------------------------------------------
const KEEP = [
  [S.npcs.mamie.x, S.npcs.mamie.z, 6], [S.START.x, S.START.z, 6], [S.KENNEL.x, S.KENNEL.z, 3], [S.npcs.gaston.x, S.npcs.gaston.z, 4], [S.npcs.puppy.x, S.npcs.puppy.z, 4],
  ...S.CHECKPOINTS.map(c => [c.x, c.z, 4]), ...S.signs.map(s => [s.x, s.z, 2.5]), ...S.PORTALS.map(p => [p.x, p.z, 3.5]), ...S.crates.map(c => [c.x, c.z, 2.5]),
  ...S.LANTERNS.map(l => [l.x, l.z, 3.5]), ...S.CLUES.map(c => [c.x, c.z, 3.5]), ...S.balls.map(b => [b.x, b.z, 3.5]), ...S.medals.map(m => [m.x, m.z, 3]), ...S.cats.map(c => [c.x, c.z, 3]),
  [S.FOUNTAIN.x, S.FOUNTAIN.z, S.FOUNTAIN.r + 2.5], [S.PEDESTAL.x, S.PEDESTAL.z, 3], [S.TELESCOPE.x, S.TELESCOPE.z, 3], [S.DIG.x, S.DIG.z, 3],
  ...S.STATIONS.map(s => [s.x, s.z, 6]), ...S.BOATS.map(b => [b.x, b.z, 4]),
  ...DEFIS.map(d => [d.x, d.z, 3.5]), ...VILLAGERS.filter(v => !v.loop).map(v => [v.x, v.z, 2.5]), ...SECRETS.map(s => [s.x, s.z, 3]),
];
// les grands lieux : on n'y pose pas d'objet (on y joue)
const SPOTS_NO_PROPS = [
  [0, 0, 8], [S.KIOSK.x, S.KIOSK.z, S.KIOSK.r + 3.5], [S.CAROUSEL.x, S.CAROUSEL.z, S.CAROUSEL.r + 3], [S.SLIDE.x, S.SLIDE.z, 6], [S.SWINGS.x, S.SWINGS.z, 5], [S.SANDPIT.x, S.SANDPIT.z, S.SANDPIT.r + 1.5],
  [S.PICNIC.x, S.PICNIC.z, 10], [S.TREEHOUSE.x, S.TREEHOUSE.z, 6], [S.RABBIT_ROCK.x - 2, S.RABBIT_ROCK.z, 9], [S.COVE_ROCK.x, S.COVE_ROCK.z, 4], [S.ROWBOAT.x, S.ROWBOAT.z, 4],
  [S.GARDEN.x, S.GARDEN.z, S.GARDEN.r + 2.5], [S.LOOKOUT.x, S.LOOKOUT.z, 9], [S.PODIUM.x, S.PODIUM.z, 4], [S.WOODS.x + 3, S.WOODS.z + 3, 4],
  [S.PLAYGROUND.x - 2, S.PLAYGROUND.z + 12, 3],
];
const GARDEN_GAP = { x: S.GARDEN.x + Math.cos(S.GARDEN_GAP.a) * (S.GARDEN.r + 4), z: S.GARDEN.z + Math.sin(S.GARDEN_GAP.a) * (S.GARDEN.r + 4) };
const near = (list, x, z) => list.some(([kx, kz, r]) => Math.abs(kx - x) < r && Math.abs(kz - z) < r && Math.hypot(kx - x, kz - z) < r);
const inAgility = (x, z, m) => Math.abs(x - S.AGILITY.x) < S.AGILITY.hw + m && Math.abs(z - S.AGILITY.z) < S.AGILITY.hd + m;
// les chemins de quête des défis (course, anneaux) : rien de solide dessus
const RACE = DEFIS.filter(d => d.type === 'race').map(d => d.path);
export function avoid(x, z, type, kind) {
  if (near(KEEP, x, z)) return true;
  if (S.near(x, z, 2).some(c => !c.off && c.kind !== 'tree' && S.inside(c, x, z, 1.2))) return true;
  if (type === 'props' || type === 'villagers') {
    if (S.bones.some(b => Math.abs(b.x - x) < 1.6 && Math.abs(b.z - z) < 1.6)) return true;
    if (near(SPOTS_NO_PROPS, x, z)) return true;
    if (inAgility(x, z, 3) || inMaze(x, z, 3)) return true;
    if (S.nearTrack(x, z).d < 4.5) return true;
    if (pathD(x, z) < 4.4) return true;
    if (treeAt(x, z, 1.8)) return true;
    if (Math.hypot(x - GARDEN_GAP.x, z - GARDEN_GAP.z) < 6) return true;
    if (RACE.some(p => p.some((q, i) => i && segD(x, z, p[i - 1][0], p[i - 1][1], q[0], q[1]) < 3))) return true;
    if (Math.abs(x) < 18 && z > 30 && z < 50) return true;   // les portails et le départ
    if (g(x, z) < 0.6) return true;                            // pas au ras de l'eau
  }
  return false;
}

/** Le « milieu » d'un point : bois, bord de mare, plage, chemins… */
function info(x, z) {
  const forest = TG.within(x, z, 12).length;
  const h = g(x, z), r = Math.hypot(x, z);
  return { forest, h, beach: r > 150 || h < 1.1, pond: Math.hypot(x - POND.x, z - POND.z) < POND.r + 16, path: pathD(x, z) < 9, flat: slope(x, z) < 0.25, woods: Math.hypot(x - S.WOODS.x, (z - S.WOODS.z) / 1.3) < 34 };
}

export const SPEC = {
  seed: 1001, extent: 172, spacing: 12.5, cover: 9, grid: 3,
  walkable, ground: g, info, avoid,
  highlights: { fauna: FAUNA, props: PROPS, villagers: VILLAGERS, defis: DEFIS, secrets: SECRETS, trails: TRAILS },
  fill: [
    { type: 'fauna', kind: 'pigeons', w: 2.2, min: 22, when: (x, z, i) => i.path && !i.beach },
    { type: 'fauna', kind: 'robins', w: 1.8, min: 22, when: (x, z, i) => i.forest >= 1 && !i.beach },
    { type: 'fauna', kind: 'gulls', w: 3, min: 22, when: (x, z, i) => i.beach },
    { type: 'fauna', kind: 'squirrel', w: 2.2, min: 14, when: (x, z, i) => i.forest >= 1 && !i.beach },
    { type: 'fauna', kind: 'bunny', w: 1.6, min: 22, when: (x, z, i) => i.forest < 3 && !i.path },
    { type: 'fauna', kind: 'hedgehog', w: 1.0, min: 22, when: (x, z, i) => (i.forest >= 1 || i.woods) && !i.beach },
    { type: 'fauna', kind: 'butterfly', w: 1.3, min: 18, when: (x, z, i) => !i.beach },
    { type: 'fauna', kind: 'bluefly', w: 0.8, min: 22, when: (x, z, i) => !i.beach },
    { type: 'fauna', kind: 'dog', w: 0.8, min: 42, when: (x, z, i) => i.flat && !i.beach },
    { type: 'fauna', kind: 'canes', w: 0.6, min: 70, when: (x, z, i) => i.pond },
    { type: 'props', kind: 'bush', w: 2.8, min: 10, when: (x, z, i) => !i.beach },
    { type: 'props', kind: 'flowers', w: 1.6, min: 14, when: (x, z, i) => !i.beach && i.forest < 4 && i.flat },
    { type: 'props', kind: 'sapling', w: 1.8, min: 14, when: (x, z, i) => !i.beach && i.forest < 3 },
    { type: 'props', kind: 'leafpile', w: 1.6, min: 12, when: (x, z, i) => i.forest >= 1 || i.woods },
    { type: 'props', kind: 'mushroom', w: 1.2, min: 22, when: (x, z, i) => i.woods || i.forest >= 4 },
    { type: 'props', kind: 'puddle', w: 0.9, min: 26, when: (x, z, i) => !i.beach && i.flat },
    { type: 'props', kind: 'birdbath', w: 0.4, min: 50, when: (x, z, i) => !i.beach && i.flat },
    { type: 'props', kind: 'beachball', w: 0.7, min: 45, when: (x, z, i) => i.beach && i.flat },
    { type: 'fauna', kind: 'butterfly', w: 0.4, min: 12 },
  ],
  /** Couleurs variées des ballons de plage. */
  place(e) {
    if (e.kind === 'beachball') e.tint = [0xffffff, 0xfff0d0, 0xe0f0ff][Math.floor(e.rot * 10) % 3];
    // feuillages : des verts un peu différents (comme les arbres du parc), et parfois en fleurs
    if (e.kind === 'bush' || e.kind === 'sapling') e.tint = [0xffffff, 0xe8f4d8, 0xd8ecc8, 0xfff4e0, 0xf0ffe8][Math.floor(e.rot * 10) % 5];
    if (e.kind === 'flowers') e.rot = Math.round(e.rot * 10) / 10;
  },
};

export const PLAN = planLife(SPEC);
export const density = (opts) => densityProbe(PLAN, Object.assign({ walkable, extent: 172 }, opts || {}));
