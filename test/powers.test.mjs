// Tests des costumes à pouvoir (chapeau-aimant, bottes-ressorts, cape-fusée) : node test/powers.test.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { POWERS, POWER_IDS, PHYS, BOXES, boxesOf, powerCode, decodePower, powerUnlocked, rechargeGauge, canRocket, canPound, jumpHeight } from '../public/adventure/powerdata.js';
import { pupsOf } from '../public/adventure/pupdata.js';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'public/adventure');
const LV = {};
for (let n = 1; n <= 8; n++) LV[n] = await import(path.join(DIR, `level${n}.js`));
const src = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — les costumes à pouvoir');

const BLOCK = new Set(['tree', 'rock', 'trunk', 'wall', 'hedge', 'bldg', 'stump', 'container', 'crack', 'catpile', 'gate', 'obs', 'tank']);
const H_JUMPS = jumpHeight(PHYS.JUMP_V) + jumpHeight(PHYS.DOUBLE_V);   // ≈ 3,97 m sans pouvoir

/** Petite simulation (comme le moteur, pas de 1/60 s) : hauteur max d'un saut. */
function apex(v0, opts = {}) {
  let y = 0, vy = v0, top = 0, t = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 600; i++) {
    t += dt;
    vy -= PHYS.GRAVITY * dt;
    if (opts.rocketAt !== undefined && t >= opts.rocketAt && t < opts.rocketAt + PHYS.ROCKET_T) {
      const k = Math.max(0, Math.min(1, (opts.rocketAt + PHYS.ROCKET_T - t) / PHYS.ROCKET_T));
      vy = PHYS.ROCKET_UP * (0.55 + 0.45 * k);
    }
    y += vy * dt; top = Math.max(top, y);
    if (y < -50) break;
  }
  return top;
}

test('trois pouvoirs, chacun son nom, son indice et sa couleur', () => {
  assert.deepStrictEqual(POWER_IDS, ['magnet', 'boots', 'cape']);
  assert.deepStrictEqual(POWERS.map(p => p.name), ['Chapeau-aimant', 'Bottes-ressorts', 'Cape-fusée']);
  for (const p of POWERS) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), p.id + ' : couleur');
    assert.ok(p.hint && p.hint.length > 10 && p.hint.length < 80, p.id + ' : indice trop long pour un petit');
    assert.ok(p.need > 0 && p.need < 12, p.id + ' : récompenses');
  }
  assert.ok(POWERS[0].need < POWERS[1].need && POWERS[1].need < POWERS[2].need, 'débloqués dans l\'ordre');
});

test('le pouvoir voyage dans le monde partagé (codage aller-retour)', () => {
  for (const power of [null, ...POWER_IDS]) for (const rocketT of [0, 0.3]) for (const pound of [null, { t: 0 }]) {
    const d = decodePower(powerCode({ power, rocketT, pound }));
    assert.deepStrictEqual(d, { power, rocket: rocketT > 0, pound: !!pound });
  }
  assert.deepStrictEqual(decodePower(undefined), { power: null, rocket: false, pound: false });
});

test('garde-robe : un pouvoir se débloque en ouvrant sa boîte, ou avec assez de récompenses', () => {
  assert.strictEqual(powerUnlocked('cape', [], 0), false);
  assert.strictEqual(powerUnlocked('cape', ['cape'], 0), true);
  assert.strictEqual(powerUnlocked('cape', [], 7), true);
  assert.strictEqual(powerUnlocked('magnet', ['boots'], 1), false);
  assert.strictEqual(powerUnlocked('licorne', ['licorne'], 99), false);
});

test('des boîtes à costume dans les 8 mondes (1 ou 2), chaque pouvoir dans plusieurs mondes', () => {
  const count = Object.fromEntries(POWER_IDS.map(id => [id, 0]));
  for (let n = 1; n <= 8; n++) {
    const bx = boxesOf(n);
    assert.ok(bx.length >= 1 && bx.length <= 2, `monde ${n} : ${bx.length} boîtes`);
    assert.strictEqual(new Set(bx.map(b => b.power)).size, bx.length, `monde ${n} : deux fois le même pouvoir`);
    for (const b of bx) { assert.ok(POWER_IDS.includes(b.power), b.power); count[b.power]++; assert.ok(b.where && b.where.length > 6); }
  }
  for (const id of POWER_IDS) assert.ok(count[id] >= 4, `${id} seulement dans ${count[id]} mondes`);
  assert.deepStrictEqual(Object.keys(BOXES).map(Number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('chaque boîte est posée sur un sol plat et libre (pas dans le vide, l\'eau ou un mur)', () => {
  for (let n = 1; n <= 8; n++) {
    const L = LV[n];
    for (const b of boxesOf(n)) {
      const id = `monde ${n} ${b.power}`, s = L.supportAt(b.x, b.z, b.y + 0.8, 0, 0);
      assert.ok(Math.abs(s.y - b.y) < 0.4, `${id} : sol à ${s.y.toFixed(2)} au lieu de ${b.y}`);
      if (L.KILL_Y !== undefined) assert.ok(s.y > L.KILL_Y + 2, id + ' dans le vide');
      if (L.WATER_Y !== undefined && !s.collider) assert.ok(s.y > L.WATER_Y + 0.05, id + ' sous l\'eau');
      for (let a = 0; a < 6.28; a += 0.785) for (const r of [0.6, 1.2]) {
        const q = L.supportAt(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, s.y + 0.8, 0, 0);
        assert.ok(Math.abs(q.y - s.y) < 0.35, `${id} : sol en pente ou bord de plate-forme`);
      }
      const hit = L.colliders.filter(c => !c.off && !c.moving && (c.solid || BLOCK.has(c.kind)) && L.inside(c, b.x, b.z, 1.3) && c.y0 < s.y + 3 && c.y1 > s.y + 0.08);
      assert.strictEqual(hit.length, 0, `${id} dans ${hit.map(c => c.kind).join(', ')}`);
    }
  }
});

test('les boîtes ne cachent rien : ni médaille, ni portail, ni personnage, ni chiot perdu', () => {
  for (let n = 1; n <= 8; n++) {
    const L = LV[n];
    const others = [...L.medals, ...L.balls, ...(L.PORTALS || []), ...(L.CHECKPOINTS || []), ...Object.values(L.npcs || {}), ...pupsOf(n), ...(L.crates || [])].filter(p => p && typeof p.x === 'number');
    for (const b of boxesOf(n)) for (const p of others) {
      const near = Math.hypot(p.x - b.x, p.z - b.z) < 2.5 && Math.abs((p.y === undefined ? b.y : p.y) - b.y) < 3;
      assert.ok(!near, `monde ${n} ${b.power} trop près de ${p.id || p.name || JSON.stringify(p)}`);
    }
    // les anneaux des portails sont grands : on laisse de la place (et la caméra ne s'y cogne pas)
    for (const b of boxesOf(n)) for (const p of L.PORTALS || []) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) > 7, `monde ${n} ${b.power} collé à un portail`);
  }
});

test('on peut atteindre chaque boîte SANS pouvoir (aucun costume n\'est obligatoire)', () => {
  for (let n = 1; n <= 8; n++) {
    const L = LV[n];
    const items = ['FEATHERS', 'lanterns', 'LANTERNS', 'BONNETS', 'SOUVENIRS'].flatMap(k => (Array.isArray(L[k]) ? L[k] : []));
    const spots = [...L.bones, ...L.balls, ...items, ...(L.CHECKPOINTS || []), L.START].filter(b => b && typeof b.x === 'number');
    for (const b of boxesOf(n)) {
      const ok = spots.some(p => {
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        const py = L.supportAt(p.x, p.z, (p.y === undefined ? 200 : p.y) + 0.2, 0, 0).y;
        return d < 22 && py > b.y - H_JUMPS + 0.6;
      });
      assert.ok(ok, `monde ${n} ${b.power} : rien d'atteignable autour`);
    }
    // et la première boîte est tout près du départ (le petit la voit tout de suite)
    const first = boxesOf(n)[0];
    assert.ok(Math.hypot(first.x - L.START.x, first.z - L.START.z) < 25, `monde ${n} : la première boîte est loin du départ`);
  }
});

test('bottes-ressorts : un saut bien plus haut, un rebond de plongeon encore plus haut (sans voler)', () => {
  const h0 = apex(PHYS.JUMP_V), hb = apex(PHYS.BOOT_JUMP_V), hp = apex(PHYS.POUND_BOUNCE);
  assert.ok(Math.abs(h0 - jumpHeight(PHYS.JUMP_V)) < 0.3, 'simulation');
  assert.ok(hb > h0 * 1.6 && hb < h0 * 2.3, `saut des bottes ${hb.toFixed(2)} m (normal ${h0.toFixed(2)} m)`);
  assert.ok(hp > hb && hp < 7, `rebond du plongeon ${hp.toFixed(2)} m`);
  assert.ok(hb + jumpHeight(PHYS.DOUBLE_V) < 8.5, 'trop haut avec le double saut');
  assert.ok(PHYS.POUND_FALL > 20 && PHYS.POUND_HANG < 0.3, 'le plongeon doit être franc');
});

test('cape-fusée : on plane plus lentement, et la fusée ne fait pas voler indéfiniment', () => {
  assert.ok(PHYS.CAPE_FALL < PHYS.GLIDE_FALL * 0.7, 'la cape plane mieux que la queue-hélice');
  assert.ok(PHYS.CAPE_SPEED > 1 && PHYS.CAPE_SPEED < 1.6);
  // saut + double saut puis la fusée au sommet : un bonus de quelques mètres, pas plus
  const base = apex(PHYS.JUMP_V), rk = apex(PHYS.JUMP_V, { rocketAt: PHYS.JUMP_V / PHYS.GRAVITY });
  assert.ok(rk - base > 2 && rk - base < 7, `fusée : +${(rk - base).toFixed(2)} m`);
  // la jauge : vide après la fusée, ne se recharge pas en l'air, pleine après un moment au sol
  assert.strictEqual(rechargeGauge(0, 30, false), 0);
  assert.ok(rechargeGauge(0, PHYS.ROCKET_RECHARGE * 0.5, true) < 0.6);
  assert.strictEqual(rechargeGauge(0, PHYS.ROCKET_RECHARGE + 0.01, true), 1);
  assert.strictEqual(rechargeGauge(undefined, 0, true), 1);
});

test('qui peut quoi : la fusée après le double saut avec la jauge pleine, le plongeon avec les bottes en l\'air', () => {
  const P = (o) => Object.assign({ power: 'cape', grounded: false, jumps: 2, rocketG: 1, rocketT: 0, pound: null, trickT: 0 }, o);
  assert.ok(canRocket(P()));
  assert.ok(!canRocket(P({ jumps: 1 })), 'pas avant le double saut');
  assert.ok(!canRocket(P({ rocketG: 0.4 })), 'jauge vide');
  assert.ok(!canRocket(P({ grounded: true })), 'au sol');
  assert.ok(!canRocket(P({ power: 'boots' })), 'sans la cape');
  assert.ok(!canRocket(P({ rocketT: 0.2 })), 'déjà en fusée');
  assert.ok(canPound(P({ power: 'boots', jumps: 1 })));
  assert.ok(!canPound(P({ power: 'boots', grounded: true })), 'au sol : attaque normale');
  assert.ok(!canPound(P({ power: 'boots', pound: { t: 0 } })), 'déjà en plongeon');
  assert.ok(!canPound(P({ power: 'magnet' })), 'sans les bottes');
});

test('chapeau-aimant : il attire de bien plus loin (mais pas tout le monde d\'un coup)', () => {
  assert.ok(PHYS.MAGNET_R >= 2.5 * 3.0 && PHYS.MAGNET_R <= 12, `rayon ${PHYS.MAGNET_R}`);
  assert.ok(PHYS.MAGNET_DY > 1 && PHYS.MAGNET_DY < 4.5);
});

test('le moteur branche les pouvoirs (physique, monde partagé, garde-robe) sans toucher aux boss', () => {
  const g = src('game.js');
  for (const s of ['powers.jumpV(', 'powers.airJump(', 'powers.tryPound(', 'powers.move(', 'powers.land(', 'powers.step(', 'powers.render(', 'powers.code(P)', 'powers.applyNet(P, q[18])', 'powers.remoteWear(', 'powers.wardrobeHtml()', "a.startsWith('power:')"]) assert.ok(g.includes(s), 'game.js : ' + s);
  assert.ok(/send\(\{ t: 'in',[^}]*pw \}/.test(g), 'l\'ami envoie son pouvoir avec ses commandes');
  // les niveaux (et leurs boss) ne dépendent pas des pouvoirs
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !['game.js', 'powers.js', 'powerdata.js', 'wardrobe.js'].includes(f))) assert.ok(!/\b(P|Q|me|p|q)\.power\b|powers\./.test(src(f)), f + ' parle des pouvoirs');
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  assert.ok(sw.includes("'adventure/powers.js'") && sw.includes("'adventure/powerdata.js'"), 'sw.js : fichiers hors ligne');
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pj.scripts.test.includes('test/powers.test.mjs'));
});

test('la tenue (et les pouvoirs trouvés) est rangée dans la garde-robe du joueur', () => {
  const w = src('wardrobe.js');
  assert.ok(/power: null, found: \[\]/.test(w), 'outfit() : power et found');
  assert.ok(/export function hatSpot/.test(w));
  const p = src('powers.js');
  assert.ok(p.includes('WR.setOutfit(o)') && p.includes('o.found'), 'powers.js range le pouvoir porté et trouvé');
});

console.log(`${passed} tests OK`);
