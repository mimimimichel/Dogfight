'use strict';
/* Tests du moteur de combat : node test/sim.test.js */
const assert = require('assert');
const C = require('../public/game-core.js');
const { IN } = C;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.stack); process.exitCode = 1; }
}

function skipIntro(g) { while (g.phase === 'intro') g.tick(); }
function run(g, n, b0, b1) { for (let i = 0; i < n; i++) { g.setInput(0, b0 || 0); g.setInput(1, b1 || 0); g.tick(); } }

console.log('Dogfight — moteur');

test('la manche démarre après l\'intro', () => {
  const g = new C.Game(['ainu', 'matcha']);
  assert.strictEqual(g.phase, 'intro');
  skipIntro(g);
  assert.strictEqual(g.phase, 'fight');
});

test('marcher vers l\'avant rapproche les combattants', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  const x0 = g.fighters[0].x;
  run(g, 30, IN.RIGHT, 0);
  assert.ok(g.fighters[0].x > x0 + 50);
});

test('une morsure au contact inflige des dégâts', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].x = 400; g.fighters[1].x = 490;
  run(g, 1, IN.LIGHT, 0);
  run(g, 20, 0, 0);
  assert.ok(g.fighters[1].hp < C.CHARACTERS.matcha.maxHp, 'hp=' + g.fighters[1].hp);
});

test('un appui bref entre deux ticks n\'est pas perdu', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.setInput(0, IN.LIGHT);
  g.setInput(0, 0);
  g.tick();
  assert.strictEqual(g.fighters[0].state, 'attack');
});

test('la garde (arrière) bloque une attaque moyenne', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].x = 400; g.fighters[1].x = 490;
  const hp = g.fighters[1].hp;
  // Matcha est à droite : l'arrière, c'est la droite
  g.setInput(1, IN.RIGHT);
  g.setInput(0, IN.LIGHT);
  g.tick();
  let blocked = false;
  for (let i = 0; i < 20; i++) {
    g.setInput(0, 0); g.setInput(1, IN.RIGHT); g.tick();
    if (g.fighters[1].state === 'blockstun') blocked = true;
  }
  assert.ok(blocked, 'devrait être en garde');
  assert.strictEqual(g.fighters[1].hp, hp);
});

test('une attaque basse passe la garde debout', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].x = 400; g.fighters[1].x = 490;
  const hp = g.fighters[1].hp;
  g.setInput(1, IN.RIGHT);
  g.setInput(0, IN.DOWN | IN.LIGHT);
  g.tick();
  run(g, 20, IN.DOWN, IN.RIGHT);
  assert.ok(g.fighters[1].hp < hp);
});

test('la boule de poils d\'Ainu traverse l\'écran et touche', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  run(g, 1, IN.SPECIAL, 0);
  run(g, 20, 0, 0);
  assert.strictEqual(g.projectiles.length, 1);
  run(g, 120, 0, 0);
  assert.ok(g.fighters[1].hp < C.CHARACTERS.matcha.maxHp);
});

test('la Charge Pinscher fait chuter', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].x = 400; g.fighters[1].x = 600;
  run(g, 1, 0, IN.SPECIAL);
  let fell = false;
  for (let i = 0; i < 40; i++) { run(g, 1, 0, 0); if (g.fighters[0].state === 'airhit' || g.fighters[0].state === 'knockdown') fell = true; }
  assert.ok(fell);
});

test('le super nécessite une jauge pleine puis la vide', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  run(g, 1, IN.SUPER, 0);
  assert.notStrictEqual(g.fighters[0].move, 'super');
  run(g, 5, 0, 0);
  g.fighters[0].meter = C.METER_MAX;
  run(g, 1, IN.SUPER, 0);
  assert.strictEqual(g.fighters[0].move, 'super');
  assert.strictEqual(g.fighters[0].meter, 0);
  run(g, 200, 0, 0);
  assert.ok(g.fighters[1].hp < C.CHARACTERS.matcha.maxHp - 150, 'hp=' + g.fighters[1].hp);
});

test('Rafale Matcha touche plusieurs fois', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].x = 400; g.fighters[1].x = 600;
  g.fighters[1].meter = C.METER_MAX;
  let hits = 0;
  g.setInput(1, IN.SUPER);
  for (let i = 0; i < 200; i++) {
    g.tick();
    g.setInput(1, 0);
    hits += g.events.filter(e => e.type === 'hit').length;
  }
  assert.ok(hits >= 4, 'hits=' + hits);
});

test('un K.O. donne la manche et relance la suivante', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[1].hp = 1;
  g.fighters[0].x = 400; g.fighters[1].x = 490;
  run(g, 1, IN.LIGHT, 0);
  run(g, 30, 0, 0);
  assert.strictEqual(g.phase, 'ko');
  run(g, 400, 0, 0);
  assert.strictEqual(g.wins[0], 1);
  assert.strictEqual(g.round, 2);
});

test('temps écoulé : le plus en forme gagne', () => {
  const g = new C.Game(['ainu', 'matcha']);
  skipIntro(g);
  g.fighters[0].hp = 500;
  g.timer = 1;
  run(g, 61, 0, 0);
  assert.strictEqual(g.phase, 'ko');
  assert.strictEqual(g.roundWinner, 1);
});

test('les combattants ne se traversent pas et restent dans l\'arène', () => {
  const g = new C.Game(['matcha', 'ainu']);
  skipIntro(g);
  run(g, 300, IN.RIGHT, IN.RIGHT);
  const [a, b] = g.fighters;
  assert.ok(a.x < b.x, `${a.x} < ${b.x}`);
  assert.ok(b.x <= C.STAGE_W);
  assert.ok(a.x >= 0);
});

test('ordi contre ordi : des matchs complets sans erreur', () => {
  for (const pair of [['ainu', 'matcha'], ['matcha', 'ainu'], ['ainu', 'ainu'], ['matcha', 'matcha']]) {
    for (let m = 0; m < 3; m++) {
      const g = new C.Game(pair);
      const brains = [new C.CpuBrain(0.9), new C.CpuBrain(0.5)];
      let ticks = 0;
      while (g.phase !== 'matchover' && ticks < 60 * 60 * 10) {
        for (let i = 0; i < 2; i++) g.setInput(i, brains[i].think(g, i));
        g.tick();
        ticks++;
        for (const f of g.fighters) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), 'position invalide');
          assert.ok(f.hp >= 0);
        }
        JSON.stringify(g.snapshot());
      }
      assert.strictEqual(g.phase, 'matchover', `${pair} n'a pas fini`);
    }
  }
});

console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS ci-dessus' : ''));
