// Tests de la couche de vie (lifeplan.js) appliquée à la Station des Neiges : node test/life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level5.js';
import * as LL from '../public/adventure/level5life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 5)');
const P = LL.PLAN;
const kinds = (l) => new Set(l.map(e => e.kind));

test('densité : sur 1000 points marchables tirés au hasard, plus de 90 % ont quelque chose de vivant à moins de 12 m', () => {
  for (const seed of [7, 11, 2024]) {
    const r = LL.density({ samples: 1000, seed, radius: 12 });
    assert.ok(r.samples >= 500);
    assert.ok(r.ratio >= 0.9, `seulement ${(r.ratio * 100).toFixed(1)} % (trous : ${JSON.stringify(r.holes)})`);
  }
});

test('jamais un grand vide : aucun point marchable (grille de 4 m) à plus de 15 m de quelque chose', () => {
  const grid = new PointGrid(12);
  for (const p of planPoints(P)) grid.add(p);
  let worst = 0, at = null;
  for (let x = -178; x <= 178; x += 4) for (let z = -178; z <= 178; z += 4) {
    if (!LL.walkable(x, z)) continue;
    // le Fort Moustache est une arène : il se vide exprès pour la bataille
    if (Math.hypot(x - S.FORT.x, z - S.FORT.z) < S.FORT.r + 4) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 15, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis éclair, 8 sortes de bêtes, 40 objets, 6 habitants, 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  assert.ok(P.props.filter(p => LL.PALETTE.props[p.kind] && LL.PALETTE.props[p.kind].act).length >= 40, P.props.length + ' objets');
  assert.ok(P.villagers.length >= 6);
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 8, 'des défis variés');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'push', 'press', 'hat']) assert.ok(P.props.some(p => (LL.PALETTE.props[p.kind] || {}).act === k), 'aucun objet « ' + k + ' »');
});

test('le plan est déterministe (deux amis en coop voient le même monde)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
  assert.strictEqual(JSON.stringify(planLife(LL.SPEC).props.map(p => p.id)), JSON.stringify(P.props.map(p => p.id)));
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, un sapin ou sur les pistes de luge ; les objets solides loin des chemins de quête', () => {
  for (const e of [...P.props, ...P.villagers.filter(v => !v.ellipse), ...P.defis]) {
    assert.ok(!S.blockedAt(e.x, e.z), `${e.id} dans un obstacle`);
    assert.ok(!S.trees.some(t => Math.hypot(t.x - e.x, t.z - e.z) < 0.5 * t.s + 0.5), `${e.id} dans un sapin`);
  }
  for (const p of P.props) {
    assert.ok(S.runInfo(p.x, p.z).d > S.RUN_W + 2, `${p.id} sur une piste de luge`);
    for (const b of S.SNOWBALLS) {
      const dx = S.GARDEN.x - b.x, dz = S.GARDEN.z - b.z, l = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p.x - b.x) * dx + (p.z - b.z) * dz) / l));
      if ((LL.PALETTE.props[p.kind] || {}).solid) assert.ok(Math.hypot(p.x - b.x - t * dx, p.z - b.z - t * dz) > 2.4, `${p.id} sur le chemin de la boule ${b.id}`);
    }
  }
  for (const c of S.CHECKPOINTS) assert.ok(!P.props.some(p => (LL.PALETTE.props[p.kind] || {}).solid && Math.hypot(p.x - c.x, p.z - c.z) < 3), 'objet sur le drapeau ' + c.name);
  for (const s of P.secrets) assert.ok(S.supportAt(s.x, s.z, s.y + 0.5, 0).y < s.y + 0.6, `coffre ${s.id} enterré`);
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Set(P.props.map(p => p.id)), vill = new Set(P.villagers.map(v => v.id));
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { const gy = S.supportAt(it.x, it.z, it.y, 0).y; assert.ok(it.y - gy > 0.5 && it.y - gy < 3, d.id + ' : flocon trop haut ou enterré'); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) assert.ok(r.y - S.heightAt(r.x, r.z) > 1 && r.y - S.heightAt(r.x, r.z) < 7.5, d.id + ' : anneau hors d\'atteinte');
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && P.props.find(p => p.id === id).kind === 'drift', d.id + ' : trampoline ' + id);
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id), d.id + ' : carillon ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id), d.id + ' : ' + id);
    if (d.type === 'race') { for (const [x, z] of d.path) assert.ok(LL.walkable(x, z), d.id + ' : chemin'); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'herd') { for (const [x, z] of d.chicks) assert.ok(LL.walkable(x, z)); assert.ok(LL.walkable(d.pen.x, d.pen.z)); }
    if (d.type === 'whack' || d.type === 'fish') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou'); }
    if (d.type === 'fish') for (const [x, z] of d.holes) assert.ok(S.iceAt(x, z), 'les poissons sautent par des trous dans la glace');
    if (d.type === 'rings' || d.type === 'coins') assert.ok(d.time >= 25 && d.time <= 90);
  }
});

test('habitants : des répliques (qui / texte), et une demande pour ceux qui proposent un défi', () => {
  for (const v of P.villagers) {
    const l = LL.LINES[v.id];
    assert.ok(l && l.talk && l.talk.length, v.id + ' ne dit rien');
    for (const group of [...l.talk, l.ask || [], l.thanks || []]) for (const ln of group) assert.ok(typeof ln.who === 'string' && ln.who && typeof ln.text === 'string' && ln.text.length > 5, v.id + ' : réplique mal formée');
    if (v.defi) { assert.ok(P.defis.some(d => d.id === v.defi), v.id + ' : défi inconnu'); assert.ok(l.ask && l.thanks, v.id + ' : pas de demande / merci'); }
    if (!v.ellipse) assert.ok(LL.walkable(v.x, v.z), v.id + ' pas sur la neige');
  }
});

test('traînées de paillettes : au-dessus du sol, en file (on les suit du regard)', () => {
  for (const t of P.trails) {
    for (let i = 0; i < t.pts.length; i++) {
      const p = t.pts[i];
      assert.ok(p.y > S.heightAt(p.x, p.z) + 0.5 || t.id === 't_riviere', t.id + ' enterrée');
      if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
    }
  }
});

test('bêtes : dans la station, chouettes perchées sur un sapin, poissons sous la glace', () => {
  for (const f of P.fauna) {
    assert.ok(Math.pow(f.x ** 4 + f.z ** 4, 0.25) < 180, f.id + ' hors de la station');
    if (f.kind === 'owl') assert.ok(f.perch > S.heightAt(f.x, f.z) + 2, f.id + ' pas perchée');
    if (f.kind === 'fish') assert.ok(S.iceAt(f.x, f.z), f.id + ' pas sur la glace');
  }
});

console.log(passed + ' tests réussis');
