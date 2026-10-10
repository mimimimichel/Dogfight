# 🐕 Dogfight

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

Pour jouer avec des amis sur un autre réseau, il faut héberger le serveur sur un service qui accepte les WebSockets (Render, Railway, Fly.io, un VPS…). La commande de démarrage est `npm start`, le port est lu depuis la variable `PORT`.

## Commandes

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
