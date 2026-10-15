// Tests des données du niveau 4 (les Îles du Ciel) : node test/level4.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level4.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 4');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s, pas de 0,6 m
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5, STEP_UP = 0.6;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
/** Distance horizontale max d'un saut (simple ou double) qui retombe dy plus haut (dy < 0 : plus bas). */
function reach(dy, double) {
  // temps de vol : montée puis chute jusqu'à dy (au double saut, relancé au sommet du premier)
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
/** Pareil, en partant d'un rebond (ressort, trampoline) à la vitesse v vers le haut, double saut compris. */
function reachBounce(v, dy, double) {
  const up = v / G, h = v * v / (2 * G) + (double ? V2 * V2 / (2 * G) : 0), t2 = double ? V2 / G : 0;
  if (dy > h) return 0;
  return RUN * (up + t2 + Math.sqrt(2 * (h - dy) / G));
}
/** Saut d'un disque à l'autre : écart bord à bord, et différence de hauteur. */
function hop(a, b) { return { gap: Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy: b.top - a.top }; }
const disc = (p) => ({ x: p.x, z: p.z, r: p.r, top: p.top });
const isl = (id) => { const I = L.ISLANDS.find(q => q.id === id); assert.ok(I, 'île ' + id); return { x: I.x, z: I.z, r: I.r, top: I.top + 0.02 }; };
const sprDisc = (s) => ({ x: s.x, z: s.z, r: s.r, top: s.top });

test('vingt-deux îles, des pierres, des plates-formes mobiles, 4 nuages fragiles, 3 colonnes de vent, 15 drapeaux', () => {
  assert.strictEqual(L.ISLANDS.length, 22);
  assert.ok(L.pads.length >= 28);
  assert.ok(L.movers.length >= 12);
  assert.strictEqual(L.crumbles.length, 4);
  assert.strictEqual(L.UPDRAFTS.length, 3);
  assert.strictEqual(L.CHECKPOINTS.length, 15);
  L.CHECKPOINTS.forEach((c, i) => { assert.strictEqual(c.id, i); assert.ok(c.back < i || i === 0, `drapeau ${i} : celui d'avant`); });
  assert.strictEqual(L.BELLS.length, 3);
  assert.strictEqual(L.FEATHERS.length, 6);
  assert.strictEqual(L.medals.length, 6, '5 étoiles + le Trophée (les badges du menu en dépendent)');
});

test('tout tient sur la carte du monde', () => {
  for (const I of L.ISLANDS) assert.ok(Math.abs(I.x) + I.r < L.WORLD / 2 && Math.abs(I.z) + I.r < L.WORLD / 2, I.id);
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

test('le nuage-bac va du Moulin au Jardin Suspendu (une plume sur le nuage du jardin)', () => {
  const F = L.FERRY, m = isl('mill'), g = isl('garden');
  const east = { x: F.x0 + F.ax, z: F.z0, r: F.r, top: F.y0 }, west = { x: F.x0 - F.ax, z: F.z0, r: F.r, top: F.y0 };
  assert.ok(hop(m, east).gap < reach(hop(m, east).dy, false) * 0.5, 'Moulin → bac');
  assert.ok(hop(west, g).gap < reach(hop(west, g).dy, false) * 0.5, 'bac → jardin');
  const sp = L.springs.find(s => Math.hypot(s.x - g.x, s.z - g.z) < g.r), C = L.GARDEN_CLOUD;
  assert.ok(C.top - g.top > H2, 'le nuage du jardin ne s\'atteint pas sans le champignon');
  assert.ok(hop(sprDisc(sp), disc(C)).gap < reachBounce(sp.bounce, C.top - sp.top, true) * 0.6, 'champignon → nuage');
  assert.ok(L.FEATHERS.some(f => Math.hypot(f.x - C.x, f.z - C.z) < 0.5));
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

test('le manège et la spirale mènent à l\'Île du Carillon', () => {
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
  const last = sp[sp.length - 1], h = isl('hub');
  assert.ok(last.z < L.TOWER.z, 'la spirale finit côté Carillon');
  assert.ok(hop(last, h).gap < reach(hop(last, h).dy, false) * 0.8, `spirale → Carillon : ${hop(last, h).gap.toFixed(1)} m`);
  const U = L.UPDRAFTS[1];
  assert.ok(U.y1 > h.top + 1 && Math.hypot(U.x - h.x, U.z - h.z) - h.r < 4, 'la colonne de vent monte au bord du Carillon');
});

test('ouest : de l\'essai aux nuages-trampolines, jusqu\'à la Cloche Rose', () => {
  const T = L.TRAMPS, hub = isl('hub'), f = isl('fluff'), r = isl('rose');
  const stone = disc(L.pads.find(p => Math.abs(p.x + 17.3) < 0.1 && Math.abs(p.z + 102) < 0.1));
  assert.ok(hop(hub, stone).gap < reach(hop(hub, stone).dy, false) * 0.75 && hop(stone, f).gap < reach(hop(stone, f).dy, false) * 0.75, 'Carillon → pierre → Île Moelleuse');
  assert.ok(Math.hypot(T[0].x - f.x, T[0].z - f.z) + T[0].r < f.r - 1, 'le trampoline d\'essai est au milieu de l\'île (on retombe sur l\'herbe)');
  assert.ok(T.every(t => t.col.tramp && t.look === 'tramp'));
  assert.ok(hop(f, sprDisc(T[1])).gap < reach(hop(f, sprDisc(T[1])).dy, false) * 0.6, 'île → premier trampoline');
  for (let i = 1; i < 3; i++) {
    const a = sprDisc(T[i]), b = sprDisc(T[i + 1]);
    assert.ok(hop(a, b).gap < reachBounce(T[i].bounce, b.top - a.top, false) * 0.6, `trampoline ${i} → ${i + 1}`);
  }
  assert.ok(hop(sprDisc(T[3]), r).gap < reachBounce(T[3].bounce, r.top - T[3].top, false) * 0.6, 'dernier trampoline → Cloche Rose');
  const B = L.BELLS.find(b => b.id === 'rose');
  assert.ok(Math.hypot(B.x - r.x, B.z - r.z) < r.r - 1.5, 'la cloche est sur l\'île');
});

test('étoile 3 : le Grand Trampoline mène au nuage perché (et rien d\'autre)', () => {
  const T = L.TRAMPS[4], P = disc(L.PERCH), r = isl('rose'), s3 = L.medals.find(m => m.id === 'm_s3');
  assert.ok(Math.hypot(T.x - r.x, T.z - r.z) < r.r - 1);
  assert.ok(P.top - r.top > H2 + 0.5, 'trop haut pour un double saut depuis l\'île');
  assert.ok(hop(sprDisc(T), P).gap < reachBounce(T.bounce, P.top - T.top, true) * 0.6, 'Grand Trampoline → nuage perché');
  assert.ok(Math.hypot(s3.x - P.x, s3.z - P.z) < 0.1 && s3.y - P.top < 2);
});

test('est : le Col des Rafales (rochers-abris, rafales prévenues)', () => {
  const hub = isl('hub'), b = isl('breeze'), col = isl('col'), blue = isl('blue');
  const stone = disc(L.pads.find(p => Math.abs(p.x - 17.3) < 0.1 && Math.abs(p.z + 102) < 0.1));
  const path = [hub, stone, b, ...L.GUST_PADS.slice(0, 4).map(disc), col, ...L.GUST_PADS.slice(4).map(disc), blue];
  for (let i = 0; i + 1 < path.length; i++) {
    const { gap, dy } = hop(path[i], path[i + 1]);
    assert.ok(gap < reach(dy, false) * 0.7, `pas ${i} → ${i + 1} : ${gap.toFixed(1)} m`);
  }
  // chaque pierre du col a son rocher, côté vent, avec un abri derrière
  for (const p of L.GUST_PADS) {
    const g = L.gustAt(p.x, p.top + 0.5, p.z);
    assert.ok(g, 'pierre dans une rafale');
    assert.ok(L.sheltered(g, p.x, p.z + g.dz * 1.3), 'abri derrière le rocher');
    assert.ok(!L.sheltered(g, p.x + 1.5, p.z + g.dz * 0.3) && !L.sheltered(g, p.x, p.z - g.dz * 1.9), 'à découvert ailleurs');
    assert.ok(L.supportAt(p.x, p.z + g.dz * 1.3, p.top + 0.5, 0).y === p.top, 'l\'abri est sur la pierre');
  }
  // la rafale : un long calme, une alerte, un souffle court
  assert.ok(L.GUST_WARN >= 3 && L.GUST_ON - L.GUST_WARN >= 1 && L.GUST_CYCLE - L.GUST_ON <= 2);
  const states = new Set(); for (let t = 0; t < L.GUST_CYCLE; t += 0.1) states.add(L.gustState(L.GUSTS[1], t));
  assert.deepStrictEqual([...states].sort(), [0, 1, 2]);
  assert.ok(L.HEDGE.length >= 6, 'une haie sur l\'Île Venteuse');
  const B = L.BELLS.find(q => q.id === 'bleue');
  assert.ok(Math.hypot(B.x - blue.x, B.z - blue.z) < blue.r - 1.5);
  assert.ok(!L.GUSTS.some(g => B.x > g.x0 && B.x < g.x1 && B.z > g.z0 && B.z < g.z1), 'calme autour de la cloche');
});

test('étoile 4 : l\'Îlot du Souffle (on y plane depuis le Col, la colonne de vent ramène)', () => {
  const col = isl('col'), sf = isl('souffle'), s4 = L.medals.find(m => m.id === 'm_s4'), U = L.UPDRAFTS[2];
  const h = hop(col, sf);
  assert.ok(h.dy < -3 && h.gap < 16, 'plus bas et pas trop loin');
  assert.ok(Math.hypot(s4.x - sf.x, s4.z - sf.z) < 0.1);
  assert.ok(Math.hypot(U.x - sf.x, U.z - sf.z) - sf.r < 4.5 && U.y0 < sf.top && U.y1 > col.top + 2, 'colonne au bord de l\'îlot, plus haute que le Col');
  assert.ok(Math.hypot(U.x - col.x, U.z - col.z) - col.r < 10.5, 'du haut de la colonne, on plane jusqu\'au Col');
});

test('nord-ouest : Tourniquet, Grande Roue, Canon → Cloche d\'Or', () => {
  const hub = isl('hub'), roue = isl('roue'), canon = isl('canon'), gold = isl('gold');
  const A = disc(L.pads.find(p => Math.abs(p.x + 12.5) < 0.1));
  assert.ok(hop(hub, A).gap < reach(hop(hub, A).dy, false) * 0.6, 'Carillon → pierre');
  const T = L.TURNSTILE;
  const dA = Math.hypot(A.x - T.x, A.z - T.z), dR = Math.hypot(roue.x - T.x, roue.z - T.z);
  assert.ok(dA - T.hl - A.r < 2.2 && dR - T.hl - roue.r < 1.2, 'la planche touche presque la pierre et l\'île');
  const aA = Math.atan2(A.z - T.z, A.x - T.x), aR = Math.atan2(roue.z - T.z, roue.x - T.x);
  assert.ok(Math.abs(Math.cos(aA - aR)) > 0.99, 'la pierre et l\'île sont de part et d\'autre du pivot : un tour, deux passages');
  // la planche tourne vraiment, et on peut se tenir dessus
  L.updateMovers(0); const a0 = L.turnCol.a; L.updateMovers(1); assert.ok(Math.abs(L.turnCol.a - a0 - T.w) < 1e-9);
  const tip = { x: T.x + Math.cos(L.turnCol.a) * (T.hl - 0.5), z: T.z + Math.sin(L.turnCol.a) * (T.hl - 0.5) };
  assert.strictEqual(L.supportAt(tip.x, tip.z, T.top + 0.3, 1).collider, L.turnCol);
  L.updateMovers(0);
  // la Grande Roue : une nacelle passe au ras de l'île (on monte à pied), puis à hauteur de l'Île du Canon
  const W = L.WHEEL, gondolas = L.movers.filter(m => m.gondola);
  assert.strictEqual(gondolas.length, W.n);
  let board = false, leave = false;
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    const z = W.cz + Math.cos(a) * W.R, y = W.cy + Math.sin(a) * W.R;
    if (Math.abs(y - roue.top) < STEP_UP - 0.1 && (roue.z - roue.r) - (z + 1.8) < 0.1 && Math.sin(a) < 0.2) board = true;
    if (Math.abs(y - canon.top) < 0.6 && (z - 1.8) - (canon.z + canon.r) < reach(canon.top - y, false) * 0.5) leave = true;
  }
  assert.ok(board, 'monter à pied dans une nacelle');
  assert.ok(leave, 'sauter de la nacelle sur l\'Île du Canon');
  assert.ok(W.cy + W.R > canon.top, 'la roue monte plus haut que l\'Île du Canon');
  // le canon : il vise l'île de la Cloche d'Or, celui du retour vise le Carillon
  const [C1, C2] = L.CANNONS;
  assert.ok(Math.hypot(C1.x - canon.x, C1.z - canon.z) < canon.r - 1.3 && Math.hypot(C1.to.x - gold.x, C1.to.z - gold.z) < gold.r - 1.5);
  assert.ok(Math.hypot(C2.x - gold.x, C2.z - gold.z) < gold.r - 1.3 && Math.hypot(C2.to.x - hub.x, C2.to.z - hub.z) < hub.r - 2);
  for (const C of L.CANNONS) {
    const p = L.cannonAt(C, 0.5);
    assert.ok(p.y > Math.max(C.y, C.to.y) + 5, 'une belle parabole');
    assert.ok(Math.abs(L.cannonAt(C, 1).y - C.to.y) < 1e-9);
    assert.ok(Math.hypot(C.x - C2.to.x, C.z - C2.to.z) > 3 || C === C2);
  }
  assert.ok(Math.hypot(C1.to.x - C2.x, C1.to.z - C2.z) > C2.r + 3, 'on n\'atterrit pas sur le canon du retour');
  const B = L.BELLS.find(q => q.id === 'or');
  assert.ok(Math.hypot(B.x - gold.x, B.z - gold.z) < gold.r - 1.5);
});

test('étoile 5 : le moyeu doré, au cœur de la Grande Roue', () => {
  const W = L.WHEEL, D = L.HUB_DRUM, s5 = L.medals.find(m => m.id === 'm_s5'), roue = isl('roue');
  assert.ok(Math.hypot(s5.x - D.x, s5.z - D.z) < 0.1 && s5.y - D.top < 2);
  assert.ok(W.cy + W.R - 1 > D.top + 2, 'on y tombe d\'une nacelle, tout en haut');
  assert.ok(D.top - roue.top > H2, 'pas depuis l\'île');
  const back = { x: D.x, z: D.z, r: D.d / 2, top: D.top };
  assert.ok(hop(back, roue).gap < reach(hop(back, roue).dy, false), 'on en redescend en planant');
});

test('plumes arc-en-ciel : six coins secrets, chacun atteignable', () => {
  const cave = isl('cave'), start = isl('start'), ledge = isl('ledge'), gold = isl('gold');
  assert.ok(hop(start, cave).dy < -3 && hop(start, cave).gap < 8, 'on plane jusqu\'au Nid sous l\'île');
  const sp = L.springs.find(s => Math.hypot(s.x - cave.x, s.z - cave.z) < cave.r);
  assert.ok(hop(sprDisc(sp), start).gap < reachBounce(sp.bounce, start.top - sp.top, true) * 0.7, 'champignon → Départ');
  assert.ok(hop(gold, ledge).dy < -3 && hop(gold, ledge).gap < 10, 'on plane jusqu\'au Balcon d\'Or');
  const sp2 = L.springs.find(s => Math.hypot(s.x - ledge.x, s.z - ledge.z) < ledge.r);
  assert.ok(Math.hypot(sp2.x - ledge.x, sp2.z - ledge.z) + sp2.r < ledge.r, 'le champignon tient sur le balcon');
  assert.ok(hop(sprDisc(sp2), gold).gap < reachBounce(sp2.bounce, gold.top - sp2.top, true) * 0.75, 'champignon → Cloche d\'Or');
  for (const f of L.FEATHERS) {
    const g = L.supportAt(f.x, f.z, f.y, 0).y;
    assert.ok(f.y - g > 0.8 && f.y - g < 2.2 || f.id === 'f4', `plume ${f.id} juste au-dessus du sol`);
  }
  assert.ok(new Set(L.FEATHERS.map(f => f.id)).size === 6);
});

test('les chemins d\'arc-en-ciel : éteints au départ, on y marche sans sauter', () => {
  for (const R of L.RIBBONS) {
    assert.ok(R.cols.every(c => c.off), R.id + ' éteint');
    for (let i = 0; i + 1 < R.pts.length; i++) {
      const a = R.pts[i], b = R.pts[i + 1];
      assert.ok(Math.abs(b.y - a.y) < STEP_UP * 0.7 && Math.hypot(b.x - a.x, b.z - a.z) < R.w / 2, `${R.id} ${i}`);
    }
    const a = R.pts[0], b = R.pts[R.pts.length - 1];
    assert.ok(L.islandAt(a.x, a.z) && L.islandAt(b.x, b.z), R.id + ' relie deux îles');
  }
  const P = L.RAINBOW, a = P.pts[0], b = P.pts[P.pts.length - 1];
  assert.strictEqual(L.islandAt(a.x, a.z).id, 'hub');
  assert.strictEqual(L.islandAt(b.x, b.z).id, 'goal');
  assert.strictEqual(L.islandAt(L.RIBBONS[0].pts[0].x, L.RIBBONS[0].pts[0].z).id, 'rose');
  assert.strictEqual(L.islandAt(L.RIBBONS[1].pts[0].x, L.RIBBONS[1].pts[0].z).id, 'blue');
});

test('impossible d\'atteindre le Trophée avant d\'avoir sonné les trois cloches', () => {
  const goal = isl('goal');
  // les plus hauts endroits où l'on peut se tenir (îles, pierres, nacelles en haut de la roue, ressorts)
  const spots = [
    ...L.ISLANDS.filter(I => I.id !== 'goal').map(I => ({ x: I.x, z: I.z, r: I.r, top: I.top + 0.35, v: V1 })),
    ...L.pads.map(p => ({ x: p.x, z: p.z, r: p.r, top: p.top, v: V1 })),
    { x: L.WHEEL.cx, z: L.WHEEL.cz, r: 1.8, top: L.WHEEL.cy + L.WHEEL.R, v: V1 },
    ...L.springs.map(s => ({ x: s.x, z: s.z, r: s.r, top: s.top, v: s.bounce })),
    ...L.UPDRAFTS.map(u => ({ x: u.x, z: u.z, r: u.r, top: u.y1, v: V1 })),
    ...L.BALLOONS.map(b => ({ x: b.x, z: b.z, r: 1, top: b.y - 0.7, v: L.POP_BOUNCE })),
    ...L.SHEEP.flatMap(m => [-1, 1].map(k => ({ x: m.x0 + m.ax * k, z: m.z0 + m.az * k, r: m.r, top: m.y0, v: V1 }))),
  ];
  for (const s of spots) {
    const gap = Math.hypot(s.x - goal.x, s.z - goal.z) - s.r - goal.r;
    const can = s.v === V1 ? reach(goal.top + 0.35 - s.top, true) : reachBounce(s.v, goal.top + 0.35 - s.top, true);
    assert.ok(gap > can + 1, `depuis (${s.x.toFixed(0)}, ${s.z.toFixed(0)}) : ${gap.toFixed(1)} m, portée ${can.toFixed(1)} m`);
  }
  for (const C of L.CANNONS) assert.ok(L.islandAt(C.to.x, C.to.z).id !== 'goal');
  assert.ok(!L.trees.some(t => L.islandAt(t.x, t.z) && L.islandAt(t.x, t.z).id === 'goal'), 'l\'arène du combat reste dégagée');
});

test('la vie des îles : rien de vide plus de quelques mètres', () => {
  // nuages-moutons : chaque bout de leur trajet touche une île, à hauteur de pas
  for (const m of L.SHEEP) for (const k of [-1, 1]) {
    const x = m.x0 + m.ax * k, z = m.z0 + m.az * k, I = L.ISLANDS.find(q => Math.hypot(q.x - x, q.z - z) < q.r + m.r - 0.5);
    assert.ok(I, `${m.name} : bout ${k}`);
    assert.ok(Math.abs(m.y0 - I.top) < STEP_UP, `${m.name} : on monte sans sauter (${I.id})`);
  }
  // ballons : en l'air (pas dans un obstacle), au-dessus du sol ou du vide
  for (const b of L.BALLOONS) {
    assert.ok(b.y - L.heightAt(b.x, b.z) > 1.4, 'ballon ' + b.id);
    for (const c of L.colliders) if (!c.off && !c.moving && L.inside(c, b.x, b.z, 0.5) && b.y > c.y0 - 0.6 && b.y < c.y1 + 0.9) assert.fail(`ballon ${b.id} dans un obstacle (${c.kind})`);
  }
  assert.strictEqual(L.BALLOONS.filter(b => b.group === 'z').length, 6, 'les six ballons de Zéphyr');
  for (const r of L.RESIDENTS) assert.ok(L.islandAt(r.x, r.z) && L.heightAt(r.x, r.z) === r.y, r.id);
  assert.ok(L.FLOWERS.length >= 6 && L.FLOWERS.every(f => f.look === 'flower' && L.islandAt(f.x, f.z)));
  // densité : le long du parcours principal, toujours quelque chose à moins de 8 m (pièce, ballon, papillon, oiseau…)
  const things = [...L.bones, ...L.medals, { x: L.WHEEL.cx, z: L.WHEEL.cz }, ...L.BALLOONS, ...L.BUTTERFLIES, ...L.BIRDS, ...L.springs, ...L.RESIDENTS, ...L.crates, ...L.FEATHERS];
  const route = [[0, 96], [0, 50], [0, 20], [0, 2], [0, -34], [0, -55], [0, -79], [0, -102], [-30, -102], [-67, -102], [28.5, -102], [64, -102], [90, -102], [-22, -131.5], [-22, -157.3], [-78, -150], [0, -162]];
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1];
    if (Math.hypot(bx - ax, bz - az) > 45) continue;      // (les branches partent toutes du Carillon)
    for (let k = 0; k <= 1; k += 0.05) {
      const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      const d = Math.min(...things.map(o => Math.hypot(o.x - x, o.z - z)));
      assert.ok(d < 8, `rien autour de (${x.toFixed(0)}, ${z.toFixed(0)}) : ${d.toFixed(1)} m`);
    }
  }
});

test('100 pièces du ciel, aucune dans un obstacle, réparties sur tout le parcours', () => {
  assert.strictEqual(L.COIN_COUNT, 100);
  assert.strictEqual(L.bones.length, 100);
  for (const b of L.bones) {
    for (const c of L.colliders) if (!c.off && !c.moving && c.kind !== 'tree' && L.inside(c, b.x, b.z, 0) && b.y > c.y0 && b.y < c.y1 - 0.2) assert.fail(`pièce ${b.id} dans un obstacle`);
  }
  const first = L.bones.filter(b => b.z > -88).length, branches = L.bones.filter(b => b.z <= -88).length;
  assert.ok(first >= 40 && branches >= 40, `${first} dans la première moitié, ${branches} au Carillon et ses branches`);
  const zone = (b) => (b.z > -88 ? 'debut' : b.x < -35 && b.z > -125 ? 'ouest' : b.x > 15 ? 'est' : b.z < -112 && b.x < -8 ? 'nordouest' : 'centre');
  const n = {}; for (const b of L.bones) n[zone(b)] = (n[zone(b)] || 0) + 1;
  assert.ok(n.ouest >= 6 && n.est >= 10 && n.nordouest >= 8, JSON.stringify(n));
});

test('les drapeaux, les cloches, les canons et Nimbus sont posés sur un sol', () => {
  for (const c of L.CHECKPOINTS) assert.ok(L.supportAt(c.x, c.z, c.y + 0.5, 0).y > L.KILL_Y + 5, c.name);
  for (const c of L.CHECKPOINTS) { const fx = c.x + (c.fx === undefined ? 2.3 : c.fx), fz = c.z + (c.fz || 0); assert.ok(L.supportAt(fx, fz, c.y + 0.5, 0).y > c.y - 0.6, 'mât du drapeau ' + c.name); }
  for (const b of L.BELLS) assert.ok(L.heightAt(b.x, b.z) > 30, b.id);
  for (const C of L.CANNONS) assert.ok(L.heightAt(C.x, C.z) > 30 && L.heightAt(C.to.x, C.to.z) > 30, C.id);
  assert.ok(L.heightAt(L.NIMBUS.x, L.NIMBUS.z) > 30);
  assert.strictEqual(L.islandAt(L.NIMBUS.x, L.NIMBUS.z).id, 'hub');
});

test('les plates-formes mobiles bougent et donnent leur déplacement', () => {
  L.updateMovers(0); L.updateMovers(1);
  const m = L.movers[0].col;
  assert.ok(Math.abs(m.dx) > 0.01, 'la glissière glisse');
  const g = L.movers.find(q => q.gondola).col;
  assert.ok(Math.abs(g.dz) > 0.01, 'la nacelle avance');
  L.updateMovers(0);
});

test('la grille des obstacles voit tout', () => {
  for (const c of L.colliders) {
    if (c.moving || c.type === 'obox') continue;
    assert.ok(L.near(c.x, c.z, 0.2).includes(c), c.kind);
  }
  assert.ok(L.near(0, 0, 0).includes(L.turnCol), 'les mobiles sont toujours proposés');
});

console.log(passed + ' tests réussis');
