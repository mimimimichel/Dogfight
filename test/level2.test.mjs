// Tests des données du niveau 2 de l'aventure (la Forêt des Moustaches) : node test/level2.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level2.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 2');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, RUN = 8.5;
const H1 = V1 * V1 / (2 * G);
const reach = (dy) => (dy > H1 ? 0 : RUN * (V1 / G + Math.sqrt(2 * (H1 - dy) / G)));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const solidAt = (x, z, y) => L.colliders.filter(c => (c.solid || ['tree', 'rock', 'trunk'].includes(c.kind)) && !c.off && L.inside(c, x, z, 0.2) && c.y1 > y - 1.1 && c.y0 < y);

test('100 croquettes dorées, sur la terre ferme (ou une plate-forme) et jamais dans un mur', () => {
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(L._POINTS, 100, 'aucune croquette prévue ne doit être perdue');
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  for (const l of L.leaves) l.col.off = false;      // (les feuilles magiques poussent quand on saute sur la patte)
  for (const b of L.bones) {
    const s = L.supportAt(b.x, b.z, b.y, 0, 0);
    const bounce = s.collider && s.collider.bounce && b.y - s.y < 3.5;   // en l'air, au-dessus d'un champignon rebondissant
    assert.ok((b.y - s.y < 2.0 || bounce) && b.y - s.y > 0.5, b.id + ' trop haut ou trop bas');
    assert.ok(Math.hypot(b.x, b.z) < L.ISLAND_R - 10, b.id + ' hors de l\'île');
    assert.ok(!L.inWater(b.x, b.z) || s.collider, b.id + ' dans l\'eau');
    assert.strictEqual(solidAt(b.x, b.z, b.y).length, 0, b.id + ' dans un obstacle');
  }
  for (const l of L.leaves) l.col.off = true;
});

test('un grand monde à explorer : croquettes et missions réparties partout', () => {
  assert.ok(L.WORLD >= 380 && L.ISLAND_R >= 170 && L.RADAR > 0, 'monde trop petit');
  const xs = L.bones.map(b => b.x), zs = L.bones.map(b => b.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 230 && Math.max(...zs) - Math.min(...zs) > 230, 'croquettes trop regroupées');
  // beaucoup de croquettes loin des chemins
  const pathD = (x, z) => Math.min(...L.PATHS.map(([[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  }));
  assert.ok(L.bones.filter(b => pathD(b.x, b.z) > 8).length >= 45, 'pas assez de croquettes cachées loin des chemins');
  assert.ok(L.trees.length >= 250, 'la forêt doit être dense');
});

test('5 médailles (ids des badges), toutes cachées au départ ; le repaire en demande 4', () => {
  assert.deepStrictEqual(L.medals.map(m => m.id), ['m_mush', 'm_cats', 'm_lanterns', 'm_owl', 'm_boss']);
  assert.ok(L.medals.every(m => m.visible === false), 'une médaille visible dès le départ se gagne trop vite');
  assert.ok(L.GATE.solid && !L.GATE.off);
  assert.strictEqual(L.GATE_MEDALS, 4);
});

test('6 lanternes, loin les unes des autres et loin de l\'autel', () => {
  assert.strictEqual(L.lanterns.length, 6);
  for (let i = 0; i < L.lanterns.length; i++) {
    const a = L.lanterns[i];
    assert.ok(d2(a, L.SPOTS.altar) > 60, a.id + ' trop près de l\'autel');
    for (let j = i + 1; j < L.lanterns.length; j++) assert.ok(d2(a, L.lanterns[j]) > 35, `${a.id} et ${L.lanterns[j].id} trop proches`);
    const s = L.supportAt(a.x, a.z, a.y + 0.2, 0, 0.5);
    assert.ok(Math.abs(s.y - a.y) < 0.3, a.id + ' ne repose sur rien');
    assert.ok(a.where, a.id + ' sans indice');
  }
});

test('3 bébés hiboux, loin du nid et les uns des autres ; le nid est sur le Rocher du Hibou', () => {
  assert.strictEqual(L.OWLETS.length, 3);
  for (const o of L.OWLETS) {
    assert.ok(d2(o, L.NEST) > 60, o.id + ' trop près du nid');
    const s = L.supportAt(o.x, o.z, o.y + 0.2, 0, 0.5);
    assert.ok(Math.abs(s.y - o.y) < 0.3, o.id + ' ne repose sur rien');
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(d2(L.OWLETS[i], L.OWLETS[j]) > 60);
  assert.ok(d2(L.NEST, L.OWL) < L.OWL.r - 1.5 && Math.abs(L.heightAt(L.NEST.x, L.NEST.z) - L.OWL_TOP) < 0.05);
});

test('12 buissons à baies dans 3 coins éloignés de la marmite', () => {
  assert.strictEqual(L.BUSHES.length, 12);
  assert.ok(L.BERRIES_NEEDED <= L.BUSHES.length);
  for (const p of L.BERRY_PATCHES) assert.ok(d2(p, L.POT) > 75, p.id + ' trop près du village');
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(d2(L.BERRY_PATCHES[i], L.BERRY_PATCHES[j]) > 120);
  for (const b of L.BUSHES) { assert.ok(b.y > 1.5 && !L.inWater(b.x, b.z), b.id + ' dans l\'eau'); assert.strictEqual(solidAt(b.x, b.z, b.y + 0.5).length, 0, b.id + ' dans un obstacle'); }
});

test('8 chats bandits : 5 au campement, 3 guetteurs en haut des cabanes', () => {
  const cl = L.cats.filter(c => c.group === 'clearing');
  assert.strictEqual(cl.length, 8);
  assert.strictEqual(L.CAMP_CATS, 5);
  for (const c of cl.filter(k => k.lookout)) {
    assert.ok(Math.abs(c.y - L.TH_TOP) < 0.01, c.id + ' pas sur une cabane');
    assert.ok(L.TREEHOUSES.some(t => Math.hypot(c.x - t.x, c.z - t.z) < t.r - 0.8 && Math.hypot(c.x - t.x, c.z - t.z) > t.trunk + 0.6), c.id + ' hors de la plate-forme');
  }
});

test('le départ, Mamie, Biscotte et les amis de la forêt sont sur la terre ferme', () => {
  for (const p of [L.START, L.npcs.mamie, L.npcs.puppy, L.FRIENDS.noisette]) assert.ok(p.y > 1.5, JSON.stringify(p));
  assert.ok(Math.abs(L.FRIENDS.pistache.y - L.TH_TOP) < 0.01);
});

test('Tour des Champignons : marches de moins de 2 m (saut simple)', () => {
  const tops = L.towerCaps.map(s => s.top).concat([L.TOWER_TOP]);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] - tops[i - 1] < 2.0, 'marche ' + i);
  const m = L.medals.find(q => q.id === 'm_mush');
  assert.ok(Math.abs(m.y - L.TOWER_TOP - 1.4) < 0.01 && d2(m, L.TOWER) < 0.1, 'la médaille des hérissons est en haut de la tour');
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
  assert.ok(Math.hypot(L.leaves[0].x - L.SWITCH.x, L.leaves[0].z - L.SWITCH.z) < 4.5, 'première feuille près de la patte');
});

test('champignons rebondissants : le grand permet d\'atteindre la souche', () => {
  const big = L.BIG_BOUNCER;
  const apex = big.top + big.bounce ** 2 / (2 * G) + 10.5 ** 2 / (2 * G);
  assert.ok(apex > L.STUMP.top + 0.5, 'apex ' + apex.toFixed(1) + ' < souche ' + L.STUMP.top.toFixed(1));
});

test('la rivière coupe la forêt ; on la traverse par le pont, les rondins ou le radeau', () => {
  // le pont : du sec d'un bout à l'autre, au-dessus de l'eau
  const B = L.BRIDGE;
  assert.ok(L.inWater(B.x, (B.z0 + B.z1) / 2), 'le pont enjambe l\'eau');
  for (const z of [B.z0, B.z1]) assert.ok(L.heightAt(B.x, z) > B.top - 0.6 - 0.05 && L.heightAt(B.x, z) < B.top + 0.6, 'accès au pont');
  for (let z = B.z0; z <= B.z1; z += 0.5) assert.ok(L.supportAt(B.x, z, B.top + 0.1, 0).y >= B.top - 0.01, 'trou dans le pont');
  // les rondins : des sauts faciles d'une rive à l'autre
  const LG = L.LOGS;
  for (const l of LG) assert.ok(L.inWater(l.x, l.z), 'rondin dans l\'eau');
  for (let i = 1; i < LG.length; i++) assert.ok(d2(LG[i], LG[i - 1]) - LG[i].r - LG[i - 1].r < reach(0.2) * 0.4, 'rondin trop loin');
  const ri = L.riverInfo(LG[0].x, LG[0].z), nx = -ri.tz, nz = ri.tx;
  for (const [l, sgn] of [[LG[0], -1], [LG[LG.length - 1], 1]]) {
    // la berge est à moins d'un petit saut du dernier rondin
    let ok = false;
    for (let o = 0; o < 3; o += 0.25) { const x = l.x + nx * sgn * (l.r + o), z = l.z + nz * sgn * (l.r + o); if (L.heightAt(x, z) > 0.3 && L.heightAt(x, z) < l.top + 1.2) { ok = true; break; } }
    assert.ok(ok, 'berge trop loin des rondins');
  }
  // l'îlot n'est accessible qu'en radeau : son petit ponton touche le radeau à l'arrêt, et il est loin des deux rives
  const p = L.riverAt(L.RAFT.stops.I), J = L.ISLET_JETTY;
  assert.ok(d2(p, J.end) - L.RAFT.r - 0.85 < 0.3, 'le ponton de l\'îlot touche le radeau');
  assert.ok(J.top - L.RAFT.top < 0.6 && L.ISLET.top - J.top < 0.6, 'on passe du radeau au ponton sans sauter');
  for (let a = 0; a < 6.28; a += 0.1) {
    let x = L.ISLET.x, z = L.ISLET.z, wet = 0;
    for (let k = 0; k < 40; k++) { x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.5; if (L.inWater(x, z, -0.2)) wet += 0.5; else if (wet > 0) break; }
    assert.ok(wet > 3 || wet === 0, 'îlot accessible à pied');
  }
  assert.ok(L.RAFT.stops.A < L.RAFT.stops.I && L.RAFT.stops.I < L.RAFT.stops.B);
  for (const D of L.DOCKS) {
    const s = L.supportAt(D.end.x, D.end.z, D.top + 0.1, 0);
    assert.ok(Math.abs(s.y - D.top) < 0.01, 'ponton ' + D.id);
    assert.ok(D.top - L.RAFT.top < 0.6, 'on monte du radeau sur le ponton sans sauter');
    const q = L.riverAt(L.RAFT.stops[D.id]);
    assert.ok(d2(q, D.end) - L.RAFT.r < 1.5, 'le radeau touche le ponton ' + D.id);
  }
  assert.ok(L.DOCKS[0].z > L.riverAt(L.RAFT.stops.A).z && L.DOCKS[1].z < L.riverAt(L.RAFT.stops.B).z, 'un ponton sur chaque rive');
});

test('cabanes dans les arbres : un escalier de planches et des ponts de cordes sans trou', () => {
  const T0 = L.TREEHOUSES[0];
  let prev = { x: L.TH_STEPS[0].x, z: L.TH_STEPS[0].z, r: 0, top: T0.y };
  for (const s of L.TH_STEPS) {
    assert.ok(s.top - prev.top < 1.0, 'marche trop haute');
    assert.ok(Math.hypot(s.x - prev.x, s.z - prev.z) - s.r - prev.r < reach(s.top - prev.top) * 0.4, 'marche trop loin');
    prev = s;
  }
  assert.ok(L.TH_TOP - prev.top < 1.0 && Math.hypot(prev.x - T0.x, prev.z - T0.z) - prev.r - T0.r < 0.5, 'la plate-forme est à portée');
  for (const b of L.ROPE_BRIDGES) {
    for (let k = 0; k <= 40; k++) {
      const x = b.x0 + (b.x1 - b.x0) * k / 40, z = b.z0 + (b.z1 - b.z0) * k / 40;
      assert.ok(Math.abs(L.supportAt(x, z, L.TH_TOP + 0.1, 0).y - L.TH_TOP) < 0.01, 'trou dans un pont de cordes');
    }
  }
  const l4 = L.lanterns.find(l => l.id === 'l4');
  assert.ok(Math.abs(l4.y - L.TH_TOP) < 0.01);
});

test('Plateau Moussu : un escalier de rochers jusqu\'en haut, un chemin derrière la cascade', () => {
  const P = L.PLATEAU;
  let prev = { x: L.PLATEAU_STEPS[0].x, z: L.PLATEAU_STEPS[0].z, r: 0, top: L.PLATEAU_STEPS[0].y };
  for (const k of L.PLATEAU_STEPS) {
    assert.ok(k.top - prev.top < 1.4, 'rocher trop haut');
    assert.ok(Math.hypot(k.x - prev.x, k.z - prev.z) - k.r - prev.r < reach(k.top - prev.top) * 0.4, 'rocher trop loin');
    prev = k;
  }
  assert.ok(prev.top > P.top - 0.6, 'le dernier rocher arrive en haut');
  assert.ok(Math.hypot(prev.x - P.x, prev.z - P.z) - prev.r - (P.r - 0.8) < reach(P.top - prev.top) * 0.4, 'saut vers le plateau');
  assert.ok(Math.abs(L.heightAt(L.SPRING.x, L.SPRING.z) - P.top) < 0.01);
  const bf = L.BEHIND_FALLS;
  assert.ok(L.heightAt(bf.x, bf.z) > 0.6, 'la corniche derrière la cascade est au sec');
  assert.ok(Math.hypot(bf.x - P.x, bf.z - P.z) < Math.hypot(L.FALLS.x - P.x, L.FALLS.z - P.z), 'la corniche est derrière le rideau d\'eau');
  assert.ok(L.inWater(L.FALLS.x + L.FALLS.nx * 3, L.FALLS.z + L.FALLS.nz * 3), 'la cascade tombe dans la mare');
});

test('Vieux Tronc Creux : une porte ouverte, des cristaux et une lanterne à l\'intérieur', () => {
  const H = L.HOLLOW;
  const walls = L.colliders.filter(c => c.wall);
  assert.ok(walls.length > 20);
  for (let z = H.z + H.r - 1.5; z < H.z + H.r + 1.5; z += 0.25) for (let dx = -0.9; dx <= 0.9; dx += 0.3) assert.strictEqual(walls.filter(c => L.inside(c, H.x + dx, z, 0.35)).length, 0, 'porte bouchée');
  for (const c of L.HOLLOW_CRYSTALS) assert.ok(Math.hypot(c.x - H.x, c.z - H.z) < H.r - 0.6);
  assert.ok(d2(L.lanterns.find(l => l.id === 'l3'), H) < 2);
});

test('aucun arbre sur les chemins, la rivière, les lanternes ou les grands lieux', () => {
  for (const t of L.trees) {
    assert.ok(Math.hypot(t.x - L.SPOTS.camp.x, t.z - L.SPOTS.camp.z) > 14, 'arbre dans le campement');
    assert.ok(Math.hypot(t.x - L.SPOTS.village.x, t.z - L.SPOTS.village.z) > 16, 'arbre dans le village');
    assert.ok(L.riverInfo(t.x, t.z).d > 8, 'arbre dans la rivière');
    assert.ok(t.y > 1.0, 'arbre dans l\'eau');
    for (const l of L.lanterns) assert.ok(Math.hypot(t.x - l.x, t.z - l.z) > 2.9, 'arbre sur une lanterne');
  }
});

test('une forêt pleine de vie : jamais plus de 15 m sans rien, sur les chemins comme dans les bois', () => {
  const pts = [].concat(...Object.values(L.LIFE), L.bones, L.lanterns, L.BUSHES, L.crates, L.signs, L.CHIMES, L.LOG_TUNNELS, L.bouncers);
  const gap = (x, z) => { let b = 1e9; for (const p of pts) b = Math.min(b, Math.hypot(p.x - x, p.z - z)); return b; };
  for (const [[ax, az], [bx, bz]] of L.PATHS) {
    const l = Math.hypot(bx - ax, bz - az);
    for (let o = 0; o <= l; o += 2) assert.ok(gap(ax + (bx - ax) * o / l, az + (bz - az) * o / l) < 10, 'chemin vide');
  }
  let n = 0, empty = 0;
  for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6) { if (Math.hypot(x, z) > 150 || L.heightAt(x, z) < 1) continue; n++; if (gap(x, z) > 15) empty++; }
  assert.ok(empty / n < 0.03, `${empty}/${n} coins vides`);
  for (const k of ['squirrel', 'birds', 'rabbit', 'hedgehog', 'pile', 'shrub', 'flowers']) assert.ok(L.LIFE[k].length >= 20, k);
  assert.ok(L.LIFE.frog.length >= 10);
});

test('glands pour Pistache : assez de cachettes, et des défis (course, carillons, nénuphars) qui en donnent', () => {
  assert.ok(L.ACORNS.length >= L.ACORNS_NEEDED * 2);
  assert.strictEqual(new Set(L.ACORNS.map(a => a.id)).size, L.ACORNS.length);
  for (const k of ['pile', 'shrub', 'log', 'lily', 'race', 'melodie']) assert.ok(L.ACORNS.some(a => a.in === k), k);
  // la course suit le grand chemin (aucun arbre dessus)
  const R = L.RACE;
  for (let k = 0; k <= 20; k++) { const x = R.start.x + (R.finish.x - R.start.x) * k / 20, z = R.start.z + (R.finish.z - R.start.z) * k / 20; assert.strictEqual(L.colliders.filter(c => (c.solid || c.kind === 'tree' || c.kind === 'rock') && L.inside(c, x, z, 0.3)).length, 0, 'obstacle sur la piste'); }
  // les nénuphars : des petits sauts depuis la rive
  const LI = L.LILIES;
  for (let i = 1; i < LI.length; i++) assert.ok(Math.hypot(LI[i].x - LI[i - 1].x, LI[i].z - LI[i - 1].z) - LI[i].r - LI[i - 1].r < 1.2);
  for (const l of LI) assert.ok(L.inWater(l.x, l.z), 'nénuphar sur l\'eau');
  // les troncs couchés : on passe dedans
  for (const t of L.LOG_TUNNELS) for (let o = -t.len / 2; o <= t.len / 2; o += 0.5) assert.strictEqual(L.colliders.filter(c => c.log && L.inside(c, t.x + t.dx * o, t.z + t.dz * o, 0.4)).length, 0, 'tronc bouché');
});

console.log(`\n${passed} test(s) réussi(s)`);
