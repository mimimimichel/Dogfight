/*
 * Matcha & Ainu — les costumes à pouvoir (idée « Mario Odyssey ») : données et règles.
 *
 *  - Chapeau-aimant : les trésors du monde (os, croquettes, pièces, flocons, coquillages,
 *    poissons) filent vers le chien de beaucoup plus loin.
 *  - Bottes-ressorts : un saut bien plus haut, et en l'air « Attaque » = plongeon qui
 *    rebondit très haut (et fait valser les chats tout autour).
 *  - Cape-fusée : garder « Saut » appuyé en l'air pour planer (même Matcha tout seul !),
 *    rappuyer après le double saut pour un petit coup de fusée (jauge qui se recharge au sol).
 *
 * Un seul pouvoir à la fois. On les trouve dans des boîtes à costume (2 par monde), ou
 * dans la garde-robe une fois trouvés (ou avec assez de récompenses).
 *
 * Données seules (pas de Three.js) : lues par le jeu (powers.js, game.js) et par les tests
 * (test/powers.test.mjs).
 */

export const POWERS = [
  { id: 'magnet', name: 'Chapeau-aimant', need: 2, color: '#ff5a5a', hint: 'Les trésors volent tout seuls vers toi !' },
  { id: 'boots', name: 'Bottes-ressorts', need: 4, color: '#2ec4a0', hint: 'Saute super haut ! En l\'air, Attaque = gros plongeon rebondi' },
  { id: 'cape', name: 'Cape-fusée', need: 7, color: '#7a5aff', hint: 'Garde Saut appuyé pour planer, et rappuie pour la fusée !' },
];
export const POWER_IDS = POWERS.map(p => p.id);
export const powerDef = (id) => POWERS.find(p => p.id === id) || null;

/** Réglages du jeu (le moteur : gravité 32, saut 12 m/s, double saut 10,5 m/s, planeur −2,2 m/s). */
export const PHYS = {
  GRAVITY: 32,
  JUMP_V: 12,
  DOUBLE_V: 10.5,
  GLIDE_FALL: 2.2,
  // bottes-ressorts
  BOOT_JUMP_V: 16.5,       // ≈ 4,3 m (au lieu de 2,25 m)
  POUND_HANG: 0.16,        // petite pause en l'air avant de plonger
  POUND_FALL: 30,          // vitesse du plongeon (vers le bas)
  POUND_BOUNCE: 19,        // rebond après le plongeon (≈ 5,6 m)
  POUND_R: 3.4,            // les chats tout autour s'envolent, les caisses cassent
  // cape-fusée
  CAPE_FALL: 1.15,         // on plane plus lentement…
  CAPE_SPEED: 1.3,         // … et plus vite vers l'avant
  ROCKET_T: 0.5,           // durée du coup de fusée
  ROCKET_UP: 12.5,         // vitesse vers le haut pendant la fusée
  ROCKET_FWD: 15,          // vitesse vers l'avant pendant la fusée
  ROCKET_RECHARGE: 1.3,    // secondes au sol pour recharger la jauge
  // chapeau-aimant
  MAGNET_R: 9,             // rayon d'attraction (au lieu de 3 m)
  MAGNET_DY: 3.4,          // et même un peu en hauteur (au lieu de 1 m)
};
export const jumpHeight = (v, g) => v * v / (2 * (g || PHYS.GRAVITY));

/** La jauge de la fusée (0..1) : elle se recharge au sol (et un tout petit peu en planant). */
export function rechargeGauge(gauge, dt, grounded) {
  const k = grounded ? 1 / PHYS.ROCKET_RECHARGE : 0;
  return Math.min(1, Math.max(0, (gauge === undefined ? 1 : gauge) + k * dt));
}
/** Peut-on lancer la fusée ? (en l'air, après le double saut, jauge pleine, pas déjà en train de plonger). */
export const canRocket = (P) => P.power === 'cape' && !P.grounded && P.jumps >= 2 && (P.rocketG === undefined ? 1 : P.rocketG) >= 0.999 && !(P.rocketT > 0);
/** Peut-on plonger ? (bottes, en l'air, pas déjà en plongeon). */
export const canPound = (P) => P.power === 'boots' && !P.grounded && !P.pound && !(P.trickT > 0);

/** Le pouvoir porté, en petit nombre pour le monde partagé : 0 rien, 1 aimant, 2 bottes, 3 cape ; +4 fusée, +8 plongeon. */
export function powerCode(P) {
  const i = POWER_IDS.indexOf(P.power) + 1;
  return i + (P.rocketT > 0 ? 4 : 0) + (P.pound ? 8 : 0);
}
export function decodePower(c) {
  c = c | 0;
  return { power: POWER_IDS[(c & 3) - 1] || null, rocket: !!(c & 4), pound: !!(c & 8) };
}

/** Débloqué dans la garde-robe : trouvé dans une boîte, ou assez de récompenses. */
export function powerUnlocked(id, found, rewards) {
  const p = powerDef(id);
  return !!p && ((found || []).includes(id) || (rewards || 0) >= p.need);
}

/**
 * Les boîtes à costume : 2 par monde, à des endroits qui donnent envie d'essayer le pouvoir.
 * x, z, y = le sol sous la boîte (le jeu la recale), where = l'indice.
 */
export const BOXES = {
  1: [
    { power: 'magnet', x: 0, z: 31, y: 2.56, where: 'juste devant l\'arche d\'entrée, au début de l\'allée' },
    { power: 'cape', x: 10.8, z: -130.8, y: 7, where: 'en haut du belvédère : on plane jusqu\'en bas !' },
  ],
  2: [
    { power: 'boots', x: 3, z: 130, y: 2.63, where: 'au début du sentier de la forêt' },
    { power: 'magnet', x: 2.3, z: 46.6, y: 2.5, where: 'dans la clairière aux lanternes, pleine de croquettes' },
  ],
  3: [
    { power: 'cape', x: -51.4, z: -7.5, y: 2, where: 'sur la grand-place, près de la fontaine' },
    { power: 'boots', x: 32, z: -8, y: 2, where: 'à l\'entrée du grand parc de la ville' },
  ],
  4: [
    { power: 'cape', x: 2.5, z: 94, y: 10.33, where: 'sur l\'île du départ' },
    { power: 'boots', x: 2.8, z: 53.2, y: 12.25, where: 'sur l\'île des Ballons' },
  ],
  5: [
    { power: 'magnet', x: 3.5, z: 160, y: 3, where: 'au village des chalets' },
    { power: 'cape', x: -11, z: -132, y: 61, where: 'tout en haut du sommet : la plus belle descente en planant !' },
  ],
  6: [
    { power: 'boots', x: 31, z: 93.6, y: 3.2, where: 'au village de la plage' },
    { power: 'cape', x: 93, z: -20, y: 12, where: 'en haut de la falaise' },
  ],
  7: [
    { power: 'boots', x: 3.5, z: 139, y: 2.79, where: 'au départ, sur le chemin de la ferme' },
    { power: 'magnet', x: -2.5, z: 59.7, y: 2.5, where: 'dans la cour de la ferme' },
  ],
  8: [
    { power: 'boots', x: 3, z: 53, y: 2.09, where: 'dans la prairie devant le château' },
    { power: 'magnet', x: 2.4, z: 6.1, y: 4, where: 'dans la cour des pelotes' },
  ],
};
export const boxesOf = (lv) => BOXES[lv] || [];
/** Une boîte ouverte se referme (et redonne son costume) au bout de quelques secondes. */
export const BOX_REGROW = 6;
