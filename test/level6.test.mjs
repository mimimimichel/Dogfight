// Tests des données du niveau 6 (la Plage aux Coquillages) : node test/level6.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level6.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 6');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32 ; marche : marche de 0,6 m
const G = 32, V1 = 12, V2 = 10.5, STEP_UP = 0.6;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
const ground = (x, z, y) => L.supportAt(x, z, y === undefined ? 100 : y, 0).y;
const solidAt = (x, z, y) => L.colliders.some(c => !c.off && c.kind !== 'deck' && c.kind !== 'cap' && c.kind !== 'stone' && L.inside(c, x, z, 0) && y > c.y0 && y < c.y1 - 0.2);
/** On peut marcher de a à b sans sauter (le terrain ne monte jamais d'un coup de plus d'une marche). */
function walkable(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
  let y = L.heightAt(ax, az);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, h = L.heightAt(x, z);
    if (h > y + STEP_UP * 0.8) return false;
    y = h;
  }
  return true;
}

test('100 coquillages : 58 visibles, 36 enterrés dans 12 tas, 6 chez les crabes', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  assert.strictEqual(L.MOUNDS.length, 12);
  assert.strictEqual(L.bones.filter(b => b.mound).length, 36);
  assert.strictEqual(L.bones.filter(b => b.crab).length, L.CRABS.length);
  for (const m of L.MOUNDS) assert.strictEqual(L.bones.filter(b => b.mound === m.id).length, 3, m.id);
});

test('aucun coquillage dans un obstacle', () => {
  for (const b of L.bones) assert.ok(!solidAt(b.x0, b.z0, b.y0), `coquillage ${b.id} dans un obstacle (${b.x0.toFixed(1)}, ${b.z0.toFixed(1)})`);
});

test('tous les coquillages sont atteignables (au sol, en sautant, ou en bodyboard sur les vagues)', () => {
  for (const b of L.bones) {
    const g = ground(b.x0, b.z0, b.y0);
    const overSea = L.heightAt(b.x0, b.z0) < L.WATER_Y - 0.15 && Math.abs(b.y0 - (L.WATER_Y + 1.1)) < 0.2;
    if (overSea) continue;
    assert.ok(g > L.WATER_Y - 0.9, `${b.id} : sol sous l'eau profonde`);
    assert.ok(b.y0 - g < H2 * 0.9 && b.y0 > g, `${b.id} : ${(b.y0 - g).toFixed(2)} m au-dessus du sol`);
  }
});

test('les coquillages au-dessus des vagues sont sur le chemin des planches (eau assez profonde)', () => {
  const sea = L.bones.filter(b => L.heightAt(b.x0, b.z0) < L.WATER_Y - 0.15 && Math.abs(b.y0 - (L.WATER_Y + 1.1)) < 0.2);
  assert.ok(sea.length >= 8, `${sea.length} au-dessus de l'eau`);
});

test('les tas de sable et la croix rouge sont sur le sable sec, sans obstacle', () => {
  for (const m of L.MOUNDS.concat([L.CHEST])) {
    assert.ok(m.y > L.WATER_Y + 0.4, `${m.id} trop près de l'eau`);
    assert.ok(!L.colliders.some(c => L.inside(c, m.x, m.z, 0.6) && c.y1 > m.y + 0.3), `${m.id} sous un obstacle`);
    assert.ok(L.MOUNDS.every(o => o === m || Math.hypot(o.x - m.x, o.z - m.z) > L.DIG_R * 2), `${m.id} trop près d'un autre tas`);
  }
});

test('les drapeaux sont posés sur un sol sec', () => {
  for (const c of L.CHECKPOINTS) {
    assert.ok(Math.abs(ground(c.x, c.z, c.y + 0.5) - c.y) < 0.6, c.name);
    assert.ok(c.y > L.WATER_Y + 0.3, `${c.name} dans l'eau`);
    assert.ok(!solidAt(c.x, c.z, c.y + 0.5), `${c.name} dans un obstacle`);
  }
});

test('les médailles sont à portée (sol, phare, ou au-dessus de l\'arrivée de la course)', () => {
  for (const m of L.medals) {
    const g = ground(m.x, m.z, m.y);
    assert.ok(m.y - g > 0.6 && m.y - g < H1, `${m.id} : ${(m.y - g).toFixed(2)} m au-dessus du sol`);
    assert.ok(g > L.WATER_Y - 0.9, `${m.id} : trop profond pour patauger`);
  }
});

test('on descend de la promenade à la plage, et on monte sur la falaise du phare par la pente', () => {
  assert.ok(walkable(L.START.x, L.START.z, 0, 10), 'promenade → plage');
  assert.ok(walkable(0, 10, L.FORT.x, L.FORT.z + L.FORT.r + 2), 'plage → porte du fort');
  assert.ok(walkable(L.FORT.x, L.FORT.z + L.FORT.r + 2, L.FORT.x, L.FORT.z), 'on entre dans le fort par la porte');
  assert.ok(walkable(L.START.x, L.START.z, 60, 50), 'promenade → pied de la pente');
  assert.ok(walkable(60, 50, 58, 2), 'pente → plateau');
  assert.ok(walkable(58, 2, L.LIGHTHOUSE.x, L.LIGHTHOUSE.z + 6), 'plateau → pied du phare');
  assert.ok(L.heightAt(58, 2) > L.PLATEAU_Y - 0.5);
});

test('les bords du monde et la falaise du phare sont des murs', () => {
  assert.ok(!walkable(36, 0, 46, 0), 'la falaise côté plage');
  assert.ok(!walkable(-60, 30, -78, 30), 'la falaise de l\'ouest');
  assert.ok(!walkable(0, 55, 0, 70), 'le talus du sud');
  assert.ok(!walkable(70, 20, 90, 20), 'la falaise de l\'est');
});

test('l\'escalier du phare se grimpe marche après marche, jusqu\'à la lanterne', () => {
  const LH = L.LIGHTHOUSE, s = L.lighthouseSteps;
  assert.ok(s[0].top - LH.base < H1 * 0.8, 'première marche');
  for (let i = 0; i + 1 < s.length; i++) {
    const dy = s[i + 1].top - s[i].top, gap = Math.hypot(s[i + 1].x - s[i].x, s[i + 1].z - s[i].z) - s[i].r - s[i + 1].r;
    assert.ok(dy < H1 * 0.7 && gap < 1.5, `marche ${i} → ${i + 1}`);
  }
  assert.ok(LH.top - s[s.length - 1].top < H1 * 0.7, 'dernière marche → galerie');
  assert.ok(Math.abs(ground(LH.x, LH.z + 2.6, LH.top + 0.3) - LH.top) < 0.01, 'on tient debout sur la galerie');
});

test('le ponton part de la plage (une marche) et s\'avance dans la mer', () => {
  const P = L.PIER;
  assert.ok(P.top - L.heightAt(P.x, P.z0 + 0.5) < STEP_UP, 'on monte sur le ponton');
  assert.ok(L.heightAt(P.x, P.z1) < L.WATER_Y - 3, 'le bout est dans l\'eau profonde');
  const B = L.GIVERS.barnabe;
  assert.ok(Math.abs(B.y - P.top) < 0.01 && L.colliders.some(c => c.kind === 'deck' && L.inside(c, B.x, B.z, 0)), 'Barnabé est sur le ponton');
});

test('bodyboard : mise à l\'eau, bouées, départ et arrivée en eau assez profonde', () => {
  const deep = (p) => L.heightAt(p.x, p.z) < L.WATER_Y - 0.15;
  assert.ok(deep(L.LAUNCH), 'mise à l\'eau');
  assert.ok(deep(L.RACE.start) && deep(L.RACE.finish), 'départ / arrivée');
  for (const b of L.RACE.buoys) assert.ok(L.heightAt(b.x, b.z) < L.WATER_Y - 1, `bouée ${b.x},${b.z}`);
  assert.ok(Math.hypot(L.RACK.x - L.LAUNCH.x, L.RACK.z - L.LAUNCH.z) < 14, 'les planches sont près de l\'eau');
  assert.ok(L.RACK.y > L.WATER_Y + 0.4, 'le râtelier est sur le sable');
  // la houle ne touche que la mer près du bord
  assert.strictEqual(L.swell(0, 30, 1), 0);
  assert.ok(Math.abs(L.swell(0, L.shoreZ(0) - 8, 0.3)) > 0);
});

test('le bébé phoque : sa flaque est dans les rochers, la mer n\'est pas loin', () => {
  const s = L.SEAL, home = L.SEAL_HOME;
  assert.ok(s.y > L.WATER_Y + 0.2, 'la flaque est hors de l\'eau');
  assert.ok(L.heightAt(home.x, home.z) < L.WATER_Y - 0.25, 'la mer est profonde près de Maman Phoque');
  const d = Math.hypot(s.x - home.x, s.z - home.z);
  assert.ok(d > 10 && d < 35, `${d.toFixed(1)} m jusqu'à la mer`);
  assert.ok(walkable(L.CHECKPOINTS[2].x, L.CHECKPOINTS[2].z, s.x + 1.5, s.z + 1.5), 'on arrive jusqu\'au phoque');
});

test('le fort : 5 chats dedans, la porte au sud est ouverte', () => {
  const inFort = L.cats.filter(c => c.group === 'clearing');
  assert.strictEqual(inFort.length, 5);
  for (const c of inFort) assert.ok(Math.hypot(c.x - L.FORT.x, c.z - L.FORT.z) < L.FORT.r - 1.5, c.id);
  const gx = L.FORT.x, gz = L.FORT.z + L.FORT.r;
  assert.ok(!L.colliders.some(c => c.solid !== false && c.kind === 'rock' && L.inside(c, gx, gz, 0.6)), 'porte libre');
  for (const t of L.fortTowers) assert.ok(t.h < H2, 'on peut sauter sur les remparts');
});

test('les personnages sont sur le sol', () => {
  for (const [n, p] of Object.entries(L.npcs)) assert.ok(Math.abs(p.y - L.heightAt(p.x, p.z)) < 0.01 && p.y > 1, n);
  assert.ok(L.GIVERS.mistral.y > L.WATER_Y + 0.3, 'Mistral');
  assert.ok(L.START.y > 2, 'départ sur la promenade');
  for (const p of L.PORTALS) assert.ok(Math.abs(L.heightAt(p.x, p.z) - L.START.y) < 0.5, 'portail');
});

test('5 médailles, 5 missions, sauvegarde à part', () => {
  assert.strictEqual(L.medals.length, 5);
  assert.deepStrictEqual(L.medals.map(m => m.id).sort(), ['m_chest', 'm_fort', 'm_light', 'm_race', 'm_seal']);
  assert.strictEqual(L.SAVE_KEY, 'dogfight.aventure.niveau6');
  assert.strictEqual(L.ID, 6);
});

console.log(passed + ' tests réussis');
