/*
 * Matcha & Ainu — les chiots perdus (idée « Astro Bot ») : 3 chiots cachés dans
 * chacun des 8 mondes. Une fois retrouvés, ils vont vivre au Parc des Toutous,
 * près de la niche de Mamie.
 *
 * Données seules (pas de Three.js) : lues par le jeu (puppies.js), par l'album
 * (main.js) et par les tests (test/puppies.test.mjs).
 *
 * Chaque chiot : id, lv (monde), name, breed, où il se cache (x, z, et y = le sol
 * ou la plate-forme sous ses pattes, à peu près : le jeu le recale), yaw (là où il
 * regarde), where (indice pour la pause), look (sa race : couleurs, oreilles,
 * queue, proportions, accessoires), found (sa réplique quand on le retrouve),
 * hub (sa petite phrase au parc).
 */

/** Rangé dans le tiroir du joueur (profiles.js : « dogfight.aventure. » est par joueur). */
export const PUPS_KEY = 'dogfight.aventure.chiots';

export const PUPS = [
  // ---------------------------------------------------------------- 1. le Parc des Toutous
  {
    id: 'l1_pistou', lv: 1, name: 'Pistou', breed: 'beagle', x: 64.5, z: -1, y: 2.5, yaw: -Math.PI / 2,
    where: 'dans le tunnel du terrain d\'agility',
    look: { pattern: 'tricolor', fur: 0xc8823a, b2: 0x2a2024, belly: 0xfaf4ea, ears: 'drop', earLen: 1.25, tail: 'wag', tailTip: 0xfaf4ea, muzzle: 1.1, collar: 0x3a7ae0 },
    found: { who: 'Pistou', text: 'Snif, snif… Ça sent les copains ! Ouaf, merci de m\'avoir trouvé !' },
    hub: { who: 'Pistou', text: 'Snif, snif ! Je renifle tout le parc. C\'est mon métier !' },
  },
  {
    id: 'l1_cannelle', lv: 1, name: 'Cannelle', breed: 'golden retriever', x: 3.02, z: -3.2, y: 18.37, yaw: 2.4,
    where: 'sur une branche du Grand Chêne',
    look: { pattern: 'solid', fur: 0xe8b468, belly: 0xf8e2b0, ears: 'drop', earLen: 1.05, tail: 'plume', fluff: 0.6, tongue: true, bandana: 0xe0403a },
    found: { who: 'Cannelle', text: 'Je suis montée voir la lune… et après, je ne savais plus descendre !' },
    hub: { who: 'Cannelle', text: 'D\'ici, on ne voit pas la lune. Mais on vous voit, vous !' },
  },
  {
    id: 'l1_mirabelle', lv: 1, name: 'Mirabelle', breed: 'cavalier king charles', x: -159.2, z: 53.2, y: 0.3, yaw: 0.6,
    where: 'dans la barque de la crique',
    look: { pattern: 'blenheim', fur: 0xfbf6ee, b2: 0xb8642a, belly: 0xffffff, ears: 'long', earLen: 1.35, earC: 0xa8541e, tail: 'plume', fluff: 0.5, muzzle: 0.85, bow: 0xff7ab0 },
    found: { who: 'Mirabelle', text: 'J\'attendais que la barque m\'emmène en voyage… Je préfère rentrer avec vous !' },
    hub: { who: 'Mirabelle', text: 'Un jour, je serai capitaine. En attendant, je fais la sieste.' },
  },
  // ---------------------------------------------------------------- 2. la Forêt des Moustaches
  {
    id: 'l2_moka', lv: 2, name: 'Moka', breed: 'teckel', x: 42.3, z: 64.4, y: 2.43, yaw: 1.33,
    where: 'dans un tronc creux, au bord du sentier',
    look: { pattern: 'points', fur: 0x5a3020, b2: 0xc07a42, belly: 0x9a5a34, ears: 'drop', earLen: 1.2, tail: 'whip', body: 2.1, leg: 0.5, muzzle: 1.35, collar: 0x40b060 },
    found: { who: 'Moka', text: 'Je suis entré dans le tronc… et j\'étais trop long pour faire demi-tour !' },
    hub: { who: 'Moka', text: 'Je suis le plus long des chiots. C\'est pratique pour les câlins !' },
  },
  {
    id: 'l2_paprika', lv: 2, name: 'Paprika', breed: 'setter irlandais', x: -99.62, z: -87.64, y: 2.3, yaw: 0.5,
    where: 'derrière la cascade du Plateau Moussu',
    look: { pattern: 'solid', fur: 0xa8401c, belly: 0xc8602e, ears: 'long', earLen: 1.3, tail: 'plume', fluff: 0.55, leg: 1.25, muzzle: 1.3, scale: 1.05 },
    found: { who: 'Paprika', text: 'Derrière la cascade, c\'est ma cachette secrète ! Mais j\'avais un peu froid…' },
    hub: { who: 'Paprika', text: 'On fait la course ? Le premier arrivé à la gare a gagné !' },
  },
  {
    id: 'l2_banjo', lv: 2, name: 'Banjo', breed: 'basset hound', x: -76.0, z: 108.4, y: 7.45, yaw: -2.0,
    where: 'sur le chapeau d\'une maison-champignon',
    look: { pattern: 'tricolor', fur: 0xb86a30, b2: 0x3a2a24, belly: 0xfaf2e6, ears: 'long', earLen: 1.7, tail: 'wag', tailTip: 0xfaf2e6, body: 1.7, leg: 0.55, chunky: 1.1, muzzle: 1.2, droopy: true },
    found: { who: 'Banjo', text: 'Ouaaah… Je me suis endormi sur le champignon. Il était tout moelleux.' },
    hub: { who: 'Banjo', text: 'Mes oreilles traînent par terre. Comme ça, elles ne s\'envolent pas.' },
  },
  // ---------------------------------------------------------------- 3. Port-Croquette
  {
    id: 'l3_pixel', lv: 3, name: 'Pixel', breed: 'border collie', x: -71.6, z: -29.4, y: 34, yaw: 0.4,
    where: 'sur le toit d\'un grand immeuble (prends l\'ascenseur !)',
    look: { pattern: 'tuxedo', fur: 0x24222a, belly: 0xfaf8f4, ears: 'fold', tail: 'plume', fluff: 0.45, muzzle: 1.2, collar: 0xff6a2a },
    found: { who: 'Pixel', text: 'J\'ai pris l\'ascenseur tout seul ! Mais je n\'ai pas trouvé le bouton pour redescendre.' },
    hub: { who: 'Pixel', text: 'J\'ai compté les chiots du parc. On est de plus en plus nombreux !' },
  },
  {
    id: 'l3_nougat', lv: 3, name: 'Nougat', breed: 'bouledogue français', x: -168.3, z: 126.4, y: 12.4, yaw: 2.6,
    where: 'tout en haut des conteneurs des docks',
    look: { pattern: 'mask', fur: 0xd8a868, b2: 0x3a2c26, belly: 0xf2dcb8, ears: 'bat', tail: 'stub', muzzle: 0.55, chunky: 1.2, leg: 0.8, collar: 0xe03a5a },
    found: { who: 'Nougat', text: 'Ça sentait le poisson grillé, alors j\'ai grimpé… grimpé… grimpé !' },
    hub: { who: 'Nougat', text: 'Tu n\'aurais pas un biscuit ? Un tout petit ?' },
  },
  {
    id: 'l3_bretzel', lv: 3, name: 'Bretzel', breed: 'boxer', x: 110.0, z: 118.0, y: 6.07, yaw: -2.6,
    where: 'en haut du poste de maître-nageur de la plage',
    look: { pattern: 'mask', fur: 0xc07a3a, b2: 0x2a2220, belly: 0xfaf4ec, ears: 'fold', tail: 'stub', muzzle: 0.75, leg: 1.15, tongue: true, collar: 0x2ab0e0 },
    found: { who: 'Bretzel', text: 'Je surveillais la plage comme un vrai maître-nageur ! Mais j\'ai le vertige.' },
    hub: { who: 'Bretzel', text: 'Hop ! Hop ! Je fais des bonds pour garder la forme !' },
  },
  // ---------------------------------------------------------------- 4. les Îles du Ciel
  {
    id: 'l4_bulle', lv: 4, name: 'Bulle', breed: 'caniche abricot', x: -33.1, z: 8.2, y: 23.2, yaw: 2.2,
    where: 'sur un petit nuage, au-dessus du Jardin Suspendu',
    look: { pattern: 'solid', fur: 0xe8a070, belly: 0xf4c098, ears: 'puff', tail: 'pompom', fluff: 1, puffs: true, muzzle: 1.1, leg: 1.1, bow: 0xff5aa0 },
    found: { who: 'Bulle', text: 'Un nuage tout doux, tout rose… J\'ai voulu le coiffer, et il m\'a emportée !' },
    hub: { who: 'Bulle', text: 'Regarde ma coiffure ! Même le vent n\'a pas réussi à la défaire.' },
  },
  {
    id: 'l4_flan', lv: 4, name: 'Flan', breed: 'bichon', x: 13.4, z: 113.6, y: 5.8, yaw: -0.6,
    where: 'dans le nid caché sous l\'Île du Départ',
    look: { pattern: 'solid', fur: 0xfcfaf6, belly: 0xffffff, ears: 'puff', tail: 'curl', fluff: 1, puffs: true, muzzle: 0.75, scale: 0.9, collar: 0x8ad0ff },
    found: { who: 'Flan', text: 'Chut… Je me cachais sous l\'île. Là-haut, tout était trop grand pour moi.' },
    hub: { who: 'Flan', text: 'Ici, je n\'ai plus peur. Il y a toujours un copain pour jouer.' },
  },
  {
    id: 'l4_mochi', lv: 4, name: 'Mochi', breed: 'corgi', x: -90.4, z: -162.2, y: 41.3, yaw: 0.8,
    where: 'sur le Balcon d\'Or, tout au bout du ciel',
    look: { pattern: 'urajiro', fur: 0xd8843a, belly: 0xfaf4ea, ears: 'prick', earLen: 1.35, tail: 'stub', body: 1.4, leg: 0.5, chunky: 1.1, muzzle: 1.1, collar: 0xffd23a },
    found: { who: 'Mochi', text: 'Mes pattes sont courtes, mais j\'ai sauté super loin ! Trop loin, peut-être…' },
    hub: { who: 'Mochi', text: 'Petites pattes, grand cœur ! C\'est ma devise.' },
  },
  // ---------------------------------------------------------------- 5. la Station des Neiges
  {
    id: 'l5_rosti', lv: 5, name: 'Rösti', breed: 'saint-bernard', x: 14.0, z: -140.2, y: 59.6, yaw: Math.PI,
    where: 'derrière le refuge, au sommet de la montagne',
    look: { pattern: 'saddle', fur: 0xfaf6ee, b2: 0xa8521e, belly: 0xffffff, ears: 'drop', earC: 0x8a3e14, tail: 'plume', fluff: 0.5, chunky: 1.25, scale: 1.12, muzzle: 1.0, droopy: true, barrel: true },
    found: { who: 'Rösti', text: 'Je suis un chien de secours ! Euh… C\'est vous qui me secourez ? Merci !' },
    hub: { who: 'Rösti', text: 'Si quelqu\'un se perd, j\'arrive ! Enfin… après ma sieste.' },
  },
  {
    id: 'l5_kiwi', lv: 5, name: 'Kiwi', breed: 'husky', x: -133.0, z: -134.0, y: 3.03, yaw: 0.8,
    where: 'au fond de la Crevasse de Cristal',
    look: { pattern: 'husky', fur: 0x6a7280, b2: 0x2a2e38, belly: 0xfaf8f6, ears: 'prick', tail: 'curl', fluff: 0.6, muzzle: 1.15, iris: 0x4aa0ff, scarf: 0xe04848 },
    found: { who: 'Kiwi', text: 'Aouuuh ! Dans la crevasse, l\'écho chantait avec moi. Mais j\'avais froid aux pattes !' },
    hub: { who: 'Kiwi', text: 'Aouuuh ! Tu veux m\'entendre chanter ? Aouuuh !' },
  },
  {
    id: 'l5_tofu', lv: 5, name: 'Tofu', breed: 'samoyède', x: 140.3, z: 96.2, y: 5.21, yaw: -2.4,
    where: 'sur le toit d\'un igloo du Village des Pingouins',
    look: { pattern: 'solid', fur: 0xfcfcfa, belly: 0xffffff, ears: 'prick', earLen: 0.8, tail: 'curl', fluff: 1, puffs: true, mane: true, muzzle: 0.95, tongue: true, smile: true },
    found: { who: 'Tofu', text: 'Je suis tout blanc, alors personne ne me voyait dans la neige ! Toi, tu m\'as vu !' },
    hub: { who: 'Tofu', text: 'Je souris tout le temps. C\'est parce que je suis heureux ici !' },
  },
  // ---------------------------------------------------------------- 6. la Plage aux Coquillages
  {
    id: 'l6_truffe', lv: 6, name: 'Truffe', breed: 'labrador noir', x: -168.0, z: 98.0, y: 2.83, yaw: 0.9,
    where: 'au fond d\'un creux des dunes, tout à l\'ouest',
    look: { pattern: 'solid', fur: 0x2a2628, belly: 0x3a3436, ears: 'drop', tail: 'wag', muzzle: 1.1, tongue: true, collar: 0xff9a2a, sandy: true },
    found: { who: 'Truffe', text: 'Je creusais pour trouver un trésor… et je vous ai trouvés ! C\'est encore mieux !' },
    hub: { who: 'Truffe', text: 'Je creuse un trou jusqu\'à la plage. Il ne manque plus que huit cents mètres !' },
  },
  {
    id: 'l6_gribouille', lv: 6, name: 'Gribouille', breed: 'jack russell', x: -154.6, z: -13.0, y: 8.6, yaw: 1.2,
    where: 'tout en haut des rochers de la grotte',
    look: { pattern: 'patch', fur: 0xfcf8f2, b2: 0xb8743a, belly: 0xffffff, ears: 'fold', tail: 'wag', muzzle: 1.05, leg: 1.05, tongue: true, collar: 0xe03a3a },
    found: { who: 'Gribouille', text: 'Je voulais voir la mer de tout en haut ! Elle est grande ! Très grande ! Ouaf !' },
    hub: { who: 'Gribouille', text: 'On joue ? On joue ? On joue ? Allez, on joue !' },
  },
  {
    id: 'l6_domino', lv: 6, name: 'Domino', breed: 'dalmatien', x: 154.2, z: 22.4, y: 6.14, yaw: 2.0,
    where: 'sur le pont de l\'épave, au bout de la plage',
    look: { pattern: 'spots', fur: 0xfcfbf8, b2: 0x1e1c20, belly: 0xffffff, ears: 'drop', earC: 0x2a2628, tail: 'whip', leg: 1.2, muzzle: 1.15, bandana: 0x2a3a8a },
    found: { who: 'Domino', text: 'À l\'abordage ! Je suis le capitaine de l\'épave ! Mais le bateau ne bouge pas…' },
    hub: { who: 'Domino', text: 'J\'ai compté mes taches : il y en a cent une. Ou cent deux ?' },
  },
  // ---------------------------------------------------------------- 7. la Ferme de Papi Berger
  {
    id: 'l7_caillou', lv: 7, name: 'Caillou', breed: 'berger australien', x: 94.75, z: 114.95, y: 1.0, yaw: 2.4,
    where: 'sur l\'îlot de la mare aux canards',
    look: { pattern: 'merle', fur: 0x8a96a8, b2: 0x2a2a32, belly: 0xfaf8f4, points: 0xc87a3a, ears: 'fold', tail: 'stub', fluff: 0.6, muzzle: 1.1, iris: 0x4aa0ff, odd: true },
    found: { who: 'Caillou', text: 'Je gardais les canards. Mais en fait, c\'étaient les canards qui me gardaient !' },
    hub: { who: 'Caillou', text: 'Je rassemble les chiots pour le goûter. Personne ne m\'écoute !' },
  },
  {
    id: 'l7_poivre', lv: 7, name: 'Poivre', breed: 'schnauzer', x: 120.6, z: 22.4, y: 2.17, yaw: -0.5,
    where: 'sous un pommier, au fond du verger',
    look: { pattern: 'saltpepper', fur: 0x6a6a70, belly: 0xd0d0d4, ears: 'fold', tail: 'stub', beard: 0xe0e0e4, brows: 0xe0e0e4, muzzle: 1.15, leg: 1.05, collar: 0xc03a3a },
    found: { who: 'Poivre', text: 'Hmpf. Je ne suis pas perdu, je surveillais les pommes. Bon… merci quand même.' },
    hub: { who: 'Poivre', text: 'Hmpf. Ces petits font du bruit. Mais je les aime bien.' },
  },
  {
    id: 'l7_sushi', lv: 7, name: 'Sushi', breed: 'shiba', x: 95.0, z: -78.0, y: 16.4, yaw: Math.PI,
    where: 'sur le balcon du moulin',
    look: { pattern: 'urajiro', fur: 0xd8742e, belly: 0xfaf0e0, ears: 'prick', tail: 'curl', fluff: 0.45, muzzle: 1.0, collar: 0x2a8ae0 },
    found: { who: 'Sushi', text: 'Le moulin tourne, tourne… J\'ai le tournis ! Ramenez-moi sur la terre ferme !' },
    hub: { who: 'Sushi', text: 'Je fais ma toilette comme un chat. Chut, ne le dis à personne !' },
  },
  // ---------------------------------------------------------------- 8. le Château des Chats
  {
    id: 'l8_sesame', lv: 8, name: 'Sésame', breed: 'shih tzu', x: 37.5, z: -13.5, y: 3.4, yaw: 0,
    where: 'au fond d\'une impasse du labyrinthe de buis',
    look: { pattern: 'parti', fur: 0xfcf8f2, b2: 0xc89048, belly: 0xffffff, ears: 'puff', earC: 0xc89048, tail: 'curl', fluff: 0.9, muzzle: 0.55, topknot: 0xff5aa0, beard: 0xfcf8f2 },
    found: { who: 'Sésame', text: 'Une princesse ne se perd jamais : elle explore ! Mais merci, mes chevaliers.' },
    hub: { who: 'Sésame', text: 'Mon nœud est-il bien droit ? Une princesse doit être parfaite !' },
  },
  {
    id: 'l8_ourson', lv: 8, name: 'Ourson', breed: 'chow-chow', x: -49.4, z: -26.6, y: 2.3, yaw: 0.6,
    where: 'sur l\'îlot du lac aux nénuphars',
    look: { pattern: 'solid', fur: 0xc8763a, belly: 0xe09a5a, ears: 'prick', earLen: 0.6, tail: 'curl', fluff: 1, puffs: true, mane: true, muzzle: 0.7, chunky: 1.2, blueTongue: true },
    found: { who: 'Ourson', text: 'Sur mon île, j\'étais le roi des nénuphars. Mais un roi tout seul, c\'est triste.' },
    hub: { who: 'Ourson', text: 'Je ressemble à un petit lion. Mais je ne rugis que des câlins.' },
  },
  {
    id: 'l8_guimauve', lv: 8, name: 'Guimauve', breed: 'westie', x: -19.4, z: -8.2, y: 4, yaw: 1.4,
    where: 'dans la cachette secrète, derrière la fissure du mur',
    look: { pattern: 'solid', fur: 0xfcfcf8, belly: 0xffffff, ears: 'prick', earLen: 0.75, tail: 'wag', fluff: 0.8, beard: 0xffffff, muzzle: 0.85, scale: 0.92, collar: 0x8a4ae0 },
    found: { who: 'Guimauve', text: 'J\'ai suivi un chat dans la fissure du mur… et le chat est reparti sans moi !' },
    hub: { who: 'Guimauve', text: 'Les chats du château sont gentils, en fait. Surtout leurs croquettes !' },
  },
];

/** Les chiots d'un monde. */
export const pupsOf = (lv) => PUPS.filter(p => p.lv === lv);
export const pupById = (id) => PUPS.find(p => p.id === id);
/** Les chiots retrouvés par le joueur de cet appareil (tous mondes). */
export function rescuedIds() {
  try { const a = JSON.parse(localStorage.getItem(PUPS_KEY) || '[]'); return Array.isArray(a) ? a.filter(id => pupById(id)) : []; } catch (e) { return []; }
}
export function addRescued(ids) {
  const have = new Set(rescuedIds());
  let n = 0;
  for (const id of ids) if (pupById(id) && !have.has(id)) { have.add(id); n++; }
  if (n) { try { localStorage.setItem(PUPS_KEY, JSON.stringify([...have])); } catch (e) { /* ignore */ } }
  return n;
}
