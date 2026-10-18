/*
 * Matcha & Ainu — les Fleurs Merveille (idée « Super Mario Bros. Wonder »).
 *
 * Une Fleur Merveille se cache dans chacun des 8 mondes : une fleur qui brille
 * doucement et fredonne une petite mélodie quand on s'approche. On la touche :
 * pendant 30 secondes, le monde se transforme (chaque monde a sa merveille), et
 * des « graines merveille » apparaissent tout autour. Ramasser la dernière graine,
 * c'est trouver la Fleur Merveille du monde (compteur n/8 dans la pause et l'album).
 * Ensuite tout redevient comme avant, dans une pluie d'étincelles. La fleur repousse :
 * on peut rejouer la merveille autant qu'on veut (elle ne compte qu'une fois).
 *
 * Données seules (pas de Three.js) : lues par le jeu (wonder.js), l'album (main.js)
 * et les tests (test/wonder.test.mjs).
 *
 * Chaque fleur : lv (monde), kind (la merveille, voir wonderfx.js), x, z, y (le sol ou
 * la plate-forme sous la fleur, à peu près : le jeu la recale), name (titre de la
 * merveille), sub (ce qui se passe, en une phrase), where (indice pour la pause),
 * hint (couleur dominante, pour l'album).
 */

/** Durée de la merveille (secondes) et nombre de graines à ramasser pendant ce temps. */
export const WONDER_TIME = 30;
export const SEEDS = 8;

export const WONDERS = [
  { lv: 1, kind: 'choir', x: -118.6, z: 98.2, y: 2.4, name: 'Le Grand Chœur des Fleurs', sub: 'Les fleurs chantent et les arbres dansent !', where: 'tout près du jardin aux haies rondes', hint: '#ff7ab8' },
  { lv: 2, kind: 'mushrooms', x: -96.5, z: 122.5, y: 2.4, name: 'Les Champignons Lumineux', sub: 'Rebondis jusqu\'aux étoiles avec les lucioles !', where: 'près du cercle des fées', hint: '#5ae0ff' },
  { lv: 3, kind: 'bubbles', x: 40, z: 40, y: 2, name: 'La Ville en Bulles', sub: 'Les chiens flottent dans des bulles de savon !', where: 'au parc de la ville', hint: '#9ae8ff' },
  { lv: 4, kind: 'rainbows', x: -30, z: 3, y: 18.6, name: 'Les Toboggans Arc-en-ciel', sub: 'Glisse sur les arcs-en-ciel d\'une île à l\'autre !', where: 'au Jardin Suspendu', hint: '#ffb03a' },
  { lv: 5, kind: 'candy', x: 44, z: 136, y: 3, name: 'Le Pays des Bonbons', sub: 'La neige devient sucre et les bonshommes, guimauves !', where: 'pas loin du jardin du bonhomme de neige', hint: '#ff9ad0' },
  { lv: 6, kind: 'fish', x: 0, z: 20, y: 1, name: 'Les Poissons Volants', sub: 'Les poissons nagent dans le ciel !', where: 'sur le sable, au bord de la mer', hint: '#5ad0ff' },
  { lv: 7, kind: 'parade', x: 115, z: 15, y: 2.4, name: 'La Grande Parade', sub: 'Les animaux se mettent debout et défilent !', where: 'au milieu du verger', hint: '#ffd23a' },
  { lv: 8, kind: 'portraits', x: 0, z: -24, y: 2.4, name: 'Les Tableaux Vivants', sub: 'Les chats des tableaux se réveillent et font coucou !', where: 'dans une grande salle aux tableaux', hint: '#c88aff' },
];

export const wonderOf = (lv) => WONDERS.find(w => w.lv === lv) || null;

/** La Fleur Merveille de ce monde a-t-elle été trouvée ? (sauvegarde du monde : save.wonder) */
export const foundIn = (save) => !!(save && save.wonder && save.wonder.found);
