// Tests des données du niveau 6 (la Plage aux Coquillages) : node test/level6.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level6.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 6');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s ; marche de 0,6 m
const G = 32, V1 = 12, V2 = 10.5, STEP_UP = 0.6, RUN = 8.5;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
const ground = (x, z, y) => L.supportAt(x, z, y === undefined ? 100 : y, 0).y;
const solidAt = (x, z, y) => L.colliders.some(c => !c.off && !['deck', 'cap', 'stone'].includes(c.kind) && L.inside(c, x, z, 0) && y > c.y0 && y < c.y1 - 0.2);
/** Distance horizontale max d'un saut qui retombe dy plus haut. */
function reach(dy, double) {
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
/** On peut marcher de a à b sans sauter (le terrain ne monte jamais d'un coup de plus d'une marche). */
function walkable(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
  let y = L.heightAt(ax, az);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, h = L.heightAt(x, z);
    if (h > y + STEP_UP * 0.8) return false;
    if (h < L.WATER_Y - 0.8) return false;             // trop profond : il faudrait nager
    y = h;
  }
  return true;
}
/** Un chemin à pied, étape par étape. */
const walkPath = (pts) => pts.every((p, i) => i === 0 || walkable(pts[i - 1][0], pts[i - 1][1], p[0], p[1]));
const disc = (p) => ({ x: p.x, z: p.z, r: p.r, top: p.top });
const hop = (a, b) => ({ gap: Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy: b.top - a.top });

test('un grand monde : ±200 m, carte en radar', () => {
  assert.strictEqual(L.WORLD, 400);
  assert.strictEqual(L.HALF, 200);
  assert.ok(L.RADAR > 50);
});

test('100 coquillages : 51 visibles, 36 enterrés dans 12 tas, 8 chez les crabes, 5 au chamboule-tout', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  assert.strictEqual(L.MOUNDS.length, 12);
  assert.strictEqual(L.bones.filter(b => b.mound).length, 36);
  assert.strictEqual(L.bones.filter(b => b.crab).length, L.CRABS.length);
  assert.strictEqual(L.bones.filter(b => b.prize).length, 5);
  for (const m of L.MOUNDS) assert.strictEqual(L.bones.filter(b => b.mound === m.id).length, 3, m.id);
});

test('les coquillages sont répartis sur toute la carte (pas tous sur le chemin)', () => {
  const quads = new Set(L.bones.map(b => Math.sign(b.x0) + ',' + Math.sign(b.z0 + 20)));
  for (const q of ['1,1', '-1,1', '1,-1', '-1,-1']) assert.ok(quads.has(q), 'les quatre coins de la carte : ' + q);
  const xs = L.bones.map(b => b.x0), zs = L.bones.map(b => b.z0);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 300, 'de l\'ouest à l\'est');
  assert.ok(Math.max(...zs) - Math.min(...zs) > 250, 'du large au sud des dunes');
  const far = L.bones.filter(b => Math.hypot(b.x0 - L.START.x, b.z0 - L.START.z) > 100).length;
  assert.ok(far >= 45, `${far} coquillages à plus de 100 m du départ`);
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

test('des coquillages au-dessus des vagues, sur la route de l\'île', () => {
  const sea = L.bones.filter(b => L.heightAt(b.x0, b.z0) < L.WATER_Y - 0.15 && Math.abs(b.y0 - (L.WATER_Y + 1.1)) < 0.2 && !L.colliders.some(c => c.kind === 'deck' && L.inside(c, b.x0, b.z0, 0)));
  assert.ok(sea.length >= 6, `${sea.length} au-dessus de l'eau`);
});

test('les tas de sable, le tas du morceau de carte et la croix rouge sont sur le sable sec, sans obstacle', () => {
  for (const m of L.MOUNDS.concat([L.CHEST, L.PIECE_MOUND])) {
    assert.ok(m.y > L.WATER_Y + 0.4, `${m.id} trop près de l'eau`);
    assert.ok(!L.colliders.some(c => L.inside(c, m.x, m.z, 0.6) && c.y1 > m.y + 0.3), `${m.id} sous un obstacle`);
    assert.ok(L.MOUNDS.every(o => o === m || Math.hypot(o.x - m.x, o.z - m.z) > L.DIG_R * 2), `${m.id} trop près d'un autre tas`);
  }
  assert.ok(Math.hypot(L.CHEST.x - L.ISLAND.x, L.CHEST.z - L.ISLAND.z) < L.ISLAND.r, 'le coffre est sur l\'île');
});

test('les drapeaux sont posés sur un sol sec', () => {
  assert.ok(L.CHECKPOINTS.length >= 8);
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

test('à pied : du village à la plage, au fort, aux rochers et à la grotte, aux dunes, à la crique, au phare', () => {
  const V = [L.START.x, L.START.z];
  assert.ok(walkPath([V, [22, 40], [0, 10]]), 'village → Grande Plage');
  assert.ok(walkPath([[0, 10], [L.FORT.x, L.FORT.z + L.FORT.r + 2], [L.FORT.x, L.FORT.z]]), 'plage → dans le fort, par la porte');
  assert.ok(walkPath([[L.FORT.x, L.FORT.z + 12], [-100, 20], [-130, 20], [L.CAVE.x + 10, L.CAVE.z + 10], [L.CAVE.x, L.CAVE.z]]), 'fort → rochers → grotte');
  assert.ok(walkPath([V, [-20, 100], [-80, 110], [L.GRANDE_DUNE.x, L.GRANDE_DUNE.z]]), 'village → sommet de la Grande Dune');
  assert.ok(walkPath([[-80, 110], [L.GROVE.x, L.GROVE.z]]), 'dunes → palmeraie');
  assert.ok(walkPath([[-80, 110], [-112, 70], [L.HOLLOWS[0].x, L.HOLLOWS[0].z]]), 'dunes → le creux du morceau de carte');
  assert.ok(walkPath([V, [100, 110], [150, 70], [L.WRECK.x - 6, L.WRECK.z + 8]]), 'village → Crique de l\'Épave');
  assert.ok(walkPath([V, [90, 90], [90, 40], [92, 0], [92, -88]]), 'village → pente → plateau → pied du phare');
  assert.ok(L.heightAt(92, -88) > L.PLATEAU_Y - 0.5);
});

test('les bords du monde et la falaise du phare sont des murs', () => {
  assert.ok(!walkable(60, 0, 72, 0), 'la falaise côté Grande Plage');
  assert.ok(!walkable(125, 10, 110, 10), 'la falaise côté Crique');
  assert.ok(!walkable(-170, 40, -195, 40), 'la falaise de l\'ouest');
  assert.ok(!walkable(20, 160, 20, 185), 'le talus du sud');
  assert.ok(!walkable(170, 60, 195, 60), 'la falaise de l\'est');
  assert.ok(!walkable(35, -70, L.ISLAND.x, L.ISLAND.z), 'l\'île est trop loin à pied (il faut un bodyboard)');
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

test('les 3 lentilles du phare sont tout en haut, mais on peut y grimper', () => {
  const W = L.WRECK;
  // l'épave : caisses → pont arrière → tonneaux → hune
  const chain = [...W.steps.map(s => ({ x: s.x, z: s.z, r: s.r, top: s.top })), { x: W.deck.x, z: W.deck.z, r: 2.6, top: W.deck.top }, ...W.barrels.map(b => ({ x: b.x, z: b.z, r: b.r, top: b.top })), Object.assign({}, W.nest)];
  let prev = { x: W.steps[0].x, z: W.steps[0].z, r: 0.1, top: L.heightAt(W.steps[0].x, W.steps[0].z) };
  for (const c of chain) { const h = hop(prev, c); assert.ok(h.dy < H2 * 0.85 && h.gap < reach(h.dy, true) * 0.7, `épave : ${h.gap.toFixed(1)} m, +${h.dy.toFixed(1)} m`); prev = c; }
  // la grotte : trois rochers → promontoire
  let p2 = { x: L.caveSteps[0].x, z: L.caveSteps[0].z, r: 0.1, top: L.caveSteps[0].y };
  for (const c of L.caveSteps.map(disc).concat([disc(L.CAVE_TOP)])) { const h = hop(p2, c); assert.ok(h.dy < H2 * 0.85 && h.gap < reach(h.dy, true) * 0.7, `grotte : ${h.gap.toFixed(1)} m, +${h.dy.toFixed(1)} m`); p2 = c; }
  for (const l of L.LENSES) { const g = ground(l.x, l.z, l.y); assert.ok(l.y - g > 0.6 && l.y - g < 2, l.id); }
  assert.strictEqual(new Set(L.LENSES.map(l => Math.round(l.x / 50))).size, 3, 'trois endroits éloignés');
});

test('les 3 morceaux de carte sont loin les uns des autres', () => {
  const P = L.MAP_PIECES;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.ok(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) > 60, `${P[i].id} / ${P[j].id}`);
  assert.ok(Math.hypot(P[0].x - L.WRECK.x, P[0].z - L.WRECK.z) < L.WRECK.w, 'la bouteille est dans la cale');
});

test('le ponton part de la plage (une marche) et s\'avance dans la mer', () => {
  const P = L.PIER;
  assert.ok(P.top - L.heightAt(P.x, P.z0 + 0.5) < STEP_UP, 'on monte sur le ponton');
  assert.ok(L.heightAt(P.x, P.z1) < L.WATER_Y - 3, 'le bout est dans l\'eau profonde');
  const B = L.GIVERS.barnabe;
  assert.ok(Math.abs(B.y - P.top) < 0.01 && L.colliders.some(c => c.kind === 'deck' && L.inside(c, B.x, B.z, 0)), 'Barnabé est sur le ponton');
});

test('bodyboard : mise à l\'eau, leçon, bouées, départ et arrivée en eau assez profonde', () => {
  const deep = (p) => L.heightAt(p.x, p.z) < L.WATER_Y - 0.15;
  assert.ok(deep(L.LAUNCH), 'mise à l\'eau');
  assert.ok(deep(L.RACE.start) && deep(L.RACE.finish), 'départ / arrivée');
  for (const b of L.LESSON) assert.ok(L.heightAt(b.x, b.z) < L.WATER_Y - 1, `bouée verte ${b.x},${b.z}`);
  for (const b of L.RACE.buoys) assert.ok(L.heightAt(b.x, b.z) < L.WATER_Y - 1, `bouée ${b.x},${b.z}`);
  for (const [x, z] of L.ISLAND_ROUTE) assert.ok(L.heightAt(x, z) < L.WATER_Y - 1, `bouée orange ${x},${z}`);
  // la course est longue (plus de 250 m), et sa ligne droite ne traverse pas la terre
  let len = 0, prev = L.RACE.start;
  for (const b of L.RACE.buoys) {
    len += Math.hypot(b.x - prev.x, b.z - prev.z);
    for (let k = 0; k <= 20; k++) { const x = prev.x + (b.x - prev.x) * k / 20, z = prev.z + (b.z - prev.z) * k / 20; assert.ok(L.heightAt(x, z) < L.WATER_Y - 0.15, `terre sur la course en ${x.toFixed(0)},${z.toFixed(0)}`); }
    prev = b;
  }
  assert.ok(len > 250, `course de ${len.toFixed(0)} m`);
  assert.ok(Math.hypot(L.RACK.x - L.LAUNCH.x, L.RACK.z - L.LAUNCH.z) < 14, 'les planches sont près de l\'eau');
  assert.ok(L.RACK.y > L.WATER_Y + 0.4, 'le râtelier est sur le sable');
  assert.strictEqual(L.swell(0, 30, 1), 0);
  assert.ok(Math.abs(L.swell(0, L.shoreZ(0) - 8, 0.3)) > 0);
});

test('l\'Île aux Mouettes : une vraie île au large, avec une plage où accoster', () => {
  const I = L.ISLAND;
  assert.ok(L.heightAt(I.x, I.z) > 2, 'le haut de l\'île');
  assert.ok(Math.hypot(I.x - L.START.x, I.z - L.START.z) > 200, 'loin du village');
  for (let a = 0; a < 6.28; a += 0.5) assert.ok(L.heightAt(I.x + Math.cos(a) * (I.r + 6), I.z + Math.sin(a) * (I.r + 6)) < -0.3, 'entourée d\'eau');
  assert.ok(walkable(I.x + I.r - 1, I.z, L.CHEST.x, L.CHEST.z), 'de la plage de l\'île jusqu\'à la croix');
});

test('le bébé phoque : sa flaque est au fond de la grotte, la mer n\'est pas loin', () => {
  const s = L.SEAL, home = L.SEAL_HOME;
  assert.ok(s.y > L.WATER_Y + 0.2, 'la flaque est hors de l\'eau');
  assert.ok(Math.hypot(s.x - L.CAVE.x, s.z - L.CAVE.z) < L.CAVE.r - 2, 'dans la grotte');
  assert.ok(L.heightAt(home.x, home.z) < L.WATER_Y - 0.25, 'la mer est profonde près de Maman Phoque');
  const d = Math.hypot(s.x - home.x, s.z - home.z);
  assert.ok(d > 15 && d < 50, `${d.toFixed(1)} m jusqu'à la mer`);
  assert.ok(Math.hypot(L.ICECREAM.x - s.x, L.ICECREAM.z - s.z) > 150, 'le glacier est à l\'autre bout de la carte');
});

test('le fort : 5 chats dedans, 4 drapeaux sur les tours, la porte au sud est ouverte', () => {
  const inFort = L.cats.filter(c => c.group === 'clearing');
  assert.strictEqual(inFort.length, 5);
  for (const c of inFort) assert.ok(Math.hypot(c.x - L.FORT.x, c.z - L.FORT.z) < L.FORT.r - 1.5, c.id);
  const gx = L.FORT.x, gz = L.FORT.z + L.FORT.r;
  assert.ok(!L.colliders.some(c => c.kind === 'rock' && L.inside(c, gx, gz, 0.6)), 'porte libre');
  for (const t of L.fortTowers) assert.ok(t.h < H2, 'on peut sauter sur les remparts');
  assert.strictEqual(L.FORT_FLAGS.length, 4);
  for (const f of L.FORT_FLAGS) assert.ok(f.y - L.FORT.y < H2 * 0.9, 'drapeau à portée de saut');
});

test('les personnages sont sur le sol', () => {
  for (const [n, p] of Object.entries(L.npcs)) assert.ok(Math.abs(p.y - L.heightAt(p.x, p.z)) < 0.01 && p.y > 1, n);
  for (const [n, g] of Object.entries(L.GIVERS)) assert.ok(g.y > L.WATER_Y + 0.3 && !solidAt(g.x, g.z, g.y + 0.5), n);
  assert.ok(L.START.y > 2, 'départ au village');
  for (const p of L.PORTALS) assert.ok(Math.abs(L.heightAt(p.x, p.z) - L.START.y) < 0.5, 'portail');
});

test('5 médailles, 5 missions, sauvegarde à part', () => {
  assert.strictEqual(L.medals.length, 5);
  assert.deepStrictEqual(L.medals.map(m => m.id).sort(), ['m_chest', 'm_fort', 'm_light', 'm_race', 'm_seal']);
  assert.ok(L.medals.every(m => m.visible === false), 'aucune médaille visible au départ');
  assert.strictEqual(L.SAVE_KEY, 'dogfight.aventure.niveau6');
  assert.strictEqual(L.ID, 6);
});

console.log(passed + ' tests réussis');
