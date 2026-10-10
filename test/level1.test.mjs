// Tests des données du niveau 1 de l'aventure : node test/level1.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level1.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 1');

test('100 os dorés, tous au-dessus de l\'eau et sur l\'île', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) { assert.ok(b.y > 1, b.id + ' trop bas'); assert.ok(Math.hypot(b.x, b.z) < L.ISLAND_R, b.id + ' hors de l\'île'); }
});

test('5 médailles, 5 balles, 4 chats dans la clairière', () => {
  assert.strictEqual(L.medals.length, 5);
  assert.strictEqual(L.balls.length, 5);
  assert.strictEqual(L.cats.filter(c => c.group === 'clearing').length, 4);
  assert.ok(L.crates.some(c => c.content === 'medal'));
});

test('le départ et Mamie sont sur la terre ferme', () => {
  assert.ok(L.START.y > 1);
  assert.ok(L.npcs.mamie.y > 1);
});

test('escalier du Grand Chêne : marches de moins de 2 m (saut simple)', () => {
  const tops = L.treeSteps.map(s => s.top).concat([L.TREE_TOP]);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 2.0, 'marche ' + i);
});

test('le tronc ne dépasse pas la plate-forme du sommet', () => {
  const trunk = L.colliders.find(c => c.kind === 'trunk');
  assert.ok(trunk.y1 < L.TREE_TOP);
});

test('le plateau est entouré d\'une falaise et atteignable par l\'ascenseur', () => {
  const top = L.heightAt(L.SPOTS.plateau.x, L.SPOTS.plateau.z);
  assert.ok(top - L.heightAt(L.SPOTS.plateau.x + 12, L.SPOTS.plateau.z) > 6);
  assert.ok(Math.abs(L.ELEVATOR.high - top) < 0.2);
  assert.ok(Math.abs(L.elevatorTop(9 * 0.55) - L.ELEVATOR.high) < 1e-6);
  assert.ok(Math.abs(L.elevatorTop(0) - L.ELEVATOR.low) < 1e-6);
});

test('le lac est sous l\'eau, les galets dépassent', () => {
  assert.ok(L.heightAt(L.SPOTS.lake.x, L.SPOTS.lake.z) < L.WATER_Y - 2);
  for (const s of L.stones) assert.ok(s.top > L.WATER_Y + 0.4);
});

test('supportAt tient compte des plates-formes', () => {
  const s = L.treeSteps[3];
  assert.strictEqual(L.supportAt(s.x, s.z, s.top + 0.1, 0).y, s.top);
  assert.ok(L.supportAt(s.x, s.z, s.top - 3, 0).y < s.top); // trop haut pour y monter d'un pas
});

console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS ci-dessus' : ''));
