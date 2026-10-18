// Tests des chiots perdus (3 par monde, 24 en tout) : node test/puppies.test.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PUPS, pupsOf } from '../public/adventure/pupdata.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/adventure');
const LV = {};
for (let n = 1; n <= 8; n++) LV[n] = await import(path.join(DIR, `level${n}.js`));

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — les chiots perdus');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32
const G = 32, H_JUMPS = (12 * 12 + 10.5 * 10.5) / (2 * G);   // ≈ 3,97 m avec le double saut
const BLOCK = new Set(['tree', 'rock', 'trunk', 'wall', 'hedge', 'bldg', 'stump', 'container', 'crack', 'catpile', 'gate', 'obs', 'tank']);
const sup = (L, p) => L.supportAt(p.x, p.z, p.y + 0.8, 0, 0);

test('24 chiots : 3 par monde, identifiants et prénoms uniques', () => {
  assert.strictEqual(PUPS.length, 24);
  for (let n = 1; n <= 8; n++) assert.strictEqual(pupsOf(n).length, 3, `monde ${n}`);
  assert.strictEqual(new Set(PUPS.map(p => p.id)).size, 24, 'identifiants en double');
  assert.strictEqual(new Set(PUPS.map(p => p.name)).size, 24, 'prénoms en double');
  assert.strictEqual(new Set(PUPS.map(p => p.breed)).size, 24, 'deux chiots de la même race');
  for (const p of PUPS) assert.ok(/^l[1-8]_[a-z]+$/.test(p.id) && p.id[1] === String(p.lv), p.id);
});

test('des prénoms tout neufs (personne d\'autre ne parle sous ce nom dans le jeu)', () => {
  const src = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && f !== 'pupdata.js').map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
  for (const p of PUPS) {
    const q = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(!new RegExp(`(who|name)\\s*:\\s*['"]${q}\\b`).test(src), `${p.name} est déjà un personnage`);
  }
});

test('chaque chiot a sa réplique de sauvetage et sa petite phrase au parc (objets who/text)', () => {
  for (const p of PUPS) {
    for (const l of [p.found, p.hub]) {
      assert.ok(l && l.who === p.name && typeof l.text === 'string' && l.text.length > 10 && l.text.length < 110, p.id);
    }
    assert.ok(p.where && p.where.length > 6, p.id + ' : pas d\'indice');
  }
});

test('chaque cachette est sur le sol ou une plate-forme (pas dans le vide, pas dans l\'eau)', () => {
  for (const p of PUPS) {
    const L = LV[p.lv], s = sup(L, p);
    assert.ok(Math.abs(s.y - p.y) < 0.4, `${p.id} : sol à ${s.y.toFixed(2)} au lieu de ${p.y}`);
    if (L.KILL_Y !== undefined) assert.ok(s.y > L.KILL_Y + 2, p.id + ' dans le vide');
    if (L.WATER_Y !== undefined && !s.collider) assert.ok(s.y > L.WATER_Y + 0.05, p.id + ' sous l\'eau');
    if (L.inWater && L.ID !== 3) assert.ok(!L.inWater(p.x, p.z) || s.collider, p.id + ' dans l\'eau');
    // sol à peu près plat sous le chiot (sinon il flotte ou s'enfonce)
    for (let a = 0; a < 6.28; a += 1.05) {
      const q = { x: p.x + Math.cos(a) * 0.35, z: p.z + Math.sin(a) * 0.35, y: s.y };
      assert.ok(Math.abs(sup(L, q).y - s.y) < 0.45, `${p.id} : sol trop en pente ou bord de plate-forme`);
    }
  }
});

test('jamais dans un mur, un rocher, un arbre ou une haie (et la place de tenir debout)', () => {
  for (const p of PUPS) {
    const L = LV[p.lv], s = sup(L, p);
    const hit = L.colliders.filter(c => !c.off && !c.moving && (c.solid || BLOCK.has(c.kind)) && L.inside(c, p.x, p.z, 0.35) && c.y0 < s.y + 1.0 && c.y1 > s.y + 0.08);
    assert.strictEqual(hit.length, 0, `${p.id} dans ${hit.map(c => c.kind).join(', ')}`);
  }
});

test('chaque cachette est accessible : un trésor validé tout près, à une hauteur atteignable', () => {
  for (const p of PUPS) {
    const L = LV[p.lv], s = sup(L, p);
    // les escaliers des niveaux (listes …Steps / …_STEPS : des marches faites pour grimper)
    const steps = Object.keys(L).filter(k => /steps$/i.test(k) && Array.isArray(L[k])).flatMap(k => L[k]).filter(q => q && typeof q.x === 'number' && typeof q.top === 'number').map(q => ({ x: q.x, z: q.z, y: q.top }));
    const items = ['FEATHERS', 'lanterns', 'LANTERNS', 'BONNETS', 'SOUVENIRS'].flatMap(k => (Array.isArray(L[k]) ? L[k] : []));   // autres trésors à ramasser
    const spots = [...L.bones, ...L.balls, ...L.medals, ...items, ...(L.CHECKPOINTS || []), L.START, ...steps].filter(b => b && typeof b.x === 'number');
    const ok = spots.some(b => {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      const by = L.supportAt(b.x, b.z, (b.y === undefined ? 200 : b.y) + 0.2, 0, 0).y;
      return d < 22 && by > s.y - H_JUMPS + 0.6;
    });
    assert.ok(ok, `${p.id} : aucun trésor atteignable à moins de 22 m à cette hauteur`);
  }
});

test('les chiots ne se cachent pas sur une médaille ni les uns sur les autres', () => {
  for (const p of PUPS) {
    const L = LV[p.lv];
    for (const m of L.medals) assert.ok(Math.hypot(m.x - p.x, m.z - p.z) > 1.2 || Math.abs(m.y - p.y) > 2.5, `${p.id} sur la médaille ${m.id}`);
    for (const q of pupsOf(p.lv)) if (q !== p) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) > 30, `${p.id} trop près de ${q.id}`);
  }
});

test('ils sont loin du départ : il faut explorer pour les trouver', () => {
  for (const p of PUPS) {
    const L = LV[p.lv];
    const d = Math.hypot(p.x - L.START.x, p.z - L.START.z, (p.y - L.START.y) * 3);
    assert.ok(d > 20, `${p.id} à ${d.toFixed(0)} m du départ seulement`);
  }
});

console.log(`${passed} tests OK`);
