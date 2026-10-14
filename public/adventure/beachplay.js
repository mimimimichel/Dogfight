/*
 * Matcha & Ainu — La Plage aux Coquillages : tout ce qui bouge et se joue.
 * Creuser dans les tas de sable qui brillent, le bodyboard sur les rouleaux
 * (et la course contre Mistral), les crabes farceurs (un « Ouaf ! » et ils lâchent
 * leur coquillage), le bébé phoque à ramener à la mer, le coffre de Barnabé,
 * le phare à rallumer et le fort de sable des chats.
 * Le navigateur de l'hôte fait tourner les règles ; les invités reçoivent l'état.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as K from './citykit.js';
import * as N from './npcs.js';
import * as W from './world.js';
import { shellGeometry, paint } from './beach.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const HIDDEN_Y = -60;               // coquillage encore enterré (ou dans les pinces d'un crabe)
const DIG_TIME = 0.9;
// Bodyboard : vitesse de croisière, turbo, virage, petit bond
const BB = { MAX: 12, BOOST: 19, ACC: 14, COAST: 5, TURN: 2.3, HOP: 7.5, GRAV: 26, R: 0.9 };

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------
function buildBoard(color) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const w = 0.34, l = 0.62, r = 0.22;
  s.moveTo(-w, -l + r); s.lineTo(-w, l - r); s.quadraticCurveTo(-w, l, -w + r, l); s.lineTo(w - r, l); s.quadraticCurveTo(w, l, w, l - r);
  s.lineTo(w, -l + r); s.quadraticCurveTo(w, -l, w - r * 0.6, -l); s.lineTo(-w + r * 0.6, -l); s.quadraticCurveTo(-w, -l, -w, -l + r);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.02, 0);
  const deck = new THREE.Mesh(paint(geo, (c, x, y, z) => c.set(Math.abs(x) < 0.07 && z < 0.4 ? 0xffffff : color)), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
  deck.scale.set(1.5, 1, 1.5);
  deck.castShadow = true;
  g.add(deck);
  const leash = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 5, 12), M.mat(0x2a2a3a)); leash.rotation.x = Math.PI / 2; leash.position.set(0, 0.13, 0.85); g.add(leash);
  // gerbe d'écume derrière la planche
  const spray = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  spray.scale.set(1.4, 0.8, 1); spray.position.set(0, 0.3, -1.0); spray.userData.noOutline = true; g.add(spray);
  g.userData = { deck, spray };
  return g;
}

function buildCrab() {
  const g = new THREE.Group();
  const red = 0xe8502a, dark = 0xb83a1a;
  const parts = [];
  const body = new THREE.SphereGeometry(0.3, 16, 10); body.scale(1.25, 0.55, 0.95);
  parts.push({ geo: paint(body, (c, x, y) => c.set(y > 0.05 ? red : 0xf09a6a)), y: 0.26 });
  for (const sx of [-1, 1]) {
    parts.push({ geo: paint(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 5), dark), x: sx * 0.1, y: 0.44, z: 0.16 });
    parts.push({ geo: paint(new THREE.SphereGeometry(0.06, 10, 8), 0xffffff), x: sx * 0.1, y: 0.56, z: 0.17 });
    parts.push({ geo: paint(new THREE.SphereGeometry(0.032, 8, 6), 0x111111), x: sx * 0.1, y: 0.57, z: 0.22 });
  }
  const shell = new THREE.Mesh(M.mergeGeos(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  g.add(shell);
  const legs = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = new THREE.Group(); p.position.set(sx * 0.3, 0.24, 0.12 - i * 0.14);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.32, 5), M.mat(dark)); leg.position.set(sx * 0.1, -0.08, 0); leg.rotation.z = sx * 0.9;
    p.add(leg); g.add(p); legs.push(p);
  }
  const claws = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * 0.3, 0.3, 0.25);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), M.mat(red)); arm.rotation.x = Math.PI / 2; arm.position.z = 0.1;
    const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.mat(red)); pincer.scale.set(0.8, 0.7, 1.2); pincer.position.set(0, 0.04, 0.24);
    p.add(arm, pincer); g.add(p); claws.push(p);
  }
  // le coquillage volé, brandi au-dessus de la tête
  const loot = new THREE.Mesh(shellGeometry(), new THREE.MeshStandardMaterial({ color: 0xffb0c8, roughness: 0.4, emissive: 0x5a2030, emissiveIntensity: 0.4 }));
  loot.scale.setScalar(1.3); loot.position.set(0, 0.72, 0.2);
  g.add(loot);
  g.scale.setScalar(1.25);
  g.userData = { legs, claws, loot };
  return g;
}

function buildSeal(baby) {
  const g = new THREE.Group();
  const fur = baby ? 0xf6f6fa : 0x8a8a98, belly = baby ? 0xffffff : 0xb8b8c4;
  const parts = [];
  const body = new THREE.SphereGeometry(0.36, 18, 14); body.scale(0.95, 0.8, 1.7);
  parts.push({ geo: paint(body, (c, x, y) => c.set(y < -0.12 ? belly : fur)), y: 0.3 });
  const tail = new THREE.ConeGeometry(0.16, 0.4, 10); tail.rotateX(-Math.PI / 2);
  parts.push({ geo: paint(tail, fur), y: 0.2, z: -0.72 });
  for (const sx of [-1, 1]) {
    const fl = new THREE.SphereGeometry(0.16, 10, 8); fl.scale(1.6, 0.25, 0.8);
    parts.push({ geo: paint(fl, fur), x: sx * 0.34, y: 0.1, z: 0.18, ry: sx * 0.5 });
    const ft = new THREE.SphereGeometry(0.12, 10, 8); ft.scale(1.5, 0.25, 0.7);
    parts.push({ geo: paint(ft, fur), x: sx * 0.14, y: 0.12, z: -0.9, ry: sx * 0.9 });
  }
  const bodyM = new THREE.Mesh(M.mergeGeos(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  g.add(bodyM);
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.5); g.add(head);
  const hp = [];
  hp.push({ geo: paint(new THREE.SphereGeometry(0.3, 18, 14), fur) });
  hp.push({ geo: paint(new THREE.SphereGeometry(0.14, 12, 10), belly), y: -0.08, z: 0.22, sx: 1.2, sy: 0.8 });
  for (const sx of [-1, 1]) {
    hp.push({ geo: paint(new THREE.SphereGeometry(baby ? 0.085 : 0.06, 12, 10), 0x111118), x: sx * 0.12, y: 0.06, z: 0.24 });
    hp.push({ geo: paint(new THREE.SphereGeometry(0.025, 6, 5), 0xffffff), x: sx * 0.1, y: 0.1, z: 0.31 });
    for (const dy of [-0.02, 0.02]) hp.push({ geo: paint(new THREE.CylinderGeometry(0.005, 0.005, 0.26, 3), 0xdddddd), x: sx * 0.16, y: -0.08 + dy, z: 0.3, rz: Math.PI / 2 + sx * dy * 6 });
  }
  hp.push({ geo: paint(new THREE.SphereGeometry(0.045, 8, 6), 0x2a2a2a), y: -0.02, z: 0.33, sx: 1.3 });
  head.add(new THREE.Mesh(M.mergeGeos(hp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  g.scale.setScalar(baby ? 1.0 : 1.8);
  g.userData = { head, body: bodyM };
  return g;
}

/** Mistral, le maître-nageur : casquette rouge, sifflet, bouée-tube. */
function buildLifeguard(lite) {
  let m, anchor;
  if (W.LOOK.real && N.hasNpc('berger')) {
    m = N.buildNpc('berger', { tint: 0xfff0d8 });
    anchor = m.userData.headTop;
  } else {
    m = M.buildPug({ fur: 0xe8b878, mask: 0x4a3020, belly: 0xfff0d8, collar: 0xe04848, scale: 1.65 });
    anchor = m.userData.mhead;
  }
  const cap = new THREE.Group();
  const r = M.mat(0xe03a3a, { roughness: 0.6 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), r); dome.position.y = 0.18;
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), r); visor.position.set(0, 0.19, 0.13); visor.scale.set(1, 1, 1.5);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), M.mat(0xffffff)); cross.position.set(0, 0.3, 0.17);
  const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
  cap.add(dome, visor, cross, cross2);
  if (m.userData.realistic) cap.scale.setScalar(0.9);
  anchor.add(cap);
  // la bouée-tube rouge en bandoulière
  const tube = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 24), M.mat(0xff4a2a, { roughness: 0.5 }));
  tube.rotation.set(Math.PI / 2, 0.5, 0); tube.position.set(0, (m.userData.height || 1.6) * 0.5, 0.05);
  m.add(tube);
  void lite;
  return m;
}

function buildChest() {
  const g = new THREE.Group();
  const wood = M.mat(0x8a5a2a, { roughness: 0.8 }), gold = M.GOLD();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood); base.position.y = 0.3;
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.4);
  const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 14, 1, false, 0, Math.PI), wood); lidM.rotation.z = Math.PI / 2; lidM.position.z = 0.4;
  lid.add(lidM);
  for (const x of [-0.45, 0.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.84), gold); b.position.set(x, 0.3, 0); g.add(b); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.06), gold); lock.position.set(0, 0.5, 0.42);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xffd060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(2.6, 2.6, 1); glow.position.y = 0.9; glow.userData.noOutline = true;
  g.add(base, lid, lock, glow);
  g.userData = { lid, glow };
  return g;
}

// =============================================================================
export function buildPlay(game, decor) {
  const sc = game.scene, lite = game.lite, S = L;
  const { moving, chars } = decor;
  const save = () => game.save;
  const beach = () => {
    const s = save();
    if (!s.beach) s.beach = {};
    const b = s.beach;
    for (const [k, v] of [['dug', []], ['drop', {}], ['cp', 0], ['seal', 'stuck'], ['talk', {}]]) if (b[k] === undefined) b[k] = Array.isArray(v) ? [] : (typeof v === 'object' ? {} : v);
    return b;
  };
  const players = () => game.players;
  const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const isGuest = () => game.guest;

  // --- Personnages ---------------------------------------------------------------------
  const barnabe = K.buildCitizen('sailor');
  const BG = S.GIVERS.barnabe, MG = S.GIVERS.mistral;
  barnabe.position.set(BG.x, BG.y, BG.z); barnabe.rotation.y = BG.yaw;
  sc.add(barnabe); chars.push(barnabe);
  const mistral = buildLifeguard(lite);
  mistral.position.set(MG.x, MG.y, MG.z); mistral.rotation.y = MG.yaw;
  sc.add(mistral); chars.push(mistral); moving.push(mistral);
  const marks = { barnabe: game.makeMark('!', 0xff9a2a), mistral: game.makeMark('!', 0xff9a2a), seal: game.makeMark('?', 0x8ad0ff) };
  const baby = buildSeal(true);
  sc.add(baby); chars.push(baby); moving.push(baby);
  const babyShadow = game.makeShadow(0.6);
  const mama = buildSeal(false);
  mama.position.set(S.SEAL_ROCK.x, S.SEAL_ROCK.top - 0.05, S.SEAL_ROCK.z); mama.rotation.y = 0.6;
  sc.add(mama); chars.push(mama); moving.push(mama);

  // --- Tas de sable qui brillent, croix rouge, coffre -------------------------------------
  const moundDefs = S.MOUNDS.concat([S.CHEST]);
  const moundGeo = new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(moundGeo, new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff }), moundDefs.length);
  mounds.receiveShadow = true; mounds.castShadow = true;
  sc.add(mounds);
  const sparkGeo = new THREE.BufferGeometry(), NSP = moundDefs.length * 3;
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSP * 3), 3));
  sparkGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(NSP), 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: M.glowTexture() }, uScale: { value: 400 } },
    vertexShader: 'attribute float size; uniform float uScale; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D uMap; void main() { float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.92, 0.55) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false; sparks.renderOrder = 4; sparks.userData.noOutline = true;
  sc.add(sparks);
  const xMark = new THREE.Group();
  {
    const red = M.mat(0xd82a2a, { roughness: 0.7 });
    for (const a of [0.78, -0.78]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.32), red); b.rotation.y = a; b.position.y = 0.42; xMark.add(b); }
    xMark.position.set(S.CHEST.x, S.CHEST.y, S.CHEST.z);
    sc.add(xMark);
  }
  const chest = buildChest();
  chest.position.set(S.CHEST.x, S.CHEST.y - 1.2, S.CHEST.z); chest.rotation.y = 0.3; chest.visible = false;
  sc.add(chest); moving.push(chest);

  // --- Planches, crabes ------------------------------------------------------------------
  const RK = S.RACK;
  const boards = S.BOARDS.map((color, i) => {
    const m = buildBoard(color);
    sc.add(m); moving.push(m);
    const slot = { x: RK.x - 1.5 + i * 0.6, z: RK.z + 0.3, y: RK.y + 0.6 };
    return { i, m, color, slot, driver: -1, x: 0, y: 0, z: 0, yaw: 0, speed: 0, vy: 0, air: false, boost: 0, cd: 0, spin: 0, beachT: 0, bumpT: 0, shadow: null };
  });
  const rival = { m: buildBoard(0xffffff), on: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0, next: 0, done: false };
  sc.add(rival.m); moving.push(rival.m); rival.m.visible = false;
  const crabs = S.CRABS.map((d, i) => {
    const m = buildCrab();
    sc.add(m); chars.push(m); moving.push(m);
    return { def: d, m, x: d.x, z: d.z, y: d.y, yaw: i, t: i * 0.7, tx: d.x, tz: d.z, flee: 0, fx: 0, fz: 0, phase: 0, wave: 0 };
  });
  // anneau qui montre la prochaine bouée (course)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(S.RACE.r * 0.75, 0.18, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.visible = false; ring.userData.noOutline = true;
  const ringBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 26, 16, 1, true), K.beaconMaterial(0xffd23a));
  ringBeam.visible = false; ringBeam.userData.noOutline = true; ringBeam.renderOrder = 3;
  sc.add(ring, ringBeam);

  // --- État ------------------------------------------------------------------------------
  const st = {
    race: null,                // { ph: 'ready'|'count'|'go', t, next: {pid: i}, lock: [] }
    seal: { x: S.SEAL.x, y: S.SEAL.y + 0.1, z: S.SEAL.z, yaw: 0.5, owner: -1, swim: 0, phase: 0, state: 'stuck' },
    chestT: -1, lightT: -1, popAt: {}, digSeen: new Set(), btn: null, camSet: false, hints: {}, capPos: new THREE.Vector3(),
  };

  // =============================================================================
  // Les coquillages cachés : enterrés (tas) ou gardés par un crabe
  // =============================================================================
  const dug = (id) => beach().dug.includes(id);
  function placeHiddenShells() {
    const b = beach();
    for (const s of S.bones) {
      if (s.mound) { s.x = s.x0; s.z = s.z0; s.y = b.dug.includes(s.mound) ? s.y0 : HIDDEN_Y; }
      else if (s.crab) {
        const d = b.drop[s.crab];
        if (d) { s.x = d[0]; s.z = d[1]; s.y = S.groundY(d[0], d[1]) + 0.9; } else { s.x = s.x0; s.z = s.z0; s.y = HIDDEN_Y; }
      }
    }
  }
  placeHiddenShells();
  function refreshMounds() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const showX = !!beach().map;
    moundDefs.forEach((d, i) => {
      const done = d.id === 'chest' ? !!beach().chest : dug(d.id);
      const hide = d.id === 'chest' && !showX && !done;
      const k = hide ? 0.001 : 1;
      m4.compose(v.set(d.x, d.y - (done ? 0.05 : 0.12), d.z), q, s.set(k * (done ? 1.15 : 1), k * (done ? 0.12 : 0.55), k * (done ? 1.15 : 1)));
      mounds.setMatrixAt(i, m4);
      mounds.setColorAt(i, c.set(done ? 0xb89060 : 0xf8e4b0));
    });
    mounds.instanceMatrix.needsUpdate = true; if (mounds.instanceColor) mounds.instanceColor.needsUpdate = true;
    xMark.visible = showX && !beach().chest;
  }
  refreshMounds();

  // =============================================================================
  // Creuser
  // =============================================================================
  const moundNear = (P) => {
    if (!P.grounded) return null;
    let best = null, bd = S.DIG_R;
    for (const d of moundDefs) {
      if (d.id === 'chest' ? beach().chest : dug(d.id)) continue;
      const dd = distXZ(P.pos, d.x, d.z);
      if (dd < bd && Math.abs(P.pos.y - d.y) < 1.5) { bd = dd; best = d; }
    }
    return best;
  };
  function startDig(P, d) {
    if (P.digT > 0 || P.board) return;
    P.digT = DIG_TIME; P.digM = d.id; P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.yaw = Math.atan2(d.x - P.pos.x, d.z - P.pos.z) || P.yaw;
    game.sound('dash');
    if (!beach().dugTip) { beach().dugTip = 1; }
  }
  function finishDig(P) {
    const id = P.digM, d = moundDefs.find(q => q.id === id);
    P.digM = null;
    if (!d) return;
    game.burst(d.x, d.y + 0.4, d.z, 22, 0xf0d8a0, 4.5, 0.7);
    if (id === 'chest') {
      if (beach().chest) return;
      beach().chest = true; game.persist();
      st.chestT = 0;
      game.sound('reveal');
      game.banner('LE COFFRE DE BARNABÉ !', 'Un vrai trésor de pirate…', 2600);
      for (const Q of players()) Q.cheerT = 1.2;
      refreshMounds();
      setTimeout(() => { if (!game.disposed) game.updateMedalVisibility(); }, 1100);
      return;
    }
    if (dug(id)) return;
    beach().dug.push(id); game.persist();
    st.popAt[id] = game.t;
    placeHiddenShells();
    refreshMounds();
    game.sound('chain');
    const left = S.MOUNDS.filter(q => !dug(q.id)).length;
    game.banner('Des coquillages !', left ? `Encore ${left} tas qui brille${left > 1 ? 'nt' : ''} sur la plage` : 'Tu as creusé tous les tas de la plage !', 1800);
    game.betise(P, 'crates');
  }
  function stepDig(P, dt) {
    P.digT -= dt;
    P.invuln = Math.max(0, P.invuln - dt); P.cheerT = Math.max(0, P.cheerT - dt); P.barkT = Math.max(0, (P.barkT || 0) - dt);
    P.vel.set(0, 0, 0); P.grounded = true;
    // le sable vole en arrière, entre les pattes
    if ((game.t * 30 | 0) !== ((game.t - dt) * 30 | 0)) {
      const bx = -Math.sin(P.yaw), bz = -Math.cos(P.yaw);
      game.spawnParticle(P.pos.x + Math.sin(P.yaw) * 0.6, P.pos.y + 0.25, P.pos.z + Math.cos(P.yaw) * 0.6, bx * (3 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, 3 + Math.random() * 2.5, bz * (3 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, 0xe8cc90, 0.2 + Math.random() * 0.12, 0.7, 12);
    }
    if ((game.t * 4 | 0) !== ((game.t - dt) * 4 | 0)) game.sound('poof');
    if (P.digT <= 0) { P.digT = 0; finishDig(P); }
  }

  // =============================================================================
  // Bodyboard
  // =============================================================================
  const freeBoard = () => boards.find(b => b.driver < 0);
  const surfY = (x, z) => S.WATER_Y + 0.1 + S.swell(x, z, game.t);
  const deep = (x, z) => S.heightAt(x, z) < S.WATER_Y - 0.15;
  function mountBoard(P, b) {
    if (!b || b.driver >= 0 || P.board || P.digT > 0) return;
    b.driver = P.id; P.board = b;
    const k = b.i;
    b.x = S.LAUNCH.x + (k % 3 - 1) * 2.4; b.z = S.LAUNCH.z - Math.floor(k / 3) * 2.4; b.yaw = S.LAUNCH.yaw; b.speed = 0; b.vy = 0; b.air = false; b.boost = 0; b.cd = 0;
    b.y = surfY(b.x, b.z);
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0); P.pos.set(b.x, b.y, b.z); P.yaw = b.yaw;
    game.burst(b.x, b.y + 0.3, b.z, 16, 0xdff8ff, 4, 0.6);
    game.sound('splash');
    if (P === game.me) { game.camYaw = b.yaw + Math.PI; }
    if (!beach().boardTip) {
      beach().boardTip = 1;
      const c = game.controlsHelp();
      game.banner('En bodyboard !', `${c.dash} : vague turbo · ${c.jump} : petit bond · « Descendre » pour revenir sur le sable`, 4200);
    }
  }
  function unmountBoard(P, where) {
    const b = P.board;
    if (!b) return;
    b.driver = -1; P.board = null; b.speed = 0;
    const p = where || { x: RK.x + 1.5, z: RK.z + 1.5 };
    P.pos.set(p.x, S.groundY(p.x, p.z) + 0.05, p.z);
    P.vel.set(0, 3, 0); P.grounded = false; P.jumps = 1; P.invuln = Math.max(P.invuln, 0.5);
    if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; }
    if (st.race && st.race.ph !== 'ready' && st.race.lock && st.race.lock.includes(P.id) && !players().some(Q => Q.board && st.race.lock.includes(Q.id))) {
      st.race = null; rival.on = false; game.banner('Course annulée', 'Retournez voir Mistral pour une autre course !', 2000);
    }
  }
  /** Trouve un bout de sable sec devant la planche (quand on arrive sur la plage). */
  function landingSpot(b) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    for (let d = 1; d < 8; d += 0.5) { const x = b.x + fx * d, z = b.z + fz * d; const h = S.heightAt(x, z); if (h > 0.08 && h < 3) return { x, z }; }
    return null;
  }
  function rideBoard(P, b, wx, wz, jumpHeld, pr, dt) {
    const locked = st.race && st.race.ph === 'count' && st.race.lock && st.race.lock.includes(P.id);
    const frozen = game.dialog || game.freeze > 0 || locked;
    if (frozen) { wx = 0; wz = 0; }
    P.invuln = Math.max(0, P.invuln - dt); P.cheerT = Math.max(0, P.cheerT - dt); P.flipT = Math.max(0, P.flipT - dt);
    P.barkT = Math.max(0, (P.barkT || 0) - dt); P.trickT = Math.max(0, (P.trickT || 0) - dt);
    b.cd = Math.max(0, b.cd - dt); b.boost = Math.max(0, b.boost - dt); b.spin = Math.max(0, b.spin - dt); b.bumpT = Math.max(0, b.bumpT - dt);
    if (!frozen) {
      if (pr.has('dash') && b.cd <= 0) { b.boost = 1.3; b.cd = 2.2; game.sound('boost'); game.burst(b.x - Math.sin(b.yaw), b.y + 0.2, b.z - Math.cos(b.yaw), 14, 0xe8fbff, 4, 0.5); }
      if (pr.has('jump') && !b.air) { b.vy = BB.HOP; b.air = true; game.sound('jump'); }
      if (pr.has('attack') && b.spin <= 0) { b.spin = 0.55; P.trickT = 0.55; game.sound('trick'); if (b.air) game.burst(b.x, b.y + 0.6, b.z, 12, 0xfff0a0, 3, 0.5); }
      if (pr.has('bark') && P.barkT <= 0) { P.barkT = 0.7; game.dogBark(P); }
    }
    const wl = Math.hypot(wx, wz);
    let target = 0, turn = 0;
    if (wl > 0.15) {
      const d = angDiff(Math.atan2(wx, wz), b.yaw);
      target = BB.MAX * wl * (Math.abs(d) > 1.8 ? 0.4 : 1);
      turn = clamp(d * 2.2, -1, 1);
    }
    if (b.boost > 0) target = BB.BOOST;
    const acc = b.boost > 0 ? 30 : target > b.speed ? BB.ACC : BB.COAST;
    b.speed += clamp(target - b.speed, -acc * dt, acc * dt);
    b.yaw += turn * BB.TURN * clamp(b.speed / 5, 0.45, 1) * dt;
    // ne pas partir au large : on fait demi-tour tout seul
    if (Math.abs(b.x) > 80 || b.z < -82) b.yaw = lerpAngle(b.yaw, Math.atan2(-b.x, -30 - b.z), Math.min(1, dt * 2));
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const next = { x: b.x + fx * b.speed * dt, z: b.z + fz * b.speed * dt };
    game.pushOut(next, b.y - 0.2, BB.R);
    if (!deep(next.x, next.z)) {
      const h = S.heightAt(next.x, next.z);
      // sur le sable : on descend de la planche (si on y va franchement), sinon on s'arrête
      if (h < 3 && wl > 0.3) {
        b.beachT += dt;
        if (b.beachT > 0.25) { const spot = landingSpot(b); b.beachT = 0; if (spot) { unmountBoard(P, spot); game.banner('Sur le sable !', 'La planche retourne au poste de secours.', 1500); return; } }
      }
      next.x = b.x; next.z = b.z;
      if (b.speed > 6 && b.bumpT <= 0) { game.sound('bump'); b.bumpT = 0.5; }
      b.speed *= 0.3;
    } else b.beachT = 0;
    b.x = next.x; b.z = next.z;
    const sy = surfY(b.x, b.z);
    if (b.air) {
      b.vy -= BB.GRAV * dt; b.y += b.vy * dt;
      if (b.y <= sy && b.vy < 0) { b.y = sy; b.vy = 0; b.air = false; game.burst(b.x, sy + 0.1, b.z, 10, 0xe8fbff, 3, 0.4); if (b.spin > 0 || P.trickT > 0) { game.sound('chain'); game.burst(b.x, sy + 0.8, b.z, 16, 0xffe070, 3.5, 0.6); } }
    } else {
      // une crête de vague prise à pleine vitesse fait décoller un peu
      const ahead = S.swell(b.x + fx, b.z + fz, game.t);
      if (b.speed > 10 && ahead - (sy - S.WATER_Y - 0.1) > 0.12) { b.vy = 3.5; b.air = true; }
      b.y = sy;
    }
    P.pos.set(b.x, b.y, b.z);
    P.vel.set(fx * b.speed, b.air ? b.vy : 0, fz * b.speed);
    P.yaw = b.yaw; P.grounded = false; P.gliding = false; P.attackT = 0; P.dashT = 0; P.coyote = 0; P.jumps = 2;
  }
  function stepFreeBoards() {
    for (const b of boards) if (b.driver >= 0 && !game.party.has(b.driver)) b.driver = -1;
  }

  // =============================================================================
  // La course de bodyboard contre Mistral
  // =============================================================================
  const RC = S.RACE;
  const rivalSpeed = () => (game.easy ? 8.8 : game.mode === 'defi' ? 12.2 : 10.6);
  function raceReady() {
    st.race = { ph: 'ready', t: 0, next: {}, lock: [] };
    rival.on = true; rival.done = false; rival.next = 0;
    rival.x = RC.start.x - 2.5; rival.z = RC.start.z - 1; rival.yaw = Math.PI * 1.1; rival.speed = 0; rival.y = surfY(rival.x, rival.z);
    game.updateHud();
  }
  function stepRace(dt) {
    const R = st.race;
    if (!R) { rival.on = false; return; }
    R.t += dt;
    const riders = players().filter(p => p.board);
    if (R.ph === 'ready') {
      if (riders.some(p => distXZ(p.pos, RC.start.x, RC.start.z) < RC.r + 1.5)) {
        R.ph = 'count'; R.t = 0; R.lock = riders.map(p => p.id); R.next = {};
        for (const p of riders) { R.next[p.id] = 0; p.board.speed = 0; }
        game.banner('Prêts ?', 'Passez toutes les bouées, et revenez au poste !', 1600);
        game.sound('switch');
      }
      return;
    }
    if (R.ph === 'count') {
      const n = 3 - Math.floor(R.t);
      if (n !== R.shown && n > 0) { R.shown = n; game.banner(String(n), '', 800); game.sound('cp'); }
      if (R.t >= 3) { R.ph = 'go'; R.t = 0; game.banner('PARTEZ !', '', 900); game.sound('boost'); }
      return;
    }
    // course : les joueurs passent les bouées dans l'ordre
    for (const p of players()) {
      if (!p.board || R.next[p.id] === undefined) continue;
      const i = R.next[p.id], bu = RC.buoys[i];
      if (distXZ(p.pos, bu.x, bu.z) < RC.r) {
        R.next[p.id] = i + 1;
        if (i + 1 >= RC.buoys.length) { winRace(p); return; }
        game.sound('cp');
        game.burst(bu.x, S.WATER_Y + 1, bu.z, 14, 0xffd23a, 4, 0.5);
      }
    }
    // Mistral : il file d'une bouée à l'autre (un peu moins vite quand il est loin devant)
    const bu = RC.buoys[rival.next];
    const dx = bu.x - rival.x, dz = bu.z - rival.z, d = Math.hypot(dx, dz);
    rival.yaw = lerpAngle(rival.yaw, Math.atan2(dx, dz), Math.min(1, dt * 3));
    const best = Math.max(...Object.values(R.next));
    const lead = rival.next - best;
    const want = rivalSpeed() * (lead > 0 ? 0.82 : lead < 0 ? 1.08 : 1);
    rival.speed += clamp(want - rival.speed, -10 * dt, 8 * dt);
    rival.x += Math.sin(rival.yaw) * rival.speed * dt; rival.z += Math.cos(rival.yaw) * rival.speed * dt;
    rival.y = surfY(rival.x, rival.z);
    if (d < RC.r * 0.6) {
      rival.next++;
      if (rival.next >= RC.buoys.length) loseRace();
    }
    if (!players().some(p => p.board && R.next[p.id] !== undefined)) { st.race = null; rival.on = false; }
  }
  function winRace(P) {
    const R = st.race, b = beach();
    const tm = Math.round(R.t * 10) / 10;
    const rec = !b.raceBest || tm < b.raceBest;
    if (rec) b.raceBest = tm;
    b.raceWon = true; game.persist();
    st.race = null; rival.on = false;
    game.sound('win');
    for (const Q of players()) Q.cheerT = 1.4;
    game.burst(RC.finish.x, S.WATER_Y + 1.5, RC.finish.z, 30, 0xffd23a, 5, 0.9);
    game.banner(`${game.party.size > 1 ? P.name + ' gagne' : 'Gagné'} ! ${tm.toFixed(1)} s`, rec ? 'Nouveau record de la plage !' : `Record : ${b.raceBest.toFixed(1)} s`, 3000);
    game.updateMedalVisibility(); game.updateHud();
  }
  function loseRace() {
    st.race = null; rival.on = false;
    game.sound('poof');
    game.banner('Mistral a gagné !', 'Presque ! Utilise la vague turbo (Charge) et retente ta chance.', 3000);
    game.updateHud();
  }

  // =============================================================================
  // Crabes farceurs
  // =============================================================================
  function stepCrabs(dt) {
    const b = beach();
    for (const c of crabs) {
      const carry = !b.drop[c.def.id];
      c.t -= dt; c.wave = Math.max(0, c.wave - dt);
      let sp = 0, tx = c.tx, tz = c.tz;
      // un chien qui s'approche : le crabe file de côté (en gardant son butin)
      let near = null, nd = 1e9;
      for (const P of players()) { const d = distXZ(P.pos, c.x, c.z); if (d < nd) { nd = d; near = P; } }
      if (c.flee > 0) {
        c.flee -= dt; sp = 5.2;
        const ax = c.x - c.fx, az = c.z - c.fz, l = Math.hypot(ax, az) || 1; tx = c.x + ax / l * 3; tz = c.z + az / l * 3;
      } else if (carry && near && nd < 5.5) {
        sp = 3.4;
        const ax = c.x - near.pos.x, az = c.z - near.pos.z, l = Math.hypot(ax, az) || 1;
        tx = c.x + az / l * 3 * (c.def.x > 0 ? 1 : -1) + ax / l; tz = c.z - ax / l * 3 * (c.def.x > 0 ? 1 : -1) + az / l;
        if (near === game.me && !st.hints.crab) { st.hints.crab = 1; game.localBanner('Un crabe a chipé un coquillage !', 'Fais « Ouaf ! » tout près de lui : il le lâchera.', 3200); }
      } else {
        if (c.t <= 0) { const a = Math.random() * 6.28, r = 2 + Math.random() * 3; c.tx = c.def.x + Math.cos(a) * r; c.tz = c.def.z + Math.sin(a) * r; c.t = 2 + Math.random() * 3; }
        if (Math.hypot(c.tx - c.x, c.tz - c.z) > 0.4) sp = 1.4;
      }
      if (sp > 0) {
        const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz) || 1;
        const nx = c.x + dx / l * sp * dt, nz = c.z + dz / l * sp * dt, h = S.heightAt(nx, nz);
        if (h > S.WATER_Y - 0.25 && h < 1.9 && Math.hypot(nx - c.def.x, nz - c.def.z) < 14) { c.x = nx; c.z = nz; c.y = h; }
        c.phase += dt * sp * 6;
        c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz) + Math.PI / 2, Math.min(1, dt * 6));   // les crabes marchent de côté !
      }
      // « Ouaf ! » tout près : le crabe sursaute et lâche son coquillage
      for (const P of players()) {
        const barked = (P.barkT || 0) > (P._bk6 === undefined ? 0 : P._bk6) + 0.01;
        if (barked && distXZ(P.pos, c.x, c.z) < 7.5) {
          c.flee = 1.4; c.fx = P.pos.x; c.fz = P.pos.z; c.wave = 1.2;
          if (carry) {
            b.drop[c.def.id] = [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10];
            game.persist();
            placeHiddenShells();
            game.burst(c.x, c.y + 1, c.z, 14, 0xffb0c8, 3.5, 0.6);
            game.sound('ball');
            const left = S.CRABS.filter(q => !b.drop[q.id]).length;
            game.banner('Le crabe lâche son coquillage !', left ? `Encore ${left} crabe${left > 1 ? 's' : ''} farceur${left > 1 ? 's' : ''}` : 'Tous les crabes ont rendu les coquillages !', 1800);
          }
        }
      }
    }
    for (const P of players()) P._bk6 = P.barkT || 0;
  }

  // =============================================================================
  // Le bébé phoque
  // =============================================================================
  function stepSeal(dt) {
    const s = st.seal, b = beach();
    if (b.seal === 'home') { s.state = 'home'; return; }
    if (s.state === 'stuck') { s.yaw += Math.sin(game.t * 0.7) * dt * 0.3; return; }
    if (s.state === 'swim') {
      const tx = S.SEAL_ROCK.x + 2.2, tz = S.SEAL_ROCK.z + 1.5, dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4));
      s.x += dx / (d || 1) * Math.min(d, 4 * dt); s.z += dz / (d || 1) * Math.min(d, 4 * dt);
      s.y = S.WATER_Y - 0.15 + Math.sin(game.t * 3) * 0.05; s.swim += dt;
      if (d < 0.5 || s.swim > 8) sealHome();
      return;
    }
    // il suit son ami en sautillant sur le ventre
    const P = game.party.get(s.owner) || game.player;
    if (P.board) { /* on l'attend sur la plage */ }
    let tx = P.pos.x - Math.sin(P.yaw) * 1.8, tz = P.pos.z - Math.cos(P.yaw) * 1.8;
    // la mer est toute proche (et son ami aussi) : il y file tout seul
    if (!s.sea || (game.t * 4 | 0) !== ((game.t - dt) * 4 | 0)) {
      s.sea = null;
      if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 9) {
        for (const r of [2, 4, 6, 8]) {
          for (let k = 0; k < 8 && !s.sea; k++) { const a = k / 8 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; if (S.heightAt(x, z) < S.WATER_Y - 0.3) s.sea = { x, z }; }
          if (s.sea) break;
        }
      }
    }
    if (s.sea) { tx = s.sea.x; tz = s.sea.z; }
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d > 25) { s.x = tx; s.z = tz; }
    else if (d > 0.4) {
      const sp = Math.min(d * 2.2, 6.5) * dt;
      const n = { x: s.x + dx / d * sp, z: s.z + dz / d * sp };
      game.pushOut(n, s.y, 0.5);
      s.x = n.x; s.z = n.z; s.phase += sp * 3;
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
    }
    const sup = game.support(s.x, s.z, Math.max(s.y, P.pos.y) + 0.6);
    s.y += (Math.max(sup.y, S.WATER_Y - 0.3) - s.y) * Math.min(1, dt * 10);
    // arrivé dans l'eau : il plonge et rejoint sa maman
    // (il sent la mer : dès qu'il a les nageoires mouillées, ou qu'une eau profonde est toute proche)
    const wet = S.heightAt(s.x, s.z) < S.WATER_Y - 0.02;
    if (wet) {
      s.state = 'swim'; s.swim = 0;
      game.burst(s.x, S.WATER_Y + 0.3, s.z, 20, 0xdff8ff, 4, 0.6);
      game.sound('splash');
      game.banner('Plouf ! Le bébé phoque nage !', 'Il file retrouver sa maman…', 2200);
    }
  }
  function sealHome() {
    const b = beach();
    st.seal.state = 'home'; b.seal = 'home'; game.persist();
    game.sound('reveal');
    for (const Q of players()) Q.cheerT = 1.2;
    game.say([
      { who: 'Maman Phoque', text: 'Mon bébé ! Te voilà enfin ! Merci, les toutous, merci !' },
      { who: 'Bébé Phoque', text: 'Ark ark ! Au revoir, les chiens ! Je reviendrai jouer dans les vagues !' },
    ], () => { game.updateMedalVisibility(); game.banner('Une médaille sur la plage !', 'Elle brille près des rochers', 2400); game.sound('reveal'); });
  }
  function talkSeal(P) {
    const s = st.seal;
    if (s.state !== 'stuck') return;
    game.say([
      { who: 'Bébé Phoque', text: 'Ouin… ouin… La mer est partie, et je ne sais plus où elle est… Je veux ma maman !' },
      { who: 'Ainu', text: 'N\'aie pas peur, petit phoque. La mer est juste là : on t\'y emmène !' },
      { who: 'Bébé Phoque', text: 'Ark ark ! Je vous suis ! Pas trop vite, hein ?' },
    ], () => { s.state = 'follow'; s.owner = P.id; game.updateHud(); game.banner('Le bébé phoque te suit !', 'Emmène-le jusqu\'à l\'eau', 2200); });
  }

  // =============================================================================
  // Le phare
  // =============================================================================
  const LH = S.LIGHTHOUSE;
  function lightUp() {
    const b = beach();
    if (b.light) return;
    b.light = true; game.persist();
    st.lightT = game.t;
    game.burst(LH.x, LH.top + 1.4, LH.z, 30, 0xf0d8a0, 4, 0.8);
    game.burst(LH.x, LH.top + 1.4, LH.z, 24, 0xfff0a0, 6, 1.0);
    game.sound('lantern');
    game.banner('Le phare brille à nouveau !', 'Plus de sable dans la lanterne !', 2800);
    setTimeout(() => { if (!game.disposed) { game.updateMedalVisibility(); game.sound('reveal'); } }, 900);
  }

  // =============================================================================
  // Drapeaux (points de reprise)
  // =============================================================================
  function stepFlags() {
    const b = beach();
    for (const P of players()) {
      if (P.board) continue;
      for (const c of S.CHECKPOINTS) {
        if (c.id === b.cp || Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > 3 || Math.abs(P.pos.y - c.y) > 3) continue;
        b.cp = c.id; game.persist();
        decor.flags[c.id].raisedAt = game.t;
        game.sound('cp');
        game.burst(c.x, c.y + 3.6, c.z, 18, 0x8ad8ff, 3.5, 0.7);
        game.banner('Drapeau !', `${c.name} : si tu tombes K.O., tu repars d'ici.`, 1600);
      }
    }
  }

  // =============================================================================
  // Dialogues des habitants
  // =============================================================================
  function talkBarnabe() {
    const b = beach(), k = game.controlsHelp();
    if (!b.talk.barnabe) {
      b.talk.barnabe = 1; b.map = true; game.persist(); refreshMounds();
      game.say([
        { who: 'Capitaine Barnabé', text: 'Ohé, les moussaillons ! Capitaine Barnabé, pour vous servir. On s\'est vus à Port-Croquette, pas vrai ?' },
        { who: 'Capitaine Barnabé', text: 'Je suis venu ici en vacances… mais deux soucis me chiffonnent la moustache.' },
        { who: 'Capitaine Barnabé', text: 'Un : mon vieux coffre de pirate ! Je l\'ai enterré dans les dunes de l\'ouest, près des trois palmiers. J\'ai marqué l\'endroit d\'une croix rouge.' },
        { who: 'Capitaine Barnabé', text: `Creusez sur la croix : approchez-vous et appuyez sur ${k.attack} !` },
        { who: 'Capitaine Barnabé', text: 'Deux : mon phare s\'est éteint ! Ces chenapans de chats ont rempli la lanterne de sable.' },
        { who: 'Capitaine Barnabé', text: 'Le phare est sur la falaise, à l\'est. On y monte par la pente herbue, au bout de la promenade. Grimpez l\'escalier et rallumez-le !' },
        { who: 'Matcha', text: 'Un trésor ET un phare ? C\'est le plus beau jour de ma vie !' },
      ], () => { game.updateHud(); game.banner('Une croix rouge dans les dunes', 'Elle est aussi sur ta carte !', 2400); });
      return;
    }
    const lines = [];
    if (!b.chest) lines.push({ who: 'Capitaine Barnabé', text: 'Mon coffre est sous la croix rouge, dans les dunes de l\'ouest, près des trois palmiers. Creusez, moussaillons !' });
    if (!b.light) lines.push({ who: 'Capitaine Barnabé', text: 'Et mon phare ! Montez la pente au bout de la promenade, à l\'est, puis l\'escalier du phare jusqu\'à la lanterne.' });
    if (!lines.length) lines.push({ who: 'Capitaine Barnabé', text: 'Le coffre retrouvé et le phare qui brille… Vous êtes de vrais loups de mer ! Ohé ohé !' });
    game.say(lines);
  }
  function talkMistral() {
    const b = beach(), k = game.controlsHelp();
    if (st.race && st.race.ph !== 'ready') return;
    if (!b.talk.mistral) {
      b.talk.mistral = 1; game.persist();
      game.say([
        { who: 'Maître-Nageur Mistral', text: 'Salut les toutous ! Maître-Nageur Mistral, gardien de la plage. Ici, on s\'amuse… et on fait attention !' },
        { who: 'Maître-Nageur Mistral', text: 'Vous voyez les bodyboards, sur le râtelier ? Approchez-vous et montez : on glisse sur les vagues !' },
        { who: 'Maître-Nageur Mistral', text: `Sur la planche : ${k.dash} pour la vague turbo, ${k.jump} pour un petit bond. Et on revient sur le sable quand on veut.` },
        { who: 'Maître-Nageur Mistral', text: 'Si vous me battez à la course autour des bouées, vous gagnez une médaille ! Revenez me voir quand vous êtes prêts.' },
        { who: 'Maître-Nageur Mistral', text: 'Ah, et j\'entends un bébé phoque pleurer dans les rochers, à l\'ouest. Il ne retrouve plus la mer… Vous pourriez l\'aider ?' },
        { who: 'Ainu', text: 'Ouaf ! On y va !' },
      ], () => game.updateHud());
      return;
    }
    if (st.race) { game.say([{ who: 'Maître-Nageur Mistral', text: 'Je vous attends à la bouée de départ, juste devant le poste ! Prenez une planche.' }]); return; }
    const won = b.raceWon;
    game.say([
      { who: 'Maître-Nageur Mistral', text: won ? `Une revanche ? Votre record est de ${b.raceBest ? b.raceBest.toFixed(1) : '…'} secondes. Je vais m'entraîner !` : 'Une course de bodyboard ? D\'accord !' },
      { who: 'Maître-Nageur Mistral', text: 'Prenez une planche et rejoignez-moi à la bouée de départ, devant le poste. On fait le tour des bouées jaunes, et on revient !' },
      ...(b.seal !== 'home' ? [{ who: 'Maître-Nageur Mistral', text: 'Et n\'oubliez pas le bébé phoque, dans les rochers à l\'ouest !' }] : []),
    ], () => raceReady());
  }

  // =============================================================================
  // Interface avec le moteur
  // =============================================================================
  const resetBeachData = () => { placeHiddenShells(); };
  resetBeachData();
  const lab = (btn, tx) => { const e = game.dom.root.querySelector(`.adv-btn.${btn} span`); if (e && e.textContent !== tx) e.textContent = tx; };

  const logic = {
    moving, chars,
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      if (P.board) {
        if (pr.has('talk') && !game.dialog && game.freeze <= 0) { pr.delete('talk'); unmountBoard(P); return true; }
        rideBoard(P, P.board, wx, wz, jumpHeld, pr, dt);
        return true;
      }
      if (P.digT > 0) { stepDig(P, dt); return true; }
      // Attaque sur un tas qui brille : on creuse au lieu de tourbillonner
      if (pr.has('attack') && !game.dialog && game.freeze <= 0 && !(P.attackT > 0)) {
        const d = moundNear(P);
        if (d) { pr.delete('attack'); startDig(P, d); stepDig(P, dt); return true; }
      }
      return false;
    },
    nearFor(Q) {
      if (Q.board) return { kind: 'lv', act: 'unboard', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
      if (Q.digT > 0) return null;
      return undefined;
    },
    extraCandidates(Q) {
      const out = [];
      const d = moundNear(Q);
      if (d) out.push({ kind: 'lv', act: 'dig', id: d.id, label: 'CREUSER', x: Q.pos.x + (d.x - Q.pos.x) * 0.2, z: Q.pos.z + (d.z - Q.pos.z) * 0.2, y: d.y });
      if (freeBoard()) out.push({ kind: 'lv', act: 'board', label: 'SURFER', x: RK.x, z: RK.z, y: RK.y });
      out.push({ kind: 'lv', act: 'barnabe', label: 'PARLER', x: BG.x, z: BG.z, y: BG.y });
      out.push({ kind: 'lv', act: 'mistral', label: 'PARLER', x: mistral.position.x, z: mistral.position.z, y: MG.y });
      if (st.seal.state === 'stuck' && beach().seal !== 'home') out.push({ kind: 'lv', act: 'seal', label: 'AIDER', x: st.seal.x, z: st.seal.z, y: st.seal.y });
      if (!beach().light) out.push({ kind: 'lv', act: 'light', label: 'ALLUMER', x: LH.x, z: LH.z + 1.6, y: LH.top });
      return out;
    },
    interact(n, P) {
      if (n.act === 'dig') { const d = moundDefs.find(q => q.id === n.id); if (d && !P.board) startDig(P, d); }
      else if (n.act === 'board') mountBoard(P, freeBoard());
      else if (n.act === 'unboard') unmountBoard(P);
      else if (n.act === 'barnabe') talkBarnabe();
      else if (n.act === 'mistral') talkMistral();
      else if (n.act === 'seal') talkSeal(P);
      else if (n.act === 'light') lightUp();
    },
    step(dt) {
      stepFreeBoards();
      stepRace(dt);
      stepCrabs(dt);
      stepSeal(dt);
      stepFlags();
      // le fort : les chats qui détalent (« Ouaf ! ») hors des remparts sont chassés pour de bon
      for (const c of game.cats) {
        if (c.dead || c.def.group !== 'clearing' || !(c.flee > 0)) continue;
        if (Math.hypot(c.pos.x - S.FORT.x, c.pos.z - S.FORT.z) > S.FORT.r + 0.6) game.defeatCat(c);
      }
      // premier pas dans l'eau : on conseille la planche
      const me = game.me;
      if (!st.hints.water && !me.board && me.pos.y < S.WATER_Y - 0.35 && save().intro) { st.hints.water = 1; game.localBanner('Attention, ça devient profond !', 'Pour aller dans les vagues : prends un bodyboard au poste de secours.', 3000); }
      if (st.chestT >= 0) st.chestT += dt;
    },
    questText() {
      const s = save(), b = beach(), n = s.medals.length;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (st.race) {
        if (st.race.ph === 'ready') return 'Sur une planche, rejoins Mistral à la bouée de départ';
        if (st.race.ph === 'count') return 'Attention… prêts ?';
        const me = game.me, i = st.race.next[me.id];
        return i === undefined ? 'La course est lancée !' : `Course ! Bouée ${Math.min(i + 1, RC.buoys.length)}/${RC.buoys.length}`;
      }
      if (st.seal.state === 'follow') return 'Ramène le bébé phoque jusqu\'à la mer';
      if (n >= S.medals.length) return `Plage sauvée ! Coquillages ${s.bones.length}/100`;
      if (!b.talk.barnabe && !b.talk.mistral) return `Parle à Barnabé (ponton) et à Mistral (poste) · ${n}/5`;
      return `Médailles de la plage ${n}/5 · creuse les tas qui brillent !`;
    },
    guideTarget(me) {
      const b = beach();
      if (st.race && st.race.ph === 'ready') return { x: RC.start.x, y: S.WATER_Y, z: RC.start.z };
      if (st.race) { const i = st.race.next[me.id]; if (i !== undefined) { const bu = RC.buoys[Math.min(i, RC.buoys.length - 1)]; return { x: bu.x, y: S.WATER_Y, z: bu.z }; } }
      if (st.seal.state === 'follow') return { x: S.SEAL_HOME.x, y: S.WATER_Y, z: S.SEAL_HOME.z };
      const goals = [];
      if (!b.talk.mistral) goals.push(MG);
      if (!b.talk.barnabe) goals.push(BG);
      if (b.map && !b.chest) goals.push(S.CHEST);
      if (b.talk.barnabe && !b.light) goals.push({ x: LH.x, y: LH.top, z: LH.z + 2 });
      if (b.talk.mistral && b.seal !== 'home' && st.seal.state === 'stuck') goals.push(st.seal);
      if (game.cats.some(c => c.def.group === 'clearing' && !c.dead)) goals.push(S.FORT);
      for (const m of game.medals) if (m.mesh.visible) goals.push(m.def);
      if (!goals.length) for (const d of S.MOUNDS) if (!dug(d.id)) goals.push(d);
      let best = null, bd = Infinity;
      for (const g of goals) { const d = Math.hypot(g.x - me.pos.x, g.z - me.pos.z); if (d < bd) { bd = d; best = g; } }
      return best ? { x: best.x, y: best.y === undefined ? S.heightAt(best.x, best.z) : best.y, z: best.z } : null;
    },
    reveal() {
      const b = beach(), s = save();
      return {
        m_light: !!b.light,
        m_chest: !!b.chest,
        m_seal: b.seal === 'home',
        m_race: !!b.raceWon,
        m_fort: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
      };
    },
    applySave() {
      placeHiddenShells();
      refreshMounds();
      const b = beach();
      if (b.seal === 'home') st.seal.state = 'home';
      decor.flags.forEach((f, i) => { f.raise = i === b.cp ? 1 : 0; });
    },
    respawn(P) {
      if (P.board) unmountBoard(P);
      const c = S.CHECKPOINTS[beach().cp] || S.CHECKPOINTS[0];
      return { x: c.x + 1.2, y: c.y + 0.3, z: c.z + 1.2, yaw: Math.PI };
    },
    minimapMarks() {
      const out = [], b = beach();
      if (!b.talk.barnabe || !b.light || !b.chest) out.push([BG.x, BG.z, '#ff9a2a', 4, !b.talk.barnabe]);
      if (!b.talk.mistral || !b.raceWon || st.race) out.push([MG.x, MG.z, '#ff9a2a', 4, !b.talk.mistral]);
      if (b.map && !b.chest) out.push([S.CHEST.x, S.CHEST.z, '#e02a2a', 4.5, true]);
      if (b.seal !== 'home') out.push([st.seal.x, st.seal.z, '#ffffff', 3.5, st.seal.state === 'follow']);
      out.push([RK.x, RK.z, '#3ab0ff', 3]);
      for (const d of S.MOUNDS) if (!dug(d.id)) out.push([d.x, d.z, '#fff2b0', 2]);
      for (const c of crabs) if (!b.drop[c.def.id]) out.push([c.x, c.z, '#ff5a3a', 2.2]);
      S.CHECKPOINTS.forEach((c, i) => out.push([c.x, c.z, i === b.cp ? '#8ad8ff' : '#ffffff', 2.4]));
      if (st.race && st.race.ph === 'go') { const i = st.race.next[game.me.id]; if (i !== undefined && i < RC.buoys.length) out.push([RC.buoys[i].x, RC.buoys[i].z, '#ffd23a', 4.5, true]); }
      else if (st.race) out.push([RC.start.x, RC.start.z, '#ffd23a', 4.5, true]);
      if (rival.on) out.push([rival.x, rival.z, '#ffffff', 2.8]);
      return out;
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      const R = st.race;
      return {
        b: boards.map(b => [r(b.x), r(b.y), r(b.z), r(b.yaw), b.driver, r(b.speed), b.boost > 0 ? 1 : 0, b.spin > 0 ? 1 : 0]),
        rv: rival.on ? [r(rival.x), r(rival.y), r(rival.z), r(rival.yaw), r(rival.speed)] : 0,
        rc: R ? [R.ph, r(R.t), R.next, R.lock] : 0,
        k: crabs.map(c => [r(c.x), r(c.y), r(c.z), r(c.yaw), r(c.phase), c.wave > 0 ? 1 : 0]),
        se: [st.seal.state, r(st.seal.x), r(st.seal.y), r(st.seal.z), r(st.seal.yaw), r(st.seal.phase)],
        d: players().filter(p => p.digT > 0).map(p => [p.id, r(p.digT)]),
        ch: st.chestT >= 0 ? r(st.chestT) : -1,
      };
    },
    apply(x) {
      x.b.forEach((d, i) => { const b = boards[i]; if (!b) return; b.x = d[0]; b.y = d[1]; b.z = d[2]; b.yaw = d[3]; b.driver = d[4]; b.speed = d[5]; b.boost = d[6] ? 1 : 0; b.spin = d[7] ? 0.3 : 0; });
      for (const P of players()) P.board = null;
      for (const b of boards) if (b.driver >= 0 && game.party.has(b.driver)) game.party.get(b.driver).board = b;
      if (x.rv) { rival.on = true; [rival.x, rival.y, rival.z, rival.yaw, rival.speed] = x.rv; } else rival.on = false;
      const prev = st.race ? st.race.ph : '';
      st.race = x.rc ? { ph: x.rc[0], t: x.rc[1], next: x.rc[2] || {}, lock: x.rc[3] || [] } : null;
      if ((st.race ? st.race.ph : '') !== prev) game.updateHud();
      x.k.forEach((d, i) => { const c = crabs[i]; if (!c) return; c.x = d[0]; c.y = d[1]; c.z = d[2]; c.yaw = d[3]; c.phase = d[4]; c.wave = d[5] ? 0.5 : 0; });
      const s = st.seal;
      const was = s.state;
      [s.state, s.x, s.y, s.z, s.yaw, s.phase] = x.se;
      if (was !== s.state) game.updateHud();
      const digs = new Map(x.d);
      for (const P of players()) P.digT = digs.get(P.id) || 0;
      st.chestT = x.ch;
    },
    talkMamie(first) {
      const s = save(), k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à la Plage aux Coquillages, mes toutous ! Ici, c\'est soleil, vagues et châteaux de sable.' },
          { who: 'Biscotte', text: 'Des coquillages partout ! Je peux en garder un, Mamie ?' },
          { who: 'Mamie Labrador', text: 'Il y en a cent à trouver ! Et regardez : les petits tas de sable qui brillent cachent des trésors.' },
          { who: 'Mamie Labrador', text: `Approchez-vous d'un tas qui brille et appuyez sur ${k.attack} : vous creusez !` },
          { who: 'Mamie Labrador', text: 'Mais attention : les chats de la Capitaine Moustache ont bâti un fort de sable, et des crabes farceurs chipent les coquillages.' },
          { who: 'Mamie Labrador', text: 'Un bon « Ouaf ! » tout près d\'un crabe, et il lâche tout. Les chats, eux, détalent !' },
          { who: 'Mamie Labrador', text: 'Le Capitaine Barnabé est au bout du ponton, et Mistral, le maître-nageur, au poste de secours. Ils ont besoin de vous !' },
          { who: 'Matcha', text: 'Cinq médailles à gagner ? Ainu, on commence par creuser !' },
          { who: 'Ainu', text: 'Ouaf ! Et après, on fait du bodyboard !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Trouve les 5 médailles de la plage !', 2800); game.updateHud(); });
        return;
      }
      const b = beach();
      if (s.medals.length >= S.medals.length) { game.say([{ who: 'Mamie Labrador', text: `La plage est à vous, mes toutous ! Il reste peut-être des coquillages à trouver : ${s.bones.length} sur 100.` }]); return; }
      const lines = [{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5. Bravo !` }];
      const r = this.reveal();
      if (!r.m_fort) lines.push({ who: 'Mamie Labrador', text: 'Les chats sont toujours dans leur fort de sable, à l\'ouest. Un gros « Ouaf ! » et ils déguerpiront !' });
      if (!r.m_chest) lines.push({ who: 'Mamie Labrador', text: b.map ? 'Le coffre de Barnabé est sous la croix rouge, dans les dunes de l\'ouest.' : 'Allez voir le Capitaine Barnabé, au bout du ponton : il a perdu quelque chose…' });
      if (!r.m_light) lines.push({ who: 'Mamie Labrador', text: 'Le phare, sur la falaise de l\'est, est tout éteint. On y monte par la pente, au bout de la promenade.' });
      if (!r.m_seal) lines.push({ who: 'Mamie Labrador', text: 'J\'ai entendu un petit phoque pleurer dans les rochers, à l\'ouest…' });
      if (!r.m_race) lines.push({ who: 'Mamie Labrador', text: 'Et Mistral vous attend pour une course de bodyboard !' });
      game.say(lines.slice(0, 3));
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Les cinq médailles de la plage ! Le phare brille, le coffre est retrouvé, et le bébé phoque nage avec sa maman.' },
        { who: 'Capitaine Moustache', text: 'Miaou… Mon fort de sable était le plus beau de la plage. Mais votre « Ouaf ! » a fait trembler les remparts !' },
        { who: 'Capitaine Moustache', text: 'Bon… Et si on en construisait un encore plus grand… tous ensemble ?' },
        { who: 'Mamie Labrador', text: 'Voilà une excellente idée ! Les chiens creusent, les chats décorent.' },
        { who: 'Biscotte', text: 'Et moi, je mets des coquillages sur toutes les tours !' },
        { who: 'Matcha', text: 'Tu vois, Ainu ? Même les chats savent faire des châteaux.' },
        { who: 'Ainu', text: 'Ouaf ! Et ce soir, tout le monde se baigne… sauf les chats !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
      ];
    },
    render(dt, t) {
      const me = game.me, b = beach();
      decor.surfMat.uniforms.uTime.value = t;
      // (pas d'îles volantes au-dessus de la mer : ici, on reste les pattes dans le sable)
      if (!st.vista && game.vista) { st.vista = true; for (const i of game.vista.isles) i.visible = false; }
      // boutons tactiles sur la planche
      const mode = me.board ? 'board' : '';
      if (mode !== st.btn) { st.btn = mode; lab('dash', mode ? 'Turbo' : 'Charge'); lab('attack', mode ? 'Figure' : 'Attaque'); }
      if (me.board) { game.camDistOverride = 11; st.camSet = true; } else if (st.camSet) { game.camDistOverride = null; st.camSet = false; }
      // planches
      for (const bd of boards) {
        const P = bd.driver >= 0 ? game.party.get(bd.driver) : null;
        const u = bd.m.userData;
        if (!P) {
          bd.m.position.set(bd.slot.x, bd.slot.y, bd.slot.z); bd.m.rotation.set(-1.25, 0.15, 0);
          u.spray.material.opacity = 0;
          continue;
        }
        if (P.board !== bd) P.board = bd;
        const x = P.pos.x, y = P.pos.y, z = P.pos.z, yaw = P.yaw;
        const turn = clamp(angDiff(yaw, bd.lastYaw === undefined ? yaw : bd.lastYaw) / Math.max(dt, 1e-3) * 0.08, -0.35, 0.35);
        bd.lastYaw = yaw; bd.bank = (bd.bank || 0) + (turn - (bd.bank || 0)) * Math.min(1, dt * 6);
        const spin = bd.spin > 0 ? (1 - bd.spin / 0.55) * Math.PI * 2 : 0;
        bd.m.position.set(x, y, z); bd.m.rotation.set(-0.06 + clamp(-P.vel.y * 0.03, -0.3, 0.3), yaw + spin, -bd.bank, 'YXZ');
        const sp = Math.hypot(P.vel.x, P.vel.z);
        u.spray.material.opacity = clamp((sp - 3) / 10, 0, 0.8) * (P.vel.y === 0 ? 1 : 0.4);
        u.spray.scale.set(1 + sp * 0.12, 0.6 + sp * 0.05, 1);
        if (sp > 5 && Math.random() < dt * 25) game.spawnParticle(x - Math.sin(yaw) * 0.9 + (Math.random() - 0.5) * 0.6, y + 0.15, z - Math.cos(yaw) * 0.9, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0xeefcff, 0.18, 0.45, 6);
        // le chien allongé sur la planche, pattes qui battent
        if (P.mesh) {
          P.mesh.position.set(x, y + 0.12, z); P.mesh.rotation.order = 'YXZ'; P.mesh.rotation.set(0.08, yaw + spin, -bd.bank * 0.8);
          const pu = P.mesh.userData, kick = Math.sin(t * 14) * 0.5;
          if (pu.legs) pu.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.3 + (sp > 1 ? kick * (i % 2 ? 1 : -1) * 0.4 : 0) : 1.2 + (sp > 1 ? kick * (i % 2 ? -1 : 1) : 0); });
          if (pu.ainu) { pu.ainu.position.y = -0.18; pu.ainu.rotation.x = 0; }
          if (pu.matcha && !pu.ainu) { pu.matcha.position.y = pu.matchaY0 - 0.12; pu.matcha.rotation.x = 0; }
          if (P.shadow) P.shadow.visible = false;
          st.tilted = st.tilted || new Set(); st.tilted.add(P);
        }
      }
      if (st.tilted) for (const P of st.tilted) if (!P.board) { if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; } st.tilted.delete(P); }
      // creuser : le museau dans le sable, les pattes avant qui grattent
      for (const P of players()) {
        if (!(P.digT > 0) || !P.mesh) continue;
        const pu = P.mesh.userData, k = Math.min(1, (DIG_TIME - P.digT) * 6), sc2 = Math.sin(t * 26);
        P.mesh.rotation.y = P.yaw;
        if (pu.ainu) { pu.ainu.rotation.x = 0.35 * k; pu.ainu.position.y = -0.05 * k; pu.head.rotation.x = 0.6 * k; }
        else if (pu.matcha) { pu.matcha.rotation.x = 0.4 * k; if (pu.mhead) pu.mhead.rotation.x = 0.5 * k; }
        if (pu.legs) { pu.legs[0].rotation.x = -0.6 + sc2 * 0.9; pu.legs[1].rotation.x = -0.6 - sc2 * 0.9; }
        if (pu.tail) pu.tail.rotation.y = Math.sin(t * 18) * 0.7;
        if (Math.random() < dt * 20) game.spawnParticle(P.pos.x - Math.sin(P.yaw) * 0.3, P.pos.y + 0.3, P.pos.z - Math.cos(P.yaw) * 0.3, -Math.sin(P.yaw) * 3 + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, -Math.cos(P.yaw) * 3 + (Math.random() - 0.5) * 2, 0xe8cc90, 0.2, 0.6, 12);
      }
      // coquillages qui jaillissent d'un tas qu'on vient de creuser
      for (const id in st.popAt) {
        const k = (t - st.popAt[id]) / 0.7;
        for (const s of S.bones) {
          if (s.mound !== id) continue;
          if (k >= 1) { s.y = s.y0; continue; }
          const m = S.MOUNDS.find(q => q.id === id);
          s.x = m.x + (s.x0 - m.x) * k; s.z = m.z + (s.z0 - m.z) * k; s.y = m.y + (s.y0 - m.y) * k + Math.sin(k * Math.PI) * 2.2;
        }
        if (k >= 1) { delete st.popAt[id]; for (const s of S.bones) if (s.mound === id) { s.x = s.x0; s.z = s.z0; } }
      }
      // (invité : un tas creusé chez l'hôte → les coquillages jaillissent ici aussi)
      for (const d of S.MOUNDS) if (dug(d.id) && !st.digSeen.has(d.id)) { st.digSeen.add(d.id); if (game.t > 2 && !st.popAt[d.id] && isGuest()) st.popAt[d.id] = t; }
      // étincelles des tas
      {
        const pa = sparkGeo.attributes.position.array, sa = sparkGeo.attributes.size.array;
        moundDefs.forEach((d, i) => {
          const done = d.id === 'chest' ? b.chest : dug(d.id), hide = d.id === 'chest' && !b.map;
          for (let k = 0; k < 3; k++) {
            const j = i * 3 + k, ph = t * (1.3 + k * 0.4) + i * 2.1 + k * 2.4, a = ph * 0.7 + k * 2.1;
            pa[j * 3] = d.x + Math.cos(a) * 0.55; pa[j * 3 + 1] = d.y + 0.3 + (ph % 1.6) * 0.5; pa[j * 3 + 2] = d.z + Math.sin(a) * 0.55;
            sa[j] = done || hide ? 0 : Math.max(0, Math.sin(ph * 2.3)) * (d.id === 'chest' ? 0.75 : 0.5);
          }
        });
        sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.size.needsUpdate = true;
        sparkMat.uniforms.uScale.value = game.partPts.material.uniforms.uScale.value;
      }
      // coffre : il sort du sable et s'ouvre
      if (b.chest) {
        chest.visible = true;
        const k = st.chestT >= 0 ? clamp(st.chestT / 1.0, 0, 1) : 1;
        chest.position.y = S.CHEST.y - 1.2 + k * 1.25;
        chest.userData.lid.rotation.x = -clamp((st.chestT >= 0 ? st.chestT - 0.9 : 1) / 0.5, 0, 1) * 1.9;
        chest.userData.glow.material.opacity = (st.chestT < 0 || st.chestT > 1) ? 0.45 + Math.sin(t * 3) * 0.15 : 0;
      } else chest.visible = false;
      xMark.visible = !!b.map && !b.chest;
      // rival (Mistral) sur sa planche pendant la course
      rival.m.visible = rival.on;
      if (rival.on) {
        rival.m.position.set(rival.x, rival.y, rival.z); rival.m.rotation.set(-0.05, rival.yaw, 0, 'YXZ');
        rival.m.userData.spray.material.opacity = clamp((rival.speed - 3) / 10, 0, 0.8);
        mistral.position.set(rival.x, rival.y + 0.12, rival.z); mistral.rotation.set(0.05, rival.yaw, 0);
      } else {
        mistral.position.set(MG.x, MG.y, MG.z); mistral.rotation.x = 0;
        const d = Math.hypot(me.pos.x - MG.x, me.pos.z - MG.z);
        mistral.rotation.y = lerpAngle(mistral.rotation.y, d < 9 ? Math.atan2(me.pos.x - MG.x, me.pos.z - MG.z) : MG.yaw, Math.min(1, dt * 3));
      }
      for (const [npc, def] of [[barnabe, BG], [mistral, MG]]) {
        const u = npc.userData;
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + def.x) * 0.5;
        if (u.tail && u.realistic) u.tail.rotation.y = Math.sin(t * 7 + def.x) * 0.4;
        const hd = u.mhead || u.head; if (hd) hd.rotation.x = Math.sin(t * 2 + def.z) * 0.06;
      }
      {
        const d = Math.hypot(me.pos.x - BG.x, me.pos.z - BG.z);
        barnabe.rotation.y = lerpAngle(barnabe.rotation.y, d < 8 ? Math.atan2(me.pos.x - BG.x, me.pos.z - BG.z) : BG.yaw, Math.min(1, dt * 3));
      }
      const intro = save().intro;
      marks.barnabe.visible = intro && !b.talk.barnabe;
      marks.barnabe.position.set(BG.x, BG.y + 2.9 + Math.sin(t * 4) * 0.1, BG.z);
      marks.mistral.visible = intro && !rival.on && (!b.talk.mistral || !b.raceWon);
      marks.mistral.position.set(mistral.position.x, mistral.position.y + 2.9 + Math.sin(t * 4) * 0.1, mistral.position.z);
      // crabes
      for (const c of crabs) {
        const u = c.m.userData, carry = !b.drop[c.def.id];
        c.m.position.set(c.x, c.y, c.z); c.m.rotation.y = c.yaw;
        u.loot.visible = carry;
        u.loot.rotation.y = t * 2;
        u.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.phase + i * 1.3) * 0.5; });
        const wave = c.wave > 0 || !carry;
        u.claws.forEach((cl, i) => { cl.rotation.x = wave ? -0.8 + Math.sin(t * 12 + i * Math.PI) * 0.5 : carry ? -0.9 : -0.1 + Math.sin(t * 3 + i) * 0.1; });
      }
      // bébé phoque
      {
        const s = st.seal;
        if (s.state === 'home' || b.seal === 'home') {
          baby.position.set(S.SEAL_ROCK.x + 1.6, S.SEAL_ROCK.top - 0.05, S.SEAL_ROCK.z + 1.0); baby.rotation.y = 2.4 + Math.sin(t) * 0.2;
          baby.userData.head.rotation.x = Math.sin(t * 2) * 0.2;
          marks.seal.visible = false; babyShadow.visible = false;
        } else {
          const hop = s.state === 'follow' ? Math.abs(Math.sin(s.phase * 1.4)) * 0.25 : 0;
          baby.position.set(s.x, s.y + hop, s.z); baby.rotation.y = s.yaw;
          baby.userData.head.rotation.x = s.state === 'stuck' ? -0.3 + Math.sin(t * 5) * 0.12 : Math.sin(t * 3) * 0.1;
          baby.userData.body.rotation.x = s.state === 'follow' ? Math.sin(s.phase * 1.4) * 0.12 : 0;
          marks.seal.visible = intro && s.state === 'stuck';
          marks.seal.position.set(s.x, s.y + 1.6 + Math.sin(t * 4) * 0.1, s.z);
          babyShadow.visible = s.state !== 'swim';
          game.placeShadow(babyShadow, baby.position, 0.6);
          if (s.state === 'stuck' && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5) && Math.hypot(me.pos.x - s.x, me.pos.z - s.z) < 22) game.bubble({ pos: baby.position, small: true }, 'Ouin !');
        }
        mama.userData.head.rotation.x = Math.sin(t * 1.5) * 0.15;
        mama.position.y = S.SEAL_ROCK.top - 0.05 + Math.abs(Math.sin(t * 1.2)) * 0.03;
      }
      // course : l'anneau de la prochaine bouée
      const R = st.race, ni = R && R.next ? R.next[me.id] : undefined;
      const bu = R ? (R.ph === 'go' && ni !== undefined ? RC.buoys[Math.min(ni, RC.buoys.length - 1)] : RC.start) : null;
      ring.visible = ringBeam.visible = !!bu;
      if (bu) { ring.position.set(bu.x, S.WATER_Y + 0.35 + Math.sin(t * 3) * 0.1, bu.z); ring.rotation.z = t; ringBeam.position.set(bu.x, S.WATER_Y + 13, bu.z); }
      // le phare
      {
        const lit = !!b.light, k = lit ? clamp(st.lightT >= 0 ? (t - st.lightT) / 1.5 : 1, 0, 1) : 0;
        const lm = decor.lh.lamp.material;
        lm.emissiveIntensity = lit ? 0.4 + 1.1 * k : 0;
        if (lm.color) lm.color.setHex(lit ? 0xfff6d0 : 0x8a8a7a);
        decor.lh.beam.material.opacity = 0.16 * k; decor.lh.beam.rotation.y = t * 0.8;
        decor.lh.halo.material.opacity = 0.75 * k * (0.85 + Math.sin(t * 4) * 0.15);
        if (!lit && Math.random() < dt * 3) game.spawnParticle(LH.x + (Math.random() - 0.5), LH.top + 1.5, LH.z + (Math.random() - 0.5), 0, 0.6, 0, 0xe8cc90, 0.18, 0.8, 1);
      }
      // drapeaux
      decor.flags.forEach((f, i) => {
        const up = i === b.cp ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.45;
        const arr = f.cloth.geometry.attributes.position.array;
        for (let k = 0; k < arr.length; k += 3) { const x = f.base[k]; arr[k + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
        f.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (up ? 0.22 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      for (const c of decor.fort.flags) {
        const arr = c.geometry.attributes.position.array, base = c.userData.base;
        for (let k = 0; k < arr.length; k += 3) { const x = base[k]; arr[k + 2] = Math.sin(x * 5 - t * 7) * 0.1 * x; }
        c.geometry.attributes.position.needsUpdate = true;
      }
      // la Capitaine sur sa tour : elle nargue… puis applaudit quand le fort est libéré
      {
        const cap = decor.fort.cap, cu = cap.userData, free = this.reveal().m_fort;
        const d = Math.hypot(me.pos.x - S.KEEP.x, me.pos.z - S.KEEP.z);
        cap.rotation.y = lerpAngle(cap.rotation.y, Math.atan2(me.pos.x - S.KEEP.x, me.pos.z - S.KEEP.z), Math.min(1, dt * 2));
        cap.position.y = S.KEEP.top + (free ? Math.abs(Math.sin(t * 5)) * 0.25 : 0);
        if (cu.head) cu.head.rotation.z = Math.sin(t * (free ? 8 : 2)) * (free ? 0.2 : 0.08);
        if (cu.tail) cu.tail.rotation.x = -0.3 + Math.sin(t * 4) * 0.3;
        if (!free && d < 14 && Math.floor(t / 4) !== Math.floor((t - dt) / 4)) { st.capPos.set(cap.position.x, cap.position.y + 1.7, cap.position.z); game.bubble({ pos: st.capPos, small: true }, 'Miaou-ha !'); }
      }
      // mouettes
      for (const g of decor.gulls) {
        const u = g.userData;
        if (u.fly) {
          const f = u.fly, a = f.a + t * f.w;
          g.position.set(f.cx + Math.cos(a) * f.R, f.y + Math.sin(t * 0.8 + f.a) * 1.2, f.cz + Math.sin(a) * f.R);
          g.rotation.set(0, -a + (f.w > 0 ? Math.PI : 0), -Math.sign(f.w) * 0.3);
          const fl = Math.sin(t * 7 + f.a) * 0.5;
          u.wings[0].rotation.z = fl; u.wings[1].rotation.z = -fl;
        } else {
          const p = u.perch, d = Math.hypot(me.pos.x - p.x, me.pos.z - p.z);
          if (d < 4.5 && p.t <= 0) { p.t = 6; game.sound('ball'); }
          if (p.t > 0) {
            p.t -= dt;
            const k = Math.sin(clamp((6 - p.t) / 6, 0, 1) * Math.PI);
            g.position.set(p.x + Math.sin(t * 1.3) * 5 * k, p.y + k * 7, p.z + Math.cos(t * 1.3) * 5 * k);
            g.rotation.set(0, t * 1.3 + Math.PI / 2, 0);
            const fl = Math.sin(t * 14) * 0.6; u.wings[0].rotation.z = fl; u.wings[1].rotation.z = -fl;
          } else {
            g.position.set(p.x, p.y, p.z); g.rotation.set(0, Math.sin(t * 0.3 + p.z) * 1.2, 0);
            u.wings[0].rotation.z = 0.15; u.wings[1].rotation.z = -0.15;
          }
        }
      }
      // bateaux qui se balancent
      decor.boat.position.y = S.WATER_Y + Math.sin(t * 1.3) * 0.08; decor.boat.rotation.z = Math.sin(t * 1.1) * 0.04;
      for (const s of decor.sails) { s.position.y = Math.sin(t * 0.9 + s.userData.ph) * 0.15; s.rotation.z = Math.sin(t * 0.8 + s.userData.ph) * 0.05; }
    },
  };
  return logic;
}
