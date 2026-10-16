// Tests de la couche de vie de Port-Croquette (niveau 3) : node test/level3life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level3.js';
import * as LL from '../public/adventure/level3life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 3, Port-Croquette)');
const P = LL.PLAN;
const kinds = (l) => new Set(l.map(e => e.kind));
const act = (p) => (LL.PALETTE.props[p.kind] || {}).act;
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
const trackD = (x, z) => { let d = 1e9; for (let i = 0; i < S.TRACK.length; i++) { const a = S.TRACK[i], b = S.TRACK[(i + 1) % S.TRACK.length]; d = Math.min(d, segD(x, z, a.x, a.z, b.x, b.z)); } return d; };
// objets perchés (balcons, auvents) : ils sont au-dessus du sol, contre la façade
const perched = (e) => e.on !== undefined && e.on[0] !== 'f';

test('densité : sur 1000 points marchables tirés au hasard (rues comprises), plus de 90 % ont quelque chose de vivant à moins de 12 m', () => {
  for (const seed of [7, 11, 2024]) {
    const r = LL.density({ samples: 1000, seed, radius: 12 });
    assert.ok(r.samples >= 500);
    assert.ok(r.ratio >= 0.9, `seulement ${(r.ratio * 100).toFixed(1)} % (trous : ${JSON.stringify(r.holes)})`);
  }
});

test('jamais un grand vide : aucun point marchable (grille de 5 m) à plus de 22 m de quelque chose (hors piste de l\'aérodrome et circuit du stade)', () => {
  const grid = new PointGrid(12);
  for (const p of planPoints(P)) grid.add(p);
  let worst = 0, at = null;
  for (let x = -200; x <= 196; x += 5) for (let z = -200; z <= 176; z += 5) {
    if (!LL.walkable(x, z)) continue;
    // arènes volontairement dégagées : la piste des avions et l'anneau du circuit (les karts y foncent)
    if (x > S.RUNWAY.x0 - 8 && x < S.RUNWAY.x1 + 8 && Math.abs(z - S.RUNWAY.z) < S.RUNWAY.w / 2 + 4) continue;
    if (Math.abs(x - S.STADIUM.x) < 50 && Math.abs(z - S.STADIUM.z) < 40 && trackD(x, z) < S.STADIUM.w / 2 + 2) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 22, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis éclair, 8 sortes de bêtes, 40 objets, 8 habitants (5 avec une demande), 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  assert.ok(P.props.filter(act).length >= 40, P.props.length + ' objets');
  assert.ok(P.villagers.length >= 8);
  assert.ok(P.villagers.filter(v => v.defi).length >= 5);
  assert.ok(P.villagers.filter(v => v.act && v.act !== 'idle' || v.loop).length >= 8, 'habitants occupés');
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 8, 'des défis variés');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'push', 'press']) assert.ok(P.props.some(p => act(p) === k), 'aucun objet « ' + k + ' »');
});

test('le plan est déterministe (deux amis en coop voient la même ville)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, un arbre ou la mer ; rien sur les rues, le circuit, la piste ni le chemin des passants', () => {
  for (const e of [...P.props, ...P.villagers.filter(v => !v.lift), ...P.defis]) {
    if (perched(e)) continue;
    assert.ok(!S.blockedAt(e.x, e.z), `${e.id} dans un mur`);
    assert.ok(!S.trees.some(t => Math.hypot(t.x - e.x, t.z - e.z) < 0.5 * t.s + 0.5), `${e.id} dans un arbre`);
    assert.ok(LL.walkable(e.x, e.z), `${e.id} pas sur la terre ferme`);
  }
  for (const e of [...P.props, ...P.villagers, ...P.secrets]) {
    if (perched(e)) continue;
    assert.ok(!S.onRoad(e.x, e.z, 0.4), `${e.id} sur une rue (karts, voitures, courses)`);
    assert.ok(trackD(e.x, e.z) > S.STADIUM.w / 2 + 1 || Math.abs(e.x - S.STADIUM.x) > 50, `${e.id} sur le circuit`);
    assert.ok(!(e.x > S.RUNWAY.x0 - 4 && e.x < S.RUNWAY.x1 + 4 && Math.abs(e.z - S.RUNWAY.z) < S.RUNWAY.w / 2 + 2), `${e.id} sur la piste`);
  }
  const walkSegs = S.WALKS.flatMap(pts => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]));
  for (const p of P.props) {
    if (perched(p)) continue;
    assert.ok(!walkSegs.some(([a, b]) => segD(p.x, p.z, a[0], a[1], b[0], b[1]) < 0.7), `${p.id} sur le chemin des passants`);
  }
  for (const f of P.fauna) {
    if (f.perch !== undefined) continue;
    const pk = LL.PALETTE.fauna[f.kind];
    if (pk.water) assert.ok(S.groundY(f.x, f.z) < S.WATER_Y - 0.3, `${f.id} (nageur) pas dans l'eau`);
    else assert.ok(LL.walkable(f.x, f.z), `${f.id} pas sur la terre ferme`);
  }
});

test('rien sur les personnages de quête, les karts, les portails, les trophées, les pièces d\'or, les lieux de mission', () => {
  const keep = [...Object.values(S.GIVERS), S.npcs.mamie, S.START, ...S.PORTALS, ...S.KARTS, ...S.medals, ...S.DELIVERY.drops, ...S.TREASURE.spots, ...S.SMUGGLE.crates, ...S.TAXI.places];
  const solid = (p) => (LL.PALETTE.props[p.kind] || {}).solid || act(p) === 'bounce';
  for (const e of [...P.props, ...P.villagers, ...P.defis, ...P.secrets]) for (const k of keep) {
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (e.id === 'silencio' || perched(e)) continue;
    assert.ok(d > (P.props.includes(e) && solid(e) ? 3 : 2.4), `${e.id} trop près d'un lieu de quête (${k.x}, ${k.z})`);
  }
  for (const p of P.props) for (const b of S.bones) if (Math.abs(b.y - p.y) < 3) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) > 1.2, `${p.id} sur une pièce d'or`);
  for (const p of P.props.filter(q => (LL.PALETTE.props[q.kind] || {}).solid)) for (const r of S.ramps) assert.ok(!S.inside(r, p.x, p.z, 2), `${p.id} sur une rampe`);
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Set(P.props.map(p => p.id)), vill = new Set(P.villagers.map(v => v.id));
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { const gy = S.supportAt(it.x, it.z, it.y, 0).y; assert.ok(it.y - gy > 0.5 && it.y - gy < 3, d.id + ' : pièce trop haute ou enterrée'); assert.ok(LL.walkable(it.x, it.z), d.id + ' : pièce hors d\'atteinte ' + it.x + ',' + it.z); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) { const g = S.supportAt(r.x, r.z, r.y - 1, 0).y; assert.ok(r.y - g > 1 && r.y - g < 7.5, d.id + ' : anneau hors d\'atteinte'); }
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
      // les anneaux hauts sont au-dessus d'un château gonflable (on y rebondit)
      for (const r of d.rings) if (r.y - S.groundY(r.x, r.z) > 3.5) assert.ok(P.props.some(p => act(p) === 'bounce' && Math.hypot(p.x - r.x, p.z - r.z) < 1.5), d.id + ' : anneau haut sans tremplin');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && act(P.props.find(p => p.id === id)) === 'bounce', d.id + ' : trampoline ' + id);
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id) && act(P.props.find(p => p.id === id)) === 'chime', d.id + ' : cloche ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id) && P.villagers.find(v => v.id === id).moves, d.id + ' : ' + id);
    if (d.type === 'race') { for (const [x, z] of d.path) { assert.ok(LL.walkable(x, z), d.id + ' : chemin'); assert.ok(!S.onRoad(x, z), d.id + ' : la course passe sur une rue'); } assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'chase') assert.ok(LL.PALETTE.fauna[d.critter], d.id + ' : bête inconnue');
    if (d.type === 'herd') { for (const [x, z] of d.chicks) assert.ok(LL.walkable(x, z), d.id + ' : petit perdu hors d\'atteinte'); assert.ok(LL.walkable(d.pen.x, d.pen.z)); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'whack') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou'); }
    if (d.type === 'fish') {
      assert.ok(d.holes.length >= 4 && d.need >= 4);
      // les poissons sautent de l'eau, à portée de saut depuis le ponton
      for (const [x, z] of d.holes) { assert.ok(S.groundY(x, z) < 0.3, d.id + ' : pas dans l\'eau'); let near = 9; for (let a = 0; a < 6.3; a += 0.3) for (const r of [1, 1.5, 2]) if (LL.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) near = Math.min(near, r); assert.ok(near <= 2, d.id + ' : trou trop loin du ponton'); }
    }
    if (d.type === 'rings' || d.type === 'coins') assert.ok(d.time >= 25 && d.time <= 90);
  }
});

test('habitants : des répliques (qui / texte), une demande pour ceux qui proposent un défi, des marchands qui crient', () => {
  for (const v of P.villagers) {
    const l = LL.LINES[v.id];
    assert.ok(l && l.talk && l.talk.length, v.id + ' ne dit rien');
    for (const group of [...l.talk, l.ask || [], l.thanks || []]) for (const ln of group) assert.ok(typeof ln.who === 'string' && ln.who && typeof ln.text === 'string' && ln.text.length > 5, v.id + ' : réplique mal formée');
    if (v.defi) { assert.ok(P.defis.some(d => d.id === v.defi), v.id + ' : défi inconnu'); assert.ok(l.ask && l.thanks, v.id + ' : pas de demande / merci'); }
    if (v.shout) for (const s of v.shout) assert.ok(s.length <= 14, v.id + ' : cri trop long pour la bulle « ' + s + ' »');
    if (v.loop) for (const [x, z] of v.loop) assert.ok(LL.walkable(x, z) && !S.onRoad(x, z, 0.4), v.id + ' : tournée hors du trottoir ' + x + ',' + z);
    if (v.lift) assert.ok(v.lift.y1 < v.lift.top && v.lift.y0 >= S.GROUND - 0.1, v.id + ' : nacelle');
  }
  assert.ok(P.villagers.filter(v => v.shout).length >= 4, 'des marchands qui crient');
});

test('traînées de paillettes : au-dessus du sol, en file (on les suit du regard), une vers chaque cachette', () => {
  for (const t of P.trails) {
    for (let i = 0; i < t.pts.length; i++) {
      const p = t.pts[i];
      assert.ok(p.y > S.supportAt(p.x, p.z, p.y, 0).y + 0.5, t.id + ' enterrée');
      if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
    }
  }
  for (const s of P.secrets) assert.ok(P.trails.some(t => t.pts.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 22)), s.id + ' : aucune traînée n\'y mène');
});

test('cachettes : posées sur leur support (pas enterrées, pas dans le vide)', () => {
  for (const s of P.secrets) {
    const sup = S.supportAt(s.x, s.z, s.y + 0.5, 0).y;
    assert.ok(sup < s.y + 0.6 && sup > s.y - 0.6, `coffre ${s.id} enterré ou en l'air (${sup} / ${s.y})`);
    assert.ok(!S.blockedAt(s.x, s.z) || s.y > S.GROUND + 3, `coffre ${s.id} dans un mur`);
  }
});

test('bêtes perchées : chats sur un auvent ou un balcon, pots de fleurs aux balcons, un seul par perchoir', () => {
  const seen = new Set();
  for (const e of [...P.fauna, ...P.props]) {
    if (!perched(e)) continue;
    assert.ok(!seen.has(e.on), e.id + ' : perchoir déjà pris');
    seen.add(e.on);
    const i = +e.on.slice(1), sup = e.on[0] === 'a' ? S.awnings[i] : S.balconies[i];
    assert.ok(sup && Math.abs(sup.top - (e.perch !== undefined ? e.perch : e.y)) < 0.01, e.id + ' : pas sur son perchoir');
    assert.ok(Math.hypot(sup.x - e.x, sup.z - e.z) < 1, e.id + ' : à côté de son perchoir');
  }
  assert.ok(P.fauna.filter(f => f.kind === 'chatperche').length >= 5, 'des chats sur les toits');
});

console.log(passed + ' tests réussis');
