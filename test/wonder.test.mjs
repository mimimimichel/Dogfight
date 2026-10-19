// Tests des Fleurs Merveille (une par monde, 8 graines chacune) : node test/wonder.test.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { WONDERS, SEEDS, WONDER_TIME, wonderOf, foundIn } from '../public/adventure/wonderdata.js';
import { PUPS } from '../public/adventure/pupdata.js';
import * as PW from '../public/adventure/powerdata.js';
import { setLevel } from '../public/adventure/current.js';
import { makeFx } from '../public/adventure/wonderfx.js';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'public/adventure');
const LV = {};
for (let n = 1; n <= 8; n++) LV[n] = await import(path.join(DIR, `level${n}.js`));
const LIFE_PLAN = {};
for (const [n, f] of Object.entries({ 1: 'level1life.js', 3: 'level3life.js', 5: 'level5life.js', 6: 'level6life.js', 7: 'level7life.js', 8: 'level8life.js' })) LIFE_PLAN[n] = (await import(path.join(DIR, f))).PLAN;

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — les Fleurs Merveille');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32
const G = 32, H_JUMPS = (12 * 12 + 10.5 * 10.5) / (2 * G);   // ≈ 3,97 m avec le double saut
const BLOCK = new Set(['tree', 'rock', 'trunk', 'wall', 'hedge', 'bldg', 'stump', 'container', 'crack', 'catpile', 'gate', 'obs', 'tank']);
const sup = (L, p) => L.supportAt(p.x, p.z, p.y + 0.8, 0, 0);
const base = (w) => ({ x: w.x, z: w.z, y: sup(LV[w.lv], w).y });

test('8 Fleurs Merveille : une par monde, 8 merveilles différentes, 30 secondes, 8 graines', () => {
  assert.strictEqual(WONDERS.length, 8);
  for (let n = 1; n <= 8; n++) assert.ok(wonderOf(n), `monde ${n}`);
  assert.strictEqual(new Set(WONDERS.map(w => w.kind)).size, 8, 'deux mondes avec la même merveille');
  assert.strictEqual(WONDER_TIME, 30);
  assert.strictEqual(SEEDS, 8);
  for (const w of WONDERS) {
    assert.ok(w.name.length > 8 && w.sub.length > 12 && w.where.length > 6, `textes du monde ${w.lv}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(w.hint), `couleur du monde ${w.lv}`);
  }
  assert.strictEqual(foundIn({ wonder: { found: true } }), true);
  assert.strictEqual(foundIn({}), false);
});

test('chaque fleur pousse sur le sol ou une plate-forme (pas dans le vide, ni dans l\'eau)', () => {
  for (const w of WONDERS) {
    const L = LV[w.lv], s = sup(L, w);
    assert.ok(Math.abs(s.y - w.y) < 0.8, `monde ${w.lv} : sol à ${s.y.toFixed(2)} au lieu de ${w.y}`);
    if (L.KILL_Y !== undefined) assert.ok(s.y > L.KILL_Y + 2, `monde ${w.lv} : dans le vide`);
    if (L.WATER_Y !== undefined && !s.collider && !L.NO_WATER) assert.ok(s.y > L.WATER_Y + 0.05, `monde ${w.lv} : sous l'eau`);
    if (L.inWater && L.ID !== 3) assert.ok(!L.inWater(w.x, w.z) || s.collider, `monde ${w.lv} : dans l'eau`);
    for (let a = 0; a < 6.28; a += 1.05) {
      const q = { x: w.x + Math.cos(a) * 0.5, z: w.z + Math.sin(a) * 0.5, y: s.y };
      assert.ok(Math.abs(sup(L, q).y - s.y) < 0.45, `monde ${w.lv} : sol trop en pente sous la fleur`);
    }
  }
});

test('jamais dans un mur, un rocher, un arbre ou une haie', () => {
  for (const w of WONDERS) {
    const L = LV[w.lv], s = sup(L, w);
    const hit = L.colliders.filter(c => !c.off && !c.moving && (c.solid || BLOCK.has(c.kind)) && L.inside(c, w.x, w.z, 0.6) && c.y0 < s.y + 1.4 && c.y1 > s.y + 0.08);
    assert.strictEqual(hit.length, 0, `monde ${w.lv} : dans ${hit.map(c => c.kind).join(', ')}`);
  }
});

test('pas sur une médaille ni sur un autre trésor (os, balles, caisses, chiots perdus…)', () => {
  for (const w of WONDERS) {
    const L = LV[w.lv], b = base(w);
    for (const m of L.medals) assert.ok(Math.hypot(m.x - w.x, m.z - w.z) > 4 || Math.abs(m.y - b.y) > 3, `monde ${w.lv} : sur la médaille ${m.id}`);
    const items = [...L.bones, ...L.balls, ...(L.crates || []), ...PUPS.filter(p => p.lv === w.lv),
      ...['FEATHERS', 'lanterns', 'LANTERNS', 'BONNETS', 'SOUVENIRS', 'CHECKPOINTS', 'signs'].flatMap(k => (Array.isArray(L[k]) ? L[k] : []))].filter(p => p && typeof p.x === 'number');
    for (const it of items) assert.ok(Math.hypot(it.x - w.x, it.z - w.z) > 1.8 || (it.y !== undefined && Math.abs(it.y - b.y) > 2.5), `monde ${w.lv} : sur ${it.id || it.name || 'un trésor'}`);
    for (const p of L.PORTALS || []) assert.ok(Math.hypot(p.x - w.x, p.z - w.z) > 6, `monde ${w.lv} : sur un arrêt de train`);
    if (L.GARE) assert.ok(Math.hypot(L.GARE.x - w.x, L.GARE.z - w.z) > 10, `monde ${w.lv} : dans la Gare des Mondes`);
    // ni sur une boîte à costume (powerdata.js)
    for (const bx of (PW.BOXES && PW.BOXES[w.lv]) || []) assert.ok(Math.hypot(bx.x - w.x, bx.z - w.z) > 6, `monde ${w.lv} : sur la boîte ${bx.power}`);
  }
});

test('pas collée à un décor vivant (bonshomme de neige, parasol, coffre de la couche de vie…)', () => {
  for (const w of WONDERS) {
    const plan = LIFE_PLAN[w.lv];
    if (plan) for (const g of ['props', 'villagers', 'secrets', 'defis']) for (const e of plan[g]) assert.ok(Math.hypot(e.x - w.x, e.z - w.z) >= 2, `monde ${w.lv} : fleur collée à ${e.kind || e.id}`);
    for (const p of LV[w.lv].PARASOLS || []) assert.ok(Math.hypot(p.x - w.x, p.z - w.z) >= 3, `monde ${w.lv} : fleur sous un parasol`);
  }
});

test('chaque fleur est accessible : un trésor validé tout près, à une hauteur atteignable', () => {
  for (const w of WONDERS) {
    const L = LV[w.lv], b = base(w);
    const steps = Object.keys(L).filter(k => /steps$/i.test(k) && Array.isArray(L[k])).flatMap(k => L[k]).filter(q => q && typeof q.x === 'number' && typeof q.top === 'number').map(q => ({ x: q.x, z: q.z, y: q.top }));
    const spots = [...L.bones, ...L.balls, ...L.medals, ...(L.CHECKPOINTS || []), L.START, ...steps].filter(p => p && typeof p.x === 'number');
    const ok = spots.some(p => Math.hypot(p.x - w.x, p.z - w.z) < 22 && L.supportAt(p.x, p.z, (p.y === undefined ? 200 : p.y) + 0.2, 0, 0).y > b.y - H_JUMPS + 0.6);
    assert.ok(ok, `monde ${w.lv} : rien d'atteignable à moins de 22 m`);
  }
});

test('elles sont loin du départ : il faut explorer pour les trouver', () => {
  for (const w of WONDERS) {
    const L = LV[w.lv];
    const d = Math.hypot(w.x - L.START.x, w.z - L.START.z);
    assert.ok(d > 25, `monde ${w.lv} : à ${d.toFixed(0)} m du départ seulement`);
  }
});

test('8 graines par merveille, toutes à des places sûres et atteignables', () => {
  for (const w of WONDERS) {
    const L = setLevel(w.lv), b = base(w);
    const fx = makeFx(w.kind, { g: { scene: null }, def: w, lite: false, c: b });
    const s = fx.seedSpots();
    assert.strictEqual(s.length, SEEDS, `monde ${w.lv}`);
    for (const p of s) {
      assert.ok([p.x, p.y, p.z].every(Number.isFinite), `monde ${w.lv} : graine mal placée`);
      assert.ok(Math.hypot(p.x - b.x, p.z - b.z) < 70, `monde ${w.lv} : graine trop loin`);
      const gy = L.supportAt(p.x, p.z, p.y + 0.2, 0, 0).y;
      if (L.KILL_Y !== undefined && w.kind !== 'rainbows') assert.ok(gy > L.KILL_Y + 2, `monde ${w.lv} : graine au-dessus du vide`);
      const up = p.y - gy;
      // sur un toboggan arc-en-ciel : juste au-dessus de la piste (on la ramasse en glissant)
      if (w.kind === 'rainbows' && up > 1.6) {
        const near = fx.layout().some(sl => { for (let u = 0; u <= 1; u += 0.01) { const q = sl.curve.getPointAt(u); if (Math.hypot(q.x - p.x, q.z - p.z) < 0.6 && p.y - q.y > 0.4 && p.y - q.y < 1.4) return true; } return false; });
        assert.ok(near, `monde ${w.lv} : graine en l'air loin des toboggans`);
        continue;
      }
      // au sol : à portée de museau ; en l'air : la merveille aide (rebond des champignons, bulles)
      const lim = { mushrooms: 13, bubbles: 9 }[w.kind] || 1.6;
      assert.ok(up > 0.3 && up < lim, `monde ${w.lv} : graine à ${up.toFixed(1)} m du sol`);
    }
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z, s[i].y - s[j].y) > 1.2, `monde ${w.lv} : deux graines l'une sur l'autre`);
  }
});

test('la musique de la merveille existe pour chaque monde (audio.js), et le chœur suit les accords', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/audio.js'), 'utf8');
  assert.ok(/wonder: \{ bpm:/.test(src), 'ambiance « wonder »');
  assert.ok(/STYLES\['wonder' \+ n\]/.test(src), 'variantes wonder1…wonder8');
  for (let n = 1; n <= 8; n++) assert.ok(new RegExp(`\\n\\s+${n}: \\{ bpm:`).test(src.slice(src.indexOf('WONDER_TWEAKS'))), `wonder${n}`);
  assert.ok(/sfx\.onBar\(t, ch, barLen, this\)/.test(src), 'crochet onBar');
});

test('le jeu branche la fleur : instantané du monde partagé, sauvegarde, pause, album, précache', () => {
  const game = fs.readFileSync(path.join(DIR, 'game.js'), 'utf8');
  for (const s of ['new Wonder(this)', 'base.wo = this.wonder.snapshot()', 'this.wonder.apply(s.wo)', 'this.wonder.guestStep(dt)', 'this.wonder.pauseLine()', 'this.wonder.support(x, z, y, s)', 'this.wonder.playerStep(P, dt)', '(P.gravK || 1)'])
    assert.ok(game.includes(s), `game.js : ${s}`);
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  for (const f of ['wonder.js', 'wonderfx.js', 'wonderdata.js']) assert.ok(sw.includes('adventure/' + f), `sw.js : ${f}`);
  const main = fs.readFileSync(path.join(ROOT, 'public/main.js'), 'utf8');
  assert.ok(main.includes('dogfight.aventure.merveilles') && main.includes('album-wonders'), 'album : compteur des Fleurs Merveille');
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pk.scripts.test.includes('test/wonder.test.mjs'), 'npm test');
});

test('sauvegarde : la fusion de deux copies du monde garde la fleur trouvée et le meilleur nombre de graines', () => {
  // même règle que mergeSave (game.js) : objets fusionnés, booléens « ou », nombres « max »
  const src = fs.readFileSync(path.join(DIR, 'game.js'), 'utf8');
  const fn = src.slice(src.indexOf('function mergeSave(a, b) {'), src.indexOf('\n}\n', src.indexOf('function mergeSave(a, b) {')) + 2);
  const mergeSave = new Function(fn + '\nreturn mergeSave;')();
  const a = { wonder: { found: false, seeds: 5, plays: 2 } }, b = { wonder: { found: true, seeds: 8, plays: 1 } };
  mergeSave(a, b);
  assert.deepStrictEqual(a.wonder, { found: true, seeds: 8, plays: 2 });
  const c = {}; mergeSave(c, { wonder: { found: true, seeds: 8, plays: 1 } });
  assert.strictEqual(c.wonder.found, true);
});

console.log(`${passed} tests OK`);
