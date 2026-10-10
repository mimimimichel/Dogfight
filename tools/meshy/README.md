# Ainu et Matcha d'après le modèle Meshy « Adventure Companions »

Le fichier GLB téléchargeable gratuitement n'a ni texture ni détails. Pipeline :

1. Captures du visualiseur Meshy (vues « base color » et silhouettes grises, 2 anneaux × 16 angles).
2. Forme reconstruite à partir de 4 vues (Hunyuan3D-2mv, `shape_generation`).
3. `prep.py` : nettoyage, repère du jeu. `split.py` : séparation Matcha / Ainu.
4. `calib.py <captures> dense.npz cal.json 0.18 seq` : calage des caméras (silhouettes, perspective).
   `regcal.py` : correction fine par région (tête d'Ainu, Matcha).
5. `bake.py` : dépliage UV (xatlas) et projection des couleurs, visage pris sur la vue de face.
6. `export.py` : squelette (tête, queue, 4 pattes) -> `public/adventure/assets/duo3d[-lite].json` + textures.
