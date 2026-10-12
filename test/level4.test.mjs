// Tests des données du niveau 4 (les Îles du Ciel) : node test/level4.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level4.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 4');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
/** Distance horizontale max d'un saut (simple ou double) qui retombe dy plus haut (dy < 0 : plus bas). */
function reach(dy, double) {
  // temps de vol : montée puis chute jusqu'à dy (au double saut, relancé au sommet du premier)
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
const top = (c) => c.y1;
/** Saut d'un disque à l'autre : écart bord à bord, et différence de hauteur. */
function hop(a, b) { return { gap: Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy: b.top - a.top }; }
const disc = (p) => ({ x: p.x, z: p.z, r: p.r, top: p.top });
const isl = (id) => { const I = L.ISLANDS.find(q => q.id === id); return { x: I.x, z: I.z, r: I.r, top: I.top }; };

test('six îles, des pierres, des plates-formes mobiles, 4 nuages fragiles, 2 colonnes de vent', () => {
  assert.strictEqual(L.ISLANDS.length, 7);
  assert.ok(L.pads.length >= 15);
  assert.ok(L.movers.length >= 6);
  assert.strictEqual(L.crumbles.length, 4);
  assert.strictEqual(L.UPDRAFTS.length, 2);
  assert.strictEqual(L.CHECKPOINTS.length, 6);
});

test('le vide sous les îles : on tombe hors des îles', () => {
  assert.ok(L.heightAt(0, 81) < L.KILL_Y && L.supportAt(0, 81, 12, 0).y < L.KILL_Y);
  assert.ok(L.heightAt(0, 104) > 9);
  assert.ok(L.supportAt(0, 78, 11, 0).y > 10);       // première pierre
});

test('les Pas Nuageux se franchissent d\'un simple saut', () => {
  const path = [isl('start'), ...L.pads.slice(0, 4).map(disc), isl('balloon')];
  for (let i = 0; i + 1 < path.length; i++) {
    const { gap, dy } = hop(path[i], path[i + 1]);
    assert.ok(gap < reach(dy, false) * 0.6, `pierre ${i} → ${i + 1} : écart ${gap.toFixed(1)} m, ${dy.toFixed(1)} m plus haut`);
  }
});

test('le courant d\'air : glissière → ascenseur (en bas) → îlot → moulin (double saut)', () => {
  const slide = L.movers[0], lift = L.movers[1];
  const s = { x: slide.x0, z: slide.z0, r: slide.r, top: slide.y0 };
  const l = { x: lift.x0, z: lift.z0, r: lift.r, top: lift.y0 };
  const b = isl('balloon');
  assert.ok(hop(b, s).gap < 2, 'île des Ballons → glissière');
  assert.ok(hop(s, l).gap < reach(hop(s, l).dy, false) * 0.85, 'glissière → ascenseur');
  const lHigh = Object.assign({}, l, { top: lift.y0 + lift.ay });
  assert.ok(hop(lHigh, isl('hop')).gap < reach(hop(lHigh, isl('hop')).dy, false) * 0.7, 'ascenseur (en haut) → îlot');
  const h = hop(isl('hop'), isl('mill'));
  assert.ok(h.gap < reach(h.dy, true) * 0.75, `îlot → moulin : ${h.gap.toFixed(1)} m`);
});

test('le Pont des Copains relie le Moulin à l\'Écho, sorti par les dalles', () => {
  const B = L.BRIDGE, m = isl('mill'), e = isl('echo');
  assert.ok(Math.abs(B.z0 - (m.z - m.r)) < 0.5 && Math.abs(B.z1 - (e.z + e.r)) < 0.5);
  assert.ok(L.bridgeCol.off, 'rentré au départ');
  assert.ok(Math.abs(B.top - m.top) < 0.6 && Math.abs(B.top - e.top) < 0.6, 'on y monte sans sauter');
  for (const p of L.PLATES) assert.ok(Math.hypot(p.x - m.x, p.z - m.z) < m.r - 1.5, 'dalle sur l\'île du Moulin');
  assert.ok(m.r * 2 < 30 && (B.z0 - B.z1) / RUN < L.BRIDGE_SOLO_TIME - 2, 'seul : le temps de traverser en courant');
});

test('les nuages fragiles font un autre chemin jusqu\'à l\'Écho', () => {
  const path = [isl('mill'), ...L.crumbles.map(c => ({ x: c.x, z: c.z, r: c.r, top: c.top })), isl('echo')];
  for (let i = 0; i + 1 < path.length; i++) {
    const { gap, dy } = hop(path[i], path[i + 1]);
    assert.ok(gap < reach(dy, false) * 0.8, `nuage ${i} → ${i + 1} : ${gap.toFixed(1)} m`);
  }
});

test('le manège et la spirale mènent au Trophée', () => {
  const e = isl('echo'), C = L.CAROUSEL;
  const nearest = { x: C.cx, z: C.cz + C.R, r: 2.1, top: C.y0 };
  assert.ok(hop(e, nearest).gap < reach(hop(e, nearest).dy, false) * 0.75, 'Écho → manège');
  const exit = disc(L.pads.find(p => Math.abs(p.z + 65.5) < 0.1));
  const far = { x: C.cx, z: C.cz - C.R, r: 2.1, top: C.y0 };
  assert.ok(hop(far, exit).gap < 1.5, 'manège → sortie');
  const sp = L.spiral.map(disc);
  assert.ok(hop(exit, sp[0]).gap < reach(hop(exit, sp[0]).dy, false) * 0.75, 'sortie → spirale');
  for (let i = 0; i + 1 < sp.length; i++) {
    const { gap, dy } = hop(sp[i], sp[i + 1]);
    assert.ok(dy < H1 * 0.85 && gap < reach(dy, false) * 0.7, `spirale ${i} → ${i + 1} : ${gap.toFixed(1)} m, +${dy.toFixed(1)} m`);
  }
  const last = sp[sp.length - 1], g = isl('goal');
  assert.ok(last.z < L.TOWER.z, 'la spirale finit côté Trophée');
  assert.ok(hop(last, g).gap < reach(hop(last, g).dy, false) * 0.8, `spirale → Trophée : ${hop(last, g).gap.toFixed(1)} m`);
});

test('les 5 étoiles sont atteignables (ressort, vent, nuages, pilier, tour)', () => {
  const [s1, s2, s3, s4, s5] = L.medals;
  const nest = isl('nest');
  assert.ok(Math.hypot(s1.x - nest.x, s1.z - nest.z) < 0.1 && s1.y - nest.top < 2);
  const spring = L.springs[0], apex = spring.top + spring.bounce ** 2 / (2 * G);
  assert.ok(apex + H2 - H1 > nest.top, 'le ressort envoie plus haut que l\'îlot');
  assert.ok(s2.y <= L.UPDRAFTS[0].y1 && s2.y > L.UPDRAFTS[0].y0, 'étoile dans la colonne de vent');
  const c2 = L.crumbles[1];
  assert.ok(Math.hypot(s3.x - c2.x, s3.z - c2.z) < 5 && s3.y - c2.top < H2, 'étoile au-dessus des nuages');
  const sp2 = L.springs.find(s => Math.abs(s.z + 41.5) < 0.1);
  assert.ok(sp2.top + sp2.bounce ** 2 / (2 * G) > L.PILLAR.top, 'le champignon de l\'Écho envoie plus haut que le pilier');
  assert.ok(s5.y - L.TOWER.top < 2 && L.spiral[L.spiral.length - 1].top + H1 > L.TOWER.top, 'sommet de la tour');
  assert.ok(Math.hypot(s4.x - L.PILLAR.x, s4.z - L.PILLAR.z) < 0.1);
});

test('100 pièces du ciel, aucune dans un obstacle', () => {
  assert.strictEqual(L.bones.length, 100);
  for (const b of L.bones) {
    for (const c of L.colliders) if (!c.off && !c.moving && c.kind !== 'tree' && L.inside(c, b.x, b.z, 0) && b.y > c.y0 && b.y < c.y1 - 0.2) assert.fail(`pièce ${b.id} dans un obstacle`);
  }
});

test('les drapeaux sont posés sur un sol', () => {
  for (const c of L.CHECKPOINTS) assert.ok(L.supportAt(c.x, c.z, c.y + 0.5, 0).y > L.KILL_Y + 5, c.name);
});

test('les plates-formes mobiles bougent et donnent leur déplacement', () => {
  L.updateMovers(0); L.updateMovers(1);
  const m = L.movers[0].col;
  assert.ok(Math.abs(m.dx) > 0.01, 'la glissière glisse');
  L.updateMovers(0);
});

console.log(passed + ' tests réussis');
