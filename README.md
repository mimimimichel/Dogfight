# Matcha & Ainu

Jeu de baston 2D en ligne façon *Street Fighter*… mais avec des chiens. Combats en 1 contre 1, au meilleur des 3 manches.

## Les combattants

| | **Ainu** — Eurasier roux | **Matcha** — Pinscher |
|---|---|---|
| Style | Lourde, encaisse et frappe fort, contrôle la distance | Rapide, agressif, fonce au contact |
| Vie | 1100 | 950 |
| Spéciale | **Boule de poils rousse** (projectile) | **Charge Pinscher** (ruée qui fait chuter) |
| Super | **Hurlement du Loup Roux** (onde à 6 coups) | **Rafale Matcha** (ruée à 7 coups) |

Chaque chien a aussi une attaque légère, une lourde, deux attaques accroupies (basses, la lourde fait chuter) et deux attaques sautées.

## Lancer le jeu

```bash
npm install
npm start
```

Puis ouvrir <http://localhost:3000>.

- **Jouer en ligne** : *Match rapide* (premier adversaire disponible) ou *salon privé* avec un code à 4 caractères / un lien d'invitation (`?salon=CODE`).
- **Contre l'ordi** : 3 niveaux de difficulté.
- **2 joueurs (même clavier)**.

**Version en ligne : <https://dogfight-flax.vercel.app>** (hébergement statique gratuit sur Vercel).

Le mode en ligne fonctionne de deux façons, choisies automatiquement :

- **Hébergement statique (Vercel, GitHub Pages…)** : pair-à-pair WebRTC. Le navigateur de celui qui crée le salon fait tourner la partie. La mise en relation passe par le service public gratuit de PeerJS, avec ses relais TURN en secours. Rien à installer côté serveur : il suffit de publier le dossier `public/`.
- **Serveur Node (`npm start`)** : serveur autoritaire en WebSocket, utilisé dès que `/health` répond.

En pair-à-pair, l'hôte doit garder l'onglet du jeu au premier plan : un onglet en arrière-plan est ralenti par le navigateur et la partie saccade.

## Mode Aventure (3D)

Un jeu de plates-formes 3D façon *Yooka-Laylee* : Matcha est perché sur le dos d'Ainu, et le duo explore librement le **Parc des Toutous** (niveau 1).

- **Objectifs** : 5 Médailles Patounes et 100 os dorés.
  - Le sommet du Grand Chêne, à grimper de branche en branche.
  - Les 4 chats bandits de la clairière, à chasser.
  - La caisse de l'îlot du lac, à atteindre en sautant de galet en galet.
  - Les 5 balles de tennis, dont certaines perchées sur des rochers.
  - Biscotte, le chiot perdu près de la cascade, à ramener à Mamie Labrador.
- **Pouvoirs du duo** :
  - saut ;
  - double saut (Matcha propulse Ainu) ;
  - plané (garder SAUT : la queue d'Ainu fait l'hélice) ;
  - coup de queue tournoyant ;
  - Charge Pinscher (casse les caisses) ;
  - sauter sur la tête des chats.
- **Pensé pour les enfants** : pas de game over. Tomber à l'eau ramène sur la terre ferme, et perdre ses 3 cœurs fait repartir du début en gardant tous ses trésors. La progression est sauvegardée dans le navigateur.
- **Commandes** :
  - tactile : joystick, boutons SAUT, ATTAQUE, CHARGE et PARLER, et glisser à droite pour tourner la caméra ;
  - clavier : ZQSD ou flèches, Espace, J, K, F, et A/E (ou la souris) pour la caméra ;
  - manette compatible.
- **Technique** : Three.js (chargé seulement à l'ouverture de l'aventure), rendu cel-shading low-poly en basse résolution pixelisée, physique et collisions maison. Tous les modèles sont construits à partir de formes simples.

```
public/adventure/level1.js   Relief, obstacles et objets du niveau (testable sans navigateur)
public/adventure/models.js   Modèles 3D : le duo, les chats, Mamie, Biscotte, les objets
public/adventure/game.js     Physique, caméra, ennemis, dialogues, interface, sauvegarde
test/level1.test.mjs         Tests des données du niveau
```

## Commandes

### Téléphone et tablette (en paysage)

- **Pouce gauche** : un joystick apparaît là où on pose le doigt. Glisser à droite ou à gauche pour avancer ou reculer (reculer protège), vers le haut pour sauter, vers le bas pour s'accroupir.
- **Pouce droit** : boutons LÉGER, LOURD, SPÉ. et SUPER (il clignote quand la jauge est pleine).
- Bouton **II** pour la pause. En portrait, le jeu demande de tourner l'appareil.
- Astuce : « Ajouter à l'écran d'accueil » installe le jeu comme une appli, en plein écran.

### Clavier

Clavier AZERTY (les touches physiques correspondent à WASD en QWERTY).

| Action | Solo / En ligne | J1 (local) | J2 (local) |
|---|---|---|---|
| Se déplacer / sauter / s'accroupir | `Z Q S D` ou flèches | `Z Q S D` | flèches |
| Attaque légère | `J` | `F` | `J` |
| Attaque lourde | `K` | `G` | `K` |
| Spéciale | `L` | `H` | `L` |
| Super (jauge pleine) | `I` | `T` | `I` |

- **Garde** : maintenir la direction opposée à l'adversaire (accroupi contre les attaques basses, debout contre les attaques sautées).
- **Manette** : X / Y / B = légère / lourde / spéciale, RB = super, A = saut.
- `Échap` : pause · `M` : couper le son · `F2` : afficher les boîtes de collision (modes locaux).

## Architecture

```
server.js            Serveur HTTP + WebSocket (salons, matchmaking, simulation 60 Hz)
public/game-core.js  Moteur de combat partagé serveur/navigateur + IA
public/render.js     Rendu pixel art : rasteriseur, ombrage auto, chiens, décor, effets, HUD
public/audio.js      Sons synthétisés (WebAudio, aucun fichier)
public/main.js       Menus, entrées clavier/manette, réseau, boucles de jeu
public/room.js       Logique de salon partagée (serveur Node et hôte pair-à-pair)
public/p2p.js        Transport pair-à-pair WebRTC (PeerJS)
test/sim.test.js     Tests du moteur (npm test)
```

En ligne, le serveur fait autorité : les clients n'envoient que l'état de leurs touches, le serveur simule le combat à 60 images/s et renvoie l'état à chaque image ; le client le lit via un petit tampon anti-gigue. Les modes hors ligne exécutent le même moteur dans le navigateur.

## Direction artistique : pixel art

Le jeu est rendu en résolution native **480×270** puis agrandi sans lissage (par pas entiers quand l'écran le permet). Rien n'est importé : tout est généré par le code, avec les règles d'un pixel artist.

- **Rasteriseur sans anticrénelage** : les chiens sont décrits par des formes (ellipses, courbes, membres) puis tracés au pixel près, sans pixels flous.
- **Ombrage automatique** : chaque matière (pelage roux, crème, noir, bandana…) a une rampe de 5 tons. La lumière vient d'en haut à gauche, avec des bandes d'ombre tramées, des reflets sur les grandes masses et un éclairage latéral sur les pattes.
- **Contours colorés (sel-out)** : le contour prend la teinte sombre de la matière voisine au lieu d'un noir uniforme. Une ligne de séparation marque les membres qui passent devant le corps.
- **Détails posés pixel par pixel** : yeux (avec expressions), reflet de truffe, crocs, pois du bandana.
- **Décor tramé** (Bayer 4×4) sur 4 couches : ciel et soleil, nuages qui défilent, collines et arbres, clôture et arène. Le public canin saute à chaque coup porté.
- **Texte** en Press Start 2P à sa taille native (8 px), seuillé, avec contour et dégradé en deux tons.

## Ajouter un chien

1. Déclarer ses stats et ses coups dans `CHARACTERS` (`public/game-core.js`).
2. Lui donner des rampes de couleurs dans `DOG_RAMPS` et des proportions dans `BUILD` (`public/render.js`), et des poses d'attaque dans `poseAttack`.
3. Ajouter ses statistiques d'affichage dans `STATS` (`public/main.js`).
