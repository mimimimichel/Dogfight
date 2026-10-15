// Tests des données du niveau 7 (la Ferme de Papi Berger) : node test/level7.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level7.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 7');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5;
const H1 = V1 * V1 / (2 * G);
const reach = (dy) => (dy > H1 ? 0 : RUN * (V1 / G + Math.sqrt(2 * (H1 - dy) / G)));
const solidAt = (x, z, y) => L.colliders.filter(c => (c.solid || ['tree', 'rock'].includes(c.kind)) && !c.off && L.inside(c, x, z, 0.2) && c.y1 > y - 1.1 && c.y0 < y);

test('100 os dorés, sur la terre ferme (ou une plate-forme) et jamais dans un mur', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) {
    const s = L.supportAt(b.x, b.z, b.y, 0, 0);
    assert.ok(b.y - s.y < 2.0 && b.y - s.y > 0.5, b.id + ' trop haut ou trop bas');
    assert.ok(Math.hypot(b.x, b.z) < L.ISLAND_R, b.id + ' hors de l\'île');
    assert.ok(!L.inWater(b.x, b.z) || s.collider, b.id + ' dans la mare');
    assert.strictEqual(solidAt(b.x, b.z, b.y).length, 0, b.id + ' dans un obstacle');
  }
});

test('5 médailles (moutons, œufs, Caramel, grenier, moulin), cachées au départ', () => {
  assert.deepStrictEqual(L.medals.map(m => m.id), ['m_sheep', 'm_eggs', 'm_piglet', 'm_cats', 'm_mill']);
  assert.ok(L.medals.every(m => m.visible === false));
  assert.strictEqual(L.cats.filter(c => c.group === 'clearing').length, 4);
});

test('le départ, Mamie, Biscotte, Papi Berger et les drapeaux sont sur la terre ferme', () => {
  for (const p of [L.START, L.npcs.mamie, L.npcs.puppy, L.npcs.papi, ...L.CHECKPOINTS]) assert.ok(p.y > 1.5, JSON.stringify(p));
  assert.ok(L.CHECKPOINTS.length >= 5);
});

test('8 moutons dans le pré, hors de l\'enclos, sans obstacle', () => {
  assert.strictEqual(L.SHEEP.length, 8);
  for (const s of L.SHEEP) {
    assert.ok(!L.inPen(s.x, s.z), s.id + ' déjà dans l\'enclos');
    assert.ok(s.y > 1.5 && !L.inWater(s.x, s.z), s.id + ' dans l\'eau');
    assert.strictEqual(solidAt(s.x, s.z, s.y + 0.5).length, 0, s.id + ' dans un obstacle');
    if (!s.lamb) assert.ok(s.z > L.GATE_Z && Math.hypot(s.x - L.GATE.x, s.z - L.GATE_Z) < 45, s.id + ' loin du pré ou derrière l\'enclos');
  }
});

test('la porte de l\'enclos est large et libre, l\'intérieur compte comme « rentré »', () => {
  assert.ok(L.GATE.w >= 6, 'porte trop étroite');
  for (let dx = -L.GATE.w / 2 + 1; dx <= L.GATE.w / 2 - 1; dx += 0.5) {
    for (let dz = -2; dz <= 2; dz += 0.5) {
      const x = L.GATE.x + dx, z = L.GATE_Z + dz;
      assert.strictEqual(L.colliders.filter(c => c.kind === 'fence' && L.inside(c, x, z, 0.3)).length, 0, `barrière dans la porte (${x}, ${z})`);
    }
  }
  assert.ok(L.inPen(L.PEN.x, L.PEN.z));
  assert.ok(!L.inPen(L.GATE.x, L.GATE_Z + 1));
  const I = L.PEN_INSIDE;
  assert.ok(I.x1 - I.x0 > 12 && I.z1 - I.z0 > 8, 'enclos trop petit pour 8 moutons');
});

test('6 poules dans leur cour, un panier à côté', () => {
  assert.strictEqual(L.HENS.length, 6);
  assert.ok(L.EGGS_NEEDED <= L.HENS.length);
  for (const h of L.HENS) { assert.ok(Math.hypot(h.x - h.home.x, h.z - h.home.z) < h.home.r - 1, h.id + ' hors de chez elle'); assert.ok(h.y > 1.5, h.id + ' dans l\'eau'); }
  assert.strictEqual(L.HENS.filter(h => h.yard).length, 3, '3 poules dans la cour, 3 échappées');
  assert.ok(Math.hypot(L.BASKET.x - L.HENS_YARD.x, L.BASKET.z - L.HENS_YARD.z) < L.HENS_YARD.r);
});

test('grenier à foin : un escalier de bottes à sauts simples', () => {
  const steps = [L.heightAt(L.LOFT_BALES[0].x, L.LOFT_BALES[0].z + 2), ...L.LOFT_BALES.map(b => b.top), L.LOFT.top];
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] < 1.4, `marche ${i} : ${(steps[i] - steps[i - 1]).toFixed(2)} m`);
  const last = L.LOFT_BALES[L.LOFT_BALES.length - 1];
  const gap = (L.LOFT.x - L.LOFT.w / 2) - (last.x + last.w / 2);
  assert.ok(gap < 0.6, 'la dernière botte touche le grenier');
  assert.ok(L.cats.filter(c => c.group === 'clearing').every(c => Math.abs(c.x - L.LOFT.x) < L.LOFT.w / 2 && Math.abs(c.z - L.LOFT.z) < L.LOFT.d / 2), 'chats sur le grenier');
});

test('le moulin : escalier de marches de moins d\'un mètre, jusqu\'au balcon', () => {
  let prev = { x: L.MILL_STEPS[0].x, z: L.MILL_STEPS[0].z, r: 0, top: L.MILL.y };
  for (const s of L.MILL_STEPS) {
    assert.ok(s.top - prev.top < 1.0, 'marche trop haute');
    const gap = Math.hypot(s.x - prev.x, s.z - prev.z) - s.r - prev.r;
    assert.ok(gap < reach(s.top - prev.top) * 0.4, `écart ${gap.toFixed(2)} m`);
    prev = s;
  }
  const B = L.BALCONY, last = L.MILL_STEPS[L.MILL_STEPS.length - 1];
  assert.ok(B.top - last.top < 1.0);
  assert.ok(Math.hypot(last.x - B.x, last.z - B.z) - last.r - B.r < 0.3, 'balcon à portée');
  const m = L.medals.find(q => q.id === 'm_mill');
  assert.ok(Math.hypot(m.x - B.x, m.z - B.z) < B.r && Math.hypot(m.x - B.x, m.z - B.z) > L.MILL.r, 'médaille sur le balcon');
});

test('la mare : ponton, pierres de gué et îlot se suivent (aile du moulin sur l\'îlot)', () => {
  const J = L.JETTY;
  const path = [{ x: J.x, z: J.z1, r: 0.6, top: J.top }, ...L.STONES, L.ISLET];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
    assert.ok(gap < reach(b.top - a.top) * 0.4, `saut ${i} : ${gap.toFixed(2)} m`);
  }
  for (const s of L.STONES) assert.ok(L.inWater(s.x, s.z), 'pierre dans l\'eau');
  assert.ok(L.SAIL_PARTS.some(p => Math.hypot(p.x - L.ISLET.x, p.z - L.ISLET.z) < 0.1));
  assert.strictEqual(L.SAIL_PARTS.length, 3);
});

test('Caramel est perdu dans les tournesols, sa maison est l\'enclos des cochons (avec la boue)', () => {
  const S = L.SUNFLOWERS, P = L.PIGPEN;
  assert.ok(Math.abs(L.PIGLET.x - S.x) < S.w / 2 && Math.abs(L.PIGLET.z - S.z) < S.d / 2);
  assert.ok(Math.abs(L.PIGLET_HOME.x - P.x) < P.w / 2 && Math.abs(L.PIGLET_HOME.z - P.z) < P.d / 2);
  assert.ok(Math.abs(L.MUD.x - P.x) < P.w / 2 && Math.abs(L.MUD.z - P.z) < P.d / 2);
});

test('arbres : pas sur les chemins, ni dans l\'enclos ; 8 pommiers au verger', () => {
  assert.strictEqual(L.APPLE_TREES.length, 8);
  for (const t of L.trees) {
    assert.ok(!(Math.abs(t.x - L.PEN.x) < L.PEN.w / 2 + 2 && Math.abs(t.z - L.PEN.z) < L.PEN.d / 2 + 2), 'arbre dans l\'enclos');
    assert.ok(t.y > 1.2, 'arbre dans l\'eau');
  }
});

test('un grand monde à explorer : les missions et les os sont répartis partout', () => {
  assert.ok(L.WORLD >= 380 && L.ISLAND_R >= 170, 'monde trop petit');
  const xs = L.bones.map(b => b.x), zs = L.bones.map(b => b.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 230 && Math.max(...zs) - Math.min(...zs) > 260, 'os trop regroupés');
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (const s of L.SHEEP.filter(q => q.lamb)) assert.ok(d(s, { x: L.GATE.x, z: L.GATE_Z }) > 90, s.id + ' (agneau) trop près de l\'enclos');
  assert.strictEqual(L.SHEEP.filter(q => q.lamb).length, 2);
  for (const h of L.HENS.filter(q => !q.yard)) assert.ok(d(h, L.HENS_YARD) > 60, h.id + ' (poule échappée) trop près');
  for (let i = 0; i < L.SAIL_PARTS.length; i++) for (let j = i + 1; j < L.SAIL_PARTS.length; j++) assert.ok(d(L.SAIL_PARTS[i], L.SAIL_PARTS[j]) > 80, 'ailes du moulin trop proches');
  for (const p of L.SAIL_PARTS) assert.ok(d(p, L.MILL) > 60, 'aile trop près du moulin');
  assert.ok(d(L.SPOTS.yard, L.MILL) > 100 && d(L.SPOTS.yard, L.PEN) > 100 && d(L.START, L.SPOTS.yard) > 60, 'lieux trop proches');
  assert.ok(d(L.PIGLET, L.PIGLET_HOME) > 120, 'Caramel trop près de chez lui');
});

test('le Rocher aux Corbeaux se grimpe de pierre en pierre', () => {
  let prev = { x: L.CROW_ROCKS[0].x + L.CROW_ROCKS[0].r + 0.5, z: L.CROW_ROCKS[0].z, r: 0, top: L.CROW_ROCKS[0].y };
  for (const k of L.CROW_ROCKS) {
    assert.ok(k.top - prev.top < 1.4, 'pierre trop haute');
    assert.ok(Math.hypot(k.x - prev.x, k.z - prev.z) - k.r - prev.r < reach(k.top - prev.top) * 0.4, 'pierre trop loin');
    prev = k;
  }
});

console.log(`\n${passed} test(s) réussi(s)`);
