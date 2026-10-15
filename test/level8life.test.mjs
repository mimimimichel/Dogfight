// Tests de la couche de vie du Château des Chats (niveau 8) : node test/level8life.test.mjs
import assert from 'node:assert';
import * as S from '../public/adventure/level8.js';
import * as LL from '../public/adventure/level8life.js';
import { planLife, planPoints, PointGrid } from '../public/adventure/lifeplan.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — couche de vie (niveau 8, le Château des Chats)');
const P = LL.PLAN, PAL = LL.PALETTE;
const kinds = (l) => new Set(l.map(e => e.kind));
const pk = (p) => PAL.props[p.kind] || {};
const inRect = (r, x, z, m) => { m = m || 0; return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; };
const AQUA = new Set(['duck', 'carp']);
const wallProp = (p) => !!pk(p).wall;

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
  for (let x = -92; x <= 92; x += 4) for (let z = -92; z <= 92; z += 4) {
    if (!LL.walkable(x, z)) continue;
    // (la salle du trône est une arène : on y joue à chat avec la Capitaine, puis c'est la fête)
    if (inRect(S.THRONE, x, z, 1)) continue;
    const d = grid.nearest(x, z, 40).d;
    if (d > worst) { worst = d; at = [x, z]; }
  }
  assert.ok(worst <= 15, `vide de ${worst.toFixed(1)} m en ${at}`);
});

test('au moins 12 défis, 8 sortes de bêtes, 40 objets interactifs, 8 habitants occupés, 5 cachettes', () => {
  assert.ok(P.defis.length >= 12, P.defis.length + ' défis');
  assert.ok(new Set(P.defis.map(d => d.type)).size >= 8, 'des défis variés');
  assert.ok(kinds(P.fauna).size >= 8, [...kinds(P.fauna)].join(', '));
  const inter = P.props.filter(p => pk(p).act);
  assert.ok(inter.length >= 40, inter.length + ' objets interactifs');
  for (const k of ['bounce', 'shake', 'break', 'chime', 'push', 'press', 'hat', 'light', 'slide']) assert.ok(inter.some(p => pk(p).act === k), 'aucun objet « ' + k + ' »');
  const busy = P.villagers.filter(v => v.act && v.act !== 'idle' || v.sleepy || v.ghost);
  assert.ok(busy.length >= 8, busy.length + ' habitants occupés');
  assert.ok(new Set(P.villagers.map(v => v.act)).size >= 10, 'des activités variées');
  assert.ok(P.villagers.filter(v => v.defi).length >= 5, 'au moins 5 habitants demandent un petit service');
  assert.ok(P.secrets.length >= 5);
  assert.ok(P.trails.length >= 8 && P.trails.reduce((a, t) => a + t.pts.length, 0) >= 60, 'traînées de paillettes');
});

test('le plan est déterministe (deux amis en coop voient le même château)', () => {
  const a = JSON.stringify(planLife(LL.SPEC)), b = JSON.stringify(planLife(LL.SPEC));
  assert.strictEqual(a, b);
  assert.strictEqual(JSON.stringify(planLife(LL.SPEC).props.map(p => p.id)), JSON.stringify(P.props.map(p => p.id)));
});

test('identifiants uniques (sauvegarde : défis, coffres, paillettes)', () => {
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails']) assert.strictEqual(new Set(P[g].map(e => e.id)).size, P[g].length, 'doublon dans ' + g);
});

test('rien dans un mur, une haie, un arbre ou l\'eau (sauf les canes et les carpes)', () => {
  for (const e of [...P.props.filter(p => !wallProp(p)), ...P.villagers, ...P.defis]) {
    assert.ok(LL.walkable(e.x, e.z), `${e.id} pas sur un sol libre (${e.x}, ${e.z})`);
    assert.ok(!S.blockedAt(e.x, e.z), `${e.id} dans un obstacle`);
  }
  for (const p of P.props.filter(wallProp)) {
    const walls = S.colliders.filter(c => (c.kind === 'wall') && !c.off);
    assert.ok(!walls.some(c => S.inside(c, p.x, p.z, 0)), `${p.id} dans le mur`);
    assert.ok(walls.some(c => S.inside(c, p.x, p.z, 0.25)), `${p.id} n'est pas accroché à un mur`);
  }
  for (const f of P.fauna) {
    if (AQUA.has(f.kind)) { assert.ok(LL.inWater(f.x, f.z), f.id + ' pas dans l\'eau'); continue; }
    if (f.kind === 'bat') { assert.ok(f.perch > S.heightAt(f.x, f.z) + 3, f.id + ' pas perchée'); continue; }
    assert.ok(LL.walkable(f.x, f.z), `${f.id} pas sur un sol libre (${f.x}, ${f.z})`);
  }
  // le pied des objets : au sol (dalles, terrasse, prairie)
  for (const p of P.props) assert.ok(Math.abs(p.y - S.heightAt(p.x, p.z)) < 0.05, p.id + ' en l\'air');
});

test('les énigmes, les personnages, les trésors et les chemins de quête restent libres', () => {
  const quest = [
    ...S.medals.map(m => [m.x, m.z, 'médaille ' + m.id]), ...S.SOUVENIRS.map(v => [v.x, v.z, 'souvenir ' + v.id]), ...S.CHECKPOINTS.map(c => [c.x, c.z, 'drapeau ' + c.name]),
    ...S.PLATES.map(p => [p.x, p.z, 'patte dorée']), ...S.BALLS.map(b => [b.x, b.z, 'pelote ' + b.id]), ...S.crates.map(c => [c.x, c.z, 'caisse ' + c.id]),
    ...S.POMPON.map(p => [p.x, p.z, 'Pompon']), [S.CAPTAIN.x, S.CAPTAIN.z, 'la Capitaine'], [S.npcs.mamie.x, S.npcs.mamie.z, 'Mamie'], [S.START.x, S.START.z, 'le départ'],
    [S.LASER_BUTTON.x, S.LASER_BUTTON.z, 'patte rouge'], [S.WALL_SWITCH.x, S.WALL_SWITCH.z, 'bouton des remparts'], [S.SLOT.x, S.SLOT.z, 'empreinte de la pelote'],
  ];
  for (const e of [...P.props, ...P.villagers.filter(v => !v.moves), ...P.secrets]) for (const [x, z, what] of quest) assert.ok(Math.hypot(e.x - x, e.z - z) > 2.4, `${e.id} trop près de ${what}`);
  // le chemin du départ au pont-levis, la pelote de la prairie vers les pattes, la pelote bleue vers le rempart
  const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
  const B1 = S.BALLS.find(b => b.zone === 'out'), B2 = S.BALLS.find(b => b.zone === 'court');
  for (const p of P.props) {
    assert.ok(!(Math.abs(p.x) < 4 && p.z > 13), p.id + ' sur le chemin du château');
    for (const pl of S.PLATES) assert.ok(segD(p.x, p.z, B1.x, B1.z, pl.x, pl.z) > 3, p.id + ' sur le chemin de la pelote');
    assert.ok(segD(p.x, p.z, B2.x, B2.z, S.SLOT.x, S.SLOT.z) > 3, p.id + ' sur le chemin de la pelote bleue');
    // les poissons dorés restent à portée : aucun objet solide ne les recouvre
    const r = pk(p).solid || (pk(p).box ? 1.3 : 0);
    if (r) for (const b of S.bones) assert.ok(Math.hypot(b.x - p.x, b.z - p.z) > r + 0.6, `${p.id} recouvre le poisson doré ${b.id}`);
  }
  // la cachette de la boîte à musique, le labyrinthe et le jeu de chat de la salle du trône restent intacts
  const all = [...P.props, ...P.fauna, ...P.villagers, ...P.defis, ...P.secrets];
  for (const e of all) {
    assert.ok(!inRect(S.HIDEOUT, e.x, e.z, 1), e.id + ' dans la cachette de la boîte à musique');
    assert.ok(!inRect(S.TAG_ZONE, e.x, e.z, 1) && Math.hypot(e.x - S.PARTY.x, e.z - S.PARTY.z) > 8, e.id + ' sur le terrain du jeu de chat');
    if (e.kind !== 'butterfly') assert.ok(!inRect(S.MAZE_RECT, e.x, e.z, 1), e.id + ' dans le labyrinthe');
    assert.ok(Math.hypot(e.x - S.LAKE.x, e.z - S.LAKE.z) > 2.2 || e.id === 's_ile', e.id + ' sur le kiosque de la plume');
  }
  // les cousins de la salle du point rouge courent partout dans la salle : on n'y pose que des tableaux au mur
  for (const p of P.props) if (inRect(S.HALL, p.x, p.z)) assert.ok(wallProp(p), p.id + ' dans la salle du point rouge');
  for (const l of S.lilies) for (const e of all) assert.ok(Math.hypot(e.x - l.x, e.z - l.z) > l.r + 0.3 || AQUA.has(e.kind), e.id + ' sur un nénuphar');
});

test('défis : chaque défi est complet et jouable', () => {
  const propIds = new Map(P.props.map(p => [p.id, p])), vill = new Map(P.villagers.map(v => [v.id, v]));
  const g = (x, z, y) => S.supportAt(x, z, y === undefined ? 200 : y, 0).y;
  for (const d of P.defis) {
    assert.ok(d.name && d.hint, d.id + ' sans nom');
    assert.ok(LL.walkable(d.x, d.z), d.id + ' : départ pas marchable');
    if (d.type === 'coins') { assert.ok(d.items.length >= 8, d.id); for (const it of d.items) { const gy = Math.max(0, g(it.x, it.z, it.y)); assert.ok(it.y - gy > 0.5 && it.y - gy < 3, d.id + ' : pièce trop haute ou enterrée'); assert.ok(LL.walkable(it.x, it.z), d.id + ' : pièce au-dessus de l\'eau'); } }
    if (d.type === 'rings') {
      assert.ok(d.rings.length >= 5);
      for (const r of d.rings) { const h = r.y - LL.ground(r.x, r.z); assert.ok(h > 1 && h < 7.5, d.id + ' : anneau hors d\'atteinte'); assert.ok(LL.walkable(r.x, r.z), d.id + ' : anneau au-dessus de l\'eau'); }
      for (let i = 1; i < d.rings.length; i++) assert.ok(Math.hypot(d.rings[i].x - d.rings[i - 1].x, d.rings[i].z - d.rings[i - 1].z) < 12, d.id + ' : anneaux trop éloignés');
      // les anneaux hauts (plus d'un double saut) sont au-dessus d'un pouf
      for (const r of d.rings) if (r.y - LL.ground(r.x, r.z) > 3.8) assert.ok(P.props.some(p => p.kind === 'pouf' && Math.hypot(p.x - r.x, p.z - r.z) < 1.5), d.id + ' : anneau haut sans pouf dessous');
    }
    if (d.type === 'pads') for (const id of d.pads) assert.ok(propIds.has(id) && pk(propIds.get(id)).act === 'bounce', d.id + ' : pouf ' + id);
    if (d.type === 'xylo') { for (const id of d.chimes) assert.ok(propIds.has(id) && pk(propIds.get(id)).act === 'chime', d.id + ' : cloche ' + id); assert.ok(d.seq.every(i => i < d.chimes.length)); }
    if (d.type === 'touch') for (const id of d.targets) assert.ok(propIds.has(id) && pk(propIds.get(id)).act, d.id + ' : ' + id);
    if (d.type === 'tag') for (const id of d.kids) assert.ok(vill.has(id) && vill.get(id).moves, d.id + ' : ' + id);
    if (d.type === 'race') { for (const [x, z] of d.path) assert.ok(LL.walkable(x, z), d.id + ' : chemin'); assert.ok(PAL.fauna[d.critter]); }
    if (d.type === 'chase') assert.ok(PAL.fauna[d.critter]);
    if (d.type === 'herd') { for (const [x, z] of d.chicks) assert.ok(LL.walkable(x, z)); assert.ok(LL.walkable(d.pen.x, d.pen.z)); assert.ok(PAL.fauna[d.critter]); }
    if (d.type === 'whack' || d.type === 'fish') { assert.ok(d.holes.length >= 4 && d.need >= 4); assert.ok(PAL.fauna[d.critter]); }
    if (d.type === 'whack') for (const [x, z] of d.holes) assert.ok(LL.walkable(x, z), d.id + ' : trou');
    if (d.type === 'fish') for (const [x, z] of d.holes) {
      assert.ok(LL.inWater(x, z), d.id + ' : les grenouilles sautent hors de l\'eau');
      // à portée de patte depuis la berge
      let near = 9; for (let a = 0; a < 6.3; a += 0.2) for (let r = 0.2; r < 3; r += 0.1) if (LL.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) { near = Math.min(near, r); break; }
      assert.ok(near < 1.6, d.id + ' : trou trop loin de la berge (' + near.toFixed(1) + ' m)');
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
    assert.ok(v.body === 'cat', v.id + ' : les gens du château sont des chats');
  }
  // chacun son défi (pas deux habitants pour le même)
  const asked = P.villagers.filter(v => v.defi).map(v => v.defi);
  assert.strictEqual(new Set(asked).size, asked.length);
});

test('cachettes : posées au sol, chacune au bout de sa traînée de paillettes', () => {
  for (const s of P.secrets) {
    assert.ok(Math.abs(S.supportAt(s.x, s.z, s.y + 0.5, 0).y - s.y) < 0.05, `coffre ${s.id} enterré ou en l'air`);
    assert.ok(P.trails.some(t => t.pts.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 7)), s.id + ' : aucune traînée n\'y mène');
    if (s.behind) assert.strictEqual(pk(P.props.find(p => p.id === s.behind)).act, 'slide', s.id + ' : la bibliothèque doit glisser');
  }
});

test('traînées de paillettes : au-dessus du sol, en file (on les suit du regard)', () => {
  for (const t of P.trails) for (let i = 0; i < t.pts.length; i++) {
    const p = t.pts[i];
    assert.ok(p.y > S.supportAt(p.x, p.z, p.y, 0).y + 0.5, t.id + ' enterrée');
    if (i) assert.ok(Math.hypot(p.x - t.pts[i - 1].x, p.z - t.pts[i - 1].z) < 9, t.id + ' : trou dans la traînée');
  }
});

test('les données du château ne bougent pas (quêtes, médailles, sauvegarde)', () => {
  assert.strictEqual(S.SAVE_KEY, 'dogfight.aventure.niveau8');
  assert.deepStrictEqual(S.medals.map(m => m.id), ['m_gate', 'm_wall', 'm_laser', 'm_tree', 'm_goal']);
  assert.ok(!S.colliders.some(c => c.life), 'les obstacles de la vie ne sont ajoutés qu\'au lancement du niveau');
  // addColliders remplace ceux d'une partie précédente (le module survit d'une partie à l'autre)
  const n = S.colliders.length;
  S.addColliders([{ type: 'cyl', x: 99, z: 99, r: 1, y0: 0, y1: 2, kind: 'rock', life: 'a' }]);
  S.addColliders([{ type: 'cyl', x: 99, z: 99, r: 1, y0: 0, y1: 2, kind: 'rock', life: 'a' }]);
  assert.strictEqual(S.colliders.length, n + 1);
  S.addColliders([]);
  assert.strictEqual(S.colliders.length, n);
});

console.log(passed + ' tests réussis');
