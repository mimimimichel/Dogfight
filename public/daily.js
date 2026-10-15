/*
 * Matcha & Ainu — le cadeau du jour de Mamie (l'idée du rendez-vous quotidien d'Animal Crossing).
 * Une fois par jour, en arrivant sur l'accueil, un paquet cadeau attend l'enfant : on le touche,
 * il s'ouvre, et Mamie offre des trésors pour la niche (plus encore si l'on revient plusieurs
 * jours de suite), avec une petite anecdote sur les chiens. Rangé dans la sauvegarde du joueur.
 */
(function () {
  'use strict';
  const KEY = 'dogfight.profile.daily', PROFILE = 'dogfight.profile';
  const FACTS = [
    'Le nez d\'un chien est unique, comme nos empreintes de doigts !',
    'Les chiens peuvent sentir des odeurs dix mille fois mieux que nous.',
    'Quand un chien remue la queue vers la droite, c\'est souvent qu\'il est content.',
    'Les chiots naissent les yeux fermés : ils les ouvrent vers deux semaines.',
    'Un chien transpire surtout par les coussinets de ses pattes.',
    'Les chiens rêvent, comme nous : parfois, leurs pattes bougent en dormant !',
    'Les chiens entendent des sons trop aigus pour nos oreilles.',
    'Un chien peut comprendre plus de cent mots… surtout « croquette » !',
    'Les eurasiers, comme Ainu, ont souvent une langue toute bleue-violette.',
    'Les pinschers nains, comme Matcha, sont tout petits mais très courageux.',
    'Les labradors adorent l\'eau : leurs pattes sont un peu palmées.',
    'Un chien bâille parfois pour se calmer, pas seulement quand il a sommeil.',
    'Les chiens voient le bleu et le jaune, mais pas bien le rouge.',
    'Quand un chien fait la révérence, pattes en avant, il veut jouer !',
    'Le chien est l\'ami de l\'homme depuis plus de quinze mille ans.',
  ];
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const day = (d) => { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return day(d); };

  let shown = false;
  function css() {
    if (document.getElementById('daily-css')) return;
    const st = document.createElement('style'); st.id = 'daily-css';
    st.textContent = `
      .daily-ov { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(20, 30, 60, 0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: dailyIn 0.3s ease-out both; }
      .daily-card { width: min(420px, 88vw); padding: 18px 20px 20px; border-radius: 26px; background: #fff8ea; border: 4px solid #2a1408; box-shadow: 0 8px 0 #2a1408; text-align: center; font-family: var(--hf, inherit); color: #3a2010; }
      .daily-card h3 { margin: 0 0 4px; font-size: clamp(20px, 5vh, 28px); color: #f0702a; -webkit-text-stroke: 0; }
      .daily-card p { margin: 6px 0; font-size: 16px; line-height: 1.35; }
      .daily-gift { font-size: clamp(64px, 18vh, 110px); line-height: 1.1; cursor: pointer; display: inline-block; animation: dailyBob 1s ease-in-out infinite; user-select: none; }
      .daily-gift.open { animation: dailyPop 0.5s ease-out both; }
      .daily-gain { font-size: 24px; font-weight: 700; color: #2a8a3a; }
      .daily-streak { font-size: 14px; opacity: 0.8; }
      .daily-btn { margin-top: 8px; font: inherit; font-weight: 700; font-size: 18px; padding: 10px 26px; border-radius: 999px; border: 3px solid #2a1408; background: linear-gradient(#ffd84a, #f59a10); color: #3a2010; box-shadow: 0 4px 0 #2a1408; cursor: pointer; }
      @keyframes dailyIn { from { opacity: 0; } }
      @keyframes dailyBob { 50% { transform: translateY(-8px) rotate(-4deg); } }
      @keyframes dailyPop { 0% { transform: scale(1); } 40% { transform: scale(1.35) rotate(8deg); } 100% { transform: scale(1); } }
      @media (max-height: 420px) { .daily-card { padding: 10px 16px 14px; } .daily-card p { font-size: 14px; margin: 3px 0; } }
    `;
    document.head.appendChild(st);
  }

  /** Montre le cadeau s'il n'a pas encore été ouvert aujourd'hui. sfx (optionnel) : bruitages du jeu. */
  function maybeShow(sfx) {
    if (shown) return;
    const s = read(KEY, { last: '', streak: 0 });
    if (s.last === day()) return;
    shown = true;
    css();
    const streak = s.last === yesterday() ? (s.streak || 0) + 1 : 1;
    const gain = streak >= 7 ? 50 : 10 + Math.min(streak, 6) * 5;   // 15, 20 … 40, puis 50 le 7e jour de suite
    const ov = document.createElement('div'); ov.className = 'daily-ov';
    ov.innerHTML = `<div class="daily-card" role="dialog" aria-label="Le cadeau du jour">
      <h3>Le cadeau du jour de Mamie</h3>
      <p>Touche le paquet pour l'ouvrir !</p>
      <div class="daily-gift" aria-hidden="true">🎁</div>
      <div class="daily-after" hidden>
        <div class="daily-gain">+${gain} trésors pour ta niche !</div>
        <p class="daily-streak">${streak > 1 ? `${streak} jours de suite : bravo ! ${streak < 7 ? 'Reviens demain, le cadeau sera encore plus gros.' : ''}` : 'Reviens demain : chaque jour de suite, le cadeau grossit !'}</p>
        <p>🐾 Le savais-tu ? ${FACTS[Math.floor(Math.random() * FACTS.length)]}</p>
        <button class="daily-btn">Merci Mamie !</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const gift = ov.querySelector('.daily-gift');
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      try { if (sfx) { sfx.unlock && sfx.unlock(); sfx.stinger ? sfx.stinger('medal') : sfx.win && sfx.win(); } } catch (e) { /* ignore */ }
      gift.textContent = '🦴'; gift.classList.add('open');
      ov.querySelector('.daily-after').hidden = false;
      ov.querySelector('p').hidden = true;
      const p = read(PROFILE, {}); p.total = (p.total || 0) + gain; write(PROFILE, p);
      write(KEY, { last: day(), streak });
    };
    gift.addEventListener('click', open);
    ov.addEventListener('click', (e) => {
      if (e.target.classList.contains('daily-btn') || (opened && e.target === ov)) ov.remove();
    });
  }

  window.DailyGift = { maybeShow };
})();
