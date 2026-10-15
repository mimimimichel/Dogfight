// Tests des données du niveau 5 (la Station des Neiges) : node test/level5.test.mjs
import assert from 'node:assert';
import * as L from '../public/adventure/level5.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
console.log('Aventure — niveau 5');

// Physique du jeu (game.js) : saut 12 m/s, double saut 10,5 m/s, gravité 32, course 8,5 m/s
const G = 32, V1 = 12, V2 = 10.5, RUN = 8.5;
const H1 = V1 * V1 / (2 * G), H2 = H1 + V2 * V2 / (2 * G);
function reach(dy, double) {
  const up1 = V1 / G;
  if (!double) { if (dy > H1) return 0; return RUN * (up1 + Math.sqrt(2 * (H1 - dy) / G)); }
  if (dy > H2) return 0;
  return RUN * (up1 + V2 / G + Math.sqrt(2 * (H2 - dy) / G));
}
/** Pas plus raide que ce que le chien peut gravir en marchant (0,6 m par pas de 1/60 s à 8,5 m/s). */
const WALKABLE = 0.6 / (RUN / 60);
const slope = (x, z) => Math.hypot(L.heightAt(x + 0.2, z) - L.heightAt(x - 0.2, z), L.heightAt(x, z + 0.2) - L.heightAt(x, z - 0.2)) / 0.4;
const solidAt = (x, z, y) => L.colliders.some(c => !c.off && (c.kind === 'tree' || c.kind === 'trunk' || c.kind === 'rock' || c.solid) && L.inside(c, x, z, 0.3) && y > c.y0 && y < c.y1 - 0.2);
const rim = (x, z) => Math.pow(x ** 4 + z ** 4, 0.25);
const line = (id) => L.RUNS.find(r => r.id === id);

test('5 médailles (toutes cachées au départ), 100 flocons dorés, 5 bonnets, 4 chats patineurs', () => {
  assert.strictEqual(L.ID, 5);
  assert.strictEqual(L.SAVE_KEY, 'dogfight.aventure.niveau5');
  assert.strictEqual(L.medals.length, 5);
  assert.strictEqual(new Set(L.medals.map(m => m.id)).size, 5);
  for (const m of L.medals) assert.strictEqual(m.visible, false, m.id + ' visible dès le départ');
  assert.strictEqual(L.bones.length, 100);
  assert.strictEqual(new Set(L.bones.map(b => b.id)).size, 100);
  assert.strictEqual(L.BONNETS.length, 5);
  assert.strictEqual(L.cats.filter(c => c.group === 'clearing').length, 4);
  assert.strictEqual(L.FORT_MEDALS, 3);
});

test('une grande station (≈ 420 m), des lieux bien éloignés les uns des autres', () => {
  assert.ok(L.WORLD >= 400);
  const P = Object.entries(L.SPOTS).filter(([k]) => k !== 'spawn' && k !== 'mamie');
  let maxD = 0;
  for (const [a, p] of P) for (const [b, q] of P) if (a < b) maxD = Math.max(maxD, Math.hypot(p.x - q.x, p.z - q.z));
  assert.ok(maxD > 300, 'lieux trop proches : ' + maxD.toFixed(0) + ' m');
  // les flocons sont éparpillés partout, pas seulement le long des chemins
  const quads = [0, 0, 0, 0];
  for (const b of L.bones) quads[(b.x > 0 ? 1 : 0) + (b.z > 30 ? 2 : 0)]++;
  for (const q of quads) assert.ok(q >= 12, 'un quart de la station sans flocons : ' + quads);
});

test('100 flocons dorés, aucun dans un obstacle, tous dans la station', () => {
  for (const b of L.bones) {
    assert.ok(b.y > L.heightAt(b.x, b.z) + 0.3, `${b.id} sous la neige`);
    assert.ok(rim(b.x, b.z) < 184, `${b.id} hors de la station`);
    for (const c of L.colliders) if (!c.off && c.kind !== 'tree' && c.kind !== 'gate' && L.inside(c, b.x, b.z, 0) && b.y > c.y0 && b.y < c.y1 - 0.2) assert.fail(`flocon ${b.id} dans un obstacle (${c.kind})`);
    assert.ok(!L.trees.some(t => Math.hypot(t.x - b.x, t.z - b.z) < 0.5 * t.s + 0.3), `flocon ${b.id} dans un sapin`);
  }
});

test('médailles et bonnets : posés au-dessus du sol, hors des obstacles', () => {
  for (const m of [...L.medals, ...L.BONNETS.map(b => ({ id: b.id, x: b.x, z: b.z, y: b.y + 0.8 }))]) {
    const g = L.supportAt(m.x, m.z, m.y, 0).y;
    assert.ok(m.y - g > 0.3 && m.y - g < 2.2, `${m.id} : ${(m.y - g).toFixed(2)} m au-dessus du sol`);
    assert.ok(!solidAt(m.x, m.z, m.y), `${m.id} dans un obstacle`);
  }
});

test('les drapeaux sont posés sur un sol, on y tient debout', () => {
  assert.strictEqual(L.CHECKPOINTS.length, 10);
  for (const c of L.CHECKPOINTS) {
    assert.ok(Math.abs(L.supportAt(c.x, c.z, c.y + 0.5, 0).y - c.y) < 0.05, c.name + ' flotte');
    assert.ok(c.y > 0.5, c.name + ' trop bas');
    assert.ok(!solidAt(c.x, c.z, c.y + 0.5), c.name + ' dans un obstacle');
    assert.ok(slope(c.x, c.z) < 1, c.name + ' en pente');
  }
});

test('départ, Mamie, Biscotte et les habitants : sur la neige, hors des obstacles', () => {
  const who = [['départ', L.START], ['Mamie', L.npcs.mamie], ['Biscotte', L.npcs.puppy], ...Object.values(L.FOLKS).map(f => [f.name, f])];
  for (const [n, p] of who) {
    assert.ok(p.y > 1, n + ' trop bas');
    assert.ok(!solidAt(p.x, p.z, p.y + 0.5), n + ' dans un obstacle');
  }
});

test('on ne sort pas de la station : une corniche infranchissable tout autour', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    let prev = null, wall = false;
    for (let r = 160; r < 260; r += 0.14) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = L.heightAt(x, z);
      if (prev !== null && h - prev > 0.6) wall = true;
      prev = h;
    }
    assert.ok(wall, `pas de mur dans la direction ${a.toFixed(2)}`);
  }
});

test('tout le terrain de jeu se parcourt à pied (pas de pente trop raide hors des falaises voulues)', () => {
  for (let x = -186; x <= 186; x += 2) for (let z = -186; z <= 186; z += 2) {
    if (rim(x, z) > 180) continue;
    if (x < L.LEDGE.x1 + 2 && x > L.LEDGE.x0 - 2 && z > L.LEDGE.z0 - 2 && z < L.LEDGE.z1 + 2) continue;   // la corniche de la cascade
    assert.ok(slope(x, z) < WALKABLE * 0.8, `trop raide en (${x}, ${z}) : ${slope(x, z).toFixed(2)}`);
  }
});

test('la glace : lac, patinoire, rivière et mare ; pas l\'îlot ni le village ; la glace est plate', () => {
  const K = L.LAKE;
  assert.ok(L.iceAt(K.x + 10, K.z, K.y));
  assert.ok(!L.iceAt(K.x, K.z, K.isletY), 'l\'îlot n\'est pas glissant');
  assert.ok(!L.iceAt(0, 150, 3.5), 'le village n\'est pas glissant');
  assert.ok(L.iceAt(L.RINK.x, L.RINK.z, L.RINK.y), 'la patinoire');
  const rv = L.RIVER.at(L.RIVER.total * 0.4);
  assert.ok(L.iceAt(rv.x, rv.z, L.riverY(L.RIVER.total * 0.4)), 'la rivière');
  for (let a = 0; a < 6.28; a += 0.5) for (const r of [6, 12, 20]) assert.ok(Math.abs(L.heightAt(K.x + Math.cos(a) * r, K.z + Math.sin(a) * r) - K.y) < 0.05, 'glace du lac bosselée');
  for (let a = 0; a < 6.28; a += 0.5) for (const k of [0.3, 0.7, 0.95]) assert.ok(Math.abs(L.heightAt(L.RINK.x + Math.cos(a) * L.RINK.rx * k, L.RINK.z + Math.sin(a) * L.RINK.rz * k) - L.RINK.y) < 0.05, 'patinoire bosselée');
  const isl = L.heightAt(K.x, K.z) - K.y;
  assert.ok(isl > 0.3 && isl < 1.0, 'on monte sur l\'îlot sans sauter ou d\'un petit saut');
  // la rivière descend jusqu'au lac
  assert.ok(L.riverY(0) > L.riverY(L.RIVER.total) && L.riverY(L.RIVER.total) > K.y - 0.3);
  for (const b of L.BRIDGES) assert.ok(b.y - 0.35 > L.riverY(L.RIVER.info(b.x, b.z).along) + 1.2, 'pont trop bas pour glisser dessous');
  // aucun bloc de la cascade ni drapeau dans la rivière
  for (const p of [...L.ICE_STEPS, ...L.CHECKPOINTS, ...L.signs]) assert.ok(L.riverInfo(p.x, p.z).d > L.RIVER_W + 1, 'dans la rivière');
});

test('la Grande Glissade : longue, toujours en descente, sans sapin ni obstacle sur la piste', () => {
  assert.ok(L.RUN_TOTAL > 350, 'piste principale trop courte : ' + L.RUN_TOTAL.toFixed(0) + ' m');
  assert.strictEqual(L.RUNS.length, 3, 'deux embranchements');
  const bumpy = (r, s) => L.BUMPS.some(([id, b]) => id === r.id && Math.abs(b - s) < 8);
  for (const r of L.RUNS) {
    for (let s = 0; s + 8 < r.total; s += 2) {
      if (bumpy(r, s) || bumpy(r, s + 8)) continue;
      const a = r.at(s), b = r.at(s + 8);
      assert.ok(L.heightAt(b.x, b.z) < L.heightAt(a.x, a.z) + 0.15, `la piste ${r.id} remonte à ${s} m`);
    }
  }
  const top = L.RUN.at(0), end = L.RUN.at(L.RUN.total);
  assert.ok(L.heightAt(top.x, top.z) > 50, 'le départ est au sommet');
  assert.ok(Math.hypot(end.x - L.FINISH.x, end.z - L.FINISH.z) < 1, 'la piste finit à l\'arrivée');
  for (const t of L.trees) assert.ok(L.runInfo(t.x, t.z).d > L.RUN_W + 2, 'un sapin sur la piste');
  for (const c of L.colliders) if ((c.kind === 'rock' || c.solid) && L.runInfo(c.x, c.z).d < L.RUN_W + (c.r || 0)) assert.fail(`un obstacle sur la piste (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`);
  // le tunnel de neige, et les bosses
  assert.ok(L.TUNNEL.s1 > L.TUNNEL.s0 && L.colliders.filter(c => c.tunnel).length >= 10);
  for (const r of L.RUNS) assert.ok(L.BUMPS.some(b => b[0] === r.id), 'pas de bosse sur ' + r.id);
});

test('les fanions : assez de portes sur chaque chemin pour gagner la médaille', () => {
  const main = L.RUN, gates = (id, s0, s1) => L.GATES.filter(g => g.line === id && g.s >= s0 && g.s <= s1).length;
  assert.ok(gates('main', 0, 1e9) >= L.GATES_NEEDED + 4, 'portes de la piste principale');
  const f = line('foret'), fa = f.at(0), fb = f.at(f.total);
  const ja = main.info(fa.x, fa.z).along, jb = main.info(fb.x, fb.z).along;
  assert.ok(gates('main', 0, ja) + gates('foret', 0, 1e9) + gates('main', jb, 1e9) >= L.GATES_NEEDED, 'par la piste des sapins');
  const b = line('bosses'), ba = b.at(0), bb = b.at(b.total);
  const ka = main.info(ba.x, ba.z).along, kb = main.info(bb.x, bb.z).along;
  assert.ok(gates('main', 0, ka) + gates('bosses', 0, 1e9) + gates('main', kb, 1e9) >= L.GATES_NEEDED, 'par la piste des bosses');
  for (const g of L.GATES) assert.ok(L.runInfo(g.x, g.z).d < 0.5, 'porte hors de la piste');
});

test('le télésiège : le siège passe toujours au-dessus de la neige, des sapins et des chalets', () => {
  for (let s = 0; s <= L.LIFT_LEN; s += 0.5) {
    const p = L.liftAt(s), seat = p.y - L.SEAT_DROP;
    assert.ok(seat - L.heightAt(p.x, p.z) > 1.4, `siège trop bas à ${s.toFixed(1)} m`);
    for (const c of L.colliders) if (c.kind !== 'rock' && c.kind !== 'bridge' && L.inside(c, p.x, p.z, 1.5)) assert.ok(seat > c.y1 + 0.3, `siège dans un obstacle (${c.kind}) à ${s.toFixed(1)} m`);
  }
  assert.ok(L.LIFT.top.y > 50 && L.LIFT.base.y < 5, 'du bas jusqu\'au sommet');
  assert.ok(L.LIFT_LEN / L.LIFT_SPEED < 25, 'montée pas trop longue');
  for (const p of L.PYLONS) assert.ok(L.runInfo(p.x, p.z).d > L.RUN_W + 1, 'pylône sur une piste');
});

test('la Cascade Gelée se grimpe de bloc en bloc jusqu\'à la corniche (et son bonnet)', () => {
  const S = L.ICE_STEPS;
  const first = S[0], g0 = L.heightAt(first.x, first.z);
  assert.ok(first.top - g0 < H1 * 0.9, 'premier bloc : un simple saut');
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], b = S[i + 1], gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, dy = b.top - a.top;
    assert.ok(dy < H2 * 0.8 && gap < reach(dy, true) * 0.6, `bloc ${i} → ${i + 1} : ${gap.toFixed(1)} m, +${dy.toFixed(1)} m`);
    assert.ok(gap > 0.2, `blocs ${i} et ${i + 1} collés`);
  }
  const last = S[S.length - 1], dyL = L.LEDGE.top - last.top;
  assert.ok(dyL < H2 * 0.8 && dyL > -1, 'du dernier bloc à la corniche');
  // le bord de la corniche est à portée de saut du dernier bloc
  let edge = 99;
  for (let a = 0; a < 6.28; a += 0.1) for (let r = last.r; r < 6; r += 0.1) if (L.heightAt(last.x + Math.cos(a) * r, last.z + Math.sin(a) * r) > L.LEDGE.top - 0.3) { edge = Math.min(edge, r - last.r); break; }
  assert.ok(edge < reach(Math.max(0, dyL), true) * 0.6, 'la corniche est trop loin du dernier bloc : ' + edge.toFixed(1) + ' m');
  const b = L.BONNETS.find(q => q.id === 'b1');
  assert.ok(Math.abs(L.heightAt(b.x, b.z) - L.LEDGE.top) < 0.01, 'bonnet sur la corniche');
  // sinon, la corniche est une falaise
  assert.ok(L.heightAt(L.LEDGE.x1 + 1.5, -40) < 5 && L.heightAt(L.LEDGE.x1 - 1, -40) > 14);
});

test('la Crevasse de Cristal : un couloir en zigzag qu\'on suit à pied jusqu\'au fond', () => {
  const C = L.CREVASSE, E = L.CREVASSE_END;
  for (const w of L.CREVASSE_WALLS) assert.ok(w.y1 - C.y > H2 + 0.5, 'mur de glace qu\'on peut sauter');
  // parcours en largeur sur une grille de 0,5 m depuis l'entrée (au sud)
  const step = 0.5, ok = (x, z) => !L.CREVASSE_WALLS.some(c => L.inside(c, x, z, 0.4)) && !L.colliders.some(c => c.kind === 'tree' && L.inside(c, x, z, 0.4));
  const key = (i, j) => i * 1000 + j, seen = new Set(), q = [[0, 0]];
  const x0 = C.x, z0 = C.z + 16;
  seen.add(key(0, 0));
  let found = false;
  while (q.length && !found) {
    const [i, j] = q.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, x = x0 + ni * step, z = z0 + nj * step;
      if (Math.abs(ni) > 80 || nj > 8 || nj < -90 || seen.has(key(ni, nj)) || !ok(x, z)) continue;
      seen.add(key(ni, nj));
      if (Math.hypot(x - E.x, z - E.z) < 1) { found = true; break; }
      q.push([ni, nj]);
    }
  }
  assert.ok(found, 'le fond de la crevasse est inaccessible');
  const b = L.BONNETS.find(q => q.id === 'b2');
  assert.ok(Math.hypot(b.x - E.x, b.z - E.z) < 0.1, 'le bonnet bleu est au fond');
});

test('le bonnet de la gare du télésiège : on y monte par le tas de bois', () => {
  const W = L.WOODPILE, S = L.STATION, b = L.BONNETS.find(q => q.id === 'b3');
  assert.ok(W.h < H1 * 0.9, 'tas de bois : un simple saut');
  assert.ok(S.h - W.h < H1 * 0.9, 'du tas de bois au toit : un simple saut');
  assert.ok(Math.abs(b.y - (S.y + S.h)) < 0.05, 'bonnet sur le toit');
});

test('Fort Moustache : un cercle de blocs, une porte fermée (3 médailles), assez grand pour se battre', () => {
  const F = L.FORT;
  assert.ok(L.fortBlocks.length >= 16);
  assert.ok(Math.abs(L.heightAt(F.x, F.z) - F.y) < 0.05, 'sol plat');
  const g = L.FORT_GATE;
  assert.ok(g.solid && g.y1 - F.y > H2, 'la porte ne se saute pas');
  for (let a = 0; a < 6.28; a += 0.4) for (const r of [2, 4, 6]) assert.ok(!solidAt(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, F.y + 0.5), 'obstacle dans le fort');
});

test('patinoire : les plots sont sur la glace, Pingo et le podium juste à côté', () => {
  assert.strictEqual(L.RINK_CONES.length, 8);
  for (const c of L.RINK_CONES) assert.ok(L.iceAt(c.x, c.z, L.RINK.y), 'plot hors de la glace');
  for (const p of [L.FOLKS.pingo, L.RINK_PODIUM]) assert.ok(Math.hypot(p.x - L.RINK.x, p.z - L.RINK.z) < L.RINK.rx + 6);
  assert.ok(L.RINK_PODIUM.h < H1 * 0.9, 'podium : un simple saut');
});

test('bonhomme de neige : chaque boule roule tout droit jusqu\'au jardin, et grossit assez en chemin', () => {
  const Gd = L.GARDEN;
  for (const b of L.SNOWBALLS) {
    const d = Math.hypot(b.x - Gd.x, b.z - Gd.z);
    assert.ok(0.45 + (d - Gd.r - 1) * 0.016 >= 0.8, `boule ${b.id} trop près du jardin (${d.toFixed(0)} m)`);
    let hmin = 1e9, hmax = -1e9;
    for (let k = 0; k <= 1; k += 0.01) {
      const x = b.x + (Gd.x - b.x) * k, z = b.z + (Gd.z - b.z) * k, h = L.heightAt(x, z);
      hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
      assert.ok(!L.iceAt(x, z, h), `boule ${b.id} : de la glace sur le chemin`);
      assert.ok(!L.colliders.some(c => !c.off && c.kind !== 'bridge' && L.inside(c, x, z, 1.4) && c.y1 > h + 0.3), `boule ${b.id} : un obstacle sur le chemin`);
    }
    assert.ok(hmax - hmin < 1.2, `boule ${b.id} : chemin trop bosselé`);
  }
});

test('le bébé pingouin est sur l\'îlot, sa maman au village des pingouins, le renard dans la forêt', () => {
  assert.ok(Math.hypot(L.BABY.x - L.LAKE.x, L.BABY.z - L.LAKE.z) < L.LAKE.islet);
  assert.ok(Math.hypot(L.FOLKS.maman.x - L.SPOTS.igloos.x, L.FOLKS.maman.z - L.SPOTS.igloos.z) < 12);
  assert.ok(Math.hypot(L.FOLKS.maman.x - L.LAKE.x, L.FOLKS.maman.z - L.LAKE.z) > 50, 'le retour doit être une petite promenade');
  assert.ok(L.trees.filter(t => Math.hypot(t.x - L.DEN.x, t.z - L.DEN.z) < 35).length > 10, 'pas de forêt autour de la tanière');
});

test('les chats et les caisses sont sur la neige, pas dans un obstacle', () => {
  for (const c of [...L.cats, ...L.crates]) {
    assert.ok(c.y > 0.5, c.id + ' trop bas');
    assert.ok(!solidAt(c.x, c.z, c.y + 0.5), c.id + ' dans un obstacle');
  }
  for (const c of L.cats.filter(q => q.group === 'clearing')) assert.ok(L.iceAt(c.x, c.z, c.y), c.id + ' devrait patiner sur le lac');
});

test('le portail du retour au Parc est sur un sol libre', () => {
  for (const p of L.PORTALS) {
    assert.ok(Math.abs(L.heightAt(p.x, p.z) - L.START.y) < 0.8);
    assert.ok(!L.colliders.some(c => !c.off && L.inside(c, p.x, p.z, 1.3)));
  }
});

console.log(passed + ' tests réussis');
