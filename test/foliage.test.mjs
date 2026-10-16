// Tests des géométries de feuillage (foliage.js) : node test/foliage.test.mjs
import assert from 'node:assert';
import * as THREE from '../public/vendor/three.module.min.js';
import * as FOL from '../public/adventure/foliage.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Feuillages');
const tris = (g) => g.index.count / 3;

for (const sp of Object.keys(FOL.SPECIES)) {
  test(`feuillu « ${sp} » : quelques centaines de triangles, 2 groupes, boîte plausible`, () => {
    for (const seed of [1, 2, 3]) for (const bush of [false, true]) {
      const g = FOL.broadleafGeometry(sp, seed, { bush });
      assert.ok(tris(g) >= 250 && tris(g) <= 800, `${tris(g)} triangles`);
      assert.ok(g.attributes.position.count < 2000, g.attributes.position.count + ' sommets');
      assert.strictEqual(g.groups.length, 2, 'bois + feuillage');
      assert.strictEqual(g.groups[0].start + g.groups[0].count, g.groups[1].start);
      const b = g.boundingBox, S = FOL.SPECIES[sp];
      assert.ok(b.min.y > -0.8 && b.min.y < 0.2, 'pied au sol : ' + b.min.y);
      assert.ok(b.max.y > S.C + S.R[1] * 0.7 && b.max.y < S.C + S.R[1] * 1.6, 'cime : ' + b.max.y);
      assert.ok(b.max.x - b.min.x > S.R[0] * 1.6 && b.max.x - b.min.x < S.R[0] * 3.2, 'largeur : ' + (b.max.x - b.min.x));
      for (const k of ['normal', 'uv', 'color', 'fol']) assert.ok(g.attributes[k], k);
      const uv = g.attributes.uv.array;
      // (l'écorce se répète ; le feuillage reste dans l'atlas)
      const fol = g.attributes.fol.array;
      for (let i = 0; i < fol.length / 3; i++) if (fol[i * 3 + 1] > 0.5) assert.ok(uv[i * 2] >= 0 && uv[i * 2] <= 1 && uv[i * 2 + 1] >= 0 && uv[i * 2 + 1] <= 1, 'uv hors atlas');
      for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v));
    }
  });
}

test('touffes : légères, rondes, centrées', () => {
  for (const kind of ['leaf', 'serr', 'blossom']) for (const big of [1, 2, 3.4]) {
    const g = FOL.clumpGeometry(kind, 2, 22, big);
    assert.ok(tris(g) <= 450, `${kind} ×${big} : ${tris(g)} triangles`);
    assert.strictEqual(g.groups.length, 0, 'un seul appel de dessin');
    const b = g.boundingBox, c = b.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(c.x) < 0.5 && Math.abs(c.z) < 0.5, 'centrée');
    assert.ok(b.max.x - b.min.x > 1.6 && b.max.x - b.min.x < 3.4, 'taille : ' + (b.max.x - b.min.x));
  }
});

test('matrice d\'arbre : la couronne arrive à peu près où étaient les anciennes boules', () => {
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (const [h, sc] of [[3.8, 0.85], [6, 1], [9.5, 1.4], [11, 1.6]]) for (const sp of ['round', 'fruit', 'cherry']) {
    FOL.treeMatrix(m4, sp, 0, 0, 0, sc, h, 0);
    m4.decompose(p, q, s);
    const S = FOL.SPECIES[sp], c = FOL.crownCenter(S, s.x, s.y), want = (S.top || 1) * h + 0.9 * sc;
    assert.ok(Math.abs(c - want) < 0.05, `${sp} h=${h} : centre ${c.toFixed(2)} au lieu de ${want.toFixed(2)}`);
    assert.ok(s.y > 0 && Math.abs(s.x - sc) < 1e-6);
  }
});

test('teinte des instances : douce, jamais noire', () => {
  for (const hex of [0x4caf3a, 0xd8902a, 0xf8d070, 0x2e7a2c]) {
    const c = FOL.leafTint(hex);
    assert.ok(Math.min(c.r, c.g, c.b) > 0.45 && Math.max(c.r, c.g, c.b) < 1.15, hex.toString(16));
  }
  assert.ok(FOL.isBlossom(0xf0a0c8) && FOL.isBlossom(0xffc0d8) && !FOL.isBlossom(0x4caf3a) && !FOL.isBlossom(0xf8d070));
});

console.log(passed + ' test(s) réussi(s)');
