// Tests de la couche de vie de la Plage aux Coquillages (niveau 6) : node test/level6life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level6.js';
import * as LL from '../public/adventure/level6life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 6)');
const P = LL.PLAN;
const kinds = (l) => new Set(l.map(e => e.kind));
const AQUA = new Set(['dolphin', 'jelly']);

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
  for (let x = -184; x <= 184; x += 4) for (let z = -148; z <= 170; z += 4) {
    if (!LL.walkable(x, z)) continue;
    // arènes voulues : le Fort de Sable (les chats) et la Grotte aux Flaques (le bébé phoque, le Roi des Crabes)
    if (Math.hypot(x - S.FORT.x, z - S.FORT.z) < S.FORT.r + 4) continue;
    if (Math.hypot(x - S.CAVE.x, z - S.CAVE.z) < S.CAVE.r + 3.5) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 15, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis éclair, 8 sortes de bêtes, 40 objets, 8 habitants (5 avec une demande), 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  assert.ok(P.props.filter(p => LL.PALETTE.props[p.kind] && LL.PALETTE.props[p.kind].act).length >= 40, P.props.length + ' objets');
  assert.ok(P.villagers.length >= 8);
  assert.ok(P.villagers.filter(v => v.defi && v.act).length >= 5, 'habitants qui demandent un service');
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 10, 'des défis variés');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'kick', 'press', 'build']) assert.ok(P.props.some(p => (LL.PALETTE.props[p.kind] || {}).act === k), 'aucun objet « ' + k + ' »');
  for (const ai of ['scuttle', 'swim', 'bask', 'flock', 'wander', 'hover']) assert.ok(P.fauna.some(f => LL.PALETTE.fauna[f.kind].ai === ai), 'aucune bête « ' + ai + ' »');
});

test('des traînées de paillettes mènent à chaque cachette', () => {
  for (const s of P.secrets) assert.ok(P.trails.some(t => { const e = t.pts[t.pts.length - 1]; return Math.hypot(e.x - s.x, e.z - s.z) < 6; }), 'pas de traînée vers ' + s.id);
});

test('le plan est déterministe (deux amis en coop voient le même monde)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
  assert.strictEqual(JSON.stringify(planLife(LL.SPEC).props.map(p => p.id)), JSON.stringify(P.props.map(p => p.id)));
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, un palmier, une cabine ni dans la mer ; les bêtes de mer au large', () => {
  const solid = (x, z, m) => S.colliders.some(c => !c.life && !['deck', 'cap', 'stone', 'lamp'].includes(c.kind) && S.inside(c, x, z, m) && c.y1 > S.heightAt(x, z) + 0.25 && c.y0 < S.heightAt(x, z) + 1.6);
  for (const e of [...P.props, ...P.villagers.filter(v => !v.ellipse), ...P.defis, ...P.secrets]) {
    assert.ok(!S.blockedAt(e.x, e.z), `${e.id} dans une maison`);
    assert.ok(!solid(e.x, e.z, 0.3), `${e.id} dans un obstacle`);
    assert.ok(!S.palms.some(t => Math.hypot(t.x - e.x, t.z - e.z) < 0.9), `${e.id} dans un palmier`);
    assert.ok(S.heightAt(e.x, e.z) > 0.05, `${e.id} dans la mer`);
  }
  for (const f of P.fauna) {
    if (AQUA.has(f.kind)) { assert.ok(S.heightAt(f.x, f.z) < -1.5, f.id + ' pas assez au large'); continue; }
    assert.ok(LL.walkable(f.x, f.z), f.id + ' pas sur la terre ferme');
  }
});

test('les quêtes restent dégagées : personnages, tas à creuser, crabes, drapeaux, portail, médailles', () => {
  const spots = [...Object.values(S.GIVERS), S.npcs.mamie, S.START, ...S.PORTALS, ...S.CHECKPOINTS, ...S.MOUNDS, S.PIECE_MOUND, S.CHEST, ...S.CRABS, ...S.LENSES, ...S.MAP_PIECES, ...S.medals, S.SEAL, ...S.crates];
  const solidLike = (k) => { const a = (LL.PALETTE.props[k] || {}); return a.solid || a.act === 'bounce' || a.act === 'build' || a.act === 'kick' || a.act === 'break'; };
  for (const e of [...P.props, ...P.defis, ...P.villagers.filter(v => !v.ellipse), ...P.secrets]) {
    for (const q of spots) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) > (e.kind && !solidLike(e.kind) ? 2 : 2.4), `${e.id} trop près d'un point de quête (${q.id || q.name || ''} ${q.x.toFixed(0)},${q.z.toFixed(0)})`);
    if (e.kind) assert.ok(Math.hypot(e.x - S.FORT.x, e.z - S.FORT.z) > S.FORT.r + 3, `${e.id} dans le fort des chats`);
  }
  // le chemin du bébé phoque (grotte → mer) et les mises à l'eau des planches
  for (const p of P.props) {
    const dx = S.SEAL_HOME.x - S.CAVE.x, dz = S.SEAL_HOME.z - S.CAVE.z, l = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p.x - S.CAVE.x) * dx + (p.z - S.CAVE.z) * dz) / l));
    assert.ok(Math.hypot(p.x - S.CAVE.x - t * dx, p.z - S.CAVE.z - t * dz) > 3, `${p.id} sur le chemin du bébé phoque`);
    assert.ok(Math.hypot(p.x - S.RACK.x, p.z - S.RACK.z) > 6 && Math.hypot(p.x - S.LAUNCH.x, p.z - S.LAUNCH.z) > 6, `${p.id} sur la mise à l'eau des bodyboards`);
  }
});

test('les parcours de bodyboard (leçon, course, route de l\'île) restent libres', () => {
  for (const f of P.fauna.filter(q => AQUA.has(q.kind))) assert.ok(!LL.onSeaRoute(f.x, f.z, 18 + (LL.PALETTE.fauna[f.kind].home || 0)), f.id + ' nage sur un parcours');
  for (const e of [...P.props, ...P.defis]) assert.ok(!LL.onSeaRoute(e.x, e.z, 4), e.id + ' sur un parcours');
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Set(P.props.map(p => p.id)), vill = new Set(P.villagers.map(v => v.id));
  const H2 = 144 / 64 + 110.25 / 64;
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { const gy = S.supportAt(it.x, it.z, it.y, 0).y; assert.ok(it.y - gy > 0.5 && it.y - gy < 3 && gy > 0, d.id + ' : bonbon trop haut, enterré ou dans l\'eau'); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) assert.ok(r.y - S.heightAt(r.x, r.z) > 1 && r.y - S.heightAt(r.x, r.z) < H2 * 0.85, d.id + ' : anneau hors d\'atteinte');
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
      for (const r of d.rings) assert.ok(LL.walkable(r.x, r.z), d.id + ' : anneau au-dessus du vide');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && LL.PALETTE.props[P.props.find(p => p.id === id).kind].act === 'bounce', d.id + ' : matelas ' + id);
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id) && LL.PALETTE.props[P.props.find(p => p.id === id).kind].act === 'chime', d.id + ' : carillon ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'build') for (const id of d.props) { const p = P.props.find(q => q.id === id); assert.ok(p && LL.PALETTE.props[p.kind].act === 'build' && p.stage < LL.PALETTE.props[p.kind].stages, d.id + ' : château ' + id); }
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id), d.id + ' : ' + id);
    if (d.type === 'volley') {
      assert.ok(vill.has(d.server) && d.need >= 4);
      const n = { x: Math.sin(d.net.yaw), z: Math.cos(d.net.yaw) }, side = (x, z) => (x - d.net.x) * n.x + (z - d.net.z) * n.z;
      assert.ok(side(d.x, d.z) > 2, 'le signal est du côté des chiens');
      const sv = P.villagers.find(v => v.id === d.server); assert.ok(side(sv.x, sv.z) < -2, 'le lanceur est de l\'autre côté du filet');
      for (let k = 2.5; k <= 6.5; k += 1) for (let u = -2.5; u <= 2.5; u += 1) { const x = d.net.x + n.x * k + Math.cos(d.net.yaw) * u, z = d.net.z + n.z * k - Math.sin(d.net.yaw) * u; assert.ok(LL.walkable(x, z), 'terrain de volley praticable'); }
    }
    if (d.type === 'race') { for (const [x, z] of d.path) assert.ok(LL.walkable(x, z), d.id + ' : chemin'); assert.ok(LL.PALETTE.fauna[d.critter]); }
    if (d.type === 'chase') { assert.ok(LL.PALETTE.fauna[d.critter]); for (let a = 0; a < 6.28; a += 0.5) assert.ok(S.heightAt(d.x + Math.cos(a) * d.leash * 0.75, d.z + Math.sin(a) * d.leash * 0.75) > 0.1, d.id + ' : la course part dans la mer'); }
    if (d.type === 'herd') { for (const [x, z] of d.chicks) assert.ok(LL.walkable(x, z)); assert.ok(LL.walkable(d.pen.x, d.pen.z)); assert.ok(S.fromShore(d.pen.x, d.pen.z) < 8, 'les bébés tortues vont vers la mer'); }
    if (d.type === 'whack' || d.type === 'fish') { assert.ok(d.holes.length >= 4 && d.need >= 4); for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou'); assert.ok(LL.PALETTE.props[d.holeKind], d.id + ' : sorte de trou'); }
    if (d.type === 'fish') assert.ok(d.holes.filter(([x, z]) => S.POOLS.some(p => Math.hypot(p.x - x, p.z - z) < p.r)).length >= 3, 'les poissons sautent dans les flaques des rochers');
    if (d.time !== undefined) assert.ok(d.time >= 25 && d.time <= 120);
  }
});

test('habitants : des répliques (qui / texte), et une demande pour ceux qui proposent un défi', () => {
  for (const v of P.villagers) {
    const l = LL.LINES[v.id];
    assert.ok(l && l.talk && l.talk.length, v.id + ' ne dit rien');
    for (const group of [...l.talk, l.ask || [], l.thanks || []]) for (const ln of group) assert.ok(typeof ln.who === 'string' && ln.who && typeof ln.text === 'string' && ln.text.length > 5, v.id + ' : réplique mal formée');
    if (v.defi) { assert.ok(P.defis.some(d => d.id === v.defi), v.id + ' : défi inconnu'); assert.ok(l.ask && l.thanks, v.id + ' : pas de demande / merci'); }
    if (!v.ellipse) assert.ok(LL.walkable(v.x, v.z), v.id + ' pas sur le sable');
    else for (let a = 0; a < 6.28; a += 0.1) { const x = v.ellipse.x + Math.cos(a) * v.ellipse.rx, z = v.ellipse.z + Math.sin(a) * v.ellipse.rz; assert.ok(LL.walkable(x, z), v.id + ' : sa tournée passe dans un obstacle en ' + x.toFixed(0) + ',' + z.toFixed(0)); }
  }
});

test('traînées de paillettes : au-dessus du sol, en file (on les suit du regard)', () => {
  for (const t of P.trails) {
    for (let i = 0; i < t.pts.length; i++) {
      const p = t.pts[i];
      assert.ok(p.y > S.supportAt(p.x, p.z, p.y, 0).y + 0.5, t.id + ' enterrée');
      if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
    }
  }
});

test('niveau 6 inchangé : médailles, coquillages, quêtes', () => {
  assert.deepStrictEqual(S.medals.map(m => m.id), ['m_light', 'm_chest', 'm_seal', 'm_race', 'm_fort']);
  assert.strictEqual(S.bones.length, 100);
  const n = S.colliders.length;
  S.addColliders([{ type: 'cyl', x: 0, z: 140, r: 0.4, y0: 0, y1: 2, kind: 'rock', life: 'test' }]);
  S.addColliders([{ type: 'cyl', x: 0, z: 140, r: 0.4, y0: 0, y1: 2, kind: 'rock', life: 'test' }]);
  assert.strictEqual(S.colliders.length, n + 1, 'les obstacles de la couche de vie se remplacent (on peut rejouer le niveau)');
  S.addColliders([]);
  assert.strictEqual(S.colliders.length, n);
});

console.log(passed + ' tests réussis');
