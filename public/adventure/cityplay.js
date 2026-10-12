/*
 * Matcha & Ainu — Port-Croquette : tout ce qui bouge et se joue dans la ville.
 * Karts (conduite, dérapage, turbo, sauts acrobatiques), karts rivaux,
 * circulation et passants, 12 missions, porte-monnaie et boutique de Mimi.
 * Le navigateur de l'hôte fait tourner les règles ; les invités reçoivent l'état.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as K from './citykit.js';

const { clamp, lerpAngle, angDiff, hex, fmtTime } = K;
const KP = K.K;                                  // réglages des karts
const SEE = 150;                                 // distance d'affichage des personnages et véhicules

// Position du chapeau sur la tête de chaque chien : [x, y, z, échelle]
const HAT_AT = { duo: [0, 0.3, -0.36, 1.55], ainu: [0, 0.3, -0.36, 1.55], matcha: [0, 0.04, -0.1, 0.72], pug: [0, 0.32, -0.24, 1.2], yorkie: [0, 0.24, -0.2, 0.92] };

export function buildPlay(game, decor) {
  const sc = game.scene, lite = game.lite;
  const S = L, G = S.GROUND;
  const { moving, chars, anim } = decor;
  const cullList = decor.cull.concat(decor.tiles);
  const save = () => game.save;
  const city = () => {
    const s = save();
    if (!s.city) s.city = {};
    const c = s.city;
    for (const [k, v] of [['posters', []], ['best', {}], ['coins', 0], ['owned', []], ['style', {}], ['stunts', []], ['fares', 0]]) if (c[k] === undefined) c[k] = Array.isArray(v) ? [] : (typeof v === 'object' ? {} : v);
    return c;
  };
  const players = () => game.players;
  const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const nearestDist = (x, z) => Math.min(...players().map(p => Math.hypot(p.pos.x - x, p.pos.z - z)));
  const missionDef = (id) => S.MISSIONS.find(q => q.id === id);
  const medalOf = (id) => game.medals.find(m => m.def.id === missionDef(id).medal);
  const owned = (id) => save().medals.includes(missionDef(id).medal);
  const unlocked = (id) => !missionDef(id).needs || save().medals.length >= missionDef(id).needs;
  const replayable = (id) => ['race', 'champion', 'downhill', 'taxi', 'balloons'].includes(id);
  const available = (id) => save().intro && unlocked(id) && (!owned(id) || replayable(id)) && !(st.m && st.m.id === id);

  // =============================================================================
  // Personnages : habitants, voleur, Capitaine, chaton, passager du taxi
  // =============================================================================
  const citizens = {};
  for (const id in S.GIVERS) {
    if (id === 'boss') continue;
    const g = S.GIVERS[id];
    const m = K.buildCitizen(g.look);
    m.position.set(g.x, g.y, g.z); m.rotation.y = g.yaw || 0;
    sc.add(m); chars.push(m);
    citizens[id] = { m, def: g, mark: game.makeMark(id === 'shop' ? '€' : id === 'taxi' ? 'T' : '!', id === 'shop' ? 0x40c060 : id === 'taxi' ? 0xf0c020 : 0xff9a2a) };
  }
  const thief = K.buildThief(); thief.visible = false; sc.add(thief); chars.push(thief); moving.push(thief);
  const thiefShadow = game.makeShadow(0.6); thiefShadow.visible = false;
  const capKart = K.buildKart(0xff5ab8); capKart.visible = false; sc.add(capKart); moving.push(capKart);
  const captain = K.buildCaptain(); captain.scale.setScalar(1.25); captain.visible = false; sc.add(captain); chars.push(captain); moving.push(captain);
  const capShadow = game.makeShadow(1.3); capShadow.visible = false;
  const kitten = M.buildCat(); kitten.scale.setScalar(0.55); kitten.visible = false; sc.add(kitten); chars.push(kitten); moving.push(kitten);
  const passenger = K.buildWalker(0xd8a868); passenger.scale.setScalar(1.1); passenger.visible = false; sc.add(passenger); moving.push(passenger);

  // Affiches, ballons, caisses dorées, endroits où creuser
  const pTex = K.posterTexture();
  const posters = S.POSTERS.map(p => {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.1), M.mat(0x6a4a30)); board.position.y = 2.0;
    const face = K.plane(pTex, 1.5, 1.9); face.position.set(0, 2.0, 0.06);
    const back = K.plane(pTex, 1.5, 1.9); back.position.set(0, 2.0, -0.06); back.rotation.y = Math.PI;
    for (const s of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), M.mat(0x6a4a30)); leg.position.set(s, 0.6, 0); g.add(leg); }
    g.add(board, face, back);
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.rot;
    sc.add(g); cullList.push({ obj: g, x: p.x, z: p.z, r: 3 });
    return { def: p, g };
  });
  const balloonCols = [0xe04848, 0x3a8ae0, 0xf0c020, 0x40c060, 0xc050e0, 0xff7ab0];
  const balloons = S.BALLOONS.list.map((b, i) => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), M.mat(balloonCols[i % 6], { roughness: 0.3 })); ball.scale.y = 1.2;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), M.mat(0xffffff)); str.position.y = -1.3;
    g.add(ball, str); g.position.set(b.x, b.y, b.z); g.visible = false;
    sc.add(g); moving.push(g);
    return { def: b, g };
  });
  const goldCrates = S.SMUGGLE.crates.map(c => {
    const m = M.buildCrate(); m.traverse(o => { if (o.isMesh) o.material = M.mat(0xffc830, { metalness: 0.6, roughness: 0.35, emissive: 0x5a3a00, emissiveIntensity: 0.5 }); });
    m.position.set(c.x, c.y + 0.6, c.z); m.visible = false; sc.add(m);
    return { def: c, m };
  });
  const digSpots = S.TREASURE.spots.map(s => {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.mat(0xe0c080, { roughness: 1 })); mound.scale.y = 0.4;
    const x = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.2), M.mat(0xd03030)); x.rotation.y = 0.8; x.position.y = 0.3;
    const x2 = x.clone(); x2.rotation.y = -0.8;
    g.add(mound, x, x2); g.position.set(s.x, s.y, s.z); g.visible = false;
    sc.add(g);
    return { def: s, g };
  });

  // Karts des joueurs
  const karts = S.KARTS.map((d, i) => {
    const m = K.buildKart(d.color);
    sc.add(m); moving.push(m);
    return { i, def: d, m, x: d.x, y: d.y, z: d.z, yaw: d.yaw, speed: 0, vy: 0, grounded: true, driver: -1, boost: 0, boostCd: 0, drift: 0, driftT: 0, hopped: false, climb: 0, spin: 0, wheelA: 0, bumpT: 0, shadow: game.makeShadow(1.3) };
  });
  // Aérodrome (au nord-est) : piste, manche à air, et biplans à piloter
  const RUNWAY = S.RUNWAY;
  let sockCone = null;
  {
    const len = RUNWAY.x1 - RUNWAY.x0;
    const tex = K.canvasTex(1024, 96, (x, w, h) => {
      x.fillStyle = '#4a4c50'; x.fillRect(0, 0, w, h);
      K.speckle(x, w, h, 3000, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.12)']);
      x.fillStyle = '#f2f2ee';
      for (let i = 40; i < w - 40; i += 36) x.fillRect(i, h / 2 - 1.5, 20, 3);       // axe
      for (const e of [6, w - 30]) for (let j = 0; j < 8; j++) x.fillRect(e, 10 + j * 10, 24, 5);   // seuils
      x.fillRect(0, 3, w, 2); x.fillRect(0, h - 5, w, 2);
      x.font = 'bold 26px sans-serif'; x.textAlign = 'center';
      x.save(); x.translate(56, h / 2); x.rotate(Math.PI / 2); x.fillText('09', 0, 9); x.restore();
      x.save(); x.translate(w - 56, h / 2); x.rotate(-Math.PI / 2); x.fillText('27', 0, 9); x.restore();
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, RUNWAY.w), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set((RUNWAY.x0 + RUNWAY.x1) / 2, G + 0.03, RUNWAY.z); strip.receiveShadow = true;
    sc.add(strip);
    // balises lumineuses le long de la piste
    const n = Math.floor(len / 8) + 1;
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd070, emissiveIntensity: 1.4 }), n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) for (const sd of [-1, 1]) lamps.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), m4.makeTranslation(RUNWAY.x0 + i * 8, G + 0.18, RUNWAY.z + sd * (RUNWAY.w / 2 + 0.4)));
    sc.add(lamps);
    // manche à air
    const sock = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), M.mat(0xdedede, { metalness: 0.6, roughness: 0.3 })); pole.position.y = 3; sock.add(pole);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 2.2, 14, 4, true), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, side: THREE.DoubleSide }));
    cone.rotation.z = Math.PI / 2 - 0.2; cone.position.set(1.1, 5.7, 0); sock.add(cone);
    sock.position.set(RUNWAY.x0 + 12, G, RUNWAY.z + RUNWAY.w / 2 + 5); sock.rotation.y = 0.6;
    sc.add(sock); sockCone = cone;
  }
  const PL = { TAXI: 9, FLY: 25, MINAIR: 16, BOOST: 38, LIFT: 13, CLIMB: 9, SINK: 3.2, CEIL: 115, R: 2.4 };
  const planes = [[0xd83a3a, -2], [0x3a7ad8, 3.5], [0xf0b020, -7.5]].map(([color, dz], i) => {
    const def = { x: RUNWAY.x0 + 8 + i * 4, y: G, z: RUNWAY.z + dz, yaw: Math.PI / 2, color };
    const m = K.buildPlane(color);
    sc.add(m); moving.push(m);
    return { i, def, m, plane: true, x: def.x, y: G, z: def.z, yaw: def.yaw, speed: 0, vy: 0, grounded: true, driver: -1, boost: 0, boostCd: 0, drift: 0, driftT: 0, spin: 0, roll: 0, pitch: 0, propA: 0, bumpT: 0, shadow: game.makeShadow(2.5) };
  });
  // un autre avion fait le tour de la ville, très haut (le même chez tout le monde)
  const flyby = K.buildPlane(0xf4f4f4); flyby.scale.setScalar(1.4); sc.add(flyby);

  // Karts rivaux (courses)
  const rivalCols = [0x2a2a3a, 0xf08a2a, 0x8ad040, 0x40a0e0, 0xe0e0e0];
  const rivalNames = ['Rocco', 'Fifi', 'Bandit', 'Gaston', 'Lulu'];
  const rivals = rivalCols.map((c, i) => {
    const m = K.buildKart(c); m.visible = false; sc.add(m); moving.push(m);
    const rider = K.buildWalker([0x8a5a3a, 0xf0d0a0, 0x3a3a3a, 0xc8a070, 0xffffff][i], i % 2 === 1); rider.visible = false; sc.add(rider);
    return { i, name: rivalNames[i], m, rider, x: 0, y: G, z: 0, yaw: 0, speed: 0, vy: 0, grounded: true, driver: -2, boost: 0, boostCd: 0, drift: 0, driftT: 0, hopped: false, climb: 0, spin: 0, wheelA: 0, bumpT: 0, on: false, wp: 0, prog: 0, skill: 0.9 + i * 0.03 };
  });

  // Circulation
  const carCols = [0xe04848, 0x3a8ae0, 0xf0f0f0, 0x2a2a34, 0xf0c020, 0x40b060, 0x8a8a94, 0xc050c0];
  const cars = [];
  S.TRAFFIC.forEach((T, li) => {
    const pts = T.pts, segs = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, s0: total }); total += l; }
    for (let k = 0; k < T.n; k++) {
      const kind = (li + k) % 7 === 3 ? 'bus' : (li + k) % 5 === 2 ? 'van' : 'car';
      const m = K.buildCar(carCols[(li * 3 + k) % carCols.length], kind);
      sc.add(m); moving.push(m);
      cars.push({ on: true, loop: segs, total, s: total * k / T.n, speed: kind === 'bus' ? 7 : 9, v: 0, m, x: 0, y: G, z: 0, yaw: 0, wait: 0, ghost: 0, kind, len: m.userData.len, honkT: -9 });
    }
  });
  const carAt = (c, s) => {
    s = ((s % c.total) + c.total) % c.total;
    let seg = c.loop[0];
    for (const q of c.loop) if (s >= q.s0) seg = q;
    const t = (s - seg.s0) / seg.l, dx = (seg.b[0] - seg.a[0]) / seg.l, dz = (seg.b[1] - seg.a[1]) / seg.l;
    // voie de droite : décalage de 2 m à droite du sens de la marche
    return { x: seg.a[0] + (seg.b[0] - seg.a[0]) * t - dz * 2, z: seg.a[1] + (seg.b[1] - seg.a[1]) * t + dx * 2, yaw: Math.atan2(dx, dz) };
  };
  for (const c of cars) { const p = carAt(c, c.s); Object.assign(c, p); c.y = S.heightAt(c.x, c.z); }

  // Passants (simulés sur chaque écran : purement décoratifs)
  const walkers = [];
  S.WALKS.forEach((pts, i) => {
    if (i >= (lite ? 8 : 14)) return;
    const m = K.buildWalker([0xd8a868, 0x6a4a3a, 0xf0e0c8, 0x3a3a3a, 0xc8a070, 0xe8d0b0, 0x9a7a5a][i % 7], i % 4 === 3);
    sc.add(m); moving.push(m);
    let total = 0; const segs = [];
    for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, s0: total }); total += l; }
    walkers.push({ m, segs, total, s: (i * 37) % total, speed: 1.1 + (i % 3) * 0.25, dir: i % 2 ? 1 : -1, ph: i });
  });

  // Balises, panneau de mission, porte-monnaie
  const beaconGeo = new THREE.CylinderGeometry(1.4, 1.4, 40, 20, 1, true);
  const ringGeo = new THREE.TorusGeometry(2.2, 0.16, 8, 36); ringGeo.rotateX(Math.PI / 2);
  const beacons = [];
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(beaconGeo, K.beaconMaterial(0xffd23a)); b.visible = false; b.renderOrder = 3; b.userData.noOutline = true;
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, fog: false })); r.visible = false; r.userData.noOutline = true;
    sc.add(b, r); beacons.push({ b, r });
  }
  const hud = document.createElement('div');
  hud.className = 'adv-mission hidden';
  hud.innerHTML = '<b></b><span></span><em></em>';
  game.dom.root.querySelector('.adv-hud').appendChild(hud);
  const hudB = hud.querySelector('b'), hudS = hud.querySelector('span'), hudE = hud.querySelector('em');
  const wallet = document.createElement('div');
  wallet.className = 'adv-count adv-wallet';
  wallet.innerHTML = '<span class="coin-ic">€</span><span class="n">0</span>';
  game.dom.root.querySelector('.adv-counts').appendChild(wallet);
  const walletN = wallet.querySelector('.n');

  // =============================================================================
  // État
  // =============================================================================
  const st = { m: null, karts, btnKart: null, shopOpen: false };
  for (const k of karts) resetKart(k);

  function addCoins(n, why) {
    const c = city();
    c.coins = Math.max(0, (c.coins | 0) + n);
    game.persist();
    if (why) game.banner(`+${n} pièces`, why, 1800);
  }

  // --- Karts --------------------------------------------------------------------
  function resetKart(k) { k.x = k.def.x; k.y = k.def.y; k.z = k.def.z; k.yaw = k.def.yaw; k.speed = 0; k.vy = 0; k.grounded = true; k.boost = 0; k.drift = 0; }
  function enterKart(P, k) {
    if (k.driver >= 0 || P.kart) return;
    k.driver = P.id; P.kart = k;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.pos.set(k.x, k.y, k.z); P.yaw = k.yaw;
    game.sound('engine');
    if (!city().kartTip) {
      city().kartTip = 1;
      const c = game.controlsHelp();
      game.banner('En voiture !', `${c.dash} : turbo · ${c.jump} : saut (maintenu en virage : dérapage) · ${c.attack} : klaxon`, 4200);
    }
  }
  function exitKart(P) {
    const k = P.kart;
    if (!k) return;
    k.driver = -1; P.kart = null; k.speed = 0; k.drift = 0; k.boost = 0;
    const sx = Math.cos(k.yaw), sz = -Math.sin(k.yaw);
    const p = { x: k.x + sx * 1.8, z: k.z + sz * 1.8 };
    game.pushOut(p, k.y);
    P.pos.set(p.x, game.support(p.x, p.z, k.y + 0.6).y, p.z);
    P.vel.set(0, 4, 0); P.grounded = false; P.jumps = 1;
  }
  function resetPlane(k) { Object.assign(k, { x: k.def.x, y: k.def.y, z: k.def.z, yaw: k.def.yaw, speed: 0, vy: 0, grounded: true, boost: 0, roll: 0, pitch: 0 }); }
  function enterPlane(P, k) {
    if (k.driver >= 0 || P.kart) return;
    k.driver = P.id; P.kart = k;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.pos.set(k.x, k.y, k.z); P.yaw = k.yaw;
    game.sound('engine');
    if (!city().planeTip) {
      city().planeTip = 1;
      const c = game.controlsHelp();
      game.banner('Aux commandes !', `${c.jump} maintenu : plein gaz et monter · lâcher : on redescend doucement · ${c.dash} : turbo`, 5200);
    }
  }
  function exitPlane(P) {
    const k = P.kart;
    if (!k) return;
    if (!k.grounded) { game.banner('Pose-toi d\'abord !', 'Lâche le bouton pour redescendre doucement.', 1600); return; }
    k.driver = -1; P.kart = null; k.speed = 0; k.boost = 0; k.roll = 0; k.pitch = 0;
    const sx = Math.cos(k.yaw), sz = -Math.sin(k.yaw);
    const p = { x: k.x + sx * 5.6, z: k.z + sz * 5.6 };
    game.pushOut(p, k.y);
    P.pos.set(p.x, game.support(p.x, p.z, k.y + 0.6).y, p.z);
    P.vel.set(0, 4, 0); P.grounded = false; P.jumps = 1;
    if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; }
  }
  /** Vol arcade : le joystick tourne, le saut maintenu fait monter (et décoller), lâché on redescend doucement. */
  function flyPlane(drv, k, wx, wz, jumpHeld, pr, dt) {
    const frozen = game.dialog || game.freeze > 0;
    if (frozen) { wx = 0; wz = 0; jumpHeld = false; }
    k.boost = Math.max(0, k.boost - dt); k.boostCd = Math.max(0, k.boostCd - dt); k.bumpT = Math.max(0, k.bumpT - dt);
    if (!frozen) {
      if (pr.has('attack')) honk(k);
      if (pr.has('dash') && k.boostCd <= 0 && (!k.grounded || k.speed > 4)) { k.boost = 1.6; k.boostCd = 2.2; game.sound('boost'); }
    }
    const wl = Math.hypot(wx, wz);
    let turn = 0, d = 0;
    if (wl > 0.15) { d = angDiff(Math.atan2(wx, wz), k.yaw); turn = clamp(d * 1.6, -1, 1); }
    let target;
    if (k.grounded) target = jumpHeld ? PL.FLY : wl > 0.15 ? PL.TAXI * wl * (Math.abs(d) > 1.6 ? 0.4 : 1) : 0;
    else target = wl > 0.15 ? PL.FLY : PL.MINAIR + 3;
    if (k.boost > 0) target = PL.BOOST;
    const acc = k.boost > 0 ? 22 : k.grounded ? (target > k.speed ? 9 : 12) : 6;
    k.speed += clamp(target - k.speed, -acc * dt, acc * dt);
    k.yaw += turn * (k.grounded ? 1.5 * clamp(k.speed / 5, 0.25, 1) : 1.05) * dt;
    // ne pas sortir du monde : on fait demi-tour tout seul
    const lim = S.WORLD / 2 - 18;
    if (Math.abs(k.x) > lim || Math.abs(k.z) > lim) k.yaw = lerpAngle(k.yaw, Math.atan2(-k.x, -k.z), Math.min(1, dt * 1.6));
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const next = { x: clamp(k.x + fx * k.speed * dt, -lim - 6, lim + 6), z: clamp(k.z + fz * k.speed * dt, -lim - 6, lim + 6) };
    const nx0 = next.x, nz0 = next.z;
    game.pushOut(next, k.y + 0.4, PL.R);
    const corr = Math.hypot(next.x - nx0, next.z - nz0);
    if (corr > 0.05 && k.speed > 6) {
      if (k.bumpT <= 0) { if (drv) game.sound('bump'); game.burst(next.x + fx * 2, k.y + 1.5, next.z + fz * 2, 10, 0xffffff, 3, 0.4); k.bumpT = 0.5; }
      k.speed *= 0.55;
      if (!k.grounded) k.vy = Math.max(k.vy, 5);
    }
    k.x = next.x; k.z = next.z;
    if (k.grounded) {
      const sup = game.support(k.x, k.z, k.y + 0.6);
      if (sup.y < k.y - 0.6) { k.grounded = false; k.vy = 0; }
      else k.y = sup.y;
      if (jumpHeld && k.speed >= PL.LIFT && !frozen) { k.grounded = false; k.vy = 3.5; if (drv) game.sound('jump'); }
    } else {
      const vyT = jumpHeld ? PL.CLIMB : -PL.SINK;
      k.vy += (vyT - k.vy) * Math.min(1, dt * 2.5);
      k.y = Math.min(PL.CEIL, k.y + k.vy * dt);
      const sup = game.support(k.x, k.z, k.y + 0.3);
      if (k.y <= sup.y) {
        if (k.vy < -6 || k.speed > 30) { if (drv) game.sound('bump'); game.burst(k.x, sup.y + 0.2, k.z, 12, 0xf0e0c0, 3, 0.5); }
        k.y = sup.y; k.vy = 0; k.grounded = true; k.speed = Math.min(k.speed, 14);
      }
    }
    if (k.y < S.WATER_Y + 0.3 && S.inWater(k.x, k.z)) {
      game.burst(k.x, S.WATER_Y + 0.2, k.z, 24, 0x9ae0ff, 5, 0.7); game.sound('splash');
      resetPlane(k); game.banner('Plouf !', 'L\'avion revient à l\'aérodrome.', 1800);
    }
    k.roll += ((k.grounded ? 0 : -turn * 0.6) - k.roll) * Math.min(1, dt * 3);
    k.pitch += ((k.grounded ? 0 : clamp(-k.vy * 0.045, -0.35, 0.35)) - k.pitch) * Math.min(1, dt * 3);
    if (k.boost > 0 && game.t % 0.04 < dt) game.spawnParticle(k.x - fx * 4.2, k.y + 1.75, k.z - fz * 4.2, -fx * 3, 0.5, -fz * 3, 0xffb050, 0.3, 0.3, 0);
    if (drv) {
      drv.pos.set(k.x, k.y, k.z);
      drv.vel.set(fx * k.speed, k.vy, fz * k.speed);
      drv.yaw = k.yaw; drv.grounded = k.grounded; drv.gliding = false;
      drv.attackT = 0; drv.dashT = 0;
      if (k.grounded && k.y > 0.4 && game.t - drv.lastSafeT > 0.4) { drv.lastSafe.set(k.x, k.y, k.z); drv.lastSafeT = game.t; }
    }
  }
  function honk(k) {
    if (game.t - (k.hornT || -9) < 0.5) return;
    k.hornT = game.t;
    game.sound('horn');
    for (const c of game.cats) if (!c.dead && Math.hypot(c.pos.x - k.x, c.pos.z - k.z) < 6) c.stun = 1.5;
  }
  const turboUp = () => city().owned.includes('turbo');
  /** Physique d'un kart (joueur ou rival). drv : le chien au volant (ou null pour un rival). */
  function driveKart(drv, k, wx, wz, jumpHeld, pr, dt) {
    const frozen = game.dialog || game.freeze > 0 || (st.m && st.m.ph === 'count' && st.m.lock && st.m.lock.includes(drv ? drv.id : 'r' + k.i));
    if (frozen) { wx = 0; wz = 0; jumpHeld = false; }
    k.boostCd = Math.max(0, k.boostCd - dt);
    k.boost = Math.max(0, k.boost - dt);
    k.spin = Math.max(0, k.spin - dt);
    k.bumpT = Math.max(0, k.bumpT - dt);
    if (!frozen) {
      if (pr.has('attack')) honk(k);
      if (pr.has('dash') && k.boostCd <= 0) { const up = drv && turboUp(); k.boost = up ? 1.7 : 1.15; k.boostCd = up ? 1.8 : 2.4; if (drv) game.sound('boost'); }
      if (pr.has('jump') && k.grounded) { k.vy = KP.HOP; k.grounded = false; k.hopped = true; if (drv) game.sound('jump'); }
    }
    const wl = Math.hypot(wx, wz);
    let target = 0, turn = 0, brake = false;
    if (wl > 0.15) {
      const want = Math.atan2(wx, wz);
      const d = angDiff(want, k.yaw);
      if (Math.abs(d) > 2.3) {
        if (k.speed < 3) { target = KP.REV * wl; turn = clamp(angDiff(want + Math.PI, k.yaw) * 2, -1, 1); }
        else brake = true;
      } else {
        target = KP.MAX * (k.maxK || 1) * wl * (Math.abs(d) > 1.6 ? 0.45 : 1);
        turn = clamp(d * 2.2, -1, 1);
      }
    }
    const offroad = k.y < G - 0.25 && S.heightAt(k.x, k.z) < G - 0.25;
    if (offroad) target *= 0.6;
    if (k.boost > 0) target = KP.BOOST;
    if (k.spin > 0) { target = 0; turn = 0; }
    if (k.grounded) {
      if (brake) k.speed = Math.max(0, k.speed - KP.BRAKE * dt);
      else if (wl <= 0.15 && k.boost <= 0) k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), KP.COAST * dt);
      else {
        const acc = k.boost > 0 ? 45 : (target > k.speed ? (k.speed < 0 ? KP.BRAKE : KP.ACC) : KP.BRAKE * 0.5);
        k.speed += clamp(target - k.speed, -acc * dt, acc * dt);
      }
    }
    if (k.drift) {
      if (!jumpHeld || k.speed < 6 || !k.grounded) {
        if (k.driftT > 0.7 && k.grounded) { k.boost = Math.max(k.boost, k.driftT > 1.5 ? 1.0 : 0.6); if (drv) game.sound('boost'); }
        k.drift = 0; k.driftT = 0;
      } else {
        k.driftT += dt;
        turn = clamp(turn + k.drift * 0.55, -1.2, 1.2);
        if (Math.sign(turn) !== k.drift) turn = k.drift * 0.35;
        if (drv && game.t % 0.05 < dt) {
          const col = k.driftT > 1.5 ? 0xffa030 : k.driftT > 0.7 ? 0x5ac8ff : 0xffffff;
          for (const s of [-1, 1]) game.spawnParticle(k.x - Math.sin(k.yaw) * 1.0 + Math.cos(k.yaw) * s * 0.8, k.y + 0.2, k.z - Math.cos(k.yaw) * 1.0 - Math.sin(k.yaw) * s * 0.8, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, col, 0.16, 0.3);
        }
      }
    }
    const grip = k.grounded ? 1 : 0.35;
    k.yaw += turn * KP.TURN * clamp(Math.abs(k.speed) / 6, 0.3, 1) * (k.drift ? 1.5 : 1) * grip * dt;
    if (k.spin > 0) k.yaw += dt * 14;

    const prevY = k.y;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const slip = k.drift ? -k.drift * 0.25 : 0;
    const nx0 = k.x + (fx + Math.cos(k.yaw) * slip) * k.speed * dt, nz0 = k.z + (fz - Math.sin(k.yaw) * slip) * k.speed * dt;
    const next = { x: nx0, z: nz0 };
    if (S.heightAt(next.x, next.z) > k.y + 0.6) { next.x = k.x; next.z = k.z; k.speed *= 0.3; }
    if (Math.abs(k.speed) > 6) for (const cr of game.crates) if (!cr.broken && Math.hypot(cr.def.x - next.x, cr.def.z - next.z) < 1.9 && Math.abs(cr.def.y - k.y) < 1.2) game.breakCrate(cr);
    game.pushOut(next, k.y, KP.R);
    // autres karts, rivaux, voitures, kart de la Capitaine
    const push = (ox, oz, oy, rr, light) => {
      const dx = next.x - ox, dz = next.z - oz, d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4 && Math.abs(oy - k.y) < 1.4) { next.x = ox + dx / d * rr; next.z = oz + dz / d * rr; return light; }
      return null;
    };
    for (const o of karts) if (o !== k) { const l = push(o.x, o.z, o.y, KP.R * 2, o); if (l && l.driver < 0) { l.x -= Math.sin(Math.atan2(next.x - l.x, next.z - l.z)) * 0.05; } }
    for (const o of rivals) if (o !== k && o.on) push(o.x, o.z, o.y, KP.R * 2);
    for (const c of cars) { if (!c.on) continue; const hx = Math.sin(c.yaw) * c.len * 0.28, hz = Math.cos(c.yaw) * c.len * 0.28; push(c.x + hx, c.z + hz, c.y, KP.R + 1.1); push(c.x - hx, c.z - hz, c.y, KP.R + 1.1); }
    if (st.m && st.m.bs) push(st.m.bs.x, st.m.bs.z, st.m.bs.y, KP.R * 2);
    const cx = next.x - nx0, cz = next.z - nz0, corr = Math.hypot(cx, cz);
    if (corr > 0.01) {
      const head = -(cx * fx + cz * fz) / corr * Math.sign(k.speed || 1);
      if (head > 0.35) {
        if (drv && Math.abs(k.speed) > 9 && k.bumpT <= 0) { game.sound('bump'); game.burst(next.x + fx, k.y + 0.6, next.z + fz, 8, 0xffffff, 3, 0.35); k.bumpT = 0.4; }
        k.speed *= Math.max(0.2, 1 - head * 0.9);
      } else k.speed *= 0.985;
    }
    k.x = next.x; k.z = next.z;
    if (k.grounded) {
      const sup = game.support(k.x, k.z, k.y + 0.05);
      if (sup.y >= k.y - 0.5) {
        k.climb = k.climb * 0.5 + ((sup.y - prevY) / dt) * 0.5;
        k.y = sup.y; k.lastCol = sup.collider;
        if (sup.collider && sup.collider.bounce) { k.vy = sup.collider.bounce * 0.75; k.grounded = false; sup.collider.squashT = game.t; if (drv) game.sound('boing'); }
        if (sup.collider && sup.collider.dx !== undefined) { k.x += sup.collider.dx; }
      } else {
        k.grounded = false;
        k.vy = k.climb > 1 ? Math.min(8, k.climb * 0.9 + 1) : 0;
        if (drv && k.lastCol && k.lastCol.kind === 'ramp') { const si = S.STUNTS.find(q => S.ramps[q.ramp] === k.lastCol); k.stunt = si ? si.id : null; }
      }
    }
    if (!k.grounded) {
      k.vy -= KP.GRAV * dt;
      k.y += k.vy * dt;
      if (drv && k.stunt) checkStunt(drv, k);
      const sup = game.support(k.x, k.z, Math.max(prevY, k.y));
      if (k.y <= sup.y && k.vy <= 0) {
        if (drv && k.vy < -12) { game.burst(k.x, sup.y + 0.1, k.z, 10, 0xf0e0c0, 3, 0.4); game.sound('bump'); }
        k.y = sup.y; k.vy = 0; k.grounded = true; k.climb = 0; k.stunt = null;
        if (k.hopped && jumpHeld && Math.abs(turn) > 0.25 && k.speed > 8) { k.drift = Math.sign(turn); k.driftT = 0; }
        k.hopped = false;
      }
    }
    if (k.y < S.WATER_Y - 0.9) {
      game.burst(k.x, S.WATER_Y + 0.2, k.z, 20, 0x9ae0ff, 4, 0.6);
      game.sound('splash');
      if (k.def) { resetKart(k); game.banner('Plouf !', 'Le kart revient à sa place.', 1500); }
      else { k.y = G; k.speed = 0; }
      k.stunt = null;
    }
    if (drv && k.boost > 0 && game.t % 0.04 < dt) game.spawnParticle(k.x - fx * 1.5, k.y + 0.55, k.z - fz * 1.5, -fx * 3, 1, -fz * 3, 0x6ad0ff, 0.25, 0.25, 0);
    if (drv) {
      drv.pos.set(k.x, k.y, k.z);
      drv.vel.set(fx * k.speed, k.vy, fz * k.speed);
      drv.yaw = k.yaw; drv.grounded = k.grounded; drv.gliding = false;
      drv.attackT = 0; drv.dashT = 0;
      if (k.grounded && k.y > 0.4 && game.t - drv.lastSafeT > 0.4) { drv.lastSafe.set(k.x, k.y, k.z); drv.lastSafeT = game.t; }
    }
  }
  function checkStunt(P, k) {
    const s = S.STUNTS.find(q => q.id === k.stunt);
    if (!s || Math.hypot(k.x - s.x, k.z - s.z) > s.r) return;
    k.stunt = null;
    const c = city();
    game.sound('win');
    game.burst(k.x, k.y + 1, k.z, 24, 0xffd040, 5, 0.7);
    if (!c.stunts.includes(s.id)) {
      c.stunts.push(s.id);
      addCoins(25);
      game.banner('SAUT ACROBATIQUE !', `${s.name} · ${c.stunts.length}/${S.STUNTS.length} · +25 pièces`, 2600);
    } else game.banner('Beau saut !', s.name, 1400);
  }

  // --- Karts rivaux : ils suivent leur trajet à fond (avec un peu d'élastique) ----
  function placeRivals(n, path, start, back) {
    rivals.forEach((r, i) => {
      r.on = i < n; r.m.visible = r.rider.visible = r.on;
      if (!r.on) return;
      const row = Math.floor(i / 2) + 1, side = i % 2 ? 1 : -1;
      const fx = Math.sin(start.yaw), fz = Math.cos(start.yaw);
      r.x = start.x - fx * row * 4 * back + Math.cos(start.yaw) * side * 2.2; r.z = start.z - fz * row * 4 * back - Math.sin(start.yaw) * side * 2.2;
      r.y = game.support(r.x, r.z, G + 2).y; r.yaw = start.yaw; r.speed = 0; r.vy = 0; r.grounded = true; r.boost = 0; r.wp = 0; r.prog = 0; r.path = path; r.done = false;
    });
  }
  function stepRivals(dt, leaderProg) {
    for (const r of rivals) {
      if (!r.on || r.done) { if (r.on) r.speed *= 0.95; continue; }
      const p = r.path[r.wp % r.path.length];
      const dx = p.x - r.x, dz = p.z - r.z, d = Math.hypot(dx, dz);
      if (d < 7) { r.wp++; r.prog = r.wp; if (r.wp >= r.path.length) { r.done = true; continue; } }
      // élastique : moins vite s'ils sont loin devant le meilleur joueur, plus vite derrière
      const gap = r.prog - leaderProg;
      r.maxK = clamp(r.skill - gap * 0.04, 0.72, 1.06);
      const pr = new Set();
      if (Math.random() < dt * 0.15 && gap < 1) pr.add('dash');
      driveKart(null, r, dx / (d || 1), dz / (d || 1), false, pr, dt);
    }
  }

  // --- Circulation ------------------------------------------------------------------
  function stepCars(dt) {
    for (const c of cars) {
      c.ghost = Math.max(0, c.ghost - dt);
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      let block = false, byPlayer = null;
      const ahead = (x, z, y) => { const dx = x - c.x, dz = z - c.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); return along > 0 && along < c.len / 2 + 5 && side < 2.2 && Math.abs(y - c.y) < 2.5; };
      for (const P of players()) if (ahead(P.pos.x, P.pos.z, P.pos.y)) { block = true; byPlayer = P; }
      if (!block && c.ghost <= 0) {
        for (const o of cars) if (o !== c && ahead(o.x, o.z, o.y)) { block = true; break; }
        for (const k of karts) if (k.driver < 0 && ahead(k.x, k.z, k.y)) { block = true; break; }
      }
      if (block) { c.v = Math.max(0, c.v - 30 * dt); c.wait += dt; if (c.wait > 3 && !byPlayer) { c.ghost = 2; c.wait = 0; } }
      else { c.v = Math.min(c.speed, c.v + 6 * dt); c.wait = 0; }
      if (byPlayer && c.wait > 1.2 && game.t - c.honkT > 3) { c.honkT = game.t; if (Math.hypot(byPlayer.pos.x - c.x, byPlayer.pos.z - c.z) < 30) game.sound('horn'); }
      c.s += c.v * dt;
      const p = carAt(c, c.s);
      c.x = p.x; c.z = p.z; c.yaw = lerpAngle(c.yaw, p.yaw, Math.min(1, dt * 6));
      c.y = game.support(c.x, c.z, c.y + 0.7).y;
    }
  }
  function stepWalkers(dt) {
    for (const w of walkers) {
      w.s += w.speed * w.dir * dt; w.ph += dt * w.speed * 6;
      const s = ((w.s % w.total) + w.total) % w.total;
      let seg = w.segs[0];
      for (const q of w.segs) if (s >= q.s0) seg = q;
      const t = (s - seg.s0) / seg.l;
      w.x = seg.a[0] + (seg.b[0] - seg.a[0]) * t; w.z = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
      w.yaw = Math.atan2((seg.b[0] - seg.a[0]) * w.dir, (seg.b[1] - seg.a[1]) * w.dir);
    }
  }

  // =============================================================================
  // Missions
  // =============================================================================
  const lapPath = (laps) => { const pts = []; for (let l = 0; l < laps; l++) for (let i = 1; i <= S.TRACK.length; i += 4) pts.push(S.TRACK[(4 + i) % S.TRACK.length]); return pts; };
  function start(id, P) {
    const m = { id, ph: 'run', t: -1, by: P ? P.id : 0 };
    if (id === 'delivery') { m.t = S.DELIVERY.time; m.done = []; }
    if (id === 'race') { m.ph = 'ready'; m.prog = {}; m.path = S.RACE.cps.slice(1); placeRivals(S.RACE.rivals, m.path, S.RACE.start, 1); }
    if (id === 'champion') { m.ph = 'ready'; m.prog = {}; m.path = lapPath(S.CHAMPION.laps); const a = S.TRACK[4], b = S.TRACK[5]; placeRivals(S.CHAMPION.rivals, m.path, { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }, 1); }
    if (id === 'downhill') { m.ph = 'ready'; m.t = S.DOWNHILL.time; m.prog = {}; }
    if (id === 'thief') { const r0 = S.THIEF.route[0]; m.th = { x: r0.x, y: G, z: r0.z, yaw: Math.PI, seg: 1, anim: 0 }; }
    if (id === 'kitten') { m.kt = { x: S.KITTEN.x, y: S.KITTEN.y, z: S.KITTEN.z, carrier: -1 }; }
    if (id === 'smuggle') { m.t = S.SMUGGLE.time; m.done = []; }
    if (id === 'balloons') { m.t = S.BALLOONS.time; m.done = []; }
    if (id === 'treasure') { m.done = []; m.found = 0; }
    if (id === 'taxi') {
      const here = { x: P.pos.x, z: P.pos.z };
      const far = S.TAXI.places.filter(p => Math.hypot(p.x - here.x, p.z - here.z) > 90);
      const dest = far[Math.floor(Math.random() * far.length)] || S.TAXI.places[1];
      m.dest = { x: dest.x, z: dest.z, label: dest.label };
      m.t = Math.round(Math.hypot(dest.x - here.x, dest.z - here.z) / 9 + 25);
      m.driver = P.id;
    }
    if (id === 'boss') {
      m.ph = 'gang';
      for (const c of game.cats) if (c.def.group === 'gang') { c.dead = false; c.mesh.visible = true; c.pos.set(c.def.x, c.def.y, c.def.z); c.home.copy(c.pos); c.stun = 1; game.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 8, 0xd8d8e8, 2.5, 0.4); }
    }
    st.m = m;
    game.sound('reveal');
    game.banner(missionDef(id).title, objective(), 2600);
    game.updateHud();
  }
  function stop() {
    st.m = null;
    for (const r of rivals) { r.on = false; r.m.visible = r.rider.visible = false; }
    game.updateHud();
  }
  function success(id, sub) {
    const md = medalOf(id), def = missionDef(id);
    const first = md && !md.taken;
    stop();
    if (first && def.reward) addCoins(def.reward);
    if (first && id !== 'taxi') game.takeMedal(md);
    else { game.sound('win'); game.banner('Mission réussie !', sub || '', 2800); }
  }
  function fail(why) {
    const id = st.m.id;
    stop();
    game.sound('poof');
    game.banner('Mission ratée…', `${why} Retourne voir ${S.GIVERS[id].short} pour réessayer.`, 3400);
  }
  const gangLeft = () => game.cats.filter(c => c.def.group === 'gang' && !c.dead).length;
  /** Classement d'une course : 1 + nombre de concurrents devant moi. */
  function place(m, pid) {
    const mine = (m.prog[pid] || 0);
    let ahead = 0;
    for (const r of rivals) if (r.on && (r.done || r.prog > mine)) ahead++;
    for (const P of players()) if (P.id !== pid && (m.prog[P.id] || 0) > mine) ahead++;
    return ahead + 1;
  }
  function objective(forId) {
    const m = st.m;
    if (!m) return '';
    const me = forId === undefined ? game.me.id : forId;
    switch (m.id) {
      case 'delivery': return `Colis ${m.done.length}/${S.DELIVERY.drops.length} · ${S.DELIVERY.drops.filter(d => !m.done.includes(d.id)).map(d => d.short).join(', ')}`;
      case 'race': case 'champion': {
        if (m.ph === 'ready') return m.id === 'race' ? 'En kart, va sur la ligne de départ du garage' : 'En kart, place-toi sur la ligne de départ';
        if (m.ph === 'count') return 'Attention au départ…';
        const n = rivals.filter(r => r.on).length + players().length;
        const lap = m.id === 'champion' ? ` · tour ${Math.min(S.CHAMPION.laps, 1 + Math.floor((m.prog[me] || 0) / (m.path.length / S.CHAMPION.laps)))}/${S.CHAMPION.laps}` : '';
        return `Position ${place(m, me)}/${n}${lap}`;
      }
      case 'downhill': return m.ph === 'ready' ? 'En kart, va devant l\'observatoire' : m.ph === 'count' ? 'Attention…' : 'Descends jusqu\'au port en passant les balises !';
      case 'thief': return 'Rattrape Filou avant qu\'il monte sur le cargo !';
      case 'posters': return `Affiches arrachées : ${city().posters.length}/${S.POSTERS.length}`;
      case 'kitten': return m.kt.carrier >= 0 ? 'Ramène le chaton à Madame Persane' : 'Le chaton est en haut du château d\'eau !';
      case 'smuggle': return `Caisses dorées : ${m.done.length}/${S.SMUGGLE.crates.length}`;
      case 'balloons': return `Ballons éclatés : ${m.done.length}/${S.BALLOONS.list.length}`;
      case 'treasure': return `Morceaux de carte : ${m.found}/3 · creuse sur les croix (coup de queue)`;
      case 'taxi': return `Conduis le passager à ${m.dest.label}`;
      case 'boss': return m.ph === 'gang' ? `Chasse le gang des docks (${gangLeft()} chats)` : `Fonce dans le kart de la Capitaine ! (${m.bs ? m.bs.hp : S.BOSS.hp} coups)`;
    }
    return '';
  }
  function countdown(m, dt, path) {
    if (m.ph === 'count') {
      m.cd -= dt;
      const n = Math.ceil(m.cd);
      if (n < m.shown && n > 0) { m.shown = n; game.banner(String(n), 'Prêts ?', 800); game.sound('cp'); }
      if (m.cd <= 0) { m.ph = 'run'; m.prog = {}; m.lock = null; m.t0 = game.t; game.banner('PARTEZ !', '', 1200); game.sound('reveal'); }
      return true;
    }
    void path;
    return false;
  }
  function raceStep(m, dt, startPt, r) {
    if (m.ph === 'ready') {
      if (players().some(p => p.kart && distXZ(p.pos, startPt.x, startPt.z) < r + 2)) {
        m.ph = 'count'; m.cd = 3.2; m.shown = 4;
        m.lock = players().filter(p => p.kart).map(p => p.id).concat(rivals.map(q => 'r' + q.i));
        // les joueurs en kart se placent sur la ligne
        players().filter(p => p.kart).forEach((p, i) => {
          const k = p.kart, yaw = m.id === 'champion' ? Math.atan2(S.TRACK[5].x - S.TRACK[4].x, S.TRACK[5].z - S.TRACK[4].z) : startPt.yaw;
          k.x = startPt.x + Math.cos(yaw) * (i - (players().length - 1) / 2) * 2.6; k.z = startPt.z - Math.sin(yaw) * (i - (players().length - 1) / 2) * 2.6;
          k.yaw = yaw; k.speed = 0; p.pos.set(k.x, k.y, k.z); p.yaw = yaw;
        });
      }
      return;
    }
    if (countdown(m, dt)) return;
    const lead = Math.max(0, ...players().map(p => m.prog[p.id] || 0));
    if (m.id !== 'downhill') stepRivals(dt, lead);
    const path = m.id === 'downhill' ? S.DOWNHILL.cps : m.path;
    for (const p of players()) {
      const i = m.prog[p.id] || 0, cp = path[i];
      if (!cp) continue;
      if (distXZ(p.pos, cp.x, cp.z) < (m.id === 'champion' ? 9 : r)) {
        m.prog[p.id] = i + 1;
        if (p === game.me || game.party.size === 1) game.sound('cp');
        if (i + 1 >= path.length) {
          const time = game.t - m.t0, pl = place(m, p.id);
          const c = city(), key = m.id, rec = !c.best[key] || time < c.best[key];
          if (m.id !== 'downhill' && pl > 1) { fail(`${p.name} arrive ${pl}e… Il faut gagner !`); return; }
          if (rec) c.best[key] = Math.round(time * 10) / 10;
          game.persist();
          const who = game.party.size > 1 ? `${p.name} gagne !` : 'Victoire !';
          success(m.id, `${who} ${fmtTime(time)}${rec ? ' · record !' : ''}`);
          if (owned(m.id)) game.banner(who, `Temps : ${time.toFixed(1)} s${rec ? ' · nouveau record !' : ''}`, 3000);
          return;
        }
      }
    }
    if (m.id !== 'downhill') {
      const winner = rivals.find(q => q.on && q.done);
      if (winner) fail(`${winner.name} a gagné la course !`);
    }
  }

  function stepMission(dt) {
    const m = st.m;
    if (!m) return;
    if (m.t > 0 && m.ph === 'run') {
      m.t -= dt;
      if (m.t <= 0) { fail(m.id === 'delivery' ? 'Trop tard, les croissants sont froids !' : m.id === 'taxi' ? 'Le passager est descendu, il était pressé !' : 'Le temps est écoulé !'); return; }
    }
    const touch = (x, y, z, r, needAttack) => players().find(p => distXZ(p.pos, x, z) < r && Math.abs(p.pos.y + 0.6 - y) < 2.2 && (!needAttack || p.attackT > 0 || p.dashT > 0));
    switch (m.id) {
      case 'delivery':
        for (const d of S.DELIVERY.drops) {
          if (m.done.includes(d.id)) continue;
          const who = players().find(p => distXZ(p.pos, d.x, d.z) < 3.2 && Math.abs(p.pos.y - d.y) < 3);
          if (!who) continue;
          m.done.push(d.id);
          game.sound('cp'); game.burst(d.x, who.pos.y + 1.5, d.z, 18, 0xffe070, 4, 0.6);
          if (m.done.length >= S.DELIVERY.drops.length) { success('delivery', 'Tous les colis sont livrés !'); return; }
          game.banner(`Colis livré à ${d.label} !`, `${m.done.length}/${S.DELIVERY.drops.length}${game.party.size > 1 ? ' · par ' + who.name : ''}`, 1800);
        }
        break;
      case 'race': raceStep(m, dt, S.RACE.start, S.RACE.r); break;
      case 'champion': raceStep(m, dt, Object.assign({}, S.TRACK[4]), 9); break;
      case 'downhill': raceStep(m, dt, Object.assign({ yaw: 0 }, S.DOWNHILL.start), S.DOWNHILL.r); break;
      case 'thief': {
        const th = m.th, route = S.THIEF.route;
        th.anim += dt;
        const tgt = route[th.seg];
        const dx = tgt.x - th.x, dz = tgt.z - th.z, d = Math.hypot(dx, dz);
        const spd = nearestDist(th.x, th.z) < 28 ? S.THIEF.speed : 6.5;
        if (d < spd * dt + 0.1) { th.seg++; if (th.seg >= route.length) { fail('Filou s\'est caché sur le cargo !'); return; } }
        else { th.x += dx / d * spd * dt; th.z += dz / d * spd * dt; th.yaw = lerpAngle(th.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
        th.y = game.support(th.x, th.z, th.y + 0.6).y;
        for (const p of players()) {
          const pd = distXZ(p.pos, th.x, th.z), dy = p.pos.y - th.y;
          const hit = p.kart ? (Math.abs(p.kart.speed) > 4 && pd < 2.4) : ((pd < 1.9 && (p.attackT > 0 || p.dashT > 0) && Math.abs(dy) < 1.6) || (pd < 1.4 && p.vel.y < -1 && dy > 0.4));
          if (hit) {
            game.burst(th.x, th.y + 0.8, th.z, 24, 0xffffff, 4, 0.6);
            game.sound('meow'); game.sound('poof');
            game.say([
              { who: 'Filou', text: 'Miaou ! D\'accord, d\'accord, je rends tout !' },
              { who: S.GIVERS.thief.name, text: 'Beau travail ! Direction le commissariat, Filou.' },
            ]);
            success('thief', 'Filou est attrapé !');
            return;
          }
        }
        break;
      }
      case 'kitten': {
        const kt = m.kt;
        if (kt.carrier < 0) {
          const p = touch(kt.x, kt.y + 0.4, kt.z, 2.4);
          if (p) { kt.carrier = p.id; game.sound('meowHi'); game.banner('Le chaton te suit !', 'Ramène-le à Madame Persane, dans les collines.', 2400); game.updateHud(); }
        } else {
          const P = game.party.get(kt.carrier) || game.player;
          const tx = P.pos.x - Math.sin(P.yaw) * 1.3, tz = P.pos.z - Math.cos(P.yaw) * 1.3;
          kt.x += (tx - kt.x) * Math.min(1, dt * 6); kt.z += (tz - kt.z) * Math.min(1, dt * 6);
          kt.y += ((P.kart ? P.pos.y + 0.9 : P.pos.y) - kt.y) * Math.min(1, dt * 8);
          const home = S.KITTEN.home;
          if (distXZ(P.pos, home.x, home.z) < 5) {
            game.say([
              { who: S.GIVERS.kitten.name, text: 'Pompon ! Mon petit chaton ! Il était perché là-haut depuis ce matin…' },
              { who: S.GIVERS.kitten.name, text: 'Merci, mes héros ! Tenez, vous l\'avez bien mérité.' },
            ]);
            success('kitten', 'Pompon est rentré chez lui !');
          }
        }
        break;
      }
      case 'smuggle':
        for (const c of goldCrates) {
          if (m.done.includes(c.def.id)) continue;
          const p = touch(c.def.x, c.def.y + 0.6, c.def.z, 2.0);
          if (!p) continue;
          m.done.push(c.def.id);
          game.sound('crate'); game.burst(c.def.x, c.def.y + 0.8, c.def.z, 20, 0xffd040, 4, 0.6);
          if (m.done.length >= S.SMUGGLE.crates.length) { success('smuggle', 'La contrebande est saisie !'); return; }
          game.banner(`Caisse dorée ! (${m.done.length}/${S.SMUGGLE.crates.length})`, '', 1400);
        }
        break;
      case 'balloons':
        for (const b of balloons) {
          if (m.done.includes(b.def.id)) continue;
          const p = touch(b.def.x, b.def.y, b.def.z, 1.7);
          if (!p) continue;
          m.done.push(b.def.id);
          game.sound('poof'); game.burst(b.def.x, b.def.y, b.def.z, 16, balloonCols[S.BALLOONS.list.indexOf(b.def) % 6], 4, 0.5);
          if (m.done.length >= S.BALLOONS.list.length) {
            const time = S.BALLOONS.time - m.t, c = city(), rec = !c.best.balloons || time < c.best.balloons;
            if (rec) c.best.balloons = Math.round(time * 10) / 10;
            success('balloons', `Tous les ballons en ${fmtTime(time)}${rec ? ' · record !' : ''}`); return;
          }
        }
        break;
      case 'treasure':
        for (const s of digSpots) {
          if (m.done.includes(s.def.id)) continue;
          const p = players().find(q => q.attackT > 0 && distXZ(q.pos, s.def.x, s.def.z) < 2.2);
          if (!p) continue;
          m.done.push(s.def.id);
          game.burst(s.def.x, s.def.y + 0.4, s.def.z, 16, 0xe0c080, 3, 0.5);
          if (s.def.gold) {
            m.found++; game.sound('reveal');
            if (m.found >= 3) { success('treasure', 'Le trésor de Vieux Loup est retrouvé !'); return; }
            game.banner(`Un morceau de carte ! (${m.found}/3)`, '', 1800);
          } else {
            game.sound('crate');
            const left = digSpots.filter(q => q.def.gold && !m.done.includes(q.def.id));
            const dmin = Math.min(...left.map(q => distXZ(q.def, s.def.x, s.def.z)));
            game.banner('Rien ici…', dmin < 30 ? 'Ça chauffe ! Un trésor est tout près.' : dmin < 60 ? 'Tiède… Cherche un peu plus loin.' : 'Froid, froid ! Le trésor est loin d\'ici.', 2000);
          }
        }
        break;
      case 'taxi': {
        const P = game.party.get(m.driver);
        if (!P) { stop(); return; }
        if (distXZ(P.pos, m.dest.x, m.dest.z) < 7) {
          const c = city(), pay = 10 + Math.max(0, Math.round(m.t / 2));
          c.fares = (c.fares | 0) + 1;
          addCoins(pay);
          game.sound('cp');
          if (c.fares >= S.TAXI.fares && !owned('taxi')) { stop(); game.takeMedal(medalOf('taxi')); game.banner('TROPHÉE !', `Taxi d'or : ${c.fares} courses · +${pay} pièces`, 3000); }
          else { stop(); game.banner(`Course terminée : +${pay} pièces`, `Courses : ${c.fares}${owned('taxi') ? '' : '/' + S.TAXI.fares}`, 2600); }
        }
        break;
      }
      case 'boss':
        if (m.ph === 'gang') {
          if (gangLeft() === 0) {
            const s0 = S.BOSS.start;
            m.ph = 'chase';
            m.bs = { x: s0.x, y: G, z: s0.z, yaw: s0.yaw, seg: 0, hp: S.BOSS.hp, spin: 0, speed: 0 };
            game.say([
              { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Mon gang a filé ? Pas grave : personne ne rattrape mon bolide !' },
              { who: 'Mamie Labrador', text: 'Vite, en kart ! Foncez-lui dedans trois fois !' },
            ]);
            game.updateHud();
          }
        } else if (m.ph === 'chase') {
          const b = m.bs;
          if (b.spin > 0) { b.spin -= dt; b.yaw += dt * 12; b.speed = 0; }
          else {
            const tgt = S.BOSS.route[b.seg];
            const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
            const want = nearestDist(b.x, b.z) > 50 ? 9 : S.BOSS.speed + (S.BOSS.hp - b.hp) * 1.5;
            b.speed += clamp(want - b.speed, -20 * dt, 10 * dt);
            if (d < 4) b.seg = (b.seg + 1) % S.BOSS.route.length;
            b.yaw = lerpAngle(b.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4));
            b.x += Math.sin(b.yaw) * b.speed * dt; b.z += Math.cos(b.yaw) * b.speed * dt;
          }
          b.y = game.support(b.x, b.z, b.y + 0.6).y;
          for (const p of players()) {
            if (b.spin > 0) break;
            const pd = distXZ(p.pos, b.x, b.z);
            const hit = p.kart ? (Math.abs(p.kart.speed) > 5 && pd < 2.7) : (pd < 2.3 && (p.attackT > 0 || p.dashT > 0));
            if (hit) {
              b.hp--; b.spin = 1.8;
              game.sound('bossHit'); game.burst(b.x, b.y + 1.2, b.z, 22, 0xffffff, 5, 0.7);
              if (p.kart) p.kart.speed *= 0.4;
              if (b.hp <= 0) {
                m.ph = 'down'; b.spin = 99;
                game.say([
                  { who: 'Capitaine Moustache', text: 'Grrr ! Mon beau bolide tout cabossé…' },
                  { who: 'Capitaine Moustache', text: 'Vous avez gagné, les cabots ! Je quitte Port-Croquette… pour de bon !' },
                  { who: 'Mamie Labrador', text: 'Bravo ! Toute la ville vous dit merci !' },
                ], () => success('boss'));
              } else game.banner(b.hp === 2 ? 'Bien joué !' : 'Encore une fois !', `Il reste ${b.hp} coup${b.hp > 1 ? 's' : ''}`, 1400);
              game.updateHud();
              break;
            }
            if (!p.kart && b.speed > 6 && pd < 1.6 && Math.abs(p.pos.y - b.y) < 1.5) game.hurtPlayer({ x: b.x, z: b.z }, p);
          }
        }
        break;
    }
  }
  function stepPosters() {
    const c = city();
    for (const ps of posters) {
      if (c.posters.includes(ps.def.id)) continue;
      const p = players().find(q => q.attackT > 0 && distXZ(q.pos, ps.def.x, ps.def.z) < 2.6 && Math.abs(q.pos.y - ps.def.y) < 2.2);
      if (!p) continue;
      c.posters.push(ps.def.id);
      game.persist();
      game.sound('crate');
      game.burst(ps.def.x, ps.def.y + 2, ps.def.z, 18, 0xf4e4c0, 4, 0.6);
      refreshPosters();
      const n = c.posters.length, N = S.POSTERS.length;
      if (n >= N && !owned('posters')) { if (st.m && st.m.id === 'posters') stop(); success('posters', 'La ville est toute propre !'); }
      else game.banner(`Affiche arrachée ! (${n}/${N})`, n === 1 && !(st.m && st.m.id === 'posters') ? 'Madame la Maire sera contente…' : '', 1500);
      game.updateHud();
    }
  }
  function refreshPosters() { const c = city(); for (const ps of posters) ps.g.visible = !c.posters.includes(ps.def.id) && !owned('posters'); }

  // =============================================================================
  // Dialogues des habitants
  // =============================================================================
  function talkGiver(id, P) {
    const g = S.GIVERS[id], s = save(), k = game.controlsHelp();
    if (!s.intro) { game.say([{ who: g.name, text: 'Bonjour ! Allez d\'abord dire bonjour à Mamie Labrador, sur la place de la Fontaine.' }]); return; }
    if (id === 'shop') { openShop(P); return; }
    if (st.m && st.m.id === id) { game.say([{ who: g.name, text: objective(P.id) }]); return; }
    if (st.m) { game.say([{ who: g.name, text: `Finissez d'abord « ${missionDef(st.m.id).title} », on verra après !` }]); return; }
    const best = city().best;
    const say = (lines) => game.say(lines.map(t => ({ who: g.name, text: t })), () => start(id, P));
    const thanks = (t) => game.say([{ who: g.name, text: t }]);
    switch (id) {
      case 'delivery':
        if (owned(id)) return thanks('Mes clients n\'ont jamais été livrés aussi vite ! La maison vous offre le croissant.');
        return say(['Ah, vous tombez bien ! Mon livreur est malade et j\'ai trois commandes urgentes.', 'Une pour la villa des Collines, une pour le gardien du phare et une pour la fête foraine.', `Vous avez ${S.DELIVERY.time / 60} minutes. Prenez un kart, la ville est grande !`]);
      case 'race':
        return say([owned(id) ? `Une revanche ? Le record est de ${best.race ? best.race.toFixed(1) + ' s' : '…'}.` : 'Salut ! C\'est moi qui prête les karts. Mais d\'abord, montrez-moi ce que vous valez !', 'Le Grand Prix : un tour de la ville contre mes trois meilleurs pilotes. Il faut finir premier !', `Astuce : ${k.dash} pour le turbo, et sautez en tournant (${k.jump} maintenu) pour déraper. Un long dérapage donne un turbo !`]);
      case 'thief':
        if (owned(id)) return thanks('Filou est au frais. Port-Croquette dort sur ses deux oreilles grâce à vous !');
        return say(['Alerte ! Filou, le pickpocket du gang, vient de s\'échapper avec un sac de croquettes volées !', 'Il file vers les docks pour se cacher sur le cargo. Rattrapez-le avant !']);
      case 'posters': {
        if (owned(id)) return thanks('Merci encore ! Notre belle ville est toute propre.');
        const n = city().posters.length;
        return say(['Quelle honte ! La Capitaine Moustache a collé ses affiches partout dans la ville.', `Il y en a ${S.POSTERS.length} : en haut de la Tour Croquette, du phare, d'une grue, de l'observatoire… Arrachez-les d'un coup de queue (${k.attack}) !`, ...(n ? [`Vous en avez déjà arraché ${n}, bravo !`] : [])]);
      }
      case 'kitten':
        if (owned(id)) return thanks('Pompon ne grimpe plus nulle part, promis. Enfin… presque.');
        return say(['Au secours ! Mon chaton Pompon est monté tout en haut du château d\'eau et il n\'ose plus descendre !', 'Le château d\'eau est un peu plus haut dans les collines, à l\'ouest. Ramenez-le-moi, je vous en prie !']);
      case 'smuggle':
        if (owned(id)) return thanks('Les docks sont propres, moussaillons. Bon vent !');
        return say(['Mille sabords ! Le gang a caché cinq caisses dorées de contrebande dans les docks.', 'Entre les conteneurs, sur les grues, sur le cargo… Trouvez-les toutes en 3 minutes avant qu\'ils les emportent !']);
      case 'balloons':
        return say([owned(id) ? `On recommence ? Le record est de ${best.balloons ? best.balloons.toFixed(1) + ' s' : '…'}.` : 'Approchez, approchez ! Le grand jeu des ballons de la foire !', `Éclatez les ${S.BALLOONS.list.length} ballons en 2 minutes. Les trampolines bleus font sauter très haut… et il y en a un tout en haut de la grande roue !`]);
      case 'champion':
        return say([owned(id) ? `Prêts pour une revanche ? Le record est de ${best.champion ? best.champion.toFixed(1) + ' s' : '…'}.` : 'Bienvenue au stade ! Le championnat va commencer.', `${S.CHAMPION.laps} tours de circuit contre ${S.CHAMPION.rivals} pilotes. Seul le premier gagne le trophée !`]);
      case 'treasure':
        if (owned(id)) return thanks('Ha ! Ce trésor m\'aura fait courir toute ma vie. Merci, matelots !');
        return say(['Arrr… J\'ai enterré ma carte au trésor sur la plage il y a bien longtemps, en trois morceaux.', `J'ai marqué des croix dans le sable. Creusez d'un coup de queue (${k.attack}) : certaines cachent un morceau, d'autres rien du tout !`]);
      case 'downhill':
        return say([owned(id) ? `Encore une descente ? Le record est de ${best.downhill ? best.downhill.toFixed(1) + ' s' : '…'}.` : 'Ah, des visiteurs ! D\'ici, on voit toute la ville… et la plus belle descente du pays.', `Descendez jusqu'au port en moins de ${S.DOWNHILL.time} secondes, en kart, en passant toutes les balises. Accrochez-vous !`]);
      case 'taxi':
        if (!P.kart) return thanks('Un taxi sans voiture, ça ne va pas loin ! Prenez un kart et revenez me voir.');
        return game.say([{ who: g.name, text: `Un client vous attend ! Emmenez-le vite à destination : plus vous êtes rapide, plus il paie.${owned(id) ? '' : ` Faites ${S.TAXI.fares} courses pour gagner le trophée du Taxi d'or !`}` }], () => start(id, P));
    }
  }

  // =============================================================================
  // Boutique de Mimi
  // =============================================================================
  const shopEl = document.createElement('div');
  shopEl.className = 'adv-shop hidden';
  game.dom.root.appendChild(shopEl);
  function styleOf(P) { const c = city(); return c.style[P.name || 'Moi'] || {}; }
  function openShop(P) {
    st.shopOpen = true; st.shopFor = P.id;
    renderShop();
  }
  function closeShop() { st.shopOpen = false; shopEl.classList.add('hidden'); }
  function renderShop() {
    if (!st.shopOpen) return;
    const c = city(), me = game.me, my = styleOf(me);
    const rows = S.SHOP_ITEMS.map(it => {
      const has = c.owned.includes(it.id);
      const worn = (it.kind === 'hat' && my.hat === it.id) || (it.kind === 'paint' && my.paint === it.id);
      const btn = !has ? `<button data-buy="${it.id}" ${c.coins < it.price ? 'disabled' : ''}>${it.price} €</button>`
        : it.kind === 'turbo' ? '<span class="ok">✓ installé</span>'
          : `<button data-wear="${it.id}" class="${worn ? 'on' : ''}">${worn ? 'Enlever' : 'Mettre'}</button>`;
      return `<div class="row"><span>${it.name}</span>${btn}</div>`;
    }).join('');
    shopEl.innerHTML = `<div class="adv-panel"><h2>Chez Mimi</h2><div class="adv-stats">Porte-monnaie de la ville : <b>${c.coins} pièces</b></div><div class="shop-list">${rows}</div><button class="btn ghost" data-close>Fermer</button></div>`;
    shopEl.classList.remove('hidden');
    shopEl.querySelector('[data-close]').onclick = () => closeShop();
    for (const b of shopEl.querySelectorAll('[data-buy]')) b.onclick = () => shopAction('buy', b.dataset.buy);
    for (const b of shopEl.querySelectorAll('[data-wear]')) b.onclick = () => shopAction('wear', b.dataset.wear);
  }
  function shopAction(a, id) {
    if (game.sfx) game.sfx.click();
    if (game.guest) { game.coop.link.send({ t: 'lv', a, id }); setTimeout(renderShop, 400); return; }
    applyShop(game.me, a, id);
    renderShop();
  }
  function applyShop(P, a, id) {
    const c = city(), it = S.SHOP_ITEMS.find(q => q.id === id);
    if (!it || !P) return;
    if (a === 'buy' && !c.owned.includes(id) && c.coins >= it.price) {
      c.coins -= it.price; c.owned.push(id);
      if (it.kind !== 'turbo') applyShop(P, 'wear', id);
      game.sound('win'); game.banner(`${it.name} !`, it.kind === 'turbo' ? 'Le turbo de tous les karts dure plus longtemps.' : 'Acheté et porté', 2000);
    } else if (a === 'wear' && c.owned.includes(id)) {
      const key = P.name || 'Moi', s = c.style[key] || (c.style[key] = {});
      const slot = it.kind === 'hat' ? 'hat' : 'paint';
      s[slot] = s[slot] === id ? null : id;
    }
    game.persist();
  }

  // Chapeaux et peinture des joueurs (d'après la sauvegarde)
  function dressPlayers() {
    for (const P of players()) {
      if (!P.mesh) continue;
      const hatId = styleOf(P).hat || null;
      const key = hatId + '|' + P.mesh.uuid;
      if (P.hatKey === key) continue;
      if (P.hatMesh) { P.hatMesh.parent && P.hatMesh.parent.remove(P.hatMesh); P.hatMesh = null; }
      P.hatKey = key;
      if (!hatId) continue;
      const u = P.mesh.userData, kind = u.ainu ? 'duo' : P.kind === 'matcha' ? 'matcha' : (P.kind === 'giorgio' || P.kind === 'django') ? 'pug' : 'yorkie';
      const anchor = u.ainu ? u.headFace : u.mheadFace;
      if (!anchor) continue;
      const h = K.buildShopHat(hatId), o = HAT_AT[kind];
      h.position.set(o[0], o[1], o[2]); h.scale.setScalar(o[3]);
      anchor.add(h); P.hatMesh = h;
    }
  }

  // =============================================================================
  // Interface avec le moteur
  // =============================================================================
  const logic = {
    moving, chars,
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      const k = P.kart;
      if (!k) return false;
      P.invuln = Math.max(0, P.invuln - dt);
      P.cheerT = Math.max(0, P.cheerT - dt);
      P.flipT = 0;
      if (pr.has('talk') && !game.dialog && game.freeze <= 0) {
        pr.delete('talk');
        // en kart près de Fernand : on prend un client ; sinon on descend
        const n = P.nearby;
        if (k.plane) exitPlane(P);
        else if (n && n.act === 'giver') talkGiver(n.id, P); else exitKart(P);
        return true;
      }
      if (k.plane) flyPlane(P, k, wx, wz, jumpHeld, pr, dt);
      else driveKart(P, k, wx, wz, jumpHeld, pr, dt);
      return true;
    },
    nearFor(Q) {
      if (!Q.kart) return undefined;
      if (Q.kart.plane) return Q.kart.grounded ? { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y } : null;
      const tx = S.GIVERS.taxi;
      if (distXZ(Q.pos, tx.x, tx.z) < 6 && !(st.m && st.m.id === 'taxi')) return { kind: 'lv', act: 'giver', id: 'taxi', label: 'TAXI', x: tx.x, z: tx.z, y: tx.y };
      return { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
    },
    extraCandidates() {
      const out = [];
      for (const k of karts) if (k.driver < 0) out.push({ kind: 'lv', act: 'kart', k: k.i, label: 'MONTER', x: k.x, z: k.z, y: k.y });
      for (const k of planes) if (k.driver < 0) out.push({ kind: 'lv', act: 'plane', k: k.i, label: 'PILOTER', x: k.x, z: k.z, y: k.y });
      for (const id in citizens) { const g = S.GIVERS[id]; out.push({ kind: 'lv', act: 'giver', id, label: id === 'shop' ? 'BOUTIQUE' : 'PARLER', x: g.x, z: g.z, y: g.y }); }
      return out;
    },
    interact(n, P) {
      if (n.act === 'kart') enterKart(P, karts[n.k]);
      else if (n.act === 'plane') enterPlane(P, planes[n.k]);
      else if (n.act === 'exit') { if (P.kart && P.kart.plane) exitPlane(P); else exitKart(P); }
      else if (n.act === 'giver') talkGiver(n.id, P);
    },
    /** Message d'un invité (boutique). */
    remote(P, m) {
      if (m.a === 'buy' || m.a === 'wear') applyShop(P, m.a, m.id);
    },
    onCoin() { city().coins = (city().coins | 0) + 1; },
    step(dt) {
      S.updateWheel(game.t);
      for (const k of karts) {
        if (k.driver >= 0 && !game.party.has(k.driver)) k.driver = -1;
        if (k.driver >= 0) continue;
        if (Math.abs(k.speed) > 0.01 || !k.grounded) {
          k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 20 * dt);
          k.x += Math.sin(k.yaw) * k.speed * dt; k.z += Math.cos(k.yaw) * k.speed * dt;
          const sup = game.support(k.x, k.z, k.y + 0.3);
          if (k.y > sup.y + 0.05) { k.vy -= KP.GRAV * dt; k.y = Math.max(sup.y, k.y + k.vy * dt); } else { k.y = sup.y; k.vy = 0; k.grounded = true; }
          if (k.y < -0.9) resetKart(k);
        }
      }
      for (const k of planes) {
        if (k.driver >= 0 && !game.party.has(k.driver)) { k.driver = -1; if (!k.grounded) resetPlane(k); }
        if (k.driver >= 0) continue;
        if (!k.grounded) resetPlane(k);
        else if (k.speed > 0.01) { k.speed = Math.max(0, k.speed - 12 * dt); k.x += Math.sin(k.yaw) * k.speed * dt; k.z += Math.cos(k.yaw) * k.speed * dt; }
      }
      stepCars(dt);
      stepMission(dt);
      stepPosters();
    },
    questText() {
      const s = save();
      if (st.m) return missionDef(st.m.id).title;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (owned('boss')) return `Ville sauvée ! Trophées ${s.medals.length}/${S.medals.length}`;
      if (unlocked('boss')) return 'Mamie t\'attend : la Capitaine est aux docks !';
      return `Aide les habitants « ! » (${s.medals.length}/${missionDef('boss').needs} pour la Capitaine)`;
    },
    minimapMarks() {
      const out = [];
      for (const id in citizens) if (!st.m && (id === 'shop' || id === 'taxi' || available(id))) out.push([S.GIVERS[id].x, S.GIVERS[id].z, id === 'shop' ? '#40c060' : id === 'taxi' ? '#f0c020' : '#ff9a2a', 4, true]);
      if (!st.m && available('boss')) out.push([S.GIVERS.boss.x, S.GIVERS.boss.z, '#ff4a8a', 5, true]);
      for (const k of karts) if (k.driver < 0) out.push([k.x, k.z, hex(k.def.color), 2.4]);
      for (const c of cars) out.push([c.x, c.z, '#5a5e68', 1.6]);
      for (const r of rivals) if (r.on) out.push([r.x, r.z, '#ffffff', 2.6]);
      for (const k of planes) out.push([k.x, k.z, hex(k.def.color), 3.2]);
      for (const [x, z, col] of targets()) out.push([x, z, col, 4.2, true]);
      return out;
    },
    reveal() { const o = {}; for (const m of S.medals) o[m.id] = false; return o; },
    applySave() { refreshPosters(); renderShop(); },
    respawn(P) { if (P.kart && P.kart.plane) { const k = P.kart; k.grounded = true; exitPlane(P); resetPlane(k); } else if (P.kart) exitKart(P); return null; },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
      const m = st.m;
      return {
        k: karts.map(k => [r(k.x), r(k.y), r(k.z), r(k.yaw), k.driver, r(k.speed), k.boost > 0 ? 1 : 0, k.drift ? (k.driftT > 1.5 ? 3 : k.driftT > 0.7 ? 2 : 1) * k.drift : 0]),
        c: cars.map(c => [r1(c.x), r1(c.y), r1(c.z), r(c.yaw)]),
        pl: planes.map(k => [r(k.x), r(k.y), r(k.z), r(k.yaw), k.driver, r(k.speed), k.boost > 0 ? 1 : 0, r(k.roll), r(k.pitch), k.grounded ? 1 : 0]),
        rv: rivals.filter(q => q.on).map(q => [q.i, r1(q.x), r1(q.y), r1(q.z), r(q.yaw), r1(q.speed), q.prog, q.done ? 1 : 0]),
        m: m ? {
          id: m.id, ph: m.ph, t: r(m.t), done: m.done, prog: m.prog, found: m.found, cd: m.cd, dest: m.dest, driver: m.driver, t0: m.t0 !== undefined ? r(game.t - m.t0) : undefined,
          th: m.th ? [r(m.th.x), r(m.th.y), r(m.th.z), r(m.th.yaw), r(m.th.anim)] : null,
          bs: m.bs ? [r(m.bs.x), r(m.bs.y), r(m.bs.z), r(m.bs.yaw), m.bs.hp, r(m.bs.spin), r(m.bs.speed)] : null,
          kt: m.kt ? [r(m.kt.x), r(m.kt.y), r(m.kt.z), m.kt.carrier] : null,
          path: m.path ? m.path.length : 0,
        } : 0,
      };
    },
    apply(x) {
      x.k.forEach((d, i) => {
        const k = karts[i];
        if (!k) return;
        k.x = d[0]; k.y = d[1]; k.z = d[2]; k.yaw = d[3]; k.driver = d[4]; k.speed = d[5]; k.boost = d[6] ? 1 : 0;
        k.drift = Math.sign(d[7]); k.driftT = Math.abs(d[7]) === 3 ? 2 : Math.abs(d[7]) === 2 ? 1 : 0;
      });
      (x.pl || []).forEach((d, i) => {
        const k = planes[i];
        if (!k) return;
        k.x = d[0]; k.y = d[1]; k.z = d[2]; k.yaw = d[3]; k.driver = d[4]; k.speed = d[5]; k.boost = d[6] ? 1 : 0; k.roll = d[7]; k.pitch = d[8]; k.grounded = !!d[9];
      });
      for (const P of game.players) P.kart = null;
      for (const k of karts.concat(planes)) if (k.driver >= 0 && game.party.has(k.driver)) game.party.get(k.driver).kart = k;
      (x.c || []).forEach((d, i) => { const c = cars[i]; if (!c) return; c.tx = d[0]; c.ty = d[1]; c.tz = d[2]; c.tyaw = d[3]; });
      for (const r of rivals) r.on = false;
      for (const d of x.rv || []) { const r = rivals[d[0]]; r.on = true; r.tx = d[1]; r.ty = d[2]; r.tz = d[3]; r.tyaw = d[4]; r.speed = d[5]; r.prog = d[6]; r.done = !!d[7]; if (!r.seen) { r.x = d[1]; r.y = d[2]; r.z = d[3]; r.yaw = d[4]; } r.seen = true; }
      for (const r of rivals) if (!r.on) r.seen = false;
      const m = x.m, prevId = st.m ? st.m.id + st.m.ph : '';
      if (!m) st.m = null;
      else {
        st.m = { id: m.id, ph: m.ph, t: m.t, done: m.done || [], prog: m.prog || {}, found: m.found || 0, cd: m.cd, dest: m.dest, driver: m.driver };
        if (m.id === 'race') st.m.path = S.RACE.cps.slice(1);
        if (m.id === 'champion') st.m.path = lapPath(S.CHAMPION.laps);
        if (m.t0 !== undefined) st.m.t0 = game.t - m.t0;
        if (m.th) st.m.th = { x: m.th[0], y: m.th[1], z: m.th[2], yaw: m.th[3], anim: m.th[4] };
        if (m.bs) st.m.bs = { x: m.bs[0], y: m.bs[1], z: m.bs[2], yaw: m.bs[3], hp: m.bs[4], spin: m.bs[5], speed: m.bs[6] };
        if (m.kt) st.m.kt = { x: m.kt[0], y: m.kt[1], z: m.kt[2], carrier: m.kt[3] };
      }
      if ((st.m ? st.m.id + st.m.ph : '') !== prevId) game.updateHud();
    },
    talkMamie(first) {
      const s = save(), k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à Port-Croquette, mes toutous ! La plus grande ville de la côte.' },
          { who: 'Mamie Labrador', text: 'Le port, la plage, les docks, la fête foraine, le stade, les collines… il y a de quoi faire !' },
          { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache et son gang sèment la pagaille partout.' },
          { who: 'Mamie Labrador', text: 'Les habitants qui ont besoin d\'aide ont un « ! » au-dessus de la tête. Ils sont aussi sur la carte, en orange.' },
          { who: 'Mamie Labrador', text: 'Des karts sont garés un peu partout : approchez-vous et montez dedans !' },
          { who: 'Mamie Labrador', text: `En kart : ${k.dash} turbo, ${k.jump} saut, ${k.jump} maintenu en virage pour déraper, ${k.attack} klaxon.` },
          { who: 'Mamie Labrador', text: 'Et tout au nord-est, sur le plateau, il y a l\'aérodrome : trois biplans vous attendent pour survoler la ville !' },
          { who: 'Mamie Labrador', text: 'Les pièces d\'or remplissent le porte-monnaie de la ville. Chez Mimi, on peut s\'acheter des chapeaux, des peintures… et un super turbo !' },
          { who: 'Matcha', text: 'Des chapeaux ? Je veux la couronne !' },
          { who: 'Ainu', text: 'Ouaf ! On commence par où ?' },
          { who: 'Mamie Labrador', text: `Rendez ${missionDef('boss').needs} services, et on ira ensemble déloger la Capitaine. Il y a aussi ${S.STUNTS.length} sauts acrobatiques à trouver en kart !` },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Cherchez les « ! » sur la carte', 2800); game.updateHud(); });
        return;
      }
      if (owned('boss')) { game.say([{ who: 'Mamie Labrador', text: `La ville est sauvée ! Il vous reste ${S.medals.length - s.medals.length} trophée(s), des sauts acrobatiques et des pièces à trouver. Amusez-vous !` }]); return; }
      if (st.m && st.m.id === 'boss') { game.say([{ who: 'Mamie Labrador', text: objective() }]); return; }
      if (unlocked('boss')) {
        if (st.m) { game.say([{ who: 'Mamie Labrador', text: `Finissez d'abord « ${missionDef(st.m.id).title} », et revenez me voir !` }]); return; }
        game.say([
          { who: 'Mamie Labrador', text: `${s.medals.length} trophées ! Toute la ville parle de vous.` },
          { who: 'Mamie Labrador', text: 'La Capitaine Moustache et son gang se cachent aux docks, entre les conteneurs. C\'est le moment !' },
          { who: 'Ainu', text: 'Ouaf ! Allons-y !' },
        ], () => start('boss', game.player));
        return;
      }
      const left = S.MISSIONS.filter(q => q.id !== 'boss' && !owned(q.id)).slice(0, 3);
      game.say([
        { who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} trophée${s.medals.length > 1 ? 's' : ''}. Encore ${missionDef('boss').needs - s.medals.length} et on s'occupe de la Capitaine !` },
        ...left.map(q => ({ who: 'Mamie Labrador', text: `${S.GIVERS[q.id].name} a besoin de vous (${q.where}).` })),
      ]);
    },
    endLines() {
      return [
        { who: 'Mamie Labrador', text: 'La Capitaine Moustache a quitté Port-Croquette… en montgolfière !' },
        { who: 'Biscotte', text: 'Elle s\'envole vers les Îles du Ciel ! Là-haut, au-dessus des nuages !' },
        { who: 'Matcha', text: 'Et la prochaine fois, c\'est moi qui conduis.' },
        { who: 'Ainu', text: 'Ouaf ! On verra ça !' },
        { who: 'Mamie Labrador', text: 'La ville est à vous : courses, toits, trophées, chapeaux… Et quand vous serez prêts : les Îles du Ciel !' },
      ];
    },
    render(dt, t) {
      const cam = game.camera.position, me = game.me;
      // masquage au loin
      const far = (lite ? 240 : 330);
      for (const c of cullList) c.obj.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < far + c.r;
      const seeIt = (x, z, r) => Math.hypot(x - cam.x, z - cam.z) < (r || SEE);
      // boutons tactiles en kart
      const vk = me.kart ? (me.kart.plane ? 'plane' : 'kart') : '';
      if (vk !== st.btnKart) {
        st.btnKart = vk;
        const lab = (b, tx) => { const e = game.dom.root.querySelector(`.adv-btn.${b} span`); if (e) e.textContent = tx; };
        lab('dash', me.kart ? 'Turbo' : 'Charge'); lab('attack', me.kart ? 'Klaxon' : 'Attaque'); lab('jump', vk === 'plane' ? 'Monter' : 'Saut');
      }
      // porte-monnaie
      const coins = city().coins | 0;
      if (walletN.textContent !== String(coins)) walletN.textContent = coins;
      dressPlayers();
      // karts des joueurs
      for (const k of karts) {
        const P = k.driver >= 0 ? game.party.get(k.driver) : null;
        if (P && P.kart !== k) P.kart = k;
        const x = P ? P.pos.x : k.x, y = P ? P.pos.y : k.y, z = P ? P.pos.z : k.z, yaw = P ? P.yaw : k.yaw;
        const vis = seeIt(x, z);
        k.m.visible = vis; k.shadow.visible = vis;
        if (!vis) continue;
        const u = k.m.userData;
        k.m.position.set(x, y, z); k.m.rotation.y = yaw;
        k.wheelA += k.speed * dt / 0.36;
        u.wheels.forEach(w => { w.rotation.x = k.wheelA; });
        u.body.rotation.z = k.drift ? -k.drift * 0.12 : 0;
        u.body.rotation.x = !k.grounded ? -0.08 : 0;
        u.flame.material.opacity = k.boost > 0 ? 0.9 : 0;
        u.flame.material.color.set(k.drift && k.driftT > 1.5 ? 0xffa030 : 0x6ad0ff);
        const paintId = P && styleOf(P).paint, it = paintId && S.SHOP_ITEMS.find(q => q.id === paintId);
        u.paint.color.setHex(it ? it.color : k.def.color);
        game.placeShadow(k.shadow, k.m.position, 1.3);
        if (P && P.mesh) {
          const back = P.mesh.userData.ainu ? -0.45 : -0.3;
          P.mesh.position.set(x + Math.sin(yaw) * back, y + 0.55, z + Math.cos(yaw) * back);
          P.mesh.rotation.y = yaw;
          const pu = P.mesh.userData;
          if (pu.legs) pu.legs.forEach((l) => { l.rotation.x = 0; });
          if (pu.ainu) { pu.ainu.position.y = 0; pu.ainu.rotation.x = 0; }
          if (pu.matcha && !pu.ainu) { pu.matcha.position.y = pu.matchaY0; pu.matcha.rotation.x = 0; }
          if (P.shadow) P.shadow.visible = false;
        }
        // passager du taxi
      }
      // avions
      for (const k of planes) {
        const P = k.driver >= 0 ? game.party.get(k.driver) : null;
        if (P && P.kart !== k) P.kart = k;
        const x = P ? P.pos.x : k.x, y = P ? P.pos.y : k.y, z = P ? P.pos.z : k.z, yaw = P ? P.yaw : k.yaw;
        const vis = seeIt(x, z, 260);
        k.m.visible = vis; k.shadow.visible = vis;
        if (!vis) continue;
        const u = k.m.userData;
        k.m.position.set(x, y, z); k.m.rotation.y = yaw;
        u.body.rotation.set(k.pitch, 0, k.roll);
        const rpm = k.driver >= 0 ? 8 + k.speed * 1.6 : k.speed * 1.6;
        k.propA += rpm * dt; u.prop.rotation.z = k.propA;
        u.disc.material.opacity = clamp((rpm - 10) / 40, 0, 0.35);
        k.wheelA += (k.grounded ? k.speed : 0) * dt / 0.42; u.wheels.forEach(w => { w.rotation.x = k.wheelA; });
        u.flame.material.opacity = k.boost > 0 ? 0.9 : 0;
        game.placeShadow(k.shadow, k.m.position, 2.5);
        if (P && P.mesh) {
          // le chien est assis dans le cockpit et suit l'inclinaison de l'avion
          const o = new THREE.Vector3(0, u.seatY, u.seatZ).applyEuler(new THREE.Euler(k.pitch, yaw, k.roll, 'YXZ'));
          P.mesh.position.set(x + o.x, y + o.y, z + o.z);
          P.mesh.rotation.order = 'YXZ'; P.mesh.rotation.set(k.pitch, yaw, k.roll);
          const pu = P.mesh.userData;
          if (pu.legs) pu.legs.forEach((l) => { l.rotation.x = 0; });
          if (pu.ainu) { pu.ainu.position.y = 0; pu.ainu.rotation.x = 0; }
          if (pu.matcha && !pu.ainu) { pu.matcha.position.y = pu.matchaY0; pu.matcha.rotation.x = 0; }
          if (P.shadow) P.shadow.visible = false;
          st.tilted = st.tilted || new Set(); st.tilted.add(P);
        }
      }
      if (st.tilted) for (const P of st.tilted) if (!P.kart || !P.kart.plane) { if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; } st.tilted.delete(P); }
      // caméra plus loin en avion
      const inPlane = !!(me.kart && me.kart.plane);
      if (inPlane) { game.camDistOverride = 17; st.camSet = true; } else if (st.camSet) { game.camDistOverride = null; st.camSet = false; }
      sockCone.rotation.x = Math.sin(t * 2.3) * 0.12;
      // l'avion qui fait le tour de la ville
      {
        const a = t * 0.07, R = 165;
        flyby.position.set(Math.cos(a) * R, 78 + Math.sin(t * 0.3) * 6, Math.sin(a) * R);
        flyby.rotation.set(0, -a, 0);
        flyby.userData.body.rotation.z = 0.32;
        flyby.userData.prop.rotation.z = t * 60;
        flyby.userData.disc.material.opacity = 0.3;
      }
      // karts rivaux
      const k0 = 1 - Math.exp(-dt * 12);
      for (const r of rivals) {
        r.m.visible = r.rider.visible = r.on && seeIt(r.x, r.z, 200);
        if (!r.on) continue;
        if (game.guest && r.tx !== undefined) { r.x += (r.tx - r.x) * k0; r.y += (r.ty - r.y) * k0; r.z += (r.tz - r.z) * k0; r.yaw = lerpAngle(r.yaw, r.tyaw, k0); }
        r.m.position.set(r.x, r.y, r.z); r.m.rotation.y = r.yaw;
        r.wheelA += r.speed * dt / 0.36; r.m.userData.wheels.forEach(w => { w.rotation.x = r.wheelA; });
        r.rider.position.set(r.x - Math.sin(r.yaw) * 0.3, r.y + 0.55, r.z - Math.cos(r.yaw) * 0.3); r.rider.rotation.y = r.yaw;
      }
      // voitures
      for (const c of cars) {
        if (game.guest && c.tx !== undefined) { c.x += (c.tx - c.x) * k0; c.y += (c.ty - c.y) * k0; c.z += (c.tz - c.z) * k0; c.yaw = lerpAngle(c.yaw, c.tyaw, k0); }
        c.on = seeIt(c.x, c.z, lite ? 110 : SEE) || !game.guest;
        c.m.visible = seeIt(c.x, c.z, lite ? 110 : SEE);
        if (!c.m.visible) continue;
        c.m.position.set(c.x, c.y, c.z); c.m.rotation.y = c.yaw;
      }
      // passants
      stepWalkers(dt);
      for (const w of walkers) {
        const vis = seeIt(w.x, w.z, lite ? 60 : 90);
        w.m.visible = vis;
        if (!vis) continue;
        w.m.position.set(w.x, G, w.z); w.m.rotation.y = w.yaw;
        w.m.userData.body.position.y = Math.abs(Math.sin(w.ph)) * 0.07;
        w.m.userData.body.rotation.z = Math.sin(w.ph) * 0.06;
      }
      // habitants
      for (const id in citizens) {
        const c = citizens[id], u = c.m.userData, g = c.def;
        const vis = seeIt(g.x, g.z, lite ? 80 : 120);
        c.m.visible = vis;
        c.mark.visible = vis && !st.m && (id === 'shop' || id === 'taxi' ? save().intro : available(id));
        if (!vis) continue;
        const d = Math.hypot(me.pos.x - g.x, me.pos.z - g.z);
        const look = d < 8 ? Math.atan2(me.pos.x - g.x, me.pos.z - g.z) : (g.yaw || 0);
        c.m.rotation.y = lerpAngle(c.m.rotation.y, look, Math.min(1, dt * 3));
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + g.x) * 0.5;
        u.mhead.rotation.x = Math.sin(t * 2 + g.z) * 0.06;
        c.mark.position.set(g.x, g.y + (u.height || 1.6) + 1.3 + Math.sin(t * 4) * 0.1, g.z);
      }
      if (game.marks && game.marks.mamie && save().intro) game.marks.mamie.visible = (available('boss') && !st.m) || game.marks.mamie.visible;
      // voleur, chaton, passager, Capitaine
      const m = st.m;
      const th = m && m.id === 'thief' ? m.th : null;
      thief.visible = !!th; thiefShadow.visible = !!th;
      if (th) {
        thief.position.set(th.x, th.y + Math.abs(Math.sin(th.anim * 9)) * 0.25, th.z); thief.rotation.y = th.yaw;
        thief.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(th.anim * 18 + (i % 3 ? Math.PI : 0)) * 0.9; });
        thief.userData.tail.rotation.x = -0.6;
        game.placeShadow(thiefShadow, thief.position, 0.6);
      }
      const kt = m && m.id === 'kitten' ? m.kt : null;
      kitten.visible = !!kt;
      if (kt) { kitten.position.set(kt.x, kt.y, kt.z); kitten.rotation.y = kt.carrier >= 0 ? (game.party.get(kt.carrier) || me).yaw : t; kitten.userData.tail.rotation.x = Math.sin(t * 6) * 0.4; }
      const taxiP = m && m.id === 'taxi' ? game.party.get(m.driver) : null;
      passenger.visible = !!(taxiP && taxiP.kart);
      if (passenger.visible) { const k = taxiP.kart; passenger.position.set(taxiP.pos.x - Math.sin(k.yaw) * 1.1, taxiP.pos.y + 0.7, taxiP.pos.z - Math.cos(k.yaw) * 1.1); passenger.rotation.y = k.yaw; }
      const bs = m && m.id === 'boss' ? m.bs : null;
      capKart.visible = captain.visible = capShadow.visible = !!bs;
      if (bs) {
        capKart.position.set(bs.x, bs.y, bs.z); capKart.rotation.y = bs.yaw;
        capKart.userData.wheels.forEach(w => { w.rotation.x += bs.speed * dt / 0.36; });
        captain.position.set(bs.x - Math.sin(bs.yaw) * 0.35, bs.y + 0.5, bs.z - Math.cos(bs.yaw) * 0.35); captain.rotation.y = bs.yaw;
        const cu = captain.userData;
        cu.stars.visible = bs.spin > 0;
        if (bs.spin > 0) cu.stars.children.forEach((s, i) => { const a = t * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); });
        cu.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
        game.placeShadow(capShadow, capKart.position, 1.3);
      }
      // objets de mission
      for (const b of balloons) { b.g.visible = !!(m && m.id === 'balloons' && !m.done.includes(b.def.id)); if (b.g.visible) b.g.position.y = b.def.y + Math.sin(t * 2 + b.def.x) * 0.2; }
      for (const c of goldCrates) { c.m.visible = !!(m && m.id === 'smuggle' && !m.done.includes(c.def.id)); if (c.m.visible) c.m.rotation.y = t; }
      for (const s of digSpots) s.g.visible = !!(m && m.id === 'treasure' && !m.done.includes(s.def.id));
      // balises
      const tg = targets();
      beacons.forEach((b, i) => {
        const g = tg[i];
        b.b.visible = b.r.visible = !!g;
        if (!g) return;
        const [x, z, col, y] = g;
        const yy = y === undefined ? S.heightAt(x, z) : y;
        b.b.material.color.set(col); b.r.material.color.set(col);
        b.b.position.set(x, yy + 20, z);
        b.r.position.set(x, yy + 0.3 + Math.sin(t * 3 + i) * 0.15, z);
        b.r.rotation.y = t;
        b.b.material.opacity = 0.32 + Math.sin(t * 3) * 0.1;
      });
      // panneau de mission
      hud.classList.toggle('hidden', !m);
      if (m) {
        hudB.textContent = missionDef(m.id).title;
        hudS.textContent = objective();
        let tt = -1;
        if (m.t > 0 && m.ph === 'run' && !['race', 'champion'].includes(m.id)) tt = m.t;
        else if (m.t0 !== undefined && m.ph === 'run') tt = game.t - m.t0;
        hudE.textContent = tt >= 0 ? fmtTime(tt) : '';
        hudE.classList.toggle('urgent', m.t > 0 && m.t < 15 && m.ph === 'run');
      }
      // décor animé
      const A = anim;
      A.statue.rotation.y = t * 0.8;
      A.fountainWater.position.y = S.FOUNTAIN.top - 0.2 + Math.sin(t * 2) * 0.02;
      if (seeIt(S.FOUNTAIN.x, S.FOUNTAIN.z, 60) && Math.random() < dt * 25) {
        const a = Math.random() * Math.PI * 2;
        game.spawnParticle(S.FOUNTAIN.x + Math.cos(a) * 0.4, S.FOUNTAIN.colTop - 1.2, S.FOUNTAIN.z + Math.sin(a) * 0.4, Math.cos(a) * 1.8, 2.5, Math.sin(a) * 1.8, 0xd8f4ff, 0.2, 0.7, 8);
      }
      for (const b of A.boats) { b.m.position.y = Math.sin(t * 1.1 + b.ph) * 0.12; b.m.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.04; }
      A.beam.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
      A.hands[0].rotation.z = -t * 0.05; A.hands[1].rotation.z = -t * 0.6;
      for (const a of A.awnings) {
        const since = t - (a.def.col.squashT || -9);
        const k = since < 0.4 ? 1 - Math.sin(since / 0.4 * Math.PI) * 0.5 * (1 - since / 0.4) : 1;
        a.g.scale.set(1, k, 1);
      }
      for (const mu of A.mushrooms) {
        const since = t - (mu.def.col.squashT || -9);
        const k = since < 0.5 ? 1 - Math.sin(since / 0.5 * Math.PI) * 0.3 * (1 - since / 0.5) : 1;
        if (mu.tramp) mu.cap.position.y = mu.def.top - mu.def.base - (1 - k) * 0.6; else mu.cap.scale.set(2 - k, 0.6 * k, 2 - k);
      }
      for (const e of A.elevators) e.g.position.set(e.c.x, S.elevTop(e.c, t), e.c.z);
      // grande roue
      A.wheel.rotation.z = (t / S.WHEEL.period) * Math.PI * 2;
      const gp = S.wheelAt(t);
      A.gondolas.forEach((g, i) => g.position.set(gp[i].x, gp[i].y, gp[i].z));
      A.carousel.rotation.y = t * 0.6;
    },
  };

  /** Points à atteindre pour la mission en cours : [x, z, couleur, y]. */
  function targets() {
    const m = st.m;
    if (!m) return [];
    switch (m.id) {
      case 'delivery': return S.DELIVERY.drops.filter(d => !m.done.includes(d.id)).map(d => [d.x, d.z, '#ffd23a', d.y]);
      case 'race': case 'champion': case 'downhill': {
        const start = m.id === 'race' ? S.RACE.start : m.id === 'champion' ? S.TRACK[4] : S.DOWNHILL.start;
        if (m.ph !== 'run') return [[start.x, start.z, '#ffffff']];
        const path = m.id === 'downhill' ? S.DOWNHILL.cps : m.path;
        const i = (m.prog || {})[game.me.id] || 0, out = [];
        if (path[i]) out.push([path[i].x, path[i].z, '#3ae0ff']);
        if (path[i + 1]) out.push([path[i + 1].x, path[i + 1].z, '#2a7a9a']);
        return out;
      }
      case 'thief': return m.th ? [[m.th.x, m.th.z, '#ff4a4a', m.th.y]] : [];
      case 'posters': return posters.filter(p => p.g.visible).map(p => [p.def.x, p.def.z, '#ff9a2a', p.def.y]);
      case 'kitten': return m.kt.carrier >= 0 ? [[S.KITTEN.home.x, S.KITTEN.home.z, '#ff9ad0']] : [[m.kt.x, m.kt.z, '#ff9ad0', m.kt.y]];
      case 'smuggle': return goldCrates.filter(c => !m.done.includes(c.def.id)).map(c => [c.def.x, c.def.z, '#ffd040', c.def.y]);
      case 'balloons': return balloons.filter(b => !m.done.includes(b.def.id)).slice(0, 12).map(b => [b.def.x, b.def.z, '#ff7ab0', b.def.y - 1.5]);
      case 'treasure': return digSpots.filter(s => !m.done.includes(s.def.id)).map(s => [s.def.x, s.def.z, '#e0c080']);
      case 'taxi': return [[m.dest.x, m.dest.z, '#f0c020']];
      case 'boss': return m.bs ? [[m.bs.x, m.bs.z, '#ff4a8a', m.bs.y]] : game.cats.filter(c => c.def.group === 'gang' && !c.dead).slice(0, 8).map(c => [c.pos.x, c.pos.z, '#ff4a8a', c.pos.y]);
    }
    return [];
  }

  refreshPosters();
  return logic;
}
