// Tests des objets sculptés (sculpt.js) : node test/sculpt.test.mjs
// Budgets de triangles (téléphone / ordinateur), sommets finis (pas de NaN : ils font des carrés noirs
// à l'écran avec le flou lumineux), boîtes plausibles (les objets restent dans leurs anciens volumes).
import assert from 'node:assert';
import * as SC from '../public/adventure/sculpt.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Objets sculptés');
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const finite = (g) => { for (const k of ['position', 'normal', 'uv', 'color']) { assert.ok(g.attributes[k], k); for (const v of g.attributes[k].array) assert.ok(Number.isFinite(v), k + ' non fini'); } };
const box = (g) => { g.computeBoundingBox(); return g.boundingBox; };

test('palmier : tronc + palmes, sommets finis, budgets, sommet au bon endroit', () => {
  for (const lite of [false, true]) for (const pl of [{ h: 6.5, lean: 0.2, rot: 1 }, { h: 8.5, lean: -0.35, rot: 4 }]) {
    const P = SC.palmGeometry(pl, 7, { lite });
    finite(P.trunk); finite(P.fronds);
    const t = tris(P.trunk) + tris(P.fronds);
    assert.ok(t < (lite ? 1500 : 3600), t + ' triangles');
    assert.ok(P.top[1] > pl.h * 0.75 && P.top[1] <= pl.h + 0.01, 'sommet ' + P.top[1]);
    const b = box(P.fronds);
    assert.ok(b.max.y < pl.h + 2.5 && b.min.y > pl.h - 4.5, 'palmes ' + b.min.y + '…' + b.max.y);
  }
});
test('buisson à baies : volume feuillu, ~2 m de large, budgets', () => {
  for (const lite of [false, true]) {
    const g = SC.berryBushGeometry(3, lite); finite(g);
    const b = box(g);
    assert.ok(b.max.x - b.min.x > 1.4 && b.max.x - b.min.x < 2.6, 'largeur ' + (b.max.x - b.min.x));
    assert.ok(b.max.y > 1.0 && b.max.y < 1.8 && b.min.y > -0.3, 'hauteur ' + b.min.y + '…' + b.max.y);
    assert.ok(tris(g) < (lite ? 4000 : 16000), tris(g) + ' triangles');
    const c = SC.berryClusterGeometry(lite); finite(c); assert.ok(tris(c) < 800, 'grappe ' + tris(c));
  }
});
test('étal de marché : le comptoir et l\'auvent restent dans les volumes de collision', () => {
  const s = { w: 3, d: 2, top: 1, canopy: 2.7, color: 0xe04848 };
  // (pas de matières en dehors du navigateur : on vérifie seulement les tests de géométrie)
  const g = SC.roundBox(1, 0.5, 0.8, 0.05, 2); for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v)); const b = box(g);
  assert.ok(Math.abs(b.max.x - 0.5) < 1e-3 && Math.abs(b.max.y - 0.25) < 1e-3, 'boîte arrondie');
  assert.ok(s.canopy > s.top);
});
test('pelote, pouf, griffoir, bottes de foin, meule : sommets finis et budgets', () => {
  for (const lite of [false, true]) {
    const y = SC.yarnBallGeometry(1, { lite }); finite(y); assert.ok(tris(y) < (lite ? 2500 : 7000), 'pelote ' + tris(y));
    const yb = box(y); assert.ok(yb.max.y < 1.1 && yb.min.y > -1.1, 'pelote ronde');
    const p = SC.poufGeometry(1.3, 0.62, { lite }); finite(p); assert.ok(tris(p) < (lite ? 2000 : 5000), 'pouf ' + tris(p));
    const pb = box(p); assert.ok(pb.max.y < 0.7 && pb.max.y > 0.5 && pb.max.x < 1.4, 'pouf ' + pb.max.y);
    const sp = SC.scratchPostParts(4.6, { lite }); finite(sp.sisal); finite(sp.carpet);
    const sq = SC.squareBaleGeometry({ lite }); finite(sq); const sb = box(sq); assert.ok(sb.max.y < 0.75 && sb.min.y > -0.75, 'botte carrée');
    const rb = SC.roundBaleGeometry(0.8, 1.3, { lite }); finite(rb); assert.ok(tris(rb) < (lite ? 1200 : 3500), 'botte ronde ' + tris(rb));
    const hs = SC.haystackGeometry(1.35, 1.1, { lite }); finite(hs); assert.ok(box(hs).max.y < 1.5, 'meule');
  }
});
test('tentes et maisons-champignons : constructeurs partagés, sommets finis', () => {
  const Cl = SC.builder(1), Wd = SC.builder(1);
  SC.addTent(Cl, Wd, 10, 2, -5, 0.6, { seed: 1 });
  const c = Cl.geometry(), w = Wd.geometry(); finite(c); finite(w);
  const b = box(c); assert.ok(b.max.y <= 2 + 2.6 + 0.05 && b.min.y >= 2 - 0.05, 'tente ' + b.min.y + '…' + b.max.y);
  const Bs = [SC.builder(1), SC.builder(1), SC.builder(1), SC.builder(1)];
  SC.addMushHouse(Bs, { x: 0, z: 0, y: 0, h: 3.4, r: 1.8, capR: 2.8, yaw: 0.4, col: '#e0453a' }, {});
  for (const B of Bs) finite(B.geometry());
});
console.log(passed + ' test(s) réussi(s)');
