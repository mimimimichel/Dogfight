// Tests des données du niveau 3 (Port-Croquette, la grande ville) : node test/level3.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level3.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 3');

const solid = (c) => (c.solid || ['trunk', 'tree', 'rock'].includes(c.kind)) && !c.off;
/** Le point (x, z), pieds à y, est-il dans un obstacle solide ? */
const inSolid = (x, z, y, m) => L.near(x, z, 3).some(c => solid(c) && L.inside(c, x, z, m === undefined ? 0.5 : m) && c.y1 > y + 0.05 && c.y0 < y + 1.5);
const ground = (x, z) => L.supportAt(x, z, 99, 0, 99).y;

test('une grande ville : 440 m de côté, plus de 120 immeubles, des maisons, des docks', () => {
  assert.strictEqual(L.WORLD, 440);
  assert.ok(L.buildings.length > 120, L.buildings.length + ' bâtiments');
  assert.ok(L.houses.length > 30 && L.containers.length > 30 && L.villas.length >= 6);
  assert.ok(L.ROADS.length > 20);
});

test('la grille spatiale retrouve les mêmes obstacles que la liste complète', () => {
  for (const [x, z] of [[-43, 0], [-160, 120], [64, 74], [145, -112], [-82, -170], [10, 171]]) {
    const all = L.colliders.filter(c => L.inside(c, x, z, 0.3)).length;
    const near = L.near(x, z, 0.3).filter(c => L.inside(c, x, z, 0.3) && L.colliders.includes(c)).length;
    assert.strictEqual(near, all, `en ${x},${z}`);
  }
});

test('100 pièces d\'or, aucune dans un mur', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) assert.ok(!inSolid(b.x, b.z, b.y - 1.1, 0.3), b.id + ' dans un obstacle');
});

test('12 missions, 12 trophées, des habitants et des karts hors des murs', () => {
  assert.strictEqual(L.MISSIONS.length, 12);
  assert.strictEqual(L.medals.length, 12);
  assert.strictEqual(L.FINAL_MEDAL, 'm_boss');
  for (const k in L.GIVERS) assert.ok(!inSolid(L.GIVERS[k].x, L.GIVERS[k].z, L.GIVERS[k].y), k);
  assert.ok(L.KARTS.length >= 6, 'un kart par joueur');
  for (const k of L.KARTS) assert.ok(!inSolid(k.x, k.z, k.y, 1.0), k.id);
  for (const d of L.DELIVERY.drops) assert.ok(!inSolid(d.x, d.z, d.y), d.id);
  assert.ok(!inSolid(L.START.x, L.START.z, L.START.y));
});

test('courses, voleur, Capitaine et circulation roulent sur les rues', () => {
  for (const p of L.RACE.cps) assert.ok(L.onRoad(p.x, p.z), 'Grand Prix ' + p.x + ',' + p.z);
  for (const p of L.BOSS.route) assert.ok(L.onRoad(p.x, p.z));
  for (const p of L.DOWNHILL.cps) assert.ok(L.onRoad(p.x, p.z), 'descente ' + p.x + ',' + p.z);
  for (const T of L.TRAFFIC) for (const p of T.pts) assert.ok(L.onRoad(p[0], p[1]), 'circulation ' + p);
  const r = L.THIEF.route;
  for (let i = 1; i < r.length; i++) {
    const n = Math.ceil(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) / 0.5);
    for (let k = 0; k <= n; k++) {
      const x = r[i - 1].x + (r[i].x - r[i - 1].x) * k / n, z = r[i - 1].z + (r[i].z - r[i - 1].z) * k / n;
      const y = ground(x, z);
      assert.ok(!inSolid(x, z, y, 0.3), `voleur bloqué en ${x.toFixed(1)},${z.toFixed(1)}`);
      assert.ok(y > 1.5, `voleur dans l'eau en ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
});

test('balcons : on grimpe jusqu\'au toit par sauts de moins de 2,1 m', () => {
  const withB = L.buildings.filter(b => b.balconies);
  assert.ok(withB.length >= 15, 'assez d\'immeubles à escalader');
  for (const b of withB) {
    const tops = [b.ground, ...b.balconies.map(q => q.top), b.top];
    for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] <= 2.1, `immeuble ${b.x0},${b.z0} marche ${i}`);
  }
});

test('escaliers (phare, grues, observatoire, château d\'eau) : marches de moins de 2 m', () => {
  const chk = (name, base, steps, top) => { const t = [base, ...steps.map(s => s.top), top]; for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] <= 2.0, `${name} marche ${i} : ${(t[i] - t[i - 1]).toFixed(2)}`); };
  chk('phare', L.GROUND, L.lighthouseSteps, L.LIGHTHOUSE.top);
  for (const c of L.CRANES) chk('grue', L.GROUND, c.steps, c.top);
  chk('observatoire', L.OBS_Y, L.obsSteps, L.OBSERVATORY.top);
  chk('château d\'eau', L.WATER_TOWER.g, L.WATER_TOWER.steps, L.WATER_TOWER.top);
});

test('ascenseurs : en bas puis en haut des gratte-ciel', () => {
  for (const e of L.elevators) {
    assert.ok(Math.abs(L.elevTop(e, -e.phase) - e.y0e) < 0.01);
    assert.ok(Math.abs(L.elevTop(e, e.period * 0.6 - e.phase) - e.y1e) < 0.01);
  }
});

test('grande roue : la nacelle du bas se prend à pied, celle du haut domine la ville', () => {
  const low = Math.min(...[0, 10, 20, 30, 40, 50, 60].flatMap(t => L.wheelAt(t).map(p => p.y)));
  const high = Math.max(...L.wheelAt(0).map(p => p.y));
  assert.ok(low - L.GROUND < 2.2, 'nacelle du bas trop haute : ' + low);
  assert.ok(high > 30);
});

test('le port, la plage et la mer', () => {
  assert.ok(L.heightAt(-40, 140) < -1, 'bassin du port');
  assert.ok(L.heightAt(100, 140) < 0, 'mer devant la plage');
  assert.ok(L.heightAt(100, 112) > 0, 'sable');
  assert.ok(L.heightAt(L.LAKE.x, L.LAKE.z) < 0, 'lac du parc');
  assert.strictEqual(ground(10, 140), L.GROUND, 'jetée');
  assert.ok(Math.abs(ground(-160, L.GANGWAY.z1 - 0.5) - L.SHIP.deck) < 0.5, 'passerelle du cargo');
});

test('rampes : la hauteur monte dans le bon sens, chaque saut a sa rampe', () => {
  for (const r of L.ramps) {
    const lo = { px: [r.x - r.w / 2, r.z], nx: [r.x + r.w / 2, r.z], pz: [r.x, r.z - r.d / 2], nz: [r.x, r.z + r.d / 2] }[r.dir];
    const hi = { px: [r.x + r.w / 2, r.z], nx: [r.x - r.w / 2, r.z], pz: [r.x, r.z + r.d / 2], nz: [r.x, r.z - r.d / 2] }[r.dir];
    assert.ok(Math.abs(L.rampTop(r, ...lo) - r.base) < 0.01);
    assert.ok(Math.abs(L.rampTop(r, ...hi) - (r.base + r.h)) < 0.01);
  }
  for (const s of L.STUNTS) assert.ok(L.ramps[s.ramp], s.id);
});

test('les chats ne traversent pas les murs, le gang attend aux docks', () => {
  for (const c of L.cats) assert.ok(!L.blockedAt(c.x, c.z), c.id);
  assert.strictEqual(L.cats.filter(c => c.group === 'gang').length, 8);
});

console.log(`${passed} tests réussis`);
