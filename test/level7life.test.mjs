// Tests de la couche de vie de la Ferme de Papi Berger (niveau 7) : node test/level7life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level7.js';
import * as LL from '../public/adventure/level7life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 7, la ferme)');
const P = LL.PLAN;
const kinds = (l) => new Set(l.map(e => e.kind));
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const solidKinds = new Set(Object.keys(LL.PALETTE.props).filter(k => LL.PALETTE.props[k].solid));
// colliders d'origine (avant que la couche de vie n'en ajoute dans le jeu)
const COLS = S.colliders.slice();

test('densité : sur 1000 points marchables tirés au hasard, plus de 90 % ont quelque chose de vivant à moins de 12 m', () => {
  for (const seed of [7, 11, 2024]) {
    const r = LL.density({ samples: 1000, seed, radius: 12 });
    assert.ok(r.samples >= 500);
    assert.ok(r.ratio >= 0.9, `seulement ${(r.ratio * 100).toFixed(1)} % (trous : ${JSON.stringify(r.holes)})`);
  }
});

test('jamais un grand vide : aucun point marchable (grille de 4 m) à plus de 16 m de quelque chose', () => {
  const grid = new PointGrid(12);
  for (const p of planPoints(P)) grid.add(p);
  let worst = 0, at = null;
  for (let x = -168; x <= 168; x += 4) for (let z = -168; z <= 168; z += 4) {
    if (!LL.walkable(x, z)) continue;
    // l'enclos des moutons est une arène de rassemblement : on n'y met rien exprès
    if (S.inPen(x, z)) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 16, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis éclair, 8 sortes de bêtes, 40 objets interactifs, 8 habitants occupés, 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  assert.ok(P.props.filter(p => LL.PALETTE.props[p.kind] && LL.PALETTE.props[p.kind].act).length >= 40, P.props.length + ' objets');
  assert.ok(P.villagers.length >= 8);
  assert.ok(P.villagers.filter(v => v.act || v.sleepy).length >= 8, 'des habitants occupés');
  assert.ok(P.villagers.filter(v => v.defi).length >= 5, 'au moins 5 petites demandes');
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 8, 'des défis variés');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'press', 'hat', 'spin', 'splash']) assert.ok(P.props.some(p => (LL.PALETTE.props[p.kind] || {}).act === k), 'aucun objet « ' + k + ' »');
});

test('chaque cachette a sa traînée de paillettes qui y mène', () => {
  for (const s of P.secrets) {
    const near = P.trails.some(t => t.pts.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 6));
    assert.ok(near, `${s.id} sans traînée`);
  }
});

test('le plan est déterministe (deux amis en coop voient le même monde)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, une barrière, un arbre, la mare ; les chemins du tracteur restent libres', () => {
  for (const e of [...P.props, ...P.villagers.filter(v => v.body !== 'critter' || true), ...P.defis]) {
    assert.ok(!COLS.some(c => !c.off && S.inside(c, e.x, e.z, 0.4)), `${e.id} dans un obstacle`);
    assert.ok(!S.trees.some(t => Math.hypot(t.x - e.x, t.z - e.z) < 0.55 * t.s + 0.6), `${e.id} dans un arbre`);
    assert.ok(S.heightAt(e.x, e.z) > 0.6, `${e.id} dans l'eau`);
  }
  for (const p of [...P.props, ...P.villagers]) {
    for (const [[ax, az], [bx, bz]] of S.PATHS) assert.ok(segD(p.x, p.z, ax, az, bx, bz) > 3.5, `${p.id} sur un chemin de terre`);
    assert.ok(Math.hypot(p.x - S.TRACTOR.x, p.z - S.TRACTOR.z) > 7, `${p.id} sur le tracteur`);
  }
  for (const f of P.fauna) {
    const aquatic = ['ducks', 'fish'].includes(f.kind), flying = ['sparrows', 'crows', 'butterflies', 'bees', 'crow'].includes(f.kind);
    if (aquatic) assert.ok(S.heightAt(f.x, f.z) < 0, `${f.id} : les canards et poissons sont dans la mare`);
    else if (!flying) assert.ok(S.heightAt(f.x, f.z) > 0.6, `${f.id} dans l'eau`);
  }
});

test('lieux de quête dégagés : personnages, médailles, ailes du moulin, drapeaux, porte de l\'enclos', () => {
  const quest = [S.npcs.mamie, S.npcs.papi, S.START, ...S.medals, ...S.SAIL_PARTS, ...S.CHECKPOINTS, ...S.COWS, S.PIGLET, S.PIGLET_HOME, S.BASKET, { x: S.GATE.x, z: S.GATE_Z }];
  for (const q of quest) for (const e of [...P.props, ...P.villagers, ...P.secrets]) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) > 3, `${e.id} trop près d'un lieu de quête (${q.id || q.name || [q.x, q.z]})`);
  // rien de solide dans le pré des moutons (on les rassemble vers l'enclos), rien au sol dans l'enclos
  for (const p of P.props) assert.ok(!LL.meadow(p.x, p.z), `${p.id} dans le pré des moutons`);
  for (const f of P.fauna) if (!['sparrows', 'crows', 'butterflies', 'bees'].includes(f.kind)) assert.ok(!LL.meadow(f.x, f.z) && !S.inPen(f.x, f.z), `${f.id} dans le pré des moutons`);
  for (const b of S.bones) for (const p of P.props) if (solidKinds.has(p.kind)) assert.ok(Math.hypot(b.x - p.x, b.z - p.z) > 1.4, `${p.id} sur un os doré`);
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Set(P.props.map(p => p.id)), vill = new Set(P.villagers.map(v => v.id));
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { const gy = S.supportAt(it.x, it.z, it.y, 0).y; assert.ok(it.y - gy > 0.5 && it.y - gy < 3, d.id + ' : œuf trop haut ou enterré'); assert.ok(LL.walkable(it.x, it.z), d.id + ' : œuf dans un obstacle ' + it.x + ',' + it.z); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) assert.ok(r.y - S.heightAt(r.x, r.z) > 1 && r.y - S.heightAt(r.x, r.z) < 7.5, d.id + ' : anneau hors d\'atteinte');
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && P.props.find(p => p.id === id).kind === 'haystack', d.id + ' : meule ' + id);
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id), d.id + ' : cloche ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id), d.id + ' : ' + id);
    if (d.type === 'race') { for (const [x, z] of d.path) assert.ok(LL.walkable(x, z), d.id + ' : chemin ' + x + ',' + z); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'herd') { for (const [x, z] of d.chicks) assert.ok(LL.walkable(x, z), d.id + ' : petit perdu ' + x + ',' + z); assert.ok(LL.walkable(d.pen.x, d.pen.z)); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'whack') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou ' + x + ',' + z); }
    if (d.type === 'fish') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) { assert.ok(S.heightAt(x, z) < 0, d.id + ' : les poissons sautent de la mare ' + x + ',' + z); assert.ok(Math.abs(x - S.JETTY.x) < 3, d.id + ' : à portée du ponton'); } }
    if (d.type === 'scare') { assert.ok(d.spots.length >= 6); for (const [x, z] of d.spots) assert.ok(LL.walkable(x, z), d.id + ' : corbeau ' + x + ',' + z); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'rings' || d.type === 'coins') assert.ok(d.time >= 25 && d.time <= 90);
  }
});

test('habitants : des répliques (qui / texte), une demande pour ceux qui proposent un défi', () => {
  for (const v of P.villagers) {
    const l = LL.LINES[v.id];
    assert.ok(l && l.talk && l.talk.length, v.id + ' ne dit rien');
    for (const group of [...l.talk, l.ask || [], l.thanks || []]) for (const ln of group) assert.ok(typeof ln.who === 'string' && ln.who && typeof ln.text === 'string' && ln.text.length > 5, v.id + ' : réplique mal formée');
    if (v.defi) { assert.ok(P.defis.some(d => d.id === v.defi), v.id + ' : défi inconnu'); assert.ok(l.ask && l.thanks, v.id + ' : pas de demande / merci'); }
    assert.ok(LL.walkable(v.x, v.z), v.id + ' pas sur la terre ferme');
  }
});

test('traînées de paillettes : au-dessus du sol, en file (on les suit du regard)', () => {
  for (const t of P.trails) for (let i = 0; i < t.pts.length; i++) {
    const p = t.pts[i];
    assert.ok(p.y > Math.max(0, S.heightAt(p.x, p.z)) + 0.5, t.id + ' enterrée');
    if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
  }
});

test('cachettes : sur la terre ferme (ou une botte), atteignables, jamais enterrées', () => {
  for (const s of P.secrets) {
    assert.ok(s.y >= S.heightAt(s.x, s.z) - 0.05 && S.heightAt(s.x, s.z) > 0.6, s.id);
    assert.ok(S.supportAt(s.x, s.z, s.y + 0.5, 0).y < s.y + 0.6, `coffre ${s.id} enterré`);
  }
});

test('les sauvegardes et missions de la ferme ne changent pas', () => {
  assert.strictEqual(S.medals.map(m => m.id).join(','), 'm_sheep,m_eggs,m_piglet,m_cats,m_mill');
  assert.strictEqual(S.bones.length, 100);
  for (const d of P.defis) assert.ok(!S.medals.some(m => m.id === d.id));
});

console.log(passed + ' tests réussis');
