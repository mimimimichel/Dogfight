// Tests de la couche de vie du Parc des Toutous (niveau 1) : node test/level1life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level1.js';
import * as LL from '../public/adventure/level1life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 1, le Parc des Toutous)');
const P = LL.PLAN, PAL = LL.PALETTE;
const kinds = (l) => new Set(l.map(e => e.kind));
const act = (p) => (PAL.props[p.kind] || {}).act;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
  for (let x = -172; x <= 172; x += 4) for (let z = -172; z <= 172; z += 4) {
    if (!LL.walkable(x, z)) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 15, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis éclair, 8 sortes de bêtes, 40 objets interactifs, 8 habitants occupés (5 avec une demande), 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  assert.ok(P.props.filter(act).length >= 40, P.props.length + ' objets');
  const busy = P.villagers.filter(v => v.act || v.loop || v.body === 'critter');
  assert.ok(busy.length >= 8, busy.length + ' habitants occupés');
  assert.ok(P.villagers.filter(v => v.defi).length >= 5, 'demandes');
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 10, 'des défis variés');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'push', 'press', 'splash']) assert.ok(P.props.some(p => act(p) === k), 'aucun objet « ' + k + ' »');
});

test('le plan est déterministe (deux amis en coop voient le même monde)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
  assert.strictEqual(JSON.stringify(planLife(LL.SPEC).props.map(p => p.id)), JSON.stringify(P.props.map(p => p.id)));
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, une haie, un arbre ou dans l\'eau ; les bêtes d\'eau dans l\'eau', () => {
  for (const e of [...P.props, ...P.villagers.filter(v => !v.loop && v.body !== 'critter'), ...P.defis, ...P.secrets]) {
    assert.ok(LL.walkable(e.x, e.z), `${e.id} pas sur un sol marchable`);
    assert.ok(!S.blockedAt(e.x, e.z), `${e.id} dans un obstacle`);
    assert.ok(!LL.treeAt(e.x, e.z, 0.5), `${e.id} dans un arbre`);
  }
  for (const v of P.villagers) {
    if (v.loop) for (const [x, z] of v.loop) assert.ok(LL.walkable(x, z), `${v.id} : son circuit passe en (${x}, ${z})`);
    else assert.ok(S.heightAt(v.x, v.z) > 0.3, v.id + ' dans l\'eau');
  }
  for (const f of P.fauna) {
    const F = PAL.fauna[f.kind];
    if (F.water) assert.ok(LL.isWater(f.x, f.z), `${f.id} (aquatique) hors de l'eau`);
    else if (f.kind === 'frog') assert.ok(Math.abs(S.heightAt(f.x, f.z) - S.WATER_Y) < 1.6, `${f.id} loin de la rive`);
    else assert.ok(LL.walkable(f.x, f.z), `${f.id} pas sur un sol marchable`);
  }
});

test('rien sur les portails, le départ, Mamie, les personnages et objets de quête, la voie du train ni le terrain d\'agility', () => {
  const quest = [S.START, S.npcs.mamie, S.npcs.gaston, S.npcs.puppy, ...S.PORTALS, ...S.CHECKPOINTS, ...S.LANTERNS, ...S.CLUES, ...S.balls, ...S.medals, ...S.cats, ...S.STATIONS, ...S.crates, S.PEDESTAL, S.FOUNTAIN];
  for (const e of [...P.props, ...P.villagers.filter(v => !v.loop), ...P.defis, ...P.secrets]) {
    for (const q of quest) assert.ok(d2(e, q) > 2.4, `${e.id} trop près d'un lieu de quête (${q.id || q.name || q.to || ''} en ${q.x}, ${q.z})`);
  }
  for (const p of P.props) {
    assert.ok(S.nearTrack(p.x, p.z).d > 4, `${p.id} sur la voie du petit train`);
    assert.ok(!(Math.abs(p.x - S.AGILITY.x) < S.AGILITY.hw + 1 && Math.abs(p.z - S.AGILITY.z) < S.AGILITY.hd + 1), `${p.id} sur le terrain d'agility`);
    assert.ok(Math.hypot(p.x - S.CAROUSEL.x, p.z - S.CAROUSEL.z) > S.CAROUSEL.r + 1.5 && Math.hypot(p.x - S.KIOSK.x, p.z - S.KIOSK.z) > S.KIOSK.r + 1.5, `${p.id} sur le manège ou le kiosque`);
    if ((PAL.props[p.kind] || {}).solid) for (const b of S.bones) assert.ok(d2(p, b) > 1.5, `${p.id} (solide) sur l'os ${b.id}`);
  }
  // la Gare des Mondes (quai, voie et train) reste dégagée
  const G = S.GARE, inGare = (x, z, m) => Math.abs(x - G.x) < 5.6 + m && z > G.z - 4.4 - m && z < G.z + 2.6 + m;
  for (const e of [...P.props, ...P.villagers.filter(v => !v.loop), ...P.defis, ...P.secrets]) assert.ok(!inGare(e.x, e.z, 1), `${e.id} dans la Gare des Mondes`);
  for (const v of P.villagers) if (v.loop) for (const [x, z] of v.loop) assert.ok(!inGare(x, z, 0.5), v.id + ' passe dans la gare');
  for (const v of P.villagers) if (v.loop) for (const [x, z] of v.loop) for (const q of [S.START, S.npcs.mamie, ...S.PORTALS]) assert.ok(Math.hypot(x - q.x, z - q.z) > 4, v.id + ' passe sur le départ');
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Map(P.props.map(p => [p.id, p])), vill = new Set(P.villagers.map(v => v.id));
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { assert.ok(LL.walkable(it.x, it.z), d.id + ' : objet au-dessus de l\'eau ou d\'un obstacle'); const gy = S.supportAt(it.x, it.z, it.y, 0).y; assert.ok(it.y - gy > 0.5 && it.y - gy < 3, d.id + ' : objet trop haut ou enterré'); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) assert.ok(r.y - S.heightAt(r.x, r.z) > 1 && r.y - S.heightAt(r.x, r.z) < 7.5, d.id + ' : anneau hors d\'atteinte');
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && act(propIds.get(id)) === 'bounce', d.id + ' : trampoline ' + id);
    if (d.type === 'hits') for (const id of d.props) assert.ok(propIds.has(id) && act(propIds.get(id)), d.id + ' : objet ' + id);
    if (d.type === 'goal') { for (const id of d.balls) { assert.ok(propIds.has(id) && act(propIds.get(id)) === 'push', d.id + ' : boule ' + id); assert.ok(d2(propIds.get(id), d.pen) > d.pen.r + 3, d.id + ' : boule déjà dans le rond'); } assert.ok(LL.walkable(d.pen.x, d.pen.z)); }
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id) && act(propIds.get(id)) === 'chime', d.id + ' : tuyau ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id), d.id + ' : ' + id);
    if (d.type === 'race') {
      for (const [x, z] of d.path) assert.ok(LL.walkable(x, z), d.id + ' : chemin');
      for (let i = 1; i < d.path.length; i++) for (let k = 0; k <= 20; k++) { const x = d.path[i - 1][0] + (d.path[i][0] - d.path[i - 1][0]) * k / 20, z = d.path[i - 1][1] + (d.path[i][1] - d.path[i - 1][1]) * k / 20; assert.ok(!S.blockedAt(x, z), d.id + ' : obstacle sur la course'); }
      assert.ok(PAL.fauna[d.critter]);
    }
    if (d.type === 'chase') assert.ok(PAL.fauna[d.critter], d.id);
    if (d.type === 'herd') {
      assert.ok(LL.walkable(d.pen.x, d.pen.z));
      for (const c of d.chicks) { if (Array.isArray(c)) assert.ok(LL.walkable(c[0], c[1]), d.id + ' : petit perdu'); else { assert.ok(propIds.has(c.stuck), d.id + ' : coincé dans ' + c.stuck); assert.ok(act(propIds.get(c.stuck)) === 'shake'); } }
      assert.ok(d.item ? PAL.props[d.item] : PAL.fauna[d.critter], d.id);
    }
    if (d.type === 'whack') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou'); }
    if (d.type === 'fish') for (const [x, z] of d.holes) {
      assert.ok(LL.isWater(x, z), d.id + ' : les poissons sautent dans l\'eau');
      // on peut les attraper depuis la rive (ils sautent vers elle)
      let shore = false; for (let a = 0; a < 6.28 && !shore; a += 0.2) for (let r = 0.5; r < 3.5 && !shore; r += 0.5) shore = LL.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r);
      assert.ok(shore, d.id + ' : trou trop loin de la rive');
    }
    if (d.type === 'rings' || d.type === 'coins') assert.ok(d.time >= 25 && d.time <= 90);
  }
});

test('habitants : des répliques (qui / texte), et une demande pour ceux qui proposent un défi', () => {
  for (const v of P.villagers) {
    const l = LL.LINES[v.id];
    assert.ok(l && l.talk && l.talk.length, v.id + ' ne dit rien');
    for (const group of [...l.talk, l.ask || [], l.thanks || []]) for (const ln of group) assert.ok(typeof ln.who === 'string' && ln.who && typeof ln.text === 'string' && ln.text.length > 5, v.id + ' : réplique mal formée');
    if (v.defi) { assert.ok(P.defis.some(d => d.id === v.defi), v.id + ' : défi inconnu'); assert.ok(l.ask && l.thanks, v.id + ' : pas de demande / merci'); }
    if (v.defi && !v.loop) { const d = P.defis.find(q => q.id === v.defi); assert.ok(d2(v, d) < 12, v.id + ' : son défi est trop loin'); }
  }
});

test('traînées de paillettes : au-dessus du sol, en file, et elles mènent aux cachettes', () => {
  for (const t of P.trails) {
    for (let i = 0; i < t.pts.length; i++) {
      const p = t.pts[i];
      assert.ok(p.y > Math.max(S.heightAt(p.x, p.z), S.WATER_Y) + 0.5, t.id + ' enterrée');
      if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
    }
  }
  for (const s of P.secrets) assert.ok(P.trails.some(t => { const e = t.pts[t.pts.length - 1]; return Math.hypot(e.x - s.x, e.z - s.z) < 6; }), s.id + ' : aucune traînée n\'y mène');
});

console.log(passed + ' tests réussis');
