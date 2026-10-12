// Tests des données du niveau 3 (Port-Croquette) : node test/level3.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level3.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 3');

const solid = (c) => (c.solid || ['trunk', 'tree', 'rock'].includes(c.kind)) && !c.off;
/** Le point (x, z), pieds à y, est-il dans un obstacle solide ? */
const inSolid = (x, z, y, m) => L.colliders.some(c => solid(c) && L.inside(c, x, z, m === undefined ? 0.5 : m) && c.y1 > y + 0.05 && c.y0 < y + 1.5);
const onRoad = (p) => L.onRoad(p.x, p.z);

test('100 pièces d\'or, aucune dans un mur', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) assert.ok(!inSolid(b.x, b.z, b.y - 1.1, 0.3), b.id + ' dans un obstacle');
});

test('les pièces sont à portée de saut (sauf celles à attraper en kart au-dessus des rampes)', () => {
  const air = L.bones.filter(b => b.y - L.supportAt(b.x, b.z, b.y, 0, 0).y > 2.4);
  assert.ok(air.length <= 7, air.length + ' pièces en l\'air');
  for (const b of air) assert.ok(L.ramps.some(r => Math.hypot(r.x - b.x, r.z - b.z) < 12), b.id + ' en l\'air loin d\'une rampe');
});

test('5 missions, 5 trophées, des habitants et des karts hors des murs', () => {
  assert.strictEqual(L.MISSIONS.length, 5);
  assert.strictEqual(L.medals.length, 5);
  for (const k in L.GIVERS) assert.ok(!inSolid(L.GIVERS[k].x, L.GIVERS[k].z, 2), k);
  assert.ok(L.KARTS.length >= 6, 'un kart par joueur');
  for (const k of L.KARTS) assert.ok(!inSolid(k.x, k.z, 2, 1.0), k.id);
  for (const d of L.DELIVERY.drops) assert.ok(!inSolid(d.x, d.z, 2), d.id);
  assert.ok(!inSolid(L.START.x, L.START.z, 2));
});

test('course, voleur et Capitaine roulent sur les rues', () => {
  for (const p of L.RACE.cps) assert.ok(onRoad(p), 'balise ' + p.x + ',' + p.z);
  assert.ok(onRoad(L.RACE.start));
  for (const p of L.BOSS.route) assert.ok(onRoad(p));
  // le voleur ne traverse aucun immeuble (on teste le trajet tous les 0,5 m)
  const r = L.THIEF.route;
  for (let i = 1; i < r.length; i++) {
    const n = Math.ceil(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) / 0.5);
    for (let k = 0; k <= n; k++) {
      const x = r[i - 1].x + (r[i].x - r[i - 1].x) * k / n, z = r[i - 1].z + (r[i].z - r[i - 1].z) * k / n;
      assert.ok(!inSolid(x, z, 2, 0.3), `voleur bloqué en ${x.toFixed(1)},${z.toFixed(1)}`);
      assert.ok(L.supportAt(x, z, 2.5).y > 1.5, `voleur dans l'eau en ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
});

test('balcons : on grimpe jusqu\'au toit par sauts de moins de 2,1 m', () => {
  const withB = L.buildings.filter(b => b.balconies);
  assert.ok(withB.length >= 4, 'assez d\'immeubles à escalader');
  for (const b of withB) {
    const tops = [L.GROUND, ...b.balconies.map(q => q.top), b.top];
    for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= 2.1, `immeuble ${b.x0},${b.z0} marche ${i}`);
  }
});

test('auvents rebondissants : assez puissants pour atteindre le toit', () => {
  for (const a of L.awnings) {
    const apex = a.top + 18.5 * 18.5 / 64 + 1.7;          // rebond + double saut
    assert.ok(apex > a.b.top + 0.3, `auvent devant l'immeuble ${a.b.x0},${a.b.z0}`);
  }
});

test('phare : escalier en spirale de marches de 1,5 m, sommet accessible', () => {
  const tops = [L.GROUND, ...L.lighthouseSteps.map(s => s.top), L.LIGHTHOUSE.top];
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= 1.6, 'marche ' + i);
  for (const s of L.lighthouseSteps) assert.ok(Math.hypot(s.x - L.LIGHTHOUSE.x, s.z - L.LIGHTHOUSE.z) - s.r > L.LIGHTHOUSE.r, 'marche dans le phare');
});

test('le quai et la jetée : on marche dessus, la mer est au-delà', () => {
  assert.ok(L.heightAt(0, 50) < -1, 'mer au sud');
  assert.strictEqual(L.supportAt(26, 55, 2.1).y, L.GROUND, 'jetée');
  assert.strictEqual(L.supportAt(26, 70 - 5, 2.1).y, L.GROUND, 'plate-forme du phare');
  assert.ok(L.heightAt(0, 0) === L.GROUND && L.heightAt(-60, -60) === L.GROUND);
});

test('rampes : la hauteur monte dans le bon sens', () => {
  for (const r of L.ramps) {
    const lo = { px: [r.x - r.w / 2, r.z], nx: [r.x + r.w / 2, r.z], pz: [r.x, r.z - r.d / 2], nz: [r.x, r.z + r.d / 2] }[r.dir];
    const hi = { px: [r.x + r.w / 2, r.z], nx: [r.x - r.w / 2, r.z], pz: [r.x, r.z + r.d / 2], nz: [r.x, r.z - r.d / 2] }[r.dir];
    assert.ok(Math.abs(L.rampTop(r, ...lo) - L.GROUND) < 0.01);
    assert.ok(Math.abs(L.rampTop(r, ...hi) - (L.GROUND + r.h)) < 0.01);
  }
});

test('les chats ne traversent pas les murs, le gang attend sur le quai', () => {
  for (const c of L.cats) assert.ok(!L.blockedAt(c.x, c.z), c.id);
  assert.strictEqual(L.cats.filter(c => c.group === 'gang').length, 5);
});

console.log(`${passed} tests réussis`);
