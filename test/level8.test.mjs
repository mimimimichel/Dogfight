// Tests des données du niveau 8 (le Château des Chats) : node test/level8.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level8.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 8');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s, marche de 0,6 m
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5, STEP = 0.6;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
function reach(dy, double) {
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
const hop = (a, b) => ({ gap: Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy: b.top - a.top });
const off = (c, v) => { const o = c.off; c.off = v; return () => { c.off = o; }; };

test('identité du niveau', () => {
  assert.strictEqual(L.ID, 8);
  assert.strictEqual(L.SAVE_KEY, 'dogfight.aventure.niveau8');
  assert.strictEqual(L.medals.length, 5);
  assert.strictEqual(L.FINAL_MEDAL, 'm_goal');
  assert.ok(L.medals.some(m => m.id === L.FINAL_MEDAL));
});

test('le château sur sa colline, entouré de douves', () => {
  assert.strictEqual(L.heightAt(0, 0), L.FLOOR);
  assert.strictEqual(L.heightAt(0, -60), L.TOP);
  assert.ok(L.heightAt(0, 15.5) < L.WATER_Y - 1, 'les douves devant la porte');
  assert.ok(L.heightAt(25.5, -20) < L.WATER_Y - 1, 'les douves sur le côté');
  assert.ok(Math.abs(L.heightAt(0, 22) - L.FLOOR) < 0.3, 'la berge est à la hauteur du pont');
  assert.ok(L.heightAt(0, 63) > 1.5 && L.heightAt(0, 63) < L.FLOOR, 'la prairie, plus bas');
  assert.ok(L.heightAt(0, 86) < 0, 'la mer au loin');
});

test('le pont-levis : levé, il ferme la porte ; baissé, on traverse', () => {
  assert.ok(L.bridgeCol.off && !L.gateCol.off, 'levé au départ');
  // levé : rien sous les pattes au-dessus des douves
  assert.ok(L.supportAt(0, 15.5, L.FLOOR + 0.3, 0).y < 0);
  const r1 = off(L.bridgeCol, false), r2 = off(L.gateCol, true);
  for (let z = 22; z > 8; z -= 0.5) assert.ok(Math.abs(L.supportAt(0, z, L.FLOOR + 0.3, 0).y - L.FLOOR) < 0.2, `pont à z=${z}`);
  r1(); r2();
  for (const p of L.PLATES) assert.ok(Math.abs(L.heightAt(p.x, p.z) - L.FLOOR) < 0.2 && p.z > L.MOAT.z1 + 2, 'pattes dorées sur la berge, à plat');
  const b1 = L.BALLS.find(b => b.zone === 'out');
  assert.ok(L.PLATES.some(p => Math.hypot(p.x - b1.x, p.z - b1.z) < 10), 'la pelote de la prairie est près d\'une patte');
});

test('les remparts : trop hauts sans la pelote, faciles avec', () => {
  const E = L.LEDGE, R = L.BALL_R;
  assert.ok(E.top - L.FLOOR - STEP > H2, `sans pelote : ${(E.top - L.FLOOR).toFixed(1)} m > double saut ${H2.toFixed(2)} m`);
  const ballTop = L.FLOOR + 2 * R;
  assert.ok(ballTop - L.FLOOR - STEP < H2, 'on monte sur la pelote');
  assert.ok(E.top - ballTop - STEP < H2 * 0.85, 'de la pelote au rempart');
  assert.ok(Math.abs(L.SLOT.x + R - E.x0) < 0.2, 'l\'empreinte est collée au rempart');
  const W = L.WALL_SWITCH;
  assert.ok(W.x > E.x0 && W.x < E.x1 && W.z > E.z0 && W.z < E.z1, 'le bouton est sur le rempart');
  assert.ok(L.supportAt(W.x, W.z, E.top + 0.3, 0).y === E.top);
  const b2 = L.BALLS.find(b => b.zone === 'court');
  assert.ok(L._inRect(L.COURT, b2.x, b2.z), 'la pelote bleue est dans la cour');
});

test('les portes : fermées au départ, solides et assez hautes', () => {
  assert.ok(!L.DOOR1.off && L.DOOR1.solid);
  assert.ok(!L.CAT_PILE.off && L.CAT_PILE.y1 - L.FLOOR - STEP > H2, 'on ne saute pas par-dessus les chats');
  for (const w of L.walls) if (w.look === 'inner') assert.ok(w.c.y1 - L.FLOOR - STEP > H2, 'murs intérieurs infranchissables');
  // la sieste se fait devant la porte, le point rouge gambade loin d'elle
  for (let t = 0; t < 60; t += 0.25) {
    const d = L.dotAt(t);
    assert.ok(L._inRect(L.HALL, d.x, d.z, -1), `point rouge dans la salle (t=${t})`);
    assert.ok(Math.hypot(d.x, d.z + 31.6) > 2.5, 'le point rouge ne reste pas devant la porte');
  }
});

test('l\'Arbre à Chats se grimpe de plateau en plateau, jusqu\'à la terrasse', () => {
  const floor = { x: L.catTree[0].x, z: L.catTree[0].z + 2, r: 0.5, top: L.FLOOR };
  const path = [floor, ...L.catTree, L.HAMMOCK];
  for (let i = 0; i + 1 < path.length; i++) {
    const { gap, dy } = hop(path[i], path[i + 1]);
    assert.ok(dy < H1 * 0.75 && gap < reach(dy, false) * 0.5, `plateau ${i} → ${i + 1} : ${gap.toFixed(1)} m, +${dy.toFixed(1)} m`);
  }
  assert.ok(Math.abs(L.HAMMOCK.top - L.TOP) < 0.01 && Math.abs(L.PLANK.top - L.TOP) < 0.01, 'hamac et passerelle au niveau de la terrasse');
  assert.ok(L.PLANK.z1 < L.KEEP_Z + 1, 'la passerelle arrive sur le mur du donjon');
  assert.ok(Math.abs(L.supportAt(0, L.PLANK.z1 - 0.5, L.TOP + 0.3, 0).y - L.TOP) < 0.01, 'on descend de la passerelle sur la terrasse');
  assert.ok(L.PERCH.top - L.TOP - STEP < H1, 'le perchoir au-dessus du hamac');
  // sans l'arbre, la terrasse est inaccessible depuis le jardin
  assert.ok(L.TOP - L.FLOOR - STEP > H2);
});

test('les 5 trésors sont atteignables', () => {
  const byId = Object.fromEntries(L.medals.map(m => [m.id, m]));
  const near = (m, x, z, y) => Math.hypot(m.x - x, m.z - z) < 1.5 && m.y - y > 0.5 && m.y - y < 2.2;
  assert.ok(near(byId.m_wall, byId.m_wall.x, byId.m_wall.z, L.LEDGE.top) && L._inRect({ x0: L.LEDGE.x0, x1: L.LEDGE.x1, z0: L.LEDGE.z0, z1: L.LEDGE.z1 }, byId.m_wall.x, byId.m_wall.z));
  assert.ok(near(byId.m_tree, L.PERCH.x, L.PERCH.z, L.PERCH.top));
  assert.ok(near(byId.m_goal, L.SEAT.x, L.SEAT.z, L.SEAT.top));
  assert.ok(near(byId.m_gate, 0, byId.m_gate.z, L.FLOOR) && byId.m_gate.z > L.CASTLE.z1 && byId.m_gate.z < L.MOAT.z1, 'au-dessus du pont-levis');
  assert.ok(byId.m_laser.z < L.CAT_PILE.z - L.CAT_PILE.d / 2 - 0.2, 'derrière les chats qui dorment');
  assert.ok(L.SEAT.top - L.DAIS.top - STEP < H1 && L.DAIS.top - L.TOP <= STEP, 'trône : estrade puis siège');
});

test('100 poissons dorés, aucun dans un obstacle, tous au-dessus du sol', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) {
    for (const c of L.colliders) if (!c.off && !c.moving && c.kind !== 'tree' && L.inside(c, b.x, b.z, 0) && b.y > c.y0 && b.y < c.y1 - 0.2) assert.fail(`poisson ${b.id} dans un obstacle (${c.kind})`);
    assert.ok(b.y > L.heightAt(b.x, b.z) + 0.5 && b.y < L.supportAt(b.x, b.z, 99, 0).y + 2.5, `poisson ${b.id} à portée`);
    assert.ok(L.heightAt(b.x, b.z) > 1, `poisson ${b.id} pas dans l'eau`);
  }
  // chaque partie du château en a
  const zones = [[L.COURT, 15], [L.HALL, 12], [L.GARDEN, 12], [L.THRONE, 6]];
  for (const [r, n] of zones) assert.ok(L.bones.filter(b => L._inRect(r, b.x, b.z)).length >= n);
});

test('drapeaux, personnages et départ sur un sol', () => {
  for (const c of L.CHECKPOINTS) assert.ok(Math.abs(L.supportAt(c.x, c.z, c.y + 0.5, 0).y - c.y) < 0.01 && c.y > 1, c.name);
  assert.strictEqual(L.CHECKPOINTS[4].y, L.TOP);
  for (const p of L.POMPON.slice(1)) assert.ok(Math.abs(L.supportAt(p.x, p.z, p.y + 0.5, 0).y - p.y) < 0.01, 'Pompon');
  assert.ok(L.START.y > 1 && L.npcs.mamie.y > 1);
  assert.ok(!L.blockedAt(L.START.x, L.START.z));
  for (const c of L.cats) assert.ok(!L.blockedAt(c.x, c.z) && c.y > 0.5, c.id);
  for (const c of L.crates) assert.ok(c.y > 1, c.id);
});

test('les chats ne traversent pas les murs, et le jeu de chat reste dans la salle du trône', () => {
  assert.ok(L.blockedAt(22.2, -20) && L.blockedAt(10, -14) && L.blockedAt(0, 12.4));
  const Z = L.TAG_ZONE, T = L.THRONE;
  assert.ok(Z.x0 > T.x0 && Z.x1 < T.x1 && Z.z0 > T.z0 && Z.z1 < T.z1);
  for (let x = Z.x0; x <= Z.x1; x += 1) for (let z = Z.z0; z <= Z.z1; z += 1) assert.strictEqual(L.heightAt(x, z), L.TOP);
});

console.log(passed + ' tests réussis');
