// Tests des données du niveau 1 (le Parc des Toutous) : node test/level1.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level1.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 1');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, RUN = 8.5;
const H1 = V1 * V1 / (2 * G);
const reach = (dy) => (dy > H1 ? 0 : RUN * (V1 / G + Math.sqrt(2 * (H1 - dy) / G)));
const solidAt = (x, z, y) => L.colliders.filter(c => (c.solid || ['tree', 'rock', 'trunk'].includes(c.kind)) && !c.off && L.inside(c, x, z, 0.2) && c.y1 > y - 1.1 && c.y0 < y);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const segDist = (p, [[ax, az], [bx, bz]]) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l));
  return Math.hypot(p.x - ax - t * dx, p.z - az - t * dz);
};
const pathDist = (p) => Math.min(...L.PATHS.map(s => segDist(p, s)));

test('100 os dorés, sur la terre ferme (ou une plate-forme) et jamais dans un obstacle', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const b of L.bones) {
    const s = L.supportAt(b.x, b.z, b.y, 0, 0);
    assert.ok(b.y - s.y < 2.0 && b.y - s.y > 0.5, b.id + ' trop haut ou trop bas');
    assert.ok(Math.hypot(b.x, b.z) < L.ISLAND_R - 10, b.id + ' hors du parc');
    assert.ok(!L.inWater(b.x, b.z) || s.collider, b.id + ' dans l\'eau');
    assert.strictEqual(solidAt(b.x, b.z, b.y).length, 0, b.id + ' dans un obstacle');
  }
});

test('un grand parc : les os sont partout, beaucoup loin des chemins', () => {
  assert.ok(L.WORLD >= 380 && L.ISLAND_R >= 170, 'monde trop petit');
  const xs = L.bones.map(b => b.x), zs = L.bones.map(b => b.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 280 && Math.max(...zs) - Math.min(...zs) > 260, 'os trop regroupés');
  const off = L.bones.filter(b => pathDist(b) > 12).length;
  assert.ok(off >= 40, `seulement ${off} os loin des chemins`);
  const far = L.bones.filter(b => d(b, L.START) > 80).length;
  assert.ok(far >= 50, `seulement ${far} os à plus de 80 m du départ`);
});

test('5 médailles (mêmes identifiants qu\'avant), toutes cachées au départ', () => {
  assert.deepStrictEqual(L.medals.map(m => m.id).sort(), ['m_balls', 'm_cats', 'm_crate', 'm_puppy', 'm_tree']);
  assert.ok(L.medals.every(m => m.visible === false), 'une médaille est visible dès le début');
});

test('le départ, Mamie, Gaston et les drapeaux sont sur la terre ferme ; Mamie près du départ', () => {
  for (const p of [L.START, L.npcs.mamie, L.npcs.gaston, L.npcs.puppy, ...L.CHECKPOINTS]) assert.ok(p.y > 1.0, JSON.stringify(p));
  assert.ok(d(L.npcs.mamie, L.START) < 10);
  assert.ok(L.CHECKPOINTS.length >= 6);
});

test('la Gare des Mondes (plus de portails) : près du départ, à côté de l\'allée, sur un sol libre', () => {
  assert.strictEqual(L.PORTALS.length, 0, 'plus de portails au Parc');
  const G = L.GARE;
  assert.ok(G && d(G, L.START) < 20, 'gare trop loin du départ');
  const inFoot = (x, z, m) => Math.abs(x - G.x) < 5.6 + (m || 0) && z > G.z - 4.4 - (m || 0) && z < G.z + 2.6 + (m || 0);
  // le terrain sous la gare est presque plat (le socle descend sous le sol)
  let lo = Infinity, hi = -Infinity;
  for (let x = -5; x <= 5; x++) for (const z of [-4.2, -2, 0, 2]) { const h = L.heightAt(G.x + x, G.z + z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  assert.ok(hi - lo < 0.8, 'gare en pente');
  assert.ok(Math.abs(G.top - G.y - 0.42) < 1e-6);
  // l'allée vers l'arche reste libre ; rien d'autre ne pousse dans la gare
  assert.ok(!inFoot(0, G.z, 3), 'la gare mord sur l\'allée');
  for (const c of L.colliders) if (!c.off && !c.gare && c.kind !== 'wall' && c.kind !== 'post' && !(c.kind === 'rock' && Math.abs(c.z - (G.z - 3.05)) < 0.01) && c.kind !== 'plank') assert.ok(!inFoot(c.x, c.z), 'obstacle dans la gare : ' + c.kind);
  for (const p of [L.START, L.npcs.mamie, ...L.medals, ...L.balls, ...L.CHECKPOINTS, ...L.signs, ...L.crates, ...L.LANTERNS, ...L.CLUES, ...L.cats, L.PEDESTAL, L.FOUNTAIN, L.KENNEL])
    assert.ok(!inFoot(p.x, p.z, 2.5), 'trop près de la gare : ' + JSON.stringify(p));
  for (const b of L.bones) assert.ok(!inFoot(b.x, b.z, 0.5), 'os dans la gare');
  // le quai est bien au-dessus du sol (on y monte), à pied par les marches
  const s = L.supportAt(G.x, G.z, G.top + 1, 0);
  assert.ok(Math.abs(s.y - G.top) < 0.01, 'quai praticable');
});

test('Grand Chêne : marches de moins de 2 m, le tronc s\'arrête sous le sommet', () => {
  const tops = L.treeSteps.map(s => s.top).concat([L.TREE_TOP]);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 2.0, 'marche ' + i);
  const trunk = L.colliders.find(c => c.kind === 'trunk' && c.x === 0 && c.z === 0);
  assert.ok(trunk.y1 < L.TREE_TOP);
  const s = L.treeSteps[3];
  assert.strictEqual(L.supportAt(s.x, s.z, s.top + 0.1, 0).y, s.top);
  assert.ok(L.supportAt(s.x, s.z, s.top - 3, 0).y < s.top);
});

test('Biscotte : une piste d\'indices à travers tout le parc, jusqu\'au labyrinthe', () => {
  assert.strictEqual(L.CLUES.length, 3);
  const trail = [L.npcs.mamie, ...L.CLUES, L.PUPPY_HIDE, L.npcs.mamie];
  let len = 0;
  for (let i = 1; i < trail.length; i++) { assert.ok(d(trail[i], trail[i - 1]) > 40, `étape ${i} trop proche`); len += d(trail[i], trail[i - 1]); }
  assert.ok(len > 450, `piste trop courte : ${len.toFixed(0)} m`);
  for (const c of L.CLUES) assert.ok(c.y > 0.5 && solidAt(c.x, c.z, c.y + 0.5).length === 0, c.id + ' mal placé');
  assert.ok(Math.hypot(L.DIG.x - L.SANDPIT.x, L.DIG.z - L.SANDPIT.z) < L.SANDPIT.r - 1, 'le trou est dans le bac à sable');
});

test('le labyrinthe : le centre (Biscotte) est atteignable depuis l\'entrée, sans haie dessus', () => {
  const I = L.MAZE_INFO, id = (c, r) => c + ',' + r, key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const seen = new Set([id(I.mid, I.N - 1)]), q = [[I.mid, I.N - 1]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [a, b] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) if (!seen.has(id(a, b)) && I.open.has(key(id(c, r), id(a, b)))) { seen.add(id(a, b)); q.push([a, b]); }
  }
  assert.strictEqual(seen.size, I.N * I.N, 'des cases du labyrinthe sont fermées');
  assert.strictEqual(solidAt(L.PUPPY_HIDE.x, L.PUPPY_HIDE.z, L.PUPPY_HIDE.y + 0.5).length, 0);
  // l'entrée est libre
  const ex = I.entrance.x;
  for (let z = I.z0 + I.N * I.C + 2; z > I.z0 + I.N * I.C - 2; z -= 0.5) assert.strictEqual(solidAt(ex, z, L.heightAt(ex, z) + 0.5).length, 0, 'haie dans l\'entrée');
  assert.ok(I.ends.length >= 3, 'pas assez d\'impasses');
});

test('6 lanternes aux quatre coins du parc, toutes atteignables', () => {
  assert.strictEqual(L.LANTERNS.length, 6);
  for (const l of L.LANTERNS) {
    assert.ok(d(l, L.START) > 90, l.id + ' trop près du départ');
    const s = L.supportAt(l.x, l.z, l.y + 0.1, 0, 0);
    assert.ok(Math.abs(s.y - l.y) < 0.05, l.id + ' pas posée sur le sol');
    for (const m of L.LANTERNS) if (m !== l) assert.ok(d(l, m) > 50, `${l.id} et ${m.id} trop proches`);
  }
  // la cabane perchée : escalier en spirale
  let prev = { x: L.TH_STEPS[0].x, z: L.TH_STEPS[0].z, r: 0, top: L.TREEHOUSE.y };
  for (const s of [...L.TH_STEPS, L.TH_DECK]) {
    assert.ok(s.top - prev.top < 2.0, 'marche trop haute');
    assert.ok(Math.hypot(s.x - prev.x, s.z - prev.z) - s.r - prev.r < reach(s.top - prev.top) * 0.5, 'marche trop loin');
    prev = s;
  }
});

test('5 balles de tennis bien cachées, loin les unes des autres', () => {
  assert.strictEqual(L.balls.length, 5);
  for (const b of L.balls) {
    assert.ok(d(b, L.START) > 45, b.id + ' trop près du départ');
    const s = L.supportAt(b.x, b.z, b.y, 0, 0);
    assert.ok(b.y - s.y > 0.5 && b.y - s.y < 1.5, b.id + ' en l\'air');
    for (const c of L.balls) if (c !== b) assert.ok(d(b, c) > 40, `${b.id} et ${c.id} trop proches`);
  }
  // le toit du kiosque : des caisses en escalier
  let prev = { top: L.KIOSK.y, x: L.KIOSK_STEPS[0].x + 1.5, z: L.KIOSK_STEPS[0].z, r: 0 };
  for (const s of [...L.KIOSK_STEPS.map(k => ({ x: k.x, z: k.z, r: k.w / 2, top: k.top })), { x: L.KIOSK.x, z: L.KIOSK.z, r: L.KIOSK.r + 0.5, top: L.KIOSK.roof }]) {
    assert.ok(s.top - prev.top < 1.6, 'caisse trop haute');
    assert.ok(Math.hypot(s.x - prev.x, s.z - prev.z) - s.r - prev.r < reach(s.top - prev.top) * 0.45, 'caisse trop loin');
    prev = s;
  }
  // le toboggan et le Rocher aux Lapins
  const tops = [L.PLAYGROUND.y, ...L.SLIDE_STEPS.map(s => s.top), L.SLIDE.top];
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 1.2, 'marche du toboggan');
  let pr = { x: L.RABBIT_ROCKS[0].x - L.RABBIT_ROCKS[0].r - 0.5, z: L.RABBIT_ROCKS[0].z, r: 0, top: L.RABBIT_ROCKS[0].y };
  for (const k of L.RABBIT_ROCKS) { assert.ok(k.top - pr.top < 1.4); assert.ok(Math.hypot(k.x - pr.x, k.z - pr.z) - k.r - pr.r < reach(k.top - pr.top) * 0.45, 'rocher trop loin'); pr = k; }
});

test('6 chats farceurs éparpillés dans tout le parc', () => {
  const gang = L.cats.filter(c => c.group === 'clearing');
  assert.strictEqual(gang.length, 6);
  for (const c of gang) {
    assert.ok(c.y > 1.0 && !L.inWater(c.x, c.z, 0.5), c.id + ' dans l\'eau');
    assert.strictEqual(solidAt(c.x, c.z, c.y + 0.5).length, 0, c.id + ' dans un obstacle');
    for (const o of gang) if (o !== c) assert.ok(d(c, o) > 30, `${c.id} et ${o.id} trop proches`);
  }
});

test('agility : 8 obstacles dans l\'ordre, sur le terrain ; les haies demandent un saut', () => {
  const A = L.AGILITY;
  assert.strictEqual(L.COURSE.length, 8);
  assert.strictEqual(L.COURSE[L.COURSE.length - 1].type, 'finish');
  let len = d(L.AGILITY_START, L.COURSE[0]);
  for (let i = 0; i < L.COURSE.length; i++) {
    const o = L.COURSE[i];
    assert.ok(Math.abs(o.x - A.x) < A.hw && Math.abs(o.z - A.z) < A.hd, o.type + ' hors du terrain');
    if (i) len += d(o, L.COURSE[i - 1]);
    if (o.type === 'hurdle') assert.ok(o.bar - o.y > 0.6 && o.bar - o.y < H1 - 0.5, 'haie trop basse ou trop haute');
    if (o.type === 'table' || o.type === 'seesaw') assert.ok(o.top - o.y < H1 - 0.5);
  }
  // le temps permis laisse de la marge à un enfant (au moins 2,5 fois le temps d'un adulte)
  const best = len / RUN;
  assert.ok(L.AGILITY_TIME.aventure > best * 2.5 && L.AGILITY_TIME.defi > best * 1.6, `chrono trop serré (${best.toFixed(1)} s au mieux)`);
  assert.strictEqual(L.AGILITY_TIME.promenade, 0);
});

test('la mare : profonde au milieu, l\'îlot et le ponton dépassent, les pédalos flottent', () => {
  assert.ok(L.heightAt(L.POND.x, L.POND.z) < L.WATER_Y - 2);
  assert.ok(L.ISLET.top > L.WATER_Y + 0.6);
  for (const b of L.BOATS) assert.ok(L.heightAt(b.x, b.z) < -0.4, 'pédalo échoué');
  assert.ok(L.heightAt(L.JETTY.x0, L.JETTY.z) > 0.3, 'le ponton part de la rive');
  assert.ok(L.heightAt(L.JETTY.x1, L.JETTY.z) < 0, 'le ponton avance dans l\'eau');
  assert.ok(d(L.ISLET, { x: L.JETTY.x1, z: L.JETTY.z }) > 12, 'l\'îlot est trop près du ponton (sans pédalo)');
});

test('le petit train : une boucle de plus de 600 m, hors de l\'eau, 4 gares au bord de la voie', () => {
  assert.ok(L.TRACK.total > 600);
  for (const p of L.TRACK.pts) {
    assert.ok(L.heightAt(p.x, p.z) > 0.5, 'voie dans l\'eau');
    assert.strictEqual(L.colliders.filter(c => (c.solid || ['tree', 'rock', 'trunk', 'hedge'].includes(c.kind)) && !c.off && L.inside(c, p.x, p.z, 1.2)).length, 0, `obstacle sur la voie (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
  }
  assert.strictEqual(L.STATIONS.length, 4);
  for (const s of L.STATIONS) { assert.ok(L.nearTrack(s.x, s.z).d > 2 && L.nearTrack(s.x, s.z).d < 3.2, s.id + ' loin de la voie'); }
  assert.ok(d(L.STATIONS[0], L.START) < 50, 'la gare de l\'Entrée est près du départ');
  const p = L.trackAt(L.TRACK.total + 5), q = L.trackAt(5);
  assert.ok(Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6, 'la boucle se referme');
});

test('le jardin secret a une seule petite ouverture', () => {
  const G2 = L.GARDEN, a = L.GARDEN_GAP.a;
  const free = (x, z) => solidAt(x, z, L.heightAt(x, z) + 0.5).length === 0;
  assert.ok(free(G2.x + Math.cos(a) * G2.r, G2.z + Math.sin(a) * G2.r), 'ouverture bouchée');
  let blocked = 0;
  for (let k = 0; k < 24; k++) { const b = k / 24 * Math.PI * 2; if (!free(G2.x + Math.cos(b) * G2.r, G2.z + Math.sin(b) * G2.r)) blocked++; }
  assert.ok(blocked >= 20, 'le jardin est trop ouvert');
});

test('on ne finit pas trop vite : le tour de toutes les missions fait plus de 1,2 km', () => {
  // ordre glouton depuis le départ (plus court qu'aucun enfant), retours chez Mamie et Gaston compris
  const stops = [...L.CLUES, L.PUPPY_HIDE, L.npcs.mamie, ...L.LANTERNS, ...L.balls, L.PEDESTAL, ...L.cats.filter(c => c.group === 'clearing'), L.npcs.gaston, { x: 0, z: 0 }];
  let cur = L.START, len = 0;
  const left = stops.slice();
  while (left.length) { left.sort((a, b) => d(a, cur) - d(b, cur)); len += d(left[0], cur); cur = left.shift(); }
  assert.ok(len > 1200, `tour trop court : ${len.toFixed(0)} m`);
});

test('arbres : pas sur les chemins ni sur la voie, ni dans les lieux', () => {
  assert.ok(L.trees.length >= 80);
  for (const t of L.trees) {
    assert.ok(t.y > 1.2, 'arbre dans l\'eau');
    assert.ok(pathDist(t) > 3, 'arbre sur un chemin');
    assert.ok(L.nearTrack(t.x, t.z).d > 4, 'arbre sur la voie');
  }
});

console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS ci-dessus' : ''));
