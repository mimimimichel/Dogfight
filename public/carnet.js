/*
 * Matcha & Ainu — le Carnet des bêtises : des petites farces de chiens à faire dans
 * tous les mondes (faire sursauter les chats, plouf dans l'eau…). Chacune donne un
 * tampon ; avec 6 tampons on gagne l'Écharpe des farceurs pour la garde-robe.
 * Rangé dans la sauvegarde du joueur (voir profiles.js).
 */
(function () {
  'use strict';
  const KEY = 'dogfight.profile.carnet';
  const LIST = [
    { id: 'bark_cats', icon: '😾', text: 'Faire sursauter 5 chats en aboyant', need: 5 },
    { id: 'throw_cat', icon: '🎯', text: 'Lancer Matcha sur un chat', need: 1 },
    { id: 'plouf', icon: '💦', text: 'Faire 3 ploufs dans l\'eau', need: 3 },
    { id: 'chain10', icon: '🦴', text: 'Ramasser 10 trésors d\'affilée', need: 1 },
    { id: 'tricks', icon: '💫', text: 'Faire 20 pirouettes', need: 20 },
    { id: 'mamie_bark', icon: '👵', text: 'Aboyer sous le nez de Mamie', need: 1 },
    { id: 'hat_photo', icon: '🎩', text: 'Prendre une photo avec un chapeau', need: 1 },
    { id: 'pet', icon: '🐶', text: 'Caresser Biscotte 5 fois', need: 5 },
    { id: 'revive', icon: '🤗', text: 'Relever un ami tombé', need: 1 },
    { id: 'glide', icon: '🪂', text: 'Planer 5 secondes sans toucher le sol', need: 1 },
    { id: 'crates', icon: '📦', text: 'Casser 15 caisses', need: 15 },
    { id: 'fall_far', icon: '😵', text: 'Tomber de très, très haut', need: 1 },
  ];
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };

  /** Avance une bêtise ; renvoie l'entrée si elle vient d'être tamponnée. */
  function bump(id, n) {
    const it = LIST.find(x => x.id === id);
    if (!it) return null;
    const o = read(), was = o[id] || 0;
    if (was >= it.need) return null;
    o[id] = Math.min(it.need, was + (n || 1));
    write(o);
    return o[id] >= it.need ? it : null;
  }
  const done = () => { const o = read(); return LIST.filter(it => (o[it.id] || 0) >= it.need); };
  const progress = (id) => read()[id] || 0;

  window.Carnet = { LIST, bump, done, progress, stamps: () => done().length, PRIZE_AT: 6 };
})();
