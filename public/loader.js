/*
 * Matcha & Ainu — écran de chargement (démarrage de l'appli et entrée dans un niveau).
 * window.AppLoader : show(titre, sous-titre), progress(0..1, texte), hide().
 */
(function () {
  'use strict';
  const TIPS = [
    'Garde le saut appuyé en tombant : la queue d\'Ainu fait l\'hélice et vous planez !',
    'Appuie deux fois sur Saut : Matcha vous propulse encore plus haut.',
    'En kart, saute en tournant et garde le bouton appuyé pour déraper… et gagner un turbo !',
    'Les « ! » sur la carte : des habitants qui ont besoin d\'un coup de patte.',
    'Les pièces d\'or s\'échangent chez Mimi contre des chapeaux et des peintures de kart.',
    'Jusqu\'à 6 amis peuvent venir dans ton monde, avec « Jouer ensemble ».',
    'Le bouton micro permet de se parler pendant la partie à plusieurs.',
    'Les auvents rayés des boutiques font rebondir très haut : parfait pour monter sur les toits !',
    'Un coup de queue tournoyant fait fuir les chats bandits de la Capitaine Moustache.',
  ];
  const el = document.getElementById('loader');
  if (!el) return;
  const title = el.querySelector('.ld-title'), sub = el.querySelector('.ld-sub'), bar = el.querySelector('.ld-bar i');
  const step = el.querySelector('.ld-step'), tip = el.querySelector('.ld-tip');
  let tipTimer = null, tipI = Math.floor(Math.random() * TIPS.length), shown = !el.classList.contains('hidden'), hideTimer = null;
  const nextTip = () => { tipI = (tipI + 1) % TIPS.length; tip.textContent = 'Astuce : ' + TIPS[tipI]; };
  function show(t, s) {
    clearTimeout(hideTimer);
    title.textContent = t || 'Chargement…';
    sub.textContent = s || '';
    sub.classList.toggle('hidden', !s);
    el.classList.remove('hidden', 'out');
    if (!shown) { bar.style.width = '4%'; step.textContent = ''; }
    shown = true;
    nextTip();
    clearInterval(tipTimer);
    tipTimer = setInterval(nextTip, 3800);
  }
  function progress(p, text) {
    bar.style.width = Math.round(Math.max(4, Math.min(100, p * 100))) + '%';
    if (text !== undefined) step.textContent = text;
  }
  function hide() {
    if (!shown) return;
    progress(1);
    el.classList.add('out');
    clearInterval(tipTimer);
    hideTimer = setTimeout(() => { el.classList.add('hidden'); shown = false; }, 450);
  }
  window.AppLoader = { show, progress, hide, get visible() { return shown; } };
  if (shown) { nextTip(); tipTimer = setInterval(nextTip, 3800); }
})();
