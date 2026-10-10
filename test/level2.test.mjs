// Tests des données du niveau 2 de l'aventure : node test/level2.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level2.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 2');

test('100 croquettes dorées, toutes au-dessus de l\'eau et sur l\'île', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) { assert.ok(b.y > 1, b.id + ' trop bas'); assert.ok(Math.hypot(b.x, b.z) < L.ISLAND_R, b.id + ' hors de l\'île'); }
});

test('5 médailles, 5 lanternes, 5 chats au campement', () => {
  assert.strictEqual(L.medals.length, 5);
  assert.strictEqual(L.lanterns.length, 5);
  assert.strictEqual(L.cats.filter(c => c.group === 'clearing').length, 5);
});

test('le départ, Mamie et Biscotte sont sur la terre ferme', () => {
  assert.ok(L.START.y > 1);
  assert.ok(L.npcs.mamie.y > 1);
  assert.ok(L.npcs.puppy.y > 1);
});

test('Tour des Champignons : marches de moins de 2 m (saut simple)', () => {
  const tops = L.towerCaps.map(s => s.top).concat([L.TOWER_TOP]);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 2.0, 'marche ' + i);
});

test('le Rocher du Hibou est une falaise au milieu du lac', () => {
  assert.ok(Math.abs(L.heightAt(L.OWL.x, L.OWL.z) - L.OWL_TOP) < 0.01);
  assert.ok(L.heightAt(L.OWL.x + L.OWL.r + 2.5, L.OWL.z) < 0, 'pas d\'eau autour du rocher');
});

test('feuilles magiques : marches de moins de 2,5 m, absentes au départ', () => {
  const tops = L.leaves.map(l => l.top).concat([L.OWL_TOP]);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 2.5, 'feuille ' + i);
  assert.ok(L.leaves.every(l => l.col.off));
  assert.strictEqual(L.supportAt(L.leaves[0].x, L.leaves[0].z, 10, 0).collider, null);
});

test('champignons rebondissants : le grand permet d\'atteindre la souche', () => {
  const big = L.BIG_BOUNCER, G = 32;
  const apex = big.top + big.bounce ** 2 / (2 * G) + 10.5 ** 2 / (2 * G);
  assert.ok(apex > L.STUMP.top + 0.5, 'apex ' + apex.toFixed(1) + ' < souche ' + L.STUMP.top.toFixed(1));
});

test('la porte du repaire est un obstacle tant qu\'elle est fermée', () => {
  assert.ok(L.GATE.solid);
  assert.ok(!L.GATE.off);
  assert.strictEqual(L.GATE_MEDALS, 4);
});

test('aucun arbre sur les chemins, les lanternes ou le campement', () => {
  for (const t of L.trees) {
    assert.ok(Math.hypot(t.x - L.SPOTS.camp.x, t.z - L.SPOTS.camp.z) > 14, 'arbre dans le campement');
    for (const l of L.lanterns) assert.ok(Math.hypot(t.x - l.x, t.z - l.z) > 2.9, 'arbre sur une lanterne');
  }
});

console.log(`\n${passed} test(s) réussi(s)`);
