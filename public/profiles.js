/*
 * Matcha & Ainu — joueurs (« Qui joue ? ») : plusieurs enfants sur le même appareil,
 * chacun sa progression.
 *
 * Chargé avant tout le reste : les sauvegardes du joueur choisi (aventure, mondes
 * visités, mode de difficulté, monde partagé, pseudo) sont rangées dans son propre
 * « tiroir » du stockage local, sans que le reste du jeu ait à le savoir. Les réglages
 * (son, musique, qualité, style) restent communs. Le premier joueur garde les clés
 * d'origine : les parties déjà commencées sont conservées.
 */
(function () {
  'use strict';
  const PER_PLAYER = ['dogfight.aventure.', 'dogfight.wardrobe', 'dogfight.visited', 'dogfight.profile', 'dogfight.name', 'dogfight.mode', 'dogfight.world.code', 'dogfight.w.'];
  const LIST_KEY = 'dogfight.players', ACTIVE_KEY = 'dogfight.activePlayer';
  const proto = Storage.prototype, rawGet = proto.getItem, rawSet = proto.setItem, rawRemove = proto.removeItem;
  let ls = null;
  try { ls = window.localStorage; } catch (e) { /* stockage indisponible */ }
  const get = (k) => { try { return ls ? rawGet.call(ls, k) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (ls) rawSet.call(ls, k, v); } catch (e) { /* ignore */ } };

  let active = get(ACTIVE_KEY) || 'p0';
  const keyFor = (id, k) => (id === 'p0' ? k : 'dogfight@' + id + k.slice('dogfight'.length));
  const mapped = (k) => (typeof k === 'string' && PER_PLAYER.some(p => k.startsWith(p)) ? keyFor(active, k) : k);
  if (ls) {
    proto.getItem = function (k) { return rawGet.call(this, this === ls ? mapped(k) : k); };
    proto.setItem = function (k, v) { return rawSet.call(this, this === ls ? mapped(k) : k, v); };
    proto.removeItem = function (k) { return rawRemove.call(this, this === ls ? mapped(k) : k); };
  }

  const COLORS = ['#ff8f3c', '#8cd04a', '#5ab4ff', '#ff6ab0', '#b05ae8', '#ffd23a'];
  const AVATARS = ['🐶', '🐕', '🦮', '🐩', '🐾', '🦴'];
  function list() {
    let l = null;
    try { l = JSON.parse(get(LIST_KEY) || 'null'); } catch (e) { l = null; }
    if (!Array.isArray(l) || !l.length) l = [{ id: 'p0', name: 'Joueur 1', color: 0, avatar: 0 }];
    return l;
  }
  const save = (l) => set(LIST_KEY, JSON.stringify(l));

  /** Progression d'un joueur (0..100), lue dans son tiroir. */
  function progress(id) {
    const lv = [[1, 5], [2, 5], ['3b', 12], [4, 6], [8, 5]];
    let got = 0, all = 0;
    for (const [n, med] of lv) {
      let s = null;
      try { s = JSON.parse(get(keyFor(id, 'dogfight.aventure.niveau' + n)) || 'null'); } catch (e) { s = null; }
      const m = s && s.medals ? Math.min(s.medals.length, med) : 0, b = s && s.bones ? Math.min(s.bones.length, 100) : 0;
      got += m * 4 + b / 10; all += med * 4 + 10;
    }
    return Math.round(got / all * 100);
  }

  window.Profiles = {
    COLORS, AVATARS, list, progress,
    active: () => active,
    current: () => list().find(p => p.id === active) || list()[0],
    /** Choisit le joueur (la page se recharge avec ses sauvegardes). */
    select(id) {
      set(ACTIVE_KEY, id);
      try { sessionStorage.setItem('dogfight.chosen', '1'); } catch (e) { /* ignore */ }
      if (id !== active) location.reload();
    },
    create(name, color, avatar) {
      const l = list();
      const id = 'p' + Date.now().toString(36);
      l.push({ id, name: (name || '').trim().slice(0, 16) || 'Joueur ' + (l.length + 1), color: color | 0, avatar: avatar | 0 });
      save(l);
      return id;
    },
    rename(id, name, color, avatar) {
      const l = list(), p = l.find(q => q.id === id);
      if (!p) return;
      if (name !== undefined) p.name = (name || '').trim().slice(0, 16) || p.name;
      if (color !== undefined) p.color = color | 0;
      if (avatar !== undefined) p.avatar = avatar | 0;
      save(l);
    },
    /** Supprime un joueur et toutes ses sauvegardes (pas le premier). */
    remove(id) {
      if (id === 'p0') return;
      save(list().filter(p => p.id !== id));
      try {
        const pre = 'dogfight@' + id + '.';
        const keys = [];
        for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(pre)) keys.push(k); }
        for (const k of keys) rawRemove.call(ls, k);
      } catch (e) { /* ignore */ }
      if (active === id) { set(ACTIVE_KEY, 'p0'); location.reload(); }
    },
    /** Faut-il demander « Qui joue ? » au lancement ? */
    shouldAsk() {
      let chosen = false;
      try { chosen = sessionStorage.getItem('dogfight.chosen') === '1'; } catch (e) { /* ignore */ }
      return list().length > 1 && !chosen;
    },
    markChosen() { try { sessionStorage.setItem('dogfight.chosen', '1'); } catch (e) { /* ignore */ } },
  };
})();
