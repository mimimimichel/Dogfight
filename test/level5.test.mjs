// Tests des données du niveau 5 (la Station des Neiges) : node test/level5.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level5.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 5');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
function reach(dy, double) {
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
/** Pas plus raide que ce que le chien peut gravir en marchant (0,6 m par pas de 1/60 s à 8,5 m/s). */
const WALKABLE = 0.6 / (RUN / 60);
const slope = (x, z) => Math.hypot(L.heightAt(x + 0.2, z) - L.heightAt(x - 0.2, z), L.heightAt(x, z + 0.2) - L.heightAt(x, z - 0.2)) / 0.4;
const solidAt = (x, z, y) => L.colliders.some(c => !c.off && (c.kind === 'tree' || c.kind === 'trunk' || c.kind === 'rock' || c.solid) && L.inside(c, x, z, 0.3) && y > c.y0 && y < c.y1 - 0.2);

test('5 médailles, 100 flocons dorés, 3 bonnets, 4 chats patineurs', () => {
  assert.strictEqual(L.ID, 5);
  assert.strictEqual(L.SAVE_KEY, 'dogfight.aventure.niveau5');
  assert.strictEqual(L.medals.length, 5);
  assert.strictEqual(new Set(L.medals.map(m => m.id)).size, 5);
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  assert.strictEqual(L.BONNETS.length, 3);
  assert.strictEqual(L.cats.filter(c => c.group === 'clearing').length, 4);
});

test('100 flocons dorés, aucun dans un obstacle, tous dans la station', () => {
  for (const b of L.bones) {
    assert.ok(b.y > L.heightAt(b.x, b.z) + 0.3, `${b.id} sous la neige`);
    assert.ok(Math.pow(b.x ** 4 + b.z ** 4, 0.25) < 95, `${b.id} hors de la station`);
    for (const c of L.colliders) if (!c.off && c.kind !== 'tree' && L.inside(c, b.x, b.z, 0) && b.y > c.y0 && b.y < c.y1 - 0.2) assert.fail(`flocon ${b.id} dans un obstacle (${c.kind})`);
    assert.ok(!L.trees.some(t => Math.hypot(t.x - b.x, t.z - b.z) < 0.5 * t.s + 0.3), `flocon ${b.id} dans un sapin`);
  }
});

test('médailles et bonnets : posés au-dessus du sol, hors des obstacles', () => {
  for (const m of [...L.medals, ...L.BONNETS.map(b => ({ id: b.id, x: b.x, z: b.z, y: b.y + 0.8 }))]) {
    const g = L.supportAt(m.x, m.z, m.y, 0).y;
    assert.ok(m.y - g > 0.3 && m.y - g < 2.2, `${m.id} : ${(m.y - g).toFixed(2)} m au-dessus du sol`);
    assert.ok(!solidAt(m.x, m.z, m.y), `${m.id} dans un obstacle`);
  }
});

test('les drapeaux sont posés sur un sol, on y tient debout', () => {
  assert.strictEqual(L.CHECKPOINTS.length, 5);
  for (const c of L.CHECKPOINTS) {
    assert.ok(Math.abs(L.supportAt(c.x, c.z, c.y + 0.5, 0).y - c.y) < 0.05, c.name + ' flotte');
    assert.ok(c.y > 0.5, c.name + ' trop bas');
    assert.ok(!solidAt(c.x, c.z, c.y + 0.5), c.name + ' dans un obstacle');
    assert.ok(slope(c.x, c.z) < 1, c.name + ' en pente');
  }
});

test('départ, Mamie, Biscotte, Bernard et Myrtille : sur la neige, hors des obstacles', () => {
  const who = [['départ', L.START], ['Mamie', L.npcs.mamie], ['Biscotte', L.npcs.puppy], ['Bernard', L.FOLKS.bernard], ['Myrtille', L.FOLKS.myrtille]];
  for (const [n, p] of who) {
    assert.ok(p.y > 1, n + ' trop bas');
    assert.ok(!solidAt(p.x, p.z, p.y + 0.5), n + ' dans un obstacle');
  }
});

test('on ne sort pas de la station : une corniche infranchissable tout autour', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    let prev = null, wall = false;
    for (let r = 90; r < 135; r += 0.14) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = L.heightAt(x, z);
      if (prev !== null && h - prev > 0.6) wall = true;
      prev = h;
    }
    assert.ok(wall, `pas de mur dans la direction ${a.toFixed(2)}`);
  }
});

test('tout le terrain de jeu se parcourt à pied (pas de pente trop raide hors des falaises voulues)', () => {
  for (let x = -92; x <= 92; x += 1.5) for (let z = -92; z <= 92; z += 1.5) {
    if (Math.pow(x ** 4 + z ** 4, 0.25) > 94) continue;
    if (x < L.LEDGE.x1 + 2 && x > L.LEDGE.x0 - 2 && z > L.LEDGE.z0 - 2 && z < L.LEDGE.z1 + 2) continue;   // la corniche de la cascade
    assert.ok(slope(x, z) < WALKABLE * 0.8, `trop raide en (${x}, ${z}) : ${slope(x, z).toFixed(2)}`);
  }
});

test('le lac est gelé (on glisse), l\'îlot non ; la glace est plate', () => {
  const K = L.LAKE;
  assert.ok(L.iceAt(K.x + 10, K.z, K.y));
  assert.ok(!L.iceAt(K.x, K.z, K.isletY), 'l\'îlot n\'est pas glissant');
  assert.ok(!L.iceAt(0, 70, 2.5), 'le village n\'est pas glissant');
  for (let a = 0; a < 6.28; a += 0.5) for (const r of [5, 10, 16]) assert.ok(Math.abs(L.heightAt(K.x + Math.cos(a) * r, K.z + Math.sin(a) * r) - K.y) < 0.05, 'glace bosselée');
  const isl = L.heightAt(K.x, K.z) - K.y;
  assert.ok(isl > 0.3 && isl < 1.0, 'on monte sur l\'îlot sans sauter ou d\'un petit saut');
});

test('la Grande Glissade descend du sommet jusqu\'à la plaine, sans sapin sur la piste', () => {
  const h = L.RUN.map(([x, z]) => L.heightAt(x, z));
  assert.ok(h[0] > 24, 'le départ est au sommet');
  for (let i = 1; i < h.length - 1; i++) assert.ok(h[i] < h[i - 1] + 0.2, `la piste remonte au point ${i}`);
  assert.ok(Math.abs(L.heightAt(L.FINISH.x, L.FINISH.z) - h[h.length - 1]) < 3, 'arrivée en bas');
  for (const t of L.trees) assert.ok(L.runInfo(t.x, t.z).d > L.RUN_W + 2, 'un sapin sur la piste');
  for (const c of L.colliders) if (c.kind === 'rock' || c.solid) assert.ok(L.runInfo(c.x, c.z).d > L.RUN_W || Math.hypot(c.x - L.FINISH.x, c.z - L.FINISH.z) > 12, 'un obstacle sur la piste');
  assert.ok(L.RUN_TOTAL > 70, 'piste assez longue');
});

test('le télésiège : le siège passe toujours au-dessus de la neige, des sapins et des chalets', () => {
  for (let s = 0; s <= L.LIFT_LEN; s += 0.5) {
    const p = L.liftAt(s), seat = p.y - L.SEAT_DROP;
    assert.ok(seat - L.heightAt(p.x, p.z) > 1.4, `siège trop bas à ${s.toFixed(1)} m`);
    for (const c of L.colliders) if (c.kind !== 'rock' && L.inside(c, p.x, p.z, 1.5)) assert.ok(seat > c.y1 + 0.3, `siège dans un obstacle (${c.kind}) à ${s.toFixed(1)} m`);
  }
  assert.ok(L.LIFT.top.y > 24 && L.LIFT.base.y < 4, 'du bas jusqu\'au sommet');
  assert.ok(L.LIFT_LEN / L.LIFT_SPEED < 20, 'montée pas trop longue');
});

test('la Cascade Gelée se grimpe de bloc en bloc jusqu\'à la corniche', () => {
  const S = L.ICE_STEPS;
  const first = S[0], g0 = L.heightAt(first.x, first.z);
  assert.ok(first.top - g0 < H1 * 0.9, 'premier bloc : un simple saut');
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], b = S[i + 1], gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy = b.top - a.top;
    assert.ok(dy < H2 * 0.8 && gap < reach(dy, true) * 0.6, `bloc ${i} → ${i + 1} : ${gap.toFixed(1)} m, +${dy.toFixed(1)} m`);
    assert.ok(gap > 0.2, `blocs ${i} et ${i + 1} collés`);
  }
  const last = S[S.length - 1], dyL = L.LEDGE.top - last.top;
  assert.ok(dyL < H2 * 0.8, 'du dernier bloc à la corniche');
  assert.ok(L.heightAt(last.x - last.r - 0.8, last.z) > L.LEDGE.top - 0.5, 'la corniche touche le dernier bloc');
  const m = L.medals.find(q => q.id === 'm_falls');
  assert.ok(Math.abs(L.heightAt(m.x, m.z) - L.LEDGE.top) < 0.01, 'médaille sur la corniche');
  // les autres côtés de la corniche sont des falaises
  assert.ok(L.heightAt(L.LEDGE.x1 + 0.9, -30) < 3 && L.heightAt(L.LEDGE.x1 - 1, -30) > 14);
});

test('le bonnet de la gare du télésiège : on y monte par le tas de bois', () => {
  const W = L.WOODPILE, S = L.STATION, b = L.BONNETS.find(q => q.id === 'b3');
  assert.ok(W.h < H1 * 0.9, 'tas de bois : un simple saut');
  assert.ok(S.h - W.h < H1 * 0.9, 'du tas de bois au toit : un simple saut');
  assert.ok(Math.abs(b.y - (S.y + S.h)) < 0.05, 'bonnet sur le toit');
});

test('Fort Moustache : un cercle de blocs ouvert au sud, assez grand pour se battre', () => {
  const F = L.FORT;
  assert.ok(L.fortBlocks.length >= 16);
  assert.ok(Math.abs(L.heightAt(F.x, F.z) - F.y) < 0.05, 'sol plat');
  assert.ok(!L.colliders.some(c => c.kind === 'rock' && L.inside(c, F.x, F.z + F.r, 0.5)), 'entrée dégagée');
  for (let a = 0; a < 6.28; a += 0.4) for (const r of [2, 4, 6]) assert.ok(!solidAt(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, F.y + 0.5), 'obstacle dans le fort');
});

test('les chats et les caisses sont sur la neige, pas dans un obstacle', () => {
  for (const c of [...L.cats, ...L.crates]) {
    assert.ok(c.y > 0.5, c.id + ' trop bas');
    assert.ok(!solidAt(c.x, c.z, c.y + 0.5), c.id + ' dans un obstacle');
  }
  for (const c of L.cats.filter(q => q.group === 'clearing')) assert.ok(L.iceAt(c.x, c.z, c.y), c.id + ' devrait patiner sur le lac');
});

test('le portail du retour au Parc est sur un sol libre', () => {
  for (const p of L.PORTALS) {
    assert.ok(Math.abs(L.heightAt(p.x, p.z) - L.START.y) < 0.8);
    assert.ok(!L.colliders.some(c => !c.off && L.inside(c, p.x, p.z, 1.3)));
  }
});

console.log(passed + ' tests réussis');
